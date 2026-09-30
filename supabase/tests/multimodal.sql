-- WazaBolt multimodal message tests.
-- Run against a database with the migrations applied (never production):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/multimodal.sql
-- Everything runs in a transaction that is rolled back.

begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-e000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'media-a@test.local', '{"full_name":"A","business_name":"Media A"}', now(), now()),
  ('00000000-0000-4000-e000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'media-b@test.local', '{"full_name":"B","business_name":"Media B"}', now(), now());

create temp table ids on commit drop as
select
  (select business_id from public.business_members where user_id = '00000000-0000-4000-e000-00000000000a') as biz_a,
  (select business_id from public.business_members where user_id = '00000000-0000-4000-e000-00000000000b') as biz_b;
grant select on ids to authenticated;

-- As the webhook would (service role / owner): one conversation with each message type.
insert into public.customers (id, business_id, whatsapp_phone) select '00000000-0000-4000-e100-00000000000a', biz_a, '237670000111' from ids;
insert into public.conversations (id, business_id, customer_id) select '00000000-0000-4000-e200-00000000000a', biz_a, '00000000-0000-4000-e100-00000000000a' from ids;

insert into public.messages (id, business_id, conversation_id, direction, sender_type, message_type, whatsapp_message_id, content, caption, payload, processing_status)
select v.id::uuid, ids.biz_a, '00000000-0000-4000-e200-00000000000a', 'inbound', 'customer', v.t, v.wamid, v.body, v.caption, v.payload::jsonb, v.status
from ids, (values
  ('00000000-0000-4000-e300-000000000001', 'text', 'wamid.1', 'Bonjour', null, '{}', 'processed'),
  ('00000000-0000-4000-e300-000000000002', 'audio', 'wamid.2', '', null, '{}', 'unsupported'),
  ('00000000-0000-4000-e300-000000000003', 'image', 'wamid.3', '', 'C''est combien ?', '{}', 'unsupported'),
  ('00000000-0000-4000-e300-000000000004', 'document', 'wamid.4', '', null, '{}', 'unsupported'),
  ('00000000-0000-4000-e300-000000000005', 'video', 'wamid.5', '', null, '{}', 'unsupported'),
  ('00000000-0000-4000-e300-000000000006', 'location', 'wamid.6', '', null, '{"latitude":4.05,"longitude":9.7}', 'unsupported')
) as v(id, t, wamid, body, caption, payload, status);

insert into public.message_media (id, business_id, message_id, kind, whatsapp_media_id, mime_type, is_voice, storage_path, status)
select '00000000-0000-4000-e400-000000000002', biz_a, '00000000-0000-4000-e300-000000000002', 'audio', 'm2', 'audio/ogg', true,
       biz_a || '/00000000-0000-4000-e300-000000000002/00000000-0000-4000-e400-000000000002.ogg', 'stored'
from ids;
insert into public.message_transcriptions (business_id, message_id, media_id, status, transcript, language, provider)
select biz_a, '00000000-0000-4000-e300-000000000002', '00000000-0000-4000-e400-000000000002', 'completed', 'Abeg how much for dis shoe?', 'wes', 'test'
from ids;

do $$
declare b_a uuid; b_b uuid;
begin
  select biz_a, biz_b into b_a, b_b from ids;
  if (select count(distinct message_type) from public.messages where business_id = b_a) <> 6 then
    raise exception 'FAIL: all six message types should be storable';
  end if;

  begin
    insert into public.messages (business_id, conversation_id, direction, sender_type, message_type)
    values (b_a, '00000000-0000-4000-e200-00000000000a', 'inbound', 'customer', 'sticker');
    raise exception 'FAIL: unknown message type accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.messages (business_id, conversation_id, direction, sender_type, whatsapp_message_id)
    values (b_a, '00000000-0000-4000-e200-00000000000a', 'inbound', 'customer', 'wamid.1');
    raise exception 'FAIL: duplicate WhatsApp message id accepted (webhook retries must be idempotent)';
  exception when unique_violation then null;
  end;

  begin
    insert into public.message_media (business_id, message_id, kind, mime_type)
    values (b_b, '00000000-0000-4000-e300-000000000003', 'image', 'image/jpeg');
    raise exception 'FAIL: media attached to another business''s message';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.message_media (business_id, message_id, kind, mime_type, storage_path, status)
    values (b_a, '00000000-0000-4000-e300-000000000003', 'image', 'image/jpeg', b_b || '/x/y.jpg', 'stored');
    raise exception 'FAIL: storage path outside the business folder accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.message_media (business_id, message_id, kind, mime_type, status)
    values (b_a, '00000000-0000-4000-e300-000000000003', 'image', 'image/jpeg', 'stored');
    raise exception 'FAIL: stored media without a storage path accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.message_transcriptions (business_id, message_id, media_id, status)
    values (b_a, '00000000-0000-4000-e300-000000000002', '00000000-0000-4000-e400-000000000002', 'pending');
    raise exception 'FAIL: two transcriptions for one media file';
  exception when unique_violation then null;
  end;

  begin
    insert into public.message_image_analyses (business_id, message_id, media_id, catalog_matches)
    values (b_a, '00000000-0000-4000-e300-000000000002', '00000000-0000-4000-e400-000000000002', '{"not":"an array"}');
    raise exception 'FAIL: catalog_matches must be an array';
  exception when check_violation then null;
  end;

  raise notice 'PASS message types, idempotency, tenant-safe media and transcript constraints';
end $$;

-- Owner A reads their media; owner B sees nothing; nobody writes directly.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000a","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.message_media) <> 1 then raise exception 'FAIL: A should see its media row'; end if;
  if (select transcript from public.message_transcriptions) <> 'Abeg how much for dis shoe?' then raise exception 'FAIL: A should read the transcript'; end if;
  begin
    insert into public.message_media (business_id, message_id, kind, mime_type)
    select biz_a, '00000000-0000-4000-e300-000000000003', 'image', 'image/jpeg' from ids;
    raise exception 'FAIL: users must not write media rows directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.message_transcriptions set transcript = 'edited';
    raise exception 'FAIL: users must not edit transcripts';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS members read their media and transcripts, writes are server-only';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000b","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.message_media) or exists (select 1 from public.message_transcriptions)
     or exists (select 1 from public.messages) then
    raise exception 'FAIL isolation: B can see A''s messages or media';
  end if;
  raise notice 'PASS other businesses cannot see media, transcripts or messages';
end $$;

reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.message_media;
    raise exception 'FAIL: anon can read media';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS anon has no access to media';
end $$;

reset role;
rollback;
