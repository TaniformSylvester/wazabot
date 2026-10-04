import type { LanguageCode } from "@/lib/i18n/languages";

import type { Industry, SimBusiness } from "./businesses";
import type { ScriptKind } from "./fake-claude";

/*
 * Customer messages for the simulation, in English, French and Cameroonian
 * Pidgin, and the shapes conversations take per industry (a quick price
 * question, an order, a complaint…). Placeholders: {p} a product as the
 * customer calls it, {P} the same capitalised, {place} an area, {service} a
 * salon service.
 */

type Pool = Partial<Record<LanguageCode, string[]>>;

const COMMON: Record<"greet" | "price" | "stock" | "hours" | "location" | "delivery" | "address" | "confirm" | "thanks" | "emoji", Pool> = {
  greet: {
    fr: ["Bonjour", "Bonsoir", "Bonjour madame", "Slt", "Bonjour 🙏🏾"],
    en: ["Hello", "Good morning", "Hi", "Good evening", "Hello ma"],
    wes: ["How na", "Morning ma", "Hello sa", "How far", "Good morning o"],
  },
  price: {
    fr: ["C'est combien {p} ?", "{P} c'est à combien svp ?", "Le prix de {p} svp", "{P} coûte combien ?", "Cmb {p}"],
    en: ["How much is {p}?", "Price for {p} please", "How much for {p}?", "What's the price of {p}?"],
    wes: ["{P} na how much?", "How much e be for {p}?", "Na how much for {p}?", "Abeg how much {p}?"],
  },
  stock: {
    fr: ["{P} est disponible ?", "Vous avez encore {p} ?", "Il reste {p} ?"],
    en: ["Do you have {p}?", "Is {p} available?", "{P} still available?"],
    wes: ["Una get {p}?", "{P} still dey?", "You get {p}?"],
  },
  hours: {
    fr: ["Vous êtes ouverts aujourd'hui ?", "Vous fermez à quelle heure ?", "Quels sont vos horaires ?"],
    en: ["What time do you close?", "Are you open today?", "What are your opening hours?"],
    wes: ["Una dey open today?", "Which time una dey close?"],
  },
  location: {
    fr: ["Vous êtes situés où ?", "Où se trouve la boutique ?", "C'est où exactement ?"],
    en: ["Where are you located?", "What's your address?", "Where is the shop exactly?"],
    wes: ["Weh una dey?", "For which side una dey?"],
  },
  delivery: {
    fr: ["Vous livrez à {place} ?", "La livraison à {place} c'est combien ?", "Vous pouvez livrer à {place} aujourd'hui ?"],
    en: ["Do you deliver to {place}?", "How much is delivery to {place}?", "Can you deliver to {place} today?"],
    wes: ["Una fit bring am for {place}?", "Delivery for {place} na how much?"],
  },
  address: {
    fr: ["Livrez à {place}, près de la pharmacie", "À {place}, je vous envoie la localisation", "{place}, derrière l'école publique"],
    en: ["Deliver to {place}, near the pharmacy", "{place}, behind the school", "{place}, I'll send my location"],
    wes: ["Bring am for {place}, near di junction", "{place}, behind di church"],
  },
  confirm: {
    fr: ["Oui", "Ok", "D'accord", "Oui svp", "C'est bon"],
    en: ["Yes", "Ok", "Yes please", "Alright"],
    wes: ["Yes o", "Ok na", "E fine"],
  },
  thanks: {
    fr: ["Merci", "Merci beaucoup", "Ok merci", "Merci bien"],
    en: ["Thanks", "Thank you", "Ok thanks", "Thank you so much"],
    wes: ["Tenki", "Tank you", "Ok tenki o", "God bless"],
  },
  emoji: { fr: ["👍", "🙏🏾", "👍🏾👍🏾", "😊"], en: ["👍", "🙏🏾", "😊", "❤️"], wes: ["👍", "🙏🏾", "😂😂", "👍🏾"] },
};

