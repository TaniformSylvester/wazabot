/*
 * WazaBolt's standard customer notifications (Stage 7), as WhatsApp message
 * templates. Each kind has a body per language with numbered parameters
 * ({{1}}, {{2}} …) filled at send time. Inside the 24-hour window the same
 * text is sent as a normal message, so customers always read the same words.
 *
 * Meta's rules followed here: category UTILITY, a body that doesn't start or
 * end with a parameter, no two parameters side by side, example values given.
 */

export const NOTIFICATION_KINDS = [
  "order_confirmed",
  "order_ready",
  "order_out_for_delivery",
  "order_delivered",
  "appointment_booked",
  "appointment_reminder",
  "appointment_cancelled",
  "follow_up",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const TEMPLATE_LANGUAGES = ["en", "fr"] as const;
export type TemplateLanguage = (typeof TEMPLATE_LANGUAGES)[number];

type Def = { params: readonly string[]; example: readonly string[]; body: Record<TemplateLanguage, string> };

/** Parameter names, in {{n}} order. */
export const TEMPLATES: Record<NotificationKind, Def> = {
  order_confirmed: {
    params: ["customer", "business", "order", "total"],
    example: ["Brenda", "Awa Styles", "ORD-00012", "30,000 XAF"],
    body: {
      en: "Hello {{1}}, {{2}} has confirmed your order {{3}}. Total: {{4}}. We'll let you know when it's ready.",
      fr: "Bonjour {{1}}, {{2}} a confirmé votre commande {{3}}. Total : {{4}}. Nous vous préviendrons dès qu'elle sera prête.",
    },
  },
  order_ready: {
    params: ["customer", "order", "business"],
    example: ["Brenda", "ORD-00012", "Awa Styles"],
    body: {
      en: "Hello {{1}}, your order {{2}} at {{3}} is ready.",
      fr: "Bonjour {{1}}, votre commande {{2}} chez {{3}} est prête.",
    },
  },
  order_out_for_delivery: {
    params: ["customer", "order", "business"],
    example: ["Brenda", "ORD-00012", "Awa Styles"],
    body: {
      en: "Hello {{1}}, your order {{2}} from {{3}} is on its way.",
      fr: "Bonjour {{1}}, votre commande {{2}} de {{3}} est en cours de livraison.",
    },
  },
  order_delivered: {
    params: ["customer", "order", "business"],
    example: ["Brenda", "ORD-00012", "Awa Styles"],
    body: {
      en: "Hello {{1}}, your order {{2}} from {{3}} has been delivered. Thank you!",
      fr: "Bonjour {{1}}, votre commande {{2}} de {{3}} a été livrée. Merci !",
    },
  },
  appointment_booked: {
    params: ["customer", "service", "business", "when"],
    example: ["Grace", "Tresses", "Salon Grace", "Sat 3 Oct, 10:00"],
    body: {
      en: "Hello {{1}}, your appointment for {{2}} at {{3}} is booked for {{4}}. Reply here if you need to change it.",
      fr: "Bonjour {{1}}, votre rendez-vous pour {{2}} chez {{3}} est réservé le {{4}}. Répondez ici pour le modifier.",
    },
  },
  appointment_reminder: {
    params: ["customer", "service", "business", "when"],
    example: ["Grace", "Tresses", "Salon Grace", "Sat 3 Oct, 10:00"],
    body: {
      en: "Hello {{1}}, a reminder of your appointment for {{2}} at {{3}} on {{4}}. Reply here if you need to change it.",
      fr: "Bonjour {{1}}, rappel de votre rendez-vous pour {{2}} chez {{3}} le {{4}}. Répondez ici pour le modifier.",
    },
  },
  appointment_cancelled: {
    params: ["customer", "service", "business", "when"],
    example: ["Grace", "Tresses", "Salon Grace", "Sat 3 Oct, 10:00"],
    body: {
      en: "Hello {{1}}, your appointment for {{2}} at {{3}} on {{4}} has been cancelled. Reply here to book another time.",
      fr: "Bonjour {{1}}, votre rendez-vous pour {{2}} chez {{3}} le {{4}} a été annulé. Répondez ici pour choisir un autre moment.",
    },
  },
  follow_up: {
    params: ["customer", "business"],
    example: ["Brenda", "Awa Styles"],
    body: {
      en: "Hello {{1}}, {{2}} has a reply to your message. Reply here to continue the conversation.",
      fr: "Bonjour {{1}}, {{2}} a une réponse à votre message. Répondez ici pour continuer la conversation.",
    },
  },
};

/** Meta template name for a kind (one name, one template per language). */
export const templateName = (kind: NotificationKind) => `wazabolt_${kind}`;

/** Fills {{1}}, {{2}} … with values (named by TEMPLATES[kind].params). */
export function renderBody(kind: NotificationKind, language: TemplateLanguage, values: Record<string, string>) {
  const def = TEMPLATES[kind];
  return def.body[language].replace(/\{\{(\d+)\}\}/g, (_, n: string) => values[def.params[Number(n) - 1]] ?? "");
}

/** Parameter values in {{n}} order, for the template API (never empty: WhatsApp rejects blank parameters). */
export function bodyParams(kind: NotificationKind, values: Record<string, string>) {
  return TEMPLATES[kind].params.map((p) => (values[p] ?? "").trim() || "-");
}

/** Notification language from the customer's (fr → French; English, Pidgin or unknown → English). */
export function templateLanguageFor(customerLanguage: string | null | undefined, businessDefault: string): TemplateLanguage {
  const lang = customerLanguage ?? businessDefault;
  return lang === "fr" ? "fr" : "en";
}
