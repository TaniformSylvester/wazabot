-- WazaBolt: teachers and kitchen staff see their business's plan.
--
-- They aren't "members" in the sense of is_business_member (they only use the
-- school or kitchen pages), so they couldn't read the subscription: the app
-- took their business for one without a plan (read-only) and refused their
-- marks. Staff now read the subscription row and business_features(), like
-- business_entitlements() already allowed. Additive: one policy, one function
-- widened to staff.

create policy "subscriptions: staff read" on public.subscriptions
  for select to authenticated using (public.is_business_staff(business_id));

create or replace function public.business_features(p_business_id uuid)
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
  if (select auth.role()) is distinct from 'service_role' and not public.is_business_staff(p_business_id) then
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
