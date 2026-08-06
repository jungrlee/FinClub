-- ============================================================
-- Club events (admin-published, shown on the Calendar tab's month grid).
-- Fully additive. Safe to re-run (idempotent creates / policy guards).
-- ============================================================
create extension if not exists pgcrypto;

create table if not exists club_events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  event_date  date not null,
  description text,
  created_at  timestamptz not null default now()
);

alter table club_events enable row level security;

-- Public read (any logged-in app user) — writes only happen through the
-- service-role client after requireAdmin(), same as `competitions` in
-- competition_schema.sql: no INSERT/UPDATE/DELETE policy for `authenticated`.
drop policy if exists club_events_select_all on club_events;
create policy club_events_select_all on club_events for select using (true);
