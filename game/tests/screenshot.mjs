// Arranca el juego, opcionalmente simula entrada, y captura.
import { chromium } from 'playwright';

const url = process.argv[2];
const out = process.argv[3] || 'play.png';
const frames = parseInt(process.argv[4] || '20', 10);
const script = process.argv[5] || '';   // JS opcional a evaluar antes de capturar

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });

const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${(e.stack||'').split('\n').slice(0,4).join('\n')}`));

await page.goto(url, { waitUntil: 'load' });

let state = {};
try {
  await page.waitForFunction(() => window.EV_READY || window.EV_ERROR, null, { timeout: 60000 });
  const err = await page.evaluate(() => window.EV_ERROR || null);
  if (err) {
    state.error = err;
  } else {
    await page.evaluate(() => window.EV_START && window.EV_START());
    if (script) await page.evaluate(script);
    // Espera N frames reales del juego (SwiftShader es lento).
    await page.waitForFunction(
      (n) => window.EV_STATS && window.__f === undefined ? (window.__f = 0, false) : false,
      frames, { timeout: 1000 }).catch(() => {});
    await page.evaluate((n) => new Promise((res) => {
      let c = 0;
      const tick = () => { c++; if (c >= n) res(); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }), frames);
    state.stats = await page.evaluate(() => window.EV_STATS || null);
  }
} catch (e) {
  state.error = 'timeout: ' + e.message;
  try { state.stats = await page.evaluate(() => window.EV_STATS || null); } catch {}
}

await page.screenshot({ path: out, timeout: 0, animations: 'disabled' });
console.log(JSON.stringify({ state, logs: logs.slice(0, 25) }, null, 2));
await browser.close();
