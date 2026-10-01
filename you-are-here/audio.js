// 《你在这里》 soundtrack: felt piano + strings, with a real time-warp on the music bus.
const fs = require('fs');
const TL = require('./timeline.js');
const SR = 44100;
const N = Math.ceil(TL.DURATION * SR) + SR;           // +1s headroom
const nlog = fs.existsSync('stills_log.txt') ? new Set(fs.readFileSync('stills_log.txt', 'utf8').split('\n').filter(Boolean)).size : 0;
TL.setN(nlog);
const bus = () => ({ L: new Float32Array(N), R: new Float32Array(N), SL: new Float32Array(N), SR: new Float32Array(N) });
const MUS = bus(), FX = bus();
const rnd = TL.rng(2024);
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const BEAT = 0.6, BAR = 2.4;

function put(B, i, v, pan, send) {
  if (i < 0 || i >= N) return;
  const a = (pan + 1) * Math.PI / 4, l = v * Math.cos(a), r = v * Math.sin(a);
  B.L[i] += l; B.R[i] += r; if (send) { B.SL[i] += l * send; B.SR[i] += r * send; }
}
function svfLow(s, x, fc, q) {
  const g = Math.tan(Math.PI * Math.min(fc, SR * 0.45) / SR), k = 1 / q;
  const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
  const v3 = x - s.b, v1 = a1 * s.a + a2 * v3, v2 = s.b + a2 * s.a + a3 * v3;
  s.a = 2 * v1 - s.a; s.b = 2 * v2 - s.b; return { low: v2, band: v1, high: x - k * v1 - v2 };
}

// ---- felt piano: inharmonic additive partials via rotating phasors ----
function piano(B, t, m, vel = 0.5, dur = 1.5, pan = null, send = 0.45) {
  const f0 = mtof(m), Bk = 0.00035;
  const T60 = Math.max(1.2, 6.5 - (m - 36) * 0.09);           // low notes ring longer
  const len = Math.min(dur + 1.2, T60 * 0.9), n = Math.floor(len * SR), i0 = Math.floor(t * SR);
  const p = pan ?? Math.max(-0.7, Math.min(0.7, (m - 62) / 30));
  const out = new Float32Array(n);
  const bright = 0.35 + vel * 0.9;
  for (let k = 1; k <= 8; k++) {
    const fk = k * f0 * Math.sqrt(1 + Bk * k * k); if (fk > 9000) break;
    const amp = vel * Math.pow(k, -1.25) * (k === 1 ? 1 : bright) * (k > 4 ? 0.6 : 1);
    const dec = Math.exp(-6.9 / (T60 / (1 + 0.45 * (k - 1))) / SR);
    const w = 2 * Math.PI * fk / SR, cw = Math.cos(w), sw = Math.sin(w);
    let c = 1, s = 0, e = amp;
    for (let j = 0; j < n; j++) { out[j] += s * e; const nc = c * cw - s * sw; s = s * cw + c * sw; c = nc; e *= dec; }
  }
  const relStart = Math.floor(dur * SR), relRate = Math.exp(-1 / (0.25 * SR));
  let rel = 1; const st = { a: 0, b: 0 };
  for (let j = 0; j < n; j++) {
    if (j > relStart) rel *= relRate;
    const att = Math.min(1, j / (0.004 * SR));
    let v = out[j] * att * rel;
    if (j < 0.012 * SR) v += svfLow(st, (rnd() - 0.5) * vel * 0.25, 1800, 0.7).low * (1 - j / (0.012 * SR));
    put(B, i0 + j, v * 0.22, p, send);
  }
}
// ---- strings / pads ----
function polyblep(p, dt) { if (p < dt) { p /= dt; return p + p - p * p - 1; } if (p > 1 - dt) { p = (p - 1) / dt; return p * p + p + p + 1; } return 0; }
function strings(B, t, dur, midis, gain = 0.03, att = 1.0, rel = 1.2, lp = 1800, send = 0.6) {
  const n = Math.floor((dur + rel) * SR), i0 = Math.floor(t * SR);
  for (const m of midis) {
    const voices = [-8, -2, 4, 9].map(d => ({ f: mtof(m) * Math.pow(2, d / 1200), p: rnd() }));
    const st = { a: 0, b: 0 }, pan = (rnd() - 0.5) * 0.8;
    for (let j = 0; j < n; j++) {
      const tt = j / SR;
      const env = tt < att ? Math.pow(tt / att, 1.5) : tt < dur ? 1 : Math.exp(-(tt - dur) * 4 / rel);
      let v = 0;
      for (const o of voices) { const dt = o.f * (1 + 0.003 * Math.sin(tt * 5.1 + o.p * 6)) / SR; v += 2 * o.p - 1 - polyblep(o.p, dt); o.p += dt; if (o.p >= 1) o.p -= 1; }
      v = svfLow(st, v * 0.5, lp * (0.7 + 0.3 * Math.min(1, tt / att)), 0.7).low;
      put(B, i0 + j, v * env * gain, pan, send);
    }
  }
}
function sine(B, t, dur, f, gain, opts = {}) {
  const n = Math.floor(dur * SR), i0 = Math.floor(t * SR); let ph = 0;
  for (let j = 0; j < n; j++) {
    const tt = j / SR, ff = typeof f === 'function' ? f(tt) : f;
    const env = opts.env ? opts.env(tt) : Math.exp(-tt / (opts.decay || 0.3));
    ph += 2 * Math.PI * ff / SR;
    put(B, i0 + j, Math.sin(ph) * env * gain, opts.pan || 0, opts.send || 0);
  }
}
function noise(B, t, dur, gain, opts = {}) {
  const n = Math.floor(dur * SR), i0 = Math.floor(t * SR), st = { a: 0, b: 0 };
  for (let j = 0; j < n; j++) {
    const tt = j / SR, env = opts.env ? opts.env(tt) : Math.exp(-tt / (opts.decay || 0.05));
    let v = rnd() * 2 - 1;
    if (opts.bp) v = svfLow(st, v, typeof opts.bp === 'function' ? opts.bp(tt) : opts.bp, opts.q || 1).band;
    else if (opts.lp) v = svfLow(st, v, opts.lp, 0.7).low;
    else if (opts.hp) v = svfLow(st, v, opts.hp, 0.7).high;
    put(B, i0 + j, v * env * gain, opts.pan ?? 0, opts.send || 0);
  }
}
function musicBox(B, t, m, g = 0.08) {
  sine(B, t, 2.2, mtof(m), g, { decay: 0.6, send: 0.5, pan: 0.2 });
  sine(B, t, 0.8, mtof(m) * 4.02, g * 0.25, { decay: 0.12, send: 0.5, pan: 0.2 });
  sine(B, t, 1.2, mtof(m) * 2.0, g * 0.3, { decay: 0.3, send: 0.5, pan: 0.2 });
}

