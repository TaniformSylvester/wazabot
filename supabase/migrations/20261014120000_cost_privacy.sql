-- =============================================================================
-- V2.1 — Cost prices are for owners and admins only, enforced by the database
-- =============================================================================
-- Before: the app hid cost prices from cashiers (agent) and staff (viewer), but
-- anyone signed in to the business could still read products.cost_price and
-- order_items.unit_cost through the database API with their own login.
--
-- Now:
--   * signed-in users can read every column of products / order_items EXCEPT
--     the cost columns (column-level SELECT grants);
--   * owners/admins read costs through product_costs() and order_item_costs(),
--     which check the role first;
--   * the report functions (owner/admin-only already) run as security definer
--     so they can still add up costs.
-- Writing a cost price is unchanged (owners/admins, through RLS and the
-- existing INSERT/UPDATE grants). Server code using the service role (AI
-- replies, crons) is not affected.
--
-- When a column is added to products or order_items later, grant SELECT on it
-- to authenticated too (unless it is private like the costs).
-- =============================================================================

revoke select on public.products from authenticated;
grant select (id, business_id, name, description, category, sku, price, currency, stock_quantity, image_url, active,
              created_at, updated_at, low_stock_threshold, stock_low, unit)
  on public.products to authenticated;

revoke select on public.order_items from authenticated;
grant select (id, business_id, order_id, product_id, product_name, variant, quantity, unit_price, total, variant_id)
  on public.order_items to authenticated;

-- Reports read order_items.unit_cost: run them with the owner's rights; they
-- already refuse anyone below admin and only read the given business.
alter function public.sales_by_day(uuid, date, date) security definer;
alter function public.product_sales(uuid, date, date) security definer;

/* Owners/admins: cost prices of a business's products (all, or the given ids). */
create function public.product_costs(p_business_id uuid, p_product_ids uuid[] default null)
returns table (product_id uuid, cost_price numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select p.id, p.cost_price from public.products p
  where p.business_id = p_business_id and (p_product_ids is null or p.id = any (p_product_ids));
end;
$$;
revoke execute on function public.product_costs(uuid, uuid[]) from public, anon;
grant execute on function public.product_costs(uuid, uuid[]) to authenticated;

/* Owners/admins: the cost recorded on each item of the given orders when they were sold. */
create function public.order_item_costs(p_business_id uuid, p_order_ids uuid[])
returns table (item_id uuid, order_id uuid, unit_cost numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select i.id, i.order_id, i.unit_cost from public.order_items i
  where i.business_id = p_business_id and i.order_id = any (p_order_ids);
end;
$$;
revoke execute on function public.order_item_costs(uuid, uuid[]) from public, anon;
grant execute on function public.order_item_costs(uuid, uuid[]) to authenticated;
