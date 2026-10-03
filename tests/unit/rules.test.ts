import { describe, expect, it } from "vitest";

import type { BusinessContext } from "@/lib/ai/context";
import { answerWithRules } from "@/lib/ai/rules";
import type { CatalogMatchItem } from "@/lib/ai/tools/prefetch";

const day = { closed: false, open: "08:00", close: "18:00" };
const business: BusinessContext = {
  business: {
    id: "b",
    name: "Awa Styles",
    description: null,
    industry: "fashion",
    city: "Douala",
    address: "Rue Joss, Akwa",
    phone: null,
    website: null,
    countryCode: "CM",
    currency: "XAF",
    timezone: "Africa/Douala",
    openingHours: { mon: day, tue: day, wed: day, thu: day, fri: day, sat: { closed: false, open: "09:00", close: "16:00" }, sun: { closed: true, open: "09:00", close: "13:00" } },
    openNow: true,
  },
  settings: { aiEnabled: true, tone: "friendly", replyLength: "short", greeting: "Bienvenue chez Awa Styles, la mode wax de Douala !", fallbackMessage: null, afterHoursMode: "reply_normally", afterHoursMessage: null, humanHandoverEnabled: true, salesMode: false, photoUnderstanding: true },
  language: { mode: "auto", defaultLanguage: "fr", enabledLanguages: ["fr", "en", "wes"] },
  style: { tone: "friendly", formality: "neutral", emojiLevel: "light", replyLength: "short", mirrorCodeSwitching: false, styleNotes: "" },
  faqs: [],
  documents: [{ type: "delivery", title: "Livraison", content: "Akwa, Bonanjo : 1 000 FCFA.\nBonamoussadi : 1 500 FCFA.\nBuea : 2 500 FCFA, 2 jours.\nAutres villes : nous contacter." }],
  activeProductCount: 3,
  booking: { enabled: false, services: [] },
};
const product = (id: string, name: string, price: number, extra: Partial<CatalogMatchItem> = {}): CatalogMatchItem => ({
  productId: id, name, description: null, category: null, price, currency: "XAF", inStock: true, hasPhoto: false, variants: [], ...extra,
});
const catalog = [
  product("p1", "Robe Ankara", 15000, { variants: [{ variantId: "v1", label: "Taille: M", price: 15000, inStock: true }, { variantId: "v2", label: "Taille: L", price: 16000, inStock: true }, { variantId: "v3", label: "Taille: S", price: 15000, inStock: false }] }),
  product("p2", "Sac en raphia", 8000, { inStock: false }),
  product("p3", "Black sneakers", 18000),
];
const ask = (text: string, language: "fr" | "en" | "wes" = "fr", over: Partial<BusinessContext> = {}) => answerWithRules({ text, language, business: { ...business, ...over }, catalog });

describe("rules layer: answered without Claude", () => {
  it("greetings and thanks, in each language (typos and SMS spelling too)", () => {
    expect(ask("Bonjour")).toMatchObject({ intent: "greeting", text: "Bienvenue chez Awa Styles, la mode wax de Douala !" });
    expect(ask("bjr madame")?.intent).toBe("greeting");
    expect(ask("Hello", "en")?.text).toBe("Hello! Welcome to Awa Styles. How can I help you?");
    expect(ask("How na", "wes")?.text).toBe("Hello! Welcome for Awa Styles. Wetin a fit do for you?");
    expect(ask("merci beaucoup !")?.intent).toBe("thanks");
    expect(ask("Tenki ma", "wes")?.text).toBe("No wahala! If you get any other question, just ask.");
  });

  it("opening hours, grouped, with whether it's open now", () => {
    expect(ask("Vous êtes ouverts aujourd'hui ?")?.text).toBe("Nos horaires : lundi–vendredi 08:00–18:00, samedi 09:00–16:00. Fermé : dimanche. En ce moment, c'est ouvert.");
    expect(ask("What time do you close?", "en")?.text).toBe("Our opening hours: Monday–Friday 08:00–18:00, Saturday 09:00–16:00. Closed: Sunday. We're open right now.");
    expect(ask("Una dey open for Sunday?", "wes")?.intent).toBe("hours");
    expect(ask("horraires svp")?.intent).toBe("hours"); // typo
  });

  it("location from the stored address", () => {
    expect(ask("Vous êtes situés où ?")?.text).toBe("Nous sommes à Rue Joss, Akwa, Douala.");
    expect(ask("Where are you located?", "en")?.text).toBe("We're at Rue Joss, Akwa, Douala.");
    expect(ask("Weh una dey?", "wes")?.text).toBe("We dey for Rue Joss, Akwa, Douala.");
    expect(ask("Vous êtes situés où ?", "fr", { business: { ...business.business, address: null, city: null } })).toBeNull();
  });

  it("a delivery fee only when the business wrote one for that place", () => {
    expect(ask("Livraison à Bonamoussadi c'est combien ?")?.text).toBe("Livraison : Bonamoussadi : 1 500 FCFA.");
    expect(ask("How much delivery for Buea?", "en")?.text).toBe("Delivery: Buea : 2 500 FCFA, 2 jours.");
    expect(ask("Vous livrez à Bafoussam ?")).toBeNull(); // no fee written for it
    expect(ask("Vous livrez ?")).toBeNull(); // no place
  });

  it("a product's price and stock when one product clearly matches", () => {
    expect(ask("Bonjour, c'est combien la robe Ankara ?")).toMatchObject({ intent: "price", text: "Robe Ankara : 15 000 FCFA. Disponible en : M, L (16 000 FCFA).", productIds: ["p1"] });
    expect(ask("How much for the black sneakers?", "en")?.text).toBe("Black sneakers: 18,000 FCFA.");
    expect(ask("How much for di sneakers?", "wes")?.text).toBe("Black sneakers na 18,000 FCFA.");
    expect(ask("le sac en raphia est dispo ?")?.text).toBe("Sac en raphia (8 000 FCFA) n'est plus disponible pour le moment.");
    expect(ask("prix robe ankara", "fr", { settings: { ...business.settings, salesMode: true } })?.text).toContain("Voulez-vous passer commande ?");
  });
});

describe("rules layer: left to Claude", () => {
  it.each([
    ["Je prends 2 robes Ankara", "an order"],
    ["c'est combien la robe ? et vous livrez à Buea ?", "two questions"],
    ["Ma commande n'est jamais arrivée", "a complaint"],
    ["Je veux parler à quelqu'un", "a person"],
    ["Dernier prix pour la robe Ankara ?", "bargaining"],
    ["C'est combien le pagne bleu ?", "no product matches"],
    ["Bonjour, je cherche un cadeau pour ma mère", "a greeting with a real question"],
    ["combien ?", "no product named"],
    ["Bonjour, vous faites des retouches sur les robes achetées ailleurs, et en combien de temps environ pour une robe de soirée longue ?", "too long"],
  ])("%s (%s)", (text) => {
    expect(ask(text)).toBeNull();
  });

  it("two products match as well → Claude asks which one", () => {
    const two = [product("a", "Robe wax rouge", 15000), product("b", "Robe wax bleue", 15000)];
    expect(answerWithRules({ text: "combien la robe wax ?", language: "fr", business, catalog: two })).toBeNull();
  });
});
