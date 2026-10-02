"""12 个场景的插画。每个函数返回 W×H 的 PIL 图像。"""
import numpy as np
from paint import *  # noqa: F401,F403
from paint import W, H, X, Y, C, lerp, smooth


def intro():
    img = sky([(0, "#2b3a67"), (0.35, "#8f6fa3"), (0.55, "#f2a07b"), (0.68, "#ffd9a0")])
    img = sun(img, 1450, 700, 34, "#fff1c7", glow=0.55)
    img = clouds(img, 11, 160, 420, cover=0.25, col="#ffc9a8", shadow="#7d6b98", alpha=0.7)
    r1 = peaks([(500, 330, 520, 1.3), (1000, 300, 420, 1.2), (1500, 380, 500, 1.3), (1900, 420, 400, 1.2)], 1, rough=40)
    img = mountain(img, r1 + 120, "#8a7ea8", 1, snow_y=560, snow_col="#ffe6d1", snow_shadow="#9c8db8",
                   haze=0.35, haze_col="#e8b3a2", mist=0.5)
    r2 = peaks([(300, 560, 600, 1.1), (1200, 600, 700, 1.2), (1900, 560, 500, 1.1)], 2, rough=35)
    img = mountain(img, r2 + 80, "#5f5677", 2, haze=0.25, haze_col="#c99aa2", mist=0.5)
    r3 = 900 + 70 * noise1(W, 3, octaves=5, base=2)
    img = hills(img, r3, "#4d4a5e", "#2a2735", 3)
    img = forest(img, lambda x: 900 + 70 * float(noise1(W, 3, octaves=5, base=2)[int(min(W - 1, max(0, x)))]),
                 0, W, 380, 30, 70, "#262433", 4)
    return finish(img, warm=0.02)


def kanas():
    img = sky([(0, "#4e86c9"), (0.4, "#a9cbe8"), (0.55, "#e6eef3")])
    img = clouds(img, 21, 80, 300, cover=0.15, alpha=0.9)
    r1 = peaks([(700, 250, 450, 1.25), (1250, 200, 380, 1.15), (1750, 300, 420, 1.3)], 21, rough=35)
    img = mountain(img, r1 + 60, "#7b8797", 21, snow_y=470, haze=0.25, haze_col="#c5d6e6", mist=0.4)
    r2 = 560 + 120 * noise1(W, 22, octaves=6, base=2) + 30 * noise1(W, 23, base=10)
    img = hills(img, r2, "#3f5b45", "#2d4535", 22, tex=0.2)
    g2 = lambda x: float(r2[int(np.clip(x, 0, W - 1))])
    img = forest(img, g2, 0, W, 900, 18, 40, "#22382b", 24, col2="#b9892c")
    img = blobs_trees(img, lambda x: g2(x) + 60, 0, W, 260, 10, 22, ["#d9a62e", "#e8c04a", "#b8741f"], 25)
    wy = 760
    img = water(img, wy, "#4fa8a0", strength=0.5, ripple=3, seed=26, streak=0.08)
    # 前景金色河岸与图瓦木屋
    r3 = 900 + 60 * noise1(W, 27, octaves=5, base=2) + np.where(X[0] > 1300, (X[0] - 1300) * -0.12, 0)
    img = hills(img, r3, "#a77d2c", "#5e4a22", 27, tex=0.25)
    g3 = lambda x: float(r3[int(np.clip(x, 0, W - 1))])
    img = blobs_trees(img, g3, 0, W, 90, 25, 55, ["#e2a83a", "#f0cc56", "#c47a22", "#9b5b1c"], 28)
    sk = Sketch(); roof = Sketch()
    rr = np.random.default_rng(29)
    for x in (330, 560, 760, 1650, 1880):
        y = g3(x) + 70
        w = rr.uniform(70, 95); h = w * 0.55
        sk.rect(x - w / 2, y - h, x + w / 2, y)
        roof.poly([(x - w * 0.62, y - h), (x, y - h - w * 0.42), (x + w * 0.62, y - h)])
    img = paint(img, C("#7a4e2d") * (1 + 0.15 * np.sin(Y * 0.9))[..., None], sk.get())
    img = paint(img, C("#4a3424"), roof.get())
    img = clouds(img, 30, 830, 870, cover=0.35, col="#e9e4dc", alpha=0.35, scale=12, shadow="#cfc6ba")
    return finish(img)


