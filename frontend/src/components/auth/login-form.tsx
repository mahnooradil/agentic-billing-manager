"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormAlert } from "@/components/common/form-alert";
import { ApiError } from "@/services/api/client";
import { requestLoginOtp, verifyOtp, googleSignIn } from "@/services/auth/auth.service";
import { loginEmailFormSchema, type LoginEmailFormValues } from "@/lib/validations/auth";
import { useAuth } from "@/hooks/use-auth";
import { OtpCodeStep } from "@/components/auth/otp-code-step";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

type Step = { name: "email" } | { name: "code"; email: string };

/**
 * Passwordless login — enter an email, get a code, verify it (or skip both
 * with "Continue with Google"). The request-otp step always advances to the
 * code screen and returns the same response whether or not the email has an
 * account (S-13 — a distinguishable response here would let anyone
 * enumerate registered emails); for an unknown email no real code is ever
 * sent, so verify-otp then fails there with a generic "expired or wasn't
 * found" instead of ever creating an account (login never collects a name
 * to create one with, unlike register).
 *
 * Wrapped in Suspense because the inner component reads `useSearchParams()`
 * (an optional `?redirect=` back to, e.g., an invite page), which Next.js
 * requires to be Suspense-bounded.
 */
export function LoginForm() {
  return (
    <React.Suspense fallback={<div className="h-96 w-full" />}>
      <LoginFormInner />
    </React.Suspense>
  );
}

function LoginFormInner() {
  const [step, setStep] = React.useState<Step>({ name: "email" });
  const [error, setError] = React.useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = React.useState(false);
  const { login } = useAuth();
  const searchParams = useSearchParams();
  // Only a same-site path is ever honored — a bare "/..." not "//..." (which
  // browsers treat as protocol-relative, i.e. off-site) — so a crafted
  // `?redirect=` can't be used as an open redirect.
  const rawRedirect = searchParams.get("redirect");
  const redirectTo =
    rawRedirect && rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
      ? rawRedirect
      : undefined;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginEmailFormValues>({
    resolver: zodResolver(loginEmailFormSchema),
    defaultValues: { email: "" },
  });

  const onSubmitEmail = async (values: LoginEmailFormValues) => {
    setError(null);
    try {
      await requestLoginOtp({ email: values.email });
      setStep({ name: "code", email: values.email });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  };

  const handleGoogleCredential = async (credential: string) => {
    setError(null);
    setGoogleLoading(true);
    try {
      const response = await googleSignIn({ credential });
      login(response.data.token, response.data.user, redirectTo);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not sign in with Google. Please try again."
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  if (step.name === "code") {
    return (
      <OtpCodeStep
        email={step.email}
        onVerify={async (code) => {
          const response = await verifyOtp({ email: step.email, code });
          login(response.data.token, response.data.user, redirectTo);
        }}
        onResend={async () => {
          await requestLoginOtp({ email: step.email });
        }}
        onBack={() => setStep({ name: "email" })}
      />
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-center font-heading text-2xl font-semibold text-foreground">
        Welcome back
      </h1>

      <form onSubmit={handleSubmit(onSubmitEmail)} noValidate className="space-y-4">
        {error ? <FormAlert variant="error" message={error} /> : null}

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            {...register("email")}
          />
          {errors.email ? (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          ) : null}
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || googleLoading}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : null}
          Continue
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium text-muted-foreground">OR</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <GoogleSignInButton onCredential={(credential) => void handleGoogleCredential(credential)} />

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
          Register
        </Link>
      </p>
    </div>
  );
}
