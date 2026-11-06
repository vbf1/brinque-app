-- Allow the company owner to manage participants in any conversation
-- within their own company. Conversation creators retain their existing
-- ability to add members when the target is a member of the same company.
drop policy if exists team_members_insert_creator on public.team_conversation_members;
create policy team_members_insert_creator_or_owner
on public.team_conversation_members
for insert to authenticated
with check (
  is_company_member(company_id)
  and exists (
    select 1 from public.company_members cm
    where cm.company_id = team_conversation_members.company_id
      and cm.user_id = team_conversation_members.user_id
  )
  and exists (
    select 1 from public.team_conversations c
    where c.id = team_conversation_members.conversation_id
      and c.company_id = team_conversation_members.company_id
      and (
        c.created_by = (select auth.uid())
        or has_company_role(team_conversation_members.company_id, array['owner']::text[])
      )
  )
);
drop policy if exists team_members_delete_owner on public.team_conversation_members;
create policy team_members_delete_owner
on public.team_conversation_members
for delete to authenticated
using (
  is_company_member(company_id)
  and has_company_role(company_id, array['owner']::text[])
  and exists (
    select 1 from public.team_conversations c
    where c.id = team_conversation_members.conversation_id
      and c.company_id = team_conversation_members.company_id
  )
);
