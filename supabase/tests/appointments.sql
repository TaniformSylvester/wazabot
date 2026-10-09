-- WazaBolt Stage 6 tests: bookable slots, double-booking prevention, roles.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/appointments.sql
-- Everything runs in a transaction that is rolled back.

begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-f000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'appt-owner@test.local', '{"full_name":"Owner","business_name":"Salon Grace"}', now(), now()),
  ('00000000-0000-4000-f000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'appt-viewer@test.local', '{"full_name":"Viewer","business_name":"Viewer own"}', now(), now()),
  ('00000000-0000-4000-f000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'appt-other@test.local', '{"full_name":"Other","business_name":"Other salon"}', now(), now());

create temp table ids on commit drop as
select
  (select business_id from public.business_members where user_id = '00000000-0000-4000-f000-00000000000a') as biz,
  (select business_id from public.business_members where user_id = '00000000-0000-4000-f000-00000000000c') as other_biz,
  (now() at time zone 'Africa/Douala')::date + 1 as tomorrow;
grant select on ids to authenticated, service_role;
-- Not testing plan limits here: keep the Free plan but outside its limits (grace date far ahead).
update public.businesses set free_limits_from = '2099-01-01' where id in (select biz from ids);
insert into public.business_members (business_id, user_id, role)
select biz, '00000000-0000-4000-f000-00000000000b'::uuid, 'viewer'::public.business_role from ids;

update public.businesses set timezone = 'Africa/Douala', opening_hours = (
  select jsonb_object_agg(d, jsonb_build_object('closed', false, 'open', '08:00', 'close', '18:00'))
  from unnest(array['mon','tue','wed','thu','fri','sat','sun']) d
) where id = (select biz from ids);
update public.booking_settings set min_notice_minutes = 0 where business_id = (select biz from ids);

create temp table fx on commit drop as
with s as (
  insert into public.services (business_id, name, duration_minutes, price) select biz, 'Tresses', 60, 5000 from ids returning id
), c as (
  insert into public.customers (business_id, whatsapp_phone, name) select biz, '237670000321', 'Grace' from ids returning id
)
select (select id from s) as service, (select id from c) as customer;
grant select on fx to authenticated, service_role;

-- Local time on tomorrow's date in Douala.
create function pg_temp.at_local(t text) returns timestamptz language sql stable as
$$ select ((select tomorrow from ids) + t::time) at time zone 'Africa/Douala' $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-f000-00000000000a","role":"authenticated"}', true);

do $$
begin
  if exists (select 1 from public.available_slots((select biz from ids), (select service from fx), (select tomorrow from ids), 1)) then
    raise exception 'FAIL: slots offered while booking is off';
  end if;
  raise notice 'PASS no slots while booking is switched off';
end $$;

update public.booking_settings set enabled = true where business_id = (select biz from ids);

do $$
declare n int;
begin
  select count(*) into n from public.available_slots((select biz from ids), (select service from fx), (select tomorrow from ids), 1);
  -- 08:00 … 17:00 every 30 min for a 60-min service that must end by 18:00.
  if n <> 19 then raise exception 'FAIL: expected 19 slots, got %', n; end if;
  if (select min(starts_at) from public.available_slots((select biz from ids), (select service from fx), (select tomorrow from ids), 1)) <> pg_temp.at_local('08:00') then
    raise exception 'FAIL: first slot should be 08:00 local';
  end if;
  raise notice 'PASS slots follow opening hours, the slot step and the service duration (local time)';
end $$;

-- An agent-level member books; the slot and the overlapping ones disappear.
reset role;
update public.business_members set role = 'agent' where user_id = '00000000-0000-4000-f000-00000000000b' and business_id = (select biz from ids);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-f000-00000000000b","role":"authenticated"}', true);
create temp table booked (id uuid) on commit drop;
grant all on booked to authenticated, service_role;
do $$
declare a uuid;
begin
  select public.book_appointment((select biz from ids), (select customer from fx), (select service from fx), pg_temp.at_local('10:00')) into a;
  insert into booked values (a);
  if (select ends_at from public.appointments where id = a) <> pg_temp.at_local('11:00') then raise exception 'FAIL: end time'; end if;
  if (select service_name || '/' || price from public.appointments where id = a) <> 'Tresses/5000.00' then raise exception 'FAIL: snapshot'; end if;
  if exists (select 1 from public.available_slots((select biz from ids), (select service from fx), (select tomorrow from ids), 1)
             where starts_at in (pg_temp.at_local('09:30'), pg_temp.at_local('10:00'), pg_temp.at_local('10:30'))) then
    raise exception 'FAIL: overlapping slots still offered';
  end if;
  if not exists (select 1 from public.available_slots((select biz from ids), (select service from fx), (select tomorrow from ids), 1)
                 where starts_at = pg_temp.at_local('11:00')) then
    raise exception 'FAIL: 11:00 should be free';
  end if;
  raise notice 'PASS booking takes the slot and every overlapping start time';
end $$;

do $$
begin
  begin
    perform public.book_appointment((select biz from ids), (select customer from fx), (select service from fx), pg_temp.at_local('10:30'));
    raise exception 'FAIL: double booking accepted';
  exception when sqlstate 'WB410' then null;
  end;
  begin
    perform public.book_appointment((select biz from ids), (select customer from fx), (select service from fx), pg_temp.at_local('07:00'));
    raise exception 'FAIL: booked before opening';
  exception when sqlstate 'WB410' then null;
  end;
  begin
    perform public.book_appointment((select biz from ids), (select customer from fx), (select service from fx), pg_temp.at_local('17:30'));
    raise exception 'FAIL: booked past closing';
  exception when sqlstate 'WB410' then null;
  end;
  begin
    perform public.book_appointment((select biz from ids), (select customer from fx), (select service from fx), pg_temp.at_local('12:10'));
    raise exception 'FAIL: booked off the slot grid';
  exception when sqlstate 'WB410' then null;
  end;
  raise notice 'PASS no double booking, nothing outside opening hours or off the slot grid';
end $$;

-- Two chairs: the same time can be booked twice, not three times.
reset role;
update public.booking_settings set capacity = 2 where business_id = (select biz from ids);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-f000-00000000000b","role":"authenticated"}', true);
do $$
begin
  perform public.book_appointment((select biz from ids), (select customer from fx), (select service from fx), pg_temp.at_local('10:00'));
  begin
    perform public.book_appointment((select biz from ids), (select customer from fx), (select service from fx), pg_temp.at_local('10:00'));
    raise exception 'FAIL: capacity exceeded';
  exception when sqlstate 'WB410' then null;
  end;
  raise notice 'PASS capacity: as many at once as the business allows';
end $$;

-- Cancelling frees the place.
do $$
begin
  update public.appointments set status = 'cancelled' where id = (select id from booked);
  perform public.book_appointment((select biz from ids), (select customer from fx), (select service from fx), pg_temp.at_local('10:00'));
  raise notice 'PASS a cancelled appointment frees its place';
end $$;

-- Closed days, the booking horizon and the notice period.
reset role;
update public.businesses set opening_hours = jsonb_set(opening_hours, array[lower(to_char((select tomorrow from ids) + 1, 'Dy'))], '{"closed":true,"open":"08:00","close":"18:00"}')
where id = (select biz from ids);
update public.booking_settings set max_days_ahead = 3, min_notice_minutes = 2880 where business_id = (select biz from ids);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-f000-00000000000a","role":"authenticated"}', true);
do $$
declare days date[];
begin
  select array_agg(distinct (starts_at at time zone 'Africa/Douala')::date order by (starts_at at time zone 'Africa/Douala')::date) into days
  from public.available_slots((select biz from ids), (select service from fx), (select tomorrow from ids) - 1, 10);
  -- today, tomorrow: inside the 48 h notice (tomorrow only partly); day after: closed; then up to 3 days ahead.
  if (select tomorrow from ids) + 1 = any(days) then raise exception 'FAIL: closed day offered'; end if;
  if days[array_upper(days, 1)] > (select tomorrow from ids) + 2 then raise exception 'FAIL: beyond the booking horizon: %', days; end if;
  if (select tomorrow from ids) - 1 = any(days) then raise exception 'FAIL: inside the notice period'; end if;
  raise notice 'PASS closed days, the minimum notice and the booking horizon are respected';
end $$;

-- Roles and tenants.
reset role;
update public.business_members set role = 'viewer' where user_id = '00000000-0000-4000-f000-00000000000b' and business_id = (select biz from ids);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-f000-00000000000b","role":"authenticated"}', true);
do $$
begin
  perform public.book_appointment((select biz from ids), (select customer from fx), (select service from fx), pg_temp.at_local('15:00'));
  raise exception 'FAIL: viewers can book';
exception when insufficient_privilege then
  raise notice 'PASS viewers can''t book';
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-f000-00000000000c","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.available_slots((select biz from ids), (select service from fx), null, 1);
    raise exception 'FAIL: another business sees the slots';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.appointments) or exists (select 1 from public.services) then
    raise exception 'FAIL: another business sees appointments or services';
  end if;
  raise notice 'PASS other businesses see no services, slots or appointments';
end $$;

-- The assistant (service role) books for the customer it talks to.
reset role;
update public.booking_settings set min_notice_minutes = 0, max_days_ahead = 30 where business_id = (select biz from ids);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
begin
  perform public.book_appointment((select biz from ids), (select customer from fx), (select service from fx), pg_temp.at_local('16:00'));
  raise notice 'PASS the assistant (service role) can book';
end $$;

rollback;
