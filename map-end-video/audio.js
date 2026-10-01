// Offline synth: renders the whole soundtrack to soundtrack.wav
const fs = require('fs');
const TL = require('./timeline.js');
const SR = 44100;
const N = Math.ceil(TL.DURATION * SR);
const L = new Float32Array(N), R = new Float32Array(N);
const SL = new Float32Array(N), SRb = new Float32Array(N); // reverb send
const rnd = TL.rng(1234);
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const BEAT = 0.5;

function polyblep(p, dt) {
  if (p < dt) { p /= dt; return p + p - p * p - 1; }
  if (p > 1 - dt) { p = (p - 1) / dt; return p * p + p + p + 1; }
  return 0;
}
function svf() { return { ic1: 0, ic2: 0 }; }
function svfLow(s, x, fc, q) {
  fc = Math.min(fc, SR * 0.45);
  const g = Math.tan(Math.PI * fc / SR), k = 1 / q;
  const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
  const v3 = x - s.ic2, v1 = a1 * s.ic1 + a2 * v3, v2 = s.ic2 + a2 * s.ic1 + a3 * v3;
  s.ic1 = 2 * v1 - s.ic1; s.ic2 = 2 * v2 - s.ic2;
  return { low: v2, band: v1, high: x - k * v1 - v2 };
}
function put(i, v, pan, send) {
  if (i < 0 || i >= N) return;
  const l = v * Math.cos((pan + 1) * Math.PI / 4), r = v * Math.sin((pan + 1) * Math.PI / 4);
  L[i] += l; R[i] += r;
  if (send) { SL[i] += l * send; SRb[i] += r * send; }
}

// Generic voice
function tone(o) {
  const { t, dur } = o;
  const a = o.a ?? 0.005, d = o.d ?? 0.1, s = o.s ?? 0.7, r = o.r ?? 0.1;
  const gain = o.gain ?? 0.2, pan = o.pan ?? 0, send = o.send ?? 0;
  const type = o.type || 'sine';
  const detune = o.detune || [0];
  const total = dur + r;
  const i0 = Math.floor(t * SR), n = Math.floor(total * SR);
  const phases = detune.map(() => rnd());
  const filt = o.lp ? svf() : null;
  const vib = o.vib || 0, vibF = o.vibF || 5.5;
  for (let j = 0; j < n; j++) {
    const tt = j / SR;
    let env;
    if (tt < a) env = tt / a;
    else if (tt < a + d) env = 1 - (1 - s) * ((tt - a) / d);
    else if (tt < dur) env = s;
    else env = s * Math.exp(-(tt - dur) / (r / 4 + 1e-4));
    if (o.decay) env *= Math.exp(-tt / o.decay);
    let f = typeof o.f === 'function' ? o.f(tt) : o.f;
    if (vib) f *= 1 + vib * Math.sin(2 * Math.PI * vibF * tt) * Math.min(1, tt / 0.3);
    let v = 0;
    for (let k = 0; k < detune.length; k++) {
      const fk = f * Math.pow(2, detune[k] / 1200), dt = fk / SR;
      let p = phases[k];
      let x;
      if (type === 'saw') x = 2 * p - 1 - polyblep(p, dt);
      else if (type === 'square') x = (p < 0.5 ? 1 : -1) + polyblep(p, dt) - polyblep((p + 0.5) % 1, dt);
      else if (type === 'triangle') x = 1 - 4 * Math.abs(p - 0.5);
      else if (type === 'fm') x = Math.sin(2 * Math.PI * p + 2.2 * Math.exp(-tt * 12) * Math.sin(4 * Math.PI * p));
      else if (type === 'marimba') x = Math.sin(2 * Math.PI * p) + 0.35 * Math.sin(8 * Math.PI * p) * Math.exp(-tt * 30);
      else if (type === 'piano') x = Math.sin(2 * Math.PI * p) + 0.4 * Math.sin(4 * Math.PI * p) * Math.exp(-tt * 3) + 0.15 * Math.sin(6 * Math.PI * p) * Math.exp(-tt * 6);
      else x = Math.sin(2 * Math.PI * p);
      v += x;
      p += dt; if (p >= 1) p -= 1; phases[k] = p;
    }
    v /= Math.sqrt(detune.length);
    if (filt) {
      const fc = typeof o.lp === 'function' ? o.lp(tt) : o.lp;
      v = svfLow(filt, v, fc, o.q || 0.8).low;
    }
    put(i0 + j, v * env * gain, pan, send);
  }
}
function noise(o) {
  const { t, dur } = o;
  const gain = o.gain ?? 0.2, pan = o.pan ?? 0, send = o.send ?? 0;
  const i0 = Math.floor(t * SR), n = Math.floor(dur * SR);
  const f1 = svf();
  for (let j = 0; j < n; j++) {
    const tt = j / SR;
    const env = o.env ? o.env(tt) : Math.exp(-tt / (o.decay || 0.1));
    let v = rnd() * 2 - 1;
    if (o.bp) v = svfLow(f1, v, typeof o.bp === 'function' ? o.bp(tt) : o.bp, o.q || 1).band * 2;
    else if (o.hp) v = svfLow(f1, v, o.hp, 0.7).high;
    else if (o.lp) v = svfLow(f1, v, typeof o.lp === 'function' ? o.lp(tt) : o.lp, 0.7).low;
    put(i0 + j, v * env * gain, pan, send);
  }
}
function ks(t, f, dur, gain = 0.25, pan = 0, bright = 0.5, send = 0.3) {
  const P = Math.max(2, Math.round(SR / f));
  const buf = new Float32Array(P);
  for (let i = 0; i < P; i++) buf[i] = rnd() * 2 - 1;
  // pre-filter for brightness
  for (let i = 1; i < P; i++) buf[i] = buf[i] * bright + buf[i - 1] * (1 - bright);
  const i0 = Math.floor(t * SR), n = Math.floor(dur * SR);
  let idx = 0, prev = 0;
  const damp = 0.996;
  for (let j = 0; j < n; j++) {
    const cur = buf[idx];
    const nv = damp * 0.5 * (cur + prev);
    prev = cur; buf[idx] = nv;
    idx = (idx + 1) % P;
    const fade = j > n - 2000 ? (n - j) / 2000 : 1;
    put(i0 + j, cur * gain * fade, pan, send);
  }
}

