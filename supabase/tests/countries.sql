-- WazaBolt: countries (20261106120000_country_zimbabwe.sql). A Zimbabwe sign-up
-- gets US dollars, Harare time and English; the owner changes the country only
-- before amounts are recorded (WB470); team members can't.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/countries.sql
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-a995-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zw-owner@test.local', '{"business_name":"Moyo Hardware","country_code":"ZW"}', now(), now()),
  ('00000000-0000-4000-a995-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cm-owner@test.local', '{"business_name":"Awa Styles","country_code":"CM"}', now(), now()),
  ('00000000-0000-4000-a995-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cm-agent@test.local', '{"business_name":"Agent Own"}', now(), now());
create temp table t on commit drop as
select (select business_id from public.business_members where user_id = '00000000-0000-4000-a995-00000000000a') as zw,
       (select business_id from public.business_members where user_id = '00000000-0000-4000-a995-00000000000b') as cm;
grant select on t to authenticated;
insert into public.business_members (business_id, user_id, role) select cm, '00000000-0000-4000-a995-00000000000c', 'agent' from t;
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;

do $$
begin
  if (select country_code || ' ' || currency || ' ' || timezone from public.businesses where id = (select zw from t)) <> 'ZW USD Africa/Harare' then
    raise exception 'FAIL: Zimbabwe sign-up %', (select country_code || ' ' || currency || ' ' || timezone from public.businesses where id = (select zw from t));
  end if;
  if (select string_agg(language_code, ',') from public.business_languages where business_id = (select zw from t)) <> 'en' then raise exception 'FAIL: Zimbabwe languages'; end if;
  if (select country_code || ' ' || currency from public.businesses where id = (select cm from t)) <> 'CM XAF' then raise exception 'FAIL: Cameroon sign-up'; end if;
  raise notice 'PASS a Zimbabwe sign-up gets US dollars, Harare time and English; Cameroon stays FCFA';
end $$;

-- Prices with cents are kept exactly.
do $$
begin
  insert into public.products (business_id, name, price) values ((select zw from t), 'Hammer', 12.50);
  if (select price from public.products where business_id = (select zw from t) and name = 'Hammer') <> 12.50 then raise exception 'FAIL: cents'; end if;
  raise notice 'PASS prices keep their cents (12.50)';
end $$;

set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a995-00000000000c');
do $$
begin
  perform public.set_business_country((select cm from t), 'ZW');
  raise exception 'FAIL: an agent changed the country';
exception when insufficient_privilege then
  raise notice 'PASS only the owner or an admin changes the country';
end $$;

-- The Cameroon owner switches to Zimbabwe before any sale: currency, time zone, languages.
select pg_temp.as_user('00000000-0000-4000-a995-00000000000b');
do $$
begin
  perform public.set_business_country((select cm from t), 'ZW');
  if (select country_code || ' ' || currency || ' ' || timezone from public.businesses where id = (select cm from t)) <> 'ZW USD Africa/Harare' then raise exception 'FAIL: switch'; end if;
  if not exists (select 1 from public.business_languages where business_id = (select cm from t) and language_code = 'fr') then raise exception 'FAIL: existing languages dropped'; end if;
  if not exists (select 1 from public.audit_logs where business_id = (select cm from t) and action = 'business.country_changed') then raise exception 'FAIL: not audited'; end if;
  raise notice 'PASS before any sale the owner changes the country (currency, time zone; languages kept; audited)';
end $$;
do $$
begin
  perform public.set_business_country((select cm from t), 'XX');
  raise exception 'FAIL: unknown country accepted';
exception when invalid_parameter_value then
  raise notice 'PASS an unknown country is refused';
end $$;

-- Once a sale is recorded, the currency can't change.
reset role;
insert into public.orders (business_id, order_number, status, channel, subtotal, total, currency)
select cm, 'T-1', 'delivered', 'pos', 10, 10, 'USD' from t;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a995-00000000000b');
do $$
begin
  perform public.set_business_country((select cm from t), 'CM');
  raise exception 'FAIL: currency changed after a sale';
exception when sqlstate 'WB470' then
  raise notice 'PASS once a sale is recorded the country (currency) can''t change (WB470)';
end $$;

rollback;
