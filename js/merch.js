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
    var n = el('p', 'mc-count', (cur + 1) + ' / ' + items.length); info.appendChild(n);
  }
  track.addEventListener('scroll', function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }, { passive: true });
  window.addEventListener('resize', function () { go(cur, true); frame(); });
  document.getElementById('mc-prev').addEventListener('click', function () { go(cur - 1); });
  document.getElementById('mc-next').addEventListener('click', function () { go(cur + 1); });
  track.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1); } });
  document.addEventListener('ss:route', function (e) { if (e.detail.name === 'merch' && cur >= 0) setTimeout(function () { go(cur, true); frame(); }, 30); });

  // mouse drag to swipe on desktop
  var down = false, sx = 0, sl = 0, moved = false;
  track.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') return; down = true; moved = false; sx = e.clientX; sl = track.scrollLeft; });
  window.addEventListener('pointermove', function (e) { if (!down) return; var dx = e.clientX - sx; if (Math.abs(dx) > 5) { moved = true; track.classList.add('drag'); track.scrollLeft = sl - dx; } });
  window.addEventListener('pointerup', function () { if (!down) return; down = false; track.classList.remove('drag'); if (moved) { var m = track.scrollLeft + track.clientWidth / 2, b = 0, bd = 1e9; cards.forEach(function (c, i) { var d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - m); if (d < bd) { bd = d; b = i; } }); go(b); } });
  track.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);

  fetch('data/merch.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(fill).catch(function () { fill({}); });
})();
