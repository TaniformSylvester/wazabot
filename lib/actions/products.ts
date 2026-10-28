"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorize } from "@/lib/auth/dal";
import { isLocale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { logServerError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { combinationKey, combinationNameValue, parseCombination, type ProductOption } from "@/lib/products/options";
import { productSchema, stockAdjustSchema, stockTransferSchema } from "@/lib/validation/app";

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
  const { variants, options: optionInput, ...fields } = parsed.data;
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

  // Options: a colour photo is either one already in this business's storage folder or a new upload.
  const ownFolder = storageFolderUrl(businessId);
  const options: ProductOption[] = [];
  let photoError: "image_invalid" | "storage_unavailable" | null = null;
  for (const o of optionInput) {
    const values = [];
    for (const v of o.values) {
      let image_url = o.colour && v.image_url && ownFolder && v.image_url.startsWith(ownFolder) ? v.image_url : null;
      const file = o.colour ? formData.get(`colour_image__${v.value}`) : null;
      if (file instanceof File && file.size > 0) {
        // A photo that can't be uploaded doesn't stop the rest from being saved; it's reported at the end.
        const uploaded = await uploadFile(businessId, productId!, file);
        if (uploaded.ok) image_url = uploaded.url;
        else photoError ??= uploaded.error;
      }
      values.push({ value: v.value, ...(o.colour ? { hex: v.hex, image_url } : {}) });
    }
    options.push({ name: o.name, ...(o.colour ? { colour: true } : {}), values });
  }
  const { error: optionsError } = await supabase.from("products").update({ options }).eq("id", productId!).eq("business_id", businessId);
  if (optionsError) {
    logServerError("products.options", optionsError);
    return { ...fail(dbError(optionsError)), id: productId! };
  }

  // Variants: keep the ones still listed, update them, add new ones, remove the rest.
  // With options, rows are matched by combination (one row per combination).
  const { data: current } = await supabase.from("product_variants").select("id, options").eq("product_id", productId!).eq("business_id", businessId);
  const byCombination = new Map(
    (current ?? []).flatMap((v) => {
      const c = parseCombination(v.options);
      return c && options.length ? [[combinationKey(c, options), v.id] as const] : [];
    }),
  );
  const ownIds = new Set((current ?? []).map((v) => v.id));
  const rows = variants.map((v, index) => {
    if (options.length) {
      const c = Object.fromEntries(options.map((o) => [o.name, v.options![o.name]]));
      return { id: byCombination.get(combinationKey(c, options)), row: { ...combinationNameValue(c, options), options: c, stock_quantity: v.stock_quantity, price_modifier: v.price_modifier, sort_order: index } };
    }
    return { id: v.id && ownIds.has(v.id) ? v.id : undefined, row: { name: v.name, value: v.value, options: null, stock_quantity: v.stock_quantity, price_modifier: v.price_modifier, sort_order: index } };
  });
  const keep = rows.flatMap((r) => (r.id ? [r.id] : []));
  let del = supabase.from("product_variants").delete().eq("product_id", productId!).eq("business_id", businessId);
  if (keep.length) del = del.not("id", "in", `(${keep.join(",")})`);
  const { error: delError } = await del;
  if (delError) logServerError("products.variants.delete", delError);
  for (const { id, row } of rows) {
    const { error } = id
      ? await supabase.from("product_variants").update(row).eq("id", id).eq("business_id", businessId)
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
  if (photoError) {
    revalidatePath("/[lang]/dashboard", "layout");
    return { ...fail(photoError), id: productId! };
  }

  revalidatePath("/[lang]/dashboard", "layout");
  const locale = formData.get("locale");
  if (!existingId && isLocale(locale)) redirect(localizePath(locale, `/dashboard/products/${productId}?saved=1`));
  return ok(productId!);
}

/** Public URL prefix of this business's folder in the product-images bucket. */
function storageFolderUrl(businessId: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base.replace(/\/$/, "")}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${businessId}/` : null;
}

/**
 * Uploads to the public `product-images` bucket under <business_id>/<product_id>/
 * with the signed-in user's session: Storage policies allow owners/admins to
 * write only inside their own business folder.
 */
async function uploadFile(businessId: string, productId: string, file: File) {
  const ext = IMAGE_TYPES[file.type];
  if (!ext || file.size > MAX_IMAGE_BYTES) return { ok: false as const, error: "image_invalid" as const };
  const supabase = await createClient();
  const path = `${businessId}/${productId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    logServerError("products.image.upload", error);
    return { ok: false as const, error: "storage_unavailable" as const };
  }
  return { ok: true as const, url: supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl };
}

/** The product's main photo. */
async function uploadImage(businessId: string, productId: string, file: File) {
  const uploaded = await uploadFile(businessId, productId, file);
  if (!uploaded.ok) return uploaded.error;
  const supabase = await createClient();
  const { error: updateError } = await supabase.from("products").update({ image_url: uploaded.url }).eq("id", productId).eq("business_id", businessId);
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
    p_branch_id: a.branch_id ?? undefined,
  });
  if (error) {
    logServerError("products.adjustStock", error);
    return dbFail(error);
  }
  revalidatePath("/[lang]/dashboard", "layout");
  return ok(a.product_id);
}

/** Owners/admins: move stock from one branch to another (the total doesn't change). */
export async function transferStock(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = stockTransferSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const a = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_stock", {
    p_business_id: ctx.business.id,
    p_product_id: a.product_id,
    p_from: a.from_branch,
    p_to: a.to_branch,
    p_quantity: a.quantity ?? 0,
    p_variant_id: a.variant_id ?? undefined,
    p_note: a.note ?? undefined,
  });
  if (error) {
    logServerError("products.transferStock", error);
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