const BY_INDUSTRY: Record<Industry, Partial<Record<"browse" | "detail" | "order" | "booking" | "visit" | "complaint", Pool>>> = {
  retail: {
    browse: {
      fr: ["Je cherche une tenue pour un mariage samedi, vous avez quoi ?", "Vous avez des robes pour une fête d'anniversaire ?", "Qu'est-ce que vous avez pour homme ?", "Vous avez des nouveautés cette semaine ?"],
      en: ["I'm looking for an outfit for a wedding on Saturday, what do you have?", "Do you have something for a birthday party?", "What do you have for men?"],
      wes: ["I need something for wedding Saturday, wetin una get?", "Una get new things this week?"],
    },
    detail: {
      fr: ["Il est en coton ?", "Vous l'avez en L ?", "Je peux voir d'autres couleurs ?", "Ça taille grand ou petit ?"],
      en: ["Is it cotton?", "Do you have it in L?", "Does it run small?"],
      wes: ["E be cotton?", "You get am for L?"],
    },
    order: {
      fr: ["Je prends {p}, taille M", "Ok je prends {p}", "Je veux commander {p} en taille L", "Je prends 2"],
      en: ["I'll take {p} in size M", "I want to order {p}", "Ok I'll take it"],
      wes: ["A go take {p}, size M", "I wan buy {p}"],
    },
    complaint: {
      fr: ["Ma commande n'est toujours pas arrivée, j'ai payé depuis hier", "La robe que j'ai reçue n'est pas la bonne taille", "Le livreur ne répond pas"],
      en: ["I paid yesterday and my order hasn't arrived", "I received the wrong size", "The delivery man is not picking up"],
      wes: ["I don pay since yesterday, my thing never reach", "Dem bring me wrong size"],
    },
  },
  restaurant: {
    browse: {
      fr: ["Qu'est-ce que vous avez comme plats aujourd'hui ?", "Vous avez quoi pour 4 personnes ?"],
      en: ["What's on the menu today?", "What do you have for lunch for 4 people?", "What's ready now?"],
      wes: ["Wetin una cook today?", "Wetin dey for chop now?"],
    },
    detail: {
      fr: ["C'est épicé ?", "La portion est grande ?"],
      en: ["Is it spicy?", "Is the portion big?", "Can I have it with green plantain instead?"],
      wes: ["E get pepper?", "Di plate big?"],
    },
    order: {
      fr: ["Je prends 2 {p} svp", "Je veux commander {p}"],
      en: ["I'll take 2 plates of {p}", "I want to order {p} for 2 people"],
      wes: ["Bring 2 plates of {p}", "I wan order {p}"],
    },
    complaint: {
      fr: ["La nourriture est arrivée froide", "J'attends ma commande depuis une heure"],
      en: ["The food arrived cold", "I've been waiting for my order for an hour"],
      wes: ["Di food come cold", "I don wait my food one hour"],
    },
  },
  salon: {
    browse: {
      fr: ["Vous faites quels types de tresses ?", "Je veux changer de coiffure, vous me conseillez quoi ?", "Vous faites les ongles en gel ?"],
      en: ["What kind of braids do you do?", "Do you do gel nails?"],
    },
    detail: { fr: ["Ça dure combien de temps ?", "Je dois apporter mes mèches ?"], en: ["How long does it take?", "Should I bring my own extensions?"] },
    order: { fr: ["Je prends {p}", "Je veux acheter {p}"], en: ["I'll take {p}", "I want to buy {p}"] },
    booking: {
      fr: ["Je veux un rendez-vous pour {service} samedi", "Vous avez de la place demain pour {service} ?", "Je peux venir pour {service} cet après-midi ?"],
      en: ["Can I book {service} tomorrow afternoon?", "I want an appointment for {service} on Saturday"],
    },
    complaint: { fr: ["Mes tresses se défont déjà après 3 jours", "On m'a fait attendre 2 heures malgré le rendez-vous"], en: ["My braids are already coming loose after 3 days"] },
  },
  real_estate: {
    browse: {
      fr: ["Je cherche un studio à Molyko pour un étudiant, budget 40 000", "Vous avez des appartements meublés ?"],
      en: ["I'm looking for a 2-bedroom in Molyko, budget 80,000", "Do you have land for sale around Mile 16?", "Any furnished apartment available this month?"],
      wes: ["I dey find small studio for Molyko, my budget na 40 000", "Una get land for sell for Muea?"],
    },
    detail: {
      fr: ["L'eau et l'électricité sont comprises ?", "Il y a un parking ?", "C'est combien d'avance ?"],
      en: ["Are water and light included?", "Is there parking?", "How many months advance?", "Is the area secure?"],
      wes: ["Water and light dey inside?", "Na how many months advance?"],
    },
    visit: {
      fr: ["Je peux visiter {p} samedi ?", "On peut visiter demain matin ?"],
      en: ["Can I visit {p} on Saturday?", "Can we see it tomorrow morning?"],
      wes: ["I fit come see {p} Saturday?", "We fit go see am tomorrow?"],
    },
    complaint: { fr: ["Le propriétaire refuse de rendre ma caution"], en: ["The landlord refuses to give back my deposit"], wes: ["Landlord no wan give me my deposit"] },
  },
};

export type ScriptStep = { kind: ScriptKind; text: string; gapSec: number };
export type ConversationScript = { flow: string; language: LanguageCode; steps: ScriptStep[] };

