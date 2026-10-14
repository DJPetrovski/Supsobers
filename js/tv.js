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
      if (phoneLive) level(0, 0.3);
      SS.openPlayer(v);
    } else {
      window.open('https://www.youtube.com/@Sobersector', '_blank', 'noopener');
    }
  }
  document.addEventListener('ss:playerclosed', function () {
    if (holeApi && !near) holeApi.hold(false);
    if (phoneLive && isOpen) level(soundOn ? (near ? NEAR : FAR) : 0, 1.5);
  });

  /* ---------- branching: hold a video to fall down its own rabbit hole ---------- */
  var branchEl = $('#hole-branch'), backBtn = $('#hole-back'), trailEl = $('#hole-trail'), branchLabel = $('#branch-label');
  var branchApi = null, branching = null, stack = [], landTimer = 0;

  function connected(v) {
    var list = (SS.related ? SS.related(v, 16) : []).filter(function (o) { return o.id !== v.id; });
    if (list.length < 3) {
      // thin connections: pad with the newest videos so the hole is never empty
      SS.videos.forEach(function (o) { if (list.length < 8 && o.id !== v.id && list.indexOf(o) < 0) list.push(o); });
    }
    return [v].concat(list);
  }

  function branchOpen(v, pt) {
    if (branching) return;
    var list = connected(v);
    branching = { v: v, list: list };
    if (holeApi) holeApi.hold(true);
    branchEl.style.left = pt.x + 'px';
    branchEl.style.top = pt.y + 'px';
    branchLabel.textContent = 'Down from: ' + (v.title || '');
    if (branchApi) { branchApi.setVideos(list); }
    else branchApi = HoleTunnel.create({ scene: $('#branch-scene'), world: $('#branch-world'), videos: list, ambient: true });
    branchEl.classList.remove('land');
    branchEl.style.transform = '';
    branchEl.classList.add('open');
    branchApi.start({ boost: 200 });
  }

  function branchLand() {
    if (!branching) return;
    var b = branching;
    branching = null;
    clearTimeout(landTimer);
    var big = Math.max(window.innerWidth, window.innerHeight) * 1.7 / branchEl.offsetWidth;
    branchEl.classList.add('land');
    branchEl.style.transform = 'translate(-50%, -50%) scale(' + big.toFixed(2) + ')';
    landTimer = setTimeout(function () {
      stack.push({ label: b.v.title, list: b.list });
      holeApi.setVideos(b.list);
      holeApi.start({ boost: 900 });
      holeApi.hold(false);
      branchEl.classList.remove('open', 'land');
      branchEl.style.transform = '';
      if (branchApi) branchApi.stop();
      paintTrail();
    }, 700);
  }

  function paintTrail() {
    backBtn.hidden = !stack.length;
    trailEl.textContent = stack.length ? 'Down from: ' + stack[stack.length - 1].label : '';
  }

  backBtn.addEventListener('click', function () {
    if (!stack.length) return;
    stack.pop();
    holeApi.setVideos(stack.length ? stack[stack.length - 1].list : SS.videos);
    holeApi.start({ boost: 900 });
    paintTrail();
  });

  function resetBranches() {
    clearTimeout(landTimer);
    stack = []; branching = null;
    branchEl.classList.remove('open', 'land');
    branchEl.style.transform = '';
    if (branchApi) branchApi.stop();
    if (holeApi) holeApi.setVideos(SS.videos);
    paintTrail();
  }

  /* ---------- the bottom of the hole: a small television you never reach ---------- */
  var phoneEl = $('#hole-phone'), soundBtn = $('#hole-sound'), backPhone = $('#phone-back'), tip = $('#phone-tip');
  var offer = $('#pill-offer'), redBtn = $('#pill-red'), blueBtn = $('#pill-blue'), fine = $('#pill-fine');
  var actx = null, master = null, dry = null, wet = null, near = false, soundOn = true, phoneLive = false;
  var holeTv = window.Pill ? Pill.build($('#hole-tv')) : null;

  // A made-up cathedral: noise that fades out over a few seconds.
  function impulse(ctx, seconds, decay) {
    var len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  // Quiet television hiss with a long echo, so the bottom of the hole sounds far away.
  function audioGraph() {
    if (actx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      actx = new AC();
      var nb = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate), nd = nb.getChannelData(0);
      for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      var src = actx.createBufferSource(); src.buffer = nb; src.loop = true;
      var lp = actx.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 2200; lp.Q.value = 0.5;
      dry = actx.createGain(); dry.gain.value = 0.5;
      wet = actx.createGain(); wet.gain.value = 1;
      var conv = actx.createConvolver(); conv.buffer = impulse(actx, 3.6, 2.6);
      var delay = actx.createDelay(1.5); delay.delayTime.value = 0.42;
      var fb = actx.createGain(); fb.gain.value = 0.45;
      var echo = actx.createGain(); echo.gain.value = 0.4;
      master = actx.createGain(); master.gain.value = 0;
      src.connect(lp);
      lp.connect(dry); dry.connect(master);
      lp.connect(conv); conv.connect(wet); wet.connect(master);
      lp.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(echo); echo.connect(master);
      master.connect(actx.destination);
      src.start();
      return true;
    } catch (e) { actx = null; return false; }
  }

  function level(v, secs) {
    if (!actx || !master) return;
    var now = actx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(v, now + (secs || 1.2));
  }
  var FAR = 0.05, NEAR = 0.12;

  function phoneStart() {
    if (phoneLive) return;
    phoneLive = true;
    if (holeTv) holeTv.start();
    var ok = audioGraph();
    if (actx && actx.state === 'suspended') actx.resume().catch(function () {});
    if (ok) level(soundOn ? (near ? NEAR : FAR) : 0, 2.5);
  }
  function phoneStop() {
    phoneLive = false;
    level(0, 0.5);
    setTimeout(function () { if (!phoneLive && holeTv) holeTv.stop(); }, 600);
  }

  function pullCloser() {
    if (near || !isOpen) return;
    near = true;
    if (holeApi) holeApi.hold(true);
    var w = phoneEl.getBoundingClientRect().width;
    var target = Math.min(window.innerWidth * 0.84, window.innerHeight * 0.4, 400);
    phoneEl.classList.add('near');
    phoneEl.style.transform = 'translate(-50%, -62%) scale(' + (target / w).toFixed(2) + ')';
    backPhone.hidden = false;
    offer.hidden = false;
    hole.classList.add('pill-near');
    fine.textContent = 'Red: a random video, a different one every time. Blue: no choices, just keep falling.';
    redBtn.disabled = blueBtn.disabled = false;
    if (actx) { dry.gain.value = 1; wet.gain.value = 0.3; level(soundOn ? NEAR : 0, 0.8); }
  }
  function putBack() {
    if (!near) return;
    near = false;
    phoneEl.classList.remove('near');
    phoneEl.style.transform = '';
    backPhone.hidden = true;
    offer.hidden = true;
    hole.classList.remove('pill-near');
    if (actx) { dry.gain.value = 0.5; wet.gain.value = 1; level(soundOn ? FAR : 0, 1); }
    if (holeApi) holeApi.hold(false);
  }

  phoneEl.addEventListener('click', function (e) {
    if (!near) { pullCloser(); return; }
    e.stopPropagation();
  });
  phoneEl.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && !near) { e.preventDefault(); pullCloser(); } });
  backPhone.addEventListener('click', putBack);
  // Blue pill: Wonderland mode. The buttons melt away and the hole just drifts, tinted blue, until you touch it.
  var dreamT = 0;
  function dreamEnd() { clearTimeout(dreamT); hole.classList.remove('dream'); }
  blueBtn.addEventListener('click', function () {
    putBack();
    hole.classList.add('dream');
    clearTimeout(dreamT);
    dreamT = setTimeout(dreamEnd, 45000);
    setTimeout(function () { hole.addEventListener('pointerdown', dreamEnd, { once: true }); }, 600);
  });
  redBtn.addEventListener('click', function () {
    var v = window.Pill && Pill.random();
    if (!v) return;
    putBack();
    pick(v);
  });
  soundBtn.addEventListener('click', function () {
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? 'Sound on' : 'Sound off';
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    if (actx && actx.state === 'suspended') actx.resume().catch(function () {});
    level(soundOn ? (near ? NEAR : FAR) : 0, 0.6);
  });
  // A blocked autoplay recovers on the first touch inside the hole.
  hole.addEventListener('pointerdown', function () {
    if (phoneLive && actx && actx.state === 'suspended') actx.resume().catch(function () {});
  });

  /* ---------- pop-up when the trailer ends ---------- */
  var pop = $('#pill-pop'), aboutVid = $('#about-video'), popTv = null;
  function popOpen() {
    if (!pop || !window.Pill) return;
    if (!popTv) popTv = Pill.build($('#pop-tv'));
    pop.hidden = false; popTv.start();
    try { $('#pop-red').focus({ preventScroll: true }); } catch (e) {}
  }
  function popClose() { if (!pop) return; pop.hidden = true; if (popTv) popTv.stop(); }
  if (aboutVid && pop) {
    aboutVid.addEventListener('ended', popOpen);
    $('#pop-blue').addEventListener('click', popClose);
    $('#pop-red').addEventListener('click', function () {
      var v = Pill.random();
      if (!v) return;
      popClose();
      SS.openPlayer(v);
    });
    pop.addEventListener('click', function (e) { if (e.target === pop) popClose(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hidden) popClose(); });
  }

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
      holeApi = HoleTunnel.create({ scene: scene, world: world, videos: SS.videos, onPick: pick, titleEl: titleEl, onHold: branchOpen, onRelease: branchLand });
    }
    holeApi.start({ boost: 1300 });
    phoneStart();
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
    resetBranches();
    dreamEnd();
    putBack();
    phoneStop();
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
    phoneStop();
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
    if (e.key === 'Escape') { if (near) putBack(); else climb(); }
    else if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); holeApi.nudge(250); }
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); holeApi.nudge(-250); }
  });
})();
