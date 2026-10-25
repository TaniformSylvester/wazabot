-- =============================================================================
-- Kitchen accounts are free seats, like teacher seats (owner decision,
-- 25 October 2026). Additive: one plan column; three functions replaced with
-- the same behaviour plus kitchen seats. No prices, plans or subscriptions
-- change, and no data is touched.
--
--   * Kitchen staff (Kitchen role) don't count toward the plan's users.
--   * Each restaurant may have up to plans.max_kitchen kitchen accounts
--     (10 on every plan; pending kitchen invitations hold a seat), changed
--     with one UPDATE on plans.
--   * Owners, admins, agents and viewers still count as users; teachers keep
--     their own seats (plans.max_teachers).
--
-- Error code: WB419 kitchen seats.
-- =============================================================================

alter table public.plans add column max_kitchen integer not null default 10 check (max_kitchen >= 0);
comment on column public.plans.max_kitchen is 'Kitchen accounts per restaurant, not counted in max_members.';

/* Seat group of a role: its own seats (teacher, kitchen) or the plan's users (null). */
create function public._seat_group(p_role text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_role in ('teacher', 'kitchen') then p_role end;
$$;

/*
 * A member joining, an invitation (new or renewed after expiring), or a role
 * change: teachers use the school's teacher seats, kitchen staff the
 * restaurant's kitchen seats (all plans); everyone else the plan's users.
 */
create or replace function public.enforce_member_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  v_group text := public._seat_group(new.role::text);
  v_max integer;
  v_taken integer;
begin
  if tg_op = 'UPDATE' and tg_table_name = 'business_members' then
    -- Only a move between seat groups (users, teachers, kitchen) changes which seats are used.
    if public._seat_group(old.role::text) is not distinct from v_group then
      return new;
    end if;
  end if;
  if v_group is not null then
    select case v_group when 'teacher' then p.max_teachers else p.max_kitchen end into v_max
    from public.subscriptions s join public.plans p on p.id = s.plan_id
    where s.business_id = new.business_id;
    if v_max is null then
      return new;
    end if;
    v_taken := (select count(*) from public.business_members where business_id = new.business_id and role::text = v_group)
             + (select count(*) from public.business_invitations
                where business_id = new.business_id and role = v_group and accepted_at is null and revoked_at is null and expires_at >= now()
                  -- business_members has no id column, so read it generically.
                  and id is distinct from (to_jsonb(new) ->> 'id')::uuid);
    -- The member who accepts an invitation already counted through it.
    if tg_table_name = 'business_members' and tg_op = 'INSERT' then
      v_taken := v_taken - least(1, (select count(*) from public.business_invitations i join auth.users u on u.id = new.user_id
                                     where i.business_id = new.business_id and i.role = v_group and i.accepted_at is null and i.revoked_at is null
                                       and i.expires_at >= now() and lower(i.email) = lower(u.email)))::int;
    end if;
    if v_taken >= v_max then
      if v_group = 'teacher' then
        raise exception 'plan limit: % teachers per school', v_max using errcode = 'WB416';
      end if;
      raise exception 'plan limit: % kitchen accounts per restaurant', v_max using errcode = 'WB419';
    end if;
    return new;
  end if;

  select * into l from public._plan_limits(new.business_id);
  if l is null or not l.enforced or l.max_members is null then
    return new;
  end if;
  v_taken := (select count(*) from public.business_members where business_id = new.business_id and public._seat_group(role::text) is null);
  if tg_table_name = 'business_invitations' then
    v_taken := v_taken + (select count(*) from public.business_invitations
                          where business_id = new.business_id and public._seat_group(role) is null
                            and accepted_at is null and revoked_at is null and expires_at >= now());
  end if;
  if v_taken >= l.max_members then
    raise exception 'plan limit: % team members on the % plan', l.max_members, l.plan_id using errcode = 'WB413';
  end if;
  return new;
end;
$$;

/* The plan's users (everyone but teachers and kitchen staff), as shown on Billing. Same shape as before. */
create or replace function public.business_plan_limits(p_business_id uuid)
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
         (select count(*)::int from public.business_members where business_id = p_business_id and role::text not in ('teacher', 'kitchen'))
  from public._plan_limits(p_business_id) l;
end;
$$;


/* For the dashboard (any member): entitlements and usage, now with kitchen seats. The result gains two columns. */
drop function public.business_entitlements(uuid);
create function public.business_entitlements(p_business_id uuid)
returns table (plan_id text, enforced boolean, max_documents integer, max_students integer, max_report_card_students integer,
               max_teachers integer, has_bulk_report_cards boolean, has_school_reports boolean,
               documents_used integer, students_used integer, teachers_used integer,
               max_kitchen integer, kitchen_used integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_business_staff(p_business_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select e.plan_id, e.enforced, e.max_documents, e.max_students, e.max_report_card_students, e.max_teachers,
         e.has_bulk_report_cards, e.has_school_reports,
         public._documents_used(p_business_id),
         (select count(*)::int from public.school_students where business_id = p_business_id and status = 'active'),
         (select count(*)::int from public.business_members where business_id = p_business_id and role::text = 'teacher')
           + (select count(*)::int from public.business_invitations
              where business_id = p_business_id and role = 'teacher' and accepted_at is null and revoked_at is null and expires_at >= now()),
         (select p.max_kitchen from public.subscriptions s join public.plans p on p.id = s.plan_id where s.business_id = p_business_id),
         (select count(*)::int from public.business_members where business_id = p_business_id and role::text = 'kitchen')
           + (select count(*)::int from public.business_invitations
              where business_id = p_business_id and role = 'kitchen' and accepted_at is null and revoked_at is null and expires_at >= now())
  from public._plan_entitlements(p_business_id) e;
end;
$$;
revoke execute on function public.business_entitlements(uuid) from public, anon;
grant execute on function public.business_entitlements(uuid) to authenticated;
