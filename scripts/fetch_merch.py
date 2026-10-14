"""Builds data/merch.json from the American Patriot store (Ecwid). Run: python3 scripts/fetch_merch.py
Finds every product whose URL mentions "sobering" in the store sitemap, opens each in a headless
browser (the store renders in JS) and saves name, price, images, stock and link.
Existing hand-written Fourthwall entries and store links in data/merch.json are kept."""
import json, re, sys, urllib.request, os
from playwright.sync_api import sync_playwright

SITE = 'https://www.americanpatriot.ltd'
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'merch.json')

def get(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30).read().decode('utf8', 'replace')

urls = [u for u in re.findall(r'<loc>([^<]+)</loc>', get(SITE + '/ecstore-1-sitemap.xml')) if re.search(r'sobering|sup-sobers', u.lower())]
print(len(urls), 'candidate products')
items = []
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1280, 'height': 900})
    for u in urls:
      for attempt in range(2):
        try:
            pg.goto(u, wait_until='domcontentloaded', timeout=30000)
            pg.wait_for_selector('h1.product-details__product-title', state='attached', timeout=20000); pg.wait_for_timeout(2500)
            d = pg.evaluate("""() => {
              const t = (document.querySelector('.product-details__product-title')||document.querySelector('h1')||{}).textContent||'';
              const pr = (document.querySelector('.details-product-price__value')||document.querySelector('[itemprop=price]')||{});
              const imgs = [...document.querySelectorAll('.product-details img, .details-gallery img')].map(i=>i.currentSrc||i.src).filter(s=>/cloudfront/.test(s));
              const body = document.body.innerText;
              return {name:t.trim(), price:(pr.textContent||pr.content||'').trim(), imgs, out:/out of stock|sold out/i.test(body.slice(0,6000))};
            }""")
            if not re.search(r'sobering|sup sobers', d['name'].lower()): print('skip', d['name']); break
            imgs = []
            for s in d['imgs']:
                s = re.sub(r'/(\d+x\d+|[a-z]\d+)/', '/', s)
                if s not in imgs: imgs.append(s)
            items.append({'name': d['name'], 'price': d['price'], 'images': imgs[:6], 'url': u, 'store': 'americanpatriot', 'soldOut': d['out']})
            print('ok', d['name'], d['price'], len(imgs)); break
        except Exception as e:
            print('fail', u, e)
    b.close()

# ---- Fourthwall (plain HTML, no browser needed): every product in the shop is the channel's ----
import gzip, zlib
FW = 'https://the-sober-sector-shop.fourthwall.com'
def fget(u):
    r = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'gzip'}), timeout=30)
    b = r.read()
    if r.headers.get('Content-Encoding') == 'gzip': b = gzip.decompress(b)
    return b.decode('utf8', 'replace')
EXCLUDE = ('Sober Sector Sticket Sheet', 'Sober Sector Decal', 'DJ Petrovski Holographic Sticker')   # no longer sold
fw = []
try:
    for u in re.findall(r'<loc>([^<]*/products/[^<]+)</loc>', fget(FW + '/sitemap.xml')):
        try:
            h = fget(u)
            for m in re.findall(r'<script type="application/ld\+json">(.*?)</script>', h, re.S):
                d = json.loads(m)
                if d.get('@type') != 'Product': continue
                o = d.get('offers') or {}
                if isinstance(o, list): o = o[0] if o else {}
                price = o.get('price') or (o.get('lowPrice') if isinstance(o, dict) else '')
                imgs = d.get('image') or []
                if isinstance(imgs, str): imgs = [imgs]
                if d['name'] in EXCLUDE: break
                fw.append({'name': d['name'], 'price': ('$%.2f' % float(price)) if price else '', 'images': imgs[:4], 'url': u, 'store': 'fourthwall',
                           'soldOut': 'OutOfStock' in json.dumps(o)})
                print('ok fw', d['name']); break
        except Exception as e: print('fail fw', u, e)
except Exception as e: print('fourthwall failed', e)

try: old = json.load(open(OUT))
except Exception: old = {}
old['updated'] = __import__('datetime').date.today().isoformat()
old['americanpatriot'] = items
old['fourthwallStore'] = FW
if fw: old['fourthwall'] = fw
else: old.setdefault('fourthwall', [])
json.dump(old, open(OUT, 'w'), indent=1)
