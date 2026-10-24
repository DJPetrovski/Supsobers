/* Blok Bottom engine: the 21 pieces, the placement rules, scoring and the computer players.
   Rules (the classic corner-touching board game): your first piece covers your start square; every later piece must touch
   one of your own pieces at a corner only, never along an edge. Pieces of other colors may touch yours anywhere.
   When you cannot place a piece you are out; the game ends when everyone is out. Score = minus the squares left in your hand,
   +15 for placing all 21, +5 more if the last piece you placed was the single square.
   Works in the browser (window.BlockCore) and in Node (module.exports) so it can be tested with random playouts. */
(function (root) {
  'use strict';

  /* ---------- pieces ---------- */
  var SHAPES = [
    ['I1', ['X']], ['I2', ['XX']], ['I3', ['XXX']], ['V3', ['X.', 'XX']],
    ['I4', ['XXXX']], ['L4', ['X..', 'XXX']], ['T4', ['XXX', '.X.']], ['S4', ['.XX', 'XX.']], ['O4', ['XX', 'XX']],
    ['F5', ['.XX', 'XX.', '.X.']], ['I5', ['XXXXX']], ['L5', ['X...', 'XXXX']], ['N5', ['XX..', '.XXX']], ['P5', ['XX', 'XX', 'X.']],
    ['T5', ['XXX', '.X.', '.X.']], ['U5', ['X.X', 'XXX']], ['V5', ['X..', 'X..', 'XXX']], ['W5', ['X..', 'XX.', '.XX']],
    ['X5', ['.X.', 'XXX', '.X.']], ['Y5', ['XXXX', '.X..']], ['Z5', ['XX.', '.X.', '.XX']]
  ];
  function parse(rows) { var c = []; rows.forEach(function (r, y) { for (var x = 0; x < r.length; x++) if (r.charAt(x) === 'X') c.push([x, y]); }); return c; }
  function norm(cells) {
    var mx = 1e9, my = 1e9; cells.forEach(function (c) { if (c[0] < mx) mx = c[0]; if (c[1] < my) my = c[1]; });
    return cells.map(function (c) { return [c[0] - mx, c[1] - my]; }).sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; });
  }
  function xform(cells, k) {   // k = 0..7: four rotations, then the same four mirrored
    return norm(cells.map(function (c) {
      var x = c[0], y = c[1], t; if (k >= 4) x = -x;
      for (var r = 0; r < (k & 3); r++) { t = x; x = -y; y = t; }
      return [x, y];
    }));
  }
  var PIECES = SHAPES.map(function (s, i) {
    var base = parse(s[1]), seen = {}, orients = [];
    for (var k = 0; k < 8; k++) {
      var cells = xform(base, k), key = cells.map(function (c) { return c[0] + ',' + c[1]; }).join(';');
      if (seen[key]) continue; seen[key] = 1;
      var w = 0, h = 0; cells.forEach(function (c) { if (c[0] + 1 > w) w = c[0] + 1; if (c[1] + 1 > h) h = c[1] + 1; });
      orients.push({ cells: cells, w: w, h: h });
    }
    return { id: i, name: s[0], size: base.length, base: norm(base), orients: orients };
  });
  var TOTAL_SQUARES = PIECES.reduce(function (a, p) { return a + p.size; }, 0);   // 89

  /* ---------- the boards ---------- */
  var COLORS = ['Blue', 'Yellow', 'Red', 'Green', 'Purple', 'Orange'];
  var VARIANTS = {
    duo:  { key: 'duo',  label: '2 players',  n: 14, seats: 2, starts: [[4, 4], [9, 9]] },
    four: { key: 'four', label: '4 players',  n: 20, seats: 4, starts: [[0, 0], [19, 0], [19, 19], [0, 19]] },
    five: { key: 'five', label: '5 players',  n: 22, seats: 5, starts: [[0, 0], [10, 0], [21, 0], [21, 21], [0, 21]] },
    six:  { key: 'six',  label: '6 players',  n: 24, seats: 6, starts: [[0, 0], [23, 0], [23, 11], [23, 23], [0, 23], [0, 12]] }
  };

  /* ---------- game state ---------- */
  function newGame(vkey) {
    var v = VARIANTS[vkey]; if (!v) throw new Error('unknown variant ' + vkey);
    var st = { v: v, n: v.n, S: v.seats, board: new Int8Array(v.n * v.n), used: [], first: [], out: [], remaining: [], lastPiece: [], turn: 0, moves: [], over: false, events: [] };
    for (var i = 0; i < st.board.length; i++) st.board[i] = -1;
    for (var c = 0; c < v.seats; c++) { st.used.push(new Uint8Array(PIECES.length)); st.first.push(true); st.out.push(false); st.remaining.push(TOTAL_SQUARES); st.lastPiece.push(-1); }
    return st;
  }

  function legalAt(st, c, orient, ox, oy) {
    var n = st.n, b = st.board, cells = orient.cells, ok = false, first = st.first[c], sx = 0, sy = 0;
    if (first) { sx = st.v.starts[c][0]; sy = st.v.starts[c][1]; }
    for (var k = 0; k < cells.length; k++) {
      var x = ox + cells[k][0], y = oy + cells[k][1];
      if (x < 0 || y < 0 || x >= n || y >= n) return false;
      var i = y * n + x; if (b[i] !== -1) return false;
      if ((x > 0 && b[i - 1] === c) || (x < n - 1 && b[i + 1] === c) || (y > 0 && b[i - n] === c) || (y < n - 1 && b[i + n] === c)) return false;
      if (first) { if (x === sx && y === sy) ok = true; }
      else if (!ok) {
        if ((x > 0 && y > 0 && b[i - n - 1] === c) || (x < n - 1 && y > 0 && b[i - n + 1] === c) || (x > 0 && y < n - 1 && b[i + n - 1] === c) || (x < n - 1 && y < n - 1 && b[i + n + 1] === c)) ok = true;
      }
    }
    return ok;
  }

  // The cells where this color may still start a piece: empty, no edge contact with itself, at least one corner contact.
  function frontier(st, c) {
    var n = st.n, b = st.board, out = [];
    if (st.first[c]) { var s = st.v.starts[c], si = s[1] * n + s[0]; return b[si] === -1 ? [si] : []; }
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      var i = y * n + x; if (b[i] !== -1) continue;
      if ((x > 0 && b[i - 1] === c) || (x < n - 1 && b[i + 1] === c) || (y > 0 && b[i - n] === c) || (y < n - 1 && b[i + n] === c)) continue;
      if ((x > 0 && y > 0 && b[i - n - 1] === c) || (x < n - 1 && y > 0 && b[i - n + 1] === c) || (x > 0 && y < n - 1 && b[i + n - 1] === c) || (x < n - 1 && y < n - 1 && b[i + n + 1] === c)) out.push(i);
    }
    return out;
  }

  function genMoves(st, c, firstOnly) {
    var n = st.n, used = st.used[c], fr = frontier(st, c), seen = {}, moves = [];
    for (var f = 0; f < fr.length; f++) {
      var fx = fr[f] % n, fy = (fr[f] - fx) / n;
      for (var p = 0; p < PIECES.length; p++) {
        if (used[p]) continue; var os = PIECES[p].orients;
        for (var oi = 0; oi < os.length; oi++) {
          var cells = os[oi].cells;
          for (var k = 0; k < cells.length; k++) {
            var ox = fx - cells[k][0], oy = fy - cells[k][1], key = ((p * 8 + oi) * 64 + oy + 8) * 64 + ox + 8;
            if (seen[key]) continue; seen[key] = 1;
            if (legalAt(st, c, os[oi], ox, oy)) { moves.push({ c: c, p: p, o: oi, x: ox, y: oy }); if (firstOnly) return moves; }
          }
        }
      }
    }
    return moves;
  }
  function hasMove(st, c) { return genMoves(st, c, true).length > 0; }

  function isLegal(st, m) {
    if (!m || st.over || m.c !== st.turn) return false;
    var p = PIECES[m.p]; if (!p || st.used[m.c][m.p]) return false;
    var o = p.orients[m.o]; if (!o) return false;
    return legalAt(st, m.c, o, m.x, m.y);
  }

  // Place a piece (must be legal) and pass the turn on to the next color that still has a move.
  function play(st, m) {
    var p = PIECES[m.p], o = p.orients[m.o], n = st.n, c = m.c;
    for (var k = 0; k < o.cells.length; k++) st.board[(m.y + o.cells[k][1]) * n + m.x + o.cells[k][0]] = c;
    st.used[c][m.p] = 1; st.remaining[c] -= p.size; st.first[c] = false; st.lastPiece[c] = m.p; st.moves.push(m); st.events = [];
    for (var j = 1; j <= st.S; j++) {
      var nc = (c + j) % st.S; if (st.out[nc]) continue;
      if (hasMove(st, nc)) { st.turn = nc; return st; }
      st.out[nc] = true; st.events.push({ type: 'out', c: nc });
    }
    st.over = true; return st;
  }
  // Colors that cannot move are skipped automatically; this is also used right at the start.
  function settle(st) {
    for (var j = 0; j < st.S; j++) { var nc = (st.turn + j) % st.S; if (st.out[nc]) continue; if (hasMove(st, nc)) { st.turn = nc; return st; } st.out[nc] = true; st.events.push({ type: 'out', c: nc }); }
    st.over = true; return st;
  }

  function scores(st) {
    return st.remaining.map(function (r, c) { return r === 0 ? 15 + (st.lastPiece[c] === 0 ? 5 : 0) : -r; });
  }

  /* ---------- computer players ---------- */
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

  var HW = [1.0, 0.5];
  function chooseMove(st, c, level, rand) {
    rand = rand || Math.random; level = level || 'normal';
    var moves = genMoves(st, c); if (!moves.length) return null;
    if (level === 'easy') {   // bigger pieces are likelier, but it is just luck
      var tot = 0, wts = moves.map(function (m) { var w = Math.pow(PIECES[m.p].size, 1.6); tot += w; return w; }), r = rand() * tot;
      for (var i = 0; i < moves.length; i++) { r -= wts[i]; if (r <= 0) return moves[i]; }
      return moves[moves.length - 1];
    }
    var n = st.n, b = st.board, oppFlag = new Uint8Array(n * n), nOpp = 0;
    for (var o = 0; o < st.S; o++) if (o !== c && !st.out[o]) { nOpp++; frontier(st, o).forEach(function (i) { oppFlag[i] = 1; }); }
    var placed = st.moves.length, early = placed < st.S * 7, mid = (n - 1) / 2;
    var scored = moves.map(function (m) {
      var cells = PIECES[m.p].orients[m.o].cells, size = cells.length, blocks = 0, corners = 0, cd = 0, inMove = {};
      cells.forEach(function (q) { inMove[(m.y + q[1]) * n + m.x + q[0]] = 1; });
      cells.forEach(function (q) {
        var x = m.x + q[0], y = m.y + q[1], i = y * n + x; if (oppFlag[i]) blocks++;
        cd += Math.abs(x - mid) + Math.abs(y - mid);
        for (var d = 0; d < 4; d++) {
          var dx = x + (d & 1 ? 1 : -1), dy = y + (d & 2 ? 1 : -1); if (dx < 0 || dy < 0 || dx >= n || dy >= n) continue;
          var j = dy * n + dx; if (b[j] !== -1 || inMove[j]) continue;
          if ((dx > 0 && (b[j - 1] === c || inMove[j - 1])) || (dx < n - 1 && (b[j + 1] === c || inMove[j + 1])) || (dy > 0 && (b[j - n] === c || inMove[j - n])) || (dy < n - 1 && (b[j + n] === c || inMove[j + n]))) continue;
          corners++;
        }
      });
      var s = size * (early ? 3.2 : 2.4) + corners * 1.1 + blocks * 1.6 - (early ? cd / size * 0.35 : 0) + rand() * 0.8;
      if (size === 1 && st.remaining[c] > 6) s -= 6;   // keep the single square for the end
      return { m: m, s: s };
    });
    scored.sort(function (a, b2) { return b2.s - a.s; });
    if (level === 'normal') { var u = rand(); return scored[Math.min(scored.length - 1, u < 0.5 ? 0 : u < 0.8 ? 1 : u < 0.93 ? 2 : 3)].m; }   // usually a good move, sometimes only a decent one
    // hard: look at the best few, actually play each on a copy and compare how much room everyone has afterwards
    var best = null, bv = -1e9, K = Math.min(28, scored.length);
    for (var k = 0; k < K; k++) {
      var m2 = scored[k].m, o2 = PIECES[m2.p].orients[m2.o], copy = { n: n, S: st.S, v: st.v, board: new Int8Array(b), first: st.first.slice(), out: st.out };
      for (var q = 0; q < o2.cells.length; q++) copy.board[(m2.y + o2.cells[q][1]) * n + m2.x + o2.cells[q][0]] = c;
      copy.first[c] = false;
      var mine = frontier(copy, c).length, theirs = 0; for (var oo = 0; oo < st.S; oo++) if (oo !== c && !st.out[oo]) theirs += frontier(copy, oo).length;
      var v = scored[k].s + mine * HW[0] - (nOpp ? theirs / nOpp : 0) * HW[1];
      if (v > bv) { bv = v; best = m2; }
    }
    return best;
  }

  var api = { PIECES: PIECES, VARIANTS: VARIANTS, COLORS: COLORS, TOTAL_SQUARES: TOTAL_SQUARES, newGame: newGame, legalAt: legalAt, frontier: frontier, genMoves: genMoves, hasMove: hasMove, isLegal: isLegal, play: play, settle: settle, scores: scores, chooseMove: chooseMove, setHW: function (a) { HW = a; }, rng: rng };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BlockCore = api;
})(typeof window !== 'undefined' ? window : this);
