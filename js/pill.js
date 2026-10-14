/* The red pill / blue pill TV: grainy black-and-white static, a cloaked
   stranger in sunglasses holding out two pills. Used at the bottom of the
   rabbit hole and as a pop-up when the trailer ends. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var SHOW_FIGURE = false; // flip to true once the new character image is in
  var PHOTO = 'img/pill-dj.png'; // optional head-and-shoulders cutout; drop one in and it is used

  function figureSVG() {
    return '' +
      '<svg class="pf" viewBox="0 8 240 250" xmlns="' + NS + '" aria-hidden="true">' +
      '<defs>' +
        '<radialGradient id="pg-r" cx="35%" cy="30%"><stop offset="0" stop-color="#ff9aa0"/><stop offset="1" stop-color="#d1000f"/></radialGradient>' +
        '<radialGradient id="pg-b" cx="35%" cy="30%"><stop offset="0" stop-color="#9ec8ff"/><stop offset="1" stop-color="#0a3fd6"/></radialGradient>' +
        '<linearGradient id="pg-c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2a2a"/><stop offset="1" stop-color="#050505"/></linearGradient>' +
      '</defs>' +
      '<g class="pf-bw">' +
        // cloak
        '<path d="M120 118 C70 122 38 150 24 214 L8 300 L232 300 L216 214 C202 150 170 122 120 118 Z" fill="url(#pg-c)" stroke="#555" stroke-width="1.5"/>' +
        '<path d="M120 124 L98 150 L120 300 L142 150 Z" fill="#000" opacity=".85"/>' +
        '<path d="M86 126 L120 168 L154 126 L142 118 L120 140 L98 118 Z" fill="#111" stroke="#666" stroke-width="1"/>' +
        // head
        '<g class="pf-head">' +
          '<ellipse cx="120" cy="82" rx="30" ry="38" fill="#9a9a9a"/>' +
          '<image class="pf-photo" href="' + PHOTO + '" x="70" y="14" width="100" height="115" preserveAspectRatio="xMidYMid meet" hidden="hidden"/>' +
          '<path d="M90 70 C92 40 148 40 150 70 C140 56 100 56 90 70 Z" fill="#161616"/>' +
          '<path d="M104 104 C112 120 128 120 136 104 C128 112 112 112 104 104 Z" fill="#3a3a3a" opacity=".7"/>' +
        '</g>' +
        // sunglasses
        '<g class="pf-shades">' +
          '<rect x="92" y="74" width="26" height="15" rx="6" fill="#000" stroke="#777" stroke-width="1"/>' +
          '<rect x="122" y="74" width="26" height="15" rx="6" fill="#000" stroke="#777" stroke-width="1"/>' +
          '<rect x="116" y="78" width="8" height="3" fill="#000"/>' +
          '<path d="M96 77 L108 77 M126 77 L138 77" stroke="#fff" stroke-width="1.6" opacity=".55"/>' +
        '</g>' +
        // arms
        '<path d="M70 168 C46 190 26 205 14 214 L28 232 C46 226 66 214 88 198 Z" fill="#0b0b0b" stroke="#555" stroke-width="1.2"/>' +
        '<path d="M170 168 C194 190 214 205 226 214 L212 232 C194 226 174 214 152 198 Z" fill="#0b0b0b" stroke="#555" stroke-width="1.2"/>' +
        '<ellipse cx="22" cy="222" rx="15" ry="9" fill="#8c8c8c"/>' +
        '<ellipse cx="218" cy="222" rx="15" ry="9" fill="#8c8c8c"/>' +
      '</g>' +
      '<g class="pf-pill pf-red"><ellipse cx="26" cy="204" rx="21" ry="11" fill="url(#pg-r)" transform="rotate(-25 26 204)"/></g>' +
      '<g class="pf-pill pf-blue"><ellipse cx="214" cy="204" rx="21" ry="11" fill="url(#pg-b)" transform="rotate(25 214 204)"/></g>' +
      '</svg>';
  }
  var uid = 0;
  function pillsSVG() {
    var u = 'u' + (++uid);
    return ( '<svg class="pf pf-only" viewBox="0 0 240 180" xmlns="' + NS + '" aria-hidden="true"><defs>' +
      '<radialGradient id="pp-r' + u + '" cx="35%" cy="28%"><stop offset="0" stop-color="#ffb0b5"/><stop offset=".45" stop-color="#ff2a35"/><stop offset="1" stop-color="#7a000a"/></radialGradient>' +
      '<radialGradient id="pp-b' + u + '" cx="35%" cy="28%"><stop offset="0" stop-color="#b8d4ff"/><stop offset=".45" stop-color="#3d7bff"/><stop offset="1" stop-color="#06217a"/></radialGradient></defs>' +
      '<g class="pf-pill pf-red" style="color:#ff2a35"><rect x="12" y="62" width="96" height="46" rx="23" fill="url(#pp-r' + u + ')" transform="rotate(-24 60 85)"/><path d="M30 76 C44 66 64 62 84 64" stroke="#fff" stroke-opacity=".6" stroke-width="3" fill="none" stroke-linecap="round" transform="rotate(-24 60 85)"/></g>' +
      '<g class="pf-pill pf-blue" style="color:#3d7bff"><rect x="132" y="72" width="96" height="46" rx="23" fill="url(#pp-b' + u + ')" transform="rotate(24 180 95)"/><path d="M150 86 C164 76 184 72 204 74" stroke="#fff" stroke-opacity=".6" stroke-width="3" fill="none" stroke-linecap="round" transform="rotate(24 180 95)"/></g>' +
      '</svg>');
  }

  // Build the TV inside `el`. Returns {start, stop}.
  function build(el) {
    el.classList.add('pilltv');
    el.innerHTML =
      '<div class="pilltv-body"><div class="pilltv-screen">' +
        '<canvas class="pilltv-static" width="120" height="90"></canvas>' + (SHOW_FIGURE ? figureSVG() : pillsSVG()) +
        '<span class="pilltv-scan"></span>' +
      '</div><span class="pilltv-knob"></span><span class="pilltv-knob k2"></span></div>';
    var cv = el.querySelector('canvas'), ctx = cv.getContext('2d');
    var img = new Image();
    img.onload = function () { var p = el.querySelector('.pf-photo'); if (p) { p.removeAttribute('hidden'); el.classList.add('has-photo'); } };
    img.src = PHOTO;
    var raf = 0, last = 0, data = ctx.createImageData(cv.width, cv.height);
    function frame(t) {
      raf = requestAnimationFrame(frame);
      if (t - last < 70) return;
      last = t;
      var d = data.data;
      for (var i = 0; i < d.length; i += 4) { var v = (Math.random() * 190) | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
      ctx.putImageData(data, 0, 0);
    }
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    return {
      start: function () { if (reduce) { frame(1000); cancelAnimationFrame(raf); raf = 0; return; } if (!raf) raf = requestAnimationFrame(frame); },
      stop: function () { cancelAnimationFrame(raf); raf = 0; }
    };
  }

  // Red pill = the deep end (elite, cover-ups, MK-Ultra, 9/11, the big conspiracies).
  // Blue pill = the lighter trip: celebrity stories, true crime, recovery talk.
  var RED = /illuminati|bloodline|elite|billionaire|epstein|9\/11|mk-?ultra|manchurian|mind control|cia\b|deep state|cover-?up|assassin|lone assassin|nasa|apollo|jfk|pizzagate|gate program|kubrick|trafficking|propaganda|machine|matrix|altman|ticks|how many of you|reiner|they don't want|not telling|supposed to see|official|hidden|secret|gene hack|crimes against|only the beginning|wild bill|freedom or safety|time speeding|eating people|laundering|podesta|a plant|crime scene|erika kirk|charlie kirk|tmz|jim carrey|ozzy|elvis|alive|eclipse|wilcock|eskridge|ossebaard/i;
  var SKIP = /monetiz|paid me|open discussion|live (analysis|updates)|trial (day|memorial)|^day \d|day \d+[- ]|updates? &|recap|hearing|pro se|portrait|sober talk|pretrial|courtroom/i;
  function pool(kind) {
    var all = (window.SS && SS.videos || []).filter(function (v) { return /^[\w-]{11}$/.test(v.id || '') && !SKIP.test(v.title || ''); });
    var red = all.filter(function (v) { return RED.test(v.title || ''); });
    var blue = all.filter(function (v) { return !RED.test(v.title || ''); });
    var out = kind === 'blue' ? blue : red;
    return out.length ? out : all;
  }
  // A different video every time: prefers ones not seen recently.
  function random(kind) {
    var all = pool(kind || 'red');
    if (!all.length) return null;
    var key = 'ss-pill-' + (kind || 'red'), seen = [];
    try { seen = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) {}
    var fresh = all.filter(function (v) { return seen.indexOf(v.id) < 0; });
    if (!fresh.length) { seen = seen.slice(-1); fresh = all.filter(function (v) { return seen.indexOf(v.id) < 0; }); }
    var v = fresh[Math.floor(Math.random() * fresh.length)];
    seen.push(v.id);
    try { localStorage.setItem(key, JSON.stringify(seen.slice(-400))); } catch (e) {}
    return v;
  }

  window.Pill = { build: build, random: random };
})();
