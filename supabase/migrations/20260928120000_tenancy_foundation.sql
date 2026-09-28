-- WazaBolt — Phase 2: tenancy foundation
--
-- Every business-owned table carries business_id, and Row Level Security
-- makes sure a member of business A can never read or change business B's
-- data. Later phases add conversations, products, orders, ... on top of
-- the same helpers (public.is_business_member / public.has_business_role).

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.business_role as enum ('owner', 'admin', 'agent');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- App-level profile for each auth user (auth.users stays owned by Supabase).
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  -- Cameroon defaults, but nothing here is Cameroon-only.
  country_code char(2) not null default 'CM',
  currency char(3) not null default 'XAF',
  timezone text not null default 'Africa/Douala',
  languages text[] not null default array['en', 'fr'],
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.business_role not null default 'agent',
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index business_members_user_id_idx on public.business_members (user_id);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_business_id_created_at_idx on public.audit_logs (business_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers (security definer so RLS policies can call them without recursion)
-- ---------------------------------------------------------------------------
create function public.is_business_member(target_business_id uuid)
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
  );
$$;

create function public.has_business_role(target_business_id uuid, allowed public.business_role[])
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
      and m.role = any (allowed)
  );
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at before update on public.users
  for each row execute function public.set_updated_at();
create trigger businesses_set_updated_at before update on public.businesses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Sign-up: create the profile, the business and the owner membership.
-- Metadata comes from the client, so it is trimmed and length-limited.
-- ---------------------------------------------------------------------------
create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_business_id uuid;
  v_full_name text := left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120);
  v_business_name text := left(btrim(coalesce(new.raw_user_meta_data ->> 'business_name', '')), 120);
begin
  insert into public.users (id, full_name) values (new.id, v_full_name);

  insert into public.businesses (name)
  values (coalesce(nullif(v_business_name, ''), 'My business'))
  returning id into new_business_id;

  insert into public.business_members (business_id, user_id, role)
  values (new_business_id, new.id, 'owner');

  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id)
  values (new_business_id, new.id, 'business.created', 'business', new_business_id::text);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.audit_logs enable row level security;

-- users: each person sees and edits only their own profile.
create policy "users: read own profile" on public.users
  for select to authenticated using (id = (select auth.uid()));
create policy "users: update own profile" on public.users
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- businesses: members read; owners/admins update. Creation happens only via sign-up.
create policy "businesses: members read" on public.businesses
  for select to authenticated using (public.is_business_member(id));
create policy "businesses: owners and admins update" on public.businesses
  for update to authenticated
  using (public.has_business_role(id, array['owner', 'admin']::public.business_role[]))
  with check (public.has_business_role(id, array['owner', 'admin']::public.business_role[]));

-- business_members: members see who else is in their business.
create policy "business_members: members read" on public.business_members
  for select to authenticated using (public.is_business_member(business_id));

-- audit_logs: owners/admins read their business's log. Writes happen only in
-- security-definer functions and server code using the service role.
create policy "audit_logs: owners and admins read" on public.audit_logs
  for select to authenticated
  using (public.has_business_role(business_id, array['owner', 'admin']::public.business_role[]));

-- ---------------------------------------------------------------------------
-- Privileges: nothing for anon; only what the policies above allow for users.
-- ---------------------------------------------------------------------------
revoke all on public.users, public.businesses, public.business_members, public.audit_logs from anon, authenticated;
grant select, update (full_name) on public.users to authenticated;
grant select, update (name, languages, timezone) on public.businesses to authenticated;
grant select on public.business_members to authenticated;
grant select on public.audit_logs to authenticated;
grant all on public.users, public.businesses, public.business_members, public.audit_logs to service_role;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.is_business_member(uuid) from public, anon;
revoke execute on function public.has_business_role(uuid, public.business_role[]) from public, anon;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.has_business_role(uuid, public.business_role[]) to authenticated;
