"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Link2, Loader2, LogOut, MessageCircle, UserMinus } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { useAuthText } from "@/components/auth/use-auth-text";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/actions/form";
import { inviteMember, leaveBusiness, removeMember, renewInvitation, updateMemberRole } from "@/lib/actions/team";
import type { Locale } from "@/lib/i18n/config";
import { format } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages/en";

type T = Messages["dashboard"]["team"];
type Errors = Record<string, string>;
type RoleOption = { value: string; label: string };

const control =
  "w-full min-w-0 rounded-xl border border-input bg-card px-3.5 text-[0.9375rem] text-deep outline-none focus-visible:border-waza-500 focus-visible:ring-4 focus-visible:ring-waza-500/15 aria-invalid:border-coral-600";

/** The invitation link, with copy and WhatsApp share buttons. Shown once after creating/renewing. */
export function InviteLink({ link, title, note, t, businessName }: { link: string; title: string; note: string; t: T; businessName: string }) {
  const [copied, setCopied] = useState(false);
  const share = `https://wa.me/?text=${encodeURIComponent(format(t.shareText, { business: businessName, link }))}`;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-waza-200 bg-mint/50 p-4" role="status">
      <p className="text-sm font-semibold text-deep">{title}</p>
      <input readOnly value={link} aria-label={title} onFocus={(e) => e.currentTarget.select()} className={cn(control, "h-10 font-mono text-xs")} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            } catch {
              // Clipboard blocked: the field above can still be selected and copied by hand.
            }
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          <span>{copied ? t.copied : t.copy}</span>
        </Button>
        <Button asChild size="sm">
          <a href={share} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden />
            <span>{t.shareWhatsApp}</span>
          </a>
        </Button>
      </div>
      <p className="text-xs text-slate">{note}</p>
    </div>
  );
}

export function InviteForm({ t, errors, roles, locale, businessName }: { t: T; errors: Errors; roles: RoleOption[]; locale: Locale; businessName: string }) {
  const [state, dispatch, pending] = useActionState(inviteMember, { status: "idle" } as FormState);
  const [invited, setInvited] = useState("");
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const { fieldError } = useAuthText();
  const emailError = fieldError(state.fieldErrors?.email?.[0]);
  const id = useId();

  useEffect(() => {
    if (state.status === "success") {
      ref.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="flex flex-col gap-4">
      <form
        ref={ref}
        noValidate
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setInvited(String(data.get("email") ?? "").trim());
          startTransition(() => dispatch(data));
        }}
      >
        <input type="hidden" name="locale" value={locale} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor={`${id}-email`} className="text-sm font-semibold text-deep">
            {t.email}
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            required
            maxLength={320}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? `${id}-email-error` : undefined}
            className={cn(control, "h-11")}
          />
          {emailError ? (
            <span id={`${id}-email-error`} role="alert" className="text-xs font-medium text-coral-700">
              {emailError}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5 sm:w-44">
          <label htmlFor={`${id}-role`} className="text-sm font-semibold text-deep">
            {t.role}
          </label>
          <select id={`${id}-role`} name="role" defaultValue="agent" className={cn(control, "h-11 pr-8")}>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={pending} className="h-11 shrink-0">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Link2 aria-hidden />}
          <span>{pending ? t.creating : t.createLink}</span>
        </Button>
      </form>
      {state.status === "error" && state.error && state.error !== "invalid" ? <FormAlert tone="error">{errors[state.error] ?? errors.unknown}</FormAlert> : null}
      {state.status === "success" && state.value ? (
        <InviteLink key={state.at} link={state.value} title={format(t.linkFor, { email: invited })} note={t.linkNote} t={t} businessName={businessName} />
      ) : null}
    </div>
  );
}

/** "New link" for a pending invitation: shows the fresh link right under the row. */
export function RenewInvite({ id, email, t, errors, locale, businessName }: { id: string; email: string; t: T; errors: Errors; locale: Locale; businessName: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<FormState | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => start(async () => setResult(await renewInvitation(id, locale)))}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Link2 aria-hidden />}
        <span>{t.newLink}</span>
      </Button>
      {result?.status === "error" ? (
        <span role="alert" className="text-xs font-medium text-coral-700">
          {errors[result.error ?? "unknown"] ?? errors.unknown}
        </span>
      ) : null}
      {result?.status === "success" && result.value ? (
        <InviteLink link={result.value} title={format(t.linkFor, { email })} note={t.renewedNote} t={t} businessName={businessName} />
      ) : null}
    </div>
  );
}

export function RoleSelect({ userId, role, name, roles, t, errors }: { userId: string; role: string; name: string; roles: RoleOption[]; t: T; errors: Errors }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col gap-1">
      <span className="relative inline-flex items-center gap-2">
        <select
          aria-label={format(t.changeRole, { name })}
          defaultValue={role}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value;
            start(async () => {
              setError(null);
              const res = await updateMemberRole(userId, next);
              if (res.status === "error") setError(errors[res.error ?? "unknown"] ?? errors.unknown);
              router.refresh();
            });
          }}
          className={cn(control, "h-9 w-auto pr-8 text-sm")}
        >
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        {pending ? <Loader2 className="size-4 animate-spin text-slate" aria-hidden /> : null}
      </span>
      {error ? (
        <span role="alert" className="text-xs font-medium text-coral-700">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** Two-step confirm (remove a member / leave the business). */
function ConfirmButton({
  label,
  pendingLabel,
  question,
  note,
  icon,
  run,
  errors,
  cancel,
}: {
  label: string;
  pendingLabel: string;
  question: string;
  note?: string;
  icon: React.ReactNode;
  run: () => Promise<FormState | undefined>;
  errors: Errors;
  cancel: string;
}) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  if (!asking) {
    return (
      <Button type="button" variant="ghost" size="sm" className="text-coral-700 hover:bg-coral-50" onClick={() => setAsking(true)}>
        {icon}
        <span>{label}</span>
      </Button>
    );
  }
  return (
    <div role="alertdialog" aria-label={question} className="flex flex-col gap-2 rounded-2xl border border-coral-200 bg-coral-50 p-3 text-left text-sm text-coral-800">
      <p className="font-semibold">{question}</p>
      {note ? <p className="text-xs">{note}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="bg-coral-600 text-white shadow-none hover:bg-coral-700"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await run();
              if (res?.status === "error") setError(errors[res.error ?? "unknown"] ?? errors.unknown);
              else router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : icon}
          <span>{pending ? pendingLabel : label}</span>
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(false)} disabled={pending}>
          {cancel}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function RemoveMember({ userId, name, t, errors, cancel }: { userId: string; name: string; t: T; errors: Errors; cancel: string }) {
  return (
    <ConfirmButton
      label={t.remove}
      pendingLabel={t.removing}
      question={format(t.confirmRemove, { name })}
      note={t.removeNote}
      icon={<UserMinus aria-hidden />}
      run={() => removeMember(userId)}
      errors={errors}
      cancel={cancel}
    />
  );
}

export function LeaveBusiness({ businessName, locale, t, errors, cancel }: { businessName: string; locale: Locale; t: T; errors: Errors; cancel: string }) {
  return (
    <ConfirmButton
      label={t.leave}
      pendingLabel={t.leaving}
      question={format(t.confirmLeave, { business: businessName })}
      note={format(t.leaveText, { business: businessName })}
      icon={<LogOut aria-hidden />}
      run={() => leaveBusiness(locale)}
      errors={errors}
      cancel={cancel}
    />
  );
}
