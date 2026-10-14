/* Kraving Killer game 3: Disc-ipline, a 3D disc golf game with real flight physics (see discphys.js).
   Real disc molds with their published flight numbers, six holes, wind, trees, water, and a basket you have to hit the chains on.
   Pick a disc, aim (drag the view or use the slider), set hyzer / anhyzer and the nose angle, hold THROW to charge, release to throw.
   Rendering is WebGL through Three.js (js/vendor/three.min.js), loaded the first time the game opens. */
(function () {
  var root = document.getElementById('dd'); if (!root || !window.DiscPhys) return;
  var P = DiscPhys, $ = function (id) { return document.getElementById(id); };
  var stage = $('dd-stage'), glc = $('dd-gl'), hud = $('dd-hud'), hctx = hud.getContext('2d');
  var elHole = $('dd-hole'), elPar = $('dd-par'), elStr = $('dd-str'), toast = $('dd-toast'), msgEl = $('dd-msg'), over = $('dd-over'), overT = $('dd-over-t'), overS = $('dd-over-s'), nextBtn = $('dd-next');
  var sBank = $('dd-bank'), sLa = $('dd-la'), sAim = $('dd-aim'), lblBank = $('dd-bank-l'), lblLa = $('dd-la-l'), lblAim = $('dd-aim-l'), throwBtn = $('dd-throw'), handBtn = $('dd-hand'), discsEl = $('dd-discs');
  var drawer = $('dd-drawer'), discBtn = $('dd-discbtn'), discDot = $('dd-discdot'), discName = $('dd-discname'), discNums = $('dd-discnums'), fsBtn = $('dd-fs');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function mix(a, b, k) { return a + (b - a) * k; }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ---------- the course: six holes (x = right, y = forward, metres) ---------- */
  var HOLES = [
    { name: 'Warm-Up', par: 3, path: [[0, 0], [0, 78]], width: 38, wind: [1, 0.5], trees: [[-14, 30], [16, 52], [-12, 66]], water: [], tight: 0 },
    { name: 'Left Hook', par: 3, path: [[0, 0], [0, 52], [-30, 98]], width: 26, wind: [-2, 0], trees: [[7, 38], [9, 58], [3, 74], [-3, 52], [-12, 78]], water: [], tight: 0 },
    { name: 'Don’t Fall In The Drink', par: 3, path: [[0, 0], [0, 108]], width: 30, wind: [3, 0], trees: [[-12, 34], [-13, 70], [10, 20]], water: [[7, 42, 46, 98]], tight: 0 },
    { name: 'The Tunnel', par: 3, path: [[0, 0], [0, 86]], width: 12, wind: [0, 1], trees: [[-3, 38], [3.2, 60]], water: [], tight: 1 },
    { name: 'Dogleg Right', par: 4, path: [[0, 0], [0, 72], [36, 116], [42, 128]], width: 24, wind: [2, -1], trees: [[14, 78], [18, 90], [9, 88], [26, 99], [-8, 100]], water: [], tight: 0 },
    { name: 'Sober Finale', par: 4, path: [[0, 0], [0, 70], [8, 128], [0, 156]], width: 22, wind: [-3, -3], trees: [[-8, 90], [14, 110], [-6, 128]], water: [[-60, 82, -9, 124], [19, 82, 60, 124], [-60, 138, -14, 170], [14, 138, 60, 170]], tight: 0 }
  ];
  var HOLE_N = HOLES.length, MAPX = 100;

  function segDist(px, py, ax, ay, bx, by) { var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0; var cx = ax + dx * t, cy = ay + dy * t; return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy)); }
  function pathDist(h, x, y) { var m = 1e9; for (var i = 0; i < h.path.length - 1; i++) m = Math.min(m, segDist(x, y, h.path[i][0], h.path[i][1], h.path[i + 1][0], h.path[i + 1][1])); return m; }
  function inWater(h, x, y) { for (var i = 0; i < h.water.length; i++) { var w = h.water[i]; if (x > w[0] && x < w[2] && y > w[1] && y < w[3]) return true; } return false; }
  function terrain(h, x, y) {
    if (inWater(h, x, y)) return 'water';
    var d = pathDist(h, x, y), b = h.basket;
    if (d > 62 || y < -30 || y > b[1] + 55) return 'ob';
    if (d < h.width / 2 || Math.hypot(x - b[0], y - b[1]) < 7) return 'fair';
    return 'rough';
  }
  function buildHole(i) {
    var h = HOLES[i]; h.tee = h.path[0]; h.basket = h.path[h.path.length - 1];
    if (h.built) return h; h.built = true;
    var r = rng(1234 + i * 77), tr = [];
    h.trees.forEach(function (t) { tr.push({ x: t[0], y: t[1], h: rnd(8, 12), big: true }); });
    var count = h.tight ? 150 : 95;
    for (var n = 0; n < count; n++) {
      var yy = r() * (h.basket[1] + 40) - 10, xx = (r() - 0.5) * 170 + (h.path[Math.min(h.path.length - 1, 1)][0] * 0.5);
      var dd = pathDist(h, xx, yy), gap = h.width / 2 + (h.tight ? 0.8 : 3 + r() * 5);
      if (dd < gap || inWater(h, xx, yy) || Math.hypot(xx - h.tee[0], yy - h.tee[1]) < 7 || Math.hypot(xx - h.basket[0], yy - h.basket[1]) < 8) continue;
      tr.push({ x: xx, y: yy, h: 7 + r() * 6 });
    }
    if (h.tight) for (var yy2 = 6; yy2 < h.basket[1]; yy2 += 4.5) { [-1, 1].forEach(function (sd) { var tx = h.path[0][0] + sd * (h.width / 2 + 0.9 + r() * 0.8); if (Math.abs(yy2 - 38) < 2 && sd < 0) return; tr.push({ x: tx, y: yy2 + r() * 1.5, h: 9 + r() * 4 }); }); }
    tr.forEach(function (t) { t.s = 0.85 + r() * 0.5; t.rot = r() * 6.28; t.tone = r(); });
    h.treeList = tr;
    return h;
  }

  /* ---------- game state ---------- */
  var G = null, running = false, raf = 0, last = 0, chargeT = 0, charging = false, cam = { x: 0, y: -3, z: 3, yaw: 0, pitch: 0.1 };
  var disc = P.DISCS.destroyer, spin = 1, best = 0, previewDirty = true, ready = false, loading = false, failed = false, simTime = 0;
  try { best = +localStorage.getItem('ss-disc-best') || 0; } catch (e) {}

  function newRound() {
    G = { hole: 0, scores: [], phase: 'aim', strokes: 0, lie: null, prev: null, aimOff: 0, flight: null, trail: [], throws: [], roll: null, rest: 0, done: false, wob: 0, drop: null, chainHit: false };
    startHole();
  }
  function startHole() {
    var h = buildHole(G.hole); G.h = h; G.strokes = 0; G.lie = [h.tee[0], h.tee[1]]; G.prev = null; G.throws = [[h.tee[0], h.tee[1]]]; G.trail = []; G.flight = null; G.phase = 'aim'; G.aimOff = 0; G.wind = h.wind; G.wob = 0; G.drop = null; G.chainHit = false;
    pickDiscFor(); aimBase(); syncUi(); over.hidden = true; say('Hole ' + (G.hole + 1) + ': ' + h.name + '. Par ' + h.par + '. ' + Math.round(distToBasket()) + ' m to the basket.');
    if (ready) buildCourse(h);
    snapCam(); previewDirty = true;
  }
  function distToBasket() { return Math.hypot(G.h.basket[0] - G.lie[0], G.h.basket[1] - G.lie[1]); }
  function aimBase() { G.base = Math.atan2(G.h.basket[0] - G.lie[0], G.h.basket[1] - G.lie[1]); }
  function aim() { return G.base + G.aimOff; }
  function pickDiscFor() { var d = distToBasket(); chooseDisc(d < 30 ? 'aviar' : d < 65 ? 'buzzz' : d < 100 ? 'teebird' : 'destroyer'); }
  function say(t) { toast.textContent = t; toast.classList.add('on'); clearTimeout(say.t); say.t = setTimeout(function () { toast.classList.remove('on'); }, 4200); }
  function flash(t) { msgEl.textContent = t; msgEl.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(function () { msgEl.hidden = true; }, 1700); }

  /* ---------- UI wiring ---------- */
  P.LIST.forEach(function (d) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'dd-disc'; b.setAttribute('data-disc', d.id);
    b.innerHTML = '<i style="background:' + d.col + '"></i><em>' + d.kind + '</em><b>' + d.name + '</b><small>' + d.speed + ' | ' + d.glide + ' | ' + d.turn + ' | ' + d.fade + '</small><em>' + d.brand + '</em>';
    b.addEventListener('click', function () { chooseDisc(d.id); setDrawer(false); }); discsEl.appendChild(b);
  });
  function setDrawer(on) { drawer.hidden = !on; discBtn.setAttribute('aria-expanded', String(on)); }
  discBtn.addEventListener('click', function () { setDrawer(drawer.hidden); });
  function chooseDisc(id) {
    disc = P.DISCS[id];
    Array.prototype.forEach.call(discsEl.children, function (b) { b.classList.toggle('on', b.getAttribute('data-disc') === id); });
    discDot.style.background = disc.col; discName.textContent = disc.brand + ' ' + disc.name; discNums.textContent = disc.kind + ' · ' + disc.speed + ' | ' + disc.glide + ' | ' + disc.turn + ' | ' + disc.fade;
    sLa.value = disc.speed <= 3 ? 9 : disc.speed <= 6 ? 8 : 7; syncUi(); previewDirty = true;
  }
  function syncUi() {
    var bk = +sBank.value, la = +sLa.value, am = Math.round(G ? G.aimOff * 57.3 : 0);
    lblBank.textContent = bk === 0 ? 'Flat' : (bk > 0 ? 'Hyzer ' + bk + '°' : 'Anhyzer ' + (-bk) + '°');
    lblLa.textContent = la + '°'; lblAim.textContent = am === 0 ? 'Straight' : (am > 0 ? am + '° right' : (-am) + '° left');
    sAim.value = am; handBtn.textContent = spin === 1 ? 'Backhand' : 'Forehand'; handBtn.setAttribute('aria-pressed', String(spin !== 1));
    if (G) { elHole.textContent = 'Hole ' + (G.hole + 1) + '/' + HOLE_N; elPar.textContent = 'Par ' + G.h.par; elStr.textContent = 'Throws ' + G.strokes; }
    previewDirty = true;
  }
  [sBank, sLa].forEach(function (s) { s.addEventListener('input', syncUi); });
  sAim.addEventListener('input', function () { if (G && G.phase === 'aim') { G.aimOff = (+sAim.value) / 57.3; syncUi(); } });
  handBtn.addEventListener('click', function () { spin = -spin; syncUi(); });
  nextBtn.addEventListener('click', function () { if (G.done) { newRound(); } else { G.hole++; startHole(); } });

  // drag the view to aim
  var dragX = null;
  glc.addEventListener('pointerdown', function (e) { setDrawer(false); if (G && G.phase === 'aim') { dragX = e.clientX; try { glc.setPointerCapture(e.pointerId); } catch (x) {} } });
  glc.addEventListener('pointermove', function (e) { if (dragX === null || !G || G.phase !== 'aim') return; var dx = e.clientX - dragX; dragX = e.clientX; G.aimOff = clamp(G.aimOff + dx * 0.0035 * (720 / glc.getBoundingClientRect().width), -0.8, 0.8); syncUi(); });
  glc.addEventListener('pointerup', function () { dragX = null; }); glc.addEventListener('pointercancel', function () { dragX = null; });

  // charge and throw
  function startCharge() { if (!G || G.phase !== 'aim') return; setDrawer(false); charging = true; chargeT = performance.now(); G.phase = 'charge'; }
  function release() { if (!charging) return; charging = false; var pw = chargeLevel(); G.phase = 'aim'; throwBtn.style.setProperty('--pw', 0); doThrow(pw); }
  function chargeLevel() { return clamp((performance.now() - chargeT) / 1050, 0.04, 1); }
  throwBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); try { throwBtn.setPointerCapture(e.pointerId); } catch (x) {} startCharge(); });
  throwBtn.addEventListener('pointerup', release); throwBtn.addEventListener('pointercancel', function () { if (charging) { charging = false; G.phase = 'aim'; throwBtn.style.setProperty('--pw', 0); } });
  throwBtn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('keydown', function (e) {
    if (root.hidden || document.querySelector('[data-view="craving"]').hidden || !G) return;
    var t = e.target; if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
    if (e.key === ' ' && !(t && /^button$/i.test(t.tagName))) { e.preventDefault(); if (!e.repeat) startCharge(); }
    else if (e.key === 'ArrowLeft' && G.phase === 'aim') { G.aimOff = clamp(G.aimOff - 0.02, -0.8, 0.8); syncUi(); }
    else if (e.key === 'ArrowRight' && G.phase === 'aim') { G.aimOff = clamp(G.aimOff + 0.02, -0.8, 0.8); syncUi(); }
    else if (e.key === 'Escape' && stage.classList.contains('fs')) setFs(false, false);
  });
  document.addEventListener('keyup', function (e) { if (e.key === ' ') release(); });

  // full screen (and automatic on a phone turned sideways)
  function setFs(on, native) {
    stage.classList.toggle('fs', on); document.documentElement.classList.toggle('dd-lock', on); fsBtn.setAttribute('aria-pressed', String(on)); fsBtn.textContent = on ? 'Exit full screen' : 'Full screen';
    if (native) { try { if (on && stage.requestFullscreen) stage.requestFullscreen().catch(function () {}); else if (!on && document.fullscreenElement) document.exitFullscreen(); } catch (er) {} }
    setTimeout(resize, 60);
  }
  fsBtn.addEventListener('click', function () { setFs(!stage.classList.contains('fs'), true); });
  document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement && stage.classList.contains('fs') && !(autoFs && autoFs.matches)) setFs(false, false); });
  var autoFs = window.matchMedia && matchMedia('(orientation: landscape) and (max-height: 520px) and (pointer: coarse)');
  function onTurn() { if (running) setFs(autoFs.matches, false); }
  if (autoFs) { if (autoFs.addEventListener) autoFs.addEventListener('change', onTurn); else if (autoFs.addListener) autoFs.addListener(onTurn); }

  /* ---------- the throw ---------- */
  function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 0.75; }
  function doThrow(pw) {
    var noise = gauss() * 0.045 * pw * pw * (0.45 + disc.speed / 14), hy = (+sBank.value) / 57.3, la = (+sLa.value) / 57.3;
    G.strokes++; G.prev = [G.lie[0], G.lie[1]];
    var s = P.launch(G.lie[0], G.lie[1], disc, pw, aim(), hy, la, spin, noise);
    G.flight = s; G.trail = [[s.p[0], s.p[1], s.p[2]]]; G.phase = 'fly'; G.hit = null; G.chainHit = false; G.flightDisc = disc; syncUi();
  }
  function wind() { return [G.wind[0] * 0.55, G.wind[1] * 0.55]; }

  // Does the disc get the chains? Soft, centred hits drop in. Fast hits and edge hits kick out. Low shots hit the tray and base.
  var BR = 0.105;
  function basketCheck(s) {
    var b = G.h.basket, p = s.p, dx = p[0] - b[0], dy = p[1] - b[1], dxy = Math.hypot(dx, dy), z = p[2];
    if (dxy > 1.4 || z > 1.9) { G.chainHit = false; return null; }
    var spd = Math.hypot(s.v[0], s.v[1], s.v[2]), vh = Math.hypot(s.v[0], s.v[1]) || 1, ox = dx / (dxy || 1), oy = dy / (dxy || 1);
    var rch = 0.2 + 0.1 * clamp((1.38 - z) / 0.5, 0, 1);                       // the chain curtain is a funnel, narrower at the top
    if (z > 0.8 && z < 1.4 && dxy < rch + BR) {
      if (G.chainHit) return null;
      G.chainHit = true;
      var ux = s.v[0] / vh, uy = s.v[1] / vh, miss = Math.abs(dx * uy - dy * ux);   // how far off centre the line of flight is
      var soft = clamp(1.03 - (spd - 8) / 19, 0.1, 0.97), aimQ = miss < 0.15 ? 1 : miss < 0.28 ? 0.78 : 0.45, rising = s.v[2] > 1.5 ? 0.5 : 1;
      if (Math.random() < soft * aimQ * rising) return { kind: 'in', spd: spd };
      s.v[0] = ox * Math.min(4, 0.3 * vh) + s.v[0] * -0.12 + rnd(-0.6, 0.6); s.v[1] = oy * Math.min(4, 0.3 * vh) + s.v[1] * -0.12 + rnd(-0.6, 0.6); s.v[2] = rnd(0.5, 2); G.wob = Math.max(G.wob, clamp(spd / 18, 0.3, 1));
      return { kind: 'rattle', spd: spd };
    }
    if (dxy > rch + BR + 0.25) G.chainHit = false;
    if (z >= 0.4 && z <= 0.8 && dxy < 0.36 + BR) { s.v[0] = ox * 1.8 - s.v[0] * 0.25; s.v[1] = oy * 1.8 - s.v[1] * 0.25; s.v[2] = Math.max(s.v[2], 0.4) * 0.4 + 0.6; p[0] = b[0] + ox * (0.36 + BR + 0.02); p[1] = b[1] + oy * (0.36 + BR + 0.02); return { kind: 'tray', spd: spd }; }
    if (z >= 1.4 && z <= 1.62 && dxy < 0.27) { s.v[0] = ox * 2 + s.v[0] * 0.1; s.v[1] = oy * 2 + s.v[1] * 0.1; s.v[2] = Math.abs(s.v[2]) * 0.2 + 0.8; return { kind: 'top', spd: spd }; }
    return null;
  }

  function flightStep(dt) {
    var s = G.flight, h = G.h, near = Math.hypot(s.p[0] - h.basket[0], s.p[1] - h.basket[1]) < 8, n = Math.max(1, Math.round(dt * 120)) * (near ? 3 : 1), sub = dt / n;
    for (var k = 0; k < n; k++) {
      P.step(s, sub, wind()); var p = s.p;
      if (Math.round(s.t * 40) !== s._lt) { s._lt = Math.round(s.t * 40); G.trail.push([p[0], p[1], p[2]]); if (G.trail.length > 520) G.trail.shift(); }
      var tl = h.treeList;
      for (var i = 0; i < tl.length; i++) {
        var t = tl[i]; if (Math.abs(t.x - p[0]) > 3 || Math.abs(t.y - p[1]) > 3) continue;
        var dx = p[0] - t.x, dy = p[1] - t.y, d = Math.hypot(dx, dy), z = p[2], th = t.h * t.s, rr = z < 2 ? 0.45 : (z < th ? 0.45 + 1.15 * t.s * (1 - (z - 2) / (th - 2)) : 0);
        if (z > 0.1 && z < th && d < rr) {
          var nx = dx / (d || 1), ny = dy / (d || 1), dot = s.v[0] * nx + s.v[1] * ny;
          s.v[0] = (s.v[0] - 1.6 * dot * nx) * 0.18; s.v[1] = (s.v[1] - 1.6 * dot * ny) * 0.18; s.v[2] = Math.min(s.v[2], 0) * 0.3 - 1;
          p[0] = t.x + nx * (rr + 0.05); p[1] = t.y + ny * (rr + 0.05); G.hit = 'tree'; s.bank *= 0.2; G.shake = 0.25;
        }
      }
      var bc = basketCheck(s);
      if (bc) {
        if (bc.kind === 'in') { holeOut(bc.spd); return; }
        G.hit = bc.kind; G.shake = 0.18;
        flash(bc.kind === 'rattle' ? 'Rattled out!' : bc.kind === 'top' ? 'Off the top!' : 'Off the tray!');
      }
      if (p[2] <= 0 && s.v[2] < 0) { p[2] = 0; land(); return; }
      if (s.t > 14) { land(); return; }
    }
  }

  function land() {
    var s = G.flight, h = G.h, p = s.p, tType = terrain(h, p[0], p[1]);
    G.trail.push([p[0], p[1], 0]);
    if (tType === 'water') { G.splash = { x: p[0], y: p[1], t: 0 }; return rest([p[0], p[1]], 'water'); }
    var ro = P.rollOut(s, tType === 'rough' ? 1.9 : 1), steps = Math.max(1, Math.ceil(Math.hypot(ro[0], ro[1]))), fx = p[0], fy = p[1], stopped = false;
    for (var i = 1; i <= steps && !stopped; i++) {
      var tx = p[0] + ro[0] * i / steps, ty = p[1] + ro[1] * i / steps;
      if (inWater(h, tx, ty)) { fx = tx; fy = ty; stopped = true; break; }
      for (var j = 0; j < h.treeList.length; j++) { var t = h.treeList[j]; if (Math.hypot(tx - t.x, ty - t.y) < 0.6) { stopped = true; break; } }
      if (!stopped) { fx = tx; fy = ty; }
    }
    G.roll = { x0: p[0], y0: p[1], x1: fx, y1: fy, t: 0, dur: clamp(Math.hypot(fx - p[0], fy - p[1]) / 6, 0.25, 1.3), bank: s.bank, rot: s.rot }; G.phase = 'roll';
  }
  function rest(pos, why) {
    var h = G.h; G.phase = 'rest'; G.rest = performance.now(); G.restDisc = G.flight ? G.flight.disc : disc; G.flight = null;
    var t = why || terrain(h, pos[0], pos[1]);
    if (t === 'water' || t === 'ob') {
      G.strokes++; G.lie = [G.prev[0], G.prev[1]];
      say(t === 'water' ? 'Splash! Don’t fall in the drink. +1 stroke, throw again from the same spot.' : 'Out of bounds. +1 stroke, throw again from the same spot.');
      G.throws.push([G.lie[0], G.lie[1]]);
    } else {
      var dthrow = Math.hypot(pos[0] - G.prev[0], pos[1] - G.prev[1]); G.lie = [pos[0], pos[1]]; G.throws.push([pos[0], pos[1]]);
      var db = distToBasket();
      if (G.hit === 'tree') say('Tree! ' + Math.round(dthrow) + ' m. ' + Math.round(db) + ' m to the basket.');
      else say(Math.round(dthrow) + ' m. ' + (db < 1.2 ? 'Right at the basket.' : Math.round(db) + ' m to the basket.') + (t === 'rough' ? ' In the rough.' : ''));
      if (db < 0.35) { G.strokes++; say('Kicked to the base: tap-in.'); holeOutScore(true); return; }
    }
    if (G.strokes >= G.h.par + 5) { say('Pick it up. Max strokes this hole.'); holeOutScore(false); return; }
    aimBase(); G.aimOff = 0; pickDiscFor(); syncUi();
  }
  function holeOut(spd) {
    var s = G.flight, b = G.h.basket; G.drop = { t: 0, x0: s.p[0], y0: s.p[1], z0: s.p[2], x1: b[0], y1: b[1], z1: 0.8, bank: s.bank }; G.wob = Math.max(G.wob, clamp(spd / 14, 0.4, 1.2)); G.shake = 0.2; G.flight.v = [0, 0, 0];
    chainSound(); flash('Chains!'); holeOutScore(false, true);
  }
  function holeOutScore(tapIn, chains) {
    G.phase = 'holed'; var st = G.strokes, par = G.h.par, diff = st - par; G.scores.push(st);
    var name = st === 1 ? 'ACE!' : diff <= -2 ? 'Eagle!' : diff === -1 ? 'Birdie!' : diff === 0 ? 'Par. Straight and sober.' : diff === 1 ? 'Bogey. A small stumble.' : 'Rough one. Keep your head up.';
    var last = G.hole === HOLE_N - 1; G.done = last;
    overT.textContent = (chains ? 'CHAINS! ' : '') + name;
    overS.textContent = 'Hole ' + (G.hole + 1) + ' in ' + st + ' (par ' + par + ').';
    if (last) {
      var tot = G.scores.reduce(function (a, b) { return a + b; }, 0), totPar = HOLES.reduce(function (a, h) { return a + h.par; }, 0), vs = tot - totPar;
      overT.textContent = 'Round complete';
      overS.textContent = 'Final: ' + tot + ' (' + (vs === 0 ? 'even' : vs > 0 ? '+' + vs : vs) + '). ' + (best && best <= tot ? 'Best round: ' + best + '.' : 'New best round!') + ' Every throw sober.';
      if (!best || tot < best) { best = tot; try { localStorage.setItem('ss-disc-best', String(best)); } catch (e) {} }
      nextBtn.textContent = 'Play again';
    } else nextBtn.textContent = 'Next hole';
    syncUi(); setTimeout(function () { if (G && G.phase === 'holed') over.hidden = false; }, chains ? 1500 : 500);
  }

  // a soft chain rattle made from filtered noise (only after the player has pressed something)
  var actx = null;
  function chainSound() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume();
      var len = Math.floor(actx.sampleRate * 0.7), buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) { var tt = i / actx.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.exp(-tt * 6) * (0.55 + 0.45 * Math.sin(tt * 190)) * (Math.random() < 0.04 ? 1.8 : 1); }
      var src = actx.createBufferSource(), hp = actx.createBiquadFilter(), g = actx.createGain(); hp.type = 'highpass'; hp.frequency.value = 2400; g.gain.value = 0.28; src.buffer = buf; src.connect(hp); hp.connect(g); g.connect(actx.destination); src.start();
    } catch (e) {}
  }

  /* ---------- camera ---------- */
  function angDiff(a, b) { var d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
  function targetCam() {
    if (G.phase === 'fly' && G.flight) {
      var s = G.flight, hd = Math.atan2(s.v[0], s.v[1]), cz = Math.max(2.4, s.p[2] + 1.8), back = 9;
      return { x: s.p[0] - Math.sin(hd) * back, y: s.p[1] - Math.cos(hd) * back, z: cz, yaw: hd, pitch: clamp(Math.atan((cz - s.p[2]) / back) + 0.02, 0.02, 0.5) };
    }
    if (G.phase === 'roll' && G.roll) { var r = G.roll, ha = Math.atan2(r.x1 - r.x0, r.y1 - r.y0); return { x: r.x0 - Math.sin(aim()) * 8, y: r.y0 - Math.cos(aim()) * 8, z: 3.2, yaw: cam.yaw, pitch: 0.16 }; }
    if (G.phase === 'holed') { var b = G.h.basket, ya = G.base; return { x: b[0] - Math.sin(ya) * 3.4 + Math.cos(ya) * 1.2, y: b[1] - Math.cos(ya) * 3.4 - Math.sin(ya) * 1.2, z: 1.7, yaw: Math.atan2(b[0] - (b[0] - Math.sin(ya) * 3.4 + Math.cos(ya) * 1.2), b[1] - (b[1] - Math.cos(ya) * 3.4 - Math.sin(ya) * 1.2)), pitch: 0.17 }; }
    var a = aim(); return { x: G.lie[0] - Math.sin(a) * 5.0, y: G.lie[1] - Math.cos(a) * 5.0, z: 1.9, yaw: a, pitch: 0.12 };
  }
  function snapCam() { var t = targetCam(); cam = { x: t.x, y: t.y, z: t.z, yaw: t.yaw, pitch: t.pitch }; }
  function moveCam(dt) {
    var t = targetCam(), k = 1 - Math.exp(-dt * (G.phase === 'fly' ? 7 : 3.2));
    cam.x += (t.x - cam.x) * k; cam.y += (t.y - cam.y) * k; cam.z += (t.z - cam.z) * k; cam.yaw += angDiff(t.yaw, cam.yaw) * k; cam.pitch += (t.pitch - cam.pitch) * k;
  }

  /* ---------- Three.js scene ---------- */
  var T, R, scene, camera, sun, hemi, courseGroup, discMesh, markMeshes = [], trailLine, trailGeo, prevLine, prevGeo, prevEnd, teeRing, basketObj, waterMats = [], waterTex, groundTex, curBuilt = -1, noiseTile;
  var TRAILN = 600, PREVN = 220, isLow = (navigator.hardwareConcurrency || 4) < 4 || /Android|iPhone|iPad/i.test(navigator.userAgent);
  function loadThree(cb) {
    if (window.THREE) return cb(true);
    var sc = document.createElement('script'); sc.src = 'js/vendor/three.min.js?v=149'; sc.onload = function () { cb(!!window.THREE); }; sc.onerror = function () { cb(false); }; document.head.appendChild(sc);
  }
  function V(x, y, z) { return new T.Vector3(x, z, -y); }
  function mapV(a) { return [a[0], a[2], -a[1]]; }

  function skyTexture() {
    var c = document.createElement('canvas'); c.width = 8; c.height = 512; var g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, '#142453'); gr.addColorStop(0.28, '#3b5a9a'); gr.addColorStop(0.42, '#9aa6c8'); gr.addColorStop(0.47, '#f4b27a'); gr.addColorStop(0.5, '#f0a064'); gr.addColorStop(1, '#f0a064');
    g.fillStyle = gr; g.fillRect(0, 0, 8, 512); var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
  }
  function glowTexture() {
    var c = document.createElement('canvas'); c.width = c.height = 256; var g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 4, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,248,225,1)'); gr.addColorStop(0.08, 'rgba(255,236,190,.95)'); gr.addColorStop(0.22, 'rgba(255,190,120,.5)'); gr.addColorStop(1, 'rgba(255,150,90,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256); var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
  }
  function makeNoise() {
    var c = document.createElement('canvas'); c.width = c.height = 256; var g = c.getContext('2d'), im = g.createImageData(256, 256), r = rng(99);
    for (var i = 0; i < 65536; i++) { var v = 128 + (r() - 0.5) * 90 + (r() - 0.5) * 40; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
    for (var k = 0; k < 400; k++) { g.fillStyle = 'rgba(' + (r() < 0.5 ? '0,0,0' : '255,255,255') + ',' + (0.03 + r() * 0.05).toFixed(2) + ')'; g.beginPath(); g.arc(r() * 256, r() * 256, 4 + r() * 18, 0, 6.3); g.fill(); }
    return c;
  }
  function waveTexture() {
    var c = document.createElement('canvas'); c.width = c.height = 256; var g = c.getContext('2d'), r = rng(7); g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 160; i++) { var x = r() * 256, y = r() * 256, w = 12 + r() * 40, a = 0.1 + r() * 0.18; g.strokeStyle = 'rgba(' + (r() < 0.5 ? '255,255,255' : '0,0,0') + ',' + a.toFixed(2) + ')'; g.lineWidth = 1.5 + r() * 2.5; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 5 - r() * 6, x + w, y); g.stroke(); }
    var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t;
  }

  function initThree() {
    T = window.THREE; if (T.ColorManagement) T.ColorManagement.legacyMode = false;
    R = new T.WebGLRenderer({ canvas: glc, antialias: !isLow, powerPreference: 'high-performance' });
    R.outputEncoding = T.sRGBEncoding; R.setPixelRatio(Math.min(window.devicePixelRatio || 1, isLow ? 1.5 : 2));
    R.shadowMap.enabled = true; R.shadowMap.type = isLow ? T.PCFShadowMap : T.PCFSoftShadowMap;
    scene = new T.Scene(); scene.fog = new T.Fog(0xe9a874, 70, 640);
    camera = new T.PerspectiveCamera(55, 16 / 10, 0.15, 2500);
    // sky dome, sun glow and far ridges
    var sky = new T.Mesh(new T.SphereGeometry(1800, 24, 16), new T.MeshBasicMaterial({ map: skyTexture(), side: T.BackSide, fog: false, depthWrite: false })); sky.renderOrder = -2; sky.name = 'sky'; scene.add(sky);
    var glow = new T.Sprite(new T.SpriteMaterial({ map: glowTexture(), fog: false, depthWrite: false, blending: T.AdditiveBlending, transparent: true })); glow.scale.set(520, 520, 1); glow.position.set(560, 190, -1500); glow.name = 'glow'; scene.add(glow);
    [[560, 0x4a3a58, 22], [820, 0x6a4f62, 30]].forEach(function (rg, ri) {
      var N = 96, pos = [], idx = [], rad = rg[0];
      for (var i = 0; i <= N; i++) { var a = i / N * Math.PI * 2, hh = rg[2] * (0.5 + 0.28 * Math.sin(a * 3 + ri) + 0.2 * Math.sin(a * 7.3 + 1 + ri) + 0.1 * Math.sin(a * 13)); pos.push(Math.sin(a) * rad, -8, -Math.cos(a) * rad, Math.sin(a) * rad, hh, -Math.cos(a) * rad); if (i < N) { var k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
      var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      var m = new T.Mesh(g, new T.MeshBasicMaterial({ color: rg[1], side: T.DoubleSide })); m.name = 'ridge'; scene.add(m);
    });
    hemi = new T.HemisphereLight(0xffd9b0, 0x34452c, 0.95); scene.add(hemi);
    sun = new T.DirectionalLight(0xffe0b0, 1.55); sun.castShadow = true; var sz = isLow ? 1024 : 2048; sun.shadow.mapSize.set(sz, sz);
    var sc = sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 260; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
    scene.add(sun); scene.add(sun.target);
    noiseTile = makeNoise(); waterTex = waveTexture();
    discMesh = makeDisc(); scene.add(discMesh);
    for (var i = 0; i < 8; i++) { var m2 = makeDisc(true); m2.visible = false; markMeshes.push(m2); scene.add(m2); }
    trailGeo = new T.BufferGeometry(); trailGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(TRAILN * 3), 3)); trailGeo.setDrawRange(0, 0);
    trailLine = new T.Line(trailGeo, new T.LineBasicMaterial({ color: 0xffd9bd, transparent: true, opacity: 0.7, fog: false })); trailLine.frustumCulled = false; scene.add(trailLine);
    prevGeo = new T.BufferGeometry(); prevGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(PREVN * 3), 3)); prevGeo.setDrawRange(0, 0);
    prevLine = new T.Line(prevGeo, new T.LineDashedMaterial({ color: 0xffffff, dashSize: 0.9, gapSize: 0.7, transparent: true, opacity: 0.8, fog: false })); prevLine.frustumCulled = false; scene.add(prevLine);
    prevEnd = new T.Mesh(new T.RingGeometry(0.5, 0.75, 28), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false })); prevEnd.rotation.x = -Math.PI / 2; scene.add(prevEnd);
    teeRing = new T.Mesh(new T.RingGeometry(0.28, 0.4, 28), new T.MeshBasicMaterial({ color: 0xff2a35, side: T.DoubleSide })); teeRing.rotation.x = -Math.PI / 2; scene.add(teeRing);
    courseGroup = new T.Group(); scene.add(courseGroup);
    resize();
  }

  // a real disc shape: domed top, rolled rim, hollow underside; colour and rim stripe come from the mold
  var discGeo = null;
  function makeDisc(small) {
    if (!discGeo) {
      var pts = [[0, 0.0235], [0.045, 0.0245], [0.075, 0.0232], [0.092, 0.0205], [0.1015, 0.0145], [0.1055, 0.0085], [0.1035, 0.0025], [0.0985, -0.0005], [0.093, 0.0005], [0.0905, 0.007], [0.082, 0.0105], [0.05, 0.0112], [0, 0.0112]];
      discGeo = new T.LatheGeometry(pts.map(function (q) { return new T.Vector2(q[0], q[1]); }), 40);
    }
    var g = new T.Group(), body = new T.Mesh(discGeo, new T.MeshPhongMaterial({ color: 0xff4a55, shininess: 70, specular: 0x555555, side: T.DoubleSide }));
    body.castShadow = true; body.name = 'body';
    var ring = new T.Mesh(new T.TorusGeometry(0.0975, 0.0035, 6, 40), new T.MeshPhongMaterial({ color: 0xffffff, shininess: 30 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.0165; ring.name = 'ring';
    var stamp = new T.Mesh(new T.CircleGeometry(0.034, 24), new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide })); stamp.rotation.x = -Math.PI / 2; stamp.position.y = 0.0248; stamp.name = 'stamp';
    var bar = new T.Mesh(new T.PlaneGeometry(0.05, 0.012), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 })); bar.rotation.x = -Math.PI / 2; bar.position.y = 0.0252; bar.name = 'bar';
    var spinner = new T.Group(); spinner.name = 'spin'; spinner.add(body, ring, stamp, bar); g.add(spinner); g.userData.spinner = spinner;
    return g;
  }
  function paintDisc(m, d) {
    m.userData.spinner.children.forEach(function (c) {
      if (c.name === 'body') c.material.color.set(d.col); else if (c.name === 'ring') c.material.color.set(d.rim); else if (c.name === 'stamp') c.material.color.set(d.rim);
    });
  }

  function chainsGeometry() {
    // 24 chains from the upper band down to the lower ring, plus the cage ribs; positions are rebuilt for the rattle
    var N = 24, S = 6, arr = new Float32Array(N * S * 2 * 3);
    return { N: N, S: S, arr: arr, geo: (function () { var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(arr, 3)); return g; })() };
  }
  function makeBasket() {
    var g = new T.Group(), steel = new T.MeshStandardMaterial({ color: 0xc9ced4, metalness: 0.85, roughness: 0.3 }), dark = new T.MeshStandardMaterial({ color: 0x2b2f35, metalness: 0.5, roughness: 0.55 }), red = new T.MeshStandardMaterial({ color: 0xd3131c, roughness: 0.45, metalness: 0.1 });
    var pole = new T.Mesh(new T.CylinderGeometry(0.03, 0.036, 1.42, 12), steel); pole.position.y = 0.71; pole.castShadow = true; g.add(pole);
    var foot = new T.Mesh(new T.CylinderGeometry(0.16, 0.2, 0.05, 20), new T.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.9 })); foot.position.y = 0.02; g.add(foot);
    var trayPts = [[0.035, 0.0], [0.1, 0.012], [0.3, 0.05], [0.345, 0.095], [0.34, 0.105], [0.3, 0.07], [0.1, 0.03], [0.035, 0.02]].map(function (q) { return new T.Vector2(q[0], q[1]); });
    var tray = new T.Mesh(new T.LatheGeometry(trayPts, 36), dark); tray.position.y = 0.66; tray.castShadow = true; g.add(tray);
    var lower = new T.Mesh(new T.TorusGeometry(0.3, 0.008, 8, 40), steel); lower.rotation.x = Math.PI / 2; lower.position.y = 0.86; g.add(lower);
    var band = new T.Mesh(new T.TorusGeometry(0.2, 0.02, 10, 40), red); band.rotation.x = Math.PI / 2; band.position.y = 1.38; band.castShadow = true; g.add(band);
    for (var i = 0; i < 8; i++) {   // the cage ribs arch from the pole top to the band
      var a = i / 8 * Math.PI * 2, c = new T.QuadraticBezierCurve3(new T.Vector3(0, 1.46, 0), new T.Vector3(Math.cos(a) * 0.1, 1.5, Math.sin(a) * 0.1), new T.Vector3(Math.cos(a) * 0.2, 1.38, Math.sin(a) * 0.2));
      var rib = new T.Mesh(new T.TubeGeometry(c, 8, 0.008, 5), steel); g.add(rib);
    }
    var cap = new T.Mesh(new T.SphereGeometry(0.045, 12, 8), red); cap.position.y = 1.47; g.add(cap);
    var ch = chainsGeometry(); basketObj = { group: g, chain: ch };
    var lines = new T.LineSegments(ch.geo, new T.LineBasicMaterial({ color: 0xe6eaee })); lines.frustumCulled = false; g.add(lines); basketObj.lines = lines;
    // a tall pennant so the basket can be found from the tee
    var fp = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 5.2, 6), new T.MeshStandardMaterial({ color: 0xeeeeee })); fp.position.set(-0.5, 2.6, 0); g.add(fp);
    var sh = new T.Shape(); sh.moveTo(0, 0); sh.lineTo(1.1, -0.28); sh.lineTo(0, -0.56); var flag = new T.Mesh(new T.ShapeGeometry(sh), new T.MeshBasicMaterial({ color: 0xff2a35, side: T.DoubleSide })); flag.position.set(-0.5, 5.15, 0); basketObj.flag = flag; g.add(flag);
    return g;
  }
  function updateChains(t, amp) {
    var ch = basketObj.chain, N = ch.N, S = ch.S, a = ch.arr, o = 0;
    for (var i = 0; i < N; i++) {
      var ang = i / N * Math.PI * 2, cx = Math.cos(ang), sz = Math.sin(ang), prev = null;
      for (var s = 0; s <= S; s++) {
        var f = s / S, y = mix(1.38, 0.86, f), r = mix(0.2, 0.3, f) + 0.012 * Math.sin(f * 3.14), sway = amp * 0.09 * Math.sin(t * 14 + i * 0.9 + f * 5) * Math.sin(f * 1.5708 + 0.3), tw = amp * 0.05 * Math.cos(t * 11 + i * 1.7) * f;
        var px = cx * (r + sway) - sz * tw, pz = sz * (r + sway) + cx * tw;
        if (prev) { a[o++] = prev[0]; a[o++] = prev[1]; a[o++] = prev[2]; a[o++] = px; a[o++] = y; a[o++] = pz; }
        prev = [px, y, pz];
      }
    }
    basketObj.chain.geo.attributes.position.needsUpdate = true;
  }

  function disposeGroup(g) { while (g.children.length) { var c = g.children.pop(); c.traverse && c.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) { var ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(function (m) { if (m.map && m.map !== waterTex) m.map.dispose(); m.dispose(); }); } }); } }

  function paintGround(h) {
    var ymin = -45, ymax = h.basket[1] + 70, span = ymax - ymin, S = 2048, c = document.createElement('canvas'); c.width = c.height = S; var g = c.getContext('2d');
    var sx = S / (MAPX * 2), sy = S / span;
    function X(x) { return (x + MAPX) * sx; } function Y(y) { return (ymax - y) * sy; }
    g.fillStyle = '#1b2c20'; g.fillRect(0, 0, S, S);
    function pathStroke(wid, color) { g.strokeStyle = color; g.lineWidth = wid * sx; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); h.path.forEach(function (p, i) { if (i) g.lineTo(X(p[0]), Y(p[1])); else g.moveTo(X(p[0]), Y(p[1])); }); g.stroke(); }
    // rough, with a soft edge into the out-of-bounds woods
    g.save(); g.filter = 'blur(' + Math.round(sx * 2.2) + 'px)'; pathStroke(124, '#2a4d2b'); g.restore();
    g.save(); g.filter = 'blur(' + Math.round(sx * 1.2) + 'px)'; pathStroke(h.width + 14, '#35653a'); g.restore();
    // mown fairway with stripes
    var fc = document.createElement('canvas'); fc.width = fc.height = S; var f = fc.getContext('2d');
    f.strokeStyle = '#4f9a49'; f.lineWidth = h.width * sx; f.lineCap = 'round'; f.lineJoin = 'round'; f.beginPath(); h.path.forEach(function (p, i) { if (i) f.lineTo(X(p[0]), Y(p[1])); else f.moveTo(X(p[0]), Y(p[1])); }); f.stroke();
    f.globalCompositeOperation = 'source-atop'; for (var yy = ymin; yy < ymax; yy += 8) { f.fillStyle = ((yy - ymin) / 8 & 1) ? 'rgba(255,255,255,.07)' : 'rgba(0,30,0,.1)'; f.fillRect(0, Y(yy + 8), S, 8 * sy + 1); }
    g.save(); g.filter = 'blur(' + Math.round(sx * 0.5) + 'px)'; g.drawImage(fc, 0, 0); g.restore();
    // basket green, tee pad
    var b = h.basket, rg = g.createRadialGradient(X(b[0]), Y(b[1]), 0, X(b[0]), Y(b[1]), 9 * sx); rg.addColorStop(0, '#68b85c'); rg.addColorStop(0.7, '#5aa650'); rg.addColorStop(1, 'rgba(90,166,80,0)'); g.fillStyle = rg; g.beginPath(); g.arc(X(b[0]), Y(b[1]), 9 * sx, 0, 6.3); g.fill();
    // water with a muddy bank
    h.water.forEach(function (w) {
      g.save(); g.filter = 'blur(' + Math.round(sx * 0.8) + 'px)'; g.fillStyle = '#6b5a3c'; g.fillRect(X(w[0]) - 1.6 * sx, Y(w[3]) - 1.6 * sy, (w[2] - w[0]) * sx + 3.2 * sx, (w[3] - w[1]) * sy + 3.2 * sy); g.restore();
      g.fillStyle = '#1f4f7e'; g.fillRect(X(w[0]), Y(w[3]), (w[2] - w[0]) * sx, (w[3] - w[1]) * sy);
    });
    // soft blob shadows under the trees
    (h.treeList || []).forEach(function (t) { var rr = 2.8 * t.s * sx, rg2 = g.createRadialGradient(X(t.x), Y(t.y), 0, X(t.x), Y(t.y), rr); rg2.addColorStop(0, 'rgba(8,20,10,.55)'); rg2.addColorStop(1, 'rgba(8,20,10,0)'); g.fillStyle = rg2; g.beginPath(); g.arc(X(t.x), Y(t.y), rr, 0, 6.3); g.fill(); });
    // grain
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.55; g.fillStyle = g.createPattern(noiseTile, 'repeat'); g.save(); g.scale(1.6, 1.6); g.fillRect(0, 0, S / 1.6, S / 1.6); g.restore(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    var tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding; tex.anisotropy = R.capabilities.getMaxAnisotropy(); tex.generateMipmaps = true; tex.minFilter = T.LinearMipmapLinearFilter;
    return { tex: tex, ymin: ymin, ymax: ymax, span: span };
  }

  var treeMeshes = [];
  function buildCourse(h) {
    if (curBuilt === G.hole && courseGroup.children.length) return; curBuilt = G.hole;
    disposeGroup(courseGroup); treeMeshes = []; waterMats = [];
    // ground
    var gp = paintGround(h), ground = new T.Mesh(new T.PlaneGeometry(MAPX * 2, gp.span), new T.MeshStandardMaterial({ map: gp.tex, roughness: 1, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -(gp.ymin + gp.ymax) / 2); ground.receiveShadow = true; courseGroup.add(ground);
    var far = new T.Mesh(new T.PlaneGeometry(4000, 4000), new T.MeshBasicMaterial({ color: 0x1b2c20 })); far.rotation.x = -Math.PI / 2; far.position.y = -0.6; courseGroup.add(far);
    // water surfaces
    h.water.forEach(function (w) {
      var wt = waterTex.clone(); wt.needsUpdate = true; wt.repeat.set((w[2] - w[0]) / 6, (w[3] - w[1]) / 6);
      var m = new T.MeshPhongMaterial({ color: 0x2a78c8, specular: 0xffe2c0, shininess: 120, transparent: true, opacity: 0.86, bumpMap: wt, bumpScale: 1.2 }); waterMats.push(m);
      var mesh = new T.Mesh(new T.PlaneGeometry(w[2] - w[0], w[3] - w[1]), m); mesh.rotation.x = -Math.PI / 2; mesh.position.set((w[0] + w[2]) / 2, 0.04, -(w[1] + w[3]) / 2); courseGroup.add(mesh);
    });
    // trees: instanced trunks and four foliage tiers
    var tl = h.treeList, n = tl.length, trunk = new T.InstancedMesh(new T.CylinderGeometry(0.16, 0.3, 1, 7).translate(0, 0.5, 0), new T.MeshStandardMaterial({ color: 0x4a2e22, roughness: 1 }), n);
    var tiers = [], cone = new T.ConeGeometry(1, 1, 9).translate(0, 0.5, 0);
    for (var k = 0; k < 4; k++) tiers.push(new T.InstancedMesh(cone, new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), n));
    var m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), ps = new T.Vector3(), col = new T.Color();
    tl.forEach(function (t, i) {
      var th = t.h * t.s, yq = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), t.rot);
      ps.set(t.x, 0, -t.y); sc.set(1, th * 0.55, 1); trunk.setMatrixAt(i, m4.compose(ps, yq, sc));
      for (var k2 = 0; k2 < 4; k2++) {
        var base = 1.7 + k2 * (th - 2) * 0.2, ht = (th - base) * (k2 === 3 ? 1.0 : 0.62) + 0.4, rad = 1.7 * t.s * (1 - k2 * 0.2) * (th / 10) * 0.95 + 0.25;
        ps.set(t.x, base, -t.y); sc.set(rad, ht, rad); tiers[k2].setMatrixAt(i, m4.compose(ps, yq, sc));
        col.setRGB(0.13 + t.tone * 0.07 + k2 * 0.012, 0.3 + t.tone * 0.1 + k2 * 0.02, 0.16 + t.tone * 0.05); tiers[k2].setColorAt(i, col);
      }
    });
    [trunk].concat(tiers).forEach(function (im) { im.castShadow = true; im.receiveShadow = false; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; courseGroup.add(im); });
    // tee pad
    var th0 = Math.atan2(h.path[1][0] - h.path[0][0], h.path[1][1] - h.path[0][1]), pad = new T.Mesh(new T.BoxGeometry(1.8, 0.05, 3.6), new T.MeshStandardMaterial({ color: 0x9a9690, roughness: 0.95 }));
    pad.position.set(h.tee[0], 0.025, -h.tee[1]); pad.rotation.y = -th0; pad.receiveShadow = true; courseGroup.add(pad);
    // basket
    var bk = makeBasket(); bk.position.set(h.basket[0], 0, -h.basket[1]); courseGroup.add(bk); updateChains(0, 0);
    previewDirty = true;
  }

  function discPose(m, st, scale) {
    // basis from the flight: forward along the path, tilted nose-up by the angle of attack, banked by hyzer / anhyzer
    var v = st.v, sp = Math.hypot(v[0], v[1], v[2]) || 1, f = [v[0] / sp, v[1] / sp, v[2] / sp], rx = f[1], ry = -f[0], rl = Math.hypot(rx, ry) || 1; rx /= rl; ry /= rl;
    var r = [rx, ry, 0], u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    var gamma = Math.asin(clamp(f[2], -1, 1)), al = clamp(st.theta - gamma, -0.4, 0.6), ca = Math.cos(al), sa = Math.sin(al), cb = Math.cos(st.bank), sb = Math.sin(st.bank);
    var n0 = [u[0] * ca - f[0] * sa, u[1] * ca - f[1] * sa, u[2] * ca - f[2] * sa], fd = [f[0] * ca + u[0] * sa, f[1] * ca + u[1] * sa, f[2] * ca + u[2] * sa];
    var n = [n0[0] * cb - st.spin * r[0] * sb, n0[1] * cb - st.spin * r[1] * sb, n0[2] * cb - st.spin * r[2] * sb];
    var d = fd[0] * n[0] + fd[1] * n[1] + fd[2] * n[2], fp = [fd[0] - n[0] * d, fd[1] - n[1] * d, fd[2] - n[2] * d], fl = Math.hypot(fp[0], fp[1], fp[2]) || 1; fp = [fp[0] / fl, fp[1] / fl, fp[2] / fl];
    var rp = [fp[1] * n[2] - fp[2] * n[1], fp[2] * n[0] - fp[0] * n[2], fp[0] * n[1] - fp[1] * n[0]];
    var X = new T.Vector3(rp[0], rp[2], -rp[1]), Y = new T.Vector3(n[0], n[2], -n[1]), Z = new T.Vector3(-fp[0], -fp[2], fp[1]);
    m.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(X, Y, Z)); m.scale.setScalar(scale);
    m.userData.spinner.rotation.y = -st.spin * (st.rot || 0);
  }
  function flatPose(m, x, y, z, scale, yaw, spinAng) {
    m.position.set(x, z, -y); m.quaternion.setFromAxisAngle(new T.Vector3(0, 1, 0), yaw || 0); m.scale.setScalar(scale); m.userData.spinner.rotation.y = spinAng || 0;
  }

  function computePreview() {
    previewDirty = false; if (!G || G.phase !== 'aim') { prevLine.visible = false; prevEnd.visible = false; return; }
    var hy = (+sBank.value) / 57.3, la = (+sLa.value) / 57.3, s = P.launch(G.lie[0], G.lie[1], disc, 0.85, aim(), hy, la, spin, 0), w = wind(), pos = prevGeo.attributes.position.array, n = 0, step = 0, dt = 1 / 120;
    pos[0] = s.p[0]; pos[1] = s.p[2]; pos[2] = -s.p[1]; n = 1;
    while (s.p[2] > 0 && s.t < 12 && n < PREVN) { P.step(s, dt, w); if (++step % 5 === 0) { pos[n * 3] = s.p[0]; pos[n * 3 + 1] = Math.max(0.02, s.p[2]); pos[n * 3 + 2] = -s.p[1]; n++; } }
    prevGeo.setDrawRange(0, n); prevGeo.attributes.position.needsUpdate = true; prevLine.computeLineDistances(); prevLine.visible = true;
    prevEnd.position.set(s.p[0], 0.05, -s.p[1]); prevEnd.visible = true;
  }

  function resize() {
    if (!R) return; var r = stage.getBoundingClientRect(), w = Math.max(200, Math.round(r.width)), h = Math.max(200, Math.round(r.height));
    R.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 0.9 ? 66 : 55; camera.updateProjectionMatrix();
    var d = Math.min(window.devicePixelRatio || 1, 2); hud.width = Math.round(w * d); hud.height = Math.round(h * d); hctx.setTransform(d, 0, 0, d, 0, 0); hud._w = w; hud._h = h;
  }
  if (window.ResizeObserver) new ResizeObserver(function () { resize(); }).observe(stage); window.addEventListener('resize', resize);

  /* ---------- HUD (minimap, wind, distance) ---------- */
  function drawHud() {
    var W = hud._w, H = hud._h; hctx.clearRect(0, 0, W, H); if (!G) return;
    var h = G.h, mw = clamp(W * 0.17, 74, 120), mh = mw * 1.35, ox = W - mw - 8, oy = 8;
    hctx.save(); hctx.fillStyle = 'rgba(8,2,6,.78)'; hctx.strokeStyle = 'rgba(255,42,53,.55)'; hctx.lineWidth = 1; hctx.beginPath(); if (hctx.roundRect) hctx.roundRect(ox, oy, mw, mh, 8); else hctx.rect(ox, oy, mw, mh); hctx.fill(); hctx.stroke(); hctx.clip();
    var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9; h.path.forEach(function (p) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); });
    var pad = 22, kx = (mw - 10) / (maxx - minx + 2 * pad), ky = (mh - 10) / (maxy - miny + 14), k = Math.min(kx, ky);
    function M(x, y) { return [ox + mw / 2 + (x - (minx + maxx) / 2) * k, oy + mh - 8 - (y - miny + 4) * k]; }
    hctx.strokeStyle = '#3f7a47'; hctx.lineCap = 'round'; hctx.lineJoin = 'round'; hctx.lineWidth = Math.max(3, h.width * k); hctx.beginPath(); h.path.forEach(function (p, i) { var m = M(p[0], p[1]); if (i) hctx.lineTo(m[0], m[1]); else hctx.moveTo(m[0], m[1]); }); hctx.stroke();
    hctx.fillStyle = '#2f6fe0'; h.water.forEach(function (w) { var a = M(w[0], w[3]), b = M(w[2], w[1]); hctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); });
    hctx.fillStyle = '#143d22'; h.treeList.forEach(function (t) { if (t.big || pathDist(h, t.x, t.y) < h.width / 2 + 8) { var m = M(t.x, t.y); hctx.beginPath(); hctx.arc(m[0], m[1], 1.4, 0, 6.3); hctx.fill(); } });
    hctx.strokeStyle = 'rgba(255,255,255,.6)'; hctx.lineWidth = 1.2; hctx.beginPath(); G.throws.forEach(function (p, i) { var m = M(p[0], p[1]); if (i) hctx.lineTo(m[0], m[1]); else hctx.moveTo(m[0], m[1]); }); if (G.flight) { var fm = M(G.flight.p[0], G.flight.p[1]); hctx.lineTo(fm[0], fm[1]); } hctx.stroke();
    var bm = M(h.basket[0], h.basket[1]); hctx.fillStyle = '#ff2a35'; hctx.beginPath(); hctx.arc(bm[0], bm[1], 3.2, 0, 6.3); hctx.fill();
    var lm = M(G.lie[0], G.lie[1]); hctx.fillStyle = '#fff'; hctx.beginPath(); hctx.arc(lm[0], lm[1], 2.8, 0, 6.3); hctx.fill();
    hctx.restore();
    // wind dial under the chips on the left, with the distance pill beside it
    var wx = G.wind[0], wy = G.wind[1], ws = Math.hypot(wx, wy), ang = Math.atan2(wx, wy) - cam.yaw, cxw = 34, cyw = 74, rw = 24;
    hctx.save(); hctx.translate(cxw, cyw); hctx.fillStyle = 'rgba(8,2,6,.72)'; hctx.strokeStyle = 'rgba(255,42,53,.5)'; hctx.beginPath(); hctx.arc(0, 0, rw, 0, 6.3); hctx.fill(); hctx.stroke();
    hctx.rotate(ang); hctx.fillStyle = '#ffd1d4'; hctx.globalAlpha = 0.4 + Math.min(0.6, ws / 5); hctx.beginPath(); hctx.moveTo(0, -16); hctx.lineTo(7, -3); hctx.lineTo(2.5, -3); hctx.lineTo(2.5, 14); hctx.lineTo(-2.5, 14); hctx.lineTo(-2.5, -3); hctx.lineTo(-7, -3); hctx.closePath(); hctx.fill(); hctx.restore();
    hctx.fillStyle = '#ffd1d4'; hctx.font = '700 11px system-ui, sans-serif'; hctx.textAlign = 'left'; hctx.fillText('WIND ' + ws.toFixed(0) + ' m/s', cxw + rw + 8, cyw - 4);
    hctx.fillStyle = 'rgba(8,2,6,.72)'; var txt = Math.round(distToBasket()) + ' m to basket'; hctx.font = '700 13px system-ui, sans-serif'; var tw = hctx.measureText(txt).width + 16; hctx.fillRect(cxw + rw + 6, cyw + 2, tw, 22); hctx.fillStyle = '#fff'; hctx.fillText(txt, cxw + rw + 14, cyw + 18);
  }

  /* ---------- frame ---------- */
  var treeSway = 0;
  function render(now, dt) {
    simTime += dt;
    // camera and light
    var sh = (G.shake || 0); if (sh > 0) G.shake = Math.max(0, sh - dt);
    camera.position.set(cam.x + (sh ? rnd(-sh, sh) * 0.15 : 0), cam.z + (sh ? rnd(-sh, sh) * 0.1 : 0), -cam.y);
    var cp = Math.cos(cam.pitch); camera.lookAt(cam.x + Math.sin(cam.yaw) * cp, cam.z - Math.sin(cam.pitch), -(cam.y + Math.cos(cam.yaw) * cp));
    var fx = cam.x + Math.sin(cam.yaw) * 14, fz = -(cam.y + Math.cos(cam.yaw) * 14);
    sun.target.position.set(fx, 0, fz); sun.position.set(fx + 62, 52, fz - 82);   // sun ahead and to the right, low in the sky
    var sky = scene.getObjectByName('sky'); if (sky) sky.position.copy(camera.position);
    // the disc
    discMesh.visible = false; markMeshes.forEach(function (m) { m.visible = false; });
    var d = G.flightDisc || disc;
    if (G.phase === 'fly' && G.flight) { var st = G.flight; paintDisc(discMesh, st.disc); discMesh.position.set(st.p[0], st.p[2], -st.p[1]); discPose(discMesh, st, 1.9); discMesh.visible = true; }
    else if (G.phase === 'roll' && G.roll) { var rr = G.roll, kk = clamp(rr.t / rr.dur, 0, 1), e = 1 - (1 - kk) * (1 - kk); paintDisc(discMesh, G.restDisc || disc); flatPose(discMesh, mix(rr.x0, rr.x1, e), mix(rr.y0, rr.y1, e), 0.025, 1.6, 0, rr.rot + kk * 8); discMesh.visible = true; }
    else if (G.phase === 'holed' && G.drop) { var dr = G.drop; dr.t += dt; var kd = clamp(dr.t / 0.45, 0, 1), ez = kd * kd; paintDisc(discMesh, G.flightDisc || disc); flatPose(discMesh, mix(dr.x0, dr.x1, kd), mix(dr.y0, dr.y1, kd), mix(dr.z0, dr.z1, ez), 1.6, 0, dr.t * 3); discMesh.rotation.x = 0; discMesh.visible = true; }
    else if (G.phase === 'aim' || G.phase === 'charge') {   // the disc is held ready, tilted the way the sliders are set
      var a0 = aim(), hv = { v: [Math.sin(a0), Math.cos(a0), 0], theta: ((+sLa.value) / 57.3) * 0.6, bank: (+sBank.value) / 57.3, spin: spin, rot: simTime * 2 };
      paintDisc(discMesh, disc); discMesh.position.set(G.lie[0] + Math.cos(a0) * 0.5, 1.05, -(G.lie[1] - Math.sin(a0) * 0.5)); discPose(discMesh, hv, 1.9); discMesh.visible = true;
    }
    else if (G.phase === 'rest') { paintDisc(discMesh, G.restDisc || disc); flatPose(discMesh, G.lie[0], G.lie[1], 0.03, 1.8, 0, 0); discMesh.visible = true; }
    // earlier lies
    var mi = 0; G.throws.forEach(function (t, i) { if (i === 0 || i === G.throws.length - 1 && G.phase !== 'fly') return; if (mi < markMeshes.length) { var m = markMeshes[mi++]; paintDisc(m, P.DISCS.buzzz); flatPose(m, t[0], t[1], 0.03, 1.4, i, 0); m.visible = true; } });
    teeRing.visible = G.phase === 'aim' || G.phase === 'charge'; teeRing.position.set(G.lie[0], 0.06, -G.lie[1]);
    // trail
    var tp = trailGeo.attributes.position.array, tn = Math.min(G.trail.length, TRAILN);
    for (var i2 = 0; i2 < tn; i2++) { var q = G.trail[i2]; tp[i2 * 3] = q[0]; tp[i2 * 3 + 1] = Math.max(0.02, q[2]); tp[i2 * 3 + 2] = -q[1]; }
    trailGeo.setDrawRange(0, G.phase === 'aim' || G.phase === 'charge' ? 0 : tn); trailGeo.attributes.position.needsUpdate = true;
    if (previewDirty) computePreview(); prevLine.visible = prevLine.visible && (G.phase === 'aim' || G.phase === 'charge'); prevEnd.visible = prevLine.visible;
    // basket chains rattle, flag flutter, water ripple
    if (G.wob > 0.01) { updateChains(simTime, G.wob); G.wob *= Math.exp(-dt * 1.7); } else if (G.wob) { G.wob = 0; updateChains(0, 0); }
    if (basketObj && basketObj.flag) basketObj.flag.rotation.y = Math.sin(simTime * 3) * 0.25;
    waterMats.forEach(function (m, i) { if (m.bumpMap) { m.bumpMap.offset.x = (simTime * 0.02) % 1; m.bumpMap.offset.y = (simTime * 0.013 + i * 0.3) % 1; } });
    R.render(scene, camera); drawHud();
    throwBtn.style.setProperty('--pw', (G.phase === 'charge' || charging) ? chargeLevel().toFixed(3) : 0);
  }
  function frame(now) {
    if (!running) return; var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (G.phase === 'fly') flightStep(dt);
    else if (G.phase === 'roll') { G.roll.t += dt; if (G.roll.t >= G.roll.dur) { var r = G.roll; G.roll = null; rest([r.x1, r.y1]); } }
    else if (G.phase === 'rest' && now - G.rest > 1100) { G.phase = 'aim'; previewDirty = true; }
    moveCam(dt); render(now, dt); raf = requestAnimationFrame(frame);
  }
  function play() {
    if (running) return;
    if (failed) { return; }
    if (!ready) {
      if (loading) return; loading = true; flash('Loading 3D view…');
      loadThree(function (ok) {
        loading = false; msgEl.hidden = true;
        if (!ok) { failed = true; flash('The 3D view could not load. Check your connection and reload.'); return; }
        try { initThree(); } catch (e) { failed = true; flash('This browser cannot run the 3D view (WebGL is off).'); return; }
        ready = true; if (!G) newRound(); else buildCourse(G.h); play();
      });
      return;
    }
    if (!G) newRound(); running = true; last = performance.now(); raf = requestAnimationFrame(frame); if (autoFs && autoFs.matches) setFs(true, false);
  }
  function pause() { running = false; cancelAnimationFrame(raf); charging = false; if (G && G.phase === 'charge') G.phase = 'aim'; if (stage.classList.contains('fs')) setFs(false, false); }
  document.addEventListener('ss:cvgame', function (e) { if (e.detail === 'dd') play(); else pause(); });
  document.addEventListener('ss:route', function (e) { if (e.detail.name !== 'craving') pause(); else if (!root.hidden) play(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); else if (!root.hidden && !document.querySelector('[data-view="craving"]').hidden) play(); });
  window.__dd = function () { return { G: G, P: P, doThrow: doThrow, cam: cam, scene: scene, R: R }; };
  newRound();
})();
