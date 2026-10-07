-- WazaBolt V2 tests: stock ledger, POS sales, payments and credit, expenses, reports, isolation.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pos_inventory.sql
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-a920-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pos-owner@test.local', '{"business_name":"MJ Test"}', now(), now()),
  ('00000000-0000-4000-a920-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pos-cashier@test.local', '{"business_name":"Cashier Own"}', now(), now()),
  ('00000000-0000-4000-a920-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pos-other@test.local', '{"business_name":"Other Shop"}', now(), now());
create temp table ids on commit drop as
select (select business_id from public.business_members where user_id = '00000000-0000-4000-a920-00000000000a') as biz,
       (select business_id from public.business_members where user_id = '00000000-0000-4000-a920-00000000000c') as other;
-- The cashier also works for MJ Test (role agent).
insert into public.business_members (business_id, user_id, role) select biz, '00000000-0000-4000-a920-00000000000b', 'agent' from ids;
create temp table t (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated, service_role;
grant all on t to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Owner: products, stock, sales, credit, expenses
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a920-00000000000a","role":"authenticated"}', true);
do $$
declare
  b uuid := (select biz from ids);
  p uuid;
  j uuid;
  c uuid;
  s uuid;
  s2 uuid;
  v int;
begin
  insert into public.products (business_id, name, price, cost_price, stock_quantity, low_stock_threshold, unit)
  values (b, 'T-Shirt', 8000, 4500, 10, 3, 'piece') returning id into p;
  insert into public.products (business_id, name, price, cost_price, stock_quantity) values (b, 'Jeans', 18000, 11000, 4) returning id into j;
  insert into t values ('tshirt', p), ('jeans', j);
  if (select reason || ' ' || quantity_change || ' ' || new_stock from public.stock_movements where product_id = p) <> 'opening 10 10' then raise exception 'FAIL: opening stock recorded'; end if;
  raise notice 'PASS a new product''s stock is recorded as opening stock';

  v := public.adjust_stock(b, p, 'purchase', 5);
  v := public.adjust_stock(b, p, 'damaged', 1, null, null, 'torn');
  if v <> 14 then raise exception 'FAIL: 10 + 5 - 1 = 14 (got %)', v; end if;
  v := public.adjust_stock(b, p, 'adjustment', null, 12);
  if v <> 12 or (select quantity_change from public.stock_movements where product_id = p order by created_at desc, id limit 1) is null then raise exception 'FAIL: counted stock'; end if;
  if (select string_agg(reason || ':' || quantity_change, ',' order by created_at, quantity_change desc) from public.stock_movements where product_id = p) <> 'opening:10,purchase:5,damaged:-1,adjustment:-2' then
    raise exception 'FAIL: ledger %', (select string_agg(reason || ':' || quantity_change, ',' order by created_at) from public.stock_movements where product_id = p);
  end if;
  if (select sum(quantity_change) from public.stock_movements where product_id = p) <> (select stock_quantity from public.products where id = p) then raise exception 'FAIL: ledger adds up to the stock'; end if;
  begin
    perform public.adjust_stock(b, p, 'lost', 50);
    raise exception 'FAIL: stock below zero';
  exception when sqlstate 'WB409' then null;
  end;
  begin
    perform public.adjust_stock(b, p, 'purchase', -3);
    raise exception 'FAIL: negative purchase';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'PASS every stock change has a reason, the ledger adds up and stock never goes negative';

  insert into public.customers (business_id, whatsapp_phone, name) values (b, '237670100001', 'Client Test') returning id into c;
  insert into t values ('customer', c);

  -- Cash sale: 2 T-shirts.
  s := public.create_sale(b, '11111111-0000-4000-8000-000000000001', jsonb_build_array(jsonb_build_object('product_id', p, 'quantity', 2)), c, 0,
                          '[{"method":"cash","amount":16000}]'::jsonb);
  if (select stock_quantity from public.products where id = p) <> 10 then raise exception 'FAIL: stock 12 - 2 = 10'; end if;
  if (select status || ' ' || channel || ' ' || payment_status || ' ' || payment_method || ' ' || total::int || ' ' || amount_paid::int from public.orders where id = s) <> 'delivered pos paid cash 16000 16000' then
    raise exception 'FAIL: cash sale %', (select row(status, channel, payment_status, payment_method, total, amount_paid) from public.orders where id = s);
  end if;
  if (select reason || ' ' || quantity_change from public.stock_movements where order_id = s) <> 'sale -2' then raise exception 'FAIL: sale movement'; end if;
  if (select unit_cost from public.order_item_costs(b, array[s])) <> 4500 then raise exception 'FAIL: cost at the time of sale'; end if;
  if (select cost_price from public.product_costs(b, array[p])) <> 4500 then raise exception 'FAIL: owner reads cost prices'; end if;
  -- The same sale submitted twice.
  s2 := public.create_sale(b, '11111111-0000-4000-8000-000000000001', jsonb_build_array(jsonb_build_object('product_id', p, 'quantity', 2)), c, 0,
                           '[{"method":"cash","amount":16000}]'::jsonb);
  if s2 <> s or (select stock_quantity from public.products where id = p) <> 10 or (select count(*) from public.order_payments where order_id = s) <> 1 then
    raise exception 'FAIL: a double submission must not create a second sale';
  end if;
  raise notice 'PASS a cash sale records items, payment, cost and a stock movement in one go; submitting it twice changes nothing';

  -- MoMo sale with a reference.
  s := public.create_sale(b, '11111111-0000-4000-8000-000000000002', jsonb_build_array(jsonb_build_object('product_id', j, 'quantity', 1)), null, 0,
                          '[{"method":"mtn_momo","amount":18000,"reference":"MP261007.1200.A1"}]'::jsonb);
  if (select method || ' ' || reference from public.order_payments where order_id = s) <> 'mtn_momo MP261007.1200.A1' then raise exception 'FAIL: momo reference'; end if;
  raise notice 'PASS a walk-in MTN MoMo sale keeps the method and reference';

  -- Not enough stock: nothing happens at all.
  begin
    perform public.create_sale(b, '11111111-0000-4000-8000-000000000003', jsonb_build_array(jsonb_build_object('product_id', p, 'quantity', 1), jsonb_build_object('product_id', j, 'quantity', 9)), c, 0, '[]'::jsonb);
    raise exception 'FAIL: oversold';
  exception when sqlstate 'WB409' then null;
  end;
  if (select stock_quantity from public.products where id = p) <> 10 or exists (select 1 from public.orders where client_key = '11111111-0000-4000-8000-000000000003') then
    raise exception 'FAIL: a failed sale must not touch stock';
  end if;
  raise notice 'PASS a sale that can''t be fulfilled leaves no order, no payment and no stock change';

  -- Credit: 3 T-shirts (24,000), 10,000 paid now.
  begin
    perform public.create_sale(b, '11111111-0000-4000-8000-000000000004', jsonb_build_array(jsonb_build_object('product_id', p, 'quantity', 3)), null, 0, '[{"method":"cash","amount":10000}]'::jsonb);
    raise exception 'FAIL: credit without a customer';
  exception when invalid_parameter_value then null;
  end;
  s := public.create_sale(b, '11111111-0000-4000-8000-000000000005', jsonb_build_array(jsonb_build_object('product_id', p, 'quantity', 3)), c, 0, '[{"method":"cash","amount":10000}]'::jsonb);
  if (select payment_status from public.orders where id = s) <> 'partial' then raise exception 'FAIL: partial'; end if;
  if (select outstanding from public.customer_stats where customer_id = c) <> 14000 then raise exception 'FAIL: outstanding 14,000'; end if;
  -- A second credit sale, nothing paid: 1 jeans.
  s2 := public.create_sale(b, '11111111-0000-4000-8000-000000000006', jsonb_build_array(jsonb_build_object('product_id', j, 'quantity', 1)), c, 0, '[]'::jsonb);
  if (select payment_method || ' ' || payment_status from public.orders where id = s2) <> 'credit unpaid' then raise exception 'FAIL: credit sale'; end if;
  if (select orders_count || ' ' || total_spent::int || ' ' || amount_paid::int || ' ' || outstanding::int from public.customer_stats where customer_id = c) <> '3 58000 26000 32000' then
    raise exception 'FAIL: customer totals %', (select row(orders_count, total_spent, amount_paid, outstanding) from public.customer_stats where customer_id = c);
  end if;
  raise notice 'PASS sales on credit need a customer; the customer''s totals and balance follow their sales';

  -- The customer pays 20,000: the oldest sale is settled first.
  begin
    perform public.record_customer_payment(b, c, 40000, 'cash');
    raise exception 'FAIL: more than owed';
  exception when invalid_parameter_value then null;
  end;
  perform public.record_customer_payment(b, c, 20000, 'orange_money', 'OM-1', '22222222-0000-4000-8000-000000000001');
  perform public.record_customer_payment(b, c, 20000, 'orange_money', 'OM-1', '22222222-0000-4000-8000-000000000001');
  if (select payment_status from public.orders where id = s) <> 'paid' or (select amount_paid from public.orders where id = s2) <> 6000 then raise exception 'FAIL: oldest first'; end if;
  if (select outstanding from public.customer_stats where customer_id = c) <> 12000 then raise exception 'FAIL: balance 32,000 - 20,000'; end if;
  raise notice 'PASS a customer payment settles the oldest sales first, can''t exceed the balance and isn''t recorded twice';

  insert into public.expenses (business_id, category, amount, description, payment_method) values (b, 'rent', 50000, 'October rent', 'cash');
  raise notice 'PASS owners record expenses';

  -- Reports: today 4 sales.
  if (select sales || ' ' || revenue::int || ' ' || cogs::int from public.sales_by_day(b, current_date - 1, current_date + 1)) <> '4 76000 44500' then
    raise exception 'FAIL: report %', (select row(sales, revenue, cogs) from public.sales_by_day(b, current_date - 1, current_date + 1));
  end if;
  if (select quantity || ' ' || revenue::int from public.product_sales(b, current_date - 1, current_date + 1) where product_name = 'T-Shirt') <> '5 40000' then raise exception 'FAIL: product report'; end if;
  raise notice 'PASS reports: revenue and cost of goods from the sales';

  begin
    delete from public.products where id = j;
    raise exception 'FAIL: deleted a product with sales';
  exception when sqlstate 'WB410' then null;
  end;
  update public.products set active = false where id = j;
  raise notice 'PASS a product with sales can be archived, not deleted';

  begin
    update public.orders set payment_status = 'paid' where id = s2;
    raise exception 'FAIL: payment status set by hand';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS payment status follows recorded payments only';
end $$;

do $$
begin
  update public.businesses set receipt_footer = 'Merci !' where id = (select biz from ids);
  if (select receipt_footer from public.businesses where id = (select biz from ids)) is distinct from 'Merci !' then
    raise exception 'FAIL: owner can''t set the receipt footer';
  end if;
  raise notice 'PASS owners set the receipt footer';
end $$;

-- Several products and quantities, an owner's discount, split Orange Money + bank transfer;
-- prices always come from the catalog, never from what the screen sends.
do $$
declare
  b uuid := (select biz from ids);
  p1 uuid;
  p2 uuid;
  s uuid;
  before1 int;
  before2 int;
begin
  insert into public.products (business_id, name, price, cost_price, currency, stock_quantity) values (b, 'Polo', 12000, 7000, 'XAF', 20) returning id into p1;
  insert into public.products (business_id, name, price, cost_price, currency, stock_quantity) values (b, 'Cap', 5000, 2500, 'XAF', 20) returning id into p2;
  select stock_quantity into before1 from public.products where id = p1;
  select stock_quantity into before2 from public.products where id = p2;
  -- 3 × 12,000 + 2 × 5,000 = 46,000 − 2,000 discount = 44,000 (the 1 FCFA "unit_price" is ignored).
  s := public.create_sale(b, gen_random_uuid(),
         jsonb_build_array(jsonb_build_object('product_id', p1, 'quantity', 3, 'unit_price', 1), jsonb_build_object('product_id', p2, 'quantity', 2)),
         null, 2000,
         jsonb_build_array(jsonb_build_object('amount', 30000, 'method', 'orange_money', 'reference', 'OM-77'),
                           jsonb_build_object('amount', 14000, 'method', 'bank_transfer', 'reference', 'BT-12')));
  if (select total from public.orders where id = s) <> 44000 or (select payment_status from public.orders where id = s) <> 'paid' then
    raise exception 'FAIL: multi-item discounted sale total %', (select total from public.orders where id = s);
  end if;
  if (select string_agg(method || ':' || amount::int || ':' || reference, ',' order by amount desc) from public.order_payments where order_id = s) <> 'orange_money:30000:OM-77,bank_transfer:14000:BT-12' then
    raise exception 'FAIL: split payment records';
  end if;
  if (select stock_quantity from public.products where id = p1) <> before1 - 3 or (select stock_quantity from public.products where id = p2) <> before2 - 2 then
    raise exception 'FAIL: stock after a multi-item sale';
  end if;
  if (select count(*) from public.stock_movements where order_id = s and reason = 'sale') <> 2 then raise exception 'FAIL: one movement per item'; end if;
  -- Paying more than the total is refused and leaves nothing behind.
  begin
    perform public.create_sale(b, gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id', p2, 'quantity', 1)), null, 0,
                               jsonb_build_array(jsonb_build_object('amount', 6000, 'method', 'cash')));
    raise exception 'FAIL: overpayment accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  if (select stock_quantity from public.products where id = p2) <> before2 - 2 then raise exception 'FAIL: a refused sale changed stock'; end if;
  raise notice 'PASS several products and quantities, owner discount, Orange Money + bank transfer; prices from the catalog; a refused sale leaves no trace';
end $$;

-- The credit example from the V2 brief, then several credit sales and payments down to zero.
do $$
declare
  b uuid := (select biz from ids);
  p uuid;
  c uuid;
  s1 uuid;
  s2 uuid;
  owed numeric;
begin
  insert into public.products (business_id, name, price, cost_price, currency, stock_quantity)
  values (b, 'Sewing machine', 50000, 30000, 'XAF', 10) returning id into p;
  insert into public.customers (business_id, name, whatsapp_phone) values (b, 'Credit Example', '237000000901') returning id into c;

  -- Sale 100,000, paid 40,000 now → owes 60,000.
  s1 := public.create_sale(b, gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id', p, 'quantity', 2)), c, 0,
                           jsonb_build_array(jsonb_build_object('amount', 40000, 'method', 'cash')));
  select outstanding into owed from public.customer_stats where customer_id = c;
  if owed <> 60000 or (select payment_status from public.orders where id = s1) <> 'partial' then raise exception 'FAIL: 100,000 − 40,000 should leave 60,000 (got %)', owed; end if;

  -- Customer pays 25,000 → owes 35,000.
  perform public.record_customer_payment(b, c, 25000, 'orange_money', 'OM-1', gen_random_uuid());
  select outstanding into owed from public.customer_stats where customer_id = c;
  if owed <> 35000 then raise exception 'FAIL: 60,000 − 25,000 should leave 35,000 (got %)', owed; end if;

  -- A second sale fully on credit (50,000) → owes 85,000 over two sales.
  s2 := public.create_sale(b, gen_random_uuid(), jsonb_build_array(jsonb_build_object('product_id', p, 'quantity', 1)), c, 0, '[]'::jsonb);
  select outstanding into owed from public.customer_stats where customer_id = c;
  if owed <> 85000 or (select payment_status from public.orders where id = s2) <> 'unpaid' then raise exception 'FAIL: second credit sale (got %)', owed; end if;

  -- 45,000 settles the first sale (35,000) and 10,000 of the second; then 40,000 clears everything.
  perform public.record_customer_payment(b, c, 45000, 'mtn_momo', 'MOMO-1', gen_random_uuid());
  if (select payment_status from public.orders where id = s1) <> 'paid' or (select amount_paid from public.orders where id = s2) <> 10000 then
    raise exception 'FAIL: a payment covering two sales';
  end if;
  perform public.record_customer_payment(b, c, 40000, 'bank_transfer', 'BANK-1', gen_random_uuid());
  select outstanding into owed from public.customer_stats where customer_id = c;
  if owed <> 0 or (select payment_status from public.orders where id = s2) <> 'paid' then raise exception 'FAIL: balance should be zero (got %)', owed; end if;

  -- Nothing more can be taken once the balance is zero.
  begin
    perform public.record_customer_payment(b, c, 1000, 'cash', null, gen_random_uuid());
    raise exception 'FAIL: payment accepted with nothing owed';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  -- The balance comes from the records: total of the sales minus the payments recorded.
  if (select sum(amount) from public.order_payments where customer_id = c) <> 150000 then raise exception 'FAIL: payment records'; end if;
  raise notice 'PASS credit: 100,000 − 40,000 = 60,000; − 25,000 = 35,000; more credit and payments across sales down to zero, all from the records';
end $$;

-- ---------------------------------------------------------------------------
-- Cashier (agent): sells and takes payments; no stock adjustments, discounts, expenses or reports
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a920-00000000000b","role":"authenticated"}', true);
do $$
declare
  b uuid := (select biz from ids);
  p uuid := (select v from t where k = 'tshirt');
begin
  perform public.create_sale(b, '11111111-0000-4000-8000-000000000010', jsonb_build_array(jsonb_build_object('product_id', p, 'quantity', 1)), null, 0, '[{"method":"cash","amount":8000}]'::jsonb);
  begin
    perform public.create_sale(b, '11111111-0000-4000-8000-000000000011', jsonb_build_array(jsonb_build_object('product_id', p, 'quantity', 1)), null, 1000, '[{"method":"cash","amount":7000}]'::jsonb);
    raise exception 'FAIL: cashier discount';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.adjust_stock(b, p, 'purchase', 5);
    raise exception 'FAIL: cashier adjusts stock';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.sales_by_day(b, current_date, current_date);
    raise exception 'FAIL: cashier sees profit reports';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.expenses) then raise exception 'FAIL: cashier reads expenses'; end if;
  begin
    insert into public.expenses (business_id, category, amount) values (b, 'other', 100);
    raise exception 'FAIL: cashier adds expenses';
  exception when insufficient_privilege then null;
  end;
  perform public.record_customer_payment(b, (select v from t where k = 'customer'), 2000, 'cash');
  raise notice 'PASS cashiers sell and take payments, but can''t give discounts, adjust stock or see expenses and profit';
