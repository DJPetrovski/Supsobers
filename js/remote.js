/* A remote you can arrange: drag it to the other side of the TV (the TV slides over to make room), move it down,
   make it bigger or smaller, or hide it. The choice is remembered on this device. */
(function () {
  var rig = document.getElementById('home-rig'), remote = document.getElementById('remote'), grip = document.getElementById('rm-grip'), showBtn = document.getElementById('rm-show');
  if (!rig || !remote || !grip) return;
  var KEY = 'ss.remote', DEF = { side: 'right', dy: 0, scale: 1, hidden: false };
  var st = (function () { try { var o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o) return Object.assign({}, DEF, o); } catch (e) {} return Object.assign({}, DEF); })();
  var mq = window.matchMedia('(max-width: 760px)'), reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function clampDy(v) { return Math.max(-60, Math.min(260, v)); }
  function clampScale(v) { return Math.max(0.55, Math.min(1.35, v)); }

  function apply() {
    var mobile = mq.matches;
    rig.classList.toggle('remote-left', st.side === 'left' && !mobile);
    remote.classList.toggle('is-off', st.hidden);
    showBtn.hidden = !st.hidden;
    remote.style.setProperty('--rs', st.scale.toFixed(2));
    remote.style.setProperty('--ry', (mobile ? 0 : st.dy) + 'px');
  }
  // slide the TV (and remote) from where they were to where they are now
  function flip(change) {
    var els = [rig.querySelector('.tv') && rig.querySelector('.tv').parentNode !== rig ? rig.querySelector('.tv').parentNode : rig.querySelector('.tv'), remote].filter(Boolean);
    var before = els.map(function (e) { return e.getBoundingClientRect(); });
    change();
    if (reduce) return;
    els.forEach(function (e, i) {
      var a = before[i], b = e.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
      if ((Math.abs(dx) > 1 || Math.abs(dy) > 1) && e.animate && e !== remote) e.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  }

  /* ----- drag by the grip ----- */
  var drag = null;
  grip.addEventListener('pointerdown', function (e) {
    if (mq.matches || e.button > 0) return;
    drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
    grip.setPointerCapture(e.pointerId);
  });
  grip.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!drag.moved) { drag.moved = true; remote.classList.add('dragging'); closeMenu(); }
    remote.style.setProperty('--dx', dx + 'px'); remote.style.setProperty('--dy', dy + 'px');
  });
  function endDrag(e) {
    if (!drag) return;
    var d = drag; drag = null;
    try { grip.releasePointerCapture(d.id); } catch (x) {}
    if (!d.moved) { toggleMenu(); return; }
    var dy = e.clientY - d.y, tv = rig.querySelector('.tv'), tr = tv.getBoundingClientRect(), mid = tr.left + tr.width / 2;
    var side = e.clientX < mid ? 'left' : 'right';
    flip(function () {
      remote.classList.remove('dragging'); remote.style.removeProperty('--dx'); remote.style.removeProperty('--dy');
      st.side = side; st.dy = clampDy(st.dy + dy); apply();
    });
    save();
  }
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', function () { drag = null; remote.classList.remove('dragging'); remote.style.removeProperty('--dx'); remote.style.removeProperty('--dy'); });
  grip.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMenu(); } });

  /* ----- the little options menu ----- */
  var menu = null;
  function btn(label, fn, cls) { var b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (cls) b.className = cls; b.addEventListener('click', function () { fn(); }); return b; }
  function change(fn) { flip(function () { fn(); apply(); }); save(); }
  function buildMenu() {
    menu = document.createElement('div'); menu.className = 'rm-menu'; menu.setAttribute('role', 'menu'); menu.hidden = true;
    var row1 = document.createElement('div'), row2 = document.createElement('div');
    if (!mq.matches) {
      row1.appendChild(btn('← Left', function () { change(function () { st.side = 'left'; }); }));
      row1.appendChild(btn('Right →', function () { change(function () { st.side = 'right'; }); }));
      row1.appendChild(btn('↑', function () { change(function () { st.dy = clampDy(st.dy - 40); }); }, 'sq'));
      row1.appendChild(btn('↓', function () { change(function () { st.dy = clampDy(st.dy + 40); }); }, 'sq'));
      menu.appendChild(row1);
    }
    row2.appendChild(btn('Smaller', function () { change(function () { st.scale = clampScale(st.scale - 0.12); }); }));
    row2.appendChild(btn('Bigger', function () { change(function () { st.scale = clampScale(st.scale + 0.12); }); }));
    menu.appendChild(row2);
    var row3 = document.createElement('div');
    row3.appendChild(btn('Hide remote', function () { closeMenu(); change(function () { st.hidden = true; }); }));
    row3.appendChild(btn('Reset', function () { change(function () { st.side = 'right'; st.dy = 0; st.scale = 1; st.hidden = false; }); }));
    menu.appendChild(row3);
    document.body.appendChild(menu);
  }
  function placeMenu() {
    var r = grip.getBoundingClientRect(), w = menu.offsetWidth || 220;
    menu.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    menu.style.top = Math.min(innerHeight - menu.offsetHeight - 8, r.bottom + 8) + 'px';
  }
  function openMenu() { if (menu) menu.remove(); buildMenu(); menu.hidden = false; placeMenu(); grip.setAttribute('aria-expanded', 'true'); }
  function closeMenu() { if (menu) { menu.remove(); menu = null; } grip.setAttribute('aria-expanded', 'false'); }
  function toggleMenu() { if (menu) closeMenu(); else openMenu(); }
  document.addEventListener('pointerdown', function (e) { if (menu && !menu.contains(e.target) && e.target !== grip) closeMenu(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  document.addEventListener('ss:route', closeMenu);
  window.addEventListener('scroll', function () { if (menu) placeMenu(); }, { passive: true });
  window.addEventListener('resize', function () { closeMenu(); apply(); });

  showBtn.addEventListener('click', function () { change(function () { st.hidden = false; }); });
  apply();
})();
