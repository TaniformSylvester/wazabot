-- WazaBolt V2 — POS, inventory, customer credit, expenses, reports
--
--   products        cost_price (for profit), unit; low_stock_threshold is the minimum stock.
--                   A product that has sales can't be deleted (archive it: active = false).
--   stock ledger    stock_movements: every change of a product's or variant's stock is
--                   recorded by trigger (previous, change, new, reason, order, user). The
--                   functions below say why (sale, return, purchase, damaged…); a change
--                   with no stated reason is recorded as a manual adjustment.
--   sales           a sale is an order: POS sales are created "delivered" by create_sale()
--                   in one transaction (items, stock, payments), idempotent per client key.
--                   order_items.unit_cost keeps the cost at the time of sale (COGS).
--   payments        order_payments is the ledger; orders.amount_paid and payment_status
--                   follow it. Customer credit = what delivered orders still owe;
--                   record_customer_payment() pays the oldest first.
--   expenses        per business, owners/admins only.
--   reports         sales_by_day(), product_sales() (owners/admins: they include costs).

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
alter table public.products
  -- null = cost not entered (profit for those items is reported as unknown)
  add column cost_price numeric(14, 2) check (cost_price >= 0),
  add column unit text not null default 'piece' check (char_length(btrim(unit)) between 1 and 20);

-- ---------------------------------------------------------------------------
-- Stock ledger
-- ---------------------------------------------------------------------------
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  product_id uuid not null,
  variant_id uuid,
  reason text not null check (reason in ('opening', 'purchase', 'sale', 'return', 'damaged', 'lost', 'adjustment')),
  quantity_change integer not null check (quantity_change <> 0),
  previous_stock integer not null,
  new_stock integer not null,
  order_id uuid,
  note text check (char_length(note) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (business_id, product_id) references public.products (business_id, id) on delete cascade,
  foreign key (business_id, variant_id) references public.product_variants (business_id, id) on delete set null (variant_id),
  foreign key (business_id, order_id) references public.orders (business_id, id) on delete set null (order_id),
  check (new_stock = previous_stock + quantity_change)
);
create index stock_movements_product_idx on public.stock_movements (business_id, product_id, created_at desc);
create index stock_movements_business_idx on public.stock_movements (business_id, created_at desc);

alter table public.stock_movements enable row level security;
create policy "stock_movements: members read" on public.stock_movements
  for select to authenticated using (public.is_business_member(business_id));
revoke all on public.stock_movements from anon, authenticated;
grant select on public.stock_movements to authenticated;
grant all on public.stock_movements to service_role;

/*
 * Records every stock change of a product or variant. The reason, order and
 * note come from transaction settings set by the functions below
 * (wazabolt.stock_reason / stock_order / stock_note); without them an insert
 * is opening stock and an update a manual adjustment.
 */
create function public.log_stock_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(current_setting('wazabolt.stock_reason', true), '');
  v_order uuid := nullif(current_setting('wazabolt.stock_order', true), '')::uuid;
  v_note text := nullif(current_setting('wazabolt.stock_note', true), '');
  v_old integer;
  v_new integer;
begin
  if tg_op = 'INSERT' then
    v_old := 0;
    v_new := coalesce(new.stock_quantity, 0);
    v_reason := coalesce(v_reason, 'opening');
  else
    if old.stock_quantity is not distinct from new.stock_quantity then
      return new;
    end if;
    v_old := coalesce(old.stock_quantity, 0);
    v_new := coalesce(new.stock_quantity, 0);
    v_reason := coalesce(v_reason, 'adjustment');
    if new.stock_quantity is null then
      v_note := coalesce(v_note, 'stock tracking turned off');
    end if;
  end if;
  if v_new = v_old then
    return new;
  end if;
  -- Separate branches: a products row has no product_id field.
  if tg_table_name = 'products' then
    insert into public.stock_movements (business_id, product_id, variant_id, reason, quantity_change, previous_stock, new_stock, order_id, note, created_by)
    values (new.business_id, new.id, null, v_reason, v_new - v_old, v_old, v_new, v_order, v_note, (select auth.uid()));
  else
    insert into public.stock_movements (business_id, product_id, variant_id, reason, quantity_change, previous_stock, new_stock, order_id, note, created_by)
    values (new.business_id, new.product_id, new.id, v_reason, v_new - v_old, v_old, v_new, v_order, v_note, (select auth.uid()));
  end if;
  return new;
