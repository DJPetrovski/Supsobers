"""Dresses the cut-out model (img/model/model.png) in each T-shirt product: tints the white tee to the product colour and
prints the design from the listing photo on the chest. Output: img/model/<slug>.webp and a "model" field in data/merch.json.
Run: python3 scripts/make_models.py   (needs opencv-python, numpy, pillow)"""
import cv2, json, os, re, urllib.request, numpy as np
ROOT = os.path.join(os.path.dirname(__file__), '..')
UP = 3   # the cut-out is upscaled this much before dressing, so prints are drawn at high resolution
def setup(path, ymin=150, ymax=560, gmin=185, smax=32, dil=3, up=1):
    """load a cut-out model and find the plain white garment on it"""
    global BGR, A, H, W, G, S, SM, X0, X1, Y0, Y1, SW, SH, SHADE, TX, SH_MASK
    M = cv2.imread(os.path.join(ROOT, path), cv2.IMREAD_UNCHANGED)
    BGR, A = M[..., :3], M[..., 3] / 255.0
    H, W = A.shape
    G = cv2.cvtColor(BGR, cv2.COLOR_BGR2GRAY); S = cv2.cvtColor(BGR, cv2.COLOR_BGR2HSV)[..., 1]
    cand = ((A > .5) & (G > gmin) & (S < smax)).astype(np.uint8); cand[:ymin] = 0; cand[ymax:] = 0
    cand = cv2.morphologyEx(cand, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(cand); k = 1 + np.argmax(st[1:, 4]); sh = (lab == k).astype(np.uint8)
    sh = cv2.morphologyEx(sh, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    cnt, _ = cv2.findContours(sh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE); f = np.zeros_like(sh); cv2.drawContours(f, cnt, -1, 1, -1); sh = f
    sh = cv2.dilate(sh, np.ones((dil, dil), np.uint8)) * (A > .5)
    SM = cv2.GaussianBlur(sh.astype(np.float32), (0, 0), 1.0)
    ys, xs = np.where(sh > 0); X0, X1, Y0, Y1 = xs.min(), xs.max(), ys.min(), ys.max()
    SW, SH = X1 - X0, Y1 - Y0
    # centre of the torso itself (below the sleeves), so prints sit in the middle of the chest, not the middle of the sleeves
    mids = []
    for r in range(int(Y0 + .50 * SH), int(Y0 + .85 * SH)):
        c = np.where(sh[r] > 0)[0]
        if len(c) > 20: mids.append((c.min() + c.max()) / 2)
    TX = float(np.median(mids)) if mids else (X0 + X1) / 2
    SHADE = np.clip(cv2.GaussianBlur(G.astype(np.float32), (0, 0), 1.3) / float(np.median(G[sh > 0])), .35, 1.25)
    if up > 1:
        def big(a, interp=cv2.INTER_CUBIC): return cv2.resize(a, (W * up, H * up), interpolation=interp)
        b = big(BGR).astype(np.float32); BGR = np.clip(b + .6 * (b - cv2.GaussianBlur(b, (0, 0), 2.0)), 0, 255).astype(np.uint8)
        A = np.clip(big(A.astype(np.float32)), 0, 1); SM = cv2.GaussianBlur(big(SM), (0, 0), 2.2); SM = np.clip((SM - .5) * 2.6 + .5, 0, 1); SHADE = big(SHADE)
        H, W = H * up, W * up; X0, X1, Y0, Y1, SW, SH, TX = X0 * up, X1 * up, Y0 * up, Y1 * up, SW * up, SH * up, TX * up
setup('img/model/model.png')

# product -> where the print is in the listing photo, the shirt colour patch, and where it goes on the model
# box / patch are fractions (x0,y0,x1,y1) / (x,y) of the listing image; w = print width as a fraction of the shirt, cy = print centre
# (fraction of shirt height from the collar), cx = shift right of centre (fraction of shirt width)
CFG = {
 'Might-Mean-Somethin-S-S-White': dict(box=(.40,.37,.94,.77), patch=(.55,.88), w=.62, cy=.30),
 'Might-Mean-Somethin-S-S-Black': dict(box=(.40,.37,.94,.77), patch=(.55,.88), w=.62, cy=.30),
 'Just-a-Coincidence':           dict(box=(.24,.24,.76,.46), patch=(.50,.75), w=.50, cy=.27),
 'Specific-Ocean-S-S-White':     dict(box=(.26,.24,.75,.62), patch=(.45,.78), w=.50, cy=.33),
 'Specific-Ocean-Red-S-S':       dict(box=(.25,.26,.77,.61), patch=(.50,.68), w=.50, cy=.33),
 'Specific-Ocean-Black-S-S':     dict(box=(.26,.30,.76,.63), patch=(.50,.72), w=.50, cy=.33),
 'Sup-Sobers-Black-Front-Back-S-S': dict(box=(.19,.29,.415,.52), patch=(.25,.78), w=.26, cy=.26),
 'Might-Mean-Somethin-Tee':      dict(box=(.35,.29,.65,.53), patch=(.50,.55), w=.55, cy=.30),
 'SUP-Board-Heavyweight-Tee':    dict(box=(.34,.30,.67,.48), patch=(.50,.62), w=.30, cy=.26),
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
    dist = np.sqrt(((crop - col) ** 2).sum(2))
    thr = 140 if col.mean() > 190 else (90 if col.mean() < 70 else 40)      # light shirts: folds and shadows must not count as print
    al = np.clip((dist - thr) / 60, 0, 1)
    # drop specks and stray patches so the print's bounding box (used for centring) is only the real design
    m = (al > .3).astype(np.uint8)
    cl = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (27, 27)))      # merge letters of one design into one cluster
    n, lab, st, _ = cv2.connectedComponentsWithStats(cl)
    cnt = np.array([int(m[lab == i].sum()) for i in range(n)]); cnt[0] = 0; big = cnt.max() if n > 1 else 0
    keep = cnt >= max(30, big * .12)
    al = al * keep[lab]
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
    cx = int(TX + c.get('cx', 0) * SW); cy = int(Y0 + c['cy'] * SH)
    ox, oy = cx - tw // 2, cy - th // 2
    ox0, oy0, ox1, oy1 = max(ox, 0), max(oy, 0), min(ox + tw, W), min(oy + th, H)
    d = des[oy0 - oy:oy1 - oy, ox0 - ox:ox1 - ox]; a = dal[oy0 - oy:oy1 - oy, ox0 - ox:ox1 - ox] * SM[oy0:oy1, ox0:ox1] * .97
    d = d * (SHADE[oy0:oy1, ox0:ox1, None] ** .85)
    out[oy0:oy1, ox0:ox1] = out[oy0:oy1, ox0:ox1] * (1 - a[..., None]) + d * a[..., None]
    return np.dstack([np.clip(out, 0, 255).astype(np.uint8), (A * 255).astype(np.uint8)])


# ---- hats: swap the cap on the model for the product ----
HAT = {
 'Sup-Sobers-Corduroy-Dad-Hat':     dict(box=(.25,.37,.72,.53), patch=(.50,.62), w=1.0),
 'Sober-Trucker-Hat':               dict(box=(.32,.36,.68,.56), patch=(.50,.62), w=.9),
 'Sober-Sector-Courdoroy-Dad-Hat':  dict(box=(.27,.35,.65,.55), patch=(.50,.68), w=.9),
}
def dress_hat(listing, c):
    setup('img/model/model.png')
    h, w = listing.shape[:2]
    px, py = int(c['patch'][0] * w), int(c['patch'][1] * h)
    col = np.median(listing[max(0, py - 12):py + 12, max(0, px - 12):px + 12].reshape(-1, 3), axis=0)
    x0, y0, x1, y1 = c['box']; crop = listing[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)].astype(np.float32)
    al = cv2.GaussianBlur(np.clip((np.sqrt(((crop - col) ** 2).sum(2)) - 38) / 60, 0, 1), (0, 0), .8)
    ys_, xs_ = np.where(al > .25); bx0, bx1, by0, by1 = xs_.min(), xs_.max() + 1, ys_.min(), ys_.max() + 1
    des, dal = crop[by0:by1, bx0:bx1], al[by0:by1, bx0:bx1]
    # cap mask on the model: dark pixels, closed over the old logo
    dark = ((A > .5) & (G < 80)).astype(np.uint8); dark[95:] = 0
    n, lab, st, _ = cv2.connectedComponentsWithStats(dark); k = 1 + np.argmax(st[1:, 4]); cap = (lab == k).astype(np.uint8)
    cap = cv2.morphologyEx(cap, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (19, 19)))
    cnt, _ = cv2.findContours(cap, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE); f = np.zeros_like(cap); cv2.drawContours(f, cnt, -1, 1, -1); cap = f * (A > .5)
    logo = ((G > 110) & (cap > 0)).astype(np.uint8); logo = cv2.dilate(logo, np.ones((5, 5), np.uint8))
    clean = cv2.inpaint(BGR, logo * 255, 4, cv2.INPAINT_TELEA)
    gs = cv2.medianBlur(cv2.cvtColor(clean, cv2.COLOR_BGR2GRAY), 9).astype(np.float32)
    capm = cv2.GaussianBlur(cap.astype(np.float32), (0, 0), 1.0)
    shade = np.clip(gs / float(np.median(gs[cap > 0])), .45, 1.9)
    tinted = np.clip(col[None, None, :] * (shade[..., None] ** .9), 0, 255)
    out = clean.astype(np.float32) * (1 - capm[..., None]) + tinted * capm[..., None]
    # print goes where the old logo was
    ly, lx = np.where(logo > 0); cx, cy = int(lx.mean()), int(ly.mean()); lw = lx.max() - lx.min()
    tw = max(8, int(c['w'] * lw)); th = max(4, int(tw * des.shape[0] / des.shape[1]))
    d2 = cv2.resize(des, (tw, th), interpolation=cv2.INTER_AREA); a2 = cv2.resize(dal, (tw, th), interpolation=cv2.INTER_AREA)
    pad = 6; cd = np.zeros((th + 2 * pad, tw + 2 * pad, 3), np.float32); ca = np.zeros(cd.shape[:2], np.float32); cd[pad:-pad, pad:-pad] = d2; ca[pad:-pad, pad:-pad] = a2
    Mx = cv2.getRotationMatrix2D((cd.shape[1] / 2, cd.shape[0] / 2), 11, 1)
    cd = cv2.warpAffine(cd, Mx, cd.shape[1::-1]); ca = cv2.warpAffine(ca, Mx, cd.shape[1::-1])
    ox, oy = cx - cd.shape[1] // 2, cy - cd.shape[0] // 2
    x0_, y0_, x1_, y1_ = max(ox, 0), max(oy, 0), min(ox + cd.shape[1], W), min(oy + cd.shape[0], H)
    cd, ca = cd[y0_ - oy:y1_ - oy, x0_ - ox:x1_ - ox], ca[y0_ - oy:y1_ - oy, x0_ - ox:x1_ - ox] * capm[y0_:y1_, x0_:x1_] * .97
    cd = cd * (shade[y0_:y1_, x0_:x1_, None] ** .6)
    out[y0_:y1_, x0_:x1_] = out[y0_:y1_, x0_:x1_] * (1 - ca[..., None]) + cd * ca[..., None]
    return np.dstack([np.clip(out, 0, 255).astype(np.uint8), (A * 255).astype(np.uint8)])

