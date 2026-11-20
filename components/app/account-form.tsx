"use client";

import { ActionForm, SubmitButton, TextField, type FormText } from "@/components/app/form";
import { saveAccountName } from "@/lib/actions/settings";

/** Settings → Account: the signed-in user's own name, editable. The email is shown read-only beside it. */
export function AccountNameForm({
  name,
  email,
  labels,
  submitLabel,
  text,
}: {
  name: string;
  email: string;
  labels: { name: string; nameHint: string; email: string; emailHint: string };
  submitLabel: string;
  text: FormText;
}) {
  return (
    <ActionForm action={saveAccountName} text={text}>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="full_name" label={labels.name} hint={labels.nameHint} defaultValue={name} required minLength={2} maxLength={120} autoComplete="name" data-testid="account-name" />
        <TextField name="email" label={labels.email} hint={labels.emailHint} defaultValue={email} readOnly disabled autoComplete="email" />
      </div>
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
