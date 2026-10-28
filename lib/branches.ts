import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import type { CurrentBusiness } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

/*
 * Branches (locations) of the current business. Every business has a main
 * branch; owners and admins pick the branch they work in (cookie, only a
 * preference), members tied to a branch always work there. The database
 * enforces the same rules (orders_set_branch, can_use_branch).
 */

export const WORKING_BRANCH_COOKIE = "wb_branch";

export type Branch = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  hours: string | null;
  isMain: boolean;
  active: boolean;
};

/** Every branch of the business, main first, then by opening date. */
export const listBranches = cache(async (businessId: string): Promise<Branch[]> => {
  const db = await createClient();
  const { data } = await db
    .from("branches")
    .select("id, name, address, city, phone, hours, is_main, active, created_at")
    .eq("business_id", businessId)
    .order("is_main", { ascending: false })
    .order("created_at", { ascending: true });
  return (data ?? []).map((b) => ({ id: b.id, name: b.name, address: b.address, city: b.city, phone: b.phone, hours: b.hours, isMain: b.is_main, active: b.active }));
});

export type BranchContext = {
  /** Open branches the user can work in (the member's own only, when tied to one). */
  branches: Branch[];
  /** The branch the user is working in now. */
  current: Branch;
  /** More than one open branch: show branch names, pickers and per-branch stock. */
  multi: boolean;
  /** Tied to one branch: no switching. */
  locked: boolean;
};

/** The branch the user works in, and the ones they could switch to. */
export const getBranchContext = cache(async (business: CurrentBusiness): Promise<BranchContext> => {
  const all = await listBranches(business.id);
  const open = all.filter((b) => b.active);
  const main = all.find((b) => b.isMain) ?? all[0];
  const own = business.memberBranchId ? all.find((b) => b.id === business.memberBranchId) : undefined;
  if (own) return { branches: [own], current: own, multi: open.length > 1, locked: true };
  const preferred = (await cookies()).get(WORKING_BRANCH_COOKIE)?.value;
  const current = open.find((b) => b.id === preferred) ?? main;
  return { branches: open, current, multi: open.length > 1, locked: false };
});

/**
 * Stock of each tracked product/combination in one branch, keyed
 * `product` or `product:variant`. Used to show the working branch's stock
 * instead of the total when the business has several branches.
 */
export async function branchStock(businessId: string, branchId: string): Promise<Map<string, number>> {
  const db = await createClient();
  const { data } = await db.from("branch_stock").select("product_id, variant_id, quantity").eq("business_id", businessId).eq("branch_id", branchId);
  return new Map((data ?? []).map((r) => [r.variant_id ? `${r.product_id}:${r.variant_id}` : r.product_id, r.quantity]));
}

/** Replaces tracked stock quantities with one branch's (products and their variants). */
export function withBranchStock<V extends { id: string; stock_quantity: number | null }, P extends { id: string; stock_quantity: number | null; product_variants?: V[] | null }>(
  products: P[],
  stock: Map<string, number>,
): P[] {
  return products.map((p) => ({
    ...p,
    stock_quantity: p.stock_quantity === null ? null : (stock.get(p.id) ?? 0),
    ...(p.product_variants
      ? { product_variants: p.product_variants.map((v) => ({ ...v, stock_quantity: v.stock_quantity === null ? null : (stock.get(`${p.id}:${v.id}`) ?? 0) })) }
      : {}),
  }));
}
