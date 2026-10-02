"""程序化风景插画工具：天空、山脉、积雪、水面倒影、树木、草原、沙丘等图层。"""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 2112, 1188  # 比 1080p 大 10%，留给推拉镜头
Y = np.arange(H, dtype=np.float32)[:, None]
X = np.arange(W, dtype=np.float32)[None, :]


def C(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255


def lerp(a, b, t):
    return a + (b - a) * t


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def vgrad(stops, h=H, w=W):
    t = np.arange(h, dtype=np.float32) / (h - 1)
    pos = [p for p, _ in stops]
    out = np.stack([np.interp(t, pos, [C(c)[k] for _, c in stops]) for k in range(3)], -1)
    return np.repeat(out[:, None, :], w, 1).astype(np.float32)


def noise1(n, seed, octaves=6, base=3, pers=0.5):
    r = np.random.default_rng(seed)
    out = np.zeros(n)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        k = int(base * 2 ** o) + 1
        pts = r.uniform(-1, 1, k + 2)
        xs = np.linspace(0, k, n)
        i = np.floor(xs).astype(int)
        f = xs - i
        f = f * f * (3 - 2 * f)
        out += amp * (pts[i] * (1 - f) + pts[i + 1] * f)
        tot += amp
        amp *= pers
    return (out / tot).astype(np.float32)


def noise2(seed, scale=6, octaves=5, pers=0.5, sx=1.0, sy=1.0, h=H, w=W):
    """二维分形噪声，sx/sy 控制横纵向拉伸。范围约 -1..1"""
    r = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        gw = max(2, int(scale * 2 ** o / sx))
        gh = max(2, int(scale * 2 ** o * h / w / sy))
        g = r.uniform(-1, 1, (gh, gw)).astype(np.float32)
        out += amp * np.asarray(Image.fromarray(g, "F").resize((w, h), Image.BICUBIC))
        tot += amp
        amp *= pers
    return out / tot


def ridge_mask(ridge):
    return np.clip(Y - ridge[None, :] + 0.5, 0, 1)


def paint(img, col, m):
    m = m[..., None]
    return img * (1 - m) + np.asarray(col, np.float32) * m


def peaks(spec, seed, rough=40, base=None):
    """spec: [(cx, top_y, half_width, power)]；返回每列山脊 y"""
    x = np.arange(W, dtype=np.float32)
    ridge = np.full(W, H + 10.0 if base is None else base, np.float32)
    for cx, ty, hw, p in spec:
        bottom = H if base is None else base
        prof = ty + (bottom - ty) * np.clip(np.abs(x - cx) / hw, 0, 1) ** p
        ridge = np.minimum(ridge, prof)
    ridge += rough * noise1(W, seed, octaves=7, base=6, pers=0.55)
    ridge += rough * 0.35 * np.abs(noise1(W, seed + 1, octaves=4, base=30))
    return ridge


def mountain(img, ridge, col, seed, light=(1.25, 0.72), snow_y=None, snow_col="#f4f7fb",
             snow_shadow="#9fb3cc", haze=0.0, haze_col=None, mist=0.0, tex=0.12, strata=0.0, gully_snow=70):
    m = ridge_mask(ridge)
    depth = Y - ridge[None, :]
    slope = np.gradient(ridge)
    slope = np.convolve(slope, np.ones(9) / 9, "same")
    # 用斜率+沟壑噪声近似光照：面向左侧(上升)的坡受光
    gully = noise2(seed + 7, scale=40, octaves=4, sx=0.25, sy=4.0)
    skew = (np.arange(W)[None, :] + depth * 0.6 * np.sign(gully + 0.05)).astype(int)
    lit_col = np.clip(-slope * 1.6, -1, 1)[np.clip(skew, 0, W - 1)]
    lit = lit_col * np.exp(-np.clip(depth, 0, None) / 260) + gully * 0.55
    lit = np.clip(lit, -1, 1)
    shade = np.where(lit > 0, lerp(1.0, light[0], lit), lerp(1.0, light[1], -lit))
    t = noise2(seed + 3, scale=20, octaves=5)
    base = C(col)[None, None, :] * (shade * (1 + tex * t))[..., None]
    if strata:
        s = 0.5 + 0.5 * np.sin(Y * 0.09 + noise2(seed + 9, scale=10, octaves=3) * 6)
        base *= (1 - strata * s)[..., None]
    if snow_y is not None:
        sn = noise2(seed + 5, scale=30, octaves=5)
        snow_line = snow_y + sn * 60 + gully * gully_snow
        sm = smooth(snow_line + 8, snow_line - 8, Y) * m
        sc = lerp(C(snow_shadow)[None, None, :], C(snow_col)[None, None, :],
                  np.clip((lit + 0.9) / 1.6, 0, 1)[..., None])
        base = lerp(base, sc, sm[..., None])
    if haze_col is not None:
        hz = np.clip(haze + mist * smooth(ridge.min() + 120, H * 0.95, Y), 0, 1)[..., None]
        base = lerp(base, C(haze_col)[None, None, :], hz)
    return paint(img, base, m)


def hills(img, ridge, top_col, bot_col, seed, tex=0.08, light=0.25):
    m = ridge_mask(ridge)
    depth = np.clip(Y - ridge[None, :], 0, None)
    span = max(1.0, H - ridge.min())
    g = np.clip(depth / span * 2.0, 0, 1)[..., None]
    col = lerp(C(top_col)[None, None, :], C(bot_col)[None, None, :], g)
    slope = np.convolve(np.gradient(ridge), np.ones(31) / 31, "same")
    sh = 1 + np.clip(-slope * 0.12, -light, light)[None, :] * np.exp(-depth / 200)
    t = noise2(seed, scale=24, octaves=5)
    col = col * (sh * (1 + tex * t))[..., None]
    return paint(img, col, m)


def water(img, wy, tint, strength=0.45, ripple=4.0, seed=1, streak=0.12, dark=0.25):
    out = img.copy()
    ys = np.arange(int(wy), H)
    d = ys - wy
    src = np.clip((2 * wy - ys).astype(int), 0, H - 1)
    rn = noise2(seed, scale=4, octaves=4, sx=8, sy=0.1)
    xoff = (rn[int(wy):] * ripple * (1 + d[:, None] / 60)).astype(int)
    xi = np.clip(np.arange(W)[None, :] + xoff, 0, W - 1)
    refl = img[src[:, None], xi]
    fade = np.clip(d / (H - wy), 0, 1)[:, None, None]
    col = lerp(refl, C(tint)[None, None, :], strength + (1 - strength) * fade * 0.35)
    col *= 1 - dark * fade
    st = noise2(seed + 1, scale=3, octaves=5, sx=10, sy=0.15)[int(wy):]
    col += (np.clip(st, 0, 1) * streak)[..., None]
    out[int(wy):] = col
    # 岸线
    out[int(wy):int(wy) + 2] *= 0.75
    return out


def sky(stops):
    return vgrad(stops)


def sun(img, cx, cy, r, col="#fff3d0", glow=0.6, glow_r=6.0):
    d = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2)
    core = smooth(r + 2, r - 2, d)
    g = glow * np.exp(-d / (r * glow_r))
    c = C(col)[None, None, :]
    img = img + c * g[..., None]
    return paint(np.clip(img, 0, 1.0), c, core)


