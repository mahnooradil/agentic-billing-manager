"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormAlert } from "@/components/common/form-alert";
import { ApiError } from "@/services/api/client";
import { loginUser } from "@/services/auth/auth.service";
import { loginFormSchema, type LoginFormValues } from "@/lib/validations/auth";

type SubmitStatus =
  | { type: "idle" }
  | { type: "success"; message: string }
  | { type: "error"; message: string; errors?: string[] };

/**
 * Login form wired to the Phase 3 backend. On success it shows a message only —
 * per Phase 5A scope it does NOT store the token or navigate anywhere.
 */
export function LoginForm() {
  const [status, setStatus] = React.useState<SubmitStatus>({ type: "idle" });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setStatus({ type: "idle" });
    try {
      const response = await loginUser({
        email: values.email,
        password: values.password,
      });
      setStatus({
        type: "success",
        message: response.message ?? "Login successful.",
      });
    } catch (error) {
      if (error instanceof ApiError) {
        setStatus({
          type: "error",
          message: error.message,
          errors: error.errors,
        });
      } else {
        setStatus({
          type: "error",
          message: "Something went wrong. Please try again.",
        });
      }
    }
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-lg">Welcome back</CardTitle>
        <CardDescription>Sign in to your account to continue.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardContent className="space-y-4">
          {status.type === "success" ? (
            <FormAlert variant="success" message={status.message} />
          ) : null}
          {status.type === "error" ? (
            <FormAlert
              variant="error"
              message={status.message}
              details={status.errors}
            />
          ) : null}

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

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
            {errors.password ? (
              <p className="text-xs text-destructive">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </CardContent>
      </form>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Register
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
