-- WazaBolt — cost tracking (Step 2 of the margin work)
--
--   claude_calls   one row per Claude (Messages API) request: model, token counts by kind, cost in
--                  USD and FCFA at the rates of the moment (config/economics.ts). Internal: only the
--                  server and the WazaBolt admin page read it — businesses never see our costs.
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
