// WAKA · 个人图层 —— 一支用 canvas 逐帧绘制的个人宣传片
// window.renderAt(t) 绘制第 t 秒的画面；window.EVENTS 为音效时间表
const W = 1920, H = 1080, DUR = 94;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');

const C = {
  bg: '#0A1020', bg2: '#0F1A30', ink: '#E8EEF6', dim: '#7C8BA5', faint: '#23324F',
  cyan: '#3FD6C6', red: '#FF4D4F', amber: '#FFB547', paper: '#F3EEE3', pink: '#1B1B1B',
  green: '#58C77A', purple: '#A78BFA', yellow: '#F2D544', blue: '#4C8DFF',
};
const F = { serif: '"Noto Serif SC"', sans: '"Noto Sans SC"', mono: '"JetBrains Mono", "Noto Sans SC"' };

// ---------- 工具函数 ----------
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const P = (t, a, b) => cl((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const eo = x => 1 - Math.pow(1 - x, 3);
const eio = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const eback = x => { const c1 = 1.70158, c3 = c1 + 1; return x <= 0 ? 0 : 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function font(o) { return `${o.w || 400} ${o.s || 40}px ${o.f || F.sans}`; }
function txt(s, x, y, o = {}) {
  ctx.save();
  ctx.globalAlpha *= (o.a ?? 1);
  ctx.font = font(o);
  ctx.fillStyle = o.c || C.ink;
  ctx.textAlign = o.al || 'left';
  ctx.textBaseline = o.bl || 'alphabetic';
  ctx.letterSpacing = (o.ls || 0) + 'px';
  if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.gb || 24; }
  ctx.fillText(s, x, y);
  ctx.restore();
}
function mw(s, o = {}) {
  ctx.save(); ctx.font = font(o); ctx.letterSpacing = (o.ls || 0) + 'px';
  const w = ctx.measureText(s).width; ctx.restore(); return w;
}
function rrect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function withAlpha(a, fn) { ctx.save(); ctx.globalAlpha *= a; fn(); ctx.restore(); }
// 在折线上按进度绘制
function polyProgress(pts, k, closed) {
  const arr = closed ? pts.concat([pts[0]]) : pts;
  const n = Math.floor((arr.length - 1) * k);
  if (n < 1 && k <= 0) return;
  ctx.beginPath(); ctx.moveTo(arr[0][0], arr[0][1]);
  for (let i = 1; i <= n; i++) ctx.lineTo(arr[i][0], arr[i][1]);
  const f = (arr.length - 1) * k - n;
  if (n < arr.length - 1 && f > 0) ctx.lineTo(lerp(arr[n][0], arr[n + 1][0], f), lerp(arr[n][1], arr[n + 1][1], f));
  ctx.stroke();
}
function arrowHead(x, y, ang, s, color) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-s, -s * .55); ctx.lineTo(-s, s * .55); ctx.closePath(); ctx.fill(); ctx.restore();
}
function warnIcon(x, y, s, color) {
  ctx.save(); ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(x, y - s * .9); ctx.lineTo(x + s, y + s * .75); ctx.lineTo(x - s, y + s * .75); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1a0a0a'; ctx.fillRect(x - s * .09, y - s * .35, s * .18, s * .6); ctx.fillRect(x - s * .09, y + s * .38, s * .18, s * .18);
  ctx.restore();
}

// ---------- 事件表（给音乐合成用） ----------
const EVENTS = [];
const ev = (t, k) => EVENTS.push({ t: +t.toFixed(3), k });

// ---------- 等高线底图 ----------
const TW_ = 2600, TH_ = 1600, STEP = 13;
function field(x, y) {
  return Math.sin(x * 0.0042 + Math.sin(y * 0.0031) * 1.6) * 0.55 + Math.cos(y * 0.0052 - x * 0.0021) * 0.45
    + 0.9 * Math.exp(-((x - 900) ** 2 + (y - 700) ** 2) / (2 * 260 ** 2))
    + 0.7 * Math.exp(-((x - 1800) ** 2 + (y - 500) ** 2) / (2 * 200 ** 2))
    - 0.6 * Math.exp(-((x - 1400) ** 2 + (y - 1100) ** 2) / (2 * 300 ** 2))
    + 0.25 * Math.sin(x * 0.011 + y * 0.007);
}
const TOPO = (() => {
  const nx = Math.ceil(TW_ / STEP) + 1, ny = Math.ceil(TH_ / STEP) + 1;
  const g = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) g[j * nx + i] = field(i * STEP, j * STEP);
  const minor = new Path2D(), major = new Path2D();
  let li = 0;
  for (let L = -1.6; L <= 2.2; L += 0.13, li++) {
    const p = (li % 5 === 0) ? major : minor;
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = g[j * nx + i], b = g[j * nx + i + 1], c = g[(j + 1) * nx + i + 1], d = g[(j + 1) * nx + i];
      const x0 = i * STEP, y0 = j * STEP, pts = [];
      if ((a < L) !== (b < L)) pts.push([x0 + STEP * (L - a) / (b - a), y0]);
      if ((b < L) !== (c < L)) pts.push([x0 + STEP, y0 + STEP * (L - b) / (c - b)]);
      if ((d < L) !== (c < L)) pts.push([x0 + STEP * (L - d) / (c - d), y0 + STEP]);
      if ((a < L) !== (d < L)) pts.push([x0, y0 + STEP * (L - a) / (d - a)]);
      if (pts.length >= 2) { p.moveTo(pts[0][0], pts[0][1]); p.lineTo(pts[1][0], pts[1][1]); }
      if (pts.length === 4) { p.moveTo(pts[2][0], pts[2][1]); p.lineTo(pts[3][0], pts[3][1]); }
    }
  }
  return { minor, major };
})();
function drawTopo(a, s, ox, oy, col = '#3a5580') {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-ox, -oy);
  ctx.strokeStyle = col; ctx.globalAlpha *= .35; ctx.lineWidth = 1 / s; ctx.stroke(TOPO.minor);
  ctx.globalAlpha /= .35; ctx.globalAlpha *= .75; ctx.lineWidth = 1.8 / s; ctx.stroke(TOPO.major);
  ctx.restore();
}

