import { redirect } from "next/navigation";

import { AppointmentForm } from "@/components/app/appointment-form";
import { PageHeader, param } from "@/components/app/ui";
import { isUuid } from "@/lib/actions/form";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { todayLocal } from "@/lib/business/time";
import { getBookingSetup, listCustomerOptions } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.appointments.new);

export default async function NewAppointmentPage({ searchParams }: PageProps<"/[lang]/dashboard/appointments/new">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/appointments/new"));
  const back = localizePath(locale, "/dashboard/appointments");
  if (!hasRole(business.role, "agent")) redirect(back);
  const [customers, { settings, services }] = await Promise.all([listCustomerOptions(business.id), getBookingSetup(business.id)]);
  const active = services.filter((s) => s.active);
  if (!settings?.enabled || !active.length) redirect(back);
  const d = t.dashboard;
  const customer = param(sp.customer);
  const conversation = param(sp.conversation);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title={d.appointments.new} back={{ href: back, label: d.appointments.title }} />
      <AppointmentForm
        t={d.appointments}
        text={{ errors: d.errors, saved: d.appointments.booked, saving: d.common.saving }}
        customers={customers}
        services={active}
        locale={locale}
        today={todayLocal(business.timezone)}
        defaultCustomerId={isUuid(customer) ? customer : undefined}
        conversationId={isUuid(conversation) ? conversation : undefined}
      />
    </div>
  );
}
