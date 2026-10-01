"use client";

import { useEffect, useRef, useState } from "react";
import { FlaskConical, Hand, Loader2, RotateCcw, Send, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { TestChatError, TestChatResult } from "@/lib/ai/test-chat";
import { format } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages/en";

type T = Messages["dashboard"]["aiTest"];
type Turn =
  | { role: "customer"; text: string }
  | { role: "assistant"; text: string; meta: Extract<TestChatResult, { ok: true }> };

/** Calls the test-chat endpoint. Never throws: every failure becomes an error code shown in the chat. */
async function ask(payload: unknown): Promise<TestChatResult> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 75_000);
  try {
    const res = await fetch("/api/ai/test-chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (res.status === 504) return { ok: false, error: "timeout" };
    const data = (await res.json().catch(() => null)) as TestChatResult | null;
    return data && typeof data === "object" && "ok" in data ? data : { ok: false, error: "failed" satisfies TestChatError };
  } catch (e) {
    return { ok: false, error: e instanceof DOMException && e.name === "AbortError" ? "timeout" : "network" };
  } finally {
    window.clearTimeout(timer);
  }
}

/** The transcript lives only in this browser tab; each message is answered by /api/ai/test-chat. */
export function TestChat({ t, languageNames }: { t: T; languageNames: Record<string, string> }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [turns, pending]);

  const send = (text: string) => {
    const message = text.trim();
    if (!message || pending) return;
    setError(null);
    setDraft("");
    const history = turns.map((turn) => ({ role: turn.role, text: turn.text }));
    const lastLanguage = [...turns].reverse().find((turn): turn is Extract<Turn, { role: "assistant" }> => turn.role === "assistant")?.meta.language ?? null;
    setTurns((prev) => [...prev, { role: "customer", text: message }]);
    setPending(true);
    void ask({ message, history, language: lastLanguage }).then((res) => {
      setPending(false);
      if (res.ok) setTurns((prev) => [...prev, { role: "assistant", text: res.reply, meta: res }]);
      else {
        setError(t.errors[res.error] ?? t.errors.failed);
        setTurns((prev) => prev.slice(0, -1));
        setDraft(message);
      }
    });
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-card">
      <div className="flex items-start gap-3 border-b border-border bg-gold-50 px-4 py-3 text-xs text-gold-800">
        <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>{t.testMode}</p>
      </div>

      <div className="flex max-h-[60dvh] min-h-80 flex-col gap-3 overflow-y-auto bg-surface/60 p-4" aria-live="polite">
        {turns.length === 0 ? (
          <div className="m-auto max-w-md text-center">
            <p className="text-sm text-slate">{t.empty}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <span className="sr-only">{t.suggestionsLabel}</span>
              {t.suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-deep hover:bg-mint"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn, i) =>
            turn.role === "customer" ? (
              <div key={i} className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-card px-3.5 py-2.5 text-sm text-deep shadow-sm sm:max-w-[70%]">
                  <p className="mb-1 text-[0.6875rem] font-semibold text-slate">{t.you}</p>
                  <p className="whitespace-pre-line break-words">{turn.text}</p>
                </div>
              </div>
            ) : (
              <div key={i} className="flex flex-col items-end gap-1.5">
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-sm shadow-sm sm:max-w-[70%]",
                    turn.meta.blocked ? "bg-coral-50 text-deep ring-1 ring-coral-200" : "bg-deep text-cream",
                  )}
                >
                  <p className={cn("mb-1 text-[0.6875rem] font-semibold", turn.meta.blocked ? "text-slate" : "text-cream/70")}>{t.assistant}</p>
                  <p className="whitespace-pre-line break-words">{turn.text}</p>
                </div>
                <div className="flex max-w-[85%] flex-col items-end gap-1 text-right text-[0.6875rem] text-slate sm:max-w-[70%]">
                  <span>{format(t.language, { language: languageNames[turn.meta.language] ?? turn.meta.language })}</span>
                  {turn.meta.tools.length ? (
                    <span>{format(t.tools, { tools: [...new Set(turn.meta.tools)].map((n) => t.toolNames[n as keyof T["toolNames"]] ?? n).join(", ") })}</span>
                  ) : null}
                  {turn.meta.needsHuman ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-gold-800">
                      <Hand className="size-3" aria-hidden /> {t.handover}
                      {turn.meta.handoffReason ? ` — ${format(t.handoverReason, { reason: turn.meta.handoffReason })}` : null}
                    </span>
                  ) : null}
                  {turn.meta.blocked ? (
                    <span className="inline-flex items-start gap-1 font-semibold text-coral-700">
                      <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden /> {t.blocked}
                    </span>
                  ) : null}
                  {turn.meta.afterHours ? <span className="text-gold-800">{t.afterHours}</span> : null}
                </div>
              </div>
            ),
          )
        )}
        {pending ? (
          <p className="flex items-center justify-end gap-2 text-xs text-slate">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> {t.typing}
          </p>
        ) : null}
        <div ref={endRef} />
      </div>

      {error ? (
        <p role="alert" className="border-t border-coral-200 bg-coral-50 px-4 py-2 text-sm text-coral-800">
          {error}
        </p>
      ) : null}

      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <label htmlFor="test-chat-input" className="sr-only">
          {t.placeholder}
        </label>
        <textarea
          id="test-chat-input"
          rows={1}
          maxLength={1000}
          value={draft}
          placeholder={t.placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(draft);
            }
          }}
          className="max-h-32 min-h-11 min-w-0 flex-1 resize-y rounded-2xl border border-input bg-card px-3.5 py-2.5 text-[0.9375rem] text-deep outline-none focus-visible:border-waza-500 focus-visible:ring-4 focus-visible:ring-waza-500/15"
        />
        <Button type="submit" disabled={pending || !draft.trim()} className="h-11 shrink-0">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} {t.send}
        </Button>
        {turns.length ? (
          <Button type="button" variant="ghost" size="icon" aria-label={t.reset} title={t.reset} disabled={pending} onClick={() => { setTurns([]); setError(null); }}>
            <RotateCcw aria-hidden />
          </Button>
        ) : null}
      </form>
    </div>
  );
}
