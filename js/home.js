/* Home: a TV that plays the trailer until you pick up the remote.
   Hover (or tap) a key and the TV previews that page; press it and you get pulled into the screen. */
(function () {
  'use strict';
  var rig = document.getElementById('home-rig');
  if (!rig) return;
  var tvEl = document.getElementById('htv'), screen = document.getElementById('htv-screen'),
      video = document.getElementById('htv-video'), prev = document.getElementById('htv-preview'),
      soundBtn = document.getElementById('htv-sound'), hint = document.createElement('span'),
      keys = Array.prototype.slice.call(rig.querySelectorAll('[data-key]'));
  var hero = document.querySelector('.home-hero');
  if (window.IntersectionObserver && hero) new IntersectionObserver(function (en) { hero.classList.toggle('offscreen', en[0].intersectionRatio < 0.05); document.dispatchEvent(new CustomEvent('ss:homevis', { detail: { on: en[0].intersectionRatio >= 0.05 } })); }, { threshold: [0, 0.05, 0.2] }).observe(hero);
  var scrT = 0;
  window.addEventListener('scroll', function () { document.documentElement.classList.add('is-scrolling'); clearTimeout(scrT); scrT = setTimeout(function () { document.documentElement.classList.remove('is-scrolling'); }, 140); }, { passive: true });
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

  // The TV: a glitchy, searching screen for ~5.5 seconds, then the trailer. When the trailer ends it
  // drops into the middle of a random Sobering Stories video and changes channel every 3 minutes.
  var introT = 0, SEARCH_MS = 5500, CHANNEL_MS = 180000, started = false, soundOn = false, chanT = 0, onTrailer = true, cur = null;
  var yt = document.getElementById('htv-yt'), nowBtn = document.getElementById('htv-now'), nextBtn = document.getElementById('htv-next');
  function duck(level) { document.dispatchEvent(new CustomEvent('ss:duck', { detail: { key: 'trailer', level: level } })); }
  function ytCmd(fn) { try { yt.contentWindow.postMessage(JSON.stringify({ event: 'command', func: fn, args: [] }), '*'); } catch (e) {} }
  function applySound() {
    video.muted = !soundOn;
    if (!yt.hidden) ytCmd(soundOn ? 'unMute' : 'mute');
    soundBtn.textContent = soundOn ? 'Sound on' : 'Sound off';
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    duck(soundOn && started ? 0 : null);
  }
  function setSound(on) { soundOn = !!on; applySound(); if (on && onTrailer && started && video.paused) video.play().catch(function () {}); }
  soundBtn.addEventListener('click', function () { setSound(!soundOn); });

  var seen = [], hist = [], chNo = 0, trailerDone = false, osdT = 0;
  var osd = document.getElementById('htv-osd');
  function showOsd(t) { osd.textContent = t; osd.classList.add('on'); clearTimeout(osdT); osdT = setTimeout(function () { osd.classList.remove('on'); }, 1800); }
  function pickRandom() {
    var all = (window.SS && SS.videos || []).filter(function (v) { return /^[\w-]{11}$/.test(v.id || '') && (v.seconds || 0) >= 1800; });
    if (!all.length) return null;
    var fresh = all.filter(function (v) { return seen.indexOf(v.id) < 0; });
    if (!fresh.length) { seen = seen.slice(-1); fresh = all.filter(function (v) { return seen.indexOf(v.id) < 0; }); }
    var v = fresh[Math.floor(Math.random() * fresh.length)];
    seen.push(v.id);
    return v;
  }
  function channel(back) {
    clearTimeout(chanT);
    var v;
    if (back === true && hist.length > 1) { hist.pop(); v = hist[hist.length - 1]; chNo = Math.max(1, chNo - 1); }
    else { v = pickRandom(); if (v) { hist.push(v); chNo++; } }
    if (v) showOsd('CH ' + (chNo < 10 ? '0' : '') + chNo);
    if (!v) { document.addEventListener('ss:videos', function once() { document.removeEventListener('ss:videos', once); if (onHome && !onTrailer) channel(); }); return; }
    cur = v;
    var start = Math.floor(Math.random() * Math.max(60, (v.seconds || 1800) * 0.8));
    screen.classList.add('tuning');
    yt.hidden = false;
    yt.onload = function () { setTimeout(function () { applySound(); screen.classList.remove('tuning'); }, 900); };
    yt.src = 'https://www.youtube-nocookie.com/embed/' + v.id + '?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1&enablejsapi=1&start=' + start;
    nowBtn.hidden = nextBtn.hidden = false;
    nowBtn.title = v.title || '';
    nowBtn.textContent = 'Watch this one';
    chanT = setTimeout(channel, CHANNEL_MS);
  }
  function stopChannels() { clearTimeout(chanT); yt.onload = null; yt.src = 'about:blank'; yt.hidden = true; nowBtn.hidden = nextBtn.hidden = true; cur = null; }
  nowBtn.addEventListener('click', function () { if (cur && window.SS) { var v = cur; SS.openPlayer(v); } });
  nextBtn.addEventListener('click', function () { channel(); });
  document.addEventListener('ss:playeropen', function () { if (!yt.hidden) ytCmd('pauseVideo'); });
  document.addEventListener('ss:playerclosed', function () { if (onHome && !yt.hidden) ytCmd('playVideo'); });

  Array.prototype.forEach.call(rig.querySelectorAll('[data-act]'), function (b) {
    b.addEventListener('click', function () {
      var a = b.getAttribute('data-act');
      if (a === 'chup') { if (onTrailer) { clearTimeout(introT); started = true; screen.classList.remove('htv-search'); video.pause(); video.style.opacity = '0'; onTrailer = false; } channel(); }
      else if (a === 'chdown') { if (onTrailer) { onTrailer = false; clearTimeout(introT); started = true; video.pause(); video.style.opacity = '0'; channel(); } else channel(true); }
      else if (a === 'volup') { setSound(true); showOsd('VOL +'); }
      else if (a === 'voldown') { setSound(false); showOsd('MUTE'); }
      else if (a === 'ok') { if (cur) SS.openPlayer(cur); else showOsd('NO SIGNAL'); }
    });
  });

  function searching() {
    clearTimeout(introT); stopChannels(); started = false; onTrailer = true;
    video.hidden = false;
    video.pause(); try { video.currentTime = 0; } catch (e) {}
    video.style.opacity = '0';
    screen.classList.add('tuning', 'htv-search');
    var first = !trailerDone;
    introT = setTimeout(function () {
      started = true;
      if (!first) { screen.classList.remove('htv-search'); toChannels(); return; }
      trailerDone = true;
      screen.classList.remove('tuning', 'htv-search');
      video.style.opacity = '';
      if (onHome) { var p = video.play(); if (p && p.catch) p.catch(function () { toChannels(); }); }
      applySound();
    }, reduce ? 800 : (first ? SEARCH_MS : 1600));
  }
  function toChannels() {
    if (!onHome || !onTrailer) return;
    onTrailer = false;
    video.pause(); video.style.opacity = '0';
    channel();
  }
  video.addEventListener('ended', toChannels);
  video.addEventListener('error', function () { if (started) toChannels(); });
  document.addEventListener('ss:route', function (e) {
    onHome = e.detail.name === 'home';
    if (onHome) searching(); else { clearTimeout(introT); stopChannels(); video.pause(); setSound(false); }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { video.pause(); if (!yt.hidden) ytCmd('pauseVideo'); }
    else if (onHome && started) { if (onTrailer) video.play().catch(function () {}); else ytCmd('playVideo'); }
  });
  searching();
})();
