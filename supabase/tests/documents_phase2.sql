-- WazaBolt Docs (Phase 2): invoices from orders, payments against invoices,
-- receipts only from recorded payments, roles and tenant isolation.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/documents_phase2.sql
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-a961-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p2-owner@test.local', '{"business_name":"P2 Shop"}', now(), now()),
  ('00000000-0000-4000-a961-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p2-agent@test.local', '{"business_name":"P2 Agent Own"}', now(), now()),
  ('00000000-0000-4000-a961-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p2-viewer@test.local', '{"business_name":"P2 Viewer Own"}', now(), now()),
  ('00000000-0000-4000-a961-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p2-other@test.local', '{"business_name":"P2 Other"}', now(), now());
create temp table ids on commit drop as
select (select business_id from public.business_members where user_id = '00000000-0000-4000-a961-00000000000a') as biz,
       (select business_id from public.business_members where user_id = '00000000-0000-4000-a961-00000000000c') as other;
update public.businesses set free_limits_from = '2099-01-01' where id in (select biz from ids union select other from ids);
insert into public.business_members (business_id, user_id, role) select biz, '00000000-0000-4000-a961-00000000000b', 'agent' from ids;
insert into public.business_members (business_id, user_id, role) select biz, '00000000-0000-4000-a961-00000000000d', 'viewer' from ids;
create temp table t (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated, service_role;
grant all on t to authenticated, service_role;

-- A customer and an order: 2 × 15 000 + 1 × 5 000, delivery 2 000, discount 1 000 → 36 000.
insert into public.customers (business_id, whatsapp_phone, name, city) select biz, '237670000961', 'Brenda Tabi', 'Douala' from ids;
insert into t select 'cust', id from public.customers where business_id = (select biz from ids) and whatsapp_phone = '237670000961';
insert into public.orders (business_id, customer_id, order_number, status, subtotal, delivery_fee, discount, total, delivery_address)
select biz, (select v from t where k = 'cust'), 'ORD-P2-1', 'confirmed', 35000, 2000, 1000, 36000, 'Akwa, Douala' from ids;
insert into t select 'order', id from public.orders where order_number = 'ORD-P2-1';
insert into public.order_items (business_id, order_id, product_name, variant, quantity, unit_price, total)
select biz, (select v from t where k = 'order'), 'Robe wax', 'Rouge / M', 2, 15000, 30000 from ids;
insert into public.order_items (business_id, order_id, product_name, quantity, unit_price, total)
select biz, (select v from t where k = 'order'), 'Foulard', 1, 5000, 5000 from ids;
-- A second, cancelled order.
insert into public.orders (business_id, customer_id, order_number, status, subtotal, total)
select biz, (select v from t where k = 'cust'), 'ORD-P2-2', 'cancelled', 1000, 1000 from ids;
insert into public.order_items (business_id, order_id, product_name, quantity, unit_price, total)
select business_id, id, 'Perles', 1, 1000, 1000 from public.orders where order_number = 'ORD-P2-2';

create function pg_temp.biz_snapshot() returns jsonb language sql as $$ select '{"name":"P2 Shop","phone":"+237600000000"}'::jsonb $$;
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a961-00000000000b');

-- Agent: an invoice from the order.
do $$
declare
  d public.documents;
begin
  d := public.create_order_invoice((select v from t where k = 'order'), pg_temp.biz_snapshot(), null, 'fr');
  if d.status <> 'issued' or d.number <> 'INV-' || extract(year from current_date) || '-000001' then raise exception 'FAIL: order invoice %/%', d.status, d.number; end if;
  if d.total <> 36000 or d.subtotal <> 37000 or d.discount <> 1000 or jsonb_array_length(d.items) <> 3 then raise exception 'FAIL: order invoice totals % % % %', d.total, d.subtotal, d.discount, d.items; end if;
  if d.items -> 2 ->> 'description' <> 'Livraison' or d.items -> 0 ->> 'details' <> 'Rouge / M' then raise exception 'FAIL: order invoice lines %', d.items; end if;
  if d.customer_snapshot ->> 'name' <> 'Brenda Tabi' or d.customer_snapshot ->> 'address' <> 'Akwa, Douala' or d.customer_snapshot ->> 'phone' <> '+237670000961' then
    raise exception 'FAIL: order invoice customer %', d.customer_snapshot;
  end if;
  if d.related ->> 'number' <> 'ORD-P2-1' or d.order_id <> (select v from t where k = 'order') then raise exception 'FAIL: order link'; end if;
  insert into t values ('oinv', d.id);
  raise notice 'PASS staff make an issued invoice from an order: lines, delivery, discount, customer and total from the order';

  begin
    perform public.create_order_invoice((select v from t where k = 'order'), pg_temp.biz_snapshot());
    raise exception 'FAIL: second invoice for the order';
  exception when sqlstate 'WB420' then null;
  end;
  begin
    perform public.create_order_invoice((select id from public.orders where order_number = 'ORD-P2-2'), pg_temp.biz_snapshot());
    raise exception 'FAIL: invoice for a cancelled order';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'PASS one live invoice per order; none for a cancelled order';
end $$;

-- Payments on the order's invoice are order payments; the invoice follows the order.
do $$
declare
  g uuid;
  inv uuid := (select v from t where k = 'oinv');
begin
  g := public.record_invoice_payment(inv, 10000, 'mtn_momo', 'MP2401', '00000000-0000-4000-a961-0000000000f1');
  if (select amount_paid from public.orders where id = (select v from t where k = 'order')) <> 10000 then raise exception 'FAIL: order not paid'; end if;
  if (select status || ' ' || amount_paid from public.documents where id = inv) <> 'partially_paid 10000.00' then raise exception 'FAIL: invoice partially paid: %', (select status || ' ' || amount_paid from public.documents where id = inv); end if;
  -- Same key: recorded once.
  perform public.record_invoice_payment(inv, 10000, 'mtn_momo', 'MP2401', '00000000-0000-4000-a961-0000000000f1');
  if (select amount_paid from public.orders where id = (select v from t where k = 'order')) <> 10000 then raise exception 'FAIL: double payment'; end if;
  -- Recorded on the order: the invoice moves too.
  perform public.record_order_payment((select biz from ids), (select v from t where k = 'order'), 20000, 'cash');
  if (select status || ' ' || amount_paid from public.documents where id = inv) <> 'partially_paid 30000.00' then raise exception 'FAIL: order payment not on invoice'; end if;
  begin
    perform public.record_invoice_payment(inv, 7000, 'cash');
    raise exception 'FAIL: overpaid';
  exception when sqlstate '22023' then null;
  end;
  insert into t select 'opay1', id from public.order_payments where group_id = g;
  raise notice 'PASS payments on an order''s invoice are order payments (once per key, never more than owed); the invoice becomes partly paid';
end $$;

-- Receipts from recorded order payments (agent).
do $$
declare
  r public.documents;
  r2 public.documents;
begin
  r := public.create_payment_receipt('order', (select v from t where k = 'opay1'), pg_temp.biz_snapshot());
  if r.status <> 'issued' or r.number not like 'REC-%-000001' or r.total <> 10000 or r.amount_paid <> 10000 or r.payment_method <> 'mtn_momo' or r.payment_reference <> 'MP2401' then
    raise exception 'FAIL: receipt %', row_to_json(r);
  end if;
  if r.related ->> 'kind' <> 'invoice' or r.related ->> 'number' <> (select number from public.documents where id = (select v from t where k = 'oinv'))
     or (r.related ->> 'paidToDate')::numeric <> 10000 or (r.related ->> 'balance')::numeric <> 26000 or r.invoice_id <> (select v from t where k = 'oinv') then
    raise exception 'FAIL: receipt related %', r.related;
  end if;
  if r.items -> 0 ->> 'description' not like 'Paiement — facture INV-%' then raise exception 'FAIL: receipt line %', r.items; end if;
  r2 := public.create_payment_receipt('order', (select v from t where k = 'opay1'), pg_temp.biz_snapshot());
  if r2.id <> r.id then raise exception 'FAIL: second receipt for one payment'; end if;
  insert into t values ('orec', r.id);
  raise notice 'PASS a receipt is made from a recorded payment (amount, method, reference; invoice, paid to date, balance), once per payment';
end $$;

-- A payment with a live receipt can't be voided; standalone receipts still need an owner/admin.
select pg_temp.as_user('00000000-0000-4000-a961-00000000000a');
do $$
declare
  g uuid := (select group_id from public.order_payments where id = (select v from t where k = 'opay1'));
begin
  begin
    perform public.void_payment((select biz from ids), g, 'wrong amount');
    raise exception 'FAIL: voided a payment with a receipt';
  exception when sqlstate 'WB420' then null;
  end;
  perform public.void_document((select v from t where k = 'orec'), 'payment was wrong');
  perform public.void_payment((select biz from ids), g, 'wrong amount');
  if (select status || ' ' || amount_paid from public.documents where id = (select v from t where k = 'oinv')) <> 'partially_paid 20000.00' then raise exception 'FAIL: void not on invoice'; end if;
  begin
    perform public.create_payment_receipt('order', (select v from t where k = 'opay1'), pg_temp.biz_snapshot());
    raise exception 'FAIL: receipt for a voided payment';
  exception when sqlstate 'WB420' then null;
  end;
  -- Paid in full.
  perform public.record_invoice_payment((select v from t where k = 'oinv'), 16000, 'cash');
  if (select status from public.documents where id = (select v from t where k = 'oinv')) <> 'paid' then raise exception 'FAIL: paid'; end if;
  begin
    perform public.record_invoice_payment((select v from t where k = 'oinv'), 1, 'cash');
    raise exception 'FAIL: payment on a paid order';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'PASS voiding a payment needs its receipt voided first, and takes it off the invoice; no receipt for a voided payment; paid in full = paid';
end $$;

-- A standalone invoice: invoice_payments.
do $$
declare
  inv uuid;
  p1 uuid;
  p2 uuid;
  r public.documents;
begin
  insert into public.documents (business_id, doc_type, business_snapshot, customer_snapshot, customer_id, items, subtotal, total, created_by)
  values ((select biz from ids), 'invoice', pg_temp.biz_snapshot(), '{"name":"Brenda Tabi"}', (select v from t where k = 'cust'),
          '[{"description":"Couture","quantity":1,"unitPrice":50000}]', 50000, 50000, '00000000-0000-4000-a961-00000000000a')
  returning id into inv;
  begin
    perform public.record_invoice_payment(inv, 1000, 'cash');
    raise exception 'FAIL: payment on a draft';
  exception when sqlstate 'WB420' then null;
  end;
  perform public.issue_document(inv);
  p1 := public.record_invoice_payment(inv, 20000, 'orange_money', 'OM-77', null, now() - interval '1 hour');
  p2 := public.record_invoice_payment(inv, 10000, 'cheque', 'CHQ 12');
  if (select status || ' ' || amount_paid from public.documents where id = inv) <> 'partially_paid 30000.00' then raise exception 'FAIL: standalone partial'; end if;
  if (select count(*) from public.invoice_payments where document_id = inv and customer_id = (select v from t where k = 'cust')) <> 2 then raise exception 'FAIL: payments rows'; end if;
  begin
    perform public.record_invoice_payment(inv, 20001, 'cash');
    raise exception 'FAIL: standalone overpaid';
  exception when sqlstate '22023' then null;
  end;
  r := public.create_payment_receipt('invoice', p2, pg_temp.biz_snapshot(), null, 'en');
  if r.payment_method <> 'cheque' or (r.related ->> 'paidToDate')::numeric <> 30000 or (r.related ->> 'balance')::numeric <> 20000 or r.items -> 0 ->> 'description' not like 'Payment — invoice INV-%' then
    raise exception 'FAIL: standalone receipt %', row_to_json(r);
  end if;
  -- Void a payment with a receipt: refused; the invoice can't be voided while it has payments.
  begin
    perform public.void_invoice_payment(p2, 'typo');
    raise exception 'FAIL: voided payment with a receipt';
  exception when sqlstate 'WB420' then null;
  end;
  begin
    perform public.void_document(inv, 'wrong customer');
    raise exception 'FAIL: voided an invoice with payments';
  exception when sqlstate 'WB420' then null;
  end;
  perform public.void_invoice_payment(p1, 'recorded twice');
  if (select status || ' ' || amount_paid from public.documents where id = inv) <> 'partially_paid 10000.00' then raise exception 'FAIL: standalone void'; end if;
  perform public.record_invoice_payment(inv, 40000, 'cash');
  if (select status from public.documents where id = inv) <> 'paid' then raise exception 'FAIL: standalone paid'; end if;
  insert into t values ('sinv', inv), ('spay', p2);
  raise notice 'PASS standalone invoices: payments (any method), partly paid → paid, voids (not with a receipt), no void of an invoice with payments';
end $$;

-- The table can't be changed around the functions.
do $$
declare
  fake uuid;
begin
  -- A draft that claims to be paid starts with nothing paid once issued.
  insert into public.documents (business_id, doc_type, business_snapshot, customer_snapshot, items, subtotal, total, amount_paid, created_by)
  values ((select biz from ids), 'invoice', pg_temp.biz_snapshot(), '{"name":"X"}', '[{"description":"x","quantity":1,"unitPrice":9000}]', 9000, 9000, 9000, '00000000-0000-4000-a961-00000000000a')
  returning id into fake;
  perform public.issue_document(fake);
  if (select status || ' ' || amount_paid from public.documents where id = fake) <> 'issued 0.00' then raise exception 'FAIL: draft amount paid kept'; end if;
  -- RLS: issued documents aren't writable by users at all.
  update public.documents set amount_paid = 0 where id = (select v from t where k = 'sinv');
  if found then raise exception 'FAIL: amount_paid set directly'; end if;
  begin
    insert into public.invoice_payments (business_id, document_id, amount, method) values ((select biz from ids), (select v from t where k = 'sinv'), 1, 'cash');
    raise exception 'FAIL: payment inserted directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.documents (business_id, doc_type, business_snapshot, customer_snapshot, items, subtotal, total, amount_paid, payment_method, created_by, order_payment_id)
    values ((select biz from ids), 'receipt', '{}', '{}', '[{"description":"x"}]', 1, 1, 1, 'cash', '00000000-0000-4000-a961-00000000000a', (select v from t where k = 'opay1'));
    raise exception 'FAIL: receipt linked to a payment by hand';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS amounts paid, payments and payment links can only be written by the functions (an issued invoice starts with nothing paid)';
end $$;

-- Viewer: reads, can't record payments or make receipts or invoices.
select pg_temp.as_user('00000000-0000-4000-a961-00000000000d');
do $$
begin
  if (select count(*) from public.invoice_payments where business_id = (select biz from ids)) < 3 then raise exception 'FAIL: viewer reads payments'; end if;
  begin
    perform public.record_invoice_payment((select v from t where k = 'sinv'), 1, 'cash');
    raise exception 'FAIL: viewer recorded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_payment_receipt('invoice', (select v from t where k = 'spay'), pg_temp.biz_snapshot());
    raise exception 'FAIL: viewer receipt';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS viewers read payments but can''t record them or make receipts';
end $$;

-- Agent can't void payments.
select pg_temp.as_user('00000000-0000-4000-a961-00000000000b');
do $$
begin
  begin
    perform public.void_invoice_payment((select id from public.invoice_payments where document_id = (select v from t where k = 'sinv') and voided_at is null limit 1), 'by agent');
    raise exception 'FAIL: agent voided a payment';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS only owners and admins void payments';
end $$;

-- Another business: nothing visible, nothing callable.
select pg_temp.as_user('00000000-0000-4000-a961-00000000000c');
do $$
begin
  if exists (select 1 from public.invoice_payments where business_id = (select biz from ids)) then raise exception 'FAIL: other reads payments'; end if;
  begin
    perform public.create_order_invoice((select v from t where k = 'order'), pg_temp.biz_snapshot());
    raise exception 'FAIL: other made an invoice';
  exception when sqlstate 'P0002' then null;
  end;
  begin
    perform public.record_invoice_payment((select v from t where k = 'sinv'), 1, 'cash');
    raise exception 'FAIL: other recorded';
  exception when sqlstate 'P0002' then null;
  end;
  begin
    perform public.create_payment_receipt('order', (select v from t where k = 'opay1'), pg_temp.biz_snapshot());
    raise exception 'FAIL: other receipt';
  exception when sqlstate 'P0002' then null;
  end;
  raise notice 'PASS another business can''t see payments or make invoices, payments or receipts on ours';
end $$;

-- Deleting the order clears the link, keeps the issued invoice; deleting a business still works.
reset role;
do $$
begin
  delete from public.orders where id = (select v from t where k = 'order');
  if (select order_id from public.documents where id = (select v from t where k = 'oinv')) is not null
     or (select number from public.documents where id = (select v from t where k = 'oinv')) is null then
    raise exception 'FAIL: order delete';
  end if;
  delete from public.businesses where id = (select biz from ids);
  if exists (select 1 from public.documents where business_id = (select biz from ids)) then raise exception 'FAIL: business delete'; end if;
  raise notice 'PASS deleting an order keeps its issued invoice (link cleared); deleting a business deletes its documents';
end $$;

rollback;
