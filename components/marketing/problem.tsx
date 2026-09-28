import { Clock, Inbox, MoonStar, Repeat, ShoppingBag, UserX } from "lucide-react";

import { WhatsAppIcon } from "@/components/brand/whatsapp-icon";
import { SectionHeading } from "@/components/marketing/section-heading";

const problems = [
  { icon: Clock, title: "You're busy serving", text: "Customers message while you're with someone else — and they don't wait long." },
  { icon: Inbox, title: "Messages get buried", text: "Chats from customers sit between family groups and suppliers until they're forgotten." },
  { icon: Repeat, title: "Same questions, every day", text: "“How much?” “Where are you?” “Are you open?” — typed by hand, again and again." },
  { icon: MoonStar, title: "Nobody replies at night", text: "You can't answer 24/7. Customers who message at 22:00 buy elsewhere by morning." },
  { icon: UserX, title: "Leads go cold", text: "A slow reply is a lost customer. They simply message the next shop." },
  { icon: ShoppingBag, title: "Orders slip through", text: "Order details spread across chats and voice notes are easy to miss." },
];

const notifications = [
  { name: "Nadège", text: "How much is delivery to Bonapriso?", time: "22:14" },
  { name: "+237 6•• ••• 412", text: "Are you open on Sunday?", time: "21:52" },
  { name: "Serge", text: "I want 3 of the blue ones. Can I order?", time: "21:30" },
  { name: "Clarisse", text: "Hello?? Still waiting 😕", time: "20:05" },
];

export function Problem() {
  return (
    <section aria-labelledby="problem-title" className="py-20 sm:py-28">
      <div className="container-page">
        <SectionHeading
          id="problem-title"
          eyebrow="The problem"
          title="Your customers are messaging. Are you answering?"
          description="For most businesses, WhatsApp is the shop front. But one person can't reply to every message, all day, every day."
        />

        <div className="mt-14 grid items-center gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
          <div className="relative mx-auto w-full max-w-sm" aria-hidden>
            <div className="rounded-[2rem] bg-deep p-5 pb-8 shadow-float">
              <div className="flex items-center justify-between text-white/80">
                <span className="text-xs">Unanswered</span>
                <span className="rounded-full bg-coral px-2.5 py-0.5 text-xs font-bold text-white">
                  23 chats
                </span>
              </div>
              <p className="mt-3 font-heading text-5xl font-bold text-white">22:17</p>
              <ul className="mt-5 space-y-2.5">
                {notifications.map((n, i) => (
                  <li
                    key={n.name}
                    className="flex gap-3 rounded-2xl bg-white/10 p-3 backdrop-blur"
                    style={{ opacity: 1 - i * 0.14 }}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-waza-500 text-white">
                      <WhatsAppIcon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex justify-between text-xs font-semibold text-white">
                        {n.name}
                        <span className="font-normal text-white/60">{n.time}</span>
                      </p>
                      <p className="truncate text-xs text-white/75">{n.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2">
            {problems.map(({ icon: Icon, title, text }) => (
              <li
                key={title}
                className="flex gap-4 rounded-2xl border border-border bg-white p-5 shadow-card transition-shadow hover:shadow-float"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-coral-100 text-[#c2401f]">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-base font-bold">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-waza">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
