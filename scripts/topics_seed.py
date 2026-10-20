#!/usr/bin/env python3
"""Turn a plain list of topic ideas into SQL you paste into Supabase (SQL Editor > New query > Run).

    python3 scripts/topics_seed.py my-topics.txt  >  supabase/seed.sql

my-topics.txt: one idea per line. Optional note after a vertical bar:   Heath Ledger | What happened in his last months
Blank lines and lines starting with # are ignored. Near-duplicates inside the list are dropped (and reported on stderr).
Everything is added as an approved topic with 0 votes. Running it twice is safe: topics already in the table are skipped.
"""
import re, sys, difflib

def key(t):
    t = re.sub(r'^the\s+', '', t.lower().strip())
    return re.sub(r'[^a-z0-9]+', '', t)

def q(s):
    return "'" + s.replace("'", "''") + "'"

def main(path):
    seen, rows, dropped = [], [], []
    for line in open(path, encoding='utf-8'):
        line = line.strip().lstrip('•-*0123456789.) \t') if not line.strip().startswith('#') else ''
        if not line:
            continue
        title, _, note = line.partition('|')
        title = re.sub(r'\s+', ' ', title).strip(); note = note.strip()
        if not 3 <= len(title) <= 80:
            dropped.append((title, 'length 3-80')); continue
        k = key(title)
        dup = next((o for o in seen if o[0] == k or difflib.SequenceMatcher(None, o[0], k).ratio() >= 0.8), None)
        if dup:
            dropped.append((title, 'same as ' + dup[1])); continue
        seen.append((k, title)); rows.append((title, note[:280]))
    for t, why in dropped:
        print('skipped: %s (%s)' % (t, why), file=sys.stderr)
    print('-- %d topics, all approved with 0 votes. Safe to run more than once.' % len(rows))
    if rows:
        print('insert into topics (title, note, status) values')
        print(',\n'.join('  (%s, %s, \'approved\')' % (q(t), q(n) if n else 'null') for t, n in rows))
        print('on conflict (title_key) do nothing;')

if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
