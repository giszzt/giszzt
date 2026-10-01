// 《你在这里》 — window.draw(t) is a pure function of t.
const W = 1920, H = 1080;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const { CAPS, SCENES, K, RAIN, rng, TILE, GRID, DURATION, FRAMES } = TL;
const AMBER = '#ffb84d', INK = '#f3ede2';
const FONT = '"LXGW WenKai", Serif6';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, x) => a + (b - a) * x;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const oc = x => 1 - Math.pow(1 - x, 3);
const ioc = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const ob = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const smooth = x => x * x * (3 - 2 * x);
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const chars = s => [...s];
const tileOf = T => clamp(Math.floor(T / TILE), 0, GRID * GRID - 1);
const fmt = (x, d = 2) => x.toFixed(d);

let SEEN = [];            // t values of every still I looked at while making this
let WAVE = null;          // [{min,max}] per column of the real soundtrack
let RAWL = null;          // mono samples for the zoomed scope
let THUMBS = [];          // 144 thumbnails of the film itself
let LIVE, PEEK, GRAIN, VIG;
let THUMB_MODE = false;

// ---------- captions ----------
function charAlpha(cap, t, k, fade = 0.35) { return clamp((t - cap.t - k / cap.cps) / fade); }
function capOut(cap, t) { return 1 - prog(t, cap.end - 0.4, cap.end); }
function drawFadeText(cap, t, x, y, font, color, opts = {}) {
  ctx.save(); ctx.font = font; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  if (opts.ls) ctx.letterSpacing = opts.ls;
  const lines = cap.text.split('|');
  let k = 0;
  lines.forEach((ln, li) => {
    const w = ctx.measureText(ln).width; let cx = x - w / 2;
    const ly = y + li * (opts.lh || 0);
    for (const ch of chars(ln)) {
      const a = charAlpha(cap, t, k, opts.fade) * capOut(cap, t) * (opts.alpha ?? 1);
      if (a > 0) {
        ctx.globalAlpha = a; ctx.fillStyle = color;
        if (opts.glow) { ctx.shadowColor = opts.glow; ctx.shadowBlur = opts.blur || 30; }
        ctx.fillText(ch, cx, ly + (1 - oc(a)) * 10);
      }
      cx += ctx.measureText(ch).width; k++;
    }
  });
  ctx.restore();
}
function drawCaps(t) {
  const opens = CAPS.filter(c => c.style === 'open');
  for (const cap of CAPS) {
    if (t < cap.t || t > cap.end) continue;
    if (cap.style === 'open') {
      const i = opens.indexOf(cap);
      const dim = i < 2 && t > 12.6 ? 1 - prog(t, 12.6, 13.4) : 1;
      drawFadeText(cap, t, W / 2, 420 + i * 110, `58px ${FONT}`, i === 2 ? '#ffffff' : 'rgba(243,237,226,0.75)', { alpha: dim });
    } else if (cap.style === 'sub') {
      const g = ctx.createLinearGradient(0, H - 260, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.55 * capOut(cap, t) * clamp((t - cap.t) / 0.3)})`);
      ctx.fillStyle = g; ctx.fillRect(0, H - 260, W, 260);
      drawFadeText(cap, t, W / 2, H - 120, `50px ${FONT}`, INK, { glow: 'rgba(0,0,0,0.9)', blur: 16 });
    } else if (cap.style === 'quote') {
      ctx.save(); ctx.fillStyle = `rgba(0,0,0,${0.72 * clamp((t - cap.t) / 0.6) * capOut(cap, t)})`; ctx.fillRect(0, 0, W, H); ctx.restore();
      drawFadeText(cap, t, W / 2, H / 2 - 70, '64px Serif6', '#fff', { lh: 110, fade: 0.6 });
      const a = prog(t, 104.4, 105.4) * capOut(cap, t);
      ctx.save(); ctx.globalAlpha = a; ctx.font = `30px ${FONT}`; ctx.fillStyle = 'rgba(243,237,226,0.7)'; ctx.textAlign = 'center';
      ctx.fillText('—— 爱因斯坦，致贝索家人的信，1955 年 3 月 21 日', W / 2, H / 2 + 150); ctx.restore();
    } else if (cap.style === 'big') {
      const p = prog(t, cap.t, cap.t + 0.5);
      { const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 620); g.addColorStop(0, `rgba(0,0,0,${0.75 * oc(p) * capOut(cap, t)})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
      ctx.save(); ctx.globalAlpha = oc(p) * capOut(cap, t); ctx.translate(W / 2, H / 2); const s = lerp(1.25, 1, oc(p)); ctx.scale(s, s);
      ctx.font = '230px Serif9'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.letterSpacing = '20px';
      ctx.shadowColor = AMBER; ctx.shadowBlur = 80; ctx.fillStyle = '#fff7e8'; ctx.fillText(cap.text, 0, 0); ctx.restore();
    } else if (cap.style === 'end') {
      drawFadeText(cap, t, W / 2, H / 2 + 150, `54px ${FONT}`, INK, { fade: 0.6, ls: '4px' });
    } else if (cap.style === 'last') {
      drawFadeText(cap, t, W / 2, 600, `44px ${FONT}`, 'rgba(243,237,226,0.85)', { fade: 0.5 });
    }
  }
}

