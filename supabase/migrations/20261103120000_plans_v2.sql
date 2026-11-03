-- WazaBolt: new plans, an optional AI add-on, trials and read-only access.
--
--   Plans (no AI)   boutique 3,000 · business 7,500 · multishop 15,000 FCFA/month
--   AI add-on       ai_basic +5,000 (300 conversations) · ai_plus +12,000 (1,000)
--                   ai_topup 2,000 one-off (+100 conversations, current period)
--   Bundles         a plan + add-on at a set price (business + ai_basic = 11,500)
--   Trial           14 days of Business for a new business; once per owner
--   AI trial        14 days or 50 conversations, once per business (only once AI launches)
--   No plan         the former "free" row: read-only, Billing still open
--
-- The AI assistant stays off until platform_settings.ai_assistant_launched is
-- true: no add-on can be requested before.
--
-- Prices mirror config/economics.ts (the admin margin page warns when they
-- differ). Additive: the old plans stay (inactive) so history keeps working;
-- nothing is deleted. There are no paying customers: every existing business
-- gets a 30-day trial (Multi-shop when it already uses more than Business
-- allows, so nobody is locked out).

-- ---------------------------------------------------------------------------
-- Plans: what each one includes
-- ---------------------------------------------------------------------------
alter table public.plans
  add column has_reports boolean not null default true,
  add column has_stock_history boolean not null default true,
  add column has_payment_notes boolean not null default true;
comment on column public.plans.has_profit is 'Expenses and estimated profit.';
comment on column public.plans.has_reports is 'The Reports page and its exports.';
comment on column public.plans.has_stock_history is 'The history of stock changes per product.';
comment on column public.plans.has_payment_notes is 'Notes on how a sale was paid (method, reference).';

insert into public.plans (id, name, monthly_price, ai_conversations_per_month, sort_order) values ('multishop', 'Multi-shop', 15000, 0, 4)
on conflict (id) do nothing;

update public.plans set name = 'Boutique', monthly_price = 3000, ai_conversations_per_month = 0, legacy_conversations_per_month = null,
  highlighted = false, active = true, sort_order = 2,
  max_products = null, max_monthly_sales = null, max_members = 1, report_days = null, max_documents = null,
  has_profit = false, has_reports = false, has_stock_history = false, has_payment_notes = false,
  max_students = 200, max_report_card_students = 200, has_bulk_report_cards = true, has_school_reports = false,
  included_branches = 1, extra_branch_price = null
where id = 'boutique';

update public.plans set name = 'Business', monthly_price = 7500, ai_conversations_per_month = 0, legacy_conversations_per_month = null,
  highlighted = true, active = true, sort_order = 3,
  max_products = null, max_monthly_sales = null, max_members = 3, report_days = null, max_documents = null,
  has_profit = true, has_reports = true, has_stock_history = true, has_payment_notes = true,
  max_students = 500, max_report_card_students = 500, has_bulk_report_cards = true, has_school_reports = true,
  included_branches = 1, extra_branch_price = null
where id = 'business';

update public.plans set name = 'Multi-shop', monthly_price = 15000, ai_conversations_per_month = 0, legacy_conversations_per_month = null,
  highlighted = false, active = true, sort_order = 4,
  max_products = null, max_monthly_sales = null, max_members = 10, report_days = null, max_documents = null,
  has_profit = true, has_reports = true, has_stock_history = true, has_payment_notes = true,
  max_students = null, max_report_card_students = null, has_bulk_report_cards = true, has_school_reports = true,
  included_branches = 3, extra_branch_price = 5000
where id = 'multishop';

-- The old paid plans stay for history; nobody can ask for them any more.
update public.plans set active = false, highlighted = false where id in ('starter', 'pro');
-- "free" is now "no plan": a trial or a paid period that ended. Read-only (lib/billing/access.ts), not on sale.
update public.plans set name = 'No plan', active = false, ai_conversations_per_month = 0, legacy_conversations_per_month = null,
  has_reports = false, has_stock_history = false, has_payment_notes = false, sort_order = 9
where id = 'free';

-- ---------------------------------------------------------------------------
-- AI add-ons and bundle prices
-- ---------------------------------------------------------------------------
create table public.addons (
  id text primary key check (id ~ '^[a-z0-9_]{2,32}$'),
  name text not null check (char_length(name) <= 60),
  -- recurring: billed with the plan each period; topup: paid once, for the current usage period only.
  kind text not null check (kind in ('recurring', 'topup')),
  -- FCFA: per month for a recurring add-on, once for a top-up.
  price numeric(14, 2) not null check (price >= 0),
  conversations integer not null check (conversations > 0),
  active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);
