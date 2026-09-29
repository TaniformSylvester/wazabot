"use client";

import { createContext, useContext, useMemo } from "react";

import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import type { Messages } from "@/messages/en";

/** The parts of the dictionary Client Components need on every page. */
export type ClientMessages = Pick<Messages, "common" | "auth">;

type I18nContextValue = {
  locale: Locale;
  t: ClientMessages;
  /** Locale-prefixed link: href("/pricing") → "/fr/pricing". */
  href: (path: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: ClientMessages; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: messages, href: (path: string) => localizePath(locale, path) }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
