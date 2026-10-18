/* Search by meaning. A small language model runs in the visitor's own browser (nothing is sent anywhere),
   turns the question into numbers, and finds the video titles and spoken moments that mean the same thing,
   even when none of the words match. The index is built by scripts/build_embeddings.mjs. It loads the first
   time someone opens search, so the rest of the site is not slowed down. */
(function () {
  window.SS = window.SS || {};
  var LIB = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js', DIM = 384;
  var st = { state: 'idle', meta: null, vecs: null, ex: null, error: null }, waiting = [];
  function jget(p) { return fetch(p, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(p); return r.json(); }); }
  function load() {
    if (st.state !== 'idle') return;
    st.state = 'loading';
    var idx = Promise.all([jget('data/embeddings.json'), fetch('data/embeddings.bin', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('bin'); return r.arrayBuffer(); })]);
    var lib = import(LIB).then(function (T) {
      T.env.allowRemoteModels = false; T.env.allowLocalModels = true; T.env.localModelPath = new URL('models/', document.baseURI).href;
      try { T.env.backends.onnx.wasm.numThreads = 1; } catch (e) {}
      return T.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
    });
    Promise.all([idx, lib]).then(function (r) {
      st.meta = r[0][0].items; st.vecs = new Int8Array(r[0][1]); st.ex = r[1];
      if (st.vecs.length !== st.meta.length * DIM) throw new Error('index mismatch');
      st.state = 'ready'; document.dispatchEvent(new Event('ss:semantic'));
      waiting.splice(0).forEach(function (f) { f(); });
    }).catch(function (e) { st.state = 'failed'; st.error = e; waiting.splice(0).forEach(function (f) { f(); }); });
  }
  /* query(q) -> Promise of [{ id, at, s }] best first (at = -1 means the video title), or [] if unavailable */
  function query(q) {
    load();
    return new Promise(function (res) {
      function run() {
        if (st.state !== 'ready') return res([]);
        st.ex([q], { pooling: 'mean', normalize: true }).then(function (o) {
          var qv = o.data, n = st.meta.length, out = [], v = st.vecs;
          for (var i = 0; i < n; i++) {
            var d = 0, b = i * DIM; for (var k = 0; k < DIM; k++) d += qv[k] * v[b + k];
            out.push({ id: st.meta[i][0], at: st.meta[i][1], s: d / 127 });
          }
          out.sort(function (a, b) { return b.s - a.s; }); res(out.slice(0, 60));
        }).catch(function () { res([]); });
      }
      if (st.state === 'loading' || st.state === 'idle') waiting.push(run); else run();
    });
  }
  SS.semantic = { warm: load, query: query, state: function () { return st.state; } };
})();
