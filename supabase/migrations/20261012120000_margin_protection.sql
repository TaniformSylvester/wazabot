-- WazaBolt — Step 4: protect margin
--
--   AI conversation   one customer's 24-hour window in which Claude replied
--                     (ai_conversation_windows). Businesses move to this definition at
--                     subscriptions.rules_from: paid ones at their next billing period,
--                     Free ones on 1 November 2026, new sign-ups at once. Until then the
--                     old one applies (conversations answered this calendar month).
--   Free              30 AI conversations (50 under the old rules: plans.legacy_…).
--   billing           prepaid, monthly or annual (subscriptions.billing_interval); payments
--                     recorded by the WazaBolt team (subscription_payments); renewals extend
--                     the period; unpaid → payment due for the grace days → Free
--                     (apply_billing_expiry, run daily).
--   kill switch       platform_business_controls.ai_paused (WazaBolt team only).
--   alerts            platform_alerts: one row per alert sent, so each is sent once.
--   free per number   whatsapp_number_history: a number already used by another
--                     business can't be connected on the Free plan.
--
-- Hidden budgets and their thresholds stay in config/economics.ts (never in the database).

-- ---------------------------------------------------------------------------
-- Plans and subscriptions
-- ---------------------------------------------------------------------------
alter table public.plans add column legacy_conversations_per_month integer check (legacy_conversations_per_month >= 0);
update public.plans set legacy_conversations_per_month = ai_conversations_per_month, ai_conversations_per_month = 30 where id = 'free';

alter table public.subscriptions
  add column billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  -- From this moment the business's AI conversations are 24-hour windows.
  add column rules_from timestamptz not null default now();

update public.subscriptions s
set rules_from = case
  when p.monthly_price > 0 and s.status in ('active', 'trialing', 'past_due') then greatest(s.current_period_end, now())
  else (date_trunc('month', now() at time zone 'utc') + interval '1 month') at time zone 'utc'
end
from public.plans p
where p.id = s.plan_id;

alter table public.plan_change_requests
  add column billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  add column kind text not null default 'change' check (kind in ('change', 'renewal'));

-- ---------------------------------------------------------------------------
-- AI conversations: 24-hour windows
-- ---------------------------------------------------------------------------
create table public.ai_conversation_windows (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  claude_replies integer not null default 0 check (claude_replies >= 0),
  rule_replies integer not null default 0 check (rule_replies >= 0),
  created_at timestamptz not null default now()
);
create index ai_conversation_windows_business_idx on public.ai_conversation_windows (business_id, started_at);
create index ai_conversation_windows_conversation_idx on public.ai_conversation_windows (conversation_id, ends_at desc);

alter table public.ai_conversation_windows enable row level security;
create policy "ai_conversation_windows: members read" on public.ai_conversation_windows
  for select to authenticated using (public.is_business_member(business_id));
revoke all on public.ai_conversation_windows from anon, authenticated;
grant select on public.ai_conversation_windows to authenticated;
grant all on public.ai_conversation_windows to service_role;

/*
 * Server only: count one assistant reply in the conversation's open window,
 * opening a window when there is none. Returns the window after the reply.
 */
create function public.record_ai_reply(p_business_id uuid, p_conversation_id uuid, p_claude boolean, p_window_hours integer default 24)
returns public.ai_conversation_windows
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.ai_conversation_windows;
begin
  -- One window per conversation at a time, even when two replies race.
  perform pg_advisory_xact_lock(hashtextextended(p_conversation_id::text, 0));
  select * into w from public.ai_conversation_windows
  where conversation_id = p_conversation_id and business_id = p_business_id and ends_at > now()
  order by started_at desc limit 1;
  if not found then
    insert into public.ai_conversation_windows (business_id, conversation_id, ends_at)
    values (p_business_id, p_conversation_id, now() + make_interval(hours => p_window_hours))
    returning * into w;
  end if;
  update public.ai_conversation_windows
  set claude_replies = claude_replies + case when p_claude then 1 else 0 end,
      rule_replies = rule_replies + case when p_claude then 0 else 1 end
  where id = w.id
  returning * into w;
  return w;
