-- Application binaries contain no employee data. Downloads still require an
-- active employee in an active organization; only trusted operators can upload.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('app-releases', 'app-releases', false, 52428800,
  array['application/vnd.android.package-archive', 'application/octet-stream'])
on conflict (id) do nothing;

create policy storage_app_releases_read on storage.objects
for select to authenticated
using (
  bucket_id = 'app-releases'
  and name ~ '^android/Alberring-[0-9]+\.[0-9]+\.[0-9]+-[0-9]+\.apk$'
  and (select private.current_profile_id()) is not null
);
