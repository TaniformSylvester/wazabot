-- WazaBolt Stage 7 tests: notification settings, templates and log are per business;
-- only owners/admins change settings; only the server writes templates and the log.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/notifications.sql
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-a700-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'n-owner@test.local', '{"business_name":"Notif A"}', now(), now()),
  ('00000000-0000-4000-a700-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'n-agent@test.local', '{"business_name":"Agent own"}', now(), now()),
  ('00000000-0000-4000-a700-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'n-other@test.local', '{"business_name":"Notif B"}', now(), now());
create temp table ids on commit drop as
select (select business_id from public.business_members where user_id = '00000000-0000-4000-a700-00000000000a') as biz;
grant select on ids to authenticated;
-- Not testing plan limits here: keep the Free plan but outside its limits (grace date far ahead).
update public.businesses set free_limits_from = '2099-01-01' where id in (select biz from ids);
insert into public.business_members (business_id, user_id, role) select biz, '00000000-0000-4000-a700-00000000000b', 'agent' from ids;
insert into public.whatsapp_templates (business_id, kind, name, language, body) select biz, 'order_ready', 'wazabolt_order_ready', 'en', 'Hello {{1}}' from ids;
insert into public.customers (business_id, whatsapp_phone) select biz, '237670009999' from ids;
insert into public.notifications (business_id, kind, customer_id, event_key, status)
select biz, 'order_ready', (select id from public.customers where whatsapp_phone = '237670009999'), 'order:x:ready', 'sent' from ids;

do $$
begin
  if not exists (select 1 from public.notification_settings where business_id = (select biz from ids) and order_updates and appointment_reminders) then
    raise exception 'FAIL: new businesses get notification settings (all on)';
  end if;
  begin
    insert into public.notifications (business_id, kind, event_key, status) select biz, 'order_ready', 'order:x:ready', 'sent' from ids;
    raise exception 'FAIL: same event recorded twice';
  exception when unique_violation then null;
  end;
  raise notice 'PASS settings are created with the business; an event is recorded once';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a700-00000000000b","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.whatsapp_templates) <> 1 or (select count(*) from public.notifications) <> 1 then raise exception 'FAIL: members read templates and log'; end if;
  update public.notification_settings set order_updates = false where business_id = (select biz from ids);
  if not (select order_updates from public.notification_settings where business_id = (select biz from ids)) then raise exception 'FAIL: agents changed settings'; end if;
  begin
    insert into public.notifications (business_id, kind, event_key, status) select biz, 'x', 'y', 'sent' from ids;
    raise exception 'FAIL: users write the log';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.whatsapp_templates set status = 'approved';
    raise exception 'FAIL: users change template status';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS members read; agents can''t change settings; nobody but the server writes templates or the log';
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a700-00000000000a","role":"authenticated"}', true);
do $$
begin
  update public.notification_settings set appointment_reminders = false where business_id = (select biz from ids);
  if (select appointment_reminders from public.notification_settings where business_id = (select biz from ids)) then raise exception 'FAIL: owner can''t change settings'; end if;
  raise notice 'PASS owners change notification settings';
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a700-00000000000c","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.whatsapp_templates) or exists (select 1 from public.notifications)
     or exists (select 1 from public.notification_settings where business_id = (select biz from ids)) then
    raise exception 'FAIL: another business sees templates, log or settings';
  end if;
  raise notice 'PASS other businesses see nothing';
end $$;

rollback;
