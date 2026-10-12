/* Picture renderer for the Graphic Text Adventure engine.
 * Draws a room either from an image URL or from a list of JSON vector
 * commands on a 256x192 canvas (the Color Computer's PMODE 4 resolution).
 */
(function (global) {
  'use strict';

  const W = 256, H = 192;
  // CoCo VDG-ish colours plus a few extras for nicer scenes
  const PALETTE = {
    black: '#000000', green: '#1ed31e', yellow: '#f8f870', blue: '#2a2aff', red: '#d81c1c',
    buff: '#f0f0c8', cyan: '#2ad8d8', magenta: '#e030e0', orange: '#ff8424', white: '#ffffff',
    gray: '#8a8a8a', grey: '#8a8a8a', darkgray: '#3c3c3c', lightgray: '#c4c4c4',
    brown: '#7a4a1e', darkbrown: '#4a2a10', tan: '#c8a066', darkgreen: '#0d5a12', olive: '#6a7a20',
    darkblue: '#121250', navy: '#0a0a38', darkred: '#6a1010', purple: '#5a1e96', violet: '#9050d0',
    gold: '#e8b820', silver: '#c8c8d8', stone: '#77736a', darkstone: '#45423c', wood: '#86521f',
    night: '#05051e', sky: '#5aa0ff', grass: '#2e8a2e', water: '#2050c0', skin: '#e8b890', bone: '#e8e2c8',
    rust: '#9a4420', moss: '#3a6a2a', pink: '#ff9ad0', none: 'transparent'
  };

  // Seeded RNG so "random" scenery is the same every time
  function rng(seed) {
    let s = (seed | 0) || 1234567;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
  }

  // one-point perspective room geometry
  const BW = { x0: 72, x1: 184, y0: 40, y1: 128 };
  function wallPt(side, u, v) {
    switch (side) {
      case 'back': return [BW.x0 + u * (BW.x1 - BW.x0), BW.y1 - v * (BW.y1 - BW.y0)];
      case 'left': { const x = u * BW.x0, top = u * BW.y0, bot = H - u * (H - BW.y1); return [x, bot - v * (bot - top)]; }
      case 'right': { const x = W - u * (W - BW.x1), top = u * BW.y0, bot = H - u * (H - BW.y1); return [x, bot - v * (bot - top)]; }
      case 'floor': { const y = H - v * (H - BW.y1), xl = v * BW.x0, xr = W - v * (W - BW.x1); return [xl + u * (xr - xl), y]; }
      case 'ceiling': { const y = v * BW.y0, xl = v * BW.x0, xr = W - v * (W - BW.x1); return [xl + u * (xr - xl), y]; }
    }
    return [0, 0];
  }
  function wallQuad(side, u1, u2, v1, v2) {
    return [wallPt(side, u1, v1), wallPt(side, u2, v1), wallPt(side, u2, v2), wallPt(side, u1, v2)];
  }

  class Renderer {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      canvas.width = W; canvas.height = H;
      this.images = {};
      this.colors = Object.assign({}, PALETTE);
      this.lib = {};
      this.check = () => true;
      this.speed = opts.speed ?? 40; // commands per second when animating (0 = instant)
      this._job = 0;
      this.onImageLoad = null;
    }
    setAdventure(adv, baseUrl) {
      this.colors = Object.assign({}, PALETTE, adv.colors || {});
      this.lib = adv.artLib || {};
      this.baseUrl = adv.imageBase || baseUrl || '';
      this.defaults = { darkArt: adv.darkArt };
    }
    c(name) { if (name === undefined || name === null) return null; return this.colors[name] || name; }

    resolveUrl(u) {
      if (/^(https?:|data:|blob:)/i.test(u) || !this.baseUrl) return u;
      try { return new URL(u, this.baseUrl).href; } catch (e) { return u; }
    }
    loadImage(url) {
      const full = this.resolveUrl(url);
      if (this.images[full]) return this.images[full];
      const rec = { img: new Image(), ok: false, failed: false };
      rec.img.referrerPolicy = 'no-referrer';
      rec.img.onload = () => { rec.ok = true; if (this.onImageLoad) this.onImageLoad(); };
      rec.img.onerror = () => { rec.failed = true; if (this.onImageLoad) this.onImageLoad(); };
      rec.img.src = full;
      this.images[full] = rec;
      return rec;
    }

    // Build the flat list of draw steps for a picture spec, then run them.
    draw(spec, animate) {
      const job = ++this._job;
      const steps = [];
      const ctx = this.ctx;
      const push = (fn) => steps.push(fn);
      const self = this;

      if (spec.dark) {
        push(() => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); });
        if (this.defaults.darkArt) this.expand(this.defaults.darkArt, push);
      } else {
        let usedImage = false;
        if (spec.image) {
          const rec = this.loadImage(spec.image);
          if (rec.ok) {
            usedImage = true;
            push(() => self.drawImageCover(rec.img));
          } else if (!rec.failed) {
            // still loading: draw vector art (or a placeholder) for now; redraw happens on load
            push(() => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); });
            if (!spec.art) push(() => self.label('Loading picture...'));
          }
        }
        if (!usedImage) {
          if (spec.art) this.expand(spec.art, push);
          else if (!spec.image) push(() => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); });
          else push(() => self.label('[picture unavailable]'));
        }
        if (!usedImage || spec.overlay) {
          const slots = [[48, 176], [96, 182], [140, 178], [186, 182], [214, 170], [120, 164], [66, 160], [178, 160], [30, 186], [230, 186]];
          let si = 0;
          for (const it of spec.items) {
            const pos = it.pos || slots[si++ % slots.length];
            push(() => { ctx.save(); ctx.translate(pos[0], pos[1]); ctx.scale(it.scale, it.scale); });
            this.expand(it.art, push);
            push(() => ctx.restore());
          }
        }
      }

      if (!animate || !this.speed) { ctx.save(); steps.forEach((s) => s()); ctx.restore(); return; }
      let i = 0;
      const perFrame = Math.max(1, Math.round(this.speed / 60 * 1.0));
      const delay = 1000 / this.speed;
      let last = 0;
      ctx.save();
      const tick = (t) => {
        if (job !== this._job) return;
        if (t - last >= delay * 0.9) {
          last = t;
          for (let k = 0; k < perFrame && i < steps.length; k++) steps[i++]();
        }
        if (i < steps.length) requestAnimationFrame(tick); else ctx.restore();
      };
      requestAnimationFrame(tick);
    }

    label(t) {
      const ctx = this.ctx;
      ctx.fillStyle = '#888'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
      ctx.fillText(t, W / 2, H / 2); ctx.textAlign = 'left';
    }
    drawImageCover(img) {
      const ctx = this.ctx;
      const r = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const w = img.naturalWidth * r, h = img.naturalHeight * r;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    }

    // Turn art commands into step closures (macros and conditionals expand here)
    expand(cmds, push, depth = 0) {
      if (!Array.isArray(cmds) || depth > 12) return;
      for (const cmd of cmds) {
        if (!Array.isArray(cmd)) continue;
        const [op, ...a] = cmd;
        if (op === 'if') {
          const [cond, yes, no] = a;
          // condition evaluated at expansion time against the engine
          if (this.check(cond)) this.expand(yes, push, depth + 1); else if (no) this.expand(no, push, depth + 1);
          continue;
        }
        if (op === 'use') {
          const [name, dx = 0, dy = 0, s = 1, sy] = a;
          const body = this.lib[name];
          if (!body) { console.warn('Unknown artLib entry', name); continue; }
          push(() => { this.ctx.save(); this.ctx.translate(dx, dy); this.ctx.scale(s, sy ?? s); });
          this.expand(body, push, depth + 1);
          push(() => this.ctx.restore());
          continue;
        }
        if (op === 'group') { // ["group", dx, dy, scale, [cmds]]
          const [dx, dy, s, body] = a;
          push(() => { this.ctx.save(); this.ctx.translate(dx, dy); this.ctx.scale(s, s); });
          this.expand(body, push, depth + 1);
          push(() => this.ctx.restore());
          continue;
        }
        push(() => this.op(op, a));
      }
    }

    // ---------- primitives ----------
    poly(pts, fill, stroke, lw = 1, close = true) {
      const ctx = this.ctx;
      if (pts.length && typeof pts[0] === 'number') { const p = []; for (let i = 0; i < pts.length; i += 2) p.push([pts[i], pts[i + 1]]); pts = p; }
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      if (close) ctx.closePath();
      if (fill && fill !== 'none') { ctx.fillStyle = this.c(fill); ctx.fill(); }
      if (stroke && stroke !== 'none') { ctx.strokeStyle = this.c(stroke); ctx.lineWidth = lw; ctx.stroke(); }
    }
    pattern(c1, c2, kind = 'checker') {
      const p = document.createElement('canvas');
      p.width = 4; p.height = 4;
      const g = p.getContext('2d');
      g.fillStyle = this.c(c1); g.fillRect(0, 0, 4, 4);
      g.fillStyle = this.c(c2);
      if (kind === 'lines') { g.fillRect(0, 0, 4, 1); g.fillRect(0, 2, 4, 1); }
      else if (kind === 'brick') { p.width = 8; p.height = 4; g.fillStyle = this.c(c1); g.fillRect(0, 0, 8, 4); g.fillStyle = this.c(c2); g.fillRect(0, 0, 8, 1); g.fillRect(0, 0, 1, 2); g.fillRect(4, 2, 1, 2); g.fillRect(0, 2, 8, 0.5); }
      else if (kind === 'sparse') { g.fillRect(0, 0, 1, 1); g.fillRect(2, 2, 1, 1); }
      else { g.fillRect(0, 0, 1, 1); g.fillRect(2, 0, 1, 1); g.fillRect(1, 1, 1, 1); g.fillRect(3, 1, 1, 1); g.fillRect(0, 2, 1, 1); g.fillRect(2, 2, 1, 1); g.fillRect(1, 3, 1, 1); g.fillRect(3, 3, 1, 1); }
      return this.ctx.createPattern(p, 'repeat');
    }

    op(op, a) {
      const ctx = this.ctx, c = (x) => this.c(x);
      switch (op) {
        case 'bg': case 'clear': case 'sky': ctx.fillStyle = c(a[0] || 'black'); ctx.fillRect(0, 0, W, H); break;
        case 'gradient': { // ["gradient", y0, y1, c0, c1]
          const g = ctx.createLinearGradient(0, a[0], 0, a[1]); g.addColorStop(0, c(a[2])); g.addColorStop(1, c(a[3]));
          ctx.fillStyle = g; ctx.fillRect(0, a[0], W, a[1] - a[0]); break;
        }
        case 'rect': { const [x, y, w, h, f, s, lw] = a; if (f && f !== 'none') { ctx.fillStyle = c(f); ctx.fillRect(x, y, w, h); } if (s) { ctx.strokeStyle = c(s); ctx.lineWidth = lw || 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); } break; }
        case 'poly': this.poly(a[0], a[1], a[2], a[3]); break;
        case 'line': this.poly(a[0], null, a[1] || 'white', a[2] || 1, false); break;
        case 'circle': { const [x, y, r, f, s, lw] = a; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); if (f && f !== 'none') { ctx.fillStyle = c(f); ctx.fill(); } if (s) { ctx.strokeStyle = c(s); ctx.lineWidth = lw || 1; ctx.stroke(); } break; }
        case 'ellipse': { const [x, y, rx, ry, f, s, lw] = a; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); if (f && f !== 'none') { ctx.fillStyle = c(f); ctx.fill(); } if (s) { ctx.strokeStyle = c(s); ctx.lineWidth = lw || 1; ctx.stroke(); } break; }
        case 'arc': { const [x, y, r, a0, a1, s, lw] = a; ctx.beginPath(); ctx.arc(x, y, r, a0 * Math.PI / 180, a1 * Math.PI / 180); ctx.strokeStyle = c(s || 'white'); ctx.lineWidth = lw || 1; ctx.stroke(); break; }
        case 'text': { const [x, y, str, col, size, align] = a; ctx.fillStyle = c(col || 'white'); ctx.font = `${size || 8}px "VT323", monospace`; ctx.textAlign = align || 'left'; ctx.fillText(str, x, y); ctx.textAlign = 'left'; break; }
        case 'dither': { const [x, y, w, h, c1, c2, kind] = a; ctx.fillStyle = this.pattern(c1, c2, kind); ctx.fillRect(x, y, w, h); break; }
        case 'dpoly': { const [pts, c1, c2, kind] = a; this.poly(pts, null); ctx.fillStyle = this.pattern(c1, c2, kind); ctx.fill(); break; }
        case 'stars': { const [n, col, seed, maxY] = a; const r = rng(seed || 7); ctx.fillStyle = c(col || 'white'); for (let i = 0; i < n; i++) ctx.fillRect(Math.floor(r() * W), Math.floor(r() * (maxY || H * 0.6)), 1, 1); break; }
        case 'glow': { const [x, y, r, col, alpha] = a; const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c(col)); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalAlpha = alpha ?? 0.6; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1; break; }
        case 'alpha': ctx.globalAlpha = a[0]; break;

        // ----- landscape -----
        case 'ground': ctx.fillStyle = c(a[1] || 'grass'); ctx.fillRect(0, a[0], W, H - a[0]); break;
        case 'hills': case 'mountains': {
          const [y, col, seed, amp] = a; const r = rng(seed || 3); const pts = [[0, H]]; const step = op === 'hills' ? 32 : 20; const am = amp || (op === 'hills' ? 14 : 40);
          for (let x = 0; x <= W; x += step) pts.push([x, y - r() * am]);
          pts.push([W, H]); this.poly(pts, col || 'darkgreen'); break;
        }
        case 'path': { const [col, top, w0, w1] = a; const t = top ?? 110, b0 = w0 ?? 110, b1 = w1 ?? 10; this.poly([[W / 2 - b0 / 2, H], [W / 2 + b0 / 2, H], [W / 2 + b1 / 2, t], [W / 2 - b1 / 2, t]], col || 'tan'); break; }
        case 'water': { const [y, col, wave] = a; ctx.fillStyle = c(col || 'water'); ctx.fillRect(0, y, W, H - y); ctx.strokeStyle = c(wave || 'cyan'); ctx.lineWidth = 1; for (let yy = y + 6; yy < H; yy += 10) for (let x = (yy * 7) % 24; x < W; x += 24) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.quadraticCurveTo(x + 4, yy - 3, x + 8, yy); ctx.stroke(); } break; }
        case 'tree': { const [x, y, h, trunk, leaf] = a; const s = (h || 60) / 60; ctx.fillStyle = c(trunk || 'brown'); ctx.fillRect(x - 3 * s, y - 30 * s, 6 * s, 30 * s); ctx.fillStyle = c(leaf || 'darkgreen'); for (const [dx, dy, r] of [[0, -48, 16], [-12, -38, 12], [12, -38, 12], [-6, -58, 11], [8, -56, 11]]) { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); ctx.fill(); } break; }
        case 'pine': { const [x, y, h, col, trunk] = a; const hh = h || 50; ctx.fillStyle = c(trunk || 'darkbrown'); ctx.fillRect(x - 2, y - hh * 0.15, 4, hh * 0.15); for (let i = 0; i < 3; i++) { const ty = y - hh * 0.15 - i * hh * 0.25; const w = hh * (0.42 - i * 0.1); this.poly([[x - w, ty], [x + w, ty], [x, ty - hh * 0.4]], col || 'darkgreen'); } break; }
        case 'forest': { const [y, col, seed, n] = a; const r = rng(seed || 11); const cnt = n || 14; for (let i = 0; i < cnt; i++) { const x = r() * W; const h = 40 + r() * 50; this.op('pine', [x, y + r() * 20, h, col || 'darkgreen']); } break; }
        case 'moon': { const [x, y, r, col] = a; ctx.fillStyle = c(col || 'buff'); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); break; }
        case 'house': { // ["house", x, y(bottom), w, h, wall, roof, door?]
          const [x, y, w, h, wall, roof, door] = a; ctx.fillStyle = c(wall || 'white'); ctx.fillRect(x, y - h, w, h);
          this.poly([[x - 6, y - h], [x + w + 6, y - h], [x + w / 2, y - h - h * 0.7]], roof || 'darkred');
          if (door !== false) { ctx.fillStyle = c(door || 'brown'); ctx.fillRect(x + w / 2 - w * 0.08, y - h * 0.45, w * 0.16, h * 0.45); }
          ctx.fillStyle = '#123'; ctx.fillRect(x + w * 0.15, y - h * 0.7, w * 0.15, h * 0.2); ctx.fillRect(x + w * 0.7, y - h * 0.7, w * 0.15, h * 0.2); break;
        }
        case 'wallbrick': { const [x, y, w, h, c1, c2] = a; ctx.fillStyle = this.pattern(c1 || 'stone', c2 || 'darkstone', 'brick'); ctx.fillRect(x, y, w, h); break; }

        // ----- interiors -----
        case 'room': { // ["room", wall, floor, ceiling, lines, backWall]
          const [wall, floor, ceil, lines, back] = a;
          this.poly([[0, 0], [W, 0], [BW.x1, BW.y0], [BW.x0, BW.y0]], ceil || 'darkgray');
          this.poly([[0, H], [W, H], [BW.x1, BW.y1], [BW.x0, BW.y1]], floor || 'brown');
          this.poly([[0, 0], [BW.x0, BW.y0], [BW.x0, BW.y1], [0, H]], wall || 'stone');
          this.poly([[W, 0], [BW.x1, BW.y0], [BW.x1, BW.y1], [W, H]], wall || 'stone');
          ctx.fillStyle = c(back || wall || 'stone'); ctx.fillRect(BW.x0, BW.y0, BW.x1 - BW.x0, BW.y1 - BW.y0);
          if (lines !== 'none') {
            ctx.strokeStyle = c(lines || 'black'); ctx.lineWidth = 1;
            ctx.strokeRect(BW.x0 + 0.5, BW.y0 + 0.5, BW.x1 - BW.x0, BW.y1 - BW.y0);
            this.poly([[0, 0], [BW.x0, BW.y0]], null, lines || 'black', 1, false); this.poly([[W, 0], [BW.x1, BW.y0]], null, lines || 'black', 1, false);
            this.poly([[0, H], [BW.x0, BW.y1]], null, lines || 'black', 1, false); this.poly([[W, H], [BW.x1, BW.y1]], null, lines || 'black', 1, false);
          }
          break;
        }
        case 'texture': { // ["texture", side, c1, c2, kind]  dither a whole wall/floor
          const [side, c1, c2, kind] = a; this.poly(wallQuad(side, 0, 1, 0, 1)); ctx.fillStyle = this.pattern(c1, c2, kind); ctx.fill(); break;
        }
        case 'wall': { const [side, u1, u2, v1, v2, f, s] = a; this.poly(wallQuad(side, u1, u2, v1, v2), f, s); break; }
        case 'door': { // ["door", side, u, colour, open, w, h]
          const [side, u = 0.5, col, open, ww, hh] = a; const w = ww || (side === 'back' ? 0.24 : 0.3), h = hh || 0.72;
          const q = wallQuad(side, u - w / 2, u + w / 2, 0, h);
          this.poly(q, open ? 'black' : (col || 'wood'), 'black');
          if (!open) { const k = wallPt(side, u + w * 0.3, h * 0.45); ctx.fillStyle = c('gold'); ctx.fillRect(k[0] - 1, k[1] - 1, 2, 2); }
          break;
        }
        case 'arch': { // pointed gothic arch opening ["arch", side, u, fill, frame, w, h]
          const [side, u = 0.5, f, frame, ww, hh] = a; const w = ww || (side === 'back' ? 0.3 : 0.32), h = hh || 0.62;
          const pts = [wallPt(side, u - w / 2, 0), wallPt(side, u + w / 2, 0), wallPt(side, u + w / 2, h), wallPt(side, u, h + 0.25), wallPt(side, u - w / 2, h)];
          this.poly(pts, f || 'black', frame || 'darkstone', 2); break;
        }
        case 'window': { // ["window", side, u, v, glass, frame, w, h]
          const [side, u = 0.5, v = 0.6, glass, frame, ww, hh] = a; const w = ww || 0.2, h = hh || 0.25;
          const q = wallQuad(side, u - w / 2, u + w / 2, v - h / 2, v + h / 2);
          this.poly(q, glass || 'night', frame || 'black', 2);
          const m1 = wallPt(side, u, v - h / 2), m2 = wallPt(side, u, v + h / 2);
          this.poly([m1, m2], null, frame || 'black', 1, false);
          break;
        }
        case 'stainedglass': { const [side, u = 0.5, v = 0.6, w = 0.18, h = 0.4] = a; const pts = [wallPt(side, u - w / 2, v - h / 2), wallPt(side, u + w / 2, v - h / 2), wallPt(side, u + w / 2, v + h / 3), wallPt(side, u, v + h / 2), wallPt(side, u - w / 2, v + h / 3)]; this.poly(pts, null); ctx.fillStyle = this.pattern('red', 'blue'); ctx.fill(); this.poly(pts, null, 'black', 2); break; }
        case 'stairs': { // ["stairs", "up"|"down", colour, u, side]
          const [dir, col, u = 0.5, side = 'back'] = a;
          if (dir === 'down') {
            const q = wallQuad('floor', u - 0.15, u + 0.15, 0.25, 0.6); this.poly(q, 'black', col || 'gray');
            for (let i = 1; i < 5; i++) { const v = 0.6 - i * 0.07; const y = wallPt('floor', 0, v)[1]; const xl = wallPt('floor', u - 0.15 + i * 0.012, v)[0], xr = wallPt('floor', u + 0.15 - i * 0.012, v)[0]; this.poly([[xl, y + i * 3], [xr, y + i * 3]], null, col || 'gray', 1, false); }
          } else {
            for (let i = 0; i < 6; i++) { const q = wallQuad(side, u - 0.16, u + 0.16, i * 0.1, i * 0.1 + 0.1); this.poly(q, i % 2 ? (col || 'stone') : 'darkstone', 'black'); }
          }
          break;
        }
        case 'table': { const [x, y, w, h, col] = a; ctx.fillStyle = c(col || 'wood'); ctx.fillRect(x, y, w, 4); ctx.fillRect(x + 2, y + 4, 3, h); ctx.fillRect(x + w - 5, y + 4, 3, h); break; }
        case 'bookcase': { const [x, y, w, h, col] = a; ctx.fillStyle = c(col || 'darkbrown'); ctx.fillRect(x, y, w, h); const r = rng(x * 31 + y); const cols = ['red', 'darkgreen', 'navy', 'tan', 'darkred', 'brown', 'purple']; for (let sy = y + 3; sy < y + h - 6; sy += 12) { let sx = x + 2; while (sx < x + w - 4) { const bw = 2 + Math.floor(r() * 3); ctx.fillStyle = c(cols[Math.floor(r() * cols.length)]); ctx.fillRect(sx, sy + Math.floor(r() * 3), bw, 9 - Math.floor(r() * 3)); sx += bw + 1; } } break; }
        case 'candle': { const [x, y, h, col, lit] = a; const hh = h || 10; ctx.fillStyle = c(col || 'buff'); ctx.fillRect(x - 1.5, y - hh, 3, hh); if (lit !== false) { this.op('glow', [x, y - hh - 3, 10, 'orange', 0.5]); ctx.fillStyle = c('yellow'); ctx.beginPath(); ctx.ellipse(x, y - hh - 3, 1.5, 3, 0, 0, Math.PI * 2); ctx.fill(); } break; }
        case 'torch': { const [x, y] = a; ctx.fillStyle = c('darkbrown'); ctx.fillRect(x - 1, y, 2, 10); this.op('glow', [x, y - 3, 16, 'orange', 0.55]); this.poly([[x - 3, y], [x + 3, y], [x, y - 9]], 'orange'); this.poly([[x - 1.5, y], [x + 1.5, y], [x, y - 5]], 'yellow'); break; }
        case 'altar': { const [x, y, w, h, col, cloth] = a; ctx.fillStyle = c(col || 'stone'); ctx.fillRect(x, y - h, w, h); ctx.fillStyle = c('black'); ctx.fillRect(x, y - h, w, 1); if (cloth) { ctx.fillStyle = c(cloth); ctx.fillRect(x - 2, y - h, w + 4, 4); ctx.fillRect(x + w * 0.4, y - h, w * 0.2, h * 0.7); } break; }
        case 'cross': { const [x, y, s, col, inverted] = a; const k = s || 20; ctx.fillStyle = c(col || 'gold'); ctx.fillRect(x - k * 0.08, y - k, k * 0.16, k); const cy = inverted ? y - k * 0.3 : y - k * 0.72; ctx.fillRect(x - k * 0.3, cy, k * 0.6, k * 0.14); break; }
        case 'pentagram': { const [x, y, r, col, sy] = a; const pts = []; for (let i = 0; i < 5; i++) { const ang = -Math.PI / 2 + i * 4 * Math.PI / 5; pts.push([x + Math.cos(ang) * r, y + Math.sin(ang) * r * (sy || 1)]); } this.poly(pts, null, col || 'red', 1.5); ctx.beginPath(); ctx.ellipse(x, y, r, r * (sy || 1), 0, 0, Math.PI * 2); ctx.strokeStyle = c(col || 'red'); ctx.stroke(); break; }
        case 'coffin': { const [x, y, w, h, col] = a; this.poly([[x, y], [x + w * 0.25, y - h / 2], [x + w, y - h * 0.3], [x + w, y + h * 0.3], [x + w * 0.25, y + h / 2]], col || 'darkbrown', 'black'); break; }
        case 'skull': { const [x, y, s, col] = a; const k = s || 6; ctx.fillStyle = c(col || 'bone'); ctx.beginPath(); ctx.arc(x, y, k, Math.PI, 0); ctx.fill(); ctx.fillRect(x - k * 0.6, y, k * 1.2, k * 0.7); ctx.fillStyle = '#000'; ctx.fillRect(x - k * 0.5, y - k * 0.3, k * 0.35, k * 0.35); ctx.fillRect(x + k * 0.15, y - k * 0.3, k * 0.35, k * 0.35); break; }
        case 'bones': { const [x, y, n, col, seed] = a; const r = rng(seed || x); ctx.strokeStyle = c(col || 'bone'); ctx.lineWidth = 2; for (let i = 0; i < (n || 8); i++) { const bx = x + (r() - 0.5) * 60, by = y + (r() - 0.5) * 14, ang = r() * Math.PI, l = 6 + r() * 8; ctx.beginPath(); ctx.moveTo(bx - Math.cos(ang) * l, by - Math.sin(ang) * l * 0.4); ctx.lineTo(bx + Math.cos(ang) * l, by + Math.sin(ang) * l * 0.4); ctx.stroke(); } break; }
        case 'well': { const [x, y, r, col] = a; const k = r || 20; ctx.fillStyle = c(col || 'stone'); ctx.fillRect(x - k, y - k * 0.8, k * 2, k * 0.8); ctx.fillStyle = c('black'); ctx.beginPath(); ctx.ellipse(x, y - k * 0.8, k, k * 0.25, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = c(col || 'stone'); ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = c('wood'); ctx.fillRect(x - k - 2, y - k * 2.2, 3, k * 1.4); ctx.fillRect(x + k - 1, y - k * 2.2, 3, k * 1.4); ctx.fillRect(x - k - 4, y - k * 2.3, k * 2 + 8, 3); break; }
        case 'statue': { const [x, y, h, col] = a; const k = (h || 40) / 40; ctx.fillStyle = c(col || 'lightgray'); ctx.fillRect(x - 10 * k, y - 6 * k, 20 * k, 6 * k); this.poly([[x - 7 * k, y - 6 * k], [x + 7 * k, y - 6 * k], [x + 4 * k, y - 30 * k], [x - 4 * k, y - 30 * k]], col || 'lightgray'); ctx.beginPath(); ctx.arc(x, y - 34 * k, 4.5 * k, 0, Math.PI * 2); ctx.fill(); break; }
        case 'bell': { const [x, y, s, col] = a; const k = s || 20; this.poly([[x - k * 0.25, y - k], [x + k * 0.25, y - k], [x + k * 0.4, y - k * 0.3], [x + k * 0.55, y], [x - k * 0.55, y], [x - k * 0.4, y - k * 0.3]], col || 'gold', 'black'); ctx.fillStyle = c('darkbrown'); ctx.beginPath(); ctx.arc(x, y + 2, k * 0.1, 0, Math.PI * 2); ctx.fill(); break; }
        case 'gate': { const [x, y, w, h, col, open] = a; ctx.strokeStyle = c(col || 'darkgray'); ctx.lineWidth = 2; if (open) { ctx.strokeRect(x, y, 4, h); break; } ctx.strokeRect(x, y, w, h); for (let gx = x + 6; gx < x + w; gx += 6) { ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); ctx.stroke(); this.poly([[gx - 2, y], [gx + 2, y], [gx, y - 4]], col || 'darkgray'); } break; }
        case 'grate': { const [x, y, w, h, col] = a; ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = c(col || 'gray'); ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h); for (let gx = x + 5; gx < x + w; gx += 5) { ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); ctx.stroke(); } for (let gy = y + 4; gy < y + h; gy += 4) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke(); } break; }
        case 'cave': { // ["cave", rock, dark, floor, seed]
          const [rock, dark, floor, seed] = a; const r = rng(seed || 5);
          ctx.fillStyle = c(rock || 'darkstone'); ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = this.pattern(rock || 'darkstone', 'black', 'sparse'); ctx.fillRect(0, 0, W, H);
          const pts = []; const cx = W / 2, cy = 92;
          for (let i = 0; i < 18; i++) { const ang = (i / 18) * Math.PI * 2; const rx = 60 + r() * 14, ry = 46 + r() * 12; pts.push([cx + Math.cos(ang) * rx, cy + Math.sin(ang) * ry]); }
          this.poly(pts, dark || 'black');
          const fl = [[0, H], [W, H]]; for (let x = W; x >= 0; x -= 16) fl.push([x, 150 + r() * 10]); this.poly(fl, floor || 'stone'); break;
        }
        case 'tunnel': { const [col, n] = a; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = c(col || 'stone'); for (let i = 0; i < (n || 6); i++) { const k = Math.pow(0.7, i); const w = W * k, h = H * k; ctx.lineWidth = Math.max(1, 3 * k); ctx.strokeRect(W / 2 - w / 2 + 2, H / 2 - h / 2 + 10 * (1 - k), w - 4, h - 4); } break; }
        case 'rocks': { const [y, col, seed, n] = a; const r = rng(seed || 9); for (let i = 0; i < (n || 8); i++) { const x = r() * W, s = 6 + r() * 14; this.poly([[x - s, y + r() * 20], [x - s * 0.5, y - s * 0.7 + r() * 20], [x + s * 0.6, y - s * 0.6 + r() * 20], [x + s, y + r() * 20]], col || 'stone', 'black'); } break; }
        default: console.warn('Unknown art op', op);
      }
    }
  }

  global.GTARenderer = { Renderer, PALETTE, W, H };
})(typeof window !== 'undefined' ? window : globalThis);
