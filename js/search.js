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
    { title: 'Socials', route: 'socials', kw: 'instagram x twitter rumble spotify podcast youtube patreon follow links' },
    { title: 'Kraving Killer', route: 'craving', kw: 'craving corner games game etch a sketch maze craving urge distraction sober sobriety play' },
    { title: 'Contact', route: 'contact', kw: 'email message write laptop reach' },
    { title: 'My Better Half', route: 'half', kw: 'kim fiancee reverie revival colorado tiktok instagram' },
    { title: 'Merch', route: 'merch', kw: 'shirts hoodies hats stickers store shop tee clothing' },
    { title: 'Members Club', route: 'members', kw: 'members only patreon join uncensored off the record' },
    { title: 'Archives', route: 'archives', kw: 'timeline records sources september 10 charlie kirk' },
    { title: 'Books', route: 'books', kw: 'reading library' },
    { title: 'Topic Requests', route: 'topics', kw: 'suggest request vote cover next idea recommend topic submit' },
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
    var t = toks(q), out = { videos: [], merch: [], story: [], pages: [], more: [], ab: [] };
    if (!t.length) return out;
    if (window.SS && SS.smart) out.videos = SS.smart(q, (SS.videos || []).filter(function (v) { return /^[\w-]{11}$/.test(v.id || ''); })).map(function (r) { return { s: r.s, v: r.v, r: r }; });
    else ((window.SS && SS.videos) || []).forEach(function (v) { var s = score(v.title, t); if (s) out.videos.push({ s: s, v: v }); });
    out.videos.sort(function (a, b) { return b.s - a.s; });
    ((window.SS && SS.audiobooks) || []).forEach(function (b) { (b.chapters || []).forEach(function (v) { var s = score(b.title + ' audiobook ' + v.title, t); if (s) out.ab.push({ s: s, b: b, v: v }); }); });
    out.ab.sort(function (a, b) { return b.s - a.s; });
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
  var input = el('input'); input.type = 'search'; input.placeholder = 'Search, or tell Chip what story you want'; input.autocomplete = 'off'; input.setAttribute('aria-label', 'Search the site'); input.enterKeyHint = 'go';
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
  var mods = {};
  function turkeyCard(q) {
    if (!(window.SS && SS.turkey)) return '';
    var words = q.split(/\s+/).filter(Boolean).length, T = SS.turkey.ask(q, mods);
    var show = !q || T.kind === 'greet' || T.kind === 'who' || T.kind === 'help' || T.kind === 'thanks' || T.kind === 'surprise' || T.kind === 'browse' || T.kind === 'answer' || T.link || (T.kind === 'search' && T.picks.length && (words >= 3 || /\?/.test(q))) || (T.kind === 'none' && words >= 3);
    if (!show) return '';
    if (!q) T = SS.turkey.ask('hello', mods);
    var card = el('div', 'ct'), av = el('div', 'ct-av'); av.innerHTML = '<svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#b9462f" stroke="#ffd9a0" stroke-width="2"/><circle cx="24" cy="24" r="17" fill="none" stroke="#ffd9a0" stroke-width="1.5"/><path d="M24 12 36 33H12Z" fill="none" stroke="#ffd9a0" stroke-width="2" stroke-linejoin="round"/><text x="24" y="30" text-anchor="middle" font-size="11" font-weight="700" fill="#ffd9a0" font-family="Archivo,sans-serif">24</text></svg>', body = el('div', 'ct-body');
    var nm = el('b', 'ct-name', T.name); nm.appendChild(el('small', '', ' ' + SS.turkey.tag)); body.appendChild(nm);
    body.appendChild(el('p', 'ct-say', T.text));
    if (T.link) { var lb = el('button', 'ct-chip', T.link.label); lb.type = 'button'; lb.addEventListener('click', function () { closePanel(); go(T.link.route); }); body.appendChild(lb); }
    T.picks.forEach(function (p) {
      var b = el('button', 'gs-row ct-pick'); b.type = 'button'; b.setAttribute('role', 'option');
      var im = el('img'); im.src = 'https://i.ytimg.com/vi/' + p.v.id + '/mqdefault.jpg'; im.alt = ''; im.loading = 'lazy'; b.appendChild(im);
      var tx = el('span', 'gs-tx'); tx.appendChild(el('b', '', p.v.title));
      if (p.why) tx.appendChild(el('small', '', p.why));
      if (p.hook) { var hk = el('small', 'ct-hook', p.hook); tx.appendChild(hk); }
      b.appendChild(tx); b.appendChild(el('span', 'gs-tag', p.mins ? p.mins + ' min' : 'Video'));
      b.addEventListener('click', function () { closePanel(); SS.openPlayer(p.v, p.at); });
      rows.push(b); body.appendChild(b);
    });
    if (T.chips && T.chips.length) {
      var cr = el('div', 'ct-chips');
      T.chips.forEach(function (c) {
        var cb = el('button', 'ct-chip', c.label); cb.type = 'button';
        cb.addEventListener('click', function () { if (c.q) { input.value = c.q; mods = {}; } else { mods = Object.assign({}, mods, c.mod); } render(); input.focus(); });
        cr.appendChild(cb);
      });
      body.appendChild(cr);
    }
    card.appendChild(av); card.appendChild(body); list.appendChild(card);
    return T.kind;
  }
  function render() {
    list.textContent = ''; rows = []; sel = -1;
    var q = input.value.trim(), A = actions();
    var tk = turkeyCard(q);
    if (tk === 'answer') { if (rows.length) hilite(0); return; }   // a direct answer: no need to bury it under a list
    if (!q) {
      var v = ((window.SS && SS.videos) || []).filter(function (x) { return /^[\w-]{11}$/.test(x.id || ''); }).slice(0, 4);
      group('Newest videos', v.map(function (x) { return row('https://i.ytimg.com/vi/' + x.id + '/mqdefault.jpg', x.title, '', 'Video', function () { openVideo(x); }); }));
      group('Jump to', PAGES.map(function (p) { return row('', p.title, '', 'Page', function () { go(p.route); }); }));
    } else {
      var r = search(q);
      var vm = r.videos.filter(function (x) { return !x.r || x.r.kind === 'match'; }), vr = r.videos.filter(function (x) { return x.r && x.r.kind === 'related'; });
      function stamp(t) { var h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), sec = ('0' + Math.floor(t % 60)).slice(-2); return (h ? h + ':' + ('0' + m).slice(-2) : m) + ':' + sec; }
      function mrow(x, m) {
        var b = el('button', 'gs-row gs-moment'); b.type = 'button'; b.setAttribute('role', 'option'); b.title = 'Play from ' + stamp(m.at);
        b.appendChild(el('span', 'gs-at', '\u25B6 ' + stamp(m.at)));
        var tx = el('span', 'gs-q'), pos = 0;
        if (m.pre) tx.appendChild(document.createTextNode('\u2026'));
        m.hits.forEach(function (h) { if (h[0] > pos) tx.appendChild(document.createTextNode(m.text.slice(pos, h[0]))); tx.appendChild(el('mark', '', m.text.slice(h[0], h[1]))); pos = h[1]; });
        tx.appendChild(document.createTextNode(m.text.slice(pos) + (m.post ? '\u2026' : '')));
        b.appendChild(tx);
        b.addEventListener('click', function () { closePanel(); SS.openPlayer(x.v, m.at); });
        rows.push(b); return b;
      }
      function vrow(x) {
        var sub = x.v.members ? 'Members only' : '', rr = x.r, mm = rr && rr.moments && rr.moments.length;
        if (rr) { if (mm) sub = mm + (mm === 1 ? ' place' : ' places') + ' where it is said'; else if (rr.snip) sub = '\u201C\u2026' + rr.snip.slice(0, 90) + '\u2026\u201D ' + (rr.at ? '(' + stamp(rr.at) + ')' : ''); else if (rr.why.length) sub = (sub ? sub + ' \u00B7 ' : '') + rr.why[0]; }
        var out = [row(/^[\w-]{11}$/.test(x.v.id || '') ? 'https://i.ytimg.com/vi/' + x.v.id + '/mqdefault.jpg' : '', x.v.title, sub, 'Video', function () { SS.openPlayer(x.v, mm ? 0 : rr && rr.at); })];
        out[0].setAttribute('data-vid', x.v.id);
        if (mm) rr.moments.forEach(function (m) { out.push(mrow(x, m)); });
        return out;
      }
      function flat(a) { return a.reduce(function (acc, r) { return acc.concat(r); }, []); }
      group('Videos' + (vm.length > 8 ? ' (' + vm.length + ')' : ''), flat(vm.slice(0, 8).map(vrow)));
      group('Related videos and the same storyline', flat(vr.slice(0, 8).map(vrow)));
      group('Audiobooks', r.ab.slice(0, 5).map(function (x) { return row('https://i.ytimg.com/vi/' + x.v.id + '/mqdefault.jpg', x.v.title, x.b.title, 'Audiobook', function () { openVideo(x.v); }); }));
      group('Merch', r.merch.slice(0, 5).map(function (x) { return row((x.m.cutouts && x.m.cutouts[0]) || x.m.images[0], x.m.name, x.m.price + (x.m.soldOut ? ' · sold out' : ''), 'Merch', function () { A.merch(x.i); }); }));
      group('Storylines', r.story.slice(0, 4).map(function (x) { return row('', x.d.name, 'See the videos', 'Story', function () { A.story(x.d); }); }));
      group('Archives and books', r.more.slice(0, 4).map(function (x) { return row('', x.a.title, x.a.meta || '', x.kind, function () { if (x.a.url) window.open(x.a.url, '_blank', 'noopener'); else go(x.kind === 'Book' ? 'books' : 'archives'); }); }));
      group('Pages', r.pages.slice(0, 3).map(function (x) { return row('', x.p.title, '', 'Page', function () { go(x.p.route); }); }));
      if (!rows.length) list.appendChild(el('p', 'gs-none', 'Nothing matches "' + q + '". Try a name, a place, or a word from a title.'));
    }
    if (rows.length) hilite(0);
    if (q && tk !== 'answer') semanticRows(q);
  }

  /* ---------- search by meaning: added under the normal results once the in-browser model is ready ---------- */
  var semHost = null, semTok = 0;
  function semanticRows(q) {
    if (!(window.SS && SS.semantic) || q.split(/\s+/).length < 2 && q.length < 5) return;
    var tok = ++semTok, host = el('div', 'gs-sem'); semHost = host; list.appendChild(host);
    if (SS.semantic.state() !== 'ready') host.appendChild(el('p', 'gs-h gs-sem-wait', 'Search by meaning is warming up…'));
    SS.semantic.query(q).then(function (hits) {
      if (tok !== semTok || panel.hidden || host.parentNode !== list) return;
      host.textContent = '';
      var seen = {}; list.querySelectorAll('.gs-row:not(.ct-pick):not(.gs-moment)').forEach(function (b) { seen[b.getAttribute('data-vid') || ''] = 1; });
      var byV = {}, order = [];
      hits.forEach(function (h) {
        if (h.s < (h.at < 0 ? 0.42 : 0.44)) return;
        var g = byV[h.id]; if (!g) { g = byV[h.id] = { id: h.id, s: h.s, m: [] }; order.push(g); }
        if (h.at >= 0 && g.m.length < 3 && g.m.every(function (m) { return Math.abs(m.at - h.at) >= 60; })) g.m.push(h);
        if (h.s > g.s) g.s = h.s;
      });
      var vids = (SS.videos || []), pick = order.filter(function (g) { return vids.some(function (v) { return v.id === g.id; }); }).slice(0, 6);
      if (!pick.length) return;
      var kids = [];
      pick.forEach(function (g) {
        var v = vids.filter(function (x) { return x.id === g.id; })[0];
        var r = row('https://i.ytimg.com/vi/' + v.id + '/mqdefault.jpg', v.title, g.m.length ? g.m.length + (g.m.length === 1 ? ' moment' : ' moments') + ' that fit' : 'Fits what you asked', 'Video', function () { SS.openPlayer(v, g.m.length ? g.m[0].at : 0); });
        r.setAttribute('data-vid', v.id); kids.push(r);
        var tr = SS.transcript && SS.transcript(v.id);
        g.m.forEach(function (m) {
          var c = tr && tr.filter(function (x) { return x[0] === m.at; })[0], txt = c ? c[1] : '';
          var b = el('button', 'gs-row gs-moment'); b.type = 'button'; b.setAttribute('role', 'option');
          b.appendChild(el('span', 'gs-at', '▶ ' + stampT(m.at)));
          b.appendChild(el('span', 'gs-q', txt ? '…' + txt.slice(0, 170) + (txt.length > 170 ? '…' : '') : 'Play from here'));
          b.addEventListener('click', function () { closePanel(); SS.openPlayer(v, m.at); });
          rows.push(b); kids.push(b);
        });
      });
      host.appendChild(el('p', 'gs-h', 'Also matches by meaning'));
      kids.forEach(function (k) { host.appendChild(k); });
      if (sel < 0) hilite(0);
    });
  }
  function stampT(t) { var h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), sec = ('0' + Math.floor(t % 60)).slice(-2); return (h ? h + ':' + ('0' + m).slice(-2) : m) + ':' + sec; }
  function hilite(i) { if (!rows.length) return; sel = (i + rows.length) % rows.length; rows.forEach(function (r, k) { r.classList.toggle('on', k === sel); r.setAttribute('aria-selected', k === sel ? 'true' : 'false'); }); rows[sel].scrollIntoView({ block: 'nearest' }); }
  var rT = 0; input.addEventListener('input', function () { mods = {}; clearTimeout(rT); rT = setTimeout(render, 90); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); hilite(sel + 1); } else if (e.key === 'ArrowUp') { e.preventDefault(); hilite(sel - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (rows[sel]) rows[sel].click(); } else if (e.key === 'Escape') { e.preventDefault(); closePanel(); }
  });
  close.addEventListener('click', function () { closePanel(); });
  panel.addEventListener('click', function (e) { if (e.target === panel) closePanel(); });
  function openPanel(q) {
    if (window.SS && SS.semantic) SS.semantic.warm();
    lastFocus = document.activeElement; panel.hidden = false; document.documentElement.classList.add('gs-open');
    input.value = q || ''; render(); setTimeout(function () { input.focus(); }, 30);
  }
  function closePanel() { panel.hidden = true; document.documentElement.classList.remove('gs-open'); try { if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  window.SS = window.SS || {}; SS.openSearch = openPanel; SS.closeSearch = closePanel; SS.searchAll = search;
  document.addEventListener('ss:videos', function () { if (!panel.hidden) render(); });
  document.addEventListener('ss:transcripts', function () { if (!panel.hidden) render(); });
  document.addEventListener('ss:semantic', function () { if (!panel.hidden && input.value.trim()) render(); });
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
      var t = toks(inp.value);
      Array.prototype.forEach.call(document.querySelectorAll(inp.getAttribute('data-filter')), function (host) {
        Array.prototype.forEach.call(host.children, function (c) { c.hidden = !!t.length && score(c.textContent, t) === 0; });
      });
    });
    document.addEventListener('ss:videos', function () { inp.dispatchEvent(new Event('input')); });
    document.addEventListener('ss:audiobooks', function () { inp.dispatchEvent(new Event('input')); });
  });
})();
