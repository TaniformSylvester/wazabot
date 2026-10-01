import { after } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { logServerError } from "@/lib/log";
import { verifyWebhookSignature } from "@/lib/messaging/whatsapp/webhook";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleWebhookPayload, storeMedia } from "@/lib/whatsapp/inbound";

/*
 * WhatsApp Cloud API webhook (configure in the Meta app: Webhooks →
 * WhatsApp Business Account → callback URL <site>/api/whatsapp/webhook,
 * verify token = WHATSAPP_VERIFY_TOKEN, subscribe to "messages").
 *
 * GET  — Meta's one-time verification challenge.
 * POST — messages and delivery statuses. The raw body's X-Hub-Signature-256
 *        is checked with WHATSAPP_APP_SECRET before anything is parsed.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  const challenge = params.get("hub.challenge") ?? "";
  if (expected && params.get("hub.mode") === "subscribe" && sameSecret(params.get("hub.verify_token") ?? "", expected) && /^[\w-]{1,200}$/.test(challenge)) {
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const admin = createAdminClient();
  if (!appSecret || !admin) return new Response("Not configured", { status: 503 });

  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get("x-hub-signature-256"), appSecret)) {
    return new Response("Invalid signature", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  try {
    const result = await handleWebhookPayload(payload, admin);
    // One line per delivery: counts only, never message content or phone numbers.
    console.info(`[whatsapp.webhook] stored=${result.stored} duplicates=${result.duplicates} ignored=${result.ignored} statuses=${result.statuses}`);
    if (result.mediaJobs.length) {
      after(async () => {
        for (const job of result.mediaJobs) await storeMedia(job, admin);
      });
    }
    return Response.json({ ok: true, stored: result.stored, duplicates: result.duplicates, statuses: result.statuses });
  } catch (e) {
    logServerError("whatsapp.webhook", e);
    return new Response("Retry later", { status: 500 });
  }
}
