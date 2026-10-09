-- WazaBolt Stage 4 tests: stock follows orders, AI usage against the plan,
-- team invitations and roles, plan change requests.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/business_operations.sql
-- Everything runs in a transaction that is rolled back.

begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-e000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ops-owner@test.local', '{"full_name":"Owner","business_name":"Ops Shop"}', now(), now()),
  ('00000000-0000-4000-e000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ops-admin@test.local', '{"full_name":"Admin","business_name":"Admin own"}', now(), now()),
  ('00000000-0000-4000-e000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ops-agent@test.local', '{"full_name":"Agent","business_name":"Agent own"}', now(), now()),
  ('00000000-0000-4000-e000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ops-other@test.local', '{"full_name":"Other","business_name":"Other shop"}', now(), now());

create temp table ids on commit drop as
select
  (select business_id from public.business_members where user_id = '00000000-0000-4000-e000-00000000000a') as biz,
  (select business_id from public.business_members where user_id = '00000000-0000-4000-e000-00000000000d') as other_biz;
grant select on ids to anon, authenticated, service_role;
-- Not testing plan limits here: keep the Free plan but outside its limits (grace date far ahead).
update public.businesses set free_limits_from = '2099-01-01' where id in (select biz from ids);
insert into public.business_members (business_id, user_id, role)
select biz, '00000000-0000-4000-e000-00000000000b'::uuid, 'admin'::public.business_role from ids union all
select biz, '00000000-0000-4000-e000-00000000000c'::uuid, 'agent'::public.business_role from ids;

create temp table fx on commit drop as
with p as (
  insert into public.products (business_id, name, price, stock_quantity) select biz, 'Robe Ankara', 15000, 5 from ids returning id
), u as (
  insert into public.products (business_id, name, price, stock_quantity) select biz, 'Retouches', 2000, null from ids returning id
), s as (
  insert into public.products (business_id, name, price, stock_quantity) select biz, 'Sandales', 8000, 10 from ids returning id
), v as (
  insert into public.product_variants (business_id, product_id, name, value, stock_quantity)
  select biz, (select id from s), 'Taille', '38', 2 from ids returning id
), c as (
  insert into public.customers (business_id, whatsapp_phone, name) select biz, '237670000009', 'Brenda' from ids returning id
)
select (select id from p) as dress, (select id from u) as untracked, (select id from s) as sandals,
       (select id from v) as size38, (select id from c) as customer;
grant select on fx to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000c","role":"authenticated"}', true);

create temp table orders_made (name text, id uuid) on commit drop;

do $$
declare o uuid;
begin
  select public.create_order((select biz from ids), (select customer from fx), jsonb_build_array(
    jsonb_build_object('product_id', (select dress from fx), 'quantity', 2),
    jsonb_build_object('product_id', (select untracked from fx), 'quantity', 3),
    jsonb_build_object('product_id', (select sandals from fx), 'variant_id', (select size38 from fx), 'quantity', 1))) into o;
  insert into orders_made values ('first', o);
  if (select stock_quantity from public.products where id = (select dress from fx)) <> 3 then raise exception 'FAIL: product stock not taken'; end if;
  if (select stock_quantity from public.products where id = (select untracked from fx)) is not null then raise exception 'FAIL: untracked stock changed'; end if;
  if (select stock_quantity from public.product_variants where id = (select size38 from fx)) <> 1 then raise exception 'FAIL: variant stock not taken'; end if;
  if (select stock_quantity from public.products where id = (select sandals from fx)) <> 10 then raise exception 'FAIL: tracked variant must not touch product stock'; end if;
  if not (select stock_managed and stock_applied from public.orders where id = o) then raise exception 'FAIL: order stock flags'; end if;
  raise notice 'PASS an order takes stock (product, or the tracked variant); untracked stock is left alone';
end $$;

