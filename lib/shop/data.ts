import "server-only";

import { catalogPhotoUrl } from "@/lib/ai/tools/registry";
import { isOpenAt, parseOpeningHours } from "@/lib/business/hours";
import { parseOptions } from "@/lib/products/options";
import { createAdminClient } from "@/lib/supabase/admin";

import { SHOP_PAGE_SIZE, type Shop } from "./types";

/*
 * The public shop page (/s/<slug>): read on the server with the service role,
 * only for a business that switched its shop on, and only public fields —
 * never stock quantities, costs, customers or the team.
 */

/** The shop of a business that switched it on, or null. */
export async function loadShop(slug: string, opts: { q?: string; category?: string; page?: number } = {}): Promise<Shop | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 120) return null;
  const db = createAdminClient();
  if (!db) return null;
  const { data: b } = await db
    .from("businesses")
    .select("id, slug, name, description, city, address, phone, currency, default_language, opening_hours, timezone, logo_url, updated_at, shop_enabled")
    .eq("slug", slug)
    .maybeSingle();
  if (!b || !b.shop_enabled) return null;

  const page = Math.max(1, Math.min(1000, Math.floor(opts.page ?? 1)));
  const q = (opts.q ?? "").replace(/[%_,()*\\]/g, " ").trim().slice(0, 60);
  let list = db
    .from("products")
    .select("id, name, description, category, price, stock_quantity, image_url, options, updated_at, product_variants(price_modifier, stock_quantity)", { count: "exact" })
    .eq("business_id", b.id)
    .eq("active", true);
  if (q) list = list.or(`name.ilike.%${q}%,category.ilike.%${q}%,description.ilike.%${q}%`);
  if (opts.category) list = list.eq("category", opts.category.slice(0, 80));
  const [{ data: rows, count }, { data: cats }, { data: wa }, { data: branches }] = await Promise.all([
    list
      .order("category", { ascending: true, nullsFirst: false })
      .order("name")
      .range((page - 1) * SHOP_PAGE_SIZE, page * SHOP_PAGE_SIZE - 1),
    db.from("products").select("category").eq("business_id", b.id).eq("active", true).not("category", "is", null).limit(2000),
    db.from("whatsapp_connections").select("status, display_phone_number").eq("business_id", b.id).maybeSingle(),
    db.from("branches").select("name, address, city, phone, hours").eq("business_id", b.id).eq("active", true).order("is_main", { ascending: false }).order("created_at"),
  ]);

  const hours = parseOpeningHours(b.opening_hours);
  const number = digits(wa?.status === "connected" ? wa.display_phone_number : null) ?? digits(b.phone);
  const version = (iso: string | null) => (iso ? String(Math.floor(new Date(iso).getTime() / 1000)) : "0");
  return {
    slug: b.slug,
    name: b.name,
    description: b.description,
    city: b.city,
    address: b.address,
    currency: b.currency,
    defaultLocale: b.default_language === "fr" ? "fr" : "en",
    openingHours: hours,
    timezone: b.timezone,
    openNow: isOpenAt(hours, b.timezone),
    logo: catalogPhotoUrl(b.logo_url) ? version(b.updated_at) : null,
    whatsapp: number,
    branches: (branches ?? []).length > 1 ? (branches ?? []) : [],
    categories: [...new Set((cats ?? []).map((c) => c.category!.trim()).filter(Boolean))].sort((x, y) => x.localeCompare(y)).slice(0, 30),
    products: (rows ?? []).map((p) => {
      const variants = p.product_variants ?? [];
      const modifiers = variants.map((v) => Number(v.price_modifier));
      const base = Number(p.price);
      const low = Math.max(0, base + Math.min(0, ...modifiers));
      const tracked = variants.filter((v) => v.stock_quantity !== null);
      const inStock = tracked.length ? tracked.some((v) => (v.stock_quantity ?? 0) > 0) : p.stock_quantity === null || p.stock_quantity > 0;
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        category: p.category,
        price: low,
        priceFrom: modifiers.some((m) => base + m > low),
        hasOptions: parseOptions(p.options).length > 0 || variants.length > 0,
        inStock,
        photo: catalogPhotoUrl(p.image_url) ? version(p.updated_at) : null,
      };
    }),
    total: count ?? 0,
    page,
  };
}

/** A phone number as wa.me wants it (country code, digits only), or null. */
export function digits(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length >= 8 && d.length <= 15 ? d : null;
}

/** The original photo of an active product (or the logo) of an open shop, for its thumbnail. */
export async function shopPhotoSource(slug: string, id: string): Promise<string | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  const db = createAdminClient();
  if (!db) return null;
  const { data: b } = await db.from("businesses").select("id, logo_url, shop_enabled").eq("slug", slug).maybeSingle();
  if (!b?.shop_enabled) return null;
  let url: string | null | undefined;
  if (id === "logo") url = b.logo_url;
  else if (/^[0-9a-f-]{36}$/i.test(id)) {
    const { data: p } = await db.from("products").select("image_url").eq("business_id", b.id).eq("id", id).eq("active", true).maybeSingle();
    url = p?.image_url;
  }
  // Only WazaBolt's own storage, and only this business's folder.
  const safe = catalogPhotoUrl(url);
  return safe && safe.includes(`/product-images/${b.id}/`) ? safe : null;
}
