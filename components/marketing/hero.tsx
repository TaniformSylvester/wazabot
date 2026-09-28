import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Clock, Languages, PlayCircle, ShieldCheck, ShoppingBag, Zap } from "lucide-react";

import { ChannelBadge } from "@/components/brand/channel-badge";
import { LogoMark } from "@/components/brand/logo";
import { Eyebrow, Highlight } from "@/components/marketing/section-heading";
import { Button } from "@/components/ui/button";

const trust = [
  { icon: Clock, title: "Set up in minutes", text: "No developers needed" },
  { icon: Languages, title: "English & French", text: "Replies in your customer's language" },
  { icon: ShieldCheck, title: "You stay in control", text: "Take over any conversation" },
];

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <div
        aria-hidden
        className="bg-geo pointer-events-none absolute inset-y-0 right-0 -z-10 w-2/3 [mask-image:radial-gradient(70%_70%_at_80%_30%,black,transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-40 -z-10 size-[36rem] rounded-full bg-bolt-200/50 blur-3xl"
      />
      <div className="container-page grid items-center gap-12 pb-16 pt-8 sm:pt-12 xl:grid-cols-[1.08fr_1fr] xl:gap-8 xl:pb-24 xl:pt-12">
        <div className="flex flex-col items-start">
          <Eyebrow>WhatsApp Business Automation for Africa</Eyebrow>

          <h1 id="hero-title" className="type-display mt-6 max-w-3xl">
            Power <Highlight>your business</Highlight> on WhatsApp.
          </h1>

          <p className="type-lead mt-6 max-w-xl text-stone">
            Automate conversations, manage customers, capture orders and grow your business — all from
            one powerful platform built for African businesses.
          </p>

          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button asChild size="lg" className="group">
              <Link href="/register">
                Get Started
                <Zap className="size-5 fill-current transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-110" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/#how-it-works">
                <PlayCircle className="size-5" />
                See How It Works
              </Link>
            </Button>
          </div>

          <ul className="mt-10 grid w-full gap-5 sm:grid-cols-3 sm:gap-4">
            {trust.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink text-bolt-400">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{title}</p>
                  <p className="type-small text-stone">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <HeroFlow />
      </div>
    </section>
  );
}

const steps = [
  "Product found: Robe en wax",
  "Stock checked: size L available",
  "Price from your catalogue",
  "Reply sent · order started",
];

/**
 * UI MOCKUP — original product visual: Customer message → WazaBolt
 * automation → Business action. Illustrative data only.
 */
function HeroFlow() {
  return (
    <div className="relative mx-auto w-full max-w-md sm:h-[600px] sm:max-w-[600px] xl:mr-0">
      {/* business owner */}
      <div className="relative mb-8 sm:absolute sm:left-0 sm:top-20 sm:mb-0 sm:w-[280px]">
        <div
          aria-hidden
          className="bg-bolt-gradient absolute -inset-3 -z-10 hidden rotate-[-5deg] rounded-[2.25rem] sm:block"
        />
        <Image
          src="/images/hero-owner.webp"
          alt="A smiling shop owner in a colourful head wrap checks customer orders on her phone"
          width={366}
          height={440}
          preload
          sizes="(min-width: 640px) 280px, 90vw"
          className="aspect-[4/3] w-full rounded-[2rem] object-cover object-[center_25%] shadow-float sm:aspect-[366/440]"
        />
        <span className="absolute bottom-4 left-4 rounded-full bg-ink/85 px-3 py-1.5 text-xs font-medium text-sand backdrop-blur">
          MJ Fashion · Douala
        </span>
      </div>

      {/* flow */}
      <ol className="relative z-10 flex flex-col sm:absolute sm:right-0 sm:top-0 sm:w-[350px]" aria-label="How WazaBolt handles a customer message">
        <li className="animate-bubble-in rounded-2xl border border-border bg-card p-4 shadow-float">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-full bg-volt-100 text-xs font-bold text-volt-700">SM</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Sarah M.</p>
              <ChannelBadge />
            </div>
            <span className="text-[0.6875rem] text-stone">10:24</span>
          </div>
          <p className="mt-3 rounded-xl rounded-tl-sm bg-sand-100 px-3 py-2 text-sm text-ink">
            Hi, do you have this dress in size L?
          </p>
        </li>

        <Connector />

        <li className="animate-bubble-in rounded-2xl bg-ink p-4 text-sand shadow-float [animation-delay:150ms]">
          <div className="flex items-center gap-2.5">
            <LogoMark variant="glyph" className="size-7" />
            <p className="flex-1 font-display text-sm font-bold">WazaBolt automation</p>
            <span className="flex items-center gap-1.5 text-[0.6875rem] text-bolt-400">
              <span className="relative flex size-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-bolt-400 opacity-70" />
                <span className="relative size-2 rounded-full bg-bolt-500" />
              </span>
              Running
            </span>
          </div>
          <ul className="mt-3 space-y-2">
            {steps.map((s, i) => (
              <li
                key={s}
                className="flex animate-bubble-in items-center gap-2 text-[0.8125rem] text-sand/85"
                style={{ animationDelay: `${500 + i * 350}ms` }}
              >
                <span className="grid size-4.5 shrink-0 place-items-center rounded-full bg-bolt-500 text-ink">
                  <Check className="size-3" strokeWidth={3} aria-hidden />
                </span>
                {s}
              </li>
            ))}
          </ul>
        </li>

        <Connector delay />

        <li className="animate-bubble-in rounded-2xl border-l-4 border-bolt-500 bg-card p-4 shadow-float [animation-delay:1900ms]">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-bolt-100 text-bolt-800">
              <ShoppingBag className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">New order #1042</p>
              <p className="type-small truncate text-stone">Robe en wax · Size L · 15,000 XAF</p>
            </div>
            <span className="rounded-full bg-ember-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-ember-700">New</span>
          </div>
          <p className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-xs text-stone">
            <ArrowRight className="size-3.5 text-ember-600" aria-hidden />
            Added to <span className="font-semibold text-ink">Orders</span> — your team is notified
          </p>
        </li>
      </ol>
    </div>
  );
}

/** Vertical link between flow cards, with a small pulse travelling down it. */
function Connector({ delay = false }: { delay?: boolean }) {
  return (
    <li aria-hidden className="relative mx-auto h-8 w-0.5 overflow-hidden bg-[repeating-linear-gradient(to_bottom,var(--color-sand-300)_0_4px,transparent_4px_8px)]">
      <span
        className="absolute left-1/2 size-1.5 -translate-x-1/2 animate-flow rounded-full bg-ember-500 shadow-[0_0_8px_var(--color-bolt-400)]"
        style={delay ? { animationDelay: "1.2s" } : undefined}
      />
    </li>
  );
}