do $$
declare v_orders bigint := (select count(*) from public.orders where business_id = (select biz from ids));
begin
  begin
    perform public.create_order((select biz from ids), (select customer from fx), jsonb_build_array(
      jsonb_build_object('product_id', (select dress from fx), 'quantity', 1),
      jsonb_build_object('product_id', (select sandals from fx), 'variant_id', (select size38 from fx), 'quantity', 2)));
    raise exception 'FAIL: order larger than the stock was accepted';
  exception when sqlstate 'WB409' then
    if sqlerrm not like '%Sandales (Taille: 38)%' then raise exception 'FAIL: stock error should name the item, got %', sqlerrm; end if;
  end;
  if (select stock_quantity from public.products where id = (select dress from fx)) <> 3 then raise exception 'FAIL: refused order still took stock'; end if;
  if (select count(*) from public.orders where business_id = (select biz from ids)) <> v_orders then raise exception 'FAIL: refused order was saved'; end if;
  raise notice 'PASS an order for more than is in stock is refused, naming the item, and changes nothing';
end $$;

do $$
declare o uuid := (select id from orders_made where name = 'first');
begin
  update public.orders set status = 'confirmed' where id = o;
  if (select stock_quantity from public.products where id = (select dress from fx)) <> 3 then raise exception 'FAIL: status change moved stock'; end if;
  update public.orders set status = 'cancelled' where id = o;
  if (select stock_quantity from public.products where id = (select dress from fx)) <> 5
     or (select stock_quantity from public.product_variants where id = (select size38 from fx)) <> 2 then
    raise exception 'FAIL: cancelling did not give stock back';
  end if;
  update public.orders set status = 'cancelled', notes = 'twice' where id = o;
  if (select stock_quantity from public.products where id = (select dress from fx)) <> 5 then raise exception 'FAIL: stock given back twice'; end if;
  update public.orders set status = 'pending' where id = o;
  if (select stock_quantity from public.products where id = (select dress from fx)) <> 3 then raise exception 'FAIL: un-cancelling did not take stock'; end if;
  raise notice 'PASS cancelling gives stock back once; un-cancelling takes it again';
end $$;

do $$
declare o uuid := (select id from orders_made where name = 'first');
begin
  -- Sell the remaining dresses, then try to un-cancel an order that needs them.
  update public.orders set status = 'cancelled' where id = o;
  perform public.create_order((select biz from ids), (select customer from fx),
    jsonb_build_array(jsonb_build_object('product_id', (select dress from fx), 'quantity', 4)));
  begin
    update public.orders set status = 'confirmed' where id = o;
    raise exception 'FAIL: un-cancelled an order without stock';
  exception when sqlstate 'WB409' then null;
  end;
  if (select status from public.orders where id = o) <> 'cancelled' then raise exception 'FAIL: status changed anyway'; end if;
  raise notice 'PASS an order can''t be un-cancelled when its stock has been sold meanwhile';
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000b","role":"authenticated"}', true);
do $$
declare o uuid;
begin
  select public.create_order((select biz from ids), (select customer from fx),
    jsonb_build_array(jsonb_build_object('product_id', (select sandals from fx), 'quantity', 3))) into o;
  if (select stock_quantity from public.products where id = (select sandals from fx)) <> 7 then raise exception 'FAIL: product stock (no variant)'; end if;
  delete from public.orders where id = o;
  if (select stock_quantity from public.products where id = (select sandals from fx)) <> 10 then raise exception 'FAIL: deleting did not give stock back'; end if;
  raise notice 'PASS deleting an order gives its stock back';
end $$;

-- ---------------------------------------------------------------------------
-- AI usage against the plan
-- ---------------------------------------------------------------------------
reset role;
do $$
declare conv uuid;
begin
  insert into public.conversations (business_id, customer_id) select biz, (select customer from fx) from ids returning id into conv;
  insert into public.messages (business_id, conversation_id, direction, sender_type, message_type, content, ai_generated)
  select biz, conv, 'outbound', 'ai', 'text', 'Bonjour', true from ids union all
  select biz, conv, 'outbound', 'ai', 'text', 'Encore', true from ids;
end $$;
-- The counting rules from before Step 4 (see margin_protection.sql for the 24-hour windows).
update public.subscriptions set rules_from = now() + interval '1 day' where business_id = (select biz from ids);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000c","role":"authenticated"}', true);
do $$
declare r record;
begin
  select * into r from public.ai_usage_status((select biz from ids));
  if r.plan_id <> 'free' or r.conversation_limit <> 50 or r.conversations_used <> 1 then
    raise exception 'FAIL: usage status %', row_to_json(r);
  end if;
  begin
    perform public.ai_usage_status((select other_biz from ids));
    raise exception 'FAIL: usage of another business readable';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS AI usage: plan allowance and conversations used, members of the business only';
