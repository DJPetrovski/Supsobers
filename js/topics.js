/* Topic requests: visitors suggest what DJ should cover next and vote. The list updates for everyone.
   Data lives in a free Supabase table (supabase/topics.sql); this file only talks to it through its public API.
   New suggestions wait for DJ's approval. When a topic is covered it moves to "Covered" with a link to the video. */
(function () {
  'use strict';
  var root = document.getElementById('tp'); if (!root) return;
  function $(s, r) { return (r || root).querySelector(s); }
  function el(t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  var cfg = {}, api = null, topics = [], voted = store('ss-voted') || {}, tab = 'open', sort = 'az', query = '', demo = /[?&]topics=demo/.test(location.search + location.hash);
  var voter = store('ss-voter'); if (!voter) { voter = (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2) + 'xxxxxxxx'); store('ss-voter', voter); }

  /* ---------- the two backends: Supabase, and a local demo so the page can be previewed ---------- */
  function supa(c) {
    function call(path, o) {
      o = o || {}; var h = { apikey: c.anonKey, Authorization: 'Bearer ' + c.anonKey, 'Content-Type': 'application/json' }; if (o.prefer) h.Prefer = o.prefer;
      return fetch(c.supabaseUrl.replace(/\/$/, '') + '/rest/v1/' + path, { method: o.method || 'GET', headers: h, body: o.body ? JSON.stringify(o.body) : undefined }).then(function (r) {
        if (r.status === 204 || (o.prefer === 'return=minimal' && r.ok)) return null;
        return r.json().catch(function () { return null; }).then(function (d) { if (!r.ok) { var e = new Error((d && (d.message || d.hint)) || ('HTTP ' + r.status)); e.code = d && d.code; throw e; } return d; });
      });
    }
    return {
      list: function () { return call('topics?select=id,title,note,status,votes,boost,video_id,covered_at&status=in.(approved,covered)&order=title.asc&limit=2000'); },
      submit: function (title, note) { return call('topics', { method: 'POST', prefer: 'return=minimal', body: { title: title, note: note || null } }); },
      vote: function (id) { return call('rpc/cast_vote', { method: 'POST', body: { p_topic: id, p_voter: voter } }); },
      unvote: function (id) { return call('rpc/remove_vote', { method: 'POST', body: { p_topic: id, p_voter: voter } }); }
    };
  }
  function mock() {
    var K = 'ss-topics-demo', seed = [
      { id: 'd1', title: 'Heath Ledger', note: 'What really happened in his last months', status: 'approved', votes: 41, boost: 0 }, { id: 'd2', title: 'Anna Nicole Smith', note: '', status: 'approved', votes: 27, boost: 10 },
      { id: 'd3', title: 'Corey Haim and Corey Feldman', note: '', status: 'approved', votes: 63, boost: 0 }, { id: 'd4', title: 'The Death of Chester Bennington', note: '', status: 'approved', votes: 18, boost: 0 },
      { id: 'd5', title: 'Aaron Carter', note: '', status: 'covered', votes: 88, boost: 0, video_id: (window.SS && SS.videos && SS.videos[0] && SS.videos[0].id) || '', covered_at: '2026-09-01' }
    ];
    function all() { return store(K) || (store(K, seed), seed); }
    return {
      list: function () { return Promise.resolve(all()); },
      submit: function (t, n) { return Promise.resolve(null); },
      vote: function (id) { var a = all(); a.forEach(function (x) { if (x.id === id) x.votes++; }); store(K, a); return Promise.resolve(total(a.filter(function (x) { return x.id === id; })[0])); },
      unvote: function (id) { var a = all(); a.forEach(function (x) { if (x.id === id) x.votes--; }); store(K, a); return Promise.resolve(total(a.filter(function (x) { return x.id === id; })[0])); }
    };
  }

  /* ---------- helpers ---------- */
  function norm(s) { return (s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function words(s) { return norm(s).split(' ').filter(function (w) { return w.length > 1 && !/^(the|of|and|a|an|to|in|on|for|about|death|story|case|what|really|happened|who|is|was)$/.test(w); }); }
  function total(t) { return (t.votes || 0) + (t.boost || 0); }
  function videoById(id) { var v = (window.SS && (SS.allVideos || SS.videos)) || []; for (var i = 0; i < v.length; i++) if (v[i].id === id) return v[i]; return null; }
  function watch(t) { var v = videoById(t.video_id); if (window.SS && SS.openPlayer && v) SS.openPlayer(v); else if (t.video_id) window.open('https://www.youtube.com/watch?v=' + encodeURIComponent(t.video_id), '_blank', 'noopener'); }
  function similarTopics(q) {
    var qw = words(q); if (!qw.length) return [];
    return topics.filter(function (t) { var tw = words(t.title), hit = qw.filter(function (w) { return tw.indexOf(w) >= 0; }).length; return hit && hit >= Math.min(qw.length, tw.length) * 0.67; }).slice(0, 3);
  }
  // A suggestion that is (nearly) the same as something already listed is refused, and the visitor is pointed at the vote button instead.
  function tkey(s) { return norm(s).replace(/^the /, '').replace(/ /g, ''); }
  function dupOf(q) {
    var k = tkey(q); if (k.length < 3) return null;
    for (var i = 0; i < topics.length; i++) {
      var tk = tkey(topics[i].title); if (!tk) continue;
      if (tk === k) return topics[i];
      var lo = Math.min(tk.length, k.length), hi = Math.max(tk.length, k.length);
      if (lo >= 6 && lo / hi >= 0.6 && (tk.indexOf(k) >= 0 || k.indexOf(tk) >= 0)) return topics[i];
      var a = words(q), b = words(topics[i].title);   // same people or words in a different order
      if (a.length >= 2 && b.length >= 2 && a.length === b.length && a.every(function (w) { return b.indexOf(w) >= 0; })) return topics[i];
    }
    return null;
  }
  function similarVideos(q) {
    if (!(window.SS && SS.smart && SS.videos) || words(q).length === 0) return [];
    try { return SS.smart(q, (SS.allVideos || SS.videos).filter(function (v) { return /^[\w-]{11}$/.test(v.id || ''); })).filter(function (r) { return r.kind === 'match' && r.s >= 10; }).slice(0, 3).map(function (r) { return r.v; }); } catch (e) { return []; }
  }

  /* ---------- drawing ---------- */
  var listEl = $('#tp-list'), statusEl = $('#tp-status'), countEl = $('#tp-count');
  function sorted(arr) {
    var a = arr.slice(); if (sort === 'votes') a.sort(function (x, y) { return total(y) - total(x) || x.title.localeCompare(y.title); }); else a.sort(function (x, y) { return x.title.localeCompare(y.title, undefined, { sensitivity: 'base' }); });
    return a;
  }
  function draw() {
    listEl.textContent = '';
    var open = topics.filter(function (t) { return t.status === 'approved'; }), done = topics.filter(function (t) { return t.status === 'covered'; });
    $('#tp-tab-open').textContent = 'Vote (' + open.length + ')'; $('#tp-tab-done').textContent = 'Covered (' + done.length + ')';
    var q = norm(query), src = tab === 'open' ? open : done;
    if (q) src = src.filter(function (t) { return norm(t.title + ' ' + (t.note || '')).indexOf(q) >= 0; });
    src = sorted(src);
    if (!src.length) { listEl.appendChild(el('p', 'tp-empty', q ? 'Nothing matches that. Suggest it below.' : tab === 'open' ? 'No ideas yet. Be the first to suggest one.' : 'Nothing covered yet. Topics land here once the video is up.')); return; }
    var lastLetter = '';
    src.forEach(function (t) {
      if (sort === 'az') { var L = (t.title.charAt(0) || '#').toUpperCase(); if (!/[A-Z]/.test(L)) L = '#'; if (L !== lastLetter) { lastLetter = L; listEl.appendChild(el('h3', 'tp-letter', L)); } }
      var row = el('div', 'tp-row' + (voted[t.id] ? ' on' : '') + (t.status === 'covered' ? ' done' : ''));
      if (t.status === 'approved') {
        var b = el('button', 'tp-vote'); b.type = 'button'; b.setAttribute('aria-pressed', voted[t.id] ? 'true' : 'false'); b.setAttribute('aria-label', (voted[t.id] ? 'Remove your vote for ' : 'Vote for ') + t.title);
        b.appendChild(el('span', 'tp-arrow', '▲')); b.appendChild(el('b', '', String(total(t)))); b.addEventListener('click', function () { toggle(t, b); }); row.appendChild(b);
      } else { var c = el('div', 'tp-vote tp-final'); c.appendChild(el('span', 'tp-arrow', '✓')); c.appendChild(el('b', '', String(total(t)))); row.appendChild(c); }
      var tx = el('div', 'tp-tx'), h = el('b', 'tp-title', t.title); if (t.boost > 0 && t.status === 'approved') h.appendChild(el('span', 'tp-badge', '⚡ boosted')); tx.appendChild(h);
      if (t.note) tx.appendChild(el('small', '', t.note)); row.appendChild(tx);
      if (t.status === 'covered' && t.video_id) { var w = el('button', 'pill tp-watch', 'Watch'); w.type = 'button'; w.addEventListener('click', function () { watch(t); }); row.appendChild(w); }
      if (t.status === 'approved' && cfg.boostUrl) { var bo = el('a', 'tp-boost', 'Boost'); bo.href = cfg.boostUrl; bo.target = '_blank'; bo.rel = 'noopener'; bo.title = 'Add ' + (cfg.boostVotes || 10) + ' votes (' + (cfg.boostPrice || '') + ')'; row.appendChild(bo); }
      listEl.appendChild(row);
    });
  }
  function toggle(t, btn) {
    var had = !!voted[t.id]; if (btn.disabled) return; btn.disabled = true;
    (had ? api.unvote(t.id) : api.vote(t.id)).then(function (n) {
      if (had) delete voted[t.id]; else voted[t.id] = 1; store('ss-voted', voted); if (typeof n === 'number') t.votes = n - (t.boost || 0);
      draw();
    }).catch(function (e) { btn.disabled = false; say(/slow/i.test(e.message) ? 'Slow down a little, then try again.' : 'Could not save your vote. Try again.'); });
  }
  function say(m) { statusEl.textContent = m; statusEl.hidden = !m; clearTimeout(say.t); if (m) say.t = setTimeout(function () { statusEl.hidden = true; }, 6000); }

  function load() { return api.list().then(function (d) { topics = (d || []).filter(function (t) { return t && t.title; }); draw(); }).catch(function () { listEl.textContent = ''; listEl.appendChild(el('p', 'tp-empty', 'Could not load the list. Try again in a moment.')); }); }

  /* ---------- suggest form with a check for what is already covered or already asked ---------- */
  var form = $('#tp-form'), ti = form.elements.title, ni = form.elements.note, hint = $('#tp-hint'), sub = $('#tp-submit');
  function checkHint() {
    hint.textContent = ''; var q = ti.value.trim(); if (q.length < 3) return;
    var vids = similarVideos(q), sim = similarTopics(q);
    if (vids.length) { var p = el('p', 'tp-h1', 'Already on the channel:'); hint.appendChild(p); vids.forEach(function (v) { var b = el('button', 'tp-link', v.title); b.type = 'button'; b.addEventListener('click', function () { SS.openPlayer(v); }); hint.appendChild(b); }); }
    if (sim.length) { hint.appendChild(el('p', 'tp-h1', 'Already suggested, so vote for it instead:')); sim.forEach(function (t) { hint.appendChild(topicHit(t)); }); }
  }
  function topicHit(t) {   // a line in the hint box: open it in the list, or vote right there
    var line = el('span', 'tp-hit'), b = el('button', 'tp-link', t.title + (t.status === 'covered' ? ' (covered)' : ' · ' + total(t) + ' votes')); b.type = 'button';
    b.addEventListener('click', function () { setTab(t.status === 'covered' ? 'done' : 'open'); query = norm(t.title); $('#tp-q').value = t.title; draw(); listEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    line.appendChild(b);
    if (t.status === 'approved' && !voted[t.id]) { var v = el('button', 'pill tp-quick', 'Vote'); v.type = 'button'; v.addEventListener('click', function () { v.disabled = true; api.vote(t.id).then(function (n) { voted[t.id] = 1; store('ss-voted', voted); if (typeof n === 'number') t.votes = n - (t.boost || 0); draw(); checkHint(); say('Got your vote for ' + t.title + '.'); }).catch(function () { v.disabled = false; say('Could not save your vote. Try again.'); }); }); line.appendChild(v); }
    else if (t.status === 'approved') line.appendChild(el('small', 'tp-voted', 'You voted ✓'));
    return line;
  }
  var hT = 0; ti.addEventListener('input', function () { clearTimeout(hT); hT = setTimeout(checkHint, 250); });
  document.addEventListener('ss:videos', checkHint);
  form.addEventListener('submit', function (e) {
    e.preventDefault(); if (form.elements.website.value) return;   // a hidden field only bots fill in
    var t = ti.value.replace(/\s+/g, ' ').trim(), n = ni.value.trim();
    if (t.length < 3 || t.length > 80) { say('Give it a name between 3 and 80 characters.'); return; }
    var dup = dupOf(t);
    if (dup) { hint.textContent = ''; hint.appendChild(el('p', 'tp-h1', dup.status === 'covered' ? 'I already covered that one:' : 'That one is already on the list, so just vote for it:')); hint.appendChild(topicHit(dup)); say(dup.status === 'covered' ? 'Already covered. Tap Watch in the Covered tab.' : 'Already on the list. Vote for it instead of adding it again.'); return; }
    if (store('ss-topic-sent') && Date.now() - store('ss-topic-sent') < 20000) { say('One at a time, please.'); return; }
    sub.disabled = true; sub.textContent = 'Sending…';
    api.submit(t, n).then(function () { store('ss-topic-sent', Date.now()); form.reset(); hint.textContent = ''; say('Thanks! I look at every suggestion before it goes on the list.'); })
      .catch(function (er) { say(/duplicate|unique|409|already/i.test(er.message + (er.code || '')) ? 'That one has already been suggested. Find it above and vote.' : /too many/i.test(er.message) ? 'Too many suggestions for now. Try again later.' : 'Could not send that. Try again.'); })
      .then(function () { sub.disabled = false; sub.textContent = 'Suggest it'; });
  });

  function setTab(t) { tab = t; $('#tp-tab-open').setAttribute('aria-selected', String(t === 'open')); $('#tp-tab-done').setAttribute('aria-selected', String(t === 'done')); $('#tp-tab-open').classList.toggle('on', t === 'open'); $('#tp-tab-done').classList.toggle('on', t === 'done'); draw(); }
  $('#tp-tab-open').addEventListener('click', function () { setTab('open'); }); $('#tp-tab-done').addEventListener('click', function () { setTab('done'); });
  $('#tp-sort').addEventListener('change', function (e) { sort = e.target.value; draw(); });
  $('#tp-q').addEventListener('input', function (e) { query = e.target.value; draw(); });

  /* ---------- start ---------- */
  fetch('data/topics-config.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }).then(function (c) {
    cfg = c || {};
    if (demo) api = mock(); else if (cfg.supabaseUrl && cfg.anonKey) api = supa(cfg);
    if (!api) { root.classList.add('soon'); return; }
    root.classList.remove('soon'); load();
    setInterval(function () { if (!document.hidden && !root.closest('[hidden]')) load(); }, 30000);   // everyone sees the vote counts move
  });
})();
