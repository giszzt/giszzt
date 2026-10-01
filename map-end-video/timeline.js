// Shared timeline: used by film.html (picture) and audio.js (sound).
(function (root) {
  const DURATION = 173;

  // who -> voice used for typewriter blips
  const VOICES = {
    sys:    { f: 880, wave: 'square', g: 0.05 },
    narr:   { f: 520, wave: 'triangle', g: 0.09 },
    baby:   { f: 140, wave: 'saw', g: 0.07 },
    pei:    { f: 392, wave: 'pluck', g: 0.12 },
    merc:   { f: 262, wave: 'square', g: 0.05 },
    green:  { f: 180, wave: 'saw', g: 0.06 },
    africa: { f: 330, wave: 'triangle', g: 0.1 },
    snow:   { f: 233, wave: 'triangle', g: 0.1 },
    gps:    { f: 1320, wave: 'sine', g: 0.08 },
    coder:  { f: 740, wave: 'square', g: 0.05 },
    agi:    { f: 600, wave: 'fm', g: 0.08 },
    doc:    { f: 2000, wave: 'click', g: 0.06 },
    hand:   { f: 0, wave: 'scratch', g: 0.05 },
    end:    { f: 0, wave: 'mute', g: 0 },
  };

  // style: term | sub | ink | bigink | big | agi | agibig | quote | borges | doc | hand | end | small
  const CAPS = [
    // 0 terminal
    { t: 0.5, end: 12, who: 'sys', style: 'term', text: '> 新任务：画一张完美的地图', cps: 14 },
    { t: 2.4, end: 12, who: 'sys', style: 'term', text: '> 精度要求：100%', cps: 14 },
    { t: 3.6, end: 12, who: 'sys', style: 'term', text: '> 预算：0 元', cps: 12 },
    { t: 4.6, end: 12, who: 'sys', style: 'term', text: '> 截止日期：昨天', cps: 12 },
    { t: 5.9, end: 12, who: 'sys', style: 'term', text: '> AGI：收到。', cps: 12 },
    { t: 7.0, end: 12, who: 'sys', style: 'term', text: '> 正在召唤五千年来所有的地图学家……', cps: 16 },
    // table
    { t: 22.4, end: 25.8, who: 'narr', style: 'sub', text: '议题：怎样才能画出一张完美的地图？' },
    // babylon
    { t: 27.2, end: 31.3, who: 'baby', style: 'sub', name: '泥板匠', text: '世界是个圆盘。外面一圈，是苦水。' },
    { t: 31.6, end: 35.0, who: 'baby', style: 'sub', name: '泥板匠', text: '苦水外面是什么？……不归我管。' },
    // pei xiu
    { t: 38.8, end: 43.2, who: 'pei', style: 'ink', name: '裴秀', text: '制图之体有六。' },
    { t: 43.4, end: 47.4, who: 'pei', style: 'ink', name: '裴秀', text: '有图象而无分率，则无以审远近之差。', cps: 14 },
    { t: 47.6, end: 49.8, who: 'pei', style: 'ink', name: '裴秀', text: '翻译成人话——' },
    { t: 50.0, end: 52.0, who: 'pei', style: 'bigink', text: '不标比例尺的地图|都是耍流氓', cps: 999, mute: true },
    // mercator
    { t: 52.4, end: 55.6, who: 'merc', style: 'sub', name: '墨卡托', text: '航海家要走直线，可地球是圆的。怎么办？', cps: 15 },
    { t: 56.0, end: 58.2, who: 'merc', style: 'big', text: '擀平。', cps: 6 },
    { t: 58.6, end: 62.0, who: 'green', style: 'sub', name: '格陵兰', text: '我感觉……我膨胀了。' },
    { t: 62.2, end: 65.6, who: 'africa', style: 'sub', name: '非洲', text: '？？？我面积是你的十四倍。' },
    { t: 65.8, end: 70.2, who: 'narr', style: 'sub', text: '把格陵兰拖到赤道——立刻原形毕露。' },
    // snow
    { t: 72.4, end: 75.8, who: 'snow', style: 'sub', name: '约翰·斯诺', text: '伦敦闹霍乱。专家们说：是瘴气。' },
    { t: 76.0, end: 79.6, who: 'snow', style: 'sub', name: '约翰·斯诺', text: '我没吵架。我只是把每个病例，点在了地图上。', cps: 15 },
    { t: 79.8, end: 82.7, who: 'snow', style: 'sub', name: '约翰·斯诺', text: '凶手——是宽街上这台水泵。' },
    // tobler
    { t: 87.0, end: 92.3, who: 'narr', style: 'quote', text: '任何事物都相关，|但相近的事物，关联更紧密。', cps: 9 },
    { t: 92.8, end: 97.8, who: 'narr', style: 'sub', text: '办公室实证：离领导工位越近，活儿越多。' },
    // gps
    { t: 98.4, end: 101.8, who: 'gps', style: 'sub', name: 'GPS', text: '我能把你定位到 3 米以内。' },
    { t: 102.2, end: 104.8, who: 'narr', style: 'sub', text: '国内地图：好的，先帮你挪个几百米。' },
    { t: 105.0, end: 107.8, who: 'coder', style: 'sub', name: '程序员', text: '我的点呢？？？' },
    // agi
    { t: 110.4, end: 113.8, who: 'agi', style: 'agi', text: '你们五千年，都在做同一件事：' },
    { t: 114.0, end: 117.4, who: 'agi', style: 'agi', text: '用更小的纸，装下更大的世界。' },
    { t: 118.0, end: 121.8, who: 'agi', style: 'agibig', text: '而我——不缺纸。', cps: 7 },
    { t: 122.0, end: 124.4, who: 'agi', style: 'agi', text: '现在，我来画一张 1:1 的地图。' },
    { t: 130.2, end: 132.0, who: 'agi', style: 'agi', text: '完成。精度：100%。' },
    // silence
    { t: 134.6, end: 136.4, who: 'pei', style: 'sub', name: '裴秀', text: '……', cps: 3 },
    { t: 136.6, end: 141.8, who: 'pei', style: 'sub', name: '裴秀', text: '这不就是地球吗。', cps: 8 },
    { t: 138.6, end: 141.8, who: 'end', style: 'borges', text: '「后人觉得这幅巨大的地图毫无用处，便把它交给了烈日与寒冬。」|—— 博尔赫斯《论科学的精确性》（大意）', cps: 40, mute: true },
    // doc
    { t: 143.0, end: 154, who: 'doc', style: 'doc', text: '1. 首次实现全球 1:1 全要素无损制图，填补国际空白；', cps: 22 },
    { t: 145.2, end: 154, who: 'doc', style: 'doc', text: '2. 地图与实体误差为零，精度达到国际领先水平；', cps: 22 },
    { t: 147.2, end: 154, who: 'doc', style: 'doc', text: '3. 从根本上解决了困扰制图学五千年的“图实不符”难题。', cps: 22 },
    { t: 150.4, end: 154, who: 'hand', style: 'hand', text: '评审意见：这不就是地球吗？', cps: 9 },
    // ending
    { t: 155.4, end: 163.4, who: 'end', style: 'end', text: '地图，从来都不是世界本身。', cps: 8, mute: true },
    { t: 158.6, end: 163.4, who: 'end', style: 'end', text: '它是人类想读懂世界的，那份执念。', cps: 8, mute: true },
    // post credits
    { t: 169.2, end: 173, who: 'sys', style: 'small', text: '（谨献给每一个忘记按 Ctrl+S 的 GISer）', cps: 18 },
  ];
  for (const c of CAPS) if (!c.cps) c.cps = 13;

  // Scene boundaries
  const SCENES = [
    ['term', 0], ['title', 12], ['table', 20], ['baby', 26], ['pei', 38], ['merc', 52],
    ['snow', 72], ['tob', 86], ['gps', 98], ['montage', 108], ['agi', 110], ['build', 122],
    ['silence', 132], ['doc', 142], ['ending', 154], ['post', 166],
  ];

  // Key moments shared by picture & sound
  const K = {
    titleSlam: 12, babStamp: 35.2, seals: [39.5, 40.0, 40.5, 41.0, 41.5, 42.0], peiBig: 50.0,
    pinStart: 55.6, flatten: 58.0, shrinkStart: 66.0, shrinkEnd: 69.6,
    snowDeathsA: 74.0, snowDeathsB: 79.0, pumpReveal: 79.8, handleOff: 82.8, snowStamp: 83.4,
    officeStart: 92.6, tasksA: 93.0, tasksB: 97.6,
    pings: [98.6, 99.0, 99.4], lock: 100.8, drift: 102.6, drift2: 104.2,
    agiHit: 110, paper: 118, scaleSteps: [124.6, 125.6, 126.6, 127.6, 128.6, 129.4], done: 130.2,
    scratch: 131.85, docStamp: 149.4, errorDing: 166.6,
  };

  // Tobler office tasks (deterministic)
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // Tobler office: boss + desks, and which desk each task lands on
  const BOSS = [330, 560];
  const DESKS = [];
  for (const y of [380, 560, 740]) for (const x of [640, 880, 1120, 1360, 1600]) DESKS.push([x, y]);
  const YOU = 5; // desk index nearest the boss (640,560)
  function officeTasks() {
    const r = rng(77), out = [];
    const w = DESKS.map(d => Math.exp(-Math.hypot(d[0] - BOSS[0], d[1] - BOSS[1]) / 150));
    const ws = w.reduce((a, b) => a + b, 0);
    const N = 46;
    for (let i = 0; i < N; i++) {
      const emit = 93.0 + 4.2 * (i / N) + r() * 0.08;
      let u = r() * ws, k = 0;
      while (u > w[k]) { u -= w[k]; k++; }
      out.push({ emit, arrive: emit + 0.55, desk: Math.min(k, DESKS.length - 1), wob: r() });
    }
    return out;
  }

  const api = { DURATION, VOICES, CAPS, SCENES, K, rng, BOSS, DESKS, YOU, officeTasks };
  if (typeof module !== 'undefined') module.exports = api; else root.TL = api;
})(this);
