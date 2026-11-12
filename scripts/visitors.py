#!/usr/bin/env python3
"""Save the public visitor counts (all time and today) to data/visitors.json.
The site reads the live numbers straight from GoatCounter, but ad blockers often block that address,
so this file is the backup the page falls back on. Run by the Update videos workflow every couple of hours."""
import json, os, re, sys, urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

BASE = "https://supsobers.goatcounter.com/counter/TOTAL.json"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "visitors.json")

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "supsobers-site/1.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        d = json.load(r)
    return int(re.sub(r"\D", "", str(d.get("count_unique") or d.get("count") or "0")) or 0)

def main():
    day = datetime.now(ZoneInfo("America/Denver")).strftime("%Y-%m-%d")
    try:
        total, today = get(BASE), get(BASE + "?start=" + day)
    except Exception as e:  # never fail the workflow over a counter
        print("visitor counts not updated:", e); return 0
    if not total:
        print("no count yet"); return 0
    new = {"total": total, "today": today, "day": day}
    try:
        old = json.load(open(OUT, encoding="utf-8"))
    except Exception:
        old = {}
    if {k: old.get(k) for k in new} == new:
        print("no change"); return 0
    try:  # at most one save every 100 minutes on the same day, so busy Fridays do not flood the history
        age = (datetime.now(ZoneInfo("UTC")) - datetime.strptime(old["updated"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=ZoneInfo("UTC"))).total_seconds()
        if old.get("day") == day and age < 6000:
            print("saved recently"); return 0
    except Exception:
        pass
    new["updated"] = datetime.now(ZoneInfo("UTC")).strftime("%Y-%m-%dT%H:%M:%SZ")
    json.dump(new, open(OUT, "w", encoding="utf-8"), indent=1)
    print("saved", new); return 0

if __name__ == "__main__":
    sys.exit(main())
