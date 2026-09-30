import {
  BookOpen,
  Bot,
  ChartColumn,
  CreditCard,
  LayoutDashboard,
  MessagesSquare,
  Package,
  Settings,
  ShoppingBag,
  Smartphone,
  Users,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";

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
};

export const dashboardNav: { key: keyof Nav["groups"]; items: DashboardNavItem[] }[] = [
  {
    key: "main",
    items: [
      { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
      { key: "conversations", href: "/dashboard/conversations", icon: MessagesSquare },
      { key: "customers", href: "/dashboard/customers", icon: Users },
    ],
  },
  {
    key: "business",
    items: [
      { key: "products", href: "/dashboard/products", icon: Package },
      { key: "orders", href: "/dashboard/orders", icon: ShoppingBag },
      { key: "knowledge", href: "/dashboard/knowledge", icon: BookOpen },
    ],
  },
  {
    key: "ai",
    items: [
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
