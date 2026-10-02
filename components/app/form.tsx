"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { useAuthText } from "@/components/auth/use-auth-text";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/actions/form";
import { cn } from "@/lib/utils";

/*
 * Dashboard forms: a Server Action + useActionState, with field errors shown
 * next to each field. Fields are uncontrolled (defaultValue), and the form is
 * submitted from onSubmit so React doesn't clear what the user typed when the
 * server returns validation errors.
 */

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;
export type FormText = { errors: Record<string, string>; saved: string; saving: string };

type Ctx = { state: FormState; pending: boolean; disabled: boolean; text: FormText };
const FormCtx = createContext<Ctx | null>(null);

function useFormCtx() {
  const ctx = useContext(FormCtx);
  if (!ctx) throw new Error("Field used outside <ActionForm>");
  return ctx;
}

export function ActionForm({
  action,
  text,
  children,
  className,
  disabled = false,
  successMessage,
  resetOnSuccess = false,
  hidden,
}: {
  action: Action;
  text: FormText;
  children: React.ReactNode;
  className?: string;
  /** Read-only roles: every field is disabled and nothing can be submitted. */
  disabled?: boolean;
  successMessage?: string | null;
  resetOnSuccess?: boolean;
  /** Hidden fields, e.g. { id, locale }. */
  hidden?: Record<string, string | number | null | undefined>;
}) {
  const [state, dispatch, pending] = useActionState(action, { status: "idle" } as FormState);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") {
      if (resetOnSuccess) ref.current?.reset();
      router.refresh();
    }
  }, [state, resetOnSuccess, router]);

  return (
    <FormCtx.Provider value={{ state, pending, disabled, text }}>
      <form
        ref={ref}
        noValidate
        className={cn("flex flex-col gap-5", className)}
        onSubmit={(e) => {
          e.preventDefault();
          if (disabled) return;
          const data = new FormData(e.currentTarget);
          startTransition(() => dispatch(data));
        }}
      >
        {hidden
          ? Object.entries(hidden).map(([name, value]) =>
              value === null || value === undefined ? null : <input key={name} type="hidden" name={name} value={String(value)} />,
            )
          : null}
        {state.status === "error" && state.error ? (
          <FormAlert tone="error">{(text.errors[state.error] ?? text.errors.unknown).replace("{item}", state.detail ?? "")}</FormAlert>
        ) : null}
        {state.status === "success" && successMessage !== null ? <FormAlert tone="success">{successMessage ?? text.saved}</FormAlert> : null}
        <fieldset disabled={disabled || pending} className="flex min-w-0 flex-col gap-5">
          {children}
        </fieldset>
      </form>
    </FormCtx.Provider>
  );
}

export function SubmitButton({ children, className, variant }: { children: React.ReactNode; className?: string; variant?: "default" | "dark" | "outline" }) {
  const { pending, disabled, text } = useFormCtx();
  if (disabled) return null;
  return (
    <Button type="submit" disabled={pending} className={className} variant={variant}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {pending ? text.saving : children}
    </Button>
  );
}

/** Returns the translated error for a field name, if any. */
export function useFieldError(name: string) {
  const { state } = useFormCtx();
  const { fieldError } = useAuthText();
  return fieldError(state.fieldErrors?.[name]?.[0]);
}

const control =
  "w-full min-w-0 rounded-xl border border-input bg-card px-3.5 text-[0.9375rem] text-deep outline-none transition-[border-color,box-shadow] placeholder:text-slate/60 focus-visible:border-waza-500 focus-visible:ring-4 focus-visible:ring-waza-500/15 aria-invalid:border-coral-600 disabled:cursor-not-allowed disabled:opacity-60";

function FieldShell({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold text-deep">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-slate">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-coral-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type Common = { name: string; label: string; hint?: string; className?: string; errorName?: string };

export function TextField({
  name,
  label,
  hint,
  className,
  errorName,
  ...props
}: Common & Omit<React.ComponentProps<"input">, "name">) {
  const id = useId();
  const error = useFieldError(errorName ?? name);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(control, "h-11")}
        {...props}
      />
    </FieldShell>
  );
}

