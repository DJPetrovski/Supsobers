/* Home: a slow rabbit hole behind the title.
   Videos tab: a TV tunes through static, then zooms in and drops into the hole. */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var tv = $('#tv');
  if (!tv) return;

  var SS = window.SS || { videos: [], openPlayer: function () {}, ready: true };
  var ID_RE = /^[\w-]{11}$/;
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var html = document.documentElement;

  var screenEl = $('#tv-screen');
  var diveBtn = $('#dive');
  var skipBtn = $('#tv-skip');
  var hole = $('#hole');
  var scene = $('.hole-scene', hole);
  var world = $('.hole-world', hole);
  var titleEl = $('#hole-title');
  var exitBtn = $('#hole-exit');
  var pauseBtn = $('#hole-pause');
  var listBtn = $('#hole-list');
  var hint = $('#hole-hint');

  var AUTO_DIVE_MS = 1500;   // how long the TV shows static before it drops you in
  var holeApi = null, ambientApi = null, anim = null, spacer = null;
  var diving = false, isOpen = false, current = '', timers = [], autoTimer = 0;

  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  /* ---------- static texture (screen and cabinet grain) ---------- */
  try {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var cx = c.getContext('2d');
    var img = cx.createImageData(128, 128);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = (Math.random() * 255) | 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    document.documentElement.style.setProperty('--noise', 'url(' + c.toDataURL('image/png') + ')');
  } catch (e) { /* no grain, everything else still works */ }

  /* ---------- home: ambient hole ---------- */
  function startAmbient() {
    if (!SS.ready) return;   // wait for the video list; 'ss:videos' calls this again
    if (!ambientApi) {
      ambientApi = HoleTunnel.create({
        scene: $('#ambient-scene'), world: $('#ambient-world'), videos: SS.videos, ambient: true
      });
    }
    ambientApi.start({ boost: 0 });
  }
  function stopAmbient() { if (ambientApi) ambientApi.stop(); }

  /* ---------- picking a video inside the hole ---------- */
  function pick(v) {
    if (v && ID_RE.test(v.id || '')) {
      if (holeApi) holeApi.hold(true);
      SS.openPlayer(v);
    } else {
      window.open('https://www.youtube.com/@Sobersector', '_blank', 'noopener');
    }
  }
  document.addEventListener('ss:playerclosed', function () { if (holeApi) holeApi.hold(false); });

  /* ---------- the dive ---------- */
  function dive() {
    if (diving) return;
    clearTimeout(autoTimer);
    if (reduce || !tv.animate) { scrollToList(); return; }
    diving = true;
    clearTimers();
    html.classList.add('is-diving');

    var vw = window.innerWidth, vh = window.innerHeight;
    var r = tv.getBoundingClientRect();
    var s = screenEl.getBoundingClientRect();

    // Pin the TV to the viewport so zooming it never stretches the page itself.
    spacer = document.createElement('div');
    spacer.setAttribute('aria-hidden', 'true');
    spacer.style.height = r.height + 'px';
    tv.parentNode.insertBefore(spacer, tv);
    tv.style.position = 'fixed';
    tv.style.left = r.left + 'px';
    tv.style.top = r.top + 'px';
    tv.style.width = r.width + 'px';
    tv.style.margin = '0';

    var k = Math.max(vw / s.width, vh / s.height) * 1.08;
    var px = s.left + s.width / 2 - r.left;
    var py = s.top + s.height / 2 - r.top;
    var tx = vw / 2 - r.left - k * px;
    var ty = vh / 2 - r.top - k * py;

    screenEl.classList.add('zooming');
    anim = tv.animate(
      [{ transform: 'translate(0px,0px) scale(1)' },
       { transform: 'translate(' + tx + 'px,' + ty + 'px) scale(' + k + ')' }],
      { duration: 1600, easing: 'cubic-bezier(.6,.02,.9,.4)', fill: 'forwards' }
    );
    later(function () { screenEl.classList.add('glitch'); }, 900);
    later(openHole, 1050);
  }

  function openHole() {
    isOpen = true;
    hole.hidden = false;
    if (!holeApi) {
      holeApi = HoleTunnel.create({ scene: scene, world: world, videos: SS.videos, onPick: pick, titleEl: titleEl });
    }
    holeApi.start({ boost: 1300 });
    pauseBtn.textContent = 'Pause';
    pauseBtn.setAttribute('aria-pressed', 'false');
    void hole.offsetWidth;
    hole.classList.add('on');
    hint.classList.remove('gone');
    later(function () { hint.classList.add('gone'); }, 8000);
    later(function () {
      tv.style.visibility = 'hidden';
      screenEl.classList.remove('glitch');
    }, 900);
    try { exitBtn.focus({ preventScroll: true }); } catch (e) { exitBtn.focus(); }
  }

  function cleanup() {
    html.classList.remove('is-diving');
    screenEl.classList.remove('zooming', 'glitch');
    tv.style.visibility = '';
    tv.style.position = tv.style.left = tv.style.top = tv.style.width = tv.style.margin = '';
    if (spacer && spacer.parentNode) spacer.parentNode.removeChild(spacer);
    spacer = null;
    diving = false;
    isOpen = false;
  }

  function climb(afterFn) {
    if (!isOpen) return;
    isOpen = false;
    clearTimers();
    hole.classList.remove('on');
    tv.style.visibility = 'visible';
    if (anim) {
      var a = anim;
      a.onfinish = function () { a.cancel(); anim = null; cleanup(); if (afterFn) afterFn(); };
      a.reverse();
    } else {
      cleanup();
      if (afterFn) afterFn();
    }
    later(function () { hole.hidden = true; if (holeApi) holeApi.stop(); }, 750);
    if (!afterFn) { try { diveBtn.focus({ preventScroll: true }); } catch (e) { diveBtn.focus(); } }
  }

  // Leaving the Videos tab (nav click, browser back) resets everything at once.
  function resetNow() {
    clearTimeout(autoTimer);
    if (!diving && !isOpen) return;
    clearTimers();
    if (anim) { anim.cancel(); anim = null; }
    hole.classList.remove('on');
    hole.hidden = true;
    if (holeApi) holeApi.stop();
    cleanup();
  }

  function scrollToList() {
    var list = $('#video-list');
    if (list && list.scrollIntoView) list.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  /* ---------- routing: what each tab does ---------- */
  var first = true;
  function onRoute(name) {
    current = name;
    if (name !== 'about') { var av = document.getElementById('about-video'); if (av && !av.paused) av.pause(); }
    if (name === 'home') startAmbient(); else stopAmbient();
    if (name !== 'videos') resetNow();
    clearTimeout(autoTimer);
    // Arriving at Videos from inside the site: the TV tunes in, then drops you into the hole.
    // A shared link straight to #videos just shows the TV and the list.
    if (name === 'videos' && !first && !reduce) autoTimer = setTimeout(dive, AUTO_DIVE_MS);
    first = false;
  }

  document.addEventListener('ss:route', function (e) { onRoute(e.detail.name); });
  document.addEventListener('ss:videos', function () { if (current === 'home') startAmbient(); });
  var startTab = (location.hash || '#home').slice(1);
  onRoute(['home', 'videos', 'members', 'web', 'archives', 'books', 'about'].indexOf(startTab) >= 0 ? startTab : 'home');

  diveBtn.addEventListener('click', dive);
  screenEl.addEventListener('click', dive);
  skipBtn.addEventListener('click', function () { clearTimeout(autoTimer); scrollToList(); });
  exitBtn.addEventListener('click', function () { climb(); });
  listBtn.addEventListener('click', function () { climb(scrollToList); });
  pauseBtn.addEventListener('click', function () {
    if (!holeApi) return;
    var now = !holeApi.isPaused();
    holeApi.setPaused(now);
    pauseBtn.textContent = now ? 'Resume' : 'Pause';
    pauseBtn.setAttribute('aria-pressed', String(now));
  });

  document.addEventListener('keydown', function (e) {
    if (!isOpen || document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') { climb(); }
    else if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); holeApi.nudge(250); }
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); holeApi.nudge(-250); }
  });
})();