/** Seeded random numbers (mulberry32): same seed, same conversations. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    chance: (p: number) => next() < p,
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)],
    between: (min: number, max: number) => min + next() * (max - min),
    weighted: <T extends string>(weights: Partial<Record<T, number>>): T => {
      const entries = Object.entries(weights) as [T, number][];
      let r = next() * entries.reduce((s, [, w]) => s + w, 0);
      for (const [k, w] of entries) if ((r -= w) <= 0) return k;
      return entries[entries.length - 1][0];
    },
  };
}
export type Rng = ReturnType<typeof rng>;

type Flow = "quick_price" | "info" | "delivery" | "order" | "browse" | "booking" | "visit" | "complaint" | "repeat" | "greeting_only";

const FLOWS: Record<Industry, Partial<Record<Flow, number>>> = {
  retail: { quick_price: 20, info: 12, delivery: 10, order: 25, browse: 18, complaint: 6, repeat: 4, greeting_only: 5 },
  restaurant: { quick_price: 18, info: 12, delivery: 12, order: 30, browse: 15, complaint: 5, repeat: 3, greeting_only: 5 },
  salon: { quick_price: 20, info: 15, order: 10, browse: 15, booking: 25, complaint: 5, repeat: 5, greeting_only: 5 },
  real_estate: { quick_price: 25, info: 15, browse: 30, visit: 20, complaint: 5, greeting_only: 5 },
};

/** One customer's conversation: what they write, and the seconds between messages. */
export function scriptConversation(sim: SimBusiness, r: Rng): ConversationScript {
  const language = r.weighted(sim.languages);
  const flow = r.weighted(FLOWS[sim.industry]);
  const product = r.pick(sim.products);
  const place = r.pick(sim.places);
  const service = sim.services.length ? r.pick(sim.services) : "";
  const steps: ScriptStep[] = [];
  const productWord = language === sim.context.language.defaultLanguage ? product.says : product.name.toLowerCase();

  const say = (kind: ScriptKind, burst = false) => {
    const pool = kind in COMMON ? COMMON[kind as keyof typeof COMMON] : BY_INDUSTRY[sim.industry][kind as keyof (typeof BY_INDUSTRY)[Industry]];
    const list = pool?.[language] ?? pool?.en ?? pool?.fr;
    if (!list) return;
    const text = r
      .pick(list)
      .replace("{P}", productWord.charAt(0).toUpperCase() + productWord.slice(1))
      .replace("{p}", productWord)
      .replace("{place}", place)
      .replace("{service}", service);
    // The first message has no gap; a burst follows within seconds; otherwise the customer reads the reply and types.
    steps.push({ kind, text, gapSec: steps.length === 0 ? 0 : burst ? r.between(2, 5) : r.between(25, 240) });
  };
  const greet = (p: number) => {
    if (!r.chance(p)) return false;
    say("greet");
    return true;
  };
  const end = (thanks: number, emoji: number) => {
    if (r.chance(thanks)) say("thanks");
    else if (r.chance(emoji)) say("emoji");
  };

  switch (flow) {
    case "quick_price": {
      const greeted = greet(0.5);
      say(r.chance(0.7) ? "price" : "stock", greeted && r.chance(0.5));
      if (sim.industry === "real_estate" && r.chance(0.5)) say("detail");
      end(0.5, 0.3);
      break;
    }
    case "info": {
      const greeted = greet(0.6);
      say(r.pick(["hours", "location", sim.industry === "real_estate" || sim.industry === "salon" ? "hours" : "delivery"] as const), greeted && r.chance(0.5));
      end(0.5, 0.2);
      break;
    }
    case "delivery":
      say("price");
      say("delivery");
      end(0.5, 0.2);
      break;
    case "order": {
      const greeted = greet(0.5);
      say(r.chance(0.6) ? "price" : "stock", greeted && r.chance(0.4));
      if (r.chance(0.4)) say("detail");
      say("order");
      if (sim.industry !== "salon") say("address");
      if (r.chance(0.5)) say("confirm");
      end(0.5, 0.3);
      break;
    }
    case "browse":
      greet(0.6);
      say("browse");
      if (r.chance(0.5)) say("detail");
      if (r.chance(0.6)) say(sim.industry === "real_estate" ? "detail" : "price");
      if (sim.industry !== "real_estate" && r.chance(0.3)) {
        say("order");
        if (sim.industry !== "salon") say("address");
      } else if (sim.industry === "real_estate" && r.chance(0.5)) {
        say("visit");
        if (r.chance(0.4)) say("confirm");
      }
      end(0.4, 0.2);
      break;
    case "booking":
      greet(0.6);
      if (r.chance(0.4)) say("detail");
      say("booking");
      say("confirm");
      end(0.6, 0.2);
      break;
    case "visit":
      greet(0.6);
      say("stock");
      say("visit");
      if (r.chance(0.5)) say("confirm");
      end(0.4, 0.2);
      break;
    case "complaint":
      greet(0.4);
      say("complaint");
      // What they write next is for the team (the assistant has handed over).
      say("detail");
      break;
    case "repeat": {
      say("price");
      // The customer didn't wait for the answer and sends the same question again.
      steps.push({ ...steps[steps.length - 1], gapSec: r.between(40, 180) });
      end(0.4, 0.2);
      break;
    }
    case "greeting_only":
      say("greet");
      if (r.chance(0.5)) say("emoji");
      break;
  }
  return { flow, language, steps };
}
