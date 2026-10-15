/* Kraving Killer game 3: Disc-ipline, a 3D disc golf game with real flight physics (see discphys.js).
   Real disc molds with their published flight numbers, six holes, wind, trees, water, and a basket you have to hit the chains on.
   Pick a disc, aim (drag the view or use the slider), set hyzer / anhyzer and the nose angle, hold THROW to charge, release to throw.
   Rendering is WebGL through Three.js (js/vendor/three.min.js), loaded the first time the game opens. */
(function () {
  var root = document.getElementById('dd'); if (!root || !window.DiscPhys) return;
  var P = DiscPhys, $ = function (id) { return document.getElementById(id); };
  var stage = $('dd-stage'), glc = $('dd-gl'), hud = $('dd-hud'), hctx = hud.getContext('2d');
  var chipsEl = document.querySelector('#dd-stage .dd-chips'), elHole = $('dd-hole'), elPar = $('dd-par'), elStr = $('dd-str'), toast = $('dd-toast'), msgEl = $('dd-msg'), over = $('dd-over'), overT = $('dd-over-t'), overS = $('dd-over-s'), nextBtn = $('dd-next');
  var sBank = $('dd-bank'), sLa = $('dd-la'), sAim = $('dd-aim'), lblBank = $('dd-bank-l'), lblLa = $('dd-la-l'), lblAim = $('dd-aim-l'), throwBtn = $('dd-throw'), handBtn = $('dd-hand'), discsEl = $('dd-discs');
  var capEl = $('dd-cap'), lblCap = $('dd-cap-l'), capBtn = $('dd-capbtn'), capBtnL = $('dd-capbtn-l'), tuneBtn = $('dd-tunebtn'), tunePanel = $('dd-tune'), menuBtn = $('dd-menu'), menuPanel = $('dd-menupanel'), vsEl = $('dd-vs');
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
    { id: 'rampart', name: 'Rampart, Colorado Springs', note: '18 holes, 3,638 ft, a mix of long shots and short technical ones in a lightly wooded park. The hills are not in the game yet, only the distances and layout. Look-alike holes: use Edit hole to match the real ones.',
      holes: genCourse(8142, [150, 235, 180, 310, 165, 205, 250, 140, 190, 330, 175, 160, 220, 255, 185, 198, 135, 155], { bendP: 0.45, width: 20, wvar: 8, tight: [], creek: null, density: 0.55 }) }
  ];
  var COURSE = COURSES[0], HOLES = CHALLENGE, HOLE_N = HOLES.length, EDITS = {};
  try { EDITS = JSON.parse(localStorage.getItem('ss-disc-edits') || '{}') || {}; } catch (e) { EDITS = {}; }
  function setCourse(id) {
    COURSE = COURSES.filter(function (c) { return c.id === id; })[0] || COURSES[0]; HOLES = COURSE.holes; HOLE_N = HOLES.length;
    HOLES.forEach(function (h) { h.built = false; });
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
  var G = null, running = false, raf = 0, last = 0, chargeT = 0, charging = false, cam = { x: 0, y: -3, z: 3, yaw: 0, pitch: 0.1 };
  var disc = P.DISCS.destroyer, spin = 1, best = 0, previewDirty = true, ready = false, loading = false, failed = false, simTime = 0;
  try { best = +localStorage.getItem('ss-disc-best') || 0; } catch (e) {}

  function newRound() {
    G = { hole: 0, scores: [], phase: 'aim', strokes: 0, lie: null, prev: null, aimOff: 0, flight: null, trail: [], throws: [], roll: null, rest: 0, done: false, wob: 0, drop: null, chainHit: false, streak: 0, roundPen: 0, holeHits: 0 };
    startHole();
  }
  function startHole() {
    var h = buildHole(G.hole); G.h = h; G.strokes = 0; G.lie = [h.tee[0], h.tee[1]]; G.prev = null; G.throws = [[h.tee[0], h.tee[1]]]; G.trail = []; G.flight = null; G.phase = 'aim'; G.aimOff = 0; G.wind = h.wind; G.wob = 0; G.drop = null; G.chainHit = false; G.holeHits = 0; G.pen = 0;
    pickDiscFor(); aimBase(); syncUi(); over.hidden = true; say('Hole ' + (G.hole + 1) + ': ' + h.name + '. Par ' + h.par + '. ' + Math.round(distToBasket()) + ' m to the basket.' + (PETS === 0 ? ' Your dog is here: tap it to pet it.' : ''));
    if (ready) buildCourse(h);
    if (skipBtn) skipBtn.hidden = true; G.tour = null;
    snapCam(); previewDirty = true; if (ready) { placeDog(); beginTour(); }
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
    lblBank.textContent = bk === 0 ? 'Flat' : (bk > 0 ? 'Hyzer ' + bk + '°' : 'Anhyzer ' + (-bk) + '°');
    lblLa.textContent = la + '°'; lblAim.textContent = am === 0 ? 'Straight' : (am > 0 ? am + '° right' : (-am) + '° left');
    sAim.value = am; handBtn.querySelector('b').textContent = spin === 1 ? 'Backhand' : 'Forehand'; handBtn.setAttribute('aria-pressed', String(spin !== 1));
    if (G) { elHole.textContent = 'Hole ' + (G.hole + 1) + '/' + HOLE_N; elPar.textContent = 'Par ' + G.h.par; elStr.textContent = 'Throws ' + G.strokes; }
    lblCap.textContent = Math.round(CAP * 100) + '%'; capEl.value = Math.round(CAP * 100); capBtnL.textContent = 'Max ' + Math.round(CAP * 100) + '%'; capBtn.classList.toggle('warn', CAP < 1); throwBtn.style.setProperty('--cap', CAP.toFixed(3));
    if (vsEl) { var tot = 0, tp = 0; if (G) { G.scores.forEach(function (sc, i) { tot += sc; tp += HOLES[i].par; }); } var dv = tot - tp; vsEl.textContent = !G || !G.scores.length ? 'E' : (dv === 0 ? 'E' : dv > 0 ? '+' + dv : String(dv)); vsEl.className = 'dd-vs' + (dv < 0 && G && G.scores.length ? ' under' : dv > 0 ? ' over' : ''); }
    previewDirty = true; syncPutt();
  }
  [sBank, sLa].forEach(function (s) { s.addEventListener('input', syncUi); });
  capEl.addEventListener('input', function () { CAP = clamp((+capEl.value) / 100, 0.1, 1); syncUi(); });
  capBtn.addEventListener('click', function () { var st = [1, 0.75, 0.5, 0.25], i = 0; for (var k = 0; k < st.length; k++) if (Math.abs(st[k] - CAP) < 0.04) i = k; CAP = st[(i + 1) % st.length]; syncUi(); say('Max power ' + Math.round(CAP * 100) + '%. It resets after your throw.'); });
  function setTune(on) { tunePanel.hidden = !on; tuneBtn.setAttribute('aria-expanded', String(on)); if (on) setDrawer(false); }
  tuneBtn.addEventListener('click', function () { setTune(tunePanel.hidden); setMenu(false); }); $('dd-tune-x').addEventListener('click', function () { setTune(false); });
  function setMenu(on) { menuPanel.hidden = !on; menuBtn.setAttribute('aria-expanded', String(on)); }
  menuBtn.addEventListener('click', function () { setMenu(menuPanel.hidden); setTune(false); setDrawer(false); });
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
  // drag the view to aim
  var dragX = null;
  var dragY = null, noseF = 7;
  glc.addEventListener('pointerdown', function (e) { setDrawer(false); setTune(false); setMenu(false); if (G && G.phase === 'tour') { endTour(); return; } if (G && (G.phase === 'aim' || G.phase === 'rest' || G.phase === 'holed') && pickLife(e)) return; if (G && G.phase === 'aim' && puttMode()) { sw = { pts: [{ x: e.clientX, y: e.clientY, t: performance.now() }] }; try { glc.setPointerCapture(e.pointerId); } catch (x) {} return; } if (G && G.phase === 'aim') { dragX = e.clientX; dragY = e.clientY; noseF = +sLa.value; try { glc.setPointerCapture(e.pointerId); } catch (x) {} } });
  glc.addEventListener('pointermove', function (e) {
    if (dragX === null || !G || G.phase !== 'aim') return; var dx = e.clientX - dragX, dy = e.clientY - dragY, k = 720 / glc.getBoundingClientRect().width; dragX = e.clientX; dragY = e.clientY;
    G.aimOff = clamp(G.aimOff + dx * 0.0035 * k, -0.8, 0.8);
    noseF = clamp(noseF - dy * 0.07 * k, 0, 25); sLa.value = noseF;   // drag up to lift the nose, down to flatten it
    syncUi();
  });
  glc.addEventListener('pointerup', function () { dragX = dragY = null; }); glc.addEventListener('pointercancel', function () { dragX = dragY = null; });

  // charge and throw
  function startCharge() { if (!G || G.phase !== 'aim' || puttMode()) return; setDrawer(false); setTune(false); setMenu(false); charging = true; chargeT = performance.now(); G.phase = 'charge'; }
  function release() { if (!charging) return; charging = false; var pw = chargeLevel(); G.phase = 'aim'; throwBtn.style.setProperty('--pw', 0); var hadCap = CAP < 1; doThrow(pw); CAP = 1; syncUi(); if (hadCap) flash('Power cap reset'); }
  function chargeLevel() { return clamp((performance.now() - chargeT) / 1050, 0.04, CAP); }
  throwBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); try { throwBtn.setPointerCapture(e.pointerId); } catch (x) {} startCharge(); });
  throwBtn.addEventListener('pointerup', release); throwBtn.addEventListener('pointercancel', function () { if (charging) { charging = false; G.phase = 'aim'; throwBtn.style.setProperty('--pw', 0); } });
  throwBtn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('keydown', function (e) {
    if (root.hidden || document.querySelector('[data-view="craving"]').hidden || !G) return;
    var t = e.target; if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
    if (e.key === ' ' && !(t && /^button$/i.test(t.tagName))) { e.preventDefault(); if (!e.repeat) startCharge(); }
    else if (e.key === 'ArrowLeft' && G.phase === 'aim') { G.aimOff = clamp(G.aimOff - 0.02, -0.8, 0.8); syncUi(); }
    else if (e.key === 'ArrowRight' && G.phase === 'aim') { G.aimOff = clamp(G.aimOff + 0.02, -0.8, 0.8); syncUi(); }
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
    G.strokes++; G.prev = [G.lie[0], G.lie[1]];
    var s = P.launch(G.lie[0], G.lie[1], disc, pw, aim(), hy, la, spin, noise); s.p[2] = gh(G.lie[0], G.lie[1]) + 1.2; if (o.pizza) { s.pizza = true; s.bank = 0; s.bank0 = 0; } s.putt = !!o.putt;
    bark(1); if (dog) { dog.still = 0; dog.pet = 0; dog.bounce = 0.5; } G.flight = s; G.trail = [[s.p[0], s.p[1], s.p[2]]]; G.phase = 'fly'; G.hit = null; G.chainHit = false; G.flightDisc = disc; syncUi();
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
    G.roll = { x0: p[0], y0: p[1], x1: fx, y1: fy, t: 0, dur: clamp(Math.hypot(fx - p[0], fy - p[1]) / 6, 0.25, 1.3), bank: s.bank, rot: s.rot }; G.phase = 'roll';
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
    if (G.phase === 'fly' && G.flight) {
      var s = G.flight, hd = Math.atan2(s.v[0], s.v[1]), back = 9, fcx = s.p[0] - Math.sin(hd) * back, fcy = s.p[1] - Math.cos(hd) * back, cz = Math.max(gh(fcx, fcy) + 2.4, s.p[2] + 1.8);
      return { x: fcx, y: fcy, z: cz, yaw: hd, pitch: clamp(Math.atan((cz - s.p[2]) / back) + 0.02, 0.02, 0.5) };
    }
    if (G.phase === 'roll' && G.roll) { var r = G.roll, ha = Math.atan2(r.x1 - r.x0, r.y1 - r.y0); return { x: r.x0 - Math.sin(aim()) * 8, y: r.y0 - Math.cos(aim()) * 8, z: gh(r.x0, r.y0) + 3.2, yaw: cam.yaw, pitch: 0.16 }; }
    if (G.phase === 'holed') { var b = G.h.basket, ya = G.base; return { x: b[0] - Math.sin(ya) * 3.4 + Math.cos(ya) * 1.2, y: b[1] - Math.cos(ya) * 3.4 - Math.sin(ya) * 1.2, z: G.h.bz + 1.7, yaw: Math.atan2(b[0] - (b[0] - Math.sin(ya) * 3.4 + Math.cos(ya) * 1.2), b[1] - (b[1] - Math.cos(ya) * 3.4 - Math.sin(ya) * 1.2)), pitch: 0.17 }; }
    var a = aim(), acx = G.lie[0] - Math.sin(a) * 5.0, acy = G.lie[1] - Math.cos(a) * 5.0; return { x: acx, y: acy, z: Math.max(gh(G.lie[0], G.lie[1]), gh(acx, acy)) + 1.9, yaw: a, pitch: clamp(0.12 - ((+sLa.value) - 7) * 0.014, -0.16, 0.2) };
  }
  function snapCam() { var t = targetCam(); cam = { x: t.x, y: t.y, z: t.z, yaw: t.yaw, pitch: t.pitch }; }
  function moveCam(dt) {
    var t = targetCam(), k = 1 - Math.exp(-dt * (G.phase === 'fly' ? 7 : G.phase === 'tour' ? 9 : G.glide > 0 ? 2.2 : 3.2)); if (G.glide > 0) G.glide -= dt;
    cam.x += (t.x - cam.x) * k; cam.y += (t.y - cam.y) * k; cam.z += (t.z - cam.z) * k; cam.yaw += angDiff(t.yaw, cam.yaw) * k; cam.pitch += (t.pitch - cam.pitch) * k;
  }

  /* ---------- putting: swipe toward the basket; straddle putt or Pizza (turbo) putt ---------- */
  var PUTT_R = 22, PSTYLE = 'putt', GUIDE = true, sw = null, prevHalo = null, ripples = [], _ideal = {};
  try { GUIDE = localStorage.getItem('ss-disc-pguide') !== '0'; } catch (e) {}
  var pstyleBtn = $('dd-pstyle'), puttMsg = $('dd-putmsg'), pguideBtn = $('dd-pguide'), pguideSub = $('dd-pguide-s');
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
  function endSwipe(cancel) {
    if (!sw) return; var pts = sw.pts; sw = null; if (cancel || !G || G.phase !== 'aim' || pts.length < 2) return;
    var si = swipeInfo(pts); if (si.up < 28 || si.len < 34) { say('Swipe up toward the basket. Longer and faster swipes throw harder.'); return; }
    var pz = PSTYLE === 'pizza'; G.aimOff = clamp(si.ang * 0.6, -0.35, 0.35); doThrow(clamp(si.p, 0.05, 1), { la: pz ? 0.2 : 0.07, hy: 0, pizza: pz, putt: true }); CAP = 1; syncUi();
  }
  glc.addEventListener('pointerup', function () { endSwipe(false); }); glc.addEventListener('pointercancel', function () { endSwipe(true); });
  function syncPutt() {
    var r = !!G && distToBasket() <= PUTT_R, on = r && PSTYLE !== 'off' && G.phase !== 'tour';
    stage.classList.toggle('dd-putting', on); stage.classList.toggle('dd-pizza', on && PSTYLE === 'pizza');
    if (pstyleBtn) { pstyleBtn.hidden = !r; pstyleBtn.querySelector('b').textContent = PSTYLE === 'putt' ? 'Putt: Straddle' : PSTYLE === 'pizza' ? 'Putt: Pizza' : 'Regular throw'; }
    if (puttMsg) { puttMsg.hidden = !on; puttMsg.textContent = PSTYLE === 'pizza' ? 'Pizza putt: swipe up to fling it overhead. It spins on its edge and cuts through wind.' : 'Putt: swipe up toward the basket. Longer and faster swipes throw harder.'; }
  }
  if (pstyleBtn) pstyleBtn.addEventListener('click', function () { PSTYLE = PSTYLE === 'putt' ? 'pizza' : PSTYLE === 'pizza' ? 'off' : 'putt'; syncUi(); say(PSTYLE === 'pizza' ? 'Pizza putt: thrown overhead, spinning on its edge. Cuts the wind.' : PSTYLE === 'putt' ? 'Straddle putt: a flat, smooth putt.' : 'Regular throw from here.'); });
  function syncGuide() { if (pguideSub) pguideSub.textContent = GUIDE ? 'Shows the ideal putt line: on' : 'Shows the ideal putt line: off'; }
  if (pguideBtn) pguideBtn.addEventListener('click', function () { GUIDE = !GUIDE; try { localStorage.setItem('ss-disc-pguide', GUIDE ? '1' : '0'); } catch (e) {} syncGuide(); previewDirty = true; });
  syncGuide();
  function drawSwipe() {
    if (!sw || !sw.pts.length) return; var r = glc.getBoundingClientRect(), pts = sw.pts, si = swipeInfo(pts), W = hud._w, Hh = hud._h;
    hctx.save(); hctx.lineCap = 'round'; hctx.lineJoin = 'round';
    hctx.strokeStyle = 'rgba(255,255,255,.9)'; hctx.lineWidth = 8; hctx.beginPath(); pts.forEach(function (q, i) { var x = q.x - r.left, y = q.y - r.top; if (i) hctx.lineTo(x, y); else hctx.moveTo(x, y); }); hctx.stroke();
    hctx.strokeStyle = si.p > 0.85 ? '#ff6a4a' : si.p > 0.5 ? '#ffd23a' : '#3be072'; hctx.lineWidth = 4; hctx.stroke();
    var gx = 26, gy0 = Hh * 0.3, gy1 = Hh * 0.72, gh2 = gy1 - gy0; hctx.fillStyle = 'rgba(8,14,24,.75)'; hctx.fillRect(gx - 9, gy0 - 6, 18, gh2 + 12);
    hctx.fillStyle = si.p > 0.85 ? '#ff6a4a' : si.p > 0.5 ? '#ffd23a' : '#3be072'; hctx.fillRect(gx - 6, gy1 - gh2 * si.p, 12, gh2 * si.p);
    if (GUIDE && G) { var ip = idealPw(distToBasket(), PSTYLE === 'pizza'), ty = gy1 - gh2 * ip; hctx.fillStyle = '#fff'; hctx.fillRect(gx - 14, ty - 1.5, 28, 3); hctx.font = '700 10px system-ui, sans-serif'; hctx.textAlign = 'left'; hctx.fillText('ideal', gx + 16, ty + 3); }
    hctx.fillStyle = '#fff'; hctx.font = '800 13px system-ui, sans-serif'; hctx.textAlign = 'center'; hctx.fillText(Math.round(si.p * 100) + '%', gx, gy0 - 12); hctx.restore();
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
    G.tour = { t: 0, dur: clamp(pathLen(G.h) / 32, 3.8, 8.5) + 1.4, hold: 1.4 }; G.phase = 'tour'; if (skipBtn) skipBtn.hidden = false; setDrawer(false); setTune(false); setMenu(false);
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

  function makeDog() {
    var g = new T.Group(); g.rotation.order = 'YXZ'; var body = new T.Group(); body.position.set(0, 0.4, -0.28); g.add(body);
    var fur = lm(0xf4f1ea, 1), under = lm(0xe6e2d9, 1), blk = lm(0x14100d, 0.4), skin = lm(0xe9a9a4, 0.8), eyeM = lm(0x1b120c, 0.3);
    function ear(sd) { var e = new T.Mesh(new T.ConeGeometry(0.05, 0.14, 4), fur); e.scale.z = 0.4; e.position.set(sd * 0.065, 0.14, -0.02); e.rotation.z = -sd * 0.1; e.rotation.x = 0.12; e.castShadow = true; return e; }
    // trunk: deep chest, tucked waist, muscular hips
    blob(body, fur, 0.17, 0.2, 0.22, 0, 0.1, 0.46, true); blob(body, fur, 0.15, 0.15, 0.24, 0, 0.12, 0.22, true); blob(body, fur, 0.165, 0.17, 0.17, 0, 0.12, -0.02, true); blob(body, under, 0.1, 0.07, 0.3, 0, -0.02, 0.28);
    var neck = blob(body, fur, 0.1, 0.1, 0.2, 0, 0.26, 0.64, true); neck.rotation.x = -0.75;
    // head: egg-shaped skull with a long sloping muzzle (bull terrier), small erect triangle ears
    var head = new T.Group(); head.position.set(0, 0.4, 0.78); body.add(head);
    blob(head, fur, 0.105, 0.105, 0.15, 0, 0, 0, true); var mz = blob(head, fur, 0.065, 0.06, 0.15, 0, -0.045, 0.13, true); mz.rotation.x = 0.3; blob(head, under, 0.05, 0.03, 0.12, 0, -0.085, 0.13);
    blob(head, blk, 0.04, 0.032, 0.036, 0, -0.018, 0.275); head.add(ear(-1)); head.add(ear(1));
    [-1, 1].forEach(function (sd) { var ey = blob(head, eyeM, 0.016, 0.011, 0.022, sd * 0.07, 0.025, 0.095); ey.rotation.z = -sd * 0.5; });
    var tongue = blob(head, skin, 0.025, 0.01, 0.06, 0, -0.098, 0.2); tongue.visible = false;
    // legs: thigh, shin and paw
    var legs = [[-1, 0.52, 0.0], [1, 0.52, 0.0], [-1, -0.02, 0.02], [1, -0.02, 0.02]].map(function (q, i) {
      var pv = new T.Group(); pv.position.set(q[0] * 0.095, q[2], q[1]); var up = new T.Mesh(new T.CylinderGeometry(0.055, 0.04, 0.24, 8), fur); up.position.y = -0.1; up.castShadow = true; pv.add(up);
      var lo = new T.Mesh(new T.CylinderGeometry(0.035, 0.028, 0.22, 8), fur); lo.position.y = -0.3; lo.castShadow = true; pv.add(lo); blob(pv, fur, 0.04, 0.03, 0.06, 0, -0.41, 0.025); body.add(pv); return pv;
    });
    var tail = new T.Group(); tail.position.set(0, 0.2, -0.16); body.add(tail); var tm = new T.Mesh(new T.ConeGeometry(0.04, 0.34, 8), fur); tm.position.set(0, -0.06, -0.12); tm.rotation.x = -1.9; tm.castShadow = true; tail.add(tm);
    var hit = hitSphere(g, 1.3, 0, 0.5, 0.2);
    g.scale.setScalar(1.75); g.userData = { body: body, head: head, legs: legs, tail: tail, tongue: tongue, hit: hit };
    return g;
  }
  var heartTex = null;
  function heartTexture() { if (heartTex) return heartTex; var c = document.createElement('canvas'); c.width = c.height = 64; var g = c.getContext('2d'); g.fillStyle = '#ff3d5e'; g.beginPath(); g.moveTo(32, 56); g.bezierCurveTo(4, 36, 6, 10, 24, 10); g.bezierCurveTo(30, 10, 32, 15, 32, 18); g.bezierCurveTo(32, 15, 34, 10, 40, 10); g.bezierCurveTo(58, 10, 60, 36, 32, 56); g.fill(); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3; g.stroke(); heartTex = new T.CanvasTexture(c); heartTex.encoding = T.sRGBEncoding; return heartTex; }
  function ensureDog() {
    if (dog) return; var g = makeDog(); scene.add(g);
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
  var T, R, scene, camera, sun, hemi, courseGroup, discMesh, markMeshes = [], trailLine, trailGeo, prevLine, prevGeo, prevEnd, teeRing, basketObj, waterMats = [], waterTex, groundTex, curBuilt = -1, noiseTile;
  var TRAILN = 600, PREVN = 220, isLow = (navigator.hardwareConcurrency || 4) < 4 || /Android|iPhone|iPad/i.test(navigator.userAgent);
  function loadThree(cb) {
    if (window.THREE) return cb(true);
    var sc = document.createElement('script'); sc.src = 'js/vendor/three.min.js?v=149'; sc.onload = function () { cb(!!window.THREE); }; sc.onerror = function () { cb(false); }; document.head.appendChild(sc);
  }
  function V(x, y, z) { return new T.Vector3(x, z, -y); }
  function mapV(a) { return [a[0], a[2], -a[1]]; }

  function skyTexture() {
    var W = 1024, Hh = 512, c = document.createElement('canvas'); c.width = W; c.height = Hh; var g = c.getContext('2d'), r = rng(31), gr = g.createLinearGradient(0, 0, 0, Hh);
    gr.addColorStop(0, '#1f4f9c'); gr.addColorStop(0.2, '#3a76c4'); gr.addColorStop(0.38, '#86b4e0'); gr.addColorStop(0.47, '#d5e6f4'); gr.addColorStop(0.5, '#e6eef2'); gr.addColorStop(0.52, '#a9b79c'); gr.addColorStop(1, '#52663a');
    g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
    for (var i = 0; i < 70; i++) {   // soft, flattened cumulus
      var cx = r() * W, cy = 40 + r() * 175, sz = 26 + r() * 62, puffs = 5 + Math.floor(r() * 7), squash = 0.3 + (cy / 215) * 0.15;
      for (var k = 0; k < puffs; k++) {
        var px = cx + (r() - 0.5) * sz * 2.3, py = cy + (r() - 0.5) * sz * 0.5, pr = sz * (0.45 + r() * 0.6), rg = g.createRadialGradient(px, py, 0, px, py, pr);
        rg.addColorStop(0, 'rgba(255,255,255,' + (0.5 + r() * 0.25).toFixed(2) + ')'); rg.addColorStop(0.55, 'rgba(250,252,255,.28)'); rg.addColorStop(1, 'rgba(240,246,255,0)');
        g.save(); g.translate(px, py); g.scale(1, squash + 0.25); g.translate(-px, -py); g.fillStyle = rg; g.beginPath(); g.arc(px, py, pr, 0, 6.3); g.fill(); g.restore();
      }
    }
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.mapping = T.EquirectangularReflectionMapping; return t;
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
    R.outputEncoding = T.sRGBEncoding; R.setPixelRatio(Math.min(window.devicePixelRatio || 1, isLow ? 1.5 : 2));
    R.shadowMap.enabled = true; R.shadowMap.type = isLow ? T.PCFShadowMap : T.PCFSoftShadowMap;
    scene = new T.Scene(); scene.fog = new T.Fog(0xc4d8ea, 90, 820);
    camera = new T.PerspectiveCamera(55, 16 / 10, 0.15, 2500);
    var skyTex = skyTexture();
    var sky = new T.Mesh(new T.SphereGeometry(1800, 32, 20), new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide, fog: false, depthWrite: false })); sky.renderOrder = -2; sky.name = 'sky'; sky.rotation.y = 2.2; scene.add(sky);
    try { var pm = new T.PMREMGenerator(R); scene.environment = pm.fromEquirectangular(skyTex).texture; pm.dispose(); } catch (er) {}
    var glow = new T.Sprite(new T.SpriteMaterial({ map: glowTexture(), fog: false, depthWrite: false, blending: T.AdditiveBlending, transparent: true })); glow.scale.set(430, 430, 1); glow.position.set(917, 768, -1212); glow.name = 'glow'; scene.add(glow);
    [[620, 0x5f7f8c, 36, 5], [900, 0x86a2b4, 60, 2], [1250, 0xa6bccc, 90, 9]].forEach(function (rg, ri) {   // far hills, hazier the further they are
      var N = 120, pos = [], idx = [], rad = rg[0];
      for (var i = 0; i <= N; i++) { var a2 = i / N * Math.PI * 2, hh = rg[2] * (0.5 + 0.28 * Math.sin(a2 * 3 + ri * 1.7 + rg[3]) + 0.2 * Math.sin(a2 * 7.3 + 1 + ri) + 0.1 * Math.sin(a2 * 13 + rg[3]) + 0.06 * Math.sin(a2 * 31)); pos.push(Math.sin(a2) * rad, -8, -Math.cos(a2) * rad, Math.sin(a2) * rad, hh, -Math.cos(a2) * rad); if (i < N) { var k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
      var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      var m = new T.Mesh(g, new T.MeshBasicMaterial({ color: rg[1], side: T.DoubleSide, fog: false })); m.name = 'ridge'; scene.add(m);
    });
    hemi = new T.HemisphereLight(0xcfe2ff, 0x56603a, 0.8); scene.add(hemi);
    sun = new T.DirectionalLight(0xfff0d4, 2.1); sun.castShadow = true; var sz = isLow ? 1024 : 2048; sun.shadow.mapSize.set(sz, sz);
    var sc = sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 260; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
    scene.add(sun); scene.add(sun.target);
    noiseTile = makeNoise(); waterTex = waveTexture();
    discMesh = makeDisc(); scene.add(discMesh);
    for (var i = 0; i < 8; i++) { var m2 = makeDisc(true); m2.visible = false; markMeshes.push(m2); scene.add(m2); }
    trailGeo = new T.BufferGeometry(); trailGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(TRAILN * 3), 3)); trailGeo.setDrawRange(0, 0);
    trailLine = new T.Line(trailGeo, new T.LineBasicMaterial({ color: 0xffd9bd, transparent: true, opacity: 0.7, fog: false })); trailLine.frustumCulled = false; scene.add(trailLine);
    prevGeo = new T.BufferGeometry(); prevGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(PREVN * 3), 3)); prevGeo.setDrawRange(0, 0);
    var dotTex = (function () { var c = document.createElement('canvas'); c.width = c.height = 32; var g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath(); g.arc(16, 16, 14, 0, 6.3); g.fill(); return new T.CanvasTexture(c); })();
    prevHalo = new T.Points(prevGeo, new T.PointsMaterial({ color: 0xffffff, size: 10, sizeAttenuation: false, map: dotTex, alphaTest: 0.4, transparent: true, depthWrite: false, fog: false })); prevHalo.frustumCulled = false; prevHalo.renderOrder = 3; scene.add(prevHalo);
    prevLine = new T.Points(prevGeo, new T.PointsMaterial({ color: 0x08121f, size: 6, sizeAttenuation: false, map: dotTex, alphaTest: 0.4, transparent: true, depthWrite: false, fog: false })); prevLine.frustumCulled = false; prevLine.renderOrder = 4; scene.add(prevLine);
    prevEnd = new T.Mesh(new T.RingGeometry(0.5, 0.75, 28), new T.MeshBasicMaterial({ color: 0x08121f, transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false })); prevEnd.rotation.x = -Math.PI / 2; scene.add(prevEnd);
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
    // two tiers of 24 chains (band to middle ring, middle ring to the lower ring), rebuilt every frame while they rattle
    var N = 24, S = 7, arr = new Float32Array(N * S * 2 * 3 * 2);
    return { N: N, S: S, arr: arr, geo: (function () { var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(arr, 3)); return g; })() };
  }
  function makeBasket() {
    var g = new T.Group(), chrome = new T.MeshStandardMaterial({ color: 0xd6dbe0, metalness: 1, roughness: 0.22, envMapIntensity: 1.2 }), galv = new T.MeshStandardMaterial({ color: 0xaeb4ba, metalness: 0.9, roughness: 0.42, envMapIntensity: 1 }),
      dark = new T.MeshStandardMaterial({ color: 0x23272d, metalness: 0.6, roughness: 0.5 }), band = new T.MeshStandardMaterial({ color: 0xe4a416, roughness: 0.4, metalness: 0.15 }), black = new T.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6, metalness: 0.3 });
    // concrete pad, base plate and the tapered pole
    var pad = new T.Mesh(new T.CylinderGeometry(0.62, 0.66, 0.06, 32), new T.MeshStandardMaterial({ color: 0x9d9a94, roughness: 0.96 })); pad.position.y = 0.02; pad.receiveShadow = true; g.add(pad);
    var plate = new T.Mesh(new T.CylinderGeometry(0.17, 0.2, 0.025, 6), galv); plate.position.y = 0.075; g.add(plate);
    var pole = new T.Mesh(new T.CylinderGeometry(0.036, 0.046, 1.4, 16), galv); pole.position.y = 0.78; pole.castShadow = true; g.add(pole);
    // the catcher dish: a shallow bowl with a rolled rim and a wire grid underneath
    var dishPts = [[0.03, 0.0], [0.12, 0.012], [0.28, 0.058], [0.325, 0.1], [0.332, 0.118], [0.318, 0.112], [0.27, 0.066], [0.12, 0.024], [0.03, 0.014]].map(function (q) { return new T.Vector2(q[0], q[1]); });
    var dish = new T.Mesh(new T.LatheGeometry(dishPts, 48), dark); dish.position.y = 0.6; dish.castShadow = true; dish.receiveShadow = true; g.add(dish);
    var rim = new T.Mesh(new T.TorusGeometry(0.328, 0.011, 8, 56), chrome); rim.rotation.x = Math.PI / 2; rim.position.y = 0.72; rim.castShadow = true; g.add(rim);
    for (var w = 0; w < 18; w++) { var wa = w / 18 * Math.PI * 2, spoke = new T.Mesh(new T.CylinderGeometry(0.004, 0.004, 0.3, 4), chrome); spoke.rotation.z = Math.PI / 2; spoke.rotation.y = -wa; spoke.position.set(Math.cos(wa) * 0.17, 0.665, Math.sin(wa) * 0.17); g.add(spoke); }
    // the outer cage: 24 tines curve up from the dish rim to the top ring
    var ribGeo = [];
    for (var i = 0; i < 12; i++) {
      var a = i / 12 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), curve = new T.CubicBezierCurve3(new T.Vector3(ca * 0.328, 0.72, sa * 0.328), new T.Vector3(ca * 0.322, 0.95, sa * 0.322), new T.Vector3(ca * 0.27, 1.2, sa * 0.27), new T.Vector3(ca * 0.205, 1.4, sa * 0.205));
      var rb = new T.Mesh(new T.TubeGeometry(curve, 10, 0.0085, 6), chrome); rb.castShadow = i % 3 === 0; g.add(rb);
    }
    // middle ring and the top assembly with its yellow band
    var mid = new T.Mesh(new T.TorusGeometry(0.34, 0.007, 6, 56), chrome); mid.rotation.x = Math.PI / 2; mid.position.y = 1.02; g.add(mid);
    var top = new T.Mesh(new T.TorusGeometry(0.205, 0.016, 10, 48), chrome); top.rotation.x = Math.PI / 2; top.position.y = 1.4; top.castShadow = true; g.add(top);
    var bnd = new T.Mesh(new T.CylinderGeometry(0.215, 0.215, 0.07, 48, 1, true), band); bnd.position.y = 1.43; bnd.castShadow = true; g.add(bnd);
    var bnd2 = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 0.07, 48, 1, true), band); bnd2.material = band.clone(); bnd2.material.side = T.BackSide; bnd2.position.y = 1.43; g.add(bnd2);
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
        pm.set((a[k] + a[k + 3]) / 2, (a[k + 1] + a[k + 4]) / 2, (a[k + 2] + a[k + 5]) / 2); sc.set(0.0125, ln * 1.5, 0.0125); L.setMatrixAt(idx++, m4.compose(pm, q1, sc));
      }
      L.instanceMatrix.needsUpdate = true;
    }
  }
  function disposeGroup(g) { while (g.children.length) { var c = g.children.pop(); c.traverse && c.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) { var ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(function (m) { if (m.map && m.map !== waterTex) m.map.dispose(); m.dispose(); }); } }); } }

  function paintGround(h) {
    var ymin = -45, ymax = h.basket[1] + 70, span = ymax - ymin, S = 2048, c = document.createElement('canvas'); c.width = c.height = S; var g = c.getContext('2d');
    var sx = S / (MAPX * 2), sy = S / span;
    function X(x) { return (x + MAPX) * sx; } function Y(y) { return (ymax - y) * sy; }
    g.fillStyle = '#3c5a2c'; g.fillRect(0, 0, S, S);
    // patchy meadow: big soft blotches of lighter and darker grass
    (function () { var rr = rng(5); for (var q = 0; q < 220; q++) { var qx = rr() * S, qy = rr() * S, qr = (30 + rr() * 110) * (S / 2048); var lg = g.createRadialGradient(qx, qy, 0, qx, qy, qr); var lite = rr() < 0.5; lg.addColorStop(0, lite ? 'rgba(130,160,70,.22)' : 'rgba(20,44,18,.22)'); lg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = lg; g.beginPath(); g.arc(qx, qy, qr, 0, 6.3); g.fill(); } })();
    function pathStroke(wid, color) { g.strokeStyle = color; g.lineWidth = wid * sx; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); h.path.forEach(function (p, i) { if (i) g.lineTo(X(p[0]), Y(p[1])); else g.moveTo(X(p[0]), Y(p[1])); }); g.stroke(); }
    // rough, with a soft edge into the out-of-bounds woods
    g.save(); g.filter = 'blur(' + Math.round(sx * 2.2) + 'px)'; pathStroke(124, '#456b33'); g.restore();
    g.save(); g.filter = 'blur(' + Math.round(sx * 1.2) + 'px)'; pathStroke(h.width + 14, '#587f3c'); g.restore();
    // mown fairway with stripes
    var fc = document.createElement('canvas'); fc.width = fc.height = S; var f = fc.getContext('2d');
    f.strokeStyle = '#6f9f45'; f.lineWidth = h.width * sx; f.lineCap = 'round'; f.lineJoin = 'round'; f.beginPath(); h.path.forEach(function (p, i) { if (i) f.lineTo(X(p[0]), Y(p[1])); else f.moveTo(X(p[0]), Y(p[1])); }); f.stroke();
    f.globalCompositeOperation = 'source-atop'; for (var yy = ymin; yy < ymax; yy += 8) { f.fillStyle = ((yy - ymin) / 8 & 1) ? 'rgba(255,255,255,.07)' : 'rgba(0,30,0,.1)'; f.fillRect(0, Y(yy + 8), S, 8 * sy + 1); }
    g.save(); g.filter = 'blur(' + Math.round(sx * 0.5) + 'px)'; g.drawImage(fc, 0, 0); g.restore();
    // basket green, tee pad
    var b = h.basket, rg = g.createRadialGradient(X(b[0]), Y(b[1]), 0, X(b[0]), Y(b[1]), 9 * sx); rg.addColorStop(0, '#86b95a'); rg.addColorStop(0.7, '#78ab52'); rg.addColorStop(1, 'rgba(110,160,80,0)'); g.fillStyle = rg; g.beginPath(); g.arc(X(b[0]), Y(b[1]), 9 * sx, 0, 6.3); g.fill();
    // water with a muddy bank
    h.water.forEach(function (w) {
      if (w[4] === 'e') {
        g.save(); g.filter = 'blur(' + Math.round(sx * 0.9) + 'px)'; g.fillStyle = '#6e5e3e'; g.beginPath(); g.ellipse(X(w[0]), Y(w[1]), (w[2] + 1.8) * sx, (w[3] + 1.8) * sy, 0, 0, 6.3); g.fill(); g.restore();
        g.fillStyle = '#1f5a86'; g.beginPath(); g.ellipse(X(w[0]), Y(w[1]), w[2] * sx, w[3] * sy, 0, 0, 6.3); g.fill(); return;
      }
      g.save(); g.filter = 'blur(' + Math.round(sx * 0.8) + 'px)'; g.fillStyle = '#6b5a3c'; g.fillRect(X(w[0]) - 1.6 * sx, Y(w[3]) - 1.6 * sy, (w[2] - w[0]) * sx + 3.2 * sx, (w[3] - w[1]) * sy + 3.2 * sy); g.restore();
      g.fillStyle = '#1f5a86'; g.fillRect(X(w[0]), Y(w[3]), (w[2] - w[0]) * sx, (w[3] - w[1]) * sy);
    });
    // island: a bit of rough around the basket
    if (h.island) { var ig = g.createRadialGradient(X(b[0]), Y(b[1]), 0, X(b[0]), Y(b[1]), 7 * sx); ig.addColorStop(0, '#86b95a'); ig.addColorStop(0.8, '#78ab52'); ig.addColorStop(1, 'rgba(110,100,70,.9)'); g.fillStyle = ig; g.beginPath(); g.arc(X(b[0]), Y(b[1]), 7 * sx, 0, 6.3); g.fill(); }
    // worn dirt at the tee and under the basket
    [[h.tee[0], h.tee[1], 2.6], [b[0], b[1], 1.1]].forEach(function (q) { var dg = g.createRadialGradient(X(q[0]), Y(q[1]), 0, X(q[0]), Y(q[1]), q[2] * sx); dg.addColorStop(0, 'rgba(120,98,62,.7)'); dg.addColorStop(1, 'rgba(120,98,62,0)'); g.fillStyle = dg; g.beginPath(); g.arc(X(q[0]), Y(q[1]), q[2] * sx, 0, 6.3); g.fill(); });
    // soft blob shadows under the trees
    (h.treeList || []).forEach(function (t) { var rr = 2.8 * t.s * sx, rg2 = g.createRadialGradient(X(t.x), Y(t.y), 0, X(t.x), Y(t.y), rr); rg2.addColorStop(0, 'rgba(8,22,8,.62)'); rg2.addColorStop(1, 'rgba(8,22,8,0)'); g.fillStyle = rg2; g.beginPath(); g.arc(X(t.x), Y(t.y), rr, 0, 6.3); g.fill(); });
    (h.obst || []).forEach(function (o) { var rr3 = (o.r * 1.9) * sx, rg3 = g.createRadialGradient(X(o.x), Y(o.y), 0, X(o.x), Y(o.y), rr3); rg3.addColorStop(0, 'rgba(8,22,8,.6)'); rg3.addColorStop(1, 'rgba(8,22,8,0)'); g.fillStyle = rg3; g.beginPath(); g.arc(X(o.x), Y(o.y), rr3, 0, 6.3); g.fill(); });
    // grain
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.55; g.fillStyle = g.createPattern(noiseTile, 'repeat'); g.save(); g.scale(1.6, 1.6); g.fillRect(0, 0, S / 1.6, S / 1.6); g.restore(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    var tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding; tex.anisotropy = R.capabilities.getMaxAnisotropy(); tex.generateMipmaps = true; tex.minFilter = T.LinearMipmapLinearFilter;
    return { tex: tex, ymin: ymin, ymax: ymax, span: span };
  }

  var treeMeshes = [], detailTex = null, leafTex = null;
  function grassDetailCanvas() {
    var c = document.createElement('canvas'); c.width = c.height = 256; var g = c.getContext('2d'), r = rng(404); g.fillStyle = '#b4b4b4'; g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 5200; i++) { var x = r() * 256, y = r() * 256, l = 3 + r() * 7, a = -1.2 + r() * 2.4 - 1.57, v = 90 + Math.floor(r() * 150); g.strokeStyle = 'rgba(' + v + ',' + Math.min(255, v + 18) + ',' + Math.max(0, v - 40) + ',.55)'; g.lineWidth = 0.8 + r(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    return c;
  }
  function leafCanvas() {
    var c = document.createElement('canvas'); c.width = c.height = 256; var g = c.getContext('2d'), r = rng(808); g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 2600; i++) { var v = 120 + Math.floor(r() * 135); g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',.75)'; g.beginPath(); g.ellipse(r() * 256, r() * 256, 2 + r() * 4, 1 + r() * 3, r() * 3, 0, 6.3); g.fill(); }
    return c;
  }
  var _noiseT = null; function noiseTex() { if (!_noiseT) { _noiseT = new T.CanvasTexture(noiseTile); _noiseT.wrapS = _noiseT.wrapT = T.RepeatWrapping; _noiseT.encoding = T.sRGBEncoding; } return _noiseT; }
  var _tuftT = null; function tuftTex() { if (!_tuftT) { var c = document.createElement('canvas'); c.width = c.height = 128; var g = c.getContext('2d'), r = rng(9); for (var i = 0; i < 26; i++) { var x = 64 + (r() - 0.5) * 80, h2 = 40 + r() * 84, lean = (r() - 0.5) * 40, v = 150 + Math.floor(r() * 100); g.fillStyle = 'rgb(' + (v - 40) + ',' + v + ',' + (v - 90) + ')'; g.beginPath(); g.moveTo(x - 3, 128); g.quadraticCurveTo(x + lean * 0.3, 128 - h2 * 0.6, x + lean, 128 - h2); g.quadraticCurveTo(x + lean * 0.3 + 3, 128 - h2 * 0.5, x + 3, 128); g.fill(); } _tuftT = new T.CanvasTexture(c); _tuftT.encoding = T.sRGBEncoding; } return _tuftT; }
  function tuftGeo() { var g1 = new T.PlaneGeometry(0.5, 0.5).translate(0, 0.25, 0), g2 = g1.clone().rotateY(Math.PI / 2), g3 = g1.clone().rotateY(Math.PI / 4); var m = new T.BufferGeometry(); var pos = [], uv = [], idx = [], off = 0; [g1, g2, g3].forEach(function (g) { var p = g.attributes.position, u = g.attributes.uv; for (var i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); uv.push(u.getX(i), u.getY(i)); } g.index.array.forEach(function (ix) { idx.push(ix + off); }); off += p.count; }); m.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); m.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); m.setIndex(idx); m.computeVertexNormals(); return m; }
  function smoothNormals(geo, bias) { var p = geo.attributes.position, n = new Float32Array(p.count * 3); for (var i = 0; i < p.count; i++) { var x = p.getX(i), y = p.getY(i) - (bias ? 0.5 : 0), z = p.getZ(i), l = Math.hypot(x, bias ? y * 0.0 + 0.45 : y, z) || 1; n[i * 3] = x / l; n[i * 3 + 1] = (bias ? 0.45 : y) / l; n[i * 3 + 2] = z / l; } geo.setAttribute('normal', new T.BufferAttribute(n, 3)); return geo; }
  function jitterGeo(geo, amt, seed) { var r = rng(seed), p = geo.attributes.position, map = {}; for (var i = 0; i < p.count; i++) { var k = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3); if (!map[k]) map[k] = [(r() - 0.5) * amt, (r() - 0.5) * amt, (r() - 0.5) * amt]; var d = map[k]; p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]); } geo.computeVertexNormals(); return geo; }
  function groundGeo(gp) {   // the meadow as a gently rolling mesh
    var geo = new T.PlaneGeometry(MAPX * 2, gp.span, MAPX, Math.max(2, Math.round(gp.span / 2.2))), p = geo.attributes.position, cy = (gp.ymin + gp.ymax) / 2;
    for (var i = 0; i < p.count; i++) p.setZ(i, gh(p.getX(i), p.getY(i) + cy));
    geo.computeVertexNormals(); return geo;
  }
  function buildCourse(h) {
    if (curBuilt === G.hole && courseGroup.children.length) return; curBuilt = G.hole;
    disposeGroup(courseGroup); treeMeshes = []; waterMats = [];
    // ground
    var gp = paintGround(h), gmat = new T.MeshStandardMaterial({ map: gp.tex, roughness: 0.96, metalness: 0 }), ground = new T.Mesh(groundGeo(gp), gmat);
    if (!detailTex) { detailTex = new T.CanvasTexture(grassDetailCanvas()); detailTex.wrapS = detailTex.wrapT = T.RepeatWrapping; detailTex.anisotropy = 4; }
    gmat.onBeforeCompile = function (sh) { sh.uniforms.detailMap = { value: detailTex }; sh.uniforms.detailRep = { value: new T.Vector2(MAPX * 2 / 1.1, gp.span / 1.1) };
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform sampler2D detailMap; uniform vec2 detailRep;\nvoid main() {').replace('#include <map_fragment>', '#include <map_fragment>\n float dd = clamp(1.0 - length(vViewPosition) / 38.0, 0.0, 1.0); vec3 dtl = texture2D(detailMap, vUv * detailRep).rgb; diffuseColor.rgb *= mix(vec3(1.0), dtl * 1.7, dd * 0.85);'); };
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -(gp.ymin + gp.ymax) / 2); ground.receiveShadow = true; courseGroup.add(ground);
    var far = new T.Mesh(new T.PlaneGeometry(4000, 4000), new T.MeshBasicMaterial({ color: 0x4a6a35 })); far.rotation.x = -Math.PI / 2; far.position.y = -0.6; courseGroup.add(far);
    // water surfaces
    h.water.forEach(function (w) {
      var ell = w[4] === 'e', wt = waterTex.clone(); wt.needsUpdate = true; wt.repeat.set((ell ? w[2] * 2 : w[2] - w[0]) / 6, (ell ? w[3] * 2 : w[3] - w[1]) / 6);
      var m = new T.MeshPhongMaterial({ color: 0x2f86b8, specular: 0xffffff, shininess: 140, transparent: true, opacity: 0.88, bumpMap: wt, bumpScale: 1.2 }); waterMats.push(m);
      var mesh;
      if (ell) { mesh = new T.Mesh(new T.CircleGeometry(1, 64), m); mesh.scale.set(w[2], w[3], 1); mesh.rotation.x = -Math.PI / 2; mesh.position.set(w[0], (w.lvl || 0) + 0.035, -w[1]); }
      else { mesh = new T.Mesh(new T.PlaneGeometry(w[2] - w[0], w[3] - w[1]), m); mesh.rotation.x = -Math.PI / 2; mesh.position.set((w[0] + w[2]) / 2, (w.lvl || 0) + 0.035, -(w[1] + w[3]) / 2); }
      courseGroup.add(mesh);
    });
    // trees: conifers (jittered tiers) and broadleaf trees (clustered crowns), instanced
    if (!leafTex) { leafTex = new T.CanvasTexture(leafCanvas()); leafTex.wrapS = leafTex.wrapT = T.RepeatWrapping; leafTex.repeat.set(2, 2); leafTex.encoding = T.sRGBEncoding; }
    var tl = h.treeList, m4 = new T.Matrix4(), ps = new T.Vector3(), sc = new T.Vector3(), col = new T.Color(), up = new T.Vector3(0, 1, 0);
    var con = tl.filter(function (t) { return t.kind !== 'oak'; }), oak = tl.filter(function (t) { return t.kind === 'oak'; });
    var barkMat = new T.MeshStandardMaterial({ color: 0x5a4231, roughness: 1, map: noiseTex() });
    function foliageMat() { return new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, map: leafTex, envMapIntensity: 0.5 }); }
    function inst(geo, mat, n) { var im = new T.InstancedMesh(geo, mat, Math.max(1, n)); im.count = n; im.castShadow = true; im.receiveShadow = false; courseGroup.add(im); return im; }
    var coneG = smoothNormals(jitterGeo(new T.ConeGeometry(1, 1, 12, 2).translate(0, 0.5, 0), 0.14, 17), true);
    var ctr = inst(new T.CylinderGeometry(0.14, 0.3, 1, 8).translate(0, 0.5, 0), barkMat, con.length), ctiers = []; for (var k = 0; k < 5; k++) ctiers.push(inst(coneG, foliageMat(), con.length));
    con.forEach(function (t, i) {
      var th = t.h * t.s, yq = new T.Quaternion().setFromAxisAngle(up, t.rot);
      ps.set(t.x, t.g - 0.15, -t.y); sc.set(1, th * 0.5, 1); ctr.setMatrixAt(i, m4.compose(ps, yq, sc));
      for (var k2 = 0; k2 < 5; k2++) {
        var base = 1.5 + k2 * (th - 2) * 0.17, ht = (th - base) * (k2 === 4 ? 1.0 : 0.5) + 0.5, rad = (1.75 * t.s * (1 - k2 * 0.17) * (th / 10) + 0.25) * (0.92 + ((t.tone * 7 + k2 * 1.7) % 1) * 0.2);
        ps.set(t.x, base + t.g, -t.y); sc.set(rad, ht, rad); ctiers[k2].setMatrixAt(i, m4.compose(ps, new T.Quaternion().setFromAxisAngle(up, t.rot + k2 * 0.9), sc));
        col.setRGB(0.09 + t.tone * 0.07 + k2 * 0.01, 0.23 + t.tone * 0.09 + k2 * 0.018, 0.1 + t.tone * 0.04); ctiers[k2].setColorAt(i, col);
      }
    });
    var blobG = smoothNormals(jitterGeo(new T.IcosahedronGeometry(1, 2), 0.16, 29)), otr = inst(new T.CylinderGeometry(0.2, 0.42, 1, 9).translate(0, 0.5, 0), barkMat, oak.length), blobs = []; for (var k3 = 0; k3 < 6; k3++) blobs.push(inst(blobG, foliageMat(), oak.length));
    oak.forEach(function (t, i) {
      var th = t.h * t.s, yq = new T.Quaternion().setFromAxisAngle(up, t.rot), trunkH = th * 0.42;
      ps.set(t.x, t.g - 0.15, -t.y); sc.set(1, trunkH, 1); otr.setMatrixAt(i, m4.compose(ps, yq, sc));
      for (var k4 = 0; k4 < 6; k4++) {
        var ang = t.rot + k4 * 1.047, ring = k4 < 5 ? 1 : 0, rr = th * 0.2 * ring, bx = t.x + Math.cos(ang) * rr, bz = t.y + Math.sin(ang) * rr, by = trunkH + th * (0.2 + (k4 % 3) * 0.08 + (k4 === 5 ? 0.18 : 0)), br = th * (k4 === 5 ? 0.24 : 0.2) * t.s;
        ps.set(bx, by + t.g, -bz); sc.set(br * 1.1, br * 0.9, br * 1.1); blobs[k4].setMatrixAt(i, m4.compose(ps, yq, sc));
        col.setRGB(0.16 + t.tone * 0.1 + (k4 % 2) * 0.03, 0.34 + t.tone * 0.1 + (k4 % 3) * 0.02, 0.1 + t.tone * 0.04); blobs[k4].setColorAt(i, col);
      }
    });
    [ctr, otr].concat(ctiers, blobs).forEach(function (im) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; });
    // bushes and boulders
    var ob = h.obst || [], bushes = ob.filter(function (o) { return o.kind === 'bush'; }), rocks = ob.filter(function (o) { return o.kind === 'rock'; });
    var bushG = smoothNormals(jitterGeo(new T.IcosahedronGeometry(1, 2), 0.22, 41)), bIm = inst(bushG, foliageMat(), bushes.length * 3);
    bushes.forEach(function (o, i) { for (var q = 0; q < 3; q++) { var a3 = o.x * 7 + q * 2.1, rr = q ? o.r * 0.45 : 0, rad = o.r * (q ? 0.62 : 0.95); ps.set(o.x + Math.cos(a3) * rr, rad * 0.62 + o.g, -(o.y + Math.sin(a3) * rr)); sc.set(rad, rad * 0.72, rad); bIm.setMatrixAt(i * 3 + q, m4.compose(ps, new T.Quaternion().setFromAxisAngle(up, a3), sc)); col.setRGB(0.12 + (i % 4) * 0.03, 0.3 + (q % 2) * 0.05, 0.09); bIm.setColorAt(i * 3 + q, col); } });
    var rockG = jitterGeo(new T.IcosahedronGeometry(1, 1), 0.38, 53), rIm = inst(rockG, new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true, map: noiseTex() }), rocks.length);
    rocks.forEach(function (o, i) { ps.set(o.x, o.r * 0.42 + o.g - 0.05, -o.y); sc.set(o.r, o.r * 0.82, o.r * 0.92); rIm.setMatrixAt(i, m4.compose(ps, new T.Quaternion().setFromAxisAngle(up, o.x * 3.1), sc)); var gv = 0.46 + (i % 3) * 0.07; col.setRGB(gv, gv * 0.97, gv * 0.92); rIm.setColorAt(i, col); });
    [bIm, rIm].forEach(function (im) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; });
    // grass tufts: crossed blades around the fairway edge and through the rough
    var tufts = [], rg = rng(555 + G.hole * 13), tn = isLow ? 2400 : 5200;
    for (var ti = 0; ti < tn; ti++) { var f0 = rg(), q0 = pathAt(h, f0), lat = (rg() - 0.5) * (h.width + 46), tx0 = q0.x + q0.hy * lat, ty0 = q0.y - q0.hx * lat; if (inWater(h, tx0, ty0) || Math.hypot(tx0 - h.tee[0], ty0 - h.tee[1]) < 1.6) continue; if (Math.abs(lat) < h.width / 2 - 1 && rg() < 0.78) continue; tufts.push([tx0, ty0, rg()]); }
    var tuftG = tuftGeo(), tIm = new T.InstancedMesh(tuftG, new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: T.DoubleSide, alphaTest: 0.4, map: tuftTex() }), tufts.length); tIm.receiveShadow = false;
    tufts.forEach(function (q, i) { var sz = 0.5 + q[2] * 0.7; ps.set(q[0], gh(q[0], q[1]) - 0.02, -q[1]); sc.set(sz, sz * (0.8 + q[2] * 0.5), sz); tIm.setMatrixAt(i, m4.compose(ps, new T.Quaternion().setFromAxisAngle(up, q[2] * 12), sc)); col.setRGB(0.26 + q[2] * 0.2, 0.4 + q[2] * 0.2, 0.15 + q[2] * 0.12); tIm.setColorAt(i, col); });
    tIm.instanceMatrix.needsUpdate = true; if (tIm.instanceColor) tIm.instanceColor.needsUpdate = true; courseGroup.add(tIm);
    // tee pad
    var th0 = Math.atan2(h.path[1][0] - h.path[0][0], h.path[1][1] - h.path[0][1]), pad = new T.Mesh(new T.BoxGeometry(1.8, 0.05, 3.6), new T.MeshStandardMaterial({ color: 0x9a9690, roughness: 0.95 }));
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
    return P.launch(G.lie[0], G.lie[1], disc, CAP < 1 ? CAP : 0.85, aim(), hy, la, spin, 0);
  }
  function computePreview() {
    previewDirty = false; if (!G || G.phase !== 'aim' || (puttMode() && !GUIDE)) { prevLine.visible = false; prevEnd.visible = false; return; }
    var hy = (+sBank.value) / 57.3, la = (+sLa.value) / 57.3, s = launchPreview(hy, la), w = wind(), pos = prevGeo.attributes.position.array, n = 0, step = 0, dt = 1 / 120;
    var pm0 = puttMode(), bx0 = G.h.basket[0], by0 = G.h.basket[1]; s.p[2] = gh(G.lie[0], G.lie[1]) + 1.2; pos[0] = s.p[0]; pos[1] = s.p[2]; pos[2] = -s.p[1]; n = 1;
    while (s.p[2] > gh(s.p[0], s.p[1]) && s.t < 12 && n < PREVN && !(pm0 && Math.hypot(s.p[0] - bx0, s.p[1] - by0) < 0.35)) { P.step(s, dt, w); if (++step % (pm0 ? 8 : 5) === 0) { pos[n * 3] = s.p[0]; pos[n * 3 + 1] = Math.max(gh(s.p[0], s.p[1]) + 0.04, s.p[2]); pos[n * 3 + 2] = -s.p[1]; n++; } }
    prevGeo.setDrawRange(0, n); prevGeo.attributes.position.needsUpdate = true; prevLine.visible = true;
    prevEnd.position.set(s.p[0], gh(s.p[0], s.p[1]) + 0.06, -s.p[1]); prevEnd.visible = true;
  }

  function resize() {
    if (!R) return; var r = stage.getBoundingClientRect(), w = Math.max(200, Math.round(r.width)), h = Math.max(200, Math.round(r.height));
    if (prevLine) { var dpr0 = R.getPixelRatio(); prevLine.material.size = 6 * dpr0; prevHalo.material.size = 10.5 * dpr0; }
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
    hctx.fillStyle = '#2f6fe0'; h.water.forEach(function (w) { if (w[4] === 'e') { var c = M(w[0], w[1]); hctx.beginPath(); hctx.ellipse(c[0], c[1], w[2] * k, w[3] * k, 0, 0, 6.3); hctx.fill(); return; } var a = M(w[0], w[3]), b = M(w[2], w[1]); hctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); });
    (h.obst || []).forEach(function (o) { if (o.filler) return; var m = M(o.x, o.y); hctx.fillStyle = o.kind === 'rock' ? '#b9b4ab' : '#4d8a3a'; hctx.beginPath(); hctx.arc(m[0], m[1], 1.5, 0, 6.3); hctx.fill(); });
    hctx.fillStyle = '#143d22'; h.treeList.forEach(function (t) { if (t.big || pathDist(h, t.x, t.y) < h.width / 2 + 8) { var m = M(t.x, t.y); hctx.beginPath(); hctx.arc(m[0], m[1], 1.4, 0, 6.3); hctx.fill(); } });
    hctx.strokeStyle = 'rgba(255,255,255,.6)'; hctx.lineWidth = 1.2; hctx.beginPath(); G.throws.forEach(function (p, i) { var m = M(p[0], p[1]); if (i) hctx.lineTo(m[0], m[1]); else hctx.moveTo(m[0], m[1]); }); if (G.flight) { var fm = M(G.flight.p[0], G.flight.p[1]); hctx.lineTo(fm[0], fm[1]); } hctx.stroke();
    var bm = M(h.basket[0], h.basket[1]); hctx.fillStyle = '#ff2a35'; hctx.beginPath(); hctx.arc(bm[0], bm[1], 3.2, 0, 6.3); hctx.fill();
    var lm = M(G.lie[0], G.lie[1]); hctx.fillStyle = '#fff'; hctx.beginPath(); hctx.arc(lm[0], lm[1], 2.8, 0, 6.3); hctx.fill();
    hctx.restore();
    // wind dial under the chips on the left, with the distance pill beside it
    drawSwipe();
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
    sun.target.position.set(fx, 0, fz); sun.position.set(fx + 62, 70, fz - 82);   // sun ahead and to the right, low in the sky
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
    trailGeo.setDrawRange(0, G.phase === 'aim' || G.phase === 'charge' ? 0 : tn); trailGeo.attributes.position.needsUpdate = true;
    if (previewDirty) computePreview(); prevLine.visible = prevLine.visible && (G.phase === 'aim' || G.phase === 'charge'); prevEnd.visible = prevLine.visible; prevHalo.visible = prevLine.visible;
    // basket chains rattle, flag flutter, water ripple
    if (G.wob > 0.01) { updateChains(simTime, G.wob); G.wob *= Math.exp(-dt * 1.7); } else if (G.wob) { G.wob = 0; updateChains(0, 0); }
    if (basketObj && basketObj.flag) basketObj.flag.rotation.y = Math.sin(simTime * 3) * 0.25;
    waterMats.forEach(function (m, i) { if (m.bumpMap) { m.bumpMap.offset.x = (simTime * 0.02) % 1; m.bumpMap.offset.y = (simTime * 0.013 + i * 0.3) % 1; } });
    updateLife(dt); tourObjs.forEach(function (o) { o.visible = G.phase === 'tour'; });
    R.render(scene, camera); drawHud();
    throwBtn.style.setProperty('--pw', (G.phase === 'charge' || charging) ? chargeLevel().toFixed(3) : 0);
  }
  function frame(now) {
    if (!running) return; var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (G.phase === 'fly') flightStep(dt);
    else if (G.phase === 'tour') { G.tour.t += dt; if (G.tour.t >= G.tour.dur) endTour(); }
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
        ready = true; if (!G) newRound(); else { buildCourse(G.h); placeDog(); snapCam(); beginTour(); } play();
      });
      return;
    }
    if (!G) newRound(); running = true; last = performance.now(); raf = requestAnimationFrame(frame); if (autoFs && autoFs.matches) setFs(true, false);
  }
  function pause() { running = false; cancelAnimationFrame(raf); charging = false; if (G && G.phase === 'charge') G.phase = 'aim'; if (stage.classList.contains('fs')) setFs(false, false); }
  document.addEventListener('ss:cvgame', function (e) { if (e.detail === 'dd') play(); else pause(); });
  document.addEventListener('ss:route', function (e) { if (e.detail.name !== 'craving') pause(); else if (!root.hidden) play(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); else if (!root.hidden && !document.querySelector('[data-view="craving"]').hidden) play(); });
  window.__dd = function () { return { G: G, P: P, HOLES: HOLES, startHole: startHole, award: award, holeOutScore: holeOutScore, doThrow: doThrow, cam: cam, scene: scene, R: R, camera: camera, dog: function () { return dog; }, crits: function () { return crits; }, gh: gh, step: flightStep, pet: function () { return PETS; } }; };
  newRound();
})();
