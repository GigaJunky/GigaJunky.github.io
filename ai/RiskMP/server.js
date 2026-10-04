#!/usr/bin/env node
/*
 * Risk Online — standalone, zero-dependency Node.js server (Node 18+).
 *
 *   node server.js            # http://localhost:8080
 *   PORT=3000 node server.js
 *
 * - Serves index.html (the game client) from this folder.
 * - WebSocket endpoint at /ws (RFC 6455 implemented with Node built-ins only).
 * - The server is authoritative: it owns all rules, dice, decks and bot AI.
 *   Clients only send intents; other players' cards are never sent to you.
 * - Bots can be added in the lobby. Anyone who disconnects mid-game is
 *   replaced by a bot until they reconnect (same browser / same room code).
 *
 * Env: PORT (8080), HOST (0.0.0.0), TICK_MS (900, bot move delay),
 *      ALLOW_ANY_ORIGIN=1 (disable same-origin check on WebSocket upgrades).
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const PORT = +process.env.PORT || 8080, HOST = process.env.HOST || '0.0.0.0', TICK = +process.env.TICK_MS || 900;
const MAX_PLAYERS = 4, ROOM_TTL = 10 * 60 * 1000;

/* ---------------- World data ---------------- */
const NM = 'Alaska,N. Canada,Greenland,Quebec,West US,East US,Central America,Venezuela,Brazil,Peru,Argentina,Scandinavia,Britain,N. Europe,W. Europe,S. Europe,Ukraine,N. Africa,Egypt,Congo,E. Africa,S. Africa,Ural,Siberia,Yakutsk,Kamchatka,Mongolia,China,Middle East,India,Siam,Indonesia,W. Australia,E. Australia'.split(',');
const N = NM.length; // 34
const CO = [0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,2,2,3,3,3,3,3,4,4,4,4,4,4,4,4,4,5,5,5];
const BON = [4, 2, 3, 3, 5, 2];
const EDGES = [[0,1],[0,4],[1,2],[1,3],[1,4],[2,3],[3,5],[4,5],[4,6],[5,6],[6,7],[2,11],[7,8],[7,9],[8,9],[9,10],[8,10],[8,17],[11,12],[11,13],[11,16],[12,13],[12,14],[13,14],[13,15],[13,16],[14,15],[15,16],[14,17],[15,17],[15,18],[15,28],[16,28],[16,22],[17,18],[18,20],[17,20],[17,19],[19,20],[19,21],[20,21],[18,28],[20,28],[22,23],[22,27],[22,28],[23,24],[23,26],[23,27],[24,25],[24,26],[25,26],[26,27],[27,29],[27,30],[28,29],[28,27],[29,30],[30,31],[31,32],[31,33],[32,33],[0,25]];
const ADJ = Array.from({ length: N }, () => []);
EDGES.forEach(([i, j]) => { ADJ[i].push(j); ADJ[j].push(i); });
const PH = { reinforce: 1, attack: 1, fortify: 1 };

/* ---------------- Game rules ---------------- */
const shuf = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const say = (S, m) => { S.log = (S.log || []).concat(m).slice(-6); };
const isW = c => c >= N;
const tval = n => n < 6 ? [4, 6, 8, 10, 12, 15][n] : 15 + 5 * (n - 5);
const okSet = x => { if (x.some(isW)) return true; const t = new Set(x.map(c => c % 3)); return t.size === 1 || t.size === 3; };
const findSet = cs => { for (let a = 0; a < cs.length; a++) for (let b = a + 1; b < cs.length; b++) for (let c = b + 1; c < cs.length; c++) if (okSet([cs[a], cs[b], cs[c]])) return [a, b, c]; return null; };
const enemyAdj = (S, i) => ADJ[i].filter(j => S.terr[j].o !== S.terr[i].o);

