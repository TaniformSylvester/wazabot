/*
 * "Resolve & hand back to AI" on a WhatsApp conversation.
 *
 * Conversations have no "ai_active" status: the status (open, pending,
 * resolved, archived) and who answers (ai_enabled: the assistant, or Human
 * Mode) are separate. Handing back therefore resolves the thread, switches the
 * assistant back on, clears "asked for a person" and the assignee, and
 * records who did it and when. A new message from the customer reopens the
 * thread as before (the inbound message function sets resolved → open).
 *
 * resolved_by is set by the database from the signed-in user, never sent by
 * the browser. Members who can act (agents and up) only.
 *
 * Non-destructive: two nullable columns and one function added.
 */

alter table public.conversations
  add column resolved_by uuid references auth.users (id) on delete set null,
  add column resolved_at timestamptz;
comment on column public.conversations.resolved_by is 'Who last resolved the conversation and handed it back to the assistant (resolve_and_hand_back).';
comment on column public.conversations.resolved_at is 'When it was last resolved and handed back to the assistant.';

create or replace function public.resolve_and_hand_back(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
begin
  select business_id into v_business from public.conversations where id = p_conversation_id;
  if v_business is null or not public.has_min_role(v_business, 'agent') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.conversations
  set status = 'resolved', ai_enabled = true, human_requested = false, assigned_to = null, unread_count = 0,
      resolved_by = (select auth.uid()), resolved_at = now(), updated_at = now()
  where id = p_conversation_id;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id)
  values (v_business, (select auth.uid()), 'conversation.resolved', 'conversation', p_conversation_id::text);
end;
$$;
revoke execute on function public.resolve_and_hand_back(uuid) from public, anon;
grant execute on function public.resolve_and_hand_back(uuid) to authenticated;
