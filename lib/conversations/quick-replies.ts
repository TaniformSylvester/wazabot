/*
 * 1-tap quick replies in a WhatsApp conversation, by business type (shop,
 * restaurant, school), written in the conversation's language (French or
 * English).
 *
 * A reply that is complete as written is sent on tap ("send"). One that needs
 * a fact WazaBolt doesn't hold — payment details, a delivery time, fees not
 * entered yet — is put in the reply box as a draft with a [gap] to fill: it
 * is never sent with something invented. A school's fee schedule is built
 * from its real fee items when there are some (still a draft, to check).
 */

export type QuickReplyKey =
  | "payment"
  | "inStock"
  | "deliveryEta"
  | "orderConfirmed"
  | "readyForPickup"
  | "outForDelivery"
  | "feeSchedule"
  | "campusVisit"
  | "admissionsCall";

export type QuickReply = { key: QuickReplyKey; text: string; send: boolean };

export const QUICK_REPLY_KEYS: Record<"shop" | "restaurant" | "school", QuickReplyKey[]> = {
  shop: ["payment", "inStock", "deliveryEta"],
  restaurant: ["orderConfirmed", "readyForPickup", "outForDelivery"],
  school: ["feeSchedule", "campusVisit", "admissionsCall"],
};

type Lang = "en" | "fr";
const TEXT: Record<Exclude<QuickReplyKey, "feeSchedule">, { send: boolean } & Record<Lang, string>> = {
  payment: {
    send: false,
    en: "You can pay by [mobile money number or bank details]. Please send us the payment reference once it's done, and we'll confirm your order as soon as we receive it.",
    fr: "Vous pouvez payer par [numéro mobile money ou coordonnées bancaires]. Envoyez-nous la référence du paiement une fois fait : nous confirmerons votre commande dès réception.",
  },
  inStock: {
    send: true,
    en: "Good news — it's in stock. Would you like us to keep one for you?",
    fr: "Bonne nouvelle — c'est en stock. Voulez-vous qu'on vous en garde un ?",
  },
  deliveryEta: {
    send: false,
    en: "Your order is on its way — it should arrive around [time].",
    fr: "Votre commande est en route — elle devrait arriver vers [heure].",
  },
  orderConfirmed: {
    send: true,
    en: "Your order is confirmed — we're preparing it now.",
    fr: "Votre commande est confirmée — nous la préparons.",
  },
  readyForPickup: {
    send: true,
    en: "Your order is ready for pickup.",
    fr: "Votre commande est prête, vous pouvez venir la chercher.",
  },
  outForDelivery: {
    send: true,
    en: "Your order is out for delivery.",
    fr: "Votre commande est en cours de livraison.",
  },
  campusVisit: {
    send: true,
    en: "We'd be glad to show you around the school. Which day and time suit you for a campus visit?",
    fr: "Nous serions ravis de vous faire visiter l'école. Quel jour et quelle heure vous conviennent ?",
  },
  admissionsCall: {
    send: true,
    en: "Thank you — our admissions team will call you shortly.",
    fr: "Merci — notre équipe des admissions va vous appeler très bientôt.",
  },
};

/** The business type's three quick replies (any other type: the shop's). */
export function quickReplies(
  industry: string | null,
  language: string | null,
  fees?: { year: string; items: { name: string; amount: string }[] },
): QuickReply[] {
  const vertical = industry === "restaurant" ? "restaurant" : industry === "school" ? "school" : "shop";
  const lang: Lang = language === "fr" ? "fr" : "en";
  return QUICK_REPLY_KEYS[vertical].map((key) => {
    if (key === "feeSchedule") {
      if (fees?.items.length) {
        const head = lang === "fr" ? `Voici nos frais de scolarité pour ${fees.year} :` : `Here is our fee schedule for ${fees.year}:`;
        return { key, send: false, text: [head, ...fees.items.map((f) => `• ${f.name}: ${f.amount}`)].join("\n") };
      }
      return {
        key,
        send: false,
        text: lang === "fr" ? "Voici nos frais de scolarité : inscription [montant], scolarité [montant] par trimestre." : "Here is our fee schedule: registration [amount], tuition [amount] per term.",
      };
    }
    const t = TEXT[key];
    return { key, send: t.send, text: t[lang] };
  });
}

/** Where the first [gap] is, to select it in the reply box. */
export function firstGap(text: string): { start: number; end: number } | null {
  const m = /\[[^\]]+\]/.exec(text);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}
