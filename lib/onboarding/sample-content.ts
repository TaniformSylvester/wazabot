/*
 * What a new workspace is seeded with (lib/onboarding/seedVertical.ts): a few
 * catalogue / menu items (a school: subjects), two WhatsApp conversations —
 * one waiting for a person — and three FAQ templates, in the business's
 * language, with prices in its currency. Everything is marked as sample and
 * kept out of real work (see supabase/migrations/20261117120000_sample_data.sql).
 *
 * The replies in the conversations are from the team, never from the AI
 * assistant (it isn't available yet). Customer numbers can't be dialled
 * (the subscriber part starts with 0), and nothing is ever sent to them.
 */

export type SampleVertical = "retail" | "restaurant" | "school";
export type SampleLanguage = "en" | "fr";

export type SampleProduct = { name: string; category: string; description: string; price: number; stock: number | null };
export type SampleMessage = { from: "customer" | "team"; text: string; minutesAgo: number };
export type SampleConversation = { customerName: string; handoff: boolean; messages: SampleMessage[] };
export type SampleFaq = { question: string; answer: string; category: string };
export type SampleContent = { products: SampleProduct[]; subjects: string[]; conversations: SampleConversation[]; faqs: SampleFaq[] };

/**
 * About what 1 FCFA is worth in each currency, and the step prices are rounded
 * to, so a sample price reads like one a shop would really charge there.
 */
const CURRENCY: Record<string, { perXaf: number; step: number }> = {
  XAF: { perXaf: 1, step: 50 },
  USD: { perXaf: 1 / 600, step: 0.5 },
  NGN: { perXaf: 2.6, step: 100 },
  ZAR: { perXaf: 0.03, step: 5 },
  GHS: { perXaf: 0.024, step: 1 },
  KES: { perXaf: 0.21, step: 10 },
};

/** A price set in FCFA, in another currency: converted, rounded to its step (never 0). */
export function samplePrice(xaf: number, currency: string): number {
  const c = CURRENCY[currency] ?? CURRENCY.XAF;
  const value = Math.max(c.step, Math.round((xaf * c.perXaf) / c.step) * c.step);
  return Math.round(value * 100) / 100;
}

