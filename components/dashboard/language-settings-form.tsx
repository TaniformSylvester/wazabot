"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useForm, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, FlaskConical, Star } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { useAuthText } from "@/components/auth/use-auth-text";
import { Button } from "@/components/ui/button";
import { saveLanguageSettings } from "@/lib/actions/settings";
import { analyzeInboundMessage } from "@/lib/ai/language";
import { EMOJI_LEVELS, FORMALITY_LEVELS, REPLY_LENGTHS, STYLE_NOTES_MAX, TONES } from "@/lib/ai/style";
import { format } from "@/lib/i18n/format";
import { aiLanguageCodes, languageName, languages, type LanguageCode } from "@/lib/i18n/languages";
import { cn } from "@/lib/utils";
import { languageSettingsSchema, type LanguageSettingsInput, type SettingsActionResult } from "@/lib/validation/settings";
import type { Messages } from "@/messages/en";

type T = Messages["dashboard"]["languages"];

export function LanguageSettingsForm({
  t,
  initial,
  canEdit,
}: {
  t: T;
  initial: LanguageSettingsInput;
  canEdit: boolean;
}) {
  const { locale, fieldError } = useAuthText();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SettingsActionResult | null>(null);
  const form = useForm<LanguageSettingsInput>({
    resolver: zodResolver(languageSettingsSchema),
    defaultValues: initial,
  });
  const { register, setValue, control, formState } = form;
  const enabled = useWatch({ control, name: "enabledLanguages" });
  const defaultLanguage = useWatch({ control, name: "defaultLanguage" });
  const notes = useWatch({ control, name: "styleNotes" });

  const onSubmit = form.handleSubmit((values) => {
    setResult(null);
    startTransition(async () => {
      const res = await saveLanguageSettings(values);
      if (!res.ok && res.fieldErrors) {
        for (const [name, messages] of Object.entries(res.fieldErrors)) {
          if (messages?.[0]) form.setError(name as keyof LanguageSettingsInput, { message: messages[0] });
        }
      }
      if (res.ok) form.reset(values);
      setResult(res);
    });
  });

  const toggleLanguage = (code: LanguageCode) => {
    const next = enabled.includes(code) ? enabled.filter((c) => c !== code) : [...enabled, code];
    setValue("enabledLanguages", next, { shouldDirty: true, shouldValidate: true });
    // Keep the default valid: if it was switched off, the first remaining language becomes the default.
    if (!next.includes(defaultLanguage) && next[0]) setValue("defaultLanguage", next[0], { shouldDirty: true });
  };

  const makeDefault = (code: LanguageCode) => {
    if (!enabled.includes(code)) setValue("enabledLanguages", [...enabled, code], { shouldDirty: true });
    setValue("defaultLanguage", code, { shouldDirty: true, shouldValidate: true });
  };

  const errors = formState.errors;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        {!canEdit ? <FormAlert tone="info">{t.readOnly}</FormAlert> : null}

        <fieldset disabled={!canEdit || pending} className="flex flex-col gap-6">
          <Card title={t.replyLanguages.title} description={t.replyLanguages.description}>
            <ul className="flex flex-col gap-2">
              {aiLanguageCodes.map((code) => {
                const on = enabled.includes(code);
                const isDefault = defaultLanguage === code;
                return (
                  <li
                    key={code}
                    className={cn(
                      "flex flex-wrap items-center gap-3 rounded-2xl border p-3 sm:flex-nowrap",
                      on ? "border-waza-300 bg-mint/60" : "border-border",
                    )}
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleLanguage(code)}
                        className="size-4.5 accent-[var(--color-waza-600)]"
                      />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-deep">
                          {languageName(code, locale)}
                          <span lang={code} className="font-normal text-slate">
                            {languages[code].nativeName}
                          </span>
                          {!languages[code].ui ? (
                            <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider text-gold-800">
                              {t.replyLanguages.beta}
                            </span>
                          ) : null}
                        </span>
                        {languages[code].fallback ? (
                          <span className="mt-0.5 block text-xs text-slate">{t.replyLanguages.fallbackNote}</span>
                        ) : null}
                      </span>
                    </label>
                    {isDefault ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-deep px-2.5 py-1 text-xs font-semibold text-white">
                        <Star className="size-3 fill-gold text-gold" aria-hidden /> {t.replyLanguages.default}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => makeDefault(code)}
                        className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-deep hover:bg-white"
                      >
                        {t.replyLanguages.setDefault}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-slate">{t.replyLanguages.defaultHelp}</p>
            <FieldError message={fieldError(errors.enabledLanguages?.message ?? errors.defaultLanguage?.message)} />
          </Card>

          <Card title={t.mode.title}>
            <div className="grid gap-3 md:grid-cols-2">
              {(["auto", "fixed"] as const).map((mode) => (
                <label
                  key={mode}
                  className="flex cursor-pointer gap-3 rounded-2xl border border-border p-4 has-[:checked]:border-waza-400 has-[:checked]:bg-mint/60"
                >
                  <input type="radio" value={mode} {...register("mode")} className="mt-1 accent-[var(--color-waza-600)]" />
                  <span>
                    <span className="block text-sm font-semibold text-deep">{t.mode[mode].label}</span>
                    <span className="mt-0.5 block text-xs text-slate">{t.mode[mode].text}</span>
                  </span>
                </label>
              ))}
            </div>
          </Card>

          <Card title={t.style.title} description={t.style.description}>
            <div className="grid gap-5 md:grid-cols-2">
              <Segmented label={t.style.tone.label} name="tone" options={TONES} labels={t.style.tone} register={register} />
              <Segmented label={t.style.length.label} name="replyLength" options={REPLY_LENGTHS} labels={t.style.length} register={register} />
              <Segmented label={t.style.emoji.label} name="emojiLevel" options={EMOJI_LEVELS} labels={t.style.emoji} register={register} />
              <div>
                <Segmented label={t.style.formality.label} name="formality" options={FORMALITY_LEVELS} labels={t.style.formality} register={register} />
                <p className="mt-2 text-xs text-slate">{t.style.formality.help}</p>
              </div>
            </div>

            <label className="mt-5 flex cursor-pointer gap-3 rounded-2xl border border-border p-4">
              <input type="checkbox" {...register("mirrorCodeSwitching")} className="mt-1 size-4 accent-[var(--color-waza-600)]" />
              <span>
                <span className="block text-sm font-semibold text-deep">{t.style.mirror.label}</span>
                <span className="mt-0.5 block text-xs text-slate">{t.style.mirror.text}</span>
              </span>
            </label>

            <NotesField
              label={t.style.notes.label}
              placeholder={t.style.notes.placeholder}
              help={t.style.notes.help}
              count={notes?.length ?? 0}
              error={fieldError(errors.styleNotes?.message)}
              registration={register("styleNotes")}
            />
          </Card>
        </fieldset>

        {result ? (
          result.ok ? (
            <FormAlert tone="success">{t.saved}</FormAlert>
          ) : (
            <FormAlert tone="error">{t.errors[result.error]}</FormAlert>
          )
        ) : null}

        {canEdit ? (
          <div className="flex justify-end">
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? t.saving : t.save}
            </Button>
          </div>
        ) : null}
      </form>

      <DetectionPreview t={t.preview} control={control} />
    </div>
  );
}

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6 shadow-card">
      <h2 className="type-h3 text-lg">{title}</h2>
      {description ? <p className="type-small mt-1 text-slate">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-2 text-xs font-medium text-coral-700" role="alert">
      {message}
    </p>
  );
}

