alter table public.folio_items
  add column if not exists study_json jsonb;

notify pgrst, 'reload schema';
