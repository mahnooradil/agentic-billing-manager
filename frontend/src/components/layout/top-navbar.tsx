"use client";

import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

interface TopNavbarProps {
  /** Opens the mobile navigation drawer. */
  onMenuClick: () => void;
}

/**
 * Sticky top navigation bar: mobile menu trigger, theme toggle, live
 * notifications, and the user avatar menu.
 */
export function TopNavbar({ onMenuClick }: TopNavbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open navigation menu"
        onClick={onMenuClick}
      >
        <Menu />
      </Button>

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <NotificationCenter />
        <UserMenu />
      </div>
    </header>
  );
}