// ---------- shared drawing ----------
function pin(x, y, s = 1, glow = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.shadowColor = AMBER; ctx.shadowBlur = 30 * glow;
  ctx.fillStyle = AMBER; ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-26, -34, -30, -52, -30, -64); ctx.arc(0, -64, 30, Math.PI, 0); ctx.bezierCurveTo(30, -52, 26, -34, 0, 0); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = '#1a1206'; ctx.beginPath(); ctx.arc(0, -64, 11, 0, 7); ctx.fill();
  ctx.restore();
}
function dust(t, n, seed, color, speed = 8) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = (r() * W + t * speed * (r() - 0.3) + W * 10) % W, y = (r() * H - t * speed * 0.6 * r() + H * 10) % H, s = r() * 2.2 + 0.4;
    ctx.fillStyle = color.replace('A', (0.15 + 0.35 * r() * (0.6 + 0.4 * Math.sin(t * 1.3 + i))).toFixed(3));
    ctx.beginPath(); ctx.arc(x, y, s, 0, 7); ctx.fill();
  }
}
function hud(text, x = 70, y = 80, col = AMBER) { ctx.save(); ctx.font = '34px Mono, "LXGW WenKai"'; ctx.fillStyle = col; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y); ctx.restore(); }

// ---------- scenes ----------
const S = {};
S.open = t => {
  ctx.fillStyle = '#050506'; ctx.fillRect(0, 0, W, H);
  if (t < 1.2 && Math.floor(t * 2.5) % 2 === 0) { ctx.fillStyle = INK; ctx.fillRect(W / 2 - 3, 395, 6, 50); }
};
S.title = t => {
  ctx.fillStyle = '#060507'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H / 2 - 40, 10, W / 2, H / 2, 900); g.addColorStop(0, 'rgba(255,184,77,0.16)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  dust(t, 90, 3, 'rgba(255,214,160,A)', 10);
  const out = 1 - prog(t, 18.7, 19.2);
  const d = oc(prog(t, 14.4, 14.9)), bounce = t > 14.9 ? Math.exp(-(t - 14.9) * 6) * Math.sin((t - 14.9) * 22) * 14 : 0;
  ctx.save(); ctx.globalAlpha = out;
  pin(W / 2, lerp(-100, 330, d) - bounce, 1, 1 + Math.sin(t * 3) * 0.2);
  ctx.globalAlpha = out * oc(prog(t, 14.5, 15.3));
  ctx.font = '170px Serif9'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.letterSpacing = '36px'; ctx.fillStyle = '#fff';
  ctx.fillText('你在这里', W / 2 + 18, H / 2 + 50);
  ctx.globalAlpha = out * oc(prog(t, 15.6, 16.6)); ctx.font = `40px ${FONT}`; ctx.letterSpacing = '10px'; ctx.fillStyle = 'rgba(243,237,226,0.7)';
  ctx.fillText('一部作者从没看过的短片', W / 2 + 5, H / 2 + 200);
  ctx.restore();
};

