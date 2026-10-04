import type { BusinessContext } from "@/lib/ai/context";
import type { OpeningHours } from "@/lib/business/hours";
import type { LanguageCode } from "@/lib/i18n/languages";

/*
 * Four sample businesses for the cost simulation — one per industry the
 * product targets. Realistic size: a catalog, FAQs, a delivery note with
 * fees per area, opening hours. Nothing here is shown to anyone; it only
 * feeds the real prompt builder, rules layer and catalog search.
 */

export const INDUSTRIES = ["retail", "restaurant", "salon", "real_estate"] as const;
export type Industry = (typeof INDUSTRIES)[number];

export type SimProduct = {
  id: string;
  name: string;
  /** How customers call it in messages ("la robe wax rouge", "ndolé"). */
  says: string;
  description: string;
  category: string;
  price: number;
  stock: number | null;
  variants: { id: string; name: string; value: string; priceModifier: number; stock: number | null }[];
};

export type SimBusiness = {
  industry: Industry;
  context: BusinessContext;
  products: SimProduct[];
  /** Areas customers ask delivery to; the first ones have a fee written in the delivery note. */
  places: string[];
  services: string[];
  /** Share of conversations per language. */
  languages: Partial<Record<LanguageCode, number>>;
  /** Opening time and closing hour customers write in (local), for traffic. */
  trafficHours: [number, number];
};

