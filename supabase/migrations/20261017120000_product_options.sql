-- =============================================================================
-- WazaBolt — product options (colour, size …) and their combinations
-- =============================================================================
-- A product can define up to 3 options, e.g.
--   [{"name": "Colour", "colour": true,
--     "values": [{"value": "Red", "hex": "#D62828", "image_url": "https://…"}, …]},
--    {"name": "Size", "values": [{"value": "S"}, {"value": "M"}, …]}]
-- Every combination is a row in product_variants with its own stock and price
-- difference, and options = {"Colour": "Red", "Size": "M"}. Its name/value are
-- kept filled ("Colour / Size", "Red / M") so everything that reads variants
-- keeps working.
--
-- Existing variants (options null) are unchanged: one option per row, as before.
-- create_order(), create_sale(), apply_order_stock() and adjust_stock() need no
-- change: a combination is a variant. Order lines get a readable label
-- ("Colour: Red · Size: M") from a trigger, kept as a snapshot; the same
-- trigger refuses a line without a combination for such a product.
-- =============================================================================

alter table public.products
  add column options jsonb not null default '[]'::jsonb
    constraint products_options_shape check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 3);

-- products SELECT is granted per column (cost privacy): grant the new column.
grant select (options) on public.products to authenticated;

alter table public.product_variants
  add column options jsonb
    constraint product_variants_options_shape check (options is null or (jsonb_typeof(options) = 'object' and options <> '{}'::jsonb));

-- One row per combination.
create unique index product_variants_options_key on public.product_variants (business_id, product_id, options) where options is not null;

-- ---------------------------------------------------------------------------
-- Order lines: "Colour: Red · Size: M" in the product's option order; a
-- product sold by combinations can't be ordered without one.
-- ---------------------------------------------------------------------------
create or replace function public.order_items_variant_label()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text;
begin
  -- A product sold by combinations needs one: "T-shirt" alone doesn't say which colour and size left the shelf.
  if new.variant_id is null and new.product_id is not null and exists (
    select 1 from public.product_variants v
    where v.product_id = new.product_id and v.business_id = new.business_id and v.options is not null
  ) then
    raise exception 'choose options for %', (select name from public.products where id = new.product_id) using errcode = '22023';
  end if;
  if new.variant_id is not null then
    select string_agg((o.opt ->> 'name') || ': ' || (v.options ->> (o.opt ->> 'name')), ' · ' order by o.ord)
      into v_label
    from public.product_variants v
    join public.products p on p.id = v.product_id and p.business_id = v.business_id
    cross join lateral jsonb_array_elements(p.options) with ordinality as o(opt, ord)
    where v.id = new.variant_id
      and v.business_id = new.business_id
      and v.options is not null
      and v.options ? (o.opt ->> 'name');
    if v_label is not null then
      new.variant := v_label;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.order_items_variant_label() from public, anon, authenticated;

create trigger order_items_variant_label before insert on public.order_items
  for each row execute function public.order_items_variant_label();
