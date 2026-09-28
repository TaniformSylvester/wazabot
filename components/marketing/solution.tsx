import { Ban, Check } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { Highlight, SectionHeading } from "@/components/marketing/section-heading";

const duties = [
  "Answer your FAQs",
  "Share your products",
  "Give prices from your catalogue",
  "Check availability you've recorded",
  "Capture customer details",
  "Help create orders",
  "Answer opening-hours questions",
  "Share your delivery information",
  "Hand conversations to your team",
];

const never = [
  "Invent a price, stock level or delivery fee",
  "Confirm a payment it hasn't seen",
  "Approve refunds or make promises for you",
];

export function Solution() {
  return (
    <section aria-labelledby="solution-title" className="bg-deep py-20 text-white sm:py-28">
      <div className="container-page grid items-center gap-14 lg:grid-cols-2">
        <div>
          <SectionHeading
            align="left"
            id="solution-title"
            eyebrow="The solution"
            title={
              <span className="text-white">
                Meet your new <Highlight className="text-waza-400">AI receptionist.</Highlight>
              </span>
            }
            description={
              <span className="text-white/75">
                WazaBot works inside your WhatsApp Business number. It learns your products, prices and
                policies — then answers customers the way a well-trained member of staff would.
              </span>
            }
          />

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-gold">
              <Ban className="size-4" aria-hidden /> What WazaBot will never do
            </p>
            <ul className="mt-3 space-y-2">
              {never.map((item) => (
                <li key={item} className="text-sm text-white/80">
                  — {item}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-white/60">
              If it can&apos;t confirm something, it says so and brings in your team.
            </p>
          </div>
        </div>

        {/* "Staff card" — reinforces the AI-employee framing */}
        <div className="relative mx-auto w-full max-w-md">
          <div aria-hidden className="absolute left-1/2 top-0 h-10 w-24 -translate-x-1/2 -translate-y-6 rounded-t-xl border-4 border-b-0 border-white/20" />
          <div className="relative overflow-hidden rounded-3xl bg-cream text-deep shadow-float">
            <div className="flex items-center gap-4 bg-waza-700 px-6 py-5 text-white">
              <span className="grid size-16 place-items-center rounded-2xl bg-white">
                <LogoMark className="size-12" />
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/75">Staff card</p>
                <p className="font-heading text-2xl font-extrabold">WazaBot</p>
                <p className="text-sm text-white/85">AI Receptionist · MJ Fashion</p>
              </div>
            </div>
            <dl className="grid grid-cols-3 divide-x divide-border border-b border-border text-center">
              {[
                ["Shift", "24/7"],
                ["Languages", "EN · FR"],
                ["Reports to", "You"],
              ].map(([k, v]) => (
                <div key={k} className="px-2 py-3">
                  <dt className="text-[0.6875rem] uppercase tracking-wider text-slate-waza">{k}</dt>
                  <dd className="font-heading text-sm font-bold">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-waza">Job description</p>
              <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {duties.map((d) => (
                  <li key={d} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full bg-waza-500 text-white">
                      <Check className="size-3" strokeWidth={3} aria-hidden />
                    </span>
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