insert into public.addons (id, name, kind, price, conversations, sort_order) values
  ('ai_basic', 'AI Basic', 'recurring', 5000, 300, 1),
  ('ai_plus', 'AI Plus', 'recurring', 12000, 1000, 2),
  ('ai_topup', 'Top-up', 'topup', 2000, 100, 3);
alter table public.addons enable row level security;
create policy "addons: anyone reads" on public.addons for select to anon, authenticated using (true);
revoke all on public.addons from anon, authenticated;
grant select on public.addons to anon, authenticated;
grant all on public.addons to service_role;

/* A plan and an add-on together for a set monthly price (instead of the two prices added up). */
create table public.bundle_prices (
  plan_id text not null references public.plans (id),
  addon_id text not null references public.addons (id),
  monthly_price numeric(14, 2) not null check (monthly_price >= 0),
  primary key (plan_id, addon_id)
);
insert into public.bundle_prices (plan_id, addon_id, monthly_price) values ('business', 'ai_basic', 11500);
alter table public.bundle_prices enable row level security;
create policy "bundle_prices: anyone reads" on public.bundle_prices for select to anon, authenticated using (true);
revoke all on public.bundle_prices from anon, authenticated;
grant select on public.bundle_prices to anon, authenticated;
grant all on public.bundle_prices to service_role;

-- ---------------------------------------------------------------------------
-- Platform switches (the WazaBolt team; read through functions)
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  key text primary key check (key ~ '^[a-z0-9_]{2,64}$'),
  value jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (key, value) values ('ai_assistant_launched', 'false'::jsonb);
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;
grant all on public.platform_settings to service_role;

/* Is the WhatsApp AI assistant launched? Until then it's "coming soon" everywhere and can't be bought. */
create function public.ai_assistant_launched()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select value = 'true'::jsonb from public.platform_settings where key = 'ai_assistant_launched'), false);
$$;
revoke execute on function public.ai_assistant_launched() from public;
grant execute on function public.ai_assistant_launched() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Subscriptions: add-on, trials, setup fee, Meta notice
-- ---------------------------------------------------------------------------
alter table public.subscriptions
  add column addon_id text references public.addons (id),
  add column trial_started_at timestamptz,
  add column ai_trial_started_at timestamptz,
  add column ai_trial_ends_at timestamptz,
  add column meta_notice_accepted_at timestamptz,
  add column setup_fee numeric(14, 2) not null default 0 check (setup_fee = 0 or setup_fee between 10000 and 25000),
  add column setup_fee_paid_at timestamptz;
comment on column public.subscriptions.addon_id is 'The AI add-on billed with the plan (a recurring one); null: no AI (the default).';
comment on column public.subscriptions.trial_started_at is 'When the free trial of the plan started (status trialing until current_period_end). Once per owner.';
comment on column public.subscriptions.ai_trial_started_at is 'The AI trial (14 days or 50 conversations, whichever first). Once per business.';
comment on column public.subscriptions.meta_notice_accepted_at is 'When the owner accepted that WhatsApp (Meta) may charge them directly for some messages.';
comment on column public.subscriptions.setup_fee is 'One-off setup fee set by WazaBolt for this business (0: none).';

alter table public.subscriptions add constraint subscriptions_addon_recurring
  check (addon_id is null or addon_id in ('ai_basic', 'ai_plus'));

-- Requests carry the add-on wanted with the plan (null: none), or a top-up.
alter table public.plan_change_requests
  add column addon_id text references public.addons (id),
  add column meta_notice_accepted_at timestamptz;
alter table public.plan_change_requests drop constraint plan_change_requests_kind_check;
alter table public.plan_change_requests add constraint plan_change_requests_kind_check check (kind in ('change', 'renewal', 'branches', 'topup'));

alter table public.subscription_payments
  add column kind text not null default 'plan' check (kind in ('plan', 'topup', 'setup_fee')),
  add column addon_id text references public.addons (id);
comment on column public.subscription_payments.kind is 'plan: the plan (and its AI add-on) for a period; topup: extra AI conversations; setup_fee: the one-off setup fee.';

