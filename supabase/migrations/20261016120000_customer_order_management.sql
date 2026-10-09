-- =============================================================================
-- Customers and orders: references, payments, returns and refunds, delivery
-- =============================================================================
-- What already existed and is kept as it is:
--   * orders.customer_id is a foreign key to the customer of the SAME business
--     (composite key business_id + id); customers with orders can't be deleted.
--   * order numbers (ORD-00001 …) come from an atomic per-business counter
--     (business_counters) inside create_order(); they are never edited or reused.
--   * order items keep the product name and price at the time of the order.
--   * one stock rule: an order takes its items out of stock when it is created,
--     gives them back when it is cancelled (stock_movements records every change).
--   * order_payments is the payment ledger; orders.amount_paid follows it.
--
-- New here:
--   * customers.reference (CUS-000001 …): automatic, per business, never reused,
--     never edited; existing customers are numbered by creation date.
--   * order references keep their format (ORD-00067); numbers past 99 999 no
--     longer get cut to five digits.
--   * order status "returned" (from "delivered" only): the stock comes back.
--   * payments: date received and a note; refunds (cancelled or returned orders
--     only) and voiding a payment recorded by mistake (owners/admins, with a
--     reason). Nothing is deleted: a voided payment stays in the history.
--   * payment status "partially_refunded"; orders.amount_refunded;
--     orders.balance_due (what is still owed on the order).
--   * delivery details on orders (method, recipient, pickup place, reference,
--     notes) and a history of status changes (who and when).
--   * order_items.sku: the product's SKU at the time of the order (new orders).
--   * link a customer to an order that has none (walk-in sale), never re-link.
--   * customers.last_contact_at also follows messages sent to the customer,
--     orders and payments.
--
-- Definitions (customer_stats, the Customers and Orders pages):
--   purchases        orders delivered to the customer (POS sales are created
--                    delivered); cancelled and returned orders don't count.
--   total spent      the value of those purchases (order totals after discounts
--                    and with delivery fees).
--   paid             money actually collected from the customer on all their
--                    orders: valid payments minus refunds (voided payments excluded).
--   owes             what delivered orders still owe (total − paid). Deposits on
--                    orders not delivered yet reduce what they will owe; an order
--                    becomes a debt once delivered.
--   balance due      (per order) total − paid, 0 for cancelled/returned orders.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- References
-- ---------------------------------------------------------------------------
/* PREFIX-000123: zero-padded to p_width digits, never cut (lpad would cut longer numbers). */
create function public.format_reference(p_prefix text, p_n bigint, p_width integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select p_prefix || '-' || case when length(p_n::text) >= p_width then p_n::text else lpad(p_n::text, p_width, '0') end;
$$;

alter table public.business_counters add column customer_seq bigint not null default 0;

alter table public.customers add column reference text;

-- Existing customers: numbered per business in the order they were created,
-- after any reference already there (none on a first run).
with existing as (
  select business_id, max(substring(reference from '^CUS-([0-9]+)$')::bigint) as top
  from public.customers where reference ~ '^CUS-[0-9]{6,}$' group by business_id
), numbered as (
  select c.id, c.business_id,
         coalesce(e.top, 0) + row_number() over (partition by c.business_id order by c.created_at, c.id) as n
  from public.customers c
  left join existing e on e.business_id = c.business_id
  where c.reference is null or c.reference !~ '^CUS-[0-9]{6,}$'
)
update public.customers c set reference = public.format_reference('CUS', numbered.n, 6)
from numbered where c.id = numbered.id;

insert into public.business_counters (business_id, customer_seq)
select business_id, max(substring(reference from '^CUS-([0-9]+)$')::bigint)
from public.customers group by business_id
on conflict (business_id) do update set customer_seq = greatest(public.business_counters.customer_seq, excluded.customer_seq);

alter table public.customers
  alter column reference set not null,
  -- Always replaced by the trigger below; an empty value would fail the format check.
  alter column reference set default '',
  add constraint customers_reference_format check (reference ~ '^CUS-[0-9]{6,}$'),
  add constraint customers_business_reference_key unique (business_id, reference);
comment on column public.customers.reference is 'Readable customer ID (CUS-000001), per business: assigned on creation, never changed or reused.';

/*
 * Gives a new customer the next reference of its business. The counter row is
 * locked by the update, so two customers created at the same moment get
 * different numbers. A WhatsApp message from a number the business already
 * knows (insert … on conflict) keeps that customer's reference and uses no number.
 */
create function public.customers_assign_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq bigint;
  v_existing text;
begin
  select reference into v_existing from public.customers
  where business_id = new.business_id and whatsapp_phone = new.whatsapp_phone;
  if v_existing is not null then
    new.reference := v_existing;
    return new;
  end if;
  insert into public.business_counters (business_id) values (new.business_id) on conflict do nothing;
  update public.business_counters set customer_seq = customer_seq + 1
  where business_id = new.business_id returning customer_seq into v_seq;
  new.reference := public.format_reference('CUS', v_seq, 6);
  return new;
end;
$$;
create trigger customers_assign_reference before insert on public.customers
  for each row execute function public.customers_assign_reference();

create function public.customers_keep_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.reference is distinct from old.reference then
    raise exception 'a customer reference can''t be changed' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger customers_keep_reference before update of reference on public.customers
  for each row execute function public.customers_keep_reference();

revoke execute on function public.customers_assign_reference() from public, anon, authenticated;
revoke execute on function public.customers_keep_reference() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Orders: returns, refunds, delivery, balance
-- ---------------------------------------------------------------------------
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending', 'confirmed', 'processing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'returned'));

