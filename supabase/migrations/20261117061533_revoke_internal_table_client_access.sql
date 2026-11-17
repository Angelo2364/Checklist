-- These tables are accessed only by SECURITY DEFINER RPCs, database triggers,
-- and the service-role notification worker. Keep direct client roles out.
revoke all on table public.social_friend_requests from anon, authenticated;
revoke all on table public.collaboration_notifications from anon, authenticated;
