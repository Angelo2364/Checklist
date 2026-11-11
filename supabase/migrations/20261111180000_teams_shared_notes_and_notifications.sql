create table public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index team_members_user_id_idx on public.team_members (user_id, team_id);

create or replace function public.social_is_team_member(p_team_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = p_team_id and m.user_id = (select auth.uid())
  )
$$;

create or replace function public.social_are_friends(p_user_a uuid, p_user_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.social_friendships f
    where (f.user_low_id = p_user_a and f.user_high_id = p_user_b)
       or (f.user_low_id = p_user_b and f.user_high_id = p_user_a)
  )
$$;

revoke all on function public.social_is_team_member(uuid) from public, anon;
revoke all on function public.social_are_friends(uuid, uuid) from public, anon;
grant execute on function public.social_is_team_member(uuid) to authenticated;
grant execute on function public.social_are_friends(uuid, uuid) to authenticated;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

create policy "Team members can view teams"
  on public.teams for select to authenticated
  using (owner_id = (select auth.uid()) or public.social_is_team_member(id));
create policy "Users can create teams"
  on public.teams for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "Team owners can update teams"
  on public.teams for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "Team owners can delete teams"
  on public.teams for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "Members can view team membership"
  on public.team_members for select to authenticated
  using (user_id = (select auth.uid()) or public.social_is_team_member(team_id) or exists (
    select 1 from public.teams t where t.id = team_id and t.owner_id = (select auth.uid())
  ));
create policy "Owners can add themselves and friends"
  on public.team_members for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and (
      (user_id = (select auth.uid()) and exists (
        select 1 from public.teams t where t.id = team_id and t.owner_id = (select auth.uid())
      ))
      or (
        exists (select 1 from public.teams t where t.id = team_id and t.owner_id = (select auth.uid()))
        and public.social_is_team_member(team_id)
        and public.social_are_friends((select auth.uid()), user_id)
      )
    )
  );
create policy "Members can leave and owners can remove members"
  on public.team_members for delete to authenticated
  using (user_id = (select auth.uid()) or exists (
    select 1 from public.teams t where t.id = team_id and t.owner_id = (select auth.uid())
  ));

grant select, delete on public.teams to authenticated;
grant insert (owner_id, name, position) on public.teams to authenticated;
grant update (name, position, updated_at) on public.teams to authenticated;
grant select, delete on public.team_members to authenticated;
grant insert (team_id, user_id, added_by) on public.team_members to authenticated;

