/* Cold Turkey: the site's sober sleuth. Not a hosted AI model: a small, free brain that runs in the visitor's browser.
   It reads a plain-English description ("a celebrity who died and the industry covered it up"),
   works out what is being asked (topic, short or long, new, surprise me), and answers in character with a few picks.
   To rename the character, change NAME below. */
(function () {
  var NAME = 'Cold Turkey', TAG = 'your sober sleuth';
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
    /^(hey|hi|hello|yo|sup|ok|okay|so|um|uh)[ ,!.]+/, /\b(can|could|would|will) you\b/g, /\b(please|pls)\b/g,
    /\b(i('| a)?m|i am) (looking for|in the mood for|trying to find|interested in|curious about|thinking about)\b/g,
    /\b(i want|i wanna|i('| woul)d like|i need|show|tell|give|find|get|play|recommend|suggest)( me| us)?( a| an| the| some| any)?\b/g,
    /\b(to (hear|watch|see|listen to|know))\b/g, /\b(a |the )?(story|stories|video|videos|episode|episodes|one|ones)( about| on| where| that| with| of)?\b/g,
    /\b(something|anything)( about| on| with| like)?\b/g, /\b(about|regarding|involving)\b/g,
    /\b(what|who|why|how|when|where)( (really|actually|exactly))?( (happened|happens|is|was|were|are|did|does|do|died|killed))?( (to|with|about|the|really))*\b/g, /\b(the )?(guy|man|woman|person|people|someone|one) (who|that|whose)\b/g,
    /\b(say|says|said|think|thinks|claim|claims|believe|believes)\b/g, /\b(and|or|but|that|which|was|were|is|are|it|its|they|them|their|there|then|than|so)\b/g
  ];
  function cleaned(q) { var s = low(q).replace(/[?!.,]+/g, ' ').replace(/\s+/g, ' ').trim(); FILLER.forEach(function (re) { s = s.replace(re, ' '); }); return s.replace(/\s+/g, ' ').trim(); }

  // read the request: intent, filters, and the topic words left over
  function parse(q, mods) {
    var s = low(q).trim(), r = { intent: 'search', short: false, long: false, newest: false, topic: '' };
    mods = mods || {};
    if (!s) return r;
    if (/^(hi|hey|hello|yo|sup|hola|howdy|good (morning|evening|afternoon))\b[ !.?]*$/.test(s)) { r.intent = 'greet'; return r; }
    if (/\b(who|what) (are|r) (you|u)\b|\byour name\b|\bwho is this\b/.test(s)) { r.intent = 'who'; return r; }
    if (/\b(what can you do|how do(es)? (this|you) work|help me|how to use)\b/.test(s)) { r.intent = 'help'; return r; }
    if (/^(thanks|thank you|thx|ty|cool|nice|awesome|great)\b[ !.]*$/.test(s)) { r.intent = 'thanks'; return r; }
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
    'Hey, I’m ' + NAME + ', ' + TAG + '. I’ve been off bad takes for 0 days. Tell me what kind of story you’re in the mood for.',
    NAME + ' here. Describe the story, I’ll find the rabbit hole. One episode at a time.',
    'Pull up a chair. I’m ' + NAME + ', and I’ve read every title on this channel (I skip the long ones, sorry). What are you after?'
  ];
  var FOUND = [
    'Okay, I dug through the rabbit hole. These fit:',
    'One day at a time, and today’s picks look like this:',
    'Sponsor-approved. Rabbit hole not included:',
    'Cold. Hard. Search results:',
    'Found a few. No relapses, just rabbit holes:'
  ];
  var NONE = [
    'I came up empty, which is rarer than a sober Tuesday on TV. Try different words, or say “surprise me”.',
    'Nothing for that one. Describe it another way, like who it’s about or what happened, and I’ll try again.'
  ];
  var SURPRISE = ['Closing my eyes and pointing at the wall of videos…', 'Dealer’s choice. Here’s what I’m grabbing:', 'Roll the dice. No refunds:'];
  var BROWSE = ['Fresh off the press:', 'Here’s what fits:'];

  /* ask(text, mods) -> { kind, text, picks:[{v, why, hook, at}], chips:[{label, mod}] } */
  function ask(q, mods) {
    var all = vids(), r = parse(q, mods), seed = hash(low(q) + JSON.stringify(mods || {}));
    var out = { kind: r.intent, name: NAME, text: '', picks: [], chips: [] };
    if (r.intent === 'greet') { out.text = pick(HELLO, seed); out.chips = examples(); return out; }
    if (r.intent === 'who') { out.text = 'I’m ' + NAME + ', ' + TAG + '. I’m not a hosted AI model. I’m a small free brain that lives in your browser and reads this whole site: every video title, the storylines, and the transcripts as they come in. Describe a story and I’ll find the ones that fit.'; out.chips = examples(); return out; }
    if (r.intent === 'help') { out.text = 'Describe the story you want in your own words: “a celebrity who died and people say it was covered up”, “something short about the CIA”, “newest”, or “surprise me”. I’ll pull a few and tell you why they fit.'; out.chips = examples(); return out; }
    if (r.intent === 'thanks') { out.text = 'Anytime. I’ll be here, one day at a time.'; out.chips = examples(); return out; }
    if (r.members) { out.text = 'The uncensored cuts live in the Members Club. They’re labeled (PARENTAL ADVISORY) and sit behind the join button there.'; out.link = { label: 'Open the Members Club', route: 'members' }; return out; }

    var pool = all.slice(), res = [];
    if (r.intent === 'search') {
      var topicQ = r.topic || q;
      res = dedupe(SS.smart(topicQ, pool)).filter(function (x) { return x.s >= 3.5; });
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
