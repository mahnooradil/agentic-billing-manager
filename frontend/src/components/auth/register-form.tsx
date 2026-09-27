"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormAlert } from "@/components/common/form-alert";
import { ApiError } from "@/services/api/client";
import { requestRegisterOtp, verifyOtp, googleSignIn } from "@/services/auth/auth.service";
import { registerEmailFormSchema, type RegisterEmailFormValues } from "@/lib/validations/auth";
import { useAuth } from "@/hooks/use-auth";
import { OtpCodeStep } from "@/components/auth/otp-code-step";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

type Step =
  | { name: "details" }
  | { name: "code"; fullName: string; email: string };

/**
 * Passwordless signup — enter name + email, get a code, verify it, land
 * straight in the dashboard (or skip both with "Continue with Google", which
 * uses the account's real name from the Google account). If the email
 * already has an account, the backend quietly sends a normal login code
 * instead (no error) — verifying just signs them in.
 */
export function RegisterForm() {
  const [step, setStep] = React.useState<Step>({ name: "details" });
  const [error, setError] = React.useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = React.useState(false);
  const { login } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterEmailFormValues>({
    resolver: zodResolver(registerEmailFormSchema),
    defaultValues: { fullName: "", email: "" },
  });

  const onSubmitDetails = async (values: RegisterEmailFormValues) => {
    setError(null);
    try {
      await requestRegisterOtp(values);
      setStep({ name: "code", fullName: values.fullName, email: values.email });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  };

  const handleGoogleCredential = async (credential: string) => {
    setError(null);
    setGoogleLoading(true);
    try {
      const response = await googleSignIn({ credential });
      login(response.data.token, response.data.user);
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
          login(response.data.token, response.data.user);
        }}
        onResend={async () => {
          await requestRegisterOtp({ fullName: step.fullName, email: step.email });
        }}
        onBack={() => setStep({ name: "details" })}
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1.5 text-center">
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Create your account
        </h1>
        <p className="text-sm text-muted-foreground">Get started with your billing workspace.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmitDetails)} noValidate className="space-y-4">
        {error ? <FormAlert variant="error" message={error} /> : null}

        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            type="text"
            placeholder="Ada Lovelace"
            autoComplete="name"
            aria-invalid={Boolean(errors.fullName)}
            {...register("fullName")}
          />
          {errors.fullName ? (
            <p className="text-xs text-destructive">{errors.fullName.message}</p>
          ) : null}
        </div>

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
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
