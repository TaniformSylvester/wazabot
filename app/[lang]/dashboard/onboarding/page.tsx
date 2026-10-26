import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, CheckCircle2, Circle, Smartphone } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { ActionForm, RadioCards, SubmitButton, TextArea, TextField } from "@/components/app/form";
import { BusinessProfileForm, OpeningHoursForm } from "@/components/app/business-forms";
import { Panel, StatusBadge, formatMoney } from "@/components/app/ui";
import { saveOnboardingPersonality } from "@/lib/actions/ai";
import { advanceOnboarding } from "@/lib/actions/business";
import { saveFaq } from "@/lib/actions/knowledge";
import { saveProduct } from "@/lib/actions/products";
import { saveTable } from "@/lib/actions/restaurant";
import { getBusinessAiSettings, hasRole, requireBusiness } from "@/lib/auth/dal";
import { DEFAULT_OPENING_HOURS, hasOpeningHours } from "@/lib/business/hours";
import { getWhatsAppConnection, listFaqs, listProducts } from "@/lib/data/queries";
import { listTables } from "@/lib/data/restaurant";
import { getSchoolSettings, listClasses, listSubjects, listTerms, pickYear } from "@/lib/data/school";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { currencyLabel, format } from "@/lib/i18n/format";
import { languageName } from "@/lib/i18n/languages";
import { localizePath } from "@/lib/i18n/paths";
import { getBusinessModules } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const generateMetadata = dashboardMetadata((d) => d.onboarding.title);

/** The setup follows the business type (its modules): a school sets up its year and classes, a restaurant its menu and tables. */
const FLOWS = {
  commerce: ["profile", "hours", "products", "faqs", "ai", "whatsapp"],
  restaurant: ["profile", "hours", "menu", "tables", "faqs", "ai", "whatsapp"],
  school: ["profile", "school", "faqs", "ai", "whatsapp"],
} as const;
type StepKey = (typeof FLOWS)[keyof typeof FLOWS][number];