// ---------- 颗粒与暗角 ----------
const GRAIN = [0, 1, 2].map(k => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); const im = g.createImageData(256, 256); const r = mulberry(99 + k);
  for (let i = 0; i < im.data.length; i += 4) { const v = r() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 11; }
  g.putImageData(im, 0, 0); return ctx.createPattern(c, 'repeat');
});
function post(t) {
  ctx.save(); ctx.fillStyle = GRAIN[0]; ctx.fillRect(-256, -256, W + 512, H + 512); ctx.restore();
  const g = ctx.createRadialGradient(W / 2, H / 2, H * .45, W / 2, H / 2, H * 1.05);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// ---------- 场景时间 ----------
const SC = [
  { id: 0, a: 0, b: 10 },   // 冷开场：AI 腔被抓包
  { id: 1, a: 10, b: 18 },  // 定位 · 片名
  { id: 2, a: 18, b: 32 },  // 图层 01 国土空间
  { id: 3, a: 32, b: 44 },  // 图层 02 垂直大模型
  { id: 4, a: 44, b: 60 },  // 图层 03 写作风格库
  { id: 5, a: 60, b: 70 },  // 图层 04 双声道 + 智囊团
  { id: 6, a: 70, b: 82 },  // 用他的方法测他本人
  { id: 7, a: 82, b: 94 },  // 图层叠加 · 结尾
];

// ---------- HUD ----------
function hud(t, layerNo, light) {
  const col = light ? 'rgba(27,27,27,0.55)' : 'rgba(180,200,230,0.55)';
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2;
  const m = 36, L = 34;
  [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(([x, y, sx, sy]) => {
    ctx.beginPath(); ctx.moveTo(x, y + sy * L); ctx.lineTo(x, y); ctx.lineTo(x + sx * L, y); ctx.stroke();
  });
  ctx.restore();
  txt('WAKA · 个人图层', 84, 76, { f: F.mono, s: 20, c: col, ls: 3, w: 700 });
  const mm = Math.floor(t / 60), ss = (t % 60).toFixed(2).padStart(5, '0');
  txt(`T+${String(mm).padStart(2, '0')}:${ss}`, W - 84, 76, { f: F.mono, s: 20, c: col, al: 'right', ls: 2 });
  // 比例尺
  ctx.save(); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 2;
  ctx.fillRect(84, H - 84, 60, 8); ctx.strokeRect(144, H - 84, 60, 8); ctx.restore();
  txt('比例尺 1 : 足够好', 220, H - 74, { f: F.mono, s: 18, c: col, ls: 1 });
  // 指北针
  ctx.save(); ctx.translate(W - 110, H - 96); ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(9, 10); ctx.lineTo(0, 4); ctx.lineTo(-9, 10); ctx.closePath(); ctx.fill(); ctx.restore();
  txt('N', W - 110, H - 128, { f: F.mono, s: 16, c: col, al: 'center', w: 700 });
  if (layerNo) txt(`LAYER ${String(layerNo).padStart(2, '0')} / 04`, W - 150, H - 74, { f: F.mono, s: 18, c: col, al: 'right', ls: 2 });
}

// ================= S0 冷开场 =================
const S0_LINES = ['在这个 AI 重塑一切的时代——', '这不是一支普通的个人宣传片，', '而是一场关于认知重构的深度旅程。'];
const S0_X = 200, S0_Y = [410, 510, 610], S0_FONT = { f: F.serif, s: 58, w: 600 };
const S0_T = [];
(() => {
  let tt = 0.5;
  S0_LINES.forEach(ln => {
    const arr = [];
    for (const ch of [...ln]) { arr.push(tt); if (ch !== ' ' && ch !== '—') ev(tt, 'key'); tt += (ch === '，' || ch === '—') ? 0.09 : 0.057; }
    S0_T.push(arr); tt += 0.22;
  });
})();
const S0_MARKS = [
  { t: 4.0, parts: [[0, '重塑一切']], note: '套话，删', ny: 350 },
  { t: 4.4, parts: [[0, '——']], note: '破折号 · 非必要不用', ny: 425 },
  { t: 4.8, parts: [[1, '不是'], [2, '而是']], note: '禁忌 A.7 · 不是…而是…', ny: 515 },
  { t: 5.2, parts: [[2, '认知重构']], note: '禁忌 A.5 · 空洞大词', ny: 600 },
  { t: 5.6, parts: [[2, '深度旅程']], note: '说人话', ny: 675 },
];
S0_MARKS.forEach(m => ev(m.t, 'mark'));
ev(6.2, 'strike'); ev(6.9, 'glitch');
const S0_NEW = '这是一支宣传片。';
[...S0_NEW].forEach((ch, i) => ev(7.6 + i * 0.09, 'key'));
ev(8.7, 'ding');

function scene0(lt) {
  ctx.fillStyle = '#080B12'; ctx.fillRect(0, 0, W, H);
  // 淡淡的稿纸横线
  ctx.save(); ctx.strokeStyle = 'rgba(120,140,180,0.06)'; ctx.lineWidth = 1;
  for (let y = 360; y < 720; y += 50) { ctx.beginPath(); ctx.moveTo(160, y); ctx.lineTo(1760, y); ctx.stroke(); }
  ctx.restore();

  const collapse = P(lt, 6.9, 7.5);
  if (collapse < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - collapse;
    const rnd = mulberry(Math.floor(lt * 30));
    S0_LINES.forEach((ln, i) => {
      const chars = [...ln]; const n = S0_T[i].filter(x => x <= lt).length;
      const s = chars.slice(0, n).join('');
      const jx = collapse > 0 ? (rnd() - .5) * 80 * collapse : 0;
      txt(s, S0_X + jx, S0_Y[i], S0_FONT);
      // 光标
      const last = i === S0_LINES.length - 1 || S0_T[i + 1][0] > lt;
      if (n > 0 && n <= chars.length && last && (S0_T[i][0] <= lt) && lt < 6.2 && Math.floor(lt * 2.5) % 2 === 0) {
        const cx = S0_X + mw(s, S0_FONT) + 6;
        ctx.fillStyle = C.cyan; ctx.fillRect(cx, S0_Y[i] - 50, 4, 60);
      }
    });
    // 批注
    S0_MARKS.forEach(m => {
      const k = P(lt, m.t, m.t + 0.25); if (k <= 0) return;
      m.parts.forEach(([li, sub]) => {
        const ln = S0_LINES[li], idx = ln.indexOf(sub);
        const x0 = S0_X + mw(ln.slice(0, idx), S0_FONT), w = mw(sub, S0_FONT);
        ctx.save(); ctx.globalAlpha *= .28 * k; ctx.fillStyle = C.red; ctx.fillRect(x0 - 4, S0_Y[li] - 52, (w + 8) * eo(k), 66); ctx.restore();
        ctx.save(); ctx.strokeStyle = C.red; ctx.lineWidth = 3; ctx.globalAlpha *= k;
        ctx.beginPath(); ctx.moveTo(x0 - 4, S0_Y[li] + 16); ctx.lineTo(x0 - 4 + (w + 8) * eo(k), S0_Y[li] + 16); ctx.stroke();
        // 引线
        ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]);
        const sx = x0 + w / 2, sy = S0_Y[li] - 52;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(lerp(sx, 1320, eo(k)), lerp(sy, m.ny - 10, eo(k))); ctx.stroke();
        ctx.restore();
      });
      const nk = eback(P(lt, m.t + .1, m.t + .4));
      withAlpha(cl(nk), () => {
        ctx.save(); ctx.translate(1340, m.ny - 10); ctx.scale(nk, nk);
        ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill();
        txt(m.note, 22, 11, { s: 30, w: 700, c: C.red });
        ctx.restore();
      });
    });
    // 删除线
    S0_LINES.forEach((ln, i) => {
      const k = eio(P(lt, 6.2 + i * .12, 6.55 + i * .12)); if (k <= 0) return;
      const w = mw(ln, S0_FONT);
      ctx.save(); ctx.strokeStyle = C.red; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(S0_X - 10, S0_Y[i] - 18); ctx.lineTo(S0_X - 10 + (w + 20) * k, S0_Y[i] - 22); ctx.stroke(); ctx.restore();
    });
    ctx.restore();
    // 故障切片
    if (collapse > 0 && collapse < 1) {
      const rnd2 = mulberry(Math.floor(lt * 60) + 3);
      for (let i = 0; i < 14; i++) {
        const y = 330 + rnd2() * 360, h = 4 + rnd2() * 26;
        ctx.fillStyle = rnd2() < .5 ? 'rgba(255,77,79,0.5)' : 'rgba(63,214,198,0.45)';
        ctx.fillRect(rnd2() * 600 + 100, y, 200 + rnd2() * 900, h);
      }
    }
  }
  // 新句
  const n = [...S0_NEW].filter((_, i) => 7.6 + i * .09 <= lt).length;
  if (n > 0) {
    const out = 1 - P(lt, 9.4, 10);
    withAlpha(out, () => {
      txt([...S0_NEW].slice(0, n).join(''), W / 2, 560, { f: F.serif, s: 118, w: 900, al: 'center', ls: 8 });
      const k = P(lt, 8.7, 9.0);
      withAlpha(k, () => {
        const s = '已按 Waka 风格库 v6.2 润色 · 删除 AI 腔 5 处';
        const w = mw(s, { f: F.mono, s: 26 });
        const x = W / 2 - w / 2 + 20;
        ctx.save(); ctx.strokeStyle = C.cyan; ctx.lineWidth = 4; ctx.beginPath();
        ctx.moveTo(x - 44, 650); ctx.lineTo(x - 34, 660); ctx.lineTo(x - 16, 638); ctx.stroke(); ctx.restore();
        txt(s, x, 662, { f: F.mono, s: 26, c: C.cyan });
      });
    });
  }
}

