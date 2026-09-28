"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { updatePassword } from "@/app/(auth)/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { FormField } from "@/components/auth/form-field";
import { useServerForm } from "@/components/auth/use-server-form";
import { Button } from "@/components/ui/button";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validation/auth";

/** Used on /reset-password (after an email link) and in dashboard settings. */
export function ResetPasswordForm({ continueHref = "/dashboard", submitLabel = "Save new password" }: { continueHref?: string; submitLabel?: string }) {
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });
  const { onSubmit, pending, result } = useServerForm(form, updatePassword);
  const errors = form.formState.errors;

  if (result?.ok) {
    return (
      <div className="flex flex-col gap-5">
        <FormAlert tone="success">{result.message}</FormAlert>
        <Button asChild size="lg" className="w-full">
          <Link href={continueHref}>Continue</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {result && !result.ok ? <FormAlert tone="error">{result.error}</FormAlert> : null}
      <FormField
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters, with letters and numbers."
        error={errors.password?.message}
        registration={form.register("password")}
      />
      <FormField
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        registration={form.register("confirmPassword")}
      />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
