-- WazaBolt — Stage 1: SaaS foundation
--
-- Builds the business workspace on top of the earlier migrations:
--   roles        + viewer, has_min_role() for owner > admin > agent > viewer
--   businesses   profile, contact details, opening hours, onboarding progress, slug, status
--   users        email + avatar; team members can see each other's names
--   customers    name, email, city, notes, tags, first/last contact (written by agents+)
--   conversations status open|pending|resolved|archived, ai_enabled (human takeover),
--                human_requested, assigned_to, unread_count
--   messages     content / sender_type naming, AI metadata
--   products, product_variants, faqs, knowledge_documents
--   orders, order_items (price + name snapshots), create_order() with per-business numbering
--   ai_settings  enabled, greeting, fallback, after-hours, handover, sales mode
--   plans, subscriptions (configurable pricing, no payments), whatsapp_connections (state only)
--
-- Every business-owned row carries business_id; RLS limits every table to
-- members of that business, and writes to the roles allowed to make them.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
-- New enum values can't be used in the same transaction, so nothing below
-- refers to 'viewer' as an enum literal; role checks compare text.
alter type public.business_role add value if not exists 'viewer';

create function public.role_rank(r text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case r when 'owner' then 4 when 'admin' then 3 when 'agent' then 2 when 'viewer' then 1 else 0 end;
$$;

-- True when the signed-in user belongs to the business with at least `min_role`.
create function public.has_min_role(target_business_id uuid, min_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = target_business_id
      and m.user_id = (select auth.uid())
      and public.role_rank(m.role::text) >= public.role_rank(min_role)
  );
$$;

-- True when the signed-in user shares a business with `other_user`.
create function public.shares_business_with(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members a
    join public.business_members b on b.business_id = a.business_id
    where a.user_id = (select auth.uid()) and b.user_id = other_user
  );
$$;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
alter table public.users
  add column email text check (char_length(email) <= 320),
  add column avatar_url text check (char_length(avatar_url) <= 1024);

update public.users u set email = a.email from auth.users a where a.id = u.id;

create policy "users: teammates read" on public.users
  for select to authenticated using (public.shares_business_with(id));

grant update (full_name, avatar_url) on public.users to authenticated;

-- ---------------------------------------------------------------------------
-- Businesses
-- ---------------------------------------------------------------------------
alter table public.businesses
  add column slug text,
  add column description text check (char_length(description) <= 2000),
  add column industry text check (industry in (
    'retail', 'restaurant', 'hotel', 'fashion', 'beauty', 'real_estate', 'school', 'services', 'other')),
  add column city text check (char_length(city) <= 120),
  add column address text check (char_length(address) <= 300),
  add column phone text check (char_length(phone) <= 40),
  add column email text check (char_length(email) <= 320),
  add column website text check (char_length(website) <= 300),
  add column logo_url text check (char_length(logo_url) <= 1024),
  add column status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  -- Weekly schedule: {"mon":{"closed":false,"open":"08:00","close":"18:00"}, … "sun":{…}}
  add column opening_hours jsonb not null default '{}'::jsonb check (jsonb_typeof(opening_hours) = 'object'),
  -- Last onboarding step completed (0–6); onboarding_completed_at marks the end.
  add column onboarding_step smallint not null default 0 check (onboarding_step between 0 and 6);

create function public.business_slug(p_name text, p_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(trim(both '-' from left(regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'), 48)), ''), 'business')
         || '-' || left(replace(p_id::text, '-', ''), 6);
$$;

update public.businesses set slug = public.business_slug(name, id) where slug is null;
alter table public.businesses alter column slug set not null;
alter table public.businesses add constraint businesses_slug_key unique (slug);
alter table public.businesses add constraint businesses_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

create function public.businesses_set_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug is null then
    new.slug := public.business_slug(new.name, new.id);
  end if;
  return new;
end;
$$;

create trigger businesses_set_slug before insert on public.businesses
  for each row execute function public.businesses_set_slug();

-- Owners/admins edit the profile (policy "businesses: owners and admins update" already exists).
revoke update on public.businesses from authenticated;
grant update (name, timezone, description, industry, city, address, phone, email, website, logo_url,
              opening_hours, onboarding_step, onboarding_completed_at)
  on public.businesses to authenticated;

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
alter table public.customers rename column whatsapp_id to whatsapp_phone;
alter table public.customers rename column display_name to name;
alter table public.customers
  add column email text check (char_length(email) <= 320),
  add column city text check (char_length(city) <= 120),
  add column notes text check (char_length(notes) <= 4000),
  add column tags text[] not null default '{}' check (cardinality(tags) <= 20),
  add column first_contact_at timestamptz,
  add column last_contact_at timestamptz;
create index customers_business_last_contact_idx on public.customers (business_id, last_contact_at desc nulls last);

drop policy "customers: members update" on public.customers;
create policy "customers: agents insert" on public.customers
  for insert to authenticated with check (public.has_min_role(business_id, 'agent'));
create policy "customers: agents update" on public.customers
  for update to authenticated
  using (public.has_min_role(business_id, 'agent'))
  with check (public.has_min_role(business_id, 'agent'));
create policy "customers: admins delete" on public.customers
  for delete to authenticated using (public.has_min_role(business_id, 'admin'));

revoke insert, update, delete on public.customers from authenticated;
grant insert (business_id, whatsapp_phone, name, email, city, notes, tags,
              preferred_language, preferred_language_source, preferred_language_updated_at)
  on public.customers to authenticated;
grant update (name, email, city, notes, tags,
              preferred_language, preferred_language_source, preferred_language_updated_at)
  on public.customers to authenticated;
grant delete on public.customers to authenticated;

-- ---------------------------------------------------------------------------
-- Conversations: status, human takeover, assignment, unread count
-- ---------------------------------------------------------------------------
alter table public.conversations drop constraint conversations_status_check;
update public.conversations set status = 'resolved' where status = 'closed';
alter table public.conversations add constraint conversations_status_check
  check (status in ('open', 'pending', 'resolved', 'archived'));

alter table public.conversations
  -- false = Human Mode: incoming messages are not answered by the AI.
  add column ai_enabled boolean not null default true,
  -- The customer (or the AI) asked for a person.
  add column human_requested boolean not null default false,
  add column assigned_to uuid references auth.users (id) on delete set null,
  add column unread_count integer not null default 0 check (unread_count >= 0);

update public.conversations set ai_enabled = (handled_by = 'ai');
alter table public.conversations drop column handled_by;
create index conversations_business_status_idx on public.conversations (business_id, status, last_message_at desc nulls last);

-- A conversation can only be assigned to a member of the same business.
create function public.conversations_check_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_to is not null and not exists (
    select 1 from public.business_members where business_id = new.business_id and user_id = new.assigned_to
  ) then
    raise exception 'assignee must be a member of the business' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger conversations_check_assignee before insert or update of assigned_to on public.conversations
  for each row execute function public.conversations_check_assignee();

create policy "conversations: agents insert" on public.conversations
  for insert to authenticated with check (public.has_min_role(business_id, 'agent'));
create policy "conversations: agents update" on public.conversations
  for update to authenticated
  using (public.has_min_role(business_id, 'agent'))
  with check (public.has_min_role(business_id, 'agent'));
create policy "conversations: admins delete" on public.conversations
  for delete to authenticated using (public.has_min_role(business_id, 'admin'));

grant insert (business_id, customer_id, status, language, ai_enabled, assigned_to) on public.conversations to authenticated;
grant update (status, language, ai_enabled, human_requested, assigned_to, unread_count) on public.conversations to authenticated;
grant delete on public.conversations to authenticated;

-- ---------------------------------------------------------------------------
-- Messages: naming + AI metadata (messages are written by the server only)
-- ---------------------------------------------------------------------------
alter table public.messages rename column body to content;
alter table public.messages rename column sender to sender_type;
alter table public.messages
  add column ai_generated boolean not null default false,
  add column ai_model text check (char_length(ai_model) <= 80),
  add column ai_confidence real check (ai_confidence between 0 and 1);

-- ---------------------------------------------------------------------------
-- Products and variants
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  description text check (char_length(description) <= 4000),
  category text check (char_length(category) <= 80),
  sku text check (char_length(sku) <= 64),
  price numeric(14, 2) not null default 0 check (price >= 0),
  currency char(3) not null default 'XAF',
  -- null = stock not tracked
  stock_quantity integer check (stock_quantity >= 0),
  image_url text check (char_length(image_url) <= 1024),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);
create unique index products_business_sku_key on public.products (business_id, lower(sku)) where sku is not null;
create index products_business_name_idx on public.products (business_id, lower(name));

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  product_id uuid not null,
  -- e.g. name "Size", value "L"
  name text not null check (char_length(btrim(name)) between 1 and 60),
  value text not null check (char_length(btrim(value)) between 1 and 80),
  stock_quantity integer check (stock_quantity >= 0),
  -- Added to the product price (can be negative, final price never below 0).
  price_modifier numeric(14, 2) not null default 0,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, product_id) references public.products (business_id, id) on delete cascade
);
create index product_variants_product_idx on public.product_variants (business_id, product_id);

-- ---------------------------------------------------------------------------
-- Knowledge: FAQs and documents (the trusted source for the AI)
-- ---------------------------------------------------------------------------
create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 1 and 500),
  answer text not null check (char_length(btrim(answer)) between 1 and 4000),
  category text check (char_length(category) <= 80),
  active boolean not null default true,
  priority smallint not null default 0 check (priority between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index faqs_business_idx on public.faqs (business_id, priority desc, created_at);

create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  content text not null check (char_length(btrim(content)) between 1 and 20000),
  document_type text not null default 'general'
    check (document_type in ('about', 'hours', 'delivery', 'returns', 'policy', 'services', 'faq', 'general')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index knowledge_documents_business_idx on public.knowledge_documents (business_id, document_type);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table public.business_counters (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  order_seq bigint not null default 0
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null,
  conversation_id uuid,
  order_number text not null check (char_length(order_number) <= 32),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'processing', 'ready', 'out_for_delivery', 'delivered', 'cancelled')),
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  delivery_fee numeric(14, 2) not null default 0 check (delivery_fee >= 0),
  discount numeric(14, 2) not null default 0 check (discount >= 0),
  total numeric(14, 2) not null default 0 check (total >= 0),
  currency char(3) not null default 'XAF',
  delivery_address text check (char_length(delivery_address) <= 500),
  -- Recorded by hand for now; no payment is processed by WazaBolt yet.
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'pending', 'paid', 'refunded', 'failed')),
  payment_method text check (payment_method in ('cash', 'mobile_money', 'orange_money', 'mtn_momo', 'bank_transfer', 'card', 'other')),
  notes text check (char_length(notes) <= 2000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, order_number),
  foreign key (business_id, customer_id) references public.customers (business_id, id) on delete restrict,
  foreign key (business_id, conversation_id) references public.conversations (business_id, id) on delete set null (conversation_id),
  check (total = subtotal + delivery_fee - discount)
);
create index orders_business_created_idx on public.orders (business_id, created_at desc);
create index orders_customer_idx on public.orders (business_id, customer_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  order_id uuid not null,
  -- Kept for reporting; the snapshot below is what the order shows.
  product_id uuid references public.products (id) on delete set null,
  product_name text not null check (char_length(product_name) between 1 and 200),
  variant text check (char_length(variant) <= 120),
  quantity integer not null check (quantity between 1 and 100000),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  total numeric(14, 2) not null check (total >= 0),
  foreign key (business_id, order_id) references public.orders (business_id, id) on delete cascade,
  check (total = unit_price * quantity)
);
create index order_items_order_idx on public.order_items (business_id, order_id);