end;
$$;
revoke execute on function public.log_stock_change() from public, anon, authenticated;

create trigger products_log_stock after insert or update of stock_quantity on public.products
  for each row execute function public.log_stock_change();
create trigger product_variants_log_stock after insert or update of stock_quantity on public.product_variants
  for each row execute function public.log_stock_change();

-- Existing stock becomes opening stock, so the ledger adds up from the start.
insert into public.stock_movements (business_id, product_id, reason, quantity_change, previous_stock, new_stock, note, created_at)
select business_id, id, 'opening', stock_quantity, 0, stock_quantity, 'stock before the stock history', created_at
from public.products where coalesce(stock_quantity, 0) > 0;
insert into public.stock_movements (business_id, product_id, variant_id, reason, quantity_change, previous_stock, new_stock, note, created_at)
select business_id, product_id, id, 'opening', stock_quantity, 0, stock_quantity, 'stock before the stock history', created_at
from public.product_variants where coalesce(stock_quantity, 0) > 0;

/*
 * Owners/admins: change a product's (or variant's) stock with a reason.
 *   purchase / return / opening   p_quantity added
 *   damaged / lost                p_quantity removed
 *   adjustment                    p_quantity added or removed (signed), or p_new_stock = the counted stock
 * Stock never goes below zero (SQLSTATE WB409). Untracked stock starts being tracked from 0.
 */
