-- WazaBolt tenant-isolation tests.
-- Run against a database with the migrations applied (never production):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/tenant_isolation.sql
-- Everything runs in a transaction that is rolled back. Any failed check
-- raises an exception and stops the script.

begin;

-- Two independent sign-ups (fires public.handle_new_auth_user).
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-a000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'owner-a@test.local', '{"full_name":"Owner A","business_name":"Business A"}', now(), now()),
  ('00000000-0000-4000-a000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'owner-b@test.local', '{"full_name":"Owner B","business_name":"   "}', now(), now());

do $$
declare n int;
begin
  select count(*) into n from public.businesses where name = 'Business A';
  if n <> 1 then raise exception 'FAIL signup: business A not created'; end if;
  select count(*) into n from public.businesses where name = 'My business';
  if n <> 1 then raise exception 'FAIL signup: blank business name should fall back to "My business"'; end if;
  select count(*) into n from public.business_members where role = 'owner'
    and user_id in ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b');
  if n <> 2 then raise exception 'FAIL signup: owner memberships missing'; end if;
  select count(*) into n from public.audit_logs where action = 'business.created'
    and actor_user_id in ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b');
  if n <> 2 then raise exception 'FAIL signup: audit log entries missing'; end if;
  raise notice 'PASS sign-up creates profile, business, owner membership and audit log';
end $$;

-- Act as owner A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);

do $$
declare n int; b_id uuid;
begin
  select count(*) into n from public.businesses;
  if n <> 1 then raise exception 'FAIL isolation: A sees % businesses (expected 1)', n; end if;

  select count(*) into n from public.business_members;
  if n <> 1 then raise exception 'FAIL isolation: A sees % memberships (expected 1)', n; end if;

  select count(*) into n from public.users;
  if n <> 1 then raise exception 'FAIL isolation: A sees % user profiles (expected 1)', n; end if;

  select count(*) into n from public.audit_logs;
  if n <> 1 then raise exception 'FAIL isolation: A sees % audit rows (expected 1)', n; end if;

  -- Try to rename B's business: RLS must make it a no-op.
  update public.businesses set name = 'hacked' where name = 'My business';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL isolation: A updated B''s business'; end if;

  -- A can rename its own business.
  update public.businesses set name = 'Business A (renamed)' where name = 'Business A';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: owner could not rename own business'; end if;

  raise notice 'PASS owner A only sees and edits business A';
end $$;

-- Direct writes that must be refused outright.
do $$
begin
  begin
    insert into public.businesses (name) values ('Sneaky business');
    raise exception 'FAIL: authenticated user inserted a business directly';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.business_members (business_id, user_id, role)
    select id, (select auth.uid()), 'owner' from public.businesses limit 1;
    raise exception 'FAIL: authenticated user inserted a membership directly';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.audit_logs (business_id, action) select id, 'forged' from public.businesses limit 1;
    raise exception 'FAIL: authenticated user wrote an audit log directly';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.businesses set currency = 'USD';
    raise exception 'FAIL: currency should not be user-editable';
  exception when insufficient_privilege then null;
  end;

  raise notice 'PASS direct inserts and protected columns are refused';
end $$;

-- Anonymous visitors get nothing.
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.businesses;
    raise exception 'FAIL: anon can read businesses';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS anon has no access';
end $$;

reset role;
rollback;
