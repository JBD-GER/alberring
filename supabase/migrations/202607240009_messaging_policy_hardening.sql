-- Keep reply targets, attachments and pins inside the conversation selected by
-- the new row. Explicit target-table qualification prevents PostgreSQL from
-- resolving both sides of the comparison to the inner subquery alias.

drop policy if exists messages_member_insert on public.messages;
create policy messages_member_insert
on public.messages
for insert
with check (
  messages.organization_id = private.current_organization_id()
  and messages.sender_id = private.current_profile_id()
  and private.can_post_conversation(messages.conversation_id)
  and (
    messages.reply_to_id is null
    or exists (
      select 1
      from public.messages reply_message
      where reply_message.id = messages.reply_to_id
        and reply_message.conversation_id = messages.conversation_id
        and reply_message.organization_id = messages.organization_id
    )
  )
);

drop policy if exists message_attachments_member_insert on public.message_attachments;
create policy message_attachments_member_insert
on public.message_attachments
for insert
with check (
  message_attachments.organization_id = private.current_organization_id()
  and message_attachments.uploaded_by = private.current_profile_id()
  and private.can_post_conversation(message_attachments.conversation_id)
  and (
    message_attachments.message_id is null
    or exists (
      select 1
      from public.messages attached_message
      where attached_message.id = message_attachments.message_id
        and attached_message.conversation_id =
          message_attachments.conversation_id
        and attached_message.organization_id =
          message_attachments.organization_id
    )
  )
);

drop policy if exists conversation_pins_member_insert on public.conversation_pins;
create policy conversation_pins_member_insert
on public.conversation_pins
for insert
with check (
  conversation_pins.organization_id = private.current_organization_id()
  and conversation_pins.pinned_by = private.current_profile_id()
  and private.is_conversation_member(conversation_pins.conversation_id)
  and exists (
    select 1
    from public.messages pinned_message
    where pinned_message.id = conversation_pins.message_id
      and pinned_message.conversation_id =
        conversation_pins.conversation_id
      and pinned_message.organization_id =
        conversation_pins.organization_id
  )
);

notify pgrst, 'reload schema';
