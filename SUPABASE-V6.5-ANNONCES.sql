-- Folio V6.5 — champs spécifiques à l'annonce publique
-- À exécuter UNE FOIS dans Supabase > SQL Editor.
-- Aucun prix existant ni aucune fiche n'est supprimé ou modifié.

alter table public.folio_items
  add column if not exists listing_title text not null default '',
  add column if not exists asking_price numeric(12,2);

-- Pour ne pas casser les annonces déjà visibles, on initialise une seule fois
-- le titre d'annonce avec le nom Folio uniquement quand il est encore vide.
-- Ensuite les deux champs restent totalement indépendants.
update public.folio_items
set listing_title = name
where trim(coalesce(listing_title, '')) = '';

notify pgrst, 'reload schema';
