// Prueba funcional del bucle de misión completo, sin depender del render.
import { chromium } from 'playwright';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(process.argv[2], { waitUntil: 'load' });
await page.waitForFunction(() => window.EV_READY || window.EV_ERROR, null, { timeout: 60000 });

const report = await page.evaluate(async () => {
  const g = window.EV_GAME;
  const out = [];
  const check = (name, cond, extra) => out.push({ name, ok: !!cond, extra: extra ?? '' });

  // Paso el juego a mano con dt fijo: la prueba no depende del framerate.
  const input = {
    moveX: 0, moveZ: 0, lookX: 0, lookY: 0, sprint: false, thrust: false,
    hold: true, jumpPressed: false, dashPressed: false, grapplePressed: false,
  };
  const step = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) g.update(dt, input, g.player.pos); };

  window.EV_START();
  check('estado inicial es la cresta', g.stage === 'hill', g.stage);
  check('titán dormido al empezar', !g.titanAwake && g.titan.state === 'dormant', g.titan.state);

  // --- 1. llegar a la cresta
  g.player.pos[0] = g.hill[0]; g.player.pos[2] = g.hill[2];
  g.player.pos[1] = g.terrain.heightAt(g.hill[0], g.hill[2]) + 2;
  step(10);
  check('llegar a la cresta habilita el despliegue', g.stage === 'deploy', g.stage);
  check('aparece el prompt de antena', g.hud.state.prompt.includes('antena'), g.hud.state.prompt);

  // --- 2. desplegar antena
  g.deployAntenna();
  step(10);
  check('antena visible tras desplegarla', g.antenna.visible);
  check('la antena despierta al titán', g.titanAwake === true);
  check('el objetivo avanza a titán', g.stage === 'titan', g.stage);

  // --- 3. el titán empieza a caminar y persigue
  g.titan.pos[0] = g.player.pos[0]; g.titan.pos[2] = g.player.pos[2] - 120;
  g.titan.placeFeet();
  const posBefore = g.titan.pos[2];
  step(240);
  check('el titán despierta y se mueve', g.titan.state !== 'dormant', g.titan.state);
  check('el titán se acerca al jugador', Math.abs(g.titan.pos[2] - posBefore) > 1,
        `Δz=${(g.titan.pos[2] - posBefore).toFixed(1)}`);

  // --- 4. patas apoyadas en el terreno real
  let maxFootError = 0;
  for (const leg of g.titan.legs) {
    const gy = g.terrain.heightAt(leg.planted[0], leg.planted[2]);
    maxFootError = Math.max(maxFootError, Math.abs(leg.planted[1] - gy));
  }
  check('los pies siguen el terreno', maxFootError < 2.5, `error máx ${maxFootError.toFixed(2)} m`);

  // --- 5. daño desde el suelo: el blindaje debe aguantar
  const plate0 = g.titan.plates[0];
  const hpBefore = plate0.userData.hp;
  g.titan.damagePlate(0, 3.5);
  check('el blindaje casi no cede desde el suelo',
        hpBefore - plate0.userData.hp <= 4, `-${(hpBefore - plate0.userData.hp).toFixed(1)} hp`);

  // --- 6. gancho: hay anclaje a rango
  const anchor = g.titan.nearestAnchor(g.player.pos, g.player.SUIT.grappleRange * 6);
  check('el titán expone anclajes de gancho', !!anchor, anchor && anchor.name);

  // --- 7. escalada: engancharse y subir al lomo
  g.player.attached = g.titan.anchorByName('pataDelIzq');
  input.moveZ = 1;
  step(6);
  check('escalar avanza al siguiente anclaje',
        g.player.attached && g.player.attached.name === 'cadera', g.player.attached?.name);
  step(40);
  check('escalar llega al lomo',
        g.player.attached && g.player.attached.name === 'lomo', g.player.attached?.name);
  input.moveZ = 0;

  // --- 8. romper el blindaje desde arriba
  for (let i = 0; i < g.titan.plates.length; i++) {
    for (let k = 0; k < 6; k++) g.titan.damagePlate(i, 26);
  }
  step(4);
  check('todas las placas rotas', g.titan.plates.every(p => p.userData.broken));
  check('el núcleo queda expuesto', g.titan.core.visible === true);

  // --- 9. ciclo de núcleo
  const cycleBefore = g.titan.cycle;
  g.titan.damageCore(340);
  g.titan.resetCycle();
  step(4);
  check('cerrar ciclo rehace el blindaje',
        g.titan.cycle === cycleBefore + 1 && g.titan.plates.every(p => !p.userData.broken),
        `ciclo ${g.titan.cycle}`);

  // --- 10. muerte del titán y absorción
  g.titan.hp = 20;
  for (const p of g.titan.plates) { p.userData.broken = true; p.visible = false; }
  g.titan.core.visible = true;
  g.titan.damageCore(50);
  check('el titán muere al agotar el núcleo', g.titan.alive === false, `hp=${g.titan.hp}`);

  g.mode = 'absorb'; g.absorbTime = 0;
  step(420);
  check('la absorción desbloquea Fractura', g.player.hasFracture === true);
  check('la absorción sube la corrupción', g.corruption > 0, g.corruption.toFixed(2));

  // --- 11. sistema térmico
  g.mode = 'play';
  g.player.heat = 0; g.player.overheated = 0;
  g.player.addHeat(100);
  check('saturar el calor bloquea el traje', g.player.overheated > 0);
  check('no se puede gastar en sobrecalentamiento', g.player.canSpend(1) === false);
  g.player.overheated = 0; g.player.heat = 0;
  check('el traje se recupera', g.player.canSpend(20) === true);

  // --- 12. daño e invulnerabilidad del esquive
  g.player.integrity = 100; g.player.iframes = 0;
  g.player.takeDamage(30, g);
  check('el daño baja la integridad', g.player.integrity === 70, g.player.integrity);
  g.player.iframes = 0.2;
  g.player.takeDamage(30, g);
  check('los i-frames del esquive anulan el daño', g.player.integrity === 70, g.player.integrity);

  // --- 13. muerte y reaparición
  g.player.iframes = 0;
  g.player.takeDamage(999, g);
  check('el jugador muere al agotar integridad', g.player.dead === true);
  g.respawn();
  check('reaparece con integridad completa',
        !g.player.dead && g.player.integrity === 100, g.player.integrity);

  // --- 14. el ciclo de tormenta altera la atmósfera
  g.stormTarget = 1.0;
  step(300);
  check('la tormenta sube la turbidez atmosférica',
        g.sky.turbidity > 1.5, `turbidez ${g.sky.turbidity.toFixed(2)}`);

  return out;
});

const failed = report.filter(r => !r.ok);
for (const r of report) {
  console.log(`${r.ok ? '  ok  ' : ' FALLA'} ${r.name}${r.extra ? '  (' + r.extra + ')' : ''}`);
}
console.log(`\n${report.length - failed.length}/${report.length} comprobaciones pasaron`);
if (errors.length) console.log('errores de página:\n' + errors.slice(0, 8).join('\n'));
await browser.close();
process.exit(failed.length || errors.length ? 1 : 0);
