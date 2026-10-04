import type { BusinessContext } from "@/lib/ai/context";
import type { CatalogMatchItem } from "@/lib/ai/tools/prefetch";
import { WEEKDAYS, type Weekday } from "@/lib/business/hours";
import type { LanguageCode } from "@/lib/i18n/languages";

import { INTENT_WORDS, detectIntents, hasKeyword, normalise, type RuleIntent } from "./intents";

/*
 * The rules layer: short, single questions answered from the business's own
 * data without Claude — greetings, thanks, opening hours, location, a
 * delivery fee the business wrote for that place, a product's price or
 * stock. Every answer is built from stored facts (nothing is guessed); when
 * in doubt it returns null and Claude answers.
 */

export type RuleAnswer = { intent: RuleIntent; text: string; productIds: string[] };

type Input = {
  text: string;
  language: LanguageCode;
  business: BusinessContext;
  /** Products matching the conversation (lib/ai/tools/prefetch.ts). */
  catalog: CatalogMatchItem[];
  /** Longest message the rules try (saver mode leans more on them). */
  maxChars?: number;
};

/** Longer messages usually say more than one thing: leave them to Claude. */
const MAX_RULE_CHARS = 160;

export function answerWithRules({ text, language, business, catalog, maxChars = MAX_RULE_CHARS }: Input): RuleAnswer | null {
  if (!text.trim() || text.length > maxChars) return null;
  const { intents, blocked, tokens } = detectIntents(text);
  if (blocked || !intents.length) return null;
  // "Bonjour, c'est combien … ?" is a price question; price + stock is one product question;
  // "livraison … combien ?" asks for the delivery fee.
  const asked = intents.filter((i) => i !== "greeting" && i !== "thanks");
  const main: RuleIntent | null =
    asked.length === 0
      ? intents.includes("thanks") ? "thanks" : "greeting"
      : asked.length === 1
        ? asked[0]
        : asked.every((i) => i === "price" || i === "stock")
          ? "price"
          : asked.includes("delivery") && asked.every((i) => i === "delivery" || i === "price")
            ? "delivery"
            : null;
  if (!main) return null;
  // A greeting or thanks with anything else we didn't recognise ("bonjour, je cherche un cadeau") → Claude.
  if ((main === "greeting" || main === "thanks") && tokens.some((t) => !INTENT_WORDS.has(t) && !FILLER.has(t))) return null;

  const t = TEXT[language];
  const b = business.business;
  switch (main) {
    case "greeting": {
      const own = business.settings.greeting?.trim();
      // The owner's own greeting is written in their default language.
      return { intent: main, text: own && language === business.language.defaultLanguage ? own : t.greeting(b.name), productIds: [] };
    }
    case "thanks":
      return { intent: main, text: t.thanks, productIds: [] };
    case "hours": {
      const lines = hoursSummary(business, language);
      if (!lines) return null;
      const now = b.openNow === null ? "" : ` ${b.openNow ? t.openNow : t.closedNow}`;
      return { intent: main, text: `${t.hours(lines)}${now}`, productIds: [] };
    }
    case "location": {
      const where = [b.address, b.city].filter(Boolean).join(", ");
      if (!where) return null;
      return { intent: main, text: t.location(where), productIds: [] };
    }
    case "delivery": {
      const line = deliveryLine(business, tokens);
      return line ? { intent: main, text: t.delivery(line), productIds: [] } : null;
    }
    case "price":
    case "stock": {
      const product = singleProduct(catalog, tokens);
      if (!product) return null;
      return { intent: main, text: productAnswer(product, language, business.settings.salesMode), productIds: [product.productId] };
    }
  }
}

/** Words that may surround a greeting or thanks without changing it ("hello ma", "merci beaucoup !"). */
const FILLER = new Set(["ma", "sa", "madame", "monsieur", "mr", "mme", "boss", "bro", "sis", "tout", "le", "monde", "a", "vous", "toi", "you", "all", "so", "much", "very", "beaucoup", "bien", "ok", "okay", "d", "accord", "oh", "o", "ooh", "dear", "my", "friend", "la", "team", "equipe"]);

