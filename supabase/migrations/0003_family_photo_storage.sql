-- Private bucket for family photos. Only unlocked phones with a name picked can read;
-- only the server (service role) uploads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('family', 'family', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false;

create policy family_photos_household_read on storage.objects
  for select to authenticated
  using (bucket_id = 'family' and public.is_household());
