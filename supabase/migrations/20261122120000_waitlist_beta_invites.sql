/*
 * Beta invites from the waitlist: the WazaBolt team sends a lead a personal
 * sign-up link (/register?beta=…) by WhatsApp. It lets that one person
 * create an account while sign-up is closed (waitlist mode): locked to the
 * lead's email, valid 14 days, used once. Sending a new invite replaces the
 * old link. Only the link's sha256 is stored.
 *
 * Non-destructive: nullable columns and one index on waitlist_leads.
 */

alter table public.waitlist_leads
  add column invite_token_hash text,
  add column invited_at timestamptz,
  add column invite_expires_at timestamptz,
  add column joined_at timestamptz;

comment on column public.waitlist_leads.invite_token_hash is 'sha256 of the current beta sign-up link (the link itself is only in the WhatsApp message).';
comment on column public.waitlist_leads.invited_at is 'When the WazaBolt team last sent a beta invite.';
comment on column public.waitlist_leads.invite_expires_at is 'The beta link works until then (14 days).';
comment on column public.waitlist_leads.joined_at is 'When the lead created their account with the link (the link no longer works after).';

create unique index waitlist_leads_invite_token_key on public.waitlist_leads (invite_token_hash) where invite_token_hash is not null;
