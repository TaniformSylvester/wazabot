"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, Hand, Loader2, RotateCcw, Zap } from "lucide-react";

import { ChatBubble, ConversationHeader, TypingIndicator } from "@/components/conversations/chat";
import { Highlight, SectionHeading } from "@/components/marketing/section-heading";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
 * UI MOCKUP — a scripted, illustrative conversation shown in WazaBolt's own
 * conversation view. It does not call the AI. Each step reveals a message
 * and (optionally) a backend check so visitors see that answers come from
 * the business's own data.
 */

type Message = { id: number; from: "customer" | "bot"; time: string; text?: string; product?: boolean };
type Step = { delay: number; typing?: boolean; message?: Message; check?: string };

const script: Step[] = [
  { delay: 400, message: { id: 1, from: "customer", time: "10:24", text: "Hi, do you have this dress in size L?" } },
  { delay: 700, typing: true, check: "Found in your catalogue: Robe en wax" },
  { delay: 700, check: "Stock checked: size L available" },
  { delay: 600, check: "Price from your catalogue: 15,000 XAF" },
  {
    delay: 700,
    message: {
      id: 2,
      from: "bot",
      time: "10:24",
      text: "Yes! We have it in size L. The price is 15,000 FCFA. Would you like to place an order?",
    },
  },
  { delay: 500, message: { id: 3, from: "bot", time: "10:24", product: true } },
  { delay: 1400, message: { id: 4, from: "customer", time: "10:25", text: "Yes please." } },
  { delay: 600, typing: true, check: "Order #1042 started — visible in Orders" },
  {
    delay: 1000,
    message: {
      id: 5,
      from: "bot",
      time: "10:25",
      text: "Great! I'll help you with your order. What name and delivery area should I use?",
    },
  },
];

export function LiveDemo() {
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
    <section id="demo" aria-labelledby="demo-title" className="bg-sand-100 py-20 sm:py-28">
      <div ref={rootRef} className="container-page grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <SectionHeading
            align="left"
            id="demo-title"
            eyebrow="See it in action"
            title={
              <>
                Real answers from <Highlight>your real data.</Highlight>
              </>
            }
            description="Before WazaBolt replies, it checks your catalogue, stock and prices. Every answer comes from information you've given it — never guesswork."
          />
          <p className="type-small mt-6 flex items-center gap-2 text-stone">
            <Hand className="size-4 text-ember-600" aria-hidden />
            Your team can take over this conversation at any moment.
          </p>
          <p className="mt-2 text-xs text-stone">Example conversation for illustration.</p>
        </div>

        <div className="grid overflow-hidden rounded-3xl border border-border bg-card shadow-float md:grid-cols-[1.35fr_1fr]">
          {/* conversation */}
          <div className="flex min-w-0 flex-col">
            <ConversationHeader name="Sarah M." initials="SM" />
            <div
              ref={scrollRef}
              className="flex h-[400px] flex-col gap-2.5 overflow-y-auto bg-sand p-4"
              role="log"
              aria-label="Example customer conversation"
            >
              {messages.map((m) =>
                m.product ? (
                  <div key={m.id} className="flex animate-bubble-in justify-end">
                    <div className="flex w-[82%] gap-3 rounded-2xl rounded-tr-sm bg-ink p-2.5 text-sand">
                      <Image
                        src="/images/product-robe-wax.webp"
                        alt="Robe en wax dress"
                        width={66}
                        height={80}
                        className="h-18 w-15 rounded-lg object-cover"
                      />
                      <div className="flex min-w-0 flex-1 flex-col justify-between">
                        <div>
                          <p className="text-sm font-semibold">Robe en wax</p>
                          <p className="text-xs text-sand/65">Sizes S–XL · in stock</p>
                        </div>
                        <p className="font-display text-base font-bold text-bolt-400">15,000 FCFA</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <ChatBubble
                    key={m.id}
                    from={m.from}
                    time={m.time}
                    label={m.from === "bot" ? "WazaBolt AI" : undefined}
                    className="animate-bubble-in"
                  >
                    {m.text}
                  </ChatBubble>
                ),
              )}
              {typing ? <TypingIndicator className="animate-bubble-in" /> : null}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
              <span className="text-xs text-stone">Automation is replying</span>
              <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-ink">Take over</span>
            </div>
          </div>

          {/* automation log */}
          <div className="border-t border-border bg-ink p-5 text-sand md:border-l md:border-t-0">
            <p className="flex items-center gap-2 font-display text-sm font-bold">
              <Zap className="size-4 fill-bolt-400 text-bolt-400" aria-hidden /> Automation log
            </p>
            <ul className="mt-4 space-y-3" aria-live="polite">
              {checks.length === 0 ? (
                <li className="flex items-center gap-2 text-sm text-sand/60">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Waiting for a message…
                </li>
              ) : null}
              {checks.map((c) => (
                <li key={c} className="flex animate-bubble-in items-start gap-2.5 text-sm text-sand/90">
                  <span className="mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full bg-bolt-500 text-ink">
                    <Check className="size-3" strokeWidth={3} aria-hidden />
                  </span>
                  {c}
                </li>
              ))}
            </ul>
            <div className={cn("mt-6 transition-opacity", done ? "opacity-100" : "pointer-events-none opacity-0")}>
              <Button variant="outline-light" size="sm" onClick={replay} disabled={!done}>
                <RotateCcw /> Replay
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
