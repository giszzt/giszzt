// 地图的尽头 — deterministic canvas film. window.draw(t) renders frame at time t.
const W = 1920, H = 1080;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const { CAPS, SCENES, K, rng, BOSS, DESKS, YOU, officeTasks } = TL;

// ---------- math ----------
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, x) => a + (b - a) * x;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const oc = x => 1 - Math.pow(1 - x, 3);
const ioc = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const ob = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const oel = x => x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
function hash2(i, j) { const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(x, y, o = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let k = 0; k < o; k++) { s += a * vnoise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function emoji(c, e, x, y, size) { c.save(); c.font = `${size}px "Noto Color Emoji"`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(e, x, y); c.restore(); }
function rrect(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function chars(s) { return [...s]; }
// Visible portion of a caption text at time t ('|' = newline, not timed)
function typed(cap, t) {
  const n = Math.floor((t - cap.t) * cap.cps);
  let out = '', k = 0;
  for (const ch of chars(cap.text)) { if (ch === '|') { out += ch; continue; } if (k >= n) break; out += ch; k++; }
  return out;
}
const capDone = (cap, t) => typed(cap, t).replace(/\|/g, '').length >= chars(cap.text.replace(/\|/g, '')).length;
function wrap(c, text, maxW) {
  const lines = []; let cur = '', start = 0, idx = 0;
  for (const ch of chars(text)) {
    if (c.measureText(cur + ch).width > maxW && cur) { lines.push({ s: cur, start }); start = idx; cur = ''; }
    cur += ch; idx++;
  }
  if (cur) lines.push({ s: cur, start });
  return lines;
}

// ---------- textures ----------
const TX = {};
function makeTextures() {
  // grain
  TX.grain = [0, 1, 2, 3].map(s => {
    const c = mk(480, 270), g = c.getContext('2d'), im = g.createImageData(480, 270), r = rng(s + 9);
    for (let i = 0; i < im.data.length; i += 4) { const v = r() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    g.putImageData(im, 0, 0); return c;
  });
  // vignette
  TX.vig = mk(W, H); { const g = TX.vig.getContext('2d'); const gr = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.65)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
  // scanlines
  TX.scan = mk(W, H); { const g = TX.scan.getContext('2d'); g.fillStyle = 'rgba(0,0,0,0.28)'; for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 2); }
  // rice paper
  TX.paper = noiseTex(960, 540, (x, y, n) => { const f = 0.85 + 0.15 * n; return [239 * f + 10, 230 * f + 8, 208 * f + 5]; }, 0.02);
  { const g = TX.paper.getContext('2d'); const r = rng(5); g.strokeStyle = 'rgba(120,100,70,0.08)'; g.lineWidth = 0.6;
    for (let i = 0; i < 900; i++) { const x = r() * 960, y = r() * 540, a = r() * 6.28, l = 6 + r() * 26; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + r() * 4, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); } }
  // sepia paper
  TX.sepia = noiseTex(960, 540, (x, y, n) => { const d = Math.hypot(x - 480, y - 270) / 550; const f = (0.88 + 0.12 * n) * (1 - 0.35 * d * d); return [226 * f, 204 * f, 160 * f]; }, 0.015);
  // clay tablet
  TX.clay = makeClay();
  // ink mountains
  TX.mount = makeMountains();
  // stars
  const r = rng(42); TX.stars = []; for (let i = 0; i < 520; i++) TX.stars.push([r() * W, r() * H, r() * 1.6 + 0.3, r() * 6.28, r()]);
}
function noiseTex(w, h, colorFn, sc) {
  const c = mk(w, h), g = c.getContext('2d'), im = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = fbm(x * sc, y * sc, 5) * 0.8 + 0.2 * hash2(x, y);
    const [R, G, B] = colorFn(x, y, n), i = (y * w + x) * 4;
    im.data[i] = R; im.data[i + 1] = G; im.data[i + 2] = B; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0); return c;
}
function makeClay() {
  const w = 760, h = 900, c = mk(w, h), g = c.getContext('2d'), im = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = (x - w / 2) / (w / 2), ny = (y - h / 2) / (h / 2);
    const edge = Math.pow(Math.abs(nx), 6) + Math.pow(Math.abs(ny), 6) + 0.12 * (fbm(x * 0.02, y * 0.02, 3) - 0.5);
    const i = (y * w + x) * 4;
    if (edge > 0.92) { im.data[i + 3] = 0; continue; }
    const n = fbm(x * 0.012, y * 0.012, 5), m = hash2(x * 1.3, y * 0.7);
    const shade = 1 - 0.5 * Math.max(0, edge - 0.45) - 0.12 * (nx + ny) * 0.5;
    const f = (0.75 + 0.35 * n + 0.08 * m) * shade;
    im.data[i] = 168 * f; im.data[i + 1] = 128 * f; im.data[i + 2] = 88 * f; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  // cracks + chips
  const r = rng(11); g.lineCap = 'round';
  for (let k = 0; k < 9; k++) {
    let x = r() * w, y = r() * h, a = r() * 6.28; g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 30; s++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); }
    g.strokeStyle = 'rgba(40,24,12,0.55)'; g.lineWidth = 1.4 + r() * 1.5; g.stroke();
  }
  g.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 5; k++) { const a = r() * 6.28; g.beginPath(); g.arc(w / 2 + Math.cos(a) * w * 0.55, h / 2 + Math.sin(a) * h * 0.55, 14 + r() * 26, 0, 7); g.fill(); }
  return c;
}
function makeMountains() {
  const c = mk(W, H), g = c.getContext('2d');
  const layers = [[760, 0.55, 0.0025, 220], [840, 0.75, 0.004, 160], [930, 0.95, 0.006, 110]];
  layers.forEach(([base, alpha, sc, amp], li) => {
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 6) {
      const ridge = Math.abs(fbm(x * sc + li * 10, li * 3.3, 4) - 0.5) * 2;
      const y = base - amp * (1 - ridge) * (0.6 + 0.4 * Math.sin(x * 0.002 + li));
      g.lineTo(x, y);
    }
    g.lineTo(W, H); g.closePath();
    const gr = g.createLinearGradient(0, base - amp, 0, H);
    gr.addColorStop(0, `rgba(30,28,26,${alpha})`); gr.addColorStop(0.35, `rgba(60,58,55,${alpha * 0.5})`); gr.addColorStop(1, 'rgba(80,78,72,0)');
    g.fillStyle = gr; g.fill();
  });
  return c;
}

// ---------- geo ----------
const GEO = {};
const AFRICA = new Set(['012', '024', '072', '108', '120', '132', '140', '148', '174', '178', '180', '204', '226', '231', '232', '262', '266', '270', '288', '324', '384', '404', '426', '430', '434', '450', '454', '466', '478', '480', '504', '508', '516', '562', '566', '624', '646', '686', '690', '694', '706', '710', '716', '728', '729', '732', '748', '800', '818', '834', '854', '894', '678']);
const DESERT = new Set(['Algeria', 'Libya', 'Egypt', 'Saudi Arabia', 'Niger', 'Mali', 'Chad', 'Mauritania', 'Sudan', 'Mongolia', 'Iran', 'Iraq', 'Kazakhstan', 'W. Sahara', 'Oman', 'Yemen', 'Jordan', 'Syria', 'Turkmenistan', 'Uzbekistan', 'Afghanistan', 'Pakistan', 'Namibia', 'Botswana', 'United Arab Emirates', 'Kuwait', 'Qatar', 'Australia']);
async function loadGeo() {
  const [c50, l50] = await Promise.all([fetch('node_modules/world-atlas/countries-50m.json').then(r => r.json()), fetch('node_modules/world-atlas/land-50m.json').then(r => r.json())]);
  GEO.land = topojson.feature(l50, l50.objects.land);
  GEO.countries = topojson.feature(c50, c50.objects.countries).features;
  GEO.greenland = GEO.countries.find(f => f.id === '304');
  GEO.africa = { type: 'FeatureCollection', features: GEO.countries.filter(f => AFRICA.has(f.id) || f.properties.name === 'Somaliland') };
  GEO.grat = d3.geoGraticule10();
  GEO.sphere = { type: 'Sphere' };
  // earth colouring
  const r = rng(3);
  GEO.colored = GEO.countries.map(f => {
    const [lon, lat] = d3.geoCentroid(f); const nm = f.properties.name;
    let col;
    if (nm === 'Antarctica' || nm === 'Greenland' || lat > 66) col = '#e6edf2';
    else if (DESERT.has(nm)) col = `hsl(${36 + r() * 6},${42 + r() * 10}%,${58 + r() * 6}%)`;
    else if (Math.abs(lat) < 15) col = `hsl(${105 + r() * 15},${42 + r() * 10}%,${30 + r() * 6}%)`;
    else if (lat > 50) col = `hsl(${120 + r() * 20},${22 + r() * 10}%,${34 + r() * 6}%)`;
    else col = `hsl(${85 + r() * 25},${32 + r() * 12}%,${38 + r() * 8}%)`;
    return { f, col };
  });
  // clouds
  GEO.clouds = []; for (let i = 0; i < 55; i++) { const lon = r() * 360 - 180, lat = (r() - 0.5) * 130; for (let k = 0; k < 9; k++) GEO.clouds.push({ lon: lon + (r() - 0.5) * 26, lat: lat + (r() - 0.5) * 7, rad: 1.2 + r() * 3.2 }); }
  // 10° tiles for the 1:1 build
  GEO.tiles = [];
  for (let lat = -90; lat < 90; lat += 10) for (let lon = -180; lon < 180; lon += 10) {
    const ring = [];
    for (let x = lon; x <= lon + 10; x += 2.5) ring.push([x, lat]);
    for (let y = lat; y <= lat + 10; y += 2.5) ring.push([lon + 10, y]);
    for (let x = lon + 10; x >= lon; x -= 2.5) ring.push([x, lat + 10]);
    for (let y = lat + 10; y >= lat; y -= 2.5) ring.push([lon, y]);
    GEO.tiles.push({ geo: { type: 'Polygon', coordinates: [ring.reverse()] }, rt: 124.4 + Math.pow(r(), 0.85) * 5.6 });
  }
}
// Rigid rotation on the sphere moving point A to point B (keeps true area/shape)
function moveGeo(g, A, B) {
  const r1 = d3.geoRotation([-A[0], -A[1]]), r2 = d3.geoRotation([-B[0], -B[1]]);
  const f = c => typeof c[0] === 'number' ? r2.invert(r1(c)) : c.map(f);
  return { type: g.geometry.type, coordinates: f(g.geometry.coordinates) };
}
const GL_A = [-41, 73], GL_B = [21, 4];
// Realistic earth on an orthographic projection
function drawEarth(c, rot, cx, cy, R, o = {}) {
  const proj = d3.geoOrthographic().scale(R).translate([cx, cy]).rotate(rot).clipAngle(90).precision(R > 200 ? 0.5 : 2);
  const path = d3.geoPath(proj, c);
  // atmosphere
  const ag = c.createRadialGradient(cx, cy, R * 0.98, cx, cy, R * 1.18);
  ag.addColorStop(0, 'rgba(110,180,255,0.55)'); ag.addColorStop(1, 'rgba(110,180,255,0)');
  c.fillStyle = ag; c.beginPath(); c.arc(cx, cy, R * 1.18, 0, 7); c.fill();
  const og = c.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
  og.addColorStop(0, '#2f7fd0'); og.addColorStop(1, '#0a2557');
  c.fillStyle = og; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.fill();
  if (R > 20) {
    for (const { f, col } of GEO.colored) { c.beginPath(); path(f); c.fillStyle = col; c.fill(); }
    if (!o.noClouds) {
      c.save(); c.filter = `blur(${Math.max(1, R / 90).toFixed(1)}px)`; c.beginPath();
      for (const cl of GEO.clouds) path(d3.geoCircle().center([cl.lon + (o.cloudShift || 0), cl.lat]).radius(cl.rad).precision(30)());
      c.fillStyle = 'rgba(255,255,255,0.42)'; c.fill(); c.restore();
    }
  }
  // terminator shading
  const sg = c.createRadialGradient(cx - R * 0.45, cy - R * 0.45, R * 0.2, cx, cy, R * 1.05);
  sg.addColorStop(0, 'rgba(255,255,255,0.10)'); sg.addColorStop(0.55, 'rgba(0,0,20,0)'); sg.addColorStop(1, 'rgba(0,0,25,0.7)');
  c.fillStyle = sg; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.fill();
  return { proj, path };
}

