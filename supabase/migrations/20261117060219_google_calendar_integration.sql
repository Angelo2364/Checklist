-- Private Google Calendar credentials and event links. All access is mediated
-- by the google-calendar Edge Function using the service role.
create table if not exists public.google_calendar_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  encrypted_refresh_token text not null,
  selected_calendar_ids jsonb not null default '["primary"]'::jsonb,
  write_calendar_id text not null default 'primary',
  granted_scopes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.google_calendar_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  return_origin text not null,
  encrypted_code_verifier text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists google_calendar_oauth_states_expiry_idx
  on public.google_calendar_oauth_states (expires_at);

create table if not exists public.google_calendar_event_links (
  user_id uuid not null references auth.users (id) on delete cascade,
  local_event_id text not null,
  google_calendar_id text not null,
  google_event_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, local_event_id),
  unique (user_id, google_calendar_id, google_event_id)
);

alter table public.google_calendar_connections enable row level security;
alter table public.google_calendar_oauth_states enable row level security;
alter table public.google_calendar_event_links enable row level security;

revoke all on public.google_calendar_connections from anon, authenticated;
revoke all on public.google_calendar_oauth_states from anon, authenticated;
revoke all on public.google_calendar_event_links from anon, authenticated;
grant all on public.google_calendar_connections to service_role;
grant all on public.google_calendar_oauth_states to service_role;
grant all on public.google_calendar_event_links to service_role;
