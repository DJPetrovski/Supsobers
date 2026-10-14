/* The red pill / blue pill figure: DJ holding out a pill in each hand. Each pill is a real button
   that grows out of the hand when you point at it. Used at the bottom of the rabbit hole and as the
   pop-up when the trailer ends. */
(function () {
  'use strict';
  var IMG = 'img/pill-figure.webp';

  // Build the figure inside `el`. onPick(kind, event) is called with 'red' or 'blue'.
  function build(el, opts) {
    opts = opts || {};
    el.classList.add('pillfig');
    el.innerHTML =
      '<img class="pillfig-img" src="' + IMG + '" alt="DJ holding out a blue pill and a red pill" draggable="false">' +
      '<span class="pillfig-grain" aria-hidden="true"></span>' +
      '<button type="button" class="pp pp-blue" data-kind="blue" aria-label="Blue pill: stay in Wonderland"><i class="gem"></i><span class="pp-cap">Stay in Wonderland</span></button>' +
      '<button type="button" class="pp pp-red" data-kind="red" aria-label="Red pill: see how far this rabbit hole goes"><i class="gem"></i><span class="pp-cap">See how far this rabbit hole goes</span></button>';
    Array.prototype.forEach.call(el.querySelectorAll('.pp'), function (b) {
      b.addEventListener('click', function (e) { if (opts.onPick) opts.onPick(b.getAttribute('data-kind'), e); });
    });
    return { start: function () {}, stop: function () {} };
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
