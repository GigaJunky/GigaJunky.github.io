'use strict';
// Race simulation. Runs on the host (or solo). Guests only render snapshots of it.
const GRAV = 650, PRIZE = [100, 60, 40, 20], POINTS = [10, 6, 4, 2];
const COLORS = [
  { name: 'Red', hex: '#ff3b30' }, { name: 'Blue', hex: '#2f7bff' }, { name: 'Yellow', hex: '#ffc21a' }, { name: 'Green', hex: '#2ecc71' },
];
const CPU_NAMES = ['Rattler', 'Dusty', 'Bulldozer', 'Cactus Jack', 'Sidewinder', 'Gravel Gus'];
const UPGRADES = [
  { key: 'tires', label: 'Tires', desc: 'Grip and steering' },
  { key: 'shocks', label: 'Shocks', desc: 'Jumps, bumps, landings' },
  { key: 'accel', label: 'Acceleration', desc: 'Off the line, out of corners' },
  { key: 'speed', label: 'Top Speed', desc: 'Faster on the straights' },
];
const MAX_UPG = 5, NITRO_COST = 8;
const upgCost = lvl => 25 * (lvl + 1);

function newPlayer(slot, kind, name) {
  return { id: slot, name, color: COLORS[slot].hex, colorName: COLORS[slot].name, kind, device: null, conn: null, money: 50, nitro: 3, upg: { tires: 0, shocks: 0, accel: 0, speed: 0 }, points: 0, ready: false };
}

function newRace(trackIdx, players, opts = {}) {
  const track = getTrack(trackIdx);
  const r = {
    trackIdx, track, players, laps: opts.laps || 4, demo: !!opts.demo, diff: opts.diff ?? 1,
    trucks: [], pickups: [], t: 0, phase: 'intro', phaseT: 0, clock: 0, finishOrder: [], nextPick: 3, pid: 1, endT: null, lastBeep: 0, fxOut: [],
  };
  players.forEach((p, i) => {
    const g = track.gridSpot(i), z = track.heightAt(g.x, g.y);
    r.trucks.push({
      pi: i, x: g.x, y: g.y, a: g.a, vx: 0, vy: 0, z, vz: 0, air: false, idx: g.idx, lap: 0, finished: false, ftime: null,
      nitroT: 0, nos: false, steer: 0, gas: 0, brake: 0, slip: 0, surf: 1, speed: 0, lastM: null, lastN: null, pendRot: 0, wantNitro: false,
      stuck: 0, rev: 0, aiLine: rnd(-16, 16), aiLineT: rnd(1, 3), skill: 1, place: i + 1, inp: { s: 0, g: 0, b: 0 }, turn: 0,
    });
  });
  return r;
}

function fx(r, type, x, y, v = 0, pi = -1) {
  const e = [type, Math.round(x), Math.round(y), Math.round(v), pi];
  r.fxOut.push(e);
  Game.onFx(r, e);
}

// Gather one frame of input for every truck (local devices, remote state, or AI).
function gatherInputs(r, dt) {
  const N = r.track.N, hum = r.trucks.filter(t => r.players[t.pi].kind !== 'cpu');
  const leaderHuman = hum.length ? Math.max(...hum.map(t => t.lap * N + t.idx)) : null;
  for (const t of r.trucks) {
    const p = r.players[t.pi];
    let inp;
    if (r.demo || p.kind === 'cpu' || t.finished) inp = ai(r, t, dt, leaderHuman);
    else if (p.kind === 'local') inp = Input.drive(Game.deviceFor(p));
    else {
      const rs = p.conn && p.conn.remoteState && p.conn.remoteState.i;
      inp = Array.isArray(rs) ? { s: +rs[0] || 0, m: +rs[1] || 0, g: +rs[2] || 0, b: +rs[3] || 0, n: +rs[4] || 0 } : { s: 0, g: 0, b: 0 };
    }
    if (inp.m != null) { if (t.lastM == null) t.lastM = inp.m; t.pendRot += clamp(inp.m - t.lastM, -1.5, 1.5); t.lastM = inp.m; }
    if (inp.n != null) { if (t.lastN == null) t.lastN = inp.n; if (inp.n > t.lastN) t.wantNitro = true; t.lastN = inp.n; }
    if (r.phase !== 'race' && r.phase !== 'over') { t.pendRot = 0; t.wantNitro = false; }
    inp.s = clamp(+inp.s || 0, -1, 1); inp.g = clamp(+inp.g || 0, 0, 1); inp.b = clamp(+inp.b || 0, 0, 1);
    t.inp = inp;
  }
}
const progress = t => t.lap * 100000 + t.idx;

