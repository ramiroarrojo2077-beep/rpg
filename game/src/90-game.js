// Ecos del Vacío — lógica de juego: misión, combate y estado del mundo.
// La cadena de misión sigue la regla del documento de exploración: causalidad
// antes que marcador. El valle no se marca hasta que la antena existe.
(function (EV) {
  'use strict';

  const V3 = EV.V3, M = EV.MathUtil;

  const OBJECTIVES = {
    hill: {
      text: 'El escáner de corto alcance no llega al valle.',
      hint: 'Necesito altura y línea de vista. La cresta al norte sirve.',
    },
    deploy: {
      text: 'Estoy en la cresta. La antena entra acá.',
      hint: '[E] para desplegar el mástil de comunicaciones.',
    },
    titan: {
      text: 'La antena despertó algo. Hay una firma enorme moviéndose al sur.',
      hint: 'No puedo extraer nada con eso caminando encima del depósito.',
    },
    climb: {
      text: 'El blindaje aguanta todo lo que le tiro desde el suelo.',
      hint: 'Cuando clava la pata delantera queda quieta. Ahí engancho. [E]',
    },
    core: {
      text: 'Blindaje caído. El núcleo está expuesto.',
      hint: 'Ventana corta. Disparar al núcleo antes de que se cierre.',
    },
    done: {
      text: 'Núcleo absorbido. El traje integró el sustrato.',
      hint: 'Fractura disponible. [F]',
    },
  };

  function create(opts) {
    const { terrain, sky, audio, hud, seed } = opts;

    // --- posición de la colina objetivo (la cresta más alta al norte) --------
    let hill = V3.create(0, 0, -430);
    {
      let best = -1e9;
      for (let a = 0; a < 64; a++) {
        const ang = (a / 64) * Math.PI * 2;
        for (let r = 300; r < 620; r += 40) {
          const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
          const h = terrain.heightAt(x, z);
          // Prefiere altura, y que quede al norte para tener un hito legible.
          const score = h - Math.abs(z + r) * 0.02 + (z < 0 ? 12 : 0);
          if (score > best) { best = score; V3.set(hill, x, h, z); }
        }
      }
    }

    const spawn = [hill[0] * 0.15 + 60, 0, hill[2] * 0.15 + 330];
    const player = EV.Player.create(terrain, spawn);
    player.yaw = Math.atan2(hill[0] - spawn[0], hill[2] - spawn[2]);

    const titan = EV.Titan.create(terrain);
    V3.set(titan.pos, 0, 0, 40);
    titan.placeFeet();

    // --- modelo del jugador (tercera persona) --------------------------------
    const suitMat = (a, r, m, e) => ({ albedo: a, rough: r, metal: m, emissive: e || [0, 0, 0], damage: 0 });
    const meshes = {
      torso: EV.Geo.box(0.62, 0.78, 0.38),
      hips: EV.Geo.box(0.52, 0.30, 0.34),
      head: EV.Geo.box(0.30, 0.30, 0.32),
      visor: EV.Geo.box(0.26, 0.12, 0.06),
      limb: EV.Geo.cylinder(0.11, 0.09, 1, 8),
      pack: EV.Geo.box(0.46, 0.50, 0.22),
      gun: EV.Geo.box(0.10, 0.14, 0.72),
      antennaMast: EV.Geo.cylinder(0.09, 0.05, 1, 8),
      antennaDish: EV.Geo.cylinder(1.0, 0.2, 0.24, 14),
      antennaBase: EV.Geo.box(1.5, 0.4, 1.5),
    };

    const suit = EV.Geo.node({ name: 'jugador' });
    const suitBody = EV.Geo.node({ pos: [0, 1.30, 0] });
    suit.children.push(suitBody);
    const SUIT_A = [0.255, 0.240, 0.220], SUIT_B = [0.150, 0.142, 0.132];
    suitBody.children.push(
      EV.Geo.node({ mesh: meshes.torso, pos: [0, 0.10, 0], material: suitMat(SUIT_A, 0.55, 0.35) }),
      EV.Geo.node({ mesh: meshes.hips, pos: [0, -0.42, 0], material: suitMat(SUIT_B, 0.62, 0.30) }),
      EV.Geo.node({ mesh: meshes.pack, pos: [0, 0.10, 0.28], material: suitMat(SUIT_B, 0.48, 0.55) }),
      EV.Geo.node({ mesh: meshes.head, pos: [0, 0.66, 0], material: suitMat(SUIT_B, 0.40, 0.45) }),
      EV.Geo.node({
        mesh: meshes.visor, pos: [0, 0.68, -0.16],
        material: suitMat([0.02, 0.03, 0.04], 0.08, 0.0, [0.10, 0.28, 0.42]),
      }),
    );
    const armR = EV.Geo.node({ pos: [0.40, 0.22, 0], rot: [0.2, 0, 0.12] });
    armR.children.push(EV.Geo.node({
      mesh: meshes.limb, pos: [0, -0.32, 0], scl: [1, 0.72, 1], material: suitMat(SUIT_A, 0.6, 0.35),
    }));
    const armL = EV.Geo.node({ pos: [-0.40, 0.22, 0], rot: [0.2, 0, -0.12] });
    armL.children.push(EV.Geo.node({
      mesh: meshes.limb, pos: [0, -0.32, 0], scl: [1, 0.72, 1], material: suitMat(SUIT_A, 0.6, 0.35),
    }));
    const legR = EV.Geo.node({ pos: [0.16, -0.55, 0] });
    legR.children.push(EV.Geo.node({
      mesh: meshes.limb, pos: [0, -0.34, 0], scl: [1.1, 0.78, 1.1], material: suitMat(SUIT_B, 0.65, 0.30),
    }));
    const legL = EV.Geo.node({ pos: [-0.16, -0.55, 0] });
    legL.children.push(EV.Geo.node({
      mesh: meshes.limb, pos: [0, -0.34, 0], scl: [1.1, 0.78, 1.1], material: suitMat(SUIT_B, 0.65, 0.30),
    }));
    const gun = EV.Geo.node({
      mesh: meshes.gun, pos: [0.42, -0.10, -0.30],
      material: suitMat([0.10, 0.10, 0.11], 0.35, 0.75),
    });
    suitBody.children.push(armR, armL, legR, legL, gun);

    // --- antena --------------------------------------------------------------
    const antenna = EV.Geo.node({ name: 'antena', pos: [hill[0], hill[1], hill[2]], visible: false });
    antenna.children.push(
      EV.Geo.node({ mesh: meshes.antennaBase, pos: [0, 0.2, 0], material: suitMat([0.13, 0.12, 0.11], 0.7, 0.5) }),
      EV.Geo.node({ mesh: meshes.antennaMast, pos: [0, 3.2, 0], scl: [1, 6, 1], material: suitMat([0.16, 0.15, 0.14], 0.5, 0.8) }),
      EV.Geo.node({
        mesh: meshes.antennaDish, pos: [0, 6.4, 0], rot: [0.5, 0, 0],
        material: suitMat([0.20, 0.19, 0.18], 0.35, 0.6),
      }),
      EV.Geo.node({
        mesh: meshes.head, pos: [0, 6.9, 0], scl: [0.3, 0.3, 0.3],
        material: suitMat([0.02, 0.02, 0.02], 0.2, 0, [0.4, 1.6, 0.7]),
      }),
    );

    // --- estado del juego ----------------------------------------------------
    const g = {
      terrain, sky, audio, hud, player, titan, suit, antenna,
      hill,
      nodes: [suit, titan.root, antenna],
      time: 0,
      mode: 'play',            // play | absorb | victory
      absorbTime: 0,
      stage: 'hill',           // hill | deploy | titan | climb | core | done
      titanAwake: false,
      antennaDeployed: false,
      storm: 0,
      stormTarget: 0,
      stormTimer: 26,
      camShake: 0,
      grappleAvailable: false,
      difficultyTelegraph: 1.0,
      corruption: 0,
      hitMarker: 0,
      tracers: [],
      quakeRings: [],
      checkpoint: V3.create(spawn[0], 0, spawn[2]),
    };

    hud.state.objective = OBJECTIVES.hill.text;
    hud.state.objectiveHint = OBJECTIVES.hill.hint;

    // --- eventos de audio del titán -----------------------------------------
    titan.onFootfall = (pos, intensity) => {
      const d = V3.dist(pos, player.pos);
      const atten = M.clamp(1 - d / 260, 0, 1);
      if (atten > 0.02) audio.sfx.titanStep(intensity * atten);
      g.camShake = Math.max(g.camShake, atten * atten * 0.5);
    };
    titan.onAttack = () => audio.sfx.titanAttack();
    titan.onImpact = (kind, a) => {
      audio.sfx.titanImpact();
      g.camShake = Math.max(g.camShake, 1.0);
      // Resolución de daño: el alcance depende del ataque.
      const d = V3.dist(titan.pos, player.pos);
      let hit = false;
      if (kind === 'quake') hit = player.grounded && d < a.range;
      else {
        // slam/sweep: cono al frente del titán
        const dx = player.pos[0] - titan.pos[0], dz = player.pos[2] - titan.pos[2];
        const ang = Math.atan2(dx, dz);
        const rel = Math.abs(M.wrapAngle(ang - titan.yaw));
        hit = d < a.range && rel < (kind === 'sweep' ? 1.0 : 0.7);
      }
      if (hit && !player.attached) {
        if (player.takeDamage(a.damage, g)) {
          audio.sfx.damage();
        }
      }
      if (kind === 'quake') {
        g.quakeRings.push({ x: titan.pos[0], z: titan.pos[2], r: 0, life: 1.6 });
      }
    };

    // --- callbacks del jugador ----------------------------------------------
    g.onDash = () => audio.sfx.dash();
    g.onLand = () => audio.sfx.land();
    g.onHardLanding = () => audio.sfx.hardLanding();
    g.onThrust = () => { };
    g.onGrapple = () => audio.sfx.grapple();
    g.onGrappleMiss = () => audio.sfx.grappleMiss();
    g.onAttach = () => {
      audio.sfx.attach();
      hud.say('Enganchado. Mantené [Shift] cuando se sacuda, o te tira.', 5);
      if (g.stage === 'climb') {
        hud.state.objectiveHint = 'Subir al lomo con [W]. Romper las placas desde arriba.';
      }
    };
    g.onClimb = () => audio.sfx.climb();
    g.onShakenOff = () => {
      audio.sfx.shakenOff();
      player.takeDamage(12, g);
      hud.say('Te sacudió. Volvé a engancharte cuando clave la pata.', 4);
    };
    g.onPerfectDodge = () => {
      audio.sfx.perfectDodge();
      hud.toast('ESQUIVE PERFECTO', 1.2);
    };
    g.onPlayerDeath = () => {
      audio.sfx.death();
      hud.say('Integridad crítica. Reinicio de traje.', 3);
    };
    g.dodgeWindowOpen = () => {
      if (!titan.alive) return false;
      if (titan.state === 'attack') return true;
      if (titan.state === 'telegraph') {
        const a = { slam: 1.15, sweep: 0.95, quake: 1.6 }[titan.attackKind] || 1;
        return titan.stateTime > a * g.difficultyTelegraph - 0.30;
      }
      return false;
    };
    g.respawn = () => {
      player.dead = false;
      player.integrity = player.maxIntegrity;
      player.heat = 0;
      player.overheated = 0;
      V3.set(player.pos, g.checkpoint[0],
        terrain.heightAt(g.checkpoint[0], g.checkpoint[2]) + 2, g.checkpoint[2]);
      V3.set(player.vel, 0, 0, 0);
      if (titan.alive && g.titanAwake) titan.setState('walk');
    };

    // --- disparo -------------------------------------------------------------
    const _ray = V3.create(), _tmp = V3.create(), _hitPt = V3.create();

    function raySphere(ro, rd, center, radius) {
      const ox = ro[0] - center[0], oy = ro[1] - center[1], oz = ro[2] - center[2];
      const b = ox * rd[0] + oy * rd[1] + oz * rd[2];
      const c = ox * ox + oy * oy + oz * oz - radius * radius;
      const disc = b * b - c;
      if (disc < 0) return -1;
      const t = -b - Math.sqrt(disc);
      return t > 0 ? t : -1;
    }

    function nodeWorldPos(n, out) {
      out[0] = n.world[12]; out[1] = n.world[13]; out[2] = n.world[14];
      return out;
    }

    function fire(camPos) {
      if (player.dead || player.ammo <= 0 || player.fireCooldown > 0) {
        if (player.ammo <= 0) reload();
        return;
      }
      if (!player.canSpend(player.HEAT.shotCost)) return;
      player.ammo--;
      player.fireCooldown = 0.11;
      player.addHeat(player.HEAT.shotCost);
      audio.sfx.shot();

      player.lookVector(_ray);
      let bestT = 1e9, bestKind = null, bestIndex = -1;

      if (titan.alive) {
        // Núcleo primero: tiene prioridad de impacto cuando está expuesto.
        if (titan.core.visible) {
          nodeWorldPos(titan.core, _tmp);
          const t = raySphere(camPos, _ray, _tmp, 3.4);
          if (t > 0 && t < bestT) { bestT = t; bestKind = 'core'; }
        }
        for (let i = 0; i < titan.plates.length; i++) {
          const pl = titan.plates[i];
          if (pl.userData.broken) continue;
          nodeWorldPos(pl, _tmp);
          const t = raySphere(camPos, _ray, _tmp, 3.6);
          if (t > 0 && t < bestT) { bestT = t; bestKind = 'plate'; bestIndex = i; }
        }
        // Cuerpo: impacta pero casi no hace daño (el blindaje aguanta).
        nodeWorldPos(titan.body, _tmp);
        const tb = raySphere(camPos, _ray, _tmp, 11.0);
        if (tb > 0 && tb < bestT) { bestT = tb; bestKind = 'hull'; }
      }

      V3.addScaled(_hitPt, camPos, _ray, bestKind ? bestT : 400);
      g.tracers.push({
        from: V3.create(camPos[0], camPos[1] - 0.25, camPos[2]),
        to: V3.create(_hitPt[0], _hitPt[1], _hitPt[2]),
        life: 0.07,
      });

      if (bestKind === 'plate') {
        // Desde el suelo el blindaje casi no cede: hay que subir.
        const onTop = !!player.attached;
        const dmg = onTop ? 26 : 3.5;
        const broke = titan.damagePlate(bestIndex, dmg);
        audio.sfx.hit();
        g.hitMarker = 0.18;
        if (broke) {
          audio.sfx.plateBreak();
          hud.toast('PLACA DESTRUIDA', 1.4);
          const left = titan.plates.filter(x => !x.userData.broken).length;
          if (left === 0) {
            setStage('core');
            titan.setState('stunned');
            audio.sfx.titanRoar();
          }
        }
      } else if (bestKind === 'core') {
        titan.damageCore(34);
        audio.sfx.hit();
        g.hitMarker = 0.25;
        if (!titan.alive) {
          beginAbsorb();
        } else if (titan.hp <= titan.maxHp * (1 - (titan.cycle + 1) / 3)) {
          // Cierra el ciclo: el blindaje se rehace y sube la agresividad.
          titan.resetCycle();
          g.difficultyTelegraph = Math.max(0.6, 1.0 - titan.cycle * 0.18);
          setStage('climb');
          hud.say('Reconstruyó el blindaje. Otra vez arriba.', 4);
        }
      } else if (bestKind === 'hull') {
        audio.sfx.hit();
        g.hitMarker = 0.08;
      }
    }
    g.fire = fire;

    function reload() {
      if (player.reloadTimer > 0 || player.ammo === player.maxAmmo || player.reserve <= 0) return;
      player.reloadTimer = 1.5;
    }
    g.reload = reload;

    // --- Fractura (poder del núcleo) ----------------------------------------
    function fracture() {
      if (!player.hasFracture || player.fractureCooldown > 0) return;
      if (!player.canSpend(player.HEAT.fractureCost)) return;
      player.addHeat(player.HEAT.fractureCost);
      player.fractureCooldown = 3.0;
      audio.sfx.fracture();
      g.camShake = Math.max(g.camShake, 0.8);
      g.quakeRings.push({ x: player.pos[0], z: player.pos[2], r: 0, life: 1.0, friendly: true });
      // Rompe blindaje en un cono al frente, aunque estés en el suelo.
      if (titan.alive) {
        player.lookVector(_ray);
        for (let i = 0; i < titan.plates.length; i++) {
          const pl = titan.plates[i];
          if (pl.userData.broken) continue;
          nodeWorldPos(pl, _tmp);
          if (V3.dist(_tmp, player.pos) < 46) titan.damagePlate(i, 40);
        }
      }
    }
    g.fracture = fracture;

    // --- misión --------------------------------------------------------------
    function setStage(s) {
      g.stage = s;
      const o = OBJECTIVES[s];
      if (o) {
        hud.state.objective = o.text;
        hud.state.objectiveHint = o.hint;
        audio.sfx.objective();
      }
    }
    g.setStage = setStage;

    function deployAntenna() {
      if (g.antennaDeployed) return;
      g.antennaDeployed = true;
      antenna.visible = true;
      antenna.pos[1] = terrain.heightAt(hill[0], hill[2]);
      audio.sfx.antenna();
      hud.say('Antena desplegada. Enlace con la Meridiano restablecido.', 5);
      setTimeout(() => {
        hud.say('El escáner marca silicato al sur… y algo más grande moviéndose encima.', 6);
      }, 5200);
      g.titanAwake = true;
      audio.sfx.titanRoar();
      setStage('titan');
      V3.set(g.checkpoint, hill[0], 0, hill[2] + 30);
      setTimeout(() => setStage('climb'), 12000);
    }
    g.deployAntenna = deployAntenna;

    function beginAbsorb() {
      g.mode = 'absorb';
      g.absorbTime = 0;
      audio.sfx.absorb();
      audio.sfx.titanRoar();
      hud.say('El traje se está acoplando al núcleo. No sueltes.', 6);
    }

    // --- bucle ---------------------------------------------------------------
    function update(dt, input, camPos) {
      g.time += dt;

      // ---- ciclo de tormenta
      g.stormTimer -= dt;
      if (g.stormTimer <= 0) {
        g.stormTarget = g.stormTarget > 0.3 ? 0.0 : (0.55 + Math.random() * 0.4);
        g.stormTimer = g.stormTarget > 0.3 ? 34 + Math.random() * 20 : 55 + Math.random() * 40;
        if (g.stormTarget > 0.3) hud.say('Se viene una tormenta de cristal desde el oeste.', 4);
      }
      g.storm = M.damp(g.storm, g.stormTarget, 5.0, dt);
      sky.setTurbidity(1.0 + g.storm * 2.6);

      // ---- sol: ciclo lento de Kether-3 (90 min reales)
      const dayAngle = 0.55 + g.time * 0.00116;
      sky.setSun([Math.cos(dayAngle) * 0.82, Math.sin(dayAngle) * 0.92 + 0.06, -0.42]);

      // ---- jugador
      if (g.mode === 'play') {
        player.update(dt, input, titan, g);
      } else if (g.mode === 'absorb') {
        g.absorbTime += dt;
        player.heat = Math.max(0, player.heat - 30 * dt);
        g.corruption = M.clamp(g.absorbTime / 6.0, 0, 1) * 0.55;
        g.camShake = Math.max(g.camShake, 0.35 + Math.sin(g.time * 9) * 0.15);
        if (g.absorbTime > 6.0 && !player.hasFracture) {
          player.hasFracture = true;
          setStage('done');
          hud.toast('FRACTURA DESBLOQUEADA', 3);
        }
        if (g.absorbTime > 9.0) {
          g.mode = 'play';
          player.detach();
        }
      }

      if (player.reloadTimer > 0) {
        player.reloadTimer -= dt;
        if (player.reloadTimer <= 0) {
          const need = player.maxAmmo - player.ammo;
          const take = Math.min(need, player.reserve);
          player.ammo += take;
          player.reserve -= take;
        }
      }

      // ---- titán
      titan.update(dt, player, g);

      // ---- disponibilidad de gancho (lectura del HUD)
      g.grappleAvailable = titan.alive && g.titanAwake && !player.attached &&
        !!titan.nearestAnchor(player.pos, player.SUIT.grappleRange);

      // ---- progresión de misión por proximidad, sin marcadores
      if (g.stage === 'hill') {
        const d = Math.hypot(player.pos[0] - hill[0], player.pos[2] - hill[2]);
        if (d < 16) setStage('deploy');
      } else if (g.stage === 'deploy') {
        const d = Math.hypot(player.pos[0] - hill[0], player.pos[2] - hill[2]);
        hud.state.prompt = (d < 16 && !g.antennaDeployed) ? '[E] desplegar antena' : '';
        if (d > 26) setStage('hill');
      } else {
        hud.state.prompt = '';
      }

      // ---- modelo del jugador sigue al personaje
      V3.copy(suit.pos, player.pos);
      suit.rot[1] = player.yaw;
      const speed = Math.hypot(player.vel[0], player.vel[2]);
      const bob = Math.sin(g.time * 9.0) * M.clamp(speed / 10, 0, 1);
      suitBody.pos[1] = 1.30 + bob * 0.05;
      armR.rot[0] = 0.2 + bob * 0.5;
      armL.rot[0] = 0.2 - bob * 0.5;
      legR.rot[0] = -bob * 0.6;
      legL.rot[0] = bob * 0.6;
      // El personaje se oculta al ir en primera persona sobre el titán.
      suit.visible = !player.dead;
      EV.Geo.updateWorld(suit, null);
      EV.Geo.updateWorld(antenna, null);

      // ---- efectos temporales
      for (let i = g.tracers.length - 1; i >= 0; i--) {
        g.tracers[i].life -= dt;
        if (g.tracers[i].life <= 0) g.tracers.splice(i, 1);
      }
      for (let i = g.quakeRings.length - 1; i >= 0; i--) {
        const q = g.quakeRings[i];
        q.r += dt * 70;
        q.life -= dt;
        if (q.life <= 0) g.quakeRings.splice(i, 1);
      }
      g.camShake = M.damp(g.camShake, 0, 0.16, dt);
      g.hitMarker = Math.max(0, g.hitMarker - dt);

      // ---- audio continuo
      audio.update(dt, {
        storm: g.storm,
        heat: player.heat,
        integrity: player.integrity,
        speed,
        inHub: false,
        titanProximity: titan.alive && g.titanAwake
          ? M.clamp(1 - V3.dist(titan.pos, player.pos) / 220, 0, 1) : 0,
        corruption: g.corruption,
      });

      hud.update(dt);
    }

    g.update = update;
    return g;
  }

  EV.Game = { create, OBJECTIVES };
})(window.EV = window.EV || {});
