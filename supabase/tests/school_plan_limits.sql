-- Plan entitlements for Docs and Schools: teacher seats apart from users, the
-- 30-seat cap (invitations included, configurable), role changes, students,
-- saved documents (fee invoices and receipts excluded), report cards per term,
-- grace, and the dashboard's entitlements RPC.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/school_plan_limits.sql
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-a963-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lim-owner@test.local', '{"business_name":"École Libre"}', now(), now()),
  ('00000000-0000-4000-a963-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lim-t1@test.local', '{"business_name":"T1 Own"}', now(), now()),
  ('00000000-0000-4000-a963-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lim-t2@test.local', '{"business_name":"T2 Own"}', now(), now()),
  ('00000000-0000-4000-a963-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lim-other@test.local', '{"business_name":"Other"}', now(), now());
create temp table ids on commit drop as
select (select business_id from public.business_members where user_id = '00000000-0000-4000-a963-00000000000a') as biz;
create temp table t (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated, service_role;
grant all on t to authenticated, service_role;

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.v(k text) returns uuid language sql as $$ select v from t where k = $1 $$;
create function pg_temp.draft(b uuid) returns uuid language sql as $$
  insert into public.documents (business_id, doc_type, issue_date, business_snapshot, customer_snapshot, items, subtotal, total, created_by)
  values (b, 'invoice', current_date, '{"name":"École Libre"}', '{"name":"Client"}', '[{"description":"Cours","quantity":1,"unitPrice":1000}]', 1000, 1000,
          (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid)
  returning id;
$$;

-- The configured entitlements, per plan.
do $$
begin
  if (select string_agg(concat_ws(':', id, coalesce(max_documents::text, '-'), coalesce(max_students::text, '-'), coalesce(max_report_card_students::text, '-'),
                                  max_teachers, has_bulk_report_cards::text, has_school_reports::text), ' ' order by monthly_price)
      from public.plans where id in ('free', 'boutique', 'starter', 'business', 'pro'))
     <> 'free:20:50:50:30:false:false boutique:-:200:200:30:true:false starter:-:200:200:30:true:false business:-:500:500:30:true:true pro:-:-:-:30:true:true' then
    raise exception 'FAIL: plan entitlements %', (select string_agg(id || ':' || coalesce(max_documents::text, '-') || ':' || coalesce(max_students::text, '-'), ' ') from public.plans);
  end if;
  if (select monthly_price from public.plans where id = 'starter') <> 10000 or (select monthly_price from public.plans where id = 'business') <> 25000 then
    raise exception 'FAIL: prices changed';
  end if;
  raise notice 'PASS plans carry the Docs and School entitlements (Free 20 docs / 50 students, Starter 200, Business 500, Pro unlimited; 30 teachers everywhere); prices unchanged';
end $$;

-- Owner (Free, limits in force from today) sets up a school.
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a963-00000000000a');
do $$
declare
  b uuid := (select biz from ids);
  y uuid; tm uuid; ca uuid; cb uuid;
begin
  if (select free_limits_from from public.businesses where id = b) <> current_date then raise exception 'FAIL: grace date'; end if;
  perform public.set_business_module(b, 'school', true);
  insert into public.school_settings (business_id, grading_preset, scale_max, pass_mark, student_prefix) values (b, 'francophone_20', 20, 10, 'ELV');
  insert into public.academic_years (business_id, name, is_current) values (b, '2026-2027', true) returning id into y;
  insert into public.school_terms (business_id, year_id, name, position) values (b, y, 'Trimestre 1', 1) returning id into tm;
  insert into public.school_classes (business_id, year_id, name) values (b, y, '6e A') returning id into ca;
  insert into public.school_classes (business_id, year_id, name) values (b, y, '6e B') returning id into cb;
  insert into t values ('year', y), ('term', tm), ('cA', ca), ('cB', cb);
end $$;

-- ---------------------------------------------------------------------------
-- Teacher seats
-- ---------------------------------------------------------------------------
do $$
declare
  b uuid := (select biz from ids);
begin
  -- Free has one user (the owner); a teacher still gets in, another user doesn't.
  perform public.create_invitation(b, 'lim-t1@test.local', 'teacher', public.token_sha256('tok-t1'));
  begin
    perform public.create_invitation(b, 'helper@test.local', 'agent', public.token_sha256('tok-agent'));
    raise exception 'FAIL: second user invited on Free';
  exception when sqlstate 'WB413' then null;
  end;
  raise notice 'PASS teachers don''t use the plan''s users: a Free school invites a teacher, but not a second user';
end $$;

-- The cap is a plan column: lower it to 2 to test it without 30 accounts.
reset role;
update public.plans set max_teachers = 2 where id = 'free';
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a963-00000000000a');
do $$
declare
  b uuid := (select biz from ids);
begin
  perform public.create_invitation(b, 'lim-t2@test.local', 'teacher', public.token_sha256('tok-t2'));
  begin
    perform public.create_invitation(b, 'lim-t3@test.local', 'teacher', public.token_sha256('tok-t3'));
    raise exception 'FAIL: third teacher invited over the cap';
  exception when sqlstate 'WB416' then null;
  end;
  raise notice 'PASS teacher seats count pending invitations and stop at the plan''s max_teachers';
end $$;

-- An expired invitation frees its seat; renewing it takes a seat again.
reset role;
update public.business_invitations set expires_at = now() - interval '1 minute' where email = 'lim-t2@test.local';
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a963-00000000000a');
do $$
declare
  b uuid := (select biz from ids);
begin
  perform public.create_invitation(b, 'lim-t4@test.local', 'teacher', public.token_sha256('tok-t4'));
  begin
    perform public.renew_invitation((select id from public.business_invitations where email = 'lim-t2@test.local'), public.token_sha256('tok-t2b'));
    raise exception 'FAIL: renewed an expired invitation over the cap';
  exception when sqlstate 'WB416' then null;
  end;
  raise notice 'PASS an expired teacher invitation frees its seat, and renewing it is checked like a new one';
end $$;

-- Accepting an invitation doesn't count the teacher twice.
select pg_temp.as_user('00000000-0000-4000-a963-000000000001');
select public.accept_invitation('tok-t1') is not null as joined;
select pg_temp.as_user('00000000-0000-4000-a963-00000000000a');
do $$
declare
  b uuid := (select biz from ids);
  e record;
  l record;
begin
  if (select role::text from public.business_members where business_id = b and user_id = '00000000-0000-4000-a963-000000000001') <> 'teacher' then
    raise exception 'FAIL: teacher joined';
  end if;
  select * into e from public.business_entitlements(b);
  if e.teachers_used <> 2 or e.max_teachers <> 2 or e.plan_id <> 'free' or not e.enforced then raise exception 'FAIL: entitlements %', e; end if;
  select * into l from public.business_plan_limits(b);
  if l.members_used <> 1 then raise exception 'FAIL: users counted a teacher (%)', l.members_used; end if;

  -- Teacher → agent needs a user seat; Free has none left.
  begin
    perform public.update_member_role(b, '00000000-0000-4000-a963-000000000001', 'agent');
    raise exception 'FAIL: teacher became a second user on Free';
  exception when sqlstate 'WB413' then null;
  end;
  raise notice 'PASS accepting a teacher invitation uses the seat it reserved; users exclude teachers; a teacher can''t become a user over the limit';
end $$;

reset role;
update public.subscriptions set plan_id = 'starter' where business_id = (select biz from ids);
update public.plans set max_teachers = 2 where id = 'starter';
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a963-00000000000a');
do $$
declare
  b uuid := (select biz from ids);
begin
  -- Starter: two users, so the teacher can become an agent, freeing a seat.
  perform public.update_member_role(b, '00000000-0000-4000-a963-000000000001', 'agent');
  perform public.create_invitation(b, 'lim-t3@test.local', 'teacher', public.token_sha256('tok-t3'));
  -- Two teacher seats taken by invitations: the agent can't move back.
  begin
    perform public.update_member_role(b, '00000000-0000-4000-a963-000000000001', 'teacher');
    raise exception 'FAIL: agent became a teacher over the cap';
  exception when sqlstate 'WB416' then null;
  end;
  -- Agent → viewer doesn't touch seats.
  perform public.update_member_role(b, '00000000-0000-4000-a963-000000000001', 'viewer');
  raise notice 'PASS role changes move a member between user seats and teacher seats, each checked against its own limit';
end $$;

reset role;
update public.subscriptions set plan_id = 'free' where business_id = (select biz from ids);
update public.plans set max_teachers = 30 where id in ('free', 'starter');
delete from public.business_members where business_id = (select biz from ids) and user_id = '00000000-0000-4000-a963-000000000001';

-- ---------------------------------------------------------------------------
-- Students (Free: 50 active)
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a963-00000000000a');
do $$
declare
  b uuid := (select biz from ids);
  i int;
  s uuid;
begin
  for i in 1..50 loop
    insert into public.school_students (business_id, first_name, last_name) values (b, 'Élève', 'N' || i) returning id into s;
    if i <= 3 then insert into t values ('s' || i, s); end if;
  end loop;
  begin
    insert into public.school_students (business_id, first_name, last_name) values (b, 'Élève', 'N51');
    raise exception 'FAIL: 51st student on Free';
  exception when sqlstate 'WB415' then null;
  end;
  -- A student who leaves frees a place; coming back over the limit is refused.
  update public.school_students set status = 'withdrawn' where id = pg_temp.v('s3');
  insert into public.school_students (business_id, first_name, last_name) values (b, 'Élève', 'N51');
  begin
    update public.school_students set status = 'active' where id = pg_temp.v('s3');
    raise exception 'FAIL: reactivated over the limit';
  exception when sqlstate 'WB415' then null;
  end;
  -- Editing an active student is never blocked.
  update public.school_students set first_name = 'Aïcha' where id = pg_temp.v('s1');
  if (select students_used from public.business_entitlements(b)) <> 50 then raise exception 'FAIL: students_used'; end if;
  raise notice 'PASS Free schools keep 50 active students: the 51st is refused, a withdrawn student frees a place, edits are never blocked';
end $$;

-- Grace: before the business's free_limits_from the student limit waits.
reset role;
update public.businesses set free_limits_from = current_date + 30 where id = (select biz from ids);
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a963-00000000000a');
do $$
declare
  b uuid := (select biz from ids);
begin
  insert into public.school_students (business_id, first_name, last_name) values (b, 'Élève', 'Grace');
  if (select enforced from public.business_entitlements(b)) then raise exception 'FAIL: enforced during grace'; end if;
  raise notice 'PASS Free limits wait for the business''s grace date';
end $$;
reset role;
update public.businesses set free_limits_from = current_date where id = (select biz from ids);

-- ---------------------------------------------------------------------------
-- Saved documents (Free: 20; school fee invoices and receipts apart)
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a963-00000000000a');
do $$
declare
  b uuid := (select biz from ids);
  i int;
  d uuid;
  first_issued uuid;
  fee uuid;
  inv uuid;
  r record;
begin
  for i in 1..20 loop
    d := pg_temp.draft(b);
    if i = 1 then perform public.issue_document(d); first_issued := d; end if;
    if i = 2 then perform public.issue_document(d); perform public.void_document(d, 'Erreur'); end if;
    if i = 20 then insert into t values ('lastdraft', d); end if;
  end loop;
  begin
    perform pg_temp.draft(b);
    raise exception 'FAIL: 21st document on Free';
  exception when sqlstate 'WB417' then null;
  end;
  -- Issued and voided documents keep their place and can't be deleted.
  delete from public.documents where id = first_issued;
  if not exists (select 1 from public.documents where id = first_issued) then raise exception 'FAIL: issued document deleted'; end if;
  -- Deleting a draft frees its place.
  delete from public.documents where id = pg_temp.v('lastdraft');
  perform pg_temp.draft(b);

  -- School fees: invoices for enrolled students and their receipts don't count.
  insert into public.school_enrollments (business_id, student_id, class_id) values (b, pg_temp.v('s1'), pg_temp.v('cA')), (b, pg_temp.v('s2'), pg_temp.v('cA'));
  insert into public.school_fee_items (business_id, year_id, class_id, name, amount) values (b, pg_temp.v('year'), pg_temp.v('cA'), 'Scolarité T1', 25000) returning id into fee;
  if public.bill_school_fee(fee, '{"name":"École Libre"}', 'fr') <> 2 then raise exception 'FAIL: fee invoices refused at the document limit'; end if;
  select id into inv from public.documents where fee_item_id = fee and student_id = pg_temp.v('s1');
  -- At 20 saved documents, the fee receipt is still made.
  r := public.create_payment_receipt('invoice', public.record_invoice_payment(inv, 10000, 'cash'), '{"name":"École Libre"}');
  if r.student_id is distinct from pg_temp.v('s1') then raise exception 'FAIL: fee receipt'; end if;
  if (select documents_used from public.business_entitlements(b)) <> 20 then
    raise exception 'FAIL: documents_used %', (select documents_used from public.business_entitlements(b));
  end if;
  raise notice 'PASS Free businesses save 20 documents (drafts, issued, voided); issued ones can''t be deleted, a deleted draft frees a place; fee invoices and receipts don''t count';
end $$;

-- ---------------------------------------------------------------------------
-- Report cards (Free: 50 students per term; lowered to 3 here)
-- ---------------------------------------------------------------------------
reset role;
update public.plans set max_report_card_students = 3 where id = 'free';
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a963-00000000000a');
do $$
declare
  p uuid;
begin
  p := public.publish_school_results(pg_temp.v('term'), pg_temp.v('cA'), '{"students":[{"id":"a"},{"id":"b"}]}');
  begin
    perform public.publish_school_results(pg_temp.v('term'), pg_temp.v('cB'), '{"students":[{"id":"c"},{"id":"d"}]}');
    raise exception 'FAIL: 4 report cards in a term over a limit of 3';
  exception when sqlstate 'WB418' then null;
  end;
  -- Withdrawing and publishing the same class again doesn't count again.
  perform public.withdraw_school_results(p, 'Correction des notes');
  p := public.publish_school_results(pg_temp.v('term'), pg_temp.v('cA'), '{"students":[{"id":"a"},{"id":"b"}]}');
  -- A student already counted this term isn't counted twice.
  perform public.publish_school_results(pg_temp.v('term'), pg_temp.v('cB'), '{"students":[{"id":"b"},{"id":"c"}]}');
  if public.term_report_card_usage(pg_temp.v('term')) <> 3 then raise exception 'FAIL: usage %', public.term_report_card_usage(pg_temp.v('term')); end if;
  raise notice 'PASS report cards count students per term on publishing; re-publishing and the same student don''t count twice';
end $$;
reset role;
update public.plans set max_report_card_students = 50 where id = 'free';

-- ---------------------------------------------------------------------------
-- Paid plans and outsiders
-- ---------------------------------------------------------------------------
update public.subscriptions set plan_id = 'pro' where business_id = (select biz from ids);
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a963-00000000000a');
do $$
declare
  b uuid := (select biz from ids);
  e record;
begin
  perform pg_temp.draft(b);
  insert into public.school_students (business_id, first_name, last_name) values (b, 'Élève', 'Pro');
  select * into e from public.business_entitlements(b);
  if e.max_documents is not null or e.max_students is not null or not e.has_bulk_report_cards or not e.has_school_reports then
    raise exception 'FAIL: pro entitlements %', e;
  end if;
  raise notice 'PASS Pro has no document or student cap, bulk report cards and school reports';
end $$;

select pg_temp.as_user('00000000-0000-4000-a963-00000000000c');
do $$
begin
  begin
    perform public.business_entitlements((select biz from ids));
    raise exception 'FAIL: outsider read entitlements';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.term_report_card_usage(pg_temp.v('term'));
    raise exception 'FAIL: outsider read report card usage';
  exception when sqlstate 'P0002' then null;
  end;
  raise notice 'PASS another business can''t read our entitlements or usage';
end $$;

rollback;