function Segmented<N extends "tone" | "replyLength" | "emojiLevel" | "formality">({
  label,
  name,
  options,
  labels,
  register,
}: {
  label: string;
  name: N;
  options: readonly string[];
  labels: Record<string, string>;
  register: ReturnType<typeof useForm<LanguageSettingsInput>>["register"];
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-deep">{label}</legend>
      <div className="mt-2 inline-flex flex-wrap gap-1 rounded-2xl bg-surface p-1">
        {options.map((value) => (
          <label
            key={value}
            className="cursor-pointer rounded-xl px-3 py-1.5 text-sm font-medium text-slate transition-colors has-[:checked]:bg-white has-[:checked]:text-deep has-[:checked]:shadow-card has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-waza-500/40"
          >
            <input type="radio" value={value} {...register(name)} className="sr-only" />
            {labels[value]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function NotesField({
  label,
  placeholder,
  help,
  count,
  error,
  registration,
}: {
  label: string;
  placeholder: string;
  help: string;
  count: number;
  error?: string;
  registration: ReturnType<ReturnType<typeof useForm<LanguageSettingsInput>>["register"]>;
}) {
  const id = useId();
  return (
    <div className="mt-5 flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold text-deep">
        {label}
      </label>
      <textarea
        id={id}
        rows={3}
        maxLength={STYLE_NOTES_MAX}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className="w-full rounded-xl border border-input bg-white px-4 py-3 text-sm text-deep shadow-xs outline-none placeholder:text-slate/70 focus-visible:border-waza-500 focus-visible:ring-3 focus-visible:ring-waza-500/25"
        {...registration}
      />
      <p className="flex justify-between text-xs text-slate">
        <span>{help}</span>
        <span>
          {count}/{STYLE_NOTES_MAX}
        </span>
      </p>
      <FieldError message={error} />
    </div>
  );
}

/**
 * Runs the real language pipeline (lib/ai/language) in the browser against the
 * settings as currently edited. No message is sent and no AI reply is generated.
 */
function DetectionPreview({ t, control }: { t: T["preview"]; control: Control<LanguageSettingsInput> }) {
  const { locale } = useAuthText();
  const [text, setText] = useState("Bonjour, how much for dis robe? Abeg");
  const [mode, enabled, defaultLanguage] = useWatch({ control, name: ["mode", "enabledLanguages", "defaultLanguage"] });
  const id = useId();

  const analysis = useMemo(
    () =>
      text.trim()
        ? analyzeInboundMessage(text, { settings: { mode, enabledLanguages: enabled, defaultLanguage } })
        : null,
    [text, mode, enabled, defaultLanguage],
  );
  const name = (code: LanguageCode) => languageName(code, locale);
  const samples = [
    "Hello, is the red bag still available?",
    "Bonjour, vous livrez à Yaoundé ?",
    "Weti be di price for dis shoe?",
    "Répondez en anglais svp",
    "👍",
  ];

  return (
    <aside className="h-fit rounded-3xl border border-border bg-deep p-6 text-cream shadow-card xl:sticky xl:top-24">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold text-cream">
        <FlaskConical className="size-5 text-gold" aria-hidden /> {t.title}
      </h2>
      <p className="mt-1 text-xs text-cream/70">{t.description}</p>
      <label htmlFor={id} className="sr-only">
        {t.title}
      </label>
      <textarea
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder={t.placeholder}
        className="mt-4 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/40 focus-visible:border-waza-400"
      />
      <p className="mt-3 text-[0.6875rem] font-semibold uppercase tracking-wider text-cream/50">{t.samples}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {samples.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setText(s)}
            className="max-w-full truncate rounded-full border border-white/15 px-2.5 py-1 text-xs text-cream/80 hover:border-waza-400 hover:text-white"
          >
            {s}
          </button>
        ))}
      </div>

      {analysis ? (
        <dl className="mt-5 space-y-3 border-t border-white/10 pt-5 text-sm" aria-live="polite">
          <div>
            <dt className="text-xs text-cream/60">{t.detected}</dt>
            <dd className="font-semibold">
              {analysis.detection.primary ? (
                <>
                  {name(analysis.detection.primary)}
                  {analysis.detection.mixed && analysis.detection.secondary ? (
                    <span className="font-normal text-cream/75"> — {format(t.mixedWith, { language: name(analysis.detection.secondary) })}</span>
                  ) : null}
                  <span className="ml-2 text-xs font-normal text-cream/60">
                    {t.confidence} {Math.round(analysis.detection.confidence * 100)}%
                  </span>
                </>
              ) : (
                <span className="font-normal text-cream/75">{t.none}</span>
              )}
            </dd>
          </div>
          {analysis.explicitRequest ? (
            <div>
              <dt className="text-xs text-cream/60">{t.request}</dt>
              <dd className="font-semibold">{name(analysis.explicitRequest)}</dd>
            </div>
          ) : null}
          <div className="rounded-2xl bg-waza-500 p-3 text-deep">
            <dt className="text-xs font-semibold">{t.replyIn}</dt>
            <dd className="flex items-center gap-1.5 font-display text-lg font-bold">
              <Check className="size-4" strokeWidth={3} aria-hidden /> {name(analysis.decision.language)}
            </dd>
            <dd className="text-xs">{t.reasons[analysis.decision.reason]}</dd>
            {analysis.decision.fallbackFrom ? (
              <dd className="mt-1 text-xs">
                {format(t.fallback, { from: name(analysis.decision.fallbackFrom), to: name(analysis.decision.language) })}
              </dd>
            ) : null}
          </div>
        </dl>
      ) : null}
    </aside>
  );
}
