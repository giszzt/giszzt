# 为宣传片合成配乐与音效：120 BPM，Am-F-C-G，事件表来自 events.json
import json, wave, numpy as np
SR, DUR = 44100, 94.0
N = int(SR * DUR)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(3)
BEAT = 0.5

def add(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR); j = min(N, i + len(sig))
    if i >= N or j <= i: return
    s = sig[:j - i] * gain
    L[i:j] += s * (1 - max(0, pan)); R[i:j] += s * (1 + min(0, pan))

def env(n, a, d):  # 线性起音 + 指数衰减
    t = np.arange(n) / SR
    e = np.exp(-t / d)
    ai = int(a * SR)
    if ai > 0: e[:ai] *= np.linspace(0, 1, ai)
    return e

def lp(x, k):  # 简单滑动平均低通
    return np.convolve(x, np.ones(k) / k, mode='same')

def tone(f, dur, harms=1, detune=0.0):
    t = np.arange(int(dur * SR)) / SR
    out = np.zeros_like(t)
    for h in range(1, harms + 1):
        out += np.sin(2 * np.pi * f * h * (1 + detune) * t) / h
    return out

def sweep(f0, f1, dur):
    t = np.arange(int(dur * SR)) / SR
    f = np.geomspace(f0, f1, len(t))
    return np.sin(2 * np.pi * np.cumsum(f) / SR)

nf = lambda m: 440 * 2 ** ((m - 69) / 12)
# Am F C G
CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
ROOTS = [45, 41, 36, 43]

