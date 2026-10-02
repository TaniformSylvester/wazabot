-- WazaBolt — Stage 4: business operations
--
--   stock          orders take stock automatically (product, or the variant when the
--                  variant's stock is tracked); cancelling or deleting an order puts it
--                  back; an order that would sell more than is in stock is refused.
--                  products.low_stock_threshold drives the dashboard's stock alerts.
--   usage          ai_usage_status(): the plan's monthly AI conversation allowance and
--                  how much of it is used (one definition for the dashboard and the AI).
--   team           business_invitations (link shared by the owner/admin, token stored
--                  hashed), accept on sign-up or when logged in; change roles, remove
--                  members, leave a business.
--   plan changes   plan_change_requests: owners/admins ask for a plan; the WazaBolt
--                  operator approves it (approve_plan_change, service role only) once
--                  paid. No payment is processed here.

-- ---------------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------------
alter table public.products
  add column low_stock_threshold integer not null default 5 check (low_stock_threshold between 0 and 100000),
  -- In stock but at or below the threshold (filterable from the dashboard).
  add column stock_low boolean generated always as
    (stock_quantity is not null and stock_quantity > 0 and stock_quantity <= low_stock_threshold) stored;

alter table public.order_items
  add column variant_id uuid references public.product_variants (id) on delete set null;

alter table public.orders
  -- Orders created from now on manage stock; older orders never took any, so never give any back.
  add column stock_managed boolean not null default false,
  -- True while the order's items are taken out of stock.
  add column stock_applied boolean not null default false;

/*
 * Takes an order's items out of stock (p_direction = 1) or puts them back
 * (-1). Untracked stock (null) is left alone. Rows are locked in a fixed
 * order so two orders for the same products can't deadlock. Taking more than
 * is available raises SQLSTATE WB409 with the product name.
 */
create function public.apply_order_stock(p_order_id uuid, p_direction int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_tracked boolean;
  v_done int;
begin
  for r in
    select i.product_id, i.variant_id, sum(i.quantity)::int as qty, min(i.product_name) as name, min(i.variant) as variant
    from public.order_items i
    where i.order_id = p_order_id and i.product_id is not null
      -- A variant deleted since: its stock is gone with it (don't count it against the product).
      and not (i.variant_id is null and i.variant is not null)
    group by i.product_id, i.variant_id
    order by i.product_id, i.variant_id nulls first
  loop
    v_tracked := false;
    if r.variant_id is not null then
      select stock_quantity is not null into v_tracked from public.product_variants where id = r.variant_id for update;
      if coalesce(v_tracked, false) then
        update public.product_variants
        set stock_quantity = stock_quantity - p_direction * r.qty
        where id = r.variant_id and stock_quantity - p_direction * r.qty >= 0;
        get diagnostics v_done = row_count;
        if v_done = 0 and p_direction > 0 then
          raise exception 'insufficient stock: %', r.name || coalesce(' (' || r.variant || ')', '') using errcode = 'WB409';
        end if;
        continue;
      end if;
    end if;

    -- Not a tracked variant: the product's own stock (when tracked).
    update public.products
    set stock_quantity = stock_quantity - p_direction * r.qty
    where id = r.product_id and stock_quantity is not null and stock_quantity - p_direction * r.qty >= 0;
    get diagnostics v_done = row_count;
    if v_done = 0 and p_direction > 0 and exists (select 1 from public.products where id = r.product_id and stock_quantity is not null) then
      raise exception 'insufficient stock: %', r.name || coalesce(' (' || r.variant || ')', '') using errcode = 'WB409';
    end if;
  end loop;
end;
$$;
revoke execute on function public.apply_order_stock(uuid, int) from public, anon, authenticated;

-- Same as Stage 3, plus: items keep their variant id and the order takes stock.
create or replace function public.create_order(
  p_business_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_conversation_id uuid default null,
  p_delivery_fee numeric default 0,
  p_discount numeric default 0,
  p_delivery_address text default null,
  p_payment_method text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_seq bigint;
  v_currency char(3);
  v_subtotal numeric(14, 2) := 0;
  v_item jsonb;
  v_qty integer;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  v_name text;
  v_variant_label text;
  v_variant_id uuid;
  v_price numeric(14, 2);
begin
  if (select auth.role()) is distinct from 'service_role' and not public.has_min_role(p_business_id, 'agent') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'an order needs between 1 and 100 items' using errcode = '22023';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id and business_id = p_business_id) then
    raise exception 'unknown customer' using errcode = '22023';
  end if;
  if p_conversation_id is not null and not exists (
    select 1 from public.conversations where id = p_conversation_id and business_id = p_business_id and customer_id = p_customer_id
  ) then
    raise exception 'unknown conversation' using errcode = '22023';
  end if;
  if coalesce(p_delivery_fee, 0) < 0 or coalesce(p_discount, 0) < 0 then
    raise exception 'fees and discounts cannot be negative' using errcode = '22023';
  end if;

  select currency into v_currency from public.businesses where id = p_business_id;

  insert into public.business_counters (business_id) values (p_business_id) on conflict do nothing;
  update public.business_counters set order_seq = order_seq + 1 where business_id = p_business_id returning order_seq into v_seq;

  -- Amounts are filled in once the items are known (the totals check must hold at every step).
  insert into public.orders (id, business_id, customer_id, conversation_id, order_number, currency,
                             delivery_address, payment_method, notes, created_by, stock_managed)
  values (v_order_id, p_business_id, p_customer_id, p_conversation_id, 'ORD-' || lpad(v_seq::text, 5, '0'), v_currency,
          nullif(btrim(p_delivery_address), ''), p_payment_method, nullif(btrim(p_notes), ''), (select auth.uid()), true);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item ->> 'quantity')::integer, 1);
    if v_qty < 1 then
      raise exception 'quantity must be at least 1' using errcode = '22023';
    end if;
    v_variant_label := null;
    v_variant_id := null;

    if v_item ? 'product_id' and nullif(v_item ->> 'product_id', '') is not null then
      select * into v_product from public.products
      where id = (v_item ->> 'product_id')::uuid and business_id = p_business_id;
      if not found then
        raise exception 'unknown product' using errcode = '22023';
      end if;
      v_name := v_product.name;
      v_price := v_product.price;
      if nullif(v_item ->> 'variant_id', '') is not null then
        select * into v_variant from public.product_variants
        where id = (v_item ->> 'variant_id')::uuid and product_id = v_product.id and business_id = p_business_id;
        if not found then
          raise exception 'unknown variant' using errcode = '22023';
        end if;
        v_price := greatest(v_price + v_variant.price_modifier, 0);
        v_variant_label := v_variant.name || ': ' || v_variant.value;
        v_variant_id := v_variant.id;
      end if;
    else
      v_name := nullif(btrim(v_item ->> 'name'), '');
      v_price := (v_item ->> 'unit_price')::numeric;
      if v_name is null or v_price is null or v_price < 0 then
        raise exception 'custom items need a name and a price' using errcode = '22023';
      end if;
      v_product.id := null;
    end if;

    insert into public.order_items (business_id, order_id, product_id, variant_id, product_name, variant, quantity, unit_price, total)
    values (p_business_id, v_order_id, v_product.id, v_variant_id, v_name, v_variant_label, v_qty, v_price, v_price * v_qty);
    v_subtotal := v_subtotal + v_price * v_qty;
    v_product.id := null;
  end loop;

  if coalesce(p_discount, 0) > v_subtotal + coalesce(p_delivery_fee, 0) then
    raise exception 'discount is larger than the order' using errcode = '22023';
  end if;

  perform public.apply_order_stock(v_order_id, 1);

  update public.orders
  set subtotal = v_subtotal,
      delivery_fee = coalesce(p_delivery_fee, 0),
      discount = coalesce(p_discount, 0),
      total = v_subtotal + coalesce(p_delivery_fee, 0) - coalesce(p_discount, 0),
      stock_applied = true
  where id = v_order_id;

  return v_order_id;
end;
$$;

-- Cancelling gives the stock back; un-cancelling takes it again (refused if it's gone meanwhile).
create function public.orders_stock_on_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.stock_managed then
    return new;
  end if;
  if new.status = 'cancelled' and old.stock_applied then
    perform public.apply_order_stock(new.id, -1);
    new.stock_applied := false;
  elsif new.status <> 'cancelled' and not old.stock_applied then
    perform public.apply_order_stock(new.id, 1);
    new.stock_applied := true;
  end if;
  return new;
end;
$$;
create trigger orders_stock_on_status before update of status on public.orders
  for each row when (old.status is distinct from new.status)
  execute function public.orders_stock_on_status();

-- Deleting an order that still holds stock gives it back.
create function public.orders_stock_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.stock_applied then
    perform public.apply_order_stock(old.id, -1);
  end if;
  return old;
end;
$$;
create trigger orders_stock_on_delete before delete on public.orders
  for each row execute function public.orders_stock_on_delete();

-- ---------------------------------------------------------------------------
-- AI usage against the plan
-- ---------------------------------------------------------------------------
create index messages_ai_generated_idx on public.messages (business_id, created_at) where ai_generated;

/*
 * The plan's monthly allowance of AI conversations and how many conversations
 * the assistant has answered in since the start of the month (UTC). One
 * definition for the dashboard, the billing page and the AI pipeline.
 */
create function public.ai_usage_status(p_business_id uuid)
returns table (plan_id text, plan_name text, conversation_limit integer, conversations_used integer, period_start timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
begin
  if (select auth.role()) is distinct from 'service_role' and not public.is_business_member(p_business_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select p.id, p.name, p.ai_conversations_per_month,
         (select count(distinct m.conversation_id)::int from public.messages m
          where m.business_id = p_business_id and m.ai_generated and m.created_at >= v_start),
         v_start
  from public.subscriptions s join public.plans p on p.id = s.plan_id
  where s.business_id = p_business_id;
end;
$$;
revoke execute on function public.ai_usage_status(uuid) from public, anon;
grant execute on function public.ai_usage_status(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Team: invitations, roles, leaving
-- ---------------------------------------------------------------------------
create table public.business_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 320),
  role text not null check (role in ('admin', 'agent', 'viewer')),
  -- sha256 of the secret in the invitation link; the link itself is never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz
);
create unique index business_invitations_pending_key on public.business_invitations (business_id, email)
  where accepted_at is null and revoked_at is null;

alter table public.business_invitations enable row level security;
create policy "business_invitations: admins read" on public.business_invitations
  for select to authenticated using (public.has_min_role(business_id, 'admin'));
revoke all on public.business_invitations from anon, authenticated;
grant select (id, business_id, email, role, invited_by, created_at, expires_at, accepted_at, revoked_at)
  on public.business_invitations to authenticated;
grant all on public.business_invitations to service_role;

create function public.token_sha256(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

/*
 * Invites someone by email (owners/admins; only the owner can invite an
 * admin). The caller generates the link secret and passes its sha256. An
 * earlier pending invitation for the same email is replaced.
 */
create function public.create_invitation(p_business_id uuid, p_email text, p_role text, p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_id uuid;
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'agent', 'viewer') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if p_role = 'admin' and not public.has_min_role(p_business_id, 'owner') then
    raise exception 'only the owner can invite admins' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.business_members m join auth.users u on u.id = m.user_id
    where m.business_id = p_business_id and lower(u.email) = v_email
  ) then
    raise exception 'already a member' using errcode = '23505';
  end if;

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

-- A fresh link (and 7 more days) for a pending invitation; the old link stops working.
create function public.renew_invitation(p_invitation_id uuid, p_token_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.business_invitations%rowtype;
begin
  select * into v_inv from public.business_invitations where id = p_invitation_id;
  if not found or not public.has_min_role(v_inv.business_id, 'admin')
     or (v_inv.role = 'admin' and not public.has_min_role(v_inv.business_id, 'owner')) then
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

create function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
begin
  select business_id into v_business from public.business_invitations where id = p_invitation_id;
  if v_business is null or not public.has_min_role(v_business, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.business_invitations set revoked_at = now()
  where id = p_invitation_id and accepted_at is null and revoked_at is null;
end;
$$;

/*
 * What an invitation link shows before signing in: business, role, invited
 * email and state. Only someone holding the link can compute its hash.
 */
create function public.get_invitation(p_token text)
returns table (business_name text, role text, email text, state text, inviter_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.name, i.role, i.email,
         case when i.revoked_at is not null then 'revoked'
              when i.accepted_at is not null then 'accepted'
              when i.expires_at < now() then 'expired'
              else 'pending' end,
         nullif(u.full_name, '')
  from public.business_invitations i
  join public.businesses b on b.id = i.business_id
  left join public.users u on u.id = i.invited_by
  where i.token_hash = public.token_sha256(p_token);
$$;

-- Joins the business as the signed-in user, whose email must be the invited one.
create function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.business_invitations%rowtype;
  v_email text;
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into v_inv from public.business_invitations where token_hash = public.token_sha256(p_token) for update;
  if not found or v_inv.revoked_at is not null or v_inv.accepted_at is not null or v_inv.expires_at < now() then
    raise exception 'invitation not valid' using errcode = '22023';
  end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is distinct from v_inv.email then
    raise exception 'invitation is for another email' using errcode = '42501';
  end if;

  insert into public.business_members (business_id, user_id, role)
  values (v_inv.business_id, v_uid, v_inv.role::public.business_role)
  on conflict do nothing;
  update public.business_invitations set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_inv.business_id, v_uid, 'member.joined', 'member', v_uid::text, jsonb_build_object('role', v_inv.role));
  return v_inv.business_id;
end;
$$;

/*
 * Changes a teammate's role. Admins manage agents and viewers; only the owner
 * makes or unmakes admins. The owner's role never changes here, nor your own.
 */
create function public.update_member_role(p_business_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
begin
  if p_role not in ('admin', 'agent', 'viewer') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  select role::text into v_current from public.business_members where business_id = p_business_id and user_id = p_user_id;
  if v_current is null then
    raise exception 'not a member' using errcode = '22023';
  end if;
  if not public.has_min_role(p_business_id, 'admin') or p_user_id = (select auth.uid()) or v_current = 'owner'
     or ((v_current = 'admin' or p_role = 'admin') and not public.has_min_role(p_business_id, 'owner')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.business_members set role = p_role::public.business_role where business_id = p_business_id and user_id = p_user_id;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, (select auth.uid()), 'member.role_changed', 'member', p_user_id::text, jsonb_build_object('from', v_current, 'to', p_role));
end;
$$;

/*
 * Removes a teammate (same rules as roles), or — with your own id — leaves
 * the business. The owner can't be removed and can't leave. Conversations
 * assigned to the person become unassigned.
 */
create function public.remove_member(p_business_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
  v_self boolean := p_user_id = (select auth.uid());
begin
  select role::text into v_current from public.business_members where business_id = p_business_id and user_id = p_user_id;
  if v_current is null then
    raise exception 'not a member' using errcode = '22023';
  end if;
  if v_current = 'owner'
     or (not v_self and not public.has_min_role(p_business_id, 'admin'))
     or (not v_self and v_current = 'admin' and not public.has_min_role(p_business_id, 'owner')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.conversations set assigned_to = null where business_id = p_business_id and assigned_to = p_user_id;
  delete from public.business_members where business_id = p_business_id and user_id = p_user_id;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, (select auth.uid()), case when v_self then 'member.left' else 'member.removed' end, 'member', p_user_id::text,
          jsonb_build_object('role', v_current));
end;
$$;

revoke execute on function public.create_invitation(uuid, text, text, text), public.renew_invitation(uuid, text),
  public.revoke_invitation(uuid), public.accept_invitation(text), public.update_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.create_invitation(uuid, text, text, text), public.renew_invitation(uuid, text),
  public.revoke_invitation(uuid), public.accept_invitation(text), public.update_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid) to authenticated;
revoke execute on function public.get_invitation(text) from public;
grant execute on function public.get_invitation(text) to anon, authenticated;

/*
 * Sign-up. With a valid invitation (metadata invite_token, for the same
 * email) the new user joins that business instead of getting a business of
 * their own. Otherwise unchanged: profile, business, languages, owner.
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

  if v_invite_token is not null then
    select * into v_inv from public.business_invitations
    where token_hash = public.token_sha256(v_invite_token)
      and email = lower(new.email) and accepted_at is null and revoked_at is null and expires_at >= now()
    for update;
    if found then
      insert into public.users (id, full_name, ui_locale) values (new.id, v_full_name, v_locale);
      insert into public.business_members (business_id, user_id, role) values (v_inv.business_id, new.id, v_inv.role::public.business_role);
      update public.business_invitations set accepted_at = now(), accepted_by = new.id where id = v_inv.id;
      insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
      values (v_inv.business_id, new.id, 'member.joined', 'member', new.id::text, jsonb_build_object('role', v_inv.role));
      return new;
    end if;
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
-- Plan change requests (approved by the WazaBolt operator once paid)
-- ---------------------------------------------------------------------------
create table public.plan_change_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  from_plan_id text references public.plans (id),
  to_plan_id text not null references public.plans (id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  contact_phone text check (char_length(contact_phone) <= 40),
  note text check (char_length(note) <= 500),
  requested_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index plan_change_requests_pending_key on public.plan_change_requests (business_id) where status = 'pending';
create index plan_change_requests_status_idx on public.plan_change_requests (status, created_at);

alter table public.plan_change_requests enable row level security;
create policy "plan_change_requests: admins read" on public.plan_change_requests
  for select to authenticated using (public.has_min_role(business_id, 'admin'));
revoke all on public.plan_change_requests from anon, authenticated;
grant select on public.plan_change_requests to authenticated;
grant all on public.plan_change_requests to service_role;

-- Owners/admins ask for another plan; a pending request is replaced.
create function public.request_plan_change(p_business_id uuid, p_plan_id text, p_contact_phone text default null, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
  v_id uuid;
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.plans where id = p_plan_id and active) then
    raise exception 'unknown plan' using errcode = '22023';
  end if;
  select plan_id into v_current from public.subscriptions where business_id = p_business_id;
  if v_current = p_plan_id then
    raise exception 'already on this plan' using errcode = '22023';
  end if;
  update public.plan_change_requests set status = 'cancelled', decided_at = now()
  where business_id = p_business_id and status = 'pending';
  insert into public.plan_change_requests (business_id, from_plan_id, to_plan_id, contact_phone, note, requested_by)
  values (p_business_id, v_current, p_plan_id, nullif(btrim(p_contact_phone), ''), nullif(btrim(p_note), ''), (select auth.uid()))
  returning id into v_id;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, (select auth.uid()), 'plan.change_requested', 'plan_change_request', v_id::text,
          jsonb_build_object('from', v_current, 'to', p_plan_id));
  return v_id;
end;
$$;

create function public.cancel_plan_change(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
begin
  select business_id into v_business from public.plan_change_requests where id = p_request_id;
  if v_business is null or not public.has_min_role(v_business, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.plan_change_requests set status = 'cancelled', decided_at = now() where id = p_request_id and status = 'pending';
end;
$$;

/*
 * Operator only (SQL editor / service role): switch the business to the
 * requested plan, starting a new one-month period now — or reject it.
 *   select public.approve_plan_change('<request id>');
 *   select public.reject_plan_change('<request id>');
 */
create function public.approve_plan_change(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.plan_change_requests%rowtype;
begin
  select * into v_req from public.plan_change_requests where id = p_request_id and status = 'pending' for update;
  if not found then
    raise exception 'no pending request with this id' using errcode = '22023';
  end if;
  update public.subscriptions
  set plan_id = v_req.to_plan_id, status = 'active', current_period_start = now(), current_period_end = now() + interval '1 month'
  where business_id = v_req.business_id;
  update public.plan_change_requests set status = 'approved', decided_at = now() where id = p_request_id;
  insert into public.audit_logs (business_id, action, entity_type, entity_id, metadata)
  values (v_req.business_id, 'plan.changed', 'subscription', v_req.business_id::text,
          jsonb_build_object('from', v_req.from_plan_id, 'to', v_req.to_plan_id, 'request', p_request_id));
end;
$$;

create function public.reject_plan_change(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.plan_change_requests set status = 'rejected', decided_at = now() where id = p_request_id and status = 'pending';
  if not found then
    raise exception 'no pending request with this id' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.request_plan_change(uuid, text, text, text), public.cancel_plan_change(uuid) from public, anon;
grant execute on function public.request_plan_change(uuid, text, text, text), public.cancel_plan_change(uuid) to authenticated;
revoke execute on function public.approve_plan_change(uuid), public.reject_plan_change(uuid) from public, anon, authenticated;
grant execute on function public.approve_plan_change(uuid), public.reject_plan_change(uuid) to service_role;
