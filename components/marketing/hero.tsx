import Image from "next/image";
import Link from "next/link";
import { Clock, Languages, PlayCircle, ShieldCheck, ShoppingBag, Zap } from "lucide-react";

import { CustomerChatPreview } from "@/components/conversations/customer-chat-preview";
import { DashboardMockCompact } from "@/components/marketing/dashboard-mock";
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

        <HeroVisual />
      </div>
    </section>
  );
}

/**
 * UI MOCKUP — business owner, the customer's WhatsApp chat with MJ Fashion
 * (answered by WazaBolt) and a compact WazaBolt dashboard. Stacks on
 * mobile, overlaps from sm. Illustrative data only.
 */
function HeroVisual() {
  return (
    <div className="relative mx-auto flex w-full max-w-md flex-col sm:h-[620px] sm:max-w-[580px] xl:mr-0">
      {/* business owner */}
      <div className="relative w-[82%] sm:absolute sm:left-0 sm:top-8 sm:w-[350px]">
        <div
          aria-hidden
          className="bg-bolt-gradient absolute -inset-3 -z-10 rotate-[-4deg] rounded-[2.5rem]"
        />
        <Image
          src="/images/hero-owner.webp"
          alt="A smiling shop owner in a colourful head wrap checks customer messages on her phone"
          width={366}
          height={440}
          preload
          sizes="(min-width: 640px) 350px, 80vw"
          className="aspect-[366/440] w-full rounded-[2rem] object-cover shadow-float"
        />
        <div className="absolute -left-4 bottom-24 hidden items-center gap-2 rounded-2xl bg-card px-3 py-2 shadow-float sm:flex">
          <span className="grid size-8 place-items-center rounded-full bg-bolt-500 text-ink">
            <ShoppingBag className="size-4" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="text-xs font-semibold text-ink">New order captured</p>
            <p className="text-[0.6875rem] text-stone">Robe en wax · 15,000 XAF</p>
          </div>
        </div>
      </div>

      {/* customer's WhatsApp chat */}
      <div className="relative z-20 -mt-40 w-[74%] self-end sm:absolute sm:right-0 sm:top-0 sm:mt-0 sm:w-[290px]">
        <CustomerChatPreview />
        <span className="absolute -left-5 top-[7.5rem] inline-flex items-center gap-1 rounded-full bg-ink py-1 pl-1.5 pr-2.5 text-[0.6875rem] font-semibold text-bolt-400 shadow-float sm:-left-8">
          <Zap className="size-3.5 fill-current" aria-hidden />
          Answered by WazaBolt
        </span>
      </div>

      {/* WazaBolt dashboard */}
      <DashboardMockCompact className="hidden sm:absolute sm:bottom-0 sm:left-8 sm:z-10 sm:block sm:w-[440px]" />
    </div>
  );
}
