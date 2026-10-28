import Link from "next/link";

import { Panel } from "@/components/app/ui";
import { SendOnWhatsApp } from "@/components/documents/send-whatsapp";
import type { FormState } from "@/lib/actions/form";
import type { Locale } from "@/lib/i18n/config";
import { format } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import type { Messages } from "@/messages/en";

/** "Send on WhatsApp" for a document or statement: who it goes to, and why it can't go now when it can't. */
export function WhatsAppSendPanel({
  state,
  action,
  canSend,
  locale,
  t,
  errors,
}: {
  state: { customer: { name: string; phone: string | null } | null; connected: boolean; windowOpen: boolean; templateApproved: boolean };
  action: () => Promise<FormState>;
  canSend: boolean;
  locale: Locale;
  t: Messages["dashboard"]["documents"]["whatsapp"];
  errors: Messages["dashboard"]["errors"];
}) {
  const c = state.customer;
  return (
    <Panel title={t.title} className="h-fit">
      <div className="flex flex-col gap-3 text-sm" data-testid="whatsapp-panel">
        {!c || !c.phone ? (
          <p className="text-slate">{t.noCustomer}</p>
        ) : !state.connected ? (
          <p className="text-slate">
            {t.notConnected}{" "}
            <Link href={localizePath(locale, "/dashboard/whatsapp")} className="font-semibold text-waza-700 hover:underline">
              {t.connect}
            </Link>
          </p>
        ) : (
          <>
            <p className="text-slate">{format(t.text, { name: c.name, phone: c.phone })}</p>
            {!state.windowOpen && state.templateApproved ? (
              <p className="text-slate" data-testid="whatsapp-template-route">
                {format(t.viaTemplate, { name: c.name })}
              </p>
            ) : null}
            {!state.windowOpen && !state.templateApproved ? (
              <p className="font-medium text-coral-700" data-testid="whatsapp-window-closed">
                {format(t.windowClosed, { name: c.name })}{" "}
                <Link href={localizePath(locale, "/dashboard/whatsapp/notifications")} className="font-semibold text-waza-700 hover:underline">
                  {t.setUpTemplate}
                </Link>
              </p>
            ) : null}
            {canSend ? (
              <SendOnWhatsApp action={action} label={t.send} pendingLabel={t.sending} sentLabel={t.sent} errors={errors} disabled={!state.windowOpen && !state.templateApproved} />
            ) : null}
          </>
        )}
        <p className="text-xs text-slate">{t.windowRule}</p>
      </div>
    </Panel>
  );
}
