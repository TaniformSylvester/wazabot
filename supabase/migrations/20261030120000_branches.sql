-- WazaBolt — branches: one business, several locations.
--
-- Products, prices and customers stay shared. Each branch has its own stock,
-- its own sales and orders, and (for restaurants) its own tables and kitchen.
-- Owners and admins see every branch; agents, viewers and kitchen staff can be
-- tied to one branch, and then only see and sell there.
--
-- Stock: products.stock_quantity and product_variants.stock_quantity stay the
-- total across branches, so everything that reads stock keeps working.
-- branch_stock holds each branch's share. Every stock change already goes
-- through an update of the total; the stock trigger now applies the same
-- change to one branch (the order's branch for sales and returns, the branch
-- given to adjust_stock, otherwise the main branch) and refuses it when that
-- branch hasn't enough. Moving stock between branches leaves the total alone.
--
-- Every business gets a main branch (existing ones too), so a business that
-- never adds a branch works exactly as before.
--
-- Plans: Free, Boutique and Starter include 1 location, Business 2 and Pro 5.
-- Business and Pro can add extra branches (5,000 FCFA/month each), requested
-- like a plan change and approved by WazaBolt once paid.
--
-- Additive except for four functions that gain a branch parameter
-- (create_order, create_sale, restaurant_open_order: dropped and recreated with
-- an extra optional argument; approve_plan_change: replaced) and adjust_stock
-- (recreated with an optional branch). Existing data is kept: orders and
-- restaurant tables are assigned to the main branch, and the current stock
-- becomes the main branch's stock.

-- ---------------------------------------------------------------- Plans
alter table public.plans
  add column included_branches integer not null default 1 check (included_branches >= 1),
  add column extra_branch_price numeric(14, 2) check (extra_branch_price >= 0);
comment on column public.plans.included_branches is 'Locations included in the plan (the main one counts).';
comment on column public.plans.extra_branch_price is 'Monthly price of each extra branch; null when the plan cannot add branches.';
update public.plans set included_branches = 2, extra_branch_price = 5000 where id = 'business';
update public.plans set included_branches = 5, extra_branch_price = 5000 where id = 'pro';

alter table public.subscriptions
  add column extra_branches integer not null default 0 check (extra_branches between 0 and 100);
comment on column public.subscriptions.extra_branches is 'Paid branches on top of the plan''s included ones (approved by WazaBolt).';

alter table public.plan_change_requests
  add column extra_branches integer check (extra_branches between 0 and 100);
alter table public.plan_change_requests drop constraint plan_change_requests_kind_check;
alter table public.plan_change_requests
  add constraint plan_change_requests_kind_check check (kind in ('change', 'renewal', 'branches'));
alter table public.plan_change_requests
  add constraint plan_change_requests_branches_check check ((kind = 'branches') = (extra_branches is not null));

-- ---------------------------------------------------------------- Branches
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  address text check (char_length(address) <= 300),
  city text check (char_length(city) <= 80),
  phone text check (char_length(phone) <= 40),
  hours text check (char_length(hours) <= 300),
  is_main boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);
comment on table public.branches is 'Locations of a business. Every business has one main branch.';
comment on column public.branches.hours is 'Opening hours as the customer should read them (e.g. "Mon–Sat 8:00–20:00").';
create unique index branches_main_key on public.branches (business_id) where is_main;
create unique index branches_name_key on public.branches (business_id, lower(btrim(name)));
create trigger branches_set_updated_at before update on public.branches
  for each row execute function public.set_updated_at();

alter table public.branches enable row level security;
-- Every member reads the branches, kitchen staff and teachers included (is_business_member leaves them out): the kitchen screen needs its branch.
create policy "branches: members read" on public.branches
  for select to authenticated
  using (exists (select 1 from public.business_members m where m.business_id = branches.business_id and m.user_id = (select auth.uid())));
create policy "branches: admins insert" on public.branches
  for insert to authenticated with check (public.has_min_role(business_id, 'admin') and not is_main);
create policy "branches: admins update" on public.branches
  for update to authenticated using (public.has_min_role(business_id, 'admin')) with check (public.has_min_role(business_id, 'admin'));
revoke all on public.branches from anon, authenticated;
grant select, insert, update (name, address, city, phone, hours, active) on public.branches to authenticated;
grant all on public.branches to service_role;

/* Locations the business may have open: the plan's, plus paid extra branches where the plan sells them. */
create function public.branch_allowance(p_business_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select pl.included_branches + case when pl.extra_branch_price is not null then s.extra_branches else 0 end
    from public.subscriptions s join public.plans pl on pl.id = s.plan_id
    where s.business_id = p_business_id
  ), 1);
$$;
revoke execute on function public.branch_allowance(uuid) from public, anon;
grant execute on function public.branch_allowance(uuid) to authenticated, service_role;

/* The main branch never closes or moves; opening a branch needs room in the plan (WB452). */
create function public.branches_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.business_id := old.business_id;
    new.is_main := old.is_main;
    if new.is_main and not new.active then
      raise exception 'the main branch cannot be closed' using errcode = '22023';
    end if;
  end if;
  if new.active and (tg_op = 'INSERT' or not old.active) then
    perform 1 from public.businesses where id = new.business_id for update;
    if (select count(*) from public.branches where business_id = new.business_id and active and id <> new.id)
       >= public.branch_allowance(new.business_id) then
      raise exception 'branch limit reached for this plan' using errcode = 'WB452';
    end if;
  end if;
  return new;
end;
$$;
create trigger branches_guard before insert or update on public.branches
  for each row execute function public.branches_guard();

-- Existing businesses: their main branch.
insert into public.branches (business_id, name, address, city, phone, is_main)
select id, left(btrim(coalesce(nullif(btrim(city), ''), name)), 80), left(address, 300), left(city, 80), left(phone, 40), true
from public.businesses;

