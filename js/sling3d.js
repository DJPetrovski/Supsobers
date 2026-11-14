/* Smash the Stash, 3D mode. A separate game mode from the classic side-on game: the towers stand in a real 3D field and you
   aim the sling left, right, up and down. How far you pull back sets how hard the chip flies.
   Drawing: three.js. Physics: cannon-es (MIT). Both load only when 3D mode is opened. Original art and code.
   Real units (metres, kilograms, seconds, joules), the same weights and breaking energies as the classic game. */
(function () {
  'use strict';
  var root = document.getElementById('sl'), stage = root && root.querySelector('.sl-stage'); if (!stage) return;
  var T, C, renderer, scene, camera, world, wrap, cv, elName, elLeft, elInfo, elArc, over, onExit = null;
  var objs = [], chips = [], shots = [], parts = [], dots = [], booms = [], lvl = 0, state = 'menu', used = 0, score = 0, armed = false, running = false, raf = 0, last = 0, acc = 0;
  var yaw = 0, arc = 10, pullLen = 0, dragging = null, flyT = 0, quietT = 0, endT = 0, shake = 0, tick = 0, pouch = null, band = null, pts = null, tip = '', tipT = 0, runId = 0;
  var camP = { x: 0, y: 1.5, z: 2.4 }, camL = { x: 0, y: 0.6, z: -5 }, tower = { x: 0, z: -5 };
  var G = 9.81, SPRING = 70, MAXPULL = 0.75, SLING = { x: 0, y: 0.78, z: 0 }, STEP = 1 / 120;
  var S = window.__slSnd || { SND: {}, audio: function () {}, preload: function () {} };
  function snd(n, a, b) { try { if (S.SND[n]) S.SND[n](a, b); } catch (e) {} }

  // kg = weight, hp = joules of impact it can take; sizes are metres (boxes: width, height, depth; cylinders: radius, height)
  var K = {
    crate: { box: [0.2, 0.2, 0.2], kg: 0.6, hp: 18, col: 0xb07a44, m: 'wood', pts: 100 },
    plank: { box: [0.56, 0.04, 0.14], kg: 0.55, hp: 10, col: 0xa46c38, m: 'wood', pts: 100 },
    post: { box: [0.06, 0.4, 0.06], kg: 0.35, hp: 10, col: 0xb9824a, m: 'wood', pts: 100 },
    brick: { box: [0.22, 0.11, 0.11], kg: 2.2, hp: 60, col: 0xa5543c, m: 'brick', pts: 150 },
    keg: { cyl: [0.11, 0.27], kg: 5.6, hp: 150, col: 0x9aa3ad, m: 'steel', pts: 150 },
    tnt: { box: [0.18, 0.18, 0.18], kg: 0.7, hp: 3, col: 0xc8281e, m: 'tnt', pts: 300 },
    beer: { cyl: [0.035, 0.24], kg: 0.55, hp: 1.5, col: 0x7a4316, m: 'glass', pts: 500, t: 1 },
    wine: { cyl: [0.04, 0.3], kg: 1.2, hp: 2.2, col: 0x1f6a43, m: 'glass', pts: 500, t: 1 },
    whiskey: { box: [0.13, 0.2, 0.07], kg: 1.0, hp: 2.0, col: 0xc26d1c, m: 'glass', pts: 500, t: 1 },
    pill: { cyl: [0.045, 0.11], kg: 0.05, hp: 0.12, col: 0xff8a1e, m: 'pill', pts: 500, t: 1 },
    bag: { box: [0.13, 0.08, 0.05], kg: 0.03, hp: 0.08, col: 0xe8f0ff, m: 'bag', pts: 500, t: 1 }
  };
  var P = {
    white: { r: 0.05, kg: 0.12, col: 0xe6e9ee, name: 'White chip' }, red: { r: 0.065, kg: 0.25, col: 0xe23b30, name: 'Red chip' },
    green: { r: 0.075, kg: 0.4, col: 0x2fae4e, name: 'Green chip' }, blue: { r: 0.085, kg: 0.6, col: 0x2f7fe0, name: 'Blue chip' },
    bronze: { r: 0.105, kg: 0.8, col: 0xc8842f, name: 'Bronze chip' }, bomb: { r: 0.08, kg: 0.45, col: 0x18191d, name: 'Truth bomb' }
  };
  // a level is a list of [kind, x (left/right), y (height of its base), z (distance down the range), turn (radians, optional)]
  function stack(k, x, z, n, y0) { var a = [], h = K[k].box ? K[k].box[1] : K[k].cyl[1]; for (var i = 0; i < n; i++) a.push([k, x, (y0 || 0) + i * h, z]); return a; }
  function table(x, z, y) { return [['post', x - 0.22, y, z - 0.04], ['post', x + 0.22, y, z - 0.04], ['post', x - 0.22, y, z + 0.04], ['post', x + 0.22, y, z + 0.04], ['plank', x, y + 0.4, z]]; }
  function cat() { return Array.prototype.concat.apply([], arguments); }
  var LEVELS = [
    { name: 'Line Them Up', shots: ['red', 'red', 'green', 'red'], items: cat([['crate', -0.6, 0, 5], ['crate', 0, 0, 5], ['crate', 0.6, 0, 5], ['beer', -0.6, 0.2, 5], ['wine', 0, 0.2, 5], ['beer', 0.6, 0.2, 5]]) },
    { name: 'Corner Table', shots: ['red', 'green', 'red', 'white'], items: cat(table(0.5, 5.2, 0), [['beer', 0.35, 0.44, 5.2], ['beer', 0.65, 0.44, 5.2], ['pill', 0.5, 0, 5.2]], stack('crate', -0.7, 5.6, 2), [['whiskey', -0.7, 0.4, 5.6]]) },
    { name: 'Pyramid', shots: ['green', 'red', 'blue', 'red'], items: cat([['crate', -0.22, 0, 5.5], ['crate', 0, 0, 5.5], ['crate', 0.22, 0, 5.5], ['crate', -0.11, 0.2, 5.5], ['crate', 0.11, 0.2, 5.5], ['crate', 0, 0.4, 5.5], ['wine', 0, 0.6, 5.5], ['beer', -0.5, 0, 5.3], ['beer', 0.5, 0, 5.3], ['pill', 0, 0, 5.05]]) },
    { name: 'Left And Right', shots: ['red', 'blue', 'white', 'green', 'red'], items: cat(table(-1.1, 5, 0), [['wine', -1.1, 0.44, 5], ['bag', -1.1, 0, 5]], table(1.1, 5.6, 0), [['beer', 0.95, 0.44, 5.6], ['beer', 1.25, 0.44, 5.6], ['tnt', 1.1, 0, 5.6]], stack('crate', 0, 6.2, 3), [['whiskey', 0, 0.6, 6.2]]) },
    { name: 'Powder Room', shots: ['bomb', 'red', 'green', 'blue', 'red'], items: cat(stack('brick', -0.4, 5.6, 3), stack('brick', 0.4, 5.6, 3), [['plank', 0, 0.33, 5.6, 0], ['plank', 0, 0.33, 5.75, 0], ['tnt', 0, 0, 5.65], ['beer', -0.15, 0.37, 5.65], ['wine', 0.15, 0.37, 5.65], ['pill', 0, 0.37, 5.65], ['beer', -0.9, 0, 5.4], ['whiskey', 0.9, 0, 5.4]]) },
    { name: 'Last Call', shots: ['blue', 'bomb', 'red', 'bronze', 'green', 'red'], items: cat(table(-0.5, 5.4, 0), table(0.5, 5.4, 0), [['plank', 0, 0.44, 5.4], ['crate', -0.5, 0.44, 5.4], ['crate', 0.5, 0.44, 5.4], ['wine', -0.5, 0.64, 5.4], ['wine', 0.5, 0.64, 5.4], ['beer', 0, 0.48, 5.4], ['tnt', -0.5, 0, 5.4], ['pill', 0.5, 0, 5.4], ['whiskey', 0, 0, 5.4]], stack('crate', -1.4, 6, 2), [['beer', -1.4, 0.4, 6]], stack('crate', 1.4, 6, 2), [['beer', 1.4, 0.4, 6]]) }
  ];
  var save = { open: 1, stars: [] };
  try { var sv = JSON.parse(localStorage.getItem('ss-sling3d') || 'null'); if (sv) { save.open = Math.max(1, Math.min(LEVELS.length, sv.open | 0)); save.stars = sv.stars || []; } } catch (e) {}
  function keep() { try { localStorage.setItem('ss-sling3d', JSON.stringify(save)); } catch (e) {} }

  /* ---------- set-up ---------- */
  function load(src, test, cb) { if (test()) return cb(); var s = document.createElement('script'); s.src = src; s.onload = cb; s.onerror = function () { fail('Could not load the 3D game. Check your connection and try again.'); }; document.head.appendChild(s); }
  function fail(msg) { panel('<h3>3D mode is not available</h3><p>' + msg + '</p><div class="sl-act"><button type="button" class="btn btn-primary" data-a="exit">Back</button></div>'); }
  function dom() {
    if (wrap) return;
    wrap = document.createElement('div'); wrap.id = 'sl3'; wrap.innerHTML = '<canvas id="sl3-canvas" aria-label="Smash the Stash in 3D. Drag sideways to aim, drag down to pull back, let go to fire."></canvas><div class="sl3-tag sl3-tl" id="sl3-name"></div><div class="sl3-tag sl3-tr" id="sl3-left"></div><div class="sl3-tag sl3-bot" id="sl3-info"></div><label class="sl3-arc">Arc<input type="range" id="sl3-arc" min="4" max="60" value="10" aria-label="How high the shot arcs"></label><div class="sl-over" id="sl3-over" hidden></div>';
    stage.appendChild(wrap); cv = wrap.querySelector('canvas'); elName = wrap.querySelector('#sl3-name'); elLeft = wrap.querySelector('#sl3-left'); elInfo = wrap.querySelector('#sl3-info'); elArc = wrap.querySelector('#sl3-arc'); over = wrap.querySelector('#sl3-over');
    elArc.addEventListener('input', function () { arc = +elArc.value; });
    over.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; S.audio(); S.preload(); if (b.dataset.l != null) return start(+b.dataset.l); var a = b.dataset.a; if (a === 'next') start(lvl + 1); else if (a === 'retry') start(lvl); else if (a === 'levels') levels(); else if (a === 'exit') exit(); });
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', function () { dragging = null; pullLen = 0; });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  function init() {
    if (renderer) return; T = window.THREE; C = window.CANNON;
    renderer = new T.WebGLRenderer({ canvas: cv, antialias: true }); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    scene = new T.Scene(); var sk = document.createElement('canvas'); sk.width = 8; sk.height = 256; var sx = sk.getContext('2d'), g = sx.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#140b2c'); g.addColorStop(0.45, '#4b2357'); g.addColorStop(0.62, '#d9603f'); g.addColorStop(0.7, '#ffc46b'); g.addColorStop(0.71, '#2a1218'); g.addColorStop(1, '#12070a'); sx.fillStyle = g; sx.fillRect(0, 0, 8, 256);
    scene.background = new T.CanvasTexture(sk); scene.fog = new T.Fog(0x6a3048, 14, 60);
    camera = new T.PerspectiveCamera(34, 16 / 9, 0.05, 200);
    scene.add(new T.HemisphereLight(0xffe2c4, 0x3a1a20, 1.0)); var sun = new T.DirectionalLight(0xffe0b0, 0.9); sun.position.set(-4, 7, 3); scene.add(sun);
    var gr = new T.Mesh(new T.PlaneGeometry(200, 200), new T.MeshLambertMaterial({ color: 0x2a1218 })); gr.rotation.x = -Math.PI / 2; scene.add(gr);
    var pad = new T.Mesh(new T.CircleGeometry(3.4, 48), new T.MeshLambertMaterial({ color: 0x40202a })); pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.004, -5.5); scene.add(pad);
    for (var i = 1; i <= 3; i++) { var ring = new T.Mesh(new T.RingGeometry(i * 2 - 0.02, i * 2 + 0.02, 64, 1, Math.PI * 0.3, Math.PI * 0.4), new T.MeshBasicMaterial({ color: 0x6b2f24 })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.006; ring.rotation.z = Math.PI; scene.add(ring); }
    var wm = new T.MeshLambertMaterial({ color: 0x6b3e1c }), upv = new T.Vector3(0, 1, 0);
    function stick(a, b, r) { var m = new T.Mesh(new T.CylinderGeometry(r, r, a.distanceTo(b), 8), wm); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(upv, b.clone().sub(a).normalize()); scene.add(m); }
    stick(new T.Vector3(0, 0, 0), new T.Vector3(0, 0.56, 0), 0.035); stick(new T.Vector3(0, 0.56, 0), new T.Vector3(-0.13, 0.84, 0), 0.027); stick(new T.Vector3(0, 0.56, 0), new T.Vector3(0.13, 0.84, 0), 0.027);
    band = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(), new T.Vector3()]), new T.LineBasicMaterial({ color: 0x8a3226 })); band.frustumCulled = false; scene.add(band);
    var dg = new T.SphereGeometry(0.022, 8, 6), dm = new T.MeshBasicMaterial({ color: 0xffffff, fog: false }); for (i = 0; i < 44; i++) { var d = new T.Mesh(dg, dm); d.visible = false; scene.add(d); dots.push(d); }
    var pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(new Float32Array(1500), 3)); pg.setAttribute('color', new T.BufferAttribute(new Float32Array(1500), 3)); pts = new T.Points(pg, new T.PointsMaterial({ size: 0.06, vertexColors: true, transparent: true, opacity: 0.95 })); pts.frustumCulled = false; scene.add(pts);
  }
  function mat(c, o) { return new T.MeshLambertMaterial({ color: c, transparent: o < 1, opacity: o }); }
  function mesh(k, def) {
    var g = new T.Group(), b = def.box, c = def.cyl;
    function add(geo, m, y) { var x = new T.Mesh(geo, m); if (y) x.position.y = y; g.add(x); return x; }
    if (k === 'beer' || k === 'wine') { var r = c[0], h = c[1]; add(new T.CylinderGeometry(r, r, h * 0.6, 14), mat(def.col, 0.9), -h * 0.2); add(new T.CylinderGeometry(r * 0.42, r, h * 0.18, 14), mat(def.col, 0.9), h * 0.19); add(new T.CylinderGeometry(r * 0.42, r * 0.42, h * 0.22, 10), mat(def.col, 0.9), h * 0.39); add(new T.CylinderGeometry(r + 0.002, r + 0.002, h * 0.22, 14), mat(0xf3ead2, 1), -h * 0.2); }
    else if (k === 'pill') { add(new T.CylinderGeometry(c[0] - 0.004, c[0] - 0.004, c[1] * 0.74, 14), mat(def.col, 0.92), -c[1] * 0.13); add(new T.CylinderGeometry(c[0], c[0], c[1] * 0.26, 14), mat(0xf4f4f4, 1), c[1] * 0.37); }
    else if (k === 'whiskey') { add(new T.BoxGeometry(b[0], b[1] * 0.76, b[2]), mat(def.col, 0.9), -b[1] * 0.12); add(new T.CylinderGeometry(0.025, 0.025, b[1] * 0.24, 10), mat(0x1b1b1b, 1), b[1] * 0.38); }
    else if (k === 'tnt') { add(new T.BoxGeometry(b[0], b[1], b[2]), mat(def.col, 1)); add(new T.BoxGeometry(b[0] + 0.004, 0.06, b[2] + 0.004), mat(0xf6e7c8, 1)); }
    else if (c) add(new T.CylinderGeometry(c[0], c[0], c[1], 20), mat(def.col, 1));
    else add(new T.BoxGeometry(b[0], b[1], b[2]), mat(def.col, k === 'bag' ? 0.6 : 1));
    scene.add(g); return g;
  }
  function addObj(it) {
    var k = it[0], def = K[k], h = def.box ? def.box[1] : def.cyl[1];
    var shape = def.box ? new C.Box(new C.Vec3(def.box[0] / 2, def.box[1] / 2, def.box[2] / 2)) : new C.Cylinder(def.cyl[0], def.cyl[0], def.cyl[1], 12);
    var body = new C.Body({ mass: def.kg, shape: shape, position: new C.Vec3(it[1], it[2] + h / 2 + 0.001, -it[3]), material: world.mats.obj, allowSleep: true, sleepSpeedLimit: 0.12, sleepTimeLimit: 0.4, linearDamping: 0.02, angularDamping: 0.05 });
    if (it[4]) body.quaternion.setFromEuler(0, it[4], 0);
    var o = { body: body, k: k, def: def, hp: def.hp, t: !!def.t, mesh: mesh(k, def), dead: false };
    body.o = o; body.addEventListener('collide', function (e) { hit(o, e); }); world.addBody(body); objs.push(o);
  }
  function build(n) {
    lvl = Math.max(0, Math.min(LEVELS.length - 1, n)); runId++;
    objs.forEach(function (o) { drop(o.mesh); }); chips.forEach(function (c) { drop(c.mesh); }); objs = []; chips = []; parts = []; booms = [];
    world = new C.World({ gravity: new C.Vec3(0, -G, 0) }); world.allowSleep = true; world.broadphase = new C.SAPBroadphase(world); world.solver.iterations = 14;
    var mo = new C.Material('obj'), mg = new C.Material('ground'); world.mats = { obj: mo, ground: mg };
    world.addContactMaterial(new C.ContactMaterial(mo, mo, { friction: 0.5, restitution: 0.12 })); world.addContactMaterial(new C.ContactMaterial(mo, mg, { friction: 0.7, restitution: 0.1 }));
    var ground = new C.Body({ mass: 0, shape: new C.Plane(), material: mg }); ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0); world.addBody(ground);
    var L = LEVELS[lvl], sxm = 0, szm = 0; L.items.forEach(function (it) { addObj(it); sxm += it[1]; szm += it[3]; }); tower = { x: sxm / L.items.length, z: -szm / L.items.length };
    for (var i = 0; i < 180; i++) world.step(STEP);
    shots = L.shots.slice(); used = 0; score = 0; armed = false; state = 'aim'; flyT = quietT = endT = 0; pullLen = 0; dragging = null; yaw = Math.atan2(tower.x, -tower.z) * 0;
    elName.textContent = (lvl + 1) + '. ' + L.name; say(lvl === 0 ? 'Drag sideways to aim. Drag down to pull back. Let go to fire. The Arc slider lobs it higher.' : '', 420); hud();
  }
  function drop(m) { if (!m) return; scene.remove(m); m.traverse(function (x) { if (x.geometry) x.geometry.dispose(); if (x.material) x.material.dispose(); }); }
  function left() { var n = 0; objs.forEach(function (o) { if (o.t) n++; }); return n; }
  function say(t, d) { tip = t; tipT = t ? (d || 200) : 0; }
  function hud() {
    elLeft.textContent = left() + ' left to smash';
    if (state === 'aim' && shots.length) { var p = P[shots[0]], pct = Math.round(pullLen / MAXPULL * 100), mph = Math.round(pullLen * Math.sqrt(SPRING / p.kg) * 2.23694); elInfo.textContent = tipT > 0 && !dragging ? tip : p.name + (dragging ? '  ' + (pct >= 100 ? 'MAX' : pct + '%') + '  ' + mph + ' mph' : '  (' + shots.length + ' shot' + (shots.length > 1 ? 's' : '') + ' left)'); }
    else elInfo.textContent = tipT > 0 ? tip : '';
  }

  /* ---------- hits and breaking ---------- */
  function hit(o, e) {
    if (!armed || o.dead) return; var v = Math.abs(e.contact.getImpactVelocityAlongNormal()), ob = e.body, ma = o.body.mass, mb = ob.mass, red = !mb ? ma : ma * mb / (ma + mb), E = 0.5 * red * v * v;
    if (E < 0.02) return; if (E > 0.15) snd('knock', E, o.def.m === 'glass');
    var chip = ob.chip; if (chip && !chip.hit) { chip.hit = true; if (chip.type === 'bomb') chip.fuse = 16; }
    o.hp -= E; if (o.hp <= 0) { if (chip && o.def.m !== 'wood' && o.def.m !== 'brick' && o.def.m !== 'steel') chip.keep = 0.85; kill(o); }
  }
  function kill(o) {
    if (o.dead) return; o.dead = true; o.gone = true; score += o.def.pts; var p = o.body.position, m = o.def.m;
    burst(p.x, p.y, p.z, m === 'glass' ? 22 : 14, m);
    if (o.k === 'tnt') booms.push({ x: p.x, y: p.y, z: p.z, t: 5, R: 0.9, J: 2.4, E: 18 });
    snd(m === 'glass' ? 'glass' : m === 'wood' ? 'wood' : m === 'steel' ? 'steel' : m === 'brick' ? 'rock' : m === 'pill' ? 'pill' : m === 'bag' ? 'bag' : 'wood');
    if (o.t) shake = Math.max(shake, 0.03);
  }
  function sweep() { for (var i = objs.length - 1; i >= 0; i--) { var o = objs[i]; if (o.gone) { world.removeBody(o.body); drop(o.mesh); objs.splice(i, 1); wake(); } } }
  function wake() { world.bodies.forEach(function (b) { if (b.mass) b.wakeUp(); }); }
  function burst(x, y, z, n, m) { var col = m === 'glass' ? [0.8, 1, 0.9] : m === 'wood' ? [0.72, 0.5, 0.28] : m === 'fire' ? [1, 0.6, 0.15] : [1, 0.95, 0.8]; for (var i = 0; i < n && parts.length < 480; i++) { var a = Math.random() * 6.283, b = Math.random() * 3.14, v = (m === 'fire' ? 2 : 1) * (1 + Math.random() * 3); parts.push({ x: x, y: y, z: z, vx: Math.cos(a) * Math.sin(b) * v, vy: Math.cos(b) * v + 1.5, vz: Math.sin(a) * Math.sin(b) * v, life: 0, max: 0.6 + Math.random() * 0.7, c: m === 'fire' && i % 3 === 0 ? [0.3, 0.28, 0.3] : col }); } }
  function boom(e) {
    objs.forEach(function (o) { if (o.dead) return; var d = o.body.position.vsub(new C.Vec3(e.x, e.y, e.z)), dist = d.length(); if (dist > e.R) return; var f = 1 - dist / e.R; d.normalize(); d.y += 0.35; o.body.wakeUp(); o.body.applyImpulse(d.scale(e.J * f), o.body.position); o.hp -= e.E * f * f; if (o.hp <= 0) kill(o); });
    burst(e.x, e.y, e.z, 60, 'fire'); snd('blast'); shake = 0.14; wake();
  }

  /* ---------- the sling ---------- */
  function dir() { var a = arc * Math.PI / 180; return new T.Vector3(Math.sin(yaw) * Math.cos(a), Math.sin(a), -Math.cos(yaw) * Math.cos(a)); }
  function pouchPos() { var d = dir(); return new T.Vector3(SLING.x - d.x * pullLen, SLING.y - d.y * pullLen * 0.6, SLING.z - d.z * pullLen); }
  function chipMesh(type) { var p = P[type], m; if (type === 'bomb') m = new T.Mesh(new T.SphereGeometry(p.r, 16, 12), mat(p.col, 1)); else { var geo = new T.CylinderGeometry(p.r, p.r, 0.03, 22); geo.rotateX(Math.PI / 2); m = new T.Mesh(geo, mat(p.col, 1)); } scene.add(m); return m; }
  function fire() {
    var type = shots.shift(), p = P[type], d = dir(), v = pullLen * Math.sqrt(SPRING / p.kg), pp = pouchPos();
    var body = new C.Body({ mass: p.kg, shape: new C.Sphere(p.r), position: new C.Vec3(pp.x, pp.y, pp.z), material: world.mats.obj, linearDamping: 0, angularDamping: 0.3 });
    body.velocity.set(d.x * v, d.y * v, d.z * v); var c = { body: body, type: type, mesh: pouch, hit: false, fuse: 0, keep: 0, prev: new C.Vec3(), age: 0 }; body.chip = c; pouch = null; world.addBody(body); chips.push(c);
    armed = true; used++; state = 'fly'; flyT = quietT = endT = 0; pullLen = 0; wake(); snd('sling');
  }
  function clearChips() { chips.forEach(function (c) { world.removeBody(c.body); drop(c.mesh); }); chips = []; }
  function ability() { for (var i = 0; i < chips.length; i++) { var c = chips[i]; if (c.type === 'bomb' && !c.used) { explodeChip(c); return true; } } return false; }
  function explodeChip(c) { c.used = true; var p = c.body.position; booms.push({ x: p.x, y: p.y, z: p.z, t: 1, R: 1.0, J: 3.2, E: 24 }); world.removeBody(c.body); drop(c.mesh); chips.splice(chips.indexOf(c), 1); }

  /* ---------- one tick (1/60 s) ---------- */
  function logic() {
    tick++; var i, moving = booms.length > 0;
    for (i = chips.length - 1; i >= 0; i--) { var c = chips[i]; c.age++; if (c.keep) { c.body.velocity.set(c.prev.x * c.keep, c.prev.y * c.keep, c.prev.z * c.keep); c.keep = 0; } c.prev.copy(c.body.velocity); if (c.fuse && --c.fuse === 0 && !c.used) { explodeChip(c); continue; } var p = c.body.position; if (p.y < -2 || p.z < -40 || Math.abs(p.x) > 30) { world.removeBody(c.body); drop(c.mesh); chips.splice(i, 1); continue; } if (c.body.velocity.length() > 0.15) moving = true; }
    for (i = booms.length - 1; i >= 0; i--) { if (--booms[i].t <= 0) { var e = booms[i]; booms.splice(i, 1); boom(e); } }
    sweep();
    for (i = 0; i < objs.length; i++) { var o = objs[i]; if (o.body.position.y < -2) { kill(o); continue; } if (o.body.sleepState !== 2 && o.body.velocity.length() > 0.08) moving = true; }
    if (state === 'fly') { flyT++; quietT = moving ? 0 : quietT + 1; var n = left(); if (!n) { if (++endT > 70) finish(true); } else if ((quietT > 45 && flyT > 50) || flyT > 660) { if (shots.length) { clearChips(); state = 'aim'; } else finish(false); } }
    if (tipT > 0) tipT--; hud();
  }
  function finish(won) {
    if (state === 'done') return; state = 'done'; var stars = 0;
    if (won) { score += shots.length * 1000 + (used === 1 ? 5000 : 0); stars = used <= 2 ? 3 : used === 3 ? 2 : 1; save.stars[lvl] = Math.max(save.stars[lvl] || 0, stars); save.open = Math.max(save.open, Math.min(LEVELS.length, lvl + 2)); keep(); snd('win'); } else snd('fail');
    var id = runId; setTimeout(function () { if (id !== runId || state !== 'done') return; var st = ''; for (var i = 0; i < 3; i++) st += '<span class="' + (i < stars ? 'on' : '') + '">&#9733;</span>'; var lastL = lvl === LEVELS.length - 1;
      panel(won ? '<h3>' + (used === 1 ? 'One shot!' : 'Stash smashed') + '</h3><div class="sl-stars">' + st + '</div><p>Score <b>' + score.toLocaleString() + '</b> in ' + used + ' shot' + (used > 1 ? 's' : '') + '.</p><div class="sl-act">' + (lastL ? '' : '<button type="button" class="btn btn-primary" data-a="next">Next level</button>') + '<button type="button" class="btn" data-a="retry">Replay</button><button type="button" class="btn" data-a="levels">Levels</button></div>' : '<h3>So close</h3><p>' + left() + ' still standing. Go again.</p><div class="sl-act"><button type="button" class="btn btn-primary" data-a="retry">Try again</button><button type="button" class="btn" data-a="levels">Levels</button></div>'); }, won ? 900 : 400);
  }
  function panel(h) { over.innerHTML = '<div>' + h + '</div>'; over.hidden = false; }
  function levels() { var h = '<h3>3D mode</h3><div class="sl-grid">'; LEVELS.forEach(function (L, i) { var open = i < save.open, st = save.stars[i] || 0; h += '<button type="button" data-l="' + i + '"' + (open ? '' : ' disabled') + '><b>' + (open ? i + 1 : '&#128274;') + '</b><small>' + L.name + '</small><i>' + (open ? '&#9733;'.repeat(st) + '<u>' + '&#9733;'.repeat(3 - st) + '</u>' : '') + '</i></button>'; }); panel(h + '</div><div class="sl-act" style="margin-top:10px"><button type="button" class="btn" data-a="exit">Back to the main menu</button></div>'); }
  function start(n) { over.hidden = true; build(n); go(); }

  /* ---------- pointer: drag sideways to aim, drag down to pull back ---------- */
  function pt(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; }
  function down(e) { if (state === 'fly') { ability(); return; } if (state !== 'aim' || !shots.length) return; e.preventDefault(); S.audio(); try { cv.setPointerCapture(e.pointerId); } catch (x) {} var p = pt(e); dragging = { x: p.x, y: p.y, yaw: yaw }; }
  function move(e) { if (!dragging) return; e.preventDefault(); var p = pt(e); yaw = Math.max(-0.7, Math.min(0.7, dragging.yaw - (p.x - dragging.x) * 1.5)); pullLen = Math.max(0, Math.min(MAXPULL, (p.y - dragging.y) * 2.4)); }
  function up() { if (!dragging) return; dragging = null; if (pullLen < 0.1) { pullLen = 0; say('Drag down further to pull back, then let go.'); return; } fire(); }

  /* ---------- drawing ---------- */
  function draw(dt) {
    var r = cv.getBoundingClientRect(), i; if (r.width > 10 && (cv.width !== Math.round(r.width * renderer.getPixelRatio()) || cv.height !== Math.round(r.height * renderer.getPixelRatio()))) { renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); }
    for (i = 0; i < objs.length; i++) { var o = objs[i]; o.mesh.position.copy(o.body.position); o.mesh.quaternion.copy(o.body.quaternion); }
    for (i = 0; i < chips.length; i++) { chips[i].mesh.position.copy(chips[i].body.position); if (chips[i].type !== 'bomb') chips[i].mesh.rotation.y = Math.atan2(chips[i].body.velocity.x, chips[i].body.velocity.z); }
    var loaded = state === 'aim' && shots.length, pp = pouchPos(), n = 0;
    if (loaded) { if (!pouch || pouch.userData.t !== shots[0]) { drop(pouch); pouch = chipMesh(shots[0]); pouch.userData.t = shots[0]; } pouch.position.copy(pp); pouch.rotation.y = -yaw; }
    band.geometry.setFromPoints([new T.Vector3(-0.13, 0.84, 0), loaded ? pp : new T.Vector3(0, 0.78, 0.03), new T.Vector3(0.13, 0.84, 0)]);
    if (loaded && pullLen > 0.02) { var d = dir(), v = pullLen * Math.sqrt(SPRING / P[shots[0]].kg); for (var t = 0.03; n < dots.length; t += 0.03) { var y = pp.y + d.y * v * t - 0.5 * G * t * t; if (y < 0) break; dots[n].visible = true; dots[n].position.set(pp.x + d.x * v * t, y, pp.z + d.z * v * t); n++; } }
    for (i = n; i < dots.length; i++) dots[i].visible = false;
    var pa = pts.geometry.attributes.position.array, ca = pts.geometry.attributes.color.array, np = Math.min(500, parts.length);
    for (i = parts.length - 1; i >= 0; i--) { var a = parts[i]; a.life += dt; if (a.life > a.max) { parts.splice(i, 1); continue; } a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt; a.vy -= 6 * dt; if (a.y < 0.01) { a.y = 0.01; a.vy *= -0.3; a.vx *= 0.6; a.vz *= 0.6; } }
    np = Math.min(500, parts.length); for (i = 0; i < np; i++) { var q = parts[i], j = i * 3; pa[j] = q.x; pa[j + 1] = q.y; pa[j + 2] = q.z; ca[j] = q.c[0]; ca[j + 1] = q.c[1]; ca[j + 2] = q.c[2]; }
    pts.geometry.setDrawRange(0, np); pts.geometry.attributes.position.needsUpdate = true; pts.geometry.attributes.color.needsUpdate = true;
    // camera: behind the sling while you aim, chasing the chip, then round to the side of the tower
    var wp, wl, lead = null; for (i = 0; i < chips.length; i++) if (!chips[i].hit) lead = chips[i];
    if (state === 'aim' || state === 'menu') { wp = { x: Math.sin(yaw) * -1.9, y: 1.3, z: 1.9 * Math.cos(yaw) }; wl = { x: Math.sin(yaw) * 5, y: 0.55, z: -5 * Math.cos(yaw) }; }
    else if (lead) { var lp = lead.body.position; wp = { x: lp.x * 0.5, y: 1.35, z: Math.max(tower.z + 2.8, Math.min(1.9, lp.z + 3.2)) }; wl = { x: tower.x, y: 0.5, z: tower.z }; }
    else { wp = { x: tower.x + 2.6, y: 1.5, z: tower.z + 3.4 }; wl = { x: tower.x, y: 0.4, z: tower.z }; }
    var k = Math.min(1, dt * 4); camP.x += (wp.x - camP.x) * k; camP.y += (wp.y - camP.y) * k; camP.z += (wp.z - camP.z) * k; camL.x += (wl.x - camL.x) * k; camL.y += (wl.y - camL.y) * k; camL.z += (wl.z - camL.z) * k;
    camera.position.set(camP.x + (Math.random() - 0.5) * shake, camP.y + (Math.random() - 0.5) * shake, camP.z); camera.lookAt(camL.x, camL.y, camL.z); if (shake > 0.002) shake *= 0.88; else shake = 0;
    renderer.render(scene, camera);
  }
  function frame(t) { if (!running) return; raf = requestAnimationFrame(frame); var dt = Math.min(0.05, (t - last) / 1000); last = t; if (state !== 'menu' && world) { acc += dt; var n = 0; while (acc >= STEP && n < 8) { world.step(STEP); acc -= STEP; n++; if (n % 2 === 0) logic(); } if (acc > STEP) acc = 0; } if (world) draw(dt); }
  function go() { if (running || !wrap || wrap.hidden || root.hidden) return; running = true; last = performance.now(); acc = 0; raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  function exit() { stop(); if (wrap) wrap.hidden = true; state = 'menu'; if (onExit) onExit(); }

  document.addEventListener('ss:cvgame', function (e) { if (e.detail !== 'sl') stop(); else go(); });
  document.addEventListener('ss:route', function (e) { if (e.detail.name !== 'craving') stop(); else go(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else go(); });
  document.addEventListener('keydown', function (e) { if (!running || !wrap || wrap.hidden) return; if (e.key === ' ' && state === 'fly') { e.preventDefault(); ability(); } else if (e.key === 'ArrowLeft') yaw = Math.max(-0.7, yaw - 0.03); else if (e.key === 'ArrowRight') yaw = Math.min(0.7, yaw + 0.03); else if (e.key === 'ArrowUp') { arc = Math.min(60, arc + 1); elArc.value = arc; } else if (e.key === 'ArrowDown') { arc = Math.max(4, arc - 1); elArc.value = arc; } else return; if (e.key.indexOf('Arrow') === 0) e.preventDefault(); });

  window.Sling3D = {
    open: function (opts) { onExit = opts && opts.onExit; dom(); wrap.hidden = false; load('js/vendor/three.min.js?v=149', function () { return !!window.THREE; }, function () { load('js/vendor/cannon-es.min.js?v=0.20.0', function () { return !!window.CANNON; }, function () { try { init(); } catch (e) { return fail('This device could not start 3D graphics.'); } if (save.open > 1) levels(); else start(0); }); }); },
    restart: function () { if (world && over) start(lvl); }, levels: function () { if (wrap) levels(); }, active: function () { return !!wrap && !wrap.hidden; },
    // test hooks
    state: function () { return { state: state, lvl: lvl, left: world ? left() : -1, used: used, shots: shots.slice(), objs: objs.length, running: running, yaw: +yaw.toFixed(2), pull: +pullLen.toFixed(2) }; },
    settle: function (n) { build(n); var before = objs.map(function (o) { return o.body.position.clone(); }); for (var i = 0; i < 600; i++) world.step(STEP); var worst = 0; objs.forEach(function (o, i) { worst = Math.max(worst, o.body.position.distanceTo(before[i])); }); return +worst.toFixed(3); },
    shoot: function (n, y, a, pw) { build(n); yaw = y; arc = a; pullLen = MAXPULL * pw; fire(); var g = 0; while (state === 'fly' && g++ < 3000) { world.step(STEP); world.step(STEP); logic(); } return { left: left(), state: state, score: score }; }
  };
})();
