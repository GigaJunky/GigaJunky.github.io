/*!
 * Parley 1.0 — drop-in multiplayer for browser games.
 * Players connect directly to each other (WebRTC). No server of your own.
 *
 *   const net = Parley.create({ app: 'mygame', name: 'Arthur' });
 *   const game = await net.host();            // game.code -> "KLYX"
 *   game.on('join', conn => ...);
 *   const conn = await net.join('KLYX');      // on the other computer
 *
 * Also: invite links that need no service at all, a lobby with challenges,
 * quick match and chat, and per-connection chat, state sync and ping.
 * See README.md for the full guide.
 *
 * Matchmaking (codes and lobbies) uses the free public PeerJS signalling
 * service by default; pass `broker` to use your own PeerJS server, or
 * `broker: false` to use invite links only.
 */
(function (root, factory) {
  const P = factory();
  if (typeof module === 'object' && module.exports) module.exports = P;
  else root.Parley = P;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = '1.0.0';
  const DEFAULT_BROKER = 'wss://0.peerjs.com:443/peerjs?key=peerjs';
  const DEFAULT_ICE = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
  ];
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
  const LOWER = 'abcdefghijklmnopqrstuvwxyz0123456789';

  // ------------------------------------------------------------------ helpers
  function rand(n, alphabet) {
    const a = new Uint8Array(n);
    (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto.getRandomValues(a) : a.forEach((_, i) => (a[i] = Math.random() * 256));
    return Array.from(a, b => alphabet[b % alphabet.length]).join('');
  }
  const rid = (n = 10) => rand(n, LOWER);
  const makeCode = (n = 4) => rand(n, ALPHA);
  const INVISIBLE = /[\u0000-\u001f\u007f-\u009f­​-‏‪-‮⁠-⁩﻿]/g;
  function cleanText(t, max = 200) { return String(t == null ? '' : t).replace(INVISIBLE, '').replace(/\s+/g, ' ').trim().slice(0, max); }
  function cleanName(n) { return cleanText(n, 16) || 'Player'; }
  function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  const hasRTC = () => typeof RTCPeerConnection !== 'undefined';

  class Emitter {
    constructor() { this._h = {}; }
    on(t, f) { (this._h[t] || (this._h[t] = [])).push(f); return () => this.off(t, f); }
    off(t, f) { const a = this._h[t]; if (a) { const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); } }
    once(t, f) { const u = this.on(t, (...a) => { u(); f(...a); }); return u; }
    emit(t, ...a) { for (const f of (this._h[t] || []).slice()) { try { f(...a); } catch (e) { console.error('[Parley]', e); } } }
    listeners(t) { return (this._h[t] || []).length; }
  }

  const MESSAGES = {
    'unsupported': 'This browser cannot make direct connections.',
    'network': 'Could not reach the matchmaking service. Check the internet connection.',
    'no-broker': 'Matchmaking is turned off; use invite links instead.',
    'not-found': 'No game found with that code.',
    'id-taken': 'That code is already in use.',
    'timeout': 'Could not connect in time. Some networks block direct connections.',
    'bad-invite': 'That invite or reply is incomplete or mistyped.',
    'wrong-game': 'That invite is for a different game.',
    'wrong-invite': 'That reply belongs to a different invite.',
    'declined': 'The challenge was declined.',
    'cancelled': 'Cancelled.',
    'closed': 'The connection closed.',
    'left': 'The other player left.',
  };
  class ParleyError extends Error { constructor(code) { super(MESSAGES[code] || code); this.code = code; this.name = 'ParleyError'; } }
  const err = c => new ParleyError(MESSAGES[c] ? c : 'closed');

  function gathered(pc, ms = 2500) {
    return new Promise(res => {
      if (pc.iceGatheringState === 'complete') return res();
      const t = setTimeout(res, ms);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
    });
  }

  // ---- packing connection details into short text for links and codes
  function b64u(bytes) { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  async function pack(obj) {
    let bytes = new TextEncoder().encode(JSON.stringify(obj)), tag = 'PL1.';
    if (typeof CompressionStream !== 'undefined') {
      try { bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); tag = 'PL1z.'; } catch (e) { /* plain */ }
    }
    return tag + b64u(bytes);
  }
  async function unpackOne(z, body) {
    let b = body.replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '=';
    let bytes = Uint8Array.from(atob(b), c => c.charCodeAt(0));
    if (z) bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    const o = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!o || (o.k !== 'o' && o.k !== 'a') || typeof o.s !== 'string') throw new Error('bad');
    return o;
  }
  // Accepts a bare code, a whole link, or either pasted inside other text (even wrapped across lines).
  async function unpack(text) {
    const raw = String(text || '');
    for (const t of [raw, raw.replace(/\s+/g, '')]) {
      const m = t.match(/PL1(z?)\.([A-Za-z0-9_-]{40,})/); if (!m) continue;
      for (let k = 0; k <= 24 && k < m[2].length - 40; k++) { try { return await unpackOne(m[1], m[2].slice(0, m[2].length - k)); } catch (e) { /* try shorter */ } }
    }
    throw err('bad-invite');
  }
  function linkFor(kind, value) {
    if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return null;
    return location.href.split('#')[0] + '#' + kind + '=' + value;
  }

  // Every open connection says goodbye when its page closes, so the other side reacts at once.
  const LIVE = new Set();
  if (typeof addEventListener === 'function') addEventListener('pagehide', () => { for (const c of [...LIVE]) c.close('left'); for (const n of NETS) n.close(); });
  const NETS = new Set();

  // ------------------------------------------------------------------ Connection
  // Two data channels: 'pr' reliable+ordered (messages, chat), 'pu' fast+lossy (state, fast messages).
  class Connection extends Emitter {
    constructor(pc, info) {
      super();
      this.pc = pc; this.peerId = info.peerId || null; this.name = cleanName(info.name); this.meta = info.meta || {};
      this.isHost = !!info.isHost; this.open = false; this.rtt = null; this.remoteState = {};
      this._mine = {}; this._seq = 0; this._rseq = -1; this._dirty = false; this._last = Date.now(); this._ch = {}; this._closed = false;
      pc.addEventListener('connectionstatechange', () => { const s = pc.connectionState; if (s === 'failed' || s === 'closed') this.close(this.open ? 'left' : 'timeout'); });
      pc.ondatachannel = e => this._attach(e.channel);
    }
    _attach(dc) {
      this._ch[dc.label] = dc;
      dc.onmessage = e => this._recv(e.data);
      dc.onclose = () => { if (this.open) this.close('left'); };
      dc.onopen = () => this._check();
      if (dc.readyState === 'open') this._check();
    }
    _check() {
      if (this.open || this._closed) return;
      const r = this._ch.pr, u = this._ch.pu;
      if (r && r.readyState === 'open' && u && u.readyState === 'open') {
        this.open = true; this._last = Date.now(); LIVE.add(this);
        this._timer = setInterval(() => this._tick(), 250);
        this.emit('_open'); this.emit('open');
      }
    }
    _tick() {
      const now = Date.now();
      if (now - this._last > 8000) { this.close('left'); return; }
      if (this._dirty || now - (this._sentS || 0) > 1000) { this._dirty = false; this._sentS = now; this._raw('pu', { t: '$s', q: this._seq, d: this._mine }); }
      if (now - (this._pingT || 0) > 1000) { this._pingT = now; this._raw('pu', { t: '$p', d: now }); }
    }
    _raw(label, o) {
      let dc = this._ch[label];
      if (!dc || dc.readyState !== 'open') dc = this._ch.pr;
      if (!dc || dc.readyState !== 'open') return false;
      try { dc.send(JSON.stringify(o)); return true; } catch (e) { return false; }
    }
    _recv(raw) {
      this._last = Date.now();
      if (typeof raw !== 'string' || raw.length > 262144) return;
      let o; try { o = JSON.parse(raw); } catch (e) { return; }
      if (!o || typeof o.t !== 'string') return;
      switch (o.t) {
        case '$p': this._raw('pu', { t: '$P', d: o.d }); return;
        case '$P': if (typeof o.d === 'number') { this.rtt = Date.now() - o.d; this.emit('ping', this.rtt); } return;
        case '$s': if (typeof o.q === 'number' && o.q > this._rseq && o.d && typeof o.d === 'object') { this._rseq = o.q; this.remoteState = o.d; this.emit('state', o.d); } return;
        case '$chat': { const t = cleanText(o.d && o.d.text); if (t) this.emit('chat', t); return; }
        case '$bye': this.close('left'); return;
      }
      if (o.t[0] === '$') return;
      this.emit('message', o.t, o.d);
    }
    /** Reliable, in-order message. */
    send(type, data) { return this._raw('pr', { t: String(type), d: data }); }
    /** Fast message that may be dropped or arrive out of order (positions, inputs). */
    sendFast(type, data) { return this._raw('pu', { t: String(type), d: data }); }
    /** Share your latest state; the other side gets it as conn.remoteState and a 'state' event. Fields set to null are removed. */
    state(patch, replace = false) {
      if (replace) this._mine = {};
      for (const k in patch) { if (patch[k] === null || patch[k] === undefined) delete this._mine[k]; else this._mine[k] = patch[k]; }
      this._seq++; this._sentS = Date.now(); this._dirty = false;
      this._raw('pu', { t: '$s', q: this._seq, d: this._mine });
    }
    get myState() { return this._mine; }
    /** Send a chat line. Returns the cleaned text that was sent. */
    chat(text) { const t = cleanText(text); if (t) this.send('$chat', { text: t }); return t; }
    /** Listen for one message type: conn.handle('move', data => ...) */
    handle(type, fn) { return this.on('message', (t, d) => { if (t === type) fn(d); }); }
    close(reason = 'closed') {
      if (this._closed) return;
      this._closed = true; LIVE.delete(this);
      this._raw('pr', { t: '$bye' });
      clearInterval(this._timer);
      const pc = this.pc; setTimeout(() => { try { pc.close(); } catch (e) { /* gone */ } }, 60);
      const was = this.open; this.open = false;
      if (was) this.emit('close', reason); else this.emit('_fail', reason);
    }
  }
  function newPC(net) { if (!hasRTC()) throw err('unsupported'); return new RTCPeerConnection({ iceServers: net.iceServers }); }
  function outgoing(net, info) {
    const pc = newPC(net), c = new Connection(pc, info);
    c._attach(pc.createDataChannel('pr', { ordered: true }));
    c._attach(pc.createDataChannel('pu', { ordered: false, maxRetransmits: 0 }));
    return c;
  }
  function whenOpen(conn, ms) {
    return new Promise((res, rej) => {
      if (conn.open) return res(conn);
      const t = setTimeout(() => { conn.close('timeout'); }, ms);
      conn.once('_open', () => { clearTimeout(t); res(conn); });
      conn.once('_fail', r => { clearTimeout(t); rej(err(r)); });
    });
  }

  // ------------------------------------------------------------------ Broker peer (PeerJS-compatible signalling)
  class Peer extends Emitter {
    constructor(net, id, ws) { super(); this.net = net; this.id = id; this.ws = ws; this.pending = new Map(); this.closed = false; this.accept = null; this.answerMeta = null; }
    _send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
    _signal(m) {
      const p = m.payload || {}, cid = p.connectionId;
      if (m.type === 'OFFER') this._incoming(m.src, p);
      else if (m.type === 'ANSWER') {
        const e = this.pending.get(cid); if (!e || !e.out || !p.sdp) return;
        if (p.metadata) { e.conn.name = cleanName(p.metadata.n); if (p.metadata.m && typeof p.metadata.m === 'object') e.conn.meta = p.metadata.m; }
        e.pc.setRemoteDescription(p.sdp).then(() => this._flush(e)).catch(() => {});
      } else if (m.type === 'CANDIDATE') {
        const e = this.pending.get(cid); if (!e || !p.candidate) return;
        if (e.pc.remoteDescription) e.pc.addIceCandidate(p.candidate).catch(() => {}); else e.cand.push(p.candidate);
      } else if (m.type === 'EXPIRE' || m.type === 'LEAVE') {
        for (const [k, e] of this.pending) if (e.out && e.remote === m.src) { this.pending.delete(k); e.conn.close('not-found'); }
      }
    }
    _flush(e) { for (const c of e.cand.splice(0)) e.pc.addIceCandidate(c).catch(() => {}); }
    _track(cid, e) {
      this.pending.set(cid, e);
      const done = () => this.pending.delete(cid);
      e.conn.once('_open', done); e.conn.once('_fail', done);
      e.pc.onicecandidate = ev => { if (ev.candidate) this._send({ type: 'CANDIDATE', dst: e.remote, payload: { candidate: ev.candidate.toJSON(), connectionId: cid, type: 'data' } }); };
    }
    connect(remote, metadata, ms = 15000) {
      if (this.closed) return Promise.reject(err('network'));
      const cid = 'pc_' + rid(10);
      let conn; try { conn = outgoing(this.net, { peerId: remote, isHost: metadata.kind !== 'join' }); } catch (e) { return Promise.reject(e); }
      this._track(cid, { pc: conn.pc, cand: [], out: true, remote, conn });
      (async () => {
        try {
          await conn.pc.setLocalDescription(await conn.pc.createOffer());
          this._send({ type: 'OFFER', dst: remote, payload: { sdp: conn.pc.localDescription.toJSON(), type: 'data', connectionId: cid, label: cid, serialization: 'json', reliable: true, metadata } });
        } catch (e) { conn.close('closed'); }
      })();
      return whenOpen(conn, ms);
    }
    async _incoming(src, p) {
      const md = p.metadata || {};
      if (!p.sdp || md.app !== this.net.app) return;
      if (this.accept && !this.accept(src, md)) return;
      let pc; try { pc = newPC(this.net); } catch (e) { return; }
      const conn = new Connection(pc, { peerId: src, name: md.n, meta: md.m && typeof md.m === 'object' ? md.m : {}, isHost: md.kind === 'join' });
      const cid = p.connectionId;
      this._track(cid, { pc, cand: [], out: false, remote: src, conn });
      conn.once('_open', () => this.emit('connection', conn, md));
      setTimeout(() => { if (!conn.open) conn.close('timeout'); }, 20000);
      try {
        await pc.setRemoteDescription(p.sdp); this._flush(this.pending.get(cid) || { cand: [] });
        await pc.setLocalDescription(await pc.createAnswer());
        this._send({ type: 'ANSWER', dst: src, payload: { sdp: pc.localDescription.toJSON(), type: 'data', connectionId: cid, metadata: { n: this.net.name, m: this.answerMeta || undefined } } });
      } catch (e) { conn.close('closed'); }
    }
    close() {
      if (this.closed) return; this.closed = true; clearInterval(this._hb);
      for (const [, e] of this.pending) e.conn.close('closed');
      this.pending.clear();
      try { this.ws.close(); } catch (e) { /* gone */ }
    }
  }
  function openPeer(net, id) {
    return new Promise((res, rej) => {
      if (!net.broker) return rej(err('no-broker'));
      if (!hasRTC()) return rej(err('unsupported'));
      let ws;
      try { ws = new WebSocket(net.broker + (net.broker.includes('?') ? '&' : '?') + 'id=' + encodeURIComponent(id) + '&token=' + rid(10) + '&version=1.5.4'); } catch (e) { return rej(err('network')); }
      const peer = new Peer(net, id, ws); let opened = false;
      const to = setTimeout(() => { if (!opened) { rej(err('network')); peer.close(); } }, 10000);
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch (x) { return; }
        if (!opened) {
          if (m.type === 'OPEN') { opened = true; clearTimeout(to); res(peer); }
          else if (m.type === 'ID-TAKEN') { clearTimeout(to); rej(err('id-taken')); peer.close(); }
          else if (m.type === 'ERROR') { clearTimeout(to); rej(err('network')); peer.close(); }
          return;
        }
        peer._signal(m);
      };
      ws.onerror = () => { if (!opened) { clearTimeout(to); rej(err('network')); } };
      ws.onclose = () => { clearInterval(peer._hb); if (opened && !peer.closed) { peer.closed = true; peer.emit('disconnected'); } };
      peer._hb = setInterval(() => peer._send({ type: 'HEARTBEAT' }), 5000);
    });
  }

  // ------------------------------------------------------------------ Hosted game (4-letter code)
  class HostedGame extends Emitter {
    constructor(net, peer, code, opts) {
      super();
      this.net = net; this.peer = peer; this.code = code; this.meta = opts.meta || {}; this.maxPlayers = opts.maxPlayers || 1; this.players = []; this.closed = false;
      peer.answerMeta = this.meta;
      peer.accept = (src, md) => md.kind === 'join' && !this.closed && this.players.length < this.maxPlayers;
      peer.on('connection', c => {
        this.players.push(c);
        c.once('close', () => { this.players = this.players.filter(x => x !== c); this.emit('leave', c); });
        this.emit('join', c);
      });
      peer.on('disconnected', () => this.emit('error', err('network')));
    }
    /** Stop accepting players. Existing connections stay open. */
    close() { this.closed = true; this.peer.close(); }
  }

  // ------------------------------------------------------------------ Invite (no service: details travel in the link)
  class Invite extends Emitter {
    constructor(net, opts) {
      super();
      this.net = net; this.id = rid(8); this.meta = opts.meta || {}; this.code = null; this.link = null; this.done = false;
      this.conn = outgoing(net, { isHost: true });
      this.conn.once('_open', () => { this.done = true; this._stop(); this.emit('connect', this.conn); });
      this.conn.once('_fail', r => { this._stop(); this.emit('error', err(r)); });
    }
    async _make() {
      const pc = this.conn.pc;
      await pc.setLocalDescription(await pc.createOffer()); await gathered(pc);
      this.code = await pack({ k: 'o', a: this.net.app, s: pc.localDescription.sdp, i: this.id, n: this.net.name, m: this.meta });
      this.link = linkFor('invite', this.code);
      this._listen();
      return this;
    }
    /** Paste in the reply (code or whole link). Resolves with the Connection. */
    async accept(replyText) {
      if (this.done) return this.conn;
      const o = await unpack(replyText);
      if (o.k !== 'a') throw err('bad-invite');
      if (o.a !== this.net.app) throw err('wrong-game');
      if (o.i !== this.id) throw err('wrong-invite');
      this.conn.name = cleanName(o.n); this.conn.meta = o.m || {};
      if (!this.conn.pc.remoteDescription) await this.conn.pc.setRemoteDescription({ type: 'answer', sdp: o.s });
      return whenOpen(this.conn, 20000);
    }
    _listen() {
      const app = this.net.app;
      const tryReply = async (text, ack) => { try { const o = await unpack(text); if (o.k === 'a' && o.i === this.id && !this.done) { ack(); this.emit('reply'); await this.accept(text); } } catch (e) { /* not ours */ } };
      if (typeof BroadcastChannel !== 'undefined') {
        this._bc = new BroadcastChannel('parley-' + app);
        this._bc.onmessage = e => { const d = e.data; if (d && d.reply) tryReply(d.reply, () => this._bc.postMessage({ ack: d.id })); };
      }
      this._st = e => { if (e.key === 'parley-reply-' + app && e.newValue) { const [text, id] = e.newValue.split('|'); tryReply(text, () => { try { localStorage.setItem('parley-ack-' + app, id); } catch (x) { /* none */ } }); } };
      if (typeof addEventListener === 'function') addEventListener('storage', this._st);
    }
    _stop() { if (this._bc) { this._bc.close(); this._bc = null; } if (this._st && typeof removeEventListener === 'function') removeEventListener('storage', this._st); }
    cancel() { this._stop(); this.conn.close('cancelled'); }
  }

  // ------------------------------------------------------------------ Lobby
  function sanState(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return { name: 'Player', status: 'idle' };
    let s; try { s = JSON.stringify(o); } catch (e) { return { name: 'Player', status: 'idle' }; }
    const r = s.length > 2048 ? { name: o.name, status: o.status } : JSON.parse(s);
    r.name = cleanName(r.name); r.status = typeof r.status === 'string' ? r.status.slice(0, 24) : 'idle';
    if (r.seeking != null) r.seeking = String(r.seeking).slice(0, 40);
    return r;
  }
  class Challenge extends Emitter {
    constructor(lobby, from, cid, meta) { super(); this.lobby = lobby; this.from = from; this.id = cid; this.meta = meta || {}; this.answered = false; this.cancelled = false; }
    /** Accept: resolves with the Connection to the challenger. */
    accept() {
      if (this.answered || this.cancelled) return Promise.reject(err('cancelled'));
      this.answered = true;
      const p = this.lobby._awaitMatch(this.id, 20000);
      this.lobby._toHolder('to', { to: this.from.id, m: { k: 'acc', cid: this.id } });
      return p;
    }
    decline() { if (this.answered || this.cancelled) return; this.answered = true; this.lobby._toHolder('to', { to: this.from.id, m: { k: 'dec', cid: this.id } }); }
  }
  class Lobby extends Emitter {
    constructor(net, code, opts) {
      super();
      this.net = net; this.code = code; this.link = linkFor('lobby', code);
      this.me = sanState({ status: 'idle', ...(opts.state || {}), name: net.name });
      this.players = []; this.isHolder = false; this.id = null; this.closed = false;
      this._states = new Map(); this._members = new Map(); this._seekers = new Map(); this._up = null;
      this._out = new Map(); this._await = new Map(); this._incomingCh = new Map(); this._seeking = null; this._fails = 0; this._prev = new Map();
    }
    get _lobbyId() { return this.net.prefix + 'l-' + this.code.toLowerCase(); }
    async _connect() {
      for (let attempt = 0; attempt < 6 && !this.closed; attempt++) {
        try {
          const p = await openPeer(this.net, this._lobbyId);
          if (this.closed) { p.close(); return; }
          this._holderPeer = p; this.isHolder = true; this.id = p.id; this._setupHolder(p);
          this._fails = 0; this.emit('status', 'holding'); this._toHolder('st', this.me); if (this._seeking) this._toHolder('qm', { key: this._seeking });
          return;
        } catch (e) {
          if (e.code !== 'id-taken') throw e;
        }
        try {
          const peer = await this.net._myPeer();
          const c = await peer.connect(this._lobbyId, { app: this.net.app, kind: 'lobby', n: this.net.name }, 15000);
          if (this.closed) { c.close(); return; }
          this.isHolder = false; this.id = peer.id; this._setupMember(c);
          this._fails = 0; this.emit('status', 'connected'); this._toHolder('st', this.me); if (this._seeking) this._toHolder('qm', { key: this._seeking });
          return;
        } catch (e) {
          if (e.code === 'network' || e.code === 'unsupported') throw e;
          await new Promise(r => setTimeout(r, 300 + Math.random() * 1200)); // holder vanished; try to take over
        }
      }
      throw err('timeout');
    }
    _setupHolder(p) {
      p.accept = (src, md) => (md.kind === 'lobby' && this._members.size < 64) || md.kind === 'match';
      p.on('connection', (c, md) => { if (md.kind === 'lobby') this._addMember(c); else this._incomingMatch(c, md); });
      p.on('disconnected', () => { /* existing members stay connected; new arrivals can't reach us */ this.emit('status', 'holding-offline'); });
      this._states = new Map([[this.id, { ...this.me }]]);
      this._bcTimer = setInterval(() => this._broadcast(), 3000);
      this._apply([...this._states]);
    }
    _addMember(c) {
      const id = c.peerId; const old = this._members.get(id); if (old) old.close();
      this._members.set(id, c);
      c.on('message', (t, d) => this._fromMember(id, t, d));
      c.once('close', () => { if (this._members.get(id) === c) { this._members.delete(id); this._states.delete(id); this._seekers.delete(id); this._broadcastSoon(); } });
    }
    _setupMember(c) {
      this._up = c;
      c.on('message', (t, d) => this._fromHolder(t, d));
      c.once('close', () => { if (this._up === c) { this._up = null; this._lostHolder(); } });
    }
    _lostHolder() {
      if (this.closed) return;
      this.emit('status', 'reconnecting');
      setTimeout(() => { if (!this.closed) this._connect().catch(e => this.emit('error', e)); }, 200 + Math.random() * 1300);
    }
    // ---- holder side
    _fromMember(id, t, d) {
      if (t === 'st' && d && typeof d === 'object') { this._states.set(id, sanState(d)); this._broadcastSoon(); }
      else if (t === 'say') { const text = cleanText(d && d.text, 200); if (text) this._deliverAll('say', { from: id, text }); }
      else if (t === 'to' && d && typeof d.to === 'string') { this._deliver(d.to, 'from', { from: id, m: d.m }); }
      else if (t === 'qm') { if (d && d.key) this._seekers.set(id, String(d.key).slice(0, 40)); else this._seekers.delete(id); this._pair(); }
    }
    _deliver(id, t, d) { if (id === this.id) this._fromHolder(t, d); else { const c = this._members.get(id); if (c) c.send(t, d); } }
    _deliverAll(t, d) { for (const [, c] of this._members) c.send(t, d); this._fromHolder(t, d); }
    _broadcastSoon() { if (this._bcSoon) return; this._bcSoon = setTimeout(() => { this._bcSoon = null; this._broadcast(); }, 60); }
    _broadcast() { if (!this.isHolder || this.closed) return; this._states.set(this.id, { ...this.me }); this._deliverAll('all', [...this._states]); }
    _pair() {
      const byKey = {};
      for (const [id, k] of this._seekers) (byKey[k] || (byKey[k] = [])).push(id);
      for (const k in byKey) {
        const ids = byKey[k];
        while (ids.length >= 2) {
          const a = ids.shift(), b = ids.shift(), tok = 'qm' + rid(12);
          this._seekers.delete(a); this._seekers.delete(b);
          this._deliver(a, 'pair', { with: b, key: k, tok, lead: true });
          this._deliver(b, 'pair', { with: a, key: k, tok, lead: false });
        }
      }
    }
    // ---- everyone (holder messages to itself arrive here too)
    _toHolder(t, d) { if (this.isHolder) this._fromMember(this.id, t, d); else if (this._up) this._up.send(t, d); }
    _fromHolder(t, d) {
      if (t === 'all' && Array.isArray(d)) this._apply(d);
      else if (t === 'say' && d && typeof d.from === 'string') {
        const text = cleanText(d.text, 200); if (!text) return;
        const p = this.players.find(x => x.id === d.from);
        this.emit('chat', { from: p || { id: d.from, name: 'Player' }, text, me: d.from === this.id });
      } else if (t === 'from' && d && typeof d.from === 'string' && d.m && typeof d.m === 'object') this._direct(d.from, d.m);
      else if (t === 'pair' && d && typeof d.with === 'string') this._paired(d);
    }
    _apply(list) {
      const players = [];
      for (const [id, st] of list.slice(0, 80)) { if (typeof id !== 'string') continue; const s = sanState(st); players.push({ id, name: s.name, status: s.status, seeking: s.seeking || null, state: s, me: id === this.id }); }
      players.sort((a, b) => (b.me - a.me) || a.name.localeCompare(b.name));
      this.players = players;
      const now = new Map(players.map(p => [p.id, p]));
      if (this._seeded) {
        for (const [id, p] of now) if (!this._prev.has(id) && !p.me) this.emit('join', p);
        for (const [id, p] of this._prev) if (!now.has(id) && !p.me) { this.emit('leave', p); this._peerGone(id); }
      } else if (players.some(p => p.me)) this._seeded = true;
      this._prev = now;
      this.emit('players', players);
    }
    _peerGone(id) {
      for (const [cid, o] of this._out) if (o.to === id) { this._out.delete(cid); clearTimeout(o.timer); o.reject(err('left')); }
      for (const [cid, ch] of this._incomingCh) if (ch.from.id === id) { this._incomingCh.delete(cid); ch.cancelled = true; ch.emit('cancelled'); this.emit('challenge-cancelled', ch); }
    }
    _direct(from, m) {
      const who = this.players.find(p => p.id === from) || { id: from, name: cleanName(m.n) };
      if (m.k === 'ch' && typeof m.cid === 'string') {
        const ch = new Challenge(this, who, m.cid, m.meta);
        if (!this.listeners('challenge')) { ch.decline(); return; }
        this._incomingCh.set(m.cid, ch);
        this.emit('challenge', ch);
      } else if (m.k === 'cx') {
        const ch = this._incomingCh.get(m.cid); if (ch) { this._incomingCh.delete(m.cid); ch.cancelled = true; ch.emit('cancelled'); this.emit('challenge-cancelled', ch); }
      } else if (m.k === 'acc' || m.k === 'dec') {
        const o = this._out.get(m.cid); if (!o || o.to !== from) return;
        this._out.delete(m.cid); clearTimeout(o.timer);
        if (m.k === 'dec') { o.reject(err('declined')); return; }
        this._matchPeer().then(peer => peer.connect(from, { app: this.net.app, kind: 'match', cid: m.cid, n: this.net.name, m: o.meta }, 15000))
          .then(conn => { conn.meta = o.meta; o.resolve(conn); this.emit('match', conn, { challenge: true, meta: o.meta }); }, o.reject);
      }
    }
    _paired(d) {
      const key = d.key; this._seeking = null; this.set({ seeking: null });
      const done = conn => { conn.meta = { ...(conn.meta || {}), quickMatch: key }; this.emit('match', conn, { quickMatch: true, key }); };
      const fail = () => { if (!this.closed) { this.emit('match-failed', key); this.quickMatch(key); } };
      if (d.lead) this._matchPeer().then(peer => peer.connect(d.with, { app: this.net.app, kind: 'match', cid: d.tok, n: this.net.name, m: { quickMatch: key } }, 15000)).then(done, fail);
      else this._awaitMatch(d.tok, 20000).then(done, fail);
    }
    _matchPeer() { return this.isHolder ? Promise.resolve(this._holderPeer) : this.net._myPeer(); }
    _awaitMatch(cid, ms) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { this._await.delete(cid); reject(err('timeout')); }, ms);
        this._await.set(cid, { resolve: c => { clearTimeout(timer); resolve(c); }, reject });
      });
    }
    _incomingMatch(conn, md) {
      const w = this._await.get(md.cid);
      if (!w) { conn.close(); return; }
      this._await.delete(md.cid); this._incomingCh.delete(md.cid);
      w.resolve(conn);
      if (!String(md.cid).startsWith('qm')) this.emit('match', conn, { challenge: true, meta: conn.meta });
    }
    // ---- public API
    /** Update what others see about you: lobby.set({ status: 'playing', score: 3 }). Fields set to null are removed. */
    set(patch) {
      const next = { ...this.me };
      for (const k in patch) { if (patch[k] === null || patch[k] === undefined) delete next[k]; else next[k] = patch[k]; }
      next.name = this.net.name;
      this.me = sanState(next);
      this._toHolder('st', this.me);
    }
    /** Say something to everyone in the lobby. */
    chat(text) { const t = cleanText(text, 200); if (t) this._toHolder('say', { text: t }); return t; }
    /** Challenge a player. Resolves with the Connection if they accept; rejects with code 'declined', 'left' or 'timeout'. */
    challenge(playerId, meta = {}) {
      const cid = 'ch' + rid(12);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { if (this._out.delete(cid)) { this._toHolder('to', { to: playerId, m: { k: 'cx', cid } }); reject(err('timeout')); } }, 60000);
        this._out.set(cid, { to: playerId, meta, resolve, reject, timer });
        this._toHolder('to', { to: playerId, m: { k: 'ch', cid, meta, n: this.net.name } });
        this._lastOut = cid;
      });
    }
    /** Withdraw the challenge you sent most recently (or a given one). */
    cancelChallenge() {
      for (const [cid, o] of this._out) { this._out.delete(cid); clearTimeout(o.timer); this._toHolder('to', { to: o.to, m: { k: 'cx', cid } }); o.reject(err('cancelled')); }
    }
    /** Look for anyone else searching with the same key ('duel', 'coop'…). A 'match' event fires with the Connection. */
    quickMatch(key = 'any') { this._seeking = String(key); this.set({ seeking: this._seeking }); this._toHolder('qm', { key: this._seeking }); }
    cancelQuickMatch() { this._seeking = null; this.set({ seeking: null }); this._toHolder('qm', { key: null }); }
    get seeking() { return this._seeking; }
    leave() {
      if (this.closed) return; this.closed = true;
      clearInterval(this._bcTimer); clearTimeout(this._bcSoon);
      for (const [, c] of this._members) c.close(); this._members.clear();
      if (this._up) { const u = this._up; this._up = null; u.close(); }
      if (this._holderPeer) this._holderPeer.close();
      for (const [, o] of this._out) { clearTimeout(o.timer); o.reject(err('cancelled')); } this._out.clear();
      if (this.net._lobby === this) this.net._lobby = null;
      this.emit('status', 'left');
    }
  }

  // ------------------------------------------------------------------ Net (entry point)
  class Net extends Emitter {
    constructor(o) {
      super();
      if (!o || !o.app) throw new Error('Parley.create needs { app: "yourgame" }');
      this.app = String(o.app).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24) || 'game';
      this.name = cleanName(o.name);
      this.broker = o.broker === undefined ? DEFAULT_BROKER : o.broker;
      this.iceServers = o.iceServers || DEFAULT_ICE;
      this.prefix = 'parley-' + this.app + '-';
      this._peer = null; this._peerP = null; this._lobby = null;
      NETS.add(this);
    }
    setName(n) { this.name = cleanName(n); if (this._lobby) this._lobby.set({}); return this.name; }
    _myPeer() {
      if (this._peer && !this._peer.closed) return Promise.resolve(this._peer);
      if (this._peerP) return this._peerP;
      this._peerP = openPeer(this, this.prefix + 'p-' + rid(10)).then(p => {
        this._peer = p; this._peerP = null;
        p.accept = (src, md) => md.kind === 'match' && !!this._lobby;
        p.on('connection', (c, md) => { if (this._lobby) this._lobby._incomingMatch(c, md); else c.close(); });
        return p;
      }, e => { this._peerP = null; throw e; });
      return this._peerP;
    }
    /** Host a game other players join with a short code. Resolves with a HostedGame: .code, 'join' events. */
    async host(opts = {}) {
      const fixed = opts.code ? normCode(opts.code) : null;
      let code = fixed || makeCode(opts.codeLength || 4), tries = 0;
      for (;;) {
        try { const peer = await openPeer(this, this.prefix + 'h-' + code.toLowerCase()); return new HostedGame(this, peer, code, opts); }
        catch (e) { if (e.code === 'id-taken' && !fixed && tries++ < 4) { code = makeCode(opts.codeLength || 4); continue; } throw e; }
      }
    }
    /** Join a hosted game by its code. Resolves with the Connection; conn.meta holds what the host shared. */
    async join(code, opts = {}) {
      code = normCode(code); if (!code) throw err('not-found');
      const peer = await this._myPeer();
      return peer.connect(this.prefix + 'h-' + code.toLowerCase(), { app: this.app, kind: 'join', n: this.name, m: opts.meta || {} }, opts.timeout || 15000);
    }
    /** Make an invite that needs no service. Send invite.link (or invite.code); 'connect' fires with the Connection. */
    async invite(opts = {}) { return new Invite(this, opts)._make(); }
    /** Answer an invite (link or code). Send back reply.link (or reply.code); reply.connection resolves when connected. */
    async answer(inviteText, opts = {}) {
      const o = await unpack(inviteText);
      if (o.k !== 'o') throw err('bad-invite');
      if (o.a !== this.app) throw err('wrong-game');
      const pc = newPC(this), conn = new Connection(pc, { name: o.n, meta: o.m || {}, isHost: false });
      await pc.setRemoteDescription({ type: 'offer', sdp: o.s });
      await pc.setLocalDescription(await pc.createAnswer()); await gathered(pc);
      const code = await pack({ k: 'a', a: this.app, s: pc.localDescription.sdp, i: o.i, n: this.name, m: opts.meta || {} });
      return { code, link: linkFor('reply', code), from: cleanName(o.n), meta: o.m || {}, connection: whenOpen(conn, opts.timeout || 600000) };
    }
    /** Join (or open) a lobby. Same code = same lobby. Omit the code to make a new one. */
    async lobby(code, opts = {}) {
      if (this._lobby) this._lobby.leave();
      const lb = new Lobby(this, code ? normCode(code) : makeCode(6), opts);
      this._lobby = lb;
      try { await lb._connect(); } catch (e) { lb.leave(); throw e; }
      return lb;
    }
    close() { if (this._lobby) this._lobby.leave(); if (this._peer) this._peer.close(); }
  }

  // ------------------------------------------------------------------ links
  /** What the page was opened with: { kind: 'invite' | 'reply' | 'lobby', value } or null. */
  function readLink(hash) {
    const h = hash != null ? hash : (typeof location !== 'undefined' ? location.hash : '');
    const m = /^#(invite|reply|lobby)=(.+)$/.exec(h || '');
    return m ? { kind: m[1], value: decodeURIComponent(m[2]) } : null;
  }
  /** Is this text an invite or a reply? Resolves 'invite' | 'reply'; rejects if it is neither. */
  async function inspect(text) { const o = await unpack(text); return o.k === 'o' ? 'invite' : 'reply'; }
  function clearLink() { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ } }
  /** Hand a reply link to the tab of this browser that made the invite. Resolves true if that tab took it. */
  function deliverReply(app, text, ms = 1500) {
    app = String(app).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
    const id = rid(8);
    return new Promise(res => {
      let done = false; const finish = v => { if (!done) { done = true; cleanup(); res(v); } };
      let bc = null;
      if (typeof BroadcastChannel !== 'undefined') { bc = new BroadcastChannel('parley-' + app); bc.onmessage = e => { if (e.data && e.data.ack === id) finish(true); }; bc.postMessage({ reply: text, id }); }
      const st = e => { if (e.key === 'parley-ack-' + app && e.newValue === id) finish(true); };
      addEventListener('storage', st);
      try { localStorage.setItem('parley-reply-' + app, text + '|' + id); } catch (e) { /* none */ }
      const t = setTimeout(() => finish(false), ms);
      function cleanup() { clearTimeout(t); removeEventListener('storage', st); if (bc) bc.close(); }
    });
  }

  return {
    VERSION,
    create: o => new Net(o),
    get supported() { return hasRTC(); },
    readLink, clearLink, deliverReply, inspect,
    makeCode, cleanText, cleanName,
    ParleyError, Connection,
    DEFAULT_BROKER, DEFAULT_ICE,
  };
});