function poolFor(S, p) {
  const n = S.terr.filter(t => t.o === p).length;
  let b = Math.max(3, n / 3 | 0);
  for (let c = 0; c < BON.length; c++) if (S.terr.every((t, i) => CO[i] !== c || t.o === p)) b += BON[c];
  return b;
}
function startGame(S) {
  const n = S.players.length;
  const ids = shuf([...Array(N).keys()]);
  S.terr = Array(N);
  ids.forEach((t, i) => { S.terr[t] = { o: i % n, a: 1 }; });
  for (let p = 0; p < n; p++) {
    const mine = S.terr.filter(t => t.o === p);
    for (let k = mine.length; k < [0, 0, 50, 40, 35][n]; k++) mine[Math.random() * mine.length | 0].a++;
  }
  S.players.forEach(q => { q.cards = []; q.dead = false; });
  S.deck = shuf([...Array(N + 2).keys()]); S.sets = 0; S.earned = false;
  S.turn = 0; S.phase = 'reinforce'; S.pool = poolFor(S, 0); S.log = ['Game started!'];
}
const myTurn = (S, p, ph) => S.phase === ph && S.turn === p;

function place(S, p, i) {
  if (!myTurn(S, p, 'reinforce')) return 'Not your reinforce phase';
  if (!Number.isInteger(i) || i < 0 || i >= N) return 'Bad territory';
  if (S.players[p].cards.length >= 5) return 'Trade cards first (5+)';
  if (S.terr[i].o !== p || S.pool < 1) return 'Cannot place there';
  S.terr[i].a++; S.pool--; return null;
}
function trade(S, p, idx) {
  if (!myTurn(S, p, 'reinforce')) return 'Trade during your reinforce phase';
  const pl = S.players[p];
  if (!Array.isArray(idx) || idx.length !== 3 || new Set(idx).size !== 3 || !idx.every(i => Number.isInteger(i) && i >= 0 && i < pl.cards.length)) return 'Bad selection';
  const cs = idx.map(i => pl.cards[i]);
  if (!okSet(cs)) return 'Not a valid set';
  const v = tval(S.sets || 0); S.sets = (S.sets || 0) + 1; S.pool += v;
  const bon = cs.find(c => !isW(c) && S.terr[c].o === p);
  if (bon !== undefined) S.terr[bon].a += 2;
  pl.cards = pl.cards.filter((_, i) => !idx.includes(i));
  S.deck = shuf(S.deck.concat(cs));
  say(S, pl.name + ' traded a set: +' + v + ' armies' + (bon !== undefined ? ' (+2 on ' + NM[bon] + ')' : ''));
  return null;
}
function attack(S, p, s, d, blitz) {
  if (!myTurn(S, p, 'attack')) return 'Not your attack phase';
  if (![s, d].every(x => Number.isInteger(x) && x >= 0 && x < N)) return 'Bad territory';
  const A = S.terr[s], D = S.terr[d];
  if (A.o !== p || D.o === p || !ADJ[s].includes(d) || A.a < 2) return 'Illegal attack';
  const roll = n => Array.from({ length: n }, () => 1 + Math.random() * 6 | 0).sort((x, y) => y - x);
  let rounds = blitz ? 999 : 1, al = 0, dl = 0;
  while (rounds-- && A.a > 1 && D.a > 0) {
    const x = roll(Math.min(3, A.a - 1)), y = roll(Math.min(2, D.a));
    for (let k = 0; k < Math.min(x.length, y.length); k++) x[k] > y[k] ? (D.a--, dl++) : (A.a--, al++);
  }
  const nm = S.players[p].name;
  if (D.a <= 0) {
    const prev = D.o, mv = blitz ? A.a - 1 : Math.min(3, A.a - 1);
    D.o = p; A.a -= mv; D.a = mv; S.earned = true;
    say(S, nm + ' conquered ' + NM[d] + ' (lost ' + al + ', killed ' + dl + ')');
    if (!S.terr.some(t => t.o === prev)) {
      S.players[prev].dead = true;
      S.players[p].cards = S.players[p].cards.concat(S.players[prev].cards); S.players[prev].cards = [];
      say(S, S.players[prev].name + ' eliminated!');
    }
    if (!S.terr.some(t => t.o !== p)) { S.phase = 'over'; S.winner = p; }
  } else say(S, nm + ' ' + NM[s] + '→' + NM[d] + ': lost ' + al + ', killed ' + dl);
  return null;
}
function fort(S, p, s, d) {
  if (!myTurn(S, p, 'fortify')) return 'Not your fortify phase';
  if (![s, d].every(x => Number.isInteger(x) && x >= 0 && x < N)) return 'Bad territory';
  if (S.terr[s].o !== p || S.terr[d].o !== p || !ADJ[s].includes(d) || S.terr[s].a < 2) return 'Illegal move';
  S.terr[s].a--; S.terr[d].a++; return null;
}
function next(S, p) {
  if (S.turn !== p || !(S.phase in PH)) return 'Not your turn';
  if (S.phase === 'reinforce') { if (S.pool > 0) return 'Place all armies first'; S.phase = 'attack'; }
  else if (S.phase === 'attack') S.phase = 'fortify';
  else {
    const q = S.players[p];
    if (S.earned && S.deck.length) { q.cards.push(S.deck.pop()); say(S, q.name + ' drew a card'); }
    S.earned = false;
    let n = p; do n = (n + 1) % S.players.length; while (S.players[n].dead);
    S.turn = n; S.phase = 'reinforce'; S.pool = poolFor(S, n); say(S, S.players[n].name + "'s turn");
  }
  return null;
}
function auto(S, p) {
  if (!myTurn(S, p, 'reinforce')) return 'Not your reinforce phase';
  if (S.pool === 0) return next(S, p);
  if (S.players[p].cards.length >= 5) return 'Trade cards first (5+)';
  const m = S.terr.filter(t => t.o === p);
  while (S.pool > 0) { m[Math.random() * m.length | 0].a++; S.pool--; }
  S.phase = 'attack'; return null;
}

