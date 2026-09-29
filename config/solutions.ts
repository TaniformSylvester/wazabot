import {
  Briefcase,
  Building2,
  GraduationCap,
  Hotel,
  Scissors,
  Shirt,
  Store,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

import type { IconTone } from "@/lib/brand/tones";

export type Solution = {
  slug: string;
  name: string;
  icon: LucideIcon;
  tone: IconTone;
  /** What WazaBolt does for this business type — only things the product is being built to do. */
  useCases: string[];
  exampleQuestion: string;
};

export const solutions: Solution[] = [
  {
    slug: "retail",
    name: "Retail",
    icon: Store,
    tone: "green",
    useCases: ["Share products, prices and stock from your catalogue", "Capture orders with delivery details", "Answer opening-hours and location questions"],
    exampleQuestion: "Do you still have the 5L cooking oil?",
  },
  {
    slug: "restaurants",
    name: "Restaurants",
    icon: UtensilsCrossed,
    tone: "gold",
    useCases: ["Share the menu and prices", "Take pickup and delivery orders", "Answer “Are you open now?”"],
    exampleQuestion: "Is the ndolé available today?",
  },
  {
    slug: "hotels",
    name: "Hotels",
    icon: Hotel,
    tone: "teal",
    useCases: ["Answer questions about rooms, rates and check-in times", "Collect booking requests for reception", "Share directions and hotel policies"],
    exampleQuestion: "What time is check-in?",
  },
  {
    slug: "fashion",
    name: "Fashion",
    icon: Shirt,
    tone: "coral",
    useCases: ["Share items with sizes and prices", "Capture orders and delivery addresses", "Answer delivery-fee questions from your own rates"],
    exampleQuestion: "Do you have this dress in size L?",
  },
  {
    slug: "beauty",
    name: "Beauty & Salons",
    icon: Scissors,
    tone: "deep",
    useCases: ["Share your service menu and prices", "Collect appointment requests", "Answer questions about products you sell"],
    exampleQuestion: "How much are knotless braids?",
  },
  {
    slug: "real-estate",
    name: "Real Estate",
    icon: Building2,
    tone: "green",
    useCases: ["Share listing details and prices", "Collect buyer and tenant details", "Pass viewing requests to your agents"],
    exampleQuestion: "Is the 2-bedroom in Bonamoussadi still available?",
  },
  {
    slug: "schools",
    name: "Schools",
    icon: GraduationCap,
    tone: "gold",
    useCases: ["Answer questions about fees and enrolment dates", "Share the list of required documents", "Collect parent enquiries for the office"],
    exampleQuestion: "When does registration for next year start?",
  },
  {
    slug: "services",
    name: "Professional Services",
    icon: Briefcase,
    tone: "teal",
    useCases: ["Explain your services and fees", "Collect client details and requests", "Hand complex questions to your team"],
    exampleQuestion: "What documents do I need for a business registration?",
  },
];
