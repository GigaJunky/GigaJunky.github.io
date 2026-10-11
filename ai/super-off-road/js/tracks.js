'use strict';
// Track definitions and the baker that turns a centerline into physics fields
// (height, surface) and a lit, textured background canvas.
const WORLD_W = 1600, WORLD_H = 900, HALF_W = 50, SAMPLE = 4;

// Surface physics: 0 off-track, 1 dirt, 2 mud, 3 water, 4 washboard bumps.
const SURF_PHYS = [
  { drag: 1.2, grip: 1.0, max: 0.6 },
  { drag: 0.32, grip: 1.0, max: 1.0 },
  { drag: 1.5, grip: 0.42, max: 0.6 },
  { drag: 1.05, grip: 0.58, max: 0.74 },
  { drag: 0.75, grip: 0.82, max: 0.88 },
];
const ZONE_TYPE = { mud: 2, water: 3, bumps: 4 };

const THEMES = {
  desert: { dirt: [200, 146, 88], off: [128, 94, 60], grass: [140, 122, 72], berm: [162, 114, 70], paint: '#e8412c', bush: '#6f7d3a' },
  clay: { dirt: [184, 104, 64], off: [96, 64, 46], grass: [88, 96, 52], berm: [146, 84, 54], paint: '#f4f1ea', bush: '#4f6b2e' },
  loam: { dirt: [158, 118, 80], off: [70, 62, 46], grass: [64, 92, 46], berm: [124, 92, 62], paint: '#ffcf3a', bush: '#3f6a2c' },
  night: { dirt: [176, 132, 90], off: [74, 64, 52], grass: [62, 78, 48], berm: [134, 98, 68], paint: '#2f7bff', bush: '#355a28' },
};

function fig8(cx, cy, ax, ay, n, phase) {
  const p = [];
  for (let i = 0; i < n; i++) { const t = phase + i / n * TAU; p.push([cx + ax * Math.sin(t), cy + ay * Math.sin(t) * Math.cos(t)]); }
  return p;
}

