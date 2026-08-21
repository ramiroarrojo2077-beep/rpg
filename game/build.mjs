// Empaqueta el juego en HTML autocontenido, sin dependencias.
//
//   node build.mjs
//     dist/ecos-del-vacio.html   documento completo, se abre con doble clic
//     dist/artifact.html         mismo juego como fragmento de página, para
//                                publicarlo hospedado (el anfitrión aporta el
//                                <!doctype>, <head> y <body>)
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

const css = readFileSync(join(here, 'src', 'page-shell.css'), 'utf8');

const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?' +
  'family=Chakra+Petch:wght@300;600&family=IBM+Plex+Mono:wght@400;500&display=swap">';

const BODY = '<div id="app"><canvas id="gl" tabindex="0"></canvas></div>';

mkdirSync(join(here, 'dist'), { recursive: true });

// --- documento completo ---------------------------------------------------
const standalone = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Ecos del Vacío</title>
<link rel="icon" href="data:,">
${FONTS}
<style>
${css}</style>
</head>
<body>
${BODY}
<script>
${sources}
</script>
</body>
</html>
`;
writeFileSync(join(here, 'dist', 'ecos-del-vacio.html'), standalone);

// --- fragmento para publicación hospedada ---------------------------------
// Sin <!doctype>, <html>, <head> ni <body>: los aporta el anfitrión. El <title>
// va igual al principio, que es de donde lo lee.
const fragment = `<title>Ecos del Vacío</title>
${FONTS}
<style>
${css}</style>
${BODY}
<script>
${sources}
</script>
`;
writeFileSync(join(here, 'dist', 'artifact.html'), fragment);

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1);
console.log(`dist/ecos-del-vacio.html — ${kb(standalone)} KB (documento completo)`);
console.log(`dist/artifact.html       — ${kb(fragment)} KB (fragmento hospedable)`);
console.log(`${ORDER.length} módulos · sin dependencias de scripts externos`);
