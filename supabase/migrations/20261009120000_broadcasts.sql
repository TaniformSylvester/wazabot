-- WazaBolt — Stage 8: broadcasts (promotions to customers who opted in)
--
--   customers.marketing_opt_in   the customer agreed to receive promotions (set by the team with the
--                                customer's consent, or by the customer texting START); STOP turns it off.
--   broadcasts                   a message to a group of opted-in customers: its own MARKETING template
--                                on Meta (review status), audience (tags, language), progress counts.
--   broadcast_recipients         who it was for and what happened, one row per customer (never twice).
--
-- Sending happens on the server (service role); members read, owners/admins create and send.

alter table public.customers
  add column marketing_opt_in boolean not null default false,
  add column marketing_opt_in_at timestamptz,
  add column marketing_opt_out_at timestamptz;

grant update (marketing_opt_in) on public.customers to authenticated;
grant insert (marketing_opt_in) on public.customers to authenticated;

-- When the opt-in changes, remember when (proof of consent / of the opt-out).
create function public.customers_marketing_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.marketing_opt_in then new.marketing_opt_in_at := now(); end if;
  elsif new.marketing_opt_in is distinct from old.marketing_opt_in then
    if new.marketing_opt_in then
      new.marketing_opt_in_at := now();
    else
      new.marketing_opt_out_at := now();
    end if;
  end if;
  return new;
end;
$$;
create trigger customers_marketing_timestamps before insert or update of marketing_opt_in on public.customers
  for each row execute function public.customers_marketing_timestamps();

create index customers_marketing_idx on public.customers (business_id) where marketing_opt_in;

create table public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  language text not null check (language in ('en', 'fr')),
  -- The message as approved by Meta (may start with "Hello {{1}}," for the customer's name).
  body text not null check (char_length(body) between 1 and 1024),
  personalized boolean not null default false,
  template_name text not null check (template_name ~ '^[a-z0-9_]+$' and char_length(template_name) <= 512),
  meta_template_id text check (char_length(meta_template_id) <= 64),
  template_status text not null default 'draft' check (template_status in ('draft', 'pending', 'approved', 'rejected', 'paused', 'disabled', 'failed')),
  template_reason text check (char_length(template_reason) <= 300),
  -- Audience: opted-in customers with any of these tags (empty = all) and this language (null = all).
  audience_tags text[] not null default '{}',
  audience_language text check (audience_language in ('en', 'fr', 'wes')),
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'cancelled')),
  recipients_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (business_id, id),
  unique (business_id, template_name)
);
create index broadcasts_business_idx on public.broadcasts (business_id, created_at desc);

create table public.broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  broadcast_id uuid not null,
  customer_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  error text check (char_length(error) <= 200),
  message_id uuid,
  sent_at timestamptz,
  unique (broadcast_id, customer_id),
  foreign key (business_id, broadcast_id) references public.broadcasts (business_id, id) on delete cascade,
  foreign key (business_id, customer_id) references public.customers (business_id, id) on delete cascade
);
create index broadcast_recipients_pending_idx on public.broadcast_recipients (broadcast_id) where status = 'pending';

create trigger broadcasts_set_updated_at before update on public.broadcasts for each row execute function public.set_updated_at();
create trigger broadcasts_audit after insert or update of status or delete on public.broadcasts
  for each row execute function public.audit_change('broadcast');

alter table public.broadcasts enable row level security;
alter table public.broadcast_recipients enable row level security;
create policy "broadcasts: members read" on public.broadcasts for select to authenticated using (public.is_business_member(business_id));
create policy "broadcasts: admins delete drafts" on public.broadcasts for delete to authenticated
  using (public.has_min_role(business_id, 'admin') and status = 'draft');
create policy "broadcast_recipients: members read" on public.broadcast_recipients for select to authenticated using (public.is_business_member(business_id));

revoke all on public.broadcasts, public.broadcast_recipients from anon, authenticated;
grant select, delete on public.broadcasts to authenticated;
grant select on public.broadcast_recipients to authenticated;
grant all on public.broadcasts, public.broadcast_recipients to service_role;

/*
 * Freezes the audience of a broadcast: opted-in customers of the business
 * matching its tags/language, with a WhatsApp number. Called by the server
 * when sending starts; returns the number of recipients.
 */
create function public.prepare_broadcast(p_broadcast_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.broadcasts%rowtype;
  v_count integer;
begin
  select * into v_b from public.broadcasts where id = p_broadcast_id for update;
  if not found or v_b.status <> 'draft' then
    raise exception 'broadcast is not a draft' using errcode = '22023';
  end if;
  insert into public.broadcast_recipients (business_id, broadcast_id, customer_id)
  select c.business_id, v_b.id, c.id
  from public.customers c
  where c.business_id = v_b.business_id
    and c.marketing_opt_in
    and coalesce(c.whatsapp_phone, '') <> ''
    and (cardinality(v_b.audience_tags) = 0 or c.tags && v_b.audience_tags)
    and (v_b.audience_language is null or c.preferred_language = v_b.audience_language)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  update public.broadcasts set status = 'sending', recipients_count = v_count, started_at = now() where id = v_b.id;
  return v_count;
end;
$$;
revoke execute on function public.prepare_broadcast(uuid) from public, anon, authenticated;
grant execute on function public.prepare_broadcast(uuid) to service_role;
