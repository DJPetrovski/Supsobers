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
  var titles = { home: 'Sup Sobers | Sobering Stories', videos: 'Videos | Sup Sobers', archives: 'Archives | Sup Sobers', books: 'Books | Sup Sobers', members: 'Members Only Club | Sup Sobers', about: 'About | Sup Sobers' };

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

  var members = [];
  function memberFor(v) {
    for (var i = 0; i < members.length; i++) if (members[i].publicId === v.id) return members[i];
    return null;
  }
  function memberUrl(m) { return m.url || ('https://www.youtube.com/watch?v=' + m.id); }

  function paintRelated(v) {
    var cta = $('#club-cta'), m = memberFor(v);
    if (cta) { cta.hidden = !m; if (m) cta.href = memberUrl(m); }
    var box = $('#related'), row = $('#related-row');
    if (!box) return;
    row.textContent = '';
    var list = related(v, 8);
    box.hidden = !list.length;
    list.forEach(function (r) {
      var b = el('button', { type: 'button', 'class': 'rel', 'aria-label': r.v.title }, [
        el('img', { src: 'https://i.ytimg.com/vi/' + r.v.id + '/mqdefault.jpg', alt: '', loading: 'lazy' }),
        el('span', { 'class': 'rel-tag', text: r.tag }),
        el('span', { 'class': 'rel-title', text: r.v.title })
      ]);
      b.addEventListener('click', function () { openPlayer(r.v); $('#player').scrollTop = 0; });
      row.appendChild(b);
    });
  }

  function openPlayer(v) {
    if (!v || !ID_RE.test(v.id || '')) return;
    paintRelated(v);
    frame.src = 'https://www.youtube-nocookie.com/embed/' + v.id + '?autoplay=1&rel=0';
    frame.title = v.title || 'Video';
    $('#player-yt').href = 'https://www.youtube.com/watch?v=' + v.id;
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else window.open('https://www.youtube.com/watch?v=' + v.id, '_blank', 'noopener');
  }
  function closePlayer() {
    frame.src = 'about:blank';
    if (dlg.open) dlg.close();
  }
  $('#player-close').addEventListener('click', closePlayer);
  dlg.addEventListener('close', function () {
    frame.src = 'about:blank';
    document.dispatchEvent(new Event('ss:playerclosed'));
  });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) closePlayer(); });

  window.SS = { videos: [], openPlayer: openPlayer };

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
      [{ name: '' }].concat(threads).forEach(function (t) {
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
      threads.forEach(function (t) {
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
    members = (d.videos || []).filter(function (m) { return m.id || m.url; });
    if (d.joinYouTube) $('#club-join-yt').href = d.joinYouTube;
    if (d.joinPatreon) $('#club-join-pt').href = d.joinPatreon;
    var grid = $('#club-grid');
    grid.textContent = '';
    $('#club-empty').hidden = members.length > 0;
    members.forEach(function (m) {
      var thumb = m.thumb || (m.id ? 'https://i.ytimg.com/vi/' + m.id + '/hqdefault.jpg' : '');
      var a = el('a', { 'class': 'tile club-tile', href: memberUrl(m), target: '_blank', rel: 'noopener', 'aria-label': (m.title || 'Members video') + ' (members only)' }, [
        thumb ? el('img', { src: thumb, alt: '', loading: 'lazy' }) : el('div', { 'class': 'ph', text: 'Members' }),
        el('span', { 'class': 'lock', text: 'Members only' }),
        el('span', { 'class': 'cap', text: m.title || '' })
      ]);
      grid.appendChild(a);
    });
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

  var threadsReady = getJSON('data/threads.json').then(function (d) { threads = d.threads || []; }).catch(function () {});

  getJSON('data/videos.json').then(function (d) {
    return threadsReady.then(function () { return d; });
  }).then(function (d) {
    var vids = (d.videos || []).slice();
    window.SS.videos = vids;
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
