"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { FormAlert } from "@/components/auth/form-alert";
import { FormField } from "@/components/auth/form-field";
import { useAuthText } from "@/components/auth/use-auth-text";
import { useServerForm } from "@/components/auth/use-server-form";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/actions/auth";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";

export function LoginForm({ next, disabled = false }: { next?: string; disabled?: boolean }) {
  const { a, locale, href, fieldError, errorText } = useAuthText();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const { onSubmit, pending, result } = useServerForm(form, (values) => signIn(values, next, locale));
  const errors = form.formState.errors;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {result && !result.ok ? <FormAlert tone="error">{errorText(result.error)}</FormAlert> : null}
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
        autoComplete="current-password"
        error={fieldError(errors.password?.message)}
        registration={form.register("password")}
        labelAction={
          <Link href={href("/forgot-password")} className="text-xs font-semibold text-waza-700 hover:underline">
            {a.login.forgot}
          </Link>
        }
      />
      <Button type="submit" size="lg" disabled={pending || disabled} className="mt-1 w-full">
        {pending ? a.login.pending : a.login.submit}
      </Button>
    </form>
  );
}
