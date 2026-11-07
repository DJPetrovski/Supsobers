#!/usr/bin/env python3
"""Friday newsletter, laid out like a 1950s newspaper in the site's colors and 3rd Man font.

BREAKING NEWS = the week's deep dive. OTHER NEWS = the other videos and Shorts. KEEP FALLING = older videos that go with the
deep dive (same storyline in data/threads.json, or the closest titles). The pictures (masthead, banners) are drawn by
scripts/make_newsletter_art.cjs and live in img/newsletter/.

It reads the public RSS feed, so it needs no login. Always writes data/digest-preview.html. If KIT_API_KEY is set it
creates the broadcast in Kit: a draft, or (DIGEST_SEND=true) scheduled for 7:00 pm Denver time. On scheduled runs it only
goes between 6 pm and midnight Denver on a Friday, and never twice in one day (data/digest-last.txt).
"""
import datetime
import time
import json
import os
import re
import urllib.request
import xml.etree.ElementTree as ET
from html import escape as e
from zoneinfo import ZoneInfo

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CHANNEL_ID = "UCSJ4pxGHNTVl5J1I22s7agA"
SITE = "https://supsobers.com"
ART = SITE + "/img/newsletter/"
NS = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}
TZ = ZoneInfo("America/Denver")
FIRST_ISSUE = datetime.date(2026, 11, 6)
INK, PAPER, RED, GREY = "#17100e", "#efe6d3", "#b3121e", "#6b5f55"
SERIF = "Georgia,'Times New Roman',Times,serif"
MEMBERS = re.compile(r"parental[\s-]*advisory|members?[\s-]*only", re.I)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "supsobers-digest"}), timeout=30)


def probe(url):
    """HTTP status without following redirects (0 on failure)."""
    try:
        return urllib.request.build_opener(NoRedirect).open(urllib.request.Request(url, headers={"User-Agent": "supsobers-digest"}), timeout=20).status
    except urllib.error.HTTPError as ex:
        return ex.code
    except Exception:
        return 0


def recent_entries(known):
    """(id, title, published) for the channel's recent videos. YouTube's feed throws a 500 now and then, so try it a few
    times; if it keeps failing, fall back to the site's own video list (data/videos.json, refreshed by its own workflow)."""
    last = None
    for wait in (0, 5, 15, 30):
        time.sleep(wait)
        try:
            root = ET.fromstring(fetch("https://www.youtube.com/feeds/videos.xml?channel_id=" + CHANNEL_ID).read())
            return [(en.find("yt:videoId", NS).text, (en.find("a:title", NS).text or "").strip(),
                     datetime.datetime.fromisoformat(en.find("a:published", NS).text.replace("Z", "+00:00"))) for en in root.findall("a:entry", NS)]
        except Exception as ex:
            last = ex
            print("YouTube feed failed (%s); retrying" % ex)
    print("YouTube feed is down; using data/videos.json instead (%s)" % last)
    out = []
    for v in known.values():
        try:
            out.append((v["id"], v["title"], datetime.datetime.fromisoformat(v["at"].replace("Z", "+00:00"))))
        except Exception:
            pass
    return out


def is_short(vid):
    return probe("https://www.youtube.com/shorts/" + vid) == 200


def thumb(vid):
    """The widest picture YouTube has for the video (16:9, no black bars)."""
    return "https://i.ytimg.com/vi/%s/%s.jpg" % (vid, "maxresdefault" if probe("https://i.ytimg.com/vi/%s/maxresdefault.jpg" % vid) == 200 else "mqdefault")


def runtime(sec):
    h, m = sec // 3600, round(sec % 3600 / 60)
    return ("%d hr %02d min" % (h, m)) if h else ("%d min" % m)


def load(name):
    try:
        return json.load(open(os.path.join(ROOT, "data", name), encoding="utf-8"))
    except Exception:
        return {}


def related(deep_id, deep_title, known, exclude, n=3):
    """Older videos that go with the deep dive: its storyline first, then the closest titles."""
    picks = []
    for t in load("threads.json").get("threads", []):
        if deep_id in t.get("videos", []):
            picks += [(v, t["name"]) for v in t["videos"] if v != deep_id]
    if len(picks) < n:
        words = {w for w in re.findall(r"[a-z0-9]{5,}", deep_title.lower())}
        scored = sorted(((len(words & set(re.findall(r"[a-z0-9]{5,}", v["title"].lower()))), v["id"]) for v in known.values() if v["id"] != deep_id), reverse=True)
        picks += [(i, "") for s, i in scored if s > 0]
    out, seen = [], set(exclude) | {deep_id}
    for vid, tag in picks:
        v = known.get(vid)
        if not v or vid in seen or MEMBERS.search(v["title"]) or v.get("seconds", 0) < 20 * 60:
            continue
        seen.add(vid)
        out.append((v, tag))
    out.sort(key=lambda p: p[0].get("published", ""), reverse=True)
    out = out[:n]
    if len(out) < n:      # no storyline match: fill with the most-watched older episodes
        for v in sorted(known.values(), key=lambda v: -v.get("views", 0)):
            if len(out) >= n:
                break
            if v["id"] not in seen and v["id"] not in {o[0]["id"] for o in out} and not MEMBERS.search(v["title"]) and v.get("seconds", 0) >= 30 * 60:
                out.append((v, "Fan favorite"))
    return out


