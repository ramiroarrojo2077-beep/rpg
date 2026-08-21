// Ecos del Vacío — lógica de juego: misión, combate, personajes y estado del
// mundo. La cadena de misión sigue la regla del documento de exploración:
// causalidad antes que marcador.
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

  // Los supervivientes de la Meridiano. Cada uno tiene estilo, pose y una línea
  // que dice al acercarse: es la entrega narrativa diegética del documento.
  const SURVIVORS = [
    {
      name: 'Vela', style: 'technician', clip: 'work',
      offset: [-7.5, 0, 3.0], yaw: 2.1,
      line: 'Vela: —Si la antena engancha, recupero telemetría de proa. Andá, yo sigo acá.',
    },
    {
      name: 'Ordoñez', style: 'soldier', clip: 'guard',
      offset: [6.2, 0, -4.5], yaw: -0.6,
      line: 'Ordoñez: —Algo camina al sur. No lo vi. Lo sentí en el suelo.',
    },
    {
      name: 'Kestrel', style: 'wounded', clip: 'hurt',
      offset: [-3.4, 0, -6.2], yaw: 0.7,
      line: 'Kestrel: —Salí de la cápsula tarde. El sellado no aguantó. Traé algo, ¿sí?',
    },
    {
      name: 'Bru', style: 'technician', clip: 'sit',
      offset: [4.0, 0, 5.4], yaw: -2.4,
      line: 'Bru: —Doscientos catorce a bordo. Contamos nueve. Y vos hacés diez.',
    },
  ];

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

    const particles = EV.Particles.create();

    // --- personajes ----------------------------------------------------------
    const avatar = EV.Characters.create('engineer', {
      pos: [player.pos[0], player.pos[1], player.pos[2]],
      yaw: player.yaw, name: 'jugador', clip: 'idle',
    });
    avatar.wear = 0.28;

    const npcs = SURVIVORS.map((s, i) => {
      const x = spawn[0] + s.offset[0];
      const z = spawn[2] + s.offset[2];
      const c = EV.Characters.create(s.style, {
        pos: [x, terrain.heightAt(x, z), z],
        yaw: s.yaw, clip: s.clip, name: s.name,
        offset: i * 1.7,   // desfasa los ciclos: nadie respira sincronizado
      });
      c.wear = 0.34 + i * 0.06;
      c.spec = s;
      c.greeted = false;
      c.baseClip = s.clip;
      return c;
    });

    const characters = [avatar].concat(npcs);

    // --- campamento ----------------------------------------------------------
    const camp = EV.Geo.node({ name: 'campamento' });
    const mat = (a, r, m, e) => ({ albedo: a, rough: r, metal: m, emissive: e || [0, 0, 0], damage: 0 });
    const meshes = {
      crate: EV.Geo.box(1, 1, 1),
      panel: EV.Geo.box(1, 0.08, 1),
      pole: EV.Geo.cylinder(0.055, 0.045, 1, 8),
      drum: EV.Geo.cylinder(0.42, 0.42, 1, 14),
      antennaMast: EV.Geo.cylinder(0.09, 0.05, 1, 10),
      antennaDish: EV.Geo.cylinder(1.0, 0.2, 0.24, 18),
      antennaBase: EV.Geo.box(1.5, 0.4, 1.5),
      beacon: EV.Geo.sphere(1, 12, 8),
    };

    const campSeed = EV.makeNoise(seed + 77);

    // Contenedor de suministro: caja con nervios y patín, para que no lea como
    // un cubo pelado. Se comparte entre todas las instancias del campamento.
    function crateNode(x, z, w, h, d, yaw, tint) {
      const gy = terrain.heightAt(x, z);
      const n = EV.Geo.node({ pos: [x, gy, z], rot: [0, yaw, 0] });
      n.children.push(EV.Geo.node({
        mesh: meshes.crate, pos: [0, h * 0.5 + 0.06, 0], scl: [w, h, d],
        material: mat(tint, 0.58, 0.42),
      }));
      // Nervios laterales
      for (const sx of [-1, 1]) {
        n.children.push(EV.Geo.node({
          mesh: meshes.crate, pos: [sx * w * 0.5, h * 0.5 + 0.06, 0],
          scl: [0.05, h * 0.86, d * 0.94],
          material: mat([tint[0] * 0.6, tint[1] * 0.6, tint[2] * 0.6], 0.42, 0.75),
        }));
      }
      // Patín: la caja apoya sobre listones, no sobre la arena.
      n.children.push(EV.Geo.node({
        mesh: meshes.crate, pos: [0, 0.03, 0], scl: [w * 1.04, 0.07, d * 1.04],
        material: mat([0.075, 0.070, 0.065], 0.8, 0.3),
      }));
      // Franja de identificación
      n.children.push(EV.Geo.node({
        mesh: meshes.crate, pos: [0, h * 0.78, -d * 0.51], scl: [w * 0.66, h * 0.14, 0.02],
        material: mat([0.55, 0.42, 0.10], 0.55, 0.2),
      }));
      return n;
    }

    const CRATE_TINTS = [[0.185, 0.172, 0.152], [0.205, 0.110, 0.062], [0.135, 0.148, 0.155]];
    // Disposición deliberada: dos hileras junto al toldo y un par sueltas.
    const CRATE_LAYOUT = [
      [-2.2, 2.6, 1.15, 0.85, 0.95], [-1.0, 2.6, 1.05, 0.80, 0.90],
      [-2.2, 2.6, 0.95, 0.70, 0.80], [0.3, 2.9, 1.20, 1.05, 1.00],
      [2.6, 1.4, 1.00, 0.75, 1.10], [3.4, -0.4, 1.30, 0.90, 0.95],
      [-4.4, -1.2, 1.10, 1.15, 1.05], [-5.6, 0.6, 0.90, 0.70, 0.85],
      [1.2, -3.6, 1.25, 0.80, 1.20], [-1.8, -4.4, 1.05, 0.95, 0.90],
    ];
    let stackY = 0;
    CRATE_LAYOUT.forEach((c, i) => {
      const [ox, oz, w, h, d] = c;
      const x = spawn[0] + ox, z = spawn[2] + oz;
      const node = crateNode(x, z, w, h, d, campSeed.rand() * 0.7 - 0.35,
        CRATE_TINTS[i % CRATE_TINTS.length]);
      // La tercera entrada apila sobre la anterior: la pila da verticalidad.
      if (i === 2) node.pos[1] += 0.86;
      camp.children.push(node);
    });

    // Calentador: el punto de luz que define el campamento.
    const firePos = V3.create(spawn[0] + 0.6, terrain.heightAt(spawn[0] + 0.6, spawn[2] - 1.2), spawn[2] - 1.2);
    camp.children.push(EV.Geo.node({
      mesh: meshes.drum, pos: [firePos[0], firePos[1] + 0.32, firePos[2]],
      scl: [1, 0.64, 1], material: mat([0.105, 0.098, 0.092], 0.72, 0.65),
    }));
    camp.children.push(EV.Geo.node({
      mesh: meshes.beacon, pos: [firePos[0], firePos[1] + 0.66, firePos[2]],
      scl: [0.30, 0.14, 0.30],
      material: mat([0.02, 0.01, 0.005], 0.9, 0, [7.5, 2.6, 0.55]),
    }));
    // Tres piedras alrededor del calentador.
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + 0.6;
      camp.children.push(EV.Geo.node({
        mesh: meshes.crate,
        pos: [firePos[0] + Math.cos(a) * 0.95, firePos[1] + 0.10, firePos[2] + Math.sin(a) * 0.95],
        rot: [0, a, 0], scl: [0.42, 0.24, 0.34],
        material: mat([0.115, 0.100, 0.088], 0.92, 0.0),
      }));
    }

    // Toldo: bajo, inclinado, sostenido por cuatro postes. Da sombra real —
    // se ve en el mapa de sombras — y una silueta reconocible de lejos.
    {
      const cx = spawn[0] - 3.4, cz = spawn[2] + 2.2;
      const gy = terrain.heightAt(cx, cz);
      const half = 1.9;
      for (const [ox, oz, hgt] of [[-half, -half, 2.10], [half, -half, 2.32],
                                   [-half, half, 1.86], [half, half, 2.08]]) {
        camp.children.push(EV.Geo.node({
          mesh: meshes.pole, pos: [cx + ox, gy + hgt * 0.5, cz + oz], scl: [1, hgt, 1],
          material: mat([0.130, 0.126, 0.120], 0.45, 0.85),
        }));
      }
      camp.children.push(EV.Geo.node({
        mesh: meshes.panel, pos: [cx, gy + 2.12, cz], rot: [-0.11, 0.14, 0.06],
        scl: [4.3, 1, 4.3], material: mat([0.245, 0.212, 0.162], 0.88, 0.05),
      }));
    }

    // --- antena --------------------------------------------------------------
    const antenna = EV.Geo.node({ name: 'antena', pos: [hill[0], hill[1], hill[2]], visible: false });
    const beaconNode = EV.Geo.node({
      mesh: meshes.beacon, pos: [0, 7.0, 0], scl: [0.16, 0.16, 0.16],
      material: mat([0.02, 0.02, 0.02], 0.2, 0, [0.5, 4.5, 1.6]),
    });
    antenna.children.push(
      EV.Geo.node({ mesh: meshes.antennaBase, pos: [0, 0.2, 0], material: mat([0.135, 0.125, 0.115], 0.7, 0.5) }),
      EV.Geo.node({ mesh: meshes.antennaMast, pos: [0, 3.4, 0], scl: [1, 6.4, 1], material: mat([0.165, 0.155, 0.145], 0.45, 0.85) }),
      EV.Geo.node({
        mesh: meshes.antennaDish, pos: [0, 6.5, 0], rot: [0.5, 0, 0],
        material: mat([0.245, 0.235, 0.220], 0.3, 0.65),
      }),
      beaconNode,
    );

    // --- estado del juego ----------------------------------------------------
    const g = {
      terrain, sky, audio, hud, player, titan, antenna, camp, particles,
      avatar, npcs, characters, hill, firePos,
      nodes: [titan.root, antenna, camp],
      time: 0,
      mode: 'play',
      absorbTime: 0,
      stage: 'hill',
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
      quakeRings: [],
      lights: [],
      checkpoint: V3.create(spawn[0], 0, spawn[2]),
      // Estado de animación del avatar
      stepTimer: 0,
      landTimer: 0,
      aimTimer: 0,
      muzzleTimer: 0,
      dustTimer: 0,
    };

    hud.state.objective = OBJECTIVES.hill.text;
    hud.state.objectiveHint = OBJECTIVES.hill.hint;

    // --- eventos del titán ---------------------------------------------------
    titan.onFootfall = (pos, intensity) => {
      const d = V3.dist(pos, player.pos);
      const atten = M.clamp(1 - d / 260, 0, 1);
      if (atten > 0.02) audio.sfx.titanStep(intensity * atten);
      g.camShake = Math.max(g.camShake, atten * atten * 0.5);
      if (d < 400) particles.emit.titanStep(pos[0], pos[1], pos[2], 0.4 + intensity);
    };
    titan.onAttack = () => audio.sfx.titanAttack();
    titan.onImpact = (kind, a) => {
      audio.sfx.titanImpact();
      g.camShake = Math.max(g.camShake, 1.0);
      const d = V3.dist(titan.pos, player.pos);
      let hit = false;
      if (kind === 'quake') hit = player.grounded && d < a.range;
      else {
        const dx = player.pos[0] - titan.pos[0], dz = player.pos[2] - titan.pos[2];
        const ang = Math.atan2(dx, dz);
        const rel = Math.abs(M.wrapAngle(ang - titan.yaw));
        hit = d < a.range && rel < (kind === 'sweep' ? 1.0 : 0.7);
      }
      if (hit && !player.attached) {
        if (player.takeDamage(a.damage, g)) audio.sfx.damage();
      }
      // Polvo del impacto delante del titán.
      const ix = titan.pos[0] + Math.sin(titan.yaw) * -18;
      const iz = titan.pos[2] + Math.cos(titan.yaw) * -18;
      particles.emit.titanStep(ix, terrain.heightAt(ix, iz), iz, 1.6);
      if (kind === 'quake') g.quakeRings.push({ x: titan.pos[0], z: titan.pos[2], r: 0, life: 1.6 });
    };

    // --- callbacks del jugador ----------------------------------------------
    g.onDash = () => {
      audio.sfx.dash();
      avatar.animator.play('dodge', { fade: 0.06, restart: true });
      particles.emit.landing(player.pos[0], player.pos[1], player.pos[2], 6);
    };
    g.onLand = () => {
      audio.sfx.land();
      g.landTimer = 0.34;
      avatar.animator.play('land', { fade: 0.05, restart: true });
      particles.emit.landing(player.pos[0], player.pos[1], player.pos[2], 5);
    };
    g.onHardLanding = (force) => {
      audio.sfx.hardLanding();
      g.camShake = Math.max(g.camShake, 0.5);
      particles.emit.landing(player.pos[0], player.pos[1], player.pos[2], force);
    };
    g.onThrust = (dt) => {
      g.dustTimer -= dt;
      if (g.dustTimer <= 0) {
        g.dustTimer = 0.02;
        particles.emit.thruster(player.pos[0], player.pos[1] + 0.5, player.pos[2],
          Math.sin(player.yaw), Math.cos(player.yaw));
      }
    };
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
      avatar.animator.play('death', { fade: 0.10, restart: true });
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
      avatar.animator.play('idle', { fade: 0.2 });
      if (titan.alive && g.titanAwake) titan.setState('walk');
    };

    // --- disparo -------------------------------------------------------------
    const _ray = V3.create(), _tmp = V3.create(), _hitPt = V3.create(), _muzzle = V3.create();

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
      g.aimTimer = 1.6;
      g.muzzleTimer = 0.05;
      avatar.animator.setAdditive('fire', 1.0);
      avatar.animator.additiveTime = 0;

      player.lookVector(_ray);
      // El fogonazo sale de la mano derecha, no del centro de la cámara.
      avatar.bonePos('handR', _muzzle);
      V3.addScaled(_muzzle, _muzzle, _ray, 0.35);
      particles.emit.muzzle(_muzzle[0], _muzzle[1], _muzzle[2], _ray[0], _ray[1], _ray[2]);

      let bestT = 1e9, bestKind = null, bestIndex = -1;
      if (titan.alive) {
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
        nodeWorldPos(titan.body, _tmp);
        const tb = raySphere(camPos, _ray, _tmp, 11.0);
        if (tb > 0 && tb < bestT) { bestT = tb; bestKind = 'hull'; }
      }

      if (bestKind) {
        V3.addScaled(_hitPt, camPos, _ray, bestT);
        particles.emit.impact(_hitPt[0], _hitPt[1], _hitPt[2],
          -_ray[0], -_ray[1], -_ray[2], bestKind !== 'hull');
      }

      if (bestKind === 'plate') {
        const onTop = !!player.attached;
        const broke = titan.damagePlate(bestIndex, onTop ? 26 : 3.5);
        audio.sfx.hit();
        g.hitMarker = 0.18;
        if (broke) {
          audio.sfx.plateBreak();
          hud.toast('PLACA DESTRUIDA', 1.4);
          nodeWorldPos(titan.plates[bestIndex], _tmp);
          for (let k = 0; k < 4; k++) {
            particles.emit.impact(_tmp[0], _tmp[1], _tmp[2], 0, 1, 0, true);
          }
          if (titan.plates.filter(x => !x.userData.broken).length === 0) {
            setStage('core');
            titan.setState('stunned');
            audio.sfx.titanRoar();
          }
        }
      } else if (bestKind === 'core') {
        titan.damageCore(34);
        audio.sfx.hit();
        g.hitMarker = 0.25;
        if (!titan.alive) beginAbsorb();
        else if (titan.hp <= titan.maxHp * (1 - (titan.cycle + 1) / 3)) {
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
      avatar.animator.setAdditive('reload', 1.0);
      avatar.animator.additiveTime = 0;
      g.aimTimer = 1.8;
    }
    g.reload = reload;

    function fracture() {
      if (!player.hasFracture || player.fractureCooldown > 0) return;
      if (!player.canSpend(player.HEAT.fractureCost)) return;
      player.addHeat(player.HEAT.fractureCost);
      player.fractureCooldown = 3.0;
      audio.sfx.fracture();
      g.camShake = Math.max(g.camShake, 0.8);
      g.quakeRings.push({ x: player.pos[0], z: player.pos[2], r: 0, life: 1.0, friendly: true });
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        particles.emit.impact(
          player.pos[0] + Math.cos(a) * 1.5, player.pos[1] + 0.4, player.pos[2] + Math.sin(a) * 1.5,
          Math.cos(a), 0.35, Math.sin(a), true);
      }
      if (titan.alive) {
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
    g.beginAbsorb = beginAbsorb;

    // --- animación del avatar ------------------------------------------------
    const _bp = V3.create();
    function updateAvatar(dt) {
      V3.copy(avatar.pos, player.pos);
      avatar.yaw = player.yaw;
      avatar.pulse = 0.7 + Math.sin(g.time * 2.2) * 0.3;

      const speed = Math.hypot(player.vel[0], player.vel[2]);
      g.landTimer = Math.max(0, g.landTimer - dt);
      g.aimTimer = Math.max(0, g.aimTimer - dt);

      // Selección de clip por estado. El orden es la prioridad.
      const A = avatar.animator;
      if (player.dead) {
        if (A.currentName !== 'death') A.play('death', { fade: 0.1 });
      } else if (player.attached) {
        A.play('climb', { fade: 0.22 });
      } else if (!player.grounded) {
        A.play(player.vel[1] > 0.6 ? 'jump' : 'fall', { fade: 0.14 });
      } else if (player.dashTimer > 0) {
        // 'dodge' lo lanza el callback; acá sólo se evita pisarlo.
      } else if (g.landTimer > 0) {
        // dejar correr el clip de aterrizaje
      } else if (speed > 8.6) {
        A.play('run', { fade: 0.16, speed: M.clamp(speed / 11.5, 0.8, 1.4) });
      } else if (speed > 0.55) {
        A.play('walk', { fade: 0.18, speed: M.clamp(speed / 6.4, 0.6, 1.5) });
      } else {
        A.play('idle', { fade: 0.28 });
      }

      // Capa superior: apuntar mientras se dispara o justo después.
      const additiveName = A.additive ? A.additive.name : null;
      if (additiveName === 'fire' && A.additiveTime > 0.22) A.setAdditive(null, 0);
      else if (additiveName === 'reload' && player.reloadTimer <= 0) A.setAdditive(null, 0);
      if (!A.additive && g.aimTimer > 0 && !player.dead && !player.attached) {
        A.setAdditive('aim', 1.0);
      } else if (!A.additive) {
        A.setAdditive(null, 0);
      }
      if (A.additive && A.additive.name === 'aim' && g.aimTimer <= 0) A.setAdditive(null, 0);

      // Polvo de pisada sincronizado con la velocidad real, no con el reloj.
      if (player.grounded && speed > 1.2) {
        g.stepTimer -= dt * speed;
        if (g.stepTimer <= 0) {
          g.stepTimer = 4.2;
          particles.emit.footstep(player.pos[0], player.pos[1], player.pos[2], speed);
        }
      }

      avatar.visible = true;
      avatar.update(dt);
    }

    // --- NPCs ----------------------------------------------------------------
    function updateNPCs(dt) {
      for (const c of npcs) {
        const d = V3.dist(c.pos, player.pos);
        // Miran al jugador cuando está cerca: es lo que los saca de "estatua".
        c.lookAt = player.pos;
        c.lookWeight = M.damp(c.lookWeight, d < 14 ? 1 : 0, 0.35, dt);
        c.pulse = 0.6 + Math.sin(g.time * 1.7 + c.pos[0]) * 0.4;

        if (!c.greeted && d < 7.5) {
          c.greeted = true;
          hud.say(c.spec.line, 6);
          if (c.baseClip === 'guard' || c.baseClip === 'sit') {
            c.animator.play('wave', { fade: 0.2, restart: true });
            c.waveTimer = 2.2;
          }
        }
        if (c.waveTimer > 0) {
          c.waveTimer -= dt;
          if (c.waveTimer <= 0) c.animator.play(c.baseClip, { fade: 0.3 });
        }
        c.update(dt);
      }
    }

    // --- luces dinámicas -----------------------------------------------------
    const _core = V3.create();
    function updateLights() {
      const L = g.lights;
      L.length = 0;

      // Fogata del campamento: parpadeo con dos senos desfasados, nunca cíclico.
      const flick = 1 + Math.sin(g.time * 11.3) * 0.12 + Math.sin(g.time * 4.1) * 0.08;
      L.push({
        pos: [firePos[0], firePos[1] + 0.9, firePos[2]], radius: 16,
        color: [1.0, 0.44, 0.14], intensity: 26 * flick,
      });

      if (g.muzzleTimer > 0) {
        avatar.bonePos('handR', _bp);
        L.push({
          pos: [_bp[0], _bp[1], _bp[2]], radius: 14,
          color: [1.0, 0.78, 0.45], intensity: 180,
        });
      }
      if (g.antennaDeployed) {
        L.push({
          pos: [hill[0], hill[1] + 7.0, hill[2]], radius: 22,
          color: [0.35, 1.0, 0.55], intensity: 12 + Math.sin(g.time * 3) * 6,
        });
        const e = beaconNode.material.emissive;
        const pulse = 0.5 + Math.sin(g.time * 3) * 0.5;
        e[0] = 0.5 * pulse; e[1] = 4.5 * pulse; e[2] = 1.6 * pulse;
      }
      if (titan.alive && titan.core.visible) {
        _core[0] = titan.core.world[12]; _core[1] = titan.core.world[13]; _core[2] = titan.core.world[14];
        L.push({
          pos: [_core[0], _core[1], _core[2]], radius: 55,
          color: [1.0, 0.52, 0.16], intensity: 220,
        });
      }
      if (titan.alive && titan.state === 'telegraph') {
        const t = M.clamp(titan.stateTime / 0.6, 0, 1);
        L.push({
          pos: [titan.pos[0], titan.pos[1], titan.pos[2]], radius: 60,
          color: [1.0, 0.30, 0.10], intensity: 60 * t,
        });
      }
      if (g.mode === 'absorb') {
        L.push({
          pos: [player.pos[0], player.pos[1] + 1.2, player.pos[2]], radius: 40,
          color: [1.0, 0.70, 0.28], intensity: 90 * M.clamp(g.absorbTime / 3, 0, 1),
        });
      }
    }

    // --- bucle ---------------------------------------------------------------
    function update(dt, input, camPos) {
      g.time += dt;
      g.muzzleTimer = Math.max(0, g.muzzleTimer - dt);

      // ---- ciclo de tormenta
      g.stormTimer -= dt;
      if (g.stormTimer <= 0) {
        g.stormTarget = g.stormTarget > 0.3 ? 0.0 : (0.55 + Math.random() * 0.4);
        g.stormTimer = g.stormTarget > 0.3 ? 34 + Math.random() * 20 : 55 + Math.random() * 40;
        if (g.stormTarget > 0.3) hud.say('Se viene una tormenta de cristal desde el oeste.', 4);
      }
      g.storm = M.damp(g.storm, g.stormTarget, 5.0, dt);
      sky.setTurbidity(1.0 + g.storm * 2.6);

      // ---- sol: ciclo lento de Kether-3
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
        for (let i = 0; i < 3; i++) {
          particles.emit.absorb(player.pos[0], player.pos[1] + 1, player.pos[2]);
        }
        if (g.absorbTime > 6.0 && !player.hasFracture) {
          player.hasFracture = true;
          setStage('done');
          hud.toast('FRACTURA DESBLOQUEADA', 3);
        }
        if (g.absorbTime > 9.0) { g.mode = 'play'; player.detach(); }
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

      titan.update(dt, player, g);

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

      updateAvatar(dt);
      updateNPCs(dt);
      updateLights();

      EV.Geo.updateWorld(antenna, null);
      EV.Geo.updateWorld(camp, null);

      // ---- partículas ambientales: brasas del campamento y polvo en el aire
      if (V3.dist(player.pos, firePos) < 60 && Math.random() < 0.5) {
        particles.emit.ember(firePos[0], firePos[1] + 0.75, firePos[2]);
      }
      const dustRate = 2 + g.storm * 26;
      g.dustAccum = (g.dustAccum || 0) + dt * dustRate;
      while (g.dustAccum >= 1) {
        g.dustAccum -= 1;
        particles.emit.ambientDust(camPos[0], camPos[1], camPos[2], g.storm);
      }
      // El viento sopla del oeste y arrastra todo lo suspendido.
      particles.update(dt, [4 + g.storm * 26, 0, 1.5 + g.storm * 7]);

      for (let i = g.quakeRings.length - 1; i >= 0; i--) {
        const q = g.quakeRings[i];
        q.r += dt * 70;
        q.life -= dt;
        if (q.life <= 0) g.quakeRings.splice(i, 1);
      }
      g.camShake = M.damp(g.camShake, 0, 0.16, dt);
      g.hitMarker = Math.max(0, g.hitMarker - dt);

      audio.update(dt, {
        storm: g.storm,
        heat: player.heat,
        integrity: player.integrity,
        speed: Math.hypot(player.vel[0], player.vel[2]),
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

  EV.Game = { create, OBJECTIVES, SURVIVORS };
})(window.EV = window.EV || {});
