/* Footer support block: a button that opens the Venmo / PayPal / Cash App links. Everything comes from data/support.json; a button with no link stays hidden. */
(function () {
  'use strict';
  var box = document.getElementById('support'); if (!box) return;
  fetch('data/support.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (d) {
    if (!d || !d.options) return;
    var opts = d.options.filter(function (o) { return o && /^https:\/\//i.test(o.url || ''); }); if (!opts.length) return;
    var open = box.querySelector('.support-open'), panel = box.querySelector('.support-panel'), row = box.querySelector('.support-row');
    box.querySelector('.support-fund').textContent = d.fund || 'Support the channel'; box.querySelector('.support-msg').textContent = d.pitch || '';
    opts.forEach(function (o) {
      var a = document.createElement('a'); a.className = 'pill support-btn support-' + o.name.toLowerCase().replace(/[^a-z]/g, ''); a.href = o.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = o.name;
      a.addEventListener('click', function () { var t = box.querySelector('.support-thanks'); t.textContent = d.thanks || 'Thank you!'; t.hidden = false; });
      row.appendChild(a);
    });
    open.addEventListener('click', function () { var on = panel.hidden; panel.hidden = !on; open.setAttribute('aria-expanded', String(on)); });
    box.hidden = false;
  });
})();