def link(vid, short=False):
    return "https://www.youtube.com/%s%s" % ("shorts/" if short else "watch?v=", vid)


def render(day, deep, vids, shorts, tandem):
    issue = max(1, (day - FIRST_ISSUE).days // 7 + 1)
    dateline = day.strftime("%A, %B %-d, %Y")
    img = lambda n, w=600: '<img src="%s%s.png" width="%d" style="display:block;width:100%%;max-width:%dpx;height:auto;border:0" alt="">' % (ART, n, w, w)
    rule = '<tr><td style="padding:0 22px"><div style="border-top:3px double %s;height:0;line-height:0;font-size:0">&nbsp;</div></td></tr>' % INK
    rows = []
    rows.append('<tr><td>%s</td></tr>' % img("masthead"))
    rows.append('<tr><td style="background:%s;color:%s;font:bold 11px %s;letter-spacing:2px;text-transform:uppercase;text-align:center;padding:9px 12px;border-bottom:3px double %s">Vol. I &nbsp;·&nbsp; No. %d &nbsp;·&nbsp; %s &nbsp;·&nbsp; Free to all readers</td></tr>' % (PAPER, INK, SERIF, INK, issue, e(dateline)))
    if deep:
        d = deep[0]
        rows.append('<tr><td>%s</td></tr>' % img("breaking"))
        rows.append('<tr><td style="padding:20px 22px 6px"><a href="%s"><img src="%s" width="556" style="display:block;width:100%%;height:auto;border:3px solid %s" alt="%s"></a></td></tr>' % (link(d["id"]), thumb(d["id"]), INK, e(d["title"])))
        rows.append('<tr><td style="padding:10px 22px 0;font:bold 30px/1.1 %s;color:%s"><a href="%s" style="color:%s;text-decoration:none">%s</a></td></tr>' % (SERIF, INK, link(d["id"]), INK, e(d["title"])))
        sec = d.get("seconds", 0)
        rows.append('<tr><td style="padding:6px 22px 0;font:italic 13px %s;color:%s">By DJ, Sobering Stories%s</td></tr>' % (SERIF, GREY, (" &nbsp;·&nbsp; Running time %s" % runtime(sec)) if sec else ""))
        rows.append('<tr><td style="padding:14px 22px 20px"><a href="%s" style="display:inline-block;background:%s;color:#fff;font:bold 13px %s;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:12px 20px">Watch the full story &#9654;</a></td></tr>' % (link(d["id"]), RED, SERIF))
        rows.append(rule)
        for extra in deep[1:]:
            rows.append('<tr><td style="padding:14px 22px 0;font:bold 20px %s"><a href="%s" style="color:%s;text-decoration:none">%s</a></td></tr>' % (SERIF, link(extra["id"]), INK, e(extra["title"])))
    if vids or shorts:
        rows.append('<tr><td style="padding-top:20px">%s</td></tr>' % img("other"))
        for v in vids:
            rows.append('<tr><td style="padding:14px 22px 0"><table width="100%%" cellpadding="0" cellspacing="0" border="0"><tr><td width="150" valign="top"><a href="%s"><img src="https://i.ytimg.com/vi/%s/mqdefault.jpg" width="150" style="display:block;width:150px;height:auto;border:2px solid %s" alt=""></a></td><td valign="top" style="padding-left:14px;font:bold 17px/1.25 %s"><a href="%s" style="color:%s;text-decoration:none">%s</a></td></tr></table></td></tr>' % (link(v["id"]), v["id"], INK, SERIF, link(v["id"]), INK, e(v["title"])))
        if shorts:
            rows.append('<tr><td style="padding:18px 22px 0;font:bold 12px %s;letter-spacing:2px;text-transform:uppercase;color:%s">Shorts &amp; bulletins</td></tr>' % (SERIF, RED))
            for s in shorts:
                rows.append('<tr><td style="padding:6px 22px 0;font:15px/1.35 %s"><span style="color:%s">&#9632;</span>&nbsp; <a href="%s" style="color:%s">%s</a></td></tr>' % (SERIF, RED, link(s["id"], True), INK, e(re.sub(r"\s*(#\w+\s*)+$", "", s["title"]) or s["title"])))
        rows.append('<tr><td style="padding-top:20px">%s</td></tr>' % "")
        rows.append(rule)
    if tandem:
        rows.append('<tr><td style="padding-top:20px">%s</td></tr>' % img("fall"))
        rows.append('<tr><td style="padding:12px 22px 0;font:italic 14px/1.4 %s;color:%s">Watch these with this week\'s story. They are the same rabbit hole.</td></tr>' % (SERIF, GREY))
        for v, tag in tandem:
            rows.append('<tr><td style="padding:12px 22px 0"><table width="100%%" cellpadding="0" cellspacing="0" border="0"><tr><td width="150" valign="top"><a href="%s"><img src="https://i.ytimg.com/vi/%s/mqdefault.jpg" width="150" style="display:block;width:150px;height:auto;border:2px solid %s" alt=""></a></td><td valign="top" style="padding-left:14px;font:bold 17px/1.25 %s"><a href="%s" style="color:%s;text-decoration:none">%s</a>%s</td></tr></table></td></tr>' % (link(v["id"]), v["id"], INK, SERIF, link(v["id"]), INK, e(v["title"]), ('<div style="font:italic 12px %s;color:%s;padding-top:4px">%s</div>' % (SERIF, GREY, e(tag))) if tag else ""))
        rows.append('<tr><td style="padding-bottom:22px"></td></tr>')
    rows.append('<tr><td><a href="%s">%s</a></td></tr>' % (SITE, img("footer")))
    body = "".join(rows)
    return ('<table width="100%%" cellpadding="0" cellspacing="0" border="0" bgcolor="#060102" style="background:#060102"><tr><td align="center">'
            '<table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="%s" style="width:100%%;max-width:600px;background:%s;color:%s">%s</table>'
            '</td></tr></table>') % (PAPER, PAPER, INK, body)


def main():
    now = datetime.datetime.now(TZ)
    scheduled = os.environ.get("DIGEST_SEND") == "true"
    last_path = os.path.join(ROOT, "data", "digest-last.txt")
    if scheduled and os.environ.get("DIGEST_FORCE") != "true":
        if now.weekday() != 4 or not (18 <= now.hour <= 23):   # GitHub's scheduler can start a run hours late, so allow the whole Friday evening
            print("Not the Friday send window (6 pm to midnight Denver); nothing to do.")
            return 0
        if os.path.exists(last_path) and open(last_path).read().strip() == now.date().isoformat():
            print("Already sent today.")
            return 0
    since = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=7)
    known = {v["id"]: v for v in load("videos.json").get("videos", [])}
    deep, vids, shorts = [], [], []
    for vid, title, at in recent_entries(known):
        if at < since:
            continue
        if MEMBERS.search(title):
            continue
        item = {"id": vid, "title": title, "seconds": known.get(vid, {}).get("seconds", 0)}
        if is_short(vid):
            shorts.append(item)
        elif item["seconds"] >= 30 * 60:
            deep.append(item)
        else:
            vids.append(item)
    if not (deep or vids or shorts):
        print("Nothing new this week; no email.")
        return 0
    deep.sort(key=lambda d: -d["seconds"])          # the longest new episode is the lead story
    tandem = related(deep[0]["id"], deep[0]["title"], known, {x["id"] for x in deep + vids}) if deep else []
    subject = ("Breaking: " + deep[0]["title"]) if deep else "This week at Sobering Stories"
    html = render(now.date(), deep, vids, shorts, tandem)
    open(os.path.join(ROOT, "data", "digest-preview.html"), "w", encoding="utf-8").write("<!doctype html><meta charset=utf-8><title>%s</title><body style='margin:0;background:#060102'>%s" % (e(subject), html))
    print("Digest built:", subject, "|", len(deep), "deep,", len(vids), "videos,", len(shorts), "shorts,", len(tandem), "keep-falling")

    key = os.environ.get("KIT_API_KEY", "").strip()
    if not key:
        print("No KIT_API_KEY set; preview only.")
        return 0
    payload = {"subject": subject, "content": html, "public": False}
    if scheduled:
        at = now.replace(hour=19, minute=0, second=0, microsecond=0)
        if at < now + datetime.timedelta(minutes=2):
            at = now + datetime.timedelta(minutes=3)
        payload["send_at"] = at.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    req = urllib.request.Request("https://api.kit.com/v4/broadcasts", method="POST", data=json.dumps(payload).encode(),
                                 headers={"X-Kit-Api-Key": key, "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "supsobers-digest"})
    print("Kit:", urllib.request.urlopen(req, timeout=30).status, ("scheduled for " + payload["send_at"]) if scheduled else "draft")
    if scheduled:
        open(last_path, "w").write(now.date().isoformat())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
