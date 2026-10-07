import { intlLocale, type Locale } from "./config";

/** Fills {placeholders}: format("Welcome, {name}", { name: "Awa" }). */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale]).format(value);
}

/** 15000 → "15,000 XAF" (en) / "15 000 XAF" (fr). XAF has no minor unit. */
export function formatXaf(amount: number, locale: Locale): string {
  return `${formatNumber(amount, locale)} XAF`;
}

/** How a currency is written for people: the CFA franc (XAF) is "FCFA" in Cameroon. */
export function currencyLabel(code: string): string {
  return code === "XAF" || code === "XOF" ? "FCFA" : code;
}
