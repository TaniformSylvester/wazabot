import Link from "next/link";

import { ActionForm, CheckboxField, DeleteButton, SelectField, SubmitButton, TextArea, TextField } from "@/components/app/form";
import { LinkTabs, PageHeader, Panel, StatusBadge, formatMoney } from "@/components/app/ui";
import { deleteService, saveBookingSettings, saveService } from "@/lib/actions/appointments";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { getBookingSetup } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { SLOT_MINUTES } from "@/lib/validation/app";

export const generateMetadata = dashboardMetadata((d) => d.appointments.tabs.setup);

/** Appointments → Services & settings (owners/admins edit; others read). */
export default async function AppointmentSetupPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/appointments/setup"));
  const { settings, services } = await getBookingSetup(business.id);
  const d = t.dashboard;
  const a = d.appointments;
  const href = (p: string) => localizePath(locale, p);
  const canEdit = hasRole(business.role, "admin");
  const text = (saved: string) => ({ errors: d.errors, saved, saving: d.common.saving });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader title={a.title} description={a.description} />
      <LinkTabs
        active="setup"
        tabs={[
          { key: "calendar", label: a.tabs.calendar, href: href("/dashboard/appointments") },
          { key: "setup", label: a.tabs.setup, href: href("/dashboard/appointments/setup") },
        ]}
      />

      <Panel title={a.settings.title} description={a.settings.description}>
        <ActionForm action={saveBookingSettings} text={text(a.settings.saved)} disabled={!canEdit} successMessage={a.settings.saved}>
          <CheckboxField name="enabled" label={a.settings.enabled} description={a.settings.enabledText} defaultChecked={settings?.enabled ?? false} />
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              name="slot_minutes"
              label={a.settings.slotMinutes}
              defaultValue={String(settings?.slot_minutes ?? 30)}
              options={SLOT_MINUTES.map((m) => ({ value: String(m), label: format(a.settings.minutes, { count: m }) }))}
            />
            <TextField name="capacity" label={a.settings.capacity} hint={a.settings.capacityHint} defaultValue={settings?.capacity ?? 1} inputMode="numeric" />
            <TextField
              name="min_notice_hours"
              label={a.settings.notice}
              hint={a.settings.noticeHint}
              defaultValue={Math.round((settings?.min_notice_minutes ?? 60) / 60)}
              inputMode="numeric"
            />
            <TextField name="max_days_ahead" label={a.settings.daysAhead} defaultValue={settings?.max_days_ahead ?? 30} inputMode="numeric" />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <SubmitButton>{d.common.save}</SubmitButton>
            <Link href={href("/dashboard/settings#hours")} className="text-sm font-semibold text-waza-700 hover:underline">
              {a.settings.hoursLink}
            </Link>
          </div>
        </ActionForm>
      </Panel>

      <Panel title={a.services.title} description={a.services.description}>
        {services.length === 0 ? <p className="mb-4 text-sm text-slate">{a.services.empty}</p> : null}
        <ul className="flex flex-col gap-4">
          {services.map((s) => (
            <li key={s.id} className="rounded-2xl border border-border p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <p className="font-semibold text-deep">{s.name}</p>
                <StatusBadge>{format(a.services.minutesShort, { count: s.duration_minutes })}</StatusBadge>
                <StatusBadge tone={s.price === null ? "neutral" : "blue"}>{s.price === null ? a.services.onRequest : formatMoney(s.price, s.currency, locale)}</StatusBadge>
                {!s.active ? <StatusBadge tone="amber">{d.common.inactive}</StatusBadge> : null}
              </div>
              {canEdit ? (
                <ActionForm action={saveService} text={text(a.services.saved)} successMessage={a.services.saved} hidden={{ id: s.id }}>
                  <ServiceFields a={a} currency={business.currency} defaults={s} />
                  <div className="flex flex-wrap items-center gap-3">
                    <SubmitButton variant="outline">{a.services.save}</SubmitButton>
                    <DeleteButton action={deleteService.bind(null, s.id)} labels={d.common} errors={d.errors} />
                  </div>
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
        {canEdit ? (
          <div className="mt-6 border-t border-border pt-6">
            <h3 className="mb-4 font-display text-base font-bold text-deep">{a.services.add}</h3>
            <ActionForm action={saveService} text={text(a.services.saved)} successMessage={a.services.saved} resetOnSuccess>
              <ServiceFields a={a} currency={business.currency} />
              <div>
                <SubmitButton>{a.services.add}</SubmitButton>
              </div>
            </ActionForm>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

function ServiceFields({
  a,
  currency,
  defaults,
}: {
  a: Awaited<ReturnType<typeof getMessages>>["dashboard"]["appointments"];
  currency: string;
  defaults?: { name: string; description: string | null; duration_minutes: number; price: number | null; active: boolean };
}) {
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-3">
        <TextField name="name" label={a.services.name} defaultValue={defaults?.name ?? ""} required maxLength={160} />
        <TextField name="duration_minutes" label={a.services.duration} defaultValue={defaults?.duration_minutes ?? 60} inputMode="numeric" required />
        <TextField name="price" label={format(a.services.price, { currency })} hint={a.services.priceHint} defaultValue={defaults?.price === null || defaults?.price === undefined ? "" : String(Number(defaults.price))} inputMode="decimal" />
      </div>
      <TextArea name="description" label={a.services.descriptionField} defaultValue={defaults?.description ?? ""} maxLength={2000} rows={2} />
      <CheckboxField name="active" label={a.services.active} defaultChecked={defaults?.active ?? true} />
    </>
  );
}
