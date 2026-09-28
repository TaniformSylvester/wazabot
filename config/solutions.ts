import {
  Briefcase,
  Building2,
  Ellipsis,
  GraduationCap,
  Hotel,
  Scissors,
  Shirt,
  Store,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

/** Brand-consistent icon tones — no one-off colours. */
export const tones = {
  bolt: "bg-bolt-100 text-bolt-800",
  ember: "bg-ember-100 text-ember-700",
  volt: "bg-volt-100 text-volt-700",
  ink: "bg-ink text-bolt-400",
  sand: "bg-sand-200 text-ink",
} as const;

export type Solution = {
  slug: string;
  name: string;
  icon: LucideIcon;
  tone: keyof typeof tones;
  /** What WazaBolt does for this business type — only things the product is being built to do. */
  useCases: string[];
  exampleQuestion: string;
  /** Show in the homepage strip. */
  featured: boolean;
};

export const solutions: Solution[] = [
  {
    slug: "retail",
    name: "Retail Shops",
    icon: Store,
    tone: "bolt",
    useCases: ["Share products, prices and stock from your catalogue", "Capture orders with delivery details", "Answer opening-hours and location questions"],
    exampleQuestion: "Do you still have the 5L cooking oil?",
    featured: true,
  },
  {
    slug: "restaurants",
    name: "Restaurants",
    icon: UtensilsCrossed,
    tone: "ember",
    useCases: ["Share the menu and prices", "Take pickup and delivery orders", "Answer “Are you open now?”"],
    exampleQuestion: "Is the ndolé available today?",
    featured: true,
  },
  {
    slug: "hotels",
    name: "Hotels",
    icon: Hotel,
    tone: "volt",
    useCases: ["Answer questions about rooms, rates and check-in times", "Collect booking requests for reception", "Share directions and hotel policies"],
    exampleQuestion: "What time is check-in?",
    featured: true,
  },
  {
    slug: "beauty",
    name: "Salons & Beauty",
    icon: Scissors,
    tone: "ink",
    useCases: ["Share your service menu and prices", "Collect appointment requests", "Answer questions about products you sell"],
    exampleQuestion: "How much are knotless braids?",
    featured: true,
  },
  {
    slug: "real-estate",
    name: "Real Estate",
    icon: Building2,
    tone: "bolt",
    useCases: ["Share listing details and prices", "Collect buyer and tenant details", "Pass viewing requests to your agents"],
    exampleQuestion: "Is the 2-bedroom in Bonamoussadi still available?",
    featured: true,
  },
  {
    slug: "services",
    name: "Professional Services",
    icon: Briefcase,
    tone: "ember",
    useCases: ["Explain your services and fees", "Collect client details and requests", "Hand complex questions to your team"],
    exampleQuestion: "What documents do I need for a business registration?",
    featured: true,
  },
  {
    slug: "fashion",
    name: "Fashion",
    icon: Shirt,
    tone: "volt",
    useCases: ["Share items with sizes and prices", "Capture orders and delivery addresses", "Answer delivery-fee questions from your own rates"],
    exampleQuestion: "Do you have this dress in size L?",
    featured: false,
  },
  {
    slug: "schools",
    name: "Schools",
    icon: GraduationCap,
    tone: "ink",
    useCases: ["Answer questions about fees and enrolment dates", "Share the list of required documents", "Collect parent enquiries for the office"],
    exampleQuestion: "When does registration for next year start?",
    featured: false,
  },
];

export const moreSolutions = { name: "And More", icon: Ellipsis, tone: "sand" as const };