function ai(r, t, dt, leaderHuman) {
  const T = r.track, N = T.N, spd = t.speed, p = r.players[t.pi];
  if (p.kind === 'cpu' && !r.demo) {
    const base = [0.86, 0.94, 1.0][r.diff];
    const lapGap = leaderHuman == null ? 0 : (t.lap * N + t.idx - leaderHuman) / N; // laps ahead (+) or behind (-) the best human
    t.skill = base + (lapGap < -0.2 ? 0.07 : lapGap > 0.25 ? -0.06 : 0);
  } else t.skill = r.demo ? 0.95 : 1;
  t.aiLineT -= dt; if (t.aiLineT < 0) { t.aiLineT = rnd(1.5, 4); t.aiLine = rnd(-18, 18); }
  const look = 9 + Math.floor(spd * 0.075), j = (t.idx + look) % N;
  let off = t.aiLine;
  const c = Math.cos(t.a), s = Math.sin(t.a);
  for (const o of r.trucks) {
    if (o === t) continue;
    const dx = o.x - t.x, dy = o.y - t.y, ahead = dx * c + dy * s, side = -dx * s + dy * c;
    if (ahead > 0 && ahead < 60 && Math.abs(side) < 26) off += side > 0 ? -16 : 16;
  }
  off = clamp(off, -30, 30);
  const tx = T.px[j] + T.nx[j] * off, ty = T.py[j] + T.ny[j] * off;
  const diff = wrapAngle(Math.atan2(ty - t.y, tx - t.x) - t.a);
  let st = clamp(diff * 2.4, -1, 1), g = 1, b = 0;
  const k2 = (t.idx + look * 2) % N;
  const curve = Math.abs(wrapAngle(Math.atan2(T.ty[k2], T.tx[k2]) - Math.atan2(T.ty[t.idx], T.tx[t.idx])));
  if (Math.abs(diff) > 0.9) g = 0.35;
  if (curve > 1.2 && spd > 150) g = 0.3;
  if (curve > 1.8 && spd > 120) { g = 0; b = 0.4; }
  if (t.finished) g = Math.min(g, 0.55);
  if (r.phase === 'race' && spd < 14 && !t.air && t.rev <= 0) t.stuck += dt; else t.stuck = Math.max(0, t.stuck - dt * 2);
  if (t.stuck > 1.1) { t.rev = 0.7; t.stuck = 0; }
  if (t.rev > 0) { t.rev -= dt; return { s: -st, g: 0, b: 1 }; }
  if ((p.kind === 'cpu' || r.demo) && !t.finished && (p.nitro > 0 || r.demo) && curve < 0.35 && spd > 80 && t.nitroT <= 0 && Math.random() < 0.6 * dt) t.wantNitro = true;
  return { s: st, g, b };
}

