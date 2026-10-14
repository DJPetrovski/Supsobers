/* The remote's voice mode: talk or type what you want and the site does it. Runs entirely in the browser (free):
   it understands navigation, "play / find / search ...", "surprise me", the newest video, social links, "more like this".
   If data/assistant.json has an "endpoint", anything it cannot answer is sent there (a Claude-powered helper). */
(function () {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition, synth = window.speechSynthesis;
  var cfg = { endpoint: '' }, history = [], rec = null, listening = false, voiceTurn = false;
  fetch('data/assistant.json').then(function (r) { return r.json(); }).then(function (d) { cfg = d || cfg; }).catch(function () {});
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function go(r) { if (location.hash === '#' + r) window.scrollTo(0, 0); else location.hash = r; }
  function vids() { return (window.SS && SS.videos) || []; }

  /* ---------- the panel ---------- */
  var panel = el('div', 'as'); panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Voice assistant');
  var head = el('div', 'as-head'); head.appendChild(el('b', '', 'Ask the remote'));
  var close = el('button', 'as-x', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close'); head.appendChild(close);
  var log = el('div', 'as-log'); log.setAttribute('aria-live', 'polite');
  var foot = el('form', 'as-foot'); foot.setAttribute('novalidate', '');
  var mic = el('button', 'as-mic'); mic.type = 'button'; mic.setAttribute('aria-label', 'Talk');
  mic.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var input = el('input'); input.type = 'text'; input.placeholder = 'Say or type what you want'; input.autocomplete = 'off'; input.maxLength = 200; input.setAttribute('aria-label', 'Ask');
  var send = el('button', 'as-send', 'Go'); send.type = 'submit';
  if (SR) foot.appendChild(mic); foot.appendChild(input); foot.appendChild(send);
  panel.appendChild(head); panel.appendChild(log); panel.appendChild(foot); document.body.appendChild(panel);

  function say(text, voice) {
    var b = el('div', 'as-bot', text); log.appendChild(b); log.scrollTop = log.scrollHeight;
    if (voice && synth) { try { synth.cancel(); var u = new SpeechSynthesisUtterance(text); u.rate = 1.02; synth.speak(u); } catch (e) {} }
    return b;
  }
  function me(text) { log.appendChild(el('div', 'as-me', text)); log.scrollTop = log.scrollHeight; }
  function chips(items) {
    var w = el('div', 'as-chips');
    items.forEach(function (it) {
      var b = el(it.href ? 'a' : 'button', 'as-chip', it.label);
      if (it.href) { b.href = it.href; b.target = '_blank'; b.rel = 'noopener'; } else { b.type = 'button'; b.addEventListener('click', function () { it.run(); }); }
      w.appendChild(b);
    });
    log.appendChild(w); log.scrollTop = log.scrollHeight;
  }
  // suggested searches: the site's own storylines (Diddy, Epstein...), a random handful each time
  function topicChips(n) {
    var defs = ((window.SS && SS.topicDefs) || []).filter(function (d) { return d.match && d.match.length; });
    if (!defs.length) return;
    defs = defs.slice().sort(function () { return Math.random() - .5; }).slice(0, n || 6);
    chips(defs.map(function (d) { var k = d.match[0]; return { label: d.name, run: function () { voiceTurn = false; handle('search ' + k); } }; }));
  }
  function vrows(list) {
    var w = el('div', 'as-rows');
    list.slice(0, 5).forEach(function (v) {
      var b = el('button', 'as-row'); b.type = 'button';
      if (/^[\w-]{11}$/.test(v.id || '')) { var im = el('img'); im.src = 'https://i.ytimg.com/vi/' + v.id + '/mqdefault.jpg'; im.alt = ''; im.loading = 'lazy'; b.appendChild(im); }
      b.appendChild(el('span', '', v.title)); b.addEventListener('click', function () { closePanel(); SS.openPlayer(v); }); w.appendChild(b);
    });
    log.appendChild(w); log.scrollTop = log.scrollHeight;
  }

  /* ---------- understanding what was said ---------- */
  var PAGES = [
    ['videos', /\b(videos?|episodes?|the tv|rabbit hole|tunnel)\b/], ['web', /\b(connected|web|map|connections?)\b/], ['merch', /\b(merch|merchandise|shirts?|hoodies?|hats?|stickers?|store|shop)\b/],
    ['members', /\b(members?|club|uncensored)\b/], ['archives', /\barchives?\b/], ['books', /\b(books?|audiobooks?)\b/], ['socials', /\b(socials?|social media|links)\b/],
    ['craving', /\b(cravings?|games?|etch|sketch|maze|play a game|bored)\b/], ['contact', /\b(contact|email|message|reach)\b/], ['about', /\b(about|who is dj|who are you)\b/], ['home', /\b(home|start|main page)\b/], ['half', /\b(kim|better half|fiance|fiancée)\b/]
  ];
  var LINKS = { youtube: 'https://www.youtube.com/@Sobersector', patreon: 'https://patreon.com/SoberingStories', instagram: 'https://instagram.com/djpetrovski', discord: 'https://discord.gg/ycsn67W5UB', rumble: 'https://rumble.com/user/djpetrovski', spotify: 'https://open.spotify.com/show/7cuV8tDi2Gdw66upnljFIs', twitter: 'https://x.com/djpetrovski12', soundcloud: 'https://soundcloud.com/djpetrovski' };
  function clean(t) { return (t || '').toLowerCase().replace(/[^a-z0-9'&\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function pickRandom() { var a = vids().filter(function (v) { return /^[\w-]{11}$/.test(v.id || '') && (v.seconds || 0) >= 1800; }); return a[Math.floor(Math.random() * a.length)]; }
  function webLinks(q) { return [{ label: 'Search YouTube', href: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q) }, { label: 'Search the web', href: 'https://duckduckgo.com/?q=' + encodeURIComponent(q) }]; }

  function handle(raw) {
    var t = clean(raw), v = voiceTurn; if (!t) return;
    me(raw); history.push({ role: 'user', content: raw });
    var reply = function (txt) { history.push({ role: 'assistant', content: txt }); return say(txt, v); };
    var now = window.SS && SS.now;

    if (/\b(stop|pause|turn off|shut off|kill|mute|end|quit)\b.*\b(music|tunes|songs?|soundcloud|mix(es)?|player)\b|\b(music|tunes|soundcloud)\b.*\b(off|stop)\b/.test(t)) {
      if (SS.closeMusic) SS.closeMusic(); reply('Music stopped.'); return;
    }
    if (/\b(suggest|suggestions|ideas?|what should i (search|watch|look)|what can i search|search terms?|topics?|where (do|should) i start)\b/.test(t)) {
      reply('Tap one to search the videos:'); topicChips(8); return;
    }
    if (/^(help|what can you do|what can i say|commands)\b/.test(t)) {
      reply('Try: "play something random", "show me the newest video", "go to merch", "search Diddy", "more like this", "open Instagram", "play some music", "stop the music", or "contact". Or tap a topic below.'); topicChips(6);
      return;
    }
    if (/\b(random|surprise me|something to watch|cant decide|can't decide|pick (one|something)|anything)\b/.test(t)) {
      var r = pickRandom(); if (r) { reply('Here is one. ' + r.title); closePanel(); SS.openPlayer(r); } else reply('The videos are still loading. Try again in a second.'); return;
    }
    if (/\b(newest|latest|most recent|new video|just came out)\b/.test(t)) {
      var n = vids().filter(function (x) { return /^[\w-]{11}$/.test(x.id || ''); })[0]; if (n) { reply('The newest is ' + n.title); closePanel(); SS.openPlayer(n); } else reply('Still loading. Try again in a second.'); return;
    }
    if (now && /\b(more like this|similar|related|what next|what else|keep going)\b/.test(t)) {
      var rel = SS.related(now, 6); reply(rel.length ? 'More connected to "' + now.title + '":' : 'Nothing else is connected to this one yet.'); if (rel.length) vrows(rel); return;
    }
    if (/\b(what is this|what's this|about this|summary|context|tell me about)\b/.test(t) && now && !/\b(site|website|channel)\b/.test(t)) {
      var rel2 = SS.related(now, 4); reply('This is "' + now.title + '". I cannot read the video itself, but here are the videos it connects to, and you can look up more:'); if (rel2.length) vrows(rel2); chips(webLinks(now.title)); return;
    }
    if (/\b(music|mixes|mix|soundcloud|house music|play (some )?(music|house)|dj set|tunes|songs?)\b/.test(t) && !/\b(open|link)\b.*\bsoundcloud\b/.test(t)) { reply('Opening the music player. Use the buttons under it to skip around.'); closePanel(); if (SS.openMusic) SS.openMusic(); return; }
    var soc = Object.keys(LINKS).filter(function (k) { return new RegExp('\\b' + k + '\\b').test(t) || (k === 'twitter' && /\bx\b/.test(t)); })[0];
    if (soc && /\b(open|go|show|take|link|follow|join|where|find)\b/.test(t) && !/\bsearch\b/.test(t)) {
      reply('Here is my ' + soc[0].toUpperCase() + soc.slice(1) + ' link.'); chips([{ label: 'Open ' + soc[0].toUpperCase() + soc.slice(1), href: LINKS[soc] }]); return;
    }
    if (/\b(who is dj|who are you|what is this (site|website|channel|place)|about (the )?(site|website|channel))\b/.test(t)) {
      reply('This is Sup Sobers, the home of the Sobering Stories YouTube channel: deep dives on true crime, conspiracies and the dark side of fame. Pick a video, follow a storyline, or ask me to find something.');
      chips([{ label: 'About page', run: function () { closePanel(); go('about'); } }]); return;
    }
    if (/^(go|open|take me|show me|show|bring up|navigate|head)\b/.test(t) || t.split(' ').length <= 2) {
      for (var i = 0; i < PAGES.length; i++) if (PAGES[i][1].test(t)) { var dest = PAGES[i][0]; reply('Taking you to ' + (dest === 'web' ? 'It\'s All Connected' : dest === 'half' ? 'My Better Half' : dest) + '.'); closePanel(); go(dest); return; }
    }
    var q = t.replace(/^(please |hey |ok |okay )+/, '').replace(/^(play|watch|find|search( for)?|look (up|for)|show me|i want to (watch|see)|can you (find|play))\s+/, '').replace(/^(a |an |the |some |any )/, '');
    var res = window.SS && SS.searchAll ? SS.searchAll(q) : null;
    var hits = res ? res.videos.map(function (x) { return x.v; }) : [];
    if (hits.length) {
      var wantsPlay = /^(play|watch|put on|i want to (watch|see))/.test(t);
      if (wantsPlay || hits.length === 1) { reply('Playing "' + hits[0].title + '".'); closePanel(); SS.openPlayer(hits[0]); return; }
      reply('Found ' + hits.length + ' video' + (hits.length === 1 ? '' : 's') + ' for "' + q + '". Here are the best:'); vrows(hits);
      if (res.merch.length) chips([{ label: res.merch.length + ' merch match' + (res.merch.length > 1 ? 'es' : ''), run: function () { closePanel(); SS.openSearch(q); } }]);
      return;
    }
    if (res && (res.merch.length || res.story.length || res.more.length || res.ab.length)) {
      reply('No videos match, but I found other things on the site.'); chips([{ label: 'See results for "' + q + '"', run: function () { closePanel(); SS.openSearch(q); } }]); return;
    }
    if (cfg.endpoint) {
      var wait = say('Thinking...', false);
      fetch(cfg.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: raw, history: history.slice(-8), page: (location.hash || '#home').slice(1), video: now ? { id: now.id, title: now.title } : null }) })
        .then(function (r) { return r.json(); }).then(function (d) { wait.remove(); reply(d.reply || 'I could not come up with an answer.'); (d.links || []).length && chips(d.links.slice(0, 4).map(function (l) { return { label: l.label || l.url, href: l.url }; })); })
        .catch(function () { wait.remove(); reply('I could not reach the helper right now.'); chips(webLinks(q)); });
      return;
    }
    reply('I did not find "' + q + '" on the site. Try one of these topics, or I can look it up on the web:'); topicChips(5); chips(webLinks(q));
  }

  /* ---------- listening ---------- */
  var paused = [], retried = false;
  function hush() { paused = []; Array.prototype.forEach.call(document.querySelectorAll('audio,video'), function (m) { if (!m.paused && !m.muted) { try { m.pause(); paused.push(m); } catch (e) {} } }); }
  function unhush() { paused.forEach(function (m) { try { m.play(); } catch (e) {} }); paused = []; }
  function idle() { listening = false; mic.classList.remove('on'); input.placeholder = 'Say or type what you want'; }
  function stopListen() { if (rec) { try { rec.abort(); } catch (e) {} } idle(); unhush(); }
  var ERR = {
    'not-allowed': 'The microphone is blocked for this site. Click the lock icon next to the address, allow Microphone, then tap the mic again. Or just type.',
    'service-not-allowed': 'Your browser blocked speech recognition here. You can type instead.',
    'audio-capture': 'I could not find a working microphone. Check that one is plugged in and selected, or type instead.',
    'network': 'The browser\'s speech service could not connect. Check your internet, tap the mic to retry, or type.',
    'no-speech': 'I did not hear anything. Tap the mic and start talking right after it lights up.',
    'language-not-supported': 'Speech recognition is not available for this language. You can type instead.'
  };
  function listen(fromRetry) {
    if (!SR) { say('Voice is not supported in this browser. Type instead (Chrome, Edge or Safari can do voice).', false); return; }
    if (listening) { stopListen(); return; }
    try { if (synth) synth.cancel(); } catch (e) {}
    if (fromRetry !== true) retried = false;
    var finalText = '', gotAudio = false, errored = false, t0 = Date.now();
    rec = new SR(); rec.lang = (navigator.language || 'en-US'); rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
    rec.onstart = function () { listening = true; mic.classList.add('on'); input.value = ''; input.placeholder = 'Listening... speak now'; };
    rec.onaudiostart = function () { gotAudio = true; };
    rec.onresult = function (e) { var s = ''; for (var i = e.resultIndex; i < e.results.length; i++) { s += e.results[i][0].transcript; if (e.results[i].isFinal) finalText = s; } input.value = s; };
    rec.onerror = function (e) { errored = true; idle(); unhush(); if (e.error === 'aborted') return; say(ERR[e.error] || ('Voice stopped (' + e.error + '). Tap the mic to try again, or type.'), false); };
    rec.onend = function () {
      var was = listening; idle(); unhush();
      var t = (finalText || input.value).trim();
      if (t) { input.value = ''; voiceTurn = true; handle(t); return; }
      if (errored) return;
      // closed with no words and no error: usually the mic was grabbed by something else a split second after starting. Try once more.
      if (!retried && Date.now() - t0 < 2500) { retried = true; setTimeout(function () { listen(true); }, 300); return; }
      say(gotAudio ? 'I did not catch any words. Tap the mic and try again.' : 'The mic would not open. Check the browser permission for this site and that no other app is using the microphone, then tap the mic again. You can also type.', false);
    };
    hush();
    try { rec.start(); } catch (e) { idle(); unhush(); say('Could not start the microphone: ' + (e.message || e.name) + '. Tap the mic again or type.', false); }
  }
  mic.addEventListener('click', function () { listen(); });
  foot.addEventListener('submit', function (e) { e.preventDefault(); var t = input.value.trim(); if (!t) return; input.value = ''; voiceTurn = false; handle(t); });

  function openPanel(autoListen) {
    if (window.SS && SS.closeSearch) SS.closeSearch();
    panel.hidden = false; document.documentElement.classList.add('as-open');
    if (!log.childNodes.length) {
      say(SR ? 'Tap the mic and tell me what you want, or type it. Say "help" for ideas.' : 'Type what you want. (Voice needs Chrome, Edge or Safari.) Say "help" for ideas.', false);
      chips([{ label: 'Surprise me', run: function () { voiceTurn = false; handle('surprise me'); } }, { label: 'Newest video', run: function () { voiceTurn = false; handle('newest video'); } }, { label: 'Merch', run: function () { voiceTurn = false; handle('go to merch'); } }]);
      say('Not sure what to search? Try one of these:', false); topicChips(6);
    }
    if (autoListen && SR) listen(); else input.focus();
  }
  function closePanel() { stopListen(); try { if (synth) synth.cancel(); } catch (e) {} panel.hidden = true; document.documentElement.classList.remove('as-open'); }
  close.addEventListener('click', closePanel);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) closePanel(); });
  var nb = document.getElementById('nav-voice'); if (nb) nb.addEventListener('click', function () { openPanel(true); });
  window.SS = window.SS || {}; SS.openAssistant = openPanel; SS.closeAssistant = closePanel;
})();
