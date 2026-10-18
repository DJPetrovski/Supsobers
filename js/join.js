/* Weekly email signup. Never a pop-up over the page: after a minute of watching the home TV, the TV itself asks,
   like "Are you still watching?". Answer No and it stays quiet for 30 days. Also a plain form in the footer. */
(function () {
  'use strict';
  var KEY = 'ss-join', WAIT_MS = 60000, SNOOZE_MS = 30 * 864e5, W3F = '6509a0cb-4051-4651-96eb-2f21a62cd916';
  var cfg = { endpoint: '', emailField: 'email', notify: true };
  fetch('data/newsletter.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).then(function (d) { for (var k in d) if (k.charAt(0) !== '_') cfg[k] = d[k]; }).catch(function () {});

  function store(v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(KEY) || 'null'); localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { return null; } }
  function validEmail(s) { return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(s) && s.length < 120; }
  function subscribe(email) {
    var jobs = [];
    if (cfg.endpoint) { var b = new URLSearchParams(); b.set(cfg.emailField || 'email', email); jobs.push(fetch(cfg.endpoint, { method: 'POST', mode: 'no-cors', body: b })); }
    if (cfg.notify || !cfg.endpoint) jobs.push(fetch('https://api.web3forms.com/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ access_key: W3F, subject: 'New weekly-email signup', from_name: 'supsobers.com list', email: email, replyto: email, message: 'Please add to the weekly email list: ' + email }) }));
    return Promise.all(jobs).then(function () { store({ state: 'joined', t: Date.now() }); return true; });
  }
  window.SS = window.SS || {}; SS.subscribe = subscribe;

  /* ---------- the footer form ---------- */
  var foot = document.getElementById('join-form');
  if (foot) foot.addEventListener('submit', function (e) {
    e.preventDefault(); var inp = foot.elements.email, st = document.getElementById('join-status'), em = inp.value.trim();
    if (!validEmail(em)) { st.textContent = 'That email does not look right.'; return; }
    st.textContent = 'Signing you up…'; foot.querySelector('button').disabled = true;
    subscribe(em).then(function () { st.textContent = 'You’re on the list. One email a week, never more.'; inp.value = ''; }).catch(function () { st.textContent = 'Something went wrong. Try again in a moment.'; foot.querySelector('button').disabled = false; });
  });

  /* ---------- the TV asks ---------- */
  var screen = document.getElementById('htv-screen'); if (!screen) return;
  var root = document.documentElement, onHome = false, watched = 0, shown = false, box = null, last = Date.now();
  var s0 = store(); if (s0 && (s0.state === 'joined' || (s0.state === 'no' && Date.now() - s0.t < SNOOZE_MS))) return;

  var homeView = document.querySelector('[data-view="home"]');
  function seen() { var r = screen.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; }
  function watching() { onHome = !!homeView && !homeView.hidden; return onHome && seen() && !shown && !document.hidden && !root.classList.contains('tv-off') && !screen.classList.contains('standby') && screen.classList.contains('has-ch') && !document.documentElement.classList.contains('gs-open'); }
  var tick = setInterval(function () {
    var now = Date.now(), dt = now - last; last = now;
    if (dt > 5000) dt = 1000;   // a sleeping tab does not count
    if (watching()) watched += dt;
    if (watched >= WAIT_MS) { clearInterval(tick); ask(); }
  }, 1000);

  function el(t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x) n.textContent = x; return n; }
  function close(state) {
    if (!box) return; if (state) store({ state: state, t: Date.now() });
    box.classList.remove('on'); var b = box; box = null; setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 400);
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close('no'); } }
  function ask() {
    shown = true; box = el('div', 'htv-join'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Weekly email signup');
    var inner = el('div', 'hj-in');
    inner.appendChild(el('small', 'hj-k', 'SOBERVISION'));
    inner.appendChild(el('b', 'hj-h', 'Still watching?'));
    inner.appendChild(el('p', 'hj-p', 'Want one email a week with everything I posted? No more than once a week, ever.'));
    var row = el('div', 'hj-row'), yes = el('button', 'hj-btn hj-yes', 'Yes, send it'), no = el('button', 'hj-btn', 'No thanks');
    yes.type = no.type = 'button'; row.appendChild(yes); row.appendChild(no); inner.appendChild(row); box.appendChild(inner); screen.appendChild(box);
    requestAnimationFrame(function () { box.classList.add('on'); yes.focus({ preventScroll: true }); });
    document.addEventListener('keydown', onKey);
    no.addEventListener('click', function () { close('no'); });
    yes.addEventListener('click', function () {
      inner.textContent = '';
      inner.appendChild(el('b', 'hj-h', 'Where should I send it?'));
      var f = el('form', 'hj-form'), inp = el('input', 'hj-in-email'); inp.type = 'email'; inp.placeholder = 'you@email.com'; inp.autocomplete = 'email'; inp.required = true; inp.maxLength = 120; inp.setAttribute('aria-label', 'Your email');
      var go = el('button', 'hj-btn hj-yes', 'Sign me up'); go.type = 'submit'; var nv = el('button', 'hj-btn', 'Never mind'); nv.type = 'button';
      var st = el('p', 'hj-st'); f.appendChild(inp); f.appendChild(go); f.appendChild(nv); inner.appendChild(f); inner.appendChild(st); inp.focus({ preventScroll: true });
      nv.addEventListener('click', function () { close('no'); });
      f.addEventListener('submit', function (e) {
        e.preventDefault(); var em = inp.value.trim(); if (!validEmail(em)) { st.textContent = 'That email does not look right.'; return; }
        go.disabled = true; st.textContent = 'Tuning in…';
        subscribe(em).then(function () { inner.textContent = ''; inner.appendChild(el('b', 'hj-h', 'You’re in.')); inner.appendChild(el('p', 'hj-p', 'One email a week, with everything new. Unsubscribe any time.')); setTimeout(function () { close(); }, 3200); })
          .catch(function () { st.textContent = 'Signal lost. Try again.'; go.disabled = false; });
      });
    });
  }
})();
