-- =============================================================================
-- WazaBolt Schools (Phase 3): modules per business, a Teacher role, and school
-- management — school profile and grading, academic years and terms,
-- assessments, classes, subjects, students, marks, comments, published
-- results (frozen), and school fees on the existing documents and payments.
-- Additive: new tables, columns and functions; no existing data is changed.
-- =============================================================================
--
-- Teacher role. Teachers belong to the business but are not "business
-- members" for business data: is_business_member() now excludes them, so
-- every existing policy (customers, orders, payments, documents, WhatsApp…)
-- hides that data from teachers without being touched. They read their own
-- membership and business row, the school setup, and only the classes,
-- students and marks they teach.
--
-- Results. Marks are entered per assessment (e.g. Sequence 1, CA, Exam) by the
-- subject's teacher or an admin. Averages, totals, grades and positions are
-- computed by the app's grading module (lib/school/grading.ts) from the marks
-- and the school's grading settings. Publishing (owners/admins) saves that
-- computation as a frozen snapshot and locks the class's marks for the term;
-- report cards are printed from the snapshot. Withdrawing a publication (with
-- a reason, audited) unlocks the marks.
--
-- Fees. A fee (name, amount, class or whole school) is billed by issuing an
-- invoice per student (documents.student_id) to the student's guardian
-- (a customer with their WhatsApp number). Payments and receipts are the
-- Phase 2 invoice payments and receipts.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Teacher role
-- ---------------------------------------------------------------------------
-- Role checks compare text (role_rank('teacher') = 0: below viewer), so the new
-- enum value is never used as a literal in this migration.
alter type public.business_role add value if not exists 'teacher';

/* Business data: members except teachers (every existing policy uses this). */
create or replace function public.is_business_member(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = target_business_id
      and m.user_id = (select auth.uid())
      and m.role::text <> 'teacher'
  );
$$;

/* Anyone in the business, teachers included (school setup, their business row). */
create function public.is_business_staff(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = target_business_id and m.user_id = (select auth.uid())
  );
$$;
revoke execute on function public.is_business_staff(uuid) from public, anon;
grant execute on function public.is_business_staff(uuid) to authenticated;

-- Teachers still see who they are and where they work.
create policy "business_members: read own membership" on public.business_members for select to authenticated using (user_id = (select auth.uid()));
create policy "businesses: staff read" on public.businesses for select to authenticated using (public.is_business_staff(id));
create policy "business_languages: staff read" on public.business_languages for select to authenticated using (public.is_business_staff(business_id));

-- Invitations and role changes accept 'teacher' (admins manage teachers).
alter table public.business_invitations drop constraint business_invitations_role_check;
alter table public.business_invitations add constraint business_invitations_role_check check (role in ('admin', 'agent', 'viewer', 'teacher'));

create or replace function public.create_invitation(p_business_id uuid, p_email text, p_role text, p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_id uuid;
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'agent', 'viewer', 'teacher') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if p_role = 'admin' and not public.has_min_role(p_business_id, 'owner') then
    raise exception 'only the owner can invite admins' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.business_members m join auth.users u on u.id = m.user_id
    where m.business_id = p_business_id and lower(u.email) = v_email
  ) then
    raise exception 'already a member' using errcode = '23505';
  end if;

  update public.business_invitations set revoked_at = now()
  where business_id = p_business_id and email = v_email and accepted_at is null and revoked_at is null;

  insert into public.business_invitations (business_id, email, role, token_hash, invited_by)
  values (p_business_id, v_email, p_role, p_token_hash, (select auth.uid()))
  returning id into v_id;

  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, (select auth.uid()), 'member.invited', 'invitation', v_id::text, jsonb_build_object('role', p_role));
  return v_id;
end;
$$;

create or replace function public.update_member_role(p_business_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
begin
  if p_role not in ('admin', 'agent', 'viewer', 'teacher') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  select role::text into v_current from public.business_members where business_id = p_business_id and user_id = p_user_id;
  if v_current is null then
    raise exception 'not a member' using errcode = '22023';
  end if;
  if not public.has_min_role(p_business_id, 'admin') or p_user_id = (select auth.uid()) or v_current = 'owner'
     or ((v_current = 'admin' or p_role = 'admin') and not public.has_min_role(p_business_id, 'owner')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.business_members set role = p_role::public.business_role where business_id = p_business_id and user_id = p_user_id;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, (select auth.uid()), 'member.role_changed', 'member', p_user_id::text, jsonb_build_object('from', v_current, 'to', p_role));
end;
$$;

-- ---------------------------------------------------------------------------
-- Modules per business
-- ---------------------------------------------------------------------------
-- Only choices are stored; without a row the app's defaults apply (school
-- businesses: school + docs + ai; others: commerce + docs + ai).
create table public.business_modules (
  business_id uuid not null references public.businesses (id) on delete cascade,
  module text not null check (module in ('commerce', 'ai', 'docs', 'school')),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (business_id, module)
);
alter table public.business_modules enable row level security;
create policy "business_modules: staff read" on public.business_modules for select to authenticated using (public.is_business_staff(business_id));
revoke all on public.business_modules from anon, authenticated;
grant select on public.business_modules to authenticated;
grant all on public.business_modules to service_role;

