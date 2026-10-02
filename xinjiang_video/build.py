"""合成视频：配音 → 时间轴 → 背景音乐 → 叠加层（标题/地图/字幕）→ 逐帧渲染 → ffmpeg 编码"""
import json
import os
import subprocess
import sys
from multiprocessing import Pool

import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy.signal import resample_poly

from script import SCENES

OUT_W, OUT_H, FPS = 1920, 1080, 30
SR = 44100
XF = 1.0          # 场景交叉淡化时长
GAP = 0.35        # 句间停顿
TAIL = 0.9
BUILD = "build"
FONT_SERIF = "/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc"
FONT_SANS = "/usr/share/fonts/opentype/noto/NotoSansCJK-Medium.ttc"
FONT_SANS_R = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
SC = 2  # NotoCJK ttc 中简体中文的索引


def font(path, size):
    return ImageFont.truetype(path, size, index=SC)


# ---------------------------------------------------------------- 配音
def synth_all():
    import sherpa_onnx
    d = "models/matcha-icefall-zh-baker"
    cfg = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            matcha=sherpa_onnx.OfflineTtsMatchaModelConfig(
                acoustic_model=f"{d}/model-steps-3.onnx", vocoder="models/vocos.onnx",
                lexicon=f"{d}/lexicon.txt", tokens=f"{d}/tokens.txt", dict_dir=f"{d}/dict"),
            num_threads=4),
        rule_fsts=f"{d}/phone.fst,{d}/date.fst,{d}/number.fst")
    tts = sherpa_onnx.OfflineTts(cfg)
    os.makedirs(f"{BUILD}/tts", exist_ok=True)
    clips = {}
    for sc in SCENES:
        for i, line in enumerate(sc["lines"]):
            p = f"{BUILD}/tts/{sc['id']}_{i}.wav"
            if not os.path.exists(p):
                a = tts.generate(line, sid=0, speed=0.92)
                y = resample_poly(np.asarray(a.samples, np.float32), SR, a.sample_rate)
                # 去掉首尾静音
                env = np.abs(y) > 0.01
                idx = np.flatnonzero(env)
                y = y[max(0, idx[0] - 800): idx[-1] + 2000]
                sf.write(p, y, SR)
            clips[(sc["id"], i)] = sf.read(p, dtype="float32")[0]
    return clips


# ---------------------------------------------------------------- 时间轴
def timeline(clips):
    t = 0.0
    tl = []
    for k, sc in enumerate(SCENES):
        lead = 2.6 if sc["id"] == "intro" else 1.8 if sc["id"] == "outro" else 1.5
        subs = []
        c = lead
        for i, line in enumerate(sc["lines"]):
            d = len(clips[(sc["id"], i)]) / SR
            subs.append(dict(text=line, start=c, dur=d, key=(sc["id"], i)))
            c += d + GAP
        dur = c - GAP + TAIL + (2.0 if sc["id"] == "outro" else 0)
        tl.append(dict(scene=sc, start=t, dur=dur, subs=subs, idx=k))
        t += dur - XF
    total = tl[-1]["start"] + tl[-1]["dur"]
    return tl, total


# ---------------------------------------------------------------- 背景音乐（程序合成）
def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def pluck(freq, dur, sr=SR, seed=0, bright=0.5):
    n = int(dur * sr)
    p = int(sr / freq)
    r = np.random.default_rng(seed)
    buf = r.uniform(-1, 1, p).astype(np.float32)
    out = np.zeros(n, np.float32)
    for i in range(0, n, p):
        seg = buf[: min(p, n - i)]
        out[i:i + len(seg)] = seg
        buf = (bright * buf + (1 - bright) * 0.5 * (buf + np.roll(buf, 1))) * 0.996
        buf = 0.5 * (buf + np.roll(buf, 1)) * 0.999
    return out * np.exp(-np.arange(n) / sr * 2.2)