// ---------- overlays ----------
const COL = { narr: '#ffd166', baby: '#d9a066', pei: '#c0392b', merc: '#4ea8de', green: '#ff6b6b', africa: '#ffb347', snow: '#b08968', gps: '#7cffc4', coder: '#a78bfa', agi: '#4ef0ff', sys: '#3dff7a' };
const CARDS = [
  { t0: 26.3, t1: 37.6, e: '🏺', name: '巴比伦泥板匠', sub: '公元前 600 年 · 巴比伦世界地图' },
  { t0: 38.3, t1: 49.6, e: '🖌️', name: '裴秀', sub: '西晋 · 公元 267 年 · 制图六体' },
  { t0: 52.3, t1: 71.6, e: '🧭', name: '杰拉杜斯·墨卡托', sub: '1569 年 · 墨卡托投影' },
  { t0: 72.3, t1: 85.6, e: '🩺', name: '约翰·斯诺', sub: '1854 年 · 伦敦霍乱地图' },
  { t0: 86.3, t1: 92.4, e: '📍', name: '沃尔多·托布勒', sub: '1970 年 · 地理学第一定律' },
  { t0: 98.3, t1: 101.9, e: '🛰️', name: 'GPS', sub: '1995 年 · 全面运行' },
  { t0: 110.3, t1: 121.6, e: '🤖', name: 'AGI', sub: '2026 年 · 无处不在' },
];
function drawCard(t) {
  for (const cd of CARDS) {
    if (t < cd.t0 || t > cd.t1 + 0.4) continue;
    const a = oc(prog(t, cd.t0, cd.t0 + 0.5)) * (1 - prog(t, cd.t1, cd.t1 + 0.4));
    const x = lerp(-520, 50, oc(prog(t, cd.t0, cd.t0 + 0.6)));
    ctx.save(); ctx.globalAlpha = a;
    ctx.font = '40px Sans9'; const w1 = ctx.measureText(cd.name).width; ctx.font = '24px Sans4'; const w2 = ctx.measureText(cd.sub).width;
    const w = Math.max(w1, w2) + 150;
    rrect(ctx, x, 44, w, 112, 18); ctx.fillStyle = 'rgba(12,12,16,0.72)'; ctx.fill();
    ctx.fillStyle = '#ffd166'; ctx.fillRect(x, 56, 6, 88);
    emoji(ctx, cd.e, x + 64, 101, 54);
    ctx.fillStyle = '#fff'; ctx.font = '40px Sans9'; ctx.textBaseline = 'alphabetic'; ctx.fillText(cd.name, x + 118, 98);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '24px Sans4'; ctx.fillText(cd.sub, x + 120, 136);
    ctx.restore();
  }
}
function capAlpha(cap, t) { return clamp((t - cap.t) / 0.15) * (1 - prog(t, cap.end - 0.25, cap.end)); }
function drawCaps(t) {
  for (const cap of CAPS) {
    if (t < cap.t || t > cap.end) continue;
    const a = capAlpha(cap, t), s = typed(cap, t), done = capDone(cap, t);
    const cursor = !done && Math.floor(t * 8) % 2 === 0 ? '▍' : '';
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (cap.style === 'sub' || cap.style === 'ink') {
      const ink = cap.style === 'ink';
      ctx.font = ink ? '66px Brush' : '50px Sans9';
      const full = cap.text; const fw = ctx.measureText(full).width;
      const y = H - 118 + 8 * (1 - oc(prog(t, cap.t, cap.t + 0.3)));
      if (!ink) { rrect(ctx, W / 2 - fw / 2 - 40, y - 46, fw + 80, 92, 46); ctx.fillStyle = 'rgba(10,10,16,0.76)'; ctx.fill(); }
      ctx.textAlign = 'left';
      ctx.fillStyle = ink ? '#16110c' : '#fff';
      ctx.fillText(s + cursor, W / 2 - fw / 2, y + (ink ? 4 : 2));
      if (cap.name) {
        ctx.font = '28px Sans9'; const nw = ctx.measureText(cap.name).width;
        const nx = W / 2 - fw / 2 - 30, ny = y - 74;
        if (ink) { ctx.fillStyle = '#b22a1d'; ctx.fillRect(nx, ny - 22, nw + 28, 44); ctx.fillStyle = '#fff'; ctx.font = '30px Brush'; ctx.fillText(cap.name, nx + 14, ny + 2); }
        else { rrect(ctx, nx, ny - 22, nw + 28, 44, 10); ctx.fillStyle = COL[cap.who] || '#ffd166'; ctx.fill(); ctx.fillStyle = '#111'; ctx.fillText(cap.name, nx + 14, ny + 1); }
      }
    } else if (cap.style === 'bigink') {
      const p = prog(t, cap.t, cap.t + 0.28), sc = lerp(1.5, 1, oc(p));
      ctx.globalAlpha = a * clamp(p * 3);
      ctx.translate(W / 2, H / 2 - 30); ctx.scale(sc, sc);
      const [l1, l2] = cap.text.split('|');
      ctx.fillStyle = '#0d0a08'; ctx.font = '150px Brush';
      ctx.fillText(l1, 0, -95); ctx.font = '190px Brush'; ctx.fillText(l2, 0, 110);
    } else if (cap.style === 'big') {
      const p = prog(t, cap.t, cap.t + 0.35), sc = lerp(2.2, 1, ob(p));
      ctx.translate(W / 2, H / 2); ctx.scale(sc, sc); ctx.rotate(-0.06);
      ctx.font = '260px Huang'; ctx.lineWidth = 22; ctx.strokeStyle = '#111'; ctx.lineJoin = 'round';
      ctx.strokeText(s, 0, 0); ctx.fillStyle = '#ffd166'; ctx.fillText(s, 0, 0);
    } else if (cap.style === 'agi' || cap.style === 'agibig') {
      const big = cap.style === 'agibig';
      ctx.font = big ? '150px Serif9' : '48px Sans9';
      const full = cap.text; const fw = ctx.measureText(full).width;
      const y = big ? H / 2 - 10 : H - 118;
      // scramble the next few characters
      const r = rng(Math.floor(t * 30));
      const POOL = '0123456789ABCDEF@#%&*<>/\\{}[]=+地图坐标投影栅格矢量';
      let tail = '';
      if (!done) for (let i = 0; i < 3; i++) tail += POOL[Math.floor(r() * POOL.length)];
      ctx.textAlign = 'left';
      ctx.shadowColor = '#4ef0ff'; ctx.shadowBlur = big ? 40 : 18;
      ctx.fillStyle = big ? '#eaffff' : '#9ff8ff';
      ctx.fillText(s, W / 2 - fw / 2, y);
      const sw = ctx.measureText(s).width;
      ctx.fillStyle = 'rgba(78,240,255,0.55)'; ctx.fillText(tail, W / 2 - fw / 2 + sw, y);
    } else if (cap.style === 'quote') {
      const lines = s.split('|');
      ctx.font = '84px Serif9'; ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 30;
      lines.forEach((ln, i) => ctx.fillText(ln, W / 2, H / 2 - 70 + i * 130));
    } else if (cap.style === 'borges') {
      const [l1, l2] = cap.text.split('|');
      ctx.globalAlpha = a * oc(prog(t, cap.t, cap.t + 1.2));
      ctx.font = '34px Sans4'; ctx.fillStyle = 'rgba(230,230,240,0.9)'; ctx.fillText(l1, W / 2, 96);
      ctx.font = '26px Sans4'; ctx.fillStyle = 'rgba(200,200,215,0.7)'; ctx.fillText(l2, W / 2, 146);
    } else if (cap.style === 'end') {
      const i = CAPS.filter(c => c.style === 'end').indexOf(cap);
      ctx.font = '62px Serif9'; ctx.letterSpacing = '6px';
      const full = cap.text, fw = ctx.measureText(full).width; let x = W / 2 - fw / 2;
      ctx.textAlign = 'left';
      chars(full).forEach((ch, k) => {
        const ca = clamp((t - cap.t - k / cap.cps) / 0.6);
        ctx.globalAlpha = a * ca; ctx.fillStyle = '#f4f1ea';
        ctx.fillText(ch, x, 760 + i * 110 + 14 * (1 - oc(ca)));
        x += ctx.measureText(ch).width;
      });
    } else if (cap.style === 'small') {
      ctx.font = '34px Sans4'; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillText(s, W / 2, H - 150);
    }
    ctx.restore();
  }
}

// ---------- effects ----------
const IMPACTS = [[12, 30], [K.babStamp, 14], ...K.seals.map(s => [s, 5]), [K.peiBig, 26], [K.flatten, 20], [K.pumpReveal, 8], [K.snowStamp, 12], [K.agiHit, 24], [K.paper, 20], [K.done, 18], [K.docStamp, 32], [K.scratch, 16]];
function shake(t) {
  let x = 0, y = 0;
  for (const [ti, s] of IMPACTS) { const d = t - ti; if (d < 0 || d > 0.7) continue; const e = s * Math.exp(-d * 9); x += e * Math.sin(d * 83 + ti); y += e * Math.cos(d * 71 + ti * 2); }
  return [x, y];
}
const FLASHES = [[12, 0.95], [20, 0.25], [26, 0.5], [38, 0.45], [52, 0.45], [K.flatten, 0.6], [72, 0.4], [86, 0.4], [98, 0.4], [K.agiHit, 0.9], [K.paper, 0.4], [122, 0.3], [K.done, 0.85], [142, 0.4], [K.docStamp, 0.35], [154, 0.3]];
function flash(t) { let a = 0; for (const [ti, s] of FLASHES) { const d = t - ti; if (d >= 0 && d < 0.6) a = Math.max(a, s * Math.exp(-d * 7)); } return a; }
let BUF;
function glitchSlices(amount, seed, n = 14) {
  const g = BUF.getContext('2d'); g.clearRect(0, 0, W, H); g.drawImage(cv, 0, 0);
  const r = rng(seed);
  for (let k = 0; k < n; k++) {
    const y = r() * H, h = 8 + r() * 90, dx = (r() - 0.5) * 2 * amount;
    ctx.drawImage(BUF, 0, y, W, h, dx, y, W, h);
    if (r() < 0.3) { ctx.fillStyle = r() < 0.5 ? 'rgba(255,0,80,0.18)' : 'rgba(0,255,240,0.18)'; ctx.fillRect(0, y, W, h); }
  }
}

// ---------- scenes ----------
const S = {};

S.term = t => {
  ctx.fillStyle = '#030805'; ctx.fillRect(0, 0, W, H);
  ctx.font = '30px VT, Sans4'; ctx.fillStyle = 'rgba(61,255,122,0.45)'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('AGI-OS v0.0.1  ·  GIS MODE  ·  ' + (t * 1000 | 0).toString(16).padStart(6, '0'), 120, 90);
  ctx.save(); ctx.font = '50px VT, Sans4'; ctx.shadowColor = '#3dff7a'; ctx.shadowBlur = 14; ctx.fillStyle = '#5dff8f';
  const terms = CAPS.filter(c => c.style === 'term');
  let lastY = 200;
  terms.forEach((c, i) => {
    if (t < c.t) return;
    const s = typed(c, t), y = 220 + i * 84; lastY = y;
    const blink = !capDone(c, t) || (i === terms.length - 1 && t < 9) ? (Math.floor(t * 3) % 2 ? '█' : '') : '';
    ctx.fillText(s + blink, 140, y);
  });
  if (t > 9.0) {
    const p = t < 10.4 ? oc(prog(t, 9.0, 10.4)) * 0.99 : t < 11.25 ? 0.99 : 1;
    const n = 30, f = Math.round(p * n);
    const pct = t < 11.25 ? Math.floor(p * 100) + '%' : '100%';
    ctx.fillText('[' + '#'.repeat(f) + '-'.repeat(n - f) + '] ' + pct, 140, lastY + 110);
    if (t > 10.5 && t < 11.25) { ctx.fillStyle = '#ffdd55'; ctx.shadowColor = '#ffdd55'; ctx.fillText('> 卡在 99% 是行业传统，请稍候', 140, lastY + 190); }
  }
  ctx.restore();
  ctx.drawImage(TX.scan, 0, 0);
  if (t > 11.2) { glitchSlices(60 + (t - 11.2) * 300, Math.floor(t * 20), 18); }
  if (t > 11.75) { ctx.fillStyle = `rgba(255,255,255,${prog(t, 11.75, 12)})`; ctx.fillRect(0, 0, W, H); }
};

