/* Sup Sobers: tabs, thumbnail wall, video grid, archives, books. No dependencies. */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var ID_RE = /^[\w-]{11}$/;

  function el(tag, attrs, kids) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (kid) { if (kid) node.appendChild(kid); });
    return node;
  }

  function getJSON(path) {
    return fetch(path, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(path + ' ' + r.status);
      return r.json();
    });
  }

  /* ---------- tabs ---------- */
  var views = Array.prototype.slice.call(document.querySelectorAll('[data-view]'));
  var links = Array.prototype.slice.call(document.querySelectorAll('#nav a'));
  var titles = { home: 'Sup Sobers | Sobering Stories', videos: 'Videos | Sup Sobers', archives: 'Archives | Sup Sobers', books: 'Books | Sup Sobers', about: 'About | Sup Sobers' };

  function route() {
    var name = (location.hash || '#home').slice(1);
    if (!titles[name]) name = 'home';
    views.forEach(function (v) { v.hidden = v.getAttribute('data-view') !== name; });
    links.forEach(function (a) {
      if (a.getAttribute('data-route') === name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.title = titles[name];
    window.scrollTo(0, 0);
    document.dispatchEvent(new CustomEvent('ss:route', { detail: { name: name } }));
  }
  window.addEventListener('hashchange', route);

  /* ---------- player ---------- */
  var dlg = $('#player');
  var frame = $('#player-iframe');

  function openPlayer(v) {
    if (!v || !ID_RE.test(v.id || '')) return;
    frame.src = 'https://www.youtube-nocookie.com/embed/' + v.id + '?autoplay=1&rel=0';
    frame.title = v.title || 'Video';
    $('#player-yt').href = 'https://www.youtube.com/watch?v=' + v.id;
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else window.open('https://www.youtube.com/watch?v=' + v.id, '_blank', 'noopener');
  }
  function closePlayer() {
    frame.src = 'about:blank';
    if (dlg.open) dlg.close();
  }
  $('#player-close').addEventListener('click', closePlayer);
  dlg.addEventListener('close', function () {
    frame.src = 'about:blank';
    document.dispatchEvent(new Event('ss:playerclosed'));
  });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) closePlayer(); });

  window.SS = { videos: [], openPlayer: openPlayer };

  /* ---------- tiles ---------- */
  function tile(v, index, hiddenCopy) {
    var real = ID_RE.test(v.id || '');
    var face = real
      ? el('img', { src: 'https://i.ytimg.com/vi/' + v.id + '/hqdefault.jpg', alt: '', loading: 'lazy' })
      : el('div', { 'class': 'ph', text: 'Video ' + (index + 1 < 10 ? '0' : '') + (index + 1) });
    var btn = el('button', { type: 'button', 'class': 'tile', 'aria-label': v.title || 'Video' }, [
      face,
      el('span', { 'class': 'cap', text: v.title || '' })
    ]);
    if (hiddenCopy) { btn.setAttribute('tabindex', '-1'); btn.setAttribute('aria-hidden', 'true'); }
    btn.addEventListener('click', function () {
      if (real) openPlayer(v);
      else window.open('https://www.youtube.com/@Sobersector', '_blank', 'noopener');
    });
    return btn;
  }

  /* ---------- video grid + search ---------- */
  function buildGrid(videos) {
    var grid = $('#video-grid');
    var empty = $('#video-empty');
    var input = $('#search');

    function paint(list) {
      grid.textContent = '';
      list.forEach(function (v, i) { grid.appendChild(tile(v, i, false)); });
      empty.hidden = list.length > 0;
    }
    paint(videos);
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      paint(q ? videos.filter(function (v) { return (v.title || '').toLowerCase().indexOf(q) !== -1; }) : videos);
    });
  }

  /* ---------- archives + books ---------- */
  function buildCards(hostSel, items, emptySel) {
    var host = $(hostSel);
    host.textContent = '';
    if (!items.length) { if (emptySel) $(emptySel).hidden = false; return; }
    items.forEach(function (it) {
      var kids = [el('h3', { text: it.title || '' })];
      if (it.meta) kids.push(el('p', { 'class': 'meta', text: it.meta }));
      if (it.description) kids.push(el('p', { text: it.description }));
      if (it.url) {
        kids.push(el('a', { 'class': 'btn btn-primary', href: it.url, target: '_blank', rel: 'noopener', text: it.cta || 'Open' }));
      } else if (it.status) {
        kids.push(el('p', { 'class': 'status', text: it.status }));
      }
      host.appendChild(el('article', { 'class': 'card' }, kids));
    });
  }

  /* ---------- boot ---------- */
  $('#year').textContent = new Date().getFullYear();
  route();

  getJSON('data/videos.json').then(function (d) {
    var vids = (d.videos || []).slice();
    window.SS.videos = vids;
    window.SS.ready = true;
    document.dispatchEvent(new Event('ss:videos'));
    buildGrid(vids);
  }).catch(function () {
    window.SS.ready = true;
    document.dispatchEvent(new Event('ss:videos'));
    $('#video-empty').textContent = 'Videos could not load. Refresh the page to try again.';
    $('#video-empty').hidden = false;
  });

  getJSON('data/archives.json').then(function (d) { buildCards('#archive-list', d.archives || []); })
    .catch(function () { buildCards('#archive-list', []); });

  getJSON('data/books.json').then(function (d) { buildCards('#book-list', d.books || [], '#book-empty'); })
    .catch(function () { buildCards('#book-list', [], '#book-empty'); });
})();
