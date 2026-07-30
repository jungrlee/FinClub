-- ============================================================
-- Shared KIS OAuth token cache — additive, unrelated to the
-- competition schema.
--
-- Why this exists: lib/providers/kis.js used to cache the KIS access
-- token in module-scope memory. That works on a single long-running
-- server, but Vercel serverless functions are ephemeral and can run many
-- concurrent instances — each cold instance had its own empty cache and
-- requested its own token. KIS rate-limits token issuance hard and
-- appears to invalidate a previous token when a new one is issued, so
-- concurrent instances kept stepping on each other's tokens, causing
-- intermittent "invalid token" (EGW00121) failures under real traffic.
--
-- This single shared row lets every instance read/write the same token,
-- so only one instance actually calls KIS's token endpoint at a time.
-- No user data lives here — just an ephemeral bearer token and its
-- expiry — so an open RLS policy is a reliability tradeoff, not a
-- security one: worst case, someone forces an extra refresh.
-- ============================================================
create table if not exists kis_tokens (
  id           int primary key default 1 check (id = 1),  -- singleton row
  access_token text,
  expires_at   timestamptz,
  updated_at   timestamptz not null default now()
);

insert into kis_tokens (id) values (1) on conflict (id) do nothing;

alter table kis_tokens enable row level security;

drop policy if exists kis_tokens_all on kis_tokens;
create policy kis_tokens_all on kis_tokens for all using (true) with check (true);
grant select, insert, update on kis_tokens to anon, authenticated;
