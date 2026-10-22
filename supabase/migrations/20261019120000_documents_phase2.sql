-- =============================================================================
-- WazaBolt Docs (Phase 2): documents linked to orders, payments and customers.
-- Additive: new columns and one new table; existing rows are not changed.
-- =============================================================================
--
-- documents.order_id            an invoice made from an order (one live invoice per
--                               order), or a receipt for one of the order's payments.
-- documents.invoice_id          a receipt for a payment on that invoice.
-- documents.order_payment_id /
-- documents.invoice_payment_id  the recorded payment a receipt is for (one live
--                               receipt per payment).
-- documents.related             what the receipt / invoice printed about the
--                               linked document at the time (number, total,
--                               paid to date, balance) — part of the snapshot.
-- invoice_payments              payments recorded against an invoice that has no
--                               order. An order's invoice reuses order_payments.
--
-- Invoices move issued → partially_paid → paid by themselves, from the payments
-- recorded by staff (never from what a customer says). A receipt can only be
-- made from a recorded, not voided payment, so no receipt says "paid" for
-- money nobody recorded.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Payments recorded against invoices that have no order
-- ---------------------------------------------------------------------------
create table public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  document_id uuid not null,
  customer_id uuid,
  amount numeric(16, 2) not null check (amount > 0),
  method text not null check (method in ('cash', 'mtn_momo', 'orange_money', 'mobile_money', 'bank_transfer', 'card', 'cheque', 'other')),
  reference text check (char_length(reference) <= 100),
  note text check (char_length(note) <= 500),
  -- Same key = same payment (a double click records it once).
  client_key uuid not null default gen_random_uuid(),
  received_at timestamptz not null default now(),
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text check (char_length(void_reason) between 3 and 300),
  unique (business_id, id),
  unique (business_id, client_key),
  foreign key (business_id, document_id) references public.documents (business_id, id) on delete restrict,
  foreign key (business_id, customer_id) references public.customers (business_id, id) on delete set null (customer_id),
  constraint invoice_payments_void_reason check ((voided_at is null) = (void_reason is null))
);
create index invoice_payments_document_idx on public.invoice_payments (business_id, document_id);
create index invoice_payments_customer_idx on public.invoice_payments (business_id, customer_id) where customer_id is not null;
alter table public.invoice_payments enable row level security;
create policy "invoice_payments: members read" on public.invoice_payments for select to authenticated using (public.is_business_member(business_id));
-- Written only by record_invoice_payment / void_invoice_payment.
revoke all on public.invoice_payments from anon, authenticated;
grant select on public.invoice_payments to authenticated;
grant all on public.invoice_payments to service_role;

-- ---------------------------------------------------------------------------
-- Links on documents
-- ---------------------------------------------------------------------------
alter table public.documents
  add column order_id uuid,
  add column invoice_id uuid,
  add column order_payment_id uuid,
  add column invoice_payment_id uuid,
  add column related jsonb check (related is null or jsonb_typeof(related) = 'object'),
  add constraint documents_order_fk foreign key (business_id, order_id) references public.orders (business_id, id) on delete set null (order_id),
  add constraint documents_invoice_fk foreign key (business_id, invoice_id) references public.documents (business_id, id) on delete set null (invoice_id),
  add constraint documents_order_payment_fk foreign key (order_payment_id) references public.order_payments (id) on delete set null,
  add constraint documents_invoice_payment_fk foreign key (business_id, invoice_payment_id) references public.invoice_payments (business_id, id) on delete set null (invoice_payment_id),
  add constraint documents_links_by_type check (
    (doc_type = 'quotation' and order_id is null and invoice_id is null and order_payment_id is null and invoice_payment_id is null)
    or (doc_type = 'invoice' and invoice_id is null and order_payment_id is null and invoice_payment_id is null)
    or (doc_type = 'receipt' and (order_payment_id is null or invoice_payment_id is null))
  );
-- One live invoice per order; one live receipt per payment.
create unique index documents_order_invoice_key on public.documents (business_id, order_id)
  where doc_type = 'invoice' and order_id is not null and status <> 'voided';