/*
 * Creates an order with its items in one transaction. Prices and names come
 * from the catalog (server truth), not from the browser; custom lines (no
 * product) take the given name and price. Totals and the per-business
 * order number (ORD-00001, ORD-00002 …) are computed here.
 *
 * p_items: [{"product_id":"…","variant_id":"…","quantity":2}
 *           | {"name":"Delivery setup","unit_price":2000,"quantity":1}]
 */
create function public.create_order(
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
  v_price numeric(14, 2);
begin
  if not public.has_min_role(p_business_id, 'agent') then
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
                             delivery_address, payment_method, notes, created_by)
  values (v_order_id, p_business_id, p_customer_id, p_conversation_id, 'ORD-' || lpad(v_seq::text, 5, '0'), v_currency,
          nullif(btrim(p_delivery_address), ''), p_payment_method, nullif(btrim(p_notes), ''), (select auth.uid()));

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item ->> 'quantity')::integer, 1);
    if v_qty < 1 then
      raise exception 'quantity must be at least 1' using errcode = '22023';
    end if;
    v_variant_label := null;

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
      end if;
    else
      v_name := nullif(btrim(v_item ->> 'name'), '');
      v_price := (v_item ->> 'unit_price')::numeric;
      if v_name is null or v_price is null or v_price < 0 then
        raise exception 'custom items need a name and a price' using errcode = '22023';
      end if;
      v_product.id := null;
    end if;

    insert into public.order_items (business_id, order_id, product_id, product_name, variant, quantity, unit_price, total)
    values (p_business_id, v_order_id, v_product.id, v_name, v_variant_label, v_qty, v_price, v_price * v_qty);
    v_subtotal := v_subtotal + v_price * v_qty;
    v_product.id := null;
  end loop;

  if coalesce(p_discount, 0) > v_subtotal + coalesce(p_delivery_fee, 0) then
    raise exception 'discount is larger than the order' using errcode = '22023';
  end if;

  update public.orders
  set subtotal = v_subtotal,
      delivery_fee = coalesce(p_delivery_fee, 0),
      discount = coalesce(p_discount, 0),
      total = v_subtotal + coalesce(p_delivery_fee, 0) - coalesce(p_discount, 0)
  where id = v_order_id;

  return v_order_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- AI assistant settings
