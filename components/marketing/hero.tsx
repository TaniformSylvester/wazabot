import Image from "next/image";
import Link from "next/link";
import { ArrowRight, PlayCircle, ShieldCheck, ShoppingBag, Zap } from "lucide-react";

import { WhatsAppIcon } from "@/components/brand/whatsapp-icon";
import { ChatBubble, ChatHeader } from "@/components/conversations/chat";
import { DashboardMockCompact } from "@/components/marketing/dashboard-mock";
import { Highlight } from "@/components/marketing/section-heading";
import { Button } from "@/components/ui/button";

const trust = [
  { icon: Zap, title: "Quick Setup", text: "In minutes, not days", tone: "text-gold" },
  { icon: ShieldCheck, title: "Secure & Reliable", text: "Your data stays yours", tone: "text-waza-600" },
  { icon: WhatsAppIcon, title: "Works on WhatsApp", text: "No app for customers", tone: "text-waza-600" },
];

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      {/* soft background wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_85%_20%,#e9faf3_0%,transparent_70%),radial-gradient(40%_40%_at_70%_85%,#fff3d1_0%,transparent_70%)]"
      />
      <div className="container-page grid items-center gap-12 pb-16 pt-8 sm:pt-12 xl:grid-cols-[1.12fr_1fr] xl:gap-6 xl:pb-24 xl:pt-10">
        <div className="flex flex-col items-start">
          <span className="inline-flex items-center gap-2 rounded-full bg-mint py-1.5 pl-1.5 pr-4 text-sm font-semibold text-waza-800">
            <span className="grid size-6 place-items-center rounded-full bg-waza-500 text-white">
              <WhatsAppIcon className="size-4" />
            </span>
            Built for African Businesses
          </span>

          <h1
            id="hero-title"
            className="mt-6 text-[2.5rem] font-extrabold leading-[1.06] sm:text-6xl xl:text-[3.9rem]"
          >
            Your business never has to leave a <Highlight>WhatsApp</Highlight>{" "}
            <Highlight>message unanswered.</Highlight>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-waza sm:text-xl">
            <strong className="font-semibold text-deep">WazaBot</strong> is your AI receptionist for
            WhatsApp. It answers customer questions, shares products and prices, captures orders and
            hands conversations to your team when needed.
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
                <PlayCircle className="size-5" />
                See How It Works
              </Link>
            </Button>
          </div>

          <ul className="mt-10 grid w-full grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-4">
            {trust.map(({ icon: Icon, title, text, tone }) => (
              <li key={title} className="flex items-start gap-3">
                <Icon className={`mt-0.5 size-6 shrink-0 ${tone}`} aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-deep">{title}</p>
                  <p className="text-sm text-slate-waza">{text}</p>
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
 * Composition: business-owner photo, WhatsApp chat (customer's view of the
 * business) and a compact dashboard card. Stacks on mobile, overlaps from sm.
 */
function HeroVisual() {
  return (
    <div className="relative mx-auto flex w-full max-w-md flex-col sm:h-[620px] sm:max-w-[580px] xl:mr-0">
      {/* photo */}
      <div className="relative w-[82%] sm:absolute sm:left-0 sm:top-8 sm:w-[350px]">
        <div
          aria-hidden
          className="absolute -inset-3 -z-10 rotate-[-4deg] rounded-[2.5rem] bg-gradient-to-br from-waza-200 via-mint to-gold-100"
        />
        <Image
          src="/images/hero-owner.webp"
          alt="A smiling shop owner in a colourful head wrap checks WhatsApp orders on her phone"
          width={366}
          height={440}
          preload
          sizes="(min-width: 640px) 350px, 80vw"
          className="aspect-[366/440] w-full rounded-[2rem] object-cover shadow-float"
        />
        <div className="absolute -left-4 bottom-24 hidden items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-float sm:flex">
          <span className="grid size-8 place-items-center rounded-full bg-gold text-deep">
            <ShoppingBag className="size-4" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="text-xs font-semibold text-deep">New order captured</p>
            <p className="text-[0.6875rem] text-slate-waza">Robe en wax · 15,000 XAF</p>
          </div>
        </div>
      </div>

      {/* chat */}
      <div className="relative z-20 -mt-40 w-[74%] self-end sm:absolute sm:right-0 sm:top-0 sm:mt-0 sm:w-[290px]">
        <span
          aria-hidden
          className="absolute -right-4 -top-5 z-10 grid size-11 place-items-center rounded-full bg-waza-500 text-white shadow-float ring-4 ring-cream"
        >
          <WhatsAppIcon className="size-6" />
        </span>
        <div className="overflow-hidden rounded-3xl border-4 border-white bg-white shadow-float">
          <ChatHeader name="MJ Fashion" />
          <div className="wa-wallpaper space-y-2 p-3">
            <ChatBubble side="out" time="10:24" read>
              Hello, do you have this dress in size L?
            </ChatBubble>
            <ChatBubble side="in" time="10:24">
              Yes! We have it in size L. The price is 15,000 FCFA. Would you like to place an order?
            </ChatBubble>
            <div className="flex">
              <div className="flex w-[85%] gap-2.5 rounded-2xl bg-white p-2 shadow-[0_1px_1px_rgb(16_42_42/0.08)]">
                <Image
                  src="/images/product-robe-wax.webp"
                  alt=""
                  width={66}
                  height={80}
                  className="h-16 w-13 rounded-lg object-cover"
                />
                <div className="flex min-w-0 flex-1 flex-col justify-between">
                  <div>
                    <p className="text-xs font-semibold text-deep">Robe en wax</p>
                    <p className="text-xs text-slate-waza">15,000 FCFA · Size L</p>
                  </div>
                  <span className="rounded-md bg-waza-700 py-1 text-center text-[0.6875rem] font-semibold text-white">
                    Order
                  </span>
                </div>
              </div>
            </div>
            <ChatBubble side="out" time="10:25" read>
              Yes please! 🙏
            </ChatBubble>
          </div>
        </div>
      </div>

      {/* dashboard */}
      <DashboardMockCompact className="hidden sm:absolute sm:bottom-0 sm:left-8 sm:z-10 sm:block sm:w-[440px]" />
    </div>
  );
}
