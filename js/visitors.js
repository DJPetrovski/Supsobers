/* Footer visitor line for the sub-pages: counts the visit with GoatCounter (no cookies) and shows "N people have stopped by. You are not alone here." at the bottom. The home page does this in stats.js. */
(function () {
  'use strict';
  var CODE = 'supsobers', host = location.hostname;
  var local = /^(localhost|127\.|\[::1\]|.*\.localhost|.*\.test)$/.test(host);
  if (!local) {
    window.goatcounter = { endpoint: 'https://' + CODE + '.goatcounter.com/count' };
    var s = document.createElement('script'); s.async = true; s.src = 'https://gc.zgo.at/count.js'; document.head.appendChild(s);
  }
  var p = document.createElement('p');
  p.hidden = true;
  p.setAttribute('style', 'text-align:center;margin:28px 16px 24px;font:14px/1.4 system-ui,sans-serif;opacity:.7;letter-spacing:.02em');
  p.innerHTML = '<b style="font-size:16px"></b> people have stopped by. You are not alone here.';
  document.body.appendChild(p);
  fetch('https://' + CODE + '.goatcounter.com/counter/TOTAL.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    var n = d && d.count_unique ? parseInt(String(d.count_unique).replace(/\D/g, ''), 10) : 0;
    if (!n) return;
    p.querySelector('b').textContent = n.toLocaleString();
    p.hidden = false;
  }).catch(function () {});
})();
