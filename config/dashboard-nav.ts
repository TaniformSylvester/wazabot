import {
  BookOpen,
  Megaphone,
  CalendarDays,
  Bot,
  ChartColumn,
  CreditCard,
  FileBarChart,
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
};

export const dashboardNav: { key: keyof Nav["groups"]; items: DashboardNavItem[] }[] = [
  {
    key: "main",
    items: [
      { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
      { key: "sales", href: "/dashboard/sales", icon: ShoppingCart },
      { key: "products", href: "/dashboard/products", icon: Package },
      { key: "customers", href: "/dashboard/customers", icon: Users },
      { key: "orders", href: "/dashboard/orders", icon: ShoppingBag },
    ],
  },
  {
    key: "business",
    items: [
      { key: "expenses", href: "/dashboard/expenses", icon: Wallet, minRole: "admin" },
      { key: "reports", href: "/dashboard/reports", icon: FileBarChart, minRole: "admin" },
      { key: "appointments", href: "/dashboard/appointments", icon: CalendarDays },
    ],
  },
  {
    key: "ai",
    items: [
      { key: "conversations", href: "/dashboard/conversations", icon: MessagesSquare },
      { key: "broadcasts", href: "/dashboard/broadcasts", icon: Megaphone },
      { key: "knowledge", href: "/dashboard/knowledge", icon: BookOpen },
      { key: "assistant", href: "/dashboard/ai", icon: Bot },
      { key: "automations", href: "/dashboard/automations", icon: Workflow },
    ],
  },
  {
    key: "insights",
    items: [{ key: "analytics", href: "/dashboard/analytics", icon: ChartColumn }],
  },
  {
    key: "settings",
    items: [
      { key: "whatsapp", href: "/dashboard/whatsapp", icon: Smartphone },
      { key: "team", href: "/dashboard/team", icon: UsersRound },
      { key: "billing", href: "/dashboard/billing", icon: CreditCard },
      { key: "settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];