export default async function OnboardingPage({ searchParams }: PageProps<"/[lang]/dashboard/onboarding">) {
  const [locale, t, params] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/onboarding"));
  // Only owners/admins configure the business.
  if (!hasRole(business.role, "admin")) redirect(localizePath(locale, "/dashboard"));

  const d = t.dashboard;
  const o = d.onboarding;
  const modules = await getBusinessModules(business);
  const STEPS: readonly StepKey[] = modules.includes("school") && !modules.includes("commerce") ? FLOWS.school : modules.includes("restaurant") ? FLOWS.restaurant : FLOWS.commerce;
  const requested = Number(Array.isArray(params.step) ? params.step[0] : params.step);
  const step = Number.isInteger(requested) && requested >= 1 && requested <= STEPS.length ? requested : Math.min(business.onboardingStep + 1, STEPS.length);
  const key = STEPS[step - 1];
  const text = { errors: d.errors, saved: d.common.saved, saving: d.common.saving };
  const nextHref = localizePath(locale, step < STEPS.length ? `/dashboard/onboarding?step=${step + 1}` : "/dashboard");
  const onboarding = { onboarding_step: step, next_step: step < STEPS.length ? String(step + 1) : "done", locale };
  const skip = (
    <Link href={nextHref} className="text-sm font-semibold text-slate hover:text-deep hover:underline">
      {o.skip}
    </Link>
  );
  const back =
    step > 1 ? (
      <Link href={localizePath(locale, `/dashboard/onboarding?step=${step - 1}`)} className="text-sm font-semibold text-waza-700 hover:underline">
        {o.back}
      </Link>
    ) : null;

  /** "Save and continue" for steps whose content is saved by their own small forms. */
  const continueForm = (
    <ActionForm action={advanceOnboarding} text={text} hidden={onboarding} successMessage={null}>
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton>{step === STEPS.length ? o.finish : o.next}</SubmitButton>
        {back}
      </div>
    </ActionForm>
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {params.welcome ? <FormAlert tone="success">{d.home.welcomeConfirmed}</FormAlert> : null}
      <div>
        <p className="type-label text-waza-700">{format(o.stepOf, { step, total: STEPS.length })}</p>
        <h1 className="type-h2 mt-1">{o.title}</h1>
      </div>

      <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))` }} aria-label={o.title} data-testid="onboarding-steps" data-flow={STEPS.join(",")}>
        {STEPS.map((s, i) => (
          <li key={s}>
            <Link
              href={localizePath(locale, `/dashboard/onboarding?step=${i + 1}`)}
              aria-current={i + 1 === step ? "step" : undefined}
              title={o.steps[s].title}
              className={cn(
                "block h-1.5 rounded-full",
                i + 1 === step ? "bg-waza-500" : i < business.onboardingStep ? "bg-waza-200" : "bg-line",
              )}
            >
              <span className="sr-only">{o.steps[s].title}</span>
            </Link>
          </li>
        ))}
      </ol>

      <Panel id="step" title={o.steps[key].title} description={o.steps[key].text}>
        {key === "profile" ? (
          <BusinessProfileForm t={d.business} text={text} business={business} canEdit submitLabel={o.next} onboarding={onboarding} extraActions={skip} />
        ) : null}

        {key === "hours" ? (
          <OpeningHoursForm
            t={d.business}
            text={text}
            hours={hasOpeningHours(business.openingHours) ? business.openingHours : DEFAULT_OPENING_HOURS}
            timezone={business.timezone}
            canEdit
            submitLabel={o.next}
            onboarding={onboarding}
            extraActions={
              <>
                {back}
                {skip}
              </>
            }
          />
        ) : null}

        {key === "products" || key === "menu" ? <ProductsStep businessId={business.id} currency={business.currency} menu={key === "menu"} /> : null}
        {key === "tables" ? <TablesStep businessId={business.id} /> : null}
        {key === "school" ? <SchoolStep businessId={business.id} /> : null}
        {key === "faqs" ? <FaqsStep businessId={business.id} /> : null}
        {key === "ai" ? <AiStep /> : null}

        {key === "whatsapp" ? (
          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-3 rounded-2xl bg-surface p-4">
              <Smartphone className="mt-0.5 size-5 shrink-0 text-deep" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-deep">{o.whatsappNote}</p>
                <p className="mt-1 text-sm text-slate">{o.whatsappText}</p>
              </div>
            </div>
            <WhatsAppStep businessId={business.id} />
          </div>
        ) : null}
      </Panel>

      {key === "products" || key === "menu" || key === "tables" || key === "school" || key === "faqs" || key === "whatsapp" ? continueForm : null}
    </div>
  );

  async function ProductsStep({ businessId, currency, menu }: { businessId: string; currency: string; menu: boolean }) {
    const { rows } = await listProducts(businessId);
    const p = d.products;
    const addLabel = menu ? o.addDish : o.addProduct;
    return (
      <div className="flex flex-col gap-6">
        {rows.length ? (
          <div>
            <p className="mb-2 text-sm font-semibold text-deep">{format(menu ? o.dishesAdded : o.productsAdded, { count: rows.length })}</p>
            <ul className="divide-y divide-border rounded-2xl border border-border">
              {rows.slice(0, 8).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2 font-medium text-deep">
                    <Check className="size-4 shrink-0 text-success" aria-hidden />
                    <span className="truncate">{r.name}</span>
                  </span>
                  <span className="shrink-0 text-slate">{formatMoney(r.price, r.currency, locale)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ActionForm action={saveProduct} text={text} resetOnSuccess successMessage={p.saved} hidden={{ active: "on", variants: "[]" }}>
          <p className="text-sm font-semibold text-deep">{addLabel}</p>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
            <TextField name="name" label={p.fields.name} required maxLength={160} />
            <TextField name="price" label={format(p.fields.price, { currency: currencyLabel(currency) })} inputMode="decimal" required />
            <TextField name="stock_quantity" label={p.fields.stock} inputMode="numeric" hint={p.fields.stockHint} />
          </div>
          <TextField name="category" label={p.fields.category} maxLength={80} />
          <div>
            <SubmitButton variant="outline">{addLabel}</SubmitButton>
          </div>
        </ActionForm>
        {skip}
      </div>
    );
  }

  async function TablesStep({ businessId }: { businessId: string }) {
    const tables = await listTables(businessId, true);
    const tb = d.restaurant.tables;
    return (
      <div className="flex flex-col gap-6">
        {tables.length ? (
          <div>
            <p className="mb-2 text-sm font-semibold text-deep">{format(o.tablesAdded, { count: tables.length })}</p>
            <ul className="flex flex-wrap gap-2" data-testid="onboarding-tables">
              {tables.map((x) => (
                <li key={x.id} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-deep">
                  <Check className="size-4 shrink-0 text-success" aria-hidden />
                  {x.name}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ActionForm action={saveTable} text={{ ...text, saved: tb.added }} successMessage={tb.added} resetOnSuccess className="sm:flex-row sm:flex-wrap sm:items-end">
          <TextField name="name" label={tb.name} required maxLength={40} className="sm:w-48" />
          <TextField name="area" label={tb.area} maxLength={40} className="sm:w-48" />
          <TextField name="seats" label={tb.seats} inputMode="numeric" className="sm:w-32" />
          <div>
            <SubmitButton variant="outline">{tb.add}</SubmitButton>
          </div>
        </ActionForm>
        {skip}
      </div>
    );
  }

  /** The school's own checklist (same as the School overview): each item opens its page and is ticked once done. */
  async function SchoolStep({ businessId }: { businessId: string }) {
    const so = d.school.overview;
    const [settings, { year }, subjects] = await Promise.all([getSchoolSettings(businessId), pickYear(businessId), listSubjects(businessId)]);
    const [terms, classes] = year ? await Promise.all([listTerms(businessId, year.id), listClasses(businessId, year.id)]) : [[], []];
    const db = await createClient();
    const { count: students } = await db.from("school_students").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "active");
    const items: [string, boolean, string][] = [
      [so.setup.profile, settings.saved, "/dashboard/school/settings"],
      [so.setup.year, !!year && terms.length > 0 && terms.every((x) => x.assessments.length > 0), "/dashboard/school/settings#years"],
      [so.setup.subjects, subjects.length > 0, "/dashboard/school/classes#subjects"],
      [so.setup.classes, classes.length > 0 && classes.every((c) => c.subjects > 0), "/dashboard/school/classes"],
      [so.setup.students, (students ?? 0) > 0, "/dashboard/school/students"],
    ];
    return (
      <ol className="flex flex-col gap-2.5" data-testid="onboarding-school">
        {items.map(([label, done, path]) => (
          <li key={label} className="flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3 text-sm">
            <span className="flex items-center gap-3">
              {done ? <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden /> : <Circle className="size-5 shrink-0 text-slate" aria-hidden />}
              <span className={done ? "text-slate" : "font-semibold text-deep"}>{label}</span>
            </span>
            <Link href={localizePath(locale, path)} className="shrink-0 font-semibold text-waza-700 hover:underline">
              {o.schoolOpen}
            </Link>
          </li>
        ))}
      </ol>
    );
  }

  async function FaqsStep({ businessId }: { businessId: string }) {
    const faqs = await listFaqs(businessId);
    const f = d.knowledge.faqs.fields;
    return (
      <div className="flex flex-col gap-6">
        {faqs.length ? (
          <div>
            <p className="mb-2 text-sm font-semibold text-deep">{format(o.faqsAdded, { count: faqs.length })}</p>
            <ul className="divide-y divide-border rounded-2xl border border-border">
              {faqs.slice(0, 8).map((q) => (
                <li key={q.id} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-deep">
                  <Check className="size-4 shrink-0 text-success" aria-hidden />
                  <span className="truncate">{q.question}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ActionForm action={saveFaq} text={text} resetOnSuccess successMessage={d.knowledge.saved} hidden={{ active: "on", priority: 0, redirect: "stay" }}>
          <p className="text-sm font-semibold text-deep">{o.addFaq}</p>
          <TextField name="question" label={f.question} required maxLength={500} />
          <TextArea name="answer" label={f.answer} required maxLength={4000} rows={3} />
          <div>
            <SubmitButton variant="outline">{o.addFaq}</SubmitButton>
          </div>
        </ActionForm>
        {skip}
      </div>
    );
  }

  async function WhatsAppStep({ businessId }: { businessId: string }) {
    const conn = await getWhatsAppConnection(businessId);
    const status = conn?.status ?? "not_connected";
    return (
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge tone={status === "connected" ? "green" : status === "error" ? "red" : "neutral"} dot>
          {d.whatsapp.statuses[status]}
        </StatusBadge>
        {status !== "connected" ? (
          <Link href={localizePath(locale, "/dashboard/whatsapp")} className="text-sm font-semibold text-waza-700 hover:underline">
            {o.whatsappOpen}
          </Link>
        ) : null}
      </div>
    );
  }

  async function AiStep() {
    const settings = await getBusinessAiSettings();
    const a = d.ai;
    const currentLanguage = settings?.language.mode === "fixed" ? settings.language.defaultLanguage : "auto";
    return (
      <ActionForm action={saveOnboardingPersonality} text={text} hidden={{ locale }} successMessage={null}>
        <RadioCards
          name="tone"
          label={a.personality.label}
          defaultValue={settings?.style.tone ?? "friendly"}
          options={(["professional", "friendly", "casual"] as const).map((v) => ({ value: v, label: a.personality[v] }))}
        />
        <RadioCards
          name="reply_length"
          label={a.length.label}
          defaultValue={settings?.style.replyLength ?? "short"}
          options={(["short", "medium", "detailed"] as const).map((v) => ({ value: v, label: a.length[v] }))}
        />
        <RadioCards
          name="language"
          label={a.language.label}
          columns={4}
          defaultValue={currentLanguage}
          options={[
            { value: "auto", label: a.language.automatic },
            ...(["en", "fr", "wes"] as const).map((code) => ({ value: code, label: languageName(code, locale) })),
          ]}
        />
        <p className="text-xs text-slate">{a.language.text}</p>
        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton>{o.next}</SubmitButton>
          {back}
          {skip}
        </div>
      </ActionForm>
    );
  }
}
