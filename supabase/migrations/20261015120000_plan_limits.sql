-- =============================================================================
-- Plans without WhatsApp: the Boutique plan and Free-plan limits
-- =============================================================================
-- Until now every plan included all the business tools (till, stock,
-- customers, credit, expenses, reports); plans only differed in AI
-- conversations. Now:
--
--   plan       price/month  products  sales/month  users  reports      expenses & profit  AI conv.
--   free            0          30        100         1     last 7 days        no              30
--   boutique    5 000          ∞          ∞          1     full               yes              0
--   starter    10 000          ∞          ∞          2     full               yes            500
--   business   25 000          ∞          ∞          5     full               yes          2 000
--   pro        50 000          ∞          ∞         10     full               yes          5 000
--
-- "Sales" are sales and orders recorded by the team (till and dashboard);
-- orders the WhatsApp assistant records are not counted.
--
-- Businesses that already exist keep full access until 1 December 2026
-- (businesses.free_limits_from); new businesses get the Free limits at once.
-- Nothing is ever deleted: over a limit, a business simply can't add more.
--
-- The limits are enforced here (triggers), so they hold for every way in.
-- They live in the plans table so the operator can adjust them; the same
-- figures are mirrored in config/economics.ts for the website.
-- =============================================================================

alter table public.plans
  add column max_products integer check (max_products > 0),
  add column max_monthly_sales integer check (max_monthly_sales > 0),
  add column max_members integer check (max_members > 0),
  add column report_days integer check (report_days > 0),
  add column has_profit boolean not null default true;

comment on column public.plans.max_products is 'Active products allowed; null = unlimited.';
comment on column public.plans.max_monthly_sales is 'Sales/orders recorded by the team per calendar month (business time zone); null = unlimited.';
comment on column public.plans.max_members is 'Team members including the owner; null = unlimited.';
comment on column public.plans.report_days is 'How far back reports go; null = any period.';
comment on column public.plans.has_profit is 'Expenses, cost-based profit and margins.';

insert into public.plans (id, name, monthly_price, ai_conversations_per_month, highlighted, sort_order)
values ('boutique', 'Boutique', 5000, 0, false, 2)
on conflict (id) do nothing;

update public.plans set sort_order = 1, max_products = 30, max_monthly_sales = 100, max_members = 1, report_days = 7, has_profit = false where id = 'free';
update public.plans set sort_order = 2, max_members = 1 where id = 'boutique';
update public.plans set sort_order = 3, max_members = 2 where id = 'starter';
update public.plans set sort_order = 4, max_members = 5 where id = 'business';
update public.plans set sort_order = 5, max_members = 10 where id = 'pro';

-- Grace for businesses that exist today: Free limits start on 1 December 2026.
alter table public.businesses add column free_limits_from date not null default current_date;
update public.businesses set free_limits_from = '2026-12-01';
comment on column public.businesses.free_limits_from is 'From this date the Free plan limits apply to this business (grace for businesses created before the limits).';

-- ---------------------------------------------------------------------------
-- The limits in force for a business
-- ---------------------------------------------------------------------------
/* Internal (no access check): used by the triggers below. */
create function public._plan_limits(p_business_id uuid)
returns table (plan_id text, max_products integer, max_monthly_sales integer, max_members integer, report_days integer,
               has_profit boolean, enforced boolean, limits_from date)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.max_products, p.max_monthly_sales, p.max_members, p.report_days, p.has_profit,
         -- Free-plan limits wait for the business's grace date; paid plans apply at once.
         (p.id <> 'free' or current_date >= b.free_limits_from),
         case when p.id = 'free' then b.free_limits_from end
  from public.businesses b
  join public.subscriptions s on s.business_id = b.id
  join public.plans p on p.id = s.plan_id
  where b.id = p_business_id;
$$;
revoke execute on function public._plan_limits(uuid) from public, anon, authenticated;

