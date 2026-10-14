/* Music: DJ's SoundCloud is a pop-up dock in the corner. It never starts by itself: the home 'Sound on' button, the remote's SoundCloud key
   or the AI model start it. Then it keeps playing on every page until Stop (the X) or the AI is told to stop. */
(function () {
  var dock = document.getElementById('scd'); if (!dock) return;
  var frame = document.getElementById('scd-frame'), playBtn = dock.querySelector('[data-sc=play]'), fw = dock.querySelector('.scd-fw');
  var URL_ = 'https://soundcloud.com/djpetrovski', w = null, loading = false, ready = false, playing = false, queue = [], root = document.documentElement;
  var userPos = null, route = (location.hash || '#home').slice(1) || 'home', mode = '', trackT = 0, minimized = false, wasPlaying = false;
  var autoP = false;
  function state() { document.dispatchEvent(new CustomEvent('ss:musicstate', { detail: { playing: playing } })); }
  function duck(l) { document.dispatchEvent(new CustomEvent('ss:duck', { detail: { key: 'sc', level: l } })); }
  function run(fn) { if (ready && w) fn(); else queue.push(fn); }
  function boot() {
    if (w || loading) return; loading = true;
    frame.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(URL_) + '&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=false';
    var go = function () {
      w = SC.Widget(frame);
      w.bind(SC.Widget.Events.READY, function () { ready = true; queue.splice(0).forEach(function (f) { f(); }); });
      w.bind(SC.Widget.Events.PLAY, function () { playing = true; paint(); duck(0); state(); });
      w.bind(SC.Widget.Events.PAUSE, function () { playing = false; if (!autoP) wasPlaying = false; autoP = false; paint(); duck(null); state(); });
      w.bind(SC.Widget.Events.FINISH, function () { playing = false; wasPlaying = false; paint(); state(); });
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
    var m = 'dock';
    if (m !== mode) {
      dock.classList.add('morph'); setTimeout(function () { dock.classList.remove('morph'); }, 650);
      mode = m; dock.classList.toggle('tv', m === 'tv'); dock.classList.toggle('dockd', m === 'dock'); root.classList.toggle('scd-tv', m === 'tv');
    }
    var vw = window.innerWidth, vh = window.innerHeight;
    {
      var wd = Math.min(360, vw - 20), sc = (wd - 16) / 420, hh = minimized ? 98 : 40 + 166 * sc + 70 + 28;
      var L = vw - wd - 10, T = vh - hh - 10;
      if (userPos) { L = Math.max(4, Math.min(vw - wd - 4, userPos.l)); T = Math.max(4, Math.min(vh - hh - 4, userPos.t)); }
      setBox(L, T, wd, hh, '14px');
      fw.style.setProperty('--sc-s', sc.toFixed(3)); fw.style.height = (166 * sc) + 'px'; fw.style.width = (420 * sc) + 'px';
    }
  }
  // press and hold the title bar (or the empty space around the buttons), then drag the dock anywhere
  (function () {
    var sx, sy, ol, ot, down = false, drag = false, holdT = 0, pid;
    function begin(e) {
      if (mode !== 'dock' || e.button > 0 || e.target.closest('button, a, iframe')) return;
      down = true; drag = false; sx = e.clientX; sy = e.clientY; ol = dock.offsetLeft; ot = dock.offsetTop; pid = e.pointerId;
      holdT = setTimeout(function () { if (down) startDrag(); }, 220);
    }
    function startDrag() { drag = true; dock.classList.add('dragging'); try { dock.setPointerCapture(pid); } catch (x) {} }
    dock.addEventListener('pointerdown', begin);
    dock.addEventListener('pointermove', function (e) {
      if (!down) return;
      if (!drag && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 8) { clearTimeout(holdT); startDrag(); }
      if (!drag) return;
      e.preventDefault(); userPos = { l: ol + e.clientX - sx, t: ot + e.clientY - sy }; layout();
    });
    function end() { clearTimeout(holdT); down = false; if (drag) { drag = false; dock.classList.remove('dragging'); } }
    dock.addEventListener('pointerup', end); dock.addEventListener('pointercancel', end);
  })();
  function track() {}
  function open(play) {
    if (play !== true) play = false;
    if (dock.hidden) { dock.hidden = false; mode = ''; root.classList.add('scd-on'); }
    minimized = false; dock.classList.remove('min'); boot(); layout();
    if (play) { wasPlaying = true; run(function () { w.play(); }); }
    document.dispatchEvent(new CustomEvent('ss:musicopen'));
  }
  function close() {
    wasPlaying = false; run(function () { w.pause(); }); dock.hidden = true; root.classList.remove('scd-on', 'scd-tv'); playing = false; paint(); duck(null); mode = '';
    document.dispatchEvent(new CustomEvent('ss:musicclosed'));
  }
  document.getElementById('scd-close').addEventListener('click', close);
  document.getElementById('scd-min').addEventListener('click', function () { minimized = !minimized; dock.classList.toggle('min', minimized); layout(); });
  document.addEventListener('ss:route', function (e) { route = e.detail.name; mode = mode; layout(); track(); });
  window.addEventListener('resize', layout); window.addEventListener('scroll', layout, { passive: true });
  window.SS = window.SS || {}; SS.openMusic = open; SS.closeMusic = close; SS.pauseMusic = function () { wasPlaying = false; if (!dock.hidden) run(function () { w.pause(); }); }; SS.musicPlaying = function () { return playing; }; SS.musicOn = function () { return !dock.hidden; };
  // a YouTube video opening in the site player takes over the sound
  document.addEventListener('ss:playeropen', function () { if (ready && playing) { wasPlaying = true; autoP = true; w.pause(); } });
  document.addEventListener('ss:playerclosed', function () { if (wasPlaying && !dock.hidden && ready) { wasPlaying = false; w.play(); } });
  // The remote's CH and VOL keys always belong to the TV; the pop-up has its own buttons.
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !dock.hidden && dock.contains(document.activeElement)) close(); });
})();
