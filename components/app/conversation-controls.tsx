"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Hand, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { setConversationAi, setConversationStatus } from "@/lib/actions/conversations";
import { CONVERSATION_STATUSES } from "@/types/database";

type Labels = {
  takeOver: string;
  returnToAi: string;
  markStatus: string;
  statuses: Record<(typeof CONVERSATION_STATUSES)[number], string>;
};

/** Take Over (→ Human Mode, ai_enabled=false) / Return to AI (→ AI Online) and the status picker. */
export function ConversationControls({
  id,
  aiEnabled,
  status,
  labels,
  errors,
}: {
  id: string;
  aiEnabled: boolean;
  status: string;
  labels: Labels;
  errors: Record<string, string>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const run = (fn: () => Promise<{ status: string; error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.status === "error") setError(errors[res.error ?? "unknown"] ?? errors.unknown);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`status-${id}`}>
        {labels.markStatus}
      </label>
      <select
        id={`status-${id}`}
        value={status}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          run(() => setConversationStatus(id, next));
        }}
        className="h-9 rounded-full border border-input bg-card px-3 text-sm font-semibold text-deep"
      >
        {CONVERSATION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {labels.statuses[s]}
          </option>
        ))}
      </select>
      {aiEnabled ? (
        <Button type="button" size="sm" variant="dark" disabled={pending} onClick={() => run(() => setConversationAi(id, false))}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Hand aria-hidden />} {labels.takeOver}
        </Button>
      ) : (
        <Button type="button" size="sm" disabled={pending} onClick={() => run(() => setConversationAi(id, true))}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Bot aria-hidden />} {labels.returnToAi}
        </Button>
      )}
      {error ? (
        <span role="alert" className="basis-full text-xs font-medium text-coral-700">
          {error}
        </span>
      ) : null}
    </div>
  );
}
