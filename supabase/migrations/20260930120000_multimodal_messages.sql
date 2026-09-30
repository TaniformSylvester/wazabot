-- WazaBolt — multimodal messages
--
-- Every WhatsApp message has a type. The MVP processes TEXT end to end;
-- AUDIO (voice notes → transcription) and IMAGE (vision + catalog lookup)
-- are stored with their own tables so they can be switched on without a
-- redesign. DOCUMENT, VIDEO and LOCATION are stored but not processed yet.
--
--   messages.message_type        text | image | audio | document | video | location
--   messages.processing_status   what the pipeline did with the message
--   message_media                one row per media file (private storage path, never a public URL)
--   message_transcriptions       speech-to-text for audio, kept separate from the media
--   message_image_analyses       what the vision model saw + catalog matches it verified
--
-- Media bytes live in the private Storage bucket `whatsapp-media`. Nobody
-- reads the bucket directly: the server checks membership and hands out
-- short-lived signed URLs (lib/messaging/media-store.ts).

-- ---------------------------------------------------------------------------
-- Message type and processing state
-- ---------------------------------------------------------------------------
alter table public.messages
  add column message_type text not null default 'text'
    check (message_type in ('text', 'image', 'audio', 'document', 'video', 'location')),
  -- WhatsApp's own message id (wamid…): makes webhook retries idempotent.
  add column whatsapp_message_id text check (char_length(whatsapp_message_id) <= 256),
  -- Caption sent with an image/video/document. `body` stays the text the AI reads
  -- (typed text, or the transcription/caption once processed).
  add column caption text check (char_length(caption) <= 4096),
  -- Type-specific data that isn't media, e.g. a shared location
  -- {"latitude":4.05,"longitude":9.7,"name":"…","address":"…"}.
  add column payload jsonb not null default '{}'::jsonb,
  add column processing_status text not null default 'processed'
    check (processing_status in ('received', 'processing', 'processed', 'failed', 'unsupported')),
  -- Short machine-readable reason when failed/unsupported (never message content).
  add column processing_error text check (char_length(processing_error) <= 80);

create unique index messages_business_whatsapp_id_key
  on public.messages (business_id, whatsapp_message_id)
  where whatsapp_message_id is not null;

-- Lets child tables reference (business_id, id) so they can never point at another tenant's message.
alter table public.messages add constraint messages_business_id_id_key unique (business_id, id);

-- ---------------------------------------------------------------------------
-- Media files
-- ---------------------------------------------------------------------------
create table public.message_media (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  message_id uuid not null,
  kind text not null check (kind in ('image', 'audio', 'document', 'video')),
  -- WhatsApp media id, used once to download the file with the server-side token.
  whatsapp_media_id text check (char_length(whatsapp_media_id) <= 256),
  mime_type text not null check (char_length(mime_type) <= 100),
  size_bytes bigint check (size_bytes >= 0),
  sha256 text check (sha256 ~ '^[A-Za-z0-9+/=]{40,88}$|^[0-9a-f]{64}$'),
  -- True for WhatsApp voice notes (recorded in the app), false for forwarded audio files.
  is_voice boolean not null default false,
  duration_seconds real check (duration_seconds >= 0),
  width integer check (width > 0),
  height integer check (height > 0),
  original_filename text check (char_length(original_filename) <= 255),
  -- Private storage location. Path layout: <business_id>/<message_id>/<media_id>.<ext>
  storage_bucket text not null default 'whatsapp-media',
  storage_path text check (char_length(storage_path) <= 512),
  status text not null default 'pending' check (status in ('pending', 'stored', 'failed', 'deleted')),
  -- When the file should be deleted under the retention policy (null = keep).
  delete_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, message_id) references public.messages (business_id, id) on delete cascade,
  check (status <> 'stored' or storage_path is not null),
  check (storage_path is null or storage_path like business_id::text || '/%')
);
create index message_media_message_idx on public.message_media (business_id, message_id);
create index message_media_delete_after_idx on public.message_media (delete_after) where delete_after is not null and status = 'stored';

