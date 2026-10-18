#!/usr/bin/env python3
"""Refresh data/videos.json from the Sobering Stories YouTube channel.

With a YOUTUBE_API_KEY environment variable it pulls the full upload history.
Without one it reads the public RSS feed (the latest ~15 videos) and merges
them into whatever is already in videos.json, so the catalog never shrinks.
"""
import datetime
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

CHANNEL_ID = "UCSJ4pxGHNTVl5J1I22s7agA"
MEMBERS = re.compile(r"parental[\s-]*advisory|members?[\s-]*only", re.I)   # members versions are kept whatever their length
MIN_SECONDS = 30 * 60   # only full episodes: anything shorter is a clip and stays off the site
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "videos.json")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "supsobers-site-sync"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def from_rss():
    xml = get("https://www.youtube.com/feeds/videos.xml?channel_id=" + CHANNEL_ID)
    ns = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}
    out = []
    for e in ET.fromstring(xml).findall("a:entry", ns):
        out.append({
            "id": e.find("yt:videoId", ns).text,
            "title": e.find("a:title", ns).text,
            "published": e.find("a:published", ns).text[:10],
        })
    return out


def seconds(text):
    """'44:26' -> 2666, '1:02:03' -> 3723"""
    total = 0
    for part in text.split(":"):
        total = total * 60 + int(part)
    return total


def iso_seconds(iso):
    """YouTube API duration 'PT1H2M3S' -> seconds"""
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$", iso or "")
    h, mi, se = (int(x or 0) for x in m.groups()) if m else (0, 0, 0)
    return h * 3600 + mi * 60 + se


def view_count(text):
    """'1.2K views' / '742 views' / '1,234 views' / '3.4M views' -> int (0 when the page does not say)"""
    m = re.search(r'([\d][\d.,]*)\s*([KMB]?)\s*views?', text or "", re.I)
    if not m:
        return 0
    n = float(m.group(1).replace(",", ""))
    return int(n * {"": 1, "K": 1e3, "M": 1e6, "B": 1e9}[m.group(2).upper()])


def from_playlist():
    """The channel's whole uploads playlist, newest first (the channel page only shows the latest ~30).
    Reads the public playlist page, then follows its 'continuation' pages the way the website does."""
    pl = "UU" + CHANNEL_ID[2:]
    req = urllib.request.Request("https://www.youtube.com/playlist?list=" + pl,
                                 headers={"User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9"})
    with urllib.request.urlopen(req, timeout=30) as r:
        html = r.read().decode("utf-8", "replace")
    marker = "ytInitialData = "
    data, _ = json.JSONDecoder().raw_decode(html[html.index(marker) + len(marker):])
    key = re.search(r'"INNERTUBE_API_KEY":"([^"]+)"', html).group(1)
    ver = re.search(r'"clientVersion":"([^"]+)"', html).group(1)
    found, seen, tokens = [], set(), []

    def walk(o):
        if isinstance(o, dict):
            lv = o.get("lockupViewModel")
            if isinstance(lv, dict) and lv.get("contentType") == "LOCKUP_CONTENT_TYPE_VIDEO" and lv.get("contentId") not in seen:
                try:
                    texts = re.findall(r'"(\d{1,2}:\d{2}(?::\d{2})?)"', json.dumps(lv))
                    seen.add(lv["contentId"])
                    found.append((lv["contentId"], lv["metadata"]["lockupMetadataViewModel"]["title"]["content"],
                                  seconds(texts[0]) if texts else 0, view_count(json.dumps(lv))))
                except KeyError:
                    pass
            cc = o.get("continuationCommand")
            if isinstance(cc, dict) and cc.get("token"):
                tokens.append(cc["token"])
            for x in o.values():
                walk(x)
        elif isinstance(o, list):
            for x in o:
                walk(x)

    walk(data)
    for _ in range(25):                      # 100 videos per page; stop when there are no more pages
        if not tokens:
            break
        body = json.dumps({"context": {"client": {"clientName": "WEB", "clientVersion": ver, "hl": "en"}},
                           "continuation": tokens.pop()}).encode()
        rq = urllib.request.Request("https://www.youtube.com/youtubei/v1/browse?key=" + key, data=body,
                                    headers={"User-Agent": "Mozilla/5.0", "Content-Type": "application/json"})
        tokens = []
        with urllib.request.urlopen(rq, timeout=30) as r:
            walk(json.loads(r.read().decode("utf-8", "replace")))
    return found


