"use client";

import * as React from "react";
import { Controller } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Shared, presentational form field helpers used across every settings tab. */

interface TextFieldProps extends React.ComponentProps<typeof Input> {
  label: string;
  helper?: string;
  error?: string;
}

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField({ label, helper, error, id, ...props }, ref) {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <Input id={id} ref={ref} aria-invalid={Boolean(error)} {...props} />
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : helper ? (
          <p className="text-xs text-muted-foreground">{helper}</p>
        ) : null}
      </div>
    );
  }
);

/* eslint-disable @typescript-eslint/no-explicit-any */
export function SelectField({
  control,
  name,
  label,
  helper,
  options,
}: {
  control: any;
  name: string;
  label: string;
  helper?: string;
  options: { value: string; label: string }[];
}) {
  const fieldId = `field-${name.replace(/\./g, "-")}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id={fieldId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

export function ToggleField({
  control,
  name,
  label,
  description,
}: {
  control: any;
  name: string;
  label: string;
  description: string;
}) {
  const fieldId = `toggle-${name.replace(/\./g, "-")}`;
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={fieldId} className="cursor-pointer">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Switch
            id={fieldId}
            checked={Boolean(field.value)}
            onCheckedChange={field.onChange}
          />
        )}
      />
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
