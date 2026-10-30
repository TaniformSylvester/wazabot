-- WazaBolt — the public shop page (www.wazabolt.com/s/<slug>), for every plan.
--
-- A page anyone can open without an account: the business's name, logo,
-- city, hours and branches, and its active products with price, photo and
-- whether they're in stock (never quantities, costs or customers), each with
-- an "Order on WhatsApp" button. Off until the owner or an admin switches it
-- on in Settings: it publishes the catalogue.
--
-- The page is read on the server with the service role and shows only these
-- public fields, so no read access changes here. Additive: one column and one
-- function.

alter table public.businesses add column shop_enabled boolean not null default false;
comment on column public.businesses.shop_enabled is 'The public shop page (/s/<slug>) is on: name, logo, city, hours, branches and active products with prices.';

/* Owner or admin switches the shop page on or off. */
create function public.set_shop_enabled(p_business_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_min_role(p_business_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.businesses set shop_enabled = p_enabled where id = p_business_id;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, (select auth.uid()), case when p_enabled then 'shop.enabled' else 'shop.disabled' end, 'business', p_business_id::text, '{}'::jsonb);
end;
$$;
revoke execute on function public.set_shop_enabled(uuid, boolean) from public, anon;
grant execute on function public.set_shop_enabled(uuid, boolean) to authenticated;
