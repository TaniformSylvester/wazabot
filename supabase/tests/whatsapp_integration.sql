-- WazaBolt Stage 2 tests: WhatsApp credentials are server-only, inbound
-- ingestion is atomic + idempotent + tenant-safe, delivery receipts only move
-- forward. Run against a database with the migrations applied (never production):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/whatsapp_integration.sql
-- Everything runs in a transaction that is rolled back.

begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-e000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'wa-a@test.local', '{"full_name":"Owner A","business_name":"Wa Shop A"}', now(), now()),
  ('00000000-0000-4000-e000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'wa-b@test.local', '{"full_name":"Owner B","business_name":"Wa Shop B"}', now(), now());

create temp table ids on commit drop as
select
  (select business_id from public.business_members where user_id = '00000000-0000-4000-e000-00000000000a') as biz_a,
  (select business_id from public.business_members where user_id = '00000000-0000-4000-e000-00000000000b') as biz_b;
grant select on ids to authenticated;

-- The server connects A's number (service role).
update public.whatsapp_connections set status = 'connected', phone_number_id = '1001', display_phone_number = '+237 6 99 00 00 01'
where business_id = (select biz_a from ids);
insert into public.whatsapp_credentials (business_id, access_token_encrypted, token_hint)
select biz_a, 'v1:aaaaaaaa:bbbbbbbb:cccccccccccc', 'abcd' from ids;

do $$
declare r record; r2 record; b uuid; n int;
begin
  select biz_a into b from ids;

  -- First message from a new customer creates customer + conversation + message.
  select * into r from public.ingest_whatsapp_message('1001', 'wamid.A1', '237670000001', 'Brenda', 'text',
    'Bonjour, vous livrez à Buea ?', null, '{}', now() - interval '1 minute', 'received', null, 'fr', 0.9, null, false);
  if r.business_id <> b or not r.inserted then raise exception 'FAIL: first message not stored for business A'; end if;
  if (select name from public.customers where id = r.customer_id) <> 'Brenda' then raise exception 'FAIL: profile name not saved'; end if;
  if (select unread_count from public.conversations where id = r.conversation_id) <> 1 then raise exception 'FAIL: unread not incremented'; end if;
  if (select last_customer_message_at from public.conversations where id = r.conversation_id) is null then raise exception 'FAIL: 24h window not tracked'; end if;

  -- Webhook retry: same wamid → no duplicate.
  select * into r2 from public.ingest_whatsapp_message('1001', 'wamid.A1', '237670000001', 'Brenda', 'text',
    'Bonjour, vous livrez à Buea ?', null, '{}', now(), 'received');
  if r2.inserted or r2.message_id <> r.message_id then raise exception 'FAIL: retry created a duplicate'; end if;
  select count(*) into n from public.messages where business_id = b;
  if n <> 1 then raise exception 'FAIL: expected 1 message, got %', n; end if;

  -- Second message continues the same conversation; a saved name is not overwritten.
  update public.customers set name = 'Brenda Fon' where id = r.customer_id;
  select * into r2 from public.ingest_whatsapp_message('1001', 'wamid.A2', '237670000001', 'B.', 'image',
    '', 'This one?', '{}', now(), 'unsupported', 'no_vision');
  if r2.conversation_id <> r.conversation_id then raise exception 'FAIL: second message opened a new conversation'; end if;
  if (select name from public.customers where id = r.customer_id) <> 'Brenda Fon' then raise exception 'FAIL: saved name overwritten'; end if;
  if (select unread_count from public.conversations where id = r.conversation_id) <> 2 then raise exception 'FAIL: unread should be 2'; end if;

  -- A resolved conversation is reopened; an archived one is left alone.
  update public.conversations set status = 'resolved' where id = r.conversation_id;
  select * into r2 from public.ingest_whatsapp_message('1001', 'wamid.A3', '237670000001', null, 'text', 'Merci', null, '{}', now(), 'received');
  if r2.conversation_id <> r.conversation_id or (select status from public.conversations where id = r.conversation_id) <> 'open' then
    raise exception 'FAIL: resolved conversation not reopened';
  end if;
  update public.conversations set status = 'archived' where id = r.conversation_id;
  select * into r2 from public.ingest_whatsapp_message('1001', 'wamid.A4', '237670000001', null, 'text', 'Hello again', null, '{}', now(), 'received');
  if r2.conversation_id = r.conversation_id then raise exception 'FAIL: archived conversation reused'; end if;

  -- Unknown or disconnected numbers store nothing.
  select count(*) into n from public.ingest_whatsapp_message('9999', 'wamid.X', '237670000009', null, 'text', 'x', null, '{}', now(), 'received');
  if n <> 0 then raise exception 'FAIL: message stored for an unknown number'; end if;

  -- Two messages stamped in the same second keep their arrival order.
  select * into r from public.ingest_whatsapp_message('1001', 'wamid.S1', '237670000002', 'Same', 'text', 'Super', null, '{}', date_trunc('second', now()), 'received');
  select * into r2 from public.ingest_whatsapp_message('1001', 'wamid.S2', '237670000002', 'Same', 'text', 'Je prends 2', null, '{}', date_trunc('second', now()), 'received');
  if (select created_at from public.messages where id = r2.message_id) <= (select created_at from public.messages where id = r.message_id) then
    raise exception 'FAIL: same-second messages out of order';
  end if;
  delete from public.messages where conversation_id = r.conversation_id;
  delete from public.conversations where id = r.conversation_id;
  delete from public.customers where whatsapp_phone = '237670000002';

  raise notice 'PASS inbound messages: customer upsert, one conversation, idempotent retries, reopen rules';
end $$;

do $$
declare b uuid; conv uuid; m uuid;
begin
  select biz_a into b from ids;
  select id into conv from public.conversations where business_id = b and status = 'open' limit 1;
  insert into public.messages (business_id, conversation_id, direction, sender_type, content, whatsapp_message_id, delivery_status)
  values (b, conv, 'outbound', 'agent', 'Oui, 2 500 XAF.', 'wamid.OUT1', 'sent') returning id into m;

  if not public.record_whatsapp_status('1001', 'wamid.OUT1', 'read') then raise exception 'FAIL: read not applied'; end if;
  if public.record_whatsapp_status('1001', 'wamid.OUT1', 'delivered') then raise exception 'FAIL: status went backwards'; end if;
  if public.record_whatsapp_status('1001', 'wamid.OUT1', 'failed', '131047') then raise exception 'FAIL: failed after read'; end if;
  if (select delivery_status from public.messages where id = m) <> 'read' then raise exception 'FAIL: expected read'; end if;
  if public.record_whatsapp_status('9999', 'wamid.OUT1', 'failed') then raise exception 'FAIL: other number updated A''s message'; end if;
  begin
    insert into public.messages (business_id, conversation_id, direction, sender_type, content, delivery_status)
    values (b, conv, 'inbound', 'customer', 'x', 'sent');
    raise exception 'FAIL: inbound message with a delivery status';
  exception when check_violation then null;
  end;
  raise notice 'PASS delivery receipts only move forward and stay within the business';
end $$;

-- Browser roles can't touch credentials or call the ingestion functions.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000a","role":"authenticated"}', true);
do $$
begin
  begin
    perform 1 from public.whatsapp_credentials;
    raise exception 'FAIL: owner can read encrypted credentials';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ingest_whatsapp_message('1001', 'wamid.Z', '237670000002', null, 'text', 'x', null, '{}', now(), 'received');
    raise exception 'FAIL: authenticated can call ingest_whatsapp_message';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_whatsapp_status('1001', 'wamid.OUT1', 'failed');
    raise exception 'FAIL: authenticated can call record_whatsapp_status';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.whatsapp_connections set status = 'connected', phone_number_id = '2002' where business_id = (select biz_a from ids);
    if found then raise exception 'FAIL: owner changed connection state directly'; end if;
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.messages) <> 5 then raise exception 'FAIL: owner A should see A''s 5 messages'; end if;
  raise notice 'PASS credentials and ingestion are server-only; owner reads own messages';
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000b","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.messages) <> 0 or (select count(*) from public.customers) <> 0 then
    raise exception 'FAIL: B sees A''s WhatsApp data';
  end if;
  if (select phone_number_id from public.whatsapp_connections) is not null then raise exception 'FAIL: B sees A''s number'; end if;
  raise notice 'PASS other businesses see none of the WhatsApp data';
end $$;

reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.whatsapp_credentials;
    raise exception 'FAIL: anon can read credentials';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS anon has no access to credentials';
end $$;

reset role;
rollback;
