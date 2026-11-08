-- WazaBolt: plans are paid in US dollars outside Cameroon.
--
-- A business in Nigeria, South Africa, Ghana or Kenya keeps its own currency
-- for its shop (naira, rand, cedi, shillings) but pays its WazaBolt plan in
-- US dollars, like Zimbabwe, by bank transfer. A plan payment is therefore
-- recorded in FCFA for a business in FCFA, and in US dollars for every other
-- business (config/economics.ts planCurrencyFor). Top-ups and setup fees stay
-- FCFA. Replaces the function from 20261107120000; no data changed.

create or replace function public.subscription_payment_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_currency text;
begin
  if new.kind = 'plan' then
    select b.currency into v_currency from public.businesses b where b.id = new.business_id;
    new.currency := case when coalesce(v_currency, 'XAF') = 'XAF' then 'XAF' else 'USD' end;
  else
    new.currency := 'XAF';
  end if;
  return new;
end;
$$;
revoke execute on function public.subscription_payment_currency() from public, anon, authenticated;
