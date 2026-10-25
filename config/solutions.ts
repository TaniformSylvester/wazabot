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
import type { Messages } from "@/messages/en";

export type SolutionKey = keyof Messages["solutions"]["items"];

/** Business types WazaBolt serves. Names, use cases and example questions live in the dictionaries (solutions.items). */
export type Solution = { key: SolutionKey; slug: string; icon: LucideIcon; tone: IconTone };

export const solutions: Solution[] = [
  { key: "retail", slug: "retail", icon: Store, tone: "green" },
  { key: "restaurants", slug: "restaurants", icon: UtensilsCrossed, tone: "gold" },
  { key: "hotels", slug: "hotels", icon: Hotel, tone: "teal" },
  { key: "fashion", slug: "fashion", icon: Shirt, tone: "coral" },
  { key: "beauty", slug: "beauty", icon: Scissors, tone: "deep" },
  { key: "realEstate", slug: "real-estate", icon: Building2, tone: "green" },
  { key: "schools", slug: "schools", icon: GraduationCap, tone: "gold" },
  { key: "services", slug: "services", icon: Briefcase, tone: "teal" },
];

/** Business types with their own landing page (/solutions/<slug>); copy in the dictionaries (landing.pages). */
export const LANDING_SLUGS = ["retail", "schools", "restaurants"] as const;
export type LandingKey = (typeof LANDING_SLUGS)[number];
export const landingKey = (slug: string): LandingKey | null => ((LANDING_SLUGS as readonly string[]).includes(slug) ? (slug as LandingKey) : null);