def ghost():
    img = sky([(0, "#3c3f6e"), (0.35, "#c46a5a"), (0.6, "#f6b26b"), (0.72, "#ffe0a3")])
    img = sun(img, 620, 690, 40, "#ffe6b0", glow=0.8)
    img = clouds(img, 31, 200, 380, cover=0.3, col="#ffb38a", shadow="#6c4a63", alpha=0.6)
    for k, (base, amp, col, hz, thr) in enumerate([(720, 90, "#b0776a", 0.5, 0.15), (820, 160, "#9a5a3c", 0.28, 0.22),
                                                   (950, 250, "#7d4126", 0.05, 0.3)]):
        n = noise1(W, 32 + k, octaves=5, base=5 + 3 * k)
        plateau = np.clip((n - thr) * 9, 0, 1)
        step = np.clip((noise1(W, 50 + k, octaves=3, base=8) + 0.2) * 4, 0, 1) * 0.35
        ridge = base - amp * plateau * (0.65 + step) + 5 * noise1(W, 40 + k, octaves=4, base=60)
        img = mountain(img, ridge, col, 33 + k, light=(1.35, 0.6), haze=hz, haze_col="#f0b07c",
                       strata=0.22, tex=0.18, mist=0.3)
    r = 1060 + 15 * noise1(W, 37, base=3)
    img = hills(img, r, "#6a3a22", "#3a2014", 37, tex=0.25)
    return finish(img, warm=0.03)


def sayram():
    img = sky([(0, "#1f5fae"), (0.35, "#6aa6dc"), (0.5, "#cfe3f2")])
    img = clouds(img, 41, 90, 330, cover=0.05, alpha=0.95, scale=4)
    r1 = peaks([(250, 400, 380, 1.2), (700, 340, 420, 1.2), (1250, 380, 420, 1.2), (1750, 360, 400, 1.2), (2050, 430, 300, 1.2)], 41, rough=40)
    img = mountain(img, r1 + 40, "#6f7f94", 41, snow_y=500, haze=0.3, haze_col="#bcd3e8", mist=0.5)
    r2 = 600 + 25 * noise1(W, 42, octaves=5, base=3)
    img = hills(img, r2, "#4a6b5a", "#3f5f50", 42)
    wy = 640
    img = water(img, wy, "#1b6fb3", strength=0.62, ripple=5, seed=43, streak=0.14, dark=0.1)
    # 湖水由近岸翠绿渐变为深蓝
    t = smooth(wy, H, Y)[..., None]
    img = lerp(img, img * np.array([0.6, 1.05, 1.0], np.float32) + np.array([0, 0.08, 0.05], np.float32), t * 0.4)
    r3 = 930 + 40 * noise1(W, 44, octaves=5, base=2) - np.clip(X[0] - 1100, 0, None) * 0.15
    img = hills(img, r3, "#7aa34a", "#3e6a2a", 44, tex=0.15)
    region = lambda x, y: y > r3[int(np.clip(x, 0, W - 1))] + 8
    img = scatter_dots(img, region, 9000, "#f2c832", 45, size=(1.2, 4.5), ymin=900)
    img = scatter_dots(img, region, 2500, "#ffffff", 46, size=(1, 3), ymin=900)
    return finish(img, vignette=0.25)


