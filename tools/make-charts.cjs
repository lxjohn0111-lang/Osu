// Pre-generate the beatmap material for the featured tracks:  node tools/make-charts.cjs [baseUrl]
// Needs the dev server (node tools/serve.mjs 8080) and Playwright. Writes music/charts.json.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:8080';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[page]', e.message));
  await page.goto(BASE + '/tools/dev/chart-builder.html');
  await page.waitForFunction(() => window.CHARTS, null, { timeout: 600000 });
  const { charts, report } = await page.evaluate(() => ({ charts: window.CHARTS, report: window.REPORT }));
  const out = path.join(__dirname, '..', 'music', 'charts.json');
  fs.writeFileSync(out, JSON.stringify(charts));
  console.log(report.join('\n'));
  console.log(`wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
  await browser.close();
})();
