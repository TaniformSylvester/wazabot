-- Plan limits: Free (products, monthly sales, team, expenses), grace for existing businesses,
-- Boutique and paid plans unlimited where they should be.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/plan_limits.sql
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-a930-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'limits-free@test.local', '{"business_name":"Free Shop"}', now(), now()),
  ('00000000-0000-4000-a930-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'limits-staff@test.local', '{"business_name":"Staff Own"}', now(), now()),
  ('00000000-0000-4000-a930-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'limits-grace@test.local', '{"business_name":"Grace Shop"}', now(), now()),
  ('00000000-0000-4000-a930-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'limits-boutique@test.local', '{"business_name":"Boutique Shop"}', now(), now());
create temp table ids on commit drop as
select (select business_id from public.business_members where user_id = '00000000-0000-4000-a930-00000000000a') as free_biz,
       (select business_id from public.business_members where user_id = '00000000-0000-4000-a930-00000000000c') as grace_biz,
       (select business_id from public.business_members where user_id = '00000000-0000-4000-a930-00000000000d') as boutique_biz;
grant select on ids to authenticated;

-- A business that existed before the limits keeps full access until its grace date.
update public.businesses set free_limits_from = current_date + 30 where id = (select grace_biz from ids);
update public.subscriptions set plan_id = 'boutique' where business_id = (select boutique_biz from ids);

do $$
declare
  b uuid := (select free_biz from ids);
  l record;
begin
  if (select free_limits_from from public.businesses where id = b) <> current_date then
    raise exception 'FAIL: a new business should get the Free limits from today';
  end if;
  select * into l from public._plan_limits(b);
  if l.plan_id <> 'free' or not l.enforced or l.max_products <> 30 or l.max_monthly_sales <> 100 or l.max_members <> 1 or l.report_days <> 7 or l.has_profit then
    raise exception 'FAIL: free limits %', l;
  end if;
  select * into l from public._plan_limits((select grace_biz from ids));
  if l.enforced then raise exception 'FAIL: grace business should not be limited yet'; end if;
  select * into l from public._plan_limits((select boutique_biz from ids));
  if l.plan_id <> 'boutique' or not l.enforced or l.max_products is not null or l.max_members <> 1 or not l.has_profit then
    raise exception 'FAIL: boutique limits %', l;
  end if;
  if (select monthly_price from public.plans where id = 'boutique') <> 5000 or (select ai_conversations_per_month from public.plans where id = 'boutique') <> 0 then
    raise exception 'FAIL: boutique price or AI allowance';
  end if;
  raise notice 'PASS plans: Free limits for new businesses, grace for existing ones, Boutique at 5,000 with no AI';
end $$;

-- ---------------------------------------------------------------------------
-- Free plan, limits in force (as the owner, through the app's functions)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a930-00000000000a","role":"authenticated"}', true);

do $$
declare
  b uuid := (select free_biz from ids);
  p uuid;
  i int;
  u record;
begin
  -- Products: 30 active ones, then refused; archiving one frees a place.
  for i in 1..30 loop
    insert into public.products (business_id, name, price, stock_quantity) values (b, 'Item ' || i, 1000, 500);
  end loop;
  begin
    insert into public.products (business_id, name, price) values (b, 'Item 31', 1000);
    raise exception 'FAIL: 31st product accepted on Free';
  exception when sqlstate 'WB411' then null;
  end;
  insert into public.products (business_id, name, price, active) values (b, 'Archived draft', 1000, false);
  select id into p from public.products where business_id = b and name = 'Item 1';
  update public.products set active = false where id = p;
  update public.products set active = true where name = 'Archived draft' and business_id = b;
  begin
    update public.products set active = true where id = p;
    raise exception 'FAIL: reactivating over the limit accepted';
  exception when sqlstate 'WB411' then null;
  end;

  -- Sales: 100 this month, then the till refuses; nothing is half-recorded.
  select id into p from public.products where business_id = b and name = 'Item 2';
  for i in 1..100 loop
    perform public.create_sale(b, gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id', p, 'quantity', 1)), null, 0,
                               jsonb_build_array(jsonb_build_object('amount', 1000, 'method', 'cash')));
  end loop;
  begin
    perform public.create_sale(b, gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id', p, 'quantity', 1)), null, 0,
                               jsonb_build_array(jsonb_build_object('amount', 1000, 'method', 'cash')));
    raise exception 'FAIL: 101st sale accepted on Free';
  exception when sqlstate 'WB412' then null;
  end;
  if (select stock_quantity from public.products where id = p) <> 400 then raise exception 'FAIL: refused sale changed stock'; end if;

  -- Expenses need a paid plan.
  begin
    insert into public.expenses (business_id, category, amount) values (b, 'rent', 50000);
    raise exception 'FAIL: expense accepted on Free';
  exception when sqlstate 'WB414' then null;
  end;

  -- Team: the owner is the one user; inviting someone is refused.
  begin
    perform public.create_invitation(b, 'helper@test.local', 'agent', repeat('a', 64));
    raise exception 'FAIL: invitation accepted on Free';
  exception when sqlstate 'WB413' then null;
  end;

  -- What the dashboard reads.
  select * into u from public.business_plan_limits(b);
  if u.products_used <> 30 or u.sales_this_month <> 100 or u.members_used <> 1 or not u.enforced then
    raise exception 'FAIL: usage %', u;
  end if;
  raise notice 'PASS Free: 30 products, 100 sales a month, 1 user, no expenses — refused cleanly, usage shown';
end $$;

-- Members joining any other way are refused too.
reset role;
do $$
begin
  insert into public.business_members (business_id, user_id, role) select free_biz, '00000000-0000-4000-a930-00000000000b', 'agent' from ids;
  raise exception 'FAIL: second member added on Free';
exception when sqlstate 'WB413' then
  raise notice 'PASS Free: a second team member is refused however they are added';
end $$;

-- The WhatsApp assistant's orders don't count towards the monthly sales.
do $$
declare
  b uuid := (select free_biz from ids);
  c uuid;
begin
  insert into public.customers (business_id, whatsapp_phone) values (b, '237000000777') returning id into c;
  insert into public.orders (business_id, customer_id, order_number, channel, subtotal, total, currency)
  values (b, c, 'WA-TEST-1', 'whatsapp', 1000, 1000, 'XAF');
  raise notice 'PASS orders from the WhatsApp assistant are not limited by the till''s monthly sales';
end $$;

-- ---------------------------------------------------------------------------
-- Grace and Boutique: no limits where there shouldn't be any
-- ---------------------------------------------------------------------------
do $$
declare
  g uuid := (select grace_biz from ids);
  bo uuid := (select boutique_biz from ids);
  i int;
begin
  for i in 1..35 loop
    insert into public.products (business_id, name, price) values (g, 'Grace ' || i, 1000);
    insert into public.products (business_id, name, price) values (bo, 'Boutique ' || i, 1000);
  end loop;
  insert into public.expenses (business_id, category, amount) values (g, 'rent', 1000), (bo, 'rent', 1000);
  insert into public.business_members (business_id, user_id, role) select grace_biz, '00000000-0000-4000-a930-00000000000b', 'agent' from ids;
  begin
    insert into public.business_members (business_id, user_id, role) select boutique_biz, '00000000-0000-4000-a930-00000000000b', 'agent' from ids;
    raise exception 'FAIL: Boutique allows one user';
  exception when sqlstate 'WB413' then null;
  end;
  update public.subscriptions set plan_id = 'starter' where business_id = bo;
  insert into public.business_members (business_id, user_id, role) select boutique_biz, '00000000-0000-4000-a930-00000000000b', 'agent' from ids;
  raise notice 'PASS grace keeps full access; Boutique: unlimited products and expenses, 1 user; Starter: 2 users';
end $$;

-- Another business can't read someone else's limits.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a930-00000000000c","role":"authenticated"}', true);
do $$
begin
  perform public.business_plan_limits((select free_biz from ids));
  raise exception 'FAIL: read another business''s plan usage';
exception when insufficient_privilege then
  raise notice 'PASS plan usage is private to the business';
end $$;

rollback;
