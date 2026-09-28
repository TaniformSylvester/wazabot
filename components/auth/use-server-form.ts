"use client";

import { useState, useTransition } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

import type { ActionResult } from "@/lib/validation/auth";

/**
 * Submit a React Hook Form through a Server Action: the browser validates
 * first for instant feedback, the server re-validates and may return field
 * errors, which are mapped back onto the form.
 */
export function useServerForm<T extends FieldValues>(
  form: UseFormReturn<T>,
  action: (values: T) => Promise<ActionResult>,
) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const onSubmit = form.handleSubmit((values) => {
    setResult(null);
    startTransition(async () => {
      const res = await action(values);
      if (!res) return; // the action redirected
      if (!res.ok && res.fieldErrors) {
        for (const [name, messages] of Object.entries(res.fieldErrors)) {
          if (messages?.[0]) form.setError(name as Path<T>, { message: messages[0] });
        }
      }
      setResult(res);
    });
  });

  return { onSubmit, pending, result };
}
