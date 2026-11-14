import {
  Backpack,
  Banknote,
  BookOpenCheck,
  ChefHat,
  ClipboardCheck,
  FileText,
  HandCoins,
  LayoutGrid,
  Package,
  PackageX,
  PenLine,
  Receipt,
  ShoppingCart,
  UserPlus,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type { Module } from "@/lib/modules";

/*
 * The three business types ("verticals") the dashboard is shaped for, in one
 * place: the three headline numbers, the work queue, four quick actions and
 * what the catalogue is called. Only keys, icons, formats and links live
 * here; the words are in the dictionaries (dashboard.verticals.<vertical>),
 * and the numbers come from lib/data/verticals.ts.
 *
 * A business's vertical follows its type and modules (no separate column):
 * a school without the sales module is a school, a business with the
 * restaurant module is a restaurant, every other business is a shop.
 */

export const VERTICALS = ["shop", "restaurant", "school"] as const;
export type Vertical = (typeof VERTICALS)[number];

/** How a headline number is written: money in the business's currency, a plain count, or a share (0–1). */
export type KpiFormat = "currency" | "count" | "percent";

export type KpiDef = { key: string; icon: LucideIcon; format: KpiFormat; href: string; /** Money: shown to owners and managers only (permissions.canViewRevenue). */ financial?: true };
export type QuickActionDef = { key: string; icon: LucideIcon; href: string; /** Shown to owners and managers only (staff can't do it: the server refuses it too). */ managerOnly?: true };
export type VerticalConfig = {
  /** Exactly three headline numbers, most important first. */
  kpis: [KpiDef, KpiDef, KpiDef];
  /** The work waiting for the team (titles in dashboard.verticals.<v>.queueTitle / queueEmpty). */
  queue: { href: string };
  /** Exactly four quick actions (staff see the ones not marked managerOnly); each has a short label for phones and a full one for wider screens. */
  quickActions: [QuickActionDef, QuickActionDef, QuickActionDef, QuickActionDef];
  /** Where the catalogue lives (its name: dashboard.verticals.<v>.catalogLabel — Inventory, Menu Items or Programs). */
  catalog: { href: string; icon: LucideIcon };
};

export const VERTICAL_CONFIG: Record<Vertical, VerticalConfig> = {
  shop: {
    kpis: [
      { key: "salesToday", icon: Banknote, format: "currency", href: "/dashboard/sales", financial: true },
      { key: "creditOwed", icon: HandCoins, format: "currency", href: "/dashboard/customers?balance=1", financial: true },
      { key: "lowStock", icon: PackageX, format: "count", href: "/dashboard/products" },
    ],
    queue: { href: "/dashboard/orders" },
    quickActions: [
      { key: "newSale", icon: ShoppingCart, href: "/dashboard/sales/new" },
      { key: "addProduct", icon: Package, href: "/dashboard/products/new", managerOnly: true },
      { key: "addCustomer", icon: UserPlus, href: "/dashboard/customers/new" },
      { key: "addExpense", icon: Wallet, href: "/dashboard/expenses#add-expense", managerOnly: true },
    ],
    catalog: { href: "/dashboard/products", icon: Package },
  },
  restaurant: {
    kpis: [
      { key: "openBills", icon: UtensilsCrossed, format: "count", href: "/dashboard/restaurant" },
      { key: "turnoverToday", icon: Banknote, format: "currency", href: "/dashboard/sales", financial: true },
      { key: "kitchenQueue", icon: ChefHat, format: "count", href: "/dashboard/restaurant/kitchen" },
    ],
    queue: { href: "/dashboard/restaurant" },
    quickActions: [
      { key: "openBill", icon: LayoutGrid, href: "/dashboard/restaurant" },
      { key: "takeaway", icon: Receipt, href: "/dashboard/restaurant/new" },
      { key: "kitchen", icon: ChefHat, href: "/dashboard/restaurant/kitchen" },
      { key: "addDish", icon: UtensilsCrossed, href: "/dashboard/products/new", managerOnly: true },
    ],
    catalog: { href: "/dashboard/products", icon: UtensilsCrossed },
  },
  school: {
    kpis: [
      { key: "students", icon: Backpack, format: "count", href: "/dashboard/school/students" },
      { key: "feesCollected", icon: Banknote, format: "percent", href: "/dashboard/school/fees", financial: true },
      { key: "classesPublished", icon: ClipboardCheck, format: "count", href: "/dashboard/school/results" },
    ],
    queue: { href: "/dashboard/school/results" },
    quickActions: [
      { key: "enterMarks", icon: PenLine, href: "/dashboard/school/marks" },
      { key: "addStudent", icon: UserPlus, href: "/dashboard/school/students/new", managerOnly: true },
      { key: "fees", icon: Wallet, href: "/dashboard/school/fees", managerOnly: true },
      { key: "reportCards", icon: FileText, href: "/dashboard/school/results" },
    ],
    catalog: { href: "/dashboard/school/classes", icon: BookOpenCheck },
  },
};

/** The vertical of a business, from its modules. */
export function verticalOf(modules: readonly Module[]): Vertical {
  if (modules.includes("school") && !modules.includes("commerce")) return "school";
  if (modules.includes("restaurant")) return "restaurant";
  return "shop";
}

