-- WazaBolt — multilingual foundation
--
-- Languages are data, not hard-coded columns, so new African languages and
-- country packs can be added with an insert:
--
--   languages               every language the platform knows (BCP-47 codes)
--   country_packs           per-country defaults (currency, timezone, language)
--   country_pack_languages  the languages customers use in that country
--   business_languages      languages a business's assistant replies in
--   ai_settings             response style + language mode per business
--   customers               per-customer language preference
--   conversations/messages  conversation language and per-message detection
--
-- Also: users.ui_locale (dashboard language) and businesses.default_language.
-- Replaces businesses.languages (text[]) with business_languages.
-- Mirrors lib/i18n/languages.ts and lib/i18n/country-packs.ts.

-- ---------------------------------------------------------------------------
-- Reference data: languages and country packs
-- ---------------------------------------------------------------------------
create table public.languages (
  code text primary key check (code ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  english_name text not null,
  native_name text not null,
  direction text not null default 'ltr' check (direction in ('ltr', 'rtl')),
  -- Website/dashboard can be displayed in this language.
  ui_supported boolean not null default false,
  -- The WhatsApp assistant can understand and reply in this language.
  ai_supported boolean not null default false,
  -- Reply language to use when this one isn't enabled for a business.
  fallback_language text references public.languages (code),
  created_at timestamptz not null default now()
);

insert into public.languages (code, english_name, native_name, ui_supported, ai_supported, fallback_language) values
  ('en', 'English', 'English', true, true, null),
  ('fr', 'French', 'Français', true, true, null),
  ('wes', 'Cameroonian Pidgin English', 'Pidgin (Kamtok)', false, true, 'en');

create table public.country_packs (
  country_code char(2) primary key check (country_code ~ '^[A-Z]{2}$'),
  english_name text not null,
  currency char(3) not null,
  timezone text not null,
  default_language text not null references public.languages (code),
  status text not null default 'planned' check (status in ('active', 'planned')),
  created_at timestamptz not null default now()
);

create table public.country_pack_languages (
  country_code char(2) not null references public.country_packs (country_code) on delete cascade,
  language_code text not null references public.languages (code),
  sort_order smallint not null default 0,
  primary key (country_code, language_code)
);

insert into public.country_packs (country_code, english_name, currency, timezone, default_language, status)
values ('CM', 'Cameroon', 'XAF', 'Africa/Douala', 'en', 'active');

insert into public.country_pack_languages (country_code, language_code, sort_order) values
  ('CM', 'en', 1),
  ('CM', 'fr', 2),
  ('CM', 'wes', 3);

-- ---------------------------------------------------------------------------
-- Users and businesses
-- ---------------------------------------------------------------------------
alter table public.users
  add column ui_locale text not null default 'en' references public.languages (code);

alter table public.businesses
  add column default_language text not null default 'en' references public.languages (code),
  add constraint businesses_country_code_fkey foreign key (country_code) references public.country_packs (country_code);

create table public.business_languages (
  business_id uuid not null references public.businesses (id) on delete cascade,
  language_code text not null references public.languages (code),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  primary key (business_id, language_code)
);

-- Backfill from the old array column, then add the country pack's languages
-- (existing Cameroon businesses gain Pidgin).
insert into public.business_languages (business_id, language_code, sort_order)
select b.id, u.code, u.ord
from public.businesses b
cross join lateral unnest(b.languages) with ordinality as u (code, ord)
join public.languages l on l.code = u.code
on conflict do nothing;

insert into public.business_languages (business_id, language_code, sort_order)
select b.id, cpl.language_code, cpl.sort_order
from public.businesses b
join public.country_pack_languages cpl on cpl.country_code = b.country_code
on conflict do nothing;

update public.businesses b
set default_language = coalesce(
  (select u.code from unnest(b.languages) with ordinality as u (code, ord)
   join public.languages l on l.code = u.code order by u.ord limit 1),
  'en');

insert into public.business_languages (business_id, language_code, sort_order)
select id, default_language, 0 from public.businesses
on conflict do nothing;

alter table public.businesses drop column languages;

-- The default language must always be one of the business's languages.
-- Deferred to commit so a business and its languages can be created together.
create function public.assert_business_default_language(target uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  lang text;
begin
  select default_language into lang from public.businesses where id = target;
  if lang is null then
    return; -- business deleted
  end if;
  if not exists (select 1 from public.business_languages where business_id = target and language_code = lang) then
    raise exception 'default language % must be one of the business''s languages', lang using errcode = '23514';
  end if;
end;
$$;

create function public.businesses_check_default_language()
returns trigger
language plpgsql
-- Deferred: runs at commit as whichever role committed (e.g. the auth service during sign-up).
security definer
set search_path = ''
as $$
begin
  perform public.assert_business_default_language(new.id);
  return null;
end;
$$;

create function public.business_languages_check_default_language()
returns trigger
language plpgsql
-- Deferred: runs at commit as whichever role committed (e.g. the auth service during sign-up).
security definer
set search_path = ''
as $$
begin
  perform public.assert_business_default_language(old.business_id);
  return null;
end;
$$;

create constraint trigger businesses_default_language_enabled
  after insert or update of default_language on public.businesses
  deferrable initially deferred
  for each row execute function public.businesses_check_default_language();

create constraint trigger business_languages_keep_default
  after delete or update on public.business_languages
  deferrable initially deferred
  for each row execute function public.business_languages_check_default_language();

-- ---------------------------------------------------------------------------
-- AI response style (one row per business)
-- ---------------------------------------------------------------------------
create table public.ai_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  -- auto: reply in the customer's language · fixed: always the default language
  language_mode text not null default 'auto' check (language_mode in ('auto', 'fixed')),
  tone text not null default 'friendly' check (tone in ('friendly', 'professional', 'warm')),
  formality text not null default 'neutral' check (formality in ('informal', 'neutral', 'formal')),
  emoji_level text not null default 'light' check (emoji_level in ('none', 'light', 'expressive')),
  reply_length text not null default 'short' check (reply_length in ('short', 'medium', 'detailed')),
  mirror_code_switching boolean not null default false,
  style_notes text not null default '' check (char_length(style_notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger ai_settings_set_updated_at before update on public.ai_settings
  for each row execute function public.set_updated_at();

insert into public.ai_settings (business_id) select id from public.businesses on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Customers, conversations, messages — language-aware from the start.
-- Filled by the WhatsApp webhook (server side) in a later phase.
-- Composite foreign keys make cross-business references impossible.
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  whatsapp_id text not null check (whatsapp_id ~ '^[0-9]{6,20}$'),
  display_name text not null default '' check (char_length(display_name) <= 120),
  preferred_language text references public.languages (code),
  -- explicit_request: the customer asked · set_by_business: a team member chose · inferred: detected
  preferred_language_source text check (preferred_language_source in ('explicit_request', 'set_by_business', 'inferred')),
  preferred_language_updated_at timestamptz,
  last_detected_language text references public.languages (code),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, whatsapp_id),
  unique (business_id, id),
  check ((preferred_language is null) = (preferred_language_source is null))
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null,
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  status text not null default 'open' check (status in ('open', 'closed')),
  handled_by text not null default 'ai' check (handled_by in ('ai', 'human')),
  -- The language the conversation is currently held in.
  language text references public.languages (code),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, customer_id) references public.customers (business_id, id) on delete cascade
);
create index conversations_business_last_message_idx on public.conversations (business_id, last_message_at desc);
create index conversations_customer_idx on public.conversations (business_id, customer_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  conversation_id uuid not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender text not null check (sender in ('customer', 'ai', 'agent', 'system')),
  body text not null default '' check (char_length(body) <= 4096),
  -- Inbound: detected main language. Outbound: language the reply was written in.
  language text references public.languages (code),
  language_confidence real check (language_confidence between 0 and 1),
  secondary_language text references public.languages (code),
  is_mixed boolean not null default false,
  -- Outbound AI replies: why this language was chosen (lib/ai/language/resolve.ts).
  language_reason text check (char_length(language_reason) <= 40),
  created_at timestamptz not null default now(),
  foreign key (business_id, conversation_id) references public.conversations (business_id, id) on delete cascade,
  check ((direction = 'inbound') = (sender = 'customer'))
);
create index messages_conversation_created_idx on public.messages (business_id, conversation_id, created_at);

create trigger customers_set_updated_at before update on public.customers
  for each row execute function public.set_updated_at();
create trigger conversations_set_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Settings changes go through functions that validate everything together.
-- ---------------------------------------------------------------------------
create function public.update_business_language_settings(
  p_business_id uuid,
  p_default_language text,
  p_languages text[],
  p_language_mode text,
  p_tone text,
  p_formality text,
  p_emoji_level text,
  p_reply_length text,
  p_mirror_code_switching boolean,
  p_style_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_languages text[];
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin']::public.business_role[]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select array_agg(distinct u.code) into v_languages from unnest(p_languages) as u (code) where u.code is not null;
  if v_languages is null or cardinality(v_languages) = 0 then
    raise exception 'choose at least one language' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_languages) as u (code)
    where not exists (select 1 from public.languages l where l.code = u.code and l.ai_supported)
  ) then
    raise exception 'unsupported language' using errcode = '22023';
  end if;
  if not (p_default_language = any (v_languages)) then
    raise exception 'default language must be enabled' using errcode = '22023';
  end if;

  delete from public.business_languages
  where business_id = p_business_id and not (language_code = any (v_languages));

  insert into public.business_languages (business_id, language_code, sort_order)
  select distinct on (u.code) p_business_id, u.code, u.ord
  from unnest(p_languages) with ordinality as u (code, ord)
  where u.code = any (v_languages)
  order by u.code, u.ord
  on conflict (business_id, language_code) do update set sort_order = excluded.sort_order;

  update public.businesses set default_language = p_default_language where id = p_business_id;

  insert into public.ai_settings as s (
    business_id, language_mode, tone, formality, emoji_level, reply_length, mirror_code_switching, style_notes
  ) values (
    p_business_id, p_language_mode, p_tone, p_formality, p_emoji_level, p_reply_length,
    p_mirror_code_switching, left(btrim(coalesce(p_style_notes, '')), 500)
  )
  on conflict (business_id) do update set
    language_mode = excluded.language_mode,
    tone = excluded.tone,
    formality = excluded.formality,
    emoji_level = excluded.emoji_level,
    reply_length = excluded.reply_length,
    mirror_code_switching = excluded.mirror_code_switching,
    style_notes = excluded.style_notes;

  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_business_id, (select auth.uid()), 'ai_settings.updated', 'business', p_business_id::text,
    jsonb_build_object('default_language', p_default_language, 'languages', to_jsonb(v_languages), 'language_mode', p_language_mode)
  );
