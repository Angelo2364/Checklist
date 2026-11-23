alter table public.social_task_groups
  add column if not exists due_time time;

alter table public.team_task_groups
  add column if not exists due_time time;

grant insert (due_time) on public.social_task_groups to authenticated;
grant update (due_time) on public.social_task_groups to authenticated;
grant insert (due_time) on public.team_task_groups to authenticated;
grant update (due_time) on public.team_task_groups to authenticated;

create or replace function public.social_sync_friend_task_group_deadline()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.due_date is not distinct from new.due_date
     and old.due_time is not distinct from new.due_time then
    return new;
  end if;

  if new.due_date is null and new.due_time is null then
    update public.social_tasks
    set due_date = null, due_time = null, due_date_inherited = false, updated_at = now()
    where group_id = new.id and due_date_inherited;
  elsif old.due_date is null and old.due_time is null then
    update public.social_tasks
    set due_date = coalesce(new.due_date, current_date), due_time = new.due_time,
        due_date_inherited = true, updated_at = now()
    where group_id = new.id;
  else
    update public.social_tasks
    set due_date = coalesce(new.due_date, current_date), due_time = new.due_time, updated_at = now()
    where group_id = new.id and due_date_inherited;
  end if;
  return new;
end;
$$;

create or replace function public.social_sync_team_task_group_deadline()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.due_date is not distinct from new.due_date
     and old.due_time is not distinct from new.due_time then
    return new;
  end if;

  if new.due_date is null and new.due_time is null then
    update public.team_tasks
    set due_date = null, due_time = null, due_date_inherited = false, updated_at = now()
    where group_id = new.id and due_date_inherited;
  elsif old.due_date is null and old.due_time is null then
    update public.team_tasks
    set due_date = coalesce(new.due_date, current_date), due_time = new.due_time,
        due_date_inherited = true, updated_at = now()
    where group_id = new.id;
  else
    update public.team_tasks
    set due_date = coalesce(new.due_date, current_date), due_time = new.due_time, updated_at = now()
    where group_id = new.id and due_date_inherited;
  end if;
  return new;
end;
$$;

create or replace function public.social_inherit_friend_task_group_deadline()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  group_deadline date;
  group_deadline_time time;
begin
  if new.group_id is null then
    if tg_op = 'UPDATE' and old.due_date_inherited then
      new.due_date := null;
      new.due_time := null;
    end if;
    new.due_date_inherited := false;
    return new;
  end if;

  select g.due_date, g.due_time into group_deadline, group_deadline_time
  from public.social_task_groups g
  where g.id = new.group_id and g.friendship_id = new.friendship_id;

  if tg_op = 'UPDATE' and new.group_id is distinct from old.group_id then
    if group_deadline is not null or group_deadline_time is not null then
      new.due_date := coalesce(group_deadline, current_date);
      new.due_time := group_deadline_time;
      new.due_date_inherited := true;
    elsif old.due_date_inherited then
      new.due_date := null;
      new.due_time := null;
      new.due_date_inherited := false;
    end if;
    return new;
  end if;

  if new.due_date_inherited and (group_deadline is not null or group_deadline_time is not null) then
    new.due_date := coalesce(group_deadline, current_date);
    new.due_time := group_deadline_time;
  elsif tg_op = 'INSERT'
        and (group_deadline is not null or group_deadline_time is not null)
        and (new.generated_from is not null or new.due_date is null) then
    new.due_date := coalesce(group_deadline, current_date);
    new.due_time := group_deadline_time;
    new.due_date_inherited := true;
  elsif new.due_date_inherited then
    new.due_date_inherited := false;
  end if;
  return new;
end;
$$;

create or replace function public.social_inherit_team_task_group_deadline()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  group_deadline date;
  group_deadline_time time;
begin
  if new.group_id is null then
    if tg_op = 'UPDATE' and old.due_date_inherited then
      new.due_date := null;
      new.due_time := null;
    end if;
    new.due_date_inherited := false;
    return new;
  end if;

  select g.due_date, g.due_time into group_deadline, group_deadline_time
  from public.team_task_groups g
  where g.id = new.group_id and g.team_id = new.team_id;

  if tg_op = 'UPDATE' and new.group_id is distinct from old.group_id then
    if group_deadline is not null or group_deadline_time is not null then
      new.due_date := coalesce(group_deadline, current_date);
      new.due_time := group_deadline_time;
      new.due_date_inherited := true;
    elsif old.due_date_inherited then
      new.due_date := null;
      new.due_time := null;
      new.due_date_inherited := false;
    end if;
    return new;
  end if;

  if new.due_date_inherited and (group_deadline is not null or group_deadline_time is not null) then
    new.due_date := coalesce(group_deadline, current_date);
    new.due_time := group_deadline_time;
  elsif tg_op = 'INSERT'
        and (group_deadline is not null or group_deadline_time is not null)
        and (new.generated_from is not null or new.due_date is null) then
    new.due_date := coalesce(group_deadline, current_date);
    new.due_time := group_deadline_time;
    new.due_date_inherited := true;
  elsif new.due_date_inherited then
    new.due_date_inherited := false;
  end if;
  return new;
end;
$$;

drop trigger if exists social_task_groups_sync_deadline on public.social_task_groups;
create trigger social_task_groups_sync_deadline
after update of due_date, due_time on public.social_task_groups
for each row execute function public.social_sync_friend_task_group_deadline();

drop trigger if exists team_task_groups_sync_deadline on public.team_task_groups;
create trigger team_task_groups_sync_deadline
after update of due_date, due_time on public.team_task_groups
for each row execute function public.social_sync_team_task_group_deadline();

revoke all on function public.social_sync_friend_task_group_deadline() from public, anon, authenticated;
revoke all on function public.social_sync_team_task_group_deadline() from public, anon, authenticated;
revoke all on function public.social_inherit_friend_task_group_deadline() from public, anon, authenticated;
revoke all on function public.social_inherit_team_task_group_deadline() from public, anon, authenticated;
