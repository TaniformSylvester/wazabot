-- =============================================================================
-- WazaBolt Restaurants (Phase 5, owner decisions of 24 October 2026).
-- Additive: new tables, columns and functions; no existing data is changed.
-- =============================================================================
--
-- Module. "restaurant" is a module like "school": on every plan, no price
-- change; the existing plan limits (products, sales a month, users) apply.
--
-- Menu. Dishes are products. A dish may have priced extras
-- (products.extras: [{"name": "Fried plantain", "price": 500}, …]); an order
-- line keeps the extras chosen (name and price at the time) and a short note
-- ("no pepper"). The line's unit price is the dish (and its variant) plus its
-- extras.
--
-- Orders. A restaurant order is an ordinary order with a service type:
-- dine_in (on a table), takeaway or delivery. Dine-in orders are open bills:
-- rounds of dishes are added during the meal, each round goes to the kitchen
-- as a ticket, and the bill closes once it is paid in full (several payments
-- allowed: split bills). One open bill per table. Payments, refunds, receipts
-- and invoices are the existing order ones.
--
-- Kitchen. A Kitchen role (counts as a user on the plan) sees only the
-- kitchen screen: tickets with dishes, extras, notes and the table — no
-- prices, customers or other business data. Tickets move new → preparing →
-- ready → served.
--
-- Error code: WB440 the bill isn't paid in full.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Kitchen role (role checks compare text: the new value isn't used as a literal here)
-- ---------------------------------------------------------------------------
alter type public.business_role add value if not exists 'kitchen';

/* Business data: members except teachers and kitchen staff (every existing policy uses this). */
create or replace function public.is_business_member(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = target_business_id
      and m.user_id = (select auth.uid())
      and m.role::text not in ('teacher', 'kitchen')
  );
$$;

alter table public.business_invitations drop constraint business_invitations_role_check;
alter table public.business_invitations add constraint business_invitations_role_check check (role in ('admin', 'agent', 'viewer', 'teacher', 'kitchen'));

create or replace function public.create_invitation(p_business_id uuid, p_email text, p_role text, p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_id uuid;
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'agent', 'viewer', 'teacher', 'kitchen') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if p_role = 'admin' and not public.has_min_role(p_business_id, 'owner') then
    raise exception 'only the owner can invite admins' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.business_members m join auth.users u on u.id = m.user_id
    where m.business_id = p_business_id and lower(u.email) = v_email
  ) then
    raise exception 'already a member' using errcode = '23505';
  end if;

  update public.business_invitations set revoked_at = now()
  where business_id = p_business_id and email = v_email and accepted_at is null and revoked_at is null;

  insert into public.business_invitations (business_id, email, role, token_hash, invited_by)
  values (p_business_id, v_email, p_role, p_token_hash, (select auth.uid()))
  returning id into v_id;

  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, (select auth.uid()), 'member.invited', 'invitation', v_id::text, jsonb_build_object('role', p_role));
  return v_id;
end;
$$;