end;
$$;

create function public.set_ui_locale(p_locale text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.languages where code = p_locale and ui_supported) then
    raise exception 'unsupported locale' using errcode = '22023';
  end if;
  update public.users set ui_locale = p_locale where id = (select auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- Sign-up: now also sets the dashboard language, the country pack defaults,
-- the business languages and default AI settings.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_business_id uuid;
  v_full_name text := left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120);
  v_business_name text := left(btrim(coalesce(new.raw_user_meta_data ->> 'business_name', '')), 120);
  v_locale text := lower(coalesce(new.raw_user_meta_data ->> 'locale', ''));
  v_country text := upper(coalesce(new.raw_user_meta_data ->> 'country_code', ''));
  v_pack public.country_packs%rowtype;
  v_default_language text;
begin
  if not exists (select 1 from public.languages where code = v_locale and ui_supported) then
    v_locale := 'en';
  end if;

  select * into v_pack from public.country_packs where country_code = v_country and status = 'active';
  if not found then
    select * into v_pack from public.country_packs where country_code = 'CM';
  end if;

  -- The owner's sign-up language becomes the business default when the country uses it.
  v_default_language := case
    when exists (select 1 from public.country_pack_languages
                 where country_code = v_pack.country_code and language_code = v_locale) then v_locale
    else v_pack.default_language
  end;

  insert into public.users (id, full_name, ui_locale) values (new.id, v_full_name, v_locale);

  insert into public.businesses (name, country_code, currency, timezone, default_language)
  values (coalesce(nullif(v_business_name, ''), 'My business'), v_pack.country_code, v_pack.currency, v_pack.timezone, v_default_language)
  returning id into new_business_id;

  insert into public.business_languages (business_id, language_code, sort_order)
  select new_business_id, language_code, sort_order
  from public.country_pack_languages where country_code = v_pack.country_code
  on conflict do nothing;

  insert into public.business_languages (business_id, language_code, sort_order)
  values (new_business_id, v_default_language, 0)
  on conflict do nothing;

  insert into public.ai_settings (business_id) values (new_business_id);

  insert into public.business_members (business_id, user_id, role)
  values (new_business_id, new.id, 'owner');

  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id)
  values (new_business_id, new.id, 'business.created', 'business', new_business_id::text);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.languages enable row level security;
