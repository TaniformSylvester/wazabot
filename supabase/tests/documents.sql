-- WazaBolt Docs: numbering, statuses, immutability of issued documents, roles,
-- tenant isolation and the guest rate limit.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/documents.sql
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-a960-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'doc-owner@test.local', '{"business_name":"Doc Shop"}', now(), now()),
  ('00000000-0000-4000-a960-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'doc-agent@test.local', '{"business_name":"Agent Own"}', now(), now()),
  ('00000000-0000-4000-a960-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'doc-viewer@test.local', '{"business_name":"Viewer Own"}', now(), now()),
  ('00000000-0000-4000-a960-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'doc-other@test.local', '{"business_name":"Other Docs"}', now(), now());
create temp table ids on commit drop as
select (select business_id from public.business_members where user_id = '00000000-0000-4000-a960-00000000000a') as biz,
       (select business_id from public.business_members where user_id = '00000000-0000-4000-a960-00000000000c') as other;
-- Not testing plan limits here.
update public.businesses set free_limits_from = '2099-01-01' where id in (select biz from ids union select other from ids);
insert into public.business_members (business_id, user_id, role) select biz, '00000000-0000-4000-a960-00000000000b', 'agent' from ids;
insert into public.business_members (business_id, user_id, role) select biz, '00000000-0000-4000-a960-00000000000d', 'viewer' from ids;
create temp table t (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated, service_role;
grant all on t to authenticated, service_role;

-- A helper to insert a draft as the current user.
create function pg_temp.draft(b uuid, typ text, total numeric, issue date default '2026-10-22') returns uuid language sql as $$
  insert into public.documents (business_id, doc_type, issue_date, business_snapshot, customer_snapshot, items, subtotal, total, created_by,
                                amount_paid, payment_method)
  values (b, typ, issue, '{"name":"Doc Shop"}', '{"name":"Brenda"}', '[{"description":"Robe wax","quantity":1,"unitPrice":15000}]', total, total, (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid,
          case when typ = 'receipt' then total end, case when typ = 'receipt' then 'cash' end)
  returning id;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a960-00000000000a","role":"authenticated"}', true);
do $$
declare
  b uuid := (select biz from ids);
  d1 uuid; d2 uuid; d3 uuid; q uuid; r uuid; n text;
begin
  d1 := pg_temp.draft(b, 'invoice', 15000);
  if (select status || coalesce(number, '-') from public.documents where id = d1) <> 'draft-' then raise exception 'FAIL: new draft'; end if;
  update public.documents set notes = 'Merci' where id = d1;
  raise notice 'PASS staff create and edit drafts; drafts have no number';

  perform public.issue_document(d1);
  d2 := pg_temp.draft(b, 'invoice', 5000);
  perform public.issue_document(d2);
  d3 := pg_temp.draft(b, 'invoice', 5000, '2027-01-03');
  perform public.issue_document(d3);
  if (select string_agg(number, ',' order by number) from public.documents where id in (d1, d2, d3)) <> 'INV-2026-000001,INV-2026-000002,INV-2027-000001' then
    raise exception 'FAIL: numbers %', (select string_agg(number, ',' order by number) from public.documents where id in (d1, d2, d3));
  end if;
  insert into t values ('inv1', d1), ('inv2', d2);
  raise notice 'PASS issuing numbers invoices INV-2026-000001, -000002, and starts again at 1 in 2027';

  begin
    perform public.issue_document(d1);
    raise exception 'FAIL: issued twice';
  exception when sqlstate 'WB420' then null;
  end;
  begin
    update public.documents set notes = 'changed' where id = d1;
    if found then raise exception 'FAIL: issued document edited through RLS'; end if;
  end;
  begin
    delete from public.documents where id = d1;
    if found then raise exception 'FAIL: issued document deleted'; end if;
  end;
  raise notice 'PASS an issued document can''t be issued again, edited or deleted by staff';

  -- Quotations: issued = sent, then accepted / rejected.
  q := pg_temp.draft(b, 'quotation', 90000);
  perform public.issue_document(q);
  if (select status || ' ' || number from public.documents where id = q) <> 'sent QUO-2026-000001' then raise exception 'FAIL: quotation issue'; end if;
  perform public.set_quotation_status(q, 'accepted');
  if (select status from public.documents where id = q) <> 'accepted' then raise exception 'FAIL: accepted'; end if;
  begin
    perform public.set_quotation_status(d1, 'accepted');
    raise exception 'FAIL: invoice accepted';
  exception when sqlstate 'WB420' then null;
  end;
  raise notice 'PASS quotations are numbered QUO-…, sent when issued, then accepted or rejected';

  -- Receipts need the amount and method.
  r := pg_temp.draft(b, 'receipt', 15000);
  update public.documents set payment_method = null where id = r;
  begin
    perform public.issue_document(r);
    raise exception 'FAIL: receipt without payment';
  exception when sqlstate '22023' then null;
  end;
  update public.documents set payment_method = 'mtn_momo' where id = r;
  perform public.issue_document(r);
  if (select number from public.documents where id = r) <> 'REC-2026-000001' then raise exception 'FAIL: receipt number'; end if;
  insert into t values ('rec', r);
  raise notice 'PASS a receipt is issued only with the amount received and the payment method (REC-2026-000001)';

  -- Settings change the next numbers only.
  insert into public.document_settings (business_id, invoice_prefix, include_year, number_padding) values (b, 'FAC', false, 4);
  d1 := pg_temp.draft(b, 'invoice', 100);
  perform public.issue_document(d1);
  if (select number from public.documents where id = d1) <> 'FAC-0001' then raise exception 'FAIL: custom numbering %', (select number from public.documents where id = d1); end if;
  if (select number from public.documents where id = (select v from t where k = 'inv1')) <> 'INV-2026-000001' then raise exception 'FAIL: old number changed'; end if;
  raise notice 'PASS owners set prefix, year and digits (FAC-0001); numbers already given don''t change';

  -- Void: owners and admins, with a reason; audited; a voided document stays voided.
  begin
    perform public.void_document((select v from t where k = 'inv2'), 'x');
    raise exception 'FAIL: void without reason';
  exception when sqlstate '22023' then null;
  end;
  perform public.void_document((select v from t where k = 'inv2'), 'Wrong customer');
  if (select status || ' ' || void_reason from public.documents where id = (select v from t where k = 'inv2')) <> 'voided Wrong customer' then raise exception 'FAIL: void'; end if;
  if (select count(*) from public.audit_logs where business_id = b and action in ('document.issued', 'document.voided', 'document.status')) < 7 then raise exception 'FAIL: audit'; end if;
  raise notice 'PASS voiding needs a reason, keeps the document and is recorded in the audit log';
end $$;

-- The table can't be changed around the functions, even by the owner.
do $$
begin
  begin
    update public.documents set status = 'paid' where id = (select v from t where k = 'inv1');
    raise exception 'FAIL: status set directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.documents (business_id, doc_type, status, number, business_snapshot, customer_snapshot, items, subtotal, total, created_by)
    values ((select biz from ids), 'invoice', 'issued', 'INV-FAKE', '{}', '{}', '[{"description":"x"}]', 1, 1, (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid);
    raise exception 'FAIL: issued document inserted directly';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS status and number can only be set by issuing (no direct writes)';
end $$;

-- Agent: drafts, invoices and quotations yes; receipts and voids no.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a960-00000000000b","role":"authenticated"}', true);
do $$
declare
  b uuid := (select biz from ids);
  r uuid; i uuid;
begin
  i := pg_temp.draft(b, 'invoice', 2000);
  perform public.issue_document(i);
  r := pg_temp.draft(b, 'receipt', 2000);
  begin
    perform public.issue_document(r);
    raise exception 'FAIL: agent issued a receipt';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.void_document(i, 'by agent');
    raise exception 'FAIL: agent voided';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS agents issue invoices and quotations, but not receipts, and can''t void';
end $$;

-- Viewer: read only.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a960-00000000000d","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.documents where business_id = (select biz from ids)) = 0 then raise exception 'FAIL: viewer reads'; end if;
  begin
    perform pg_temp.draft((select biz from ids), 'invoice', 1);
    raise exception 'FAIL: viewer created a document';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS viewers read documents but can''t create them';
end $$;

-- Another business sees nothing and can't issue ours.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a960-00000000000c","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.documents where business_id = (select biz from ids)) then raise exception 'FAIL: other business reads documents'; end if;
  if exists (select 1 from public.document_settings where business_id = (select biz from ids)) then raise exception 'FAIL: other business reads settings'; end if;
  begin
    perform public.void_document((select v from t where k = 'rec'), 'not mine');
    raise exception 'FAIL: other business voided';
  exception when sqlstate 'P0002' then null;
  end;
  begin
    perform public.guest_document_allowed('x', 30);
    raise exception 'FAIL: users can call the guest limiter';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS another business can''t see or change our documents; the guest limiter is server-only';
end $$;

-- Guest rate limit (service role): 3 per hour in this test.
reset role;
do $$
declare ok int := 0;
begin
  for i in 1..5 loop
    if public.guest_document_allowed('test-key', 3) then ok := ok + 1; end if;
  end loop;
  if ok <> 3 or not public.guest_document_allowed('other-key', 3) then raise exception 'FAIL: guest limit %', ok; end if;
  update public.guest_document_requests set created_at = now() - interval '2 days' where key = 'test-key';
  perform public.guest_document_allowed('cleanup', 3);
  if exists (select 1 from public.guest_document_requests where key = 'test-key') then raise exception 'FAIL: cleanup'; end if;
  raise notice 'PASS the guest limit allows N per hour per key, other visitors are unaffected, rows are deleted after a day';
end $$;

rollback;
