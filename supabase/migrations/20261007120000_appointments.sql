-- WazaBolt — Stage 6: appointments
--
--   services          bookable services: duration, optional price (salon, clinic, repairs…)
--   booking_settings  per business: on/off, slot step, how many at once, notice, how far ahead.
--                     Bookable hours are the business's opening hours (local time).
--   appointments      one row per booking, with name/price snapshots; status
--                     booked → confirmed → completed | cancelled | no_show
--   available_slots() free start times for a service (opening hours, notice, capacity)
--   book_appointment()  books a slot; per-business lock + capacity check, so two
--                     bookings can never take the same last place (team or assistant).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  description text check (char_length(description) <= 2000),
  duration_minutes integer not null check (duration_minutes between 5 and 720),
  -- null = price on request
  price numeric(14, 2) check (price >= 0),
  currency char(3) not null default 'XAF',
  active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);
create index services_business_idx on public.services (business_id, sort_order, name);

create table public.booking_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  enabled boolean not null default false,
  -- Start times are offered every N minutes from the opening time.
  slot_minutes integer not null default 30 check (slot_minutes in (10, 15, 20, 30, 45, 60, 90, 120)),
  -- Appointments that can happen at the same time (e.g. number of chairs or staff).
  capacity integer not null default 1 check (capacity between 1 and 50),
  min_notice_minutes integer not null default 60 check (min_notice_minutes between 0 and 10080),
  max_days_ahead integer not null default 30 check (max_days_ahead between 1 and 180),
  updated_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null,
  service_id uuid,
  conversation_id uuid,
  -- Snapshots: what was booked, even if the service changes later.
  service_name text not null check (char_length(service_name) between 1 and 160),
  price numeric(14, 2) check (price >= 0),
  currency char(3) not null default 'XAF',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'booked' check (status in ('booked', 'confirmed', 'completed', 'cancelled', 'no_show')),
  notes text check (char_length(notes) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  check (ends_at > starts_at),
  foreign key (business_id, customer_id) references public.customers (business_id, id) on delete restrict,
  foreign key (business_id, service_id) references public.services (business_id, id) on delete set null (service_id),
  foreign key (business_id, conversation_id) references public.conversations (business_id, id) on delete set null (conversation_id)
);
create index appointments_business_start_idx on public.appointments (business_id, starts_at);
create index appointments_customer_idx on public.appointments (business_id, customer_id, starts_at);

create trigger services_set_updated_at before update on public.services for each row execute function public.set_updated_at();
create trigger booking_settings_set_updated_at before update on public.booking_settings for each row execute function public.set_updated_at();
create trigger appointments_set_updated_at before update on public.appointments for each row execute function public.set_updated_at();
create trigger appointments_audit after insert or update of status or delete on public.appointments
  for each row execute function public.audit_change('appointment');

-- Every business gets its (disabled) booking settings.
insert into public.booking_settings (business_id) select id from public.businesses on conflict do nothing;
create function public.businesses_booking_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.booking_settings (business_id) values (new.id) on conflict do nothing;
  return null;
end;
$$;
create trigger businesses_booking_settings after insert on public.businesses
  for each row execute function public.businesses_booking_settings();

-- ---------------------------------------------------------------------------
-- Slots
-- ---------------------------------------------------------------------------
/*
 * Free start times for a service from p_from (business-local date) for
 * p_days days, within opening hours, after the minimum notice, before the
 * booking horizon, where fewer than `capacity` active appointments overlap.
 * A day whose closing time is before its opening time is open until midnight.
 */
create function public.available_slots(p_business_id uuid, p_service_id uuid, p_from date default null, p_days integer default 7)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_hours jsonb;
  v_set public.booking_settings%rowtype;
  v_duration integer;
  v_from date;
  v_day date;
  v_key text;
  v_open time;
  v_close interval;
  v_t interval;
  v_start timestamptz;
  v_earliest timestamptz;
  v_latest timestamptz;
