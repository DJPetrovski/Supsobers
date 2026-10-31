/* Footer "support me" buttons (Venmo, PayPal, Cash App). The links live in data/support.json; a button with no link stays hidden. */
(function () {
  'use strict';
  var box = document.getElementById('support'); if (!box) return;
  fetch('data/support.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (d) {
    if (!d || !d.options) return;
    var row = box.querySelector('.support-row'), n = 0;
    d.options.forEach(function (o) {
      if (!o || !/^https:\/\//i.test(o.url || '')) return;
      var a = document.createElement('a'); a.className = 'pill support-btn support-' + o.name.toLowerCase().replace(/[^a-z]/g, ''); a.href = o.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = o.name; row.appendChild(a); n++;
    });
    if (n) { var m = box.querySelector('.support-msg'); if (d.message) m.textContent = d.message; box.hidden = false; }
  });
})();
