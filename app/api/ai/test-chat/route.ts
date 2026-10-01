import { sendTestMessage } from "@/lib/ai/test-chat";

/*
 * AI Assistant → Test chat. A plain JSON endpoint (signed-in team members
 * only — checked inside sendTestMessage with the user's session cookie).
 * Up to 60 s: Claude may look things up before answering.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const started = Date.now();
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const result = await sendTestMessage(body);
  // Outcome and timing only — never the message text.
  console.info(`[ai.testChat] ${result.ok ? "ok" : result.error} in ${Date.now() - started}ms`);
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
