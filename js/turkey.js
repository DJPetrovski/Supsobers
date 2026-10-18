/* Chip: the site's sober sidekick. Not a hosted AI model: a small, free brain that runs in the visitor's browser.
   It reads a plain-English description ("a celebrity who died and the industry covered it up"),
   works out what is being asked (topic, short or long, new, surprise me), and answers in character with a few picks.
   To rename the character, change NAME below. */
(function () {
  var NAME = 'Chip', TAG = 'your sober sidekick';
  window.SS = window.SS || {};
  var conn = { storylines: {} }, lastShown = [];
  fetch('data/connections.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).then(function (d) { if (d && d.storylines) conn = d; }).catch(function () {});

  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function pick(arr, seed) { return arr[seed % arr.length]; }
  function low(s) { return (s || '').toLowerCase(); }
  function vids() { return ((window.SS && SS.videos) || []).filter(function (v) { return /^[\w-]{11}$/.test(v.id || ''); }); }
  function titleKey(t) { return low(t).replace(/[^a-z0-9]+/g, ' ').trim(); }

  // what storyline does this video belong to, and what is its hook?
  function hookFor(v) {
    var t = low(v.title), out = null;
    ((window.SS && SS.topicDefs) || []).forEach(function (d) { if (!out && (d.match || []).some(function (k) { return t.indexOf(k) >= 0; })) out = { name: d.name, hook: (conn.storylines || {})[d.name] || '' }; });
    return out;
  }

  var FILLER = [
    /\b(dj('?s)?|petrovski|your|yours|sobering stories|sober sector|sobersector|the channel|this channel|the site|this site|the website|this website)\b/g,
    /^(hey|hi|hello|yo|sup|ok|okay|so|um|uh)[ ,!.]+/, /\b(can|could|would|will) you\b/g, /\b(please|pls)\b/g,
    /\b(i('| a)?m|i am) (looking for|in the mood for|trying to find|interested in|curious about|thinking about)\b/g,
    /\b(i want|i wanna|i('| woul)d like|i need|show|tell|give|find|get|play|recommend|suggest)( me| us)?( a| an| the| some| any)?\b/g,
    /\b(to (hear|watch|see|listen to|know))\b/g, /\b(a |the )?(story|stories|video|videos|episode|episodes|one|ones)( about| on| where| that| with| of)?\b/g,
    /\b(something|anything)( about| on| with| like)?\b/g, /\b(about|regarding|involving)\b/g,
    /\b(what|who|why|how|when|where)( (really|actually|exactly))?( (happened|happens|is|was|were|are|did|does|do|died|killed))?( (to|with|about|the|really))*\b/g, /\b(the )?(guy|man|woman|person|people|someone|one) (who|that|whose)\b/g,
    /\b(say|says|said|think|thinks|claim|claims|believe|believes)\b/g, /\b(and|or|but|that|which|was|were|is|are|it|its|they|them|their|there|then|than|so)\b/g
  ];
  function cleaned(q) { var s = low(q).replace(/[?!.,]+/g, ' ').replace(/\s+/g, ' ').trim(); FILLER.forEach(function (re) { s = s.replace(re, ' '); }); return s.replace(/\s+/g, ' ').trim(); }

  function cleanTopic(q) { return cleaned(q).replace(/\b(most popular|most viewed|most watched|top|best|biggest|favou?rites?|videos?|episodes?|ones?|popular|views?|watch(ed)?|start|new here|where|should|i|performing|people|fans|do|what)\b/g, ' ').replace(/\s+/g, ' ').trim(); }
  // read the request: intent, filters, and the topic words left over
  function parse(q, mods) {
    var s = low(q).trim(), r = { intent: 'search', short: false, long: false, newest: false, topic: '' };
    mods = mods || {};
    if (!s) return r;
    if (/^(hi|hey|hello|yo|sup|hola|howdy|good (morning|evening|afternoon))\b[ !.?]*$/.test(s)) { r.intent = 'greet'; return r; }
    if (/\b(who|what) (are|r) (you|u)\b|\byour name\b|\bwho is this\b/.test(s)) { r.intent = 'who'; return r; }
    if (/\b(what can you do|how do(es)? (this|you) work|help me|how to use)\b/.test(s)) { r.intent = 'help'; return r; }
    if (/^(thanks|thank you|thx|ty|cool|nice|awesome|great)\b[ !.]*$/.test(s)) { r.intent = 'thanks'; return r; }
    var Q = s.replace(/[?!.]+$/, '');
    if (/\b(most popular|most viewed|most watched|top (\d+ )?(videos?|episodes?|ones?)|best (performing|videos?|episodes?)|biggest videos?|fan favou?rites?|highest (views|viewed)|most views|what do (people|fans|most people) watch|where should i start|best place to start|start here|new here)\b/.test(s)) { r.intent = 'popular'; r.starter = /\b(start|new here)\b/.test(s); r.topic = cleanTopic(Q); return r; }
    if (/\b(longest|longer than any|biggest deep dive)\b/.test(s) && /\b(video|episode|one|deep dive)\b/.test(s)) { r.intent = 'longest'; return r; }
    if (/\b(shortest|quickest video)\b/.test(s)) { r.intent = 'shortest'; return r; }
    if (/\b(first|oldest|earliest)\b.*\b(video|episode|upload)\b/.test(s)) { r.intent = 'oldest'; return r; }
    if (/\bhow many\b.*\b(videos?|episodes?|deep dives?|uploads?|hours?)\b/.test(s) || /\b(how big|how much (content|stuff)) is (the|this) (site|channel|library)\b/.test(s)) { r.intent = 'count'; return r; }
    if (/\b(who|what)\b.*\b(is|are)\b.*\b(dj|petrovski|sobering stories|sober ?sector|this channel|this site)\b|\babout (dj|the channel|this (site|channel))\b|\bwho (makes|runs|made|created) (this|the)\b/.test(s)) { r.intent = 'about'; return r; }
    var PG = [[/\b(merch|shirts?|hoodies?|hats?|stickers?|store|shop|buy|clothing)\b/, 'merch', 'Merch', 'Shirts, hoodies and more live in the Merch shop.'], [/\b(members?|patreon|join|uncensored)\b/, 'members', 'Members Club', 'The uncensored cuts live in the Members Club.'], [/\b(archive|charlie kirk|september 10|sept 10|sep 10)\b/, 'archives', 'Archives', 'The Charlie Kirk September 10 archive lives in Archives, with timeline, grid, list and web views.'], [/\b(contact|email|reach|message|business inquir)/, 'contact', 'Contact', 'You can reach DJ from the Contact page.'], [/\b(game|games|craving|kraving|play)\b/, 'craving', 'Kraving Killer', 'The games are in Kraving Killer, built for when a craving hits.'], [/\b(social|instagram|tiktok|twitter|rumble|spotify|podcast|follow)\b/, 'socials', 'Socials', 'All the socials and the podcast are on the Socials page.']];
    for (var pi = 0; pi < PG.length; pi++) if (PG[pi][0].test(s) && /\b(where|how do i|how can i|can i|link|find|get|where's|wheres|is there|do you have|buy|join|follow|contact|reach)\b/.test(s)) { r.intent = 'page'; r.page = PG[pi]; return r; }
    if (/\b(surprise me|random|roll the dice|pick (one|for me)|you choose|anything good|dealer'?s choice)\b/.test(s)) r.intent = 'surprise';
    if (/\b(newest|latest|most recent|just (came out|dropped|uploaded|posted)|brand new|new(er)? (video|upload|episode)s?|what'?s new)\b/.test(s) || mods.newest) r.newest = true;
    if (/\b(short|quick|brief|fast|bite[- ]?sized|under (an|1|one) hour|not (too )?long|on my (lunch|break)|few minutes)\b/.test(s) || mods.short) r.short = true;
    if (/\b(long|deep dive|binge|marathon|hours?|full[- ]length|in[- ]depth|big one|all night)\b/.test(s) || mods.long) r.long = true;
    if (/\b(members?|uncensored|parental)\b/.test(s)) r.members = true;
    var topic = cleaned(s).replace(/\b(newest|latest|most recent|short|quick|brief|long|deep dive|binge|marathon|surprise me|random|new)\b/g, ' ').replace(/\s+/g, ' ').trim();
    r.topic = topic;
    if (r.intent === 'search' && !topic && (r.newest || r.short || r.long)) r.intent = 'browse';
    if (r.intent === 'search' && !topic) r.intent = 'surprise';
    return r;
  }

  function secs(v) { return v.seconds || 0; }
  function dedupe(list) { var seen = {}; return list.filter(function (r) { var k = titleKey(r.v.title); if (seen[k]) return false; seen[k] = 1; return true; }); }

  var STOPW = /^(a|an|the|of|to|in|on|and|or|but|that|which|who|what|why|how|was|were|is|are|it|its|they|them|their|there|then|than|so|for|with|from|by|at|as|up|out|about|into|over|been|be|had|has|have|did|does|do|not|no|yes|me|my|i|you|your|we|us|he|she|him|her|his|hers)$/;
  function friendlyWhy(r, topic) {
    var w = (r.why || [])[0] || '', t = low(r.v.title);
    var m = /^means the same as "(.+)"$/.exec(w) || /^related: "(.+)"$/.exec(w);
    if (r.snip) return 'Said in this one' + (r.at ? ' (' + Math.floor(r.at / 60) + ':' + ('0' + Math.floor(r.at % 60)).slice(-2) + ')' : '') + ': \u201c' + r.snip.slice(0, 110).trim() + '\u2026\u201d';
    var hit = (topic || '').split(' ').filter(function (x) { return x.length > 2 && !STOPW.test(x) && t.indexOf(x.replace(/(ing|ed|es|s)$/, '')) >= 0; });
    if (hit.length) return 'Title mentions \u201c' + hit.slice(0, 2).join('\u201d and \u201c') + '\u201d.';
    if (/^same storyline: (.+)$/.test(w)) return 'Same rabbit hole: ' + /^same storyline: (.+)$/.exec(w)[1] + '.';
    if (m) return 'Close to what you described (\u201c' + m[1] + '\u201d).';
    return '';
  }

  var HELLO = [
    'Hey, I\u2019m ' + NAME + ', ' + TAG + '. One day clean of bad takes, and I\u2019m not counting past that. Tell me what story you\u2019re in the mood for.',
    NAME + ' here, like the little coin, but with opinions. Describe the story and I\u2019ll find the rabbit hole.',
    'Pull up a chair. I\u2019m ' + NAME + ' and I\u2019ve read every title on this channel twice. What are you after?'
  ];
  var FOUND = [
    'Okay, I dug through the rabbit hole. These fit:',
    'One day at a time, and today\u2019s picks look like this:',
    'Handing you these like a 24-hour chip:',
    'Fresh out of the rabbit hole:',
    'Found a few. Recovery not guaranteed, curiosity is:'
  ];
  var NONE = [
    'I came up empty, which is rarer than a sober Tuesday on TV. Try different words, or say \u201csurprise me\u201d.',
    'Nothing for that one. Describe it another way, like who it\u2019s about or what happened, and I\u2019ll try again.'
  ];
  var SURPRISE = ['Closing my eyes and pointing at the wall of videos\u2026', 'Dealer\u2019s choice. Here\u2019s what I\u2019m grabbing:', 'Rolling the dice. No refunds:'];
  var BROWSE = ['Fresh off the press:', 'Here\u2019s what fits:'];

  /* ask(text, mods) -> { kind, text, picks:[{v, why, hook, at}], chips:[{label, mod}] } */
  function ask(q, mods) {
    var all = vids(), r = parse(q, mods), seed = hash(low(q) + JSON.stringify(mods || {}));
    var out = { kind: r.intent, name: NAME, text: '', picks: [], chips: [] };
    if (r.intent === 'greet') { out.text = pick(HELLO, seed); out.chips = examples(); return out; }
    if (r.intent === 'who') { out.text = 'I’m ' + NAME + ', ' + TAG + '. I’m not a hosted AI model. I’m a small free brain that lives in your browser and reads this whole site: every video title, the storylines, and the transcripts as they come in. Describe a story and I’ll find the ones that fit.'; out.chips = examples(); return out; }
    if (r.intent === 'help') { out.text = 'Describe the story you want in your own words: “a celebrity who died and people say it was covered up”, “something short about the CIA”, “newest”, or “surprise me”. I’ll pull a few and tell you why they fit.'; out.chips = examples(); return out; }
    if (r.intent === 'thanks') { out.text = 'Anytime. I’ll be here, one day at a time.'; out.chips = examples(); return out; }
    function fmtViews(n) { return n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n); }
    function mk(list, why) { return list.map(function (v) { return { v: v, why: typeof why === 'function' ? why(v) : why || '', hook: '', at: 0, mins: v.seconds ? Math.round(v.seconds / 60) : 0 }; }); }
    var chan = all.filter(function (v) { return !v.audiobook; });
    if (r.intent === 'popular') {
      var withV = chan.filter(function (v) { return v.views > 0; });
      if (!withV.length) { out.kind = 'answer'; out.text = 'I can\u2019t see view counts right now, so I can\u2019t rank by popularity. Here are the newest instead:'; out.picks = mk(chan.slice(0, 3), ''); return out; }
      var list = withV;
      if (r.topic) { var m = dedupe(SS.smart(r.topic, withV)).filter(function (x) { return x.s >= 6.5; }).map(function (x) { return x.v; }); if (m.length) list = m; else out.pre = 'Nothing popular matched \u201c' + r.topic + '\u201d, so here are the overall favorites. '; }
      list = list.slice().sort(function (a, b) { return b.views - a.views; });
      var seenT = {}; list = list.filter(function (v) { var k = titleKey(v.title); if (seenT[k]) return false; seenT[k] = 1; return true; });
      var n = Math.min(5, list.length);
      out.kind = 'answer'; out.text = (out.pre || '') + (r.starter ? 'Starting here? These are the ones the most people have watched:' : (r.topic && !out.pre ? 'The most-watched on that:' : 'The most-watched videos on the channel:'));
      out.picks = mk(list.slice(0, n), function (v) { return fmtViews(v.views) + ' views'; }); out.chips = [{ label: 'Newest', q: 'newest' }, { label: 'Surprise me', q: 'surprise me' }]; return out;
    }
    if (r.intent === 'longest' || r.intent === 'shortest' || r.intent === 'oldest') {
      var pool2 = chan.filter(function (v) { return v.seconds > 0; });
      var sorted = r.intent === 'oldest' ? chan.slice().sort(function (a, b) { return (a.published || '').localeCompare(b.published || ''); }) : pool2.slice().sort(function (a, b) { return r.intent === 'longest' ? b.seconds - a.seconds : a.seconds - b.seconds; });
      var one = sorted[0]; if (one) { out.kind = 'answer'; out.text = r.intent === 'longest' ? 'The longest one on the channel (' + Math.round(one.seconds / 60) + ' minutes). Bring snacks:' : r.intent === 'shortest' ? 'The shortest on the channel:' : 'The oldest one I can see on the channel:'; out.picks = mk([one], ''); return out; }
    }
    if (r.intent === 'count') {
      var hrs = Math.round(chan.reduce(function (n, v) { return n + (v.seconds || 0); }, 0) / 3600);
      out.kind = 'answer'; out.text = 'There are ' + chan.length + ' videos in the public library, about ' + hrs + ' hours of deep dives' + (SS.hasTranscripts && SS.hasTranscripts() ? ', and I can search what\u2019s said inside the ones with transcripts so far' : '') + '.'; out.chips = [{ label: 'Most popular', q: 'most popular videos' }, { label: 'Newest', q: 'newest' }]; return out;
    }
    if (r.intent === 'about') {
      out.kind = 'answer'; out.text = 'DJ Petrovski makes Sobering Stories (@Sobersector on YouTube): long-form deep dives into the stories behind the headlines. This site is the home for all of it, plus the archives, games, merch and the Members Club.'; out.link = { label: 'Open the About page', route: 'about' }; out.chips = [{ label: 'Most popular', q: 'most popular videos' }, { label: 'Where should I start', q: 'where should I start' }]; return out;
    }
    if (r.intent === 'page') {
      out.kind = 'answer'; out.text = r.page[3]; out.link = { label: 'Open ' + r.page[2], route: r.page[1] }; return out;
    }
    if (r.members) { out.text = 'The uncensored cuts live in the Members Club. They’re labeled (PARENTAL ADVISORY) and sit behind the join button there.'; out.link = { label: 'Open the Members Club', route: 'members' }; return out; }

    var pool = all.slice(), res = [];
    if (r.intent === 'search') {
      var topicQ = r.topic || q;
      res = dedupe(SS.smart(topicQ, pool)).filter(function (x) { return x.s >= 6.5 || (x.s >= 3.5 && x.why.length); });
    } else if (r.intent === 'browse' || r.intent === 'surprise') {
      var base = pool.slice();
      if (r.intent === 'surprise') { base.sort(function () { return Math.random() - 0.5; }); }
      res = dedupe(base.map(function (v) { return { v: v, s: 1, why: [], at: 0, snip: '', kind: 'match' }; }));
    }
    var note = '';
    if ((r.short || r.long) && res.length) {
      var top = res[0].s, strong = res.filter(function (x) { return x.s >= top * 0.6; });
      var sub = strong.filter(function (x) { return r.short ? (secs(x.v) > 0 && secs(x.v) <= 3600) : secs(x.v) >= 5400; });
      if (!sub.length && r.short) sub = strong.filter(function (x) { return secs(x.v) > 0 && secs(x.v) <= 5400; });
      if (sub.length) res = sub; else { res = strong; note = r.short ? 'Nothing short on that, so these are the closest (they run long).' : 'Nothing that long on that, so these are the closest.'; }
    }
    if (r.newest) res = res.slice().sort(function (a, b) { return (b.v.published || '').localeCompare(a.v.published || ''); });
    // mix it up when someone asks again: skip what was just shown
    var fresh = res.filter(function (x) { return lastShown.indexOf(x.v.id) < 0; });
    if (mods && mods.another && fresh.length >= 1) res = fresh;
    res = res.slice(0, 3);
    if (!res.length && r.intent === 'search') {            // try each important word on its own before giving up
      var ws = (r.topic || q).split(/\s+/).filter(function (w) { return w.length > 3 && !STOPW.test(w); }), seenW = {};
      ws.forEach(function (w) { dedupe(SS.smart(w, pool)).filter(function (x) { return x.s >= 10; }).slice(0, 3).forEach(function (x) { if (!seenW[x.v.id]) { seenW[x.v.id] = 1; res.push(x); } }); });
      res.sort(function (a, b) { return b.s - a.s; });
      if (res.length) note = 'I couldn\u2019t find that exact thing, but these touch parts of it:';
    }
    if (!res.length) { out.kind = 'none'; out.text = pick(NONE, seed); out.chips = examples(); return out; }

    var usedHooks = {};
    out.picks = res.map(function (x) {
      var h = hookFor(x.v), hook = '';
      if (h && h.hook && !usedHooks[h.name]) { hook = h.hook; usedHooks[h.name] = 1; }
      return { v: x.v, why: friendlyWhy(x, r.topic), hook: hook, at: x.at || 0, mins: x.v.seconds ? Math.round(x.v.seconds / 60) : 0 };
    });
    lastShown = out.picks.map(function (p) { return p.v.id; });
    out.text = note || pick(r.intent === 'surprise' ? SURPRISE : r.intent === 'browse' ? BROWSE : FOUND, seed);
    out.chips = [{ label: 'Another one', mod: { another: 1 } }, { label: 'Shorter', mod: { short: 1 } }, { label: 'Longer', mod: { long: 1 } }, { label: 'Newest first', mod: { newest: 1 } }];
    return out;
  }
  function examples() {
    return [{ label: 'a celebrity death that smells like a cover up', q: 'a celebrity death that smells like a cover up' }, { label: 'something short about the CIA', q: 'something short about the CIA' }, { label: 'newest', q: 'newest' }, { label: 'surprise me', q: 'surprise me' }];
  }
  SS.turkey = { name: NAME, tag: TAG, ask: ask, parse: parse, examples: examples };
})();
