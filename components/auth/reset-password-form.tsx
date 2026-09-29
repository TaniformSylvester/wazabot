"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { FormAlert } from "@/components/auth/form-alert";
import { FormField } from "@/components/auth/form-field";
import { useAuthText } from "@/components/auth/use-auth-text";
import { useServerForm } from "@/components/auth/use-server-form";
import { Button } from "@/components/ui/button";
import { updatePassword } from "@/lib/actions/auth";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validation/auth";

/** Used on /reset-password (after an email link) and in dashboard settings. */
export function ResetPasswordForm({ continueHref = "/dashboard", submitLabel }: { continueHref?: string; submitLabel?: string }) {
  const { a, href, fieldError, errorText } = useAuthText();
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });
  const { onSubmit, pending, result } = useServerForm(form, updatePassword);
  const errors = form.formState.errors;

  if (result?.ok) {
    return (
      <div className="flex flex-col gap-5">
        <FormAlert tone="success">{a.reset.updated}</FormAlert>
        <Button asChild size="lg" className="w-full">
          <Link href={href(continueHref)}>{a.reset.continue}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {result && !result.ok ? <FormAlert tone="error">{errorText(result.error)}</FormAlert> : null}
      <FormField
        label={a.fields.newPassword}
        type="password"
        autoComplete="new-password"
        hint={a.fields.passwordHint}
        error={fieldError(errors.password?.message)}
        registration={form.register("password")}
      />
      <FormField
        label={a.fields.confirmPassword}
        type="password"
        autoComplete="new-password"
        error={fieldError(errors.confirmPassword?.message)}
        registration={form.register("confirmPassword")}
      />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? a.reset.pending : (submitLabel ?? a.reset.submit)}
      </Button>
    </form>
  );
}
