'use strict';
// Game flow: menus, seats, season, shop, pause, and online play over Parley.
// Online model: the host simulates everything; guests send their input with conn.state()
// and draw 30 Hz snapshots (sendFast) with a little interpolation. Effects and menus go over reliable send().
const VERSION = 1, STEP = 1 / 120, SCREENS = ['title', 'join', 'online', 'options', 'help', 'loading', 'results', 'shop', 'champ', 'pause', 'padsetup'];
const opts = Object.assign({ laps: 4, diff: 1, races: 8, track: -1 }, store('opts') || {});
const G = {
  screen: 'title', role: 'solo', slots: [null, null, null, null], players: [], season: null, race: null, demo: null, results: null,
  paused: false, raceEnded: false, raceLabel: '', preRace: null,
  net: null, hosted: null, conn: null, lobby: null, myPid: -1, snaps: [], snapQ: -1, snapSeq: 0, sendT: 0, seasonInfo: null,
  shopCur: {}, shopDeadline: 0, optBack: 'title', helpBack: 'title', debug: /debug/.test(location.search), musicWas: null,
};
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const ROWS = ['nitro', 'tires', 'shocks', 'accel', 'speed', 'done'];

const Game = {
  onFx(r, e) { Gfx.onFx(r, e, localPis(), r.demo); },
  deviceFor(p) {
    const locals = G.slots.filter(s => s && s.kind === 'local');
    if (locals.length === 1 && /^(kb[12]|pad\d)$/.test(p.device || '')) return 'solo';
    if (p.device === 'kb1' || p.device === 'kb2') {
      const other = p.device === 'kb1' ? 'kb2' : 'kb1';
      if (!G.slots.some(s => s && s.kind === 'local' && s.device === other)) return 'kb';
    }
    return p.device;
  },
};
function localPis() {
  if (G.role === 'guest') return [G.myPid];
  return G.players.filter(p => p.kind === 'local').map(p => p.id);
}
const remotes = () => G.slots.filter(s => s && s.kind === 'remote' && s.conn).map(s => s.conn);
const hasLocal = dev => G.slots.some(s => s && s.kind === 'local' && s.device === dev);
const activeRace = () => G.race || G.demo;

// ---------------------------------------------------------------- screens
function show(name) {
  for (const s of SCREENS) $('scr-' + s).hidden = s !== name;
  G.screen = name;
  if (name && document.pointerLockElement) document.exitPointerLock();
  const scr = name && $('scr-' + name);
  if (scr) { const f = scr.querySelector('[data-nav].primary:not([disabled])') || scr.querySelector('[data-nav]:not([disabled])'); if (f) f.focus({ preventScroll: true }); }
  const racing = !name && !!G.race;
  $('touch').hidden = !(racing && (hasLocal('touch') || (G.role === 'guest' && isTouch)));
  $('corner').hidden = !(racing && isTouch);
  if (name && name !== 'pause' && name !== 'loading') Sound.music(true, 1);
}
let toastT = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.remove('hide'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.add('hide'), 2800); }
function status(t, bad) { const el = $('netStatus'); el.textContent = t; el.classList.toggle('err', !!bad); }

document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]'); if (a && !a.disabled) { Sound.fx.select(); act(a.dataset.act); return; }
  const o = e.target.closest('[data-opt]'); if (o && !o.disabled) { cycleOpt(o.dataset.opt, 1); return; }
  const it = e.target.closest('.item'); if (it && !it.disabled) shopDo(+it.dataset.pid, it.dataset.row);
});
const unlockAudio = () => { Sound.init(); };
addEventListener('pointerdown', unlockAudio); addEventListener('keydown', unlockAudio);
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') { if (e.key === 'Escape') e.target.blur(); return; }
  if (e.code === 'Escape') { e.preventDefault(); escape(); }
  if (e.code === 'KeyM') { const m = Sound.opts.music; Sound.setOpt('music', m > 0 ? 0 : (G.musicWas || 0.55)); G.musicWas = m || G.musicWas; toast(m > 0 ? 'Music off' : 'Music on'); }
});
function escape() {
  if (!G.screen && G.race) return pause();
  if (G.screen === 'pause') return resume();
  if (['join', 'online', 'options', 'help', 'padsetup'].includes(G.screen)) act('back');
}

function act(a) {
  switch (a) {
    case 'race': G.role = 'solo'; G.slots = [null, null, null, null]; show('join'); renderJoin(); break;
    case 'online':
      if (!Parley.supported) { toast('This browser cannot do peer-to-peer (WebRTC) connections.'); return; }
      $('netName').value = store('name') || ''; status(window.SOR_BROKER ? 'Matchmaking: this game server (' + location.host + '). Friends open the same address.' : 'Matchmaking: public PeerJS service.'); show('online');
      break;
    case 'options': G.optBack = G.screen; syncOptions(); show('options'); break;
    case 'help': G.helpBack = G.screen; show('help'); break;
    case 'back':
      if (G.screen === 'options') return show(G.optBack);
      if (G.screen === 'help') return show(G.helpBack);
      if (G.screen === 'padsetup') { syncOptions(); return show('options'); }
      if (G.screen === 'join') { leaveOnline(); show('title'); return; }
      show('title'); break;
    case 'start': startSeason(); break;
    case 'copylink': copyLink(); break;
    case 'host': hostGame(); break;
    case 'join': joinGame(); break;
    case 'continue': if (G.role !== 'guest') afterResults(); break;
    case 'menu': if (G.role !== 'guest') backToSeats(); break;
    case 'resume': resume(); break;
    case 'restart': restartRace(); break;
    case 'quit': quitRace(); break;
    case 'padsetup': padSetupStart(); break;
    case 'padredo': padSetupStart(); break;
    case 'padreset': for (const p of Input.rawPads()) Input.setPadMap(p.id, null); toast('Controllers back to default buttons'); padSetupStart(); break;
  }
}

