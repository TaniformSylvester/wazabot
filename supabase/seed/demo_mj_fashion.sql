-- =============================================================================
-- WazaBolt demo data: "MJ Fashion Cameroon" (a FICTIONAL clothing shop)
-- =============================================================================
-- Creates a NEW business owned by an existing WazaBolt account, with products,
-- customers, a month of sales (cash, MTN MoMo, Orange Money, credit), customer
-- payments, stock movements and expenses. It never touches other businesses.
--
-- Everything is invented for demonstrations: customer names are made up and
-- phone numbers use the 2370000… range, which is not a valid Cameroonian number.
-- Cost prices and stock levels are demo figures, not market data.
--
-- How to run (Supabase → SQL Editor):
--   1. Sign up in WazaBolt with the account that should own the demo shop.
--   2. Replace the email on the line marked  >>> OWNER EMAIL <<<  below.
--   3. Run the whole script. Running it again does nothing if the demo exists.
--   4. In WazaBolt, use the business switcher (top bar) to open the demo shop.
--
-- To RESET the demo (e.g. after a presentation): set v_reset to true on the
-- line marked  >>> RESET <<<  and run again. It deletes only this account's
-- demo shop — recognised by its demo marker, never by name alone — and builds
-- it again with fresh dates. Real businesses, even one called "MJ Fashion
-- Cameroon", are never touched.
-- To remove it for good: set v_reset to true and v_rebuild to false.
--
-- Sales go through the same database functions as the app (create_sale,
-- record_customer_payment, adjust_stock), so totals, stock, payments and
-- credit are consistent; only their dates are moved back afterwards.
-- =============================================================================
do $$
declare
  v_email text := 'owner@example.com';  -- >>> OWNER EMAIL <<<
  v_reset boolean := false;              -- >>> RESET <<< true: delete this account's demo shop first
  v_rebuild boolean := true;             -- with v_reset: false only deletes it
  v_marker constant text := 'WazaBolt demo shop: clothing, shoes and accessories (fictional data).';
  v_deleted int;
  v_user uuid;
  v_biz uuid;
  v_products uuid[] := '{}';
  v_customers uuid[] := '{}';
  v_pid uuid;
  v_cid uuid;
  v_order uuid;
  v_day int;
  v_n int;
  v_items jsonb;
  v_total numeric;
  v_method text;
  v_paid numeric;
  v_when timestamptz;
  v_sale int := 0;
  r record;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then
    raise exception 'No WazaBolt account with the email %. Sign up first, then set it in this script.', v_email;
  end if;
  if v_reset then
    delete from public.businesses b
    using public.business_members m
    where m.business_id = b.id and m.user_id = v_user and m.role = 'owner' and b.description = v_marker;
    get diagnostics v_deleted = row_count;
    raise notice 'Deleted % demo shop(s) of %.', v_deleted, v_email;
    if not v_rebuild then
      return;
    end if;
  elsif exists (
    select 1 from public.businesses b join public.business_members m on m.business_id = b.id
    where m.user_id = v_user and b.description = v_marker
  ) then
    raise notice 'The demo shop already exists for %; nothing to do (set v_reset to true to rebuild it).', v_email;
    return;
  end if;

  -- Act as the owner for this transaction, so the app's permission checks apply.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  perform setseed(0.42);  -- same demo figures on every run

  -- ---------------------------------------------------------------- business
  insert into public.businesses (name, country_code, currency, timezone, default_language, industry, city, address, description,
                                 receipt_footer, onboarding_step, onboarding_completed_at)
  values ('MJ Fashion Cameroon', 'CM', 'XAF', 'Africa/Douala', 'fr', 'fashion', 'Douala', 'Akwa (demo address)',
          v_marker, 'Merci pour votre achat ! / Thank you for shopping with us!', 6, now())
  returning id into v_biz;
  insert into public.business_languages (business_id, language_code, sort_order)
  select v_biz, language_code, sort_order from public.country_pack_languages where country_code = 'CM'
  on conflict do nothing;
  insert into public.business_languages (business_id, language_code, sort_order) values (v_biz, 'fr', 0) on conflict do nothing;
  insert into public.ai_settings (business_id) values (v_biz) on conflict do nothing;
  insert into public.business_members (business_id, user_id, role) values (v_biz, v_user, 'owner');

  -- ---------------------------------------------------------------- products
  -- name, selling price, cost price (demo), opening stock, minimum stock, category
  for r in
    select * from (values
      ('T-Shirt',  8000,  4500, 40, 10, 'Tops'),
      ('Jeans',   18000, 11000, 50,  6, 'Bottoms'),
      ('Sneakers',25000, 16000, 40,  4, 'Shoes'),
      ('Polo',    12000,  7000, 50,  6, 'Tops'),
      ('Hoodie',  20000, 12500, 35,  4, 'Tops'),
      ('Cap',      5000,  2500, 40,  8, 'Accessories'),
      ('Handbag', 15000,  9000, 35,  3, 'Accessories'),
      ('Sandals', 10000,  6000, 40,  5, 'Shoes')
    ) as p(name, price, cost, stock, min_stock, category)
  loop
    insert into public.products (business_id, name, price, cost_price, currency, stock_quantity, low_stock_threshold, category, unit, active)
    values (v_biz, r.name, r.price, r.cost, 'XAF', r.stock, r.min_stock, r.category, 'piece', true)
    returning id into v_pid;
    v_products := v_products || v_pid;
  end loop;

  -- ---------------------------------------------------------------- customers (fictional)
  for r in
    select * from (values
      ('Brenda Demo',   '237000000101', 'Douala'),
      ('Ngono Exemple', '237000000102', 'Douala'),
      ('Paul Test',     '237000000103', 'Yaoundé'),
      ('Awa Fictive',   '237000000104', 'Douala'),
      ('Eric Sample',   '237000000105', 'Bafoussam'),
      ('Clarisse Demo', '237000000106', 'Douala')
    ) as c(name, phone, city)
  loop
    insert into public.customers (business_id, name, whatsapp_phone, city, tags, notes)
    values (v_biz, r.name, r.phone, r.city, array['demo'], 'Fictional customer (demo data).')
    returning id into v_cid;
    v_customers := v_customers || v_cid;
  end loop;

  -- ---------------------------------------------------------------- restock early in the month
  perform public.adjust_stock(v_biz, v_products[1], 'purchase', 20, null, null, 'Supplier delivery (demo)');
  update public.stock_movements set created_at = now() - interval '25 days' where business_id = v_biz and reason = 'purchase';

  -- ---------------------------------------------------------------- 30 days of sales
  for v_day in reverse 29..0 loop
    for v_n in 1..(1 + floor(random() * 3))::int loop
      v_sale := v_sale + 1;
      -- one to three different products that are still in stock
      select jsonb_agg(jsonb_build_object('product_id', id, 'quantity', 1 + floor(random() * 2)::int))
      into v_items
      from (select id from public.products where business_id = v_biz and stock_quantity >= 2 order by random() limit (1 + floor(random() * 3))::int) s;
      select sum(p.price * (i ->> 'quantity')::int) into v_total
      from jsonb_array_elements(v_items) i join public.products p on p.id = (i ->> 'product_id')::uuid;
      v_cid := case when random() < 0.6 then v_customers[1 + floor(random() * 6)::int] else null end;
      v_method := (array['cash', 'cash', 'mtn_momo', 'orange_money', 'cash', 'bank_transfer'])[1 + floor(random() * 6)::int];
      -- Every 6th sale to a known customer is half on credit.
      v_paid := case when v_cid is not null and v_sale % 6 = 0 then round(v_total / 2, -3) else v_total end;

      v_order := public.create_sale(
        v_biz, gen_random_uuid(), v_items, v_cid, 0,
        jsonb_build_array(jsonb_build_object('amount', v_paid, 'method', v_method,
          'reference', case when v_method in ('mtn_momo', 'orange_money') then 'DEMO-' || lpad(v_sale::text, 5, '0') end)),
        null);

      -- Move the sale back to its day (shop hours, 9:00–19:00 Douala time).
      v_when := ((current_date - v_day)::timestamp + make_interval(hours => 9 + floor(random() * 10)::int, mins => floor(random() * 60)::int)) at time zone 'Africa/Douala';
      if v_when > now() then v_when := now() - make_interval(mins => v_n * 7); end if;
      update public.orders set created_at = v_when, updated_at = v_when where id = v_order;
      update public.order_payments set received_at = v_when, created_at = v_when where order_id = v_order;
      update public.stock_movements set created_at = v_when where order_id = v_order;
    end loop;
  end loop;

  -- ---------------------------------------------------------------- a customer pays part of their credit
  select s.customer_id into v_cid from public.customer_stats s
  where s.business_id = v_biz and s.outstanding > 0 order by s.outstanding desc limit 1;
  if v_cid is not null then
    perform public.record_customer_payment(v_biz, v_cid, 5000, 'orange_money', 'DEMO-REPAY-1', gen_random_uuid());
    update public.order_payments set received_at = now() - interval '2 days', created_at = now() - interval '2 days'
    where business_id = v_biz and reference = 'DEMO-REPAY-1';
  end if;

  -- ---------------------------------------------------------------- stock events
  perform public.adjust_stock(v_biz, v_products[7], 'damaged', 1, null, null, 'Torn strap (demo)');
  -- Leave Sandals out of stock and Cap low, so the alerts have something to show.
  perform public.adjust_stock(v_biz, v_products[8], 'adjustment', null, 0, null, 'Stock count (demo)');
  perform public.adjust_stock(v_biz, v_products[6], 'adjustment', null, 3, null, 'Stock count (demo)');

  -- ---------------------------------------------------------------- expenses this month and last
  insert into public.expenses (business_id, category, amount, spent_on, description, payment_method, created_by)
  values
    (v_biz, 'rent',        75000, date_trunc('month', current_date)::date,                   'Shop rent (demo)',            'cash',          v_user),
    (v_biz, 'electricity', 12000, date_trunc('month', current_date)::date + 4,               'ENEO bill (demo)',            'mtn_momo',      v_user),
    (v_biz, 'internet',    15000, date_trunc('month', current_date)::date + 2,               'Internet bundle (demo)',      'orange_money',  v_user),
    (v_biz, 'transport',    6000, current_date - 3,                                          'Taxi to the market (demo)',   'cash',          v_user),
    (v_biz, 'packaging',    8500, current_date - 9,                                          'Bags and tissue paper (demo)', 'cash',         v_user),
    (v_biz, 'marketing',   10000, current_date - 12,                                         'Flyers (demo)',               'cash',          v_user),
    (v_biz, 'rent',        75000, (date_trunc('month', current_date) - interval '1 month')::date, 'Shop rent (demo)',      'cash',          v_user),
    (v_biz, 'supplier',   120000, (date_trunc('month', current_date) - interval '1 month')::date + 10, 'Supplier payment (demo)', 'bank_transfer', v_user);
  update public.expenses set spent_on = least(spent_on, current_date) where business_id = v_biz;

  raise notice 'Demo shop created: % (id %), % sales.', 'MJ Fashion Cameroon', v_biz, v_sale;
end;
$$;
