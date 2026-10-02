-- WazaBolt — cost tracking (Step 2 of the margin work)
--
--   claude_calls                one row per Claude (Messages API) request: model, token counts by kind, cost in
--                                USD and FCFA at the rates of the moment (config/economics.ts). Internal: only the
--                                server and the WazaBolt admin page read it — businesses never see our costs.
--   messages.wa_category        what we sent each outbound WhatsApp message as: service (free-form text in
--                                the 24-hour window), utility or marketing (templates).
--   messages.meta_*              what Meta reported for it in the status webhook (pricing category, billable,
--                                pricing type) — to check our estimates against Meta's own figures.
--   whatsapp_usage               outbound messages per WhatsApp number, per month (UTC) and category: the
--                                free-service-message allowance is counted per number.
--   whatsapp_free_usage()        this month's service messages for the business's connected number (members).
--
-- Written by the server (service role) only.

create table public.claude_calls (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- The reply attempt it belongs to (null for test-chat runs that failed before logging).
  ai_usage_id uuid references public.ai_usage (id) on delete set null,
  source text not null check (source in ('reply', 'test_chat')),
  model text not null check (char_length(model) <= 80),
  -- Position in the reply's tool loop (1 = first request).
  step smallint not null default 1 check (step >= 1),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  cache_write_5m_tokens integer not null default 0 check (cache_write_5m_tokens >= 0),
  cache_write_1h_tokens integer not null default 0 check (cache_write_1h_tokens >= 0),
  cost_usd numeric(12, 6) not null check (cost_usd >= 0),
  cost_fcfa numeric(12, 4) not null check (cost_fcfa >= 0),
  -- False when the model had no known rate (costed at the most expensive one).
  rate_known boolean not null default true,
  created_at timestamptz not null default now()
);
create index claude_calls_business_created_idx on public.claude_calls (business_id, created_at);
create index claude_calls_created_idx on public.claude_calls (created_at);

alter table public.claude_calls enable row level security;
revoke all on public.claude_calls from anon, authenticated;
grant select, insert on public.claude_calls to service_role;

-- ---------------------------------------------------------------------------
-- WhatsApp sends by Meta pricing category
-- ---------------------------------------------------------------------------
alter table public.messages
  add column wa_category text check (wa_category in ('service', 'utility', 'marketing', 'authentication')),
  add column meta_category text check (char_length(meta_category) <= 40),
  add column meta_billable boolean,
  add column meta_pricing_type text check (char_length(meta_pricing_type) <= 40);

create table public.whatsapp_usage (
  phone_number_id text not null check (char_length(phone_number_id) <= 64),
  -- First day of the month (UTC).
  month date not null check (extract(day from month) = 1),
  category text not null check (category in ('service', 'utility', 'marketing', 'authentication')),
  -- The business using the number (last one, if the number moved).
  business_id uuid not null references public.businesses (id) on delete cascade,
  sent integer not null default 0 check (sent >= 0),
  updated_at timestamptz not null default now(),
  primary key (phone_number_id, month, category)
);
create index whatsapp_usage_business_idx on public.whatsapp_usage (business_id, month);

alter table public.whatsapp_usage enable row level security;
revoke all on public.whatsapp_usage from anon, authenticated;
grant select, insert, update on public.whatsapp_usage to service_role;

/* Counts one outbound WhatsApp message (called by the server after Meta accepted it). */
create function public.record_whatsapp_send(p_business_id uuid, p_phone_number_id text, p_category text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.whatsapp_usage (phone_number_id, month, category, business_id, sent)
  values (p_phone_number_id, (date_trunc('month', now() at time zone 'utc'))::date, p_category, p_business_id, 1)
  on conflict (phone_number_id, month, category)
  do update set sent = public.whatsapp_usage.sent + 1, business_id = excluded.business_id, updated_at = now();
$$;
revoke execute on function public.record_whatsapp_send(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_whatsapp_send(uuid, text, text) to service_role;

/*
 * Service messages sent this month (UTC) from the business's connected
 * number — what the owner's "free WhatsApp messages left" bar shows (the
 * allowance itself is in config/economics.ts). No prices.
 */
create function public.whatsapp_free_usage(p_business_id uuid)
returns table (phone_number_id text, service_sent integer, month date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month date := (date_trunc('month', now() at time zone 'utc'))::date;
begin
  if (select auth.role()) is distinct from 'service_role' and not public.is_business_member(p_business_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select c.phone_number_id,
         coalesce((select u.sent from public.whatsapp_usage u
                   where u.phone_number_id = c.phone_number_id and u.month = v_month and u.category = 'service'), 0),
         v_month
  from public.whatsapp_connections c
  where c.business_id = p_business_id and c.status = 'connected' and c.phone_number_id is not null;
end;
$$;
revoke execute on function public.whatsapp_free_usage(uuid) from public, anon;
grant execute on function public.whatsapp_free_usage(uuid) to authenticated, service_role;
