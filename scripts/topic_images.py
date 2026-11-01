#!/usr/bin/env python3
"""Fill data/topic-images.json with a photo for each topic (Wikipedia's lead image for the best-matching page).
A match is only kept when the page title shares a meaningful word with the topic, so a wrong person never gets a face.
Review the report it prints; to override one, edit data/topic-images.json by hand (hand edits are kept)."""
import json, re, sys, time, urllib.parse, urllib.request, unicodedata, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "data", "topic-images.json")
STOP = {"the", "of", "and", "a", "in", "to", "for", "family", "case", "conspiracy", "death", "story", "murder", "mystery", "disappearance", "code", "words"}

def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()
def tkey(s): return re.sub(r"^the ", "", norm(s)).replace(" ", "")
def clean(t):
    t = re.sub(r"^(the\s+)?(death|story|case|murder|mystery|disappearance)\s+of\s+", "", t, flags=re.I)
    return re.sub(r"\s+(case|story|murder|death|mystery)$", "", t, flags=re.I).strip()
def get(url):
    for _ in range(3):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "supsobers-topic-images/1.0 (supsobers.com)"}), timeout=25))
        except Exception:
            time.sleep(3)
    return None
ALIAS = {
    "port arthur massacre": "Port Arthur massacre (Australia)", "amy bradley": "Disappearance of Amy Bradley",
    "sherman murder mystery": "Murder of Barry and Honey Sherman", "johnny lewis": "Johnny Lewis (actor)", "orlando brown": "Orlando Brown (actor)",
    "columbine school shooting": "Columbine High School massacre", "aurora theater shooting": "2012 Aurora theater shooting",
    "smiley face killers": "Smiley face murder theory", "paul mccartney is dead theory": "Paul is dead",
    "chris benoit and the benoit family": "Chris Benoit", "lisa \"left eye\" lopes": "Lisa Lopes", "vic morrow and the twilight zone kids": "Vic Morrow",
    "amityville": "Amityville Horror", "the notorious b.i.g.": "The Notorious B.I.G.", "polio conspiracy": "", "killdozer": "", "david crowley": "",
    "duke of kent": "", "bush family": "Bush family", "clinton family": "Clinton family",
}
API = "https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages|pageprops&ppprop=disambiguation&piprop=thumbnail&pithumbsize=420&"
def direct(name):
    d = get(API + "titles=" + urllib.parse.quote(name))
    for p in ((d or {}).get("query", {}).get("pages", {})).values():
        if "missing" in p or "disambiguation" in (p.get("pageprops") or {}): return None, None
        if p.get("thumbnail"): return p["thumbnail"]["source"], p["title"]
    return None, None
def find(title):
    q = clean(title); al = ALIAS.get(norm(title))
    if al == "": return None, None
    u, pg = direct(al or q)
    if u or al: return u, pg
    d = get(API + "generator=search&gsrlimit=5&gsrsearch=" + urllib.parse.quote(q))
    pages = sorted(((d or {}).get("query", {}).get("pages", {})).values(), key=lambda p: p.get("index", 99))
    want = norm(q)
    for p in pages:   # a search hit counts only when its title (without brackets) is the same name
        if p.get("thumbnail") and "disambiguation" not in (p.get("pageprops") or {}) and norm(re.sub(r"\s*\(.*?\)", "", p.get("title", ""))) == want:
            return p["thumbnail"]["source"], p["title"]
    return None, None
def main():
    titles = re.findall(r"^\s*\('((?:[^']|'')*)'", open(os.path.join(ROOT, "supabase", "seed.sql"), encoding="utf-8").read(), re.M)
    titles = [t.replace("''", "'") for t in titles]
    try: cur = json.load(open(OUT, encoding="utf-8"))
    except Exception: cur = {}
    hit = miss = 0; report = []
    for t in titles:
        k = tkey(t)
        if cur.get(k): continue
        u, pg = find(t)
        if u: cur[k] = u; hit += 1; report.append("OK   %-42s -> %s" % (t, pg))
        else: miss += 1; report.append("none %s" % t)
        time.sleep(0.4)
    json.dump(cur, open(OUT, "w", encoding="utf-8"), indent=1, ensure_ascii=False, sort_keys=True)
    print("\n".join(report)); print("\nadded %d, no confident match %d, total in file %d" % (hit, miss, len(cur)))
main()