def nalati():
    img = sky([(0, "#2f78c4"), (0.4, "#94c3ea"), (0.55, "#e0eef7")])
    img = clouds(img, 51, 60, 320, cover=0.1, alpha=0.95, scale=4)
    r1 = peaks([(400, 360, 500, 1.2), (1100, 330, 450, 1.25), (1800, 380, 480, 1.2)], 51, rough=30)
    img = mountain(img, r1 + 40, "#7a8a9a", 51, snow_y=470, haze=0.35, haze_col="#c6dbea", mist=0.4)
    layers = [(600, 90, "#5d8f4f", "#4c7d44"), (700, 120, "#6aa452", "#4f8a3c"), (820, 150, "#7cb85a", "#55923b")]
    grounds = []
    for k, (b, a, c1, c2) in enumerate(layers):
        r = b + a * noise1(W, 52 + k, octaves=5, base=2)
        img = hills(img, r, c1, c2, 52 + k, light=0.35)
        rr = r.copy()
        g = lambda x, rr=rr: float(rr[int(np.clip(x, 0, W - 1))])
        slope = np.gradient(np.convolve(r, np.ones(41) / 41, "same"))
        dens = lambda x, s=slope: 0.9 if s[int(np.clip(x, 0, W - 1))] > 0.15 else 0.06
        img = forest(img, lambda x, g=g: g(x) + 15, 0, W, 900, 14 + 8 * k, 30 + 14 * k,
                     "#1f3d27", 60 + k, density_fn=dens)
        grounds.append(g)
    # 云影
    cs = noise2(57, scale=3, octaves=3)
    img *= (1 - 0.18 * smooth(0.15, 0.35, cs) * smooth(600, 700, Y))[..., None]
    r = 980 + 50 * noise1(W, 58, octaves=5, base=2)
    img = hills(img, r, "#8cc861", "#4b8a35", 58, tex=0.12)
    g = lambda x: float(r[int(np.clip(x, 0, W - 1))])
    # 毡房
    wall, roof, door = Sketch(), Sketch(), Sketch()
    for x, s in ((1250, 1.0), (1400, 0.8), (1530, 0.9), (420, 0.6)):
        y = g(x) + 90 * s
        w = 120 * s; h = 55 * s
        wall.rect(x - w / 2, y - h, x + w / 2, y)
        roof.ellipse(x - w / 2, y - h - h * 0.9, x + w / 2, y - h + h * 0.5)
        door.rect(x - w * 0.09, y - h * 0.65, x + w * 0.09, y)
    img = paint(img, C("#f3efe4"), roof.get())
    img = paint(img, C("#e2dccd"), wall.get())
    img = paint(img, C("#b04532"), door.get())
    region = lambda x, y: y > g(x) + 60
    img = scatter_dots(img, region, 1800, "#f5f2ea", 59, size=(2, 5), ymin=1000)
    img = scatter_dots(img, region, 3000, "#e9df5a", 61, size=(1, 2.5), ymin=1000)
    return finish(img, vignette=0.25)


def duku():
    img = sky([(0, "#2c6cb8"), (0.4, "#8fbde6"), (0.6, "#dfecf5")])
    img = clouds(img, 71, 70, 260, cover=0.2, alpha=0.9)
    r1 = peaks([(300, 300, 380, 1.2), (800, 200, 380, 1.15), (1300, 240, 380, 1.2), (1800, 280, 420, 1.2)], 71, rough=55)
    img = mountain(img, r1 + 30, "#6b7280", 71, snow_y=470, haze=0.15, haze_col="#c8dbe9", mist=0.5)
    r2 = 470 + 150 * noise1(W, 72, octaves=6, base=2) + 0.12 * np.abs(X[0] - 1056)
    img = hills(img, r2, "#5d9150", "#3e6e3a", 72, tex=0.2, light=0.4)
    g = lambda x: float(r2[int(np.clip(x, 0, W - 1))])
    img = forest(img, lambda x: g(x) + 40, 0, W, 700, 14, 30, "#1f3a26", 73,
                 density_fn=lambda x: 0.8 if abs(x - 1056) > 500 else 0.05)
    # 盘山公路：近大远小的之字形回头弯，弯道用圆弧
    road, mark = Sketch(), Sketch()
    pts = []
    n = 9
    for i in range(n):
        t = i / (n - 1)
        y = 1240 - 700 * (1 - (1 - t) ** 1.3)
        half = 620 * (1 - t) + 90
        xl, xr = 1056 - half, 1056 + half
        seg = [(xl, y), (xr, y)] if i % 2 == 0 else [(xr, y), (xl, y)]
        pts.append((seg, 60 * (1 - t) + 7))
    path, widths = [], []
    for i, (seg, w) in enumerate(pts):
        a, b = seg
        for u in np.linspace(0, 1, 40):
            path.append((a[0] + (b[0] - a[0]) * u, a[1])); widths.append(w)
        if i + 1 < len(pts):
            nb = pts[i + 1][0][0]
            cy = (a[1] + nb[1]) / 2; ry = (a[1] - nb[1]) / 2
            sgn = 1 if b[0] > a[0] else -1
            for ang in np.linspace(-np.pi / 2, np.pi / 2, 30):
                path.append((b[0] + sgn * ry * 0.9 * np.cos(ang), cy - ry * np.sin(ang)))
                widths.append(w)
    fixed = path
    for i in range(len(fixed) - 1):
        w = widths[i]
        road.line([fixed[i], fixed[i + 1]], w)
        if i % 6 < 3:
            mark.line([fixed[i], fixed[i + 1]], max(1, w * 0.05))
    img = paint(img, C("#5a5c60"), road.get())
    img = paint(img, C("#f4f1e6"), mark.get() * 0.9)
    return finish(img, vignette=0.28)


