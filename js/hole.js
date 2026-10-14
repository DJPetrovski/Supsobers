/* The rabbit hole: a round tunnel whose walls are the channel's videos.
   Newest videos are at the top of the hole, older ones the deeper you fall.
   Pure CSS 3D plus a small animation loop. No libraries. */
(function (global) {
  'use strict';

  var ID_RE = /^[\w-]{11}$/;
  var reduce = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function placeholders(count) {
    var out = [];
    for (var i = 0; i < count; i++) out.push({ id: '', title: 'Sample video ' + pad(i + 1) });
    return out;
  }

  function create(opts) {
    var scene = opts.scene;
    var world = opts.world;
    var titleEl = opts.titleEl;
    var onPick = opts.onPick || function () {};
    var onHold = opts.onHold || null, onRelease = opts.onRelease || null;   // long press: open a branch of connected videos
    var HOLD_MS = 520, holdTimer = 0, holding = false, holdNode = null;
    var ambient = !!opts.ambient;   // background mode: slow, no hover, no clicks
    var root = scene.parentNode;
    var videos = (opts.videos && opts.videos.length) ? opts.videos : placeholders(12);

    var small = global.innerWidth < 700 || (navigator.deviceMemory && navigator.deviceMemory <= 2);
    var N = small ? 6 : 8;      // tiles around the wall
    var K = small ? 6 : 7;       // rings of tiles along the hole
    var TILT = 52;   // 90 = flat on the wall, 0 = facing you. Upright and readable, still a tunnel.
    var CRUISE = reduce ? 0 : (ambient ? 40 : 55); // px per second. Slow enough to read what you pass.

    var rings = [], W = 0, H = 0, R = 0, tw = 0, th = 0, spacing = 0, loop = 0, P = 0;
    var z0 = 0, roll = 0, speed = 0, manual = 0, boost = 0;
    var paused = false, held = false, hovering = false, running = false;
    var raf = 0, last = 0, mx = 0, my = 0, ax = 0, ay = 0, lookX = 0, lookY = 0, lastLook = 0, startX = 0, lastX = 0;
    var dragMoved = false, startY = 0, lastY = 0;

    function showTitle(v, idx) {
      if (!titleEl) return;
      titleEl.textContent = v ? (v.title || ('Video ' + pad(idx + 1))) : '';
    }

    var hl = null;   // optional filter: tiles whose video fails it are dimmed, matches glow
    function setVideo(node, v, idx) {
      node.__v = v; node.__idx = idx;
      var hit = hl ? !!(v && hl(v)) : null; node.classList.toggle('hl-dim', hit === false); node.classList.toggle('hl-hit', hit === true);
      var img = node.firstChild, ph = node.lastChild;
      if (v && ID_RE.test(v.id || '')) {
        img.src = 'https://i.ytimg.com/vi/' + v.id + '/hqdefault.jpg';
        img.style.display = '';
        ph.style.display = 'none';
        node.setAttribute('aria-label', v.title || 'Video');
      } else {
        img.removeAttribute('src');
        img.style.display = 'none';
        ph.style.display = '';
        ph.textContent = 'Video ' + pad(idx + 1);
        node.setAttribute('aria-label', (v && v.title) || ('Video ' + pad(idx + 1)));
      }
    }

    function makeTile() {
      var b = el('button', 'hole-tile');
      b.type = 'button';
      b.tabIndex = -1;
      var img = el('img'); img.alt = ''; img.draggable = false; img.decoding = 'async';
      var ph = el('div', 'hole-ph');
      b.appendChild(img); b.appendChild(ph);
      b.addEventListener('click', function () { if (!ambient && !dragMoved && b.__v) onPick(b.__v); });
      b.addEventListener('pointerenter', function (e) {
        if (ambient || e.pointerType !== 'mouse') return;
        hovering = true; showTitle(b.__v, b.__idx);
        if (opts.onHover) opts.onHover(b.__v, b);
      });
      b.addEventListener('pointerleave', function (e) {
        if (ambient || e.pointerType !== 'mouse') return;
        hovering = false; showTitle(null);
        if (opts.onHoverEnd) opts.onHoverEnd();
      });
      return b;
    }

    // The tile at slot i of a ring shows video (seq * N + i), wrapping around the list.
    function assign(rg) {
      for (var i = 0; i < rg.items.length; i++) {
        var raw = rg.seq * N + i;
        var idx = ((raw % videos.length) + videos.length) % videos.length;
        setVideo(rg.items[i].node, videos[idx], idx);
      }
    }

    world.setAttribute('aria-hidden', 'true');
    for (var j = 0; j < K; j++) {
      var rg = { j: j, seq: K - 1 - j, d: null, items: [] };
      for (var i = 0; i < N; i++) {
        var node = makeTile();
        world.appendChild(node);
        rg.items.push({ node: node, ang: i * 360 / N + j * (360 / N) * 0.4 });
      }
      assign(rg);
      rings.push(rg);
    }

    function layout() {
      W = root.clientWidth || global.innerWidth;
      H = root.clientHeight || global.innerHeight;
      R = Math.min(W, H) * (W < 700 ? 0.34 : 0.43);   // phones: a narrower tunnel so the hole in the middle stays visible, not a pile
      th = 2 * Math.PI * R / N / 1.75;
      tw = th * 16 / 9;
      spacing = tw * (W < 700 ? 1.7 : 1.25);
      loop = spacing * K;
      P = Math.max(W, H) * 0.95;
      scene.style.perspective = Math.round(P) + 'px';
      rings.forEach(function (rg) {
        rg.items.forEach(function (it) {
          var s = it.node.style;
          s.width = tw + 'px'; s.height = th + 'px';
          s.marginLeft = (-tw / 2) + 'px'; s.marginTop = (-th / 2) + 'px';
        });
      });
    }

    function render() {
      world.style.transform = 'rotateX(' + ay.toFixed(2) + 'deg) rotateY(' + ax.toFixed(2) + 'deg) rotateZ(' + roll.toFixed(2) + 'deg)';
      for (var j = 0; j < rings.length; j++) {
        var rg = rings[j];
        var d = (((j * spacing + z0) % loop) + loop) % loop;
        if (rg.d !== null) {
          if (rg.d - d > loop / 2) { rg.seq += K; assign(rg); }        // fell past the camera, now far ahead
          else if (d - rg.d > loop / 2) { rg.seq -= K; assign(rg); }   // climbing back up
        }
        rg.d = d;
        var z = d - loop + P * 0.7;
        var o = 1;
        if (d < loop * 0.3) o = d / (loop * 0.3);
        if (z > P * 0.1) o = Math.min(o, 1 - (z - P * 0.1) / (P * 0.5));
        o = clamp(o, 0, 1);
        var vis = o > 0.02, live = o > 0.5;
        for (var i = 0; i < rg.items.length; i++) {
          var it = rg.items[i], s = it.node.style;
          s.transform = 'translate3d(0,0,' + z.toFixed(1) + 'px) rotateZ(' + it.ang.toFixed(1) + 'deg) translateX(' + R.toFixed(1) + 'px) rotateY(-' + TILT + 'deg) rotateZ(-' + it.ang.toFixed(1) + 'deg)';
          s.opacity = o.toFixed(2);
          s.visibility = vis ? 'visible' : 'hidden';
          if (!ambient) s.pointerEvents = live ? 'auto' : 'none';
        }
      }
    }

    function tick(t) {
      raf = requestAnimationFrame(tick);
      var dt = Math.min(0.05, ((t - last) / 1000) || 0);
      last = t;
      manual *= Math.max(0, 1 - dt * 1.1);
      boost *= Math.max(0, 1 - dt * 1.4);
      var still = paused || held || hovering;
      var target = still ? 0 : CRUISE + manual + boost;
      speed += (target - speed) * Math.min(1, dt * (still ? 5 : 2.2));
      z0 = (z0 + speed * dt) % loop;
      
      if (!dragging && t - lastLook > 2500) { lookX *= Math.max(0, 1 - dt * 0.5); lookY *= Math.max(0, 1 - dt * 0.5); }
      ax += (lookX + mx * 4 - ax) * Math.min(1, dt * 6);
      ay += (lookY - my * 3 - ay) * Math.min(1, dt * 6);
      render();
    }

    function onWheel(e) {
      e.preventDefault();
      manual = clamp(manual + e.deltaY * 0.5, -300, 900);
    }
    var dragging = false;
    function endHold() { clearTimeout(holdTimer); if (holdNode) holdNode.classList.remove('holding'); holdNode = null; }
    function onDown(e) {
      dragMoved = false; dragging = true; startY = lastY = e.clientY; startX = lastX = e.clientX;
      endHold();
      var tileEl = e.target.closest ? e.target.closest('.hole-tile') : null;
      if (onHold && tileEl && tileEl.__v) {
        holdNode = tileEl;
        var touchHold = e.pointerType && e.pointerType !== 'mouse' && opts.onTouchHold;
        holdTimer = setTimeout(function () {
          if (dragMoved || !holdNode) return;
          // finger: press and hold plays a preview right where the video is (a plain tap still opens it)
          if (touchHold) {
            dragMoved = true;   // swallow the click that follows the release
            opts.onTouchHold(holdNode.__v, holdNode, function (on) { hovering = !!on; if (!on) showTitle(null); });
            hovering = true; showTitle(holdNode.__v, holdNode.__idx);
            holdNode.classList.add('holding'); var hn = holdNode; setTimeout(function () { hn.classList.remove('holding'); }, 300);
            return;
          }
          holding = true;
          var r = holdNode.getBoundingClientRect();
          holdNode.classList.add('holding');
          onHold(holdNode.__v, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
        }, HOLD_MS);
      }
    }
    function onUp() {
      dragging = false;
      var wasHolding = holding;
      endHold();
      if (wasHolding) { holding = false; setTimeout(function () { dragMoved = false; }, 0); dragMoved = true; if (onRelease) onRelease(); }
    }
    function onMove(e) {
      if (e.pointerType === 'mouse' && !dragging) {
        var r = root.getBoundingClientRect();
        mx = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1);
        my = clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1);
        return;
      }
      if (!dragging || holding) return;
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 8) { dragMoved = true; endHold(); }
      if (dragMoved) {
        lookX = clamp(lookX + dx * 0.16, -42, 42);
        lookY = clamp(lookY - dy * 0.12, -28, 28);
        lastLook = performance.now();
      }
      lastX = e.clientX; lastY = e.clientY;
    }
    function onResize() { if (running) { layout(); render(); } }
    function onVisibility() {
      if (document.hidden) { cancelAnimationFrame(raf); }
      else if (running) { last = performance.now(); raf = requestAnimationFrame(tick); }
    }

    if (!ambient) {
      root.addEventListener('wheel', onWheel, { passive: false });
      root.addEventListener('pointerdown', onDown);
      root.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      root.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }
    global.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);

    return {
      start: function (o) {
        boost = (o && o.boost) || 0;
        speed = boost; manual = 0; hovering = false; paused = false; held = false;
        showTitle(null);
        layout(); render();
        if (!running) {
          running = true;
          if (!(reduce && ambient)) {   // reduced motion: draw one still frame, no loop
            last = performance.now();
            raf = requestAnimationFrame(tick);
          }
        }
      },
      stop: function () { running = false; cancelAnimationFrame(raf); },
      highlight: function (fn) { hl = fn || null; rings.forEach(assign); },
      setPaused: function (b) { paused = !!b; },
      isPaused: function () { return paused; },
      hold: function (b) { held = !!b; },
      nudge: function (v) { manual = clamp(manual + v, -300, 900); },
      setVideos: function (list) {
        videos = (list && list.length) ? list : placeholders(12);
        rings.forEach(function (rg, j) { rg.seq = K - 1 - j; rg.d = null; assign(rg); });
        z0 = 0; lookX = lookY = 0;
      }
    };
  }

  global.HoleTunnel = { create: create };
})(window);