create table public.team_task_groups (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  icon text not null default 'butterfly',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  group_id uuid references public.team_task_groups (id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  description text not null default '',
  comment text not null default '',
  due_date date,
  due_time time,
  priority smallint not null default 0 check (priority between 0 and 3),
  completed boolean not null default false,
  partial boolean not null default false,
  position integer not null default 0,
  recurrence jsonb,
  recurrence_time time,
  scheduled_for date not null default current_date,
  generated_from uuid references public.team_tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_tasks_status_consistent check (not (completed and partial))
);

create index team_task_groups_team_position_idx on public.team_task_groups (team_id, position, created_at);
create index team_tasks_team_position_idx on public.team_tasks (team_id, group_id, position, created_at);
create unique index team_tasks_generated_occurrence_key on public.team_tasks (generated_from, scheduled_for) where generated_from is not null;

alter table public.team_task_groups enable row level security;
alter table public.team_tasks enable row level security;

create policy "Team members can view task groups" on public.team_task_groups for select to authenticated using (public.social_is_team_member(team_id));
create policy "Team members can create task groups" on public.team_task_groups for insert to authenticated with check (created_by = (select auth.uid()) and public.social_is_team_member(team_id));
create policy "Team members can update task groups" on public.team_task_groups for update to authenticated using (public.social_is_team_member(team_id)) with check (public.social_is_team_member(team_id));
create policy "Team members can delete task groups" on public.team_task_groups for delete to authenticated using (public.social_is_team_member(team_id));

create policy "Team members can view tasks" on public.team_tasks for select to authenticated using (public.social_is_team_member(team_id));
create policy "Team members can create tasks" on public.team_tasks for insert to authenticated with check (created_by = (select auth.uid()) and public.social_is_team_member(team_id));
create policy "Team members can update tasks" on public.team_tasks for update to authenticated using (public.social_is_team_member(team_id)) with check (public.social_is_team_member(team_id));
create policy "Team members can delete tasks" on public.team_tasks for delete to authenticated using (public.social_is_team_member(team_id));

grant select, delete on public.team_task_groups to authenticated;
grant insert (team_id, created_by, name, icon, position) on public.team_task_groups to authenticated;
grant update (name, icon, position, updated_at) on public.team_task_groups to authenticated;
grant select, delete on public.team_tasks to authenticated;
grant insert (team_id, group_id, created_by, title, description, comment, due_date, due_time, priority, completed, partial, position, recurrence, recurrence_time, scheduled_for, generated_from) on public.team_tasks to authenticated;
grant update (group_id, title, description, comment, due_date, due_time, priority, completed, partial, position, recurrence, recurrence_time, scheduled_for, updated_at) on public.team_tasks to authenticated;

create or replace function public.social_validate_team_task_group()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.group_id is not null and not exists (
    select 1 from public.team_task_groups g where g.id = new.group_id and g.team_id = new.team_id
  ) then raise exception 'team_task_group_team_mismatch'; end if;
  return new;
end;
$$;

create trigger team_tasks_validate_group before insert or update of group_id, team_id on public.team_tasks
for each row execute function public.social_validate_team_task_group();

create or replace function public.social_create_next_team_task_occurrence()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  kind text;
  interval_count integer;
  base_date date;
  next_date date;
  day_offset integer;
  selected_days jsonb;
  target_month timestamp without time zone;
begin
  if old.completed or not new.completed or new.recurrence is null then return new; end if;
  kind := new.recurrence->>'tipo';
  interval_count := greatest(1, coalesce((new.recurrence->>'intervalo')::integer, 1));
  base_date := coalesce(new.scheduled_for, current_date);
  if kind = 'meses' then
    target_month := date_trunc('month', base_date::timestamp) + make_interval(months => interval_count);
    next_date := (target_month + make_interval(days => least(
      extract(day from base_date)::integer,
      extract(day from (target_month + interval '1 month' - interval '1 day'))::integer
    ) - 1))::date;
  elsif kind = 'semana' then
    selected_days := coalesce(new.recurrence->'diasSemana', '[]'::jsonb);
    next_date := null;
    for day_offset in 1..7 loop
      if selected_days @> to_jsonb(extract(dow from (base_date + day_offset))::integer) then next_date := base_date + day_offset; exit; end if;
    end loop;
    if next_date is null then next_date := base_date + 7; end if;
  else
    next_date := base_date + interval_count;
  end if;
  insert into public.team_tasks (
    team_id, group_id, created_by, title, description, comment, due_date, due_time,
    priority, completed, partial, position, recurrence, recurrence_time, scheduled_for, generated_from
  ) values (
    new.team_id, new.group_id, new.created_by, new.title, new.description, new.comment,
    case when new.due_date is null then null else next_date end, new.due_time,
    new.priority, false, false,
    coalesce((select max(t.position) + 1 from public.team_tasks t where t.team_id = new.team_id and t.group_id is not distinct from new.group_id), 0),
    new.recurrence, new.recurrence_time, next_date, new.id
  ) on conflict do nothing;
  return new;
end;
$$;

create trigger team_tasks_create_next_occurrence after update of completed on public.team_tasks
for each row execute function public.social_create_next_team_task_occurrence();

create or replace function public.social_apply_team_task_order(p_team_id uuid, p_updates jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := (select auth.uid()); expected_count integer; updated_count integer;
begin
  if current_user_id is null then raise exception 'not_authenticated'; end if;
  if not public.social_is_team_member(p_team_id) then raise exception 'team_not_found'; end if;
  if jsonb_typeof(p_updates) <> 'array' then raise exception 'invalid_task_order'; end if;
  expected_count := jsonb_array_length(p_updates);
  if expected_count < 1 or expected_count > 1000 then raise exception 'invalid_task_order'; end if;
  if (select count(distinct u.id) from jsonb_to_recordset(p_updates) as u(id uuid, group_id uuid, position integer)) <> expected_count then raise exception 'invalid_task_order'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_updates) as u(id uuid, group_id uuid, position integer)
    left join public.team_tasks t on t.id = u.id and t.team_id = p_team_id
    where u.id is null or u.position is null or u.position < 0 or t.id is null
  ) then raise exception 'invalid_task_order'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_updates) as u(id uuid, group_id uuid, position integer)
    where u.group_id is not null and not exists (select 1 from public.team_task_groups g where g.id = u.group_id and g.team_id = p_team_id)
  ) then raise exception 'team_task_group_team_mismatch'; end if;
  if exists (
    select u.group_id, u.position from jsonb_to_recordset(p_updates) as u(id uuid, group_id uuid, position integer)
    group by u.group_id, u.position having count(*) > 1
  ) then raise exception 'duplicate_task_position'; end if;
  update public.team_tasks t set group_id = u.group_id, position = u.position, updated_at = now()
  from jsonb_to_recordset(p_updates) as u(id uuid, group_id uuid, position integer)
  where t.id = u.id and t.team_id = p_team_id;
  get diagnostics updated_count = row_count;
  if updated_count <> expected_count then raise exception 'task_order_update_incomplete'; end if;
