/*
 * Sample data for new workspaces, walled off from real work.
 *
 * A new workspace is seeded (lib/onboarding/seedVertical.ts) with a few
 * catalogue / menu items (school: subjects), two WhatsApp conversations (one
 * waiting for a person) and three FAQ templates, all marked is_sample. They
 * are there to show how WazaBolt works, so they never count as real work:
 *
 *  - no sale, order or appointment can use a sample product or customer
 *    (WB490 / WB491), so revenue, stock history and reports stay real;
 *  - they don't count towards plan limits;
 *  - the app keeps them off the public shop page, out of the AI, broadcasts
 *    and exports, and never sends a WhatsApp message to a sample customer;
 *  - a sample product or FAQ edited by the team, or a sample subject given to
 *    a class, becomes the business's own (is_sample false);
 *  - clear_sample_data (owner only) deletes what is still sample, and only
 *    for that business.
 *
 * Non-destructive: columns added with default false (existing rows are real),
 * functions and triggers added or replaced, the customer-number check widened
 * for sample rows only; no data changed.
 */

-- ---------------------------------------------------------------------------
-- The flag
-- ---------------------------------------------------------------------------
alter table public.products add column is_sample boolean not null default false;
alter table public.customers add column is_sample boolean not null default false;
alter table public.conversations add column is_sample boolean not null default false;
alter table public.orders add column is_sample boolean not null default false;
alter table public.faqs add column is_sample boolean not null default false;
alter table public.school_subjects add column is_sample boolean not null default false;

comment on column public.products.is_sample is 'Sample item seeded for a new workspace: never sold, not on the public shop page, not counted; deleted by clear_sample_data.';
comment on column public.customers.is_sample is 'Sample customer seeded for a new workspace: no orders, appointments or WhatsApp messages; deleted by clear_sample_data.';
comment on column public.conversations.is_sample is 'Sample WhatsApp conversation seeded for a new workspace: replies are never sent; deleted by clear_sample_data.';
comment on column public.orders.is_sample is 'Sample order (none are seeded today); deleted by clear_sample_data.';
comment on column public.faqs.is_sample is 'FAQ template seeded for a new workspace, not used by the assistant until edited; deleted by clear_sample_data.';
comment on column public.school_subjects.is_sample is 'Sample subject seeded for a new school; becomes the school''s own once given to a class; deleted by clear_sample_data.';

-- Products are readable column by column (20261014120000_cost_privacy.sql): the flag is readable by members.
grant select (is_sample) on public.products to authenticated;

create index products_sample_idx on public.products (business_id) where is_sample;
create index customers_sample_idx on public.customers (business_id) where is_sample;
create index conversations_sample_idx on public.conversations (business_id) where is_sample;
create index orders_sample_idx on public.orders (business_id) where is_sample;
create index faqs_sample_idx on public.faqs (business_id) where is_sample;
create index school_subjects_sample_idx on public.school_subjects (business_id) where is_sample;

-- Only the server (service role, the seeder) marks rows as sample. From the app the
-- flag can only be turned off (adopting a row): a team member can never mark real
-- data as sample to have it deleted by "Clear sample data".
create or replace function public.guard_sample_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Requests from the app (signed-in or anonymous) can't; the server's service role and direct database work can.
  if new.is_sample and (tg_op = 'INSERT' or not old.is_sample)
     and coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'only WazaBolt marks sample data' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_sample_flag() from public, anon, authenticated;
create trigger products_guard_sample before insert or update of is_sample on public.products for each row execute function public.guard_sample_flag();
create trigger customers_guard_sample before insert or update of is_sample on public.customers for each row execute function public.guard_sample_flag();
create trigger conversations_guard_sample before insert or update of is_sample on public.conversations for each row execute function public.guard_sample_flag();
create trigger orders_guard_sample before insert or update of is_sample on public.orders for each row execute function public.guard_sample_flag();
create trigger faqs_guard_sample before insert or update of is_sample on public.faqs for each row execute function public.guard_sample_flag();
create trigger school_subjects_guard_sample before insert or update of is_sample on public.school_subjects for each row execute function public.guard_sample_flag();

