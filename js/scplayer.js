/* Music dock: DJ's SoundCloud, played in the page, with transport buttons and the home remote wired to it. */
(function () {
  var dock = document.getElementById('scd'); if (!dock) return;
  var frame = document.getElementById('scd-frame'), playBtn = dock.querySelector('[data-sc=play]');
  var URL_ = 'https://soundcloud.com/djpetrovski', w = null, loading = false, ready = false, playing = false, queue = [], root = document.documentElement;
  function duck(l) { document.dispatchEvent(new CustomEvent('ss:duck', { detail: { key: 'sc', level: l } })); }
  function run(fn) { if (ready && w) fn(); else queue.push(fn); }
  function boot() {
    if (w || loading) return; loading = true;
    frame.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(URL_) + '&color=%23ff2a35&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=false';
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
  function open() { dock.hidden = false; dock.classList.remove('min'); root.classList.add('scd-on'); boot(); }
  function close() { run(function () { w.pause(); }); dock.hidden = true; root.classList.remove('scd-on'); playing = false; paint(); duck(null); }
  document.getElementById('scd-close').addEventListener('click', close);
  document.getElementById('scd-min').addEventListener('click', function () { dock.classList.toggle('min'); });
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
  // the d-pad buttons listen on the buttons themselves, so also capture on the button level
  Array.prototype.forEach.call(document.querySelectorAll('.rm-d, .rm-ok'), function (b) {
    b.addEventListener('click', function (e) { if (dock.hidden) return; var a = MAP[b.getAttribute('data-act')]; if (a) { e.stopImmediatePropagation(); ACT[a](); } }, true);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !dock.hidden && document.activeElement && dock.contains(document.activeElement)) close(); });
})();
