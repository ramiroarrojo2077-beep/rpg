// Ecos del Vacío — arranque, entrada, cámara y bucle principal.
(function (EV) {
  'use strict';

  const V3 = EV.V3, M = EV.MathUtil;

  // Gradación de Kether-3: ámbar/ocre, clave alta, sombras cortas.
  const GRADE_KETHER = {
    vignette: 0.42,
    grain: 0.018,
    chromatic: 0.55,
    distortion: 0.018,
    lift: [0.004, 0.002, 0.008],
    gamma: [1.0, 1.005, 1.03],
    gain: [1.06, 1.0, 0.93],
    saturation: 1.10,
  };

  function qs(name, def) {
    const v = new URLSearchParams(location.search).get(name);
    return v === null ? def : v;
  }

  function boot() {
    const glCanvas = document.getElementById('gl');
    const app = document.getElementById('app');

    // Capa 2D para el HUD, encima del canvas de WebGL.
    const hudCanvas = document.createElement('canvas');
    hudCanvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    app.appendChild(hudCanvas);

    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
      'flex-direction:column;gap:18px;background:rgba(5,6,9,0.92);color:#e8e2d6;' +
      'font-family:ui-monospace,Menlo,Consolas,monospace;text-align:center;cursor:pointer;' +
      'transition:opacity .5s;z-index:10;padding:24px;';
    app.appendChild(overlay);

    // --- calidad -------------------------------------------------------------
    let quality = qs('q', null);
    let renderer;
    try {
      // Sondea primero el renderer real para elegir preset sin adivinar.
      const probe = document.createElement('canvas').getContext('webgl2');
      let rendererName = '';
      if (probe) {
        const dbg = probe.getExtension('WEBGL_debug_renderer_info');
        rendererName = dbg ? String(probe.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
      }
      if (!quality) {
        // SwiftShader = rasterizado por CPU: sin esto son segundos por frame.
        quality = /swiftshader|software|llvmpipe/i.test(rendererName) ? 'minimo' : 'alto';
      }
      renderer = EV.Renderer.create(glCanvas, quality);
    } catch (e) {
      overlay.innerHTML =
        '<div style="font-size:19px;letter-spacing:2px">ECOS DEL VACÍO</div>' +
        '<div style="opacity:.6;max-width:520px;line-height:1.7;font-size:13px">' +
        'Este navegador no pudo inicializar WebGL 2.<br>' + String(e && e.message || e) + '</div>';
      window.EV_ERROR = String(e && e.message || e);
      return;
    }

    // --- mundo ---------------------------------------------------------------
    const seed = parseInt(qs('seed', '1337'), 10);
    const terrain = EV.Terrain.create(seed);
    const props = EV.Props.create(terrain, seed + 991);
    const sky = EV.Sky.create();
    const audio = EV.Audio.create();
    const hud = EV.HUD.create(hudCanvas);
    const game = EV.Game.create({ terrain, sky, audio, hud, seed });

    const scene = {
      camera: {
        pos: V3.create(0, 0, 0),
        dir: V3.create(0, 0, -1),
        fov: 62 * Math.PI / 180,
        near: 0.28,
        far: 45000,
      },
      sky, terrain, props,
      nodes: game.nodes,
      characters: game.characters,
      particles: game.particles,
      lights: game.lights,
      time: 0,
      storm: 0,
      fogDensity: 0.00013,
      volumetricDensity: 0.00055,
      exposure: 0.9,
      bloomThreshold: 1.05,
      bloomStrength: 0.06,
      aoRadius: 0.85,
      aoIntensity: 0.95,
      grade: Object.assign({}, GRADE_KETHER),
      corruption: 0,
      damageFlash: 0,
      taaEnabled: qs('taa', '1') !== '0',
    };

    // --- entrada -------------------------------------------------------------
    const keys = Object.create(null);
    const input = {
      moveX: 0, moveZ: 0, lookX: 0, lookY: 0,
      sprint: false, thrust: false, hold: false,
      jumpPressed: false, dashPressed: false, grapplePressed: false,
    };
    let pointerLocked = false;
    let paused = false;
    let photoMode = false;

    const SENS = 0.0022;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) { return; }
      keys[e.code] = true;
      if (e.code === 'KeyR') game.reload();
      if (e.code === 'KeyF') game.fracture();
      if (e.code === 'KeyH') hud.state.extendedHUD = !hud.state.extendedHUD;
      if (e.code === 'KeyP') {
        photoMode = !photoMode;
        hudCanvas.style.opacity = photoMode ? '0' : '1';
      }
      if (e.code === 'KeyE') {
        input.grapplePressed = true;
        if (game.stage === 'deploy') {
          const d = Math.hypot(game.player.pos[0] - game.hill[0], game.player.pos[2] - game.hill[2]);
          if (d < 16) game.deployAntenna();
        }
      }
      if (e.code === 'Space') { input.jumpPressed = true; e.preventDefault(); }
      if (e.code === 'ControlLeft' || e.code === 'ControlRight') input.dashPressed = true;
      if (e.code === 'Escape') { paused = true; document.exitPointerLock(); }
    });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });

    glCanvas.addEventListener('mousedown', (e) => {
      if (!pointerLocked) return;
      if (e.button === 0) keys.Fire = true;
      if (e.button === 2) input.dashPressed = true;
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) keys.Fire = false; });
    glCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('mousemove', (e) => {
      if (!pointerLocked) return;
      input.lookX += e.movementX * SENS;
      input.lookY += e.movementY * SENS;
    });
    document.addEventListener('pointerlockchange', () => {
      pointerLocked = document.pointerLockElement === glCanvas;
      if (!pointerLocked && started) { paused = true; showPause(); }
    });

    function readKeys() {
      input.moveZ = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
      input.moveX = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
      input.sprint = !!(keys.ShiftLeft || keys.ShiftRight);
      input.hold = input.sprint;
      input.thrust = !!keys.Space;
    }
    function clearEdges() {
      input.jumpPressed = false;
      input.dashPressed = false;
      input.grapplePressed = false;
      input.lookX = 0;
      input.lookY = 0;
    }

    // --- cámara --------------------------------------------------------------
    const camTarget = V3.create();
    const camDesired = V3.create();
    const camPos = V3.create();
    const look = V3.create();
    let camDist = 4.4;
    let firstFrame = true;

    function updateCamera(dt) {
      const p = game.player;
      p.lookVector(look);

      // Objetivo: la cabeza, con offset de hombro.
      V3.set(camTarget, p.pos[0], p.pos[1] + 1.45, p.pos[2]);
      const rightX = Math.cos(p.yaw), rightZ = -Math.sin(p.yaw);
      camTarget[0] += rightX * 0.62;
      camTarget[2] += rightZ * 0.62;

      const targetDist = p.attached ? 6.6 : (Math.hypot(p.vel[0], p.vel[2]) > 9 ? 5.0 : 4.4);
      camDist = M.damp(camDist, targetDist, 0.25, dt);

      V3.addScaled(camDesired, camTarget, look, -camDist);
      camDesired[1] += 0.35;

      // No atravesar el terreno.
      const groundY = terrain.heightAt(camDesired[0], camDesired[2]) + 0.85;
      if (camDesired[1] < groundY) camDesired[1] = groundY;

      if (firstFrame) { V3.copy(camPos, camDesired); firstFrame = false; }
      else {
        // Amortiguación distinta por eje: vertical más lento, se siente pesado.
        camPos[0] = M.damp(camPos[0], camDesired[0], 0.045, dt);
        camPos[1] = M.damp(camPos[1], camDesired[1], 0.085, dt);
        camPos[2] = M.damp(camPos[2], camDesired[2], 0.045, dt);
      }

      // Sacudida: pisadas del titán e impactos. Desacoplable por accesibilidad.
      const shake = game.camShake * (scene.cameraShakeScale === undefined ? 1 : scene.cameraShakeScale);
      if (shake > 0.001) {
        const t = game.time * 47;
        camPos[0] += Math.sin(t * 1.7) * shake * 0.30;
        camPos[1] += Math.sin(t * 2.3 + 1.1) * shake * 0.26;
        camPos[2] += Math.cos(t * 1.9 + 0.4) * shake * 0.30;
      }

      V3.copy(scene.camera.pos, camPos);
      V3.sub(scene.camera.dir, camTarget, camPos);
      V3.normalize(scene.camera.dir, scene.camera.dir);
    }

    // --- redimensionado ------------------------------------------------------
    let dpr = 1;
    function resize() {
      const w = app.clientWidth || window.innerWidth;
      const h = app.clientHeight || window.innerHeight;
      // Limita el DPR: a 4K nativo el coste de los pases se duplica sin ganancia
      // perceptible, porque el TAA ya reconstruye subpíxel.
      dpr = Math.min(window.devicePixelRatio || 1, quality === 'minimo' ? 1 : 1.5);
      const rw = Math.max(2, Math.floor(w * dpr));
      const rh = Math.max(2, Math.floor(h * dpr));
      glCanvas.width = rw; glCanvas.height = rh;
      glCanvas.style.width = w + 'px';
      glCanvas.style.height = h + 'px';
      renderer.resize(rw, rh);
      renderer.resetHistory();
      hud.resize(w, h, Math.min(window.devicePixelRatio || 1, 2));
    }
    window.addEventListener('resize', resize);

    // --- pantallas -----------------------------------------------------------
    let started = false;
    function showTitle() {
      overlay.innerHTML =
        '<div style="font-size:11px;letter-spacing:7px;opacity:.5">KETHER-3 · EXPEDICIÓN MERIDIANO</div>' +
        '<div style="font-size:38px;letter-spacing:9px;font-weight:300">ECOS DEL VACÍO</div>' +
        '<div style="opacity:.55;max-width:560px;line-height:1.85;font-size:12.5px">' +
        'WASD moverse · ratón mirar · <b>Shift</b> correr / sostenerse · <b>Ctrl</b> o clic derecho esquivar<br>' +
        '<b>Espacio</b> saltar (mantener: propulsor) · <b>clic izq.</b> disparar · <b>E</b> gancho / interactuar<br>' +
        '<b>R</b> recargar · <b>F</b> Fractura · <b>H</b> HUD extendido · <b>P</b> modo foto · <b>Esc</b> pausa' +
        '</div>' +
        '<div style="margin-top:10px;padding:11px 26px;border:1px solid rgba(232,226,214,.32);' +
        'letter-spacing:3px;font-size:13px">CLIC PARA DESPERTAR</div>' +
        '<div style="opacity:.32;font-size:10.5px;letter-spacing:1px;margin-top:4px">calidad: ' +
        quality + ' · ' + String(renderer.info.renderer).slice(0, 64) + '</div>';
      overlay.style.opacity = '1';
      overlay.style.pointerEvents = 'auto';
    }
    function showPause() {
      overlay.innerHTML =
        '<div style="font-size:24px;letter-spacing:7px;font-weight:300">PAUSA</div>' +
        '<div style="opacity:.5;font-size:12px">clic para volver a la expedición</div>';
      overlay.style.opacity = '1';
      overlay.style.pointerEvents = 'auto';
    }
    function hideOverlay() {
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
    }

    overlay.addEventListener('click', () => {
      audio.start();
      audio.resume();
      started = true;
      paused = false;
      hideOverlay();
      glCanvas.requestPointerLock();
      renderer.resetHistory();
    });

    // --- bucle ---------------------------------------------------------------
    let last = performance.now();
    let acc = 0, frames = 0, fps = 0;

    function frame(now) {
      requestAnimationFrame(frame);
      let dt = (now - last) / 1000;
      last = now;
      // Acota el paso: una pestaña en segundo plano no debe teletransportar nada.
      dt = Math.min(dt, 0.05);

      acc += dt; frames++;
      if (acc >= 0.5) { fps = frames / acc; acc = 0; frames = 0; }

      if (started && !paused) {
        readKeys();
        if (keys.Fire && !photoMode) game.fire(scene.camera.pos);
        game.update(dt, input, scene.camera.pos);
        clearEdges();
      } else {
        // En pausa/portada el mundo sigue respirando, pero nadie recibe daño.
        game.time += dt * 0.25;
        sky.setTurbidity(1.0 + game.storm * 2.6);
      }

      updateCamera(started && !paused ? dt : dt * 0.15);

      scene.time = game.time;
      scene.storm = game.storm;
      scene.corruption = game.corruption;
      scene.damageFlash = game.player.damageFlash;
      // La tormenta espesa la atmósfera y la niebla volumétrica a la vez.
      scene.fogDensity = 0.00013 + game.storm * 0.00075;
      scene.volumetricDensity = 0.00055 + game.storm * 0.0016;
      scene.exposure = 0.9 - game.storm * 0.12;

      renderer.render(scene);
      if (!photoMode) hud.draw(game);

      window.EV_STATS = {
        fps: Math.round(fps), quality,
        stage: game.stage, storm: +game.storm.toFixed(2),
        particles: game.particles.count,
        clip: game.avatar.animator.currentName,
        chars: game.characters.length,
        titanHp: game.titan.hp, playerIntegrity: Math.round(game.player.integrity),
      };
    }

    resize();
    showTitle();
    requestAnimationFrame(frame);

    // Enganche para pruebas automatizadas y capturas.
    window.EV_GAME = game;
    window.EV_SCENE = scene;
    window.EV_RENDERER = renderer;
    window.EV_START = () => { started = true; paused = false; hideOverlay(); };
    window.EV_READY = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.EV = window.EV || {});
