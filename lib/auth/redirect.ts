/**
 * Only allow same-site relative paths as post-login destinations
 * (prevents open redirects like ?next=https://evil.example or //evil.example).
 */
export function safeRedirectPath(next: string | null | undefined, fallback = "/dashboard") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
