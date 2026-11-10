create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  constraint profiles_username_format
    check (username ~ '^[a-z0-9_]{3,20}$')
);

create unique index profiles_username_case_insensitive_key
  on public.profiles (lower(username));

alter table public.profiles enable row level security;

grant select, insert, update on public.profiles to authenticated;

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
begin
  requested_username := lower(btrim(new.raw_user_meta_data ->> 'username'));

  if requested_username is null or requested_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception using
      errcode = '22023',
      message = 'invalid_username';
  end if;

  insert into public.profiles (user_id, username)
  values (new.id, requested_username);

  return new;
end;
$$;

revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();
