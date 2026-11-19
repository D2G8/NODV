-- Saved-datasets library for Ocean Data Explorer.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create table if not exists public.datasets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  file_name text not null check (char_length(file_name) between 1 and 255),
  format text not null check (format in ('odv', 'csv', 'excel')),
  storage_path text not null unique,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  station_count integer not null default 0,
  sample_count integer not null default 0,
  variable_count integer not null default 0,
  first_date timestamptz,
  last_date timestamptz,
  import_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists datasets_created_at_idx on public.datasets (created_at desc);

alter table public.datasets enable row level security;

-- The app has no user accounts: anyone holding the publishable key can list, add and remove
-- datasets. Tighten these policies (e.g. to authenticated users) if the data is sensitive.
drop policy if exists "datasets are readable" on public.datasets;
create policy "datasets are readable" on public.datasets for select to anon, authenticated using (true);

drop policy if exists "datasets can be added" on public.datasets;
create policy "datasets can be added" on public.datasets for insert to anon, authenticated with check (true);

drop policy if exists "datasets can be removed" on public.datasets;
create policy "datasets can be removed" on public.datasets for delete to anon, authenticated using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'datasets',
  'datasets',
  false,
  26214400,
  array[
    'text/plain',
    'text/csv',
    'text/tab-separated-values',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/octet-stream'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "dataset files are readable" on storage.objects;
create policy "dataset files are readable" on storage.objects for select to anon, authenticated
  using (bucket_id = 'datasets');

drop policy if exists "dataset files can be added" on storage.objects;
create policy "dataset files can be added" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'datasets');

drop policy if exists "dataset files can be removed" on storage.objects;
create policy "dataset files can be removed" on storage.objects for delete to anon, authenticated
  using (bucket_id = 'datasets');