create or replace function public.update_member_role(p_business_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
begin
  if p_role not in ('admin', 'agent', 'viewer', 'teacher', 'kitchen') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  select role::text into v_current from public.business_members where business_id = p_business_id and user_id = p_user_id;
  if v_current is null then
    raise exception 'not a member' using errcode = '22023';
  end if;
  if not public.has_min_role(p_business_id, 'admin') or p_user_id = (select auth.uid()) or v_current = 'owner'
     or ((v_current = 'admin' or p_role = 'admin') and not public.has_min_role(p_business_id, 'owner')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.business_members set role = p_role::public.business_role where business_id = p_business_id and user_id = p_user_id;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, (select auth.uid()), 'member.role_changed', 'member', p_user_id::text, jsonb_build_object('from', v_current, 'to', p_role));
end;
$$;

/* The signed-in user works in this business's kitchen (or is staff who may run the kitchen screen). */
create function public.can_use_kitchen(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id and m.user_id = (select auth.uid())
      and (m.role::text = 'kitchen' or public.role_rank(m.role::text) >= public.role_rank('viewer'))
  );
$$;
revoke execute on function public.can_use_kitchen(uuid) from public, anon;
grant execute on function public.can_use_kitchen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Module
-- ---------------------------------------------------------------------------
alter table public.business_modules drop constraint business_modules_module_check;
alter table public.business_modules add constraint business_modules_module_check check (module in ('commerce', 'ai', 'docs', 'school', 'restaurant'));

create or replace function public.set_business_module(p_business_id uuid, p_module text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_module not in ('commerce', 'ai', 'docs', 'school', 'restaurant') or p_enabled is null then
    raise exception 'unknown module' using errcode = '22023';
  end if;
  insert into public.business_modules (business_id, module, enabled, updated_by)
  values (p_business_id, p_module, p_enabled, (select auth.uid()))
  on conflict (business_id, module) do update set enabled = excluded.enabled, updated_at = now(), updated_by = excluded.updated_by;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, (select auth.uid()), 'module.changed', 'business', p_business_id::text, jsonb_build_object('module', p_module, 'enabled', p_enabled));
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  area text check (char_length(area) <= 40),
  seats integer check (seats between 1 and 100),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, id)
);
create unique index restaurant_tables_name_key on public.restaurant_tables (business_id, lower(btrim(name)));

alter table public.restaurant_tables enable row level security;
create policy "restaurant_tables: members read" on public.restaurant_tables for select to authenticated using (public.is_business_member(business_id));
create policy "restaurant_tables: admins insert" on public.restaurant_tables for insert to authenticated with check (public.has_min_role(business_id, 'admin'));
create policy "restaurant_tables: admins update" on public.restaurant_tables for update to authenticated
  using (public.has_min_role(business_id, 'admin')) with check (public.has_min_role(business_id, 'admin'));
-- Tables are switched off, never deleted (past bills keep their table).
revoke all on public.restaurant_tables from anon, authenticated;
grant select, insert, update on public.restaurant_tables to authenticated;
grant all on public.restaurant_tables to service_role;

-- ---------------------------------------------------------------------------
-- Dish extras
-- ---------------------------------------------------------------------------
/* [{"name": text 1..60, "price": number >= 0}, …] — at most 20, names unique (any case). */
create function public.valid_extras(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) <= 20
    and not exists (
      select 1 from jsonb_array_elements(p) e
      where jsonb_typeof(e) <> 'object'
         or jsonb_typeof(e -> 'name') <> 'string' or char_length(btrim(e ->> 'name')) not between 1 and 60
         or jsonb_typeof(e -> 'price') <> 'number' or (e ->> 'price')::numeric < 0 or (e ->> 'price')::numeric > 10000000
    )
    and (select count(distinct lower(btrim(e ->> 'name'))) from jsonb_array_elements(p) e) = jsonb_array_length(p);
$$;

alter table public.products
  add column extras jsonb not null default '[]'::jsonb constraint products_extras_shape check (public.valid_extras(extras));
-- products SELECT is granted per column (cost privacy): grant the new column.
grant select (extras) on public.products to authenticated;

-- ---------------------------------------------------------------------------
-- Kitchen tickets, restaurant orders and lines
-- ---------------------------------------------------------------------------
alter table public.orders
  add column service_type text check (service_type in ('dine_in', 'takeaway', 'delivery')),
  add column table_id uuid,
  add column guests integer check (guests between 1 and 200),
  add column bill_closed_at timestamptz,
  add constraint orders_table_fk foreign key (business_id, table_id) references public.restaurant_tables (business_id, id);
-- One open bill per table.
create unique index orders_open_table_key on public.orders (table_id)
  where service_type = 'dine_in' and bill_closed_at is null and status not in ('cancelled', 'returned');
create index orders_service_idx on public.orders (business_id, created_at desc) where service_type is not null;

