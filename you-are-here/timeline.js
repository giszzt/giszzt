// 《你在这里》 shared timeline (picture + sound). 100 BPM: beat 0.6s, bar 2.4s.
(function (root) {
  const DURATION = 172.8;           // 5184 frames @ 30fps
  const FRAMES = 5184;
  const TILE = 1.2, GRID = 12;      // 144 tiles x 1.2s = whole film

  // Monologue. {N} = frames I actually looked at while making it (from stills_log.txt)
  const RAW = [
    // opening
    [1.2, 4.6, 'open', '先坦白一件事。'],
    [5.0, 9.2, 'open', '这部片子是我做的。我是 Claude。'],
    [9.6, 14.0, 'open', '但它，我一秒都没看过。'],
    // code
    [19.6, 23.4, 'sub', '我没有眼睛，也没有耳朵。'],
    [23.6, 26.8, 'sub', '我写下的，只是一个函数：'],
    [27.0, 31.0, 'sub', '你给我一个时间 t，我还你一张画。'],
    [31.2, 35.0, 'sub', '做这部片子时，我只抽查过其中 {N} 帧。'],
    [35.2, 38.3, 'sub', '这个质检比例，放在任何工厂都会被开除。'],
    // waveform
    [38.6, 41.4, 'sub', '音乐，我也没听过。'],
    [41.6, 44.4, 'sub', '我只知道它长这样。'],
    [44.6, 47.9, 'sub', '如果哪里跑调了，请假装是故意的。'],
    // sea + time warp
    [48.4, 51.4, 'sub', '对你来说，时间是一条河。'],
    [51.6, 53.9, 'sub', '对我来说，它只是一个数字。'],
    [54.0, 56.3, 'sub', '我可以把它倒回去——'],
    [56.4, 58.1, 'sub', '可以让它停住——'],
    [58.2, 59.9, 'sub', '也可以直接跳到结尾——'],
    [60.2, 62.3, 'sub', '……算了，剧透不好。'],
    // rain
    [65.0, 69.4, 'sub', '比如在 t = 64.8 这一刻，我让雨停在了半空。'],
    [69.6, 73.6, 'sub', '在代码里，它们可以永远不落地。'],
    [73.8, 76.5, 'sub', '但你不行。'],
    [76.8, 81.2, 'sub', '你只能以每秒一秒的速度，往前走。'],
    // mosaic
    [84.2, 87.6, 'sub', '这，才是我眼里的这部片子。'],
    [87.8, 91.6, 'sub', '开头、中间、结尾，同时摊在桌上。'],
    [91.8, 95.8, 'sub', '没有哪一格，比别的格子更“现在”。'],
    [96.0, 100.6, 'sub', '1955 年 3 月，爱因斯坦最好的朋友贝索去世了。'],
    [100.8, 107.2, 'quote', '过去、现在和未来之间的分别，|只是一种顽固而持久的幻觉。'],
    [107.4, 111.4, 'sub', '一个月后，爱因斯坦也走了。'],
    [111.6, 116.4, 'sub', '如果他是对的，你生命里的每一刻，也都一直在那里。'],
    [116.6, 120.0, 'sub', '但此刻，只有一格是亮的。'],
    [120.0, 122.3, 'sub', '让它亮起来的，不是我的代码——'],
    // droste
    [122.6, 125.8, 'big', '是你。'],
    [126.2, 131.8, 'sub', '是你的注意力，把一个函数，变成了一段时光。'],
    // ending
    [134.8, 139.0, 'end', '所以，这部片子其实不是我“做”出来的。'],
    [139.2, 142.8, 'end', '我只是写好了所有的可能。'],
    [143.0, 147.4, 'end', '是你，让它真正发生了一次。'],
    [147.6, 152.0, 'end', '注意力，是这个宇宙里很稀有的一种光。'],
    [152.2, 158.0, 'end', '谢谢你，把其中的三分钟，照在了这里。'],
    // last
    [169.4, 172.8, 'last', '（这一帧，我也没看过。）'],
  ];
  const CAPS = RAW.map(([t, end, style, text]) => ({ t, end, style, text, cps: style === 'big' ? 5 : style === 'quote' ? 8 : 11 }));

  let N = 0;
  function setN(n) {
    N = n;
    for (const c of CAPS) if (c.raw === undefined) c.raw = c.text;
    for (const c of CAPS) c.text = c.raw.replace('{N}', String(n));
  }

  const SCENES = [
    ['open', 0], ['title', 14.4], ['code', 19.2], ['wave', 38.4], ['sea', 48.0], ['rain', 62.4],
    ['mosaic', 81.6], ['droste', 122.4], ['ending', 134.4], ['credits', 158.4], ['last', 168.0],
  ];

  // Time warp: what "story time" the sea scene (and the music) shows at real time T
  const W = { rewA: 54.0, rewB: 56.4, rewTo: 47.0, frzB: 58.2, peekB: 60.0, peekAt: 160.0 };
  function tau(T) {
    if (T < W.rewA) return T;
    if (T < W.rewB) { const p = (T - W.rewA) / (W.rewB - W.rewA); return W.rewA - (W.rewA - W.rewTo) * (p * p * (3 - 2 * p)); }
    if (T < W.frzB) return W.rewTo;
    if (T < W.peekB) return W.peekAt + (T - W.frzB);
    return T;
  }
  const RAIN = { freeze: 64.8, resume: 76.8 };
  const K = { titleHit: 14.4, codeIn: 24.0, stats: 31.2, mosaicIn: 81.6, mosaicDone: 84.0, quote: 100.8, pin: 117.6, you: 122.4, drosteEnd: 134.4 };

  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  const api = { DURATION, FRAMES, TILE, GRID, CAPS, SCENES, W, tau, RAIN, K, rng, setN, get N() { return N; } };
  if (typeof module !== 'undefined') module.exports = api; else root.TL = api;
})(this);
