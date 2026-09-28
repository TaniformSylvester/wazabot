import { MessageCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Neutral "via WhatsApp" marker. WhatsApp is an integration channel, so it
 * is named in text with a generic chat icon — never with WhatsApp's logo,
 * colours or styling.
 */
export function ChannelBadge({
  className,
  tone = "light",
  label = "via WhatsApp",
}: {
  className?: string;
  tone?: "light" | "dark";
  label?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium",
        tone === "dark" ? "bg-sand/10 text-sand/80" : "bg-sand-100 text-stone",
        className,
      )}
    >
      <MessageCircle className="size-3" aria-hidden />
      {label}
    </span>
  );
}
