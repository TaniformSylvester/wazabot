import Link from "next/link";
import {
  ArrowRight,
  Bot,
  BookOpen,
  Building2,
  CircleCheck,
  Languages,
  MessagesSquare,
  Package,
  Rocket,
  ShoppingBag,
  Smartphone,
  Users,
} from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { getCurrentBusiness, requireUser } from "@/lib/auth/dal";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { pageMetadata } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = () => pageMetadata("dashboard", "/dashboard", { index: false });

/** `href` marks steps that can already be done; the rest open with guided setup. */
const setupSteps = [
  { key: "business", icon: Building2 },
  { key: "products", icon: Package },
  { key: "faqs", icon: BookOpen },
  { key: "languages", icon: Languages, href: "/dashboard/settings/languages" },
  { key: "whatsapp", icon: Smartphone },
  { key: "test", icon: Bot },
  { key: "live", icon: Rocket },
] as const;

const stats = [
  { key: "conversations", icon: MessagesSquare },
  { key: "customers", icon: Users },
  { key: "orders", icon: ShoppingBag },
] as const;

export default async function DashboardPage({ searchParams }: PageProps<"/[lang]/dashboard">) {
  const [locale, t, params] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const [user, business] = await Promise.all([requireUser(localizePath(locale, "/dashboard")), getCurrentBusiness()]);
  const o = t.dashboard.overview;
  const firstName = user.fullName.split(" ")[0] || o.there;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      {params.welcome ? (
        <FormAlert tone="success">
          <span className="font-semibold">{o.welcomeConfirmed}</span>
        </FormAlert>
      ) : null}

      <div>
        <h1 className="type-h2">{format(o.welcome, { name: firstName })}</h1>
        <p className="type-body mt-1 text-slate">
          {business ? format(o.businessReady, { business: business.name }) : o.accountReady} {o.next}
        </p>
      </div>

      <section aria-labelledby="stats-title">
        <h2 id="stats-title" className="sr-only">{o.activity}</h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {stats.map(({ key, icon: Icon }) => (
            <li key={key} className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate">{o.stats[key]}</p>
                <Icon className="size-4.5 text-slate" aria-hidden />
              </div>
              <p className="mt-2 font-display text-3xl font-bold text-deep">0</p>
              <p className="mt-1 text-xs text-slate">{o.statsHint}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="setup-title" className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="setup-title" className="type-h3 text-xl">{o.setupTitle}</h2>
            <p className="type-small mt-1 text-slate">{o.setupText}</p>
          </div>
          <span className="rounded-full bg-waza-100 px-3 py-1 text-xs font-semibold text-waza-800">
            {format(o.progress, { done: 1, total: setupSteps.length + 1 })}
          </span>
        </div>
        <ol className="mt-6 grid gap-3 md:grid-cols-2">
          <li className="flex items-start gap-3 rounded-2xl bg-success-bg p-4">
            <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-deep">{o.accountCreated}</p>
              <p className="text-xs text-slate">{user.email}</p>
            </div>
          </li>
          {setupSteps.map((step, i) => {
            const { key, icon: Icon } = step;
            const href = "href" in step ? step.href : null;
            return (
              <li key={key} className="flex items-start gap-3 rounded-2xl border border-border p-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-surface text-deep">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-deep">
                    <span className="text-slate">{i + 1}.</span> {o.steps[key].title}
                  </p>
                  <p className="text-xs text-slate">{o.steps[key].text}</p>
                </div>
                {href ? (
                  <Link
                    href={localizePath(locale, href)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-waza-500 px-3 py-1 text-xs font-semibold text-deep hover:bg-waza-400"
                  >
                    {o.open} <ArrowRight className="size-3" aria-hidden />
                  </Link>
                ) : (
                  <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider text-slate">
                    {t.common.badges.soon}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <p className="text-sm text-slate">
        {o.settingsPrompt}{" "}
        <Link href={localizePath(locale, "/dashboard/settings")} className="font-semibold text-waza-700 hover:underline">
          {o.openSettings}
        </Link>
      </p>
    </div>
  );
}