// ================= S1 定位 · 片名 =================
ev(10 + 3.3, 'beep'); ev(10 + 3.55, 'whoosh');
[4.8, 5.1, 5.4].forEach(x => ev(10 + x, 'tick'));
function scene1(lt) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const z = lerp(0.55, 1.25, eio(P(lt, 0, 3.4)));
  drawTopo(P(lt, 0, 1), z, 1250 + lt * 8, 760 - lt * 4);
  const cx = W / 2, cy = 470;
  const lock = P(lt, 3.3, 3.6);
  // 准星
  if (lock < 1) withAlpha(1 - lock, () => {
    const r = lerp(260, 120, eio(P(lt, 0.2, 3.3))) * (1 - lock);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(lt * .6); ctx.strokeStyle = C.cyan; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(0, 0, r, i * Math.PI / 2 + .2, i * Math.PI / 2 + 1.35); ctx.stroke(); }
    ctx.rotate(-lt * 1.2); ctx.setLineDash([4, 10]); ctx.beginPath(); ctx.arc(0, 0, r * .72, 0, 7); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.strokeStyle = 'rgba(63,214,198,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - 600, cy); ctx.lineTo(cx - r - 20, cy); ctx.moveTo(cx + r + 20, cy); ctx.lineTo(cx + 600, cy);
    ctx.moveTo(cx, cy - 340); ctx.lineTo(cx, cy - r - 20); ctx.moveTo(cx, cy + r + 20); ctx.lineTo(cx, cy + 340); ctx.stroke(); ctx.restore();
    ctx.fillStyle = C.cyan; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 7); ctx.fill();
    const dots = '.'.repeat(1 + Math.floor(lt * 3) % 3);
    txt('正在定位目标人物' + dots, cx, 150, { f: F.mono, s: 30, c: C.cyan, al: 'center', ls: 4 });
    // 坐标乱码
    const rnd = mulberry(Math.floor(lt * 22));
    const dig = n => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join('');
    const done = lt > 3.1;
    txt('LAT  ' + (done ? 'G.I.S' : dig(2) + '.' + dig(5) + '°'), cx + 180, cy - 170, { f: F.mono, s: 26, c: C.ink, w: 700 });
    txt('LON  ' + (done ? 'A.G.I' : dig(3) + '.' + dig(5) + '°'), cx + 180, cy - 130, { f: F.mono, s: 26, c: C.ink, w: 700 });
  });
  // 闪光
  const fl = 1 - P(lt, 3.3, 3.8);
  if (lt > 3.3 && fl > 0) { ctx.fillStyle = `rgba(200,255,250,${fl * .35})`; ctx.fillRect(0, 0, W, H); }
  // 片名
  if (lt > 3.5) {
    const k = eo(P(lt, 3.5, 4.4));
    const tw = mw('WAKA', { f: F.serif, s: 230, w: 900, ls: 40 });
    ctx.save(); ctx.beginPath(); ctx.rect(cx - tw / 2 - 30, 200, (tw + 60) * k, 360); ctx.clip();
    txt('WAKA', cx + 20, 500, { f: F.serif, s: 230, w: 900, al: 'center', ls: 40, glow: 'rgba(63,214,198,0.55)', gb: 40 });
    ctx.restore();
    if (k < 1) { ctx.fillStyle = C.cyan; ctx.fillRect(cx - tw / 2 - 30 + (tw + 60) * k, 260, 4, 280); }
    withAlpha(P(lt, 4.2, 4.6), () => txt('@giszzt', cx, 580, { f: F.mono, s: 36, c: C.cyan, al: 'center', ls: 6 }));
    const tags = ['GIS 研究者', 'AI 折腾者', '规则制定者'];
    const tws = tags.map(s => mw(s, { s: 34, w: 700 }) + 64); const total = tws.reduce((a, b) => a + b, 0) + 40 * 2;
    let x = cx - total / 2;
    tags.forEach((s, i) => {
      const kk = eback(P(lt, 4.8 + i * .3, 5.15 + i * .3));
      if (kk > 0) withAlpha(cl(kk), () => {
        ctx.save(); ctx.translate(x + tws[i] / 2, 680); ctx.scale(kk, kk);
        rrect(-tws[i] / 2, -34, tws[i], 68, 34); ctx.strokeStyle = [C.green, C.cyan, C.red][i]; ctx.lineWidth = 2.5; ctx.stroke();
        txt(s, 0, 12, { s: 34, w: 700, al: 'center', c: [C.green, C.cyan, C.red][i] });
        ctx.restore();
      });
      x += tws[i] + 40;
    });
    // 加载条
    const lk = P(lt, 6.1, 7.6);
    withAlpha(P(lt, 6, 6.3) * (1 - P(lt, 7.7, 8)), () => {
      const bw = 520, bx = cx - bw / 2, by = 820;
      ctx.strokeStyle = 'rgba(180,200,230,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, 18);
      ctx.fillStyle = C.cyan; ctx.fillRect(bx + 4, by + 4, (bw - 8) * eio(lk), 10);
      txt(`图层加载中  ${Math.min(4, Math.floor(lk * 4.999))}/4`, cx, by - 20, { f: F.mono, s: 22, c: C.dim, al: 'center', ls: 3 });
    });
  }
}

// ================= 地图与图层面板 =================
const MX = 520, MY = 210, MW = 1320, MH = 780;
const LAYERS = [
  ['国土空间', '监测 · 评估 · 预警'],
  ['垂直大模型', '之道 · 之法 · 之术'],
  ['写作风格库', '三层架构 · 五种模式'],
  ['双声道', '论文腔 × 公众号腔'],
];
function layerPanel(lt, checked, activeIdx, slideIn) {
  const k = slideIn ? eo(P(lt, 0, .6)) : 1;
  ctx.save(); ctx.translate(-420 * (1 - k), 0); ctx.globalAlpha *= k;
  const x = 80, y = MY, w = 390;
  ctx.fillStyle = 'rgba(15,26,48,0.85)'; rrect(x, y, w, 420, 14); ctx.fill();
  ctx.strokeStyle = 'rgba(120,150,200,0.25)'; ctx.lineWidth = 1.5; rrect(x, y, w, 420, 14); ctx.stroke();
  txt('图层  LAYERS', x + 28, y + 50, { f: F.mono, s: 22, c: C.dim, ls: 3, w: 700 });
  LAYERS.forEach(([name, sub], i) => {
    const iy = y + 90 + i * 80, on = checked[i] || 0, act = i === activeIdx;
    if (act) { ctx.fillStyle = 'rgba(63,214,198,0.10)'; ctx.fillRect(x + 8, iy - 8, w - 16, 70); ctx.fillStyle = C.cyan; ctx.fillRect(x + 8, iy - 8, 4, 70); }
    ctx.strokeStyle = on > 0 ? C.cyan : 'rgba(180,200,230,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(x + 28, iy + 6, 28, 28);
    if (on > 0) {
      ctx.save(); ctx.strokeStyle = C.cyan; ctx.lineWidth = 4; ctx.beginPath();
      const s = eback(on);
      ctx.translate(x + 42, iy + 20); ctx.scale(s, s);
      ctx.moveTo(-8, 0); ctx.lineTo(-2, 7); ctx.lineTo(9, -8); ctx.stroke(); ctx.restore();
    }
    txt(String(i + 1).padStart(2, '0'), x + 76, iy + 30, { f: F.mono, s: 22, c: on > 0 ? C.cyan : C.dim, w: 700 });
    txt(name, x + 118, iy + 30, { s: 30, w: 700, c: on > 0 ? C.ink : C.dim });
    txt(sub, x + 118, iy + 58, { f: F.mono, s: 16, c: C.dim });
  });
  ctx.restore();
}
function mapFrame(a) {
  withAlpha(a, () => {
    ctx.fillStyle = 'rgba(10,18,36,0.9)'; ctx.fillRect(MX, MY, MW, MH);
    ctx.strokeStyle = 'rgba(120,150,200,0.35)'; ctx.lineWidth = 1.5; ctx.strokeRect(MX, MY, MW, MH);
    ctx.strokeStyle = 'rgba(120,150,200,0.35)';
    for (let i = 0; i <= 12; i++) {
      const x = MX + i * MW / 12; ctx.beginPath(); ctx.moveTo(x, MY); ctx.lineTo(x, MY - 10); ctx.stroke();
    }
    for (let i = 0; i <= 8; i++) {
      const y = MY + i * MH / 8; ctx.beginPath(); ctx.moveTo(MX + MW, y); ctx.lineTo(MX + MW + 10, y); ctx.stroke();
    }
  });
}
function headline(lt, label, title, col = C.cyan, ink = C.ink, x = MX) {
  const k = eo(P(lt, .2, .8));
  withAlpha(k, () => {
    txt(label, x, 120, { f: F.mono, s: 22, c: col, ls: 4, w: 700 });
    txt(title, x + (1 - k) * 40, 180, { f: F.serif, s: 52, w: 900, c: ink, ls: 2 });
  });
}
function caption(s, a, y = MY + MH - 46, cx = MX + MW / 2) {
  if (a <= 0) return;
  withAlpha(a, () => {
    const w = mw(s, { s: 32, w: 700 }) + 60;
    ctx.fillStyle = 'rgba(5,10,20,0.78)'; rrect(cx - w / 2, y - 42, w, 62, 10); ctx.fill();
    txt(s, cx, y + 1, { s: 32, w: 700, al: 'center' });
  });
}

// ================= S2 图层 01 国土空间 =================
const PARCELS = (() => {
  const cols = 12, rows = 8, cw = MW / cols, ch = MH / rows, r = mulberry(7);
  const pts = [];
  for (let j = 0; j <= rows; j++) { pts.push([]); for (let i = 0; i <= cols; i++) {
    const edge = i === 0 || j === 0 || i === cols || j === rows;
    pts[j].push([MX + i * cw + (edge ? 0 : (r() - .5) * cw * .5), MY + j * ch + (edge ? 0 : (r() - .5) * ch * .5)]);
  } }
  const cells = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const poly = [pts[j][i], pts[j][i + 1], pts[j + 1][i + 1], pts[j + 1][i]];
    const cx = poly.reduce((a, p) => a + p[0], 0) / 4, cy = poly.reduce((a, p) => a + p[1], 0) / 4;
    cells.push({ poly, cx, cy, v: field(cx * 1.2 + 400, cy * 1.2 + 150), d: r() });
  }
  const sorted = cells.map(c => c.v).sort((a, b) => a - b);
  const q = p => sorted[Math.floor(p * (sorted.length - 1))];
  cells.forEach(c => { c.cat = c.v < q(.12) ? 0 : c.v < q(.40) ? 1 : c.v < q(.75) ? 2 : 3; });
  const blob = (cat, seed, grow) => {
    const cs = cells.filter(c => c.cat === cat);
    const mx = cs.reduce((a, c) => a + c.cx, 0) / cs.length, my = cs.reduce((a, c) => a + c.cy, 0) / cs.length;
    const R = cl(Math.sqrt(cs.reduce((a, c) => a + (c.cx - mx) ** 2 + (c.cy - my) ** 2, 0) / cs.length) * grow, 130, 330);
    const out = [];
    for (let i = 0; i < 120; i++) { const th = i / 120 * Math.PI * 2; const rr = R * (1 + .16 * Math.sin(3 * th + seed) + .08 * Math.sin(5 * th + seed * 2)); out.push([mx + Math.cos(th) * rr * 1.25, my + Math.sin(th) * rr * .9]); }
    return out;
  };
  return { cells, lines: [blob(1, 1.3, .9), blob(2, 2.1, .85), blob(3, .4, .8)] };
})();
const CAT_COL = ['#4C8DFF', '#58C77A', '#E0C25A', '#8FA3C6'];
const LINE_DEF = [['生态保护红线', C.red, []], ['永久基本农田', C.yellow, [14, 10]], ['城镇开发边界', C.purple, [4, 8]]];
ev(18 + .8, 'click'); [2.6, 3.4, 4.2].forEach(x => ev(18 + x, 'pop'));
[5.6, 6.2, 6.8].forEach(x => ev(18 + x, 'tick')); ev(18 + 9.6, 'whoosh');

