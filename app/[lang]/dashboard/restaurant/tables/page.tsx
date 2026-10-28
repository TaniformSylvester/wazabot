import { redirect } from "next/navigation";

import { ActionButton, ActionForm, SubmitButton, TextField } from "@/components/app/form";
import { PageHeader, Panel, StatusBadge } from "@/components/app/ui";
import { saveTable, setTableActive } from "@/lib/actions/restaurant";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { listTables } from "@/lib/data/restaurant";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";
import { getBranchContext } from "@/lib/branches";

export const generateMetadata = dashboardMetadata((d) => d.restaurant.tables.title);

/** Owners and admins: the restaurant's tables (add, rename, switch off). */
export default async function TablesPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/restaurant/tables"));
  if (!hasRole(business.role, "admin")) redirect(localizePath(locale, "/dashboard/restaurant"));
  const d = t.dashboard;
  const tb = d.restaurant.tables;
  // Several branches: the tables of the branch you work in (new tables go there too).
  const tables = await listTables(business.id, true, (await getBranchContext(business)).current.id);
  const text = { errors: d.errors, saved: tb.saved, saving: d.common.saving };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title={tb.title} description={tb.description} back={{ href: localizePath(locale, "/dashboard/restaurant"), label: d.restaurant.floor.title }} />
      <Panel title={tb.add}>
        <ActionForm action={saveTable} text={{ ...text, saved: tb.added }} successMessage={tb.added} resetOnSuccess className="sm:flex-row sm:flex-wrap sm:items-end">
          <TextField name="name" label={tb.name} required maxLength={40} className="sm:w-48" />
          <TextField name="area" label={tb.area} maxLength={40} className="sm:w-48" />
          <TextField name="seats" label={tb.seats} inputMode="numeric" className="sm:w-32" />
          <div>
            <SubmitButton>{tb.add}</SubmitButton>
          </div>
        </ActionForm>
      </Panel>
      <Panel>
        {tables.length ? (
          <ul className="divide-y divide-border" data-testid="tables-list">
            {tables.map((table) => (
              <li key={table.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-end">
                <ActionForm action={saveTable} text={text} hidden={{ id: table.id }} className="flex-1 sm:flex-row sm:flex-wrap sm:items-end">
                  <TextField name="name" label={tb.name} defaultValue={table.name} required maxLength={40} className="sm:w-40" />
                  <TextField name="area" label={tb.area} defaultValue={table.area ?? ""} maxLength={40} className="sm:w-40" />
                  <TextField name="seats" label={tb.seats} defaultValue={table.seats ? String(table.seats) : ""} inputMode="numeric" className="sm:w-28" />
                  <div>
                    <SubmitButton variant="outline">{tb.save}</SubmitButton>
                  </div>
                </ActionForm>
                <div className="flex items-center gap-2 pb-1">
                  <StatusBadge tone={table.active ? "green" : "neutral"}>{table.active ? tb.inUse : tb.off}</StatusBadge>
                  <ActionButton action={setTableActive.bind(null, table.id, !table.active)} errors={d.errors} variant="ghost">
                    {table.active ? tb.switchOff : tb.switchOn}
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate">{tb.empty}</p>
        )}
      </Panel>
    </div>
  );
}
