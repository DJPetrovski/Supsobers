/* Visitor stats: GoatCounter (no cookies, no personal tracking). Each tab counts as its own page.
   The footer shows a public "people stopped by" number once GoatCounter's public counter is switched on; until then it stays hidden. */
(function () {
  'use strict';
  var CODE = 'supsobers', host = location.hostname;
  var local = /^(localhost|127\.|\[::1\]|.*\.localhost|.*\.test)$/.test(host);
  var paths = { home: '/', videos: '/videos', archives: '/archives', books: '/books', topics: '/topics', members: '/members', merch: '/merch', socials: '/socials', half: '/my-better-half', contact: '/contact', craving: '/kraving-killer', web: '/connected', about: '/about' };
  var queue = [], ready = false, lastPath = '';
  function send(name) {
    var path = paths[name] || '/' + name; if (path === lastPath) return; lastPath = path;
    var t = document.title;
    if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: path, title: t, event: false }); else queue.push({ path: path, title: t });
  }
  if (!local) {
    window.goatcounter = { no_onload: true, endpoint: 'https://' + CODE + '.goatcounter.com/count' };
    var s = document.createElement('script'); s.async = true; s.src = 'https://gc.zgo.at/count.js';
    s.onload = function () { ready = true; var q = queue; queue = []; q.forEach(function (x) { window.goatcounter.count({ path: x.path, title: x.title }); }); };
    document.head.appendChild(s);
    document.addEventListener('ss:route', function (e) { setTimeout(function () { send(e.detail.name); }, 50); });
    send((location.hash || '#home').slice(1));   // the first view was routed before this script ran
  }
  // public counter in the footer (needs "Allow adding visitor counts on your website" in GoatCounter settings)
  var out = document.getElementById('stat-people');
  if (out) fetch('https://' + CODE + '.goatcounter.com/counter/TOTAL.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    var n = d && d.count_unique ? parseInt(String(d.count_unique).replace(/\D/g, ''), 10) : 0;
    if (!n) return;
    out.querySelector('b').textContent = n.toLocaleString();
    out.hidden = false;
  }).catch(function () {});
})();
