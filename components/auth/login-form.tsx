"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { signIn } from "@/app/(auth)/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { FormField } from "@/components/auth/form-field";
import { useServerForm } from "@/components/auth/use-server-form";
import { Button } from "@/components/ui/button";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";

export function LoginForm({ next, disabled = false }: { next?: string; disabled?: boolean }) {
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const { onSubmit, pending, result } = useServerForm(form, (values) => signIn(values, next));
  const errors = form.formState.errors;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {result && !result.ok ? <FormAlert tone="error">{result.error}</FormAlert> : null}
      <FormField
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        error={errors.email?.message}
        registration={form.register("email")}
      />
      <FormField
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        registration={form.register("password")}
        labelAction={
          <Link href="/forgot-password" className="text-xs font-semibold text-waza-700 hover:underline">
            Forgot password?
          </Link>
        }
      />
      <Button type="submit" size="lg" disabled={pending || disabled} className="mt-1 w-full">
        {pending ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