const id = (prefix: number, n: number) => `${prefix.toString(16).padStart(8, "0")}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

const hours = (open: string, close: string, closed: string[] = []): OpeningHours =>
  Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, closed.includes(d) ? { closed: true, open, close } : { closed: false, open, close }])) as OpeningHours;

function products(prefix: number, rows: [name: string, says: string, category: string, price: number, description: string, variants?: string[]][]): SimProduct[] {
  return rows.map(([name, says, category, price, description, variants], i) => ({
    id: id(prefix, i + 1),
    name,
    says,
    description,
    category,
    price,
    stock: 3 + ((i * 7) % 11),
    variants: (variants ?? []).map((v, j) => {
      const [vname, value] = v.split(":");
      return { id: id(prefix + 1, i * 10 + j + 1), name: vname, value, priceModifier: 0, stock: j === 2 ? 0 : 2 + j };
    }),
  }));
}

function context(b: {
  id: string;
  name: string;
  description: string;
  industry: string;
  city: string;
  address: string;
  openingHours: OpeningHours;
  defaultLanguage: LanguageCode;
  enabledLanguages: LanguageCode[];
  replyLength: BusinessContext["settings"]["replyLength"];
  salesMode: boolean;
  faqs: [string, string][];
  documents: { type: string; title: string; content: string }[];
  productCount: number;
  services?: { name: string; minutes: number; price: number | null }[];
}): BusinessContext {
  return {
    business: {
      id: b.id,
      name: b.name,
      description: b.description,
      industry: b.industry,
      city: b.city,
      address: b.address,
      phone: "+237 6 70 00 00 00",
      website: null,
      countryCode: "CM",
      currency: "XAF",
      timezone: "Africa/Douala",
      openingHours: b.openingHours,
      openNow: true,
    },
    settings: {
      aiEnabled: true,
      tone: "friendly",
      replyLength: b.replyLength,
      greeting: null,
      fallbackMessage: null,
      afterHoursMode: "reply_normally",
      afterHoursMessage: null,
      humanHandoverEnabled: true,
      salesMode: b.salesMode,
      photoUnderstanding: false,
    },
    language: { mode: "auto", defaultLanguage: b.defaultLanguage, enabledLanguages: b.enabledLanguages },
    style: { tone: "friendly", formality: "neutral", emojiLevel: "light", replyLength: b.replyLength, mirrorCodeSwitching: true, styleNotes: "" },
    faqs: b.faqs.map(([question, answer]) => ({ question, answer })),
    documents: b.documents,
    activeProductCount: b.productCount,
    booking: {
      enabled: Boolean(b.services?.length),
      services: (b.services ?? []).map((s, i) => ({ id: id(0x5e, i + 1), name: s.name, description: null, durationMinutes: s.minutes, price: s.price, currency: "XAF" })),
    },
  };
}

// ---------------------------------------------------------------------------
// Retail: a fashion boutique in Douala
// ---------------------------------------------------------------------------
const retailProducts = products(0x1000, [
  ["Robe wax rouge", "la robe wax rouge", "Robes", 15000, "Robe en wax 100 % coton, coupe droite, longueur genou.", ["Taille:M", "Taille:L", "Taille:XL"]],
  ["Robe wax bleue", "la robe wax bleue", "Robes", 13500, "Robe évasée en wax, manches courtes.", ["Taille:S", "Taille:M"]],
  ["Robe longue imprimée", "la robe longue", "Robes", 22000, "Robe longue de soirée, imprimé africain, doublée.", ["Taille:M", "Taille:L", "Taille:XL"]],
  ["Ensemble kaba", "le kaba", "Ensembles", 18000, "Kaba ample brodé, taille unique."],
  ["Chemise pagne homme", "la chemise pagne", "Hommes", 12000, "Chemise manches courtes en pagne, coton.", ["Taille:M", "Taille:L", "Taille:XL"]],
  ["Foulard assorti", "le foulard", "Accessoires", 4000, "Foulard en wax assorti aux robes."],
  ["Sac en pagne", "le sac en pagne", "Accessoires", 8000, "Sac à main en pagne, doublure intérieure."],
  ["Sandales cuir", "les sandales", "Chaussures", 10000, "Sandales en cuir fait main.", ["Pointure:38", "Pointure:39", "Pointure:40"]],
  ["Chaussures talons", "les talons", "Chaussures", 16000, "Escarpins talons 7 cm.", ["Pointure:38", "Pointure:39", "Pointure:40"]],
  ["Boucles d'oreilles perles", "les boucles d'oreilles", "Bijoux", 3000, "Boucles en perles africaines."],
  ["Pagne 6 yards", "le pagne 6 yards", "Tissus", 6000, "Pagne wax 6 yards, plusieurs motifs."],
  ["Tissu bazin", "le bazin", "Tissus", 9000, "Bazin riche, 5 mètres."],
  ["Jupe portefeuille wax", "la jupe wax", "Jupes", 9500, "Jupe portefeuille en wax, longueur midi.", ["Taille:S", "Taille:M", "Taille:L"]],
  ["Tenue enfant wax", "la tenue enfant", "Enfants", 7000, "Ensemble enfant 2 à 8 ans."],
]);

const retail: SimBusiness = {
  industry: "retail",
  products: retailProducts,
  places: ["Akwa", "Bonamoussadi", "Bonabéri", "Buea", "Kotto", "Makepe"],
  services: [],
  languages: { fr: 0.5, en: 0.25, wes: 0.25 },
  trafficHours: [8, 19],
  context: context({
    id: "sim-retail",
    name: "Awa Styles",
    description: "Boutique de mode africaine : robes en wax, ensembles, accessoires et tissus. Couture sur mesure.",
    industry: "fashion",
    city: "Douala",
    address: "Rue Joss, Akwa",
    openingHours: hours("08:00", "19:00", ["sun"]),
    defaultLanguage: "fr",
    enabledLanguages: ["fr", "en", "wes"],
    replyLength: "short",
    salesMode: true,
    productCount: retailProducts.length,
    faqs: [
      ["Quels moyens de paiement acceptez-vous ?", "Orange Money, MTN MoMo et espèces à la livraison à Douala. Hors Douala, paiement avant l'envoi."],
      ["Puis-je échanger un article ?", "Oui, sous 7 jours, si l'article n'a pas été porté et avec l'étiquette. Pas de remboursement en espèces : un bon d'achat."],
      ["Faites-vous du sur mesure ?", "Oui. Comptez 5 à 10 jours selon le modèle. Les mesures se prennent en boutique ou chez vous à Douala (2 000 FCFA)."],
      ["Quelles tailles avez-vous ?", "Du S au XL pour la plupart des robes. Le kaba est en taille unique."],
      ["Livrez-vous hors de Douala ?", "Oui, par agence de voyage (Buea, Limbé, Yaoundé, Bafoussam). Comptez 2 jours."],
      ["Les prix sont-ils négociables ?", "Nos prix sont fixes. Une remise de 10 % est faite à partir de 3 articles."],
      ["Avez-vous des tenues pour mariage ?", "Oui : robes longues, kaba brodés et ensembles assortis pour couples, sur commande."],
      ["Puis-je réserver un article ?", "Oui, 48 heures, avec un acompte de 30 % par Mobile Money."],
    ],
    documents: [
      {
        type: "delivery",
        title: "Livraison",
        content: "Akwa : 1 000 FCFA.\nBonamoussadi : 1 500 FCFA.\nBonabéri : 2 000 FCFA.\nBuea : 2 500 FCFA (2 jours, par agence).\nLivraison le jour même à Douala pour toute commande avant 14 h.",
      },
      {
        type: "policy",
        title: "Retours et échanges",
        content: "Échange sous 7 jours avec l'étiquette. Les articles sur mesure, les bijoux et les articles soldés ne sont ni repris ni échangés. Les frais de livraison d'un échange sont à la charge du client.",
      },
    ],
  }),
};

// ---------------------------------------------------------------------------
// Restaurant: a kitchen in Bamenda that delivers
// ---------------------------------------------------------------------------
const restaurantProducts = products(0x2000, [
  ["Ndolé with plantain", "ndolé", "Mains", 2500, "Ndolé with beef and shrimps, ripe or green plantain."],
  ["Eru and fufu", "eru", "Mains", 2000, "Eru with waterfufu or garri."],
  ["Achu soup", "achu", "Mains", 3000, "Achu with yellow soup and kanda."],
  ["Grilled fish (braisé)", "grilled fish", "Grill", 4000, "Whole braised fish with plantain or miondo.", ["Size:Medium", "Size:Large"]],
  ["Jollof rice with chicken", "jollof rice", "Mains", 2500, "Jollof rice with fried chicken and salad."],
  ["Chicken DG", "chicken DG", "Mains", 3500, "Chicken DG with plantain and vegetables."],
  ["Pepper soup", "pepper soup", "Soups", 2000, "Goat pepper soup."],
  ["Koki beans", "koki", "Sides", 1000, "Koki with plantain."],
  ["Puff-puff (10 pieces)", "puff-puff", "Snacks", 500, "Ten puff-puff with beans on request."],
  ["Folere juice", "folere", "Drinks", 500, "Fresh hibiscus juice, 50 cl."],
  ["Ginger juice", "ginger juice", "Drinks", 500, "Fresh ginger juice, 50 cl."],
  ["Corn chaff", "corn chaff", "Mains", 1500, "Corn chaff with beans and palm oil."],
]);

const restaurant: SimBusiness = {
  industry: "restaurant",
  products: restaurantProducts,
  places: ["Nkwen", "Commercial Avenue", "Up Station", "Bambili", "Mile Four", "Ntarikon"],
  services: [],
  languages: { en: 0.45, wes: 0.35, fr: 0.2 },
  trafficHours: [9, 21],
  context: context({
    id: "sim-restaurant",
    name: "Mami Ngozi Kitchen",
    description: "Cameroonian home cooking: ndolé, eru, achu, grilled fish. Eat in, take away or delivery in Bamenda.",
    industry: "restaurant",
    city: "Bamenda",
    address: "Mile Six Nkwen, opposite Total station",
    openingHours: hours("09:00", "22:00"),
    defaultLanguage: "en",
    enabledLanguages: ["en", "fr", "wes"],
    replyLength: "short",
    salesMode: true,
    productCount: restaurantProducts.length,
    faqs: [
      ["How long does delivery take?", "30 to 45 minutes in Bamenda town, longer when it rains."],
      ["How do I pay?", "MTN MoMo or Orange Money before delivery, or cash on delivery for orders under 10,000 FCFA."],
      ["Do you cook for events?", "Yes, for 20 people or more. Order 3 days ahead with a 50% deposit."],
      ["Is the food spicy?", "We cook mild by default and add pepper on request."],
      ["Do you have vegetarian dishes?", "Koki beans, corn chaff and plantain dishes are vegetarian."],
      ["Can I eat in?", "Yes, we have 8 tables. No reservation needed except on Sundays."],
    ],
    documents: [
      {
        type: "delivery",
        title: "Delivery fees",
        content: "Nkwen: 500 FCFA.\nCommercial Avenue: 700 FCFA.\nUp Station: 1 000 FCFA.\nBambili: 1 500 FCFA.\nFree delivery from 10,000 FCFA of food.",
      },
    ],
  }),
};

// ---------------------------------------------------------------------------
// Salon: hair and beauty in Yaoundé, with appointments
// ---------------------------------------------------------------------------
const salonProducts = products(0x3000, [
  ["Mèches brésiliennes", "les mèches brésiliennes", "Cheveux", 12000, "Mèches 100 % naturelles, 3 paquets.", ["Longueur:14 pouces", "Longueur:18 pouces", "Longueur:22 pouces"]],
  ["Perruque lace", "la perruque", "Cheveux", 35000, "Perruque lace frontale, cheveux naturels."],
  ["Huile de coco", "l'huile de coco", "Soins", 2500, "Huile de coco pure, 250 ml."],
  ["Crème défrisante", "la crème défrisante", "Soins", 3500, "Crème défrisante douce, 400 g."],
  ["Vernis à ongles", "le vernis", "Ongles", 1500, "Vernis longue tenue, 20 couleurs."],
  ["Beurre de karité", "le karité", "Soins", 2000, "Beurre de karité brut, 200 g."],
]);

const salon: SimBusiness = {
  industry: "salon",
  products: salonProducts,
  places: ["Bastos", "Mvan", "Biyem-Assi", "Essos"],
  services: ["tresses", "défrisage", "manucure", "pédicure", "coiffure de mariage"],
  languages: { fr: 0.7, en: 0.3 },
  trafficHours: [9, 19],
  context: context({
    id: "sim-salon",
    name: "Beauté Divine",
    description: "Salon de coiffure et d'esthétique : tresses, défrisage, manucure, pédicure, coiffures de mariage. Vente de mèches et produits.",
    industry: "beauty",
    city: "Yaoundé",
    address: "Carrefour Bastos, immeuble Saker",
    openingHours: hours("09:00", "19:00", ["mon"]),
    defaultLanguage: "fr",
    enabledLanguages: ["fr", "en"],
    replyLength: "short",
    salesMode: true,
    productCount: salonProducts.length,
    services: [
      { name: "Tresses", minutes: 180, price: 8000 },
      { name: "Défrisage", minutes: 60, price: 5000 },
      { name: "Manucure", minutes: 45, price: 3000 },
      { name: "Pédicure", minutes: 60, price: 4000 },
      { name: "Coiffure de mariage", minutes: 180, price: null },
    ],
    faqs: [
      ["Faut-il prendre rendez-vous ?", "C'est conseillé, surtout le week-end. Sans rendez-vous, vous passez selon les disponibilités."],
      ["Les mèches sont-elles comprises dans le prix des tresses ?", "Non, apportez vos mèches ou achetez-les au salon."],
      ["Puis-je annuler un rendez-vous ?", "Oui, jusqu'à 3 heures avant, sans frais."],
      ["Vous déplacez-vous à domicile ?", "Oui pour les mariages, à Yaoundé, avec un supplément de 5 000 FCFA."],
      ["Combien de temps durent les tresses ?", "Environ 3 heures selon le modèle et la longueur."],
    ],
    documents: [],
  }),
};

// ---------------------------------------------------------------------------
// Real estate: a rental and sales agency in Buea
// ---------------------------------------------------------------------------
const realEstateProducts = products(0x4000, [
  ["2-bedroom apartment, Molyko", "the 2-bedroom in Molyko", "Rent", 75000, "Two bedrooms, sitting room, kitchen, 2 toilets, water and light separate. Per month."],
  ["Studio, Bonduma", "the studio in Bonduma", "Rent", 35000, "Self-contained studio near the university. Per month."],
  ["Furnished studio, Check Point", "the furnished studio", "Rent", 50000, "Furnished studio with water heater and Wi-Fi. Per month."],
  ["3-bedroom house, Great Soppo", "the house in Great Soppo", "Rent", 150000, "Three bedrooms, fenced compound, parking for 2 cars. Per month."],
  ["Shop space, Clerks Quarter", "the shop space", "Commercial", 60000, "25 m² shop on the main road. Per month."],
  ["Land 500 m², Mile 16", "the land in Mile 16", "Sale", 8000000, "500 m² titled land, flat, road access."],
  ["Land 1,000 m², Muea", "the land in Muea", "Sale", 12000000, "1,000 m² land with land certificate."],
  ["1-bedroom apartment, Mile 17", "the 1-bedroom in Mile 17", "Rent", 45000, "One bedroom, sitting room, kitchen. Per month."],
]);

const realEstate: SimBusiness = {
  industry: "real_estate",
  products: realEstateProducts,
  places: ["Molyko", "Bonduma", "Great Soppo", "Mile 17"],
  services: [],
  languages: { en: 0.5, wes: 0.25, fr: 0.25 },
  trafficHours: [8, 18],
  context: context({
    id: "sim-real-estate",
    name: "Mountain Homes Realty",
    description: "Houses, apartments and studios for rent, land for sale in Buea and Limbe. Visits on appointment.",
    industry: "real_estate",
    city: "Buea",
    address: "Molyko, opposite the Total station",
    openingHours: hours("08:00", "18:00", ["sun"]),
    defaultLanguage: "en",
    enabledLanguages: ["en", "fr", "wes"],
    replyLength: "medium",
    salesMode: false,
    productCount: realEstateProducts.length,
    faqs: [
      ["What do I pay to move in?", "Rent for the period agreed with the landlord (usually 6 or 12 months), plus one month's rent as agency fee and one month's deposit."],
      ["Is there a visit fee?", "Yes, 2,000 FCFA per visit, deducted from the agency fee if you take the house."],
      ["Are water and light included?", "No, unless the listing says so. Each unit has its own meter."],
      ["Do you help with land documents?", "Yes, we check the land certificate with the land registry before any sale."],
      ["Can I pay rent monthly?", "It depends on the landlord; most ask for 6 months to start."],
    ],
    documents: [
      {
        type: "policy",
        title: "Visits",
        content: "Visits Monday to Saturday, 9 am to 5 pm, on appointment. Bring an ID card. The visit fee is paid on the spot.",
      },
    ],
  }),
};

export const SIM_BUSINESSES: Record<Industry, SimBusiness> = { retail, restaurant, salon, real_estate: realEstate };
