import { FormAlert } from "@/components/auth/form-alert";
import { ActionForm, CheckboxField, SelectField, SubmitButton, TextArea, TextField } from "@/components/app/form";
import { PageHeader, Panel } from "@/components/app/ui";
import { saveDocumentSettings } from "@/lib/actions/documents";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { getDocumentSettings } from "@/lib/data/documents";
import { DOCUMENT_TEMPLATES } from "@/lib/documents/types";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.documents.settings.title);

export default async function DocumentSettingsPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/documents/settings"));
  const d = t.dashboard;
  const s = d.documents.settings;
  const settings = await getDocumentSettings(business.id);
  const canEdit = hasRole(business.role, "admin");
  const year = new Date().getFullYear();
  const example = `${settings.invoice_prefix}-${settings.include_year ? `${year}-` : ""}${"1".padStart(settings.number_padding, "0")}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title={s.title} description={s.description} back={{ href: localizePath(locale, "/dashboard/documents"), label: d.documents.title }} />
      {!canEdit ? <FormAlert tone="info">{s.ownersOnly}</FormAlert> : null}
      <ActionForm action={saveDocumentSettings} text={{ errors: d.errors, saved: s.saved, saving: d.common.saving }} successMessage={s.saved} disabled={!canEdit}>
        <Panel title={s.numbering} className="grid gap-5 sm:grid-cols-3">
          <TextField name="invoice_prefix" label={s.invoicePrefix} defaultValue={settings.invoice_prefix} maxLength={8} required />
          <TextField name="receipt_prefix" label={s.receiptPrefix} defaultValue={settings.receipt_prefix} maxLength={8} required />
          <TextField name="quotation_prefix" label={s.quotationPrefix} defaultValue={settings.quotation_prefix} maxLength={8} required />
          <p className="-mt-3 text-xs text-slate sm:col-span-3">{s.prefixHint}</p>
          <CheckboxField name="include_year" label={s.includeYear} defaultChecked={settings.include_year} className="sm:col-span-2" />
          <SelectField name="number_padding" label={s.padding} defaultValue={String(settings.number_padding)} options={[3, 4, 5, 6, 7, 8].map((n) => ({ value: String(n), label: String(n) }))} />
          <p className="text-sm text-slate sm:col-span-3" data-testid="numbering-example">
            {format(s.example, { example })}
          </p>
        </Panel>
        <Panel title={s.defaults} className="grid gap-5 sm:grid-cols-2">
          <SelectField name="default_template" label={s.template} defaultValue={settings.default_template} options={DOCUMENT_TEMPLATES.map((x) => ({ value: x, label: t.docs.templates[x].name }))} />
          <SelectField
            name="default_language"
            label={s.language}
            defaultValue={settings.default_language ?? ""}
            options={[
              { value: "", label: s.sameAsBusiness },
              { value: "fr", label: "Français" },
              { value: "en", label: "English" },
            ]}
          />
          <TextField name="default_due_days" label={s.dueDays} defaultValue={String(settings.default_due_days)} inputMode="numeric" />
          <TextField name="business_reference" label={s.businessReference} defaultValue={settings.business_reference ?? ""} maxLength={60} />
          <TextField name="default_tax_rate" label={s.taxRate} defaultValue={settings.default_tax_rate ? String(settings.default_tax_rate) : ""} inputMode="decimal" />
          <TextField name="default_tax_label" label={s.taxLabel} defaultValue={settings.default_tax_label ?? ""} maxLength={30} />
          <TextArea name="default_notes" label={s.notes} defaultValue={settings.default_notes ?? ""} maxLength={2000} rows={2} className="sm:col-span-2" />
          <TextArea name="default_terms" label={s.terms} defaultValue={settings.default_terms ?? ""} maxLength={2000} rows={2} className="sm:col-span-2" />
        </Panel>
        {canEdit ? (
          <div>
            <SubmitButton>{d.common.save}</SubmitButton>
          </div>
        ) : null}
      </ActionForm>
    </div>
  );
}
