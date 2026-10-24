-- Blok Bottom (online play) for supsobers.com.
-- Paste this whole file into Supabase > SQL Editor > New query > Run. It is safe to run again if the file is updated.
-- Use the same Supabase project as the topic board (supabase/topics.sql). Nothing else to set up.
--
-- How it works: a game is a table with 2, 4, 5 or 6 seats. The database keeps the seats and an ordered list of moves.
-- Every browser runs the same rules on the same move list, so everyone sees the same board. Seats nobody takes are played by
-- the computer, and a seat whose player disappears is taken over by the computer too.
-- Visitors never touch the tables: they can only call the functions below (no direct read or write access).

create extension if not exists pgcrypto;

create table if not exists bk_games (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,                                  -- 5 letters, only for private tables
  variant     text not null check (variant in ('duo', 'four', 'five', 'six')),
  seats       int  not null check (seats between 2 and 6),
  status      text not null default 'open' check (status in ('open', 'playing', 'done')),
  private     boolean not null default false,
  n_moves     int  not null default 0,
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  updated_at  timestamptz not null default now()
);
create table if not exists bk_seats (
  game_id   uuid not null references bk_games (id) on delete cascade,
  seat      int  not null,
  pid       text not null,                                  -- a private random id kept in the visitor's browser; never sent to anyone else
  name      text not null,
  last_seen timestamptz not null default now(),
  primary key (game_id, seat)
);
create index if not exists bk_seats_pid on bk_seats (pid);
create table if not exists bk_moves (
  game_id uuid not null references bk_games (id) on delete cascade,
  idx     int  not null,
  seat    int  not null,
  data    jsonb not null,
  primary key (game_id, idx)
);

alter table bk_games enable row level security;
alter table bk_seats enable row level security;
alter table bk_moves enable row level security;
revoke all on bk_games, bk_seats, bk_moves from anon, authenticated;

-- ---------- helpers ----------
create or replace function bk_seat_count(p_variant text) returns int language sql immutable as $$
  select case p_variant when 'duo' then 2 when 'four' then 4 when 'five' then 5 when 'six' then 6 end
$$;

create or replace function bk_sweep() returns void language plpgsql security definer set search_path = public as $$
begin
  delete from bk_games where status = 'open' and updated_at < now() - interval '30 minutes';
  update bk_games set status = 'done' where status = 'playing' and updated_at < now() - interval '30 minutes';
  delete from bk_games where status = 'done' and updated_at < now() - interval '2 days';
end $$;

-- What a browser needs to draw the table: who sits where, who is online, and the moves from p_since on.
create or replace function bk_view(p_game uuid, p_pid text, p_since int default 0) returns jsonb language plpgsql security definer set search_path = public as $$
declare gm bk_games; seats_j jsonb; moves_j jsonb; host int;
begin
  select * into gm from bk_games where id = p_game;
  if not found then return jsonb_build_object('gone', true); end if;
  select coalesce(jsonb_agg(jsonb_build_object('seat', s.seat, 'name', s.name, 'online', s.last_seen > now() - interval '25 seconds', 'you', s.pid = p_pid) order by s.seat), '[]'::jsonb)
    into seats_j from bk_seats s where s.game_id = gm.id;
  select min(s.seat) into host from bk_seats s where s.game_id = gm.id and s.last_seen > now() - interval '25 seconds';
  select coalesce(jsonb_agg(jsonb_build_object('i', m.idx, 's', m.seat, 'd', m.data) order by m.idx), '[]'::jsonb)
    into moves_j from bk_moves m where m.game_id = gm.id and m.idx >= greatest(p_since, 0);
  return jsonb_build_object('id', gm.id, 'variant', gm.variant, 'seatCount', gm.seats, 'status', gm.status, 'code', gm.code, 'private', gm.private,
    'nMoves', gm.n_moves, 'host', host, 'seats', seats_j, 'moves', moves_j, 'idleSeconds', extract(epoch from (now() - gm.updated_at))::int);
end $$;

