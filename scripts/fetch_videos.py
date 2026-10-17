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


def main():
    key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    # The channel page and the API both report lengths; the RSS feed does not, so it is not used.
    fresh = from_api(key) if key else from_page()
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
    for v in fresh:
        if v["id"] in merged:
            # already known: keep its recorded date (the page only gives guessed dates), refresh title/length
            v["published"] = min(merged[v["id"]]["published"], v["published"]) if key else merged[v["id"]]["published"]
        elif not key:
            v["published"] = today                      # first time seen = new today
        merged[v["id"]] = v
    # newest date first; on the same day, the channel page order decides
    videos = sorted(merged.values(), key=lambda v: (v["published"], -rank.get(v["id"], 10**6)), reverse=True)
    videos.sort(key=lambda v: v["published"], reverse=True)
    current_titles(videos)

    new_doc = {"videos": videos}
    try:
        with open(OUT, encoding="utf-8") as f:
            cur = json.load(f)
        if {"videos": cur.get("videos", [])} == new_doc:
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
