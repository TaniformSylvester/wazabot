import { BellRing, Clock, Inbox, MessageCircle, MoonStar, Repeat, ShoppingBag, UserX } from "lucide-react";

import { Reveal } from "@/components/motion/reveal";
import { SectionHeading } from "@/components/marketing/section-heading";

const problems = [
  { icon: Clock, title: "You're busy serving", text: "Customers message while you're with someone else — and they don't wait long." },
  { icon: Inbox, title: "Messages get buried", text: "Customer chats sit between family groups and suppliers until they're forgotten." },
  { icon: Repeat, title: "Same questions, every day", text: "“How much?” “Where are you?” “Are you open?” — typed by hand, again and again." },
  { icon: MoonStar, title: "Nobody replies at night", text: "Customers who message at 22:00 buy elsewhere by morning." },
  { icon: UserX, title: "Leads go cold", text: "A slow reply is a lost customer. They simply message the next shop." },
  { icon: ShoppingBag, title: "Orders slip through", text: "Order details spread across chats and voice notes are easy to miss." },
];

const notifications = [
  { name: "Nadège", text: "How much is delivery to Bonapriso?", time: "22:14" },
  { name: "+237 6•• ••• 412", text: "Are you open on Sunday?", time: "21:52" },
  { name: "Serge", text: "I want 3 of the blue ones. Can I order?", time: "21:30" },
  { name: "Clarisse", text: "Hello?? Still waiting", time: "20:05" },
];

export function Problem() {
  return (
    <section aria-labelledby="problem-title" className="py-20 sm:py-28">
      <div className="container-page">
        <SectionHeading
          id="problem-title"
          eyebrow="The problem"
          title="Your customers are messaging. Are you answering?"
          description="For most African businesses, WhatsApp is the shop front. But one person can't reply to every message, all day, every day."
        />

        <div className="mt-14 grid items-center gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
          <div className="relative mx-auto w-full max-w-sm" aria-hidden>
            <div className="bg-geo-light rounded-[2rem] bg-deep p-5 pb-8 shadow-float">
              <div className="flex items-center justify-between text-cream/80">
                <span className="flex items-center gap-1.5 text-xs"><BellRing className="size-3.5" /> Unanswered</span>
                <span className="rounded-full bg-coral-500 px-2.5 py-0.5 text-xs font-bold text-deep">23 chats</span>
              </div>
              <p className="mt-3 font-display text-5xl font-bold tracking-tight text-cream">22:17</p>
              <ul className="mt-5 space-y-2.5">
                {notifications.map((n, i) => (
                  <li key={n.name} className="flex gap-3 rounded-2xl bg-cream/10 p-3" style={{ opacity: 1 - i * 0.15 }}>
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-cream/15 text-cream">
                      <MessageCircle className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex justify-between text-xs font-semibold text-cream">
                        {n.name}
                        <span className="font-normal text-cream/60">{n.time}</span>
                      </p>
                      <p className="truncate text-xs text-cream/75">{n.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2">
            {problems.map(({ icon: Icon, title, text }, i) => (
              <Reveal as="li" key={title} delay={i * 60}>
                <div className="flex h-full gap-4 rounded-2xl border border-border bg-card p-5 shadow-card transition-shadow hover:shadow-float">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-coral-100 text-coral-700">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <h3 className="type-h3 text-base">{title}</h3>
                    <p className="type-small mt-1 text-slate">{text}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
