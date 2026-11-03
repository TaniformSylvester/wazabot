-- WazaBolt: plans, the AI add-on, trials and read-only access (20261103120000_plans_v2.sql).
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/plans_v2.sql
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-a990-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'plans-owner@test.local', '{"business_name":"Awa Styles"}', now(), now()),
  ('00000000-0000-4000-a990-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'plans-agent@test.local', '{"business_name":"Agent Own"}', now(), now());
create temp table t (k text primary key, v uuid) on commit drop;
insert into t select 'biz', business_id from public.business_members where user_id = '00000000-0000-4000-a990-00000000000a';
grant all on t to authenticated;
create function pg_temp.v(k text) returns uuid language sql as $$ select v from t where k = $1 $$;
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;

-- ------------------------------------------------------------------ Prices and features
do $$
begin
  if (select string_agg(id || '=' || monthly_price::int, ',' order by sort_order) from public.plans where active) <> 'boutique=3000,business=7500,multishop=15000' then
    raise exception 'FAIL: plans on sale %', (select string_agg(id || '=' || monthly_price::int, ',' order by sort_order) from public.plans where active);
  end if;
  if (select count(*) from public.plans where active and ai_conversations_per_month > 0) > 0 then raise exception 'FAIL: AI included in a plan'; end if;
  if (select (max_members, has_profit, has_reports, has_stock_history, has_payment_notes, included_branches)::text from public.plans where id = 'boutique') <> '(1,f,f,f,f,1)' then raise exception 'FAIL: Boutique features'; end if;
  if (select (max_members, has_profit, has_reports, has_stock_history, has_payment_notes, included_branches)::text from public.plans where id = 'business') <> '(3,t,t,t,t,1)' then raise exception 'FAIL: Business features'; end if;
  if (select (max_members > 3 and included_branches > 1 and has_reports) from public.plans where id = 'multishop') is not true then raise exception 'FAIL: Multi-shop'; end if;
  if (select string_agg(id || '=' || price::int || '/' || conversations, ',' order by sort_order) from public.addons) <> 'ai_basic=5000/300,ai_plus=12000/1000,ai_topup=2000/100' then raise exception 'FAIL: add-ons'; end if;
  if (select monthly_price from public.bundle_prices where plan_id = 'business' and addon_id = 'ai_basic') <> 11500 then raise exception 'FAIL: bundle'; end if;
  if public.ai_assistant_launched() then raise exception 'FAIL: AI launched by default'; end if;
  raise notice 'PASS prices, features, add-ons and the bundle; the AI assistant is off';
end $$;

-- ------------------------------------------------------------------ A new business: 14-day Business trial
do $$
declare s public.subscriptions;
begin
  select * into s from public.subscriptions where business_id = pg_temp.v('biz');
  if s.plan_id <> 'business' or s.status <> 'trialing' or s.trial_started_at is null or s.addon_id is not null then raise exception 'FAIL: new business % %', s.plan_id, s.status; end if;
  if abs(extract(epoch from (s.current_period_end - now())) - 14 * 86400) > 60 then raise exception 'FAIL: trial length'; end if;
  raise notice 'PASS a new business starts a 14-day trial of Business, with no AI add-on';
end $$;

set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a990-00000000000a');
do $$
declare f record;
begin
  select * into f from public.business_features(pg_temp.v('biz'));
  if f.access <> 'full' or not f.has_reports or f.ai_launched then raise exception 'FAIL: features during the trial %', f.access; end if;
  raise notice 'PASS during the trial: full access with the Business features';
end $$;

-- One trial per owner: a second business needs a plan.
do $$
begin
  perform public.create_business('Chez Awa', 'restaurant');
  raise exception 'FAIL: second business without a plan';
exception when sqlstate 'WB451' then
  raise notice 'PASS one trial per owner: a second business needs a plan (WB451)';
end $$;
do $$
declare v uuid;
begin
  v := public.create_business('Chez Awa', 'restaurant', 'boutique');
  insert into t values ('second', v);
  if (select (plan_id, b.needs_paid_plan)::text from public.subscriptions s join public.businesses b on b.id = s.business_id where s.business_id = v) <> '(free,t)' then raise exception 'FAIL: second business state'; end if;
  if (select access from public.business_features(v)) <> 'billing_only' then raise exception 'FAIL: second business access'; end if;
  if (select to_plan_id from public.plan_change_requests where business_id = v and status = 'pending') <> 'boutique' then raise exception 'FAIL: second business request'; end if;
  raise notice 'PASS …with a plan chosen it waits on Billing only, with its request filed';
end $$;

-- ------------------------------------------------------------------ The AI add-on: coming soon
do $$
begin
  perform public.request_plan_change(pg_temp.v('biz'), 'business', null, null, 'month', 'ai_basic', true);
  raise exception 'FAIL: AI add-on requested before launch';
exception when sqlstate 'WB460' then
  raise notice 'PASS the AI add-on can''t be requested before launch (WB460)';
end $$;
do $$
begin
  perform public.start_ai_trial(pg_temp.v('biz'), true);
  raise exception 'FAIL: AI trial before launch';
exception when sqlstate 'WB460' then
  raise notice 'PASS …nor the AI trial';
end $$;
reset role;
select public.admin_set_ai_launched(true);
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a990-00000000000a');
do $$
begin
  perform public.request_plan_change(pg_temp.v('biz'), 'business', null, null, 'month', 'ai_basic', false);
  raise exception 'FAIL: add-on without the Meta notice';
exception when sqlstate 'WB461' then
  raise notice 'PASS once launched, the add-on needs the WhatsApp (Meta) fees notice accepted (WB461)';
end $$;
do $$
declare v uuid;
begin
  v := public.request_plan_change(pg_temp.v('biz'), 'business', '+237 670 00 00 01', null, 'month', 'ai_basic', true);
  insert into t values ('req', v);
  if (select addon_id from public.plan_change_requests where id = v) <> 'ai_basic' then raise exception 'FAIL: request add-on'; end if;
  if (select meta_notice_accepted_at from public.subscriptions where business_id = pg_temp.v('biz')) is null then raise exception 'FAIL: notice not stored'; end if;
  raise notice 'PASS …accepted: the request carries the add-on and the acceptance is stored';
end $$;

-- A team member can't ask for a plan.
reset role;
insert into public.business_members (business_id, user_id, role) values (pg_temp.v('biz'), '00000000-0000-4000-a990-00000000000b', 'agent');
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a990-00000000000b');
do $$
begin
  perform public.request_plan_change(pg_temp.v('biz'), 'boutique');
  raise exception 'FAIL: agent requested a plan';
exception when insufficient_privilege then
  raise notice 'PASS only the owner or an admin asks for a plan';
end $$;
reset role;

-- ------------------------------------------------------------------ Paying during the trial
do $$
declare s public.subscriptions; trial_end timestamptz;
begin
  select current_period_end into trial_end from public.subscriptions where business_id = pg_temp.v('biz');
  update public.subscriptions set setup_fee = 15000 where business_id = pg_temp.v('biz');
  perform public.approve_plan_change(pg_temp.v('req'), 26500, 'mobile_money', 'MP261103.1234.A', null, 3, true);
  select * into s from public.subscriptions where business_id = pg_temp.v('biz');
  if s.status <> 'active' or s.plan_id <> 'business' or s.addon_id <> 'ai_basic' then raise exception 'FAIL: after payment %', s; end if;
  if abs(extract(epoch from (s.current_period_end - (trial_end + interval '1 month')))) > 5 then raise exception 'FAIL: paid month should follow the trial'; end if;
  if s.setup_fee_paid_at is null then raise exception 'FAIL: setup fee not marked paid'; end if;
  if (select (amount, method, reference, kind, addon_id)::text from public.subscription_payments where request_id = pg_temp.v('req')) <> '(26500.00,mobile_money,MP261103.1234.A,plan,ai_basic)' then raise exception 'FAIL: payment row'; end if;
  raise notice 'PASS a payment entered by hand switches the plan on; the paid month follows the trial; the setup fee is marked paid';
end $$;
do $$
begin
  perform public.admin_set_setup_fee(pg_temp.v('biz'), 5000);
  raise exception 'FAIL: setup fee outside the range';
exception when check_violation then
  raise notice 'PASS the setup fee is 0 or 10,000–25,000 FCFA';
end $$;

-- ------------------------------------------------------------------ Metering: allowance, top-ups, reset
do $$
declare u record; conv uuid; cust uuid;
begin
  select * into u from public.ai_usage_status(pg_temp.v('biz'));
  if u.conversation_limit <> 300 or u.conversations_used <> 0 or u.addon_id <> 'ai_basic' then raise exception 'FAIL: allowance %', u; end if;
  insert into public.customers (business_id, whatsapp_phone, name) values (pg_temp.v('biz'), '237670000999', 'Chantal') returning id into cust;
  insert into public.conversations (business_id, customer_id) values (pg_temp.v('biz'), cust) returning id into conv;
  insert into public.ai_conversation_windows (business_id, conversation_id, started_at, ends_at, claude_replies)
  values (pg_temp.v('biz'), conv, u.period_start + interval '1 hour', u.period_start + interval '25 hours', 2),
         (pg_temp.v('biz'), conv, u.period_start - interval '2 days', u.period_start - interval '1 day', 1),
         (pg_temp.v('biz'), conv, u.period_start + interval '2 hours', u.period_start + interval '26 hours', 0);
  select * into u from public.ai_usage_status(pg_temp.v('biz'));
  if u.conversations_used <> 1 then raise exception 'FAIL: used %', u.conversations_used; end if;
  raise notice 'PASS a conversation counts once when Claude replied, only in this usage period (each period starts at 0)';
end $$;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a990-00000000000a');
do $$
declare v uuid;
begin
  v := public.request_ai_topup(pg_temp.v('biz'));
  insert into t values ('topup', v);
  raise notice 'PASS with the add-on, the owner asks for a top-up';
end $$;
reset role;
do $$
declare u record;
begin
  perform public.approve_plan_change(pg_temp.v('topup'), 2000, 'mobile_money', 'MP-TOPUP');
  select * into u from public.ai_usage_status(pg_temp.v('biz'));
  if u.conversation_limit <> 400 or u.topup_conversations <> 100 then raise exception 'FAIL: top-up %', u; end if;
  if (select kind from public.subscription_payments where request_id = pg_temp.v('topup')) <> 'topup' then raise exception 'FAIL: top-up payment'; end if;
  raise notice 'PASS a paid top-up adds 100 conversations to this period only';
end $$;

-- ------------------------------------------------------------------ The AI trial (once per business)
reset role;
update public.subscriptions set plan_id = 'boutique', addon_id = null where business_id = pg_temp.v('biz');
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a990-00000000000a');
do $$
declare u record;
begin
  perform public.start_ai_trial(pg_temp.v('biz'), true);
  select * into u from public.ai_usage_status(pg_temp.v('biz'));
  if not u.ai_trial or u.conversation_limit <> 50 then raise exception 'FAIL: AI trial %', u; end if;
  if abs(extract(epoch from (u.period_end - now())) - 14 * 86400) > 60 then raise exception 'FAIL: AI trial length'; end if;
  raise notice 'PASS the AI trial: 50 conversations over 14 days';
end $$;
do $$
begin
  perform public.start_ai_trial(pg_temp.v('biz'), true);
  raise exception 'FAIL: second AI trial';
exception when sqlstate 'WB464' then
  raise notice 'PASS …once per business (WB464)';
end $$;
do $$
begin
  perform public.request_ai_topup(pg_temp.v('biz'));
  raise exception 'FAIL: top-up without the add-on';
exception when sqlstate 'WB462' then
  raise notice 'PASS top-ups need the AI add-on (WB462)';
end $$;
reset role;

-- ------------------------------------------------------------------ Limits on the server
do $$
begin
  insert into public.business_invitations (business_id, email, role, token_hash, expires_at)
  values (pg_temp.v('biz'), 'third@test.local', 'agent', md5(random()::text), now() + interval '7 days');
  raise exception 'FAIL: Boutique allowed a second user';
exception when sqlstate 'WB413' then
  raise notice 'PASS Boutique: one user — the database refuses another (WB413)';
end $$;
do $$
begin
  insert into public.branches (business_id, name) values (pg_temp.v('biz'), 'Second shop');
  raise exception 'FAIL: Boutique allowed a second shop';
exception when sqlstate 'WB452' then
  raise notice 'PASS Boutique: one shop — the database refuses another (WB452)';
end $$;

-- ------------------------------------------------------------------ Ended trial: read-only, data kept
do $$
declare r record; f record;
begin
  update public.subscriptions set plan_id = 'business', status = 'trialing', current_period_end = now() - interval '1 minute' where business_id = pg_temp.v('biz');
  select * into r from public.apply_billing_expiry(3) where business_id = pg_temp.v('biz');
  if r.action <> 'downgraded' then raise exception 'FAIL: trial end %', r; end if;
  select * into f from public.business_features(pg_temp.v('biz'));
  if f.plan_id <> 'free' or f.access <> 'read_only' or f.addon_id is not null then raise exception 'FAIL: after the trial %', f; end if;
  if (select count(*) from public.customers where business_id = pg_temp.v('biz')) <> 1 then raise exception 'FAIL: data lost'; end if;
  raise notice 'PASS a trial that ends unpaid becomes read-only at once (no plan); nothing is deleted';
  perform public.admin_extend_trial(pg_temp.v('biz'), 7);
  select * into f from public.business_features(pg_temp.v('biz'));
  if f.plan_id <> 'business' or f.status <> 'trialing' or f.access <> 'full' then raise exception 'FAIL: extended trial %', f; end if;
  raise notice 'PASS the WazaBolt team extends a trial: full access again';
end $$;

-- A paid period that ended: grace days, then read-only.
do $$
declare r record;
begin
  update public.subscriptions set plan_id = 'business', status = 'active', current_period_end = now() - interval '1 day' where business_id = pg_temp.v('biz');
  select * into r from public.apply_billing_expiry(3) where business_id = pg_temp.v('biz');
  if r.action <> 'payment_due' then raise exception 'FAIL: grace %', r; end if;
  update public.subscriptions set current_period_end = now() - interval '4 days' where business_id = pg_temp.v('biz');
  select * into r from public.apply_billing_expiry(3) where business_id = pg_temp.v('biz');
  if r.action <> 'downgraded' then raise exception 'FAIL: after grace %', r; end if;
  raise notice 'PASS an unpaid renewal: payment due for 3 days, then read-only';
end $$;

-- Teachers and kitchen staff see their business's plan (20261104120000_staff_plan_access.sql).
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-a990-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'plans-teacher@test.local', '{"business_name":"Teacher Own"}', now(), now());
insert into public.business_members (business_id, user_id, role) values (pg_temp.v('biz'), '00000000-0000-4000-a990-00000000000c', 'teacher');
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a990-00000000000c');
do $$
begin
  if (select plan_id from public.subscriptions where business_id = pg_temp.v('biz')) is null then raise exception 'FAIL: a teacher can''t see the plan'; end if;
  if (select access from public.business_features(pg_temp.v('biz'))) is null then raise exception 'FAIL: teacher access'; end if;
  raise notice 'PASS teachers see their business''s plan and access, like the owner';
end $$;
reset role;

-- What each AI conversation really cost (for the WazaBolt team).
do $$
begin
  if (select count(*) from public.admin_ai_conversation_costs(now() - interval '60 days') where business_id = pg_temp.v('biz')) < 1 then raise exception 'FAIL: cost rows'; end if;
  raise notice 'PASS the real Claude cost is listed per AI conversation';
end $$;

rollback;
