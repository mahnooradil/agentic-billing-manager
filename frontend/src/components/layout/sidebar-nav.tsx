"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { dashboardNav } from "@/config/nav";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SidebarNavProps {
  /** Icon-only mode (desktop collapsed sidebar). */
  collapsed?: boolean;
  /** Called after a link is clicked — used to close the mobile drawer. */
  onNavigate?: () => void;
}

/**
 * The dashboard navigation list. Highlights the active route based on the
 * current pathname and adapts to collapsed (icon-only) mode with tooltips.
 */
export function SidebarNav({ collapsed = false, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
      {dashboardNav.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        const link = (
          <Link
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group/nav relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200",
              "before:absolute before:top-1/2 before:left-0 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-brand-gradient before:transition-all before:duration-300 before:content-['']",
              active
                ? "bg-primary/12 text-primary shadow-[inset_0_1px_0_0_oklch(1_0_0/0.06)] ring-1 ring-primary/20 before:opacity-100"
                : "text-sidebar-foreground/70 before:opacity-0 hover:translate-x-0.5 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              collapsed && "justify-center px-0 before:hidden"
            )}
          >
            <Icon
              className={cn(
                "size-4 shrink-0 transition-transform duration-200 group-hover/nav:scale-110",
                active && "text-primary"
              )}
            />
            {!collapsed ? <span className="truncate">{item.title}</span> : null}
          </Link>
        );

        if (collapsed) {
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger render={link} />
              <TooltipContent side="right">{item.title}</TooltipContent>
            </Tooltip>
          );
        }

        return <div key={item.href}>{link}</div>;
      })}
    </nav>
  );
}
