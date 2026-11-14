/*
 * Sign-up, then a one-screen workspace setup.
 *
 *  - The sign-up form creates the account only (metadata setup = "later"):
 *    the sign-up trigger makes the profile and no business.
 *  - setup_workspace(name, business type, country) creates the signed-in
 *    user's first business like a sign-up did: the country pack sets the
 *    currency, time zone and languages; the owner's 14-day trial starts.
 *    Calling it again (a double click, a second tab) returns the business
 *    already set up instead of making another. Further businesses keep going
 *    through create_business (a paid plan after the one trial per owner).
 *
 * Non-destructive: one function added, the sign-up trigger function replaced
 * (older sign-ups, with a business name, still get their business at once).
 */

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
  v_invite_token text := new.raw_user_meta_data ->> 'invite_token';
  v_inv public.business_invitations%rowtype;
  v_pack public.country_packs%rowtype;
  v_default_language text;
begin
  if not exists (select 1 from public.languages where code = v_locale and ui_supported) then
    v_locale := 'en';
  end if;

  -- Invited: join only once the email address is confirmed (see
  -- join_invited_on_confirm). Until then: a profile, no business of their own.
  if v_invite_token is not null and exists (
    select 1 from public.business_invitations
    where token_hash = public.token_sha256(v_invite_token)
      and email = lower(new.email) and accepted_at is null and revoked_at is null and expires_at >= now()
  ) then
    insert into public.users (id, full_name, ui_locale) values (new.id, v_full_name, v_locale);
    if new.email_confirmed_at is not null then
      begin
        perform public._join_invited(new.id, lower(new.email), v_invite_token);
      exception when others then
        raise warning 'invited sign-up could not join yet: %', sqlerrm;
      end;
    end if;
    return new;
  end if;

  -- The sign-up form (since November 2026) creates the account only: the
  -- business is named, given its currency and type on the setup screen once
  -- the email is confirmed (setup_workspace). A profile, nothing more.
  if new.raw_user_meta_data ->> 'setup' = 'later' then
    insert into public.users (id, full_name, ui_locale) values (new.id, v_full_name, v_locale);
    return new;
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

create or replace function public.setup_workspace(p_name text, p_industry text, p_country text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := left(btrim(coalesce(p_name, '')), 120);
  v_pack public.country_packs%rowtype;
  v_locale text;
  v_default_language text;
  v_existing uuid;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'business name required' using errcode = '22023';
  end if;
  if p_industry is null or p_industry not in ('retail', 'restaurant', 'school', 'other') then
    raise exception 'unknown business type' using errcode = '22023';
  end if;
  select * into v_pack from public.country_packs where country_code = upper(coalesce(p_country, '')) and status = 'active';
  if not found then
    raise exception 'unknown country' using errcode = '22023';
  end if;

  -- One setup per person: a second call returns the business already set up.
  perform pg_advisory_xact_lock(hashtextextended('setup_workspace:' || v_user::text, 0));
  select m.business_id into v_existing from public.business_members m
  where m.user_id = v_user and m.role = 'owner' order by m.created_at limit 1;
  if v_existing is not null then
    return v_existing;
  end if;
  -- An owner's one free trial is used once (a person who owned a business before adds one through create_business).
  if public._owner_used_trial(v_user) then
    raise exception 'one trial per owner: choose a plan' using errcode = 'WB451';
  end if;

  select ui_locale into v_locale from public.users where id = v_user;
  v_default_language := case
    when exists (select 1 from public.country_pack_languages where country_code = v_pack.country_code and language_code = v_locale) then v_locale
    else v_pack.default_language
  end;

  insert into public.businesses (name, industry, country_code, currency, timezone, default_language)
  values (v_name, p_industry, v_pack.country_code, v_pack.currency, v_pack.timezone, v_default_language)
  returning id into v_id;

  insert into public.business_languages (business_id, language_code, sort_order)
  select v_id, language_code, sort_order from public.country_pack_languages where country_code = v_pack.country_code
  on conflict do nothing;
  insert into public.business_languages (business_id, language_code, sort_order)
  values (v_id, v_default_language, 0)
  on conflict do nothing;

  insert into public.ai_settings (business_id) values (v_id);
  insert into public.business_members (business_id, user_id, role) values (v_id, v_user, 'owner');
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_id, v_user, 'business.created', 'business', v_id::text, jsonb_build_object('setup', true));
  return v_id;
end;
$$;
revoke execute on function public.setup_workspace(text, text, text) from public, anon;
grant execute on function public.setup_workspace(text, text, text) to authenticated;
