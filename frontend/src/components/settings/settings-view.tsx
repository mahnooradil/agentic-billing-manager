"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  User,
  Bell,
  Monitor,
  Wallet,
  Shield,
  LifeBuoy,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { PageWrapper } from "@/components/common/page-wrapper";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { cn } from "@/lib/utils";
import { GeneralSettingsTab } from "./tabs/general-tab";
import { PersonalSettingsTab } from "./tabs/personal-tab";
import { SecuritySettingsTab } from "./tabs/security-tab";
import { NotificationsSettingsTab } from "./tabs/notifications-tab";
import { DisplaySettingsTab } from "./tabs/display-tab";
import { BillingPlanTab } from "./tabs/billing-plan-tab";
import { SupportSettingsTab } from "./tabs/support-tab";

const TABS = [
  { key: "general", label: "General", icon: SlidersHorizontal, Component: GeneralSettingsTab },
  { key: "personal", label: "Personal", icon: User, Component: PersonalSettingsTab },
  { key: "security", label: "Security", icon: Shield, Component: SecuritySettingsTab },
  { key: "notifications", label: "Notifications", icon: Bell, Component: NotificationsSettingsTab },
  { key: "display", label: "Display", icon: Monitor, Component: DisplaySettingsTab },
  { key: "billing", label: "Billing & Plan", icon: Wallet, Component: BillingPlanTab },
  { key: "support", label: "Support", icon: LifeBuoy, Component: SupportSettingsTab },
] as const;

type TabKey = (typeof TABS)[number]["key"];
const TAB_KEYS: readonly string[] = TABS.map((t) => t.key);

/**
 * Settings module — a real, user-facing settings page. Each tab owns its own
 * data and save action (General/Notifications/Display persist via
 * `/settings`, Personal via `/auth/profile`, Billing & Plan via `/plan`,
 * Support via `/support`) — there is no single mega-form. Only settings that
 * actually affect app behavior are here; unused scaffolding (AI memory,
 * automation, analytics tuning knobs) was removed.
 *
 * The active tab lives in the URL (`?tab=`), not local state — so refreshing
 * the page (or bookmarking/sharing a link) keeps you on the same tab instead
 * of silently bouncing back to General.
 *
 * Wrapped in Suspense because the inner component reads `useSearchParams()`,
 * which Next.js requires to be Suspense-bounded.
 */
export function SettingsView() {
  return (
    <React.Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner label="Loading settings…" />
        </div>
      }
    >
      <SettingsViewInner />
    </React.Suspense>
  );
}

function SettingsViewInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const activeTab: TabKey = (TAB_KEYS.includes(tabParam ?? "") ? tabParam : "general") as TabKey;
  const ActiveComponent = TABS.find((t) => t.key === activeTab)?.Component ?? GeneralSettingsTab;

  const handleTabChange = (key: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <PageWrapper>
      <PageHeader title="Settings" description="Manage your account and preferences." />

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-visible">
          {TABS.map(({ key, label, icon: Icon }) => (
            <TabButton
              key={key}
              icon={Icon}
              label={label}
              active={activeTab === key}
              onClick={() => handleTabChange(key)}
            />
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          <ActiveComponent />
        </div>
      </div>
    </PageWrapper>
  );
}

function TabButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition-colors",
        active
          ? "bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </button>
  );
}