create function public.businesses_main_branch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.branches (business_id, name, address, city, phone, is_main)
  values (new.id, left(btrim(coalesce(nullif(btrim(new.city), ''), new.name)), 80), left(new.address, 300), left(new.city, 80), left(new.phone, 40), true);
  return new;
end;
$$;
create trigger businesses_main_branch after insert on public.businesses
  for each row execute function public.businesses_main_branch();

/* Fewer locations allowed (downgrade, lapsed plan, fewer extra branches): the newest branches pause. */
create function public.subscriptions_pause_branches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_over integer;
begin
  v_over := (select count(*) from public.branches where business_id = new.business_id and active) - public.branch_allowance(new.business_id);
  if v_over > 0 then
    update public.branches set active = false
    where id in (
      select id from public.branches where business_id = new.business_id and active and not is_main
      order by created_at desc limit v_over
    );
  end if;
  return new;
end;
$$;
create trigger subscriptions_pause_branches after update of plan_id, extra_branches on public.subscriptions
  for each row execute function public.subscriptions_pause_branches();

-- ---------------------------------------------------------------- Team members tied to a branch
alter table public.business_members add column branch_id uuid;
alter table public.business_members
  add constraint business_members_branch_fkey foreign key (business_id, branch_id) references public.branches (business_id, id);
comment on column public.business_members.branch_id is 'Agents, viewers and kitchen staff tied to one branch only see and sell there. Null: every branch.';

