-- Adds the topic "Natacha Jaitt" (approved, 0 votes). Paste into Supabase > SQL Editor > New query > Run. Safe to run twice.
insert into topics (title, note, status) values
  ('Natacha Jaitt', 'Argentine TV personality found dead in Feb 2019 at a party venue in Tigre, after alleging that prominent sports and entertainment figures were tied to a child-prostitution ring. Her family says she was killed.', 'approved')
on conflict (title_key) do nothing;
