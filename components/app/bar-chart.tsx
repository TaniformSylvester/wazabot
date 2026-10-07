/**
 * A small column chart (server-rendered, no JavaScript). Each bar carries a
 * tooltip; a visually hidden table gives screen readers the same figures.
 */
export function BarChart({
  data,
  caption,
  columns,
  format,
  label,
  testId,
}: {
  data: { key: string; label: string; value: number; detail?: string }[];
  caption: string;
  /** Header cells of the hidden table: [label, value]. */
  columns: [string, string];
  format: (v: number) => string;
  /** Which bars get a visible label under the axis (e.g. every 7th day). */
  label?: (index: number) => boolean;
  testId?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 0);
  return (
    <figure data-testid={testId}>
      <div className="flex h-40 items-end gap-[3px]" aria-hidden>
        {data.map((d) => (
          <div key={d.key} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${d.label}: ${format(d.value)}${d.detail ? ` · ${d.detail}` : ""}`}>
            <div
              className={d.value > 0 ? "w-full rounded-t-[3px] bg-waza-500 group-hover:bg-waza-700" : "w-full rounded-t-[3px] bg-border"}
              style={{ height: d.value > 0 && max > 0 ? `${Math.max(3, (d.value / max) * 100)}%` : "2px" }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[3px] text-[0.625rem] text-slate" aria-hidden>
        {data.map((d, i) => (
          <span key={d.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">
            {label?.(i) ? d.label : ""}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
      <table className="sr-only">
        <thead>
          <tr>
            <th>{columns[0]}</th>
            <th>{columns[1]}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <td>{d.label}</td>
              <td>{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
