-- Validate metadata without requiring general SELECT access to the private chat.
-- Access remains limited by the existing member/report authorization helper.
create function private.can_read_message_attachment_metadata(
 p_organization_id uuid,p_conversation_id uuid,p_message_id uuid,p_uploaded_by uuid
) returns boolean language sql stable security definer
set search_path=pg_catalog,public as $$
 select p_organization_id=private.current_organization_id()
 and private.can_access_message_attachment(p_conversation_id,p_message_id)
 and exists(select 1 from public.messages m
   where m.id=p_message_id and m.conversation_id=p_conversation_id
   and m.organization_id=p_organization_id and m.sender_id=p_uploaded_by
   and m.retracted_at is null)
$$;
revoke all on function private.can_read_message_attachment_metadata(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function private.can_read_message_attachment_metadata(uuid,uuid,uuid,uuid) to authenticated;

alter policy message_attachments_member_read on public.message_attachments using (
 organization_id=private.current_organization_id()
 and message_id is not null
 and storage_path like organization_id::text||'/'||conversation_id::text||'/'||message_id::text||'/%'
 and private.can_read_message_attachment_metadata(organization_id,conversation_id,message_id,uploaded_by)
);
