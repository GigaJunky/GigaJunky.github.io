// Georoids standalone multiplayer server. Zero dependencies.
//   node server.js        -> http://localhost:3000   (set PORT to change)
// Serves index.html and relays game messages between players in the same room over WebSocket (/ws).
const http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 3000, MAX_ROOM = 8, MAX_MSG = 16384;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const rooms = new Map(), dirty = new Set();

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/' || u === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  } else if (u === '/health') { res.writeHead(200); res.end('ok'); }
  else { res.writeHead(404); res.end('Not found'); }
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket' || !req.url.startsWith('/ws')) return socket.destroy();
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const c = { socket, buf: Buffer.alloc(0), room: null, peer: crypto.randomBytes(8).toString('hex'), pres: {}, dead: false };
  socket.on('data', d => { c.buf = Buffer.concat([c.buf, d]); parse(c); });
  socket.on('close', () => drop(c));
  socket.on('error', () => drop(c));
});

function parse(c) {
  for (;;) {
    const b = c.buf;
    if (b.length < 2) return;
    const op = b[0] & 15, masked = !!(b[1] & 128);
    let len = b[1] & 127, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
    if (len > MAX_MSG) return c.socket.destroy();
    const ml = masked ? 4 : 0;
    if (b.length < off + ml + len) return;
    let p = b.subarray(off + ml, off + ml + len);
    if (masked) { const m = b.subarray(off, off + 4); p = Buffer.from(p); for (let i = 0; i < p.length; i++) p[i] ^= m[i & 3]; }
    c.buf = b.subarray(off + ml + len);
    if (op === 8) return c.socket.end();
    if (op === 9) { frame(c, p, 10); continue; }
    if (op === 1) handle(c, p.toString('utf8'));   // (fragmented messages are not supported; game messages are small)
  }
}

function frame(c, data, op = 1) {
  if (c.dead || c.socket.destroyed) return;
  const p = Buffer.isBuffer(data) ? data : Buffer.from(data), n = p.length;
  let h;
  if (n < 126) h = Buffer.from([128 | op, n]);
  else if (n < 65536) { h = Buffer.alloc(4); h[0] = 128 | op; h[1] = 126; h.writeUInt16BE(n, 2); }
  else { h = Buffer.alloc(10); h[0] = 128 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  c.socket.write(Buffer.concat([h, p]));
}
const sendObj = (c, o) => frame(c, JSON.stringify(o));

const okKey = k => /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(k);
function patchPres(pres, patch) {
  if (!patch || typeof patch !== 'object') return pres;
  const next = { ...pres };
  for (const k of Object.keys(patch)) { if (!okKey(k)) continue; if (patch[k] === null) delete next[k]; else next[k] = patch[k]; }
  return JSON.stringify(next).length <= 4096 ? next : pres;
}

function handle(c, text) {
  let m; try { m = JSON.parse(text); } catch (e) { return; }
  if (!m || typeof m !== 'object') return;
  if (m.t === 'join' && !c.room) {
    const name = /^[a-z0-9_-]{1,32}$/i.test(m.room) ? m.room.toLowerCase() : 'lobby';
    const set = rooms.get(name) || new Set();
    if (set.size >= MAX_ROOM) { sendObj(c, { t: 'full' }); return c.socket.end(); }
    set.add(c); rooms.set(name, set); c.room = name; c.pres = patchPres({}, m.p);
    sendObj(c, { t: 'hello', peer: c.peer }); dirty.add(name);
  } else if (!c.room) return;
  else if (m.t === 'pres') { c.pres = patchPres(c.pres, m.p); dirty.add(c.room); }
  else if (m.t === 'emit' && /^[a-z][a-z0-9_.-]{0,31}$/.test(m.topic)) {
    const out = JSON.stringify({ t: 'msg', topic: m.topic, d: m.d, peer: c.peer });
    for (const o of rooms.get(c.room)) if (o !== c) frame(o, out);
  }
}

function drop(c) {
  if (c.dead) return; c.dead = true;
  const set = rooms.get(c.room);
  if (set) { set.delete(c); if (set.size) dirty.add(c.room); else rooms.delete(c.room); }
}

// Presence changes are batched to ~20 updates a second per room.
setInterval(() => {
  for (const name of dirty) {
    const set = rooms.get(name); if (!set) continue;
    const out = JSON.stringify({ t: 'peers', peers: [...set].map(c => ({ peer: c.peer, presence: c.pres })) });
    for (const c of set) frame(c, out);
  }
  dirty.clear();
}, 50);
// Keep connections alive through proxies.
setInterval(() => { for (const set of rooms.values()) for (const c of set) frame(c, Buffer.alloc(0), 9); }, 25000);

server.listen(PORT, () => console.log('Georoids server running on http://localhost:' + PORT));
