/* Pop-out player for the Kraving Killer games: tap a game and it fills the screen with its controls built in.
   Etch A Sketch and the wagon use this file; Disc-ipline has its own full-screen mode and is only given the same "tap to play" cover. */
(function () {
  'use strict';
  var html = document.documentElement, open = null, hint = null;
  var small = window.matchMedia ? window.matchMedia('(pointer: coarse) and (max-width: 1100px)') : { matches: false };
  var land = window.matchMedia ? window.matchMedia('(orientation: landscape) and (max-height: 560px) and (pointer: coarse)') : { matches: false };

  var close = document.createElement('button');
  close.type = 'button'; close.className = 'po-x'; close.setAttribute('aria-label', 'Close the pop-out player'); close.innerHTML = '&times;'; close.hidden = true;
  document.body.appendChild(close);

  function nativeFs(el, on) {
    try {
      if (on) { var p = el.requestFullscreen ? el.requestFullscreen() : (el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null); if (p && p.then) p.then(function () { try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {}); } catch (e) {} }, function () {}); }
      else { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {} }
    } catch (e) {}
  }
  function rotateHint(on) {
    if (hint) { hint.remove(); hint = null; }
    if (!on || !small.matches || window.innerHeight < window.innerWidth) return;
    hint = document.createElement('div'); hint.className = 'po-rotate'; hint.textContent = 'Turn your phone sideways for the full view';
    document.body.appendChild(hint); setTimeout(function () { if (hint) { hint.remove(); hint = null; } }, 3500);
  }
  function popOut(el, on) {
    if (on) { if (open && open !== el) popOut(open, false); open = el; }
    else if (open === el) open = null;
    el.classList.toggle('po', on); html.classList.toggle('po-lock', on); close.hidden = !on;
    if (on) el.appendChild(close); else document.body.appendChild(close);   // inside the element, so it stays visible when the browser's own full screen is on
    var b = el.querySelector('.po-btn'); if (b) { b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'Close' : 'Pop out'; }
    nativeFs(el, on); rotateHint(on); document.dispatchEvent(new CustomEvent('ss:popoutchange', { detail: { el: el, on: on } }));
    window.dispatchEvent(new Event('resize'));
    setTimeout(function () { window.dispatchEvent(new Event('resize')); fitWagon(); }, 120); fitWagon();
  }
  // the wagon fills the whole screen when the phone is sideways: ask the game for a picture with the screen's shape
  function fitWagon() {
    var wg = document.getElementById('wg'); if (!wg) return;
    var on = wg.classList.contains('po'), a = window.innerWidth / Math.max(1, window.innerHeight), fill = on && a >= 1.3;
    wg.classList.toggle('wg-fill', fill);
    document.dispatchEvent(new CustomEvent('ss:wgaspect', { detail: fill ? a : 720 / 420 }));
  }
  window.addEventListener('resize', function () { if (open) fitWagon(); }); window.addEventListener('orientationchange', function () { setTimeout(fitWagon, 200); });
  close.addEventListener('click', function () { if (open) popOut(open, false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) popOut(open, false); });
  document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement && open) popOut(open, false); });
  document.addEventListener('ss:route', function () { if (open) popOut(open, false); });
  document.addEventListener('ss:cvgame', function () { if (open) popOut(open, false); });

  function cover(host, label, fn) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'po-start';
    b.innerHTML = '<span><b>' + label + '</b><small>Opens full screen with all the controls</small></span>';
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); fn(); });
    host.appendChild(b);
  }
  function wire(id, topSel, coverHost, label) {
    var el = document.getElementById(id), top = el && el.querySelector(topSel); if (!el || !top) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'po-btn'; b.textContent = 'Pop out'; b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', function () { popOut(el, !el.classList.contains('po')); });
    top.appendChild(b);
    cover(el.querySelector(coverHost) || el, label, function () { popOut(el, true); });
  }
  wire('es', '.es-top', '.es-screenwrap', 'Tap to play');
  wire('wg', '.wg-top', '.wg-stage', 'Tap to play');
  (function () {   // the web: the Pop out button is already in its control row
    var st = document.getElementById('web-stage'), b = document.getElementById('web-pop'); if (!st || !b) return;
    b.addEventListener('click', function () { popOut(st, !st.classList.contains('po')); });
  })();

  // wagon: a DIVE button next to JUMP in the pop-out, so both thumbs have a job
  (function () {
    var stage = document.querySelector('#wg .wg-stage'), cv = document.getElementById('wg-canvas'); if (!stage || !cv) return;
    var d = document.createElement('button'); d.type = 'button'; d.className = 'wg-dive'; d.textContent = 'DIVE'; d.setAttribute('aria-label', 'Hold to dive');
    function fire(t) { try { cv.dispatchEvent(new PointerEvent(t, { pointerId: 77, bubbles: true, cancelable: true })); } catch (e) {} }
    d.addEventListener('pointerdown', function (e) { e.preventDefault(); try { d.setPointerCapture(e.pointerId); } catch (x) {} fire('pointerdown'); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) { d.addEventListener(t, function () { fire('pointerup'); }); });
    d.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    stage.appendChild(d);
  })();

  // the disc golf game keeps its own full-screen mode; give it the same tap-to-play cover
  (function () {
    var st = document.getElementById('dd-stage'), fs = document.getElementById('dd-fs'); if (!st || !fs) return;
    cover(st, 'Tap to play', function () { fs.click(); });
  })();

  // turning a phone sideways while on a game pops it out
  function onLand() {
    if (!land.matches || open) return;
    var v = document.querySelector('[data-view="craving"]'); if (!v || v.hidden) return;
    var es = document.getElementById('es'), wg = document.getElementById('wg');
    if (es && !es.hidden) popOut(es, true); else if (wg && !wg.hidden) popOut(wg, true);
  }
  // landing on a game with the phone already sideways does the same
  document.addEventListener('ss:cvgame', function () { setTimeout(onLand, 150); });
  document.addEventListener('ss:route', function (e) { if (e.detail && e.detail.name === 'craving') setTimeout(onLand, 400); });
  if (land.addEventListener) land.addEventListener('change', onLand); else if (land.addListener) land.addListener(onLand);
})();
