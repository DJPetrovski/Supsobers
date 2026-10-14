/* Home: a TV that plays the trailer until you pick up the remote.
   Hover (or tap) a key and the TV previews that page; press it and you get pulled into the screen. */
(function () {
  'use strict';
  var rig = document.getElementById('home-rig');
  if (!rig) return;
  var tvEl = document.getElementById('htv'), screen = document.getElementById('htv-screen'),
      video = document.getElementById('htv-video'), prev = document.getElementById('htv-preview'),
      soundBtn = document.getElementById('htv-sound'), hint = document.getElementById('remote-hint'),
      keys = Array.prototype.slice.call(rig.querySelectorAll('.rkey'));
  var touch = window.matchMedia && matchMedia('(hover: none)').matches;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var onHome = true, armed = null, leaveT = 0, tuneT = 0, diving = false;
  var IDLE = touch ? 'Tap a button to preview it.' : 'Hover a button to preview it. Click to go in.';
  hint.textContent = 'Pick up the remote.';
  setTimeout(function () { if (!armed) hint.textContent = IDLE; }, 2600);

  function thumbs(n) {
    var v = (window.SS && SS.videos || []).filter(function (x) { return /^[\w-]{11}$/.test(x.id || ''); }).slice(0, n);
    return v.map(function (x) { return '<img src="https://i.ytimg.com/vi/' + x.id + '/mqdefault.jpg" alt="">'; }).join('');
  }
  var WEB = '<svg viewBox="0 0 200 110" class="pv-web" aria-hidden="true"><g stroke="#ff2a35" stroke-width="1.2" opacity=".8"><path d="M100 55 L40 25 M100 55 L160 22 M100 55 L50 88 M100 55 L158 86 M40 25 L50 88 M160 22 L158 86 M40 25 L160 22"/></g><g fill="#ff2a35"><circle cx="100" cy="55" r="7"/><circle cx="40" cy="25" r="4.5"/><circle cx="160" cy="22" r="4.5"/><circle cx="50" cy="88" r="4.5"/><circle cx="158" cy="86" r="4.5"/></g></svg>';
  var CONTENT = {
    videos: function () { return '<h3>Videos</h3><p>Go down the rabbit hole</p><div class="pv-strip">' + thumbs(3) + '</div>'; },
    web: function () { return '<h3>The Web</h3>' + WEB + '<p>See how it all connects</p>'; },
    members: function () { return '<h3 class="pv-neon">Members<br>Only</h3><p>Off the record</p>'; },
    archives: function () { return '<h3>Archives</h3><p>Timelines and source records</p>'; },
    books: function () { return '<h3>Books</h3><p>Reading from the library</p>'; },
    about: function () { return '<h3>About</h3><p>Trust those who seek the truth</p>'; },
    youtube: function () { return '<h3>YouTube</h3><p>@Sobersector</p><div class="pv-strip one">' + thumbs(1) + '</div>'; },
    patreon: function () { return '<h3>Patreon</h3><p>Join the club</p>'; }
  };

  function show(key) {
    clearTimeout(leaveT); clearTimeout(tuneT);
    if (!CONTENT[key]) return;
    screen.classList.add('tuning');
    tuneT = setTimeout(function () {
      prev.innerHTML = '<div class="pv" data-k="' + key + '">' + CONTENT[key]() + '</div>';
      prev.classList.add('on');
      if (started) screen.classList.remove('tuning');
    }, 170);
  }
  function hide() {
    clearTimeout(tuneT);
    screen.classList.add('tuning');
    tuneT = setTimeout(function () { prev.classList.remove('on'); prev.innerHTML = ''; if (started) screen.classList.remove('tuning'); }, 140);
    armed = null;
    hint.textContent = IDLE;
  }
  function later() { clearTimeout(leaveT); leaveT = setTimeout(hide, touch ? 6000 : 450); }

  keys.forEach(function (k) {
    var key = k.getAttribute('data-key');
    k.addEventListener('mouseenter', function () { if (!touch) { show(key); hint.textContent = 'Click to go in.'; } });
    k.addEventListener('focus', function () { show(key); });
    k.addEventListener('blur', later);
    k.addEventListener('click', function (e) {
      var external = key === 'youtube' || key === 'patreon';
      if (touch && armed !== key) { e.preventDefault(); armed = key; show(key); hint.textContent = external ? 'Tap again to open.' : 'Tap again to go in.'; later(); return; }
      if (external) return;               // normal link in a new tab
      e.preventDefault();
      enter(key, k.getAttribute('href'));
    });
  });
  rig.querySelector('.remote').addEventListener('mouseleave', function () { if (!touch) later(); });
  rig.querySelector('.remote').addEventListener('mouseenter', function () { clearTimeout(leaveT); });

  // Pulled into the screen: the TV zooms until the glass fills the window, then the page changes.
  function enter(key, href) {
    if (diving) return;
    if (reduce || !tvEl.animate) { location.hash = href; return; }
    diving = true;
    show(key);
    var r = screen.getBoundingClientRect(), t = tvEl.getBoundingClientRect();
    var cx = r.left + r.width / 2 - t.left, cy = r.top + r.height / 2 - t.top;
    var s = Math.max(innerWidth / r.width, innerHeight / r.height) * 1.25;
    document.documentElement.classList.add('is-sucking');
    tvEl.style.transformOrigin = cx + 'px ' + cy + 'px';
    tvEl.style.zIndex = 35; tvEl.style.position = 'relative';
    var flash = document.createElement('div'); flash.className = 'suck-flash'; document.body.appendChild(flash);
    var a = tvEl.animate([{ transform: 'scale(1)' }, { transform: 'scale(' + (s * 0.5).toFixed(2) + ')', offset: 0.55 }, { transform: 'scale(' + s.toFixed(2) + ')' }], { duration: 950, easing: 'cubic-bezier(.55,.05,.9,.4)', fill: 'forwards' });
    setTimeout(function () { screen.classList.add('tuning'); flash.classList.add('on'); }, 520);
    a.onfinish = function () {
      location.hash = href;
      setTimeout(function () {
        a.cancel(); tvEl.style.transformOrigin = ''; tvEl.style.zIndex = ''; tvEl.style.position = '';
        document.documentElement.classList.remove('is-sucking');
        prev.classList.remove('on'); prev.innerHTML = ''; screen.classList.remove('tuning'); armed = null; diving = false;
        flash.classList.remove('on'); setTimeout(function () { flash.remove(); }, 700);
      }, 120);
    };
  }

  // Trailer: a glitchy, searching screen for ~5.5 seconds, then the picture comes in (muted: browsers insist; Sound turns it up).
  var introT = 0, SEARCH_MS = 5500, started = false;
  function duck(level) { document.dispatchEvent(new CustomEvent('ss:duck', { detail: { key: 'trailer', level: level } })); }
  function setSound(on) {
    video.muted = !on;
    soundBtn.textContent = on ? 'Sound on' : 'Sound off';
    soundBtn.setAttribute('aria-pressed', String(on));
    duck(on && started ? 0 : null);
    if (on && started && video.paused) video.play().catch(function () {});
  }
  soundBtn.addEventListener('click', function () { setSound(video.muted); });

  function searching() {
    clearTimeout(introT); started = false;
    video.pause(); try { video.currentTime = 0; } catch (e) {}
    video.style.opacity = '0';
    screen.classList.add('tuning', 'htv-search');
    introT = setTimeout(function () {
      started = true;
      screen.classList.remove('tuning', 'htv-search');
      video.style.opacity = '';
      if (onHome) { var p = video.play(); if (p && p.catch) p.catch(function () {}); }
      if (!video.muted) duck(0);
    }, reduce ? 800 : SEARCH_MS);
  }
  video.addEventListener('ended', function () { duck(null); document.dispatchEvent(new Event('ss:pill')); });
  document.addEventListener('ss:route', function (e) {
    onHome = e.detail.name === 'home';
    if (onHome) searching(); else { clearTimeout(introT); video.pause(); setSound(false); }
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) video.pause(); else if (onHome && started) video.play().catch(function () {}); });
  searching();
})();
