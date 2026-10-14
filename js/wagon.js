/* Kraving Killer game 2: Don't Fall Off the Wagon.
   A little red wagon rolls over endless hills. Hold = dive into the slope, let go = launch off the next crest.
   Stay on the wagon. It starts calm (about 2.5 minutes of easy rolling, long enough to ride out a craving),
   then slowly gets steeper, shorter and rockier. Falling off just lets you climb back on. */
(function () {
  var root = document.getElementById('wg'); if (!root) return;
  var cv = document.getElementById('wg-canvas'), ctx = cv.getContext('2d');
  var W = 720, H = 420, dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // the pop-out player asks for a wider picture on a phone turned sideways, so the game fills the whole screen
  document.addEventListener('ss:wgaspect', function (e) {
    var nw = Math.max(560, Math.min(1100, Math.round(H * (e.detail || 720 / 420)))); if (nw === W) return;
    W = nw; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  });
  var elTime = document.getElementById('wg-time'), elDay = document.getElementById('wg-day'), elChips = document.getElementById('wg-chips'), elBest = document.getElementById('wg-best');
  var over = document.getElementById('wg-over'), overTitle = document.getElementById('wg-over-t'), overSub = document.getElementById('wg-over-s'), overBtn = document.getElementById('wg-go');
  var toast = document.getElementById('wg-toast');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var G = 380, DIVE = 3.4, AIRG = 0.55, JUMP = 330, FR = 0.012, MAXV = 1000, DAY = 30;

  var POOL = [['#d9892a', '#8a4a0a'], ['#f2c94c', '#b8860b'], ['#9fd6ff', '#4e8fc4'], ['#5fe08a', '#1f8f4a']];   // whiskey, beer, vodka, absinthe
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  var cps, nextPeak, rocks, pools, chips, st, pressed = false, running = false, raf = 0, last = 0, best = 0, started = false, stars = [], parts = [];
  try { best = +localStorage.getItem('ss-wagon-best') || 0; } catch (e) {}
  for (var i = 0; i < 70; i++) stars.push([Math.random(), Math.random() * 0.6, Math.random() * 1.4 + 0.3]);

  function diff() { var t = st ? st.t : 0; return clamp((t - 150) / 360, 0, 1) + clamp(t / 150, 0, 1) * 0.08; }

  /* ---------- terrain: cosine-smoothed hills, generated ahead of the wagon ---------- */
  function addHill() {
    var a = cps[cps.length - 1], d = diff(), L = lerp(760, 420, d) * rnd(0.6, 1.45), A = lerp(200, 310, d) * rnd(0.55, 1.5), p;
    var roll = Math.random();
    if (roll < 0.12) { L *= 1.5; A *= 1.35; }          // a big, wide hill: a long launch
    else if (roll < 0.28) { L *= 0.55; A *= 0.5; }     // a quick little bump
    else if (roll < 0.36) { L *= 1.25; A *= 0.45; }    // a long gentle roller
    if (nextPeak) {
      p = { x: a.x + L, y: a.y - A * rnd(0.82, 0.94) };
      var n = 3 + Math.floor(Math.random() * 3);   // a little arc of chips floating over the crest
      for (var i = 0; i < n; i++) { var u = i / (n - 1) - 0.5; chips.push({ x: p.x + u * 150, y: p.y - 70 - (0.25 - u * u) * 220 - rnd(0, 12), got: false }); }
    } else {
      p = { x: a.x + L, y: a.y + A };
      var tt = st ? st.t : 0;
      if (tt > 40 && Math.random() < 0.28 + 0.5 * d) {   // bottles, cans and pills on the slope down
        var kinds = ['bottle', 'can', 'pills', 'pillbottle'], cnt = 1 + (d > 0.4 && Math.random() < 0.5 ? 1 : 0) + (d > 0.8 && Math.random() < 0.4 ? 1 : 0);
        var hx = a.x + L * rnd(0.25, 0.55);
        for (var hk = 0; hk < cnt; hk++) { var kd = kinds[Math.floor(Math.random() * kinds.length)]; rocks.push({ x: hx + hk * 55, kind: kd, w: { bottle: 14, can: 16, pills: 26, pillbottle: 18 }[kd], h: { bottle: 34, can: 20, pills: 9, pillbottle: 24 }[kd], hit: false }); }
      }
      if (tt > 55 && Math.random() < 0.18 + 0.4 * d) {   // a pool of booze in the valley: fall in and you are done
        pools.push({ vx: p.x, surf: p.y - rnd(26, 40) - 24 * d, kind: Math.floor(Math.random() * 4), x0: 0, x1: 0, ready: false, warned: false });
      }
    }
    nextPeak = !nextPeak; cps.push(p);
  }
  function seg(x) { var lo = 0, hi = cps.length - 2; while (lo < hi) { var m = (lo + hi + 1) >> 1; if (cps[m].x <= x) lo = m; else hi = m - 1; } return lo; }
  function ground(x) { var i = seg(x), a = cps[i], b = cps[i + 1], u = clamp((x - a.x) / (b.x - a.x), 0, 1); return a.y + (b.y - a.y) * (1 - Math.cos(Math.PI * u)) / 2; }
  function slope(x) { var i = seg(x), a = cps[i], b = cps[i + 1], u = clamp((x - a.x) / (b.x - a.x), 0, 1); return (b.y - a.y) * Math.PI / 2 * Math.sin(Math.PI * u) / (b.x - a.x); }
  function extend(x) { while (cps[cps.length - 1].x < x + 1800) addHill(); if (cps.length > 60 && cps[3].x < x - 1500) cps.splice(0, 1); }

  /* ---------- state ---------- */
  function reset() {
    cps = [{ x: -500, y: 0 }]; nextPeak = false; rocks = []; pools = []; chips = []; parts = [];
    st = { warnedKinds: {}, lean: 0, jumpQ: false, t: 0, x: -120, y: 0, vx: 0, vy: 0, v: 70, air: false, ang: 0, dead: false, deadT: 0, rider: null, camX: -120, camY: 0, sc: 1, still: 0, chips: 0, day: 0, dist: 0, msgs: 0, toastT: 0, flash: 0 };
    extend(-120); st.y = ground(st.x); st.camY = st.y;
    paintHud();
  }
  // AA-style chips: your rank is how long you have gone. Game time is compressed (a game day is 30 seconds).
  var COINS = [[30, 'white', '24 HRS'], [75, 'red', '30 DAYS'], [120, 'gold', '60 DAYS'], [180, 'green', '90 DAYS'], [270, 'blue', '6 MOS'], [360, 'purple', '9 MOS'], [480, 'bronze', '1 YR']];
  var elCoin = document.getElementById('wg-coin-c'), elCoinT = document.getElementById('wg-coin-t'), elCoinN = document.getElementById('wg-coin-n'), coinNow = -2;
  function coinFor(t) {
    var i = -1; for (var k = 0; k < COINS.length; k++) if (t >= COINS[k][0]) i = k;
    if (i === COINS.length - 1) { var yrs = 1 + Math.floor((t - 480) / 240); return { i: 100 + yrs, c: 'bronze', l: yrs + (yrs === 1 ? ' YR' : ' YRS'), next: 480 + yrs * 240 }; }
    return i < 0 ? { i: -1, c: 'none', l: 'NEW', next: COINS[0][0] } : { i: i, c: COINS[i][1], l: COINS[i][2], next: COINS[i + 1][0] };
  }
  function paintCoin(announce) {
    if (!elCoin) return; var c = coinFor(st.t);
    if (c.i !== coinNow) {
      var up = coinNow !== -2 && c.i > coinNow; coinNow = c.i; elCoin.className = 'coin ' + c.c; elCoinT.textContent = c.l;
      if (up && announce) { elCoin.classList.add('pop'); say('You earned your ' + c.l.toLowerCase() + ' chip.'); }
    }
    elCoinN.textContent = 'Next chip in ' + fmt(Math.max(0, c.next - st.t));
  }
  function fmt(t) { t = Math.floor(t); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }
  function paintHud() {
    elTime.textContent = fmt(st.t); elDay.textContent = 'Day ' + (st.day + 1); elChips.textContent = st.chips; elBest.textContent = best ? fmt(best) : '--'; paintCoin(true);
  }
  function say(t) { toast.textContent = t; toast.classList.add('on'); clearTimeout(st.toastT); st.toastT = setTimeout(function () { toast.classList.remove('on'); }, 3800); }

  function crash(why) {
    if (st.dead) return; st.dead = true; st.deadT = 0; st.why = why;
    var vx = st.air ? st.vx : st.v / Math.sqrt(1 + slope(st.x) * slope(st.x));
    st.rider = { x: st.x, y: st.y - 20, vx: vx * 0.7 + 40, vy: -200, rot: 0, vr: rnd(-7, 7) };
    st.flash = 1;
    if (st.t > best) { best = st.t; try { localStorage.setItem('ss-wagon-best', String(best)); } catch (e) {} }
  }
  function showOver() {
    var mins = Math.floor(st.t / 60), days = st.day;
    overTitle.textContent = 'Game over';
    overSub.textContent = (st.why ? st.why + ' ' : '') + 'You fell off the wagon. You rode ' + fmt(st.t) + ' (' + (days === 1 ? '1 day' : days + ' days') + ') and grabbed ' + st.chips + ' chips. ' +
      (coinFor(st.t).i >= 0 ? 'Your rank: the ' + coinFor(st.t).l.toLowerCase() + ' chip. ' : '') +
      (st.t >= 120 ? 'That is longer than most cravings last. ' : 'Most cravings fade in two to five minutes, so try again. ') + 'Falling off just means you climb back on. Don\u2019t fall off the wagon!';
    overBtn.textContent = 'Get back on'; over.hidden = false; paintHud();
  }

  /* ---------- physics ---------- */
  function step(dt) {
    var s = st; s.t += dt; extend(s.x);
    var d = diff(), g = G * (pressed && !s.dead ? DIVE : 1) * (s.air && !pressed ? AIRG : 1);
    s.coyote = Math.max(0, (s.coyote || 0) - dt); s.jcd = Math.max(0, (s.jcd || 0) - dt); s.jflash = Math.max(0, (s.jflash || 0) - dt * 3);
    s.pressT = pressed ? 0.28 : Math.max(0, (s.pressT || 0) - dt);
    s.lean += ((pressed && !s.dead ? 1 : 0) - s.lean) * Math.min(1, dt * 12);
    if (s.jumpQ) {   // Shift / JUMP button: a hop off the ground (or just after leaving it), strongest from the top of a hill
      s.jumpQ = false;
      if (!s.dead && s.jcd <= 0 && (!s.air || s.coyote > 0)) {
        var jsl = slope(s.x), jl = Math.sqrt(1 + jsl * jsl), jnx = jsl / jl, jny = -1 / jl;
        if (!s.air) { s.vx = s.v / jl; s.vy = s.v * jsl / jl; s.air = true; }
        s.vx += jnx * JUMP * 0.5; s.vy += jny * JUMP; s.coyote = 0; s.jcd = 0.35; s.jflash = 1; s.y -= 2;
        for (var jk = 0; jk < 6; jk++) parts.push({ x: s.x, y: s.y, vx: rnd(-70, 70), vy: rnd(-60, 10), l: 0.45 });
      }
    }
    if (!s.dead) {
      if (Math.floor(s.t / DAY) > s.day) { s.day++; if (s.day === 1) say('Day 1 done. Breathe. Keep rolling.'); }
      if (s.msgs === 0 && s.t > 75) { s.msgs = 1; say('Cravings usually peak and fade in 2 to 5 minutes.'); }
      if (s.msgs === 1 && s.t > 180) { s.msgs = 2; say('3 minutes. The craving is losing. The road gets bumpier from here.'); }
      if (s.msgs === 2 && s.t > 270) { s.msgs = 3; say('You rode out the craving. Keep going if you like.'); }
    }
    if (!s.air) {
      var sl = slope(s.x), len = Math.sqrt(1 + sl * sl), tx = 1 / len, ty = sl / len;
      s.v += g * ty * dt; s.v -= s.v * FR * dt;
      if (!s.dead) { var minV = lerp(120, 45, d), assist = lerp(150, 0, d); if (s.v < minV && tx > 0.45) s.v += assist * dt; }
      s.v = clamp(s.v, -260, MAXV);
      var vx = s.v * tx, vy = s.v * ty, nx = s.x + vx * dt, ny = ground(nx), by = s.y + vy * dt + 0.5 * g * dt * dt;
      if (by < ny - 0.01 && vx > 40) { s.air = true; s.coyote = 0.12; s.vx = vx; s.vy = vy + g * dt; s.x += vx * dt; s.y = by; }
      else { s.x = nx; s.y = ny; }
      if (!s.dead) { if (s.v < 22) s.still += dt; else if (s.v > 60) s.still = 0; if (s.still > 1.5) crash('Rolled to a stop.'); }
    } else {
      s.vy += g * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      var gy = ground(s.x);
      if (s.y >= gy) {
        var sl2 = slope(s.x), l2 = Math.sqrt(1 + sl2 * sl2), nxn = sl2 / l2, nyn = -1 / l2, vn = s.vx * nxn + s.vy * nyn, impact = Math.max(0, -vn), vt = s.vx / l2 + s.vy * sl2 / l2;
        var tol = lerp(1000, 620, d) * (pressed ? 1.35 : 1);
        s.y = gy; s.air = false;
        if (impact > tol && !s.dead) crash('Bad landing.');
        s.v = vt * (1 - clamp((impact - 520) / 3200, 0, 0.2));
        if (s.pressT > 0 && sl2 > 0.06 && !s.dead) { s.v = Math.min(MAXV, s.v * 1.07); s.perfect = 1; for (var pk = 0; pk < 7; pk++) parts.push({ x: s.x, y: s.y - 6, vx: rnd(-40, 140), vy: rnd(-120, -20), l: 0.5, c: '#ffd45a' }); }
        if (impact > 420) for (var k = 0; k < 8; k++) parts.push({ x: s.x, y: s.y - 4, vx: rnd(-90, 90), vy: rnd(-110, -20), l: 0.6 });
      }
    }
    s.dist = Math.max(s.dist, s.x);
    // angle: follow the ground when rolling, the flight path in the air
    var tgt = s.air ? Math.atan2(s.vy, Math.max(80, s.vx)) * 0.55 : Math.atan(slope(s.x));
    if (!s.dead) s.ang += (tgt - s.ang) * Math.min(1, dt * (s.air ? 5 : 14)); else s.ang += dt * (s.air ? 5 : 1.4);
    for (var pi = 0; pi < pools.length; pi++) {   // work out how wide each pool is once the hills around it exist
      var pl = pools[pi]; if (!pl.ready && cps[cps.length - 1].x > pl.vx + 900) { var a0 = pl.vx, b0 = pl.vx; while (ground(a0) > pl.surf && pl.vx - a0 < 700) a0 -= 4; while (ground(b0) > pl.surf && b0 - pl.vx < 700) b0 += 4; pl.x0 = a0; pl.x1 = b0; pl.ready = true; }
    }
    if (!s.dead) {
      for (var i = 0; i < chips.length; i++) { var c = chips[i]; if (!c.got && Math.abs(c.x - s.x) < 40 && Math.abs(c.y - (s.y - 22)) < 40) { c.got = true; s.chips++; paintHud(); for (var q = 0; q < 6; q++) parts.push({ x: c.x, y: c.y, vx: rnd(-120, 120), vy: rnd(-140, 40), l: 0.5, c: '#ffd45a' }); } }
      for (var j = 0; j < rocks.length; j++) {
        var r = rocks[j];
        if (!r.warned && r.x - s.x < 650 && r.x > s.x && !s.warnedKinds[r.kind]) { r.warned = true; s.warnedKinds[r.kind] = 1; if (s.t < 200) say('Watch out. Jump it with Shift.'); }
        if (r.hit || Math.abs(r.x - s.x) > r.w / 2 + 16) continue;
        if (s.y > ground(r.x) - r.h) {
          r.hit = true; s.flash = 1;
          for (var q2 = 0; q2 < 8; q2++) parts.push({ x: r.x, y: ground(r.x) - r.h / 2, vx: rnd(-120, 120), vy: rnd(-180, -20), l: 0.6, c: r.kind === 'pills' ? '#ff6b73' : '#c98a3a' });
          if (d > 0.3) crash('Hit the stuff.');
          else { s.v *= 0.45; s.air = true; s.vx = Math.max(100, s.v * 0.8); s.vy = -170; say('Ouch. Stay away from that stuff.'); }
        }
      }
      for (var pj = 0; pj < pools.length; pj++) {
        var pl2 = pools[pj]; if (!pl2.ready) continue;
        if (!pl2.warned && pl2.x0 - s.x < 700 && pl2.x0 > s.x) { pl2.warned = true; if (!s.warnedPool) { s.warnedPool = 1; say('Liquid ahead. Jump it, or you will not climb out.'); } }
        if (s.x > pl2.x0 + 6 && s.x < pl2.x1 - 6 && s.y > pl2.surf + 2) {
          for (var q3 = 0; q3 < 16; q3++) parts.push({ x: s.x, y: pl2.surf, vx: rnd(-110, 110), vy: rnd(-260, -60), l: 0.8, c: POOL[pl2.kind][0] });
          crash('Fell into the drink.'); s.vx = Math.max(0, s.vx * 0.3); s.v *= 0.2;
        }
      }
    } else {
      s.deadT += dt;
      if (s.rider) { var r2 = s.rider; r2.vy += G * 1.6 * dt; r2.x += r2.vx * dt; r2.y += r2.vy * dt; r2.rot += r2.vr * dt; var gg = ground(r2.x); if (r2.y > gg - 6) { r2.y = gg - 6; r2.vy *= -0.25; r2.vx *= 0.8; r2.vr *= 0.7; } }
      s.v *= (1 - 0.6 * dt);
      if (s.deadT > 1.1 && over.hidden) showOver();
    }
    for (var p = parts.length - 1; p >= 0; p--) { var pt = parts[p]; pt.l -= dt; pt.vy += 300 * dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; if (pt.l <= 0) parts.splice(p, 1); }
    s.flash = Math.max(0, s.flash - dt * 2.5);
  }

  /* ---------- drawing ---------- */
  function bgLayer(par, base, amp, wl, col) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
    for (var x = 0; x <= W; x += 14) { var wx = x + st.camX * par; ctx.lineTo(x, base + Math.sin(wx / wl) * amp + Math.sin(wx / (wl * 0.37) + 2) * amp * 0.35 - st.camY * par * 0.12); }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }
  function drawWagon(x, y, a, withRider, lean) {
    lean = lean || 0;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    // handle
    ctx.strokeStyle = '#d9d9d9'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; var hx = lerp(34, 29, lean), hy = lerp(-16, 2, lean);   // pulling: the handle drops down toward the ground
    ctx.beginPath(); ctx.moveTo(18, -9); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx - 2, hy - 3); ctx.lineTo(hx + 3, hy + 3); ctx.stroke();
    // rider (sits inside the wagon)
    if (withRider) drawRider(2 * lean, -13, lean * 0.55);
    // body
    ctx.fillStyle = '#d3131c'; ctx.strokeStyle = '#6e060c'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-23, -17); ctx.lineTo(23, -17); ctx.lineTo(19, -4); ctx.lineTo(-19, -4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff6b73'; ctx.fillRect(-21, -17, 42, 2.4);
    // wheels
    [-14, 14].forEach(function (wx) { ctx.fillStyle = '#17171a'; ctx.beginPath(); ctx.arc(wx, -2, 7.2, 0, 6.3); ctx.fill(); ctx.fillStyle = '#c9c9c9'; ctx.beginPath(); ctx.arc(wx, -2, 2.6, 0, 6.3); ctx.fill(); });
    ctx.restore();
  }
  function drawRider(x, y, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = '#16161a'; ctx.fillRect(-6, -14, 12, 15);                       // jacket
    ctx.fillStyle = '#e8c9a8'; ctx.beginPath(); ctx.arc(0, -19, 6, 0, 6.3); ctx.fill(); // head
    ctx.fillStyle = '#0d0d0d'; ctx.beginPath(); ctx.arc(0, -20, 6.2, Math.PI, 0); ctx.fill(); ctx.fillRect(-9, -21, 6, 2);   // backwards cap
    ctx.fillStyle = '#111'; ctx.fillRect(0.5, -20.5, 6, 2.6);                      // shades
    ctx.restore();
  }
  function keycap(x, y, label, tip, on) {
    ctx.save(); ctx.globalAlpha = on ? 1 : 0.62;
    var w = label.length > 1 ? 50 : 28;
    ctx.fillStyle = on ? '#ff3a45' : '#1c0a0e'; ctx.strokeStyle = on ? '#fff' : '#ff2a35'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, 26, 6) : ctx.rect(x, y, w, 26); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x + w / 2, y + 13.5);
    ctx.textAlign = 'left'; ctx.font = '700 11px system-ui, sans-serif'; ctx.fillStyle = on ? '#fff' : '#ffb3b8'; ctx.fillText(tip, x + w + 6, y + 13.5);
    ctx.restore();
  }
  function draw() {
    var s = st;
    // camera
    var gnd = ground(s.x), tY = gnd * 0.7 + s.y * 0.3, sc = clamp(1 - (gnd - s.y - 140) / 800, 0.6, 1);
    s.sc += (sc - s.sc) * 0.05; s.camX += (s.x - s.camX) * 0.25; s.camY += (tY - s.camY) * 0.07;
    var k = s.sc * 1.35, ox = W * 0.32, oy = H * 0.66;
    // sky
    var gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#07010a'); gr.addColorStop(0.55, '#2a060d'); gr.addColorStop(1, '#4a0b12');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; stars.forEach(function (q) { ctx.globalAlpha = 0.25 + q[2] * 0.3; ctx.fillRect(q[0] * W, q[1] * H, q[2], q[2]); }); ctx.globalAlpha = 1;
    var mg = ctx.createRadialGradient(W * 0.8, H * 0.2, 6, W * 0.8, H * 0.2, 80); mg.addColorStop(0, 'rgba(255,230,220,.95)'); mg.addColorStop(0.3, 'rgba(255,120,120,.35)'); mg.addColorStop(1, 'rgba(255,40,50,0)');
    ctx.fillStyle = mg; ctx.fillRect(W * 0.8 - 90, H * 0.2 - 90, 180, 180);
    ctx.fillStyle = '#ffe9e3'; ctx.beginPath(); ctx.arc(W * 0.8, H * 0.2, 17, 0, 6.3); ctx.fill();
    bgLayer(0.15, H * 0.62, 28, 140, '#1c050b'); bgLayer(0.3, H * 0.74, 30, 110, '#2a0810');
    // world
    ctx.save(); ctx.translate(ox, oy); ctx.scale(k, k); ctx.translate(-s.camX, -s.camY);
    var x0 = s.camX - ox / k - 20, x1 = s.camX + (W - ox) / k + 20, bot = s.camY + (H - oy) / k + 40;
    ctx.beginPath(); ctx.moveTo(x0, bot);
    for (var x = x0; x <= x1; x += 9) ctx.lineTo(x, ground(x));
    ctx.lineTo(x1, bot); ctx.closePath();
    var tg = ctx.createLinearGradient(0, s.camY - 160, 0, s.camY + 340); tg.addColorStop(0, '#3a0710'); tg.addColorStop(1, '#0b0204');
    ctx.fillStyle = tg; ctx.fill();
    ctx.strokeStyle = '#ff2a35'; ctx.lineWidth = 3.2 / k; ctx.shadowColor = '#ff2a35'; ctx.shadowBlur = 12; ctx.beginPath();
    for (x = x0; x <= x1; x += 9) { if (x === x0) ctx.moveTo(x, ground(x)); else ctx.lineTo(x, ground(x)); } ctx.stroke(); ctx.shadowBlur = 0;
    // pools of booze
    pools.forEach(function (pl) {
      if (!pl.ready || pl.x1 < x0 - 40 || pl.x0 > x1 + 40) return;
      var col = POOL[pl.kind], wob = Math.sin(s.t * 3 + pl.vx) * 1.6;
      // warning sign just before the pool
      var sx = pl.x0 - 46, sy = ground(sx);
      ctx.fillStyle = '#d9d9d9'; ctx.fillRect(sx - 1.2, sy - 34, 2.4, 34);
      ctx.fillStyle = '#ffcf33'; ctx.beginPath(); ctx.moveTo(sx, sy - 54); ctx.lineTo(sx + 14, sy - 30); ctx.lineTo(sx - 14, sy - 30); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = '#000'; ctx.fillRect(sx - 1.2, sy - 46, 2.4, 9); ctx.fillRect(sx - 1.2, sy - 35, 2.4, 2.6);
      // the liquid
      var lg = ctx.createLinearGradient(0, pl.surf, 0, pl.surf + 90); lg.addColorStop(0, col[0]); lg.addColorStop(1, col[1]);
      ctx.save(); ctx.globalAlpha = 0.92; ctx.fillStyle = lg; ctx.shadowColor = col[0]; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.moveTo(pl.x0, pl.surf + wob);
      for (var lx = pl.x0; lx <= pl.x1; lx += 8) ctx.lineTo(lx, pl.surf + Math.sin(lx * 0.12 + s.t * 3) * 1.8);
      for (lx = pl.x1; lx >= pl.x0; lx -= 8) ctx.lineTo(lx, Math.max(ground(lx), pl.surf + 3));
      ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      for (var bi = 0; bi < 7; bi++) { var bx = pl.x0 + ((bi * 53 + 17) % Math.max(20, pl.x1 - pl.x0)), by = pl.surf + 6 + ((s.t * 14 + bi * 11) % 24); ctx.beginPath(); ctx.arc(bx, by, 1.6 + (bi % 3) * 0.7, 0, 6.3); ctx.fill(); }
    });
    // bottles, cans and pills
    rocks.forEach(function (r) {
      if (r.x < x0 - 30 || r.x > x1 + 30) return; var gy = ground(r.x); ctx.save(); ctx.translate(r.x, gy + 1); ctx.rotate(Math.atan(slope(r.x)) * 0.8); if (r.hit) ctx.globalAlpha = 0.35;
      if (r.kind === 'bottle') { ctx.fillStyle = '#6b3a12'; ctx.fillRect(-7, -22, 14, 22); ctx.fillRect(-3, -34, 6, 13); ctx.fillStyle = '#e8d9b0'; ctx.fillRect(-7, -16, 14, 8); ctx.fillStyle = '#222'; ctx.fillRect(-3.5, -36, 7, 3); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(-5, -21, 2, 16); }
      else if (r.kind === 'can') { ctx.fillStyle = '#c9ccd2'; ctx.fillRect(-8, -20, 16, 20); ctx.fillStyle = '#d3131c'; ctx.fillRect(-8, -14, 16, 8); ctx.fillStyle = '#8a8d94'; ctx.fillRect(-8, -21, 16, 2); ctx.fillStyle = '#fff'; ctx.fillRect(-1, -12, 4, 3); }
      else if (r.kind === 'pills') { [[-9, -3, '#ff4a55', 0.2], [2, -4, '#ffffff', -0.3], [11, -3, '#4a7bff', 0.5]].forEach(function (c) { ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(c[3]); ctx.fillStyle = c[2]; ctx.beginPath(); ctx.ellipse(0, 0, 6, 3.2, 0, 0, 6.3); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-0.6, -3, 1.2, 6); ctx.restore(); }); }
      else { ctx.fillStyle = '#e07a1c'; ctx.fillRect(-9, -20, 18, 20); ctx.fillStyle = '#f4f4f4'; ctx.fillRect(-10, -25, 20, 6); ctx.fillStyle = '#fff'; ctx.fillRect(-6, -14, 12, 8); ctx.fillStyle = '#c33'; ctx.fillRect(-4, -11, 8, 2); }
      ctx.restore();
    });
    // chips
    var pulse = 1 + Math.sin(s.t * 6) * 0.07;
    chips.forEach(function (c) { if (c.got || c.x < x0 - 30 || c.x > x1 + 30) return; ctx.save(); ctx.translate(c.x, c.y); ctx.scale(pulse, pulse); ctx.shadowColor = '#ffb020'; ctx.shadowBlur = 10; ctx.fillStyle = '#ffd45a'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 6.3); ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = '#a56a00'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 5.2, 0, 6.3); ctx.stroke(); ctx.restore(); });
    // wagon + rider
    if (pressed && !s.dead) { ctx.strokeStyle = 'rgba(255,200,200,.55)'; ctx.lineWidth = 1.6 / k; for (var li = 0; li < 4; li++) { var ly = s.y - 6 - li * 7 - (s.air ? 4 : 0); ctx.beginPath(); ctx.moveTo(s.x - 30 - li * 3, ly); ctx.lineTo(s.x - 56 - li * 7 - (s.t * 90 % 14), ly); ctx.stroke(); } }
    drawWagon(s.x, s.y, s.ang, !s.dead, s.lean);
    if (s.dead && s.rider) drawRider(s.rider.x, s.rider.y, s.rider.rot);
    parts.forEach(function (p) { ctx.globalAlpha = clamp(p.l * 2, 0, 1); ctx.fillStyle = p.c || '#b8a89a'; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }); ctx.globalAlpha = 1;
    ctx.restore();
    keycap(14, H - 40, 'B', 'DIVE', pressed && !s.dead); keycap(122, H - 40, 'SHIFT', 'JUMP', s.jflash > 0.2);
    if (s.flash > 0) { ctx.fillStyle = 'rgba(255,40,50,' + (s.flash * 0.28) + ')'; ctx.fillRect(0, 0, W, H); }
  }

  /* ---------- loop / lifecycle ---------- */
  function frame(now) {
    if (!running) return;
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (started) { var n = Math.ceil(dt / (1 / 120)), h = dt / n; for (var i = 0; i < n; i++) step(h); if (Math.floor(st.t * 4) !== st.hudT) { st.hudT = Math.floor(st.t * 4); elTime.textContent = fmt(st.t); elDay.textContent = 'Day ' + (st.day + 1); } }
    draw(); raf = requestAnimationFrame(frame);
  }
  function play() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  function pause() { running = false; cancelAnimationFrame(raf); pressed = false; }
  function begin() { reset(); started = true; over.hidden = true; toast.classList.remove('on'); say(reduce ? 'Hold to dive. Let go to launch.' : 'Hold to dive down the hills. Let go to launch off the top.'); }
  overBtn.addEventListener('click', function () { begin(); });

  function up() { pressed = false; }
  function jump() { if (!started) begin(); if (st) st.jumpQ = true; }
  cv.addEventListener('pointerdown', function (e) { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (x) {} if (!started) begin(); pressed = true; });
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('lostpointercapture', up);
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  var jb = document.getElementById('wg-jump');
  if (jb) { jb.addEventListener('pointerdown', function (e) { e.preventDefault(); jump(); }); jb.addEventListener('contextmenu', function (e) { e.preventDefault(); }); }
  function isDive(e) { return e.key === 'b' || e.key === 'B' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowRight'; }
  document.addEventListener('keydown', function (e) {
    if (root.hidden || document.querySelector('[data-view="craving"]').hidden) return;
    var t = e.target; if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
    if (e.key === 'Shift') { jump(); return; }
    if (isDive(e)) { if (e.key === ' ' && t && /^button$/i.test(t.tagName)) return; e.preventDefault(); if (!started) begin(); pressed = true; }
  });
  document.addEventListener('keyup', function (e) { if (isDive(e)) pressed = false; });

  /* tabs: pick a game */
  var es = document.getElementById('es'), tabEs = document.getElementById('cvt-es'), tabWg = document.getElementById('cvt-wg'), tabDd = document.getElementById('cvt-dd'), ddEl = document.getElementById('dd');
  function pick(which) {
    var wg = which === 'wg', dd = which === 'dd';
    es.hidden = which !== 'es'; root.hidden = !wg; if (ddEl) ddEl.hidden = !dd;
    [[tabEs, which === 'es'], [tabWg, wg], [tabDd, dd]].forEach(function (t) { if (t[0]) { t[0].classList.toggle('on', t[1]); t[0].setAttribute('aria-selected', String(t[1])); } });
    document.dispatchEvent(new CustomEvent('ss:cvgame', { detail: which }));
    if (wg) { if (!st) reset(); play(); } else pause();
  }
  tabEs.addEventListener('click', function () { pick('es'); }); tabWg.addEventListener('click', function () { pick('wg'); }); if (tabDd) tabDd.addEventListener('click', function () { pick('dd'); });
  document.addEventListener('ss:route', function (e) { if (e.detail.name !== 'craving') pause(); else if (!root.hidden) play(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); else if (!root.hidden && !document.querySelector('[data-view="craving"]').hidden) play(); });
  window.__wg = function () { return { pools: pools, cps: cps, st: st, pressed: pressed, started: started, diff: diff() }; };
  window.__wgPress = function (b) { pressed = !!b; };
})();
