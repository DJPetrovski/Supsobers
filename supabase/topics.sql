-- Topic requests for supsobers.com. Paste this whole file into Supabase > SQL Editor > New query > Run. Safe to run once.

create extension if not exists pgcrypto;

create table if not exists topics (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 3 and 80),
  note        text check (note is null or char_length(note) <= 280),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'covered', 'rejected')),
  votes       int  not null default 0,          -- real votes from visitors
  boost       int  not null default 0,          -- votes YOU add by hand (for example after a paid boost)
  video_id    text,                              -- the YouTube video id once you have covered it
  ip          text,                              -- kept private, used only to slow down spam
  created_at  timestamptz not null default now(),
  covered_at  timestamptz
);
create unique index if not exists topics_title_unique on topics (lower(title));

create table if not exists topic_votes (
  topic_id   uuid not null references topics (id) on delete cascade,
  voter      text not null,
  ip         text,
  created_at timestamptz not null default now(),
  primary key (topic_id, voter)
);

alter table topics enable row level security;
alter table topic_votes enable row level security;

-- Visitors can read approved and covered topics (never the private columns), and suggest new ones as "pending".
revoke all on topics from anon, authenticated;
grant select (id, title, note, status, votes, boost, video_id, created_at, covered_at) on topics to anon;
grant insert (title, note) on topics to anon;
drop policy if exists "read listed topics" on topics;
create policy "read listed topics" on topics for select to anon using (status in ('approved', 'covered'));
drop policy if exists "suggest a topic" on topics;
create policy "suggest a topic" on topics for insert to anon with check (status = 'pending' and votes = 0 and boost = 0 and video_id is null);

create or replace function client_ip() returns text language sql stable as $$
  select coalesce(split_part(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1), '')
$$;

-- No more than 6 suggestions an hour from one place.
create or replace function topics_before_insert() returns trigger language plpgsql security definer set search_path = public as $$
declare c int;
begin
  new.ip := client_ip();
  new.title := btrim(regexp_replace(new.title, '\s+', ' ', 'g'));
  if new.ip <> '' then
    select count(*) into c from topics where ip = new.ip and created_at > now() - interval '1 hour';
    if c >= 6 then raise exception 'Too many suggestions. Try again later.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists topics_before_insert on topics;
create trigger topics_before_insert before insert on topics for each row execute function topics_before_insert();

-- One vote per browser per topic, and no more than 40 votes an hour from one place. Returns the new total.
create or replace function cast_vote(p_topic uuid, p_voter text) returns int language plpgsql security definer set search_path = public as $$
declare v_ip text := client_ip(); c int; n int; total int;
begin
  if p_voter is null or char_length(p_voter) < 16 or char_length(p_voter) > 64 then raise exception 'bad voter'; end if;
  if v_ip <> '' then
    select count(*) into c from topic_votes tv where tv.ip = v_ip and tv.created_at > now() - interval '1 hour';
    if c >= 40 then raise exception 'Slow down a little.'; end if;
  end if;
  insert into topic_votes (topic_id, voter, ip)
    select p_topic, p_voter, v_ip from topics t where t.id = p_topic and t.status = 'approved'
    on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then update topics set votes = votes + 1 where id = p_topic; end if;
  select t.votes + t.boost into total from topics t where t.id = p_topic;
  return total;
end $$;

create or replace function remove_vote(p_topic uuid, p_voter text) returns int language plpgsql security definer set search_path = public as $$
declare n int; total int;
begin
  delete from topic_votes where topic_id = p_topic and voter = p_voter;
  get diagnostics n = row_count;
  if n > 0 then update topics set votes = greatest(0, votes - 1) where id = p_topic; end if;
  select t.votes + t.boost into total from topics t where t.id = p_topic;
  return total;
end $$;

revoke all on function cast_vote(uuid, text), remove_vote(uuid, text) from public;
grant execute on function cast_vote(uuid, text), remove_vote(uuid, text) to anon;