-- ---------- what the website calls ----------
-- Sit down at a table: finds an open one for this board size (or makes a new one), or uses a private code.
create or replace function bk_join(p_variant text, p_pid text, p_name text, p_code text default null, p_private boolean default false) returns jsonb language plpgsql security definer set search_path = public as $$
declare gm bk_games; nm text; free_seat int; taken int; chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text; tries int := 0;
begin
  if p_pid is null or char_length(p_pid) < 16 or char_length(p_pid) > 64 then raise exception 'bad id'; end if;
  if bk_seat_count(p_variant) is null and p_code is null then raise exception 'unknown board'; end if;
  nm := left(btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g')), 18); if nm = '' then nm := 'Guest'; end if;
  perform bk_sweep();
  -- already sitting at a live table? Go back to it, unless it is a different board size.
  select g.* into gm from bk_games g join bk_seats s on s.game_id = g.id where s.pid = p_pid and g.status in ('open', 'playing') order by g.created_at desc limit 1;
  if found then
    if (p_code is null or gm.code = upper(p_code)) and (p_code is not null or gm.variant = p_variant) then
      update bk_seats set last_seen = now(), name = nm where game_id = gm.id and pid = p_pid;
      return bk_view(gm.id, p_pid, 0);
    end if;
    delete from bk_seats where game_id = gm.id and pid = p_pid;
    if not exists (select 1 from bk_seats where game_id = gm.id) then delete from bk_games where id = gm.id; end if;
  end if;

  if p_code is not null and btrim(p_code) <> '' then
    select * into gm from bk_games where code = upper(btrim(p_code)) and status = 'open' for update;
    if not found then raise exception 'No open table with that code.'; end if;
  elsif p_private then
    loop
      c := ''; for i in 1..5 loop c := c || substr(chars, 1 + floor(random() * length(chars))::int, 1); end loop;
      begin
        insert into bk_games (variant, seats, private, code) values (p_variant, bk_seat_count(p_variant), true, c) returning * into gm; exit;
      exception when unique_violation then tries := tries + 1; if tries > 20 then raise; end if;
      end;
    end loop;
  else
    select g.* into gm from bk_games g
      where g.variant = p_variant and g.status = 'open' and not g.private
        and (select count(*) from bk_seats s where s.game_id = g.id) < g.seats
        and exists (select 1 from bk_seats s where s.game_id = g.id and s.last_seen > now() - interval '30 seconds')
      order by g.created_at limit 1 for update of g skip locked;
    if not found then insert into bk_games (variant, seats) values (p_variant, bk_seat_count(p_variant)) returning * into gm; end if;
  end if;

  select min(x) into free_seat from generate_series(0, gm.seats - 1) x where not exists (select 1 from bk_seats s where s.game_id = gm.id and s.seat = x);
  if free_seat is null then raise exception 'That table is full.'; end if;
  insert into bk_seats (game_id, seat, pid, name) values (gm.id, free_seat, p_pid, nm);
  select count(*) into taken from bk_seats where game_id = gm.id;
  update bk_games set updated_at = now(), status = case when taken >= gm.seats then 'playing' else status end,
    started_at = case when taken >= gm.seats then now() else started_at end where id = gm.id;
  return bk_view(gm.id, p_pid, 0);
end $$;

-- The first person at the table (host) starts early: empty seats are played by the computer.
create or replace function bk_start(p_game uuid, p_pid text) returns jsonb language plpgsql security definer set search_path = public as $$
declare gm bk_games; me int; host int;
begin
  select * into gm from bk_games where id = p_game for update; if not found then return jsonb_build_object('gone', true); end if;
  select seat into me from bk_seats where game_id = p_game and pid = p_pid; if me is null then raise exception 'not seated'; end if;
  select min(s.seat) into host from bk_seats s where s.game_id = p_game and s.last_seen > now() - interval '25 seconds';
  if gm.status = 'open' then
    if host is distinct from me then raise exception 'Only the host can start.'; end if;
    update bk_games set status = 'playing', started_at = now(), updated_at = now() where id = p_game;
  end if;
  update bk_seats set last_seen = now() where game_id = p_game and pid = p_pid;
  return bk_view(p_game, p_pid, 0);
end $$;

-- Poll: keeps you marked as online and returns the table plus any moves you have not seen.
create or replace function bk_state(p_game uuid, p_pid text, p_since int default 0) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update bk_seats set last_seen = now() where game_id = p_game and pid = p_pid;
  return bk_view(p_game, p_pid, p_since);
end $$;

-- Submit a move. It only counts if it is the next one in line (p_idx), so two browsers can never both add the same move.
-- You may move your own seat, or a seat the computer is playing (empty, player gone, or stuck for 90 seconds).
create or replace function bk_move(p_game uuid, p_pid text, p_idx int, p_seat int, p_data jsonb, p_done boolean default false) returns jsonb language plpgsql security definer set search_path = public as $$
declare gm bk_games; me int; owner_seen timestamptz; owner_pid text;
begin
  if p_data is null or length(p_data::text) > 200 then raise exception 'bad move'; end if;
  select * into gm from bk_games where id = p_game for update; if not found then return jsonb_build_object('gone', true); end if;
  select seat into me from bk_seats where game_id = p_game and pid = p_pid; if me is null then raise exception 'not seated'; end if;
  update bk_seats set last_seen = now() where game_id = p_game and pid = p_pid;
  if gm.status <> 'playing' then raise exception 'The game is not running.'; end if;
  if p_idx <> gm.n_moves then return bk_view(p_game, p_pid, p_idx) || jsonb_build_object('stale', true); end if;
  if p_seat < 0 or p_seat >= gm.seats then raise exception 'bad seat'; end if;
  select s.last_seen, s.pid into owner_seen, owner_pid from bk_seats s where s.game_id = p_game and s.seat = p_seat;
  if owner_pid is distinct from p_pid and owner_pid is not null and owner_seen > now() - interval '25 seconds' and gm.updated_at > now() - interval '90 seconds' then
    raise exception 'That seat belongs to another player.';
  end if;
  insert into bk_moves (game_id, idx, seat, data) values (p_game, p_idx, p_seat, p_data);
  update bk_games set n_moves = n_moves + 1, updated_at = now(), status = case when p_done then 'done' else status end where id = p_game;
  return bk_view(p_game, p_pid, p_idx);
end $$;

create or replace function bk_leave(p_game uuid, p_pid text) returns void language plpgsql security definer set search_path = public as $$
declare gm bk_games;
begin
  select * into gm from bk_games where id = p_game for update; if not found then return; end if;
  delete from bk_seats where game_id = p_game and pid = p_pid;
  if not exists (select 1 from bk_seats where game_id = p_game) then
    if gm.status = 'open' then delete from bk_games where id = p_game; else update bk_games set status = 'done', updated_at = now() where id = p_game; end if;
  end if;
end $$;

-- Anyone at the table can mark the game finished once the last move is in.
create or replace function bk_finish(p_game uuid, p_pid text) returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from bk_seats where game_id = p_game and pid = p_pid) then
    update bk_games set status = 'done', updated_at = now() where id = p_game and status = 'playing';
  end if;
