"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { CheckCircle2, GraduationCap, Store, UtensilsCrossed } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { FormField } from "@/components/auth/form-field";
import { useI18n } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { format } from "@/lib/i18n/format";
import type { Messages } from "@/messages/en";
import { SIGNUP_COUNTRIES, SIGNUP_VERTICALS, type SignupCountry, type SignupVertical } from "@/lib/validation/auth-rules";
import { cn } from "@/lib/utils";

type Text = Messages["waitlist"];
type Values = { businessName: string; whatsappNumber: string; email: string; country: SignupCountry; website: string };
type Field = "businessName" | "whatsappNumber" | "email" | "vertical";
const ERROR_KEY: Record<Field, keyof Text["errors"]> = { businessName: "business_name", whatsappNumber: "whatsapp", email: "email", vertical: "vertical" };
const ICONS = { shop: Store, restaurant: UtensilsCrossed, school: GraduationCap } as const;

/**
 * The beta waitlist form (POST /api/waitlist). The vertical comes pre-selected
 * from the page the visitor clicked on; the country only helps read a local
 * WhatsApp number. On success: what happens next, in their words.
 */
export function WaitlistForm({ text, vertical: initial, phoneExamples }: { text: Text; vertical?: SignupVertical; phoneExamples: Record<SignupCountry, string> }) {
  const { t, locale, href } = useI18n();
  const groupId = useId();
  const [vertical, setVertical] = useState<SignupVertical | undefined>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<keyof Text["errors"] | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [done, setDone] = useState<{ number: string; vertical: SignupVertical } | null>(null);
  const form = useForm<Values>({ defaultValues: { businessName: "", whatsappNumber: "", email: "", country: "CM", website: "" } });
  const country = useWatch({ control: form.control, name: "country" });
  const fieldText = (f: Field) => (fieldErrors[f] ? format(text.errors[ERROR_KEY[f]], { example: phoneExamples[country] }) : undefined);

  const onSubmit = form.handleSubmit(async (values) => {
    const local: Partial<Record<Field, string>> = {};
    if (values.businessName.trim().length < 2) local.businessName = "x";
    if (values.whatsappNumber.replace(/[^0-9]/g, "").length < 8) local.whatsappNumber = "x";
    if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(values.email.trim())) local.email = "x";
    if (!vertical) local.vertical = "x";
    setFieldErrors(local);
    if (Object.keys(local).length) return setError("invalid");
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...values, vertical, locale }) });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; number?: string; fieldErrors?: Record<string, string[]> } | null;
      if (res.ok && body?.ok) return setDone({ number: body.number ?? "", vertical: vertical! });
      if (body?.fieldErrors) setFieldErrors(Object.fromEntries(Object.keys(body.fieldErrors).map((k) => [k, "x"])) as Partial<Record<Field, string>>);
      setError(body?.error && body.error in text.errors ? (body.error as keyof Text["errors"]) : "failed");
    } catch {
      setError("failed");
    } finally {
      setPending(false);
    }
  });

  if (done) {
    return (
      <div className="flex flex-col items-center text-center" role="status" data-testid="waitlist-done">
        <span className="grid size-14 place-items-center rounded-2xl bg-waza-100 text-waza-800">
          <CheckCircle2 className="size-7" aria-hidden />
        </span>
        <h2 className="type-h3 mt-5 text-xl">{text.done.title}</h2>
        <p className="mt-2 text-slate">{format(text.done.text, { number: done.number, setup: text.done.setup[done.vertical] })}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" data-testid="waitlist-form">
      {error ? <FormAlert tone="error">{error === "closed" ? <Link href={href("/register")} className="underline">{text.errors.closed}</Link> : text.errors[error]}</FormAlert> : null}
      <fieldset className="flex flex-col gap-2" aria-describedby={fieldErrors.vertical ? `${groupId}-error` : undefined}>
        <legend className="mb-2 text-sm font-semibold text-deep">{text.vertical}</legend>
        <div className="grid grid-cols-3 gap-2" data-testid="waitlist-vertical">
          {SIGNUP_VERTICALS.map((v) => {
            const Icon = ICONS[v];
            return (
              <label
                key={v}
                className={cn(
                  "flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-waza-500/40",
                  vertical === v ? "border-waza-500 bg-mint text-deep" : "border-line bg-white text-slate hover:border-waza-300",
                )}
              >
                <input type="radio" name="vertical" value={v} checked={vertical === v} onChange={() => setVertical(v)} className="sr-only" />
                <Icon className="size-5" aria-hidden />
                {text.verticals[v]}
              </label>
            );
          })}
        </div>
        {fieldErrors.vertical ? (
          <p id={`${groupId}-error`} className="text-sm font-medium text-coral-700">
            {text.errors.vertical}
          </p>
        ) : null}
      </fieldset>
      <FormField label={vertical === "school" ? text.schoolName : text.businessName} autoComplete="organization" error={fieldText("businessName")} registration={form.register("businessName")} />
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${groupId}-country`}>{text.country}</Label>
        <select id={`${groupId}-country`} {...form.register("country")} className="h-12 rounded-xl border border-line bg-white px-3 text-base text-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-waza-500/40">
          {SIGNUP_COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {t.auth.fields.countries[c]}
            </option>
          ))}
        </select>
      </div>
      <FormField
        label={text.whatsapp}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder={phoneExamples[country]}
        hint={text.whatsappHint}
        error={fieldText("whatsappNumber")}
        registration={form.register("whatsappNumber")}
      />
      <FormField label={text.email} type="email" inputMode="email" autoComplete="email" error={fieldText("email")} registration={form.register("email")} />
      {/* Left empty by people; bots fill it in. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input type="text" tabIndex={-1} autoComplete="off" {...form.register("website")} />
        </label>
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? text.sending : text.submit}
      </Button>
      <p className="text-center text-xs text-slate">{text.privacy}</p>
    </form>
  );
}