/* The signed-in member's branch (null: every branch, or not a member, or the service role). */
create function public.current_member_branch(p_business_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select branch_id from public.business_members where business_id = p_business_id and user_id = (select auth.uid());
$$;
revoke execute on function public.current_member_branch(uuid) from public, anon;
grant execute on function public.current_member_branch(uuid) to authenticated;

/* May the signed-in user work with this branch's records? */
create function public.can_use_branch(p_business_id uuid, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_branch_id is null or coalesce(public.current_member_branch(p_business_id), p_branch_id) = p_branch_id;
$$;
revoke execute on function public.can_use_branch(uuid, uuid) from public, anon;
grant execute on function public.can_use_branch(uuid, uuid) to authenticated;

/* Owners and admins work across branches: becoming one clears the branch. */
create function public.business_members_branch_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role in ('owner', 'admin', 'teacher') then
    new.branch_id := null;
  end if;
  return new;
end;
$$;
create trigger business_members_branch_rules before insert or update of role, branch_id on public.business_members
  for each row execute function public.business_members_branch_rules();

/* Owner or admin ties a team member to a branch (null: every branch). */
create function public.set_member_branch(p_business_id uuid, p_user_id uuid, p_branch_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select role::text into v_role from public.business_members where business_id = p_business_id and user_id = p_user_id for update;
  if not found then
    raise exception 'not a member' using errcode = '22023';
  end if;
  if p_branch_id is not null and v_role not in ('agent', 'viewer', 'kitchen') then
    raise exception 'owners and admins work in every branch' using errcode = '22023';
  end if;
  if p_branch_id is not null and not exists (select 1 from public.branches where id = p_branch_id and business_id = p_business_id and active) then
    raise exception 'unknown branch' using errcode = '22023';
  end if;
  update public.business_members set branch_id = p_branch_id where business_id = p_business_id and user_id = p_user_id;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, (select auth.uid()), 'member.branch_changed', 'business_member', p_user_id::text, jsonb_build_object('branch', p_branch_id));
end;
$$;
revoke execute on function public.set_member_branch(uuid, uuid, uuid) from public, anon;
grant execute on function public.set_member_branch(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- Stock per branch
create table public.branch_stock (
  business_id uuid not null,
  branch_id uuid not null,
  product_id uuid not null,
  variant_id uuid,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  foreign key (business_id, branch_id) references public.branches (business_id, id) on delete cascade,
  foreign key (business_id, product_id) references public.products (business_id, id) on delete cascade,
  foreign key (business_id, variant_id) references public.product_variants (business_id, id) on delete cascade
);
comment on table public.branch_stock is 'Each branch''s share of a tracked product (or combination). The totals stay on products / product_variants.';
create unique index branch_stock_key on public.branch_stock (branch_id, product_id, variant_id) nulls not distinct;
create index branch_stock_product_idx on public.branch_stock (business_id, product_id);
alter table public.branch_stock enable row level security;
-- Everyone in the business can see what the other branches have (to send a customer there); changes go through the functions.
create policy "branch_stock: members read" on public.branch_stock
  for select to authenticated using (public.is_business_member(business_id));
revoke all on public.branch_stock from anon, authenticated;
grant select on public.branch_stock to authenticated;
grant all on public.branch_stock to service_role;

-- Current stock becomes the main branch's.
insert into public.branch_stock (business_id, branch_id, product_id, variant_id, quantity)
select p.business_id, b.id, p.id, null, p.stock_quantity
from public.products p join public.branches b on b.business_id = p.business_id and b.is_main
where p.stock_quantity is not null;
insert into public.branch_stock (business_id, branch_id, product_id, variant_id, quantity)
select v.business_id, b.id, v.product_id, v.id, v.stock_quantity
from public.product_variants v join public.branches b on b.business_id = v.business_id and b.is_main
where v.stock_quantity is not null;

alter table public.stock_movements add column branch_id uuid;
alter table public.stock_movements
  add constraint stock_movements_branch_fkey foreign key (business_id, branch_id) references public.branches (business_id, id) on delete set null (branch_id);
alter table public.stock_movements drop constraint stock_movements_reason_check;
alter table public.stock_movements
  add constraint stock_movements_reason_check check (reason in ('opening', 'purchase', 'sale', 'return', 'damaged', 'lost', 'adjustment', 'transfer'));
comment on column public.stock_movements.branch_id is 'Branch whose stock moved; previous_stock/new_stock are that branch''s. Null: older movements, and tracking turned off (totals).';
update public.stock_movements m set branch_id = b.id
from public.branches b where b.business_id = m.business_id and b.is_main;
create index stock_movements_branch_idx on public.stock_movements (branch_id, created_at desc);

/*
 * Every change of a product's (or combination's) total stock lands in one
 * branch: wazabolt.stock_branch if set (adjust_stock), else the order's branch
 * (sales and returns), else the main branch. The branch must have enough.
 * Logs the movement with the branch's before/after quantities.
 */
create or replace function public.log_stock_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(current_setting('wazabolt.stock_reason', true), '');
  v_order uuid := nullif(current_setting('wazabolt.stock_order', true), '')::uuid;
  v_note text := nullif(current_setting('wazabolt.stock_note', true), '');
  v_branch uuid := nullif(current_setting('wazabolt.stock_branch', true), '')::uuid;
  v_product uuid;
  v_variant uuid;
  v_old integer;
  v_new integer;
  v_change integer;
  v_have integer;
  v_label text;
begin
  if tg_op = 'UPDATE' and old.stock_quantity is not distinct from new.stock_quantity then
    return new;
  end if;
  -- Separate branches: a products row has no product_id field.
  if tg_table_name = 'products' then
    v_product := new.id;
    v_label := new.name;
  else
    v_product := new.product_id;
    v_variant := new.id;
    v_label := (select name from public.products where id = new.product_id) || ' (' || new.name || ': ' || new.value || ')';
  end if;

  if tg_op = 'INSERT' then
    v_old := 0;
    v_reason := coalesce(v_reason, 'opening');
  else
    v_old := coalesce(old.stock_quantity, 0);
    v_reason := coalesce(v_reason, 'adjustment');
  end if;

  -- Tracking turned off: no branch keeps a count any more.
  if tg_op = 'UPDATE' and new.stock_quantity is null then
    delete from public.branch_stock where product_id = v_product and variant_id is not distinct from v_variant;
    if v_old <> 0 then
      insert into public.stock_movements (business_id, product_id, variant_id, reason, quantity_change, previous_stock, new_stock, order_id, note, created_by)
      values (new.business_id, v_product, v_variant, v_reason, -v_old, v_old, 0, v_order, coalesce(v_note, 'stock tracking turned off'), (select auth.uid()));
    end if;
    return new;
  end if;
  if new.stock_quantity is null then
    return new;
  end if;
  v_new := new.stock_quantity;
  -- Tracking turned on: start from nothing in every branch.
  if tg_op = 'UPDATE' and old.stock_quantity is null then
    delete from public.branch_stock where product_id = v_product and variant_id is not distinct from v_variant;
    v_old := 0;
  end if;
  v_change := v_new - v_old;
  if v_change = 0 then
    return new;
  end if;

  if v_branch is null and v_order is not null then
    select branch_id into v_branch from public.orders where id = v_order;
  end if;
  if v_branch is null then
    select id into v_branch from public.branches where business_id = new.business_id and is_main;
  end if;

  select quantity into v_have from public.branch_stock
  where branch_id = v_branch and product_id = v_product and variant_id is not distinct from v_variant
  for update;
  if not found then
    v_have := 0;
    insert into public.branch_stock (business_id, branch_id, product_id, variant_id, quantity)
    values (new.business_id, v_branch, v_product, v_variant, 0);
  end if;
  if v_have + v_change < 0 then
    raise exception 'insufficient stock: %', v_label using errcode = 'WB409';
  end if;
  update public.branch_stock set quantity = v_have + v_change, updated_at = now()
  where branch_id = v_branch and product_id = v_product and variant_id is not distinct from v_variant;

  insert into public.stock_movements (business_id, branch_id, product_id, variant_id, reason, quantity_change, previous_stock, new_stock, order_id, note, created_by)
  values (new.business_id, v_branch, v_product, v_variant, v_reason, v_change, v_have, v_have + v_change, v_order, v_note, (select auth.uid()));
  return new;
end;
$$;

/*
 * Stock in, damaged, lost or counted, for one branch (default: the main
 * branch). The branch's quantity is what is checked and counted; the total
 * follows. Returns the branch's new quantity.
 */
drop function public.adjust_stock(uuid, uuid, text, integer, integer, uuid, text);
create function public.adjust_stock(
  p_business_id uuid, p_product_id uuid, p_reason text, p_quantity integer default null, p_new_stock integer default null,
  p_variant_id uuid default null, p_note text default null, p_branch_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch uuid := p_branch_id;
  v_total integer;
  v_current integer;
  v_change integer;
  v_new integer;
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_reason not in ('opening', 'purchase', 'return', 'damaged', 'lost', 'adjustment') then
    raise exception 'unknown reason' using errcode = '22023';
  end if;
  if (p_quantity is null) = (p_new_stock is null) or (p_new_stock is not null and (p_reason <> 'adjustment' or p_new_stock < 0)) then
    raise exception 'give a quantity, or the counted stock for an adjustment' using errcode = '22023';
  end if;
  if p_quantity is not null and (p_quantity = 0 or abs(p_quantity) > 1000000 or (p_reason <> 'adjustment' and p_quantity < 0)) then
    raise exception 'invalid quantity' using errcode = '22023';
  end if;
  if v_branch is null then
    select id into v_branch from public.branches where business_id = p_business_id and is_main;
  elsif not exists (select 1 from public.branches where id = v_branch and business_id = p_business_id) then
    raise exception 'unknown branch' using errcode = '22023';
  end if;

  if p_variant_id is not null then
    select stock_quantity into v_total from public.product_variants
    where id = p_variant_id and product_id = p_product_id and business_id = p_business_id for update;
  else
    select stock_quantity into v_total from public.products
    where id = p_product_id and business_id = p_business_id for update;
  end if;
  if not found then
    raise exception 'unknown product' using errcode = '22023';
  end if;
  v_current := case when v_total is null then 0 else coalesce((
    select quantity from public.branch_stock
    where branch_id = v_branch and product_id = p_product_id and variant_id is not distinct from p_variant_id
  ), 0) end;
  v_change := case
    when p_new_stock is not null then p_new_stock - v_current
    when p_reason in ('damaged', 'lost') then -p_quantity
    else p_quantity
  end;
  v_new := v_current + v_change;
  if v_new < 0 then
    raise exception 'insufficient stock: only % left', v_current using errcode = 'WB409';
  end if;
  if v_change = 0 then
    return v_new;
  end if;

  perform set_config('wazabolt.stock_reason', p_reason, true);
  perform set_config('wazabolt.stock_order', '', true);
  perform set_config('wazabolt.stock_note', coalesce(left(btrim(p_note), 300), ''), true);
  perform set_config('wazabolt.stock_branch', v_branch::text, true);
  if p_variant_id is not null then
    update public.product_variants set stock_quantity = coalesce(v_total, 0) + v_change where id = p_variant_id;
  else
    update public.products set stock_quantity = coalesce(v_total, 0) + v_change where id = p_product_id;
  end if;
  perform set_config('wazabolt.stock_reason', '', true);
  perform set_config('wazabolt.stock_note', '', true);
  perform set_config('wazabolt.stock_branch', '', true);
  return v_new;
end;
$$;
revoke execute on function public.adjust_stock(uuid, uuid, text, integer, integer, uuid, text, uuid) from public, anon;
grant execute on function public.adjust_stock(uuid, uuid, text, integer, integer, uuid, text, uuid) to authenticated;

/* Move stock from one branch to another (owner or admin). The total doesn't change. */
create function public.transfer_stock(
  p_business_id uuid, p_product_id uuid, p_from uuid, p_to uuid, p_quantity integer,
  p_variant_id uuid default null, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_have integer;
  v_there integer;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 300), '');
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_from = p_to or p_quantity is null or p_quantity < 1 or p_quantity > 1000000 then
    raise exception 'invalid transfer' using errcode = '22023';
  end if;
  if (select count(*) from public.branches where business_id = p_business_id and id in (p_from, p_to)) <> 2
     or not exists (select 1 from public.branches where id = p_to and active) then
    raise exception 'unknown branch' using errcode = '22023';
  end if;
  if p_variant_id is not null then
    perform 1 from public.product_variants where id = p_variant_id and product_id = p_product_id and business_id = p_business_id and stock_quantity is not null for update;
  else
    perform 1 from public.products where id = p_product_id and business_id = p_business_id and stock_quantity is not null for update;
  end if;
  if not found then
    raise exception 'unknown product, or its stock is not tracked' using errcode = '22023';
  end if;

  select quantity into v_have from public.branch_stock
  where branch_id = p_from and product_id = p_product_id and variant_id is not distinct from p_variant_id for update;
  if coalesce(v_have, 0) < p_quantity then
    raise exception 'insufficient stock: only % left', coalesce(v_have, 0) using errcode = 'WB409';
  end if;
  insert into public.branch_stock (business_id, branch_id, product_id, variant_id, quantity)
  values (p_business_id, p_to, p_product_id, p_variant_id, 0)
  on conflict (branch_id, product_id, variant_id) do nothing;
  select quantity into v_there from public.branch_stock
  where branch_id = p_to and product_id = p_product_id and variant_id is not distinct from p_variant_id for update;

  update public.branch_stock set quantity = v_have - p_quantity, updated_at = now()
  where branch_id = p_from and product_id = p_product_id and variant_id is not distinct from p_variant_id;
  update public.branch_stock set quantity = v_there + p_quantity, updated_at = now()
  where branch_id = p_to and product_id = p_product_id and variant_id is not distinct from p_variant_id;
  insert into public.stock_movements (business_id, branch_id, product_id, variant_id, reason, quantity_change, previous_stock, new_stock, note, created_by)
  values (p_business_id, p_from, p_product_id, p_variant_id, 'transfer', -p_quantity, v_have, v_have - p_quantity, v_note, (select auth.uid())),
         (p_business_id, p_to, p_product_id, p_variant_id, 'transfer', p_quantity, v_there, v_there + p_quantity, v_note, (select auth.uid()));
end;
$$;
revoke execute on function public.transfer_stock(uuid, uuid, uuid, uuid, integer, uuid, text) from public, anon;
grant execute on function public.transfer_stock(uuid, uuid, uuid, uuid, integer, uuid, text) to authenticated;

-- ---------------------------------------------------------------- Orders, restaurant tables, expenses
alter table public.orders add column branch_id uuid;
alter table public.orders
  add constraint orders_branch_fkey foreign key (business_id, branch_id) references public.branches (business_id, id);
alter table public.restaurant_tables add column branch_id uuid;
alter table public.restaurant_tables
  add constraint restaurant_tables_branch_fkey foreign key (business_id, branch_id) references public.branches (business_id, id);
alter table public.expenses add column branch_id uuid;
alter table public.expenses
  add constraint expenses_branch_fkey foreign key (business_id, branch_id) references public.branches (business_id, id);
comment on column public.expenses.branch_id is 'Branch the expense is for; null: the whole business.';

-- Existing orders and tables belong to the main branch (without firing the order triggers: nothing else changes).
alter table public.orders disable trigger user;
update public.orders o set branch_id = b.id from public.branches b where b.business_id = o.business_id and b.is_main;
alter table public.orders enable trigger user;
update public.restaurant_tables t set branch_id = b.id from public.branches b where b.business_id = t.business_id and b.is_main;
alter table public.orders alter column branch_id set not null;
alter table public.restaurant_tables alter column branch_id set not null;
create index orders_branch_idx on public.orders (business_id, branch_id, created_at desc);

-- Table names are unique within a branch (every branch can have its "Table 1").
drop index public.restaurant_tables_name_key;
create unique index restaurant_tables_name_key on public.restaurant_tables (business_id, branch_id, lower(btrim(name)));

/*
 * The branch of a new order: the one given, else its table's, else the
 * member's branch, else the main branch. It must be open, and a member tied to
 * a branch can only sell there. An order never changes branch.
 */
create function public.orders_set_branch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table_branch uuid;
begin
  if tg_op = 'UPDATE' then
    new.branch_id := old.branch_id;
    return new;
  end if;
  if new.table_id is not null then
    select branch_id into v_table_branch from public.restaurant_tables where id = new.table_id;
    if new.branch_id is not null and new.branch_id <> v_table_branch then
      raise exception 'this table is in another branch' using errcode = '22023';
    end if;
    new.branch_id := v_table_branch;
  end if;
  new.branch_id := coalesce(new.branch_id, public.current_member_branch(new.business_id),
                            (select id from public.branches where business_id = new.business_id and is_main));
  if not exists (select 1 from public.branches where id = new.branch_id and business_id = new.business_id and active) then
    raise exception 'this branch is closed' using errcode = 'WB453';
  end if;
  if not public.can_use_branch(new.business_id, new.branch_id) then
    raise exception 'not allowed in this branch' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger orders_set_branch before insert or update of branch_id on public.orders
  for each row execute function public.orders_set_branch();

/* New tables and expenses: the member's branch, else the main branch (tables) or the whole business (expenses). */
create function public.set_default_branch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.branch_id is null then
    new.branch_id := public.current_member_branch(new.business_id);
    if new.branch_id is null and tg_table_name = 'restaurant_tables' then
      select id into new.branch_id from public.branches where business_id = new.business_id and is_main;
    end if;
  end if;
  return new;
end;
$$;
create trigger restaurant_tables_default_branch before insert on public.restaurant_tables
  for each row execute function public.set_default_branch();
create trigger expenses_default_branch before insert on public.expenses
  for each row execute function public.set_default_branch();

-- Members tied to a branch only see that branch's orders, bills, tables and stock history.
create policy "orders: own branch" on public.orders
  as restrictive for all to authenticated
  using (public.can_use_branch(business_id, branch_id)) with check (public.can_use_branch(business_id, branch_id));
create policy "order_items: own branch" on public.order_items
  as restrictive for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and public.can_use_branch(o.business_id, o.branch_id)));
create policy "order_payments: own branch" on public.order_payments
  as restrictive for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and public.can_use_branch(o.business_id, o.branch_id)));
