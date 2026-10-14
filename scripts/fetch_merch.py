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

urls = [u for u in re.findall(r'<loc>([^<]+)</loc>', get(SITE + '/ecstore-1-sitemap.xml')) if 'sobering' in u.lower()]
print(len(urls), 'candidate products')
items = []
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1280, 'height': 900})
    for u in urls:
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
            if 'sobering' not in d['name'].lower(): print('skip', d['name']); continue
            imgs = []
            for s in d['imgs']:
                s = re.sub(r'/(\d+x\d+|[a-z]\d+)/', '/', s)
                if s not in imgs: imgs.append(s)
            items.append({'name': d['name'], 'price': d['price'], 'images': imgs[:6], 'url': u, 'store': 'americanpatriot', 'soldOut': d['out']})
            print('ok', d['name'], d['price'], len(imgs))
        except Exception as e:
            print('fail', u, e)
    b.close()

try: old = json.load(open(OUT))
except Exception: old = {}
old['updated'] = __import__('datetime').date.today().isoformat()
old['americanpatriot'] = items
old.setdefault('fourthwallStore', '')
old.setdefault('fourthwall', [])
json.dump(old, open(OUT, 'w'), indent=1)
