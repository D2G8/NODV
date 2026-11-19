-- Saved-datasets library for Ocean Data Explorer.
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- Only the app's server, using the project's secret key, reads or writes the library, and it
-- scopes every row and file to the signed-in viewer (the owner column). Row-level security is on
-- with no policies, so the publishable/anon key and signed-in Supabase users get no access at all.

create table if not exists public.datasets (
  id uuid primary key default gen_random_uuid(),
  owner text,
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

-- Earlier versions of this script had no owner; rows saved then stay hidden from everyone.
alter table public.datasets add column if not exists owner text;

drop index if exists public.datasets_created_at_idx;
create index if not exists datasets_owner_created_at_idx on public.datasets (owner, created_at desc);

alter table public.datasets enable row level security;
alter table public.datasets force row level security;

drop policy if exists "datasets are readable" on public.datasets;
drop policy if exists "datasets can be added" on public.datasets;
drop policy if exists "datasets can be removed" on public.datasets;
revoke all on table public.datasets from anon, authenticated;

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
    'application/vnd.oasis.opendocument.spreadsheet'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "dataset files are readable" on storage.objects;
drop policy if exists "dataset files can be added" on storage.objects;
drop policy if exists "dataset files can be removed" on storage.objects;