// hills: [fraction, height, length, 'kick'|'roll'|'table']
// zones: { at: fraction, len: world units, off: lateral offset, w: width, type }
const TRACKS = [
  {
    name: 'Dust Bowl', theme: 'desert',
    pts: [[800, 165], [1370, 178], [1480, 450], [1370, 725], [800, 745], [230, 725], [120, 450], [230, 178]],
    hills: [[0.13, 30, 170, 'kick'], [0.56, 34, 190, 'kick']],
    zones: [{ at: 0.30, len: 170, off: 0, w: 110, type: 'bumps' }, { at: 0.80, len: 150, off: -12, w: 80, type: 'water' }],
  },
  {
    name: 'Figure Eight', theme: 'clay',
    pts: fig8(800, 450, 640, 600, 24, Math.PI / 4),
    hills: [[0.22, 32, 170, 'kick'], [0.72, 32, 170, 'kick']],
    zones: [{ at: 0.42, len: 140, off: 10, w: 90, type: 'mud' }, { at: 0.93, len: 140, off: -10, w: 90, type: 'water' }],
  },
  {
    name: 'Switchback', theme: 'loam',
    pts: [[800, 165], [1300, 165], [1450, 195], [1480, 260], [1420, 325], [1300, 345], [700, 345], [520, 360], [440, 450], [520, 545], [700, 560], [1300, 560], [1420, 580], [1480, 650], [1440, 725], [1300, 750], [300, 750], [175, 710], [150, 600], [150, 300], [180, 195], [300, 165]],
    hills: [[0.08, 26, 150, 'kick'], [0.30, 28, 160, 'table'], [0.50, 30, 170, 'kick'], [0.72, 34, 180, 'kick']],
    zones: [{ at: 0.40, len: 120, off: 0, w: 100, type: 'mud' }, { at: 0.62, len: 150, off: 0, w: 110, type: 'bumps' }, { at: 0.88, len: 120, off: 12, w: 80, type: 'water' }],
  },
  {
    name: 'Midnight Run', theme: 'night', night: true,
    pts: [[800, 170], [1300, 175], [1460, 260], [1470, 520], [1340, 700], [1100, 740], [920, 630], [780, 570], [640, 630], [460, 740], [230, 710], [130, 520], [160, 280], [330, 180]],
    hills: [[0.12, 30, 170, 'kick'], [0.49, 26, 140, 'roll'], [0.86, 32, 170, 'kick']],
    zones: [{ at: 0.30, len: 150, off: -10, w: 90, type: 'water' }, { at: 0.66, len: 160, off: 0, w: 110, type: 'bumps' }],
  },
  {
    name: 'Mesa Jumps', theme: 'desert',
    pts: [[800, 185], [1000, 200], [1180, 350], [1400, 600], [1420, 720], [1300, 765], [300, 765], [180, 720], [200, 600], [420, 350], [600, 200]],
    hills: [[0.13, 34, 180, 'table'], [0.32, 38, 200, 'kick'], [0.55, 36, 200, 'kick'], [0.80, 38, 200, 'table']],
    zones: [{ at: 0.44, len: 150, off: 14, w: 80, type: 'mud' }, { at: 0.67, len: 160, off: 0, w: 110, type: 'bumps' }],
  },
  {
    name: 'Rattlesnake', theme: 'clay',
    pts: [[800, 785], [300, 785], [210, 740], [195, 640], [200, 360], [260, 220], [400, 160], [540, 220], [600, 360], [600, 500], [650, 620], [740, 660], [830, 620], [880, 500], [880, 410], [950, 240], [1130, 160], [1310, 240], [1380, 410], [1390, 650], [1340, 750], [1200, 785]],
    hills: [[0.16, 30, 160, 'kick'], [0.40, 26, 130, 'kick'], [0.60, 30, 160, 'kick'], [0.86, 34, 170, 'kick']],
    zones: [{ at: 0.05, len: 160, off: 0, w: 110, type: 'bumps' }, { at: 0.50, len: 110, off: 0, w: 100, type: 'water' }, { at: 0.75, len: 120, off: -10, w: 90, type: 'mud' }],
  },
  {
    name: 'Mud Pit', theme: 'loam',
    pts: [[800, 175], [1350, 175], [1470, 290], [1300, 370], [1250, 450], [1300, 530], [1470, 610], [1350, 735], [800, 742], [250, 735], [130, 450], [250, 175]],
    hills: [[0.11, 28, 160, 'kick'], [0.58, 32, 180, 'kick']],
    zones: [{ at: 0.27, len: 130, off: 0, w: 110, type: 'mud' }, { at: 0.45, len: 160, off: -8, w: 100, type: 'mud' }, { at: 0.72, len: 140, off: 10, w: 90, type: 'water' }, { at: 0.86, len: 160, off: 0, w: 110, type: 'bumps' }],
  },
  {
    name: 'Grand Finale', theme: 'night', night: true,
    pts: [[1475, 460], [1430, 620], [1300, 740], [1050, 680], [800, 450], [550, 220], [300, 165], [150, 320], [140, 600], [300, 740], [550, 680], [800, 450], [1050, 240], [1320, 165], [1460, 300]],
    hills: [[0.12, 32, 170, 'kick'], [0.42, 32, 170, 'kick'], [0.62, 26, 140, 'roll'], [0.90, 32, 170, 'kick']],
    zones: [{ at: 0.03, len: 140, off: 0, w: 110, type: 'bumps' }, { at: 0.52, len: 130, off: 10, w: 90, type: 'water' }, { at: 0.77, len: 120, off: -10, w: 90, type: 'mud' }],
  },
];

function catmull(p0, p1, p2, p3, t) {
  const d = (a, b) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  const t0 = 0, t1 = d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3), tt = t1 + (t2 - t1) * t;
  const L = (a, b, ta, tb) => [a[0] * (tb - tt) / (tb - ta) + b[0] * (tt - ta) / (tb - ta), a[1] * (tb - tt) / (tb - ta) + b[1] * (tt - ta) / (tb - ta)];
  const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
  const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
  return L(B1, B2, t1, t2);
}

function hillProfile(u, type) {
  if (u <= 0 || u >= 1) return 0;
  if (type === 'roll') return 0.5 - 0.5 * Math.cos(u * TAU);
  if (type === 'table') return u < 0.32 ? smooth(u / 0.32) : u < 0.74 ? 1 : 1 - smooth((u - 0.74) / 0.26);
  return u < 0.72 ? smooth(u / 0.72) : 1 - smooth((u - 0.72) / 0.28); // kick: long ramp, sharp drop
}