alter table public.orders drop constraint orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check
  check (payment_status in ('unpaid', 'partial', 'paid', 'pending', 'refunded', 'partially_refunded', 'failed'));

alter table public.orders
  add column amount_refunded numeric(14, 2) not null default 0 check (amount_refunded >= 0),
  add constraint orders_refund_within_paid check (amount_refunded <= amount_paid),
  add column delivery_method text check (delivery_method in ('pickup', 'delivery')),
  add column recipient_name text check (char_length(recipient_name) <= 120),
  add column recipient_phone text check (char_length(recipient_phone) <= 24),
  add column pickup_location text check (char_length(pickup_location) <= 300),
  add column delivery_reference text check (char_length(delivery_reference) <= 100),
  add column delivery_notes text check (char_length(delivery_notes) <= 1000);

-- What is still owed on the order (cancelled and returned orders owe nothing).
alter table public.orders add column balance_due numeric(14, 2)
  generated always as (case when status in ('cancelled', 'returned') then 0 else total - amount_paid end) stored;
create index orders_balance_due_idx on public.orders (business_id) where balance_due > 0;

grant update (delivery_method, recipient_name, recipient_phone, pickup_location, delivery_reference, delivery_notes)
  on public.orders to authenticated;

-- Payment status follows the payments and refunds recorded (never picked by hand).
create or replace function public.orders_payment_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.payment_status := case
    when new.amount_refunded > 0 and new.amount_refunded >= new.amount_paid then 'refunded'
    when new.amount_refunded > 0 then 'partially_refunded'
    when new.amount_paid > 0 and new.amount_paid >= new.total then 'paid'
    when new.amount_paid > 0 then 'partial'
    when new.total = 0 and new.subtotal > 0 then 'paid'
    else 'unpaid'
  end;
  return new;
end;
$$;
drop trigger orders_payment_status on public.orders;
create trigger orders_payment_status before insert or update of amount_paid, amount_refunded, total, payment_status on public.orders
  for each row execute function public.orders_payment_status();

/*
 * Status rules:
 *   returned        only from delivered (the customer brought the goods back);
 *   refunded money  an order with a refund stays cancelled or returned.
 */
create function public.orders_status_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'returned' and old.status <> 'delivered' then
    raise exception 'only a delivered order can be returned' using errcode = '22023';
  end if;
  if old.status in ('cancelled', 'returned') and new.status not in ('cancelled', 'returned') and old.amount_refunded > 0 then
    raise exception 'this order has a refund: it stays cancelled or returned' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger orders_status_rules before update of status on public.orders
  for each row when (old.status is distinct from new.status)
  execute function public.orders_status_rules();

-- Cancelling or returning gives the stock back; reopening takes it again (refused if it's gone meanwhile).
create or replace function public.orders_stock_on_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.stock_managed then
    return new;
  end if;
  if new.status in ('cancelled', 'returned') and old.stock_applied then
    perform public.apply_order_stock(new.id, -1);
    new.stock_applied := false;
  elsif new.status not in ('cancelled', 'returned') and not old.stock_applied then
    perform public.apply_order_stock(new.id, 1);
    new.stock_applied := true;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Status history
-- ---------------------------------------------------------------------------
create table public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  order_id uuid not null,
  from_status text,
  to_status text not null,
  changed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (business_id, order_id) references public.orders (business_id, id) on delete cascade
);
create index order_status_events_order_idx on public.order_status_events (business_id, order_id, created_at);