end $$;

-- ---------------------------------------------------------------------------
-- Invitations and roles
-- ---------------------------------------------------------------------------
-- Agents can't invite.
do $$
begin
  perform public.create_invitation((select biz from ids), 'new@test.local', 'agent', public.token_sha256('tok-agent'));
  raise exception 'FAIL: agents can invite';
exception when insufficient_privilege then
  raise notice 'PASS agents can''t invite';
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000b","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.create_invitation((select biz from ids), 'new@test.local', 'admin', public.token_sha256('tok-x'));
    raise exception 'FAIL: an admin invited an admin';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_invitation((select biz from ids), 'OPS-AGENT@test.local', 'viewer', public.token_sha256('tok-y'));
    raise exception 'FAIL: invited an existing member';
  exception when unique_violation then null;
  end;
  perform public.create_invitation((select biz from ids), ' New@Test.local ', 'agent', public.token_sha256('tok-old'));
  perform public.create_invitation((select biz from ids), 'new@test.local', 'viewer', public.token_sha256('tok-new'));
  if (select count(*) from public.business_invitations where email = 'new@test.local' and revoked_at is null) <> 1 then
    raise exception 'FAIL: re-inviting should replace the pending invitation';
  end if;
  raise notice 'PASS admins invite agents/viewers (not admins, not existing members); re-inviting replaces the link';
end $$;

-- The link itself is the secret: anyone holding it sees what it's for; the hash is never readable.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare r record;
begin
  select * into r from public.get_invitation('tok-new');
  if r.business_name <> 'Ops Shop' or r.role <> 'viewer' or r.email <> 'new@test.local' or r.state <> 'pending' then
    raise exception 'FAIL: invitation details %', row_to_json(r);
  end if;
  if (select state from public.get_invitation('tok-old')) <> 'revoked' then raise exception 'FAIL: old link should be revoked'; end if;
  if exists (select 1 from public.get_invitation('nope')) then raise exception 'FAIL: unknown token matched'; end if;
  raise notice 'PASS an invitation link shows its business, role and state (replaced links read as revoked)';
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000c","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.business_invitations) then raise exception 'FAIL: agents can read invitations'; end if;
  begin
    perform token_hash from public.business_invitations;
    raise exception 'FAIL: token hashes are readable';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS invitations are hidden from agents; token hashes from everyone';
end $$;

-- Someone else (wrong email) can't use the link.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000d","role":"authenticated"}', true);
do $$
begin
  perform public.accept_invitation('tok-new');
  raise exception 'FAIL: accepted an invitation for another email';
exception when insufficient_privilege then
  raise notice 'PASS an invitation only works for the invited email';
end $$;

-- Signing up with the link joins the business instead of creating one.
reset role;
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-e000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'new@test.local', '{"full_name":"Newcomer","invite_token":"tok-new","locale":"fr"}', now(), now());
do $$
begin
  if (select count(*) from public.business_members where user_id = '00000000-0000-4000-e000-00000000000e') <> 1
     or (select role::text from public.business_members where user_id = '00000000-0000-4000-e000-00000000000e' and business_id = (select biz from ids)) <> 'viewer' then
    raise exception 'FAIL: invited sign-up should only join the business as viewer';
  end if;
  if (select state from public.get_invitation('tok-new')) <> 'accepted' then raise exception 'FAIL: invitation not marked accepted'; end if;
  if (select ui_locale from public.users where id = '00000000-0000-4000-e000-00000000000e') <> 'fr' then raise exception 'FAIL: profile'; end if;
  raise notice 'PASS signing up from an invitation joins that business (no new business), once';
end $$;