create table public.kitchen_tickets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  order_id uuid not null,
  seq integer not null check (seq >= 1),
  status text not null default 'new' check (status in ('new', 'preparing', 'ready', 'served', 'cancelled')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  started_at timestamptz,
  ready_at timestamptz,
  served_at timestamptz,
  unique (business_id, id),
  unique (order_id, seq),
  foreign key (business_id, order_id) references public.orders (business_id, id) on delete cascade
);
create index kitchen_tickets_active_idx on public.kitchen_tickets (business_id, created_at) where status in ('new', 'preparing', 'ready');

alter table public.kitchen_tickets enable row level security;
create policy "kitchen_tickets: members read" on public.kitchen_tickets for select to authenticated using (public.is_business_member(business_id));
revoke all on public.kitchen_tickets from anon, authenticated;
grant select on public.kitchen_tickets to authenticated;
grant all on public.kitchen_tickets to service_role;

alter table public.order_items
  add column extras jsonb not null default '[]'::jsonb constraint order_items_extras_shape check (public.valid_extras(extras)),
  add column note text check (char_length(note) <= 200),
  add column ticket_id uuid,
  add constraint order_items_ticket_fk foreign key (business_id, ticket_id) references public.kitchen_tickets (business_id, id) on delete set null (ticket_id);
create index order_items_ticket_idx on public.order_items (ticket_id) where ticket_id is not null;
-- order_items SELECT is granted per column (cost privacy): grant the new columns.
grant select (extras, note, ticket_id) on public.order_items to authenticated;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------
/* Stock for some lines of an order (the same rules as apply_order_stock, which handles whole orders). */
create function public._apply_items_stock(p_order_id uuid, p_item_ids uuid[], p_direction int)
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
    where i.order_id = p_order_id and i.id = any(p_item_ids) and i.product_id is not null
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
revoke execute on function public._apply_items_stock(uuid, uuid[], int) from public, anon, authenticated;