create function public.adjust_stock(
  p_business_id uuid,
  p_product_id uuid,
  p_reason text,
  p_quantity integer default null,
  p_new_stock integer default null,
  p_variant_id uuid default null,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current integer;
  v_change integer;
  v_new integer;
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
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

  if p_variant_id is not null then
    select stock_quantity into v_current from public.product_variants
    where id = p_variant_id and product_id = p_product_id and business_id = p_business_id for update;
  else
    select stock_quantity into v_current from public.products
    where id = p_product_id and business_id = p_business_id for update;
  end if;
  if not found then
    raise exception 'unknown product' using errcode = '22023';
  end if;
  v_current := coalesce(v_current, 0);
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
  if p_variant_id is not null then
    update public.product_variants set stock_quantity = v_new where id = p_variant_id;
  else
    update public.products set stock_quantity = v_new where id = p_product_id;
  end if;
  perform set_config('wazabolt.stock_reason', '', true);
  perform set_config('wazabolt.stock_note', '', true);
  return v_new;
end;
$$;
revoke execute on function public.adjust_stock(uuid, uuid, text, integer, integer, uuid, text) from public, anon;
grant execute on function public.adjust_stock(uuid, uuid, text, integer, integer, uuid, text) to authenticated;

-- Orders take stock as "sale" and give it back as "return" (same logic as Stage 4).
create or replace function public.apply_order_stock(p_order_id uuid, p_direction int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_tracked boolean;
  v_done int;
begin
  perform set_config('wazabolt.stock_reason', case when p_direction > 0 then 'sale' else 'return' end, true);
  perform set_config('wazabolt.stock_order', p_order_id::text, true);
  perform set_config('wazabolt.stock_note', '', true);
  for r in
    select i.product_id, i.variant_id, sum(i.quantity)::int as qty, min(i.product_name) as name, min(i.variant) as variant
    from public.order_items i
    where i.order_id = p_order_id and i.product_id is not null
      and not (i.variant_id is null and i.variant is not null)
    group by i.product_id, i.variant_id
    order by i.product_id, i.variant_id nulls first
  loop
    v_tracked := false;
    if r.variant_id is not null then
      select stock_quantity is not null into v_tracked from public.product_variants where id = r.variant_id for update;
      if coalesce(v_tracked, false) then
        update public.product_variants
        set stock_quantity = stock_quantity - p_direction * r.qty
        where id = r.variant_id and stock_quantity - p_direction * r.qty >= 0;
        get diagnostics v_done = row_count;
        if v_done = 0 and p_direction > 0 then
          raise exception 'insufficient stock: %', r.name || coalesce(' (' || r.variant || ')', '') using errcode = 'WB409';
        end if;
        continue;
      end if;
    end if;

    update public.products
    set stock_quantity = stock_quantity - p_direction * r.qty
    where id = r.product_id and stock_quantity is not null and stock_quantity - p_direction * r.qty >= 0;
    get diagnostics v_done = row_count;
    if v_done = 0 and p_direction > 0 and exists (select 1 from public.products where id = r.product_id and stock_quantity is not null) then
      raise exception 'insufficient stock: %', r.name || coalesce(' (' || r.variant || ')', '') using errcode = 'WB409';
    end if;
  end loop;
  perform set_config('wazabolt.stock_reason', '', true);
  perform set_config('wazabolt.stock_order', '', true);
end;
$$;

-- A product with sales history keeps it: archive instead of deleting (SQLSTATE WB410).
create function public.products_keep_sold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Deleting the whole business removes everything (the business row is already gone).
  if exists (select 1 from public.businesses where id = old.business_id)
     and exists (select 1 from public.order_items where product_id = old.id) then
    raise exception 'this product has sales: archive it instead' using errcode = 'WB410';
  end if;
  return old;
end;
$$;
create trigger products_keep_sold before delete on public.products
  for each row execute function public.products_keep_sold();

-- ---------------------------------------------------------------------------
-- Orders become the sales ledger
-- ---------------------------------------------------------------------------
alter table public.orders
  -- Walk-in POS sales need no customer (a sale on credit does).
  alter column customer_id drop not null,
  add column channel text not null default 'manual' check (channel in ('manual', 'pos', 'whatsapp')),
  add column amount_paid numeric(14, 2) not null default 0 check (amount_paid >= 0),
  -- Sent by the POS screen with each sale: the same key twice is the same sale.
  add column client_key uuid,
  add constraint orders_paid_within_total check (amount_paid <= total),
  add constraint orders_client_key_key unique (business_id, client_key);
update public.orders set channel = 'whatsapp' where conversation_id is not null;

alter table public.orders drop constraint orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check check (payment_status in ('unpaid', 'partial', 'paid', 'pending', 'refunded', 'failed'));
alter table public.orders drop constraint orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('cash', 'mobile_money', 'orange_money', 'mtn_momo', 'bank_transfer', 'card', 'credit', 'other'));

alter table public.order_items add column unit_cost numeric(14, 2) check (unit_cost >= 0);
update public.order_items i set unit_cost = p.cost_price from public.products p where p.id = i.product_id and i.unit_cost is null and p.cost_price is not null;

-- Payment status follows what was actually paid.
create function public.orders_payment_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.payment_status := case
    when new.amount_paid > 0 and new.amount_paid >= new.total then 'paid'
    when new.amount_paid > 0 then 'partial'
    when new.total = 0 and new.subtotal > 0 then 'paid'
    else 'unpaid'
  end;
  return new;
end;
$$;
create trigger orders_payment_status before insert or update of amount_paid, total, payment_status on public.orders
  for each row execute function public.orders_payment_status();

-- Payment status is no longer picked by hand: payments are recorded.
revoke update (payment_status) on public.orders from authenticated;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  order_id uuid not null,
  customer_id uuid,
  amount numeric(14, 2) not null check (amount > 0),
  method text not null check (method in ('cash', 'mtn_momo', 'orange_money', 'mobile_money', 'bank_transfer', 'card', 'other')),
  reference text check (char_length(reference) <= 100),
  -- One payment by a customer can settle several sales: its rows share a group id.
  group_id uuid not null default gen_random_uuid(),
  -- 'manual' today; a payment provider (MTN MoMo, Orange Money API…) can record its own later.
  provider text not null default 'manual' check (char_length(provider) <= 40),
  received_at timestamptz not null default now(),
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (business_id, order_id) references public.orders (business_id, id) on delete cascade,
  foreign key (business_id, customer_id) references public.customers (business_id, id) on delete set null (customer_id),
  unique (business_id, group_id, order_id)
);
create index order_payments_order_idx on public.order_payments (business_id, order_id);
create index order_payments_received_idx on public.order_payments (business_id, received_at desc);
create index order_payments_customer_idx on public.order_payments (business_id, customer_id, received_at desc);

alter table public.order_payments enable row level security;
create policy "order_payments: members read" on public.order_payments
  for select to authenticated using (public.is_business_member(business_id));
revoke all on public.order_payments from anon, authenticated;
grant select on public.order_payments to authenticated;
grant all on public.order_payments to service_role;

create function public.order_payments_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders set amount_paid = amount_paid + new.amount where id = new.order_id and business_id = new.business_id;
  return new;
