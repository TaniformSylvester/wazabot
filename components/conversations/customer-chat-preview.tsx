import Image from "next/image";
import { BadgeCheck, CheckCheck, ChevronLeft, MoreVertical } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * UI MOCKUP — what the customer sees in their own WhatsApp chat with a
 * business that uses WazaBolt. Uses the channel-depiction colours
 * (--color-chat-*), never the WazaBolt brand. No WhatsApp logo is drawn.
 */

function Bubble({
  side,
  time,
  read,
  children,
}: {
  side: "in" | "out";
  time: string;
  read?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex", side === "out" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-[0.8125rem] leading-snug text-ink shadow-[0_1px_1px_rgb(21_18_14/0.08)]",
          side === "out" ? "rounded-tr-md bg-chat-out" : "rounded-tl-md bg-chat-in",
        )}
      >
        {children}
        <p className="mt-0.5 flex items-center justify-end gap-1 text-[0.625rem] text-stone/80">
          {time}
          {side === "out" && read ? <CheckCheck className="size-3.5 text-chat-tick" aria-label="Read" /> : null}
        </p>
      </div>
    </div>
  );
}

export function CustomerChatPreview({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-3xl border-4 border-white bg-white shadow-float", className)}>
      <div className="flex items-center gap-2.5 bg-chat-header px-3 py-2.5 text-white">
        <ChevronLeft className="size-4 opacity-80" aria-hidden />
        <span className="grid size-8 place-items-center rounded-full bg-bolt-100 font-display text-xs font-extrabold text-ink">
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
          Hello, do you have this dress in size L?
        </Bubble>
        <Bubble side="in" time="10:24">
          Yes! We have it in size L. The price is 15,000 FCFA. Would you like to place an order?
        </Bubble>
        <div className="flex">
          <div className="flex w-[85%] gap-2.5 rounded-2xl bg-chat-in p-2 shadow-[0_1px_1px_rgb(21_18_14/0.08)]">
            <Image
              src="/images/product-robe-wax.webp"
              alt=""
              width={66}
              height={80}
              className="h-16 w-13 rounded-lg object-cover"
            />
            <div className="flex min-w-0 flex-1 flex-col justify-between">
              <div>
                <p className="text-xs font-semibold text-ink">Robe en wax</p>
                <p className="text-xs text-stone">15,000 FCFA · Size L</p>
              </div>
              <span className="rounded-md bg-chat-header py-1 text-center text-[0.6875rem] font-semibold text-white">
                Order
              </span>
            </div>
          </div>
        </div>
        <Bubble side="out" time="10:25" read>
          Yes please! 🙏
        </Bubble>
      </div>
    </div>
  );
}
