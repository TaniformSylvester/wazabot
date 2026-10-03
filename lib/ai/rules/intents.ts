/*
 * What a short customer message is about, from keywords in English, French
 * and Cameroonian Pidgin — with typo tolerance (one letter off for words of 5+
 * letters, two for 9+), accents optional and SMS spellings ("bjr", "cmb").
 *
 * Deliberately conservative: anything that looks like an order, a complaint,
 * a request for a person or more than one question goes to Claude.
 */

export type RuleIntent = "greeting" | "thanks" | "hours" | "location" | "delivery" | "price" | "stock";

/** Lower case, no accents, apostrophes and punctuation → spaces. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const KEYWORDS: Record<RuleIntent, string[]> = {
  greeting: [
    "bonjour", "bonsoir", "salut", "coucou", "bjr", "bsr", "slt", "cc",
    "hello", "hi", "hey", "good morning", "good afternoon", "good evening", "morning", "evening",
    "how na", "how far", "how you dey", "how una dey", "hello ma", "hello sa",
  ],
  thanks: ["merci", "mrc", "merci beaucoup", "thanks", "thank you", "thx", "tnx", "tenki", "tanks", "tank you", "god bless"],
  hours: [
    "ouvert", "ouverts", "ouverte", "ouvrez", "ouvre", "ferme", "fermez", "fermes", "horaire", "horaires", "heure d ouverture", "heures d ouverture",
    "open", "opened", "opening", "close", "closed", "closing", "hours", "what time", "working hours",
    "una dey open", "wuna dey open", "una open", "which time",
  ],
  location: [
    "ou etes vous", "ou vous trouvez", "ou se trouve", "vous etes ou", "vous etes situes", "situe", "situes", "situee", "adresse", "localisation", "quartier", "ou est la boutique", "ou est votre boutique",
    "where are you", "where is", "located", "location", "address", "situated", "which side", "weh una dey", "where una dey", "for which side",
  ],
  delivery: ["livraison", "livrez", "livrer", "livre", "livres", "deliver", "delivery", "delivering", "bring am", "carry am come", "send am come", "transport"],
  price: ["prix", "combien", "coute", "coutent", "tarif", "cmb", "cb", "price", "how much", "cost", "costs", "na how much", "how much e be", "how much for"],
  stock: ["disponible", "dispo", "en stock", "vous avez", "avez vous", "il reste", "available", "in stock", "do you have", "still have", "you get", "una get", "wuna get", "e dey"],
};

/** Signs the message needs Claude (or a person): orders, complaints, problems, a human. */
const BLOCKERS = [
  "je prends", "je veux", "je voudrais", "commande", "commander", "acheter", "reserve", "reserver", "payer", "paye", "rendez vous", "rdv",
  "i want", "i ll take", "i will take", "order", "buy", "book", "pay", "paid", "appointment", "a wan", "i wan", "a go take",
  "probleme", "plainte", "rembourse", "remboursement", "pas recu", "retard", "arnaque", "parler", "humain", "patron", "manager", "responsable",
  "problem", "complain", "complaint", "refund", "not received", "late", "scam", "person", "human", "speak", "talk", "wahala", "vex",
  "photo", "picture", "image", "reduction", "reduce", "discount", "dernier prix", "last price", "promo",
];

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const tolerance = (word: string) => (word.length >= 9 ? 2 : word.length >= 5 ? 1 : 0);

/** A keyword (or phrase) appears in the message, allowing small typos in long words. */
export function hasKeyword(tokens: string[], normalised: string, keyword: string): boolean {
  if (keyword.includes(" ")) return ` ${normalised} `.includes(` ${keyword} `);
  return tokens.some((t) => t === keyword || (tolerance(keyword) > 0 && editDistance(t, keyword) <= tolerance(keyword)));
}

export type IntentResult = { intents: RuleIntent[]; blocked: boolean; tokens: string[]; normalised: string };

export function detectIntents(text: string): IntentResult {
  const normalised = normalise(text);
  const tokens = normalised.split(" ").filter(Boolean);
  const blocked = BLOCKERS.some((k) => hasKeyword(tokens, normalised, k)) || (text.match(/\?/g) ?? []).length > 1;
  const intents = (Object.keys(KEYWORDS) as RuleIntent[]).filter((intent) => KEYWORDS[intent].some((k) => hasKeyword(tokens, normalised, k)));
  return { intents, blocked, tokens, normalised };
}

/** Every keyword token, so product matching can ignore them ("combien", "dispo"…). */
export const INTENT_WORDS = new Set(Object.values(KEYWORDS).flatMap((list) => list.flatMap((k) => k.split(" "))));
