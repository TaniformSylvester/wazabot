import { ActionForm, SelectField, SubmitButton, TextArea, TextField } from "@/components/app/form";
import type { FormState } from "@/lib/actions/form";
import type { Messages } from "@/messages/en";

type Student = {
  first_name: string;
  last_name: string;
  gender: string | null;
  date_of_birth: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  class_id: string | null;
  status: string;
  notes: string | null;
};

/** Register or edit a student: identity, guardian (WhatsApp number → customer), class this year, status. */
export function StudentForm({
  action,
  student,
  classes,
  t,
  common,
  errors,
  submit,
  editing = false,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  student?: Partial<Student>;
  classes: { id: string; name: string }[];
  t: Messages["dashboard"]["school"]["students"];
  common: Messages["dashboard"]["common"];
  errors: Messages["dashboard"]["errors"];
  submit: string;
  editing?: boolean;
}) {
  const f = t.form;
  return (
    <ActionForm action={action} text={{ errors, saved: f.saved, saving: common.saving }} successMessage={editing ? f.saved : null}>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="last_name" label={f.lastName} defaultValue={student?.last_name ?? ""} maxLength={80} required />
        <TextField name="first_name" label={f.firstName} defaultValue={student?.first_name ?? ""} maxLength={80} required />
        <SelectField
          name="gender"
          label={f.gender}
          defaultValue={student?.gender ?? ""}
          options={[{ value: "", label: f.notSet }, ...(["female", "male"] as const).map((g) => ({ value: g, label: f.genders[g] }))]}
        />
        <TextField name="date_of_birth" label={f.dob} type="date" defaultValue={student?.date_of_birth ?? ""} />
        <SelectField name="class_id" label={f.class} defaultValue={student?.class_id ?? ""} options={[{ value: "", label: f.noClass }, ...classes.map((c) => ({ value: c.id, label: c.name }))]} />
        {editing ? (
          <SelectField name="status" label={f.status} defaultValue={student?.status ?? "active"} options={(["active", "withdrawn", "graduated"] as const).map((s) => ({ value: s, label: t.statuses[s] }))} />
        ) : (
          <input type="hidden" name="status" value="active" />
        )}
        <TextField name="guardian_name" label={f.guardianName} defaultValue={student?.guardian_name ?? ""} maxLength={120} />
        <TextField name="guardian_phone" label={f.guardianPhone} hint={f.guardianHint} defaultValue={student?.guardian_phone ? `+${student.guardian_phone}` : ""} type="tel" maxLength={24} />
        <TextArea name="notes" label={f.notes} defaultValue={student?.notes ?? ""} maxLength={1000} rows={2} className="sm:col-span-2" />
      </div>
      <div>
        <SubmitButton>{submit}</SubmitButton>
      </div>
    </ActionForm>
  );
}
