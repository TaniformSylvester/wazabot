-- WazaBolt: branches. Every business has a main branch; branches are limited
-- by the plan (Business 2, Pro 5, others 1) plus approved extra branches; each
-- branch has its own stock, sales take stock from their branch, transfers move
-- it; members tied to a branch only see and sell there; a downgrade pauses the
-- newest branches.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/branches.sql
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-a977-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'branch-owner@test.local', '{"business_name":"Awa Styles"}', now(), now()),
  ('00000000-0000-4000-a977-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'branch-cashier@test.local', '{"business_name":"Cashier Own"}', now(), now()),
  ('00000000-0000-4000-a977-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'branch-other@test.local', '{"business_name":"Other Shop"}', now(), now());
create temp table t (k text primary key, v uuid) on commit drop;
grant all on t to authenticated;
insert into t select 'biz', business_id from public.business_members where user_id = '00000000-0000-4000-a977-00000000000a';
insert into t select 'other_biz', business_id from public.business_members where user_id = '00000000-0000-4000-a977-00000000000c';
insert into t select 'main', id from public.branches where business_id = (select v from t where k = 'biz') and is_main;

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.v(k text) returns uuid language sql as $$ select v from t where k = $1 $$;
create function pg_temp.qty(b uuid, p uuid, var uuid default null) returns integer language sql as $$
  select coalesce((select quantity from public.branch_stock where branch_id = b and product_id = p and variant_id is not distinct from var), 0)
$$;
create function pg_temp.total(p uuid) returns integer language sql as $$ select stock_quantity from public.products where id = p $$;

do $$
begin
  if pg_temp.v('main') is null then raise exception 'FAIL: no main branch'; end if;
  if (select count(*) from public.branches where business_id = pg_temp.v('biz')) <> 1 then raise exception 'FAIL: branch count'; end if;
  raise notice 'PASS a new business starts with its main branch';
end $$;

-- ---------------------------------------------------------------- Plan allowance
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a977-00000000000a');
do $$
begin
  insert into public.branches (business_id, name) values (pg_temp.v('biz'), 'Bonamoussadi');
  raise exception 'FAIL: Free business opened a second branch';
exception when sqlstate 'WB452' then
  raise notice 'PASS Free includes one location: a second branch is refused';
end $$;
do $$
begin
  perform public.request_extra_branches(pg_temp.v('biz'), 1);
  raise exception 'FAIL: extra branches on Free';
exception when sqlstate 'WB454' then
  raise notice 'PASS extra branches can only be bought on Business and Pro';
end $$;
reset role;
update public.subscriptions set plan_id = 'business' where business_id = pg_temp.v('biz');
insert into public.business_members (business_id, user_id, role)
values (pg_temp.v('biz'), '00000000-0000-4000-a977-00000000000b', 'agent');
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a977-00000000000a');
do $$
declare
  b uuid;
begin
  insert into public.branches (business_id, name, address, hours) values (pg_temp.v('biz'), 'Bonamoussadi', 'Carrefour Kotto', 'Mon–Sat 8:00–20:00') returning id into b;
  insert into t values ('b2', b);
  begin
    insert into public.branches (business_id, name) values (pg_temp.v('biz'), 'Akwa');
    raise exception 'FAIL: third branch on Business';
  exception when sqlstate 'WB452' then null;
  end;
  raise notice 'PASS Business includes two locations';
end $$;
do $$
declare
  r uuid;
begin
  r := public.request_extra_branches(pg_temp.v('biz'), 1, '677000000');
  insert into t values ('req', r);
  if (select kind || ' ' || extra_branches || ' ' || to_plan_id from public.plan_change_requests where id = r) <> 'branches 1 business' then
    raise exception 'FAIL: request';
  end if;
end $$;
reset role;
select public.approve_plan_change(pg_temp.v('req'), 5000, 'mobile_money', 'MP123');
do $$
begin
  if public.branch_allowance(pg_temp.v('biz')) <> 3 then raise exception 'FAIL: allowance after approval'; end if;
  if (select plan_id || ' ' || extra_branches from public.subscriptions where business_id = pg_temp.v('biz')) <> 'business 1' then raise exception 'FAIL: subscription'; end if;
  if (select amount from public.subscription_payments where request_id = pg_temp.v('req')) <> 5000 then raise exception 'FAIL: payment'; end if;
  insert into public.branches (business_id, name) values (pg_temp.v('biz'), 'Akwa');
  raise notice 'PASS an approved extra branch (5,000 FCFA recorded) opens a third location';
end $$;
delete from public.branches where name = 'Akwa' and business_id = pg_temp.v('biz');

-- ---------------------------------------------------------------- Stock per branch
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a977-00000000000a');
do $$
declare
  p uuid;
begin
  insert into public.products (business_id, name, price, stock_quantity) values (pg_temp.v('biz'), 'Robe Ankara', 15000, 10) returning id into p;
  insert into t values ('p', p);
  if pg_temp.qty(pg_temp.v('main'), p) <> 10 then raise exception 'FAIL: opening stock not in main'; end if;
  perform public.adjust_stock(pg_temp.v('biz'), p, 'purchase', 5, p_branch_id => pg_temp.v('b2'));
  if pg_temp.qty(pg_temp.v('b2'), p) <> 5 or pg_temp.total(p) <> 15 or pg_temp.qty(pg_temp.v('main'), p) <> 10 then raise exception 'FAIL: purchase at branch'; end if;
  perform public.adjust_stock(pg_temp.v('biz'), p, 'adjustment', p_new_stock => 4, p_branch_id => pg_temp.v('b2'));
  if pg_temp.qty(pg_temp.v('b2'), p) <> 4 or pg_temp.total(p) <> 14 then raise exception 'FAIL: count at branch'; end if;
  if (select previous_stock || '>' || new_stock from public.stock_movements where product_id = p and branch_id = pg_temp.v('b2') order by created_at desc, quantity_change limit 1) <> '5>4' then
    raise exception 'FAIL: movement shows the branch quantities';
  end if;
  raise notice 'PASS stock in and counts apply to one branch; the total follows';

  perform public.transfer_stock(pg_temp.v('biz'), p, pg_temp.v('main'), pg_temp.v('b2'), 3, p_note => 'Saturday rush');
  if pg_temp.qty(pg_temp.v('main'), p) <> 7 or pg_temp.qty(pg_temp.v('b2'), p) <> 7 or pg_temp.total(p) <> 14 then raise exception 'FAIL: transfer'; end if;
  if (select count(*) from public.stock_movements where product_id = p and reason = 'transfer') <> 2 then raise exception 'FAIL: transfer movements'; end if;
  begin
    perform public.transfer_stock(pg_temp.v('biz'), p, pg_temp.v('main'), pg_temp.v('b2'), 8);
    raise exception 'FAIL: transferred more than the branch has';
  exception when sqlstate 'WB409' then null;
  end;
  raise notice 'PASS transfers move stock between branches (logged both sides), never more than the branch has';
end $$;

do $$
declare
  o uuid;
begin
  o := public.create_sale(pg_temp.v('biz'), gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id', pg_temp.v('p'), 'quantity', 7)),
                          null, 0, jsonb_build_array(jsonb_build_object('amount', 105000, 'method', 'cash')), null, pg_temp.v('b2'));
  insert into t values ('sale', o);
  if (select branch_id from public.orders where id = o) <> pg_temp.v('b2') then raise exception 'FAIL: sale branch'; end if;
  if pg_temp.qty(pg_temp.v('b2'), pg_temp.v('p')) <> 0 or pg_temp.qty(pg_temp.v('main'), pg_temp.v('p')) <> 7 or pg_temp.total(pg_temp.v('p')) <> 7 then
    raise exception 'FAIL: sale took stock from the wrong branch';
  end if;
  begin
    perform public.create_sale(pg_temp.v('biz'), gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id', pg_temp.v('p'), 'quantity', 1)),
                               null, 0, jsonb_build_array(jsonb_build_object('amount', 15000, 'method', 'cash')), null, pg_temp.v('b2'));
    raise exception 'FAIL: sold at a branch with none left';
  exception when sqlstate 'WB409' then null;
  end;
  raise notice 'PASS a sale takes stock from its branch, and is refused when that branch has none (even if another has)';

  update public.orders set status = 'cancelled' where id = o;
  if pg_temp.qty(pg_temp.v('b2'), pg_temp.v('p')) <> 7 or pg_temp.total(pg_temp.v('p')) <> 14 then raise exception 'FAIL: cancel did not return stock to its branch'; end if;
  raise notice 'PASS cancelling returns the stock to the order''s branch';

  o := public.create_order(pg_temp.v('biz'), null, jsonb_build_array(jsonb_build_object('product_id', pg_temp.v('p'), 'quantity', 1)), p_channel => 'pos');
  if (select branch_id from public.orders where id = o) <> pg_temp.v('main') then raise exception 'FAIL: default branch is main'; end if;
  raise notice 'PASS an order without a branch goes to the main branch';
end $$;

-- Combinations have their own count per branch.
do $$
declare
  v uuid;
begin
  insert into public.product_variants (business_id, product_id, name, value, stock_quantity) values (pg_temp.v('biz'), pg_temp.v('p'), 'Size', 'M', 4) returning id into v;
  insert into t values ('var', v);
  perform public.transfer_stock(pg_temp.v('biz'), pg_temp.v('p'), pg_temp.v('main'), pg_temp.v('b2'), 1, v);
  if pg_temp.qty(pg_temp.v('main'), pg_temp.v('p'), v) <> 3 or pg_temp.qty(pg_temp.v('b2'), pg_temp.v('p'), v) <> 1 then raise exception 'FAIL: variant per branch'; end if;
  begin
    perform public.create_sale(pg_temp.v('biz'), gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id', pg_temp.v('p'), 'variant_id', v, 'quantity', 2)),
                               null, 0, jsonb_build_array(jsonb_build_object('amount', 30000, 'method', 'cash')), null, pg_temp.v('b2'));
    raise exception 'FAIL: variant oversold at branch';
  exception when sqlstate 'WB409' then null;
  end;
  update public.product_variants set stock_quantity = null where id = v;
  if exists (select 1 from public.branch_stock where variant_id = v) then raise exception 'FAIL: tracking off kept branch counts'; end if;
  raise notice 'PASS combinations are counted per branch too; turning tracking off clears the branch counts';
end $$;

-- ---------------------------------------------------------------- A cashier tied to a branch
do $$
begin
  perform public.set_member_branch(pg_temp.v('biz'), '00000000-0000-4000-a977-00000000000a', pg_temp.v('b2'));
  raise exception 'FAIL: owner tied to a branch';
exception when invalid_parameter_value then null;
end $$;
select public.set_member_branch(pg_temp.v('biz'), '00000000-0000-4000-a977-00000000000b', pg_temp.v('b2'));

select pg_temp.as_user('00000000-0000-4000-a977-00000000000b');
do $$
declare
  o uuid;
begin
  if exists (select 1 from public.orders where business_id = pg_temp.v('biz') and branch_id <> pg_temp.v('b2')) then
    raise exception 'FAIL: cashier sees another branch''s orders';
  end if;
  if not exists (select 1 from public.orders where id = pg_temp.v('sale')) then raise exception 'FAIL: cashier does not see own branch'; end if;
  if exists (select 1 from public.stock_movements where business_id = pg_temp.v('biz') and branch_id = pg_temp.v('main')) then raise exception 'FAIL: other branch history visible'; end if;
  if pg_temp.qty(pg_temp.v('main'), pg_temp.v('p')) <> 6 then raise exception 'FAIL: cashier should see other branches'' stock'; end if;
  o := public.create_sale(pg_temp.v('biz'), gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id', pg_temp.v('p'), 'quantity', 1)),
                          null, 0, jsonb_build_array(jsonb_build_object('amount', 15000, 'method', 'cash')));
  if (select branch_id from public.orders where id = o) <> pg_temp.v('b2') then raise exception 'FAIL: cashier sale not in own branch'; end if;
  begin
    perform public.create_sale(pg_temp.v('biz'), gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id', pg_temp.v('p'), 'quantity', 1)),
                               null, 0, jsonb_build_array(jsonb_build_object('amount', 15000, 'method', 'cash')), null, pg_temp.v('main'));
    raise exception 'FAIL: cashier sold in another branch';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS a cashier tied to a branch sees and sells only there (and can see other branches'' stock)';
end $$;

select pg_temp.as_user('00000000-0000-4000-a977-00000000000a');
do $$
begin
  if (select count(distinct branch_id) from public.orders where business_id = pg_temp.v('biz')) <> 2 then raise exception 'FAIL: owner sees every branch'; end if;
  perform public.update_member_role(pg_temp.v('biz'), '00000000-0000-4000-a977-00000000000b', 'admin');
end $$;
reset role;
do $$
begin
  if (select branch_id from public.business_members where user_id = '00000000-0000-4000-a977-00000000000b' and business_id = pg_temp.v('biz')) is not null then
    raise exception 'FAIL: admin kept a branch';
  end if;
  raise notice 'PASS owners see every branch; becoming an admin unties a member from their branch';
end $$;

-- Reports per branch.
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a977-00000000000a');
do $$
declare
  all_sales integer;
  b2_sales integer;
  main_sales integer;
begin
  select coalesce(sum(sales), 0) into all_sales from public.sales_by_day(pg_temp.v('biz'), current_date - 1, current_date + 1);
  select coalesce(sum(sales), 0) into b2_sales from public.sales_by_day(pg_temp.v('biz'), current_date - 1, current_date + 1, pg_temp.v('b2'));
  select coalesce(sum(sales), 0) into main_sales from public.sales_by_day(pg_temp.v('biz'), current_date - 1, current_date + 1, pg_temp.v('main'));
  if b2_sales + main_sales <> all_sales or all_sales = 0 then raise exception 'FAIL: reports per branch (% = % + %)', all_sales, b2_sales, main_sales; end if;
  raise notice 'PASS reports can be filtered by branch (the branches add up to the whole)';
end $$;

reset role;

-- ---------------------------------------------------------------- Restaurant tables
do $$
declare
  t1 uuid;
  t2 uuid;
  o uuid;
begin
  insert into public.restaurant_tables (business_id, name) values (pg_temp.v('biz'), 'Table 1') returning id into t1;
  insert into public.restaurant_tables (business_id, name, branch_id) values (pg_temp.v('biz'), 'Table 1', pg_temp.v('b2')) returning id into t2;
  if (select branch_id from public.restaurant_tables where id = t1) <> pg_temp.v('main') then raise exception 'FAIL: table default branch'; end if;
  insert into public.orders (business_id, order_number, service_type, table_id) values (pg_temp.v('biz'), 'T-1', 'dine_in', t2) returning id into o;
  if (select branch_id from public.orders where id = o) <> pg_temp.v('b2') then raise exception 'FAIL: dine-in branch from table'; end if;
  begin
    insert into public.orders (business_id, order_number, service_type, table_id, branch_id) values (pg_temp.v('biz'), 'T-2', 'dine_in', t1, pg_temp.v('b2'));
    raise exception 'FAIL: table in another branch';
  exception when invalid_parameter_value then null;
  end;
  update public.orders set branch_id = pg_temp.v('main') where id = o;
  if (select branch_id from public.orders where id = o) <> pg_temp.v('b2') then raise exception 'FAIL: order changed branch'; end if;
  raise notice 'PASS each branch has its own tables (same names allowed); a bill follows its table and never changes branch';
end $$;

-- ---------------------------------------------------------------- Downgrade pauses the newest branches
update public.subscriptions set plan_id = 'starter' where business_id = pg_temp.v('biz');
do $$
begin
  if (select extra_branches from public.subscriptions where business_id = pg_temp.v('biz')) <> 1 then null; end if;
  if (select active from public.branches where id = pg_temp.v('b2')) then raise exception 'FAIL: branch still open on Starter'; end if;
  if not (select active from public.branches where id = pg_temp.v('main')) then raise exception 'FAIL: main closed'; end if;
  begin
    perform public.create_order(pg_temp.v('biz'), null, jsonb_build_array(jsonb_build_object('name', 'Service', 'unit_price', 1000)), p_channel => 'pos', p_branch_id => pg_temp.v('b2'));
    raise exception 'FAIL: sold in a paused branch';
  exception when sqlstate 'WB453' then null;
  end;
  begin
    update public.branches set active = false where id = pg_temp.v('main');
    raise exception 'FAIL: main branch closed';
  exception when invalid_parameter_value then null;
  end;
  if pg_temp.qty(pg_temp.v('b2'), pg_temp.v('p')) <> 6 then raise exception 'FAIL: paused branch lost its stock'; end if;
  raise notice 'PASS moving to a plan with fewer locations pauses the newest branches (stock kept, no sales); the main branch never closes';
end $$;

-- A plan change approval drops extra branches when the new plan has none.
do $$
declare
  r uuid;
begin
  update public.subscriptions set plan_id = 'business', extra_branches = 1 where business_id = pg_temp.v('biz');
  insert into public.plan_change_requests (business_id, from_plan_id, to_plan_id, kind) values (pg_temp.v('biz'), 'business', 'starter', 'change') returning id into r;
  perform public.approve_plan_change(r);
  if (select extra_branches from public.subscriptions where business_id = pg_temp.v('biz')) <> 0 then raise exception 'FAIL: extra branches kept on Starter'; end if;
  raise notice 'PASS a plan without extra branches resets them to none';
end $$;

-- Kitchen staff read their business's branches (the kitchen screen needs its branch).
reset role;
insert into public.business_members (business_id, user_id, role) values (pg_temp.v('other_biz'), '00000000-0000-4000-a977-00000000000a', 'kitchen');
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a977-00000000000a');
do $$
begin
  if not exists (select 1 from public.branches where business_id = pg_temp.v('other_biz') and is_main) then raise exception 'FAIL: kitchen staff can''t read branches'; end if;
  raise notice 'PASS kitchen staff can read their branches';
end $$;
reset role;
delete from public.business_members where business_id = pg_temp.v('other_biz') and user_id = '00000000-0000-4000-a977-00000000000a';

-- Strangers see nothing.
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a977-00000000000c');
do $$
begin
  if exists (select 1 from public.branches where business_id = pg_temp.v('biz')) or exists (select 1 from public.branch_stock where business_id = pg_temp.v('biz')) then
    raise exception 'FAIL: another business sees the branches';
  end if;
  begin
    perform public.transfer_stock(pg_temp.v('biz'), pg_temp.v('p'), pg_temp.v('main'), pg_temp.v('b2'), 1);
    raise exception 'FAIL: stranger transferred';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS other businesses can''t see or move another business''s branches and stock';
end $$;
reset role;

rollback;