// ---------------------------------------------------------------- options
const OPT_DEFS = {
  track: { vals: [-1, ...TRACKS.map((_, i) => i)], label: v => 'Tracks: <b>' + (v < 0 ? 'Season' : TRACKS[v].name) + '</b>' },
  races: { vals: [4, 8], label: v => 'Season: <b>' + v + ' races</b>' },
  laps: { vals: [2, 3, 4, 5], label: v => 'Laps: <b>' + v + '</b>' },
  diff: { vals: [0, 1, 2], label: v => 'CPU: <b>' + ['Easy', 'Normal', 'Hard'][v] + '</b>' },
};
function cycleOpt(k, d) {
  if (G.role === 'guest') return;
  const def = OPT_DEFS[k], i = def.vals.indexOf(opts[k]);
  opts[k] = def.vals[(i + d + def.vals.length) % def.vals.length];
  store('opts', opts); Sound.fx.ui(); renderOpts(); sendLobby();
}
function renderOpts() {
  const o = G.role === 'guest' && G.lobby ? G.lobby.opts : opts;
  for (const b of document.querySelectorAll('[data-opt]')) {
    const k = b.dataset.opt; b.innerHTML = OPT_DEFS[k].label(o[k]);
    b.disabled = G.role === 'guest' || (k === 'races' && o.track >= 0);
  }
}
function syncOptions() {
  $('optMusic').value = Sound.opts.music; $('optSfx').value = Sound.opts.sfx; $('optSens').value = Input.sens;
  $('optVoice').innerHTML = 'Announcer: <b>' + (Sound.opts.voice ? 'On' : 'Off') + '</b>';
}
$('optMusic').oninput = e => Sound.setOpt('music', +e.target.value);
$('optSfx').oninput = e => { Sound.setOpt('sfx', +e.target.value); Sound.fx.ui(); };
$('optSens').oninput = e => { Input.sens = +e.target.value; };
$('optVoice').onclick = () => { Sound.setOpt('voice', !Sound.opts.voice); syncOptions(); };
$('optFull').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); };

// ---------------------------------------------------------------- seats
const DEV_LABEL = d => ({ kb1: 'Keyboard · WASD + Space', kb2: 'Keyboard · Arrows + R-Shift', mouse: 'Mouse spinner', touch: 'Touch controls' }[d] || (d && d.startsWith('pad') ? Input.padName(d) : ''));
function addLocal(dev, name) {
  const k = G.slots.findIndex(s => !s); if (k < 0) { Sound.fx.error(); return; }
  G.slots[k] = { kind: 'local', device: dev, name: name || (k === 0 && store('name')) || 'Player ' + (k + 1) };
  Sound.fx.join(); renderJoin(); sendLobby();
}
function removeSlot(k) {
  const s = G.slots[k]; if (!s || s.kind !== 'local') return;
  G.slots[k] = null; Sound.fx.ui(); renderJoin(); sendLobby();
}
function renderJoin() {
  const guest = G.role === 'guest', slots = guest ? (G.lobby ? G.lobby.slots : [null, null, null, null]) : G.slots;
  $('joinTitle').textContent = G.role === 'host' ? 'Online · Drivers' : guest ? 'Online · Waiting for host' : 'Drivers';
  $('netBox').hidden = !(G.role === 'host' || guest);
  $('netCode').textContent = G.role === 'host' && G.hosted ? G.hosted.code : guest && G.lobby ? G.lobby.code || '' : '';
  const box = $('slots'); box.textContent = '';
  slots.forEach((s, i) => {
    const el = document.createElement('div'); el.className = 'slot' + (s ? ' on' : ''); el.style.setProperty('--c', COLORS[i].hex);
    const pn = document.createElement('div'); pn.className = 'pn'; pn.textContent = 'P' + (i + 1) + ' · ' + COLORS[i].name; el.append(pn);
    const cv = document.createElement('canvas'); cv.width = 144; cv.height = 96;
    cv.getContext('2d').drawImage(Gfx.truckSprite(COLORS[i].hex, i + 1), 0, 0);
    if (!s) cv.style.opacity = 0.3;
    el.append(cv);
    if (s) {
      if (!guest && s.kind === 'local') {
        const inp = document.createElement('input'); inp.value = s.name; inp.maxLength = 14; inp.setAttribute('aria-label', 'Name for player ' + (i + 1));
        inp.onchange = () => { s.name = inp.value.trim() || 'Player ' + (i + 1); if (i === 0) store('name', s.name); sendLobby(); };
        el.append(inp);
      } else { const n = document.createElement('div'); n.style.fontSize = '20px'; n.textContent = s.name + (guest && i === G.myPid ? ' (you)' : ''); el.append(n); }
      const d = document.createElement('div'); d.className = 'dev'; d.textContent = s.kind === 'remote' ? 'Online player' : guest ? 'Host machine' : DEV_LABEL(s.device); el.append(d);
      if (!guest && s.kind === 'local') {
        const row = document.createElement('div'); row.className = 'join-opts';
        const b = document.createElement('button'); b.className = 'btn small'; b.textContent = 'Leave'; b.onclick = () => removeSlot(i); row.append(b); el.append(row);
      }
    } else {
      const p = document.createElement('div'); p.className = 'pulse'; p.textContent = guest ? 'Open seat' : 'Press GAS to join'; el.append(p);
      const t = document.createElement('div'); t.className = 'tag'; t.textContent = 'CPU drives if empty'; el.append(t);
      if (!guest) {
        const row = document.createElement('div'); row.className = 'join-opts';
        for (const [dev, label] of [['mouse', 'Mouse'], ['touch', 'Touch']]) {
          if (hasLocal(dev)) continue;
          const b = document.createElement('button'); b.className = 'btn small'; b.textContent = label; b.onclick = () => addLocal(dev); row.append(b);
        }
        el.append(row);
      }
    }
    box.append(el);
  });
  renderOpts();
  $('startBtn').disabled = guest; $('startBtn').textContent = guest ? 'Waiting…' : 'Start ▸';
  $('joinHint').textContent = guest ? 'The host picks the tracks and starts the season. Your controls: any keyboard layout, mouse, gamepad or touch.'
    : G.role === 'host' ? 'Share the code. Friends join from Online → Join. Local drivers press GAS on a keyboard or controller.'
      : 'Press GAS (W, ↑, A / RT) on a keyboard or controller to take a seat · Q, Backspace or B leaves · Enter or Start to race';
}
function joinTick() {
  if (G.role === 'guest') return navTick('any');
  for (const d of ['kb1', 'kb2', ...Input.connectedPads()]) {
    const k = G.slots.findIndex(s => s && s.kind === 'local' && s.device === d);
    if (k < 0) { if (Input.gasPressed(d)) addLocal(d); }
    else if (Input.pressed(d, 'back')) removeSlot(k);
    else navTick(d);
  }
  if (Input.pressed('kb', 'start') || Input.connectedPads().some(d => Input.pressed(d, 'start'))) startSeason();
}