function contours(t, alpha = 1) {
  const step = 24, nx = Math.ceil(W / step) + 1, ny = Math.ceil(H / step) + 1;
  const v = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = fbm(i * 0.07 + t * 0.06, j * 0.07 - t * 0.03, 3) * 0.9 + 0.1 * Math.sin(i * 0.05 + t * 0.4);
  const levels = []; for (let L = 0.3; L < 0.82; L += 0.04) levels.push(L);
  levels.forEach((L, li) => {
    const hue = lerp(185, 35, li / levels.length);
    ctx.strokeStyle = `hsla(${hue},85%,60%,${(li % 5 === 0 ? 0.75 : 0.32) * alpha})`;
    ctx.lineWidth = li % 5 === 0 ? 2.4 : 1.2;
    ctx.beginPath();
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = v[j * nx + i], b = v[j * nx + i + 1], c = v[(j + 1) * nx + i + 1], d = v[(j + 1) * nx + i];
      const idx = (a > L) | ((b > L) << 1) | ((c > L) << 2) | ((d > L) << 3);
      if (idx === 0 || idx === 15) continue;
      const x = i * step, y = j * step;
      const e = [
        [x + step * (L - a) / (b - a), y], [x + step, y + step * (L - b) / (c - b)],
        [x + step * (L - d) / (c - d), y + step], [x, y + step * (L - a) / (d - a)],
      ];
      const segs = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[0, 3]] }[idx];
      for (const [p, q] of segs) { ctx.moveTo(e[p][0], e[p][1]); ctx.lineTo(e[q][0], e[q][1]); }
    }
    ctx.stroke();
  });
}
S.title = t => {
  const g = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, 1100); g.addColorStop(0, '#13213d'); g.addColorStop(1, '#05070f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  contours(t, 0.9);
  ctx.fillStyle = 'rgba(5,7,15,0.35)'; ctx.fillRect(0, 0, W, H);
  // title slam with chromatic split
  const p = prog(t, 12, 12.45), sc = lerp(2.4, 1, ob(p));
  const d = 16 * Math.exp(-(t - 12) * 2.5) + 3 + 3 * Math.sin(t * 13) * Math.exp(-(t - 12));
  ctx.save(); ctx.translate(W / 2, H / 2 - 40); ctx.scale(sc, sc);
  ctx.font = '230px Serif9'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.letterSpacing = '20px';
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,40,90,0.9)'; ctx.fillText('地图的尽头', -d, 0);
  ctx.fillStyle = 'rgba(0,230,255,0.9)'; ctx.fillText('地图的尽头', d, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#fff'; ctx.fillText('地图的尽头', 0, 0);
  ctx.restore();
  // subtitle
  const sa = oc(prog(t, 13.3, 14.3));
  ctx.save(); ctx.globalAlpha = sa; ctx.font = '46px Sans4'; ctx.textAlign = 'center'; ctx.letterSpacing = `${lerp(40, 14, sa)}px`; ctx.fillStyle = '#e8eefc';
  ctx.fillText('一场跨越五千年的圆桌会议', W / 2, H / 2 + 140);
  ctx.letterSpacing = '6px'; ctx.font = '22px Pixel'; ctx.fillStyle = '#ffd166'; ctx.fillText('AGI GO GO GO  PRESENTS', W / 2, 140);
  ctx.font = '34px VT'; ctx.fillStyle = 'rgba(160,220,255,0.65)'; ctx.letterSpacing = '2px';
  const lat = 39 + 54 / 60 + Math.sin(t * 3) * 0.002, lon = 116 + 23 / 60 + Math.cos(t * 2.3) * 0.002;
  ctx.fillText(`N ${lat.toFixed(5)}°   E ${lon.toFixed(5)}°   SCALE 1:∞   EPSG:4326   ${(t * 37 % 1000).toFixed(1)} FPS`, W / 2, H - 110);
  ctx.restore();
  if (t > 19.5) { ctx.fillStyle = `rgba(0,0,0,${prog(t, 19.5, 20)})`; ctx.fillRect(0, 0, W, H); }
};

const SEATS = [['🏺', '泥板匠'], ['🖌️', '裴秀'], ['🧭', '墨卡托'], ['🩺', '斯诺'], ['📍', '托布勒'], ['🛰️', 'GPS'], ['?', '？？？']];
S.table = t => {
  ctx.fillStyle = '#100c09'; ctx.fillRect(0, 0, W, H);
  const zp = ioc(prog(t, 24.9, 26)), rot = (t - 20) * 0.07 - 1.2;
  const seat0 = [960 + Math.cos(rot) * 380, 560 + Math.sin(rot) * 380 * 0.62];
  ctx.save();
  ctx.translate(lerp(0, W / 2 - seat0[0] * 3, zp), lerp(0, H / 2 - seat0[1] * 3, zp)); ctx.scale(lerp(1, 3, zp), lerp(1, 3, zp));
  const sp = ctx.createRadialGradient(960, 520, 50, 960, 520, 800); sp.addColorStop(0, 'rgba(255,220,160,0.22)'); sp.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sp; ctx.fillRect(0, 0, W, H);
  // table (ellipse = perspective)
  const tg = ctx.createRadialGradient(900, 500, 20, 960, 560, 340); tg.addColorStop(0, '#7a4e2c'); tg.addColorStop(1, '#3a2312');
  ctx.fillStyle = '#1d120a'; ctx.beginPath(); ctx.ellipse(960, 580, 330, 205, 0, 0, 7); ctx.fill();
  ctx.fillStyle = tg; ctx.beginPath(); ctx.ellipse(960, 560, 320, 198, 0, 0, 7); ctx.fill();
  // topic card on the table
  ctx.save(); ctx.translate(960, 560); ctx.rotate(-0.05); ctx.fillStyle = '#efe3c4'; ctx.fillRect(-150, -70, 300, 140);
  ctx.fillStyle = '#3a2312'; ctx.font = '44px Brush'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('完美地图', 0, -14);
  ctx.font = '22px Sans4'; ctx.fillText('= ？', 0, 38); ctx.restore();
  // seats sorted by depth
  const seats = SEATS.map((s, i) => { const a = rot + i * Math.PI * 2 / SEATS.length; return { s, i, x: 960 + Math.cos(a) * 380, y: 560 + Math.sin(a) * 380 * 0.62 }; }).sort((a, b) => a.y - b.y);
  for (const { s, i, x, y } of seats) {
    const ap = ob(prog(t, 20.2 + i * 0.5, 20.6 + i * 0.5)); if (ap <= 0) continue;
    const dsc = lerp(0.8, 1.15, (y - 330) / 470);
    ctx.save(); ctx.translate(x, y - 40); ctx.scale(ap * dsc, ap * dsc);
    const agi = s[0] === '?';
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 70, 60, 16, 0, 0, 7); ctx.fill();
    ctx.fillStyle = agi ? '#0b1b26' : '#2b2b33'; ctx.beginPath(); ctx.arc(0, 0, 62, 0, 7); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = agi ? `rgba(78,240,255,${0.6 + 0.4 * Math.sin(t * 6)})` : '#ffd166'; ctx.stroke();
    if (agi) { ctx.shadowColor = '#4ef0ff'; ctx.shadowBlur = 25; ctx.fillStyle = '#4ef0ff'; ctx.font = '74px Sans9'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 0, 4); ctx.shadowBlur = 0; }
    else emoji(ctx, s[0], 0, 4, 64);
    ctx.font = '28px Sans9'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(s[1], 0, 106);
    ctx.restore();
  }
  ctx.restore();
};

S.baby = t => {
  const bg = ctx.createRadialGradient(960, 480, 80, 960, 540, 1100); bg.addColorStop(0, '#3a2a1e'); bg.addColorStop(1, '#0c0806');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // dust motes
  const r = rng(8); ctx.fillStyle = 'rgba(255,220,170,0.25)';
  for (let i = 0; i < 60; i++) { const x = (r() * W + t * 12 * (r() + 0.2)) % W, y = (r() * H - t * 6 * r() + H * 10) % H; ctx.beginPath(); ctx.arc(x, y, r() * 2 + 0.5, 0, 7); ctx.fill(); }
  ctx.save();
  ctx.translate(960, 530); ctx.rotate(Math.sin(t * 0.5) * 0.02 - 0.03); const zs = lerp(1.06, 0.98, prog(t, 26, 38)); ctx.scale(zs, zs);
  ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
  ctx.drawImage(TX.clay, -380, -450); ctx.shadowColor = 'transparent';
  // engraving helper
  const eng = (fn, p, w = 7) => {
    if (p <= 0) return; ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.setLineDash([2000 * p, 4000]);
    ctx.strokeStyle = 'rgba(255,225,180,0.35)'; ctx.lineWidth = w; ctx.translate(1.5, 2); fn(); ctx.stroke(); ctx.translate(-1.5, -2);
    ctx.strokeStyle = '#3b2616'; ctx.lineWidth = w; fn(); ctx.stroke(); ctx.restore();
  };
  const cy = 90;
  eng(() => { ctx.beginPath(); ctx.arc(0, cy, 220, -1.57, 4.71); }, oc(prog(t, 26.4, 27.4)));
  eng(() => { ctx.beginPath(); ctx.arc(0, cy, 272, -1.57, 4.71); }, oc(prog(t, 26.8, 27.8)));
  eng(() => { ctx.beginPath(); ctx.moveTo(-14, cy - 215); ctx.bezierCurveTo(-40, cy - 80, 20, cy + 40, -10, cy + 215); }, oc(prog(t, 27.6, 28.6)), 5);
  eng(() => { ctx.beginPath(); ctx.moveTo(14, cy - 215); ctx.bezierCurveTo(-12, cy - 80, 48, cy + 40, 18, cy + 215); }, oc(prog(t, 27.7, 28.7)), 5);
  eng(() => { ctx.beginPath(); ctx.rect(-70, cy - 40, 140, 54); }, oc(prog(t, 28.2, 28.9)), 6);
  const cities = [[-120, cy - 110], [110, cy - 130], [-150, cy + 90], [140, cy + 110], [60, cy + 160], [-60, cy - 170]];
  cities.forEach(([x, y], i) => eng(() => { ctx.beginPath(); ctx.arc(x, y, 16, 0, 6.3); }, oc(prog(t, 28.6 + i * 0.12, 29.0 + i * 0.12)), 5));
  for (let k = 0; k < 8; k++) {
    const a = -Math.PI / 2 + k * Math.PI / 4 + 0.2;
    const p1 = [Math.cos(a - 0.17) * 272, cy + Math.sin(a - 0.17) * 272], p2 = [Math.cos(a + 0.17) * 272, cy + Math.sin(a + 0.17) * 272], ap = [Math.cos(a) * 350, cy + Math.sin(a) * 350];
    eng(() => { ctx.beginPath(); ctx.moveTo(...p1); ctx.lineTo(...ap); ctx.lineTo(...p2); }, oc(prog(t, 29.2 + k * 0.15, 29.7 + k * 0.15)), 6);
  }
  // cuneiform rows
  const rr = rng(21);
  for (let row = 0; row < 3; row++) for (let k = 0; k < 15; k++) {
    const x = -300 + k * 42 + rr() * 6, y = -400 + row * 48, appear = 26.6 + (row * 15 + k) * 0.06;
    if (t < appear) continue;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rr() * 0.8 - 0.4);
    ctx.fillStyle = '#3b2616';
    const n = 1 + Math.floor(rr() * 3);
    for (let q = 0; q < n; q++) { ctx.beginPath(); ctx.moveTo(q * 10, 0); ctx.lineTo(q * 10 + 14, -6); ctx.lineTo(q * 10 + 14, 6); ctx.closePath(); ctx.fill(); ctx.fillRect(q * 10 + 10, -1.5, 18, 3); }
    ctx.restore();
  }
  // labels
  const lab = (txt, x, y, ax, ay, t0) => {
    const a = oc(prog(t, t0, t0 + 0.4)); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3; ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ax, ay); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(ax, ay, 7, 0, 7); ctx.fill();
    ctx.font = '40px Kuai'; ctx.textAlign = 'center'; ctx.fillText(txt, x, y - 24); ctx.restore();
  };
  lab('苦水', 500, cy + 300, 236, cy + 92, 29.6);
  lab('巴比伦（我们）', -530, cy - 240, -60, cy - 20, 28.4);
  ctx.restore();
  // "beyond: not my department"
  if (t > 33.2) {
    const r2 = rng(4);
    for (let i = 0; i < 9; i++) {
      const a = oc(prog(t, 33.2 + i * 0.08, 33.6 + i * 0.08));
      const x = r2() < 0.5 ? 150 + r2() * 300 : 1470 + r2() * 300, y = 200 + r2() * 650;
      ctx.save(); ctx.globalAlpha = a * 0.85; ctx.translate(x, y + Math.sin(t * 3 + i) * 8); ctx.rotate(r2() - 0.5);
      ctx.font = `${50 + r2() * 50}px Kuai`; ctx.fillStyle = '#d9a066'; ctx.textAlign = 'center'; ctx.fillText('？', 0, 0); ctx.restore();
    }
  }
  // stamp
  if (t > K.babStamp) {
    const p = prog(t, K.babStamp, K.babStamp + 0.18), sc = lerp(2, 1, oc(p));
    ctx.save(); ctx.translate(1440, 250); ctx.rotate(-0.18); ctx.scale(sc, sc); ctx.globalAlpha = clamp(p * 2) * 0.92;
    ctx.strokeStyle = '#e0452a'; ctx.lineWidth = 10; rrect(ctx, -250, -95, 500, 190, 14); ctx.stroke();
    ctx.lineWidth = 3; rrect(ctx, -234, -79, 468, 158, 8); ctx.stroke();
    ctx.fillStyle = '#e0452a'; ctx.font = '108px Huang'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('精度 ±∞', 0, 6);
    ctx.restore();
  }
};