// ---- drums ----
function kick(t, g = 0.9) {
  tone({ t, dur: 0.01, r: 0.4, a: 0.001, d: 0.01, s: 1, f: tt => 45 + 110 * Math.exp(-tt / 0.03), gain: g, decay: 0.18 });
  noise({ t, dur: 0.01, decay: 0.003, gain: 0.25 * g, hp: 2000 });
}
function snare(t, g = 0.35) {
  noise({ t, dur: 0.25, decay: 0.07, gain: g, bp: 3500, q: 0.6, send: 0.15 });
  tone({ t, dur: 0.01, r: 0.12, f: tt => 190 * (1 + 0.5 * Math.exp(-tt / 0.01)), gain: g * 0.8, decay: 0.05 });
}
function clap(t, g = 0.3) {
  for (const o of [0, 0.011, 0.023]) noise({ t: t + o, dur: 0.2, decay: o === 0.023 ? 0.08 : 0.01, gain: g, bp: 1400, q: 1.2, send: 0.25 });
}
function hat(t, g = 0.08, open = false, pan = 0.2) { noise({ t, dur: open ? 0.3 : 0.06, decay: open ? 0.09 : 0.018, gain: g, hp: 8000, pan }); }
function crash(t, g = 0.22) { noise({ t, dur: 2.5, decay: 0.7, gain: g, hp: 5000, send: 0.3 }); }
function tom(t, f = 110, g = 0.4) { tone({ t, dur: 0.01, r: 0.35, f: tt => f * (1 + 0.6 * Math.exp(-tt / 0.02)), gain: g, decay: 0.15, send: 0.2 }); }
function wood(t, g = 0.15) { tone({ t, dur: 0.01, r: 0.08, f: 900, gain: g, decay: 0.025, pan: 0.3, send: 0.2 }); }

// ---- harmony ----
const PROG = [ // Am F C G
  { root: 45, chord: [57, 60, 64] },
  { root: 41, chord: [57, 60, 65] },
  { root: 48, chord: [55, 60, 64] },
  { root: 43, chord: [55, 59, 62] },
];
const chordAt = t => PROG[Math.floor(t / 2) % 4];