end;
$$;
revoke execute on function public.record_ai_reply(uuid, uuid, boolean, integer) from public, anon, authenticated;
grant execute on function public.record_ai_reply(uuid, uuid, boolean, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Usage against the plan (replaces the Stage 4 version)
-- ---------------------------------------------------------------------------
drop function public.ai_usage_status(uuid);

/*
 * The plan's allowance of AI conversations for the current usage period and
 * how much of it is used — one definition for the dashboard, the billing page
 * and the AI pipeline.
 *   old rules  calendar month (UTC); conversations the assistant answered in
 *   new rules  paid: the month of the subscription period (annual plans: each
 *              month of the year); Free: calendar month. 24-hour windows in
 *              which Claude replied.
 */
create function public.ai_usage_status(p_business_id uuid)
returns table (
  plan_id text,
  plan_name text,
  conversation_limit integer,
  conversations_used integer,
  period_start timestamptz,
  period_end timestamptz,
  counting text,
  rules_from timestamptz,
  billing_interval text,
  subscription_status text,
  current_period_end timestamptz,
  monthly_price numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
  p public.plans;
  v_month timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  v_start timestamptz;
  v_end timestamptz;
  v_months integer;
  v_used integer;
begin
  if (select auth.role()) is distinct from 'service_role' and not public.is_business_member(p_business_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into s from public.subscriptions where business_id = p_business_id;
  if not found then
    return;
  end if;
  select * into p from public.plans where id = s.plan_id;

  if now() < s.rules_from then
    v_start := v_month;
    v_end := v_month + interval '1 month';
    select count(distinct m.conversation_id)::int into v_used from public.messages m
    where m.business_id = p_business_id and m.ai_generated and m.created_at >= v_start;
    return query select p.id, p.name, coalesce(p.legacy_conversations_per_month, p.ai_conversations_per_month), v_used, v_start, v_end,
      'legacy'::text, s.rules_from, s.billing_interval, s.status, s.current_period_end, p.monthly_price;
    return;
  end if;

  if p.monthly_price > 0 then
    v_months := greatest(0, (extract(year from age(now(), s.current_period_start)) * 12 + extract(month from age(now(), s.current_period_start)))::int);
    v_start := s.current_period_start + make_interval(months => v_months);
    v_end := v_start + interval '1 month';
  else
    v_start := v_month;
    v_end := v_month + interval '1 month';
  end if;
  select count(*)::int into v_used from public.ai_conversation_windows w
  where w.business_id = p_business_id and w.claude_replies > 0 and w.started_at >= v_start and w.started_at < v_end;
  return query select p.id, p.name, p.ai_conversations_per_month, v_used, v_start, v_end,
    'windows'::text, s.rules_from, s.billing_interval, s.status, s.current_period_end, p.monthly_price;
end;
$$;
revoke execute on function public.ai_usage_status(uuid) from public, anon;
grant execute on function public.ai_usage_status(uuid) to authenticated, service_role;

/* Server only: our Claude spend for a business since a moment (the hidden budget check). */
create function public.claude_spend_since(p_business_id uuid, p_since timestamptz)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(cost_fcfa), 0) from public.claude_calls where business_id = p_business_id and created_at >= p_since;
$$;
revoke execute on function public.claude_spend_since(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.claude_spend_since(uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Payments (recorded by the WazaBolt team; a payment provider can write here later)
-- ---------------------------------------------------------------------------
create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  plan_id text not null references public.plans (id),
  billing_interval text not null check (billing_interval in ('month', 'year')),
  amount numeric(14, 2) not null check (amount >= 0),
  currency char(3) not null default 'XAF',
  method text not null check (method in ('mobile_money', 'cash', 'bank', 'other')),
  provider text not null default 'manual' check (char_length(provider) <= 40),
  reference text check (char_length(reference) <= 100),
  request_id uuid references public.plan_change_requests (id) on delete set null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index subscription_payments_business_idx on public.subscription_payments (business_id, created_at desc);

alter table public.subscription_payments enable row level security;
create policy "subscription_payments: admins read" on public.subscription_payments
  for select to authenticated using (public.has_min_role(business_id, 'admin'));
revoke all on public.subscription_payments from anon, authenticated;
grant select on public.subscription_payments to authenticated;
grant all on public.subscription_payments to service_role;

-- ---------------------------------------------------------------------------
-- Plan requests: monthly or annual, changes and renewals (replaces the Stage 4 versions)
-- ---------------------------------------------------------------------------
drop function public.request_plan_change(uuid, text, text, text);

create function public.request_plan_change(p_business_id uuid, p_plan_id text, p_contact_phone text default null, p_note text default null, p_interval text default 'month')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_price numeric;
  v_kind text := 'change';
  v_id uuid;
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_interval not in ('month', 'year') then
    raise exception 'unknown interval' using errcode = '22023';
  end if;
  select monthly_price into v_price from public.plans where id = p_plan_id and active;
  if not found then
    raise exception 'unknown plan' using errcode = '22023';
  end if;
  select * into v_sub from public.subscriptions where business_id = p_business_id;
  if v_sub.plan_id = p_plan_id then
    -- The same paid plan again is a renewal (or a switch between monthly and annual); Free needs none.
    if v_price = 0 then
      raise exception 'already on this plan' using errcode = '22023';
    end if;
    v_kind := 'renewal';
  end if;
  if v_price = 0 and p_interval = 'year' then
    raise exception 'unknown interval' using errcode = '22023';
  end if;
  update public.plan_change_requests set status = 'cancelled', decided_at = now()
  where business_id = p_business_id and status = 'pending';
  insert into public.plan_change_requests (business_id, from_plan_id, to_plan_id, contact_phone, note, requested_by, billing_interval, kind)
  values (p_business_id, v_sub.plan_id, p_plan_id, nullif(btrim(p_contact_phone), ''), nullif(btrim(p_note), ''), (select auth.uid()), p_interval, v_kind)
  returning id into v_id;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, (select auth.uid()), 'plan.change_requested', 'plan_change_request', v_id::text,
          jsonb_build_object('from', v_sub.plan_id, 'to', p_plan_id, 'interval', p_interval, 'kind', v_kind));
  return v_id;
end;
$$;
revoke execute on function public.request_plan_change(uuid, text, text, text, text) from public, anon;
grant execute on function public.request_plan_change(uuid, text, text, text, text) to authenticated;

drop function public.approve_plan_change(uuid);

/*
 * WazaBolt team only (service role). Switches to the requested plan and
 * interval and records the payment when an amount is given.
 *   renewal of the same plan, paid before the end or within the grace days:
 *     the new period follows the current one (no gap, no free days)
 *   anything else: a new period starting now
 * A business still on the old counting rules moves to the new ones with it.
 */
create function public.approve_plan_change(
  p_request_id uuid,
  p_amount numeric default null,
  p_method text default 'mobile_money',
  p_reference text default null,
  p_actor uuid default null,
  p_grace_days integer default 3
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.plan_change_requests;
  v_sub public.subscriptions;
  v_start timestamptz := now();
  v_end timestamptz;
begin
  select * into v_req from public.plan_change_requests where id = p_request_id and status = 'pending' for update;
  if not found then
    raise exception 'no pending request with this id' using errcode = '22023';
  end if;
  select * into v_sub from public.subscriptions where business_id = v_req.business_id for update;
  if v_sub.plan_id = v_req.to_plan_id and v_sub.current_period_end > now() - make_interval(days => p_grace_days) then
    v_start := v_sub.current_period_end;
  end if;
  v_end := v_start + case when v_req.billing_interval = 'year' then interval '1 year' else interval '1 month' end;
  update public.subscriptions
  set plan_id = v_req.to_plan_id, billing_interval = v_req.billing_interval, status = 'active',
      current_period_start = v_start, current_period_end = v_end,
      rules_from = least(rules_from, v_start), updated_at = now()
  where business_id = v_req.business_id;
  update public.plan_change_requests set status = 'approved', decided_at = now() where id = p_request_id;
  if p_amount is not null then
    insert into public.subscription_payments (business_id, plan_id, billing_interval, amount, method, reference, request_id, period_start, period_end, recorded_by)
    values (v_req.business_id, v_req.to_plan_id, v_req.billing_interval, p_amount, p_method, nullif(btrim(p_reference), ''), p_request_id, v_start, v_end, p_actor);
  end if;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_req.business_id, p_actor, 'plan.changed', 'subscription', v_req.business_id::text,
          jsonb_build_object('from', v_req.from_plan_id, 'to', v_req.to_plan_id, 'interval', v_req.billing_interval, 'kind', v_req.kind,
                             'request', p_request_id, 'amount', p_amount, 'period_end', v_end));
end;
$$;
revoke execute on function public.approve_plan_change(uuid, numeric, text, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.approve_plan_change(uuid, numeric, text, text, uuid, integer) to service_role;

/*
 * Daily (WazaBolt cron, service role): paid periods that ended become
 * payment due; after the grace days they drop to Free. Free periods roll over
 * each calendar month. Returns what changed, for the emails.
 */
create function public.apply_billing_expiry(p_grace_days integer default 3)
returns table (business_id uuid, action text, plan_id text, period_end timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  r record;
begin
  for r in
    select s.business_id, s.plan_id, s.status, s.current_period_end from public.subscriptions s join public.plans p on p.id = s.plan_id
    where p.monthly_price > 0 and s.current_period_end <= now() and s.status in ('active', 'trialing', 'past_due')
    for update of s
  loop
    if r.current_period_end <= now() - make_interval(days => p_grace_days) then
      update public.subscriptions
      set plan_id = 'free', billing_interval = 'month', status = 'active', current_period_start = v_month,
          current_period_end = v_month + interval '1 month', rules_from = least(rules_from, now()), updated_at = now()
      where subscriptions.business_id = r.business_id;
      insert into public.audit_logs (business_id, action, entity_type, entity_id, metadata)
      values (r.business_id, 'plan.expired', 'subscription', r.business_id::text, jsonb_build_object('from', r.plan_id, 'period_end', r.current_period_end));
      business_id := r.business_id; action := 'downgraded'; plan_id := r.plan_id; period_end := r.current_period_end;
      return next;
    elsif r.status <> 'past_due' then
      update public.subscriptions set status = 'past_due', updated_at = now() where subscriptions.business_id = r.business_id;
      business_id := r.business_id; action := 'payment_due'; plan_id := r.plan_id; period_end := r.current_period_end;
      return next;
    end if;
  end loop;

  update public.subscriptions s
  set current_period_start = v_month, current_period_end = v_month + interval '1 month', updated_at = now()
  from public.plans p
  where p.id = s.plan_id and p.monthly_price = 0 and s.current_period_end <= now();
end;
$$;
revoke execute on function public.apply_billing_expiry(integer) from public, anon, authenticated;
grant execute on function public.apply_billing_expiry(integer) to service_role;

-- ---------------------------------------------------------------------------
-- WazaBolt team controls and alerts (never visible to businesses)
-- ---------------------------------------------------------------------------
create table public.platform_business_controls (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  ai_paused boolean not null default false,
  reason text check (char_length(reason) <= 300),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.platform_business_controls enable row level security;
revoke all on public.platform_business_controls from anon, authenticated;
grant all on public.platform_business_controls to service_role;

create table public.platform_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('spend_jump', 'budget_80', 'budget_reached', 'renewal_reminder', 'payment_due', 'downgraded')),
  business_id uuid references public.businesses (id) on delete cascade,
  -- What the alert is about (a day, a usage period…): the same alert is never sent twice.
  period_key text not null check (char_length(period_key) <= 80),
  created_at timestamptz not null default now(),
  unique nulls not distinct (kind, business_id, period_key)
);
alter table public.platform_alerts enable row level security;
revoke all on public.platform_alerts from anon, authenticated;
grant all on public.platform_alerts to service_role;

-- ---------------------------------------------------------------------------
-- One Free account per WhatsApp number
-- ---------------------------------------------------------------------------
create table public.whatsapp_number_history (
  phone_number_id text not null check (char_length(phone_number_id) <= 64),
  phone_digits text check (char_length(phone_digits) <= 20),
  business_id uuid not null references public.businesses (id) on delete cascade,
  first_connected_at timestamptz not null default now(),
  primary key (phone_number_id, business_id)
);
create index whatsapp_number_history_digits_idx on public.whatsapp_number_history (phone_digits);
alter table public.whatsapp_number_history enable row level security;
revoke all on public.whatsapp_number_history from anon, authenticated;
grant all on public.whatsapp_number_history to service_role;

insert into public.whatsapp_number_history (phone_number_id, phone_digits, business_id, first_connected_at)
select phone_number_id, nullif(regexp_replace(coalesce(display_phone_number, ''), '\D', '', 'g'), ''), business_id, coalesce(connected_at, now())
from public.whatsapp_connections
where phone_number_id is not null
on conflict do nothing;
