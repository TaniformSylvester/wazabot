import { Bot, Hand } from "lucide-react";

import { ChannelBadge } from "@/components/brand/channel-badge";
import { cn } from "@/lib/utils";

/*
 * WazaBolt conversation primitives — the business's view of a customer
 * conversation. Deliberately styled as WazaBolt's own UI (not a copy of any
 * messaging app). Used by marketing demos now and the dashboard later.
 *
 *   customer → left, light card
 *   bot      → right, Ink (automated/AI reply)
 *   agent    → right, amber tint (a person on your team)
 */
export type ChatSender = "customer" | "bot" | "agent";

export function ConversationHeader({
  name,
  initials,
  mode = "ai",
  className,
}: {
  name: string;
  initials: string;
  mode?: "ai" | "human";
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 border-b border-border bg-card px-4 py-3", className)}>
      <span className="grid size-9 place-items-center rounded-full bg-volt-100 text-xs font-bold text-volt-700">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{name}</p>
        <ChannelBadge />
      </div>
      {mode === "ai" ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-[0.6875rem] font-semibold text-bolt-400">
          <Bot className="size-3.5" aria-hidden /> AI handling
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ember-100 px-2.5 py-1 text-[0.6875rem] font-semibold text-ember-700">
          <Hand className="size-3.5" aria-hidden /> Human mode
        </span>
      )}
    </div>
  );
}

export function ChatBubble({
  from,
  time,
  children,
  className,
  label,
}: {
  from: ChatSender;
  time?: string;
  children: React.ReactNode;
  className?: string;
  label?: React.ReactNode;
}) {
  const outgoing = from !== "customer";
  return (
    <div className={cn("flex", outgoing ? "justify-end" : "justify-start", className)}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[0.8125rem] leading-snug",
          from === "customer" && "rounded-tl-sm border border-border bg-card text-ink",
          from === "bot" && "rounded-tr-sm bg-ink text-sand",
          from === "agent" && "rounded-tr-sm bg-bolt-100 text-ink",
        )}
      >
        {label ? (
          <p className={cn("mb-1 text-[0.6875rem] font-semibold", from === "bot" ? "text-bolt-400" : "text-ember-700")}>
            {label}
          </p>
        ) : null}
        <div className="whitespace-pre-line">{children}</div>
        {time ? (
          <p className={cn("mt-1 text-right text-[0.625rem]", from === "bot" ? "text-sand/55" : "text-stone")}>{time}</p>
        ) : null}
      </div>
    </div>
  );
}

export function TypingIndicator({ className }: { className?: string }) {
  return (
    <div className={cn("flex justify-end", className)} role="status" aria-label="WazaBolt is replying">
      <div className="flex items-center gap-1 rounded-2xl rounded-tr-sm bg-ink px-3.5 py-3">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 animate-typing rounded-full bg-bolt-400"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
