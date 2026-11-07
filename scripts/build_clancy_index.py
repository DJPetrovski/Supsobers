#!/usr/bin/env python3
"""Builds the Lindsay Clancy archive's search text: data/clancy-text.json.
Sources: video captions (clancy-src/captions/t_<id>.en.vtt) and document text (clancy-src/docs/*.txt, per-page).
Chunks are about 60 seconds of speech or one document page. Run scripts/build_clancy_embeddings.mjs afterwards."""
import json, os, re, glob, html

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "clancy-src")
D = json.load(open(os.path.join(ROOT, "data", "clancy.json")))
CH = 60

def ts(t):
    p = [float(x) for x in t.replace(",", ".").split(":")]
    s = 0.0
    for x in p: s = s * 60 + x
    return s

def vtt(path):
    out, last = [], ""
    txt = open(path, encoding="utf8", errors="ignore").read().replace("\r", "")
    for blk in re.split(r"\n\s*\n", txt):
        m = re.search(r"(\d+:\d{2}:\d{2}\.\d+|\d{2}:\d{2}\.\d+)\s*-->\s*(\S+)", blk)
        if not m: continue
        lines = blk[m.end():].split("\n")[1:] if "\n" in blk[m.end():] else []
        for ln in lines:
            ln = html.unescape(re.sub(r"<[^>]+>", "", ln)).replace(">>", " ").strip()
            ln = re.sub(r"\s+", " ", ln)
            if not ln or ln == last: continue
            last = ln
            out.append((ts(m.group(1)), ln))
    return out

chunks = []
titles = {}
for x in D["trial"]:
    if x["yt"]: titles[x["yt"]] = ("Day %d" % x["day"] if x["day"] else "Intro") + " · " + x["title"]
for h in D["hearings"]:
    for l in h["links"]:
        if l.get("yt"): titles[l["yt"]] = h["title"] + " · " + l["t"]

for p in sorted(glob.glob(os.path.join(SRC, "captions", "t_*.en.vtt"))):
    vid = os.path.basename(p)[2:13]
    cues, cur, start = vtt(p), [], None
    for t, s in cues:
        if start is None: start = t
        cur.append(s)
        if t - start >= CH:
            chunks.append({"k": "v", "id": vid, "at": int(start), "l": titles.get(vid, vid), "x": " ".join(cur)}); cur, start = [], None
    if cur: chunks.append({"k": "v", "id": vid, "at": int(start), "l": titles.get(vid, vid), "x": " ".join(cur)})

DOCS = {  # file stem -> (label, url shown to people)
    "warrants": ("Search warrant applications, affidavits and returns", "media/clancy/docs/search-warrants.pdf"),
    "da-superior-arraignment": ("DA news release, Superior Court arraignment", "media/clancy/docs/da-superior-arraignment.pdf"),
    "father-motion": ("Requests by the father of the child victims (July 20, 2026)", "media/clancy/docs/father-motion.pdf"),
}
for stem, (label, url) in DOCS.items():
    for p in sorted(glob.glob(os.path.join(SRC, "docs", stem + "-*.txt"))):
        pg = int(re.search(r"-(\d+)\.txt$", p).group(1))
        t = re.sub(r"\s+", " ", open(p, encoding="utf8", errors="ignore").read()).strip()
        if len(t) < 40: continue
        for i in range(0, len(t), 1200):
            chunks.append({"k": "d", "id": stem, "at": pg, "l": label, "u": url, "x": t[i:i + 1200]})

json.dump(chunks, open(os.path.join(ROOT, "data", "clancy-text.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print(len(chunks), "chunks;", sum(1 for c in chunks if c["k"] == "v"), "video,", sum(1 for c in chunks if c["k"] == "d"), "document")
