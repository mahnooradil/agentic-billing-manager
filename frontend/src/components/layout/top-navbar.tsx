"use client";

import { Bell, Menu, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

interface TopNavbarProps {
  /** Opens the mobile navigation drawer. */
  onMenuClick: () => void;
}

/**
 * Sticky top navigation bar: mobile menu trigger, search placeholder, theme
 * toggle, notifications placeholder, and the user avatar menu.
 * All controls are presentational — no data fetching.
 */
export function TopNavbar({ onMenuClick }: TopNavbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open navigation menu"
        onClick={onMenuClick}
      >
        <Menu />
      </Button>

      <div className="relative hidden w-full max-w-md sm:block">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search…"
          aria-label="Search"
          className="pl-8"
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notifications"
          className="relative"
        >
          <Bell />
          <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-background" />
        </Button>
        <UserMenu />
      </div>
    </header>
  );
}
