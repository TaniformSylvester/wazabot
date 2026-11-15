/*
 * Beta waitlist: businesses asking for early access while sign-up is closed
 * (NEXT_PUBLIC_WAITLIST_MODE=true). Collected by POST /api/waitlist (server,
 * service role), read and exported by the WazaBolt team (/admin/waitlist).
 *
 *  - One lead per WhatsApp number and per email: a repeat is accepted
 *    quietly (the visitor sees the same confirmation, nothing is added).
 *  - A light rate limit per visitor: at most 5 new leads an hour from the same
 *    network address. Only a hash of the address and the day is kept, and
 *    cleared after a day.
 *  - No access for visitors or members (Row Level Security on, no policies);
 *    the server uses the service role.
 *
 * Non-destructive: one new table and one function.
 */

create table public.waitlist_leads (
  id uuid primary key default gen_random_uuid(),
  business_name text not null check (char_length(btrim(business_name)) between 2 and 120),
  whatsapp_number text not null check (whatsapp_number ~ '^[0-9]{8,15}$'),
  email text not null check (email = lower(email) and char_length(email) between 3 and 254 and email like '%_@_%'),
  vertical text not null check (vertical in ('shop', 'restaurant', 'school')),
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  locale text not null default 'en' check (locale in ('en', 'fr')),
  source_hash text,
  created_at timestamptz not null default now()
);
comment on table public.waitlist_leads is 'Early-access beta requests while sign-up is closed. WazaBolt team only.';
comment on column public.waitlist_leads.source_hash is 'Hash of the visitor''s network address and the day, for the rate limit only; cleared after a day.';
create unique index waitlist_leads_whatsapp_key on public.waitlist_leads (whatsapp_number);
create unique index waitlist_leads_email_key on public.waitlist_leads (email);
create index waitlist_leads_source_idx on public.waitlist_leads (source_hash, created_at) where source_hash is not null;
create index waitlist_leads_vertical_idx on public.waitlist_leads (vertical, created_at desc);

alter table public.waitlist_leads enable row level security;
revoke all on public.waitlist_leads from anon, authenticated;
grant select, insert, update, delete on public.waitlist_leads to service_role;

/*
 * Adds a lead. Returns 'joined', or 'already' when the WhatsApp number or the
 * email is already on the list. Over the rate limit: WB496. Service role only.
 */
create or replace function public.join_waitlist(
  p_business_name text, p_whatsapp_number text, p_email text, p_vertical text,
  p_country_code text default null, p_locale text default 'en', p_source_hash text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- Old hashes aren't needed any more.
  update public.waitlist_leads set source_hash = null where source_hash is not null and created_at < now() - interval '1 day';
  if p_source_hash is not null and (
    select count(*) from public.waitlist_leads where source_hash = p_source_hash and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'too many requests' using errcode = 'WB496';
  end if;
  insert into public.waitlist_leads (business_name, whatsapp_number, email, vertical, country_code, locale, source_hash)
  values (btrim(p_business_name), p_whatsapp_number, lower(btrim(p_email)), p_vertical, p_country_code, coalesce(p_locale, 'en'), p_source_hash)
  on conflict do nothing
  returning id into v_id;
  return case when v_id is null then 'already' else 'joined' end;
end;
$$;
revoke execute on function public.join_waitlist(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.join_waitlist(text, text, text, text, text, text, text) to service_role;
