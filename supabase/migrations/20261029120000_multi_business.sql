-- WazaBolt — several businesses under one login.
--
-- An owner can add another business from the dashboard. It is a separate
-- business in every way (its own data, team, plan, WhatsApp number), set up
-- the same way as at sign-up. One Free business per owner: when the owner
-- already has a business on the Free plan, the new one needs a paid plan
-- (needs_paid_plan) and the app keeps it on Billing until WazaBolt approves
-- the plan, as for any plan change.
--
-- Additive: one column and two functions. Nothing is removed or rewritten.

alter table public.businesses add column needs_paid_plan boolean not null default false;
comment on column public.businesses.needs_paid_plan is
  'Added while its owner already had a Free business: it needs a paid plan before it can be used (one Free business per owner).';

/* Does this user own a business on the Free plan (other than p_except)? */
create function public._owns_free_business(p_user uuid, p_except uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members m
    join public.subscriptions s on s.business_id = m.business_id
    join public.businesses b on b.id = m.business_id
    where m.user_id = p_user and m.role = 'owner' and s.plan_id = 'free'
      and b.id is distinct from p_except and not b.needs_paid_plan
  );
$$;
revoke execute on function public._owns_free_business(uuid, uuid) from public, anon, authenticated;

/*
 * The signed-in user adds a business they own. Returns its id.
 * p_plan: the plan asked for when the business needs a paid plan (a plan
 * change request is filed for WazaBolt to approve once paid, monthly or
 * yearly, with a phone number to arrange payment); ignored for a first Free
 * business.
 */
create function public.create_business(
  p_name text, p_industry text default null, p_plan text default null,
  p_interval text default 'month', p_contact_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := left(btrim(coalesce(p_name, '')), 120);
  v_from public.businesses%rowtype;
  v_locale text;
  v_needs_paid boolean;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_interval not in ('month', 'year') then
    raise exception 'unknown billing interval' using errcode = '22023';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'business name required' using errcode = '22023';
  end if;
  if p_industry is not null and p_industry not in ('retail', 'restaurant', 'hotel', 'fashion', 'beauty', 'real_estate', 'school', 'services', 'other') then
    raise exception 'unknown business type' using errcode = '22023';
  end if;
  -- A sensible cap: nobody runs more than 20 businesses from one login.
  if (select count(*) from public.business_members where user_id = v_user and role = 'owner') >= 20 then
    raise exception 'too many businesses' using errcode = 'WB450';
  end if;

  v_needs_paid := public._owns_free_business(v_user);
  if v_needs_paid and (p_plan is null or p_plan = 'free' or not exists (select 1 from public.plans where id = p_plan and active and monthly_price > 0)) then
    raise exception 'one free business per owner: choose a paid plan' using errcode = 'WB451';
  end if;

  -- Country, currency, time zone and language from the owner's latest business (as at sign-up otherwise).
  select b.* into v_from
  from public.businesses b join public.business_members m on m.business_id = b.id
  where m.user_id = v_user and m.role = 'owner'
  order by b.created_at desc limit 1;
  select ui_locale into v_locale from public.users where id = v_user;

  insert into public.businesses (name, industry, country_code, currency, timezone, default_language, needs_paid_plan)
  values (
    v_name, p_industry,
    coalesce(v_from.country_code, 'CM'), coalesce(v_from.currency, 'XAF'), coalesce(v_from.timezone, 'Africa/Douala'),
    coalesce(v_from.default_language, nullif(v_locale, ''), 'en'),
    v_needs_paid
  )
  returning id into v_id;

  insert into public.business_languages (business_id, language_code, sort_order)
  select v_id, language_code, sort_order from public.business_languages where business_id = v_from.id
  on conflict do nothing;
  insert into public.business_languages (business_id, language_code, sort_order)
  select v_id, default_language, 0 from public.businesses where id = v_id
  on conflict do nothing;

  insert into public.ai_settings (business_id) values (v_id);
  insert into public.business_members (business_id, user_id, role) values (v_id, v_user, 'owner');
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_id, v_user, 'business.created', 'business', v_id::text, jsonb_build_object('added_by_owner', true, 'needs_paid_plan', v_needs_paid));

  if v_needs_paid then
    insert into public.plan_change_requests (business_id, from_plan_id, to_plan_id, contact_phone, requested_by, billing_interval, note)
    values (v_id, 'free', p_plan, nullif(left(btrim(coalesce(p_contact_phone, '')), 40), ''), v_user, p_interval,
            'New business added by an owner who already has a Free business.');
  end if;
  return v_id;
end;
$$;
revoke execute on function public.create_business(text, text, text, text, text) from public, anon;
grant execute on function public.create_business(text, text, text, text, text) to authenticated;
