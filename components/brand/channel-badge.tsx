"use client";

import { MessageCircle } from "lucide-react";

import { useI18n } from "@/components/i18n/i18n-provider";

import { cn } from "@/lib/utils";

/**
 * Neutral "via WhatsApp" marker. WhatsApp is an integration channel, so it
 * is named in text with a generic chat icon — never with WhatsApp's logo,
 * colours or styling.
 */
export function ChannelBadge({
  className,
  tone = "light",
  label,
}: {
  className?: string;
  tone?: "light" | "dark";
  label?: string;
}) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium",
        tone === "dark" ? "bg-cream/10 text-cream/80" : "bg-surface text-slate",
        className,
      )}
    >
      <MessageCircle className="size-3" aria-hidden />
      {label ?? t.common.status.viaWhatsApp}
    </span>
  );
}