/* Totals from the lines (after adding or removing some). */
create function public._restaurant_totals(p_order_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.orders o
  set subtotal = s.subtotal, total = s.subtotal + o.delivery_fee - o.discount
  from (select coalesce(sum(total), 0) as subtotal from public.order_items where order_id = p_order_id) s
  where o.id = p_order_id;
$$;
revoke execute on function public._restaurant_totals(uuid) from public, anon, authenticated;

/* Staff (agent+) or the server (WhatsApp assistant). */
create function public._restaurant_writer(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.role()) = 'service_role' or public.has_min_role(p_business_id, 'agent');
$$;
revoke execute on function public._restaurant_writer(uuid) from public, anon, authenticated;

/*
 * Sends the order's lines not yet sent to the kitchen as a new ticket (round).
 * A WhatsApp order waits for staff: sending it confirms it.
 */
create function public.restaurant_send_to_kitchen(p_business_id uuid, p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders%rowtype;
  v_ticket uuid;
  v_seq integer;
begin
  if not public._restaurant_writer(p_business_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into o from public.orders where id = p_order_id and business_id = p_business_id for update;
  if not found or o.service_type is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if o.bill_closed_at is not null or o.status in ('cancelled', 'returned', 'delivered') then
    raise exception 'this order is closed' using errcode = '22023';
  end if;
  if not exists (select 1 from public.order_items where order_id = o.id and ticket_id is null) then
    return null;
  end if;
  select coalesce(max(seq), 0) + 1 into v_seq from public.kitchen_tickets where order_id = o.id;
  insert into public.kitchen_tickets (business_id, order_id, seq, created_by)
  values (p_business_id, o.id, v_seq, (select auth.uid()))
  returning id into v_ticket;
  update public.order_items set ticket_id = v_ticket where order_id = o.id and ticket_id is null;
  if o.status in ('pending', 'confirmed') then
    update public.orders set status = 'processing' where id = o.id;
  end if;
  return v_ticket;
end;
$$;
revoke execute on function public.restaurant_send_to_kitchen(uuid, uuid) from public, anon;
grant execute on function public.restaurant_send_to_kitchen(uuid, uuid) to authenticated, service_role;

/*
 * Adds dishes to an open restaurant order. Items:
 *   [{"product_id", "variant_id"?, "quantity", "extras": ["Fried plantain", …]?, "note"?}]
 * or a custom line {"name", "unit_price", "quantity", "note"?}. Extras are
 * matched to the dish's extras by name and priced from the menu. With
 * p_send, the new lines go to the kitchen as one ticket (returned).
 */
create function public.restaurant_add_items(p_business_id uuid, p_order_id uuid, p_items jsonb, p_send boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders%rowtype;
  v_item jsonb;
  v_qty integer;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  v_name text;
  v_variant_id uuid;
  v_variant_label text;
  v_price numeric(14, 2);
  v_cost numeric(14, 2);
  v_sku text;
  v_extras jsonb;
  v_wanted text;
  v_extra jsonb;
  v_note text;
  v_id uuid;
  v_ids uuid[] := '{}';
begin
  if not public._restaurant_writer(p_business_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'add between 1 and 50 dishes' using errcode = '22023';
  end if;
  select * into o from public.orders where id = p_order_id and business_id = p_business_id for update;
  if not found or o.service_type is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if o.bill_closed_at is not null or o.status in ('cancelled', 'returned', 'delivered') then
    raise exception 'this order is closed' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item ->> 'quantity')::integer, 1);
    if v_qty < 1 or v_qty > 999 then
      raise exception 'quantity must be between 1 and 999' using errcode = '22023';
    end if;
    v_note := nullif(btrim(v_item ->> 'note'), '');
    if char_length(v_note) > 200 then
      raise exception 'note too long' using errcode = '22023';
    end if;
    v_extras := '[]'::jsonb;
    v_variant_id := null;
    v_variant_label := null;
    v_cost := null;
    v_sku := null;
    v_product := null;

    if nullif(v_item ->> 'product_id', '') is not null then
      select * into v_product from public.products
      where id = (v_item ->> 'product_id')::uuid and business_id = p_business_id and active;
      if not found then
        raise exception 'unknown dish' using errcode = '22023';
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
      if jsonb_typeof(v_item -> 'extras') = 'array' then
        -- In the order chosen, each extra once.
        for v_wanted in
          select w from (select lower(btrim(x)) as w, min(n) as n from jsonb_array_elements_text(v_item -> 'extras') with ordinality a (x, n) group by 1) s order by n
        loop
          v_extra := null;
          select e into v_extra from jsonb_array_elements(v_product.extras) e where lower(btrim(e ->> 'name')) = v_wanted;
          if v_extra is null then
            raise exception 'unknown extra for %', v_product.name using errcode = '22023';
          end if;
          v_extras := v_extras || jsonb_build_array(jsonb_build_object('name', v_extra ->> 'name', 'price', (v_extra ->> 'price')::numeric));
          v_price := v_price + (v_extra ->> 'price')::numeric;
        end loop;
      end if;
    else
      v_name := nullif(btrim(v_item ->> 'name'), '');
      v_price := (v_item ->> 'unit_price')::numeric;
      if v_name is null or v_price is null or v_price < 0 then
        raise exception 'custom items need a name and a price' using errcode = '22023';
      end if;
    end if;

    insert into public.order_items (business_id, order_id, product_id, variant_id, product_name, variant, sku, quantity, unit_price, total, unit_cost, extras, note)
    values (p_business_id, o.id, v_product.id, v_variant_id, v_name, v_variant_label, v_sku, v_qty, v_price, v_price * v_qty, v_cost, v_extras, v_note)
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  if o.stock_applied then
    perform public._apply_items_stock(o.id, v_ids, 1);
  end if;
  perform public._restaurant_totals(o.id);
  if p_send then
    return public.restaurant_send_to_kitchen(p_business_id, o.id);
  end if;
  return null;
end;
$$;
revoke execute on function public.restaurant_add_items(uuid, uuid, jsonb, boolean) from public, anon;
grant execute on function public.restaurant_add_items(uuid, uuid, jsonb, boolean) to authenticated, service_role;

/*
 * A new restaurant order: dine-in (an open bill on a free table; may start
 * with no dishes), takeaway or delivery (needs dishes; delivery needs a
 * customer). Staff orders are confirmed and their dishes go to the kitchen;
 * a WhatsApp order (with a conversation) waits as pending for staff to send it.
 */
create function public.restaurant_open_order(
  p_business_id uuid,
  p_service_type text,
  p_items jsonb default '[]'::jsonb,
  p_table_id uuid default null,
  p_customer_id uuid default null,
  p_guests integer default null,
  p_notes text default null,
  p_delivery jsonb default null,
  p_delivery_fee numeric default 0,
  p_conversation_id uuid default null,
  p_client_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_existing uuid;
  v_seq bigint;
  v_currency char(3);
  v_delivery jsonb := coalesce(p_delivery, '{}'::jsonb);
  v_whatsapp boolean := p_conversation_id is not null;
begin
  if not public._restaurant_writer(p_business_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_client_key is not null then
    select id into v_existing from public.orders where business_id = p_business_id and client_key = p_client_key;
    if found then
      return v_existing;
    end if;
  end if;
  if p_service_type not in ('dine_in', 'takeaway', 'delivery') then
    raise exception 'invalid service type' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or (p_service_type <> 'dine_in' and jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0) then
    raise exception 'an order needs at least one dish' using errcode = '22023';
  end if;
  if p_service_type = 'dine_in' then
    if v_whatsapp then
      raise exception 'dine-in orders are taken at the restaurant' using errcode = '22023';
    end if;
    if p_table_id is null or not exists (select 1 from public.restaurant_tables where id = p_table_id and business_id = p_business_id and active) then
      raise exception 'unknown table' using errcode = '22023';
    end if;
    if exists (select 1 from public.orders where table_id = p_table_id and service_type = 'dine_in' and bill_closed_at is null and status not in ('cancelled', 'returned')) then
      raise exception 'this table already has an open bill' using errcode = '23505';
    end if;
  elsif p_table_id is not null then
    raise exception 'only dine-in orders have a table' using errcode = '22023';
  end if;
  if p_service_type = 'delivery' and p_customer_id is null then
    raise exception 'a delivery needs a customer' using errcode = '22023';
  end if;
  if p_customer_id is not null and not exists (select 1 from public.customers where id = p_customer_id and business_id = p_business_id) then
    raise exception 'unknown customer' using errcode = '22023';
  end if;
  if v_whatsapp and not exists (select 1 from public.conversations where id = p_conversation_id and business_id = p_business_id and customer_id = p_customer_id) then
    raise exception 'unknown conversation' using errcode = '22023';
  end if;
  if coalesce(p_delivery_fee, 0) < 0 or jsonb_typeof(v_delivery) <> 'object' then
    raise exception 'invalid delivery details' using errcode = '22023';
  end if;

  select currency into v_currency from public.businesses where id = p_business_id;
  insert into public.business_counters (business_id) values (p_business_id) on conflict do nothing;
  update public.business_counters set order_seq = order_seq + 1 where business_id = p_business_id returning order_seq into v_seq;

  insert into public.orders (id, business_id, customer_id, conversation_id, order_number, currency, status, notes, created_by,
                             stock_managed, stock_applied, channel, client_key, service_type, table_id, guests, delivery_fee, total,
                             delivery_method, delivery_address, recipient_name, recipient_phone, delivery_notes)
  values (v_order_id, p_business_id, p_customer_id, p_conversation_id, public.format_reference('ORD', v_seq, 5), v_currency,
          case when v_whatsapp then 'pending' else 'confirmed' end, nullif(btrim(p_notes), ''), (select auth.uid()),
          true, true, case when v_whatsapp then 'whatsapp' else 'pos' end, p_client_key, p_service_type, p_table_id, p_guests,
          case when p_service_type = 'delivery' then coalesce(p_delivery_fee, 0) else 0 end,
          case when p_service_type = 'delivery' then coalesce(p_delivery_fee, 0) else 0 end,
          case p_service_type when 'delivery' then 'delivery' when 'takeaway' then 'pickup' end,
          nullif(btrim(v_delivery ->> 'address'), ''), nullif(btrim(v_delivery ->> 'recipient_name'), ''),
          nullif(btrim(v_delivery ->> 'recipient_phone'), ''), nullif(btrim(v_delivery ->> 'notes'), ''));

  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 0 then
    perform public.restaurant_add_items(p_business_id, v_order_id, p_items, not v_whatsapp);
  else
    perform public._restaurant_totals(v_order_id);
  end if;
  return v_order_id;
end;
$$;
revoke execute on function public.restaurant_open_order(uuid, text, jsonb, uuid, uuid, integer, text, jsonb, numeric, uuid, uuid) from public, anon;
grant execute on function public.restaurant_open_order(uuid, text, jsonb, uuid, uuid, integer, text, jsonb, numeric, uuid, uuid) to authenticated, service_role;

/*
 * Takes a line off an open order (a mistake, a dish the customer no longer
 * wants): agents while the kitchen hasn't started it, owners/admins until the
 * bill closes. Stock comes back; never below what was already paid. Audited.
 */
create function public.restaurant_remove_item(p_business_id uuid, p_item_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.order_items%rowtype;
  o public.orders%rowtype;
  v_ticket_status text;
begin
  if not public.has_min_role(p_business_id, 'agent') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'a reason is needed' using errcode = '22023';
  end if;
  select * into i from public.order_items where id = p_item_id and business_id = p_business_id;
  if not found then
    raise exception 'line not found' using errcode = 'P0002';
  end if;
  select * into o from public.orders where id = i.order_id for update;
  if o.service_type is null or o.bill_closed_at is not null or o.status in ('cancelled', 'returned', 'delivered') then
    raise exception 'this order is closed' using errcode = '22023';
  end if;
  select status into v_ticket_status from public.kitchen_tickets where id = i.ticket_id;
  if coalesce(v_ticket_status, 'new') not in ('new', 'cancelled') and not public.has_min_role(p_business_id, 'admin') then
    raise exception 'the kitchen has started it: an owner or admin can remove it' using errcode = '42501';
  end if;
  if (select count(*) from public.order_items where order_id = o.id) = 1 and o.service_type <> 'dine_in' then
    raise exception 'cancel the order instead' using errcode = '22023';
  end if;
  if o.stock_applied then
    perform public._apply_items_stock(o.id, array[i.id], -1);
  end if;
  delete from public.order_items where id = i.id;
  perform public._restaurant_totals(o.id);
  if (select total from public.orders where id = o.id) < o.amount_paid - o.amount_refunded then
    raise exception 'more has been paid than the new total: refund first' using errcode = '22023';
  end if;
  if i.ticket_id is not null and not exists (select 1 from public.order_items where ticket_id = i.ticket_id) then
    update public.kitchen_tickets set status = 'cancelled' where id = i.ticket_id;
  end if;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, (select auth.uid()), 'order.item_removed', 'order', o.id::text,
          jsonb_build_object('item', i.product_name, 'quantity', i.quantity, 'total', i.total, 'reason', btrim(p_reason)));
end;
$$;
revoke execute on function public.restaurant_remove_item(uuid, uuid, text) from public, anon;
grant execute on function public.restaurant_remove_item(uuid, uuid, text) to authenticated;

/* Closes a bill once it is paid in full: the order is complete, the table is free. */
create function public.restaurant_close_bill(p_business_id uuid, p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders%rowtype;
begin
  if not public.has_min_role(p_business_id, 'agent') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into o from public.orders where id = p_order_id and business_id = p_business_id for update;
  if not found or o.service_type is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if o.bill_closed_at is not null or o.status in ('cancelled', 'returned') then
    raise exception 'this order is closed' using errcode = '22023';
  end if;
  if not exists (select 1 from public.order_items where order_id = o.id) then
    raise exception 'the bill is empty: cancel it instead' using errcode = '22023';
  end if;
  if o.balance_due > 0 then
    raise exception 'the bill is not paid in full' using errcode = 'WB440';
  end if;
  update public.kitchen_tickets set status = 'served', served_at = coalesce(served_at, now()) where order_id = o.id and status in ('new', 'preparing', 'ready');
  update public.orders set bill_closed_at = now(), status = 'delivered' where id = o.id;
end;
$$;
revoke execute on function public.restaurant_close_bill(uuid, uuid) from public, anon;
grant execute on function public.restaurant_close_bill(uuid, uuid) to authenticated;

/*
 * Kitchen: a ticket moves new → preparing → ready → served (kitchen staff or
 * any staff). Staff may cancel a ticket the kitchen hasn't started. When every
 * ticket of a takeaway or delivery order is ready, the order is ready.
 */
create function public.set_ticket_status(p_ticket_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.kitchen_tickets%rowtype;
  o public.orders%rowtype;
  v_order text[] := array['new', 'preparing', 'ready', 'served'];
begin
  select * into t from public.kitchen_tickets where id = p_ticket_id for update;
  if not found or not public.can_use_kitchen(t.business_id) then
    raise exception 'ticket not found' using errcode = 'P0002';
  end if;
  if p_status = 'cancelled' then
    if t.status <> 'new' or not public.has_min_role(t.business_id, 'agent') then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  elsif p_status is null or array_position(v_order, p_status) is null or t.status = 'cancelled'
        or array_position(v_order, p_status) <> array_position(v_order, t.status) + 1 then
    raise exception 'invalid status change' using errcode = '22023';
  end if;
  update public.kitchen_tickets
  set status = p_status,
      started_at = case when p_status = 'preparing' then now() else started_at end,
      ready_at = case when p_status = 'ready' then now() else ready_at end,
      served_at = case when p_status = 'served' then now() else served_at end
  where id = t.id;

  select * into o from public.orders where id = t.order_id;
  if o.service_type in ('takeaway', 'delivery') and o.status = 'processing'
     and not exists (select 1 from public.kitchen_tickets where order_id = o.id and status in ('new', 'preparing')) then
    update public.orders set status = 'ready' where id = o.id;
  end if;
end;
$$;
revoke execute on function public.set_ticket_status(uuid, text) from public, anon;
grant execute on function public.set_ticket_status(uuid, text) to authenticated;

/*
 * The kitchen screen: open tickets (new, preparing, ready), oldest first, with
 * dishes, quantities, extras, notes, the table or service type and the order
 * number. No prices, customers or anything else.
 */
create function public.kitchen_queue(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_use_kitchen(p_business_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'seq', t.seq, 'status', t.status, 'createdAt', t.created_at, 'startedAt', t.started_at, 'readyAt', t.ready_at,
      'orderNumber', o.order_number, 'serviceType', o.service_type, 'table', rt.name,
      'items', (select coalesce(jsonb_agg(jsonb_build_object(
                  'name', i.product_name, 'variant', i.variant, 'quantity', i.quantity,
                  'extras', (select coalesce(jsonb_agg(e ->> 'name'), '[]'::jsonb) from jsonb_array_elements(i.extras) e),
                  'note', i.note) order by i.product_name), '[]'::jsonb)
                from public.order_items i where i.ticket_id = t.id)
    ) order by t.created_at)
    from public.kitchen_tickets t
    join public.orders o on o.id = t.order_id
    left join public.restaurant_tables rt on rt.id = o.table_id
    where t.business_id = p_business_id and t.status in ('new', 'preparing', 'ready')
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.kitchen_queue(uuid) from public, anon;
grant execute on function public.kitchen_queue(uuid) to authenticated;
