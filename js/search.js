/* Site search: one panel that finds videos, merch, storylines, archives, books and pages.
   Open it with the magnifier in the menu, the bar on the home page, the Search key on the remote, or the / key. */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function el(t, c, txt) { var e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; }
  var archives = [], books = [], built = false;

  var PAGES = [
    { title: 'Home', route: 'home', kw: 'tv remote trailer channel' },
    { title: 'Videos', route: 'videos', kw: 'episodes rabbit hole tunnel list watch documentary' },
    { title: "It's All Connected", route: 'web', kw: 'web map storylines connections graph' },
    { title: 'Merch', route: 'merch', kw: 'shirts hoodies hats stickers store shop tee clothing' },
    { title: 'Members Club', route: 'members', kw: 'members only patreon join uncensored off the record' },
    { title: 'Archives', route: 'archives', kw: 'timeline records sources september 10 charlie kirk' },
    { title: 'Books', route: 'books', kw: 'reading library' },
    { title: 'About', route: 'about', kw: 'dj petrovski sober sector contact' }
  ];
  function get(path) { return fetch(path, { cache: 'no-cache' }).then(function (r) { return r.json(); }).catch(function () { return {}; }); }
  get('data/archives.json').then(function (d) { archives = d.archives || []; });
  get('data/books.json').then(function (d) { books = d.books || []; });

  function toks(q) { return (q || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean); }
  function score(text, t) {   // every word must appear; earlier + whole-word hits rank higher
    text = (text || '').toLowerCase(); var s = 0;
    for (var i = 0; i < t.length; i++) {
      var k = text.indexOf(t[i]); if (k < 0) return 0;
      s += 10 - Math.min(k / 10, 6) + (new RegExp('\\b' + t[i].replace(/[^a-z0-9]/g, '') ).test(text) ? 4 : 0);
    }
    return s;
  }
  function search(q) {
    var t = toks(q), out = { videos: [], merch: [], story: [], pages: [], more: [] };
    if (!t.length) return out;
    ((window.SS && SS.videos) || []).forEach(function (v) { var s = score(v.title, t); if (s) out.videos.push({ s: s, v: v }); });
    out.videos.sort(function (a, b) { return b.s - a.s; });
    ((window.SS && SS.merch) || []).forEach(function (m, i) { var s = score(m.name + ' ' + (m.store === 'fourthwall' ? 'fourthwall' : 'american patriot'), t); if (s) out.merch.push({ s: s, m: m, i: i }); });
    out.merch.sort(function (a, b) { return b.s - a.s; });
    ((window.SS && SS.topicDefs) || []).forEach(function (d) { var s = score(d.name + ' ' + (d.match || []).join(' '), t); if (s) out.story.push({ s: s, d: d }); });
    PAGES.forEach(function (p) { var s = score(p.title + ' ' + p.kw, t); if (s) out.pages.push({ s: s, p: p }); });
    archives.concat(books).forEach(function (a) { var s = score((a.title || '') + ' ' + (a.meta || '') + ' ' + (a.description || ''), t); if (s) out.more.push({ s: s, a: a, kind: books.indexOf(a) >= 0 ? 'Book' : 'Archive' }); });
    out.more.sort(function (a, b) { return b.s - a.s; });
    return out;
  }

  /* ---------- the panel ---------- */
  var panel = el('div', 'gs'); panel.id = 'gsearch'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'Search the site');
  var box = el('div', 'gs-box'), form = el('label', 'gs-field');
  form.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var input = el('input'); input.type = 'search'; input.placeholder = 'Search videos, merch, storylines, pages'; input.autocomplete = 'off'; input.setAttribute('aria-label', 'Search the site'); input.enterKeyHint = 'go';
  var close = el('button', 'gs-x', 'Esc'); close.type = 'button'; close.setAttribute('aria-label', 'Close search');
  form.appendChild(input); form.appendChild(close);
  var list = el('div', 'gs-list'); list.setAttribute('role', 'listbox');
  box.appendChild(form); box.appendChild(list); panel.appendChild(box); document.body.appendChild(panel);
  var rows = [], sel = -1, lastFocus = null;

  function row(thumb, title, sub, tag, act) {
    var b = el('button', 'gs-row'); b.type = 'button'; b.setAttribute('role', 'option');
    if (thumb) { var im = el('img'); im.src = thumb; im.alt = ''; im.loading = 'lazy'; b.appendChild(im); } else b.appendChild(el('span', 'gs-ico', tag.charAt(0)));
    var tx = el('span', 'gs-tx'); tx.appendChild(el('b', '', title)); if (sub) tx.appendChild(el('small', '', sub)); b.appendChild(tx);
    b.appendChild(el('span', 'gs-tag', tag)); b.addEventListener('click', function () { closePanel(); act(); });
    rows.push(b); return b;
  }
  function group(name, kids) { if (!kids.length) return; list.appendChild(el('p', 'gs-h', name)); kids.forEach(function (k) { list.appendChild(k); }); }
  function go(route) { if (location.hash === '#' + route) { window.scrollTo(0, 0); } else location.hash = route; }
  function openVideo(v) { SS.openPlayer(v); }
  function actions() {
    return {
      story: function (d) { go('videos'); setTimeout(function () { var s = $('#search'); if (s) { s.value = (d.match && d.match[0]) || d.name; s.dispatchEvent(new Event('input', { bubbles: true })); } }, 60); },
      merch: function (i) { go('merch'); setTimeout(function () { if (window.SS && SS.merchGo) SS.merchGo(i); }, 120); }
    };
  }
  function render() {
    list.textContent = ''; rows = []; sel = -1;
    var q = input.value.trim(), A = actions();
    if (!q) {
      var v = ((window.SS && SS.videos) || []).filter(function (x) { return /^[\w-]{11}$/.test(x.id || ''); }).slice(0, 4);
      group('Newest videos', v.map(function (x) { return row('https://i.ytimg.com/vi/' + x.id + '/mqdefault.jpg', x.title, '', 'Video', function () { openVideo(x); }); }));
      group('Jump to', PAGES.map(function (p) { return row('', p.title, '', 'Page', function () { go(p.route); }); }));
    } else {
      var r = search(q);
      group('Videos' + (r.videos.length > 8 ? ' (' + r.videos.length + ')' : ''), r.videos.slice(0, 8).map(function (x) { return row(/^[\w-]{11}$/.test(x.v.id || '') ? 'https://i.ytimg.com/vi/' + x.v.id + '/mqdefault.jpg' : '', x.v.title, x.v.members ? 'Members only' : '', 'Video', function () { openVideo(x.v); }); }));
      group('Merch', r.merch.slice(0, 5).map(function (x) { return row((x.m.cutouts && x.m.cutouts[0]) || x.m.images[0], x.m.name, x.m.price + (x.m.soldOut ? ' · sold out' : ''), 'Merch', function () { A.merch(x.i); }); }));
      group('Storylines', r.story.slice(0, 4).map(function (x) { return row('', x.d.name, 'See the videos', 'Story', function () { A.story(x.d); }); }));
      group('Archives and books', r.more.slice(0, 4).map(function (x) { return row('', x.a.title, x.a.meta || '', x.kind, function () { if (x.a.url) window.open(x.a.url, '_blank', 'noopener'); else go(x.kind === 'Book' ? 'books' : 'archives'); }); }));
      group('Pages', r.pages.slice(0, 3).map(function (x) { return row('', x.p.title, '', 'Page', function () { go(x.p.route); }); }));
      if (!rows.length) list.appendChild(el('p', 'gs-none', 'Nothing matches "' + q + '". Try a name, a place, or a word from a title.'));
    }
    if (rows.length) hilite(0);
  }
  function hilite(i) { if (!rows.length) return; sel = (i + rows.length) % rows.length; rows.forEach(function (r, k) { r.classList.toggle('on', k === sel); r.setAttribute('aria-selected', k === sel ? 'true' : 'false'); }); rows[sel].scrollIntoView({ block: 'nearest' }); }
  var rT = 0; input.addEventListener('input', function () { clearTimeout(rT); rT = setTimeout(render, 90); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); hilite(sel + 1); } else if (e.key === 'ArrowUp') { e.preventDefault(); hilite(sel - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (rows[sel]) rows[sel].click(); } else if (e.key === 'Escape') { e.preventDefault(); closePanel(); }
  });
  close.addEventListener('click', function () { closePanel(); });
  panel.addEventListener('click', function (e) { if (e.target === panel) closePanel(); });
  function openPanel(q) {
    lastFocus = document.activeElement; panel.hidden = false; document.documentElement.classList.add('gs-open');
    input.value = q || ''; render(); setTimeout(function () { input.focus(); }, 30);
  }
  function closePanel() { panel.hidden = true; document.documentElement.classList.remove('gs-open'); try { if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  window.SS = window.SS || {}; SS.openSearch = openPanel; SS.closeSearch = closePanel;
  document.addEventListener('ss:videos', function () { if (!panel.hidden) render(); });
  document.addEventListener('ss:merch', function () { if (!panel.hidden) render(); });

  var nb = $('#nav-search'), hb = $('#home-search');
  if (nb) nb.addEventListener('click', function () { openPanel(); });
  if (hb) hb.addEventListener('click', function () { openPanel(); });
  document.addEventListener('keydown', function (e) {
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(tag) && !e.metaKey && !e.ctrlKey && panel.hidden) { e.preventDefault(); openPanel(); }
    else if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (panel.hidden) openPanel(); else closePanel(); }
  });

  /* ---------- a search box on each page: filters that page's cards ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('input[data-filter]'), function (inp) {
    inp.addEventListener('input', function () {
      var host = $(inp.getAttribute('data-filter')), t = toks(inp.value); if (!host) return;
      Array.prototype.forEach.call(host.children, function (c) { c.hidden = !!t.length && score(c.textContent, t) === 0; });
    });
    document.addEventListener('ss:videos', function () { inp.dispatchEvent(new Event('input')); });
  });
})();
