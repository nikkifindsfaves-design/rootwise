-- Prevent duplicate unresolved rows for the same imported/source string.
create unique index if not exists places_in_review_source_ref_unique_idx
  on public.places (source_dataset, source_ref)
  where review_status = 'in_review'
    and source_dataset is not null
    and source_ref is not null;
