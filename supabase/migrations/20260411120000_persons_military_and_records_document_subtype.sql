alter table public.persons
  add column if not exists military_branch text,
  add column if not exists service_number text;

alter table public.records
  add column if not exists document_subtype text;