// Generic menu navigation for keyboards and gamepads.
function navTick(dev) {
  const scr = G.screen && $('scr-' + G.screen); if (!scr) return;
  const items = [...scr.querySelectorAll('[data-nav]')].filter(el => !el.disabled && el.offsetParent !== null);
  if (!items.length) return;
  let i = items.indexOf(document.activeElement);
  const mv = d => { i = i < 0 ? 0 : (i + d + items.length) % items.length; items[i].focus({ preventScroll: true }); items.forEach(e => e.classList.toggle('navf', e === items[i])); Sound.fx.ui(); };
  if (Input.pressed(dev, 'down')) mv(1);
  if (Input.pressed(dev, 'up')) mv(-1);
  const cur = items[i];
  if (cur && cur.dataset.opt) { if (Input.pressed(dev, 'right')) cycleOpt(cur.dataset.opt, 1); if (Input.pressed(dev, 'left')) cycleOpt(cur.dataset.opt, -1); }
  else if (cur && cur.type === 'range') {
    const st = +cur.step || 0.1, d = (Input.pressed(dev, 'right') ? 1 : 0) - (Input.pressed(dev, 'left') ? 1 : 0);
    if (d) { cur.value = clamp(+cur.value + d * st, +cur.min, +cur.max); cur.dispatchEvent(new Event('input')); }
  } else { if (Input.pressed(dev, 'right')) mv(1); if (Input.pressed(dev, 'left')) mv(-1); }
  if (Input.pressed(dev, 'ok') && cur) { if (cur.tagName === 'INPUT' && cur.type !== 'range') cur.focus(); else cur.click(); }
  if (Input.pressed(dev, 'back') && G.screen !== 'join') escape();
}