function pad(t0, t1, opts = {}) {
  for (let b = Math.floor(t0 / 2) * 2; b < t1; b += 2) {
    const c = chordAt(b);
    const notes = opts.notes ? opts.notes(b) : c.chord;
    for (const m of notes) tone({
      t: b, dur: 2, a: opts.a ?? 0.4, d: 0.5, s: 0.8, r: 0.9, f: mtof(m + (opts.oct || 0)), type: 'saw',
      detune: [-9, 0, 9], lp: opts.lp ?? 1400, gain: opts.gain ?? 0.035, send: 0.5, pan: (m % 3 - 1) * 0.3,
    });
  }
}
function bass(t0, t1, pattern = 'eighth', g = 0.16) {
  for (let t = t0; t < t1 - 1e-6; t += 0.25) {
    const c = chordAt(t), step = Math.round((t % 2) / 0.25);
    if (pattern === 'eighth' || (pattern === 'pump' && step % 2 === 1) || (pattern === 'root' && step % 4 === 0)) {
      const m = c.root + (pattern === 'pump' && step % 4 === 3 ? 12 : 0);
      tone({ t, dur: 0.2, a: 0.003, d: 0.1, s: 0.6, r: 0.05, f: mtof(m), type: 'saw', lp: tt => 300 + 1600 * Math.exp(-tt / 0.06), q: 1.2, gain: g });
      tone({ t, dur: 0.2, r: 0.05, f: mtof(m - 12), gain: g * 0.9 });
    }
  }
}
function groove(t0, t1, o = {}) {
  for (let t = t0; t < t1 - 1e-6; t += BEAT) {
    const beat = Math.round(t / BEAT) % 4;
    if (o.kick !== false) kick(t, o.kg ?? 0.8);
    if (beat === 1 || beat === 3) (o.clap ? clap : snare)(t, o.sg ?? 0.3);
    if (o.hats !== false) { hat(t + 0.25, 0.07, true); hat(t, 0.04); hat(t + 0.125, 0.025); hat(t + 0.375, 0.025); }
  }
}
function arp(t0, t1, o = {}) {
  const step = o.step || 0.125;
  let k = 0;
  for (let t = t0; t < t1 - 1e-6; t += step, k++) {
    const c = chordAt(t);
    const seq = [0, 1, 2, 1, 2, 0, 2, 1];
    const m = c.chord[seq[k % 8]] + 12 + (o.oct || 0) + (k % 16 >= 12 ? 12 : 0);
    tone({ t, dur: step * 0.6, a: 0.002, d: 0.05, s: 0.4, r: 0.05, f: mtof(m), type: o.type || 'square', lp: o.lp ?? 3000, gain: o.gain ?? 0.04, pan: k % 2 ? 0.4 : -0.4, send: 0.3 });
  }
}
// Hook: plays over 8s (4 bars)
const HOOK = [ // [beatOffset, midi, lenBeats]
  [0, 76, 1.5], [1.5, 74, 0.5], [2, 76, 1], [3, 79, 1],
  [4, 77, 1.5], [5.5, 76, 0.5], [6, 72, 2],
  [8, 72, 1.5], [9.5, 74, 0.5], [10, 76, 1], [11, 79, 1],
  [12, 81, 1], [13, 79, 1], [14, 74, 2],
];
function hook(t0, g = 0.05, type = 'saw') {
  for (const [b, m, len] of HOOK) tone({
    t: t0 + b * BEAT, dur: len * BEAT * 0.9, a: 0.01, d: 0.2, s: 0.7, r: 0.2, f: mtof(m), type,
    detune: [-12, -4, 4, 12], lp: tt => 2500 + 2000 * Math.exp(-tt / 0.2), gain: g, send: 0.45, vib: 0.006,
  });
}
function riser(t0, t1, g = 0.12) {
  const D = t1 - t0;
  noise({ t: t0, dur: D, env: tt => Math.pow(tt / D, 2), bp: tt => 400 + 7000 * Math.pow(tt / D, 2), q: 2, gain: g * 1.6, send: 0.3 });
  tone({ t: t0, dur: D, a: D * 0.8, d: 0.01, s: 1, r: 0.05, f: tt => 110 * Math.pow(2, 3 * tt / D), type: 'saw', lp: 2000, gain: g * 0.5 });
}
function impact(t, g = 0.7) {
  kick(t, g * 1.2);
  tone({ t, dur: 0.01, r: 1.5, f: tt => 38 + 30 * Math.exp(-tt / 0.1), gain: g * 0.8, decay: 0.6 });
  noise({ t, dur: 1.2, decay: 0.3, gain: g * 0.3, lp: 900, send: 0.5 });
  crash(t, 0.2);
}
function thud(t, g = 0.6) {
  tone({ t, dur: 0.01, r: 0.5, f: tt => 70 + 80 * Math.exp(-tt / 0.02), gain: g, decay: 0.12 });
  noise({ t, dur: 0.25, decay: 0.04, gain: g * 0.6, lp: 1200, send: 0.2 });
}
function whoosh(t, dur = 0.6, g = 0.12, up = true) {
  noise({ t, dur, env: tt => Math.sin(Math.PI * tt / dur), bp: tt => up ? 300 + 5000 * (tt / dur) : 5300 - 5000 * (tt / dur), q: 1.5, gain: g * 1.5, send: 0.2 });
}
function glitch(t, dur, g = 0.12) {
  for (let x = t; x < t + dur; x += 0.03 + rnd() * 0.05) {
    const f = 100 + rnd() * 2000;
    tone({ t: x, dur: 0.03, a: 0.001, d: 0.01, s: 1, r: 0.005, f, type: 'square', gain: g * (0.5 + rnd()), pan: rnd() * 1.6 - 0.8 });
    if (rnd() < 0.4) noise({ t: x, dur: 0.04, decay: 0.03, gain: g, hp: 3000 });
  }
}
function boing(t, g = 0.18) {
  tone({ t, dur: 0.7, a: 0.002, d: 0.1, s: 0.9, r: 0.1, f: tt => 180 + 120 * Math.sin(tt * 40) * Math.exp(-tt * 5) + 150 * tt, type: 'triangle', gain: g, decay: 0.5, send: 0.2 });
}
function clank(t, g = 0.2) {
  for (const f of [523, 1380, 2210, 3170]) tone({ t, dur: 0.01, r: 0.9, f, gain: g / 3, decay: 0.25 + 200 / f, send: 0.3, pan: 0.3 });
}
function ping(t, f = 1760, g = 0.12) { tone({ t, dur: 0.01, r: 1.4, f, gain: g, decay: 0.4, send: 0.6 }); tone({ t, dur: 0.01, r: 1, f: f * 2.01, gain: g * 0.3, decay: 0.2, send: 0.6 }); }
function pop(t, g = 0.08) { tone({ t, dur: 0.05, a: 0.001, d: 0.04, s: 0.2, r: 0.02, f: tt => 600 + 1400 * Math.exp(-tt / 0.01), gain: g, pan: rnd() - 0.5 }); }
function scratch(t) {
  // record scratch: fast noise bp sweep back and forth
  noise({ t, dur: 0.35, env: tt => Math.sin(Math.PI * tt / 0.35), bp: tt => 600 + 2500 * Math.abs(Math.sin(tt * 30)), q: 3, gain: 0.5 });
  tone({ t, dur: 0.3, a: 0.001, d: 0.1, s: 0.8, r: 0.03, f: tt => 200 + 600 * Math.abs(Math.sin(tt * 28)), type: 'saw', lp: 1500, gain: 0.08 });
}
function cricket(t) {
  for (let k = 0; k < 3; k++) tone({ t: t + k * 0.055, dur: 0.035, a: 0.005, d: 0.01, s: 1, r: 0.01, f: 4300, gain: 0.025, pan: 0.6, send: 0.4 });
}
function gong(t, g = 0.25) {
  for (const [f, d] of [[98, 3], [197, 2.2], [262, 1.8], [331, 1.2], [523, 0.8]]) tone({ t, dur: 0.01, a: 0.01, r: d, f, gain: g / 3, decay: d / 2, send: 0.6, vib: 0.003 });
}
function slideWhistle(t0, t1, f0, f1, g = 0.09) {
  const D = t1 - t0;
  tone({ t: t0, dur: D, a: 0.05, d: 0.1, s: 0.9, r: 0.1, f: tt => f0 * Math.pow(f1 / f0, tt / D), vib: 0.01, gain: g, send: 0.3 });
}
function sadTrombone(t0) {
  const seq = [[0, 58, 0.45], [0.5, 57, 0.45], [1.0, 56, 0.45], [1.5, 55, 1.6]];
  for (const [o, m, d] of seq) tone({ t: t0 + o, dur: d, a: 0.04, d: 0.1, s: 0.8, r: 0.15, f: mtof(m), type: 'saw', lp: tt => 900 + 500 * Math.sin(tt * 5), q: 2, gain: 0.12, vib: o === 1.5 ? 0.025 : 0.006, vibF: 6, send: 0.25 });
}
function errorDing(t) {
  tone({ t, dur: 0.01, r: 1.2, f: mtof(76), type: 'piano', gain: 0.18, decay: 0.5, send: 0.3 });
  tone({ t: t + 0.12, dur: 0.01, r: 1.4, f: mtof(71), type: 'piano', gain: 0.18, decay: 0.6, send: 0.3 });
}

