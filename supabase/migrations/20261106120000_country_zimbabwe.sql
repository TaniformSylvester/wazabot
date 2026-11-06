-- WazaBolt: Zimbabwe, the second country.
--
-- A country pack sets a new business's currency, time zone and languages
-- (handle_new_auth_user already reads it from the sign-up form). Zimbabwe:
-- US dollars, Africa/Harare, English.
--
-- The owner (or an admin) can change the business's country in Settings, but
-- only before anything with an amount is recorded (sales, orders, invoices,
-- receipts, expenses): changing the currency afterwards would mislabel that
-- history (WB470). Additive: one row of data, one function.

insert into public.country_packs (country_code, english_name, currency, timezone, default_language, status)
values ('ZW', 'Zimbabwe', 'USD', 'Africa/Harare', 'en', 'active')
on conflict (country_code) do nothing;

insert into public.country_pack_languages (country_code, language_code, sort_order) values ('ZW', 'en', 1)
on conflict do nothing;

/* The owner or an admin sets the business's country: currency, time zone and the country's languages. */
create function public.set_business_country(p_business_id uuid, p_country text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pack public.country_packs;
  v_old public.businesses;
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_pack from public.country_packs where country_code = upper(p_country) and status = 'active';
  if not found then
    raise exception 'unknown country' using errcode = '22023';
  end if;
  select * into v_old from public.businesses where id = p_business_id for update;
  if v_old.country_code = v_pack.country_code then
    return;
  end if;
  if v_old.currency <> v_pack.currency and (
       exists (select 1 from public.orders where business_id = p_business_id)
    or exists (select 1 from public.documents where business_id = p_business_id)
    or exists (select 1 from public.expenses where business_id = p_business_id)
  ) then
    raise exception 'the currency can''t change once amounts are recorded' using errcode = 'WB470';
  end if;
  update public.businesses
  set country_code = v_pack.country_code, currency = v_pack.currency, timezone = v_pack.timezone, updated_at = now()
  where id = p_business_id;
  -- The country's languages are added; the ones the business already uses stay.
  insert into public.business_languages (business_id, language_code, sort_order)
  select p_business_id, l.language_code, l.sort_order from public.country_pack_languages l where l.country_code = v_pack.country_code
  on conflict do nothing;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, (select auth.uid()), 'business.country_changed', 'business', p_business_id::text,
          jsonb_build_object('from', v_old.country_code, 'to', v_pack.country_code, 'currency', v_pack.currency, 'timezone', v_pack.timezone));
end;
$$;
revoke execute on function public.set_business_country(uuid, text) from public, anon;
grant execute on function public.set_business_country(uuid, text) to authenticated;
