-- WazaBolt — Stage 2: WhatsApp Business Platform (Cloud API) integration
--
--   whatsapp_credentials      per-business access token, encrypted by the app (AES-256-GCM)
--                             before it reaches the database. No browser role can read it.
--   messages                  delivery status for outbound messages (sent → delivered → read / failed)
--                             and which team member sent them
--   conversations             last_customer_message_at: WhatsApp's 24-hour customer-service window
--   ingest_whatsapp_message() one atomic, idempotent step per inbound message:
--                             customer upsert → open conversation → message → counters
--   record_whatsapp_status()  applies delivery receipts without ever going backwards
--
-- Webhook processing runs on the server with the service role. These
-- functions are executable by the service role only.


-- ---------------------------------------------------------------------------
-- Credentials (server-only)
-- ---------------------------------------------------------------------------
create table public.whatsapp_credentials (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  -- "v1:<iv>:<tag>:<ciphertext>" (base64url), encrypted with WHATSAPP_TOKEN_ENCRYPTION_KEY.
  access_token_encrypted text not null check (char_length(access_token_encrypted) between 20 and 4096),
  -- Last 4 characters, so the team can tell which token is stored without seeing it.
  token_hint text check (char_length(token_hint) <= 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger whatsapp_credentials_set_updated_at before update on public.whatsapp_credentials
  for each row execute function public.set_updated_at();

-- RLS on and no policies: only the service role (which bypasses RLS) can touch it.
alter table public.whatsapp_credentials enable row level security;
revoke all on public.whatsapp_credentials from anon, authenticated;
grant select, insert, update, delete on public.whatsapp_credentials to service_role;

-- ---------------------------------------------------------------------------
-- Messages: delivery status for outbound messages
-- ---------------------------------------------------------------------------
alter table public.messages
  add column delivery_status text
    check (delivery_status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  -- WhatsApp error code/title when sending failed (never message content).
  add column delivery_error text check (char_length(delivery_error) <= 200),
  add column sent_by uuid references auth.users (id) on delete set null,
  add column status_updated_at timestamptz,
  add constraint messages_delivery_status_direction_check
    check (delivery_status is null or direction = 'outbound');

-- ---------------------------------------------------------------------------
-- Conversations: 24-hour customer-service window
-- ---------------------------------------------------------------------------
alter table public.conversations add column last_customer_message_at timestamptz;

update public.conversations c
set last_customer_message_at = m.last_at
from (
  select business_id, conversation_id, max(created_at) as last_at
  from public.messages where direction = 'inbound'
  group by business_id, conversation_id
) m
where m.business_id = c.business_id and m.conversation_id = c.id;

-- ---------------------------------------------------------------------------
-- Inbound messages
-- ---------------------------------------------------------------------------
create function public.ingest_whatsapp_message(
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

-- ---------------------------------------------------------------------------
-- Delivery receipts
-- ---------------------------------------------------------------------------
create function public.delivery_status_rank(s text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case s when 'pending' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 4 else -1 end;
$$;

-- Returns true when a message was updated. Statuses only move forward
-- (Meta can deliver "delivered" after "read"); "failed" wins unless already read.
create function public.record_whatsapp_status(
  p_phone_number_id text,
  p_whatsapp_message_id text,
  p_status text,
  p_error text default null,
  p_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
  v_count int;
begin
  if p_status not in ('sent', 'delivered', 'read', 'failed') then
    return false;
  end if;
  select c.business_id into v_business from public.whatsapp_connections c where c.phone_number_id = p_phone_number_id;
  if v_business is null then
    return false;
  end if;
  update public.messages m
  set delivery_status = p_status,
      delivery_error = case when p_status = 'failed' then left(p_error, 200) else m.delivery_error end,
      status_updated_at = coalesce(p_at, now())
  where m.business_id = v_business
    and m.whatsapp_message_id = p_whatsapp_message_id
    and m.direction = 'outbound'
    and coalesce(m.delivery_status, 'pending') <> 'read'
    and public.delivery_status_rank(p_status) > public.delivery_status_rank(coalesce(m.delivery_status, 'pending'));
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.ingest_whatsapp_message(text, text, text, text, text, text, text, jsonb, timestamptz, text, text, text, real, text, boolean) from public, anon, authenticated;
revoke all on function public.record_whatsapp_status(text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.ingest_whatsapp_message(text, text, text, text, text, text, text, jsonb, timestamptz, text, text, text, real, text, boolean) to service_role;
grant execute on function public.record_whatsapp_status(text, text, text, text, timestamptz) to service_role;

create index messages_outbound_status_idx on public.messages (business_id, whatsapp_message_id) where direction = 'outbound';