// ---------------------------------------------------------------- season flow
function startSeason() {
  if (G.role === 'guest' || G.screen !== 'join') return;
  if (!G.slots.some(s => s && s.kind === 'local') && G.role === 'solo') addLocal(isTouch ? 'touch' : 'kb1');
  const order = opts.track >= 0 ? [opts.track] : Array.from({ length: opts.races }, (_, i) => i % TRACKS.length);
  G.season = { order, raceNo: 0, laps: opts.laps, diff: opts.diff };
  let cpu = 0;
  const names = [...CPU_NAMES].sort(() => Math.random() - 0.5);
  G.players = G.slots.map((s, i) => {
    if (!s) return newPlayer(i, 'cpu', names[cpu++]);
    const p = newPlayer(i, s.kind, s.name); p.device = s.device || null; p.conn = s.conn || null; return p;
  });
  startRace();
}
function startRace() {
  const s = G.season, ti = s.order[s.raceNo];
  for (const p of G.players) if (p.kind === 'cpu') {
    const lvl = clamp(Math.floor(s.raceNo * [0.3, 0.5, 0.75][s.diff]) + (s.diff === 2 ? 1 : 0), 0, MAX_UPG);
    p.upg = { tires: lvl, shocks: lvl, accel: lvl, speed: lvl }; p.nitro = Math.max(p.nitro, 2 + (s.raceNo >> 1));
  }
  G.preRace = G.players.map(p => ({ money: p.money, nitro: p.nitro }));
  G.raceLabel = s.order.length > 1 ? 'RACE ' + (s.raceNo + 1) + '/' + s.order.length : 'SINGLE RACE';
  show('loading');
  setTimeout(() => {
    G.race = newRace(ti, G.players, { laps: s.laps, diff: s.diff });
    Gfx.newRaceVisuals(G.race); G.raceEnded = false; G.paused = false; acc = 0;
    show(null); Sound.music(true, 0.5); Sound.say(TRACKS[ti].name);
    broadcastRoster();
    broadcast('phase', { ph: 'race', ti, laps: s.laps, raceNo: s.raceNo, races: s.order.length });
  }, 40);
}
function endRace() {
  G.raceEnded = true;
  const res = raceResults(G.race);
  for (const x of res) { const p = G.players[x.pi]; p.money += x.prize; p.points += x.points; }
  G.results = { list: res, raceNo: G.season.raceNo, track: G.race.trackIdx };
  G.season.raceNo++;
  G.seasonInfo = { raceNo: G.season.raceNo, races: G.season.order.length };
  setTimeout(() => {
    if (!G.race) return;
    showResults(); broadcastRoster();
    broadcast('phase', { ph: 'results', results: G.results, info: G.seasonInfo });
  }, 1300);
}
function showResults() {
  const R = G.results, info = G.seasonInfo || { raceNo: 1, races: 1 }, last = info.raceNo >= info.races;
  $('resTitle').textContent = 'Race ' + (R.raceNo + 1) + ' · ' + TRACKS[R.track].name;
  const t = $('resTable'); t.innerHTML = '<tr><th>Pos</th><th>Driver</th><th class="num">Time</th><th class="num">Prize</th><th class="num">Pts</th></tr>';
  for (const x of R.list) {
    const p = G.players[x.pi]; if (!p) continue;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="place" style="color:${p.color}">${ordinal(x.place)}</td><td><span class="dot" style="color:${p.color};background:${p.color}"></span></td><td class="num">${fmtTime(x.time)}</td><td class="num" style="color:#ffd76a">+${money(x.prize)}</td><td class="num">+${x.points}</td>`;
    tr.children[1].append(document.createTextNode(p.name));
    t.append(tr);
  }
  standings($('standTable'));
  $('resBtn').disabled = G.role === 'guest';
  $('resBtn').textContent = last ? 'Final standings ▸' : 'Speed shop ▸';
  $('resHint').textContent = G.role === 'guest' ? 'Waiting for the host to continue…' : '';
  show('results');
}
function standings(t) {
  t.innerHTML = '<tr><th>#</th><th>Driver</th><th class="num">Pts</th><th class="num">Cash</th></tr>';
  [...G.players].sort((a, b) => b.points - a.points).forEach((p, k) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${k + 1}</td><td><span class="dot" style="color:${p.color};background:${p.color}"></span></td><td class="num">${p.points}</td><td class="num" style="color:#ffd76a">${money(p.money)}</td>`;
    tr.children[1].append(document.createTextNode(p.name)); t.append(tr);
  });
}
function afterResults() {
  const info = G.seasonInfo;
  if (info.raceNo >= info.races) { showChamp(); broadcast('phase', { ph: 'champ' }); }
  else { openShop(); broadcastRoster(); broadcast('phase', { ph: 'shop' }); }
}
function showChamp() {
  const order = [...G.players].sort((a, b) => b.points - a.points), w = order[0];
  const c = $('champTruck').getContext('2d'); c.clearRect(0, 0, 216, 144); c.drawImage(Gfx.truckSprite(w.color, w.id + 1), 0, 0, 216, 144);
  $('champName').textContent = w.name; $('champName').style.color = w.color;
  standings($('champTable'));
  document.querySelector('#scr-champ [data-act="menu"]').disabled = G.role === 'guest';
  show('champ'); Sound.fx.finish(true); Sound.say(w.name + ' is the season champion!');
}
function backToSeats() {
  G.race = null; G.season = null; newDemo();
  show('join'); renderJoin(); sendLobby(); broadcast('phase', { ph: 'join' });
}

