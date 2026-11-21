"use client";

import { ActionButton, ActionForm, SubmitButton, type FormText } from "@/components/app/form";
import { removeSchoolSeal, saveSchoolSeal } from "@/lib/actions/school";
import type { Messages } from "@/messages/en";

type T = Messages["dashboard"]["school"]["settings"]["seals"];

/**
 * School settings → Signature and stamp (owners and managers): upload or
 * remove the principal's signature and the school stamp printed on report
 * cards. Previews come from short-lived private links made on the server.
 */
export function SchoolSeals({ t, text, previews }: { t: T; text: FormText; previews: { signature: string | null; stamp: string | null } }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {(["signature", "stamp"] as const).map((kind) => {
        const url = previews[kind];
        return (
          <div key={kind} className="flex min-w-0 flex-col gap-3" data-testid={`seal-${kind}`}>
            <p className="font-semibold text-deep">{t[kind]}</p>
            <div className="grid h-28 place-items-center rounded-2xl border border-dashed border-line-strong bg-white p-2">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed link
                <img src={url} alt={t[kind]} className="max-h-24 max-w-full object-contain" data-testid={`seal-${kind}-preview`} />
              ) : (
                <span className="text-sm text-slate">{t.none}</span>
              )}
            </div>
            <ActionForm action={saveSchoolSeal.bind(null, kind)} text={text} successMessage={t.saved}>
              <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-deep">
                {url ? t.replace : t.upload}
                <input
                  type="file"
                  name="image"
                  required
                  accept="image/jpeg,image/png,image/webp"
                  className="max-w-full text-sm font-normal text-slate file:mr-3 file:rounded-full file:border-0 file:bg-mint file:px-4 file:py-2 file:text-sm file:font-semibold file:text-deep"
                />
                <span className="text-xs font-normal text-slate">{kind === "signature" ? t.signatureHint : t.stampHint}</span>
              </label>
              <div className="flex flex-wrap gap-2">
                <SubmitButton>{t.save}</SubmitButton>
              </div>
            </ActionForm>
            {url ? (
              <ActionButton action={removeSchoolSeal.bind(null, kind)} errors={text.errors} confirm={t.removeConfirm} variant="ghost">
                {t.remove}
              </ActionButton>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
