import { createHash } from "node:crypto";

import { z } from "zod";

import { logServerError } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { waitlistSchema } from "@/lib/validation/waitlist";
import { WAITLIST_MODE } from "@/lib/waitlist/mode";

/*
 * The beta waitlist (lib/waitlist/mode.ts): public, while the waitlist is on.
 * Validates, then join_waitlist() adds the lead (service role): a WhatsApp
 * number or email already on the list gets the same answer and nothing is
 * added; more than 5 new leads an hour from one network address is refused
 * (429). Only a hash of the address and the day is stored, for a day.
 */
const NO_STORE = { "cache-control": "no-store" };
const MAX_BODY = 4_096;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

function sourceHash(request: Request): string | null {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim();
  if (!ip) return null;
  return createHash("sha256").update(`waitlist:${new Date().toISOString().slice(0, 10)}:${ip}`).digest("hex");
}

export async function POST(request: Request) {
  if (!WAITLIST_MODE) return json({ ok: false, error: "closed" }, 404);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return json({ ok: false, error: "invalid" }, 413);
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return json({ ok: false, error: "invalid" }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ ok: false, error: "invalid" }, 400);
  }
  const parsed = waitlistSchema.safeParse(body);
  if (!parsed.success) return json({ ok: false, error: "invalid", fieldErrors: z.flattenError(parsed.error).fieldErrors }, 400);
  const lead = parsed.data;
  // A filled-in hidden field: a bot. Answer as if it worked, keep nothing.
  if (lead.website) return json({ ok: true, number: lead.whatsappNumber });

  const admin = createAdminClient();
  if (!admin) return json({ ok: false, error: "failed" }, 503);
  const { error } = await admin.rpc("join_waitlist", {
    p_business_name: lead.businessName,
    p_whatsapp_number: lead.whatsappNumber,
    p_email: lead.email,
    p_vertical: lead.vertical,
    p_country_code: lead.country,
    p_locale: lead.locale ?? "en",
    p_source_hash: sourceHash(request) ?? undefined,
  });
  if (error) {
    if (error.code === "WB496") return json({ ok: false, error: "rate_limited" }, 429);
    logServerError("waitlist.join", error);
    return json({ ok: false, error: "failed" }, 500);
  }
  // Already on the list or just added: the same answer, so the list can't be probed.
  return json({ ok: true, number: lead.whatsappNumber });
}
