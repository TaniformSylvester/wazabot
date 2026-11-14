/*
 * Team invitations, hardened (table business_invitations: id, business_id,
 * email, role, token_hash, expires_at, accepted_at — the workspace invites).
 *
 *  - Only the owner creates, renews or revokes invitations. Roles: manager
 *    ("admin") or staff ("agent", "viewer", "teacher", "kitchen"); never owner
 *    (the table's check constraint already refuses it).
 *  - One live invitation per email: a second one is refused (WB480) — renew
 *    the pending one for a fresh link instead. An expired one no longer
 *    blocks a new invitation (it is closed first).
 *  - Joining needs a confirmed email address (WB481), whether accepting
 *    while signed in or signing up from the link: an invited sign-up joins
 *    when its email is confirmed, not before.
 *  - Accepting locks the invitation, checks expiry and the email, creates the
 *    member with the invited role and closes the invitation, in one
 *    transaction. A plan seat limit never breaks sign-up or confirmation: the
 *    invitation stays pending and the person can accept from the link later.
 *
 * Non-destructive: functions replaced, one trigger added; no data changed.
 */

-- Invite someone (owner only).
create or replace function public.create_invitation(p_business_id uuid, p_email text, p_role text, p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_id uuid;
begin
  if not public.has_min_role(p_business_id, 'owner') then
    raise exception 'only the owner can invite' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'agent', 'viewer', 'teacher', 'kitchen') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.business_members m join auth.users u on u.id = m.user_id
    where m.business_id = p_business_id and lower(u.email) = v_email
  ) then
    raise exception 'already a member' using errcode = '23505';
  end if;
  -- Serialise invitations to the same email in this business.
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':' || v_email, 0));
  if exists (
    select 1 from public.business_invitations
    where business_id = p_business_id and email = v_email and accepted_at is null and revoked_at is null and expires_at >= now()
  ) then
    raise exception 'already invited' using errcode = 'WB480';
  end if;
  -- An expired invitation doesn't block a new one.
  update public.business_invitations set revoked_at = now()
  where business_id = p_business_id and email = v_email and accepted_at is null and revoked_at is null;

  insert into public.business_invitations (business_id, email, role, token_hash, invited_by)
  values (p_business_id, v_email, p_role, p_token_hash, (select auth.uid()))
  returning id into v_id;

  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, (select auth.uid()), 'member.invited', 'invitation', v_id::text, jsonb_build_object('role', p_role));
  return v_id;
end;
$$;

-- A fresh link (and 7 more days) for a pending invitation; the old link stops working. Owner only.
create or replace function public.renew_invitation(p_invitation_id uuid, p_token_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.business_invitations%rowtype;
begin
  select * into v_inv from public.business_invitations where id = p_invitation_id for update;
  if not found or not public.has_min_role(v_inv.business_id, 'owner') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_inv.accepted_at is not null or v_inv.revoked_at is not null then
    raise exception 'invitation is no longer pending' using errcode = '22023';
  end if;
  update public.business_invitations
  set token_hash = p_token_hash, expires_at = now() + interval '7 days'
  where id = p_invitation_id;
end;
$$;

-- Cancel a pending invitation; its link stops working. Owner only.
create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
begin
  select business_id into v_business from public.business_invitations where id = p_invitation_id;
  if v_business is null or not public.has_min_role(v_business, 'owner') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.business_invitations set revoked_at = now()
  where id = p_invitation_id and accepted_at is null and revoked_at is null;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id)
  values (v_business, (select auth.uid()), 'member.invite_revoked', 'invitation', p_invitation_id::text);
end;
$$;

/*
 * The join itself (internal): the invitation for this token and email, still
 * pending and not expired, locked; the member created with the invited role;
 * the invitation closed. Returns the business, or null if not valid.
 */
create or replace function public._join_invited(p_user_id uuid, p_email text, p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.business_invitations%rowtype;
begin
  select * into v_inv from public.business_invitations
  where token_hash = public.token_sha256(p_token) and email = p_email
    and accepted_at is null and revoked_at is null and expires_at >= now()
  for update;
  if not found then
    return null;
  end if;
  -- Already in the team (e.g. joined another way): their role is left as it is.
  insert into public.business_members (business_id, user_id, role)
  values (v_inv.business_id, p_user_id, v_inv.role::public.business_role)
  on conflict do nothing;
  update public.business_invitations set accepted_at = now(), accepted_by = p_user_id where id = v_inv.id;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_inv.business_id, p_user_id, 'member.joined', 'member', p_user_id::text, jsonb_build_object('role', v_inv.role));
  return v_inv.business_id;
end;
$$;
revoke execute on function public._join_invited(uuid, text, text) from public, anon, authenticated;

-- Joins the business as the signed-in user, whose confirmed email must be the invited one.
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.business_invitations%rowtype;
  v_email text;
  v_confirmed timestamptz;
  v_uid uuid := (select auth.uid());
  v_business uuid;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into v_inv from public.business_invitations where token_hash = public.token_sha256(p_token) for update;
  if not found or v_inv.revoked_at is not null or v_inv.accepted_at is not null or v_inv.expires_at < now() then
    raise exception 'invitation not valid' using errcode = '22023';
  end if;
  select lower(email), email_confirmed_at into v_email, v_confirmed from auth.users where id = v_uid;
  if v_email is distinct from v_inv.email then
    raise exception 'invitation is for another email' using errcode = '42501';
  end if;
  if v_confirmed is null then
    raise exception 'email not confirmed' using errcode = 'WB481';
  end if;
  v_business := public._join_invited(v_uid, v_email, p_token);
  if v_business is null then
    raise exception 'invitation not valid' using errcode = '22023';
  end if;
  return v_business;
end;
$$;

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

/*
 * An invited sign-up joins when its email is confirmed. A seat limit (or any
 * other refusal) never blocks the confirmation: the invitation stays pending
 * and can be accepted from the link once a seat is free.
 */
create or replace function public.join_invited_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := new.raw_user_meta_data ->> 'invite_token';
begin
  if v_token is null or old.email_confirmed_at is not null or new.email_confirmed_at is null then
    return new;
  end if;
  begin
    perform public._join_invited(new.id, lower(new.email), v_token);
  exception when others then
    raise warning 'invited sign-up could not join yet: %', sqlerrm;
  end;
  return new;
end;
$$;
revoke execute on function public.join_invited_on_confirm() from public, anon, authenticated;

drop trigger if exists on_auth_user_confirmed_join on auth.users;
create trigger on_auth_user_confirmed_join after update of email_confirmed_at on auth.users
  for each row execute function public.join_invited_on_confirm();