/* Owners and admins switch a module on or off (the data stays). */
create function public.set_business_module(p_business_id uuid, p_module text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_module not in ('commerce', 'ai', 'docs', 'school') or p_enabled is null then
    raise exception 'unknown module' using errcode = '22023';
  end if;
  insert into public.business_modules (business_id, module, enabled, updated_by)
  values (p_business_id, p_module, p_enabled, (select auth.uid()))
  on conflict (business_id, module) do update set enabled = excluded.enabled, updated_at = now(), updated_by = excluded.updated_by;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, (select auth.uid()), 'module.changed', 'business', p_business_id::text, jsonb_build_object('module', p_module, 'enabled', p_enabled));
end;
$$;
revoke execute on function public.set_business_module(uuid, text, boolean) from public, anon;
grant execute on function public.set_business_module(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- School profile and grading
-- ---------------------------------------------------------------------------
create table public.school_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  school_type text not null default 'secondary' check (school_type in ('nursery', 'primary', 'secondary', 'vocational', 'higher', 'other')),
  registration_number text check (char_length(registration_number) <= 80),
  motto text check (char_length(motto) <= 200),
  principal_name text check (char_length(principal_name) <= 120),
  -- Grading (presets fill these; every value can be changed).
  grading_preset text not null default 'francophone_20' check (grading_preset in ('francophone_20', 'anglophone_100', 'primary', 'custom')),
  scale_max numeric(6, 2) not null default 20 check (scale_max between 1 and 1000),
  pass_mark numeric(6, 2) not null default 10 check (pass_mark >= 0),
  use_coefficients boolean not null default true,
  rank_students boolean not null default true,
  -- A missing mark: left out of the average ('exclude') or counted as 0 ('zero').
  missing_marks text not null default 'exclude' check (missing_marks in ('exclude', 'zero')),
  -- [{"min": 16, "grade": "A", "remark": "Très bien"}, …], highest first, on the scale above.
  grade_boundaries jsonb not null default '[]' check (jsonb_typeof(grade_boundaries) = 'array' and jsonb_array_length(grade_boundaries) <= 20),
  decimals smallint not null default 2 check (decimals between 0 and 3),
  report_template text not null default 'classic' check (report_template in ('classic', 'modern')),
  report_language text check (report_language in ('en', 'fr')),
  student_prefix text not null default 'STU' check (student_prefix ~ '^[A-Z0-9]{1,8}$'),
  updated_at timestamptz not null default now(),
  check (pass_mark <= scale_max)
);
alter table public.school_settings enable row level security;
create policy "school_settings: staff read" on public.school_settings for select to authenticated using (public.is_business_staff(business_id));
create policy "school_settings: admins insert" on public.school_settings for insert to authenticated with check (public.has_min_role(business_id, 'admin'));
create policy "school_settings: admins update" on public.school_settings for update to authenticated
  using (public.has_min_role(business_id, 'admin')) with check (public.has_min_role(business_id, 'admin'));
grant select, insert, update on public.school_settings to authenticated;
grant all on public.school_settings to service_role;

-- ---------------------------------------------------------------------------
-- Academic years, terms, assessments
-- ---------------------------------------------------------------------------
create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  starts_on date,
  ends_on date,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, name),
  check (ends_on is null or starts_on is null or ends_on > starts_on)
);
create unique index academic_years_current_key on public.academic_years (business_id) where is_current;

create table public.school_terms (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  year_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  position smallint not null check (position between 1 and 12),
  starts_on date,
  ends_on date,
  unique (business_id, id),
  unique (year_id, position),
  foreign key (business_id, year_id) references public.academic_years (business_id, id) on delete cascade
);

-- The parts of a term's mark, e.g. Sequence 1 (50 %) + Sequence 2 (50 %), or CA (30 %) + Exam (70 %).
create table public.school_assessments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  term_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  weight numeric(6, 2) not null check (weight > 0 and weight <= 1000),
  max_mark numeric(6, 2) not null check (max_mark > 0 and max_mark <= 1000),
  position smallint not null default 1 check (position between 1 and 20),
  unique (business_id, id),
  unique (term_id, name),
  foreign key (business_id, term_id) references public.school_terms (business_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Classes, subjects, teachers
-- ---------------------------------------------------------------------------
create table public.school_classes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  year_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  level text check (char_length(level) <= 40),
  class_teacher_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id, id),
  unique (year_id, name),
  foreign key (business_id, year_id) references public.academic_years (business_id, id) on delete cascade
);