end $$;

-- For the lobby screen: how many people are waiting or playing, and whether you are already at a table.
create or replace function bk_lobby(p_pid text) returns jsonb language plpgsql security definer set search_path = public as $$
declare res jsonb := '{}'::jsonb; v text; mine jsonb := null; gm bk_games;
begin
  perform bk_sweep();
  foreach v in array array['duo', 'four', 'five', 'six'] loop
    res := res || jsonb_build_object(v, jsonb_build_object(
      'waiting', (select count(*) from bk_seats s join bk_games g on g.id = s.game_id where g.variant = v and g.status = 'open' and not g.private and s.last_seen > now() - interval '30 seconds'),
      'playing', (select count(*) from bk_seats s join bk_games g on g.id = s.game_id where g.variant = v and g.status = 'playing' and s.last_seen > now() - interval '30 seconds')));
  end loop;
  select g.* into gm from bk_games g join bk_seats s on s.game_id = g.id where s.pid = p_pid and g.status in ('open', 'playing') order by g.created_at desc limit 1;
  if found then mine := jsonb_build_object('id', gm.id, 'variant', gm.variant, 'status', gm.status); end if;
  return jsonb_build_object('boards', res, 'mine', mine);
end $$;

revoke all on function bk_seat_count(text), bk_sweep(), bk_view(uuid, text, int) from public, anon, authenticated;
revoke all on function bk_join(text, text, text, text, boolean), bk_start(uuid, text), bk_state(uuid, text, int), bk_move(uuid, text, int, int, jsonb, boolean), bk_leave(uuid, text), bk_finish(uuid, text), bk_lobby(text) from public;
grant execute on function bk_join(text, text, text, text, boolean), bk_start(uuid, text), bk_state(uuid, text, int), bk_move(uuid, text, int, int, jsonb, boolean), bk_leave(uuid, text), bk_finish(uuid, text), bk_lobby(text) to anon;
