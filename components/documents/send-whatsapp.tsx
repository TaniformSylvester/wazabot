"use client";

import { ActionError } from "@/components/app/form";
import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/actions/form";

/**
 * Sends a PDF on WhatsApp and says what happened: sent (WhatsApp accepted it)
 * or why not. Nothing is shown as sent unless the server says WhatsApp took it.
 */
export function SendOnWhatsApp({
  action,
  label,
  pendingLabel,
  sentLabel,
  errors,
  disabled = false,
}: {
  action: () => Promise<FormState>;
  label: string;
  pendingLabel: string;
  sentLabel: string;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<FormState | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="dark"
        disabled={disabled || pending}
        data-testid="send-whatsapp"
        onClick={() =>
          start(async () => {
            setResult(null);
            setResult(await action());
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        {pending ? pendingLabel : label}
      </Button>
      {result?.status === "success" ? <FormAlert tone="success">{sentLabel}</FormAlert> : null}
      {result?.status === "error" ? <ActionError errorKey={result.error ?? "unknown"} errors={errors} detail={result.detail} /> : null}
    </div>
  );
}
