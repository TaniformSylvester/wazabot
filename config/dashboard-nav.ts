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

export type DashboardNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Not built yet — rendered as a disabled item with a "Soon" tag instead of a dead link. */
  soon?: boolean;
};

export const dashboardNav: { title: string; items: DashboardNavItem[] }[] = [
  {
    title: "Main",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Conversations", href: "/dashboard/conversations", icon: MessagesSquare, soon: true },
      { label: "Customers", href: "/dashboard/customers", icon: Users, soon: true },
    ],
  },
  {
    title: "Business",
    items: [
      { label: "Products", href: "/dashboard/products", icon: Package, soon: true },
      { label: "Orders", href: "/dashboard/orders", icon: ShoppingBag, soon: true },
      { label: "Knowledge", href: "/dashboard/knowledge", icon: BookOpen, soon: true },
    ],
  },
  {
    title: "AI",
    items: [
      { label: "AI Assistant", href: "/dashboard/ai", icon: Bot, soon: true },
      { label: "Automations", href: "/dashboard/automations", icon: Workflow, soon: true },
    ],
  },
  {
    title: "Insights",
    items: [{ label: "Analytics", href: "/dashboard/analytics", icon: ChartColumn, soon: true }],
  },
  {
    title: "Settings",
    items: [
      { label: "WhatsApp", href: "/dashboard/whatsapp", icon: Smartphone, soon: true },
      { label: "Team", href: "/dashboard/team", icon: UsersRound, soon: true },
      { label: "Billing", href: "/dashboard/billing", icon: CreditCard, soon: true },
      { label: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];
