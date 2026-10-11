'use strict';
// Small shared helpers: math, seeded random, value noise, formatting.
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const wrapAngle = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const Noise = (() => {
  const S = 256, grid = new Float32Array(S * S), r = mulberry32(90210);
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const x0 = xi & 255, y0 = yi & 255, x1 = (x0 + 1) & 255, y1 = (y0 + 1) & 255;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = grid[y0 * S + x0], b = grid[y0 * S + x1], c = grid[y1 * S + x0], d = grid[y1 * S + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oct = 3) {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { s += n2(x * f + i * 31.7, y * f + i * 17.3) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
    return s / norm;
  }
  return { n2, fbm };
})();

const money = k => '$' + (k >= 1000 ? (k / 1000).toFixed(k % 1000 ? 2 : 0) + 'M' : k + 'K');
const ordinal = n => n + (n % 10 === 1 && n !== 11 ? 'ST' : n % 10 === 2 && n !== 12 ? 'ND' : n % 10 === 3 && n !== 13 ? 'RD' : 'TH');
const fmtTime = t => { if (t == null) return '—'; const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); };
const $ = id => document.getElementById(id);
function store(key, val) { try { if (val === undefined) return JSON.parse(localStorage.getItem('sor-' + key)); localStorage.setItem('sor-' + key, JSON.stringify(val)); } catch (e) { return null; } }