HOODIE = {
 "Might-Mean-Somethin-Hoodie":  dict(box=(.42,.40,.88,.70), patch=(.62,.30), w=.52, cy=.42),
 "YouTube-Or-Die-Hoodie":       dict(box=(.29,.22,.45,.38), patch=(.60,.55), w=.15, cy=.34, cx=-.20),
 "Sup-Sobers-Hoodie":           dict(box=(.50,.33,.65,.42), patch=(.45,.65), w=.11, cy=.34, cx=.17),
}
if __name__ == '__main__':
    from PIL import Image
    dp = os.path.join(ROOT, 'data/merch.json'); d = json.load(open(dp))
    for it in d['americanpatriot'] + d['fourthwall']:
        key = find(it['name'], CFG) or find(slug(it['url']), CFG); cfg = CFG.get(key) if key else None
        if not key and (find(it['name'], HAT) or find(slug(it['url']), HAT)):
            hk = find(it['name'], HAT) or find(slug(it['url']), HAT)
            try:
                out = dress_hat(fetch(it['images'][0]), HAT[hk]); fn = 'img/model/%s.webp' % slug(it['url'])
                Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGRA2RGBA)).save(os.path.join(ROOT, fn), quality=88, method=6); it['model'] = fn; print('ok hat', it['name'])
            except Exception as e: print('skip hat', it['name'], e)
            continue
        if not key:
            key = find(it['name'], HOODIE) or find(slug(it['url']), HOODIE); cfg = HOODIE.get(key) if key else None
            if key: setup('img/model/model_hoodie.png', 120, 545, 165, 35, up=UP)
        else: setup('img/model/model.png', up=UP)
        if not key: it.pop('model', None); continue
        try:
            out = dress(fetch(it['images'][0]), cfg); fn = 'img/model/%s.webp' % slug(it['url'])
            Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGRA2RGBA)).save(os.path.join(ROOT, fn), quality=88, method=6)
            it['model'] = fn; print('ok', it['name'])
        except Exception as e: print('skip', it['name'], e)
    json.dump(d, open(dp, 'w'), indent=1)