def music(total):
    n = int(total * SR) + SR
    t = np.arange(n) / SR
    out = np.zeros(n, np.float32)
    bar = 4.8
    chords = [[57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67], [52, 55, 59, 64]]  # Am F G Em
    # 柔和铺底和弦
    for b in range(int(total / bar) + 2):
        ch = chords[b % 4]
        s0 = int(b * bar * SR)
        L = int((bar + 1.6) * SR)
        tt = np.arange(L) / SR
        envl = np.minimum(1, tt / 1.4) * np.minimum(1, np.clip((bar + 1.6 - tt) / 1.6, 0, 1))
        sig = np.zeros(L, np.float32)
        for note in ch:
            f = midi(note - 12)
            for det in (-0.12, 0.12):
                ff = f * 2 ** (det / 12)
                for h, a in ((1, 1), (2, 0.35), (3, 0.12), (4, 0.06)):
                    sig += a * np.sin(2 * np.pi * ff * h * tt + note).astype(np.float32)
        seg = (sig * envl * 0.018).astype(np.float32)
        e = min(n, s0 + L)
        out[s0:e] += seg[: e - s0]
    # 低音
    for b in range(int(total / bar) + 2):
        f = midi(chords[b % 4][0] - 24)
        s0 = int(b * bar * SR)
        L = int(bar * SR)
        tt = np.arange(L) / SR
        seg = np.sin(2 * np.pi * f * tt) * np.minimum(1, tt / 0.3) * np.exp(-tt / 3) * 0.08
        e = min(n, s0 + L)
        out[s0:e] += seg[: e - s0].astype(np.float32)
    # 拨弦旋律（A 小调五声音阶，类似冬不拉的点拨）
    scale = [57, 60, 62, 64, 67, 69, 72, 74, 76]
    r = np.random.default_rng(7)
    beat = bar / 8
    pos = 4
    for k in range(int(total / beat)):
        if k * beat < 3.0 or k * beat > total - 3:
            continue
        if r.random() < (0.55 if k % 2 == 0 else 0.25):
            pos = int(np.clip(pos + r.choice([-2, -1, -1, 0, 1, 1, 2]), 0, len(scale) - 1))
            note = scale[pos]
            ch = chords[int(k * beat / bar) % 4]
            if note % 12 not in [c % 12 for c in ch] and r.random() < 0.5:
                continue
            s0 = int(k * beat * SR)
            p = pluck(midi(note), 2.2, seed=k, bright=0.3) * r.uniform(0.07, 0.12)
            e = min(n, s0 + len(p))
            out[s0:e] += p[: e - s0]
    # 简单回声
    d = int(0.36 * SR)
    wet = out.copy()
    for k in range(1, 5):
        wet[d * k:] += out[:-d * k] * (0.33 ** k)
    out = 0.75 * out + 0.4 * wet
    fade = np.minimum(1, t / 3) * np.clip((total - t) / 4, 0, 1)
    return (out * fade).astype(np.float32)[: int(total * SR)]


def mix_audio(tl, total, clips):
    n = int(total * SR)
    voice = np.zeros(n, np.float32)
    for seg in tl:
        for s in seg["subs"]:
            a = clips[s["key"]]
            i = int((seg["start"] + s["start"]) * SR)
            voice[i:i + len(a)] += a[: max(0, min(len(a), n - i))]
    voice *= 0.5 / (np.abs(voice).max() + 1e-6) * 1.6
    voice = np.tanh(voice)  # 软限幅
    bgm = music(total)
    bgm *= 0.22 / (np.sqrt(np.mean(bgm ** 2)) + 1e-6) * 0.25
    # 人声闪避
    env = np.convolve(np.abs(voice), np.ones(2205) / 2205, "same")
    env = np.clip(env / 0.05, 0, 1)
    k = int(0.4 * SR)
    env = np.convolve(env, np.ones(k) / k, "same")
    duck = 1 - 0.55 * np.clip(env * 1.5, 0, 1)
    mix = voice + bgm * duck
    mix /= max(1.0, np.abs(mix).max() / 0.95)
    sf.write(f"{BUILD}/audio.wav", mix, SR)


