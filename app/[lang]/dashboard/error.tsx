"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

import { useI18n } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useI18n().t.common.errorPage;
  const reference = error.digest ?? `${error.name}: ${error.message}`.slice(0, 160);

  useEffect(() => {
    // Report the crash so it appears in the server logs (no page content, just the error).
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: error.name, message: error.message, digest: error.digest, path: window.location.pathname }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <p className="type-label text-coral-700">{t.label}</p>
      <h1 className="type-h2 mt-3">{t.title}</h1>
      <p className="type-body mt-2 text-slate">{t.text}</p>
      <Button onClick={reset} className="mt-8">
        <RotateCcw /> {t.retry}
      </Button>
      <p className="mt-6 break-all text-xs text-slate">
        {t.reference}: <span className="font-mono">{reference}</span>
      </p>
    </div>
  );
}
