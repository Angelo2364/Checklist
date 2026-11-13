-- Keep only the latest pending change for each task and let one worker claim
-- each notification batch at a time. Old queue entries have no task_id, so
-- discard them at rollout instead of surprising users with a historical burst.
alter table public.collaboration_notifications
  add column if not exists task_id uuid,
  add column if not exists claimed_at timestamptz;

update public.collaboration_notifications
set sent_at = now(), claimed_at = null
where sent_at is null;

create unique index if not exists collaboration_notifications_pending_task_key
  on public.collaboration_notifications (recipient_id, scope_type, scope_id, task_id)
  where sent_at is null and task_id is not null;

create or replace function public.queue_friendship_task_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid;
  action_word text;
  task_title text;
  task_key uuid;
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
  task_key := case when tg_op = 'DELETE' then old.id else new.id end;
  friendship := case when tg_op = 'DELETE' then old.friendship_id else new.friendship_id end;
  for friend in
    select case when f.user_low_id = actor then f.user_high_id else f.user_low_id end as recipient_id,
      coalesce(p.username, 'seu amigo') as display_name
    from public.social_friendships f
    left join public.profiles p on p.user_id = case when f.user_low_id = actor then f.user_high_id else f.user_low_id end
    where f.id = friendship and actor in (f.user_low_id, f.user_high_id)
  loop
    insert into public.collaboration_notifications
      (recipient_id, actor_id, actor_name, scope_type, scope_id, scope_name, task_id, task_title, action, created_at, claimed_at)
    values
      (friend.recipient_id, actor, coalesce((select p.username from public.profiles p where p.user_id = actor), 'Alguém'), 'friendship', friendship, friend.display_name, task_key, task_title, action_word, now(), null)
    on conflict (recipient_id, scope_type, scope_id, task_id)
      where sent_at is null and task_id is not null
    do update set actor_id = excluded.actor_id,
      actor_name = excluded.actor_name,
      scope_name = excluded.scope_name,
      task_title = excluded.task_title,
      action = excluded.action,
      created_at = now(),
      claimed_at = null;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.queue_team_task_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid;
  action_word text;
  task_title text;
  task_key uuid;
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
  task_key := case when tg_op = 'DELETE' then old.id else new.id end;
  target_team := case when tg_op = 'DELETE' then old.team_id else new.team_id end;
  select t.name into team_name from public.teams t where t.id = target_team;
  for recipient in select m.user_id from public.team_members m where m.team_id = target_team and m.user_id <> actor loop
    insert into public.collaboration_notifications
      (recipient_id, actor_id, actor_name, scope_type, scope_id, scope_name, task_id, task_title, action, created_at, claimed_at)
    values
      (recipient.user_id, actor, coalesce((select p.username from public.profiles p where p.user_id = actor), 'Alguém'), 'team', target_team, coalesce(team_name, 'equipe'), task_key, task_title, action_word, now(), null)
    on conflict (recipient_id, scope_type, scope_id, task_id)
      where sent_at is null and task_id is not null
    do update set actor_id = excluded.actor_id,
      actor_name = excluded.actor_name,
      scope_name = excluded.scope_name,
      task_title = excluded.task_title,
      action = excluded.action,
      created_at = now(),
      claimed_at = null;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.claim_collaboration_notifications(p_actor_id uuid default null, p_limit integer default 500)
returns setof public.collaboration_notifications
language sql security definer set search_path = '' as $$
  with claimable as (
    select n.id
    from public.collaboration_notifications n
    where n.sent_at is null
      and (n.claimed_at is null or n.claimed_at < now() - interval '5 minutes')
      and (p_actor_id is null or n.actor_id = p_actor_id)
      and not exists (
        select 1
        from public.collaboration_notifications recent
        where recent.recipient_id = n.recipient_id
          and recent.sent_at is null
          and recent.created_at > now() - interval '8 seconds'
      )
    order by n.created_at, n.id
    limit greatest(1, least(coalesce(p_limit, 500), 500))
    for update skip locked
  )
  update public.collaboration_notifications n
  set claimed_at = now()
  from claimable c
  where n.id = c.id
  returning n.*;
$$;

revoke all on function public.claim_collaboration_notifications(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_collaboration_notifications(uuid, integer) to service_role;