-- ---------------------------------------------------------------------------
-- Customer numbers: sample customers are SAMPLE-1, SAMPLE-2… and never use the
-- business's CUS- counter, so its first real customer is still CUS-000001.
-- ---------------------------------------------------------------------------
alter table public.customers drop constraint customers_reference_format;
alter table public.customers add constraint customers_reference_format
  check (reference ~ '^CUS-[0-9]{6,}$' or (is_sample and reference ~ '^SAMPLE-[0-9]{1,6}$'));

create or replace function public.customers_assign_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq bigint;
  v_existing text;
begin
  select reference into v_existing from public.customers
  where business_id = new.business_id and whatsapp_phone = new.whatsapp_phone;
  if v_existing is not null then
    new.reference := v_existing;
    return new;
  end if;
  if new.is_sample then
    if new.reference !~ '^SAMPLE-[0-9]{1,6}$' then
      new.reference := 'SAMPLE-' || (select count(*) + 1 from public.customers where business_id = new.business_id and is_sample);
    end if;
    return new;
  end if;
  insert into public.business_counters (business_id) values (new.business_id) on conflict do nothing;
  update public.business_counters set customer_seq = customer_seq + 1
  where business_id = new.business_id returning customer_seq into v_seq;
  new.reference := public.format_reference('CUS', v_seq, 6);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Walls: no real work on sample rows
-- ---------------------------------------------------------------------------
create or replace function public.refuse_sample_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.customer_id is not null and not coalesce(new.is_sample, false)
     and exists (select 1 from public.customers where id = new.customer_id and is_sample) then
    raise exception 'sample customer: add a real customer' using errcode = 'WB490';
  end if;
  return new;
end;
$$;
revoke execute on function public.refuse_sample_customer() from public, anon, authenticated;

create trigger orders_refuse_sample_customer before insert or update of customer_id on public.orders
  for each row execute function public.refuse_sample_customer();

-- Appointments have no is_sample column: any appointment for a sample customer is refused.
create or replace function public.refuse_sample_customer_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.customer_id is not null and exists (select 1 from public.customers where id = new.customer_id and is_sample) then
    raise exception 'sample customer: add a real customer' using errcode = 'WB490';
  end if;
  return new;
end;
$$;
revoke execute on function public.refuse_sample_customer_appointment() from public, anon, authenticated;
create trigger appointments_refuse_sample_customer before insert or update of customer_id on public.appointments
  for each row execute function public.refuse_sample_customer_appointment();

create or replace function public.refuse_sample_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.product_id is not null and exists (select 1 from public.products where id = new.product_id and is_sample) then
    raise exception 'sample product: edit it to make it yours, or add your own' using errcode = 'WB491';
  end if;
  return new;
end;
$$;
revoke execute on function public.refuse_sample_product() from public, anon, authenticated;
create trigger order_items_refuse_sample_product before insert or update of product_id on public.order_items
  for each row execute function public.refuse_sample_product();

-- A sample subject given to a class becomes the school's own.
create or replace function public.adopt_sample_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.school_subjects set is_sample = false where id = new.subject_id and is_sample;
  return new;
end;
$$;
revoke execute on function public.adopt_sample_subject() from public, anon, authenticated;
create trigger class_subjects_adopt_sample_subject after insert or update of subject_id on public.class_subjects
  for each row execute function public.adopt_sample_subject();

-- ---------------------------------------------------------------------------
-- Plan limits: sample items are not counted
-- ---------------------------------------------------------------------------
create or replace function public.enforce_product_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
begin
  if not new.active or new.is_sample or (tg_op = 'UPDATE' and old.active) then
    return new;
  end if;
  select * into l from public._plan_limits(new.business_id);
  if l.enforced and l.max_products is not null
     and (select count(*) from public.products where business_id = new.business_id and active and not is_sample and id <> new.id) >= l.max_products then
    raise exception 'plan limit: % active products on the % plan', l.max_products, l.plan_id using errcode = 'WB411';
  end if;
  return new;