// ---------------------------------------------------------------- shop
function openShop() {
  if (G.role !== 'guest') for (const p of G.players) p.ready = p.kind === 'cpu';
  G.shopDeadline = G.role === 'host' && remotes().length ? performance.now() + 90000 : 0;
  renderShop(); show('shop');
}
function myShopper(p) { return G.role === 'guest' ? p.id === G.myPid : p.kind === 'local'; }
function renderShop() {
  const box = $('shop'); box.textContent = '';
  for (const p of G.players) {
    if (p.kind === 'cpu') continue;
    const mine = myShopper(p), cur = G.shopCur[p.id] || 0;
    const card = document.createElement('div'); card.className = 'shopcard' + (mine ? '' : ' ro') + (p.ready ? ' ready' : ''); card.style.setProperty('--c', p.color);
    const hd = document.createElement('div'); hd.className = 'hd';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = p.name;
    const cash = document.createElement('span'); cash.className = 'cash'; cash.textContent = money(p.money);
    hd.append(nm, cash); card.append(hd);
    ROWS.forEach((row, k) => {
      const b = document.createElement('button'); b.className = 'btn item' + (row === 'done' ? ' done' : '') + (mine && k === cur ? ' cur' : '');
      b.dataset.pid = p.id; b.dataset.row = row; b.disabled = !mine;
      if (row === 'done') b.textContent = p.ready ? '✓ Ready' : 'Ready';
      else if (row === 'nitro') b.innerHTML = `<span class="lbl">Nitro <small style="color:#7cc0ff">×${p.nitro}</small></span><span class="cost">${money(NITRO_COST)}</span>`;
      else {
        const u = UPGRADES.find(x => x.key === row), lvl = p.upg[row];
        b.innerHTML = `<span class="lbl">${u.label}</span><span class="pips">${Array.from({ length: MAX_UPG }, (_, j) => `<i class="pip${j < lvl ? ' on' : ''}"></i>`).join('')}</span><span class="cost">${lvl >= MAX_UPG ? 'MAX' : money(upgCost(lvl))}</span>`;
        b.title = u.desc;
      }
      card.append(b);
    });
    box.append(card);
  }
  $('shopInfo').textContent = G.seasonInfo ? 'Next: ' + TRACKS[(G.season ? G.season.order[G.season.raceNo] : 0) ?? 0].name : '';
}
function shopDo(pid, row) {
  const p = G.players[pid]; if (!p || !myShopper(p)) return;
  G.shopCur[pid] = ROWS.indexOf(row);
  if (G.role === 'guest') { if (G.conn) G.conn.send('shop', { row }); Sound.fx.select(); renderShop(); return; }
  shopAction(pid, row);
}
function shopAction(pid, row) {
  const p = G.players[pid]; if (!p || p.kind === 'cpu' || !ROWS.includes(row)) return;
  const local = p.kind === 'local';
  if (row === 'done') { p.ready = !p.ready; if (local) Sound.fx.select(); }
  else if (p.ready) return;
  else if (row === 'nitro') { if (p.money >= NITRO_COST) { p.money -= NITRO_COST; p.nitro++; if (local) Sound.fx.buy(); } else if (local) Sound.fx.error(); }
  else { const lvl = p.upg[row]; if (lvl < MAX_UPG && p.money >= upgCost(lvl)) { p.money -= upgCost(lvl); p.upg[row]++; if (local) Sound.fx.buy(); } else if (local) Sound.fx.error(); }
  broadcastRoster(); if (G.screen === 'shop') renderShop();
  checkShopDone();
}
function checkShopDone() {
  if (G.role === 'guest' || G.screen !== 'shop') return;
  if (G.players.every(p => p.kind === 'cpu' || p.ready)) { G.screen = 'leaving-shop'; setTimeout(startRace, 450); }
}
function shopTick() {
  if (G.role !== 'guest' && G.shopDeadline && performance.now() > G.shopDeadline) { for (const p of G.players) p.ready = true; checkShopDone(); return; }
  const shoppers = G.players.filter(p => p.kind !== 'cpu' && myShopper(p));
  for (const p of shoppers) {
    const dev = G.role === 'guest' ? 'any' : Game.deviceFor(p);
    if (dev === 'mouse' || dev === 'touch') continue;
    let cur = G.shopCur[p.id] || 0;
    if (Input.pressed(dev, 'down')) { cur = (cur + 1) % ROWS.length; Sound.fx.ui(); }
    if (Input.pressed(dev, 'up')) { cur = (cur - 1 + ROWS.length) % ROWS.length; Sound.fx.ui(); }
    if (cur !== (G.shopCur[p.id] || 0)) { G.shopCur[p.id] = cur; renderShop(); }
    if (Input.pressed(dev, 'ok') || Input.held(dev, 'right') && Input.pressed(dev, 'right')) shopDo(p.id, ROWS[cur]);
  }
}

// ---------------------------------------------------------------- pause / restart / quit
function pause() {
  if (!G.race || G.screen) return;
  const online = G.role !== 'solo';
  G.paused = !online;
  $('pauseTitle').textContent = online ? 'Menu' : 'Paused';
  $('restartBtn').hidden = online;
  Sound.silenceEngines(); show('pause');
}
function resume() { G.paused = false; show(null); }
function restartRace() {
  if (G.role !== 'solo' || !G.season) return;
  G.preRace.forEach((s, i) => Object.assign(G.players[i], s));
  startRace();
}
function quitRace() {
  G.paused = false;
  if (G.role === 'guest') { leaveOnline(); show('title'); return; }
  if (G.role === 'host') { backToSeats(); return; }
  G.race = null; G.season = null; newDemo(); show('title');
}