// ---- harmony ----
const PROG = [
  { bass: 41, ch: [57, 60, 64, 65] },  // Fmaj7
  { bass: 40, ch: [55, 60, 64, 67] },  // C/E
  { bass: 45, ch: [57, 60, 64, 67] },  // Am7
  { bass: 43, ch: [55, 59, 62, 67] },  // G
];
const barIdx = T => Math.floor(T / BAR + 1e-6);
const chordAt = T => PROG[((barIdx(T) - 6) % 4 + 4) % 4];
function arps(B, t0, t1, o = {}) {
  const step = o.step || 0.3, pat = o.pat || [0, 2, 3, 1, 2, 3, 1, 2];
  let k = 0;
  for (let t = t0; t < t1 - 1e-6; t += step, k++) {
    const c = chordAt(t), m = c.ch[pat[k % pat.length]] + (o.oct ?? 12);
    const vel = (o.vel || 0.3) * (k % 4 === 0 ? 1.15 : 1) * (o.cresc ? 0.5 + 0.5 * (t - t0) / (t1 - t0) : 1);
    piano(B, t, m, vel, step * 1.6, null, o.send ?? 0.45);
  }
}
function basses(B, t0, t1, vel = 0.45, every = BAR) { for (let t = t0; t < t1 - 1e-6; t += every) piano(B, t, chordAt(t).bass, vel, every, -0.2); }
function chords(B, t0, t1, vel = 0.3, oct = 0) { for (let t = t0; t < t1 - 1e-6; t += BAR) for (const m of chordAt(t).ch) piano(B, t + rnd() * 0.02, m + oct, vel, BAR); }
function pad(B, t0, t1, gain = 0.025, oct = 0, att = 1.2, lp = 1800) { for (let t = t0; t < t1 - 1e-6; t += BAR) strings(B, t, BAR, chordAt(t).ch.slice(0, 3).map(m => m + oct), gain, t === t0 ? att : 0.25, 0.9, lp); }
// Theme: [beat offset, midi, beats]
const THEME = [[0, 76, 1], [1, 74, 1], [2, 72, 2], [4, 67, 4], [8, 72, 1], [9, 74, 1], [10, 76, 2], [12, 74, 4],
  [16, 81, 1], [17, 79, 1], [18, 76, 1], [19, 72, 1], [20, 74, 2], [22, 76, 2], [24, 72, 2], [26, 69, 2], [28, 71, 4]];
