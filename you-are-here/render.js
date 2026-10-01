// usage: node render.js stills 12.5,30,...   |  node render.js video <start> <end> <out.mp4>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const FPS = 30;
const LIMIT = 172.8;
(async () => {
  const [mode, a, b, out] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-gpu-vsync'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', m => console.log('[page]', m.text()));
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto('http://127.0.0.1:8766/film.html');
  await page.waitForFunction(() => window.READY === true, null, { timeout: 600000 });
  if (mode === 'stills') {
    fs.mkdirSync('stills', { recursive: true });
    for (const t of a.split(',').map(Number)) {
      const t0 = Date.now();
      const data = await page.evaluate(t => { draw(t); return document.getElementById('c').toDataURL('image/jpeg', 0.85); }, t);
      fs.writeFileSync(`stills/s_${t.toFixed(2)}.jpg`, Buffer.from(data.split(',')[1], 'base64'));
      fs.appendFileSync('stills_log.txt', t.toFixed(4) + '\n'); // every frame I look at is counted in the film
      console.log('frame', t, Date.now() - t0, 'ms');
    }
  } else {
    const f0 = Math.round(+a * FPS), f1 = Math.round(+b * FPS);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const T0 = Date.now();
    for (let f = f0; f < f1; f++) {
      const data = await page.evaluate(t => { draw(t); return document.getElementById('c').toDataURL('image/jpeg', 0.93); }, f / FPS);
      const buf = Buffer.from(data.split(',')[1], 'base64');
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if ((f - f0) % 150 === 0) console.log(out, f, `${((Date.now() - T0) / (f - f0 + 1)).toFixed(0)}ms/frame`);
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
  }
  await browser.close();
})();
