import { intlLocale, type Locale } from "./config";

/** Fills {placeholders}: format("Welcome, {name}", { name: "Awa" }). */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale]).format(value);
}

/** 7500 → "7,500 FCFA" (en) / "7 500 FCFA" (fr; a non-breaking space, so the price never splits). XAF has no minor unit. */
export function formatXaf(amount: number, locale: Locale): string {
  // French groups thousands with a narrow space, which some fonts draw almost invisibly ("7500"): use a full non-breaking space.
  return `${formatNumber(amount, locale).replace(/\u202f/g, "\u00a0")}\u00a0FCFA`;
}

/** How a currency is written for people: the CFA franc (XAF) is "FCFA" in Cameroon. */
export function currencyLabel(code: string): string {
  return code === "XAF" || code === "XOF" ? "FCFA" : code;
}
