-- Keep database automation functions private to PostgreSQL triggers.
-- Existing triggers continue to execute their functions without exposing RPC endpoints.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
revoke all on function public.social_create_next_task_occurrence() from public, anon, authenticated;
revoke all on function public.social_create_next_team_task_occurrence() from public, anon, authenticated;
revoke all on function public.social_validate_shared_note_group() from public, anon, authenticated;
revoke all on function public.social_validate_task_group() from public, anon, authenticated;
revoke all on function public.social_validate_team_task_group() from public, anon, authenticated;

-- This helper is also used by an RLS policy. Restrict its answer to the caller's
-- own friendship checks so an authenticated user cannot probe arbitrary pairs.
create or replace function public.social_are_friends(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_user_a = (select auth.uid())
    and p_user_a is not null
    and p_user_b is not null
    and exists (
      select 1
      from public.social_friendships f
      where (f.user_low_id = p_user_a and f.user_high_id = p_user_b)
         or (f.user_low_id = p_user_b and f.user_high_id = p_user_a)
    );
$function$;
