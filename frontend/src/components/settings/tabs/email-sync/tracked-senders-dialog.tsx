"use client";

import * as React from "react";
import { Loader2, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormAlert } from "@/components/common/form-alert";
import { ApiError } from "@/services/api/client";
import { updatePlatformConnection } from "@/services/connections/platform-connections.service";
import type { PlatformConnection } from "@/services/types/platform-connections";

interface TrackedSendersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: PlatformConnection | null;
  onSaved: (connection: PlatformConnection, message: string) => void;
}

/** One-click shortcuts for a user who knows WHICH platform bills them but not
 *  its exact sender address — the domain each platform's own invoice emails
 *  actually come from, so this is exactly as accurate as typing it in by hand. */
const POPULAR_PLATFORM_SENDERS: { label: string; sender: string }[] = [
  { label: "Netflix", sender: "netflix.com" },
  { label: "Spotify", sender: "spotify.com" },
  { label: "AWS", sender: "aws.amazon.com" },
  { label: "Google Workspace", sender: "google.com" },
  { label: "Microsoft 365", sender: "microsoft.com" },
  { label: "Stripe", sender: "stripe.com" },
  { label: "Shopify", sender: "shopify.com" },
  { label: "Slack", sender: "slack.com" },
  { label: "GitHub", sender: "github.com" },
  { label: "Adobe", sender: "adobe.com" },
];

/**
 * Lets a user scope one email connection's invoice-sync to specific senders
 * instead of scanning the whole inbox — both a privacy control (no reason to
 * hand over full inbox access when only a few vendors ever bill you) and an
 * accuracy fix: emails from a chosen sender never need to match a keyword
 * list first, so a vendor's oddly-worded invoice is never silently skipped.
 * Opens right after a new connection succeeds; reachable afterwards via each
 * connection's "Manage senders" button.
 */
export function TrackedSendersDialog({
  open,
  onOpenChange,
  connection,
  onSaved,
}: TrackedSendersDialogProps) {
  const [senders, setSenders] = React.useState<string[]>([]);
  const [input, setInput] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let ignore = false;
    (async () => {
      await Promise.resolve();
      if (ignore) return;
      setSenders(connection?.trackedSenders ?? []);
      setInput("");
      setError(null);
    })();
    return () => {
      ignore = true;
    };
  }, [open, connection]);

  const addSenderValue = (value: string) => {
    setError(null);
    setSenders((prev) => (prev.includes(value) ? prev : [...prev, value]));
  };

  const addSender = () => {
    const value = input.trim().toLowerCase();
    if (!value) return;
    if (value.length < 3) {
      setError("Enter a full email address or domain (e.g. netflix.com).");
      return;
    }
    setInput("");
    addSenderValue(value);
  };

  const removeSender = (value: string) => {
    setSenders((prev) => prev.filter((s) => s !== value));
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addSender();
    }
  };

  const handleSave = async () => {
    if (!connection) return;
    setSaving(true);
    setError(null);
    try {
      const res = await updatePlatformConnection(connection.id, { trackedSenders: senders });
      onSaved(
        res.data.connection,
        senders.length > 0
          ? `Now watching ${senders.length} sender${senders.length === 1 ? "" : "s"} for invoices.`
          : "Scanning your whole inbox for invoices."
      );
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save your senders.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Which senders should we watch?</DialogTitle>
          <DialogDescription>
            For privacy, we can scan only these senders for invoices instead of your whole
            inbox. Type a sender&apos;s email or domain, or just pick the platform by name if
            you&apos;re not sure of its exact sender address.
          </DialogDescription>
        </DialogHeader>

        {error ? <FormAlert variant="error" message={error} /> : null}

        <div className="space-y-2">
          <Label htmlFor="tracked-sender-input">Sender email or domain</Label>
          <div className="flex gap-2">
            <Input
              id="tracked-sender-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="netflix.com"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={addSender}
              aria-label="Add sender"
            >
              <Plus />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Don&apos;t know the sender address? Pick the platform below instead.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Or pick a platform</Label>
          <div className="flex flex-wrap gap-2">
            {POPULAR_PLATFORM_SENDERS.map((platform) => {
              const added = senders.includes(platform.sender);
              return (
                <button
                  key={platform.sender}
                  type="button"
                  disabled={added}
                  onClick={() => addSenderValue(platform.sender)}
                  className="rounded-full border px-3 py-1 text-sm transition-colors disabled:cursor-default disabled:opacity-50 enabled:hover:bg-accent enabled:hover:text-accent-foreground"
                >
                  {added ? "✓ " : ""}
                  {platform.label}
                </button>
              );
            })}
          </div>
        </div>

        {senders.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {senders.map((sender) => (
              <span
                key={sender}
                className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground"
              >
                {sender}
                <button
                  type="button"
                  onClick={() => removeSender(sender)}
                  aria-label={`Remove ${sender}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No senders added — leave empty to scan your whole inbox for invoice-like emails
            instead.
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