end;
$$;
create trigger order_payments_apply after insert on public.order_payments
  for each row execute function public.order_payments_apply();

-- Orders marked paid before the payment history: one payment row each, so the ledger adds up.
insert into public.order_payments (business_id, order_id, customer_id, amount, method, reference, received_at)
select business_id, id, customer_id, total,
       case when payment_method in ('cash', 'mtn_momo', 'orange_money', 'mobile_money', 'bank_transfer', 'card') then payment_method else 'other' end,
       'recorded before the payment history', updated_at
from public.orders where payment_status = 'paid' and total > 0;

-- ---------------------------------------------------------------------------
-- Creating orders and sales
-- ---------------------------------------------------------------------------
drop function public.create_order(uuid, uuid, jsonb, uuid, numeric, numeric, text, text, text);

/*
 * Creates an order with its items in one transaction (as before), keeping
 * each item's cost at the time of sale. POS sales (p_channel 'pos') may have
 * no customer and are created with their status (e.g. 'delivered').
 */
create function public.create_order(
  p_business_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_conversation_id uuid default null,
  p_delivery_fee numeric default 0,
  p_discount numeric default 0,
  p_delivery_address text default null,
  p_payment_method text default null,
  p_notes text default null,
  p_channel text default null,
  p_status text default 'pending',
  p_client_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_seq bigint;
  v_currency char(3);
  v_subtotal numeric(14, 2) := 0;
  v_item jsonb;
  v_qty integer;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  v_name text;
  v_variant_label text;
  v_variant_id uuid;
  v_price numeric(14, 2);
  v_cost numeric(14, 2);
  v_channel text := coalesce(p_channel, case when p_conversation_id is not null then 'whatsapp' else 'manual' end);
begin
  if (select auth.role()) is distinct from 'service_role' and not public.has_min_role(p_business_id, 'agent') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'an order needs between 1 and 100 items' using errcode = '22023';
  end if;
  if p_customer_id is null and v_channel <> 'pos' then
    raise exception 'unknown customer' using errcode = '22023';
  end if;
  if p_customer_id is not null and not exists (select 1 from public.customers where id = p_customer_id and business_id = p_business_id) then
    raise exception 'unknown customer' using errcode = '22023';
  end if;
  if p_conversation_id is not null and not exists (
    select 1 from public.conversations where id = p_conversation_id and business_id = p_business_id and customer_id = p_customer_id
  ) then
    raise exception 'unknown conversation' using errcode = '22023';
  end if;
  if coalesce(p_delivery_fee, 0) < 0 or coalesce(p_discount, 0) < 0 then
    raise exception 'fees and discounts cannot be negative' using errcode = '22023';
  end if;

  select currency into v_currency from public.businesses where id = p_business_id;

  insert into public.business_counters (business_id) values (p_business_id) on conflict do nothing;
  update public.business_counters set order_seq = order_seq + 1 where business_id = p_business_id returning order_seq into v_seq;

  insert into public.orders (id, business_id, customer_id, conversation_id, order_number, currency, status,
                             delivery_address, payment_method, notes, created_by, stock_managed, channel, client_key)
  values (v_order_id, p_business_id, p_customer_id, p_conversation_id, 'ORD-' || lpad(v_seq::text, 5, '0'), v_currency, coalesce(p_status, 'pending'),
          nullif(btrim(p_delivery_address), ''), p_payment_method, nullif(btrim(p_notes), ''), (select auth.uid()), true, v_channel, p_client_key);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item ->> 'quantity')::integer, 1);
    if v_qty < 1 then
      raise exception 'quantity must be at least 1' using errcode = '22023';
    end if;
    v_variant_label := null;
    v_variant_id := null;
    v_cost := null;

    if v_item ? 'product_id' and nullif(v_item ->> 'product_id', '') is not null then
      select * into v_product from public.products
      where id = (v_item ->> 'product_id')::uuid and business_id = p_business_id;
      if not found then
        raise exception 'unknown product' using errcode = '22023';
      end if;
      v_name := v_product.name;
      v_price := v_product.price;
      v_cost := v_product.cost_price;
      if nullif(v_item ->> 'variant_id', '') is not null then
        select * into v_variant from public.product_variants
        where id = (v_item ->> 'variant_id')::uuid and product_id = v_product.id and business_id = p_business_id;
        if not found then
          raise exception 'unknown variant' using errcode = '22023';
        end if;
        v_price := greatest(v_price + v_variant.price_modifier, 0);
        v_variant_label := v_variant.name || ': ' || v_variant.value;
        v_variant_id := v_variant.id;
      end if;
    else
      v_name := nullif(btrim(v_item ->> 'name'), '');
      v_price := (v_item ->> 'unit_price')::numeric;
      if v_name is null or v_price is null or v_price < 0 then
        raise exception 'custom items need a name and a price' using errcode = '22023';
      end if;
      v_product.id := null;
    end if;

    insert into public.order_items (business_id, order_id, product_id, variant_id, product_name, variant, quantity, unit_price, total, unit_cost)
    values (p_business_id, v_order_id, v_product.id, v_variant_id, v_name, v_variant_label, v_qty, v_price, v_price * v_qty, v_cost);
    v_subtotal := v_subtotal + v_price * v_qty;
    v_product.id := null;
  end loop;

  if coalesce(p_discount, 0) > v_subtotal + coalesce(p_delivery_fee, 0) then
    raise exception 'discount is larger than the order' using errcode = '22023';
  end if;

  perform public.apply_order_stock(v_order_id, 1);

  update public.orders
  set subtotal = v_subtotal,
      delivery_fee = coalesce(p_delivery_fee, 0),
      discount = coalesce(p_discount, 0),
      total = v_subtotal + coalesce(p_delivery_fee, 0) - coalesce(p_discount, 0),
      stock_applied = true
  where id = v_order_id;

  return v_order_id;
