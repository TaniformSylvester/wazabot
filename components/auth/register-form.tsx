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
import { signUp } from "@/lib/actions/auth";
import { format } from "@/lib/i18n/format";
import { rich } from "@/lib/i18n/rich";
import { registerSchema, type RegisterInput } from "@/lib/validation/auth";

export function RegisterForm({ disabled = false }: { disabled?: boolean }) {
  const { a, locale, href, fieldError, errorText } = useAuthText();
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", businessName: "", email: "", password: "" },
  });
  const { onSubmit, pending, result } = useServerForm(form, (values) => signUp(values, locale));
  const errors = form.formState.errors;
  const link = "font-semibold text-waza-700 hover:underline";

  if (result?.ok) {
    return (
      <div className="flex flex-col items-center text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-waza-100 text-waza-800">
          <MailCheck className="size-7" aria-hidden />
        </span>
        <h2 className="type-h3 mt-5 text-xl">{a.register.checkEmailTitle}</h2>
        <p className="mt-2 text-slate">
          {rich(format(a.register.checkEmailText, { email: result.email ?? "" }), {
            b: (c) => <strong className="text-deep">{c}</strong>,
          })}
        </p>
        <p className="mt-4 text-sm text-slate">
          {rich(a.register.checkEmailHelp, {
            login: (c) => (
              <Link href={href("/login")} className={link}>
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
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label={a.fields.fullName} autoComplete="name" error={fieldError(errors.fullName?.message)} registration={form.register("fullName")} />
        <FormField
          label={a.fields.businessName}
          autoComplete="organization"
          error={fieldError(errors.businessName?.message)}
          registration={form.register("businessName")}
        />
      </div>
      <FormField
        label={a.fields.email}
        type="email"
        autoComplete="email"
        inputMode="email"
        error={fieldError(errors.email?.message)}
        registration={form.register("email")}
      />
      <FormField
        label={a.fields.password}
        type="password"
        autoComplete="new-password"
        hint={a.fields.passwordHint}
        error={fieldError(errors.password?.message)}
        registration={form.register("password")}
      />
      <Button type="submit" size="lg" disabled={pending || disabled} className="mt-1 w-full">
        {pending ? a.register.pending : a.register.submit}
      </Button>
      <p className="text-center text-xs text-slate">
        {rich(a.register.agree, {
          terms: (c) => (
            <Link href={href("/terms")} className="underline hover:text-deep">
              {c}
            </Link>
          ),
          privacy: (c) => (
            <Link href={href("/privacy")} className="underline hover:text-deep">
              {c}
            </Link>
          ),
        })}
      </p>
    </form>
  );
}
