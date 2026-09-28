/**
 * Supabase connection settings. Returns null when the project hasn't been
 * configured yet, so the marketing site keeps working and auth pages can
 * show a clear setup message instead of crashing.
 */
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured() {
  return getSupabaseEnv() !== null;
}

/**
 * Auth cookies are httpOnly: only server code talks to Supabase, so browser
 * JavaScript never needs (or gets) the session tokens. If a browser-side
 * Supabase client is added later (e.g. Realtime), revisit this.
 */
export const authCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