// ---- typewriter blips ----
function blips() {
  for (const c of TL.CAPS) {
    if (c.mute) continue;
    const v = TL.VOICES[c.who];
    const chars = [...c.text.replace(/\|/g, '')];
    chars.forEach((ch, i) => {
      if (/[\s，。、：；？！…—「」“”,.:;?!()（）>]/.test(ch)) return;
      const t = c.t + i / c.cps;
      const jitter = 1 + ((ch.charCodeAt(0) * 7919) % 7 - 3) * 0.03;
      const f = v.f * jitter;
      if (v.wave === 'pluck') ks(t, f, 0.25, 0.12, 0.2, 0.6, 0.3);
      else if (v.wave === 'click') noise({ t, dur: 0.02, decay: 0.004, gain: 0.25, hp: 2500 });
      else if (v.wave === 'scratch') noise({ t, dur: 0.07, env: tt => Math.sin(Math.PI * tt / 0.07), bp: 3000, q: 2, gain: 0.12 });
      else if (v.wave === 'mute') return;
      else tone({ t, dur: 0.045, a: 0.002, d: 0.03, s: 0.5, r: 0.02, f, type: v.wave, gain: v.g, lp: 4000 });
    });
  }
}

// =========== ARRANGEMENT ===========
const K = TL.K;
// A. Terminal intro 0-12
tone({ t: 0, dur: 11.5, a: 4, d: 1, s: 1, r: 0.4, f: mtof(33), type: 'saw', detune: [-6, 6], lp: tt => 200 + 600 * tt / 11, gain: 0.08, send: 0.3 });
tone({ t: 0, dur: 11.5, a: 5, d: 1, s: 1, r: 0.4, f: mtof(52), type: 'saw', detune: [-8, 8], lp: tt => 300 + 900 * tt / 11, gain: 0.03, send: 0.5 });
for (let t = 0.5; t < 11.4; t += 0.5) hat(t, 0.03, false, -0.3);
for (let t = 6; t < 11.4; t += 1) kick(t, 0.35);
riser(8.5, 12, 0.1);
glitch(11.3, 0.7, 0.1);
// B. Title + table 12-26
impact(K.titleSlam, 0.9);
pad(12, 26, { gain: 0.03 });
bass(12, 26, 'eighth', 0.12);
groove(12, 26, { kg: 0.75 });
hook(12, 0.045);
arp(20, 26, { gain: 0.025, type: 'triangle' });
for (let i = 0; i < 8; i++) pop(20.2 + i * 0.5, 0.1);
crash(20, 0.12);
// C. Babylon 26-38: frame drums + phrygian pluck
const PHRY = [57, 58, 60, 62, 64, 65, 67];
for (let t = 26; t < 38 - 1e-6; t += BEAT) {
  const b = Math.round(t / BEAT) % 4;
  if (b === 0 || b === 2) tom(t, 70, 0.5); else tom(t, 140, 0.25);
  hat(t + 0.25, 0.03, false, -0.4);
}
{ const motif = [0, 0, 1, 0, 2, 1, 0, 6 - 7, 0, 0, 1, 0, 4, 3, 2, 1]; let k = 0;
  for (let t = 26; t < 38 - 1e-6; t += 0.25, k++) { const d = motif[k % 16]; const m = d < 0 ? PHRY[d + 7] - 12 : PHRY[d]; if (k % 16 !== 7 || true) ks(t, mtof(m), 0.5, 0.14, (k % 2 ? 0.3 : -0.3), 0.7); } }
