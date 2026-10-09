import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import { PageHeader, Panel, StatusBadge, TableWrap, buttonLink, td, th } from "@/components/app/ui";
import { AdminNav } from "@/components/admin/admin-nav";
import { ANNUAL_MONTHS_PAID, MARGIN_TARGET, META_PRICING, MOBILE_MONEY_FEE_RATE, REPLY_MODEL, SIMULATION } from "@/config/economics";
import { requirePlatformAdmin } from "@/lib/admin/access";
import { pendingPlanRequestCount } from "@/lib/admin/plan-requests";
import { getMarginReport, reportMonth } from "@/lib/billing/margins";
import { checkPlan, recommendation } from "@/lib/billing/pricing";
import { localizePath } from "@/lib/i18n/paths";
import { getLocale } from "@/lib/i18n/dictionaries";
import { MAX_SIMULATED_VOLUME, generalSimulation, planChecks, volumeSimulation } from "@/lib/simulation/report";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Pricing", robots: { index: false, follow: false } };

const fcfa = (v: number) => `${new Intl.NumberFormat("en-US", { maximumFractionDigits: v < 100 ? 2 : 0 }).format(v)} FCFA`;
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
const int = (v: number) => new Intl.NumberFormat("en-US").format(Math.round(v));
const label = (s: string) => s.replace("_", " ");
const num = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const input =
  "h-10 w-full min-w-0 rounded-xl border border-input bg-card px-2.5 text-sm text-deep outline-none focus-visible:border-waza-500 focus-visible:ring-4 focus-visible:ring-waza-500/15";

/**
 * WazaBolt team only: the Step 5 simulation (real reply pipeline, Claude
 * stood in for) and a pricing calculator. Nothing here changes a price —
 * prices live in config/economics.ts and change only with the owner's approval.
 */
export default async function PricingPage({ searchParams }: PageProps<"/[lang]/admin/pricing">) {
  const [locale, params] = await Promise.all([getLocale(), searchParams]);
  const admin = await requirePlatformAdmin(locale, "/admin/pricing");
  const [waiting, report] = await Promise.all([pendingPlanRequestCount(admin), getMarginReport(admin, reportMonth(undefined, new Date()))]);

  // Production figures, once real replies are costed: Claude cost of customer replies ÷ AI conversations this month.
  const measuredConversations = report.businesses.reduce((n, b) => n + b.aiConversations, 0);
  const measuredCost = measuredConversations ? report.businesses.reduce((n, b) => n + b.claude - b.claudeTest, 0) / measuredConversations : null;

  const price = num(params.price);
  const conversations = num(params.conversations);
  const cost = num(params.cost);
  const calc = price !== null && conversations !== null && price >= 0 && conversations > 0 ? { price, conversations: Math.min(conversations, 1_000_000), cost: cost !== null && cost > 0 ? cost : null } : null;
  const self = localizePath(locale, "/admin/pricing");

  return (
    <main className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 px-4 py-8 sm:px-6">
      <AdminNav locale={locale} active="pricing" pendingPlanRequests={waiting} />
      <PageHeader
        title="Pricing"
        description={`Simulated Claude cost per conversation, plan margins at full use and a calculator. Target: ${pct(MARGIN_TARGET)} margin after the Mobile Money fee (${pct(MOBILE_MONEY_FEE_RATE)}), on the monthly and the annual price (${ANNUAL_MONTHS_PAID} months for 12). Prices are set in config/economics.ts.`}
      />

      <Suspense fallback={<Simulating what="plans at their full allowance" />}>
        <Plans />
      </Suspense>

      <Panel id="calculator" title="Try a plan" description={`Price and allowance of a plan you're considering. The cost per conversation is simulated at that volume (up to ${int(MAX_SIMULATED_VOLUME)} a month), unless you enter one.`}>
        <form method="get" action={self} className="grid gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-end">
          <label className="grid gap-1 text-sm font-semibold text-deep">
            Price (FCFA / month)
            <input name="price" type="number" min={0} step={100} required defaultValue={calc?.price ?? 15000} className={input} />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-deep">
            AI conversations / month
            <input name="conversations" type="number" min={1} step={1} required defaultValue={calc?.conversations ?? 1000} className={input} />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-deep">
            Claude cost per conversation (FCFA, optional)
            <input name="cost" type="number" min={0} step={0.01} defaultValue={calc?.cost ?? ""} placeholder="simulated" className={input} />
          </label>
          <button type="submit" className={buttonLink}>
            Calculate
          </button>
        </form>
        {measuredCost !== null ? (
          <p className="mt-3 text-sm text-slate">
            Measured this month: <strong className="text-deep">{fcfa(measuredCost)}</strong> per AI conversation over {int(measuredConversations)} conversations.{" "}
            <a className="font-semibold text-waza-700 hover:underline" href={`${self}?price=${calc?.price ?? 15000}&conversations=${calc?.conversations ?? 1000}&cost=${measuredCost.toFixed(2)}#calculator`}>
              Use it
            </a>
          </p>
        ) : (
          <p className="mt-3 text-sm text-slate">No measured cost yet: real replies this month will show their cost per conversation here.</p>
        )}
        {calc ? (
          <Suspense fallback={<p className="mt-4 text-sm text-slate">Simulating {int(calc.conversations)} conversations a month…</p>}>
            <Calculation {...calc} />
          </Suspense>
        ) : null}
      </Panel>

      <Suspense fallback={<Simulating what={`${int(SIMULATION.conversations)} conversations`} />}>
        <Simulation />
      </Suspense>
    </main>
  );
}