-- ---------------------------------------------------------------------------
update public.ai_settings set tone = 'friendly' where tone = 'warm';
alter table public.ai_settings drop constraint ai_settings_tone_check;
alter table public.ai_settings add constraint ai_settings_tone_check check (tone in ('professional', 'friendly', 'casual'));

alter table public.ai_settings
  add column ai_enabled boolean not null default true,
  add column greeting text check (char_length(greeting) <= 1000),
  add column fallback_message text check (char_length(fallback_message) <= 1000),
  -- Outside opening hours: answer as usual, send the after-hours message, or hand to the team.
  add column after_hours_mode text not null default 'reply_normally'
    check (after_hours_mode in ('reply_normally', 'after_hours_message', 'handover')),
  add column after_hours_message text check (char_length(after_hours_message) <= 1000),
  add column human_handover_enabled boolean not null default true,
  -- Suggest relevant products and offer to take the order.
  add column sales_mode boolean not null default false;

create policy "ai_settings: admins update" on public.ai_settings
  for update to authenticated
  using (public.has_min_role(business_id, 'admin'))
  with check (public.has_min_role(business_id, 'admin'));
-- Language mode and reply languages still change only through update_business_language_settings().
grant update (ai_enabled, tone, reply_length, greeting, fallback_message, after_hours_mode, after_hours_message,
              human_handover_enabled, sales_mode)
  on public.ai_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Plans and subscriptions (configurable; no payment processing yet)
