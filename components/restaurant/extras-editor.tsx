"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import { useFieldError } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { EXTRA_NAME_MAX, MAX_EXTRAS, type Extra } from "@/lib/restaurant/extras";
import type { Messages } from "@/messages/en";

const input = "h-10 w-full min-w-0 rounded-xl border border-input bg-card px-3 text-sm text-deep outline-none focus-visible:border-waza-500 focus-visible:ring-4 focus-visible:ring-waza-500/15";
const uid = () => Math.random().toString(36).slice(2);

/** A dish's priced extras, submitted as the JSON field "extras" (validated by productSchema). */
export function ExtrasEditor({ t, initial }: { t: Messages["dashboard"]["restaurant"]["extras"]; initial: Extra[] }) {
  const [rows, setRows] = useState(() => initial.map((e) => ({ uid: uid(), name: e.name, price: String(e.price) })));
  const error = useFieldError("extras");
  const value = rows
    .filter((r) => r.name.trim())
    .map((r) => ({ name: r.name.trim(), price: Number(r.price.replace(/\s/g, "").replace(",", ".")) || 0 }));
  return (
    <div className="flex flex-col gap-3" data-testid="extras-editor">
      <input type="hidden" name="extras" value={JSON.stringify(value)} />
      {rows.length ? (
        <ul className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li key={r.uid} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-center gap-2">
              <input
                aria-label={`${t.name} ${i + 1}`}
                className={input}
                value={r.name}
                maxLength={EXTRA_NAME_MAX}
                placeholder={t.namePlaceholder}
                onChange={(e) => setRows(rows.map((x) => (x.uid === r.uid ? { ...x, name: e.target.value } : x)))}
              />
              <input
                aria-label={`${t.price} ${i + 1}`}
                className={input}
                value={r.price}
                inputMode="decimal"
                placeholder="0"
                onChange={(e) => setRows(rows.map((x) => (x.uid === r.uid ? { ...x, price: e.target.value } : x)))}
              />
              <Button type="button" variant="ghost" size="icon" aria-label={t.remove} onClick={() => setRows(rows.filter((x) => x.uid !== r.uid))}>
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate">{t.none}</p>
      )}
      {error ? <p className="text-sm text-coral-700">{error}</p> : null}
      {rows.length < MAX_EXTRAS ? (
        <div>
          <Button type="button" variant="outline" onClick={() => setRows([...rows, { uid: uid(), name: "", price: "" }])}>
            <Plus aria-hidden /> {t.add}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
