-- WazaBolt Stage 8 tests: consent timestamps, the frozen audience, roles and tenants.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/broadcasts.sql
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-a800-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b-owner@test.local', '{"business_name":"Promo A"}', now(), now()),
  ('00000000-0000-4000-a800-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b-agent@test.local', '{"business_name":"Agent own"}', now(), now()),
  ('00000000-0000-4000-a800-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b-other@test.local', '{"business_name":"Promo B"}', now(), now());
create temp table ids on commit drop as
select (select business_id from public.business_members where user_id = '00000000-0000-4000-a800-00000000000a') as biz,
       (select business_id from public.business_members where user_id = '00000000-0000-4000-a800-00000000000c') as other;
grant select on ids to authenticated, service_role;
-- Not testing plan limits here: keep the Free plan but outside its limits (grace date far ahead).
update public.businesses set free_limits_from = '2099-01-01' where id in (select biz from ids);
insert into public.business_members (business_id, user_id, role) select biz, '00000000-0000-4000-a800-00000000000b', 'agent' from ids;

insert into public.customers (business_id, whatsapp_phone, name, tags, preferred_language, marketing_opt_in, preferred_language_source)
select biz, '237670100001', 'VIP FR', '{vip}'::text[], 'fr', true, 'set_by_business' from ids union all
select biz, '237670100002', 'VIP EN', '{vip,wholesale}', 'en', true, 'set_by_business' from ids union all
select biz, '237670100003', 'Not subscribed', '{vip}', 'fr', false, 'set_by_business' from ids union all
select biz, '237670100004', 'Regular', '{}', 'fr', true, 'set_by_business' from ids union all
select other, '237670100005', 'Other business', '{vip}', 'fr', true, 'set_by_business' from ids;

do $$
begin
  if (select marketing_opt_in_at from public.customers where whatsapp_phone = '237670100001') is null then raise exception 'FAIL: consent time'; end if;
  update public.customers set marketing_opt_in = false where whatsapp_phone = '237670100004';
  if (select marketing_opt_out_at from public.customers where whatsapp_phone = '237670100004') is null then raise exception 'FAIL: opt-out time'; end if;
  update public.customers set marketing_opt_in = true where whatsapp_phone = '237670100004';
  raise notice 'PASS consent and opt-out are timestamped';
end $$;

insert into public.broadcasts (id, business_id, name, language, body, template_name, template_status, audience_tags, audience_language)
select '00000000-0000-4000-a800-0000000000b1'::uuid, biz, 'VIP French', 'fr', 'Bonjour', 'wazabolt_bc_test1', 'approved', '{vip}'::text[], 'fr' from ids union all
select '00000000-0000-4000-a800-0000000000b2'::uuid, biz, 'Everyone', 'fr', 'Bonjour', 'wazabolt_bc_test2', 'approved', '{}'::text[], null from ids;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
begin
  if public.prepare_broadcast('00000000-0000-4000-a800-0000000000b1') <> 1 then raise exception 'FAIL: tag + language audience'; end if;
  if public.prepare_broadcast('00000000-0000-4000-a800-0000000000b2') <> 3 then raise exception 'FAIL: everyone subscribed (this business only)'; end if;
  if (select status from public.broadcasts where id = '00000000-0000-4000-a800-0000000000b2') <> 'sending' then raise exception 'FAIL: status'; end if;
  begin
    perform public.prepare_broadcast('00000000-0000-4000-a800-0000000000b2');
    raise exception 'FAIL: prepared twice';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'PASS the audience is opted-in customers of this business matching tags and language, frozen once';
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a800-00000000000b","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.broadcasts) <> 2 or (select count(*) from public.broadcast_recipients) <> 4 then raise exception 'FAIL: members read broadcasts'; end if;
  begin
    insert into public.broadcasts (business_id, name, language, body, template_name) select biz, 'x', 'en', 'x', 'x' from ids;
    raise exception 'FAIL: users insert broadcasts directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.prepare_broadcast('00000000-0000-4000-a800-0000000000b1');
    raise exception 'FAIL: users can start a broadcast';
  exception when insufficient_privilege then null;
  end;
  update public.customers set marketing_opt_in = false where whatsapp_phone = '237670100002';
  if (select marketing_opt_in from public.customers where whatsapp_phone = '237670100002') then raise exception 'FAIL: agents record consent changes'; end if;
  raise notice 'PASS members read; only the server creates and starts broadcasts; agents record consent';
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a800-00000000000c","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.broadcasts) or exists (select 1 from public.broadcast_recipients) then raise exception 'FAIL: other business sees broadcasts'; end if;
  raise notice 'PASS other businesses see nothing';
end $$;

rollback;