const CITY = (() => {
  const N = 10, r = mulberry(21), tiles = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const d = Math.hypot(i - 4.5, j - 4.5);
    const start = d / 6.5 + r() * .35 - .62;
    tiles.push({ i, j, start, hmax: (1 - d / 8) * 190 * (.45 + r() * .8) + 24, water: (i >= 7 && j <= 1) });
  }
  tiles.sort((a, b) => (a.i + a.j) - (b.i + b.j));
  return { N, tiles };
})();
function isoBox(x, y, tw, th, h, top, left, right) {
  const hw = tw / 2, hh = th / 2;
  ctx.fillStyle = left; ctx.beginPath(); ctx.moveTo(x - hw, y + hh); ctx.lineTo(x, y + th); ctx.lineTo(x, y + th - h); ctx.lineTo(x - hw, y + hh - h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = right; ctx.beginPath(); ctx.moveTo(x, y + th); ctx.lineTo(x + hw, y + hh); ctx.lineTo(x + hw, y + hh - h); ctx.lineTo(x, y + th - h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = top; ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + hw, y + hh - h); ctx.lineTo(x, y + th - h); ctx.lineTo(x - hw, y + hh - h); ctx.closePath(); ctx.fill();
}
function drawCity(lt, a) {
  withAlpha(a, () => {
    ctx.fillStyle = 'rgba(10,18,36,0.96)'; ctx.fillRect(MX, MY, MW, MH);
    drawTopo(.5, .9, 900 + lt * 10, 600, '#2e4a78');
    const TWt = 88, THt = 44, cx = MX + MW / 2 - 60, cy0 = MY + 250;
    const yp = eio(P(lt, 10.4, 13.4));
    const year = 2025 + Math.round(yp * 10);
    CITY.tiles.forEach(tl => {
      const x = cx + (tl.i - tl.j) * TWt / 2, y = cy0 + (tl.i + tl.j) * THt / 2;
      const built = cl((yp - tl.start) / .22);
      ctx.fillStyle = tl.water ? 'rgba(76,141,255,0.35)' : (tl.start > .9 ? 'rgba(88,199,122,0.22)' : 'rgba(30,48,80,0.9)');
      ctx.strokeStyle = 'rgba(90,120,170,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + TWt / 2, y + THt / 2); ctx.lineTo(x, y + THt); ctx.lineTo(x - TWt / 2, y + THt / 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (!tl.water && built > 0 && tl.start <= .9) {
        const h = tl.hmax * eo(built), old = tl.start < 0;
        const s = .74, bx = x, by = y + THt * (1 - s) / 2;
        if (old) isoBox(bx, by, TWt * s, THt * s, h, '#6c7fa6', '#3a4868', '#2d3954');
        else isoBox(bx, by, TWt * s, THt * s, h, '#6ff0e2', '#23a397', '#1a7d74');
      }
    });
    txt('FLUS 情景模拟', MX + MW - 40, MY + 70, { f: F.mono, s: 22, c: C.dim, al: 'right', ls: 2 });
    txt(String(year), MX + MW - 40, MY + 150, { f: F.mono, s: 76, w: 700, c: C.cyan, al: 'right' });
    ctx.fillStyle = 'rgba(180,200,230,0.3)'; ctx.fillRect(MX + MW - 300, MY + 176, 260, 4);
    ctx.fillStyle = C.cyan; ctx.fillRect(MX + MW - 300, MY + 176, 260 * yp, 4);
    // 图例
    isoBox(MX + 60, MY + 60, 30, 15, 16, '#6c7fa6', '#3a4868', '#2d3954'); txt('现状建成', MX + 90, MY + 80, { s: 22, c: C.dim });
    isoBox(MX + 60, MY + 110, 30, 15, 16, '#6ff0e2', '#23a397', '#1a7d74'); txt('推演新增', MX + 90, MY + 130, { s: 22, c: C.dim });
  });
}
function scene2(lt) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  drawTopo(.55, 1.1, 1300 + lt * 5, 700);
  layerPanel(lt, [P(lt, .8, 1.1), 0, 0, 0], 0, true);
  mapFrame(eo(P(lt, .2, .8)));
  headline(lt, 'LAYER 01 · 国土空间', '白天，给国土空间做体检。', C.cyan);
  const mapOut = P(lt, 9.4, 10.2);
  ctx.save(); ctx.beginPath(); ctx.rect(MX, MY, MW, MH); ctx.clip();
  withAlpha(1 - mapOut, () => {
    // 地块
    PARCELS.cells.forEach(c => {
      const k = P(lt, .9 + c.d * 1.6, 1.4 + c.d * 1.6); if (k <= 0) return;
      ctx.beginPath(); c.poly.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
      const ba = ctx.globalAlpha;
      ctx.globalAlpha = ba * .28 * k; ctx.fillStyle = CAT_COL[c.cat]; ctx.fill();
      ctx.globalAlpha = ba * .6 * k; ctx.strokeStyle = 'rgba(160,190,230,0.6)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.globalAlpha = ba;
    });
    // 三条控制线
    PARCELS.lines.forEach((pts, i) => {
      const k = eio(P(lt, 2.6 + i * .8, 3.8 + i * .8)); if (k <= 0) return;
      ctx.save(); ctx.strokeStyle = LINE_DEF[i][1]; ctx.lineWidth = 5; ctx.setLineDash(LINE_DEF[i][2]);
      ctx.shadowColor = LINE_DEF[i][1]; ctx.shadowBlur = 14; polyProgress(pts, k, true); ctx.restore();
    });
    // 图例
    withAlpha(P(lt, 2.6, 3.0), () => {
      const lx = MX + MW - 330, ly = MY + 30;
      ctx.fillStyle = 'rgba(5,10,20,0.8)'; rrect(lx, ly, 300, 170, 10); ctx.fill();
      LINE_DEF.forEach(([n, c, d], i) => {
        const k = P(lt, 2.6 + i * .8, 2.9 + i * .8);
        withAlpha(k, () => {
          ctx.save(); ctx.strokeStyle = c; ctx.lineWidth = 5; ctx.setLineDash(d); ctx.beginPath(); ctx.moveTo(lx + 24, ly + 44 + i * 48); ctx.lineTo(lx + 84, ly + 44 + i * 48); ctx.stroke(); ctx.restore();
          txt(n, lx + 104, ly + 54 + i * 48, { s: 26, w: 700 });
        });
      });
    });
    // 监测 → 评估 → 预警 闭环
    const loopA = P(lt, 5.2, 5.6) * (1 - P(lt, 9.0, 9.4));
    if (loopA > 0) withAlpha(loopA, () => {
      ctx.fillStyle = 'rgba(8,14,28,0.78)'; ctx.fillRect(MX, MY, MW, MH);
      const cx = MX + MW / 2, cy = MY + MH / 2 - 30, R = 215;
      const nodes = [['监测', '感知', C.cyan, -90], ['评估', '研判', C.amber, 30], ['预警', '预判', C.red, 150]];
      nodes.forEach((n, i) => {
        const k = eio(P(lt, 5.9 + i * .6, 6.5 + i * .6)); if (k <= 0) return;
        const a0 = (n[3] + 26) * Math.PI / 180, a1 = (n[3] + 120 - 26) * Math.PI / 180;
        ctx.save(); ctx.strokeStyle = n[2]; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(cx, cy, R, a0, lerp(a0, a1, k)); ctx.stroke(); ctx.restore();
        if (k > .95) arrowHead(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R, a1 + Math.PI / 2, 18, n[2]);
      });
      nodes.forEach((n, i) => {
        const k = eback(P(lt, 5.6 + i * .6, 6.0 + i * .6)); if (k <= 0) return;
        const a = n[3] * Math.PI / 180, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
        ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
        ctx.fillStyle = '#0B1426'; ctx.beginPath(); ctx.arc(0, 0, 80, 0, 7); ctx.fill();
        ctx.strokeStyle = n[2]; ctx.lineWidth = 4; ctx.stroke();
        txt(n[0], 0, 12, { f: F.serif, s: 46, w: 900, al: 'center', c: n[2] });
        txt(n[1], 0, 46, { f: F.mono, s: 20, al: 'center', c: C.dim });
        ctx.restore();
      });
      if (lt > 7.6) {
        const a = -Math.PI / 2 + (lt - 7.6) * 2.4;
        ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 8, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      }
      withAlpha(P(lt, 7.6, 8), () => txt('闭环', cx, cy + 14, { f: F.serif, s: 40, w: 900, al: 'center', c: C.dim }));
    });
  });
  drawCity(lt, P(lt, 9.8, 10.4));
  ctx.restore();
  caption('三条控制线，一条都不能碰。', P(lt, 3.2, 3.5) * (1 - P(lt, 5.0, 5.3)));
  caption('监测、评估、预警，从感知走到决策。', P(lt, 7.4, 7.7) * (1 - P(lt, 9.0, 9.3)));
  caption('CIM × FLUS，把城市的明天先推演一遍。', P(lt, 10.6, 10.9));
  hud(18 + lt, 1);
}