const SEAL = ['分率', '准望', '道里', '高下', '方邪', '迂直'];
const SEAL_EN = ['比例尺', '方位', '距离', '高程', '坡度', '曲直'];
const RIVER = (() => { const r = rng(31), pts = []; let x = 330, y = 300; for (let i = 0; i < 60; i++) { pts.push([x, y]); x += 20; y += Math.sin(i * 0.35) * 14 + (r() - 0.5) * 8 + 4; } return pts; })();
S.pei = t => {
  ctx.drawImage(TX.paper, 0, 0, W, H);
  const dim = prog(t, 49.9, 50.15);
  // mountains reveal
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W * oc(prog(t, 38.0, 40.0)), H); ctx.clip(); ctx.drawImage(TX.mount, 0, 30); ctx.restore();
  // grid: 计里画方
  ctx.save(); ctx.lineCap = 'round';
  const x0 = 290, x1 = 1510, y0 = 150, y1 = 830, step = 85;
  let k = 0;
  for (let y = y0; y <= y1; y += step, k++) {
    const p = oc(prog(t, 38.4 + k * 0.12, 39.2 + k * 0.12)); if (p <= 0) continue;
    for (let s = 0; s < 3; s++) { ctx.strokeStyle = `rgba(150,40,25,${0.18 + s * 0.08})`; ctx.lineWidth = 3 - s; ctx.beginPath(); ctx.moveTo(x0, y + s * 0.8); ctx.lineTo(lerp(x0, x1, p), y + Math.sin(y + s) * 1.2); ctx.stroke(); }
  }
  k = 0;
  for (let x = x0; x <= x1; x += step, k++) {
    const p = oc(prog(t, 38.8 + k * 0.07, 39.6 + k * 0.07)); if (p <= 0) continue;
    for (let s = 0; s < 3; s++) { ctx.strokeStyle = `rgba(150,40,25,${0.18 + s * 0.08})`; ctx.lineWidth = 3 - s; ctx.beginPath(); ctx.moveTo(x + s * 0.8, y0); ctx.lineTo(x + Math.sin(x) * 1.2, lerp(y0, y1, p)); ctx.stroke(); }
  }
  ctx.restore();
  // river
  const rp = prog(t, 39.0, 41.0) * RIVER.length;
  ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(25,22,20,0.82)';
  for (let i = 1; i < Math.min(rp, RIVER.length); i++) { ctx.lineWidth = 4 + 9 * Math.sin(i / RIVER.length * Math.PI); ctx.beginPath(); ctx.moveTo(...RIVER[i - 1]); ctx.lineTo(...RIVER[i]); ctx.stroke(); }
  ctx.restore();
  // towns
  const towns = [[520, 280, '洛阳'], [880, 420, '长安'], [1220, 600, '建业'], [640, 640, '成都']];
  towns.forEach(([x, y, n], i) => { const a = oc(prog(t, 40.6 + i * 0.2, 41.0 + i * 0.2)); if (a <= 0) return; ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#1a1612'; ctx.lineWidth = 4; ctx.strokeRect(x - 13, y - 13, 26, 26); ctx.font = '40px Brush'; ctx.fillStyle = '#1a1612'; ctx.fillText(n, x + 22, y + 14); ctx.restore(); });
  // vertical title
  ctx.save(); ctx.globalAlpha = oc(prog(t, 38.3, 39.3)); ctx.font = '72px Brush'; ctx.fillStyle = '#1a1612'; ctx.textAlign = 'center';
  [...'禹贡地域图'].forEach((ch, i) => ctx.fillText(ch, 160, 230 + i * 88)); ctx.restore();
  // seals
  K.seals.forEach((ts, i) => {
    if (t < ts) return;
    const p = prog(t, ts, ts + 0.15), sc = lerp(1.8, 1, oc(p));
    const x = 1690 + (i % 2) * 0, y = 175 + i * 112;
    ctx.save(); ctx.translate(x, y); ctx.rotate((i % 2 ? 1 : -1) * 0.05); ctx.scale(sc, sc); ctx.globalAlpha = clamp(p * 2);
    ctx.fillStyle = '#b22a1d'; ctx.fillRect(-48, -48, 96, 96);
    ctx.fillStyle = '#f6e9d0'; ctx.font = '42px Brush'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(SEAL[i][0], 0, -21); ctx.fillText(SEAL[i][1], 0, 23);
    ctx.globalAlpha = clamp(p * 2) * 0.75; ctx.fillStyle = '#5a2a1d'; ctx.font = '24px Sans4'; ctx.textAlign = 'left'; ctx.fillText(SEAL_EN[i], 62, 2);
    ctx.restore();
  });
  if (dim > 0) {
    ctx.fillStyle = `rgba(240,232,212,${0.82 * dim})`; ctx.fillRect(0, 0, W, H);
    // ink splatter
    const r = rng(77); ctx.fillStyle = `rgba(15,12,10,${0.9 * dim})`;
    for (let i = 0; i < 26; i++) { const a = r() * 6.28, d = 380 + r() * 420; ctx.beginPath(); ctx.arc(W / 2 + Math.cos(a) * d * oc(dim), H / 2 + Math.sin(a) * d * 0.55 * oc(dim), 3 + r() * 16, 0, 7); ctx.fill(); }
    ctx.save(); ctx.globalAlpha = dim; ctx.translate(1540, 760); ctx.rotate(0.08); ctx.fillStyle = '#b22a1d'; ctx.fillRect(-55, -55, 110, 110);
    ctx.fillStyle = '#f6e9d0'; ctx.font = '46px Brush'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('裴', 0, -24); ctx.fillText('秀', 0, 26); ctx.restore();
  }
};

let GLOBE_BUF;
function mercProj() { return d3.geoMercator().scale(230).translate([960, 742]).precision(0.5); }
S.merc = t => {
  const og = ctx.createLinearGradient(0, 0, 0, H); og.addColorStop(0, '#0f3358'); og.addColorStop(1, '#081a30');
  ctx.fillStyle = og; ctx.fillRect(0, 0, W, H);
  if (t < K.flatten) {
    // globe -> rolling pin
    const g = GLOBE_BUF.getContext('2d'); g.clearRect(0, 0, W, H);
    const proj = d3.geoOrthographic().scale(380).translate([960, 520]).rotate([-(t - 52) * 28 + 20, -18]).clipAngle(90).precision(0.6);
    const path = d3.geoPath(proj, g);
    const gg = g.createRadialGradient(840, 400, 40, 960, 520, 380); gg.addColorStop(0, '#3d8fd8'); gg.addColorStop(1, '#123e74');
    g.fillStyle = gg; g.beginPath(); path(GEO.sphere); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 1; g.beginPath(); path(GEO.grat); g.stroke();
    g.fillStyle = '#ecdfbd'; g.beginPath(); path(GEO.land); g.fill();
    g.strokeStyle = '#a8916a'; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#ff5a5a'; g.beginPath(); path(GEO.greenland); g.fill();
    const sq = ioc(prog(t, 56.2, 57.7));
    const sy = 1 - 0.82 * sq, sx = 1 + 0.75 * sq;
    ctx.save(); ctx.translate(960, 520 + 380 * (1 - sy)); ctx.scale(sx, sy); ctx.translate(-960, -520); ctx.drawImage(GLOBE_BUF, 0, 0); ctx.restore();
    // rolling pin
    const enter = oc(prog(t, 55.6, 56.2)), leave = prog(t, 57.75, 58);
    const topY = 520 + 380 * (1 - sy) - 380 * sy - 48;
    const py = lerp(-140, topY, enter) - 700 * leave * leave;
    const roll = (t - 55.6) * 7;
    ctx.save(); ctx.translate(960 + Math.sin(roll) * 30 * enter, py); ctx.rotate(-0.04 + leave * 0.6);
    const pg = ctx.createLinearGradient(0, -44, 0, 44); pg.addColorStop(0, '#f3c98b'); pg.addColorStop(0.45, '#c88b4a'); pg.addColorStop(1, '#7a4a20');
    ctx.fillStyle = '#6b3e1a'; rrect(ctx, -720, -18, 150, 36, 18); ctx.fill(); rrect(ctx, 570, -18, 150, 36, 18); ctx.fill();
    ctx.fillStyle = pg; rrect(ctx, -580, -44, 1160, 88, 44); ctx.fill();
    ctx.strokeStyle = 'rgba(90,50,20,0.35)'; ctx.lineWidth = 3;
    for (let i = 0; i < 12; i++) { const x = -560 + ((i * 100 + roll * 60) % 1120 + 1120) % 1120; ctx.beginPath(); ctx.moveTo(x, -40); ctx.lineTo(x + 10, 40); ctx.stroke(); }
    ctx.restore();
    if (t < 55.6) { /* nothing */ }
    return;
  }
  // flat Mercator
  const e = oel(prog(t, K.flatten, K.flatten + 0.9));
  const sy = lerp(0.18, 1, e);
  ctx.save(); ctx.translate(0, 742); ctx.scale(1, sy); ctx.translate(0, -742);
  const proj = mercProj(); const path = d3.geoPath(proj, ctx);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.beginPath(); path(GEO.grat); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,209,102,0.5)'; ctx.setLineDash([10, 10]); ctx.beginPath(); ctx.moveTo(0, 742); ctx.lineTo(W, 742); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#ecdfbd'; ctx.beginPath(); path(GEO.land); ctx.fill(); ctx.strokeStyle = '#a8916a'; ctx.stroke();
  const af = oc(prog(t, 62.2, 62.8));
  if (af > 0) { ctx.fillStyle = `rgba(255,170,60,${0.9 * af})`; ctx.beginPath(); path(GEO.africa); ctx.fill(); }
  // Greenland: breathing, then dragged to the equator
  const gc = proj([-41, 73]);
  const breathe = t > 58.6 && t < 66 ? 1 + 0.07 * Math.sin((t - 58.6) * 7) * Math.min(1, (t - 58.6)) : 1;
  const mv = ioc(prog(t, K.shrinkStart, K.shrinkEnd));
  if (mv > 0) { ctx.save(); ctx.setLineDash([8, 8]); ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 2.5; ctx.beginPath(); path(GEO.greenland); ctx.stroke(); ctx.restore(); }
  ctx.save();
  if (breathe !== 1) { ctx.translate(gc[0], gc[1]); ctx.scale(breathe, breathe); ctx.translate(-gc[0], -gc[1]); }
  ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); path(mv > 0 ? moveGeo(GEO.greenland, GL_A, d3.geoInterpolate(GL_A, GL_B)(mv)) : GEO.greenland); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  ctx.restore();
  // labels
  const label = (txt, x, y, col, a, size = 40) => { if (a <= 0) return; ctx.save(); ctx.globalAlpha = a; ctx.font = `${size}px Sans9`; const w = ctx.measureText(txt).width; rrect(ctx, x - w / 2 - 18, y - size * 0.8, w + 36, size * 1.5, 12); ctx.fillStyle = col; ctx.fill(); ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y - size * 0.05); ctx.restore(); };
  if (t > 58.6 && mv === 0) { emoji(ctx, '😎', gc[0] + 170, gc[1] - 30 + Math.sin(t * 5) * 6, 84 * ob(prog(t, 58.6, 59))); }
  const ac = proj([20, 5]);
  if (t > 62.4 && t < 70) emoji(ctx, '😤', ac[0] + 170, ac[1] - 120, 84 * ob(prog(t, 62.4, 62.8)));
  label('格陵兰 216 万 km²', gc[0], gc[1] + 140, '#ff8a8a', oc(prog(t, 63.0, 63.4)) * (1 - prog(t, 66, 66.3)), 34);
  const al = proj([-36, -8]); label('非洲 3037 万 km²', al[0], al[1], '#ffc06b', oc(prog(t, 63.3, 63.7)), 34);
  if (t > K.shrinkEnd) {
    const gp = proj([GL_B[0], GL_B[1] - 2]);
    label('← 真实大小', gp[0] + 210, gp[1] - 10, '#ffffff', oc(prog(t, K.shrinkEnd, K.shrinkEnd + 0.3)), 32);
    emoji(ctx, '😳', gp[0] - 10, gp[1] - 110, 70 * ob(prog(t, K.shrinkEnd, K.shrinkEnd + 0.4)));
  }
  ctx.save(); ctx.font = '26px Sans4'; ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText('MERCATOR · EPSG:3857 · 面积随纬度 sec²φ 膨胀', 60, H - 40); ctx.restore();
};