alter table public.order_status_events enable row level security;
create policy "order_status_events: members read" on public.order_status_events
  for select to authenticated using (public.is_business_member(business_id));
revoke all on public.order_status_events from anon, authenticated;
grant select on public.order_status_events to authenticated;
grant all on public.order_status_events to service_role;

create function public.orders_log_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.order_status_events (business_id, order_id, from_status, to_status, changed_by)
    values (new.business_id, new.id, case when tg_op = 'UPDATE' then old.status end, new.status, (select auth.uid()));
  end if;
  return null;
end;
$$;
revoke execute on function public.orders_log_status() from public, anon, authenticated;
create trigger orders_log_status after insert or update of status on public.orders
  for each row execute function public.orders_log_status();

-- ---------------------------------------------------------------------------
-- Order items: SKU at the time of the order
-- ---------------------------------------------------------------------------
-- Older items keep no SKU (the catalog's current SKU may not be the one sold).
alter table public.order_items add column sku text check (char_length(sku) <= 64);
grant select (sku) on public.order_items to authenticated;

-- ---------------------------------------------------------------------------
-- Payments: date, note, refunds, voids
-- ---------------------------------------------------------------------------
alter table public.order_payments
  add column kind text not null default 'payment' check (kind in ('payment', 'refund')),
  add column note text check (char_length(note) <= 500),
  add column voided_at timestamptz,
  add column voided_by uuid references auth.users (id) on delete set null,
  add column void_reason text check (char_length(void_reason) between 3 and 300),
  add constraint order_payments_void_reason check ((voided_at is null) = (void_reason is null));

-- A payment adds to what was paid, a refund to what was refunded.
create or replace function public.order_payments_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.voided_at is not null then
    return new;
  end if;
  if new.kind = 'refund' then
    update public.orders set amount_refunded = amount_refunded + new.amount where id = new.order_id and business_id = new.business_id;
  else
    update public.orders set amount_paid = amount_paid + new.amount where id = new.order_id and business_id = new.business_id;
  end if;
  return new;
end;
$$;

/*
 * What a payment says (amount, type, order, method, group) never changes;
 * voiding one takes its amount back out (once) and can't be undone. Only the
 * date may be corrected (the demo data and imports set it after creating).
 */
create function public.order_payments_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.amount is distinct from old.amount or new.kind is distinct from old.kind or new.order_id is distinct from old.order_id
     or new.business_id is distinct from old.business_id
     or new.method is distinct from old.method or new.group_id is distinct from old.group_id
     or (old.voided_at is not null and new.voided_at is distinct from old.voided_at) then
    raise exception 'a recorded payment can''t be changed: void it and record it again' using errcode = '22023';
  end if;
  if old.voided_at is null and new.voided_at is not null then
    if new.kind = 'refund' then
      update public.orders set amount_refunded = amount_refunded - new.amount where id = new.order_id and business_id = new.business_id;
    else
      update public.orders set amount_paid = amount_paid - new.amount where id = new.order_id and business_id = new.business_id;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.order_payments_guard() from public, anon, authenticated;
create trigger order_payments_guard before update on public.order_payments
  for each row execute function public.order_payments_guard();

-- ---------------------------------------------------------------------------
-- Creating orders (same as before, plus delivery details and the SKU)
-- ---------------------------------------------------------------------------
drop function public.create_order(uuid, uuid, jsonb, uuid, numeric, numeric, text, text, text, text, text, uuid);

/*
 * Creates an order with its items in one transaction: prices, names, SKUs and
 * costs from the catalog (never from the browser), totals, the next order
 * number, and the stock taken. POS sales (p_channel 'pos') may have no customer.
 *   p_delivery: {"method":"pickup"|"delivery","recipient_name","recipient_phone",
 *                "pickup_location","reference","notes"} (all optional)
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
  p_client_key uuid default null,
  p_delivery jsonb default null
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
  v_sku text;
  v_variant_label text;
  v_variant_id uuid;
  v_price numeric(14, 2);
  v_cost numeric(14, 2);
  v_channel text := coalesce(p_channel, case when p_conversation_id is not null then 'whatsapp' else 'manual' end);
  v_delivery jsonb := coalesce(p_delivery, '{}'::jsonb);
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
  if jsonb_typeof(v_delivery) <> 'object' then
    raise exception 'invalid delivery details' using errcode = '22023';
  end if;

  select currency into v_currency from public.businesses where id = p_business_id;

  insert into public.business_counters (business_id) values (p_business_id) on conflict do nothing;
  update public.business_counters set order_seq = order_seq + 1 where business_id = p_business_id returning order_seq into v_seq;

  insert into public.orders (id, business_id, customer_id, conversation_id, order_number, currency, status,
                             delivery_address, payment_method, notes, created_by, stock_managed, channel, client_key,
                             delivery_method, recipient_name, recipient_phone, pickup_location, delivery_reference, delivery_notes)
  values (v_order_id, p_business_id, p_customer_id, p_conversation_id, public.format_reference('ORD', v_seq, 5), v_currency, coalesce(p_status, 'pending'),
          nullif(btrim(p_delivery_address), ''), p_payment_method, nullif(btrim(p_notes), ''), (select auth.uid()), true, v_channel, p_client_key,
          nullif(v_delivery ->> 'method', ''), nullif(btrim(v_delivery ->> 'recipient_name'), ''), nullif(btrim(v_delivery ->> 'recipient_phone'), ''),
          nullif(btrim(v_delivery ->> 'pickup_location'), ''), nullif(btrim(v_delivery ->> 'reference'), ''), nullif(btrim(v_delivery ->> 'notes'), ''));

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item ->> 'quantity')::integer, 1);
    if v_qty < 1 then
      raise exception 'quantity must be at least 1' using errcode = '22023';
    end if;
    v_variant_label := null;
    v_variant_id := null;
    v_cost := null;
    v_sku := null;

    if v_item ? 'product_id' and nullif(v_item ->> 'product_id', '') is not null then
      select * into v_product from public.products
      where id = (v_item ->> 'product_id')::uuid and business_id = p_business_id;
      if not found then
        raise exception 'unknown product' using errcode = '22023';
      end if;
      v_name := v_product.name;
      v_price := v_product.price;
      v_cost := v_product.cost_price;
      v_sku := v_product.sku;
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

    insert into public.order_items (business_id, order_id, product_id, variant_id, product_name, variant, sku, quantity, unit_price, total, unit_cost)
    values (p_business_id, v_order_id, v_product.id, v_variant_id, v_name, v_variant_label, v_sku, v_qty, v_price, v_price * v_qty, v_cost);
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
revoke execute on function public.create_order(uuid, uuid, jsonb, uuid, numeric, numeric, text, text, text, text, text, uuid, jsonb) from public, anon;
grant execute on function public.create_order(uuid, uuid, jsonb, uuid, numeric, numeric, text, text, text, text, text, uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Recording payments, refunds and voids (all by hand: WazaBolt takes no payment)
-- ---------------------------------------------------------------------------
/* The date a payment was received: now when not given; never in the future. */
create function public._payment_time(p_received_at timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_received_at is null then
    return now();
  end if;
  if p_received_at > now() + interval '5 minutes' then
    raise exception 'the payment date can''t be in the future' using errcode = '22023';
  end if;
  return p_received_at;
end;
$$;
revoke execute on function public._payment_time(timestamptz) from public, anon, authenticated;

drop function public.record_order_payment(uuid, uuid, numeric, text, text, uuid);
drop function public.record_customer_payment(uuid, uuid, numeric, text, text, uuid);

/* Agents and up: a payment for one order (a deposit, part or all of what's left). Same key = same payment. */
create function public.record_order_payment(
  p_business_id uuid, p_order_id uuid, p_amount numeric, p_method text,
  p_reference text default null, p_client_key uuid default null,
  p_received_at timestamptz default null, p_note text default null
)
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
  if not found then
    raise exception 'unknown order' using errcode = '22023';
  end if;
  if v_order.status in ('cancelled', 'returned') then
    raise exception 'this order is cancelled or returned' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > v_order.total - v_order.amount_paid then
    raise exception 'the amount is more than what is owed' using errcode = '22023';
  end if;
  insert into public.order_payments (business_id, order_id, customer_id, amount, method, reference, note, group_id, received_at, recorded_by)
  values (p_business_id, p_order_id, v_order.customer_id, p_amount, p_method, nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''),
          v_group, public._payment_time(p_received_at), (select auth.uid()));
  return v_group;
end;
$$;
revoke execute on function public.record_order_payment(uuid, uuid, numeric, text, text, uuid, timestamptz, text) from public, anon;
grant execute on function public.record_order_payment(uuid, uuid, numeric, text, text, uuid, timestamptz, text) to authenticated;

/*
 * Agents and up: a customer pays towards what they owe. The amount settles
 * their oldest unpaid delivered orders first; it can't be more than they owe.
 * Same key = same payment.
 */
create function public.record_customer_payment(
  p_business_id uuid, p_customer_id uuid, p_amount numeric, p_method text,
  p_reference text default null, p_client_key uuid default null,
  p_received_at timestamptz default null, p_note text default null
)
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
  v_at timestamptz := public._payment_time(p_received_at);
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
    -- Oldest first; same moment: by order number (ORD-00009 before ORD-00010).
    order by created_at, length(order_number), order_number, id
    for update
  loop
    exit when v_left <= 0;
    v_part := least(v_left, o.due);
    insert into public.order_payments (business_id, order_id, customer_id, amount, method, reference, note, group_id, received_at, recorded_by)
    values (p_business_id, o.id, p_customer_id, v_part, p_method, nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''), v_group, v_at, (select auth.uid()));
    v_left := v_left - v_part;
  end loop;
  return v_group;
