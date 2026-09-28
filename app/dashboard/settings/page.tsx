import type { Metadata } from "next";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getCurrentBusiness, requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Settings" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <dt className="text-sm text-stone">{label}</dt>
      <dd className="text-sm font-medium text-ink sm:text-right">{value}</dd>
    </div>
  );
}

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-4 rounded-3xl border border-border bg-card p-6 shadow-card md:grid-cols-[14rem_1fr] md:gap-10 sm:p-8">
      <div>
        <h2 id={id} className="type-h3">{title}</h2>
        <p className="type-small mt-1 text-stone">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

const languageNames: Record<string, string> = { en: "English", fr: "French" };

export default async function SettingsPage() {
  const [user, business] = await Promise.all([requireUser("/dashboard/settings"), getCurrentBusiness()]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="type-h2">Settings</h1>

      <Section id="account-title" title="Account" description="Your personal login details.">
        <dl className="divide-y divide-border">
          <Row label="Name" value={user.fullName || "—"} />
          <Row label="Email" value={user.email} />
        </dl>
      </Section>

      {business ? (
        <Section id="business-title" title="Business" description="Editing comes with guided setup in the next update.">
          <dl className="divide-y divide-border">
            <Row label="Business name" value={business.name} />
            <Row label="Your role" value={<span className="capitalize">{business.role}</span>} />
            <Row label="Country" value={business.countryCode === "CM" ? "Cameroon" : business.countryCode} />
            <Row label="Currency" value={business.currency} />
            <Row label="Timezone" value={business.timezone} />
            <Row label="Reply languages" value={business.languages.map((l) => languageNames[l] ?? l).join(", ")} />
          </dl>
        </Section>
      ) : null}

      <Section id="security-title" title="Password" description="Choose a strong password you don't use anywhere else.">
        <div className="max-w-md">
          <ResetPasswordForm continueHref="/dashboard/settings" submitLabel="Update password" />
        </div>
      </Section>
    </div>
  );
}
