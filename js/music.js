/* Background music: a slow loop that plays while people browse.
   Drop a file at media/ambient.mp3 and it switches on; with no file, nothing shows.
   It starts after the first tap or click (browsers require that), ducks while the rabbit hole is open,
   and fades out while a video plays. Visitors can switch it off, and the choice is remembered. */
(function () {
  'use strict';
  var SRC = 'media/ambient.mp3', BASE = 0.35;
  var audio = null, btn = null, wanted = true, started = false, ducks = {}, raf = 0, cur = 0;
  try { wanted = localStorage.getItem('ss-music') !== 'off'; } catch (e) {}

  function target() {
    if (!wanted) return 0;
    var m = 1;
    Object.keys(ducks).forEach(function (k) { m = Math.min(m, ducks[k]); });
    return BASE * m;
  }
  function tick() {
    var t = target();
    cur += (t - cur) * 0.06;
    if (Math.abs(t - cur) < 0.004) cur = t;
    audio.volume = Math.max(0, Math.min(1, cur));
    if (cur === 0 && !audio.paused) audio.pause();
    else if (cur > 0 && audio.paused && started) audio.play().catch(function () {});
    raf = cur === t ? 0 : requestAnimationFrame(tick);
  }
  function update() { if (audio && !raf) raf = requestAnimationFrame(tick); }
  function paint() { if (btn) { btn.textContent = wanted ? 'Music on' : 'Music off'; btn.setAttribute('aria-pressed', String(wanted)); } }

  function begin() {
    if (started || !audio) return;
    started = true;
    if (wanted) audio.play().catch(function () { started = false; });
    update();
  }
  function init() {
    audio = new Audio(SRC); audio.loop = true; audio.preload = 'auto'; audio.volume = 0;
    btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'pill music-btn';
    btn.addEventListener('click', function () {
      wanted = !wanted;
      try { localStorage.setItem('ss-music', wanted ? 'on' : 'off'); } catch (e) {}
      if (wanted && !started) { started = true; audio.play().catch(function () {}); }
      paint(); update();
    });
    document.body.appendChild(btn); paint();
    ['pointerdown', 'keydown'].forEach(function (ev) { window.addEventListener(ev, begin, { once: true, passive: true }); });
    document.addEventListener('ss:duck', function (e) {
      var d = e.detail || {};
      if (d.level == null) delete ducks[d.key]; else ducks[d.key] = d.level;
      update();
    });
  }
  // only switch on if the file exists
  fetch(SRC, { method: 'HEAD' }).then(function (r) { if (r.ok) init(); }).catch(function () {});
})();