end;
$$;
revoke execute on function public.create_order(uuid, uuid, jsonb, uuid, numeric, numeric, text, text, text, text, text, uuid) from public, anon;
grant execute on function public.create_order(uuid, uuid, jsonb, uuid, numeric, numeric, text, text, text, text, text, uuid) to authenticated, service_role;

/*
 * The POS: one sale — items, stock, payments — in one transaction. Sending
 * the same p_client_key again returns the first sale (no duplicate). Prices
 * and costs come from the catalog. Discounts: owners/admins only. Paying less
 * than the total is a sale on credit and needs a customer.
 *   p_payments: [{"method":"cash","amount":10000,"reference":null}, …]
 */
create function public.create_sale(
  p_business_id uuid,
  p_client_key uuid,
  p_items jsonb,
  p_customer_id uuid default null,
  p_discount numeric default 0,
  p_payments jsonb default '[]'::jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_total numeric(14, 2);
  v_paid numeric(14, 2) := 0;
  v_first text;
  p jsonb;
  v_amount numeric(14, 2);
  v_method text;
begin
  if not public.has_min_role(p_business_id, 'agent') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_client_key is null then
    raise exception 'missing sale key' using errcode = '22023';
  end if;
  select id into v_id from public.orders where business_id = p_business_id and client_key = p_client_key;
  if found then
    return v_id;
  end if;
  if coalesce(p_discount, 0) > 0 and not public.has_min_role(p_business_id, 'admin') then
    raise exception 'discounts need an owner or admin' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) > 5 then
    raise exception 'invalid payments' using errcode = '22023';
  end if;

  v_id := public.create_order(p_business_id, p_customer_id, p_items, null, 0, p_discount, null, null, p_notes, 'pos', 'delivered', p_client_key);
  select total into v_total from public.orders where id = v_id;

  for p in select * from jsonb_array_elements(p_payments) loop
    v_amount := (p ->> 'amount')::numeric;
    v_method := p ->> 'method';
    if v_amount is null or v_amount <= 0 then
      raise exception 'invalid payment amount' using errcode = '22023';
    end if;
    insert into public.order_payments (business_id, order_id, customer_id, amount, method, reference, recorded_by)
    values (p_business_id, v_id, p_customer_id, v_amount, v_method, nullif(btrim(p ->> 'reference'), ''), (select auth.uid()));
    v_paid := v_paid + v_amount;
    v_first := coalesce(v_first, v_method);
  end loop;
  if v_paid > v_total then
    raise exception 'payments are more than the total' using errcode = '22023';
  end if;
  if v_paid < v_total and p_customer_id is null then
    raise exception 'a sale on credit needs a customer' using errcode = '22023';
  end if;
  update public.orders set payment_method = coalesce(v_first, 'credit') where id = v_id;
  return v_id;
