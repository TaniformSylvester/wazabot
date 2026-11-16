"use client";

import { useState, useTransition } from "react";

import { createBetaInvite } from "@/lib/actions/waitlist-admin";
import { cn } from "@/lib/utils";

const ERRORS = { forbidden: "Not allowed.", not_found: "Lead not found.", joined: "Already joined.", failed: "Couldn't create the link. Try again." } as const;

/**
 * One tap: a fresh beta link for this lead, and WhatsApp opens with the
 * invite message ready to send (the window is opened during the tap so phones
 * don't block it). The link is also shown, to copy if WhatsApp didn't open.
 * Internal (WazaBolt team), English only.
 */
export function BetaInviteButton({ leadId, invited }: { leadId: string; invited: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ link: string; whatsappUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = () => {
    if (invited && !window.confirm("Send a new beta link? The previous one will stop working.")) return;
    const win = window.open("about:blank", "_blank");
    setError(null);
    start(async () => {
      const r = await createBetaInvite(leadId);
      if (!r.ok) {
        win?.close();
        setError(ERRORS[r.error]);
        return;
      }
      setResult({ link: r.link, whatsappUrl: r.whatsappUrl });
      if (win) win.location.href = r.whatsappUrl;
    });
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={send}
        disabled={pending}
        className={cn("inline-flex min-h-9 items-center rounded-full px-3 text-sm font-semibold whitespace-nowrap", invited ? "border border-border text-deep hover:bg-mint" : "bg-primary text-primary-foreground")}
        data-testid="beta-invite"
      >
        {pending ? "Preparing…" : invited ? "Resend invite" : "Send beta invite"}
      </button>
      {result ? (
        <span className="text-xs text-slate" data-testid="beta-invite-ready">
          <a href={result.whatsappUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-waza-700 hover:underline">
            Open WhatsApp
          </a>{" "}
          · <span className="break-all" data-testid="beta-invite-link">{result.link}</span>
        </span>
      ) : null}
      {error ? <span className="text-xs font-medium text-coral-700">{error}</span> : null}
    </div>
  );
}
