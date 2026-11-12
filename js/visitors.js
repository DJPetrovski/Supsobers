/* The "you are not alone" line at the bottom of every page: how many people have stopped by in total, and how many today.
   Numbers come live from GoatCounter (no cookies). Ad blockers often block that address, so if the live numbers do not arrive
   the page falls back on data/visitors.json, a copy saved on this site every couple of hours.
   On the sub-pages this file also counts the visit; on the home page stats.js does that. */
(function () {
  'use strict';
  var CODE = 'supsobers', API = 'https://' + CODE + '.goatcounter.com/counter/TOTAL.json', host = location.hostname;
  var local = /^(localhost|127\.|\[::1\]|.*\.localhost|.*\.test)$/.test(host);
  var p = document.getElementById('stat-people');
  if (!p) {   // a sub-page: add the line and count the visit
    if (!local) { window.goatcounter = { endpoint: 'https://' + CODE + '.goatcounter.com/count' }; var s = document.createElement('script'); s.async = true; s.src = 'https://gc.zgo.at/count.js'; document.head.appendChild(s); }
    p = document.createElement('p'); p.id = 'stat-people'; p.hidden = true;
    p.setAttribute('style', 'text-align:center;margin:28px 16px 24px;font:14px/1.5 system-ui,sans-serif;opacity:.8;letter-spacing:.02em');
    document.body.appendChild(p);
  }
  function denverDay() { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } }
  function num(d) { return d ? parseInt(String(d.count_unique || d.count || '').replace(/\D/g, ''), 10) || 0 : 0; }
  function json(u) { return fetch(u).then(function (r) { return r.ok ? r.json() : null; }); }
  function show(total, today) {
    if (!total) return false;
    var big = 'style="font-size:1.15em"';
    p.innerHTML = '<b ' + big + '>' + total.toLocaleString() + '</b> ' + (total === 1 ? 'person has' : 'people have') + ' stopped by' + (today > 0 ? ', <b ' + big + '>' + today.toLocaleString() + '</b> today' : '') + '. You are not alone here.';
    p.hidden = false; return true;
  }
  var day = denverDay();
  Promise.all([json(API), json(API + '?start=' + day).catch(function () { return null; })]).then(function (r) { if (!show(num(r[0]), num(r[1]))) throw 0; })
    .catch(function () { return json('data/visitors.json?t=' + Math.floor(Date.now() / 6e5)).then(function (d) { if (d) show(d.total | 0, d.day === day ? d.today | 0 : 0); }); })
    .catch(function () {});
})();
