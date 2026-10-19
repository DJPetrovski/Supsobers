#!/usr/bin/env python3
"""Work out which videos were live streams and write data/live.json.

Best source: YouTube itself. With the channel owner's login (the same YT_CLIENT_ID / YT_CLIENT_SECRET /
YT_REFRESH_TOKEN secrets the transcript sync uses) it asks for the channel's completed live broadcasts, which is
exact (a premiere is not a live broadcast). If that is refused it falls back to the 'liveStreamingDetails' field on
each video, which marks streams and premieres. With no login at all it guesses from titles, only for videos it has
not classified before, so nothing already decided is ever overwritten by a guess.

data/live.json keeps two hand lists that are never touched here:
  "force": ids that are always live streams     "never": ids that are never live streams
"""
import datetime
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
VIDEOS = os.path.join(ROOT, "data", "videos.json")
OUT = os.path.join(ROOT, "data", "live.json")
GUESS = re.compile(r"\blive\b|\bupdates?\b|\bdiddy trial\b|\bday \d+\s*[-–:]|recovery group|sober sobers|open discussion|memorial day edition", re.I)


def call(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def token():
    keys = ("YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN")
    if not all(os.environ.get(k) for k in keys):
        return None
    body = urllib.parse.urlencode({"client_id": os.environ[keys[0]], "client_secret": os.environ[keys[1]],
                                   "refresh_token": os.environ[keys[2]], "grant_type": "refresh_token"}).encode()
    try:
        return call("https://oauth2.googleapis.com/token", body)["access_token"]
    except Exception as e:  # noqa: BLE001
        print("login failed (%s); using title guesses" % e)
        return None


def api(path, tok, **q):
    return call("https://www.googleapis.com/youtube/v3/" + path + "?" + urllib.parse.urlencode(q), headers={"Authorization": "Bearer " + tok})


def broadcasts(tok):
    ids, page = set(), ""
    while True:
        q = {"part": "id", "mine": "true", "broadcastStatus": "completed", "maxResults": 50}
        if page:
            q["pageToken"] = page
        d = api("liveBroadcasts", tok, **q)
        ids.update(i["id"] for i in d.get("items", []))
        page = d.get("nextPageToken", "")
        if not page:
            return ids


def details(tok, vids):
    ids = set()
    for n in range(0, len(vids), 50):
        d = api("videos", tok, part="liveStreamingDetails", id=",".join(v["id"] for v in vids[n:n + 50]))
        for it in d.get("items", []):
            if (it.get("liveStreamingDetails") or {}).get("actualStartTime"):
                ids.add(it["id"])
    return ids


def main():
    vids = json.load(open(VIDEOS, encoding="utf-8")).get("videos", [])
    try:
        cur = json.load(open(OUT, encoding="utf-8"))
    except (OSError, ValueError):
        cur = {}
    ids, checked, source = set(cur.get("ids", [])), set(cur.get("checked", [])), cur.get("source", "titles")
    tok = token()
    done = False
    if tok:
        for name, fn in (("youtube broadcasts", lambda: broadcasts(tok)), ("youtube video details", lambda: details(tok, vids))):
            try:
                found = fn()
            except Exception as e:  # noqa: BLE001
                print("%s unavailable: %s" % (name, str(e)[:160]))
                continue
            ids, source, done = found & {v["id"] for v in vids}, name, True
            checked = {v["id"] for v in vids}
            print("%s: %d live streams out of %d videos" % (name, len(ids), len(vids)))
            break
    if not done:
        for v in vids:
            if v["id"] not in checked:
                checked.add(v["id"])
                if GUESS.search(v.get("title", "")):
                    ids.add(v["id"])
        print("title guesses: %d flagged" % len(ids))
    doc = dict(cur)
    doc.update({"updated": datetime.date.today().isoformat(), "source": source, "ids": sorted(ids), "checked": sorted(checked)})
    doc.setdefault("force", []); doc.setdefault("never", [])
    if json.dumps(doc, sort_keys=True) != json.dumps(cur, sort_keys=True):
        json.dump(doc, open(OUT, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        print("wrote data/live.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