// Snow: streets + deaths
const SNOW = (() => {
  const r = rng(54);
  const hs = [150, 300, 435, 570, 700, 840, 970].map((y, i) => ({ y, tilt: (r() - 0.5) * 0.06 }));
  const vs = [170, 350, 520, 700, 880, 1060, 1250, 1430, 1610, 1780].map(x => ({ x, tilt: (r() - 0.5) * 0.08 }));
  const segs = [];
  hs.forEach(h => segs.push([[0, h.y - h.tilt * 960], [W, h.y + h.tilt * 960]]));
  vs.forEach((v, vi) => { for (let k = 0; k < hs.length - 1; k++) { if (r() < 0.22 && vi % 3) continue; const ya = hs[k].y, yb = hs[k + 1].y; segs.push([[v.x + v.tilt * (ya - 540), ya], [v.x + v.tilt * (yb - 540), yb]]); } });
  const pump = [900, 570 + hs[3].tilt * (900 - 960)];
  const pumps = [[350, 300], [1250, 300], [520, 840], [1430, 700], [1610, 435], [170, 700], [1060, 970]];
  const bars = [];
  for (const [a, b] of segs) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len, nx = -uy, ny = ux;
    for (let s = 30; s < len - 30; s += 19) for (const side of [-1, 1]) {
      const hx = a[0] + ux * s + nx * side * 20, hy = a[1] + uy * s + ny * side * 20;
      const d = Math.hypot(hx - pump[0], hy - pump[1]);
      const lam = 6 * Math.exp(-d * d / (2 * 150 * 150)) + 0.03;
      const n = Math.floor(lam + r() * 0.9);
      for (let q = 0; q < Math.min(n, 9); q++) bars.push({ x: hx + nx * side * q * 6, y: hy + ny * side * q * 6, ux, uy, rt: K.snowDeathsA + (K.snowDeathsB - K.snowDeathsA) * Math.pow(r(), 0.8) });
    }
  }
  return { segs, pump, pumps, bars, hs };
})();
S.snow = t => {
  const zp = ioc(prog(t, K.pumpReveal, K.pumpReveal + 2.0)) * (1 - ioc(prog(t, 84.6, 85.8)));
  const z = lerp(1, 1.5, zp);
  ctx.save();
  ctx.translate(960, 540); ctx.scale(z, z); ctx.translate(-lerp(960, SNOW.pump[0], zp), -lerp(540, SNOW.pump[1] + 40, zp));
  ctx.drawImage(TX.sepia, -100, -60, W + 200, H + 120);
  // blocks hatch
  ctx.strokeStyle = 'rgba(110,80,40,0.12)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = -200; x < W + 200; x += 9) { ctx.moveTo(x, -60); ctx.lineTo(x + 300, H + 60); } ctx.stroke();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#5e4a30'; ctx.lineWidth = 32; ctx.beginPath(); for (const [a, b] of SNOW.segs) { ctx.moveTo(...a); ctx.lineTo(...b); } ctx.stroke();
  ctx.strokeStyle = '#efe2c2'; ctx.lineWidth = 26; ctx.beginPath(); for (const [a, b] of SNOW.segs) { ctx.moveTo(...a); ctx.lineTo(...b); } ctx.stroke();
  ctx.save(); ctx.font = 'italic 22px Serif9'; ctx.fillStyle = '#4a3a24'; ctx.letterSpacing = '6px';
  const lbl = (txt, x, hi) => { const h = SNOW.hs[hi]; ctx.save(); ctx.translate(x, h.y + h.tilt * (x - 960)); ctx.rotate(Math.atan(h.tilt)); ctx.fillText(txt, 0, 8); ctx.restore(); };
  lbl('BROAD  STREET', 560, 3); lbl('OXFORD  STREET', 700, 0); lbl('GREAT  MARLBOROUGH  ST.', 300, 1); lbl('BREWER  STREET', 1200, 5);
  ctx.restore();
  // deaths
  ctx.fillStyle = '#1b1208';
  for (const b of SNOW.bars) { if (t < b.rt) continue; const p = oc(prog(t, b.rt, b.rt + 0.15)); ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.uy, b.ux)); ctx.fillRect(-7 * p, -2.2, 14 * p, 4.4); ctx.restore(); }
  // glow
  const gp = prog(t, K.pumpReveal, K.pumpReveal + 1.2);
  if (gp > 0) { const gr = ctx.createRadialGradient(SNOW.pump[0], SNOW.pump[1], 0, SNOW.pump[0], SNOW.pump[1], 380 * oc(gp)); gr.addColorStop(0, `rgba(220,30,20,${0.45 * gp})`); gr.addColorStop(1, 'rgba(220,30,20,0)'); ctx.fillStyle = gr; ctx.fillRect(SNOW.pump[0] - 400, SNOW.pump[1] - 400, 800, 800); }
  // pumps
  const pumpIcon = (x, y, hl, handle = true) => {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = hl ? '#a3150c' : '#2d2a7a'; ctx.strokeStyle = '#111'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, hl ? 18 : 12, 0, 7); ctx.fill(); ctx.stroke();
    if (hl) { ctx.fillStyle = '#fff'; ctx.font = '20px Sans9'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('P', 0, 1); }
    if (handle) { ctx.strokeStyle = '#111'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(14, -10); ctx.lineTo(44, -34); ctx.stroke(); }
    ctx.restore();
  };
  SNOW.pumps.forEach(p => { ctx.globalAlpha = 1 - 0.6 * gp; pumpIcon(p[0], p[1], false); ctx.globalAlpha = 1; });
  pumpIcon(SNOW.pump[0], SNOW.pump[1], gp > 0, t < K.handleOff);
  if (t >= K.handleOff) {
    const d = t - K.handleOff, hx = SNOW.pump[0] + 29 + 340 * d, hy = SNOW.pump[1] - 22 - 700 * d + 900 * d * d;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(d * 14); ctx.strokeStyle = '#111'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-19, 12); ctx.lineTo(19, -12); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.globalAlpha = 1 - prog(d, 0, 0.5); ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 4;
    for (let i = 0; i < 8; i++) { const a = i * 0.785, r0 = 20 + d * 120, r1 = r0 + 22; ctx.beginPath(); ctx.moveTo(SNOW.pump[0] + 29 + Math.cos(a) * r0, SNOW.pump[1] - 22 + Math.sin(a) * r0); ctx.lineTo(SNOW.pump[0] + 29 + Math.cos(a) * r1, SNOW.pump[1] - 22 + Math.sin(a) * r1); ctx.stroke(); }
    ctx.restore();
  }
  if (gp > 0) { ctx.save(); ctx.globalAlpha = oc(gp); ctx.font = '30px Sans9'; rrect(ctx, SNOW.pump[0] - 78, SNOW.pump[1] - 92, 156, 48, 10); ctx.fillStyle = '#7a0e08'; ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('宽街水泵', SNOW.pump[0], SNOW.pump[1] - 57); ctx.restore(); }
  ctx.restore();
  if (t > K.snowStamp) {
    const p = prog(t, K.snowStamp, K.snowStamp + 0.18);
    ctx.save(); ctx.translate(1450, 250); ctx.rotate(-0.12); const sc = lerp(2, 1, oc(p)); ctx.scale(sc, sc); ctx.globalAlpha = clamp(p * 2) * 0.9;
    ctx.strokeStyle = '#b3160c'; ctx.lineWidth = 9; rrect(ctx, -300, -80, 600, 160, 12); ctx.stroke();
    ctx.fillStyle = '#b3160c'; ctx.font = '84px Huang'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('空间分析 · 诞生', 0, 4); ctx.restore();
  }
};