create policy "kitchen_tickets: own branch" on public.kitchen_tickets
  as restrictive for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and public.can_use_branch(o.business_id, o.branch_id)));
create policy "restaurant_tables: own branch" on public.restaurant_tables
  as restrictive for all to authenticated
  using (public.can_use_branch(business_id, branch_id)) with check (public.can_use_branch(business_id, branch_id));
create policy "stock_movements: own branch" on public.stock_movements
  as restrictive for select to authenticated
  using (public.can_use_branch(business_id, branch_id));

-- ---------------------------------------------------------------- Extra branches
/* Owner or admin asks for a number of extra branches; WazaBolt approves it once paid (approve_plan_change). */
create function public.request_extra_branches(p_business_id uuid, p_extra integer, p_contact_phone text default null, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_id uuid;
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_sub from public.subscriptions where business_id = p_business_id;
  if (select extra_branch_price from public.plans where id = v_sub.plan_id) is null then
    raise exception 'this plan cannot add branches' using errcode = 'WB454';
  end if;
  if p_extra is null or p_extra < 0 or p_extra > 100 or p_extra = v_sub.extra_branches then
    raise exception 'invalid number of branches' using errcode = '22023';
  end if;
  update public.plan_change_requests set status = 'cancelled', decided_at = now()
  where business_id = p_business_id and status = 'pending';
  insert into public.plan_change_requests (business_id, from_plan_id, to_plan_id, contact_phone, note, requested_by, billing_interval, kind, extra_branches)
  values (p_business_id, v_sub.plan_id, v_sub.plan_id, nullif(left(btrim(coalesce(p_contact_phone, '')), 40), ''), nullif(left(btrim(coalesce(p_note, '')), 500), ''),
          (select auth.uid()), v_sub.billing_interval, 'branches', p_extra)
  returning id into v_id;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, (select auth.uid()), 'plan.branches_requested', 'plan_change_request', v_id::text,
          jsonb_build_object('from', v_sub.extra_branches, 'to', p_extra));
  return v_id;
