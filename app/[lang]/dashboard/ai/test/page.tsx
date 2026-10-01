import { redirect } from "next/navigation";

import { FormAlert } from "@/components/auth/form-alert";
import { TestChat } from "@/components/app/test-chat";
import { LinkTabs, PageHeader } from "@/components/app/ui";
import { aiConfigured } from "@/lib/ai/claude";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { LANGUAGE_CODES, languageName } from "@/lib/i18n/languages";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.aiTest.title);


/** AI Assistant → Test chat: try the assistant without WhatsApp (nothing sent, nothing saved). */
export default async function AiTestChatPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/ai/test"));
  if (!hasRole(business.role, "agent")) redirect(localizePath(locale, "/dashboard/ai"));
  const d = t.dashboard;
  const href = (p: string) => localizePath(locale, p);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title={d.ai.title} description={d.aiTest.description} />
      <LinkTabs
        active="test"
        tabs={[
          { key: "general", label: d.ai.tabs.general, href: href("/dashboard/ai") },
          { key: "languages", label: d.ai.tabs.languages, href: href("/dashboard/ai/languages") },
          { key: "test", label: d.ai.tabs.test, href: href("/dashboard/ai/test") },
        ]}
      />
      {!aiConfigured() ? <FormAlert tone="info">{d.aiTest.errors.not_configured}</FormAlert> : null}
      <TestChat t={d.aiTest} languageNames={Object.fromEntries(LANGUAGE_CODES.map((c) => [c, languageName(c, locale)]))} />
    </div>
  );
}
