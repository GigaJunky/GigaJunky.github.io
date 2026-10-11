'use strict';
// Rendering, particles, per-frame visual effects and engine audio mapping.
const Gfx = (() => {
  const cv = $('game'), ctx = cv.getContext('2d');
  let cw = 0, ch = 0, dpr = 1, S = 1, OX = 0, OY = 0;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const decal = mk(WORLD_W, WORLD_H), dctx = decal.getContext('2d');
  const light = mk(WORLD_W / 2, WORLD_H / 2), lctx = light.getContext('2d');
  let shake = 0, flash = 0;
  const vis = [], parts = [], texts = [], banners = [];

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = Math.round(innerWidth * dpr); ch = Math.round(innerHeight * dpr);
    cv.width = cw; cv.height = ch;
    S = Math.min(cw / WORLD_W, ch / WORLD_H); OX = (cw - WORLD_W * S) / 2; OY = (ch - WORLD_H * S) / 2;
  }
  addEventListener('resize', resize); resize();

  // ---------------------------------------------------------------- sprites
  function shadeHex(hex, k) {
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (k > 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; } else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  const SS = 4;
  function truckSprite(hex, num) {
    const c0 = mk(36 * SS, 24 * SS), c = c0.getContext('2d'); c.scale(SS, SS); c.translate(18, 12);
    c.fillStyle = '#16181d'; roundRect(c, -15.5, -7.2, 31, 14.4, 3); c.fill();
    let g = c.createLinearGradient(0, -8.5, 0, 8.5); g.addColorStop(0, shadeHex(hex, 0.4)); g.addColorStop(0.45, hex); g.addColorStop(1, shadeHex(hex, -0.5));
    c.fillStyle = g; roundRect(c, -14.5, -8, 29.5, 16, 4); c.fill();
    c.fillStyle = shadeHex(hex, -0.35); roundRect(c, -13.6, -6.3, 10.6, 12.6, 1.5); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 0.6;
    for (const x of [-12, -4.5]) { c.beginPath(); c.moveTo(x, -5.6); c.lineTo(x, 5.6); c.stroke(); }
    c.fillStyle = '#0d0d0d'; c.beginPath(); c.arc(-8.3, 0, 3.7, 0, TAU); c.fill();
    c.fillStyle = '#3d3d3d'; c.beginPath(); c.arc(-8.3, 0, 1.7, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.75)'; c.fillRect(-14.2, -7.7, 9, 0.9); c.fillRect(-14.2, 6.8, 9, 0.9);
    g = c.createLinearGradient(0, -6.5, 0, 6.5); g.addColorStop(0, shadeHex(hex, 0.55)); g.addColorStop(1, shadeHex(hex, -0.2));
    c.fillStyle = g; roundRect(c, -3, -6.6, 9, 13.2, 2.5); c.fill();
    g = c.createLinearGradient(5.8, 0, 9.2, 0); g.addColorStop(0, '#0a1119'); g.addColorStop(1, '#46637f');
    c.fillStyle = g; c.beginPath(); c.moveTo(5.8, -6.2); c.lineTo(9.1, -5.4); c.lineTo(9.1, 5.4); c.lineTo(5.8, 6.2); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(6.7, -4.2); c.lineTo(8.3, -1.4); c.stroke();
    c.fillStyle = '#0a1119'; c.fillRect(-3.6, -5.6, 0.8, 11.2);
    c.fillStyle = shadeHex(hex, 0.15); roundRect(c, 9.6, -3.2, 4.2, 6.4, 1.2); c.fill();
    c.fillStyle = '#121212'; c.fillRect(10.4, -1.7, 2.3, 3.4);
    c.fillStyle = '#d8dde4'; c.fillRect(-1.3, -6.9, 1.1, 13.8);
    for (const y of [-4.6, -1.6, 1.6, 4.6]) { c.fillStyle = '#fff6c8'; c.beginPath(); c.arc(-0.75, y, 0.85, 0, TAU); c.fill(); }
    c.fillStyle = '#fff'; c.beginPath(); c.arc(2.5, 0, 3.1, 0, TAU); c.fill();
    c.fillStyle = '#111'; c.font = '700 4.6px Bungee, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.save(); c.translate(2.5, 0.25); c.rotate(Math.PI / 2); c.fillText(String(num), 0, 0.2); c.restore();
    c.fillStyle = '#2b2e35'; roundRect(c, 14, -7.2, 2.3, 14.4, 1); c.fill(); roundRect(c, -16.3, -6.6, 1.9, 13.2, 0.8); c.fill();
    c.fillStyle = '#fffbe0'; c.fillRect(14.7, -6.3, 1.1, 2.4); c.fillRect(14.7, 3.9, 1.1, 2.4);
    c.fillStyle = '#ff2a1a'; c.fillRect(-16.1, -5.9, 0.9, 2.2); c.fillRect(-16.1, 3.7, 0.9, 2.2);
    c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 0.5; roundRect(c, -14.5, -8, 29.5, 16, 4); c.stroke();
    return c0;
  }
  const wheelFrames = [0, 1, 2, 3].map(f => {
    const c0 = mk(10 * SS, 6 * SS), c = c0.getContext('2d'); c.scale(SS, SS);
    const g = c.createLinearGradient(0, 0, 0, 6); g.addColorStop(0, '#3a3a3a'); g.addColorStop(0.5, '#151515'); g.addColorStop(1, '#050505');
    c.fillStyle = g; roundRect(c, 0.3, 0.3, 9.4, 5.4, 1.6); c.fill();
    c.fillStyle = 'rgba(0,0,0,.65)'; for (let x = -2 + f * 0.6; x < 10; x += 2.4) c.fillRect(x, 0.3, 1, 5.4);
    return c0;
  });
  const shadowSpr = (() => {
    const c0 = mk(120, 80), c = c0.getContext('2d');
    c.shadowColor = 'rgba(0,0,0,1)'; c.shadowBlur = 14; c.shadowOffsetX = 2000;
    c.fillStyle = '#000'; roundRect(c, 60 - 34 - 2000, 40 - 23, 68, 46, 12); c.fill();
    return c0;
  })();
  const softCache = {};
  function soft(r, g, b) {
    const k = r + ',' + g + ',' + b; if (softCache[k]) return softCache[k];
    const c0 = mk(64, 64), c = c0.getContext('2d'), gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${k},1)`); gr.addColorStop(0.4, `rgba(${k},.55)`); gr.addColorStop(1, `rgba(${k},0)`);
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64); return (softCache[k] = c0);
  }
  const SP = {
    dust: soft(232, 210, 178), dustD: soft(186, 150, 112), smoke: soft(120, 120, 128), mud: soft(70, 48, 30), water: soft(200, 225, 245),
    fire: soft(255, 150, 40), blue: soft(90, 160, 255), spark: soft(255, 220, 120), white: soft(255, 255, 255), gold: soft(255, 210, 80),
  };
  const confettiCols = ['#ff3b30', '#2f7bff', '#ffc21a', '#2ecc71', '#fff', '#ff8a1f'];
  const pickSpr = {
    n: (() => {
      const c0 = mk(24 * SS, 24 * SS), c = c0.getContext('2d'); c.scale(SS, SS); c.translate(12, 12);
      const g = c.createLinearGradient(-5, 0, 5, 0); g.addColorStop(0, '#0c3a8a'); g.addColorStop(0.45, '#5aa8ff'); g.addColorStop(1, '#0a2a66');
      c.fillStyle = g; roundRect(c, -5, -8, 10, 16, 3); c.fill();
      c.fillStyle = '#cfd6df'; roundRect(c, -2.5, -10, 5, 3, 1); c.fill();
      c.fillStyle = '#fff'; c.font = '700 8px Bungee, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', 0, 1);
      return c0;
    })(),
    m: (() => {
      const c0 = mk(24 * SS, 24 * SS), c = c0.getContext('2d'); c.scale(SS, SS); c.translate(12, 13);
      const g = c.createRadialGradient(-2, -1, 1, 0, 1, 9); g.addColorStop(0, '#f3dfa8'); g.addColorStop(1, '#8f6b2c');
      c.fillStyle = g; c.beginPath(); c.arc(0, 1.5, 7.5, 0, TAU); c.fill();
      c.beginPath(); c.moveTo(-3, -5); c.lineTo(3, -5); c.lineTo(4.5, -9); c.lineTo(-4.5, -9); c.closePath(); c.fill();
      c.fillStyle = '#5b3a12'; c.fillRect(-3.5, -6, 7, 1.6);
      c.fillStyle = '#1f7a35'; c.font = '700 9px Bungee, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('$', 0, 2);
      return c0;
    })(),
  };
  let truckSprites = [];
  function setPlayers(players) { truckSprites = players.map((p, i) => truckSprite(p.color, i + 1)); }

  // ---------------------------------------------------------------- particles
  function emit(o) {
    if (parts.length > 1800) parts.shift();
    parts.push(Object.assign({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, life: 1, max: 1, size: 6, grow: 0, a: 0.5, spr: SP.dust, layer: 0, drag: 1.5, add: false, rot: 0, vr: 0, col: null }, o, { max: o.life || 1 }));
  }
  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.g) { p.vz -= p.g * dt; p.z += p.vz * dt; if (p.z < 0) { p.z = 0; p.vz *= -0.25; p.vx *= 0.5; p.vy *= 0.5; } }
      else p.z += p.vz * dt;
      p.size += p.grow * dt; p.rot += p.vr * dt;
    }
  }
  function drawParts(layer) {
    for (const p of parts) {
      if (p.layer !== layer) continue;
      const f = p.life / p.max, al = p.a * (p.fadeIn ? Math.min(1, (1 - f) * 6) : 1) * f;
      if (al <= 0.003) continue;
      ctx.globalAlpha = al; ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
      if (p.col) {
        ctx.save(); ctx.translate(p.x, p.y - p.z * 0.7); ctx.rotate(p.rot); ctx.fillStyle = p.col; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore();
      } else ctx.drawImage(p.spr, p.x - p.size / 2, p.y - p.z * 0.7 - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function burstDust(x, y, n, spd, spr = SP.dust, size = 10) {
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = rnd(0.3, 1) * spd; emit({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.8, 1.6), size: rnd(size * 0.6, size), grow: rnd(14, 30), a: 0.42, spr, drag: 2.2 }); }
  }

  // ---------------------------------------------------------------- per-frame visuals (shared by host and guest)
  function newRaceVisuals(r) {
    dctx.clearRect(0, 0, WORLD_W, WORLD_H); parts.length = 0; texts.length = 0; banners.length = 0; vis.length = 0;
    r.trucks.forEach(() => vis.push({ rpm: 0.2, acc: 0, lw: null, roll: 0, wheel: 0, ground: 0 }));
    setPlayers(r.players);
  }
  function update(r, dt, now, localPis, quiet) {
    const T = r.track;
    for (let i = 0; i < r.trucks.length; i++) {
      const t = r.trucks[i], v = vis[i]; if (!v) continue;
      const c = Math.cos(t.a), s = Math.sin(t.a), spd = Math.hypot(t.vx, t.vy), vf = t.vx * c + t.vy * s;
      v.ground = T.heightAt(t.x, t.y);
      const above = Math.max(0, t.z - v.ground);
      const surf = T.surfAt(t.x, t.y) || 1;
      v.wheel += vf * dt * 0.5;
      v.roll += ((t.steer || 0) * Math.min(1, spd / 150) - v.roll) * Math.min(1, dt * 6);
      // engine audio
      let rpmT;
      if (spd < 6) rpmT = 0.18 + (t.gas || 0) * 0.62;
      else { const gears = [0, 55, 100, 145, 195, 600]; let gI = 0; while (gI < 4 && spd > gears[gI + 1]) gI++; rpmT = 0.3 + 0.7 * clamp((spd - gears[gI]) / (gears[gI + 1] - gears[gI]), 0, 1); }
      if (t.air) rpmT = Math.min(1.1, rpmT + 0.25 * (t.gas || 0));
      v.rpm += (rpmT - v.rpm) * Math.min(1, dt * 8);
      const mine = localPis.includes(t.pi);
      const vol = quiet ? 0.18 : mine ? 1 : 0.5;
      Sound.engine(i, v.rpm, t.gas || 0, vol, t.x / (WORLD_W / 2) - 1, t.air ? 0 : clamp((t.slip || 0) / 110, 0, 1), t.air ? 0 : clamp(spd / 230, 0, 1), t.nos ? 1 : 0);
      // dust / spray / mud
      const rx = t.x - c * 11, ry = t.y - s * 11;
      if (!t.air && spd > 22) {
        v.acc += dt * (spd / 200 * (surf === 3 ? 34 : 22) + Math.min(30, (t.slip || 0) * 0.35));
        while (v.acc > 1) {
          v.acc -= 1;
          const side = Math.random() < 0.5 ? -1 : 1, wx = rx - s * 8 * side, wy = ry + c * 8 * side;
          const bx = -t.vx * 0.12 + rnd(-18, 18), by = -t.vy * 0.12 + rnd(-18, 18);
          if (surf === 3) {
            emit({ x: wx, y: wy, vx: bx * 1.5 + -s * side * rnd(30, 70), vy: by * 1.5 + c * side * rnd(30, 70), z: 2, vz: rnd(60, 150), g: 500, life: rnd(0.4, 0.8), size: rnd(2, 4), a: 0.85, spr: SP.water, layer: 1, drag: 1 });
            emit({ x: wx, y: wy, vx: bx, vy: by, life: rnd(0.5, 1), size: rnd(8, 14), grow: 20, a: 0.25, spr: SP.water, layer: 1, drag: 2 });
          } else if (surf === 2) {
            emit({ x: wx, y: wy, vx: bx * 1.3, vy: by * 1.3, z: 2, vz: rnd(50, 140), g: 520, life: rnd(0.5, 1), size: rnd(2.5, 4.5), a: 0.95, spr: SP.mud, layer: 1, drag: 1 });
          } else {
            emit({ x: wx, y: wy, vx: bx, vy: by, life: rnd(0.9, 1.7), size: rnd(8, 13), grow: rnd(22, 40), a: surf === 4 ? 0.62 : 0.5, spr: Math.random() < 0.3 ? SP.dustD : SP.dust, layer: 1, drag: 2.2, fadeIn: true });
          }
        }
      }
      if (t.nos) {
        for (let k = 0; k < 2; k++) {
          emit({ x: t.x - c * 16, y: t.y - s * 16, z: above, vx: -c * rnd(80, 160) + t.vx * 0.6, vy: -s * rnd(80, 160) + t.vy * 0.6, life: rnd(0.08, 0.18), size: rnd(7, 12), a: 0.9, spr: SP.fire, layer: 2, add: true, drag: 0 });
          emit({ x: t.x - c * 15, y: t.y - s * 15, z: above, vx: -c * 60 + t.vx * 0.8, vy: -s * 60 + t.vy * 0.8, life: 0.07, size: 6, a: 0.9, spr: SP.blue, layer: 2, add: true, drag: 0 });
        }
      }
      // tire marks
      const lx = rx + s * 8, ly = ry - c * 8, qx = rx - s * 8, qy = ry + c * 8;
      if (!t.air && v.lw && surf !== 3 && spd > 4) {
        const al = Math.min(0.32, 0.045 + (t.slip || 0) * 0.0035 + (surf === 2 ? 0.16 : 0));
        dctx.strokeStyle = surf === 2 ? `rgba(28,18,10,${al})` : `rgba(52,34,20,${al})`;
        dctx.lineWidth = surf === 2 ? 4.5 : 3.2; dctx.lineCap = 'round';
        dctx.beginPath(); dctx.moveTo(v.lw[0], v.lw[1]); dctx.lineTo(lx, ly); dctx.moveTo(v.lw[2], v.lw[3]); dctx.lineTo(qx, qy); dctx.stroke();
      }
      v.lw = t.air ? null : [lx, ly, qx, qy];
    }
    // crowd camera flashes
    if (T.crowd.length && Math.random() < dt * (r.phase === 'race' ? 6 : 2)) { const [x, y] = pick(T.crowd); emit({ x, y, life: 0.12, size: rnd(8, 16), a: 1, spr: SP.white, layer: 3, add: true, drag: 0 }); }
    updateParts(dt);
    for (let i = texts.length - 1; i >= 0; i--) { texts[i].life -= dt; texts[i].y -= 26 * dt; if (texts[i].life <= 0) texts.splice(i, 1); }
    for (let i = banners.length - 1; i >= 0; i--) { banners[i].life -= dt; if (banners[i].life <= 0) banners.splice(i, 1); }
    shake = Math.max(0, shake - dt * 30); flash = Math.max(0, flash - dt * 3);
  }

  // Effects coming from the simulation (locally or over the network).
  const MUTE = new Proxy({}, { get: () => () => {} });
  function onFx(r, e, localPis, quiet) {
    const SF = quiet ? MUTE : Sound.fx;
    const [type, x, y, v, pi] = e, pan = x / (WORLD_W / 2) - 1, P = r.players[pi], mine = localPis.includes(pi);
    switch (type) {
      case 'land': SF.land(v, pan); burstDust(x, y, Math.min(26, 6 + v / 25), 40 + v * 0.15, SP.dust, 14); if (v > 300) shake = Math.max(shake, Math.min(9, v / 70)); break;
      case 'wall': SF.wall(v, pan); for (let i = 0; i < 10; i++) emit({ x, y, vx: rnd(-160, 160), vy: rnd(-160, 160), z: 4, vz: rnd(30, 120), g: 400, life: rnd(0.2, 0.45), size: rnd(3, 6), a: 1, spr: SP.spark, layer: 2, add: true, drag: 3 }); burstDust(x, y, 4, 40); if (mine) shake = Math.max(shake, Math.min(6, v / 50)); break;
      case 'bump': SF.bump(v, pan); for (let i = 0; i < 6; i++) emit({ x, y, vx: rnd(-120, 120), vy: rnd(-120, 120), life: rnd(0.15, 0.3), size: rnd(3, 6), a: 1, spr: SP.spark, layer: 2, add: true, drag: 3 }); break;
      case 'splash': SF.splash(v, pan); for (let i = 0; i < 26; i++) { const a = Math.random() * TAU, sp = rnd(40, 140); emit({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, z: 2, vz: rnd(100, 260), g: 600, life: rnd(0.5, 0.9), size: rnd(2.5, 5), a: 0.9, spr: SP.water, layer: 2, drag: 1 }); } break;
      case 'mud': SF.mud(v, pan); for (let i = 0; i < 14; i++) { const a = Math.random() * TAU, sp = rnd(30, 110); emit({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, z: 2, vz: rnd(80, 200), g: 600, life: rnd(0.5, 0.9), size: rnd(3, 5), a: 1, spr: SP.mud, layer: 2, drag: 1 }); } break;
      case 'nitro': SF.nitro(pan); if (mine) flash = 0.35; for (let i = 0; i < 12; i++) emit({ x, y, vx: rnd(-90, 90), vy: rnd(-90, 90), life: rnd(0.2, 0.5), size: rnd(10, 20), grow: 30, a: 0.6, spr: SP.blue, layer: 2, add: true }); break;
      case 'pickN': SF.pickNitro(pan); ring(x, y, SP.blue); texts.push({ text: '+1 NITRO', x, y: y - 14, life: 1.2, color: '#7cc0ff' }); break;
      case 'pickM': SF.cash(pan); ring(x, y, SP.gold); texts.push({ text: '+' + money(v), x, y: y - 14, life: 1.2, color: '#ffd76a' }); break;
      case 'beep': SF.beep(v === 0);  break;
      case 'lap': if (mine) SF.lap(pan); break;
      case 'final': if (P) { SF.finalLap(); banner(P.name.toUpperCase() + ' · FINAL LAP', P.color); } break;
      case 'finish': if (P) {
        SF.finish(v === 1);
        banner(P.name.toUpperCase() + ' FINISHES ' + ordinal(v), P.color, 3);
        if (v === 1) { for (let i = 0; i < 90; i++) emit({ x: rnd(500, 1100), y: rnd(100, 200), vx: rnd(-80, 80), vy: rnd(40, 160), life: rnd(2, 3.5), size: rnd(5, 8), a: 1, col: pick(confettiCols), layer: 3, drag: 0.6, vr: rnd(-8, 8) }); if (!quiet) Sound.say(P.name + ' wins!'); }
      } break;
    }
  }
  function ring(x, y, spr) { for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; emit({ x, y, vx: Math.cos(a) * 110, vy: Math.sin(a) * 110, life: 0.45, size: 9, a: 0.9, spr, layer: 2, add: true, drag: 3 }); } }
  function banner(text, color, life = 2.4) { banners.push({ text, color, life, max: life }); if (banners.length > 3) banners.shift(); }

  // ---------------------------------------------------------------- draw
  function drawTruck(r, t, i, v) {
    const spr = truckSprites[i]; if (!spr) return;
    const above = Math.max(0, t.z - v.ground);
    const c = Math.cos(t.a), s = Math.sin(t.a);
    const sx = t.x, sy = t.y - above * 0.7, sc = 1 + above * 0.007 + t.z * 0.0015;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(t.a); ctx.scale(sc, sc);
    const wf = wheelFrames[((Math.floor(v.wheel) % 4) + 4) % 4], drop = t.air ? 0.8 : 0;
    for (const [wx, wy, front] of [[-9.8, -8.6, 0], [-9.8, 8.6, 0], [9.6, -8.6, 1], [9.6, 8.6, 1]]) {
      ctx.save(); ctx.translate(wx, wy + Math.sign(wy) * drop); if (front) ctx.rotate((t.steer || 0) * 0.5);
      ctx.drawImage(wf, -5, -3, 10, 6); ctx.restore();
    }
    ctx.translate(0, v.roll * 0.9);
    ctx.drawImage(spr, -18, -12, 36, 24);
    if (t.brake) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.8; ctx.drawImage(SP.fire, -22, -9, 8, 8); ctx.drawImage(SP.fire, -22, 1, 8, 8); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    ctx.restore();
    // player tag
    const P = r.players[t.pi];
    if (P && P.kind !== 'cpu' && !r.demo) {
      ctx.save(); ctx.translate(sx, sy - 24 * sc);
      ctx.fillStyle = P.color; ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(4, -4); ctx.lineTo(0, 1); ctx.closePath(); ctx.fill();
      ctx.font = '700 9px Rajdhani, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 2.5;
      const tag = 'P' + (t.pi + 1); ctx.strokeText(tag, 0, -7); ctx.fillText(tag, 0, -7); ctx.restore();
    }
    void c; void s;
  }

  function draw(r, now, ui) {
    const T = r.track;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#07080c'; ctx.fillRect(0, 0, cw, ch);
    const shx = shake ? rnd(-shake, shake) * S : 0, shy = shake ? rnd(-shake, shake) * S : 0;
    ctx.setTransform(S, 0, 0, S, OX + shx, OY + shy);
    ctx.drawImage(T.canvas, 0, 0);
    ctx.globalAlpha = 0.92; ctx.drawImage(T.water, 0, 0);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.35 * Math.sin(now * 2.1);
    ctx.drawImage(T.sparkle, Math.sin(now * 0.9) * 2.5, Math.cos(now * 0.7) * 1.5);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(decal, 0, 0);
    // pickups
    for (const p of r.pickups) {
      const bob = 3 + Math.sin(now * 4 + p.id) * 2, pulse = 0.6 + 0.4 * Math.sin(now * 6 + p.id);
      ctx.globalAlpha = 0.35; ctx.drawImage(shadowSpr, p.x - 9 + 2, p.y - 6 + 3, 18, 12); ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * pulse;
      ctx.drawImage(p.type === 'n' ? SP.blue : SP.gold, p.x - 20, p.y - bob - 20, 40, 40);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(p.x, p.y - bob); ctx.rotate(Math.sin(now * 2 + p.id) * 0.25); ctx.drawImage(pickSpr[p.type], -12, -12, 24, 24); ctx.restore();
    }
    drawParts(0);
    // shadows
    for (let i = 0; i < r.trucks.length; i++) {
      const t = r.trucks[i], v = vis[i]; if (!v) continue;
      const above = Math.max(0, t.z - v.ground);
      ctx.save(); ctx.translate(t.x + 3 + above * 0.45, t.y + 4 + above * 0.55); ctx.rotate(t.a);
      ctx.globalAlpha = Math.max(0.15, 0.55 - above * 0.008); const k = 1 + above * 0.01; ctx.drawImage(shadowSpr, -30 * k, -20 * k, 60 * k, 40 * k);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    const order = r.trucks.map((t, i) => i).sort((a, b) => (r.trucks[a].z - (vis[a] ? vis[a].ground : 0)) - (r.trucks[b].z - (vis[b] ? vis[b].ground : 0)));
    drawParts(1);
    for (const i of order) if (vis[i]) drawTruck(r, r.trucks[i], i, vis[i]);
    drawParts(2);
    if (T.night) drawNight(r, now);
    drawParts(3);
    // floating texts
    ctx.textAlign = 'center'; ctx.font = '700 15px Bungee, Impact, sans-serif';
    for (const t of texts) { ctx.globalAlpha = Math.min(1, t.life * 2); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(t.text, t.x, t.y); ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y); }
    ctx.globalAlpha = 1;
    if (ui && ui.debug) { ctx.fillStyle = '#0ff'; for (let f = 0; f < 1; f += 0.05) { const k = Math.round(f * T.N); ctx.fillRect(T.px[k] - 2, T.py[k] - 2, 4, 4); ctx.fillText(f.toFixed(2), T.px[k], T.py[k] - 6); } }
    // screen-space
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (flash > 0) { ctx.fillStyle = `rgba(120,180,255,${flash * 0.25})`; ctx.fillRect(0, 0, cw, ch); }
    const vg = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.45, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, cw, ch);
    if (ui && ui.hud) drawHUD(r, now, ui);
  }

  function drawNight(r, now) {
    const T = r.track, L = lctx;
    L.setTransform(0.5, 0, 0, 0.5, 0, 0); L.globalCompositeOperation = 'source-over';
    L.fillStyle = 'rgba(4,8,22,0.8)'; L.fillRect(0, 0, WORLD_W, WORLD_H);
    L.globalCompositeOperation = 'destination-out';
    for (const [x, y] of T.lights) { const g = L.createRadialGradient(x, y, 0, x, y, 430); g.addColorStop(0, 'rgba(0,0,0,.75)'); g.addColorStop(1, 'rgba(0,0,0,0)'); L.fillStyle = g; L.fillRect(x - 430, y - 430, 860, 860); }
    for (const t of r.trucks) {
      L.save(); L.translate(t.x, t.y); L.rotate(t.a);
      let g = L.createRadialGradient(10, 0, 0, 10, 0, 150); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      L.fillStyle = g; L.beginPath(); L.moveTo(12, -6); L.lineTo(160, -70); L.quadraticCurveTo(185, 0, 160, 70); L.lineTo(12, 6); L.closePath(); L.fill();
      g = L.createRadialGradient(0, 0, 0, 0, 0, 34); g.addColorStop(0, 'rgba(0,0,0,.8)'); g.addColorStop(1, 'rgba(0,0,0,0)'); L.fillStyle = g; L.fillRect(-34, -34, 68, 68);
      L.restore();
    }
    for (const p of r.pickups) { const g = L.createRadialGradient(p.x, p.y, 0, p.x, p.y, 40); g.addColorStop(0, 'rgba(0,0,0,.8)'); g.addColorStop(1, 'rgba(0,0,0,0)'); L.fillStyle = g; L.fillRect(p.x - 40, p.y - 40, 80, 80); }
    let nAdd = 0;
    for (const p of parts) if (p.add && nAdd++ < 40) { const g = L.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2); g.addColorStop(0, 'rgba(0,0,0,.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); L.fillStyle = g; L.fillRect(p.x - p.size * 2, p.y - p.size * 2, p.size * 4, p.size * 4); }
    ctx.drawImage(light, 0, 0, WORLD_W, WORLD_H);
    ctx.globalCompositeOperation = 'lighter';
    for (const t of r.trucks) {
      ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.a);
      const g = ctx.createRadialGradient(14, 0, 0, 14, 0, 140); g.addColorStop(0, 'rgba(255,240,200,.22)'); g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(14, -6); ctx.lineTo(160, -66); ctx.quadraticCurveTo(182, 0, 160, 66); ctx.lineTo(14, 6); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.9; ctx.drawImage(SP.white, 12, -9, 7, 7); ctx.drawImage(SP.white, 12, 2, 7, 7);
      ctx.drawImage(SP.fire, -21, -8, 6, 6); ctx.drawImage(SP.fire, -21, 2, 6, 6); ctx.globalAlpha = 1;
      ctx.restore();
    }
    for (const [x, y] of T.lights) { ctx.globalAlpha = 0.7 + 0.05 * Math.sin(now * 13 + x); ctx.drawImage(SP.white, x - 40, y - 26, 80, 52); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  function hudPanel(x, y, w, h, P, t, r, hs, align) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(8,10,16,.72)'; roundRect(ctx, 0, 0, w, h, 10 * hs); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1 * hs; ctx.stroke();
    ctx.fillStyle = P.color; roundRect(ctx, align ? w - 6 * hs : 0, 0, 6 * hs, h, 3 * hs); ctx.fill();
    const pad = 14 * hs, L = align ? pad - 4 * hs : pad + 4 * hs;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.font = `${30 * hs}px Bungee, Impact, sans-serif`; ctx.fillStyle = P.color;
    const place = t.place ? ordinal(t.place) : '-'; ctx.fillText(place, L, 36 * hs);
    const pw = ctx.measureText(place).width;
    ctx.font = `700 ${17 * hs}px Rajdhani, sans-serif`; ctx.fillStyle = '#f3efe6';
    ctx.fillText(P.name.slice(0, 14) + (P.kind === 'cpu' ? ' · CPU' : P.kind === 'remote' ? ' · NET' : ''), L + pw + 10 * hs, 20 * hs);
    ctx.font = `600 ${15 * hs}px Rajdhani, sans-serif`; ctx.fillStyle = '#b7ae9d';
    const lap = t.finished ? 'FINISHED' + (t.ftime != null ? ' ' + fmtTime(t.ftime) : '') : 'LAP ' + clamp(t.lap, 1, r.laps) + '/' + r.laps;
    ctx.fillText(lap, L + pw + 10 * hs, 37 * hs);
    // nitro + money row
    const ny = 50 * hs; let nx0 = L;
    const n = P.nitro;
    for (let k = 0; k < Math.min(n, 8); k++) { ctx.fillStyle = t.nos && k === 0 ? '#bfe0ff' : '#3d8bff'; roundRect(ctx, nx0 + k * 9 * hs, ny - 4 * hs, 6 * hs, 11 * hs, 2 * hs); ctx.fill(); }
    if (n > 8) { ctx.fillStyle = '#7cc0ff'; ctx.font = `700 ${13 * hs}px Rajdhani, sans-serif`; ctx.fillText('+' + (n - 8), nx0 + 8 * 9 * hs, ny + 6 * hs); }
    if (n === 0) { ctx.fillStyle = '#6a6458'; ctx.font = `600 ${12 * hs}px Rajdhani, sans-serif`; ctx.fillText('NO NITRO', nx0, ny + 6 * hs); }
    ctx.textAlign = 'right'; ctx.fillStyle = '#ffd76a'; ctx.font = `700 ${15 * hs}px Rajdhani, sans-serif`;
    ctx.fillText(money(P.money), w - pad - (align ? 4 * hs : 0), ny + 6 * hs);
    ctx.restore();
  }

  function drawHUD(r, now, ui) {
    const hs = clamp(Math.min(cw / 1300, ch / 760), 0.55 * dpr, 1.35 * dpr), m = 10 * hs, w = 236 * hs, h = 62 * hs;
    r.trucks.forEach((t, i) => {
      const P = r.players[t.pi]; if (!P) return;
      const right = i & 1, bottom = i >= 2;
      hudPanel(right ? cw - w - m : m, bottom ? ch - h - m : m, w, h, P, t, r, hs, right);
    });
    ctx.textAlign = 'center';
    // clock + track
    ctx.font = `${22 * hs}px Bungee, Impact, sans-serif`; ctx.fillStyle = '#f3efe6';
    ctx.fillText(fmtTime(r.clock), cw / 2, 30 * hs);
    ctx.font = `600 ${14 * hs}px Rajdhani, sans-serif`; ctx.fillStyle = '#b7ae9d';
    ctx.fillText(r.track.def.name.toUpperCase() + (ui.raceLabel ? ' · ' + ui.raceLabel : ''), cw / 2, 48 * hs);
    // intro / countdown
    const big = (text, col, k, sub) => {
      ctx.save(); ctx.translate(cw / 2, ch / 2); ctx.scale(k, k);
      ctx.font = `${110 * hs}px Bungee, Impact, sans-serif`; ctx.lineWidth = 10 * hs; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(text, 0, 30 * hs);
      const g = ctx.createLinearGradient(0, -60 * hs, 0, 40 * hs); g.addColorStop(0, '#fff3b0'); g.addColorStop(1, col); ctx.fillStyle = g; ctx.fillText(text, 0, 30 * hs);
      if (sub) { ctx.font = `700 ${26 * hs}px Rajdhani, sans-serif`; ctx.fillStyle = '#f3efe6'; ctx.fillText(sub, 0, 80 * hs); }
      ctx.restore();
    };
    if (r.phase === 'intro') { const k = 0.9 + 0.1 * Math.min(1, r.phaseT * 3); ctx.globalAlpha = Math.min(1, r.phaseT * 3); big(r.track.def.name.toUpperCase(), '#ff8a1f', k * 0.55, (ui.raceLabel || '') + ' · ' + r.laps + ' LAPS'); ctx.globalAlpha = 1; }
    if (r.phase === 'count') { const n = 3 - Math.floor(r.phaseT), f = r.phaseT % 1; big(String(n), n === 1 ? '#ff3b30' : '#ffc21a', 1.4 - f * 0.5); }
    if (r.phase === 'race' && r.clock < 0.9) { ctx.globalAlpha = 1 - r.clock / 0.9; big('GO!', '#2ecc71', 1 + r.clock); ctx.globalAlpha = 1; }
    // banners
    banners.forEach((b, k) => {
      const a = Math.min(1, b.life * 2, (b.max - b.life) * 6), y = ch * 0.3 + k * 44 * hs;
      ctx.globalAlpha = a; ctx.font = `${26 * hs}px Bungee, Impact, sans-serif`;
      const tw = ctx.measureText(b.text).width + 40 * hs;
      ctx.fillStyle = 'rgba(8,10,16,.75)'; roundRect(ctx, cw / 2 - tw / 2, y - 30 * hs, tw, 42 * hs, 10 * hs); ctx.fill();
      ctx.fillStyle = b.color; ctx.fillText(b.text, cw / 2, y); ctx.globalAlpha = 1;
    });
    if (ui.hint) {
      ctx.font = `700 ${18 * hs}px Rajdhani, sans-serif`; const tw = ctx.measureText(ui.hint).width + 30 * hs;
      ctx.fillStyle = 'rgba(8,10,16,.8)'; roundRect(ctx, cw / 2 - tw / 2, ch - 84 * hs, tw, 34 * hs, 8 * hs); ctx.fill();
      ctx.fillStyle = '#ffd76a'; ctx.fillText(ui.hint, cw / 2, ch - 61 * hs);
    }
    if (ui.ping != null) { ctx.textAlign = 'right'; ctx.font = `600 ${12 * hs}px Rajdhani, sans-serif`; ctx.fillStyle = '#8d97ab'; ctx.fillText('ping ' + ui.ping + ' ms', cw - m, ch / 2); }
  }

  return { resize, draw, update, onFx, newRaceVisuals, setPlayers, banner, truckSprite, get canvas() { return cv; } };
})();
