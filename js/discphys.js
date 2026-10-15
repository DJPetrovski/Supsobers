/* Disc flight physics for the disc golf game (Disc-ipline). Pure functions, no DOM, so it can be tested in Node.
   World: x = right, y = forward (tee toward basket), z = up, metres and seconds.
   Model: lift and drag from angle of attack (Potts and Crowther style coefficients). The lift vector tilts with the disc's bank
   (hyzer / anhyzer), which gives the sideways force. The bank itself is not free: at high speed a disc turns over a little (anhyzer),
   at low speed it settles back to a bounded hyzer (fade) and drops. That makes the real S-curve and keeps the flight from ever
   spiralling like a boomerang. Each disc's four published numbers (speed, glide, turn, fade) set how it behaves. */
(function (root) {
  'use strict';
  var RHO = 1.2, AREA = 0.0346, MASS = 0.175, GRAV = 9.81;
  var T = { cl: 0.45, dragK: 0.76, pitchK: 0.7, trim: 0.03, kRoll: 1.2, turnK: 0.55, turnMax: 0.42, fadeCap: 0.07, fadeCapK: 0.05, hyzerMax: 0.62 };
  var CL0 = 0.188, CLA = 2.37, CD0 = 0.08, CDA = 2.72, A0 = -0.052;

  // Real molds with the flight numbers their makers publish (speed | glide | turn | fade). The game only approximates how they fly.
  // vmax is the hardest throw (m/s) a strong thrower can make with that class of disc.
  function mk(id, brand, name, kind, speed, glide, turn, fade, vmax, col, rim) { return { id: id, brand: brand, name: name, kind: kind, speed: speed, glide: glide, turn: turn, fade: fade, vmax: vmax, col: col, rim: rim || '#ffffff' }; }
  var LIST = [
    mk('aviar',      'Innova',    'Aviar',      'Putter',          2, 3,  0, 1, 22, '#f2f2f2', '#d33'),
    mk('judge',      'Dynamic Discs', 'Judge',  'Putter',          2, 4,  0, 1, 22, '#7ec8ff', '#fff'),
    mk('buzzz',      'Discraft',  'Buzzz',      'Midrange',        5, 4, -1, 1, 26, '#4a9bff', '#fff'),
    mk('mako3',      'Innova',    'Mako3',      'Midrange',        5, 5,  0, 0, 26, '#3ecf8e', '#fff'),
    mk('roc3',       'Innova',    'Roc3',       'Midrange',        5, 4,  0, 3, 26, '#ff9a3c', '#fff'),
    mk('leopard3',   'Innova',    'Leopard3',   'Fairway driver',  7, 5, -2, 1, 30, '#c58bff', '#fff'),
    mk('teebird',    'Innova',    'Teebird',    'Fairway driver',  7, 5,  0, 2, 30, '#ffd45a', '#222'),
    mk('firebird',   'Innova',    'Firebird',   'Fairway driver',  9, 3,  0, 4, 31, '#ff5a3c', '#fff'),
    mk('wraith',     'Innova',    'Wraith',     'Distance driver', 11, 5, -1, 3, 35, '#2fd0d0', '#fff'),
    mk('destroyer',  'Innova',    'Destroyer',  'Distance driver', 12, 5, -1, 3, 36, '#ff4a55', '#fff'),
    mk('zeus',       'Discraft',  'Zeus',       'Distance driver', 12, 5, -1, 3, 36, '#e8d84a', '#222'),
    mk('shryke',     'Innova',    'Shryke',     'Distance driver', 13, 6, -2, 2, 37, '#9a5cff', '#fff')
  ];
  var DISCS = {};
  LIST.forEach(function (d) { DISCS[d.id] = d; });
  // old keys still work (a few older bits of the game ask for a class by name)
  ['aviar', 'judge', 'buzzz', 'mako3', 'roc3'].forEach(function (id) { DISCS[id].skip = true; });   // flat, blunt-edged discs that skip across water
  DISCS.putter = DISCS.aviar; DISCS.mid = DISCS.buzzz; DISCS.fairway = DISCS.teebird; DISCS.driver = DISCS.destroyer;

  function sstep(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function len(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(v) { var l = len(v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  // the speed (m/s) this disc is designed to be thrown at: it turns above about 70% of this and fades below about 50%
  function designSpeed(d) { return 13 + 2.1 * d.speed; }

  // Start a throw. power 0..1, aim = heading in radians (0 = +y, positive = to the right), hyzer in radians (positive = hyzer),
  // launch = nose-up angle in radians, spin +1 backhand (right hand) / -1 forehand.
  function launch(x, y, disc, power, aim, hyzer, launchAng, spin, noise) {
    noise = noise || 0;
    var v = disc.vmax * (0.18 + 0.82 * power);
    var h = aim + noise * 0.4, la = launchAng + noise * 0.15;
    var b0 = Math.max(-T.hyzerMax, Math.min(T.hyzerMax, hyzer + noise * 0.1));
    return {
      p: [x, y, 1.2], v: [Math.sin(h) * Math.cos(la) * v, Math.cos(h) * Math.cos(la) * v, Math.sin(la) * v],
      bank: b0, bank0: b0, theta: la + 0.01 * (disc.glide - 4), spin: spin || 1, t: 0, vref: v, power: power, disc: disc, rot: 0
    };
  }

  // Advance the disc by dt seconds. wind = [wx, wy] in m/s. Returns the state (mutated).
  function step(s, dt, wind) {
    var d = s.disc, w = wind || [0, 0]; if (s.pizza) w = [w[0] * 0.3, w[1] * 0.3];   // an upright, fast-spinning pizza putt cuts through wind
    var vr = [s.v[0] - w[0], s.v[1] - w[1], s.v[2]];
    var sp = len(vr); if (sp < 0.5) sp = 0.5;
    var f = [vr[0] / sp, vr[1] / sp, vr[2] / sp];
    var r = cross(f, [0, 0, 1]); if (len(r) < 0.05) r = [1, 0, 0]; r = norm(r);
    var u = cross(r, f);
    var gamma = Math.asin(Math.max(-1, Math.min(1, f[2])));
    var alpha = s.theta - gamma;
    var gk = (0.8 + 0.1 * d.glide) * (s.pizza ? 0.5 : 1);                              // glide rating scales the lift
    var cl = T.cl * gk * (CL0 + CLA * Math.min(alpha, 0.38)) - (alpha > 0.38 ? (alpha - 0.38) * 5 : 0);
    var cd = CD0 + CDA * (alpha - A0) * (alpha - A0);
    var q = 0.5 * RHO * sp * sp * AREA, L = q * cl, D = q * cd * T.dragK * (0.92 - 0.012 * d.speed) * (s.pizza ? 0.8 : 1);
    var cb = Math.cos(s.bank), sb = Math.sin(s.bank);
    // lift acts square to the disc: up when flat, tilted toward the low (inside) edge on hyzer, toward the high edge on anhyzer
    var ax = (L * (u[0] * cb - s.spin * r[0] * sb) - D * f[0]) / MASS;
    var ay = (L * (u[1] * cb - s.spin * r[1] * sb) - D * f[1]) / MASS;
    var az = (L * (u[2] * cb - s.spin * r[2] * sb) - D * f[2]) / MASS - GRAV;
    s.v[0] += ax * dt; s.v[1] += ay * dt; s.v[2] += az * dt;
    s.p[0] += s.v[0] * dt; s.p[1] += s.v[1] * dt; s.p[2] += s.v[2] * dt;

    // Bank: bounded, never free-running.
    //  turn: fast for this disc -> rolls toward anhyzer, but only as far as turnMax and only for turny discs
    //  fade: slow for this disc -> relaxes toward a modest hyzer set by its fade rating (never past about 25 degrees)
    var sn = sp / designSpeed(d), tn = -d.turn;
    var fast = sstep(0.66, 1.0, sn), slow = sstep(0.8, 0.42, sn);
    var turnRate = T.turnK * (0.15 + 0.85 * Math.min(tn, 4) / 4 * 1.0) * fast * (tn > 0 || sn > 0.9 ? 1 : 0.35) * (s.bank > -T.turnMax ? 1 : 0);
    var cap = T.fadeCap + T.fadeCapK * d.fade;
    if (!s.pizza) { s.bank += (-turnRate * (tn > 0 ? 1 : 0.4) * dt) + T.kRoll * slow * (cap - s.bank) * dt; s.bank = Math.max(-T.turnMax - 0.05, Math.min(T.hyzerMax, s.bank)); }
    s.theta += (gamma + T.trim - s.theta) * T.pitchK * dt;   // the nose follows the flight path
    s.rot += 120 * dt;                                       // visual spin (about 19 rev/s)
    s.t += dt;
    return s;
  }

  // Full flight in free air (no obstacles). Returns the landing state.
  function flyOut(s, wind, maxT) {
    var dt = 1 / 120, n = 0, trace = [];
    while (s.p[2] > 0 && s.t < (maxT || 12)) { step(s, dt, wind); if (++n % 6 === 0) trace.push([s.p[0], s.p[1], s.p[2]]); }
    return { s: s, trace: trace };
  }

  // Slide and roll after landing. Returns the horizontal travel vector [dx, dy] given terrain friction (1 = fairway grass).
  function rollOut(s, surface) {
    var vh = Math.sqrt(s.v[0] * s.v[0] + s.v[1] * s.v[1]); if (vh < 0.1) return [0, 0];
    var flat = 1 - sstep(0.08, 0.5, Math.abs(s.bank));
    var keep = 0.12 + 0.34 * flat;                              // flat landings roll, hyzer / anhyzer landings stop quickly
    var vg = vh * keep, decel = 2.8 * (surface || 1), dist = vg * vg / (2 * decel);
    var hx = s.v[0] / vh, hy = s.v[1] / vh;
    // an anhyzer disc rolls off to the side it is tilted toward; hyzer skips the other way
    var turn = -s.spin * s.bank * 0.9 * flat, c = Math.cos(turn), sn = Math.sin(turn);
    return [(hx * c + hy * sn) * dist, (hy * c - hx * sn) * dist];
  }

  root.DiscPhys = { T: T, DISCS: DISCS, LIST: LIST, launch: launch, step: step, flyOut: flyOut, rollOut: rollOut, designSpeed: designSpeed, RHO: RHO };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.DiscPhys;
})(typeof window !== 'undefined' ? window : this);