end;
$$;
revoke execute on function public.create_sale(uuid, uuid, jsonb, uuid, numeric, jsonb, text) from public, anon;
grant execute on function public.create_sale(uuid, uuid, jsonb, uuid, numeric, jsonb, text) to authenticated;

/* Agents and up: a payment for one order (a deposit, the rest of a credit sale). Same key = same payment. */
create function public.record_order_payment(p_business_id uuid, p_order_id uuid, p_amount numeric, p_method text, p_reference text default null, p_client_key uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_group uuid := coalesce(p_client_key, gen_random_uuid());
begin
  if not public.has_min_role(p_business_id, 'agent') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.order_payments where business_id = p_business_id and group_id = v_group) then
    return v_group;
  end if;
  select * into v_order from public.orders where id = p_order_id and business_id = p_business_id for update;
  if not found or v_order.status = 'cancelled' then
    raise exception 'unknown order' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > v_order.total - v_order.amount_paid then
    raise exception 'the amount is more than what is owed' using errcode = '22023';
  end if;
  insert into public.order_payments (business_id, order_id, customer_id, amount, method, reference, group_id, recorded_by)
  values (p_business_id, p_order_id, v_order.customer_id, p_amount, p_method, nullif(btrim(p_reference), ''), v_group, (select auth.uid()));
  return v_group;
end;
$$;
revoke execute on function public.record_order_payment(uuid, uuid, numeric, text, text, uuid) from public, anon;
grant execute on function public.record_order_payment(uuid, uuid, numeric, text, text, uuid) to authenticated;

/*
 * Agents and up: a customer pays towards what they owe. The amount settles
 * their oldest unpaid sales first; it can't be more than they owe. Same key =
 * same payment.
 */
create function public.record_customer_payment(p_business_id uuid, p_customer_id uuid, p_amount numeric, p_method text, p_reference text default null, p_client_key uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := coalesce(p_client_key, gen_random_uuid());
  v_left numeric(14, 2) := p_amount;
  v_owed numeric(14, 2);
  v_part numeric(14, 2);
  o record;
begin
  if not public.has_min_role(p_business_id, 'agent') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.order_payments where business_id = p_business_id and group_id = v_group) then
    return v_group;
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id and business_id = p_business_id) then
    raise exception 'unknown customer' using errcode = '22023';
  end if;
  select coalesce(sum(total - amount_paid), 0) into v_owed from public.orders
  where business_id = p_business_id and customer_id = p_customer_id and status = 'delivered';
  if p_amount is null or p_amount <= 0 or p_amount > v_owed then
    raise exception 'the amount is more than what is owed' using errcode = '22023';
  end if;
  for o in
    select id, total - amount_paid as due from public.orders
    where business_id = p_business_id and customer_id = p_customer_id and status = 'delivered' and amount_paid < total
    -- Oldest first; same moment: by sale number (ORD-00009 before ORD-00010).
    order by created_at, length(order_number), order_number, id
    for update
  loop
    exit when v_left <= 0;
    v_part := least(v_left, o.due);
    insert into public.order_payments (business_id, order_id, customer_id, amount, method, reference, group_id, recorded_by)
    values (p_business_id, o.id, p_customer_id, v_part, p_method, nullif(btrim(p_reference), ''), v_group, (select auth.uid()));
    v_left := v_left - v_part;
  end loop;
  return v_group;