function theme(B, t0, o = {}) {
  const until = o.until ?? 1e9;
  for (const [b, m, len] of THEME) {
    const t = t0 + b * BEAT * (o.slow || 1); if (t >= until) continue;
    if (o.box) musicBox(B, t, m + (o.oct || 0), o.g || 0.07);
    else { piano(B, t, m + (o.oct || 0), o.vel || 0.5, len * BEAT * (o.slow || 1), 0.1); if (o.octaves) piano(B, t, m - 12, (o.vel || 0.5) * 0.7, len * BEAT, -0.1); }
  }
}
function boom(B, t, g = 0.5) {
  sine(B, t, 3, tt => 32 + 40 * Math.exp(-tt / 0.15), g, { decay: 1.0, send: 0.3 });
  noise(B, t, 1.5, g * 0.25, { lp: 500, decay: 0.4, send: 0.5 });
}
function whoosh(B, t, dur, g = 0.05, up = true) { noise(B, t, dur, g, { env: tt => Math.pow(Math.sin(Math.PI * tt / dur), 2), bp: tt => up ? 300 + 4000 * (tt / dur) ** 2 : 4300 - 4000 * (tt / dur), q: 1.2, send: 0.4 }); }

// ================= MUSIC (composed in real time T; warped later) =================
const M = MUS;
strings(M, 9.6, 4.8, [33, 45], 0.03, 3.5, 0.5, 600, 0.4);            // low swell under "一秒都没看过"
// title
boom(M, 14.4, 0.35);
for (const m of [41, 53, 57, 60, 64, 65]) piano(M, 14.4, m, 0.5, 2.4);
theme(M, 14.4, { vel: 0.45, until: 19.2 });
pad(M, 14.4, 19.2, 0.02, 0, 2.0);
// code
basses(M, 19.2, 38.4, 0.35); arps(M, 19.2, 38.4, { vel: 0.22 }); pad(M, 26.4, 38.4, 0.015, 0, 3, 1400);
// waveform: the theme on music box
basses(M, 38.4, 48, 0.35); arps(M, 38.4, 48, { vel: 0.2 }); theme(M, 38.4, { box: true, g: 0.08, until: 48 });
// sea
basses(M, 48, 64.8, 0.4); arps(M, 48, 64.8, { vel: 0.26 }); pad(M, 48, 64.8, 0.022); theme(M, 48.0, { vel: 0.4, until: 54 });
// rain: freeze cut handled by gate below
const FROZEN = []; // things that keep sounding during the freeze (not gated)
// resume after rain freeze
basses(M, 76.8, 81.6, 0.4); arps(M, 76.8, 81.6, { vel: 0.22, cresc: true });
// mosaic reveal
boom(M, 81.6, 0.3);
basses(M, 81.6, 96, 0.45); arps(M, 81.6, 96, { vel: 0.28 }); pad(M, 81.6, 96, 0.03, 0, 2.4); pad(M, 86.4, 96, 0.015, 12, 2.4, 2600);
theme(M, 86.4, { vel: 0.45, until: 96 });
// Einstein: solo piano, sparse
for (let t = 96; t < 111.6 - 1e-6; t += BAR) { piano(M, t, chordAt(t).bass, 0.35, BAR); for (const m of chordAt(t).ch.slice(1)) piano(M, t + 0.6 + rnd() * 0.03, m, 0.2, BAR - 0.6); }
pad(M, 100.8, 111.6, 0.012, -12, 3, 900);
// build
basses(M, 111.6, 120, 0.45); arps(M, 111.6, 120, { vel: 0.3, step: 0.15, cresc: true, pat: [0, 1, 2, 3, 2, 1] });
strings(M, 111.6, 8.4, [57, 64, 69], 0.03, 7.5, 0.4, 2200, 0.6);
sine(M, 115.2, 5, tt => 55 * (1 + tt * 0.02), 0.12, { env: tt => Math.min(1, tt / 4) * (tt < 4.7 ? 1 : 0), send: 0.2 });
// hush 120-122.4: single high note
piano(M, 120.0, 88, 0.18, 2.4, 0.3, 0.8);
// "是你。" climax
boom(M, 122.4, 0.6);
for (const m of [29, 41, 53, 57, 60, 64, 65, 72, 76]) piano(M, 122.4, m, 0.85, 2.4);
basses(M, 124.8, 134.4, 0.55); arps(M, 122.4, 132, { vel: 0.33, step: 0.15, pat: [0, 1, 2, 3, 2, 1, 3, 2] });
pad(M, 122.4, 134.4, 0.04, 0, 0.6, 2400); pad(M, 122.4, 134.4, 0.02, 12, 1.5, 3200); pad(M, 122.4, 134.4, 0.03, -12, 0.8, 900);
theme(M, 122.4, { vel: 0.7, octaves: true, until: 133 });
// ending: slow theme, gentle
pad(M, 134.4, 158.4, 0.016, 0, 3, 1300);
for (let t = 134.4; t < 158.4 - 1e-6; t += BAR) { piano(M, t, chordAt(t).bass, 0.32, BAR); [0, 2, 3, 1].forEach((pi, k) => piano(M, t + k * 0.6, chordAt(t).ch[pi] + 12, 0.15, 1.2)); }
theme(M, 139.2, { vel: 0.38, slow: 1, until: 158.4 });
// credits: music box theme + final chord
theme(M, 158.4, { box: true, g: 0.085, until: 165.6 });
for (let t = 158.4; t < 165.6; t += BAR) piano(M, t, chordAt(t).bass, 0.3, BAR);
for (const m of [41, 53, 57, 60, 64, 72]) piano(M, 165.6, m, 0.3, 2.6);
// final lone note
piano(M, 169.4, 84, 0.2, 2, 0.2, 0.8);