tone({ t: 26, dur: 12, a: 1, d: 1, s: 1, r: 0.5, f: mtof(33), type: 'saw', detune: [-5, 5], lp: 500, gain: 0.07, send: 0.2 });
tone({ t: 26, dur: 12, a: 1, d: 1, s: 1, r: 0.5, f: mtof(40), type: 'saw', detune: [-5, 5], lp: 600, gain: 0.04, send: 0.3 });
thud(K.babStamp, 0.8);
// D. Pei Xiu 38-52: guzheng pentatonic
const PENTA = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79];
{ const mel = [5, 7, 8, 7, 6, 5, 4, 5, 3, 4, 5, 6, 7, 6, 5, 4, 5, 7, 9, 8, 7, 6, 5, 6, 4, 3, 2, 3, 4, 5, 4, 3];
  for (let k = 0; k < mel.length && 38 + k * 0.375 < 49.6; k++) ks(38 + k * 0.375, mtof(PENTA[mel[k]]), 0.9, 0.17, 0.2, 0.6, 0.45); }
for (let t = 38; t < 49.6; t += 2) { ks(t, mtof(45), 1.8, 0.16, -0.2, 0.4, 0.3); ks(t + 1, mtof(52), 1.4, 0.1, -0.2, 0.4, 0.3); }
for (let t = 38; t < 49.6; t += BEAT) { if (Math.round(t / BEAT) % 4 === 0) kick(t, 0.4); if (Math.round(t / BEAT) % 4 === 3) wood(t + 0.25); wood(t + 0.25, 0.05); }
// glissando into the big line
for (let k = 0; k < 10; k++) ks(49.2 + k * 0.05, mtof(PENTA[k]), 0.6, 0.1, 0, 0.7, 0.4);
K.seals.forEach(t => thud(t, 0.45));
gong(K.peiBig, 0.35); impact(K.peiBig, 0.5);
pad(50, 52, { gain: 0.02 });
// E. Mercator 52-72
groove(52, 55.5, { kg: 0.7, hats: true });
bass(52, 55.5, 'pump', 0.12);
pad(52, 58, { gain: 0.025, lp: 1000 });
for (let t = 55.5; t < 58; t += 0.125 * (t > 57 ? 0.5 : 1)) snare(t, 0.08 + 0.2 * (t - 55.5) / 2.5);
whoosh(K.pinStart, 1.0, 0.12, false);
for (let k = 0; k < 6; k++) noise({ t: 56.3 + k * 0.28, dur: 0.25, decay: 0.08, gain: 0.08, lp: 600 }); // rolling rumble
boing(K.flatten, 0.25); impact(K.flatten, 0.6);
groove(58, 72, { kg: 0.75 }); bass(58, 72, 'eighth', 0.12); pad(58, 72, { gain: 0.028 });
arp(58, 66, { gain: 0.03 });
arp(66, 72, { gain: 0.02, type: 'triangle' });
slideWhistle(K.shrinkStart, K.shrinkEnd, 1400, 320, 0.08);
hook(62, 0.03, 'square');
// F. Snow 72-86 (dark)
{ const DARK = [{ root: 45, chord: [57, 60, 64] }, { root: 38, chord: [57, 62, 65] }, { root: 40, chord: [56, 59, 64] }, { root: 45, chord: [57, 60, 64] }];
  for (let b = 72; b < 86; b += 2) { const c = DARK[((b - 72) / 2) % 4];
    for (const m of c.chord) tone({ t: b, dur: 2, a: 0.6, d: 0.5, s: 0.8, r: 0.8, f: mtof(m - 12), type: 'saw', detune: [-7, 7], lp: 700, gain: 0.03, send: 0.5 });
    tone({ t: b, dur: 1.9, a: 0.05, d: 0.5, s: 0.7, r: 0.2, f: mtof(c.root - 12), type: 'saw', lp: 260, gain: 0.12 });
    kick(b, 0.55); kick(b + 0.28, 0.35); kick(b + 1, 0.5); kick(b + 1.28, 0.3);
  }
  for (let t = 72; t < 86; t += 0.25) hat(t, 0.02, false, 0.4);
  for (let i = 0; i < 220; i++) { const t = K.snowDeathsA + (K.snowDeathsB - K.snowDeathsA) * Math.pow(rnd(), 0.8); noise({ t, dur: 0.015, decay: 0.003, gain: 0.05 + 0.04 * rnd(), hp: 3000, pan: rnd() - 0.5 }); }
}
impact(K.pumpReveal, 0.45); clank(K.handleOff, 0.3); whoosh(K.handleOff, 0.4, 0.06); thud(K.snowStamp, 0.7);
// G. Tobler 86-98
pad(86, 98, { gain: 0.028, lp: 1800 });
for (let t = 86; t < 92.6; t += BEAT) { if (Math.round(t / BEAT) % 2 === 0) kick(t, 0.5); hat(t + 0.25, 0.04, false); }
arp(86, 92.6, { type: 'sine', gain: 0.06, step: 0.25, oct: 12 });
groove(92.6, 98, { kg: 0.6, clap: true, sg: 0.22 });
bass(92.5, 98, 'pump', 0.1);
TL.officeTasks().forEach(x => pop(x.arrive, 0.07));
whoosh(K.officeStart - 0.3, 0.5, 0.08);
// H. GPS 98-108
tone({ t: 98, dur: 10, a: 1, d: 1, s: 1, r: 0.5, f: mtof(45), type: 'saw', detune: [-10, 0, 10], lp: 900, gain: 0.05, send: 0.6 });
tone({ t: 98, dur: 10, a: 1, d: 1, s: 1, r: 0.5, f: mtof(64), type: 'saw', detune: [-10, 10], lp: 1200, gain: 0.025, send: 0.6 });
arp(98, 102, { type: 'sine', gain: 0.05, step: 0.125, oct: 12 });
for (let t = 98; t < 102; t += BEAT) { kick(t, 0.4); hat(t + 0.25, 0.04, true); }
K.pings.forEach((t, i) => ping(t, 1568 + i * 200, 0.1));
tone({ t: K.lock, dur: 0.08, r: 0.02, f: 2093, type: 'square', gain: 0.05 }); tone({ t: K.lock + 0.12, dur: 0.15, r: 0.02, f: 2637, type: 'square', gain: 0.05 });
groove(102, 108, { kg: 0.6 }); bass(102, 108, 'eighth', 0.1);
tone({ t: K.drift, dur: 1.4, a: 0.01, d: 0.1, s: 0.9, r: 0.1, f: tt => 600 - 300 * tt + 60 * Math.sin(tt * 30), type: 'triangle', gain: 0.1, send: 0.2 });
tone({ t: K.drift2, dur: 0.6, a: 0.01, d: 0.1, s: 0.9, r: 0.1, f: tt => 400 - 200 * tt + 60 * Math.sin(tt * 30), type: 'triangle', gain: 0.08, send: 0.2 });
for (let k = 0; k < 3; k++) boing(105.0 + k * 0.33, 0.1);
// I. Montage + AGI 108-122
glitch(108, 2, 0.1);
for (let t = 108; t < 110; t += 0.125) kick(t, 0.25 + 0.3 * (t - 108) / 2);
riser(108, 110, 0.08);
impact(K.agiHit, 1.0);
pad(110, 122, { gain: 0.04, lp: tt => 1200 + 800 * Math.sin(tt), oct: 0 });
pad(110, 122, { gain: 0.02, oct: 12, lp: 3000 });
groove(110, 122, { kg: 0.85 }); bass(110, 122, 'eighth', 0.14);
arp(110, 122, { gain: 0.025 });
hook(114, 0.05);
impact(K.paper, 0.8);
// J. Build 122-132
groove(122, 124, { kg: 0.8 }); bass(122, 130.2, 'eighth', 0.12); pad(122, 130.2, { gain: 0.035 });
for (let t = 124; t < 130.2; t += 0.5) kick(t, 0.75);
{ let t = 124; while (t < 130.1) { const p = (t - 124) / 6; snare(t, 0.08 + 0.25 * p); t += p < 0.33 ? 0.25 : p < 0.66 ? 0.125 : 0.0625; } }
riser(124, 130.2, 0.14);
K.scaleSteps.forEach((t, i) => { ping(t, mtof(81 + [0, 2, 4, 5, 7, 12][i]), 0.08); });
impact(K.done, 1.0);
for (const m of [57, 60, 64, 69, 72, 76]) tone({ t: K.done, dur: 1.6, a: 0.01, d: 0.3, s: 0.8, r: 0.05, f: mtof(m), type: 'saw', detune: [-10, 0, 10], lp: 3000, gain: 0.04, send: 0.5 });
scratch(K.scratch);
// silence + crickets 132-142
for (let t = 133.2; t < 141.8; t += 0.9 + rnd() * 0.5) cricket(t);
noise({ t: 132.3, dur: 9.5, env: tt => 0.4 + 0.3 * Math.sin(tt * 0.7), lp: 400, gain: 0.025 });
// K. Doc 142-154
{ const MEL = [72, 76, 79, 76, 74, 77, 81, 77, 76, 79, 84, 79, 74, 77, 79, 83];
  const CHR = [[48, 52, 55], [53, 57, 60], [55, 59, 62], [48, 52, 55]];
  for (let k = 0; k < 28 && 142 + k * 0.25 < K.docStamp; k++) {
    const t = 142 + k * 0.25; const bar = Math.floor(k / 8) % 4;
    tone({ t, dur: 0.05, r: 0.3, f: mtof(MEL[k % 16]), type: 'marimba', gain: 0.07, decay: 0.25, send: 0.25, pan: 0.2 });
    if (k % 2 === 0) tone({ t, dur: 0.08, r: 0.2, f: mtof(CHR[bar][0] - 12 + (k % 4 === 2 ? 7 : 0)), type: 'triangle', gain: 0.14, decay: 0.2 });
    if (k % 2 === 1) noise({ t, dur: 0.05, decay: 0.015, gain: 0.05, hp: 6000 });
  }
  for (let t = 142; t < K.docStamp; t += 0.5) kick(t, 0.35);
}
impact(K.docStamp, 0.9); thud(K.docStamp, 0.8);
sadTrombone(151.0);
// L. Ending 154-166
{ const EP = [[41, [57, 60, 65, 72]], [43, [55, 59, 62, 71]], [45, [57, 60, 64, 72]], [48, [55, 60, 64, 67]], [41, [57, 60, 65, 69]], [43, [55, 59, 62, 67]]];
  EP.forEach(([r, ch], i) => {
    const t = 154 + i * 2;
    const last = i === EP.length - 1;
    tone({ t, dur: last ? 4.5 : 2, a: 0.3, d: 0.5, s: 0.8, r: last ? 2 : 0.8, f: mtof(r - 12), type: 'saw', lp: 400, gain: 0.12, send: 0.4 });
    for (const m of ch) tone({ t, dur: last ? 4.5 : 2, a: 0.6, d: 0.5, s: 0.8, r: last ? 2.5 : 1, f: mtof(m), type: 'saw', detune: [-8, 0, 8], lp: 1600, gain: 0.04, send: 0.6 });
    [0, 0.5, 1, 1.5].forEach((o, j) => tone({ t: t + o, dur: 0.01, r: 1.5, f: mtof(ch[(j + i) % 4] + 12), type: 'piano', gain: 0.11, decay: 0.8, send: 0.6, pan: j % 2 ? 0.3 : -0.3 }));
  });
  for (let k = 0; k < 24; k++) ping(154.5 + rnd() * 10, mtof(88 + Math.floor(rnd() * 3) * 5), 0.02);
}
whoosh(154, 1.2, 0.08, false);
// M. Post credits
errorDing(K.errorDing);
blips();

