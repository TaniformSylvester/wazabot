/*
 * Receives crashes caught by the dashboard error boundary in the browser and
 * writes them to the server log, so they show up in the hosting logs. Only
 * the error name/message, digest and page path are logged (truncated).
 */
export const dynamic = "force-dynamic";

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : null);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  console.warn(
    "[client.error]",
    JSON.stringify({ name: clip(body?.name, 60), message: clip(body?.message, 300), digest: clip(body?.digest, 40), path: clip(body?.path, 200) }),
  );
  return new Response(null, { status: 204 });
}
