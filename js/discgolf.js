/* Kraving Killer game 3: Disc-ipline, a 3D disc golf game with real flight physics (see discphys.js).
   Real disc molds with their published flight numbers, six holes, wind, trees, water, and a basket you have to hit the chains on.
   Pick a disc, aim (drag the view or use the slider), set hyzer / anhyzer and the nose angle, hold THROW to charge, release to throw.
   Rendering is WebGL through Three.js (js/vendor/three.min.js), loaded the first time the game opens. */
(function () {
  var root = document.getElementById('dd'); if (!root || !window.DiscPhys) return;
  var P = DiscPhys, $ = function (id) { return document.getElementById(id); };
  var stage = $('dd-stage'), glc = $('dd-gl'), hud = $('dd-hud'), hctx = hud.getContext('2d');
  var chipsEl = document.querySelector('#dd-stage .dd-chips'), elHole = $('dd-hole'), elPar = $('dd-par'), elStr = $('dd-str'), toast = $('dd-toast'), msgEl = $('dd-msg'), over = $('dd-over'), overT = $('dd-over-t'), overS = $('dd-over-s'), nextBtn = $('dd-next');
  var sBank = $('dd-bank'), sLa = $('dd-la'), sAim = $('dd-aim'), lblLa = $('dd-la-l'), lblAim = $('dd-aim-l'), handBtn = $('dd-hand'), discsEl = $('dd-discs');
  var capEl = $('dd-cap'), lblCap = $('dd-cap-l'), dock = $('dd-dock'), menuBtn = $('dd-menu'), menuPanel = $('dd-menupanel'), vsEl = $('dd-vs');
  var drawer = $('dd-drawer'), discBtn = $('dd-discbtn'), discDot = $('dd-discdot'), discName = $('dd-discname'), discNums = $('dd-discnums'), fsBtn = $('dd-fs');
  var CAP = 1;
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
  var MAPX = 100;
  var CLASSIC = HOLES;


  /* ---------- the Disc-ipline Challenge: 18 technical holes ----------
     Features are written relative to the path (f = how far along it, lat = metres to the right of it) so they follow the hole when a tee or basket is moved.
       gates:  [f, gap, shift]  two big trees you must pass between      clusters: [f, lat, count, radius]  a stand of trees
       ponds:  [f, lat, rx, ry] water      bushes / rocks: [f, lat, radius]  low obstacles that block a flat shot */
  function H(name, par, path, width, wind, o) { o = o || {}; return { name: name, par: par, path: path, width: width, wind: wind, trees: [], water: [], tight: o.tight || 0, density: o.density || 1, gates: o.gates || [], clusters: o.clusters || [], ponds: o.ponds || [], bushes: o.bushes || [], rocks: o.rocks || [], island: !!o.island, hint: o.hint || '' }; }
  var CHALLENGE = [
    H('First Light', 3, [[0, 0], [0, 84]], 30, [1, 0.5], { gates: [[0.5, 11]], clusters: [[0.72, -9, 3, 3]], bushes: [[0.3, 8, 1.2], [0.85, -7, 1.1]] }),
    H('The Needle', 3, [[0, 0], [0, 62]], 9, [0, 1], { tight: 1, gates: [[0.55, 5]], rocks: [[0.3, 3.2, 0.8]] }),
    H('Mando Left', 3, [[0, 0], [0, 48], [-22, 86]], 22, [2, 0], { gates: [[0.35, 8], [0.72, 7, 1]], clusters: [[0.55, 8, 4, 4]], bushes: [[0.9, 4, 1.4]] }),
    H('Pond Life', 3, [[0, 0], [0, 100]], 26, [-2, 1], { ponds: [[0.55, 8, 13, 19]], clusters: [[0.45, -12, 5, 4], [0.85, 10, 3, 3]], bushes: [[0.2, -6, 1.3]] }),
    H('Switchback', 4, [[0, 0], [0, 58], [30, 86], [28, 134]], 20, [-1, -2], { gates: [[0.22, 9], [0.7, 8, 2]], clusters: [[0.45, -8, 5, 4], [0.58, 12, 4, 4]], rocks: [[0.4, 2, 1.1]] }),
    H('Boulder Alley', 3, [[0, 0], [0, 80]], 16, [1, 1], { rocks: [[0.25, -3, 1.3], [0.42, 3.5, 1.5], [0.6, -2.5, 1.2], [0.8, 2, 1.4]], gates: [[0.7, 6]], bushes: [[0.5, 0, 1.1]] }),
    H('The Gauntlet', 4, [[0, 0], [0, 150]], 12, [0, 2], { tight: 1, gates: [[0.2, 6, -2.5], [0.42, 6, 2.5], [0.64, 5.6, -2.5], [0.84, 5.6, 2]] }),
    H('Over the Creek', 3, [[0, 0], [0, 90]], 24, [2, -1], { ponds: [[0.5, 0, 46, 4.5]], bushes: [[0.3, 7, 1.3], [0.72, -6, 1.2]], clusters: [[0.8, 9, 4, 3.5]], gates: [[0.2, 10]] }),
    H('Island Green', 3, [[0, 0], [0, 72]], 28, [-1, 0], { ponds: [[1.0, 0, 20, 22]], island: true, clusters: [[0.4, -12, 4, 3.5]], bushes: [[0.55, 9, 1.3]] }),
    H('Dogleg Left', 4, [[0, 0], [0, 66], [-42, 104], [-48, 140]], 20, [1, 2], { gates: [[0.3, 8], [0.62, 6.5]], clusters: [[0.5, 9, 6, 4.5], [0.78, -10, 3, 3.5]], bushes: [[0.9, 5, 1.2]] }),
    H('Cathedral', 3, [[0, 0], [0, 96]], 14, [0, -1], { tight: 1, density: 1.4, gates: [[0.35, 6.5], [0.7, 6, 1.5]], clusters: [[0.5, -5, 3, 2.5]] }),
    H('S-Curve', 4, [[0, 0], [0, 40], [-20, 70], [10, 100], [12, 130]], 18, [-2, 1], { gates: [[0.28, 8], [0.62, 7]], clusters: [[0.45, 10, 5, 4], [0.7, -10, 5, 4]], rocks: [[0.85, 3, 1.2]] }),
    H('Short & Spicy', 3, [[0, 0], [0, 54]], 8, [1, 0], { tight: 1, gates: [[0.3, 5], [0.7, 4.8, 1]], rocks: [[0.5, -2, 0.9]], bushes: [[0.85, 2.5, 1]] }),
    H('The Long Haul', 5, [[0, 0], [0, 92], [20, 140], [18, 196]], 26, [3, 0], { ponds: [[0.62, -4, 40, 4.5]], gates: [[0.3, 12], [0.88, 8]], clusters: [[0.45, 14, 5, 4], [0.75, -12, 6, 5]], bushes: [[0.2, -8, 1.3], [0.5, 9, 1.3]], rocks: [[0.95, 4, 1.2]] }),
    H('Twin Pines', 3, [[0, 0], [0, 84]], 28, [-2, -1], { gates: [[0.5, 4.4]], clusters: [[0.25, -11, 4, 3.5], [0.8, 12, 4, 3.5]], bushes: [[0.4, 5, 1.2], [0.62, -6, 1.2]] }),
    H('Rock Garden', 4, [[0, 0], [0, 62], [28, 98], [30, 122]], 20, [1, -2], { rocks: [[0.2, 3, 1.4], [0.38, -4, 1.3], [0.55, 4.5, 1.6], [0.72, -2, 1.2], [0.88, 3, 1.4]], bushes: [[0.3, 7, 1.2], [0.64, -7, 1.3]], gates: [[0.5, 8]] }),
    H('The Narrows', 4, [[0, 0], [0, 142]], 30, [-3, 1], { ponds: [[0.38, -24, 15, 36], [0.38, 24, 15, 36], [0.78, -24, 15, 30], [0.78, 24, 15, 30]], gates: [[0.58, 9]], bushes: [[0.2, 8, 1.2]] }),
    H('Sober Finale', 4, [[0, 0], [0, 68], [8, 126], [0, 162]], 22, [-3, -3], { ponds: [[0.55, -20, 14, 22], [0.55, 22, 14, 22], [0.94, -12, 10, 12]], gates: [[0.3, 9], [0.8, 7]], clusters: [[0.45, 0, 2, 2]], bushes: [[0.62, 0, 1.2], [0.9, 7, 1.2]] })
  ];
  [1.2, 0.4, 1.6, 1.0, 2.2, 1.3, 0.6, 0.9, 0.8, 2.4, 1.5, 2.4, 0.7, 2.0, 1.4, 1.8, 0.6, 2.0].forEach(function (a, i) { CHALLENGE[i].hill = a; CHALLENGE[i].rise = [0, 0, 1.2, 0, 2, -1.2, 0, 0.8, 0, -2.5, 0, 1.6, 0, 2.8, 0, -1.6, 0, 2.2][i]; });

  /* ---------- real courses ----------
     Lengths and pars below are made to add up to each course's published totals (the hole-by-hole numbers are not published in a form
     I could read), so these are lookalikes: right size, right feel, not a hole-for-hole copy. Players can drag any tee or basket in the editor. */
  function genCourse(seed, lengthsFt, o) {
    var r = rng(seed), out = [];
    lengthsFt.forEach(function (ft, i) {
      var L = ft * 0.3048, bend = r() < o.bendP, side = r() < 0.5 ? -1 : 1, path, lat;
      if (bend) { lat = side * L * (0.12 + r() * 0.16); path = [[0, 0], [0, L * 0.55], [lat, L * 0.55 + Math.sqrt(Math.max(1, L * L * 0.2025 - lat * lat))]]; }
      else { lat = (r() - 0.5) * L * 0.08; path = [[0, 0], [lat, L]]; }
      var tight = o.tight.indexOf(i + 1) >= 0, width = tight ? 11 : o.width + r() * o.wvar, trees = [], nt = 3 + Math.floor(r() * 4);
      for (var k = 0; k < nt; k++) { var f = 0.15 + r() * 0.75, sd = r() < 0.5 ? -1 : 1, seg = f < 0.55 || path.length < 3 ? 0 : 1, a0 = path[seg], a1 = path[seg + 1], tt = path.length < 3 ? f : (seg ? (f - 0.55) / 0.45 : f / 0.55); trees.push([a0[0] + (a1[0] - a0[0]) * tt + sd * (width / 2 + 1.5 + r() * 5), a0[1] + (a1[1] - a0[1]) * tt]); }
      var water = []; if (o.creek && o.creek[i + 1]) { var c = o.creek[i + 1]; water.push([-60, L * c[0], 60, L * c[1]]); }
      out.push({ name: ft + ' ft', par: 3, path: path, width: width, wind: [(r() - 0.5) * 5, (r() - 0.5) * 4], trees: trees, water: water, tight: tight ? 1 : 0, density: o.density, ft: ft });
    });
    return out;
  }
  var COURSES = [
    { id: 'challenge', name: 'Disc-ipline Challenge (18 holes)', note: 'The Sup Sobers technical course: gates between the trees, boulders, bushes, creeks and an island green. Every hole is tough but fair.', holes: CHALLENGE },
    { id: 'classic', name: 'Kraving Killer (6 holes)', note: 'The original six holes: a warm-up, a dogleg, water, a tunnel and a finale.', holes: CLASSIC },
    { id: 'aviary', name: 'The Aviary, Colorado Springs', note: '18 holes, 4,805 ft, concrete tees. Fountain Creek runs through it, with a short, tight, wooded middle. Built from the published totals, so holes are look-alikes: use Edit hole to move any tee or basket to match.',
      holes: genCourse(7596, [196, 315, 210, 235, 360, 248, 215, 190, 335, 262, 228, 345, 205, 240, 255, 345, 415, 206], { bendP: 0.4, width: 16, wvar: 7, tight: [9, 10, 11], creek: { 1: [0.38, 0.52], 6: [0.4, 0.55], 14: [0.45, 0.6] }, density: 1 }) },
    { id: 'widefield', theme: 'winter', name: 'Widefield Park, Colorado Springs (winter)', note: 'A snowy day at Widefield Park: 18 holes, about 6,000 ft, flat and full of big old trees, with a brook across several fairways. Snow is falling and the grass is buried. Built from the published totals, so holes are look-alikes: use Edit hole to move any tee or basket to match.',
      holes: (function () { var hs = genCourse(4421, [285, 342, 468, 310, 262, 330, 295, 425, 318, 276, 350, 455, 300, 265, 372, 288, 354, 330], { bendP: 0.3, width: 17, wvar: 6, tight: [], creek: { 2: [0.42, 0.52], 7: [0.5, 0.6], 13: [0.35, 0.45], 16: [0.55, 0.65] }, density: 1.25 }); [3, 8, 12, 17].forEach(function (n) { hs[n - 1].par = 4; }); return hs; })() },
    { id: 'rampart', name: 'Rampart, Colorado Springs', note: '18 holes, 3,638 ft, a mix of long shots and short technical ones in a lightly wooded park. The hills are not in the game yet, only the distances and layout. Look-alike holes: use Edit hole to match the real ones.',
      holes: genCourse(8142, [150, 235, 180, 310, 165, 205, 250, 140, 190, 330, 175, 160, 220, 255, 185, 198, 135, 155], { bendP: 0.45, width: 20, wvar: 8, tight: [], creek: null, density: 0.55 }) }
  ];
  var COURSE = COURSES[0], HOLES = CHALLENGE, HOLE_N = HOLES.length, EDITS = {};
  try { EDITS = JSON.parse(localStorage.getItem('ss-disc-edits') || '{}') || {}; } catch (e) { EDITS = {}; }
  function setCourse(id) {
    COURSE = COURSES.filter(function (c) { return c.id === id; })[0] || COURSES[0]; HOLES = COURSE.holes; HOLE_N = HOLES.length;
    HOLES.forEach(function (h) { h.built = false; }); curBuilt = -1;
    try { localStorage.setItem('ss-disc-course', COURSE.id); } catch (e) {}
  }
  try { setCourse(localStorage.getItem('ss-disc-course') || 'challenge'); } catch (e) {}
  function saveEdit(i, tee, basket) {
    var e = EDITS[COURSE.id] = EDITS[COURSE.id] || {}; e[i] = { tee: tee, basket: basket };
    try { localStorage.setItem('ss-disc-edits', JSON.stringify(EDITS)); } catch (er) {}
  }
  function clearEdit(i) { if (EDITS[COURSE.id]) delete EDITS[COURSE.id][i]; try { localStorage.setItem('ss-disc-edits', JSON.stringify(EDITS)); } catch (er) {} }


  function segDist(px, py, ax, ay, bx, by) { var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0; var cx = ax + dx * t, cy = ay + dy * t; return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy)); }
  function pathDist(h, x, y) { var m = 1e9; for (var i = 0; i < h.path.length - 1; i++) m = Math.min(m, segDist(x, y, h.path[i][0], h.path[i][1], h.path[i + 1][0], h.path[i + 1][1])); return m; }
  function inWater(h, x, y) {
    if (h.island && h.basket && Math.hypot(x - h.basket[0], y - h.basket[1]) < 6.5) return false;   // the island
    for (var i = 0; i < h.water.length; i++) { var w = h.water[i]; if (w[4] === 'e') { var ex = (x - w[0]) / w[2], ey = (y - w[1]) / w[3]; if (ex * ex + ey * ey < 1) return true; } else if (x > w[0] && x < w[2] && y > w[1] && y < w[3]) return true; }
    return false;
  }
  function pathAt(h, f) {   // point and heading a fraction f along the hole
    var L = 0, i, segs = []; for (i = 0; i < h.path.length - 1; i++) { var l = Math.hypot(h.path[i + 1][0] - h.path[i][0], h.path[i + 1][1] - h.path[i][1]); segs.push(l); L += l; }
    var d = clamp(f, 0, 1) * L; for (i = 0; i < segs.length; i++) { if (d <= segs[i] || i === segs.length - 1) { var a = h.path[i], b = h.path[i + 1], t = segs[i] ? Math.min(1, d / segs[i]) : 0, hx = (b[0] - a[0]) / (segs[i] || 1), hy = (b[1] - a[1]) / (segs[i] || 1); return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, hx: hx, hy: hy }; } d -= segs[i]; }
    return { x: 0, y: 0, hx: 0, hy: 1 };
  }
  /* ---------- gentle hills ---------- */
  var EH = null;
  function sm(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function wq(w, x, y) { if (w[4] === 'e') { var ex = (x - w[0]) / w[2], ey = (y - w[1]) / w[3]; return Math.sqrt(ex * ex + ey * ey); } var hx = (w[2] - w[0]) / 2, hy = (w[3] - w[1]) / 2; return Math.max(Math.abs(x - (w[0] + w[2]) / 2) / hx, Math.abs(y - (w[1] + w[3]) / 2) / hy); }
  function ghBase(h, x, y) { var by = h.basket[1]; return (h.rise || 0) * sm(0, by, y) * (1 - sm(60, 100, Math.abs(x))) * (1 - sm(by + 30, by + 75, y)); }
  function gh0(h, x, y) {
    var b = ghBase(h, x, y), s = h.seed || 0, amp = h.hl; if (!amp) return b;
    var n = 0.5 * Math.sin(x * 0.085 + s) * Math.cos(y * 0.062 + s * 1.3) + 0.32 * Math.sin(x * 0.047 + y * 0.081 + s * 2.1) + 0.2 * Math.cos(x * 0.12 - y * 0.05 + s * 0.7), by = h.basket[1];
    var k = sm(4, 15, Math.hypot(x - h.tee[0], y - h.tee[1])) * sm(4, 15, Math.hypot(x - h.basket[0], y - by)) * (1 - sm(60, 100, Math.abs(x))) * (1 - sm(by + 30, by + 75, y)) * sm(-45, -20, y);
    if (k > 0) for (var i = 0; i < h.water.length; i++) { k = Math.min(k, sm(1.0, 2.1, wq(h.water[i], x, y))); if (k <= 0) break; }
    return b + amp * n * k;
  }
  function gh(x, y) {   // ground height at a point of the current hole; flat at the tee and basket, dished down to the water
    var h = EH; if (!h) return 0; var v = gh0(h, x, y);
    for (var i = 0; i < h.water.length; i++) {
      var w = h.water[i], q = wq(w, x, y); if (q >= 1.6) continue; var lv = w.lvl || 0;
      if (q < 1) { var k = 1, isl = 0; if (h.island) { k = sm(6.0, 9.5, Math.hypot(x - h.basket[0], y - h.basket[1])); isl = (1 - k) * 0.3; } v = lv - 0.6 * (1 - q * q) * k + isl; }
      else v = lv + (v - lv) * sm(1, 1.6, q);
    }
    return v;
  }
  function slopeRoll(ro, p) {   // a landed disc slides a little downhill
    var e = 0.8, gx = (gh(p[0] + e, p[1]) - gh(p[0] - e, p[1])) / (2 * e), gy = (gh(p[0], p[1] + e) - gh(p[0], p[1] - e)) / (2 * e), L = Math.hypot(ro[0], ro[1]) + 1.5, ex = -gx * L * 1.5, ey = -gy * L * 1.5, m = Math.hypot(ex, ey);
    if (m > 7) { ex *= 7 / m; ey *= 7 / m; }
    return [ro[0] + ex, ro[1] + ey];
  }
  function terrain(h, x, y) {
    if (inWater(h, x, y)) return 'water';
    var d = pathDist(h, x, y), b = h.basket;
    if (d > 62 || y < -30 || y > b[1] + 55) return 'ob';
    if (d < h.width / 2 || Math.hypot(x - b[0], y - b[1]) < 7) return 'fair';
    return 'rough';
  }
  function buildHole(i) {
    var h = HOLES[i];
    if (!h.orig) h.orig = JSON.parse(JSON.stringify(h.path));
    h.path = JSON.parse(JSON.stringify(h.orig));
    var ed = EDITS[COURSE.id] && EDITS[COURSE.id][i];
    if (ed) { h.path[0] = ed.tee.slice(); h.path[h.path.length - 1] = ed.basket.slice(); }
    h.tee = h.path[0]; h.basket = h.path[h.path.length - 1];
    if (!h.water0) h.water0 = h.water || [];
    function rel(f, lat) { var q = pathAt(h, f); return [q.x + q.hy * lat, q.y - q.hx * lat, q]; }
    h.water = h.water0.concat((h.ponds || []).map(function (q) { var c = rel(q[0], q[1]); return [c[0], c[1], q[2], q[3], 'e']; }));
    h.hl = h.hill != null ? h.hill : 1.2; h.seed = i * 7.31 + COURSE.id.length * 1.9; EH = h;
    h.water.forEach(function (w) { var cx = w[4] === 'e' ? w[0] : (w[0] + w[2]) / 2, cy = w[4] === 'e' ? w[1] : (w[1] + w[3]) / 2; w.lvl = ghBase(h, cx, cy); });
    h.tz = gh(h.tee[0], h.tee[1]); h.bz = gh(h.basket[0], h.basket[1]);
    if (h.built) return h; h.built = true;
    var r = rng(1234 + i * 77), tr = [];
    h.trees.forEach(function (t) { tr.push({ x: t[0], y: t[1], h: rnd(8, 12), big: true }); });
    (h.gates || []).forEach(function (g) { var c = rel(g[0], g[2] || 0); [-1, 1].forEach(function (sd) { var q = rel(g[0], (g[2] || 0) + sd * g[1] / 2); tr.push({ x: q[0], y: q[1], h: 11 + r() * 3, big: true, gate: true }); }); });
    (h.clusters || []).forEach(function (cl) { var c = rel(cl[0], cl[1]); for (var k = 0; k < cl[2]; k++) { var a = r() * 6.28, rd = Math.sqrt(r()) * cl[3]; tr.push({ x: c[0] + Math.cos(a) * rd, y: c[1] + Math.sin(a) * rd, h: 9 + r() * 4, big: true }); } });
    var ob = [];
    (h.bushes || []).forEach(function (b) { var c = rel(b[0], b[1]); ob.push({ x: c[0], y: c[1], r: b[2], kind: 'bush' }); });
    (h.rocks || []).forEach(function (b) { var c = rel(b[0], b[1]); ob.push({ x: c[0], y: c[1], r: b[2], kind: 'rock' }); });
    for (var bi = 0; bi < 36; bi++) {
      var f0 = r() * 0.95 + 0.02, side = r() < 0.5 ? -1 : 1, c0 = rel(f0, side * (h.width / 2 + 1 + r() * 9)), isRock = r() < 0.5;
      if (inWater(h, c0[0], c0[1]) || Math.hypot(c0[0] - h.tee[0], c0[1] - h.tee[1]) < 4 || Math.hypot(c0[0] - h.basket[0], c0[1] - h.basket[1]) < 4) continue;
      ob.push({ x: c0[0], y: c0[1], r: isRock ? 0.6 + r() * 1.3 : 0.7 + r() * 0.9, kind: isRock ? 'rock' : 'bush', filler: true });
      if (isRock && r() < 0.6) for (var rk = 0; rk < 2; rk++) { var ra = r() * 6.28, rd = 1.1 + r() * 1.2, cx2 = c0[0] + Math.cos(ra) * rd, cy2 = c0[1] + Math.sin(ra) * rd; if (!inWater(h, cx2, cy2)) ob.push({ x: cx2, y: cy2, r: 0.35 + r() * 0.5, kind: 'rock', filler: true }); }
    }
    h.obst = ob;
    var count = Math.round((h.tight ? 170 : 130) * (h.density || 1));
    for (var n = 0; n < count; n++) {
      var yy = r() * (h.basket[1] + 40) - 10, xx = (r() - 0.5) * 170 + (h.path[Math.min(h.path.length - 1, 1)][0] * 0.5);
      var dd = pathDist(h, xx, yy), gap = h.width / 2 + (h.tight ? 0.8 : 3 + r() * 5);
      if (dd < gap || inWater(h, xx, yy) || Math.hypot(xx - h.tee[0], yy - h.tee[1]) < 7 || Math.hypot(xx - h.basket[0], yy - h.basket[1]) < 8) continue;
      tr.push({ x: xx, y: yy, h: 7 + r() * 6 });
    }
    if (h.tight) for (var yy2 = 6; yy2 < h.basket[1]; yy2 += 4.5) { [-1, 1].forEach(function (sd) { var tx = h.path[0][0] + sd * (h.width / 2 + 0.9 + r() * 0.8); if (Math.abs(yy2 - 38) < 2 && sd < 0) return; tr.push({ x: tx, y: yy2 + r() * 1.5, h: 9 + r() * 4 }); }); }
    tr.forEach(function (t) { t.s = 0.85 + r() * 0.5; t.rot = r() * 6.28; t.tone = r(); t.kind = t.gate ? 'pine' : (r() < 0.38 ? 'oak' : 'pine'); });
    h.treeList = tr; tr.forEach(function (t) { t.g = gh(t.x, t.y); }); ob.forEach(function (o) { o.g = gh(o.x, o.y); });
    return h;
  }


  /* ---------- rewards: badges for good holes, medals for good rounds ---------- */
  var ACH = [
    { id: 'ace', ic: '🎯', n: 'Ace', d: 'Hole in one.' },
    { id: 'eagle', ic: '🦅', n: 'Eagle', d: 'Two under par on a hole.' },
    { id: 'birdie', ic: '🐦', n: 'Birdie', d: 'One under par on a hole.' },
    { id: 'par', ic: '✅', n: 'Straight and sober', d: 'Make par on a hole.' },
    { id: 'chains', ic: '⛓️', n: 'Chain reaction', d: 'Sink a putt through the chains.' },
    { id: 'hat', ic: '🎩', n: 'Hat trick', d: 'Three birdies in a row.' },
    { id: 'dodge', ic: '🌲', n: 'Tree dodger', d: 'Make par or better without touching a tree, bush or rock.' },
    { id: 'scramble', ic: '🧗', n: 'Scrambler', d: 'Make par or better after hitting an obstacle.' },
    { id: 'bomb', ic: '💣', n: 'Bomber', d: 'Throw a disc 120 m or more.' },
    { id: 'clean', ic: '💧', n: 'Dry round', d: 'Finish a round without a water or out-of-bounds penalty.' },
    { id: 'pup', ic: '🐶', n: 'Good dog', d: 'Pet your dog caddy.' },
    { id: 'pup25', ic: '🦴', n: 'Best friends', d: 'Pet your dog 25 times.' },
    { id: 'wild', ic: '🐇', n: 'Wildlife spotter', d: 'Tap 5 critters on the course.' },
    { id: 'skip', ic: '💦', n: 'Skipping stone', d: 'Skip a disc across the water.' },
    { id: 'skip3', ic: '🌊', n: 'Triple skip', d: 'Skip a disc three times on one throw.' },
    { id: 'clutch', ic: '🧲', n: 'Clutch putt', d: 'Sink a putt from 10 m or more.' },
    { id: 'pizza', ic: '🍕', n: 'Pizza delivery', d: 'Sink a Pizza putt.' },
    { id: 'm_par', ic: '🥉', n: 'Bronze medal', d: 'Finish a round at even par or better.' },
    { id: 'm_3', ic: '🥈', n: 'Silver medal', d: 'Finish a round 3 under par or better.' },
    { id: 'm_6', ic: '🥇', n: 'Gold medal', d: 'Finish a round 6 under par or better.' },
    { id: 'm_9', ic: '🏆', n: 'Platinum trophy', d: 'Finish a round 9 under par or better.' }
  ];
  var AWON = {}; try { AWON = JSON.parse(localStorage.getItem('ss-disc-ach') || '{}') || {}; } catch (e) { AWON = {}; }
  var badgeEl = document.createElement('div'); badgeEl.className = 'dd-badge'; badgeEl.setAttribute('aria-live', 'polite'); badgeEl.innerHTML = '<i></i><div><b></b><small></small></div>'; stage.appendChild(badgeEl);
  var badgeQ = [], badgeBusy = false;
  function achOf(id) { return ACH.filter(function (a) { return a.id === id; })[0]; }
  function showNextBadge() {
    if (badgeBusy || !badgeQ.length) return; badgeBusy = true; var a = badgeQ.shift();
    badgeEl.querySelector('i').textContent = a.ic; badgeEl.querySelector('b').textContent = a.n + (a.first ? ' (new!)' : ''); badgeEl.querySelector('small').textContent = a.d;
    badgeEl.classList.remove('on'); void badgeEl.offsetWidth; badgeEl.classList.add('on');
    setTimeout(function () { badgeEl.classList.remove('on'); badgeBusy = false; showNextBadge(); }, 3500);
  }
  function award(id) {
    var a = achOf(id); if (!a) return; var first = !AWON[id]; AWON[id] = (AWON[id] || 0) + 1;
    try { localStorage.setItem('ss-disc-ach', JSON.stringify(AWON)); } catch (e) {}
    badgeQ.push({ ic: a.ic, n: a.n, d: a.d, first: first }); showNextBadge(); trophyCount();
  }
  function trophyCount() { var n = ACH.filter(function (a) { return AWON[a.id]; }).length, el = $('dd-trophy-n'); if (el) el.textContent = n + ' of ' + ACH.length + ' earned'; }
  function awardHole(st, par, chains) {
    var diff = st - par;
    if (st === 1) award('ace'); else if (diff <= -2) award('eagle'); else if (diff === -1) award('birdie'); else if (diff === 0) award('par');
    if (chains) award('chains');
    G.streak = diff < 0 ? (G.streak || 0) + 1 : 0; if (diff < 0 && G.streak === 3) award('hat');
    if (diff <= 0 && !G.holeHits) award('dodge'); if (diff <= 0 && G.holeHits) award('scramble');
  }
  function awardRound(tot, totPar) {
    var vs = tot - totPar, medal = null;
    if (vs <= -9) medal = 'm_9'; else if (vs <= -6) medal = 'm_6'; else if (vs <= -3) medal = 'm_3'; else if (vs <= 0) medal = 'm_par';
    if (!G.roundPen) award('clean'); if (medal) award(medal);
    return medal;
  }
  function openTrophies() {
    var grid = $('dd-trgrid'), n = 0; grid.innerHTML = '';
    ACH.forEach(function (a) { var on = AWON[a.id]; if (on) n++; var d = document.createElement('div'); d.className = 'dd-tr' + (on ? '' : ' off'); d.innerHTML = '<i>' + a.ic + '</i><span><b>' + a.n + (on > 1 ? ' x' + on : '') + '</b><small>' + a.d + '</small></span>'; grid.appendChild(d); });
    $('dd-trsum').textContent = n + ' of ' + ACH.length + ' earned. Beat par to earn more.'; $('dd-trov').hidden = false;
  }
  function openCard() {
    var wrap = $('dd-cardwrap'), sc = G.scores, par = HOLES.map(function (h) { return h.par; }), rows = '', tot = 0, tp = 0;
    function cell(i) { if (sc[i] === undefined) return '<td>&ndash;</td>'; var d = sc[i] - par[i], c = sc[i] === 1 ? 'e' : d <= -2 ? 'e' : d === -1 ? 'b' : d > 0 ? 'o' : ''; return '<td class="' + c + '">' + sc[i] + '</td>'; }
    for (var half = 0; half < Math.ceil(HOLE_N / 9); half++) {
      var a = half * 9, b = Math.min(HOLE_N, a + 9), hd = '<tr><th>Hole</th>', pr = '<tr><th>Par</th>', sr = '<tr><th>Score</th>', pp = 0, ss = 0, played = 0;
      for (var i = a; i < b; i++) { hd += '<th>' + (i + 1) + '</th>'; pr += '<td>' + par[i] + '</td>'; sr += cell(i); pp += par[i]; if (sc[i] !== undefined) { ss += sc[i]; played++; } }
      hd += '<th>' + (half ? 'In' : 'Out') + '</th></tr>'; pr += '<td>' + pp + '</td></tr>'; sr += '<td>' + (played ? ss : '&ndash;') + '</td></tr>'; rows += '<table>' + hd + pr + sr + '</table><br>';
    }
    sc.forEach(function (v, i) { tot += v; tp += par[i]; }); var vs = tot - tp;
    wrap.innerHTML = rows + '<p><b>Total ' + tot + '</b> after ' + sc.length + ' hole' + (sc.length === 1 ? '' : 's') + ' (' + (vs === 0 ? 'even' : vs > 0 ? '+' + vs : vs) + ' to par)</p>'; $('dd-cardov').hidden = false;
  }
  $('dd-card').addEventListener('click', openCard); $('dd-card-x').addEventListener('click', function () { $('dd-cardov').hidden = true; });
  $('dd-trophy').addEventListener('click', openTrophies); $('dd-tr-x').addEventListener('click', function () { $('dd-trov').hidden = true; });
  trophyCount();

  /* ---------- game state ---------- */
  var showPrevUntil = 0;
  var G = null, running = false, raf = 0, last = 0, chargeT = 0, charging = false, cam = { x: 0, y: -3, z: 3, yaw: 0, pitch: 0.1 };
  var disc = P.DISCS.destroyer, spin = 1, best = 0, previewDirty = true, ready = false, loading = false, failed = false, simTime = 0;
  try { best = +localStorage.getItem('ss-disc-best') || 0; } catch (e) {}

  function newRound() {
    G = { hole: 0, scores: [], phase: 'aim', strokes: 0, lie: null, prev: null, aimOff: 0, flight: null, trail: [], throws: [], roll: null, rest: 0, done: false, wob: 0, drop: null, chainHit: false, streak: 0, roundPen: 0, holeHits: 0 };
    startHole();
  }
  function startHole() {
    var h = buildHole(G.hole); G.h = h; G.strokes = 0; G.lie = [h.tee[0], h.tee[1]]; G.prev = null; G.throws = [[h.tee[0], h.tee[1]]]; G.trail = []; G.flight = null; G.phase = 'aim'; G.aimOff = 0; G.wind = h.wind; G.plan = null; G.prevPts = null; showPrevUntil = performance.now() + 3500; G.wob = 0; G.drop = null; G.chainHit = false; G.holeHits = 0; G.pen = 0;
    pickDiscFor(); aimBase(); syncUi(); over.hidden = true; say('Hole ' + (G.hole + 1) + ': ' + h.name + '. Par ' + h.par + '. ' + Math.round(distToBasket()) + ' m to the basket.' + (PETS === 0 ? ' Your dog is here: tap it to pet it.' : ''));
    if (ready) buildCourse(h);
    if (skipBtn) skipBtn.hidden = true; G.tour = null;
    snapCam(); previewDirty = true; if (ready) { placeDog(); beginTour(); }
  }
  function distToBasket() { return Math.hypot(G.h.basket[0] - G.lie[0], G.h.basket[1] - G.lie[1]); }
  function aimBase() { G.base = Math.atan2(G.h.basket[0] - G.lie[0], G.h.basket[1] - G.lie[1]); }
  function aim() { return G.base + G.aimOff; }
  function pickDiscFor() { var d = distToBasket(); chooseDisc(d < 30 ? 'aviar' : d < 65 ? 'buzzz' : d < 100 ? 'teebird' : 'destroyer'); }
  function say(t) { toast.textContent = t; toast.classList.add('on'); clearTimeout(say.t); say.t = setTimeout(function () { toast.classList.remove('on'); }, 3200); }
  function flash(t) { msgEl.textContent = t; msgEl.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(function () { msgEl.hidden = true; }, 1700); }

  /* ---------- UI wiring ---------- */
  P.LIST.forEach(function (d) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'dd-disc'; b.setAttribute('data-disc', d.id);
    b.innerHTML = '<i style="background:' + d.col + '"></i><em>' + d.kind + '</em><b>' + d.name + '</b><small>' + d.speed + ' | ' + d.glide + ' | ' + d.turn + ' | ' + d.fade + '</small><em>' + d.brand + (d.skip ? ' · skips on water' : '') + '</em>';
    b.addEventListener('click', function () { chooseDisc(d.id); setDrawer(false); }); discsEl.appendChild(b);
  });
  function setDrawer(on) { drawer.hidden = !on; discBtn.setAttribute('aria-expanded', String(on)); }
  discBtn.addEventListener('click', function () { setDrawer(drawer.hidden); });
  function chooseDisc(id) {
    disc = P.DISCS[id];
    Array.prototype.forEach.call(discsEl.children, function (b) { b.classList.toggle('on', b.getAttribute('data-disc') === id); });
    discDot.style.background = disc.col; discName.textContent = disc.brand + ' ' + disc.name; discNums.textContent = disc.kind + ' · ' + disc.speed + ' | ' + disc.glide + ' | ' + disc.turn + ' | ' + disc.fade + (disc.skip ? ' · skips' : '');
    sLa.value = disc.speed <= 3 ? 9 : disc.speed <= 6 ? 8 : 7; syncUi(); previewDirty = true;
  }
  function syncUi() {
    var bk = +sBank.value, la = +sLa.value, am = Math.round(G ? G.aimOff * 57.3 : 0);
    lblLa.textContent = la + '°'; lblAim.textContent = am === 0 ? 'Straight' : (am > 0 ? am + '° right' : (-am) + '° left');
    sAim.value = am; handBtn.querySelector('b').textContent = spin === 1 ? 'Backhand' : 'Forehand'; handBtn.setAttribute('aria-pressed', String(spin !== 1));
    if (G) { elHole.textContent = 'Hole ' + (G.hole + 1) + '/' + HOLE_N; elPar.textContent = 'Par ' + G.h.par; elStr.textContent = 'Throws ' + G.strokes; }
    lblCap.textContent = Math.round(CAP * 100) + '%'; capEl.value = Math.round(CAP * 100);
    if (vsEl) { var tot = 0, tp = 0; if (G) { G.scores.forEach(function (sc, i) { tot += sc; tp += HOLES[i].par; }); } var dv = tot - tp; vsEl.textContent = !G || !G.scores.length ? 'E' : (dv === 0 ? 'E' : dv > 0 ? '+' + dv : String(dv)); vsEl.className = 'dd-vs' + (dv < 0 && G && G.scores.length ? ' under' : dv > 0 ? ' over' : ''); }
    previewDirty = true; syncPutt();
  }
  [sBank, sLa].forEach(function (s) { s.addEventListener('input', syncUi); });
  [sLa, sAim, capEl].forEach(function (s) { s.addEventListener('input', function () { showPrevUntil = performance.now() + 2800; if (G) { G.plan = null; G.trail = []; } previewDirty = true; }); });
  capEl.addEventListener('input', function () { CAP = clamp((+capEl.value) / 100, 0.1, 1); syncUi(); });
  function setMenu(on) { menuPanel.hidden = !on; menuBtn.setAttribute('aria-expanded', String(on)); }
  menuBtn.addEventListener('click', function () { setMenu(menuPanel.hidden); setDrawer(false); });
  menuPanel.addEventListener('click', function (e) { if (e.target.closest('button')) setMenu(false); });
  sAim.addEventListener('input', function () { if (G && G.phase === 'aim') { G.aimOff = (+sAim.value) / 57.3; syncUi(); } });
  handBtn.addEventListener('click', function () { spin = -spin; syncUi(); });
  nextBtn.addEventListener('click', function () { if (G.done) { newRound(); } else { G.hole++; startHole(); } });

  // ---------- course picker and hole editor ----------
  var pickEl = $('dd-pick'), coursesEl = $('dd-courses'), cnoteEl = $('dd-cnote'), edEl = $('dd-editor'), edCv = $('dd-edcv'), edInfo = $('dd-edinfo'), ed = null;
  function fillCourses() {
    coursesEl.innerHTML = '';
    COURSES.forEach(function (c) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'dd-cbtn' + (c.id === COURSE.id ? ' on' : ''); b.innerHTML = '<b>' + c.name + '</b><small>' + c.holes.length + ' holes</small>';
      b.addEventListener('click', function () { setCourse(c.id); curBuilt = -1; pickEl.hidden = true; newRound(); });
      b.addEventListener('mouseenter', function () { cnoteEl.textContent = c.note; }); b.addEventListener('focus', function () { cnoteEl.textContent = c.note; });
      coursesEl.appendChild(b);
    });
    cnoteEl.textContent = COURSE.note;
  }
  $('dd-course').addEventListener('click', function () { if (charging) return; fillCourses(); pickEl.hidden = false; });
  $('dd-pick-x').addEventListener('click', function () { pickEl.hidden = true; });
  function edBounds() {
    var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9; ed.pts.forEach(function (p) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); });
    var sx = Math.max(60, (maxx - minx) * 0.7), sy = Math.max(60, (maxy - miny) * 0.5); ed.b = [minx - sx, maxx + sx, miny - sy, maxy + sy];
  }
  function edMap() { var W = edCv.clientWidth, H = edCv.clientHeight, b = ed.b, k = Math.min(W / (b[1] - b[0]), H / (b[3] - b[2])); ed.k = k; ed.ox = (W - (b[1] - b[0]) * k) / 2 - b[0] * k; ed.oy = H - (H - (b[3] - b[2]) * k) / 2 + b[2] * k; ed.W = W; ed.H = H; }
  function e2c(p) { return [ed.ox + p[0] * ed.k, ed.oy - p[1] * ed.k]; }
  function c2e(x, y) { return [(x - ed.ox) / ed.k, (ed.oy - y) / ed.k]; }
  function edDraw() {
    var d = Math.min(window.devicePixelRatio || 1, 2), W = edCv.clientWidth, H = edCv.clientHeight; if (edCv.width !== Math.round(W * d)) { edCv.width = Math.round(W * d); edCv.height = Math.round(H * d); }
    var c = edCv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); edMap(); c.fillStyle = '#27472b'; c.fillRect(0, 0, W, H);
    var h = ed.h, path = ed.pts.map(e2c);
    c.fillStyle = '#2f6fe0'; h.water.forEach(function (w) { var a = e2c([w[0], w[3]]), b = e2c([w[2], w[1]]); c.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); });
    c.strokeStyle = '#4f9a58'; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = Math.max(8, h.width * ed.k); c.beginPath(); path.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.setLineDash([6, 6]); c.lineWidth = 1.5; c.beginPath(); path.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#12351c'; (h.treeList || []).forEach(function (t) { if (t.x > ed.b[0] && t.x < ed.b[1] && t.y > ed.b[2] && t.y < ed.b[3]) { var m = e2c([t.x, t.y]); c.beginPath(); c.arc(m[0], m[1], Math.max(2, 2.2 * ed.k), 0, 6.3); c.fill(); } });
    var t = e2c(ed.tee), b2 = e2c(ed.basket);
    c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 3; c.beginPath(); c.arc(t[0], t[1], 13, 0, 6.3); c.fill(); c.stroke(); c.fillStyle = '#000'; c.font = '700 11px system-ui,sans-serif'; c.textAlign = 'center'; c.fillText('TEE', t[0], t[1] + 4);
    c.fillStyle = '#ff2a35'; c.beginPath(); c.arc(b2[0], b2[1], 13, 0, 6.3); c.fill(); c.stroke(); c.fillStyle = '#fff'; c.fillText('PIN', b2[0], b2[1] + 4);
    var len = 0; for (var i = 0; i < ed.pts.length - 1; i++) len += Math.hypot(ed.pts[i + 1][0] - ed.pts[i][0], ed.pts[i + 1][1] - ed.pts[i][1]);
    edInfo.textContent = 'Hole ' + (ed.i + 1) + ': ' + Math.round(len / 0.3048) + ' ft. Drag the white tee or the red pin.';
  }
  function edPts() { ed.pts = ed.h.path.map(function (p) { return p.slice(); }); ed.pts[0] = ed.tee; ed.pts[ed.pts.length - 1] = ed.basket; }
  $('dd-edit').addEventListener('click', function () {
    if (!G || charging || (G.phase !== 'aim')) return;
    var h = G.h; ed = { i: G.hole, h: h, tee: h.path[0].slice(), basket: h.path[h.path.length - 1].slice(), drag: null }; edPts(); edBounds(); edEl.hidden = false; edDraw();
  });
  edCv.addEventListener('pointerdown', function (e) {
    if (!ed) return; var r = edCv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, t = e2c(ed.tee), b = e2c(ed.basket), dt = Math.hypot(x - t[0], y - t[1]), db = Math.hypot(x - b[0], y - b[1]);
    ed.drag = (dt <= db ? (dt < 40 ? 'tee' : null) : (db < 40 ? 'basket' : null)); if (ed.drag) { try { edCv.setPointerCapture(e.pointerId); } catch (x2) {} e.preventDefault(); }
  });
  edCv.addEventListener('pointermove', function (e) { if (!ed || !ed.drag) return; var r = edCv.getBoundingClientRect(), p = c2e(e.clientX - r.left, e.clientY - r.top); ed[ed.drag] = p; edPts(); edDraw(); });
  function edEnd() { if (ed) ed.drag = null; } edCv.addEventListener('pointerup', edEnd); edCv.addEventListener('pointercancel', edEnd);
  window.addEventListener('resize', function () { if (ed && !edEl.hidden) edDraw(); });
  function edClose() { edEl.hidden = true; ed = null; }
  $('dd-eddone').addEventListener('click', function () { if (!ed) return; var i = ed.i, tee = ed.tee, bk = ed.basket; edClose(); if (Math.hypot(bk[0] - tee[0], bk[1] - tee[1]) < 8) { say('Tee and pin were too close together. Nothing changed.'); return; } saveEdit(i, tee, bk); HOLES[i].built = false; curBuilt = -1; startHole(); say('Saved. Your version of hole ' + (i + 1) + ' stays on this device.'); });
  $('dd-edreset').addEventListener('click', function () { if (!ed) return; var i = ed.i; edClose(); clearEdit(i); HOLES[i].built = false; curBuilt = -1; startHole(); say('Hole ' + (i + 1) + ' is back to the original.'); });

  $('dd-howto').addEventListener('click', function () { $('dd-howov').hidden = false; }); $('dd-how-x').addEventListener('click', function () { $('dd-howov').hidden = true; try { localStorage.setItem('ss-disc-how', '1'); } catch (e) {} });
  // drag the view to aim; pull the disc back and let go to throw
  var dragX = null, dragY = null, noseF = 7, pull = null;
  function puttGeo() { var W = hud._w || 600, H = hud._h || 400; return { x: W / 2, y: H * 0.6, hit: Math.max(64, H * 0.13) }; }
  function pullGeo() {   // where the disc handle rests, how far it can be pulled, and how close a touch has to be to grab it
    var W = hud._w || 600, H = hud._h || 400, R = clamp(H * 0.27, 84, 190);
    return { hx: W / 2, hy: clamp(H * 0.5, 110, Math.max(110, H - R - 74)), R: R, hit: Math.max(56, R * 0.5) };
  }
  glc.addEventListener('pointerdown', function (e) {
    setDrawer(false); setMenu(false); if (G && G.phase === 'tour') { endTour(); return; }
    if (G && (G.phase === 'aim' || G.phase === 'rest' || G.phase === 'holed') && pickLife(e)) return;
    if (G && G.phase === 'aim' && puttMode()) {
      var rr = glc.getBoundingClientRect(), pt = puttGeo();
      if (Math.hypot(e.clientX - rr.left - pt.x, e.clientY - rr.top - pt.y) <= pt.hit) { hidePutMsg(); G.plan = null; G.trail = []; previewDirty = true; sw = { pts: [{ x: e.clientX, y: e.clientY, t: performance.now() }] }; try { glc.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); return; }
      G.plan = null; G.trail = []; previewDirty = true; dragX = e.clientX; dragY = e.clientY; noseF = +sLa.value; try { glc.setPointerCapture(e.pointerId); } catch (x) {} return;
    }
    if (G && G.phase === 'aim') {
      var r = glc.getBoundingClientRect(), pg = pullGeo();
      if (Math.hypot(e.clientX - r.left - pg.hx, e.clientY - r.top - pg.hy) <= pg.hit) {
        pull = { id: e.pointerId, rx: 0, ry: 0, p: 0, raw: 0, bank: 0, bank0: 0, R: pg.R }; G.plan = null; G.trail = []; G.phase = 'charge'; stage.classList.add('dd-pulling'); previewDirty = true;
        try { glc.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); return;
      }
      G.plan = null; G.trail = []; previewDirty = true; dragX = e.clientX; dragY = e.clientY; noseF = +sLa.value; try { glc.setPointerCapture(e.pointerId); } catch (x) {}
    }
  });
  function updatePull(cx, cy) {
    var r = glc.getBoundingClientRect(), pg = pullGeo(), x = cx - r.left - pg.hx, y = cy - r.top - pg.hy, l = Math.hypot(x, y);
    if (l > pg.R) { x *= pg.R / l; y *= pg.R / l; }
    pull.rx = x; pull.ry = y; pull.R = pg.R; pull.raw = clamp(y / (pg.R * 0.92), 0, 1); pull.p = Math.min(pull.raw, CAP);
    var dead = pg.R * 0.07, bx = clamp((Math.abs(x) - dead) / (pg.R * 0.5 - dead), 0, 1);
    pull.bank0 = bx * 25 * (x < 0 ? -1 : 1);   // pull back to the right: hyzer (fades left). Pull back to the left: anhyzer (curves right).
    shakePull();
  }
  function shakePull() {   // a full-power pull shakes a little, like a real arm
    if (!pull) return; var sh = pull.raw > 0.85 ? Math.sin(performance.now() * 0.047) * ((pull.raw - 0.85) / 0.15) * 2.5 : 0;
    pull.bank = clamp(pull.bank0 + sh, -25, 25); sBank.value = pull.bank.toFixed(1); previewDirty = true;
  }
  glc.addEventListener('pointermove', function (e) {
    if (pull) { if (e.pointerId === pull.id) updatePull(e.clientX, e.clientY); return; }
    if (dragX === null || !G || G.phase !== 'aim') return; var dx = e.clientX - dragX, dy = e.clientY - dragY, k = 720 / glc.getBoundingClientRect().width; dragX = e.clientX; dragY = e.clientY;
    G.aimOff = clamp(G.aimOff + dx * 0.0035 * k, -0.8, 0.8);
    noseF = clamp(noseF - dy * 0.07 * k, 0, 25); sLa.value = noseF;   // drag up to lift the nose, down to flatten it
    syncUi();
  });
  function endPull(cancel) {
    if (!pull) return; var pl = pull; pull = null; stage.classList.remove('dd-pulling'); if (G && G.phase === 'charge') G.phase = 'aim';
    sBank.value = 0; previewDirty = true; if (cancel || !G || G.phase !== 'aim') return;
    if (pl.p < 0.07) { if (pl.raw > 0.015 || pl.p === 0 && Math.abs(pl.rx) > 6) say('Pull the disc back further, then let go.'); return; }
    var hadCap = CAP < 1; doThrow(pl.p, { hy: pl.bank / 57.3 }); CAP = 1; syncUi(); if (hadCap) flash('Power cap reset');
  }
  glc.addEventListener('pointerup', function (e) { dragX = dragY = null; if (pull && e.pointerId === pull.id) endPull(false); });
  glc.addEventListener('pointercancel', function (e) { dragX = dragY = null; if (pull && e.pointerId === pull.id) endPull(true); });

  // keyboard throw: hold space to charge, let go to throw (A and D tilt it)
  function startCharge() { if (!G || G.phase !== 'aim' || puttMode()) return; setDrawer(false); setMenu(false); charging = true; chargeT = performance.now(); G.phase = 'charge'; stage.classList.add('dd-pulling'); }
  function release() { if (!charging) return; charging = false; stage.classList.remove('dd-pulling'); var pw = chargeLevel(); G.phase = 'aim'; var hadCap = CAP < 1; doThrow(pw); CAP = 1; sBank.value = 0; syncUi(); if (hadCap) flash('Power cap reset'); }
  function chargeLevel() { return clamp((performance.now() - chargeT) / 1050, 0.04, CAP); }
  document.addEventListener('keydown', function (e) {
    if (root.hidden || document.querySelector('[data-view="craving"]').hidden || !G) return;
    var t = e.target; if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
    if (e.key === ' ' && !(t && /^button$/i.test(t.tagName))) { e.preventDefault(); if (!e.repeat) startCharge(); }
    else if (e.key === 'ArrowLeft' && G.phase === 'aim') { G.aimOff = clamp(G.aimOff - 0.02, -0.8, 0.8); syncUi(); }
    else if (e.key === 'ArrowRight' && G.phase === 'aim') { G.aimOff = clamp(G.aimOff + 0.02, -0.8, 0.8); syncUi(); }
    else if ((e.key === 'd' || e.key === 'D') && (G.phase === 'aim' || G.phase === 'charge')) { sBank.value = clamp(+sBank.value + 2, -25, 25); syncUi(); }
    else if ((e.key === 'a' || e.key === 'A') && (G.phase === 'aim' || G.phase === 'charge')) { sBank.value = clamp(+sBank.value - 2, -25, 25); syncUi(); }
    else if (e.key === 'ArrowUp' && G.phase === 'aim') { sLa.value = clamp(+sLa.value + 1, 0, 25); syncUi(); }
    else if (e.key === 'ArrowDown' && G.phase === 'aim') { sLa.value = clamp(+sLa.value - 1, 0, 25); syncUi(); }
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
  function doThrow(pw, o) {
    o = o || {}; var noise = gauss() * 0.045 * pw * pw * (0.45 + disc.speed / 14) * (o.pizza ? 1.25 : 1), hy = o.hy !== undefined ? o.hy : (+sBank.value) / 57.3, la = o.la !== undefined ? o.la : (+sLa.value) / 57.3;
    var ps = P.launch(G.lie[0], G.lie[1], disc, pw, aim(), hy, la, spin, 0); if (o.pizza) { ps.pizza = true; ps.bank = 0; ps.bank0 = 0; } G.plan = pathFrom(ps, !!o.putt); G.prevPts = null;
    G.strokes++; G.prev = [G.lie[0], G.lie[1]];
    var s = P.launch(G.lie[0], G.lie[1], disc, pw, aim(), hy, la, spin, noise); s.p[2] = gh(G.lie[0], G.lie[1]) + 1.2; if (o.pizza) { s.pizza = true; s.bank = 0; s.bank0 = 0; } s.putt = !!o.putt;
    bark(1); if (dog) { dog.still = 0; dog.pet = 0; dog.bounce = 0.5; } G.pcHd = undefined; G.flight = s; G.trail = [[s.p[0], s.p[1], s.p[2]]]; G.phase = 'fly'; G.hit = null; G.chainHit = false; G.flightDisc = disc; syncUi();
  }
  function wind() { return [G.wind[0] * 0.55, G.wind[1] * 0.55]; }

  // Does the disc get the chains? Soft, centred hits drop in. Fast hits and edge hits kick out. Low shots hit the tray and base.
  var BR = 0.105;
  function basketCheck(s) {
    var b = G.h.basket, p = s.p, dx = p[0] - b[0], dy = p[1] - b[1], dxy = Math.hypot(dx, dy), z = p[2] - G.h.bz;
    if (dxy > 1.4 || z > 1.9) { G.chainHit = false; return null; }
    var spd = Math.hypot(s.v[0], s.v[1], s.v[2]), vh = Math.hypot(s.v[0], s.v[1]) || 1, ox = dx / (dxy || 1), oy = dy / (dxy || 1);
    var rch = z > 1.02 ? mix(0.205, 0.34, clamp((1.4 - z) / 0.38, 0, 1)) : mix(0.34, 0.2, clamp((1.02 - z) / 0.28, 0, 1));                       // the chain curtain is a funnel, narrower at the top
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
        var dx = p[0] - t.x, dy = p[1] - t.y, d = Math.hypot(dx, dy), z = p[2] - t.g, th = t.h * t.s, rr = z < 2 ? 0.45 : (z < th ? (t.kind === 'oak' ? 0.5 + 1.6 * t.s * Math.sin(clamp((z - 2) / (th - 2), 0, 1) * 3.0 + 0.2) * 0.9 : 0.45 + 1.15 * t.s * (1 - (z - 2) / (th - 2))) : 0); if (rr < 0.45) rr = 0.45;
        if (z > 0.1 && z < th && d < rr) {
          var nx = dx / (d || 1), ny = dy / (d || 1), dot = s.v[0] * nx + s.v[1] * ny;
          s.v[0] = (s.v[0] - 1.6 * dot * nx) * 0.18; s.v[1] = (s.v[1] - 1.6 * dot * ny) * 0.18; s.v[2] = Math.min(s.v[2], 0) * 0.3 - 1;
          p[0] = t.x + nx * (rr + 0.05); p[1] = t.y + ny * (rr + 0.05); if (G.hit !== 'tree') G.holeHits++; G.hit = 'tree'; s.bank *= 0.2; G.shake = 0.25;
        }
      }
      for (var oi = 0; oi < h.obst.length; oi++) {
        var o = h.obst[oi]; if (Math.abs(o.x - p[0]) > 2.5 || Math.abs(o.y - p[1]) > 2.5) continue;
        var ox2 = p[0] - o.x, oy2 = p[1] - o.y, od = Math.hypot(ox2, oy2), top = o.kind === 'bush' ? 1.35 : o.r * 0.95;
        if (p[2] - o.g < top && od < o.r + 0.12) {
          var onx = ox2 / (od || 1), ony = oy2 / (od || 1), odot = s.v[0] * onx + s.v[1] * ony, kk = o.kind === 'bush' ? 0.16 : 0.34;
          s.v[0] = (s.v[0] - 1.7 * odot * onx) * kk; s.v[1] = (s.v[1] - 1.7 * odot * ony) * kk; s.v[2] = Math.abs(s.v[2]) * 0.2 + (o.kind === 'rock' ? 1.2 : 0);
          p[0] = o.x + onx * (o.r + 0.14); p[1] = o.y + ony * (o.r + 0.14); if (G.hit !== o.kind) G.holeHits++; G.hit = o.kind; s.bank *= 0.3; G.shake = 0.2; if (G.flash !== o.kind) { G.flash = o.kind; }
        }
      }
      var bc = basketCheck(s);
      if (bc) {
        if (bc.kind === 'in') { holeOut(bc.spd); return; }
        G.hit = bc.kind; G.shake = 0.18;
        flash(bc.kind === 'rattle' ? 'Rattled out!' : bc.kind === 'top' ? 'Off the top!' : 'Off the tray!');
      }
      var gz = gh(p[0], p[1]), wl = waterLevelAt(h, p[0], p[1]); if (wl !== null && wl > gz) gz = wl;
      if (p[2] <= gz && (s.v[2] < 0 || p[2] < gz - 0.05)) {
        if (wl !== null && s.disc.skip && (s.skips || 0) < 5) {   // flat, blunt discs can skip off the water
          var vhh = Math.hypot(s.v[0], s.v[1]), ang = Math.atan2(-s.v[2], vhh || 1);
          if (vhh > 8 && ang < 0.4) {
            s.skips = (s.skips || 0) + 1; var kf = 0.82 - s.skips * 0.04; s.v[0] *= kf; s.v[1] *= kf; s.v[2] = Math.abs(s.v[2]) * 0.5 + 1.3; p[2] = gz + 0.04; addRipple(p[0], p[1], wl); plip(); G.shake = 0.08;
            flash(s.skips === 1 ? 'Skip!' : 'Skip x' + s.skips + '!'); if (s.skips === 1) award('skip'); if (s.skips >= 3) award('skip3'); continue;
          }
        }
        p[2] = gz; land(); return;
      }
      if (s.t > 14) { land(); return; }
    }
  }

  function land() {
    var s = G.flight, h = G.h, p = s.p, tType = terrain(h, p[0], p[1]);
    G.trail.push([p[0], p[1], gh(p[0], p[1])]);
    if (tType === 'water') { G.splash = { x: p[0], y: p[1], t: 0 }; addRipple(p[0], p[1], waterLevelAt(h, p[0], p[1]) || 0); setTimeout(function () { addRipple(p[0], p[1], waterLevelAt(h, p[0], p[1]) || 0); }, 220); return rest([p[0], p[1]], 'water'); }
    var ro = slopeRoll(P.rollOut(s, tType === 'rough' ? 1.9 : 1), p), steps = Math.max(1, Math.ceil(Math.hypot(ro[0], ro[1]))), fx = p[0], fy = p[1], stopped = false;
    for (var i = 1; i <= steps && !stopped; i++) {
      var tx = p[0] + ro[0] * i / steps, ty = p[1] + ro[1] * i / steps;
      if (inWater(h, tx, ty)) { fx = tx; fy = ty; stopped = true; break; }
      for (var jo = 0; jo < h.obst.length; jo++) { var oo = h.obst[jo]; if (Math.hypot(tx - oo.x, ty - oo.y) < oo.r + 0.15) { stopped = true; break; } }
      if (stopped) break;
      for (var j = 0; j < h.treeList.length; j++) { var t = h.treeList[j]; if (Math.hypot(tx - t.x, ty - t.y) < 0.6) { stopped = true; break; } }
      if (!stopped) { fx = tx; fy = ty; }
    }
    G.roll = { putt: !!s.putt, x0: p[0], y0: p[1], x1: fx, y1: fy, t: 0, dur: clamp(Math.hypot(fx - p[0], fy - p[1]) / 6, 0.25, 1.3), bank: s.bank, rot: s.rot }; G.phase = 'roll';
  }
  function rest(pos, why) {
    var h = G.h; G.phase = 'rest'; G.rest = performance.now(); G.restDisc = G.flight ? G.flight.disc : disc; G.flight = null;
    var t = why || terrain(h, pos[0], pos[1]);
    if (t === 'water' || t === 'ob') {
      G.strokes++; G.roundPen++; G.lie = [G.prev[0], G.prev[1]];
      say(t === 'water' ? 'Splash! Don’t fall in the drink. +1 stroke, throw again from the same spot.' : 'Out of bounds. +1 stroke, throw again from the same spot.');
      G.throws.push([G.lie[0], G.lie[1]]);
    } else {
      var dthrow = Math.hypot(pos[0] - G.prev[0], pos[1] - G.prev[1]); if (dthrow >= 120) award('bomb'); G.lie = [pos[0], pos[1]]; G.throws.push([pos[0], pos[1]]);
      var db = distToBasket();
      if (G.hit === 'tree') say('Tree! ' + Math.round(dthrow) + ' m. ' + Math.round(db) + ' m to the basket.');
      else say(Math.round(dthrow) + ' m. ' + (db < 1.2 ? 'Right at the basket.' : Math.round(db) + ' m to the basket.') + (t === 'rough' ? ' In the rough.' : ''));
      if (db < 0.35) { G.strokes++; say('Kicked to the base: tap-in.'); holeOutScore(true); return; }
    }
    if (G.strokes >= G.h.par + 5) { say('Pick it up. Max strokes this hole.'); holeOutScore(false); return; }
    aimBase(); G.aimOff = 0; pickDiscFor(); syncUi();
  }
  function holeOut(spd) {
    var s = G.flight, b = G.h.basket; G.drop = { t: 0, x0: s.p[0], y0: s.p[1], z0: s.p[2], x1: b[0], y1: b[1], z1: G.h.bz + 0.8, bank: s.bank }; G.wob = Math.max(G.wob, clamp(spd / 14, 0.4, 1.2)); G.shake = 0.2; G.flight.v = [0, 0, 0];
    if (s.pizza) award('pizza'); if (s.putt && G.prev && Math.hypot(b[0] - G.prev[0], b[1] - G.prev[1]) >= 10) award('clutch');
    chainSound(); flash('Chains!'); holeOutScore(false, true);
  }
  function holeOutScore(tapIn, chains) {
    G.phase = 'holed'; var st = G.strokes, par = G.h.par, diff = st - par; G.scores.push(st);
    var name = st === 1 ? 'ACE!' : diff <= -2 ? 'Eagle!' : diff === -1 ? 'Birdie!' : diff === 0 ? 'Par. Straight and sober.' : diff === 1 ? 'Bogey. A small stumble.' : 'Rough one. Keep your head up.';
    awardHole(st, par, chains);
    var last = G.hole === HOLE_N - 1; G.done = last;
    overT.textContent = (chains ? 'CHAINS! ' : '') + name;
    overS.textContent = 'Hole ' + (G.hole + 1) + ' in ' + st + ' (par ' + par + ').';
    if (last) {
      var tot = G.scores.reduce(function (a, b) { return a + b; }, 0), totPar = HOLES.reduce(function (a, h) { return a + h.par; }, 0), vs = tot - totPar;
      var medal = awardRound(tot, totPar);
      overT.textContent = medal ? (achOf(medal).ic + ' ' + achOf(medal).n + '!') : 'Round complete';
      overS.textContent = 'Final: ' + tot + ' (' + (vs === 0 ? 'even' : vs > 0 ? '+' + vs : vs) + '). ' + (best && best <= tot ? 'Best round: ' + best + '.' : 'New best round!') + ' Every throw sober.' + (medal ? '' : ' Get to even par for a medal.');
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
    if (G.phase === 'tour' && G.tour) return tourCam();
    if (G.phase === 'fly' && G.flight && G.flight.putt) return puttCam(G.flight);
    if (G.phase === 'fly' && G.flight) {
      var s = G.flight, hd = Math.atan2(s.v[0], s.v[1]), back = 9, fcx = s.p[0] - Math.sin(hd) * back, fcy = s.p[1] - Math.cos(hd) * back, cz = Math.max(gh(fcx, fcy) + 2.4, s.p[2] + 1.8);
      return { x: fcx, y: fcy, z: cz, yaw: hd, pitch: clamp(Math.atan((cz - s.p[2]) / back) + 0.02, 0.02, 0.5) };
    }
    if (G.phase === 'roll' && G.roll && G.roll.putt) { var rr0 = G.roll, kr = clamp(rr0.t / rr0.dur, 0, 1); return puttCam({ p: [mix(rr0.x0, rr0.x1, kr), mix(rr0.y0, rr0.y1, kr), gh(mix(rr0.x0, rr0.x1, kr), mix(rr0.y0, rr0.y1, kr)) + 0.1], putt: true }); }
    if (G.phase === 'roll' && G.roll) { var r = G.roll, ha = Math.atan2(r.x1 - r.x0, r.y1 - r.y0); return { x: r.x0 - Math.sin(aim()) * 8, y: r.y0 - Math.cos(aim()) * 8, z: gh(r.x0, r.y0) + 3.2, yaw: cam.yaw, pitch: 0.16 }; }
    if (G.phase === 'holed') return holedCamPose();
    var a = aim(), acx = G.lie[0] - Math.sin(a) * 5.0, acy = G.lie[1] - Math.cos(a) * 5.0; return { x: acx, y: acy, z: Math.max(gh(G.lie[0], G.lie[1]), gh(acx, acy)) + 1.9, yaw: a, pitch: clamp(0.12 - ((+sLa.value) - 7) * 0.014, -0.16, 0.2) };
  }
  // Putt camera: a steady chase cam that always looks toward the basket (never along the disc's own, jittery heading),
  // sits low and close behind the disc, and eases into the basket close-up as the disc arrives.
  function holedCamPose() {
    var b = G.h.basket, ya = G.base, cx = b[0] - Math.sin(ya) * 3.4 + Math.cos(ya) * 1.2, cy = b[1] - Math.cos(ya) * 3.4 - Math.sin(ya) * 1.2;
    return { x: cx, y: cy, z: G.h.bz + 1.7, yaw: Math.atan2(b[0] - cx, b[1] - cy), pitch: 0.17 };
  }
  function puttCam(s) {
    var b = G.h.basket, p = s.p, dx = b[0] - p[0], dy = b[1] - p[1], dist = Math.hypot(dx, dy);
    if (dist > 1.2) G.pcHd = Math.atan2(dx, dy); else if (G.pcHd === undefined) G.pcHd = aim();
    var hd = G.pcHd, back = clamp(2.2 + dist * 0.35, 2.6, 4.6), cx = p[0] - Math.sin(hd) * back, cy = p[1] - Math.cos(hd) * back, cz = Math.max(gh(cx, cy) + 1.0, p[2] + 0.95);
    var f = clamp(0.45 + 0.1 * Math.min(dist, 6) / 6, 0.4, 0.6), lx = p[0] + dx * f, ly = p[1] + dy * f, lz = mix(p[2], G.h.bz + 0.9, f), hz = Math.hypot(lx - cx, ly - cy) || 1;
    var t = { x: cx, y: cy, z: cz, yaw: Math.atan2(lx - cx, ly - cy), pitch: clamp(Math.atan((cz - lz) / hz), -0.1, 0.45) };
    var w = clamp((4.2 - dist) / 3.2, 0, 1); w = w * w * (3 - 2 * w);   // blend into the basket close-up
    if (w > 0) { var h2 = holedCamPose(); t.x = mix(t.x, h2.x, w); t.y = mix(t.y, h2.y, w); t.z = mix(t.z, h2.z, w); t.yaw = t.yaw + angDiff(h2.yaw, t.yaw) * w; t.pitch = mix(t.pitch, h2.pitch, w); }
    return t;
  }
  function snapCam() { var t = targetCam(); cam = { x: t.x, y: t.y, z: t.z, yaw: t.yaw, pitch: t.pitch }; }
  function moveCam(dt) {
    var pt = (G.phase === 'fly' && G.flight && G.flight.putt) || (G.phase === 'roll' && G.roll && G.roll.putt), t = targetCam(), k = 1 - Math.exp(-dt * (pt ? 11 : G.phase === 'fly' ? 7 : G.phase === 'tour' ? 9 : G.phase === 'holed' && G.drop ? 5 : G.glide > 0 ? 2.2 : 3.2)); if (G.glide > 0) G.glide -= dt;
    cam.x += (t.x - cam.x) * k; cam.y += (t.y - cam.y) * k; cam.z += (t.z - cam.z) * k; cam.yaw += angDiff(t.yaw, cam.yaw) * k; cam.pitch += (t.pitch - cam.pitch) * k;
  }

  /* ---------- putting: swipe toward the basket; straddle putt or Pizza (turbo) putt ---------- */
  var PUTT_R = 22, PSTYLE = 'putt', GUIDE = true, sw = null, ripples = [], _ideal = {};
  try { GUIDE = localStorage.getItem('ss-disc-pguide') !== '0'; } catch (e) {}
  var pstyleBtn = $('dd-pstyle'), puttMsg = $('dd-putmsg'), pguideBtn = $('dd-pguide'), pguideSub = $('dd-pguide-s');
  var puttMsgT = $('dd-putmsg-t') || puttMsg, puttMsgX = $('dd-putmsg-x'), PM_SEEN = {}, pmTimer = 0;
  function hidePutMsg() { clearTimeout(pmTimer); if (puttMsg) puttMsg.hidden = true; }
  if (puttMsgX) puttMsgX.addEventListener('click', function (e) { e.stopPropagation(); hidePutMsg(); });
  function inPuttRange() { return !!G && G.phase !== 'tour' && distToBasket() <= PUTT_R; }
  function puttMode() { return !!G && G.phase === 'aim' && PSTYLE !== 'off' && distToBasket() <= PUTT_R; }
  function idealPw(d, pizza) {   // the power that arrives at basket height at this distance, so the guide can mark it
    var dz = G.h.bz - gh(G.lie[0], G.lie[1]), key = disc.id + (pizza ? 'p' : 's') + Math.round(d * 2) + ':' + Math.round(dz * 3); if (_ideal[key] !== undefined) return _ideal[key];
    var la = pizza ? 0.2 : 0.07, lo = 0.04, hi = 1, tz = 0.9 + dz;
    function zAt(pw) { var st = P.launch(0, 0, disc, pw, 0, 0, la, 1, 0); if (pizza) { st.pizza = true; st.bank = 0; } while (st.p[2] > -2 && st.t < 8) { P.step(st, 1 / 120, [0, 0]); if (Math.hypot(st.p[0], st.p[1]) >= d) return st.p[2]; } return -9; }
    for (var i = 0; i < 16; i++) { var m = (lo + hi) / 2; if (zAt(m) < tz) lo = m; else hi = m; }
    return (_ideal[key] = (lo + hi) / 2);
  }
  function swipeInfo(pts) {
    var a = pts[0], b = pts[pts.length - 1], H = glc.getBoundingClientRect().height, len = Math.hypot(b.x - a.x, b.y - a.y), i = pts.length - 1;
    while (i > 0 && b.t - pts[i].t < 110) i--; var c = pts[i], dt = Math.max(16, b.t - c.t), spd = Math.hypot(b.x - c.x, b.y - c.y) / dt, up = a.y - b.y;
    return { p: clamp(0.5 * clamp(len / (H * 0.5), 0, 1) + 0.5 * clamp(spd / 2.2, 0, 1), 0, 1), up: up, len: len, ang: Math.atan2(b.x - a.x, Math.max(1, up)) };
  }
  glc.addEventListener('pointermove', function (e) { if (sw) { sw.pts.push({ x: e.clientX, y: e.clientY, t: performance.now() }); if (sw.pts.length > 80) sw.pts.shift(); } });
  function splitSwipe(pts) {   // the backswing ends at the lowest point of the stroke; the push forward starts there
    var bi = 0; for (var i = 1; i < pts.length; i++) if (pts[i].y >= pts[bi].y) bi = i;
    return { bi: bi, back: pts[bi].y - pts[0].y, fwd: pts.slice(bi) };
  }
  function endSwipe(cancel) {
    if (!sw) return; var pts = sw.pts; sw = null; if (cancel || !G || G.phase !== 'aim' || pts.length < 2) return;
    var sp = splitSwipe(pts); if (sp.back < 24) { say('Pull back first, then push forward toward the basket.'); return; }
    if (sp.fwd.length < 2) { say('Now push forward toward the basket.'); return; }
    var si = swipeInfo(sp.fwd); if (si.up < 28 || si.len < 34) { say('Push forward toward the basket. A longer, quicker push putts harder.'); return; }
    var pz = PSTYLE === 'pizza'; G.aimOff = clamp(si.ang * 0.6, -0.35, 0.35); doThrow(clamp(si.p, 0.05, 1), { la: pz ? 0.2 : 0.07, hy: 0, pizza: pz, putt: true }); CAP = 1; syncUi();
  }
  glc.addEventListener('pointerup', function () { endSwipe(false); }); glc.addEventListener('pointercancel', function () { endSwipe(true); });
  var TAP_R = 3, tapBtn = $('dd-tapin');
  function tapInOk() { return !!G && G.phase === 'aim' && !G.done && distToBasket() <= TAP_R; }
  if (tapBtn) tapBtn.addEventListener('click', function (e) {
    e.stopPropagation(); if (!tapInOk()) return;
    var b = G.h.basket, lx = G.lie[0], ly = G.lie[1]; G.strokes++;
    G.drop = { t: 0, x0: lx, y0: ly, z0: gh(lx, ly) + 0.15, x1: b[0], y1: b[1], z1: G.h.bz + 0.8, bank: 0 }; G.flightDisc = disc;
    say('Tap-in. Good and sober.'); holeOutScore(true);
  });
  function syncPutt() {
    if (tapBtn) tapBtn.hidden = !tapInOk();
    var r = !!G && distToBasket() <= PUTT_R, on = r && PSTYLE !== 'off' && G.phase !== 'tour';
    stage.classList.toggle('dd-putting', on); stage.classList.toggle('dd-pizza', on && PSTYLE === 'pizza');
    if (pstyleBtn) { pstyleBtn.hidden = !r; pstyleBtn.querySelector('b').textContent = PSTYLE === 'putt' ? 'Putt: Straddle' : PSTYLE === 'pizza' ? 'Putt: Pizza' : 'Regular throw'; }
    if (puttMsg) {   // the tip shows once per putt style, for 3 seconds, and has an X; it never comes back to get in the way
      if (!on) hidePutMsg();
      else if (!PM_SEEN[PSTYLE]) {
        PM_SEEN[PSTYLE] = 1; clearTimeout(pmTimer); puttMsgT.textContent = PSTYLE === 'pizza' ? 'Pizza putt: put your finger on the disc, pull back, then push forward to fling it overhead. It spins on its edge and cuts through wind.' : 'Putt: put your finger on the disc in the middle, pull back, then push forward toward the basket. A longer, quicker push putts harder.';
        puttMsg.hidden = false; pmTimer = setTimeout(hidePutMsg, 3000);
      }
    }
  }
  if (pstyleBtn) pstyleBtn.addEventListener('click', function () { PSTYLE = PSTYLE === 'putt' ? 'pizza' : PSTYLE === 'pizza' ? 'off' : 'putt'; syncUi(); say(PSTYLE === 'pizza' ? 'Pizza putt: thrown overhead, spinning on its edge. Cuts the wind.' : PSTYLE === 'putt' ? 'Straddle putt: a flat, smooth putt.' : 'Regular throw from here.'); });
  var todBtn = $('dd-tod'), todSub = $('dd-tod-s');
  function syncTod() { if (todSub) todSub.textContent = WINTER ? 'Winter course: snowy daylight' : LOOKS[TOD].name; }
  if (todBtn) todBtn.addEventListener('click', function () {
    if (WINTER) { syncTod(); return; }
    TOD = ORDER[(ORDER.indexOf(TOD) + 1) % ORDER.length];
    try { localStorage.setItem('ss-disc-tod', TOD); } catch (e) {}
    themeNow = null; applyTheme(WINTER); syncTod();
  });
  function syncGuide() { if (pguideSub) pguideSub.textContent = GUIDE ? 'Shows the ideal putt line: on' : 'Shows the ideal putt line: off'; }
  if (pguideBtn) pguideBtn.addEventListener('click', function () { GUIDE = !GUIDE; try { localStorage.setItem('ss-disc-pguide', GUIDE ? '1' : '0'); } catch (e) {} syncGuide(); previewDirty = true; });
  syncGuide();
  function drawSwipe() {
    if (!sw || !sw.pts.length) return; var r = glc.getBoundingClientRect(), pts = sw.pts, sp = splitSwipe(pts), going = sp.back >= 24 && sp.fwd.length > 1 && sp.fwd[0].y - pts[pts.length - 1].y > 6, si = going ? swipeInfo(sp.fwd) : { p: 0 }, W = hud._w, Hh = hud._h;
    hctx.save(); hctx.lineCap = 'round'; hctx.lineJoin = 'round';
    function trace(a, b) { hctx.beginPath(); for (var i = a; i <= b; i++) { var q = pts[i], x = q.x - r.left, y = q.y - r.top; if (i > a) hctx.lineTo(x, y); else hctx.moveTo(x, y); } hctx.stroke(); }
    hctx.strokeStyle = 'rgba(180,196,214,.6)'; hctx.lineWidth = 5; trace(0, sp.bi);   // the backswing
    if (sp.bi < pts.length - 1) { hctx.strokeStyle = 'rgba(255,255,255,.9)'; hctx.lineWidth = 8; trace(sp.bi, pts.length - 1); hctx.strokeStyle = si.p > 0.85 ? '#ff6a4a' : si.p > 0.5 ? '#ffd23a' : '#3be072'; hctx.lineWidth = 4; trace(sp.bi, pts.length - 1); }
    hctx.fillStyle = '#fff'; hctx.font = '700 12px system-ui, sans-serif'; hctx.textAlign = 'center'; hctx.fillText(sp.back < 24 ? 'Pull back…' : going ? 'Push!' : 'Now push forward', pts[pts.length - 1].x - r.left, pts[pts.length - 1].y - r.top + (going ? 28 : -18));
    var gx = 26, gy0 = Hh * 0.3, gy1 = Hh * 0.72, gh2 = gy1 - gy0; hctx.fillStyle = 'rgba(8,14,24,.75)'; hctx.fillRect(gx - 9, gy0 - 6, 18, gh2 + 12);
    hctx.fillStyle = si.p > 0.85 ? '#ff6a4a' : si.p > 0.5 ? '#ffd23a' : '#3be072'; hctx.fillRect(gx - 6, gy1 - gh2 * si.p, 12, gh2 * si.p);
    if (GUIDE && G) { var ip = idealPw(distToBasket(), PSTYLE === 'pizza'), ty = gy1 - gh2 * ip; hctx.fillStyle = '#fff'; hctx.fillRect(gx - 14, ty - 1.5, 28, 3); hctx.font = '700 10px system-ui, sans-serif'; hctx.textAlign = 'left'; hctx.fillText('ideal', gx + 16, ty + 3); }
    hctx.fillStyle = '#fff'; hctx.font = '800 13px system-ui, sans-serif'; hctx.textAlign = 'center'; hctx.fillText(Math.round(si.p * 100) + '%', gx, gy0 - 12); hctx.restore();
  }
  var _pv = null;
  function drawPath() {   // the planned line (red) stays up through the flight; the flight itself is drawn over it in white
    if (!G || !T || G.phase === 'tour') return;
    var aiming = G.phase === 'aim' || G.phase === 'charge', plan = (aiming && (pull || charging || !G.plan)) ? G.prevPts : G.plan; if (!plan && !(G.trail && G.trail.length > 1)) return;
    var W = hud._w, H = hud._h, c = hctx; _pv = _pv || new T.Vector3(); camera.updateMatrixWorld();
    function stroke(pts, col, lw, alpha, dash) {
      var open = false; c.beginPath();
      for (var i = 0; i < pts.length; i++) { _pv.set(pts[i][0], pts[i][2], -pts[i][1]).project(camera); if (_pv.z > 1 || _pv.z < -1) { open = false; continue; } var x = (_pv.x + 1) / 2 * W, y = (1 - _pv.y) / 2 * H; if (open) c.lineTo(x, y); else { c.moveTo(x, y); open = true; } }
      c.globalAlpha = alpha; c.strokeStyle = col; c.lineWidth = lw; c.setLineDash(dash || []); c.stroke();
    }
    function dot(pt, col, r) { _pv.set(pt[0], pt[2], -pt[1]).project(camera); if (_pv.z > 1) return; var x = (_pv.x + 1) / 2 * W, y = (1 - _pv.y) / 2 * H; c.globalAlpha = 1; c.fillStyle = col; c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fill(); c.stroke(); }
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    if (plan && plan.length > 1) { stroke(plan, 'rgba(0,0,0,.55)', 3.4, 1); stroke(plan, '#ff3b30', 1.7, 1); dot(plan[plan.length - 1], '#ff3b30', 3.6); }
    var tr = G.trail;
    if (tr && tr.length > 1 && G.phase !== 'charge') { var tp = tr.map(function (q) { return [q[0], q[1], q[2]]; }); stroke(tp, 'rgba(0,0,0,.5)', 3.4, 1); stroke(tp, '#ffffff', 1.7, 1); if (G.phase === 'rest' || G.phase === 'holed') dot(tp[tp.length - 1], '#ffffff', 3.4); }
    c.restore();
  }
  function drawPuttDisc() {   // the putter waits in the middle of the screen: touch it, pull it back, push it forward
    var pt = puttGeo(), c = hctx, now = performance.now(), x = pt.x, y = pt.y, hold = false, pizza = PSTYLE === 'pizza';
    if (sw && sw.pts.length) { var r = glc.getBoundingClientRect(), q = sw.pts[sw.pts.length - 1]; x = clamp(q.x - r.left, 30, hud._w - 30); y = clamp(q.y - r.top, 30, hud._h - 20); hold = true; }
    var dw = clamp(hud._h * 0.085, 26, 44), bob = hold ? 0 : Math.sin(now / 520) * 3; y += bob;
    c.save(); c.lineCap = 'round';
    if (!hold) { c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 2; c.setLineDash([3, 6]); c.beginPath(); c.ellipse(pt.x, pt.y, pt.hit, pt.hit * 0.55, 0, 0, 6.3); c.stroke(); c.setLineDash([]); }
    c.translate(x, y); c.globalAlpha = hold ? 0.97 : 0.88; c.shadowColor = hold ? 'rgba(0,0,0,.5)' : 'rgba(255,255,255,.75)'; c.shadowBlur = hold ? 8 : 14 + Math.sin(now / 380) * 6;
    c.fillStyle = disc.col; c.strokeStyle = '#05080c'; c.lineWidth = 2; c.beginPath(); if (pizza) c.ellipse(0, 0, dw * 0.5, dw * 0.9, 0, 0, 6.3); else c.ellipse(0, 0, dw, dw * 0.42, 0, 0, 6.3); c.fill(); c.stroke(); c.shadowBlur = 0;
    c.fillStyle = 'rgba(255,255,255,.28)'; c.beginPath(); c.ellipse(0, -dw * 0.06, dw * 0.66, dw * 0.24, 0, 0, 6.3); c.fill();
    c.restore();
    if (!hold) { c.save(); c.font = '800 13px system-ui, sans-serif'; c.textAlign = 'center'; c.shadowColor = 'rgba(0,0,0,.9)'; c.shadowBlur = 5; c.fillStyle = '#fff'; c.fillText('Touch the disc · pull back · push forward', pt.x, pt.y + dw * 0.42 + 30 + bob); c.restore(); }
  }
  function drawPull() {   // the slingshot: a disc you pull back, a power line, and the tilt it will fly with
    if (G && G.phase === 'aim' && puttMode()) { drawPuttDisc(); return; }
    if (!G || (G.phase !== 'aim' && G.phase !== 'charge') || puttMode()) return;
    var pg = pullGeo(), c = hctx, now = performance.now(), rx = 0, ry = 0, p = 0, bank = 0, act = false;
    if (pull) { act = true; rx = pull.rx; ry = pull.ry; p = pull.p; bank = pull.bank; }
    else if (charging) { act = true; p = chargeLevel(); ry = p * pg.R * 0.92; bank = +sBank.value; rx = bank / 25 * pg.R * 0.5; }
    var idle = !act, bob = idle ? Math.sin(now / 520) * 3 : 0, x = pg.hx + rx, y = pg.hy + ry + bob, col = p > 0.85 ? '#ff6a4a' : p > 0.5 ? '#ffd23a' : '#3be072';
    c.save(); c.lineCap = 'round';
    // guide: the line the disc is pulled down along, with ticks and the max-power limit
    var gy1 = pg.hy + pg.R * 0.92; c.strokeStyle = 'rgba(255,255,255,' + (idle ? 0.16 : 0.34) + ')'; c.lineWidth = 1.5; c.setLineDash([2, 6]); c.beginPath(); c.moveTo(pg.hx, pg.hy); c.lineTo(pg.hx, gy1); c.stroke(); c.setLineDash([]);
    if (CAP < 1) { var cy = pg.hy + pg.R * 0.92 * CAP; c.strokeStyle = '#ffd36b'; c.lineWidth = 2; c.beginPath(); c.moveTo(pg.hx - 26, cy); c.lineTo(pg.hx + 26, cy); c.stroke(); }
    // rubber bands from two posts to the disc
    var ax = Math.min(pg.R * 0.7, 74), ay = pg.hy - 16;
    if (act) {
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 2; c.beginPath(); c.moveTo(pg.hx - ax, ay); c.lineTo(x, y); c.lineTo(pg.hx + ax, ay); c.stroke();
      c.strokeStyle = col; c.lineWidth = 1; c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,.6)'; [-1, 1].forEach(function (sd) { c.beginPath(); c.arc(pg.hx + sd * ax, ay, 3.2, 0, 6.3); c.fill(); });
    // the disc, tilted to show the hyzer / anhyzer it will fly with
    var tilt = bank / 25 * 0.5, dw = clamp(pg.R * 0.3, 24, 38);
    c.save(); c.translate(x, y); c.rotate(tilt); c.globalAlpha = idle ? 0.78 : 0.96;
    c.shadowColor = idle ? 'rgba(255,255,255,.7)' : 'rgba(0,0,0,.5)'; c.shadowBlur = idle ? 14 + Math.sin(now / 380) * 6 : 8;
    c.fillStyle = disc.col; c.strokeStyle = '#05080c'; c.lineWidth = 2; c.beginPath(); c.ellipse(0, 0, dw, dw * 0.42, 0, 0, 6.3); c.fill(); c.stroke(); c.shadowBlur = 0;
    c.fillStyle = 'rgba(255,255,255,.28)'; c.beginPath(); c.ellipse(0, -dw * 0.06, dw * 0.66, dw * 0.24, 0, 0, 6.3); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1; c.beginPath(); c.ellipse(0, -dw * 0.06, dw * 0.66, dw * 0.24, 0, 0, 6.3); c.stroke(); c.restore();
    c.font = '800 12px system-ui, sans-serif'; c.textAlign = 'center';
    if (idle) {
      c.shadowColor = 'rgba(0,0,0,.85)'; c.shadowBlur = 5;       c.fillStyle = 'rgba(255,255,255,.85)'; c.fillText('▼', pg.hx, pg.hy + dw * 0.42 + 22 + bob); if (!G.strokes) { c.font = '700 12px system-ui, sans-serif'; c.fillText('Pull back, let go to throw', pg.hx, pg.hy - dw * 0.42 - 12); }
    } else {
      var tb = Math.round(bank), tl = Math.abs(tb) < 1 ? 'Flat' : tb > 0 ? 'Hyzer ' + tb + '°' : 'Anhyzer ' + (-tb) + '°', txt = Math.round(p * 100) + '%  ·  ' + tl, tw = c.measureText(txt).width + 18, ty = Math.max(16, Math.min(y, pg.hy) - dw * 0.42 - 30);
      c.fillStyle = 'rgba(8,14,24,.8)'; c.strokeStyle = col; c.lineWidth = 1.5; c.beginPath(); if (c.roundRect) c.roundRect(x - tw / 2, ty - 14, tw, 22, 11); else c.rect(x - tw / 2, ty - 14, tw, 22); c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.fillText(txt, x, ty + 1);
      if (pull && pull.raw > 0.93) { c.fillStyle = '#ff6a4a'; c.font = '700 10px system-ui, sans-serif'; c.fillText('FULL SEND', x, y + dw * 0.42 + 16); }
    }
    c.restore();
  }
  function waterLevelAt(h, x, y) {
    if (h.island && Math.hypot(x - h.basket[0], y - h.basket[1]) < 6.5) return null;
    for (var i = 0; i < h.water.length; i++) if (wq(h.water[i], x, y) < 1) return h.water[i].lvl || 0; return null;
  }
  function ensureRipples() {
    if (ripples.length || !T) return;
    for (var i = 0; i < 7; i++) { var m = new T.Mesh(new T.RingGeometry(0.35, 0.46, 40), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false, fog: false })); m.rotation.x = -Math.PI / 2; m.visible = false; m.userData = { life: 0 }; scene.add(m); ripples.push(m); }
  }
  function addRipple(x, y, lvl) { ensureRipples(); for (var i = 0; i < ripples.length; i++) { var m = ripples[i]; if (m.userData.life <= 0) { m.userData.life = 1.1; m.position.set(x, lvl + 0.06, -y); m.scale.setScalar(1); m.visible = true; return; } } }
  function updateRipples(dt) { ripples.forEach(function (m) { var d = m.userData; if (d.life <= 0) { m.visible = false; return; } d.life -= dt; var k = clamp(d.life / 1.1, 0, 1); m.scale.setScalar(1 + (1 - k) * 5); m.material.opacity = k * 0.75; if (d.life <= 0) m.visible = false; }); }
  function plip() {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume();
      var len = Math.floor(actx.sampleRate * 0.14), buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0); for (var i = 0; i < len; i++) { var t = i / actx.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 38) * Math.sin(t * 900 * (1 + t * 7)); }
      var src = actx.createBufferSource(), g = actx.createGain(); g.gain.value = 0.35; src.buffer = buf; src.connect(g); g.connect(actx.destination); src.start();
    } catch (e) {}
  }

  /* ---------- flyover, dog and critters ---------- */
  var TOUR = true; try { TOUR = localStorage.getItem('ss-disc-tour') !== '0'; } catch (e) {}
  var skipBtn = $('dd-skip'), tourBtn = $('dd-tourbtn'), tourSub = $('dd-tour-s'), replayBtn = $('dd-replay');
  function pathLen(h) { var L = 0; for (var i = 0; i < h.path.length - 1; i++) L += Math.hypot(h.path[i + 1][0] - h.path[i][0], h.path[i + 1][1] - h.path[i][1]); return L; }
  function beginTour(force) {
    if (!ready || !G || G.phase !== 'aim' || !(TOUR || force) || (reduce && !force)) return;
    G.tour = { t: 0, dur: clamp(pathLen(G.h) / 32, 3.8, 8.5) + 1.4, hold: 1.4 }; G.phase = 'tour'; if (skipBtn) skipBtn.hidden = false; setDrawer(false); setMenu(false);
  }
  function endTour() { if (G && G.phase === 'tour') { G.phase = 'aim'; G.tour = null; G.glide = 1.8; if (skipBtn) skipBtn.hidden = true; previewDirty = true; syncUi(); } }
  function tourCam() {
    var tr = G.tour, h = G.h, f = clamp(tr.t / (tr.dur - tr.hold), 0, 1), e = f * f * (3 - 2 * f), q = pathAt(h, e), ahead = pathAt(h, Math.min(1, e + 0.1 + 0.04 * (1 - e)));
    var hd = Math.atan2(ahead.x - q.x, ahead.y - q.y); if (Math.hypot(ahead.x - q.x, ahead.y - q.y) < 0.5) hd = Math.atan2(q.hx, q.hy);
    var back = 13 - 6 * e, cx = q.x - Math.sin(hd) * back, cy = q.y - Math.cos(hd) * back, tx = ahead.x, ty = ahead.y, cz = Math.max(gh(cx, cy), gh(q.x, q.y)) + 12 - 8 * e, dd = Math.hypot(tx - cx, ty - cy) + 4;
    if (f >= 1) { var b = h.basket; hd = Math.atan2(b[0] - cx, b[1] - cy); tx = b[0]; ty = b[1]; dd = Math.hypot(tx - cx, ty - cy); }
    return { x: cx, y: cy, z: cz, yaw: hd, pitch: clamp(Math.atan((cz - gh(tx, ty) - 1.2) / dd), 0.06, 0.8) };
  }
  if (skipBtn) skipBtn.addEventListener('click', function (e) { e.stopPropagation(); endTour(); });
  function syncTourUi() { if (tourSub) tourSub.textContent = TOUR ? 'Preview each hole: on' : 'Preview each hole: off'; }
  if (tourBtn) tourBtn.addEventListener('click', function () { TOUR = !TOUR; try { localStorage.setItem('ss-disc-tour', TOUR ? '1' : '0'); } catch (e) {} syncTourUi(); say(TOUR ? 'Flyover on. You will see the line to the basket on each hole.' : 'Flyover off. Use Replay flyover in the menu any time.'); });
  if (replayBtn) replayBtn.addEventListener('click', function () { if (G && G.phase === 'aim') beginTour(true); });
  syncTourUi();

  var tourObjs = [], dog = null, hearts = [], crits = [], birds = [], PETS = 0, SPOTS = 0, petAt = 0, _sph = null;
  try { PETS = +localStorage.getItem('ss-disc-pets') || 0; SPOTS = +localStorage.getItem('ss-disc-spots') || 0; } catch (e) {}
  function sph() { return _sph || (_sph = new T.SphereGeometry(1, 12, 9)); }
  function lm(c, r) { return new T.MeshStandardMaterial({ color: c, roughness: r == null ? 0.95 : r }); }
  function blob(par, m, sx, sy, sz, x, y, z, shadow) { var o = new T.Mesh(sph(), m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); if (shadow) o.castShadow = true; par.add(o); return o; }
  function hitSphere(par, r, x, y, z) { var o = new T.Mesh(sph(), new T.MeshBasicMaterial({ visible: false })); o.scale.setScalar(r); o.position.set(x, y, z); o.visible = false; par.add(o); return o; }
  function limb(par, m, x, y, z, rad, len) { var pv = new T.Group(); pv.position.set(x, y, z); var c = new T.Mesh(new T.CylinderGeometry(rad, rad * 0.8, len, 7), m); c.position.y = -len / 2; c.castShadow = true; pv.add(c); par.add(pv); return pv; }

  /* ---------- the dog: lofted body, real fur texture, proper anatomy ---------- */
  var _fur = null;
  function furMaps() {   // fine hair strokes: one picture for colour, one for the bump that catches the light
    if (_fur) return _fur; var W = 256, H = 256, c = document.createElement('canvas'), b = document.createElement('canvas'); c.width = b.width = W; c.height = b.height = H;
    var x = c.getContext('2d'), y = b.getContext('2d'), r = rng(31); x.fillStyle = '#ece5d6'; x.fillRect(0, 0, W, H); y.fillStyle = '#808080'; y.fillRect(0, 0, W, H);
    for (var i = 0; i < 5200; i++) {
      var px = r() * W, py = r() * H, len = 6 + r() * 15, dx = (r() - 0.5) * 2.2, light = r() < 0.55, al = 0.06 + r() * 0.16, lw = 0.9 + r() * 1.1;
      for (var wy = -1; wy <= 1; wy++) {
        if (wy && py + len < H && py > 0) continue;
        x.strokeStyle = light ? 'rgba(255,253,247,' + al + ')' : 'rgba(128,106,76,' + al * 0.75 + ')'; x.lineWidth = lw; x.beginPath(); x.moveTo(px, py + wy * H); x.lineTo(px + dx, py + len + wy * H); x.stroke();
        y.strokeStyle = light ? 'rgba(255,255,255,' + al + ')' : 'rgba(0,0,0,' + al + ')'; y.lineWidth = lw; y.beginPath(); y.moveTo(px, py + wy * H); y.lineTo(px + dx, py + len + wy * H); y.stroke();
      }
    }
    var m = new T.CanvasTexture(c), bm = new T.CanvasTexture(b); [m, bm].forEach(function (t) { t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4; t.userData.keep = true; }); m.encoding = T.sRGBEncoding;
    return (_fur = { map: m, bump: bm });
  }
  // a smooth skin over rings: pts are [x, y, z, halfWidth, halfHeight]; the rings are spread along a curve through them
  function loft(pts, seg, mat, colorFn, shadow, rings) {
    var cp = new T.CatmullRomCurve3(pts.map(function (q) { return new T.Vector3(q[0], q[1], q[2]); })), rc = new T.CatmullRomCurve3(pts.map(function (q) { return new T.Vector3(q[3], q[4], 0); })), n = rings || pts.length * 3;
    var pos = [], uv = [], col = [], idx = [], up = new T.Vector3(0, 1, 0), alt = new T.Vector3(0, 0, 1), prev = null, dist = 0, i, k, P = [], R = [];
    for (i = 0; i < n; i++) { P.push(cp.getPoint(i / (n - 1))); R.push(rc.getPoint(i / (n - 1))); }
    for (i = 0; i < n; i++) {
      var t = P[Math.min(n - 1, i + 1)].clone().sub(P[Math.max(0, i - 1)]).normalize(), ref = Math.abs(t.dot(up)) > 0.9 ? alt : up, sv = new T.Vector3().crossVectors(ref, t).normalize(), uvv = new T.Vector3().crossVectors(t, sv).normalize();
      if (prev) dist += P[i].distanceTo(prev); prev = P[i];
      var rx = Math.max(0.003, R[i].x), ry = Math.max(0.003, R[i].y), per = Math.max(1, Math.round(6.28 * (rx + ry) * 0.5 * 4.2));
      for (k = 0; k <= seg; k++) {
        var an = k / seg * 6.2832, ca = Math.cos(an), sa = Math.sin(an);
        pos.push(P[i].x + sv.x * rx * ca + uvv.x * ry * sa, P[i].y + sv.y * rx * ca + uvv.y * ry * sa, P[i].z + sv.z * rx * ca + uvv.z * ry * sa);
        uv.push(k / seg * per, dist * 4.2); var c = colorFn ? colorFn(i / (n - 1), sa) : [1, 1, 1]; col.push(c[0], c[1], c[2]);
      }
    }
    for (i = 0; i < n - 1; i++) for (k = 0; k < seg; k++) { var a0 = i * (seg + 1) + k, b0 = a0 + seg + 1; idx.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0); }
    var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geo.setAttribute('color', new T.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    var nr = geo.attributes.normal; for (i = 0; i < n; i++) { var f = i * (seg + 1), l = f + seg, nx = nr.getX(f) + nr.getX(l), ny = nr.getY(f) + nr.getY(l), nz = nr.getZ(f) + nr.getZ(l), ln = Math.hypot(nx, ny, nz) || 1; nr.setXYZ(f, nx / ln, ny / ln, nz / ln); nr.setXYZ(l, nx / ln, ny / ln, nz / ln); }
    var m = new T.Mesh(geo, mat); m.castShadow = shadow !== false; return m;
  }
  function makeDog() {
    var g = new T.Group(); g.rotation.order = 'YXZ'; var body = new T.Group(); body.position.set(0, 0.4, -0.28); g.add(body);
    var fm = furMaps();
    function furMat(col) { var m = new T.MeshStandardMaterial({ map: fm.map, bumpMap: fm.bump, bumpScale: 0.3, vertexColors: !col, color: col || 0xffffff, roughness: 1, metalness: 0, envMapIntensity: 0.55 });
      m.onBeforeCompile = function (sh) { sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', 'float rimF = pow(1.0 - clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0), 3.0); gl_FragColor.rgb += rimF * 0.13 * vec3(1.0, 0.97, 0.9);\n#include <dithering_fragment>'); }; m.userData.keep = true; return m; }
    var coat = furMat(), earM = furMat(0xe2cfae), blk = new T.MeshStandardMaterial({ color: 0x0c0a09, roughness: 0.22, metalness: 0.1 }), skin = lm(0xe38f93, 0.55), eyeM = new T.MeshStandardMaterial({ color: 0x2a160a, roughness: 0.12, metalness: 0.1 }), collar = lm(0xb3121c, 0.5);
    var back = [0.9, 0.84, 0.73], belly = [1, 0.99, 0.96];
    function coatC(f, sa) { var t = sm(-0.2, 0.85, sa); return [mix(belly[0], back[0], t), mix(belly[1], back[1], t), mix(belly[2], back[2], t)]; }
    function pale() { return [1, 0.985, 0.95]; }
    // trunk: deep chest, tucked waist, strong hips
    body.add(loft([[0, 0.04, 0.64, 0.02, 0.03], [0, 0.06, 0.6, 0.085, 0.12], [0, 0.07, 0.5, 0.125, 0.19], [0, 0.08, 0.34, 0.14, 0.215], [0, 0.1, 0.14, 0.125, 0.19], [0, 0.13, -0.04, 0.105, 0.155], [0, 0.13, -0.18, 0.125, 0.18], [0, 0.12, -0.3, 0.095, 0.125], [0, 0.11, -0.36, 0.03, 0.05]], 20, coat, coatC, true, 30));
    body.add(loft([[0, 0.14, 0.5, 0.1, 0.13], [0, 0.26, 0.62, 0.085, 0.105], [0, 0.38, 0.74, 0.07, 0.08], [0, 0.42, 0.8, 0.065, 0.07]], 16, coat, coatC, true, 12));
    var cl = new T.Mesh(new T.TorusGeometry(0.087, 0.011, 8, 28), collar); cl.position.set(0, 0.29, 0.66); cl.rotation.x = Math.PI / 2 - 0.9; cl.scale.set(1, 1.1, 1); body.add(cl);
    var tag = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, 0.005, 14), new T.MeshStandardMaterial({ color: 0xd9b84a, metalness: 0.9, roughness: 0.3 })); tag.position.set(0, 0.2, 0.72); tag.rotation.x = Math.PI / 2 - 0.5; body.add(tag);
    // head: skull, long muzzle, lower jaw, nose, eyes, erect ears
    var head = new T.Group(); head.position.set(0, 0.4, 0.78); body.add(head);
    head.add(loft([[0, 0, -0.1, 0.04, 0.045], [0, 0.005, -0.05, 0.08, 0.085], [0, 0.005, 0.02, 0.095, 0.095], [0, -0.005, 0.08, 0.075, 0.078], [0, -0.03, 0.15, 0.052, 0.056], [0, -0.042, 0.22, 0.044, 0.048], [0, -0.046, 0.275, 0.036, 0.036], [0, -0.046, 0.292, 0.012, 0.012]], 16, coat, pale, true, 26));
    head.add(loft([[0, -0.062, 0.02, 0.04, 0.026], [0, -0.07, 0.12, 0.037, 0.022], [0, -0.072, 0.22, 0.03, 0.018], [0, -0.07, 0.262, 0.012, 0.01]], 10, coat, pale, false, 10));
    var nose = blob(head, blk, 0.031, 0.023, 0.022, 0, -0.036, 0.287, true); nose.geometry = sph();
    [-1, 1].forEach(function (sd) {
      var ey = blob(head, eyeM, 0.0155, 0.0155, 0.0155, sd * 0.05, 0.027, 0.085, false); var gl = blob(head, lm(0xffffff, 0.2), 0.004, 0.004, 0.004, sd * 0.05 + sd * -0.003, 0.033, 0.098, false); gl.material.emissive = new T.Color(0xffffff); gl.material.emissiveIntensity = 0.8;
      var sh = new T.Shape(); sh.moveTo(-0.046, 0); sh.bezierCurveTo(-0.046, 0.05, -0.022, 0.1, 0.0, 0.125); sh.bezierCurveTo(0.024, 0.1, 0.046, 0.05, 0.046, 0); sh.lineTo(-0.046, 0);
      var eg = new T.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.005, bevelSegments: 2, curveSegments: 10 }), e = new T.Mesh(eg, earM); e.position.set(sd * 0.05, 0.07, -0.04); e.rotation.set(-0.18, sd * 0.1, -sd * 0.2); e.castShadow = true; head.add(e);
    });
    var tongue = blob(head, skin, 0.022, 0.008, 0.06, 0, -0.1, 0.19, false); tongue.rotation.x = 0.35; tongue.visible = false;
    // legs: front legs straight, hind legs with the hock angle; each hangs from its hip
    var fr = [[0, 0, 0, 0.062, 0.08], [0, -0.1, 0.01, 0.052, 0.066], [0, -0.21, 0, 0.034, 0.044], [0, -0.32, 0.005, 0.026, 0.03], [0, -0.375, 0.01, 0.027, 0.032]];
    var hd = [[0, 0.02, 0, 0.075, 0.115], [0, -0.1, 0.04, 0.06, 0.1], [0, -0.22, 0, 0.04, 0.06], [0, -0.27, -0.045, 0.03, 0.04], [0, -0.34, -0.04, 0.024, 0.03], [0, -0.38, -0.035, 0.026, 0.03]];
    var legs = [[-1, 0.48, fr, 0.085, 0.03], [1, 0.48, fr, 0.085, 0.03], [-1, -0.14, hd, 0.09, -0.01], [1, -0.14, hd, 0.09, -0.01]].map(function (q) {
      var pv = new T.Group(); pv.position.set(q[0] * q[3], 0.02, q[1]); pv.add(loft(q[2], 12, coat, pale, true, 16)); blob(pv, coat, 0.034, 0.022, 0.053, 0, -0.392, q[4], true).material = coat; blob(pv, blk, 0.012, 0.007, 0.008, 0, -0.395, q[4] + 0.05, false); body.add(pv); return pv;
    });
    // the tail: a plume that curves up over the back
    var tail = new T.Group(); tail.position.set(0, 0.18, -0.32); body.add(tail); tail.add(loft([[0, 0, 0, 0.028, 0.028], [0, 0.03, -0.1, 0.045, 0.05], [0, 0.1, -0.2, 0.05, 0.055], [0, 0.2, -0.26, 0.04, 0.045], [0, 0.3, -0.27, 0.012, 0.014]], 12, coat, pale, true, 18));
    var hit = hitSphere(g, 1.3, 0, 0.5, 0.2);
    g.scale.setScalar(1.75); g.userData = { body: body, head: head, legs: legs, tail: tail, tongue: tongue, hit: hit };
    return g;
  }
  /* the real dog: a scanned-quality bull terrier mesh (CC BY 4.0, marcelo_ramos_lopez). It has no skeleton, so the legs, head and tail are bent in code. */
  var BULL = { ready: false, loading: false };
  var BN = 8908, BM = 50094;
  function loadBull() {
    if (BULL.ready || BULL.loading || !T) return; BULL.loading = true;
    fetch('models/dog/bull.bin?v=1').then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(function (buf) {
      var pos = new Float32Array(buf.slice(0, BN * 12)), nor = new Float32Array(buf.slice(BN * 12, BN * 24)), uv = new Float32Array(buf.slice(BN * 24, BN * 32)), idx = new Uint16Array(buf.slice(BN * 32, BN * 32 + BM * 2));
      var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage)); geo.setAttribute('normal', new T.BufferAttribute(nor, 3)); geo.setAttribute('uv', new T.BufferAttribute(uv, 2)); geo.setIndex(new T.BufferAttribute(idx, 1));
      var base = new Float32Array(pos), lists = [[], [], [], [], [], []], w = new Float32Array(BN), pz = [0, 0, 0, 0], pc = [0, 0, 0, 0];
      for (var i = 0; i < BN; i++) {
        var x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
        if (y < 0.46 && Math.abs(z) > 0.12) { var k = (z > 0 ? 0 : 2) + (x < 0 ? 0 : 1); lists[k].push(i); w[i] = sm(0.46, 0.2, y); pz[k] += z * (1 - w[i] * 0.5); pc[k] += 1 - w[i] * 0.5; }
        else if (z > 0.1 && y > 0.6) { lists[4].push(i); w[i] = sm(0.6, 0.8, y) * sm(0.1, 0.3, z); }
        else if (z < -0.4 && y > 0.58) { lists[5].push(i); w[i] = sm(-0.4, -0.52, z); }
      }
      for (var q = 0; q < 4; q++) pz[q] = pz[q] / Math.max(1, pc[q]);
      function tex2(u, srgb) { var t = new T.TextureLoader().load(u); t.flipY = false; if (srgb) t.encoding = T.sRGBEncoding; t.anisotropy = isLow ? 4 : 8; t.userData = { keep: true }; return t; }
      var mat = new T.MeshStandardMaterial({ map: tex2('models/dog/color.jpg?v=1', true), normalMap: tex2('models/dog/normal.jpg?v=1', false), normalScale: new T.Vector2(0.8, 0.8), roughness: 0.82, metalness: 0, envMapIntensity: 0.6 });
      mat.onBeforeCompile = function (sh) { sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', 'float rimF = pow(1.0 - clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0), 3.0); gl_FragColor.rgb += rimF * 0.1 * vec3(1.0, 0.97, 0.92);\n#include <dithering_fragment>'); };
      mat.userData.keep = true; geo.userData.keep = true;
      BULL.geo = geo; BULL.pos = pos; BULL.base = base; BULL.lists = lists; BULL.w = w; BULL.pz = pz; BULL.mat = mat; BULL.last = ''; BULL.ready = true;
      if (dog && scene) { var old = dog.g, ng = makeBullDog(); ng.position.copy(old.position); ng.rotation.y = old.rotation.y; scene.remove(old); scene.add(ng); dog.g = ng; }
    }).catch(function () { BULL.loading = false; });
  }
  function makeBullDog() {
    var g = new T.Group(); g.rotation.order = 'YXZ'; var body = new T.Group(); body.position.set(0, 0.36, 0); g.add(body);
    var mesh = new T.Mesh(BULL.geo, BULL.mat); mesh.scale.setScalar(0.7); mesh.position.set(0, -0.36, 0); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; body.add(mesh);
    var head = new T.Group(), tail = new T.Group(), tongue = new T.Group(), legs = [new T.Group(), new T.Group(), new T.Group(), new T.Group()]; body.add(head); body.add(tail);
    var hit = hitSphere(g, 1.3, 0, 0.5, 0.2); g.scale.setScalar(1.75); g.userData = { body: body, head: head, legs: legs, tail: tail, tongue: tongue, hit: hit, bull: true };
    return g;
  }
  function deformBull(u) {   // bend the legs, head and tail of the mesh from the same numbers the walking code sets on the old dog
    var B = BULL, a0 = u.legs[0].rotation.x, a1 = u.legs[1].rotation.x, a2 = u.legs[2].rotation.x, a3 = u.legs[3].rotation.x, hx = u.head.rotation.x - 0.08, hz = u.head.rotation.z, ty = u.tail.rotation.y;
    var key = [a0, a1, a2, a3, hx, hz, ty].map(function (v) { return v.toFixed(3); }).join(','); if (key === B.last) return; B.last = key;
    var P = B.pos, S = B.base, ang = [a0, a1, a2, a3], k, j, L, i, w, a, c, s2, dy, dz, yy, zz;
    for (k = 0; k < 4; k++) {
      L = B.lists[k]; var pz = B.pz[k];
      for (j = 0; j < L.length; j++) { i = L[j] * 3; w = B.w[L[j]]; a = ang[k] * w; c = Math.cos(a); s2 = Math.sin(a); dy = S[i + 1] - 0.47; dz = S[i + 2] - pz; P[i] = S[i]; P[i + 1] = 0.47 + dy * c - dz * s2; P[i + 2] = pz + dy * s2 + dz * c; }
    }
    L = B.lists[4];
    for (j = 0; j < L.length; j++) {
      i = L[j] * 3; w = B.w[L[j]]; a = hx * w; c = Math.cos(a); s2 = Math.sin(a); dy = S[i + 1] - 0.65; dz = S[i + 2] - 0.15; yy = 0.65 + dy * c - dz * s2; zz = 0.15 + dy * s2 + dz * c;
      var b = hz * w, cb = Math.cos(b), sb = Math.sin(b), dx = S[i], dy2 = yy - 0.65; P[i] = dx * cb - dy2 * sb; P[i + 1] = 0.65 + dx * sb + dy2 * cb; P[i + 2] = zz;
    }
    L = B.lists[5];
    for (j = 0; j < L.length; j++) { i = L[j] * 3; w = B.w[L[j]]; a = ty * w; c = Math.cos(a); s2 = Math.sin(a); var tx = S[i], tz = S[i + 2] + 0.45; P[i] = tx * c + tz * s2; P[i + 1] = S[i + 1]; P[i + 2] = -tx * s2 + tz * c - 0.45; }
    B.geo.attributes.position.needsUpdate = true;
  }
  var heartTex = null;
  function heartTexture() { if (heartTex) return heartTex; var c = document.createElement('canvas'); c.width = c.height = 64; var g = c.getContext('2d'); g.fillStyle = '#ff3d5e'; g.beginPath(); g.moveTo(32, 56); g.bezierCurveTo(4, 36, 6, 10, 24, 10); g.bezierCurveTo(30, 10, 32, 15, 32, 18); g.bezierCurveTo(32, 15, 34, 10, 40, 10); g.bezierCurveTo(58, 10, 60, 36, 32, 56); g.fill(); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3; g.stroke(); heartTex = new T.CanvasTexture(c); heartTex.encoding = T.sRGBEncoding; return heartTex; }
  function ensureDog() {
    if (dog) return; var g = BULL.ready ? makeBullDog() : makeDog(); scene.add(g);
    dog = { g: g, x: 0, y: 0, yaw: 0, v: 0, ph: 0, pet: 0, sit: 0, still: 0, wag: 0, last: 0 };
    for (var i = 0; i < 10; i++) { var sp = new T.Sprite(new T.SpriteMaterial({ map: heartTexture(), transparent: true, depthWrite: false, fog: false })); sp.visible = false; sp.userData = { life: 0 }; scene.add(sp); hearts.push(sp); }
  }
  function dogSpot() {   // the dog waits off to the side, well out of the way of the tee and the line of flight
    var a = G.base, key = G.lie[0].toFixed(1) + ',' + G.lie[1].toFixed(1) + ',' + a.toFixed(2) + ',' + G.hole;
    if (dog && dog.spotKey === key) return dog.spot;
    var rx = Math.cos(a), ry = -Math.sin(a), fx = Math.sin(a), fy = Math.cos(a), L = camera.aspect < 0.9 ? 3.6 : 7.5, list = [[L, 9], [-L, 9], [L * 1.4, 14], [-L * 1.4, 14], [L, 5], [-L, 5], [L * 1.8, 10], [-L * 1.8, 10], [L, 18], [-L, 18]], pick = null;
    for (var i = 0; i < list.length && !pick; i++) { var x = G.lie[0] + rx * list[i][0] + fx * list[i][1], y = G.lie[1] + ry * list[i][0] + fy * list[i][1]; if (!blocked(x, y) && terrain(G.h, x, y) !== 'ob' && !blocked(x + 1, y) && !blocked(x - 1, y)) pick = { x: x, y: y }; }
    if (!pick) pick = { x: G.lie[0] + rx * 9, y: G.lie[1] + ry * 9 };
    if (dog) { dog.spotKey = key; dog.spot = pick; } return pick;
  }
  function placeDog() { ensureDog(); var s = dogSpot(); dog.x = s.x; dog.y = s.y; dog.v = 0; dog.yaw = G.base; dog.pet = 0; dog.sit = 0; dog.still = 0; }
  function blocked(x, y) { if (inWater(G.h, x, y)) return true; var tl = G.h.treeList; for (var i = 0; i < tl.length; i++) { var t = tl[i]; if (Math.abs(t.x - x) < 0.8 && Math.abs(t.y - y) < 0.8) return true; } return false; }
  function updateDog(dt) {
    if (!dog || !G) return; var tg = null, run = false;
    if (G.phase === 'fly' && G.flight) { tg = { x: G.flight.p[0], y: G.flight.p[1] }; run = true; }
    else if (G.phase === 'roll' && G.roll) { tg = { x: G.roll.x1, y: G.roll.y1 }; run = true; }
    else if (G.phase === 'holed') { var b = G.h.basket, a2 = G.base; tg = { x: b[0] + Math.cos(a2) * 2.2 - Math.sin(a2) * 1.5, y: b[1] - Math.sin(a2) * 2.2 - Math.cos(a2) * 1.5 }; }
    else tg = dogSpot();
    var dx = tg.x - dog.x, dy = tg.y - dog.y, dist = Math.hypot(dx, dy), want = 0;
    if (dist > 70) { dog.x = tg.x; dog.y = tg.y; dist = 0; dx = dy = 0; }
    if (dog.pet > 0) dog.pet -= dt; else if (dist > (run ? 2.5 : 1.0)) want = Math.min(run ? 10 : 5.5, 1.0 + dist * 0.9);
    dog.v += (want - dog.v) * (1 - Math.exp(-dt * 6));
    if (dog.v > 0.2) {
      var th = Math.atan2(dx, dy); dog.yaw += angDiff(th, dog.yaw) * (1 - Math.exp(-dt * 9));
      var nx = dog.x + Math.sin(dog.yaw) * dog.v * dt, ny = dog.y + Math.cos(dog.yaw) * dog.v * dt;
      if (!blocked(nx, ny)) { dog.x = nx; dog.y = ny; } else { dog.v *= 0.3; dog.yaw += 0.08; }
      dog.still = 0;
    } else {
      dog.still += dt; var ta = Math.atan2(cam.x - dog.x, cam.y - dog.y); dog.yaw += angDiff(ta, dog.yaw) * (1 - Math.exp(-dt * 2.2));
    }
    var u = dog.g.userData, sitT = (dog.pet > 0 || dog.still > 1.4) ? 1 : 0; dog.sit += (sitT - dog.sit) * (1 - Math.exp(-dt * 6));
    dog.ph += dog.v * dt * 2.3; var sw = Math.sin(dog.ph) * Math.min(0.85, dog.v * 0.22) * (1 - dog.sit);
    u.legs[0].rotation.x = sw; u.legs[3].rotation.x = sw; u.legs[1].rotation.x = -sw; u.legs[2].rotation.x = -sw;
    u.legs[0].rotation.x += dog.sit * 0.5; u.legs[1].rotation.x += dog.sit * 0.5; u.legs[2].rotation.x = -sw - dog.sit * 1.4; u.legs[3].rotation.x = sw - dog.sit * 1.4;
    u.legs[0].scale.y = u.legs[1].scale.y = 1 + dog.sit * 0.55;
    u.body.rotation.x = -dog.sit * 0.55; u.body.position.y = 0.36 - dog.sit * 0.17 + Math.abs(Math.sin(dog.ph)) * 0.03 * Math.min(1, dog.v / 3);
    var happy = dog.pet > 0, wagS = happy ? 16 : (dog.v > 0.5 ? 9 : 5), wagA = happy ? 0.9 : 0.5; dog.wag += dt * wagS; u.tail.rotation.y = Math.sin(dog.wag) * wagA; u.tail.rotation.x = 0.3 + (dog.v > 3 ? 0.4 : 0);
    u.head.rotation.z = happy ? 0.32 * Math.sin(simTime * 3) + 0.15 : 0; u.head.rotation.x = happy ? -0.15 : Math.sin(dog.ph * 2) * 0.06 * Math.min(1, dog.v / 3) + 0.08; u.tongue.visible = happy || dog.v > 4 || dog.still > 3;
    if (u.bull) deformBull(u);
    if (dog.bounce > 0) dog.bounce -= dt; var gy = gh(dog.x, dog.y) + (dog.bounce > 0 ? Math.abs(Math.sin(dog.bounce * 12)) * 0.22 : 0); dog.g.position.set(dog.x, gy, -dog.y); dog.g.rotation.y = Math.PI - dog.yaw; dog.g.visible = true;
    hearts.forEach(function (sp) { var d = sp.userData; if (d.life <= 0) { sp.visible = false; return; } d.life -= dt; sp.position.x += d.vx * dt; sp.position.y += d.vy * dt; sp.position.z += d.vz * dt; var k = clamp(d.life / 1.3, 0, 1); sp.material.opacity = Math.min(1, k * 2); var sc = 0.28 + (1 - k) * 0.22; sp.scale.set(sc, sc, 1); if (d.life <= 0) sp.visible = false; });
  }
  function spawnHeart() { for (var i = 0; i < hearts.length; i++) { var sp = hearts[i]; if (sp.userData.life <= 0) { sp.userData.life = 1.3; sp.userData.vx = rnd(-0.25, 0.25); sp.userData.vy = rnd(0.7, 1.2); sp.userData.vz = rnd(-0.25, 0.25); sp.position.set(dog.x + rnd(-0.25, 0.25), dog.g.position.y + 1.1 + rnd(0, 0.2), -dog.y + rnd(-0.25, 0.25)); sp.visible = true; sp.material.opacity = 1; return; } }
  }
  function bark(n) {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume();
      (n === 1 ? [0] : [0, 0.2]).forEach(function (off) { var t0 = actx.currentTime + off, o = actx.createOscillator(), gn = actx.createGain(), f = actx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.setValueAtTime(340, t0); o.frequency.exponentialRampToValueAtTime(150, t0 + 0.13); f.type = 'bandpass'; f.frequency.value = 720; f.Q.value = 1.1; gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(0.2, t0 + 0.015); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15); o.connect(f); f.connect(gn); gn.connect(actx.destination); o.start(t0); o.stop(t0 + 0.18); });
    } catch (e) {}
  }
  var PET_SAY = ['Good dog!', 'Who is a good dog? You are!', 'Best caddy on the course.', 'Tail wag level: maximum.', 'Belly scritches accepted.', 'Professional disc fetcher.', 'Zero bogeys in this dog’s heart.'];
  function petDog() {
    var now = performance.now(); dog.pet = 2.4; dog.still = 2; PETS++; try { localStorage.setItem('ss-disc-pets', String(PETS)); } catch (e) {}
    for (var i = 0; i < 3; i++) spawnHeart(); if (now - petAt > 1400) { say(PET_SAY[PETS % PET_SAY.length] + ' ❤ ' + PETS + (PETS === 1 ? ' pet' : ' pets')); } petAt = now;
    if (PETS % 4 === 1) bark(); award('pup'); if (PETS >= 25) award('pup25');
  }

  // critters: rabbits that bolt, squirrels that run up trees, birds circling overhead
  function makeRabbit(gray) {
    var g = new T.Group(); g.rotation.order = 'YXZ'; var c = lm(gray ? 0x8a8378 : 0xb69b76), w = lm(0xf1eee6), blk = lm(0x111, 0.4);
    blob(g, c, 0.1, 0.095, 0.17, 0, 0.11, 0); blob(g, c, 0.065, 0.06, 0.08, 0, 0.18, 0.15); blob(g, w, 0.04, 0.04, 0.04, 0, 0.13, -0.18); blob(g, c, 0.07, 0.07, 0.1, 0, 0.07, -0.06);
    [-1, 1].forEach(function (sd) { var e = blob(g, c, 0.018, 0.085, 0.02, sd * 0.03, 0.29, 0.13); e.rotation.z = sd * 0.18; blob(g, blk, 0.013, 0.013, 0.013, sd * 0.045, 0.2, 0.21); });
    g.userData.hit = hitSphere(g, 0.55, 0, 0.15, 0); g.scale.setScalar(1.6); return g;
  }
  function makeSquirrel() {
    var g = new T.Group(); g.rotation.order = 'YXZ'; var c = lm(0x8a5a35), l = lm(0xd9c9ab), blk = lm(0x111, 0.4);
    blob(g, c, 0.07, 0.075, 0.14, 0, 0.09, 0); blob(g, c, 0.05, 0.05, 0.06, 0, 0.15, 0.13); blob(g, l, 0.045, 0.04, 0.07, 0, 0.07, 0.04);
    var tail = blob(g, lm(0x9c6a3f), 0.045, 0.12, 0.05, 0, 0.2, -0.14); tail.rotation.x = -0.3; g.userData.tail = tail;
    [-1, 1].forEach(function (sd) { blob(g, c, 0.014, 0.025, 0.014, sd * 0.03, 0.21, 0.13); blob(g, blk, 0.011, 0.011, 0.011, sd * 0.035, 0.16, 0.18); });
    g.userData.hit = hitSphere(g, 0.5, 0, 0.14, 0); g.scale.setScalar(1.7); return g;
  }
  function makeBird(dark) {
    var g = new T.Group(); g.rotation.order = 'YXZ'; var c = lm(dark ? 0x23262b : 0xe9e6dc); blob(g, c, 0.07, 0.06, 0.18, 0, 0, 0); blob(g, c, 0.045, 0.045, 0.055, 0, 0.02, 0.17);
    var wings = [-1, 1].map(function (sd) { var pv = new T.Group(); pv.position.set(sd * 0.05, 0.02, 0); var w = new T.Mesh(new T.PlaneGeometry(0.4, 0.14), new T.MeshStandardMaterial({ color: dark ? 0x2b2f35 : 0xf4f2ea, side: T.DoubleSide, roughness: 1 })); w.rotation.x = -Math.PI / 2; w.position.x = sd * 0.2; pv.add(w); g.add(pv); return pv; });
    g.userData.wings = wings; g.scale.setScalar(2.6); return g;
  }
  function spawnLife(h) {
    crits = []; birds = []; var r = rng(7000 + G.hole * 31), nR = isLow ? 3 : 5, nS = isLow ? 2 : 3, tl = h.treeList;
    function openSpot() { for (var k = 0; k < 50; k++) { var f = r() * 0.95 + 0.03, q = pathAt(h, f), lat = (r() < 0.5 ? -1 : 1) * (h.width / 2 + 1.5 + r() * 16), x = q.x + q.hy * lat, y = q.y - q.hx * lat; if (inWater(h, x, y) || Math.hypot(x - h.tee[0], y - h.tee[1]) < 9 || Math.hypot(x - h.basket[0], y - h.basket[1]) < 7 || blocked(x, y)) continue; return [x, y]; } return null; }
    function add(kind, g, x, y) { courseGroup.add(g); crits.push({ kind: kind, g: g, x: x, y: y, hx: x, hy: y, yaw: r() * 6.28, mode: 'idle', t: r() * 10, wait: 1 + r() * 4, v: 0, cl: 0, hop: 0, tx: x, ty: y, mt: 0, tree: null }); }
    for (var i = 0; i < nR; i++) { var s = openSpot(); if (s) add('rabbit', makeRabbit(r() < 0.4), s[0], s[1]); }
    for (var j = 0; j < nS; j++) { var t = tl[Math.floor(r() * tl.length)]; if (!t) continue; var sx = t.x + 1.4, sy = t.y + 0.6; if (blocked(sx, sy)) { var s2 = openSpot(); if (!s2) continue; sx = s2[0]; sy = s2[1]; } add('squirrel', makeSquirrel(), sx, sy); }
    var mid = pathAt(h, 0.5);
    for (var b = 0; b < 3; b++) { var bg = makeBird(b < 2); courseGroup.add(bg); birds.push({ g: bg, cx: mid.x + rnd(-20, 20), cy: mid.y + rnd(-25, 25), rad: 22 + r() * 30, a: r() * 6.28, w: (0.18 + r() * 0.14) * (b % 2 ? -1 : 1), hgt: 13 + r() * 12, ph: r() * 6 }); }
  }
  function nearestTree(x, y, maxd) { var best = null, bd = maxd, tl = G.h.treeList; for (var i = 0; i < tl.length; i++) { var t = tl[i], d = Math.hypot(t.x - x, t.y - y); if (d < bd && d > 1) { bd = d; best = t; } } return best; }
  function updateCrits(dt) {
    var threats = [[G.lie[0], G.lie[1]]]; if (dog) threats.push([dog.x, dog.y]); if (G.flight) threats.push([G.flight.p[0], G.flight.p[1]]); if (G.roll) threats.push([G.roll.x1, G.roll.y1]);
    crits.forEach(function (c) {
      c.t += dt; var sq = c.kind === 'squirrel', near = null, nd = 1e9;
      threats.forEach(function (q) { var d = Math.hypot(q[0] - c.x, q[1] - c.y); if (d < nd) { nd = d; near = q; } });
      if ((c.mode === 'idle' || c.mode === 'hop') && nd < (sq ? 4.5 : 6)) {
        var ax = c.x - near[0], ay = c.y - near[1], al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
        var tr = sq ? nearestTree(c.x, c.y, 16) : null;
        if (tr) { c.tree = tr; c.tx = tr.x + 0.5; c.ty = tr.y; } else { var rr = rnd(9, 15); c.tx = c.x + ax * rr + rnd(-3, 3); c.ty = c.y + ay * rr + rnd(-3, 3); }
        c.mode = 'flee'; c.mt = 4;
      }
      var mv = 0;
      if (c.mode === 'flee' || c.mode === 'hop') {
        var dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy), sp = c.mode === 'flee' ? (sq ? 7.5 : 8) : (sq ? 2.6 : 2.2); c.mt -= dt;
        if (d < 0.5 || c.mt <= 0) { if (c.mode === 'flee' && c.tree && d < 1.2) { c.mode = 'climb'; c.cl = 0; c.mt = 4.5; } else { c.mode = 'idle'; c.wait = 2 + Math.random() * 5; } }
        else { c.yaw += angDiff(Math.atan2(dx, dy), c.yaw) * (1 - Math.exp(-dt * 12)); var nx = c.x + Math.sin(c.yaw) * sp * dt, ny = c.y + Math.cos(c.yaw) * sp * dt; if (inWater(G.h, nx, ny)) { c.mode = 'idle'; c.wait = 1; } else { c.x = nx; c.y = ny; mv = sp; } }
      } else if (c.mode === 'climb') {
        c.mt -= dt; c.cl = c.mt > 3.3 ? Math.min(3.4, c.cl + dt * 3.2) : c.mt > 0.9 ? 3.4 : Math.max(0, c.cl - dt * 3.2); if (c.mt <= 0) { c.mode = 'idle'; c.tree = null; c.wait = 3; c.cl = 0; }
      } else if (c.mode === 'happy') {
        c.mt -= dt; if (c.mt <= 0) { c.mode = 'idle'; c.wait = 2; }
      } else {
        c.wait -= dt; if (c.wait <= 0) { var ra = Math.random() * 6.28, rd = 1 + Math.random() * 3.5, tx = c.hx + Math.cos(ra) * rd, ty = c.hy + Math.sin(ra) * rd; if (!inWater(G.h, tx, ty)) { c.tx = tx; c.ty = ty; c.mode = 'hop'; c.mt = 3; } else c.wait = 1; }
      }
      var hop = mv > 0 ? Math.abs(Math.sin(c.t * (sq ? 16 : 11))) * (sq ? 0.09 : 0.26) : 0, nib = c.mode === 'idle' ? Math.sin(c.t * 5) * 0.012 : 0, jump = c.mode === 'happy' ? Math.abs(Math.sin(c.t * 9)) * 0.45 : 0;
      c.g.position.set(c.x, gh(c.x, c.y) + hop + jump + nib + c.cl, -c.y); c.g.rotation.y = Math.PI - c.yaw; c.g.rotation.x = c.mode === 'climb' ? -1.3 : 0;
      if (sq && c.g.userData.tail) c.g.userData.tail.rotation.x = -0.3 + Math.sin(c.t * (mv ? 14 : 3)) * 0.25;
    });
    birds.forEach(function (b) { b.a += b.w * dt; var px = b.cx + Math.cos(b.a) * b.rad, py = b.cy + Math.sin(b.a) * b.rad; b.g.position.set(px, gh(px, py) + b.hgt + Math.sin(simTime * 0.6 + b.ph) * 1.2, -py); b.g.rotation.y = Math.PI - (Math.atan2(-Math.sin(b.a) * b.w, Math.cos(b.a) * b.w) + (b.w < 0 ? 0 : 0)); b.g.rotation.z = -b.w * 0.8; var f = Math.sin(simTime * 11 + b.ph) * 0.7; b.g.userData.wings[0].rotation.z = f; b.g.userData.wings[1].rotation.z = -f; });
  }
  function updateLife(dt) { if (!G) return; updateRipples(dt); if (!dog) return; updateDog(dt); updateCrits(dt); }
  var ray = null, ndc = null;
  function pickLife(e) {
    if (!ready || !dog || !camera) return false; ray = ray || new T.Raycaster(); ndc = ndc || new T.Vector2();
    var r = glc.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1)); ray.setFromCamera(ndc, camera);
    var best = null, bd = 1e9, hd = ray.intersectObject(dog.g.userData.hit, false);
    if (hd.length) { best = { dog: true }; bd = hd[0].distance; }
    crits.forEach(function (c) { var hh = ray.intersectObject(c.g.userData.hit, false); if (hh.length && hh[0].distance < bd) { bd = hh[0].distance; best = { c: c }; } });
    if (!best) return false;
    if (best.dog) petDog(); else spotCrit(best.c);
    return true;
  }
  function spotCrit(c) {
    if (c.mode === 'climb') { say('The squirrel is up the tree. Spotted!'); } else { c.mode = 'happy'; c.mt = 0.9; }
    if (!c.seen) { c.seen = true; SPOTS++; try { localStorage.setItem('ss-disc-spots', String(SPOTS)); } catch (e) {} say((c.kind === 'rabbit' ? 'Rabbit' : 'Squirrel') + ' spotted! ' + SPOTS + ' critter' + (SPOTS === 1 ? '' : 's') + ' so far.'); if (SPOTS >= 5) award('wild'); }
  }
  function buildLifeProps(h) {   // line to the basket and a beacon, shown only during the flyover
    tourObjs = []; var pts = [], L = pathLen(h), n = Math.max(8, Math.round(L / 2.2));
    for (var i = 0; i <= n; i++) { var q = pathAt(h, i / n); pts.push(new T.Vector3(q.x, gh(q.x, q.y) + 0.4, -q.y)); }
    var ln = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineDashedMaterial({ color: 0xfff3b0, dashSize: 1.4, gapSize: 0.9, transparent: true, opacity: 0.95, fog: false, depthTest: false })); ln.computeLineDistances(); ln.renderOrder = 5; ln.visible = false; ln.frustumCulled = false; courseGroup.add(ln); tourObjs.push(ln);
    var bc = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 11, 12, 1, true), new T.MeshBasicMaterial({ color: 0xff3b4a, transparent: true, opacity: 0.4, depthWrite: false, fog: false, side: T.DoubleSide })); bc.position.set(h.basket[0], h.bz + 5.5, -h.basket[1]); bc.visible = false; courseGroup.add(bc); tourObjs.push(bc);
    var rg = new T.Mesh(new T.RingGeometry(1.0, 1.35, 36), new T.MeshBasicMaterial({ color: 0xff3b4a, transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false, fog: false })); rg.rotation.x = -Math.PI / 2; rg.position.set(h.basket[0], h.bz + 0.12, -h.basket[1]); rg.visible = false; courseGroup.add(rg); tourObjs.push(rg);
  }

  /* ---------- Three.js scene ---------- */
  var skyMesh, glowSprite, ridgeMeshes = [], peaksMesh, snowPts, snowPos, snowVel, themeNow = null, envRT = null, skyTexs = {}, WINTER = false, winDetail = null, grassPhoto = null, groundU = null, groundRepU = null, groundSpan = 100;
  var T, R, scene, camera, sun, hemi, courseGroup, discMesh, markMeshes = [], trailLine, trailGeo, prevLine, prevGeo, prevEnd, teeRing, basketObj, waterMats = [], waterTex, waterNormal, groundTex, curBuilt = -1, noiseTile;
  var TRAILN = 600, PREVN = 220, isLow = (navigator.hardwareConcurrency || 4) < 4 || /Android|iPhone|iPad/i.test(navigator.userAgent);
  function loadThree(cb) {
    if (window.THREE) return cb(true);
    var sc = document.createElement('script'); sc.src = 'js/vendor/three.min.js?v=149'; sc.onload = function () { cb(!!window.THREE); }; sc.onerror = function () { cb(false); }; document.head.appendChild(sc);
  }
  function V(x, y, z) { return new T.Vector3(x, z, -y); }
  function mapV(a) { return [a[0], a[2], -a[1]]; }

  // Time of day: each look sets the sky colors, the cloud tint, the sun (color, strength, height), the haze and the exposure together.
  var LOOKS = {
    day:     { name: 'Midday',      stops: [[0, '#2d62ad'], [.18, '#4a82c6'], [.34, '#7fb0dc'], [.43, '#b8d5ea'], [.48, '#dbe8ef'], [.5, '#e6ecee'], [.505, '#9fae95'], [1, '#4f6238']], cloud: [1, 1, 1], haze: 'rgba(255,236,205,.5)', fog: 0xb9cbd9, near: 55, far: 640, hemi: [0xcadcf2, 0x4b5634, .62], sun: [0xffeed6, 2.5], off: [62, 70, -82], exp: .86, glow: [917, 768, -1212, 0xffffff] },
    golden:  { name: 'Golden hour', stops: [[0, '#304f86'], [.18, '#5a73a8'], [.34, '#a58aa4'], [.43, '#e2a26e'], [.48, '#f4be84'], [.5, '#f8cf9a'], [.505, '#8f8a58'], [1, '#4a4a2c']], cloud: [1, .78, .58], haze: 'rgba(255,196,128,.62)', fog: 0xe3b98e, near: 40, far: 560, hemi: [0xf1c8a0, 0x4a4630, .55], sun: [0xffb066, 2.6], off: [88, 30, -70], exp: .92, glow: [1180, 330, -1000, 0xffc080] },
    overcast:{ name: 'Overcast',    stops: [[0, '#6b7683'], [.18, '#848f9b'], [.34, '#9ca7b1'], [.43, '#b6bfc7'], [.48, '#c6ced5'], [.5, '#d0d6db'], [.505, '#8a9783'], [1, '#4b5a3a']], cloud: [.74, .78, .84], haze: 'rgba(205,212,219,.6)', fog: 0xc3cbd2, near: 32, far: 430, hemi: [0xd5dde6, 0x58633f, 1.05], sun: [0xe9edf2, .75], off: [40, 90, -50], exp: .98, glow: [917, 768, -1212, 0x000000] },
    dusk:    { name: 'Dusk',        stops: [[0, '#1d2b55'], [.18, '#34437a'], [.34, '#6b5a8f'], [.43, '#c0708f'], [.48, '#ee9a86'], [.5, '#f6b690'], [.505, '#59563f'], [1, '#2c3020']], cloud: [.95, .6, .66], haze: 'rgba(240,150,140,.5)', fog: 0x9a7f9a, near: 36, far: 520, hemi: [0xa3a0d0, 0x34382a, .5], sun: [0xff8a70, 1.5], off: [92, 20, -66], exp: 1.02, glow: [1260, 215, -950, 0xff7a6a] }
  }, ORDER = ['day', 'golden', 'overcast', 'dusk'], TOD = 'day', sunOff = [62, 70, -82];
  try { var _t = localStorage.getItem('ss-disc-tod'); if (_t && LOOKS[_t]) TOD = _t; } catch (e) {}
  function applyTheme(win) {
    var key = win ? 'w' : TOD;
    if (themeNow === key || !scene) return; themeNow = key;
    var L = LOOKS[TOD];
    var tex = skyTexs[key] || (skyTexs[key] = skyTexture(win));
    skyMesh.material.map = tex; skyMesh.material.needsUpdate = true;
    try { var pm = new T.PMREMGenerator(R), rt = pm.fromEquirectangular(tex); if (envRT) envRT.dispose(); envRT = rt; scene.environment = rt.texture; pm.dispose(); } catch (er) {}
    scene.fog.color.set(win ? 0xdbe2e8 : L.fog); scene.fog.near = win ? 26 : L.near; scene.fog.far = win ? 340 : L.far;
    hemi.color.set(win ? 0xe2eaf4 : L.hemi[0]); hemi.groundColor.set(win ? 0xa9b6c6 : L.hemi[1]); hemi.intensity = win ? 1.0 : L.hemi[2];
    sun.color.set(win ? 0xeaf1ff : L.sun[0]); sun.intensity = win ? 1.35 : L.sun[1]; R.toneMappingExposure = win ? 0.95 : L.exp;
    sunOff = win ? [62, 70, -82] : L.off;
    glowSprite.position.set(L.glow[0], L.glow[1], L.glow[2]); glowSprite.material.color.set(L.glow[3]); glowSprite.visible = !win && TOD !== 'overcast'; peaksMesh.visible = win; snowPts.visible = win;
    ridgeMeshes.forEach(function (m) { m.material.color.set(win ? m.userData.w : m.userData.s); });
  }
  function skyTexture(win) {
    var W = 2048, Hh = 1024, c = document.createElement('canvas'); c.width = W; c.height = Hh; var g = c.getContext('2d'), r = rng(31), gr = g.createLinearGradient(0, 0, 0, Hh);
    if (win) { gr.addColorStop(0, '#7b8794'); gr.addColorStop(0.18, '#98a4b0'); gr.addColorStop(0.34, '#b3bdc7'); gr.addColorStop(0.43, '#ccd3d9'); gr.addColorStop(0.48, '#dae0e5'); gr.addColorStop(0.5, '#e3e8ec'); gr.addColorStop(0.505, '#e8ecef'); gr.addColorStop(1, '#eef1f4'); }
    else { LOOKS[TOD].stops.forEach(function (st) { gr.addColorStop(st[0], st[1]); }); }
    g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
    // fractal cloud layer: value noise, thresholded into soft cumulus with shaded bellies
    var NW = 256, NH = 96, base = [], i, j; for (i = 0; i < 40 * 40; i++) base.push(r());
    function vn(x, y, f) { x *= f; y *= f; var xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty); function h(a, b) { return base[((b % 40 + 40) % 40) * 40 + ((a % 40 + 40) % 40)]; } return (h(xi, yi) * (1 - tx) + h(xi + 1, yi) * tx) * (1 - ty) + (h(xi, yi + 1) * (1 - tx) + h(xi + 1, yi + 1) * tx) * ty; }
    var cl = document.createElement('canvas'); cl.width = NW; cl.height = NH; var cg = cl.getContext('2d'), im = cg.createImageData(NW, NH);
    for (j = 0; j < NH; j++) for (i = 0; i < NW; i++) {
      var u = i / NW, v = j / NH, d = vn(u * 6, v * 9, 1) * 0.5 + vn(u * 12, v * 18, 1) * 0.28 + vn(u * 24, v * 36, 1) * 0.15 + vn(u * 48, v * 72, 1) * 0.07;
      var cover = (win ? 0.3 : 0.52) + 0.1 * Math.sin(u * 12.5), a = Math.max(0, Math.min(1, (d - cover) * 4.2)), fade = Math.min(1, v * 6) * Math.min(1, (1 - v) * 2.4);
      var up2 = vn(u * 6, (v - 0.04) * 9, 1) * 0.5 + vn(u * 12, (v - 0.04) * 18, 1) * 0.28 + vn(u * 24, (v - 0.04) * 36, 1) * 0.15 + vn(u * 48, (v - 0.04) * 72, 1) * 0.07, lit = Math.max(0, Math.min(1, 0.55 + (d - up2) * 14));
      var o = (j * NW + i) * 4; if (win) { im.data[o] = 118 + lit * 72; im.data[o + 1] = 127 + lit * 68; im.data[o + 2] = 140 + lit * 62; } else { var ct = LOOKS[TOD].cloud; im.data[o] = (150 + lit * 105) * ct[0]; im.data[o + 1] = (160 + lit * 95) * ct[1]; im.data[o + 2] = (178 + lit * 77) * ct[2]; } im.data[o + 3] = a * fade * 235;
    }
    cg.putImageData(im, 0, 0); g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.globalAlpha = 0.95; g.drawImage(cl, 0, Hh * 0.04, W, Hh * 0.43); g.restore();
    // warm haze along the horizon
    var hz = g.createLinearGradient(0, Hh * 0.38, 0, Hh * 0.505); hz.addColorStop(0, win ? 'rgba(228,234,240,0)' : 'rgba(255,238,205,0)'); hz.addColorStop(1, win ? 'rgba(228,234,240,.6)' : LOOKS[TOD].haze); g.fillStyle = hz; g.fillRect(0, Hh * 0.38, W, Hh * 0.13);
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.mapping = T.EquirectangularReflectionMapping; t.anisotropy = 4; return t;
  }
  function normalFromHeight(img) {   // turn the wave drawing into a normal map so the water catches the sky
    var S = img.width, c = document.createElement('canvas'); c.width = c.height = S; var g = c.getContext('2d'); g.drawImage(img, 0, 0); var src = g.getImageData(0, 0, S, S), out = g.createImageData(S, S);
    function h(x, y) { return src.data[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255; }
    for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) { var dx = (h(x + 1, y) - h(x - 1, y)) * 3.2, dy = (h(x, y + 1) - h(x, y - 1)) * 3.2, l = Math.hypot(dx, dy, 1), o = (y * S + x) * 4; out.data[o] = (-dx / l * 0.5 + 0.5) * 255; out.data[o + 1] = (-dy / l * 0.5 + 0.5) * 255; out.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; out.data[o + 3] = 255; }
    g.putImageData(out, 0, 0); var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4; return t;
  }
  function glowTexture() {
    var c = document.createElement('canvas'); c.width = c.height = 256; var g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 3, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,255,248,1)'); gr.addColorStop(0.06, 'rgba(255,250,228,.95)'); gr.addColorStop(0.2, 'rgba(255,236,190,.38)'); gr.addColorStop(1, 'rgba(255,226,170,0)');
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
    R.outputEncoding = T.sRGBEncoding; R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = 0.86; R.setPixelRatio(Math.min(window.devicePixelRatio || 1, isLow ? 1.5 : 2));
    R.shadowMap.enabled = true; R.shadowMap.type = isLow ? T.PCFShadowMap : T.PCFSoftShadowMap;
    scene = new T.Scene(); scene.fog = new T.Fog(0xb9cbd9, 55, 640);
    camera = new T.PerspectiveCamera(55, 16 / 10, 0.15, 2500);
    var skyTex = skyTexture(); skyTexs[TOD] = skyTex;
    var sky = new T.Mesh(new T.SphereGeometry(1800, 32, 20), new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide, fog: false, depthWrite: false, toneMapped: false })); sky.renderOrder = -2; sky.name = 'sky'; sky.rotation.y = 2.2; scene.add(sky); skyMesh = sky; skyTexs[0] = skyTex;
    try { var pm = new T.PMREMGenerator(R); envRT = pm.fromEquirectangular(skyTex); scene.environment = envRT.texture; pm.dispose(); } catch (er) {}
    var glow = new T.Sprite(new T.SpriteMaterial({ map: glowTexture(), fog: false, depthWrite: false, blending: T.AdditiveBlending, transparent: true, toneMapped: false })); glow.scale.set(430, 430, 1); glow.position.set(917, 768, -1212); glow.name = 'glow'; scene.add(glow); glowSprite = glow;
    [[620, 0x5f7f8c, 36, 5], [900, 0x86a2b4, 60, 2], [1250, 0xa6bccc, 90, 9]].forEach(function (rg, ri) {   // far hills, hazier the further they are
      var N = 120, pos = [], idx = [], rad = rg[0];
      for (var i = 0; i <= N; i++) { var a2 = i / N * Math.PI * 2, hh = rg[2] * (0.5 + 0.28 * Math.sin(a2 * 3 + ri * 1.7 + rg[3]) + 0.2 * Math.sin(a2 * 7.3 + 1 + ri) + 0.1 * Math.sin(a2 * 13 + rg[3]) + 0.06 * Math.sin(a2 * 31)); pos.push(Math.sin(a2) * rad, -8, -Math.cos(a2) * rad, Math.sin(a2) * rad, hh, -Math.cos(a2) * rad); if (i < N) { var k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
      var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      var m = new T.Mesh(g, new T.MeshBasicMaterial({ color: rg[1], side: T.DoubleSide, fog: false, toneMapped: false })); m.name = 'ridge'; m.userData.s = rg[1]; m.userData.w = [0xb4c1ce, 0xc6d1db, 0xd7dfe7][ri]; ridgeMeshes.push(m); scene.add(m);
    });
    hemi = new T.HemisphereLight(0xcadcf2, 0x4b5634, 0.62); scene.add(hemi);
    sun = new T.DirectionalLight(0xffeed6, 2.5); sun.castShadow = true; var sz = isLow ? 1024 : 2048; sun.shadow.mapSize.set(sz, sz);
    var sc = sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 260; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
    scene.add(sun); scene.add(sun.target);
    (function () {   // winter only: the Front Range, snow-capped, off to the west
      var N = 160, pos = [], col = [], idx = [], rad = 1050, rr2 = rng(17);
      for (var i = 0; i <= N; i++) {
        var a2 = i / N * Math.PI * 2, d = Math.atan2(Math.sin(a2 - 4.2), Math.cos(a2 - 4.2)), hump = Math.exp(-d * d / 0.55), hh = 40 + 230 * hump * (0.7 + 0.3 * Math.sin(a2 * 23 + 1) + 0.15 * Math.sin(a2 * 61)) + 26 * Math.sin(a2 * 9 + 2) + 10 * Math.sin(a2 * 41);
        hh = Math.max(24, hh); var cx = Math.sin(a2) * rad, cz = -Math.cos(a2) * rad, sn = clamp((hh - 70) / 140, 0, 1);
        pos.push(cx, -8, cz, cx, hh, cz); col.push(0.45, 0.52, 0.58, 0.9 - 0.3 * (1 - sn), 0.94 - 0.32 * (1 - sn), 0.98 - 0.3 * (1 - sn));
        if (i < N) { var k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx);
      peaksMesh = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide, fog: false, toneMapped: false })); peaksMesh.visible = false; peaksMesh.renderOrder = -1; scene.add(peaksMesh);
      var N2 = isLow ? 900 : 2200; snowPos = new Float32Array(N2 * 3); snowVel = new Float32Array(N2 * 2); for (var q = 0; q < N2; q++) { snowPos[q * 3] = (Math.random() - 0.5) * 70; snowPos[q * 3 + 1] = Math.random() * 26; snowPos[q * 3 + 2] = (Math.random() - 0.5) * 70; snowVel[q * 2] = 0.9 + Math.random() * 1.1; snowVel[q * 2 + 1] = Math.random() * 6.28; }
      var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(snowPos, 3));
      var dc = document.createElement('canvas'); dc.width = dc.height = 32; var dg = dc.getContext('2d'), rg3 = dg.createRadialGradient(16, 16, 0, 16, 16, 16); rg3.addColorStop(0, 'rgba(255,255,255,1)'); rg3.addColorStop(0.5, 'rgba(255,255,255,.7)'); rg3.addColorStop(1, 'rgba(255,255,255,0)'); dg.fillStyle = rg3; dg.fillRect(0, 0, 32, 32);
      snowPts = new T.Points(sg, new T.PointsMaterial({ map: new T.CanvasTexture(dc), size: 0.24, sizeAttenuation: true, transparent: true, opacity: 0.92, depthWrite: false, fog: false, color: 0xffffff })); snowPts.frustumCulled = false; snowPts.visible = false; scene.add(snowPts);
    })();
    try { new T.TextureLoader().load('img/grass-detail.jpg?v=3', function (t) { t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = isLow ? 4 : 8; grassPhoto = t; if (!WINTER && groundU && groundRepU) { groundU.value = t; groundRepU.value.set(MAPX * 2 / 2.6, groundSpan / 2.6); } }); } catch (er) {}
    noiseTile = makeNoise(); waterTex = waveTexture(); waterNormal = normalFromHeight(waterTex.image);
    discMesh = makeDisc(); scene.add(discMesh);
    for (var i = 0; i < 8; i++) { var m2 = makeDisc(true); m2.visible = false; markMeshes.push(m2); scene.add(m2); }
    trailGeo = new T.BufferGeometry(); trailGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(TRAILN * 3), 3)); trailGeo.setDrawRange(0, 0);
    trailLine = new T.Line(trailGeo, new T.LineBasicMaterial({ toneMapped: false, color: 0xc3cad2, transparent: true, opacity: 0.5, fog: false })); trailLine.frustumCulled = false; scene.add(trailLine);
    prevGeo = new T.BufferGeometry(); prevGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(PREVN * 3), 3)); prevGeo.setDrawRange(0, 0);
    prevLine = new T.Line(prevGeo, new T.LineBasicMaterial({ toneMapped: false, color: 0xb7bfc8, transparent: true, opacity: 0.55, depthWrite: false, fog: false })); prevLine.frustumCulled = false; prevLine.renderOrder = 3; scene.add(prevLine);
    prevEnd = new T.Mesh(new T.RingGeometry(0.3, 0.38, 28), new T.MeshBasicMaterial({ toneMapped: false, color: 0xb7bfc8, transparent: true, opacity: 0.45, side: T.DoubleSide, depthWrite: false })); prevEnd.rotation.x = -Math.PI / 2; scene.add(prevEnd);
    teeRing = new T.Mesh(new T.RingGeometry(0.28, 0.4, 28), new T.MeshBasicMaterial({ toneMapped: false, color: 0xff2a35, side: T.DoubleSide })); teeRing.rotation.x = -Math.PI / 2; scene.add(teeRing);
    courseGroup = new T.Group(); scene.add(courseGroup);
    loadBull();
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
    // two tiers of 24 chains (band to middle ring, middle ring to the lower ring), rebuilt every frame while they rattle
    var N = 24, S = 7, arr = new Float32Array(N * S * 2 * 3 * 2);
    return { N: N, S: S, arr: arr, geo: (function () { var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(arr, 3)); return g; })() };
  }
  function makeBasket() {
    var g = new T.Group(), chrome = new T.MeshStandardMaterial({ color: 0xd6dbe0, metalness: 1, roughness: 0.22, envMapIntensity: 1.2 }), galv = new T.MeshStandardMaterial({ color: 0xaeb4ba, metalness: 0.9, roughness: 0.42, envMapIntensity: 1 }),
      dark = new T.MeshStandardMaterial({ color: 0x23272d, metalness: 0.6, roughness: 0.5 }), band = new T.MeshStandardMaterial({ color: 0xe4a416, roughness: 0.4, metalness: 0.15 }), black = new T.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6, metalness: 0.3 });
    var Y = new T.Vector3(0, 1, 0);
    function ringOf(geo, mat, n, shadow) {   // n copies of one rod, turned evenly around the pole
      var im = new T.InstancedMesh(geo, mat, n), m4 = new T.Matrix4(), q = new T.Quaternion(), one = new T.Vector3(1, 1, 1), z0 = new T.Vector3();
      for (var i = 0; i < n; i++) { q.setFromAxisAngle(Y, i / n * Math.PI * 2); im.setMatrixAt(i, m4.compose(z0, q, one)); }
      im.castShadow = !!shadow; im.frustumCulled = false; g.add(im); return im;
    }
    // pole set into the ground: a little disturbed soil, a steel sleeve and the tapered pole
    var soil = new T.Mesh(new T.CircleGeometry(0.15, 28), new T.MeshStandardMaterial({ color: 0x4d4a32, roughness: 1 })); soil.rotation.x = -Math.PI / 2; soil.position.y = 0.012; soil.receiveShadow = true; g.add(soil);
    var shade = (function () { var c = document.createElement('canvas'); c.width = c.height = 128; var x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 6, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,.5)'); gr.addColorStop(0.55, 'rgba(0,0,0,.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return new T.CanvasTexture(c); })();
    var blob = new T.Mesh(new T.CircleGeometry(0.62, 32), new T.MeshBasicMaterial({ map: shade, transparent: true, depthWrite: false, toneMapped: false })); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; blob.renderOrder = 1; g.add(blob);
    var sleeve = new T.Mesh(new T.CylinderGeometry(0.052, 0.058, 0.09, 18), galv); sleeve.position.y = 0.045; g.add(sleeve);
    var pole = new T.Mesh(new T.CylinderGeometry(0.032, 0.04, 0.6, 18), galv); pole.position.y = 0.38; pole.castShadow = true; g.add(pole);
    var weld = new T.Mesh(new T.CylinderGeometry(0.043, 0.043, 0.012, 14), chrome); weld.position.y = 0.2; g.add(weld);
    // the tray: a hub, 24 curved rods fanning out to the rim, three rings holding them, and a rolled rim with a lip below it
    var hub = new T.Mesh(new T.CylinderGeometry(0.075, 0.045, 0.07, 18), galv); hub.position.y = 0.625; hub.castShadow = true; g.add(hub);
    var cap2 = new T.Mesh(new T.SphereGeometry(0.075, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), chrome); cap2.position.y = 0.66; cap2.scale.y = 0.4; g.add(cap2);
    var rodC = new T.QuadraticBezierCurve3(new T.Vector3(0.06, 0.64, 0), new T.Vector3(0.2, 0.612, 0), new T.Vector3(0.328, 0.72, 0));
    ringOf(new T.TubeGeometry(rodC, 14, 0.0048, 5), chrome, 24, true);
    [[0.12, 0.628], [0.2, 0.634], [0.27, 0.665]].forEach(function (rr) { var ro = new T.Mesh(new T.TorusGeometry(rr[0], 0.0042, 5, 52), chrome); ro.rotation.x = Math.PI / 2; ro.position.y = rr[1]; g.add(ro); });
    var rim = new T.Mesh(new T.TorusGeometry(0.328, 0.0115, 8, 64), chrome); rim.rotation.x = Math.PI / 2; rim.position.y = 0.72; rim.castShadow = true; g.add(rim);
    var lip = new T.Mesh(new T.TorusGeometry(0.334, 0.006, 6, 64), galv); lip.rotation.x = Math.PI / 2; lip.position.y = 0.693; g.add(lip);
    // the cage: 12 tines bow out from the rim and curve in to the top ring, with a ring around the middle
    var tineC = new T.CubicBezierCurve3(new T.Vector3(0.328, 0.72, 0), new T.Vector3(0.352, 0.96, 0), new T.Vector3(0.3, 1.22, 0), new T.Vector3(0.205, 1.4, 0));
    ringOf(new T.TubeGeometry(tineC, 18, 0.0095, 6), chrome, 12, true);
    var mid = new T.Mesh(new T.TorusGeometry(0.341, 0.0075, 6, 56), chrome); mid.rotation.x = Math.PI / 2; mid.position.y = 1.02; g.add(mid);
    var top = new T.Mesh(new T.TorusGeometry(0.205, 0.016, 10, 48), chrome); top.rotation.x = Math.PI / 2; top.position.y = 1.4; top.castShadow = true; g.add(top);
    // the top band, printed like a real target
    var bt = (function () { var c = document.createElement('canvas'); c.width = 1024; c.height = 64; var x = c.getContext('2d'); x.fillStyle = '#e8ad18'; x.fillRect(0, 0, 1024, 64); x.fillStyle = '#16140f'; x.font = '800 30px system-ui, sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'center'; x.fillText('SOBERING STORIES  ✦  DISC-IPLINE  ✦  SOBERING STORIES  ✦  DISC-IPLINE  ✦', 512, 34); x.fillRect(0, 0, 1024, 4); x.fillRect(0, 60, 1024, 4); var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t; })();
    var bnd = new T.Mesh(new T.CylinderGeometry(0.215, 0.215, 0.07, 64, 1, true), new T.MeshStandardMaterial({ map: bt, roughness: 0.45, metalness: 0.1 })); bnd.position.y = 1.43; bnd.castShadow = true; g.add(bnd);
    var bnd2 = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 0.07, 48, 1, true), band.clone()); bnd2.material.side = T.BackSide; bnd2.position.y = 1.43; g.add(bnd2);
    var cap = new T.Mesh(new T.SphereGeometry(0.2, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), black); cap.position.y = 1.43; cap.scale.y = 0.45; cap.castShadow = true; g.add(cap);
    var knob = new T.Mesh(new T.SphereGeometry(0.03, 12, 8), chrome); knob.position.y = 1.5; g.add(knob);
    var ch = chainsGeometry(); basketObj = { group: g, chain: ch };
    var links = new T.InstancedMesh(new T.TorusGeometry(0.5, 0.15, 5, 10), new T.MeshStandardMaterial({ color: 0xc4cad1, metalness: 1, roughness: 0.34, envMapIntensity: 1.1 }), ch.N * ch.S * 2); links.frustumCulled = false; g.add(links); basketObj.links = links;
    // a tall pennant so the basket can be found from the tee
    var fp = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 5.2, 6), new T.MeshStandardMaterial({ color: 0xeeeeee })); fp.position.set(-0.7, 2.6, 0); g.add(fp);
    var sh = new T.Shape(); sh.moveTo(0, 0); sh.lineTo(1.1, -0.28); sh.lineTo(0, -0.56); var flag = new T.Mesh(new T.ShapeGeometry(sh), new T.MeshBasicMaterial({ color: 0xff2a35, side: T.DoubleSide })); flag.position.set(-0.7, 5.15, 0); basketObj.flag = flag; g.add(flag);
    return g;
  }
  function updateChains(t, amp) {
    var ch = basketObj.chain, N = ch.N, S = ch.S, a = ch.arr, o = 0;
    for (var tier = 0; tier < 2; tier++) {
      for (var i = 0; i < N; i++) {
        var ang = i / N * Math.PI * 2 + (tier ? 0.13 : 0), cx = Math.cos(ang), sz = Math.sin(ang), prev = null;
        var yTop = tier ? 1.02 : 1.4, yBot = tier ? 0.74 : 1.02, rTop = tier ? 0.34 : 0.205, rBot = tier ? 0.2 : 0.34;
        for (var s = 0; s <= S; s++) {
          var f = s / S, y = mix(yTop, yBot, f), r = mix(rTop, rBot, f) + 0.012 * Math.sin(f * 3.14), sway = amp * 0.09 * Math.sin(t * 14 + i * 0.9 + f * 5 + tier) * Math.sin(f * 1.5708 + 0.3), tw = amp * 0.05 * Math.cos(t * 11 + i * 1.7) * f;
          var px = cx * (r + sway) - sz * tw, pz = sz * (r + sway) + cx * tw;
          if (prev) { a[o++] = prev[0]; a[o++] = prev[1]; a[o++] = prev[2]; a[o++] = px; a[o++] = y; a[o++] = pz; }
          prev = [px, y, pz];
        }
      }
    }
    var L = basketObj.links; if (L) {
      var m4 = new T.Matrix4(), q1 = new T.Quaternion(), q2 = new T.Quaternion(), qa = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 2), pm = new T.Vector3(), sc = new T.Vector3(), dv = new T.Vector3(), up = new T.Vector3(0, 1, 0), idx = 0;
      for (var k = 0; k < o; k += 6) {
        dv.set(a[k + 3] - a[k], a[k + 4] - a[k + 1], a[k + 5] - a[k + 2]); var ln = dv.length() || 0.01; dv.divideScalar(ln); q1.setFromUnitVectors(up, dv); if (idx & 1) q1.multiply(qa);
        pm.set((a[k] + a[k + 3]) / 2, (a[k + 1] + a[k + 4]) / 2, (a[k + 2] + a[k + 5]) / 2); sc.set(0.0165, ln * 1.5, 0.0165); L.setMatrixAt(idx++, m4.compose(pm, q1, sc));
      }
      L.instanceMatrix.needsUpdate = true;
    }
  }
  function disposeGroup(g) { while (g.children.length) { var c = g.children.pop(); c.traverse && c.traverse(function (o) { if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose(); if (o.material) { var ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(function (m) { if (m.userData && m.userData.keep) return; if (m.map && m.map !== waterTex && !(m.map.userData && m.map.userData.keep)) m.map.dispose(); if (m.normalMap && m.normalMap !== waterNormal) m.normalMap.dispose(); m.dispose(); }); } }); } }

  function paintGround(h) {
    var ymin = -45, ymax = h.basket[1] + 70, span = ymax - ymin, S = 2048, c = document.createElement('canvas'); c.width = c.height = S; var g = c.getContext('2d');
    var sx = S / (MAPX * 2), sy = S / span;
    function X(x) { return (x + MAPX) * sx; } function Y(y) { return (ymax - y) * sy; }
    var Wn = WINTER; g.fillStyle = Wn ? '#dde5ee' : '#2f4a25'; g.fillRect(0, 0, S, S);
    // patchy meadow: big soft blotches of lighter and darker grass
    (function () { var rr = rng(5); for (var q = 0; q < 220; q++) { var qx = rr() * S, qy = rr() * S, qr = (30 + rr() * 110) * (S / 2048); var lg = g.createRadialGradient(qx, qy, 0, qx, qy, qr); var lite = rr() < 0.5; lg.addColorStop(0, Wn ? (lite ? 'rgba(255,255,255,.4)' : 'rgba(150,172,200,.3)') : (lite ? 'rgba(130,160,70,.22)' : 'rgba(20,44,18,.22)')); lg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = lg; g.beginPath(); g.arc(qx, qy, qr, 0, 6.3); g.fill(); } })();
    (function () { var rr = rng(77); for (var q = 0; q < 160; q++) { var qx = rr() * S, qy = rr() * S, qr = (6 + rr() * 26) * (S / 2048), lg = g.createRadialGradient(qx, qy, 0, qx, qy, qr); lg.addColorStop(0, Wn ? (rr() < 0.5 ? 'rgba(120,128,104,.2)' : 'rgba(255,255,255,.3)') : (rr() < 0.55 ? 'rgba(128,116,60,.2)' : 'rgba(70,92,38,.22)')); lg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = lg; g.beginPath(); g.arc(qx, qy, qr, 0, 6.3); g.fill(); } })();
    function pathStroke(wid, color) { g.strokeStyle = color; g.lineWidth = wid * sx; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); h.path.forEach(function (p, i) { if (i) g.lineTo(X(p[0]), Y(p[1])); else g.moveTo(X(p[0]), Y(p[1])); }); g.stroke(); }
    // rough, with a soft edge into the out-of-bounds woods
    g.save(); g.filter = 'blur(' + Math.round(sx * 2.2) + 'px)'; pathStroke(124, Wn ? '#c8d3e0' : '#37532a'); g.restore();
    g.save(); g.filter = 'blur(' + Math.round(sx * 1.2) + 'px)'; pathStroke(h.width + 14, Wn ? '#d6dfe9' : '#46672f'); g.restore();
    // mown fairway with stripes
    var fc = document.createElement('canvas'); fc.width = fc.height = S; var f = fc.getContext('2d');
    f.strokeStyle = Wn ? '#eef3f9' : '#5a8236'; f.lineWidth = h.width * sx; f.lineCap = 'round'; f.lineJoin = 'round'; f.beginPath(); h.path.forEach(function (p, i) { if (i) f.lineTo(X(p[0]), Y(p[1])); else f.moveTo(X(p[0]), Y(p[1])); }); f.stroke();
    f.globalCompositeOperation = 'source-atop'; for (var yy = ymin; yy < ymax; yy += 8) { f.fillStyle = Wn ? ((yy - ymin) / 8 & 1 ? 'rgba(255,255,255,.2)' : 'rgba(140,160,190,.12)') : (((yy - ymin) / 8 & 1) ? 'rgba(220,255,150,.14)' : 'rgba(0,25,0,.16)'); f.fillRect(0, Y(yy + 8), S, 8 * sy + 1); }
    g.save(); g.filter = 'blur(' + Math.round(sx * 0.5) + 'px)'; g.drawImage(fc, 0, 0); g.restore();
    // basket green, tee pad
    var b = h.basket, rg = g.createRadialGradient(X(b[0]), Y(b[1]), 0, X(b[0]), Y(b[1]), 9 * sx); rg.addColorStop(0, Wn ? '#f4f8fc' : '#6f9b47'); rg.addColorStop(0.7, Wn ? '#edf2f8' : '#648e40'); rg.addColorStop(1, 'rgba(110,160,80,0)'); g.fillStyle = rg; g.beginPath(); g.arc(X(b[0]), Y(b[1]), 9 * sx, 0, 6.3); g.fill();
    // water with a muddy bank
    h.water.forEach(function (w) {
      if (w[4] === 'e') {
        g.save(); g.filter = 'blur(' + Math.round(sx * 0.9) + 'px)'; g.fillStyle = Wn ? '#e8eef5' : '#6e5e3e'; g.beginPath(); g.ellipse(X(w[0]), Y(w[1]), (w[2] + 1.8) * sx, (w[3] + 1.8) * sy, 0, 0, 6.3); g.fill(); g.restore();
        g.fillStyle = Wn ? '#a8c7d8' : '#1f5a86'; g.beginPath(); g.ellipse(X(w[0]), Y(w[1]), w[2] * sx, w[3] * sy, 0, 0, 6.3); g.fill(); return;
      }
      g.save(); g.filter = 'blur(' + Math.round(sx * 0.8) + 'px)'; g.fillStyle = Wn ? '#e8eef5' : '#6b5a3c'; g.fillRect(X(w[0]) - 1.6 * sx, Y(w[3]) - 1.6 * sy, (w[2] - w[0]) * sx + 3.2 * sx, (w[3] - w[1]) * sy + 3.2 * sy); g.restore();
      g.fillStyle = Wn ? '#a8c7d8' : '#1f5a86'; g.fillRect(X(w[0]), Y(w[3]), (w[2] - w[0]) * sx, (w[3] - w[1]) * sy);
    });
    // island: a bit of rough around the basket
    if (h.island) { var ig = g.createRadialGradient(X(b[0]), Y(b[1]), 0, X(b[0]), Y(b[1]), 7 * sx); ig.addColorStop(0, '#86b95a'); ig.addColorStop(0.8, '#78ab52'); ig.addColorStop(1, 'rgba(110,100,70,.9)'); g.fillStyle = ig; g.beginPath(); g.arc(X(b[0]), Y(b[1]), 7 * sx, 0, 6.3); g.fill(); }
    // worn dirt at the tee and under the basket
    [[h.tee[0], h.tee[1], 2.6], [b[0], b[1], 1.1]].forEach(function (q) { var dg = g.createRadialGradient(X(q[0]), Y(q[1]), 0, X(q[0]), Y(q[1]), q[2] * sx); dg.addColorStop(0, Wn ? 'rgba(96,100,106,.55)' : 'rgba(120,98,62,.7)'); dg.addColorStop(1, Wn ? 'rgba(96,100,106,0)' : 'rgba(120,98,62,0)'); g.fillStyle = dg; g.beginPath(); g.arc(X(q[0]), Y(q[1]), q[2] * sx, 0, 6.3); g.fill(); });
    // soft blob shadows under the trees
    (h.treeList || []).forEach(function (t) { var rr = 2.8 * t.s * sx, rg2 = g.createRadialGradient(X(t.x), Y(t.y), 0, X(t.x), Y(t.y), rr); rg2.addColorStop(0, Wn ? 'rgba(40,58,92,.42)' : 'rgba(8,22,8,.62)'); rg2.addColorStop(1, Wn ? 'rgba(40,58,92,0)' : 'rgba(8,22,8,0)'); g.fillStyle = rg2; g.beginPath(); g.arc(X(t.x), Y(t.y), rr, 0, 6.3); g.fill(); });
    (h.obst || []).forEach(function (o) { var rr3 = (o.r * 1.9) * sx, rg3 = g.createRadialGradient(X(o.x), Y(o.y), 0, X(o.x), Y(o.y), rr3); rg3.addColorStop(0, Wn ? 'rgba(40,58,92,.4)' : 'rgba(8,22,8,.6)'); rg3.addColorStop(1, Wn ? 'rgba(40,58,92,0)' : 'rgba(8,22,8,0)'); g.fillStyle = rg3; g.beginPath(); g.arc(X(o.x), Y(o.y), rr3, 0, 6.3); g.fill(); });
    (function () { var rr = rng(91 + h.name.length); for (var q = 0; q < 420; q++) { var qx = rr() * S, qy = rr() * S; if (Wn) { g.fillStyle = rr() < 0.5 ? 'rgba(150,128,86,.5)' : 'rgba(120,142,176,.28)'; g.beginPath(); g.ellipse(qx, qy, 0.6 + rr() * 1.4, 0.4 + rr() * 0.8, rr() * 3, 0, 6.3); g.fill(); } else { g.fillStyle = rr() < 0.6 ? 'rgba(250,250,240,.75)' : 'rgba(240,210,70,.7)'; g.beginPath(); g.arc(qx, qy, 0.9 + rr() * 1.3, 0, 6.3); g.fill(); } } })();
    // grain
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.55; g.fillStyle = g.createPattern(noiseTile, 'repeat'); g.save(); g.scale(1.6, 1.6); g.fillRect(0, 0, S / 1.6, S / 1.6); g.restore(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    var tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding; tex.anisotropy = R.capabilities.getMaxAnisotropy(); tex.generateMipmaps = true; tex.minFilter = T.LinearMipmapLinearFilter;
    return { tex: tex, ymin: ymin, ymax: ymax, span: span };
  }

  var treeMeshes = [], detailTex = null, leafTex = null;
  function grassDetailCanvas() {
    var c = document.createElement('canvas'); c.width = c.height = 256; var g = c.getContext('2d'), r = rng(404); g.fillStyle = '#b4b4b4'; g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 9000; i++) { var x = r() * 256, y = r() * 256, l = 3 + r() * 9, a = -1.2 + r() * 2.4 - 1.57, v = 60 + Math.floor(r() * 190); g.strokeStyle = 'rgba(' + v + ',' + Math.min(255, v + 18) + ',' + Math.max(0, v - 40) + ',.55)'; g.lineWidth = 0.8 + r(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    return c;
  }
  function leafCanvas() {
    var c = document.createElement('canvas'); c.width = c.height = 256; var g = c.getContext('2d'), r = rng(808); g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 2600; i++) { var v = 120 + Math.floor(r() * 135); g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',.75)'; g.beginPath(); g.ellipse(r() * 256, r() * 256, 2 + r() * 4, 1 + r() * 3, r() * 3, 0, 6.3); g.fill(); }
    return c;
  }
  var _noiseT = null; function noiseTex() { if (!_noiseT) { _noiseT = new T.CanvasTexture(noiseTile); _noiseT.wrapS = _noiseT.wrapT = T.RepeatWrapping; _noiseT.encoding = T.sRGBEncoding; } return _noiseT; }
  var _tuftT = null; function tuftTex() { if (!_tuftT) { var c = document.createElement('canvas'); c.width = c.height = 256; var g = c.getContext('2d'), r = rng(9); for (var i = 0; i < 140; i++) { var x = 128 + (r() - 0.5) * 200, h2 = 90 + r() * 150, lean = (r() - 0.5) * 80, v = r(), w0 = 1.6 + r() * 2.6; var gr = g.createLinearGradient(0, 256, 0, 256 - h2); gr.addColorStop(0, 'hsl(' + (92 + v * 12) + ',40%,' + (16 + v * 8) + '%)'); gr.addColorStop(1, 'hsl(' + (70 + v * 26) + ',50%,' + (40 + v * 22) + '%)'); g.fillStyle = gr; g.beginPath(); g.moveTo(x - w0, 256); g.quadraticCurveTo(x + lean * 0.25 - w0 * 0.6, 256 - h2 * 0.6, x + lean, 256 - h2); g.quadraticCurveTo(x + lean * 0.3 + w0 * 0.6, 256 - h2 * 0.5, x + w0, 256); g.fill(); } _tuftT = new T.CanvasTexture(c); _tuftT.encoding = T.sRGBEncoding; _tuftT.anisotropy = 4; } return _tuftT; }
  function tuftGeo() { var g1 = new T.PlaneGeometry(0.5, 0.5).translate(0, 0.25, 0), g2 = g1.clone().rotateY(Math.PI / 2), g3 = g1.clone().rotateY(Math.PI / 4); var m = new T.BufferGeometry(); var pos = [], uv = [], idx = [], off = 0; [g1, g2, g3].forEach(function (g) { var p = g.attributes.position, u = g.attributes.uv; for (var i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); uv.push(u.getX(i), u.getY(i)); } g.index.array.forEach(function (ix) { idx.push(ix + off); }); off += p.count; }); m.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); m.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); m.setIndex(idx); m.computeVertexNormals(); return m; }
  function smoothNormals(geo, bias) { var p = geo.attributes.position, n = new Float32Array(p.count * 3); for (var i = 0; i < p.count; i++) { var x = p.getX(i), y = p.getY(i) - (bias ? 0.5 : 0), z = p.getZ(i), l = Math.hypot(x, bias ? y * 0.0 + 0.45 : y, z) || 1; n[i * 3] = x / l; n[i * 3 + 1] = (bias ? 0.45 : y) / l; n[i * 3 + 2] = z / l; } geo.setAttribute('normal', new T.BufferAttribute(n, 3)); return geo; }
  function jitterGeo(geo, amt, seed) { var r = rng(seed), p = geo.attributes.position, map = {}; for (var i = 0; i < p.count; i++) { var k = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3); if (!map[k]) map[k] = [(r() - 0.5) * amt, (r() - 0.5) * amt, (r() - 0.5) * amt]; var d = map[k]; p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]); } geo.computeVertexNormals(); return geo; }
  function groundGeo(gp) {   // the meadow as a gently rolling mesh
    var geo = new T.PlaneGeometry(MAPX * 2, gp.span, MAPX, Math.max(2, Math.round(gp.span / 2.2))), p = geo.attributes.position, cy = (gp.ymin + gp.ymax) / 2;
    for (var i = 0; i < p.count; i++) p.setZ(i, gh(p.getX(i), p.getY(i) + cy));
    geo.computeVertexNormals(); return geo;
  }
  /* ---------- realism pass: leafy canopies, real pine branches, bark, rock, better grass ---------- */
  var LOOK = {};
  function cv(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }
  function leafCardCanvas(seed, hue) {   // a spray of leaves on a transparent card, shaded from the dark inside to the lit outside
    var S = 512, c = cv(S), g = c.getContext('2d'), r = rng(seed);
    function leaf(x, y, len, wid, ang, col, edge) {
      g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = col; g.strokeStyle = edge; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(len * 0.25, -wid, len * 0.75, -wid * 0.8, len, 0); g.bezierCurveTo(len * 0.75, wid * 0.8, len * 0.25, wid, 0, 0); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(255,255,210,.18)'; g.beginPath(); g.moveTo(len * 0.05, 0); g.lineTo(len * 0.9, 0); g.stroke(); g.restore();
    }
    for (var pass = 0; pass < 3; pass++) {
      var n = pass === 0 ? 520 : pass === 1 ? 620 : 460;
      for (var i = 0; i < n; i++) {
        var x = 30 + r() * (S - 60), y = 30 + r() * (S - 60), dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2), d = Math.hypot(dx, dy); if (d > 0.98) continue;
        var lit = 0.35 + pass * 0.3 + (-dx * 0.18 - dy * 0.3) + (r() - 0.5) * 0.25;
        var hh = hue + (r() - 0.5) * 14, ss = 26 + r() * 16, ll = 13 + lit * 31;
        leaf(x, y, 28 + r() * 26, 10 + r() * 9, r() * 6.28, 'hsl(' + hh + ',' + ss + '%,' + ll + '%)', 'hsla(' + hh + ',40%,' + (ll * 0.55) + '%,.7)');
      }
    }
    return c;
  }
  function pineCardCanvas(seed) {   // one branch, stem up the middle, needles sweeping to the tip (v runs trunk to tip, bottom to top)
    var W = 256, H = 512, c = cv(W, H), g = c.getContext('2d'), r = rng(seed);
    g.lineCap = 'round';
    for (var s = 0; s < 3; s++) for (var i = 0; i < 1100; i++) {
      var t = r(), y = H - 16 - t * (H - 40), env = 0.26 + 0.74 * Math.sin((1 - t * 0.85) * 1.5), side = r() < 0.5 ? -1 : 1, len = (30 + r() * 56) * (0.6 + env * 0.6), sweep = 0.55 + r() * 0.5;
      var x0 = W / 2 + (r() - 0.5) * 6, x1 = x0 + side * Math.sin(sweep) * len * env * 1.7, y1 = y - Math.cos(sweep) * len * 0.8;
      var lit = 0.3 + s * 0.28 + r() * 0.3; g.strokeStyle = 'hsl(' + (108 + r() * 22) + ',' + (22 + r() * 14) + '%,' + (10 + lit * 22) + '%)'; g.lineWidth = 1.8 + r() * 1.8;
      g.beginPath(); g.moveTo(x0, y); g.quadraticCurveTo((x0 + x1) / 2, y - 6, x1, y1); g.stroke();
    }
    g.strokeStyle = '#4a3624'; g.lineWidth = 3; g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2, 30); g.stroke();
    return c;
  }
  function barkCanvas(seed, light) {
    var c = cv(256), g = c.getContext('2d'), r = rng(seed); g.fillStyle = light ? '#6b5a49' : '#4b3a2c'; g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 900; i++) { var x = r() * 256, w = 1 + r() * 5, y = r() * 256, h = 20 + r() * 90, v = Math.floor(30 + r() * 70); g.fillStyle = 'rgba(' + v + ',' + (v - 8) + ',' + (v - 16) + ',' + (0.25 + r() * 0.4).toFixed(2) + ')'; g.fillRect(x, y, w, h); if (x + w > 252) g.fillRect(x - 256, y, w, h); }
    for (var k = 0; k < 220; k++) { g.fillStyle = 'rgba(190,175,150,' + (r() * 0.18).toFixed(2) + ')'; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 8 + r() * 30); }
    return c;
  }
  function rockCanvas(seed) {
    var c = cv(256), g = c.getContext('2d'), r = rng(seed); g.fillStyle = '#8b8a85'; g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 2600; i++) { var v = 90 + Math.floor(r() * 110); g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v - 4) + ',' + (0.12 + r() * 0.3).toFixed(2) + ')'; g.beginPath(); g.ellipse(r() * 256, r() * 256, 1 + r() * 7, 1 + r() * 4, r() * 3, 0, 6.3); g.fill(); }
    for (var s = 0; s < 14; s++) { g.strokeStyle = 'rgba(40,38,34,' + (0.1 + r() * 0.2).toFixed(2) + ')'; g.lineWidth = 1 + r() * 2; g.beginPath(); var y0 = r() * 256; g.moveTo(0, y0); for (var x = 0; x <= 256; x += 32) g.lineTo(x, y0 + (r() - 0.5) * 24); g.stroke(); }
    for (var m = 0; m < 70; m++) { g.fillStyle = 'rgba(120,140,70,' + (0.05 + r() * 0.16).toFixed(2) + ')'; g.beginPath(); g.arc(r() * 256, r() * 256, 3 + r() * 14, 0, 6.3); g.fill(); }
    return c;
  }
  function tex(c, o) { o = o || {}; var t = new T.CanvasTexture(c); if (!o.linear) t.encoding = T.sRGBEncoding; t.anisotropy = o.aniso || 4; if (o.repeat) t.wrapS = t.wrapT = T.RepeatWrapping; return t; }
  function look() {
    if (LOOK.ready) return LOOK;
    LOOK.leaf = [tex(leafCardCanvas(11, 98)), tex(leafCardCanvas(12, 84)), tex(leafCardCanvas(13, 108))];
    LOOK.pine = tex(pineCardCanvas(21)); LOOK.bark = tex(barkCanvas(31), { repeat: true }); LOOK.barkLight = tex(barkCanvas(32, true), { repeat: true });
    LOOK.rock = tex(rockCanvas(41), { repeat: true });
    LOOK.leafMats = LOOK.leaf.map(function (t) { return foliageMaterial(t); });
    LOOK.pineMat = foliageMaterial(LOOK.pine);
    LOOK.leafMats.concat([LOOK.pineMat]).forEach(function (m) { m.userData.keep = true; }); LOOK.ready = true; return LOOK;
  }
  function foliageMaterial(map) {
    var m = new T.MeshStandardMaterial({ color: 0xffffff, map: map, vertexColors: true, alphaTest: 0.5, alphaToCoverage: true, roughness: 0.82, metalness: 0, side: T.FrontSide, envMapIntensity: 0.35 });
    m.userData.sway = true; swayify(m, 0.045); return m;
  }
  var swayMats = [];
  function swayify(m, amt) {   // leaves and grass move in the breeze; the shader gets a time value from the render loop
    swayMats.push(m);
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = { value: 0 }; m.userData.sh = sh;
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'uniform float uTime;\nvoid main() {').replace('#include <begin_vertex>',
        '#include <begin_vertex>\n#ifdef USE_INSTANCING\n float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.29;\n#else\n float ph = 0.0;\n#endif\n float wv = ' + (m.userData.grass ? 'uv.y * uv.y' : 'clamp(position.y + 0.15, 0.0, 1.0)') + ';\n transformed.x += sin(uTime * 1.7 + ph + position.y * 2.3) * ' + amt.toFixed(3) + ' * wv;\n transformed.z += cos(uTime * 1.3 + ph * 1.3 + position.x * 2.1) * ' + (amt * 0.7).toFixed(3) + ' * wv;');
    };
  }
  /* a canopy: many leaf cards scattered through a flattened ball, each lit as if it were part of a sphere, darker inside */
  function crownGeo(seed, n, size, flat) {
    var r = rng(seed), pos = [], nor = [], uv = [], col = [], idx = [], vi = 0;
    for (var i = 0; i < n; i++) {
      var x, y, z, l; do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 0.01);
      l = Math.sqrt(l); var rr = 0.4 + 0.6 * Math.sqrt(r()); x = x / l * rr; y = y / l * rr * (flat || 0.8); z = z / l * rr;
      var nx = x * 0.7 + (r() - 0.5) * 0.9, ny = y * 0.7 + 0.45 + (r() - 0.5) * 0.7, nz = z * 0.7 + (r() - 0.5) * 0.9, nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      var ax = Math.abs(ny) > 0.9 ? 1 : 0, ay = ax ? 0 : 1, t1x = ay * nz - 0 * ny, t1y = 0 * nx - ax * nz, t1z = ax * ny - ay * nx, tl = Math.hypot(t1x, t1y, t1z) || 1; t1x /= tl; t1y /= tl; t1z /= tl;
      var t2x = ny * t1z - nz * t1y, t2y = nz * t1x - nx * t1z, t2z = nx * t1y - ny * t1x, ca = Math.cos(r() * 6.28), sa = Math.sin(r() * 6.28);
      var ux = t1x * ca + t2x * sa, uy = t1y * ca + t2y * sa, uz = t1z * ca + t2z * sa, vx = -t1x * sa + t2x * ca, vy = -t1y * sa + t2y * ca, vz = -t1z * sa + t2z * ca, s = size * (0.8 + r() * 0.5) / 2;
      var shade = 0.42 + 0.58 * Math.pow(Math.min(1, Math.hypot(x, y * 1.2, z)), 0.9) + 0.18 * Math.max(0, y) - 0.12 * Math.max(0, -y); shade *= 0.92 + r() * 0.16;
      var sn = Math.hypot(x, y + 0.25, z) || 1, snx = x / sn, sny = (y + 0.25) / sn, snz = z / sn;
      [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]].forEach(function (q) { pos.push(x + (ux * q[0] + vx * q[1]) * s, y + (uy * q[0] + vy * q[1]) * s, z + (uz * q[0] + vz * q[1]) * s); nor.push(snx, sny, snz); uv.push(q[2], q[3]); col.push(shade, shade, shade); });
      idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3); vi += 4;
      [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]].forEach(function (q) { pos.push(x + (ux * q[0] + vx * q[1]) * s, y + (uy * q[0] + vy * q[1]) * s, z + (uz * q[0] + vz * q[1]) * s); nor.push(snx, sny, snz); uv.push(q[2], q[3]); col.push(shade * 0.92, shade * 0.92, shade * 0.92); });
      idx.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2); vi += 4;
    }
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); return g;
  }
  /* a conifer: tiers of drooping branch cards around a central leader (height 1, base radius about 0.5) */
  function pineGeo(seed, low) {
    var r = rng(seed), pos = [], nor = [], uv = [], col = [], idx = [], vi = 0, TIERS = low ? 7 : 9;
    function card(y, ang, L, Wd, droop, shade) {
      var ca = Math.cos(ang), sa = Math.sin(ang), rows = 3;
      for (var side = 0; side < 2; side++) {
        for (var k = 0; k <= rows; k++) {
          var t = k / rows, rad = 0.02 + L * t, yy = y - droop * t * t - 0.012 * (1 - t), w = Wd * (0.35 + 0.65 * Math.sin(Math.min(1, t * 1.15 + 0.1) * 1.5708));
          [-1, 1].forEach(function (sd, j) { var px = ca * rad - sa * w * sd / 2, pz = sa * rad + ca * w * sd / 2; pos.push(px, yy, pz); var nx = ca * 0.5, nz = sa * 0.5, ny = 0.85, nn = Math.hypot(nx, ny, nz); nor.push(nx / nn, ny / nn, nz / nn); uv.push(j, t); var sh = shade * (0.45 + 0.55 * t) * (side ? 0.9 : 1); col.push(sh, sh, sh); });
        }
        for (var k2 = 0; k2 < rows; k2++) { var b = vi + (side * (rows + 1) + k2) * 2; if (side) idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); else idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      }
      vi += (rows + 1) * 4;
    }
    for (var k = 0; k < TIERS; k++) {
      var f = k / (TIERS - 1), y = 0.10 + 0.84 * f, R = 0.55 * Math.pow(1 - f, 0.85) + 0.06, cnt = Math.round((low ? 9 : 11) - 5 * f), off = r() * 6.28;
      for (var i = 0; i < cnt; i++) { var a = off + i / cnt * 6.28 + (r() - 0.5) * 0.25; card(y + (r() - 0.5) * 0.02, a, R * (0.95 + r() * 0.25), R * 0.95, 0.11 * (1 - f * 0.6) + 0.02, 0.8 + r() * 0.3); }
      if (!low || k < 4) for (var j = 0; j < cnt; j++) { var a2 = off + (j + 0.5) / cnt * 6.28; card(y - 0.035, a2, R * 0.78, R * 0.8, 0.09, 0.62 + r() * 0.2); }
    }
    for (var q = 0; q < 6; q++) card(0.985, q / 6 * 6.28 + r(), 0.05, 0.05, 0.015, 1);
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); return g;
  }
  function trunkGeo(flare) {   // tapered trunk with a root flare, height 1 radius 1, UVs wrap the bark
    var g = new T.CylinderGeometry(0.62, 1, 1, 10, 6, true).translate(0, 0.5, 0), p = g.attributes.position;
    for (var i = 0; i < p.count; i++) { var y = p.getY(i), k = 1 + (flare || 0.5) * Math.pow(Math.max(0, 1 - y / 0.12), 2); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    var uv = g.attributes.uv; for (var u = 0; u < uv.count; u++) uv.setXY(u, uv.getX(u) * 2, uv.getY(u) * 3);
    g.computeVertexNormals(); return g;
  }
  function depthFor(map) { return new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map: map, alphaTest: 0.5 }); }
  function mergeGeos(list) {
    var pos = [], nor = [], uv = [], col = [], idx = [], off = 0;
    list.forEach(function (g) { var p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, c = g.attributes.color; for (var i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(u.getX(i), u.getY(i)); col.push(c.getX(i), c.getY(i), c.getZ(i)); } for (var k = 0; k < g.index.count; k++) idx.push(g.index.getX(k) + off); off += p.count; });
    var m = new T.BufferGeometry(); m.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); m.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); m.setAttribute('color', new T.Float32BufferAttribute(col, 3)); m.setIndex(idx); return m;
  }
  function rockGeo() {   // a boulder: a subdivided sphere pushed around with layered noise and flattened on the bottom
    var g = new T.IcosahedronGeometry(1, 4), p = g.attributes.position, r = rng(88), ph = []; for (var q = 0; q < 12; q++) ph.push([r() * 6.28, r() * 6.28, r() * 6.28, 1.4 + r() * 3.2]);
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i), y = p.getY(i), z = p.getZ(i), d = 0; ph.forEach(function (f, k) { d += Math.sin(x * f[3] + f[0]) * Math.sin(y * f[3] * 1.1 + f[1]) * Math.sin(z * f[3] * 0.9 + f[2]) * (0.22 / (1 + k * 0.45)); });
      var rad = 1 + d; if (y < -0.35) { rad *= 0.82 + 0.18 * (1 + y) / 0.65; } p.setXYZ(i, x * rad, Math.max(y * rad, -0.55), z * rad);
    }
    g.computeVertexNormals(); return g;
  }
  var _concT = null;
  function concreteTex() {
    if (_concT) return _concT; var c = cv(256, 512), g = c.getContext('2d'), r = rng(303); g.fillStyle = '#a7a7a1'; g.fillRect(0, 0, 256, 512);
    for (var i = 0; i < 90; i++) { var x = r() * 256, y = r() * 512, rd = 10 + r() * 50, lg = g.createRadialGradient(x, y, 0, x, y, rd), d = r() < 0.5; lg.addColorStop(0, d ? 'rgba(70,70,64,.14)' : 'rgba(225,225,218,.16)'); lg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = lg; g.fillRect(x - rd, y - rd, rd * 2, rd * 2); }
    for (var j = 0; j < 5200; j++) { var v = r() < 0.5 ? 60 : 235; g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v - 6) + ',' + (0.05 + r() * 0.16) + ')'; g.fillRect(r() * 256, r() * 512, 1 + r() * 1.6, 1 + r() * 1.6); }
    g.strokeStyle = 'rgba(40,40,36,.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 256); g.lineTo(256, 256); g.stroke(); g.strokeStyle = 'rgba(255,255,250,.18)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 258); g.lineTo(256, 258); g.stroke();
    g.strokeStyle = 'rgba(60,60,54,.5)'; g.lineWidth = 3; g.strokeRect(1, 1, 254, 510);
    _concT = new T.CanvasTexture(c); _concT.encoding = T.sRGBEncoding; _concT.anisotropy = 8; return _concT;
  }
  function snowify(m, amt, lo, hi) {   // snow settles on whatever faces up
    var prev = m.onBeforeCompile;
    m.onBeforeCompile = function (sh) {
      if (prev) prev(sh);
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying float vSn;\nvoid main() {').replace('#include <begin_vertex>', '#include <begin_vertex>\n vSn = objectNormal.y;');
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying float vSn;\nvoid main() {').replace('#include <map_fragment>', '#include <map_fragment>\n { float sn = smoothstep(' + lo.toFixed(2) + ', ' + hi.toFixed(2) + ', vSn) * ' + amt.toFixed(2) + '; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.94, 1.0), sn); }');
    };
    m.customProgramCacheKey = function () { return 'snow' + amt + lo + hi + (m.userData.sway ? 's' : '') + (m.userData.grass ? 'g' : ''); };
    return m;
  }
  function bareGeo(seed, low) {   // a leafless winter tree: forked branches getting thinner, height 1
    var r = rng(seed), pos = [], nor = [], uv = [], col = [], idx = [], vi = 0, S = 5;
    function tube(ax, ay, az, bx, by, bz, r0, r1, tone, vl) {
      var dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      var ux, uy, uz; if (Math.abs(dy) < 0.9) { ux = -dz; uy = 0; uz = dx; } else { ux = 1; uy = 0; uz = 0; } var un = Math.hypot(ux, uy, uz); ux /= un; uy /= un; uz /= un;
      var vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
      for (var i = 0; i <= S; i++) {
        var a = i / S * 6.2832, c = Math.cos(a), s2 = Math.sin(a), nx = ux * c + vx * s2, ny = uy * c + vy * s2, nz = uz * c + vz * s2, tn = Math.hypot(nx, ny + 0.6, nz);
        pos.push(ax + nx * r0, ay + ny * r0, az + nz * r0, bx + nx * r1, by + ny * r1, bz + nz * r1);
        for (var e = 0; e < 2; e++) { nor.push(nx / tn, (ny + 0.6) / tn, nz / tn); uv.push(i / S * 2, e * vl); col.push(tone, tone, tone); }
      }
      for (var k = 0; k < S; k++) { var b = vi + k * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); } vi += (S + 1) * 2;
    }
    function grow(x, y, z, dx, dy, dz, len, rad, depth, tone) {
      var ex = x + dx * len, ey = y + dy * len, ez = z + dz * len, r1 = rad * 0.68; tube(x, y, z, ex, ey, ez, rad, r1, tone, len * 8);
      if (depth <= 0) return; var n = depth >= 3 ? 3 : (r() < 0.5 ? 3 : 2);
      for (var k = 0; k < n; k++) { var a = r() * 6.28, sp = 0.5 + r() * 0.55, ndx = dx + Math.cos(a) * sp, ndz = dz + Math.sin(a) * sp, ndy = dy * 0.8 + 0.28, nl = Math.hypot(ndx, ndy, ndz); grow(ex, ey, ez, ndx / nl, ndy / nl, ndz / nl, len * (0.7 + r() * 0.14), r1 * 0.92, depth - 1, tone * 0.97); }
    }
    grow(0, 0, 0, 0, 1, 0, 0.32, 0.034, low ? 4 : 5, 1);
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); return g;
  }
  function snowDetailCanvas() {
    var c = document.createElement('canvas'); c.width = c.height = 256; var g = c.getContext('2d'), r = rng(515); g.fillStyle = '#b0b0b0'; g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 700; i++) { var v = r() < 0.5 ? 150 : 205, rd = 4 + r() * 16, x = r() * 256, y = r() * 256, lg = g.createRadialGradient(x, y, 0, x, y, rd); lg.addColorStop(0, 'rgba(' + v + ',' + v + ',' + (v + 8) + ',.35)'); lg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = lg; g.fillRect(x - rd, y - rd, rd * 2, rd * 2); }
    for (var j = 0; j < 2600; j++) { var w = r() < 0.7 ? 255 : 110; g.fillStyle = 'rgba(' + w + ',' + w + ',' + w + ',' + (0.35 + r() * 0.5) + ')'; g.fillRect(r() * 256, r() * 256, 1 + r() * 1.2, 1 + r() * 1.2); }
    return c;
  }
  function buildCourse(h) {
    WINTER = !!(COURSE && COURSE.theme === 'winter'); applyTheme(WINTER); syncTod();
    if (curBuilt === G.hole && courseGroup.children.length) return; curBuilt = G.hole;
    disposeGroup(courseGroup); treeMeshes = []; waterMats = [];
    // ground
    var gp = paintGround(h), gmat = new T.MeshStandardMaterial({ map: gp.tex, roughness: 0.96, metalness: 0 }), ground = new T.Mesh(groundGeo(gp), gmat);
    if (!detailTex) { detailTex = new T.CanvasTexture(grassDetailCanvas()); detailTex.wrapS = detailTex.wrapT = T.RepeatWrapping; detailTex.anisotropy = 4; }
    if (!winDetail) { winDetail = new T.CanvasTexture(snowDetailCanvas()); winDetail.wrapS = winDetail.wrapT = T.RepeatWrapping; winDetail.anisotropy = 4; }
    var dsc = !WINTER && grassPhoto ? 2.6 : 1.1; groundSpan = gp.span;
    gmat.onBeforeCompile = function (sh) { sh.uniforms.detailMap = groundU = { value: WINTER ? winDetail : (grassPhoto || detailTex) }; sh.uniforms.detailRep = groundRepU = { value: new T.Vector2(MAPX * 2 / dsc, gp.span / dsc) };
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform sampler2D detailMap; uniform vec2 detailRep;\nvoid main() {').replace('#include <map_fragment>', '#include <map_fragment>\n float dd = clamp(1.0 - length(vViewPosition) / 60.0, 0.0, 1.0); vec3 dtl = mix(texture2D(detailMap, vUv * detailRep).rgb, texture2D(detailMap, vUv * detailRep * 0.21 + vec2(0.37)).rgb, 0.45); diffuseColor.rgb *= mix(vec3(1.0), dtl * 1.45, dd * 0.95);'); };
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -(gp.ymin + gp.ymax) / 2); ground.receiveShadow = true; courseGroup.add(ground);
    var far = new T.Mesh(new T.PlaneGeometry(4000, 4000), new T.MeshBasicMaterial({ color: WINTER ? 0xdde4eb : 0x4a6a35 })); far.rotation.x = -Math.PI / 2; far.position.y = -0.6; courseGroup.add(far);
    // water surfaces
    h.water.forEach(function (w) {
      var ell = w[4] === 'e', wt = waterNormal.clone(); wt.needsUpdate = true; wt.repeat.set((ell ? w[2] * 2 : w[2] - w[0]) / 5, (ell ? w[3] * 2 : w[3] - w[1]) / 5);
      var m = WINTER ? new T.MeshStandardMaterial({ color: 0xb7d4e4, roughness: 0.22, metalness: 0.02, transparent: true, opacity: 0.97, normalMap: wt, normalScale: new T.Vector2(0.1, 0.1), envMapIntensity: 0.7 }) : new T.MeshStandardMaterial({ color: 0x174f63, roughness: 0.05, metalness: 0.08, transparent: true, opacity: 0.92, normalMap: wt, normalScale: new T.Vector2(0.6, 0.6), envMapIntensity: 0.95 }); waterMats.push(m);
      var mesh;
      if (ell) { mesh = new T.Mesh(new T.CircleGeometry(1, 64), m); mesh.scale.set(w[2], w[3], 1); mesh.rotation.x = -Math.PI / 2; mesh.position.set(w[0], (w.lvl || 0) + 0.035, -w[1]); }
      else { mesh = new T.Mesh(new T.PlaneGeometry(w[2] - w[0], w[3] - w[1]), m); mesh.rotation.x = -Math.PI / 2; mesh.position.set((w[0] + w[2]) / 2, (w.lvl || 0) + 0.035, -(w[1] + w[3]) / 2); }
      courseGroup.add(mesh);
    });
    // trees: layered conifers and broadleaf canopies made of leaf cards, with bark trunks, instanced
    var LK = look(), tl = h.treeList, m4 = new T.Matrix4(), ps = new T.Vector3(), sc = new T.Vector3(), col = new T.Color(), up = new T.Vector3(0, 1, 0);
    var con = tl.filter(function (t) { return t.kind !== 'oak'; }), oak = tl.filter(function (t) { return t.kind === 'oak'; });
    function inst(geo, mat, n, depthMap) { var im = new T.InstancedMesh(geo, mat, Math.max(1, n)); im.count = n; im.castShadow = true; im.receiveShadow = true; if (depthMap) im.customDepthMaterial = depthFor(depthMap); courseGroup.add(im); return im; }
    if (!LOOK.trunk) { LOOK.trunk = trunkGeo(0.55); LOOK.pineG = pineGeo(7, isLow); LOOK.oakG = (function () { var gs = [], r2 = rng(61); [[0, 0, 0.74, 0.22, 1], [0.2, 0, 0.66, 0.2, 2], [-0.1, 0.17, 0.7, 0.2, 3], [-0.12, -0.18, 0.64, 0.19, 4], [0.05, 0.05, 0.9, 0.2, 5], [0.17, -0.2, 0.76, 0.17, 6]].forEach(function (L) { var g = crownGeo(100 + L[4], isLow ? 26 : 40, 0.95, 0.82); g.scale(L[3], L[3], L[3]); g.translate(L[0], L[2], L[1]); gs.push(g); }); return mergeGeos(gs); })(); LOOK.bushG = crownGeo(77, isLow ? 18 : 30, 0.75, 0.7); [LOOK.trunk, LOOK.pineG, LOOK.oakG, LOOK.bushG].forEach(function (g) { g.userData.keep = true; }); }
    var trunkMat = new T.MeshStandardMaterial({ color: 0xffffff, map: LK.bark, bumpMap: LK.bark, bumpScale: 1.6, roughness: 1 }); trunkMat.userData.keep = true; LK.bark.userData.keep = true; LK.rock.userData.keep = true;
    var bare = []; if (WINTER) { bare = oak; oak = []; if (!LOOK.wPine) { LOOK.wPine = snowify(foliageMaterial(LK.pine), 0.88, 0.1, 0.7); LOOK.wPine.userData.keep = true; } }
    var ctr = inst(LOOK.trunk, trunkMat, con.length), pIm = inst(LOOK.pineG, WINTER ? LOOK.wPine : LK.pineMat, con.length, LK.pine);
    con.forEach(function (t, i) {
      var th = t.h * t.s, yq = new T.Quaternion().setFromAxisAngle(up, t.rot);
      ps.set(t.x, t.g - 0.15, -t.y); sc.set(0.3 * (0.8 + 0.4 * t.s), th * 0.55, 0.3 * (0.8 + 0.4 * t.s)); ctr.setMatrixAt(i, m4.compose(ps, yq, sc));
      var wx = 3.0 * (th / 10) * (0.9 + t.tone * 0.2) + 0.25; ps.set(t.x, t.g + 0.2, -t.y); sc.set(wx, th * 0.96, wx); pIm.setMatrixAt(i, m4.compose(ps, yq, sc));
      if (WINTER) col.setRGB(0.5 + t.tone * 0.22, 0.66 + t.tone * 0.2, 0.68 + t.tone * 0.18); else col.setRGB(0.78 + t.tone * 0.3, 0.86 + t.tone * 0.22, 0.74 + t.tone * 0.18); pIm.setColorAt(i, col);
    });
    var og = [[], [], []]; oak.forEach(function (t, i) { og[i % 3].push(t); });
    var oTr = inst(LOOK.trunk, trunkMat, oak.length), oIms = og.map(function (list, v) { return inst(LOOK.oakG, LK.leafMats[v], list.length, LK.leaf[v]); }), oi = 0;
    og.forEach(function (list, v) {
      list.forEach(function (t, i) {
        var th = t.h * t.s * 1.05, yq = new T.Quaternion().setFromAxisAngle(up, t.rot), trunkH = th * 0.5;
        ps.set(t.x, t.g + 0.45 * th * 0.0 - 0.05, -t.y); sc.set(th * 0.9, th, th * 0.9); oIms[v].setMatrixAt(i, m4.compose(ps, yq, sc));
        col.setRGB(0.82 + t.tone * 0.34, 0.9 + t.tone * 0.22, 0.7 + t.tone * 0.2); oIms[v].setColorAt(i, col);
        ps.set(t.x, t.g - 0.15, -t.y); sc.set(0.34 * (0.8 + 0.4 * t.s), trunkH * 1.15, 0.34 * (0.8 + 0.4 * t.s)); oTr.setMatrixAt(oi++, m4.compose(ps, yq, sc));
      });
    });
    [ctr, pIm, oTr].concat(oIms).forEach(function (im) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; });
    if (WINTER && bare.length) {
      if (!LOOK.bareG) { LOOK.bareG = bareGeo(91, isLow); LOOK.bareG.userData.keep = true; }
      if (!LOOK.bareMat) { LOOK.bareMat = snowify(new T.MeshStandardMaterial({ color: 0xffffff, map: LK.barkLight, vertexColors: true, roughness: 1 }), 0.8, 0.05, 0.55); LOOK.bareMat.userData.keep = true; }
      var bIm2 = inst(LOOK.bareG, LOOK.bareMat, bare.length);
      bare.forEach(function (t, i) { var th = t.h * t.s * 1.35, yq = new T.Quaternion().setFromAxisAngle(up, t.rot); ps.set(t.x, t.g - 0.1, -t.y); sc.set(th * 0.95, th, th * 0.95); bIm2.setMatrixAt(i, m4.compose(ps, yq, sc)); });
      bIm2.instanceMatrix.needsUpdate = true;
    }
    // bushes and boulders
    var ob = h.obst || [], bushes = ob.filter(function (o) { return o.kind === 'bush'; }), rocks = ob.filter(function (o) { return o.kind === 'rock'; });
    if (WINTER && !LOOK.wBush) { LOOK.wBush = snowify(foliageMaterial(LK.leaf[2]), 0.9, 0.05, 0.5); LOOK.wBush.color.set(0xb89c80); LOOK.wBush.userData.keep = true; }
    var bIm = inst(LOOK.bushG, WINTER ? LOOK.wBush : LK.leafMats[2], bushes.length);
    bushes.forEach(function (o, i) { var rad = o.r * 1.15; ps.set(o.x, rad * 0.5 + o.g, -o.y); sc.set(rad, rad * 0.9, rad); bIm.setMatrixAt(i, m4.compose(ps, new T.Quaternion().setFromAxisAngle(up, o.x * 7.1), sc)); col.setRGB(0.7 + (i % 4) * 0.08, 0.82 + (i % 3) * 0.06, 0.62); bIm.setColorAt(i, col); });
    if (!LOOK.rockG) { LOOK.rockG = rockGeo(); LOOK.rockG.userData.keep = true; }
    var rockMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, map: LK.rock, bumpMap: LK.rock, bumpScale: 2.2, envMapIntensity: 0.6 }); if (WINTER) snowify(rockMat, 0.95, 0.3, 0.75); var
      rIm0 = 0,  rIm = inst(LOOK.rockG, rockMat, rocks.length);
    rocks.forEach(function (o, i) { ps.set(o.x, o.r * 0.38 + o.g - 0.05, -o.y); sc.set(o.r, o.r * 0.78, o.r * 0.9); rIm.setMatrixAt(i, m4.compose(ps, new T.Quaternion().setFromAxisAngle(up, o.x * 3.1), sc)); var gv = 0.82 + (i % 3) * 0.1; col.setRGB(gv, gv * 0.98, gv * 0.94); rIm.setColorAt(i, col); });
    [bIm, rIm].forEach(function (im) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; });
    // grass: tufts of blades through the rough and along the fairway edge, swaying a little
    var tufts = [], rg = rng(555 + G.hole * 13), tn = (isLow ? 5200 : 17000) * (WINTER ? 0.4 : 1);
    for (var ti = 0; ti < tn; ti++) { var f0 = rg(), q0 = pathAt(h, f0), lat = (rg() - 0.5) * (h.width + 46), tx0 = q0.x + q0.hy * lat, ty0 = q0.y - q0.hx * lat; if (inWater(h, tx0, ty0) || Math.hypot(tx0 - h.tee[0], ty0 - h.tee[1]) < 1.6) continue; if (Math.abs(lat) < h.width / 2 - 1 && rg() < 0.86) continue; tufts.push([tx0, ty0, rg()]); }
    if (!LOOK.tuftMat) { LOOK.tuftMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: T.DoubleSide, alphaTest: 0.45, alphaToCoverage: true, map: tuftTex() }); LOOK.tuftMat.userData.grass = true; LOOK.tuftMat.userData.keep = true; _tuftT.userData.keep = true; swayify(LOOK.tuftMat, 0.12); }
    var tIm = new T.InstancedMesh(tuftGeo(), LOOK.tuftMat, tufts.length); tIm.receiveShadow = true;
    tufts.forEach(function (q, i) { var sz = 0.26 + q[2] * 0.46; ps.set(q[0], gh(q[0], q[1]) - 0.02, -q[1]); sc.set(sz, sz * (0.75 + q[2] * 0.6) * (WINTER ? 0.7 : 1), sz); tIm.setMatrixAt(i, m4.compose(ps, new T.Quaternion().setFromAxisAngle(up, q[2] * 12), sc)); if (WINTER) col.setRGB(1.0 + q[2] * 0.25, 0.82 + q[2] * 0.18, 0.5 + q[2] * 0.1); else if (q[2] > 0.82) col.setRGB(1.25, 1.05, 0.55); else col.setRGB(0.72 + q[2] * 0.3, 0.8 + q[2] * 0.26, 0.55 + q[2] * 0.25); tIm.setColorAt(i, col); });
    tIm.instanceMatrix.needsUpdate = true; if (tIm.instanceColor) tIm.instanceColor.needsUpdate = true; courseGroup.add(tIm);
    // tee pad
    var th0 = Math.atan2(h.path[1][0] - h.path[0][0], h.path[1][1] - h.path[0][1]), pad = new T.Mesh(new T.BoxGeometry(1.8, 0.05, 3.6), new T.MeshStandardMaterial({ color: WINTER ? 0xdfe3ea : 0xd0d0cc, map: concreteTex(), bumpMap: concreteTex(), bumpScale: 0.25, roughness: 0.95 }));
    pad.position.set(h.tee[0], h.tz + 0.025, -h.tee[1]); pad.rotation.y = -th0; pad.receiveShadow = true; courseGroup.add(pad);
    // tee sign: hole number, par and distance
    (function () {
      var c = document.createElement('canvas'); c.width = 256; c.height = 160; var g = c.getContext('2d'); g.fillStyle = '#1d4a2a'; g.fillRect(0, 0, 256, 160); g.strokeStyle = '#f3efe2'; g.lineWidth = 6; g.strokeRect(6, 6, 244, 148);
      g.fillStyle = '#f3efe2'; g.textAlign = 'center'; g.font = '800 70px system-ui, sans-serif'; g.fillText(String(G.hole + 1), 128, 78); g.font = '700 26px system-ui, sans-serif'; g.fillText('PAR ' + h.par + '  ' + Math.round(Math.hypot(h.basket[0] - h.tee[0], h.basket[1] - h.tee[1])) + ' m', 128, 118); g.font = '600 15px system-ui, sans-serif'; g.fillText(h.name.toUpperCase(), 128, 142);
      var tx = new T.CanvasTexture(c); tx.encoding = T.sRGBEncoding; var hd = Math.atan2(h.path[1][0] - h.path[0][0], h.path[1][1] - h.path[0][1]);
      var sg = new T.Group(), post = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 1.3, 8), new T.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1 })); post.position.y = 0.65; post.castShadow = true; sg.add(post);
      var bd = new T.Mesh(new T.BoxGeometry(0.9, 0.56, 0.05), new T.MeshStandardMaterial({ map: tx, roughness: 0.7 })); bd.position.y = 1.25; bd.castShadow = true; sg.add(bd);
      sg.position.set(h.tee[0] - Math.cos(hd) * 2.1, gh(h.tee[0] - Math.cos(hd) * 2.1, h.tee[1] + Math.sin(hd) * 2.1), -(h.tee[1] + Math.sin(hd) * 2.1)); sg.rotation.y = -hd + 0.35; courseGroup.add(sg);
    })();
    // basket
    var bk = makeBasket(); bk.position.set(h.basket[0], h.bz, -h.basket[1]); courseGroup.add(bk); updateChains(0, 0);
    ensureDog(); ensureRipples(); spawnLife(h); buildLifeProps(h);
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

  function launchPreview(hy, la) {
    if (puttMode()) { var pz = PSTYLE === 'pizza', sp = P.launch(G.lie[0], G.lie[1], disc, idealPw(distToBasket(), pz), aim(), 0, pz ? 0.2 : 0.07, spin, 0); if (pz) { sp.pizza = true; sp.bank = 0; } return sp; }
    return P.launch(G.lie[0], G.lie[1], disc, pull ? Math.max(0.06, pull.p) : charging ? chargeLevel() : CAP < 1 ? CAP : 0.85, aim(), hy, la, spin, 0);
  }
  function pathFrom(s, pm) {   // the flight a launched disc would take (wind included, no throwing error), as [x, y, height] points
    var w = wind(), bx = G.h.basket[0], by = G.h.basket[1], step = 0, out;
    s.p[2] = gh(G.lie[0], G.lie[1]) + 1.2; out = [[s.p[0], s.p[1], s.p[2]]];
    while (s.p[2] > gh(s.p[0], s.p[1]) && s.t < 12 && out.length < PREVN && !(pm && Math.hypot(s.p[0] - bx, s.p[1] - by) < 0.35)) { P.step(s, 1 / 120, w); if (++step % (pm ? 8 : 5) === 0) out.push([s.p[0], s.p[1], Math.max(gh(s.p[0], s.p[1]) + 0.04, s.p[2])]); }
    out.push([s.p[0], s.p[1], gh(s.p[0], s.p[1]) + 0.04]); return out;
  }
  function computePreview() {
    previewDirty = false; if (!G || (G.phase !== 'aim' && G.phase !== 'charge') || (puttMode() && !GUIDE)) { G.prevPts = null; return; }
    G.prevPts = pathFrom(launchPreview((+sBank.value) / 57.3, (+sLa.value) / 57.3), puttMode());
  }

  function resize() {
    if (!R) return; var r = stage.getBoundingClientRect(), w = Math.max(200, Math.round(r.width)), h = Math.max(200, Math.round(r.height));
    R.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 0.9 ? 66 : 55; camera.updateProjectionMatrix();
    var d = Math.min(window.devicePixelRatio || 1, 2); hud.width = Math.round(w * d); hud.height = Math.round(h * d); hctx.setTransform(d, 0, 0, d, 0, 0); hud._w = w; hud._h = h;
  }
  if (window.ResizeObserver) new ResizeObserver(function () { resize(); }).observe(stage); window.addEventListener('resize', resize);

  /* ---------- HUD (minimap, wind, distance) ---------- */
  var vig = null;
  function drawHud() {
    var W = hud._w, H = hud._h; hctx.clearRect(0, 0, W, H); if (!G) return;
    if (!vig || vig._w !== W || vig._h !== H) { vig = hctx.createRadialGradient(W / 2, H * 0.52, Math.min(W, H) * 0.42, W / 2, H * 0.52, Math.hypot(W, H) * 0.62); vig.addColorStop(0, 'rgba(10,14,8,0)'); vig.addColorStop(1, 'rgba(10,14,8,.38)'); vig._w = W; vig._h = H; }
    hctx.fillStyle = vig; hctx.fillRect(0, 0, W, H);
    var h = G.h, mw = clamp(W * 0.17, 74, 120), mh = mw * 1.35, ox = W - mw - 8, oy = 8;
    hctx.save(); hctx.fillStyle = 'rgba(8,2,6,.78)'; hctx.strokeStyle = 'rgba(255,42,53,.55)'; hctx.lineWidth = 1; hctx.beginPath(); if (hctx.roundRect) hctx.roundRect(ox, oy, mw, mh, 8); else hctx.rect(ox, oy, mw, mh); hctx.fill(); hctx.stroke(); hctx.clip();
    var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9; h.path.forEach(function (p) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); });
    var pad = 22, kx = (mw - 10) / (maxx - minx + 2 * pad), ky = (mh - 10) / (maxy - miny + 14), k = Math.min(kx, ky);
    function M(x, y) { return [ox + mw / 2 + (x - (minx + maxx) / 2) * k, oy + mh - 8 - (y - miny + 4) * k]; }
    hctx.strokeStyle = WINTER ? '#a9bccd' : '#3f7a47'; hctx.lineCap = 'round'; hctx.lineJoin = 'round'; hctx.lineWidth = Math.max(3, h.width * k); hctx.beginPath(); h.path.forEach(function (p, i) { var m = M(p[0], p[1]); if (i) hctx.lineTo(m[0], m[1]); else hctx.moveTo(m[0], m[1]); }); hctx.stroke();
    hctx.fillStyle = '#2f6fe0'; h.water.forEach(function (w) { if (w[4] === 'e') { var c = M(w[0], w[1]); hctx.beginPath(); hctx.ellipse(c[0], c[1], w[2] * k, w[3] * k, 0, 0, 6.3); hctx.fill(); return; } var a = M(w[0], w[3]), b = M(w[2], w[1]); hctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); });
    (h.obst || []).forEach(function (o) { if (o.filler) return; var m = M(o.x, o.y); hctx.fillStyle = o.kind === 'rock' ? '#b9b4ab' : '#4d8a3a'; hctx.beginPath(); hctx.arc(m[0], m[1], 1.5, 0, 6.3); hctx.fill(); });
    hctx.fillStyle = '#143d22'; h.treeList.forEach(function (t) { if (t.big || pathDist(h, t.x, t.y) < h.width / 2 + 8) { var m = M(t.x, t.y); hctx.beginPath(); hctx.arc(m[0], m[1], 1.4, 0, 6.3); hctx.fill(); } });
    hctx.strokeStyle = 'rgba(255,255,255,.6)'; hctx.lineWidth = 1.2; hctx.beginPath(); G.throws.forEach(function (p, i) { var m = M(p[0], p[1]); if (i) hctx.lineTo(m[0], m[1]); else hctx.moveTo(m[0], m[1]); }); if (G.flight) { var fm = M(G.flight.p[0], G.flight.p[1]); hctx.lineTo(fm[0], fm[1]); } hctx.stroke();
    var bm = M(h.basket[0], h.basket[1]); hctx.fillStyle = '#ff2a35'; hctx.beginPath(); hctx.arc(bm[0], bm[1], 3.2, 0, 6.3); hctx.fill();
    var lm = M(G.lie[0], G.lie[1]); hctx.fillStyle = '#fff'; hctx.beginPath(); hctx.arc(lm[0], lm[1], 2.8, 0, 6.3); hctx.fill();
    hctx.restore();
    // wind dial under the chips on the left, with the distance pill beside it
    drawPath(); drawSwipe(); drawPull();
    var wx = G.wind[0], wy = G.wind[1], ws = Math.hypot(wx, wy), ang = Math.atan2(wx, wy) - cam.yaw, cxw = 34, rw = 24, cb = chipsEl.getBoundingClientRect(), sb = stage.getBoundingClientRect(), cyw = Math.max(74, cb.bottom - sb.top + 10 + rw);
    var tt = Math.round(cb.bottom - sb.top + 6 + (W < 600 ? 2 * rw + 8 : 0)); if (toast._top !== tt) { toast._top = tt; toast.style.top = tt + 'px'; }
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
    camera.position.set(cam.x + (sh ? rnd(-sh, sh) * 0.15 : 0), Math.max(cam.z, gh(cam.x, cam.y) + 0.7) + (sh ? rnd(-sh, sh) * 0.1 : 0), -cam.y);
    var cp = Math.cos(cam.pitch); camera.lookAt(cam.x + Math.sin(cam.yaw) * cp, cam.z - Math.sin(cam.pitch), -(cam.y + Math.cos(cam.yaw) * cp));
    var fx = cam.x + Math.sin(cam.yaw) * 14, fz = -(cam.y + Math.cos(cam.yaw) * 14);
    sun.target.position.set(fx, 0, fz); sun.position.set(fx + sunOff[0], sunOff[1], fz + sunOff[2]);   // sun ahead and to the right, low in the sky
    var sky = scene.getObjectByName('sky'); if (sky) sky.position.copy(camera.position);
    // the disc
    discMesh.visible = false; markMeshes.forEach(function (m) { m.visible = false; });
    var d = G.flightDisc || disc;
    if (G.phase === 'fly' && G.flight) { var st = G.flight; paintDisc(discMesh, st.disc); discMesh.position.set(st.p[0], st.p[2], -st.p[1]); discPose(discMesh, st.pizza ? { v: st.v, theta: st.theta, bank: 1.35, spin: st.spin, rot: st.rot } : st, 1.9); discMesh.visible = true; }
    else if (G.phase === 'roll' && G.roll) { var rr = G.roll, kk = clamp(rr.t / rr.dur, 0, 1), e = 1 - (1 - kk) * (1 - kk); paintDisc(discMesh, G.restDisc || disc); flatPose(discMesh, mix(rr.x0, rr.x1, e), mix(rr.y0, rr.y1, e), gh(mix(rr.x0, rr.x1, e), mix(rr.y0, rr.y1, e)) + 0.025, 1.6, 0, rr.rot + kk * 8); discMesh.visible = true; }
    else if (G.phase === 'holed' && G.drop) { var dr = G.drop; dr.t += dt; var kd = clamp(dr.t / 0.45, 0, 1), ez = kd * kd; paintDisc(discMesh, G.flightDisc || disc); flatPose(discMesh, mix(dr.x0, dr.x1, kd), mix(dr.y0, dr.y1, kd), mix(dr.z0, dr.z1, ez), 1.6, 0, dr.t * 3); discMesh.rotation.x = 0; discMesh.visible = true; }
    else if (G.phase === 'aim' || G.phase === 'charge') {   // the disc is held ready, tilted the way the sliders are set
      var a0 = aim(), overhead = puttMode() && PSTYLE === 'pizza', hv = { v: [Math.sin(a0), Math.cos(a0), 0], theta: ((+sLa.value) / 57.3) * 0.6, bank: overhead ? 1.35 : (+sBank.value) / 57.3, spin: spin, rot: simTime * 2 };
      paintDisc(discMesh, disc); discMesh.position.set(G.lie[0] + Math.cos(a0) * 0.5, gh(G.lie[0], G.lie[1]) + (overhead ? 1.7 : 1.05), -(G.lie[1] - Math.sin(a0) * 0.5)); discPose(discMesh, hv, 1.9); discMesh.visible = true;
    }
    else if (G.phase === 'rest') { paintDisc(discMesh, G.restDisc || disc); flatPose(discMesh, G.lie[0], G.lie[1], gh(G.lie[0], G.lie[1]) + 0.03, 1.8, 0, 0); discMesh.visible = true; }
    // earlier lies
    var mi = 0; G.throws.forEach(function (t, i) { if (i === 0 || i === G.throws.length - 1 && G.phase !== 'fly') return; if (mi < markMeshes.length) { var m = markMeshes[mi++]; paintDisc(m, P.DISCS.buzzz); flatPose(m, t[0], t[1], gh(t[0], t[1]) + 0.03, 1.4, i, 0); m.visible = true; } });
    teeRing.visible = G.phase === 'aim' || G.phase === 'charge'; teeRing.position.set(G.lie[0], gh(G.lie[0], G.lie[1]) + 0.06, -G.lie[1]);
    // trail
    var tp = trailGeo.attributes.position.array, tn = Math.min(G.trail.length, TRAILN);
    for (var i2 = 0; i2 < tn; i2++) { var q = G.trail[i2]; tp[i2 * 3] = q[0]; tp[i2 * 3 + 1] = Math.max(gh(q[0], q[1]) + 0.03, q[2]); tp[i2 * 3 + 2] = -q[1]; }
    trailGeo.setDrawRange(0, 0); prevLine.visible = false; prevEnd.visible = false;
    if (previewDirty) computePreview();
    // basket chains rattle, flag flutter, water ripple
    if (G.wob > 0.01) { updateChains(simTime, G.wob); G.wob *= Math.exp(-dt * 1.7); } else if (G.wob) { G.wob = 0; updateChains(0, 0); }
    if (basketObj && basketObj.flag) basketObj.flag.rotation.y = Math.sin(simTime * 3) * 0.25;
    waterMats.forEach(function (m, i) { if (m.normalMap) { m.normalMap.offset.x = (simTime * 0.02) % 1; m.normalMap.offset.y = (simTime * 0.013 + i * 0.3) % 1; } });
    swayMats.forEach(function (m) { if (m.userData.sh) m.userData.sh.uniforms.uTime.value = simTime; });
    if (WINTER && snowPts) {
      var wx2 = G.wind[0] * 0.5, wz2 = -G.wind[1] * 0.5, cxs = camera.position.x, czs = camera.position.z, cys = camera.position.y, N3 = snowVel.length / 2;
      for (var si = 0; si < N3; si++) {
        var k3 = si * 3, vv = snowVel[si * 2], ph2 = snowVel[si * 2 + 1];
        snowPos[k3] += (wx2 + Math.sin(simTime * 0.9 + ph2) * 0.35) * dt; snowPos[k3 + 1] -= vv * dt; snowPos[k3 + 2] += (wz2 + Math.cos(simTime * 0.7 + ph2) * 0.35) * dt;
        var ddx = snowPos[k3] - cxs, ddz = snowPos[k3 + 2] - czs, ddy = snowPos[k3 + 1] - cys;
        if (ddx < -35) snowPos[k3] += 70; else if (ddx > 35) snowPos[k3] -= 70; if (ddz < -35) snowPos[k3 + 2] += 70; else if (ddz > 35) snowPos[k3 + 2] -= 70;
        if (ddy < -3) snowPos[k3 + 1] += 26; else if (ddy > 23) snowPos[k3 + 1] -= 26;
      }
      snowPts.geometry.attributes.position.needsUpdate = true;
    }
    updateLife(dt); tourObjs.forEach(function (o) { o.visible = G.phase === 'tour'; });
    R.render(scene, camera); drawHud();
    if (pull && pull.raw > 0.85) shakePull();
  }
  function frame(now) {
    if (!running) return; var dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
    if (G.phase === 'fly') flightStep(dt);
    else if (G.phase === 'tour') { G.tour.t += dt; if (G.tour.t >= G.tour.dur) endTour(); }
    else if (G.phase === 'roll') { G.roll.t += dt; if (G.roll.t >= G.roll.dur) { var r = G.roll; G.roll = null; rest([r.x1, r.y1]); } }
    else if (G.phase === 'rest' && now - G.rest > 1100) { G.phase = 'aim'; previewDirty = true; syncPutt(); }
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
        ready = true; if (!G) newRound(); else { buildCourse(G.h); placeDog(); snapCam(); beginTour(); } play();
      });
      return;
    }
    if (!G) newRound(); running = true; last = performance.now(); raf = requestAnimationFrame(frame); if (autoFs && autoFs.matches) setFs(true, false);
  }
  function pause() { running = false; cancelAnimationFrame(raf); charging = false; pull = null; stage.classList.remove('dd-pulling'); if (G && G.phase === 'charge') G.phase = 'aim'; if (stage.classList.contains('fs')) setFs(false, false); }
  document.addEventListener('ss:cvgame', function (e) { if (e.detail === 'dd') play(); else pause(); });
  document.addEventListener('ss:route', function (e) { if (e.detail.name !== 'craving') pause(); else if (!root.hidden) play(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); else if (!root.hidden && !document.querySelector('[data-view="craving"]').hidden) play(); });
  window.__dd = function () { return { snap: snapCam, G: G, P: P, HOLES: HOLES, startHole: startHole, award: award, holeOutScore: holeOutScore, doThrow: doThrow, cam: cam, scene: scene, R: R, camera: camera, dog: function () { return dog; }, crits: function () { return crits; }, gh: gh, step: flightStep, pet: function () { return PETS; } }; };
  newRound();
})();
