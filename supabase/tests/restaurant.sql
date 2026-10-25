-- WazaBolt Restaurants: tables and open bills, dish extras priced from the menu,
-- kitchen tickets and the Kitchen role (kitchen screen only), removing lines,
-- split payments and closing, takeaway/delivery, WhatsApp orders, tenants.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/restaurant.sql
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-a965-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'resto-owner@test.local', '{"business_name":"Chez Mama"}', now(), now()),
  ('00000000-0000-4000-a965-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'resto-waiter@test.local', '{"business_name":"Waiter Own"}', now(), now()),
  ('00000000-0000-4000-a965-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'resto-cook@test.local', '{"business_name":"Cook Own"}', now(), now()),
  ('00000000-0000-4000-a965-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'resto-other@test.local', '{"business_name":"Other Resto"}', now(), now());
create temp table ids on commit drop as
select (select business_id from public.business_members where user_id = '00000000-0000-4000-a965-00000000000a') as biz,
       (select business_id from public.business_members where user_id = '00000000-0000-4000-a965-00000000000c') as other;
update public.businesses set free_limits_from = '2099-01-01' where id in (select biz from ids union select other from ids);
insert into public.business_members (business_id, user_id, role) select biz, '00000000-0000-4000-a965-00000000000b', 'agent' from ids;
insert into public.business_members (business_id, user_id, role) select biz, '00000000-0000-4000-a965-00000000000d', 'kitchen' from ids;
insert into public.customers (business_id, whatsapp_phone, name) select biz, '237670000965', 'Client Resto' from ids;
create temp table t (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated, service_role;
grant all on t to authenticated, service_role;

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.v(k text) returns uuid language sql as $$ select v from t where k = $1 $$;

set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a965-00000000000a');

-- Owner: module, tables, a menu with extras.
do $$
declare
  b uuid := (select biz from ids);
  p uuid;
begin
  perform public.set_business_module(b, 'restaurant', true);
  insert into public.restaurant_tables (business_id, name, area, seats) values (b, 'Table 1', 'Terrasse', 4);
  insert into public.restaurant_tables (business_id, name, seats) values (b, 'Table 2', 2);
  insert into t select 't1', id from public.restaurant_tables where business_id = b and name = 'Table 1';
  insert into t select 't2', id from public.restaurant_tables where business_id = b and name = 'Table 2';
  begin
    insert into public.restaurant_tables (business_id, name) values (b, ' table 1 ');
    raise exception 'FAIL: duplicate table name';
  exception when unique_violation then null;
  end;
  insert into public.products (business_id, name, price, extras) values
    (b, 'Poulet DG', 5000, '[{"name":"Plantain frit","price":500},{"name":"Piment","price":0}]') returning id into p;
  insert into t values ('poulet', p);
  insert into public.products (business_id, name, price, stock_quantity) values (b, 'Jus de bissap', 1000, 10) returning id into p;
  insert into t values ('jus', p);
  begin
    update public.products set extras = '[{"name":"A","price":-1}]' where id = pg_temp.v('poulet');
    raise exception 'FAIL: negative extra accepted';
  exception when check_violation then null;
  end;
  begin
    update public.products set extras = '[{"name":"A","price":1},{"name":"a","price":2}]' where id = pg_temp.v('poulet');
    raise exception 'FAIL: duplicate extra accepted';
  exception when check_violation then null;
  end;
  raise notice 'PASS owners switch the restaurant module on, set up tables and dishes with priced extras (checked)';
end $$;

-- The waiter opens a bill on Table 1: extras priced from the menu, the round goes to the kitchen.
select pg_temp.as_user('00000000-0000-4000-a965-00000000000b');
do $$
declare
  b uuid := (select biz from ids);
  o uuid;
  r record;
begin
  o := public.restaurant_open_order(b, 'dine_in',
         jsonb_build_array(
           jsonb_build_object('product_id', pg_temp.v('poulet'), 'quantity', 2, 'extras', jsonb_build_array('plantain FRIT', 'Piment'), 'unit_price', 1),
           jsonb_build_object('product_id', pg_temp.v('jus'), 'quantity', 3, 'note', 'bien frais')),
         pg_temp.v('t1'), null, 3);
  insert into t values ('bill', o);
  select * into r from public.orders where id = o;
  if r.total <> 14000 or r.status <> 'processing' or r.service_type <> 'dine_in' or r.table_id <> pg_temp.v('t1') or r.guests <> 3 or r.channel <> 'pos' then
    raise exception 'FAIL: bill %', row_to_json(r);
  end if;
  if (select unit_price from public.order_items where order_id = o and product_id = pg_temp.v('poulet')) <> 5500
     or (select extras from public.order_items where order_id = o and product_id = pg_temp.v('poulet')) <> '[{"name":"Plantain frit","price":500},{"name":"Piment","price":0}]'::jsonb then
    raise exception 'FAIL: extras priced from the menu';
  end if;
  if (select stock_quantity from public.products where id = pg_temp.v('jus')) <> 7 then raise exception 'FAIL: stock'; end if;
  if (select count(*) from public.kitchen_tickets where order_id = o) <> 1 or exists (select 1 from public.order_items where order_id = o and ticket_id is null) then
    raise exception 'FAIL: first round ticket';
  end if;
  raise notice 'PASS a waiter opens a bill on a table: extras priced from the menu (not the client), stock taken, the round goes to the kitchen';

  begin
    perform public.restaurant_open_order(b, 'dine_in', '[]', pg_temp.v('t1'));
    raise exception 'FAIL: second open bill on the table';
  exception when unique_violation then null;
  end;
  begin
    perform public.restaurant_add_items(b, o, jsonb_build_array(jsonb_build_object('product_id', pg_temp.v('poulet'), 'extras', jsonb_build_array('Frites'))));
    raise exception 'FAIL: unknown extra';
  exception when sqlstate '22023' then null;
  end;
  -- Second round.
  perform public.restaurant_add_items(b, o, jsonb_build_array(jsonb_build_object('product_id', pg_temp.v('jus'), 'quantity', 1)));
  if (select total from public.orders where id = o) <> 15000 or (select count(*) from public.kitchen_tickets where order_id = o) <> 2 then
    raise exception 'FAIL: second round';
  end if;
  insert into t select 'ticket1', id from public.kitchen_tickets where order_id = o and seq = 1;
  insert into t select 'ticket2', id from public.kitchen_tickets where order_id = o and seq = 2;
  raise notice 'PASS one open bill per table; unknown extras refused; a second round becomes a second ticket';
end $$;

-- The cook: the kitchen screen only.
select pg_temp.as_user('00000000-0000-4000-a965-00000000000d');
do $$
declare
  b uuid := (select biz from ids);
  q jsonb;
begin
  q := public.kitchen_queue(b);
  if jsonb_array_length(q) <> 2 or q -> 0 ->> 'table' <> 'Table 1' or q -> 0 -> 'items' -> 1 ->> 'name' <> 'Poulet DG'
     or q -> 0 -> 'items' -> 1 -> 'extras' <> '["Plantain frit", "Piment"]'::jsonb or q -> 0 -> 'items' -> 0 ->> 'note' <> 'bien frais' then
    raise exception 'FAIL: queue %', q;
  end if;
  if q::text ~ '(price|total|customer|5500|15000)' then raise exception 'FAIL: the queue shows money or customers: %', q; end if;
  if (select count(*) from public.orders) + (select count(*) from public.customers) + (select count(*) from public.products)
     + (select count(*) from public.order_items) + (select count(*) from public.restaurant_tables) + (select count(*) from public.kitchen_tickets) <> 0 then
    raise exception 'FAIL: the cook reads business data';
  end if;
  begin
    perform public.set_ticket_status(pg_temp.v('ticket1'), 'ready');
    raise exception 'FAIL: skipped preparing';
  exception when sqlstate '22023' then null;
  end;
  perform public.set_ticket_status(pg_temp.v('ticket1'), 'preparing');
  perform public.set_ticket_status(pg_temp.v('ticket1'), 'ready');
  begin
    perform public.set_ticket_status(pg_temp.v('ticket2'), 'cancelled');
    raise exception 'FAIL: the cook cancelled a ticket';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.restaurant_add_items(b, pg_temp.v('bill'), jsonb_build_array(jsonb_build_object('product_id', pg_temp.v('jus'))));
    raise exception 'FAIL: the cook added to a bill';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS the cook sees tickets (dishes, extras, notes, table) — no prices, customers or other data — and moves them new → preparing → ready, in order';
end $$;

-- Removing lines, paying in two parts, closing.
select pg_temp.as_user('00000000-0000-4000-a965-00000000000b');
do $$
declare
  b uuid := (select biz from ids);
  o uuid := pg_temp.v('bill');
  jus2 uuid := (select id from public.order_items where ticket_id = pg_temp.v('ticket2'));
  poulet uuid := (select id from public.order_items where order_id = pg_temp.v('bill') and product_id = pg_temp.v('poulet'));
begin
  begin
    perform public.restaurant_remove_item(b, poulet, 'Erreur de saisie');
    raise exception 'FAIL: waiter removed a dish the kitchen made';
  exception when insufficient_privilege then null;
  end;
  perform public.restaurant_remove_item(b, jus2, 'Le client a changé d''avis');
  if (select total from public.orders where id = o) <> 14000 or (select stock_quantity from public.products where id = pg_temp.v('jus')) <> 7
     or (select status from public.kitchen_tickets where id = pg_temp.v('ticket2')) <> 'cancelled' then
    raise exception 'FAIL: remove line';
  end if;
  begin
    perform public.restaurant_close_bill(b, o);
    raise exception 'FAIL: closed unpaid';
  exception when sqlstate 'WB440' then null;
  end;
  perform public.record_order_payment(b, o, 9000, 'cash');
  perform public.record_order_payment(b, o, 5000, 'mtn_momo', 'MP1');
  perform public.restaurant_close_bill(b, o);
  if (select status || '|' || (bill_closed_at is not null)::text || '|' || payment_status from public.orders where id = o) <> 'delivered|true|paid' then
    raise exception 'FAIL: closed %', (select row_to_json(x) from public.orders x where id = o);
  end if;
  if exists (select 1 from public.kitchen_tickets where order_id = o and status not in ('served', 'cancelled')) then raise exception 'FAIL: tickets left open'; end if;
  begin
    perform public.restaurant_add_items(b, o, jsonb_build_array(jsonb_build_object('product_id', pg_temp.v('jus'))));
    raise exception 'FAIL: added to a closed bill';
  exception when sqlstate '22023' then null;
  end;
  -- The table is free again.
  insert into t values ('bill2', public.restaurant_open_order(b, 'dine_in', '[]', pg_temp.v('t1')));
  raise notice 'PASS lines come off (stock back, audited; started dishes need an admin); a bill closes only when paid in full (split payments); the table frees up';
end $$;

-- Takeaway and delivery.
do $$
declare
  b uuid := (select biz from ids);
  o uuid;
  tk uuid;
begin
  o := public.restaurant_open_order(b, 'takeaway', jsonb_build_array(jsonb_build_object('product_id', pg_temp.v('poulet'), 'quantity', 1)));
  tk := (select id from public.kitchen_tickets where order_id = o);
  perform public.set_ticket_status(tk, 'preparing');
  perform public.set_ticket_status(tk, 'ready');
  if (select status || '|' || delivery_method from public.orders where id = o) <> 'ready|pickup' then raise exception 'FAIL: takeaway ready'; end if;
  begin
    perform public.restaurant_open_order(b, 'delivery', jsonb_build_array(jsonb_build_object('product_id', pg_temp.v('poulet'))));
    raise exception 'FAIL: delivery without a customer';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.restaurant_open_order(b, 'takeaway', '[]');
    raise exception 'FAIL: empty takeaway';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'PASS takeaway orders are ready when the kitchen is done; deliveries need a customer; takeaway needs dishes';
end $$;

-- A WhatsApp order (server): waits as pending until staff send it to the kitchen.
reset role;
set local role service_role;
do $$
declare
  b uuid := (select biz from ids);
  c uuid := (select id from public.customers where business_id = (select biz from ids) and whatsapp_phone = '237670000965');
  conv uuid;
  o uuid;
begin
  if not exists (select 1 from public.audit_logs where business_id = b and action = 'order.item_removed' and metadata ->> 'reason' = 'Le client a changé d''avis') then
    raise exception 'FAIL: removal not audited';
  end if;
  insert into public.conversations (business_id, customer_id) values (b, c) returning id into conv;
  o := public.restaurant_open_order(b, 'delivery', jsonb_build_array(jsonb_build_object('product_id', pg_temp.v('poulet'), 'extras', jsonb_build_array('Piment'), 'note', 'sans oignons')),
                                    null, c, null, null, '{"address":"Mile 6 Nkwen"}', 1000, conv);
  if (select status || '|' || channel || '|' || total::int || '|' || delivery_address from public.orders where id = o) <> 'pending|whatsapp|6000|Mile 6 Nkwen' then
    raise exception 'FAIL: whatsapp order %', (select row_to_json(x) from public.orders x where id = o);
  end if;
  if exists (select 1 from public.kitchen_tickets where order_id = o) then raise exception 'FAIL: sent to the kitchen before staff confirmed'; end if;
  insert into t values ('wa', o);
  begin
    perform public.restaurant_open_order(b, 'dine_in', '[]', pg_temp.v('t2'), c, null, null, null, 0, conv);
    raise exception 'FAIL: dine-in from WhatsApp';
  exception when sqlstate '22023' then null;
  end;
end $$;
reset role;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a965-00000000000b');
do $$
declare
  tk uuid;
begin
  tk := public.restaurant_send_to_kitchen((select biz from ids), pg_temp.v('wa'));
  if tk is null or (select status from public.orders where id = pg_temp.v('wa')) <> 'processing' then
    raise exception 'FAIL: send to kitchen';
  end if;
  if public.restaurant_send_to_kitchen((select biz from ids), pg_temp.v('wa')) is not null then raise exception 'FAIL: sent twice'; end if;
  raise notice 'PASS WhatsApp orders (delivery fee, note, extras) wait for staff; sending them confirms the order; nothing is sent twice';
end $$;

-- Another business.
select pg_temp.as_user('00000000-0000-4000-a965-00000000000c');
do $$
begin
  begin
    perform public.kitchen_queue((select biz from ids));
    raise exception 'FAIL: other business read the kitchen';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.restaurant_add_items((select biz from ids), pg_temp.v('bill2'), jsonb_build_array(jsonb_build_object('product_id', pg_temp.v('jus'))));
    raise exception 'FAIL: other business added to our bill';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_ticket_status((select id from public.kitchen_tickets limit 1), 'served');
    raise exception 'FAIL: other business moved our ticket';
  exception when sqlstate 'P0002' then null;
  end;
  if (select count(*) from public.restaurant_tables) <> 0 then raise exception 'FAIL: other business sees our tables'; end if;
  raise notice 'PASS another business can''t read our kitchen, tables or bills, or change them';
end $$;

-- Kitchen accounts are free seats (not users): a Free restaurant (limits in force) still adds cooks, up to plans.max_kitchen.
reset role;
update public.businesses set free_limits_from = current_date where id = (select other from ids);
update public.plans set max_kitchen = 2 where id = 'free';
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a965-00000000000c');
do $$
declare
  b uuid := (select other from ids);
  e record;
begin
  perform public.create_invitation(b, 'cook1@test.local', 'kitchen', repeat('b', 64));
  perform public.create_invitation(b, 'cook2@test.local', 'kitchen', repeat('c', 64));
  begin
    perform public.create_invitation(b, 'cook3@test.local', 'kitchen', repeat('d', 64));
    raise exception 'FAIL: kitchen account over the cap';
  exception when sqlstate 'WB419' then null;
  end;
  begin
    perform public.create_invitation(b, 'waiter@test.local', 'agent', repeat('e', 64));
    raise exception 'FAIL: a second user on Free';
  exception when sqlstate 'WB413' then null;
  end;
  select * into e from public.business_entitlements(b);
  if e.kitchen_used <> 2 or e.max_kitchen <> 2 or e.teachers_used <> 0 then raise exception 'FAIL: entitlements %', e; end if;
  raise notice 'PASS kitchen accounts don''t use the plan''s users: a Free restaurant invites cooks, up to its kitchen seats (pending invitations count)';
end $$;

-- Our cook (a member) isn't a user either; moving between kitchen and other roles is checked against each group.
reset role;
update public.businesses set free_limits_from = current_date where id = (select biz from ids);
update public.plans set max_kitchen = 1 where id = 'free';
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a965-00000000000a');
do $$
declare
  b uuid := (select biz from ids);
begin
  -- Users: owner + waiter (agent) = 2, over Free's 1 — existing members stay; the cook isn't counted.
  if (select members_used from public.business_plan_limits(b)) <> 2 then raise exception 'FAIL: the cook counted as a user'; end if;
  begin
    perform public.update_member_role(b, '00000000-0000-4000-a965-00000000000b', 'kitchen');
    raise exception 'FAIL: second kitchen account over the cap';
  exception when sqlstate 'WB419' then null;
  end;
  perform public.update_member_role(b, '00000000-0000-4000-a965-00000000000d', 'viewer');
  raise exception 'FAIL: cook became a user over the limit';
exception when sqlstate 'WB413' then
  raise notice 'PASS role changes into and out of the kitchen are checked against the kitchen seats and the users';
end $$;

rollback;
