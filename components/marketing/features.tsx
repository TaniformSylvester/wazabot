import {
  Bot,
  CalendarClock,
  ChartColumn,
  Megaphone,
  MessageSquareMore,
  Package,
  ShoppingBag,
  Users,
} from "lucide-react";

import { Reveal } from "@/components/motion/reveal";
import { SectionHeading } from "@/components/marketing/section-heading";
import { tones } from "@/config/solutions";
import { cn } from "@/lib/utils";

/**
 * `roadmap: true` marks features that are planned but not in the first
 * release — keep the "Coming soon" label until they actually ship.
 */
const features = [
  { icon: MessageSquareMore, title: "WhatsApp Automation", text: "Automatically handle common customer questions and conversations, day and night.", tone: "bolt" },
  { icon: Bot, title: "AI Customer Assistant", text: "Respond faster with an AI assistant trained on your business — while you stay in control.", tone: "ink" },
  { icon: Package, title: "Product Catalog", text: "Show products and services, with prices and availability, directly in the chat.", tone: "ember" },
  { icon: ShoppingBag, title: "Orders", text: "Capture orders in the conversation and track them from new to delivered.", tone: "volt" },
  { icon: CalendarClock, title: "Appointments", text: "Let customers request and book services with your team.", tone: "bolt", roadmap: true },
  { icon: Users, title: "Customer Management", text: "Every customer's details, notes and conversation history, organised automatically.", tone: "ember" },
  { icon: Megaphone, title: "Broadcasts", text: "Send relevant updates and promotions to customers who opted in.", tone: "volt", roadmap: true },
  { icon: ChartColumn, title: "Analytics", text: "Understand customer activity, busy hours and how conversations turn into orders.", tone: "ink" },
] as const;

export function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className="border-y border-border bg-card py-20 sm:py-28">
      <div className="container-page">
        <SectionHeading
          id="features-title"
          eyebrow="Features"
          title="Everything your WhatsApp business needs"
          description="WazaBolt handles the routine work so you and your team can focus on the customers who need a person."
        />
        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, text, tone, ...rest }, i) => (
            <Reveal as="li" key={title} delay={(i % 4) * 70}>
              <div className="group relative flex h-full gap-4 overflow-hidden rounded-3xl border border-border bg-sand p-5 transition-all duration-300 hover:-translate-y-1 hover:border-bolt-300 hover:shadow-float sm:block sm:p-6">
                <span
                  aria-hidden
                  className="bg-bolt-gradient absolute inset-x-0 top-0 h-1 origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100"
                />
                <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", tones[tone])}>
                  <Icon className="size-6" aria-hidden />
                </span>
                <div>
                  <h3 className="type-h3 flex flex-wrap items-center gap-2 sm:mt-5">
                    {title}
                    {"roadmap" in rest ? (
                      <span className="rounded-full bg-sand-200 px-2 py-0.5 font-sans text-[0.625rem] font-semibold uppercase tracking-wider text-stone">
                        Coming soon
                      </span>
                    ) : null}
                  </h3>
                  <p className="type-body mt-1 text-stone sm:mt-2">{text}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
