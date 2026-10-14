/* Music: DJ's SoundCloud plays INSIDE the home TV. Leave the home page and the same player (never reloaded, so the music keeps going)
   slides out into a little dock in the corner. Transport buttons + the home remote drive it. */
(function () {
  var dock = document.getElementById('scd'); if (!dock) return;
  var frame = document.getElementById('scd-frame'), playBtn = dock.querySelector('[data-sc=play]'), fw = dock.querySelector('.scd-fw');
  var URL_ = 'https://soundcloud.com/djpetrovski', w = null, loading = false, ready = false, playing = false, queue = [], root = document.documentElement;
  var route = (location.hash || '#home').slice(1) || 'home', mode = '', trackT = 0, minimized = false;
  function duck(l) { document.dispatchEvent(new CustomEvent('ss:duck', { detail: { key: 'sc', level: l } })); }
  function run(fn) { if (ready && w) fn(); else queue.push(fn); }
  function boot() {
    if (w || loading) return; loading = true;
    frame.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(URL_) + '&color=%23ff5500&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=false';
    var go = function () {
      w = SC.Widget(frame);
      w.bind(SC.Widget.Events.READY, function () { ready = true; queue.splice(0).forEach(function (f) { f(); }); });
      w.bind(SC.Widget.Events.PLAY, function () { playing = true; paint(); duck(0); });
      w.bind(SC.Widget.Events.PAUSE, function () { playing = false; paint(); duck(null); });
      w.bind(SC.Widget.Events.FINISH, function () { playing = false; paint(); });
    };
    if (window.SC && SC.Widget) go();
    else { var sc = document.createElement('script'); sc.src = 'https://w.soundcloud.com/player/api.js'; sc.onload = go; sc.onerror = function () { loading = false; }; document.head.appendChild(sc); }
  }
  function paint() { playBtn.innerHTML = playing ? '&#10074;&#10074;' : '&#9654;'; playBtn.setAttribute('aria-pressed', playing); }
  function seek(d) { run(function () { w.getPosition(function (p) { w.seekTo(Math.max(0, p + d)); }); }); }
  var ACT = {
    play: function () { run(function () { w.toggle(); }); },
    prev: function () { run(function () { w.getPosition(function (p) { if (p > 4000) w.seekTo(0); else w.prev(); }); }); },
    next: function () { run(function () { w.next(); }); },
    back: function () { seek(-15000); },
    fwd: function () { seek(15000); }
  };
  dock.querySelector('.scd-ctl').addEventListener('click', function (e) { var b = e.target.closest('[data-sc]'); if (b && ACT[b.getAttribute('data-sc')]) ACT[b.getAttribute('data-sc')](); });

  /* ---------- where the player lives: the TV screen on the home page, the corner dock everywhere else ---------- */
  function setBox(l, t, wd, ht, radius) { var s = dock.style; s.left = l + 'px'; s.top = t + 'px'; s.width = wd + 'px'; s.height = ht + 'px'; s.borderRadius = radius; }
  function layout() {
    if (dock.hidden) return;
    var scr = document.getElementById('htv-screen'), home = route === 'home' && scr && scr.offsetParent !== null, m = home ? 'tv' : 'dock';
    if (m !== mode) {
      dock.classList.add('morph'); setTimeout(function () { dock.classList.remove('morph'); }, 650);
      mode = m; dock.classList.toggle('tv', m === 'tv'); dock.classList.toggle('dockd', m === 'dock'); root.classList.toggle('scd-tv', m === 'tv');
    }
    var vw = window.innerWidth, vh = window.innerHeight;
    if (m === 'tv') {
      var r = scr.getBoundingClientRect();
      setBox(r.left, r.top, r.width, r.height, getComputedStyle(scr).borderRadius || '12px');
      // the compact SoundCloud bar is 166px tall; on a small TV, shrink it to fit
      var fit = Math.min(1, (r.width - 20) / 420, Math.max(.45, (r.height - 100) / 166));
      fw.style.setProperty('--sc-s', fit.toFixed(3)); fw.style.height = (166 * fit) + 'px'; fw.style.width = (420 * fit) + 'px';
    } else {
      var wd = Math.min(360, vw - 20), sc = (wd - 16) / 420, hh = minimized ? 98 : 40 + 166 * sc + 70 + 28;
      setBox(vw - wd - 10, vh - hh - 10, wd, hh, '14px');
      fw.style.setProperty('--sc-s', sc.toFixed(3)); fw.style.height = (166 * sc) + 'px'; fw.style.width = (420 * sc) + 'px';
    }
  }
  function track() { cancelAnimationFrame(trackT); (function f() { layout(); if (!dock.hidden && route === 'home') trackT = requestAnimationFrame(f); })(); }
  function open() {
    if (dock.hidden) { dock.hidden = false; mode = ''; root.classList.add('scd-on'); }
    minimized = false; dock.classList.remove('min'); boot(); layout(); track();
    document.dispatchEvent(new CustomEvent('ss:musicopen'));
  }
  function close() {
    run(function () { w.pause(); }); dock.hidden = true; root.classList.remove('scd-on', 'scd-tv'); playing = false; paint(); duck(null); mode = '';
    document.dispatchEvent(new CustomEvent('ss:musicclosed'));
  }
  document.getElementById('scd-close').addEventListener('click', close);
  document.getElementById('scd-min').addEventListener('click', function () { minimized = !minimized; dock.classList.toggle('min', minimized); layout(); });
  document.addEventListener('ss:route', function (e) { route = e.detail.name; mode = mode; layout(); track(); });
  window.addEventListener('resize', layout); window.addEventListener('scroll', layout, { passive: true });
  window.SS = window.SS || {}; SS.openMusic = open; SS.closeMusic = close;
  // a YouTube video opening in the site player takes over the sound
  document.addEventListener('ss:playeropen', function () { if (ready && playing) w.pause(); });
  // the home remote drives the player while it is open: CH = tracks, VOL left/right = rewind / forward, OK = play/pause
  var MAP = { chup: 'next', chdown: 'prev', volup: 'fwd', voldown: 'back', ok: 'play' };
  var remote = document.getElementById('remote');
  if (remote) remote.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b || dock.hidden) return;
    var a = MAP[b.getAttribute('data-act')]; if (!a) return;
    e.stopPropagation(); e.stopImmediatePropagation(); ACT[a]();
  }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !dock.hidden && dock.contains(document.activeElement)) close(); });
})();
