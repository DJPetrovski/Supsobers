/* Sup Sobers: tabs, thumbnail wall, video grid, archives, books. No dependencies. */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var ID_RE = /^[\w-]{11}$/;

  function el(tag, attrs, kids) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (kid) { if (kid) node.appendChild(kid); });
    return node;
  }

  function getJSON(path) {
    return fetch(path, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(path + ' ' + r.status);
      return r.json();
    });
  }

  /* ---------- tabs ---------- */
  var views = Array.prototype.slice.call(document.querySelectorAll('[data-view]'));
  var links = Array.prototype.slice.call(document.querySelectorAll('#nav a'));
  var titles = { home: 'Sup Sobers | Sobering Stories', videos: 'Videos | Sup Sobers', archives: 'Archives | Sup Sobers', books: 'Books | Sup Sobers', members: 'Members Only Club | Sup Sobers', merch: 'Merch | Sup Sobers', web: "It's All Connected | Sup Sobers", about: 'About | Sup Sobers' };

  function route() {
    var name = (location.hash || '#home').slice(1);
    if (!titles[name]) name = 'home';
    views.forEach(function (v) { v.hidden = v.getAttribute('data-view') !== name; });
    links.forEach(function (a) {
      if (a.getAttribute('data-route') === name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.title = titles[name];
    window.scrollTo(0, 0);
    document.dispatchEvent(new CustomEvent('ss:route', { detail: { name: name } }));
  }
  window.addEventListener('hashchange', route);

  /* ---------- player ---------- */
  var dlg = $('#player');
  var frame = $('#player-iframe');

  var STOP = 'the a an and or of to in on for with was is are were why did does what who how from that this his her their about into over your you'.split(' ');
  var threads = [];
  function words(t) {
    return (t || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(function (w) { return w.length > 3 && STOP.indexOf(w) < 0; });
  }
  function threadsOf(id) { return threads.filter(function (t) { return t.videos.indexOf(id) >= 0; }); }

  // Videos that share a storyline come first, then videos whose titles share names/keywords.
  function related(v, max) {
    var mine = threadsOf(v.id), myWords = words(v.title), out = [];
    (window.SS.videos || []).forEach(function (o, idx) {
      if (o.id === v.id || !ID_RE.test(o.id || '')) return;
      var shared = mine.filter(function (t) { return t.videos.indexOf(o.id) >= 0; });
      var ow = words(o.title), overlap = myWords.filter(function (w) { return ow.indexOf(w) >= 0; }).length;
      var score = shared.length * 10 + overlap * 2;
      if (shared.length || overlap >= 2) out.push({ v: o, score: score, idx: idx, tag: shared.length ? shared[0].name : 'Similar' });
    });
    out.sort(function (a, b) { return b.score - a.score || a.idx - b.idx; });
    return out.slice(0, max || 8);
  }

  var members = [], manualMembers = [], autoMembers = [], clubCfg = {};
  function memberFor(v) {
    for (var i = 0; i < members.length; i++) if (members[i].publicId === v.id) return members[i];
    return null;
  }
  function memberUrl(m) { return m.patreon || m.url || ('https://www.youtube.com/watch?v=' + m.id); }

  var ptun = null;
  function paintRelated(v) {
    var cta = $('#club-cta'), m = memberFor(v);
    if (cta) { cta.hidden = !m; if (m) { cta.href = memberUrl(m); cta.textContent = m.patreon ? 'Watch the uncensored version on Patreon' : 'Watch the uncensored version (members)'; } }
    var meta = $('#rel-meta');
    if (meta) {
      var bits = [];
      if (v.published) bits.push(new Date(v.published + 'T12:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }));
      if (v.seconds) bits.push(Math.round(v.seconds / 60) + ' min');
      var tn = threadsOf(v.id).filter(function (t) { return !t.auto; }).map(function (t) { return t.title || t.name; }).filter(Boolean);
      if (tn.length) bits.push('Storyline: ' + tn.slice(0, 2).join(', '));
      meta.textContent = bits.join('  |  ');
    }
  }
  // The videos that connect to this one spiral around it in their own tunnel.
  function setTunnel(v) {
    if (!window.HoleTunnel) return;
    var list = [v].concat(related(v, 16).map(function (r) { return r.v; }));
    (window.SS.videos || []).forEach(function (o) { if (list.length < 8 && list.indexOf(o) < 0) list.push(o); });
    if (!ptun) {
      ptun = HoleTunnel.create({ scene: $('#ph-scene'), world: $('#ph-world'), videos: list, titleEl: $('#player-title'), onPick: function (o) { openPlayer(o); } });
    } else ptun.setVideos(list);
    ptun.start({ boost: 400 });
  }

  function openPlayer(v) {
    if (!v || !ID_RE.test(v.id || '')) return;
    paintRelated(v);
    document.dispatchEvent(new Event('ss:playeropen'));
    document.dispatchEvent(new CustomEvent('ss:duck', { detail: { key: 'player', level: 0 } }));
    frame.src = 'https://www.youtube-nocookie.com/embed/' + v.id + '?autoplay=1&rel=0';
    frame.title = v.title || 'Video';
    $('#player-yt').href = 'https://www.youtube.com/watch?v=' + v.id;
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); setTunnel(v); }
    else window.open('https://www.youtube.com/watch?v=' + v.id, '_blank', 'noopener');
  }
  function closePlayer() {
    frame.src = 'about:blank';
    if (dlg.open) dlg.close();
  }
  $('#player-close').addEventListener('click', closePlayer);
  dlg.addEventListener('close', function () {
    frame.src = 'about:blank';
    if (ptun) ptun.stop();
    document.dispatchEvent(new CustomEvent('ss:duck', { detail: { key: 'player', level: null } }));
    document.dispatchEvent(new Event('ss:playerclosed'));
  });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) closePlayer(); });

  window.SS = { videos: [], openPlayer: openPlayer, related: function (v, n) { return related(v, n || 14).map(function (r) { return r.v; }); } };

  /* ---------- tiles ---------- */
  function tile(v, index, hiddenCopy) {
    var real = ID_RE.test(v.id || '');
    var face = real
      ? el('img', { src: 'https://i.ytimg.com/vi/' + v.id + '/hqdefault.jpg', alt: '', loading: 'lazy' })
      : el('div', { 'class': 'ph', text: 'Video ' + (index + 1 < 10 ? '0' : '') + (index + 1) });
    var btn = el('button', { type: 'button', 'class': 'tile', 'aria-label': v.title || 'Video' }, [
      face,
      el('span', { 'class': 'cap', text: v.title || '' })
    ]);
    if (hiddenCopy) { btn.setAttribute('tabindex', '-1'); btn.setAttribute('aria-hidden', 'true'); }
    btn.addEventListener('click', function () {
      if (real) openPlayer(v);
      else window.open('https://www.youtube.com/@Sobersector', '_blank', 'noopener');
    });
    return btn;
  }

  /* ---------- video grid + search ---------- */
  function buildGrid(videos) {
    var grid = $('#video-grid');
    var empty = $('#video-empty');
    var input = $('#search');

    var active = '';
    function paint(list) {
      grid.textContent = '';
      list.forEach(function (v, i) {
        var t = tile(v, i, false);
        if (videos.indexOf(v) < 3) t.appendChild(el('span', { 'class': 'badge-new', text: 'New' }));
        grid.appendChild(t);
      });
      empty.hidden = list.length > 0;
    }
    function apply() {
      var q = input.value.trim().toLowerCase();
      var ids = null;
      threads.forEach(function (t) { if (t.name === active) ids = t.videos; });
      paint(videos.filter(function (v) {
        return (!ids || ids.indexOf(v.id) >= 0) && (!q || (v.title || '').toLowerCase().indexOf(q) !== -1);
      }));
    }
    var chips = $('#thread-chips');
    if (chips && threads.length) {
      chips.textContent = '';
      [{ name: '' }].concat(threads.filter(function (t) { return !t.auto; })).forEach(function (t) {
        var c = el('button', { type: 'button', 'class': 'chip', text: t.name || 'All', 'aria-pressed': String(t.name === active) });
        c.addEventListener('click', function () {
          active = t.name;
          Array.prototype.forEach.call(chips.children, function (x) { x.setAttribute('aria-pressed', String(x === c)); });
          apply();
        });
        chips.appendChild(c);
      });
    }
    apply();
    input.addEventListener('input', apply);
  }

  /* ---------- home: newest + storylines ---------- */
  function buildHome(videos) {
    var row = $('#latest-row'), tr = $('#thread-row');
    if (row) {
      row.textContent = '';
      videos.filter(function (v) { return ID_RE.test(v.id || ''); }).slice(0, 4).forEach(function (v, i) {
        var t = tile(v, i, false);
        t.appendChild(el('span', { 'class': 'badge-new', text: i === 0 ? 'Newest' : 'New' }));
        row.appendChild(t);
      });
    }
    if (tr) {
      tr.textContent = '';
      threads.filter(function (t) { return !t.auto; }).forEach(function (t) {
        var vs = videos.filter(function (v) { return t.videos.indexOf(v.id) >= 0; });
        if (!vs.length) return;
        var b = el('button', { type: 'button', 'class': 'thread-card' }, [
          el('img', { src: 'https://i.ytimg.com/vi/' + vs[0].id + '/mqdefault.jpg', alt: '', loading: 'lazy' }),
          el('span', { 'class': 'thread-name', text: t.name }),
          el('span', { 'class': 'thread-count', text: vs.length + (vs.length === 1 ? ' video' : ' videos') })
        ]);
        b.addEventListener('click', function () { openPlayer(vs[vs.length - 1]); });
        tr.appendChild(b);
      });
    }
  }

  /* ---------- members only club ---------- */
  function buildClub(d) {
    if (d) {
      clubCfg = d;
      manualMembers = (d.videos || []).filter(function (m) { return m.id || m.url || m.patreon; });
    }
    members = manualMembers.concat(autoMembers);
    if (clubCfg.joinYouTube) $('#club-join-yt').href = clubCfg.joinYouTube;
    if (clubCfg.joinPatreon) $('#club-join-pt').href = clubCfg.joinPatreon;
    var grid = $('#club-grid');
    grid.textContent = '';
    $('#club-empty').hidden = members.length > 0;
    members.forEach(function (m) {
      var thumb = m.thumb || ((m.id || m.publicId) ? 'https://i.ytimg.com/vi/' + (m.id || m.publicId) + '/hqdefault.jpg' : '');
      var a = el('a', { 'class': 'tile club-tile', href: memberUrl(m), target: '_blank', rel: 'noopener', 'aria-label': (m.title || 'Members video') + ' (members only)' }, [
        thumb ? el('img', { src: thumb, alt: '', loading: 'lazy' }) : el('div', { 'class': 'ph', text: 'Members' }),
        el('span', { 'class': 'lock', text: m.patreon ? 'On Patreon' : 'Members only' }),
        el('span', { 'class': 'cap', text: m.title || '' })
      ]);
      grid.appendChild(a);
    });
  }

  // A video with "Members Only" in its title goes to the Members Club, paired with its public twin.
  var MEMBER_RE = /[\[(|\-:\s]*\bmembers?[\s-]*only\b[\])|\-:\s]*/ig;
  function norm(t) { return (t || '').replace(MEMBER_RE, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function splitMembers(vids) {
    var pub = [], mem = [];
    vids.forEach(function (v) { (/\bmembers?[\s-]*only\b/i.test(v.title || '') ? mem : pub).push(v); });
    autoMembers = mem.map(function (m) {
      var key = norm(m.title), twin = null, best = 0, kw = key.split(' ');
      pub.forEach(function (p) {
        var pk = norm(p.title);
        if (pk === key) { twin = p; best = 99; return; }
        var pw = pk.split(' '), n = kw.filter(function (w) { return w.length > 3 && pw.indexOf(w) >= 0; }).length;
        if (best < 99 && n > best && n >= Math.max(3, kw.length * 0.6)) { best = n; twin = p; }
      });
      return { id: m.id, title: (m.title || '').replace(MEMBER_RE, ' ').replace(/\s+/g, ' ').trim() || m.title, publicId: twin ? twin.id : '' };
    });
    return pub;
  }

  /* ---------- archives + books ---------- */
  function buildCards(hostSel, items, emptySel) {
    var host = $(hostSel);
    host.textContent = '';
    if (!items.length) { if (emptySel) $(emptySel).hidden = false; return; }
    items.forEach(function (it) {
      var kids = [el('h3', { text: it.title || '' })];
      if (it.meta) kids.push(el('p', { 'class': 'meta', text: it.meta }));
      if (it.description) kids.push(el('p', { text: it.description }));
      if (it.url) {
        kids.push(el('a', { 'class': 'btn btn-primary', href: it.url, target: '_blank', rel: 'noopener', text: it.cta || 'Open' }));
      } else if (it.status) {
        kids.push(el('p', { 'class': 'status', text: it.status }));
      }
      host.appendChild(el('article', { 'class': 'card' }, kids));
    });
  }

  /* ---------- boot ---------- */
  $('#year').textContent = new Date().getFullYear();
  route();

  var threadsReady = getJSON('data/threads.json').then(function (d) { threads = d.threads || []; }).catch(function () {})
    .then(function () { return getJSON('data/web.json'); })
    .then(function (d) {
      // Web storylines also count as connections (a video joins a storyline when its title matches a keyword).
      var all = (window.SS && window.SS.videos) || [];
      window.SS.topicDefs = d.topics || [];
    }).catch(function () {});

  getJSON('data/videos.json').then(function (d) {
    return threadsReady.then(function () { return d; });
  }).then(function (d) {
    var vids = splitMembers((d.videos || []).slice());
    window.SS.videos = vids;
    buildClub();
    (window.SS.topicDefs || []).forEach(function (t) {
      var ids = vids.filter(function (v) {
        var low = (v.title || '').toLowerCase();
        return (t.match || []).some(function (k) { return low.indexOf(k) >= 0; });
      }).map(function (v) { return v.id; });
      if (ids.length > 1) threads.push({ name: t.name, videos: ids, auto: true });
    });
    window.SS.ready = true;
    document.dispatchEvent(new Event('ss:videos'));
    buildGrid(vids);
    buildHome(vids);
  }).catch(function () {
    window.SS.ready = true;
    document.dispatchEvent(new Event('ss:videos'));
    $('#video-empty').textContent = 'Videos could not load. Refresh the page to try again.';
    $('#video-empty').hidden = false;
  });

  getJSON('data/members.json').then(buildClub).catch(function () { buildClub({}); });

  getJSON('data/archives.json').then(function (d) { buildCards('#archive-list', d.archives || []); })
    .catch(function () { buildCards('#archive-list', []); });

  getJSON('data/books.json').then(function (d) { buildCards('#book-list', d.books || [], '#book-empty'); })
    .catch(function () { buildCards('#book-list', [], '#book-empty'); });
})();
