import { CircleAlert, CircleCheck, Loader2, Smartphone } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { DefinitionList, PageHeader, Panel, StatusBadge, formatDate, type BadgeTone } from "@/components/app/ui";
import { requireBusiness } from "@/lib/auth/dal";
import { getWhatsAppConnection } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.whatsapp.title);

const STATUS_UI: Record<string, { tone: BadgeTone; icon: typeof Smartphone }> = {
  not_connected: { tone: "neutral", icon: Smartphone },
  connecting: { tone: "amber", icon: Loader2 },
  connected: { tone: "green", icon: CircleCheck },
  error: { tone: "red", icon: CircleAlert },
};

/** Shows the real connection state from whatsapp_connections. Connecting is Stage 2; nothing is faked here. */
export default async function WhatsAppPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/whatsapp"));
  const conn = await getWhatsAppConnection(business.id);
  const w = t.dashboard.whatsapp;
  const status = conn?.status ?? "not_connected";
  const ui = STATUS_UI[status];
  const none = t.dashboard.common.notSet;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title={w.title} description={w.description} />
      <Panel title={w.status}>
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-surface text-deep">
              <ui.icon className="size-5" aria-hidden />
            </span>
            <StatusBadge tone={ui.tone} dot>
              {w.statuses[status]}
            </StatusBadge>
          </div>
          <DefinitionList
            rows={[
              { label: w.fields.phone, value: conn?.display_phone_number ?? none },
              { label: w.fields.verifiedName, value: conn?.verified_name ?? none },
              { label: w.fields.waba, value: conn?.waba_id ?? none },
              { label: w.fields.phoneNumberId, value: conn?.phone_number_id ?? none },
              { label: w.fields.connectedAt, value: conn?.connected_at ? formatDate(conn.connected_at, locale, true) : none },
            ]}
          />
          {status === "error" && conn?.last_error ? (
            <FormAlert tone="error">
              <span className="font-semibold">{w.lastError}:</span> {conn.last_error}
            </FormAlert>
          ) : null}
          {status !== "connected" ? (
            <>
              <FormAlert tone="info">{w.nextStage}</FormAlert>
              <div>
                <Button type="button" disabled aria-describedby="wa-next-stage">
                  <Smartphone aria-hidden /> {w.connect}
                </Button>
                <p id="wa-next-stage" className="sr-only">
                  {w.nextStage}
                </p>
              </div>
            </>
          ) : null}
        </div>
      </Panel>
      <Panel title={w.steps.title}>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-deep">
          {w.steps.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
