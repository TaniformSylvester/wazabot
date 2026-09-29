-- WazaBolt multilingual foundation tests.
-- Run against a database with the migrations applied (never production):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/multilingual.sql
-- Everything runs in a transaction that is rolled back.

begin;

-- Sign-up runs as the Auth service role (supabase_auth_admin), not a superuser:
-- the deferred default-language check must still pass at commit time.
set local role supabase_auth_admin;
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-b000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'auth-role@test.local', '{"full_name":"Chi","business_name":"Chi Store","locale":"en"}', now(), now());
set constraints all immediate;
set constraints all deferred;
reset role;
do $$ begin raise notice 'PASS sign-up as the Auth service role (deferred checks run at commit)'; end $$;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-b000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'fr-owner@test.local', '{"full_name":"Awa","business_name":"Boutique Awa","locale":"fr"}', now(), now()),
  ('00000000-0000-4000-b000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'en-owner@test.local', '{"full_name":"Ben","business_name":"Ben Shop","locale":"xx","country_code":"ZZ"}', now(), now());

do $$
declare
  b record;
  langs text[];
begin
  select u.ui_locale, bz.default_language, bz.country_code, bz.currency, bz.id into b
  from public.users u
  join public.business_members m on m.user_id = u.id
  join public.businesses bz on bz.id = m.business_id
  where u.id = '00000000-0000-4000-b000-00000000000a';
  if b.ui_locale <> 'fr' or b.default_language <> 'fr' then
    raise exception 'FAIL signup: French sign-up should set ui_locale and default language to fr (got %, %)', b.ui_locale, b.default_language;
  end if;
  if b.country_code <> 'CM' or b.currency <> 'XAF' then raise exception 'FAIL signup: Cameroon pack defaults not applied'; end if;
  select array_agg(language_code order by language_code) into langs from public.business_languages where business_id = b.id;
  if langs <> array['en', 'fr', 'wes'] then raise exception 'FAIL signup: expected en, fr, wes enabled, got %', langs; end if;
  if not exists (select 1 from public.ai_settings where business_id = b.id and language_mode = 'auto') then
    raise exception 'FAIL signup: default ai_settings row missing';
  end if;

  select u.ui_locale, bz.default_language, bz.country_code into b
  from public.users u
  join public.business_members m on m.user_id = u.id
  join public.businesses bz on bz.id = m.business_id
  where u.id = '00000000-0000-4000-b000-00000000000b';
  if b.ui_locale <> 'en' or b.default_language <> 'en' or b.country_code <> 'CM' then
    raise exception 'FAIL signup: unknown locale/country should fall back to en / CM';
  end if;
  raise notice 'PASS sign-up applies locale, country pack languages and AI defaults';
end $$;

-- The default language can never be disabled, even by the service role.
do $$
declare b_id uuid;
begin
  select business_id into b_id from public.business_members where user_id = '00000000-0000-4000-b000-00000000000a';
  begin
    delete from public.business_languages where business_id = b_id and language_code = 'fr';
    set constraints all immediate;
    raise exception 'FAIL: removed the default language';
  exception when check_violation then null;
  end;
  raise notice 'PASS default language must stay enabled';
end $$;
set constraints all deferred;

-- Customer / conversation / message rows for business A (as the webhook would, via service role).
insert into public.customers (id, business_id, whatsapp_id, display_name, preferred_language, preferred_language_source)
select '00000000-0000-4000-c000-00000000000a', business_id, '237670000001', 'Client A', 'wes', 'explicit_request'
from public.business_members where user_id = '00000000-0000-4000-b000-00000000000a';
insert into public.conversations (id, business_id, customer_id, language)
select '00000000-0000-4000-d000-00000000000a', business_id, '00000000-0000-4000-c000-00000000000a', 'wes'
from public.business_members where user_id = '00000000-0000-4000-b000-00000000000a';
insert into public.messages (business_id, conversation_id, direction, sender, body, language, language_confidence, secondary_language, is_mixed)
select business_id, '00000000-0000-4000-d000-00000000000a', 'inbound', 'customer', 'Abeg wuna get la robe rouge?', 'wes', 0.8, 'fr', true
from public.business_members where user_id = '00000000-0000-4000-b000-00000000000a';

do $$
declare b_other uuid;
begin
  -- A conversation can't point at another business's customer.
  select business_id into b_other from public.business_members where user_id = '00000000-0000-4000-b000-00000000000b';
  begin
    insert into public.conversations (business_id, customer_id) values (b_other, '00000000-0000-4000-c000-00000000000a');
    raise exception 'FAIL: cross-business conversation accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.customers (business_id, whatsapp_id, preferred_language) values (b_other, '237670000002', 'fr');
    raise exception 'FAIL: preference without a source accepted';
  exception when check_violation then null;
  end;
  raise notice 'PASS composite keys and preference constraints hold';
end $$;

-- Act as owner A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-00000000000a","role":"authenticated"}', true);

do $$
declare n int; b_id uuid;
begin
  select count(*) into n from public.languages;
  if n < 3 then raise exception 'FAIL: languages not readable'; end if;

  select count(*) into n from public.customers;
  if n <> 1 then raise exception 'FAIL isolation: A sees % customers (expected 1)', n; end if;
  select count(*) into n from public.messages;
  if n <> 1 then raise exception 'FAIL isolation: A sees % messages (expected 1)', n; end if;
  select count(*) into n from public.business_languages;
  if n <> 3 then raise exception 'FAIL isolation: A sees % business languages (expected 3)', n; end if;

  select business_id into b_id from public.business_members; -- RLS: only A's membership is visible

  -- Owner updates languages + style atomically.
  perform public.update_business_language_settings(b_id, 'en', array['en', 'fr'], 'fixed', 'professional', 'formal', 'none', 'medium', true, '  Say "Ma" or "Sir".  ');
  select count(*) into n from public.business_languages where business_id = b_id;
  if n <> 2 then raise exception 'FAIL: expected 2 languages after update, got %', n; end if;
  if not exists (select 1 from public.ai_settings where business_id = b_id and language_mode = 'fixed' and tone = 'professional'
                 and style_notes = 'Say "Ma" or "Sir".') then
    raise exception 'FAIL: ai_settings not updated';
  end if;
  if (select default_language from public.businesses where id = b_id) <> 'en' then raise exception 'FAIL: default language not updated'; end if;

  -- Validation.
  begin
    perform public.update_business_language_settings(b_id, 'wes', array['en', 'fr'], 'auto', 'friendly', 'neutral', 'light', 'short', false, '');
    raise exception 'FAIL: default outside enabled languages accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.update_business_language_settings(b_id, 'en', array['en', 'xx'], 'auto', 'friendly', 'neutral', 'light', 'short', false, '');
    raise exception 'FAIL: unknown language accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.update_business_language_settings(b_id, 'en', array['en'], 'auto', 'rude', 'neutral', 'light', 'short', false, '');
    raise exception 'FAIL: invalid tone accepted';
  exception when check_violation then null;
  end;

  if exists (select 1 from public.businesses where id <> b_id) then raise exception 'FAIL isolation: A can see another business'; end if;

  -- Direct writes to settings tables are refused.
  begin
    insert into public.business_languages (business_id, language_code) values (b_id, 'wes');
    raise exception 'FAIL: direct insert into business_languages';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.ai_settings set tone = 'warm';
    raise exception 'FAIL: direct update of ai_settings';
  exception when insufficient_privilege then null;
  end;

  -- Team members can set a customer's language preference.
  update public.customers set preferred_language = 'fr', preferred_language_source = 'set_by_business', preferred_language_updated_at = now();
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: could not set customer language preference'; end if;
  begin
    update public.customers set whatsapp_id = '237699999999';
    raise exception 'FAIL: whatsapp_id should not be user-editable';
  exception when insufficient_privilege then null;
  end;

  -- Dashboard language.
  perform public.set_ui_locale('en');
  if (select ui_locale from public.users) <> 'en' then raise exception 'FAIL: set_ui_locale'; end if;
  begin
    perform public.set_ui_locale('wes');
    raise exception 'FAIL: non-UI locale accepted';
  exception when invalid_parameter_value then null;
  end;

  raise notice 'PASS owner manages languages and style; isolation and validation hold';
end $$;

-- Owner B cannot change A's settings through the function.
reset role;
select set_config('test.business_a', (select business_id::text from public.business_members
  where user_id = '00000000-0000-4000-b000-00000000000a'), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-00000000000b","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.update_business_language_settings(current_setting('test.business_a')::uuid, 'en', array['en'], 'auto', 'friendly', 'neutral', 'light', 'short', false, '');
    raise exception 'FAIL: owner B changed business A''s settings';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.update_business_language_settings(gen_random_uuid(), 'en', array['en'], 'auto', 'friendly', 'neutral', 'light', 'short', false, '');
    raise exception 'FAIL: settings update for an unknown business';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.customers) then raise exception 'FAIL isolation: B sees A''s customers'; end if;
  raise notice 'PASS other owners cannot change or read the settings';
end $$;

-- Anonymous visitors can read language reference data only.
reset role;
set local role anon;
do $$
begin
  perform 1 from public.languages;
  begin
    perform 1 from public.ai_settings;
    raise exception 'FAIL: anon can read ai_settings';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS anon reads reference data only';
end $$;

reset role;
rollback;