end;
$$;
revoke execute on function public.record_customer_payment(uuid, uuid, numeric, text, text, uuid) from public, anon;
grant execute on function public.record_customer_payment(uuid, uuid, numeric, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Customers: totals and credit (from the sales and payments, never stored twice)
-- ---------------------------------------------------------------------------
create view public.customer_stats with (security_invoker = true) as
select c.business_id,
       c.id as customer_id,
       count(o.id) filter (where o.status = 'delivered')::int as orders_count,
       coalesce(sum(o.total) filter (where o.status = 'delivered'), 0) as total_spent,
       coalesce(sum(o.amount_paid) filter (where o.status <> 'cancelled'), 0) as amount_paid,
       coalesce(sum(o.total - o.amount_paid) filter (where o.status = 'delivered'), 0) as outstanding,
       max(o.created_at) filter (where o.status = 'delivered') as last_purchase_at
from public.customers c
left join public.orders o on o.business_id = c.business_id and o.customer_id = c.id
group by c.business_id, c.id;
grant select on public.customer_stats to authenticated;

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  category text not null check (category in ('rent', 'electricity', 'internet', 'transport', 'salaries', 'marketing', 'supplier', 'packaging', 'delivery', 'other')),
  amount numeric(14, 2) not null check (amount > 0 and amount <= 10000000000),
  spent_on date not null default current_date,
  description text check (char_length(description) <= 500),
  payment_method text check (payment_method in ('cash', 'mtn_momo', 'orange_money', 'bank_transfer', 'card', 'other')),
  reference text check (char_length(reference) <= 100),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index expenses_business_idx on public.expenses (business_id, spent_on desc);
create trigger expenses_set_updated_at before update on public.expenses for each row execute function public.set_updated_at();

alter table public.expenses enable row level security;
create policy "expenses: admins read" on public.expenses for select to authenticated using (public.has_min_role(business_id, 'admin'));
create policy "expenses: admins add" on public.expenses for insert to authenticated with check (public.has_min_role(business_id, 'admin'));
create policy "expenses: admins edit" on public.expenses for update to authenticated using (public.has_min_role(business_id, 'admin')) with check (public.has_min_role(business_id, 'admin'));
create policy "expenses: admins delete" on public.expenses for delete to authenticated using (public.has_min_role(business_id, 'admin'));
revoke all on public.expenses from anon;
grant select, insert, update, delete on public.expenses to authenticated;

-- ---------------------------------------------------------------------------
-- Receipts
-- ---------------------------------------------------------------------------
alter table public.businesses add column receipt_footer text check (char_length(receipt_footer) <= 300);

-- ---------------------------------------------------------------------------
-- Reports (owners/admins: they include costs and profit)
-- ---------------------------------------------------------------------------
/*
 * Completed sales (status delivered) per day in the business's timezone:
 * count, revenue, cost of goods sold (known costs), items without a cost, discounts.
 */
create function public.sales_by_day(p_business_id uuid, p_from date, p_to date)
returns table (day date, sales integer, revenue numeric, cogs numeric, items_without_cost integer, discounts numeric)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tz text;
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select timezone into v_tz from public.businesses where id = p_business_id;
  return query
  with o as (
    select o.id, (o.created_at at time zone v_tz)::date as d, o.total, o.discount
    from public.orders o
    where o.business_id = p_business_id and o.status = 'delivered'
      and o.created_at >= (p_from::timestamp at time zone v_tz) and o.created_at < ((p_to + 1)::timestamp at time zone v_tz)
  ), i as (
    select i.order_id, sum(i.quantity * i.unit_cost) as cogs, count(*) filter (where i.unit_cost is null)::int as unknown
    from public.order_items i where i.business_id = p_business_id and i.order_id in (select id from o)
    group by i.order_id
  )
  select o.d, count(*)::int, sum(o.total), coalesce(sum(i.cogs), 0), coalesce(sum(i.unknown), 0)::int, sum(o.discount)
  from o left join i on i.order_id = o.id
  group by o.d order by o.d;
end;
$$;
revoke execute on function public.sales_by_day(uuid, date, date) from public, anon;
grant execute on function public.sales_by_day(uuid, date, date) to authenticated;

/* Completed sales per product over a period: quantity, revenue (before order discounts), known cost. */
create function public.product_sales(p_business_id uuid, p_from date, p_to date)
returns table (product_id uuid, product_name text, quantity integer, revenue numeric, cogs numeric, items_without_cost integer)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tz text;
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select timezone into v_tz from public.businesses where id = p_business_id;
  return query
  select i.product_id, min(i.product_name), sum(i.quantity)::int, sum(i.total), coalesce(sum(i.quantity * i.unit_cost), 0),
         (count(*) filter (where i.unit_cost is null))::int
  from public.order_items i
  join public.orders o on o.id = i.order_id and o.business_id = i.business_id
  where i.business_id = p_business_id and o.status = 'delivered'
    and o.created_at >= (p_from::timestamp at time zone v_tz) and o.created_at < ((p_to + 1)::timestamp at time zone v_tz)
  group by i.product_id, case when i.product_id is null then i.product_name end
  order by sum(i.total) desc;
end;
$$;
revoke execute on function public.product_sales(uuid, date, date) from public, anon;
grant execute on function public.product_sales(uuid, date, date) to authenticated;