const TOB = (() => { const r = rng(91), pts = []; for (let i = 0; i < 140; i++) pts.push([r() * W, r() * H, r() * 6.28, 0.5 + r()]); const edges = []; for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]); if (d < 280) edges.push([i, j, d]); } return { pts, edges }; })();
const TASKS = officeTasks();
S.tob = t => {
  if (t < K.officeStart) {
    ctx.fillStyle = '#060a16'; ctx.fillRect(0, 0, W, H);
    const P = TOB.pts.map(([x, y, ph, sp]) => [x + Math.sin(t * 0.6 * sp + ph) * 14, y + Math.cos(t * 0.5 * sp + ph) * 14]);
    for (const [i, j, d] of TOB.edges) { const w = Math.exp(-d / 85); ctx.strokeStyle = `rgba(90,200,255,${0.85 * w})`; ctx.lineWidth = 0.5 + 4 * w; ctx.beginPath(); ctx.moveTo(...P[i]); ctx.lineTo(...P[j]); ctx.stroke(); }
    TOB.edges.forEach(([i, j, d], k) => { if (k % 7 || d > 160) return; const f = ((t * 0.9 + k * 0.137) % 1); ctx.fillStyle = 'rgba(255,230,140,0.9)'; ctx.beginPath(); ctx.arc(lerp(P[i][0], P[j][0], f), lerp(P[i][1], P[j][1], f), 3, 0, 7); ctx.fill(); });
    for (const [x, y] of P) { ctx.fillStyle = '#e6f6ff'; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); }
    const band = ctx.createLinearGradient(0, H / 2 - 260, 0, H / 2 + 260); band.addColorStop(0, 'rgba(6,10,22,0)'); band.addColorStop(0.3, 'rgba(6,10,22,0.85)'); band.addColorStop(0.7, 'rgba(6,10,22,0.85)'); band.addColorStop(1, 'rgba(6,10,22,0)');
    ctx.fillStyle = band; ctx.fillRect(0, H / 2 - 260, W, 520);
    ctx.save(); ctx.globalAlpha = oc(prog(t, 88, 89)); ctx.font = '40px VT'; ctx.fillStyle = 'rgba(140,210,255,0.8)'; ctx.textAlign = 'center'; ctx.fillText('w(i,j) = exp( −d(i,j) / σ )', W / 2, H - 120); ctx.restore();
    if (t > K.officeStart - 0.4) { ctx.fillStyle = `rgba(238,241,245,${prog(t, K.officeStart - 0.4, K.officeStart)})`; ctx.fillRect(0, 0, W, H); }
    return;
  }
  // office floor plan
  ctx.fillStyle = '#eef1f5'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(80,110,160,0.13)'; ctx.lineWidth = 1; ctx.beginPath(); for (let x = 0; x < W; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, H); } for (let y = 0; y < H; y += 40) { ctx.moveTo(0, y); ctx.lineTo(W, y); } ctx.stroke();
  ctx.save(); ctx.font = '54px Huang'; ctx.fillStyle = '#1e293b'; ctx.textAlign = 'center'; ctx.globalAlpha = oc(prog(t, K.officeStart, K.officeStart + 0.4)); ctx.fillText('地理学第一定律 · 办公室版', W / 2, 150); ctx.restore();
  const count = DESKS.map(() => 0); for (const k of TASKS) if (t >= k.arrive) count[k.desk]++;
  // influence lines
  DESKS.forEach(([x, y], i) => { const w = Math.exp(-Math.hypot(x - BOSS[0], y - BOSS[1]) / 150); ctx.strokeStyle = `rgba(220,38,38,${0.15 + 0.6 * w})`; ctx.lineWidth = 1 + 10 * w; ctx.setLineDash([12, 10]); ctx.lineDashOffset = -t * 40; ctx.beginPath(); ctx.moveTo(...BOSS); ctx.lineTo(x, y); ctx.stroke(); });
  ctx.setLineDash([]);
  // boss
  ctx.fillStyle = '#c9a26b'; rrect(ctx, BOSS[0] - 100, BOSS[1] - 70, 200, 140, 14); ctx.fill(); ctx.strokeStyle = '#8a6a3b'; ctx.lineWidth = 3; ctx.stroke();
  emoji(ctx, '👔', BOSS[0], BOSS[1] - 8, 70); ctx.fillStyle = '#1e293b'; ctx.font = '32px Sans9'; ctx.textAlign = 'center'; ctx.fillText('领导', BOSS[0], BOSS[1] + 110);
  DESKS.forEach(([x, y], i) => {
    const heat = clamp(count[i] / 12);
    ctx.fillStyle = `rgb(${lerp(226, 254, heat)},${lerp(232, 160, heat)},${lerp(240, 150, heat)})`; rrect(ctx, x - 80, y - 50, 160, 100, 10); ctx.fill(); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#334155'; ctx.fillRect(x - 30, y - 42, 60, 10);
    const stack = Math.min(count[i], 19);
    for (let s = 0; s < stack; s++) { ctx.fillStyle = s % 2 ? '#fff' : '#f1f5f9'; ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1; ctx.fillRect(x + 10 + Math.sin(s * 2.1) * 3, y + 30 - s * 5, 46, 10); ctx.strokeRect(x + 10 + Math.sin(s * 2.1) * 3, y + 30 - s * 5, 46, 10); }
    if (count[i]) { ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.arc(x + 70, y - 46, 20, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '22px Sans9'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(count[i], x + 70, y - 45); ctx.textBaseline = 'alphabetic'; }
  });
  const [yx, yy] = DESKS[YOU];
  ctx.fillStyle = '#2563eb'; rrect(ctx, yx - 44, yy + 58, 88, 40, 20); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '26px Sans9'; ctx.textAlign = 'center'; ctx.fillText('你', yx, yy + 88);
  emoji(ctx, count[YOU] > 12 ? '😭' : count[YOU] > 5 ? '😰' : '🙂', yx - 40, yy - 2 + (count[YOU] > 12 ? Math.sin(t * 20) * 3 : 0), 52);
  const far = DESKS.length - 1; emoji(ctx, '😎', DESKS[far][0] - 40, DESKS[far][1], 48); emoji(ctx, '☕', DESKS[far][0] + 30, DESKS[far][1] + 4, 36);
  for (const k of TASKS) {
    if (t < k.emit || t > k.arrive) continue;
    const p = (t - k.emit) / (k.arrive - k.emit), [dx, dy] = DESKS[k.desk];
    emoji(ctx, '📄', lerp(BOSS[0], dx + 30, p), lerp(BOSS[1], dy + 10, p) - Math.sin(p * Math.PI) * (90 + k.wob * 80), 40);
  }
};

S.gps = t => {
  if (t < 102) {
    ctx.fillStyle = '#02030a'; ctx.fillRect(0, 0, W, H);
    for (const [x, y, r, ph, b] of TX.stars) { ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * b * (0.6 + 0.4 * Math.sin(t * 2 + ph))})`; ctx.fillRect(x, y, r, r); }
    const { proj } = drawEarth(ctx, [-105 - (t - 98) * 1.5, 16], 960, 1950, 1500, { noClouds: false, cloudShift: (t - 98) * 2 });
    const P = proj([116.4, 39.9]);
    const sats = [[330 + (t - 98) * 18, 160], [1560 - (t - 98) * 14, 120], [1010 + (t - 98) * 8, 70]];
    sats.forEach(([sx, sy], i) => {
      const ts = K.pings[i], p = oc(prog(t, ts, ts + 0.8)), R = Math.hypot(sx - P[0], sy - P[1]);
      if (p > 0) { ctx.strokeStyle = `rgba(124,255,196,${0.8 - 0.4 * p})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, R * p, 0, 7); ctx.stroke(); ctx.strokeStyle = 'rgba(124,255,196,0.12)'; ctx.lineWidth = 30; ctx.stroke(); }
      emoji(ctx, '🛰️', sx, sy, 64);
    });
    if (t > K.lock) {
      const p = oc(prog(t, K.lock, K.lock + 0.4)), s = lerp(160, 40, p);
      ctx.save(); ctx.translate(...P); ctx.rotate((1 - p) * 1.5); ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 5;
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(s, s - 20); ctx.lineTo(s, s); ctx.lineTo(s - 20, s); ctx.stroke(); }
      ctx.restore(); ctx.fillStyle = '#ff3b3b'; ctx.beginPath(); ctx.arc(...P, 7, 0, 7); ctx.fill();
      ctx.save(); ctx.globalAlpha = p; ctx.font = '52px VT, Sans4'; const lw = ctx.measureText('LOCK ✓  WGS-84  ±3 m').width; rrect(ctx, P[0] + 60, P[1] - 120, lw + 40, 68, 10); ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fill(); ctx.fillStyle = '#7cffc4'; ctx.fillText('LOCK ✓  WGS-84  ±3 m', P[0] + 80, P[1] - 70); ctx.restore();
    }
    return;
  }
  // flat street map
  const mp = ctx; mp.fillStyle = '#f1efe9'; mp.fillRect(0, 0, W, H);
  mp.fillStyle = '#cfe8c4'; mp.beginPath(); mp.roundRect(180, 120, 420, 300, 30); mp.fill();
  mp.fillStyle = '#aad3f2'; mp.beginPath(); mp.ellipse(1340, 700, 260, 150, -0.2, 0, 7); mp.fill();
  mp.fillStyle = '#e4e1da'; for (let i = 0; i < 40; i++) { const r = rng(i)(); mp.fillRect(80 + (i % 8) * 230, 80 + Math.floor(i / 8) * 200, 160 + r * 30, 120); }
  mp.lineCap = 'round';
  const roads = [[[0, 470], [W, 470]], [[0, 880], [W, 880]], [[820, 0], [820, H]], [[1500, 0], [1500, H]], [[0, 1080], [1300, 0]]];
  mp.strokeStyle = '#d6d2c8'; mp.lineWidth = 46; mp.beginPath(); roads.forEach(([a, b]) => { mp.moveTo(...a); mp.lineTo(...b); }); mp.stroke();
  mp.strokeStyle = '#ffffff'; mp.lineWidth = 38; mp.beginPath(); roads.forEach(([a, b]) => { mp.moveTo(...a); mp.lineTo(...b); }); mp.stroke();
  mp.strokeStyle = '#ffd27a'; mp.lineWidth = 46; mp.beginPath(); mp.moveTo(0, 470); mp.lineTo(W, 470); mp.stroke(); mp.strokeStyle = '#ffe7b3'; mp.lineWidth = 36; mp.stroke();
  mp.font = '26px Sans4'; mp.fillStyle = '#7a756a'; mp.fillText('中关村大街', 1000, 480); mp.fillText('湖', 1330, 712);
  const A = [820, 470], B = [1330, 700];
  const m1 = ioc(prog(t, K.drift, K.drift + 1.3)), m2 = ioc(prog(t, K.drift2, K.drift2 + 0.5));
  const jitter = t > K.drift - 0.3 && t < K.drift ? Math.sin(t * 90) * 6 : 0;
  const px = lerp(A[0], B[0], m1) + m2 * 30 + jitter, py = lerp(A[1], B[1], m1) + m2 * 20;
  if (m1 > 0) {
    mp.save(); mp.strokeStyle = '#e11d48'; mp.setLineDash([14, 12]); mp.lineWidth = 4; mp.beginPath(); mp.moveTo(...A); mp.lineTo(px, py); mp.stroke(); mp.restore();
    mp.save(); mp.globalAlpha = m1; mp.font = '34px Sans9'; mp.fillStyle = '#e11d48'; mp.fillText('偏移 ≈ 500 m', lerp(A[0], B[0], 0.5) + 30, lerp(A[1], B[1], 0.5) - 20); mp.restore();
    // ghost at the true spot
    mp.strokeStyle = '#1d4ed8'; mp.lineWidth = 4; mp.beginPath(); mp.arc(...A, 16, 0, 7); mp.stroke(); mp.font = '24px Sans9'; mp.fillStyle = '#1d4ed8'; mp.fillText('真实位置 WGS-84', A[0] - 210, A[1] - 26);
  }
  if (m1 >= 1) { for (let i = 0; i < 3; i++) { const d = ((t - K.drift - 1.3) * 1.2 + i * 0.33) % 1; mp.strokeStyle = `rgba(30,100,200,${1 - d})`; mp.lineWidth = 3; mp.beginPath(); mp.ellipse(px, py + 6, 30 + d * 90, (30 + d * 90) * 0.45, 0, 0, 7); mp.stroke(); } }
  // pin
  mp.save(); mp.translate(px, py); mp.fillStyle = 'rgba(0,0,0,0.25)'; mp.beginPath(); mp.ellipse(0, 4, 18, 7, 0, 0, 7); mp.fill();
  mp.fillStyle = '#ef4444'; mp.beginPath(); mp.moveTo(0, 0); mp.bezierCurveTo(-30, -40, -34, -60, -34, -74); mp.arc(0, -74, 34, Math.PI, 0); mp.bezierCurveTo(34, -60, 30, -40, 0, 0); mp.fill();
  mp.fillStyle = '#fff'; mp.beginPath(); mp.arc(0, -74, 13, 0, 7); mp.fill(); mp.restore();
  if (m1 < 0.2) { mp.save(); mp.font = '30px Sans9'; mp.fillStyle = '#111'; rrect(mp, px + 40, py - 140, 170, 56, 28); mp.fillStyle = '#fff'; mp.fill(); mp.strokeStyle = '#ccc'; mp.stroke(); mp.fillStyle = '#111'; mp.fillText('你在这里', px + 62, py - 101); mp.restore(); }
  // Mars
  const ma = oc(prog(t, K.drift, K.drift + 0.6));
  if (ma > 0) {
    mp.save(); mp.translate(lerp(2100, 1690, ma), 210); mp.rotate(t * 0.3);
    const g = mp.createRadialGradient(-30, -30, 10, 0, 0, 120); g.addColorStop(0, '#ff9a5a'); g.addColorStop(1, '#a3331c'); mp.fillStyle = g; mp.beginPath(); mp.arc(0, 0, 120, 0, 7); mp.fill();
    mp.fillStyle = 'rgba(90,20,10,0.35)'; [[30, 20, 22], [-40, 40, 14], [-20, -50, 18], [50, -40, 10]].forEach(([x, y, r]) => { mp.beginPath(); mp.arc(x, y, r, 0, 7); mp.fill(); });
    mp.restore(); mp.save(); mp.globalAlpha = ma; mp.font = '38px Sans9'; mp.fillStyle = '#a3331c'; mp.textAlign = 'center'; mp.fillText('GCJ-02 · 火星坐标系', 1690, 380); mp.restore();
  }
  if (t > 105) {
    emoji(mp, '🧑‍💻', A[0], A[1] - 10, 80 * ob(prog(t, 105, 105.3)));
    for (let i = 0; i < 3; i++) { const a = ob(prog(t, 105 + i * 0.33, 105.3 + i * 0.33)); if (a <= 0) continue; mp.save(); mp.translate(A[0] - 90 + i * 90, A[1] - 110 - i * 14); mp.scale(a, a); mp.rotate((i - 1) * 0.25); mp.font = '90px Kuai'; mp.fillStyle = '#7c3aed'; mp.textAlign = 'center'; mp.fillText('？', 0, 0); mp.restore(); }
  }
};

