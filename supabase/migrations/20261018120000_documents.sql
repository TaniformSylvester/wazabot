-- =============================================================================
-- WazaBolt Docs (Phase 1): saved invoices, receipts and quotations, numbering,
-- statuses, and the rate limit of the public (guest) document generator.
-- Additive only: no existing table is changed.
-- =============================================================================
--
-- documents          one row per document. Drafts are editable; an issued
--                    document is an immutable snapshot (business, customer,
--                    items, totals) — corrections = void + duplicate.
-- document_settings  numbering (prefixes, year, padding) and defaults per business.
-- document_counters  race-free numbers per business, type and year
--                    (INV-2026-000001), given when a document is issued.
-- guest_document_requests / guest_document_allowed()
--                    hashed-IP rate limit for the guest generator (rows kept 1 day).
--
-- Totals are computed by the app's document engine (lib/documents/calc.ts) and
-- stored with the snapshot. PDFs are rendered on demand; none are stored.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
create table public.document_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  invoice_prefix text not null default 'INV' check (invoice_prefix ~ '^[A-Z0-9]{1,8}$'),
  receipt_prefix text not null default 'REC' check (receipt_prefix ~ '^[A-Z0-9]{1,8}$'),
  quotation_prefix text not null default 'QUO' check (quotation_prefix ~ '^[A-Z0-9]{1,8}$'),
  include_year boolean not null default true,
  number_padding smallint not null default 6 check (number_padding between 3 and 8),
  default_template text not null default 'modern' check (default_template in ('classic', 'modern', 'minimal')),
  default_language text check (default_language in ('en', 'fr')),
  default_due_days smallint not null default 14 check (default_due_days between 0 and 365),
  default_tax_rate numeric(5, 2) not null default 0 check (default_tax_rate between 0 and 100),
  default_tax_label text check (char_length(default_tax_label) <= 30),
  default_notes text check (char_length(default_notes) <= 2000),
  default_terms text check (char_length(default_terms) <= 2000),
  -- Printed under the business name, e.g. the NIU / RCCM number.
  business_reference text check (char_length(business_reference) <= 60),
  updated_at timestamptz not null default now()
);
alter table public.document_settings enable row level security;
create policy "document_settings: members read" on public.document_settings for select to authenticated using (public.is_business_member(business_id));
create policy "document_settings: admins insert" on public.document_settings for insert to authenticated with check (public.has_min_role(business_id, 'admin'));
create policy "document_settings: admins update" on public.document_settings for update to authenticated
  using (public.has_min_role(business_id, 'admin')) with check (public.has_min_role(business_id, 'admin'));
grant select, insert, update on public.document_settings to authenticated;

create table public.document_counters (
  business_id uuid not null references public.businesses (id) on delete cascade,
  doc_type text not null check (doc_type in ('invoice', 'receipt', 'quotation')),
  -- 0 when numbers don't include the year (one sequence for ever).
  year integer not null,
  last_number bigint not null default 0,
  primary key (business_id, doc_type, year)
);
alter table public.document_counters enable row level security;
revoke all on public.document_counters from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  doc_type text not null check (doc_type in ('invoice', 'receipt', 'quotation')),
  status text not null default 'draft',
  number text check (char_length(number) <= 40),
  seq bigint,
  number_year integer,
  template text not null default 'modern' check (template in ('classic', 'modern', 'minimal')),
  language text not null default 'fr' check (language in ('en', 'fr')),
  currency char(3) not null default 'XAF',
  issue_date date not null default current_date,
  -- Invoice: due date. Quotation: valid until.
  due_date date,
  customer_id uuid,
  business_snapshot jsonb not null check (jsonb_typeof(business_snapshot) = 'object'),
  customer_snapshot jsonb not null check (jsonb_typeof(customer_snapshot) = 'object'),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 200),
  discount numeric(16, 2) not null default 0 check (discount >= 0),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate between 0 and 100),
  tax_label text check (char_length(tax_label) <= 30),
  subtotal numeric(16, 2) not null check (subtotal >= 0),
  tax_amount numeric(16, 2) not null default 0 check (tax_amount >= 0),
  total numeric(16, 2) not null check (total >= 0),
  -- Receipts: the money received.
  amount_paid numeric(16, 2) check (amount_paid >= 0),
  payment_method text check (payment_method in ('cash', 'mtn_momo', 'orange_money', 'bank_transfer', 'card', 'cheque', 'other')),
  payment_reference text check (char_length(payment_reference) <= 80),
  notes text check (char_length(notes) <= 2000),
  terms text check (char_length(terms) <= 2000),
  duplicated_from uuid references public.documents (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  issued_at timestamptz,
  issued_by uuid references auth.users (id) on delete set null,
  status_changed_at timestamptz,
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text check (char_length(void_reason) <= 300),
  unique (business_id, id),
  foreign key (business_id, customer_id) references public.customers (business_id, id) on delete set null (customer_id),
  constraint documents_status_by_type check (
    (doc_type = 'invoice' and status in ('draft', 'issued', 'partially_paid', 'paid', 'voided'))
    or (doc_type = 'quotation' and status in ('draft', 'sent', 'accepted', 'rejected', 'voided'))
    or (doc_type = 'receipt' and status in ('draft', 'issued', 'voided'))
  ),
  constraint documents_number_when_issued check ((status = 'draft') = (number is null)),
  constraint documents_due_after_issue check (due_date is null or due_date >= issue_date),
  constraint documents_voided check ((status = 'voided') = (voided_at is not null))
);
create unique index documents_number_key on public.documents (business_id, doc_type, number) where number is not null;
create index documents_business_created_idx on public.documents (business_id, created_at desc);
create index documents_business_type_status_idx on public.documents (business_id, doc_type, status);
create index documents_customer_idx on public.documents (business_id, customer_id) where customer_id is not null;

