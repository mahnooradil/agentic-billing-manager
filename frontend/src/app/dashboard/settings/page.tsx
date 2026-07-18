import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/common/page-header";
import { PageWrapper } from "@/components/common/page-wrapper";
import { SectionHeader } from "@/components/common/section-header";

export const metadata: Metadata = { title: "Settings" };

/**
 * Settings placeholder. Static form fields to demonstrate the design system —
 * inputs are inert and nothing is persisted (Phase 4 is UI only).
 */
export default function SettingsPage() {
  return (
    <PageWrapper>
      <PageHeader
        title="Settings"
        description="Manage your workspace preferences."
      />

      <section className="space-y-4">
        <SectionHeader
          title="Profile"
          description="This information is display-only for now."
        />
        <Card>
          <CardHeader>
            <CardTitle>Account details</CardTitle>
            <CardDescription>
              Update your basic profile information.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="settings-name">Full name</Label>
              <Input id="settings-name" placeholder="Ada Lovelace" disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-email">Email</Label>
              <Input
                id="settings-email"
                type="email"
                placeholder="you@example.com"
                disabled
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="button" disabled>
                Save changes
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </PageWrapper>
  );
}
