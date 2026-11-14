"use server";

import { revalidatePath } from "next/cache";

import { MANAGERS, requireRoleForAction } from "@/lib/auth/requireRole";
import { logServerError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

import { dbError, fail, ok, type FormState } from "./form";
import { denied } from "./denied";

/** Owner or admin turns the public shop page on or off (set_shop_enabled checks the role too). */
export async function setShopEnabled(enabled: boolean): Promise<FormState> {
  const ctx = await requireRoleForAction(MANAGERS);
  if (!ctx) return denied();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_shop_enabled", { p_business_id: ctx.business.id, p_enabled: enabled === true });
  if (error) {
    logServerError("shop.enabled", error);
    return fail(dbError(error));
  }
  revalidatePath("/[lang]/dashboard/settings", "page");
  return ok(ctx.business.id);
}
