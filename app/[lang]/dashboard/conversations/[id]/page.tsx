import Link from "next/link";
import { notFound } from "next/navigation";
/* eslint-disable @next/next/no-img-element -- media comes from short-lived signed URLs; next/image would cache them. */
import { Check, CheckCheck, ChevronLeft, CircleAlert, Clock, FileText, Film, Image as ImageIcon, Lock, MapPin, Mic, UserRound } from "lucide-react";

import { CONVERSATION_FILTERS, ConversationList, filterToQuery, type ConversationFilterKey } from "@/components/app/conversation-list";
import { ConversationControls } from "@/components/app/conversation-controls";
import { DefinitionList, StatusBadge, conversationStatusTone, formatDate, param } from "@/components/app/ui";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { Composer } from "@/components/app/composer";
import { ActionButton } from "@/components/app/form";
import { markConversationRead } from "@/lib/actions/conversations";
import { sendFollowUp } from "@/lib/actions/notifications";
import { markWhatsAppRead } from "@/lib/actions/whatsapp";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/messaging/media-policy";
import { SupabaseMediaStore } from "@/lib/messaging/media-store";
import { locationFromPayload, mapsUrl } from "@/lib/messaging/views";
import { windowOpen } from "@/lib/whatsapp/service";
import { isUuid } from "@/lib/actions/form";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { followUpReady, getAiSettingsRow, getConversation, getWhatsAppConnection, listConversations } from "@/lib/data/queries";
import { aiConfigured } from "@/lib/ai/claude";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { isLanguageCode, languageName } from "@/lib/i18n/languages";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages/en";

export const generateMetadata = dashboardMetadata((d) => d.conversations.title);

const MEDIA_ICONS = { audio: Mic, image: ImageIcon, document: FileText, video: Film, location: MapPin } as const;

