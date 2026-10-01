-- WazaBolt — Stage 3: AI replies on WhatsApp (Claude)
--
--   create_order()   the assistant (running on the server with the service role)
--                    may record an order for the customer it is talking to; team
--                    members still need the agent role. Prices always come from
--                    the catalog.
--   ai_usage         one row per AI reply attempt: model, tokens, tool calls,
--                    duration and outcome — for cost control and debugging.
--                    Never message content.

create or replace function public.create_order(
  p_business_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_conversation_id uuid default null,
  p_delivery_fee numeric default 0,
  p_discount numeric default 0,
  p_delivery_address text default null,
  p_payment_method text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_seq bigint;
  v_currency char(3);
  v_subtotal numeric(14, 2) := 0;
  v_item jsonb;
  v_qty integer;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  v_name text;
  v_variant_label text;
  v_price numeric(14, 2);
begin
  if (select auth.role()) is distinct from 'service_role' and not public.has_min_role(p_business_id, 'agent') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'an order needs between 1 and 100 items' using errcode = '22023';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id and business_id = p_business_id) then
    raise exception 'unknown customer' using errcode = '22023';
  end if;
  if p_conversation_id is not null and not exists (
    select 1 from public.conversations where id = p_conversation_id and business_id = p_business_id and customer_id = p_customer_id
  ) then
    raise exception 'unknown conversation' using errcode = '22023';
  end if;
  if coalesce(p_delivery_fee, 0) < 0 or coalesce(p_discount, 0) < 0 then
    raise exception 'fees and discounts cannot be negative' using errcode = '22023';
  end if;

  select currency into v_currency from public.businesses where id = p_business_id;

  insert into public.business_counters (business_id) values (p_business_id) on conflict do nothing;
  update public.business_counters set order_seq = order_seq + 1 where business_id = p_business_id returning order_seq into v_seq;

  -- Amounts are filled in once the items are known (the totals check must hold at every step).
  insert into public.orders (id, business_id, customer_id, conversation_id, order_number, currency,
                             delivery_address, payment_method, notes, created_by)
  values (v_order_id, p_business_id, p_customer_id, p_conversation_id, 'ORD-' || lpad(v_seq::text, 5, '0'), v_currency,
          nullif(btrim(p_delivery_address), ''), p_payment_method, nullif(btrim(p_notes), ''), (select auth.uid()));

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item ->> 'quantity')::integer, 1);
    if v_qty < 1 then
      raise exception 'quantity must be at least 1' using errcode = '22023';
    end if;
    v_variant_label := null;

    if v_item ? 'product_id' and nullif(v_item ->> 'product_id', '') is not null then
      select * into v_product from public.products
      where id = (v_item ->> 'product_id')::uuid and business_id = p_business_id;
      if not found then
        raise exception 'unknown product' using errcode = '22023';
      end if;
      v_name := v_product.name;
      v_price := v_product.price;
      if nullif(v_item ->> 'variant_id', '') is not null then
        select * into v_variant from public.product_variants
        where id = (v_item ->> 'variant_id')::uuid and product_id = v_product.id and business_id = p_business_id;
        if not found then
          raise exception 'unknown variant' using errcode = '22023';
        end if;
        v_price := greatest(v_price + v_variant.price_modifier, 0);
        v_variant_label := v_variant.name || ': ' || v_variant.value;
      end if;
    else
      v_name := nullif(btrim(v_item ->> 'name'), '');
      v_price := (v_item ->> 'unit_price')::numeric;
      if v_name is null or v_price is null or v_price < 0 then
        raise exception 'custom items need a name and a price' using errcode = '22023';
      end if;
      v_product.id := null;
    end if;

    insert into public.order_items (business_id, order_id, product_id, product_name, variant, quantity, unit_price, total)
    values (p_business_id, v_order_id, v_product.id, v_name, v_variant_label, v_qty, v_price, v_price * v_qty);
    v_subtotal := v_subtotal + v_price * v_qty;
    v_product.id := null;
  end loop;

  if coalesce(p_discount, 0) > v_subtotal + coalesce(p_delivery_fee, 0) then
    raise exception 'discount is larger than the order' using errcode = '22023';
  end if;

  update public.orders
  set subtotal = v_subtotal,
      delivery_fee = coalesce(p_delivery_fee, 0),
      discount = coalesce(p_discount, 0),
      total = v_subtotal + coalesce(p_delivery_fee, 0) - coalesce(p_discount, 0)
  where id = v_order_id;

  return v_order_id;
end;
$$;

grant execute on function public.create_order(uuid, uuid, jsonb, uuid, numeric, numeric, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- AI usage log
-- ---------------------------------------------------------------------------
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  conversation_id uuid,
  -- The customer message that triggered the run, and the reply sent (if any).
  inbound_message_id uuid,
  reply_message_id uuid,
  model text not null check (char_length(model) <= 80),
  outcome text not null check (outcome in ('replied', 'handed_over', 'skipped', 'failed')),
  -- Short machine-readable reason (e.g. plan_limit, refusal, api_error) — never content.
  reason text check (char_length(reason) <= 80),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  tool_calls integer not null default 0 check (tool_calls >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  created_at timestamptz not null default now(),
  foreign key (business_id, conversation_id) references public.conversations (business_id, id) on delete set null (conversation_id)
);
create index ai_usage_business_created_idx on public.ai_usage (business_id, created_at desc);

alter table public.ai_usage enable row level security;
-- Owners and admins can see their own business's AI usage; only the server writes it.
create policy "ai_usage: admins read" on public.ai_usage
  for select to authenticated using (public.has_min_role(business_id, 'admin'));
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;
grant select, insert on public.ai_usage to service_role;
