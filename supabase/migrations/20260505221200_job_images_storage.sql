insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-images',
  'job-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'job_images_public_read'
  ) then
    create policy job_images_public_read
      on storage.objects
      for select
      using (bucket_id = 'job-images');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'job_images_owner_insert'
  ) then
    create policy job_images_owner_insert
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'job-images'
        and split_part(name, '/', 1) in (
          select hp.id::text
          from public.hirer_profiles hp
          where hp.user_id = auth.uid()
        )
      );
  end if;
end $$;

