import { Bot, CreditCard, Globe, Hand, Languages, Mic, ShieldCheck } from "lucide-react";

import { WazaBoltIcon } from "@/components/brand/logo";
import { WazaBoltBadge } from "@/components/brand/wazabolt-badge";
import { SectionHeading } from "@/components/marketing/section-heading";
import { aiLaunchedForPublicPages } from "@/lib/billing/ai-flag";
import { getMessages } from "@/lib/i18n/dictionaries";

const POINT_ICONS = [Languages, ShieldCheck, Hand];
/** Not in the first release, from the features section's "Planned" list. */
const PLANNED = [
  { key: "mobileMoney", icon: CreditCard },
  { key: "voiceImages", icon: Mic },
  { key: "morePacks", icon: Globe },
] as const;

/**
 * The home page's single "Coming next" section: the WhatsApp AI assistant
 * (and the other planned features), in one place lower on the page, so the
 * sections above show only what works today. Hidden once the assistant has
 * launched (the AI then appears with the plans).
 */
export async function ComingNext() {
  const [t, launched] = await Promise.all([getMessages(), aiLaunchedForPublicPages()]);
  if (launched) return null;
  const c = t.comingNext;
  return (
    <section id="coming-next" aria-labelledby="coming-next-title" className="py-20 sm:py-24" data-testid="coming-next">
      <div className="container-page">
        <div className="grid items-center gap-10 rounded-3xl border border-dashed border-line-strong bg-white/70 p-6 sm:p-10 lg:grid-cols-[1.2fr_1fr]">
          <div className="min-w-0">
            <SectionHeading align="left" id="coming-next-title" eyebrow={c.eyebrow} title={c.title} description={c.description} />
            <ul className="mt-8 flex flex-col gap-4">
              {c.points.map((p, i) => {
                const Icon = POINT_ICONS[i] ?? Bot;
                return (
                  <li key={p.title} className="flex gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold-100 text-gold-800">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-deep">{p.title}</p>
                      <p className="mt-0.5 text-sm text-slate">{p.text}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-6 rounded-xl bg-gold-50 px-4 py-3 text-sm text-deep" data-testid="coming-next-status">
              {c.status}
            </p>
          </div>
          <div className="min-w-0">
            <figure className="mx-auto w-full max-w-sm rounded-2xl bg-chat-wallpaper p-4 shadow-card">
              <figcaption className="mb-3 text-center text-xs font-semibold uppercase tracking-wider text-slate">{c.sampleLabel}</figcaption>
              <p className="ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-chat-out px-3 py-2 text-sm text-deep">{c.sample.pidgin}</p>
              <div className="mt-2 flex items-end gap-1.5">
                <WazaBoltIcon className="mb-1 size-6 shrink-0" />
                <p className="max-w-[85%] rounded-2xl rounded-tl-md bg-chat-in px-3 py-2 text-sm text-deep">{c.sample.reply}</p>
              </div>
            </figure>
            <div className="mt-6 flex flex-col items-center gap-3">
              <WazaBoltBadge tone="gold" icon={false} className="uppercase tracking-wider">
                {c.alsoPlanned}
              </WazaBoltBadge>
              <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2">
                {PLANNED.map(({ key, icon: Icon }) => (
                  <li key={key} className="inline-flex items-center gap-2 text-sm text-slate">
                    <Icon className="size-4" aria-hidden /> {t.features.planned[key]}
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
