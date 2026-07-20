/**
 * Dashboard navigation model — the single source of truth for sidebar items.
 * Shared by the desktop sidebar and the mobile drawer so they never drift.
 * Icons come from lucide-react. No routing logic here, just data.
 */
import {
  LayoutDashboard,
  Boxes,
  CreditCard,
  BarChart3,
  Sparkles,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

export const dashboardNav: NavItem[] = [
  { title: "Dashboard", href: "/dashboard/overview", icon: LayoutDashboard },
  { title: "Platforms", href: "/dashboard/platforms", icon: Boxes },
  { title: "Billing", href: "/dashboard/billing", icon: CreditCard },
  { title: "Analytics", href: "/dashboard/usage", icon: BarChart3 },
  { title: "AI Assistant", href: "/dashboard/ai", icon: Sparkles },
  { title: "Settings", href: "/dashboard/settings", icon: Settings },
];
