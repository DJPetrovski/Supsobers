/* Sobercade game 5: Smash the Stash. A slingshot physics game: fling sobriety chips at stacks of bottles, pill bottles,
   baggies and needles until the whole stash is gone. Original art and code. Physics by matter-js (MIT), loaded only when the game is opened.
   Real units, like Disc-ipline: 200 pixels are one metre, gravity is 9.81 m/s2, every object has its real weight in kilograms,
   the sling is a spring (so a heavier shot leaves slower), and things break by the energy of the hit in joules. Physics runs 120 times a second.
   The sums are done in metric because that is what the physics needs; anything shown to the player is in American units (mph, feet, pounds). */
(function () {
  'use strict';
  var root = document.getElementById('sl'); if (!root) return;
  function $(id) { return document.getElementById(id); }
  var cv = $('sl-canvas'), ctx = cv.getContext('2d'), over = $('sl-over'), elLv = $('sl-lv'), elScore = $('sl-score'), btnMute = $('sl-mute');
  var W = 960, H = 540, GY = 484, SX = 150, SY = 372, MAXPULL = 95, PXM = 200, GRAV = 9.81, SPRING = 89, DT = 1000 / 120, STEP = 1000 / 60, AIR = 0.001;
  var GS = GRAV * PXM / 1e6;   // gravity in pixels per millisecond squared, which is what the physics engine wants
  function toMs(v) { return v * 60 / PXM; }   // engine speed (pixels per 1/60 s) to metres per second
  function toPx(v) { return v * PXM / 60; }
  function launchSpeed(pullPx, kg) { return (pullPx / PXM) * Math.sqrt(SPRING / kg); }   // spring: half k x squared becomes half m v squared
  var M = null, engine = null, objs = [], projs = [], shots = [], parts = [], pops = [], state = 'menu', lvl = 0, score = 0, armed = false;
  var drag = null, kb = null, kbAng = 35, runId = 0, flyT = 0, quietT = 0, endT = 0, tip = '', tipT = 0, shake = 0, tick = 0, bg = null, running = false, raf = 0, last = 0, acc = 0, headless = false;

  /* ---------- what things are made of ---------- */
  // kg = real weight, hp = joules of impact it can take before it breaks, f = friction, e = bounce
  var K = {
    crate: { w: 40, h: 40, kg: 0.6, hp: 6, f: 0.5, e: 0.15, m: 'wood', pts: 100 },
    post: { w: 14, h: 80, kg: 0.45, hp: 4, f: 0.5, e: 0.15, m: 'wood', pts: 100 },
    beam: { w: 110, h: 14, kg: 0.66, hp: 4, f: 0.5, e: 0.15, m: 'wood', pts: 100 },
    keg: { w: 44, h: 54, kg: 5.6, hp: 70, f: 0.4, e: 0.2, m: 'steel', pts: 150 },
    beer: { w: 20, h: 58, kg: 0.55, hp: 0.8, f: 0.35, e: 0.1, m: 'glass', pts: 500, t: 1, c: '#7a4316' },
    wine: { w: 22, h: 68, kg: 1.2, hp: 1.2, f: 0.35, e: 0.1, m: 'glass', pts: 500, t: 1, c: '#1f6a43' },
    whiskey: { w: 30, h: 46, kg: 1.0, hp: 1.0, f: 0.35, e: 0.1, m: 'glass', pts: 500, t: 1, c: '#c26d1c' },
    pill: { w: 26, h: 38, kg: 0.05, hp: 0.06, f: 0.4, e: 0.25, m: 'pill', pts: 500, t: 1, c: '#ff8a1e' },
    bag: { w: 32, h: 24, kg: 0.03, hp: 0.04, f: 0.6, e: 0.02, m: 'bag', pts: 500, t: 1, c: '#e8f0ff' },
    syr: { w: 44, h: 8, kg: 0.012, hp: 0.03, f: 0.4, e: 0.1, m: 'glass', pts: 500, t: 1, c: '#dfe9f5' }
  };
  var P = {
    chip: { r: 14, kg: 0.3, name: 'Sobriety chip', tip: '' },
    coffee: { r: 16, kg: 0.6, name: 'Black coffee', tip: 'Black coffee is heavy: it hits hard but flies slower.' },
    trio: { r: 13, kg: 0.3, name: 'Three chips', tip: 'Three chips: tap while it flies to split it up.' },
    blast: { r: 14, kg: 0.25, name: 'Clear head', tip: 'Clear head: tap while it flies and it bursts.' }
  };
  function it(k, x, b, w) { return { k: k, x: x, b: b, w: w }; }
  var LEVELS = [
    { name: 'First Step', shots: ['chip', 'chip', 'chip', 'chip', 'chip'], items: [it('crate', 640, 0), it('crate', 720, 0), it('crate', 800, 0), it('beer', 640, 40), it('wine', 720, 40), it('beer', 800, 40)] },
    { name: 'House Rules', shots: ['chip', 'chip', 'chip', 'chip'], items: [it('post', 660, 0), it('post', 760, 0), it('beam', 710, 80, 130), it('pill', 710, 0), it('beer', 680, 94), it('beer', 740, 94)] },
    { name: 'Two Towers', shots: ['chip', 'chip', 'coffee', 'chip', 'chip'], items: [it('crate', 620, 0), it('crate', 620, 40), it('whiskey', 620, 80), it('crate', 800, 0), it('crate', 800, 40), it('crate', 800, 80), it('pill', 800, 120), it('bag', 710, 0)] },
    { name: 'Keg Stand', shots: ['coffee', 'chip', 'coffee', 'chip', 'chip'], items: [it('keg', 600, 0), it('keg', 600, 54), it('post', 700, 0), it('post', 800, 0), it('beam', 750, 80, 130), it('wine', 750, 0), it('pill', 730, 94), it('bag', 775, 94)] },
    { name: 'Spread Thin', shots: ['trio', 'trio', 'chip', 'trio'], items: [it('crate', 540, 0), it('crate', 630, 0), it('crate', 720, 0), it('crate', 810, 0), it('crate', 900, 0), it('beer', 540, 40), it('pill', 630, 40), it('wine', 720, 40), it('bag', 810, 40), it('beer', 900, 40)] },
    { name: 'Second Story', shots: ['chip', 'coffee', 'trio', 'coffee', 'chip'], items: [it('post', 644, 0), it('post', 740, 0), it('post', 836, 0), it('beam', 692, 80, 96), it('beam', 788, 80, 96), it('post', 692, 94), it('post', 788, 94), it('beam', 740, 174, 130), it('pill', 692, 0), it('wine', 885, 0), it('beer', 740, 94), it('syr', 740, 188)] },
    { name: 'Clear Head', shots: ['blast', 'chip', 'blast', 'coffee', 'chip'], items: [it('keg', 650, 0), it('keg', 750, 0), it('keg', 850, 0), it('beam', 700, 54, 96), it('beam', 800, 54, 96), it('pill', 700, 0), it('bag', 800, 0), it('keg', 700, 68), it('keg', 800, 68), it('beam', 750, 122, 130), it('whiskey', 750, 136)] },
    { name: 'Tall Order', shots: ['chip', 'trio', 'coffee', 'chip'], items: [it('keg', 680, 0), it('crate', 680, 54), it('crate', 680, 94), it('crate', 680, 134), it('keg', 760, 0), it('crate', 760, 54), it('crate', 760, 94), it('crate', 760, 134), it('beam', 720, 174, 130), it('wine', 720, 188), it('bag', 600, 0), it('pill', 680, 188), it('beer', 760, 188)] },
    { name: 'Fortress', shots: ['coffee', 'chip', 'trio', 'blast', 'chip'], items: [it('keg', 610, 0), it('keg', 610, 54), it('keg', 870, 0), it('keg', 870, 54), it('post', 680, 0), it('post', 800, 0), it('beam', 740, 80, 150), it('whiskey', 710, 0), it('pill', 770, 0), it('crate', 740, 94), it('wine', 740, 134), it('beer', 695, 94), it('beer', 785, 94)] },
    { name: 'Last Call', shots: ['chip', 'coffee', 'blast', 'trio', 'coffee', 'blast', 'chip', 'chip'], items: [it('post', 580, 0), it('post', 660, 0), it('post', 740, 0), it('post', 820, 0), it('post', 900, 0), it('beam', 620, 80, 80), it('beam', 700, 80, 80), it('beam', 780, 80, 80), it('beam', 860, 80, 80), it('pill', 620, 0), it('wine', 700, 0), it('whiskey', 780, 0), it('bag', 860, 0), it('beer', 620, 94), it('crate', 700, 94), it('pill', 700, 134), it('crate', 780, 94), it('bag', 780, 134), it('wine', 860, 94)] }
  ];

  /* ---------- saved progress ---------- */
  var save = { open: 1, stars: [], best: [], mute: false, seen: {} };
  try { var sv = JSON.parse(localStorage.getItem('ss-sling') || 'null'); if (sv && typeof sv === 'object') { save.open = Math.max(1, Math.min(LEVELS.length, sv.open | 0)); save.stars = sv.stars || []; save.best = sv.best || []; save.mute = !!sv.mute; save.seen = sv.seen || {}; } } catch (e) {}
  function keep() { try { localStorage.setItem('ss-sling', JSON.stringify(save)); } catch (e) {} }

  /* ---------- sound: tiny synth, no files ---------- */
  var ac = null;
  function audio() { if (save.mute || headless) return null; try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) { ac = null; } return ac; }
  function tone(f0, f1, dur, type, vol) { var a = audio(); if (!a) return; var o = a.createOscillator(), g = a.createGain(), t = a.currentTime; o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); g.gain.setValueAtTime(vol || 0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02); }
  function noise(dur, hp, vol) { var a = audio(); if (!a) return; var n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0); for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n); var s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = b; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol || 0.2; s.connect(f); f.connect(g); g.connect(a.destination); s.start(); }
  /* Recorded sounds are optional. The whoosh, knock and clap are borrowed from the disc golf game. To add real glass, metal or other sounds,
     put mp3 files in media/sling/ and list them here, for example glass: ['sling/glass1', 'sling/glass2']. With no file, the synth plays. */
  var REC = { sling: ['disc/throw1', 'disc/throw2'], wood: ['disc/hit1', 'disc/hit2'], win: ['disc/clap'], glass: [], steel: [], soft: [], pill: [], blast: [], fail: [] }, buf = {}, recOn = false;
  function preload() { if (recOn || headless) return; var a = audio(); if (!a) return; recOn = true; Object.keys(REC).forEach(function (k) { REC[k].forEach(function (n) { fetch('media/' + n + '.mp3').then(function (r) { return r.ok ? r.arrayBuffer() : null; }).then(function (ab) { if (ab) a.decodeAudioData(ab, function (b) { buf[n] = b; }, function () {}); }).catch(function () {}); }); }); }
  function rec(kind, vol, rate) { var a = audio(); if (!a) return true; var have = REC[kind].filter(function (n) { return buf[n]; }); if (!have.length) return false; try { var src = a.createBufferSource(), g = a.createGain(); src.buffer = buf[have[Math.floor(Math.random() * have.length)]]; src.playbackRate.value = rate || (0.92 + Math.random() * 0.16); g.gain.value = vol == null ? 0.7 : vol; src.connect(g); g.connect(a.destination); src.start(); return true; } catch (e) { return false; } }
  var lastKnock = 0;
  var SND = {
    sling: function () { if (!rec('sling', 0.6)) tone(520, 140, 0.18, 'triangle', 0.18); },
    glass: function () { if (rec('glass', 0.8)) return; noise(0.22, 3200, 0.22); tone(2400 + Math.random() * 900, 1500, 0.12, 'sine', 0.06); tone(3300 + Math.random() * 900, 2100, 0.16, 'sine', 0.05); },
    wood: function () { if (rec('wood', 0.7)) return; noise(0.12, 500, 0.2); tone(180, 70, 0.12, 'square', 0.07); },
    steel: function () { if (rec('steel', 0.7)) return; tone(310, 240, 0.3, 'triangle', 0.12); noise(0.08, 1500, 0.1); },
    soft: function () { if (!rec('soft', 0.6)) noise(0.14, 900, 0.14); },
    knock: function (E) { if (tick - lastKnock < 5) return; lastKnock = tick; tone(150, 70, 0.08, 'sine', Math.min(0.14, 0.03 + E * 0.012)); },
    blast: function () { if (rec('blast', 0.8)) return; noise(0.5, 200, 0.3); tone(220, 40, 0.5, 'sawtooth', 0.12); },
    split: function () { tone(700, 1100, 0.1, 'triangle', 0.1); },
    win: function () { rec('win', 0.5); [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { tone(f, f, 0.22, 'triangle', 0.14); }, i * 110); }); },
    fail: function () { tone(300, 150, 0.4, 'triangle', 0.12); }
  };

  /* ---------- building a level ---------- */
  function wakeAll() { if (!M) return; M.Composite.allBodies(engine.world).forEach(function (b) { if (!b.isStatic) M.Sleeping.set(b, false); }); }
  function addObj(k, x, base, w) {
    var def = K[k], ww = w || def.w, hh = def.h;
    var body = M.Bodies.rectangle(x, GY - base - hh / 2, ww, hh, { friction: def.f, frictionStatic: 0.7, restitution: def.e, frictionAir: AIR, chamfer: k === 'keg' ? { radius: 6 } : null, slop: 0.02 });
    M.Body.setMass(body, def.kg * (w ? w / def.w : 1));
    var o = { body: body, k: k, def: def, w: ww, h: hh, hp: def.hp, max: def.hp, t: !!def.t, seed: Math.random() * 1000 };
    body.plugin.o = o; objs.push(o); M.Composite.add(engine.world, body); return o;
  }
  function build(n) {
    lvl = Math.max(0, Math.min(LEVELS.length - 1, n)); var L = LEVELS[lvl]; runId++;
    engine = M.Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 }); engine.gravity.x = 0; engine.gravity.y = 1; engine.gravity.scale = GS;
    objs = []; projs = []; parts = []; pops = []; score = 0; armed = false; drag = null; kb = null; flyT = quietT = endT = 0; shake = 0;
    M.Composite.add(engine.world, M.Bodies.rectangle(W / 2, GY + 60, W * 3, 120, { isStatic: true, friction: 0.8, frictionStatic: 0.9, restitution: 0.1 }));
    L.items.forEach(function (i) { addObj(i.k, i.x, i.b, i.w); });
    shots = L.shots.slice(); state = 'aim'; tip = ''; tipT = 0;
    M.Events.on(engine, 'collisionStart', onHit);
    for (var s = 0; s < 120; s++) M.Engine.update(engine, DT);   // let the stack settle before anyone sees it
    hud(); showTip();
  }
  function showTip() { if (headless) return; var t = shots[0]; if (t && P[t].tip && !save.seen[t]) { tip = P[t].tip; tipT = 420; save.seen[t] = 1; keep(); } }
  function targetsLeft() { var n = 0; for (var i = 0; i < objs.length; i++) if (objs[i].t) n++; return n; }
  function hud() { if (headless) return; elLv.textContent = 'Level ' + (lvl + 1); elScore.textContent = score.toLocaleString(); }

  /* ---------- hits, damage and breaking ---------- */
  function onHit(ev) {
    if (!armed) return;
    for (var i = 0; i < ev.pairs.length; i++) {
      var pr = ev.pairs[i], A = pr.bodyA.parent || pr.bodyA, B = pr.bodyB.parent || pr.bodyB, a = A.plugin.o, b = B.plugin.o;
      var rel = toMs(Math.hypot(A.velocity.x - B.velocity.x, A.velocity.y - B.velocity.y));   // closing speed in m/s
      var ma = A.isStatic ? 0 : A.mass, mb = B.isStatic ? 0 : B.mass, red = !ma ? mb : (!mb ? ma : ma * mb / (ma + mb)), E = 0.5 * red * rel * rel;   // joules the hit has to give
      if (a && a.proj) touched(a); if (b && b.proj) touched(b);
      if (E < 0.02) continue;
      if (!headless && E > 0.15) SND.knock(E);
      if (a && !a.proj) hurt(a, E); if (b && !b.proj) hurt(b, E);
    }
  }
  function touched(p) { if (p.hit) return; p.hit = true; if (p.type === 'blast' && !p.used) p.fuse = 40; }
  function hurt(o, dmg) { if (o.dead) return; o.hp -= dmg; if (o.hp <= 0) kill(o); }
  function kill(o) {
    if (o.dead) return; o.dead = true; M.Composite.remove(engine.world, o.body); objs.splice(objs.indexOf(o), 1); wakeAll();
    score += o.def.pts; hud();
    if (headless) return;
    var x = o.body.position.x, y = o.body.position.y, m = o.def.m; pops.push({ x: x, y: y - 10, t: 0, s: '+' + o.def.pts });
    if (m === 'glass') { SND.glass(); burst(x, y, 14, o.def.c, 'tri'); burst(x, y, 6, '#ffffff', 'dot'); }
    else if (m === 'wood') { SND.wood(); burst(x, y, 10, '#b98248', 'rect'); }
    else if (m === 'steel') { SND.steel(); burst(x, y, 10, '#9aa3ad', 'rect'); }
    else if (m === 'pill') { SND.glass(); burst(x, y, 6, o.def.c, 'tri'); burst(x, y, 12, '', 'pill'); }
    else { SND.soft(); burst(x, y, 18, '#ffffff', 'dot'); }
    if (o.t) shake = Math.max(shake, 4);
  }
  function burst(x, y, n, col, shape) { for (var i = 0; i < n; i++) { var a = Math.random() * 6.283, v = 1.5 + Math.random() * 4.5; parts.push({ x: x + (Math.random() - 0.5) * 14, y: y + (Math.random() - 0.5) * 20, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 0, max: 34 + Math.random() * 26, col: shape === 'pill' ? ['#ff5964', '#ffd23a', '#58c7ff', '#ffffff'][i % 4] : col, s: 3 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.5, shape: shape }); } }
  function explode(p) {
    p.used = true; var x = p.body.position.x, y = p.body.position.y, R = 150;
    objs.slice().forEach(function (o) { var dx = o.body.position.x - x, dy = o.body.position.y - y, d = Math.hypot(dx, dy); if (d > R) return; var f = 1 - d / R, k = toPx(Math.min(8, 1.5 * f / o.body.mass)); M.Sleeping.set(o.body, false); M.Body.setVelocity(o.body, { x: o.body.velocity.x + dx / (d || 1) * k, y: o.body.velocity.y + dy / (d || 1) * k - k * 0.15 }); hurt(o, 8 * f * f); });   // a 1.5 newton-second shove and up to 8 joules, fading with distance
    removeProj(p); wakeAll();
    if (!headless) { SND.blast(); shake = 9; for (var i = 0; i < 26; i++) { var a = i / 26 * 6.283; parts.push({ x: x, y: y, vx: Math.cos(a) * 7, vy: Math.sin(a) * 7, life: 0, max: 26, col: i % 2 ? '#9fe8ff' : '#ffffff', s: 5, rot: 0, vr: 0, shape: 'dot', nog: 1 }); } pops.push({ x: x, y: y, t: 0, ring: R }); }
  }
  function removeProj(p) { var i = projs.indexOf(p); if (i >= 0) projs.splice(i, 1); M.Composite.remove(engine.world, p.body); }

  /* ---------- the sling ---------- */
  function mkProj(type, x, y, vx, vy, r) {
    var def = P[type], rr = r || def.r;
    var body = M.Bodies.circle(x, y, rr, { friction: 0.45, restitution: 0.3, frictionAir: AIR }); M.Body.setMass(body, r ? def.kg / 3 : def.kg);
    var p = { body: body, proj: true, type: type, r: rr, hit: false, used: false, fuse: 0, age: 0, spin: Math.random() * 6 };
    body.plugin.o = p; M.Composite.add(engine.world, body); M.Body.setVelocity(body, { x: vx, y: vy }); projs.push(p); return p;
  }
  function launch(dx, dy) {   // dx, dy: how far the pouch was pulled from rest
    var type = shots.shift(); armed = true; wakeAll();
    var d = Math.hypot(dx, dy) || 1, v = toPx(launchSpeed(d, P[type].kg));
    mkProj(type, SX + dx, SY + dy, -dx / d * v, -dy / d * v);
    state = 'fly'; flyT = quietT = 0; drag = null; kb = null; tipT = Math.min(tipT, 60); if (!headless) SND.sling();
  }
  function ability() {
    for (var i = projs.length - 1; i >= 0; i--) { var p = projs[i]; if (p.used || p.hit) continue;
      if (p.type === 'trio') { p.used = true; var v = p.body.velocity, x = p.body.position.x, y = p.body.position.y; [-0.2, 0.2].forEach(function (a) { var c = Math.cos(a), s = Math.sin(a), q = mkProj('trio', x, y + (a > 0 ? 16 : -16), v.x * c - v.y * s, v.x * s + v.y * c, 10); q.used = true; }); M.Body.scale(p.body, 10 / p.r, 10 / p.r); M.Body.setMass(p.body, P.trio.kg / 3); p.r = 10; if (!headless) SND.split(); return true; }
      if (p.type === 'blast') { explode(p); return true; }
    }
    return false;
  }
  function nextShot() {
    projs.slice().forEach(function (p) { if (!headless) burst(p.body.position.x, p.body.position.y, 6, '#ffd76a', 'dot'); removeProj(p); });
    state = 'aim'; flyT = quietT = 0; showTip();
  }

  /* ---------- one tick of the game ---------- */
  function step() {
    tick++; M.Engine.update(engine, DT); M.Engine.update(engine, DT);
    var i, o, moving = false;
    for (i = objs.length - 1; i >= 0; i--) { o = objs[i]; var p = o.body.position; if (p.y > H + 80 || p.x > W + 140 || p.x < -220) { kill(o); continue; } if (!o.body.isSleeping && o.body.speed > 0.3) moving = true; }
    for (i = projs.length - 1; i >= 0; i--) { var q = projs[i]; q.age++; var bp = q.body.position; if (q.fuse && --q.fuse === 0 && !q.used) { explode(q); continue; } if (bp.y > H + 80 || bp.x > W + 140 || bp.x < -220) { removeProj(q); continue; } if (!q.body.isSleeping && q.body.speed > 0.35) moving = true; }
    if (state === 'aim' && armed && !targetsLeft()) { if (++endT > 50) finish(true); }
    if (state === 'fly') {
      flyT++; quietT = moving ? 0 : quietT + 1;
      var left = targetsLeft();
      if (!left) { if (++endT > 70) finish(true); }
      else if ((quietT > 45 && flyT > 50) || flyT > 520) { if (shots.length) nextShot(); else if (++endT > 60 || !moving) finish(false); }
    }
    if (headless) return;
    for (i = parts.length - 1; i >= 0; i--) { var a = parts[i]; a.life++; if (a.life > a.max) { parts.splice(i, 1); continue; } a.x += a.vx; a.y += a.vy; if (!a.nog) a.vy += 0.22; a.vx *= 0.985; a.rot += a.vr; }
    for (i = pops.length - 1; i >= 0; i--) { if (++pops[i].t > 50) pops.splice(i, 1); }
    if (tipT > 0) tipT--; if (shake > 0) shake *= 0.86;
  }
  function finish(won) {
    if (state === 'done') return; state = 'done';
    var unused = shots.length, stars = 0;
    if (won) { score += unused * 1000; stars = 1 + Math.min(2, unused); save.stars[lvl] = Math.max(save.stars[lvl] || 0, stars); save.best[lvl] = Math.max(save.best[lvl] || 0, score); save.open = Math.max(save.open, Math.min(LEVELS.length, lvl + 2)); keep(); }
    if (headless) return;
    hud(); if (won) SND.win(); else SND.fail();
    var id = runId; setTimeout(function () { if (id === runId && state === 'done') panel(won ? 'win' : 'fail', stars, unused); }, won ? 500 : 300);
  }

  /* ---------- overlay panels ---------- */
  function starRow(n) { var s = ''; for (var i = 0; i < 3; i++) s += '<span class="' + (i < n ? 'on' : '') + '">&#9733;</span>'; return '<div class="sl-stars" aria-label="' + n + ' of 3 stars">' + s + '</div>'; }
  function panel(kind, stars, unused) {
    var h = '';
    if (kind === 'intro') h = '<h3>Smash the Stash</h3><p>Pull back the sling and let a sobriety chip fly. Break every bottle, pill bottle, baggie and needle to clear the level. The fewer shots you use, the more stars you earn.</p><div class="sl-act"><button type="button" class="btn btn-primary" data-a="play">' + (save.open > 1 ? 'Keep going' : 'Play') + '</button>' + (save.open > 1 ? '<button type="button" class="btn" data-a="levels">Levels</button>' : '') + '</div>';
    else if (kind === 'win') { var lastL = lvl === LEVELS.length - 1; h = '<h3>' + (lastL ? 'Last call is cancelled' : 'Stash smashed') + '</h3>' + starRow(stars) + '<p>Score <b>' + score.toLocaleString() + '</b>' + (unused ? ' with ' + unused + ' shot' + (unused > 1 ? 's' : '') + ' to spare' : '') + '.' + (lastL ? ' You cleared every level in the Sobercade.' : '') + '</p><div class="sl-act">' + (lastL ? '' : '<button type="button" class="btn btn-primary" data-a="next">Next level</button>') + '<button type="button" class="btn" data-a="retry">Replay</button><button type="button" class="btn" data-a="levels">Levels</button></div>'; }
    else if (kind === 'fail') { var n = targetsLeft(); h = '<h3>So close</h3><p>' + n + ' still standing. Cravings pass, and so do bad rounds. Go again.</p><div class="sl-act"><button type="button" class="btn btn-primary" data-a="retry">Try again</button><button type="button" class="btn" data-a="levels">Levels</button></div>'; }
    else if (kind === 'levels') { h = '<h3>Pick a level</h3><div class="sl-grid">'; LEVELS.forEach(function (L, i) { var open = i < save.open, st = save.stars[i] || 0; h += '<button type="button" data-l="' + i + '"' + (open ? '' : ' disabled') + ' aria-label="Level ' + (i + 1) + ', ' + L.name + (open ? '' : ', locked') + '"><b>' + (open ? i + 1 : '&#128274;') + '</b><small>' + L.name + '</small><i>' + (open ? '&#9733;'.repeat(st) + '<u>' + '&#9733;'.repeat(3 - st) + '</u>' : '') + '</i></button>'; }); h += '</div>'; }
    over.innerHTML = '<div>' + h + '</div>'; over.hidden = false;
  }
  over.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return; audio(); preload();
    if (b.dataset.l != null) return start(+b.dataset.l);
    var a = b.dataset.a; if (a === 'play') start(Math.min(save.open, LEVELS.length) - 1); else if (a === 'next') start(lvl + 1); else if (a === 'retry') start(lvl); else if (a === 'levels') panel('levels');
  });
  function start(n) { need(function () { over.hidden = true; build(n); go(); }); }

  /* ---------- drawing ---------- */
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function backdrop() {
    bg = document.createElement('canvas'); bg.width = W; bg.height = H; var c = bg.getContext('2d'), g = c.createLinearGradient(0, 0, 0, GY);
    g.addColorStop(0, '#140b2c'); g.addColorStop(0.45, '#4b2357'); g.addColorStop(0.78, '#d9603f'); g.addColorStop(1, '#ffc46b'); c.fillStyle = g; c.fillRect(0, 0, W, GY);
    for (var i = 0; i < 60; i++) { c.fillStyle = 'rgba(255,255,255,' + (0.15 + Math.random() * 0.5) + ')'; c.fillRect(Math.random() * W, Math.random() * 190, 1.5, 1.5); }
    var sg = c.createRadialGradient(735, GY - 6, 10, 735, GY - 6, 230); sg.addColorStop(0, 'rgba(255,240,190,.95)'); sg.addColorStop(0.25, 'rgba(255,200,110,.55)'); sg.addColorStop(1, 'rgba(255,160,80,0)'); c.fillStyle = sg; c.fillRect(480, GY - 240, 480, 240);
    c.fillStyle = '#fff3c4'; c.beginPath(); c.arc(735, GY - 6, 58, Math.PI, 0); c.fill();
    function hills(col, base, amp, f, ph) { c.fillStyle = col; c.beginPath(); c.moveTo(0, GY); for (var x = 0; x <= W; x += 8) c.lineTo(x, base - Math.sin(x * f + ph) * amp - Math.sin(x * f * 2.3 + ph * 2) * amp * 0.4); c.lineTo(W, GY); c.fill(); }
    hills('rgba(74,34,84,.75)', GY - 60, 26, 0.008, 1); hills('#2c1436', GY - 26, 18, 0.013, 4);
    var gg = c.createLinearGradient(0, GY, 0, H); gg.addColorStop(0, '#2a1218'); gg.addColorStop(1, '#0b0406'); c.fillStyle = gg; c.fillRect(0, GY, W, H - GY);
    c.fillStyle = '#6b2f24'; c.fillRect(0, GY, W, 3); c.fillStyle = 'rgba(255,255,255,.05)'; for (var j = 0; j < 40; j++) c.fillRect(Math.random() * W, GY + 8 + Math.random() * 44, 14 + Math.random() * 30, 2);
  }
  function wood(w, h, o) {
    ctx.fillStyle = '#b07a44'; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.strokeStyle = 'rgba(70,40,15,.45)'; ctx.lineWidth = 1; ctx.beginPath();
    if (w > h) { for (var y = -h / 2 + 4; y < h / 2; y += 5) { ctx.moveTo(-w / 2 + 3, y); ctx.lineTo(w / 2 - 3, y + ((o.seed + y) % 3) - 1); } } else { for (var x = -w / 2 + 4; x < w / 2; x += 5) { ctx.moveTo(x, -h / 2 + 3); ctx.lineTo(x + ((o.seed + x) % 3) - 1, h / 2 - 3); } }
    ctx.stroke(); ctx.strokeStyle = '#5c3a1c'; ctx.lineWidth = 2; ctx.strokeRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2);
  }
  function cracks(o) { var f = o.hp / o.max; if (f > 0.6) return; ctx.strokeStyle = o.def.m === 'steel' ? 'rgba(20,20,25,.7)' : 'rgba(30,15,5,.75)'; ctx.lineWidth = 1.5; ctx.beginPath(); var n = f > 0.3 ? 2 : 4, w = o.w, h = o.h; for (var i = 0; i < n; i++) { var s = o.seed + i * 37, x = ((s * 13) % w) - w / 2, y = ((s * 7) % h) - h / 2; ctx.moveTo(x, y); ctx.lineTo(x + ((s * 3) % 14) - 7, y + ((s * 5) % 14) - 7); ctx.lineTo(x + ((s * 11) % 18) - 9, y + ((s * 17) % 18) - 9); } ctx.stroke(); }
  function drawObj(o) {
    var b = o.body, w = o.w, h = o.h, k = o.k; ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle);
    if (k === 'crate') { wood(w, h, o); ctx.strokeStyle = '#5c3a1c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-w / 2 + 4, -h / 2 + 4); ctx.lineTo(w / 2 - 4, h / 2 - 4); ctx.moveTo(w / 2 - 4, -h / 2 + 4); ctx.lineTo(-w / 2 + 4, h / 2 - 4); ctx.stroke(); cracks(o); }
    else if (k === 'post' || k === 'beam') { wood(w, h, o); cracks(o); }
    else if (k === 'keg') { var g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0); g.addColorStop(0, '#6a737d'); g.addColorStop(0.35, '#c3cbd3'); g.addColorStop(1, '#565e67'); ctx.fillStyle = g; rr(-w / 2, -h / 2, w, h, 7); ctx.fill(); ctx.strokeStyle = '#2f353b'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = 'rgba(40,46,52,.55)'; ctx.fillRect(-w / 2, -h / 2 + 9, w, 4); ctx.fillRect(-w / 2, h / 2 - 13, w, 4); ctx.fillRect(-w / 2, -2, w, 4); cracks(o); }
    else if (k === 'beer' || k === 'wine') { var nw = w * 0.42, sh = h * (k === 'wine' ? 0.42 : 0.36), top = -h / 2; ctx.fillStyle = o.def.c; ctx.beginPath(); ctx.moveTo(-nw / 2, top + 5); ctx.lineTo(nw / 2, top + 5); ctx.lineTo(nw / 2, top + sh * 0.6); ctx.quadraticCurveTo(w / 2, top + sh * 0.8, w / 2, top + sh + 4); ctx.lineTo(w / 2, h / 2 - 3); ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - 3, h / 2); ctx.lineTo(-w / 2 + 3, h / 2); ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - 3); ctx.lineTo(-w / 2, top + sh + 4); ctx.quadraticCurveTo(-w / 2, top + sh * 0.8, -nw / 2, top + sh * 0.6); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = k === 'wine' ? '#7a1420' : '#e7b83a'; ctx.fillRect(-nw / 2 - 1, top, nw + 2, k === 'wine' ? 12 : 6); ctx.fillStyle = '#f3ead2'; ctx.fillRect(-w / 2 + 2, top + sh + 10, w - 4, h * 0.26); ctx.fillStyle = '#7a1420'; ctx.fillRect(-w / 2 + 4, top + sh + 10 + h * 0.1, w - 8, 3); ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(-w / 2 + 3, top + sh + 6, 2.5, h * 0.5); }
    else if (k === 'whiskey') { ctx.fillStyle = '#1b1b1b'; ctx.fillRect(-6, -h / 2, 12, 7); ctx.fillStyle = o.def.c; ctx.fillRect(-5, -h / 2 + 7, 10, 6); rr(-w / 2, -h / 2 + 12, w, h - 12, 4); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#16110d'; ctx.fillRect(-w / 2 + 3, -2, w - 6, 15); ctx.fillStyle = '#e7c98a'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('XXX', 0, 6); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(-w / 2 + 3, -h / 2 + 15, 3, h - 20); }
    else if (k === 'pill') { ctx.fillStyle = 'rgba(255,138,30,.92)'; rr(-w / 2 + 1, -h / 2 + 9, w - 2, h - 9, 4); ctx.fill(); ctx.strokeStyle = 'rgba(120,50,0,.6)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#f4f4f4'; rr(-w / 2 - 1, -h / 2, w + 2, 11, 3); ctx.fill(); ctx.strokeStyle = '#b9b9b9'; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillRect(-w / 2 + 3, -h / 2 + 15, w - 6, 15); ctx.fillStyle = '#b3261e'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Rx', 0, -h / 2 + 23); }
    else if (k === 'bag') { ctx.fillStyle = 'rgba(214,230,255,.32)'; rr(-w / 2, -h / 2, w, h, 4); ctx.fill(); ctx.strokeStyle = 'rgba(220,235,255,.8)'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.fillStyle = '#4aa3ff'; ctx.fillRect(-w / 2 + 1, -h / 2 + 2, w - 2, 2.5); ctx.fillStyle = '#fbfbfb'; ctx.beginPath(); ctx.moveTo(-w / 2 + 3, h / 2 - 2); ctx.quadraticCurveTo(-4, -h / 2 + 8, 2, h / 2 - 9); ctx.quadraticCurveTo(8, h / 2 - 12, w / 2 - 3, h / 2 - 2); ctx.closePath(); ctx.fill(); }
    else if (k === 'syr') { ctx.strokeStyle = '#c9d3df'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(w / 2 - 16, 0); ctx.lineTo(w / 2, 0); ctx.stroke(); ctx.fillStyle = 'rgba(235,243,255,.75)'; ctx.fillRect(-w / 2 + 12, -h / 2, w - 30, h); ctx.strokeStyle = '#8fa0b3'; ctx.lineWidth = 1; ctx.strokeRect(-w / 2 + 12, -h / 2, w - 30, h); ctx.fillStyle = '#ffb04a'; ctx.fillRect(w / 2 - 19, -h / 2 + 1, 4, h - 2); ctx.fillStyle = '#8fa0b3'; ctx.fillRect(-w / 2 + 4, -1.5, 9, 3); ctx.fillRect(-w / 2, -h / 2 - 1, 4, h + 2); ctx.fillStyle = 'rgba(90,110,130,.7)'; for (var t = 0; t < 4; t++) ctx.fillRect(-w / 2 + 17 + t * 6, -h / 2, 1, 4); }
    ctx.restore();
  }
  function drawProj(type, x, y, r, ang, whole) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    if (type === 'chip' || type === 'trio') {
      var silver = type === 'trio';
      if (silver && whole) { for (var i = 0; i < 3; i++) { var a = i * 2.094 - 0.5; drawProj('trio', Math.cos(a) * 6, Math.sin(a) * 6, 8.5, 0, false); } ctx.restore(); return; }
      var g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, 1, 0, 0, r); if (silver) { g.addColorStop(0, '#f4fbff'); g.addColorStop(0.6, '#9fc3dc'); g.addColorStop(1, '#4f7896'); } else { g.addColorStop(0, '#fff3b0'); g.addColorStop(0.6, '#e9b535'); g.addColorStop(1, '#96690f'); }
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill(); ctx.strokeStyle = silver ? '#2f5069' : '#6b4a08'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, 6.283); ctx.lineWidth = 1; ctx.stroke();
      if (r > 11) { ctx.fillStyle = '#5a3d05'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('24h', 0, 0.5); }
    } else if (type === 'coffee') {
      ctx.strokeStyle = '#e9e4da'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(r * 0.95, 0, r * 0.42, -1.3, 1.3); ctx.stroke();
      ctx.fillStyle = '#f3efe6'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#8d8676'; ctx.lineWidth = 1.5; ctx.stroke();
      var cg = ctx.createRadialGradient(-3, -3, 1, 0, 0, r * 0.74); cg.addColorStop(0, '#5a3a22'); cg.addColorStop(1, '#22120a'); ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, r * 0.74, 0, 6.283); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 3.6, 4.9); ctx.stroke();
    } else {
      var bgd = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 1.7); bgd.addColorStop(0, 'rgba(160,235,255,.75)'); bgd.addColorStop(1, 'rgba(160,235,255,0)'); ctx.fillStyle = bgd; ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, 6.283); ctx.fill();
      var og = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r); og.addColorStop(0, '#ffffff'); og.addColorStop(0.6, '#8fe3ff'); og.addColorStop(1, '#2a8fc0'); ctx.fillStyle = og; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#176a94'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.beginPath(); for (var s = 0; s < 4; s++) { var q = s * 0.785; ctx.moveTo(Math.cos(q) * -r * 0.5, Math.sin(q) * -r * 0.5); ctx.lineTo(Math.cos(q) * r * 0.5, Math.sin(q) * r * 0.5); } ctx.stroke();
    }
    ctx.restore();
  }
  // the pull right now: from the pointer, or from the keyboard (hold Space to charge). A full-power pull shakes a little, like a real arm.
  function curPull() {
    var d = drag;
    if (!d && kb) { var lv = Math.min(1, (performance.now() - kb.t) / 1050), a = kbAng * Math.PI / 180; d = { x: -Math.cos(a) * MAXPULL * lv, y: Math.sin(a) * MAXPULL * lv }; }
    if (!d) return null;
    var raw = Math.hypot(d.x, d.y) / MAXPULL;
    if (raw > 0.85) { var sh = Math.sin(performance.now() * 0.047) * ((raw - 0.85) / 0.15) * 0.045, c = Math.cos(sh), n = Math.sin(sh); d = { x: d.x * c - d.y * n, y: d.x * n + d.y * c }; }
    return d;
  }
  function pouch() { var d = curPull(); return d ? { x: SX + d.x, y: SY + d.y } : { x: SX, y: SY }; }
  function draw() {
    var cw = cv.width, sc = cw / W; ctx.setTransform(sc, 0, 0, sc, 0, 0);
    if (!bg) backdrop();
    var sx = shake > 0.3 ? (Math.random() - 0.5) * shake : 0, sy = shake > 0.3 ? (Math.random() - 0.5) * shake : 0; ctx.save(); ctx.translate(sx, sy);
    ctx.drawImage(bg, 0, 0);
    var p = pouch(), i, loaded = state === 'aim' && shots.length;
    // sling: back arm and back band
    ctx.lineCap = 'round'; ctx.strokeStyle = '#4a2a12'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(SX + 3, GY - 78); ctx.lineTo(SX + 16, SY - 12); ctx.stroke();
    if (loaded) { ctx.strokeStyle = '#3a1410'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(SX + 16, SY - 10); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    for (i = 0; i < objs.length; i++) drawObj(objs[i]);
    // aim line
    var pl = loaded ? curPull() : null;
    if (pl) {   // the dotted path uses the same sums as the physics engine, so the shot flies where the dots say
      var pd = Math.hypot(pl.x, pl.y) || 1, v0 = launchSpeed(pd, P[shots[0]].kg), vv = toPx(v0) / 2, vx = -pl.x / pd * vv, vy = -pl.y / pd * vv, x = p.x, y = p.y, fa = 1 - AIR * (DT / STEP), gd = GS * DT * DT;
      for (var s = 1; s <= 150; s++) { vx *= fa; vy = vy * fa + gd; x += vx; y += vy; if (y > GY || x > W) break; if (s % 6 === 0) { ctx.fillStyle = 'rgba(255,255,255,' + Math.max(0.12, 0.9 - s / 170) + ')'; ctx.beginPath(); ctx.arc(x, y, Math.max(1.4, 3.4 - s / 60), 0, 6.283); ctx.fill(); } }
      var pct = Math.round(pd / MAXPULL * 100); ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; var lab = pct + '%  ' + Math.round(v0 * 2.23694) + ' mph', lw = ctx.measureText(lab).width + 20;
      ctx.fillStyle = 'rgba(10,3,8,.78)'; rr(SX - lw / 2 + 6, SY - 96, lw, 24, 12); ctx.fill(); ctx.fillStyle = pct > 85 ? '#ffd23a' : '#fff'; ctx.fillText(lab, SX + 6, SY - 84);
    } else if (loaded) { var gl = 0.5 + 0.5 * Math.sin(tick / 11); ctx.strokeStyle = 'rgba(255,226,122,' + (0.25 + gl * 0.5) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, P[shots[0]].r + 6 + gl * 3, 0, 6.283); ctx.stroke(); }
    if (loaded) drawProj(shots[0], p.x, p.y, P[shots[0]].r, 0, true);
    for (i = 0; i < projs.length; i++) { var q = projs[i]; drawProj(q.type, q.body.position.x, q.body.position.y, q.r, q.body.angle, q.type === 'trio' && !q.used); }
    // sling: front band, front arm and post
    if (loaded) { ctx.strokeStyle = '#5a1e17'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(SX - 14, SY - 10); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    else { ctx.strokeStyle = '#5a1e17'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(SX - 14, SY - 10); ctx.quadraticCurveTo(SX, SY + 10, SX + 16, SY - 10); ctx.stroke(); }
    ctx.strokeStyle = '#6b3e1c'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(SX, GY); ctx.lineTo(SX, GY - 74); ctx.lineTo(SX - 14, SY - 12); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,220,170,.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(SX - 2, GY - 4); ctx.lineTo(SX - 2, GY - 70); ctx.stroke();
    // shots waiting their turn
    for (i = loaded ? 1 : 0; i < shots.length; i++) { var qx = 100 - (i - (loaded ? 1 : 0)) * 30; if (qx < 12) break; drawProj(shots[i], qx, GY - 13, 11, 0, true); }
    // bits and pieces
    for (i = 0; i < parts.length; i++) { var a = parts[i], al = 1 - a.life / a.max; ctx.globalAlpha = al; ctx.fillStyle = a.col; ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.rot); if (a.shape === 'tri') { ctx.beginPath(); ctx.moveTo(-a.s, a.s * 0.6); ctx.lineTo(a.s, a.s * 0.4); ctx.lineTo(0, -a.s); ctx.fill(); } else if (a.shape === 'rect') ctx.fillRect(-a.s, -1.5, a.s * 2, 3); else if (a.shape === 'pill') { rr(-4, -2, 8, 4, 2); ctx.fill(); } else { ctx.beginPath(); ctx.arc(0, 0, a.s * 0.5, 0, 6.283); ctx.fill(); } ctx.restore(); }
    ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (i = 0; i < pops.length; i++) { var o = pops[i], f = o.t / 50; if (o.ring) { ctx.strokeStyle = 'rgba(190,240,255,' + (1 - f) + ')'; ctx.lineWidth = 6 * (1 - f); ctx.beginPath(); ctx.arc(o.x, o.y, o.ring * Math.min(1, f * 2.2), 0, 6.283); ctx.stroke(); } else { ctx.globalAlpha = 1 - f; ctx.font = 'bold 17px sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(o.s, o.x, o.y - f * 34); ctx.fillStyle = '#ffe27a'; ctx.fillText(o.s, o.x, o.y - f * 34); ctx.globalAlpha = 1; } }
    ctx.restore();
    // words on the picture
    var left = targetsLeft(); ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(0,0,0,.45)'; rr(W - 178, 12, 166, 28, 14); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(left + ' left to smash', W - 26, 27);
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(0,0,0,.45)'; rr(12, 12, 190, 28, 14); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText((lvl + 1) + '. ' + LEVELS[lvl].name, 26, 27);
    if (tipT > 0 && tip) { ctx.globalAlpha = Math.min(1, tipT / 40); ctx.textAlign = 'center'; ctx.font = 'bold 17px sans-serif'; var tw = ctx.measureText(tip).width + 36; ctx.fillStyle = 'rgba(10,3,8,.8)'; rr(W / 2 - tw / 2, 58, tw, 36, 18); ctx.fill(); ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillText(tip, W / 2, 77); ctx.globalAlpha = 1; }
    if (state === 'aim' && !drag && !kb && !armed && lvl === 0 && shots.length) { var bob = Math.sin(tick / 14) * 5; ctx.textAlign = 'center'; ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillText('Pull the glowing chip back and let go', SX + 60, SY - 70 + bob); }
  }

  /* ---------- running the game ---------- */
  function size() { var r = cv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1), w = Math.max(320, Math.round(r.width * d)); if (cv.width !== w) { cv.width = w; cv.height = Math.round(w * H / W); } }
  function frame(t) { if (!running) return; raf = requestAnimationFrame(frame); var dt = Math.min(60, t - last); last = t; acc += dt; var n = 0; while (acc >= STEP && n < 3) { if (state !== 'menu' && engine) step(); acc -= STEP; n++; } if (acc > STEP) acc = 0; if (engine) draw(); }
  function go() { if (running || root.hidden || !engine) return; var v = document.querySelector('[data-view="craving"]'); if (v && v.hidden) return; running = true; last = performance.now(); acc = 0; size(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  function need(cb) { if (window.Matter) { M = window.Matter; return cb(); } var s = document.createElement('script'); s.src = 'js/vendor/matter.min.js?v=0.19.0'; s.onload = function () { M = window.Matter; cb(); }; s.onerror = function () { over.innerHTML = '<div><h3>Could not load the game</h3><p>Check your connection and try again.</p></div>'; over.hidden = false; }; document.head.appendChild(s); }

  /* ---------- pointer: pull the sling ---------- */
  function pt(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
  function pull(p) { var dx = p.x - SX, dy = p.y - SY, d = Math.hypot(dx, dy); if (d > MAXPULL) { dx *= MAXPULL / d; dy *= MAXPULL / d; } if (dx > 30) dx = 30; return { x: dx, y: dy }; }
  cv.addEventListener('pointerdown', function (e) {
    if (state === 'menu' || state === 'done' || !engine) return; e.preventDefault(); audio(); var p = pt(e);
    if (state === 'aim' && shots.length && Math.hypot(p.x - SX, p.y - SY) < 110) { drag = pull(p); try { cv.setPointerCapture(e.pointerId); } catch (x) {} return; }
    if (state === 'fly') { if (!ability() && flyT > 80 && shots.length && targetsLeft() && Math.hypot(p.x - SX, p.y - SY) < 110) nextShot(); }
  });
  cv.addEventListener('pointermove', function (e) { if (drag) { e.preventDefault(); drag = pull(pt(e)); } });
  function say(t) { tip = t; tipT = 170; }
  function release(e) { if (!drag) return; var d = curPull(); if (Math.hypot(d.x, d.y) < 16) { drag = null; say('Pull it back further, then let go.'); return; } launch(d.x, d.y); }
  cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', function () { drag = null; });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ---------- buttons, tabs and pausing ---------- */
  $('sl-restart').addEventListener('click', function () { if (engine) start(lvl); });
  $('sl-levels').addEventListener('click', function () { panel('levels'); });
  function muteLabel() { btnMute.textContent = save.mute ? 'Sound: off' : 'Sound: on'; btnMute.setAttribute('aria-pressed', String(save.mute)); }
  btnMute.addEventListener('click', function () { save.mute = !save.mute; keep(); muteLabel(); }); muteLabel();
  document.addEventListener('keydown', function (e) { if (root.hidden || !running || /input|textarea|select/i.test((e.target.tagName || ''))) return; if (e.key === 'r' || e.key === 'R') start(lvl);
    else if (e.key === ' ' && state === 'fly') { e.preventDefault(); ability(); }
    else if (e.key === ' ' && state === 'aim' && shots.length && !drag) { e.preventDefault(); if (!kb && !e.repeat) { audio(); kb = { t: performance.now() }; } }
    else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && state === 'aim') { e.preventDefault(); kbAng = Math.max(0, Math.min(80, kbAng + (e.key === 'ArrowUp' ? 2 : -2))); if (!kb && !drag) say('Aim ' + kbAng + ' degrees. Hold Space to pull back, let go to fire.'); } });
  document.addEventListener('keyup', function (e) { if (e.key !== ' ' || !kb) return; var d = curPull(); kb = null; if (state !== 'aim' || root.hidden) return; if (Math.hypot(d.x, d.y) < 16) { say('Hold Space longer, then let go.'); return; } launch(d.x, d.y); });
  function still() { size(); if (!bg) backdrop(); var sc = cv.width / W; ctx.setTransform(sc, 0, 0, sc, 0, 0); ctx.drawImage(bg, 0, 0); }
  document.addEventListener('ss:cvgame', function (e) { if (e.detail === 'sl') { if (!engine) { panel('intro'); still(); } go(); } else stop(); });
  document.addEventListener('ss:route', function (e) { if (e.detail.name !== 'craving') stop(); else if (!root.hidden) go(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else if (!root.hidden) go(); });
  window.addEventListener('resize', function () { if (running) size(); else if (!root.hidden && !engine) still(); });
  panel('intro');

  /* ---------- test hooks: play a level with no picture, as fast as the computer can ---------- */
  window.__sl = {
    levels: LEVELS.length,
    sim: function (n, plan) {
      if (!window.Matter) return null; M = window.Matter; headless = true; var res;
      try { build(n); var guard = 0;
        for (var i = 0; i < plan.length && state !== 'done'; i++) { var s = plan[i], a = s.a * Math.PI / 180, d = MAXPULL * s.p; launch(-Math.cos(a) * d, Math.sin(a) * d); var t = 0; while (state === 'fly' && guard++ < 20000) { step(); t++; if (s.tap && t === s.tap) ability(); } }
        res = { left: targetsLeft(), score: score, won: state === 'done' && !targetsLeft(), shotsLeft: shots.length, kinds: objs.filter(function (o) { return o.t; }).map(function (o) { return o.k + '@' + Math.round(o.body.position.x) + ',' + Math.round(GY - o.body.position.y); }) };
      } finally { headless = false; engine = null; state = 'menu'; }
      return res;
    },
    settle: function (n) { if (!window.Matter) return null; M = window.Matter; headless = true; build(n); var before = objs.map(function (o) { return { x: o.body.position.x, y: o.body.position.y, a: o.body.angle }; }); for (var i = 0; i < 800; i++) M.Engine.update(engine, DT); var worst = 0; objs.forEach(function (o, i) { worst = Math.max(worst, Math.hypot(o.body.position.x - before[i].x, o.body.position.y - before[i].y), Math.abs(o.body.angle - before[i].a) * 30); }); headless = false; engine = null; state = 'menu'; return worst; },
    flight: function (ang, pw, type) { if (!window.Matter) return null; M = window.Matter; headless = true; build(0); objs.slice().forEach(function (o) { M.Composite.remove(engine.world, o.body); }); objs = []; shots = [type || 'chip']; var a = ang * Math.PI / 180, d = MAXPULL * pw, dx = -Math.cos(a) * d, dy = Math.sin(a) * d, kg = P[shots[0]].kg, v0 = launchSpeed(d, kg), vv = toPx(v0) / 2, vx = -dx / d * vv, vy = -dy / d * vv, x = SX + dx, y = SY + dy, fa = 1 - AIR * (DT / STEP), gd = GS * DT * DT, worst = 0, n = 0; launch(dx, dy); var b = projs[0].body; while (n < 400) { M.Engine.update(engine, DT); vx *= fa; vy = vy * fa + gd; x += vx; y += vy; n++; if (y > GY - 20) break; worst = Math.max(worst, Math.hypot(b.position.x - x, b.position.y - y)); } var res = { v0: v0, worstPx: worst, steps: n, time: n / 120, rangeM: (b.position.x - SX - dx) / PXM, vacuumRangeM: null }; var h0 = (GY - 20 - (SY + dy)) / PXM, vxm = v0 * Math.cos(a), vym = v0 * Math.sin(a); res.vacuumRangeM = vxm * (vym + Math.sqrt(vym * vym + 2 * GRAV * h0)) / GRAV; headless = false; engine = null; state = 'menu'; return res; },
    state: function () { return { state: state, lvl: lvl, shots: shots.slice(), left: engine ? targetsLeft() : -1, score: score, running: running }; }
  };
})();
