"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormAlert } from "@/components/common/form-alert";
import { ApiError } from "@/services/api/client";
import { requestRegisterOtp, verifyOtp } from "@/services/auth/auth.service";
import { registerEmailFormSchema, type RegisterEmailFormValues } from "@/lib/validations/auth";
import { useAuth } from "@/hooks/use-auth";
import { OtpCodeStep } from "@/components/auth/otp-code-step";

type Step =
  | { name: "details" }
  | { name: "code"; fullName: string; email: string };

/**
 * Passwordless signup — enter name + email, get a code, verify it, land
 * straight in the dashboard. If the email already has an account, the
 * backend quietly sends a normal login code instead (no error) — verifying
 * just signs them in.
 */
export function RegisterForm() {
  const [step, setStep] = React.useState<Step>({ name: "details" });
  const [error, setError] = React.useState<string | null>(null);
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

  if (step.name === "code") {
    return (
      <Card className="w-full max-w-sm">
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
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-lg">Create your account</CardTitle>
        <CardDescription>Get started with your billing workspace.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmitDetails)} noValidate>
        <CardContent className="space-y-4">
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

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            {isSubmitting ? "Sending code…" : "Send code"}
          </Button>
        </CardContent>
      </form>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
