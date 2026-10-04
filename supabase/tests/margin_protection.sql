-- WazaBolt Step 4 tests: 24-hour AI conversations, Free 30, prepaid monthly/annual billing,
-- renewals, expiry, and the WazaBolt-only tables.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/margin_protection.sql
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-a910-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm-owner@test.local', '{"business_name":"Margins A"}', now(), now()),
  ('00000000-0000-4000-a910-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm-legacy@test.local', '{"business_name":"Margins B"}', now(), now());
create temp table ids on commit drop as
select (select business_id from public.business_members where user_id = '00000000-0000-4000-a910-00000000000a') as biz,
       (select business_id from public.business_members where user_id = '00000000-0000-4000-a910-00000000000b') as legacy;
grant select on ids to authenticated, service_role;
create temp table convs on commit drop as
select c.id, row_number() over () as n from (select biz from ids) i,
  lateral (select gen_random_uuid() as id from generate_series(1, 3)) c;
insert into public.customers (id, business_id, whatsapp_phone)
select gen_random_uuid(), biz, '23767000000' || n from ids, convs;
insert into public.conversations (id, business_id, customer_id)
select c.id, i.biz, (select id from public.customers where business_id = i.biz and whatsapp_phone = '23767000000' || c.n) from convs c, ids i;
grant select on convs to service_role;
-- B signed up before Step 4: still on the old counting rules until its switch date.
update public.subscriptions set rules_from = now() + interval '20 days' where business_id = (select legacy from ids);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  u record;
  w public.ai_conversation_windows;
  c1 uuid := (select id from convs where n = 1);
  c2 uuid := (select id from convs where n = 2);
  c3 uuid := (select id from convs where n = 3);
  b uuid := (select biz from ids);
begin
  select * into u from public.ai_usage_status(b);
  if u.counting <> 'windows' or u.conversation_limit <> 30 or u.conversations_used <> 0 then raise exception 'FAIL: new sign-up on Free 30 with 24-hour windows (%)', row(u.*); end if;
  select * into u from public.ai_usage_status((select legacy from ids));
  if u.counting <> 'legacy' or u.conversation_limit <> 50 then raise exception 'FAIL: older Free business keeps 50 until its switch date'; end if;
  raise notice 'PASS Free is 30 conversations for new sign-ups; older businesses keep the old rules until their switch date';

  w := public.record_ai_reply(b, c1, true);
  w := public.record_ai_reply(b, c1, true);
  if w.claude_replies <> 2 or (select count(*) from public.ai_conversation_windows where conversation_id = c1) <> 1 then raise exception 'FAIL: replies in one window'; end if;
  perform public.record_ai_reply(b, c2, false);
  if (select conversations_used from public.ai_usage_status(b)) <> 1 then raise exception 'FAIL: a rules-only window is not an AI conversation'; end if;
  perform public.record_ai_reply(b, c2, true);
  if (select conversations_used from public.ai_usage_status(b)) <> 2 then raise exception 'FAIL: Claude in the window counts it'; end if;
  -- 24 hours later the same customer is a new AI conversation.
  update public.ai_conversation_windows set started_at = now() - interval '25 hours', ends_at = now() - interval '1 hour' where conversation_id = c1;
  w := public.record_ai_reply(b, c1, true);
  if w.claude_replies <> 1 or (select count(*) from public.ai_conversation_windows where conversation_id = c1) <> 2 then raise exception 'FAIL: a new window after 24 hours'; end if;
  if (select conversations_used from public.ai_usage_status(b)) <> 3 then raise exception 'FAIL: three AI conversations'; end if;
  raise notice 'PASS an AI conversation is one customer''s 24-hour window in which Claude replied';

  if public.claude_spend_since(b, now() - interval '1 day') <> 0 then raise exception 'FAIL: no spend yet'; end if;
  insert into public.claude_calls (business_id, source, model, cost_usd, cost_fcfa) values (b, 'reply', 'claude-haiku-4-5', 0.01, 5.7), (b, 'test_chat', 'claude-haiku-4-5', 0.001, 0.57);
  if public.claude_spend_since(b, now() - interval '1 day') <> 6.27 then raise exception 'FAIL: spend sums replies and test chat'; end if;
  raise notice 'PASS the server reads a business''s Claude spend for the hidden budget';
end $$;

-- ---------------------------------------------------------------------------
-- Owners: annual and renewal requests; no access to the WazaBolt-only parts
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a910-00000000000a","role":"authenticated"}', true);
create temp table req (id uuid, label text) on commit drop;
grant all on req to authenticated, service_role;
do $$
declare
  b uuid := (select biz from ids);
