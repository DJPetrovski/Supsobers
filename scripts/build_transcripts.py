#!/usr/bin/env python3
"""Turn the files in transcripts/ into data/transcripts.json for the site search.
Output: {"<videoId>": [[startSeconds, "about 45 seconds of words"], ...]}"""
import json, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "transcripts")
OUT = os.path.join(ROOT, "data", "transcripts.json")
ID = re.compile(r"[A-Za-z0-9_-]{11}")
CHUNK = 45  # seconds per search chunk


def tsec(t):
    t = t.replace(",", ".").strip()
    parts = [float(x) for x in t.split(":")]
    sec = 0.0
    for p in parts:
        sec = sec * 60 + p
    return sec


def cues(text, ext):
    """-> list of (seconds, text)"""
    out = []
    if ext in (".srt", ".vtt"):
        for block in re.split(r"\n\s*\n", text.replace("\r", "")):
            m = re.search(r"(\d{1,2}:\d{2}:\d{2}[.,]\d+|\d{1,2}:\d{2}[.,]\d+)\s*-->", block)
            if not m:
                continue
            body = block[m.end():].split("\n", 1)[-1] if "\n" in block[m.end():] else ""
            body = re.sub(r"<[^>]+>", "", body)
            body = re.sub(r"\s+", " ", body).strip()
            if body:
                out.append((tsec(m.group(1)), body))
        return out
    # plain text: optional [mm:ss] markers
    marks = list(re.finditer(r"\[(\d{1,2}:\d{2}(?::\d{2})?)\]", text))
    if marks:
        for i, m in enumerate(marks):
            end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
            body = re.sub(r"\s+", " ", text[m.end():end]).strip()
            if body:
                out.append((tsec(m.group(1)), body))
        return out
    words = re.sub(r"\s+", " ", text).strip().split(" ")
    for i in range(0, len(words), 110):          # about 45 s of speech, no real times
        out.append((0, " ".join(words[i:i + 110])))
    return out


def chunk(cs):
    res, cur, start = [], [], None
    for t, body in cs:
        if start is None:
            start = t
        cur.append(body)
        if t - start >= CHUNK and t > 0:
            res.append([int(start), " ".join(cur)]); cur, start = [], None
    if cur:
        res.append([int(start or 0), " ".join(cur)])
    return res


def main():
    if not os.path.isdir(SRC):
        print("No transcripts/ folder."); return 0
    vids = {v["id"] for v in json.load(open(os.path.join(ROOT, "data", "videos.json"), encoding="utf-8"))["videos"]}
    try:
        data = json.load(open(OUT, encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    n = 0
    for f in sorted(os.listdir(SRC)):
        ext = os.path.splitext(f)[1].lower()
        if ext not in (".txt", ".srt", ".vtt"):
            continue
        ids = [m for m in ID.findall(f) if m in vids] or ID.findall(os.path.splitext(f)[0])[:1]
        if not ids:
            print("skip (no video id in name):", f); continue
        text = open(os.path.join(SRC, f), encoding="utf-8", errors="replace").read()
        data[ids[0]] = chunk(cues(text, ext)); n += 1
        print("ok", ids[0], len(data[ids[0]]), "chunks")
    json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("wrote", len(data), "videos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
