/* Red digital rain. Fixed behind the page; content scrolls over it. */
(function () {
  var canvas = document.getElementById('rain');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var glyphs = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789:.=*+-<>|';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var w = 0, h = 0, size = 18, cols = 0;
  var drops = [], rates = [], last = [];
  var frame = 0, timer = 0, lastTime = 0;
  var FRAME_MS = 1000 / 30; // cap at ~30fps to spare batteries

  function pick() { return glyphs.charAt((Math.random() * glyphs.length) | 0); }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    size = w < 640 ? 14 : 18;
    cols = Math.ceil(w / size);
    drops = []; rates = []; last = [];
    for (var i = 0; i < cols; i++) {
      // start spread across the screen so the rain looks full right away
      drops.push(Math.floor((Math.random() * 1.3 - 0.3) * (h / size)));
      rates.push(1 + ((Math.random() * 3) | 0)); // each column falls at its own speed
      last.push('');
    }
    ctx.fillStyle = '#060102';
    ctx.fillRect(0, 0, w, h);
    ctx.font = size + 'px monospace';
    ctx.textBaseline = 'top';
    if (reduceMotion) paintStill();
  }

  function step(force) {
    ctx.fillStyle = 'rgba(6,1,2,0.055)'; // lower = longer trails
    ctx.fillRect(0, 0, w, h);
    ctx.font = 'bold ' + size + 'px monospace';
    for (var i = 0; i < cols; i++) {
      if (!force && frame % rates[i] !== 0) continue;
      var x = i * size;
      var y = drops[i] * size;
      if (y >= 0 && y < h + size) {
        // repaint the previous head in red, then draw a new bright head
        if (last[i]) {
          ctx.fillStyle = '#ff2a35';
          ctx.fillText(last[i], x, y - size);
        }
        var ch = pick();
        ctx.fillStyle = '#ff9ca3';
        ctx.fillText(ch, x, y);
        last[i] = ch;
      }
      drops[i]++;
      if (drops[i] * size > h && Math.random() > 0.97) {
        drops[i] = 0;
        last[i] = '';
      }
    }
    frame++;
  }

  function paintStill() {
    for (var n = 0; n < 160; n++) step(true);
  }

  function loop(t) {
    timer = requestAnimationFrame(loop);
    if (t - lastTime < FRAME_MS) return;
    lastTime = t;
    step(false);
  }

  function start() {
    if (reduceMotion || timer) return;
    timer = requestAnimationFrame(loop);
  }

  function stop() {
    if (timer) cancelAnimationFrame(timer);
    timer = 0;
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else start();
  });

  resize();
  start();
})();
