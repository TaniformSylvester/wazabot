"use client";

import { FlaskConical } from "lucide-react";

import { TestChat } from "@/components/app/test-chat";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Messages } from "@/messages/en";

/**
 * "Test AI Bot" in the dashboard header (owners, and the WazaBolt team for
 * demos): the assistant's test chat in a slide-over, so it can be tried from
 * any page without a second phone. Nothing is sent on WhatsApp; a hand-over
 * lands in the Live Handoff Queue as this member's TEST chat.
 */
export function TestBotButton({ t, languageNames }: { t: Messages["dashboard"]["aiTest"]; languageNames: Record<string, string> }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 min-w-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-waza-200 bg-mint px-2.5 text-xs font-semibold text-waza-800 hover:bg-waza-100"
          aria-label={t.simulator.button}
          title={t.simulator.button}
          data-testid="test-bot-button"
        >
          <FlaskConical className="size-4" aria-hidden />
          {/* The label only where the header has room for it beside the business name. */}
          <span className="hidden xl:inline">{t.simulator.button}</span>
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-full gap-3 p-0 sm:max-w-lg" data-testid="test-bot-panel">
        <div className="px-5 pt-5 pr-16">
          <SheetTitle className="text-lg text-deep">{t.simulator.title}</SheetTitle>
          <SheetDescription className="mt-1 text-xs text-slate">{t.simulator.description}</SheetDescription>
        </div>
        <TestChat t={t} languageNames={languageNames} simulator className="mx-3 mb-3 min-h-0 flex-1 rounded-2xl" />
      </SheetContent>
    </Sheet>
  );
}
