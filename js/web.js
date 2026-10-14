/* The Web: every video as a point in 3D space, pulled toward the storylines it touches.
   Self-contained canvas renderer (no libraries). Drag to spin, wheel/pinch to zoom, click to open. */
(function () {
  'use strict';
  var stage = document.getElementById('web-stage');
  if (!stage) return;
  var cv = document.getElementById('web-canvas');
  var ctx = cv.getContext('2d');
  var tip = document.getElementById('web-tip');
  var panel = document.getElementById('web-panel');
  var theoryBtn = document.getElementById('web-theory');
  var resetBtn = document.getElementById('web-reset');
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var ID_RE = /^[\w-]{11}$/;

  var nodes = [], edges = [], topics = [], hub = null, theory = false;
  var built = false, running = false, raf = 0, cfg = null;
  var yaw = 0.6, pitch = -0.25, D0 = 1020, W = 0, H = 0, dpr = 1;
  // A free camera: C is where you are, yaw and pitch are where you look. Far away it orbits the web; scroll or pinch to fly in, straight through the middle and out the far side.
  // Past the far side you come back in from the opposite side, so the zoom never ends. Inside the web, dragging turns you around where you stand.
  var C = [0, 0, 0], cy = 1, sy = 0, cp = 1, sp = 0, R_IN = 430, WRAPR = 640, MAXD = 3200, NEAR = 14, hint = document.getElementById('web-hint'), turnBtn = document.getElementById('web-turn');
  function trig() { cy = Math.cos(yaw); sy = Math.sin(yaw); cp = Math.cos(pitch); sp = Math.sin(pitch); }
  function toView(x, y, z) { var x1 = x * cy - z * sy, z1 = x * sy + z * cy; return [x1, y * cp - z1 * sp, y * sp + z1 * cp]; }
  function fromView(v) { var y = v[1] * cp + v[2] * sp, z1 = -v[1] * sp + v[2] * cp; return [v[0] * cy + z1 * sy, y, -v[0] * sy + z1 * cy]; }
  function camLen() { return Math.hypot(C[0], C[1], C[2]); }
  function homeCam() { trig(); var f = fromView([0, 0, D0]); C = [-f[0], -f[1], -f[2]]; }
  // turn the view by dy / dp: orbit the web from outside, turn on the spot from inside
  function rot(dy, dp) {
    trig(); var outside = camLen() > R_IN, v0 = outside ? toView(-C[0], -C[1], -C[2]) : null;
    yaw += dy; pitch = Math.max(-1.4, Math.min(1.4, pitch + dp)); trig();
    if (outside) { var f = fromView(v0); C = [-f[0], -f[1], -f[2]]; }
  }
  function nearestDist() { var b = 1e9; nodes.forEach(function (n) { var d = Math.hypot(n.x - C[0], n.y - C[1], n.z - C[2]); if (d < b) b = d; }); return b; }
  function dolly(s) {
    trig(); var f = fromView([0, 0, 1]), nc = [C[0] + f[0] * s, C[1] + f[1] * s, C[2] + f[2] * s], d = Math.hypot(nc[0], nc[1], nc[2]);
    if (s < 0 && d > MAXD && d > camLen()) return;
    C = nc;
    if (s > 0 && d > WRAPR && C[0] * f[0] + C[1] * f[1] + C[2] * f[2] > 0) C = [-C[0], -C[1], -C[2]];   // out the far side, back in from the other
    if (hint) hint.hidden = camLen() > R_IN;
  }
  function wheelStep(dir) { return dir * Math.max(18, Math.min(260, nearestDist() * 0.17)); }
  var hover = null, focus = null, dragging = false, moved = false, lx = 0, ly = 0, idle = 0, heat = 1;
  var imgs = {}, loading = 0, zRef = 1000;

  function fetchJSON(p) { return fetch(p, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(p); return r.json(); }); }

  function build() {
    var vids = (window.SS.videos || []).filter(function (v) { return ID_RE.test(v.id || ''); });
    var byId = {};
    nodes = []; edges = []; topics = [];
    cfg.topics.forEach(function (t, i) {
      var a = i * 2.399963, y = 1 - (i + 0.5) / cfg.topics.length * 2, r = Math.sqrt(1 - y * y);
      var n = { kind: 'topic', name: t.name, x: Math.cos(a) * r * 260, y: y * 260, z: Math.sin(a) * r * 260, vx: 0, vy: 0, vz: 0, deg: 0, m: t.match || [], kids: [] };
      nodes.push(n); topics.push(n);
    });
    vids.forEach(function (v) {
      var t = (v.title || '').toLowerCase(), hit = [];
      topics.forEach(function (tn) { if (tn.m.some(function (k) { return t.indexOf(k) >= 0; })) hit.push(tn); });
      var c = { x: 0, y: 0, z: 0 };
      hit.forEach(function (h) { c.x += h.x; c.y += h.y; c.z += h.z; });
      var k = hit.length || 1;
      var n = { kind: 'video', v: v, topics: hit, x: c.x / k + (Math.random() - 0.5) * 140, y: c.y / k + (Math.random() - 0.5) * 140, z: c.z / k + (Math.random() - 0.5) * 140, vx: 0, vy: 0, vz: 0, deg: hit.length };
      nodes.push(n); byId[v.id] = n;
      hit.forEach(function (h) { edges.push({ a: n, b: h, k: 1 }); h.kids.push(n); });
    });
    (cfg.links || []).forEach(function (l) {
      if (byId[l[0]] && byId[l[1]]) edges.push({ a: byId[l[0]], b: byId[l[1]], k: 2, why: l[2] || '' });
    });
    hub = { kind: 'hub', name: (cfg.theory && cfg.theory.name) || 'The Network', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, deg: 0, kids: [] };
    topics.forEach(function (t) { edges.push({ a: hub, b: t, k: 3 }); });
    built = true; heat = 1;
    for (var i = 0; i < 260; i++) step(true);
    heat = 0.25;
    panelText();
  }

  function step(quick) {
    var n = nodes.length, i, j, a, b, dx, dy, dz, d2, d, f;
    var list = theory ? nodes.concat([hub]) : nodes;
    n = list.length;
    for (i = 0; i < n; i++) {
      a = list[i];
      for (j = i + 1; j < n; j++) {
        b = list[j];
        dx = a.x - b.x; dy = a.y - b.y; dz = a.z - b.z;
        d2 = dx * dx + dy * dy + dz * dz + 40;
        if (d2 > 160000) continue;
        var rep = (a.kind === 'topic' && b.kind === 'topic') ? 26000 : 1800;
        f = rep / d2; d = Math.sqrt(d2);
        dx = dx / d * f; dy = dy / d * f; dz = dz / d * f;
        a.vx += dx; a.vy += dy; a.vz += dz; b.vx -= dx; b.vy -= dy; b.vz -= dz;
      }
    }
    edges.forEach(function (e) {
      if (e.k === 3 && !theory) return;
      dx = e.b.x - e.a.x; dy = e.b.y - e.a.y; dz = e.b.z - e.a.z;
      d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
      var rest = e.k === 1 ? 70 : (e.k === 3 ? 150 : 110), s = e.k === 3 ? 0.012 : 0.03;
      f = (d - rest) * s;
      dx = dx / d * f; dy = dy / d * f; dz = dz / d * f;
      e.a.vx += dx; e.a.vy += dy; e.a.vz += dz; e.b.vx -= dx; e.b.vy -= dy; e.b.vz -= dz;
    });
    for (i = 0; i < n; i++) {
      a = list[i];
      a.vx -= a.x * 0.0035; a.vy -= a.y * 0.0035; a.vz -= a.z * 0.0035;
      a.vx *= 0.82; a.vy *= 0.82; a.vz *= 0.82;
      a.x += a.vx * heat; a.y += a.vy * heat; a.z += a.vz * heat;
    }
  }

  function project(n) {
    var v = toView(n.x - C[0], n.y - C[1], n.z - C[2]), z = v[2];
    n.sz = z; n.vis = z > NEAR;
    if (n.vis) { var k = 1 / z; n.sx = W / 2 + v[0] * 950 * k; n.sy = H / 2 + v[1] * 950 * k; n.s = 900 * k; }
  }

  function lit(n) {
    if (!focus || (focus.kind === 'hub')) return true;
    if (n === focus) return true;
    if (focus.kind === 'topic') return n.kind === 'video' && n.topics.indexOf(focus) >= 0;
    if (focus.kind === 'video') return n.kind === 'topic' && focus.topics.indexOf(n) >= 0;
    return false;
  }

  function thumb(n) {
    var id = n.v.id, im = imgs[id];
    if (im) return im.complete && im.naturalWidth ? im : null;
    if (loading > 6) return null;
    loading++;
    im = new Image();
    im.onload = im.onerror = function () { loading--; };
    im.src = 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg';
    imgs[id] = im;
    return null;
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var list = theory ? nodes.concat([hub]) : nodes;
    trig(); zRef = Math.max(0, Math.min(camLen(), 1400)); list.forEach(project);
    edges.forEach(function (e) {
      if (e.k === 3 && !theory) return;
      if (!e.a.vis || !e.b.vis) return;
      var on = lit(e.a) && lit(e.b) && (!focus || focus.kind === 'hub' || e.a === focus || e.b === focus);
      var depth = Math.max(0.12, Math.min(1, 0.75 - (e.a.sz + e.b.sz - 2 * zRef) / 1800));
      ctx.beginPath(); ctx.moveTo(e.a.sx, e.a.sy); ctx.lineTo(e.b.sx, e.b.sy);
      if (e.k === 3) { ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(255,200,120,' + (on ? 0.55 : 0.1) + ')'; }
      else { ctx.setLineDash([]); ctx.strokeStyle = e.k === 2 ? 'rgba(255,230,160,' + (on ? 0.7 : 0.1) + ')' : 'rgba(255,42,53,' + (on ? depth * (focus && focus.kind !== 'hub' ? 0.9 : 0.5) : 0.04) + ')'; }
      ctx.lineWidth = e.k === 2 ? 1.6 : 1;
      ctx.stroke();
    });
    ctx.setLineDash([]);
    list.sort(function (a, b) { return b.sz - a.sz; });
    list.forEach(function (n) {
      if (!n.vis) return;
      var on = lit(n), a = on ? Math.max(0.3, Math.min(1, 0.95 - (n.sz - zRef) / 1500)) : 0.12;
      ctx.globalAlpha = a;
      if (n.kind === 'video') {
        var r = Math.min(46, Math.max(2.2, 3.6 * n.s * (n.deg > 1 ? 1.5 : 1))), big = r * 4.5 > 24 || n === hover || (focus && on);
        if (big && on) {
          var w = Math.max(34, Math.min(120, r * 11)), h = w * 9 / 16, im = thumb(n);
          if (im) { ctx.drawImage(im, n.sx - w / 2, n.sy - h / 2, w, h); ctx.strokeStyle = n === hover ? '#fff' : 'rgba(255,42,53,.9)'; ctx.lineWidth = 1.2; ctx.strokeRect(n.sx - w / 2, n.sy - h / 2, w, h); n.hr = w / 2; return; }
        }
        ctx.beginPath(); ctx.arc(n.sx, n.sy, r, 0, 6.2832);
        ctx.fillStyle = n.deg > 1 ? '#ffd9a0' : '#f3e9e4'; ctx.shadowColor = '#ff2a35'; ctx.shadowBlur = n === hover ? 18 : (n.deg > 1 ? 10 : 4); ctx.fill(); ctx.shadowBlur = 0;
        n.hr = r + 4;
      } else {
        var R = Math.min(110, (n.kind === 'hub' ? 26 : 12 + Math.sqrt(n.kids.length) * 2.2) * n.s);
        var g = ctx.createRadialGradient(n.sx, n.sy, 0, n.sx, n.sy, R * 2.4);
        var hot = n.kind === 'hub' ? '255,190,90' : '255,42,53';
        g.addColorStop(0, 'rgba(' + hot + ',0.95)'); g.addColorStop(0.35, 'rgba(' + hot + ',0.4)'); g.addColorStop(1, 'rgba(' + hot + ',0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.sx, n.sy, R * 2.4, 0, 6.2832); ctx.fill();
        ctx.beginPath(); ctx.arc(n.sx, n.sy, R * 0.55, 0, 6.2832); ctx.fillStyle = n === hover ? '#fff' : '#ffe9e4'; ctx.fill();
        n.hr = R;
        if (on) {
          ctx.globalAlpha = Math.max(a, 0.55);
          ctx.font = '700 ' + Math.max(11, Math.min(18, 13 * n.s * 1.1)) + 'px Archivo, sans-serif';
          ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(n.name, n.sx, n.sy - R - 6);
          ctx.fillStyle = '#fff'; ctx.fillText(n.name, n.sx, n.sy - R - 6);
        }
      }
    });
    ctx.globalAlpha = 1;
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (!dragging && !hover && !focus && !reduce && camLen() > R_IN) { idle++; rot(0.0016, 0); }
    if (heat > 0.02) { step(); heat *= 0.995; }
    draw();
  }

  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    var first = !W;
    W = stage.clientWidth; H = stage.clientHeight;
    if (first) { D0 = W < 700 ? 1320 : 1020; homeCam(); }
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
  }

  function pick(mx, my) {
    var best = null, bd = 1e9;
    (theory ? nodes.concat([hub]) : nodes).forEach(function (n) {
      if (!lit(n) || !n.vis) return;
      var d = Math.hypot(n.sx - mx, n.sy - my), r = (n.hr || 6) + 4;
      if (d < r && d - r < bd) { bd = d - r; best = n; }
    });
    return best;
  }

  function panelText() {
    if (!panel) return;
    if (!focus) { panel.innerHTML = '<strong>' + topics.length + ' storylines, ' + (nodes.length - topics.length) + ' videos.</strong> Tap a glowing storyline to light up everything inside it. Videos that sit between two storylines are the bridges.'; return; }
    if (focus.kind === 'topic') { panel.innerHTML = '<strong>' + focus.name + '</strong> · ' + focus.kids.length + ' videos. Tap a video to watch, or tap empty space to reset.'; return; }
    if (focus.kind === 'video') {
      panel.textContent = '';
      var s = document.createElement('strong'); s.textContent = focus.v.title; panel.appendChild(s);
      panel.appendChild(document.createTextNode(' · ' + (focus.topics.length ? 'connects ' + focus.topics.map(function (t) { return t.name; }).join(' + ') : 'not tied to a storyline yet')));
      return;
    }
    panel.textContent = (cfg.theory && cfg.theory.blurb) || '';
  }

  function xy(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  cv.addEventListener('pointerdown', function (e) { dragging = true; moved = false; var p = xy(e); lx = p.x; ly = p.y; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', function (e) {
    var p = xy(e);
    if (dragging) {
      var dx = p.x - lx, dy = p.y - ly;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      rot(dx * 0.006, dy * 0.006); lx = p.x; ly = p.y; return;
    }
    hover = pick(p.x, p.y);
    cv.style.cursor = hover ? 'pointer' : 'grab';
    if (hover) {
      tip.hidden = false; tip.textContent = hover.kind === 'video' ? hover.v.title : hover.name;
      tip.style.left = Math.min(W - 200, Math.max(8, p.x + 14)) + 'px'; tip.style.top = Math.max(8, p.y - 34) + 'px';
    } else tip.hidden = true;
  });
  cv.addEventListener('pointerup', function (e) {
    dragging = false;
    if (moved) return;
    var p = xy(e), n = pick(p.x, p.y);
    if (!n) { focus = null; panelText(); return; }
    if (n.kind === 'video') {
      if (focus === n) { window.SS.openPlayer(n.v); return; }
      focus = n; panelText(); window.SS.openPlayer(n.v);
    } else { focus = (focus === n) ? null : n; panelText(); }
  });
  cv.addEventListener('pointerleave', function () { hover = null; tip.hidden = true; });
  cv.addEventListener('wheel', function (e) { e.preventDefault(); dolly(wheelStep(e.deltaY < 0 ? 1 : -1)); }, { passive: false });
  var pinch = 0;
  cv.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2) {
      var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (pinch) dolly(Math.max(-400, Math.min(400, (d / pinch - 1) * Math.max(260, nearestDist() * 4))));
      pinch = d; e.preventDefault();
    }
  }, { passive: false });
  cv.addEventListener('touchend', function () { pinch = 0; });
  theoryBtn.addEventListener('click', function () {
    theory = !theory; theoryBtn.setAttribute('aria-pressed', String(theory));
    theoryBtn.textContent = theory ? 'Hide the theory' : 'Show the theory';
    heat = 0.6; focus = theory ? hub : null; panelText();
  });
  resetBtn.addEventListener('click', function () { focus = null; yaw = 0.6; pitch = -0.25; homeCam(); if (hint) hint.hidden = true; panelText(); });
  if (turnBtn) turnBtn.addEventListener('click', function () { rot(Math.PI, 0); });
  // the pop-out window: the caption comes with it
  document.addEventListener('ss:popoutchange', function (e) { if (e.detail.el !== stage) return; if (e.detail.on) { stage.appendChild(panel); panel.classList.add('in-stage'); } else { stage.parentNode.insertBefore(panel, stage.nextSibling); panel.classList.remove('in-stage'); } setTimeout(function () { if (running) size(); }, 140); });
  window.addEventListener('resize', function () { if (running) size(); });
  document.addEventListener('keydown', function (e) { if (running && e.key === 'Escape' && focus) { focus = null; panelText(); } });

  function start() {
    if (running) return;
    if (!window.SS || !window.SS.ready) return;
    running = true;
    size();
    var go = function () {
      if (!built) build();
      if (reduce) { draw(); }
      else raf = requestAnimationFrame(loop);
    };
    if (cfg) go(); else fetchJSON('data/web.json').then(function (d) { cfg = d; go(); }).catch(function () { running = false; panel.textContent = 'The web could not load. Refresh to try again.'; });
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  document.addEventListener('ss:route', function (e) { if (e.detail.name === 'web') start(); else stop(); });
  document.addEventListener('ss:videos', function () { if ((location.hash || '') === '#web') start(); });
  if ((location.hash || '') === '#web') start();
})();