end;
$$;
revoke execute on function public.request_extra_branches(uuid, integer, text, text) from public, anon;
grant execute on function public.request_extra_branches(uuid, integer, text, text) to authenticated;

-- ---------------------------------------------------------------- Functions that take a branch
-- (generated from their current definitions; only the branch lines are new)
drop function public.create_order(uuid, uuid, jsonb, uuid, numeric, numeric, text, text, text, text, text, uuid, jsonb);
create function public.create_order(p_business_id uuid, p_customer_id uuid, p_items jsonb, p_conversation_id uuid DEFAULT NULL::uuid, p_delivery_fee numeric DEFAULT 0, p_discount numeric DEFAULT 0, p_delivery_address text DEFAULT NULL::text, p_payment_method text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_channel text DEFAULT NULL::text, p_status text DEFAULT 'pending'::text, p_client_key uuid DEFAULT NULL::uuid, p_delivery jsonb DEFAULT NULL::jsonb, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_sku text;
  v_variant_label text;
  v_variant_id uuid;
  v_price numeric(14, 2);
  v_cost numeric(14, 2);
  v_channel text := coalesce(p_channel, case when p_conversation_id is not null then 'whatsapp' else 'manual' end);
  v_delivery jsonb := coalesce(p_delivery, '{}'::jsonb);
begin
  if (select auth.role()) is distinct from 'service_role' and not public.has_min_role(p_business_id, 'agent') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'an order needs between 1 and 100 items' using errcode = '22023';
  end if;
  if p_customer_id is null and v_channel <> 'pos' then
    raise exception 'unknown customer' using errcode = '22023';
  end if;
  if p_customer_id is not null and not exists (select 1 from public.customers where id = p_customer_id and business_id = p_business_id) then
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
  if jsonb_typeof(v_delivery) <> 'object' then
    raise exception 'invalid delivery details' using errcode = '22023';
  end if;

  select currency into v_currency from public.businesses where id = p_business_id;

  insert into public.business_counters (business_id) values (p_business_id) on conflict do nothing;
  update public.business_counters set order_seq = order_seq + 1 where business_id = p_business_id returning order_seq into v_seq;

  insert into public.orders (id, business_id, customer_id, conversation_id, order_number, currency, status,
                             delivery_address, payment_method, notes, created_by, stock_managed, channel, client_key,
                             delivery_method, recipient_name, recipient_phone, pickup_location, delivery_reference, delivery_notes, branch_id)
  values (v_order_id, p_business_id, p_customer_id, p_conversation_id, public.format_reference('ORD', v_seq, 5), v_currency, coalesce(p_status, 'pending'),
          nullif(btrim(p_delivery_address), ''), p_payment_method, nullif(btrim(p_notes), ''), (select auth.uid()), true, v_channel, p_client_key,
          nullif(v_delivery ->> 'method', ''), nullif(btrim(v_delivery ->> 'recipient_name'), ''), nullif(btrim(v_delivery ->> 'recipient_phone'), ''),
          nullif(btrim(v_delivery ->> 'pickup_location'), ''), nullif(btrim(v_delivery ->> 'reference'), ''), nullif(btrim(v_delivery ->> 'notes'), ''), p_branch_id);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item ->> 'quantity')::integer, 1);
    if v_qty < 1 then
      raise exception 'quantity must be at least 1' using errcode = '22023';
    end if;
    v_variant_label := null;
    v_variant_id := null;
    v_cost := null;
    v_sku := null;

    if v_item ? 'product_id' and nullif(v_item ->> 'product_id', '') is not null then
      select * into v_product from public.products
      where id = (v_item ->> 'product_id')::uuid and business_id = p_business_id;
      if not found then
        raise exception 'unknown product' using errcode = '22023';
      end if;
      v_name := v_product.name;
      v_price := v_product.price;
      v_cost := v_product.cost_price;
      v_sku := v_product.sku;
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

    insert into public.order_items (business_id, order_id, product_id, variant_id, product_name, variant, sku, quantity, unit_price, total, unit_cost)
    values (p_business_id, v_order_id, v_product.id, v_variant_id, v_name, v_variant_label, v_sku, v_qty, v_price, v_price * v_qty, v_cost);
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
$function$;
revoke execute on function public.create_order(uuid, uuid, jsonb, uuid, numeric, numeric, text, text, text, text, text, uuid, jsonb, uuid) from public, anon;
grant execute on function public.create_order(uuid, uuid, jsonb, uuid, numeric, numeric, text, text, text, text, text, uuid, jsonb, uuid) to authenticated, service_role;

