// Ecos del Vacío — El Barrenador.
// Titán de minería de manto profundo. Es un nivel con patas: se pelea en tres
// fases (aproximación, ascenso, núcleo) y el jugador lo escala usando puntos de
// anclaje que existen físicamente en la malla.
(function (EV) {
  'use strict';

  const V3 = EV.V3, M = EV.MathUtil;

  const MAT = {
    hull: { albedo: [0.128, 0.118, 0.108], rough: 0.62, metal: 0.85, emissive: [0, 0, 0] },
    plate: { albedo: [0.235, 0.205, 0.170], rough: 0.38, metal: 0.92, emissive: [0, 0, 0] },
    chitin: { albedo: [0.085, 0.070, 0.062], rough: 0.34, metal: 0.15, emissive: [0, 0, 0] },
    joint: { albedo: [0.055, 0.050, 0.048], rough: 0.85, metal: 0.40, emissive: [0, 0, 0] },
    core: { albedo: [0.02, 0.02, 0.02], rough: 0.25, metal: 0.0, emissive: [2.4, 1.15, 0.35] },
    drill: { albedo: [0.150, 0.135, 0.115], rough: 0.30, metal: 0.95, emissive: [0, 0, 0] },
    vent: { albedo: [0.03, 0.03, 0.03], rough: 0.9, metal: 0.2, emissive: [0.35, 0.10, 0.03] },
  };

  const mat = (m) => Object.assign({ damage: 0 }, m);

  function create(terrain) {
    // --- mallas compartidas (pocas VAOs, muchos nodos) ---------------------
    const mesh = {
      hull: EV.Geo.box(1, 1, 1),
      seg: EV.Geo.cylinder(0.62, 0.42, 1, 10),
      joint: EV.Geo.sphere(0.55, 12, 8),
      plate: EV.Geo.box(1, 0.34, 1),
      core: EV.Geo.sphere(1, 20, 14),
      drill: EV.Geo.cylinder(0.05, 1.5, 1, 12),
      foot: EV.Geo.box(1, 0.5, 1.6),
    };

    const SCALE = 1.0;
    const BODY_H = 23.0;      // altura del vientre sobre el suelo
    const BODY_LEN = 34.0;
    const BODY_W = 17.0;

    // --- jerarquía ----------------------------------------------------------
    const legs = [];
    const plates = [];

    const root = EV.Geo.node({ name: 'barrenador' });

    const body = EV.Geo.node({
      name: 'cuerpo', mesh: mesh.hull,
      pos: [0, 0, 0], scl: [BODY_W, 9.0, BODY_LEN],
      material: mat(MAT.hull),
    });
    // El nodo de carrocería se usa sólo para dibujar; los hijos cuelgan de un
    // pivote sin escala para que no hereden la deformación de la caja.
    const bodyPivot = EV.Geo.node({ name: 'pivote', children: [body] });
    root.children.push(bodyPivot);

    // Joroba dorsal donde viven las placas
    const backPlateY = 4.5;
    bodyPivot.children.push(EV.Geo.node({
      name: 'joroba', mesh: mesh.hull,
      pos: [0, 3.4, -1.5], scl: [BODY_W * 0.74, 4.4, BODY_LEN * 0.52],
      material: mat(MAT.chitin),
    }));

    // Cabeza-barreno al frente (-Z es adelante)
    const head = EV.Geo.node({
      name: 'cabeza', pos: [0, -0.6, -BODY_LEN * 0.52],
      children: [
        EV.Geo.node({
          mesh: mesh.hull, pos: [0, 0, -2.0], scl: [11.0, 7.0, 9.0],
          material: mat(MAT.hull),
        }),
        EV.Geo.node({
          name: 'barreno', mesh: mesh.drill, pos: [0, 0, -9.5],
          rot: [-Math.PI / 2, 0, 0], scl: [4.1, 8.5, 4.1],
          material: mat(MAT.drill),
        }),
        EV.Geo.node({
          name: 'ojo', mesh: mesh.core, pos: [0, 1.5, -5.8], scl: [1.1, 0.65, 0.8],
          material: mat({ albedo: [0.02, 0.02, 0.02], rough: 0.2, metal: 0, emissive: [1.1, 0.35, 0.10] }),
        }),
      ],
    });
    bodyPivot.children.push(head);

    // Placas de blindaje dorsal: son los objetivos de la fase 2.
    const PLATE_LAYOUT = [
      [-4.6, 4.2], [4.6, 4.2],
      [-4.6, -1.8], [4.6, -1.8],
      [0, -7.4],
    ];
    for (let i = 0; i < PLATE_LAYOUT.length; i++) {
      const [px, pz] = PLATE_LAYOUT[i];
      const n = EV.Geo.node({
        name: 'placa' + i, mesh: mesh.plate,
        pos: [px, backPlateY + 1.8, pz], scl: [8.0, 1.9, 6.0],
        material: mat(MAT.plate),
      });
      n.userData = { hp: 100, maxHp: 100, index: i, broken: false, basePos: [px, backPlateY + 1.4, pz] };
      bodyPivot.children.push(n);
      plates.push(n);
    }

    // Núcleo: sólo visible cuando cae el blindaje.
    const core = EV.Geo.node({
      name: 'nucleo', mesh: mesh.core,
      pos: [0, backPlateY + 0.6, -0.6], scl: [4.0, 3.0, 4.4],
      material: mat(MAT.core), visible: false,
    });
    bodyPivot.children.push(core);

    // Ventilaciones que se encienden al sobrecalentarse (telegrafía de ataque).
    const vents = [];
    for (const vx of [-BODY_W * 0.5, BODY_W * 0.5]) {
      const v = EV.Geo.node({
        mesh: mesh.hull, pos: [vx, 1.6, 5.2], scl: [0.8, 2.6, 9.0],
        material: mat(MAT.vent),
      });
      bodyPivot.children.push(v);
      vents.push(v);
    }

    // --- patas --------------------------------------------------------------
    // Cuatro patas de tres segmentos. La marcha es procedural: cada pata tiene
    // una fase y un objetivo de apoyo en el suelo real del terreno.
    const LEG_ROOT = [
      [-BODY_W * 0.50, -1.6, -BODY_LEN * 0.34, -1],
      [BODY_W * 0.50, -1.6, -BODY_LEN * 0.34, 1],
      [-BODY_W * 0.50, -1.6, BODY_LEN * 0.32, -1],
      [BODY_W * 0.50, -1.6, BODY_LEN * 0.32, 1],
    ];
    const L1 = 14.0, L2 = 17.0, L3 = 7.5;   // suma 31 > alcance requerido (~26)

    for (let i = 0; i < 4; i++) {
      const [lx, ly, lz, side] = LEG_ROOT[i];
      const hip = EV.Geo.node({ name: 'cadera' + i, pos: [lx, ly, lz] });
      const hipBall = EV.Geo.node({ mesh: mesh.joint, scl: [4.2, 4.2, 4.2], material: mat(MAT.joint) });
      const upper = EV.Geo.node({
        name: 'femur' + i, mesh: mesh.seg,
        pos: [0, -L1 * 0.5, 0], scl: [3.6, L1, 3.6], material: mat(MAT.chitin),
      });
      const kneePivot = EV.Geo.node({ name: 'rodillaPivote' + i, pos: [0, -L1, 0] });
      const knee = EV.Geo.node({ mesh: mesh.joint, scl: [3.4, 3.4, 3.4], material: mat(MAT.joint) });
      const lower = EV.Geo.node({
        name: 'tibia' + i, mesh: mesh.seg,
        pos: [0, -L2 * 0.5, 0], scl: [2.7, L2, 2.7], material: mat(MAT.chitin),
      });
      const anklePivot = EV.Geo.node({ name: 'tobilloPivote' + i, pos: [0, -L2, 0] });
      const footSeg = EV.Geo.node({
        mesh: mesh.seg, pos: [0, -L3 * 0.5, 0], scl: [2.0, L3, 2.0], material: mat(MAT.joint),
      });
      const foot = EV.Geo.node({
        mesh: mesh.foot, pos: [0, -L3, 0.5], scl: [4.6, 1.6, 6.8], material: mat(MAT.hull),
      });

      anklePivot.children.push(footSeg, foot);
      kneePivot.children.push(knee, lower, anklePivot);
      hip.children.push(hipBall, upper, kneePivot);
      bodyPivot.children.push(hip);

      legs.push({
        hip, kneePivot, anklePivot, side, index: i,
        // Estado de marcha
        phase: (i === 0 || i === 3) ? 0 : 0.5,
        planted: V3.create(0, 0, 0),
        target: V3.create(0, 0, 0),
        lifted: 0,
        restOffset: V3.create(lx * 1.45, 0, lz * 1.15),
      });
    }

    // --- estado -------------------------------------------------------------
    const st = {
      root, bodyPivot, body, head, core, plates, legs, vents,
      pos: V3.create(0, 0, -150),
      vel: V3.create(0, 0, 0),
      yaw: 0,
      hp: 1000, maxHp: 1000,
      phase: 1,              // 1 aproximación · 2 ascenso · 3 núcleo
      cycle: 0,              // ciclos de núcleo completados
      state: 'dormant',      // dormant | walk | telegraph | attack | recover | stunned | dying | dead
      stateTime: 0,
      attackKind: null,
      gaitTime: 0,
      speed: 0,
      coreExposedTime: 0,
      stunTimer: 0,
      alive: true,
      shakeImpulse: 0,
      // Puntos de anclaje del gancho, en espacio local del cuerpo.
      anchors: [
        { name: 'pataDelIzq', local: [-BODY_W * 0.52 - 2.5, -L1 - 5, -BODY_LEN * 0.30], next: 'cadera' },
        { name: 'pataDelDer', local: [BODY_W * 0.52 + 2.5, -L1 - 5, -BODY_LEN * 0.30], next: 'cadera' },
        { name: 'cadera', local: [0, 1.0, BODY_LEN * 0.18], next: 'lomo' },
        { name: 'lomo', local: [0, backPlateY + 3.4, 0], next: null },
      ],
    };

    // Reubica los apoyos bajo la posición actual. Hay que llamarlo cada vez que
    // el titán se teletransporta: si no, las patas siguen ancladas donde estaban
    // y la IK las estira en horizontal hasta el punto viejo.
    function placeFeet() {
      const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw);
      for (const leg of st.legs) {
        const rx = leg.restOffset[0], rz = leg.restOffset[2];
        const wx = st.pos[0] + rx * cy + rz * sy;
        const wz = st.pos[2] - rx * sy + rz * cy;
        V3.set(leg.planted, wx, terrain.heightAt(wx, wz), wz);
        V3.copy(leg.target, leg.planted);
        leg.lifted = 0;
      }
    }
    placeFeet();

    // --- cinemática de pata (IK de 2 huesos en el plano de la pata) ---------
    const _v = V3.create(), _w = V3.create();
    function solveLeg(leg, worldFoot) {
      // Posición del pie relativa a la cadera, en espacio del cuerpo.
      const hipWorldX = st.pos[0] + Math.cos(st.yaw) * leg.hip.pos[0] + Math.sin(st.yaw) * leg.hip.pos[2];
      const hipWorldZ = st.pos[2] - Math.sin(st.yaw) * leg.hip.pos[0] + Math.cos(st.yaw) * leg.hip.pos[2];
      const hipWorldY = st.pos[1] + leg.hip.pos[1];

      let dx = worldFoot[0] - hipWorldX;
      let dy = worldFoot[1] - hipWorldY;
      let dz = worldFoot[2] - hipWorldZ;

      // A espacio local del cuerpo (deshace el yaw).
      const cy = Math.cos(-st.yaw), sy = Math.sin(-st.yaw);
      const lx = dx * cy + dz * sy;
      const lz = -dx * sy + dz * cy;

      const horiz = Math.hypot(lx, lz);
      const dist = Math.min(Math.hypot(horiz, dy), (L1 + L2) * 0.985);

      // Ángulos de la cadena de 2 huesos por ley de cosenos.
      const cosKnee = M.clamp((L1 * L1 + L2 * L2 - dist * dist) / (2 * L1 * L2), -1, 1);
      const kneeAngle = Math.PI - Math.acos(cosKnee);
      const cosHip = M.clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
      const hipToTarget = Math.atan2(horiz, -dy);
      const hipAngle = hipToTarget - Math.acos(cosHip);

      // Rotación de la cadera: giro hacia el pie + inclinación de la cadena.
      // El +PI compensa que la inclinación en X lleva el hueso hacia -Z: sin él
      // la pata queda espejada en el plano horizontal (verificado numéricamente
      // contra la cinemática directa de M4.compose).
      leg.hip.rot[1] = Math.atan2(lx, lz) + Math.PI;
      leg.hip.rot[0] = hipAngle;
      leg.kneePivot.rot[0] = kneeAngle;
      // El tobillo compensa para que el pie quede plano sobre el suelo.
      leg.anklePivot.rot[0] = -(hipAngle + kneeAngle) * 0.85;
    }

    // --- marcha -------------------------------------------------------------
    function updateGait(dt, moveSpeed) {
      const stride = 26.0;
      const cadence = M.clamp(moveSpeed / 9.0, 0, 1);
      st.gaitTime += dt * (0.30 + cadence * 0.85);

      for (const leg of st.legs) {
        const p = (st.gaitTime + leg.phase) % 1.0;
        // Posición de reposo del pie en el mundo, delante según la velocidad.
        const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw);
        const rx = leg.restOffset[0], rz = leg.restOffset[2];
        const restX = st.pos[0] + rx * cy + rz * sy;
        const restZ = st.pos[2] - rx * sy + rz * cy;

        if (p < 0.62) {
          // Apoyo: el pie queda clavado donde se plantó.
          leg.lifted = M.damp(leg.lifted, 0, 0.05, dt);
        } else {
          // Balanceo: el pie viaja al próximo apoyo, adelantado por la marcha.
          const swing = (p - 0.62) / 0.38;
          const aheadX = restX + st.vel[0] * 0.55 + Math.sin(st.yaw) * 0 + (-Math.sin(st.yaw)) * 0;
          const aheadZ = restZ + st.vel[2] * 0.55;
          const tx = aheadX, tz = aheadZ;
          if (swing < 0.06) {
            V3.set(leg.target, tx, terrain.heightAt(tx, tz), tz);
          }
          const arc = Math.sin(swing * Math.PI);
          leg.lifted = arc * (2.5 + cadence * 5.0);
          V3.lerp(leg.planted, leg.planted, leg.target, M.clamp(dt * 9.0, 0, 1));
          if (swing > 0.97) {
            // Pisada: sacude la cámara y levanta polvo.
            st.shakeImpulse = Math.max(st.shakeImpulse, 0.35 + cadence * 0.55);
            if (st.onFootfall) st.onFootfall(leg.planted, cadence);
          }
        }
        // Si un apoyo quedó fuera de alcance (teletransporte, empujón, caída
        // brusca del terreno), se recoloca en vez de estirar la pata recta.
        const reachX = leg.planted[0] - (st.pos[0] + rx * cy + rz * sy);
        const reachZ = leg.planted[2] - (st.pos[2] - rx * sy + rz * cy);
        if (reachX * reachX + reachZ * reachZ > (L1 + L2) * (L1 + L2) * 0.55) {
          V3.set(leg.planted, restX, terrain.heightAt(restX, restZ), restZ);
          V3.copy(leg.target, leg.planted);
        }
        V3.set(_v, leg.planted[0], leg.planted[1] + leg.lifted, leg.planted[2]);
        solveLeg(leg, _v);
      }
    }

    // --- altura y aplomo del cuerpo ----------------------------------------
    function updateBodyPose(dt) {
      let avg = 0;
      for (const leg of st.legs) avg += leg.planted[1];
      avg /= st.legs.length;
      const targetY = avg + BODY_H;
      st.pos[1] = M.damp(st.pos[1], targetY, 0.18, dt);

      // Cabeceo y alabeo según el desnivel entre patas.
      const front = (st.legs[0].planted[1] + st.legs[1].planted[1]) * 0.5;
      const back = (st.legs[2].planted[1] + st.legs[3].planted[1]) * 0.5;
      const left = (st.legs[0].planted[1] + st.legs[2].planted[1]) * 0.5;
      const right = (st.legs[1].planted[1] + st.legs[3].planted[1]) * 0.5;
      const pitch = Math.atan2(front - back, BODY_LEN * 0.56) * 0.6;
      const roll = Math.atan2(right - left, BODY_W) * 0.5;
      bodyPivot.rot[0] = M.damp(bodyPivot.rot[0], pitch, 0.12, dt);
      bodyPivot.rot[2] = M.damp(bodyPivot.rot[2], roll, 0.12, dt);
      bodyPivot.pos[1] = 0;

      root.pos[0] = st.pos[0];
      root.pos[1] = st.pos[1];
      root.pos[2] = st.pos[2];
      root.rot[1] = st.yaw;
    }

    // --- IA ------------------------------------------------------------------
    const ATTACKS = {
      // slam: pata delantera al suelo, deja la pata clavada = ventana de gancho
      slam: { telegraph: 1.15, active: 0.45, recover: 2.6, range: 54, damage: 34 },
      // sweep: barrido con el barreno, hay que esquivar lateral
      sweep: { telegraph: 0.95, active: 0.55, recover: 1.5, range: 46, damage: 28 },
      // quake: onda desde el centro, hay que alejarse o saltar
      quake: { telegraph: 1.6, active: 0.35, recover: 2.0, range: 90, damage: 40 },
    };

    function setState(s) { st.state = s; st.stateTime = 0; }

    function update(dt, player, game) {
      if (!st.alive) {
        st.stateTime += dt;
        updateGait(dt, 0);
        updateBodyPose(dt);
        EV.Geo.updateWorld(root, null);
        return;
      }

      st.stateTime += dt;
      st.shakeImpulse = M.damp(st.shakeImpulse, 0, 0.12, dt);

      const dx = player.pos[0] - st.pos[0];
      const dz = player.pos[2] - st.pos[2];
      const distXZ = Math.hypot(dx, dz);
      const wantYaw = Math.atan2(dx, dz);

      // Núcleo visible sólo cuando cayeron todas las placas.
      const broken = st.plates.filter(p => p.userData.broken).length;
      const allBroken = broken >= st.plates.length;
      st.core.visible = allBroken;

      // Brillo de ventilación: sube al telegrafiar (lectura de intención).
      const tel = st.state === 'telegraph' ? M.clamp(st.stateTime / 0.6, 0, 1) : 0;
      for (const v of st.vents) {
        v.material.emissive[0] = 0.35 + tel * 5.5;
        v.material.emissive[1] = 0.10 + tel * 1.1;
        v.material.emissive[2] = 0.03 + tel * 0.15;
      }
      const eye = st.head.children[2];
      eye.material.emissive[0] = 1.1 + tel * 4.0;

      if (st.stunned > 0) st.stunned -= dt;

      switch (st.state) {
        case 'dormant': {
          // Duerme hasta que el jugador entra en su radio de percepción.
          if (distXZ < 150 && game.titanAwake) setState('walk');
          updateGait(dt, 0);
          break;
        }
        case 'walk': {
          st.yaw += M.wrapAngle(wantYaw - st.yaw) * Math.min(dt * 0.85, 1);
          const desired = distXZ > 62 ? 9.5 : (distXZ < 38 ? -3.5 : 0);
          st.speed = M.damp(st.speed, desired, 0.5, dt);
          V3.set(st.vel, Math.sin(st.yaw) * st.speed, 0, Math.cos(st.yaw) * st.speed);
          st.pos[0] += st.vel[0] * dt;
          st.pos[2] += st.vel[2] * dt;
          updateGait(dt, Math.abs(st.speed));

          // Elige ataque según distancia; más agresivo con cada ciclo.
          const cooldown = Math.max(2.4 - st.cycle * 0.55, 0.9);
          if (st.stateTime > cooldown && !player.attached) {
            let kind = null;
            if (distXZ < ATTACKS.sweep.range) kind = 'sweep';
            else if (distXZ < ATTACKS.slam.range) kind = 'slam';
            else if (distXZ < ATTACKS.quake.range && Math.random() < 0.5) kind = 'quake';
            if (kind) { st.attackKind = kind; setState('telegraph'); }
          }
          break;
        }
        case 'telegraph': {
          st.speed = M.damp(st.speed, 0, 0.15, dt);
          st.yaw += M.wrapAngle(wantYaw - st.yaw) * Math.min(dt * 1.4, 1);
          updateGait(dt, 0);
          const a = ATTACKS[st.attackKind];
          // Anomalía y ciclos altos acortan la ventana de lectura.
          const tScale = game.difficultyTelegraph || 1.0;
          if (st.stateTime > a.telegraph * tScale) setState('attack');
          break;
        }
        case 'attack': {
          const a = ATTACKS[st.attackKind];
          updateGait(dt, 0);
          if (st.stateTime === dt || st.stateTime < dt * 1.5) {
            if (st.onAttack) st.onAttack(st.attackKind);
          }
          if (st.stateTime > a.active) {
            st.shakeImpulse = 1.4;
            if (st.onImpact) st.onImpact(st.attackKind, a);
            setState('recover');
          }
          break;
        }
        case 'recover': {
          const a = ATTACKS[st.attackKind];
          updateGait(dt, 0);
          // Tras el slam la pata queda clavada: es LA ventana para engancharse.
          if (st.stateTime > a.recover) setState('walk');
          break;
        }
        case 'stunned': {
          updateGait(dt, 0);
          if (st.stateTime > 6.5) setState('walk');
          break;
        }
      }

      updateBodyPose(dt);
      EV.Geo.updateWorld(root, null);
    }

    // --- daño ---------------------------------------------------------------
    function damagePlate(index, amount) {
      const p = st.plates[index];
      if (!p || p.userData.broken) return false;
      p.userData.hp -= amount;
      p.material.damage = 1 - p.userData.hp / p.userData.maxHp;
      if (p.userData.hp <= 0) {
        p.userData.broken = true;
        p.visible = false;
        return true;
      }
      return false;
    }

    function damageCore(amount) {
      if (!st.core.visible) return false;
      st.hp -= amount;
      if (st.hp <= 0) {
        st.alive = false;
        setState('dying');
        return true;
      }
      // Al cerrar un ciclo, el blindaje se reconstruye y sube la agresividad.
      return false;
    }

    function resetCycle() {
      st.cycle++;
      for (const p of st.plates) {
        p.userData.hp = p.userData.maxHp;
        p.userData.broken = false;
        p.visible = true;
        p.material.damage = 0;
      }
      st.core.visible = false;
      setState('walk');
    }

    // Devuelve el punto de anclaje más cercano en coordenadas del mundo.
    const _anchorWorld = V3.create();
    function anchorWorldPos(anchor, out) {
      const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw);
      const l = anchor.local;
      out[0] = st.pos[0] + l[0] * cy + l[2] * sy;
      out[1] = st.pos[1] + l[1];
      out[2] = st.pos[2] - l[0] * sy + l[2] * cy;
      return out;
    }

    function nearestAnchor(p, maxDist) {
      let best = null, bestD = maxDist * maxDist;
      for (const a of st.anchors) {
        anchorWorldPos(a, _anchorWorld);
        const d = V3.distSq(p, _anchorWorld);
        if (d < bestD) { bestD = d; best = a; }
      }
      return best;
    }

    function anchorByName(name) {
      return st.anchors.find(a => a.name === name) || null;
    }

    Object.assign(st, {
      update, damagePlate, damageCore, resetCycle, placeFeet,
      anchorWorldPos, nearestAnchor, anchorByName,
      BODY_H, BODY_LEN, BODY_W,
      setState,
    });
    return st;
  }

  EV.Titan = { create, MAT };
})(window.EV = window.EV || {});