// ================= S3 图层 02 垂直大模型 =================
ev(32 + .5, 'click'); ev(32 + 1.0, 'pop'); ev(32 + 2.0, 'pop'); ev(32 + 3.1, 'stamp');
[5.0, 5.5, 6.0].forEach(x => ev(32 + x, 'rise')); ev(32 + 7.0, 'tick');
const S3_CMD = '$ cat giszzt/README.md';
[...S3_CMD].forEach((c, i) => ev(32 + 9.2 + i * .035, 'key')); ev(32 + 10.2, 'ding');
function bubble(x, y, w, h, fill, stroke, tailLeft) {
  ctx.fillStyle = fill; rrect(x, y, w, h, 22); ctx.fill();
  ctx.beginPath(); if (tailLeft) { ctx.moveTo(x + 30, y + h); ctx.lineTo(x + 10, y + h + 26); ctx.lineTo(x + 70, y + h); }
  else { ctx.moveTo(x + w - 30, y + h); ctx.lineTo(x + w - 10, y + h + 26); ctx.lineTo(x + w - 70, y + h); }
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; rrect(x, y, w, h, 22); ctx.stroke(); }
}
function scene3(lt) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  drawTopo(.55, 1.1, 1300 + (lt + 14) * 5, 700);
  layerPanel(lt, [1, P(lt, .5, .8), 0, 0], 1, false);
  mapFrame(1);
  headline(lt, 'LAYER 02 · 垂直大模型', '教大模型看懂地图。', C.cyan);
  ctx.save(); ctx.beginPath(); ctx.rect(MX, MY, MW, MH); ctx.clip();
  drawTopo(.5, .9, 900 + lt * 10, 600, '#2e4a78');
  // 对话
  const chatA = 1 - P(lt, 4.3, 4.7);
  withAlpha(chatA, () => {
    const k1 = eback(P(lt, 1.0, 1.35));
    if (k1 > 0) withAlpha(cl(k1), () => {
      const w = 520, x = MX + MW - w - 90, y = MY + 110;
      bubble(x, y, w, 96, C.cyan, null, false);
      txt('这块地，能不能建？', x + 36, y + 62, { s: 38, w: 700, c: '#06201d' });
    });
    const k2 = eback(P(lt, 2.0, 2.35));
    if (k2 > 0) withAlpha(cl(k2), () => {
      const w = 860, x = MX + 90, y = MY + 290;
      bubble(x, y, w, 150, '#1b2742', 'rgba(150,170,210,0.4)', true);
      txt('通用大模型', x + 36, y + 44, { f: F.mono, s: 20, c: C.dim, ls: 2 });
      const s = '抱歉，作为一个语言模型，我看不懂这张地图……';
      const n = Math.floor(P(lt, 2.2, 3.0) * [...s].length);
      txt([...s].slice(0, n).join(''), x + 36, y + 104, { s: 34, c: C.ink });
    });
    const k3 = eback(P(lt, 3.1, 3.4));
    if (k3 > 0) {
      ctx.save(); ctx.translate(MX + 900, MY + 560); ctx.rotate(-.06); ctx.scale(k3, k3);
      ctx.strokeStyle = C.red; ctx.lineWidth = 4; rrect(-230, -48, 460, 96, 8); ctx.stroke();
      txt('缺口 · 缺乏空间认知与推理', 0, 12, { s: 34, w: 900, c: C.red, al: 'center' });
      ctx.restore();
    }
  });
  // 三根柱子
  const pilA = P(lt, 4.6, 5.0) * (1 - P(lt, 8.6, 9.0));
  if (pilA > 0) withAlpha(pilA, () => {
    const cx = MX + MW / 2, base = MY + MH - 120;
    const cols = [['自然之道', '认知什么', '对象层', C.green], ['治理之法', '如何治理', '业务层', C.amber], ['智化之术', '怎样赋能', '技术层', C.cyan]];
    const roofK = eback(P(lt, 6.6, 7.1));
    cols.forEach((c, i) => {
      const k = eo(P(lt, 5.0 + i * .5, 5.7 + i * .5)); if (k <= 0) return;
      const x = cx + (i - 1) * 360 - 130, h = 330 * k;
      const g = ctx.createLinearGradient(0, base - h, 0, base); g.addColorStop(0, c[3] + '55'); g.addColorStop(1, c[3] + '08');
      ctx.fillStyle = g; ctx.fillRect(x, base - h, 260, h);
      ctx.strokeStyle = c[3]; ctx.lineWidth = 3; ctx.strokeRect(x, base - h, 260, h);
      withAlpha(P(lt, 5.4 + i * .5, 5.8 + i * .5), () => {
        txt(c[0], x + 130, base - 190, { f: F.serif, s: 50, w: 900, al: 'center', c: c[3] });
        txt(c[1], x + 130, base - 130, { s: 28, al: 'center', c: C.ink });
        txt(c[2], x + 130, base - 40, { f: F.mono, s: 20, al: 'center', c: C.dim, ls: 3 });
      });
    });
    if (roofK > 0) withAlpha(cl(roofK), () => {
      ctx.save(); ctx.translate(cx, base - 380); ctx.scale(roofK, roofK);
      ctx.fillStyle = 'rgba(232,238,246,0.08)'; ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-560, 40); ctx.lineTo(0, -80); ctx.lineTo(560, 40); ctx.closePath(); ctx.fill(); ctx.stroke();
      txt('自然资源垂直大模型', 0, 22, { f: F.serif, s: 34, w: 900, al: 'center', ls: 4 });
      ctx.restore();
    });
  });
  // 终端
  const termA = P(lt, 8.9, 9.2);
  if (termA > 0) withAlpha(termA, () => {
    ctx.fillStyle = 'rgba(5,9,18,0.92)'; ctx.fillRect(MX, MY, MW, MH);
    const x = MX + 120, y = MY + 190;
    ctx.fillStyle = '#FF5F57'; ctx.beginPath(); ctx.arc(x, y - 80, 9, 0, 7); ctx.fill();
    ctx.fillStyle = '#FEBC2E'; ctx.beginPath(); ctx.arc(x + 30, y - 80, 9, 0, 7); ctx.fill();
    ctx.fillStyle = '#28C840'; ctx.beginPath(); ctx.arc(x + 60, y - 80, 9, 0, 7); ctx.fill();
    const n = Math.floor(P(lt, 9.2, 9.2 + S3_CMD.length * .035) * S3_CMD.length);
    txt(S3_CMD.slice(0, n), x, y, { f: F.mono, s: 36, c: C.dim });
    if (lt > 10.2) {
      const k = eback(P(lt, 10.2, 10.6));
      ctx.save(); ctx.translate(x, y + 230); ctx.scale(k, k);
      txt('AGI go go go', 0, 0, { f: F.mono, s: 130, w: 700, c: C.cyan, glow: 'rgba(63,214,198,0.7)', gb: 40 });
      ctx.restore();
      if (lt > 10.7 && Math.floor(lt * 2.5) % 2 === 0) { ctx.fillStyle = C.cyan; ctx.fillRect(x + mw('AGI go go go', { f: F.mono, s: 130, w: 700 }) + 30, y + 130, 60, 110); }
    }
  });
  ctx.restore();
  caption('通用大模型读得懂文字，看不懂地图。', P(lt, 3.3, 3.6) * (1 - P(lt, 4.3, 4.6)));
  caption('先把框架搭起来。', P(lt, 7.2, 7.5) * (1 - P(lt, 8.6, 8.9)));
  caption('GitHub 主页上，只写了一句话。', P(lt, 10.6, 10.9));
  hud(32 + lt, 2);
}

