-- The SQL-standard wrapper binds its private call at creation time. Pin its
-- execution search path too, matching the restricted internal implementation.
alter function public.admin_delete_unused_invited_user(uuid,uuid)
  set search_path = pg_catalog;
