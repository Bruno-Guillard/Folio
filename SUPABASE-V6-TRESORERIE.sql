-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor avant d'utiliser Folio V6.
-- Cette migration ajoute uniquement le réglage global "Frais divers".

create table if not exists public.folio_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  misc_expenses numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.folio_settings enable row level security;
grant select, insert, update, delete on public.folio_settings to authenticated;

drop policy if exists "settings_select_own" on public.folio_settings;
drop policy if exists "settings_insert_own" on public.folio_settings;
drop policy if exists "settings_update_own" on public.folio_settings;
drop policy if exists "settings_delete_own" on public.folio_settings;

create policy "settings_select_own" on public.folio_settings for select to authenticated using (auth.uid() = user_id);
create policy "settings_insert_own" on public.folio_settings for insert to authenticated with check (auth.uid() = user_id);
create policy "settings_update_own" on public.folio_settings for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "settings_delete_own" on public.folio_settings for delete to authenticated using (auth.uid() = user_id);