end;
$$;

create or replace function public.business_plan_limits(p_business_id uuid)
returns table (plan_id text, max_products integer, max_monthly_sales integer, max_members integer, report_days integer,
               has_profit boolean, enforced boolean, limits_from date,
               products_used integer, sales_this_month integer, members_used integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
begin
  if not public.has_min_role(p_business_id, 'viewer') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select timezone into v_tz from public.businesses where id = p_business_id;
  return query
  select l.plan_id, l.max_products, l.max_monthly_sales, l.max_members, l.report_days, l.has_profit, l.enforced, l.limits_from,
         (select count(*)::int from public.products where business_id = p_business_id and active and not is_sample),
         (select count(*)::int from public.orders
           where business_id = p_business_id and channel is distinct from 'whatsapp' and status <> 'cancelled' and not is_sample
             and created_at >= (date_trunc('month', now() at time zone v_tz) at time zone v_tz)),
         (select count(*)::int from public.business_members where business_id = p_business_id and role::text not in ('teacher', 'kitchen'))
  from public._plan_limits(p_business_id) l;
end;
$$;

-- ---------------------------------------------------------------------------
-- Clearing (owner only)
-- ---------------------------------------------------------------------------
/* Deletes this business's rows still marked as sample; returns how many of each. */
create or replace function public.clear_sample_data(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversations integer;
  v_customers integer;
  v_orders integer;
  v_products integer;
  v_faqs integer;
  v_subjects integer;
begin
  if not public.has_min_role(p_business_id, 'owner') then
    raise exception 'only the owner can clear sample data' using errcode = '42501';
  end if;
  delete from public.orders where business_id = p_business_id and is_sample;
  get diagnostics v_orders = row_count;
  delete from public.conversations where business_id = p_business_id and is_sample;
  get diagnostics v_conversations = row_count;
  delete from public.customers where business_id = p_business_id and is_sample;
  get diagnostics v_customers = row_count;
  delete from public.products where business_id = p_business_id and is_sample;
  get diagnostics v_products = row_count;
  delete from public.faqs where business_id = p_business_id and is_sample;
  get diagnostics v_faqs = row_count;
  -- A subject given to a class was adopted (is_sample false); this also skips any still in use.
  delete from public.school_subjects s where s.business_id = p_business_id and s.is_sample
    and not exists (select 1 from public.class_subjects c where c.subject_id = s.id);
  get diagnostics v_subjects = row_count;

  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, (select auth.uid()), 'sample_data.cleared', 'business', p_business_id::text,
          jsonb_build_object('products', v_products, 'customers', v_customers, 'conversations', v_conversations,
                             'orders', v_orders, 'faqs', v_faqs, 'subjects', v_subjects));
  return jsonb_build_object('products', v_products, 'customers', v_customers, 'conversations', v_conversations,
                            'orders', v_orders, 'faqs', v_faqs, 'subjects', v_subjects);
end;
$$;
revoke execute on function public.clear_sample_data(uuid) from public, anon;
grant execute on function public.clear_sample_data(uuid) to authenticated;

/* Does this business still have sample data? (members: the dashboard banner) */
create or replace function public.has_sample_data(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_business_member(p_business_id) and (
    exists (select 1 from public.products where business_id = p_business_id and is_sample)
    or exists (select 1 from public.conversations where business_id = p_business_id and is_sample)
    or exists (select 1 from public.customers where business_id = p_business_id and is_sample)
    or exists (select 1 from public.faqs where business_id = p_business_id and is_sample)
    or exists (select 1 from public.orders where business_id = p_business_id and is_sample)
    or exists (select 1 from public.school_subjects where business_id = p_business_id and is_sample)
  );
$$;
revoke execute on function public.has_sample_data(uuid) from public, anon;
grant execute on function public.has_sample_data(uuid) to authenticated;
