/* Merch: a coverflow rack of shirts, hoodies and stickers. Click the centre one to check out. */
(function () {
  var track = document.getElementById('mc-track'), info = document.getElementById('mc-info');
  if (!track) return;
  var items = [], cards = [], cur = -1, raf = 0;
  var STORE = { americanpatriot: 'American Patriot Limited', fourthwall: 'Fourthwall' };
  function el(t, c, txt) { var e = document.createElement(t); if (c) e.className = c; if (txt) e.textContent = txt; return e; }

  function fill(d) {
    items = (d.americanpatriot || []).concat((d.fourthwall || []).map(function (x) { x.store = 'fourthwall'; return x; }))
      .filter(function (x) { return x && x.url && x.images && x.images.length; });
    window.SS = window.SS || {}; window.SS.merch = items;
    document.dispatchEvent(new Event('ss:merch'));
    var links = document.getElementById('mc-links');
    if (d.fourthwallStore) { var a = el('a', 'btn', 'Fourthwall shop'); a.href = d.fourthwallStore; a.target = '_blank'; a.rel = 'noopener'; links.appendChild(a); }
    if (!items.length) { document.getElementById('mc-empty').hidden = false; document.getElementById('mc-stage').hidden = true; info.hidden = true; return; }
    track.textContent = '';
    items.forEach(function (it, i) {
      var a = el('a', 'mc-card'); a.href = it.url; a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('data-i', i);
      var img = el('img'); img.src = it.images[0]; img.alt = it.name; img.loading = i < 5 ? 'eager' : 'lazy'; img.decoding = 'async'; img.draggable = false;
      a.appendChild(img);
      if (it.soldOut) a.appendChild(el('span', 'mc-badge', 'Sold out'));
      a.addEventListener('click', function (e) { if (i !== cur) { e.preventDefault(); go(i); } });
      track.appendChild(a); cards.push(a);
    });
    setTimeout(function () { go(Math.min(1, items.length - 1), true); frame(); }, 60);
  }

  function go(i, instant) {
    i = Math.max(0, Math.min(items.length - 1, i));
    var c = cards[i]; if (!c) return;
    track.scrollTo({ left: c.offsetLeft - (track.clientWidth - c.offsetWidth) / 2, behavior: instant ? 'auto' : 'smooth' });
  }
  function frame() {
    var mid = track.scrollLeft + track.clientWidth / 2, best = 0, bd = 1e9;
    cards.forEach(function (c, i) {
      var cx = c.offsetLeft + c.offsetWidth / 2, d = (cx - mid) / c.offsetWidth, ad = Math.abs(d);
      if (ad < bd) { bd = ad; best = i; }
      c.style.transform = 'translateZ(' + (-Math.min(ad, 3) * 90) + 'px) rotateY(' + (-Math.max(-1.5, Math.min(1.5, d)) * 42) + 'deg) scale(' + (1 - Math.min(ad, 2) * 0.06) + ')';
      c.style.opacity = Math.max(0.25, 1 - ad * 0.28);
      c.style.zIndex = 100 - Math.round(ad * 10);
    });
    if (best !== cur) { cur = best; cards.forEach(function (c, i) { c.classList.toggle('is-centre', i === cur); }); show(items[cur]); }
  }
  function show(it) {
    info.textContent = '';
    info.appendChild(el('p', 'mc-store', 'Check out at ' + (STORE[it.store] || 'the shop')));
    info.appendChild(el('h3', 'mc-name', it.name));
    if (it.price) info.appendChild(el('p', 'mc-price', it.price));
    var b = el('a', 'btn btn-primary', it.soldOut ? 'View it anyway' : 'Buy now'); b.href = it.url; b.target = '_blank'; b.rel = 'noopener';
    info.appendChild(b);
    if (it.images.length > 1) {
      var th = el('div', 'mc-angles');
      it.images.forEach(function (src, k) {
        var t = el('button', 'mc-angle' + (k === 0 ? ' on' : '')); t.type = 'button'; t.setAttribute('aria-label', 'Angle ' + (k + 1));
        var im = el('img'); im.src = src; im.alt = ''; im.loading = 'lazy'; t.appendChild(im);
        t.addEventListener('click', function () {
          var main = cards[cur] && cards[cur].querySelector('img'); if (main) main.src = src;
          Array.prototype.forEach.call(th.children, function (c) { c.classList.toggle('on', c === t); });
        });
        th.appendChild(t);
      });
      info.appendChild(th);
    }
    runway(it);
    var n = el('p', 'mc-count', (cur + 1) + ' / ' + items.length); info.appendChild(n);
  }
  /* ---------- runway: a model strolls out for each product ---------- */
  var stage = document.getElementById('mc-runway'), rwT = 0, rwAnims = [];
  var reduceM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SVGNS = 'http://www.w3.org/2000/svg';
  function kind(it) {
    var n = (it.name || '').toLowerCase();
    if (/sticker|decal|patch/.test(n)) return 'car';
    if (/hat|cap/.test(n)) return 'hat';
    if (/mug|bag|blanky|towel|desk pad|pad|flag/.test(n)) return 'carry';
    return 'wear';
  }
  function figure(it, k) {
    var img = it.images[0], id = 'rwc' + Math.floor(Math.random() * 1e6);
    var shirt = k === 'wear' ? '<clipPath id="' + id + '"><path d="M17 27 Q30 22 43 27 L46 60 L14 60 Z"/></clipPath><path d="M17 27 Q30 22 43 27 L46 60 L14 60 Z" fill="#241014"/><image href="' + img + '" x="8" y="22" width="44" height="42" preserveAspectRatio="xMidYMid slice" clip-path="url(#' + id + ')"/>' : '<path d="M17 27 Q30 22 43 27 L46 60 L14 60 Z" fill="#1a0a0d"/>';
    return '<svg viewBox="0 0 60 120" class="rw-fig" aria-hidden="true">' +
      '<g class="rw-legL"><rect x="19" y="58" width="9" height="56" rx="4" fill="#0b0204" stroke="#ff2a35" stroke-opacity=".5"/></g>' +
      '<g class="rw-legR"><rect x="32" y="58" width="9" height="56" rx="4" fill="#0b0204" stroke="#ff2a35" stroke-opacity=".5"/></g>' +
      '<g class="rw-armL"><rect x="9" y="27" width="7" height="30" rx="3.5" fill="#12070a" stroke="#ff2a35" stroke-opacity=".5"/></g>' +
      '<g class="rw-armR"><rect x="44" y="27" width="7" height="30" rx="3.5" fill="#12070a" stroke="#ff2a35" stroke-opacity=".5"/></g>' +
      shirt + '<circle cx="30" cy="14" r="9.5" fill="#12070a" stroke="#ff2a35" stroke-opacity=".6"/>' +
      '<path d="M22 11 Q30 2 38 11 Q30 8 22 11Z" fill="#000"/><rect x="21" y="12" width="18" height="4" rx="2" fill="#000" opacity=".9"/></svg>';
  }
  function runway(it) {
    if (!stage) return;
    clearTimeout(rwT);
    rwT = setTimeout(function () {
      rwAnims.forEach(function (a) { try { a.cancel(); } catch (e) {} }); rwAnims = [];
      var k = kind(it), cast = stage.querySelector('.rw-cast'); cast.textContent = '';
      var w = stage.clientWidth, mid = w / 2;
      if (k === 'car') {
        var car = el('div', 'rw-car');
        car.innerHTML = '<svg viewBox="0 0 220 90" aria-hidden="true"><path d="M8 62 L8 46 Q10 40 24 38 L62 36 Q76 14 108 14 L146 14 Q170 16 184 36 L206 42 Q214 46 214 58 L214 64 Z" fill="#7d0f1a" stroke="#ff2a35"/><path d="M70 36 Q82 20 108 20 L120 20 L120 36Z M128 36 L128 20 L146 20 Q162 22 172 36Z" fill="#1a0507"/><rect x="92" y="38" width="46" height="22" rx="4" fill="#1a0507" stroke="#ff2a35" stroke-opacity=".6"/><circle cx="56" cy="66" r="15" fill="#050102" stroke="#999"/><circle cx="162" cy="66" r="15" fill="#050102" stroke="#999"/><circle cx="56" cy="66" r="6" fill="#444"/><circle cx="162" cy="66" r="6" fill="#444"/></svg><img src="' + it.images[0] + '" alt="" class="rw-decal">';
        cast.appendChild(car);
        if (reduceM) { car.style.left = (mid - 70) + 'px'; return; }
        var a = car.animate([{ transform: 'translateX(' + (w + 40) + 'px)' }, { transform: 'translateX(' + (mid - 80) + 'px)', offset: .42 }, { transform: 'translateX(' + (mid - 80) + 'px)', offset: .75 }, { transform: 'translateX(-260px)' }], { duration: 4200, easing: 'ease-in-out', fill: 'forwards' });
        car.style.left = '0'; rwAnims.push(a); return;
      }
      var m = el('div', 'rw-model'); m.innerHTML = figure(it, k);
      if (k === 'hat') { var h = el('img', 'rw-hat'); h.src = it.images[0]; h.alt = ''; m.appendChild(h); }
      if (k === 'carry') { var c = el('div', 'rw-carry'); var ci = el('img'); ci.src = it.images[0]; ci.alt = ''; c.appendChild(ci); m.appendChild(c); }
      cast.appendChild(m); m.style.left = '0';
      if (reduceM) { m.style.transform = 'translateX(' + (mid - 30) + 'px)'; return; }
      m.classList.add('walking');
      var from = -80, to = mid - 30;
      var walk = m.animate([{ transform: 'translateX(' + from + 'px)' }, { transform: 'translateX(' + to + 'px)', offset: .5 }, { transform: 'translateX(' + to + 'px)', offset: .78 }, { transform: 'translateX(' + (w + 80) + 'px)' }], { duration: 5200, easing: 'linear', fill: 'forwards' });
      rwAnims.push(walk);
      setTimeout(function () { m.classList.remove('walking'); m.classList.add('posing'); }, 2500);
      setTimeout(function () { m.classList.remove('posing'); m.classList.add('walking'); }, 4050);
    }, 380);
  }
  track.addEventListener('scroll', function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }, { passive: true });
  window.addEventListener('resize', function () { go(cur, true); frame(); });
  document.getElementById('mc-prev').addEventListener('click', function () { go(cur - 1); });
  document.getElementById('mc-next').addEventListener('click', function () { go(cur + 1); });
  track.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1); } });
  document.addEventListener('ss:route', function (e) { if (e.detail.name === 'merch' && cur >= 0) setTimeout(function () { go(cur, true); frame(); runway(items[cur]); }, 30); });

  // mouse drag to swipe on desktop
  var down = false, sx = 0, sl = 0, moved = false;
  track.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') return; down = true; moved = false; sx = e.clientX; sl = track.scrollLeft; });
  window.addEventListener('pointermove', function (e) { if (!down) return; var dx = e.clientX - sx; if (Math.abs(dx) > 5) { moved = true; track.classList.add('drag'); track.scrollLeft = sl - dx; } });
  window.addEventListener('pointerup', function () { if (!down) return; down = false; track.classList.remove('drag'); if (moved) { var m = track.scrollLeft + track.clientWidth / 2, b = 0, bd = 1e9; cards.forEach(function (c, i) { var d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - m); if (d < bd) { bd = d; b = i; } }); go(b); } });
  track.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);

  fetch('data/merch.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(fill).catch(function () { fill({}); });
})();
