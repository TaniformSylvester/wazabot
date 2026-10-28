-- WazaBolt: several businesses under one login. An owner adds a business; it is
-- set up like a sign-up (owner, Free subscription, settings, languages) and
-- separate from the first; one Free business per owner (the next one needs a
-- paid plan and files a plan change request); strangers and anonymous calls
-- are refused; tenants stay isolated.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/multi_business.sql
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-a966-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'multi-owner@test.local', '{"business_name":"Awa Styles","locale":"fr"}', now(), now()),
  ('00000000-0000-4000-a966-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'multi-other@test.local', '{"business_name":"Other Shop"}', now(), now());
create temp table ids on commit drop as
select (select business_id from public.business_members where user_id = '00000000-0000-4000-a966-00000000000a') as first,
       (select business_id from public.business_members where user_id = '00000000-0000-4000-a966-00000000000b') as other;
create temp table t (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated, anon;
grant all on t to authenticated;

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.v(k text) returns uuid language sql as $$ select v from t where k = $1 $$;

-- Anonymous: refused.
set local role anon;
do $$
begin
  perform public.create_business('Ghost Shop');
  raise exception 'FAIL: anonymous created a business';
exception when insufficient_privilege then
  raise notice 'PASS anonymous visitors cannot add a business';
end $$;
reset role;

-- The owner's first business is on Free: a second one must ask for a paid plan.
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a966-00000000000a');
do $$
begin
  perform public.create_business('Chez Awa', 'restaurant');
  raise exception 'FAIL: a second Free business';
exception when sqlstate 'WB451' then
  raise notice 'PASS one Free business per owner: the second one needs a paid plan';
end $$;
do $$
begin
  perform public.create_business('Chez Awa', 'restaurant', 'free');
  raise exception 'FAIL: free asked explicitly';
exception when sqlstate 'WB451' then null;
end $$;
do $$
begin
  perform public.create_business(' x ', 'retail', 'starter');
  raise exception 'FAIL: one-letter name';
exception when invalid_parameter_value then null;
end $$;
do $$
begin
  perform public.create_business('Chez Awa', 'retail', 'starter', 'week');
  raise exception 'FAIL: unknown interval';
exception when invalid_parameter_value then null;
end $$;
do $$
begin
  perform public.create_business('Chez Awa', 'spaceship', 'starter');
  raise exception 'FAIL: unknown type';
exception when invalid_parameter_value then
  raise notice 'PASS a business needs a name and a known type';
end $$;

do $$
declare
  b uuid;
begin
  b := public.create_business('Chez Awa', 'restaurant', 'starter', 'year', ' 677 00 00 00 ');
  insert into t values ('second', b);
  if not exists (select 1 from public.business_members where business_id = b and user_id = '00000000-0000-4000-a966-00000000000a' and role = 'owner') then
    raise exception 'FAIL: not the owner';
  end if;
  raise notice 'PASS the owner adds a business with a paid plan, and owns it';
end $$;
reset role;

do $$
declare
  b uuid := pg_temp.v('second');
  f uuid := (select first from ids);
begin
  if (select plan_id from public.subscriptions where business_id = b) <> 'free' then raise exception 'FAIL: subscription'; end if;
  if not (select needs_paid_plan from public.businesses where id = b) then raise exception 'FAIL: needs_paid_plan not set'; end if;
  if (select to_plan_id || ' ' || status || ' ' || billing_interval || ' ' || contact_phone from public.plan_change_requests where business_id = b) <> 'starter pending year 677 00 00 00' then raise exception 'FAIL: no plan request'; end if;
  if not exists (select 1 from public.ai_settings where business_id = b) or not exists (select 1 from public.whatsapp_connections where business_id = b)
     or not exists (select 1 from public.notification_settings where business_id = b) then
    raise exception 'FAIL: per-business rows missing';
  end if;
  if (select industry from public.businesses where id = b) <> 'restaurant' then raise exception 'FAIL: industry'; end if;
  if (select country_code || ' ' || currency || ' ' || default_language from public.businesses where id = b)
     <> (select country_code || ' ' || currency || ' ' || default_language from public.businesses where id = f) then
    raise exception 'FAIL: country, currency or language not copied';
  end if;
  if not exists (select 1 from public.business_languages where business_id = b) then raise exception 'FAIL: languages'; end if;
  if (select count(*) from public.audit_logs where business_id = b and action = 'business.created') <> 1 then raise exception 'FAIL: audit'; end if;
  raise notice 'PASS the new business is set up like a sign-up (Free until approved, settings, languages, audit) with its plan request pending';
end $$;

-- The two businesses are separate: data in one is not in the other.
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a966-00000000000a');
do $$
begin
  insert into public.products (business_id, name, price) values (pg_temp.v('second'), 'Poulet DG', 4500);
  if exists (select 1 from public.products where business_id = (select first from ids) and name = 'Poulet DG') then
    raise exception 'FAIL: product leaked to the first business';
  end if;
  raise notice 'PASS each business keeps its own data';
end $$;

-- Once the first business is paid, a new business can be the Free one again.
reset role;
update public.subscriptions set plan_id = 'starter' where business_id = (select first from ids);
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a966-00000000000a');
do $$
declare
  b uuid;
begin
  b := public.create_business('Awa Couture', 'fashion');
  if (select needs_paid_plan from public.businesses where id = b) then raise exception 'FAIL: marked as needing a paid plan'; end if;
  if exists (select 1 from public.plan_change_requests where business_id = b) then raise exception 'FAIL: request filed for a Free business'; end if;
  insert into t values ('third', b);
  raise notice 'PASS with no other Free business, the new one is Free';
end $$;
do $$
begin
  perform public.create_business('Awa Market', 'retail');
  raise exception 'FAIL: two Free businesses';
exception when sqlstate 'WB451' then
  raise notice 'PASS still only one Free business at a time';
end $$;

-- Another user can't see or use the owner's businesses.
select pg_temp.as_user('00000000-0000-4000-a966-00000000000b');
do $$
begin
  if exists (select 1 from public.businesses where id in (pg_temp.v('second'), pg_temp.v('third'))) then
    raise exception 'FAIL: another user sees the new businesses';
  end if;
  if exists (select 1 from public.products where business_id = pg_temp.v('second')) then raise exception 'FAIL: products visible'; end if;
  raise notice 'PASS other users never see the new businesses';
end $$;

rollback;
