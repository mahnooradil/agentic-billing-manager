"use client";

import * as React from "react";
import { PanelLeft, PanelLeftClose } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";
import { SidebarNav } from "./sidebar-nav";
import { TopNavbar } from "./top-navbar";
import { AppFooter } from "./app-footer";
import { Toaster } from "@/components/notifications/toaster";

/**
 * The authenticated app frame: a collapsible desktop sidebar, a mobile drawer
 * (Sheet), the top navbar, the page content, and the footer.
 *
 * Holds only UI state (sidebar collapse + mobile open). No data, no auth.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="flex min-h-svh w-full">
      {/* Desktop sidebar — a rich, layered, floating navigation panel. */}
      <aside
        className={cn(
          "sticky top-0 isolate hidden h-svh shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar/85 text-sidebar-foreground shadow-[8px_0_30px_-18px_oklch(0_0_0/0.7)] backdrop-blur-2xl transition-[width] duration-300 ease-out md:flex",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Layered lighting — top glow, edge highlight, subtle depth. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-primary/10 to-transparent" />
          <div className="absolute -top-24 left-1/2 size-56 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-white/12 via-white/5 to-transparent" />
        </div>

        <div className="relative z-10 flex flex-1 flex-col">
          <div className="flex h-14 items-center border-b border-sidebar-border/80">
            <Brand collapsed={collapsed} />
          </div>
          <SidebarNav collapsed={collapsed} />
          <div className="border-t border-sidebar-border/80 p-2">
            <Button
              variant="ghost"
              size="icon"
              className="w-full"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? <PanelLeft /> : <PanelLeftClose />}
            </Button>
          </div>
        </div>
      </aside>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNavbar onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1">{children}</main>
        <AppFooter />
      </div>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-64 gap-0 border-sidebar-border bg-sidebar/95 p-0 text-sidebar-foreground backdrop-blur-2xl"
        >
          <SheetHeader className="h-14 justify-center border-b border-sidebar-border/80 p-0">
            <SheetTitle className="sr-only">Navigation menu</SheetTitle>
            <Brand />
          </SheetHeader>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Global toast viewport (F2.1) */}
      <Toaster />
    </div>
  );
}