// ---------------------------------------------------------------------------
// Opening hours: consecutive days with the same hours are grouped.
// ---------------------------------------------------------------------------
function hoursSummary(business: BusinessContext, language: LanguageCode): string | null {
  const days = TEXT[language].days;
  const h = business.business.openingHours;
  if (!WEEKDAYS.some((d) => h[d])) return null;
  const key = (d: Weekday) => {
    const x = h[d];
    return !x ? "unset" : x.closed ? "closed" : `${x.open}–${x.close}`;
  };
  const groups: { from: Weekday; to: Weekday; key: string }[] = [];
  for (const d of WEEKDAYS) {
    const last = groups.at(-1);
    if (last && last.key === key(d)) last.to = d;
    else groups.push({ from: d, to: d, key: key(d) });
  }
  const open = groups.filter((g) => g.key !== "closed" && g.key !== "unset").map((g) => `${g.from === g.to ? days[g.from] : `${days[g.from]}–${days[g.to]}`} ${g.key}`);
  const closed = groups.filter((g) => g.key === "closed").flatMap((g) => WEEKDAYS.slice(WEEKDAYS.indexOf(g.from), WEEKDAYS.indexOf(g.to) + 1).map((d) => days[d]));
  if (!open.length) return null;
  return `${open.join(", ")}.${closed.length ? ` ${TEXT[language].closedOn(closed.join(", "))}` : ""}`;
}

// ---------------------------------------------------------------------------
// Delivery: a line the business wrote that names the customer's place and a fee.
// ---------------------------------------------------------------------------
const AMOUNT = /\d[\d\s.,]*\s?(fcfa|xaf|cfa|f\b|francs?)/i;

function deliveryLine(business: BusinessContext, tokens: string[]): string | null {
  const places = tokens.filter((tk) => tk.length >= 3 && !INTENT_WORDS.has(tk) && !PLACE_STOP.has(tk));
  if (!places.length) return null;
  const lines = business.documents
    .filter((d) => d.type === "delivery")
    .flatMap((d) => d.content.split(/\n|(?<=[.;])\s+/))
    .map((l) => l.trim())
    .filter((l) => l && l.length <= 200 && AMOUNT.test(l));
  const hits = lines.filter((l) => {
    const n = normalise(l);
    return places.some((p) => ` ${n} `.includes(` ${p} `));
  });
  // Exactly one line: anything else (no fee written for that place, or several) is Claude's / the team's call.
  return hits.length === 1 ? hits[0] : null;
}
const PLACE_STOP = new Set(["vous", "est", "les", "des", "pour", "the", "for", "you", "una", "wuna", "and", "combien", "how", "much", "quel", "quelle", "what", "can", "fit"]);

// ---------------------------------------------------------------------------
// Price / stock: one product clearly matches the words the customer used.
// ---------------------------------------------------------------------------
function singleProduct(catalog: CatalogMatchItem[], tokens: string[]): CatalogMatchItem | null {
  const words = tokens.filter((tk) => tk.length >= 3 && !INTENT_WORDS.has(tk) && !PRODUCT_STOP.has(tk));
  if (!words.length || !catalog.length) return null;
  const scored = catalog
    .map((p) => {
      const nameTokens = normalise(p.name).split(" ");
      const name = normalise(p.name);
      const matched = words.filter((w) => hasKeyword(nameTokens, name, w) || nameTokens.some((n) => n.length >= 4 && (n.startsWith(w) || w.startsWith(n)))).length;
      return { p, matched };
    })
    .sort((a, b) => b.matched - a.matched);
  const [top, second] = scored;
  // Every product word the customer used is in its name, and no other product does as well.
  if (!top || top.matched === 0 || top.matched < words.length || (second && second.matched === top.matched)) return null;
  return top.p;
}
const PRODUCT_STOP = new Set([
  "les", "des", "une", "est", "pour", "avec", "vous", "votre", "cette", "ces", "encore", "taille", "couleur", "modele",
  "the", "for", "you", "your", "this", "that", "any", "size", "color", "colour", "una", "wuna", "dis", "dat", "still",
]);

