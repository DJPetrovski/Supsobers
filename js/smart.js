/* Smarter search for the whole site.
   It does not need every word to match. It understands plurals, small typos and word endings,
   knows which names and ideas belong together (data/concepts.json plus the Web storylines),
   pulls in the other videos from a matching storyline, and, once transcripts are added
   (data/transcripts.json), searches what is actually said in each video. */
(function () {
  var concepts = [], transcripts = null, ready = false;
  window.SS = window.SS || {};
  function get(p) { return fetch(p, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }); }
  get('data/concepts.json').then(function (d) { concepts = d.groups || []; ready = true; });
  var tsAsked = false;
  function askTranscripts() {   // transcripts can be big, so they load the first time someone searches
    if (tsAsked) return; tsAsked = true;
    get('data/transcripts.json').then(function (d) { if (d && !d.error && Object.keys(d).length) { transcripts = d; document.dispatchEvent(new Event('ss:transcripts')); } });
  }

  var STOP = /^(the|a|an|of|about|on|in|and|or|to|with|for|from|by|at|is|was|were|are|did|does|do|how|why|what|who|whom|when|where|which|me|my|show|find|any|anything|all|some|video|videos|episode|episodes|watch|that|this|these|those|it|its|you|your|i|we|they|there|tell|please|related|stuff|things|not|no|nor|can|could|will|would|should|shall|may|might|must|has|have|had|be|been|being|am|than|then|so|just|really|very|too|also|if|but|as|into|out|up|down|over|under|more|most|much|many|his|her|him|she|he|their|them|our|us|give|gave|get|got|say|said|tell|told|go|went|come|came|make|made|happen|happened|happens|going|know|think|thing|way|like|want|wants|take|took)$/;
  function norm(s) { return (s || '').toLowerCase().replace(/[’']/g, "'").replace(/-/g, ' ').replace(/[^a-z0-9'\/ ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function words(s) { return norm(s).split(' ').filter(Boolean); }
  function stem(w) {
    w = w.replace(/'s$/, '');
    if (w.length > 5 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (w.length > 5 && /(ing|ers)$/.test(w)) return w.slice(0, -3);
    if (w.length > 4 && /(es|ed)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function hash32(w) { var h = 2166136261; var b = unescape(encodeURIComponent(w)); for (var i = 0; i < b.length; i++) { h ^= b.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); }
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var p = [], i, j; for (j = 0; j <= b.length; j++) p[j] = j;
    for (i = 1; i <= a.length; i++) {
      var c = [i], m = i;
      for (j = 1; j <= b.length; j++) { c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (c[j] < m) m = c[j]; }
      if (m > max) return max + 1; p = c;
    }
    return p[b.length];
  }
  // does a title (already lower-cased, with its stemmed words) contain this word or phrase?
  // loose = allow word beginnings and small typos
  function hasTerm(text, tw, term, loose) {
    term = norm(term); if (!term) return false;
    if (term.indexOf(' ') >= 0 || /[\/]/.test(term)) return text.indexOf(term) >= 0;
    var st = stem(term);
    for (var i = 0; i < tw.length; i++) {
      var w = tw[i];
      if (w === st) return true;
      if (st.length >= 4 && (w.indexOf(st) === 0 || (w.length >= 5 && st.indexOf(w) === 0))) return true;
      if (loose && st.length >= 5 && lev(w, st, st.length >= 8 ? 2 : 1) <= (st.length >= 8 ? 2 : 1)) return true;
    }
    return false;
  }
  function expand(q, toks) {
    var phrase = ' ' + norm(q) + ' ', direct = {}, related = {}, why = [];
    var stoks = toks.map(stem);
    (concepts).forEach(function (g) {
      var hit = (g.terms || []).some(function (t) { t = norm(t); return t.indexOf(' ') >= 0 ? phrase.indexOf(' ' + t + ' ') >= 0 : stoks.indexOf(stem(t)) >= 0; });
      if (!hit) return;
      (g.terms || []).forEach(function (t) { direct[norm(t)] = 1; });
      (g.related || []).forEach(function (t, i) { var k = norm(t); if (!(k in related) || related[k] < 1.5 - i * 0.2) related[k] = Math.max(0, 1.5 - i * 0.2); });
    });
    // Web storylines: a word in a storyline's name or keywords pulls in the rest of that storyline
    ((window.SS && SS.topicDefs) || []).forEach(function (d) {
      var kws = (d.match || []).map(norm), nm = words(d.name).map(stem);
      var hit = stoks.some(function (t) { return t.length >= 4 && (nm.indexOf(t) >= 0 || kws.some(function (k) { return k === t || stem(k) === t; })); });
      if (hit) kws.forEach(function (k) { if (!direct[k] && !(k in related)) related[k] = 0; });
    });
    var rk = Object.keys(related).filter(function (k) { return !direct[k]; }), relW = {}; rk.forEach(function (k) { relW[k] = related[k]; });
    return { direct: Object.keys(direct), related: rk, relW: relW };
  }
  var threadsRef = function () { return (window.SS && SS.threadList && SS.threadList()) || []; };

  var vocabN = -1, vocab = [];
  function buildVocab(videos) {
    if (vocabN === videos.length) return; vocabN = videos.length; var seen = {};
    videos.forEach(function (v) { words(v.title).forEach(function (w) { if (w.length >= 4) seen[w] = 1; }); });
    concepts.forEach(function (g) { (g.terms || []).concat(g.related || []).forEach(function (t) { words(t).forEach(function (w) { if (w.length >= 4) seen[w] = 1; }); }); });
    vocab = Object.keys(seen);
  }
  function fixTypo(t) {
    if (t.length < 5) return t; var st = stem(t), i, best = null, bd = 9, max = t.length >= 6 ? 2 : 1;
    for (i = 0; i < vocab.length; i++) { var w = vocab[i], sw = stem(w); if (sw === st || sw.indexOf(st) === 0 || st.indexOf(sw) === 0) return t; }
    for (i = 0; i < vocab.length; i++) { var d = lev(vocab[i], t, max); if (d < bd) { bd = d; best = vocab[i]; } }
    return bd <= max ? best : t;
  }
  // every place a search word is actually said: a short phrase around it, the words to highlight, and the second it is said (estimated inside the chunk)
  function wst(x) { return stem(String(x).toLowerCase().replace(/[\u2019']/g, "'").replace(/[^a-z0-9']/g, '')); }
  function momentsFor(chunks, toks, ex) {
    var qs = toks.map(wst).filter(Boolean), xs = ex.direct.filter(function (t) { return t.length > 3 && t.indexOf(' ') < 0; }).map(wst), found = [];
    if (!qs.length) return [];
    function is(w, list) { for (var k = 0; k < list.length; k++) { var a = list[k]; if (w === a || (a.length >= 5 && w.indexOf(a) === 0) || (a.length >= 6 && w.length >= 6 && (a.indexOf(w) === 0 || w.indexOf(a.slice(0, a.length - 2)) === 0))) return k; } return -1; }
    chunks.forEach(function (c, ci) {
      var re = /[A-Za-z0-9][A-Za-z0-9'\u2019-]*/g, m, ws = [], hit = {}, n = 0, first = -1;
      while ((m = re.exec(c[1] || ''))) {
        var st = wst(m[0]), q = st ? is(st, qs) : -1, hl = q >= 0 || (st && is(st, xs) >= 0);
        ws.push({ s: m.index, e: m.index + m[0].length, hl: hl });
        if (q >= 0 && !hit[q]) { hit[q] = 1; n++; }
        if (hl && first < 0) first = ws.length - 1;
      }
      if (first < 0 || n < Math.max(1, qs.length * 0.6)) return;
      if (qs.length > 1 && dfMap) { var rare = 0, ri = 0; qs.forEach(function (t, k) { var w = wOf(t); if (w > rare) { rare = w; ri = k; } }); if (!hit[ri]) return; }
      var lo = Math.max(0, first - 8), hi = Math.min(ws.length - 1, first + 11), a = ws[lo].s, b = ws[hi].e, hits = [];
      for (var i = lo; i <= hi; i++) if (ws[i].hl) hits.push([ws[i].s - a, ws[i].e - a]);
      var next = chunks[ci + 1] ? chunks[ci + 1][0] : c[0] + 45, dur = Math.max(10, Math.min(90, next - c[0]));
      found.push({ n: n, ci: ci, at: Math.max(0, Math.floor(c[0] + (first / ws.length) * dur - 2)), text: c[1].slice(a, b), pre: lo > 0, post: hi < ws.length - 1, hits: hits });
    });
    found.sort(function (x, y) { return y.n - x.n || x.ci - y.ci; });
    var out = [];
    found.forEach(function (f) { if (out.length < 3 && out.every(function (o) { return Math.abs(o.at - f.at) > 20; })) out.push(f); });
    return out.sort(function (x, y) { return x.at - y.at; });
  }
  /* how rare each word is across everything said in the videos: a rare word (jury) must be present, a common one (agree) alone proves little */
  var dfMap = null, dfN = 0, dfFor = null;
  function buildDF() {
    if (dfMap || !transcripts) return; dfMap = {}; dfN = 0;
    Object.keys(transcripts).forEach(function (id) { transcripts[id].forEach(function (c) { dfN++; var seen = {}; (norm(c[1]).split(' ')).forEach(function (w) { if (w.length < 3) return; var k = stem(w); if (!seen[k]) { seen[k] = 1; dfMap[k] = (dfMap[k] || 0) + 1; } }); }); });
  }
  function wOf(t) { if (!dfMap) return 1; var d = dfMap[stem(t)] || 0; return Math.max(0.15, Math.log((dfN + 1) / (d + 1))); }
  /* smart(q, videos) -> [{ v, s, why, at, snip, kind }] best first. kind: 'match' | 'related' */
  function smart(q, videos) {
    var toks = words(q).filter(function (w) { return !STOP.test(w); });
    if (!toks.length) toks = words(q);
    if (!toks.length) return [];
    askTranscripts(); buildVocab(videos); buildDF();
    var fixed = toks.map(fixTypo), changed = fixed.join(' ') !== toks.join(' ');
    toks = fixed; if (changed) q = toks.join(' ');
    var ex = expand(q, toks), res = [], byId = {};
    videos.forEach(function (v) {
      var text = norm(v.title), tw = words(v.title).map(stem), s = 0, why = [], hits = 0;
      toks.forEach(function (t) {
        if (hasTerm(text, tw, t, false)) { s += 10; hits++; }
        else if (hasTerm(text, tw, t, true)) { s += 6; hits++; why.push('close to "' + t + '"'); }
      });
      if (toks.length > 1) {
        if (hits === toks.length) s += 8; else if (hits) s = s * 0.45;     // one word of several is only a weak match
        if (text.indexOf(toks.join(' ')) >= 0) s += 10;
      }
      if (hits === 0) {
        var best = 0, bw = '';
        ex.direct.forEach(function (t) { if (best < 6.5 && hasTerm(text, tw, t, false)) { best = 6.5; bw = t; } });
        Object.keys(ex.relW).forEach(function (t) { var wv = 3.5 + ex.relW[t]; if (best < wv && best < 6.5 && hasTerm(text, tw, t, false)) { best = wv; bw = t; } });
        if (best) { s += best; why.push((best >= 6.5 ? 'means the same as "' : 'related: "') + bw + '"'); }
      } else {
        var bonus = 0; ex.direct.concat(ex.related).forEach(function (t) { if (bonus < 2 && hasTerm(text, tw, t, false)) bonus += 1; }); s += bonus;
      }
      var at = 0, snip = '', moments = [];
      if (transcripts && transcripts[v.id]) {
        var bestC = 0, topW = 0; toks.forEach(function (t) { topW = Math.max(topW, wOf(t)); });
        transcripts[v.id].forEach(function (c) {
          var tx = norm(c[1]), n = 0, bg = c[2] ? ' ' + c[2] + ' ' : '', wsum = 0, wgot = 0, topHit = true;
          toks.forEach(function (t) { var st = stem(t), rt = st.length >= 7 ? st.slice(0, -2) : st, w = wOf(t), got = tx.indexOf(rt) >= 0 || (bg && bg.indexOf(' ' + hash32(st) + ' ') >= 0); wsum += w; if (got) { n++; wgot += w; } else if (w === topW) topHit = false; });
          if (toks.length > 1 && dfMap && (!topHit || wgot < wsum * 0.6)) n = 0;
          ex.direct.forEach(function (t) { if (t.length > 3 && tx.indexOf(t) >= 0) n += 0.5; });
          if (n > bestC) { bestC = n; at = c[0]; snip = c[1]; }
        });
        if (bestC >= Math.max(1, toks.length * 0.6)) { s += Math.min(14, 4 + bestC * 3); why.push('said in the video'); moments = momentsFor(transcripts[v.id], toks, ex); if (moments.length) { var m0 = moments.slice().sort(function (x, y) { return y.n - x.n; })[0]; at = m0.at; snip = m0.text; } } else { at = 0; snip = ''; }
      }
      if (s > 0) { var r = { v: v, s: s, why: why, at: at, snip: snip, moments: moments, kind: s >= 6 ? 'match' : 'related' }; res.push(r); byId[v.id] = r; }
    });
    // storylines: every video in a storyline that already has a strong match comes along
    var strong = res.filter(function (r) { return r.s >= 10; });
    if (strong.length) {
      threadsRef().forEach(function (t) {
        var n = strong.filter(function (r) { return t.videos.indexOf(r.v.id) >= 0; }).length;
        if (!n) return;
        t.videos.forEach(function (id) {
          var r = byId[id];
          if (r) { if (r.s < 10) { r.s = Math.min(9.5, r.s + 1.5 + 2 * Math.min(n, 3)); r.why.push('same storyline: ' + t.name); } return; }
          var v = null; for (var i = 0; i < videos.length; i++) if (videos[i].id === id) { v = videos[i]; break; }
          if (!v) return;
          r = { v: v, s: 2 + Math.min(n, 3) * 0.5, why: ['same storyline: ' + t.name], at: 0, snip: '', kind: 'related' };
          res.push(r); byId[id] = r;
        });
      });
    }
    res.forEach(function (r) { r.kind = r.s >= 6.5 ? 'match' : 'related'; });
    res.sort(function (a, b) { return b.s - a.s || (b.v.published || '').localeCompare(a.v.published || ''); });
    return res;
  }
  SS.smart = smart; SS.smartFixed = function (q) { var t = words(q).filter(function (w) { return !STOP.test(w); }); return t.map(fixTypo).join(' '); }; SS.smartExpand = function (q) { var t = words(q).filter(function (w) { return !STOP.test(w); }); return expand(q, t); };
  SS.transcript = function (id) { return transcripts && transcripts[id]; }; SS.loadTranscripts = askTranscripts;
  SS.hasTranscripts = function () { return !!transcripts; };
})();