def from_page():
    """Fallback when the RSS feed is unavailable (YouTube sometimes returns 404 to it).
    Reads the public channel Videos page, newest first. Dates are approximate (newest = today)."""
    req = urllib.request.Request(
        "https://www.youtube.com/channel/" + CHANNEL_ID + "/videos",
        headers={"User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9"})
    with urllib.request.urlopen(req, timeout=30) as r:
        html = r.read().decode("utf-8", "replace")
    marker = "ytInitialData = "
    data, _ = json.JSONDecoder().raw_decode(html[html.index(marker) + len(marker):])
    found = []

    def walk(o):
        if isinstance(o, dict):
            lv = o.get("lockupViewModel")
            if isinstance(lv, dict) and lv.get("contentType") == "LOCKUP_CONTENT_TYPE_VIDEO":
                try:
                    texts = re.findall(r'"(\d{1,2}:\d{2}(?::\d{2})?)"', json.dumps(lv))
                    found.append((lv["contentId"], lv["metadata"]["lockupMetadataViewModel"]["title"]["content"],
                                  seconds(texts[0]) if texts else 0))
                except KeyError:
                    pass
            for x in o.values():
                walk(x)
        elif isinstance(o, list):
            for x in o:
                walk(x)

    walk(data)
    today = datetime.date.today()
    return [{"id": i, "title": t, "published": (today - datetime.timedelta(days=n)).isoformat(), "seconds": d}
            for n, (i, t, d) in enumerate(found)]


def from_api(key):
    uploads = "UU" + CHANNEL_ID[2:]
    out, token = [], ""
    while True:
        q = {"part": "snippet,contentDetails", "maxResults": 50, "playlistId": uploads, "key": key}
        if token:
            q["pageToken"] = token
        data = json.loads(get("https://www.googleapis.com/youtube/v3/playlistItems?" + urllib.parse.urlencode(q)))
        for it in data.get("items", []):
            title = it["snippet"]["title"]
            if title in ("Private video", "Deleted video"):
                continue
            out.append({
                "id": it["contentDetails"]["videoId"],
                "title": title,
                "published": (it["contentDetails"].get("videoPublishedAt") or it["snippet"]["publishedAt"])[:10],
            })
        token = data.get("nextPageToken", "")
        if not token:
            break
    for n in range(0, len(out), 50):
        chunk = out[n:n + 50]
        q = {"part": "contentDetails", "id": ",".join(v["id"] for v in chunk), "key": key}
        info = json.loads(get("https://www.googleapis.com/youtube/v3/videos?" + urllib.parse.urlencode(q)))
        secs = {i["id"]: iso_seconds(i["contentDetails"].get("duration")) for i in info.get("items", [])}
        for v in chunk:
            v["seconds"] = secs.get(v["id"], 0)
    return out


def current_titles(videos):
    """Titles change after upload (renames, labels like PARENTAL ADVISORY). The channel page only lists the newest
    videos, so ask YouTube's public oEmbed endpoint for each video's present title. Failures keep the old title."""
    import concurrent.futures as cf

    def one(v):
        try:
            u = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote("https://www.youtube.com/watch?v=" + v["id"])
            return v, json.loads(get(u)).get("title")
        except Exception:
            return v, None
    with cf.ThreadPoolExecutor(6) as ex:
        for v, t in ex.map(one, videos):
            if t and t.strip() and t.strip() != v["title"]:
                print("renamed:", v["id"], "->", t.strip())
                v["title"] = t.strip()


FEATURED = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "featured.json")


def denver_day(v):
    """The weekday (0=Mon) the video went up, Mountain time. Friday runs from Friday 00:00 to Saturday 06:00,
    so a late-night Friday upload that the sync sees after midnight still counts as Friday."""
    from zoneinfo import ZoneInfo
    if v.get("seen"):
        t = datetime.datetime.strptime(v["seen"], "%Y-%m-%dT%H:%MZ").replace(tzinfo=datetime.timezone.utc)
        t = t.astimezone(ZoneInfo("America/Denver")) - datetime.timedelta(hours=6)
        return t.weekday()
    return datetime.date.fromisoformat(v["published"]).weekday()