def stars(img, n, seed, ymax=H, bright=1.0):
    r = np.random.default_rng(seed)
    xs = r.integers(0, W, n)
    ys = r.integers(0, int(ymax), n)
    b = r.uniform(0.2, 1, n) ** 2 * bright
    out = img.copy()
    out[ys, xs] = np.clip(out[ys, xs] + b[:, None], 0, 1)
    big = b > 0.6 * bright
    for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1)):
        yy = np.clip(ys[big] + dy, 0, H - 1)
        xx = np.clip(xs[big] + dx, 0, W - 1)
        out[yy, xx] = np.clip(out[yy, xx] + b[big, None] * 0.4, 0, 1)
    return out


def clouds(img, seed, y0, y1, cover=0.0, col="#ffffff", alpha=0.85, scale=5, shadow="#c9d3e0"):
    n = noise2(seed, scale=scale, octaves=6, sx=2.2, sy=0.7)
    band = smooth(y0 - 60, y0 + 60, Y) * smooth(y1 + 60, y1 - 60, Y)
    a = np.clip((n - cover) * 3.0, 0, 1) * band * alpha
    col_arr = lerp(C(shadow)[None, None, :], C(col)[None, None, :],
                   np.clip(0.4 + (n - cover) * 2.5, 0, 1)[..., None])
    return paint(img, col_arr, a)