def chord_at(t): return int(t // 2) % 4

def drums_on(t): return 10 <= t < 86.6 and not (44 <= t < 46)
def full_on(t): return 18 <= t < 86.6 and not (44 <= t < 46)

# ---- 铺底 pad ----
for bar in range(int(DUR // 2)):
    t0 = bar * 2.0
    c = CHORDS[bar % 4]
    harms = 2 if t0 < 10 else 5
    g = 0.085 if t0 < 10 else 0.065
    if 44 <= t0 < 60: g = 0.055
    for m in c:
        for det, pan in ((-0.003, -0.6), (0.003, 0.6)):
            s = tone(nf(m), 2.3, harms, det)
            e = np.minimum(1, np.arange(len(s)) / (0.25 * SR)) * np.minimum(1, (len(s) - np.arange(len(s))) / (0.35 * SR))
            add(s * e, t0 - 0.1 if t0 > 0 else 0, g / 3, pan)

# ---- 鼓组 ----
kick = sweep(150, 42, 0.35) * env(int(0.35 * SR), 0.002, 0.12)
snare_n = rng.standard_normal(int(0.2 * SR)); snare = (np.diff(snare_n, prepend=0) * 0.6 + lp(snare_n, 3) * 0.4) * env(len(snare_n), 0.001, 0.06) + tone(190, 0.2) * env(int(0.2 * SR), 0.001, 0.05) * 0.5
hat_n = rng.standard_normal(int(0.05 * SR)); hat = np.diff(hat_n, prepend=0) * env(len(hat_n), 0.0005, 0.012)
b = 0
while b * BEAT < DUR:
    t = b * BEAT
    if drums_on(t): add(kick, t, 0.9)
    if full_on(t):
        if b % 2 == 1: add(snare, t, 0.28)
        add(hat, t + BEAT / 2, 0.12, 0.3)
        if 60 <= t < 86 : add(hat, t + BEAT / 4 * 3, 0.06, -0.3)
    b += 1

# ---- 贝斯 ----
e8 = 0
while e8 * BEAT / 2 < DUR:
    t = e8 * BEAT / 2
    if full_on(t):
        f = nf(ROOTS[chord_at(t)])
        s = tone(f, 0.24, 6) * env(int(0.24 * SR), 0.004, 0.09)
        add(lp(s, 6), t, 0.22 if e8 % 2 == 0 else 0.15)
    e8 += 1

# ---- 琶音 ----
k = 0
while k * BEAT / 4 < DUR:
    t = k * BEAT / 4
    c = CHORDS[chord_at(t)]
    seq = [c[0] + 12, c[1] + 12, c[2] + 12, c[1] + 24]
    if (32 <= t < 44) or (60 <= t < 90):
        m = seq[k % 4]
        s = (tone(nf(m), 0.2, 3) * env(int(0.2 * SR), 0.002, 0.05))
        g = 0.05 if t < 86.6 else 0.05 * max(0, (90 - t) / 3.4)
        add(s, t, g, 0.4 if k % 2 else -0.4)
    elif 46 <= t < 60 and k % 2 == 0:  # 纸面段落：八分音符八音盒
        m = seq[(k // 2) % 4] + 12
        s = (tone(nf(m), 0.6, 1) + 0.3 * tone(nf(m) * 3, 0.6, 1)) * env(int(0.6 * SR), 0.002, 0.18)
        add(s, t, 0.05, 0.3 if (k // 2) % 2 else -0.3)
    k += 1

# ---- 上升音 ----
def riser(t0, dur, g):
    n = int(dur * SR); nz = lp(rng.standard_normal(n), 4)
    ramp = np.linspace(0, 1, n) ** 2
    add((nz * 0.5 + sweep(200, 1200, dur) * 0.3) * ramp, t0, g)
riser(8.0, 2.0, 0.25); riser(16.5, 1.5, 0.15); riser(80.5, 1.5, 0.15)

# ---- 音效 ----
def sfx(k):
    if k == 'key':
        n = int(0.03 * SR); z = np.diff(rng.standard_normal(n), prepend=0) * env(n, 0.0003, 0.004)
        return z * 0.5 + tone(1800 * rng.uniform(.8, 1.2), 0.03) * env(n, 0.0003, 0.006) * 0.3, 0.35
    if k == 'mark': return sweep(1300, 850, 0.14) * env(int(0.14 * SR), 0.002, 0.05), 0.3
    if k == 'strike':
        n = int(0.4 * SR); return lp(rng.standard_normal(n), 2) * np.linspace(1, 0, n) ** 2, 0.25
    if k == 'glitch':
        n = int(0.55 * SR); t = np.arange(n) / SR
        sq = np.sign(np.sin(2 * np.pi * np.repeat(rng.uniform(80, 900, 30), n // 30 + 1)[:n] * t))
        return np.round((sq * 0.5 + rng.standard_normal(n) * 0.3) * 4) / 4 * np.linspace(1, .2, n), 0.18
    if k == 'ding':
        n = int(1.4 * SR); s = sum(tone(1318.5 * h, 1.4) / (i + 1) for i, h in enumerate((1, 2, 3.01)))
        return s * env(n, 0.001, 0.4), 0.16
    if k == 'beep':
        s = np.concatenate([tone(1760, 0.09) * env(int(0.09 * SR), .001, .05), np.zeros(int(0.04 * SR)), tone(2350, 0.14) * env(int(0.14 * SR), .001, .08)])
        return s, 0.25
    if k == 'whoosh':
        n = int(0.7 * SR); z = lp(rng.standard_normal(n), 12); e = np.sin(np.linspace(0, np.pi, n)) ** 2
        return z * e, 0.55
    if k == 'tick': return tone(2600, 0.04) * env(int(0.04 * SR), .0005, .01), 0.2
    if k == 'click':
        n = int(0.05 * SR); return (tone(1500, 0.05) + np.diff(rng.standard_normal(n), prepend=0) * .3) * env(n, .0003, .01), 0.35
    if k == 'pop': return sweep(500, 1200, 0.09) * env(int(0.09 * SR), .002, .04), 0.3
    if k == 'stamp':
        n = int(0.35 * SR); s = sweep(110, 45, 0.35) * env(n, .001, .09) + lp(rng.standard_normal(n), 8) * env(n, .001, .03) * 0.8
        return s, 0.75
    if k == 'rise': return sweep(400, 1000, 0.3) * np.sin(np.linspace(0, np.pi, int(0.3 * SR))), 0.12
    if k == 'alarm':
        a = np.sign(tone(880, 0.14)) * env(int(0.14 * SR), .002, .1); b2 = np.sign(tone(660, 0.14)) * env(int(0.14 * SR), .002, .1)
        return lp(np.concatenate([a, b2]), 4), 0.09
    if k == 'boom':
        n = int(2.0 * SR); s = sweep(120, 35, 2.0) * env(n, .002, .5) + lp(rng.standard_normal(n), 30) * env(n, .002, .25) * 0.6
        return s, 0.9
    raise KeyError(k)

for e in json.load(open('events.json')):
    s, g = sfx(e['k']); add(s, e['t'], g, rng.uniform(-.2, .2))

# ---- 母带 ----
fade = np.ones(N); fi = int(90.0 * SR); fade[fi:] = np.linspace(1, 0, N - fi) ** 1.5
L *= fade; R *= fade
peak = max(np.abs(L).max(), np.abs(R).max())
L = np.tanh(L / peak * 1.4) / np.tanh(1.4) * 0.89; R = np.tanh(R / peak * 1.4) / np.tanh(1.4) * 0.89
st = (np.stack([L, R], 1) * 32767).astype('<i2')
with wave.open('music.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())
print('ok', peak)