-- An existing account accepts while signed in.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000a","role":"authenticated"}', true);
select public.create_invitation((select biz from ids), 'ops-other@test.local', 'admin', public.token_sha256('tok-other'));
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000d","role":"authenticated"}', true);
do $$
begin
  if public.accept_invitation('tok-other') <> (select biz from ids) then raise exception 'FAIL: accept returns the business'; end if;
  if (select count(*) from public.business_members where user_id = '00000000-0000-4000-e000-00000000000d') <> 2 then
    raise exception 'FAIL: existing user should now belong to both businesses';
  end if;
  begin
    perform public.accept_invitation('tok-other');
    raise exception 'FAIL: link reused';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'PASS an existing account joins while signed in (keeping its own business); links work once';
end $$;

-- Roles: admins manage agents/viewers; only the owner manages admins; nobody touches the owner.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000b","role":"authenticated"}', true);
do $$
begin
  perform public.update_member_role((select biz from ids), '00000000-0000-4000-e000-00000000000c', 'viewer');
  if (select role::text from public.business_members where business_id = (select biz from ids) and user_id = '00000000-0000-4000-e000-00000000000c') <> 'viewer' then
    raise exception 'FAIL: role not changed';
  end if;
  begin
    perform public.update_member_role((select biz from ids), '00000000-0000-4000-e000-00000000000c', 'admin');
    raise exception 'FAIL: admin promoted someone to admin';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.remove_member((select biz from ids), '00000000-0000-4000-e000-00000000000d');
    raise exception 'FAIL: admin removed another admin';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.remove_member((select biz from ids), '00000000-0000-4000-e000-00000000000a');
    raise exception 'FAIL: owner removed';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS admins manage agents and viewers only; the owner can''t be removed';
end $$;

reset role;
update public.conversations set assigned_to = '00000000-0000-4000-e000-00000000000c' where business_id = (select biz from ids);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000c","role":"authenticated"}', true);
do $$
begin
  perform public.remove_member((select biz from ids), '00000000-0000-4000-e000-00000000000c');
  raise notice 'PASS a member can leave a business';
end $$;
reset role;
do $$
begin
  if exists (select 1 from public.conversations where assigned_to = '00000000-0000-4000-e000-00000000000c') then
    raise exception 'FAIL: conversations still assigned to someone who left';
  end if;
  raise notice 'PASS conversations assigned to someone who leaves become unassigned';
end $$;

-- ---------------------------------------------------------------------------
-- Plan change requests
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000e","role":"authenticated"}', true);
do $$
begin
  perform public.request_plan_change((select biz from ids), 'business');
  raise exception 'FAIL: viewers can request a plan';
exception when insufficient_privilege then
  raise notice 'PASS viewers can''t request a plan change';
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000a","role":"authenticated"}', true);
create temp table req (id uuid) on commit drop;
grant all on req to authenticated, service_role;
do $$
declare r uuid;
begin
  begin
    perform public.request_plan_change((select biz from ids), 'free');
    raise exception 'FAIL: requested the current plan';
  exception when invalid_parameter_value then null;
  end;
  perform public.request_plan_change((select biz from ids), 'starter');
  select public.request_plan_change((select biz from ids), 'business', '+237 670 00 00 00', 'Paid by MoMo') into r;
  insert into req values (r);
  if (select count(*) from public.plan_change_requests where status = 'pending') <> 1 then raise exception 'FAIL: one pending request at a time'; end if;
  begin
    perform public.approve_plan_change(r);
    raise exception 'FAIL: a business approved its own plan change';
  exception when insufficient_privilege then null;
  end;
  if (select plan_id from public.subscriptions where business_id = (select biz from ids)) <> 'free' then raise exception 'FAIL: plan changed without approval'; end if;
  raise notice 'PASS owners request a plan (replacing a pending request) but can''t approve it';
end $$;

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
begin
  perform public.approve_plan_change((select id from req));
  if (select plan_id from public.subscriptions where business_id = (select biz from ids)) <> 'business' then raise exception 'FAIL: plan not changed'; end if;
  if (select status from public.plan_change_requests where id = (select id from req)) <> 'approved' then raise exception 'FAIL: request not approved'; end if;
  if (select conversation_limit from public.ai_usage_status((select biz from ids))) <> 2000 then raise exception 'FAIL: new allowance'; end if;
  raise notice 'PASS the operator approves a request: new plan, new allowance';
end $$;

rollback;
