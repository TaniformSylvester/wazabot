import type { Metadata } from "next";
import Link from "next/link";

import { AdminNav } from "@/components/admin/admin-nav";
import { PageHeader, Panel, TableWrap, td, th } from "@/components/app/ui";
import { requirePlatformAdmin } from "@/lib/admin/access";
import { pendingPlanRequestCount } from "@/lib/admin/plan-requests";
import {
  adminVertical,
  listWaitlistLeads,
  waitlistCounts,
} from "@/lib/admin/waitlist";
import { getLocale } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";
import { SIGNUP_VERTICALS } from "@/lib/validation/auth-rules";
import { WAITLIST_MODE } from "@/lib/waitlist/mode";

export const metadata: Metadata = {
  title: "Beta waitlist",
  robots: { index: false, follow: false },
};

const LABEL = {
  shop: "Shops",
  restaurant: "Restaurants",
  school: "Schools",
} as const;

/** WazaBolt team only: the early-access beta requests, by vertical, with a CSV export. */
export default async function WaitlistAdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const admin = await requirePlatformAdmin(locale, "/admin/waitlist");
  const vertical = adminVertical((await searchParams).vertical);
  const [leads, counts, waiting] = await Promise.all([
    listWaitlistLeads(admin, vertical, 500),
    waitlistCounts(admin),
    pendingPlanRequestCount(admin),
  ]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const tab = (v: (typeof SIGNUP_VERTICALS)[number] | null) =>
    localizePath(
      locale,
      v ? `/admin/waitlist?vertical=${v}` : "/admin/waitlist",
    );
  const exportHref = localizePath(
    locale,
    vertical
      ? `/admin/waitlist/export?vertical=${vertical}`
      : "/admin/waitlist/export",
  );

  return (
    <main className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 px-4 py-8 sm:px-6">
      <AdminNav
        locale={locale}
        active="waitlist"
        pendingPlanRequests={waiting}
      />
      <PageHeader
        title="Beta waitlist"
        description={`${WAITLIST_MODE ? "Waitlist mode is on: sign-up is closed and the site's buttons lead to the waitlist." : "Waitlist mode is off: sign-up is open."} Message each lead on WhatsApp with their beta access and set up their catalogue, menu or fees.`}
      />
      <ul
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        data-testid="waitlist-counts"
      >
        {[
          { label: "All", value: total },
          ...SIGNUP_VERTICALS.map((v) => ({
            label: LABEL[v],
            value: counts[v],
          })),
        ].map((s) => (
          <li
            key={s.label}
            className="rounded-2xl border border-border bg-card p-4 shadow-card"
          >
            <p className="text-sm text-slate">{s.label}</p>
            <p className="font-display text-2xl font-bold text-deep">
              {s.value}
            </p>
          </li>
        ))}
      </ul>
      <Panel
        title={vertical ? LABEL[vertical] : "All leads"}
        actions={
          <a
            href={exportHref}
            className="inline-flex min-h-9 items-center rounded-full bg-deep px-4 text-sm font-semibold text-cream"
            data-testid="waitlist-export"
          >
            Export CSV
          </a>
        }
      >
        <nav aria-label="Vertical" className="mb-4 flex flex-wrap gap-1">
          {[null, ...SIGNUP_VERTICALS].map((v) => (
            <Link
              key={v ?? "all"}
              href={tab(v)}
              aria-current={vertical === v ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full px-3 text-sm font-semibold",
                vertical === v
                  ? "bg-deep text-cream"
                  : "text-slate hover:bg-mint",
              )}
            >
              {v ? LABEL[v] : "All"}
            </Link>
          ))}
        </nav>
        {leads.length === 0 ? (
          <p className="text-sm text-slate">No leads yet.</p>
        ) : (
          <div data-testid="waitlist-table">
            <TableWrap>
              <thead>
                <tr>
                  {[
                    "Joined",
                    "Business",
                    "Type",
                    "WhatsApp",
                    "Email",
                    "Country",
                  ].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td className={td}>
                      {l.created_at.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className={td}>{l.business_name}</td>
                    <td className={td}>{l.vertical}</td>
                    <td className={td}>
                      <a
                        href={`https://wa.me/${l.whatsapp_number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-waza-700 hover:underline"
                      >
                        +{l.whatsapp_number}
                      </a>
                    </td>
                    <td className={td}>{l.email}</td>
                    <td className={td}>{l.country_code ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        )}
      </Panel>
    </main>
  );
}