export function TextArea({ name, label, hint, className, errorName, ...props }: Common & Omit<React.ComponentProps<"textarea">, "name">) {
  const id = useId();
  const error = useFieldError(errorName ?? name);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <textarea
        id={id}
        name={name}
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(control, "min-h-24 py-2.5 leading-relaxed")}
        {...props}
      />
    </FieldShell>
  );
}

export function SelectField({
  name,
  label,
  hint,
  className,
  errorName,
  options,
  placeholder,
  ...props
}: Common & { options: { value: string; label: string }[]; placeholder?: string } & Omit<React.ComponentProps<"select">, "name">) {
  const id = useId();
  const error = useFieldError(errorName ?? name);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <select id={id} name={name} aria-invalid={error ? true : undefined} className={cn(control, "h-11 pr-8")} {...props}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({
  name,
  label,
  description,
  defaultChecked,
  className,
}: {
  name: string;
  label: string;
  description?: string;
  defaultChecked?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-4 has-[:checked]:border-waza-500 has-[:checked]:bg-mint/50", className)}>
      <input id={id} type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4.5 shrink-0 accent-waza-600" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-deep">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-slate">{description}</span> : null}
      </span>
    </label>
  );
}

/** Card-style radio group (e.g. personality, response length). */
export function RadioCards({
  name,
  label,
  options,
  defaultValue,
  columns = 3,
}: {
  name: string;
  label: string;
  options: { value: string; label: string; description?: string }[];
  defaultValue?: string;
  columns?: 2 | 3 | 4;
}) {
  const error = useFieldError(name);
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1.5 text-sm font-semibold text-deep">{label}</legend>
      <div className={cn("grid gap-2", columns === 2 ? "sm:grid-cols-2" : columns === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3")}>
        {options.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-border bg-card p-3.5 has-[:checked]:border-waza-500 has-[:checked]:bg-mint/60"
          >
            <input type="radio" name={name} value={o.value} defaultChecked={defaultValue === o.value} className="mt-0.5 accent-waza-600" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-deep">{o.label}</span>
              {o.description ? <span className="mt-0.5 block text-xs text-slate">{o.description}</span> : null}
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <p className="text-xs font-medium text-coral-700" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// One-click actions (toggle, delete, takeover) bound on the server.
// ---------------------------------------------------------------------------
type BoundAction = () => Promise<FormState | void>;

export function ActionButton({
  action,
  children,
  pendingLabel,
  variant = "outline",
  size = "sm",
  className,
  errors,
}: {
  action: BoundAction;
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "default" | "outline" | "dark" | "ghost" | "secondary";
  size?: "sm" | "default";
  className?: string;
  errors: Record<string, string>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await action();
            if (res && res.status === "error") setError(errors[res.error ?? "unknown"] ?? errors.unknown);
            else router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending && pendingLabel ? pendingLabel : children}
      </Button>
      {error ? (
        <span role="alert" className="text-xs font-medium text-coral-700">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** Two-step delete: the first click asks for confirmation inline. */
export function DeleteButton({
  action,
  labels,
  errors,
  note,
}: {
  action: BoundAction;
  labels: { delete: string; deleting: string; confirmDelete: string; confirm: string; cancel: string };
  errors: Record<string, string>;
  note?: string;
}) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  if (!asking) {
    return (
      <Button type="button" variant="ghost" size="sm" className="text-coral-700 hover:bg-coral-50" onClick={() => setAsking(true)}>
        <Trash2 aria-hidden /> {labels.delete}
      </Button>
    );
  }
  return (
    <div role="alertdialog" aria-label={labels.confirmDelete} className="flex flex-col gap-2 rounded-2xl border border-coral-200 bg-coral-50 p-3 text-sm text-coral-800">
      <p className="font-semibold">{labels.confirmDelete}</p>
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
              const res = await action();
              if (res && res.status === "error") setError(errors[res.error ?? "unknown"] ?? errors.unknown);
              else router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
          {pending ? labels.deleting : labels.confirm}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(false)} disabled={pending}>
          {labels.cancel}
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
