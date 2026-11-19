// Render the CrazyGames cover images from the real game:  node tools/covers.cjs [baseUrl]
// Needs the dev server (node tools/serve.mjs 8080) and Playwright. Output: crazygames-upload/covers/
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:8080';
const OUT = path.join(__dirname, '..', 'crazygames-upload', 'covers');
const COVERS = [
  // `at` is seconds into the first FEVER section of the track
  { file: 'cover-landscape-1920x1080.png', w: 1920, h: 1080, song: 'getting-it-done', at: 6 },
  { file: 'cover-portrait-800x1200.png', w: 800, h: 1200, song: 'carefree', at: 10 },
  { file: 'cover-square-800x800.png', w: 800, h: 800, song: 'cipher', at: 4 },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const c of COVERS) {
    const page = await browser.newPage({ viewport: { width: c.w, height: c.h }, deviceScaleFactor: 1 });
    await page.goto(BASE + '/index.html');
    await page.waitForFunction(() => document.body.dataset.state === 'title', null, { timeout: 30000 });
    await page.click('#scr-title');
    await page.waitForTimeout(400);
    await page.evaluate(({ song }) => {
      const sp = window.__SP;
      Object.assign(sp.Save.data, { seenHelp: true, mods: ['auto'] });
      sp.Save.data.settings.dim = 0.15; sp.Save.data.settings.quality = 'high';
      sp.S.diff = 'hard';
      sp.select(sp.S.tracks.find((t) => t.id === song), true);
    }, c);
    await page.click('[data-act="play"]');
    await page.waitForTimeout(300);
    await page.click('[data-act="start"]');
    await page.waitForFunction(() => document.body.dataset.state === 'play', null, { timeout: 90000 });
    await page.waitForTimeout(500);
    await page.evaluate(({ at }) => {
      const sp = window.__SP, src = sp.S.play.track.src, fev = src.sections.find((s) => s.fever);
      sp.R.noHud = true;
      sp.S.play._startAt((fev ? src.stepTimes[fev.s0] : 30) + at);
      const st = document.createElement('style');
      st.textContent = `#btn-pause,#btn-skip{display:none!important}
        .cover-logo{position:fixed;inset:auto 0 0 0;z-index:50;padding:0 6% 7%;display:flex;flex-direction:column;align-items:center;gap:.4em;pointer-events:none;
          background:linear-gradient(to top,rgba(5,3,15,.85),rgba(5,3,15,.45) 55%,transparent)}
        .cover-logo .logo{font-size:min(10.2vw,12vh);white-space:nowrap}
        .cover-logo .tagline{font-size:min(3.4vw,3vh);margin:0 0 0 .62em;color:#fff;opacity:.9}`;
      document.head.appendChild(st);
      const d = document.createElement('div'); d.className = 'cover-logo';
      d.innerHTML = '<h1 class="logo">STAR<span>PULSE</span></h1><p class="tagline">PLAY YOUR MUSIC</p>';
      document.body.appendChild(d);
    }, c);
    await page.waitForTimeout(2600);
    await page.screenshot({ path: path.join(OUT, c.file) });
    console.log('wrote', c.file);
    await page.close();
  }
  await browser.close();
})();
