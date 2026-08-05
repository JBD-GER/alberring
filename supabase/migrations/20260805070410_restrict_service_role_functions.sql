-- The previous blanket SECURITY DEFINER hardening migration intentionally
-- removed PUBLIC/anon access, but accidentally granted every function to the
-- authenticated role. These two entry points are internal setup/automation
-- APIs and must remain callable only with the service role.
revoke execute on function public.publish_scheduled_news(uuid)
  from public, anon, authenticated;
grant execute on function public.publish_scheduled_news(uuid)
  to service_role;

revoke execute on function public.bootstrap_first_admin(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.bootstrap_first_admin(uuid, text, text, text)
  to service_role;