// ---- reverb ----
function reverb(B, wet, fb = 0.88) {
  const comb = (inp, out, d) => { const buf = new Float32Array(d); let idx = 0, f = 0; for (let i = 0; i < N; i++) { const y = buf[idx]; f = y * 0.72 + f * 0.28; buf[idx] = inp[i] + f * fb; idx = (idx + 1) % d; out[i] += y; } };
  const ap = (x, d) => { const buf = new Float32Array(d); let idx = 0; for (let i = 0; i < N; i++) { const b = buf[idx]; buf[idx] = x[i] + b * 0.5; x[i] = b - x[i]; idx = (idx + 1) % d; } };
  for (const [inp, dst, sp] of [[B.SL, B.L, 0], [B.SR, B.R, 23]]) {
    const out = new Float32Array(N);
    for (const d of [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]) comb(inp, out, Math.round((d + sp) * 1.3));
    for (const d of [556, 441, 341, 225]) ap(out, d + sp);
    for (let i = 0; i < N; i++) dst[i] += out[i] * wet;
  }
}
reverb(MUS, 0.05);

// rain freeze gate on music (64.8 -> 76.8)
{ const a = Math.floor(TL.RAIN.freeze * SR), b = Math.floor(TL.RAIN.resume * SR), f = Math.floor(0.02 * SR);
  for (let i = a; i < b; i++) { const g = i < a + f ? 1 - (i - a) / f : 0; MUS.L[i] *= g; MUS.R[i] *= g; } }

// ================= TIME WARP on the music bus =================
const OUTL = new Float32Array(N), OUTR = new Float32Array(N);
const at = (arr, x) => { const i = Math.floor(x), f = x - i; return i < 0 || i + 1 >= N ? 0 : arr[i] * (1 - f) + arr[i + 1] * f; };
const W = TL.W;
for (let i = 0; i < N; i++) {
  const T = i / SR;
  if (T < W.rewA || T >= W.peekB) { OUTL[i] = MUS.L[i]; OUTR[i] = MUS.R[i]; continue; }
  let l, r;
  if (T >= W.rewB && T < W.frzB) {
    // freeze: overlapping Hann grains looping 90ms around tau = rewTo
    const G = 0.09 * SR, base = W.rewTo * SR, ph = (i - W.rewB * SR);
    l = 0; r = 0;
    for (const off of [0, G / 2]) { const q = ((ph + off) % G + G) % G, w = Math.sin(Math.PI * q / G) ** 2; l += at(MUS.L, base + q) * w; r += at(MUS.R, base + q) * w; }
  } else { const x = TL.tau(T) * SR; l = at(MUS.L, x); r = at(MUS.R, x); }
  // 15ms crossfades at each warp boundary
  let g = 1; for (const bnd of [W.rewA, W.rewB, W.frzB, W.peekB]) { const d = Math.abs(T - bnd); if (d < 0.015) g = Math.min(g, d / 0.015); }
  OUTL[i] = l * g; OUTR[i] = r * g;
}