def bayan():
    img = sky([(0, "#1b2450"), (0.3, "#6b3f6e"), (0.48, "#e0705a"), (0.56, "#ffc27a")])
    hy = 600
    img = sun(img, 1300, hy - 25, 30, "#ffe3a8", glow=0.9, glow_r=7)
    img = clouds(img, 81, 150, 420, cover=0.3, col="#ff9a7a", shadow="#4e2f55", alpha=0.75)
    r1 = peaks([(300, 430, 500, 1.2), (900, 400, 500, 1.2), (1700, 450, 600, 1.2)], 81, rough=30)
    img = mountain(img, np.minimum(r1 + 60, hy), "#3c2f4c", 81, haze=0.35, haze_col="#c26a6a", mist=0.6)
    skyref = img.copy()
    plain = vgrad([(0, "#3a3a2a"), (0.5, "#2f3a24"), (1, "#1b2414")])
    img[hy:] = plain[hy:] * (1 + 0.12 * noise2(82, scale=30, octaves=4, sx=3, sy=0.3))[hy:, :, None]
    # 屏幕空间的蜿蜒河道：越远摆幅越小、弯越密
    riv = Sketch()
    ys = np.linspace(H + 60, hy + 1, 6000)
    t = np.clip((ys - hy) / (H - hy), 0.002, 1.2)
    z = 1 / (t + 0.03)
    xs = 1260 + 1100 * t * (np.sin(2.6 * z) * 0.8 + 0.25 * np.sin(5.3 * z + 1)) - 200 * t
    ws = 2 + 70 * t
    for x, y, w in zip(xs, ys, ws):
        riv.ellipse(x - w, y - w * 0.35, x + w, y + w * 0.35)
    m = riv.get()
    ry = np.clip((2 * hy - Y).astype(int), 0, H - 1)
    refl = skyref[ry[:, 0]] * 0.95
    img = paint(img, refl, m)
    return finish(img, warm=0.03)


