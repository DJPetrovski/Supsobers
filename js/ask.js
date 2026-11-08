/* AI-written answers. The site's own searches (in the visitor's browser, free) find the relevant passages;
   this sends only those few passages plus the question to the "ask" function, which has Claude write a short cited answer.
   Off until data/ask.json says enabled and the function is deployed (supabase/ASK-SETUP.md). */
(function () {
  var cfg = null, sb = null;
  var ready = Promise.all([
    fetch('data/ask.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).catch(function () { return {}; }),
    fetch('data/topics-config.json').then(function (r) { return r.json(); }).catch(function () { return null; })
  ]).then(function (r) { cfg = r[0] || {}; sb = r[1]; });
  function enabled() { return ready.then(function () { return !!(cfg.enabled && sb && sb.supabaseUrl && sb.anonKey); }); }
  /* ask(question, [{l: label, x: text}], 'site' | 'clancy') -> Promise of answer text, rejects if unavailable */
  function ask(q, passages, scope) {
    return enabled().then(function (on) {
      if (!on) throw new Error('off');
      return fetch(sb.supabaseUrl + '/functions/v1/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: sb.anonKey, Authorization: 'Bearer ' + sb.anonKey }, body: JSON.stringify({ question: q, passages: passages, scope: scope || 'site' }) });
    }).then(function (r) { return r.json(); }).then(function (j) { if (!j.ok) throw new Error('fail'); return j.answer; });
  }
  /* renders answer text safely, turning [n] into links by calling mk(n) which returns an element or null */
  function render(box, text, link) {
    box.textContent = '';
    String(text).split(/\n+/).forEach(function (para, pi) {
      var p = document.createElement('p'); p.style.margin = pi ? '8px 0 0' : '0';
      para.split(/(\[\d+\])/).forEach(function (part) {
        var m = /^\[(\d+)\]$/.exec(part);
        if (m && link) { var a = link(+m[1]); if (a) { p.appendChild(a); return; } }
        p.appendChild(document.createTextNode(part));
      });
      box.appendChild(p);
    });
  }
  window.AskAI = { enabled: enabled, ask: ask, render: render };
})();