create table public.school_subjects (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  code text check (char_length(code) <= 12),
  unique (business_id, id),
  unique (business_id, name)
);

create table public.class_subjects (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  class_id uuid not null,
  subject_id uuid not null,
  coefficient numeric(5, 2) not null default 1 check (coefficient > 0 and coefficient <= 100),
  teacher_id uuid references auth.users (id) on delete set null,
  position smallint not null default 1 check (position between 1 and 99),
  unique (business_id, id),
  unique (class_id, subject_id),
  foreign key (business_id, class_id) references public.school_classes (business_id, id) on delete cascade,
  foreign key (business_id, subject_id) references public.school_subjects (business_id, id) on delete restrict
);
create index class_subjects_teacher_idx on public.class_subjects (business_id, teacher_id) where teacher_id is not null;

/* Teachers: the classes they teach (class teacher, or teacher of one of its subjects). */
create function public.teaches_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.school_classes c where c.id = p_class_id and c.class_teacher_id = (select auth.uid()))
      or exists (select 1 from public.class_subjects s where s.class_id = p_class_id and s.teacher_id = (select auth.uid()));
$$;
revoke execute on function public.teaches_class(uuid) from public, anon;
grant execute on function public.teaches_class(uuid) to authenticated;

/* Who may see a class: business members (not teachers), and its teachers. */
create function public.can_see_class(p_business_id uuid, p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_business_member(p_business_id) or (public.is_business_staff(p_business_id) and public.teaches_class(p_class_id));
$$;
revoke execute on function public.can_see_class(uuid, uuid) from public, anon;
grant execute on function public.can_see_class(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Students and enrolments
-- ---------------------------------------------------------------------------
alter table public.business_counters add column student_seq bigint not null default 0;

create table public.school_students (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  student_number text not null default '' check (char_length(student_number) <= 30),
  first_name text not null check (char_length(btrim(first_name)) between 1 and 80),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 80),
  gender text check (gender in ('female', 'male')),
  date_of_birth date,
  guardian_name text check (char_length(guardian_name) <= 120),
  -- The guardian as a customer (WhatsApp number): fee invoices, receipts and report cards go to them.
  guardian_customer_id uuid,
  status text not null default 'active' check (status in ('active', 'withdrawn', 'graduated')),
  notes text check (char_length(notes) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, student_number),
  foreign key (business_id, guardian_customer_id) references public.customers (business_id, id) on delete set null (guardian_customer_id)
);
create index school_students_name_idx on public.school_students (business_id, last_name, first_name);
create trigger school_students_set_updated_at before update on public.school_students for each row execute function public.set_updated_at();

/* STU-000001, per business, from a locked counter; never changed. */
create function public.school_students_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq bigint;
  v_prefix text;
begin
  if tg_op = 'UPDATE' then
    if new.student_number is distinct from old.student_number then
      raise exception 'a student number can''t be changed' using errcode = '22023';
    end if;
    return new;
  end if;
  insert into public.business_counters (business_id) values (new.business_id) on conflict do nothing;
  update public.business_counters set student_seq = student_seq + 1 where business_id = new.business_id returning student_seq into v_seq;
  v_prefix := coalesce((select student_prefix from public.school_settings where business_id = new.business_id), 'STU');
  new.student_number := public.format_reference(v_prefix, v_seq, 6);
  return new;
end;
$$;
revoke execute on function public.school_students_number() from public, anon, authenticated;
create trigger school_students_number before insert or update of student_number on public.school_students
  for each row execute function public.school_students_number();

create table public.school_enrollments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  student_id uuid not null,
  class_id uuid not null,
  year_id uuid not null,
  status text not null default 'enrolled' check (status in ('enrolled', 'left')),
  created_at timestamptz not null default now(),
  unique (business_id, id),
  -- One class per student per year.
  unique (student_id, year_id),
  foreign key (business_id, student_id) references public.school_students (business_id, id) on delete cascade,
  foreign key (business_id, class_id) references public.school_classes (business_id, id) on delete cascade,
  foreign key (business_id, year_id) references public.academic_years (business_id, id) on delete cascade
);
create index school_enrollments_class_idx on public.school_enrollments (business_id, class_id);

/* The enrolment's year is the class's year. */
create function public.school_enrollments_year()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.year_id := (select year_id from public.school_classes where id = new.class_id and business_id = new.business_id);
  if new.year_id is null then
    raise exception 'unknown class' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke execute on function public.school_enrollments_year() from public, anon, authenticated;
create trigger school_enrollments_year before insert or update of class_id on public.school_enrollments
  for each row execute function public.school_enrollments_year();

/* Teachers: students enrolled in a class they teach. */
create function public.teaches_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.school_enrollments e
    where e.student_id = p_student_id and public.teaches_class(e.class_id)
  );
