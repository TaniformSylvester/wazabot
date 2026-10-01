-- WazaBolt — keep WhatsApp messages in arrival order.
--
-- WhatsApp timestamps have one-second precision, so two messages sent in the
-- same second would tie and could be shown — and answered — in the wrong
-- order. A message stamped within two seconds of (or before) the latest one
-- in its conversation is placed one millisecond after it; older deliveries
-- (e.g. a late Meta retry) keep their own time.

create or replace function public.ingest_whatsapp_message(
  p_phone_number_id text,
  p_whatsapp_message_id text,
  p_from text,
  p_profile_name text,
  p_message_type text,
  p_content text,
  p_caption text,
  p_payload jsonb,
  p_received_at timestamptz,
  p_processing_status text,
  p_processing_error text default null,
  p_language text default null,
  p_language_confidence real default null,
  p_secondary_language text default null,
  p_is_mixed boolean default false
)
returns table (business_id uuid, customer_id uuid, conversation_id uuid, message_id uuid, inserted boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_business uuid;
  v_customer uuid;
  v_conversation uuid;
  v_conversation_status text;
  v_message uuid;
  v_last timestamptz;
  v_at timestamptz := least(coalesce(p_received_at, now()), now());
  v_name text := left(btrim(coalesce(p_profile_name, '')), 120);
begin
  select c.business_id into v_business
  from public.whatsapp_connections c
  where c.phone_number_id = p_phone_number_id and c.status = 'connected';
  if v_business is null then
    return; -- not a connected number: nothing is stored
  end if;
  if p_from !~ '^[0-9]{6,20}$' or coalesce(p_whatsapp_message_id, '') = '' then
    raise exception 'invalid sender or message id' using errcode = '22023';
  end if;

  -- One customer at a time: concurrent deliveries can't create two conversations.
  perform pg_advisory_xact_lock(hashtextextended(v_business::text || ':' || p_from, 0));

  -- Webhook retries: the same WhatsApp message id is stored once.
  select m.id, m.conversation_id into v_message, v_conversation
  from public.messages m
  where m.business_id = v_business and m.whatsapp_message_id = p_whatsapp_message_id;
  if v_message is not null then
    select cv.customer_id into v_customer from public.conversations cv where cv.business_id = v_business and cv.id = v_conversation;
    return query select v_business, v_customer, v_conversation, v_message, false;
    return;
  end if;

  insert into public.customers as cu (business_id, whatsapp_phone, name, first_contact_at, last_contact_at, last_detected_language)
  values (v_business, p_from, v_name, v_at, v_at, p_language)
  on conflict (business_id, whatsapp_phone) do update
    set name = case when cu.name = '' then excluded.name else cu.name end,
        first_contact_at = coalesce(cu.first_contact_at, excluded.first_contact_at),
        last_contact_at = greatest(cu.last_contact_at, excluded.last_contact_at),
        last_detected_language = coalesce(excluded.last_detected_language, cu.last_detected_language)
  returning cu.id into v_customer;

  -- Continue the latest conversation unless it was archived; a resolved one is reopened.
  select cv.id, cv.status into v_conversation, v_conversation_status
  from public.conversations cv
  where cv.business_id = v_business and cv.customer_id = v_customer and cv.status <> 'archived'
  order by cv.created_at desc
  limit 1;
  if v_conversation is null then
    insert into public.conversations (business_id, customer_id, status, language)
    values (v_business, v_customer, 'open', p_language)
    returning id into v_conversation;
  elsif v_conversation_status = 'resolved' then
    update public.conversations set status = 'open' where id = v_conversation;
  end if;

  select max(m.created_at) into v_last
  from public.messages m
  where m.business_id = v_business and m.conversation_id = v_conversation;
  if v_last is not null and v_at <= v_last + interval '2 seconds' and v_at > v_last - interval '2 seconds' then
    v_at := greatest(v_at, v_last + interval '1 millisecond');
  end if;

  insert into public.messages (
    business_id, conversation_id, direction, sender_type, message_type, content, caption, payload,
    whatsapp_message_id, processing_status, processing_error,
    language, language_confidence, secondary_language, is_mixed, created_at
  )
  values (
    v_business, v_conversation, 'inbound', 'customer', p_message_type, left(coalesce(p_content, ''), 4096),
    left(p_caption, 4096), coalesce(p_payload, '{}'::jsonb),
    p_whatsapp_message_id, p_processing_status, left(p_processing_error, 80),
    p_language, p_language_confidence, p_secondary_language, coalesce(p_is_mixed, false), v_at
  )
  returning id into v_message;

  update public.conversations
  set last_message_at = greatest(last_message_at, v_at),
      last_customer_message_at = greatest(last_customer_message_at, v_at),
      unread_count = unread_count + 1,
      language = coalesce(p_language, language)
  where id = v_conversation;

  return query select v_business, v_customer, v_conversation, v_message, true;
end;
$$;