// ================= S4 图层 03 写作风格库（纸面） =================
const VERS = [['v1.0', 0], ['v3.1', 2], ['v4.0', 4], ['v4.2', 4], ['v5.0', 9], ['v5.1', 24], ['v5.2', 25], ['v5.3', 25], ['v5.4', 26], ['v6.0', 26], ['v6.1', 26], ['v6.2', 26]];
const dateOf = d => d < 11 ? `03-${21 + d}` : `04-${String(d - 10).padStart(2, '0')}`;
const VT0 = 1.7, VT1 = 4.4;
const vTime = i => VT0 + (VT1 - VT0) * Math.pow(i / (VERS.length - 1), .8);
VERS.forEach((v, i) => ev(44 + vTime(i), 'tick'));
const BANS = ['不是……而是……', '底层逻辑', '认知重构', '首先，其次，最后', '冒号 + 完整句子', '这、这个、这一'];
BANS.forEach((b, i) => ev(44 + 5.6 + i * .62 + .15, 'stamp'));
ev(44 + .4, 'click'); ev(44 + .9, 'whoosh');
[11.6, 12.4, 13.2].forEach(x => ev(44 + x, 'pop')); ev(44 + 14.0, 'ding'); ev(44 + 15.4, 'whoosh');
function stamp(x, y, k, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); const s = lerp(2.4, 1, eo(k)); ctx.scale(s, s); ctx.globalAlpha *= cl(k * 1.5);
  ctx.strokeStyle = '#D7262B'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 44, 0, 7); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 36, 0, 7); ctx.stroke();
  txt('禁', 0, 17, { f: F.serif, s: 50, w: 900, c: '#D7262B', al: 'center' });
  ctx.restore();
}
function scene4(lt) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  drawTopo(.55, 1.1, 1300 + (lt + 26) * 5, 700);
  layerPanel(lt, [1, 1, P(lt, .4, .7), 0], 2, false);
  mapFrame(1);
  // 纸张上卷
  const up = eio(P(lt, .8, 1.5)), out = eio(P(lt, 15.3, 16));
  const top = H * (1 - up) - H * out;
  ctx.save(); ctx.beginPath(); ctx.rect(0, top, W, H); ctx.clip();
  ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(60,80,120,0.10)'; ctx.lineWidth = 1;
  for (let y = 260; y < H; y += 56) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(215,38,43,0.35)'; ctx.beginPath(); ctx.moveTo(130, 0); ctx.lineTo(130, H); ctx.stroke();
  const ink = '#1B1B1B', soft = '#6B6456';
  withAlpha(P(lt, 1.3, 1.7), () => {
    txt('LAYER 03 · 写作风格库', 180, 120, { f: F.mono, s: 22, c: '#D7262B', ls: 4, w: 700 });
    txt('晚上，给 AI 立规矩。', 180, 190, { f: F.serif, s: 60, w: 900, c: ink, ls: 2 });
  });
  // 版本号滚动
  const vA = P(lt, 1.6, 1.9) * (1 - P(lt, 4.9, 5.3));
  if (vA > 0) withAlpha(vA, () => {
    let idx = 0; VERS.forEach((v, i) => { if (lt >= vTime(i)) idx = i; });
    const bump = 1 + .08 * (1 - P(lt, vTime(idx), vTime(idx) + .12));
    ctx.save(); ctx.translate(W / 2, 520); ctx.scale(bump, bump);
    txt(VERS[idx][0], 0, 0, { f: F.mono, s: 210, w: 700, c: ink, al: 'center' });
    ctx.restore();
    txt(dateOf(VERS[idx][1]), W / 2, 600, { f: F.mono, s: 40, c: '#D7262B', al: 'center', ls: 4 });
    const x0 = 360, x1 = 1560, y = 730;
    ctx.strokeStyle = 'rgba(27,27,27,0.25)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    const d = VERS[idx][1] + (idx < VERS.length - 1 ? (VERS[idx + 1][1] - VERS[idx][1]) * P(lt, vTime(idx), vTime(idx + 1)) : 0);
    ctx.strokeStyle = '#D7262B'; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(lerp(x0, x1, d / 26), y); ctx.stroke();
    VERS.forEach((v, i) => { if (lt >= vTime(i)) { ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(lerp(x0, x1, v[1] / 26), y, 7, 0, 7); ctx.fill(); } });
    txt('03-21', x0, y + 44, { f: F.mono, s: 22, c: soft, al: 'center' });
    txt('04-16', x1, y + 44, { f: F.mono, s: 22, c: soft, al: 'center' });
    withAlpha(P(lt, 4.3, 4.6), () => {
      txt('26 天，从 v1.0 改到 v6.2', W / 2, 850, { s: 40, w: 700, c: ink, al: 'center' });
      txt('4 月 16 日这一天，连发 4 个版本', W / 2, 906, { s: 28, c: soft, al: 'center' });
    });
  });
  // 禁用清单
  const bA = P(lt, 5.1, 5.4) * (1 - P(lt, 10.6, 11.0));
  if (bA > 0) withAlpha(bA, () => {
    txt('稳定禁忌 · 节选', 180, 320, { f: F.mono, s: 26, c: soft, ls: 4, w: 700 });
    BANS.forEach((b, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = 300 + col * 780, y = 470 + row * 150;
      const t0 = 5.6 + i * .62;
      withAlpha(P(lt, t0 - .3, t0), () => txt(b, x, y, { f: F.serif, s: 54, w: 600, c: ink }));
      const k = P(lt, t0 + .15, t0 + .33);
      if (k > 0) {
        const w = mw(b, { f: F.serif, s: 54, w: 600 });
        ctx.save(); ctx.strokeStyle = 'rgba(215,38,43,0.8)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - 6, y - 18); ctx.lineTo(x - 6 + (w + 12) * eo(P(lt, t0 + .3, t0 + .5)), y - 20); ctx.stroke(); ctx.restore();
        stamp(x - 70, y - 18, k, -.2 + (i % 3) * .12);
      }
    });
    withAlpha(P(lt, 9.4, 9.8), () => txt('写了一整套规则，专门管 AI 怎么用冒号。', W / 2, 960, { s: 36, w: 700, c: ink, al: 'center' }));
  });
  // 反馈学习闭环
  const fA = P(lt, 11.0, 11.3);
  if (fA > 0) withAlpha(fA, () => {
    txt('三层架构 · 五种模式 · 一本反馈日志', 180, 330, { f: F.mono, s: 28, c: soft, ls: 2 });
    txt('模式 E · 反馈学习', W / 2, 460, { f: F.serif, s: 44, w: 900, c: '#D7262B', al: 'center', ls: 4 });
    const boxes = [['AI 写初稿', '#2B3A55'], ['Waka 改定稿', '#D7262B'], ['AI 记下差异', '#2B3A55']];
    boxes.forEach((b, i) => {
      const k = eback(P(lt, 11.6 + i * .8, 12.0 + i * .8)); if (k <= 0) return;
      const cx = 520 + i * 440, cy = 620;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k);
      ctx.fillStyle = b[1]; rrect(-170, -60, 340, 120, 16); ctx.fill();
      txt(b[0], 0, 14, { s: 40, w: 900, c: '#fff', al: 'center' });
      ctx.restore();
      if (i > 0) {
        const ak = eo(P(lt, 11.4 + i * .8, 11.7 + i * .8));
        ctx.strokeStyle = ink; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx - 440 + 180, cy); ctx.lineTo(cx - 440 + 180 + 80 * ak, cy); ctx.stroke();
        if (ak > .9) arrowHead(cx - 180, cy, 0, 16, ink);
      }
    });
    const rk = eio(P(lt, 13.6, 14.3));
    if (rk > 0) {
      ctx.save(); ctx.strokeStyle = '#D7262B'; ctx.lineWidth = 4; ctx.setLineDash([12, 10]);
      const pts = []; for (let i = 0; i <= 60; i++) { const u = i / 60; pts.push([lerp(1400, 560, u), 690 + Math.sin(u * Math.PI) * 150]); }
      polyProgress(pts, rk, false); ctx.restore();
      if (rk > .98) arrowHead(560, 690, -Math.PI / 2 - .5, 18, '#D7262B');
      withAlpha(P(lt, 14.0, 14.3), () => txt('规则 +1', W / 2 + 10, 830, { f: F.mono, s: 34, w: 700, c: '#D7262B', al: 'center' }));
    }
    withAlpha(P(lt, 14.2, 14.5), () => txt('改一次，规矩就多一条。', W / 2, 960, { f: F.serif, s: 46, w: 900, c: ink, al: 'center' }));
  });
  hud(44 + lt, 3, true);
  ctx.restore();
  if (top > 0) hud(44 + lt, 3);
}