function stepTruck(r, t, dt) {
  const inp = t.inp, pl = r.players[t.pi], u = pl.upg, T = r.track, sp = SURF_PHYS[t.surf] || SURF_PHYS[1];
  if (t.wantNitro) {
    t.wantNitro = false;
    if (t.nitroT <= 0.15 && (pl.nitro > 0 || r.demo)) { if (!r.demo) pl.nitro--; t.nitroT = 1.6; fx(r, 'nitro', t.x, t.y, 0, t.pi); }
  }
  if (t.nitroT > 0) t.nitroT -= dt;
  const nitro = t.nitroT > 0; t.nos = nitro;
  const skill = pl.kind === 'cpu' || r.demo ? t.skill : 1;
  const maxSpd = 190 * (1 + 0.06 * u.speed) * skill * (nitro ? 1.42 : 1) * sp.max;
  const acc = 300 * (1 + 0.12 * u.accel) * (nitro ? 1.9 : 1) * (0.6 + 0.4 * sp.max);

  const c0 = Math.cos(t.a), s0 = Math.sin(t.a), vf0 = t.vx * c0 + t.vy * s0;
  const tr = 3.5 * (1 + 0.04 * u.tires) * (t.air ? 0.25 + 0.06 * u.shocks : 1) * (0.42 + 0.58 * Math.min(1, Math.abs(vf0) / 70));
  let da = inp.s * tr * dt;
  if (t.pendRot) { const k = clamp(t.pendRot, -0.25, 0.25); da += k * (t.air ? 0.3 : 1); t.pendRot -= k; }
  t.a = wrapAngle(t.a + da);
  t.turn = da / dt;
  t.steer += (clamp(t.turn / 3.5, -1, 1) - t.steer) * Math.min(1, dt * 14);

  const c = Math.cos(t.a), s = Math.sin(t.a);
  let vf = t.vx * c + t.vy * s, vl = -t.vx * s + t.vy * c;
  t.gas = inp.g; t.brake = 0;
  if (!t.air) {
    const g = inp.g, b = inp.b;
    if (g > 0.02 && vf < maxSpd) vf += acc * g * Math.max(0.12, 1 - Math.pow(Math.max(0, vf) / maxSpd, 2)) * dt;
    if (b > 0.02) { if (vf > 8) { vf -= 430 * b * dt; t.brake = b; } else if (vf > -75) vf -= 170 * b * dt; }
    if (vf > maxSpd) vf -= (vf - maxSpd) * 2.2 * dt;
    vf -= vf * sp.drag * (t.surf === 4 ? 1 - 0.12 * u.shocks : 1) * dt;
    if (g < 0.02 && b < 0.02) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 55 * dt);
    t.slip = Math.abs(vl);
    vl *= Math.exp(-9 * (1 + 0.15 * u.tires) * sp.grip * dt);
  } else t.slip = 0;
  t.vx = vf * c - vl * s; t.vy = vf * s + vl * c;
  t.x += t.vx * dt; t.y += t.vy * dt;

  updateProgress(r, t);
  walls(r, t);

  const gh = T.heightAt(t.x, t.y);
  if (t.air) {
    t.vz -= GRAV * dt; t.z += t.vz * dt;
    if (t.z <= gh) {
      const imp = -t.vz; t.z = gh; t.air = false; t.vz = 0;
      if (imp > 110) {
        fx(r, 'land', t.x, t.y, imp, t.pi);
        const loss = clamp((imp - 200) / 1600, 0, 0.22) * (1 - 0.13 * u.shocks);
        t.vx *= 1 - loss; t.vy *= 1 - loss;
      }
    }
  } else {
    const gvz = clamp((gh - t.z) / dt, -300, 300);
    if (t.vz > 30 && gvz < t.vz - GRAV * dt * 1.5) { t.air = true; t.vz = Math.min(t.vz, 165 + 8 * u.shocks); t.z += t.vz * dt; }
    else { t.vz += (gvz - t.vz) * 0.6; t.z = gh; }
  }
  const ns = T.surfAt(t.x, t.y) || 1;
  if (ns !== t.surf && !t.air && t.speed > 60) { if (ns === 3) fx(r, 'splash', t.x, t.y, t.speed, t.pi); else if (ns === 2) fx(r, 'mud', t.x, t.y, t.speed, t.pi); }
  t.surf = ns;
  t.speed = Math.hypot(t.vx, t.vy);
}

function walls(r, t) {
  const T = r.track, i = t.idx, nx = T.nx[i], ny = T.ny[i];
  const lat = (t.x - T.px[i]) * nx + (t.y - T.py[i]) * ny, lim = HALF_W - 11;
  if (Math.abs(lat) <= lim) return;
  const sg = Math.sign(lat), pen = Math.abs(lat) - lim;
  t.x -= nx * sg * pen; t.y -= ny * sg * pen;
  const vn = (t.vx * nx + t.vy * ny) * sg;
  if (vn > 0) {
    t.vx -= nx * sg * vn * 1.35; t.vy -= ny * sg * vn * 1.35;
    t.vx *= 0.985; t.vy *= 0.985;
    if (vn > 55) { fx(r, 'wall', t.x + nx * sg * 12, t.y + ny * sg * 12, vn, t.pi); t.a += (Math.random() - 0.5) * vn * 0.002; }
  }
}

function updateProgress(r, t) {
  const N = r.track.N, prev = t.idx;
  t.idx = r.track.nearest(t.x, t.y, prev);
  const d = t.idx - prev;
  if (d < -N / 2) onLap(r, t, 1); else if (d > N / 2) t.lap--;
}

function onLap(r, t, dir) {
  t.lap += dir;
  if (t.finished || r.demo) { if (r.demo && t.lap > r.laps && !r.endT) r.endT = r.t + 3; return; }
  const human = r.players[t.pi].kind !== 'cpu';
  if (t.lap > r.laps) {
    t.finished = true; t.ftime = r.clock; r.finishOrder.push(t.pi);
    fx(r, 'finish', t.x, t.y, r.finishOrder.length, t.pi);
    if (r.finishOrder.length === 1 && !r.endT) r.endT = r.t + 30;
  } else if (t.lap === r.laps && human) fx(r, 'final', t.x, t.y, 0, t.pi);
  else if (t.lap > 1 && human) fx(r, 'lap', t.x, t.y, t.lap, t.pi);
}

function collide(r) {
  const T = r.trucks, MIN = 24;
  for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
    const a = T[i], b = T[j];
    if (Math.abs(a.z - b.z) > 14) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
    if (d2 >= MIN * MIN || d2 < 1e-4) continue;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = (MIN - d) / 2;
    a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
    const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rv < 0) {
      const j2 = rv * 0.8;
      a.vx += nx * j2; a.vy += ny * j2; b.vx -= nx * j2; b.vy -= ny * j2;
      if (-rv > 45) { fx(r, 'bump', (a.x + b.x) / 2, (a.y + b.y) / 2, -rv, i); a.a += rnd(-0.08, 0.08); b.a += rnd(-0.08, 0.08); }
    }
  }
}

