-- WazaBolt Stage 1 tests: roles, catalog, knowledge, customers, conversations,
-- orders, settings, plans — and tenant isolation for all of them.
-- Run against a database with the migrations applied (never production):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/saas_foundation.sql
-- Everything runs in a transaction that is rolled back.

begin;

-- Owners A and B sign up; A's business later gets an agent and a viewer.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-f000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'saas-a@test.local', '{"full_name":"Owner A","business_name":"Boutique Awa & Fils"}', now(), now()),
  ('00000000-0000-4000-f000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'saas-b@test.local', '{"full_name":"Owner B","business_name":"Chez Ben"}', now(), now()),
  ('00000000-0000-4000-f000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'saas-agent@test.local', '{"full_name":"Agent C","business_name":"Agent own shop"}', now(), now()),
  ('00000000-0000-4000-f000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'saas-viewer@test.local', '{"full_name":"Viewer D","business_name":"Viewer own shop"}', now(), now());

create temp table ids on commit drop as
select
  (select business_id from public.business_members where user_id = '00000000-0000-4000-f000-00000000000a') as biz_a,
  (select business_id from public.business_members where user_id = '00000000-0000-4000-f000-00000000000b') as biz_b;
grant select on ids to authenticated;

insert into public.business_members (business_id, user_id, role)
select biz_a, '00000000-0000-4000-f000-00000000000c'::uuid, 'agent'::public.business_role from ids
union all
select biz_a, '00000000-0000-4000-f000-00000000000d'::uuid, 'viewer'::public.business_role from ids;

do $$
declare b uuid;
begin
  select biz_a into b from ids;
  if (select slug from public.businesses where id = b) !~ '^boutique-awa-fils-[a-z0-9]{6}$' then
    raise exception 'FAIL: slug not generated (%)', (select slug from public.businesses where id = b);
  end if;
  if (select plan_id from public.subscriptions where business_id = b) <> 'free' then raise exception 'FAIL: free plan not assigned'; end if;
  if (select status from public.whatsapp_connections where business_id = b) <> 'not_connected' then
    raise exception 'FAIL: WhatsApp must start as not_connected';
  end if;
  if (select email from public.users where id = '00000000-0000-4000-f000-00000000000a') <> 'saas-a@test.local' then
    raise exception 'FAIL: email not copied to profile';
  end if;
  raise notice 'PASS new business gets slug, free plan, WhatsApp state and profile email';
end $$;

-- ---------------------------------------------------------------------------
-- Owner A works in the dashboard
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-f000-00000000000a","role":"authenticated"}', true);

do $$
declare b uuid; p uuid; v uuid; c uuid; conv uuid; o uuid; n int;
begin
  select biz_a into b from ids;

  update public.businesses set description = 'Wax dresses', industry = 'fashion', city = 'Douala',
    opening_hours = '{"mon":{"closed":false,"open":"08:00","close":"18:00"}}', onboarding_step = 2 where id = b;

  insert into public.products (business_id, name, category, sku, price, stock_quantity)
  values (b, 'Robe en wax', 'Dresses', 'RW-01', 15000, 10) returning id into p;
  insert into public.product_variants (business_id, product_id, name, value, price_modifier, stock_quantity)
  values (b, p, 'Size', 'XL', 1000, 2) returning id into v;
  begin
    insert into public.products (business_id, name, sku, price) values (b, 'Duplicate', 'rw-01', 1);
    raise exception 'FAIL: duplicate SKU accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.products (business_id, name, price) values (b, 'Negative', -5);
    raise exception 'FAIL: negative price accepted';
  exception when check_violation then null;
  end;

  insert into public.faqs (business_id, question, answer, priority) values (b, 'Do you deliver?', 'Yes, in Douala.', 5);
  insert into public.knowledge_documents (business_id, title, content, document_type) values (b, 'Returns', 'Within 7 days.', 'returns');
  begin
    insert into public.knowledge_documents (business_id, title, content, document_type) values (b, 'X', 'Y', 'secret');
    raise exception 'FAIL: unknown document type accepted';
  exception when check_violation then null;
  end;

  insert into public.customers (business_id, whatsapp_phone, name, city, tags, preferred_language, preferred_language_source)
  values (b, '237670000001', 'Sarah M.', 'Douala', array['vip'], 'fr', 'set_by_business') returning id into c;
  insert into public.conversations (business_id, customer_id) values (b, c) returning id into conv;

  -- Human takeover and return to AI are recorded in the audit log.
  update public.conversations set ai_enabled = false where id = conv;
  update public.conversations set ai_enabled = true, status = 'resolved' where id = conv;
  if (select count(*) from public.audit_logs where entity_id = conv::text and action in ('conversation.taken_over', 'conversation.returned_to_ai')) <> 2 then
    raise exception 'FAIL: takeover/return not audited';
  end if;

  -- Orders: prices from the catalog, snapshots, totals and numbering computed by the database.
  o := public.create_order(b, c,
    jsonb_build_array(
      jsonb_build_object('product_id', p, 'quantity', 2),
      jsonb_build_object('product_id', p, 'variant_id', v, 'quantity', 1),
      jsonb_build_object('name', 'Gift wrap', 'unit_price', 500, 'quantity', 1)),
    conv, 2000, 1000, 'Akwa, Douala', 'cash', null);
  if (select order_number from public.orders where id = o) <> 'ORD-00001' then raise exception 'FAIL: first order number'; end if;
  if (select subtotal from public.orders where id = o) <> 46500 or (select total from public.orders where id = o) <> 47500 then
    raise exception 'FAIL: order totals (subtotal %, total %)', (select subtotal from public.orders where id = o), (select total from public.orders where id = o);
  end if;
  if (select variant from public.order_items where order_id = o and unit_price = 16000) <> 'Size: XL' then raise exception 'FAIL: variant snapshot'; end if;

  update public.products set price = 20000, name = 'Robe en wax (new)' where id = p;
  if exists (select 1 from public.order_items where order_id = o and (unit_price = 20000 or product_name like '%(new)%')) then
    raise exception 'FAIL: order items must keep their price and name snapshot';
  end if;
  if (select order_number from public.orders where id = public.create_order(b, c, jsonb_build_array(jsonb_build_object('product_id', p)))) <> 'ORD-00002' then
    raise exception 'FAIL: order numbering';
  end if;

  update public.orders set status = 'confirmed', payment_status = 'paid', payment_method = 'mtn_momo' where id = o;
  begin
    update public.orders set total = 1 where id = o;
    raise exception 'FAIL: order totals must not be editable';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_order(b, c, '[]'::jsonb);
    raise exception 'FAIL: empty order accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_order(b, c, jsonb_build_array(jsonb_build_object('product_id', p)), null, 0, 999999);
    raise exception 'FAIL: discount larger than order accepted';
  exception when invalid_parameter_value then null;
  end;

  update public.ai_settings set ai_enabled = false, tone = 'casual', greeting = 'Welcome!', sales_mode = true,
    after_hours_mode = 'after_hours_message', after_hours_message = 'We are closed.' where business_id = b;
  begin
    update public.subscriptions set plan_id = 'pro';
    raise exception 'FAIL: plan must not be changed from the browser';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.whatsapp_connections set status = 'connected';
    raise exception 'FAIL: WhatsApp status must not be set from the browser';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.messages (business_id, conversation_id, direction, sender_type, content) values (b, conv, 'inbound', 'customer', 'fake');
    raise exception 'FAIL: messages must only be written by the server';
  exception when insufficient_privilege then null;
  end;

  select count(*) into n from public.plans;
  if n <> 4 then raise exception 'FAIL: plans not readable'; end if;
  raise notice 'PASS owner manages profile, catalog, knowledge, customers, takeover, orders and AI settings';
end $$;

-- ---------------------------------------------------------------------------
-- Agent and viewer in business A
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-f000-00000000000c","role":"authenticated"}', true);
do $$
declare b uuid; c uuid;
begin
  select biz_a into b from ids;
  insert into public.customers (business_id, whatsapp_phone, name) values (b, '237670000002', 'Walk-in') returning id into c;
  update public.conversations set ai_enabled = false where business_id = b;
  perform public.create_order(b, c, jsonb_build_array(jsonb_build_object('name', 'Repair', 'unit_price', 3000)));
  begin
    insert into public.products (business_id, name, price) values (b, 'Agent product', 1);
    raise exception 'FAIL: agents must not edit the catalog';
  exception when insufficient_privilege then null;
  end;
  update public.faqs set answer = 'hacked' where business_id = b;
  if exists (select 1 from public.faqs where answer = 'hacked') then raise exception 'FAIL: agents must not edit knowledge'; end if;
  update public.ai_settings set ai_enabled = true where business_id = b;
  if (select ai_enabled from public.ai_settings where business_id = b) then raise exception 'FAIL: agents must not change AI settings'; end if;
  raise notice 'PASS agents handle customers, conversations and orders but not catalog, knowledge or AI settings';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-f000-00000000000d","role":"authenticated"}', true);
do $$
declare b uuid;
begin
  select biz_a into b from ids;
  if (select count(*) from public.products where business_id = b) <> 1 then raise exception 'FAIL: viewer should read the catalog'; end if;
  begin
    insert into public.customers (business_id, whatsapp_phone) values (b, '237670000003');
    raise exception 'FAIL: viewers must not create customers';
  exception when insufficient_privilege then null;
  end;
  update public.conversations set ai_enabled = true where business_id = b;
  if exists (select 1 from public.conversations where business_id = b and ai_enabled) then raise exception 'FAIL: viewers must not take over'; end if;
  begin
    perform public.create_order(b, (select id from public.customers where business_id = b limit 1),
      jsonb_build_array(jsonb_build_object('name', 'X', 'unit_price', 1)));
    raise exception 'FAIL: viewers must not create orders';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.users) < 3 then raise exception 'FAIL: team members should see each other''s names'; end if;
  raise notice 'PASS viewers are read-only and see their teammates';
end $$;

-- ---------------------------------------------------------------------------
-- Owner B: sees nothing of A and cannot write into A
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-f000-00000000000b","role":"authenticated"}', true);
do $$
declare a uuid; b uuid; own_customer uuid;
begin
  select biz_a, biz_b into a, b from ids;
  if exists (select 1 from public.products where business_id = a) or exists (select 1 from public.product_variants)
     or exists (select 1 from public.faqs) or exists (select 1 from public.knowledge_documents)
     or exists (select 1 from public.customers) or exists (select 1 from public.conversations)
     or exists (select 1 from public.orders) or exists (select 1 from public.order_items)
     or exists (select 1 from public.ai_settings where business_id = a) or exists (select 1 from public.subscriptions where business_id = a)
     or exists (select 1 from public.whatsapp_connections where business_id = a)
     or exists (select 1 from public.users where id = '00000000-0000-4000-f000-00000000000a') then
    raise exception 'FAIL isolation: B can see business A data';
  end if;
  begin
    insert into public.products (business_id, name, price) values (a, 'Injected', 1);
    raise exception 'FAIL isolation: B inserted a product into A';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.customers (business_id, whatsapp_phone) values (a, '237670009999');
    raise exception 'FAIL isolation: B inserted a customer into A';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_order(a, (select customer_id from public.orders limit 1), jsonb_build_array(jsonb_build_object('name', 'X', 'unit_price', 1)));
    raise exception 'FAIL isolation: B created an order in A';
  exception when insufficient_privilege then null;
  end;

  -- B's own order can't reference A's product.
  insert into public.customers (business_id, whatsapp_phone) values (b, '237670000050') returning id into own_customer;
  begin
    perform public.create_order(b, own_customer,
      jsonb_build_array(jsonb_build_object('product_id', (select id from public.products limit 1))));
    raise exception 'FAIL isolation: order used another business''s product';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_order(b, own_customer, jsonb_build_array(jsonb_build_object('product_id', gen_random_uuid())));
    raise exception 'FAIL: unknown product accepted';
  exception when invalid_parameter_value then null;
  end;
  if (select order_number from public.orders where id = public.create_order(b, own_customer,
        jsonb_build_array(jsonb_build_object('name', 'Ndolé', 'unit_price', 2500)))) <> 'ORD-00001' then
    raise exception 'FAIL: order numbers must be per business';
  end if;
  raise notice 'PASS other businesses see nothing and cannot write into business A';
end $$;

reset role;
set local role anon;
do $$
begin
  if (select count(*) from public.plans) <> 4 then raise exception 'FAIL: plans should be public'; end if;
  begin
    perform 1 from public.products;
    raise exception 'FAIL: anon can read products';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS anon reads plans only';
end $$;

reset role;
rollback;
