-- Customers and orders: references, customer ↔ order links, payments (partial, duplicate,
-- dated, voided), returns and refunds, stock, balances, history, isolation, WhatsApp matching.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/customer_orders.sql
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-a940-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'co-owner@test.local', '{"business_name":"CO Shop"}', now(), now()),
  ('00000000-0000-4000-a940-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'co-agent@test.local', '{"business_name":"Agent Own"}', now(), now()),
  ('00000000-0000-4000-a940-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'co-other@test.local', '{"business_name":"Other CO"}', now(), now());
create temp table ids on commit drop as
select (select business_id from public.business_members where user_id = '00000000-0000-4000-a940-00000000000a') as biz,
       (select business_id from public.business_members where user_id = '00000000-0000-4000-a940-00000000000c') as other;
-- Not testing plan limits here.
update public.businesses set free_limits_from = '2099-01-01' where id in (select biz from ids union select other from ids);
insert into public.business_members (business_id, user_id, role) select biz, '00000000-0000-4000-a940-00000000000b', 'agent' from ids;
create temp table t (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated, service_role;
grant all on t to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- References
-- ---------------------------------------------------------------------------
do $$
begin
  if public.format_reference('ORD', 67, 5) <> 'ORD-00067' or public.format_reference('ORD', 123456, 5) <> 'ORD-123456'
     or public.format_reference('CUS', 1, 6) <> 'CUS-000001' or public.format_reference('CUS', 1234567, 6) <> 'CUS-1234567' then
    raise exception 'FAIL: reference format';
  end if;
  raise notice 'PASS references are zero-padded and never cut (ORD-123456 after ORD-99999)';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a940-00000000000a","role":"authenticated"}', true);
do $$
declare
  b uuid := (select biz from ids);
  c1 uuid; c2 uuid; c3 uuid; c4 uuid;
begin
  -- The app never sends a reference; one given anyway is ignored (and the column can't be written by users).
  insert into public.customers (business_id, whatsapp_phone, name) values (b, '237670100001', 'Brenda Demo') returning id into c1;
  insert into public.customers (business_id, whatsapp_phone, name) values (b, '237670100002', 'Paul Test') returning id into c2;
  insert into public.customers (business_id, whatsapp_phone, name) values (b, '237670100003', 'Paul Test') returning id into c3;
  if (select string_agg(reference, ',' order by reference) from public.customers where business_id = b) <> 'CUS-000001,CUS-000002,CUS-000003' then
    raise exception 'FAIL: references %', (select string_agg(reference, ',' order by reference) from public.customers where business_id = b);
  end if;
  if (select count(distinct reference) from public.customers where business_id = b and name = 'Paul Test') <> 2 then
    raise exception 'FAIL: two customers with the same name are told apart';
  end if;
  insert into t values ('brenda', c1), ('paul', c2), ('paul2', c3);
  raise notice 'PASS new customers get CUS-000001, CUS-000002 … automatically; same-name customers keep different references';

  begin
    update public.customers set reference = 'CUS-000099' where id = c1;
    raise exception 'FAIL: a user changed a reference';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS users can''t change a customer reference';

  -- A deleted customer's number is never given again.
  insert into public.customers (business_id, whatsapp_phone, name) values (b, '237670100004', 'Eric Sample') returning id into c4;
  delete from public.customers where id = c4;
  insert into public.customers (business_id, whatsapp_phone, name) values (b, '237670100005', 'Clarisse Demo') returning id into c4;
  if (select reference from public.customers where id = c4) <> 'CUS-000005' then
    raise exception 'FAIL: reference reused (got %)', (select reference from public.customers where id = c4);
  end if;
  insert into t values ('clarisse', c4);
  raise notice 'PASS a deleted customer''s reference is not reused (next is CUS-000005)';

  -- The same number twice is the same customer.
  begin
    insert into public.customers (business_id, whatsapp_phone, name) values (b, '237670100001', 'Brenda again');
    raise exception 'FAIL: duplicate phone accepted';
  exception when unique_violation then null;
  end;
  raise notice 'PASS a phone number already known is refused as a duplicate';
end $$;

-- The service role can't change a reference either.
reset role;
do $$
begin
  if (select customer_seq from public.business_counters where business_id = (select biz from ids)) <> 5 then
    raise exception 'FAIL: the refused duplicate used a number';
  end if;
  update public.customers set reference = 'CUS-000777' where id = (select v from t where k = 'brenda');
  raise exception 'FAIL: reference changed';
exception when invalid_parameter_value then
  raise notice 'PASS references are fixed for good (even for the server)';
end $$;

-- Another business numbers its own customers from 1.
do $$
declare
  c uuid;
begin
  insert into public.customers (business_id, whatsapp_phone, name) select other, '237670100001', 'Brenda elsewhere' from ids returning id into c;
  if (select reference from public.customers where id = c) <> 'CUS-000001' then raise exception 'FAIL: per-business numbering'; end if;
  insert into t values ('other_customer', c);
  raise notice 'PASS each business has its own numbering';
end $$;

-- ---------------------------------------------------------------------------
-- WhatsApp: a sender is matched by number, one reference per customer
-- ---------------------------------------------------------------------------
update public.whatsapp_connections set status = 'connected', phone_number_id = '4401', display_phone_number = '+237 6 99 44 00 01'
where business_id = (select biz from ids);
do $$
declare
  r record;
  r2 record;
  seq bigint := (select customer_seq from public.business_counters where business_id = (select biz from ids));
begin
  select * into r from public.ingest_whatsapp_message('4401', 'wamid.CO1', '237670100009', 'Awa Fictive', 'text', 'Bonjour', null, '{}', now(), 'received');
  select * into r2 from public.ingest_whatsapp_message('4401', 'wamid.CO2', '237670100009', 'Awa', 'text', 'Prix ?', null, '{}', now(), 'received');
  select * into r2 from public.ingest_whatsapp_message('4401', 'wamid.CO3', '237670100009', null, 'text', 'Merci', null, '{}', now(), 'received');
  if r.customer_id <> r2.customer_id or (select count(*) from public.customers where business_id = r.business_id and whatsapp_phone = '237670100009') <> 1 then
    raise exception 'FAIL: one customer per WhatsApp number';
  end if;
  if (select reference from public.customers where id = r.customer_id) <> public.format_reference('CUS', seq + 1, 6)
     or (select customer_seq from public.business_counters where business_id = r.business_id) <> seq + 1 then
    raise exception 'FAIL: WhatsApp customer reference or numbers used by repeat messages';
  end if;
  -- Messages from an existing customer reuse them (Brenda, created by hand).
  select * into r from public.ingest_whatsapp_message('4401', 'wamid.CO4', '237670100001', 'B', 'text', 'Hi', null, '{}', now(), 'received');
  if r.customer_id <> (select v from t where k = 'brenda') then raise exception 'FAIL: existing customer not matched'; end if;
  if (select count(*) from public.messages where conversation_id = r2.conversation_id) <> 3 then raise exception 'FAIL: messages kept on the customer''s conversation'; end if;
  raise notice 'PASS WhatsApp: a sender is matched by number, gets one reference, repeat messages create nothing new';
end $$;

-- ---------------------------------------------------------------------------
-- Orders, payments, balances (as the agent, then the owner)
-- ---------------------------------------------------------------------------
with p as (insert into public.products (business_id, name, sku, price, stock_quantity) select biz, 'Robe wax', 'RW-01', 31000, 10 from ids returning id)
insert into t select 'robe', id from p;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a940-00000000000b","role":"authenticated"}', true);
do $$
declare
  b uuid := (select biz from ids);
  p uuid;
  o uuid;
  pk uuid := gen_random_uuid();
  r record;
begin
  p := (select v from t where k = 'robe');
  o := public.create_order(b, (select v from t where k = 'paul'), jsonb_build_array(jsonb_build_object('product_id', p, 'quantity', 2)),
                           p_delivery => '{"method":"delivery","recipient_name":"Paul","recipient_phone":"+237 670 10 00 02","notes":"Gate 2"}');
  insert into t values ('order', o);
  select * into r from public.orders where id = o;
  if r.customer_id <> (select v from t where k = 'paul') or r.total <> 62000 or r.balance_due <> 62000 or r.payment_status <> 'unpaid'
     or r.delivery_method <> 'delivery' or r.recipient_name <> 'Paul' or r.order_number !~ '^ORD-[0-9]{5,}$' then
    raise exception 'FAIL: order %', row_to_json(r);
  end if;
  if (select sku || ' ' || unit_price from public.order_items where order_id = o) <> 'RW-01 31000.00' then raise exception 'FAIL: SKU and price kept on the item'; end if;
  if (select stock_quantity from public.products where id = p) <> 8 then raise exception 'FAIL: stock taken once'; end if;
  if (select string_agg(coalesce(from_status, '-') || '>' || to_status, ',') from public.order_status_events where order_id = o) <> '->pending' then raise exception 'FAIL: creation in the history'; end if;
  raise notice 'PASS an order links the chosen customer, keeps SKU and price, takes the stock once, records delivery details';

  -- 62,000: 25,000 then 17,000 → 42,000 paid, 20,000 left, partially paid.
  perform public.record_order_payment(b, o, 25000, 'mtn_momo', 'MP123', pk, now() - interval '1 day', 'deposit');
  perform public.record_order_payment(b, o, 25000, 'mtn_momo', 'MP123', pk);
  perform public.record_order_payment(b, o, 17000, 'cash');
  select * into r from public.orders where id = o;
  if r.amount_paid <> 42000 or r.balance_due <> 20000 or r.payment_status <> 'partial' then raise exception 'FAIL: partial payments %', row_to_json(r); end if;
  if (select count(*) from public.order_payments where order_id = o) <> 2 then raise exception 'FAIL: double submit recorded twice'; end if;
  if (select note from public.order_payments where group_id = pk) <> 'deposit' or (select received_at from public.order_payments where group_id = pk) > now() - interval '23 hours' then
    raise exception 'FAIL: payment date and note';
  end if;
  raise notice 'PASS 25,000 + 17,000 on 62,000: paid 42,000, balance 20,000, partially paid; the same form twice is one payment';

  begin
    perform public.record_order_payment(b, o, 20001, 'cash');
    raise exception 'FAIL: overpayment';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.record_order_payment(b, o, 100, 'cash', null, null, now() + interval '2 days');
    raise exception 'FAIL: payment in the future';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'PASS paying more than what is left, or a date in the future, is refused';

  -- Not delivered yet: no debt on the customer, but the deposit counts as paid.
  if (select outstanding from public.customer_stats where customer_id = (select v from t where k = 'paul')) <> 0
     or (select amount_paid from public.customer_stats where customer_id = (select v from t where k = 'paul')) <> 42000 then
    raise exception 'FAIL: customer totals before delivery';
  end if;
  update public.orders set status = 'delivered' where id = o;
  if (select orders_count || ' ' || total_spent || ' ' || amount_paid || ' ' || outstanding from public.customer_stats where customer_id = (select v from t where k = 'paul'))
     <> '1 62000.00 42000.00 20000.00' then
    raise exception 'FAIL: customer totals %', (select row_to_json(s) from public.customer_stats s where customer_id = (select v from t where k = 'paul'));
  end if;
  if (select outstanding from public.customer_stats where customer_id = (select v from t where k = 'paul'))
     <> (select sum(balance_due) from public.orders where customer_id = (select v from t where k = 'paul') and status = 'delivered') then
    raise exception 'FAIL: customer debt = balances of delivered orders';
  end if;
  if (select string_agg(to_status, ',' order by created_at) from public.order_status_events where order_id = o) <> 'pending,delivered'
     or (select changed_by from public.order_status_events where order_id = o and to_status = 'delivered') <> '00000000-0000-4000-a940-00000000000b' then
    raise exception 'FAIL: status history';
  end if;
  if (select last_contact_at from public.customers where id = (select v from t where k = 'paul')) is null then raise exception 'FAIL: order counts as contact'; end if;
  raise notice 'PASS customer totals: 1 purchase, 62,000 spent, 42,000 paid, owes 20,000 = the order''s balance; status history and last contact recorded';

  -- The other same-name customer has none of it.
  if (select orders_count from public.customer_stats where customer_id = (select v from t where k = 'paul2')) <> 0
     or exists (select 1 from public.orders where customer_id = (select v from t where k = 'paul2')) then
    raise exception 'FAIL: orders shown on the wrong customer';
  end if;
  raise notice 'PASS orders stay on their own customer (same name, different customer)';

  -- Agents can't refund or void.
  begin
    perform public.void_payment(b, pk, 'typo');
    raise exception 'FAIL: agent voided';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_order_refund(b, o, 1000, 'cash');
    raise exception 'FAIL: agent refunded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.link_order_customer(b, o, (select v from t where k = 'paul2'));
    raise exception 'FAIL: agent re-linked';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS refunds, voids and linking customers are for owners/admins';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a940-00000000000a","role":"authenticated"}', true);
do $$
declare
  b uuid := (select biz from ids);
  o uuid := (select v from t where k = 'order');
  p uuid := (select v from t where k = 'robe');
  pay uuid;
  ref uuid;
  s uuid;
  r record;
begin
  -- Void the 17,000 cash payment recorded by mistake: kept in the history, amount taken back out.
  select group_id into pay from public.order_payments where order_id = o and amount = 17000;
  perform public.void_payment(b, pay, 'recorded twice by mistake');
  select * into r from public.orders where id = o;
  if r.amount_paid <> 25000 or r.balance_due <> 37000 or r.payment_status <> 'partial' then raise exception 'FAIL: void %', row_to_json(r); end if;
  if (select voided_at is not null and void_reason = 'recorded twice by mistake' and voided_by = '00000000-0000-4000-a940-00000000000a' from public.order_payments where group_id = pay) is not true then
    raise exception 'FAIL: voided payment kept with who and why';
  end if;
  perform public.void_payment(b, pay, 'again');
  if (select amount_paid from public.orders where id = o) <> 25000 then raise exception 'FAIL: voiding twice took it out twice'; end if;
  begin
    perform public.void_payment(b, pay, '');
    raise exception 'FAIL: void without a reason';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'PASS a payment voided by an owner stays in the history (who, when, why) and is taken out once';

  -- Refunds only for cancelled/returned orders.
  begin
    perform public.record_order_refund(b, o, 1000, 'cash');
    raise exception 'FAIL: refund on a delivered order';
  exception when invalid_parameter_value then null;
  end;
  -- A pending order can't be "returned".
  s := public.create_order(b, (select v from t where k = 'brenda'), jsonb_build_array(jsonb_build_object('product_id', p, 'quantity', 1)));
  begin
    update public.orders set status = 'returned' where id = s;
    raise exception 'FAIL: pending order returned';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'PASS refunds are for cancelled or returned orders; only delivered orders can be returned';

  -- The customer brings the goods back: stock back once, no debt, refund part of what they paid.
  update public.orders set status = 'returned' where id = o;
  select * into r from public.orders where id = o;
  if r.balance_due <> 0 or (select stock_quantity from public.products where id = p) <> 9 then raise exception 'FAIL: return % stock %', row_to_json(r), (select stock_quantity from public.products where id = p); end if;
  if (select count(*) from public.stock_movements where order_id = o and reason = 'return') <> 1 then raise exception 'FAIL: one return movement'; end if;
  update public.orders set status = 'returned' where id = o;
  if (select stock_quantity from public.products where id = p) <> 9 then raise exception 'FAIL: stock returned twice'; end if;
  if (select outstanding <> 0 or orders_count <> 0 or total_spent <> 0 from public.customer_stats where customer_id = (select v from t where k = 'paul')) then
    raise exception 'FAIL: returned order still a purchase or a debt';
  end if;
  begin
    perform public.record_order_payment(b, o, 100, 'cash');
    raise exception 'FAIL: payment on a returned order';
  exception when invalid_parameter_value then null;
  end;
  ref := gen_random_uuid();
  perform public.record_order_refund(b, o, 10000, 'orange_money', 'OM9', ref, null, 'part refund');
  perform public.record_order_refund(b, o, 10000, 'orange_money', 'OM9', ref);
  select * into r from public.orders where id = o;
  if r.amount_refunded <> 10000 or r.payment_status <> 'partially_refunded' then raise exception 'FAIL: partial refund %', row_to_json(r); end if;
  if (select amount_paid from public.customer_stats where customer_id = (select v from t where k = 'paul')) <> 15000 then raise exception 'FAIL: money collected net of refunds'; end if;
  begin
    perform public.record_order_refund(b, o, 15001, 'cash');
    raise exception 'FAIL: refund more than paid';
  exception when invalid_parameter_value then null;
  end;
  -- Voiding the payment that was partly refunded is refused until the refund is voided.
  select group_id into pay from public.order_payments where order_id = o and kind = 'payment' and voided_at is null;
  begin
    perform public.void_payment(b, pay, 'mistake');
    raise exception 'FAIL: voided a refunded payment';
  exception when invalid_parameter_value then null;
  end;
  perform public.record_order_refund(b, o, 15000, 'cash');
  if (select payment_status from public.orders where id = o) <> 'refunded' then raise exception 'FAIL: fully refunded'; end if;
  begin
    update public.orders set status = 'delivered' where id = o;
    raise exception 'FAIL: refunded order reopened';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'PASS return: stock back once, no debt, not a purchase; refunds partial then full (refunded), never more than paid, same key once';

  -- Cancelling gives the stock back and leaves no balance.
  update public.orders set status = 'cancelled' where id = s;
  if (select balance_due from public.orders where id = s) <> 0 or (select stock_quantity from public.products where id = p) <> 10 then raise exception 'FAIL: cancel'; end if;
  raise notice 'PASS cancelling: stock back, nothing owed';

  -- Payments ledger = what the orders say.
  if exists (
    select 1 from public.orders o2
    where o2.business_id = b and (
      o2.amount_paid <> coalesce((select sum(amount) from public.order_payments where order_id = o2.id and kind = 'payment' and voided_at is null), 0)
      or o2.amount_refunded <> coalesce((select sum(amount) from public.order_payments where order_id = o2.id and kind = 'refund' and voided_at is null), 0)
      or o2.subtotal <> coalesce((select sum(total) from public.order_items where order_id = o2.id), 0)
      or o2.total <> o2.subtotal + o2.delivery_fee - o2.discount)
  ) then
    raise exception 'FAIL: orders and ledgers disagree';
  end if;
  raise notice 'PASS every order adds up: items = subtotal, payments and refunds = what was paid and refunded';

  -- A walk-in sale (no customer) can be linked to the right customer once.
  s := public.create_sale(b, gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id', p, 'quantity', 1)), null, 0,
                          jsonb_build_array(jsonb_build_object('amount', 31000, 'method', 'cash')));
  if (select customer_id from public.orders where id = s) is not null then raise exception 'FAIL: walk-in sale has no customer'; end if;
  begin
    perform public.link_order_customer(b, s, (select v from t where k = 'other_customer'));
    raise exception 'FAIL: linked another business''s customer';
  exception when invalid_parameter_value then null;
  end;
  perform public.link_order_customer(b, s, (select v from t where k = 'clarisse'));
  if (select customer_id from public.orders where id = s) <> (select v from t where k = 'clarisse')
     or (select customer_id from public.order_payments where order_id = s) <> (select v from t where k = 'clarisse')
     or (select orders_count from public.customer_stats where customer_id = (select v from t where k = 'clarisse')) <> 1 then
    raise exception 'FAIL: link customer';
  end if;
  begin
    perform public.link_order_customer(b, s, (select v from t where k = 'brenda'));
    raise exception 'FAIL: re-linked';
  exception when invalid_parameter_value then null;
  end;
  if not exists (select 1 from public.audit_logs where business_id = b and action = 'order.customer_linked' and entity_id = s::text) then raise exception 'FAIL: audit'; end if;
  raise notice 'PASS a walk-in sale can be linked to a customer of the business once (audited), never re-linked';

  -- Recorded payments can't be edited directly.
  begin
    update public.order_payments set amount = 1 where order_id = s;
    raise exception 'FAIL: payment edited';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.order_payments where order_id = s;
    if exists (select 1 from public.order_payments where order_id = s) then null; else raise exception 'FAIL: payment deleted'; end if;
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS payments can''t be edited or deleted by users (void with a reason instead)';
end $$;

-- ---------------------------------------------------------------------------
-- Isolation
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a940-00000000000c","role":"authenticated"}', true);
do $$
declare
  b uuid := (select biz from ids);
  o uuid := (select v from t where k = 'order');
begin
  if exists (select 1 from public.orders where id = o) or exists (select 1 from public.order_status_events where order_id = o)
     or exists (select 1 from public.order_payments where order_id = o) or exists (select 1 from public.customers where business_id = b) then
    raise exception 'FAIL: another business sees the orders or customers';
  end if;
  begin
    perform public.record_order_payment(b, o, 100, 'cash');
    raise exception 'FAIL: payment on another business''s order';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_order((select other from ids), (select v from t where k = 'paul'), jsonb_build_array(jsonb_build_object('name', 'X', 'unit_price', 100, 'quantity', 1)));
    raise exception 'FAIL: order for another business''s customer';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'PASS other businesses see none of it and can''t attach another business''s customer to an order';
end $$;

-- The server (service role, e.g. the WhatsApp assistant) can't create an order without a customer either.
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
begin
  perform public.create_order((select biz from ids), null, jsonb_build_array(jsonb_build_object('name', 'X', 'unit_price', 100, 'quantity', 1)));
  raise exception 'FAIL: order without a customer';
exception when invalid_parameter_value then
  raise notice 'PASS an order (other than a till sale) always has a customer';
end $$;

rollback;
