"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";

import { signUp } from "@/app/(auth)/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { FormField } from "@/components/auth/form-field";
import { useServerForm } from "@/components/auth/use-server-form";
import { Button } from "@/components/ui/button";
import { registerSchema, type RegisterInput } from "@/lib/validation/auth";

export function RegisterForm({ disabled = false }: { disabled?: boolean }) {
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", businessName: "", email: "", password: "" },
  });
  const { onSubmit, pending, result } = useServerForm(form, signUp);
  const errors = form.formState.errors;

  if (result?.ok) {
    return (
      <div className="flex flex-col items-center text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-waza-100 text-waza-800">
          <MailCheck className="size-7" aria-hidden />
        </span>
        <h2 className="type-h3 mt-5 text-xl">Check your email</h2>
        <p className="mt-2 text-slate">
          We sent a confirmation link to <strong className="text-deep">{result.message}</strong>. Open it to
          activate your WazaBolt account.
        </p>
        <p className="mt-4 text-sm text-slate">
          Didn&apos;t get it? Check your spam folder, or{" "}
          <Link href="/login" className="font-semibold text-waza-700 hover:underline">
            log in
          </Link>{" "}
          if you&apos;ve already confirmed.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {result && !result.ok ? <FormAlert tone="error">{result.error}</FormAlert> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Your name" autoComplete="name" error={errors.fullName?.message} registration={form.register("fullName")} />
        <FormField
          label="Business name"
          autoComplete="organization"
          error={errors.businessName?.message}
          registration={form.register("businessName")}
        />
      </div>
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
        autoComplete="new-password"
        hint="At least 8 characters, with letters and numbers."
        error={errors.password?.message}
        registration={form.register("password")}
      />
      <Button type="submit" size="lg" disabled={pending || disabled} className="mt-1 w-full">
        {pending ? "Creating your account…" : "Create account"}
      </Button>
      <p className="text-center text-xs text-slate">
        By creating an account you agree to our{" "}
        <Link href="/terms" className="underline hover:text-deep">Terms</Link> and{" "}
        <Link href="/privacy" className="underline hover:text-deep">Privacy Policy</Link>.
      </p>
    </form>
  );
}
