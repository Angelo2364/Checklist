alter table public.profiles
  drop constraint if exists profiles_username_format,
  add constraint profiles_username_format
    check (
      length(username) between 3 and 20
      and username ~ '^[a-z0-9_]+( [a-z0-9_]+)*$'
    );

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
begin
  requested_username := lower(btrim(regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'username', ''),
    '[[:space:]]+', ' ', 'g'
  )));

  if length(requested_username) not between 3 and 20
    or requested_username !~ '^[a-z0-9_]+( [a-z0-9_]+)*$' then
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