// ================= SFX (real time, not warped) =================
const F = FX;
// soft typing for every caption character
for (const c of TL.CAPS) {
  const chars = [...c.text.replace(/\|/g, '')];
  chars.forEach((ch, k) => { if (/[\s，。、：；？！…—“”（）,.:;?!()]/.test(ch)) return; const t = c.t + k / c.cps; noise(F, t, 0.03, 0.05 + rnd() * 0.02, { decay: 0.006, bp: 2600 + rnd() * 1400, q: 1.5, pan: rnd() * 0.4 - 0.2, send: 0.15 }); });
}
// clock ticks while "t" runs in the code scene
for (let t = 24.0; t < 31.2; t += 0.6) noise(F, t, 0.02, 0.05, { decay: 0.003, hp: 5000, pan: 0.3 });
// stats counter ticks
for (let t = 31.3; t < 33.2; t += 0.05) noise(F, t, 0.01, 0.025, { decay: 0.002, hp: 6000 });
// title pin
sine(F, 14.4, 2, 1760, 0.05, { decay: 0.5, send: 0.6 }); sine(F, 14.4, 2, 2637, 0.025, { decay: 0.4, send: 0.6 });
// rewind / freeze / peek cues
noise(F, W.rewA, W.rewB - W.rewA, 0.05, { env: tt => 0.6 + 0.4 * Math.sin(tt * 40), bp: tt => 2000 + 3000 * tt, q: 2 });
sine(F, W.rewB, 0.4, 2093, 0.04, { decay: 0.1 });
// rain
function rain(t0, t1, fadeIn = 0.3, fadeOut = 0.02) {
  noise(F, t0, t1 - t0, 0.11, { env: tt => Math.min(1, tt / fadeIn) * Math.min(1, (t1 - t0 - tt) / fadeOut), lp: 3500 });
  noise(F, t0, t1 - t0, 0.05, { env: tt => Math.min(1, tt / fadeIn) * Math.min(1, (t1 - t0 - tt) / fadeOut), hp: 6000, pan: 0.3 });
  for (let t = t0; t < t1; t += 0.008 + rnd() * 0.02) { if (t > t1 - 0.01) break; sine(F, t, 0.03, 1800 + rnd() * 2600, 0.02 + rnd() * 0.02, { decay: 0.006, pan: rnd() * 1.6 - 0.8, send: 0.2 }); }
}
rain(62.4, TL.RAIN.freeze, 1.2, 0.01);
sine(F, TL.RAIN.freeze, 3, 3136, 0.03, { decay: 1.2, send: 0.7 });        // the "ting" of time stopping
strings(F, 65.4, 10.6, [76, 83], 0.012, 3, 1.2, 3000, 0.7);               // frozen air
for (const [t, m] of [[67.2, 88], [70.8, 91], [74.4, 86]]) piano(F, t, m, 0.12, 1.5, 0.4, 0.9);
rain(TL.RAIN.resume, 84.0, 0.05, 2.5);
// mosaic
whoosh(F, 80.8, 1.8, 0.07, false);
sine(F, TL.K.pin - 0.25, 0.3, tt => 900 - 1600 * tt, 0.03, { decay: 0.2 });
sine(F, TL.K.pin, 2.5, 1568, 0.05, { decay: 0.7, send: 0.6 }); sine(F, TL.K.pin, 2, 2349, 0.025, { decay: 0.5, send: 0.6 });
for (let t = 124.8; t < 132; t += BAR) whoosh(F, t - 1.2, 2.4, 0.04, true);
reverb(FX, 0.05);

// ---- master ----
const L = new Float32Array(N), R = new Float32Array(N); let peak = 0;
for (let i = 0; i < N; i++) { L[i] = Math.tanh((OUTL[i] + FX.L[i]) * 1.4); R[i] = Math.tanh((OUTR[i] + FX.R[i]) * 1.4); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
const n = Math.ceil(TL.DURATION * SR), norm = 0.9 / peak;
const buf = Buffer.alloc(44 + n * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
for (let i = 0; i < n; i++) { const fo = Math.min(1, (n - i) / (0.3 * SR)); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norm * fo)) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norm * fo)) * 32767), 46 + i * 4); }
fs.writeFileSync('soundtrack.wav', buf);
console.log('N(frames seen) =', nlog, 'peak', peak.toFixed(3));