def tianchi():
    img = sky([(0, "#2f6db5"), (0.4, "#9cc7ea"), (0.55, "#e4f0f8")])
    img = clouds(img, 91, 60, 260, cover=0.15, alpha=0.9)
    r1 = peaks([(980, 170, 220, 1.05), (1120, 200, 200, 1.05), (1260, 190, 230, 1.05),
                (650, 330, 400, 1.2), (1600, 320, 420, 1.2)], 91, rough=35)
    img = mountain(img, r1 + 60, "#75808f", 91, snow_y=520, haze=0.2, haze_col="#c6dbea", mist=0.4)
    rl = 330 + 380 * smooth(0, 700, X[0]) * 0 + 0
    left = 420 + 360 * (np.abs(X[0] - 1100) / 1100) ** 1.5 * -1 + 330 + 60 * noise1(W, 92, octaves=6, base=3)
    left = np.where(X[0] < 1100, 420 + (1100 - X[0]) * -0.25 + 330, 420 + (X[0] - 1100) * -0.22 + 330) + 60 * noise1(W, 92, octaves=6, base=3)
    left = np.maximum(left, 380)
    v = np.minimum(left + np.abs(X[0] - 1100) * 0 + 0, 700)
    img = mountain(img, v + 40 * np.exp(-((X[0] - 1100) / 260) ** 2) * 3, "#2f4a37", 93, haze=0.1,
                   haze_col="#8fb3a6", tex=0.25)
    g = lambda x: float(v[int(np.clip(x, 0, W - 1))]) + 120 * float(np.exp(-((x - 1100) / 260) ** 2))
    img = forest(img, lambda x: g(x) + 5, 0, W, 2600, 14, 30, "#1b3324", 94, density_fn=lambda x: 0.85)
    img = forest(img, lambda x: g(x) + 120, 0, W, 1400, 20, 40, "#18301f", 95)
    wy = 760
    img = water(img, wy, "#2f8f7a", strength=0.48, ripple=3, seed=96, streak=0.06)
    r3 = 1000 + 40 * noise1(W, 97, base=2) - np.clip(700 - X[0], 0, None) * 0.25
    img = hills(img, r3, "#35583a", "#1b2e1d", 97)
    img = forest(img, lambda x: float(r3[int(np.clip(x, 0, W - 1))]) + 10, 0, 650, 70, 100, 230, "#14261a", 98)
    return finish(img, vignette=0.3)


def turpan():
    img = sky([(0, "#7fa8cf"), (0.35, "#e6d8b8"), (0.55, "#f8eccc")])
    img = sun(img, 1700, 130, 46, "#fffbe8", glow=0.6, glow_r=5)
    r1 = 520 + 200 * noise1(W, 101, octaves=6, base=2) + 40 * noise1(W, 102, octaves=4, base=12)
    img = mountain(img, r1, "#c4532a", 101, light=(1.3, 0.62), tex=0.25, gully_snow=0, strata=0.12, haze=0.12, haze_col="#f2c79a", mist=0.2)
    # 火焰山的竖向沟壑纹理
    gul = noise2(103, scale=30, octaves=3, sx=0.3, sy=3)
    m = ridge_mask(r1)
    img = img * (1 - 0.15 * m * np.clip(gul * 2, 0, 1))[..., None]
    # 前景：葡萄沟的葡萄架
    r2 = 860 + 20 * noise1(W, 104, base=2)
    img = hills(img, r2, "#6a8f3a", "#2e4a1c", 104, tex=0.25)
    sk = Sketch(); sk2 = Sketch()
    vx = 1056
    for i in range(-14, 15):
        a = (vx + i * 30, r2.min() + 10)
        b = (vx + i * 260, H + 50)
        sk.line([a, b], 3 + abs(i) * 0.3)
        for t in np.linspace(0.05, 1, 22):
            px = a[0] + (b[0] - a[0]) * t ** 1.8
            py = a[1] + (b[1] - a[1]) * t ** 1.8
            q = 3 + 26 * t ** 1.8
            sk2.ellipse(px - q, py - q * 0.8, px + q, py + q * 0.5)
    img = paint(img, C("#3c2a18"), sk.get() * 0.6)
    img = paint(img, C("#7fae3e") * (1 + 0.2 * noise2(105, scale=90, octaves=2))[..., None], sk2.get())
    # 生土建筑（晾房）
    hs = Sketch()
    for x, w in ((180, 160), (1820, 200)):
        y = r2[x] + 30
        hs.rect(x - w / 2, y - w * 0.55, x + w / 2, y)
    img = paint(img, C("#c99a62"), hs.get())
    holes = Sketch()
    for x, w in ((180, 160), (1820, 200)):
        y = r2[x] + 30
        for i in range(6):
            for j in range(3):
                hx = x - w / 2 + (i + 0.6) * w / 6.5
                hy = y - w * 0.5 + (j + 0.4) * w * 0.15
                holes.rect(hx, hy, hx + w * 0.05, hy + w * 0.06)
    img = paint(img, C("#5a3d22"), holes.get())
    return finish(img, warm=0.03)


