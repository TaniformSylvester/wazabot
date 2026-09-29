import {
  BookOpen,
  Bot,
  ChartColumn,
  CreditCard,
  Languages,
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
      { key: "conversations", href: "/dashboard/conversations", icon: MessagesSquare, soon: true },
      { key: "customers", href: "/dashboard/customers", icon: Users, soon: true },
    ],
  },
  {
    key: "business",
    items: [
      { key: "products", href: "/dashboard/products", icon: Package, soon: true },
      { key: "orders", href: "/dashboard/orders", icon: ShoppingBag, soon: true },
      { key: "knowledge", href: "/dashboard/knowledge", icon: BookOpen, soon: true },
    ],
  },
  {
    key: "ai",
    items: [
      { key: "languages", href: "/dashboard/settings/languages", icon: Languages },
      { key: "assistant", href: "/dashboard/ai", icon: Bot, soon: true },
      { key: "automations", href: "/dashboard/automations", icon: Workflow, soon: true },
    ],
  },
  {
    key: "insights",
    items: [{ key: "analytics", href: "/dashboard/analytics", icon: ChartColumn, soon: true }],
  },
  {
    key: "settings",
    items: [
      { key: "whatsapp", href: "/dashboard/whatsapp", icon: Smartphone, soon: true },
      { key: "team", href: "/dashboard/team", icon: UsersRound, soon: true },
      { key: "billing", href: "/dashboard/billing", icon: CreditCard, soon: true },
      { key: "settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];