begin
  if (select auth.role()) is distinct from 'service_role' and not public.is_business_member(p_business_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select timezone, opening_hours into v_tz, v_hours from public.businesses where id = p_business_id;
  select * into v_set from public.booking_settings where business_id = p_business_id;
  select duration_minutes into v_duration from public.services where id = p_service_id and business_id = p_business_id and active;
  if v_tz is null or v_duration is null or not coalesce(v_set.enabled, false) then
    return;
  end if;

  v_earliest := now() + make_interval(mins => v_set.min_notice_minutes);
  v_from := greatest(coalesce(p_from, (now() at time zone v_tz)::date), (now() at time zone v_tz)::date);
  v_latest := ((now() at time zone v_tz)::date + v_set.max_days_ahead + 1)::timestamp at time zone v_tz;

  for i in 0 .. least(greatest(p_days, 1), 31) - 1 loop
    v_day := v_from + i;
    v_key := lower(to_char(v_day, 'Dy'));
    continue when v_hours -> v_key is null or coalesce((v_hours -> v_key ->> 'closed')::boolean, true);
    v_open := (v_hours -> v_key ->> 'open')::time;
    v_close := (v_hours -> v_key ->> 'close')::time - time '00:00';
    if v_close <= v_open - time '00:00' then
      v_close := interval '24 hours';
    end if;
    v_t := v_open - time '00:00';
    while v_t + make_interval(mins => v_duration) <= v_close loop
      v_start := (v_day + v_t) at time zone v_tz;
      if v_start >= v_earliest and v_start < v_latest and (
        select count(*) from public.appointments a
        where a.business_id = p_business_id and a.status in ('booked', 'confirmed')
          and a.starts_at < v_start + make_interval(mins => v_duration) and a.ends_at > v_start
      ) < v_set.capacity then
        starts_at := v_start;
        ends_at := v_start + make_interval(mins => v_duration);
        return next;
      end if;
      v_t := v_t + make_interval(mins => v_set.slot_minutes);
    end loop;
  end loop;
end;
$$;

/*
 * Books a service at p_starts_at for a customer — the team (agents and up)
 * or the assistant (service role). The start must be one of the free slots;
 * a per-business lock makes the capacity check and the insert atomic.
 *   SQLSTATE WB410: that time is no longer available.
 */
create function public.book_appointment(
  p_business_id uuid,
  p_customer_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_conversation_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service public.services%rowtype;
  v_id uuid;
begin
  if (select auth.role()) is distinct from 'service_role' and not public.has_min_role(p_business_id, 'agent') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_service from public.services where id = p_service_id and business_id = p_business_id and active;
  if not found then
    raise exception 'unknown service' using errcode = '22023';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id and business_id = p_business_id) then
    raise exception 'unknown customer' using errcode = '22023';
  end if;
  if p_conversation_id is not null and not exists (
    select 1 from public.conversations where id = p_conversation_id and business_id = p_business_id and customer_id = p_customer_id
  ) then
    raise exception 'unknown conversation' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('appointments:' || p_business_id::text, 0));
  if not exists (
    select 1 from public.available_slots(p_business_id, p_service_id,
                                         (p_starts_at at time zone (select timezone from public.businesses where id = p_business_id))::date, 1) s
    where s.starts_at = p_starts_at
  ) then
    raise exception 'slot not available' using errcode = 'WB410';
  end if;

  insert into public.appointments (business_id, customer_id, service_id, conversation_id, service_name, price, currency,
                                   starts_at, ends_at, notes, created_by)
  values (p_business_id, p_customer_id, v_service.id, p_conversation_id, v_service.name, v_service.price, v_service.currency,
          p_starts_at, p_starts_at + make_interval(mins => v_service.duration_minutes), nullif(btrim(p_notes), ''), (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.services enable row level security;
alter table public.booking_settings enable row level security;
alter table public.appointments enable row level security;

create policy "services: members read" on public.services for select to authenticated using (public.is_business_member(business_id));
create policy "services: admins insert" on public.services for insert to authenticated with check (public.has_min_role(business_id, 'admin'));
create policy "services: admins update" on public.services for update to authenticated
  using (public.has_min_role(business_id, 'admin')) with check (public.has_min_role(business_id, 'admin'));
create policy "services: admins delete" on public.services for delete to authenticated using (public.has_min_role(business_id, 'admin'));

create policy "booking_settings: members read" on public.booking_settings for select to authenticated using (public.is_business_member(business_id));
create policy "booking_settings: admins update" on public.booking_settings for update to authenticated
  using (public.has_min_role(business_id, 'admin')) with check (public.has_min_role(business_id, 'admin'));

-- Appointments: created through book_appointment(); agents change status/notes; admins delete.
create policy "appointments: members read" on public.appointments for select to authenticated using (public.is_business_member(business_id));
create policy "appointments: agents update" on public.appointments for update to authenticated
  using (public.has_min_role(business_id, 'agent')) with check (public.has_min_role(business_id, 'agent'));
create policy "appointments: admins delete" on public.appointments for delete to authenticated using (public.has_min_role(business_id, 'admin'));

revoke all on public.services, public.booking_settings, public.appointments from anon, authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant select on public.booking_settings, public.appointments to authenticated;
grant update (enabled, slot_minutes, capacity, min_notice_minutes, max_days_ahead) on public.booking_settings to authenticated;
grant update (status, notes) on public.appointments to authenticated;
grant delete on public.appointments to authenticated;
grant all on public.services, public.booking_settings, public.appointments to service_role;

revoke execute on function public.available_slots(uuid, uuid, date, integer), public.book_appointment(uuid, uuid, uuid, timestamptz, uuid, text) from public, anon;
grant execute on function public.available_slots(uuid, uuid, date, integer), public.book_appointment(uuid, uuid, uuid, timestamptz, uuid, text) to authenticated, service_role;