class Sketch:
    """2 倍超采样的 PIL 绘制层，用于树木、建筑等矢量元素（抗锯齿）"""

    def __init__(self, s=2):
        self.s = s
        self.mask = Image.new("L", (W * s, H * s), 0)
        self.d = ImageDraw.Draw(self.mask)

    def P(self, pts):
        return [(x * self.s, y * self.s) for x, y in pts]

    def poly(self, pts, v=255):
        self.d.polygon(self.P(pts), fill=v)

    def ellipse(self, x0, y0, x1, y1, v=255):
        self.d.ellipse([x0 * self.s, y0 * self.s, x1 * self.s, y1 * self.s], fill=v)

    def rect(self, x0, y0, x1, y1, v=255):
        self.d.rectangle([x0 * self.s, y0 * self.s, x1 * self.s, y1 * self.s], fill=v)

    def line(self, pts, w, v=255):
        self.d.line(self.P(pts), fill=v, width=max(1, int(w * self.s)), joint="curve")

    def get(self, blur=0):
        m = self.mask.resize((W, H), Image.LANCZOS)
        if blur:
            m = m.filter(ImageFilter.GaussianBlur(blur))
        return np.asarray(m, np.float32) / 255


def spruce_pts(x, y, h, w, r):
    tiers = 7
    left, right = [], []
    for i in range(1, tiers + 1):
        yy = y - h + h * 0.92 * i / tiers
        ww = w * (0.25 + 0.75 * i / tiers) * r.uniform(0.85, 1.15)
        left += [(x - ww, yy + h * 0.02), (x - ww * 0.35, yy - h * 0.03)]
        right += [(x + ww * 0.35, yy - h * 0.03), (x + ww, yy + h * 0.02)]
    pts = [(x, y - h)] + right + [(x + w * 0.08, y), (x - w * 0.08, y)] + left[::-1]
    return pts


def forest(img, ground, x0, x1, n, hmin, hmax, col, seed, col2=None, density_fn=None, aspect=0.22):
    """沿地面曲线 ground(x)->y 种云杉；前后排序，远小近大由 hmin/hmax 控制"""
    r = np.random.default_rng(seed)
    sk = Sketch()
    sk2 = Sketch() if col2 else None
    xs = r.uniform(x0, x1, n)
    for x in xs:
        if density_fn is not None and r.random() > density_fn(x):
            continue
        h = r.uniform(hmin, hmax)
        y = ground(x) + r.uniform(0, h * 0.25)
        pts = spruce_pts(x, y, h, h * aspect, r)
        (sk2 if sk2 and r.random() < 0.35 else sk).poly(pts)
    m = sk.get()
    out = paint(img, C(col) * (1 + 0.1 * noise2(seed, scale=60, octaves=2))[..., None], m)
    if sk2:
        out = paint(out, C(col2), sk2.get())
    return out


def blobs_trees(img, ground, x0, x1, n, rmin, rmax, cols, seed, trunk="#3b2a1e"):
    """圆冠阔叶树（白桦、胡杨），多种颜色"""
    r = np.random.default_rng(seed)
    layers = [Sketch() for _ in cols]
    tr = Sketch()
    for _ in range(n):
        x = r.uniform(x0, x1)
        rr = r.uniform(rmin, rmax)
        y = ground(x) + r.uniform(0, rr * 0.4)
        tr.line([(x, y), (x, y - rr * 1.6)], max(1.5, rr * 0.12))
        k = r.integers(0, len(cols))
        for _ in range(5):
            cx = x + r.uniform(-rr * 0.6, rr * 0.6)
            cy = y - rr * 1.7 + r.uniform(-rr * 0.7, rr * 0.4)
            q = rr * r.uniform(0.45, 0.8)
            layers[k].ellipse(cx - q, cy - q * 1.1, cx + q, cy + q * 1.1)
    out = paint(img, C(trunk), tr.get())
    for lay, c in zip(layers, cols):
        tex = 1 + 0.18 * noise2(seed + 3, scale=90, octaves=2)
        out = paint(out, C(c)[None, None, :] * tex[..., None], lay.get())
    return out


def scatter_dots(img, region_fn, n, col, seed, size=(1, 3), ymin=0):
    r = np.random.default_rng(seed)
    sk = Sketch()
    for _ in range(n):
        x = r.uniform(0, W)
        y = r.uniform(ymin, H)
        if not region_fn(x, y):
            continue
        s = r.uniform(*size) * (0.4 + 1.2 * (y - ymin) / (H - ymin))
        sk.ellipse(x - s, y - s * 0.8, x + s, y + s * 0.8)
    return paint(img, C(col), sk.get())


def finish(img, vignette=0.35, grain=0.025, seed=99, warm=0.0):
    d = np.sqrt(((X - W / 2) / (W / 2)) ** 2 + ((Y - H / 2) / (H / 2)) ** 2)
    img = img * (1 - vignette * smooth(0.6, 1.5, d))[..., None]
    img = img + grain * noise2(seed, scale=500, octaves=1)[..., None]
    if warm:
        img = img * np.array([1 + warm, 1, 1 - warm], np.float32)
    im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    return im.filter(ImageFilter.GaussianBlur(0.5))
