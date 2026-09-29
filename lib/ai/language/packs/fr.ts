import type { AiLanguagePack } from "./types";

export const fr: AiLanguagePack = {
  code: "fr",
  detection: {
    strong: [
      "bonjour", "bonsoir", "salut", "merci", "combien", "svp", "stp", "oui", "je", "vous", "est",
      "avez", "voulez", "veux", "voudrais", "pouvez", "peux", "livraison", "livrer", "disponible", "demain",
      "taille", "prix", "quel", "quelle", "quels", "pourquoi", "comment", "aussi", "tres", "beaucoup",
      "commande", "commander", "acheter", "payer", "cette", "ces", "avec", "dans", "sont", "nous", "mais",
      "aujourd'hui", "encore", "votre", "vos", "bien", "madame", "monsieur",
    ],
    common: ["le", "la", "les", "de", "des", "du", "un", "une", "et", "pour", "sur", "mon", "mes", "ton", "ta", "il", "elle", "ce", "ca", "qui", "que", "quoi", "ne", "pas", "plus", "au", "aux"],
    phrases: ["s'il vous plait", "s'il te plait", "c'est combien", "est ce que", "je veux", "je voudrais", "vous avez", "il y a", "a quelle heure"],
    characters: /[àâçéèêëîïôûùüÿœ]/g,
  },
  names: ["french", "francais", "franssai", "fransai", "french language"],
  promptGuidance:
    "Write natural French as it is used in Cameroon, with standard spelling and correct accents. Write prices as in the business data, e.g. \"15 000 FCFA\". Do not translate product or brand names.",
  formality: {
    formal: "Always use \"vous\" and polite forms (e.g. \"Bonjour Madame / Monsieur\", \"je vous en prie\").",
    neutral: "Use \"vous\".",
    informal: "Use \"vous\" by default; use \"tu\" only if the customer writes to you with \"tu\".",
  },
  messages: {
    handoff: "Merci ! J'ai transmis votre message à l'équipe de {business}. Quelqu'un vous répondra ici très bientôt.",
    unavailable:
      "Désolé, nous ne pouvons pas répondre automatiquement pour le moment. L'équipe de {business} vous recontactera très vite.",
    languageSwitched: "Bien sûr — je continue en français.",
  },
  review: "needs-review",
};
