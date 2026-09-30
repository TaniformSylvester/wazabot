import { ActionForm, CheckboxField, SelectField, SubmitButton, TextArea, TextField, type FormText } from "@/components/app/form";
import { Panel } from "@/components/app/ui";
import { saveDocument, saveFaq } from "@/lib/actions/knowledge";
import { DOCUMENT_TYPES, type Tables } from "@/types/database";
import type { Messages } from "@/messages/en";

type K = Messages["dashboard"]["knowledge"];

export function FaqForm({ t, text, faq, locale, canEdit, submitLabel }: { t: K; text: FormText; faq: Tables<"faqs"> | null; locale: string; canEdit: boolean; submitLabel: string }) {
  const f = t.faqs.fields;
  return (
    <ActionForm action={saveFaq} text={text} disabled={!canEdit} hidden={{ id: faq?.id, locale }}>
      <Panel className="grid gap-5 sm:grid-cols-2">
        <TextField name="question" label={f.question} defaultValue={faq?.question ?? ""} required maxLength={500} className="sm:col-span-2" />
        <TextArea name="answer" label={f.answer} defaultValue={faq?.answer ?? ""} required maxLength={4000} rows={6} className="sm:col-span-2" />
        <TextField name="category" label={f.category} defaultValue={faq?.category ?? ""} maxLength={80} />
        <TextField name="priority" label={f.priority} hint={f.priorityHint} defaultValue={faq?.priority ?? 0} type="number" min={0} max={100} />
        <CheckboxField name="active" label={f.active} defaultChecked={faq?.active ?? true} className="sm:col-span-2" />
      </Panel>
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function DocumentForm({
  t,
  text,
  doc,
  defaultType,
  locale,
  canEdit,
  submitLabel,
}: {
  t: K;
  text: FormText;
  doc: Tables<"knowledge_documents"> | null;
  defaultType?: string;
  locale: string;
  canEdit: boolean;
  submitLabel: string;
}) {
  const f = t.documents.fields;
  return (
    <ActionForm action={saveDocument} text={text} disabled={!canEdit} hidden={{ id: doc?.id, locale }}>
      <Panel className="grid gap-5 sm:grid-cols-2">
        <TextField name="title" label={f.title} defaultValue={doc?.title ?? ""} required maxLength={200} />
        <SelectField
          name="document_type"
          label={f.type}
          defaultValue={doc?.document_type ?? defaultType ?? "general"}
          options={DOCUMENT_TYPES.map((d) => ({ value: d, label: t.documents.types[d] }))}
        />
        <TextArea name="content" label={f.content} defaultValue={doc?.content ?? ""} required maxLength={20000} rows={12} className="sm:col-span-2" />
        <CheckboxField name="active" label={f.active} defaultChecked={doc?.active ?? true} className="sm:col-span-2" />
      </Panel>
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