S.code = t => {
  ctx.fillStyle = '#0a0b0f'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 1; ctx.beginPath(); for (let x = 0; x < W; x += 48) { ctx.moveTo(x, 0); ctx.lineTo(x, H); } for (let y = 0; y < H; y += 48) { ctx.moveTo(0, y); ctx.lineTo(W, y); } ctx.stroke();
  // the function
  const a = prog(t, K.codeIn, K.codeIn + 0.6), up = oc(prog(t, K.stats - 0.4, K.stats + 0.4));
  if (a > 0) {
    ctx.save(); ctx.globalAlpha = a; ctx.textBaseline = 'middle'; ctx.font = '104px MonoB, "LXGW WenKai"';
    const tStr = fmt(t, 2);
    const parts = [['画面', '#e6e6e6'], [' = ', '#6b7280'], ['draw', '#7fb7ff'], ['(', '#9ca3af'], [tStr, AMBER], [')', '#9ca3af']];
    const total = parts.reduce((s, [p]) => s + ctx.measureText(p).width, 0);
    let x = W / 2 - total / 2; const y = lerp(380, 250, up);
    for (const [p, c] of parts) { ctx.fillStyle = c; if (c === AMBER) { ctx.shadowColor = AMBER; ctx.shadowBlur = 24; } ctx.fillText(p, x, y); ctx.shadowBlur = 0; x += ctx.measureText(p).width; }
    ctx.font = '28px Mono'; ctx.fillStyle = '#4b5563'; ctx.textAlign = 'center'; ctx.fillText('// t 是秒。给一个 t，返回一张画。', W / 2, y + 90);
    ctx.restore();
  }
  // filmstrip: draw(any t) -> a picture
  const fa = prog(t, 27.0, 27.6) * (1 - prog(t, K.stats - 0.4, K.stats));
  if (fa > 0) {
    ctx.save(); ctx.globalAlpha = fa;
    for (let k = 0; k < 5; k++) {
      const slot = Math.floor(t / 0.45) + k * 7, idx = Math.floor(rng(slot * 31 + k)() * 144);
      const x = 230 + k * 300, y = 560, w = 260, h = 146;
      ctx.fillStyle = '#111'; ctx.fillRect(x, y, w, h);
      if (THUMBS[idx]) ctx.drawImage(THUMBS[idx], x, y, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.strokeRect(x, y, w, h);
      ctx.font = '24px Mono'; ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'center'; ctx.fillText(`draw(${fmt(idx * TILE + 0.6, 1)})`, x + w / 2, y + h + 34);
    }
    ctx.restore();
  }
  // stats: every frame I actually looked at
  const sa = prog(t, K.stats, K.stats + 0.6);
  if (sa > 0) {
    ctx.save(); ctx.globalAlpha = sa;
    const cnt = Math.round(SEEN.length * oc(prog(t, K.stats + 0.2, K.stats + 1.8)));
    const rows = [['全片', `${FRAMES.toLocaleString('en-US')} 帧`, '#e6e6e6'], ['我看过的', `${cnt} 帧`, AMBER], ['占比', `${(cnt / FRAMES * 100).toFixed(2)} %`, '#e6e6e6']];
    rows.forEach(([k, v, c], i) => { const y = 420 + i * 70; ctx.font = `40px ${FONT}`; ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'right'; ctx.fillText(k, 900, y); ctx.font = '44px MonoB, "LXGW WenKai"'; ctx.fillStyle = c; ctx.textAlign = 'left'; ctx.fillText(v, 960, y); });
    // the whole film as a bar; amber ticks are the frames I saw
    const bx = 260, bw = 1400, by = 680;
    ctx.fillStyle = '#1f2430'; ctx.fillRect(bx, by, bw, 60);
    ctx.fillStyle = AMBER; ctx.shadowColor = AMBER; ctx.shadowBlur = 10;
    SEEN.slice(0, cnt).forEach(s => ctx.fillRect(bx + s / DURATION * bw - 1, by - 6, 2.5, 72));
    ctx.shadowBlur = 0; ctx.font = '24px Mono'; ctx.fillStyle = '#6b7280'; ctx.textAlign = 'left'; ctx.fillText('0:00', bx, by + 100); ctx.textAlign = 'right'; ctx.fillText('2:52', bx + bw, by + 100);
    ctx.textAlign = 'center'; ctx.fillStyle = '#9ca3af'; ctx.font = `26px ${FONT}`; ctx.fillText('每一道橙线，是我真正看过的一帧', W / 2, by + 100);
    ctx.restore();
  }
};

S.wave = t => {
  ctx.fillStyle = '#08080b'; ctx.fillRect(0, 0, W, H);
  const x0 = 160, x1 = 1760, cy = 470, amp = 190, n = WAVE ? WAVE.length : 0;
  const a = prog(t, 38.4, 39.2);
  ctx.save(); ctx.globalAlpha = a;
  hud('soundtrack.wav  ·  172.8 秒  ·  我听过的时长：0 秒', 160, 90, '#9ca3af');
  const px = x0 + (t / DURATION) * (x1 - x0);
  for (let i = 0; i < n; i++) {
    const x = x0 + i, { min, max } = WAVE[i], past = x < px;
    ctx.fillStyle = past ? AMBER : 'rgba(200,205,220,0.35)';
    ctx.fillRect(x, cy - max * amp, 1, Math.max(1, (max - min) * amp));
  }
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, cy - amp - 30); ctx.lineTo(px, cy + amp + 10); ctx.stroke();
  pin(px, cy - amp - 40, 0.55, 1.2);
  ctx.font = `30px ${FONT}`; ctx.fillStyle = AMBER; ctx.textAlign = 'left'; ctx.fillText('你在这里', px + 30, cy - amp - 95);
  ctx.font = '24px Mono'; ctx.fillStyle = '#6b7280'; ctx.textAlign = 'left'; ctx.fillText('0:00', x0, cy + amp + 50); ctx.textAlign = 'right'; ctx.fillText('2:52', x1, cy + amp + 50);
  // zoomed scope: the ±1.5 s around now
  if (RAWL) {
    const sy = 790, sh = 90, span = 3.0, cols = 1600; ctx.strokeStyle = 'rgba(255,184,77,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let c = 0; c < cols; c += 2) {
      const ts = t - span / 2 + (c / cols) * span, i0 = Math.floor(ts * 4410);
      let m = 0; for (let k = 0; k < 4; k++) { const v = RAWL[i0 + k] || 0; if (Math.abs(v) > Math.abs(m)) m = v; }
      const y = sy - m * sh * 2.5; c ? ctx.lineTo(x0 + c, y) : ctx.moveTo(x0 + c, y);
    }
    ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.moveTo(x0 + 800, sy - sh - 20); ctx.lineTo(x0 + 800, sy + sh + 20); ctx.stroke();
    ctx.font = '22px Mono'; ctx.fillStyle = '#6b7280'; ctx.textAlign = 'right'; ctx.fillText('此刻前后 ± 1.5 s', x1, sy - sh - 30);
  }
  ctx.restore();
};

