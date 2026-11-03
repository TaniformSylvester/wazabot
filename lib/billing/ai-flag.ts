import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

/**
 * Is the WhatsApp AI assistant launched? For public pages (no session): read
 * with the anon key and cached for 5 minutes, so the pricing page stays fast.
 * Until it's launched the assistant is "coming soon" and can't be bought; the
 * database refuses it too (WB460), so a stale cache never sells it early.
 */
export async function aiLaunchedForPublicPages(): Promise<boolean> {
  const env = getSupabaseEnv();
  if (!env) return false;
  try {
    const db = createClient<Database>(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, next: { revalidate: 300 } }) },
    });
    const { data } = await db.rpc("ai_assistant_launched");
    return data === true;
  } catch {
    return false;
  }
}
