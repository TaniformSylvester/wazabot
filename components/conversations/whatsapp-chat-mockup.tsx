import Image from "next/image";
import { BadgeCheck, CheckCheck, ChevronLeft, MoreVertical } from "lucide-react";

import { WazaBoltIcon } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/*
 * UI MOCKUP — a demonstration of what a customer sees in their WhatsApp chat
 * with a business that uses WazaBolt. Not a real customer conversation.
 * Uses the chat-* depiction colours; no WhatsApp logo is drawn.
 */

function Bubble({
  side,
  time,
  read,
  ai,
  children,
}: {
  side: "in" | "out";
  time: string;
  read?: boolean;
  /** Mark a business reply as written by WazaBolt AI. */
  ai?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-end gap-1.5", side === "out" ? "justify-end" : "justify-start")}>
      {ai ? <WazaBoltIcon className="mb-1 size-6" /> : null}
      <div
        className={cn(
          "max-w-[82%] rounded-2xl px-3 py-2 text-[0.8125rem] leading-snug text-deep shadow-[0_1px_1px_rgb(16_42_42/0.08)]",
          side === "out" ? "rounded-tr-md bg-chat-out" : "rounded-tl-md bg-chat-in",
        )}
      >
        {ai ? <p className="mb-0.5 text-[0.625rem] font-bold uppercase tracking-wider text-waza-700">WazaBolt AI</p> : null}
        {children}
        <p className="mt-0.5 flex items-center justify-end gap-1 text-[0.625rem] text-slate/80">
          {time}
          {side === "out" && read ? <CheckCheck className="size-3.5 text-chat-tick" aria-label="Read" /> : null}
        </p>
      </div>
    </div>
  );
}

export function WhatsAppChatMockup({ className, showDemoLabel = true }: { className?: string; showDemoLabel?: boolean }) {
  return (
    <figure className={cn("overflow-hidden rounded-3xl border-4 border-white bg-white shadow-float", className)}>
      <div className="flex items-center gap-2.5 bg-chat-header px-3 py-2.5 text-white">
        <ChevronLeft className="size-4 opacity-80" aria-hidden />
        <span className="grid size-8 place-items-center rounded-full bg-gold-100 font-display text-xs font-extrabold text-deep">
          MJ
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="flex items-center gap-1 truncate text-sm font-semibold">
            MJ Fashion
            <BadgeCheck className="size-3.5 text-white/80" aria-label="Business account" />
          </p>
          <p className="text-[0.6875rem] text-white/75">Online</p>
        </div>
        <MoreVertical className="size-4 opacity-80" aria-hidden />
      </div>
      <div className="chat-wallpaper space-y-2 p-3">
        <Bubble side="out" time="10:24" read>
          Hi, do you have this dress in size L?
        </Bubble>
        <Bubble side="in" time="10:24" ai>
          Yes! We have it in size L. The price is 15,000 FCFA. Would you like to place an order?
        </Bubble>
        <div className="flex pl-7.5">
          <div className="flex w-[82%] gap-2.5 rounded-2xl bg-chat-in p-2 shadow-[0_1px_1px_rgb(16_42_42/0.08)]">
            <Image
              src="/images/product-robe-wax.webp"
              alt="Robe en wax dress"
              width={66}
              height={80}
              className="h-16 w-13 rounded-lg object-cover"
            />
            <div className="flex min-w-0 flex-1 flex-col justify-between">
              <div>
                <p className="text-xs font-semibold text-deep">Robe en wax</p>
                <p className="text-xs text-slate">15,000 FCFA · Size L</p>
              </div>
              <span className="rounded-md bg-waza-500 py-1 text-center text-[0.6875rem] font-bold text-deep">
                Order Now
              </span>
            </div>
          </div>
        </div>
        <Bubble side="out" time="10:25" read>
          Yes please! 🙏
        </Bubble>
        <Bubble side="in" time="10:25" ai>
          Great! I&apos;ll help you with your order.
        </Bubble>
      </div>
      {showDemoLabel ? (
        <figcaption className="bg-white px-3 py-1.5 text-center text-[0.625rem] font-medium text-slate">
          Demo conversation
        </figcaption>
      ) : null}
    </figure>
  );
}
