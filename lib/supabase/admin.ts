import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { getSupabaseEnv } from "./env";

/**
 * Service-role client: bypasses Row Level Security. Server-only (webhook,
 * background processing, signed media URLs after an explicit membership
 * check). Never import it from a Client Component and never return its
 * results to a user without checking they may see them.
 * Returns null until SUPABASE_SERVICE_ROLE_KEY is set.
 */
export function createAdminClient() {
  const env = getSupabaseEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env || !serviceKey) return null;
  return createClient<Database>(env.url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
