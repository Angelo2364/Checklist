create table if not exists public.social_task_groups (
  id uuid primary key default gen_random_uuid(),
  friendship_id uuid not null references public.social_friendships (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  icon text not null default 'butterfly',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.social_tasks
  add column if not exists group_id uuid references public.social_task_groups (id) on delete set null,
  add column if not exists recurrence jsonb,
  add column if not exists recurrence_time time,
  add column if not exists due_time time,
  add column if not exists comment text not null default '',
  add column if not exists scheduled_for date not null default current_date,
  add column if not exists generated_from uuid references public.social_tasks (id) on delete set null;

create unique index if not exists social_tasks_generated_occurrence_key
  on public.social_tasks (generated_from, scheduled_for)
  where generated_from is not null;

alter table public.social_tasks drop constraint if exists social_tasks_title_check;
alter table public.social_tasks add constraint social_tasks_title_check
  check (length(btrim(title)) between 1 and 200);

create index if not exists social_task_groups_friendship_position_idx
  on public.social_task_groups (friendship_id, position, created_at);

alter table public.social_task_groups enable row level security;

drop policy if exists "Friends can view shared task groups" on public.social_task_groups;
create policy "Friends can view shared task groups"
  on public.social_task_groups for select to authenticated
  using (exists (
    select 1 from public.social_friendships f
    where f.id = friendship_id
      and (select auth.uid()) in (f.user_low_id, f.user_high_id)
  ));

drop policy if exists "Friends can create shared task groups" on public.social_task_groups;
create policy "Friends can create shared task groups"
  on public.social_task_groups for insert to authenticated
  with check (created_by = (select auth.uid()) and exists (
    select 1 from public.social_friendships f
    where f.id = friendship_id
      and (select auth.uid()) in (f.user_low_id, f.user_high_id)
  ));

drop policy if exists "Friends can update shared task groups" on public.social_task_groups;
create policy "Friends can update shared task groups"
  on public.social_task_groups for update to authenticated
  using (exists (
    select 1 from public.social_friendships f
    where f.id = friendship_id
      and (select auth.uid()) in (f.user_low_id, f.user_high_id)
  ))
  with check (exists (
    select 1 from public.social_friendships f
    where f.id = friendship_id
      and (select auth.uid()) in (f.user_low_id, f.user_high_id)
  ));

drop policy if exists "Friends can delete shared task groups" on public.social_task_groups;
create policy "Friends can delete shared task groups"
  on public.social_task_groups for delete to authenticated
  using (exists (
    select 1 from public.social_friendships f
    where f.id = friendship_id
      and (select auth.uid()) in (f.user_low_id, f.user_high_id)
  ));

grant select, delete on public.social_task_groups to authenticated;
grant insert (friendship_id, created_by, name, icon, position) on public.social_task_groups to authenticated;
grant update (name, icon, position, updated_at) on public.social_task_groups to authenticated;
grant insert (group_id, recurrence, recurrence_time, due_time, comment, scheduled_for, generated_from) on public.social_tasks to authenticated;
grant update (group_id, recurrence, recurrence_time, due_time, comment, scheduled_for) on public.social_tasks to authenticated;

create or replace function public.social_validate_task_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.group_id is not null and not exists (
    select 1 from public.social_task_groups g
    where g.id = new.group_id and g.friendship_id = new.friendship_id
  ) then
    raise exception 'social_task_group_friendship_mismatch';
  end if;
  return new;
end;
$$;

drop trigger if exists social_tasks_validate_group on public.social_tasks;
create trigger social_tasks_validate_group
  before insert or update of group_id, friendship_id on public.social_tasks
  for each row execute function public.social_validate_task_group();

create or replace function public.social_remove_friend(p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then raise exception 'not_authenticated'; end if;
  delete from public.social_friendships f
  where f.id = p_friendship_id
    and current_user_id in (f.user_low_id, f.user_high_id);
  if not found then raise exception 'friendship_not_found'; end if;
  -- The friendship foreign keys cascade to its sessions and shared tasks.
end;
$$;

create or replace function public.social_create_next_task_occurrence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
      if selected_days @> to_jsonb(extract(dow from (base_date + day_offset))::integer) then
        next_date := base_date + day_offset;
        exit;
      end if;
    end loop;
    if next_date is null then next_date := base_date + 7; end if;
  else
    next_date := base_date + interval_count;
  end if;

  insert into public.social_tasks (
    friendship_id, created_by, group_id, title, description, comment,
    due_date, due_time, priority, completed, position,
    recurrence, recurrence_time, scheduled_for, generated_from
  ) values (
    new.friendship_id, new.created_by, new.group_id, new.title, new.description, new.comment,
    case when new.due_date is null then null else next_date end,
    new.due_time, new.priority, false,
    coalesce((select max(t.position) + 1 from public.social_tasks t where t.friendship_id = new.friendship_id), 0),
    new.recurrence, new.recurrence_time, next_date, new.id
  ) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists social_tasks_create_next_occurrence on public.social_tasks;
create trigger social_tasks_create_next_occurrence
  after update of completed on public.social_tasks
  for each row execute function public.social_create_next_task_occurrence();

revoke all on function public.social_validate_task_group() from public, anon;
revoke all on function public.social_remove_friend(uuid) from public, anon;
revoke all on function public.social_create_next_task_occurrence() from public, anon;
grant execute on function public.social_remove_friend(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'social_task_groups'
  ) then
    alter publication supabase_realtime add table public.social_task_groups;
  end if;
end;
$$;
