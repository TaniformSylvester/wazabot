import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, MapPin, MessageCircle, ShoppingBag, Smartphone } from "lucide-react";

import { WazaBoltBadge } from "@/components/brand/wazabolt-badge";
import { WhatsAppChatMockup } from "@/components/conversations/whatsapp-chat-mockup";
import { DashboardMockCompact } from "@/components/marketing/dashboard-mock";
import { Highlight } from "@/components/marketing/section-heading";
import { Button } from "@/components/ui/button";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { startHref, whatsappOnboardingHref } from "@/lib/waitlist/mode";
import { format, formatXaf } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { plain, rich } from "@/lib/i18n/rich";

/** Icons for the three trust-bar facts, in order: made in Cameroon, any Android phone, free setup. */
const TRUST_ICONS = [MapPin, Smartphone, BadgeCheck];

export async function Hero() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const h = t.hero;
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_60%_at_85%_20%,var(--color-mint)_0%,transparent_70%),radial-gradient(35%_40%_at_70%_90%,var(--color-gold-50)_0%,transparent_70%)]"
      />
      <div className="container-page grid items-center gap-12 pb-16 pt-8 sm:pt-12 xl:grid-cols-[1.05fr_1fr] xl:gap-8 xl:pb-24 xl:pt-10">
        <div className="flex flex-col items-start">
          <WazaBoltBadge className="py-1.5 text-sm">{h.badge}</WazaBoltBadge>

          <h1 id="hero-title" className="type-display mt-6 max-w-3xl text-balance">
            {rich(h.title, { hl: (c) => <Highlight>{c}</Highlight> })}
          </h1>

          <p className="type-lead mt-5 max-w-xl text-slate">{h.lead}</p>

          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
            <Button asChild size="lg" className="group h-auto min-h-13 max-w-full whitespace-normal py-3 text-center leading-snug">
              <Link href={startHref(locale)} data-testid="hero-start">
                {t.common.nav.trialCta}
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-auto min-h-13 max-w-full whitespace-normal py-3 text-center leading-snug">
              <a href={whatsappOnboardingHref(locale)} target="_blank" rel="noopener noreferrer" data-testid="hero-whatsapp">
                <MessageCircle className="size-5 text-waza-600" aria-hidden />
                {t.common.nav.whatsappSetup}
              </a>
            </Button>
          </div>
          <p className="mt-3 text-sm font-medium text-slate" data-testid="hero-helper">
            {t.common.nav.trialHelper}
          </p>

          <ul className="mt-8 flex w-full flex-col gap-3 border-y border-line py-4 sm:flex-row sm:flex-wrap sm:gap-x-6" data-testid="hero-trust">
            {h.trustBar.map((text, i) => {
              const Icon = TRUST_ICONS[i] ?? BadgeCheck;
              return (
                <li key={text} className="flex items-center gap-2 text-sm font-semibold text-deep">
                  <Icon className="size-4 shrink-0 text-waza-600" aria-hidden />
                  {text}
                </li>
              );
            })}
          </ul>

          <Link href={localizePath(locale, "/#showcase")} className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-waza-700 hover:underline" data-testid="hero-showcase">
            {h.seeShowcase} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>

        <HeroVisual photoAlt={plain(h.photoAlt)} orderCaptured={h.orderCaptured} orderItem={format(h.orderItem, { price: formatXaf(15_000, locale) })} />
      </div>
    </section>
  );
}

/**
 * UI MOCKUP — business owner, a receipt shared on WhatsApp by the shop's
 * team (works today), and a compact WazaBolt dashboard. Stacks on mobile,
 * overlaps from sm. Illustrative data only.
 */
function HeroVisual({ photoAlt, orderCaptured, orderItem }: { photoAlt: string; orderCaptured: string; orderItem: string }) {
  return (
    <div className="relative mx-auto flex w-full max-w-md flex-col sm:h-[730px] sm:max-w-[590px] xl:mr-0">
      {/* business owner */}
      <div className="relative w-[82%] sm:absolute sm:left-0 sm:top-10 sm:w-[350px]">
        <div aria-hidden className="bg-brand-gradient absolute -inset-3 -z-10 rotate-[-4deg] rounded-[2.25rem] opacity-90" />
        <Image
          src="/images/hero-owner.webp"
          alt={photoAlt}
          width={366}
          height={440}
          preload
          sizes="(min-width: 640px) 350px, 80vw"
          className="aspect-[366/440] w-full rounded-[1.75rem] object-cover shadow-float"
        />
        <div className="absolute -left-4 bottom-24 hidden items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-float sm:flex">
          <span className="grid size-8 place-items-center rounded-full bg-gold text-deep">
            <ShoppingBag className="size-4" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="text-xs font-semibold text-deep">{orderCaptured}</p>
            <p className="text-[0.6875rem] text-slate">{orderItem}</p>
          </div>
        </div>
      </div>

      {/* the customer's WhatsApp chat: the shop sends the receipt (demo) */}
      <div className="relative z-20 -mt-40 w-[78%] self-end sm:absolute sm:right-0 sm:top-0 sm:mt-0 sm:w-[300px]">
        <WhatsAppChatMockup />
      </div>

      {/* WazaBolt dashboard */}
      <DashboardMockCompact className="hidden sm:absolute sm:bottom-0 sm:left-6 sm:z-10 sm:block sm:w-[440px]" />
    </div>
  );
}