drop function public.create_sale(uuid, uuid, jsonb, uuid, numeric, jsonb, text);
create function public.create_sale(p_business_id uuid, p_client_key uuid, p_items jsonb, p_customer_id uuid DEFAULT NULL::uuid, p_discount numeric DEFAULT 0, p_payments jsonb DEFAULT '[]'::jsonb, p_notes text DEFAULT NULL::text, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_total numeric(14, 2);
  v_paid numeric(14, 2) := 0;
  v_first text;
  p jsonb;
  v_amount numeric(14, 2);
  v_method text;
begin
  if not public.has_min_role(p_business_id, 'agent') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_client_key is null then
    raise exception 'missing sale key' using errcode = '22023';
  end if;
  select id into v_id from public.orders where business_id = p_business_id and client_key = p_client_key;
  if found then
    return v_id;
  end if;
  if coalesce(p_discount, 0) > 0 and not public.has_min_role(p_business_id, 'admin') then
    raise exception 'discounts need an owner or admin' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) > 5 then
    raise exception 'invalid payments' using errcode = '22023';
  end if;

  v_id := public.create_order(p_business_id, p_customer_id, p_items, null, 0, p_discount, null, null, p_notes, 'pos', 'delivered', p_client_key, null, p_branch_id);
  select total into v_total from public.orders where id = v_id;

  for p in select * from jsonb_array_elements(p_payments) loop
    v_amount := (p ->> 'amount')::numeric;
    v_method := p ->> 'method';
    if v_amount is null or v_amount <= 0 then
      raise exception 'invalid payment amount' using errcode = '22023';
    end if;
    insert into public.order_payments (business_id, order_id, customer_id, amount, method, reference, recorded_by)
    values (p_business_id, v_id, p_customer_id, v_amount, v_method, nullif(btrim(p ->> 'reference'), ''), (select auth.uid()));
    v_paid := v_paid + v_amount;
    v_first := coalesce(v_first, v_method);
  end loop;
  if v_paid > v_total then
    raise exception 'payments are more than the total' using errcode = '22023';
  end if;
  if v_paid < v_total and p_customer_id is null then
    raise exception 'a sale on credit needs a customer' using errcode = '22023';
  end if;
  update public.orders set payment_method = coalesce(v_first, 'credit') where id = v_id;
  return v_id;
end;
$function$;
revoke execute on function public.create_sale(uuid, uuid, jsonb, uuid, numeric, jsonb, text, uuid) from public, anon;
grant execute on function public.create_sale(uuid, uuid, jsonb, uuid, numeric, jsonb, text, uuid) to authenticated;