/* ---------------- Bot AI (one action per tick) ---------------- */
function botStep(r) {
  const S = r.S, me = S.turn, pl = S.players[me];
  const own = [...Array(N).keys()].filter(i => S.terr[i].o === me);
  if (S.phase !== r.lastPh) { r.lastPh = S.phase; r.fort = 0; }
  if (S.phase === 'reinforce') {
    for (let st; pl.cards.length >= 3 && (st = findSet(pl.cards));) trade(S, me, st);
    while (S.pool > 0) {
      let b = own[0], bs = -1e9;
      own.forEach(i => {
        const e = enemyAdj(S, i);
        const s = e.length ? e.reduce((a, j) => a + S.terr[j].a, 0) - S.terr[i].a + 5 : -S.terr[i].a - 20;
        if (s > bs) { bs = s; b = i; }
      });
      S.terr[b].a++; S.pool--;
    }
    S.phase = 'attack';
  } else if (S.phase === 'attack') {
    let bs = 1, bm = null;
    own.forEach(i => {
      const a = S.terr[i].a; if (a < 2) return;
      enemyAdj(S, i).forEach(j => { const s = a - S.terr[j].a + Math.random() * .5; if (s >= 2 && s > bs) { bs = s; bm = [i, j]; } });
    });
    if (bm) attack(S, me, bm[0], bm[1], true); else next(S, me);
  } else {
    const dist = {}, q = own.filter(i => enemyAdj(S, i).length);
    q.forEach(i => { dist[i] = 0; });
    for (let k = 0; k < q.length; k++) ADJ[q[k]].forEach(j => { if (S.terr[j].o === me && dist[j] === undefined) { dist[j] = dist[q[k]] + 1; q.push(j); } });
    let mv = null;
    own.forEach(i => { if (S.terr[i].a > 1 && dist[i] > 0) ADJ[i].forEach(j => { if (!mv && S.terr[j].o === me && dist[j] < dist[i]) mv = [i, j]; }); });
    if (mv && r.fort++ < 8) { S.terr[mv[1]].a += S.terr[mv[0]].a - 1; S.terr[mv[0]].a = 1; }
    else next(S, me);
  }
}

