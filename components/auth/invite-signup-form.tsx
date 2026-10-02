"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { FormField } from "@/components/auth/form-field";
import { useAuthText } from "@/components/auth/use-auth-text";
import { useServerForm } from "@/components/auth/use-server-form";
import { Button } from "@/components/ui/button";
import { signUpWithInvite } from "@/lib/actions/auth";
import { format } from "@/lib/i18n/format";
import { rich } from "@/lib/i18n/rich";
import { inviteSignUpSchema, type InviteSignUpInput } from "@/lib/validation/auth";

/** Create an account from an invitation: name + password; the email is the invited one. */
export function InviteSignUpForm({ token, email, submitLabel, disabled = false }: { token: string; email: string; submitLabel: string; disabled?: boolean }) {
  const { a, locale, href, fieldError, errorText } = useAuthText();
  const form = useForm<InviteSignUpInput>({ resolver: zodResolver(inviteSignUpSchema), defaultValues: { fullName: "", password: "" } });
  const { onSubmit, pending, result } = useServerForm(form, (values) => signUpWithInvite({ ...values, token }, locale));
  const errors = form.formState.errors;

  if (result?.ok) {
    return (
      <div className="flex flex-col items-center text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-waza-100 text-waza-800">
          <MailCheck className="size-7" aria-hidden />
        </span>
        <h2 className="type-h3 mt-5 text-xl">{a.register.checkEmailTitle}</h2>
        <p className="mt-2 text-slate">
          {rich(format(a.register.checkEmailText, { email: result.email ?? email }), { b: (c) => <strong className="text-deep">{c}</strong> })}
        </p>
        <p className="mt-4 text-sm text-slate">
          {rich(a.register.checkEmailHelp, {
            login: (c) => (
              <Link href={href("/login")} className="font-semibold text-waza-700 hover:underline">
                {c}
              </Link>
            ),
          })}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {result && !result.ok ? <FormAlert tone="error">{errorText(result.error)}</FormAlert> : null}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-deep">{a.fields.email}</span>
        <p className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[0.9375rem] text-deep">{email}</p>
      </div>
      <FormField label={a.fields.fullName} autoComplete="name" error={fieldError(errors.fullName?.message)} registration={form.register("fullName")} />
      <FormField
        label={a.fields.password}
        type="password"
        autoComplete="new-password"
        hint={a.fields.passwordHint}
        error={fieldError(errors.password?.message)}
        registration={form.register("password")}
      />
      <Button type="submit" size="lg" disabled={pending || disabled} className="mt-1 w-full">
        {pending ? a.register.pending : submitLabel}
      </Button>
    </form>
  );
}