// ---------------------------------------------------------------- online: host
const netName = () => { const n = ($('netName').value || '').trim() || 'Driver ' + Math.floor(100 + Math.random() * 900); store('name', n); return n; };
function ensureNet(name) { if (!G.net) G.net = Parley.create({ app: 'superoffroad', name, broker: window.SOR_BROKER || undefined }); else G.net.setName(name); return G.net; }
async function hostGame() {
  const name = netName(); status('Opening a game…');
  try {
    ensureNet(name);
    if (G.hosted) G.hosted.close();
    G.hosted = await G.net.host({ maxPlayers: 3, meta: { v: VERSION } });
    G.role = 'host'; G.slots = [null, null, null, null];
    addLocal(isTouch ? 'touch' : 'kb1', name);
    G.hosted.on('join', onGuestJoin);
    G.hosted.on('error', () => toast('Lost the matchmaking server. Players already here stay connected.'));
    show('join'); renderJoin();
  } catch (e) { status(e.message || String(e), true); }
}
function onGuestJoin(conn) {
  const free = G.slots.findIndex(s => !s);
  if (G.screen !== 'join' || free < 0 || !conn.meta || conn.meta.v !== VERSION) {
    conn.send('full', { reason: free < 0 ? 'That game is full.' : !conn.meta || conn.meta.v !== VERSION ? 'That host runs a different version.' : 'A race is in progress. Try again between seasons.' });
    setTimeout(() => conn.close(), 500); return;
  }
  G.slots[free] = { kind: 'remote', conn, name: conn.name };
  conn.handle('shop', d => { const pid = G.players.findIndex(p => p.conn === conn); if (pid >= 0 && d && typeof d.row === 'string') shopAction(pid, d.row); });
  conn.on('close', () => onGuestLeft(conn));
  toast(conn.name + ' joined'); Sound.fx.join();
  renderJoin(); sendLobby();
}
function onGuestLeft(conn) {
  if (G.role !== 'host') return;
  const k = G.slots.findIndex(s => s && s.conn === conn); if (k >= 0) G.slots[k] = null;
  const p = G.players.find(q => q.conn === conn);
  if (p) { p.kind = 'cpu'; p.conn = null; p.ready = true; }
  toast(conn.name + ' left');
  if (G.screen === 'join') renderJoin();
  sendLobby(); broadcastRoster();
  if (G.screen === 'shop') { renderShop(); checkShopDone(); }
}
function broadcast(type, data) { if (G.role === 'host') for (const c of remotes()) c.send(type, data); }
function sendLobby() {
  if (G.role !== 'host') return;
  const data = { slots: G.slots.map(s => s && { kind: s.kind, name: s.name }), opts, code: G.hosted && G.hosted.code };
  G.slots.forEach((s, i) => { if (s && s.kind === 'remote') { s.conn.send('welcome', { pid: i }); s.conn.send('lobby', data); } });
}
const rosterData = () => G.players.map(p => ({ name: p.name, kind: p.kind, money: p.money, nitro: p.nitro, upg: p.upg, points: p.points, ready: p.ready }));
function broadcastRoster() { if (G.role === 'host') broadcast('roster', rosterData()); }
function copyLink() {
  const code = G.role === 'host' && G.hosted ? G.hosted.code : G.lobby && G.lobby.code; if (!code) return;
  const link = /^https?:/.test(location.protocol) ? location.origin + location.pathname + '#join=' + code : code;
  (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => toast('Copied ' + (link === code ? 'code' : 'invite link')), () => toast(link));
}
function leaveOnline() {
  if (G.role === 'host') { for (const c of remotes()) c.close(); if (G.hosted) G.hosted.close(); G.hosted = null; }
  if (G.role === 'guest' && G.conn) { const c = G.conn; G.conn = null; c.close(); }
  G.role = 'solo'; G.slots = [null, null, null, null]; G.lobby = null;
}

// ---------------------------------------------------------------- online: guest
async function joinGame() {
  const code = ($('netCodeIn').value || '').trim().toUpperCase(), name = netName();
  if (code.length < 4) { status('Type the 4-letter code.', true); return; }
  status('Joining ' + code + '…');
  try { ensureNet(name); const conn = await G.net.join(code, { meta: { v: VERSION } }); setupGuest(conn); }
  catch (e) { status(e.message || String(e), true); }
}
function setupGuest(conn) {
  G.role = 'guest'; G.conn = conn; G.myPid = -1; G.lobby = null; G.players = [];
  conn.handle('welcome', d => { if (d && typeof d.pid === 'number') G.myPid = d.pid; });
  conn.handle('lobby', d => { if (!d || !Array.isArray(d.slots)) return; G.lobby = d; if (G.screen === 'online' || G.screen === 'join') { if (G.screen !== 'join') show('join'); renderJoin(); } });
  conn.handle('full', d => { const m = (d && d.reason) || 'Could not join.'; status(m, true); toast(m); leaveOnline(); });
  conn.handle('roster', d => applyRoster(d));
  conn.handle('phase', d => guestPhase(d));
  conn.handle('snap', d => pushSnap(d));
  conn.handle('fx', list => { if (G.race && Array.isArray(list)) for (const e of list) if (Array.isArray(e)) Gfx.onFx(G.race, e, [G.myPid], false); });
  conn.on('close', reason => {
    if (G.conn !== conn) return;
    G.conn = null; toast(reason === 'left' ? 'The host closed the game.' : 'Lost the connection to the host.');
    G.role = 'solo'; G.race = null; G.lobby = null; G.paused = false; newDemo(); show('title');
  });
  status('Connected. Waiting for the host…');
}
function applyRoster(list) {
  if (!Array.isArray(list)) return;
  G.players = list.slice(0, 4).map((d, i) => Object.assign(newPlayer(i, d.kind, String(d.name || 'Player').slice(0, 20)), {
    money: +d.money || 0, nitro: +d.nitro || 0, upg: d.upg || { tires: 0, shocks: 0, accel: 0, speed: 0 }, points: +d.points || 0, ready: !!d.ready,
  }));
  if (G.race) G.race.players = G.players;
  if (G.screen === 'shop') renderShop();
}
function guestPhase(d) {
  if (!d) return;
  if (d.ph === 'race' && TRACKS[d.ti]) {
    G.raceLabel = d.races > 1 ? 'RACE ' + (d.raceNo + 1) + '/' + d.races : 'SINGLE RACE';
    G.season = { order: [], raceNo: d.raceNo };
    show('loading');
    setTimeout(() => {
      G.race = newRace(d.ti, G.players, { laps: d.laps });
      G.snaps = []; G.snapQ = -1; Gfx.newRaceVisuals(G.race);
      show(null); Sound.music(true, 0.5); Sound.say(TRACKS[d.ti].name);
    }, 30);
  } else if (d.ph === 'results' && d.results) { G.results = d.results; G.seasonInfo = d.info; showResults(); }
  else if (d.ph === 'shop') { G.shopCur = {}; openShop(); }
  else if (d.ph === 'champ') showChamp();
  else if (d.ph === 'join') { G.race = null; newDemo(); show('join'); renderJoin(); }
}
function pushSnap(d) {
  if (!d || typeof d.q !== 'number' || d.q <= G.snapQ || !Array.isArray(d.k)) return;
  G.snapQ = d.q; G.snaps.push({ rt: performance.now(), s: d });
  if (G.snaps.length > 40) G.snaps.shift();
}
function guestInterpolate(r) {
  const buf = G.snaps; if (!buf.length) return;
  const rt = performance.now() - 75;
  let a = buf[0], b = buf[0];
  for (let i = buf.length - 1; i >= 0; i--) if (buf[i].rt <= rt) { a = buf[i]; b = buf[i + 1] || buf[i]; break; }
  const f = a === b ? 0 : clamp((rt - a.rt) / (b.rt - a.rt), 0, 1), A = a.s, B = b.s;
  r.phase = B.ph; r.phaseT = lerp(A.pt, B.pt, A.ph === B.ph ? f : 1); r.clock = lerp(A.c, B.c, f);
  r.trucks.forEach((t, i) => {
    const ka = A.k[i], kb = B.k[i]; if (!ka || !kb) return;
    t.x = lerp(ka[0], kb[0], f); t.y = lerp(ka[1], kb[1], f); t.a = lerpAngle(ka[2], kb[2], f); t.z = lerp(ka[3], kb[3], f);
    t.air = !!kb[4]; t.vx = lerp(ka[5], kb[5], f); t.vy = lerp(ka[6], kb[6], f); t.nos = !!kb[7]; t.lap = kb[8]; t.idx = kb[9];
    t.steer = kb[10]; t.gas = kb[11]; t.slip = kb[12]; t.finished = !!kb[13]; t.place = kb[14]; t.brake = kb[15]; t.ftime = kb[16];
  });
  r.pickups = (B.p || []).map(p => ({ id: p[0], type: p[1] ? 'm' : 'n', x: p[2], y: p[3], z: p[4] }));
}