end;
$$;
revoke execute on function public.record_customer_payment(uuid, uuid, numeric, text, text, uuid, timestamptz, text) from public, anon;
grant execute on function public.record_customer_payment(uuid, uuid, numeric, text, text, uuid, timestamptz, text) to authenticated;

/*
 * Owners/admins: money given back to the customer for a cancelled or returned
 * order, up to what they paid (net of earlier refunds). Same key = same refund.
 */
create function public.record_order_refund(
  p_business_id uuid, p_order_id uuid, p_amount numeric, p_method text,
  p_reference text default null, p_client_key uuid default null,
  p_received_at timestamptz default null, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_group uuid := coalesce(p_client_key, gen_random_uuid());
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.order_payments where business_id = p_business_id and group_id = v_group) then
    return v_group;
  end if;
  select * into v_order from public.orders where id = p_order_id and business_id = p_business_id for update;
  if not found then
    raise exception 'unknown order' using errcode = '22023';
  end if;
  if v_order.status not in ('cancelled', 'returned') then
    raise exception 'refunds are for cancelled or returned orders' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > v_order.amount_paid - v_order.amount_refunded then
    raise exception 'the refund is more than what was paid' using errcode = '22023';
  end if;
  insert into public.order_payments (business_id, order_id, customer_id, kind, amount, method, reference, note, group_id, received_at, recorded_by)
  values (p_business_id, p_order_id, v_order.customer_id, 'refund', p_amount, p_method, nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''),
          v_group, public._payment_time(p_received_at), (select auth.uid()));
  return v_group;
