import {
  Backpack,
  Banknote,
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  School,
  Megaphone,
  CalendarDays,
  Bot,
  ChartColumn,
  CreditCard,
  FileBarChart,
  FileText,
  LayoutDashboard,
  MessagesSquare,
  Package,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Users,
  UsersRound,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import type { BusinessRole } from "@/types/database";
import type { Module } from "@/lib/modules";
import type { Messages } from "@/messages/en";

type Nav = Messages["dashboard"]["nav"];

export type DashboardNavItem = {
  /** Label key in dashboard.nav.items. */
  key: keyof Nav["items"];
  /** Locale-free path; localized when rendered. */
  href: string;
  icon: LucideIcon;
  /** Not built yet — rendered as a disabled item with a "Soon" tag instead of a dead link. */
  soon?: boolean;
  /** Hidden from roles below this one (the page itself checks the role too). */
  minRole?: BusinessRole;
  /** Shown only when the business uses this module. */
  module?: Module;
  /** Shown to teachers (they see school pages only). */
  teacher?: boolean;
};

export const dashboardNav: { key: keyof Nav["groups"]; items: DashboardNavItem[] }[] = [
  {
    key: "main",
    items: [
      { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
      { key: "sales", href: "/dashboard/sales", icon: ShoppingCart, module: "commerce" },
      { key: "products", href: "/dashboard/products", icon: Package, module: "commerce" },
      { key: "customers", href: "/dashboard/customers", icon: Users },
      { key: "orders", href: "/dashboard/orders", icon: ShoppingBag, module: "commerce" },
      { key: "documents", href: "/dashboard/documents", icon: FileText, module: "docs" },
    ],
  },
  {
    key: "school",
    items: [
      { key: "school", href: "/dashboard/school", icon: GraduationCap, module: "school", teacher: true },
      { key: "students", href: "/dashboard/school/students", icon: Backpack, module: "school" },
      { key: "classes", href: "/dashboard/school/classes", icon: School, module: "school", teacher: true },
      { key: "results", href: "/dashboard/school/results", icon: ClipboardCheck, module: "school", teacher: true },
      { key: "fees", href: "/dashboard/school/fees", icon: Banknote, module: "school" },
      { key: "schoolReports", href: "/dashboard/school/reports", icon: FileBarChart, module: "school", minRole: "admin" },
    ],
  },
  {
    key: "business",
    items: [
      { key: "expenses", href: "/dashboard/expenses", icon: Wallet, minRole: "admin", module: "commerce" },
      { key: "reports", href: "/dashboard/reports", icon: FileBarChart, minRole: "admin", module: "commerce" },
      { key: "appointments", href: "/dashboard/appointments", icon: CalendarDays, module: "commerce" },
    ],
  },
  {
    key: "ai",
    items: [
      { key: "conversations", href: "/dashboard/conversations", icon: MessagesSquare, module: "ai" },
      { key: "broadcasts", href: "/dashboard/broadcasts", icon: Megaphone, module: "ai" },
      { key: "knowledge", href: "/dashboard/knowledge", icon: BookOpen, module: "ai" },
      { key: "assistant", href: "/dashboard/ai", icon: Bot, module: "ai" },
      { key: "automations", href: "/dashboard/automations", icon: Workflow, module: "ai" },
    ],
  },
  {
    key: "insights",
    items: [{ key: "analytics", href: "/dashboard/analytics", icon: ChartColumn, module: "commerce" }],
  },
  {
    key: "settings",
    items: [
      { key: "whatsapp", href: "/dashboard/whatsapp", icon: Smartphone },
      { key: "team", href: "/dashboard/team", icon: UsersRound, teacher: true },
      { key: "billing", href: "/dashboard/billing", icon: CreditCard },
      { key: "settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];