create unique index documents_order_payment_receipt_key on public.documents (order_payment_id)
  where order_payment_id is not null and status <> 'voided';
create unique index documents_invoice_payment_receipt_key on public.documents (invoice_payment_id)
  where invoice_payment_id is not null and status <> 'voided';
create index documents_order_idx on public.documents (business_id, order_id) where order_id is not null;
create index documents_invoice_idx on public.documents (business_id, invoice_id) where invoice_id is not null;

-- Receipts for order payments can say "Mobile money" (the orders' method list has it).
alter table public.documents drop constraint documents_payment_method_check;
alter table public.documents add constraint documents_payment_method_check
  check (payment_method in ('cash', 'mtn_momo', 'orange_money', 'mobile_money', 'bank_transfer', 'card', 'cheque', 'other'));

-- The links and the snapshot are set by the functions below only (no column grants).

/*
 * An issued document is a record (Phase 1), with three additions:
 *   - links to a customer, order or payment that is deleted are cleared (the
 *     snapshot keeps the details), so deleting them still works;
 *   - an invoice's amount paid follows its payments (only through
 *     _refresh_invoice_paid, which sets wazabolt.invoice_paid for its update);
 *   - an invoice with payments recorded against it can't be voided until they
 *     are voided (an order's invoice can: the payments belong to the order).
 * Issued documents are still never deleted, except with their business.
 */
create or replace function public.documents_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fixed text[] := array['status', 'status_changed_at', 'voided_at', 'voided_by', 'void_reason', 'updated_at'];
  v_new jsonb;
  v_old jsonb;
  k text;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' and exists (select 1 from public.businesses where id = old.business_id) then
      raise exception 'issued documents can''t be deleted: void it instead' using errcode = 'WB420';
    end if;
    return old;
  end if;
  if old.status <> 'draft' then
    v_new := to_jsonb(new) - v_fixed;
    v_old := to_jsonb(old) - v_fixed;
    foreach k in array array['customer_id', 'order_id', 'invoice_id', 'order_payment_id', 'invoice_payment_id'] loop
      if v_new -> k = 'null'::jsonb then
        v_new := v_new - k;
        v_old := v_old - k;
      end if;
    end loop;
    if new.doc_type = 'invoice' and current_setting('wazabolt.invoice_paid', true) = 'on' then
      v_new := v_new - 'amount_paid';
      v_old := v_old - 'amount_paid';
    end if;
    if v_new <> v_old then
      raise exception 'issued documents can''t be edited: void it and duplicate it' using errcode = 'WB420';
    end if;
  end if;
  if old.status = 'voided' and new.status <> 'voided' then
    raise exception 'a voided document stays voided' using errcode = 'WB420';
  end if;
  if new.status = 'voided' and old.status <> 'voided' and new.doc_type = 'invoice'
     and exists (select 1 from public.invoice_payments where business_id = new.business_id and document_id = new.id and voided_at is null) then
    raise exception 'this invoice has payments: void them first' using errcode = 'WB420';
  end if;
  return new;
end;
$$;
revoke execute on function public.documents_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Issuing: as in Phase 1, except that a receipt made from a recorded payment
-- can be issued by staff (agent and up: the people who record payments).
-- Standalone receipts still need an owner or admin. An invoice starts with
-- nothing paid, whatever its draft said: only recorded payments count.
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
  if not public.has_min_role(d.business_id,
       case when d.doc_type = 'receipt' and d.order_payment_id is null and d.invoice_payment_id is null then 'admin' else 'agent' end) then
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
      status_changed_at = now(),
      amount_paid = case when doc_type = 'invoice' then 0 else amount_paid end
  where id = d.id
  returning * into d;

  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (d.business_id, (select auth.uid()), 'document.issued', 'document', d.id::text, jsonb_build_object('number', d.number, 'type', d.doc_type, 'total', d.total));
  return d;
end;
$$;
revoke execute on function public.issue_document(uuid) from public, anon;
grant execute on function public.issue_document(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- An invoice's amount paid and status, from its payments
-- ---------------------------------------------------------------------------
/*
 * Standalone invoice: the sum of its live invoice_payments.
 * Order's invoice: what the order received, less refunds.
 * issued (nothing paid) → partially_paid → paid. Voided invoices don't change.
 */
create function public._refresh_invoice_paid(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents%rowtype;
  v_paid numeric(16, 2);
  v_status text;
begin
  select * into d from public.documents where id = p_document_id for update;
  if not found or d.doc_type <> 'invoice' or d.status in ('draft', 'voided') then
    return;
  end if;
  if d.order_id is not null then
    select greatest(amount_paid - amount_refunded, 0) into v_paid from public.orders where business_id = d.business_id and id = d.order_id;
  else
    select coalesce(sum(amount), 0) into v_paid from public.invoice_payments where business_id = d.business_id and document_id = d.id and voided_at is null;
  end if;
  v_paid := coalesce(v_paid, d.amount_paid, 0);
  v_status := case when v_paid > 0 and v_paid >= d.total then 'paid' when v_paid > 0 then 'partially_paid' else 'issued' end;
  if v_paid is not distinct from d.amount_paid and v_status = d.status then
    return;
  end if;
  perform set_config('wazabolt.invoice_paid', 'on', true);
  update public.documents
  set amount_paid = v_paid,
      status = v_status,
      status_changed_at = case when v_status <> d.status then now() else status_changed_at end
  where id = d.id;
  perform set_config('wazabolt.invoice_paid', 'off', true);
end;
$$;
revoke execute on function public._refresh_invoice_paid(uuid) from public, anon, authenticated;

-- An order's payments, refunds and voids move its invoice.
create function public.orders_refresh_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.documents
    where business_id = new.business_id and order_id = new.id and doc_type = 'invoice' and status in ('issued', 'partially_paid', 'paid')
  loop
    perform public._refresh_invoice_paid(v_id);
  end loop;
  return null;
end;
$$;
revoke execute on function public.orders_refresh_invoice() from public, anon, authenticated;
create trigger orders_refresh_invoice after update of amount_paid, amount_refunded on public.orders
  for each row when (old.amount_paid is distinct from new.amount_paid or old.amount_refunded is distinct from new.amount_refunded)
  execute function public.orders_refresh_invoice();

-- A payment with a receipt can't be voided until the receipt is voided.
create function public.order_payments_receipt_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text;
begin
  if old.voided_at is null and new.voided_at is not null then
    select number into v_number from public.documents where order_payment_id = new.id and status <> 'voided' limit 1;
    if v_number is not null then
      raise exception 'this payment has receipt %: void the receipt first', v_number using errcode = 'WB420';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.order_payments_receipt_guard() from public, anon, authenticated;
create trigger order_payments_receipt_guard before update of voided_at on public.order_payments
  for each row execute function public.order_payments_receipt_guard();

-- ---------------------------------------------------------------------------
-- Small helpers (not callable by users)
-- ---------------------------------------------------------------------------
-- The business's "today", in its time zone.
create function public._business_today(p_business_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone coalesce((select timezone from public.businesses where id = p_business_id), 'Africa/Douala'))::date;
$$;
revoke execute on function public._business_today(uuid) from public, anon, authenticated;

-- A customer as printed on a document (same fields as the editor fills in).
create function public._customer_snapshot(p_business_id uuid, p_customer_id uuid, p_address text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', coalesce(nullif(btrim(c.name), ''), '+' || c.whatsapp_phone),
    'reference', c.reference,
    'address', coalesce(nullif(btrim(p_address), ''), c.city),
    'phone', case when c.whatsapp_phone is not null then '+' || c.whatsapp_phone end,
    'email', c.email,
    'website', null)
  from public.customers c where c.business_id = p_business_id and c.id = p_customer_id;
$$;
revoke execute on function public._customer_snapshot(uuid, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Invoice from an order (staff): lines, delivery, discount and totals come
-- from the order (never from the browser). Issued straight away, numbered;
-- one live invoice per order (void it to make a new one).
-- p_business_snapshot is the business's own profile, built by the app.
-- ---------------------------------------------------------------------------
create function public.create_order_invoice(
  p_order_id uuid, p_business_snapshot jsonb,
  p_template text default null, p_language text default null, p_due_date date default null,
  p_notes text default null, p_terms text default null
)
returns public.documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders%rowtype;
  s public.document_settings%rowtype;
  v_lang text;
  v_template text;
  v_today date;
  v_items jsonb;
  v_customer jsonb;
  v_id uuid;
  d public.documents%rowtype;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or not public.is_business_member(o.business_id) then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if not public.has_min_role(o.business_id, 'agent') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if o.status in ('cancelled', 'returned') then
    raise exception 'this order is cancelled or returned' using errcode = '22023';
  end if;
  if exists (select 1 from public.documents where business_id = o.business_id and order_id = o.id and doc_type = 'invoice' and status <> 'voided') then
    raise exception 'this order already has an invoice' using errcode = 'WB420';
  end if;
  if p_business_snapshot is null or jsonb_typeof(p_business_snapshot) <> 'object' or coalesce(btrim(p_business_snapshot ->> 'name'), '') = '' then
    raise exception 'business details missing' using errcode = '22023';
  end if;

  select * into s from public.document_settings where business_id = o.business_id;
  v_lang := coalesce(nullif(p_language, ''), s.default_language,
    case when (select default_language from public.businesses where id = o.business_id) = 'fr' then 'fr' else 'en' end);
  if v_lang not in ('en', 'fr') then v_lang := 'en'; end if;
  v_template := coalesce(nullif(p_template, ''), s.default_template, 'modern');
  v_today := public._business_today(o.business_id);
  if p_due_date is not null and p_due_date < v_today then
    raise exception 'the due date is before the invoice date' using errcode = '22023';
  end if;

  -- Lines in the order they were added, then delivery.
  select coalesce(jsonb_agg(jsonb_build_object(
           'description', i.product_name,
           'details', nullif(concat_ws(' · ', nullif(i.variant, ''), nullif(i.sku, '')), ''),
           'quantity', i.quantity, 'unitPrice', i.unit_price, 'discountPercent', 0,
           'productId', i.product_id, 'variantId', i.variant_id, 'serviceId', null) order by i.ctid), '[]'::jsonb)
  into v_items
  from public.order_items i where i.business_id = o.business_id and i.order_id = o.id;
  if o.delivery_fee > 0 then
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'description', case when v_lang = 'fr' then 'Livraison' else 'Delivery' end, 'details', null,
      'quantity', 1, 'unitPrice', o.delivery_fee, 'discountPercent', 0, 'productId', null, 'variantId', null, 'serviceId', null));
  end if;
  if jsonb_array_length(v_items) = 0 then
    raise exception 'this order has no items' using errcode = '22023';
  end if;
  if jsonb_array_length(v_items) > 200 then
    raise exception 'too many lines for one invoice' using errcode = '22023';
  end if;

  v_customer := case when o.customer_id is not null then public._customer_snapshot(o.business_id, o.customer_id, o.delivery_address) end;
  if v_customer is null then
    v_customer := jsonb_build_object(
      'name', coalesce(nullif(btrim(o.recipient_name), ''), case when v_lang = 'fr' then 'Client de passage' else 'Walk-in customer' end),
      'reference', null, 'address', nullif(btrim(o.delivery_address), ''),
      'phone', nullif(btrim(o.recipient_phone), ''), 'email', null, 'website', null);
  end if;

  insert into public.documents (business_id, doc_type, template, language, currency, issue_date, due_date, customer_id,
                                business_snapshot, customer_snapshot, items, discount, tax_rate, subtotal, tax_amount, total,
                                notes, terms, order_id, related, created_by)
  values (o.business_id, 'invoice', v_template, v_lang, o.currency, v_today,
          coalesce(p_due_date, v_today + coalesce(s.default_due_days, 14)), o.customer_id,
          p_business_snapshot, v_customer, v_items, o.discount, 0, o.subtotal + o.delivery_fee, 0, o.total,
          coalesce(nullif(btrim(p_notes), ''), s.default_notes), coalesce(nullif(btrim(p_terms), ''), s.default_terms),
          o.id, jsonb_build_object('kind', 'order', 'number', o.order_number), (select auth.uid()))
  returning id into v_id;

  perform public.issue_document(v_id);
  perform public._refresh_invoice_paid(v_id);
  select * into d from public.documents where id = v_id;
  return d;
end;
$$;
revoke execute on function public.create_order_invoice(uuid, jsonb, text, text, date, text, text) from public, anon;
grant execute on function public.create_order_invoice(uuid, jsonb, text, text, date, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Payments against an invoice (staff, recorded by hand — WazaBolt takes no
-- payment). An order's invoice records an order payment (the same money,
-- seen on the order and on the invoice). Same key = same payment.
-- ---------------------------------------------------------------------------
create function public.record_invoice_payment(
  p_document_id uuid, p_amount numeric, p_method text,
  p_reference text default null, p_client_key uuid default null,
  p_received_at timestamptz default null, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents%rowtype;
  v_id uuid;
  v_key uuid := coalesce(p_client_key, gen_random_uuid());
begin
  select * into d from public.documents where id = p_document_id for update;
  if not found or not public.is_business_member(d.business_id) then
    raise exception 'document not found' using errcode = 'P0002';
  end if;
  if not public.has_min_role(d.business_id, 'agent') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if d.order_id is not null then
    if d.doc_type <> 'invoice' or d.status = 'draft' or d.status = 'voided' then
      raise exception 'payments are recorded on issued invoices' using errcode = 'WB420';
    end if;
    if p_method not in ('cash', 'mtn_momo', 'orange_money', 'mobile_money', 'bank_transfer', 'card', 'other') then
      raise exception 'unknown payment method' using errcode = '22023';
    end if;
    -- Checks what the order still owes and records it once per key.
    return public.record_order_payment(d.business_id, d.order_id, p_amount, p_method, p_reference, v_key, p_received_at, p_note);
  end if;

  select id into v_id from public.invoice_payments where business_id = d.business_id and client_key = v_key;
  if found then
    return v_id;
  end if;
  if d.doc_type <> 'invoice' or d.status not in ('issued', 'partially_paid') then
    raise exception 'payments are recorded on issued invoices that aren''t paid or voided' using errcode = 'WB420';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > d.total - coalesce(d.amount_paid, 0) then
    raise exception 'the amount is more than what is owed' using errcode = '22023';
  end if;
  insert into public.invoice_payments (business_id, document_id, customer_id, amount, method, reference, note, client_key, received_at, recorded_by)
  values (d.business_id, d.id, d.customer_id, p_amount, p_method, nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''),
          v_key, public._payment_time(p_received_at), (select auth.uid()))
  returning id into v_id;
  perform public._refresh_invoice_paid(d.id);
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (d.business_id, (select auth.uid()), 'invoice.payment', 'document', d.id::text, jsonb_build_object('number', d.number, 'amount', p_amount, 'method', p_method, 'payment_id', v_id));
  return v_id;
end;
$$;
revoke execute on function public.record_invoice_payment(uuid, numeric, text, text, uuid, timestamptz, text) from public, anon;
grant execute on function public.record_invoice_payment(uuid, numeric, text, text, uuid, timestamptz, text) to authenticated;

-- Owners/admins: void a payment recorded by mistake (kept, marked voided). Not while it has a live receipt.
create function public.void_invoice_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.invoice_payments%rowtype;
  v_number text;
begin
  select * into p from public.invoice_payments where id = p_payment_id for update;
  if not found or not public.is_business_member(p.business_id) then
    raise exception 'payment not found' using errcode = 'P0002';
  end if;
  if not public.has_min_role(p.business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p.voided_at is not null then
    raise exception 'this payment is already voided' using errcode = 'WB420';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  select number into v_number from public.documents where invoice_payment_id = p.id and status <> 'voided' limit 1;
  if v_number is not null then
    raise exception 'this payment has receipt %: void the receipt first', v_number using errcode = 'WB420';
  end if;
  update public.invoice_payments set voided_at = now(), voided_by = (select auth.uid()), void_reason = left(btrim(p_reason), 300) where id = p.id;
  perform public._refresh_invoice_paid(p.document_id);
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p.business_id, (select auth.uid()), 'invoice.payment_voided', 'document', p.document_id::text, jsonb_build_object('payment_id', p.id, 'amount', p.amount, 'reason', left(btrim(p_reason), 300)));
end;
$$;
revoke execute on function public.void_invoice_payment(uuid, text) from public, anon;
grant execute on function public.void_invoice_payment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Receipt for a recorded payment (staff). p_source: 'order' (an
-- order_payments row) or 'invoice' (an invoice_payments row). The amount,
-- method, reference and date are the payment's; the receipt also prints the
-- invoice / order it pays, its total, what was paid up to and including this
-- payment (another payment recorded at the very same moment isn't counted),
-- and the balance left. Issued straight away. A second call for the same
-- payment returns the existing receipt.
-- ---------------------------------------------------------------------------
create function public.create_payment_receipt(
  p_source text, p_payment_id uuid, p_business_snapshot jsonb,
  p_template text default null, p_language text default null
)
returns public.documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  op public.order_payments%rowtype;
  ip public.invoice_payments%rowtype;
  o public.orders%rowtype;
  inv public.documents%rowtype;
  s public.document_settings%rowtype;
  d public.documents%rowtype;
  v_business uuid;
  v_amount numeric(16, 2);
  v_method text;
  v_reference text;
  v_received timestamptz;
  v_total numeric(16, 2);
  v_paid numeric(16, 2);
  v_lang text;
  v_customer_id uuid;
  v_customer jsonb;
  v_number text;
  v_kind text;
  v_label text;
  v_id uuid;
begin
  if p_source = 'order' then
    select * into op from public.order_payments where id = p_payment_id for update;
    if not found or not public.is_business_member(op.business_id) then
      raise exception 'payment not found' using errcode = 'P0002';
    end if;
    v_business := op.business_id;
  elsif p_source = 'invoice' then
    select * into ip from public.invoice_payments where id = p_payment_id for update;
    if not found or not public.is_business_member(ip.business_id) then
      raise exception 'payment not found' using errcode = 'P0002';
    end if;
    v_business := ip.business_id;
  else
    raise exception 'unknown payment' using errcode = '22023';
  end if;
  if not public.has_min_role(v_business, 'agent') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into d from public.documents
  where business_id = v_business and status <> 'voided'
    and ((p_source = 'order' and order_payment_id = p_payment_id) or (p_source = 'invoice' and invoice_payment_id = p_payment_id));
  if found then
    return d;
  end if;
  if p_business_snapshot is null or jsonb_typeof(p_business_snapshot) <> 'object' or coalesce(btrim(p_business_snapshot ->> 'name'), '') = '' then
    raise exception 'business details missing' using errcode = '22023';
  end if;

  select * into s from public.document_settings where business_id = v_business;
  if p_source = 'order' then
    if op.kind <> 'payment' or op.voided_at is not null then
      raise exception 'a receipt is only for a recorded payment that isn''t voided' using errcode = 'WB420';
    end if;
    select * into o from public.orders where business_id = v_business and id = op.order_id;
    select * into inv from public.documents
    where business_id = v_business and order_id = o.id and doc_type = 'invoice' and status <> 'voided' and status <> 'draft';
    v_amount := op.amount; v_method := op.method; v_reference := op.reference; v_received := op.received_at;
    v_total := o.total;
    select coalesce(sum(amount), 0) into v_paid from public.order_payments
    where business_id = v_business and order_id = o.id and kind = 'payment' and voided_at is null
      and (received_at < op.received_at or (received_at = op.received_at and (created_at < op.created_at or id = op.id)));
    v_customer_id := o.customer_id;
    v_kind := case when inv.id is not null then 'invoice' else 'order' end;
    v_number := coalesce(inv.number, o.order_number);
  else
    if ip.voided_at is not null then
      raise exception 'a receipt is only for a recorded payment that isn''t voided' using errcode = 'WB420';
    end if;
    select * into inv from public.documents where business_id = v_business and id = ip.document_id;
    v_amount := ip.amount; v_method := ip.method; v_reference := ip.reference; v_received := ip.received_at;
    v_total := inv.total;
    select coalesce(sum(amount), 0) into v_paid from public.invoice_payments
    where business_id = v_business and document_id = inv.id and voided_at is null
      and (received_at < ip.received_at or (received_at = ip.received_at and (created_at < ip.created_at or id = ip.id)));
    v_customer_id := inv.customer_id;
    v_kind := 'invoice';
    v_number := inv.number;
  end if;

  v_lang := coalesce(nullif(p_language, ''), inv.language, s.default_language,
    case when (select default_language from public.businesses where id = v_business) = 'fr' then 'fr' else 'en' end);
  if v_lang not in ('en', 'fr') then v_lang := 'en'; end if;

  if p_source = 'invoice' then
    v_customer := inv.customer_snapshot;
  else
    v_customer := coalesce(inv.customer_snapshot,
      case when v_customer_id is not null then public._customer_snapshot(v_business, v_customer_id, null) end,
      jsonb_build_object('name', coalesce(nullif(btrim(o.recipient_name), ''), case when v_lang = 'fr' then 'Client de passage' else 'Walk-in customer' end),
                         'reference', null, 'address', null, 'phone', nullif(btrim(o.recipient_phone), ''), 'email', null, 'website', null));
  end if;

  v_label := case
    when v_lang = 'fr' and v_kind = 'invoice' then 'Paiement — facture ' || v_number
    when v_lang = 'fr' then 'Paiement — commande ' || v_number
    when v_kind = 'invoice' then 'Payment — invoice ' || v_number
    else 'Payment — order ' || v_number end;

  insert into public.documents (business_id, doc_type, template, language, currency, issue_date, customer_id,
                                business_snapshot, customer_snapshot, items, discount, tax_rate, subtotal, tax_amount, total,
                                amount_paid, payment_method, payment_reference, notes, terms,
                                order_id, invoice_id, order_payment_id, invoice_payment_id, related, created_by)
  values (v_business, 'receipt', coalesce(nullif(p_template, ''), inv.template, s.default_template, 'modern'), v_lang,
          coalesce(inv.currency, o.currency),
          (v_received at time zone coalesce((select timezone from public.businesses where id = v_business), 'Africa/Douala'))::date,
          v_customer_id, p_business_snapshot, v_customer,
          jsonb_build_array(jsonb_build_object('description', v_label, 'details', null, 'quantity', 1, 'unitPrice', v_amount, 'discountPercent', 0,
                                               'productId', null, 'variantId', null, 'serviceId', null)),
          0, 0, v_amount, 0, v_amount, v_amount, v_method, left(v_reference, 80), null, null,
          case when p_source = 'order' then o.id end, inv.id,
          case when p_source = 'order' then op.id end, case when p_source = 'invoice' then ip.id end,
          jsonb_build_object('kind', v_kind, 'number', v_number, 'orderNumber', o.order_number,
                             'total', v_total, 'paidToDate', v_paid, 'balance', greatest(v_total - v_paid, 0)),
          (select auth.uid()))
  returning id into v_id;

  perform public.issue_document(v_id);
  select * into d from public.documents where id = v_id;
  return d;
end;
$$;
revoke execute on function public.create_payment_receipt(text, uuid, jsonb, text, text) from public, anon;
grant execute on function public.create_payment_receipt(text, uuid, jsonb, text, text) to authenticated;
