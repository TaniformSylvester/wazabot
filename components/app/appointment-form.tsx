"use client";

import { useEffect, useState, useTransition } from "react";

import { ActionForm, SelectField, SubmitButton, TextArea, TextField, type FormText } from "@/components/app/form";
import { createAppointment, getFreeTimes } from "@/lib/actions/appointments";
import type { Locale } from "@/lib/i18n/config";
import { format } from "@/lib/i18n/format";
import type { Messages } from "@/messages/en";

type A = Messages["dashboard"]["appointments"];

/** Book from the dashboard: only free times are offered; the database re-checks on submit. */
export function AppointmentForm({
  t,
  text,
  customers,
  services,
  locale,
  today,
  defaultCustomerId,
  conversationId,
}: {
  t: A;
  text: FormText;
  customers: { id: string; name: string; whatsapp_phone: string }[];
  services: { id: string; name: string; duration_minutes: number }[];
  locale: Locale;
  today: string;
  defaultCustomerId?: string;
  conversationId?: string;
}) {
  const [serviceId, setServiceId] = useState(services.length === 1 ? services[0].id : "");
  const [date, setDate] = useState(today);
  const [times, setTimes] = useState<string[] | null>(null);
  const [time, setTime] = useState("");
  const [loading, startLoading] = useTransition();

  useEffect(() => {
    if (!serviceId || !date) return;
    startLoading(async () => {
      const free = await getFreeTimes(serviceId, date);
      setTimes(free);
      setTime((current) => (free.includes(current) ? current : ""));
    });
  }, [serviceId, date]);

  return (
    <ActionForm
      action={createAppointment}
      text={text}
      successMessage={null}
      hidden={{ locale, conversation_id: conversationId, starts_at: date && time ? `${date}T${time}` : "" }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          name="customer_id"
          label={t.form.customer}
          placeholder={t.form.chooseCustomer}
          defaultValue={defaultCustomerId ?? ""}
          options={customers.map((c) => ({ value: c.id, label: c.name ? `${c.name} (${c.whatsapp_phone})` : c.whatsapp_phone }))}
        />
        <SelectField
          name="service_id"
          label={t.form.service}
          placeholder={t.form.chooseService}
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          options={services.map((s) => ({ value: s.id, label: `${s.name} — ${format(t.services.minutesShort, { count: s.duration_minutes })}` }))}
        />
        <TextField name="date" label={t.form.date} type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
        <SelectField
          name="time"
          label={t.form.time}
          errorName="starts_at"
          placeholder={loading ? t.form.loadingTimes : t.form.chooseTime}
          value={time}
          onChange={(e) => setTime(e.target.value)}
          disabled={!serviceId || loading}
          options={(times ?? []).map((v) => ({ value: v, label: v }))}
          hint={serviceId && times && !times.length && !loading ? t.form.noTimes : undefined}
        />
      </div>
      <TextArea name="notes" label={t.form.notes} maxLength={1000} rows={2} />
      <div>
        <SubmitButton>{t.form.submit}</SubmitButton>
      </div>
    </ActionForm>
  );
}
