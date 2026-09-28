"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { UseFormRegisterReturn } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FieldProps = {
  label: string;
  error?: string;
  hint?: string;
  registration: UseFormRegisterReturn;
  labelAction?: React.ReactNode;
} & Omit<React.ComponentProps<"input">, keyof UseFormRegisterReturn>;

/** Accessible label + input + error message, wired to React Hook Form. */
export function FormField({ label, error, hint, registration, labelAction, type = "text", ...props }: FieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {labelAction}
      </div>
      <div className="relative">
        <Input
          id={id}
          type={isPassword && visible ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={isPassword ? "pr-12" : undefined}
          {...registration}
          {...props}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-stone transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-500/40"
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
          >
            {visible ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
          </button>
        ) : null}
      </div>
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-stone">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-ember-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