export default async function ConversationPage({ params, searchParams }: PageProps<"/[lang]/dashboard/conversations/[id]">) {
  const [locale, t, { id }, sp] = await Promise.all([getLocale(), getMessages(), params, searchParams]);
  const { business } = await requireBusiness(localizePath(locale, `/dashboard/conversations/${id}`));
  const data = isUuid(id) ? await getConversation(business.id, id) : null;
  if (!data) notFound();
  const { conversation, messages } = data;
  const customer = conversation.customers;
  const d = t.dashboard;
  const c = d.conversations;
  const canAct = hasRole(business.role, "agent");

  if (canAct && conversation.unread_count > 0) {
    await markConversationRead(conversation.id);
    await markWhatsAppRead(conversation.id);
  }
  const connection = await getWhatsAppConnection(business.id);
  const connected = connection?.status === "connected";
  // After the 24-hour window, an approved follow-up template lets the team reach the customer again.
  const canFollowUp = canAct && connected && (await followUpReady(business.id));
  const mediaUrls = await signMedia(messages);
  const aiSettings = await getAiSettingsRow(business.id);
  const assistantLive = aiConfigured() && connected && aiSettings?.ai_enabled !== false;

  const filter = (CONVERSATION_FILTERS as readonly string[]).includes(param(sp.filter) ?? "") ? (param(sp.filter) as ConversationFilterKey) : "all";
  const q = param(sp.q);
  const rows = await listConversations(business.id, { ...filterToQuery(filter), q });
  const name = customer?.name || `+${customer?.whatsapp_phone ?? ""}`;
  const statusLabel = c.statuses[conversation.status as keyof typeof c.statuses] ?? conversation.status;

  const customerDetails = customer ? (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-mint text-waza-700">
          <UserRound className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-deep">{customer.name || d.customers.unnamed}</p>
          <p className="text-sm text-slate">+{customer.whatsapp_phone}</p>
        </div>
      </div>
      <DefinitionList
        rows={[
          { label: d.customers.fields.language, value: isLanguageCode(customer.preferred_language) ? languageName(customer.preferred_language, locale) : d.customers.fields.languageAuto },
          { label: d.customers.fields.city, value: customer.city ?? "—" },
          { label: d.customers.fields.email, value: customer.email ?? "—" },
          { label: d.customers.profile.firstContact, value: customer.first_contact_at ? formatDate(customer.first_contact_at, locale) : d.customers.never },
        ]}
      />
      {customer.tags.length ? (
        <div className="flex flex-wrap gap-1">
          {customer.tags.map((tag) => (
            <StatusBadge key={tag}>{tag}</StatusBadge>
          ))}
        </div>
      ) : null}
      {customer.notes ? <p className="rounded-xl bg-surface p-3 text-sm whitespace-pre-line text-deep">{customer.notes}</p> : null}
      <Link href={localizePath(locale, `/dashboard/customers/${customer.id}`)} className="text-sm font-semibold text-waza-700 hover:underline">
        {c.viewProfile}
      </Link>
    </div>
  ) : null;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <Link href={localizePath(locale, `/dashboard/conversations${filter !== "all" ? `?filter=${filter}` : ""}`)} className="inline-flex min-h-8 items-center gap-1 text-sm font-semibold text-waza-700 hover:underline lg:hidden">
        <ChevronLeft className="size-4" aria-hidden /> {c.backToList}
      </Link>
      <div className="grid overflow-hidden rounded-3xl border border-border bg-card shadow-card lg:h-[calc(100dvh-10rem)] lg:grid-cols-[20rem_1fr] xl:grid-cols-[20rem_1fr_19rem]">
        <aside className="hidden min-h-0 flex-col border-r border-border lg:flex" aria-label={c.title}>
          <ConversationList rows={rows} activeId={conversation.id} filter={filter} q={q} t={c} searchLabel={d.common.search} locale={locale} />
        </aside>

        <section className="flex min-h-[70dvh] min-w-0 flex-col lg:min-h-0" aria-label={name}>
          <header className="flex flex-col gap-3 border-b border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 flex-1 truncate font-display text-lg font-bold text-deep">{name}</h1>
              <StatusBadge tone={conversation.ai_enabled ? "blue" : "amber"} dot>
                {conversation.ai_enabled ? c.aiOnline : c.humanMode}
              </StatusBadge>
              <StatusBadge tone={conversationStatusTone[conversation.status]}>{statusLabel}</StatusBadge>
              {conversation.human_requested ? <StatusBadge tone="red">{c.humanRequested}</StatusBadge> : null}
            </div>
            <p className="text-xs text-slate">{conversation.ai_enabled ? (assistantLive ? c.aiOnlineText : c.aiNotLiveText) : c.humanModeText}</p>
            {canAct ? (
              <ConversationControls
                id={conversation.id}
                aiEnabled={conversation.ai_enabled}
                status={conversation.status}
                labels={{ takeOver: c.takeOver, returnToAi: c.returnToAi, markStatus: c.markStatus, statuses: c.statuses }}
                errors={d.errors}
              />
            ) : null}
            {canAct && customer ? (
              <Link
                href={localizePath(locale, `/dashboard/orders/new?customer=${customer.id}&conversation=${conversation.id}`)}
                className="inline-flex min-h-8 w-fit items-center text-sm font-semibold text-waza-700 hover:underline"
              >
                + {d.customers.profile.newOrder}
              </Link>
            ) : null}
            {customerDetails ? (
              <details className="rounded-2xl border border-border p-3 xl:hidden">
                <summary className="flex min-h-8 cursor-pointer items-center text-sm font-semibold text-deep">{c.showCustomer}</summary>
                <div className="mt-3">{customerDetails}</div>
              </details>
            ) : null}
          </header>

          <ol className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-surface/60 p-4" aria-label={c.title}>
            {messages.length === 0 ? (
              <li className="m-auto max-w-sm text-center">
                <p className="font-semibold text-deep">{c.noMessages}</p>
                <p className="mt-1 text-sm text-slate">{c.noMessagesText}</p>
              </li>
            ) : (
              messages.map((m) => <MessageBubble key={m.id} m={m} c={c} locale={locale} mediaUrls={mediaUrls} />)
            )}
          </ol>

          <footer className="border-t border-border p-4">
            {!canAct ? (
              <ComposerNote text={c.composer.readOnly} />
            ) : !connected ? (
              <ComposerNote text={c.composerDisabled}>
                <Link href={localizePath(locale, "/dashboard/whatsapp")} className="font-semibold text-waza-700 hover:underline">
                  {c.composer.connectLink}
                </Link>
              </ComposerNote>
            ) : !conversation.last_customer_message_at || !windowOpen(conversation.last_customer_message_at) ? (
              <div className="flex flex-col gap-3">
                <ComposerNote text={conversation.last_customer_message_at ? c.composer.windowClosed : c.composer.noCustomerMessage} />
                {canFollowUp ? (
                  <div className="flex flex-wrap items-center gap-3 pl-7">
                    <ActionButton action={sendFollowUp.bind(null, conversation.id)} pendingLabel={d.notifications.followUp.sending} errors={d.errors} variant="default">
                      {d.notifications.followUp.button}
                    </ActionButton>
                    <p className="text-xs text-slate">{d.notifications.followUp.text}</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <Composer conversationId={conversation.id} labels={c.composer} text={{ errors: d.errors, saved: d.common.saved, saving: c.composer.sending }} />
            )}
            {connected ? (
              <div className="mt-2 text-right">
                <AutoRefresh label={c.live} />
              </div>
            ) : null}
          </footer>
        </section>

        {customerDetails ? (
          <aside className="hidden min-h-0 overflow-y-auto border-l border-border p-5 xl:block" aria-label={c.customerPanel}>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate">{c.customerPanel}</h2>
            {customerDetails}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

type Msg = NonNullable<Awaited<ReturnType<typeof getConversation>>>["messages"][number];

function ComposerNote({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Lock className="mt-0.5 size-4 shrink-0 text-slate" aria-hidden />
      <p className="text-xs text-slate">
        {text} {children}
      </p>
    </div>
  );
}

/** Short-lived signed URLs for stored media. Membership was already proven by reading the rows under RLS. */
async function signMedia(messages: Msg[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const stored = messages.flatMap((m) => m.message_media).filter((f) => f.status === "stored" && f.storage_path);
  if (!stored.length || !process.env.SUPABASE_SERVICE_ROLE_KEY) return urls;
  const store = new SupabaseMediaStore();
  await Promise.all(
    stored.map(async (f) => {
      try {
        urls.set(f.id, await store.signedUrl(f.storage_path!, SIGNED_URL_TTL_SECONDS));
      } catch {
        // Missing file or storage unavailable: shown as "not available".
      }
    }),
  );
  return urls;
}

function DeliveryTick({ status, error, labels }: { status: string | null; error: string | null; labels: Messages["dashboard"]["conversations"]["delivery"] }) {
  if (!status) return null;
  const key = status as keyof typeof labels;
  const Icon = status === "read" || status === "delivered" ? CheckCheck : status === "sent" ? Check : status === "failed" ? CircleAlert : Clock;
  return (
    <span className={cn("inline-flex items-center gap-0.5", status === "read" && "text-sky-600", status === "failed" && "font-semibold text-coral-700")} title={error ?? undefined}>
      <Icon className="size-3" aria-hidden />
      {labels[key] ?? status}
    </span>
  );
}

/** Text as written. Media: the file (private, signed URL) plus a note that it isn't processed automatically yet. */
function MessageBubble({ m, c, locale, mediaUrls }: { m: Msg; c: Messages["dashboard"]["conversations"]; locale: "en" | "fr"; mediaUrls: Map<string, string> }) {
  const inbound = m.direction === "inbound";
  const sender = (m.sender_type in c.sender ? m.sender_type : "system") as keyof typeof c.sender;
  const type = m.message_type as keyof typeof MEDIA_ICONS | "text";
  const Icon = type !== "text" ? MEDIA_ICONS[type] : null;
  const location = type === "location" && m.payload && typeof m.payload === "object" && !Array.isArray(m.payload) ? locationFromPayload(m.payload as Record<string, unknown>) : null;
  return (
    <li className={cn("flex", inbound ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm sm:max-w-[70%]",
          inbound ? "rounded-bl-md bg-card text-deep" : sender === "ai" ? "rounded-br-md bg-deep text-cream" : "rounded-br-md bg-waza-100 text-deep",
        )}
      >
        <p className={cn("mb-1 text-[0.6875rem] font-semibold", sender === "ai" && !inbound ? "text-cream/70" : "text-slate")}>{c.sender[sender]}</p>
        {Icon ? (
          <div className="flex flex-col gap-1">
            <p className="flex items-start gap-2 italic">
              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{c.futureMedia[type as keyof typeof MEDIA_ICONS]}</span>
            </p>
            {m.message_media.map((f) => {
              const url = mediaUrls.get(f.id);
              if (url && f.kind === "image") {
                return (
                  <a key={f.id} href={url} target="_blank" rel="noreferrer" className="block">
                    <img src={url} alt={m.caption ?? ""} className="max-h-60 rounded-xl border border-border object-contain" />
                  </a>
                );
              }
              if (url && f.kind === "audio") {
                return (
                  <audio key={f.id} controls preload="none" src={url} className="h-9 w-full max-w-72">
                    <track kind="captions" />
                  </audio>
                );
              }
              if (url) {
                return (
                  <a key={f.id} href={url} target="_blank" rel="noreferrer" className="font-semibold text-waza-700 underline">
                    {f.original_filename || c.media.open}
                  </a>
                );
              }
              return (
                <span key={f.id} className="text-xs text-slate">
                  {f.status === "pending" ? c.media.pending : f.status === "failed" ? c.media.failed : c.media.unavailable}
                </span>
              );
            })}
            {location ? (
              <a href={mapsUrl(location)} target="_blank" rel="noreferrer" className="font-semibold text-waza-700 underline">
                {location.name ?? location.address ?? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`}
              </a>
            ) : null}
            {m.caption ? <p className="whitespace-pre-line">{m.caption}</p> : null}
          </div>
        ) : (
          <p className="whitespace-pre-line break-words">{m.content}</p>
        )}
        <p className={cn("mt-1 flex items-center justify-end gap-2 text-[0.625rem]", sender === "ai" && !inbound ? "text-cream/60" : "text-slate")}>
          <time dateTime={m.created_at}>{formatDate(m.created_at, locale, true)}</time>
          {!inbound ? <DeliveryTick status={m.delivery_status} error={m.delivery_error} labels={c.delivery} /> : null}
        </p>
      </div>
    </li>
  );
}