def kashgar():
    img = sky([(0, "#2d3a6a"), (0.35, "#7a5d8a"), (0.55, "#f0a070"), (0.7, "#ffd4a0")])
    img = sun(img, 1600, 640, 34, "#ffe3b0", glow=0.7)
    img = clouds(img, 111, 150, 380, cover=0.35, col="#ffbe95", shadow="#5e4b74", alpha=0.65)
    wall, dark, gold, win = Sketch(), Sketch(), Sketch(), Sketch()
    # 远景老城房屋
    rr = np.random.default_rng(112)
    x = -20
    while x < W:
        w = rr.uniform(60, 150); h = rr.uniform(70, 170)
        y0 = 760
        dark.rect(x, y0 - h, x + w, H)
        x += w * rr.uniform(0.7, 1.0)
    img = paint(img, C("#7b5a4d"), dark.get())
    # 艾提尕尔清真寺风格的门楼与宣礼塔
    cx = 1056
    base = 900
    wall.rect(cx - 330, base - 380, cx + 330, base + 300)
    for mx in (cx - 380, cx + 380):
        wall.rect(mx - 38, base - 620, mx + 38, base + 300)
        wall.rect(mx - 50, base - 650, mx + 50, base - 620)
        gold.poly([(mx - 46, base - 650), (mx, base - 720), (mx + 46, base - 650)])
        gold.rect(mx - 3, base - 760, mx + 3, base - 715)
    gold.ellipse(cx - 120, base - 520, cx + 120, base - 330)
    gold.rect(cx - 4, base - 575, cx + 4, base - 515)
    win.poly([(cx - 130, base + 300), (cx - 130, base - 150), (cx - 80, base - 250), (cx, base - 300),
              (cx + 80, base - 250), (cx + 130, base - 150), (cx + 130, base + 300)])
    for i in range(-2, 3):
        if i == 0:
            continue
        ax = cx + i * 120 + (30 if i < 0 else -30)
        win.poly([(ax - 25, base - 40), (ax - 25, base - 160), (ax, base - 200), (ax + 25, base - 160), (ax + 25, base - 40)])
    wl = wall.get()
    img = paint(img, C("#e9c98a") * (1 + 0.08 * noise2(113, scale=60, octaves=3))[..., None], wl)
    img = paint(img, C("#3fb0a5"), gold.get())
    img = paint(img, C("#3a2a2a"), win.get())
    # 暖色光
    img = img + (wl * 0.18 * smooth(300, 1100, X) )[..., None] * C("#ff9a50")
    # 前景屋顶
    fg = Sketch()
    x = -10
    while x < W:
        w = rr.uniform(150, 300); h = rr.uniform(60, 140)
        if abs(x + w / 2 - cx) > 480:
            fg.rect(x, H - 120 - h, x + w, H)
        x += w
    img = paint(img, C("#5c3d2e") * (1 + 0.1 * noise2(114, scale=40, octaves=3))[..., None], fg.get())
    lights = Sketch()
    for _ in range(140):
        lx = rr.uniform(0, W); ly = rr.uniform(800, 1150)
        if abs(lx - cx) < 470:
            continue
        lights.rect(lx, ly, lx + 10, ly + 14)
    img = paint(img, C("#ffc870"), lights.get() * 0.9)
    return finish(img, warm=0.02)


