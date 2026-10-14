"""Dresses the cut-out model (img/model/model.png) in each T-shirt product: tints the white tee to the product colour and
prints the design from the listing photo on the chest. Output: img/model/<slug>.webp and a "model" field in data/merch.json.
Run: python3 scripts/make_models.py   (needs opencv-python, numpy, pillow)"""
import cv2, json, os, re, urllib.request, numpy as np
ROOT = os.path.join(os.path.dirname(__file__), '..')
M = cv2.imread(os.path.join(ROOT, 'img/model/model.png'), cv2.IMREAD_UNCHANGED)
BGR, A = M[..., :3], M[..., 3] / 255.0
H, W = A.shape
G = cv2.cvtColor(BGR, cv2.COLOR_BGR2GRAY); S = cv2.cvtColor(BGR, cv2.COLOR_BGR2HSV)[..., 1]

# --- shirt mask (the plain white tee) ---
cand = ((A > .5) & (G > 185) & (S < 32)).astype(np.uint8); cand[:150] = 0; cand[560:] = 0
cand = cv2.morphologyEx(cand, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(cand); k = 1 + np.argmax(st[1:, 4]); sh = (lab == k).astype(np.uint8)
sh = cv2.morphologyEx(sh, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
cnt, _ = cv2.findContours(sh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE); f = np.zeros_like(sh); cv2.drawContours(f, cnt, -1, 1, -1); sh = f
sh = cv2.dilate(sh, np.ones((3, 3), np.uint8)) * (A > .5)
SM = cv2.GaussianBlur(sh.astype(np.float32), (0, 0), 1.0)
ys, xs = np.where(sh > 0); X0, X1, Y0, Y1 = xs.min(), xs.max(), ys.min(), ys.max()
SW, SH = X1 - X0, Y1 - Y0
SHADE = np.clip(cv2.GaussianBlur(G.astype(np.float32), (0, 0), 1.3) / float(np.median(G[sh > 0])), .35, 1.25)

# product -> where the print is in the listing photo, the shirt colour patch, and where it goes on the model
# box / patch are fractions (x0,y0,x1,y1) / (x,y) of the listing image; w = print width as a fraction of the shirt, cy = print centre
# (fraction of shirt height from the collar), cx = shift right of centre (fraction of shirt width)
CFG = {
 'Might-Mean-Somethin-S-S-White': dict(box=(.40,.40,.92,.74), patch=(.55,.88), w=.62, cy=.30),
 'Might-Mean-Somethin-S-S-Black': dict(box=(.40,.40,.92,.74), patch=(.55,.88), w=.62, cy=.30),
 'Just-a-Coincidence':           dict(box=(.24,.24,.74,.44), patch=(.50,.75), w=.50, cy=.27),
 'Specific-Ocean-S-S-White':     dict(box=(.26,.26,.74,.53), patch=(.45,.78), w=.50, cy=.33),
 'Specific-Ocean-Red-S-S':       dict(box=(.28,.30,.78,.58), patch=(.50,.68), w=.50, cy=.33),
 'Specific-Ocean-Black-S-S':     dict(box=(.28,.33,.76,.56), patch=(.50,.72), w=.50, cy=.33),
 'Might-Mean-Somethin-Tee':      dict(box=(.36,.32,.65,.46), patch=(.50,.55), w=.55, cy=.30),
 'SUP-Board-Heavyweight-Tee':    dict(box=(.32,.32,.62,.45), patch=(.50,.62), w=.30, cy=.26),
 'Chalk-Outline-Tee':            dict(box=(.53,.18,.65,.31), patch=(.50,.70), w=.13, cy=.20, cx=.20),
}
def find(name, cfgs):
    return next((k for k in cfgs if k.lower().replace('-', ' ') in re.sub(r"[^A-Za-z0-9]+", ' ', name).lower()), None)
def slug(u): return re.sub(r'-p\d+$', '', u.rstrip('/').split('/')[-1]).lower()

def fetch(url):
    return cv2.imdecode(np.frombuffer(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40).read(), np.uint8), cv2.IMREAD_COLOR)

def dress(listing, c):
    h, w = listing.shape[:2]
    px, py = int(c['patch'][0] * w), int(c['patch'][1] * h)
    col = np.median(listing[max(0, py - 12):py + 12, max(0, px - 12):px + 12].reshape(-1, 3), axis=0)
    x0, y0, x1, y1 = c['box']; crop = listing[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)].astype(np.float32)
    dist = np.sqrt(((crop - col) ** 2).sum(2)); al = np.clip((dist - 38) / 60, 0, 1)
    al = cv2.GaussianBlur(al, (0, 0), .8)
    ys_, xs_ = np.where(al > .25)
    if len(xs_) < 20: raise ValueError('no design found')
    bx0, bx1, by0, by1 = xs_.min(), xs_.max() + 1, ys_.min(), ys_.max() + 1
    des, dal = crop[by0:by1, bx0:bx1], al[by0:by1, bx0:bx1]
    tw = max(6, int(c['w'] * SW)); th = max(4, int(tw * des.shape[0] / des.shape[1]))
    des = cv2.resize(des, (tw, th), interpolation=cv2.INTER_AREA); dal = cv2.resize(dal, (tw, th), interpolation=cv2.INTER_AREA)
    # tint the shirt: keep the folds (SHADE), swap the colour
    lift = np.clip(SHADE - .9, -.5, .35)[..., None] * (60 if col.mean() < 90 else 0)
    tinted = np.clip(col[None, None, :] * (SHADE[..., None] ** 1.15) + lift, 0, 255)
    out = BGR.astype(np.float32) * (1 - SM[..., None]) + tinted * SM[..., None]
    # print
    cx = int((X0 + X1) / 2 + c.get('cx', 0) * SW); cy = int(Y0 + c['cy'] * SH)
    ox, oy = cx - tw // 2, cy - th // 2
    ox0, oy0, ox1, oy1 = max(ox, 0), max(oy, 0), min(ox + tw, W), min(oy + th, H)
    d = des[oy0 - oy:oy1 - oy, ox0 - ox:ox1 - ox]; a = dal[oy0 - oy:oy1 - oy, ox0 - ox:ox1 - ox] * SM[oy0:oy1, ox0:ox1] * .97
    d = d * (SHADE[oy0:oy1, ox0:ox1, None] ** .85)
    out[oy0:oy1, ox0:ox1] = out[oy0:oy1, ox0:ox1] * (1 - a[..., None]) + d * a[..., None]
    return np.dstack([np.clip(out, 0, 255).astype(np.uint8), (A * 255).astype(np.uint8)])

if __name__ == '__main__':
    from PIL import Image
    dp = os.path.join(ROOT, 'data/merch.json'); d = json.load(open(dp))
    for it in d['americanpatriot'] + d['fourthwall']:
        key = find(it['name'], CFG) or find(slug(it['url']), CFG)
        if not key: it.pop('model', None); continue
        try:
            out = dress(fetch(it['images'][0]), CFG[key]); fn = 'img/model/%s.webp' % slug(it['url'])
            Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGRA2RGBA)).save(os.path.join(ROOT, fn), quality=88, method=6)
            it['model'] = fn; print('ok', it['name'])
        except Exception as e: print('skip', it['name'], e)
    json.dump(d, open(dp, 'w'), indent=1)