function money(amount: number, currency: string, language: LanguageCode) {
  const n = new Intl.NumberFormat(language === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 0 }).format(amount).replace(/ | /g, " ");
  return `${n} ${currency === "XAF" ? "FCFA" : currency}`;
}

function productAnswer(p: CatalogMatchItem, language: LanguageCode, salesMode: boolean) {
  const t = TEXT[language];
  const price = money(p.price, p.currency, language);
  const variants = p.variants.filter((v) => v.inStock !== false).map((v) => (v.label.split(": ")[1] ?? v.label) + (v.price !== p.price ? ` (${money(v.price, p.currency, language)})` : ""));
  const out = p.inStock === false && !variants.length;
  const parts = [out ? t.outOfStock(p.name, price) : t.price(p.name, price)];
  if (!out && p.variants.length && variants.length) parts.push(t.options(variants.join(", ")));
  if (!out && salesMode) parts.push(t.orderPrompt);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Wording, per reply language.
// ---------------------------------------------------------------------------
type Wording = {
  greeting: (business: string) => string;
  thanks: string;
  hours: (lines: string) => string;
  closedOn: (days: string) => string;
  openNow: string;
  closedNow: string;
  location: (where: string) => string;
  delivery: (line: string) => string;
  price: (name: string, price: string) => string;
  outOfStock: (name: string, price: string) => string;
  options: (list: string) => string;
  orderPrompt: string;
  days: Record<Weekday, string>;
};

const EN_DAYS: Record<Weekday, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

const TEXT: Record<LanguageCode, Wording> = {
  fr: {
    greeting: (b) => `Bonjour ! Bienvenue chez ${b}. Comment puis-je vous aider ?`,
    thanks: "Avec plaisir ! N'hésitez pas si vous avez une autre question.",
    hours: (l) => `Nos horaires : ${l}`,
    closedOn: (d) => `Fermé : ${d}.`,
    openNow: "En ce moment, c'est ouvert.",
    closedNow: "En ce moment, c'est fermé.",
    location: (w) => `Nous sommes à ${w}.`,
    delivery: (l) => `Livraison : ${l}`,
    price: (n, p) => `${n} : ${p}.`,
    outOfStock: (n, p) => `${n} (${p}) n'est plus disponible pour le moment.`,
    options: (l) => `Disponible en : ${l}.`,
    orderPrompt: "Voulez-vous passer commande ?",
    days: { mon: "lundi", tue: "mardi", wed: "mercredi", thu: "jeudi", fri: "vendredi", sat: "samedi", sun: "dimanche" },
  },
  en: {
    greeting: (b) => `Hello! Welcome to ${b}. How can I help you?`,
    thanks: "You're welcome! Let me know if you need anything else.",
    hours: (l) => `Our opening hours: ${l}`,
    closedOn: (d) => `Closed: ${d}.`,
    openNow: "We're open right now.",
    closedNow: "We're closed right now.",
    location: (w) => `We're at ${w}.`,
    delivery: (l) => `Delivery: ${l}`,
    price: (n, p) => `${n}: ${p}.`,
    outOfStock: (n, p) => `${n} (${p}) is out of stock for now.`,
    options: (l) => `Available in: ${l}.`,
    orderPrompt: "Would you like to order?",
    days: EN_DAYS,
  },
  wes: {
    greeting: (b) => `Hello! Welcome for ${b}. Wetin a fit do for you?`,
    thanks: "No wahala! If you get any other question, just ask.",
    hours: (l) => `We dey open: ${l}`,
    closedOn: (d) => `We no dey open: ${d}.`,
    openNow: "We dey open now.",
    closedNow: "We don close now.",
    location: (w) => `We dey for ${w}.`,
    delivery: (l) => `Delivery: ${l}`,
    price: (n, p) => `${n} na ${p}.`,
    outOfStock: (n, p) => `${n} (${p}) no dey for now.`,
    options: (l) => `E dey for: ${l}.`,
    orderPrompt: "You wan order am?",
    days: EN_DAYS,
  },
};
