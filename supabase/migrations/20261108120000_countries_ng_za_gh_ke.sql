-- WazaBolt: Nigeria, South Africa, Ghana and Kenya.
--
-- Four more country packs: a business signing up in one of them gets its
-- currency, time zone and English (handle_new_auth_user and
-- set_business_country already read the packs). Additive: data only.

insert into public.country_packs (country_code, english_name, currency, timezone, default_language, status) values
  ('NG', 'Nigeria', 'NGN', 'Africa/Lagos', 'en', 'active'),
  ('ZA', 'South Africa', 'ZAR', 'Africa/Johannesburg', 'en', 'active'),
  ('GH', 'Ghana', 'GHS', 'Africa/Accra', 'en', 'active'),
  ('KE', 'Kenya', 'KES', 'Africa/Nairobi', 'en', 'active')
on conflict (country_code) do nothing;

insert into public.country_pack_languages (country_code, language_code, sort_order) values
  ('NG', 'en', 1),
  ('ZA', 'en', 1),
  ('GH', 'en', 1),
  ('KE', 'en', 1)
on conflict do nothing;
