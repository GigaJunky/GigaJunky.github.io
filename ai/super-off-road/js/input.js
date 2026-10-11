'use strict';
// Unified input. Every device reports the same shape each frame:
//   s steer -1..1, g gas 0..1, b brake 0..1, nit (held), m cumulative mouse rotation (radians), n cumulative nitro presses
//   plus menu buttons: up down left right ok back start
// Devices: kb1 (WASD), kb2 (arrows), mouse (pointer-lock spinner), touch, pad0..pad3, and the merged 'kb' and 'any'.
const Input = (() => {
  const keys = new Set(), taps = new Set(); // taps: keys pressed since the last update, so sub-frame taps still count
  const KB1 = { l: ['KeyA'], r: ['KeyD'], g: ['KeyW'], b: ['KeyS'], nit: ['Space', 'ShiftLeft'], up: ['KeyW'], down: ['KeyS'], ok: ['Space', 'KeyE'], back: ['KeyQ'] };
  const KB2 = { l: ['ArrowLeft'], r: ['ArrowRight'], g: ['ArrowUp'], b: ['ArrowDown'], nit: ['ShiftRight', 'ControlRight', 'Slash', 'Numpad0', 'Enter'], up: ['ArrowUp'], down: ['ArrowDown'], ok: ['Enter', 'NumpadEnter', 'ShiftRight'], back: ['Backspace'] };
  const GAME_KEYS = new Set([...Object.values(KB1).flat(), ...Object.values(KB2).flat(), 'Tab']);
  const mouse = { dx: 0, btn: 0, m: 0 };
  const touch = { s: 0, g: 0, b: 0, nit: false, active: false };
  const st = {}; // per device: { cur, prev, n, m, rep }
  let sens = (store('sens') || 1);

  const typing = e => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
  addEventListener('keydown', e => {
    if (typing(e)) return;
    keys.add(e.code); taps.add(e.code);
    if (GAME_KEYS.has(e.code) && e.code !== 'Tab') e.preventDefault();
    Input.onAnyKey && Input.onAnyKey(e);
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); mouse.btn = 0; });
  addEventListener('mousemove', e => { if (document.pointerLockElement) mouse.dx += e.movementX; });
  addEventListener('mousedown', e => { if (document.pointerLockElement) { mouse.btn |= 1 << e.button; e.preventDefault(); } });
  addEventListener('mouseup', e => { mouse.btn &= ~(1 << e.button); });
  addEventListener('contextmenu', e => { if (document.pointerLockElement || e.target.tagName === 'CANVAS') e.preventDefault(); });

  const any = list => list.some(k => keys.has(k) || taps.has(k));
  function kbState(L) {
    return {
      s: (any(L.r) ? 1 : 0) - (any(L.l) ? 1 : 0), g: any(L.g) ? 1 : 0, b: any(L.b) ? 1 : 0, nit: any(L.nit),
      up: any(L.up), down: any(L.down), left: any(L.l), right: any(L.r), ok: any(L.ok), back: any(L.back), start: keys.has('Enter'),
    };
  }
  // Gamepads and joysticks. Defaults: stick or d-pad steers; A / RT / stick forward = gas; B / LT / stick back = brake;
  // X Y LB RB = nitro. Triggers that a browser reports as axes (resting at -1) are found automatically.
  // Anything else can be bound in Options -> Controller setup (saved per controller name).
  const padInfo = [], padMap = store('padmap') || {};
  const btnVal = (p, i) => { const b = p.buttons[i]; return b ? (typeof b.value === 'number' && b.value > 0 ? b.value : b.pressed ? 1 : 0) : 0; };
  function axisVal(p, a) { const v = p.axes[a.i] || 0, den = 1 - a.r * a.d; return clamp((v - a.r) * a.d / (Math.abs(den) < 0.2 ? 1 : den), 0, 1); }
  function bindVal(p, x) { return !x ? 0 : x.t === 'b' ? btnVal(p, x.i) : axisVal(p, x); }
  function trackPad(i, p, t) {
    let inf = padInfo[i];
    if (!inf || inf.id !== p.id) inf = padInfo[i] = { id: p.id, low: [], trig: [] };
    for (let k = 2; k < p.axes.length; k++) {
      const v = p.axes[k];
      if (v <= -0.95) { if (!inf.low[k]) inf.low[k] = t; else if (t - inf.low[k] > 700 && !inf.trig.includes(k)) inf.trig.push(k); }
      else inf.low[k] = 0;
    }
    return inf;
  }
  function padState(p, i, t) {
    const B = k => btnVal(p, k), inf = trackPad(i, p, t), map = padMap[p.id];
    const dz = v => Math.abs(v) < 0.2 ? 0 : (v - Math.sign(v) * 0.2) / 0.8;
    const ax = dz(p.axes[0] || 0), ay = dz(p.axes[1] || 0);
    const std = p.mapping === 'standard';
    const fwd = clamp((-ay - 0.25) / 0.55, 0, 1), back = ay > 0.6 ? clamp((ay - 0.6) / 0.3, 0, 1) : 0;
    const trigAx = k => ({ t: 'a', i: k, r: -1, d: 1 });
    let g, b, nit;
    if (std) {
      g = Math.max(B(7), B(0), fwd); b = Math.max(B(6), B(1) > 0.5 ? 1 : 0, back);
      nit = B(2) > 0.5 || B(3) > 0.5 || B(4) > 0.5 || B(5) > 0.5;
    } else {
      const lt = inf.trig[0] != null ? axisVal(p, trigAx(inf.trig[0])) : 0, rt = inf.trig[1] != null ? axisVal(p, trigAx(inf.trig[1])) : 0;
      g = Math.max(B(0), rt, fwd); b = Math.max(B(1) > 0.5 ? 1 : 0, lt, back);
      nit = B(2) > 0.5 || B(3) > 0.5 || B(4) > 0.5 || B(5) > 0.5;
    }
    if (map) {
      if (map.gas) g = bindVal(p, map.gas);
      if (map.brake) b = bindVal(p, map.brake);
      if (map.nitro) nit = bindVal(p, map.nitro) > 0.5;
    }
    const dl = std && B(14) > 0.5, dr = std && B(15) > 0.5, du = std && B(12) > 0.5, dd = std && B(13) > 0.5;
    return {
      s: clamp(ax + dr - dl, -1, 1), g, b, nit,
      up: ay < -0.5 || du, down: ay > 0.5 || dd, left: ax < -0.5 || dl, right: ax > 0.5 || dr,
      ok: B(0) > 0.5 || (!!map && !!map.gas && map.gas.t === 'b' && g > 0.5), back: B(1) > 0.5, start: B(9) > 0.5,
    };
  }
  const EMPTY = { s: 0, g: 0, b: 0, nit: false, up: false, down: false, left: false, right: false, ok: false, back: false, start: false };
  function merge(list) {
    const o = { ...EMPTY };
    for (const x of list) {
      if (!x) continue;
      if (Math.abs(x.s) > Math.abs(o.s)) o.s = x.s;
      o.g = Math.max(o.g, x.g); o.b = Math.max(o.b, x.b);
      for (const k of ['nit', 'up', 'down', 'left', 'right', 'ok', 'back', 'start']) o[k] = o[k] || x[k];
    }
    return o;
  }

  let pads = [];
  function update() {
    pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    const raw = {};
    raw.kb1 = kbState(KB1); raw.kb2 = kbState(KB2);
    const locked = !!document.pointerLockElement;
    raw.mouse = { ...EMPTY, g: locked && mouse.btn & 1 ? 1 : 0, b: locked && mouse.btn & 4 ? 1 : 0, nit: locked && !!(mouse.btn & 2) };
    mouse.m += mouse.dx * 0.0042 * sens; mouse.dx = 0;
    raw.touch = { ...EMPTY, s: touch.s, g: touch.g, b: touch.b, nit: touch.nit };
    const now = performance.now();
    for (let i = 0; i < 4; i++) raw['pad' + i] = pads[i] && pads[i].connected ? padState(pads[i], i, now) : null;
    raw.kb = merge([raw.kb1, raw.kb2]);
    raw.kb.start = keys.has('Enter') || keys.has('NumpadEnter') || taps.has('Enter');
    taps.clear();
    raw.pads = merge([raw.pad0, raw.pad1, raw.pad2, raw.pad3]);
    raw.solo = merge([raw.kb, raw.pads]); // a lone local driver can use any keyboard or controller
    raw.any = merge([raw.kb, raw.mouse, raw.touch, raw.pads]);
    raw.any.back = raw.any.back || keys.has('Escape');
    const t = performance.now();
    for (const d in raw) {
      const s = st[d] || (st[d] = { cur: EMPTY, prev: EMPTY, n: 0, rep: {} });
      s.prev = s.cur; s.cur = raw[d] || EMPTY;
      if (s.cur.nit && !s.prev.nit) s.n++;
      for (const k of ['up', 'down', 'left', 'right']) {
        if (s.cur[k] && !s.prev[k]) s.rep[k] = t + 380; else if (!s.cur[k]) s.rep[k] = 0;
      }
      s.t = t;
    }
  }
  // Driving input for a device.
  function drive(d) {
    const s = st[d] || { cur: EMPTY, n: 0 };
    const mm = d === 'mouse' || d === 'any' ? mouse.m : 0;
    return { s: s.cur.s, g: s.cur.g, b: s.cur.b, m: mm, n: s.n };
  }
  // Edge-triggered menu button, with auto-repeat for directions.
  function pressed(d, k) {
    const s = st[d]; if (!s) return false;
    if (s.cur[k] && !s.prev[k]) return true;
    if (s.rep[k] && s.cur[k] && s.t >= s.rep[k]) { s.rep[k] = s.t + 110; return true; }
    return false;
  }
  function gasPressed(d) { const s = st[d]; return !!s && s.cur.g > 0.5 && !(s.prev.g > 0.5); }
  function held(d, k) { const s = st[d]; return !!s && !!s.cur[k]; }
  function connectedPads() { const out = []; for (let i = 0; i < 4; i++) if (pads[i] && pads[i].connected) out.push('pad' + i); return out; }
  function padName(d) { const p = pads[+d.slice(3)]; return p ? p.id.replace(/\(.*?\)/g, '').trim().slice(0, 28) || 'Gamepad' : 'Gamepad'; }

  // ---------------------------------------------------------------- touch overlay
  function bindTouch(root) {
    const pad = root.querySelector('.t-steer'), knob = root.querySelector('.t-knob');
    let sid = null, sx = 0;
    pad.addEventListener('pointerdown', e => { sid = e.pointerId; sx = e.clientX; pad.setPointerCapture(e.pointerId); touch.active = true; knob.style.transform = 'translateX(0px)'; e.preventDefault(); });
    pad.addEventListener('pointermove', e => { if (e.pointerId !== sid) return; const dx = clamp(e.clientX - sx, -70, 70); touch.s = dx / 55; touch.s = clamp(touch.s, -1, 1); knob.style.transform = `translateX(${dx}px)`; });
    const end = e => { if (e.pointerId !== sid) return; sid = null; touch.s = 0; knob.style.transform = 'translateX(0px)'; };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
    for (const [cls, key] of [['.t-gas', 'g'], ['.t-brake', 'b'], ['.t-nitro', 'nit']]) {
      const el = root.querySelector(cls);
      const on = e => { el.setPointerCapture && el.setPointerCapture(e.pointerId); touch[key] = key === 'nit' ? true : 1; el.classList.add('down'); touch.active = true; e.preventDefault(); };
      const off = () => { touch[key] = key === 'nit' ? false : 0; el.classList.remove('down'); };
      el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
    }
  }
  return {
    update, drive, pressed, gasPressed, held, connectedPads, padName, bindTouch, touch, keys,
    rawPads: () => pads.map((p, i) => p && p.connected ? { i, id: p.id, mapping: p.mapping, axes: [...p.axes], buttons: p.buttons.map(b => (b.value || (b.pressed ? 1 : 0))), trig: padInfo[i] ? padInfo[i].trig : [] } : null).filter(Boolean),
    padMapFor: id => padMap[id] || null,
    setPadMap(id, m) { if (m) padMap[id] = m; else delete padMap[id]; store('padmap', padMap); },
    padRead: i => st['pad' + i] ? st['pad' + i].cur : null,
    get sens() { return sens; }, set sens(v) { sens = v; store('sens', v); },
    get mouseLocked() { return !!document.pointerLockElement; },
    onAnyKey: null,
  };
})();