/* For the dashboard: the plan's limits, whether they apply yet, and current usage. Members only. */
create function public.business_plan_limits(p_business_id uuid)
returns table (plan_id text, max_products integer, max_monthly_sales integer, max_members integer, report_days integer,
               has_profit boolean, enforced boolean, limits_from date,
               products_used integer, sales_this_month integer, members_used integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
begin
  if not public.has_min_role(p_business_id, 'viewer') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select timezone into v_tz from public.businesses where id = p_business_id;
  return query
  select l.plan_id, l.max_products, l.max_monthly_sales, l.max_members, l.report_days, l.has_profit, l.enforced, l.limits_from,
         (select count(*)::int from public.products where business_id = p_business_id and active),
         (select count(*)::int from public.orders
           where business_id = p_business_id and channel is distinct from 'whatsapp' and status <> 'cancelled'
             and created_at >= (date_trunc('month', now() at time zone v_tz) at time zone v_tz)),
         (select count(*)::int from public.business_members where business_id = p_business_id)
  from public._plan_limits(p_business_id) l;
end;
$$;
revoke execute on function public.business_plan_limits(uuid) from public, anon;
grant execute on function public.business_plan_limits(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Enforcement
-- ---------------------------------------------------------------------------
-- Error codes (mapped to friendly messages with an upgrade link):
--   WB411 product limit · WB412 monthly sales limit · WB413 team limit · WB414 needs a paid plan

/* Products: a new active product, or an archived one made active again. */
create function public.enforce_product_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
begin
  if not new.active or (tg_op = 'UPDATE' and old.active) then
    return new;
  end if;
  select * into l from public._plan_limits(new.business_id);
  if l.enforced and l.max_products is not null
     and (select count(*) from public.products where business_id = new.business_id and active and id <> new.id) >= l.max_products then
    raise exception 'plan limit: % active products on the % plan', l.max_products, l.plan_id using errcode = 'WB411';
  end if;
  return new;
end;
$$;
create trigger products_plan_limit before insert or update of active on public.products
  for each row execute function public.enforce_product_limit();

/* Sales and orders recorded by the team (not the WhatsApp assistant's), per calendar month. */
create function public.enforce_sales_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  v_tz text;
begin
  if new.channel = 'whatsapp' then
    return new;
  end if;
  select * into l from public._plan_limits(new.business_id);
  if not l.enforced or l.max_monthly_sales is null then
    return new;
  end if;
  select timezone into v_tz from public.businesses where id = new.business_id;
  if (select count(*) from public.orders
      where business_id = new.business_id and channel is distinct from 'whatsapp' and status <> 'cancelled'
        and created_at >= (date_trunc('month', now() at time zone v_tz) at time zone v_tz)) >= l.max_monthly_sales then
    raise exception 'plan limit: % sales a month on the % plan', l.max_monthly_sales, l.plan_id using errcode = 'WB412';
  end if;
  return new;
end;
$$;
create trigger orders_plan_limit before insert on public.orders
  for each row execute function public.enforce_sales_limit();

/* Team members (the owner counts). Checked when a member joins and when an invitation is sent. */
create function public.enforce_member_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  v_taken integer;
begin
  select * into l from public._plan_limits(new.business_id);
  if l is null or not l.enforced or l.max_members is null then
    return new;
  end if;
  v_taken := (select count(*) from public.business_members where business_id = new.business_id);
  if tg_table_name = 'business_invitations' then
    v_taken := v_taken + (select count(*) from public.business_invitations
                          where business_id = new.business_id and accepted_at is null and revoked_at is null and expires_at >= now());
  end if;
  if v_taken >= l.max_members then
    raise exception 'plan limit: % team members on the % plan', l.max_members, l.plan_id using errcode = 'WB413';
  end if;
  return new;
end;
$$;
create trigger business_members_plan_limit before insert on public.business_members
  for each row execute function public.enforce_member_limit();
create trigger business_invitations_plan_limit before insert on public.business_invitations
  for each row execute function public.enforce_member_limit();

/* Expenses are part of profit tracking: not on the Free plan. */
create function public.enforce_profit_feature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
begin
  select * into l from public._plan_limits(new.business_id);
  if l.enforced and not l.has_profit then
    raise exception 'plan limit: expenses need a paid plan (% plan)', l.plan_id using errcode = 'WB414';
  end if;
  return new;
end;
$$;
create trigger expenses_plan_limit before insert on public.expenses
  for each row execute function public.enforce_profit_feature();

revoke execute on function public.enforce_product_limit() from public, anon, authenticated;
revoke execute on function public.enforce_sales_limit() from public, anon, authenticated;
revoke execute on function public.enforce_member_limit() from public, anon, authenticated;
revoke execute on function public.enforce_profit_feature() from public, anon, authenticated;
