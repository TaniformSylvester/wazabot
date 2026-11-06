-- WazaBolt: plan payments in the business's currency.
--
-- A business in Zimbabwe pays its plan in US dollars (bank transfer): the
-- payment the WazaBolt team records must say USD, not the column's default
-- (XAF). A plan payment takes the business's currency; top-ups and setup fees
-- are sold in FCFA only and stay XAF. Additive: one trigger, no data changed
-- (every payment so far is from a business in Cameroon, in XAF).

create function public.subscription_payment_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'plan' then
    select b.currency into new.currency from public.businesses b where b.id = new.business_id;
  else
    new.currency := 'XAF';
  end if;
  new.currency := coalesce(new.currency, 'XAF');
  return new;
end;
$$;
revoke execute on function public.subscription_payment_currency() from public, anon, authenticated;

create trigger subscription_payments_currency
before insert on public.subscription_payments
for each row execute function public.subscription_payment_currency();
