-- Phase 4: the "send invoices and receipts" assistant setting — on by default, changed by owners/admins only.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/whatsapp_documents.sql
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-a964-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wadoc-owner@test.local', '{"business_name":"Doc Shop"}', now(), now()),
  ('00000000-0000-4000-a964-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wadoc-agent@test.local', '{"business_name":"Agent Own"}', now(), now());
create temp table ids on commit drop as
select (select business_id from public.business_members where user_id = '00000000-0000-4000-a964-00000000000a') as biz;
grant select on ids to authenticated;
update public.businesses set free_limits_from = '2099-01-01' where id = (select biz from ids);
insert into public.business_members (business_id, user_id, role) select biz, '00000000-0000-4000-a964-00000000000b', 'agent' from ids;

do $$
begin
  if not (select send_documents from public.ai_settings where business_id = (select biz from ids)) then
    raise exception 'FAIL: send_documents should be on by default';
  end if;
  raise notice 'PASS the assistant sends issued invoices and receipts by default';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a964-00000000000b","role":"authenticated"}', true);
do $$
begin
  update public.ai_settings set send_documents = false where business_id = (select biz from ids);
  if found then raise exception 'FAIL: an agent changed the setting'; end if;
  raise notice 'PASS agents can''t change it';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a964-00000000000a","role":"authenticated"}', true);
do $$
begin
  update public.ai_settings set send_documents = false where business_id = (select biz from ids);
  if not found or (select send_documents from public.ai_settings where business_id = (select biz from ids)) then raise exception 'FAIL: owner switch-off'; end if;
  raise notice 'PASS the owner switches it off';
end $$;

rollback;
