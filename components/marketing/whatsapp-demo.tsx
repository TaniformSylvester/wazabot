"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, Loader2, RotateCcw } from "lucide-react";

import { ChatBubble, ChatHeader, TypingIndicator } from "@/components/conversations/chat";
import { Highlight, SectionHeading } from "@/components/marketing/section-heading";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
 * UI MOCKUP — a scripted, illustrative conversation. It does not call the AI.
 * Each step reveals a message and (optionally) a backend check so visitors
 * see that answers come from the business's own data.
 */

type Message = { id: number; side: "in" | "out"; time: string; text?: string; product?: boolean };
type Step = { delay: number; typing?: boolean; message?: Message; check?: string };

const script: Step[] = [
  { delay: 400, message: { id: 1, side: "out", time: "10:24", text: "Hi, do you have this dress in size L?" } },
  { delay: 700, typing: true, check: "Found in your catalogue: Robe en wax" },
  { delay: 700, check: "Stock checked: size L available" },
  { delay: 600, check: "Price from your catalogue: 15,000 XAF" },
  {
    delay: 700,
    message: {
      id: 2,
      side: "in",
      time: "10:24",
      text: "Yes! We have it in size L. The price is 15,000 FCFA. Would you like to place an order?",
    },
  },
  { delay: 500, message: { id: 3, side: "in", time: "10:24", product: true } },
  { delay: 1400, message: { id: 4, side: "out", time: "10:25", text: "Yes please." } },
  { delay: 600, typing: true, check: "Order started — shown in your dashboard" },
  { delay: 1000, message: { id: 5, side: "in", time: "10:25", text: "Great! I'll help you with your order. What name and delivery area should I use?" } },
];

export function WhatsAppDemo() {
  const [step, setStep] = useState(-1);
  const [started, setStarted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useRef(false);

  // Start once the demo scrolls into view. With reduced motion, steps play without delays.
  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started || step >= script.length - 1) return;
    const delay = reducedMotion.current ? 0 : script[step + 1].delay;
    const t = setTimeout(() => setStep((s) => s + 1), delay);
    return () => clearTimeout(t);
  }, [started, step]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [step]);

  const replay = useCallback(() => {
    setStep(-1);
    setStarted(true);
  }, []);

  const shown = script.slice(0, step + 1);
  const messages = shown.flatMap((s) => (s.message ? [s.message] : []));
  const checks = shown.flatMap((s) => (s.check ? [s.check] : []));
  const typing = step >= 0 && script[step].typing === true;
  const done = step >= script.length - 1;

  return (
    <section
      id="demo"
      aria-labelledby="demo-title"
      className="relative overflow-hidden bg-gradient-to-b from-cream via-mint/60 to-cream py-20 sm:py-28"
    >
      <div ref={rootRef} className="container-page grid items-center gap-14 lg:grid-cols-2">
        <div>
          <SectionHeading
            align="left"
            id="demo-title"
            eyebrow="See it in action"
            title={
              <>
                A real answer, from <Highlight>your real data.</Highlight>
              </>
            }
            description="Before WazaBot replies, it checks your catalogue, stock and prices. Every answer comes from information you've given it — not guesswork."
          />

          <div className="mt-8 rounded-2xl border border-border bg-white p-5 shadow-card">
            <p className="text-sm font-semibold text-deep">What WazaBot checked</p>
            <ul className="mt-3 space-y-2.5" aria-live="polite">
              {checks.length === 0 ? (
                <li className="flex items-center gap-2 text-sm text-slate-waza">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Waiting for a customer message…
                </li>
              ) : null}
              {checks.map((c) => (
                <li key={c} className="flex animate-bubble-in items-center gap-2.5 text-sm text-deep">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-waza-500 text-white">
                    <Check className="size-3" strokeWidth={3} aria-hidden />
                  </span>
                  {c}
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-4 text-xs text-slate-waza">Example conversation for illustration.</p>
        </div>

        <div className="relative mx-auto w-full max-w-[360px]">
          <div aria-hidden className="absolute -inset-8 -z-10 rounded-full bg-waza-300/30 blur-3xl" />
          <div className="rounded-[2.75rem] bg-deep p-2.5 shadow-float">
            <div className="overflow-hidden rounded-[2.25rem] bg-white">
              <div className="flex justify-center bg-wa-header pt-2">
                <span className="h-1.5 w-16 rounded-full bg-black/30" />
              </div>
              <ChatHeader name="MJ Fashion" status={typing ? "typing…" : "Online"} />
              <div
                ref={scrollRef}
                className="wa-wallpaper flex h-[440px] flex-col gap-2 overflow-y-auto p-3"
                role="log"
                aria-label="Example WhatsApp conversation"
              >
                <p className="mx-auto mb-1 rounded-md bg-white/80 px-2 py-0.5 text-[0.625rem] text-slate-waza">
                  Today
                </p>
                {messages.map((m) =>
                  m.product ? (
                    <div key={m.id} className="flex animate-bubble-in">
                      <div className="flex w-[80%] gap-2.5 rounded-2xl rounded-tl-md bg-white p-2 shadow-[0_1px_1px_rgb(16_42_42/0.08)]">
                        <Image
                          src="/images/product-robe-wax.webp"
                          alt="Robe en wax dress"
                          width={66}
                          height={80}
                          className="h-20 w-16 rounded-lg object-cover"
                        />
                        <div className="flex min-w-0 flex-1 flex-col justify-between">
                          <div>
                            <p className="text-sm font-semibold text-deep">Robe en wax</p>
                            <p className="text-xs text-slate-waza">Sizes S–XL</p>
                            <p className="text-sm font-bold text-waza-700">15,000 FCFA</p>
                          </div>
                          <span className="rounded-md bg-waza-700 py-1 text-center text-xs font-semibold text-white">
                            Order
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <ChatBubble
                      key={m.id}
                      side={m.side}
                      time={m.time}
                      read={m.side === "out"}
                      label={m.side === "in" ? "WazaBot" : undefined}
                      className="animate-bubble-in"
                    >
                      {m.text}
                    </ChatBubble>
                  ),
                )}
                {typing ? <TypingIndicator className="animate-bubble-in" /> : null}
              </div>
              <div className="flex items-center gap-2 border-t border-border bg-[#f0f2f1] px-3 py-2.5">
                <span className="flex-1 rounded-full bg-white px-3 py-1.5 text-xs text-slate-waza">Message</span>
                <span className="grid size-8 place-items-center rounded-full bg-waza-700 text-white" aria-hidden>
                  ➤
                </span>
              </div>
            </div>
          </div>

          <div className={cn("mt-5 flex justify-center transition-opacity", done ? "opacity-100" : "opacity-0")}>
            <Button variant="secondary" size="sm" onClick={replay} disabled={!done}>
              <RotateCcw /> Replay conversation
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
