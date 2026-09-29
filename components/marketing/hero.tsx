import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Hand, Languages, MessageCircle, PlayCircle, ShoppingBag, Zap } from "lucide-react";

import { WazaBoltBadge } from "@/components/brand/wazabolt-badge";
import { WhatsAppChatMockup } from "@/components/conversations/whatsapp-chat-mockup";
import { DashboardMockCompact } from "@/components/marketing/dashboard-mock";
import { Highlight } from "@/components/marketing/section-heading";
import { Button } from "@/components/ui/button";

const trust = [
  { icon: Zap, title: "Quick Setup", text: "In minutes, not days", tone: "text-gold-600" },
  { icon: MessageCircle, title: "Works on WhatsApp", text: "No app for customers", tone: "text-waza-600" },
  { icon: Hand, title: "Human Takeover", text: "Step in any time", tone: "text-waza-600" },
  { icon: Languages, title: "English + French", text: "Replies in their language", tone: "text-waza-600" },
];

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_60%_at_85%_20%,var(--color-mint)_0%,transparent_70%),radial-gradient(35%_40%_at_70%_90%,var(--color-gold-50)_0%,transparent_70%)]"
      />
      <div className="container-page grid items-center gap-12 pb-16 pt-8 sm:pt-12 xl:grid-cols-[1.05fr_1fr] xl:gap-8 xl:pb-24 xl:pt-10">
        <div className="flex flex-col items-start">
          <WazaBoltBadge className="py-1.5 text-sm">Built for African Businesses</WazaBoltBadge>

          <h1 id="hero-title" className="type-display mt-6 max-w-3xl">
            Power your business on <Highlight>WhatsApp.</Highlight>
          </h1>
          <p className="mt-4 font-display text-xl font-bold text-deep sm:text-2xl">
            Never miss a{" "}
            <span className="underline decoration-gold decoration-4 underline-offset-[6px]">customer.</span>
          </p>

          <p className="type-lead mt-5 max-w-xl text-slate">
            <strong className="font-semibold text-deep">WazaBolt</strong> is your AI business assistant on
            WhatsApp. It answers customer questions, shares products and prices, captures orders and hands
            conversations to your team when needed.
          </p>

          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button asChild size="lg" className="group">
              <Link href="/register">
                Start Free
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/#how-it-works">
                <PlayCircle className="size-5 text-waza-600" />
                See How It Works
              </Link>
            </Button>
          </div>

          <ul className="mt-10 grid w-full grid-cols-2 gap-5 sm:grid-cols-4 sm:gap-4 xl:grid-cols-2 xl:gap-x-8">
            {trust.map(({ icon: Icon, title, text, tone }) => (
              <li key={title} className="flex items-start gap-2.5">
                <Icon className={`mt-0.5 size-5 shrink-0 ${tone}`} aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-deep">{title}</p>
                  <p className="text-xs text-slate">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

/**
 * UI MOCKUP — business owner, a demo WhatsApp conversation answered by
 * WazaBolt AI, and a compact WazaBolt dashboard. Stacks on mobile, overlaps
 * from sm. Illustrative data only.
 */
function HeroVisual() {
  return (
    <div className="relative mx-auto flex w-full max-w-md flex-col sm:h-[730px] sm:max-w-[590px] xl:mr-0">
      {/* business owner */}
      <div className="relative w-[82%] sm:absolute sm:left-0 sm:top-10 sm:w-[350px]">
        <div aria-hidden className="bg-brand-gradient absolute -inset-3 -z-10 rotate-[-4deg] rounded-[2.25rem] opacity-90" />
        <Image
          src="/images/hero-owner.webp"
          alt="A smiling shop owner in a colourful head wrap checks customer messages on her phone"
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
            <p className="text-xs font-semibold text-deep">New order captured</p>
            <p className="text-[0.6875rem] text-slate">Robe en wax · 15,000 XAF</p>
          </div>
        </div>
      </div>

      {/* customer's WhatsApp chat (demo) */}
      <div className="relative z-20 -mt-40 w-[78%] self-end sm:absolute sm:right-0 sm:top-0 sm:mt-0 sm:w-[300px]">
        <WhatsAppChatMockup />
      </div>

      {/* WazaBolt dashboard */}
      <DashboardMockCompact className="hidden sm:absolute sm:bottom-0 sm:left-6 sm:z-10 sm:block sm:w-[440px]" />
    </div>
  );
}
