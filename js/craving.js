/* Craving Corner: Sober Etch A Sketch.
   1) A stylus sketches the chalk-outline photo of DJ.  2) The frame shakes and the screen clears.
   3) A maze appears. Steer with the two knobs (or arrow keys). Touch a wall: shake + reset. Reach the flag. */
(function () {
  var cv = document.getElementById('es-canvas'); if (!cv) return;
  var W = 480, H = 340, dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = W * dpr; cv.height = H * dpr;
  var ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  var mask = document.createElement('canvas'); mask.width = W; mask.height = H;
  var mctx = mask.getContext('2d', { willReadFrequently: true });
  var frame = document.getElementById('es'), msg = document.getElementById('es-msg'), clockEl = document.getElementById('es-clock');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var BG = '#b7bbb2', WALL = '#6a6e66', INK = '#1d1d1d';
  var fog = 0, mode = 'maze', ink = INK, hue = 0, phase = 'idle', raf = 0, run = 0, outline = null, level = 0, lvl = null;
  var px = 0, py = 0, lastX = 0, lastY = 0, startedAt = 0, clockT = 0, tries = 0, keys = {};
  function cellFor(lv) { return Math.max(18, 54 - lv * 4); }
  function fogFor(lv) { return lv >= 9 ? Math.max(70, 250 - (lv - 9) * 20) : 0; }   // from level 10 on, only a lantern-sized circle around the stylus is visible

  function say(t) { msg.textContent = t; }
  function clear() { ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H); }
  function shake(cb) { frame.classList.remove('shake'); void frame.offsetWidth; frame.classList.add('shake'); setTimeout(function () { frame.classList.remove('shake'); if (cb) cb(); }, 520); }
  function wipe(cb) {  // the screen "erases" like a real one: fades back to blank gray
    var t0 = performance.now(), snap = ctx.getImageData(0, 0, W * dpr, H * dpr), id = run;
    var tmp = document.createElement('canvas'); tmp.width = snap.width; tmp.height = snap.height; tmp.getContext('2d').putImageData(snap, 0, 0);
    (function f(now) {
      if (id !== run) return;
      var k = Math.min(1, (now - t0) / 450);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = BG; ctx.fillRect(0, 0, cv.width, cv.height); ctx.globalAlpha = 1 - k; ctx.drawImage(tmp, 0, 0); ctx.restore();
      if (k < 1) requestAnimationFrame(f); else { clear(); if (cb) cb(); }
    })(t0);
  }

  /* ---------- phase 1: sketch the outline ---------- */
  var textData = null;
  function loadOutline(cb) {
    function more() { if (textData) return cb(); fetch('data/sketch-text.json').then(function (r) { return r.json(); }).then(function (d) { textData = d; cb(); }).catch(function () { textData = { ar: 3.6, strokes: [] }; cb(); }); }
    if (outline) return more();
    fetch('data/sketch-outline.json').then(function (r) { return r.json(); }).then(function (d) { outline = d; more(); }).catch(function () { outline = { ar: 1.5, pts: [[.1, .5], [.5, .1], [.9, .5], [.5, .9]] }; more(); });
  }
  function sketch() {
    cancelAnimationFrame(raf); var id = ++run; phase = 'sketch'; clear(); tries = 0;
    say('Watch the sketch...');
    loadOutline(function () {
      if (id !== run) return;
      var bw = W - 90, bh = H - 88, sc = Math.min(bw, bh * outline.ar), ow = sc, oh = sc / outline.ar, ox = (W - ow) / 2, oy = 8;
      var pts = outline.pts.map(function (p) { return [ox + p[0] * ow, oy + p[1] * oh]; }); pts.push(pts[0]);
      // the lettering (SUP SOBERS in the site's 3rd Man face, traced as outlines) is sketched at the same time as the body
      var th = Math.min(60, (W - 120) / (textData.ar || 3.6)), tw = th * (textData.ar || 3.6), tx0 = (W - tw) / 2, ty0 = H - th - 12;
      var tstrokes = (textData.strokes || []).filter(function (st) { var mx = 0, my = 0, nx = 9, ny = 9; st.forEach(function (q) { mx = Math.max(mx, q[0]); my = Math.max(my, q[1]); nx = Math.min(nx, q[0]); ny = Math.min(ny, q[1]); }); return Math.max(mx - nx, my - ny) > 0.16; }).map(function (st) { return st.map(function (q) { return [tx0 + q[0] * th, ty0 + q[1] * th]; }); });
      function lensOf(list) { return list.map(function (st) { var l = 0, j; for (j = 1; j < st.length; j++) l += Math.hypot(st[j][0] - st[j - 1][0], st[j][1] - st[j - 1][1]); return l; }); }
      var groups = [{ strokes: [pts], w: 2.4 }, { strokes: tstrokes, w: 1.8 }];
      groups.forEach(function (g) { g.lens = lensOf(g.strokes); g.total = g.lens.reduce(function (a, b) { return a + b; }, 0); });
      var dur = reduce ? 600 : 3200, t0 = performance.now(), i;
      ctx.lineJoin = ctx.lineCap = 'round'; ctx.strokeStyle = INK;
      (function f(now) {
        if (id !== run) return;
        var k = Math.min(1, (now - t0) / dur), dots = [];
        clear();
        groups.forEach(function (g) {
          var goal = k * g.total, x = g.strokes[0] ? g.strokes[0][0][0] : 0, y = g.strokes[0] ? g.strokes[0][0][1] : 0, si;
          ctx.lineWidth = g.w;
          for (si = 0; si < g.strokes.length && goal > 0; si++) {
            var st = g.strokes[si], left = Math.min(goal, g.lens[si]); goal -= g.lens[si];
            ctx.beginPath(); ctx.moveTo(st[0][0], st[0][1]); x = st[0][0]; y = st[0][1];
            for (i = 1; i < st.length; i++) {
              var d = Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
              if (left >= d) { ctx.lineTo(st[i][0], st[i][1]); left -= d; x = st[i][0]; y = st[i][1]; }
              else { var r = left / d; x = st[i - 1][0] + (st[i][0] - st[i - 1][0]) * r; y = st[i - 1][1] + (st[i][1] - st[i - 1][1]) * r; ctx.lineTo(x, y); break; }
            }
            ctx.stroke();
          }
          dots.push([x, y]);
        });
        ctx.fillStyle = '#2b2b2b'; dots.forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0, 7); ctx.fill(); });
        if (k < 1) requestAnimationFrame(f);
        else setTimeout(function () {
          if (id !== run) return; say('Uh oh...');
          shake(function () { if (id !== run) return; wipe(function () { if (id !== run) return; maze(0); }); });
        }, reduce ? 100 : 700);
      })(t0);
    });
  }

  /* ---------- phase 2: the maze ---------- */
  function buildMaze(cell) {
    var cols = Math.floor((W - 24) / cell), rows = Math.floor((H - 24) / cell), ox = Math.round((W - cols * cell) / 2), oy = Math.round((H - rows * cell) / 2);
    var seen = [], right = [], down = [], x, y;       // right[y][x] / down[y][x] = open passage
    for (y = 0; y < rows; y++) { seen[y] = []; right[y] = []; down[y] = []; for (x = 0; x < cols; x++) seen[y][x] = right[y][x] = down[y][x] = false; }
    var st = [[0, 0]]; seen[0][0] = true;
    while (st.length) {
      var c = st[st.length - 1], n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(function (d) { var nx = c[0] + d[0], ny = c[1] + d[1]; return nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen[ny][nx]; });
      if (!n.length) { st.pop(); continue; }
      var d = n[Math.floor(Math.random() * n.length)], nx = c[0] + d[0], ny = c[1] + d[1];
      if (d[0] === 1) right[c[1]][c[0]] = true; else if (d[0] === -1) right[ny][nx] = true; else if (d[1] === 1) down[c[1]][c[0]] = true; else down[ny][nx] = true;
      seen[ny][nx] = true; st.push([nx, ny]);
    }
    return { cell: cell, cols: cols, rows: rows, ox: ox, oy: oy, right: right, down: down };
  }
  function wallPath(g, L) {
    g.beginPath();
    var c = L.cell, x, y;
    for (y = 0; y <= L.rows; y++) for (x = 0; x < L.cols; x++) { var open = y > 0 && y < L.rows && L.down[y - 1][x]; if (!open) { g.moveTo(L.ox + x * c, L.oy + y * c); g.lineTo(L.ox + (x + 1) * c, L.oy + y * c); } }
    for (x = 0; x <= L.cols; x++) for (y = 0; y < L.rows; y++) { var o = x > 0 && x < L.cols && L.right[y][x - 1]; if (!o) { g.moveTo(L.ox + x * c, L.oy + y * c); g.lineTo(L.ox + x * c, L.oy + (y + 1) * c); } }
  }
  function maze(lv) {
    cancelAnimationFrame(raf); var id = ++run; level = lv; lvl = buildMaze(cellFor(level)); fog = fogFor(level); tries = 0; keys = {};
    mctx.clearRect(0, 0, W, H); mctx.lineWidth = 5; mctx.lineCap = 'square'; mctx.strokeStyle = '#000'; wallPath(mctx, lvl); mctx.stroke();
    phase = 'maze'; startedAt = startedAt || 0; resetStylus(true); setFog(); say('Level ' + (level + 1) + (fog ? '. The lights are dim: only a little circle around you is visible.' : '. Get to the red flag without touching a wall.'));
    loop(id);
  }
  function setFog() {
    var m = '';
    if (fog && phase !== 'free') { var r = cv.getBoundingClientRect(), k = r.width / W, c = 'radial-gradient(circle at ' + (px * k).toFixed(0) + 'px ' + (py * k).toFixed(0) + 'px, #000 ' + (fog * k).toFixed(0) + 'px, rgba(0,0,0,0) ' + ((fog + 28) * k).toFixed(0) + 'px)'; m = c; }
    cv.style.webkitMaskImage = cv.style.maskImage = m;
    var lvEl = document.getElementById('es-lv'); if (lvEl) lvEl.textContent = phase === 'free' ? 'Free draw' : 'Level ' + (level + 1);
  }
  function drawBoard() {
    clear(); ctx.lineWidth = 4; ctx.lineCap = 'square'; ctx.strokeStyle = WALL; wallPath(ctx, lvl); ctx.stroke();
    var c = lvl.cell, gx = lvl.ox + (lvl.cols - .5) * c, gy = lvl.oy + (lvl.rows - .5) * c;
    ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gx - 6, gy + 10); ctx.lineTo(gx - 6, gy - 11); ctx.stroke();
    ctx.fillStyle = '#d3201a'; ctx.beginPath(); ctx.moveTo(gx - 6, gy - 11); ctx.lineTo(gx + 10, gy - 6); ctx.lineTo(gx - 6, gy - 1); ctx.fill();
  }
  var trail = [];
  function resetStylus(first) {
    px = lastX = lvl.ox + lvl.cell / 2; py = lastY = lvl.oy + lvl.cell / 2; trail = [[px, py]]; drawBoard(); dot();
  }
  function dot() { ctx.fillStyle = '#2b2b2b'; ctx.beginPath(); ctx.arc(px, py, 3.2, 0, 7); ctx.fill(); }
  function hits(x, y) { var d = mctx.getImageData(Math.round(x) - 3, Math.round(y) - 3, 6, 6).data; for (var i = 3; i < d.length; i += 4) if (d[i] > 40) return true; return false; }
  function move(dx, dy) {
    if (phase !== 'maze' && phase !== 'free') return;
    if (!startedAt) startClock();
    var n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 1.5)), sx = dx / n, sy = dy / n;
    for (var i = 0; i < n; i++) {
      var nx = px + sx, ny = py + sy;
      if (nx < 3 || ny < 3 || nx > W - 3 || ny > H - 3 || (phase === 'maze' && hits(nx, ny))) { if (phase === 'free') return; return crash(); }
      if (ink === 'rainbow') { hue = (hue + 2.2) % 360; ctx.strokeStyle = 'hsl(' + hue + ',85%,38%)'; } else ctx.strokeStyle = ink; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke();
      trail.push([nx, ny]); px = nx; py = ny;
    }
    if (fog) setFog();
    if (phase !== 'maze') return;
    var gx = lvl.ox + (lvl.cols - .5) * lvl.cell, gy = lvl.oy + (lvl.rows - .5) * lvl.cell;
    if (Math.hypot(px - gx, py - gy) < lvl.cell * .35) win();
  }
  function crash() {
    if (phase !== 'maze') return; phase = 'crash'; tries++; keys = {}; say('Wall! Shake it off. Start again.');
    shake(function () { wipe(function () { phase = 'maze'; resetStylus(); say('Again. Slow and steady. Attempt ' + (tries + 1) + '.'); }); });
  }
  function win() {
    phase = 'win'; keys = {}; dot();
    say('Level ' + (level + 1) + ' cleared! Next one is a little harder...');
    setTimeout(function () { if (phase === 'win') wipe(function () { maze(level + 1); }); }, reduce ? 600 : 1800);
  }

  /* ---------- free draw ---------- */
  function freeDraw(erase) {
    fog = 0; cv.style.webkitMaskImage = cv.style.maskImage = ''; var lv0 = document.getElementById('es-lv'); if (lv0) lv0.textContent = 'Free draw';
    cancelAnimationFrame(raf); var id = ++run; keys = {};
    function go() { if (id !== run) return; clear(); phase = 'free'; px = lastX = W / 2; py = lastY = H / 2; dot(); say('Free draw. Twist the knobs or drag on the screen. Pick any sand color, even mid-line.'); loop(id); }
    if (erase && phase === 'free') { phase = 'crash'; say('Shaking...'); shake(function () { wipe(go); }); } else { phase = 'crash'; go(); }
  }
  function setMode(m) {
    mode = m; document.getElementById('es-mode-maze').classList.toggle('on', m === 'maze'); document.getElementById('es-mode-maze').setAttribute('aria-pressed', m === 'maze');
    document.getElementById('es-mode-free').classList.toggle('on', m === 'free'); document.getElementById('es-mode-free').setAttribute('aria-pressed', m === 'free');
    document.getElementById('es-new').textContent = m === 'free' ? 'Shake to erase' : 'New maze';
    document.getElementById('es-replay').hidden = m === 'free';
    if (m === 'free') freeDraw(false); else { startedAt = 0; maze(level); }
  }
  document.getElementById('es-mode-maze').addEventListener('click', function () { if (mode !== 'maze') setMode('maze'); });
  document.getElementById('es-mode-free').addEventListener('click', function () { if (mode !== 'free') setMode('free'); });
  // drag right on the screen in free draw
  (function () {
    var drag = null;
    function pos(e) { var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; }
    cv.addEventListener('pointerdown', function (e) { if (phase !== 'free') return; drag = e.pointerId; cv.setPointerCapture(drag); var p = pos(e); px = p[0]; py = p[1]; dot(); });
    cv.addEventListener('pointermove', function (e) { if (e.pointerId !== drag || phase !== 'free') return; var p = pos(e); move(p[0] - px, p[1] - py); });
    function up(e) { if (e.pointerId === drag) drag = null; }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  })();

  /* ---------- sand colors: change any time, even mid-line ---------- */
  var SAND = [['#1d1d1d', 'Black'], ['#d3201a', 'Red'], ['#ee7a12', 'Orange'], ['#e6b800', 'Yellow'], ['#1f9d3a', 'Green'], ['#10a89c', 'Teal'], ['#2563eb', 'Blue'], ['#7c3aed', 'Purple'], ['#e0409a', 'Pink'], ['#f4f4f0', 'White'], ['rainbow', 'Rainbow']];
  var sand = document.getElementById('es-sand');
  SAND.forEach(function (c, i) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'es-sw' + (i === 0 ? ' on' : ''); b.title = c[1]; b.setAttribute('aria-label', c[1] + ' sand');
    if (c[0] === 'rainbow') b.style.background = 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)'; else b.style.background = c[0];
    b.addEventListener('click', function () { ink = c[0]; Array.prototype.forEach.call(sand.children, function (x) { x.classList.remove('on'); }); b.classList.add('on'); });
    sand.appendChild(b);
  });

  /* ---------- clock ---------- */
  function startClock() {
    startedAt = Date.now(); clearInterval(clockT);
    clockT = setInterval(function () {
      var s = Math.floor((Date.now() - startedAt) / 1000); clockEl.textContent = Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
      if (s === 300) say('Five minutes. Most cravings fade by now. You rode it out.');
    }, 500);
  }
  function stopClock() { clearInterval(clockT); }

  /* ---------- controls: two knobs + keyboard ---------- */
  var KNOB_PX = 34;   // pixels of travel per radian of knob rotation
  function knob(el, axis) {
    var ang = 0, last = null, id = null, rot = 0;
    function a(e) { var r = el.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); }
    el.addEventListener('pointerdown', function (e) { id = e.pointerId; el.setPointerCapture(id); last = a(e); e.preventDefault(); });
    el.addEventListener('pointermove', function (e) {
      if (e.pointerId !== id || last == null) return;
      var cur = a(e), d = cur - last; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; last = cur;
      rot += d; el.style.transform = 'rotate(' + rot + 'rad)';
      axis === 'x' ? move(d * KNOB_PX, 0) : move(0, d * KNOB_PX);
    });
    function up(e) { if (e.pointerId === id) { id = null; last = null; } }
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', function (e) { e.preventDefault(); var d = (e.deltaY > 0 ? 1 : -1) * .15; rot += d; el.style.transform = 'rotate(' + rot + 'rad)'; axis === 'x' ? move(d * KNOB_PX, 0) : move(0, d * KNOB_PX); }, { passive: false });
    el.spin = function (d) { rot += d; el.style.transform = 'rotate(' + rot + 'rad)'; };
  }
  var kx = document.getElementById('es-kx'), ky = document.getElementById('es-ky');
  knob(kx, 'x'); knob(ky, 'y');
  var KEYMAP = { ArrowLeft: 'l', a: 'l', ArrowRight: 'r', d: 'r', ArrowUp: 'u', w: 'u', ArrowDown: 'd', s: 'd' };
  function active() { return !document.querySelector('[data-view="craving"]').hidden; }
  document.addEventListener('keydown', function (e) {
    if (!active() || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target; if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
    var k = KEYMAP[e.key]; if (!k) return; keys[k] = 1; e.preventDefault();
  });
  document.addEventListener('keyup', function (e) { var k = KEYMAP[e.key]; if (k) delete keys[k]; });
  function loop(id) {
    (function f() {
      if (id !== run) return;
      if (active() && (phase === 'maze' || phase === 'free')) {
        var dx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0), dy = (keys.d ? 1 : 0) - (keys.u ? 1 : 0), s = 1.8;
        if (dx || dy) { move(dx * s, dy * s); if (dx) kx.spin(dx * s / KNOB_PX); if (dy) ky.spin(dy * s / KNOB_PX); }
      }
      raf = requestAnimationFrame(f);
    })();
  }

  document.getElementById('es-new').addEventListener('click', function () { if (phase === 'sketch') return; if (mode === 'free') freeDraw(true); else maze(level); });
  document.getElementById('es-replay').addEventListener('click', function () { stopClock(); startedAt = 0; clockEl.textContent = '0:00'; sketch(); });

  /* start the show when the page is opened; pause everything when it is left */
  document.addEventListener('ss:route', function (e) {
    if (e.detail.name === 'craving') { if (document.getElementById('es').hidden) return; if (phase === 'idle' || phase === 'paused') { startedAt = 0; clockEl.textContent = '0:00'; sketch(); } }
    else if (phase !== 'idle') { run++; cancelAnimationFrame(raf); stopClock(); phase = 'paused'; }
  });
  document.addEventListener('ss:cvgame', function (e) {
    if (e.detail === 'es') { if (phase === 'idle' || phase === 'paused') { startedAt = 0; clockEl.textContent = '0:00'; sketch(); } }
    else if (phase !== 'idle') { run++; cancelAnimationFrame(raf); stopClock(); phase = 'paused'; }
  });
  if ((location.hash || '') === '#craving') setTimeout(sketch, 400);
  window.__esLevel = function (n) { maze(n); };
  window.__es = function () { return { lvl: lvl, phase: phase, px: px, py: py, level: level, tries: tries }; };
})();
