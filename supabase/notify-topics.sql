-- Phone alert when someone suggests a topic.
-- 1) On your phone, install the free "ntfy" app (App Store / Google Play) and subscribe to a topic name only you know,
--    e.g. sobering-topics-k8x2q9 (make up your own; anyone who knows the name can read the alerts).
-- 2) Replace YOUR-SECRET-TOPIC-NAME below with that exact name.
-- 3) Paste this whole file into Supabase > SQL Editor > New query > Run. Safe to run twice.
create extension if not exists pg_net with schema extensions;

create or replace function notify_new_topic() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.status = 'pending' then
    begin
      perform net.http_post(
        url := 'https://ntfy.sh/',
        body := jsonb_build_object(
          'topic', 'YOUR-SECRET-TOPIC-NAME',
          'title', 'New topic idea',
          'message', new.title || coalesce(E'\n' || new.note, ''),
          'tags', jsonb_build_array('bulb'),
          'click', 'https://supabase.com/dashboard/project/_/editor'
        ),
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
    exception when others then null;   -- an alert problem must never block a visitor's suggestion
    end;
  end if;
  return new;
end $$;

drop trigger if exists topics_notify on topics;
create trigger topics_notify after insert on topics for each row execute function notify_new_topic();