const MONTAGE = [['title', 15.5], ['baby', 36], ['pei', 51], ['merc', 60.5], ['snow', 83.8], ['tob', 96.8], ['gps', 104.5], ['merc', 69.8]];
S.montage = t => {
  const i = Math.min(MONTAGE.length - 1, Math.floor((t - 108) / 0.25));
  const [nm, lt] = MONTAGE[i];
  S[nm](lt + (t - 108 - i * 0.25));
  glitchSlices(40 + i * 12, i * 13 + Math.floor(t * 24), 10 + i * 2);
  ctx.fillStyle = `rgba(0,0,0,${0.15 + 0.1 * i})`; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.font = '120px Pixel'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(78,240,255,0.85)'; ctx.globalAlpha = Math.floor(t * 8) % 2 ? 0.9 : 0.4;
  ctx.fillText(['LOAD', 'ING', 'ALL', 'MAPS', '5000', 'YEARS', '...', 'OK'][i], W / 2, H / 2); ctx.restore();
};

const FIB = (() => { const n = 1100, pts = []; const ga = Math.PI * (3 - Math.sqrt(5)); for (let i = 0; i < n; i++) { const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = ga * i; pts.push([Math.cos(th) * r, y, Math.sin(th) * r]); } const nb = pts.map((p, i) => { const d = pts.map((q, j) => [j, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2]).sort((a, b) => a[1] - b[1]); return [d[1][0], d[2][0], d[3][0]]; }); return { pts, nb }; })();
S.agi = t => {
  ctx.fillStyle = '#01030a'; ctx.fillRect(0, 0, W, H);
  // perspective grid floor
  ctx.save(); ctx.strokeStyle = 'rgba(78,240,255,0.18)'; ctx.lineWidth = 1.5; ctx.beginPath();
  for (let i = -20; i <= 20; i++) { ctx.moveTo(960 + i * 30, 700); ctx.lineTo(960 + i * 260, H); }
  for (let k = 0; k < 12; k++) { const z = ((k + (t * 1.2) % 1) / 12); const y = 700 + Math.pow(z, 2.2) * 380; ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke(); ctx.restore();
  const big = t > K.paper - 0.1 && t < 121.9;
  const boost = Math.exp(-Math.max(0, t - K.paper) * 2) * (t >= K.paper ? 1 : 0);
  const cx = 960, cy = 470, R = 320 * (1 + 0.15 * boost) * oc(prog(t, 110, 110.6));
  const gl = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.8); gl.addColorStop(0, `rgba(78,240,255,${0.2 + 0.3 * boost})`); gl.addColorStop(1, 'rgba(78,240,255,0)'); ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
  const ay = t * 0.45, tilt = 0.35, ca = Math.cos(ay), sa = Math.sin(ay), ct = Math.cos(tilt), st = Math.sin(tilt);
  const P = FIB.pts.map(([x, y, z]) => { const x1 = x * ca + z * sa, z1 = -x * sa + z * ca; const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct; const f = 1 / (1 + z2 * 0.35); return [cx + x1 * R * f, cy + y2 * R * f, z2, y]; });
  ctx.globalAlpha = big ? 0.45 : 1;
  ctx.lineWidth = 1;
  P.forEach((p, i) => { if (p[2] > 0.3) return; for (const j of FIB.nb[i]) { const q = P[j]; const a = 0.35 * (1 - (p[2] + 1) / 1.3); ctx.strokeStyle = `rgba(120,200,255,${a})`; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); } });
  P.forEach(p => { const d = (1 - p[2]) / 2, wave = Math.sin(p[3] * 8 - t * 5) > 0.92 ? 1 : 0; const hue = lerp(185, 310, (p[3] + 1) / 2); ctx.fillStyle = `hsla(${hue},100%,${60 + 30 * wave}%,${0.25 + 0.75 * d})`; ctx.beginPath(); ctx.arc(p[0], p[1], 1 + 2.6 * d + wave * 2, 0, 7); ctx.fill(); });
  // orbit rings
  ctx.strokeStyle = 'rgba(255,78,205,0.5)'; ctx.lineWidth = 2;
  for (let k = 0; k < 3; k++) { ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * (0.2 + k * 0.13) + k); ctx.beginPath(); ctx.ellipse(0, 0, R * (1.3 + k * 0.12), R * (0.32 + k * 0.08), 0, 0, 7); ctx.stroke(); ctx.restore(); }
  ctx.globalAlpha = 1;
  if (boost > 0.01) { ctx.strokeStyle = `rgba(255,255,255,${boost})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, R * (1 + (1 - boost) * 3), 0, 7); ctx.stroke(); }
  // HUD
  ctx.save(); ctx.font = '30px VT'; ctx.fillStyle = 'rgba(78,240,255,0.7)';
  const hud = [`PARAMS ........ ∞`, `TOKENS/S ...... ${(9.2e9 + Math.floor(t * 1e7)).toExponential(3)}`, `GPU TEMP ...... ${(70 + Math.sin(t) * 3).toFixed(1)}°C`, `CARTOGRAPHERS . 6/6 ONLINE`, `COFFEE ........ N/A`];
  hud.forEach((s, i) => ctx.fillText(s, 70, H - 300 + i * 40));
  ctx.textAlign = 'right'; ['MODE: OMNISCIENT', 'PAPER: UNLIMITED', `T+${(t - 110).toFixed(2)}s`].forEach((s, i) => ctx.fillText(s, W - 70, H - 260 + i * 40));
  ctx.restore();
};

let EARTH_BUF;
S.build = t => {
  ctx.fillStyle = '#01030a'; ctx.fillRect(0, 0, W, H);
  for (const [x, y, r, ph, b] of TX.stars) { ctx.fillStyle = `rgba(255,255,255,${0.2 + 0.4 * b})`; ctx.fillRect(x, y, r, r); }
  const rot = [-(t - 110) * 6 - 60, -15], cx = 960, cy = 500, R = 400;
  // real earth in buffer
  const eg = EARTH_BUF.getContext('2d'); eg.clearRect(0, 0, W, H);
  drawEarth(eg, rot, cx, cy, R, { cloudShift: (t - 110) * 1.5 });
  // wireframe base
  const proj = d3.geoOrthographic().scale(R).translate([cx, cy]).rotate(rot).clipAngle(90).precision(0.6), path = d3.geoPath(proj, ctx);
  ctx.fillStyle = '#04121f'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(78,240,255,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); path(GEO.grat); ctx.stroke();
  ctx.strokeStyle = 'rgba(78,240,255,0.8)'; ctx.lineWidth = 1.3; ctx.beginPath(); path(GEO.land); ctx.stroke();
  // revealed tiles
  ctx.save(); ctx.beginPath(); let n = 0;
  for (const tl of GEO.tiles) if (t >= tl.rt) { path(tl.geo); n++; }
  ctx.clip(); ctx.drawImage(EARTH_BUF, 0, 0); ctx.restore();
  ctx.beginPath(); for (const tl of GEO.tiles) if (t >= tl.rt && t < tl.rt + 0.35) path(tl.geo);
  ctx.fillStyle = 'rgba(78,240,255,0.55)'; ctx.fill();
  if (t < K.done) { ctx.strokeStyle = 'rgba(78,240,255,0.25)'; ctx.lineWidth = 0.8; ctx.beginPath(); for (const tl of GEO.tiles) if (t >= tl.rt) path(tl.geo); ctx.stroke(); }
  else ctx.drawImage(EARTH_BUF, 0, 0);
  // atmosphere on top (from buffer edge)
  // HUD
  const scales = ['1 : 10,000,000', '1 : 1,000,000', '1 : 100,000', '1 : 10,000', '1 : 1,000', '1 : 100', '1 : 1'];
  let si = 0; K.scaleSteps.forEach((s, i) => { if (t >= s) si = i + 1; });
  const since = t - (si ? K.scaleSteps[si - 1] : 122);
  ctx.save(); ctx.textAlign = 'right'; ctx.font = '34px Sans9'; ctx.fillStyle = 'rgba(160,240,255,0.8)'; ctx.fillText('比例尺', W - 80, 120);
  ctx.font = `${si === 6 ? 110 : 76}px VT`; ctx.fillStyle = si === 6 ? '#ffd166' : '#eaffff'; ctx.shadowColor = '#4ef0ff'; ctx.shadowBlur = 20;
  ctx.fillText(scales[si], W - 80, 210 + (since < 0.15 ? (0.15 - since) * 200 : 0)); ctx.restore();
  if (t > 124.2 && t < K.done + 0.3) {
    ctx.globalAlpha = 1 - prog(t, K.done, K.done + 0.3);
    const tot = GEO.tiles.length, pct = Math.min(100, n / tot * 100);
    ctx.save(); ctx.font = '32px VT, Sans4'; ctx.fillStyle = 'rgba(160,240,255,0.85)';
    ctx.fillText(`已绘制图幅  ${String(n).padStart(3, '0')} / ${tot}`, 80, 120);
    ctx.fillText(`数据量  ${(n * 3.7).toFixed(1)} ZB`, 80, 165);
    ctx.fillText(`要素  全部（包括你家楼下那只猫）`, 80, 210);
    const bw = 900; ctx.strokeStyle = 'rgba(78,240,255,0.7)'; ctx.lineWidth = 2; ctx.strokeRect(W / 2 - bw / 2, 960, bw, 26);
    ctx.fillStyle = '#4ef0ff'; ctx.fillRect(W / 2 - bw / 2 + 4, 964, (bw - 8) * pct / 100, 18);
    ctx.textAlign = 'center'; ctx.fillText(pct >= 100 ? '渲染完成 100%' : `渲染中 ${pct.toFixed(4)}%`, W / 2, 1030);
    ctx.restore(); ctx.globalAlpha = 1;
  }
};
S.silence = t => {
  ctx.fillStyle = '#01030a'; ctx.fillRect(0, 0, W, H);
  for (const [x, y, r, ph, b] of TX.stars) { ctx.fillStyle = `rgba(255,255,255,${0.2 + 0.45 * b * (0.7 + 0.3 * Math.sin(t + ph))})`; ctx.fillRect(x, y, r, r); }
  const R = lerp(400, 300, oc(prog(t, 132, 134)));
  drawEarth(ctx, [-(t - 110) * 6 - 60, -15], 960, 540, R, { cloudShift: (t - 110) * 1.5 });
  const lab = (txt, x, y, tx, ty, t0, col) => {
    const a = ob(prog(t, t0, t0 + 0.4)); if (a <= 0) return;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.globalAlpha = clamp(a);
    ctx.beginPath(); ctx.moveTo(x, y + 40); ctx.quadraticCurveTo((x + tx) / 2, y + 200, tx, ty); ctx.stroke();
    const ang = Math.atan2(ty - (y + 200), tx - (x + tx) / 2); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - 26 * Math.cos(ang - 0.4), ty - 26 * Math.sin(ang - 0.4)); ctx.lineTo(tx - 26 * Math.cos(ang + 0.4), ty - 26 * Math.sin(ang + 0.4)); ctx.fill();
    ctx.translate(x, y); ctx.scale(a, a); ctx.font = '64px Kuai'; ctx.textAlign = 'center'; ctx.fillText(txt, 0, 0); ctx.restore();
  };
  lab('地图（1 : 1）', 400, 330, 680, 470, 133.0, '#4ef0ff');
  lab('地球', 1530, 330, 1240, 470, 133.8, '#ffd166');
};

S.doc = t => {
  const bg = ctx.createRadialGradient(960, 400, 100, 960, 540, 1100); bg.addColorStop(0, '#4a3b2e'); bg.addColorStop(1, '#16110c'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const py = lerp(1100, 50, oc(prog(t, 142, 142.7)));
  ctx.save(); ctx.translate(460, py); ctx.rotate(-0.012);
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18; ctx.fillStyle = '#fbfaf5'; ctx.fillRect(0, 0, 1000, 1250); ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.font = '50px Serif9'; ctx.fillText('科技计划项目申报书', 500, 105);
  ctx.fillRect(80, 135, 840, 3); ctx.fillRect(80, 142, 840, 1);
  ctx.textAlign = 'left'; ctx.font = '26px Sans4'; ctx.fillStyle = '#333';
  ctx.fillText('项目名称：全球 1:1 全要素无损地图构建关键技术研究与应用', 80, 192);
  ctx.fillText('申报单位：AGI 实验室（筹）', 80, 234);
  ctx.fillText('申请经费：∞ 万元          研究周期：昨天 — 永远', 80, 276);
  ctx.font = '34px Sans9'; ctx.fillStyle = '#111'; ctx.fillText('四、主要技术创新点', 80, 350);
  ctx.font = '32px Sans4'; ctx.fillStyle = '#1a1a1a';
  const docs = CAPS.filter(c => c.style === 'doc');
  let y = 412, hlPos = null;
  docs.forEach(c => {
    const lines = wrap(ctx, c.text, 880), vis = typed(c, t).length;
    lines.forEach(ln => {
      const shown = [...ln.s].slice(0, Math.max(0, vis - ln.start)).join('');
      if (t >= c.t) ctx.fillText(shown, 80, y);
      const k = ln.s.indexOf('国际领先'); if (k >= 0) hlPos = [80 + ctx.measureText(ln.s.slice(0, k)).width, y, ctx.measureText('国际领先').width];
      y += 48;
    });
    y += 16;
  });
  // reviewer: red circle around 国际领先
  if (hlPos && t > 150.4) {
    const p = prog(t, 150.4, 151.1); ctx.strokeStyle = '#d61f1f'; ctx.lineWidth = 4; ctx.beginPath();
    ctx.ellipse(hlPos[0] + hlPos[2] / 2, hlPos[1] - 10, hlPos[2] / 2 + 26, 34, -0.05, -1.2, -1.2 + p * 6.6); ctx.stroke();
  }
  const hand = CAPS.find(c => c.style === 'hand');
  if (t > hand.t) { ctx.save(); ctx.font = '58px Brush'; ctx.fillStyle = '#d61f1f'; ctx.rotate(-0.03); ctx.fillText(typed(hand, t), 90, 690); ctx.restore(); }
  if (t > K.docStamp) {
    const p = prog(t, K.docStamp, K.docStamp + 0.16), sc = lerp(2.6, 1, oc(p));
    ctx.save(); ctx.translate(560, 845); ctx.rotate(-0.2); ctx.scale(sc, sc); ctx.globalAlpha = clamp(p * 2) * 0.88;
    ctx.strokeStyle = '#d61f1f'; ctx.lineWidth = 12; rrect(ctx, -290, -105, 580, 210, 16); ctx.stroke(); ctx.lineWidth = 4; rrect(ctx, -270, -85, 540, 170, 10); ctx.stroke();
    ctx.fillStyle = '#d61f1f'; ctx.font = '138px Huang'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('不予资助', 0, 8);
    ctx.globalCompositeOperation = 'destination-out'; const r = rng(5); for (let i = 0; i < 260; i++) { ctx.beginPath(); ctx.arc(r() * 600 - 300, r() * 220 - 110, r() * 3.5, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  ctx.restore();
};

S.ending = t => {
  ctx.fillStyle = '#000003'; ctx.fillRect(0, 0, W, H);
  for (const [x, y, r, ph, b] of TX.stars) { ctx.fillStyle = `rgba(255,255,255,${0.15 + 0.4 * b * (0.7 + 0.3 * Math.sin(t * 1.5 + ph))})`; ctx.fillRect(x, y, r, r); }
  const p = ioc(prog(t, 154, 160.5));
  const R = 300 * Math.pow(0.006, p), cx = lerp(960, 1290, p), cy = lerp(540, 400, p);
  // sunbeam
  const ba = prog(t, 157.5, 160);
  if (ba > 0) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.5); const g = ctx.createLinearGradient(0, -70, 0, 70);
    g.addColorStop(0, 'rgba(255,220,180,0)'); g.addColorStop(0.5, `rgba(255,220,180,${0.13 * ba})`); g.addColorStop(1, 'rgba(255,220,180,0)'); ctx.fillStyle = g; ctx.fillRect(-2000, -70, 4000, 140); ctx.restore();
  }
  if (R > 3) drawEarth(ctx, [-(t - 110) * 6 - 60, -15], cx, cy, R, { cloudShift: (t - 110) * 1.5 });
  else { const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 12); g.addColorStop(0, 'rgba(190,220,255,1)'); g.addColorStop(0.3, 'rgba(120,170,255,0.6)'); g.addColorStop(1, 'rgba(120,170,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 12, 0, 7); ctx.fill(); }
  if (t > 160.8 && t < 163.4) { ctx.save(); ctx.globalAlpha = oc(prog(t, 160.8, 161.6)) * (1 - prog(t, 163, 163.4)); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 34, 0, 7); ctx.stroke(); ctx.font = '26px Sans4'; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillText('比例尺 1 : 1 —— 我们在这儿', cx + 48, cy + 8); ctx.restore(); }
  const la = oc(prog(t, 163.6, 164.6)) * (1 - prog(t, 165.3, 166));
  if (la > 0) {
    ctx.save(); ctx.globalAlpha = la; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '120px Serif9'; ctx.letterSpacing = '24px'; ctx.fillStyle = '#fff'; ctx.fillText('地图的尽头', W / 2, H / 2 - 30);
    ctx.font = '26px Pixel'; ctx.letterSpacing = '8px'; ctx.fillStyle = '#ffd166'; ctx.fillText('AGI GO GO GO', W / 2, H / 2 + 90);
    ctx.restore();
  }
};

S.post = t => {
  ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, 0, W, H);
  if (t < K.errorDing) return;
  const p = ob(prog(t, K.errorDing, K.errorDing + 0.25));
  ctx.save(); ctx.translate(W / 2, H / 2 - 40); ctx.scale(lerp(0.85, 1, p), lerp(0.85, 1, p)); ctx.globalAlpha = clamp(p * 1.5);
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 40; ctx.fillStyle = '#ffffff'; ctx.fillRect(-420, -170, 840, 340); ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#f3f3f3'; ctx.fillRect(-420, -170, 840, 54); ctx.fillStyle = '#222'; ctx.font = '24px Sans4'; ctx.fillText('ArcGIS Pro', -396, -134); ctx.fillText('✕', 384, -134);
  ctx.fillStyle = '#e81123'; ctx.beginPath(); ctx.arc(-330, -20, 40, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-346, -36); ctx.lineTo(-314, -4); ctx.moveTo(-314, -36); ctx.lineTo(-346, -4); ctx.stroke();
  ctx.fillStyle = '#111'; ctx.font = '34px Sans9'; ctx.fillText('ArcGIS Pro 已停止工作。', -260, -30);
  ctx.fillStyle = '#555'; ctx.font = '26px Sans4'; ctx.fillText('您上次保存是在 3 小时前。', -260, 20);
  const bt = (txt, x, hl) => { ctx.fillStyle = hl ? '#0067c0' : '#fdfdfd'; ctx.strokeStyle = hl ? '#0067c0' : '#bbb'; ctx.lineWidth = 2; rrect(ctx, x, 90, 170, 52, 6); ctx.fill(); ctx.stroke(); ctx.fillStyle = hl ? '#fff' : '#111'; ctx.font = '26px Sans4'; ctx.textAlign = 'center'; ctx.fillText(txt, x + 85, 125); ctx.textAlign = 'left'; };
  bt('关闭程序', 40, true); bt('', 230, false); emoji(ctx, '😭', 315, 116, 34);
  ctx.restore();
  if (t > 172.3) { ctx.fillStyle = `rgba(0,0,0,${prog(t, 172.3, 173)})`; ctx.fillRect(0, 0, W, H); }
};

// ---------- main ----------
function sceneAt(t) { let s = SCENES[0]; for (const sc of SCENES) if (t >= sc[1]) s = sc; return s[0]; }
window.draw = function (t) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.letterSpacing = '0px';
  ctx.clearRect(0, 0, W, H);
  const [sx, sy] = shake(t);
  ctx.translate(sx, sy);
  const nm = sceneAt(t);
  ctx.save(); S[nm](t); ctx.restore();
  ctx.save(); ctx.letterSpacing = '0px'; drawCaps(t); drawCard(t); ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // record scratch freeze-tilt
  if (t > K.scratch && t < 132) { const g = BUF.getContext('2d'); g.clearRect(0, 0, W, H); g.drawImage(cv, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-0.04); ctx.scale(1.08, 1.08); ctx.translate(-W / 2, -H / 2); ctx.filter = 'grayscale(1) contrast(1.2)'; ctx.drawImage(BUF, 0, 0); ctx.restore(); }
  const f = flash(t); if (f > 0) { ctx.fillStyle = `rgba(255,255,255,${f})`; ctx.fillRect(0, 0, W, H); }
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.09; ctx.drawImage(TX.grain[Math.floor(t * 24) % 4], 0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.drawImage(TX.vig, 0, 0);
  // fade in at start
  if (t < 0.4) { ctx.fillStyle = `rgba(0,0,0,${1 - t / 0.4})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
};

(async () => {
  const fams = ['Serif9', 'Sans4', 'Sans9', 'Brush', 'Kuai', 'Huang', 'VT', 'Pixel'];
  await Promise.all(fams.map(f => document.fonts.load(`40px ${f}`, '地图AB1')));
  await document.fonts.load('40px "Noto Color Emoji"', '😎');
  await loadGeo();
  makeTextures();
  BUF = mk(W, H); GLOBE_BUF = mk(W, H); EARTH_BUF = mk(W, H);
  window.READY = true;
})();