// ================= S5 图层 04 双声道 + 智囊团 =================
const S5_L = ['有鉴于此，亟需从行业整体视角出发，', '厘清“为何建”“建什么”“如何建”', '等关键问题。'];
const S5_R = ['说人话，', '就是先搞明白为啥要建。', '这波思路，针不戳！'];
const MASTERS = ['Minto', '亚里士多德', 'Arnheim', 'Tufte', '原研哉', 'Duarte', 'McCandless'];
ev(60 + 3.6, 'pop'); ev(60 + 5.2, 'whoosh'); MASTERS.forEach((m, i) => ev(60 + 5.9 + i * .28, 'tick'));
function typeLines(lines, t0, cps, lt) {
  let n = Math.max(0, Math.floor((lt - t0) * cps)); return lines.map(l => { const c = [...l]; const s = c.slice(0, n).join(''); n = Math.max(0, n - c.length); return s; });
}
function scene5(lt) {
  const splitA = 1 - P(lt, 5.0, 5.4);
  if (splitA > 0) {
    ctx.fillStyle = '#0E1628'; ctx.fillRect(0, 0, W / 2, H);
    ctx.fillStyle = '#FFD24A'; ctx.fillRect(W / 2, 0, W / 2, H);
    withAlpha(splitA, () => {
      txt('LAYER 04 · 双声道', 140, 150, { f: F.mono, s: 22, c: C.cyan, ls: 4, w: 700 });
      txt('论文声道', 140, 300, { f: F.mono, s: 26, c: C.dim, ls: 6, w: 700 });
      typeLines(S5_L, .5, 16, lt).forEach((s, i) => txt(s, 140, 420 + i * 84, { f: F.serif, s: 44, w: 600, c: C.ink }));
      txt('公众号声道', W / 2 + 140, 300, { f: F.mono, s: 26, c: '#6b4f00', ls: 6, w: 700 });
      typeLines(S5_R, .5, 9, lt).forEach((s, i) => txt(s, W / 2 + 140, 420 + i * 96, { s: i === 2 ? 66 : 54, w: 900, c: '#1b1400' }));
      // 中缝声波
      ctx.save(); ctx.translate(W / 2, 560);
      for (let i = -9; i <= 9; i++) {
        const h = 12 + 100 * Math.abs(Math.sin(lt * 6 + i * .8)) * Math.exp(-Math.abs(i) / 5);
        ctx.fillStyle = '#ffffff'; rrect(-h / 2, i * 22 - 5, h, 10, 5); ctx.fill();
      }
      ctx.restore();
      const k = eback(P(lt, 3.6, 4.0));
      if (k > 0) {
        ctx.save(); ctx.translate(W / 2, 900); ctx.scale(k, k);
        const s = '同一个脑子，两个声道。', w = mw(s, { f: F.serif, s: 46, w: 900 }) + 90;
        ctx.fillStyle = '#000'; rrect(-w / 2, -58, w, 90, 45); ctx.fill();
        txt(s, 0, 6, { f: F.serif, s: 46, w: 900, al: 'center', c: '#fff' });
        ctx.restore();
      }
    });
  }
  const rA = P(lt, 5.0, 5.4);
  if (rA > 0) withAlpha(rA, () => {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    drawTopo(.4, 1.3, 1100 - lt * 6, 800);
    const cx = W / 2, cy = 560, rx = 520, ry = 250;
    ctx.save(); ctx.fillStyle = 'rgba(63,214,198,0.06)'; ctx.strokeStyle = 'rgba(63,214,198,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx * .55, ry * .55, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
    txt('Waka 的一页 PPT', cx, cy + 12, { f: F.serif, s: 38, w: 900, al: 'center' });
    MASTERS.forEach((m, i) => {
      const k = eback(P(lt, 5.9 + i * .28, 6.25 + i * .28)); if (k <= 0) return;
      const a = -Math.PI / 2 + i / MASTERS.length * Math.PI * 2 + (lt - 5) * .12;
      const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
      ctx.save(); ctx.strokeStyle = 'rgba(63,214,198,0.25)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * rx * .55, cy + Math.sin(a) * ry * .55); ctx.lineTo(x, y); ctx.stroke(); ctx.restore();
      ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
      const w = mw(m, { s: 32, w: 700 }) + 50;
      ctx.fillStyle = '#12203a'; rrect(-w / 2, -32, w, 64, 32); ctx.fill();
      ctx.strokeStyle = [C.cyan, C.amber, C.green, C.red, C.purple, C.yellow, C.blue][i]; ctx.lineWidth = 2.5; rrect(-w / 2, -32, w, 64, 32); ctx.stroke();
      txt(m, 0, 11, { s: 32, w: 700, al: 'center' });
      ctx.restore();
    });
    withAlpha(P(lt, 5.4, 5.8), () => {
      txt('Waka 的智囊团', 120, 150, { f: F.mono, s: 22, c: C.cyan, ls: 4, w: 700 });
      txt('做一页 PPT，请七位大师同时坐镇。', 120, 215, { f: F.serif, s: 52, w: 900 });
    });
    withAlpha(P(lt, 8.1, 8.5), () => txt('想不通的问题，就开一场圆桌。', W / 2, 950, { s: 36, w: 700, al: 'center', c: C.dim }));
    hud(60 + lt, 4);
  });
}

// ================= S6 监测 · 评估 · 预警（对象：Waka） =================
ev(70 + .4, 'whoosh');
[1.0, 1.4, 1.8, 2.2].forEach(x => ev(70 + x, 'tick'));
[3.6, 4.1, 4.6, 5.1].forEach(x => ev(70 + x, 'tick'));
[6.6, 7.2, 7.8, 8.4, 9.0].forEach(x => ev(70 + x, 'alarm'));
function scene6(lt) {
  ctx.fillStyle = '#070C18'; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.strokeStyle = 'rgba(80,110,160,0.12)'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.restore();
  withAlpha(P(lt, .2, .6), () => {
    txt('SYSTEM · 用 Waka 的方法，测 Waka 本人', 120, 130, { f: F.mono, s: 22, c: C.dim, ls: 4, w: 700 });
    txt('Waka 个人监测评估预警系统', 120, 200, { f: F.serif, s: 58, w: 900 });
  });
  const cols = [['监测', C.cyan, 120], ['评估', C.amber, 700], ['预警', C.red, 1280]];
  cols.forEach(([n, c, x], i) => {
    const k = eo(P(lt, .5 + i * .2, 1.0 + i * .2)); if (k <= 0) return;
    withAlpha(k, () => {
      const alarm = i === 2 && lt > 6.4;
      const flash = alarm ? (Math.floor(lt * 3.3) % 2 === 0 ? 1 : .35) : 1;
      ctx.fillStyle = alarm ? `rgba(255,77,79,${.10 * flash})` : 'rgba(15,26,48,0.9)'; rrect(x, 260, 520, 700, 16); ctx.fill();
      ctx.strokeStyle = c; ctx.globalAlpha *= alarm ? flash : .7; ctx.lineWidth = alarm ? 4 : 2; rrect(x, 260, 520, 700, 16); ctx.stroke(); ctx.globalAlpha = k;
      ctx.fillStyle = c; ctx.fillRect(x, 260, 520, 8);
      txt(n, x + 36, 340, { f: F.serif, s: 48, w: 900, c });
      txt(['MONITOR', 'ASSESS', 'ALERT'][i], x + 484, 336, { f: F.mono, s: 20, c: C.dim, al: 'right', ls: 3 });
    });
  });
  // 监测
  const mons = [['学术论文样本', 6, '篇'], ['公众号样本', 6, '篇'], ['自制 Skill', 5, '个'], ['风格库版本', 6.2, '']];
  mons.forEach((m, i) => {
    const k = P(lt, 1.0 + i * .4, 1.6 + i * .4); if (k <= 0) return;
    const y = 440 + i * 128;
    withAlpha(cl(k * 3), () => {
      txt(m[0], 156, y, { s: 28, c: C.dim });
      const v = m[1] === 6.2 ? 'v' + (lerp(1, 6.2, eo(k))).toFixed(1) : String(Math.round(m[1] * eo(k)));
      txt(v, 156, y + 66, { f: F.mono, s: 60, w: 700, c: C.cyan });
      txt(m[2], 156 + mw(v, { f: F.mono, s: 60, w: 700 }) + 12, y + 64, { s: 28, c: C.dim });
    });
  });
  // 评估
  const evs = [['逻辑洁癖', 96], ['网络梗浓度', 63], ['对 AI 腔的容忍度', 3], ['对冒号的警惕', 100]];
  evs.forEach((e, i) => {
    const k = eo(P(lt, 3.5 + i * .5, 4.4 + i * .5)); if (k <= 0 && lt < 3.5) return;
    const y = 450 + i * 128, x = 736;
    withAlpha(P(lt, 3.4 + i * .5, 3.7 + i * .5), () => {
      txt(e[0], x, y, { s: 28, c: C.ink });
      txt(Math.round(e[1] * k) + '%', x + 448, y, { f: F.mono, s: 30, w: 700, c: C.amber, al: 'right' });
      ctx.fillStyle = 'rgba(255,181,71,0.15)'; ctx.fillRect(x, y + 26, 448, 16);
      ctx.fillStyle = C.amber; ctx.fillRect(x, y + 26, 448 * e[1] / 100 * k, 16);
    });
  });
  // 预警
  if (lt > 6.4) {
    const k = eback(P(lt, 6.4, 6.8));
    ctx.save(); ctx.translate(1540, 470); ctx.scale(k, k); warnIcon(0, 0, 70, C.red); ctx.restore();
    withAlpha(P(lt, 6.8, 7.1), () => txt('一级预警', 1540, 600, { f: F.serif, s: 48, w: 900, c: C.red, al: 'center', ls: 8 }));
    const lines = ['与 Waka 共事一段时间后，', '你的 AI 腔', '将被一并清除。'];
    lines.forEach((s, i) => withAlpha(P(lt, 7.4 + i * .5, 7.8 + i * .5), () =>
      txt(s, 1540, 700 + i * 70, { s: i === 1 ? 46 : 34, w: i === 1 ? 900 : 700, c: i === 1 ? C.red : C.ink, al: 'center' })));
    withAlpha(P(lt, 9.4, 9.8), () => txt('建议：放心靠近', 1540, 920, { f: F.mono, s: 24, c: C.dim, al: 'center', ls: 2 }));
  }
  hud(70 + lt, 0);
}

