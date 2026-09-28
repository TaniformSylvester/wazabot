import type { Metadata } from "next";
import Link from "next/link";
import {
  Bot,
  BookOpen,
  Building2,
  CircleCheck,
  MessagesSquare,
  Package,
  Rocket,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Users,
} from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { getCurrentBusiness, requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Overview" };

const setupSteps = [
  { icon: Building2, title: "Business information", text: "Opening hours, location and delivery areas." },
  { icon: Package, title: "Products & services", text: "Your catalog with prices and availability." },
  { icon: BookOpen, title: "FAQs & policies", text: "The answers WazaBolt is allowed to give." },
  { icon: Sparkles, title: "AI personality", text: "Tone, languages and when to hand over." },
  { icon: Smartphone, title: "Connect WhatsApp", text: "Link your WhatsApp Business account." },
  { icon: Bot, title: "Test WazaBolt", text: "Try real questions before customers do." },
  { icon: Rocket, title: "Go live", text: "Switch automation on for your customers." },
];

const stats = [
  { label: "Conversations", icon: MessagesSquare },
  { label: "Customers", icon: Users },
  { label: "Orders", icon: ShoppingBag },
];

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const [user, business, params] = await Promise.all([requireUser(), getCurrentBusiness(), searchParams]);
  const firstName = user.fullName.split(" ")[0] || "there";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      {params.welcome ? (
        <FormAlert tone="success">
          <span className="font-semibold">Your email is confirmed — welcome to WazaBolt!</span>
        </FormAlert>
      ) : null}

      <div>
        <h1 className="type-h2">Welcome, {firstName}</h1>
        <p className="type-body mt-1 text-stone">
          {business ? `${business.name} is set up.` : "Your account is ready."} Here&apos;s what comes next.
        </p>
      </div>

      <section aria-labelledby="stats-title">
        <h2 id="stats-title" className="sr-only">Activity</h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {stats.map(({ label, icon: Icon }) => (
            <li key={label} className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <div className="flex items-center justify-between">
                <p className="text-sm text-stone">{label}</p>
                <Icon className="size-4.5 text-stone" aria-hidden />
              </div>
              <p className="mt-2 font-display text-3xl font-bold text-ink">0</p>
              <p className="mt-1 text-xs text-stone">Appears once WhatsApp is connected</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="setup-title" className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="setup-title" className="type-h3 text-xl">Set up your AI assistant</h2>
            <p className="type-small mt-1 text-stone">
              Seven short steps. The guided setup opens in the next update.
            </p>
          </div>
          <span className="rounded-full bg-bolt-100 px-3 py-1 text-xs font-semibold text-bolt-800">
            1 of 8 done
          </span>
        </div>
        <ol className="mt-6 grid gap-3 md:grid-cols-2">
          <li className="flex items-start gap-3 rounded-2xl bg-success-bg p-4">
            <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-ink">Account created</p>
              <p className="text-xs text-stone">{user.email}</p>
            </div>
          </li>
          {setupSteps.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="flex items-start gap-3 rounded-2xl border border-border p-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-sand-100 text-ink">
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  <span className="text-stone">{i + 1}.</span> {title}
                </p>
                <p className="text-xs text-stone">{text}</p>
              </div>
              <span className="shrink-0 rounded-full bg-sand-100 px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider text-stone">
                Soon
              </span>
            </li>
          ))}
        </ol>
      </section>

      <p className="text-sm text-stone">
        Need to change your name or password?{" "}
        <Link href="/dashboard/settings" className="font-semibold text-ember-700 hover:underline">
          Open settings
        </Link>
      </p>
    </div>
  );
}