def pick_featured(videos):
    """The featured deep dive: the newest full-length video that went up on a Friday, unless DJ pinned one."""
    try:
        cur = json.load(open(FEATURED, encoding="utf-8"))
    except (OSError, ValueError):
        cur = {}
    pin = (cur.get("pin") or "").strip()
    byid = {v["id"]: v for v in videos}
    if pin and pin in byid:
        chosen, why = byid[pin], "pinned by DJ"
    else:
        chosen, why = None, "newest Friday deep dive"
        for v in videos:
            if not MEMBERS.search(v.get("title", "")) and v.get("seconds", 0) >= 30 * 60 and denver_day(v) == 4:
                chosen = v; break
        if not chosen and cur.get("id") in byid:
            chosen = byid[cur["id"]]
    if not chosen:
        return
    doc = {"note": "The video featured first on the home page and on the TV's first channel. Normally it is picked by itself: the newest video of 30+ minutes that went up on a Friday. To feature a different one, put its YouTube id in 'pin' (or ask Claude); clear 'pin' to go back to automatic.",
           "pin": pin, "id": chosen["id"], "title": chosen["title"], "why": why}
    if doc != {k: cur.get(k) for k in doc}:
        json.dump(doc, open(FEATURED, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
        print("featured:", chosen["title"], "-", why)


def main():
    key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    # The channel page and the API both report lengths; the RSS feed does not, so it is not used.
    if key:
        fresh = from_api(key)
    else:
        try:
            found = from_playlist()
            if len(found) < 20:
                raise ValueError("playlist came back short")
            today = datetime.date.today()
            fresh = [{"id": i, "title": t, "published": today.isoformat(), "seconds": d, "views": w} for i, t, d, w in found]
        except Exception as ex:
            print("playlist read failed (%s); using the channel page" % ex)
            fresh = from_page()
    fresh = [v for v in fresh if v.get("seconds", 0) >= MIN_SECONDS or MEMBERS.search(v.get("title", ""))]
    if not fresh:
        print("No videos returned; leaving videos.json untouched.")
        return 0

    try:
        with open(OUT, encoding="utf-8") as f:
            old = json.load(f).get("videos", [])
    except (OSError, ValueError):
        old = []

    merged = {v["id"]: v for v in old if v.get("id") and not v.get("sample") and (v.get("seconds", 0) >= MIN_SECONDS or MEMBERS.search(v.get("title", "")))}
    rank = {v["id"]: n for n, v in enumerate(fresh)}   # channel page order: newest first
    today = datetime.date.today().isoformat()
    last_known = None
    for v in fresh:
        if v["id"] in merged:
            # already known: keep its recorded date (the page only gives guessed dates), refresh title/length
            v["published"] = min(merged[v["id"]]["published"], v["published"]) if key else merged[v["id"]]["published"]
        elif not key:
            v["published"] = last_known or today        # first time seen: the date of the next newer video we know
            v["seen"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
        if v["id"] in merged and not key:
            last_known = v["published"]
        if not v.get("views") and merged.get(v["id"], {}).get("views"):
            v["views"] = merged[v["id"]]["views"]          # the page did not say this time: keep the last known count
        merged[v["id"]] = v
    # newest date first; on the same day, the channel page order decides
    videos = sorted(merged.values(), key=lambda v: (v["published"], -rank.get(v["id"], 10**6)), reverse=True)
    videos.sort(key=lambda v: v["published"], reverse=True)
    current_titles(videos)
    pick_featured(videos)

    new_doc = {"videos": videos}
    try:
        with open(OUT, encoding="utf-8") as f:
            cur = json.load(f)
        old_views = {v["id"]: v.get("views", 0) for v in cur.get("videos", [])}
        if cur.get("viewsAt") == today:                        # counts were already refreshed today: keep them
            for v in videos:
                if v["id"] in old_views:
                    v["views"] = old_views[v["id"]]
        new_doc["viewsAt"] = today if any(v.get("views") for v in videos) else cur.get("viewsAt", "")
        if cur.get("viewsAt") == today:
            new_doc["viewsAt"] = today
        if cur == new_doc:
            print("Already up to date (%d videos)." % len(videos))
            return 0
    except (OSError, ValueError):
        pass

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(new_doc, f, indent=2, ensure_ascii=False)
    print("Wrote %d videos." % len(videos))
    return 0


if __name__ == "__main__":
    sys.exit(main())
