// Vuelca los personajes procedurales a .glb, usando el mismo código que corre
// en el juego. Uso: node tools/export-gltf.mjs [directorio-salida]
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] || join(here, '..', 'assets', 'characters'));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(pathToFileURL(join(here, 'export.html')).href, { waitUntil: 'load' });
await page.waitForFunction(() => window.EV_EXPORT_READY, null, { timeout: 30000 });

const styles = await page.evaluate(() => Object.keys(EV.Characters.STYLES));
const rows = [];
for (const style of styles) {
  const r = await page.evaluate((s) => window.EV_EXPORT(s), style);
  const bytes = Buffer.from(r.base64, 'base64');
  const file = join(outDir, `${style}.glb`);
  writeFileSync(file, bytes);
  rows.push({ ...r.stats, archivo: `${style}.glb`, kb: +(bytes.length / 1024).toFixed(1) });
}

console.table(rows.map(r => ({
  personaje: r.style, archivo: r.archivo,
  vértices: r.vertices, triángulos: r.triangles,
  huesos: r.bones, animaciones: r.animations, KB: r.kb,
})));
if (errors.length) { console.error('errores:', errors); process.exitCode = 1; }
await browser.close();
