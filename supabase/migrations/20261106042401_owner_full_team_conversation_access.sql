-- Ensure the company owner has full oversight and operation access to every
-- team conversation in their own company, including conversations where they
-- are not a participant. Other members remain limited to their own threads.
drop policy if exists team_conversations_select on public.team_conversations;
create policy team_conversations_select
on public.team_conversations
for select to authenticated
using (
  public.is_company_member(company_id)
  and (
    created_by = (select auth.uid())
    or private.is_team_conversation_member(id)
    or public.has_company_role(company_id, array['owner']::text[])
  )
);

drop policy if exists team_members_select_participants on public.team_conversation_members;
create policy team_members_select_participants
on public.team_conversation_members
for select to authenticated
using (
  public.is_company_member(company_id)
  and (
    private.is_team_conversation_member(conversation_id)
    or public.has_company_role(company_id, array['owner']::text[])
  )
);

drop policy if exists team_messages_select_participant on public.team_messages;
create policy team_messages_select_participant
on public.team_messages
for select to authenticated
using (
  public.is_company_member(company_id)
  and (
    exists (
      select 1
      from public.team_conversation_members m
      where m.conversation_id = team_messages.conversation_id
        and m.user_id = (select auth.uid())
        and m.company_id = team_messages.company_id
    )
    or public.has_company_role(company_id, array['owner']::text[])
  )
);

drop policy if exists team_messages_insert_participant on public.team_messages;
create policy team_messages_insert_participant
on public.team_messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and public.is_company_member(company_id)
  and char_length(body) between 1 and 4000
  and (
    exists (
      select 1
      from public.team_conversation_members m
      where m.conversation_id = team_messages.conversation_id
        and m.user_id = (select auth.uid())
        and m.company_id = team_messages.company_id
    )
    or public.has_company_role(company_id, array['owner']::text[])
  )
);
