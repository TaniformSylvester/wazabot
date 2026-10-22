-- =============================================================================
-- Plan entitlements for WazaBolt Docs and WazaBolt Schools (owner decisions,
-- 22 October 2026). Additive: new plan columns and limits; no prices change,
-- no subscription changes, nothing is deleted.
-- =============================================================================
--
--   plan      saved docs  students  report cards   bulk report  school    teacher
--                                   (students/term) cards        reports   seats
--   free           20          50        50           no          no        30
--   boutique        ∞         200       200           yes         no        30
--   starter         ∞         200       200           yes         no        30
--   business        ∞         500       500           yes         yes       30
--   pro             ∞          ∞ *       ∞ *          yes         yes       30
--   * unlimited, subject to fair use (reviewed by the WazaBolt team; no automatic cap).
--
-- Every figure is a column of the plans table, so the operator can change it
-- with one UPDATE; config/economics.ts mirrors them for the website.
--
-- Teachers. Teacher accounts don't count toward the plan's users
-- (max_members): owners, admins, agents and viewers do. Each school may have
-- up to max_teachers teachers (pending teacher invitations included), on
-- every plan. Parents and students have no accounts, so they never count.
--
-- Saved business documents (Free: 20). Every invoice, receipt and quotation
-- the business saves counts — drafts, issued and voided — except school fee
-- invoices and their receipts, which belong to the school allowance (bounded
-- by the student limit). Issued documents can never be deleted, so a limit
-- can't be bypassed by deleting financial records; deleting a draft frees
-- its place. Guest documents are never saved and never count.
--
-- Report cards. Publishing a class's results for a term counts its students;
-- the students with live (published) results in a term may not exceed
-- max_report_card_students. Withdrawing and publishing again, and printing or
-- sending the same published report card again, don't count again.
--
-- Free-plan limits wait for the business's grace date (businesses.
-- free_limits_from), like the other Free limits; teacher seats apply to all.
--
-- Error codes: WB415 students · WB416 teachers · WB417 saved documents ·
-- WB418 report cards (WB413 users, as before).
-- =============================================================================

alter table public.plans
  add column max_documents integer check (max_documents > 0),
  add column max_students integer check (max_students > 0),
  add column max_report_card_students integer check (max_report_card_students > 0),
  add column max_teachers integer not null default 30 check (max_teachers >= 0),
  add column has_bulk_report_cards boolean not null default true,
  add column has_school_reports boolean not null default false;

comment on column public.plans.max_documents is 'Saved business documents (invoices, receipts, quotations; not school fee invoices); null = unlimited.';
comment on column public.plans.max_students is 'Active students (School module); null = unlimited (fair use).';
comment on column public.plans.max_report_card_students is 'Students with published report cards per academic term; null = unlimited (fair use).';
comment on column public.plans.max_teachers is 'Teacher accounts per school, not counted in max_members.';
comment on column public.plans.has_bulk_report_cards is 'Report cards for a whole class in one PDF.';
comment on column public.plans.has_school_reports is 'Advanced school reports (class and subject statistics, fee collection, CSV).';

update public.plans set max_documents = 20, max_students = 50, max_report_card_students = 50, has_bulk_report_cards = false, has_school_reports = false where id = 'free';
update public.plans set max_students = 200, max_report_card_students = 200, has_bulk_report_cards = true, has_school_reports = false where id in ('boutique', 'starter');
update public.plans set max_students = 500, max_report_card_students = 500, has_bulk_report_cards = true, has_school_reports = true where id = 'business';
update public.plans set has_bulk_report_cards = true, has_school_reports = true where id = 'pro';

