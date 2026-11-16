/*
 * "Test AI Bot" hand-overs in the live queue. When the assistant, tried from
 * the dashboard's simulator, hands a test chat to the team, one "Test chat"
 * conversation per member shows up in the Live Handoff Queue (with its chime),
 * badged TEST, so owners can see the whole flow without a second phone.
 *
 *  - customers.is_test / conversations.is_test: that member's test customer
 *    and conversation. They are also is_sample, so everything that keeps sample
 *    data out of stats, reports, exports, the customer list and WhatsApp sends
 *    keeps test chats out too; only the handoff queue and the inbox show them.
 *  - has_sample_data() and clear_sample_data() ignore test rows: a test chat
 *    neither brings back the sample-data banner nor goes with "Clear sample
 *    data" (it goes with "Clear test" in the simulator, or stays resolved).
 *
 * Non-destructive: two columns (default false), two indexes, two functions
 * redefined with the extra condition.
 */

alter table public.customers add column is_test boolean not null default false;
alter table public.conversations add column is_test boolean not null default false;
comment on column public.customers.is_test is 'The "Test AI Bot" customer of one member (also is_sample): never contacted, not counted.';
comment on column public.conversations.is_test is 'A "Test AI Bot" hand-over (also is_sample): in the handoff queue badged TEST, never sent to WhatsApp, not counted.';
create index customers_test_idx on public.customers (business_id) where is_test;
create index conversations_test_idx on public.conversations (business_id) where is_test;

/* Does this business still have sample data? (members: the dashboard banner) — test chats don't count. */
create or replace function public.has_sample_data(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_business_member(p_business_id) and (
    exists (select 1 from public.products where business_id = p_business_id and is_sample)
    or exists (select 1 from public.conversations where business_id = p_business_id and is_sample and not is_test)
    or exists (select 1 from public.customers where business_id = p_business_id and is_sample and not is_test)
    or exists (select 1 from public.faqs where business_id = p_business_id and is_sample)
    or exists (select 1 from public.orders where business_id = p_business_id and is_sample)
    or exists (select 1 from public.school_subjects where business_id = p_business_id and is_sample)
  );
$$;
revoke execute on function public.has_sample_data(uuid) from public, anon;
grant execute on function public.has_sample_data(uuid) to authenticated;

/* "Clear sample data" (owner): as before, test chats excepted. */
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
  delete from public.conversations where business_id = p_business_id and is_sample and not is_test;
  get diagnostics v_conversations = row_count;
  delete from public.customers where business_id = p_business_id and is_sample and not is_test;
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
