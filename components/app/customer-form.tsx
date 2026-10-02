import { ActionForm, CheckboxField, SelectField, SubmitButton, TextArea, TextField, type FormText } from "@/components/app/form";
import { Panel } from "@/components/app/ui";
import { saveCustomer } from "@/lib/actions/customers";
import { LANGUAGE_CODES, languageName } from "@/lib/i18n/languages";
import type { Locale } from "@/lib/i18n/config";
import type { Tables } from "@/types/database";
import type { Messages } from "@/messages/en";

export function CustomerForm({
  t,
  text,
  customer,
  locale,
  canEdit,
  submitLabel,
}: {
  t: Messages["dashboard"]["customers"];
  text: FormText;
  customer: Tables<"customers"> | null;
  locale: Locale;
  canEdit: boolean;
  submitLabel: string;
}) {
  const f = t.fields;
  return (
    <ActionForm action={saveCustomer} text={text} disabled={!canEdit} hidden={{ id: customer?.id, locale, ...(customer ? { whatsapp_phone: customer.whatsapp_phone } : {}) }}>
      <Panel className="grid gap-5 sm:grid-cols-2">
        <TextField name="name" label={f.name} defaultValue={customer?.name ?? ""} maxLength={120} autoComplete="off" />
        {customer ? (
          <TextField name="whatsapp_phone_display" label={f.phone} hint={f.phoneLocked} defaultValue={`+${customer.whatsapp_phone}`} readOnly disabled />
        ) : (
          <TextField name="whatsapp_phone" label={f.phone} hint={f.phoneHint} type="tel" inputMode="tel" required maxLength={24} autoComplete="off" />
        )}
        <TextField name="email" label={f.email} defaultValue={customer?.email ?? ""} type="email" maxLength={320} autoComplete="off" />
        <TextField name="city" label={f.city} defaultValue={customer?.city ?? ""} maxLength={120} />
        <SelectField
          name="preferred_language"
          label={f.language}
          defaultValue={customer?.preferred_language ?? ""}
          placeholder={f.languageAuto}
          options={LANGUAGE_CODES.map((c) => ({ value: c, label: languageName(c, locale) }))}
        />
        <TextField name="tags" label={f.tags} hint={f.tagsHint} defaultValue={customer?.tags.join(", ") ?? ""} maxLength={400} />
        <TextArea name="notes" label={f.notes} defaultValue={customer?.notes ?? ""} maxLength={4000} rows={3} className="sm:col-span-2" />
        <CheckboxField
          name="marketing_opt_in"
          label={f.marketing}
          description={f.marketingText}
          defaultChecked={customer?.marketing_opt_in ?? false}
          className="sm:col-span-2"
        />
      </Panel>
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
