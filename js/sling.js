/* Sobercade game 5: Smash the Stash. A slingshot physics game: fling sobriety chips at towers of bottles, pill bottles,
   baggies and needles until the whole stash is gone. Original art and code. Physics by matter-js (MIT), loaded only when the game is opened.
   Real units, like Disc-ipline: 200 pixels are one metre, gravity is 9.81 m/s2, every object has its real weight in kilograms,
   and things break by the energy of the hit in joules. The sling is a spring, so every chip leaves with the same energy at a full pull:
   a light chip flies fast and flat, a heavy chip flies slower but shoves harder. Physics runs 240 times a second.
   Towers can hold TNT (explodes), wood (burns, and fire spreads), whiskey (splashes and feeds a fire) and moonshine (rots wood away).
   The sums are done in metric because that is what the physics needs; anything shown to the player is in American units. */
(function () {
  'use strict';
  var root = document.getElementById('sl'); if (!root) return;
  function $(id) { return document.getElementById(id); }
  var cv = $('sl-canvas'), ctx = cv.getContext('2d'), over = $('sl-over'), elLv = $('sl-lv'), elScore = $('sl-score'), btnMute = $('sl-mute'), btnView = $('sl-view');
  var W = 960, H = 540, GY = 484, WW = 1600, SX = 220, SY = 336, MAXPULL = 150, PXM = 200, GRAV = 9.81, SPRING = 110, NSUB = 4, DT = 1000 / 240, STEP = 1000 / 60, AIR = 0.001, FITZ = W / WW;
  var GS = GRAV * PXM / 1e6;
  function toMs(v) { return v * 60 / PXM; }
  function toPx(v) { return v * PXM / 60; }
  function vel(b) { return M.Body.getVelocity(b); }   // speed per 1/60 s whatever the physics step is
  function spd(b) { return M.Body.getSpeed(b); }
  function launchSpeed(pullPx, kg) { return (pullPx / PXM) * Math.sqrt(SPRING / kg); }
  var M = null, engine = null, objs = [], projs = [], shots = [], parts = [], pops = [], scorch = [], booms = [], state = 'menu', lvl = 0, score = 0, armed = false, used = 0;
  var drag = null, pan = null, kb = null, kbAng = 30, runId = 0, flyT = 0, quietT = 0, endT = 0, tip = '', tipT = 0, shake = 0, flash = 0, slow = 0, tick = 0, sub = 0, bg = null, running = false, raf = 0, last = 0, acc = 0, headless = false;
  var cam = { x: 0, z: FITZ }, camT = { x: 0, z: FITZ }, manual = false, tower = { x0: 900, x1: 1400 };

  /* ---------- what things are made of ----------
     kg = real weight, hp = joules of impact it can take, f = friction, e = bounce, b = what fire does to it:
     wood burns away and spreads the fire, tnt explodes, liq bursts and splashes, melt and crack are destroyed by heat. */
  var K = {
    crate: { w: 40, h: 40, kg: 0.6, hp: 12, f: 0.5, e: 0.15, m: 'wood', b: 'wood', pts: 100 },
    post: { w: 14, h: 80, kg: 0.45, hp: 8, f: 0.5, e: 0.15, m: 'wood', b: 'wood', pts: 100 },
    beam: { w: 110, h: 14, kg: 0.66, hp: 8, f: 0.5, e: 0.15, m: 'wood', b: 'wood', pts: 100 },
    brick: { w: 44, h: 24, kg: 2.2, hp: 60, f: 0.6, e: 0.1, m: 'brick', pts: 150 },
    keg: { w: 44, h: 54, kg: 5.6, hp: 150, f: 0.4, e: 0.2, m: 'steel', pts: 150 },
    tnt: { w: 36, h: 36, kg: 0.7, hp: 3, f: 0.5, e: 0.1, m: 'tnt', b: 'tnt', pts: 300 },
    beer: { w: 20, h: 58, kg: 0.55, hp: 0.8, f: 0.35, e: 0.1, m: 'glass', b: 'crack', pts: 500, t: 1, c: '#7a4316' },
    wine: { w: 22, h: 68, kg: 1.2, hp: 1.2, f: 0.35, e: 0.1, m: 'glass', b: 'crack', pts: 500, t: 1, c: '#1f6a43' },
    whiskey: { w: 30, h: 46, kg: 1.0, hp: 1.0, f: 0.35, e: 0.1, m: 'glass', b: 'liq', pts: 500, t: 1, c: '#c26d1c' },
    moon: { w: 28, h: 36, kg: 0.9, hp: 0.9, f: 0.35, e: 0.1, m: 'glass', b: 'liq', pts: 500, t: 1, c: '#bfeede' },
    pill: { w: 26, h: 38, kg: 0.05, hp: 0.06, f: 0.4, e: 0.25, m: 'pill', b: 'melt', pts: 500, t: 1, c: '#ff8a1e' },
    bag: { w: 32, h: 24, kg: 0.03, hp: 0.04, f: 0.6, e: 0.02, m: 'bag', b: 'melt', pts: 500, t: 1, c: '#e8f0ff' },
    syr: { w: 44, h: 8, kg: 0.012, hp: 0.03, f: 0.4, e: 0.1, m: 'syr', b: 'melt', pts: 500, t: 1, c: '#dfe9f5' },
    joint: { w: 38, h: 8, kg: 0.01, hp: 0.03, f: 0.6, e: 0.05, m: 'joint', b: 'melt', pts: 500, t: 1, c: '#efe6cf' }
  };
  // the chips come in the real sobriety-chip colours; bigger means heavier
  var P = {
    white: { r: 10, kg: 0.12, lab: '24h', c: ['#ffffff', '#d9dde3', '#8d949e', '#3c424a'], name: 'White chip', tip: 'White chip: small and very fast.' },
    red: { r: 13, kg: 0.25, lab: '30', c: ['#ffb3ad', '#e23b30', '#8f150e', '#fff'], name: 'Red chip', tip: '' },
    green: { r: 15, kg: 0.4, lab: '90', c: ['#b9f5c5', '#2fae4e', '#12602a', '#fff'], name: 'Green chip', tip: 'Green chip: heavier, so it shoves harder.' },
    blue: { r: 17, kg: 0.6, lab: '6m', c: ['#b7dcff', '#2f7fe0', '#123f85', '#fff'], name: 'Blue chip', tip: 'Blue chip: big and heavy. It ploughs through wood.' },
    bronze: { r: 21, kg: 1.0, lab: '1yr', c: ['#ffe2b0', '#c8842f', '#6e4210', '#fff'], name: 'Bronze chip', tip: 'Bronze one-year chip: the wrecking ball.' },
    trio: { r: 13, kg: 0.36, lab: '', c: ['#ffffff', '#d9dde3', '#8d949e', '#3c424a'], name: 'Three chips', tip: 'Three chips: they split apart in the air. Tap to split them sooner.' },
    bomb: { r: 15, kg: 0.45, lab: '', c: [], name: 'Truth bomb', tip: 'Truth bomb: it explodes when it lands. Tap to set it off sooner.' }
  };
  function it(k, x, b, w) { return { k: k, x: x, b: b, w: w }; }
  function col(k, x, n, b) { var a = [], h = K[k].h; for (var i = 0; i < n; i++) a.push(it(k, x, (b || 0) + i * h)); return a; }
  function house(x, b, w) { return [it('post', x - w / 2 + 7, b), it('post', x + w / 2 - 7, b), it('beam', x, b + 80, w)]; }
  function cat() { return Array.prototype.concat.apply([], arguments); }
  var LEVELS = [
    { name: 'First Step', shots: ['red', 'red', 'green'], items: [it('tnt', 950, 0), it('crate', 1000, 0), it('crate', 1045, 0), it('beer', 1000, 40), it('beer', 1045, 40), it('wine', 1095, 0)] },
    { name: 'Bar Shelf', shots: ['green', 'red', 'blue', 'white'], items: cat(house(1100, 0, 150), house(1100, 94, 150), house(1100, 188, 150), [it('wine', 1070, 0), it('whiskey', 1130, 0), it('beer', 1070, 94), it('moon', 1130, 94), it('pill', 1070, 188), it('beer', 1130, 188), it('wine', 1100, 282), it('tnt', 990, 0)]) },
    { name: 'Double Trouble', shots: ['green', 'bomb', 'red', 'blue'], items: cat(col('crate', 1000, 5), col('crate', 1160, 5), [it('beam', 1080, 200, 204), it('tnt', 1080, 214), it('wine', 1080, 250), it('beer', 1000, 214), it('beer', 1160, 214), it('keg', 1080, 0), it('whiskey', 1080, 54), it('pill', 1039, 0), it('pill', 1121, 0)]) },
    { name: 'Fire Sale', shots: ['bomb', 'red', 'green', 'white'], items: cat(col('crate', 1000, 3), col('crate', 1040, 3), col('crate', 1080, 3), [it('beer', 1000, 120), it('whiskey', 1040, 120), it('beer', 1080, 120), it('crate', 1120, 0), it('crate', 1160, 0), it('pill', 1120, 40), it('bag', 1160, 40)], col('crate', 1200, 2), [it('wine', 1200, 80)]) },
    { name: 'Brick House', shots: ['bomb', 'bronze', 'red', 'white', 'green'], items: cat(col('brick', 1000, 6), col('brick', 1180, 6), [it('beam', 1090, 144, 230), it('tnt', 1090, 0), it('whiskey', 1090, 36), it('beer', 1040, 0), it('wine', 1140, 0), it('syr', 1040, 158), it('moon', 1090, 158), it('joint', 1140, 158)]) },
    { name: 'House Rules', shots: ['red', 'green', 'red'], items: cat(house(1050, 0, 130), [it('joint', 1050, 0), it('beer', 1020, 94), it('beer', 1080, 94), it('tnt', 955, 0)], col('crate', 1140, 2), [it('whiskey', 1140, 80)]) },
    { name: 'Powder Keg', shots: ['red', 'blue', 'white', 'green'], items: [it('tnt', 945, 0), it('keg', 1000, 0), it('tnt', 1048, 0), it('keg', 1096, 0), it('beam', 1048, 54, 150), it('crate', 1005, 68), it('crate', 1091, 68), it('beer', 1005, 108), it('beer', 1091, 108), it('wine', 1048, 68), it('tnt', 1190, 0), it('syr', 1190, 36), it('bag', 1245, 0)] },
    { name: 'Domino Effect', shots: ['green', 'red', 'white'], items: cat([950, 1000, 1050, 1100, 1150, 1200].map(function (x) { return it('post', x, 0); }), [it('pill', 975, 0), it('bag', 1025, 0), it('pill', 1075, 0), it('bag', 1125, 0), it('pill', 1175, 0), it('wine', 1245, 0)]) },
    { name: 'Moonshine Still', shots: ['white', 'red', 'green', 'blue'], items: cat(house(1100, 0, 140), house(1100, 94, 140), house(1100, 188, 140), [it('pill', 1065, 0), it('moon', 1100, 0), it('beer', 1135, 0), it('beer', 1065, 94), it('moon', 1100, 94), it('pill', 1135, 94), it('bag', 1065, 188), it('moon', 1100, 188), it('wine', 1135, 188), it('whiskey', 1100, 282)]) },
    { name: 'Last Call', shots: ['blue', 'bomb', 'red', 'trio', 'bronze'], items: cat(house(1000, 0, 130), house(1130, 0, 130), house(1260, 0, 130), house(1065, 94, 130), house(1195, 94, 130), house(1130, 188, 130), [it('wine', 1000, 0), it('tnt', 1130, 0), it('pill', 1130, 36), it('whiskey', 1260, 0), it('beer', 1065, 94), it('moon', 1195, 94), it('bag', 1105, 188), it('joint', 1150, 188), it('wine', 1130, 282), it('keg', 1400, 0), it('beer', 1400, 54)], col('crate', 1340, 2), [it('tnt', 1340, 80), it('whiskey', 1340, 116)]) }
  ];
  var WORLD = 'Sunrise';

  /* ---------- saved progress ---------- */
  var save = { open: 1, stars: [], best: [], mute: false, seen: {} };
  try { var sv = JSON.parse(localStorage.getItem('ss-sling2') || 'null'); if (sv && typeof sv === 'object') { save.open = Math.max(1, Math.min(LEVELS.length, sv.open | 0)); save.stars = sv.stars || []; save.best = sv.best || []; save.mute = !!sv.mute; save.seen = sv.seen || {}; } } catch (e) {}
  function keep() { try { localStorage.setItem('ss-sling2', JSON.stringify(save)); } catch (e) {} }

  /* ---------- sound: soft, close-up, ASMR-style. Everything is made by a tiny synth, no files needed. ----------
     Glass tinkles, baggies crinkle, needles crack like plastic, pills crumble like chalk, joints crunch like dry leaves.
     Real recordings are optional: put mp3 files in media/sling/ and list them in REC, for example glass: ['sling/glass1', 'sling/glass2'];
     a listed recording plays instead of the synth for that sound. */
  var ac = null, out = null, nbuf = null, lastAt = {}, recent = [];
  function audio() {
    if (save.mute || headless) return null;
    try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume();
      if (!out) { var c = ac.createDynamicsCompressor(); c.threshold.value = -20; c.ratio.value = 5; c.attack.value = 0.004; c.release.value = 0.2; out = ac.createGain(); out.gain.value = 0.85; out.connect(c); c.connect(ac.destination);
        var n = ac.sampleRate * 2; nbuf = ac.createBuffer(1, n, ac.sampleRate); var d = nbuf.getChannelData(0); for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
    } catch (e) { ac = null; }
    return ac;
  }
  // a soft note: quick fade in, long gentle fade out
  function ping(f0, f1, dur, vol, when, type) { var a = audio(); if (!a) return; var o = a.createOscillator(), g = a.createGain(), t = a.currentTime + (when || 0); o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.03); }
  // a tiny grain of filtered hiss: the building block of crinkles, crumbles and crackles
  function grain(when, dur, f, q, vol, kind) { var a = audio(); if (!a) return; var s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime + (when || 0); s.buffer = nbuf; fl.type = kind || 'bandpass'; fl.frequency.value = f; fl.Q.value = q || 1; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.004, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random() * 1.8, dur + 0.02); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  // keeps a pile-up of breaking things gentle: at most one of each sound every `gap` ms, and quieter when a lot is going on
  function calm(kind, gap) { var now = performance.now(); if (now - (lastAt[kind] || 0) < gap) return 0; lastAt[kind] = now; recent = recent.filter(function (t) { return now - t < 300; }); recent.push(now); return recent.length > 5 ? 0.45 : recent.length > 2 ? 0.7 : 1; }
  var REC = { sling: [], glass: [], bag: [], syr: [], pill: [], joint: [], wood: [], steel: [], blast: [], win: [], fail: [] }, buf = {}, recOn = false;
  function preload() { if (recOn || headless) return; var a = audio(); if (!a) return; recOn = true; Object.keys(REC).forEach(function (k) { REC[k].forEach(function (n) { fetch('media/' + n + '.mp3').then(function (r) { return r.ok ? r.arrayBuffer() : null; }).then(function (ab) { if (ab) a.decodeAudioData(ab, function (b) { buf[n] = b; }, function () {}); }).catch(function () {}); }); }); }
  function rec(kind, vol) { var a = audio(); if (!a) return true; var have = (REC[kind] || []).filter(function (n) { return buf[n]; }); if (!have.length) return false; try { var src = a.createBufferSource(), g = a.createGain(); src.buffer = buf[have[Math.floor(Math.random() * have.length)]]; src.playbackRate.value = rnd(0.94, 1.06); g.gain.value = vol == null ? 0.5 : vol; src.connect(g); g.connect(out); src.start(); return true; } catch (e) { return false; } }
  var SND = {
    sling: function () { if (rec('sling', 0.35)) return; grain(0, 0.22, 900, 0.7, 0.07); ping(240, 150, 0.16, 0.05); },
    // glass: a soft crack, then shards tinkling down
    glass: function () { var v = calm('glass', 45); if (!v || rec('glass', 0.45 * v)) return; ping(520, 340, 0.05, 0.05 * v); for (var i = 0; i < 4; i++) grain(rnd(0, 0.06), rnd(0.02, 0.04), rnd(4200, 7500), 2, 0.05 * v); for (i = 0; i < 8; i++) { var f = rnd(1900, 5600); ping(f, f * 0.985, rnd(0.25, 0.6), rnd(0.012, 0.03) * v, Math.pow(Math.random(), 1.6) * 0.5); } },
    // baggie: plastic crinkle
    bag: function () { var v = calm('bag', 60); if (!v || rec('bag', 0.45 * v)) return; var t = 0; for (var i = 0; i < 16; i++) { t += rnd(0.008, 0.045); grain(t, rnd(0.006, 0.02), rnd(2600, 6500), 1.2, rnd(0.02, 0.055) * v, 'highpass'); } },
    // needle: thin plastic cracking
    syr: function () { var v = calm('syr', 60); if (!v || rec('syr', 0.45 * v)) return; [0, 0.05, 0.12].forEach(function (t, i) { grain(t + rnd(0, 0.01), 0.012, rnd(1900, 2700), 7, (0.11 - i * 0.025) * v); }); ping(950, 700, 0.04, 0.03 * v, 0.004); },
    // pill bottle: chalk or soft rock crumbling
    pill: function () { var v = calm('pill', 60); if (!v || rec('pill', 0.45 * v)) return; ping(170, 110, 0.06, 0.06 * v); var t = 0; for (var i = 0; i < 16; i++) { t += rnd(0.01, 0.035); grain(t, rnd(0.025, 0.055), rnd(500, 1500), 2.2, rnd(0.03, 0.075) * v * (1 - i / 22)); } },
    // joint: dry leaves crumbling
    joint: function () { var v = calm('joint', 60); if (!v || rec('joint', 0.45 * v)) return; var t = 0; for (var i = 0; i < 20; i++) { t += Math.random() < 0.3 ? rnd(0.04, 0.09) : rnd(0.004, 0.02); grain(t, rnd(0.008, 0.03), rnd(2400, 5200), 0.9, rnd(0.015, 0.045) * v); } },
    wood: function () { var v = calm('wood', 50); if (!v || rec('wood', 0.4 * v)) return; ping(230, 140, 0.09, 0.08 * v); for (var i = 0; i < 3; i++) grain(rnd(0, 0.05), 0.03, rnd(700, 1200), 3, 0.045 * v); },
    steel: function () { var v = calm('steel', 80); if (!v || rec('steel', 0.4 * v)) return; ping(520, 516, 0.9, 0.04 * v); ping(1385, 1378, 0.6, 0.02 * v); },
    rock: function () { var v = calm('rock', 60); if (!v) return; ping(120, 80, 0.08, 0.07 * v); var t = 0; for (var i = 0; i < 10; i++) { t += rnd(0.01, 0.04); grain(t, rnd(0.03, 0.06), rnd(300, 900), 2, rnd(0.03, 0.06) * v); } },
    soft: function () { var v = calm('soft', 60); if (!v) return; for (var i = 0; i < 6; i++) grain(rnd(0, 0.2), rnd(0.03, 0.08), rnd(1200, 3000), 0.8, 0.03 * v); },
    knock: function (E) { if (!calm('knock', 90)) return; ping(140, 90, 0.07, Math.min(0.06, 0.012 + E * 0.004)); },
    // explosion: a deep, soft whoomp instead of a harsh bang
    blast: function () { var v = calm('blast', 120) || 0.4; if (rec('blast', 0.45 * v)) return; ping(85, 36, 0.8, 0.2 * v); grain(0, 0.7, 260, 0.6, 0.11 * v, 'lowpass'); for (var i = 0; i < 6; i++) grain(rnd(0.1, 0.7), 0.012, rnd(2000, 4000), 1, 0.02 * v, 'highpass'); },
    crackle: function () { if (!calm('crackle', 55)) return; grain(0, rnd(0.004, 0.012), rnd(1800, 4500), 1.5, rnd(0.015, 0.04), 'highpass'); },
    split: function () { ping(880, 870, 0.2, 0.04); ping(1320, 1310, 0.25, 0.03, 0.05); },
    win: function () { if (rec('win', 0.4)) return; [523, 659, 784, 1047].forEach(function (f, i) { ping(f, f * 0.997, 0.9, 0.06, i * 0.13); }); },
    fail: function () { if (rec('fail', 0.4)) return; ping(392, 388, 0.5, 0.05); ping(311, 308, 0.7, 0.05, 0.22); }
  };

  /* ---------- building a level ---------- */
  function wakeAll() { if (!M) return; M.Composite.allBodies(engine.world).forEach(function (b) { if (!b.isStatic) M.Sleeping.set(b, false); }); }
  function addObj(k, x, base, w) {
    var def = K[k], ww = w || def.w, hh = def.h;
    var body = M.Bodies.rectangle(x, GY - base - hh / 2, ww, hh, { friction: def.f, frictionStatic: 0.7, restitution: def.e, frictionAir: AIR, chamfer: k === 'keg' ? { radius: 6 } : null, slop: 0.02 });
    M.Body.setMass(body, def.kg * (w ? w / def.w : 1));
    var o = { body: body, k: k, def: def, w: ww, h: hh, hp: def.hp * (w ? Math.max(1, w / def.w) : 1), t: !!def.t, seed: Math.random() * 1000, fire: 0, rot: 0, alc: false, heat: 0 };
    o.max = o.hp; body.plugin.o = o; objs.push(o); M.Composite.add(engine.world, body); return o;
  }
  function build(n) {
    lvl = Math.max(0, Math.min(LEVELS.length - 1, n)); var L = LEVELS[lvl]; runId++;
    engine = M.Engine.create({ enableSleeping: true, positionIterations: 8, velocityIterations: 6 }); engine.gravity.x = 0; engine.gravity.y = 1; engine.gravity.scale = GS;
    objs = []; projs = []; parts = []; pops = []; scorch = []; booms = []; score = 0; used = 0; armed = false; drag = null; kb = null; pan = null; manual = false; flyT = quietT = endT = 0; shake = flash = slow = 0; sub = 0;
    M.Composite.add(engine.world, M.Bodies.rectangle(WW / 2, GY + 60, WW * 3, 120, { isStatic: true, friction: 0.8, frictionStatic: 0.9, restitution: 0.1 }));
    var x0 = 1e9, x1 = 0; L.items.forEach(function (i) { addObj(i.k, i.x, i.b, i.w); x0 = Math.min(x0, i.x); x1 = Math.max(x1, i.x); }); tower = { x0: x0 - 60, x1: x1 + 60 };
    shots = L.shots.slice(); state = 'aim'; tip = ''; tipT = 0;
    M.Events.on(engine, 'collisionStart', onHit);
    for (var s = 0; s < 240; s++) M.Engine.update(engine, DT);
    cam.x = 0; cam.z = FITZ; aimCam(); hud(); showTip();
  }
  function showTip() { if (headless) return; var t = shots[0]; if (t && P[t].tip && !save.seen[t]) { tip = P[t].tip; tipT = 420; save.seen[t] = 1; keep(); } }
  function targetsLeft() { var n = 0; for (var i = 0; i < objs.length; i++) if (objs[i].t) n++; return n; }
  function hud() { if (headless) return; elLv.textContent = 'Level ' + (lvl + 1); elScore.textContent = score.toLocaleString(); }

  /* ---------- hits, damage and breaking ---------- */
  function onHit(ev) {
    if (!armed) return;
    for (var i = 0; i < ev.pairs.length; i++) {
      var pr = ev.pairs[i], A = pr.bodyA.parent || pr.bodyA, B = pr.bodyB.parent || pr.bodyB, a = A.plugin.o, b = B.plugin.o;
      var va = vel(A), vb = vel(B), rel = toMs(Math.hypot(va.x - vb.x, va.y - vb.y));
      var ma = A.isStatic ? 0 : A.mass, mb = B.isStatic ? 0 : B.mass, red = !ma ? mb : (!mb ? ma : ma * mb / (ma + mb)), E = 0.5 * red * rel * rel;
      if (window.__slLog) window.__slLog.push([a ? a.k || a.type : 'ground', b ? b.k || b.type : 'ground', +E.toFixed(2), tick]);
      if (a && a.proj) touched(a, b, E); if (b && b.proj) touched(b, a, E);
      if (E < 0.02) continue;
      if (!headless && E > 0.15) { SND.knock(E); if (E > 1.5 && parts.length < 500) dust((A.position.x + B.position.x) / 2, Math.max(A.position.y, B.position.y), Math.min(8, 2 + E)); }
      var p = a && a.proj ? a : (b && b.proj ? b : null), o = p === a ? b : a;
      if (p && o && !o.proj) {   // a chip that breaks something keeps going with whatever energy is left over
        var v = vel(p.body), Ep = 0.5 * p.body.mass * Math.pow(toMs(Math.hypot(v.x, v.y)), 2), need = o.hp;
        hurt(o, E * 1.6);
        if (o.dead && Ep > need) { var k = Math.sqrt(1 - need / Ep) * 0.9; p.punch = { x: v.x * k, y: v.y * k }; }
      } else { if (a && !a.proj) hurt(a, E); if (b && !b.proj) hurt(b, E); }
    }
  }
  function touched(p, o, E) { if (!p.hit) { p.hit = true; if (p.type === 'bomb' && !p.used) p.fuse = 14; if (E > 4 && !headless) slow = Math.max(slow, 10); } }
  function hurt(o, dmg) { if (o.dead) return; o.hp -= dmg; if (o.hp <= 0) kill(o); }
  function kill(o) {
    if (o.dead) return; o.dead = true; M.Composite.remove(engine.world, o.body); objs.splice(objs.indexOf(o), 1); wakeAll();
    score += o.def.pts; var x = o.body.position.x, y = o.body.position.y, m = o.def.m, k = o.k;
    if (k === 'tnt') booms.push({ x: x, y: y, t: 5, R: 210, J: 4.5, E: 38 });
    else if (k === 'whiskey') splash(x, y, 'alc'); else if (k === 'moon') splash(x, y, 'rot');
    if (headless) return;
    hud(); pops.push({ x: x, y: y - 10, t: 0, s: '+' + o.def.pts });
    if (m === 'glass') { SND.glass(); burst(x, y, 16, o.def.c, 'tri', 1.3); burst(x, y, 6, '#ffffff', 'dot', 1); }
    else if (m === 'wood') { SND.wood(); burst(x, y, o.fire ? 6 : 12, o.fire ? '#2b1a12' : '#b98248', 'rect', 1.2); }
    else if (m === 'steel') { SND.steel(); burst(x, y, 12, '#9aa3ad', 'rect', 1.2); }
    else if (m === 'brick') { SND.rock(); burst(x, y, 12, '#a5543c', 'rect', 1.2); }
    else if (m === 'pill') { SND.pill(); burst(x, y, 6, o.def.c, 'tri', 1); burst(x, y, 14, '', 'pill', 1.2); }
    else if (m === 'bag') { SND.bag(); burst(x, y, 20, '#ffffff', 'dot', 1); }
    else if (m === 'syr') { SND.syr(); burst(x, y, 8, '#dfe9f5', 'rect', 1); }
    else if (m === 'joint') { SND.joint(); burst(x, y, 16, '#7d8a4a', 'dot', 0.9); burst(x, y, 6, '#efe6cf', 'rect', 0.8); }
    if (o.t) shake = Math.max(shake, 5);
  }
  function burst(x, y, n, col, shape, pw) { for (var i = 0; i < n; i++) { var a = Math.random() * 6.283, v = (2 + Math.random() * 6) * (pw || 1); parts.push({ x: x + (Math.random() - 0.5) * 14, y: y + (Math.random() - 0.5) * 20, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, life: 0, max: 40 + Math.random() * 40, col: shape === 'pill' ? ['#ff5964', '#ffd23a', '#58c7ff', '#ffffff'][i % 4] : col, s: 3 + Math.random() * 5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.6, shape: shape, bounce: 1 }); } }
  function dust(x, y, n) { for (var i = 0; i < n; i++) parts.push({ x: x + (Math.random() - 0.5) * 20, y: y, vx: (Math.random() - 0.5) * 2.4, vy: -Math.random() * 1.2, life: 0, max: 30 + Math.random() * 20, col: 'rgba(210,190,170,.5)', s: 8 + Math.random() * 10, rot: 0, vr: 0, shape: 'smoke', nog: 1 }); }
  // an explosion: a shove (newton-seconds), damage (joules) and heat, all fading with distance
  function boom(x, y, R, J, E) {
    objs.slice().forEach(function (o) { var dx = o.body.position.x - x, dy = o.body.position.y - y, d = Math.hypot(dx, dy); if (d > R || o.dead) return; var f = 1 - d / R, k = toPx(Math.min(14, J * f / o.body.mass)); M.Sleeping.set(o.body, false); var ov = vel(o.body); M.Body.setVelocity(o.body, { x: ov.x + dx / (d || 1) * k, y: ov.y + dy / (d || 1) * k - k * 0.25 }); M.Body.setAngularVelocity(o.body, M.Body.getAngularVelocity(o.body) + (Math.random() - 0.5) * 0.3 * f); hurt(o, E * f * f); if (!o.dead && f > 0.3) ignite(o); });
    projs.forEach(function (p) { var dx = p.body.position.x - x, dy = p.body.position.y - y, d = Math.hypot(dx, dy); if (d > R || d < 1) return; var k = toPx(Math.min(14, J * (1 - d / R) / p.body.mass)); var pv = vel(p.body); M.Body.setVelocity(p.body, { x: pv.x + dx / d * k, y: pv.y + dy / d * k }); });
    wakeAll(); if (headless) return;
    SND.blast(); shake = Math.max(shake, 16); flash = 1; slow = Math.max(slow, 26); pops.push({ x: x, y: y, t: 0, ring: R });
    if (y > GY - 70) scorch.push({ x: x, r: R * 0.45 });
    for (var i = 0; i < 46; i++) { var a = Math.random() * 6.283, v = 2 + Math.random() * 11; parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 0, max: 22 + Math.random() * 26, col: '', s: 10 + Math.random() * 18, rot: 0, vr: 0, shape: 'fire', nog: 1 }); }
    for (i = 0; i < 16; i++) { a = Math.random() * 6.283; v = 1 + Math.random() * 3; parts.push({ x: x + Math.cos(a) * 20, y: y + Math.sin(a) * 20, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, life: 0, max: 70 + Math.random() * 50, col: 'rgba(40,34,36,.55)', s: 18 + Math.random() * 22, rot: 0, vr: 0, shape: 'smoke', nog: 1 }); }
    burst(x, y, 18, '#ffd76a', 'dot', 2.2);
  }
  // a broken bottle of spirits soaks what is near it: whiskey feeds a fire, moonshine rots wood away
  function splash(x, y, kind) {
    var lit = false; objs.forEach(function (o) { if (o.fire && Math.hypot(o.body.position.x - x, o.body.position.y - y) < 150) lit = true; });
    objs.forEach(function (o) { var d = Math.hypot(o.body.position.x - x, o.body.position.y - y); if (d > 105 || o.dead) return; if (kind === 'rot') { if (o.def.m === 'wood' && !o.rot) o.rot = 1; } else { o.alc = true; if (lit) ignite(o); } });
    if (headless) return; SND.soft();
    for (var i = 0; i < 26; i++) { var a = Math.random() * 6.283, v = 2 + Math.random() * 6; parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, life: 0, max: 40 + Math.random() * 20, col: kind === 'rot' ? '#9dffcf' : '#ffb347', s: 4 + Math.random() * 3, rot: 0, vr: 0, shape: 'dot', bounce: 0 }); }
    pops.push({ x: x, y: y, t: 0, ring: 105, col: kind === 'rot' ? '160,255,205' : '255,180,80' });
  }
  function ignite(o) { if (o.dead || o.fire || !(o.def.b || o.alc)) return; o.fire = 1; }
  function near(a, b, gap) { var A = a.body.bounds, B = b.body.bounds; return A.min.x - gap < B.max.x && A.max.x + gap > B.min.x && A.min.y - gap < B.max.y && A.max.y + gap > B.min.y; }
  function burnTick() {
    for (var i = objs.length - 1; i >= 0; i--) {
      var o = objs[i]; if (!o) continue;
      if (o.rot) { o.rot++; o.hp -= o.max / 80; if (!headless && o.rot % 4 === 0) parts.push({ x: o.body.position.x + (Math.random() - 0.5) * o.w, y: o.body.position.y + o.h / 2, vx: 0, vy: 1, life: 0, max: 30, col: '#9dffcf', s: 4, rot: 0, vr: 0, shape: 'dot' }); if (o.hp <= 0) { kill(o); continue; } }
      if (!o.fire) continue; o.fire++; if (!headless && Math.random() < 0.35) SND.crackle();
      var b = o.def.b || 'wood', f = o.fire;
      if (!headless && f % 2 === 0 && parts.length < 600) { var bx = o.body.bounds; parts.push({ x: bx.min.x + Math.random() * (bx.max.x - bx.min.x), y: bx.min.y + Math.random() * (bx.max.y - bx.min.y) * 0.6, vx: (Math.random() - 0.5) * 0.8, vy: -1.2 - Math.random() * 1.6, life: 0, max: 20 + Math.random() * 16, col: '', s: 7 + Math.random() * 9, rot: 0, vr: 0, shape: 'fire', nog: 1 }); if (f % 12 === 0) parts.push({ x: o.body.position.x, y: bx.min.y, vx: (Math.random() - 0.5) * 0.6, vy: -1.4, life: 0, max: 70, col: 'rgba(40,34,36,.4)', s: 12 + Math.random() * 10, rot: 0, vr: 0, shape: 'smoke', nog: 1 }); }
      if (b === 'tnt') { if (f > 20) kill(o); continue; }
      if (b === 'liq') { if (f > 26) { var x = o.body.position.x, y = o.body.position.y, k = o.k; kill(o); if (k === 'whiskey') { booms.push({ x: x, y: y, t: 1, R: 120, J: 1.2, E: 6 }); } } continue; }
      if (b === 'melt') { if (f > 24) kill(o); continue; }
      if (b === 'crack') { if (f > 80) kill(o); continue; }
      o.hp -= o.max / (o.alc ? 60 : 130);   // wood: about two seconds to burn through, one if it is soaked in whiskey
      if (f % 10 === 0) for (var j = 0; j < objs.length; j++) { var q = objs[j]; if (q !== o && !q.fire && (q.def.b || q.alc) && near(o, q, q.alc ? 34 : 16) && (q.alc || f > 24)) ignite(q); }
      if (o.hp <= 0) kill(o);
    }
    for (i = booms.length - 1; i >= 0; i--) { var e = booms[i]; if (--e.t <= 0) { booms.splice(i, 1); boom(e.x, e.y, e.R, e.J, e.E); } }
  }
  function busy() { if (booms.length) return true; for (var i = 0; i < objs.length; i++) if (objs[i].fire || objs[i].rot) return true; return false; }
  function removeProj(p) { var i = projs.indexOf(p); if (i >= 0) projs.splice(i, 1); M.Composite.remove(engine.world, p.body); }

  /* ---------- the sling ---------- */
  function mkProj(type, x, y, vx, vy, small) {
    var def = P[type], rr = small ? 9 : def.r;
    var body = M.Bodies.circle(x, y, rr, { friction: 0.45, restitution: 0.3, frictionAir: AIR }); M.Body.setMass(body, small ? def.kg / 3 : def.kg);
    var p = { body: body, proj: true, type: type, r: rr, hit: false, used: false, fuse: 0, age: 0, punch: null, trail: [] };
    body.plugin.o = p; M.Composite.add(engine.world, body); M.Body.setVelocity(body, { x: vx, y: vy }); projs.push(p); return p;
  }
  function launch(dx, dy) {
    var type = shots.shift(); armed = true; used++; wakeAll();
    var d = Math.hypot(dx, dy) || 1, v = toPx(launchSpeed(d, P[type].kg));
    mkProj(type, SX + dx, SY + dy, -dx / d * v, -dy / d * v);
    state = 'fly'; flyT = quietT = 0; drag = null; kb = null; manual = false; tipT = Math.min(tipT, 60); if (!headless) SND.sling();
  }
  function split(p) { p.used = true; var v = vel(p.body), x = p.body.position.x, y = p.body.position.y; [-0.16, 0.16].forEach(function (a) { var c = Math.cos(a), s = Math.sin(a), q = mkProj('trio', x, y + (a > 0 ? 14 : -14), v.x * c - v.y * s, v.x * s + v.y * c, true); q.used = true; }); M.Body.scale(p.body, 9 / p.r, 9 / p.r); M.Body.setMass(p.body, P.trio.kg / 3); p.r = 9; if (!headless) SND.split(); }
  function blowUp(p) { p.used = true; var x = p.body.position.x, y = p.body.position.y; removeProj(p); boom(x, y, 240, 6, 46); }
  function ability() {
    for (var i = projs.length - 1; i >= 0; i--) { var p = projs[i]; if (p.used) continue;
      if (p.type === 'trio' && !p.hit) { split(p); return true; }
      if (p.type === 'bomb') { blowUp(p); return true; }
    }
    return false;
  }
  function nextShot() {
    projs.slice().forEach(function (p) { if (!headless) burst(p.body.position.x, p.body.position.y, 6, '#ffd76a', 'dot', 1); removeProj(p); });
    state = 'aim'; flyT = quietT = 0; manual = false; showTip();
  }

  /* ---------- one step of the physics, and one tick (1/60 s of game time) of the rules ---------- */
  function substep() {
    M.Engine.update(engine, DT);
    for (var i = 0; i < projs.length; i++) { var p = projs[i]; if (p.punch) { M.Body.setVelocity(p.body, p.punch); p.punch = null; } }
    if (++sub % NSUB === 0) logic();
  }
  function logic() {
    tick++; burnTick();
    var i, o, moving = busy();
    for (i = objs.length - 1; i >= 0; i--) { o = objs[i]; var p = o.body.position; if (p.y > H + 80 || p.x > WW + 200 || p.x < -260) { kill(o); continue; } if (!o.body.isSleeping && spd(o.body) > 0.3) moving = true; }
    for (i = projs.length - 1; i >= 0; i--) { var q = projs[i]; q.age++; var bp = q.body.position;
      if (q.type === 'trio' && !q.used && !q.hit && q.age === 16) split(q);
      if (q.fuse && --q.fuse === 0 && !q.used) { blowUp(q); continue; }
      if (bp.y > H + 80 || bp.x > WW + 200 || bp.x < -260) { removeProj(q); continue; }
      if (!q.body.isSleeping && spd(q.body) > 0.35) moving = true;
      if (!headless && spd(q.body) > 4 && tick % 2 === 0) { q.trail.push({ x: bp.x, y: bp.y }); if (q.trail.length > 14) q.trail.shift(); } }
    if (state === 'aim' && armed && !targetsLeft()) { if (++endT > 50) finish(true); }
    if (state === 'fly') {
      flyT++; quietT = moving ? 0 : quietT + 1;
      var left = targetsLeft();
      if (!left) { if (++endT > 70) finish(true); }
      else if ((quietT > 45 && flyT > 50) || flyT > 900) { if (shots.length) nextShot(); else finish(false); }
    }
    if (tipT > 0) tipT--;
  }
  function finish(won) {
    if (state === 'done') return; state = 'done';
    var spare = shots.length, stars = 0;
    if (won) { score += spare * 1000 + (used === 1 ? 5000 : 0); stars = used <= 2 ? 3 : used === 3 ? 2 : 1; save.stars[lvl] = Math.max(save.stars[lvl] || 0, stars); save.best[lvl] = Math.max(save.best[lvl] || 0, score); save.open = Math.max(save.open, Math.min(LEVELS.length, lvl + 2)); keep(); }
    if (headless) return;
    hud(); if (won) SND.win(); else SND.fail();
    var id = runId; setTimeout(function () { if (id === runId && state === 'done') panel(won ? 'win' : 'fail', stars); }, won ? 900 : 400);
  }

  /* ---------- overlay panels ---------- */
  function starRow(n) { var s = ''; for (var i = 0; i < 3; i++) s += '<span class="' + (i < n ? 'on' : '') + '">&#9733;</span>'; return '<div class="sl-stars" aria-label="' + n + ' of 3 stars">' + s + '</div>'; }
  function panel(kind, stars) {
    var h = '';
    if (kind === 'intro') h = '<h3>Smash the Stash</h3><p>Pull back the sling and let a sobriety chip fly. Smash every bottle, pill bottle, baggie, needle and joint. Hit the TNT, start a fire or break the moonshine to bring a whole tower down. Clear a level in one or two shots for three stars.</p><div class="sl-act"><button type="button" class="btn btn-primary" data-a="play">' + (save.open > 1 ? 'Keep going' : 'Play') + '</button>' + (save.open > 1 ? '<button type="button" class="btn" data-a="levels">Levels</button>' : '') + '</div>';
    else if (kind === 'win') { var lastL = lvl === LEVELS.length - 1; h = '<h3>' + (used === 1 ? 'One shot!' : lastL ? 'Last call is cancelled' : 'Stash smashed') + '</h3>' + starRow(stars) + '<p>Score <b>' + score.toLocaleString() + '</b> in ' + used + ' shot' + (used > 1 ? 's' : '') + '.' + (stars < 3 ? ' Clear it in two shots or fewer for three stars.' : '') + (lastL ? ' You cleared every tower in this world.' : '') + '</p><div class="sl-act">' + (lastL ? '' : '<button type="button" class="btn btn-primary" data-a="next">Next level</button>') + '<button type="button" class="btn" data-a="retry">Replay</button><button type="button" class="btn" data-a="levels">Levels</button></div>'; }
    else if (kind === 'fail') { var n = targetsLeft(); h = '<h3>So close</h3><p>' + n + ' still standing. Cravings pass, and so do bad rounds. Go again.</p><div class="sl-act"><button type="button" class="btn btn-primary" data-a="retry">Try again</button><button type="button" class="btn" data-a="levels">Levels</button></div>'; }
    else if (kind === 'levels') { h = '<h3>World 1: ' + WORLD + '</h3><div class="sl-grid">'; LEVELS.forEach(function (L, i) { var open = i < save.open, st = save.stars[i] || 0; h += '<button type="button" data-l="' + i + '"' + (open ? '' : ' disabled') + ' aria-label="Level ' + (i + 1) + ', ' + L.name + (open ? '' : ', locked') + '"><b>' + (open ? i + 1 : '&#128274;') + '</b><small>' + L.name + '</small><i>' + (open ? '&#9733;'.repeat(st) + '<u>' + '&#9733;'.repeat(3 - st) + '</u>' : '') + '</i></button>'; }); h += '</div><p style="margin-top:10px;font-size:.8rem">More worlds are on the way.</p>'; }
    over.innerHTML = '<div>' + h + '</div>'; over.hidden = false;
  }
  over.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return; audio(); preload();
    if (b.dataset.l != null) return start(+b.dataset.l);
    var a = b.dataset.a; if (a === 'play') start(Math.min(save.open, LEVELS.length) - 1); else if (a === 'next') start(lvl + 1); else if (a === 'retry') start(lvl); else if (a === 'levels') panel('levels');
  });
  function start(n) { need(function () { over.hidden = true; build(n); go(); }); }

  /* ---------- the camera: the whole scene while you aim, then it follows the shot and closes in on the tower ---------- */
  function clampCam(c) { c.z = Math.max(FITZ, Math.min(1.25, c.z)); c.x = Math.max(0, Math.min(WW - W / c.z, c.x)); }
  function aimCam() { camT.x = 0; camT.z = FITZ; }
  function camTick() {
    if (!manual) {
      if (state === 'aim' || state === 'menu') aimCam();
      else { var lead = null; for (var i = 0; i < projs.length; i++) if (!projs[i].hit && (!lead || projs[i].body.position.x > lead.body.position.x)) lead = projs[i];
        var tz = Math.max(FITZ, Math.min(0.95, W / (tower.x1 - tower.x0 + 260)));
        if (lead && lead.body.position.x < tower.x0 - 80) { camT.z = Math.max(FITZ, tz * 0.85); camT.x = lead.body.position.x - (W / camT.z) * 0.35; }
        else { camT.z = tz; camT.x = (tower.x0 + tower.x1) / 2 - (W / tz) / 2; } }
    }
    clampCam(camT); cam.z += (camT.z - cam.z) * 0.07; cam.x += (camT.x - cam.x) * 0.09; clampCam(cam);
  }
  function toWorld(s) { return { x: cam.x + s.x / cam.z, y: H - (H - s.y) / cam.z }; }

  /* ---------- drawing ---------- */
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
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
  function backdrop() {
    bg = document.createElement('canvas'); bg.width = 1300; bg.height = H; var c = bg.getContext('2d'), g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#140b2c'); g.addColorStop(0.42, '#4b2357'); g.addColorStop(0.74, '#d9603f'); g.addColorStop(0.92, '#ffc46b'); g.addColorStop(1, '#ffd58a'); c.fillStyle = g; c.fillRect(0, 0, 1300, H);
    for (var i = 0; i < 90; i++) { c.fillStyle = 'rgba(255,255,255,' + (0.15 + Math.random() * 0.5) + ')'; c.fillRect(Math.random() * 1300, Math.random() * 210, 1.5, 1.5); }
    var sg = c.createRadialGradient(820, 470, 10, 820, 470, 260); sg.addColorStop(0, 'rgba(255,240,190,.95)'); sg.addColorStop(0.25, 'rgba(255,200,110,.55)'); sg.addColorStop(1, 'rgba(255,160,80,0)'); c.fillStyle = sg; c.fillRect(520, 200, 600, 340);
    c.fillStyle = '#fff3c4'; c.beginPath(); c.arc(820, 478, 62, Math.PI, 0); c.fill();
    function hills(col, base, amp, f, ph) { c.fillStyle = col; c.beginPath(); c.moveTo(0, H); for (var x = 0; x <= 1300; x += 8) c.lineTo(x, base - Math.sin(x * f + ph) * amp - Math.sin(x * f * 2.3 + ph * 2) * amp * 0.4); c.lineTo(1300, H); c.fill(); }
    hills('rgba(74,34,84,.75)', 430, 28, 0.008, 1); hills('#2c1436', 468, 20, 0.013, 4);
  }
  function drawNew(o) {   // brick, TNT, moonshine and joints; everything else is drawn by drawObj
    var b = o.body, w = o.w, h = o.h, k = o.k; ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle);
    if (k === 'brick') { ctx.fillStyle = '#a5543c'; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.strokeStyle = '#5e2a1c'; ctx.lineWidth = 2; ctx.strokeRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2); ctx.strokeStyle = 'rgba(60,24,14,.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); ctx.moveTo(0, -h / 2); ctx.lineTo(0, 0); ctx.moveTo(-w / 4, 0); ctx.lineTo(-w / 4, h / 2); ctx.moveTo(w / 4, 0); ctx.lineTo(w / 4, h / 2); ctx.stroke(); cracks(o); }
    else if (k === 'tnt') { ctx.fillStyle = '#c8281e'; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.strokeStyle = '#5c0d08'; ctx.lineWidth = 2; ctx.strokeRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2); ctx.fillStyle = '#f6e7c8'; ctx.fillRect(-w / 2 + 2, -8, w - 4, 16); ctx.fillStyle = '#1b0503'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('TNT', 0, 1); ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(4, -h / 2); ctx.quadraticCurveTo(10, -h / 2 - 8, 14, -h / 2 - 4); ctx.stroke(); if (Math.sin(tick / 6 + o.seed) > 0) { ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(14, -h / 2 - 4, 2.5, 0, 6.283); ctx.fill(); } }
    else if (k === 'joint') { ctx.fillStyle = '#efe6cf'; ctx.beginPath(); ctx.moveTo(-w / 2, -1.5); ctx.lineTo(w / 2 - 6, -h / 2); ctx.lineTo(w / 2 - 6, h / 2); ctx.lineTo(-w / 2, 1.5); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(120,105,70,.8)'; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = '#cdbf9a'; ctx.fillRect(-w / 2, -1.5, 7, 3); ctx.strokeStyle = '#b9a97c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w / 2 - 6, 0); ctx.lineTo(w / 2, -2); ctx.stroke(); ctx.strokeStyle = 'rgba(120,105,70,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-6, -2.5); ctx.lineTo(-2, 2.5); ctx.moveTo(6, -3); ctx.lineTo(10, 3); ctx.stroke(); }
    else if (k === 'moon') { ctx.fillStyle = '#8d8676'; ctx.fillRect(-9, -h / 2, 18, 6); ctx.fillStyle = 'rgba(205,245,232,.55)'; rr(-w / 2, -h / 2 + 5, w, h - 5, 5); ctx.fill(); ctx.strokeStyle = 'rgba(230,255,246,.9)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = 'rgba(150,255,205,.5)'; ctx.fillRect(-w / 2 + 2, -h / 2 + 12, w - 4, h - 14); ctx.fillStyle = '#12301f'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('XXX', 0, 4); }
    ctx.restore();
  }
  function drawProj(type, x, y, r, ang, whole) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    if (type === 'trio' && whole) { for (var i = 0; i < 3; i++) { var a = i * 2.094 - 0.5; drawProj('white', Math.cos(a) * 6, Math.sin(a) * 6, 8.5, 0, false); } ctx.restore(); return; }
    if (type === 'bomb') {
      var bgd = ctx.createRadialGradient(-r * 0.35, -r * 0.4, 1, 0, 0, r); bgd.addColorStop(0, '#6b6f78'); bgd.addColorStop(0.5, '#23252b'); bgd.addColorStop(1, '#050506'); ctx.fillStyle = bgd; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#3a3d44'; ctx.fillRect(-4, -r - 4, 8, 6); ctx.strokeStyle = '#c9a36a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -r - 4); ctx.quadraticCurveTo(7, -r - 12, 11, -r - 7); ctx.stroke();
      var sp = 3 + Math.sin(tick / 2) * 1.5; ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(11, -r - 7, sp, 0, 6.283); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(11, -r - 7, sp * 0.45, 0, 6.283); ctx.fill();
      ctx.restore(); return;
    }
    var c = (P[type] || P.white).c, g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, 1, 0, 0, r); g.addColorStop(0, c[0]); g.addColorStop(0.6, c[1]); g.addColorStop(1, c[2]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, r * 0.74, 0, 6.283); ctx.stroke();
    var lab = (P[type] || {}).lab; if (lab && r > 9.5) { ctx.fillStyle = c[3]; ctx.font = 'bold ' + Math.round(r * 0.72) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lab, 0, 0.5); }
    ctx.restore();
  }
  function curPull() {
    var d = drag;
    if (!d && kb) { var lv = Math.min(1, (performance.now() - kb.t) / 1050), a = kbAng * Math.PI / 180; d = { x: -Math.cos(a) * MAXPULL * lv, y: Math.sin(a) * MAXPULL * lv }; }
    if (!d) return null;
    var raw = Math.hypot(d.x, d.y) / MAXPULL;
    if (raw > 0.85) { var sh = Math.sin(performance.now() * 0.047) * ((raw - 0.85) / 0.15) * 0.03, c = Math.cos(sh), n = Math.sin(sh); d = { x: d.x * c - d.y * n, y: d.x * n + d.y * c }; }
    return d;
  }
  function pouch() { var d = curPull(); return d ? { x: SX + d.x, y: SY + d.y } : { x: SX, y: SY }; }
  function draw(fr) {
    var sc = cv.width / W; ctx.setTransform(sc, 0, 0, sc, 0, 0);
    if (!bg) backdrop();
    ctx.drawImage(bg, -Math.min(340, cam.x * 0.22) - (cam.z - FITZ) * 60, 0);
    var z = cam.z, sx = shake > 0.3 ? (Math.random() - 0.5) * shake : 0, sy = shake > 0.3 ? (Math.random() - 0.5) * shake : 0;
    ctx.setTransform(sc * z, 0, 0, sc * z, (-cam.x * z + sx) * sc, (H - H * z + sy) * sc);
    var gg = ctx.createLinearGradient(0, GY, 0, GY + 120); gg.addColorStop(0, '#2a1218'); gg.addColorStop(1, '#0b0406'); ctx.fillStyle = gg; ctx.fillRect(-400, GY, WW + 800, 400); ctx.fillStyle = '#6b2f24'; ctx.fillRect(-400, GY, WW + 800, 3);
    var i; for (i = 0; i < scorch.length; i++) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.ellipse(scorch[i].x, GY + 3, scorch[i].r, 7, 0, 0, 6.283); ctx.fill(); }
    var p = pouch(), loaded = state === 'aim' && shots.length;
    ctx.lineCap = 'round'; ctx.strokeStyle = '#4a2a12'; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(SX + 4, SY + 40); ctx.lineTo(SX + 20, SY - 14); ctx.stroke();
    if (loaded) { ctx.strokeStyle = '#3a1410'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(SX + 20, SY - 12); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    for (i = 0; i < objs.length; i++) { var o = objs[i]; if (o.k === 'brick' || o.k === 'tnt' || o.k === 'moon' || o.k === 'joint') drawNew(o); else drawObj(o);
      if (o.alc || o.rot || o.fire) { var bd = o.body; ctx.save(); ctx.translate(bd.position.x, bd.position.y); ctx.rotate(bd.angle); ctx.fillStyle = o.fire ? 'rgba(20,8,4,' + Math.min(0.6, o.fire / 140) + ')' : o.rot ? 'rgba(120,255,190,' + Math.min(0.55, 0.2 + o.rot / 160) + ')' : 'rgba(255,170,60,.28)'; ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h); ctx.restore(); } }
    var pl = loaded ? curPull() : null;
    if (pl) {
      var pd = Math.hypot(pl.x, pl.y) || 1, v0 = launchSpeed(pd, P[shots[0]].kg), vv = toPx(v0) / NSUB, vx = -pl.x / pd * vv, vy = -pl.y / pd * vv, x = p.x, y = p.y, fa = 1 - AIR * (DT / STEP), gd = GS * DT * DT;
      for (var s = 1; s <= 520; s++) { vx *= fa; vy = vy * fa + gd; x += vx; y += vy; if (y > GY || x > WW) break; if (s % 10 === 0) { ctx.fillStyle = 'rgba(255,255,255,' + Math.max(0.15, 0.95 - s / 560) + ')'; ctx.beginPath(); ctx.arc(x, y, Math.max(2, 5 - s / 130) / Math.max(0.7, z), 0, 6.283); ctx.fill(); } }
    } else if (loaded) { var gl = 0.5 + 0.5 * Math.sin(tick / 11); ctx.strokeStyle = 'rgba(255,226,122,' + (0.3 + gl * 0.6) + ')'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y, P[shots[0]].r + 8 + gl * 5, 0, 6.283); ctx.stroke(); }
    if (loaded) drawProj(shots[0], p.x, p.y, P[shots[0]].r, 0, true);
    for (i = 0; i < projs.length; i++) { var q = projs[i]; for (var t = 0; t < q.trail.length; t++) { ctx.fillStyle = 'rgba(255,240,200,' + (t / q.trail.length * 0.5) + ')'; ctx.beginPath(); ctx.arc(q.trail[t].x, q.trail[t].y, q.r * (0.25 + t / q.trail.length * 0.5), 0, 6.283); ctx.fill(); } drawProj(q.type, q.body.position.x, q.body.position.y, q.r, q.body.angle, q.type === 'trio' && !q.used); }
    if (loaded) { ctx.strokeStyle = '#5a1e17'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(SX - 16, SY - 12); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    else { ctx.strokeStyle = '#5a1e17'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(SX - 16, SY - 12); ctx.quadraticCurveTo(SX, SY + 12, SX + 20, SY - 12); ctx.stroke(); }
    ctx.strokeStyle = '#6b3e1c'; ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(SX, GY); ctx.lineTo(SX, SY + 44); ctx.lineTo(SX - 16, SY - 14); ctx.stroke();
    for (i = loaded ? 1 : 0; i < shots.length; i++) { var qx = SX - 60 - (i - (loaded ? 1 : 0)) * 44; if (qx < 16) break; drawProj(shots[i], qx, GY - P[shots[i]].r - 1, P[shots[i]].r, 0, true); }
    ctx.globalCompositeOperation = 'source-over';
    for (i = 0; i < parts.length; i++) { var a = parts[i], al = 1 - a.life / a.max;
      if (a.shape === 'fire') { var hot = al; ctx.globalAlpha = Math.min(1, al * 1.4); ctx.fillStyle = hot > 0.66 ? '#fff3b0' : hot > 0.4 ? '#ffb02e' : hot > 0.2 ? '#f0521a' : '#5a1a10'; ctx.beginPath(); ctx.arc(a.x, a.y, a.s * (0.4 + al * 0.6), 0, 6.283); ctx.fill(); continue; }
      if (a.shape === 'smoke') { ctx.globalAlpha = al * 0.8; ctx.fillStyle = a.col; ctx.beginPath(); ctx.arc(a.x, a.y, a.s * (1.6 - al * 0.8), 0, 6.283); ctx.fill(); continue; }
      ctx.globalAlpha = Math.min(1, al * 1.6); ctx.fillStyle = a.col; ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.rot); if (a.shape === 'tri') { ctx.beginPath(); ctx.moveTo(-a.s, a.s * 0.6); ctx.lineTo(a.s, a.s * 0.4); ctx.lineTo(0, -a.s); ctx.fill(); } else if (a.shape === 'rect') ctx.fillRect(-a.s, -2, a.s * 2, 4); else if (a.shape === 'pill') { rr(-5, -2.5, 10, 5, 2.5); ctx.fill(); } else { ctx.beginPath(); ctx.arc(0, 0, a.s * 0.5, 0, 6.283); ctx.fill(); } ctx.restore(); }
    ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (i = 0; i < pops.length; i++) { var po = pops[i], f = po.t / 50; if (po.ring) { ctx.strokeStyle = 'rgba(' + (po.col || '255,230,170') + ',' + (1 - f) + ')'; ctx.lineWidth = 10 * (1 - f); ctx.beginPath(); ctx.arc(po.x, po.y, po.ring * Math.min(1, f * 2.4), 0, 6.283); ctx.stroke(); } else { ctx.globalAlpha = 1 - f; ctx.font = 'bold ' + Math.round(17 / Math.max(0.7, z)) + 'px sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(po.s, po.x, po.y - f * 40); ctx.fillStyle = '#ffe27a'; ctx.fillText(po.s, po.x, po.y - f * 40); ctx.globalAlpha = 1; } }
    // everything below is drawn straight onto the screen, not into the scene
    ctx.setTransform(sc, 0, 0, sc, 0, 0);
    if (flash > 0.02) { ctx.fillStyle = 'rgba(255,240,200,' + flash * 0.55 + ')'; ctx.fillRect(0, 0, W, H); }
    var left = targetsLeft(); ctx.font = 'bold 15px sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(0,0,0,.45)'; rr(W - 178, 12, 166, 28, 14); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(left + ' left to smash', W - 26, 27);
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(0,0,0,.45)'; rr(12, 12, 200, 28, 14); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText((lvl + 1) + '. ' + LEVELS[lvl].name, 26, 27);
    if (pl) { var pct = Math.round(Math.hypot(pl.x, pl.y) / MAXPULL * 100), mph = Math.round(launchSpeed(Math.hypot(pl.x, pl.y), P[shots[0]].kg) * 2.23694), lab = P[shots[0]].name + '  ' + pct + '%  ' + mph + ' mph'; ctx.textAlign = 'center'; ctx.font = 'bold 15px sans-serif'; var lw = ctx.measureText(lab).width + 24; ctx.fillStyle = 'rgba(10,3,8,.8)'; rr(W / 2 - lw / 2, H - 44, lw, 28, 14); ctx.fill(); ctx.fillStyle = pct > 85 ? '#ffd23a' : '#fff'; ctx.fillText(lab, W / 2, H - 30); }
    else if (loaded && armed === false && lvl > 0) { ctx.textAlign = 'center'; ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillText('Up next: ' + P[shots[0]].name, W / 2, H - 28); }
    if (tipT > 0 && tip) { ctx.globalAlpha = Math.min(1, tipT / 40); ctx.textAlign = 'center'; ctx.font = 'bold 17px sans-serif'; var tw = ctx.measureText(tip).width + 36; ctx.fillStyle = 'rgba(10,3,8,.8)'; rr(W / 2 - tw / 2, 58, tw, 36, 18); ctx.fill(); ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillText(tip, W / 2, 77); ctx.globalAlpha = 1; }
    if (state === 'aim' && !drag && !kb && !armed && lvl === 0 && shots.length) { var bob = Math.sin(tick / 14) * 4, hp = { x: (SX - cam.x) * z, y: H - (H - SY) * z }; ctx.textAlign = 'left'; ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fillText('Pull the glowing chip back and let go', hp.x + 30, hp.y - 46 + bob); }
  }
  function visuals(k) {   // sparks, smoke and labels move in real time, slowed with the action
    var i; for (i = parts.length - 1; i >= 0; i--) { var a = parts[i]; a.life += k; if (a.life > a.max) { parts.splice(i, 1); continue; } a.x += a.vx * k; a.y += a.vy * k; if (!a.nog) { a.vy += 0.35 * k; if (a.bounce && a.y > GY - 2 && a.vy > 0) { a.y = GY - 2; a.vy *= -0.35; a.vx *= 0.6; a.vr *= 0.5; } } else { a.vx *= 0.94; a.vy *= 0.94; if (a.shape !== 'dot') a.vy -= 0.03 * k; } a.rot += a.vr * k; }
    for (i = pops.length - 1; i >= 0; i--) { pops[i].t += k; if (pops[i].t > 50) pops.splice(i, 1); }
    if (shake > 0) shake *= 0.88; if (flash > 0) flash *= 0.8;
  }

  /* ---------- running the game ---------- */
  function size() { var r = cv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1), w = Math.max(320, Math.round(r.width * d)); if (cv.width !== w) { cv.width = w; cv.height = Math.round(w * H / W); } }
  function frame(t) {
    if (!running) return; raf = requestAnimationFrame(frame); var dt = Math.min(50, t - last); last = t;
    if (engine && state !== 'menu') { var rate = slow > 0 ? 0.25 : 1; if (slow > 0) slow--; acc += dt * rate; var n = 0; while (acc >= DT && n < NSUB * 2) { substep(); acc -= DT; n++; } if (acc > DT) acc = 0; visuals(rate * dt / STEP); camTick(); draw(); }
  }
  function go() { if (running || root.hidden || !engine) return; var v = document.querySelector('[data-view="craving"]'); if (v && v.hidden) return; running = true; last = performance.now(); acc = 0; size(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  function need(cb) { if (window.Matter) { M = window.Matter; return cb(); } var s = document.createElement('script'); s.src = 'js/vendor/matter.min.js?v=0.19.0'; s.onload = function () { M = window.Matter; cb(); }; s.onerror = function () { over.innerHTML = '<div><h3>Could not load the game</h3><p>Check your connection and try again.</p></div>'; over.hidden = false; }; document.head.appendChild(s); }

  /* ---------- pointer: pull the sling, or drag the scene to look around ---------- */
  function pt(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
  function pull(w) { var dx = w.x - SX, dy = w.y - SY, d = Math.hypot(dx, dy); if (d > MAXPULL) { dx *= MAXPULL / d; dy *= MAXPULL / d; } if (dx > 40) dx = 40; return { x: dx, y: dy }; }
  function say(t) { tip = t; tipT = 170; }
  cv.addEventListener('pointerdown', function (e) {
    if (state === 'menu' || state === 'done' || !engine) return; e.preventDefault(); audio(); var s = pt(e), w = toWorld(s);
    try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    if (state === 'aim' && shots.length && Math.hypot(w.x - SX, w.y - SY) < 90 / Math.max(0.6, cam.z) + 40) { drag = pull(w); return; }
    if (state === 'fly' && ability()) return;
    pan = { sx: s.x, cx: cam.x, moved: false };
  });
  cv.addEventListener('pointermove', function (e) {
    if (drag) { e.preventDefault(); drag = pull(toWorld(pt(e))); }
    else if (pan) { var s = pt(e); if (Math.abs(s.x - pan.sx) > 6) pan.moved = true; if (pan.moved) { manual = true; camT.z = cam.z; camT.x = pan.cx - (s.x - pan.sx) / cam.z; clampCam(camT); cam.x = camT.x; } }
  });
  function release() {
    if (pan) { var was = pan; pan = null; if (!was.moved && state === 'fly' && flyT > 80 && shots.length && targetsLeft() && !busy()) nextShot(); return; }
    if (!drag) return; var d = curPull(); if (Math.hypot(d.x, d.y) < 22) { drag = null; say('Pull it back further, then let go.'); return; } launch(d.x, d.y);
  }
  cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', function () { drag = null; pan = null; });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  cv.addEventListener('wheel', function (e) { if (!engine || state === 'menu') return; e.preventDefault(); manual = true; var s = pt(e), w = toWorld(s); camT.z = cam.z * (e.deltaY < 0 ? 1.12 : 0.89); clampCam(camT); camT.x = w.x - s.x / camT.z; clampCam(camT); }, { passive: false });

  /* ---------- buttons, tabs and pausing ---------- */
  $('sl-restart').addEventListener('click', function () { if (engine) start(lvl); });
  $('sl-levels').addEventListener('click', function () { panel('levels'); });
  if (btnView) btnView.addEventListener('click', function () { if (!engine) return; if (manual && cam.z > FITZ + 0.1) { manual = false; return; } manual = true; camT.z = Math.max(FITZ, Math.min(1, W / (tower.x1 - tower.x0 + 200))); camT.x = (tower.x0 + tower.x1) / 2 - (W / camT.z) / 2; clampCam(camT); });
  function muteLabel() { btnMute.textContent = save.mute ? 'Sound: off' : 'Sound: on'; btnMute.setAttribute('aria-pressed', String(save.mute)); }
  btnMute.addEventListener('click', function () { save.mute = !save.mute; keep(); muteLabel(); }); muteLabel();
  document.addEventListener('keydown', function (e) { if (root.hidden || !running || /input|textarea|select/i.test((e.target.tagName || ''))) return;
    if (e.key === 'r' || e.key === 'R') start(lvl);
    else if (e.key === ' ' && state === 'fly') { e.preventDefault(); ability(); }
    else if (e.key === ' ' && state === 'aim' && shots.length && !drag) { e.preventDefault(); if (!kb && !e.repeat) { audio(); kb = { t: performance.now() }; } }
    else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && state === 'aim') { e.preventDefault(); kbAng = Math.max(0, Math.min(80, kbAng + (e.key === 'ArrowUp' ? 2 : -2))); if (!kb && !drag) say('Aim ' + kbAng + ' degrees. Hold Space to pull back, let go to fire.'); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); manual = true; camT.z = cam.z; camT.x = cam.x + (e.key === 'ArrowRight' ? 140 : -140); clampCam(camT); } });
  document.addEventListener('keyup', function (e) { if (e.key !== ' ' || !kb) return; var d = curPull(); kb = null; if (state !== 'aim' || root.hidden) return; if (Math.hypot(d.x, d.y) < 22) { say('Hold Space longer, then let go.'); return; } launch(d.x, d.y); });
  function still() { size(); if (!bg) backdrop(); var sc = cv.width / W; ctx.setTransform(sc, 0, 0, sc, 0, 0); ctx.drawImage(bg, 0, 0); }
  document.addEventListener('ss:cvgame', function (e) { if (e.detail === 'sl') { if (!engine) { panel('intro'); still(); } go(); } else stop(); });
  document.addEventListener('ss:route', function (e) { if (e.detail.name !== 'craving') stop(); else if (!root.hidden) go(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else if (!root.hidden) go(); });
  window.addEventListener('resize', function () { if (running) size(); else if (!root.hidden && !engine) still(); });
  panel('intro');

  /* ---------- test hooks: play a level with no picture, as fast as the computer can ---------- */
  function simShots(n, plan) {
    build(n); var guard = 0;
    for (var i = 0; i < plan.length && state !== 'done' && shots.length; i++) { var s = plan[i], a = s.a * Math.PI / 180, d = MAXPULL * s.p; launch(-Math.cos(a) * d, Math.sin(a) * d); var t0 = tick; while (state === 'fly' && guard++ < 400000) { substep(); if (s.tap && tick - t0 === s.tap && sub % NSUB === 0) ability(); } }
    return { left: targetsLeft(), score: score, won: state === 'done' && !targetsLeft(), used: used, shotsLeft: shots.length, kinds: objs.filter(function (o) { return o.t; }).map(function (o) { return o.k; }) };
  }
  window.__sl = {
    levels: LEVELS.length,
    sim: function (n, plan) { if (!window.Matter) return null; M = window.Matter; headless = true; try { return simShots(n, plan); } finally { headless = false; engine = null; state = 'menu'; } },
    settle: function (n) { if (!window.Matter) return null; M = window.Matter; headless = true; build(n); var before = objs.map(function (o) { return { x: o.body.position.x, y: o.body.position.y, a: o.body.angle }; }); for (var i = 0; i < 1600; i++) M.Engine.update(engine, DT); var worst = 0; objs.forEach(function (o, i) { worst = Math.max(worst, Math.hypot(o.body.position.x - before[i].x, o.body.position.y - before[i].y), Math.abs(o.body.angle - before[i].a) * 30); }); headless = false; engine = null; state = 'menu'; return worst; },
    aims: function (n) { if (!window.Matter) return null; M = window.Matter; headless = true; build(n); var r = { vmax: launchSpeed(MAXPULL, P[shots[0]].kg), type: shots[0], pts: objs.map(function (o) { return { k: o.k, dx: (o.body.position.x - SX) / PXM, dy: (SY - o.body.position.y) / PXM, h: o.h / PXM }; }) }; headless = false; engine = null; state = 'menu'; return r; },
    state: function () { return { state: state, lvl: lvl, shots: shots.slice(), left: engine ? targetsLeft() : -1, score: score, used: used, running: running, cam: { x: Math.round(cam.x), z: +cam.z.toFixed(2) }, objs: objs.length }; }
  };
})();