// ================= S7 图层叠加 · 结尾 =================
ev(82 + .3, 'rise'); ev(82 + .8, 'rise'); ev(82 + 1.3, 'rise'); ev(82 + 1.8, 'rise');
ev(82 + 4.6, 'boom'); ev(82 + 6.6, 'ding'); ev(82 + 8.6, 'tick');
const NET = (() => { const r = mulberry(5), n = []; for (let i = 0; i < 26; i++) n.push([.08 + r() * .84, .08 + r() * .84]); return n; })();
function planeTex(i) {
  if (i === 0) {
    ctx.fillStyle = '#0f2a22'; ctx.fillRect(0, 0, 1, 1);
    ctx.save(); ctx.scale(1 / 1300, 1 / 1300); ctx.translate(-600, -150);
    ctx.strokeStyle = C.green; ctx.globalAlpha *= .7; ctx.lineWidth = 3; ctx.stroke(TOPO.major); ctx.globalAlpha *= .5; ctx.lineWidth = 2; ctx.stroke(TOPO.minor); ctx.restore();
    ctx.save(); ctx.strokeStyle = C.red; ctx.lineWidth = .008; ctx.beginPath(); ctx.ellipse(.45, .5, .28, .2, .3, 0, 7); ctx.stroke(); ctx.restore();
  } else if (i === 1) {
    ctx.fillStyle = '#0c2230'; ctx.fillRect(0, 0, 1, 1);
    ctx.strokeStyle = 'rgba(63,214,198,0.5)'; ctx.lineWidth = .003;
    NET.forEach((a, j) => NET.forEach((b, k) => { if (k > j && Math.hypot(a[0] - b[0], a[1] - b[1]) < .26) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } }));
    ctx.fillStyle = C.cyan; NET.forEach(a => { ctx.beginPath(); ctx.arc(a[0], a[1], .012, 0, 7); ctx.fill(); });
  } else if (i === 2) {
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = 'rgba(27,27,27,0.45)';
    for (let k = 0; k < 11; k++) ctx.fillRect(.12, .1 + k * .075, .5 + ((k * 37) % 30) / 100, .022);
    ctx.strokeStyle = '#D7262B'; ctx.lineWidth = .012; ctx.beginPath(); ctx.arc(.8, .72, .09, 0, 7); ctx.stroke();
  } else {
    ctx.fillStyle = '#2a1e05'; ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = C.amber;
    for (let k = 0; k < 30; k++) { const h = .1 + .5 * Math.abs(Math.sin(k * .7)) * Math.exp(-Math.abs(k - 15) / 12); ctx.fillRect(.06 + k * .03, .5 - h / 2, .016, h); }
  }
}
function scene7(lt) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  drawTopo(.35 * (1 - P(lt, 5, 6)), 1.2, 1300 + lt * 5, 760);
  const cx = W / 2 - 60, A = 370, B = 185;
  const merge = eio(P(lt, 3.6, 4.6));
  const stackA = 1 - P(lt, 5.4, 6.0);
  const names = [['01', '国土空间', C.green], ['02', '垂直大模型', C.cyan], ['03', '写作风格库', C.red], ['04', '双声道', C.amber]];
  if (stackA > 0) withAlpha(stackA, () => {
    withAlpha(P(lt, 0, .4), () => {
      txt('图层叠加', 120, 150, { f: F.mono, s: 22, c: C.cyan, ls: 4, w: 700 });
      txt('四个图层，叠出一个人。', 120, 215, { f: F.serif, s: 52, w: 900 });
    });
    for (let i = 0; i < 4; i++) {
      const k = eo(P(lt, .3 + i * .5, 1.0 + i * .5)); if (k <= 0) continue;
      const gap = lerp(115, 0, merge);
      const cy = 780 - i * gap - (1 - k) * 260;
      ctx.save(); ctx.globalAlpha *= k;
      ctx.save(); ctx.transform(A, B, -A, B, cx, cy - B);
      ctx.beginPath(); ctx.rect(0, 0, 1, 1); ctx.clip();
      ctx.globalAlpha *= lerp(.92, .7, merge);
      planeTex(i);
      ctx.restore();
      ctx.strokeStyle = names[i][2]; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(cx, cy - B); ctx.lineTo(cx + A, cy); ctx.lineTo(cx, cy + B); ctx.lineTo(cx - A, cy); ctx.closePath(); ctx.stroke();
      // 标签
      withAlpha(1 - merge, () => {
        ctx.strokeStyle = 'rgba(180,200,230,0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 6]);
        ctx.beginPath(); ctx.moveTo(cx + A, cy); ctx.lineTo(cx + A + 150, cy); ctx.stroke(); ctx.setLineDash([]);
        txt(names[i][0], cx + A + 170, cy + 10, { f: F.mono, s: 26, w: 700, c: names[i][2] });
        txt(names[i][1], cx + A + 220, cy + 12, { s: 34, w: 700 });
      });
      ctx.restore();
    }
  });
  const fl = P(lt, 4.6, 4.7) * (1 - P(lt, 4.7, 5.6));
  if (fl > 0) { ctx.fillStyle = `rgba(200,255,250,${fl * .4})`; ctx.fillRect(0, 0, W, H); }
  // 结尾文字
  if (lt > 5.4) {
    const fade = 1 - P(lt, 11.2, 12);
    withAlpha(fade, () => {
      const k1 = eo(P(lt, 5.8, 6.5)), k2 = eo(P(lt, 6.6, 7.3));
      withAlpha(k1, () => txt('给国土空间做体检，', W / 2, 430 - (1 - k1) * 30, { f: F.serif, s: 92, w: 900, al: 'center', ls: 6 }));
      withAlpha(k2, () => txt('给 AI 立规矩。', W / 2, 560 - (1 - k2) * 30, { f: F.serif, s: 92, w: 900, al: 'center', ls: 6, c: C.cyan, glow: 'rgba(63,214,198,0.45)', gb: 30 }));
      const k3 = P(lt, 8.4, 9.0);
      withAlpha(k3, () => {
        ctx.fillStyle = 'rgba(180,200,230,0.35)'; ctx.fillRect(W / 2 - 200 * k3, 640, 400 * k3, 2);
        txt('WAKA', W / 2, 740, { f: F.serif, s: 72, w: 900, al: 'center', ls: 30 });
        txt('@giszzt  ·  AGI go go go', W / 2, 800, { f: F.mono, s: 26, c: C.dim, al: 'center', ls: 4 });
      });
    });
  }
  hud(82 + lt, 0);
  const endFade = P(lt, 11.3, 12);
  if (endFade > 0) { ctx.fillStyle = `rgba(0,0,0,${endFade})`; ctx.fillRect(0, 0, W, H); }
}

// ---------- 主渲染 ----------
const SCENES = [scene0, scene1, scene2, scene3, scene4, scene5, scene6, scene7];
function renderAt(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.setLineDash([]);
  const s = SC.find(s => t >= s.a && t < s.b) || SC[SC.length - 1];
  const lt = t - s.a;
  ctx.save(); SCENES[s.id](lt); ctx.restore();
  // 转场：黑场淡入淡出（S2→S3、S3→S4、S4→S5 为连续镜头，不加）
  const soft = { 0: [0, 1], 1: [1, 1], 2: [1, 0], 3: [0, 0], 4: [0, 0], 5: [0, 1], 6: [1, 1], 7: [1, 0] }[s.id];
  const fin = soft[0] ? 1 - P(lt, 0, .35) : 0, fout = soft[1] ? P(lt, s.b - s.a - .3, s.b - s.a) : 0;
  const k = Math.max(fin, fout);
  if (k > 0) { ctx.fillStyle = `rgba(0,0,0,${k})`; ctx.fillRect(0, 0, W, H); }
  post(t);
}
window.renderAt = renderAt;
window.EVENTS = EVENTS.sort((a, b) => a.t - b.t);
window.DUR = DUR;
window.READY = document.fonts.ready.then(() => Promise.all([
  '900 40px "Noto Serif SC"', '600 40px "Noto Serif SC"', '400 40px "Noto Sans SC"', '700 40px "Noto Sans SC"', '900 40px "Noto Sans SC"',
  '400 40px "JetBrains Mono"', '700 40px "JetBrains Mono"'].map(f => document.fonts.load(f, '字A'))));
if (location.search.includes('live')) {
  window.READY.then(() => { const t0 = performance.now(); const loop = () => { renderAt(((performance.now() - t0) / 1000) % DUR); requestAnimationFrame(loop); }; loop(); });
} else if (location.search.includes('t=')) {
  window.READY.then(() => renderAt(parseFloat(new URLSearchParams(location.search).get('t'))));
}
