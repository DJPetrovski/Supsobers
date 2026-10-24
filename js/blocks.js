/* Blok Bottom: the game screen (menu, board, piece tray, computer players) and the online tables (Supabase RPC polling). */
(function () {
  'use strict';
  var B = window.BlockCore, root = document.getElementById('bk');
  if (!B || !root) return;
  var $ = function (id) { return document.getElementById(id); };
  var PAL = ['#2f6bff', '#ffd23f', '#ff3b3b', '#2fcf6a', '#a64bff', '#ff8a1f'];
  var DARK = ['#173a96', '#a8841a', '#9c1c1c', '#17803f', '#5f2299', '#a8530d'];
  var NAMES = B.COLORS;
  var el = { menu: $('bk-menu'), table: $('bk-table'), game: $('bk-game'), boards: $('bk-boards'), canvas: $('bk-canvas'), tray: $('bk-tray'), players: $('bk-players'), msg: $('bk-msg'), over: $('bk-over'), ctl: $('bk-ctl') };
  var ctx = el.canvas.getContext('2d');

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  var pid = store('bk-pid');
  if (!pid || pid.length < 16) { pid = ''; for (var i = 0; i < 24; i++) pid += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 36)); store('bk-pid', pid); }
  $('bk-name').value = store('bk-name') || '';

  /* ---------- online access ---------- */
  var cfg = null, cfgDone = false;
  function rpc(fn, args) {
    return fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
      .then(function (r) { return r.text().then(function (t) { var j; try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; } if (!r.ok) throw new Error((j && (j.message || j.hint)) || 'Could not reach the server.'); return j; }); });
  }
  function online() { return !!(cfg && cfg.supabaseUrl && cfg.anonKey); }
  fetch('data/topics-config.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }).then(function (c) { cfg = c || {}; cfgDone = true; lobbyTick(); });

  /* ---------- state ---------- */
  var variant = store('bk-variant') || 'four'; if (!B.VARIANTS[variant]) variant = 'four';
  var G = null;   // the running game
  /* G = { st, mode:'solo'|'online', me:seat, level, names:[], sel:{p,o}, gx,gy, hints, gameId, host, seatInfo:[], idle, busy, botTimer, poll, finished } */
  var selVariant = variant;

  function show(which) { el.menu.hidden = which !== 'menu'; el.table.hidden = which !== 'table'; el.game.hidden = which !== 'game'; if (which === 'game') requestAnimationFrame(layout); }
  function note(id, t) { var n = $(id); if (n) n.textContent = t || ''; }

  /* ---------- menu ---------- */
  var lobby = null;
  function drawBoards() {
    el.boards.innerHTML = '';
    ['duo', 'four', 'five', 'six'].forEach(function (k) {
      var v = B.VARIANTS[k], b = document.createElement('button'); b.type = 'button'; b.dataset.v = k;
      b.className = 'bk-board' + (k === selVariant ? ' on' : ''); b.setAttribute('aria-pressed', k === selVariant ? 'true' : 'false');
      var l = lobby && lobby.boards && lobby.boards[k], extra = l ? (l.waiting ? l.waiting + ' waiting' : l.playing ? l.playing + ' playing' : '') : '';
      var dots = ''; for (var i = 0; i < v.seats; i++) dots += '<i style="background:' + PAL[i] + '"></i>';
      b.innerHTML = '<span class="bk-dots">' + dots + '</span><b>' + v.label + '</b><small>' + v.n + '&times;' + v.n + (k === 'five' || k === 'six' ? ' &middot; our own board' : '') + (extra ? ' &middot; ' + extra : '') + '</small>';
      b.addEventListener('click', function () { selVariant = k; store('bk-variant', k); drawBoards(); });
      el.boards.appendChild(b);
    });
  }
  function lobbyTick() {
    if (el.menu.hidden || root.hidden || document.hidden || !online()) { return; }
    rpc('bk_lobby', { p_pid: pid }).then(function (j) { lobby = j; drawBoards(); var m = j && j.mine; if (m && !G) { $('bk-online').textContent = 'Rejoin your table'; } else $('bk-online').textContent = 'Play online'; }).catch(function () {});
  }
  setInterval(lobbyTick, 7000);
  document.addEventListener('ss:cvgame', function (e) { if (e.detail === 'bk') lobbyTick(); });
  drawBoards();

  function myName() { var n = ($('bk-name').value || '').trim().slice(0, 18); store('bk-name', n); return n || 'You'; }

  /* ---------- starting games ---------- */
  function newG(mode, v) {
    clearTimers();
    G = { st: B.newGame(v), mode: mode, variant: v, me: 0, level: $('bk-level').value, names: [], sel: null, gx: 0, gy: 0, hints: true, seatInfo: [], busy: false, finished: false, gameId: null, host: null, idle: 0, lastKey: '', ghostOn: false };
    G.hints = $('bk-hints').getAttribute('aria-pressed') !== 'false';
    return G;
  }
  function clearTimers() { if (G) { clearTimeout(G.botTimer); clearTimeout(G.poll); G.dead = true; } }

  $('bk-vs').addEventListener('click', function () {
    var g = newG('solo', selVariant), nm = myName();
    for (var c = 0; c < g.st.S; c++) g.names.push(c === 0 ? nm : NAMES[c] + ' (computer)');
    $('bk-mode').textContent = B.VARIANTS[selVariant].label + ' · vs computer';
    show('game'); over(false); afterChange(true);
  });

  function needOnline() { if (!cfgDone) { note('bk-menu-note', 'Checking the connection… try again in a second.'); return true; } if (!online()) { note('bk-menu-note', 'Online tables are not switched on yet. Play the computers for now, or check back soon.'); return true; } return false; }
  function joinOnline(opts) {
    if (needOnline()) return;
    var v = selVariant, args = { p_variant: v, p_pid: pid, p_name: myName(), p_code: opts.code || null, p_private: !!opts.priv };
    note('bk-menu-note', 'Finding a table…');
    rpc('bk_join', args).then(function (view) { note('bk-menu-note', ''); enterTable(view); }).catch(function (e) { note('bk-menu-note', e.message); });
  }
  $('bk-online').addEventListener('click', function () { joinOnline({}); });
  $('bk-private').addEventListener('click', function () { joinOnline({ priv: true }); });
  $('bk-join').addEventListener('click', function () { var c = ($('bk-code').value || '').trim().toUpperCase(); if (!c) { note('bk-menu-note', 'Type the 5-letter code first.'); return; } joinOnline({ code: c }); });

  function enterTable(view) {
    var g = newG('online', view.variant); g.gameId = view.id; g.variant = view.variant; selVariant = view.variant;
    $('bk-mode').textContent = B.VARIANTS[view.variant].label + ' · online';
    ingest(view, true); show(view.status === 'open' ? 'table' : 'game');
    schedulePoll(0);
  }
  function schedulePoll(ms) {
    if (!G || G.mode !== 'online') return; var g = G; clearTimeout(g.poll);
    g.poll = setTimeout(function () {
      if (g.dead) return;
      if (document.hidden && g.st.moves.length >= 0 && g.view && g.view.status === 'open') { schedulePoll(3000); return; }
      rpc('bk_state', { p_game: g.gameId, p_pid: pid, p_since: g.st.moves.length }).then(function (v) { if (g.dead) return; ingest(v, false); }).catch(function () { note('bk-table-note', 'Connection hiccup… retrying.'); }).then(function () { if (!g.dead) schedulePoll(g.view && g.view.status === 'open' ? 2000 : 1300); });
    }, ms);
  }

  /* take a table snapshot from the server: seats, status and any moves we have not played yet */
  function ingest(v, first) {
    var g = G; if (!g || g.mode !== 'online') return;
    if (v.gone) { toMenu('That table is gone.'); return; }
    g.view = v; g.host = v.host; g.idle = v.idleSeconds || 0; g.seatInfo = v.seats || [];
    var me = null; g.seatInfo.forEach(function (s) { if (s.you) me = s.seat; });
    if (me === null) { toMenu('You are no longer seated at that table.'); return; }
    g.me = me;
    g.names = []; for (var c = 0; c < g.st.S; c++) { var s = g.seatInfo.filter(function (x) { return x.seat === c; })[0]; g.names.push(s ? s.name : NAMES[c] + ' (computer)'); }
    if (v.status === 'open') { drawTable(v); return; }
    if (!el.table.hidden) { show('game'); }
    var applied = false;
    (v.moves || []).forEach(function (m) { if (m.i === g.st.moves.length && !g.st.over) { var d = m.d; B.play(g.st, { c: m.s, p: d.p, o: d.o, x: d.x, y: d.y }); applied = true; } });
    if (applied) { g.lastMove = g.st.moves[g.st.moves.length - 1]; fixSelection(); }
    g.busy = false; afterChange(first || applied);
  }

  function drawTable(v) {
    var B2 = B.VARIANTS[v.variant], html = '';
    for (var c = 0; c < B2.seats; c++) {
      var s = v.seats.filter(function (x) { return x.seat === c; })[0];
      html += '<div class="bk-seat' + (s && s.you ? ' you' : '') + '"><i style="background:' + PAL[c] + '"></i><span>' + NAMES[c] + '</span><b>' + (s ? esc(s.name) + (s.you ? ' (you)' : '') : '<em>waiting…</em>') + '</b><small>' + (s ? (s.online ? 'here' : 'away') : 'open') + '</small></div>';
    }
    $('bk-seats').innerHTML = html;
    var filled = v.seats.length;
    $('bk-table-t').textContent = v.private ? 'Private table' : 'Waiting for players';
    $('bk-table-s').innerHTML = (v.private ? 'Share this code: <b class="bk-codebig">' + esc(v.code) + '</b>. ' : '') + filled + ' of ' + B2.seats + ' seats taken. The game starts the moment the table fills up' + (v.host === (G && G.me) ? ', or start now and the computer plays the empty seats.' : '. The first person here can start early.');
    var isHost = G && v.host === G.me; $('bk-start').hidden = false; $('bk-start').disabled = !isHost;
    $('bk-start').textContent = filled >= B2.seats ? 'Starting…' : isHost ? 'Start now (computer fills empty seats)' : 'Waiting for the host to start';
    note('bk-table-note', '');
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  $('bk-start').addEventListener('click', function () {
    if (!G || G.mode !== 'online') return;
    rpc('bk_start', { p_game: G.gameId, p_pid: pid }).then(function (v) { ingest(v, true); }).catch(function (e) { note('bk-table-note', e.message); });
  });
  function leave() {
    var g = G; if (g && g.mode === 'online' && g.gameId && online()) { rpc('bk_leave', { p_game: g.gameId, p_pid: pid }).catch(function () {}); }
    toMenu('');
  }
  function toMenu(t) { clearTimers(); G = null; over(false); show('menu'); note('bk-menu-note', t || ''); lobbyTick(); }
  $('bk-leave').addEventListener('click', leave);
  $('bk-quit').addEventListener('click', function () { if (G && G.mode === 'online' && !G.st.over) { if (!G.confirmQuit) { G.confirmQuit = true; $('bk-quit').textContent = 'Leave game?'; setTimeout(function () { if (G) G.confirmQuit = false; $('bk-quit').textContent = 'Menu'; }, 3000); return; } } $('bk-quit').textContent = 'Menu'; leave(); });
  $('bk-over-menu').addEventListener('click', leave);
  $('bk-again').addEventListener('click', function () {
    if (!G) return; var mode = G.mode, v = G.variant;
    if (mode === 'solo') { selVariant = v; $('bk-vs').click(); } else { var gid = G.gameId; clearTimers(); G = null; rpc('bk_leave', { p_game: gid, p_pid: pid }).catch(function () {}).then(function () { selVariant = v; joinOnline({}); }); }
  });
  $('bk-hints').addEventListener('click', function () { var on = this.getAttribute('aria-pressed') === 'false'; this.setAttribute('aria-pressed', on ? 'true' : 'false'); this.textContent = 'Hints: ' + (on ? 'on' : 'off'); if (G) { G.hints = on; draw(); } });

  /* ---------- turn flow ---------- */
  function iPlay(c) { return G.mode === 'solo' ? c === 0 : c === G.me; }
  function seatBot(c) {   // does a computer play this seat right now?
    if (G.mode === 'solo') return c !== 0;
    var s = G.seatInfo.filter(function (x) { return x.seat === c; })[0];
    if (!s) return true;                       // empty seat
    if (c === G.me) return false;
    if (!s.online) return true;                // player left or lost connection
    return G.idle >= 90;                       // stuck on their turn
  }
  function botOwner() {   // exactly one browser drives the computer seats: the lowest seat that is online
    if (G.mode === 'solo') return true;
    return G.host === G.me;
  }
  function afterChange(redraw) {
    var g = G; if (!g) return;
    clearTimeout(g.botTimer);
    fixSelection(); updateChips(); updateMsg(); drawTray(); draw();
    if (g.st.over) { finish(); return; }
    var c = g.st.turn;
    if (iPlay(c)) { return; }
    if (seatBot(c) && botOwner()) {
      var anyHuman = g.mode === 'solo' ? !g.st.out[0] : true;
      var delay = g.mode === 'solo' ? (anyHuman ? 650 : 160) : (g.st.moves.length ? 800 : 1200);
      g.botTimer = setTimeout(function () { botMove(g, c); }, delay);
    }
  }
  function botMove(g, c) {
    if (G !== g || g.st.over || g.st.turn !== c || g.dead) return;
    var m = B.chooseMove(g.st, c, g.mode === 'solo' ? g.level : 'normal', Math.random);
    if (!m) { return; }
    if (g.mode === 'solo') { B.play(g.st, m); g.lastMove = m; afterChange(true); }
    else submit(m);
  }
  function submit(m) {
    var g = G; if (!g || g.busy) return; g.busy = true;
    rpc('bk_move', { p_game: g.gameId, p_pid: pid, p_idx: g.st.moves.length, p_seat: m.c, p_data: { p: m.p, o: m.o, x: m.x, y: m.y }, p_done: false })
      .then(function (v) { if (G === g) { g.busy = false; ingest(v, true); } })
      .catch(function (e) { if (G === g) { g.busy = false; setMsg(e.message); } });
  }
  function finish() {
    var g = G; if (g.finished) return; g.finished = true;
    var sc = B.scores(g.st), order = sc.map(function (s, c) { return { c: c, s: s, left: g.st.remaining[c] }; }).sort(function (a, b) { return b.s - a.s; });
    var best = order[0].s, winners = order.filter(function (o) { return o.s === best; });
    $('bk-over-t').textContent = winners.some(function (o) { return iPlay(o.c); }) ? (winners.length > 1 ? 'You tied for the win' : 'You win!') : g.names[winners[0].c] + (winners.length > 1 ? ' and others win' : ' wins');
    $('bk-over-l').innerHTML = order.map(function (o) { return '<li><i style="background:' + PAL[o.c] + '"></i><span>' + esc(g.names[o.c]) + '</span><b>' + o.s + '</b><small>' + (o.left === 0 ? 'placed everything' : o.left + ' squares left') + '</small></li>'; }).join('');
    setTimeout(function () { if (G === g) over(true); }, 600);
    if (g.mode === 'online') { rpc('bk_finish', { p_game: g.gameId, p_pid: pid }).catch(function () {}); }
  }
  function over(on) { el.over.hidden = !on; }

  /* ---------- messages + player chips ---------- */
  function setMsg(t) { el.msg.textContent = t; }
  function updateMsg() {
    var g = G, st = g.st; if (st.over) { setMsg('Game over.'); return; }
    var c = st.turn;
    if (g.mode === 'online' && g.view && g.view.status === 'playing' && st.moves.length === 0 && !iPlay(c)) { setMsg(NAMES[c] + ' goes first…'); return; }
    if (iPlay(c)) { setMsg(g.sel ? 'Your turn. Move the piece over the board and place it.' : 'Your turn. Pick a piece below.'); }
    else if (g.mode === 'solo' && st.out[0]) setMsg('You have no moves left. The computers finish the game.');
    else setMsg((g.names[c] || NAMES[c]) + (seatBot(c) && !(g.names[c] || '').match(/computer/) ? ' is away, the computer plays for them…' : ' is thinking…'));
  }
  function updateChips() {
    var g = G, st = g.st, html = '';
    for (var c = 0; c < st.S; c++) {
      html += '<div class="bk-chip' + (st.turn === c && !st.over ? ' turn' : '') + (st.out[c] ? ' out' : '') + (iPlay(c) ? ' mine' : '') + '" style="--c:' + PAL[c] + '"><i></i><span>' + esc(g.names[c] || NAMES[c]) + '</span><b>' + st.remaining[c] + '</b>' + (st.out[c] ? '<small>out</small>' : '') + '</div>';
    }
    el.players.innerHTML = html;
  }

  /* ---------- piece selection / orientation ---------- */
  function key(cells) { return cells.map(function (c) { return c[0] + ',' + c[1]; }).join(';'); }
  function normCells(cells) {
    var mx = 1e9, my = 1e9; cells.forEach(function (c) { if (c[0] < mx) mx = c[0]; if (c[1] < my) my = c[1]; });
    return cells.map(function (c) { return [c[0] - mx, c[1] - my]; }).sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; });
  }
  function orientIndex(p, cells) { var k = key(cells), os = B.PIECES[p].orients; for (var i = 0; i < os.length; i++) if (key(os[i].cells) === k) return i; return 0; }
  function rotate() { var s = G && G.sel; if (!s) return; var cells = B.PIECES[s.p].orients[s.o].cells.map(function (c) { return [-c[1], c[0]]; }); s.o = orientIndex(s.p, normCells(cells)); keepOnBoard(); draw(); }
  function flip() { var s = G && G.sel; if (!s) return; var cells = B.PIECES[s.p].orients[s.o].cells.map(function (c) { return [-c[0], c[1]]; }); s.o = orientIndex(s.p, normCells(cells)); keepOnBoard(); draw(); }
  function keepOnBoard() { var g = G, s = g.sel; if (!s) return; var o = B.PIECES[s.p].orients[s.o], n = g.st.n; g.gx = Math.max(0, Math.min(n - o.w, g.gx)); g.gy = Math.max(0, Math.min(n - o.h, g.gy)); }
  function select(p) {
    var g = G; if (!g) return;
    g.sel = { p: p, o: 0 }; if (!g.ghostOn) { var n = g.st.n; g.gx = Math.floor(n / 2) - 1; g.gy = Math.floor(n / 2) - 1; var s = g.st.v.starts[mySeat()]; if (g.st.first[mySeat()]) { g.gx = s[0]; g.gy = s[1]; } }
    keepOnBoard(); updateMsg(); drawTray(); draw();
  }
  function mySeat() { return G.mode === 'solo' ? 0 : G.me; }
  function fixSelection() {
    var g = G; if (!g || g.dead) return;
    var c = mySeat(), used = g.st.used[c];
    if (g.sel && used[g.sel.p]) g.sel = null;
    if (!g.sel && !g.st.over && !g.st.out[c]) {
      var best = -1; for (var p = B.PIECES.length - 1; p >= 0; p--) if (!used[p]) { best = p; break; }
      if (best >= 0) { g.sel = { p: best, o: 0 }; if (g.st.first[c]) { var s = g.st.v.starts[c]; g.gx = s[0]; g.gy = s[1]; } keepOnBoard(); }
    }
    if (g.st.out[c]) g.sel = null;
  }
  function canPlace() {
    var g = G; if (!g || !g.sel || g.st.over || g.st.turn !== mySeat() || g.busy) return false;
    return B.legalAt(g.st, mySeat(), B.PIECES[g.sel.p].orients[g.sel.o], g.gx, g.gy);
  }
  function place() {
    var g = G; if (!canPlace()) { if (g && g.sel && g.st.turn === mySeat()) { setMsg('That spot does not work: touch your own piece at a corner only (or cover your start square), stay on the board, and do not overlap.'); } return; }
    var m = { c: mySeat(), p: g.sel.p, o: g.sel.o, x: g.gx, y: g.gy };
    if (g.mode === 'solo') { B.play(g.st, m); g.lastMove = m; g.sel = null; g.ghostOn = true; afterChange(true); }
    else { g.sel = null; submit(m); drawTray(); draw(); }
  }

  /* ---------- drawing ---------- */
  var cell = 20, W = 0;
  function layout() {
    if (!G) return;
    var wrap = el.canvas.parentNode, w = Math.max(240, Math.min(wrap.clientWidth || 360, 640)), n = G.st.n;
    cell = Math.floor(w / n); W = cell * n;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.canvas.width = W * dpr; el.canvas.height = W * dpr; el.canvas.style.width = W + 'px'; el.canvas.style.height = W + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTray(); draw();
  }
  window.addEventListener('resize', function () { if (G && !el.game.hidden) layout(); });

  function block(x, y, c, a) {
    var px = x * cell, py = y * cell; ctx.globalAlpha = a || 1;
    ctx.fillStyle = PAL[c]; ctx.fillRect(px, py, cell, cell);
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(px, py, cell, Math.max(1, cell * .12)); ctx.fillRect(px, py, Math.max(1, cell * .12), cell);
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(px, py + cell - Math.max(1, cell * .12), cell, Math.max(1, cell * .12)); ctx.fillRect(px + cell - Math.max(1, cell * .12), py, Math.max(1, cell * .12), cell);
    ctx.globalAlpha = 1;
  }
  function draw() {
    var g = G; if (!g || !W) return; var st = g.st, n = st.n;
    ctx.clearRect(0, 0, W, W);
    ctx.fillStyle = '#e9e0d0'; ctx.fillRect(0, 0, W, W);
    ctx.strokeStyle = 'rgba(60,45,30,.22)'; ctx.lineWidth = 1; ctx.beginPath();
    for (var i = 0; i <= n; i++) { ctx.moveTo(i * cell + .5, 0); ctx.lineTo(i * cell + .5, W); ctx.moveTo(0, i * cell + .5); ctx.lineTo(W, i * cell + .5); }
    ctx.stroke();
    // start squares
    for (var c = 0; c < st.S; c++) {
      var s = st.v.starts[c]; if (st.board[s[1] * n + s[0]] !== -1) continue;
      ctx.fillStyle = PAL[c]; ctx.globalAlpha = .28; ctx.fillRect(s[0] * cell, s[1] * cell, cell, cell); ctx.globalAlpha = 1;
      ctx.strokeStyle = PAL[c]; ctx.lineWidth = 2; ctx.strokeRect(s[0] * cell + 2, s[1] * cell + 2, cell - 4, cell - 4);
    }
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) { var v = st.board[y * n + x]; if (v !== -1) block(x, y, v); }
    // last move outline
    if (g.lastMove) {
      var lm = g.lastMove, o = B.PIECES[lm.p].orients[lm.o]; ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.lineWidth = 2;
      o.cells.forEach(function (q) { ctx.strokeRect((lm.x + q[0]) * cell + 3, (lm.y + q[1]) * cell + 3, cell - 6, cell - 6); });
    }
    var my = mySeat(), myTurn = st.turn === my && !st.over;
    if (g.hints && myTurn && !g.busy) {
      ctx.fillStyle = PAL[my]; ctx.globalAlpha = .75;
      B.frontier(st, my).forEach(function (i2) { var hx = i2 % n, hy = (i2 - hx) / n; ctx.beginPath(); ctx.arc(hx * cell + cell / 2, hy * cell + cell / 2, Math.max(2, cell * .16), 0, 6.3); ctx.fill(); });
      ctx.globalAlpha = 1;
    }
    if (g.sel && myTurn) {
      var po = B.PIECES[g.sel.p].orients[g.sel.o], ok = B.legalAt(st, my, po, g.gx, g.gy);
      po.cells.forEach(function (q) { var gx = g.gx + q[0], gy = g.gy + q[1]; if (gx < 0 || gy < 0 || gx >= n || gy >= n) return; block(gx, gy, my, ok ? .9 : .45); });
      ctx.strokeStyle = ok ? '#0a7a2c' : '#c4121c'; ctx.lineWidth = 2;
      po.cells.forEach(function (q) { var gx = g.gx + q[0], gy = g.gy + q[1]; if (gx < 0 || gy < 0 || gx >= n || gy >= n) return; ctx.strokeRect(gx * cell + 1.5, gy * cell + 1.5, cell - 3, cell - 3); });
      $('bk-place').disabled = !ok;
    } else $('bk-place').disabled = true;
    el.ctl.classList.toggle('idle', !(g.sel && myTurn));
  }

  function drawTray() {
    var g = G; if (!g) return; var c = mySeat(), used = g.st.used[c], myTurn = g.st.turn === c && !g.st.over;
    if (!el.tray.children.length || el.tray.dataset.c !== String(c)) {
      el.tray.dataset.c = c; el.tray.innerHTML = '';
      B.PIECES.forEach(function (p) {
        var b = document.createElement('button'); b.type = 'button'; b.dataset.p = p.id; b.setAttribute('aria-label', 'Piece ' + p.name + ', ' + p.size + ' squares');
        var cv = document.createElement('canvas'); var u = 11, o = p.orients[0]; cv.width = 5 * u; cv.height = 5 * u; var cx = cv.getContext('2d');
        var ox = Math.floor((5 - o.w) * u / 2), oy = Math.floor((5 - o.h) * u / 2);
        o.cells.forEach(function (q) { cx.fillStyle = PAL[c]; cx.fillRect(ox + q[0] * u, oy + q[1] * u, u - 1, u - 1); cx.fillStyle = 'rgba(255,255,255,.3)'; cx.fillRect(ox + q[0] * u, oy + q[1] * u, u - 1, 2); });
        b.appendChild(cv); b.addEventListener('click', function () { if (G.st.used[mySeat()][p.id]) return; select(p.id); });
        el.tray.appendChild(b);
      });
    }
    Array.prototype.forEach.call(el.tray.children, function (b) {
      var p = +b.dataset.p; b.classList.toggle('used', !!used[p]); b.classList.toggle('sel', !!(g.sel && g.sel.p === p)); b.disabled = !!used[p] || !!g.st.out[c];
    });
  }

  /* ---------- pointer + keys ---------- */
  function cellAt(e) {
    var r = el.canvas.getBoundingClientRect(), s = r.width / W;
    return [Math.floor((e.clientX - r.left) / s / cell), Math.floor((e.clientY - r.top) / s / cell)];
  }
  var dragging = false, moved = false;
  function aim(e) {
    var g = G; if (!g || !g.sel) return; var o = B.PIECES[g.sel.p].orients[g.sel.o], p = cellAt(e);
    var nx = p[0] - Math.floor(o.w / 2), ny = p[1] - Math.floor(o.h / 2); if (nx !== g.gx || ny !== g.gy) { g.gx = nx; g.gy = ny; g.ghostOn = true; draw(); }
  }
  el.canvas.addEventListener('pointerdown', function (e) {
    if (!G || !G.sel || G.st.turn !== mySeat()) return; dragging = true; moved = false; try { el.canvas.setPointerCapture(e.pointerId); } catch (x) {} aim(e);
  });
  el.canvas.addEventListener('pointermove', function (e) {
    if (!G || !G.sel || G.st.turn !== mySeat()) return;
    if (e.pointerType === 'mouse' || dragging) { if (dragging) moved = true; aim(e); }
  });
  el.canvas.addEventListener('pointerup', function (e) {
    if (!dragging) return; dragging = false;
    if (e.pointerType === 'mouse' && !moved) { aim(e); place(); }
  });
  el.canvas.addEventListener('pointercancel', function () { dragging = false; });
  el.canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); if (G && G.sel) rotate(); });
  $('bk-rot').addEventListener('click', rotate); $('bk-flip').addEventListener('click', flip); $('bk-place').addEventListener('click', place);
  Array.prototype.forEach.call(el.ctl.querySelectorAll('.bk-pad button'), function (b) {
    b.addEventListener('click', function () { var d = b.dataset.d.split(','); if (!G || !G.sel) return; G.gx += +d[0]; G.gy += +d[1]; G.ghostOn = true; keepOnBoard(); draw(); });
  });
  document.addEventListener('keydown', function (e) {
    if (!G || root.hidden || el.game.hidden || /input|select|textarea/i.test((e.target.tagName || '')) || !G.sel) return;
    var k = e.key.toLowerCase(), d = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k];
    if (k === 'r') rotate(); else if (k === 'f') flip(); else if (k === 'enter' || k === ' ') { if (e.target.tagName !== 'BUTTON') { e.preventDefault(); place(); } }
    else if (d) { e.preventDefault(); G.gx += d[0]; G.gy += d[1]; G.ghostOn = true; keepOnBoard(); draw(); }
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && G && G.mode === 'online') schedulePoll(0); });

  // tests and tinkering
  window.BlokBottom = { get game() { return G; }, place: place, select: select, rotate: rotate, flip: flip };
})();
