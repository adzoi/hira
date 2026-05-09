alter table public.services
add column if not exists image_urls text[] not null default '{}';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'services_image_urls_max_3'
  ) then
    alter table public.services
      add constraint services_image_urls_max_3
      check (cardinality(image_urls) <= 3);
  end if;
end $$;