$$;
revoke execute on function public.teaches_student(uuid) from public, anon;
grant execute on function public.teaches_student(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Marks and comments (written through save_marks / set_school_comment)
-- ---------------------------------------------------------------------------
create table public.school_marks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  assessment_id uuid not null,
  class_subject_id uuid not null,
  student_id uuid not null,
  mark numeric(7, 2) check (mark >= 0),
  absent boolean not null default false,
  entered_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (assessment_id, class_subject_id, student_id),
  check (not (absent and mark is not null)),
  foreign key (business_id, assessment_id) references public.school_assessments (business_id, id) on delete cascade,
  foreign key (business_id, class_subject_id) references public.class_subjects (business_id, id) on delete cascade,
  foreign key (business_id, student_id) references public.school_students (business_id, id) on delete cascade
);
create index school_marks_class_subject_idx on public.school_marks (business_id, class_subject_id);
create index school_marks_student_idx on public.school_marks (business_id, student_id);

-- A subject teacher's comment for a student in a term.
create table public.school_subject_comments (
  business_id uuid not null,
  term_id uuid not null,
  class_subject_id uuid not null,
  student_id uuid not null,
  comment text not null check (char_length(comment) between 1 and 300),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (term_id, class_subject_id, student_id),
  foreign key (business_id, term_id) references public.school_terms (business_id, id) on delete cascade,
  foreign key (business_id, class_subject_id) references public.class_subjects (business_id, id) on delete cascade,
  foreign key (business_id, student_id) references public.school_students (business_id, id) on delete cascade
);

-- The class teacher's and the principal's comments for a student in a term.
create table public.school_term_comments (
  business_id uuid not null,
  term_id uuid not null,
  student_id uuid not null,
  class_teacher_comment text check (char_length(class_teacher_comment) <= 500),
  principal_comment text check (char_length(principal_comment) <= 500),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (term_id, student_id),
  foreign key (business_id, term_id) references public.school_terms (business_id, id) on delete cascade,
  foreign key (business_id, student_id) references public.school_students (business_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Published results (frozen snapshots)
-- ---------------------------------------------------------------------------
create table public.school_result_publications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  term_id uuid not null,
  class_id uuid not null,
  -- The computed results as printed: settings, subjects, students, marks, averages, grades, positions, comments.
  results jsonb not null check (jsonb_typeof(results) = 'object'),
  published_at timestamptz not null default now(),
  published_by uuid references auth.users (id) on delete set null,
  withdrawn_at timestamptz,
  withdrawn_by uuid references auth.users (id) on delete set null,
  withdraw_reason text check (char_length(withdraw_reason) between 3 and 300),
  unique (business_id, id),
  check ((withdrawn_at is null) = (withdraw_reason is null)),
  foreign key (business_id, term_id) references public.school_terms (business_id, id) on delete cascade,
  foreign key (business_id, class_id) references public.school_classes (business_id, id) on delete cascade
);
create unique index school_result_publications_live_key on public.school_result_publications (term_id, class_id) where withdrawn_at is null;

/* Results of this class for this term are published (marks and comments are locked). */
create function public.school_results_locked(p_term_id uuid, p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.school_result_publications where term_id = p_term_id and class_id = p_class_id and withdrawn_at is null);
$$;
revoke execute on function public.school_results_locked(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fees: fee items, billed as invoices (documents) per student
-- ---------------------------------------------------------------------------
create table public.school_fee_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  year_id uuid not null,
  -- Null: every class of the year.
  class_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  amount numeric(14, 2) not null check (amount > 0),
  due_date date,
  created_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, year_id) references public.academic_years (business_id, id) on delete cascade,
  foreign key (business_id, class_id) references public.school_classes (business_id, id) on delete cascade
);

alter table public.documents
  add column student_id uuid,
  add column fee_item_id uuid,
  add constraint documents_student_fk foreign key (business_id, student_id) references public.school_students (business_id, id) on delete set null (student_id),
  add constraint documents_fee_item_fk foreign key (business_id, fee_item_id) references public.school_fee_items (business_id, id) on delete set null (fee_item_id),
  add constraint documents_fee_is_invoice check ((student_id is null and fee_item_id is null) or doc_type in ('invoice', 'receipt'));
-- One live fee invoice per fee and student.
create unique index documents_fee_invoice_key on public.documents (fee_item_id, student_id)
  where doc_type = 'invoice' and fee_item_id is not null and status <> 'voided';
create index documents_student_idx on public.documents (business_id, student_id) where student_id is not null;

