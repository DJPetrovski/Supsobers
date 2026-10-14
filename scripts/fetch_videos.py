#!/usr/bin/env python3
"""Refresh data/videos.json from the Sobering Stories YouTube channel.

With a YOUTUBE_API_KEY environment variable it pulls the full upload history.
Without one it reads the public RSS feed (the latest ~15 videos) and merges
them into whatever is already in videos.json, so the catalog never shrinks.
"""
import datetime
import json
import os
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

CHANNEL_ID = "UCSJ4pxGHNTVl5J1I22s7agA"
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
                    found.append((lv["contentId"], lv["metadata"]["lockupMetadataViewModel"]["title"]["content"]))
                except KeyError:
                    pass
            for x in o.values():
                walk(x)
        elif isinstance(o, list):
            for x in o:
                walk(x)

    walk(data)
    today = datetime.date.today()
    return [{"id": i, "title": t, "published": (today - datetime.timedelta(days=n)).isoformat()}
            for n, (i, t) in enumerate(found)]


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
            return out


def main():
    key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    if key:
        fresh = from_api(key)
    else:
        try:
            fresh = from_rss()
        except Exception as e:
            print("RSS feed failed (%s); reading the channel page instead." % e)
            fresh = from_page()
    if not fresh:
        print("No videos returned; leaving videos.json untouched.")
        return 0

    try:
        with open(OUT, encoding="utf-8") as f:
            old = json.load(f).get("videos", [])
    except (OSError, ValueError):
        old = []

    merged = {v["id"]: v for v in old if v.get("id") and not v.get("sample")}
    for v in fresh:
        merged[v["id"]] = v
    videos = sorted(merged.values(), key=lambda v: v["published"], reverse=True)

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