function Simulating({ what }: { what: string }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6 text-sm text-slate shadow-card" aria-busy="true">
      Simulating {what}… (about 10 seconds the first time)
    </section>
  );
}

async function Plans() {
  const plans = await planChecks();
  return (
    <Panel
      id="plans"
      title="Plans at full allowance"
      description="Each plan simulated at its full monthly allowance for the four sample businesses; the most expensive one sets the cost. Headroom: how many times that cost the plan can absorb before falling below the target."
    >
      <TableWrap>
        <thead>
          <tr>
            {["Plan", "Price", "Conversations", "Claude / conv.", "Claude at full use", "Margin", "Annual", "Headroom", "Meta (paid by the business)", "Recommendation"].map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p.planId} data-plan={p.planId}>
              <td className={cn(td, "font-semibold capitalize")}>{p.planId}</td>
              <td className={td}>{fcfa(p.price)}</td>
              <td className={td}>{int(p.conversations)}</td>
              <td className={td}>
                {fcfa(p.costPerConversation)}
                <span className="block text-xs text-slate">{label(p.volume.worst.industry)}</span>
              </td>
              <td className={td}>{fcfa(p.claudeAtFullUse)}</td>
              <td className={td}>{p.margin === null ? <span>Budget {fcfa(p.budget)}</span> : <StatusBadge tone={p.margin >= MARGIN_TARGET ? "green" : "red"}>{pct(p.margin)}</StatusBadge>}</td>
              <td className={td}>{p.annualMargin === null ? "—" : <StatusBadge tone={p.annualMargin >= MARGIN_TARGET ? "green" : "red"}>{pct(p.annualMargin)}</StatusBadge>}</td>
              <td className={td}>{p.headroom === null ? "—" : `${p.headroom.toFixed(1)}×`}</td>
              <td className={td}>
                {p.meta.overFree ? fcfa(p.meta.estimateFcfa) : "Free"}
                <span className="block text-xs text-slate">
                  ~{int(p.meta.replies)} messages, {int(META_PRICING.freeServicePerNumberPerMonth)} free
                </span>
              </td>
              <td className={cn(td, "min-w-56 text-sm")}>
                {p.ok ? null : (
                  <StatusBadge tone="red" wrap>
                    Below target
                  </StatusBadge>
                )}{" "}
                {recommendation(p)}
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </Panel>
  );
}