const trackCache = new Map();
function getTrack(i) {
  if (!trackCache.has(i)) {
    if (trackCache.size >= 3) trackCache.delete(trackCache.keys().next().value);
    trackCache.set(i, buildTrack(TRACKS[i], i));
  }
  return trackCache.get(i);
}

function buildTrack(def, index) {
  const W = WORLD_W, H = WORLD_H, SZ = W * H, theme = THEMES[def.theme];
  const rng = mulberry32(1000 + index * 77);

  // ---- centerline: centripetal Catmull-Rom, then uniform resampling
  const pts = def.pts, n = pts.length, dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let k = 0; k < 32; k++) dense.push(catmull(p0, p1, p2, p3, k / 32));
  }
  const M = dense.length, cum = new Float64Array(M + 1);
  for (let i = 0; i < M; i++) { const a = dense[i], b = dense[(i + 1) % M]; cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]); }
  const L = cum[M], N = Math.round(L / SAMPLE), sp = L / N;
  const px = new Float32Array(N), py = new Float32Array(N);
  for (let j = 0, seg = 0; j < N; j++) {
    const s = j * sp; while (cum[seg + 1] < s) seg++;
    const t = (s - cum[seg]) / (cum[seg + 1] - cum[seg] || 1), a = dense[seg], b = dense[(seg + 1) % M];
    px[j] = a[0] + (b[0] - a[0]) * t; py[j] = a[1] + (b[1] - a[1]) * t;
  }
  const tx = new Float32Array(N), ty = new Float32Array(N), nx = new Float32Array(N), ny = new Float32Array(N), hs = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N, dx = px[b] - px[a], dy = py[b] - py[a], l = Math.hypot(dx, dy) || 1;
    tx[i] = dx / l; ty[i] = dy / l; nx[i] = -ty[i]; ny[i] = tx[i];
  }
  for (const [f, h, len, type] of def.hills) {
    const s0 = f * L;
    for (let i = 0; i < N; i++) {
      let d = i * sp - s0; d -= Math.round(d / L) * L;
      hs[i] += h * hillProfile(d / len + 0.5, type);
    }
  }

  // ---- nearest-centerline field
  const d2 = new Float32Array(SZ).fill(1e10), near = new Int32Array(SZ).fill(-1);
  const R = HALF_W + 72, R2 = R * R;
  for (let i = 0; i < N; i++) {
    const cx = px[i], cy = py[i];
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(W - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(H - 1, Math.ceil(cy + R));
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy, dy2 = dy * dy; if (dy2 > R2) continue;
      let k = y * W + x0;
      for (let x = x0; x <= x1; x++, k++) {
        const dx = x + 0.5 - cx, dd = dx * dx + dy2;
        if (dd < R2 && dd < d2[k]) { d2[k] = dd; near[k] = i; }
      }
    }
  }
  const dist = d2; // reused in place
  const lat = new Float32Array(SZ);
  for (let k = 0; k < SZ; k++) {
    const i = near[k]; if (i < 0) { dist[k] = 1e5; continue; }
    const x = (k % W) + 0.5, y = ((k / W) | 0) + 0.5;
    dist[k] = Math.sqrt(dist[k]);
    lat[k] = (x - px[i]) * nx[i] + (y - py[i]) * ny[i];
  }

  // ---- hazard zones
  const zW = new Float32Array(SZ), zT = new Uint8Array(SZ);
  for (const z of def.zones) {
    const c = Math.round(z.at * N), half = Math.max(2, Math.round(z.len / 2 / SAMPLE)), type = ZONE_TYPE[z.type];
    for (let j = -half; j <= half; j++) {
      const i = ((c + j) % N + N) % N;
      const taper = Math.sqrt(Math.cos(j / half * Math.PI / 2));
      const r = z.w / 2 * taper * (0.82 + 0.36 * Noise.n2(i * 0.12, z.at * 40));
      if (r < 2) continue;
      const cx = px[i] + nx[i] * z.off, cy = py[i] + ny[i] * z.off, rr = r * r;
      for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, cy + r); y++) {
        for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, cx + r); x++) {
          const dx = x - cx, dy = y - cy, dd = dx * dx + dy * dy; if (dd > rr) continue;
          const k = y * W + x; if (dist[k] >= HALF_W - 2) continue;
          const w = smooth(Math.min(1, (1 - Math.sqrt(dd) / r) * 2.6));
          if (w > zW[k]) { zW[k] = w; zT[k] = type; }
        }
      }
    }
  }

  // ---- physics height + surface, visual height with micro detail
  const hP = new Float32Array(SZ), hV = new Float32Array(SZ), surf = new Uint8Array(SZ);
  for (let k = 0; k < SZ; k++) {
    const i = near[k], x = k % W, y = (k / W) | 0;
    let h = 0, micro = (Noise.fbm(x * 0.045, y * 0.045, 2) - 0.5) * 3;
    if (i >= 0) {
      const d = dist[k], base = hs[i], s = i * sp;
      if (d < HALF_W) {
        h = base; surf[k] = zW[k] > 0.35 ? zT[k] : 1;
        const zt = zT[k], w = zW[k];
        if (zt === 2 || zt === 3) h -= 3.5 * w;
        if (zt === 4) h += 1.15 * Math.sin(s * TAU / 22) * w;
        micro = (Noise.n2(s * 0.02, lat[k] * 0.2) - 0.5) * 2.4 + (Noise.n2(x * 0.35, y * 0.35) - 0.5) * 0.7;
        if (zt === 3) micro *= 1 - w;
      } else if (d < HALF_W + 12) {
        h = base + 6 * Math.sin((d - HALF_W) / 12 * Math.PI);
      } else {
        h = base * clamp(1 - (d - HALF_W - 12) / 56, 0, 1);
      }
    }
    hP[k] = h; hV[k] = h + micro;
  }

  // ---- lighting + albedo bake
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d'), img = cx.createImageData(W, H), D = img.data;
  const LX = -0.42, LY = -0.58, LZ = 0.70, ll = Math.hypot(LX, LY, LZ), lx = LX / ll, ly = LY / ll, lz = LZ / ll;
  const [dr, dg, db] = theme.dirt, [or, og, ob] = theme.off, [gr, gg, gb] = theme.grass, [br, bg, bb] = theme.berm;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      const gx = hV[x < W - 1 ? k + 1 : k] - hV[x > 0 ? k - 1 : k], gy = hV[y < H - 1 ? k + W : k] - hV[y > 0 ? k - W : k];
      const nX = -gx * 0.5, nY = -gy * 0.5, inv = 1 / Math.sqrt(nX * nX + nY * nY + 1);
      const dif = Math.max(0, (nX * lx + nY * ly + lz) * inv);
      let shade = 0.36 + 0.86 * dif, r, g, b, spec = 0;
      const d = dist[k], grain = 0.93 + 0.14 * Noise.n2(x * 0.9, y * 0.9);
      if (surf[k]) {
        const i = near[k], s = i * sp, la = lat[k];
        let m = (0.86 + 0.28 * Noise.fbm(x * 0.03, y * 0.03, 3)) * grain;
        const rut = Noise.n2(s * 0.014, la * 0.16);
        if (rut > 0.55) m *= 1 - (rut - 0.55) * 0.7;
        m *= 1 - 0.09 * Math.exp(-((Math.abs(la) - 17) ** 2) / 90);
        if (d > HALF_W - 9) m *= 1 - 0.18 * smooth((d - HALF_W + 9) / 9);
        r = dr * m; g = dg * m; b = db * m;
        const w = zW[k], zt = zT[k];
        if (w > 0) {
          if (zt === 2) { r = lerp(r, 70 * grain, w); g = lerp(g, 50 * grain, w); b = lerp(b, 34 * grain, w); spec = Math.pow(dif, 14) * 0.55 * w; }
          else if (zt === 3) { r = lerp(r, 58, w); g = lerp(g, 48, w); b = lerp(b, 38, w); }
          else if (zt === 4) { r = lerp(r, r * 0.92, w); g = lerp(g, g * 0.86, w); b = lerp(b, b * 0.8, w); }
        }
      } else if (d < HALF_W + 12) {
        const m = (0.84 + 0.3 * Noise.fbm(x * 0.06, y * 0.06, 2)) * grain;
        r = br * m; g = bg * m; b = bb * m;
      } else {
        const m = (0.82 + 0.32 * Noise.fbm(x * 0.012, y * 0.012, 3)) * grain;
        const gm = smooth((Noise.fbm(x * 0.008 + 50, y * 0.008, 3) - 0.47) * 6);
        r = lerp(or, gr, gm) * m; g = lerp(og, gg, gm) * m; b = lerp(ob, gb, gm) * m;
        if (Noise.n2(x * 0.7 + 9, y * 0.7) > 0.93) { r *= 1.25; g *= 1.22; b *= 1.18; }
      }
      const o = k * 4;
      D[o] = Math.min(255, r * shade + spec * 255); D[o + 1] = Math.min(255, g * shade + spec * 240); D[o + 2] = Math.min(255, b * shade + spec * 220); D[o + 3] = 255;
    }
  }
  cx.putImageData(img, 0, 0);

  // ---- water overlay (drawn animated at runtime)
  const water = document.createElement('canvas'); water.width = W; water.height = H;
  const sparkle = document.createElement('canvas'); sparkle.width = W; sparkle.height = H;
  {
    const wc = water.getContext('2d'), wi = wc.createImageData(W, H), wd = wi.data;
    const sc = sparkle.getContext('2d'), si = sc.createImageData(W, H), sd = si.data;
    for (let k = 0; k < SZ; k++) {
      if (zT[k] !== 3 || zW[k] <= 0 || dist[k] >= HALF_W) continue;
      const w = zW[k], x = k % W, y = (k / W) | 0, o = k * 4;
      const edge = w < 0.45 ? (0.45 - w) * 2.2 : 0;
      wd[o] = 80 + edge * 175; wd[o + 1] = 135 + edge * 120; wd[o + 2] = 170 + edge * 85; wd[o + 3] = Math.min(255, 175 * smooth(w * 1.8) + edge * 120);
      const n = Noise.n2(x * 0.18, y * 0.5);
      if (n > 0.7 && w > 0.4) { sd[o] = 235; sd[o + 1] = 245; sd[o + 2] = 255; sd[o + 3] = (n - 0.7) * 600 * w; }
    }
    wc.putImageData(wi, 0, 0); sc.putImageData(si, 0, 0);
  }

  const T = {
    def, index, theme, N, L, sp, px, py, tx, ty, nx, ny, hs, h: hP, surf, canvas: cv, water, sparkle,
    night: !!def.night, crowd: [], lights: [],
    heightAt(x, y) {
      x = clamp(x, 0, W - 1.001); y = clamp(y, 0, H - 1.001);
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, k = y0 * W + x0;
      const a = hP[k], b = hP[k + 1], c = hP[k + W], d = hP[k + W + 1];
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    },
    surfAt(x, y) { if (x < 0 || y < 0 || x >= W || y >= H) return 0; return surf[(y | 0) * W + (x | 0)]; },
    nearest(x, y, guess, back = 14, fwd = 26) {
      let best = guess, bd = 1e18;
      for (let o = -back; o <= fwd; o++) {
        const i = ((guess + o) % N + N) % N, dx = x - px[i], dy = y - py[i], dd = dx * dx + dy * dy;
        if (dd < bd) { bd = dd; best = i; }
      }
      return best;
    },
    nearestGlobal(x, y) {
      let best = 0, bd = 1e18;
      for (let i = 0; i < N; i++) { const dx = x - px[i], dy = y - py[i], dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = i; } }
      return best;
    },
    gridSpot(slot) {
      const row = slot >> 1, side = slot & 1 ? 1 : -1, i = (N - 9 - row * 13) % N;
      return { x: px[i] + nx[i] * side * 22, y: py[i] + ny[i] * side * 22, a: Math.atan2(ty[i], tx[i]), idx: i };
    },
  };
  decorate(T, cx, dist, near, rng);
  return T;
}

