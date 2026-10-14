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
  var titles = { home: 'Sup Sobers | Sobering Stories', videos: 'Videos | Sup Sobers', archives: 'Archives | Sup Sobers', books: 'Books | Sup Sobers', members: 'Members Only Club | Sup Sobers', merch: 'Merch | Sup Sobers', socials: 'Socials | Sup Sobers', half: 'My Better Half | Sup Sobers', contact: 'Contact | Sup Sobers', craving: 'Kraving Killer | Sup Sobers', web: "It's All Connected | Sup Sobers", about: 'About | Sup Sobers' };

  function route() {
    var name = (location.hash || '#home').slice(1);
    if (!titles[name]) name = 'home';
    var shown = name === 'half' ? 'socials' : name;      // #half is the Socials page, scrolled to Kim's links
    views.forEach(function (v) { v.hidden = v.getAttribute('data-view') !== shown; });
    links.forEach(function (a) {
      if (a.getAttribute('data-route') === shown) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.title = titles[name];
    window.scrollTo(0, 0);
    if (name === 'half') setTimeout(function () { var k = document.getElementById('sc-kim'); if (k && !k.hidden) k.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120);
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
    window.SS.now = v;
    paintRelated(v);
    document.dispatchEvent(new Event('ss:playeropen'));
    document.dispatchEvent(new CustomEvent('ss:duck', { detail: { key: 'player', level: 0 } }));
    frame.src = 'https://www.youtube-nocookie.com/embed/' + v.id + '?autoplay=1&rel=0&playsinline=1&enablejsapi=1&origin=' + encodeURIComponent(location.origin);
    // phones sometimes show a play button instead of starting: nudge it a few times
    frame.onload = function () { [300, 1200, 2600].forEach(function (ms) { setTimeout(function () { if (!dlg.open || window.SS.now !== v) return; try { frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*'); } catch (e) {} }, ms); }); };
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
    frame.onload = null; frame.src = 'about:blank';
    if (ptun) ptun.stop();
    document.dispatchEvent(new CustomEvent('ss:duck', { detail: { key: 'player', level: null } }));
    window.SS.now = null;
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
      // every storyline: the hand-made ones plus every topic on the "It's all connected" map, merged by name
      var seenNames = {}, all = [];
      threads.forEach(function (t) {
        var k = (t.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), vs = videos.filter(function (v) { return t.videos.indexOf(v.id) >= 0; });
        if (!vs.length || (t.auto && vs.length < 2)) return;
        if (seenNames[k]) { if (vs.length > seenNames[k].vs.length) seenNames[k].vs = vs; return; }
        seenNames[k] = { t: t, vs: vs }; all.push(seenNames[k]);
      });
      all.sort(function (a, b) { return b.vs.length - a.vs.length; });
      all.forEach(function (o) {
        var t = o.t, vs = o.vs;
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

  /* ---------- audiobooks: pulled out of the video list, shown on the Books page ---------- */
  var abConfig = [];
  function splitAudiobooks(vids) {
    var rest = [];
    abConfig.forEach(function (b) { b.chapters = []; });
    vids.forEach(function (v) {
      var low = (v.title || '').toLowerCase().replace(/\s+/g, ' '), hit = null;
      abConfig.forEach(function (b) { if (!hit && (b.match || []).some(function (k) { return low.indexOf(k) >= 0; })) hit = b; });
      if (hit) hit.chapters.push(v); else rest.push(v);
    });
    abConfig.forEach(function (b) {
      b.chapters.sort(function (a, c) { return (a.published || '').localeCompare(c.published || '') || (a.title || '').localeCompare(c.title || ''); });
    });
    window.SS.audiobooks = abConfig;
    buildAudiobooks();
    return rest;
  }
  function fmtDur(sec) { var h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return h ? h + ' hr ' + (m < 10 ? '0' : '') + m + ' min' : m + ' min'; }
  function chapterLabel(b, v) {
    var t = (v.title || '').replace(/\s+/g, ' ').trim(), m = t.match(/(forward\s*&\s*chapter\s*\d+|chapter\s*\d+)\s*:?\s*(.*)$/i);
    if (m) return m[1].replace(/\b\w/g, function (c) { return c.toUpperCase(); }) + (m[2] ? ': ' + m[2] : '');
    return b.chapters.length > 1 ? t : 'Listen to the full audiobook';
  }
  function buildAudiobooks() {
    var host = $('#ab-list'); if (!host) return;
    host.textContent = '';
    abConfig.filter(function (b) { return b.chapters.length; }).forEach(function (b) {
      var first = b.chapters[0], total = b.chapters.reduce(function (n, v) { return n + (v.seconds || 0); }, 0);
      var play = function (v) { openPlayer(v); };
      var kids = [
        el('button', { type: 'button', 'class': 'ab-cover', 'aria-label': 'Play ' + b.title }, [
          el('img', { src: 'https://i.ytimg.com/vi/' + first.id + '/hqdefault.jpg', alt: '', loading: 'lazy' }),
          el('span', { 'class': 'ab-play', text: '\u25B6' })]),
        el('h3', { text: b.title }),
        el('p', { 'class': 'meta', text: 'Audiobook \u00B7 ' + (b.chapters.length > 1 ? b.chapters.length + ' parts \u00B7 ' : '') + fmtDur(total) }),
        el('p', { text: b.blurb || '' })
      ];
      kids[0].addEventListener('click', function () { play(first); });
      var ul = el('ul', { 'class': 'ab-chapters' });
      b.chapters.forEach(function (v) {
        var li = el('li'), btn = el('button', { type: 'button' }, [el('span', { text: chapterLabel(b, v) }), el('em', { text: fmtDur(v.seconds || 0) })]);
        btn.addEventListener('click', function () { play(v); });
        li.appendChild(btn); ul.appendChild(li);
      });
      kids.push(ul);
      host.appendChild(el('article', { 'class': 'card ab-card' }, kids));
    });
    document.dispatchEvent(new Event('ss:audiobooks'));
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
        var ext = /^https?:/.test(it.url);
        kids.push(el('a', ext ? { 'class': 'btn btn-primary', href: it.url, target: '_blank', rel: 'noopener', text: it.cta || 'Open' } : { 'class': 'btn btn-primary', href: it.url, text: it.cta || 'Open' }));
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

  var abReady = getJSON('data/audiobooks.json').then(function (d) { abConfig = d.audiobooks || []; }).catch(function () {});
  getJSON('data/videos.json').then(function (d) {
    return abReady.then(function () { return threadsReady; }).then(function () { return d; });
  }).then(function (d) {
    return d;
  }).then(function (d) {
    var vids = splitMembers((d.videos || []).slice());
    vids = splitAudiobooks(vids);
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

  getJSON('data/books.json').then(function (d) { var b = d.books || []; $('#book-shelf').hidden = !b.length; $('#book-list').hidden = !b.length; buildCards('#book-list', b, ''); })
    .catch(function () { buildCards('#book-list', [], '#book-empty'); });
})();

/* ---------- socials: a bank of channels ---------- */
(function () {
  var host = document.getElementById('sc-bank'); if (!host) return;

  var LOGO = {
    youtube: '<svg viewBox="0 0 24 24"><rect x="2" y="5.5" width="20" height="13" rx="4" fill="#e62117"/><path d="M10 9.2v5.6l5-2.8z" fill="#fff"/></svg>',
    patreon: '<img src="img/social/patreon.png" alt="" style="filter:invert(0)">',
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1" fill="#fff" stroke="none"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M4 3.5h4.6l11.4 17h-4.6z" fill="#fff"/><path d="M19.2 3.5 13 10.6M4.8 20.5l6.2-7.1" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>',
    rumble: '<img src="img/social/rumble.png" alt="">',
    spotify: '<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round"><circle cx="12" cy="12" r="10" fill="#1db954"/><path d="M6.6 9.4c3.8-1.1 8-.7 11.3 1.2M7.2 12.5c3.2-.9 6.6-.5 9.5 1.1M7.9 15.3c2.6-.7 5.2-.4 7.5.9" stroke="#000" stroke-width="1.8"/></svg>',
    discord: '<svg viewBox="0 0 24 24"><path d="M5.2 6.2c1.9-1 3.7-1.5 3.7-1.5l.5 1.1c1.5-.2 3.2-.2 4.7 0l.5-1.1s1.8.5 3.7 1.5c1.9 3.1 2.9 6.4 2.7 10.2-1.6 1.2-3.1 1.8-4.5 2.2l-1-1.7c.6-.2 1.1-.5 1.6-.8-.1-.1-.3-.2-.4-.3-2.8 1.2-5.8 1.2-8.6 0-.1.1-.3.2-.4.3.5.3 1 .6 1.6.8l-1 1.7c-1.4-.4-2.9-1-4.5-2.2-.2-3.8.8-7.1 2.700-10.200z" fill="#5865F2"/><ellipse cx="9" cy="12.4" rx="1.3" ry="1.5" fill="#fff"/><ellipse cx="15" cy="12.4" rx="1.3" ry="1.5" fill="#fff"/></svg>',
    soundcloud: '<svg viewBox="0 0 24 24"><path fill="#ff5500" d="M2 14.5v3M4.5 12.5v5M7 11v6.500M9.500 10.200v7.300M12 8.800v8.700h7.200a3.200 3.200 0 0 0 .5-6.300 5 5 0 0 0-7.700-2.400z" stroke="#ff5500" stroke-width="1.600" stroke-linecap="round"/><path d="M12 8.800v8.700h7.200a3.200 3.200 0 0 0 .5-6.300 5 5 0 0 0-7.700-2.400z" fill="#ff5500"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24"><path d="M14 3v11.2a3.4 3.4 0 1 1-3.4-3.4" fill="none" stroke="#25f4ee" stroke-width="2.6" stroke-linecap="round" transform="translate(-.9 .6)"/><path d="M14 3v11.2a3.4 3.4 0 1 1-3.4-3.4" fill="none" stroke="#fe2c55" stroke-width="2.6" stroke-linecap="round" transform="translate(.9 -.6)"/><path d="M14 3v11.2a3.4 3.4 0 1 1-3.4-3.4M14 3c.4 2.400 2.100 4.100 4.500 4.300" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>'
  };
  function card(s, i) {
    var a = document.createElement('a');
    a.className = 'sc-ch'; a.href = s.url; a.target = '_blank'; a.rel = 'noopener';
    a.setAttribute('aria-label', s.name + (s.handle ? ' ' + s.handle : ''));
    var n = (i + 1 < 10 ? '0' : '') + (i + 1);
    a.innerHTML = '<span class="sc-num">CH ' + n + '</span><span class="sc-screen"><b class="sc-mark"></b></span><span class="sc-name"></span><span class="sc-handle"></span><span class="sc-blurb"></span><span class="sc-go">Tune in \u2192</span>';
    var mk = a.querySelector('.sc-mark'), lg = LOGO[(s.name || '').toLowerCase()];
    if (lg) { mk.innerHTML = lg; mk.classList.add('logo'); } else mk.textContent = s.mark || s.name.slice(0, 2).toUpperCase();
    a.querySelector('.sc-name').textContent = s.name;
    a.querySelector('.sc-handle').textContent = s.handle || '';
    a.querySelector('.sc-blurb').textContent = s.blurb || '';
    a.style.setProperty('--d', (i * 70) + 'ms');
    return a;
  }
  fetch('data/socials.json').then(function (r) { return r.json(); }).then(function (d) {
    var list = (d.socials || []).filter(function (s) { return s.url; });
    window.SS = window.SS || {}; window.SS.socials = list;
    list.forEach(function (s, i) { host.appendChild(card(s, i)); });
    var k = d.kim;
    if (k && (k.links || []).length) {
      document.getElementById('kim-title').textContent = k.title || k.name;
      document.getElementById('kim-blurb').textContent = k.blurb || '';
      var kb = document.getElementById('kim-bank'); kb.textContent = '';
      k.links.forEach(function (s, i) { kb.appendChild(card(s, i)); });
      document.getElementById('sc-kim').hidden = false;
    }
    document.dispatchEvent(new Event('ss:socials'));
  }).catch(function () {});
})();

/* ---------- contact: the laptop opens when the page is shown; the form posts to the site's inbox ---------- */
(function () {
  var lap = document.getElementById('laptop'), form = document.getElementById('contact-form');
  if (!lap || !form) return;
  var to = 'supsobers@gmail.com', st = document.getElementById('contact-status'), btn = document.getElementById('contact-send');
  document.addEventListener('ss:route', function (e) {
    if (e.detail.name === 'contact') { lap.classList.remove('open'); void lap.offsetWidth; setTimeout(function () { lap.classList.add('open'); }, 250); }
    else lap.classList.remove('open');
  });
  if ((location.hash || '') === '#contact') setTimeout(function () { lap.classList.add('open'); }, 300);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = form.elements, name = f.name.value.trim(), email = f.email.value.trim(), msg = f.message.value.trim(), subj = f.subject.value.trim() || 'Message from supsobers.com';
    if (f._honey.value) return;
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !msg) { st.textContent = 'Fill in your name, a valid email and a message.'; st.className = 'lp-status bad'; return; }
    btn.disabled = true; st.className = 'lp-status'; st.textContent = 'Sending...';
    fetch('https://formsubmit.co/ajax/' + to, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ name: name, email: email, subject: subj, message: msg, _subject: 'supsobers.com: ' + subj, _replyto: email, _captcha: 'false', _template: 'table' })
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || j.success === 'false' || j.success === false) throw new Error('x'); }); })
      .then(function () { st.className = 'lp-status ok'; st.textContent = 'Sent. Thank you, I will get back to you.'; form.reset(); })
      .catch(function () {
        st.className = 'lp-status bad'; st.innerHTML = '';
        st.appendChild(document.createTextNode('Could not send from here. '));
        var a = document.createElement('a'); a.href = 'mailto:' + to + '?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(msg + '\n\n' + name + ' (' + email + ')'); a.textContent = 'Email me instead'; st.appendChild(a);
      }).then(function () { btn.disabled = false; });
  });
})();

/* the laptop's keyboard: rows of keys, built once */
(function () {
  var host = document.getElementById('lp-keys'); if (!host) return;
  var rows = [[1,1,1,1,1,1,1,1,1,1,1,1,1,1.5], [1.5,1,1,1,1,1,1,1,1,1,1,1,1,1], [1.8,1,1,1,1,1,1,1,1,1,1,1,2.2], [2.3,1,1,1,1,1,1,1,1,1,1,2.7], [1.3,1.3,1.3,6,1.3,1.3,1.3]];
  rows.forEach(function (r, i) {
    var row = document.createElement('div'); row.className = 'lp-krow' + (i === 0 ? ' fn' : '');
    r.forEach(function (w) { var k = document.createElement('i'); k.style.flexGrow = w; row.appendChild(k); });
    host.appendChild(row);
  });
})();