/* Extra AI conversations bought for one usage period. */
create table public.ai_topups (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  conversations integer not null check (conversations > 0),
  period_start timestamptz not null,
  period_end timestamptz not null check (period_end > period_start),
  request_id uuid references public.plan_change_requests (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ai_topups_business_idx on public.ai_topups (business_id, period_start);
alter table public.ai_topups enable row level security;
create policy "ai_topups: members read" on public.ai_topups for select to authenticated using (public.is_business_member(business_id));
revoke all on public.ai_topups from anon, authenticated;
grant select on public.ai_topups to authenticated;
grant all on public.ai_topups to service_role;

-- ---------------------------------------------------------------------------
-- Trials: one per owner
-- ---------------------------------------------------------------------------
/* Has this user already had a free trial on a business they own (other than p_except)? */
create function public._owner_used_trial(p_user uuid, p_except uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members m
    join public.subscriptions s on s.business_id = m.business_id
    where m.user_id = p_user and m.role = 'owner' and s.trial_started_at is not null and m.business_id is distinct from p_except
  );
$$;
revoke execute on function public._owner_used_trial(uuid, uuid) from public, anon, authenticated;

-- A new business starts its 14-day trial of Business, unless it's an extra one
-- of an owner who already had a trial (needs_paid_plan): Billing only until paid.
create or replace function public.businesses_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.needs_paid_plan then
    insert into public.subscriptions (business_id, plan_id) values (new.id, 'free') on conflict do nothing;
  else
    insert into public.subscriptions (business_id, plan_id, status, trial_started_at, current_period_start, current_period_end)
    values (new.id, 'business', 'trialing', now(), now(), now() + interval '14 days') on conflict do nothing;
  end if;
  insert into public.whatsapp_connections (business_id) values (new.id) on conflict do nothing;
  insert into public.business_counters (business_id) values (new.id) on conflict do nothing;
  return null;
end;
$$;
revoke execute on function public.businesses_after_insert() from public, anon, authenticated;

/* The signed-in user adds a business they own: one trial per owner, so a second business needs a plan (WB451). */
create or replace function public.create_business(
  p_name text, p_industry text default null, p_plan text default null,
  p_interval text default 'month', p_contact_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := left(btrim(coalesce(p_name, '')), 120);
  v_from public.businesses%rowtype;
  v_locale text;
  v_needs_paid boolean;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_interval not in ('month', 'year') then
    raise exception 'unknown billing interval' using errcode = '22023';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'business name required' using errcode = '22023';
  end if;
  if p_industry is not null and p_industry not in ('retail', 'restaurant', 'hotel', 'fashion', 'beauty', 'real_estate', 'school', 'services', 'other') then
    raise exception 'unknown business type' using errcode = '22023';
  end if;
  if (select count(*) from public.business_members where user_id = v_user and role = 'owner') >= 20 then
    raise exception 'too many businesses' using errcode = 'WB450';
  end if;

  v_needs_paid := public._owner_used_trial(v_user);
  if v_needs_paid and (p_plan is null or not exists (select 1 from public.plans where id = p_plan and active and monthly_price > 0)) then
    raise exception 'one trial per owner: choose a plan' using errcode = 'WB451';
  end if;

  select b.* into v_from
  from public.businesses b join public.business_members m on m.business_id = b.id
  where m.user_id = v_user and m.role = 'owner'
  order by b.created_at desc limit 1;
  select ui_locale into v_locale from public.users where id = v_user;

  insert into public.businesses (name, industry, country_code, currency, timezone, default_language, needs_paid_plan)
  values (
    v_name, p_industry,
    coalesce(v_from.country_code, 'CM'), coalesce(v_from.currency, 'XAF'), coalesce(v_from.timezone, 'Africa/Douala'),
    coalesce(v_from.default_language, nullif(v_locale, ''), 'en'),
    v_needs_paid
  )
  returning id into v_id;

  insert into public.business_languages (business_id, language_code, sort_order)
  select v_id, language_code, sort_order from public.business_languages where business_id = v_from.id
  on conflict do nothing;
  insert into public.business_languages (business_id, language_code, sort_order)
  select v_id, default_language, 0 from public.businesses where id = v_id
  on conflict do nothing;

  insert into public.ai_settings (business_id) values (v_id);
  insert into public.business_members (business_id, user_id, role) values (v_id, v_user, 'owner');
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_id, v_user, 'business.created', 'business', v_id::text, jsonb_build_object('added_by_owner', true, 'needs_paid_plan', v_needs_paid));

  if v_needs_paid then
    insert into public.plan_change_requests (business_id, from_plan_id, to_plan_id, contact_phone, requested_by, billing_interval, note)
    values (v_id, 'free', p_plan, nullif(left(btrim(coalesce(p_contact_phone, '')), 40), ''), v_user, p_interval,
            'New business added by an owner who already had a free trial.');
  end if;
  return v_id;
end;
$$;
revoke execute on function public.create_business(text, text, text, text, text) from public, anon;
grant execute on function public.create_business(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- What a business may use (one definition for the app: lib/billing/entitlements.ts)
-- ---------------------------------------------------------------------------
/*
 * access: full         trial or paid period running (or in its payment grace days)
 *         read_only    no plan: the trial or paid period ended unpaid — data can be seen and exported
 *         billing_only an extra business waiting for its first paid plan
 */
create function public.business_features(p_business_id uuid)
returns table (
  plan_id text, plan_name text, status text, access text, billing_interval text,
  current_period_start timestamptz, current_period_end timestamptz, trial_started_at timestamptz,
  has_profit boolean, has_reports boolean, has_stock_history boolean, has_payment_notes boolean,
  max_members integer, members_used integer, branch_allowance integer, branches_used integer,
  addon_id text, ai_launched boolean, ai_trial_started_at timestamptz, ai_trial_ends_at timestamptz,
  meta_notice_accepted_at timestamptz, setup_fee numeric, setup_fee_paid_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' and not public.is_business_member(p_business_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select p.id, p.name, s.status,
         case when b.needs_paid_plan and s.plan_id = 'free' then 'billing_only'
              when s.plan_id = 'free' then 'read_only'
              else 'full' end,
         s.billing_interval, s.current_period_start, s.current_period_end, s.trial_started_at,
         p.has_profit, p.has_reports, p.has_stock_history, p.has_payment_notes,
         p.max_members,
         (select count(*)::int from public.business_members where business_id = p_business_id and public._seat_group(role::text) is null),
         public.branch_allowance(p_business_id),
         (select count(*)::int from public.branches where business_id = p_business_id and active),
         s.addon_id, public.ai_assistant_launched(), s.ai_trial_started_at, s.ai_trial_ends_at,
         s.meta_notice_accepted_at, s.setup_fee, s.setup_fee_paid_at
  from public.businesses b
  join public.subscriptions s on s.business_id = b.id
  join public.plans p on p.id = s.plan_id
  where b.id = p_business_id;
end;
$$;
revoke execute on function public.business_features(uuid) from public, anon;
grant execute on function public.business_features(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Asking for a plan (with or without the AI add-on), or a top-up
-- ---------------------------------------------------------------------------
drop function public.request_plan_change(uuid, text, text, text, text);

create function public.request_plan_change(
  p_business_id uuid, p_plan_id text, p_contact_phone text default null, p_note text default null,
  p_interval text default 'month', p_addon_id text default null, p_accept_meta_notice boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_kind text := 'change';
  v_id uuid;
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_interval not in ('month', 'year') then
    raise exception 'unknown interval' using errcode = '22023';
  end if;
  if not exists (select 1 from public.plans where id = p_plan_id and active and monthly_price > 0) then
    raise exception 'unknown plan' using errcode = '22023';
  end if;
  if p_addon_id is not null then
    if not public.ai_assistant_launched() then
      raise exception 'the AI assistant is not available yet' using errcode = 'WB460';
    end if;
    if not exists (select 1 from public.addons where id = p_addon_id and active and kind = 'recurring') then
      raise exception 'unknown add-on' using errcode = '22023';
    end if;
  end if;
  select * into v_sub from public.subscriptions where business_id = p_business_id;
  if p_addon_id is not null and v_sub.meta_notice_accepted_at is null and not p_accept_meta_notice then
    raise exception 'the WhatsApp (Meta) fees notice must be accepted' using errcode = 'WB461';
  end if;
  -- The same plan and add-on again, paid: a renewal (or a switch between monthly and annual).
  if v_sub.plan_id = p_plan_id and v_sub.addon_id is not distinct from p_addon_id and v_sub.status <> 'trialing' then
    v_kind := 'renewal';
  end if;
  update public.plan_change_requests set status = 'cancelled', decided_at = now()
  where business_id = p_business_id and status = 'pending';
  insert into public.plan_change_requests (business_id, from_plan_id, to_plan_id, addon_id, contact_phone, note, requested_by, billing_interval, kind, meta_notice_accepted_at)
  values (p_business_id, v_sub.plan_id, p_plan_id, p_addon_id, nullif(btrim(p_contact_phone), ''), nullif(btrim(p_note), ''), (select auth.uid()), p_interval, v_kind,
          case when p_addon_id is not null and p_accept_meta_notice then now() end)
  returning id into v_id;
  if p_addon_id is not null and p_accept_meta_notice and v_sub.meta_notice_accepted_at is null then
    update public.subscriptions set meta_notice_accepted_at = now(), updated_at = now() where business_id = p_business_id;
  end if;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, (select auth.uid()), 'plan.change_requested', 'plan_change_request', v_id::text,
          jsonb_build_object('from', v_sub.plan_id, 'to', p_plan_id, 'addon', p_addon_id, 'interval', p_interval, 'kind', v_kind));
  return v_id;
end;
$$;
revoke execute on function public.request_plan_change(uuid, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.request_plan_change(uuid, text, text, text, text, text, boolean) to authenticated;

/* A one-off top-up of AI conversations for the current usage period (needs the AI add-on). */
create function public.request_ai_topup(p_business_id uuid, p_contact_phone text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_id uuid;
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not public.ai_assistant_launched() then
    raise exception 'the AI assistant is not available yet' using errcode = 'WB460';
  end if;
  select * into v_sub from public.subscriptions where business_id = p_business_id;
  if v_sub.addon_id is null or v_sub.plan_id = 'free' then
    raise exception 'top-ups need the AI add-on' using errcode = 'WB462';
  end if;
  -- A top-up waits alongside nothing else: a newer request replaces the pending one.
  update public.plan_change_requests set status = 'cancelled', decided_at = now()
  where business_id = p_business_id and status = 'pending';
  insert into public.plan_change_requests (business_id, from_plan_id, to_plan_id, addon_id, contact_phone, requested_by, billing_interval, kind)
  values (p_business_id, v_sub.plan_id, v_sub.plan_id, 'ai_topup', nullif(btrim(p_contact_phone), ''), (select auth.uid()), v_sub.billing_interval, 'topup')
  returning id into v_id;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, (select auth.uid()), 'ai.topup_requested', 'plan_change_request', v_id::text, '{}'::jsonb);
  return v_id;
end;
$$;
revoke execute on function public.request_ai_topup(uuid, text) from public, anon;
grant execute on function public.request_ai_topup(uuid, text) to authenticated;

/* Starts the AI trial (once per business, only once AI launches). The Meta fees notice must be accepted. */
create function public.start_ai_trial(p_business_id uuid, p_accept_meta_notice boolean)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_ends timestamptz := now() + interval '14 days';
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not public.ai_assistant_launched() then
    raise exception 'the AI assistant is not available yet' using errcode = 'WB460';
  end if;
  if not p_accept_meta_notice then
    raise exception 'the WhatsApp (Meta) fees notice must be accepted' using errcode = 'WB461';
  end if;
  select * into v_sub from public.subscriptions where business_id = p_business_id for update;
  if v_sub.plan_id = 'free' then
    raise exception 'needs a plan' using errcode = 'WB463';
  end if;
  if v_sub.ai_trial_started_at is not null or v_sub.addon_id is not null then
    raise exception 'the AI trial was already used' using errcode = 'WB464';
  end if;
  update public.subscriptions
  set ai_trial_started_at = now(), ai_trial_ends_at = v_ends, meta_notice_accepted_at = coalesce(meta_notice_accepted_at, now()), updated_at = now()
  where business_id = p_business_id;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, (select auth.uid()), 'ai.trial_started', 'subscription', p_business_id::text, jsonb_build_object('ends', v_ends));
  return v_ends;
end;
$$;
revoke execute on function public.start_ai_trial(uuid, boolean) from public, anon;
grant execute on function public.start_ai_trial(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Approving a request with its payment (the WazaBolt team, service role)
-- ---------------------------------------------------------------------------
drop function public.approve_plan_change(uuid, numeric, text, text, uuid, integer);

create function public.approve_plan_change(
  p_request_id uuid, p_amount numeric default null, p_method text default 'mobile_money', p_reference text default null,
  p_actor uuid default null, p_grace_days integer default 3, p_setup_fee_paid boolean default false
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
  v_usage record;
begin
  select * into v_req from public.plan_change_requests where id = p_request_id and status = 'pending' for update;
  if not found then
    raise exception 'no pending request with this id' using errcode = '22023';
  end if;
  select * into v_sub from public.subscriptions where business_id = v_req.business_id for update;

  -- Extra branches: the number changes now; the plan and its period stay as they are.
  if v_req.kind = 'branches' then
    update public.subscriptions set extra_branches = v_req.extra_branches, updated_at = now() where business_id = v_req.business_id;
    update public.plan_change_requests set status = 'approved', decided_at = now() where id = p_request_id;
    if p_amount is not null then
      insert into public.subscription_payments (business_id, plan_id, billing_interval, amount, method, reference, request_id, period_start, period_end, recorded_by)
      values (v_req.business_id, v_sub.plan_id, v_sub.billing_interval, p_amount, p_method, nullif(btrim(p_reference), ''), p_request_id, now(), v_sub.current_period_end, p_actor);
    end if;
    insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
    values (v_req.business_id, p_actor, 'plan.branches_changed', 'subscription', v_req.business_id::text,
            jsonb_build_object('from', v_sub.extra_branches, 'to', v_req.extra_branches, 'request', p_request_id, 'amount', p_amount));
    return;
  end if;

  -- A top-up: extra conversations for the current usage period.
  if v_req.kind = 'topup' then
    select * into v_usage from public.ai_usage_status(v_req.business_id);
    insert into public.ai_topups (business_id, conversations, period_start, period_end, request_id, created_by)
    values (v_req.business_id, (select conversations from public.addons where id = 'ai_topup'), v_usage.period_start, v_usage.period_end, p_request_id, p_actor);
    update public.plan_change_requests set status = 'approved', decided_at = now() where id = p_request_id;
    if p_amount is not null then
      insert into public.subscription_payments (business_id, plan_id, billing_interval, amount, method, reference, request_id, period_start, period_end, recorded_by, kind, addon_id)
      values (v_req.business_id, v_sub.plan_id, v_sub.billing_interval, p_amount, p_method, nullif(btrim(p_reference), ''), p_request_id,
              v_usage.period_start, v_usage.period_end, p_actor, 'topup', 'ai_topup');
    end if;
    insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
    values (v_req.business_id, p_actor, 'ai.topup_added', 'subscription', v_req.business_id::text, jsonb_build_object('request', p_request_id, 'amount', p_amount));
    return;
  end if;

  -- Paying during a trial or before the period ends: the paid period follows on.
  if v_sub.plan_id <> 'free' and v_sub.current_period_end > now() - make_interval(days => p_grace_days)
     and (v_sub.plan_id = v_req.to_plan_id or v_sub.status = 'trialing') then
    v_start := greatest(v_sub.current_period_end, now());
  end if;
  v_end := v_start + case when v_req.billing_interval = 'year' then interval '1 year' else interval '1 month' end;
  update public.subscriptions
  set plan_id = v_req.to_plan_id, addon_id = v_req.addon_id, billing_interval = v_req.billing_interval, status = 'active',
      current_period_start = v_start,
      current_period_end = v_end,
      rules_from = least(rules_from, now()), updated_at = now(),
      meta_notice_accepted_at = coalesce(meta_notice_accepted_at, v_req.meta_notice_accepted_at),
      setup_fee_paid_at = case when p_setup_fee_paid and setup_fee > 0 then coalesce(setup_fee_paid_at, now()) else setup_fee_paid_at end,
      extra_branches = case when (select extra_branch_price from public.plans where id = v_req.to_plan_id) is null then 0 else extra_branches end
  where business_id = v_req.business_id;
  -- An extra business waiting for its first plan is ready to use.
  update public.businesses set needs_paid_plan = false where id = v_req.business_id and needs_paid_plan;
  update public.plan_change_requests set status = 'approved', decided_at = now() where id = p_request_id;
  if p_amount is not null then
    insert into public.subscription_payments (business_id, plan_id, billing_interval, amount, method, reference, request_id, period_start, period_end, recorded_by, kind, addon_id)
    values (v_req.business_id, v_req.to_plan_id, v_req.billing_interval, p_amount, p_method, nullif(btrim(p_reference), ''), p_request_id, v_start, v_end, p_actor, 'plan', v_req.addon_id);
  end if;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_req.business_id, p_actor, 'plan.changed', 'subscription', v_req.business_id::text,
          jsonb_build_object('from', v_req.from_plan_id, 'to', v_req.to_plan_id, 'addon', v_req.addon_id, 'interval', v_req.billing_interval, 'kind', v_req.kind,
                             'request', p_request_id, 'amount', p_amount, 'period_end', v_end, 'setup_fee_paid', p_setup_fee_paid));
end;
$$;
revoke execute on function public.approve_plan_change(uuid, numeric, text, text, uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.approve_plan_change(uuid, numeric, text, text, uuid, integer, boolean) to service_role;

/* WazaBolt team: the one-off setup fee of a business (0 or 10,000–25,000 FCFA). */
create function public.admin_set_setup_fee(p_business_id uuid, p_amount numeric, p_actor uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.subscriptions set setup_fee = p_amount, updated_at = now() where business_id = p_business_id;
  if not found then
    raise exception 'unknown business' using errcode = '22023';
  end if;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, p_actor, 'billing.setup_fee_set', 'subscription', p_business_id::text, jsonb_build_object('amount', p_amount));
end;
$$;
revoke execute on function public.admin_set_setup_fee(uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function public.admin_set_setup_fee(uuid, numeric, uuid) to service_role;

/* WazaBolt team: give a business more trial days (also restarts an ended trial). */
create function public.admin_extend_trial(p_business_id uuid, p_days integer, p_actor uuid default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_end timestamptz;
begin
  if p_days not between 1 and 90 then
    raise exception 'between 1 and 90 days' using errcode = '22023';
  end if;
  select * into v_sub from public.subscriptions where business_id = p_business_id for update;
  if not found then
    raise exception 'unknown business' using errcode = '22023';
  end if;
  if v_sub.status = 'active' and v_sub.plan_id <> 'free' then
    raise exception 'this business is on a paid plan' using errcode = '22023';
  end if;
  v_end := greatest(case when v_sub.status = 'trialing' then v_sub.current_period_end else now() end, now()) + make_interval(days => p_days);
  update public.subscriptions
  set plan_id = case when plan_id = 'free' then 'business' else plan_id end, status = 'trialing',
      trial_started_at = coalesce(trial_started_at, now()),
      current_period_start = case when status = 'trialing' then current_period_start else now() end,
      current_period_end = v_end, updated_at = now()
  where business_id = p_business_id;
  update public.businesses set needs_paid_plan = false where id = p_business_id and needs_paid_plan;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, p_actor, 'billing.trial_extended', 'subscription', p_business_id::text, jsonb_build_object('days', p_days, 'ends', v_end));
  return v_end;
end;
$$;
revoke execute on function public.admin_extend_trial(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.admin_extend_trial(uuid, integer, uuid) to service_role;

/* WazaBolt team: launch (or pause) the WhatsApp AI assistant for everyone. */
create function public.admin_set_ai_launched(p_on boolean, p_actor uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.platform_settings (key, value, updated_by, updated_at) values ('ai_assistant_launched', to_jsonb(p_on), p_actor, now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
$$;
revoke execute on function public.admin_set_ai_launched(boolean, uuid) from public, anon, authenticated;
grant execute on function public.admin_set_ai_launched(boolean, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Daily: ended trials and unpaid periods become read-only ("no plan")
-- ---------------------------------------------------------------------------
create or replace function public.apply_billing_expiry(p_grace_days integer default 3)
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
    select s.business_id, s.plan_id, s.status, s.current_period_end from public.subscriptions s
    where s.plan_id <> 'free' and s.current_period_end <= now() and s.status in ('active', 'trialing', 'past_due')
    for update of s
  loop
    -- A trial ends on its last day (nothing was paid, so no grace days).
    if r.status = 'trialing' or r.current_period_end <= now() - make_interval(days => p_grace_days) then
      update public.subscriptions
      set plan_id = 'free', addon_id = null, billing_interval = 'month', status = 'active', current_period_start = v_month,
          current_period_end = v_month + interval '1 month', rules_from = least(rules_from, now()), updated_at = now()
      where subscriptions.business_id = r.business_id;
      insert into public.audit_logs (business_id, action, entity_type, entity_id, metadata)
      values (r.business_id, case when r.status = 'trialing' then 'trial.ended' else 'plan.expired' end, 'subscription', r.business_id::text,
              jsonb_build_object('from', r.plan_id, 'period_end', r.current_period_end));
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
  where s.plan_id = 'free' and s.current_period_end <= now();
end;
$$;
revoke execute on function public.apply_billing_expiry(integer) from public, anon, authenticated;
grant execute on function public.apply_billing_expiry(integer) to service_role;

-- ---------------------------------------------------------------------------
-- AI usage: the add-on's allowance, top-ups and the AI trial
-- ---------------------------------------------------------------------------
drop function public.ai_usage_status(uuid);

/*
 * The AI conversations included for the current usage period and how many are
 * used — one definition for the dashboard, Billing and the AI pipeline.
 *   AI add-on   its conversations + top-ups, per month of the subscription
 *               period (annual: each month of the year)
 *   AI trial    50 conversations from its start until it ends (14 days)
 *   neither     0 (the assistant doesn't answer)
 * A conversation is one customer's 24-hour window in which Claude replied.
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
  monthly_price numeric,
  addon_id text,
  topup_conversations integer,
  ai_trial boolean
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
  v_limit integer := 0;
  v_topups integer := 0;
  v_trial boolean := false;
begin
  if (select auth.role()) is distinct from 'service_role' and not public.is_business_member(p_business_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into s from public.subscriptions where business_id = p_business_id;
  if not found then
    return;
  end if;
  select * into p from public.plans where id = s.plan_id;

  if s.addon_id is null and s.ai_trial_started_at is not null and now() < s.ai_trial_ends_at and s.plan_id <> 'free' then
    -- The AI trial: 50 conversations over its 14 days.
    v_trial := true;
    v_start := s.ai_trial_started_at;
    v_end := s.ai_trial_ends_at;
    v_limit := 50;
  elsif s.plan_id <> 'free' then
    v_months := greatest(0, (extract(year from age(now(), s.current_period_start)) * 12 + extract(month from age(now(), s.current_period_start)))::int);
    v_start := s.current_period_start + make_interval(months => v_months);
    v_end := v_start + interval '1 month';
    if s.addon_id is not null then
      select coalesce(sum(t.conversations), 0)::int into v_topups from public.ai_topups t
      where t.business_id = p_business_id and t.period_start < v_end and t.period_end > v_start;
      v_limit := (select a.conversations from public.addons a where a.id = s.addon_id) + v_topups;
    end if;
  else
    v_start := v_month;
    v_end := v_month + interval '1 month';
  end if;
  select count(*)::int into v_used from public.ai_conversation_windows w
  where w.business_id = p_business_id and w.claude_replies > 0 and w.started_at >= v_start and w.started_at < v_end;
  return query select p.id, p.name, v_limit, v_used, v_start, v_end,
    'windows'::text, s.rules_from, s.billing_interval, s.status, s.current_period_end, p.monthly_price,
    s.addon_id, v_topups, v_trial;
end;
$$;
revoke execute on function public.ai_usage_status(uuid) from public, anon;
grant execute on function public.ai_usage_status(uuid) to authenticated, service_role;

/*
 * WazaBolt team: what each AI conversation really cost us (Claude), to check
 * prices against real use. One row per 24-hour conversation window.
 */
create function public.admin_ai_conversation_costs(p_since timestamptz)
returns table (window_id uuid, business_id uuid, started_at timestamptz, claude_replies integer, rule_replies integer, calls integer, cost_fcfa numeric, cost_usd numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.business_id, w.started_at, w.claude_replies, w.rule_replies,
         count(c.id)::int, coalesce(sum(c.cost_fcfa), 0), coalesce(sum(c.cost_usd), 0)
  from public.ai_conversation_windows w
  left join public.ai_usage u on u.business_id = w.business_id and u.conversation_id = w.conversation_id
                             and u.created_at >= w.started_at and u.created_at < w.ends_at
  left join public.claude_calls c on c.ai_usage_id = u.id
  where w.started_at >= p_since
  group by w.id
  order by w.started_at;
$$;
revoke execute on function public.admin_ai_conversation_costs(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_ai_conversation_costs(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Existing businesses: a 30-day trial (no paying customers yet)
-- ---------------------------------------------------------------------------
-- Pending requests for a plan that's gone point at its successor.
update public.plan_change_requests set to_plan_id = case to_plan_id when 'starter' then 'business' when 'pro' then 'multishop' else to_plan_id end
where status = 'pending' and to_plan_id in ('starter', 'pro');
update public.plan_change_requests set status = 'cancelled', decided_at = now()
where status = 'pending' and to_plan_id = 'free';

-- An extra business whose paid plan was approved no longer waits (approve_plan_change now clears this itself).
update public.businesses b set needs_paid_plan = false
where b.needs_paid_plan and exists (select 1 from public.subscriptions s where s.business_id = b.id and s.plan_id <> 'free');

-- Businesses already using more users or locations than Business allows get the Multi-shop trial.
update public.subscriptions s
set plan_id = case
      when (select count(*) from public.branches br where br.business_id = s.business_id and br.active) > 1
        or (select count(*) from public.business_members m where m.business_id = s.business_id and public._seat_group(m.role::text) is null) > 3
      then 'multishop' else 'business' end,
    status = 'trialing', trial_started_at = coalesce(s.trial_started_at, now()), addon_id = null,
    billing_interval = 'month', current_period_start = now(), current_period_end = now() + interval '30 days', updated_at = now()
from public.businesses b
where b.id = s.business_id and not b.needs_paid_plan;