end $$;

do $$
begin
  update public.businesses set receipt_footer = 'changed by a cashier' where id = (select biz from ids);
  if (select receipt_footer from public.businesses where id = (select biz from ids)) <> 'Merci !' then
    raise exception 'FAIL: a cashier changed the receipt footer';
  end if;
  raise notice 'PASS cashiers can''t change business settings';
end $$;

do $$
declare
  b uuid := (select biz from ids);
begin
  begin
    perform cost_price from public.products where business_id = b;
    raise exception 'FAIL: cashier reads products.cost_price';
  exception when insufficient_privilege then null;
  end;
  begin
    perform unit_cost from public.order_items where business_id = b;
    raise exception 'FAIL: cashier reads order_items.unit_cost';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.product_costs(b);
    raise exception 'FAIL: cashier calls product_costs';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.order_item_costs(b, array(select id from public.orders where business_id = b));
    raise exception 'FAIL: cashier calls order_item_costs';
  exception when insufficient_privilege then null;
  end;
  if not exists (select 1 from public.products where business_id = b and name = 'T-Shirt' and price = 8000) then
    raise exception 'FAIL: cashier can''t read the catalog';
  end if;
  raise notice 'PASS cost prices are private to owners and admins, enforced by the database';
end $$;

-- ---------------------------------------------------------------------------
-- Another business: sees nothing of MJ Test
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a920-00000000000c","role":"authenticated"}', true);
do $$
declare
  b uuid := (select biz from ids);
begin
  if exists (select 1 from public.stock_movements) or exists (select 1 from public.order_payments) or exists (select 1 from public.customer_stats)
     or exists (select 1 from public.expenses) or exists (select 1 from public.orders where business_id = b) then
    raise exception 'FAIL: another business sees MJ Test data';
  end if;
  begin
    perform public.create_sale(b, '11111111-0000-4000-8000-000000000020', jsonb_build_array(jsonb_build_object('product_id', (select v from t where k = 'tshirt'), 'quantity', 1)), null, 0, '[]'::jsonb);
    raise exception 'FAIL: sold in another business';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_customer_payment(b, (select v from t where k = 'customer'), 1000, 'cash');
    raise exception 'FAIL: paid in another business';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.product_sales(b, current_date, current_date);
    raise exception 'FAIL: read another business''s reports';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS businesses are isolated: no stock, sales, payments, customers, expenses or reports of another business';
end $$;

rollback;
