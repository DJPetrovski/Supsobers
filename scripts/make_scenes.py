"""Puts each sticker / decal from the listings onto a car or a water bottle photo. Output: img/scene/<slug>.webp and
"scene" + "focus" fields in data/merch.json.  Run: python3 scripts/make_scenes.py"""
import cv2, json, os, re, urllib.request, numpy as np
ROOT = os.path.join(os.path.dirname(__file__), '..'); UP = os.environ.get('SCENE_SRC', os.path.join(ROOT, 'img/scene/src'))
def fetch(url): return cv2.imdecode(np.frombuffer(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40).read(), np.uint8), cv2.IMREAD_COLOR)
def slug(u): return re.sub(r'-p\d+$', '', u.rstrip('/').split('/')[-1]).lower()

def cut(img, mode):
    """returns BGR sticker + alpha (float 0..1)"""
    h, w = img.shape[:2]
    if mode == 'whole':
        return img, np.ones((h, w), np.float32)
    if mode.startswith('crop:'):                # fixed crop box x0,y0,x1,y1 (fractions)
        x0, y0, x1, y1 = [float(v) for v in mode[5:].split(',')]
        c = img[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)]
        return c, np.ones(c.shape[:2], np.float32)
    if mode == 'bright':                      # sheet/panel lighter than its surroundings
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY); m = (g > 243).astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        n, lab, st, _ = cv2.connectedComponentsWithStats(m); k = 1 + np.argmax(st[1:, 4]); x, y, ww, hh = st[k][:4]
        return img[y:y + hh, x:x + ww], np.ones((hh, ww), np.float32)
    # 'flood': remove the plain background around a die-cut sticker
    bg = np.median(np.concatenate([img[0], img[-1], img[:, 0], img[:, -1]]), axis=0)
    d = np.sqrt(((img.astype(np.float32) - bg) ** 2).sum(2)); fg = (d > 28).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    cnt, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE); f = np.zeros_like(fg); cv2.drawContours(f, cnt, -1, 1, -1)
    ys, xs = np.where(f > 0); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    return img[y0:y1, x0:x1], cv2.GaussianBlur(f[y0:y1, x0:x1].astype(np.float32), (0, 0), 1)

def place(scene, st, al, cx, cy, wfrac, rot=0, cyl=None):
    H, W = scene.shape[:2]; tw = int(wfrac * W); th = max(4, int(tw * st.shape[0] / st.shape[1]))
    s = cv2.resize(st, (tw, th), interpolation=cv2.INTER_AREA).astype(np.float32); a = cv2.resize(al, (tw, th), interpolation=cv2.INTER_AREA)
    if cyl:   # wrap around a bottle: squeeze towards the edges
        u = np.linspace(-1, 1, tw); src = np.arcsin(np.clip(u * np.sin(cyl), -1, 1)) / cyl
        mapx = np.tile(((src + 1) / 2 * (tw - 1)).astype(np.float32), (th, 1)); mapy = np.tile(np.arange(th, dtype=np.float32)[:, None], (1, tw))
        s = cv2.remap(s, mapx, mapy, cv2.INTER_LINEAR); a = cv2.remap(a, mapx, mapy, cv2.INTER_LINEAR)
        edge = np.clip(np.cos(u * cyl * 1.1), .55, 1)[None, :]; s = s * edge[..., None]
    pad = 8; cs = np.zeros((th + 2 * pad, tw + 2 * pad, 3), np.float32); ca = np.zeros(cs.shape[:2], np.float32)
    cs[pad:-pad, pad:-pad] = s; ca[pad:-pad, pad:-pad] = a
    M = cv2.getRotationMatrix2D((cs.shape[1] / 2, cs.shape[0] / 2), rot, 1)
    cs = cv2.warpAffine(cs, M, (cs.shape[1], cs.shape[0])); ca = cv2.warpAffine(ca, M, (cs.shape[1], cs.shape[0]))
    ox, oy = int(cx * W - cs.shape[1] / 2), int(cy * H - cs.shape[0] / 2)
    x0, y0, x1, y1 = max(ox, 0), max(oy, 0), min(ox + cs.shape[1], W), min(oy + cs.shape[0], H)
    cs, ca = cs[y0 - oy:y1 - oy, x0 - ox:x1 - ox], ca[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
    out = scene.astype(np.float32); reg = out[y0:y1, x0:x1]
    light = cv2.GaussianBlur(cv2.cvtColor(scene, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 25)[y0:y1, x0:x1]
    cs = cs * np.clip(light / max(1, light.mean()), .75, 1.12)[..., None] ** .8        # pick up the scene lighting
    sh = cv2.GaussianBlur(ca, (0, 0), 2.2); sh = np.roll(np.roll(sh, 2, 0), 2, 1) * .45            # soft shadow
    reg *= (1 - sh[..., None]); reg = reg * (1 - ca[..., None]) + cs * ca[..., None]; out[y0:y1, x0:x1] = reg
    return np.clip(out, 0, 255).astype(np.uint8)

# which photo each sticker goes on, how, and where (fractions of the photo)
CAR = dict(img='car.jpg'); BOTTLE = dict(img='bottles.jpg')
CFG = {
 'Sobering Stories 9/11 Decal':                      dict(CAR, cut='whole', at=(.334, .797), w=.14, rot=-1),
 "Sobering Stories Might Mean Somethin' Stickers":   dict(CAR, cut='whole', at=(.705, .60), w=.10, rot=-3),
 'Sobering Stories Sticker':                         dict(CAR, cut='flood', at=(.715, .70), w=.055, rot=4),
 'Sober Sector Sticket Sheet':                       dict(BOTTLE, cut='bright', at=(.572, .54), w=.088, rot=-4, cyl=.62),
 'Sober Sector Decal':                               dict(BOTTLE, cut='crop:.13,.30,.85,.74', at=(.4275, .50), w=.095, rot=3, cyl=.62),
 'DJ Petrovski Holographic Sticker':                 dict(BOTTLE, cut='flood', at=(.572, .40), w=.08, rot=-6, cyl=.62),
}
if __name__ == '__main__':
    from PIL import Image
    dp = os.path.join(ROOT, 'data/merch.json'); d = json.load(open(dp))
    for it in d['americanpatriot'] + d['fourthwall']:
        c = CFG.get(it['name'])
        if not c: continue
        sc = cv2.imread(os.path.join(UP, c['img']))
        st, al = cut(fetch(it['images'][0]), c['cut'])
        out = place(sc, st, al, c['at'][0], c['at'][1], c['w'], c.get('rot', 0), c.get('cyl'))
        out = cv2.resize(out, (1100, int(1100 * out.shape[0] / out.shape[1])), interpolation=cv2.INTER_AREA)
        fn = 'img/scene/%s.webp' % slug(it['url']); Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB)).save(os.path.join(ROOT, fn), quality=86, method=6)
        it['scene'] = fn; it['focus'] = [c['at'][0], c['at'][1]]; print('ok', it['name'])
    json.dump(d, open(dp, 'w'), indent=1)
