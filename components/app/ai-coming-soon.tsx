import { Bot } from "lucide-react";

/** Shown wherever the AI assistant is prepared while it isn't launched: nothing is answered automatically, nothing goes to an AI provider. */
export function AiComingSoon({ badge, text }: { badge: string; text: string }) {
  return (
    <div role="status" className="flex flex-wrap items-start gap-3 rounded-2xl border border-gold-200 bg-gold-50 px-4 py-3 text-sm text-deep" data-testid="ai-coming-soon-note">
      <Bot className="mt-0.5 size-4 shrink-0 text-gold-800" aria-hidden />
      <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-deep">{badge}</span>
      <p className="min-w-0 flex-1">{text}</p>
    </div>
  );
}
