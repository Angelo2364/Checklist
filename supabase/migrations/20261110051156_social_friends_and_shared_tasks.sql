create table public.social_friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_friend_requests_not_self check (sender_id <> recipient_id)
);

create unique index social_friend_requests_pending_pair_key
  on public.social_friend_requests (sender_id, recipient_id)
  where status = 'pending';
create index social_friend_requests_recipient_pending_idx
  on public.social_friend_requests (recipient_id, created_at desc)
  where status = 'pending';

create table public.social_friendships (
  id uuid primary key default gen_random_uuid(),
  user_low_id uuid not null references auth.users (id) on delete cascade,
  user_high_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint social_friendships_sorted_pair check (user_low_id < user_high_id),
  constraint social_friendships_unique_pair unique (user_low_id, user_high_id)
);
create index social_friendships_high_user_idx on public.social_friendships (user_high_id);

create table public.social_tasks (
  id uuid primary key default gen_random_uuid(),
  friendship_id uuid not null references public.social_friendships (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 160),
  description text not null default '',
  due_date date,
  priority smallint not null default 0 check (priority between 0 and 3),
  completed boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index social_tasks_friendship_position_idx
  on public.social_tasks (friendship_id, position, created_at);

alter table public.social_friend_requests enable row level security;
alter table public.social_friendships enable row level security;
alter table public.social_tasks enable row level security;

grant select on public.social_friendships to authenticated;
grant select, delete on public.social_tasks to authenticated;
grant insert (friendship_id, created_by, title, description, due_date, priority, completed, position)
  on public.social_tasks to authenticated;
grant update (title, description, due_date, priority, completed, position, updated_at)
  on public.social_tasks to authenticated;

create policy "Users can view their friendships"
  on public.social_friendships for select to authenticated
  using ((select auth.uid()) in (user_low_id, user_high_id));

create policy "Friends can view shared tasks"
  on public.social_tasks for select to authenticated
  using (exists (
    select 1 from public.social_friendships f
    where f.id = friendship_id
      and (select auth.uid()) in (f.user_low_id, f.user_high_id)
  ));

create policy "Friends can create shared tasks"
  on public.social_tasks for insert to authenticated
  with check (exists (
    select 1 from public.social_friendships f
    where f.id = friendship_id
      and (select auth.uid()) in (f.user_low_id, f.user_high_id)
  ) and created_by = (select auth.uid()));

create policy "Friends can update shared tasks"
  on public.social_tasks for update to authenticated
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

create policy "Friends can delete shared tasks"
  on public.social_tasks for delete to authenticated
  using (exists (
    select 1 from public.social_friendships f
    where f.id = friendship_id
      and (select auth.uid()) in (f.user_low_id, f.user_high_id)
  ));

create or replace function public.social_search_user(p_query text)
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, coalesce(nullif(p.username, ''), u.email)::text
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  where (select auth.uid()) is not null
    and u.id <> (select auth.uid())
    and (
      lower(u.email) = lower(btrim(p_query))
      or lower(p.username) = lower(regexp_replace(btrim(p_query), '^@', ''))
    )
  limit 1;
$$;

create or replace function public.social_list_friends()
returns table (friendship_id uuid, friend_id uuid, display_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, u.id, coalesce(nullif(p.username, ''), u.email)::text, f.created_at
  from public.social_friendships f
  join auth.users u on u.id = case when f.user_low_id = (select auth.uid()) then f.user_high_id else f.user_low_id end
  left join public.profiles p on p.user_id = u.id
  where (select auth.uid()) in (f.user_low_id, f.user_high_id)
  order by lower(coalesce(nullif(p.username, ''), u.email)), f.created_at;
$$;

create or replace function public.social_list_requests()
returns table (request_id uuid, person_id uuid, display_name text, direction text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id,
    case when r.sender_id = (select auth.uid()) then r.recipient_id else r.sender_id end,
    coalesce(nullif(p.username, ''), u.email)::text,
    case when r.recipient_id = (select auth.uid()) then 'incoming' else 'outgoing' end,
    r.created_at
  from public.social_friend_requests r
  join auth.users u on u.id = case when r.sender_id = (select auth.uid()) then r.recipient_id else r.sender_id end
  left join public.profiles p on p.user_id = u.id
  where r.status = 'pending'
    and (select auth.uid()) in (r.sender_id, r.recipient_id)
  order by r.created_at desc;
$$;

create or replace function public.social_send_request(p_recipient uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then raise exception 'not_authenticated'; end if;
  if p_recipient is null or p_recipient = current_user_id then raise exception 'cannot_add_self'; end if;
  if not exists (select 1 from auth.users where id = p_recipient) then raise exception 'user_not_found'; end if;
  if exists (
    select 1 from public.social_friendships f
    where f.user_low_id = least(current_user_id, p_recipient)
      and f.user_high_id = greatest(current_user_id, p_recipient)
  ) then raise exception 'already_friends'; end if;
  if exists (select 1 from public.social_friend_requests r where r.sender_id = current_user_id and r.recipient_id = p_recipient and r.status = 'pending') then
    raise exception 'request_already_sent';
  end if;
  if exists (select 1 from public.social_friend_requests r where r.sender_id = p_recipient and r.recipient_id = current_user_id and r.status = 'pending') then
    raise exception 'incoming_request_exists';
  end if;

  insert into public.social_friend_requests (sender_id, recipient_id)
  values (current_user_id, p_recipient);
  return 'sent';
end;
$$;

create or replace function public.social_respond_request(p_request_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  request_row public.social_friend_requests%rowtype;
begin
  if current_user_id is null then raise exception 'not_authenticated'; end if;
  select * into request_row
  from public.social_friend_requests r
  where r.id = p_request_id and r.recipient_id = current_user_id and r.status = 'pending'
  for update;
  if not found then raise exception 'request_not_found'; end if;

  update public.social_friend_requests
  set status = case when p_accept then 'accepted' else 'rejected' end,
      updated_at = now()
  where id = request_row.id;

  if p_accept then
    insert into public.social_friendships (user_low_id, user_high_id)
    values (least(current_user_id, request_row.sender_id), greatest(current_user_id, request_row.sender_id))
    on conflict (user_low_id, user_high_id) do nothing;
    return 'accepted';
  end if;
  return 'rejected';
end;
$$;

revoke all on function public.social_search_user(text) from public, anon;
revoke all on function public.social_list_friends() from public, anon;
revoke all on function public.social_list_requests() from public, anon;
revoke all on function public.social_send_request(uuid) from public, anon;
revoke all on function public.social_respond_request(uuid, boolean) from public, anon;
grant execute on function public.social_search_user(text) to authenticated;
grant execute on function public.social_list_friends() to authenticated;
grant execute on function public.social_list_requests() to authenticated;
grant execute on function public.social_send_request(uuid) to authenticated;
grant execute on function public.social_respond_request(uuid, boolean) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'social_tasks'
  ) then
    alter publication supabase_realtime add table public.social_tasks;
  end if;
end;
$$;
