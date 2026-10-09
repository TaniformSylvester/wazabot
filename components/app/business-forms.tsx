"use client";

import { ActionForm, CheckboxField, SelectField, SubmitButton, TextArea, TextField, useFieldError, type FormText } from "@/components/app/form";
import { saveBusinessProfile, saveOpeningHours, saveReceiptSettings } from "@/lib/actions/business";
import { DEFAULT_OPENING_HOURS, WEEKDAYS, type OpeningHours } from "@/lib/business/hours";
import type { CurrentBusiness } from "@/lib/auth/dal";
import { format } from "@/lib/i18n/format";
import { INDUSTRIES } from "@/types/database";
import type { Messages } from "@/messages/en";

type B = Messages["dashboard"]["business"];
/** Hidden fields that turn a form into an onboarding step. */
export type OnboardingFields = { onboarding_step: number; next_step: string; locale: string };

export function BusinessProfileForm({
  t,
  text,
  business,
  canEdit,
  submitLabel,
  onboarding,
  extraActions,
}: {
  t: B;
  text: FormText;
  business: Pick<CurrentBusiness, "name" | "industry" | "city" | "address" | "phone" | "email" | "website" | "description">;
  canEdit: boolean;
  submitLabel: string;
  onboarding?: OnboardingFields;
  extraActions?: React.ReactNode;
}) {
  const f = t.fields;
  return (
    <ActionForm action={saveBusinessProfile} text={text} disabled={!canEdit} hidden={onboarding} successMessage={onboarding ? null : undefined}>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="name" label={f.name} defaultValue={business.name} required maxLength={120} autoComplete="organization" />
        <SelectField
          name="industry"
          label={f.industry}
          defaultValue={business.industry ?? ""}
          placeholder={t.chooseIndustry}
          options={INDUSTRIES.map((i) => ({ value: i, label: t.industries[i] }))}
        />
        <TextField name="city" label={f.city} defaultValue={business.city ?? ""} maxLength={120} autoComplete="address-level2" />
        <TextField name="address" label={f.address} defaultValue={business.address ?? ""} maxLength={300} autoComplete="street-address" />
        <TextField name="phone" label={f.phone} defaultValue={business.phone ?? ""} type="tel" inputMode="tel" maxLength={24} autoComplete="tel" />
        <TextField name="email" label={f.email} defaultValue={business.email ?? ""} type="email" maxLength={320} autoComplete="email" />
        <TextField name="website" label={f.website} defaultValue={business.website ?? ""} inputMode="url" maxLength={300} className="sm:col-span-2" />
        <TextArea name="description" label={f.description} hint={f.descriptionHint} defaultValue={business.description ?? ""} maxLength={2000} className="sm:col-span-2" />
      </div>
      <p className="text-xs text-slate">
        {f.country}: {t.countryNote}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>{submitLabel}</SubmitButton>
        {extraActions}
      </div>
    </ActionForm>
  );
}

function DayRow({ day, label, value, t }: { day: (typeof WEEKDAYS)[number]; label: string; value: OpeningHours["mon"]; t: B["hours"] }) {
  const error = useFieldError(`hours.${day}`);
  const v = value ?? DEFAULT_OPENING_HOURS[day];
  const input = "h-10 w-full min-w-0 rounded-xl border border-input bg-card px-2.5 text-sm text-deep outline-none focus-visible:border-waza-500 focus-visible:ring-4 focus-visible:ring-waza-500/15 aria-invalid:border-coral-600";
  return (
    <div className="grid grid-cols-2 items-center gap-x-3 gap-y-2 border-b border-border py-3 sm:grid-cols-[8rem_7rem_1fr_1fr]">
      <p className="text-sm font-semibold text-deep">{label}</p>
      <label className="flex items-center justify-end gap-2 text-sm text-slate sm:justify-start">
        <input type="checkbox" name={`hours.${day}.closed`} defaultChecked={v.closed} className="size-4 accent-waza-600" />
        {t.closed}
      </label>
      <label className="flex min-w-0 items-center gap-2 text-xs text-slate">
        <span className="w-16 shrink-0">{t.opens}</span>
        <input type="time" name={`hours.${day}.open`} defaultValue={v.open} aria-invalid={error ? true : undefined} aria-label={`${label} — ${t.opens}`} className={input} />
      </label>
      <label className="flex min-w-0 items-center gap-2 text-xs text-slate">
        <span className="w-16 shrink-0">{t.closes}</span>
        <input type="time" name={`hours.${day}.close`} defaultValue={v.close} aria-invalid={error ? true : undefined} aria-label={`${label} — ${t.closes}`} className={input} />
      </label>
      {error ? (
        <p role="alert" className="col-span-full text-xs font-medium text-coral-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function OpeningHoursForm({
  t,
  text,
  hours,
  timezone,
  canEdit,
  submitLabel,
  onboarding,
  extraActions,
}: {
  t: B;
  text: FormText;
  hours: OpeningHours;
  timezone: string;
  canEdit: boolean;
  submitLabel: string;
  onboarding?: OnboardingFields;
  extraActions?: React.ReactNode;
}) {
  return (
    <ActionForm action={saveOpeningHours} text={text} disabled={!canEdit} hidden={onboarding} successMessage={onboarding ? null : undefined}>
      <p className="text-sm text-slate">{format(t.hours.description, { timezone })}</p>
      <div className="border-t border-border">
        {WEEKDAYS.map((day) => (
          <DayRow key={day} day={day} label={t.hours.days[day]} value={hours[day]} t={t.hours} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>{submitLabel}</SubmitButton>
        {extraActions}
      </div>
    </ActionForm>
  );
}


/** Settings → Receipts: logo and footer. */
export function ReceiptSettingsForm({
  t,
  text,
  logoUrl,
  footer,
  canEdit,
  submitLabel,
}: {
  t: Messages["dashboard"]["settings"]["receipts"];
  text: FormText;
  logoUrl: string | null;
  footer: string | null;
  canEdit: boolean;
  submitLabel: string;
}) {
  return (
    <ActionForm action={saveReceiptSettings} text={text} disabled={!canEdit} successMessage={t.saved}>
      <div className="flex flex-wrap items-center gap-4">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="size-16 rounded-xl border border-border object-contain" data-testid="business-logo" />
        ) : null}
        <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-deep">
          {t.logo}
          <input
            type="file"
            name="logo"
            accept="image/jpeg,image/png,image/webp"
            className="max-w-full text-sm font-normal text-slate file:mr-3 file:rounded-full file:border-0 file:bg-mint file:px-4 file:py-2 file:text-sm file:font-semibold file:text-deep"
          />
          <span className="text-xs font-normal text-slate">{t.logoHint}</span>
        </label>
      </div>
      {logoUrl ? <CheckboxField name="remove_logo" label={t.removeLogo} /> : null}
      <TextArea name="receipt_footer" label={t.footer} hint={t.footerHint} defaultValue={footer ?? ""} maxLength={300} rows={2} />
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