end;
$$;

revoke all on function public.social_validate_team_task_group() from public, anon;
revoke all on function public.social_create_next_team_task_occurrence() from public, anon;
revoke all on function public.social_apply_team_task_order(uuid, jsonb) from public, anon;
grant execute on function public.social_apply_team_task_order(uuid, jsonb) to authenticated;

create table public.shared_notes (
  id uuid primary key default gen_random_uuid(),
  friendship_id uuid references public.social_friendships (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 100),
  body text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shared_notes_one_scope check ((friendship_id is not null) <> (team_id is not null))
);

create index shared_notes_friendship_position_idx on public.shared_notes (friendship_id, position, created_at) where friendship_id is not null;
create index shared_notes_team_position_idx on public.shared_notes (team_id, position, created_at) where team_id is not null;
alter table public.shared_notes enable row level security;

create policy "Participants can view shared notes" on public.shared_notes for select to authenticated
using (
  (friendship_id is not null and exists (
    select 1 from public.social_friendships f where f.id = friendship_id and (select auth.uid()) in (f.user_low_id, f.user_high_id)
  )) or (team_id is not null and public.social_is_team_member(team_id))
);
create policy "Participants can create shared notes" on public.shared_notes for insert to authenticated
with check (
  created_by = (select auth.uid()) and (
    (friendship_id is not null and exists (
      select 1 from public.social_friendships f where f.id = friendship_id and (select auth.uid()) in (f.user_low_id, f.user_high_id)
    )) or (team_id is not null and public.social_is_team_member(team_id))
  )
);
create policy "Participants can update shared notes" on public.shared_notes for update to authenticated
using (
  (friendship_id is not null and exists (
    select 1 from public.social_friendships f where f.id = friendship_id and (select auth.uid()) in (f.user_low_id, f.user_high_id)
  )) or (team_id is not null and public.social_is_team_member(team_id))
)
with check (
  (friendship_id is not null and exists (
    select 1 from public.social_friendships f where f.id = friendship_id and (select auth.uid()) in (f.user_low_id, f.user_high_id)
  )) or (team_id is not null and public.social_is_team_member(team_id))
);
create policy "Participants can delete shared notes" on public.shared_notes for delete to authenticated
using (
  (friendship_id is not null and exists (
    select 1 from public.social_friendships f where f.id = friendship_id and (select auth.uid()) in (f.user_low_id, f.user_high_id)
  )) or (team_id is not null and public.social_is_team_member(team_id))
);
grant select, delete on public.shared_notes to authenticated;
grant insert (friendship_id, team_id, created_by, title, body, position) on public.shared_notes to authenticated;
grant update (title, body, position, updated_at) on public.shared_notes to authenticated;

