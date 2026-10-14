"""Cuts products out of plain-coloured backgrounds. Photos with a decorative background (blood splatter, scenes...) are left alone.
Writes img/merch/<slug>-<n>.webp (transparent) and a parallel "cutouts" list in data/merch.json.  Run: python3 scripts/cutout_products.py"""
import cv2, json, os, re, urllib.request, numpy as np
from PIL import Image
ROOT = os.path.join(os.path.dirname(__file__), '..'); OUT = os.path.join(ROOT, 'img/merch'); os.makedirs(OUT, exist_ok=True)
def fetch(url): return cv2.imdecode(np.frombuffer(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40).read(), np.uint8), cv2.IMREAD_COLOR)
def slug(u): return re.sub(r'-p\d+$', '', u.rstrip('/').split('/')[-1]).lower()

def cutout(img, tol=24, maxstd=12):
    h, w = img.shape[:2]
    if max(h, w) > 1400: s = 1400 / max(h, w); img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA); h, w = img.shape[:2]
    r = 6; ring = np.concatenate([img[:r].reshape(-1, 3), img[-r:].reshape(-1, 3), img[:, :r].reshape(-1, 3), img[:, -r:].reshape(-1, 3)]).astype(np.float32)
    med = np.median(ring, axis=0)
    if ring.std(0).mean() > maxstd: return None                                  # decorative background: leave it
    dist = np.sqrt(((img.astype(np.float32) - med) ** 2).sum(2))
    bgc = (dist < tol).astype(np.uint8)
    n, lab = cv2.connectedComponents(bgc, connectivity=4)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    fg = (~bg).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab2, st, _ = cv2.connectedComponentsWithStats(fg)
    keep = np.zeros_like(fg)
    if n > 1:
        big = st[1:, 4].max()
        for i in range(1, n):
            if st[i, 4] >= max(60, big * .02): keep[lab2 == i] = 1       # keep real pieces (letters, strap), drop specks
    cnt, _ = cv2.findContours(keep, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE); filled = np.zeros_like(keep); cv2.drawContours(filled, cnt, -1, 1, -1)
    # holes (the gap in a strap, the space between letters) stay see-through when they are as big as the background
    holes = (filled - keep).astype(np.uint8); n3, l3, s3, _ = cv2.connectedComponentsWithStats(holes)
    for i in range(1, n3):
        if s3[i, 4] < 0.004 * h * w: keep[l3 == i] = 1
        else:
            m = (l3 == i); keep[m & (dist >= tol)] = 1
    a = cv2.GaussianBlur(keep.astype(np.float32), (0, 0), 1.1)
    ys, xs = np.where(a > .05)
    if len(xs) < 50 or keep.mean() > .985: return None
    y0, y1, x0, x1 = max(0, ys.min() - 4), min(h, ys.max() + 5), max(0, xs.min() - 4), min(w, xs.max() + 5)
    rgba = np.dstack([img, (a * 255).astype(np.uint8)])[y0:y1, x0:x1]
    return rgba

if __name__ == '__main__':
    dp = os.path.join(ROOT, 'data/merch.json'); d = json.load(open(dp))
    for it in d['americanpatriot'] + d['fourthwall']:
        res = []
        for k, u in enumerate(it['images'][:4]):
            try:
                rg = cutout(fetch(u), maxstd=60 if re.search(r'sticker|decal', it['name'].lower()) else 12)
                if rg is None: res.append(None); continue
                fn = 'img/merch/%s-%d.webp' % (slug(it['url']), k)
                Image.fromarray(cv2.cvtColor(rg, cv2.COLOR_BGRA2RGBA)).save(os.path.join(ROOT, fn), quality=88, method=6); res.append(fn)
            except Exception as e: print('fail', it['name'], k, e); res.append(None)
        it['cutouts'] = res; print(it['name'], ['Y' if r else '-' for r in res])
    json.dump(d, open(dp, 'w'), indent=1)