// ---------------------------------------------------------------- attract-mode demo race behind the menus
function newDemo() {
  const players = [0, 1, 2, 3].map(i => newPlayer(i, 'cpu', CPU_NAMES[i]));
  players.forEach(p => { p.upg = { tires: 2, shocks: 2, accel: 2, speed: 2 }; });
  G.demo = newRace((Math.random() * TRACKS.length) | 0, players, { demo: true, laps: 2 });
  Gfx.newRaceVisuals(G.demo);
}

// ---------------------------------------------------------------- controller setup (bind gas / brake / nitro on any pad or joystick)
const PS = { step: 0, steps: ['GAS', 'BRAKE', 'NITRO'], keys: ['gas', 'brake', 'nitro'], pad: null, base: {}, map: {}, wait: false };
function padSetupStart() { Object.assign(PS, { step: 0, pad: null, base: {}, map: {}, wait: false }); show('padsetup'); padSetupRender(); }
function padSetupTick() {
  const pads = Input.rawPads();
  for (const p of pads) if (!PS.base[p.id]) PS.base[p.id] = { axes: p.axes.slice(), buttons: p.buttons.slice() };
  if (PS.step < 3) {
    for (const p of pads) {
      if (PS.pad && p.id !== PS.pad) continue;
      const base = PS.base[p.id];
      const moved = p.buttons.some((v, k) => v > 0.5 && !(base.buttons[k] > 0.5)) || p.axes.some((v, k) => Math.abs(v - base.axes[k]) > 0.6);
      if (PS.wait) { if (!moved) PS.wait = false; continue; }
      let bind = null;
      const bk = p.buttons.findIndex((v, k) => v > 0.5 && !(base.buttons[k] > 0.5));
      if (bk >= 0) bind = { t: 'b', i: bk };
      else {
        let best = -1, bd = 0.6;
        p.axes.forEach((v, k) => { const d = Math.abs(v - base.axes[k]); if (d > bd) { bd = d; best = k; } });
        if (best >= 0) { const r = Math.round(base.axes[best] * 100) / 100; bind = { t: 'a', i: best, r: Math.abs(r) > 0.9 ? Math.sign(r) : Math.abs(r) < 0.15 ? 0 : r, d: Math.sign(p.axes[best] - base.axes[best]) }; }
      }
      if (bind) {
        PS.pad = p.id; PS.map[PS.keys[PS.step]] = bind; PS.step++; PS.wait = true; Sound.fx.select();
        if (PS.step === 3) { Input.setPadMap(PS.pad, PS.map); toast('Saved controls for ' + PS.pad.replace(/\(.*?\)/g, '').trim().slice(0, 40)); }
        break;
      }
    }
  }
  padSetupRender();
}
function padSetupRender() {
  const pads = Input.rawPads();
  $('psPrompt').textContent = !pads.length ? 'Connect a controller, then press any button on it.'
    : PS.step < 3 ? 'Press the button or pedal you want for ' + PS.steps[PS.step] + (PS.wait ? ' … now let go' : '') : 'Done! Your controls are saved.';
  $('psSteps').textContent = PS.keys.map((k, i) => PS.steps[i] + ': ' + (PS.map[k] ? (PS.map[k].t === 'b' ? 'button ' + PS.map[k].i : 'axis ' + PS.map[k].i + (PS.map[k].d > 0 ? '+' : '−')) : i === PS.step ? '…' : '—')).join('   ·   ');
  const f = v => (v >= 0 ? ' ' : '') + v.toFixed(2);
  $('psLive').textContent = pads.map(p => {
    const r = Input.padRead(p.i) || {};
    return `#${p.i} ${p.id}\n   mapping: ${p.mapping || '(non-standard)'}${Input.padMapFor(p.id) ? '   custom buttons: yes' : ''}${p.trig.length ? '   trigger axes: ' + p.trig.join(',') : ''}\n` +
      `   axes:    ${p.axes.map(f).join(' ')}\n   buttons: ${p.buttons.map((v, k) => v > 0.05 ? k + (v < 0.99 ? '(' + v.toFixed(1) + ')' : '') : null).filter(x => x != null).join(' ') || '(none pressed)'}\n` +
      `   game reads → steer ${f(r.s || 0)}   gas ${(r.g || 0).toFixed(2)}   brake ${(r.b || 0).toFixed(2)}   nitro ${r.nit ? 'ON' : 'off'}`;
  }).join('\n\n') || 'No controllers detected yet. Browsers only report a controller after you press a button on it.';
}