def pamir():
    img = sky([(0, "#1d5aa8"), (0.35, "#79acd9"), (0.5, "#d7e8f4")])
    img = clouds(img, 121, 60, 220, cover=0.25, alpha=0.85)
    x = X[0]
    dome = 250 + 300 * ((np.abs(x - 900) / 760) ** 1.5) + 30 * noise1(W, 121, octaves=7, base=6)
    dome -= 60 * np.exp(-((x - 1250) / 120) ** 2)
    side = peaks([(1650, 360, 380, 1.15), (1950, 400, 300, 1.2), (150, 420, 300, 1.2)], 126, rough=40)
    dome = np.minimum(np.minimum(dome, side), 620)
    img = mountain(img, dome, "#6f7380", 122, gully_snow=15, snow_y=470, haze=0.12, haze_col="#c8dcec", mist=0.3, light=(1.2, 0.75))
    r2 = 590 + 45 * noise1(W, 123, octaves=6, base=2) + 15 * noise1(W, 127, octaves=4, base=12)
    img = mountain(img, r2, "#8a6e55", 123, haze=0.15, haze_col="#c7c2b7", tex=0.18)
    wy = 680
    img = water(img, wy, "#2d7f9e", strength=0.5, ripple=2, seed=124, streak=0.07, dark=0.1)
    r3 = 960 + 30 * noise1(W, 125, base=2)
    img = hills(img, r3, "#9a8a5c", "#5e5235", 125, tex=0.25)
    # 牦牛剪影
    sk = Sketch()
    for xx, s in ((1500, 1.0), (1620, 0.85), (1720, 0.7)):
        y = r3[xx] + 70
        sk.ellipse(xx - 55 * s, y - 50 * s, xx + 55 * s, y)
        sk.ellipse(xx + 35 * s, y - 45 * s, xx + 75 * s, y - 10 * s)
        for lx in (-40, -20, 20, 40):
            sk.rect(xx + lx * s - 5 * s, y - 15 * s, xx + lx * s + 5 * s, y + 25 * s)
    img = paint(img, C("#2a2320"), sk.get())
    return finish(img, vignette=0.28)


def outro():
    img = sky([(0, "#05081a"), (0.5, "#141a3a"), (0.75, "#3a3256")])
    # 银河
    band = np.exp(-(((Y - (900 - X * 0.45)) / 160) ** 2))
    mw = band * (0.5 + 0.5 * noise2(131, scale=6, octaves=6))
    img = img + mw[..., None] * np.array([0.35, 0.3, 0.45], np.float32)
    img = stars(img, 9000, 132, ymax=900, bright=0.9)
    img = stars(img, 4000, 133, ymax=900, bright=0.5)
    for k, (b, a, c) in enumerate([(780, 90, "#2a2340"), (880, 120, "#1d1830"), (990, 150, "#120f20")]):
        n = noise1(W, 134 + k, octaves=4, base=2 + k)
        ridge = b - a * (1 - np.abs(n)) ** 2
        img = mountain(img, ridge, c, 134 + k, light=(1.6, 0.7), tex=0.05)
    # 驼队剪影
    sk = Sketch()
    rr = np.random.default_rng(140)
    for i, xx in enumerate(range(560, 1500, 170)):
        s = 1.0 - i * 0.05
        y = 990 - 150 * (1 - abs(float(noise1(W, 136, octaves=4, base=4)[xx]))) ** 2 + 4
        sk.ellipse(xx - 60 * s, y - 95 * s, xx + 60 * s, y - 45 * s)
        sk.ellipse(xx - 30 * s, y - 120 * s, xx + 10 * s, y - 70 * s)
        sk.line([(xx + 50 * s, y - 75 * s), (xx + 85 * s, y - 125 * s)], 16 * s)
        sk.ellipse(xx + 75 * s, y - 140 * s, xx + 110 * s, y - 118 * s)
        for lx in (-45, -25, 25, 45):
            sk.line([(xx + lx * s, y - 60 * s), (xx + lx * s, y + 2)], 8 * s)
    img = paint(img, C("#07060d"), sk.get())
    return finish(img, vignette=0.4, grain=0.02)


ALL = dict(intro=intro, kanas=kanas, ghost=ghost, sayram=sayram, nalati=nalati, duku=duku, bayan=bayan,
           tianchi=tianchi, turpan=turpan, kashgar=kashgar, pamir=pamir, outro=outro)

if __name__ == "__main__":
    import sys, os
    os.makedirs("build/scenes", exist_ok=True)
    for name in (sys.argv[1:] or ALL):
        ALL[name]().save(f"build/scenes/{name}.png")
        print("ok", name, flush=True)
