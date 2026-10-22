/** A labelled select for GET filter forms (class, term, year) — outside the ActionForm fields. */
export function FilterSelect({
  name,
  label,
  defaultValue,
  options,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-deep">
      {label}
      <select name={name} defaultValue={defaultValue} className="h-11 min-w-40 rounded-xl border border-input bg-card px-3 text-sm font-normal">
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
