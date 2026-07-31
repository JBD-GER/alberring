-- Messaging write paths and secure direct-conversation creation.
create policy message_reactions_member_read on public.message_reactions
for select using (
  exists (select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id))
);

create policy message_reactions_own_insert on public.message_reactions
for insert with check (
  profile_id=private.current_profile_id()
  and exists (select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id))
);

create policy message_reactions_own_delete on public.message_reactions
for delete using (profile_id=private.current_profile_id());

create policy message_receipts_member_read on public.message_read_receipts
for select using (
  exists (select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id))
);

create policy message_receipts_own_insert on public.message_read_receipts
for insert with check (
  profile_id=private.current_profile_id()
  and exists (select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id))
);

create policy messages_own_update on public.messages
for update using (
  sender_id=private.current_profile_id()
  and private.is_conversation_member(conversation_id)
  and created_at > now() - interval '15 minutes'
) with check (
  sender_id=private.current_profile_id()
  and organization_id=private.current_organization_id()
);

create or replace function public.get_or_create_direct_conversation(other_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  me uuid := private.current_profile_id();
  org uuid := private.current_organization_id();
  result uuid;
begin
  if me is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if other_profile_id=me then raise exception 'self_conversation_not_allowed' using errcode='22023'; end if;
  if not private.has_permission('messages.use') then raise exception 'permission_denied' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=other_profile_id and p.organization_id=org and p.status='active') then
    raise exception 'profile_not_available' using errcode='22023';
  end if;

  select c.id into result
  from public.conversations c
  where c.organization_id=org and c.type='direct' and c.archived_at is null
    and (select count(*) from public.conversation_members cm where cm.conversation_id=c.id)=2
    and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.profile_id=me)
    and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.profile_id=other_profile_id)
  limit 1;

  if result is null then
    insert into public.conversations(organization_id,type,created_by) values(org,'direct',me) returning id into result;
    insert into public.conversation_members(conversation_id,profile_id,organization_id) values(result,me,org),(result,other_profile_id,org);
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(org,me,'conversation.direct_created','conversation',result,'{}');
  end if;
  return result;
end;
$$;

revoke all on function public.get_or_create_direct_conversation(uuid) from public;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

-- Realtime emits only rows that pass the subscriber's RLS policies.
alter publication supabase_realtime add table public.messages;
