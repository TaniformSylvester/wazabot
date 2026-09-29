import { AIStatus } from "@/components/brand/ai-status";
import { ChannelBadge } from "@/components/brand/channel-badge";
import { cn } from "@/lib/utils";

/*
 * WazaBolt conversation primitives — the business's view of a customer
 * conversation inside the WazaBolt dashboard. Used by marketing demos now
 * and the dashboard Conversations screen later.
 *
 *   customer → left, light card
 *   bot      → right, Deep Teal (WazaBolt AI reply)
 *   agent    → right, mint (a person on your team)
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
    <div className={cn("flex items-center gap-3 border-b border-line bg-white px-4 py-3", className)}>
      <span className="grid size-9 place-items-center rounded-full bg-gold-100 text-xs font-bold text-gold-800">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-deep">{name}</p>
        <ChannelBadge />
      </div>
      <AIStatus mode={mode} />
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
          from === "customer" && "rounded-tl-sm border border-line bg-white text-deep",
          from === "bot" && "rounded-tr-sm bg-deep text-white",
          from === "agent" && "rounded-tr-sm bg-mint text-deep",
        )}
      >
        {label ? (
          <p className={cn("mb-1 text-[0.6875rem] font-semibold", from === "bot" ? "text-waza-400" : "text-waza-700")}>
            {label}
          </p>
        ) : null}
        <div className="whitespace-pre-line">{children}</div>
        {time ? (
          <p className={cn("mt-1 text-right text-[0.625rem]", from === "bot" ? "text-cream/55" : "text-slate")}>{time}</p>
        ) : null}
      </div>
    </div>
  );
}

export function TypingIndicator({ className }: { className?: string }) {
  return (
    <div className={cn("flex justify-end", className)} role="status" aria-label="WazaBolt is replying">
      <div className="flex items-center gap-1 rounded-2xl rounded-tr-sm bg-deep px-3.5 py-3">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 animate-typing rounded-full bg-waza-400"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
