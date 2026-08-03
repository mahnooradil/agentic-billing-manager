"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormAlert } from "@/components/common/form-alert";
import { ApiError } from "@/services/api/client";
import { otpCodeFormSchema, type OtpCodeFormValues } from "@/lib/validations/auth";

interface OtpCodeStepProps {
  email: string;
  /** Verifies the code — throws on failure (invalid/expired/too many attempts). */
  onVerify: (code: string) => Promise<void>;
  /** Requests a fresh code for the same email. */
  onResend: () => Promise<void>;
  /** Goes back to the email step (e.g. to fix a typo). */
  onBack: () => void;
}

/**
 * Step 2 of the passwordless flow — shared by login and register, which only
 * differ in how the code was requested (step 1). Verifying is identical
 * either way (`POST /auth/verify-otp`), so this step never needs to know
 * which flow it's in.
 */
export function OtpCodeStep({ email, onVerify, onResend, onBack }: OtpCodeStepProps) {
  const [error, setError] = React.useState<string | null>(null);
  const [resendStatus, setResendStatus] = React.useState<
    { type: "idle" } | { type: "sent" } | { type: "error"; message: string }
  >({ type: "idle" });
  const [resending, setResending] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OtpCodeFormValues>({
    resolver: zodResolver(otpCodeFormSchema),
    defaultValues: { code: "" },
  });

  const onSubmit = async (values: OtpCodeFormValues) => {
    setError(null);
    try {
      await onVerify(values.code);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  };

  const handleResend = async () => {
    setResending(true);
    setResendStatus({ type: "idle" });
    try {
      await onResend();
      setResendStatus({ type: "sent" });
    } catch (err) {
      setResendStatus({
        type: "error",
        message: err instanceof ApiError ? err.message : "Could not resend the code.",
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <>
      <CardHeader>
        <CardTitle className="text-lg">Check your email</CardTitle>
        <CardDescription>
          We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardContent className="space-y-4">
          {error ? <FormAlert variant="error" message={error} /> : null}
          {resendStatus.type === "sent" ? (
            <FormAlert variant="success" message="A new code has been sent." />
          ) : null}
          {resendStatus.type === "error" ? (
            <FormAlert variant="error" message={resendStatus.message} />
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="code">Verification code</Label>
            <Input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              aria-invalid={Boolean(errors.code)}
              {...register("code")}
            />
            {errors.code ? (
              <p className="text-xs text-destructive">{errors.code.message}</p>
            ) : null}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            {isSubmitting ? "Verifying…" : "Verify"}
          </Button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={onBack}
              className="text-muted-foreground underline-offset-4 hover:underline"
            >
              Use a different email
            </button>
            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={resending}
              className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50"
            >
              {resending ? "Sending…" : "Resend code"}
            </button>
          </div>
        </CardContent>
      </form>
    </>
  );
}
