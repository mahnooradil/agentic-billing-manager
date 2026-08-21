"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormAlert } from "@/components/common/form-alert";
import { useAlertState } from "@/hooks/use-alert-state";
import { ApiError } from "@/services/api/client";
import { updateUserSettings } from "@/services/settings/settings.service";
import { THEMES, type Theme } from "@/services/types/settings";

const THEME_LABELS: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

/** How the interface looks. Applies instantly; saved alongside. */
export function DisplaySettingsTab() {
  const { theme, setTheme } = useTheme();
  const [saving, setSaving] = React.useState(false);
  const [alert, setAlert] = useAlertState();

  const handleSave = async () => {
    setAlert(null);
    setSaving(true);
    try {
      const nextTheme: Theme = (THEMES as readonly string[]).includes(theme ?? "")
        ? (theme as Theme)
        : "system";
      await updateUserSettings({ appearance: { theme: nextTheme } });
      setAlert({ type: "success", message: "Display settings saved." });
    } catch (error) {
      setAlert({
        type: "error",
        message: error instanceof ApiError ? error.message : "Something went wrong.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {alert ? <FormAlert variant={alert.type} message={alert.message} /> : null}
      <Card>
        <CardContent>
          <div className="max-w-xs space-y-2">
            <Label htmlFor="appearance-theme">Theme</Label>
            <Select value={theme ?? "system"} onValueChange={(value) => setTheme(value ?? "system")}>
              <SelectTrigger id="appearance-theme" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THEMES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {THEME_LABELS[v]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Applies instantly. Saved to your account when you save.
            </p>
          </div>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Save changes
        </Button>
      </div>
    </div>
  );
}
