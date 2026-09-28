import {
  BookOpen,
  ChartColumn,
  Hand,
  Languages,
  MessagesSquare,
  Package,
  ShoppingBag,
  Users,
} from "lucide-react";

import { SectionHeading } from "@/components/marketing/section-heading";
import { cn } from "@/lib/utils";

const features = [
  { icon: MessagesSquare, title: "AI Conversations", text: "Automatically answer routine customer questions, day and night.", tone: "bg-mint text-waza-700" },
  { icon: Package, title: "Product Assistant", text: "Share products, prices and availability straight from your catalogue.", tone: "bg-gold-100 text-[#8a6100]" },
  { icon: Users, title: "Customer Management", text: "Every customer's details, notes and history, organised automatically.", tone: "bg-sky-100 text-sky-700" },
  { icon: ShoppingBag, title: "Order Management", text: "Capture orders in chat and track them from new to delivered.", tone: "bg-coral-100 text-[#b23a1d]" },
  { icon: Hand, title: "Human Takeover", text: "Take control of any conversation instantly — WazaBot steps aside.", tone: "bg-violet-100 text-violet-700" },
  { icon: BookOpen, title: "Business Knowledge", text: "Teach WazaBot your FAQs, policies, services and delivery rates.", tone: "bg-emerald-100 text-emerald-800" },
  { icon: ChartColumn, title: "Analytics", text: "Understand conversations, busy hours and customer activity.", tone: "bg-cyan-100 text-cyan-800" },
  { icon: Languages, title: "English + French", text: "Replies in the language your customer writes in.", tone: "bg-amber-100 text-amber-800" },
];

export function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className="bg-white py-20 sm:py-28">
      <div className="container-page">
        <SectionHeading
          id="features-title"
          eyebrow="Features"
          title="Everything your front desk needs"
          description="WazaBot handles the routine work so you and your team can focus on customers who need a person."
        />
        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, text, tone }) => (
            <li
              key={title}
              className="group flex gap-4 rounded-2xl border border-border bg-cream p-5 transition-all sm:block sm:p-6 duration-200 hover:-translate-y-1 hover:border-waza-200 hover:bg-white hover:shadow-float"
            >
              <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", tone)}>
                <Icon className="size-6" aria-hidden />
              </span>
              <div>
                <h3 className="text-lg font-bold sm:mt-5">{title}</h3>
                <p className="mt-1 text-[0.9375rem] leading-relaxed text-slate-waza sm:mt-2">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
