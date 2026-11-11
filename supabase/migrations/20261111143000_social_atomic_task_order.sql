create or replace function public.social_apply_task_order(
  p_friendship_id uuid,
  p_updates jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  expected_count integer;
  updated_count integer;
begin
  if current_user_id is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.social_friendships f
    where f.id = p_friendship_id
      and current_user_id in (f.user_low_id, f.user_high_id)
  ) then raise exception 'friendship_not_found'; end if;
  if jsonb_typeof(p_updates) <> 'array' then raise exception 'invalid_task_order'; end if;

  expected_count := jsonb_array_length(p_updates);
  if expected_count < 1 or expected_count > 1000 then raise exception 'invalid_task_order'; end if;
  if (
    select count(distinct u.id)
    from jsonb_to_recordset(p_updates) as u(id uuid, group_id uuid, position integer)
  ) <> expected_count then raise exception 'invalid_task_order'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_updates) as u(id uuid, group_id uuid, position integer)
    left join public.social_tasks t on t.id = u.id and t.friendship_id = p_friendship_id
    where u.id is null or u.position is null or u.position < 0 or t.id is null
  ) then raise exception 'invalid_task_order'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_updates) as u(id uuid, group_id uuid, position integer)
    where u.group_id is not null
      and not exists (
        select 1 from public.social_task_groups g
        where g.id = u.group_id and g.friendship_id = p_friendship_id
      )
  ) then raise exception 'social_task_group_friendship_mismatch'; end if;

  if exists (
    select u.group_id, u.position
    from jsonb_to_recordset(p_updates) as u(id uuid, group_id uuid, position integer)
    group by u.group_id, u.position
    having count(*) > 1
  ) then raise exception 'duplicate_task_position'; end if;

  update public.social_tasks t
  set group_id = u.group_id,
      position = u.position,
      updated_at = now()
  from jsonb_to_recordset(p_updates) as u(id uuid, group_id uuid, position integer)
  where t.id = u.id and t.friendship_id = p_friendship_id;

  get diagnostics updated_count = row_count;
  if updated_count <> expected_count then raise exception 'task_order_update_incomplete'; end if;
end;
$$;

revoke all on function public.social_apply_task_order(uuid, jsonb) from public, anon;
grant execute on function public.social_apply_task_order(uuid, jsonb) to authenticated;
