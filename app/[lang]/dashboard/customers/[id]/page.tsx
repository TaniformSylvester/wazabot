import Link from "next/link";
import { notFound } from "next/navigation";
import { MessagesSquare, Plus, ShoppingBag } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { ActionButton, DeleteButton } from "@/components/app/form";
import { CustomerForm } from "@/components/app/customer-form";
import {
  DefinitionList,
  PageHeader,
  Panel,
  StatusBadge,
  conversationStatusTone,
  formatDate,
  formatMoney,
  orderStatusTone,
  secondaryLink,
} from "@/components/app/ui";
import { startConversation } from "@/lib/actions/conversations";
import { deleteCustomer } from "@/lib/actions/customers";
import { isUuid } from "@/lib/actions/form";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { getCustomer } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { isLanguageCode, languageName } from "@/lib/i18n/languages";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.customers.title);

export default async function CustomerPage({ params, searchParams }: PageProps<"/[lang]/dashboard/customers/[id]">) {
  const [locale, t, { id }, sp] = await Promise.all([getLocale(), getMessages(), params, searchParams]);
  const { business } = await requireBusiness(localizePath(locale, `/dashboard/customers/${id}`));
  const data = isUuid(id) ? await getCustomer(business.id, id) : null;
  if (!data) notFound();
  const { customer, conversations, orders } = data;
  const d = t.dashboard;
  const c = d.customers;
  const canEdit = hasRole(business.role, "agent");
  const canDelete = hasRole(business.role, "admin");
  const href = (p: string) => localizePath(locale, p);
  const lang = isLanguageCode(customer.preferred_language) ? languageName(customer.preferred_language, locale) : c.fields.languageAuto;
  const source = customer.preferred_language_source as keyof typeof c.profile.languageSource | null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={customer.name || c.unnamed}
        description={`+${customer.whatsapp_phone}`}
        back={{ href: href("/dashboard/customers"), label: c.title }}
        actions={
          canEdit ? (
            <>
              <ActionButton action={startConversation.bind(null, customer.id, locale)} errors={d.errors} variant="dark" size="default">
                <MessagesSquare aria-hidden /> {c.profile.startConversation}
              </ActionButton>
              <Link href={href(`/dashboard/orders/new?customer=${customer.id}`)} className={secondaryLink}>
                <Plus aria-hidden /> {c.profile.newOrder}
              </Link>
            </>
          ) : null
        }
      />
      {sp.saved ? <FormAlert tone="success">{d.common.saved}</FormAlert> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {!canEdit ? <FormAlert tone="info">{d.common.readOnly}</FormAlert> : null}
          <CustomerForm t={c} text={{ errors: d.errors, saved: d.common.saved, saving: d.common.saving }} customer={customer} locale={locale} canEdit={canEdit} submitLabel={d.common.save} />
          {canDelete ? (
            <div>
              <DeleteButton
                action={deleteCustomer.bind(null, customer.id, locale)}
                labels={d.common}
                errors={{ ...d.errors, invalid: c.deleteBlocked }}
                note={orders.length ? c.deleteBlocked : undefined}
              />
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Panel title={c.profile.details}>
            <DefinitionList
              rows={[
                { label: c.fields.language, value: source && c.profile.languageSource[source] ? `${lang} (${c.profile.languageSource[source]})` : lang },
                { label: c.profile.firstContact, value: customer.first_contact_at ? formatDate(customer.first_contact_at, locale, true) : c.never },
                { label: c.profile.lastContact, value: customer.last_contact_at ? formatDate(customer.last_contact_at, locale, true) : c.never },
              ]}
            />
          </Panel>
          <Panel title={c.profile.conversations}>
            {conversations.length ? (
              <ul className="divide-y divide-border">
                {conversations.map((conv) => (
                  <li key={conv.id}>
                    <Link href={href(`/dashboard/conversations/${conv.id}`)} className="flex items-center gap-2 py-2.5 text-sm hover:underline">
                      <MessagesSquare className="size-4 shrink-0 text-slate" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{formatDate(conv.last_message_at ?? conv.created_at, locale, true)}</span>
                      <StatusBadge tone={conversationStatusTone[conv.status]}>{d.conversations.statuses[conv.status as keyof typeof d.conversations.statuses] ?? conv.status}</StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate">{c.profile.noConversations}</p>
            )}
          </Panel>
          <Panel title={c.profile.orders}>
            {orders.length ? (
              <ul className="divide-y divide-border">
                {orders.map((o) => (
                  <li key={o.id}>
                    <Link href={href(`/dashboard/orders/${o.id}`)} className="flex items-center gap-2 py-2.5 text-sm hover:underline">
                      <ShoppingBag className="size-4 shrink-0 text-slate" aria-hidden />
                      <span className="min-w-0 flex-1 truncate font-semibold">{o.order_number}</span>
                      <span className="whitespace-nowrap">{formatMoney(o.total, o.currency, locale)}</span>
                      <StatusBadge tone={orderStatusTone[o.status]}>{d.orders.statuses[o.status as keyof typeof d.orders.statuses] ?? o.status}</StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate">{c.profile.noOrders}</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
