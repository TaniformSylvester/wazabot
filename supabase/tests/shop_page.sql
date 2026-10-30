-- WazaBolt: the public shop page switch. Off by default; only an owner or
-- admin turns it on or off (audited); agents and strangers can't.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/shop_page.sql
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-a988-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'shop-owner@test.local', '{"business_name":"Awa Styles"}', now(), now()),
  ('00000000-0000-4000-a988-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'shop-agent@test.local', '{"business_name":"Agent Own"}', now(), now()),
  ('00000000-0000-4000-a988-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'shop-other@test.local', '{"business_name":"Other Shop"}', now(), now());
create temp table t on commit drop as
select (select business_id from public.business_members where user_id = '00000000-0000-4000-a988-00000000000a') as biz;
grant select on t to authenticated;
update public.subscriptions set plan_id = 'starter' where business_id = (select biz from t);
insert into public.business_members (business_id, user_id, role) values ((select biz from t), '00000000-0000-4000-a988-00000000000b', 'agent');

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;

do $$
begin
  if (select shop_enabled from public.businesses where id = (select biz from t)) then raise exception 'FAIL: on by default'; end if;
  raise notice 'PASS the shop page is off until the owner switches it on';
end $$;

set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a988-00000000000b');
do $$
begin
  perform public.set_shop_enabled((select biz from t), true);
  raise exception 'FAIL: an agent switched the shop on';
exception when insufficient_privilege then null;
end $$;
select pg_temp.as_user('00000000-0000-4000-a988-00000000000c');
do $$
begin
  perform public.set_shop_enabled((select biz from t), true);
  raise exception 'FAIL: a stranger switched the shop on';
exception when insufficient_privilege then
  raise notice 'PASS agents and other businesses can''t switch it';
end $$;

select pg_temp.as_user('00000000-0000-4000-a988-00000000000a');
select public.set_shop_enabled((select biz from t), true);
reset role;
do $$
begin
  if not (select shop_enabled from public.businesses where id = (select biz from t)) then raise exception 'FAIL: not on'; end if;
  if not exists (select 1 from public.audit_logs where business_id = (select biz from t) and action = 'shop.enabled') then raise exception 'FAIL: not audited'; end if;
  raise notice 'PASS the owner switches it on (audited)';
end $$;

rollback;