create trigger documents_set_updated_at before update on public.documents for each row execute function public.set_updated_at();

-- An issued document is a record: only its status (and void details) can change, through the functions below.
create or replace function public.documents_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fixed text[] := array['status', 'status_changed_at', 'voided_at', 'voided_by', 'void_reason', 'updated_at'];
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'issued documents can''t be deleted: void it instead' using errcode = 'WB420';
    end if;
    return old;
  end if;
  if old.status <> 'draft' and (to_jsonb(new) - v_fixed) <> (to_jsonb(old) - v_fixed) then
    raise exception 'issued documents can''t be edited: void it and duplicate it' using errcode = 'WB420';
  end if;
  if old.status = 'voided' and new.status <> 'voided' then
    raise exception 'a voided document stays voided' using errcode = 'WB420';
  end if;
  return new;
end;
$$;
revoke execute on function public.documents_guard() from public, anon, authenticated;
create trigger documents_guard before update or delete on public.documents for each row execute function public.documents_guard();

alter table public.documents enable row level security;
create policy "documents: members read" on public.documents for select to authenticated using (public.is_business_member(business_id));
-- Staff (agent and up) write drafts directly; numbering, issuing and voiding go through the functions below.
create policy "documents: staff create drafts" on public.documents for insert to authenticated
  with check (public.has_min_role(business_id, 'agent') and status = 'draft' and number is null and created_by = (select auth.uid()));
create policy "documents: staff edit drafts" on public.documents for update to authenticated
  using (public.has_min_role(business_id, 'agent') and status = 'draft')
  with check (public.has_min_role(business_id, 'agent') and status = 'draft' and number is null);
create policy "documents: staff delete drafts" on public.documents for delete to authenticated
  using (public.has_min_role(business_id, 'agent') and status = 'draft');

revoke all on public.documents from anon, authenticated;
grant select, delete on public.documents to authenticated;
grant insert (business_id, doc_type, template, language, currency, issue_date, due_date, customer_id, business_snapshot, customer_snapshot, items,
  discount, tax_rate, tax_label, subtotal, tax_amount, total, amount_paid, payment_method, payment_reference, notes, terms, duplicated_from, created_by)
  on public.documents to authenticated;
grant update (template, language, currency, issue_date, due_date, customer_id, business_snapshot, customer_snapshot, items,
  discount, tax_rate, tax_label, subtotal, tax_amount, total, amount_paid, payment_method, payment_reference, notes, terms)
  on public.documents to authenticated;
grant all on public.documents to service_role;

-- ---------------------------------------------------------------------------
-- Issue: give the next number and freeze the document.
-- Invoices and quotations: staff (agent and up). Receipts state that money was
-- received, so only owners and admins (who record payments) can issue them.
-- ---------------------------------------------------------------------------
create or replace function public.issue_document(p_document_id uuid)
returns public.documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents%rowtype;
  s public.document_settings%rowtype;
  v_prefix text;
  v_year integer;
  v_seq bigint;
  v_digits text;
