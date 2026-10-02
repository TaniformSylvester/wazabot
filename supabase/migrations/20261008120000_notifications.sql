-- WazaBolt — Stage 7: customer notifications and WhatsApp message templates
--
--   whatsapp_templates      the business's message templates on Meta (WazaBolt's standard texts),
--                           with Meta's review status (pending → approved / rejected …)
--   notification_settings   which automatic messages the business sends
--   notifications           one row per notification attempt (sent / failed / skipped + reason),
--                           unique per order status or appointment event, so nothing is sent twice
--
-- Inside WhatsApp's 24-hour window a notification is a normal text message; outside it,
-- WhatsApp only allows an approved template. Written by the server (service role) only.

create table public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('order_confirmed', 'order_ready', 'order_out_for_delivery', 'order_delivered',
                                     'appointment_booked', 'appointment_reminder', 'appointment_cancelled', 'follow_up')),
  -- Meta's template name and language code (one name, one row per language).
  name text not null check (name ~ '^[a-z0-9_]+$' and char_length(name) <= 512),
  language text not null check (language ~ '^[a-z]{2}(_[A-Z]{2})?$'),
  body text not null check (char_length(body) <= 1024),
  meta_template_id text check (char_length(meta_template_id) <= 64),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paused', 'disabled', 'failed')),
  rejected_reason text check (char_length(rejected_reason) <= 300),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, kind, language)
);

create table public.notification_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  order_updates boolean not null default true,
  appointment_updates boolean not null default true,
  appointment_reminders boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.notification_settings (business_id) select id from public.businesses on conflict do nothing;
create function public.businesses_notification_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_settings (business_id) values (new.id) on conflict do nothing;
  return null;
end;
$$;
create trigger businesses_notification_settings after insert on public.businesses
  for each row execute function public.businesses_notification_settings();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (char_length(kind) <= 40),
  customer_id uuid,
  order_id uuid,
  appointment_id uuid,
  -- e.g. the order status it announces; with the kind it makes the notification unique.
  event_key text not null check (char_length(event_key) <= 120),
  status text not null check (status in ('sent', 'failed', 'skipped')),
  -- How it went out (text inside the 24-hour window, template outside) or why it didn't.
  channel text check (channel in ('text', 'template')),
  reason text check (char_length(reason) <= 80),
  message_id uuid,
  created_at timestamptz not null default now(),
  unique (business_id, event_key),
  foreign key (business_id, customer_id) references public.customers (business_id, id) on delete cascade,
  foreign key (business_id, order_id) references public.orders (business_id, id) on delete cascade,
  foreign key (business_id, appointment_id) references public.appointments (business_id, id) on delete cascade
);
create index notifications_order_idx on public.notifications (business_id, order_id) where order_id is not null;
create index notifications_appointment_idx on public.notifications (business_id, appointment_id) where appointment_id is not null;

create trigger whatsapp_templates_set_updated_at before update on public.whatsapp_templates for each row execute function public.set_updated_at();
create trigger notification_settings_set_updated_at before update on public.notification_settings for each row execute function public.set_updated_at();

alter table public.whatsapp_templates enable row level security;
alter table public.notification_settings enable row level security;
alter table public.notifications enable row level security;

create policy "whatsapp_templates: members read" on public.whatsapp_templates for select to authenticated using (public.is_business_member(business_id));
create policy "notification_settings: members read" on public.notification_settings for select to authenticated using (public.is_business_member(business_id));
create policy "notification_settings: admins update" on public.notification_settings for update to authenticated
  using (public.has_min_role(business_id, 'admin')) with check (public.has_min_role(business_id, 'admin'));
create policy "notifications: members read" on public.notifications for select to authenticated using (public.is_business_member(business_id));

revoke all on public.whatsapp_templates, public.notification_settings, public.notifications from anon, authenticated;
grant select on public.whatsapp_templates, public.notification_settings, public.notifications to authenticated;
grant update (order_updates, appointment_updates, appointment_reminders) on public.notification_settings to authenticated;
grant all on public.whatsapp_templates, public.notification_settings, public.notifications to service_role;
