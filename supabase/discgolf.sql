-- Disc-ipline "Play together" (online rounds) for supsobers.com.
-- Paste this whole file into Supabase > SQL Editor > New query > Run. It is safe to run again if the file is updated.
-- Use the same Supabase project as the topic board and Blok Bottom. Nothing else to set up.
--
-- How it works: a player makes a room and gets a 5-letter code. Friends enter the code. Everyone plays their own round on their own
-- screen, at their own pace, and every throw (a short list of points the disc flew through) and every hole score is posted to the room.
-- Everyone else's browser polls the room and replays those throws on a little map. Visitors never touch the tables: they can only
-- call the functions below (no direct read or write access). Rooms are deleted after a few hours.

create table if not exists dg_rooms (
  code       text primary key,
  course     text not null default 'challenge',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists dg_players (
  code      text not null references dg_rooms (code) on delete cascade,
  pid       text not null,                                  -- a private random id kept in the visitor's browser; never sent to anyone else
  seat      int  not null,
  name      text not null,
  last_seen timestamptz not null default now(),
  primary key (code, pid)
);
create table if not exists dg_events (
  id   bigserial primary key,
  code text not null references dg_rooms (code) on delete cascade,
  seat int  not null,
  data jsonb not null,
  at   timestamptz not null default now()
);
create index if not exists dg_events_code on dg_events (code, id);

alter table dg_rooms enable row level security;
alter table dg_players enable row level security;
alter table dg_events enable row level security;
revoke all on dg_rooms, dg_players, dg_events from anon, authenticated;

create or replace function dg_sweep() returns void language plpgsql security definer set search_path = public as $$
begin
  delete from dg_rooms where updated_at < now() - interval '6 hours';
end $$;

-- What a browser needs to draw the room: who is in it and the events after p_since.
create or replace function dg_view(p_code text, p_since bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare rm dg_rooms; pl jsonb; ev jsonb; mx bigint;
begin
  select * into rm from dg_rooms where code = p_code; if not found then return jsonb_build_object('gone', true); end if;
  select coalesce(jsonb_agg(jsonb_build_object('seat', seat, 'name', name, 'on', last_seen > now() - interval '25 seconds') order by seat), '[]'::jsonb) into pl from dg_players where code = p_code;
  select coalesce(jsonb_agg(jsonb_build_object('i', id, 's', seat, 'd', data) order by id), '[]'::jsonb), coalesce(max(id), p_since) into ev, mx
    from (select * from dg_events where code = p_code and id > p_since order by id limit 120) x;
  return jsonb_build_object('code', rm.code, 'course', rm.course, 'players', pl, 'events', ev, 'last', mx);
end $$;

-- Make a room (p_code empty) or join one. Up to 6 players. Coming back with the same pid gives you your seat back.
create or replace function dg_join(p_code text, p_pid text, p_name text, p_course text default 'challenge') returns jsonb language plpgsql security definer set search_path = public as $$
declare c text := upper(trim(coalesce(p_code, ''))); rm dg_rooms; s int; n int; tries int := 0; alpha text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if p_pid is null or length(p_pid) < 16 or length(p_pid) > 40 then raise exception 'bad id'; end if;
  perform dg_sweep();
  if c = '' then
    loop
      c := ''; for n in 1..5 loop c := c || substr(alpha, 1 + floor(random() * length(alpha))::int, 1); end loop;
      exit when not exists (select 1 from dg_rooms where code = c);
      tries := tries + 1; if tries > 20 then raise exception 'try again'; end if;
    end loop;
    insert into dg_rooms (code, course) values (c, left(coalesce(p_course, 'challenge'), 30));
  else
    select * into rm from dg_rooms where code = c; if not found then raise exception 'No room with that code.'; end if;
  end if;
  select seat into s from dg_players where code = c and pid = p_pid;
  if s is null then
    select count(*) into n from dg_players where code = c and last_seen > now() - interval '10 minutes';
    if n >= 6 then raise exception 'That room is full (6 players).'; end if;
    select coalesce(max(seat), -1) + 1 into s from dg_players where code = c;
    insert into dg_players (code, pid, seat, name) values (c, p_pid, s, left(coalesce(nullif(trim(p_name), ''), 'Player'), 18));
  else
    update dg_players set last_seen = now(), name = left(coalesce(nullif(trim(p_name), ''), name), 18) where code = c and pid = p_pid;
  end if;
  update dg_rooms set updated_at = now() where code = c;
  return dg_view(c, 0) || jsonb_build_object('seat', s);
end $$;

-- Poll: marks you as online and returns everything after p_since.
create or replace function dg_poll(p_code text, p_pid text, p_since bigint) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update dg_players set last_seen = now() where code = upper(p_code) and pid = p_pid;
  if not found then return jsonb_build_object('gone', true); end if;
  return dg_view(upper(p_code), p_since);
end $$;

-- Post one event (a throw, a hole score, a hole start). Small and rate-limited.
create or replace function dg_post(p_code text, p_pid text, p_data jsonb) returns void language plpgsql security definer set search_path = public as $$
declare s int;
begin
  if p_data is null or length(p_data::text) > 6000 then raise exception 'too big'; end if;
  select seat into s from dg_players where code = upper(p_code) and pid = p_pid; if s is null then raise exception 'not in this room'; end if;
  if (select count(*) from dg_events where code = upper(p_code) and seat = s and at > now() - interval '10 seconds') > 30 then raise exception 'slow down'; end if;
  insert into dg_events (code, seat, data) values (upper(p_code), s, p_data);
  update dg_players set last_seen = now() where code = upper(p_code) and pid = p_pid;
  update dg_rooms set updated_at = now() where code = upper(p_code);
end $$;

create or replace function dg_leave(p_code text, p_pid text) returns void language plpgsql security definer set search_path = public as $$
begin
  delete from dg_players where code = upper(p_code) and pid = p_pid;
  delete from dg_rooms r where r.code = upper(p_code) and not exists (select 1 from dg_players where code = r.code);
end $$;

revoke all on function dg_sweep(), dg_view(text, bigint) from public, anon, authenticated;
revoke all on function dg_join(text, text, text, text), dg_poll(text, text, bigint), dg_post(text, text, jsonb), dg_leave(text, text) from public;
grant execute on function dg_join(text, text, text, text), dg_poll(text, text, bigint), dg_post(text, text, jsonb), dg_leave(text, text) to anon;
