/* Disc flight physics for the disc golf game (Disc-ipline). Pure functions, no DOM, so it can be tested in Node.
   World: x = right, y = forward (tee toward basket), z = up, metres and seconds.
   Model: lift and drag from angle of attack (Potts and Crowther style coefficients), the lift vector tilts with the disc's bank
   (hyzer / anhyzer), and the bank itself drifts: high speed turns the disc over (anhyzer), low speed makes it fade back (hyzer). */
(function (root) {
  'use strict';
  var RHO = 1.2, AREA = 0.0346, MASS = 0.175, GRAV = 9.81;
  var T = { thetaOff: 0, cl: 0.45, fadeK: 0.8, turnK: 0.3, fadeBase: 0.55, dragK: 0.62, lat: 2.2, pitchK: 0.7, trim: 0.03 };
  var CL0 = 0.188, CLA = 2.37, CD0 = 0.08, CDA = 2.72, A0 = -0.052;

  // speed / glide / turn / fade are the same four numbers real discs carry. vmax = hardest throw (m/s) a pro can make with it.
  var DISCS = {
    putter:  { id: 'putter',  name: 'Putter',          speed: 3,  glide: 3, turn: 0,  fade: 1, vmax: 22, col: '#f2f2f2' },
    mid:     { id: 'mid',     name: 'Midrange',        speed: 5,  glide: 4, turn: -1, fade: 1, vmax: 25, col: '#4a9bff' },
    fairway: { id: 'fairway', name: 'Fairway Driver',  speed: 9,  glide: 5, turn: -2, fade: 2, vmax: 29, col: '#ffd45a' },
    driver:  { id: 'driver',  name: 'Distance Driver', speed: 12, glide: 5, turn: -3, fade: 3, vmax: 36, col: '#ff4a55' }
  };

  function sstep(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function len(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(v) { var l = len(v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

  // Start a throw. power 0..1, aim = heading in radians (0 = +y, positive = to the right), hyzer in radians (positive = hyzer),
  // launch = nose-up angle in radians, spin +1 backhand (right hand) / -1 forehand.
  function launch(x, y, disc, power, aim, hyzer, launchAng, spin, noise) {
    noise = noise || 0;
    var v = disc.vmax * (0.18 + 0.82 * power);
    var h = aim + noise * 0.4, la = launchAng + noise * 0.15;
    return {
      p: [x, y, 1.2], v: [Math.sin(h) * Math.cos(la) * v, Math.cos(h) * Math.cos(la) * v, Math.sin(la) * v],
      bank: hyzer + noise * 0.1, theta: la + T.thetaOff + 0.01 * (disc.glide - 4), spin: spin || 1, t: 0, vref: disc.vmax * (0.18 + 0.82 * power), power: power, disc: disc
    };
  }

  // Advance the disc by dt seconds. wind = [wx, wy] in m/s. Returns the state (mutated).
  function step(s, dt, wind) {
    var d = s.disc, w = wind || [0, 0];
    var vr = [s.v[0] - w[0], s.v[1] - w[1], s.v[2]];
    var sp = len(vr); if (sp < 0.5) sp = 0.5;
    var f = [vr[0] / sp, vr[1] / sp, vr[2] / sp];
    var r = cross(f, [0, 0, 1]); if (len(r) < 0.05) r = [1, 0, 0]; r = norm(r);
    var u = cross(r, f);
    var gamma = Math.asin(Math.max(-1, Math.min(1, f[2])));
    var alpha = s.theta - gamma;
    var gk = 0.72 + 0.1 * d.glide;                              // glide rating scales the lift
    var cl = T.cl * gk * (CL0 + CLA * Math.min(alpha, 0.38)) - (alpha > 0.38 ? (alpha - 0.38) * 5 : 0);
    var cd = CD0 + CDA * (alpha - A0) * (alpha - A0);
    var q = 0.5 * RHO * sp * sp * AREA, L = q * cl, D = q * cd * T.dragK * (1.1 - 0.035 * d.speed);
    var cb = Math.cos(s.bank), sb = Math.sin(s.bank);
    var ax = (L * (u[0] * cb - T.lat * s.spin * r[0] * sb) - D * f[0]) / MASS;
    var ay = (L * (u[1] * cb - T.lat * s.spin * r[1] * sb) - D * f[1]) / MASS;
    var az = (L * (u[2] * cb - T.lat * s.spin * r[2] * sb) - D * f[2]) / MASS - GRAV;
    s.v[0] += ax * dt; s.v[1] += ay * dt; s.v[2] += az * dt;
    s.p[0] += s.v[0] * dt; s.p[1] += s.v[1] * dt; s.p[2] += s.v[2] * dt;
    // bank drift: speed relative to this throw's launch speed decides turn (fast) vs fade (slow)
    var sn = sp / Math.max(8, s.vref);
    var turnRate = T.turnK * d.turn * 0.28 * sstep(0.62, 0.92, sn) * (s.bank > -0.25 ? 1 : 0.3);   // turn is negative: rolls toward anhyzer
    var fadeRate = T.fadeK * (T.fadeBase + d.fade * 0.5) * sstep(0.75, 0.38, sn);
    s.bank += (turnRate + fadeRate) * dt;
    s.bank = Math.max(-0.9, Math.min(1.1, s.bank));
    s.theta += (gamma + T.trim - s.theta) * T.pitchK * dt;   // the nose follows the flight path
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

  root.DiscPhys = { T: T, DISCS: DISCS, launch: launch, step: step, flyOut: flyOut, rollOut: rollOut, RHO: RHO };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.DiscPhys;
})(typeof window !== 'undefined' ? window : this);