// ---- reverb (freeverb-ish) ----
function comb(inp, out, d, fb, damp) { const buf = new Float32Array(d); let idx = 0, f = 0; for (let i = 0; i < N; i++) { const y = buf[idx]; f = y * (1 - damp) + f * damp; buf[idx] = inp[i] + f * fb; idx = (idx + 1) % d; out[i] += y; } }
function allpass(x, d) { const buf = new Float32Array(d); let idx = 0; for (let i = 0; i < N; i++) { const b = buf[idx]; const y = -x[i] + b; buf[idx] = x[i] + b * 0.5; idx = (idx + 1) % d; x[i] = y; } }
for (const [inp, dst, spread] of [[SL, L, 0], [SRb, R, 23]]) {
  const out = new Float32Array(N);
  for (const d of [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]) comb(inp, out, d + spread, 0.86, 0.25);
  for (const d of [556, 441, 341, 225]) allpass(out, d + spread);
  for (let i = 0; i < N; i++) dst[i] += out[i] * 0.045;
}
// ---- master ----
let peak = 0;
for (let i = 0; i < N; i++) { L[i] = Math.tanh(L[i] * 1.1); R[i] = Math.tanh(R[i] * 1.1); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
const norm = 0.89 / peak;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norm)) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norm)) * 32767), 46 + i * 4); }
fs.writeFileSync('soundtrack.wav', buf);
console.log('peak', peak.toFixed(3), 'written', N / SR, 's');
