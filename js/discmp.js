/* Disc-ipline "Play together": online rounds for 2 to 6 players.
   Everyone plays their own round at their own pace. Each throw and score is posted to a room (Supabase RPC, see supabase/discgolf.sql)
   and the other browsers replay those throws on a small overhead map, with a live scoreboard. Optional "follow" switches the map
   to whoever just threw. Needs js/discgolf.js (it provides window.DiscCore and calls window.DiscMPHooks). */
(function () {
  'use strict';
  var core = window.DiscCore, stage = document.getElementById('dd-stage'), menu = document.getElementById('dd-menupanel');
  if (!stage || !menu) return;
  var hooks = window.DiscMPHooks = window.DiscMPHooks || {};
  var PAL = ['#ff4d4d', '#4d8dff', '#ffd23f', '#35d673', '#b36bff', '#ff9a2f'];
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  var pid = store('bk-pid');
  if (!pid || pid.length < 16) { pid = ''; for (var i = 0; i < 24; i++) pid += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 36)); store('bk-pid', pid); }

  /* ---------- online access ---------- */
  var cfg = null;
  fetch('data/topics-config.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }).then(function (c) { cfg = c || {}; });
  function rpc(fn, args) {
    if (!cfg || !cfg.supabaseUrl || !cfg.anonKey) return Promise.reject(new Error('Online play is not available right now.'));
    return fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
      .then(function (r) { return r.text().then(function (t) { var j; try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; } if (!r.ok) { var m = (j && (j.message || j.hint)) || 'Could not reach the room.'; if (/could not find the function|schema cache/i.test(m)) m = 'Online rounds are not switched on yet (the site owner still needs to run supabase/discgolf.sql).'; throw new Error(m); } return j; }); });
  }

  /* ---------- room state ---------- */
  var R = null;   // { code, seat, since, players:{seat:P}, timer, watch, follow, big, minimized }
  // P = { seat, name, on, hole:{...}|null, hn:int, segs:[trail], pos:[x,y]|null, anim:{pts,len,t0,dur,end,k}|null, scores:[], pars:[], last:ts }
  function mkP(seat, name) { return { seat: seat, name: name || 'Player', on: true, hole: null, hn: -1, segs: [], pos: null, anim: null, scores: [], pars: [], thr: 0, last: 0, done: false }; }
  var queue = Promise.resolve();
  function post(data) { if (!R) return; var code = R.code; data.ts = Date.now(); queue = queue.then(function () { return rpc('dg_post', { p_code: code, p_pid: pid, p_data: data }); }).catch(function () {}); }
  function r1(v) { return Math.round(v * 10) / 10; }

  /* ---------- hooks from the game ---------- */
  hooks.hole = function (h, n) {
    if (!R) return; var me = R.players[R.seat]; me.hn = n; me.pars[n] = h.par; me.thr = 0;
    var trees = (h.treeList || []).filter(function (t) { return t.big; }).slice(0, 40).map(function (t) { return [Math.round(t.x), Math.round(t.y)]; });
    var water = (h.water || []).slice(0, 8).map(function (w) { return w.slice(0, 5).map(function (v, i) { return typeof v === 'number' ? r1(v) : v; }); });
    post({ t: 'hole', h: n, nm: h.name, par: h.par, tee: [r1(h.tee[0]), r1(h.tee[1])], bk: [r1(h.basket[0]), r1(h.basket[1])], path: h.path.map(function (p) { return [r1(p[0]), r1(p[1])]; }), w: r1(h.width), wa: water, tr: trees });
  };
  hooks.throw = function (pos, kind) {
    if (!R) return; var G = core.game(); if (!G) return; var tr = G.trail || [], pts = [], step = Math.max(1, Math.ceil(tr.length / 34));
    for (var i = 0; i < tr.length; i += step) pts.push([r1(tr[i][0]), r1(tr[i][1])]);
    if (tr.length) pts.push([r1(tr[tr.length - 1][0]), r1(tr[tr.length - 1][1])]);
    var me = R.players[R.seat]; me.thr = G.strokes;
    post({ t: 'throw', h: G.hole, n: G.strokes, p: pts, e: [r1(pos[0]), r1(pos[1])], k: kind });
  };
  hooks.score = function (st, hole, last) {
    if (!R) return; var me = R.players[R.seat]; me.scores[hole] = st; me.done = !!last; me.thr = st;
    post({ t: 'score', h: hole, s: st, last: last ? 1 : 0 }); renderBoard();
  };

  /* ---------- applying other players' events ---------- */
  function polyLen(p) { var L = 0; for (var i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; }
  function applyEvent(ev) {
    var seat = ev.s, d = ev.d || {}, P = R.players[seat] || (R.players[seat] = mkP(seat)); if (seat === R.seat) return;
    var fresh = Date.now() - (d.ts || 0) < 20000;
    if (d.t === 'hole') {
      P.hole = d; P.hn = d.h; P.pars[d.h] = d.par; P.segs = []; P.pos = d.tee; P.anim = null; P.thr = 0; P.last = Date.now();
    } else if (d.t === 'throw') {
      if (!P.hole || P.hn !== d.h) return;
      var pts = d.p && d.p.length > 1 ? d.p : [P.pos || d.e, d.e]; P.thr = d.n;
      if (fresh) { P.anim = { pts: pts, len: Math.max(1, polyLen(pts)), t0: performance.now(), dur: Math.min(4.2, Math.max(1.1, polyLen(pts) / 24)), end: d.e, k: d.k }; P.last = Date.now(); if (R.follow) R.watch = seat; }
      else { P.segs.push(pts); P.pos = d.e; }
    } else if (d.t === 'score') {
      P.scores[d.h] = d.s; P.done = !!d.last; if (fresh) { P.last = Date.now(); if (R.follow) R.watch = seat; }
    }
  }
  function finishAnim(P) { if (!P.anim) return; P.segs.push(P.anim.pts); P.pos = P.anim.end; P.anim = null; }

  function poll() {
    if (!R) return; var code = R.code;
    rpc('dg_poll', { p_code: code, p_pid: pid, p_since: R.since }).then(function (j) {
      if (!R || R.code !== code) return; if (!j || j.gone) { say('The room closed.'); leave(); return; }
      (j.players || []).forEach(function (p) { var P = R.players[p.seat] || (R.players[p.seat] = mkP(p.seat)); P.name = p.name; P.on = p.on || p.seat === R.seat; });
      (j.events || []).forEach(applyEvent);
      if (j.last > R.since) R.since = j.last;
      if (j.events && j.events.length >= 120) setTimeout(poll, 100);
      if (R.watch == null || !R.players[R.watch] || R.watch === R.seat) R.watch = firstOther();
      renderBoard(); renderTabs(); startDraw(); renderLobby();
    }).catch(function () {});
  }
  function firstOther() { var s = Object.keys(R.players).map(Number).sort(); for (var i = 0; i < s.length; i++) if (s[i] !== R.seat) return s[i]; return null; }

  /* ---------- joining and leaving ---------- */
  function say(t) { var n = document.getElementById('dd-mp-note'); if (n) n.textContent = t || ''; if (t && core.say && (!ov || ov.hidden)) core.say(t); }
  function enter(j, name) {
    R = { code: j.code, seat: j.seat, since: 0, players: {}, watch: null, follow: store('ss-dg-follow') !== '0', big: false, min: false };
    (j.players || []).forEach(function (p) { var P = mkP(p.seat, p.name); P.on = p.on; R.players[p.seat] = P; });
    R.players[R.seat] = R.players[R.seat] || mkP(R.seat, name); R.players[R.seat].name = name;
    store('ss-dg-room', j.code); clearInterval(R.timer);
    R.timer = setInterval(function () { if (!document.hidden) poll(); }, 1300);
    var cid = core.courseId(); if (j.course && j.course !== cid) core.useCourse(j.course); else core.restart();
    box.hidden = false; renderBoard(); renderTabs(); startDraw(); renderLobby(); poll();
  }
  function myName() { var n = (nameIn.value || '').trim().slice(0, 18); store('ss-dg-name', n); return n || 'Player'; }
  function create() { busy(true); rpc('dg_join', { p_code: '', p_pid: pid, p_name: myName(), p_course: core.courseId() }).then(function (j) { busy(false); enter(j, myName()); }).catch(fail); }
  function join(code) { code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (code.length !== 5) { fail(new Error('Codes are 5 letters or numbers.')); return; } busy(true); rpc('dg_join', { p_code: code, p_pid: pid, p_name: myName(), p_course: core.courseId() }).then(function (j) { busy(false); enter(j, myName()); }).catch(fail); }
  function leave() {
    if (!R) return; var code = R.code; clearInterval(R.timer); cancelAnimationFrame(raf); raf = 0; R = null; box.hidden = true; store('ss-dg-room', '');
    rpc('dg_leave', { p_code: code, p_pid: pid }).catch(function () {});
    renderLobby();
  }
  function busy(on) { ov.classList.toggle('busy', on); if (on) say('One moment...'); }
  function fail(e) { busy(false); say(e && e.message ? e.message : 'Something went wrong.'); }

  /* ---------- screens ---------- */
  var ov = document.createElement('div'); ov.className = 'wg-over dd-pick'; ov.id = 'dd-mpov'; ov.hidden = true;
  ov.innerHTML = '<div class="dd-mp"><h3>Play together</h3><div id="dd-mp-out"></div><p class="dd-mp-note" id="dd-mp-note"></p><button type="button" class="btn" id="dd-mp-x">Close</button></div>';
  stage.appendChild(ov);
  var nameIn = document.createElement('input'); nameIn.type = 'text'; nameIn.maxLength = 18; nameIn.placeholder = 'Your name'; nameIn.className = 'dd-mp-in'; nameIn.value = store('ss-dg-name') || store('bk-name') || '';
  var codeIn = document.createElement('input'); codeIn.type = 'text'; codeIn.maxLength = 5; codeIn.placeholder = 'CODE'; codeIn.className = 'dd-mp-in dd-mp-code'; codeIn.autocapitalize = 'characters'; codeIn.autocomplete = 'off'; codeIn.value = store('ss-dg-room') || '';
  function renderLobby() {
    var out = document.getElementById('dd-mp-out'); if (!out) return;
    while (out.firstChild) out.removeChild(out.firstChild);
    var p, b;
    if (!R) {
      p = document.createElement('p'); p.textContent = 'Play the same course with friends, each on your own phone or screen. You will see their throws on a little map as they play, and a live scoreboard. Up to 6 players.'; out.appendChild(p);
      var l = document.createElement('label'); l.textContent = 'Your name'; l.appendChild(nameIn); out.appendChild(l);
      b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-primary'; b.textContent = 'Make a room'; b.addEventListener('click', create); out.appendChild(b);
      var row = document.createElement('div'); row.className = 'dd-mp-row'; row.appendChild(codeIn);
      b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = 'Join with a code'; b.addEventListener('click', function () { join(codeIn.value); }); row.appendChild(b); out.appendChild(row);
      p = document.createElement('p'); p.className = 'dd-mp-small'; p.textContent = 'Making a room starts a fresh round on the course you have picked. Joining uses the host’s course.'; out.appendChild(p);
    } else {
      p = document.createElement('div'); p.className = 'dd-mp-big'; p.textContent = R.code; out.appendChild(p);
      p = document.createElement('p'); p.textContent = 'Tell your friends to open Disc-ipline, tap Menu, Play together, and enter this code.'; out.appendChild(p);
      var ul = document.createElement('ul'); ul.className = 'dd-mp-list';
      Object.keys(R.players).map(Number).sort().forEach(function (s) { var P = R.players[s], li = document.createElement('li'); li.innerHTML = '<i style="background:' + PAL[s % 6] + '"></i>'; var t = document.createElement('span'); t.textContent = P.name + (s === R.seat ? ' (you)' : '') + (P.on ? '' : ' · away'); li.appendChild(t); ul.appendChild(li); });
      out.appendChild(ul);
      b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-primary'; b.textContent = 'Back to the game'; b.addEventListener('click', function () { ov.hidden = true; }); out.appendChild(b);
      b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = 'Leave room'; b.addEventListener('click', function () { leave(); }); out.appendChild(b);
    }
  }
  document.getElementById('dd-mp-x').addEventListener('click', function () { ov.hidden = true; });
  ov.addEventListener('click', function (e) { e.stopPropagation(); });
  var mb = document.createElement('button'); mb.type = 'button'; mb.id = 'dd-mp'; mb.setAttribute('role', 'menuitem'); mb.innerHTML = '<b>Play together</b><small>Friends join with a code; watch their throws</small>';
  mb.addEventListener('click', function () { say(''); renderLobby(); ov.hidden = false; });
  menu.insertBefore(mb, menu.firstChild);

  /* ---------- the watch box: tabs, map, scoreboard ---------- */
  var box = document.createElement('div'); box.className = 'dd-mpbox'; box.hidden = true; box.id = 'dd-mpbox';
  box.innerHTML = '<div class="dd-mpbar"><div class="dd-mptabs" id="dd-mptabs"></div><button type="button" id="dd-mpmin" aria-label="Hide or show the map">&ndash;</button></div><div class="dd-mpbody" id="dd-mpbody"><canvas id="dd-mpcv"></canvas><div class="dd-mpcap" id="dd-mpcap"></div><label class="dd-mpfol"><input type="checkbox" id="dd-mpfol"> Follow whoever throws</label><div class="dd-mpboard" id="dd-mpboard"></div></div>';
  stage.appendChild(box);
  ['click', 'pointerdown', 'touchstart', 'mousedown'].forEach(function (ev) { box.addEventListener(ev, function (e) { e.stopPropagation(); }); });
  var cv = box.querySelector('#dd-mpcv'), capEl = box.querySelector('#dd-mpcap'), tabsEl = box.querySelector('#dd-mptabs'), boardEl = box.querySelector('#dd-mpboard'), folEl = box.querySelector('#dd-mpfol');
  folEl.checked = store('ss-dg-follow') !== '0';
  folEl.addEventListener('change', function () { if (R) R.follow = folEl.checked; store('ss-dg-follow', folEl.checked ? '1' : '0'); });
  cv.addEventListener('click', function () { if (R) { R.big = !R.big; box.classList.toggle('big', R.big); startDraw(); } });
  box.querySelector('#dd-mpmin').addEventListener('click', function () { if (R) { R.min = !R.min; box.classList.toggle('min', R.min); startDraw(); } });

  function vsText(P) { var t = 0, par = 0, n = 0; P.scores.forEach(function (s, i) { if (s != null) { t += s; par += P.pars[i] || 3; n++; } }); return { t: t, n: n, d: t - par, s: !n ? 'E' : (t - par === 0 ? 'E' : t - par > 0 ? '+' + (t - par) : String(t - par)) }; }
  function renderTabs() {
    if (!R) return; var others = Object.keys(R.players).map(Number).sort().filter(function (s) { return s !== R.seat; });
    tabsEl.innerHTML = '';
    if (!others.length) { var w = document.createElement('span'); w.className = 'dd-mpwait'; w.textContent = 'Room ' + R.code + ' · waiting for friends'; tabsEl.appendChild(w); return; }
    others.forEach(function (s) { var P = R.players[s], b = document.createElement('button'); b.type = 'button'; b.className = s === R.watch ? 'on' : ''; b.style.setProperty('--c', PAL[s % 6]); b.textContent = P.name; b.addEventListener('click', function () { R.watch = s; renderTabs(); }); tabsEl.appendChild(b); });
    startDraw();
  }
  function renderBoard() {
    if (!R) return; var rows = Object.keys(R.players).map(Number).sort().map(function (s) { var P = R.players[s], v = vsText(P); return { s: s, P: P, v: v }; });
    rows.sort(function (a, b) { return (b.v.n ? 1 : 0) - (a.v.n ? 1 : 0) || a.v.d - b.v.d; });
    boardEl.innerHTML = '';
    rows.forEach(function (r) {
      var d = document.createElement('div'); d.className = 'dd-mprow' + (r.s === R.seat ? ' me' : ''); var hole = r.P.hn >= 0 ? 'H' + (r.P.hn + 1) : '-';
      d.innerHTML = '<i style="background:' + PAL[r.s % 6] + '"></i><span></span><em></em><b></b>'; d.children[1].textContent = r.P.name; d.children[2].textContent = r.P.done ? 'done' : hole + (r.P.thr ? ' · ' + r.P.thr : ''); d.children[3].textContent = r.v.s + (r.v.n ? ' (' + r.v.t + ')' : '');
      if (!r.P.on) d.classList.add('away'); boardEl.appendChild(d);
    });
  }

  /* ---------- drawing the map ---------- */
  var raf = 0, W = 0, H = 0;
  function startDraw() { if (!raf && R) raf = requestAnimationFrame(draw); }
  function bounds(h, P) {
    var pts = h.path.slice(); pts.push(h.tee, h.bk); P.segs.forEach(function (s) { s.forEach(function (q) { pts.push(q); }); }); if (P.anim) P.anim.pts.forEach(function (q) { pts.push(q); });
    var a = 1e9, b = -1e9, c = 1e9, d = -1e9; pts.forEach(function (p) { a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); d = Math.max(d, p[1]); });
    var mx = Math.max(14, (b - a) * 0.18 + h.w), my = Math.max(14, (d - c) * 0.1 + 8); return [a - mx, b + mx, c - my, d + my];
  }
  function draw() {
    raf = 0; if (!R) return; if (box.hidden) return;
    var now = performance.now(), P = R.players[R.watch], dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
    if (w && h && (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr))) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = '#1f3a24'; c.fillRect(0, 0, w, h);
    var again = false;
    if (!P || !P.hole) {
      c.fillStyle = 'rgba(255,255,255,.7)'; c.font = '12px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText(P ? P.name + ' has not started yet' : 'Waiting for a friend to join', w / 2, h / 2); capEl.textContent = '';
    } else {
      var hd = P.hole, bd = bounds(hd, P), k = Math.min(w / (bd[1] - bd[0]), h / (bd[3] - bd[2])), ox = (w - (bd[1] - bd[0]) * k) / 2 - bd[0] * k, oy = h - (h - (bd[3] - bd[2]) * k) / 2 + bd[2] * k;
      function m(p) { return [ox + p[0] * k, oy - p[1] * k]; }
      c.fillStyle = '#2f6fe0'; (hd.wa || []).forEach(function (q) { if (q[4] === 'e') { var e = m([q[0], q[1]]); c.beginPath(); c.ellipse(e[0], e[1], Math.max(2, q[2] * k), Math.max(2, q[3] * k), 0, 0, 6.3); c.fill(); } else { var a = m([q[0], q[3]]), b = m([q[2], q[1]]); c.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); } });
      c.strokeStyle = '#4f9a58'; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = Math.max(5, hd.w * k); c.beginPath(); hd.path.forEach(function (q, i) { var p = m(q); if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.stroke();
      c.fillStyle = '#143a1c'; (hd.tr || []).forEach(function (q) { var p = m(q); if (p[0] > -4 && p[0] < w + 4 && p[1] > -4 && p[1] < h + 4) { c.beginPath(); c.arc(p[0], p[1], Math.max(1.5, 2.2 * k), 0, 6.3); c.fill(); } });
      var col = PAL[P.seat % 6], t0 = m(hd.tee), bk = m(hd.bk);
      c.fillStyle = '#fff'; c.fillRect(t0[0] - 3, t0[1] - 3, 6, 6); c.fillStyle = '#ff9a2f'; c.beginPath(); c.arc(bk[0], bk[1], 4, 0, 6.3); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.stroke();
      c.lineWidth = 2; c.strokeStyle = col; c.globalAlpha = .75;
      P.segs.forEach(function (s) { c.beginPath(); s.forEach(function (q, i) { var p = m(q); if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.stroke(); var e = m(s[s.length - 1]); c.fillStyle = col; c.beginPath(); c.arc(e[0], e[1], 2.5, 0, 6.3); c.fill(); });
      c.globalAlpha = 1;
      if (P.anim) {
        var an = P.anim, u = Math.min(1, (now - an.t0) / (an.dur * 1000)), want = u * an.len, acc = 0, pos = an.pts[0], i;
        c.strokeStyle = col; c.lineWidth = 2.4; c.beginPath(); var p0 = m(an.pts[0]); c.moveTo(p0[0], p0[1]);
        for (i = 1; i < an.pts.length; i++) { var sl = Math.hypot(an.pts[i][0] - an.pts[i - 1][0], an.pts[i][1] - an.pts[i - 1][1]); if (acc + sl >= want) { var f = sl ? (want - acc) / sl : 0; pos = [an.pts[i - 1][0] + (an.pts[i][0] - an.pts[i - 1][0]) * f, an.pts[i - 1][1] + (an.pts[i][1] - an.pts[i - 1][1]) * f]; var pp = m(pos); c.lineTo(pp[0], pp[1]); break; } acc += sl; var q = m(an.pts[i]); c.lineTo(q[0], q[1]); pos = an.pts[i]; }
        c.stroke(); var dp = m(pos); c.fillStyle = '#fff'; c.beginPath(); c.arc(dp[0], dp[1], 4.2, 0, 6.3); c.fill(); c.strokeStyle = col; c.lineWidth = 2; c.stroke();
        if (u >= 1) finishAnim(P); else again = true;
      } else if (P.pos) { var pm = m(P.pos); c.fillStyle = '#fff'; c.beginPath(); c.arc(pm[0], pm[1], 3.6, 0, 6.3); c.fill(); c.strokeStyle = col; c.lineWidth = 2; c.stroke(); }
      var v = vsText(P); capEl.textContent = P.name + ' · hole ' + (P.hn + 1) + ' (par ' + hd.par + ') · ' + (P.scores[P.hn] != null ? 'holed in ' + P.scores[P.hn] : P.thr ? P.thr + ' throw' + (P.thr === 1 ? '' : 's') : 'on the tee') + (v.n ? ' · ' + v.s : '');
    }
    for (var s in R.players) if (R.players[s].anim) again = true;
    // other players' throws keep playing even when their tab is not the one shown
    Object.keys(R.players).forEach(function (s) { var Q = R.players[s]; if (Q !== P && Q.anim && performance.now() - Q.anim.t0 > Q.anim.dur * 1000) finishAnim(Q); });
    if (R && again) raf = requestAnimationFrame(draw);
  }
  hooks.leave = leave;
  window.addEventListener('pagehide', function () { /* the room keeps your seat; coming back with the same code rejoins */ });
})();