-- The guard of issued documents (Phase 2) also lets these links be cleared.
create or replace function public.documents_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fixed text[] := array['status', 'status_changed_at', 'voided_at', 'voided_by', 'void_reason', 'updated_at'];
  v_new jsonb;
  v_old jsonb;
  k text;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' and exists (select 1 from public.businesses where id = old.business_id) then
      raise exception 'issued documents can''t be deleted: void it instead' using errcode = 'WB420';
    end if;
    return old;
  end if;
  if old.status <> 'draft' then
    v_new := to_jsonb(new) - v_fixed;
    v_old := to_jsonb(old) - v_fixed;
    foreach k in array array['customer_id', 'order_id', 'invoice_id', 'order_payment_id', 'invoice_payment_id', 'student_id', 'fee_item_id'] loop
      if v_new -> k = 'null'::jsonb then
        v_new := v_new - k;
        v_old := v_old - k;
      end if;
    end loop;
    if new.doc_type = 'invoice' and current_setting('wazabolt.invoice_paid', true) = 'on' then
      v_new := v_new - 'amount_paid';
      v_old := v_old - 'amount_paid';
    end if;
    if v_new <> v_old then
      raise exception 'issued documents can''t be edited: void it and duplicate it' using errcode = 'WB420';
    end if;
  end if;
  if old.status = 'voided' and new.status <> 'voided' then
    raise exception 'a voided document stays voided' using errcode = 'WB420';
  end if;
  if new.status = 'voided' and old.status <> 'voided' and new.doc_type = 'invoice'
     and exists (select 1 from public.invoice_payments where business_id = new.business_id and document_id = new.id and voided_at is null) then
    raise exception 'this invoice has payments: void them first' using errcode = 'WB420';
  end if;
  return new;
end;
$$;
revoke execute on function public.documents_guard() from public, anon, authenticated;

-- A receipt for a fee payment names the student too.
create or replace function public.invoice_receipt_student()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.doc_type = 'receipt' and new.invoice_id is not null and new.student_id is null then
    select student_id into new.student_id from public.documents where id = new.invoice_id and business_id = new.business_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.invoice_receipt_student() from public, anon, authenticated;
create trigger documents_receipt_student before insert on public.documents
  for each row execute function public.invoice_receipt_student();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.academic_years enable row level security;
alter table public.school_terms enable row level security;
alter table public.school_assessments enable row level security;
alter table public.school_classes enable row level security;
alter table public.school_subjects enable row level security;
alter table public.class_subjects enable row level security;
alter table public.school_students enable row level security;
alter table public.school_enrollments enable row level security;
alter table public.school_marks enable row level security;
alter table public.school_subject_comments enable row level security;
alter table public.school_term_comments enable row level security;
alter table public.school_result_publications enable row level security;
alter table public.school_fee_items enable row level security;

-- School setup: everyone in the school reads; owners/admins change it.
create policy "academic_years: staff read" on public.academic_years for select to authenticated using (public.is_business_staff(business_id));
create policy "academic_years: admins write" on public.academic_years for all to authenticated using (public.has_min_role(business_id, 'admin')) with check (public.has_min_role(business_id, 'admin'));
create policy "school_terms: staff read" on public.school_terms for select to authenticated using (public.is_business_staff(business_id));
create policy "school_terms: admins write" on public.school_terms for all to authenticated using (public.has_min_role(business_id, 'admin')) with check (public.has_min_role(business_id, 'admin'));
create policy "school_assessments: staff read" on public.school_assessments for select to authenticated using (public.is_business_staff(business_id));
create policy "school_assessments: admins write" on public.school_assessments for all to authenticated using (public.has_min_role(business_id, 'admin')) with check (public.has_min_role(business_id, 'admin'));
create policy "school_subjects: staff read" on public.school_subjects for select to authenticated using (public.is_business_staff(business_id));
create policy "school_subjects: admins write" on public.school_subjects for all to authenticated using (public.has_min_role(business_id, 'admin')) with check (public.has_min_role(business_id, 'admin'));

-- Classes and their subjects: members, and the class's teachers.
create policy "school_classes: read" on public.school_classes for select to authenticated using (public.can_see_class(business_id, id));
create policy "school_classes: admins write" on public.school_classes for all to authenticated using (public.has_min_role(business_id, 'admin')) with check (public.has_min_role(business_id, 'admin'));
create policy "class_subjects: read" on public.class_subjects for select to authenticated using (public.can_see_class(business_id, class_id));
create policy "class_subjects: admins write" on public.class_subjects for all to authenticated using (public.has_min_role(business_id, 'admin')) with check (public.has_min_role(business_id, 'admin'));

-- Students: members; teachers only their classes' students. Staff (agent+) register and enrol.
create policy "school_students: read" on public.school_students for select to authenticated
  using (public.is_business_member(business_id) or (public.is_business_staff(business_id) and public.teaches_student(id)));
create policy "school_students: staff insert" on public.school_students for insert to authenticated with check (public.has_min_role(business_id, 'agent'));
create policy "school_students: staff update" on public.school_students for update to authenticated
  using (public.has_min_role(business_id, 'agent')) with check (public.has_min_role(business_id, 'agent'));
create policy "school_students: admins delete" on public.school_students for delete to authenticated using (public.has_min_role(business_id, 'admin'));
create policy "school_enrollments: read" on public.school_enrollments for select to authenticated using (public.can_see_class(business_id, class_id));
create policy "school_enrollments: staff write" on public.school_enrollments for all to authenticated
  using (public.has_min_role(business_id, 'agent')) with check (public.has_min_role(business_id, 'agent'));

