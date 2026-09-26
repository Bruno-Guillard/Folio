-- FOLIO V5 — schéma + RLS + stockage privé
create extension if not exists pgcrypto;

create table if not exists public.folio_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.folio_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references public.folio_folders(id) on delete set null,
  name text not null default '',
  description text not null default '',
  purchase_price numeric(12,2),
  sale_price numeric(12,2),
  fees numeric(12,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.folio_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.folio_items(id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.folio_folders enable row level security;
alter table public.folio_items enable row level security;
alter table public.folio_photos enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.folio_folders, public.folio_items, public.folio_photos to authenticated;

-- À exécuter une seule fois sur un projet neuf. Si les politiques existent déjà,
-- Supabase renverra simplement une erreur de nom dupliqué pour celles-ci.
create policy "folders_select_own" on public.folio_folders for select to authenticated using (auth.uid() = user_id);
create policy "folders_insert_own" on public.folio_folders for insert to authenticated with check (auth.uid() = user_id);
create policy "folders_update_own" on public.folio_folders for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "folders_delete_own" on public.folio_folders for delete to authenticated using (auth.uid() = user_id);

create policy "items_select_own" on public.folio_items for select to authenticated using (auth.uid() = user_id);
create policy "items_insert_own" on public.folio_items for insert to authenticated with check (auth.uid() = user_id);
create policy "items_update_own" on public.folio_items for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "items_delete_own" on public.folio_items for delete to authenticated using (auth.uid() = user_id);

create policy "photos_select_own" on public.folio_photos for select to authenticated using (auth.uid() = user_id);
create policy "photos_insert_own" on public.folio_photos for insert to authenticated with check (auth.uid() = user_id);
create policy "photos_update_own" on public.folio_photos for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "photos_delete_own" on public.folio_photos for delete to authenticated using (auth.uid() = user_id);

create policy "folio_storage_select_own" on storage.objects for select to authenticated
using (bucket_id = 'folio-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "folio_storage_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'folio-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "folio_storage_update_own" on storage.objects for update to authenticated
using (bucket_id = 'folio-photos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'folio-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "folio_storage_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'folio-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- FOLIO V6 — paramètres synchronisés (trésorerie / frais divers)
create table if not exists public.folio_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  misc_expenses numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.folio_settings enable row level security;
grant select, insert, update, delete on public.folio_settings to authenticated;

create policy "settings_select_own" on public.folio_settings for select to authenticated using (auth.uid() = user_id);
create policy "settings_insert_own" on public.folio_settings for insert to authenticated with check (auth.uid() = user_id);
create policy "settings_update_own" on public.folio_settings for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "settings_delete_own" on public.folio_settings for delete to authenticated using (auth.uid() = user_id);
