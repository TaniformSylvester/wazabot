import { ActionForm, CheckboxField, SelectField, SubmitButton, TextArea, TextField, type FormText } from "@/components/app/form";
import { Panel } from "@/components/app/ui";
import { OptionsEditor } from "@/components/app/options-editor";
import { ExtrasEditor } from "@/components/restaurant/extras-editor";
import type { VariantRow } from "@/components/app/variants-editor";
import { saveProduct } from "@/lib/actions/products";
import { currencyLabel, format } from "@/lib/i18n/format";
import { parseCombination, parseOptions } from "@/lib/products/options";
import { parseExtras } from "@/lib/restaurant/extras";
import { PRODUCT_UNITS, type Tables } from "@/types/database";
import type { Messages } from "@/messages/en";

type Product = Omit<Tables<"products">, "options" | "extras"> & { options: unknown; extras?: unknown; product_variants: { id: string; name: string; value: string; options: unknown; stock_quantity: number | null; price_modifier: number }[] };

/** Create/edit product form (server component shell around client fields). */
export function ProductForm({
  t,
  text,
  product,
  currency,
  locale,
  canEdit,
  submitLabel,
  extras,
}: {
  t: Messages["dashboard"]["products"];
  /** Restaurant module: the dish's priced extras. */
  extras?: Messages["dashboard"]["restaurant"]["extras"];
  text: FormText;
  product: Product | null;
  currency: string;
  locale: string;
  canEdit: boolean;
  submitLabel: string;
}) {
  const f = t.fields;
  const options = parseOptions(product?.options);
  const all = product?.product_variants ?? [];
  const legacy: VariantRow[] = all
    .filter((v) => !options.length || parseCombination(v.options) === null)
    .map((v) => ({
      id: v.id,
      name: v.name,
      value: v.value,
      stock_quantity: v.stock_quantity === null ? "" : String(v.stock_quantity),
      price_modifier: String(Number(v.price_modifier)),
    }));
  const combos = options.length
    ? all.flatMap((v) => {
        const c = parseCombination(v.options);
        return c ? [{ options: c, stock_quantity: v.stock_quantity, price_modifier: Number(v.price_modifier) }] : [];
      })
    : [];
  return (
    <ActionForm action={saveProduct} text={text} disabled={!canEdit} successMessage={t.saved} hidden={{ id: product?.id, locale }}>
      <Panel className="grid gap-5 sm:grid-cols-2">
        <TextField name="name" label={f.name} defaultValue={product?.name ?? ""} required maxLength={160} className="sm:col-span-2" />
        <TextField name="price" label={format(f.price, { currency: currencyLabel(currency) })} defaultValue={product ? String(Number(product.price)) : ""} inputMode="decimal" required />
        {canEdit ? (
          <TextField
          name="cost_price"
          label={format(f.costPrice, { currency: currencyLabel(currency) })}
          hint={f.costHint}
          defaultValue={product?.cost_price === null || product?.cost_price === undefined ? "" : String(Number(product.cost_price))}
          inputMode="decimal"
          />
        ) : null}
        <SelectField name="unit" label={f.unit} defaultValue={product?.unit ?? "piece"} options={PRODUCT_UNITS.map((u) => ({ value: u, label: t.units[u] }))} />
        {/* Opening stock on creation only; afterwards stock changes through sales and Adjust stock (recorded with a reason). */}
        {product ? null : <TextField name="stock_quantity" label={f.stock} hint={f.stockHint} defaultValue="" inputMode="numeric" />}
        <TextField name="low_stock_threshold" label={f.lowStock} hint={f.lowStockHint} defaultValue={product?.low_stock_threshold ?? 5} inputMode="numeric" />
        <TextField name="category" label={f.category} defaultValue={product?.category ?? ""} maxLength={80} />
        <TextField name="sku" label={f.sku} defaultValue={product?.sku ?? ""} maxLength={64} />
        <TextArea name="description" label={f.description} defaultValue={product?.description ?? ""} maxLength={4000} className="sm:col-span-2" />
        <CheckboxField name="active" label={f.active} defaultChecked={product?.active ?? true} className="sm:col-span-2" />
      </Panel>

      <Panel title={t.options.title} description={t.options.text}>
        {/* Remounts after each save so photos uploaded just now show (and are kept on the next save). */}
        <OptionsEditor key={product?.updated_at ?? "new"} t={t.options} tv={t.variants} initialOptions={options} initialCombinations={combos} legacy={legacy} />
      </Panel>

      {extras ? (
        <Panel title={extras.title} description={extras.text}>
          <ExtrasEditor key={product?.updated_at ?? "new"} t={extras} initial={parseExtras(product?.extras)} />
        </Panel>
      ) : null}

      <Panel title={f.image}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {product?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded image from Supabase Storage
            <img src={product.image_url} alt={f.currentImage} className="size-28 shrink-0 rounded-2xl border border-border object-cover" />
          ) : null}
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-deep">
            <span className="sr-only">{f.image}</span>
            <input
              type="file"
              name="image"
              accept="image/jpeg,image/png,image/webp"
              className="max-w-full text-sm font-normal text-slate file:mr-3 file:rounded-full file:border-0 file:bg-mint file:px-4 file:py-2 file:text-sm file:font-semibold file:text-deep"
            />
            <span className="text-xs font-normal text-slate">{f.imageHint}</span>
          </label>
        </div>
      </Panel>

      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
