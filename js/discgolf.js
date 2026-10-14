/* Kraving Killer game 3: Disc-ipline, a disc golf game with real flight physics (see discphys.js).
   Third-person view behind the disc, six holes, wind, trees, water, a real basket with chains.
   Pick a disc, aim (drag the view or use the slider), set hyzer / anhyzer and the launch angle, hold THROW to charge, release to throw. */
(function () {
  var root = document.getElementById('dd'); if (!root || !window.DiscPhys) return;
  var P = DiscPhys, cv = document.getElementById('dd-canvas'), ctx = cv.getContext('2d');
  var W = 720, H = 440, dpr = Math.min(window.devicePixelRatio || 1, 2), F = 640;
  cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  var $ = function (id) { return document.getElementById(id); };
  var elHole = $('dd-hole'), elPar = $('dd-par'), elStr = $('dd-str'), toast = $('dd-toast'), over = $('dd-over'), overT = $('dd-over-t'), overS = $('dd-over-s'), nextBtn = $('dd-next');
  var sBank = $('dd-bank'), sLa = $('dd-la'), sAim = $('dd-aim'), lblBank = $('dd-bank-l'), lblLa = $('dd-la-l'), lblAim = $('dd-aim-l'), throwBtn = $('dd-throw'), handBtn = $('dd-hand'), discsEl = $('dd-discs');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function mix(a, b, k) { return a + (b - a) * k; }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ---------- the course: six holes ---------- */
  var HOLES = [
    { name: 'Warm-Up', par: 3, path: [[0, 0], [0, 78]], width: 38, wind: [1, 0.5], trees: [[-14, 30], [16, 52], [-12, 66]], water: [], tight: 0 },
    { name: 'Left Hook', par: 3, path: [[0, 0], [0, 52], [-30, 98]], width: 26, wind: [-2, 0], trees: [[7, 38], [9, 58], [3, 74], [-3, 52], [-12, 78]], water: [], tight: 0 },
    { name: 'Don’t Fall In The Drink', par: 3, path: [[0, 0], [0, 108]], width: 30, wind: [3, 0], trees: [[-12, 34], [-13, 70], [10, 20]], water: [[7, 42, 46, 98]], tight: 0 },
    { name: 'The Tunnel', par: 3, path: [[0, 0], [0, 86]], width: 12, wind: [0, 1], trees: [[-3, 38], [3.2, 60]], water: [], tight: 1 },
    { name: 'Dogleg Right', par: 4, path: [[0, 0], [0, 72], [36, 116], [42, 128]], width: 24, wind: [2, -1], trees: [[14, 78], [18, 90], [9, 88], [26, 99], [-8, 100]], water: [], tight: 0 },
    { name: 'Sober Finale', par: 4, path: [[0, 0], [0, 70], [8, 128], [0, 156]], width: 22, wind: [-3, -3], trees: [[-8, 90], [14, 110], [-6, 128]], water: [[-60, 82, -9, 124], [19, 82, 60, 124], [-60, 138, -14, 170], [14, 138, 60, 170]], tight: 0 }
  ];
  var HOLE_N = HOLES.length;

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
    var total = 0; for (var k = 0; k < h.path.length - 1; k++) total += Math.hypot(h.path[k + 1][0] - h.path[k][0], h.path[k + 1][1] - h.path[k][1]);
    var count = h.tight ? 150 : 95;
    for (var n = 0; n < count; n++) {
      var yy = r() * (h.basket[1] + 40) - 10, xx = (r() - 0.5) * 170 + (h.path[Math.min(h.path.length - 1, 1)][0] * 0.5);
      var dd = pathDist(h, xx, yy), gap = h.width / 2 + (h.tight ? 0.8 : 3 + r() * 5);
      if (dd < gap || inWater(h, xx, yy) || Math.hypot(xx - h.tee[0], yy - h.tee[1]) < 7 || Math.hypot(xx - h.basket[0], yy - h.basket[1]) < 8) continue;
      tr.push({ x: xx, y: yy, h: 7 + r() * 6 });
    }
    // trees lining the tunnel edges
    if (h.tight) for (var yy2 = 6; yy2 < h.basket[1]; yy2 += 4.5) { [-1, 1].forEach(function (sd) { var tx = h.path[0][0] + sd * (h.width / 2 + 0.9 + r() * 0.8); if (Math.abs(yy2 - 38) < 2 && sd < 0) return; tr.push({ x: tx, y: yy2 + r() * 1.5, h: 9 + r() * 4 }); }); }
    h.treeList = tr;
    // pre-colour the ground cells
    var cell = 5, minX = -90, maxX = 90, minY = -40, maxY = h.basket[1] + 70, cols = [], mx = 0;
    h.cell = cell; h.cells = [];
    for (var cy = minY; cy < maxY; cy += cell) for (var cx = minX; cx < maxX; cx += cell) {
      var t = terrain(h, cx + cell / 2, cy + cell / 2);
      h.cells.push({ x: cx, y: cy, t: t, a: ((Math.floor(cx / cell) + Math.floor(cy / cell)) & 1) });
    }
    return h;
  }
  var COL = { fair: [[56, 108, 62], [50, 98, 56]], rough: [[34, 66, 40], [30, 60, 36]], water: [[36, 96, 190], [30, 86, 176]], ob: [[22, 36, 28], [20, 32, 25]] };
  var FOG = [64, 16, 22];

  /* ---------- game state ---------- */
  var G = null, running = false, raf = 0, last = 0, chargeT = 0, charging = false, cam = { x: 0, y: -3, z: 3.6, yaw: 0, pitch: 0.12 };
  var disc = P.DISCS.driver, spin = 1, best = 0;
  try { best = +localStorage.getItem('ss-disc-best') || 0; } catch (e) {}

  function newRound() {
    G = { hole: 0, scores: [], phase: 'aim', strokes: 0, lie: null, prev: null, aimOff: 0, flight: null, trail: [], throws: [], tT: 0, roll: null, rest: 0, msg: '', done: false };
    startHole();
  }
  function startHole() {
    var h = buildHole(G.hole); G.h = h; G.strokes = 0; G.lie = [h.tee[0], h.tee[1]]; G.prev = null; G.throws = [[h.tee[0], h.tee[1]]]; G.trail = []; G.flight = null; G.phase = 'aim'; G.aimOff = 0; G.wind = h.wind;
    pickDiscFor(); aimBase(); syncUi(); over.hidden = true; say('Hole ' + (G.hole + 1) + ': ' + h.name + '. Par ' + h.par + '. ' + Math.round(distToBasket()) + ' m to the basket.');
    snapCam();
  }
  function distToBasket() { return Math.hypot(G.h.basket[0] - G.lie[0], G.h.basket[1] - G.lie[1]); }
  function aimBase() { G.base = Math.atan2(G.h.basket[0] - G.lie[0], G.h.basket[1] - G.lie[1]); }
  function aim() { return G.base + G.aimOff; }
  function pickDiscFor() { var d = distToBasket(); chooseDisc(d < 28 ? 'putter' : d < 62 ? 'mid' : d < 95 ? 'fairway' : 'driver'); }
  function say(t) { toast.textContent = t; toast.classList.add('on'); clearTimeout(say.t); say.t = setTimeout(function () { toast.classList.remove('on'); }, 4200); }

  /* ---------- UI wiring ---------- */
  Object.keys(P.DISCS).forEach(function (id) {
    var d = P.DISCS[id], b = document.createElement('button'); b.type = 'button'; b.className = 'dd-disc'; b.setAttribute('data-disc', id);
    b.innerHTML = '<i style="background:' + d.col + '"></i><b>' + d.name + '</b><small>' + d.speed + ' | ' + d.glide + ' | ' + d.turn + ' | ' + d.fade + '</small>';
    b.addEventListener('click', function () { chooseDisc(id); }); discsEl.appendChild(b);
  });
  function chooseDisc(id) { disc = P.DISCS[id]; Array.prototype.forEach.call(discsEl.children, function (b) { b.classList.toggle('on', b.getAttribute('data-disc') === id); }); if (id === 'putter' && +sLa.value > 8) { sLa.value = 5; } syncUi(); }
  function syncUi() {
    var bk = +sBank.value, la = +sLa.value, am = Math.round(G ? G.aimOff * 57.3 : 0);
    lblBank.textContent = bk === 0 ? 'Flat' : (bk > 0 ? 'Hyzer ' + bk + '°' : 'Anhyzer ' + (-bk) + '°');
    lblLa.textContent = la + '°'; lblAim.textContent = am === 0 ? 'Straight' : (am > 0 ? am + '° right' : (-am) + '° left');
    sAim.value = am; handBtn.textContent = spin === 1 ? 'Backhand' : 'Forehand'; handBtn.setAttribute('aria-pressed', String(spin !== 1));
    if (G) { elHole.textContent = 'Hole ' + (G.hole + 1) + '/' + HOLE_N; elPar.textContent = 'Par ' + G.h.par; elStr.textContent = 'Throws ' + G.strokes; }
  }
  [sBank, sLa].forEach(function (s) { s.addEventListener('input', syncUi); });
  sAim.addEventListener('input', function () { if (G && G.phase === 'aim') { G.aimOff = (+sAim.value) / 57.3; syncUi(); } });
  handBtn.addEventListener('click', function () { spin = -spin; syncUi(); });
  nextBtn.addEventListener('click', function () { if (G.done) { newRound(); } else { G.hole++; startHole(); } });

  // drag the view to aim
  var dragX = null;
  cv.addEventListener('pointerdown', function (e) { if (G && G.phase === 'aim') { dragX = e.clientX; try { cv.setPointerCapture(e.pointerId); } catch (x) {} } });
  cv.addEventListener('pointermove', function (e) { if (dragX === null || !G || G.phase !== 'aim') return; var dx = e.clientX - dragX; dragX = e.clientX; G.aimOff = clamp(G.aimOff + dx * 0.0035 * (W / cv.getBoundingClientRect().width), -0.8, 0.8); syncUi(); });
  cv.addEventListener('pointerup', function () { dragX = null; }); cv.addEventListener('pointercancel', function () { dragX = null; });

  // charge and throw
  function startCharge() { if (!G || G.phase !== 'aim') return; charging = true; chargeT = performance.now(); G.phase = 'charge'; }
  function release() { if (!charging) return; charging = false; var pw = chargeLevel(); G.phase = 'aim'; doThrow(pw); }
  function chargeLevel() { return clamp((performance.now() - chargeT) / 1050, 0.04, 1); }
  throwBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); try { throwBtn.setPointerCapture(e.pointerId); } catch (x) {} startCharge(); });
  throwBtn.addEventListener('pointerup', release); throwBtn.addEventListener('pointercancel', function () { if (charging) { charging = false; G.phase = 'aim'; } });
  throwBtn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('keydown', function (e) {
    if (root.hidden || document.querySelector('[data-view="craving"]').hidden || !G) return;
    var t = e.target; if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
    if (e.key === ' ' && !(t && /^button$/i.test(t.tagName))) { e.preventDefault(); if (!e.repeat) startCharge(); }
    else if (e.key === 'ArrowLeft' && G.phase === 'aim') { G.aimOff = clamp(G.aimOff - 0.02, -0.8, 0.8); syncUi(); }
    else if (e.key === 'ArrowRight' && G.phase === 'aim') { G.aimOff = clamp(G.aimOff + 0.02, -0.8, 0.8); syncUi(); }
  });
  document.addEventListener('keyup', function (e) { if (e.key === ' ') release(); });

  /* ---------- the throw ---------- */
  function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 0.75; }
  function doThrow(pw) {
    var noise = gauss() * 0.045 * pw * pw * (0.45 + disc.speed / 14), hy = (+sBank.value) / 57.3, la = (+sLa.value) / 57.3;
    G.strokes++; G.prev = [G.lie[0], G.lie[1]];
    var s = P.launch(G.lie[0], G.lie[1], disc, pw, aim(), hy, la, spin, noise);
    G.flight = s; G.trail = [[s.p[0], s.p[1], s.p[2]]]; G.phase = 'fly'; G.hit = null; G.apex = 0; syncUi();
  }
  function wind() { return [G.wind[0] * 0.55, G.wind[1] * 0.55]; }

  function flightStep(dt) {
    var s = G.flight, h = G.h, n = Math.max(1, Math.round(dt * 120)), sub = dt / n;
    for (var k = 0; k < n; k++) {
      P.step(s, sub, wind()); var p = s.p, spd = Math.hypot(s.v[0], s.v[1], s.v[2]);
      if (Math.round(s.t * 30) !== s._lt) { s._lt = Math.round(s.t * 30); G.trail.push([p[0], p[1], p[2]]); if (G.trail.length > 400) G.trail.shift(); }
      // trees
      var tl = h.treeList;
      for (var i = 0; i < tl.length; i++) {
        var t = tl[i]; if (Math.abs(t.x - p[0]) > 3 || Math.abs(t.y - p[1]) > 3) continue;
        var dx = p[0] - t.x, dy = p[1] - t.y, d = Math.hypot(dx, dy), z = p[2], rr = z < 2 ? 0.5 : (z < t.h ? 0.5 + 1.1 * (1 - (z - 2) / (t.h - 2)) : 0);
        if (z > 0.1 && z < t.h && d < rr) {
          var nx = dx / (d || 1), ny = dy / (d || 1), dot = s.v[0] * nx + s.v[1] * ny;
          s.v[0] = (s.v[0] - 1.6 * dot * nx) * 0.18; s.v[1] = (s.v[1] - 1.6 * dot * ny) * 0.18; s.v[2] = Math.min(s.v[2], 0) * 0.3 - 1;
          p[0] = t.x + nx * (rr + 0.05); p[1] = t.y + ny * (rr + 0.05); G.hit = 'tree'; s.bank *= 0.2;
        }
      }
      // the basket
      var b = h.basket, db = Math.hypot(p[0] - b[0], p[1] - b[1]);
      if (db < 0.62 && p[2] > 0.3 && p[2] < 1.55 && spd > 0.5) {
        var caught = spd < 15 || (spd < 26 && Math.random() < 0.65);
        if (caught) { holeOut(); return; }
        var nx2 = (p[0] - b[0]) / (db || 1), ny2 = (p[1] - b[1]) / (db || 1); s.v[0] = nx2 * 3 + s.v[0] * -0.12; s.v[1] = ny2 * 3 + s.v[1] * -0.12; s.v[2] = 1.5; G.hit = 'rattle'; say('Rattled out!');
      } else if (db < 0.4 && p[2] >= 1.55 && p[2] < 1.9) { s.v[2] = -1; s.v[0] *= 0.2; s.v[1] *= -0.1; G.hit = 'cage'; }
      if (p[2] > G.apex) G.apex = p[2];
      if (p[2] <= 0 && s.v[2] < 0) { p[2] = 0; land(); return; }
      if (s.t > 14) { land(); return; }
    }
  }

  function land() {
    var s = G.flight, h = G.h, p = s.p, tType = terrain(h, p[0], p[1]);
    G.trail.push([p[0], p[1], 0]);
    if (tType === 'water') { return rest([p[0], p[1]], 'water'); }
    var ro = P.rollOut(s, tType === 'rough' ? 1.9 : 1), steps = Math.max(1, Math.ceil(Math.hypot(ro[0], ro[1]))), fx = p[0], fy = p[1], stopped = false;
    for (var i = 1; i <= steps && !stopped; i++) {
      var tx = p[0] + ro[0] * i / steps, ty = p[1] + ro[1] * i / steps;
      if (inWater(h, tx, ty)) { fx = tx; fy = ty; stopped = true; break; }
      for (var j = 0; j < h.treeList.length; j++) { var t = h.treeList[j]; if (Math.hypot(tx - t.x, ty - t.y) < 0.7) { stopped = true; break; } }
      if (!stopped) { fx = tx; fy = ty; }
    }
    G.roll = { x0: p[0], y0: p[1], x1: fx, y1: fy, t: 0, dur: clamp(Math.hypot(fx - p[0], fy - p[1]) / 6, 0.25, 1.3) }; G.phase = 'roll';
  }
  function rest(pos, why) {
    var h = G.h; G.phase = 'rest'; G.rest = performance.now(); G.flight = null;
    var t = why || terrain(h, pos[0], pos[1]);
    if (t === 'water' || t === 'ob') {
      G.strokes++; G.lie = [G.prev[0], G.prev[1]];
      say(t === 'water' ? 'Splash! Don’t fall in the drink. +1 stroke, throw again from the same spot.' : 'Out of bounds. +1 stroke, throw again from the same spot.');
      G.throws.push([G.lie[0], G.lie[1]]);
    } else {
      var dthrow = Math.hypot(pos[0] - G.prev[0], pos[1] - G.prev[1]); G.lie = [pos[0], pos[1]]; G.throws.push([pos[0], pos[1]]);
      var db = distToBasket();
      if (G.hit === 'tree') say('Tree! ' + Math.round(dthrow) + ' m. ' + Math.round(db) + ' m to the basket.');
      else say(Math.round(dthrow) + ' m. ' + (db < 1.2 ? 'Tap-in range.' : Math.round(db) + ' m to the basket.') + (t === 'rough' ? ' In the rough.' : ''));
      if (db < 1.1) { G.strokes++; holeOutScore(true); return; }
    }
    if (G.strokes >= G.h.par + 5) { say('Pick it up. Max strokes this hole.'); holeOutScore(false); return; }
    aimBase(); G.aimOff = 0; pickDiscFor(); syncUi();
  }
  function holeOut() { G.flight.v = [0, 0, 0]; holeOutScore(false, true); }
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
    syncUi(); setTimeout(function () { over.hidden = false; }, chains ? 900 : 300);
  }

  /* ---------- camera and projection ---------- */
  function angDiff(a, b) { var d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
  function targetCam() {
    if (G.phase === 'fly' && G.flight) {
      var s = G.flight, hd = Math.atan2(s.v[0], s.v[1]), cz = Math.max(3.4, s.p[2] + 2.6);
      return { x: s.p[0] - Math.sin(hd) * 13, y: s.p[1] - Math.cos(hd) * 13, z: cz, yaw: hd, pitch: clamp(Math.atan((cz - s.p[2]) / 13) + 0.03, 0.02, 0.5) };
    }
    if (G.phase === 'roll' && G.roll) { var r = G.roll; return { x: r.x0 - Math.sin(aim()) * 11, y: r.y0 - Math.cos(aim()) * 11, z: 4, yaw: cam.yaw, pitch: 0.16 }; }
    var a = aim(); return { x: G.lie[0] - Math.sin(a) * 3.4, y: G.lie[1] - Math.cos(a) * 3.4, z: 3.6, yaw: a, pitch: 0.13 };
  }
  function snapCam() { var t = targetCam(); cam = { x: t.x, y: t.y, z: t.z, yaw: t.yaw, pitch: t.pitch }; }
  function moveCam(dt) {
    var t = targetCam(), k = 1 - Math.exp(-dt * (G.phase === 'fly' ? 6 : 3.2));
    cam.x += (t.x - cam.x) * k; cam.y += (t.y - cam.y) * k; cam.z += (t.z - cam.z) * k; cam.yaw += angDiff(t.yaw, cam.yaw) * k; cam.pitch += (t.pitch - cam.pitch) * k;
  }
  var cs, sn, cp, sp_;
  function setCam() { cs = Math.cos(cam.yaw); sn = Math.sin(cam.yaw); cp = Math.cos(cam.pitch); sp_ = Math.sin(cam.pitch); }
  // returns [sx, sy, depth] (depth <= 0.4 = behind the camera)
  function proj(x, y, z) {
    var dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
    var xc = dx * cs - dy * sn, zc = (dx * sn + dy * cs) * cp - dz * sp_, yc = (dx * sn + dy * cs) * sp_ + dz * cp;
    if (zc < 0.4) return [0, 0, zc];
    return [W / 2 + F * xc / zc, H * 0.5 - F * yc / zc, zc];
  }
  function fogC(c, d) { var f = clamp((d - 50) / 300, 0, 0.88); return 'rgb(' + Math.round(mix(c[0], FOG[0], f)) + ',' + Math.round(mix(c[1], FOG[1], f)) + ',' + Math.round(mix(c[2], FOG[2], f)) + ')'; }

  /* ---------- drawing ---------- */
  function drawSky() {
    var hor = H * 0.5 - F * Math.tan(cam.pitch);
    var g = ctx.createLinearGradient(0, 0, 0, Math.max(40, hor)); g.addColorStop(0, '#12040e'); g.addColorStop(0.55, '#3d0a18'); g.addColorStop(1, '#a8331f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, Math.max(0, hor) + 2);
    ctx.fillStyle = 'rgb(' + FOG[0] + ',' + FOG[1] + ',' + FOG[2] + ')'; ctx.fillRect(0, Math.max(0, hor), W, H);
    // a low red sun, fixed in the world
    var sunYaw = 0.25, sx = W / 2 + F * Math.tan(angDiff(sunYaw, cam.yaw)), sy = hor - 36;
    if (sx > -80 && sx < W + 80) { var sg = ctx.createRadialGradient(sx, sy, 6, sx, sy, 120); sg.addColorStop(0, 'rgba(255,200,140,.95)'); sg.addColorStop(0.15, 'rgba(255,90,60,.7)'); sg.addColorStop(1, 'rgba(255,40,40,0)'); ctx.fillStyle = sg; ctx.fillRect(sx - 130, sy - 130, 260, 260); ctx.fillStyle = '#ffd9b0'; ctx.beginPath(); ctx.arc(sx, sy, 20, 0, 6.3); ctx.fill(); }
    // far ridge line
    ctx.fillStyle = '#2a0812'; ctx.beginPath(); ctx.moveTo(0, hor + 2);
    for (var x = 0; x <= W; x += 10) { var a = cam.yaw + Math.atan((x - W / 2) / F); ctx.lineTo(x, hor - (14 + 12 * Math.sin(a * 3.1) + 8 * Math.sin(a * 7.3 + 1) + 5 * Math.sin(a * 13))); }
    ctx.lineTo(W, hor + 2); ctx.closePath(); ctx.fill();
    return hor;
  }
  function drawGround() {
    var cells = G.h.cells, cell = G.h.cell;
    ctx.lineWidth = 0.6;
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i], mx = c.x + cell / 2 - cam.x, my = c.y + cell / 2 - cam.y;
      var fwd = mx * sn + my * cs; if (fwd < -cell * 0.8 || fwd > 330) continue;
      var a = proj(c.x, c.y, 0), b = proj(c.x + cell, c.y, 0), d = proj(c.x + cell, c.y + cell, 0), e = proj(c.x, c.y + cell, 0);
      if (a[2] < 0.4 || b[2] < 0.4 || d[2] < 0.4 || e[2] < 0.4) continue;
      var minx = Math.min(a[0], b[0], d[0], e[0]), maxx = Math.max(a[0], b[0], d[0], e[0]); if (maxx < 0 || minx > W) continue;
      var col = fogC(COL[c.t][c.a], fwd);
      ctx.fillStyle = col; ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(d[0], d[1]); ctx.lineTo(e[0], e[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  function drawTree(t, q) {
    var s = F / q[2], x = q[0], y = q[1], ht = t.h * s, wd = ht * 0.34;
    if (x < -wd || x > W + wd) return;
    var f = clamp((q[2] - 50) / 300, 0, 0.8), c1 = 'rgb(' + Math.round(mix(20, FOG[0], f)) + ',' + Math.round(mix(40, FOG[1], f)) + ',' + Math.round(mix(28, FOG[2], f)) + ')', c2 = 'rgb(' + Math.round(mix(30, FOG[0], f)) + ',' + Math.round(mix(62, FOG[1], f)) + ',' + Math.round(mix(40, FOG[2], f)) + ')';
    ctx.fillStyle = '#2a1410'; ctx.fillRect(x - ht * 0.025, y - ht * 0.2, ht * 0.05, ht * 0.2);
    for (var k = 0; k < 3; k++) { var by = y - ht * (0.12 + k * 0.26), tp = by - ht * 0.42, w = wd * (1 - k * 0.24); ctx.fillStyle = k % 2 ? c2 : c1; ctx.beginPath(); ctx.moveTo(x, tp); ctx.lineTo(x + w, by); ctx.lineTo(x - w, by); ctx.closePath(); ctx.fill(); }
  }
  function drawBasket(b, q) {
    var s = F / q[2], x = q[0], y = q[1], bh = Math.max(1.5 * s, 7), bw = Math.max(0.3 * s, 3);
    // tall marker pole so it can be found from the tee
    ctx.fillStyle = '#ffd9d9'; ctx.fillRect(x - 0.5, y - bh - Math.max(5.5 * s, 28), 1.6, Math.max(5.5 * s, 28));
    ctx.fillStyle = '#ff2a35'; ctx.beginPath(); ctx.moveTo(x + 1, y - bh - Math.max(5.5 * s, 28)); ctx.lineTo(x + 1 + Math.max(1.6 * s, 11), y - bh - Math.max(5.5 * s, 28) + Math.max(0.7 * s, 5)); ctx.lineTo(x + 1, y - bh - Math.max(5.5 * s, 28) + Math.max(1.4 * s, 10)); ctx.fill();
    ctx.fillStyle = '#9aa0a8'; ctx.fillRect(x - 1, y - bh, 2, bh);                          // pole
    ctx.strokeStyle = 'rgba(230,230,235,.85)'; ctx.lineWidth = Math.max(1, 0.03 * s);       // chains
    for (var i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(x + i * bw * 0.16, y - bh * 0.98); ctx.lineTo(x + i * bw * 0.4, y - bh * 0.5); ctx.stroke(); }
    ctx.fillStyle = '#d3131c'; ctx.fillRect(x - bw * 0.62, y - bh * 1.02, bw * 1.24, Math.max(2, bh * 0.1));   // top band
    ctx.strokeStyle = '#d9dde2'; ctx.lineWidth = Math.max(1, 0.04 * s); ctx.beginPath(); ctx.ellipse(x, y - bh * 0.5, bw * 0.62, Math.max(1.2, bw * 0.16), 0, 0, 6.3); ctx.stroke();   // tray rim
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y, bw * 0.8, Math.max(1, bw * 0.2), 0, 0, 6.3); ctx.fill();
  }
  function drawDisc(p, d, bank, alpha) {
    var q = proj(p[0], p[1], p[2]), g = proj(p[0], p[1], 0); if (q[2] < 0.5) return;
    var s = F / q[2], r = Math.max(0.105 * s, 4.5);
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(g[0], g[1], r * 1.1, Math.max(1, r * 0.35), 0, 0, 6.3); ctx.fill();
    ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(-(bank || 0) * spin * 0.7 * 0.5); ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = d.col; ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.42, 0, 0, 6.3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.ellipse(-r * 0.2, -r * 0.1, r * 0.5, r * 0.14, 0, 0, 6.3); ctx.fill(); ctx.restore();
  }
  function drawTrail() {
    if (G.trail.length < 2) return; ctx.strokeStyle = 'rgba(255,200,170,.6)'; ctx.lineWidth = 2; ctx.beginPath(); var on = false;
    for (var i = 0; i < G.trail.length; i++) { var q = proj(G.trail[i][0], G.trail[i][1], G.trail[i][2]); if (q[2] < 0.5) { on = false; continue; } if (!on) { ctx.moveTo(q[0], q[1]); on = true; } else ctx.lineTo(q[0], q[1]); }
    ctx.stroke();
  }
  function drawAimLine() {
    if (G.phase !== 'aim' && G.phase !== 'charge') return; var a = aim(), pw = G.phase === 'charge' ? chargeLevel() : 0.7, len = (disc.vmax * 2.2) * (0.3 + 0.7 * pw);
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.setLineDash([6, 7]); ctx.lineWidth = 2; ctx.beginPath();
    for (var d = 1; d <= len; d += 2) { var q = proj(G.lie[0] + Math.sin(a) * d, G.lie[1] + Math.cos(a) * d, 0.05); if (q[2] < 0.5) continue; if (d === 1) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); }
    ctx.stroke(); ctx.setLineDash([]);
    var m = proj(G.lie[0], G.lie[1], 0); if (m[2] > 0.5) { ctx.fillStyle = '#ff2a35'; ctx.beginPath(); ctx.ellipse(m[0], m[1], 14, 4, 0, 0, 6.3); ctx.fill(); }
  }
  function drawMini() {
    var h = G.h, mw = 112, mh = 150, ox = W - mw - 10, oy = 10;
    ctx.save(); ctx.globalAlpha = 0.92; ctx.fillStyle = 'rgba(8,2,6,.82)'; ctx.strokeStyle = 'rgba(255,42,53,.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(ox, oy, mw, mh, 8) : ctx.rect(ox, oy, mw, mh); ctx.fill(); ctx.stroke(); ctx.clip();
    var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9; h.path.forEach(function (p) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); });
    var pad = 22, sx = (mw - 10) / (maxx - minx + 2 * pad), sy = (mh - 10) / (maxy - miny + 14), k = Math.min(sx, sy);
    function M(x, y) { return [ox + mw / 2 + (x - (minx + maxx) / 2) * k, oy + mh - 8 - (y - miny + 4) * k]; }
    ctx.strokeStyle = '#3f7a47'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, h.width * k); ctx.beginPath(); h.path.forEach(function (p, i) { var m = M(p[0], p[1]); if (i) ctx.lineTo(m[0], m[1]); else ctx.moveTo(m[0], m[1]); }); ctx.stroke();
    ctx.fillStyle = '#2f6fe0'; h.water.forEach(function (w) { var a = M(w[0], w[3]), b = M(w[2], w[1]); ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); });
    ctx.fillStyle = '#143d22'; h.treeList.forEach(function (t) { if (t.big || pathDist(h, t.x, t.y) < h.width / 2 + 8) { var m = M(t.x, t.y); ctx.beginPath(); ctx.arc(m[0], m[1], 1.5, 0, 6.3); ctx.fill(); } });
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); G.throws.forEach(function (p, i) { var m = M(p[0], p[1]); if (i) ctx.lineTo(m[0], m[1]); else ctx.moveTo(m[0], m[1]); }); if (G.flight) { var f = M(G.flight.p[0], G.flight.p[1]); ctx.lineTo(f[0], f[1]); } ctx.stroke();
    var bm = M(h.basket[0], h.basket[1]); ctx.fillStyle = '#ff2a35'; ctx.beginPath(); ctx.arc(bm[0], bm[1], 3.4, 0, 6.3); ctx.fill();
    var lm = M(G.lie[0], G.lie[1]); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(lm[0], lm[1], 3, 0, 6.3); ctx.fill();
    ctx.restore();
  }
  function drawHud() {
    // wind
    var wx = G.wind[0], wy = G.wind[1], ws = Math.hypot(wx, wy), ang = Math.atan2(wx, wy) - cam.yaw;   // direction the wind blows, relative to the view
    ctx.save(); ctx.translate(46, H - 48); ctx.fillStyle = 'rgba(8,2,6,.7)'; ctx.strokeStyle = 'rgba(255,42,53,.5)'; ctx.beginPath(); ctx.arc(0, 0, 30, 0, 6.3); ctx.fill(); ctx.stroke();
    ctx.rotate(ang); ctx.fillStyle = '#ffd1d4'; ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(9, -3); ctx.lineTo(3, -3); ctx.lineTo(3, 18); ctx.lineTo(-3, 18); ctx.lineTo(-3, -3); ctx.lineTo(-9, -3); ctx.closePath(); ctx.globalAlpha = 0.35 + Math.min(0.65, ws / 5); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#ffd1d4'; ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('WIND ' + ws.toFixed(0) + ' m/s', 46, H - 8);
    // distance
    ctx.textAlign = 'center'; ctx.font = '700 15px system-ui, sans-serif'; ctx.fillStyle = 'rgba(8,2,6,.7)'; ctx.fillRect(W / 2 - 60, 8, 120, 26); ctx.fillStyle = '#fff'; ctx.fillText(Math.round(distToBasket()) + ' m to basket', W / 2, 26);
    // power meter
    if (G.phase === 'charge' || charging) {
      var pw = chargeLevel(), mx = W / 2 - 110, my = H - 36; ctx.fillStyle = 'rgba(8,2,6,.8)'; ctx.fillRect(mx - 4, my - 4, 228, 22);
      var g = ctx.createLinearGradient(mx, 0, mx + 220, 0); g.addColorStop(0, '#3acb62'); g.addColorStop(0.7, '#ffd45a'); g.addColorStop(1, '#ff2a35'); ctx.fillStyle = g; ctx.fillRect(mx, my, 220 * pw, 14);
      ctx.strokeStyle = '#fff'; ctx.strokeRect(mx, my, 220, 14); ctx.fillStyle = '#fff'; ctx.font = '700 11px system-ui, sans-serif'; ctx.fillText('POWER ' + Math.round(pw * 100) + '%', W / 2, my - 8);
    }
    ctx.textAlign = 'left';
  }
  function draw() {
    setCam(); var hor = drawSky(); drawGround();
    var items = [], h = G.h;
    h.treeList.forEach(function (t) { var q = proj(t.x, t.y, 0); if (q[2] > 0.8 && q[2] < 330) items.push({ q: q, f: function () { drawTree(t, q); } }); });
    var bq = proj(h.basket[0], h.basket[1], 0); if (bq[2] > 0.8) items.push({ q: bq, f: function () { drawBasket(h.basket, bq); } });
    // discs at rest (earlier lies) and the one in flight
    G.throws.forEach(function (t, i) { if (i === 0 || i === G.throws.length - 1 && G.phase !== 'fly') return; var q = proj(t[0], t[1], 0.05); if (q[2] > 0.8) items.push({ q: q, f: function () { drawDisc([t[0], t[1], 0.05], P.DISCS.mid, 0, 0.5); } }); });
    var dp = null;
    if (G.phase === 'fly' && G.flight) dp = { p: G.flight.p, bank: G.flight.bank };
    else if (G.phase === 'roll' && G.roll) { var r = G.roll, k = clamp(r.t / r.dur, 0, 1), e = 1 - (1 - k) * (1 - k); dp = { p: [mix(r.x0, r.x1, e), mix(r.y0, r.y1, e), 0.05], bank: 0 }; }
    else dp = { p: [G.lie[0], G.lie[1], 0.05], bank: 0 };
    if (G.phase !== 'holed') { var dq = proj(dp.p[0], dp.p[1], dp.p[2]); if (dq[2] > 0.5) items.push({ q: dq, f: function () { drawDisc(dp.p, disc, dp.bank); } }); }
    items.sort(function (a, b) { return b.q[2] - a.q[2]; }); items.forEach(function (it) { it.f(); });
    drawTrail(); drawAimLine(); drawMini(); drawHud();
  }

  /* ---------- loop ---------- */
  function frame(now) {
    if (!running) return; var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (G.phase === 'fly') flightStep(dt);
    else if (G.phase === 'roll') { G.roll.t += dt; if (G.roll.t >= G.roll.dur) { var r = G.roll; G.roll = null; rest([r.x1, r.y1]); } }
    else if (G.phase === 'rest' && now - G.rest > 1100) G.phase = 'aim';
    moveCam(dt); draw(); raf = requestAnimationFrame(frame);
  }
  function play() { if (running) return; if (!G) newRound(); running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  function pause() { running = false; cancelAnimationFrame(raf); charging = false; if (G && G.phase === 'charge') G.phase = 'aim'; }
  document.addEventListener('ss:cvgame', function (e) { if (e.detail === 'dd') play(); else pause(); });
  document.addEventListener('ss:route', function (e) { if (e.detail.name !== 'craving') pause(); else if (!root.hidden) play(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); else if (!root.hidden && !document.querySelector('[data-view="craving"]').hidden) play(); });
  window.__dd = function () { return { G: G, P: P, doThrow: doThrow, cam: cam }; };
  newRound();
})();
