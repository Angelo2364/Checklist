create table public.shared_note_groups (
  id uuid primary key default gen_random_uuid(),
  friendship_id uuid references public.social_friendships (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  icon text not null default 'butterfly',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shared_note_groups_one_scope check ((friendship_id is not null) <> (team_id is not null))
);

create index shared_note_groups_friendship_position_idx
  on public.shared_note_groups (friendship_id, position, created_at)
  where friendship_id is not null;
create index shared_note_groups_team_position_idx
  on public.shared_note_groups (team_id, position, created_at)
  where team_id is not null;

alter table public.shared_notes
  add column group_id uuid references public.shared_note_groups (id) on delete set null;

create index shared_notes_group_position_idx
  on public.shared_notes (group_id, position, created_at)
  where group_id is not null;

alter table public.shared_note_groups enable row level security;

create policy "Participants can view shared note groups"
on public.shared_note_groups for select to authenticated
using (
  (friendship_id is not null and exists (
    select 1 from public.social_friendships f
    where f.id = friendship_id and (select auth.uid()) in (f.user_low_id, f.user_high_id)
  )) or (team_id is not null and public.social_is_team_member(team_id))
);

create policy "Participants can create shared note groups"
on public.shared_note_groups for insert to authenticated
with check (
  created_by = (select auth.uid()) and (
    (friendship_id is not null and exists (
      select 1 from public.social_friendships f
      where f.id = friendship_id and (select auth.uid()) in (f.user_low_id, f.user_high_id)
    )) or (team_id is not null and public.social_is_team_member(team_id))
  )
);

create policy "Participants can update shared note groups"
on public.shared_note_groups for update to authenticated
using (
  (friendship_id is not null and exists (
    select 1 from public.social_friendships f
    where f.id = friendship_id and (select auth.uid()) in (f.user_low_id, f.user_high_id)
  )) or (team_id is not null and public.social_is_team_member(team_id))
)
with check (
  (friendship_id is not null and exists (
    select 1 from public.social_friendships f
    where f.id = friendship_id and (select auth.uid()) in (f.user_low_id, f.user_high_id)
  )) or (team_id is not null and public.social_is_team_member(team_id))
);

create policy "Participants can delete shared note groups"
on public.shared_note_groups for delete to authenticated
using (
  (friendship_id is not null and exists (
    select 1 from public.social_friendships f
    where f.id = friendship_id and (select auth.uid()) in (f.user_low_id, f.user_high_id)
  )) or (team_id is not null and public.social_is_team_member(team_id))
);

grant select, delete on public.shared_note_groups to authenticated;
grant insert (friendship_id, team_id, created_by, name, icon, position) on public.shared_note_groups to authenticated;
grant update (name, icon, position, updated_at) on public.shared_note_groups to authenticated;
grant insert (friendship_id, team_id, created_by, title, body, position, group_id) on public.shared_notes to authenticated;
grant update (title, body, position, updated_at, group_id) on public.shared_notes to authenticated;

create or replace function public.social_validate_shared_note_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  group_friendship_id uuid;
  group_team_id uuid;
begin
  if new.group_id is null then
    return new;
  end if;

  select g.friendship_id, g.team_id
  into group_friendship_id, group_team_id
  from public.shared_note_groups g
  where g.id = new.group_id;

  if not found then
    raise exception 'Shared note group does not exist';
  end if;

  if group_friendship_id is distinct from new.friendship_id
     or group_team_id is distinct from new.team_id then
    raise exception 'Shared note group belongs to a different collaboration';
  end if;

  return new;
end;
$$;

create trigger shared_notes_validate_group
before insert or update of group_id, friendship_id, team_id
on public.shared_notes
for each row execute function public.social_validate_shared_note_group();

revoke all on function public.social_validate_shared_note_group() from public, anon;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shared_note_groups'
  ) then
    alter publication supabase_realtime add table public.shared_note_groups;
  end if;
end;
$$;
