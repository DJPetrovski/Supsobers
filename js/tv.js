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

  var AUTO_DIVE_MS = 15000;   // how long the TV shows static before it drops you in
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
  document.addEventListener('ss:homevis', function (e) { if (current !== 'home') return; if (e.detail.on) startAmbient(); else stopAmbient(); });

  /* ---------- picking a video inside the hole ---------- */
  function pick(v) {
    armTip();
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
  var actx = null, master = null, dry = null, wet = null, near = false, soundOn = true, phoneLive = false;
  var holeTv = window.Pill ? Pill.build($('#hole-tv'), { onPick: function (kind) { if (near) choose(kind); } }) : null;

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

  // After 15 seconds with no video picked, a small bubble asks "Can't decide?" and points at the figure.
  var idleT = 0;
  function armTip() {
    clearTimeout(idleT); tip.classList.remove('on');
    idleT = setTimeout(function () { if (isOpen && !near) tip.classList.add('on'); }, 15000);
  }
  function pullCloser() {
    if (near || !isOpen) return;
    near = true; clearTimeout(idleT); tip.classList.remove('on'); previewOff();
    if (holeApi) holeApi.hold(true);
    var w = phoneEl.getBoundingClientRect().width;
    var target = Math.min(window.innerWidth * 0.94, window.innerHeight * 0.74 * 1.024, 640);
    phoneEl.classList.add('near');
    phoneEl.style.setProperty('--s', (target / w).toFixed(2));
    phoneEl.style.transform = 'translate(-50%, -50%) scale(' + (target / w).toFixed(2) + ')';
    backPhone.hidden = false;
    hole.classList.add('pill-near');
    if (!hole.querySelector('.hole-haze')) { var hz = document.createElement('div'); hz.className = 'hole-haze'; hz.setAttribute('aria-hidden', 'true'); hole.appendChild(hz); }
    if (actx) { dry.gain.value = 1; wet.gain.value = 0.3; level(soundOn ? NEAR : 0, 0.8); }
  }
  function putBack() {
    armTip();
    if (!near) return;
    near = false;
    phoneEl.classList.remove('near');
    phoneEl.style.transform = '';
    backPhone.hidden = true;
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
  // Red pill = the deep end, blue pill = a lighter trip. Different video every time.
  function choose(kind) {
    var v = window.Pill && Pill.random(kind);
    if (!v) return;
    putBack();
    pick(v);
  }
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
    if (!popTv) popTv = Pill.build($('#pop-tv'), { onPick: function (kind) { var v = Pill.random(kind); if (!v) return; popClose(); SS.openPlayer(v); } });
    pop.hidden = false; popTv.start();
  }
  function popClose() { if (!pop) return; pop.hidden = true; if (popTv) popTv.stop(); }
  document.addEventListener('ss:pill', popOpen);
  if (aboutVid && pop) {
    aboutVid.addEventListener('ended', popOpen);
    pop.addEventListener('click', function (e) { if (e.target === pop) popClose(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hidden) popClose(); });
  }

  /* ---------- hover a tile and its first seconds play, like YouTube ---------- */
  var pvT = 0, pvEl = null, pvCap = null;
  function duck(key, level) { document.dispatchEvent(new CustomEvent('ss:duck', { detail: { key: key, level: level } })); }
  function previewOff() {
    clearTimeout(pvT);
    if (pvCap) { pvCap.remove(); pvCap = null; }
    hole.classList.remove('pv-on');
    if (pvEl) { pvEl.remove(); pvEl = null; duck('preview', null); }
  }
  function previewOn(v, node) {
    previewOff();
    if (!v || !ID_RE.test(v.id || '') || near) return;
    pvT = setTimeout(function () {
      var r = node.getBoundingClientRect();
      pvEl = document.createElement('div');
      pvEl.className = 'hole-preview';
      pvEl.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
      pvEl.innerHTML = '<iframe title="Preview" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin" src="https://www.youtube-nocookie.com/embed/' + v.id + '?autoplay=1&mute=' + (soundOn ? 0 : 1) + '&controls=0&playsinline=1&rel=0&modestbranding=1&disablekb=1&iv_load_policy=3"></iframe>';
      hole.appendChild(pvEl);
      // the title rides right under the playing preview (above it if there is no room), on a dark block so it is readable
      pvCap = document.createElement('div'); pvCap.className = 'hole-preview-cap'; pvCap.textContent = v.title || '';
      var cw = Math.min(Math.max(r.width, 220), window.innerWidth - 24);
      pvCap.style.width = cw + 'px'; pvCap.style.left = Math.max(12, Math.min(window.innerWidth - cw - 12, r.left + r.width / 2 - cw / 2)) + 'px';
      if (r.bottom + 70 < window.innerHeight) pvCap.style.top = (r.bottom + 6) + 'px'; else pvCap.style.bottom = (window.innerHeight - r.top + 6) + 'px';
      hole.appendChild(pvCap); hole.classList.add('pv-on');
      duck('preview', 0);
    }, 700);
  }
  document.addEventListener('ss:playeropen', previewOff);

  // The scanner: type a word and the tunnel dims everything that doesn't match; Enter drops you into the first hit.
  var find = $('#hole-find'), findN = $('#hole-find-n'), scanPaused = false;
  function scanMatch(q) { var t = (q || '').toLowerCase().split(/\s+/).filter(Boolean); return t.length ? function (v) { var x = (v.title || '').toLowerCase(); return t.every(function (w) { return x.indexOf(w) >= 0; }); } : null; }
  function scan() {
    var fn = scanMatch(find.value);
    if (holeApi) holeApi.highlight(fn);
    if (!fn) { findN.textContent = ''; if (scanPaused && holeApi) { holeApi.setPaused(false); scanPaused = false; } return; }
    var n = (SS.videos || []).filter(fn).length;
    findN.textContent = n ? n + (n === 1 ? ' hit' : ' hits') : 'no hits';
    if (holeApi && n && !holeApi.isPaused()) { holeApi.setPaused(true); scanPaused = true; }
  }
  if (find) {
    find.addEventListener('input', scan);
    find.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') { var fn = scanMatch(find.value); var hit = fn && (SS.videos || []).filter(fn)[0]; if (hit) { find.blur(); pick(hit); } }
      else if (e.key === 'Escape') { find.value = ''; scan(); find.blur(); }
    });
    document.addEventListener('ss:holeclosed', function () { find.value = ''; scan(); });
  }
  var helpBtn = $('#hole-help'), helpT = 0;
  if (helpBtn) helpBtn.addEventListener('click', function () { clearTimeout(helpT); hint.classList.toggle('gone'); if (!hint.classList.contains('gone')) helpT = setTimeout(function () { hint.classList.add('gone'); }, 9000); });

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
      holeApi = HoleTunnel.create({ scene: scene, world: world, videos: SS.videos, onPick: pick, titleEl: titleEl, onHold: branchOpen, onRelease: branchLand, onHover: previewOn, onHoverEnd: previewOff });
    }
    holeApi.start({ boost: 1300 });
    phoneStart(); armTip();
    duck('hole', 0.25);
    pauseBtn.textContent = 'Pause';
    pauseBtn.setAttribute('aria-pressed', 'false');
    void hole.offsetWidth;
    hole.classList.add('on');
    hint.classList.remove('gone');
    later(function () { hint.classList.add('gone'); }, 9000);
    later(function () {
      tv.style.visibility = 'hidden';
      screenEl.classList.remove('glitch');
    }, 900);
    try { exitBtn.focus({ preventScroll: true }); } catch (e) { exitBtn.focus(); }
  }

  function cleanup() {
    resetBranches();
    putBack();
    phoneStop();
    previewOff();
    duck('hole', null);
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
    clearTimeout(idleT); tip.classList.remove('on');
    document.dispatchEvent(new Event('ss:holeclosed'));
    if (!isOpen) return;
    isOpen = false;
    phoneStop();
    previewOff();
    duck('hole', null);
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
  var rbRun = $('#rb-run'), rbWave = $('#rb-wave'); if (rbRun) rbRun.addEventListener('click', function () { diveBtn.click(); }); if (rbWave) rbWave.addEventListener('click', function () { diveBtn.click(); });

  /* ---------- the Matrix-style screen on the Videos page: green code rain + a typed message ---------- */
  (function () {
    var cvs = $('#rb-rain'), txt = $('#rb-text'); if (!cvs || !txt) return;
    var g = cvs.getContext('2d'), cols = [], FS = 13, on = false, typeId = 0, last = 0;
    var CH = '01アイウエオカキクケコサシスセソタチツテトナニヌネハヒフヘマミムメヤユヨラリルレロワ';
    function size() { cvs.width = Math.max(120, cvs.clientWidth); cvs.height = Math.max(90, cvs.clientHeight); cols = []; for (var i = 0; i < Math.floor(cvs.width / FS); i++) cols.push(Math.random() * -40); g.fillStyle = '#000'; g.fillRect(0, 0, cvs.width, cvs.height); }
    function frame(now) {
      if (!on) return;
      requestAnimationFrame(frame);
      if (now - last < 55) return; last = now;
      g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(0, 0, cvs.width, cvs.height); g.font = FS + 'px monospace';
      for (var i = 0; i < cols.length; i++) {
        var y = cols[i] * FS; g.fillStyle = '#b8ffc8'; g.fillText(CH[(Math.random() * CH.length) | 0], i * FS, y);
        g.fillStyle = '#25ff6a'; g.fillText(CH[(Math.random() * CH.length) | 0], i * FS, y - FS);
        cols[i] = (y > cvs.height && Math.random() > .97) ? 0 : cols[i] + 1;
      }
    }
    var LINES = ['Wake up...', 'The rabbit hole is real.', 'Follow the white rabbit.'];
    function type() {
      clearTimeout(typeId); var li = 0, ci = 0, erasing = false;
      (function step() {
        if (!on) return;
        var line = LINES[li];
        if (!erasing) { ci++; txt.innerHTML = line.slice(0, ci) + '<i></i>'; if (ci >= line.length) { if (li === LINES.length - 1) return; erasing = true; typeId = setTimeout(step, 1500); return; } typeId = setTimeout(step, 70); }
        else { ci = 0; erasing = false; li++; txt.innerHTML = '<i></i>'; typeId = setTimeout(step, 350); }
      })();
    }
    document.addEventListener('ss:route', function (e) {
      var v = e.detail.name === 'videos';
      if (v && !on) { on = true; size(); requestAnimationFrame(frame); txt.innerHTML = '<i></i>'; type(); }
      else if (!v) { on = false; clearTimeout(typeId); }
    });
    window.addEventListener('resize', function () { if (on) size(); });
  })();
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
