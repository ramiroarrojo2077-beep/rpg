// Empaqueta el juego en un único HTML autocontenido, sin dependencias.
// Uso: node build.mjs   →   dist/ecos-del-vacio.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// El orden importa: los módulos se registran sobre el namespace global EV y
// algunos leen del anterior en tiempo de carga (60-shaders-geo registra su
// chunk en EV.Shaders, que define 30-shaders).
const ORDER = [
  '00-math.js',
  '05-quat.js',
  '10-gl.js',
  '20-noise.js',
  '30-shaders.js',
  '40-sky.js',
  '45-terrain.js',
  '48-anim.js',
  '49-charmesh.js',
  '50-geometry.js',
  '51-characters.js',
  '52-props.js',
  '56-particles.js',
  '60-shaders-geo.js',
  '62-shaders-post.js',
  '70-renderer.js',
  '72-titan.js',
  '74-player.js',
  '80-audio.js',
  '85-hud.js',
  '90-game.js',
  '99-main.js',
];

const sources = ORDER.map((f) => {
  const code = readFileSync(join(here, 'src', f), 'utf8');
  return `/* ===== ${f} ===== */\n${code}`;
}).join('\n');

const template = readFileSync(join(here, 'index.html'), 'utf8');

// Sustituye la lista de <script src> por un único bloque en línea.
const bundled = template.replace(
  /<script src="src\/[^"]+"><\/script>\s*/g,
  '',
).replace(
  '</body>',
  `<script>\n${sources}\n</script>\n</body>`,
);

mkdirSync(join(here, 'dist'), { recursive: true });
const out = join(here, 'dist', 'ecos-del-vacio.html');
writeFileSync(out, bundled);

const kb = (Buffer.byteLength(bundled) / 1024).toFixed(1);
console.log(`dist/ecos-del-vacio.html — ${kb} KB, ${ORDER.length} módulos, sin dependencias externas`);