/* ---------------- Rooms ---------------- */
const rooms = new Map();
function getRoom(code) {
  let r = rooms.get(code);
  if (!r) { r = { code, S: { players: [], phase: 'lobby', log: [] }, conns: new Set(), lastPh: '', fort: 0, seen: Date.now() }; rooms.set(code, r); }
  return r;
}
function view(r, c) {
  const S = r.S, me = S.players.findIndex(p => p.uid === c.uid);
  return {
    phase: S.phase, turn: S.turn, pool: S.pool, sets: S.sets, log: S.log, terr: S.terr, winner: S.winner,
    players: S.players.map((p, i) => ({
      id: i === me ? c.uid : 'x' + i, name: p.name, ai: p.ai || undefined, dead: p.dead || undefined, away: p.away || undefined,
      cards: i === me ? (p.cards || []) : (p.cards || []).map(() => null)
    }))
  };
}
function broadcast(r) {
  r.seen = Date.now();
  for (const c of r.conns) send(c, { t: 'state', S: view(r, c) });
}
const humansPresent = r => r.S.players.some(p => !p.ai && !p.away);

setInterval(() => {
  for (const [code, r] of rooms) {
    const S = r.S;
    if (S.phase in PH && humansPresent(r)) {
      const pl = S.players[S.turn];
      if (pl.ai || pl.away) { try { botStep(r); } catch (e) { console.error('bot error', e); } broadcast(r); }
    }
    if (!r.conns.size && Date.now() - r.seen > ROOM_TTL) rooms.delete(code);
  }
}, TICK);

/* ---------------- Message handling ---------------- */
function onMsg(c, text) {
  const now = Date.now();
  if (now - c.win > 1000) { c.win = now; c.n = 0; }
  if (++c.n > 30 || text.length > 2000) return;
  let m; try { m = JSON.parse(text); } catch { return; }
  if (!m || typeof m.t !== 'string') return;
  if (m.t === 'join') return join(c, m);
  const r = c.room; if (!r) return;
  const S = r.S, p = S.players.findIndex(q => q.uid === c.uid);
  if (p < 0) return send(c, { t: 'err', msg: 'You are spectating' });
  let err = null;
  switch (m.t) {
    case 'bot':
      if (S.phase !== 'lobby' || S.players.length >= MAX_PLAYERS) err = 'Cannot add a bot now';
      else S.players.push({ uid: 'ai' + crypto.randomBytes(4).toString('hex'), name: 'Bot ' + (S.players.filter(q => q.ai).length + 1), ai: true, cards: [] });
      break;
    case 'start': if (S.phase !== 'lobby' || S.players.length < 2) err = 'Need 2+ players'; else startGame(S); break;
    case 'place': err = place(S, p, m.i); break;
    case 'attack': err = attack(S, p, m.s, m.d, !!m.blitz); break;
    case 'fort': err = fort(S, p, m.s, m.d); break;
    case 'next': err = next(S, p); break;
    case 'auto': err = auto(S, p); break;
    case 'trade': err = trade(S, p, m.idx); break;
    default: return;
  }
  if (err) send(c, { t: 'err', msg: err }); else broadcast(r);
}
function join(c, m) {
  const code = String(m.room || '').toUpperCase();
  const uid = String(m.uid || '');
  if (!/^[A-Z0-9]{1,12}$/.test(code)) return send(c, { t: 'err', msg: 'Bad room code' });
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(uid)) return send(c, { t: 'err', msg: 'Bad player id' });
  if (c.room) return;
  const name = String(m.name || 'Player').replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, 14) || 'Player';
  const r = getRoom(code), S = r.S, fresh = !S.players.length;
  c.room = r; c.uid = uid; r.conns.add(c);
  const p = S.players.find(q => q.uid === uid);
  if (p) p.away = false;
  else if (S.phase === 'lobby' && S.players.length < MAX_PLAYERS) {
    S.players.push({ uid, name, cards: [] });
    const nb = Math.min(3, +m.solo | 0);
    if (fresh && nb > 0) {
      for (let i = 1; i <= nb; i++) S.players.push({ uid: 'ai' + crypto.randomBytes(4).toString('hex'), name: 'Bot ' + i, ai: true, cards: [] });
      startGame(S);
    }
  }
  broadcast(r);
}
function onClose(c) {
  const r = c.room; if (!r) return;
  r.conns.delete(c);
  if (![...r.conns].some(x => x.uid === c.uid)) {
    const S = r.S, i = S.players.findIndex(q => q.uid === c.uid);
    if (i >= 0) {
      if (S.phase === 'lobby') {
        S.players.splice(i, 1);
        if (!S.players.some(q => !q.ai)) S.players = [];
      } else S.players[i].away = true; // a bot plays for them until they return
    }
  }
  broadcast(r);
}