create table public.collaboration_notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text not null default 'Alguém',
  scope_type text not null check (scope_type in ('friendship', 'team')),
  scope_id uuid not null,
  scope_name text not null,
  task_title text not null,
  action text not null check (action in ('adicionou', 'alterou', 'excluiu')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index collaboration_notifications_pending_idx on public.collaboration_notifications (created_at) where sent_at is null;
alter table public.collaboration_notifications enable row level security;
grant select, update on public.collaboration_notifications to service_role;

create or replace function public.queue_friendship_task_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid;
  action_word text;
  task_title text;
  friendship uuid;
  friend record;
begin
  actor := coalesce((select auth.uid()), case when tg_op = 'DELETE' then old.created_by else new.created_by end);
  if tg_op = 'UPDATE' and row(
    old.title, old.description, old.comment, old.due_date, old.due_time,
    old.priority, old.completed, old.partial, old.group_id, old.recurrence,
    old.recurrence_time, old.scheduled_for
  ) is not distinct from row(
    new.title, new.description, new.comment, new.due_date, new.due_time,
    new.priority, new.completed, new.partial, new.group_id, new.recurrence,
    new.recurrence_time, new.scheduled_for
  ) then return new; end if;
  action_word := case when tg_op = 'INSERT' then 'adicionou' when tg_op = 'DELETE' then 'excluiu' else 'alterou' end;
  task_title := case when tg_op = 'DELETE' then old.title else new.title end;
  friendship := case when tg_op = 'DELETE' then old.friendship_id else new.friendship_id end;
  for friend in
    select case when f.user_low_id = actor then f.user_high_id else f.user_low_id end as recipient_id,
      coalesce(p.username, 'seu amigo') as display_name
    from public.social_friendships f
    left join public.profiles p on p.user_id = case when f.user_low_id = actor then f.user_high_id else f.user_low_id end
    where f.id = friendship and actor in (f.user_low_id, f.user_high_id)
  loop
    insert into public.collaboration_notifications (recipient_id, actor_id, actor_name, scope_type, scope_id, scope_name, task_title, action)
    values (friend.recipient_id, actor, coalesce((select p.username from public.profiles p where p.user_id = actor), 'Alguém'), 'friendship', friendship, friend.display_name, task_title, action_word);
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger social_tasks_queue_notification after insert or update or delete on public.social_tasks
for each row execute function public.queue_friendship_task_notification();

create or replace function public.queue_team_task_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid;
  action_word text;
  task_title text;
  target_team uuid;
  recipient record;
  team_name text;
begin
  actor := coalesce((select auth.uid()), case when tg_op = 'DELETE' then old.created_by else new.created_by end);
  if tg_op = 'UPDATE' and row(
    old.title, old.description, old.comment, old.due_date, old.due_time,
    old.priority, old.completed, old.partial, old.group_id, old.recurrence,
    old.recurrence_time, old.scheduled_for
  ) is not distinct from row(
    new.title, new.description, new.comment, new.due_date, new.due_time,
    new.priority, new.completed, new.partial, new.group_id, new.recurrence,
    new.recurrence_time, new.scheduled_for
  ) then return new; end if;
  action_word := case when tg_op = 'INSERT' then 'adicionou' when tg_op = 'DELETE' then 'excluiu' else 'alterou' end;
  task_title := case when tg_op = 'DELETE' then old.title else new.title end;
  target_team := case when tg_op = 'DELETE' then old.team_id else new.team_id end;
  select t.name into team_name from public.teams t where t.id = target_team;
  for recipient in select m.user_id from public.team_members m where m.team_id = target_team and m.user_id <> actor loop
    insert into public.collaboration_notifications (recipient_id, actor_id, actor_name, scope_type, scope_id, scope_name, task_title, action)
    values (recipient.user_id, actor, coalesce((select p.username from public.profiles p where p.user_id = actor), 'Alguém'), 'team', target_team, coalesce(team_name, 'equipe'), task_title, action_word);
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger team_tasks_queue_notification after insert or update or delete on public.team_tasks
for each row execute function public.queue_team_task_notification();

revoke all on function public.queue_friendship_task_notification() from public, anon, authenticated;
revoke all on function public.queue_team_task_notification() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'teams') then alter publication supabase_realtime add table public.teams; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_members') then alter publication supabase_realtime add table public.team_members; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_task_groups') then alter publication supabase_realtime add table public.team_task_groups; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_tasks') then alter publication supabase_realtime add table public.team_tasks; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shared_notes') then alter publication supabase_realtime add table public.shared_notes; end if;
end $$;
