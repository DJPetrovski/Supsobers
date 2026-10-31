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
    web: function () { return '<h3>It\'s All<br>Connected</h3>' + WEB + '<p>See how it all links up</p>'; },
    members: function () { return '<h3 class="pv-neon">Members<br>Only</h3><p>Off the record</p>'; },
    archives: function () { return '<h3>Archives</h3><p>Timelines and source records</p>'; },
    merch: function () { var m = (window.SS && SS.merch || []).slice(0, 3); return '<h3>Merch</h3><p>Shirts, hoodies, stickers</p><div class="pv-strip pv-merch">' + m.map(function (x) { return '<img src="' + ((x.cutouts && x.cutouts[0]) || x.images[0]) + '" alt="">'; }).join('') + '</div>'; },
    socials: function () { var n = (window.SS && SS.socials || []).length; return '<h3>Socials</h3><p>' + (n ? n + ' channels to tune in' : 'Find me everywhere') + '</p><div class="pv-chans"><i></i><i></i><i></i><i></i></div>'; },
    books: function () { return '<h3>Books</h3><p>Reading from the library</p>'; },
    about: function () { return '<h3>About</h3><p>Trust those who seek the truth</p>'; },
    youtube: function () { return '<h3>YouTube</h3><p>@Sobersector</p><div class="pv-strip one">' + thumbs(1) + '</div>'; },
    patreon: function () { return '<h3>Patreon</h3><p>Join the club</p>'; },
    instagram: function () { return '<h3>Instagram</h3><p>@djpetrovski</p>'; },
    x: function () { return '<h3>X</h3><p>@djpetrovski12</p>'; },
    rumble: function () { return '<h3>Rumble</h3><p>Videos without the algorithm</p>'; },
    spotify: function () { return '<h3>Spotify</h3><p>The podcast</p>'; },
    half: function () { return '<h3>My Better<br>Half</h3><p>Kim: Reverie Revival Colorado</p>'; },
    music: function () { return '<h3>Music</h3><p>DJ\'s house mixes. Play them here.</p>'; },
    craving: function () { return '<h3>Kraving Killer</h3><p>Play something dumb until it passes</p>'; },
    contact: function () { return '<h3>Contact</h3><p>Open the laptop. Send a message.</p>'; },
    discord: function () { return '<h3>Discord</h3><p>Join the server</p>'; },
    voice: function () { return '<h3>Voice</h3><p>Say what you want. Press again to talk.</p>'; },
    search: function () { return '<h3>Search</h3><p>Find any video, product or page</p>'; }
  };

  function show(key) {
    clearTimeout(leaveT); clearTimeout(tuneT);
    if (!CONTENT[key]) return;
    screen.classList.add('tuning');
    tuneT = setTimeout(function () {
      prev.innerHTML = '<div class="pv" data-k="' + key + '">' + CONTENT[key]() + '</div>';
      prev.classList.add('on'); screen.classList.add('can-pick');
      if (started) screen.classList.remove('tuning');
    }, 170);
  }
  function hide() {
    clearTimeout(tuneT);
    screen.classList.add('tuning');
    tuneT = setTimeout(function () { prev.classList.remove('on'); screen.classList.remove('can-pick'); prev.innerHTML = ''; if (started) screen.classList.remove('tuning'); }, 140);
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
      var external = k.target === '_blank';
      if (touch && armed !== key) { e.preventDefault(); armed = key; show(key); hint.textContent = external ? 'Tap again to open.' : 'Tap again to go in.'; later(); return; }
      if (key === 'voice') { e.preventDefault(); if (window.SS && SS.openAssistant) SS.openAssistant(true); return; }
      if (key === 'music') { e.preventDefault(); if (window.SS && SS.openMusic) SS.openMusic(true); return; }
      if (key === 'search') { e.preventDefault(); if (window.SS && SS.openSearch) SS.openSearch(); return; }
      if (external) return;               // normal link in a new tab
      e.preventDefault();
      enter(key, k.getAttribute('href'));
    });
  });
  rig.querySelector('.remote').addEventListener('mouseleave', function () { if (!touch) later(); });
  rig.querySelector('.remote').addEventListener('mouseenter', function () { clearTimeout(leaveT); });

  // Tap or click the screen while a preview is showing to pick it, same as pressing the key.
  screen.addEventListener('click', function () {
    var pv = prev.classList.contains('on') && prev.querySelector('.pv'); if (diving) return;
    // No preview showing: the picture is a channel playing, so a click goes to that video on YouTube
    // (this also covers age-restricted videos, which cannot play inside the TV).
    if (!pv) { if (powered && cur && !yt.hidden && /^[\w-]{11}$/.test(cur.id || '')) window.open('https://www.youtube.com/watch?v=' + cur.id, '_blank', 'noopener'); return; }
    var key = pv.getAttribute('data-k');
    for (var i = 0; i < keys.length; i++) if (keys[i].getAttribute('data-key') === key) { armed = key; keys[i].click(); return; }
  });
  screen.addEventListener('mouseenter', function () { if (prev.classList.contains('on')) clearTimeout(leaveT); });
  screen.addEventListener('mouseleave', function () { if (!touch && prev.classList.contains('on')) later(); });

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
  function ytCmd(fn, args, frame) { try { (frame || yt).contentWindow.postMessage(JSON.stringify({ event: 'command', func: fn, args: args || [] }), '*'); } catch (e) {} }
  var STEPS = [0, 25, 75, 100], vIdx = 0, lastIdx = 2, volume = 0, knobCh = document.getElementById('htv-knob-ch'), knobVol = document.getElementById('htv-knob-vol'), volRot = -135;
  var vAngle = 0;
  function paintVol() {
    if (!(knobVol && knobVol.__drag)) vAngle = vIdx * 90;
    volRot = -135 + vIdx * 90;
    if (knobVol) knobVol.style.setProperty('--rot', volRot + 'deg');
    if (knobVol) knobVol.setAttribute('aria-valuenow', STEPS[vIdx]);
  }
  function applySound() {
    var audible = soundOn && !(window.SS && SS.musicPlaying && SS.musicPlaying());   // the music pop-up and the TV never play at the same time
    video.muted = !audible;
    video.volume = Math.max(0, Math.min(1, volume / 100));
    if (!yt.hidden) { ytCmd(audible ? 'unMute' : 'mute'); if (audible) ytCmd('setVolume', [volume]); }
    paintVol();
    soundBtn.textContent = soundOn ? 'Sound on' : 'Sound off';
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    duck(soundOn && started ? 0 : null);
  }
  // Music and TV share the speakers: starting the music mutes the channel, changing the channel pauses the music and brings the TV sound up.
  document.addEventListener('ss:musicstate', function () { applySound(); });
  function takeover() {
    if (window.SS && SS.musicPlaying && SS.musicPlaying()) SS.pauseMusic();
    if (!soundOn) setVolIdx(lastIdx || 2, false); else applySound();
  }
  // Four volume settings: mute, 25%, 75%, 100%.
  function setVolIdx(i, osdOn) {
    vIdx = Math.max(0, Math.min(STEPS.length - 1, i));
    volume = STEPS[vIdx]; soundOn = vIdx > 0;
    if (soundOn) lastIdx = vIdx;
    applySound();
    if (started && onTrailer && soundOn && video.paused) video.play().catch(function () {});
    if (osdOn !== false) showOsd(soundOn ? 'VOL ' + volume : 'MUTE');
  }
  function setSound(on) { setVolIdx(on ? (lastIdx || 2) : 0, false); }
  soundBtn.addEventListener('click', function () {
    // "Sound on" brings up the music pop-up and starts it; "Sound off" pauses the music (the pop-up stays so it can be restarted)
    var on = !soundOn; setSound(on);
    if (window.SS) { if (on && SS.openMusic) SS.openMusic(true); else if (!on && SS.pauseMusic) SS.pauseMusic(); }
  });

  var seen = [], hist = [], chNo = 0, trailerDone = false, osdT = 0, powered = true, lateNight = false;
  var osd = document.getElementById('htv-osd');
  function showOsd(t) { osd.textContent = t; osd.classList.add('on'); clearTimeout(osdT); osdT = setTimeout(function () { osd.classList.remove('on'); }, 1800); }
  // First channel of every browsing session = the featured deep dive (data/featured.json; normally the latest Friday upload), from the start, as a promo. After that it is random.
  var promoId = '', promoDone = false;
  try { promoDone = sessionStorage.getItem('ss-promo') === '1'; } catch (e) {}
  function pickNewest() {
    if (promoDone) return null;
    var n = (window.SS && SS.featured) || (window.SS && SS.videos || []).filter(function (v) { return /^[\w-]{11}$/.test(v.id || ''); })[0];
    if (!n) return null;
    promoDone = true; promoId = n.id; try { sessionStorage.setItem('ss-promo', '1'); } catch (e) {}
    seen.push(n.id);
    return n;
  }
  function pickRandom() {
    var newest = pickNewest(); if (newest) return newest;
    if (lateNight && window.Pill) {
      for (var i = 0; i < 10; i++) { var r = Pill.random('red'); if (r && /^[\w-]{11}$/.test(r.id || '') && (r.seconds || 0) >= 1800) return r; }
    }
    var all = (window.SS && SS.videos || []).filter(function (v) { return /^[\w-]{11}$/.test(v.id || '') && (v.seconds || 0) >= 1800; });
    if (!all.length) return null;
    var fresh = all.filter(function (v) { return seen.indexOf(v.id) < 0; });
    if (!fresh.length) { seen = seen.slice(-1); fresh = all.filter(function (v) { return seen.indexOf(v.id) < 0; }); }
    var v = fresh[Math.floor(Math.random() * fresh.length)];
    seen.push(v.id);
    return v;
  }
  var spare = document.createElement('iframe'), queued = null;
  spare.className = 'htv-yt pre'; spare.id = 'htv-yt-b'; spare.title = ''; spare.setAttribute('aria-hidden', 'true'); spare.tabIndex = -1; spare.hidden = true;
  spare.setAttribute('allow', 'autoplay; encrypted-media'); spare.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  yt.parentNode.insertBefore(spare, yt.nextSibling);
  function embed(v) {
    var start = v.id === promoId ? 0 : Math.floor(Math.random() * Math.max(60, (v.seconds || 1800) * 0.8));
    return 'https://www.youtube-nocookie.com/embed/' + v.id + '?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1&enablejsapi=1&origin=' + encodeURIComponent(location.origin) + '&start=' + start;
  }
  // Load the next random channel invisibly so a channel change shows picture and sound with no wait.
  function preload() {
    if (!powered || yt.hidden || queued || !onHome) return;
    var v = pickRandom(); if (!v) return;
    var f = spare, q = { v: v, frame: f }; queued = q;
    f.classList.add('pre'); f.hidden = false;
    f.onload = function () { setTimeout(function () { if (queued === q) ytCmd('mute', [], f); }, 300); setTimeout(function () { if (queued === q) ytCmd('pauseVideo', [], f); }, 3500); };
    f.src = embed(v);
  }
  function killPre() { queued = null; spare.onload = null; spare.src = 'about:blank'; spare.hidden = true; }
  function channel(back) {
    if (!powered) return;
    clearTimeout(chanT);
    var v;
    if (back === true && hist.length > 1) { hist.pop(); v = hist[hist.length - 1]; chNo = Math.max(1, chNo - 1); }
    else { v = (queued && queued.v) || pickRandom(); if (v) { hist.push(v); chNo++; } }
    if (v) showOsd('CH ' + (chNo < 10 ? '0' : '') + chNo + '');
    if (!v) { document.addEventListener('ss:videos', function once() { document.removeEventListener('ss:videos', once); if (onHome && !onTrailer) channel(); }); return; }
    cur = v;
    var pre = (back !== true && queued && queued.v === v) ? queued : null;
    if (pre) {
      // the next channel was already loaded behind the picture, so it appears (and plays) at once
      queued = null; var old = yt; yt = pre.frame;
      yt.classList.remove('pre'); yt.hidden = false; screen.classList.add('has-ch');
      ytCmd('playVideo'); applySound();
      [150, 400, 900, 1800, 3500].forEach(function (ms) { setTimeout(function () { if (!yt.hidden && cur === v) { ytCmd('playVideo'); applySound(); } }, ms); });
      old.onload = null; old.src = 'about:blank'; old.hidden = true; spare = old;
    } else {
      screen.classList.add('tuning');
      yt.hidden = false; screen.classList.add('has-ch');
      yt.onload = function () {
        [250, 900, 2000, 4000].forEach(function (ms) { setTimeout(function () { if (yt.hidden || cur !== v) return; ytCmd('playVideo'); applySound(); }, ms); });
        setTimeout(function () { screen.classList.remove('tuning'); }, 500);
      };
      yt.src = embed(v);
    }
    setTimeout(preload, 2500);
    nowBtn.hidden = nextBtn.hidden = false;
    nowBtn.title = v.title || '';
    nowBtn.textContent = 'Watch this one';
    chanT = setTimeout(channel, CHANNEL_MS);
  }
  function stopChannels() { clearTimeout(chanT); killPre(); yt.onload = null; yt.src = 'about:blank'; yt.hidden = true; screen.classList.remove('has-ch'); nowBtn.hidden = nextBtn.hidden = true; cur = null; }
  nowBtn.addEventListener('click', function () { if (cur && window.SS) { var v = cur; SS.openPlayer(v); } });
  nextBtn.addEventListener('click', function () { takeover(); channel(); });
  document.addEventListener('ss:playeropen', function () { if (!yt.hidden) ytCmd('pauseVideo'); });
  document.addEventListener('ss:playerclosed', function () { if (onHome && !yt.hidden) ytCmd('playVideo'); });

  Array.prototype.forEach.call(rig.querySelectorAll('[data-act]'), function (b) {
    b.addEventListener('click', function () {
      var a = b.getAttribute('data-act');
      if (!powered) { powerOn(); return; }
      if (a === 'chup' || a === 'chdown') takeover();
      if (a === 'chup') { if (onTrailer) { clearTimeout(introT); started = true; screen.classList.remove('htv-search'); video.pause(); video.style.opacity = '0'; onTrailer = false; } channel(); }
      else if (a === 'chdown') { if (onTrailer) { onTrailer = false; clearTimeout(introT); started = true; video.pause(); video.style.opacity = '0'; channel(); } else channel(true); }
      else if (a === 'volup') { setVolIdx(vIdx + 1); }
      else if (a === 'voldown') { setVolIdx(vIdx - 1); }
      else if (a === 'ok') { if (cur) SS.openPlayer(cur); else showOsd('NO SIGNAL'); }
    });
  });

  // The two round dials on the TV work: top = channel, bottom = volume.
  function dial(knob, onTurn, onTap) {
    if (!knob) return;
    var center, last, moved, total, startX, startY;
    function ang(e) { return Math.atan2(e.clientY - center.y, e.clientX - center.x) * 180 / Math.PI; }
    knob.addEventListener('pointerdown', function (e) {
      var r = knob.getBoundingClientRect(); center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      last = ang(e); moved = 0; total = 0; startX = e.clientX; startY = e.clientY; knob.__drag = true;
      knob.style.transition = 'none'; knob.setPointerCapture(e.pointerId); e.preventDefault();
    });
    knob.addEventListener('pointermove', function (e) {
      if (!knob.__drag) return;
      var a = ang(e), d = a - last; if (d > 180) d -= 360; if (d < -180) d += 360;
      last = a; moved += Math.abs(d); total += d;
      onTurn(d);
    });
    function up(e) {
      if (!knob.__drag) return;
      knob.__drag = false; knob.style.transition = '';
      if (moved < 6 && Math.abs(e.clientX - startX) < 6 && Math.abs(e.clientY - startY) < 6) onTap();
      paintVol();
    }
    knob.addEventListener('pointerup', up); knob.addEventListener('pointercancel', up);
    knob.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onTurn(30, true); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onTurn(-30, true); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); }
    });
  }
  var chRot = 25, chAcc = 0;
  dial(knobCh, function (d, key) {
    chRot += d; knobCh.style.setProperty('--rot', chRot + 'deg'); chAcc += d;
    if (Math.abs(chAcc) >= 40 || key) {
      var back = chAcc < 0; chAcc = 0; takeover();
      if (onTrailer) { clearTimeout(introT); started = true; onTrailer = false; screen.classList.remove('htv-search'); video.pause(); video.style.opacity = '0'; channel(); }
      else channel(back);
    }
  }, function () { document.querySelector('[data-act=chup]').click(); });
  dial(knobVol, function (d) {
    vAngle = Math.max(0, Math.min(270, vAngle + d));
    var i = Math.round(vAngle / 90);
    if (i !== vIdx) setVolIdx(i);
  }, function () { setVolIdx((vIdx + 1) % STEPS.length); });

  // POWER: tap = sign off (CRT collapse, dark room, PLEASE STAND BY) / tap again = warm up to a random video.
  // Hold for a second = secret LATE NIGHT mode: the whole page goes black and white and plays the red pill pool.
  var root = document.documentElement, powerBtn = document.getElementById('rm-power'), offT = 0, onT = 0;
  var dark = document.createElement('div'); dark.id = 'room-fx'; dark.setAttribute('aria-hidden', 'true');
  var bw = document.createElement('div'); bw.id = 'room-bw'; bw.setAttribute('aria-hidden', 'true');
  document.body.appendChild(dark); document.body.appendChild(bw);
  var standby = document.createElement('div'); standby.className = 'htv-standby';
  standby.innerHTML = '<div class="sb-bars"></div><div class="sb-txt"><b>PLEASE STAND BY</b><small>Sobervision will return shortly</small></div>';
  screen.appendChild(standby);
  function powerOff() {
    if (!powered) return;
    powered = false; clearTimeout(introT); clearTimeout(chanT); clearTimeout(offT);
    if (onTrailer) { onTrailer = false; started = true; }
    video.pause(); ytCmd('pauseVideo');
    screen.classList.remove('tuning', 'htv-search', 'crt-on');
    root.classList.add('tv-off'); screen.classList.add('crt-off');
    offT = setTimeout(function () {
      killPre(); yt.onload = null; yt.src = 'about:blank'; yt.hidden = true; screen.classList.remove('has-ch'); video.style.opacity = '0'; cur = null; nowBtn.hidden = nextBtn.hidden = true;
      screen.classList.remove('crt-off'); screen.classList.add('standby');
    }, reduce ? 0 : 650);
  }
  function powerOn() {
    if (powered) return;
    powered = true; clearTimeout(offT); clearTimeout(onT);
    root.classList.remove('tv-off'); screen.classList.remove('standby', 'crt-off');
    if (!reduce) { screen.classList.add('crt-on'); onT = setTimeout(function () { screen.classList.remove('crt-on'); }, 800); }
    channel();
  }
  function setLate(on) {
    lateNight = on; root.classList.toggle('late-night', on); killPre();
    if (!powered) powerOn(); else channel();
    showOsd(on ? 'LATE NIGHT' : 'SIGN ON');
  }
  function resetPower() {
    clearTimeout(offT); clearTimeout(onT);
    powered = true; lateNight = false;
    root.classList.remove('tv-off', 'late-night'); screen.classList.remove('standby', 'crt-off', 'crt-on');
  }
  if (powerBtn) {
    var holdT = 0, held = false;
    powerBtn.setAttribute('aria-label', 'Power');
    powerBtn.addEventListener('pointerdown', function () {
      held = false; powerBtn.classList.add('holding');
      holdT = setTimeout(function () { held = true; powerBtn.classList.remove('holding'); setLate(!lateNight); }, 900);
    });
    function cancelHold() { clearTimeout(holdT); powerBtn.classList.remove('holding'); }
    powerBtn.addEventListener('pointerup', cancelHold); powerBtn.addEventListener('pointerleave', cancelHold); powerBtn.addEventListener('pointercancel', cancelHold);
    powerBtn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    powerBtn.addEventListener('click', function () { if (held) { held = false; return; } if (powered) powerOff(); else powerOn(); });
  }

  function searching() {
    resetPower();
    clearTimeout(introT); stopChannels(); started = false; onTrailer = true;
    video.hidden = false;
    video.pause(); try { video.currentTime = 0; } catch (e) {}
    video.style.opacity = '0';
    screen.classList.add('tuning', 'htv-search');
    var first = !trailerDone;
    introT = setTimeout(function () {
      started = true;
      // No trailer any more: after the static, the TV goes straight to the featured (newest Friday) deep dive.
      trailerDone = true;
      screen.classList.remove('htv-search');
      toChannels();
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
    if (onHome) searching(); else { resetPower(); clearTimeout(introT); stopChannels(); video.pause(); setSound(false); }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { video.pause(); if (!yt.hidden) ytCmd('pauseVideo'); }
    else if (onHome && started) { if (onTrailer) video.play().catch(function () {}); else ytCmd('playVideo'); }
  });
  // every so often (20 to 45 seconds) the picture tears for a third of a second
  (function glitchLoop() {
    setTimeout(function () {
      if (onHome && started && !reduce && !document.hidden) {
        screen.classList.add('glitching');
        setTimeout(function () { screen.classList.remove('glitching'); }, 360);
      }
      glitchLoop();
    }, 20000 + Math.random() * 25000);
  })();
  searching();
})();
