/**
 * Sales vs expenses, per day or per week (server-rendered, no JavaScript):
 * two columns per period on one shared scale, a legend, and the estimated
 * profit (sales − expenses) for the whole period. A visually hidden table
 * gives screen readers the same figures.
 */
export function SalesExpensesChart({
  data,
  labels,
  format,
  showLabel,
  testId,
}: {
  data: { key: string; label: string; sales: number; expenses: number }[];
  labels: { caption: string; period: string; sales: string; expenses: string; net: string };
  format: (v: number) => string;
  /** Which periods get a visible label under the axis. */
  showLabel: (index: number) => boolean;
  testId?: string;
}) {
  const max = Math.max(...data.flatMap((d) => [d.sales, d.expenses]), 0);
  const h = (v: number) => (v > 0 && max > 0 ? `${Math.max(3, (v / max) * 100)}%` : "2px");
  const totalSales = data.reduce((a, d) => a + d.sales, 0);
  const totalExpenses = data.reduce((a, d) => a + d.expenses, 0);
  return (
    <figure data-testid={testId}>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-waza-500" aria-hidden /> {labels.sales} · <span className="font-semibold text-deep">{format(totalSales)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-coral-500" aria-hidden /> {labels.expenses} · <span className="font-semibold text-deep">{format(totalExpenses)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5" data-testid={testId ? `${testId}-net` : undefined}>
          {labels.net} · <span className={totalSales - totalExpenses < 0 ? "font-semibold text-coral-700" : "font-semibold text-deep"}>{format(totalSales - totalExpenses)}</span>
        </span>
      </div>
      <div className="flex h-40 items-end gap-[3px]" aria-hidden>
        {data.map((d) => (
          <div key={d.key} className="flex h-full min-w-0 flex-1 items-end gap-px" title={`${d.label}: ${labels.sales} ${format(d.sales)} · ${labels.expenses} ${format(d.expenses)}`}>
            <div className={d.sales > 0 ? "w-1/2 rounded-t-[2px] bg-waza-500" : "w-1/2 rounded-t-[2px] bg-border"} style={{ height: h(d.sales) }} />
            <div className={d.expenses > 0 ? "w-1/2 rounded-t-[2px] bg-coral-500" : "w-1/2 rounded-t-[2px] bg-border"} style={{ height: h(d.expenses) }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[3px] text-[0.625rem] text-slate" aria-hidden>
        {data.map((d, i) => (
          <span key={d.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">
            {showLabel(i) ? d.label : ""}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">{labels.caption}</figcaption>
      <table className="sr-only">
        <thead>
          <tr>
            <th>{labels.period}</th>
            <th>{labels.sales}</th>
            <th>{labels.expenses}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <td>{d.label}</td>
              <td>{format(d.sales)}</td>
              <td>{format(d.expenses)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