-- Marks and comments: members read; teachers read their classes. Writes go through the functions below.
create policy "school_marks: read" on public.school_marks for select to authenticated
  using (public.is_business_member(business_id)
         or (public.is_business_staff(business_id) and exists (select 1 from public.class_subjects s where s.id = class_subject_id and public.teaches_class(s.class_id))));
create policy "school_subject_comments: read" on public.school_subject_comments for select to authenticated
  using (public.is_business_member(business_id)
         or (public.is_business_staff(business_id) and exists (select 1 from public.class_subjects s where s.id = class_subject_id and public.teaches_class(s.class_id))));
create policy "school_term_comments: read" on public.school_term_comments for select to authenticated
  using (public.is_business_member(business_id) or (public.is_business_staff(business_id) and public.teaches_student(student_id)));
create policy "school_result_publications: read" on public.school_result_publications for select to authenticated
  using (public.can_see_class(business_id, class_id));

-- Fees: members read (not teachers); owners/admins define them.
create policy "school_fee_items: members read" on public.school_fee_items for select to authenticated using (public.is_business_member(business_id));
create policy "school_fee_items: admins write" on public.school_fee_items for all to authenticated using (public.has_min_role(business_id, 'admin')) with check (public.has_min_role(business_id, 'admin'));

revoke all on public.academic_years, public.school_terms, public.school_assessments, public.school_classes, public.school_subjects,
  public.class_subjects, public.school_students, public.school_enrollments, public.school_marks, public.school_subject_comments,
  public.school_term_comments, public.school_result_publications, public.school_fee_items from anon, authenticated;
grant select, insert, update, delete on public.academic_years, public.school_terms, public.school_assessments, public.school_classes,
  public.school_subjects, public.class_subjects, public.school_enrollments, public.school_fee_items to authenticated;
grant select, insert, update, delete on public.school_students to authenticated;
grant select on public.school_marks, public.school_subject_comments, public.school_term_comments, public.school_result_publications to authenticated;
grant all on public.academic_years, public.school_terms, public.school_assessments, public.school_classes, public.school_subjects,
  public.class_subjects, public.school_students, public.school_enrollments, public.school_marks, public.school_subject_comments,
  public.school_term_comments, public.school_result_publications, public.school_fee_items to service_role;
-- The student number is always given by the trigger (a value sent with an insert is replaced; changes are refused).

-- ---------------------------------------------------------------------------
-- Writing marks and comments
-- ---------------------------------------------------------------------------
/* May the current user enter marks for this class subject? Owners/admins, or its teacher. */
create function public.can_mark(p_class_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.class_subjects s
    where s.id = p_class_subject_id
      and (public.has_min_role(s.business_id, 'admin') or (s.teacher_id = (select auth.uid()) and public.is_business_staff(s.business_id)))
  );
$$;
revoke execute on function public.can_mark(uuid) from public, anon;
grant execute on function public.can_mark(uuid) to authenticated;

/*
 * Saves the marks of one assessment for one class subject:
 * p_rows = [{"student_id": "...", "mark": 14.5 | null, "absent": false}, …].
 * Checks the mark is within 0..max, the student is enrolled in the class,
 * the assessment belongs to the class's year, and the results aren't
 * published. A null mark that isn't absent removes the entry.
 */
