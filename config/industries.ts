import {
  Briefcase,
  Building2,
  Ellipsis,
  GraduationCap,
  Hotel,
  Shirt,
  Sparkles,
  Store,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

export type Industry = {
  slug: string;
  name: string;
  icon: LucideIcon;
  /** Tailwind classes for the circular icon background + icon colour. */
  tone: string;
  /** What WazaBot does for this business type — only things the product is being built to do. */
  useCases: string[];
  exampleQuestion: string;
  /** Show in the homepage strip. */
  featured: boolean;
};

export const industries: Industry[] = [
  {
    slug: "retail",
    name: "Retail Shops",
    icon: Store,
    tone: "bg-sky-100 text-sky-700",
    useCases: ["Share products, prices and stock from your catalogue", "Capture orders with delivery details", "Answer opening-hours and location questions"],
    exampleQuestion: "Do you still have the 5L cooking oil?",
    featured: true,
  },
  {
    slug: "restaurants",
    name: "Restaurants",
    icon: UtensilsCrossed,
    tone: "bg-gold-100 text-[#8a6100]",
    useCases: ["Share the menu and prices", "Take pickup and delivery orders", "Answer “Are you open now?”"],
    exampleQuestion: "Is the ndolé available today?",
    featured: true,
  },
  {
    slug: "hotels",
    name: "Hotels",
    icon: Hotel,
    tone: "bg-waza-100 text-waza-800",
    useCases: ["Answer questions about rooms, rates and check-in times", "Collect booking requests for reception", "Share directions and hotel policies"],
    exampleQuestion: "What time is check-in?",
    featured: true,
  },
  {
    slug: "beauty",
    name: "Salons & Beauty",
    icon: Sparkles,
    tone: "bg-violet-100 text-violet-700",
    useCases: ["Share your service menu and prices", "Collect appointment requests", "Answer questions about products you sell"],
    exampleQuestion: "How much are knotless braids?",
    featured: true,
  },
  {
    slug: "real-estate",
    name: "Real Estate",
    icon: Building2,
    tone: "bg-emerald-100 text-emerald-800",
    useCases: ["Share listing details and prices", "Collect buyer and tenant details", "Pass viewing requests to your agents"],
    exampleQuestion: "Is the 2-bedroom in Bonamoussadi still available?",
    featured: true,
  },
  {
    slug: "services",
    name: "Professional Services",
    icon: Briefcase,
    tone: "bg-cyan-100 text-cyan-800",
    useCases: ["Explain your services and fees", "Collect client details and requests", "Hand complex questions to your team"],
    exampleQuestion: "What documents do I need for a business registration?",
    featured: true,
  },
  {
    slug: "fashion",
    name: "Fashion",
    icon: Shirt,
    tone: "bg-coral-100 text-[#b23a1d]",
    useCases: ["Share items with sizes and prices", "Capture orders and delivery addresses", "Answer delivery-fee questions from your own rates"],
    exampleQuestion: "Do you have this dress in size L?",
    featured: false,
  },
  {
    slug: "schools",
    name: "Schools",
    icon: GraduationCap,
    tone: "bg-amber-100 text-amber-800",
    useCases: ["Answer questions about fees and enrolment dates", "Share the list of required documents", "Collect parent enquiries for the office"],
    exampleQuestion: "When does registration for next year start?",
    featured: false,
  },
];

export const moreIndustries = { name: "And More", icon: Ellipsis, tone: "bg-mint text-waza-800" };
