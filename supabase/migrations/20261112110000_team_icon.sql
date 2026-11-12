alter table public.teams add column icon text not null default 'butterfly';
grant update (icon) on public.teams to authenticated;