// Static props: start line, tire walls, stands, banners, hay bales.
function decorate(T, c, dist, near, rng) {
  const W = WORLD_W, H = WORLD_H, th = T.theme;
  const { N, px, py, tx, ty, nx, ny } = T;
  const distAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : dist[(y | 0) * W + (x | 0)];

  // start/finish checkerboard
  {
    const a = Math.atan2(ty[0], tx[0]);
    c.save(); c.translate(px[0], py[0]); c.rotate(a);
    c.globalAlpha = 0.9;
    for (let j = 0; j < 10; j++) for (let r = 0; r < 2; r++) {
      c.fillStyle = (j + r) & 1 ? '#111' : '#f4f1ea';
      c.fillRect(-6 + r * 6, -HALF_W + j * 10, 6, 10);
    }
    c.restore();
    c.save(); c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 2;
    for (let s = 0; s < 4; s++) {
      const g = T.gridSpot(s); c.save(); c.translate(g.x, g.y); c.rotate(g.a);
      c.beginPath(); c.moveTo(18, -12); c.lineTo(22, -12); c.lineTo(22, 12); c.lineTo(18, 12); c.stroke(); c.restore();
    }
    c.restore();
  }

  // tire walls along both edges
  const occ = new Uint8Array(Math.ceil(W / 8) * Math.ceil(H / 8)), OW = Math.ceil(W / 8);
  const free = (x, y) => occ[((y / 8) | 0) * OW + ((x / 8) | 0)] === 0;
  const mark = (x, y, r) => { for (let yy = y - r; yy <= y + r; yy += 4) for (let xx = x - r; xx <= x + r; xx += 4) if (xx >= 0 && yy >= 0 && xx < W && yy < H) occ[((yy / 8) | 0) * OW + ((xx / 8) | 0)] = 1; };
  const tires = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < N; i += 2) {
      const x = px[i] + nx[i] * side * (HALF_W + 7), y = py[i] + ny[i] * side * (HALF_W + 7);
      if (x < 6 || y < 6 || x > W - 6 || y > H - 6) continue;
      if (distAt(x, y) < HALF_W + 3) continue;
      if (!free(x, y)) continue;
      mark(x, y, 4); tires.push([x, y, (i / 2 | 0) % 6 === 0]);
    }
  }
  c.save();
  c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 5; c.shadowOffsetX = 2.5; c.shadowOffsetY = 3;
  for (const [x, y, painted] of tires) {
    const g = c.createRadialGradient(x - 2, y - 2, 1, x, y, 7);
    if (painted) { g.addColorStop(0, '#fff'); g.addColorStop(0.5, th.paint); g.addColorStop(1, '#2a0d08'); }
    else { g.addColorStop(0, '#4a4a4a'); g.addColorStop(0.55, '#1a1a1a'); g.addColorStop(1, '#050505'); }
    c.fillStyle = g; c.beginPath(); c.arc(x, y, 6.4, 0, TAU); c.fill();
  }
  c.shadowColor = 'transparent';
  for (const [x, y] of tires) { c.fillStyle = 'rgba(0,0,0,.75)'; c.beginPath(); c.arc(x + 0.3, y + 0.3, 2.3, 0, TAU); c.fill(); }
  c.restore();

  // props in open ground
  const props = [];
  for (let tries = 0; tries < 900 && props.length < 70; tries++) {
    const x = 30 + rng() * (W - 60), y = 105 + rng() * (H - 210);
    if (distAt(x, y) < HALF_W + 34) continue;
    if (!free(x, y) || !free(x + 10, y) || !free(x - 10, y) || !free(x, y + 10) || !free(x, y - 10)) continue;
    mark(x, y, 18); props.push([x, y, rng()]);
  }
  for (const [x, y, r] of props) {
    c.save(); c.translate(x, y); c.rotate(r * TAU);
    c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 6; c.shadowOffsetX = 3; c.shadowOffsetY = 4;
    if (r < 0.35) { // hay bale
      const g = c.createLinearGradient(0, -7, 0, 7); g.addColorStop(0, '#f0d27a'); g.addColorStop(1, '#a5822f');
      c.fillStyle = g; roundRect(c, -12, -7, 24, 14, 3); c.fill(); c.shadowColor = 'transparent';
      c.strokeStyle = 'rgba(90,60,20,.55)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-5, -7); c.lineTo(-5, 7); c.moveTo(5, -7); c.lineTo(5, 7); c.stroke();
    } else if (r < 0.6) { // tire stack
      for (const [ox, oy] of [[-5, -3], [5, -3], [0, 5]]) {
        const g = c.createRadialGradient(ox - 2, oy - 2, 1, ox, oy, 7); g.addColorStop(0, '#555'); g.addColorStop(1, '#070707');
        c.fillStyle = g; c.beginPath(); c.arc(ox, oy, 6.5, 0, TAU); c.fill();
      }
    } else if (r < 0.78) { // oil drum
      const col = r < 0.69 ? ['#4b8bd6', '#1b3e6b'] : ['#d84a3a', '#6b1d14'];
      const g = c.createRadialGradient(-2, -2, 1, 0, 0, 7.5); g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 7, 0, TAU); c.fill(); c.shadowColor = 'transparent';
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.arc(0, 0, 5, 0, TAU); c.stroke();
    } else { // shrub
      c.fillStyle = th.bush;
      for (let j = 0; j < 5; j++) { const a = j / 5 * TAU; c.beginPath(); c.arc(Math.cos(a) * 5, Math.sin(a) * 5, 6, 0, TAU); c.fill(); }
      c.shadowColor = 'transparent'; c.fillStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.arc(-3, -3, 5, 0, TAU); c.fill();
    }
    c.restore();
  }

  // grandstand along the top, banner wall along the bottom, side walls
  const g = c.createLinearGradient(0, 0, 0, 92); g.addColorStop(0, '#1c1f27'); g.addColorStop(1, '#3a3f4c');
  c.fillStyle = g; c.fillRect(0, 0, W, 80);
  for (let row = 0; row < 8; row++) { c.fillStyle = row & 1 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.12)'; c.fillRect(0, row * 10, W, 10); }
  const shirts = ['#e8412c', '#2f7bff', '#ffc21a', '#2ecc71', '#f4f1ea', '#9b59b6', '#ff8a1f', '#1abc9c', '#e84393', '#34495e'];
  const skins = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
  for (let row = 0; row < 7; row++) {
    for (let x = 4 + (row & 1) * 3; x < W; x += 6.5) {
      if (rng() < 0.12) continue;
      const y = 8 + row * 10;
      c.fillStyle = pick(shirts); c.fillRect(x - 2.5, y + 1, 5, 5);
      c.fillStyle = pick(skins); c.beginPath(); c.arc(x, y, 2.2, 0, TAU); c.fill();
      T.crowd.push([x, y]);
    }
  }
  c.fillStyle = '#585e6c'; c.fillRect(0, 78, W, 4);
  const banners = ['NITRO', 'DIRT KING', 'TURBO OIL', 'MUDSLINGER', 'BIG WHEELS', 'HOT RODS', 'GRIP TIRES', 'SHOCK WAVE'];
  const bcol = ['#e8412c', '#2f7bff', '#ffc21a', '#2ecc71', '#ff8a1f', '#9b59b6'];
  const wallY = H - 34;
  c.fillStyle = '#2a2e38'; c.fillRect(0, wallY, W, 34);
  c.font = '700 15px Bungee, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let x = 6, j = index0(T); x < W - 20; x += 196, j++) {
    c.fillStyle = bcol[j % bcol.length]; roundRect(c, x, wallY + 6, 186, 22, 3); c.fill();
    c.fillStyle = j % bcol.length === 2 ? '#1a1206' : '#fff'; c.fillText(banners[j % banners.length], x + 93, wallY + 18);
  }
  c.fillStyle = '#4a505e'; c.fillRect(0, wallY - 3, W, 3);
  c.fillStyle = '#2a2e38'; c.fillRect(0, 82, 10, wallY - 82); c.fillRect(W - 10, 82, 10, wallY - 82);

  // light towers (glow at night, posts by day)
  T.lights = [[60, 92], [W - 60, 92], [60, wallY - 6], [W - 60, wallY - 6], [W / 2, 92], [W / 2, wallY - 6]];
  for (const [x, y] of T.lights) {
    c.fillStyle = '#20232b'; roundRect(c, x - 14, y - 6, 28, 12, 3); c.fill();
    for (let j = 0; j < 4; j++) { c.fillStyle = '#fff6d8'; c.fillRect(x - 11 + j * 6, y - 3, 4, 6); }
  }
}
function index0(T) { return T.index * 3; }

function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
