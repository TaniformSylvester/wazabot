import { Bot, Check, MessageCircle, Share2 } from "lucide-react";

import { SectionHeading } from "@/components/marketing/section-heading";
import { getMessages } from "@/lib/i18n/dictionaries";

/** How WhatsApp fits in: usable from day one without Meta, and what connecting a number adds. The AI assistant: coming soon. */
export async function WhatsAppSetup() {
  const t = (await getMessages()).howItWorks.setup;
  const card = (key: "now" | "connected", Icon: typeof Share2, featured: boolean) => (
    <li className={featured ? "rounded-2xl bg-deep p-6 text-white shadow-float" : "rounded-2xl border border-line bg-white p-6 shadow-card"} data-testid={`whatsapp-setup-${key}`}>
      <span className={featured ? "rounded-full bg-gold px-3 py-1 text-xs font-bold text-deep" : "rounded-full bg-mint px-3 py-1 text-xs font-bold text-waza-700"}>{t[key].badge}</span>
      <h3 className={`type-h3 mt-4 flex items-center gap-2 text-lg ${featured ? "text-white" : ""}`}>
        <Icon className={featured ? "size-5 text-waza-400" : "size-5 text-waza-600"} aria-hidden /> {t[key].title}
      </h3>
      <ul className="mt-4 flex flex-col gap-2 text-sm">
        {t[key].points.map((p) => (
          <li key={p} className={`flex items-start gap-2 ${featured ? "text-white/85" : "text-slate"}`}>
            <Check className={featured ? "mt-0.5 size-4 shrink-0 text-waza-400" : "mt-0.5 size-4 shrink-0 text-waza-600"} aria-hidden />
            {p}
          </li>
        ))}
      </ul>
    </li>
  );
  return (
    <section id="whatsapp-setup" aria-labelledby="whatsapp-setup-title" className="bg-mint/60 py-20 sm:py-24">
      <div className="container-page">
        <SectionHeading id="whatsapp-setup-title" title={t.title} description={t.description} />
        <ul className="mt-12 grid gap-5 md:grid-cols-2">
          {card("now", Share2, false)}
          {card("connected", MessageCircle, true)}
        </ul>
        <p className="mx-auto mt-6 flex max-w-3xl items-start gap-2 rounded-xl bg-gold-50 px-4 py-3 text-sm text-deep" data-testid="whatsapp-setup-ai">
          <Bot className="mt-0.5 size-4 shrink-0 text-gold-800" aria-hidden />
          {t.ai}
        </p>
      </div>
    </section>
  );
}
