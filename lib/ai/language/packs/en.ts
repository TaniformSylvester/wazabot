import type { AiLanguagePack } from "./types";

export const en: AiLanguagePack = {
  code: "en",
  detection: {
    strong: [
      "the", "what", "this", "these", "those", "please", "pls", "plz", "thanks", "thank", "would", "could",
      "should", "does", "is", "are", "was", "were", "it's", "i'm", "don't", "can't", "hello", "hi", "hey",
      "which", "their", "there", "they", "available", "delivery", "yes", "morning", "evening", "want", "much",
    ],
    common: [
      "how", "have", "you", "your", "can", "do", "i", "my", "me", "for", "need", "price", "order", "size",
      "today", "tomorrow", "deliver", "when", "where", "and", "to", "it", "of", "in", "get", "send", "buy",
      "pay", "good", "still", "many", "color", "colour", "with", "about", "here", "now",
    ],
    phrases: ["how much", "do you have", "is it available", "thank you", "good morning", "good afternoon", "i want to", "can i"],
  },
  names: ["english", "anglais", "inglish", "inglis"],
  promptGuidance:
    "Write clear, simple English as it is used in Cameroon. Avoid idioms and slang the customer may not know. Write prices as in the business data, e.g. \"15,000 FCFA\".",
  formality: {
    formal: "Polite and professional: full sentences, no slang; greet with \"Good morning\" / \"Good afternoon\".",
    neutral: "Polite and friendly.",
    informal: "Relaxed and conversational, still respectful.",
  },
  messages: {
    handoff: "Thanks! I've passed your message to the {business} team. Someone will reply to you here soon.",
    unavailable: "Sorry, we can't reply automatically right now. The {business} team will get back to you soon.",
    languageSwitched: "Sure — I'll continue in English.",
    audioNotSupported: "Sorry, I can't listen to voice notes yet. Could you type your message? The {business} team can also listen to it.",
    imageNotSupported: "Thanks for the picture! I couldn't open it, so I've passed it to the {business} team — they'll reply here soon.",
    attachmentReceived: "Thanks, we've received it. The {business} team will check it and reply here soon.",
  },
  review: "source",
};
