"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { acceptInvitation } from "@/lib/actions/team";
import type { Locale } from "@/lib/i18n/config";

/** Signed-in: one button to join (the server checks the email matches the invitation). */
export function AcceptInvite({ token, locale, label, pendingLabel, errors }: { token: string; locale: Locale; label: string; pendingLabel: string; errors: Record<string, string> }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      {error ? <FormAlert tone="error">{errors[error] ?? errors.unknown}</FormAlert> : null}
      <Button
        type="button"
        size="lg"
        disabled={pending}
        className="w-full"
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await acceptInvitation(token, locale);
            if (res?.status === "error") setError(res.error ?? "unknown");
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? pendingLabel : label}
      </Button>
    </div>
  );
}
