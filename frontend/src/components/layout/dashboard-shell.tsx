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
      {/* Desktop sidebar — flat panel, flush with the content column. */}
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-out md:flex",
          collapsed ? "w-16" : "w-64"
        )}
      >
        <div className="flex flex-1 flex-col">
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