-- ---------------------------------------------------------------------------
-- Entitlements in force
-- ---------------------------------------------------------------------------
/* Internal (no access check): the plan's Docs and School entitlements, and whether Free limits apply yet. */
create function public._plan_entitlements(p_business_id uuid)
returns table (plan_id text, enforced boolean, max_documents integer, max_students integer, max_report_card_students integer,
               max_teachers integer, has_bulk_report_cards boolean, has_school_reports boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, (p.id <> 'free' or current_date >= b.free_limits_from),
         p.max_documents, p.max_students, p.max_report_card_students, p.max_teachers, p.has_bulk_report_cards, p.has_school_reports
  from public.businesses b
  join public.subscriptions s on s.business_id = b.id
  join public.plans p on p.id = s.plan_id
  where b.id = p_business_id;
$$;
revoke execute on function public._plan_entitlements(uuid) from public, anon, authenticated;

/* Documents that count toward the saved-documents limit (school fee invoices and their receipts don't). */
create function public._documents_used(p_business_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.documents where business_id = p_business_id and student_id is null and fee_item_id is null;
$$;
revoke execute on function public._documents_used(uuid) from public, anon, authenticated;

/* Students with live published results in a term (all classes). */
create function public._report_card_students(p_term_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct s ->> 'id')::int
  from public.school_result_publications p, jsonb_array_elements(p.results -> 'students') s
  where p.term_id = p_term_id and p.withdrawn_at is null;
$$;
revoke execute on function public._report_card_students(uuid) from public, anon, authenticated;

/* For the dashboard (any member, teachers included): entitlements and usage. */
create function public.business_entitlements(p_business_id uuid)
returns table (plan_id text, enforced boolean, max_documents integer, max_students integer, max_report_card_students integer,
               max_teachers integer, has_bulk_report_cards boolean, has_school_reports boolean,
               documents_used integer, students_used integer, teachers_used integer)
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
              where business_id = p_business_id and role = 'teacher' and accepted_at is null and revoked_at is null and expires_at >= now())
  from public._plan_entitlements(p_business_id) e;
end;
$$;
revoke execute on function public.business_entitlements(uuid) from public, anon;
grant execute on function public.business_entitlements(uuid) to authenticated;

/* Report card usage for a term (members and teachers of the school). */
create function public.term_report_card_usage(p_term_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.school_terms where id = p_term_id and public.is_business_staff(business_id)) then
    raise exception 'term not found' using errcode = 'P0002';
  end if;
  return public._report_card_students(p_term_id);
end;
$$;
revoke execute on function public.term_report_card_usage(uuid) from public, anon;
grant execute on function public.term_report_card_usage(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Users: teachers have their own seats
-- ---------------------------------------------------------------------------
/* The plan's users (everyone but teachers), as shown on Billing. Same shape as before. */
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
         (select count(*)::int from public.business_members where business_id = p_business_id and role::text <> 'teacher')
  from public._plan_limits(p_business_id) l;
end;
$$;

/*
 * A member joining, an invitation (new or renewed after expiring), or a role change: teachers use the
 * school's teacher seats (all plans); everyone else the plan's users.
 */
create or replace function public.enforce_member_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  e record;
  v_teacher boolean := new.role::text = 'teacher';
  v_taken integer;
begin
  if tg_op = 'UPDATE' and tg_table_name = 'business_members' then
    -- Only a move between "teacher" and the other roles changes which seats are used.
    if (old.role::text = 'teacher') = v_teacher then
      return new;
    end if;
  end if;
  if v_teacher then
    select * into e from public._plan_entitlements(new.business_id);
    if e is null or e.max_teachers is null then
      return new;
    end if;
    v_taken := (select count(*) from public.business_members where business_id = new.business_id and role::text = 'teacher')
             + (select count(*) from public.business_invitations
                where business_id = new.business_id and role = 'teacher' and accepted_at is null and revoked_at is null and expires_at >= now()
                  -- business_members has no id column, so read it generically.
                  and id is distinct from (to_jsonb(new) ->> 'id')::uuid);
    -- The member who accepts an invitation already counted through it.
    if tg_table_name = 'business_members' and tg_op = 'INSERT' then
      v_taken := v_taken - least(1, (select count(*) from public.business_invitations i join auth.users u on u.id = new.user_id
                                     where i.business_id = new.business_id and i.role = 'teacher' and i.accepted_at is null and i.revoked_at is null
                                       and i.expires_at >= now() and lower(i.email) = lower(u.email)))::int;
    end if;
    if v_taken >= e.max_teachers then
      raise exception 'plan limit: % teachers per school', e.max_teachers using errcode = 'WB416';
    end if;
    return new;
  end if;

  select * into l from public._plan_limits(new.business_id);
  if l is null or not l.enforced or l.max_members is null then
    return new;
  end if;
  v_taken := (select count(*) from public.business_members where business_id = new.business_id and role::text <> 'teacher');
  if tg_table_name = 'business_invitations' then
    v_taken := v_taken + (select count(*) from public.business_invitations
                          where business_id = new.business_id and role <> 'teacher' and accepted_at is null and revoked_at is null and expires_at >= now());
  end if;
  if v_taken >= l.max_members then
    raise exception 'plan limit: % team members on the % plan', l.max_members, l.plan_id using errcode = 'WB413';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_member_limit() from public, anon, authenticated;
create trigger business_members_role_plan_limit before update of role on public.business_members
  for each row execute function public.enforce_member_limit();
-- Renewing an expired invitation takes a seat again, like a new invitation.
create trigger business_invitations_renew_plan_limit before update of expires_at on public.business_invitations
  for each row when (old.expires_at < now() and new.expires_at >= now() and new.accepted_at is null and new.revoked_at is null)
  execute function public.enforce_member_limit();

-- ---------------------------------------------------------------------------
-- Students
-- ---------------------------------------------------------------------------
create function public.enforce_student_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then
    return new;
  end if;
  select * into e from public._plan_entitlements(new.business_id);
  if e.enforced and e.max_students is not null
     and (select count(*) from public.school_students where business_id = new.business_id and status = 'active' and id <> new.id) >= e.max_students then
    raise exception 'plan limit: % active students on the % plan', e.max_students, e.plan_id using errcode = 'WB415';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_student_limit() from public, anon, authenticated;
create trigger school_students_plan_limit before insert or update of status on public.school_students
  for each row execute function public.enforce_student_limit();

-- ---------------------------------------------------------------------------
-- Saved business documents
-- ---------------------------------------------------------------------------
create function public.enforce_document_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
begin
  -- School fee invoices and their receipts belong to the school allowance.
  if new.student_id is not null or new.fee_item_id is not null then
    return new;
  end if;
  select * into e from public._plan_entitlements(new.business_id);
  if e.enforced and e.max_documents is not null and public._documents_used(new.business_id) >= e.max_documents then
    raise exception 'plan limit: % saved documents on the % plan', e.max_documents, e.plan_id using errcode = 'WB417';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_document_limit() from public, anon, authenticated;
-- Named to run after documents_receipt_student (which names the student of a fee receipt).
create trigger documents_zz_plan_limit before insert on public.documents
  for each row execute function public.enforce_document_limit();

-- ---------------------------------------------------------------------------
-- Report cards: publishing counts the class's students in the term
-- ---------------------------------------------------------------------------
create or replace function public.publish_school_results(p_term_id uuid, p_class_id uuid, p_results jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
  v_id uuid;
  e record;
  v_new integer;
begin
  select c.business_id into v_business
  from public.school_classes c join public.school_terms t on t.year_id = c.year_id and t.id = p_term_id
  where c.id = p_class_id;
  if v_business is null or not public.is_business_staff(v_business) then
    raise exception 'class or term not found' using errcode = 'P0002';
  end if;
  if not public.has_min_role(v_business, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if public.school_results_locked(p_term_id, p_class_id) then
    raise exception 'these results are already published' using errcode = 'WB430';
  end if;
  if p_results is null or jsonb_typeof(p_results) <> 'object' or jsonb_typeof(p_results -> 'students') <> 'array' then
    raise exception 'invalid results' using errcode = '22023';
  end if;
  select * into e from public._plan_entitlements(v_business);
  if e.enforced and e.max_report_card_students is not null then
    -- Students already published this term in other classes, plus this class's (the same student isn't counted twice).
    select count(distinct x)::int into v_new from (
      select s ->> 'id' as x from public.school_result_publications p, jsonb_array_elements(p.results -> 'students') s
      where p.term_id = p_term_id and p.withdrawn_at is null
      union all
      select s ->> 'id' from jsonb_array_elements(p_results -> 'students') s
    ) ids;
    if v_new > e.max_report_card_students then
      raise exception 'plan limit: report cards for % students per term on the % plan', e.max_report_card_students, e.plan_id using errcode = 'WB418';
    end if;
  end if;
  insert into public.school_result_publications (business_id, term_id, class_id, results, published_by)
  values (v_business, p_term_id, p_class_id, p_results, (select auth.uid()))
  returning id into v_id;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_business, (select auth.uid()), 'school.results_published', 'school_class', p_class_id::text,
          jsonb_build_object('term', p_term_id, 'publication', v_id, 'students', jsonb_array_length(p_results -> 'students')));
  return v_id;
end;
$$;
revoke execute on function public.publish_school_results(uuid, uuid, jsonb) from public, anon;
grant execute on function public.publish_school_results(uuid, uuid, jsonb) to authenticated;
