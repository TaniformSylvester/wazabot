-- WazaBolt — running conversation summary (Step 3 of the margin work)
--
-- The assistant only sends the last few messages of a conversation to Claude; what was said
-- before (what the customer wants, chosen items, sizes, delivery place…) is kept in a short
-- running summary the assistant itself updates. Written by the server only; members can read it.

alter table public.conversations
  add column ai_summary text check (char_length(ai_summary) <= 800),
  add column ai_summary_updated_at timestamptz;
