'use strict';
// All sound is synthesized with WebAudio: per-truck engines, one-shot effects, crowd, and a procedural rock score.
const Sound = (() => {
  let ctx = null, master, sfx, mus, verb, noise, engines = [], crowdG = null;
  const opts = Object.assign({ music: 0.55, sfx: 0.85, voice: true }, store('audio') || {});

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    comp.connect(ctx.destination);
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(comp);
    sfx = ctx.createGain(); sfx.gain.value = opts.sfx; sfx.connect(master);
    mus = ctx.createGain(); mus.gain.value = opts.music * 0.5; mus.connect(master);
    const conv = ctx.createConvolver(); conv.buffer = impulse(2.4, 2.6);
    verb = ctx.createGain(); verb.gain.value = 0.22; verb.connect(conv); conv.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (let i = 0; i < 4; i++) engines.push(makeEngine());
    startCrowd();
    if (M.want) music(true, M.intensity);
  }
  function impulse(sec, decay) {
    const len = ctx.sampleRate * sec, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  const now = () => ctx.currentTime;
  function noiseSrc(loop = true) { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = loop; s.loopStart = Math.random(); return s; }
  function shaper(k) {
    const ws = ctx.createWaveShaper(), n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / n * 2 - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
    ws.curve = c; return ws;
  }
  function panner(p) { if (ctx.createStereoPanner) { const s = ctx.createStereoPanner(); s.pan.value = p || 0; return s; } return ctx.createGain(); }

  // ---------------------------------------------------------------- engines
  function makeEngine() {
    const out = ctx.createGain(); out.gain.value = 0;
    const pan = panner(0); out.connect(pan); pan.connect(sfx);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), sub = ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'square'; sub.type = 'sine';
    const ws = shaper(6), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3; lp.frequency.value = 400;
    const g1 = ctx.createGain(), g2 = ctx.createGain(), gs = ctx.createGain(); g1.gain.value = 0.35; g2.gain.value = 0.22; gs.gain.value = 0.5;
    // amplitude flutter for a lumpy V8 feel
    const am = ctx.createGain(); am.gain.value = 0.7; const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
    lfo.type = 'square'; lfoG.gain.value = 0.25; lfo.connect(lfoG); lfoG.connect(am.gain);
    o1.connect(g1); o2.connect(g2); g1.connect(ws); g2.connect(ws); ws.connect(lp); lp.connect(am); sub.connect(gs); gs.connect(am); am.connect(out);
    // tire/dirt noise
    const ns = noiseSrc(), skidF = ctx.createBiquadFilter(), skidG = ctx.createGain(), rumF = ctx.createBiquadFilter(), rumG = ctx.createGain();
    skidF.type = 'bandpass'; skidF.frequency.value = 1100; skidF.Q.value = 0.9; skidG.gain.value = 0;
    rumF.type = 'lowpass'; rumF.frequency.value = 260; rumG.gain.value = 0;
    ns.connect(skidF); skidF.connect(skidG); skidG.connect(pan); ns.connect(rumF); rumF.connect(rumG); rumG.connect(pan);
    // nitro roar
    const nitF = ctx.createBiquadFilter(), nitG = ctx.createGain(); nitF.type = 'bandpass'; nitF.frequency.value = 500; nitF.Q.value = 0.6; nitG.gain.value = 0;
    ns.connect(nitF); nitF.connect(nitG); nitG.connect(pan);
    for (const o of [o1, o2, sub, lfo, ns]) o.start();
    return {
      set(rpm, load, vol, p, skid, rumble, nitro) {
        const t = now(), f = 30 + rpm * 92;
        o1.frequency.setTargetAtTime(f, t, 0.03); o2.frequency.setTargetAtTime(f * 0.502, t, 0.03); sub.frequency.setTargetAtTime(f * 0.5, t, 0.03);
        lfo.frequency.setTargetAtTime(f * 0.25, t, 0.03);
        lp.frequency.setTargetAtTime(220 + load * 1300 + rpm * 700 + nitro * 900, t, 0.04);
        out.gain.setTargetAtTime(vol * (0.22 + 0.5 * load + 0.12 * rpm), t, 0.05);
        if (pan.pan) pan.pan.setTargetAtTime(clamp(p, -0.85, 0.85), t, 0.05);
        skidG.gain.setTargetAtTime(vol * clamp(skid, 0, 1) * 0.35, t, 0.04);
        rumG.gain.setTargetAtTime(vol * clamp(rumble, 0, 1) * 0.5, t, 0.06);
        nitG.gain.setTargetAtTime(vol * nitro * 0.4, t, 0.05);
      },
    };
  }
  function engine(i, rpm, load, vol, pan, skid, rumble, nitro) { if (ctx && engines[i]) engines[i].set(rpm, load, vol, pan, skid, rumble, nitro); }
  function silenceEngines() { if (!ctx) return; for (const e of engines) e.set(0, 0, 0, 0, 0, 0, 0); }

  // ---------------------------------------------------------------- one-shots
  function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function tone(type, f0, f1, dur, vol, p = 0, dest = sfx, delay = 0, wet = 0) {
    if (!ctx) return; const t = now() + delay;
    const o = ctx.createOscillator(), g = ctx.createGain(), pn = panner(p);
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.005, vol, dur); o.connect(g); g.connect(pn); pn.connect(dest); if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(verb); }
    o.start(t); o.stop(t + dur + 0.05);
  }
  function burst(type, f0, f1, q, dur, vol, p = 0, delay = 0, wet = 0, attack = 0.004) {
    if (!ctx) return; const t = now() + delay;
    const s = noiseSrc(false), f = ctx.createBiquadFilter(), g = ctx.createGain(), pn = panner(p);
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, attack, vol, dur); s.connect(f); f.connect(g); g.connect(pn); pn.connect(sfx); if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(verb); }
    s.start(t, Math.random()); s.stop(t + dur + 0.1);
  }
  const fx = {
    land(v, p) { const k = clamp(v / 500, 0.2, 1); tone('sine', 120, 38, 0.3, 0.6 * k, p); burst('lowpass', 900, 200, 0.7, 0.25, 0.45 * k, p); tone('square', 60, 40, 0.12, 0.08 * k, p); },
    wall(v, p) { const k = clamp(v / 250, 0.15, 1); for (const f of [233, 347, 521, 811]) tone('square', f * rnd(0.95, 1.05), f * 0.7, 0.16, 0.06 * k, p, sfx, 0, 0.3); burst('highpass', 2400, 1200, 0.8, 0.12, 0.25 * k, p); tone('sine', 90, 50, 0.15, 0.4 * k, p); },
    bump(v, p) { const k = clamp(v / 200, 0.15, 1); for (const f of [180, 271, 405]) tone('square', f, f * 0.8, 0.12, 0.05 * k, p); tone('sine', 110, 55, 0.18, 0.45 * k, p); burst('bandpass', 700, 300, 1, 0.15, 0.25 * k, p); },
    splash(v, p) { const k = clamp(v / 200, 0.3, 1); burst('bandpass', 2600, 400, 0.6, 0.55, 0.5 * k, p, 0, 0.2, 0.02); burst('highpass', 5000, 3000, 0.5, 0.3, 0.15 * k, p, 0.05); },
    mud(v, p) { burst('lowpass', 700, 150, 1.5, 0.35, 0.35, p, 0, 0, 0.01); },
    nitro(p) { burst('bandpass', 300, 3000, 0.7, 0.45, 0.5, p, 0, 0.3, 0.02); burst('lowpass', 400, 900, 0.6, 1.4, 0.4, p, 0.05, 0, 0.1); tone('sawtooth', 70, 140, 1.2, 0.1, p); },
    pickNitro(p) { [784, 988, 1319, 1568].forEach((f, i) => tone('square', f, f, 0.09, 0.09, p, sfx, i * 0.055, 0.3)); },
    cash(p) { tone('sine', 1568, 1568, 0.5, 0.18, p, sfx, 0, 0.4); tone('sine', 2093, 2093, 0.6, 0.15, p, sfx, 0.07, 0.4); burst('highpass', 6000, 6000, 1, 0.06, 0.2, p); tone('triangle', 3136, 3136, 0.4, 0.06, p, sfx, 0.07); },
    beep(go) { if (go) { tone('square', 880, 880, 0.55, 0.16, 0, sfx, 0, 0.3); tone('square', 1760, 1760, 0.4, 0.05, 0); } else tone('square', 440, 440, 0.22, 0.14, 0, sfx, 0, 0.2); },
    lap(p) { tone('triangle', 1046, 1046, 0.12, 0.12, p); tone('triangle', 1568, 1568, 0.2, 0.12, p, sfx, 0.08); },
    finalLap() { [523, 659, 784, 1046].forEach((f, i) => tone('sawtooth', f, f, 0.16, 0.07, 0, sfx, i * 0.09, 0.4)); cheer(0.7); },
    finish(win) { if (win) [523, 659, 784, 1046, 1319].forEach((f, i) => tone('square', f, f, i === 4 ? 0.7 : 0.14, 0.08, 0, sfx, i * 0.11, 0.5)); cheer(win ? 1 : 0.5); },
    ui() { tone('triangle', 900, 900, 0.05, 0.08); },
    select() { tone('triangle', 660, 660, 0.06, 0.1); tone('triangle', 990, 990, 0.08, 0.1, 0, sfx, 0.05); },
    buy() { fx.cash(0); },
    error() { tone('square', 140, 110, 0.18, 0.1); },
    join() { tone('sawtooth', 220, 440, 0.18, 0.1, 0, sfx, 0, 0.3); tone('square', 660, 660, 0.12, 0.06, 0, sfx, 0.12); },
    horn(p) { tone('sawtooth', 330, 330, 0.35, 0.08, p); tone('sawtooth', 415, 415, 0.35, 0.08, p); },
  };
  function cheer(k = 1) {
    if (!ctx) return;
    for (let i = 0; i < 5; i++) burst('bandpass', rnd(500, 2600), rnd(400, 2000), 1.2, rnd(1.4, 2.6), 0.12 * k, rnd(-0.8, 0.8), i * 0.08, 0.4, 0.25);
    for (let i = 0; i < 6; i++) tone('triangle', rnd(1400, 2400), rnd(1800, 2800), 0.15, 0.025 * k, rnd(-0.8, 0.8), sfx, rnd(0.2, 1.2));
  }
  function startCrowd() {
    const s = noiseSrc(), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.5;
    crowdG = ctx.createGain(); crowdG.gain.value = 0; s.connect(f); f.connect(crowdG); crowdG.connect(sfx); s.start();
  }
  function crowd(level) { if (crowdG) crowdG.gain.setTargetAtTime(level * 0.05, now(), 0.5); }

  // ---------------------------------------------------------------- music: procedural desert rock
  const M = { on: false, step: 0, next: 0, timer: null, bpm: 138, intensity: 1, bar: 0 };
  const PROG = [[40, 40, 43, 45], [40, 40, 38, 36], [45, 45, 43, 38], [40, 43, 45, 47]];
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  function kick(t) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); env(g, t, 0.002, 0.9, 0.22); o.connect(g); g.connect(mus); o.start(t); o.stop(t + 0.3); }
  function snare(t) {
    const s = noiseSrc(false), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'highpass'; f.frequency.value = 1400; env(g, t, 0.002, 0.45, 0.16);
    s.connect(f); f.connect(g); g.connect(mus); const w = ctx.createGain(); w.gain.value = 0.3; g.connect(w); w.connect(verb); s.start(t, Math.random()); s.stop(t + 0.25);
    const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08); env(og, t, 0.002, 0.3, 0.09); o.connect(og); og.connect(mus); o.start(t); o.stop(t + 0.15);
  }
  function hat(t, open) { const s = noiseSrc(false), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'highpass'; f.frequency.value = 7500; env(g, t, 0.001, open ? 0.12 : 0.07, open ? 0.2 : 0.035); s.connect(f); f.connect(g); g.connect(mus); s.start(t, Math.random()); s.stop(t + 0.3); }
  function bass(t, n, dur) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = midi(n - 12);
    f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(220, t + dur); f.Q.value = 4;
    env(g, t, 0.005, 0.32, dur); o.connect(f); f.connect(g); g.connect(mus); o.start(t); o.stop(t + dur + 0.05);
  }
  function chug(t, n, dur, accent) {
    const g = ctx.createGain(), ws = shaper(18), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = accent ? 3200 : 1500;
    env(g, t, 0.004, accent ? 0.16 : 0.1, dur);
    for (const [iv, det] of [[0, -6], [7, 5], [12, 0]]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n + iv); o.detune.value = det; o.connect(ws); o.start(t); o.stop(t + dur + 0.05); }
    ws.connect(f); f.connect(g); g.connect(mus);
  }
  function lead(t, n, dur) {
    const o = ctx.createOscillator(), g = ctx.createGain(), v = ctx.createOscillator(), vg = ctx.createGain(); o.type = 'square'; o.frequency.value = midi(n);
    v.frequency.value = 6; vg.gain.value = 6; v.connect(vg); vg.connect(o.detune);
    env(g, t, 0.01, 0.06, dur); o.connect(g); g.connect(mus); const w = ctx.createGain(); w.gain.value = 0.5; g.connect(w); w.connect(verb);
    o.start(t); v.start(t); o.stop(t + dur + 0.05); v.stop(t + dur + 0.05);
  }
  const LEAD = [64, 67, 69, 71, 74, 76, 79];
  function schedStep(t) {
    const s = M.step % 16, bar = Math.floor(M.step / 16), sec = Math.floor(bar / 4) % PROG.length, root = PROG[sec][bar % 4];
    const sixteenth = 60 / M.bpm / 4, hi = M.intensity;
    if (s === 0 || s === 8 || (s === 10 && bar % 2)) kick(t);
    if (s === 4 || s === 12) snare(t);
    if (hi > 0.5 && s % 2 === 0) hat(t, s === 14);
    if (s % 2 === 0) bass(t, root, sixteenth * 1.8);
    if (hi > 0.5 && s % 2 === 0) chug(t, root, s % 4 === 0 ? sixteenth * 1.6 : sixteenth * 0.9, s % 8 === 0);
    if (hi > 0.9 && (bar % 8) >= 4 && s % 3 === 0) lead(t, LEAD[(M.step * 7 + bar * 3) % LEAD.length], sixteenth * 2.6);
    M.step++;
  }
  function musicTick() {
    if (!ctx || !M.on) return;
    while (M.next < now() + 0.15) { schedStep(M.next); M.next += 60 / M.bpm / 4; }
  }
  function music(on, intensity = 1) {
    M.intensity = intensity;
    M.want = on;
    if (!ctx) return;
    if (mus) mus.gain.setTargetAtTime(on ? opts.music * (intensity < 0.9 ? 0.32 : 0.5) : 0, now(), 0.4);
    if (on && !M.on) { M.on = true; M.next = now() + 0.1; M.step = 0; clearInterval(M.timer); M.timer = setInterval(musicTick, 30); }
    if (!on && M.on) { M.on = false; setTimeout(() => { if (!M.on) clearInterval(M.timer); }, 600); }
  }

  function say(text) {
    if (!opts.voice || !window.speechSynthesis) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1.05; u.pitch = 0.75; u.volume = 0.9; speechSynthesis.speak(u); } catch (e) { /* no voice */ }
  }
  function setOpt(k, v) {
    opts[k] = v; store('audio', opts);
    if (ctx) { sfx.gain.value = opts.sfx; mus.gain.setTargetAtTime(M.on ? opts.music * (M.intensity < 0.9 ? 0.32 : 0.5) : 0, now(), 0.1); }
  }
  return { init, engine, silenceEngines, fx, cheer, crowd, music, say, opts, setOpt, get ready() { return !!ctx; } };
})();
