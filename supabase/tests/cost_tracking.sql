-- WazaBolt cost tracking tests: our Claude costs stay internal.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/cost_tracking.sql
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-a900-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c-owner@test.local', '{"business_name":"Costs A"}', now(), now()),
  ('00000000-0000-4000-a900-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c-other@test.local', '{"business_name":"Costs B"}', now(), now());
create temp table ids on commit drop as
select (select business_id from public.business_members where user_id = '00000000-0000-4000-a900-00000000000a') as biz,
       (select business_id from public.business_members where user_id = '00000000-0000-4000-a900-00000000000c') as other;
update public.whatsapp_connections set status = 'connected', phone_number_id = 'pn-cost-a' where business_id = (select biz from ids);
grant select on ids to authenticated, service_role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.claude_calls (business_id, source, model, input_tokens, output_tokens, cost_usd, cost_fcfa)
select biz, 'reply', 'claude-haiku-4-5', 1000, 100, 0.0015, 0.855 from ids;
do $$
begin
  if (select count(*) from public.claude_calls) < 1 then raise exception 'FAIL: server logs Claude calls'; end if;
  begin
    insert into public.claude_calls (business_id, source, model, cost_usd, cost_fcfa) select biz, 'other', 'x', 0, 0 from ids;
    raise exception 'FAIL: unknown source accepted';
  exception when check_violation then null;
  end;
  raise notice 'PASS the server logs every Claude call with its cost';

  perform public.record_whatsapp_send(biz, 'pn-cost-a', 'service') from ids;
  perform public.record_whatsapp_send(biz, 'pn-cost-a', 'service') from ids;
  perform public.record_whatsapp_send(biz, 'pn-cost-a', 'marketing') from ids;
  if (select sent from public.whatsapp_usage where phone_number_id = 'pn-cost-a' and category = 'service') <> 2 then raise exception 'FAIL: service count'; end if;
  if (select sent from public.whatsapp_usage where phone_number_id = 'pn-cost-a' and category = 'marketing') <> 1 then raise exception 'FAIL: marketing count'; end if;
  if (select month from public.whatsapp_usage limit 1) <> date_trunc('month', now() at time zone 'utc')::date then raise exception 'FAIL: month'; end if;
  raise notice 'PASS WhatsApp sends are counted per number, month and category';
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a900-00000000000a","role":"authenticated"}', true);
do $$
begin
  begin
    perform 1 from public.claude_calls;
    raise exception 'FAIL: owners read our Claude costs';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS businesses (even owners) never see our Claude costs';

  if (select service_sent from public.whatsapp_free_usage((select biz from ids))) <> 2 then raise exception 'FAIL: owner sees this month''s service messages'; end if;
  begin
    perform public.record_whatsapp_send((select biz from ids), 'pn-cost-a', 'service');
    raise exception 'FAIL: users count sends';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.whatsapp_usage;
    raise exception 'FAIL: users read the usage table';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.whatsapp_free_usage((select other from ids));
    raise exception 'FAIL: other business usage readable';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS owners see their own number''s free-message use (no prices), nothing else';

  begin
    perform 1 from public.admin_cost_report(date_trunc('month', now())::date, 1000);
    raise exception 'FAIL: users run the margin report';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.platform_admins;
    raise exception 'FAIL: users read platform admins';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS the margin report and the WazaBolt team list are server-only';
end $$;

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  r record;
begin
  select * into r from public.admin_cost_report((date_trunc('month', now() at time zone 'utc'))::date, 1) where business_id = (select biz from ids);
  if r.claude_reply_fcfa <> 0.855 or r.claude_requests <> 1 or r.service_sent <> 2 or r.service_over_free <> 1 or r.marketing_sent <> 1 then
    raise exception 'FAIL: report row %', row_to_json(r);
  end if;
  if exists (select 1 from public.admin_cost_report((date_trunc('month', now() at time zone 'utc') - interval '1 month')::date, 1000) where business_id = (select biz from ids) and claude_requests > 0) then
    raise exception 'FAIL: last month includes this month''s calls';
  end if;
  raise notice 'PASS the margin report sums Claude cost and WhatsApp use per business for the month (free tier per number)';
end $$;

rollback;
