import {
  BookOpen,
  CalendarClock,
  ChartColumn,
  CreditCard,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Package,
  Settings,
  ShoppingBag,
  Smartphone,
  Users,
  type LucideIcon,
} from "lucide-react";

export type DashboardNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Not built yet — rendered as a disabled item with a "Soon" tag instead of a dead link. */
  soon?: boolean;
};

export const dashboardNav: { title?: string; items: DashboardNavItem[] }[] = [
  {
    items: [
      { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
      { label: "Conversations", href: "/dashboard/conversations", icon: MessagesSquare, soon: true },
      { label: "Customers", href: "/dashboard/customers", icon: Users, soon: true },
      { label: "Catalog", href: "/dashboard/products", icon: Package, soon: true },
      { label: "Orders", href: "/dashboard/orders", icon: ShoppingBag, soon: true },
      { label: "Appointments", href: "/dashboard/appointments", icon: CalendarClock, soon: true },
      { label: "Broadcasts", href: "/dashboard/broadcasts", icon: Megaphone, soon: true },
      { label: "Knowledge", href: "/dashboard/knowledge", icon: BookOpen, soon: true },
      { label: "Analytics", href: "/dashboard/analytics", icon: ChartColumn, soon: true },
    ],
  },
  {
    title: "Business",
    items: [
      { label: "WhatsApp", href: "/dashboard/whatsapp", icon: Smartphone, soon: true },
      { label: "Billing", href: "/dashboard/billing", icon: CreditCard, soon: true },
      { label: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];
