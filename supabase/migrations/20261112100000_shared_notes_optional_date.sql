alter table public.shared_notes
  add column note_date date;

update public.shared_notes
set note_date = created_at::date
where note_date is null;

alter table public.shared_notes
  alter column note_date set default current_date;

grant insert (note_date) on public.shared_notes to authenticated;
grant update (note_date) on public.shared_notes to authenticated;