-- ---------------------------------------------------------------------------
create table public.plans (
  id text primary key check (id ~ '^[a-z0-9_]{2,32}$'),
  name text not null check (char_length(name) <= 60),
  monthly_price numeric(14, 2) not null check (monthly_price >= 0),
  currency char(3) not null default 'XAF',
  ai_conversations_per_month integer not null check (ai_conversations_per_month >= 0),
  highlighted boolean not null default false,
  active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

-- Initial launch prices (same as the public pricing page).
insert into public.plans (id, name, monthly_price, ai_conversations_per_month, highlighted, sort_order) values
  ('free', 'Free', 0, 50, false, 1),
  ('starter', 'Starter', 10000, 500, false, 2),
  ('business', 'Business', 25000, 2000, true, 3),
  ('pro', 'Pro', 50000, 5000, false, 4);

create table public.subscriptions (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status text not null default 'active' check (status in ('active', 'trialing', 'past_due', 'canceled')),
  current_period_start timestamptz not null default date_trunc('month', now()),
  current_period_end timestamptz not null default date_trunc('month', now()) + interval '1 month',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- WhatsApp connection state (credentials are never stored here)
-- ---------------------------------------------------------------------------
create table public.whatsapp_connections (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  status text not null default 'not_connected' check (status in ('not_connected', 'connecting', 'connected', 'error')),
  display_phone_number text check (char_length(display_phone_number) <= 40),
  phone_number_id text check (char_length(phone_number_id) <= 64),
  waba_id text check (char_length(waba_id) <= 64),
  verified_name text check (char_length(verified_name) <= 200),
  last_error text check (char_length(last_error) <= 300),
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'connected' or phone_number_id is not null)
);
create unique index whatsapp_connections_phone_number_id_key on public.whatsapp_connections (phone_number_id)
  where phone_number_id is not null;

-- ---------------------------------------------------------------------------
-- Per-business rows every business needs, created with the business
-- ---------------------------------------------------------------------------
create function public.businesses_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.subscriptions (business_id, plan_id) values (new.id, 'free') on conflict do nothing;
  insert into public.whatsapp_connections (business_id) values (new.id) on conflict do nothing;
  insert into public.business_counters (business_id) values (new.id) on conflict do nothing;
  return null;
end;
$$;
create trigger businesses_after_insert after insert on public.businesses
  for each row execute function public.businesses_after_insert();

insert into public.subscriptions (business_id, plan_id) select id, 'free' from public.businesses on conflict do nothing;
insert into public.whatsapp_connections (business_id) select id from public.businesses on conflict do nothing;
insert into public.business_counters (business_id) select id from public.businesses on conflict do nothing;

-- Sign-up also records the email on the profile.
create function public.users_sync_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users set email = new.email where id = new.id and email is distinct from new.email;
  return null;
end;
$$;
create trigger on_auth_user_email after insert or update of email on auth.users
  for each row execute function public.users_sync_email();

-- ---------------------------------------------------------------------------
-- Audit trail (who changed what — never the content itself)
-- ---------------------------------------------------------------------------
create function public.audit_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_entity text := tg_argv[0];
  v_action text;
  v_meta jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    v_action := v_entity || '.created';
  elsif tg_op = 'DELETE' then
    v_action := v_entity || '.deleted';
  else
    v_action := v_entity || '.updated';
    if v_entity = 'conversation' and (to_jsonb(new) ->> 'ai_enabled') is distinct from (to_jsonb(old) ->> 'ai_enabled') then
      v_action := case when (to_jsonb(new) ->> 'ai_enabled')::boolean then 'conversation.returned_to_ai' else 'conversation.taken_over' end;
    elsif (to_jsonb(new) ->> 'status') is distinct from (to_jsonb(old) ->> 'status') then
      v_meta := jsonb_build_object('from', to_jsonb(old) ->> 'status', 'to', to_jsonb(new) ->> 'status');
    elsif (to_jsonb(new) ->> 'payment_status') is distinct from (to_jsonb(old) ->> 'payment_status') then
      v_action := v_entity || '.payment_updated';
      v_meta := jsonb_build_object('from', to_jsonb(old) ->> 'payment_status', 'to', to_jsonb(new) ->> 'payment_status');
    elsif v_entity in ('conversation', 'order') then
      return null; -- unread counters, notes …: not worth an audit row
    end if;
  end if;

  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  select (v_row ->> 'business_id')::uuid, (select auth.uid()), v_action, v_entity, v_row ->> 'id', v_meta
  where exists (select 1 from public.businesses where id = (v_row ->> 'business_id')::uuid);
  return null;
end;
$$;

create trigger products_audit after insert or update or delete on public.products
  for each row execute function public.audit_change('product');
create trigger faqs_audit after insert or update or delete on public.faqs
  for each row execute function public.audit_change('faq');
create trigger knowledge_documents_audit after insert or update or delete on public.knowledge_documents
  for each row execute function public.audit_change('knowledge_document');
create trigger customers_audit after insert or delete on public.customers
  for each row execute function public.audit_change('customer');
create trigger conversations_audit after update of ai_enabled, status on public.conversations
  for each row execute function public.audit_change('conversation');
create trigger orders_audit after insert or update of status, payment_status or delete on public.orders
  for each row execute function public.audit_change('order');

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger faqs_set_updated_at before update on public.faqs for each row execute function public.set_updated_at();
create trigger knowledge_documents_set_updated_at before update on public.knowledge_documents for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders for each row execute function public.set_updated_at();
create trigger subscriptions_set_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
create trigger whatsapp_connections_set_updated_at before update on public.whatsapp_connections for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security for the new tables
-- ---------------------------------------------------------------------------
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.faqs enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.business_counters enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.whatsapp_connections enable row level security;

-- Catalog and knowledge: every member reads; owners/admins write.
create policy "products: members read" on public.products for select to authenticated using (public.is_business_member(business_id));
create policy "products: admins insert" on public.products for insert to authenticated with check (public.has_min_role(business_id, 'admin'));
create policy "products: admins update" on public.products for update to authenticated
  using (public.has_min_role(business_id, 'admin')) with check (public.has_min_role(business_id, 'admin'));
create policy "products: admins delete" on public.products for delete to authenticated using (public.has_min_role(business_id, 'admin'));

create policy "product_variants: members read" on public.product_variants for select to authenticated using (public.is_business_member(business_id));
create policy "product_variants: admins insert" on public.product_variants for insert to authenticated with check (public.has_min_role(business_id, 'admin'));
create policy "product_variants: admins update" on public.product_variants for update to authenticated
  using (public.has_min_role(business_id, 'admin')) with check (public.has_min_role(business_id, 'admin'));
create policy "product_variants: admins delete" on public.product_variants for delete to authenticated using (public.has_min_role(business_id, 'admin'));

create policy "faqs: members read" on public.faqs for select to authenticated using (public.is_business_member(business_id));
create policy "faqs: admins insert" on public.faqs for insert to authenticated with check (public.has_min_role(business_id, 'admin'));
create policy "faqs: admins update" on public.faqs for update to authenticated
  using (public.has_min_role(business_id, 'admin')) with check (public.has_min_role(business_id, 'admin'));
create policy "faqs: admins delete" on public.faqs for delete to authenticated using (public.has_min_role(business_id, 'admin'));

create policy "knowledge_documents: members read" on public.knowledge_documents for select to authenticated using (public.is_business_member(business_id));
create policy "knowledge_documents: admins insert" on public.knowledge_documents for insert to authenticated with check (public.has_min_role(business_id, 'admin'));
create policy "knowledge_documents: admins update" on public.knowledge_documents for update to authenticated
  using (public.has_min_role(business_id, 'admin')) with check (public.has_min_role(business_id, 'admin'));
create policy "knowledge_documents: admins delete" on public.knowledge_documents for delete to authenticated using (public.has_min_role(business_id, 'admin'));

-- Orders: members read; created through create_order(); agents update status/payment/notes; admins delete.
create policy "orders: members read" on public.orders for select to authenticated using (public.is_business_member(business_id));
create policy "orders: agents update" on public.orders for update to authenticated
  using (public.has_min_role(business_id, 'agent')) with check (public.has_min_role(business_id, 'agent'));
create policy "orders: admins delete" on public.orders for delete to authenticated using (public.has_min_role(business_id, 'admin'));
create policy "order_items: members read" on public.order_items for select to authenticated using (public.is_business_member(business_id));

-- Billing and WhatsApp state: members read; only the server changes them.
create policy "plans: readable by everyone" on public.plans for select using (active);
create policy "subscriptions: members read" on public.subscriptions for select to authenticated using (public.is_business_member(business_id));
create policy "whatsapp_connections: members read" on public.whatsapp_connections for select to authenticated using (public.is_business_member(business_id));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.products, public.product_variants, public.faqs, public.knowledge_documents, public.business_counters,
  public.orders, public.order_items, public.plans, public.subscriptions, public.whatsapp_connections
  from anon, authenticated;

grant select, insert, update, delete on public.products, public.product_variants, public.faqs, public.knowledge_documents to authenticated;
grant select on public.orders, public.order_items, public.subscriptions, public.whatsapp_connections to authenticated;
grant update (status, payment_status, payment_method, delivery_address, notes) on public.orders to authenticated;
grant delete on public.orders to authenticated;
grant select on public.plans to anon, authenticated;
grant all on public.products, public.product_variants, public.faqs, public.knowledge_documents, public.business_counters,
  public.orders, public.order_items, public.plans, public.subscriptions, public.whatsapp_connections
  to service_role;

revoke execute on function public.has_min_role(uuid, text) from public, anon;
revoke execute on function public.shares_business_with(uuid) from public, anon;
revoke execute on function public.create_order(uuid, uuid, jsonb, uuid, numeric, numeric, text, text, text) from public, anon;
revoke execute on function public.conversations_check_assignee() from public, anon, authenticated;
revoke execute on function public.businesses_after_insert() from public, anon, authenticated;
revoke execute on function public.users_sync_email() from public, anon, authenticated;
revoke execute on function public.audit_change() from public, anon, authenticated;
grant execute on function public.has_min_role(uuid, text) to authenticated;
grant execute on function public.shares_business_with(uuid) to authenticated;
grant execute on function public.create_order(uuid, uuid, jsonb, uuid, numeric, numeric, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Product images: public-read bucket, folder per business, owners/admins upload.
-- Skipped where Supabase Storage isn't installed (plain Postgres tests).
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;

    execute $p$
      create policy "product-images: admins upload" on storage.objects for insert to authenticated
      with check (bucket_id = 'product-images'
                  and public.has_min_role(((storage.foldername(name))[1])::uuid, 'admin'))
    $p$;
    execute $p$
      create policy "product-images: admins update" on storage.objects for update to authenticated
      using (bucket_id = 'product-images' and public.has_min_role(((storage.foldername(name))[1])::uuid, 'admin'))
    $p$;
    execute $p$
      create policy "product-images: admins delete" on storage.objects for delete to authenticated
      using (bucket_id = 'product-images' and public.has_min_role(((storage.foldername(name))[1])::uuid, 'admin'))
    $p$;
  end if;
end $$;
