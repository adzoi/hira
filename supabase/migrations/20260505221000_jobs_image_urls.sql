alter table public.jobs
add column if not exists image_urls text[] not null default '{}';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'jobs_image_urls_max_3'
  ) then
    alter table public.jobs
      add constraint jobs_image_urls_max_3
      check (cardinality(image_urls) <= 3);
  end if;
end $$;

