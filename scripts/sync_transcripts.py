#!/usr/bin/env python3
"""Keep data/transcripts.json current from the channel's own YouTube captions.

Uses the official YouTube Data API with the channel owner's permission (a one-time OAuth setup, see
docs/TRANSCRIPTS-SETUP.md). Needs three environment variables (GitHub secrets):
  YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN

Each run: newest videos first, skip ones that already have a transcript, download up to MAX_PER_RUN captions
(the API's free daily quota is 10,000 units and one video costs about 250), and add them to data/transcripts.json.
Members-only / (PARENTAL ADVISORY) videos are used to fill the gaps in their censored public twin, but only as
hashed word lists (searchable, not readable): their script is never published as text.
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
MEMBERS_OUT = os.path.join(ROOT, "data", "transcripts-members.json")
RETRY_DAYS = 2   # a brand-new upload has no captions for a few hours; try again later


def call(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")


def access_token():
    body = urllib.parse.urlencode({
        "client_id": os.environ["YT_CLIENT_ID"], "client_secret": os.environ["YT_CLIENT_SECRET"],
        "refresh_token": os.environ["YT_REFRESH_TOKEN"], "grant_type": "refresh_token"}).encode()
    try:
        return json.loads(call("https://oauth2.googleapis.com/token", body))["access_token"]
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", "replace")[:300]
        print("Google refused the login (HTTP %d): %s" % (e.code, msg))
        print("Lengths seen: id=%d secret=%d token=%d (no values shown)" % tuple(len(os.environ.get(k, "")) for k in ("YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN")))
        print("Hints: invalid_client = Client ID/secret wrong or has a stray space; invalid_grant = refresh token expired or made with a different client.")
        sys.exit(0)


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


def norm(t):
    t = (t or "").lower().replace("\u2019", "'").replace("-", " ")
    t = re.sub(r"[^a-z0-9'/ ]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def stem(w):                      # the same rules as stem() in js/smart.js
    w = re.sub(r"'s$", "", w)
    if len(w) > 5 and w.endswith("ies"):
        return w[:-3] + "y"
    if len(w) > 5 and re.search(r"(ing|ers)$", w):
        return w[:-3]
    if len(w) > 4 and re.search(r"(es|ed)$", w):
        return w[:-2]
    if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
        return w[:-1]
    return w


def h32(w):                       # FNV-1a, base 36: the same as hash32() in js/smart.js
    h = 2166136261
    for ch in w.encode("utf-8"):
        h = ((h ^ ch) * 16777619) & 0xFFFFFFFF
    n, out = h, ""
    while True:
        out = "0123456789abcdefghijklmnopqrstuvwxyz"[n % 36] + out
        n //= 36
        if n == 0:
            return out


def bag(text):
    return " ".join(sorted({h32(stem(w)) for w in norm(text).split() if len(w) > 2}))


def strip_label(t):
    return norm(MEMBERS.sub(" ", t))


def twin_of(member, publics):
    key = strip_label(member["title"]); kw = key.split()
    best, bn = None, 0
    for p in publics:
        pk = strip_label(p["title"])
        if pk == key:
            return p
        pw = pk.split(); n = len([w for w in kw if len(w) > 3 and w in pw])
        if n > bn and n >= max(3, len(kw) * 0.6):
            best, bn = p, n
    return best


def merge_members(data, mdata, vids):
    """Add each members version's hashed words to the matching public chunks (same time window)."""
    publics = [v for v in vids if not MEMBERS.search(v.get("title", ""))]
    for m in [v for v in vids if MEMBERS.search(v.get("title", ""))]:
        bags = mdata.get(m["id"])
        tw = twin_of(m, publics)
        if not bags or not tw:
            continue
        chunks = data.get(tw["id"])
        if not chunks:
            data[tw["id"]] = [[t, "", b] for t, b in bags]       # no public captions yet: windows with no readable text
            continue
        for i, c in enumerate(chunks):
            lo = c[0]; hi = chunks[i + 1][0] if i + 1 < len(chunks) else 10 ** 9
            words = " ".join(b for t, b in bags if lo <= t < hi)
            c[:] = c[:2] + ([" ".join(sorted(set(words.split())))] if words else [])


def main():
    if not all(os.environ.get(k) for k in ("YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN")):
        print("YouTube access is not set up yet (see docs/TRANSCRIPTS-SETUP.md). Nothing to do.")
        return 0
    vids = json.load(open(VIDEOS, encoding="utf-8"))["videos"]
    try:
        mdata = json.load(open(MEMBERS_OUT, encoding="utf-8"))
    except (OSError, ValueError):
        mdata = {}
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
        ismem = bool(MEMBERS.search(v.get("title", "")))
        if vid in data or vid in mdata:
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
            ch = bt.chunk(bt.cues(srt, ".srt"))
            if ismem:
                mdata[vid] = [[c[0], bag(c[1])] for c in ch]          # hashed words only, never the text
            else:
                data[vid] = ch
            state[vid] = {"tried": today.isoformat(), "status": "ok", "kind": tr["snippet"].get("trackKind")}
            print("ok", vid, len(ch), "chunks,", tr["snippet"].get("trackKind"), "(members, hashed)" if ismem else "", "-", v["title"][:50])
            done += 1
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")[:300]
            print("HTTP", e.code, vid, body)
            if e.code in (401, 403) and ("quota" in body.lower() or "rateLimit" in body):
                print("Daily quota reached; continuing tomorrow."); break
            state[vid] = {"tried": today.isoformat(), "status": "err", "code": e.code}
    for k in list(data):                                  # rebuild the gap-filling bags from scratch each run
        for c in data[k]:
            del c[2:]
    data = {k: v for k, v in data.items() if v}
    merge_members(data, mdata, vids)
    json.dump(mdata, open(MEMBERS_OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump(state, open(STATE, "w", encoding="utf-8"), indent=1)
    print("transcripts:", len(data), "public,", len(mdata), "members (hashed)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