# ---------------------------------------------------------------- 叠加层
def text_layer(lines, pad=40, shadow=8, stroke=0):
    """lines: [(text, font, fill, (dx, dy))]；返回带柔和阴影的 RGBA"""
    boxes = []
    for txt, f, fill, (x, y) in lines:
        b = f.getbbox(txt, stroke_width=stroke)
        boxes.append((x + b[0], y + b[1], x + b[2], y + b[3]))
    w = max(b[2] for b in boxes) + pad * 2
    h = max(b[3] for b in boxes) + pad * 2
    lay = Image.new("RGBA", (int(w), int(h)), (0, 0, 0, 0))
    sh = Image.new("L", lay.size, 0)
    ds = ImageDraw.Draw(sh)
    d = ImageDraw.Draw(lay)
    for txt, f, fill, (x, y) in lines:
        ds.text((x + pad + 2, y + pad + 3), txt, font=f, fill=200, stroke_width=stroke + 2)
    sh = sh.filter(ImageFilter.GaussianBlur(shadow))
    base = Image.new("RGBA", lay.size, (0, 0, 0, 0))
    base.putalpha(sh.point(lambda v: int(v * 0.75)))
    for txt, f, fill, (x, y) in lines:
        d.text((x + pad, y + pad), txt, font=f, fill=fill, stroke_width=stroke,
               stroke_fill=(20, 20, 20, 255) if stroke else None)
    return Image.alpha_composite(base, lay)


