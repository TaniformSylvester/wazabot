/*
 * Staff stock counts. Agents (staff who take orders) may record a stock count
 * — the counted quantity, reason "adjustment" — for their own branch (or any
 * branch if they are not tied to one). Stock in, damaged, lost, returns and
 * opening stock stay with owners and managers, as do prices, names and
 * deleting products (the products table's policies are unchanged).
 *
 * Non-destructive: replaces the function with the same signature and body;
 * only the permission check changes. Grants are restated.
 */
create or replace function public.adjust_stock(
  p_business_id uuid, p_product_id uuid, p_reason text, p_quantity integer default null, p_new_stock integer default null,
  p_variant_id uuid default null, p_note text default null, p_branch_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch uuid := p_branch_id;
  v_total integer;
  v_current integer;
  v_change integer;
  v_new integer;
  v_member_branch uuid;
begin
  -- Owners and managers: every reason. Staff who can act (agents): a stock
  -- count only (the counted quantity), in their own branch if tied to one.
  if not public.has_min_role(p_business_id, 'admin') then
    if not (public.has_min_role(p_business_id, 'agent') and p_reason = 'adjustment' and p_new_stock is not null and p_quantity is null) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    v_member_branch := public.current_member_branch(p_business_id);
    if v_member_branch is not null then
      if v_branch is not null and v_branch <> v_member_branch then
        raise exception 'not allowed' using errcode = '42501';
      end if;
      v_branch := v_member_branch;
    end if;
  end if;
  if p_reason not in ('opening', 'purchase', 'return', 'damaged', 'lost', 'adjustment') then
    raise exception 'unknown reason' using errcode = '22023';
  end if;
  if (p_quantity is null) = (p_new_stock is null) or (p_new_stock is not null and (p_reason <> 'adjustment' or p_new_stock < 0)) then
    raise exception 'give a quantity, or the counted stock for an adjustment' using errcode = '22023';
  end if;
  if p_quantity is not null and (p_quantity = 0 or abs(p_quantity) > 1000000 or (p_reason <> 'adjustment' and p_quantity < 0)) then
    raise exception 'invalid quantity' using errcode = '22023';
  end if;
  if v_branch is null then
    select id into v_branch from public.branches where business_id = p_business_id and is_main;
  elsif not exists (select 1 from public.branches where id = v_branch and business_id = p_business_id) then
    raise exception 'unknown branch' using errcode = '22023';
  end if;

  if p_variant_id is not null then
    select stock_quantity into v_total from public.product_variants
    where id = p_variant_id and product_id = p_product_id and business_id = p_business_id for update;
  else
    select stock_quantity into v_total from public.products
    where id = p_product_id and business_id = p_business_id for update;
  end if;
  if not found then
    raise exception 'unknown product' using errcode = '22023';
  end if;
  v_current := case when v_total is null then 0 else coalesce((
    select quantity from public.branch_stock
    where branch_id = v_branch and product_id = p_product_id and variant_id is not distinct from p_variant_id
  ), 0) end;
  v_change := case
    when p_new_stock is not null then p_new_stock - v_current
    when p_reason in ('damaged', 'lost') then -p_quantity
    else p_quantity
  end;
  v_new := v_current + v_change;
  if v_new < 0 then
    raise exception 'insufficient stock: only % left', v_current using errcode = 'WB409';
  end if;
  if v_change = 0 then
    return v_new;
  end if;

  perform set_config('wazabolt.stock_reason', p_reason, true);
  perform set_config('wazabolt.stock_order', '', true);
  perform set_config('wazabolt.stock_note', coalesce(left(btrim(p_note), 300), ''), true);
  perform set_config('wazabolt.stock_branch', v_branch::text, true);
  if p_variant_id is not null then
    update public.product_variants set stock_quantity = coalesce(v_total, 0) + v_change where id = p_variant_id;
  else
    update public.products set stock_quantity = coalesce(v_total, 0) + v_change where id = p_product_id;
  end if;
  perform set_config('wazabolt.stock_reason', '', true);
  perform set_config('wazabolt.stock_note', '', true);
  perform set_config('wazabolt.stock_branch', '', true);
  return v_new;
end;
$$;
revoke execute on function public.adjust_stock(uuid, uuid, text, integer, integer, uuid, text, uuid) from public, anon;
grant execute on function public.adjust_stock(uuid, uuid, text, integer, integer, uuid, text, uuid) to authenticated;
