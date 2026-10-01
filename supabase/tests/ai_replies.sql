-- WazaBolt Stage 3 tests: the assistant (service role) may record orders;
-- AI usage is readable by owners/admins of the business only.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/ai_replies.sql
-- Everything runs in a transaction that is rolled back.

begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-d000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ai-a@test.local', '{"full_name":"Owner A","business_name":"AI Shop A"}', now(), now()),
  ('00000000-0000-4000-d000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ai-b@test.local', '{"full_name":"Owner B","business_name":"AI Shop B"}', now(), now()),
  ('00000000-0000-4000-d000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ai-agent@test.local', '{"full_name":"Agent C","business_name":"Agent own"}', now(), now());

create temp table ids on commit drop as
select
  (select business_id from public.business_members where user_id = '00000000-0000-4000-d000-00000000000a') as biz_a,
  (select business_id from public.business_members where user_id = '00000000-0000-4000-d000-00000000000b') as biz_b;
grant select on ids to authenticated, service_role;
insert into public.business_members (business_id, user_id, role)
select biz_a, '00000000-0000-4000-d000-00000000000c'::uuid, 'agent'::public.business_role from ids;

create temp table fx on commit drop as
with p as (
  insert into public.products (business_id, name, price, stock_quantity) select biz_a, 'Ankara dress', 15000, 3 from ids returning id, business_id
), c as (
  insert into public.customers (business_id, whatsapp_phone, name) select biz_a, '237670000001', 'Brenda' from ids returning id
)
select (select id from p) as product_id, (select id from c) as customer_id;
grant select on fx to authenticated, service_role;

insert into public.ai_usage (business_id, model, outcome, input_tokens, output_tokens)
select biz_a, 'claude-opus-5-5', 'replied', 1200, 80 from ids;

-- The assistant runs as the service role (no signed-in user).
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare o uuid;
begin
  select public.create_order((select biz_a from ids), (select customer_id from fx),
    jsonb_build_array(jsonb_build_object('product_id', (select product_id from fx), 'quantity', 2))) into o;
  if (select total from public.orders where id = o) <> 30000 then raise exception 'FAIL: assistant order total'; end if;
  raise notice 'PASS the assistant (service role) records orders with catalog prices';
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-d000-00000000000c","role":"authenticated"}', true);
do $$
begin
  perform public.create_order((select biz_a from ids), (select customer_id from fx),
    jsonb_build_array(jsonb_build_object('product_id', (select product_id from fx), 'quantity', 1)));
  if (select count(*) from public.ai_usage) <> 0 then raise exception 'FAIL: agents must not read AI usage'; end if;
  begin
    insert into public.ai_usage (business_id, model, outcome) select biz_a, 'x', 'replied' from ids;
    raise exception 'FAIL: users can write AI usage';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS agents still record orders; AI usage is hidden from agents and server-written only';
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-d000-00000000000a","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.ai_usage) <> 1 then raise exception 'FAIL: owner should see AI usage'; end if;
  raise notice 'PASS owners see their AI usage';
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-d000-00000000000b","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.ai_usage) <> 0 then raise exception 'FAIL: B sees A''s AI usage'; end if;
  begin
    perform public.create_order((select biz_a from ids), (select customer_id from fx),
      jsonb_build_array(jsonb_build_object('product_id', (select product_id from fx), 'quantity', 1)));
    raise exception 'FAIL: B created an order for A';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS other businesses can neither see AI usage nor create orders';
end $$;

reset role;
rollback;
