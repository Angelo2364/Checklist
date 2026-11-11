alter table public.social_tasks
  add column if not exists partial boolean not null default false;

alter table public.social_tasks
  add constraint social_tasks_status_consistent
  check (not (completed and partial));

grant insert (partial) on public.social_tasks to authenticated;
grant update (partial) on public.social_tasks to authenticated;
