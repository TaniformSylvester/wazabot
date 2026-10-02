-- WazaBolt — Stage 5 follow-up: businesses choose whether the assistant looks at customers' photos.
-- Off: photos are passed to the team with a short notice (no AI cost).
alter table public.ai_settings
  add column photo_understanding boolean not null default true;

grant update (photo_understanding) on public.ai_settings to authenticated;
