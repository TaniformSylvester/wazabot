"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2 } from "lucide-react";

import { ActionError } from "@/components/app/form";
import { resolveAndHandBack } from "@/lib/actions/conversations";
import { cn } from "@/lib/utils";

/**
 * "Resolve & hand back to AI": resolves the thread, switches the assistant
 * back on and records who did it (server action + database function), then
 * closes the conversation — back to the list, keeping its filter.
 */
export function ResolveHandBack({
  id,
  label,
  pendingLabel,
  errors,
  listHref,
  className,
}: {
  id: string;
  label: string;
  pendingLabel: string;
  errors: Record<string, string>;
  listHref: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        data-testid="resolve-hand-back"
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await resolveAndHandBack(id);
            if (res.status === "error") {
              setError(res.error ?? "unknown");
              return;
            }
            router.replace(listHref);
            router.refresh();
          })
        }
        className={cn(
          "inline-flex min-h-10 items-center gap-1.5 rounded-full bg-deep px-4 text-sm font-bold whitespace-nowrap text-cream shadow-card hover:bg-deep/90 disabled:opacity-70 max-md:px-3 max-md:text-[0.8125rem]",
          className,
        )}
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Bot className="size-4" aria-hidden />}
        {pending ? pendingLabel : label}
      </button>
      {error ? <ActionError errorKey={error} errors={errors} small /> : null}
    </span>
  );
}
