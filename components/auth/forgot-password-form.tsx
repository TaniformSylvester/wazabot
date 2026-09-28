"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { requestPasswordReset } from "@/app/(auth)/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { FormField } from "@/components/auth/form-field";
import { useServerForm } from "@/components/auth/use-server-form";
import { Button } from "@/components/ui/button";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validation/auth";

export function ForgotPasswordForm({ disabled = false }: { disabled?: boolean }) {
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const { onSubmit, pending, result } = useServerForm(form, requestPasswordReset);

  if (result?.ok) {
    return (
      <div className="flex flex-col gap-5">
        <FormAlert tone="success">
          If an account exists for <strong>{result.message}</strong>, we&apos;ve sent a link to reset your
          password. It expires in one hour.
        </FormAlert>
        <Button asChild variant="outline" size="lg" className="w-full">
          <Link href="/login">Back to log in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {result && !result.ok ? <FormAlert tone="error">{result.error}</FormAlert> : null}
      <FormField
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        error={form.formState.errors.email?.message}
        registration={form.register("email")}
      />
      <Button type="submit" size="lg" disabled={pending || disabled} className="w-full">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
