-- Product options (colour × size): combinations as variants, their stock, order labels,
-- a combination required to sell such a product, uniqueness, older variants unchanged.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/product_options.sql
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-a950-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'opt-owner@test.local', '{"business_name":"Opt Shop"}', now(), now()),
  ('00000000-0000-4000-a950-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'opt-other@test.local', '{"business_name":"Other Opt"}', now(), now());
create temp table ids on commit drop as
select (select business_id from public.business_members where user_id = '00000000-0000-4000-a950-00000000000a') as biz,
       (select business_id from public.business_members where user_id = '00000000-0000-4000-a950-00000000000c') as other;
update public.businesses set free_limits_from = '2099-01-01' where id in (select biz from ids union select other from ids);
create temp table t (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated, service_role;
grant all on t to authenticated, service_role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a950-00000000000a","role":"authenticated"}', true);
do $$
declare
  b uuid := (select biz from ids);
  p uuid; legacy uuid; lv uuid; c uuid; o uuid; s uuid;
begin
  -- A T-shirt in Red/Black × S/M, the owner's way (options + one row per combination).
  insert into public.products (business_id, name, price, stock_quantity, options)
  values (b, 'T-shirt', 5000, null,
          '[{"name":"Colour","colour":true,"values":[{"value":"Red","hex":"#D62828"},{"value":"Black","hex":"#111111"}]},{"name":"Size","values":[{"value":"S"},{"value":"M"}]}]')
  returning id into p;
  insert into public.product_variants (business_id, product_id, name, value, options, stock_quantity, price_modifier, sort_order) values
    (b, p, 'Colour / Size', 'Red / S', '{"Colour":"Red","Size":"S"}', 3, 0, 0),
    (b, p, 'Colour / Size', 'Red / M', '{"Colour":"Red","Size":"M"}', 1, 0, 1),
    (b, p, 'Colour / Size', 'Black / S', '{"Colour":"Black","Size":"S"}', 0, 0, 2),
    (b, p, 'Colour / Size', 'Black / M', '{"Colour":"Black","Size":"M"}', 2, 500, 3);
  insert into t values ('tee', p);
  if (select options -> 0 ->> 'name' from public.products where id = p) <> 'Colour' then raise exception 'FAIL: owner reads options'; end if;
  raise notice 'PASS owners save options and one variant per combination, and can read them back';

  begin
    insert into public.product_variants (business_id, product_id, name, value, options) values (b, p, 'Colour / Size', 'Red / S', '{"Size":"S","Colour":"Red"}');
    raise exception 'FAIL: same combination twice';
  exception when unique_violation then null;
  end;
  begin
    update public.products set options = '{"Colour":"Red"}' where id = p;
    raise exception 'FAIL: options must be a list';
  exception when check_violation then null;
  end;
  raise notice 'PASS a combination exists once per product; options must be a list';

  -- An older product with one-option variants keeps working as before.
  insert into public.products (business_id, name, price, stock_quantity) values (b, 'Robe', 15000, null) returning id into legacy;
  insert into public.product_variants (business_id, product_id, name, value, stock_quantity) values (b, legacy, 'Taille', 'L', 4) returning id into lv;

  insert into public.customers (business_id, whatsapp_phone, name) values (b, '237670200001', 'Opt Client') returning id into c;

  -- Order: Black / M (price + 500) and the older variant.
  o := public.create_order(b, c, jsonb_build_array(
         jsonb_build_object('product_id', p, 'variant_id', (select id from public.product_variants where product_id = p and options = '{"Colour":"Black","Size":"M"}'), 'quantity', 2),
         jsonb_build_object('product_id', legacy, 'variant_id', lv, 'quantity', 1)));
  if (select string_agg(variant || '=' || unit_price::int, ', ' order by product_name desc) from public.order_items where order_id = o) <> 'Colour: Black · Size: M=5500, Taille: L=15000' then
    raise exception 'FAIL: order labels %', (select string_agg(variant || '=' || unit_price::int, ', ') from public.order_items where order_id = o);
  end if;
  if (select stock_quantity from public.product_variants where product_id = p and options = '{"Colour":"Black","Size":"M"}') <> 0
     or (select stock_quantity from public.product_variants where id = lv) <> 3 then
    raise exception 'FAIL: combination stock';
  end if;
  raise notice 'PASS orders record "Colour: Black · Size: M" (option order, not key order) with its price, and take its own stock; older variants unchanged';

  -- The label is a snapshot: renaming options later doesn't change past orders.
  update public.products set options = jsonb_set(options, '{0,name}', '"Color"') where id = p;
  if (select variant from public.order_items where order_id = o and product_id = p) <> 'Colour: Black · Size: M' then raise exception 'FAIL: snapshot'; end if;
  update public.products set options = jsonb_set(options, '{0,name}', '"Colour"') where id = p;
  raise notice 'PASS past order lines keep their label when options are renamed';

  -- Sold out: Black / S has no stock.
  begin
    perform public.create_sale(b, '22222222-0000-4000-8000-000000000001',
      jsonb_build_array(jsonb_build_object('product_id', p, 'variant_id', (select id from public.product_variants where product_id = p and options = '{"Colour":"Black","Size":"S"}'), 'quantity', 1)),
      null, 0, '[{"method":"cash","amount":5000}]'::jsonb);
    raise exception 'FAIL: sold a sold-out combination';
  exception when sqlstate 'WB409' then null;
  end;
  raise notice 'PASS a sold-out combination can''t be sold';

  -- A product sold by combinations can't be sold without one.
  begin
    perform public.create_sale(b, '22222222-0000-4000-8000-000000000002', jsonb_build_array(jsonb_build_object('product_id', p, 'quantity', 1)), null, 0, '[{"method":"cash","amount":5000}]'::jsonb);
    raise exception 'FAIL: sold without a combination';
  exception when sqlstate '22023' then
    if sqlerrm not like 'choose options for T-shirt%' then raise exception 'FAIL: message %', sqlerrm; end if;
  end;
  raise notice 'PASS a T-shirt can''t be sold without its colour and size';

  -- Till sale of Red / S: label and stock.
  s := public.create_sale(b, '22222222-0000-4000-8000-000000000003',
         jsonb_build_array(jsonb_build_object('product_id', p, 'variant_id', (select id from public.product_variants where product_id = p and options = '{"Colour":"Red","Size":"S"}'), 'quantity', 1)),
         null, 0, '[{"method":"cash","amount":5000}]'::jsonb);
  if (select variant from public.order_items where order_id = s) <> 'Colour: Red · Size: S'
     or (select stock_quantity from public.product_variants where product_id = p and options = '{"Colour":"Red","Size":"S"}') <> 2 then
    raise exception 'FAIL: till sale';
  end if;
  if not exists (select 1 from public.stock_movements where order_id = s and variant_id is not null and quantity_change = -1) then raise exception 'FAIL: stock history'; end if;
  raise notice 'PASS a till sale records the combination, takes its stock and logs it in the stock history';

  -- Cancelling gives the stock back to the combination.
  update public.orders set status = 'cancelled' where id = o;
  if (select stock_quantity from public.product_variants where product_id = p and options = '{"Colour":"Black","Size":"M"}') <> 2 then raise exception 'FAIL: stock back'; end if;
  raise notice 'PASS a cancelled order puts the combination''s stock back';
end $$;

-- Another business can't see the options.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a950-00000000000c","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.products where id = (select v from t where k = 'tee')) or exists (select 1 from public.product_variants where product_id = (select v from t where k = 'tee')) then
    raise exception 'FAIL: other business sees options';
  end if;
  raise notice 'PASS another business sees neither the product nor its combinations';
end $$;

reset role;
rollback;
