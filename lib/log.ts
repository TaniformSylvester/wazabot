import "server-only";

/**
 * Log server errors without leaking secrets: only a context label, the error
 * code/status and message are written — never request bodies, tokens or keys.
 */
export function logServerError(context: string, error: unknown) {
  const e = error as { code?: string; status?: number; message?: string } | null;
  console.error(`[${context}]`, JSON.stringify({ code: e?.code, status: e?.status, message: e?.message ?? String(error) }));
}
