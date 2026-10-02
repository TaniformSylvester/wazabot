import type { AiLanguagePack } from "./types";

/**
 * Cameroonian Pidgin English (Kamtok, ISO 639-3 `wes`). Customers write it
 * with English spelling mixed with Pidgin forms, so it borrows from the
 * English pack as its lexifier. Distinct from Nigerian Pidgin (`pcm`).
 */
export const wes: AiLanguagePack = {
  code: "wes",
  detection: {
    strong: [
      "abeg", "wuna", "una", "weti", "wetin", "wetti", "sabi", "pikin", "komot", "tenki", "ashia", "mimba",
      "dis", "dat", "dem", "wey", "sef", "oya", "wahala", "moni", "sotey", "sotai", "bifo", "massa", "waka",
      "kam", "tok", "ansa", "di", "nyanga", "chop", "ndutu", "sep", "tchop",
    ],
    common: ["na", "fit", "don", "ma", "ya", "yi", "dey", "e", "plenty", "dash"],
    phrases: [
      "a di", "i di", "we di", "e di", "you di", "a don", "i don", "e don", "no be", "na so", "na wa", "e be",
      "a fit", "i fit", "you fit", "u fit", "no fit", "weti be", "how e di", "how na", "wuna get", "you get am",
      "make i", "make you", "small small", "one time", "ya own", "ma own", "how much e be", "na how much",
    ],
    lexifier: "en",
  },
  names: ["pidgin", "pidjin", "pigin", "pidgin english", "kamtok", "broken english"],
  promptGuidance: [
    "Write Cameroonian Pidgin English (Kamtok) the way Cameroonians write it on WhatsApp — not Nigerian Pidgin.",
    "Use Cameroonian forms: \"di\" for ongoing actions (\"a di come\", \"we di sell\"), \"don\" for finished actions, \"weti\" for what, \"wuna\" for you (plural), \"ma\" for my, \"ya\" for your, \"na\" for is/it's, \"fit\" for can, \"abeg\" for please, \"tenki\" for thank you.",
    "Keep sentences short and easy to read.",
    "Never exaggerate or caricature Pidgin and never joke about how the customer writes.",
    "Prices, numbers, dates, addresses and product names must be exactly as in the business data.",
    "If a detail (a policy, payment or delivery condition) risks being misunderstood in Pidgin, state that detail in simple English inside the Pidgin reply.",
  ].join(" "),
  formality: {
    formal: "Respectful Pidgin: address the customer as \"Ma\" or \"Sa\", no slang beyond everyday Pidgin.",
    neutral: "Everyday, friendly Pidgin.",
    informal: "Relaxed Pidgin, the way friends chat, still respectful.",
  },
  messages: {
    handoff: "Tenki! A don pass ya message give di {business} team. Somebody go answer you for here soon.",
    unavailable: "Ashia, we no fit answer you automatic now. Di {business} team go come back to you soon.",
    languageSwitched: "No wahala — a go continue for Pidgin.",
    audioNotSupported: "Ashia, a no fit listen voice note now. Abeg, you fit write ya message? Di {business} team fit listen am too.",
    imageNotSupported: "Tenki for di picture! A no fit open am, so a don send am give di {business} team. Dem go answer you for here soon.",
    attachmentReceived: "Tenki, we don receive am. Di {business} team go check am and answer you for here soon.",
  },
  review: "needs-review",
};
