"use client";

import * as React from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.map((part) => part[0]).join("");
  return (letters || name.trim()).slice(0, 2).toUpperCase() || "?";
}

/** A platform's logo when available, falling back to a monogram otherwise.
 *  Shared between the Platforms page and the "connect a new platform"
 *  catalog dialog. */
export function PlatformLogo({
  src,
  name,
  className,
}: {
  src: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);

  if (!src || failed) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground",
          className
        )}
      >
        {initialsOf(name)}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full bg-muted",
        className
      )}
    >
      <Image
        src={src}
        alt=""
        fill
        unoptimized
        sizes="40px"
        className="object-contain p-1.5"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
