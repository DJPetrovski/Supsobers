#!/usr/bin/env python3
"""Friday newsletter: one short email with the week's new deep dive, videos and shorts, all linked.

Reads the channel's public RSS feed (it includes Shorts), keeps what was posted in the last 7 days, and builds a
minimal email. Always writes data/digest-preview.md so you can see what would go out.
If KIT_API_KEY is set it also creates the email in Kit as a broadcast: a draft by default, or scheduled to go out
in a couple of minutes when DIGEST_SEND=true. It only runs on Fridays (Denver time) unless DIGEST_FORCE=true, and never sends an empty email.
"""
import datetime
import json
import os
import urllib.request
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CHANNEL_ID = "UCSJ4pxGHNTVl5J1I22s7agA"
SITE = "https://supsobers.com"
NS = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}


def fetch(url, method="GET"):
    req = urllib.request.Request(url, method=method, headers={"User-Agent": "supsobers-digest"})
    return urllib.request.urlopen(req, timeout=30)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def is_short(vid):
    """youtube.com/shorts/ID answers 200 for a Short and redirects (303) for a normal video."""
    try:
        op = urllib.request.build_opener(NoRedirect)
        r = op.open(urllib.request.Request("https://www.youtube.com/shorts/" + vid, headers={"User-Agent": "supsobers-digest"}), timeout=20)
        return r.status == 200
    except Exception:
        return False


def to_html(deep, vids, shorts, link):
    from html import escape as e
    a = lambda i, s=False: '<a href="%s">%s</a>' % (link(i, s), e(i["title"]))
    h = []
    if deep:
        h.append("<h2>This week's deep dive</h2>" + "".join("<p><strong>%s</strong></p>" % a(d) for d in deep))
    if vids:
        h.append("<h3>Also this week</h3><ul>" + "".join("<li>%s</li>" % a(v) for v in vids) + "</ul>")
    if shorts:
        h.append("<h3>Shorts</h3><ul>" + "".join("<li>%s</li>" % a(x, True) for x in shorts) + "</ul>")
    h.append('<p>Search every episode, transcript and connection: <a href="%s">supsobers.com</a></p>' % SITE)
    return "".join(h)


def main():
    now = datetime.datetime.now(ZoneInfo("America/Denver"))
    if now.weekday() != 4 and os.environ.get("DIGEST_FORCE") != "true":
        print("Not Friday in Denver; nothing to do.")
        return 0
    root = ET.fromstring(fetch("https://www.youtube.com/feeds/videos.xml?channel_id=" + CHANNEL_ID).read())
    since = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=7)
    try:
        known = {v["id"]: v for v in json.load(open(os.path.join(ROOT, "data", "videos.json"), encoding="utf-8")).get("videos", [])}
    except Exception:
        known = {}
    deep, vids, shorts = [], [], []
    for e in root.findall("a:entry", NS):
        at = datetime.datetime.fromisoformat(e.find("a:published", NS).text.replace("Z", "+00:00"))
        if at < since:
            continue
        vid, title = e.find("yt:videoId", NS).text, (e.find("a:title", NS).text or "").strip()
        item = {"id": vid, "title": title, "at": at.isoformat()}
        if "parental advisory" in title.lower() or "members only" in title.lower():
            continue                                   # members cuts are not advertised in the public email
        if is_short(vid):
            shorts.append(item)
        elif known.get(vid, {}).get("seconds", 0) >= 30 * 60:
            deep.append(item)
        else:
            vids.append(item)
    if not (deep or vids or shorts):
        print("Nothing new this week; no email.")
        return 0
    link = lambda i, s=False: "https://www.youtube.com/%s%s" % ("shorts/" if s else "watch?v=", i["id"])
    md = []
    if deep:
        md.append("## This week's deep dive\n")
        md += ["**[%s](%s)**\n" % (d["title"], link(d)) for d in deep]
    if vids:
        md.append("## Also this week\n")
        md += ["- [%s](%s)" % (v["title"], link(v)) for v in vids]
        md.append("")
    if shorts:
        md.append("## Shorts\n")
        md += ["- [%s](%s)" % (s["title"], link(s, True)) for s in shorts]
        md.append("")
    md.append("Search every episode, transcript and connection: %s\n" % SITE)
    body = "\n".join(md)
    lead = (deep or vids or shorts)[0]["title"]
    subject = "Sobering Stories: " + (lead if deep else "this week's videos")
    open(os.path.join(ROOT, "data", "digest-preview.md"), "w", encoding="utf-8").write("Subject: %s\n\n%s" % (subject, body))
    print("Digest built:", subject, "|", len(deep), "deep,", len(vids), "videos,", len(shorts), "shorts")

    key = os.environ.get("KIT_API_KEY", "").strip()
    if not key:
        print("No KIT_API_KEY set; preview only.")
        return 0
    html = to_html(deep, vids, shorts, link)
    payload = {"subject": subject, "content": html, "public": False}
    if os.environ.get("DIGEST_SEND") == "true":
        payload["send_at"] = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=3)).strftime("%Y-%m-%dT%H:%M:%SZ")
    req = urllib.request.Request("https://api.kit.com/v4/broadcasts", method="POST", data=json.dumps(payload).encode(),
                                 headers={"X-Kit-Api-Key": key, "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "supsobers-digest"})
    print("Kit:", urllib.request.urlopen(req, timeout=30).status, "scheduled" if "send_at" in payload else "draft")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
