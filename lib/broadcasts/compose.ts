/*
 * Broadcast texts (Stage 8). The business writes the message; WazaBolt adds
 * an optional greeting with the customer's name ({{1}}) and always the
 * opt-out line, which Meta and good practice require for promotions.
 */

export type BroadcastLanguage = "en" | "fr";

const GREETING: Record<BroadcastLanguage, string> = { en: "Hello {{1}},", fr: "Bonjour {{1}}," };
export const OPT_OUT_LINE: Record<BroadcastLanguage, string> = {
  en: "Reply STOP to stop receiving promotions.",
  fr: "Répondez STOP pour ne plus recevoir de promotions.",
};
export const MAX_BROADCAST_TEXT = 900;

/** The template body submitted to Meta. */
export function composeBroadcastBody(text: string, language: BroadcastLanguage, personalized: boolean) {
  // Parameters are WazaBolt's to place: braces typed by the business are removed.
  const clean = text.replace(/[{}]/g, "").trim();
  return [personalized ? `${GREETING[language]} ${clean}` : clean, OPT_OUT_LINE[language]].join("\n\n");
}

/** What a given customer receives (for previews and the conversation record). */
export function renderBroadcast(body: string, customerName: string) {
  return body.replace("{{1}}", customerName);
}

/** Meta template name for a broadcast (unique per business). */
export const broadcastTemplateName = (broadcastId: string) => `wazabolt_bc_${broadcastId.replace(/-/g, "").slice(0, 16)}`;

// ---------------------------------------------------------------------------
// STOP / START keywords (a whole message, any case, accents and punctuation ignored)
// ---------------------------------------------------------------------------
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const STOP = new Set(["stop", "stop promo", "stop promos", "stop pub", "arret", "arreter", "unsubscribe", "desabonner", "desabonnement", "se desabonner"]);
const START = new Set(["start", "start promo", "start promos", "abonner", "s abonner", "subscribe"]);

export function optKeyword(text: string): "stop" | "start" | null {
  const t = normalize(text);
  if (STOP.has(t)) return "stop";
  if (START.has(t)) return "start";
  return null;
}

export const OPT_REPLY: Record<"stop" | "start", Record<BroadcastLanguage, string>> = {
  stop: {
    en: "Done — you won't receive promotions from {business} any more. Reply START if you change your mind.",
    fr: "C'est noté — vous ne recevrez plus de promotions de {business}. Répondez START si vous changez d'avis.",
  },
  start: {
    en: "Thanks! You'll receive news and promotions from {business}. Reply STOP at any time to stop.",
    fr: "Merci ! Vous recevrez les nouveautés et promotions de {business}. Répondez STOP à tout moment pour arrêter.",
  },
};
