import { redirect } from "next/navigation";

import { ActionForm, SelectField, SubmitButton, TextArea, TextField } from "@/components/app/form";
import { PageHeader, Panel, param } from "@/components/app/ui";
import { MenuPicker } from "@/components/restaurant/menu-picker";
import { createRestaurantOrder } from "@/lib/actions/restaurant";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { listCustomerOptions } from "@/lib/data/queries";
import { listMenu } from "@/lib/data/restaurant";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { currencyLabel, format } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.restaurant.floor.title);

/** A takeaway or delivery order: dishes from the menu, the customer (required for delivery), sent to the kitchen. */
export default async function NewRestaurantOrderPage({ searchParams }: PageProps<"/[lang]/dashboard/restaurant/new">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/restaurant/new"));
  const back = localizePath(locale, "/dashboard/restaurant");
  if (!hasRole(business.role, "agent")) redirect(back);
  const type = param(sp.type) === "delivery" ? "delivery" : "takeaway";
  const d = t.dashboard;
  const r = d.restaurant;
  const n = r.newOrder;
  const [menu, customers] = await Promise.all([listMenu(business.id), listCustomerOptions(business.id)]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title={n.title[type]} back={{ href: back, label: r.floor.title }} />
      <ActionForm action={createRestaurantOrder.bind(null, type, locale)} text={{ errors: d.errors, saved: d.common.saved, saving: d.common.saving }} successMessage={null}>
        <Panel>
          <MenuPicker menu={menu} currency={business.currency} locale={locale} t={r.menu} />
        </Panel>
        <Panel className="grid gap-4 sm:grid-cols-2">
          <SelectField
            name="customer_id"
            label={n.customer}
            defaultValue=""
            placeholder={type === "delivery" ? "—" : n.walkIn}
            options={customers.map((c) => ({ value: c.id, label: `${c.name || c.whatsapp_phone} · ${c.reference ?? c.whatsapp_phone}` }))}
          />
          {type === "delivery" ? (
            <>
              <TextField name="address" label={n.address} maxLength={300} />
              <TextField name="phone" label={n.phone} maxLength={24} inputMode="tel" />
              <TextField name="fee" label={format(n.fee, { currency: currencyLabel(business.currency) })} inputMode="decimal" />
            </>
          ) : null}
          <TextArea name="notes" label={n.notes} maxLength={1000} rows={2} className="sm:col-span-2" />
        </Panel>
        <div>
          <SubmitButton>{n.submit}</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
