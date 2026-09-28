-- FOLIO V6.2 — choix des dossiers inclus dans les totaux généraux
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor avant d'utiliser V6.2.
-- Cette migration ne supprime aucune donnée. Tous les dossiers existants restent inclus par défaut.

alter table public.folio_folders
  add column if not exists include_in_totals boolean not null default true;

notify pgrst, 'reload schema';