begin
  select * into d from public.documents where id = p_document_id for update;
  if not found or not public.is_business_member(d.business_id) then
    raise exception 'document not found' using errcode = 'P0002';
  end if;
  if not public.has_min_role(d.business_id, case when d.doc_type = 'receipt' then 'admin' else 'agent' end) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if d.status <> 'draft' then
    raise exception 'only a draft can be issued' using errcode = 'WB420';
  end if;
  if d.doc_type = 'receipt' and (d.payment_method is null or d.amount_paid is null or d.amount_paid <= 0) then
    raise exception 'a receipt needs the amount received and the payment method' using errcode = '22023';
  end if;

  select * into s from public.document_settings where business_id = d.business_id;
  if not found then
    s.invoice_prefix := 'INV'; s.receipt_prefix := 'REC'; s.quotation_prefix := 'QUO';
    s.include_year := true; s.number_padding := 6;
  end if;
  v_prefix := case d.doc_type when 'invoice' then s.invoice_prefix when 'receipt' then s.receipt_prefix else s.quotation_prefix end;
  v_year := case when s.include_year then extract(year from d.issue_date)::integer else 0 end;

  insert into public.document_counters (business_id, doc_type, year, last_number)
  values (d.business_id, d.doc_type, v_year, 1)
  on conflict (business_id, doc_type, year) do update set last_number = public.document_counters.last_number + 1
  returning last_number into v_seq;

  v_digits := case when length(v_seq::text) >= s.number_padding then v_seq::text else lpad(v_seq::text, s.number_padding, '0') end;
  update public.documents
  set status = case when doc_type = 'quotation' then 'sent' else 'issued' end,
      number = v_prefix || '-' || case when s.include_year then v_year::text || '-' else '' end || v_digits,
      seq = v_seq,
      number_year = v_year,
      issued_at = now(),
      issued_by = (select auth.uid()),
      status_changed_at = now()
  where id = d.id
  returning * into d;

  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (d.business_id, (select auth.uid()), 'document.issued', 'document', d.id::text, jsonb_build_object('number', d.number, 'type', d.doc_type, 'total', d.total));
  return d;
end;
$$;
revoke execute on function public.issue_document(uuid) from public, anon;
grant execute on function public.issue_document(uuid) to authenticated;

-- Void (owners and admins): the document stays, marked void, with who, when and why.
create or replace function public.void_document(p_document_id uuid, p_reason text)
returns public.documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents%rowtype;
begin
  select * into d from public.documents where id = p_document_id for update;
  if not found or not public.is_business_member(d.business_id) then
    raise exception 'document not found' using errcode = 'P0002';
  end if;
  if not public.has_min_role(d.business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if d.status in ('draft', 'voided') then
    raise exception 'only an issued document can be voided (delete a draft instead)' using errcode = 'WB420';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'say why (at least 3 characters)' using errcode = '22023';
  end if;
  update public.documents
  set status = 'voided', voided_at = now(), voided_by = (select auth.uid()), void_reason = left(btrim(p_reason), 300), status_changed_at = now()
  where id = d.id
  returning * into d;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (d.business_id, (select auth.uid()), 'document.voided', 'document', d.id::text, jsonb_build_object('number', d.number, 'reason', d.void_reason));
  return d;
end;
$$;
revoke execute on function public.void_document(uuid, text) from public, anon;
grant execute on function public.void_document(uuid, text) to authenticated;

-- Quotations: sent → accepted / rejected (and back to sent if the customer changes their mind).
create or replace function public.set_quotation_status(p_document_id uuid, p_status text)
returns public.documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents%rowtype;
begin
  select * into d from public.documents where id = p_document_id for update;
  if not found or not public.is_business_member(d.business_id) then
    raise exception 'document not found' using errcode = 'P0002';
  end if;
  if not public.has_min_role(d.business_id, 'agent') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if d.doc_type <> 'quotation' or d.status not in ('sent', 'accepted', 'rejected') or p_status not in ('sent', 'accepted', 'rejected') then
    raise exception 'this status change is not possible' using errcode = 'WB420';
  end if;
  update public.documents set status = p_status, status_changed_at = now() where id = d.id returning * into d;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (d.business_id, (select auth.uid()), 'document.status', 'document', d.id::text, jsonb_build_object('number', d.number, 'status', p_status));
  return d;
end;
$$;
revoke execute on function public.set_quotation_status(uuid, text) from public, anon;
grant execute on function public.set_quotation_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Guest generator rate limit (server only, service role). Keys are hashes of
-- the visitor's IP address; rows are deleted after a day.
-- ---------------------------------------------------------------------------
create table public.guest_document_requests (
  id bigint generated always as identity primary key,
  key text not null check (char_length(key) <= 64),
  created_at timestamptz not null default now()
);
create index guest_document_requests_key_idx on public.guest_document_requests (key, created_at);
create index guest_document_requests_created_idx on public.guest_document_requests (created_at);
alter table public.guest_document_requests enable row level security;
revoke all on public.guest_document_requests from anon, authenticated;

create or replace function public.guest_document_allowed(p_key text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.guest_document_requests where created_at < now() - interval '1 day';
  if (select count(*) from public.guest_document_requests where key = p_key and created_at > now() - interval '1 hour') >= p_limit then
    return false;
  end if;
  insert into public.guest_document_requests (key) values (left(p_key, 64));
  return true;
end;
$$;
revoke execute on function public.guest_document_allowed(text, integer) from public, anon, authenticated;
grant execute on function public.guest_document_allowed(text, integer) to service_role;