// ---------------------------------------------------------------- pointer lock for the mouse spinner
Gfx.canvas.addEventListener('click', () => {
  if (G.screen || !G.race) return;
  if ((hasLocal('mouse') || (G.role === 'guest' && !isTouch)) && !document.pointerLockElement) Gfx.canvas.requestPointerLock && Gfx.canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && !G.screen && G.race && hasLocal('mouse') && G.role === 'solo') pause();
});
$('pauseBtn').onclick = () => pause();

// ---------------------------------------------------------------- main loop
let last = performance.now(), acc = 0;
function loop(now) { requestAnimationFrame(loop); tick(now); }
function tick(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05); last = Math.max(last, now);
  Input.update();
  // menus
  if (G.screen === 'join') joinTick();
  else if (G.screen === 'shop') shopTick();
  else if (G.screen === 'padsetup') { padSetupTick(); navTick('kb'); }
  else if (G.screen && G.screen !== 'loading') navTick('any');
  else if (!G.screen && G.race && (Input.pressed('any', 'start') && !Input.keys.has('Enter'))) pause();

  const r = activeRace(); if (!r) return;
  const guestRace = G.role === 'guest' && r === G.race;
  if (guestRace) guestInterpolate(r);
  else if (!G.paused) {
    gatherInputs(r, dt);
    acc += dt; let n = 0;
    while (acc >= STEP && n++ < 8) { simStep(r, STEP); acc -= STEP; }
    if (r === G.race && r.phase === 'over' && !G.raceEnded) endRace();
    if (r === G.demo && r.endT && r.t > r.endT) newDemo();
  }
  // network
  if (G.role === 'host' && r === G.race) {
    const cs = remotes();
    if (cs.length && now - G.sendT > 33) { G.sendT = now; const s = snapshot(r); s.q = ++G.snapSeq; for (const c of cs) c.sendFast('snap', s); }
    if (r.fxOut.length) broadcast('fx', r.fxOut);
  }
  r.fxOut.length = 0;
  if (G.role === 'guest' && G.conn && G.race && now - G.sendT > 33) {
    G.sendT = now;
    const d = Input.drive('any');
    G.conn.state({ i: [Math.round(d.s * 100) / 100, Math.round(d.m * 1000) / 1000, Math.round(d.g * 100) / 100, Math.round(d.b * 100) / 100, d.n] });
  }
  // visuals + audio
  const demo = r === G.demo, quiet = demo || G.paused || (!!G.screen && G.screen !== 'loading');
  if (G.paused) Sound.silenceEngines(); else Gfx.update(r, dt, now / 1000, demo ? [] : localPis(), quiet);
  Sound.crowd(demo ? 0.3 : r.phase === 'race' ? 1 : 0.5);
  let hint = null;
  if (!G.screen && G.race && !document.pointerLockElement && (hasLocal('mouse') && G.role !== 'guest')) hint = 'Click the track to grab the mouse (spinner steering)';
  const ping = G.role === 'guest' && G.conn ? G.conn.rtt : null;
  Gfx.draw(r, now / 1000, { hud: !demo, raceLabel: G.raceLabel, hint, ping, debug: G.debug });
}

// ---------------------------------------------------------------- boot
Input.bindTouch($('touch'));
renderOpts();
(async () => {
  try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]); } catch (e) { /* fonts optional */ }
  newDemo(); show('title');
  const m = /^#join=([A-Za-z0-9]{4})$/.exec(location.hash);
  if (m) { history.replaceState(null, '', location.pathname + location.search); act('online'); $('netCodeIn').value = m[1].toUpperCase(); status('Enter your name and press Join.'); }
  requestAnimationFrame(t => { last = t; loop(t); });
})();