/* ---------------- WebSocket (RFC 6455, minimal) ---------------- */
function frame(op, pl) {
  const l = pl.length; let h;
  if (l < 126) h = Buffer.from([0x80 | op, l]);
  else if (l < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(l, 2); }
  else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(l), 2); }
  return Buffer.concat([h, pl]);
}
function send(c, o) { if (!c.sock.destroyed && c.sock.writable) c.sock.write(frame(1, Buffer.from(JSON.stringify(o)))); }
function parse(c) {
  for (;;) {
    const b = c.buf; if (b.length < 2) return;
    if (!(b[1] & 128)) return c.sock.destroy(); // client frames must be masked
    let len = b[1] & 127, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
    if (len > 65536) return c.sock.destroy();
    if (b.length < off + 4 + len) return;
    const mask = b.subarray(off, off + 4), pl = Buffer.from(b.subarray(off + 4, off + 4 + len));
    for (let i = 0; i < len; i++) pl[i] ^= mask[i & 3];
    const op = b[0] & 15;
    c.buf = b.subarray(off + 4 + len);
    if (op === 8) { c.sock.end(frame(8, Buffer.alloc(0))); return; }
    if (op === 9) c.sock.write(frame(10, pl));
    else if (op === 1) { try { onMsg(c, pl.toString('utf8')); } catch (e) { console.error('msg error', e); } }
  }
}

/* ---------------- HTTP ---------------- */
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (u === '/' || u === '/index.html') {
    return fs.readFile(path.join(__dirname, 'index.html'), (e, d) => {
      if (e) { res.writeHead(500); return res.end('index.html missing next to server.js'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
      res.end(d);
    });
  }
  res.writeHead(404); res.end('Not found');
});
server.on('upgrade', (req, sock) => {
  try {
    if (req.url.split('?')[0] !== '/ws') throw 0;
    const o = req.headers.origin;
    if (o && !process.env.ALLOW_ANY_ORIGIN && new URL(o).host !== req.headers.host) throw 0;
    const key = req.headers['sec-websocket-key']; if (!key) throw 0;
    const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  } catch { return sock.destroy(); }
  const c = { sock, buf: Buffer.alloc(0), uid: null, room: null, win: 0, n: 0 };
  sock.on('data', d => { c.buf = Buffer.concat([c.buf, d]); parse(c); });
  sock.on('close', () => onClose(c));
  sock.on('error', () => sock.destroy());
});
if (require.main === module) {
  server.listen(PORT, HOST, () => console.log(`Risk Online running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`));
}
module.exports = { server, startGame, place, attack, fort, next, auto, trade, botStep, poolFor, N };
