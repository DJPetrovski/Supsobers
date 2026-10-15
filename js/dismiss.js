/* A small close (x) in the corner of every little instruction note, so people who know it already can wave it away.
   The choice is remembered on that device; the tunnel's "?" button brings its note back. */
(function () {
  'use strict';
  var SEL = [['.hole-hint ul', '.hole-hint', 'tunnel'], ['.es-help', null, 'help'], ['.rel-hint', null, 'rel'], ['.scd-hint', null, 'scd'], ['#web-hint', null, 'webhint']];
  function get(k) { try { return localStorage.getItem('ss-dx-' + k) === '1'; } catch (e) { return false; } }
  function set(k, v) { try { if (v) localStorage.setItem('ss-dx-' + k, '1'); else localStorage.removeItem('ss-dx-' + k); } catch (e) {} }
  function wire() {
    SEL.forEach(function (d) {
      document.querySelectorAll(d[0]).forEach(function (el, i) {
        if (el.querySelector(':scope > .dx-x')) return;
        var host = d[1] ? el.closest(d[1]) : el, key = d[2] + (i || '');
        var b = document.createElement('button'); b.type = 'button'; b.className = 'dx-x'; b.setAttribute('aria-label', 'Close this note'); b.innerHTML = '&times;';
        b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); host.classList.add('dx-closed'); set(key, true); });
        el.classList.add('dx-has'); el.appendChild(b);
        if (get(key)) host.classList.add('dx-closed');
        host._dxKey = key;
      });
    });
  }
  var help = document.getElementById('hole-help');
  if (help) help.addEventListener('click', function () { var h = document.querySelector('.hole-hint'); if (h) { h.classList.remove('dx-closed'); set('tunnel', false); } }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
