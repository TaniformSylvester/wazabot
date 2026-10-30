import type { OpeningHours } from "@/lib/business/hours";
import type { Locale } from "@/lib/i18n/config";

/** What the public shop page shows (lib/shop/data.ts reads it, lib/shop/render.ts writes the HTML). */

export const SHOP_PAGE_SIZE = 48;

export type ShopProduct = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  /** The lowest price (combinations may cost more). */
  price: number;
  /** Some combinations cost more than `price`. */
  priceFrom: boolean;
  /** Sold in options (colour, size): chosen when ordering. */
  hasOptions: boolean;
  inStock: boolean;
  /** Version of the photo for its thumbnail URL; null without a photo. */
  photo: string | null;
};

export type ShopBranch = { name: string; address: string | null; city: string | null; phone: string | null; hours: string | null };

export type Shop = {
  slug: string;
  name: string;
  description: string | null;
  city: string | null;
  address: string | null;
  currency: string;
  defaultLocale: Locale;
  openingHours: OpeningHours;
  timezone: string;
  openNow: boolean | null;
  /** Logo version for its thumbnail URL; null without a logo. */
  logo: string | null;
  /** Digits only, for wa.me links; null when the business has no number. */
  whatsapp: string | null;
  branches: ShopBranch[];
  categories: string[];
  products: ShopProduct[];
  /** Products matching the search (all pages). */
  total: number;
  page: number;
};
