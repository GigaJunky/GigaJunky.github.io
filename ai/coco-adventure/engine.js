/* Graphic Text Adventure engine.
 * Loads an adventure described entirely by JSON (see FORMAT.md) and runs it.
 * No DOM access here: the UI feeds commands in and receives text + picture specs out.
 */
(function (global) {
  'use strict';

  const DIRS = {
    n: 'north', north: 'north', s: 'south', south: 'south', e: 'east', east: 'east',
    w: 'west', west: 'west', ne: 'northeast', northeast: 'northeast', nw: 'northwest',
    northwest: 'northwest', se: 'southeast', southeast: 'southeast', sw: 'southwest',
    southwest: 'southwest', u: 'up', up: 'up', d: 'down', down: 'down',
    in: 'in', inside: 'in', out: 'out', outside: 'out'
  };
  const DIR_ORDER = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'up', 'down', 'in', 'out'];

  const ARTICLES = new Set(['the', 'a', 'an', 'some', 'my', 'please']);
  const PREPS = new Set(['in', 'into', 'inside', 'on', 'onto', 'with', 'to', 'at', 'from', 'under', 'using', 'through', 'over', 'behind', 'about']);

  // canonical verb -> synonyms. Adventures can extend this with "verbs".
  const BASE_VERBS = {
    go: ['walk', 'run', 'travel', 'head', 'proceed', 'crawl'],
    look: ['l'],
    examine: ['x', 'inspect', 'check', 'describe', 'study', 'observe'],
    take: ['get', 'grab', 'carry', 'pick', 'hold', 'steal', 'collect'],
    drop: ['discard', 'release', 'abandon'],
    inventory: ['i', 'inv', 'invent'],
    open: [], close: ['shut'], unlock: [], lock: [],
    put: ['place', 'insert', 'stuff', 'set', 'lay'],
    read: ['peruse', 'decipher'],
    light: ['ignite', 'kindle', 'burn'],
    extinguish: ['unlight', 'douse', 'snuff', 'quench'],
    wait: ['z'],
    score: [], help: ['hint', 'hints', '?', 'commands'], save: [], restore: ['load'],
    restart: [], undo: [], again: ['g'], quit: ['q'],
    attack: ['kill', 'hit', 'fight', 'stab', 'slay', 'strike', 'murder', 'punch', 'slash'],
    eat: ['consume', 'devour'], drink: ['sip', 'quaff'],
    push: ['press', 'shove', 'move', 'shift', 'slide'], pull: ['tug', 'yank', 'drag'],
    turn: ['rotate', 'twist', 'crank', 'spin', 'wind'],
    climb: ['scale', 'ascend', 'descend'], enter: [], exit: ['leave'],
    search: ['rummage', 'frisk'], listen: ['hear'], smell: ['sniff'], touch: ['feel', 'rub', 'pat', 'stroke'],
    say: ['yell', 'shout', 'scream', 'speak', 'chant', 'utter', 'whisper', 'incant', 'recite'],
    pray: [], jump: ['leap', 'hop'], dig: ['excavate', 'shovel'], give: ['offer', 'hand', 'feed'],
    show: ['display'], throw: ['toss', 'hurl', 'chuck'], pour: ['sprinkle', 'splash', 'empty', 'spill'],
    fill: [], wave: ['brandish', 'shake'], ring: ['toll'], break: ['smash', 'shatter', 'destroy', 'wreck'],
    tie: ['attach', 'fasten', 'knot'], untie: ['unfasten', 'unknot'], kick: [], sleep: ['rest', 'nap'],
    wear: ['don'], remove: ['doff'], knock: ['bang', 'rap'], swim: ['wade'], free: ['release'],
    catch: ['capture', 'trap'], cut: ['snip', 'chop', 'trim'], kiss: [], wake: ['awaken', 'rouse'], xyzzy: [], plugh: []
  };
  // multi-word phrases rewritten at the start of a command
  const BASE_PHRASES = [
    ['pick up', 'take'], ['look at', 'examine'], ['look in', 'search'], ['look inside', 'search'],
    ['look into', 'search'], ['look under', 'search'], ['look behind', 'search'], ['look around', 'look'],
    ['turn on', 'light'], ['switch on', 'light'], ['turn off', 'extinguish'], ['switch off', 'extinguish'],
    ['put out', 'extinguish'], ['blow out', 'extinguish'], ['put down', 'drop'], ['set down', 'drop'],
    ['get in', 'enter'], ['get into', 'enter'], ['go in', 'enter'], ['go into', 'enter'],
    ['get out', 'exit'], ['take off', 'remove'], ['put on', 'wear'], ['climb up', 'climb up'],
    ['climb down', 'climb down'], ['go up', 'up'], ['go down', 'down'], ['talk to', 'say'], ['speak to', 'say']
  ];
  const META = new Set(['score', 'help', 'save', 'restore', 'restart', 'undo', 'again', 'quit']);
  const PARAM_KEYS = new Set(['to', 'add', 'value', 'key', 'dir', 'then', 'else']);

  const DEFAULT_MSG = {
    dark: 'It is pitch black. You can\'t see a thing.',
    noExit: 'You can\'t go that way.',
    dontKnowVerb: 'I don\'t know how to "{word}".',
    dontKnowWord: 'I don\'t know the word "{word}".',
    notHere: 'You don\'t see any {word} here.',
    cantDo: 'You can\'t do that.',
    nothingHappens: 'Nothing happens.',
    taken: 'Taken.', dropped: 'Dropped.',
    fixed: 'That\'s firmly fixed in place.',
    alreadyHave: 'You already have that.',
    notCarrying: 'You aren\'t carrying that.',
    tooMuch: 'Your load is too heavy. You\'ll have to drop something first.',
    emptyHanded: 'You are empty-handed.',
    died: '*** You have died ***',
    won: '*** You have won ***',
    over: 'The game is over. Type RESTART, RESTORE or UNDO.'
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const arr = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const andList = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

  class Game {
    constructor(adv, opts = {}) {
      this.adv = adv;
      this.opts = opts;
      this.out = opts.output || ((t, cls) => console.log(t));
      this.storage = opts.storage || null;
      this.msg = Object.assign({}, DEFAULT_MSG, adv.messages || {});
      this.id = adv.id || String(adv.title || 'adventure').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      this._compile();
      this.history = [];
      this.lastCommand = null;
      this.lastItem = null;
    }

    // ---------- setup ----------
    _compile() {
      const adv = this.adv;
      adv.rooms = adv.rooms || {};
      adv.items = adv.items || {};
      if (!adv.start || !adv.rooms[adv.start]) throw new Error('Adventure "start" must name a room.');

      // direction words (adventures may add their own, e.g. "downstream")
      this.dirs = Object.assign({}, DIRS, adv.directions || {});
      this.dirOrder = DIR_ORDER.concat(Object.values(adv.directions || {}).filter((d) => !DIR_ORDER.includes(d)));
      // verb table
      this.verbMap = {};
      this.phrases = BASE_PHRASES.slice();
      const addVerb = (canon, syns) => {
        this.verbMap[canon] = this.verbMap[canon] || canon;
        for (const s of arr(syns)) {
          if (s.includes(' ')) this.phrases.unshift([s, canon]);
          else this.verbMap[s] = canon;
        }
      };
      for (const [v, syns] of Object.entries(BASE_VERBS)) addVerb(v, syns);
      for (const [v, syns] of Object.entries(adv.verbs || {})) addVerb(v, syns);
      this.phrases.sort((a, b) => b[0].length - a[0].length);

      // items: derive nouns/adjectives
      this.lexicon = new Set();
      for (const [id, it] of Object.entries(adv.items)) {
        const name = (it.name || id.replace(/_/g, ' ')).toLowerCase();
        it.name = it.name || name;
        const nameWords = name.split(/\s+/);
        it._nouns = arr(it.nouns).map((n) => n.toLowerCase()).concat([nameWords[nameWords.length - 1], name, id.replace(/_/g, ' ')]);
        it._adjs = arr(it.adj).map((n) => n.toLowerCase()).concat(nameWords.slice(0, -1));
        for (const w of it._nouns.concat(it._adjs)) w.split(' ').forEach((x) => this.lexicon.add(x));
      }

      // actions: global list + inline "on" handlers from items & rooms
      const actions = [];
      const fromOn = (on, base) => {
        for (const [verbs, body] of Object.entries(on || {})) {
          const b = Array.isArray(body) || typeof body === 'string' ? { do: body } : body;
          actions.push(Object.assign({}, b, base, { verb: verbs.split(/\s*,\s*/) }, b.noun !== undefined ? { noun: b.noun } : {}));
        }
      };
      for (const [id, it] of Object.entries(adv.items)) fromOn(it.on, { noun: id, _strict: true });
      for (const [id, r] of Object.entries(adv.rooms)) fromOn(r.on, { room: id });
      for (const a of adv.actions || []) actions.push(a);
      actions.forEach((a, i) => {
        a._i = i;
        a._verbs = arr(a.verb).flatMap((v) => v.split(/\s*,\s*/)).map((v) => {
          v = v.toLowerCase();
          if (this.dirs[v]) return 'go';
          if (!this.verbMap[v]) this.verbMap[v] = v; // custom verb becomes known
          return this.verbMap[v];
        });
        // "go north" style actions: verb is a direction
        const raw = arr(a.verb).flatMap((v) => v.split(/\s*,\s*/)).map((v) => v.toLowerCase());
        if (raw.some((v) => this.dirs[v]) && a.noun === undefined) a.noun = raw.map((v) => this.dirs[v]).filter(Boolean);
      });
      this.actions = actions;
      this.events = adv.events || [];
    }

    newState() {
      const s = {
        room: this.adv.start, items: {}, rooms: {}, flags: {}, vars: {}, visited: {},
        fired: {}, took: {}, deposited: {}, score: 0, turns: 0, over: null
      };
      for (const [id, it] of Object.entries(this.adv.items)) s.items[id] = { at: it.at === undefined ? null : clone(it.at) };
      for (const f of arr(this.adv.flags)) s.flags[f] = true;
      if (this.adv.flags && !Array.isArray(this.adv.flags)) Object.assign(s.flags, this.adv.flags);
      Object.assign(s.vars, this.adv.vars || {});
      return s;
    }

    start() {
      this.state = this.newState();
      this.history = [];
      if (this.adv.title) this.say(this.adv.title, 'title');
      if (this.adv.author) this.say('by ' + this.adv.author, 'byline');
      if (this.adv.intro) this.say(this.text(this.adv.intro), 'intro');
      this.enter(this.adv.start, true);
    }

    // ---------- output helpers ----------
    say(t, cls) { if (t !== undefined && t !== null && t !== '') this.out(String(t), cls); }
    m(key, word) { return (this.msg[key] || '').replace('{word}', word || ''); }
    text(v) {
      if (v === undefined || v === null) return '';
      if (Array.isArray(v)) {
        return v.map((p) => {
          if (typeof p === 'string') return p;
          if (p && p.if !== undefined) return this.check(p.if) ? this.text(p.text) : this.text(p.else);
          return '';
        }).filter(Boolean).join(' ');
      }
      if (typeof v === 'object') return v.if !== undefined ? (this.check(v.if) ? this.text(v.text) : this.text(v.else)) : '';
      return String(v).replace(/\{(\w+)(?:\.(\w+))?\}/g, (all, a, b) => {
        if (a === 'score') return this.state.score;
        if (a === 'max') return this.adv.maxScore || 0;
        if (a === 'turns') return this.state.turns;
        if (a === 'var' && b) return this.state.vars[b] || 0;
        return all;
      });
    }

    // ---------- props ----------
    item(id) { return this.adv.items[id]; }
    prop(id, key) {
      const s = this.state.items[id];
      if (s && key in s) return s[key];
      const d = this.adv.items[id];
      return d ? d[key] : undefined;
    }
    setProp(id, key, val) {
      if (!this.adv.items[id]) return console.warn('Unknown item', id);
      this.state.items[id][key] = val;
    }
    rprop(id, key) {
      const s = this.state.rooms[id];
      if (s && key in s) return s[key];
      return (this.adv.rooms[id] || {})[key];
    }
    nameOf(id) { return this.prop(id, 'name'); }
    aName(id) {
      const art = this.prop(id, 'article');
      const n = this.nameOf(id);
      if (art === '') return n;
      if (art) return art + ' ' + n;
      return (/^[aeiou]/i.test(n) ? 'an ' : 'a ') + n;
    }
    theName(id) { return this.prop(id, 'proper') ? this.nameOf(id) : 'the ' + this.nameOf(id); }

    // ---------- location / visibility ----------
    root(id) {
      let loc = this.prop(id, 'at'), closed = false, guard = 0;
      while (typeof loc === 'string' && this.adv.items[loc] && guard++ < 32) {
        if (!this.isOpen(loc) || this.prop(loc, 'hidden')) closed = true;
        loc = this.prop(loc, 'at');
      }
      return { loc, closed };
    }
    inRoom(loc, room) { return Array.isArray(loc) ? loc.includes(room) : loc === room; }
    isOpen(id) { const o = this.prop(id, 'open'); return o === undefined || !!o || !!this.prop(id, 'transparent'); }
    isCarried(id) { return this.root(id).loc === 'player'; }
    isHeld(id) { return this.isCarried(id) && !this.root(id).closed; }
    isPresent(id) { // reachable ignoring darkness
      if (this.prop(id, 'hidden')) return false;
      const r = this.root(id);
      if (r.closed) return false;
      return r.loc === 'player' || this.inRoom(r.loc, this.state.room);
    }
    isVisible(id) {
      if (!this.isPresent(id)) return false;
      return this.isCarried(id) || !this.isDark();
    }
    isDark(room = this.state.room) {
      if (!this.rprop(room, 'dark')) return false;
      for (const id in this.adv.items) {
        if (!this.prop(id, 'lit')) continue;
        const r = this.root(id);
        if (!r.closed && (r.loc === 'player' || this.inRoom(r.loc, room))) return false;
      }
      return true;
    }
    carriedCount() {
      return Object.keys(this.adv.items).filter((id) => this.prop(id, 'at') === 'player' && !this.prop(id, 'worn')).length;
    }
    contents(id) { return Object.keys(this.adv.items).filter((k) => this.prop(k, 'at') === id && !this.prop(k, 'hidden')); }
    resolveLoc(to) {
      if (to === undefined || to === null || to === 'nowhere') return null;
      if (to === 'here') return this.state.room;
      if (to === 'inventory') return 'player';
      return to;
    }

    // ---------- conditions ----------
    check(c) {
      if (c === undefined || c === null || c === true) return true;
      if (c === false) return false;
      if (Array.isArray(c)) return c.every((x) => this.check(x));
      if (typeof c === 'object') {
        if (c.any) return c.any.some((x) => this.check(x));
        if (c.all) return c.all.every((x) => this.check(x));
        if (c.not) return !this.check(c.not);
        return true;
      }
      let s = String(c).trim(), neg = false;
      if (s[0] === '!') { neg = true; s = s.slice(1); }
      const r = this.cond(s);
      return neg ? !r : r;
    }
    cond(s) {
      const i = s.indexOf(':');
      const kind = i < 0 ? s : s.slice(0, i);
      const arg = i < 0 ? '' : s.slice(i + 1);
      switch (kind) {
        case 'has': return this.isCarried(arg);
        case 'present': return this.isVisible(arg);
        case 'here': return this.isVisible(arg) && !this.isCarried(arg);
        case 'near': return this.isPresent(arg);
        case 'in': return arg.split('|').includes(this.state.room);
        case 'flag': return !!this.state.flags[arg];
        case 'var': return this.compareVar(arg);
        case 'lit': case 'open': case 'locked': case 'hidden': case 'worn': return !!this.prop(arg, kind);
        case 'at': {
          const [id, loc] = arg.split(':');
          const cur = this.prop(id, 'at');
          const want = loc === 'nowhere' ? null : loc === 'here' ? this.state.room : loc;
          return Array.isArray(cur) ? cur.includes(want) : cur === want;
        }
        case 'visited': return !!this.state.visited[arg];
        case 'first': return !this.state.visited[this.state.room];
        case 'dark': return this.isDark();
        case 'chance': return Math.random() * 100 < Number(arg);
        case 'true': return true;
        case 'false': return false;
        default: console.warn('Unknown condition', s); return false;
      }
    }
    getVar(name) {
      if (name === 'turns') return this.state.turns;
      if (name === 'score') return this.state.score;
      if (name === 'carried') return this.carriedCount();
      return this.state.vars[name] || 0;
    }
    compareVar(arg) {
      const m = arg.match(/^([\w.]+)\s*(==|!=|>=|<=|>|<|=)\s*(-?\d+)$/);
      if (!m) { console.warn('Bad var condition', arg); return false; }
      const a = this.getVar(m[1]), b = Number(m[3]);
      switch (m[2]) {
        case '==': case '=': return a === b; case '!=': return a !== b;
        case '>=': return a >= b; case '<=': return a <= b; case '>': return a > b; case '<': return a < b;
      }
      return false;
    }

    // ---------- effects ----------
    run(effects) {
      for (const e of arr(effects)) {
        if (this.state.over) return;
        if (typeof e === 'string') { this.say(this.text(e)); continue; }
        for (const k of Object.keys(e)) {
          if (PARAM_KEYS.has(k)) continue;
          this.effect(k, e[k], e);
          if (this.state.over) return;
        }
      }
    }
    effect(k, v, e) {
      const st = this.state;
      switch (k) {
        case 'say': this.say(this.text(v)); break;
        case 'set': arr(v).forEach((f) => (st.flags[f] = true)); break;
        case 'unset': arr(v).forEach((f) => delete st.flags[f]); break;
        case 'toggle': arr(v).forEach((f) => (st.flags[f] ? delete st.flags[f] : (st.flags[f] = true))); break;
        case 'var':
          if ('add' in e) st.vars[v] = (st.vars[v] || 0) + e.add;
          else st.vars[v] = e.value || 0;
          break;
        case 'move': arr(v).forEach((id) => this.setProp(id, 'at', this.resolveLoc(e.to))); break;
        case 'give': arr(v).forEach((id) => this.setProp(id, 'at', 'player')); break;
        case 'destroy': arr(v).forEach((id) => this.setProp(id, 'at', null)); break;
        case 'show': arr(v).forEach((id) => this.setProp(id, 'hidden', false)); break;
        case 'hide': arr(v).forEach((id) => this.setProp(id, 'hidden', true)); break;
        case 'swap': {
          const [a, b] = v; const la = this.prop(a, 'at');
          this.setProp(a, 'at', this.prop(b, 'at')); this.setProp(b, 'at', la); break;
        }
        case 'prop': arr(v).forEach((id) => this.setProp(id, e.key, e.value)); break;
        case 'roomProp': (st.rooms[v] = st.rooms[v] || {})[e.key] = e.value; break;
        case 'exit': {
          const r = (st.rooms[v] = st.rooms[v] || {});
          r.exits = r.exits || {};
          r.exits[this.dirs[e.dir] || e.dir] = e.to === undefined ? null : e.to;
          break;
        }
        case 'score': st.score += Number(v) || 0; break;
        case 'goto': this.enter(v); break;
        case 'look': this.describe(); break;
        case 'if': this.run(this.check(v) ? e.then : e.else); break;
        case 'random': { const opts = arr(v); this.run(opts[Math.floor(Math.random() * opts.length)]); break; }
        case 'win': this.say(this.text(v)); this.end('won'); break;
        case 'die': this.say(this.text(v)); this.end('dead'); break;
        case 'stop': break;
        default: console.warn('Unknown effect', k);
      }
    }
    end(kind) {
      this.state.over = kind;
      this.say(kind === 'won' ? this.m('won') : this.m('died'), kind === 'won' ? 'win' : 'death');
      this.say(`You scored ${this.state.score} out of ${this.adv.maxScore || 0} points in ${this.state.turns} moves.`);
      this.say('Type RESTART, RESTORE or UNDO.', 'hint');
    }

    // ---------- rooms ----------
    exitOf(room, dir) {
      const s = this.state.rooms[room];
      if (s && s.exits && dir in s.exits) return s.exits[dir];
      const ex = (this.adv.rooms[room] || {}).exits || {};
      return ex[dir];
    }
    exitList(room = this.state.room) {
      const out = [];
      for (const d of this.dirOrder) {
        const ex = this.exitOf(room, d);
        if (!ex) continue;
        if (typeof ex === 'object') {
          if (!ex.to || ex.hidden) continue;
          if (ex.showIf && !this.check(ex.showIf)) continue;
        }
        out.push(d);
      }
      return out;
    }
    enter(room, initial) {
      if (!this.adv.rooms[room]) { this.say(`[Error: no room "${room}"]`, 'error'); return; }
      this.state.room = room;
      this.describe();
      const r = this.adv.rooms[room];
      if (r.onEnter) {
        if (Array.isArray(r.onEnter) && r.onEnter.length && r.onEnter[0] && r.onEnter[0].do) {
          for (const h of r.onEnter) if (this.check(h.if)) this.run(h.do);
        } else if (r.onEnter.do) { if (this.check(r.onEnter.if)) this.run(r.onEnter.do); } else this.run(r.onEnter);
      }
      this.state.visited[room] = true;
    }
    describe() {
      const room = this.state.room;
      if (this.isDark()) {
        this.say(this.text(this.rprop(room, 'darkName') || 'Darkness'), 'room');
        this.say(this.text(this.rprop(room, 'darkDesc') || this.msg.dark));
        return;
      }
      this.say(this.text(this.rprop(room, 'name') || room), 'room');
      this.say(this.text(this.rprop(room, 'desc')));
      // items lying here
      for (const id of Object.keys(this.adv.items)) {
        if (this.prop(id, 'scenery') || this.prop(id, 'hidden')) continue;
        const at = this.prop(id, 'at');
        if (!this.inRoom(at, room)) continue;
        // "here" text describes an item in its starting place; once moved it gets the generic line
        const here = JSON.stringify(at) === JSON.stringify(this.adv.items[id].at) || this.prop(id, 'hereAlways') ? this.prop(id, 'here') : undefined;
        if (here === undefined) this.say(`There ${this.prop(id, 'article') === 'some' || this.prop(id, 'plural') ? 'are' : 'is'} ${this.aName(id)} here.`, 'item');
        else this.say(this.text(here), 'item');
        this.listContents(id);
      }
      // contents of open scenery containers (tables, cases...)
      for (const id of Object.keys(this.adv.items)) {
        if (!this.prop(id, 'scenery') || !this.isPresent(id) || this.isCarried(id)) continue;
        this.listContents(id);
      }
      if (this.adv.showExits !== false) {
        const ex = this.exitList();
        this.say(ex.length ? 'Exits: ' + ex.join(', ') + '.' : 'No obvious exits.', 'exits');
      }
    }
    listContents(id) {
      if (!this.isOpen(id) || !this.prop(id, 'container')) return;
      const c = this.contents(id);
      if (!c.length) return;
      const list = andList(c.map((k) => this.aName(k)));
      this.say(this.prop(id, 'surface') ? `On ${this.theName(id)} is ${list}.` : `${cap(this.theName(id))} contains ${list}.`, 'item');
    }

    // ---------- parsing ----------
    parse(raw) {
      let s = raw.toLowerCase().replace(/[^a-z0-9'?\s-]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!s) return null;
      for (const [p, v] of this.phrases) {
        if (s === p || s.startsWith(p + ' ')) { s = v + s.slice(p.length); break; }
      }
      const words = s.split(' ').filter((w) => w && !ARTICLES.has(w));
      if (!words.length) return null;
      const first = words.shift();
      if (this.dirs[first] && !words.length) return { verb: 'go', dir: this.dirs[first], n1: [this.dirs[first]], n2: [] };
      let verb = this.verbMap[first];
      if (!verb) return { unknown: first };
      if (verb === 'look' && words.length) verb = 'examine'; // "look mantle" == "examine mantle"
      if (verb === 'go') {
        const d = this.dirs[words[0]];
        return { verb, dir: d, n1: d ? [d] : words, n2: [] };
      }
      const idx = words.findIndex((w, i) => i > 0 && PREPS.has(w));
      let n1 = idx < 0 ? words : words.slice(0, idx);
      const prep = idx < 0 ? null : words[idx];
      const n2 = idx < 0 ? [] : words.slice(idx + 1);
      if (n1.length && PREPS.has(n1[0]) && n1.length > 1 && verb !== 'climb') n1 = n1.slice(1); // "look at x", "pray to god"
      return { verb, n1, prep, n2, word: first };
    }
    resolve(words, carriedBias = 1) {
      if (!words || !words.length) return null;
      if (words.length === 1 && (words[0] === 'it' || words[0] === 'them') && this.lastItem && this.isVisible(this.lastItem)) {
        return { id: this.lastItem, words: [this.nameOf(this.lastItem)], phrase: this.nameOf(this.lastItem), known: true };
      }
      const phrase = words.join(' ');
      let best = null, bestScore = 0, known = false;
      for (const [id, it] of Object.entries(this.adv.items)) {
        let sc = 0;
        if (it._nouns.includes(phrase)) sc = 20;
        else if (it._nouns.includes(words[words.length - 1])) {
          sc = 10;
          for (const w of words.slice(0, -1)) {
            if (it._adjs.includes(w) || it._nouns.includes(w)) sc += 2; else sc -= 3;
          }
        } else if (words.length === 1 && it._adjs.includes(words[0])) sc = 3;
        if (sc <= 0) continue;
        known = true;
        // in the dark you can still refer to fixed features of the room you're in
        if (!this.isVisible(id) && !(this.isPresent(id) && this.prop(id, 'scenery') && this.isDark())) continue;
        if (this.isCarried(id)) sc += carriedBias;
        if (sc > bestScore) { best = id; bestScore = sc; }
      }
      return { id: best, words, phrase, known };
    }

    // ---------- main entry ----------
    input(raw) {
      const parts = String(raw).split(/\s*(?:\.|;|\bthen\b)\s*/i).filter((x) => x.trim());
      if (!parts.length) { this.say('Beg your pardon?'); return; }
      for (const part of parts) {
        this.command(part);
        if (this.state.over && parts.length > 1) break;
      }
    }
    command(raw) {
      let p = this.parse(raw);
      if (!p) { this.say('Beg your pardon?'); return; }
      if (p.verb === 'again') {
        if (!this.lastCommand) { this.say('There is nothing to repeat.'); return; }
        p = this.parse(this.lastCommand);
        raw = this.lastCommand;
      } else this.lastCommand = raw;
      if (p.unknown) { this.say(this.m('dontKnowVerb', p.unknown)); return; }

      if (this.state.over && !['restart', 'restore', 'undo', 'score', 'help', 'quit'].includes(p.verb)) {
        this.say(this.m('over')); return;
      }
      if (META.has(p.verb)) { this.meta(p.verb); return; }

      const snapshot = JSON.stringify(this.state);
      p.r1 = this.resolve(p.n1, p.verb === 'take' ? -1 : 1);
      p.r2 = this.resolve(p.n2);
      if (p.r1 && p.r1.id) this.lastItem = p.r1.id;

      const used = this.dispatch(p);
      if (used !== false) {
        this.history.push(snapshot);
        if (this.history.length > 50) this.history.shift();
        this.state.turns++;
        this.tick();
      }
    }
    tick() {
      this.events.forEach((ev, i) => {
        if (this.state.over) return;
        if (ev.once && this.state.fired['e' + i]) return;
        if (ev.room && !arr(ev.room).includes(this.state.room)) return;
        if (!this.check(ev.if)) return;
        this.state.fired['e' + i] = true;
        this.run(ev.do);
      });
    }

    matchNoun(spec, r, strict) {
      if (spec === undefined) return true;
      if (spec === '-') return !r;
      if (!r) return false;
      if (spec === '*') return true;
      // an item id matches that item; in global actions it also matches the bare word when
      // nothing visible was found (e.g. "get feather" before the feather exists)
      return arr(spec).some((s) => {
        if (this.adv.items[s] && (r.id || strict)) return r.id === s;
        return s === r.phrase || r.words.includes(s);
      });
    }
    findAction(p) {
      for (const a of this.actions) {
        if (!a._verbs.includes(p.verb)) continue;
        if (a.room && !arr(a.room).includes(this.state.room)) continue;
        if (a.once && this.state.fired['a' + a._i]) continue;
        if (!this.matchNoun(a.noun, p.r1, a._strict)) continue;
        if (!this.matchNoun(a.noun2, p.r2)) continue;
        if (a.prep && !arr(a.prep).includes(p.prep)) continue;
        if (this.check(a.if)) return { a, ok: true };
        if (a.else !== undefined) return { a, ok: false };
      }
      return null;
    }
    dispatch(p) {
      const found = this.findAction(p);
      if (found) {
        const { a, ok } = found;
        if (ok) {
          if (a.once) this.state.fired['a' + a._i] = true;
          this.run(a.do);
          if (!a.continue) return a.turn === false ? false : true;
        } else {
          this.run(a.else);
          return true;
        }
      }
      return this.builtin(p);
    }

    // require a visible item for a built-in verb
    need(p, which = 1, verb) {
      const words = which === 1 ? p.n1 : p.n2;
      const r = which === 1 ? p.r1 : p.r2;
      if (!words || !words.length) { this.say(`What do you want to ${verb || p.word || p.verb}?`); return null; }
      if (r && r.id) return r.id;
      const unknown = words.find((w) => !this.lexicon.has(w));
      if (r && !r.known && unknown) this.say(this.m('dontKnowWord', unknown));
      else if (this.isDark()) this.say('It\'s too dark to see.');
      else this.say(this.m('notHere', words.join(' ')));
      return null;
    }

    builtin(p) {
      const v = p.verb;
      const say = (t) => this.say(t);
      switch (v) {
        case 'go': return this.go(p.dir, p);
        case 'look': this.describe(); return true;
        case 'enter':
          if (p.r1 && p.r1.id && this.prop(p.r1.id, 'goes')) return this.go(this.prop(p.r1.id, 'goes'), p);
          if (!p.n1.length || !p.r1 || !p.r1.id) return this.go('in', p);
          break;
        case 'exit': return this.go('out', p);
        case 'climb': {
          if (p.n1.includes('down')) return this.go('down', p);
          if (this.exitOf(this.state.room, 'up') || p.n1.includes('up')) return this.go('up', p);
          say('There\'s nothing here to climb.'); return true;
        }
        case 'inventory': return this.inventory();
        case 'examine': {
          if (!p.n1.length) { this.describe(); return true; }
          const id = this.need(p); if (!id) return true;
          const d = this.text(this.prop(id, 'desc'));
          say(d || `You see nothing special about ${this.theName(id)}.`);
          if (this.prop(id, 'container') && this.isOpen(id)) {
            const c = this.contents(id);
            if (c.length) this.listContents(id); else if (this.prop(id, 'open') !== undefined || !this.prop(id, 'surface')) say(`${cap(this.theName(id))} is empty.`);
          }
          if (this.prop(id, 'lightable') && !d) say(this.prop(id, 'lit') ? 'It is lit.' : 'It is not lit.');
          return true;
        }
        case 'read': {
          const id = this.need(p); if (!id) return true;
          const t = this.text(this.prop(id, 'text'));
          if (t) this.say(t, 'read'); else say(`There's nothing written on ${this.theName(id)}.`);
          return true;
        }
        case 'search': {
          if (!p.n1.length) { say('You find nothing of interest.'); return true; }
          const id = this.need(p); if (!id) return true;
          if (this.prop(id, 'container')) {
            if (!this.isOpen(id)) { say(`${cap(this.theName(id))} is closed.`); return true; }
            const c = this.contents(id);
            if (c.length) this.listContents(id); else say(`${cap(this.theName(id))} is empty.`);
          } else say('You find nothing of interest.');
          return true;
        }
        case 'take': return this.take(p);
        case 'drop': return this.drop(p);
        case 'throw': {
          if (p.r2 && p.r2.id) { const id = this.need(p); if (!id) return true; if (!this.isCarried(id)) { say(this.m('notCarrying')); return true; } this.setProp(id, 'at', this.state.room); say(`${cap(this.theName(id))} bounces harmlessly off ${this.theName(p.r2.id)} and lands on the ground.`); return true; }
          return this.drop(p);
        }
        case 'put': {
          if (!p.n2.length && p.n1.length) return this.drop(p);
          return this.put(p);
        }
        case 'open': return this.openClose(p, true);
        case 'close': return this.openClose(p, false);
        case 'unlock': return this.lockUnlock(p, false);
        case 'lock': return this.lockUnlock(p, true);
        case 'light': return this.light(p, true);
        case 'extinguish': return this.light(p, false);
        case 'wear': case 'remove': {
          const id = this.need(p); if (!id) return true;
          if (!this.prop(id, 'wearable')) { say('You can\'t wear that.'); return true; }
          if (v === 'wear') { if (!this.isCarried(id)) this.setProp(id, 'at', 'player'); this.setProp(id, 'worn', true); say(`You are now wearing ${this.theName(id)}.`); }
          else { this.setProp(id, 'worn', false); say(`You take off ${this.theName(id)}.`); }
          return true;
        }
        case 'eat': {
          const id = this.need(p); if (!id) return true;
          if (!this.prop(id, 'edible')) { say('That doesn\'t sound very appetizing.'); return true; }
          this.setProp(id, 'at', null); say(this.text(this.prop(id, 'eatMsg')) || 'Delicious. That really hit the spot.'); return true;
        }
        case 'drink': {
          if (p.n1.length) { const id = this.need(p); if (!id) return true;
            if (this.prop(id, 'drinkable')) { this.setProp(id, 'at', null); say(this.text(this.prop(id, 'drinkMsg')) || 'Thank you very much. You were rather thirsty.'); return true; } }
          say('You can\'t drink that.'); return true;
        }
        case 'wait': say('Time passes...'); return true;
        case 'attack': if (p.n1.length && !this.need(p)) return true; say('Violence isn\'t the answer to this one.'); return true;
        case 'push': case 'pull': case 'turn': case 'touch': case 'kick': case 'wave': case 'ring': case 'knock':
          if (p.n1.length && !this.need(p)) return true;
          say(v === 'touch' ? 'You feel nothing unexpected.' : this.m('nothingHappens')); return true;
        case 'listen': say('You hear nothing unusual.'); return true;
        case 'smell': say('You smell nothing unusual.'); return true;
        case 'jump': say('Wheeee!'); return true;
        case 'sleep': say('You aren\'t tired.'); return true;
        case 'pray': say('Your prayer goes unanswered... for now.'); return true;
        case 'say': say(p.n1.length ? `You say "${p.n1.join(' ')}" aloud. Nothing happens.` : 'You mutter to yourself.'); return true;
        case 'swim': say('There\'s nowhere to swim here.'); return true;
        case 'dig': say('The ground is too hard to dig here.'); return true;
        case 'xyzzy': case 'plugh': say('A hollow voice says "Fool."'); return true;
        case 'give': case 'show': if (p.n1.length && !this.need(p)) return true; say('Nobody seems interested.'); return true;
        case 'break': if (p.n1.length && !this.need(p)) return true; say('Trying to destroy that would be futile.'); return true;
        case 'fill': case 'pour': case 'cut': case 'tie': case 'untie': case 'catch': case 'free': case 'kiss': case 'wake':
          if (p.n1.length && !this.need(p)) return true;
          say(this.m('cantDo')); return true;
      }
      if (v === 'enter') { say(this.m('cantDo')); return true; }
      if (p.n1.length && !this.need(p)) return true;
      say(this.m('cantDo'));
      return true;
    }

    go(dir, p) {
      if (!dir) {
        if (p && p.r1 && p.r1.id && this.prop(p.r1.id, 'goes')) dir = this.prop(p.r1.id, 'goes');
        else { this.say('Which direction?'); return false; }
      }
      const ex = this.exitOf(this.state.room, dir);
      const blocked = this.rprop(this.state.room, 'noExit');
      if (!ex) {
        if (this.isDark() && this.adv.darkMoveDeath) { this.run(this.adv.darkMoveDeath); return true; }
        this.say(this.text(blocked) || this.m('noExit'));
        return true;
      }
      let to = ex;
      if (typeof ex === 'object') {
        if (ex.door && !this.prop(ex.door, 'open')) { this.say(this.text(ex.msg) || `${cap(this.theName(ex.door))} is closed.`); return true; }
        if (ex.if && !this.check(ex.if)) { this.run(ex.else || [ex.msg || this.m('noExit')]); return true; }
        if (!ex.to) { this.say(this.text(ex.msg) || this.m('noExit')); return true; }
        if (ex.say) this.say(this.text(ex.say));
        if (ex.do) this.run(ex.do);
        if (this.state.over) return true;
        to = ex.to;
      }
      this.enter(to);
      return true;
    }

    inventory() {
      const items = Object.keys(this.adv.items).filter((id) => this.prop(id, 'at') === 'player');
      if (!items.length) { this.say(this.m('emptyHanded')); return true; }
      this.say('You are carrying:');
      const walk = (id, depth) => {
        let extra = '';
        if (this.prop(id, 'lit')) extra = ' (providing light)';
        if (this.prop(id, 'worn')) extra += ' (being worn)';
        this.say('  '.repeat(depth) + '  ' + this.aName(id) + extra, 'inv');
        if (this.prop(id, 'container') && this.isOpen(id)) this.contents(id).forEach((c) => walk(c, depth + 1));
      };
      items.forEach((id) => walk(id, 0));
      return true;
    }

    canTake(id) {
      if (this.prop(id, 'fixed') || this.prop(id, 'scenery')) {
        this.say(this.text(this.prop(id, 'fixedMsg')) || this.m('fixed'));
        return false;
      }
      if (this.prop(id, 'at') === 'player') { this.say(this.m('alreadyHave')); return false; }
      const max = this.adv.maxCarry;
      if (max && this.carriedCount() >= max) { this.say(this.m('tooMuch')); return false; }
      return true;
    }
    doTake(id, prefix = '') {
      this.setProp(id, 'at', 'player');
      this.say(prefix + (this.text(this.prop(id, 'takeMsg')) || this.m('taken')));
      const pts = this.prop(id, 'points');
      if (pts && !this.state.took[id]) { this.state.took[id] = true; this.state.score += pts; }
    }
    take(p) {
      if (p.n1[0] === 'all' || p.n1[0] === 'everything') {
        const ids = Object.keys(this.adv.items).filter((id) => {
          if (!this.isVisible(id) || this.isCarried(id) || this.prop(id, 'scenery') || this.prop(id, 'fixed')) return false;
          const at = this.prop(id, 'at');
          return this.inRoom(at, this.state.room) || (this.adv.items[at] && this.inRoom(this.prop(at, 'at'), this.state.room) && (this.prop(at, 'scenery') || this.prop(at, 'fixed')));
        });
        if (!ids.length) { this.say('There is nothing here to take.'); return true; }
        for (const id of ids) {
          if (this.adv.maxCarry && this.carriedCount() >= this.adv.maxCarry) { this.say(this.nameOf(id) + ': ' + this.m('tooMuch')); break; }
          this.doTake(id, cap(this.nameOf(id)) + ': ');
        }
        return true;
      }
      const id = this.need(p, 1, 'take'); if (!id) return true;
      if (p.r2 && p.r2.id && this.prop(id, 'at') !== p.r2.id) { this.say(`${cap(this.theName(id))} isn't in ${this.theName(p.r2.id)}.`); return true; }
      if (!this.canTake(id)) return true;
      this.doTake(id);
      return true;
    }
    drop(p) {
      if (p.n1[0] === 'all' || p.n1[0] === 'everything') {
        const ids = Object.keys(this.adv.items).filter((id) => this.prop(id, 'at') === 'player');
        if (!ids.length) { this.say(this.m('emptyHanded')); return true; }
        ids.forEach((id) => { this.setProp(id, 'at', this.state.room); this.setProp(id, 'worn', false); this.say(cap(this.nameOf(id)) + ': ' + this.m('dropped')); });
        return true;
      }
      const id = this.need(p, 1, 'drop'); if (!id) return true;
      if (!this.isCarried(id)) { this.say(this.m('notCarrying')); return true; }
      this.setProp(id, 'at', this.state.room);
      this.setProp(id, 'worn', false);
      this.say(this.text(this.prop(id, 'dropMsg')) || this.m('dropped'));
      return true;
    }
    put(p) {
      const id = this.need(p, 1, 'put'); if (!id) return true;
      const into = this.need(p, 2, 'put it in'); if (!into) return true;
      if (!this.isCarried(id)) { this.say(this.m('notCarrying')); return true; }
      if (id === into) { this.say('That would be a neat trick.'); return true; }
      if (!this.prop(into, 'container')) { this.say(`You can't put anything ${p.prep === 'on' ? 'on' : 'in'} ${this.theName(into)}.`); return true; }
      if (!this.isOpen(into)) { this.say(`${cap(this.theName(into))} is closed.`); return true; }
      this.setProp(id, 'at', into);
      this.say('Done.');
      const dep = this.prop(id, 'deposit');
      if (dep && dep.in === into && !this.state.deposited[id]) {
        this.state.deposited[id] = true;
        this.state.score += dep.points || 0;
      }
      return true;
    }
    openClose(p, open) {
      const id = this.need(p); if (!id) return true;
      if (this.prop(id, 'open') === undefined) { this.say(`You can't ${open ? 'open' : 'close'} that.`); return true; }
      if (open && this.prop(id, 'locked')) { this.say(this.text(this.prop(id, 'lockedMsg')) || `${cap(this.theName(id))} is locked.`); return true; }
      if (!!this.prop(id, 'open') === open) { this.say(`It's already ${open ? 'open' : 'closed'}.`); return true; }
      this.setProp(id, 'open', open);
      const msg = this.text(this.prop(id, open ? 'openMsg' : 'closeMsg'));
      if (msg) this.say(msg);
      else if (open && this.prop(id, 'container') && this.contents(id).length) {
        this.say(`Opening ${this.theName(id)} reveals ${andList(this.contents(id).map((c) => this.aName(c)))}.`);
      } else this.say(open ? 'Opened.' : 'Closed.');
      return true;
    }
    lockUnlock(p, lock) {
      const id = this.need(p); if (!id) return true;
      const key = this.prop(id, 'key');
      if (!key) { this.say(`You can't ${lock ? 'lock' : 'unlock'} that.`); return true; }
      let using = p.r2 && p.r2.id;
      if (p.n2.length && !using) { this.need(p, 2); return true; }
      if (!using && this.isCarried(key)) { using = key; this.say(`(with ${this.theName(key)})`); }
      if (!using) { this.say(`You need something to ${lock ? 'lock' : 'unlock'} it with.`); return true; }
      if (!this.isCarried(using)) { this.say(this.m('notCarrying')); return true; }
      if (using !== key) { this.say(`${cap(this.theName(using))} doesn't fit.`); return true; }
      if (!!this.prop(id, 'locked') === lock) { this.say(`It's already ${lock ? 'locked' : 'unlocked'}.`); return true; }
      if (lock && this.prop(id, 'open')) { this.say('You\'ll have to close it first.'); return true; }
      this.setProp(id, 'locked', lock);
      this.say(this.text(this.prop(id, lock ? 'lockMsg' : 'unlockMsg')) || (lock ? 'Locked.' : 'Unlocked.'));
      return true;
    }
    light(p, on) {
      const id = this.need(p); if (!id) return true;
      if (!this.prop(id, 'lightable')) { this.say(on ? 'You can\'t light that.' : 'That isn\'t burning.'); return true; }
      if (!!this.prop(id, 'lit') === on) { this.say(on ? 'It\'s already lit.' : 'It isn\'t lit.'); return true; }
      if (on) {
        const need = this.prop(id, 'lightWith');
        if (need && !arr(need).some((n) => this.isCarried(n) && (!this.prop(n, 'lightable') || this.prop(n, 'lit')))) {
          this.say(this.text(this.prop(id, 'needMsg')) || `You have nothing to light it with.`); return true;
        }
      }
      const wasDark = this.isDark();
      this.setProp(id, 'lit', on);
      this.say(this.text(this.prop(id, on ? 'lightMsg' : 'outMsg')) || (on ? `${cap(this.theName(id))} is now lit.` : `${cap(this.theName(id))} is now dark.`));
      if (wasDark !== this.isDark()) this.describe();
      return true;
    }

    // ---------- meta ----------
    meta(v) {
      switch (v) {
        case 'score': {
          this.say(`Your score is ${this.state.score} out of ${this.adv.maxScore || 0}, in ${this.state.turns} moves.`);
          const ranks = this.adv.ranks || [];
          let rank = null;
          for (const [min, name] of ranks) if (this.state.score >= min) rank = name;
          if (rank) this.say(`This gives you the rank of ${rank}.`);
          break;
        }
        case 'help':
          this.say(this.text(this.adv.help) || 'Type commands like GO NORTH (or just N), LOOK, EXAMINE LAMP, TAKE KEY, OPEN DOOR, UNLOCK DOOR WITH KEY, PUT COIN IN BOX, INVENTORY (I). Other words: READ, LIGHT, PUSH, PULL, CLIMB, DIG, SAY, WAIT, SCORE, SAVE, RESTORE, UNDO, RESTART, AGAIN (G).');
          break;
        case 'save': this.save(); break;
        case 'restore': this.restore(); break;
        case 'restart': this.say('Restarting...', 'hint'); this.start(); break;
        case 'undo': this.undo(); break;
        case 'quit': this.say('Thanks for playing! Type RESTART to play again, or load another adventure from the menu.'); break;
      }
    }
    undo() {
      if (!this.history.length) { this.say('There is nothing to undo.'); return; }
      this.state = JSON.parse(this.history.pop());
      this.say('Undone.', 'hint');
      this.describe();
    }
    exportSave() { return JSON.stringify({ adventure: this.id, state: this.state }); }
    importSave(json) {
      const d = typeof json === 'string' ? JSON.parse(json) : json;
      if (d.adventure && d.adventure !== this.id) throw new Error('That save belongs to a different adventure (' + d.adventure + ').');
      this.history.push(JSON.stringify(this.state));
      this.state = d.state;
      this.say('Game restored.', 'hint');
      this.describe();
    }
    save(slot = 'quick') {
      if (!this.storage) { this.say('Saving is not available here.'); return; }
      try { this.storage.setItem(`gta:${this.id}:${slot}`, this.exportSave()); this.say('Game saved.', 'hint'); }
      catch (e) { this.say('Could not save: ' + e.message, 'error'); }
    }
    restore(slot = 'quick') {
      let d = null;
      try { d = this.storage && this.storage.getItem(`gta:${this.id}:${slot}`); } catch (e) { /* storage blocked */ }
      if (!d) { this.say('No saved game found.'); return; }
      this.importSave(d);
    }

    // ---------- picture ----------
    picture() {
      const room = this.state.room;
      const dark = this.isDark();
      const r = this.adv.rooms[room];
      const items = [];
      if (!dark) {
        for (const id of Object.keys(this.adv.items)) {
          const art = this.prop(id, 'art');
          if (!art || this.isCarried(id) || !this.isVisible(id)) continue;
          items.push({ id, art, pos: this.prop(id, 'artAt'), scale: this.prop(id, 'artScale') || 1 });
        }
      }
      const image = this.rprop(room, 'image');
      const art = this.rprop(room, 'art');
      const flags = Object.keys(this.state.flags).sort().join(',');
      const key = [room, dark, image, items.map((i) => i.id).join('|'), flags, JSON.stringify(this.state.rooms[room] || {}), JSON.stringify(this.state.items)].join('#');
      return { room, dark, image, art, items, key, overlay: r.overlayItems !== undefined ? r.overlayItems : this.adv.overlayItems };
    }
    status() {
      return {
        room: this.isDark() ? 'Darkness' : this.text(this.rprop(this.state.room, 'name')),
        score: this.state.score, max: this.adv.maxScore || 0, turns: this.state.turns, over: this.state.over,
        exits: this.isDark() ? [] : this.exitList()
      };
    }
  }

  global.GTA = { Game, DIRS, BASE_VERBS };
})(typeof window !== 'undefined' ? window : globalThis);
