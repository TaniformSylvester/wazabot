"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { FormAlert } from "@/components/auth/form-alert";
import { FormField } from "@/components/auth/form-field";
import { useAuthText } from "@/components/auth/use-auth-text";
import { useServerForm } from "@/components/auth/use-server-form";
import { Button } from "@/components/ui/button";
import { requestPasswordReset } from "@/lib/actions/auth";
import { format } from "@/lib/i18n/format";
import { rich } from "@/lib/i18n/rich";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validation/auth";

export function ForgotPasswordForm({ disabled = false }: { disabled?: boolean }) {
  const { a, locale, href, fieldError, errorText } = useAuthText();
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const { onSubmit, pending, result } = useServerForm(form, (values) => requestPasswordReset(values, locale));

  if (result?.ok) {
    return (
      <div className="flex flex-col gap-5">
        <FormAlert tone="success">
          {rich(format(a.forgot.sent, { email: result.email ?? "" }), { b: (c) => <strong>{c}</strong> })}
        </FormAlert>
        <Button asChild variant="outline" size="lg" className="w-full">
          <Link href={href("/login")}>{a.forgot.backToLogin}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {result && !result.ok ? <FormAlert tone="error">{errorText(result.error)}</FormAlert> : null}
      <FormField
        label={a.fields.email}
        type="email"
        autoComplete="email"
        inputMode="email"
        error={fieldError(form.formState.errors.email?.message)}
        registration={form.register("email")}
      />
      <Button type="submit" size="lg" disabled={pending || disabled} className="w-full">
        {pending ? a.forgot.pending : a.forgot.submit}
      </Button>
    </form>
  );
}
