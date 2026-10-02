"use client";

import { ActionButton } from "@/components/app/form";
import { setAppointmentStatus } from "@/lib/actions/appointments";
import type { Messages } from "@/messages/en";

type A = Messages["dashboard"]["appointments"];

/** Status buttons for one appointment: what makes sense from its current status. */
export function AppointmentActions({ id, status, past, t, errors }: { id: string; status: string; past: boolean; t: A; errors: Record<string, string> }) {
  const set = (s: string) => setAppointmentStatus.bind(null, id, s);
  if (status === "cancelled" || status === "completed" || status === "no_show") {
    return past ? null : (
      <ActionButton action={set("booked")} errors={errors} variant="ghost">
        {t.actions.reopen}
      </ActionButton>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {status === "booked" && !past ? (
        <ActionButton action={set("confirmed")} errors={errors}>
          {t.actions.confirm}
        </ActionButton>
      ) : null}
      {past ? (
        <>
          <ActionButton action={set("completed")} errors={errors}>
            {t.actions.complete}
          </ActionButton>
          <ActionButton action={set("no_show")} errors={errors} variant="ghost">
            {t.actions.noShow}
          </ActionButton>
        </>
      ) : (
        <ActionButton action={set("cancelled")} errors={errors} variant="ghost">
          {t.actions.cancel}
        </ActionButton>
      )}
    </div>
  );
}