def title_card(sc, k, n):
    if sc["id"] in ("intro", "outro"):
        big = font(FONT_SERIF, 150 if sc["id"] == "intro" else 110)
        sub = font(FONT_SANS_R, 40)
        tw = big.getlength(sc["title"])
        sw = sub.getlength(sc["sub"])
        w = max(tw, sw)
        lay = text_layer([(sc["title"], big, (255, 250, 240, 255), ((w - tw) / 2, 0)),
                          (sc["sub"], sub, (255, 228, 180, 255), ((w - sw) / 2, big.size * 1.35))], shadow=14)
        return lay, ((OUT_W - lay.width) // 2, int(OUT_H * 0.36 - lay.height / 2))
    num = font(FONT_SANS, 30)
    big = font(FONT_SERIF, 112)
    sub = font(FONT_SANS_R, 36)
    lay = text_layer([(f"第 {k:02d} 站  /  共 {n:02d} 站", num, (255, 214, 140, 255), (6, 0)),
                      (sc["title"], big, (255, 255, 255, 255), (0, 44)),
                      (sc["sub"], sub, (240, 240, 235, 255), (6, 44 + 112 * 1.32))], shadow=10)
    return lay, (60, 40)


class MapPanel:
    def __init__(self):
        gj = json.load(open("assets/xinjiang_65.json"))
        self.polys = []
        for f in gj["features"]:
            g = f["geometry"]
            rings = [g["coordinates"][0]] if g["type"] == "Polygon" else [p[0] for p in g["coordinates"]]
            self.polys += rings
        allp = np.concatenate([np.array(p) for p in self.polys])
        self.lon0, self.lat0 = allp.min(0)
        self.lon1, self.lat1 = allp.max(0)
        self.k = np.cos(np.radians(42))
        self.w, self.h, self.pad = 400, 0, 22
        sx = (self.lon1 - self.lon0) * self.k
        sy = self.lat1 - self.lat0
        self.scale = (self.w - 2 * self.pad) / sx
        self.h = int(sy * self.scale + 2 * self.pad + 40)

    def xy(self, lon, lat, s=1):
        x = self.pad + (lon - self.lon0) * self.k * self.scale
        y = self.pad + (self.lat1 - lat) * self.scale
        return x * s, y * s

    def render(self, sc):
        s = 3
        im = Image.new("RGBA", (self.w * s, self.h * s), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rounded_rectangle([0, 0, self.w * s - 1, self.h * s - 1], radius=18 * s, fill=(12, 18, 28, 150))
        for p in self.polys:
            d.polygon([self.xy(a, b, s) for a, b in p], fill=(232, 220, 196, 120), outline=(255, 255, 255, 150))
        for o in SCENES:
            if o["lonlat"]:
                x, y = self.xy(*o["lonlat"], s)
                d.ellipse([x - 4 * s, y - 4 * s, x + 4 * s, y + 4 * s], fill=(255, 255, 255, 160))
        f = font(FONT_SANS, 22 * s)
        d.text((self.pad * s, (self.h - 34) * s), "新疆维吾尔自治区", font=f, fill=(255, 255, 255, 200))
        im = im.resize((self.w, self.h), Image.LANCZOS)
        return im

    def dot(self, sc):
        return self.xy(*sc["lonlat"])


def subtitle_img(text):
    f = font(FONT_SANS, 50)
    return text_layer([(text, f, (255, 255, 255, 255), (0, 0))], pad=20, shadow=6, stroke=3)


def with_alpha(im, a):
    if a >= 0.999:
        return im
    r, g, b, al = im.split()
    al = al.point(lambda v: int(v * a))
    return Image.merge("RGBA", (r, g, b, al))


def ramp(t, t0, t1, fin=0.5, fout=0.5):
    if t < t0 or t > t1:
        return 0.0
    a = min(1.0, (t - t0) / fin) if fin > 0 else 1.0
    b = min(1.0, (t1 - t) / fout) if fout > 0 else 1.0
    return max(0.0, min(a, b))


# ---------------------------------------------------------------- 逐帧渲染（多进程）
G = {}


def init_worker(tl):
    G["tl"] = tl
    G["base"] = {}
    G["map"] = MapPanel()
    G["mapimg"] = {}
    G["title"] = {}
    G["sub"] = {}
    n = sum(1 for s in SCENES if s["lonlat"])
    k = 0
    for seg in tl:
        sc = seg["scene"]
        if sc["lonlat"]:
            k += 1
        G["title"][sc["id"]] = title_card(sc, k, n)
        if sc["lonlat"]:
            G["mapimg"][sc["id"]] = G["map"].render(sc)


def scene_frame(seg, lt):
    sc = seg["scene"]
    if sc["id"] not in G["base"]:
        G["base"][sc["id"]] = Image.open(f"{BUILD}/scenes/{sc['id']}.png").convert("RGB")
    base = G["base"][sc["id"]]
    BW, BH = base.size
    u = np.clip(lt / seg["dur"], 0, 1)
    u = u * u * (3 - 2 * u) * 0.6 + u * 0.4
    k = seg["idx"]
    zin = k % 2 == 0
    w0, w1 = (BW * 0.995, BW * 0.91) if zin else (BW * 0.91, BW * 0.995)
    ww = w0 + (w1 - w0) * u
    wh = ww * OUT_H / OUT_W
    dirx = [1, -1, 0.5, -0.5][k % 4]
    cx = BW / 2 + dirx * (BW - ww) / 2 * (u - 0.5) * 1.6
    cy = BH / 2 + (BH - wh) * 0.15 * (0.5 - u)
    cx = np.clip(cx, ww / 2, BW - ww / 2)
    cy = np.clip(cy, wh / 2, BH - wh / 2)
    box = (cx - ww / 2, cy - wh / 2, cx + ww / 2, cy + wh / 2)
    fr = base.transform((OUT_W, OUT_H), Image.EXTENT, box, Image.BICUBIC)

    # 标题
    lay, pos = G["title"][sc["id"]]
    if sc["id"] == "intro":
        a = ramp(lt, 0.6, seg["dur"] - XF - 0.2, 1.2, 0.8)
    elif sc["id"] == "outro":
        a = ramp(lt, 1.0, seg["dur"], 1.2, 1.5)
    else:
        a = ramp(lt, 0.5, 6.5, 0.7, 0.8)
    if a > 0:
        dy = int((1 - a) * 18)
        fr.paste(with_alpha(lay, a), (pos[0], pos[1] + dy), with_alpha(lay, a))
    # 地图
    if sc["lonlat"]:
        a = ramp(lt, 0.8, seg["dur"] - XF * 0.6, 0.6, 0.5)
        if a > 0:
            mp = G["mapimg"][sc["id"]].copy()
            d = ImageDraw.Draw(mp)
            x, y = G["map"].dot(sc)
            ph = (lt * 0.8) % 1.0
            rr = 6 + 18 * ph
            d.ellipse([x - rr, y - rr, x + rr, y + rr], outline=(255, 90, 60, int(255 * (1 - ph))), width=3)
            d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=(255, 80, 50, 255), outline=(255, 255, 255, 255), width=2)
            f = font(FONT_SANS, 24)
            tx = x + 14 if x < mp.width * 0.6 else x - 14 - f.getlength(sc["title"])
            d.text((tx + 1, y - 17), sc["title"], font=f, fill=(0, 0, 0, 160))
            d.text((tx, y - 18), sc["title"], font=f, fill=(255, 255, 255, 255))
            mpa = with_alpha(mp, a)
            fr.paste(mpa, (OUT_W - mp.width - 50, 50), mpa)
    # 字幕
    for s in seg["subs"]:
        a = ramp(lt, s["start"] - 0.08, s["start"] + s["dur"] + 0.2, 0.15, 0.15)
        if a > 0:
            key = s["text"]
            if key not in G["sub"]:
                G["sub"][key] = subtitle_img(key)
            im = with_alpha(G["sub"][key], a)
            fr.paste(im, ((OUT_W - im.width) // 2, OUT_H - 70 - im.height), im)
    return fr


def render_frame(fi):
    t = fi / FPS
    act = [s for s in G["tl"] if s["start"] <= t < s["start"] + s["dur"]]
    if not act:
        act = [G["tl"][-1]]
    frames = [(s, scene_frame(s, t - s["start"])) for s in act[:2]]
    if len(frames) == 1:
        fr = frames[0][1]
    else:
        (s0, f0), (s1, f1) = frames
        a = np.clip((t - s1["start"]) / XF, 0, 1)
        a = a * a * (3 - 2 * a)
        fr = Image.blend(f0, f1, float(a))
    # 片头片尾黑场淡入淡出
    total = G["tl"][-1]["start"] + G["tl"][-1]["dur"]
    fade = min(1.0, t / 1.2, (total - t) / 1.5)
    if fade < 1:
        fr = Image.blend(Image.new("RGB", fr.size), fr, max(0.0, fade))
    return fr.tobytes()


def main():
    clips = synth_all()
    tl, total = timeline(clips)
    print(f"total {total:.1f}s", flush=True)
    json.dump([dict(id=s["scene"]["id"], start=s["start"], dur=s["dur"]) for s in tl],
              open(f"{BUILD}/timeline.json", "w"), indent=1)
    mix_audio(tl, total, clips)
    out = sys.argv[1] if len(sys.argv) > 1 else "xinjiang.mp4"
    nframes = int(total * FPS)
    only = os.environ.get("PREVIEW")  # 例如 PREVIEW=12.5,40 导出单帧
    if only:
        init_worker(tl)
        for t in only.split(","):
            fi = int(float(t) * FPS)
            Image.frombytes("RGB", (OUT_W, OUT_H), render_frame(fi)).save(f"{BUILD}/preview_{t}.jpg", quality=88)
        return
    # 同时写出 SRT 字幕文件
    with open(out.rsplit(".", 1)[0] + ".srt", "w") as f:
        def ts(x):
            h, m = int(x // 3600), int(x % 3600 // 60)
            return f"{h:02d}:{m:02d}:{x % 60:06.3f}".replace(".", ",")
        i = 1
        for seg in tl:
            for s in seg["subs"]:
                a = seg["start"] + s["start"]
                f.write(f"{i}\n{ts(a)} --> {ts(a + s['dur'] + 0.2)}\n{s['text']}\n\n")
                i += 1
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{OUT_W}x{OUT_H}", "-r", str(FPS), "-i", "-", "-i", f"{BUILD}/audio.wav",
         "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out],
        stdin=subprocess.PIPE)
    with Pool(3, initializer=init_worker, initargs=(tl,)) as pool:
        for i, b in enumerate(pool.imap(render_frame, range(nframes), chunksize=6)):
            ff.stdin.write(b)
            if i % 300 == 0:
                print(f"frame {i}/{nframes}", flush=True)
    ff.stdin.close()
    ff.wait()
    print("done", out)


if __name__ == "__main__":
    main()
