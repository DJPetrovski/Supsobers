#!/usr/bin/env python3
"""Keep data/transcripts.json current from the channel's own YouTube captions.

Uses the official YouTube Data API with the channel owner's permission (a one-time OAuth setup, see
docs/TRANSCRIPTS-SETUP.md). Needs three environment variables (GitHub secrets):
  YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN

Each run: newest videos first, skip ones that already have a transcript, download up to MAX_PER_RUN captions
(the API's free daily quota is 10,000 units and one video costs about 250), and add them to data/transcripts.json.
Members-only / (PARENTAL ADVISORY) videos are never added: their words stay off the public search.
"""
import datetime
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_transcripts as bt  # noqa: E402  (reuses the caption parser and chunker)

ROOT = os.path.join(HERE, "..")
VIDEOS = os.path.join(ROOT, "data", "videos.json")
OUT = os.path.join(ROOT, "data", "transcripts.json")
STATE = os.path.join(ROOT, "data", "transcripts-state.json")
MEMBERS = re.compile(r"parental[\s-]*advisory|members?[\s-]*only", re.I)
MAX_PER_RUN = int(os.environ.get("MAX_PER_RUN", "35"))
RETRY_DAYS = 2   # a brand-new upload has no captions for a few hours; try again later


def call(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")


def access_token():
    body = urllib.parse.urlencode({
        "client_id": os.environ["YT_CLIENT_ID"], "client_secret": os.environ["YT_CLIENT_SECRET"],
        "refresh_token": os.environ["YT_REFRESH_TOKEN"], "grant_type": "refresh_token"}).encode()
    return json.loads(call("https://oauth2.googleapis.com/token", body))["access_token"]


def api(path, token, **q):
    return call("https://www.googleapis.com/youtube/v3/" + path + "?" + urllib.parse.urlencode(q),
                headers={"Authorization": "Bearer " + token})


def best_track(items):
    """Prefer a real (human-made or edited) English track over YouTube's automatic one."""
    def rank(it):
        sn = it.get("snippet", {})
        lang = (sn.get("language") or "").lower()
        return (0 if lang.startswith("en") else 1, 0 if sn.get("trackKind") == "standard" else 1, 1 if sn.get("isDraft") else 0)
    items = [i for i in items if i.get("snippet", {}).get("trackKind") != "forced"]
    return sorted(items, key=rank)[0] if items else None


def main():
    if not all(os.environ.get(k) for k in ("YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN")):
        print("YouTube access is not set up yet (see docs/TRANSCRIPTS-SETUP.md). Nothing to do.")
        return 0
    vids = [v for v in json.load(open(VIDEOS, encoding="utf-8"))["videos"] if not MEMBERS.search(v.get("title", ""))]
    try:
        data = json.load(open(OUT, encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    try:
        state = json.load(open(STATE, encoding="utf-8"))
    except (OSError, ValueError):
        state = {}
    today = datetime.date.today()
    token = access_token()
    done = 0
    for v in vids:                                   # videos.json is newest first
        if done >= MAX_PER_RUN:
            break
        vid = v["id"]
        if vid in data:
            continue
        st = state.get(vid)
        if st and st.get("status") == "none" and (today - datetime.date.fromisoformat(st["tried"])).days < RETRY_DAYS:
            continue
        try:
            items = json.loads(api("captions", token, part="snippet", videoId=vid)).get("items", [])
            tr = best_track(items)
            if not tr:
                state[vid] = {"tried": today.isoformat(), "status": "none"}
                print("no captions yet:", vid, v["title"][:50]); done += 0.2
                continue
            srt = api("captions/" + tr["id"], token, tfmt="srt")
            data[vid] = bt.chunk(bt.cues(srt, ".srt"))
            state[vid] = {"tried": today.isoformat(), "status": "ok", "kind": tr["snippet"].get("trackKind")}
            print("ok", vid, len(data[vid]), "chunks,", tr["snippet"].get("trackKind"), "-", v["title"][:50])
            done += 1
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")[:300]
            print("HTTP", e.code, vid, body)
            if e.code in (401, 403) and ("quota" in body.lower() or "rateLimit" in body):
                print("Daily quota reached; continuing tomorrow."); break
            state[vid] = {"tried": today.isoformat(), "status": "err", "code": e.code}
    json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump(state, open(STATE, "w", encoding="utf-8"), indent=1)
    print("transcripts:", len(data), "of", len(vids), "videos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