end;
$$;
revoke execute on function public.record_order_refund(uuid, uuid, numeric, text, text, uuid, timestamptz, text) from public, anon;
grant execute on function public.record_order_refund(uuid, uuid, numeric, text, text, uuid, timestamptz, text) to authenticated;

/*
 * Owners/admins: void a payment (or refund) recorded by mistake, with a reason.
 * A customer payment that settled several orders is voided on all of them.
 * The record stays in the history, marked voided; amounts are taken back out.
 */
create function public.void_payment(p_business_id uuid, p_group_id uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  -- Lock the orders first, in a fixed order.
  perform 1 from public.orders o
  where o.business_id = p_business_id and o.id in (select order_id from public.order_payments where business_id = p_business_id and group_id = p_group_id)
  order by o.id for update;
  -- Refunds before payments, so what was refunded never exceeds what was paid along the way.
  update public.order_payments
  set voided_at = now(), voided_by = (select auth.uid()), void_reason = left(btrim(p_reason), 300)
  where business_id = p_business_id and group_id = p_group_id and voided_at is null and kind = 'refund';
  update public.order_payments
  set voided_at = now(), voided_by = (select auth.uid()), void_reason = left(btrim(p_reason), 300)
  where business_id = p_business_id and group_id = p_group_id and voided_at is null and kind = 'payment';
  select count(*) into v_count from public.order_payments where business_id = p_business_id and group_id = p_group_id;
  if v_count = 0 then
    raise exception 'unknown payment' using errcode = '22023';
  end if;
  return v_count;
exception when check_violation then
  raise exception 'this payment was partly refunded: void the refund first' using errcode = '22023';
end;
$$;
revoke execute on function public.void_payment(uuid, uuid, text) from public, anon;
grant execute on function public.void_payment(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- An order with no customer (walk-in sale): link the right customer, once
-- ---------------------------------------------------------------------------
create function public.link_order_customer(p_business_id uuid, p_order_id uuid, p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current uuid;
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select customer_id into v_current from public.orders where id = p_order_id and business_id = p_business_id for update;
  if not found then
    raise exception 'unknown order' using errcode = '22023';
  end if;
  if v_current is not null then
    raise exception 'this order already has a customer' using errcode = '22023';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id and business_id = p_business_id) then
    raise exception 'unknown customer' using errcode = '22023';
  end if;
  update public.orders set customer_id = p_customer_id where id = p_order_id and business_id = p_business_id;
  update public.order_payments set customer_id = p_customer_id where order_id = p_order_id and business_id = p_business_id and customer_id is null;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, (select auth.uid()), 'order.customer_linked', 'order', p_order_id::text, jsonb_build_object('customer_id', p_customer_id));
end;
$$;
revoke execute on function public.link_order_customer(uuid, uuid, uuid) from public, anon;
grant execute on function public.link_order_customer(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Last contact: messages either way, orders and payments
-- ---------------------------------------------------------------------------
create function public.customers_touch_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer uuid;
  v_at timestamptz;
begin
  if tg_table_name = 'messages' then
    select customer_id into v_customer from public.conversations where id = new.conversation_id and business_id = new.business_id;
    v_at := new.created_at;
  elsif tg_table_name = 'orders' then
    v_customer := new.customer_id;
    v_at := new.created_at;
  else
    v_customer := new.customer_id;
    v_at := new.received_at;
  end if;
  if v_customer is not null then
    update public.customers
    set last_contact_at = greatest(coalesce(last_contact_at, v_at), v_at),
        first_contact_at = least(coalesce(first_contact_at, v_at), v_at)
    where id = v_customer and business_id = new.business_id
      and (last_contact_at is null or last_contact_at < v_at or first_contact_at is null or first_contact_at > v_at);
  end if;
  return null;
end;
$$;
revoke execute on function public.customers_touch_contact() from public, anon, authenticated;
-- Inbound messages already update the customer when they arrive (ingest); this adds the rest.
create trigger messages_touch_contact after insert on public.messages
  for each row when (new.direction = 'outbound')
  execute function public.customers_touch_contact();
create trigger orders_touch_contact after insert on public.orders
  for each row when (new.customer_id is not null)
  execute function public.customers_touch_contact();
create trigger order_payments_touch_contact after insert on public.order_payments
  for each row when (new.customer_id is not null)
  execute function public.customers_touch_contact();

-- Contacts recorded before: messages sent, orders and payments already in the database.
with seen as (
  select cv.business_id, cv.customer_id, max(m.created_at) as last_at, min(m.created_at) as first_at
  from public.messages m join public.conversations cv on cv.id = m.conversation_id and cv.business_id = m.business_id
  group by cv.business_id, cv.customer_id
  union all
  select business_id, customer_id, max(created_at), min(created_at) from public.orders where customer_id is not null group by business_id, customer_id
  union all
  select business_id, customer_id, max(received_at), min(received_at) from public.order_payments where customer_id is not null group by business_id, customer_id
), agg as (
  select business_id, customer_id, max(last_at) as last_at, min(first_at) as first_at from seen group by business_id, customer_id
)
update public.customers c
set last_contact_at = greatest(coalesce(c.last_contact_at, agg.last_at), agg.last_at),
    first_contact_at = least(coalesce(c.first_contact_at, agg.first_at), agg.first_at)
from agg
where c.id = agg.customer_id and c.business_id = agg.business_id
  and (c.last_contact_at is null or c.last_contact_at < agg.last_at or c.first_contact_at is null or c.first_contact_at > agg.first_at);

-- ---------------------------------------------------------------------------
-- Customer totals (same columns, same meaning, refunds now taken into account)
-- ---------------------------------------------------------------------------
create or replace view public.customer_stats with (security_invoker = true) as
select c.business_id,
       c.id as customer_id,
       count(o.id) filter (where o.status = 'delivered')::int as orders_count,
       coalesce(sum(o.total) filter (where o.status = 'delivered'), 0) as total_spent,
       -- Money collected on all the customer's orders: payments minus refunds.
       coalesce(sum(o.amount_paid - o.amount_refunded), 0) as amount_paid,
       coalesce(sum(o.total - o.amount_paid) filter (where o.status = 'delivered'), 0) as outstanding,
       max(o.created_at) filter (where o.status = 'delivered') as last_purchase_at
from public.customers c
left join public.orders o on o.business_id = c.business_id and o.customer_id = c.id
group by c.business_id, c.id;
grant select on public.customer_stats to authenticated;
