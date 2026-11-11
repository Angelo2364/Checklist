create table if not exists public.social_friend_order (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  friendship_id uuid not null references public.social_friendships (id) on delete cascade,
  position integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, friendship_id)
);

create index if not exists social_friend_order_user_position_idx
  on public.social_friend_order (user_id, position);

alter table public.social_friend_order enable row level security;

drop policy if exists "Users manage their own friend order" on public.social_friend_order;
create policy "Users manage their own friend order"
  on public.social_friend_order for all to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.social_friendships f
      where f.id = friendship_id
        and (select auth.uid()) in (f.user_low_id, f.user_high_id)
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.social_friendships f
      where f.id = friendship_id
        and (select auth.uid()) in (f.user_low_id, f.user_high_id)
    )
  );

grant select, insert, update, delete on public.social_friend_order to authenticated;
