"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorize } from "@/lib/auth/dal";
import { isLocale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { logServerError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { productSchema, stockAdjustSchema } from "@/lib/validation/app";

import { dbError, dbFail, fail, formObject, invalid, isUuid, ok, type FormState } from "./form";

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const PRODUCT_IMAGES_BUCKET = "product-images";

/** Create or update a product with its variants (owners/admins). */
export async function saveProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = productSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { variants, ...fields } = parsed.data;
  const businessId = ctx.business.id;
  const existingId = typeof formData.get("id") === "string" && formData.get("id") ? String(formData.get("id")) : null;
  if (existingId && !isUuid(existingId)) return fail("invalid");

  const supabase = await createClient();
  let productId = existingId;
  if (existingId) {
    // Stock isn't edited here: after the opening stock it changes through sales and adjustStock (with a reason).
    const { stock_quantity: _opening, ...editable } = fields;
    void _opening;
    const { error } = await supabase.from("products").update(editable).eq("id", existingId).eq("business_id", businessId);
    if (error) {
      logServerError("products.update", error);
      return fail(dbError(error));
    }
  } else {
    const { data, error } = await supabase
      .from("products")
      .insert({ ...fields, business_id: businessId, currency: ctx.business.currency })
      .select("id")
      .single();
    if (error || !data) {
      logServerError("products.insert", error);
      return fail(dbError(error), dbError(error) === "duplicate" ? { sku: ["duplicate_sku"] } : undefined);
    }
    productId = data.id;
  }

  // Variants: keep the ones still listed, update them, add new ones, remove the rest.
  const keep = variants.filter((v) => v.id).map((v) => v.id!);
  let del = supabase.from("product_variants").delete().eq("product_id", productId!).eq("business_id", businessId);
  if (keep.length) del = del.not("id", "in", `(${keep.join(",")})`);
  const { error: delError } = await del;
  if (delError) logServerError("products.variants.delete", delError);
  for (const [index, v] of variants.entries()) {
    const row = { name: v.name, value: v.value, stock_quantity: v.stock_quantity, price_modifier: v.price_modifier, sort_order: index };
    const { error } = v.id
      ? await supabase.from("product_variants").update(row).eq("id", v.id).eq("business_id", businessId)
      : await supabase.from("product_variants").insert({ ...row, product_id: productId!, business_id: businessId });
    if (error) {
      logServerError("products.variants.save", error);
      return { ...fail(dbError(error)), id: productId! };
    }
  }

  const image = formData.get("image");
  if (image instanceof File && image.size > 0) {
    const imageResult = await uploadImage(businessId, productId!, image);
    if (imageResult) return { ...fail(imageResult), id: productId! };
  }

  revalidatePath("/[lang]/dashboard", "layout");
  const locale = formData.get("locale");
  if (!existingId && isLocale(locale)) redirect(localizePath(locale, `/dashboard/products/${productId}?saved=1`));
  return ok(productId!);
}

/**
 * Uploads to the public `product-images` bucket under <business_id>/<product_id>/
 * with the signed-in user's session: Storage policies allow owners/admins to
 * write only inside their own business folder.
 */
async function uploadImage(businessId: string, productId: string, file: File) {
  const ext = IMAGE_TYPES[file.type];
  if (!ext || file.size > MAX_IMAGE_BYTES) return "image_invalid" as const;
  const supabase = await createClient();
  const path = `${businessId}/${productId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    logServerError("products.image.upload", error);
    return "storage_unavailable" as const;
  }
  const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
  const { error: updateError } = await supabase.from("products").update({ image_url: data.publicUrl }).eq("id", productId).eq("business_id", businessId);
  if (updateError) {
    logServerError("products.image.save", updateError);
    return "unknown" as const;
  }
  return null;
}

export async function setProductActive(productId: string, active: boolean): Promise<FormState> {
  if (!isUuid(productId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { error } = await supabase.from("products").update({ active }).eq("id", productId).eq("business_id", ctx.business.id);
  if (error) return fail(dbError(error));
  revalidatePath("/[lang]/dashboard", "layout");
  return ok(productId);
}

/**
 * Owners/admins: change stock with a reason (purchase, return, damaged, lost,
 * or a stock count). adjust_stock() records it in the stock history and never
 * lets stock go below zero.
 */
export async function adjustStock(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = stockAdjustSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const a = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_stock", {
    p_business_id: ctx.business.id,
    p_product_id: a.product_id,
    p_reason: a.reason,
    p_quantity: a.reason === "adjustment" ? undefined : (a.quantity ?? undefined),
    p_new_stock: a.reason === "adjustment" ? (a.counted ?? undefined) : undefined,
    p_variant_id: a.variant_id ?? undefined,
    p_note: a.note ?? undefined,
  });
  if (error) {
    logServerError("products.adjustStock", error);
    return dbFail(error);
  }
  revalidatePath("/[lang]/dashboard", "layout");
  return ok(a.product_id);
}

/** Deletes a product that was never sold (the database refuses otherwise: archive it). Past orders keep their snapshot. */
export async function deleteProduct(productId: string, locale: string): Promise<FormState> {
  if (!isUuid(productId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { error } = await supabase.from("products").delete().eq("id", productId).eq("business_id", ctx.business.id);
  if (error) {
    logServerError("products.delete", error);
    return fail(dbError(error));
  }
  revalidatePath("/[lang]/dashboard", "layout");
  if (isLocale(locale)) redirect(localizePath(locale, "/dashboard/products?deleted=1"));
  return ok();
}
