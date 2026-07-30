-- ============================================================
-- Fund manager competition schema — fully additive.
-- Does NOT touch watchlist / positions / preferences.
-- Safe to re-run (idempotent creates / policy guards).
-- ============================================================
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables
create table if not exists competitions (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  starting_cash  numeric not null default 1000000 check (starting_cash > 0),
  start_date     date not null,
  end_date       date not null check (end_date >= start_date),
  allow_short    boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists competition_participants (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  cash           numeric not null,
  starting_cash  numeric not null,
  display_name   text,
  joined_at      timestamptz not null default now(),
  unique (competition_id, user_id)
);

create table if not exists competition_positions (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references competition_participants(id) on delete cascade,
  symbol         text not null,
  market         text not null check (market in ('US','KR')),
  currency       text not null,
  shares         numeric not null,          -- signed: negative = short
  avg_cost       numeric not null,
  updated_at     timestamptz not null default now(),
  unique (participant_id, symbol)
);

create table if not exists competition_trades (            -- append-only ledger
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references competition_participants(id) on delete cascade,
  symbol         text not null,
  market         text not null,
  currency       text not null,
  qty            numeric not null,          -- signed: + buy/cover, - sell/short
  price          numeric not null,
  cash_after     numeric not null,
  executed_at    timestamptz not null default now()
);

create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create index if not exists idx_participants_competition on competition_participants(competition_id);
create index if not exists idx_positions_participant     on competition_positions(participant_id);
create index if not exists idx_trades_participant        on competition_trades(participant_id, executed_at desc);

-- ---------------------------------------------------------------- RLS
alter table competitions             enable row level security;
alter table competition_participants enable row level security;
alter table competition_positions    enable row level security;
alter table competition_trades       enable row level security;
alter table admins                   enable row level security;

drop policy if exists competitions_select_all on competitions;
create policy competitions_select_all on competitions for select using (true);
grant select on competitions to anon, authenticated;

-- participants: any logged-in member sees everyone (transparent leaderboard);
-- self-join is the ONLY direct client insert allowed; no client update/delete.
drop policy if exists participants_select_all on competition_participants;
create policy participants_select_all on competition_participants
  for select to authenticated using (true);
drop policy if exists participants_self_insert on competition_participants;
create policy participants_self_insert on competition_participants
  for insert to authenticated with check (auth.uid() = user_id);
grant select, insert on competition_participants to authenticated;

-- positions/trades: read-only to clients; all mutation goes through execute_trade()
drop policy if exists positions_select_all on competition_positions;
create policy positions_select_all on competition_positions
  for select to authenticated using (true);
drop policy if exists trades_select_all on competition_trades;
create policy trades_select_all on competition_trades
  for select to authenticated using (true);
grant select on competition_positions to authenticated;
grant select on competition_trades to authenticated;

-- admins: self-check only; adding admins is a manual SQL-editor operation.
drop policy if exists admins_self_select on admins;
create policy admins_self_select on admins for select using (auth.uid() = user_id);
grant select on admins to authenticated;

-- ---------------------------------------------------------------- execute_trade
-- Single entry point for ALL buy/sell/short/cover. SECURITY DEFINER so it can
-- write to tables the `authenticated` role has no INSERT/UPDATE policy on.
-- Concurrency: locking the participant row (FOR UPDATE) serializes every trade
-- by that user, so no separate locking is needed on competition_positions — no
-- other transaction can be mid-trade for this participant while this one holds
-- the lock, which is what prevents a double-spend race.
create or replace function public.execute_trade(
  p_competition_id uuid,
  p_symbol         text,
  p_market         text,
  p_currency       text,
  p_qty            numeric,        -- signed: + buy/cover, - sell/short
  p_price          numeric,        -- server-fetched execution price
  p_price_map      jsonb default '{}'::jsonb  -- {symbol: currentPrice} for OTHER short positions, for margin calc
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant     competition_participants%rowtype;
  v_competition     competitions%rowtype;
  v_pos             competition_positions%rowtype;
  v_existing_shares numeric := 0;
  v_existing_avg    numeric := 0;
  v_new_shares      numeric;
  v_new_avg         numeric;
  v_new_cash        numeric;
  v_short_exposure  numeric := 0;
  v_trade_id        uuid;
begin
  if p_qty = 0 then
    raise exception 'quantity must be nonzero';
  end if;

  select * into v_competition from competitions where id = p_competition_id;
  if not found then raise exception 'competition not found'; end if;
  if now()::date < v_competition.start_date or now()::date > v_competition.end_date then
    raise exception 'competition is not active';
  end if;

  select * into v_participant
    from competition_participants
    where competition_id = p_competition_id and user_id = auth.uid()
    for update;
  if not found then raise exception 'not a participant in this competition'; end if;

  select * into v_pos
    from competition_positions
    where participant_id = v_participant.id and symbol = p_symbol;
  if found then
    v_existing_shares := v_pos.shares;
    v_existing_avg    := v_pos.avg_cost;
  end if;

  v_new_shares := v_existing_shares + p_qty;

  if not v_competition.allow_short and v_new_shares < 0 then
    raise exception 'short selling is disabled for this competition';
  end if;

  v_new_cash := v_participant.cash - (p_qty * p_price);

  if p_qty > 0 then
    if v_new_cash < 0 then
      raise exception 'insufficient cash: trade requires %, available %',
        round(p_qty * p_price, 2), v_participant.cash;
    end if;
  else
    -- sells never reduce cash by themselves; only a resulting SHORT position
    -- consumes margin. 100%-cash-collateralized shorting:
    -- sum(|shares*price|) over shares<0 must not exceed cash.
    select coalesce(sum(abs(cp.shares * coalesce((p_price_map ->> cp.symbol)::numeric, cp.avg_cost))), 0)
      into v_short_exposure
      from competition_positions cp
      where cp.participant_id = v_participant.id and cp.shares < 0 and cp.symbol <> p_symbol;

    if v_new_shares < 0 then
      v_short_exposure := v_short_exposure + abs(v_new_shares * p_price);
    end if;

    if v_short_exposure > v_new_cash then
      raise exception 'insufficient margin: short exposure % exceeds available cash %',
        round(v_short_exposure, 2), round(v_new_cash, 2);
    end if;
  end if;

  -- weighted-average-cost upsert
  if v_existing_shares = 0 then
    v_new_avg := p_price;                                    -- opening
  elsif (p_qty > 0) = (v_existing_shares > 0) then
    v_new_avg := (v_existing_shares * v_existing_avg + p_qty * p_price) / v_new_shares;  -- same-direction add
  elsif v_new_shares = 0 then
    v_new_avg := 0;                                          -- full close (row deleted below)
  elsif (v_new_shares > 0) = (v_existing_shares > 0) then
    v_new_avg := v_existing_avg;                             -- partial close, avg unchanged
  else
    v_new_avg := p_price;                                    -- close-and-flip, avg resets
  end if;

  if v_new_shares = 0 then
    delete from competition_positions where participant_id = v_participant.id and symbol = p_symbol;
  else
    insert into competition_positions (participant_id, symbol, market, currency, shares, avg_cost, updated_at)
    values (v_participant.id, p_symbol, p_market, p_currency, v_new_shares, v_new_avg, now())
    on conflict (participant_id, symbol)
    do update set shares = v_new_shares, avg_cost = v_new_avg,
                  market = p_market, currency = p_currency, updated_at = now();
  end if;

  insert into competition_trades (participant_id, symbol, market, currency, qty, price, cash_after)
  values (v_participant.id, p_symbol, p_market, p_currency, p_qty, p_price, v_new_cash)
  returning id into v_trade_id;

  update competition_participants set cash = v_new_cash where id = v_participant.id;

  return jsonb_build_object('trade_id', v_trade_id, 'cash', v_new_cash,
                            'shares', v_new_shares, 'avg_cost', v_new_avg);
end;
$$;

grant execute on function public.execute_trade to authenticated;

-- ---------------------------------------------------------------- admin cash adjustment
-- Atomic wrapper for the admin app's manual correction so the cash update and
-- the audit-trail ledger row can't diverge on partial failure.
create or replace function public.admin_adjust_cash(
  p_participant_id uuid,
  p_delta numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_cash numeric;
  v_trade_id uuid;
begin
  update competition_participants set cash = cash + p_delta
    where id = p_participant_id
    returning cash into v_new_cash;
  if not found then raise exception 'participant not found'; end if;

  insert into competition_trades (participant_id, symbol, market, currency, qty, price, cash_after)
  values (p_participant_id, 'CASH_ADJUSTMENT', 'US', 'USD', 0, p_delta, v_new_cash)
  returning id into v_trade_id;

  return jsonb_build_object('trade_id', v_trade_id, 'cash', v_new_cash);
end;
$$;

revoke all on function public.admin_adjust_cash from public, anon, authenticated;
grant execute on function public.admin_adjust_cash to service_role;