alter table public.country_packs enable row level security;
alter table public.country_pack_languages enable row level security;
alter table public.business_languages enable row level security;
alter table public.ai_settings enable row level security;
alter table public.customers enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Reference data is public.
create policy "languages: readable by everyone" on public.languages for select using (true);
create policy "country_packs: readable by everyone" on public.country_packs for select using (true);
create policy "country_pack_languages: readable by everyone" on public.country_pack_languages for select using (true);

-- Business data: members read. Settings are written only through
-- update_business_language_settings (owners/admins).
create policy "business_languages: members read" on public.business_languages
  for select to authenticated using (public.is_business_member(business_id));
create policy "ai_settings: members read" on public.ai_settings
  for select to authenticated using (public.is_business_member(business_id));

create policy "customers: members read" on public.customers
  for select to authenticated using (public.is_business_member(business_id));
-- Any team member may correct a customer's name or language preference.
create policy "customers: members update" on public.customers
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

create policy "conversations: members read" on public.conversations
  for select to authenticated using (public.is_business_member(business_id));
create policy "messages: members read" on public.messages
  for select to authenticated using (public.is_business_member(business_id));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.languages, public.country_packs, public.country_pack_languages,
  public.business_languages, public.ai_settings, public.customers, public.conversations, public.messages
  from anon, authenticated;

grant select on public.languages, public.country_packs, public.country_pack_languages to anon, authenticated;
grant select on public.business_languages, public.ai_settings, public.customers, public.conversations, public.messages
  to authenticated;
grant update (display_name, preferred_language, preferred_language_source, preferred_language_updated_at)
  on public.customers to authenticated;
grant all on public.languages, public.country_packs, public.country_pack_languages,
  public.business_languages, public.ai_settings, public.customers, public.conversations, public.messages
  to service_role;

-- The old grant covered businesses.languages (now dropped); keep the rest.
revoke update on public.businesses from authenticated;
grant update (name, timezone) on public.businesses to authenticated;

revoke execute on function public.assert_business_default_language(uuid) from public, anon, authenticated;
revoke execute on function public.businesses_check_default_language() from public, anon, authenticated;
revoke execute on function public.business_languages_check_default_language() from public, anon, authenticated;
revoke execute on function public.update_business_language_settings(uuid, text, text[], text, text, text, text, text, boolean, text) from public, anon;
revoke execute on function public.set_ui_locale(text) from public, anon;
grant execute on function public.update_business_language_settings(uuid, text, text[], text, text, text, text, text, boolean, text) to authenticated;
grant execute on function public.set_ui_locale(text) to authenticated;