begin
  begin
    perform public.request_plan_change(b, 'free', null, null, 'month');
    raise exception 'FAIL: Free → Free';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.request_plan_change(b, 'starter', null, null, 'week');
    raise exception 'FAIL: unknown interval';
  exception when invalid_parameter_value then null;
  end;
  insert into req select public.request_plan_change(b, 'starter', '+237 670 00 00 00', null, 'year'), 'annual';
  if (select billing_interval || '/' || kind from public.plan_change_requests where id = (select id from req where label = 'annual')) <> 'year/change' then raise exception 'FAIL: annual request'; end if;
  raise notice 'PASS owners request a plan monthly or annually';

  begin
    perform public.record_ai_reply((select biz from ids), (select id from convs where n = 1), true);
    raise exception 'FAIL: owners record AI replies';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.claude_spend_since((select biz from ids), now());
    raise exception 'FAIL: owners read our Claude spend';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.approve_plan_change((select id from req limit 1));
    raise exception 'FAIL: owners approve their own plan';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.platform_business_controls;
    raise exception 'FAIL: owners read the kill switch';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.platform_alerts;
    raise exception 'FAIL: owners read alerts';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.whatsapp_number_history;
    raise exception 'FAIL: owners read number history';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.ai_conversation_windows) <> 3 then raise exception 'FAIL: members read their own windows'; end if;
  raise notice 'PASS businesses can''t record usage, read our spend, approve plans or see the WazaBolt-only tables';
end $$;

-- ---------------------------------------------------------------------------
-- The WazaBolt team: approve with payment, renew, expire
-- ---------------------------------------------------------------------------
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  b uuid := (select biz from ids);
  s public.subscriptions;
  u record;
  r record;
  v_end timestamptz;
begin
  perform public.approve_plan_change((select id from req where label = 'annual'), 83330, 'mobile_money', 'MP2610.1234', null, 3);
  select * into s from public.subscriptions where business_id = b;
  if s.plan_id <> 'starter' or s.billing_interval <> 'year' or s.current_period_end <> s.current_period_start + interval '1 year' then raise exception 'FAIL: annual Starter for a year (%)', row(s.*); end if;
  if (select amount from public.subscription_payments where business_id = b) <> 83330 then raise exception 'FAIL: payment recorded'; end if;
  select * into u from public.ai_usage_status(b);
  if u.conversation_limit <> 500 or u.period_end <> u.period_start + interval '1 month' then raise exception 'FAIL: annual plans have a monthly allowance'; end if;
  raise notice 'PASS approving records the payment; an annual plan runs a year with a monthly allowance';

  -- Renewal paid just before the end: the next period follows on, no gap and no free days.
  update public.subscriptions set billing_interval = 'month', current_period_start = now() - interval '29 days', current_period_end = now() + interval '1 day' where business_id = b;
  v_end := now() + interval '1 day';
  insert into public.plan_change_requests (business_id, from_plan_id, to_plan_id, billing_interval, kind) values (b, 'starter', 'starter', 'month', 'renewal') returning id into r;
  perform public.approve_plan_change(r.id, 10000, 'mobile_money', null, null, 3);
  select * into s from public.subscriptions where business_id = b;
  if s.current_period_start <> v_end or s.current_period_end <> v_end + interval '1 month' then raise exception 'FAIL: renewal follows on (%)', row(s.*); end if;
  raise notice 'PASS a renewal extends the current period';

  -- Not renewed: payment due at the end, Free after the grace days.
  update public.subscriptions set current_period_start = now() - interval '31 days', current_period_end = now() - interval '1 day' where business_id = b;
  select * into r from public.apply_billing_expiry(3) where business_id = b;
  if r.action <> 'payment_due' or (select status from public.subscriptions where business_id = b) <> 'past_due' then raise exception 'FAIL: payment due'; end if;
  if exists (select 1 from public.apply_billing_expiry(3) where business_id = b) then raise exception 'FAIL: payment due only once'; end if;
  update public.subscriptions set current_period_end = now() - interval '4 days' where business_id = b;
  select * into r from public.apply_billing_expiry(3) where business_id = b;
  select * into s from public.subscriptions where business_id = b;
  if r.action <> 'downgraded' or s.plan_id <> 'free' or s.status <> 'active' then raise exception 'FAIL: Free after the grace days'; end if;
  raise notice 'PASS unpaid plans are payment due for the grace days, then drop to Free';

  insert into public.platform_alerts (kind, business_id, period_key) values ('budget_80', b, '2026-10');
  begin
    insert into public.platform_alerts (kind, business_id, period_key) values ('budget_80', b, '2026-10');
    raise exception 'FAIL: duplicate alert';
  exception when unique_violation then null;
  end;
  insert into public.platform_alerts (kind, business_id, period_key) values ('spend_jump', null, '2026-10-03');
  begin
    insert into public.platform_alerts (kind, business_id, period_key) values ('spend_jump', null, '2026-10-03');
    raise exception 'FAIL: duplicate platform-wide alert';
  exception when unique_violation then null;
  end;
  raise notice 'PASS each alert is sent once';
end $$;

rollback;
