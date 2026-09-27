/**
 * Dashboard navigation model — the single source of truth for sidebar items.
 * Shared by the desktop sidebar and the mobile drawer so they never drift.
 * Icons come from lucide-react. No routing logic here, just data.
 */
import {
  LayoutDashboard,
  Boxes,
  Receipt,
  BarChart3,
  Workflow,
  Wallet,
  BotMessageSquare,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

// "Integrations" -> "Platforms" and "Billing Agent" -> "Chat" (sidebar label
// only — the page itself still calls itself "AI Assistant" in its own
// header) per the VIKTOR-inspired redesign. "Automation" (connected-platform
// sync health) and "Billing" (this workspace's own plan + AI credits,
// promoted out of Settings) are new top-level destinations. "Invoices"
// (bills a workspace receives) stays distinct from "Billing" (what this app
// charges the workspace) — same disambiguation as before, just no longer
// nested.
export const dashboardNav: NavItem[] = [
  { title: "Dashboard", href: "/dashboard/overview", icon: LayoutDashboard },
  { title: "Platforms", href: "/dashboard/platforms", icon: Boxes },
  { title: "Invoices", href: "/dashboard/billing", icon: Receipt },
  { title: "Analytics", href: "/dashboard/usage", icon: BarChart3 },
  { title: "Automation", href: "/dashboard/automation", icon: Workflow },
  { title: "Billing", href: "/dashboard/plan", icon: Wallet },
  { title: "Chat", href: "/dashboard/agent", icon: BotMessageSquare },
  { title: "Settings", href: "/dashboard/settings", icon: Settings },
];
