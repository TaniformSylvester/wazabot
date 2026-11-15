/*
 * Handoff failsafe: a chat left in Human Mode goes back to the AI assistant
 * after 30 minutes without the team, so no customer is stranded.
 *
 *  - conversations.handoff_expires_at: set to now + 30 min when a chat starts
 *    waiting for a person (Human Mode, or "asked for a person") and again
 *    each time a team member's reply is recorded; cleared when the chat goes
 *    back to the assistant or is resolved. Set by triggers, so every path
 *    counts (the assistant's own handoff, Take Over, a reply, a flag).
 *  - resume_ai_after_idle(): the AI answers again, with a system note in the
 *    thread ("AI resumed after 30m idle"). Server only; the app calls it when
 *    a customer writes on an expired thread (before the assistant replies),
 *    and in a light cleanup for idle threads where the team spoke last — a
 *    customer still waiting for an answer is never taken out of the queue
 *    without writing again. Only where the assistant is really live (the
 *    app checks it; until launch nothing resumes).
 *  - extend_handoff(): "+30 min" for members who can reply.
 *
 * There's no "ai_active" status: status (open/pending/resolved/archived) and
 * who answers (ai_enabled) are separate; resuming sets ai_enabled.
 *
 * Non-destructive: one nullable column, functions and triggers added.
 */

alter table public.conversations add column handoff_expires_at timestamptz;
comment on column public.conversations.handoff_expires_at is 'While a person handles the chat: when the AI assistant may take it back (30 min after the handoff or the team''s last reply). Null when the assistant answers.';
create index conversations_handoff_expiry_idx on public.conversations (handoff_expires_at) where handoff_expires_at is not null;

/* A chat is with the team while it is open or pending and in Human Mode or flagged for a person. */
create or replace function public._with_team(p_ai_enabled boolean, p_human_requested boolean, p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (not p_ai_enabled or p_human_requested) and p_status in ('open', 'pending');
$$;

create or replace function public.conversations_handoff_timer()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_now_with boolean := public._with_team(new.ai_enabled, new.human_requested, new.status);
  v_was_with boolean := tg_op = 'UPDATE' and public._with_team(old.ai_enabled, old.human_requested, old.status);
begin
  if not v_now_with then
    -- Back with the assistant, or resolved: no timer.
    new.handoff_expires_at := null;
  elsif not v_was_with then
    -- Just started waiting for a person: 30 minutes (a value given on insert is kept).
    new.handoff_expires_at := case when tg_op = 'INSERT' then coalesce(new.handoff_expires_at, now() + interval '30 minutes') else now() + interval '30 minutes' end;
  end if;
  -- Still with the team: the timer stays as it is (or as extended).
  return new;
end;
$$;
create trigger conversations_handoff_timer before insert or update of ai_enabled, human_requested, status, handoff_expires_at on public.conversations
  for each row execute function public.conversations_handoff_timer();

/* A team member's reply restarts the 30 minutes. */
create or replace function public.messages_handoff_timer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.direction = 'outbound' and new.sender_type = 'agent' then
    update public.conversations set handoff_expires_at = now() + interval '30 minutes'
    where id = new.conversation_id and business_id = new.business_id
      and public._with_team(ai_enabled, human_requested, status);
  end if;
  return null;
end;
$$;
revoke execute on function public.messages_handoff_timer() from public, anon, authenticated;
create trigger messages_handoff_timer after insert on public.messages
  for each row execute function public.messages_handoff_timer();

-- Threads already waiting for a person when this runs: 30 minutes from now.
update public.conversations set handoff_expires_at = now() + interval '30 minutes'
where public._with_team(ai_enabled, human_requested, status) and handoff_expires_at is null;

/*
 * The AI answers again: Human Mode off, the flag and assignee cleared, a note
 * in the thread. Only for a thread that is with the team and whose time is up;
 * returns whether it resumed. Server (service role) only.
 */
create or replace function public.resume_ai_after_idle(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.conversations%rowtype;
begin
  select * into v_conv from public.conversations where id = p_conversation_id for update;
  if not found or not public._with_team(v_conv.ai_enabled, v_conv.human_requested, v_conv.status)
     or v_conv.handoff_expires_at is null or v_conv.handoff_expires_at > now() then
    return false;
  end if;
  update public.conversations
  set ai_enabled = true, human_requested = false, assigned_to = null, status = 'open', handoff_expires_at = null, updated_at = now()
  where id = p_conversation_id;
  -- A note for the team, never sent to the customer (no delivery) and kept out of the assistant's history.
  insert into public.messages (business_id, conversation_id, direction, sender_type, message_type, content, payload, processing_status)
  values (v_conv.business_id, p_conversation_id, 'outbound', 'system', 'text', 'AI resumed after 30m idle', jsonb_build_object('note', 'ai_resumed', 'minutes', 30), 'processed');
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id)
  values (v_conv.business_id, null, 'conversation.ai_resumed', 'conversation', p_conversation_id::text);
  return true;
end;
$$;
revoke execute on function public.resume_ai_after_idle(uuid) from public, anon, authenticated;
grant execute on function public.resume_ai_after_idle(uuid) to service_role;

/* "+30 min": the team keeps the chat a little longer (members who can reply). Returns the new time. */
create or replace function public.extend_handoff(p_conversation_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.conversations%rowtype;
  v_until timestamptz;
begin
  select * into v_conv from public.conversations where id = p_conversation_id for update;
  if not found or not public.has_min_role(v_conv.business_id, 'agent') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not public._with_team(v_conv.ai_enabled, v_conv.human_requested, v_conv.status) then
    raise exception 'not with the team' using errcode = '22023';
  end if;
  v_until := greatest(coalesce(v_conv.handoff_expires_at, now()), now()) + interval '30 minutes';
  update public.conversations set handoff_expires_at = v_until where id = p_conversation_id;
  return v_until;
end;
$$;
revoke execute on function public.extend_handoff(uuid) from public, anon;
grant execute on function public.extend_handoff(uuid) to authenticated;
