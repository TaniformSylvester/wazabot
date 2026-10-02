import { redirect } from "next/navigation";

import { ActionForm, CheckboxField, SelectField, SubmitButton, TextArea, TextField } from "@/components/app/form";
import { PageHeader, Panel } from "@/components/app/ui";
import { createBroadcast } from "@/lib/actions/broadcasts";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { MAX_BROADCAST_TEXT } from "@/lib/broadcasts/compose";
import { listCustomerTags } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { languageName } from "@/lib/i18n/languages";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.broadcasts.new);

export default async function NewBroadcastPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/broadcasts/new"));
  const back = localizePath(locale, "/dashboard/broadcasts");
  if (!hasRole(business.role, "admin")) redirect(back);
  const tags = await listCustomerTags(business.id);
  const d = t.dashboard;
  const f = d.broadcasts.form;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title={d.broadcasts.new} description={d.broadcasts.cost} back={{ href: back, label: d.broadcasts.title }} />
      <ActionForm action={createBroadcast} text={{ errors: d.errors, saved: d.common.saved, saving: d.common.saving }} successMessage={null} hidden={{ locale }}>
        <Panel className="flex flex-col gap-5">
          <TextField name="name" label={f.name} placeholder={f.namePlaceholder} required maxLength={120} />
          <SelectField
            name="language"
            label={f.language}
            defaultValue={business.defaultLanguage === "fr" ? "fr" : "en"}
            options={(["en", "fr"] as const).map((l) => ({ value: l, label: languageName(l, locale) }))}
          />
          <TextArea name="text" label={f.text} hint={f.textHint} required maxLength={MAX_BROADCAST_TEXT} rows={5} />
          <CheckboxField name="personalized" label={f.personalized} description={f.personalizedText} defaultChecked />
        </Panel>
        <Panel className="flex flex-col gap-5">
          <TextField name="audience_tags" label={f.tags} hint={format(f.tagsHint, { tags: tags.slice(0, 12).join(", ") || f.noTags })} maxLength={400} />
          <SelectField
            name="audience_language"
            label={f.audienceLanguage}
            placeholder={f.anyLanguage}
            defaultValue=""
            options={(["en", "fr", "wes"] as const).map((l) => ({ value: l, label: languageName(l, locale) }))}
          />
        </Panel>
        <div>
          <SubmitButton>{f.submit}</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
