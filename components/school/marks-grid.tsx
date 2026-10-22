"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/actions/form";
import { subjectAverage, type AssessmentInput, type GradingSettings, type MarkInput } from "@/lib/school/grading";

type Cell = string; // "" | number as text | "abs"
type Row = { studentId: string; number: string; name: string; marks: Record<string, Cell>; comment: string };

/**
 * Marks of one subject for one term: a row per student, a column per
 * assessment (with its maximum), an absence tick, the teacher's comment, and
 * the subject average as it will be computed. Saved in one go; the database
 * checks the teacher, the ranges and that results aren't published.
 */
export function MarksGrid({
  assessments,
  students,
  settings,
  readOnly,
  save,
  t,
  errors,
}: {
  assessments: AssessmentInput[];
  students: Row[];
  settings: Pick<GradingSettings, "scaleMax" | "missingMarks" | "decimals">;
  readOnly: boolean;
  save: (input: { rows: { studentId: string; marks: Record<string, number | "abs" | null>; comment: string }[] }) => Promise<FormState>;
  t: { student: string; absent: string; comment: string; average: string; save: string; saved: string; saving: string; outOf: string; invalid: string };
  errors: Record<string, string>;
}) {
  const [rows, setRows] = useState<Row[]>(students);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<FormState | null>(null);
  const router = useRouter();

  const parse = (v: Cell, max: number): number | "abs" | null | "bad" => {
    if (v === "abs") return "abs";
    const s = v.trim().replace(",", ".");
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 && n <= max ? n : "bad";
  };
  const bad = useMemo(() => new Set(rows.flatMap((r) => assessments.filter((a) => parse(r.marks[a.id] ?? "", a.maxMark) === "bad").map((a) => `${r.studentId}|${a.id}`))), [rows, assessments]);

  const average = (r: Row) => {
    const map = new Map<string, MarkInput>();
    for (const a of assessments) {
      const p = parse(r.marks[a.id] ?? "", a.maxMark);
      if (p === "bad" || p === null) continue;
      map.set(a.id, { assessmentId: a.id, subjectId: "", studentId: r.studentId, mark: p === "abs" ? null : p, absent: p === "abs" });
    }
    return subjectAverage(map, assessments, settings);
  };
  const set = (studentId: string, key: string, value: string) =>
    setRows((rs) => rs.map((r) => (r.studentId !== studentId ? r : key === "comment" ? { ...r, comment: value } : { ...r, marks: { ...r.marks, [key]: value } })));

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[36rem] border-collapse text-sm" data-testid="marks-grid">
          <thead className="bg-surface text-left text-xs font-semibold uppercase tracking-wide text-slate">
            <tr>
              <th className="px-3 py-2">{t.student}</th>
              {assessments.map((a) => (
                <th key={a.id} className="px-2 py-2 text-center">
                  {a.name}
                  <span className="block font-normal normal-case">{t.outOf.replace("{max}", String(a.maxMark))}</span>
                </th>
              ))}
              <th className="px-2 py-2 text-right">{t.average}</th>
              <th className="px-3 py-2">{t.comment}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const avg = average(r);
              return (
                <tr key={r.studentId} className="border-t border-border">
                  <td className="px-3 py-1.5">
                    <span className="font-semibold text-deep">{r.name}</span>
                    <span className="block font-mono text-xs text-slate">{r.number}</span>
                  </td>
                  {assessments.map((a) => {
                    const v = r.marks[a.id] ?? "";
                    const isAbs = v === "abs";
                    const wrong = bad.has(`${r.studentId}|${a.id}`);
                    return (
                      <td key={a.id} className="px-2 py-1.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <input
                            aria-label={`${r.name} — ${a.name}`}
                            inputMode="decimal"
                            disabled={readOnly || isAbs}
                            value={isAbs ? "" : v}
                            onChange={(e) => set(r.studentId, a.id, e.target.value)}
                            className={`h-9 w-16 rounded-lg border bg-card px-2 text-right ${wrong ? "border-coral-500 ring-2 ring-coral-200" : "border-input"}`}
                          />
                          <label className="flex items-center gap-1 text-xs text-slate">
                            <input type="checkbox" disabled={readOnly} checked={isAbs} onChange={(e) => set(r.studentId, a.id, e.target.checked ? "abs" : "")} aria-label={`${r.name} — ${a.name} — ${t.absent}`} />
                            {t.absent}
                          </label>
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap" data-testid="row-average">
                    {avg === null ? "—" : avg.toFixed(settings.decimals)}
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      aria-label={`${r.name} — ${t.comment}`}
                      disabled={readOnly}
                      maxLength={300}
                      value={r.comment}
                      onChange={(e) => set(r.studentId, "comment", e.target.value)}
                      className="h-9 w-full min-w-[10rem] rounded-lg border border-input bg-card px-2"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {bad.size ? <FormAlert tone="error">{t.invalid}</FormAlert> : null}
      {result?.status === "success" ? <FormAlert tone="success">{t.saved}</FormAlert> : null}
      {result?.status === "error" ? <FormAlert tone="error">{(errors[result.error ?? "unknown"] ?? errors.unknown).replace("{item}", result.detail ?? "")}</FormAlert> : null}
      {!readOnly ? (
        <div>
          <Button
            type="button"
            disabled={pending || bad.size > 0}
            data-testid="save-marks"
            onClick={() =>
              start(async () => {
                setResult(null);
                const payload = rows.map((r) => ({
                  studentId: r.studentId,
                  comment: r.comment,
                  marks: Object.fromEntries(assessments.map((a) => [a.id, parse(r.marks[a.id] ?? "", a.maxMark) as number | "abs" | null])),
                }));
                const res = await save({ rows: payload });
                setResult(res);
                if (res.status === "success") router.refresh();
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {pending ? t.saving : t.save}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
