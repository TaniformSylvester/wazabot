/*
 * Billing standing: what a business may do while its plan is unpaid.
 *
 *  - billing_standing(): one word for the plan's state, the same in the app
 *    (lib/billing/checkEntitlements.ts) and here:
 *      trialing   the free trial is running
 *      active     a paid period is running
 *      past_due   the paid period ended: the grace days before "no plan"
 *                 (or the daily job hasn't run yet)
 *      expired    no plan (the trial or the grace days ended), or cancelled
 *  - While past_due or expired, no broadcast starts sending (nor goes on
 *    sending) and no new invitation is created. Everything else keeps
 *    working during the grace days; "no plan" stays read-only as before.
 *  - Plan requests (plans, add-ons, top-ups) come from the owner only.
 *
 * There's no separate "workspace" table: the plan lives in subscriptions
 * (one row per business), as before. Non-destructive: functions and
 * triggers only; no data is changed.
 */

create or replace function public.billing_standing(p_business_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan text;
  v_status text;
  v_end timestamptz;
begin
  if (select auth.role()) is distinct from 'service_role' and not public.is_business_staff(p_business_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select s.plan_id, s.status, s.current_period_end into v_plan, v_status, v_end
  from public.subscriptions s where s.business_id = p_business_id;
  if not found or v_plan = 'free' or v_status = 'canceled' then
    return 'expired';
  end if;
  if v_status = 'trialing' then
    -- A trial has no grace days.
    return case when v_end <= now() then 'expired' else 'trialing' end;
  end if;
  if v_status = 'past_due' or v_end <= now() then
    return 'past_due';
  end if;
  return 'active';
end;
$$;
revoke execute on function public.billing_standing(uuid) from public, anon;
grant execute on function public.billing_standing(uuid) to authenticated, service_role;

/* No new invitation while the plan is unpaid (WB421). Seat limits stay with enforce_member_limit (WB413). */
create or replace function public.invitations_need_paid_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public._billing_blocked(new.business_id) then
    raise exception 'plan unpaid: invitations are paused' using errcode = 'WB421';
  end if;
  return new;
end;
$$;

/* No broadcast starts (draft → sending) while the plan is unpaid (WB421). */
create or replace function public.broadcasts_need_paid_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'sending' and old.status is distinct from 'sending' and public._billing_blocked(new.business_id) then
    raise exception 'plan unpaid: broadcasts are paused' using errcode = 'WB421';
  end if;
  return new;
end;
$$;

/* past_due or expired, read without the caller check (triggers run for any caller). */
create or replace function public._billing_blocked(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.plan_id = 'free' or s.status in ('past_due', 'canceled') or s.current_period_end <= now()
    from public.subscriptions s where s.business_id = p_business_id
  ), true);
$$;
revoke execute on function public._billing_blocked(uuid) from public, anon, authenticated;
revoke execute on function public.invitations_need_paid_plan() from public, anon, authenticated;
revoke execute on function public.broadcasts_need_paid_plan() from public, anon, authenticated;

-- Named to run before business_invitations_plan_limit (triggers fire in name order): an unpaid plan is the reason given first.
create trigger business_invitations_need_paid_plan before insert on public.business_invitations
  for each row execute function public.invitations_need_paid_plan();
create trigger broadcasts_need_paid_plan before update of status on public.broadcasts
  for each row execute function public.broadcasts_need_paid_plan();

/* Plan requests (plans, add-ons, top-ups) from a signed-in member: the owner only. */
create or replace function public.plan_requests_owner_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.has_min_role(new.business_id, 'owner') then
    raise exception 'only the owner manages billing' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.plan_requests_owner_only() from public, anon, authenticated;
create trigger plan_requests_owner_only before insert on public.plan_change_requests
  for each row execute function public.plan_requests_owner_only();