drop function public.restaurant_open_order(uuid, text, jsonb, uuid, uuid, integer, text, jsonb, numeric, uuid, uuid);
create function public.restaurant_open_order(p_business_id uuid, p_service_type text, p_items jsonb DEFAULT '[]'::jsonb, p_table_id uuid DEFAULT NULL::uuid, p_customer_id uuid DEFAULT NULL::uuid, p_guests integer DEFAULT NULL::integer, p_notes text DEFAULT NULL::text, p_delivery jsonb DEFAULT NULL::jsonb, p_delivery_fee numeric DEFAULT 0, p_conversation_id uuid DEFAULT NULL::uuid, p_client_key uuid DEFAULT NULL::uuid, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order_id uuid := gen_random_uuid();
  v_existing uuid;
  v_seq bigint;
  v_currency char(3);
  v_delivery jsonb := coalesce(p_delivery, '{}'::jsonb);
  v_whatsapp boolean := p_conversation_id is not null;
begin
  if not public._restaurant_writer(p_business_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_client_key is not null then
    select id into v_existing from public.orders where business_id = p_business_id and client_key = p_client_key;
    if found then
      return v_existing;
    end if;
  end if;
  if p_service_type not in ('dine_in', 'takeaway', 'delivery') then
    raise exception 'invalid service type' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or (p_service_type <> 'dine_in' and jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0) then
    raise exception 'an order needs at least one dish' using errcode = '22023';
  end if;
  if p_service_type = 'dine_in' then
    if v_whatsapp then
      raise exception 'dine-in orders are taken at the restaurant' using errcode = '22023';
    end if;
    if p_table_id is null or not exists (select 1 from public.restaurant_tables where id = p_table_id and business_id = p_business_id and active) then
      raise exception 'unknown table' using errcode = '22023';
    end if;
    if exists (select 1 from public.orders where table_id = p_table_id and service_type = 'dine_in' and bill_closed_at is null and status not in ('cancelled', 'returned')) then
      raise exception 'this table already has an open bill' using errcode = '23505';
    end if;
  elsif p_table_id is not null then
    raise exception 'only dine-in orders have a table' using errcode = '22023';
  end if;
  if p_service_type = 'delivery' and p_customer_id is null then
    raise exception 'a delivery needs a customer' using errcode = '22023';
  end if;
  if p_customer_id is not null and not exists (select 1 from public.customers where id = p_customer_id and business_id = p_business_id) then
    raise exception 'unknown customer' using errcode = '22023';
  end if;
  if v_whatsapp and not exists (select 1 from public.conversations where id = p_conversation_id and business_id = p_business_id and customer_id = p_customer_id) then
    raise exception 'unknown conversation' using errcode = '22023';
  end if;
  if coalesce(p_delivery_fee, 0) < 0 or jsonb_typeof(v_delivery) <> 'object' then
    raise exception 'invalid delivery details' using errcode = '22023';
  end if;

  select currency into v_currency from public.businesses where id = p_business_id;
  insert into public.business_counters (business_id) values (p_business_id) on conflict do nothing;
  update public.business_counters set order_seq = order_seq + 1 where business_id = p_business_id returning order_seq into v_seq;

  insert into public.orders (id, business_id, customer_id, conversation_id, order_number, currency, status, notes, created_by,
                             stock_managed, stock_applied, channel, client_key, service_type, table_id, guests, delivery_fee, total,
                             delivery_method, delivery_address, recipient_name, recipient_phone, delivery_notes, branch_id)
  values (v_order_id, p_business_id, p_customer_id, p_conversation_id, public.format_reference('ORD', v_seq, 5), v_currency,
          case when v_whatsapp then 'pending' else 'confirmed' end, nullif(btrim(p_notes), ''), (select auth.uid()),
          true, true, case when v_whatsapp then 'whatsapp' else 'pos' end, p_client_key, p_service_type, p_table_id, p_guests,
          case when p_service_type = 'delivery' then coalesce(p_delivery_fee, 0) else 0 end,
          case when p_service_type = 'delivery' then coalesce(p_delivery_fee, 0) else 0 end,
          case p_service_type when 'delivery' then 'delivery' when 'takeaway' then 'pickup' end,
          nullif(btrim(v_delivery ->> 'address'), ''), nullif(btrim(v_delivery ->> 'recipient_name'), ''),
          nullif(btrim(v_delivery ->> 'recipient_phone'), ''), nullif(btrim(v_delivery ->> 'notes'), ''),
          -- A dine-in bill belongs to its table's branch (orders_set_branch checks the two agree).
          p_branch_id);

  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 0 then
    perform public.restaurant_add_items(p_business_id, v_order_id, p_items, not v_whatsapp);
  else
    perform public._restaurant_totals(v_order_id);
  end if;
  return v_order_id;
end;
$function$;
revoke execute on function public.restaurant_open_order(uuid, text, jsonb, uuid, uuid, integer, text, jsonb, numeric, uuid, uuid, uuid) from public, anon;
grant execute on function public.restaurant_open_order(uuid, text, jsonb, uuid, uuid, integer, text, jsonb, numeric, uuid, uuid, uuid) to authenticated, service_role;

create or replace function public.approve_plan_change(p_request_id uuid, p_amount numeric DEFAULT NULL::numeric, p_method text DEFAULT 'mobile_money'::text, p_reference text DEFAULT NULL::text, p_actor uuid DEFAULT NULL::uuid, p_grace_days integer DEFAULT 3)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_req public.plan_change_requests;
  v_sub public.subscriptions;
  v_start timestamptz := now();
  v_end timestamptz;
begin
  select * into v_req from public.plan_change_requests where id = p_request_id and status = 'pending' for update;
  if not found then
    raise exception 'no pending request with this id' using errcode = '22023';
  end if;
  select * into v_sub from public.subscriptions where business_id = v_req.business_id for update;
  -- Extra branches: the number changes now; the plan and its period stay as they are.
  if v_req.kind = 'branches' then
    update public.subscriptions set extra_branches = v_req.extra_branches, updated_at = now() where business_id = v_req.business_id;
    update public.plan_change_requests set status = 'approved', decided_at = now() where id = p_request_id;
    if p_amount is not null then
      insert into public.subscription_payments (business_id, plan_id, billing_interval, amount, method, reference, request_id, period_start, period_end, recorded_by)
      values (v_req.business_id, v_sub.plan_id, v_sub.billing_interval, p_amount, p_method, nullif(btrim(p_reference), ''), p_request_id, now(), v_sub.current_period_end, p_actor);
    end if;
    insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
    values (v_req.business_id, p_actor, 'plan.branches_changed', 'subscription', v_req.business_id::text,
            jsonb_build_object('from', v_sub.extra_branches, 'to', v_req.extra_branches, 'request', p_request_id, 'amount', p_amount));
    return;
  end if;
  if v_sub.plan_id = v_req.to_plan_id and v_sub.current_period_end > now() - make_interval(days => p_grace_days) then
    v_start := v_sub.current_period_end;
  end if;
  v_end := v_start + case when v_req.billing_interval = 'year' then interval '1 year' else interval '1 month' end;
  update public.subscriptions
  set plan_id = v_req.to_plan_id, billing_interval = v_req.billing_interval, status = 'active',
      current_period_start = v_start, current_period_end = v_end,
      rules_from = least(rules_from, v_start), updated_at = now(),
      -- Extra branches carry over to a plan that sells them; a plan without them has none.
      extra_branches = case when (select extra_branch_price from public.plans where id = v_req.to_plan_id) is null then 0 else extra_branches end
  where business_id = v_req.business_id;
  update public.plan_change_requests set status = 'approved', decided_at = now() where id = p_request_id;
  if p_amount is not null then
    insert into public.subscription_payments (business_id, plan_id, billing_interval, amount, method, reference, request_id, period_start, period_end, recorded_by)
    values (v_req.business_id, v_req.to_plan_id, v_req.billing_interval, p_amount, p_method, nullif(btrim(p_reference), ''), p_request_id, v_start, v_end, p_actor);
  end if;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_req.business_id, p_actor, 'plan.changed', 'subscription', v_req.business_id::text,
          jsonb_build_object('from', v_req.from_plan_id, 'to', v_req.to_plan_id, 'interval', v_req.billing_interval, 'kind', v_req.kind,
                             'request', p_request_id, 'amount', p_amount, 'period_end', v_end));
end;
$function$;

/* The kitchen screen shows one branch's tickets: the cook's own branch, or the branch the screen is opened for. */
drop function public.kitchen_queue(uuid);
create function public.kitchen_queue(p_business_id uuid, p_branch_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_branch uuid := coalesce(public.current_member_branch(p_business_id), p_branch_id);
begin
  if not public.can_use_kitchen(p_business_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'seq', t.seq, 'status', t.status, 'createdAt', t.created_at, 'startedAt', t.started_at, 'readyAt', t.ready_at,
      'orderNumber', o.order_number, 'serviceType', o.service_type, 'table', rt.name,
      'items', (select coalesce(jsonb_agg(jsonb_build_object(
                  'name', i.product_name, 'variant', i.variant, 'quantity', i.quantity,
                  'extras', (select coalesce(jsonb_agg(e ->> 'name'), '[]'::jsonb) from jsonb_array_elements(i.extras) e),
                  'note', i.note) order by i.product_name), '[]'::jsonb)
                from public.order_items i where i.ticket_id = t.id)
    ) order by t.created_at)
    from public.kitchen_tickets t
    join public.orders o on o.id = t.order_id
    left join public.restaurant_tables rt on rt.id = o.table_id
    where t.business_id = p_business_id and t.status in ('new', 'preparing', 'ready')
      and (v_branch is null or o.branch_id = v_branch)
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.kitchen_queue(uuid, uuid) from public, anon;
grant execute on function public.kitchen_queue(uuid, uuid) to authenticated;


-- Reports for one branch (owners and admins; all branches when not given).
drop function public.sales_by_day(uuid, date, date);
create function public.sales_by_day(p_business_id uuid, p_from date, p_to date, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(day date, sales integer, revenue numeric, cogs numeric, items_without_cost integer, discounts numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tz text;
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select timezone into v_tz from public.businesses where id = p_business_id;
  return query
  with o as (
    select o.id, (o.created_at at time zone v_tz)::date as d, o.total, o.discount
    from public.orders o
    where o.business_id = p_business_id and o.status = 'delivered'
      and o.created_at >= (p_from::timestamp at time zone v_tz) and o.created_at < ((p_to + 1)::timestamp at time zone v_tz)
      and (p_branch_id is null or o.branch_id = p_branch_id)
  ), i as (
    select i.order_id, sum(i.quantity * i.unit_cost) as cogs, count(*) filter (where i.unit_cost is null)::int as unknown
    from public.order_items i where i.business_id = p_business_id and i.order_id in (select id from o)
    group by i.order_id
  )
  select o.d, count(*)::int, sum(o.total), coalesce(sum(i.cogs), 0), coalesce(sum(i.unknown), 0)::int, sum(o.discount)
  from o left join i on i.order_id = o.id
  group by o.d order by o.d;
end;
$function$;
revoke execute on function public.sales_by_day(uuid, date, date, uuid) from public, anon;
grant execute on function public.sales_by_day(uuid, date, date, uuid) to authenticated;

drop function public.product_sales(uuid, date, date);
create function public.product_sales(p_business_id uuid, p_from date, p_to date, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(product_id uuid, product_name text, quantity integer, revenue numeric, cogs numeric, items_without_cost integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tz text;
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select timezone into v_tz from public.businesses where id = p_business_id;
  return query
  select i.product_id, min(i.product_name), sum(i.quantity)::int, sum(i.total), coalesce(sum(i.quantity * i.unit_cost), 0),
         (count(*) filter (where i.unit_cost is null))::int
  from public.order_items i
  join public.orders o on o.id = i.order_id and o.business_id = i.business_id
  where i.business_id = p_business_id and o.status = 'delivered'
    and o.created_at >= (p_from::timestamp at time zone v_tz) and o.created_at < ((p_to + 1)::timestamp at time zone v_tz)
      and (p_branch_id is null or o.branch_id = p_branch_id)
  group by i.product_id, case when i.product_id is null then i.product_name end
  order by sum(i.total) desc;
end;
$function$;
revoke execute on function public.product_sales(uuid, date, date, uuid) from public, anon;
grant execute on function public.product_sales(uuid, date, date, uuid) to authenticated;

