import { BadgeCheck, CheckCheck, ChevronLeft, MoreVertical } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/*
 * WhatsApp-style chat primitives. Used by the marketing demos now and by the
 * dashboard conversation view later. "out" = right-hand bubble, "in" = left.
 */

export function ChatHeader({
  name,
  status = "Online",
  className,
}: {
  name: string;
  status?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5 bg-wa-header px-3 py-2.5 text-white", className)}>
      <ChevronLeft className="size-4 opacity-80" aria-hidden />
      <span className="grid size-8 place-items-center rounded-full bg-white">
        <LogoMark className="size-6" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="flex items-center gap-1 truncate text-sm font-semibold">
          {name}
          <BadgeCheck className="size-3.5 fill-waza-400 text-wa-header" aria-label="Verified business" />
        </p>
        <p className="text-[0.6875rem] text-white/75">{status}</p>
      </div>
      <MoreVertical className="size-4 opacity-80" aria-hidden />
    </div>
  );
}

export function ChatBubble({
  side,
  time,
  read,
  children,
  className,
  label,
}: {
  side: "in" | "out";
  time?: string;
  read?: boolean;
  children: React.ReactNode;
  className?: string;
  /** Small label above the text, e.g. "WazaBot" or "Agent · Marie". */
  label?: React.ReactNode;
}) {
  return (
    <div className={cn("flex", side === "out" ? "justify-end" : "justify-start", className)}>
      <div
        className={cn(
          "relative max-w-[85%] rounded-2xl px-3 py-2 text-[0.8125rem] leading-snug text-deep shadow-[0_1px_1px_rgb(16_42_42/0.08)]",
          side === "out" ? "rounded-tr-md bg-wa-out" : "rounded-tl-md bg-white",
        )}
      >
        {label ? <p className="mb-0.5 text-[0.6875rem] font-semibold text-waza-700">{label}</p> : null}
        <div className="whitespace-pre-line">{children}</div>
        {time ? (
          <p className="mt-0.5 flex items-center justify-end gap-1 text-[0.625rem] text-slate-waza/80">
            {time}
            {side === "out" && read ? (
              <CheckCheck className="size-3.5 text-sky-500" aria-label="Read" />
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function TypingIndicator({ className }: { className?: string }) {
  return (
    <div className={cn("flex justify-start", className)} role="status" aria-label="WazaBot is typing">
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-white px-3.5 py-3 shadow-[0_1px_1px_rgb(16_42_42/0.08)]">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 animate-typing rounded-full bg-slate-waza"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
