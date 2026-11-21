-- ---------------------------------------------------------------------------
-- WazaBolt Schools: the principal's signature and the school stamp, printed on
-- every PDF report card.
--
-- The images are kept in a private bucket (school-seals): no public URL and no
-- storage policy for signed-in users, so nobody can fetch a school's signature
-- or stamp to forge a report card. Only the server (service role) uploads and
-- reads them, after checking that the user is the school's owner or manager.
-- The paths on school_settings can only be set by the server too, and always
-- point inside the school's own folder.
-- ---------------------------------------------------------------------------

alter table public.school_settings
  add column principal_signature_path text,
  add column school_stamp_path text;

alter table public.school_settings
  add constraint school_settings_signature_path_check
    check (principal_signature_path is null or (char_length(principal_signature_path) <= 200 and principal_signature_path like business_id::text || '/signature/%')),
  add constraint school_settings_stamp_path_check
    check (school_stamp_path is null or (char_length(school_stamp_path) <= 200 and school_stamp_path like business_id::text || '/stamp/%'));

create function public.guard_school_seals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Requests from the app (signed-in or anonymous) can't set the paths; the server's service role can.
  if (tg_op = 'INSERT' and (new.principal_signature_path is not null or new.school_stamp_path is not null))
     or (tg_op = 'UPDATE' and (new.principal_signature_path is distinct from old.principal_signature_path
                               or new.school_stamp_path is distinct from old.school_stamp_path)) then
    if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
      raise exception 'the signature and stamp are set by the server' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_school_seals() from public, anon, authenticated;
create trigger school_settings_guard_seals before insert or update on public.school_settings
  for each row execute function public.guard_school_seals();

-- The private bucket. Skipped where Supabase Storage isn't installed (plain Postgres tests).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('school-seals', 'school-seals', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = false;
  end if;
end $$;
