"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, LifeBuoy, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorState } from "@/components/common/error-state";
import { FormAlert } from "@/components/common/form-alert";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState } from "@/components/common/empty-state";
import { TextField, SelectField } from "@/components/settings/settings-fields";
import { cn } from "@/lib/utils";
import { formatRelativeTime, formatDateTime } from "@/lib/format";
import { usePreferences } from "@/services/preferences/preferences-store";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/services/api/client";
import { getSupportRequests, createSupportRequest } from "@/services/support/support.service";
import { getMyPlan } from "@/services/plan/plan.service";
import type { SupportCategory, SupportRequest } from "@/services/types/support";

const CATEGORY_OPTIONS: { value: SupportCategory; label: string }[] = [
  { value: "billing", label: "Billing & plan" },
  { value: "technical", label: "Technical issue / bug" },
  { value: "account", label: "Account & security" },
  { value: "feature-request", label: "Feature request" },
  { value: "other", label: "Other" },
];

const CATEGORY_LABELS: Record<SupportCategory, string> = {
  billing: "Billing & plan",
  technical: "Technical issue",
  account: "Account & security",
  "feature-request": "Feature request",
  other: "Other",
};

const supportFormSchema = z.object({
  category: z.enum(["billing", "technical", "account", "feature-request", "other"]),
  subject: z
    .string()
    .trim()
    .min(3, "Subject must be at least 3 characters")
    .max(150, "Subject must be at most 150 characters"),
  message: z
    .string()
    .trim()
    .min(10, "Message must be at least 10 characters")
    .max(2000, "Message must be at most 2000 characters"),
});
type SupportFormValues = z.infer<typeof supportFormSchema>;

type ViewStatus = "loading" | "error" | "ready";

const STATUS_STYLES: Record<SupportRequest["status"], { pill: string; dot: string }> = {
  open: { pill: "bg-amber-500/10 text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
  resolved: {
    pill: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
};

/**
 * Contact support — the actual feature behind the "Priority support" plan
 * line. There is no support team/admin panel here: a request is saved (so
 * the user can see its own status, persisted across refreshes) and
 * best-effort emailed to the support inbox, tagged `[PRIORITY]` for
 * Pro/Business requesters so it's actually triaged faster, not just a
 * marketing promise. The requester also gets a confirmation email.
 */
export function SupportSettingsTab() {
  const { user } = useAuth();
  const { general } = usePreferences();
  // Plan tier moved to the organization (shared across members) — fetched
  // here rather than read off the user, same as Billing & Plan's own tab.
  const [isPriority, setIsPriority] = React.useState(false);

  const [requests, setRequests] = React.useState<SupportRequest[]>([]);
  const [status, setStatus] = React.useState<ViewStatus>("loading");
  const [loadError, setLoadError] = React.useState("");
  const [reloadKey, setReloadKey] = React.useState(0);
  const [alert, setAlert] = React.useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SupportFormValues>({
    resolver: zodResolver(supportFormSchema),
    defaultValues: { category: "billing", subject: "", message: "" },
  });

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const [requestsRes, planRes] = await Promise.all([getSupportRequests(), getMyPlan()]);
        if (ignore) return;
        setRequests(requestsRes.data.requests);
        setIsPriority(planRes.data.plan.tier !== "Free");
        setStatus("ready");
      } catch (error) {
        if (ignore) return;
        setLoadError(
          error instanceof ApiError ? error.message : "Failed to load support requests."
        );
        setStatus("error");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  const onSubmit = async (data: SupportFormValues) => {
    setAlert(null);
    try {
      await createSupportRequest(data);
      setAlert({
        type: "success",
        message: `Request submitted — we've sent you a confirmation email.${
          isPriority ? " It's flagged as priority for your plan." : ""
        }`,
      });
      reset({ category: "billing", subject: "", message: "" });
      setReloadKey((key) => key + 1);
    } catch (error) {
      setAlert({
        type: "error",
        message: error instanceof ApiError ? error.message : "Could not submit your request.",
      });
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Contact support"
        description={
          isPriority
            ? "Your plan includes priority support — requests are flagged for faster follow-up."
            : "Send a message and we'll get back to you by email."
        }
      />
      {alert ? <FormAlert variant={alert.type} message={alert.message} /> : null}

      <Card>
        <CardContent>
          <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                control={control}
                name="category"
                label="Issue type"
                options={CATEGORY_OPTIONS}
              />
              <TextField
                id="support-subject"
                label="Subject"
                placeholder="What do you need help with?"
                error={errors.subject?.message}
                {...register("subject")}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="support-message" className="text-sm font-medium">
                Message
              </label>
              <Textarea
                id="support-message"
                rows={4}
                placeholder="Describe the issue…"
                aria-invalid={Boolean(errors.message)}
                {...register("message")}
              />
              {errors.message ? (
                <p className="text-xs text-destructive">{errors.message.message}</p>
              ) : null}
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin" /> : null}
                Submit request
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {alert?.type === "success" ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MailCheck className="size-3.5" />
          Sent to {user?.email}
        </div>
      ) : null}

      {status === "loading" ? (
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner label="Loading your requests…" />
        </div>
      ) : status === "error" ? (
        <ErrorState
          description={loadError}
          onRetry={() => {
            setStatus("loading");
            setReloadKey((key) => key + 1);
          }}
        />
      ) : requests.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="No support requests yet"
          description="Anything you submit above will show up here, and stays saved across visits."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Subject</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((req) => {
                const statusStyle = STATUS_STYLES[req.status];
                return (
                  <TableRow key={req.id}>
                    <TableCell className="max-w-xs align-top">
                      <p className="font-medium text-foreground">{req.subject}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {req.message}
                      </p>
                    </TableCell>
                    <TableCell className="align-top text-muted-foreground">
                      {CATEGORY_LABELS[req.category] ?? req.category}
                    </TableCell>
                    <TableCell className="align-top">
                      {req.priority === "priority" ? (
                        <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          Priority
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Standard</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                          statusStyle.pill
                        )}
                      >
                        <span className={cn("size-1.5 rounded-full", statusStyle.dot)} />
                        {req.status === "open" ? "Open" : "Resolved"}
                      </span>
                    </TableCell>
                    <TableCell className="align-top whitespace-nowrap text-xs text-muted-foreground">
                      <span title={formatDateTime(req.createdAt, general)}>
                        {formatRelativeTime(req.createdAt, general)}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
