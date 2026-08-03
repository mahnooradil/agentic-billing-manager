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
import { requestLoginOtp, verifyOtp } from "@/services/auth/auth.service";
import { loginEmailFormSchema, type LoginEmailFormValues } from "@/lib/validations/auth";
import { useAuth } from "@/hooks/use-auth";
import { OtpCodeStep } from "@/components/auth/otp-code-step";

type Step = { name: "email" } | { name: "code"; email: string };

/**
 * Passwordless login — enter an email, get a code, verify it. Verifying an
 * unknown email is impossible here (the backend 404s at the request-otp
 * step) since login never collects a name to create an account with.
 */
export function LoginForm() {
  const [step, setStep] = React.useState<Step>({ name: "email" });
  const [error, setError] = React.useState<string | null>(null);
  const { login } = useAuth();

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
            await requestLoginOtp({ email: step.email });
          }}
          onBack={() => setStep({ name: "email" })}
        />
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-lg">Welcome back</CardTitle>
        <CardDescription>Enter your email and we&apos;ll send you a code.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmitEmail)} noValidate>
        <CardContent className="space-y-4">
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

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            {isSubmitting ? "Sending code…" : "Send code"}
          </Button>
        </CardContent>
      </form>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
            Register
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