-- ---------------------------------------------------------------------------
-- Voice-note transcriptions (separate from the media on purpose)
-- ---------------------------------------------------------------------------
create table public.message_transcriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  message_id uuid not null,
  media_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  transcript text check (char_length(transcript) <= 20000),
  -- Language the transcript is in (detected by the pipeline, see lib/ai/language).
  language text references public.languages (code),
  language_confidence real check (language_confidence between 0 and 1),
  -- Speech-to-text engine confidence, when the provider reports one.
  confidence real check (confidence between 0 and 1),
  provider text check (char_length(provider) <= 40),
  model text check (char_length(model) <= 80),
  error_code text check (char_length(error_code) <= 80),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (business_id, media_id),
  foreign key (business_id, message_id) references public.messages (business_id, id) on delete cascade,
  foreign key (business_id, media_id) references public.message_media (business_id, id) on delete cascade,
  check (status <> 'completed' or transcript is not null)
);

-- ---------------------------------------------------------------------------
-- Image understanding
-- ---------------------------------------------------------------------------
create table public.message_image_analyses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  message_id uuid not null,
  media_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  -- Short neutral description from the vision model, for the team and the AI context.
  description text check (char_length(description) <= 2000),
  -- Text visible in the image (labels, receipts), if any.
  extracted_text text check (char_length(extracted_text) <= 4000),
  -- Products the catalog search returned for this image, with how sure the match is:
  -- [{"product_id":"…","confidence":0.92,"reason":"label text matches SKU"}].
  -- Price/stock always come from the catalog row, never from this analysis.
  catalog_matches jsonb not null default '[]'::jsonb check (jsonb_typeof(catalog_matches) = 'array'),
  -- What the assistant did: answered from a confident match, asked the customer, or handed over.
  outcome text check (outcome in ('matched', 'asked_clarification', 'handed_over', 'not_product')),
  provider text check (char_length(provider) <= 40),
  model text check (char_length(model) <= 80),
  error_code text check (char_length(error_code) <= 80),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (business_id, media_id),
  foreign key (business_id, message_id) references public.messages (business_id, id) on delete cascade,
  foreign key (business_id, media_id) references public.message_media (business_id, id) on delete cascade
);

create trigger message_media_set_updated_at before update on public.message_media
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: team members can read their business's media records.
-- All writes come from the server (webhook / processing jobs, service role).
-- ---------------------------------------------------------------------------
alter table public.message_media enable row level security;
alter table public.message_transcriptions enable row level security;
alter table public.message_image_analyses enable row level security;

create policy "message_media: members read" on public.message_media
  for select to authenticated using (public.is_business_member(business_id));
create policy "message_transcriptions: members read" on public.message_transcriptions
  for select to authenticated using (public.is_business_member(business_id));
create policy "message_image_analyses: members read" on public.message_image_analyses
  for select to authenticated using (public.is_business_member(business_id));

revoke all on public.message_media, public.message_transcriptions, public.message_image_analyses from anon, authenticated;
grant select on public.message_media, public.message_transcriptions, public.message_image_analyses to authenticated;
grant all on public.message_media, public.message_transcriptions, public.message_image_analyses to service_role;

-- ---------------------------------------------------------------------------
-- Private Storage bucket for WhatsApp media (Supabase Storage).
-- No storage policies are added: browsers can't list or read it. The server
-- (service role) uploads files and creates short-lived signed URLs after
-- checking that the viewer belongs to the business.
-- Skipped automatically where Supabase Storage isn't installed (plain Postgres tests).
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'whatsapp-media', 'whatsapp-media', false,
      -- WhatsApp Cloud API limits: images 5 MB, audio 16 MB, video 16 MB, documents 100 MB.
      104857600,
      array[
        'image/jpeg', 'image/png', 'image/webp',
        'audio/ogg', 'audio/opus', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr',
        'video/mp4', 'video/3gpp',
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain'
      ]
    )
    on conflict (id) do update set public = false;
  end if;
end $$;
