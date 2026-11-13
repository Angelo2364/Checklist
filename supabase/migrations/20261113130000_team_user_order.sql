create table public.team_user_order (
  user_id uuid not null references auth.users (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  position integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, team_id)
);

create index team_user_order_team_id_idx on public.team_user_order (team_id);

alter table public.team_user_order enable row level security;

create policy "Users can view their own team order"
  on public.team_user_order for select to authenticated
  using (user_id = (select auth.uid()) and public.social_is_team_member(team_id));

create policy "Users can create their own team order"
  on public.team_user_order for insert to authenticated
  with check (user_id = (select auth.uid()) and public.social_is_team_member(team_id));

create policy "Users can update their own team order"
  on public.team_user_order for update to authenticated
  using (user_id = (select auth.uid()) and public.social_is_team_member(team_id))
  with check (user_id = (select auth.uid()) and public.social_is_team_member(team_id));

create policy "Users can delete their own team order"
  on public.team_user_order for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.team_user_order to authenticated;
