-- Exposes a narrowly scoped atomic mutation for the user's personal task/event JSON.
-- The caller can only mutate the row selected by auth.uid(); RLS remains in force.

create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

grant select, insert, update on public.user_data to authenticated;

-- Preserve the production policies if they already exist; create owner-only
-- policies only on fresh/local databases where the app table had to be created.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_data' and cmd = 'SELECT') then
    create policy "Crysalis users can read own data" on public.user_data
      for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_data' and cmd = 'INSERT') then
    create policy "Crysalis users can create own data" on public.user_data
      for insert to authenticated with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_data' and cmd = 'UPDATE') then
    create policy "Crysalis users can update own data" on public.user_data
      for update to authenticated using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end;
$$;

create or replace function public.crysalis_ai_mutate_personal_item(
  p_collection text,
  p_action text,
  p_item_id text,
  p_item jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  current_data jsonb;
  current_items jsonb;
  next_items jsonb;
  next_routines jsonb;
  changed_item jsonb;
  matched boolean := false;
  row_exists boolean := false;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_collection not in ('tarefas', 'eventos') then
    raise exception using errcode = '22023', message = 'invalid_collection';
  end if;
  if p_action not in ('create', 'update', 'delete') then
    raise exception using errcode = '22023', message = 'invalid_action';
  end if;
  if nullif(btrim(p_item_id), '') is null then
    raise exception using errcode = '22023', message = 'item_id_required';
  end if;

  select ud.data into current_data
  from public.user_data as ud
  where ud.user_id = caller
  for update;
  row_exists := found;

  if not row_exists then
    insert into public.user_data (user_id, data, updated_at)
    values (caller, '{}'::jsonb, now())
    on conflict (user_id) do nothing;
    select ud.data into current_data
    from public.user_data as ud
    where ud.user_id = caller
    for update;
  end if;

  current_items := coalesce(current_data -> p_collection, '[]'::jsonb);
  next_routines := coalesce(current_data -> 'rotinas', '[]'::jsonb);
  if jsonb_typeof(current_items) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_user_collection';
  end if;

  if p_action = 'create' then
    if exists (
      select 1 from jsonb_array_elements(current_items) as item
      where item ->> 'id' = p_item_id
    ) then
      raise exception using errcode = '23505', message = 'item_already_exists';
    end if;
    changed_item := coalesce(p_item, '{}'::jsonb) || jsonb_build_object('id', p_item_id);
    next_items := current_items || jsonb_build_array(changed_item);
  elsif p_action = 'update' then
    select true into matched
    from jsonb_array_elements(current_items) as item
    where item ->> 'id' = p_item_id
    limit 1;
    if not coalesce(matched, false) then
      raise exception using errcode = 'P0002', message = 'item_not_found';
    end if;
    select jsonb_agg(
      case when item ->> 'id' = p_item_id
        then item || (coalesce(p_item, '{}'::jsonb) - 'id')
        else item
      end order by ordinal
    ) into next_items
    from jsonb_array_elements(current_items) with ordinality as entries(item, ordinal);
    select item into changed_item
    from jsonb_array_elements(next_items) as item
    where item ->> 'id' = p_item_id
    limit 1;
  else
    select item into changed_item
    from jsonb_array_elements(current_items) as item
    where item ->> 'id' = p_item_id
    limit 1;
    if changed_item is null then
      raise exception using errcode = 'P0002', message = 'item_not_found';
    end if;
    select coalesce(jsonb_agg(item order by ordinal), '[]'::jsonb) into next_items
    from jsonb_array_elements(current_items) with ordinality as entries(item, ordinal)
    where item ->> 'id' <> p_item_id;
  end if;

  -- Deleting a recurring task also stops the source routine. Editing the shared
  -- fields of a generated task keeps future instances in step with the change.
  if p_collection = 'tarefas' and nullif(changed_item ->> 'rotinaId', '') is not null then
    if p_action = 'delete' then
      select coalesce(jsonb_agg(item order by ordinal), '[]'::jsonb) into next_routines
      from jsonb_array_elements(next_routines) with ordinality as entries(item, ordinal)
      where item ->> 'id' <> changed_item ->> 'rotinaId';
    elsif p_action = 'update' then
      select coalesce(jsonb_agg(
        case when item ->> 'id' = changed_item ->> 'rotinaId' then
          item || jsonb_build_object(
            'texto', changed_item -> 'texto',
            'descricao', changed_item -> 'descricao',
            'comentario', changed_item -> 'comentario',
            'limite', changed_item -> 'limite',
            'limiteHora', changed_item -> 'limiteHora',
            'grupoId', changed_item -> 'grupoId',
            'prioridade', changed_item -> 'prioridade'
          )
        else item end order by ordinal
      ), '[]'::jsonb) into next_routines
      from jsonb_array_elements(next_routines) with ordinality as entries(item, ordinal);
    end if;
  end if;

  update public.user_data as ud
  set data = case when p_collection = 'tarefas' then
        jsonb_set(
          jsonb_set(coalesce(ud.data, '{}'::jsonb), array[p_collection], next_items, true),
          '{rotinas}', next_routines, true
        )
      else jsonb_set(coalesce(ud.data, '{}'::jsonb), array[p_collection], next_items, true) end,
      updated_at = clock_timestamp()
  where ud.user_id = caller;

  return jsonb_build_object(
    'action', p_action,
    'collection', p_collection,
    'item', changed_item,
    'updated_at', clock_timestamp()
  );
end;
$$;

revoke all on function public.crysalis_ai_mutate_personal_item(text, text, text, jsonb) from public, anon;
grant execute on function public.crysalis_ai_mutate_personal_item(text, text, text, jsonb) to authenticated;
