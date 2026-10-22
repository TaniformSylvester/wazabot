-- WazaBolt Schools: Teacher role isolation, modules, student numbers, marks
-- (permissions, ranges, locking), comments, publishing, fees, tenants.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/school.sql
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-a962-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sch-owner@test.local', '{"business_name":"Collège Test"}', now(), now()),
  ('00000000-0000-4000-a962-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sch-maths@test.local', '{"business_name":"Maths Own"}', now(), now()),
  ('00000000-0000-4000-a962-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sch-french@test.local', '{"business_name":"French Own"}', now(), now()),
  ('00000000-0000-4000-a962-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sch-agent@test.local', '{"business_name":"Agent Own"}', now(), now()),
  ('00000000-0000-4000-a962-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sch-other@test.local', '{"business_name":"Other School"}', now(), now());
create temp table ids on commit drop as
select (select business_id from public.business_members where user_id = '00000000-0000-4000-a962-00000000000a') as biz,
       (select business_id from public.business_members where user_id = '00000000-0000-4000-a962-00000000000c') as other;
update public.businesses set free_limits_from = '2099-01-01' where id in (select biz from ids union select other from ids);
insert into public.business_members (business_id, user_id, role) select biz, '00000000-0000-4000-a962-00000000000b', 'teacher' from ids;
insert into public.business_members (business_id, user_id, role) select biz, '00000000-0000-4000-a962-00000000000d', 'teacher' from ids;
insert into public.business_members (business_id, user_id, role) select biz, '00000000-0000-4000-a962-00000000000e', 'agent' from ids;
create temp table t (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated, service_role;
grant all on t to authenticated, service_role;

-- Business data the teachers must not see.
insert into public.customers (business_id, whatsapp_phone, name) select biz, '237670000962', 'Parent Ngo' from ids;
insert into t select 'guardian', id from public.customers where whatsapp_phone = '237670000962' and business_id = (select biz from ids);

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.v(k text) returns uuid language sql as $$ select v from t where k = $1 $$;

set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a962-00000000000a');

-- Owner sets up: year, term, 2 assessments, 2 classes, subjects with teachers, students.
do $$
declare
  b uuid := (select biz from ids);
  y uuid; tm uuid; c1 uuid; c2 uuid; m uuid; f uuid; s uuid;
begin
  perform public.set_business_module(b, 'school', true);
  perform public.set_business_module(b, 'commerce', false);
  insert into public.school_settings (business_id, grading_preset, scale_max, pass_mark, student_prefix) values (b, 'francophone_20', 20, 10, 'ELV');
  insert into public.academic_years (business_id, name, is_current) values (b, '2026-2027', true) returning id into y;
  insert into public.school_terms (business_id, year_id, name, position) values (b, y, 'Trimestre 1', 1) returning id into tm;
  insert into public.school_assessments (business_id, term_id, name, weight, max_mark, position) values (b, tm, 'Séquence 1', 50, 20, 1), (b, tm, 'Séquence 2', 50, 20, 2);
  insert into public.school_classes (business_id, year_id, name, class_teacher_id) values (b, y, '6e A', '00000000-0000-4000-a962-00000000000b') returning id into c1;
  insert into public.school_classes (business_id, year_id, name) values (b, y, '5e B') returning id into c2;
  insert into public.school_subjects (business_id, name) values (b, 'Mathématiques') returning id into m;
  insert into public.school_subjects (business_id, name) values (b, 'Français') returning id into f;
  insert into public.class_subjects (business_id, class_id, subject_id, coefficient, teacher_id) values (b, c1, m, 4, '00000000-0000-4000-a962-00000000000b') returning id into s;
  insert into t values ('maths6', s);
  insert into public.class_subjects (business_id, class_id, subject_id, coefficient, teacher_id) values (b, c1, f, 3, '00000000-0000-4000-a962-00000000000d') returning id into s;
  insert into t values ('french6', s);
  insert into public.class_subjects (business_id, class_id, subject_id, coefficient) values (b, c2, m, 4) returning id into s;
  insert into t values ('maths5', s);
  insert into t values ('year', y), ('term', tm), ('c6', c1), ('c5', c2),
    ('seq1', (select id from public.school_assessments where term_id = tm and position = 1)),
    ('seq2', (select id from public.school_assessments where term_id = tm and position = 2));
  if (select count(*) from public.business_modules where business_id = b) <> 2 then raise exception 'FAIL: modules'; end if;
  raise notice 'PASS owners set up the school: modules, year, term, assessments, classes, subjects with coefficients and teachers';
end $$;

-- Staff (agent) registers students and enrols them; numbers are given and fixed.
select pg_temp.as_user('00000000-0000-4000-a962-00000000000e');
do $$
declare
  b uuid := (select biz from ids);
  s1 uuid; s2 uuid; s3 uuid;
begin
  insert into public.school_students (business_id, first_name, last_name, guardian_name, guardian_customer_id, student_number)
  values (b, 'Amina', 'Bello', 'Parent Ngo', pg_temp.v('guardian'), 'HACK-1') returning id into s1;
  insert into public.school_students (business_id, first_name, last_name) values (b, 'Brice', 'Kamga') returning id into s2;
  insert into public.school_students (business_id, first_name, last_name) values (b, 'Chantal', 'Mbah') returning id into s3;
  if (select string_agg(student_number, ',' order by student_number) from public.school_students where business_id = b) <> 'ELV-000001,ELV-000002,ELV-000003' then
    raise exception 'FAIL: numbers %', (select string_agg(student_number, ',') from public.school_students where business_id = b);
  end if;
  begin
    update public.school_students set student_number = 'X-1' where id = s1;
    raise exception 'FAIL: number changed';
  exception when sqlstate '22023' then null;
  end;
  insert into public.school_enrollments (business_id, student_id, class_id) values (b, s1, pg_temp.v('c6')), (b, s2, pg_temp.v('c6')), (b, s3, pg_temp.v('c5'));
  if (select count(*) from public.school_enrollments where year_id = pg_temp.v('year')) <> 3 then raise exception 'FAIL: enrolment year'; end if;
  begin
    insert into public.school_enrollments (business_id, student_id, class_id) values (b, s1, pg_temp.v('c5'));
    raise exception 'FAIL: two classes in one year';
  exception when unique_violation then null;
  end;
  begin
    insert into public.academic_years (business_id, name) values (b, '2027-2028');
    raise exception 'FAIL: agent changed the school setup';
  exception when insufficient_privilege then null;
  end;
  insert into t values ('amina', s1), ('brice', s2), ('chantal', s3);
  raise notice 'PASS staff register students (ELV-000001…, number fixed) and enrol them, one class per year; setup is for admins';
end $$;

-- The maths teacher: school only, own classes only.
select pg_temp.as_user('00000000-0000-4000-a962-00000000000b');
do $$
declare
  b uuid := (select biz from ids);
begin
  if exists (select 1 from public.customers where business_id = b) then raise exception 'FAIL: teacher reads customers'; end if;
  if exists (select 1 from public.orders where business_id = b) or exists (select 1 from public.documents where business_id = b) then raise exception 'FAIL: teacher reads business data'; end if;
  if not exists (select 1 from public.businesses where id = b) or not exists (select 1 from public.business_members where business_id = b and user_id = '00000000-0000-4000-a962-00000000000b') then
    raise exception 'FAIL: teacher can''t read their business / membership';
  end if;
  if exists (select 1 from public.business_members where business_id = b and user_id <> '00000000-0000-4000-a962-00000000000b') then raise exception 'FAIL: teacher reads the team'; end if;
  if (select string_agg(name, ',') from public.school_classes where business_id = b) <> '6e A' then raise exception 'FAIL: teacher classes %', (select string_agg(name, ',') from public.school_classes); end if;
  if (select count(*) from public.school_students where business_id = b) <> 2 then raise exception 'FAIL: teacher sees students of other classes'; end if;
  if exists (select 1 from public.school_fee_items where business_id = b) then raise exception 'FAIL'; end if;
  if public.has_min_role(b, 'viewer') then raise exception 'FAIL: teacher counts as viewer'; end if;
  raise notice 'PASS a teacher sees their business and school setup, only their own classes and students, and no customers, orders, documents, fees or team';
end $$;

-- Marks: own subject only, range, enrolled students only.
do $$
begin
  perform public.save_marks(pg_temp.v('maths6'), pg_temp.v('seq1'),
    jsonb_build_array(jsonb_build_object('student_id', pg_temp.v('amina'), 'mark', 15.5), jsonb_build_object('student_id', pg_temp.v('brice'), 'absent', true)));
  perform public.save_marks(pg_temp.v('maths6'), pg_temp.v('seq2'), jsonb_build_array(jsonb_build_object('student_id', pg_temp.v('amina'), 'mark', 12)));
  if (select count(*) from public.school_marks where class_subject_id = pg_temp.v('maths6')) <> 3 then raise exception 'FAIL: marks saved'; end if;
  begin
    perform public.save_marks(pg_temp.v('french6'), pg_temp.v('seq1'), jsonb_build_array(jsonb_build_object('student_id', pg_temp.v('amina'), 'mark', 10)));
    raise exception 'FAIL: marked another teacher''s subject';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_marks(pg_temp.v('maths6'), pg_temp.v('seq1'), jsonb_build_array(jsonb_build_object('student_id', pg_temp.v('amina'), 'mark', 21)));
    raise exception 'FAIL: mark above the maximum';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.save_marks(pg_temp.v('maths6'), pg_temp.v('seq1'), jsonb_build_array(jsonb_build_object('student_id', pg_temp.v('chantal'), 'mark', 10)));
    raise exception 'FAIL: marked a student of another class';
  exception when sqlstate '22023' then null;
  end;
  begin
    insert into public.school_marks (business_id, assessment_id, class_subject_id, student_id, mark)
    values ((select biz from ids), pg_temp.v('seq1'), pg_temp.v('maths6'), pg_temp.v('brice'), 20);
    raise exception 'FAIL: mark written directly';
  exception when insufficient_privilege then null;
  end;
  -- Removing a mark (null, not absent).
  perform public.save_marks(pg_temp.v('maths6'), pg_temp.v('seq2'), jsonb_build_array(jsonb_build_object('student_id', pg_temp.v('amina'), 'mark', null)));
  perform public.save_marks(pg_temp.v('maths6'), pg_temp.v('seq2'), jsonb_build_array(jsonb_build_object('student_id', pg_temp.v('amina'), 'mark', 12)));
  -- Comments: subject (own subject), class teacher (own class), not principal.
  perform public.set_school_comment('subject', pg_temp.v('term'), pg_temp.v('amina'), 'Bon travail', pg_temp.v('maths6'));
  perform public.set_school_comment('class_teacher', pg_temp.v('term'), pg_temp.v('amina'), 'Élève sérieuse');
  begin
    perform public.set_school_comment('principal', pg_temp.v('term'), pg_temp.v('amina'), 'x');
    raise exception 'FAIL: teacher wrote the principal comment';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS teachers enter marks (absences, corrections) only for their subjects, within 0..max, for their class''s students; comments by role';
end $$;

-- The French teacher: not the class teacher.
select pg_temp.as_user('00000000-0000-4000-a962-00000000000d');
do $$
begin
  if (select count(*) from public.school_marks where class_subject_id = pg_temp.v('maths6')) <> 3 then raise exception 'FAIL: class teachers'' marks visible to colleagues of the class'; end if;
  perform public.save_marks(pg_temp.v('french6'), pg_temp.v('seq1'), jsonb_build_array(jsonb_build_object('student_id', pg_temp.v('amina'), 'mark', 11)));
  begin
    perform public.set_school_comment('class_teacher', pg_temp.v('term'), pg_temp.v('amina'), 'x');
    raise exception 'FAIL: not the class teacher';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS a subject teacher marks their subject, reads the class''s marks, but isn''t the class teacher';
end $$;

-- Owner publishes: marks and comments locked; withdraw with a reason unlocks.
select pg_temp.as_user('00000000-0000-4000-a962-00000000000a');
do $$
declare
  p uuid;
begin
  perform public.set_school_comment('principal', pg_temp.v('term'), pg_temp.v('amina'), 'Félicitations');
  p := public.publish_school_results(pg_temp.v('term'), pg_temp.v('c6'), '{"students":[{"id":"x","average":14}]}');
  begin
    perform public.save_marks(pg_temp.v('maths6'), pg_temp.v('seq1'), jsonb_build_array(jsonb_build_object('student_id', pg_temp.v('amina'), 'mark', 20)));
    raise exception 'FAIL: marks changed after publishing';
  exception when sqlstate 'WB430' then null;
  end;
  begin
    perform public.set_school_comment('principal', pg_temp.v('term'), pg_temp.v('amina'), 'changed');
    raise exception 'FAIL: comment changed after publishing';
  exception when sqlstate 'WB430' then null;
  end;
  begin
    perform public.publish_school_results(pg_temp.v('term'), pg_temp.v('c6'), '{"students":[]}');
    raise exception 'FAIL: published twice';
  exception when sqlstate 'WB430' then null;
  end;
  -- Another class isn't locked.
  perform public.save_marks(pg_temp.v('maths5'), pg_temp.v('seq1'), jsonb_build_array(jsonb_build_object('student_id', pg_temp.v('chantal'), 'mark', 9)));
  begin
    perform public.withdraw_school_results(p, 'x');
    raise exception 'FAIL: withdraw without reason';
  exception when sqlstate '22023' then null;
  end;
  perform public.withdraw_school_results(p, 'Erreur de saisie en maths');
  perform public.save_marks(pg_temp.v('maths6'), pg_temp.v('seq1'), jsonb_build_array(jsonb_build_object('student_id', pg_temp.v('amina'), 'mark', 16)));
  p := public.publish_school_results(pg_temp.v('term'), pg_temp.v('c6'), '{"students":[{"id":"x","average":14.5}]}');
  insert into t values ('pub', p);
  if (select count(*) from public.audit_logs where business_id = (select biz from ids) and action in ('school.results_published', 'school.results_withdrawn', 'school.marks_saved')) < 6 then
    raise exception 'FAIL: audit';
  end if;
  raise notice 'PASS owners publish a class''s results (frozen snapshot): marks and comments locked; withdraw with a reason, correct, publish again; audited';
end $$;

-- Teachers can't publish or withdraw.
select pg_temp.as_user('00000000-0000-4000-a962-00000000000b');
do $$
begin
  begin
    perform public.withdraw_school_results(pg_temp.v('pub'), 'by teacher');
    raise exception 'FAIL: teacher withdrew';
  exception when insufficient_privilege then null;
  end;
  if not exists (select 1 from public.school_result_publications where id = pg_temp.v('pub')) then raise exception 'FAIL: teacher can''t read their class''s results'; end if;
  begin
    perform public.set_business_module((select biz from ids), 'school', false);
    raise exception 'FAIL: teacher changed modules';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS teachers read their class''s published results but can''t publish, withdraw or change modules';
end $$;

-- Fees: billed per enrolled student to the guardian; paid with invoice payments; receipts name the student.
select pg_temp.as_user('00000000-0000-4000-a962-00000000000a');
do $$
declare
  b uuid := (select biz from ids);
  fee uuid;
  inv uuid;
  pay uuid;
  r public.documents;
begin
  insert into public.school_fee_items (business_id, year_id, class_id, name, amount) values (b, pg_temp.v('year'), pg_temp.v('c6'), 'Scolarité T1', 25000) returning id into fee;
  if public.bill_school_fee(fee, '{"name":"Collège Test"}', 'fr') <> 2 then raise exception 'FAIL: billed'; end if;
  if public.bill_school_fee(fee, '{"name":"Collège Test"}', 'fr') <> 0 then raise exception 'FAIL: billed twice'; end if;
  select id into inv from public.documents where fee_item_id = fee and student_id = pg_temp.v('amina');
  if (select status || ' ' || total || ' ' || coalesce(customer_id::text, '-') from public.documents where id = inv) <> 'issued 25000.00 ' || pg_temp.v('guardian')::text then
    raise exception 'FAIL: fee invoice %', (select row_to_json(d) from public.documents d where id = inv);
  end if;
  if (select items -> 0 ->> 'details' from public.documents where id = inv) not like 'Élève : Amina Bello · ELV-000001 · 6e A' then raise exception 'FAIL: fee line'; end if;
  pay := public.record_invoice_payment(inv, 10000, 'mtn_momo', 'MP77');
  r := public.create_payment_receipt('invoice', pay, '{"name":"Collège Test"}');
  if r.student_id is distinct from pg_temp.v('amina') then raise exception 'FAIL: receipt student'; end if;
  -- A whole-school fee reaches the other class too.
  insert into public.school_fee_items (business_id, year_id, name, amount) values (b, pg_temp.v('year'), 'Inscription', 5000) returning id into fee;
  if public.bill_school_fee(fee, '{"name":"Collège Test"}') <> 3 then raise exception 'FAIL: whole school'; end if;
  insert into t values ('fee', fee);
  raise notice 'PASS fees are billed once per enrolled student to the guardian (class or whole school), paid with invoice payments; receipts name the student';
end $$;

-- Agents can't bill fees; teachers can't see fee invoices.
select pg_temp.as_user('00000000-0000-4000-a962-00000000000e');
do $$
begin
  begin
    perform public.bill_school_fee(pg_temp.v('fee'), '{"name":"x"}');
    raise exception 'FAIL: agent billed';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS only owners and admins bill fees';
end $$;

-- Another business: nothing.
select pg_temp.as_user('00000000-0000-4000-a962-00000000000c');
do $$
begin
  if exists (select 1 from public.school_students where business_id = (select biz from ids))
     or exists (select 1 from public.school_marks where business_id = (select biz from ids))
     or exists (select 1 from public.school_result_publications where business_id = (select biz from ids)) then
    raise exception 'FAIL: other business reads school data';
  end if;
  begin
    perform public.save_marks(pg_temp.v('maths6'), pg_temp.v('seq1'), jsonb_build_array(jsonb_build_object('student_id', pg_temp.v('amina'), 'mark', 1)));
    raise exception 'FAIL: other business marked';
  exception when sqlstate 'P0002' then null;
  end;
  begin
    perform public.publish_school_results(pg_temp.v('term'), pg_temp.v('c5'), '{"students":[]}');
    raise exception 'FAIL: other business published';
  exception when sqlstate 'P0002' then null;
  end;
  raise notice 'PASS another business can''t see or change our school';
end $$;

-- Invitations and roles accept teachers.
select pg_temp.as_user('00000000-0000-4000-a962-00000000000a');
do $$
begin
  perform public.create_invitation((select biz from ids), 'new-teacher@test.local', 'teacher', repeat('a', 64));
  perform public.update_member_role((select biz from ids), '00000000-0000-4000-a962-00000000000e', 'teacher');
  if (select role::text from public.business_members where user_id = '00000000-0000-4000-a962-00000000000e' and business_id = (select biz from ids)) <> 'teacher' then raise exception 'FAIL: role'; end if;
  raise notice 'PASS owners invite teachers and change a member to teacher';
end $$;

rollback;