/** "7 500 FCFA" / "7,500 FCFA", "12.50 USD": how a price is written in a sample text. */
export function sampleMoney(amount: number, currency: string, language: SampleLanguage): string {
  const label = currency === "XAF" ? "FCFA" : currency;
  const digits = Number.isInteger(amount) ? 0 : 2;
  const n = new Intl.NumberFormat(language === "fr" ? "fr-FR" : "en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount);
  return `${n.replace(/[  ]/g, " ")} ${label}`;
}

type Text = Record<SampleLanguage, string>;
type ProductSeed = { name: Text; category: Text; description: Text; xaf: number; stock: number | null };

const RETAIL: ProductSeed[] = [
  { name: { en: "Wax print dress", fr: "Robe en wax" }, category: { en: "Clothing", fr: "Vêtements" }, description: { en: "Cotton wax print, sizes S to XL.", fr: "Wax en coton, tailles S à XL." }, xaf: 15000, stock: 12 },
  { name: { en: "Leather sandals", fr: "Sandales en cuir" }, category: { en: "Shoes", fr: "Chaussures" }, description: { en: "Handmade, sizes 39 to 45.", fr: "Faites main, pointures 39 à 45." }, xaf: 12000, stock: 8 },
  { name: { en: "Shea butter cream 250 ml", fr: "Crème au karité 250 ml" }, category: { en: "Beauty", fr: "Beauté" }, description: { en: "Unscented body cream.", fr: "Crème pour le corps, sans parfum." }, xaf: 3500, stock: 30 },
  { name: { en: "USB-C phone charger", fr: "Chargeur de téléphone USB-C" }, category: { en: "Electronics", fr: "Électronique" }, description: { en: "20 W fast charger with cable.", fr: "Chargeur rapide 20 W avec câble." }, xaf: 4000, stock: 15 },
  { name: { en: "Rice, 5 kg bag", fr: "Riz, sac de 5 kg" }, category: { en: "Groceries", fr: "Alimentation" }, description: { en: "Long-grain rice.", fr: "Riz long grain." }, xaf: 6500, stock: 20 },
];

const RESTAURANT: ProductSeed[] = [
  { name: { en: "Jollof rice with chicken", fr: "Riz jollof au poulet" }, category: { en: "Mains", fr: "Plats" }, description: { en: "Served with fried plantains.", fr: "Servi avec des plantains frits." }, xaf: 3500, stock: null },
  { name: { en: "Grilled tilapia", fr: "Tilapia braisé" }, category: { en: "Mains", fr: "Plats" }, description: { en: "Whole fish, pepper sauce, plantains or fries.", fr: "Poisson entier, sauce piquante, plantains ou frites." }, xaf: 5000, stock: null },
  { name: { en: "Beef suya skewers", fr: "Brochettes de bœuf (soya)" }, category: { en: "Grill", fr: "Grillades" }, description: { en: "Three skewers with onions and spice.", fr: "Trois brochettes, oignons et épices." }, xaf: 2000, stock: null },
  { name: { en: "Vegetable soup with fufu", fr: "Soupe de légumes et foufou" }, category: { en: "Mains", fr: "Plats" }, description: { en: "Leafy greens, smoked fish, fufu.", fr: "Légumes verts, poisson fumé, foufou." }, xaf: 3000, stock: null },
  { name: { en: "Fresh pineapple juice", fr: "Jus d'ananas frais" }, category: { en: "Drinks", fr: "Boissons" }, description: { en: "50 cl, pressed every morning.", fr: "50 cl, pressé chaque matin." }, xaf: 1000, stock: null },
];

const SUBJECTS: Record<SampleLanguage, string[]> = {
  en: ["Mathematics", "English Language", "French", "Biology", "History"],
  fr: ["Mathématiques", "Français", "Anglais", "Sciences de la vie et de la Terre", "Histoire-Géographie"],
};

function conversations(vertical: SampleVertical, lang: SampleLanguage, money: (xaf: number) => string): SampleConversation[] {
  const en = lang === "en";
  if (vertical === "restaurant") {
    return [
      {
        customerName: "Linda Ayuk",
        handoff: false,
        messages: [
          { from: "customer", text: en ? "Hello, can I order 2 jollof rice with chicken for delivery at 1 pm?" : "Bonjour, je peux commander 2 riz jollof au poulet à livrer pour 13 h ?", minutesAgo: 95 },
          { from: "team", text: en ? `Yes! 2 × jollof rice = ${money(7000)}. What's the delivery address?` : `Oui ! 2 × riz jollof = ${money(7000)}. Quelle est l'adresse de livraison ?`, minutesAgo: 90 },
          { from: "customer", text: en ? "Near the main market, blue gate. Thank you!" : "Près du grand marché, portail bleu. Merci !", minutesAgo: 88 },
        ],
      },
      {
        customerName: "Daniel Fotso",
        handoff: true,
        messages: [{ from: "customer", text: en ? "Good evening. We are 12 people on Saturday at 7 pm — can you reserve a big table? I'd like to talk to the manager." : "Bonsoir. Nous serons 12 samedi à 19 h — pouvez-vous réserver une grande table ? J'aimerais parler au responsable.", minutesAgo: 12 }],
      },
    ];
  }
  if (vertical === "school") {
    return [
      {
        customerName: "Mrs Ngono",
        handoff: false,
        messages: [
          { from: "customer", text: en ? "Good morning. What time does school close on Fridays?" : "Bonjour. À quelle heure les cours finissent-ils le vendredi ?", minutesAgo: 140 },
          { from: "team", text: en ? "Good morning! On Fridays classes end at 1:30 pm." : "Bonjour ! Le vendredi, les cours finissent à 13 h 30.", minutesAgo: 130 },
        ],
      },
      {
        customerName: "Mr Ekane",
        handoff: true,
        messages: [{ from: "customer", text: en ? "Hello, I would like to speak with the principal about my son's report card, please." : "Bonjour, je souhaite parler au directeur au sujet du bulletin de mon fils, s'il vous plaît.", minutesAgo: 20 }],
      },
    ];
  }
  return [
    {
      customerName: "Nadia Ewane",
      handoff: false,
      messages: [
        { from: "customer", text: en ? "Hi! Do you still have the wax print dress in size M?" : "Bonjour ! Vous avez encore la robe en wax en taille M ?", minutesAgo: 75 },
        { from: "team", text: en ? `Yes, we do — ${money(15000)}. Shall we keep one for you?` : `Oui — ${money(15000)}. On vous en garde une ?`, minutesAgo: 70 },
        { from: "customer", text: en ? "Yes please, I'll pass by this afternoon." : "Oui s'il vous plaît, je passe cet après-midi.", minutesAgo: 68 },
      ],
    },
    {
      customerName: "Kevin Ngwa",
      handoff: true,
      messages: [{ from: "customer", text: en ? "Hello, the charger I bought yesterday doesn't work. Can someone help me?" : "Bonjour, le chargeur acheté hier ne marche pas. Quelqu'un peut m'aider ?", minutesAgo: 8 }],
    },
  ];
}

function faqs(vertical: SampleVertical, lang: SampleLanguage, money: (xaf: number) => string): SampleFaq[] {
  const en = lang === "en";
  if (vertical === "restaurant") {
    return [
      { category: en ? "Delivery" : "Livraison", question: en ? "Do you deliver?" : "Vous livrez ?", answer: en ? `Yes, every day from 11 am to 9 pm. Delivery costs ${money(1000)} in town.` : `Oui, tous les jours de 11 h à 21 h. La livraison coûte ${money(1000)} en ville.` },
      { category: en ? "Reservations" : "Réservations", question: en ? "Can I book a table?" : "Je peux réserver une table ?", answer: en ? "Yes — send us the day, the time and how many people. Groups of 10 or more, please book a day ahead." : "Oui — envoyez-nous le jour, l'heure et le nombre de personnes. Pour 10 personnes ou plus, réservez la veille." },
      { category: en ? "Menu" : "Menu", question: en ? "What does a meal cost?" : "Combien coûte un repas ?", answer: en ? `Main dishes are from ${money(3000)} to ${money(5000)}; drinks from ${money(500)}.` : `Les plats vont de ${money(3000)} à ${money(5000)} ; les boissons à partir de ${money(500)}.` },
    ];
  }
  if (vertical === "school") {
    return [
      { category: en ? "Fees" : "Frais", question: en ? "How much are the school fees?" : "Combien coûtent les frais de scolarité ?", answer: en ? `Registration is ${money(10000)}, then ${money(50000)} per term. You can pay in instalments.` : `L'inscription coûte ${money(10000)}, puis ${money(50000)} par trimestre. Le paiement en plusieurs fois est possible.` },
      { category: en ? "Enrolment" : "Inscription", question: en ? "Which documents do I need to enrol my child?" : "Quels documents faut-il pour inscrire mon enfant ?", answer: en ? "A birth certificate, the last report card and two passport photos." : "Un acte de naissance, le dernier bulletin et deux photos d'identité." },
      { category: en ? "Calendar" : "Calendrier", question: en ? "When does the school year start?" : "Quand commence l'année scolaire ?", answer: en ? "In early September. The exact date is shared with parents in August." : "Début septembre. La date exacte est communiquée aux parents en août." },
    ];
  }
  return [
    { category: en ? "Delivery" : "Livraison", question: en ? "Do you deliver?" : "Vous livrez ?", answer: en ? `Yes, in town for ${money(1000)}, free from ${money(25000)}.` : `Oui, en ville pour ${money(1000)}, gratuit à partir de ${money(25000)}.` },
    { category: en ? "Payment" : "Paiement", question: en ? "How can I pay?" : "Comment puis-je payer ?", answer: en ? "Cash, mobile money or bank transfer. We confirm your order once the payment is received." : "En espèces, par mobile money ou par virement. Nous confirmons la commande à réception du paiement." },
    { category: en ? "Returns" : "Retours", question: en ? "Can I return an item?" : "Je peux retourner un article ?", answer: en ? "Yes, within 7 days with the receipt, if it hasn't been used." : "Oui, sous 7 jours avec le reçu, s'il n'a pas été utilisé." },
  ];
}

/** The sample content for a business type (other → a shop), language and currency. */
export function sampleContent(industry: string | null, language: string | null, currency: string): SampleContent {
  const vertical: SampleVertical = industry === "restaurant" ? "restaurant" : industry === "school" ? "school" : "retail";
  const lang: SampleLanguage = language === "fr" ? "fr" : "en";
  const money = (xaf: number) => sampleMoney(samplePrice(xaf, currency), currency, lang);
  const seeds = vertical === "restaurant" ? RESTAURANT : vertical === "school" ? [] : RETAIL;
  return {
    products: seeds.map((p) => ({ name: p.name[lang], category: p.category[lang], description: p.description[lang], price: samplePrice(p.xaf, currency), stock: p.stock })),
    subjects: vertical === "school" ? SUBJECTS[lang] : [],
    conversations: conversations(vertical, lang, money),
    faqs: faqs(vertical, lang, money),
  };
}
