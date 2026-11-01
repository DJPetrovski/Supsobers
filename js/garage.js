/* Wagon garage for Don't Fall Off the Wagon: pick a wagon, unlock the supporter wagons with a tip.
   A tip goes through a Stripe Payment Link; Stripe sends the player back here with the payment id, a Supabase Edge Function
   (wagon-unlock) confirms it really was paid, and the game remembers it on this device. A restore code unlocks other devices. */
(function () {
  var btn = document.getElementById('wg-garage'), ov = document.getElementById('wg-garage-ov'); if (!btn || !ov) return;
  var CFG = null, SB = null, imgs = {}, SEL = 'red', CODE = '';
  try { SEL = localStorage.getItem('ss-wagon-sel') || 'red'; CODE = localStorage.getItem('ss-wagon-code') || ''; } catch (e) {}
  function unlocked() { return !!CODE; }
  function def(id) { for (var i = 0; i < CFG.wagons.length; i++) if (CFG.wagons[i].id === id) return CFG.wagons[i]; return CFG.wagons[0]; }
  function usable(w) { return w.free || unlocked(); }
  window.SSWagon = {
    cur: function () { if (!CFG) return null; var w = def(SEL); if (!usable(w)) w = CFG.wagons[0]; return w.sprite && imgs[w.id] && imgs[w.id].complete && imgs[w.id].naturalWidth ? { w: w, img: imgs[w.id] } : null; },
    unlocked: unlocked
  };
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fn(body) {
    if (!SB || !SB.supabaseUrl) return Promise.resolve({ ok: false, error: 'Unlocking is not switched on yet.' });
    return fetch(SB.supabaseUrl + '/functions/v1/wagon-unlock', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB.anonKey, Authorization: 'Bearer ' + SB.anonKey }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Something went wrong.' }; }); }).catch(function () { return { ok: false, error: 'Could not reach the unlock service. Try again in a minute.' }; });
  }
  function save(code) { CODE = code; try { localStorage.setItem('ss-wagon-code', code); } catch (e) {} }
  function msg(t, bad) { var m = ov.querySelector('.wgg-msg'); if (m) { m.textContent = t || ''; m.className = 'wgg-msg' + (bad ? ' bad' : ''); } }
  function thumb(w) { return w.sprite ? '<img src="' + esc(w.sprite) + '" alt="" loading="lazy">' : '<span class="wgg-red" aria-hidden="true"></span>'; }
  function render() {
    var U = CFG.unlock || {}, h = '<div class="wgg"><div class="wgg-head"><h3>Garage</h3><button type="button" class="wgg-x" aria-label="Close garage">&times;</button></div><div class="wgg-grid">';
    CFG.wagons.forEach(function (w) {
      var ok = usable(w), on = SEL === w.id && ok;
      h += '<button type="button" class="wgg-card' + (on ? ' on' : '') + (ok ? '' : ' wlocked') + '" data-id="' + w.id + '"><span class="wgg-pic">' + thumb(w) + '</span><b>' + esc(w.name) + '</b><small>' + esc(w.blurb || '') + '</small><em>' + (on ? 'Riding this one' : ok ? 'Pick it' : 'Supporter wagon') + '</em></button>';
    });
    h += '</div>';
    if (!unlocked()) {
      h += '<div class="wgg-unlock"><b>' + esc(U.title || 'Unlock every wagon') + '</b><p>' + esc(U.pitch || '') + '</p>' +
        (U.link ? '<a class="btn btn-primary" id="wgg-pay" href="' + esc(U.link) + '" target="_blank" rel="noopener">Tip any amount to unlock</a>' : '<span class="wgg-soon">Supporter wagons open soon.</span>') +
        '<div class="wgg-restore"><label for="wgg-code">Already tipped? Enter your restore code</label><span><input id="wgg-code" type="text" placeholder="WAGON-XXXX-XXXX" maxlength="14" autocomplete="off" autocapitalize="characters"><button type="button" class="btn" id="wgg-go">Restore</button></span></div></div>';
    } else {
      h += '<div class="wgg-unlock ok"><b>All wagons unlocked. Thank you for the tip!</b><p>Your restore code for other devices: <code id="wgg-mycode">' + esc(CODE) + '</code> <button type="button" class="btn" id="wgg-copy">Copy</button></p></div>';
    }
    h += '<p class="wgg-msg" role="status"></p><p class="wgg-cred">Wagon models are CC BY 4.0: ' + esc(CFG.wagons.filter(function (w) { return w.credit; }).map(function (w) { return w.credit; }).join(', ')) + ', from Sketchfab.</p></div>';
    ov.innerHTML = h;
  }
  function open() { if (!CFG) return; render(); ov.hidden = false; }
  function close() { ov.hidden = true; }
  btn.addEventListener('click', open);
  ov.addEventListener('click', function (e) {
    var t = e.target;
    if (t === ov || t.closest('.wgg-x')) { close(); return; }
    var card = t.closest('.wgg-card');
    if (card) { var w = def(card.getAttribute('data-id')); if (!usable(w)) { msg('That one is a supporter wagon. Tip any amount below to unlock them all.', true); return; } SEL = w.id; try { localStorage.setItem('ss-wagon-sel', SEL); } catch (e2) {} render(); msg('Picked the ' + w.name + '. Hit Start rolling.'); return; }
    if (t.closest('#wgg-go')) {
      var v = (document.getElementById('wgg-code').value || '').trim(); if (!v) { msg('Type your restore code first.', true); return; }
      msg('Checking…'); fn({ action: 'restore', code: v }).then(function (r) { if (r.ok) { save(r.code); render(); msg('Welcome back. Every wagon is unlocked on this device.'); } else msg(r.error || 'That did not work.', true); });
    }
    if (t.closest('#wgg-copy')) { var c = document.getElementById('wgg-mycode'); try { navigator.clipboard.writeText(c.textContent).then(function () { msg('Copied. Keep it somewhere safe.'); }, function () { msg('Select the code and copy it.'); }); } catch (e3) { msg('Select the code and copy it.'); } }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !ov.hidden) close(); });
  Promise.all([fetch('data/wagons.json?v=1').then(function (r) { return r.json(); }), fetch('data/topics-config.json').then(function (r) { return r.json(); }).catch(function () { return null; })]).then(function (a) {
    CFG = a[0]; SB = a[1]; CFG.wagons.forEach(function (w) { if (w.sprite) { var im = new Image(); im.src = w.sprite; imgs[w.id] = im; } });
    // back from Stripe: ?wagon_session=cs_... means a payment just finished
    var m = /[?&]wagon_session=([A-Za-z0-9_]+)/.exec(location.search);
    if (m) {
      try { history.replaceState(null, '', location.pathname + (location.hash || '')); } catch (e) {}
      if (!location.hash || location.hash.indexOf('craving') < 0) location.hash = '#craving';
      setTimeout(function () { var t = document.getElementById('cvt-wg'); if (t) t.click(); }, 400);
      render(); ov.hidden = false; msg('Confirming your tip…');
      fn({ action: 'claim', session_id: m[1] }).then(function (r) { if (r.ok) { save(r.code); SEL = SEL; render(); msg('Tip confirmed. Every wagon is unlocked. Thank you!'); } else msg(r.error || 'We could not confirm that payment.', true); });
    }
  }).catch(function () { btn.hidden = true; });
})();
