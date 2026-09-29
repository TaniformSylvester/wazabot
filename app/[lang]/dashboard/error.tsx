"use client";

import { RotateCcw } from "lucide-react";

import { useI18n } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useI18n().t.common.errorPage;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <p className="type-label text-coral-700">{t.label}</p>
      <h1 className="type-h2 mt-3">{t.title}</h1>
      <p className="type-body mt-2 text-slate">{t.text}</p>
      <Button onClick={reset} className="mt-8">
        <RotateCcw /> {t.retry}
      </Button>
    </div>
  );
}
