/* Lindsay Clancy archive search: words AND meaning, across every trial-day transcript and every document page.
   Meaning search uses a small open model (BGE-small), running in the visitor's browser (free, nothing sent anywhere).
   Data: data/clancy-text.json (passages), data/clancy-embeddings.bin (one 384-number vector per passage). */
(function () {
  var LIB = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js', DIM = 384;
  var QP = 'Represent this sentence for searching relevant passages: ';
  var T = null, V = null, ex = null, state = 'idle', waiters = [];
  var STOP = /^(the|a|an|and|or|of|to|in|on at is was were did do does what who when where why how about for with from that this it he she they her his their i you me my)$/;
  function jget(p) { return fetch(p).then(function (r) { if (!r.ok) throw new Error(p); return r.json(); }); }
  function loadText() { return T ? Promise.resolve(T) : jget('data/clancy-text.json?v=' + (window.CL_V || 1)).then(function (d) { T = d; return d; }); }
  function loadMeaning() {
    if (state !== 'idle') return;
    state = 'loading';
    var bin = fetch('data/clancy-embeddings.bin?v=' + (window.CL_V || 1)).then(function (r) { if (!r.ok) throw new Error('bin'); return r.arrayBuffer(); });
    var lib = import(LIB).then(function (L) {
      L.env.allowRemoteModels = false; L.env.allowLocalModels = true; L.env.localModelPath = new URL('models/', document.baseURI).href;
      try { L.env.backends.onnx.wasm.numThreads = 1; } catch (e) {}
      return L.pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5', { quantized: true });
    });
    Promise.all([loadText(), bin, lib]).then(function (r) {
      V = new Int8Array(r[1]); ex = r[2];
      if (V.length !== T.length * DIM) throw new Error('mismatch');
      state = 'ready'; waiters.splice(0).forEach(function (f) { f(); });
    }).catch(function () { state = 'failed'; waiters.splice(0).forEach(function (f) { f(); }); });
  }
  function words(q) { return q.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(function (w) { return w.length > 1 && !STOP.test(w); }); }
  /* a word's root, so bifurcate finds bifurcated and bifurcation, and jury finds jurors' */
  function root(w) { if (w.length >= 8) return w.slice(0, w.length - 2); if (w.length >= 6) return w.replace(/(ing|ed|es|s|e|y)$/, ''); if (w.length >= 5) return w.replace(/(s)$/, ''); return w; }
  function keyword(q) {
    var ws = words(q), phrase = q.trim().toLowerCase(), out = [];
    if (!ws.length) return out;
    for (var i = 0; i < T.length; i++) {
      var x = T[i].x.toLowerCase(), s = 0;
      for (var k = 0; k < ws.length; k++) if (x.indexOf(root(ws[k])) > -1) s++;
      if (!s) continue;
      var sc = s / ws.length; if (phrase.length > 3 && x.indexOf(phrase) > -1) sc += 1;
      if (sc >= 0.99 || ws.length === 1) out.push({ i: i, s: sc });
    }
    out.sort(function (a, b) { return b.s - a.s; }); return out.slice(0, 40);
  }
  function meaning(q) {
    return new Promise(function (res) {
      function run() {
        if (state !== 'ready') return res([]);
        ex([QP + q], { pooling: 'mean', normalize: true }).then(function (o) {
          var qv = o.data, n = T.length, out = [];
          for (var i = 0; i < n; i++) { var d = 0, b = i * DIM; for (var k = 0; k < DIM; k++) d += qv[k] * V[b + k]; out.push({ i: i, s: d / 127 }); }
          out.sort(function (a, b) { return b.s - a.s; }); res(out.slice(0, 40));
        }).catch(function () { res([]); });
      }
      if (state === 'loading' || state === 'idle') waiters.push(run); else run();
    });
  }
  /* search(q) -> Promise of { hits: [chunk + {score, why}], meaning: true|false } best first, deduped so one moment shows once */
  function search(q) {
    loadMeaning();
    return loadText().then(function () {
      var ws = words(q), kw = keyword(q);
      return meaning(q).then(function (m) {
        var cand = {}, ready = state === 'ready';
        m.forEach(function (r) { cand[r.i] = { i: r.i, sem: r.s, kw: 0 }; });
        kw.forEach(function (r) { (cand[r.i] = cand[r.i] || { i: r.i, sem: 0, kw: 0 }).kw = Math.min(1.5, r.s); });
        var list = Object.keys(cand).map(function (k) {
          var c = cand[k]; var exact = c.kw >= 1 ? (ws.length <= 2 ? 1 : 0.12) : 0; c.s = ready ? c.sem + exact : c.kw; return c;
        }).sort(function (a, b) { return b.s - a.s; });
        var topSem = 0; list.forEach(function (r) { if (r.sem > topSem) topSem = r.sem; });
        var seen = {}, dup = {}, hits = [], hasKw = kw.some(function (r) { return r.s >= 1; });
        list.forEach(function (r) {
          if (hits.length >= 24) return;
          if (ready && r.kw < 1 && (r.sem < topSem - 0.14 || (hasKw && ws.length <= 2 && r.sem < 0.62))) return;
          var c = T[r.i], key = c.k + c.id + ':' + Math.floor(c.at / (c.k === 'v' ? 150 : 1));
          if (seen[key]) return; seen[key] = 1;
          var sig = c.x.slice(0, 90).toLowerCase(); if (dup[sig]) return; dup[sig] = 1;
          hits.push({ c: c, why: r.kw >= 1 && r.sem ? 'words + meaning' : (r.sem && ready ? 'meaning' : 'words'), s: r.s });
        });
        return { hits: hits, meaning: ready };
      });
    });
  }
  window.ClancySearch = { search: search, warm: loadMeaning, words: words, roots: function (q) { return words(q).map(root); }, state: function () { return state; } };
})();