function stepPickups(r, dt) {
  const T = r.track;
  r.nextPick -= dt;
  if (r.nextPick <= 0 && r.pickups.length < 3) {
    r.nextPick = rnd(3, 6);
    for (let k = 0; k < 12; k++) {
      const i = (Math.random() * T.N) | 0, la = rnd(-28, 28), x = T.px[i] + T.nx[i] * la, y = T.py[i] + T.ny[i] * la;
      if (r.trucks.some(t => Math.hypot(t.x - x, t.y - y) < 140)) continue;
      if (T.surfAt(x, y) === 3) continue;
      const type = Math.random() < 0.6 ? 'n' : 'm';
      r.pickups.push({ id: r.pid++, type, x, y, z: T.heightAt(x, y), v: type === 'm' ? pick([5, 10, 10, 15, 20]) : 1, age: 0 });
      break;
    }
  }
  for (let k = r.pickups.length - 1; k >= 0; k--) {
    const p = r.pickups[k]; p.age += dt;
    let got = null;
    for (const t of r.trucks) if (Math.hypot(t.x - p.x, t.y - p.y) < 21 && Math.abs(t.z - p.z) < 18) { got = t; break; }
    if (got) {
      const pl = r.players[got.pi];
      if (!r.demo) { if (p.type === 'n') pl.nitro++; else pl.money += p.v; }
      fx(r, p.type === 'n' ? 'pickN' : 'pickM', p.x, p.y, p.v, got.pi);
      r.pickups.splice(k, 1);
    } else if (p.age > 14) r.pickups.splice(k, 1);
  }
}

function rankTrucks(r) {
  const order = [...r.trucks].sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished) return r.finishOrder.indexOf(a.pi) - r.finishOrder.indexOf(b.pi);
    return progress(b) - progress(a);
  });
  order.forEach((t, k) => { t.place = k + 1; });
  return order;
}

function simStep(r, dt) {
  r.t += dt; r.phaseT += dt;
  if (r.phase === 'intro' && r.phaseT > (r.demo ? 0.5 : 2.4)) { r.phase = 'count'; r.phaseT = 0; }
  if (r.phase === 'count') {
    const n = 3 - Math.floor(r.phaseT);
    if (n >= 1 && n !== r.lastBeep) { r.lastBeep = n; if (!r.demo) fx(r, 'beep', 0, 0, n); }
    if (r.phaseT >= 3) { r.phase = 'race'; r.phaseT = 0; if (!r.demo) fx(r, 'beep', 0, 0, 0); }
  }
  const racing = r.phase === 'race' || r.phase === 'over';
  if (racing) {
    r.clock += dt;
    for (const t of r.trucks) stepTruck(r, t, dt);
    collide(r);
    if (!r.demo) stepPickups(r, dt);
    rankTrucks(r);
    if (!r.demo && r.phase === 'race') {
      const humans = r.trucks.filter(t => r.players[t.pi].kind !== 'cpu');
      if ((humans.length && humans.every(t => t.finished) || r.trucks.every(t => t.finished)) && (!r.endT || r.endT > r.t + 2.5)) r.endT = r.t + 2.5;
    }
    if (r.endT && r.t >= r.endT && r.phase === 'race') { r.phase = 'over'; r.phaseT = 0; }
  } else {
    for (const t of r.trucks) { t.gas = t.inp.g; t.slip = 0; t.speed = 0; }
  }
}

function raceResults(r) {
  return rankTrucks(r).map((t, k) => ({ pi: t.pi, place: k + 1, time: t.finished ? t.ftime : null, prize: PRIZE[k], points: POINTS[k] }));
}

function snapshot(r) {
  const R1 = v => Math.round(v * 10) / 10;
  return {
    ph: r.phase, pt: Math.round(r.phaseT * 100) / 100, c: Math.round(r.clock * 100) / 100,
    k: r.trucks.map(t => [R1(t.x), R1(t.y), Math.round(t.a * 1000) / 1000, R1(t.z), t.air ? 1 : 0, Math.round(t.vx), Math.round(t.vy), t.nos ? 1 : 0, t.lap, t.idx,
      Math.round(t.steer * 100) / 100, Math.round(t.gas * 100) / 100, Math.round(t.slip), t.finished ? 1 : 0, t.place, t.brake > 0 ? 1 : 0, t.ftime]),
    p: r.pickups.map(p => [p.id, p.type === 'n' ? 0 : 1, Math.round(p.x), Math.round(p.y), Math.round(p.z)]),
  };
}