create function public.save_marks(p_class_subject_id uuid, p_assessment_id uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cs public.class_subjects%rowtype;
  a public.school_assessments%rowtype;
  v_year uuid;
  r jsonb;
  v_student uuid;
  v_mark numeric;
  v_absent boolean;
  v_count integer := 0;
begin
  select * into cs from public.class_subjects where id = p_class_subject_id;
  if not found or not public.is_business_staff(cs.business_id) then
    raise exception 'class subject not found' using errcode = 'P0002';
  end if;
  if not public.can_mark(p_class_subject_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into a from public.school_assessments where id = p_assessment_id and business_id = cs.business_id;
  select year_id into v_year from public.school_classes where id = cs.class_id;
  if a.id is null or not exists (select 1 from public.school_terms t where t.id = a.term_id and t.year_id = v_year) then
    raise exception 'this assessment is not for this class''s year' using errcode = '22023';
  end if;
  if public.school_results_locked(a.term_id, cs.class_id) then
    raise exception 'results for this term are published: withdraw them to change marks' using errcode = 'WB430';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'invalid marks' using errcode = '22023';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_student := (r ->> 'student_id')::uuid;
    v_absent := coalesce((r ->> 'absent')::boolean, false);
    v_mark := case when v_absent or r -> 'mark' is null or r -> 'mark' = 'null'::jsonb then null else (r ->> 'mark')::numeric end;
    if not exists (select 1 from public.school_enrollments e where e.student_id = v_student and e.class_id = cs.class_id and e.business_id = cs.business_id) then
      raise exception 'student not in this class' using errcode = '22023';
    end if;
    if v_mark is not null and (v_mark < 0 or v_mark > a.max_mark) then
      raise exception 'mark out of range (0 to %)', a.max_mark using errcode = '22023';
    end if;
    if v_mark is null and not v_absent then
      delete from public.school_marks where assessment_id = a.id and class_subject_id = cs.id and student_id = v_student;
    else
      insert into public.school_marks (business_id, assessment_id, class_subject_id, student_id, mark, absent, entered_by)
      values (cs.business_id, a.id, cs.id, v_student, v_mark, v_absent, (select auth.uid()))
      on conflict (assessment_id, class_subject_id, student_id)
      do update set mark = excluded.mark, absent = excluded.absent, entered_by = excluded.entered_by, updated_at = now();
    end if;
    v_count := v_count + 1;
  end loop;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (cs.business_id, (select auth.uid()), 'school.marks_saved', 'class_subject', cs.id::text, jsonb_build_object('assessment', a.id, 'count', v_count));
  return v_count;
end;
$$;
revoke execute on function public.save_marks(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_marks(uuid, uuid, jsonb) to authenticated;

/*
 * Comments for a student's term: 'subject' (the subject's teacher or an
 * admin; p_class_subject_id required), 'class_teacher' (the class teacher or
 * an admin), 'principal' (owners/admins). Empty text removes it. Locked once
 * the class's results are published.
 */
create function public.set_school_comment(p_kind text, p_term_id uuid, p_student_id uuid, p_comment text, p_class_subject_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
  v_class uuid;
  v_text text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  select t.business_id, e.class_id into v_business, v_class
  from public.school_terms t
  join public.school_enrollments e on e.year_id = t.year_id and e.student_id = p_student_id
  where t.id = p_term_id;
  if v_business is null or not public.is_business_staff(v_business) then
    raise exception 'student not found for this term' using errcode = 'P0002';
  end if;
  if public.school_results_locked(p_term_id, v_class) then
    raise exception 'results for this term are published: withdraw them to change comments' using errcode = 'WB430';
  end if;
  if p_kind = 'subject' then
    if p_class_subject_id is null or not exists (select 1 from public.class_subjects where id = p_class_subject_id and class_id = v_class) then
      raise exception 'unknown subject' using errcode = '22023';
    end if;
    if not public.can_mark(p_class_subject_id) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    if v_text is null then
      delete from public.school_subject_comments where term_id = p_term_id and class_subject_id = p_class_subject_id and student_id = p_student_id;
    else
      insert into public.school_subject_comments (business_id, term_id, class_subject_id, student_id, comment, updated_by)
      values (v_business, p_term_id, p_class_subject_id, p_student_id, left(v_text, 300), (select auth.uid()))
      on conflict (term_id, class_subject_id, student_id) do update set comment = excluded.comment, updated_by = excluded.updated_by, updated_at = now();
    end if;
  elsif p_kind in ('class_teacher', 'principal') then
    if not (public.has_min_role(v_business, 'admin')
            or (p_kind = 'class_teacher' and exists (select 1 from public.school_classes where id = v_class and class_teacher_id = (select auth.uid())))) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    insert into public.school_term_comments (business_id, term_id, student_id, class_teacher_comment, principal_comment, updated_by)
    values (v_business, p_term_id, p_student_id,
            case when p_kind = 'class_teacher' then left(v_text, 500) end, case when p_kind = 'principal' then left(v_text, 500) end, (select auth.uid()))
    on conflict (term_id, student_id) do update set
      class_teacher_comment = case when p_kind = 'class_teacher' then excluded.class_teacher_comment else public.school_term_comments.class_teacher_comment end,
      principal_comment = case when p_kind = 'principal' then excluded.principal_comment else public.school_term_comments.principal_comment end,
      updated_by = excluded.updated_by, updated_at = now();
  else
    raise exception 'unknown comment' using errcode = '22023';
  end if;
end;
$$;
revoke execute on function public.set_school_comment(text, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.set_school_comment(text, uuid, uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Publishing results
-- ---------------------------------------------------------------------------
/* Owners/admins: freeze the computed results of a class for a term (the app computes them from the marks). */
create function public.publish_school_results(p_term_id uuid, p_class_id uuid, p_results jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
  v_id uuid;
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

/* Owners/admins: withdraw published results (kept, marked withdrawn) to correct marks. */
create function public.withdraw_school_results(p_publication_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.school_result_publications%rowtype;
begin
  select * into p from public.school_result_publications where id = p_publication_id for update;
  if not found or not public.is_business_staff(p.business_id) then
    raise exception 'publication not found' using errcode = 'P0002';
  end if;
  if not public.has_min_role(p.business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p.withdrawn_at is not null then
    raise exception 'already withdrawn' using errcode = 'WB430';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  update public.school_result_publications set withdrawn_at = now(), withdrawn_by = (select auth.uid()), withdraw_reason = left(btrim(p_reason), 300) where id = p.id;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p.business_id, (select auth.uid()), 'school.results_withdrawn', 'school_class', p.class_id::text, jsonb_build_object('publication', p.id, 'reason', left(btrim(p_reason), 300)));
end;
$$;
revoke execute on function public.withdraw_school_results(uuid, text) from public, anon;
grant execute on function public.withdraw_school_results(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Billing fees
-- ---------------------------------------------------------------------------
/*
 * Owners/admins: issue an invoice for a fee to every student of the class
 * (or of every class of the year when the fee is for the whole school) who
 * is enrolled and doesn't already have a live invoice for it. The invoice
 * goes to the student's guardian (customer) and names the student. Returns
 * how many invoices were issued.
 */
create function public.bill_school_fee(p_fee_item_id uuid, p_business_snapshot jsonb, p_language text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.school_fee_items%rowtype;
  s public.document_settings%rowtype;
  st record;
  v_lang text;
  v_today date;
  v_id uuid;
  v_count integer := 0;
  v_customer jsonb;
begin
  select * into f from public.school_fee_items where id = p_fee_item_id for update;
  if not found or not public.is_business_staff(f.business_id) then
    raise exception 'fee not found' using errcode = 'P0002';
  end if;
  if not public.has_min_role(f.business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_business_snapshot is null or jsonb_typeof(p_business_snapshot) <> 'object' or coalesce(btrim(p_business_snapshot ->> 'name'), '') = '' then
    raise exception 'business details missing' using errcode = '22023';
  end if;
  select * into s from public.document_settings where business_id = f.business_id;
  v_lang := coalesce(nullif(p_language, ''), (select report_language from public.school_settings where business_id = f.business_id), s.default_language,
    case when (select default_language from public.businesses where id = f.business_id) = 'fr' then 'fr' else 'en' end);
  if v_lang not in ('en', 'fr') then v_lang := 'en'; end if;
  v_today := public._business_today(f.business_id);

  for st in
    select stu.id, stu.student_number, stu.first_name, stu.last_name, stu.guardian_name, stu.guardian_customer_id, c.name as class_name
    from public.school_enrollments e
    join public.school_students stu on stu.id = e.student_id
    join public.school_classes c on c.id = e.class_id
    where e.business_id = f.business_id and e.year_id = f.year_id and e.status = 'enrolled' and stu.status = 'active'
      and (f.class_id is null or e.class_id = f.class_id)
      and not exists (select 1 from public.documents d where d.fee_item_id = f.id and d.student_id = stu.id and d.doc_type = 'invoice' and d.status <> 'voided')
    order by c.name, stu.last_name, stu.first_name, stu.id
  loop
    v_customer := case when st.guardian_customer_id is not null then public._customer_snapshot(f.business_id, st.guardian_customer_id, null) end;
    if v_customer is null then
      v_customer := jsonb_build_object('name', coalesce(nullif(btrim(st.guardian_name), ''), st.first_name || ' ' || st.last_name),
                                       'reference', null, 'address', null, 'phone', null, 'email', null, 'website', null);
    end if;
    insert into public.documents (business_id, doc_type, template, language, currency, issue_date, due_date, customer_id,
                                  business_snapshot, customer_snapshot, items, discount, tax_rate, subtotal, tax_amount, total,
                                  notes, terms, student_id, fee_item_id, created_by)
    values (f.business_id, 'invoice', coalesce(s.default_template, 'modern'), v_lang, (select currency from public.businesses where id = f.business_id),
            v_today, greatest(coalesce(f.due_date, v_today + coalesce(s.default_due_days, 14)), v_today), st.guardian_customer_id,
            p_business_snapshot, v_customer,
            jsonb_build_array(jsonb_build_object(
              'description', f.name,
              'details', case when v_lang = 'fr' then 'Élève : ' else 'Student: ' end || st.first_name || ' ' || st.last_name || ' · ' || st.student_number || ' · ' || st.class_name,
              'quantity', 1, 'unitPrice', f.amount, 'discountPercent', 0, 'productId', null, 'variantId', null, 'serviceId', null)),
            0, 0, f.amount, 0, f.amount, s.default_notes, s.default_terms, st.id, f.id, (select auth.uid()))
    returning id into v_id;
    perform public.issue_document(v_id);
    v_count := v_count + 1;
  end loop;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (f.business_id, (select auth.uid()), 'school.fee_billed', 'school_fee_item', f.id::text, jsonb_build_object('invoices', v_count, 'amount', f.amount));
  return v_count;
end;
$$;
revoke execute on function public.bill_school_fee(uuid, jsonb, text) from public, anon;
grant execute on function public.bill_school_fee(uuid, jsonb, text) to authenticated;
