-- WazaBolt cost tracking tests: our Claude costs stay internal.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/cost_tracking.sql
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-a900-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c-owner@test.local', '{"business_name":"Costs A"}', now(), now());
create temp table ids on commit drop as
select (select business_id from public.business_members where user_id = '00000000-0000-4000-a900-00000000000a') as biz;
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
end $$;

rollback;
