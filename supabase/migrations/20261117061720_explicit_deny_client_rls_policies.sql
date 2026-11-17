-- These records are private backend state. Keep client roles explicitly denied
-- even if a broad table grant is accidentally added in the future.
create policy "Deny direct client access"
  on public.social_friend_requests
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy "Deny direct client access"
  on public.collaboration_notifications
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy "Deny direct client access"
  on public.google_calendar_connections
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy "Deny direct client access"
  on public.google_calendar_event_links
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy "Deny direct client access"
  on public.google_calendar_oauth_states
  as restrictive for all to anon, authenticated
  using (false) with check (false);
