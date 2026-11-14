import Link from "next/link";
import { ArrowRight, BadgeCheck, Bot, CheckCheck, ChevronLeft, FileText, GraduationCap, Hand, Store, UtensilsCrossed, Zap } from "lucide-react";

import { WazaBoltIcon } from "@/components/brand/logo";
import { SectionHeading } from "@/components/marketing/section-heading";
import { VerticalTabs } from "@/components/marketing/vertical-tabs";
import { plans } from "@/config/plans";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatNumber } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages/en";

/*
 * The home page's business-type showcase: Shops, Restaurants, Schools. Each
 * tab: a one-line outcome, three workflow bullets (automated replies —
 * labelled "coming soon" until the AI assistant launches —, sharing the
 * catalogue / menu / fees, and the one-tap hand-off to a person), and a
 * WhatsApp chat preview for that business type.
 *
 * UI MOCKUPS: illustrative conversations, not real customers; labelled as an
 * example of the coming assistant. No WhatsApp logo is drawn.
 */

type Showcase = Messages["showcase"];
type Vertical = Showcase["verticals"]["shops"];

const VERTICALS = [
  { key: "shops", icon: Store, href: "/solutions/retail" },
  { key: "restaurants", icon: UtensilsCrossed, href: "/solutions/restaurants" },
  { key: "schools", icon: GraduationCap, href: "/schools" },
] as const;

const BULLET_ICONS = [Bot, Zap, Hand];

function ChatPreview({ v, s }: { v: Vertical; s: Showcase }) {
  const c = v.chat;
  return (
    <figure className="mx-auto w-full max-w-[320px]" data-testid="showcase-chat">
      <div className="overflow-hidden rounded-[2rem] border-[6px] border-deep bg-deep shadow-float">
        <div className="flex items-center gap-2.5 bg-chat-header px-3 py-2.5 text-white">
          <ChevronLeft className="size-4 opacity-80" aria-hidden />
          <span className="grid size-8 place-items-center rounded-full bg-gold-100 font-display text-xs font-extrabold text-deep">{c.initials}</span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="flex items-center gap-1 truncate text-sm font-semibold">
              {c.business} <BadgeCheck className="size-3.5 shrink-0 text-white/80" aria-hidden />
            </p>
            <p className="text-[0.6875rem] text-white/75">{s.online}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 bg-chat-wallpaper px-2.5 py-3" aria-label={s.previewLabel}>
          {c.messages.map((m, i) => (
            <div key={i}>
              {m.kind === "event" ? (
                <p className="mx-auto w-fit rounded-full bg-white/85 px-3 py-1 text-center text-[0.6875rem] font-semibold text-waza-700 shadow-[0_1px_1px_rgb(16_42_42/0.08)]">{m.text}</p>
              ) : m.kind === "card" ? (
                <div className="flex justify-start pl-7">
                  <div className="w-[78%] overflow-hidden rounded-2xl rounded-tl-md bg-chat-in shadow-[0_1px_1px_rgb(16_42_42/0.08)]">
                    <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                      <FileText className="size-4 shrink-0 text-waza-600" aria-hidden />
                      <p className="min-w-0 text-[0.75rem] leading-tight">
                        <span className="block font-semibold text-deep">{m.text}</span>
                        <span className="block text-slate">{m.meta}</span>
                      </p>
                    </div>
                    <p className="py-1.5 text-center text-[0.75rem] font-semibold text-waza-700">{m.cta}</p>
                  </div>
                </div>
              ) : (
                <div className={cn("flex items-end gap-1.5", m.kind === "out" ? "justify-end" : "justify-start")}>
                  {m.kind === "ai" ? <WazaBoltIcon className="mb-1 size-6 shrink-0" /> : m.kind === "team" ? <span className="mb-1 grid size-6 shrink-0 place-items-center rounded-full bg-gold text-[0.625rem] font-bold text-deep">{c.teamInitial}</span> : null}
                  <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-[0.8125rem] leading-snug text-deep shadow-[0_1px_1px_rgb(16_42_42/0.08)]", m.kind === "out" ? "rounded-tr-md bg-chat-out" : "rounded-tl-md bg-chat-in")}>
                    {m.kind === "ai" ? <p className="mb-0.5 text-[0.625rem] font-bold uppercase tracking-wider text-waza-700">{s.assistant}</p> : null}
                    {m.kind === "team" ? <p className="mb-0.5 text-[0.625rem] font-bold uppercase tracking-wider text-gold-800">{c.team}</p> : null}
                    {m.text}
                    <p className="mt-0.5 flex items-center justify-end gap-1 text-[0.625rem] text-slate/80">
                      {m.time}
                      {m.kind === "out" ? <CheckCheck className="size-3.5 text-chat-tick" aria-label={s.read} /> : null}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-slate" data-testid="showcase-caption">
        {s.previewNote}
      </figcaption>
    </figure>
  );
}

export async function VerticalShowcase() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const s = t.showcase;
  const vars = { kitchen: formatNumber(plans[0].maxKitchen, locale), teachers: formatNumber(plans[0].maxTeachers, locale) };
  const panels = VERTICALS.map(({ key, href }) => {
    const v = s.verticals[key];
    return (
      <div key={key} className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]" data-testid={`showcase-${key}`}>
        <div>
          <h3 className="type-h2 text-2xl sm:text-3xl">{v.headline}</h3>
          <ul className="mt-6 flex flex-col gap-4">
            {v.bullets.map((b, i) => {
              const Icon = BULLET_ICONS[i] ?? Zap;
              return (
                <li key={b.title} className="flex gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-mint text-waza-700">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-deep">
                      {b.title}
                      {b.soon ? (
                        <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[0.6875rem] font-bold text-gold-800" data-testid="showcase-soon">
                          {s.soon}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-sm text-slate">{b.text}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-6 text-sm text-slate">{format(v.note, vars)}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={localizePath(locale, key === "schools" ? "/register?type=schools" : `/register?type=${key === "shops" ? "shop" : "restaurant"}`)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground">
              {s.start} <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link href={localizePath(locale, href)} className="inline-flex min-h-11 items-center rounded-full border border-line bg-white px-5 text-sm font-semibold text-deep hover:bg-mint">
              {v.more}
            </Link>
          </div>
        </div>
        <ChatPreview v={v} s={s} />
      </div>
    );
  });
  return (
    <section id="showcase" aria-labelledby="showcase-title" className="bg-mint/50 py-16 sm:py-20">
      <div className="container-page">
        <SectionHeading id="showcase-title" eyebrow={s.eyebrow} title={s.title} description={s.description} />
        <div className="mt-10">
          <VerticalTabs
            label={s.tabsLabel}
            tabs={VERTICALS.map(({ key, icon: Icon }) => ({ key, label: s.verticals[key].tab, icon: <Icon className="size-4" aria-hidden /> }))}
            panels={panels}
          />
        </div>
      </div>
    </section>
  );
}