// sea at story time tau
function seaScene(tau, T) {
  const s = prog(tau, 44, 64);
  const sunY = lerp(330, 640, s), hor = 610;
  const sky = ctx.createLinearGradient(0, 0, 0, hor);
  sky.addColorStop(0, `hsl(${lerp(215, 255, s)},${lerp(45, 35, s)}%,${lerp(28, 10, s)}%)`);
  sky.addColorStop(0.6, `hsl(${(lerp(28, -15, s) + 360) % 360},${lerp(70, 45, s)}%,${lerp(55, 28, s)}%)`);
  sky.addColorStop(1, `hsl(${lerp(36, 12, s)},90%,${lerp(66, 45, s)}%)`);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hor);
  const sg = ctx.createRadialGradient(960, sunY, 0, 960, sunY, 420); sg.addColorStop(0, 'rgba(255,220,150,0.55)'); sg.addColorStop(1, 'rgba(255,160,80,0)'); ctx.fillStyle = sg; ctx.fillRect(0, 0, W, hor);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, hor); ctx.clip(); ctx.fillStyle = '#ffe2a8'; ctx.beginPath(); ctx.arc(960, sunY, 80, 0, 7); ctx.fill(); ctx.restore();
  const sea = ctx.createLinearGradient(0, hor, 0, H); sea.addColorStop(0, `hsl(${lerp(215, 240, s)},40%,${lerp(30, 14, s)}%)`); sea.addColorStop(1, '#05070d'); ctx.fillStyle = sea; ctx.fillRect(0, hor, W, H - hor);
  // reflection shimmer
  const r = rng(9);
  for (let i = 0; i < 160; i++) {
    const yy = hor + 6 + Math.pow(r(), 1.6) * (H - hor), spread = 30 + (yy - hor) * 0.6, ph = r() * 6.28;
    const xx = 960 + (r() - 0.5) * spread * 1.4 + Math.sin(tau * 1.7 + ph) * 12, len = 20 + r() * 70 * (1 - (yy - hor) / (H - hor) * 0.5);
    ctx.fillStyle = `rgba(255,${200 - s * 60},${130 - s * 50},${(0.25 + 0.5 * r()) * (0.5 + 0.5 * Math.sin(tau * 3 + ph)) * (1 - s * 0.5)})`;
    ctx.fillRect(xx - len / 2, yy, len, 2.5);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 2;
  for (let k = 0; k < 14; k++) { const yy = hor + 20 + k * k * 2.6; ctx.beginPath(); for (let x = 0; x <= W; x += 20) { const y = yy + Math.sin(x * 0.01 + tau * 1.2 + k) * (2 + k * 0.4); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
  // birds
  for (let b = 0; b < 4; b++) {
    const x = ((tau - 44) * (60 + b * 14) + b * 260) % (W + 400) - 200, y = 230 + b * 40 + Math.sin(tau * 0.8 + b) * 20, f = Math.sin(tau * (7 + b) + b * 2) * 10, sz = 16 - b * 2;
    ctx.strokeStyle = 'rgba(20,14,20,0.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - sz, y - f); ctx.quadraticCurveTo(x - sz / 2, y - 4, x, y); ctx.quadraticCurveTo(x + sz / 2, y - 4, x + sz, y - f); ctx.stroke();
  }
}
S.sea = T => {
  const tau = TL.tau(T), w = TL.W;
  if (T >= w.frzB && T < w.peekB) {
    // peek at the real ending, pixelated
    const g = PEEK.getContext('2d'); const save = THUMB_MODE; THUMB_MODE = true; renderScene(tau); THUMB_MODE = save;
    g.imageSmoothingEnabled = true; g.clearRect(0, 0, 64, 36); g.drawImage(cv, 0, 0, 64, 36);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.imageSmoothingEnabled = false; ctx.drawImage(PEEK, 0, 0, 64, 36, 0, 0, W, H); ctx.imageSmoothingEnabled = true;
    ctx.save(); ctx.translate(W / 2, H / 2 - 40); ctx.rotate(-0.12); const sc = ob(prog(T, w.frzB, w.frzB + 0.3)); ctx.scale(sc, sc);
    ctx.fillStyle = '#e11d48'; ctx.fillRect(-300, -95, 600, 190); ctx.strokeStyle = '#fff'; ctx.lineWidth = 8; ctx.strokeRect(-282, -77, 564, 154);
    ctx.fillStyle = '#fff'; ctx.font = '110px Serif9'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('剧透警告', 0, 6); ctx.restore();
    hud(`t = ${fmt(tau)}  ▶▶|`, 70, 80, '#fff');
    return;
  }
  seaScene(tau, T);
  const frozen = T >= w.rewB && T < w.frzB, rew = T >= w.rewA && T < w.rewB;
  if (rew) {
    const r = rng(Math.floor(T * 30)); for (let i = 0; i < 6; i++) { const y = r() * H; ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, y, W, 2 + r() * 6); }
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = 'rgba(80,120,255,0.08)'; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  if (frozen) { ctx.save(); ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = 'rgba(128,128,128,0.75)'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  const icon = rew ? '◀◀' : frozen ? '❚❚' : T >= w.peekB && T < w.peekB + 1 ? '▶' : '';
  hud(`t = ${fmt(tau)}  ${icon}`, 70, 80, frozen ? '#fff' : AMBER);
  if (T < 48.6) { ctx.fillStyle = `rgba(0,0,0,${1 - prog(T, 48, 48.6)})`; ctx.fillRect(0, 0, W, H); }
};

// rain
const DROPS = (() => { const r = rng(17), a = []; for (let i = 0; i < 1600; i++) a.push([(r() - 0.5) * 4.4, r() * 2.4 - 1.2, 0.4 + r() * 8, 1.6 + r() * 1.4, r()]); return a; })();
function rainScene(T) {
  const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#05070e'); bg.addColorStop(1, '#0c1222'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const lamp = ctx.createRadialGradient(1500, 160, 0, 1500, 160, 900); lamp.addColorStop(0, 'rgba(255,184,77,0.35)'); lamp.addColorStop(1, 'rgba(255,184,77,0)'); ctx.fillStyle = lamp; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffd99a'; ctx.beginPath(); ctx.arc(1500, 160, 10, 0, 7); ctx.fill();
  const frozen = T >= RAIN.freeze && T < RAIN.resume;
  const te = T < RAIN.freeze ? T : frozen ? RAIN.freeze : T - (RAIN.resume - RAIN.freeze);
  const cz = 2.6 * ioc(prog(T, RAIN.freeze + 0.4, RAIN.resume - 0.3)), cx = 0.35 * Math.sin(prog(T, RAIN.freeze, RAIN.resume) * Math.PI);
  const list = [];
  for (const [x, y0, z0, v, ph] of DROPS) {
    let z = z0 - cz; if (z < 0.25) z += 8;
    const y = ((y0 + te * v + ph * 10) % 2.4 + 2.4) % 2.4 - 1.2;
    list.push([x - cx, y, z, v]);
  }
  list.sort((a, b) => b[2] - a[2]);
  for (const [x, y, z] of list) {
    const X = W / 2 + x / z * 760, Y = H / 2 + y / z * 760; if (X < -60 || X > W + 60 || Y < -80 || Y > H + 80) continue;
    const near = clamp(1 - z / 8), lit = clamp(1 - Math.hypot(X - 1500, Y - 160) / 1400);
    if (frozen) {
      const r = Math.max(0.8, 5 / z);
      if (z < 1.1) { const g = ctx.createRadialGradient(X, Y, 0, X, Y, r * 2.2); g.addColorStop(0, `rgba(255,214,150,${0.25 * near})`); g.addColorStop(1, 'rgba(255,214,150,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, r * 2.2, 0, 7); ctx.fill(); continue; }
      ctx.fillStyle = `rgba(${lerp(170, 255, lit)},${lerp(200, 215, lit)},${lerp(255, 160, lit)},${0.25 + 0.6 * near})`; ctx.beginPath(); ctx.arc(X, Y, r, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.6 * near})`; ctx.beginPath(); ctx.arc(X - r * 0.3, Y - r * 0.3, r * 0.3, 0, 7); ctx.fill();
    } else {
      ctx.strokeStyle = `rgba(${lerp(160, 255, lit)},${lerp(190, 214, lit)},${lerp(240, 160, lit)},${0.12 + 0.5 * near})`; ctx.lineWidth = Math.max(0.6, 2.4 / z);
      ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X, Y - 70 / z); ctx.stroke();
    }
  }
  hud(`t = ${fmt(frozen ? RAIN.freeze : T)}  ${frozen ? '❚❚' : '▶'}`, 70, 80, frozen ? '#fff' : AMBER);
}
S.rain = T => { rainScene(T); if (T < 63) { ctx.fillStyle = `rgba(0,0,0,${1 - prog(T, 62.4, 63)})`; ctx.fillRect(0, 0, W, H); } };

// ---------- the mosaic: the whole film, laid out at once ----------
function tileRect(i, x, y, w, h) { const c = i % GRID, r = Math.floor(i / GRID), tw = w / GRID, th = h / GRID, g = tw * 0.025; return [x + c * tw + g, y + r * th + g, tw - 2 * g, th - 2 * g]; }
function mosaicState(T) {
  return { dim: lerp(0.78, 0.16, prog(T, 116.6, 118.2)), spot: prog(T, 116.6, 118.2), pinA: T >= K.pin ? 1 : 0, pinP: prog(T, K.pin, K.pin + 0.5) };
}
function drawMosaic(x, y, w, h, cur, depth, T, st, live) {
  if (w < 4) return;
  for (let i = 0; i < GRID * GRID; i++) {
    const [tx, ty, tw, th] = tileRect(i, x, y, w, h);
    if (tx > W || ty > H || tx + tw < 0 || ty + th < 0) continue;
    if (i === cur) continue;
    ctx.globalAlpha = st.dim; if (THUMBS[i]) ctx.drawImage(THUMBS[i], tx, ty, tw, th); else { ctx.fillStyle = '#222'; ctx.fillRect(tx, ty, tw, th); }
  }
  ctx.globalAlpha = 1;
  const [cx, cy, cw, ch] = tileRect(cur, x, y, w, h);
  if (cx < W && cy < H && cx + cw > 0 && cy + ch > 0) {
    ctx.save(); ctx.beginPath(); ctx.rect(cx, cy, cw, ch); ctx.clip(); ctx.fillStyle = '#000'; ctx.fillRect(cx, cy, cw, ch);
    if (live) live(cx, cy, cw, ch); else if (depth < 5) drawMosaic(cx, cy, cw, ch, cur, depth + 1, T, st, null);
    ctx.restore();
    const pulse = 0.75 + 0.25 * Math.sin(T * 4);
    ctx.save(); ctx.strokeStyle = AMBER; ctx.lineWidth = Math.max(1, cw * 0.02); ctx.shadowColor = AMBER; ctx.shadowBlur = cw * 0.25 * pulse; ctx.globalAlpha = pulse; ctx.strokeRect(cx, cy, cw, ch); ctx.restore();
    if (depth === 0 && st.spot > 0) { const R = Math.max(cw, 260) * 1.6, g = ctx.createRadialGradient(cx + cw / 2, cy + ch / 2, 0, cx + cw / 2, cy + ch / 2, R); g.addColorStop(0, `rgba(255,184,77,${0.28 * st.spot})`); g.addColorStop(1, 'rgba(255,184,77,0)'); ctx.fillStyle = g; ctx.fillRect(cx + cw / 2 - R, cy + ch / 2 - R, 2 * R, 2 * R); }
    if (st.pinA && cw > 6) { const s = depth === 0 ? Math.max(cw / 160 * 0.55, 0.95) : cw / 160 * 0.55, drop = (1 - oc(st.pinP)) * 600; pin(cx + cw / 2, cy - ch * 0.02 - drop, s, 1.5); }
  }
}
// Droste camera: zoom by 12^u around the fixed point of the tile map
function mosaicView(T, cur, u, live) {
  const st = mosaicState(T);
  const [c0x, c0y] = [(cur % GRID) * W / GRID, Math.floor(cur / GRID) * H / GRID];
  const Px = c0x * GRID / (GRID - 1), Py = c0y * GRID / (GRID - 1), s = Math.pow(GRID, u);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  drawMosaic(Px - Px * s, Py - Py * s, W * s, H * s, cur, 0, T, st, live);
}
S.mosaic = T => {
  const cur = tileOf(T);
  if (THUMB_MODE) { mosaicView(T, cur, 0, null); return; }
  if (T < K.mosaicDone) {
    // zoom out from the rain frame, which becomes one tile among 144
    const g = LIVE.getContext('2d'); rainScene(T); g.clearRect(0, 0, W, H); g.drawImage(cv, 0, 0);
    const u = 1 - ioc(prog(T, K.mosaicIn, K.mosaicDone));
    mosaicView(T, cur, u, (x, y, w, h) => ctx.drawImage(LIVE, x, y, w, h));
  } else mosaicView(T, cur, 0.02 * Math.sin((T - 84) * 0.3), null);
  if (T > K.mosaicDone && T < 116) {
    const [x, y, w] = tileRect(cur, 0, 0, W, H);
    ctx.save(); ctx.font = '20px Mono'; ctx.fillStyle = AMBER; ctx.textAlign = 'center'; ctx.globalAlpha = 0.9; ctx.fillText(`t = ${fmt(T, 1)}`, x + w / 2, y - 8); ctx.restore();
  }
};
S.droste = T => {
  const k = Math.floor((T - K.you) / 2.4), t0 = K.you + k * 2.4, u = (T - t0) / 2.4;
  mosaicView(T, tileOf(t0), u, null);
  ctx.fillStyle = `rgba(0,0,0,${prog(T, 132.6, 134.4)})`; ctx.fillRect(0, 0, W, H);
};

S.ending = T => {
  ctx.fillStyle = '#040303'; ctx.fillRect(0, 0, W, H);
  dust(T, 60, 21, 'rgba(255,200,140,A)', 6);
  const r = rng(5);
  for (let i = 0; i < 14; i++) { const x = r() * W, y = r() * H, rad = 40 + r() * 120, a = 0.03 + 0.04 * Math.sin(T * 0.5 + i); const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, `rgba(255,184,77,${a})`); g.addColorStop(1, 'rgba(255,184,77,0)'); ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  const glow = 0.6 + 0.4 * prog(T, 152.2, 156) + 0.1 * Math.sin(T * 1.5), R = 120 * glow;
  const g = ctx.createRadialGradient(W / 2, H / 2 - 80, 0, W / 2, H / 2 - 80, R * 3); g.addColorStop(0, `rgba(255,220,160,${0.9 * glow})`); g.addColorStop(0.08, `rgba(255,184,77,${0.5 * glow})`); g.addColorStop(1, 'rgba(255,184,77,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = `rgba(0,0,0,${1 - prog(T, 134.4, 135.6)})`; ctx.fillRect(0, 0, W, H);
  if (T > 157.4) { ctx.fillStyle = `rgba(0,0,0,${prog(T, 157.4, 158.4)})`; ctx.fillRect(0, 0, W, H); }
};
S.credits = T => {
  ctx.fillStyle = '#050405'; ctx.fillRect(0, 0, W, H);
  dust(T, 50, 8, 'rgba(255,214,160,A)', 6);
  const a = oc(prog(T, 158.6, 159.6)) * (1 - prog(T, 167.4, 168));
  ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  pin(W / 2, 300, 0.9, 1);
  ctx.font = '120px Serif9'; ctx.letterSpacing = '28px'; ctx.fillStyle = '#fff'; ctx.fillText('你在这里', W / 2 + 14, 420);
  ctx.letterSpacing = '6px'; ctx.font = `34px ${FONT}`; ctx.fillStyle = 'rgba(243,237,226,0.75)'; ctx.fillText('a film by Claude', W / 2, 525);
  const lines = [`画面　${FRAMES.toLocaleString('en-US')} 帧　·　作者看过其中 ${SEEN.length} 帧`, '音乐　作者听过的时长：0 秒', '看过完整版的人　你（比作者多）'];
  ctx.font = `30px ${FONT}`; ctx.letterSpacing = '2px';
  lines.forEach((ln, i) => { ctx.globalAlpha = a * oc(prog(T, 160 + i * 1.3, 161 + i * 1.3)); ctx.fillStyle = i === 2 ? AMBER : 'rgba(243,237,226,0.6)'; ctx.fillText(ln, W / 2, 660 + i * 62); });
  ctx.restore();
};
S.last = T => {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const a = prog(T, 168.3, 168.9);
  ctx.save(); ctx.globalAlpha = a; ctx.font = '60px MonoB, "LXGW WenKai"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const s = `draw(${fmt(T, 2)})`; ctx.fillStyle = '#9ca3af'; ctx.fillText(s, W / 2, 470); ctx.restore();
};

// ---------- main ----------
function sceneAt(t) { let s = SCENES[0][0]; for (const [n, st] of SCENES) if (t >= st) s = n; return s; }
function renderScene(t) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.letterSpacing = '0px'; ctx.shadowBlur = 0; ctx.imageSmoothingEnabled = true;
  S[sceneAt(t)](t);
  ctx.restore();
  ctx.save(); drawCaps(t); ctx.restore();
}
window.draw = function (t) {
  renderScene(t);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.07; ctx.drawImage(GRAIN[Math.floor(t * 24) % 4], 0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.drawImage(VIG, 0, 0);
  if (t > DURATION - 0.5) { ctx.fillStyle = `rgba(0,0,0,${prog(t, DURATION - 0.5, DURATION - 0.1)})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
};

(async () => {
  const allText = CAPS.map(c => c.text).join('') + '你在这里一部作者从没看过的短片全片我看过的占比每一道橙线是真正看过的一帧画面音乐听时长完整版人比多帧秒剧透警告爱因斯坦致贝索家信年月日0123456789';
  await Promise.all(['Serif6', 'Serif9', 'Mono', 'MonoB'].map(f => document.fonts.load(`40px ${f}`, '你在这里draw0')));
  await document.fonts.load('40px "LXGW WenKai"', allText);
  await document.fonts.load('bold 40px "LXGW WenKai"', allText);
  // frames I looked at
  try { const s = await fetch('stills_log.txt', { cache: 'no-store' }); if (s.ok) SEEN = [...new Set((await s.text()).split('\n').filter(Boolean))].map(Number).sort((a, b) => a - b); } catch (e) { }
  TL.setN(SEEN.length);
  // the real soundtrack
  try {
    const buf = await (await fetch('soundtrack.wav', { cache: 'no-store' })).arrayBuffer(), dv = new DataView(buf);
    const n = (buf.byteLength - 44) / 4, cols = 1600; WAVE = []; RAWL = new Float32Array(Math.ceil(n / 10));
    for (let c = 0; c < cols; c++) { let mn = 0, mx = 0; const a = Math.floor(c / cols * n), b = Math.floor((c + 1) / cols * n); for (let i = a; i < b; i += 7) { const v = (dv.getInt16(44 + i * 4, true) + dv.getInt16(46 + i * 4, true)) / 65536; if (v < mn) mn = v; if (v > mx) mx = v; } WAVE.push({ min: mn, max: mx }); }
    for (let i = 0; i < RAWL.length; i++) { const j = i * 10; if (j < n) RAWL[i] = (dv.getInt16(44 + j * 4, true) + dv.getInt16(46 + j * 4, true)) / 65536; }
  } catch (e) { console.log('wave load failed', e); }
  GRAIN = [0, 1, 2, 3].map(s => { const c = mk(480, 270), g = c.getContext('2d'), im = g.createImageData(480, 270), r = rng(s + 5); for (let i = 0; i < im.data.length; i += 4) { const v = r() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } g.putImageData(im, 0, 0); return c; });
  VIG = mk(W, H); { const g = VIG.getContext('2d'), gr = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 1.05); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.6)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
  LIVE = mk(W, H); PEEK = mk(64, 36);
  // thumbnails of the film itself (two passes so tiles that show thumbnails get real ones)
  THUMB_MODE = true;
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < GRID * GRID; i++) {
    const tt = i * TILE + 0.6, sc = sceneAt(tt);
    if (pass === 1 && !['code', 'mosaic', 'droste'].includes(sc)) continue;
    const c = THUMBS[i] || mk(480, 270), g = c.getContext('2d');
    if (tt >= 169.4) { // frames that say "I haven't seen this frame" stay unseen, even as thumbnails
      g.fillStyle = '#000'; g.fillRect(0, 0, 480, 270); g.font = '120px Serif6'; g.fillStyle = 'rgba(255,184,77,0.5)'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 240, 140);
    } else { draw(tt); g.drawImage(cv, 0, 0, 480, 270); }
    THUMBS[i] = c;
  }
  THUMB_MODE = false;
  window.READY = true;
})();