async function Calculation({ price, conversations, cost }: { price: number; conversations: number; cost: number | null }) {
  const volume = await volumeSimulation(conversations);
  const c = checkPlan({
    planId: "custom",
    price,
    conversations,
    costPerConversation: cost ?? volume.worst.costPerConversationFcfa,
    repliesPerConversation: volume.worst.repliesPerConversation,
  });
  const rows: [string, ReactNode][] = [
    ["Claude cost per conversation", `${fcfa(c.costPerConversation)} ${cost === null ? `(simulated, ${label(volume.worst.industry)})` : "(entered)"}`],
    ["Claude at full use", fcfa(c.claudeAtFullUse)],
    ["Mobile Money fee", fcfa(c.paymentFees)],
    ["Margin (monthly)", c.margin === null ? "— (Free)" : pct(c.margin)],
    ["Margin (annual)", pct(c.annualMargin)],
    ["Headroom", c.headroom === null ? "—" : `${c.headroom.toFixed(1)}×`],
    ["Most conversations at this price", int(c.maxConversations)],
    ...(price > 0 ? ([["Lowest price for this allowance", fcfa(c.minPrice)]] as [string, ReactNode][]) : []),
    ["Meta bill for the business", c.meta.overFree ? `${fcfa(c.meta.estimateFcfa)} (~${int(c.meta.replies)} messages)` : `none (~${int(c.meta.replies)} messages)`],
  ];
  return (
    <div className="mt-5 rounded-2xl border border-border p-4" data-testid="calculation">
      <p className="font-semibold text-deep">
        <StatusBadge tone={c.ok ? "green" : "red"}>{c.ok ? "Meets the target" : "Below target"}</StatusBadge> {recommendation(c)}
      </p>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-border py-1.5">
            <dt className="text-slate">{k}</dt>
            <dd className="text-right font-semibold text-deep">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

async function Simulation() {
  const s = await generalSimulation();
  const t = s.tokensPerRequest;
  const stats: [string, string, string?][] = [
    ["Conversations", int(s.conversations), `${Object.entries(s.byLanguage).map(([k, v]) => `${k} ${v}`).join(" · ")} · ${int(s.customerMessages)} customer messages`],
    ["Assistant messages / conversation", s.repliesPerConversation.toFixed(2), `max ${s.maxReplies}; ${pct(s.within4Replies)} of conversations ≤ 4`],
    ["Answered by rules", pct(s.rulesShare), "of assistant replies, without Claude"],
    ["Cache hit rate", pct(s.cacheHitRate), "of Claude requests read the cached prompt"],
    ["Claude / conversation", fcfa(s.costPerConversationFcfa.mean), `median ${fcfa(s.costPerConversationFcfa.p50)} · p90 ${fcfa(s.costPerConversationFcfa.p90)} · on Sonnet ${fcfa(s.sonnetCostPerConversationFcfa)}`],
    ["Within Meta's free messages", `${int(s.conversationsWithinMetaFree)} / month`, `conversations before a number uses its ${int(META_PRICING.freeServicePerNumberPerMonth)} free service messages`],
  ];
  return (
    <Panel
      id="simulation"
      title={`Simulation — ${int(s.conversations)} conversations`}
      description={`Retail, restaurant, salon and real-estate sample businesses, about ${int(s.conversations / 4 / 30)} conversations a day each, in English, French and Pidgin, through the real pipeline (batching, skips, rules, catalog lookup, prompt and cache, tool calls, summary) on ${REPLY_MODEL}. Claude is stood in for: tokens are estimated from the real requests at ${SIMULATION.inputCharsPerToken} characters per token (input) and ${SIMULATION.outputCharsPerToken} (output), on the expensive side.`}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(([k, v, hint]) => (
          <div key={k} className="rounded-2xl border border-border p-4">
            <p className="text-sm text-slate">{k}</p>
            <p className="mt-1 font-display text-2xl font-bold text-deep">{v}</p>
            {hint ? <p className="mt-1 text-xs text-slate">{hint}</p> : null}
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-slate">
        Per Claude request: {int(t.input)} input tokens, {int(t.cacheRead)} read from cache, {int(t.cacheWrite)} written to cache, {int(t.output)} output ({s.claudeRequestsPerReply.toFixed(2)} requests per Claude reply).
        Skipped without Claude: {Object.entries(s.skipped).map(([k, v]) => `${label(k)} ${v}`).join(", ")}. Handed to the team: {int(s.handedOver)}.
      </p>
      <div className="mt-4">
        <TableWrap>
          <thead>
            <tr>
              {["Industry", "Conversations", "Claude / conv.", "Messages / conv.", "Answered by rules"].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(s.byIndustry).map(([k, v]) => (
              <tr key={k}>
                <td className={cn(td, "font-semibold capitalize")}>{label(k)}</td>
                <td className={td}>{int(v.conversations)}</td>
                <td className={td}>{fcfa(v.costPerConversationFcfa)}</td>
                <td className={td}>{v.repliesPerConversation.toFixed(2)}</td>
                <td className={td}>{pct(v.rulesShare)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </div>
    </Panel>
  );
}
