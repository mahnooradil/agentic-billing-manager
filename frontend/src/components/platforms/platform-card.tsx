import { ExternalLink, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Platform } from "@/services/types/platform";
import { PlatformStatusBadge } from "./platform-status-badge";

interface PlatformCardProps {
  platform: Platform;
  onEdit: (platform: Platform) => void;
  onDelete: (platform: Platform) => void;
}

/** Displays the hostname of a URL, falling back to the raw string. */
function formatHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Presentational card for a single platform, with edit/delete actions. */
export function PlatformCard({ platform, onEdit, onDelete }: PlatformCardProps) {
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground">
            {platform.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-medium">{platform.name}</h3>
            <p className="truncate text-xs text-muted-foreground">
              /{platform.slug}
            </p>
          </div>
          <PlatformStatusBadge status={platform.status} />
        </div>

        {platform.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {platform.description}
          </p>
        ) : null}

        {platform.website ? (
          <a
            href={platform.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-foreground underline-offset-4 hover:underline"
          >
            <ExternalLink className="size-3" />
            {formatHost(platform.website)}
          </a>
        ) : null}
      </CardContent>

      <CardFooter className="justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => onEdit(platform)}>
          <Pencil />
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={cn("text-destructive hover:text-destructive")}
          onClick={() => onDelete(platform)}
        >
          <Trash2 />
          Delete
        </Button>
      </CardFooter>
    </Card>
  );
}
