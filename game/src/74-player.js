// Ecos del Vacío — el jugador y su traje.
// El calor es el recurso central: propulsor, poderes y arma comparten un solo
// medidor. Todo lo demás (movimiento con inercia, gancho, escalada del titán)
// cuelga de esa decisión.
(function (EV) {
  'use strict';

  const V3 = EV.V3, M = EV.MathUtil;

  const SUIT = {
    walkSpeed: 7.4,
    sprintSpeed: 12.2,
    accel: 34.0,
    airAccel: 9.0,
    friction: 11.0,
    gravity: -19.6,          // Kether-3: 1.1 g
    jumpSpeed: 8.2,
    thrustForce: 46.0,
    dashSpeed: 21.0,
    dashTime: 0.22,
    dodgeIFrames: 0.17,      // ventana de invulnerabilidad
    perfectWindow: 0.09,     // esquive perfecto: devuelve calor
    grappleRange: 78.0,
    eyeHeight: 1.62,
    radius: 0.45,
  };

  const HEAT = {
    max: 100,
    dashCost: 16,
    thrustRate: 26,
    shotCost: 3.2,
    fractureCost: 34,
    coolRate: 15.5,
    coolRateIdle: 26.0,
    overheatLock: 1.9,
  };

  function create(terrain, spawn) {
    const p = {
      pos: V3.create(spawn[0], terrain.heightAt(spawn[0], spawn[2]) + 2, spawn[2]),
      vel: V3.create(0, 0, 0),
      yaw: 0, pitch: -0.05,
      grounded: false,
      heat: 0,
      overheated: 0,
      integrity: 100, maxIntegrity: 100,
      seal: 100,
      ammo: 42, maxAmmo: 42, reserve: 180,
      // Estado de acción
      dashTimer: 0, dashDir: V3.create(0, 0, 0),
      iframes: 0,
      fireCooldown: 0,
      reloadTimer: 0,
      // Gancho / escalada
      grapple: null,          // {from, to, t, anchor}
      attached: null,         // anchor actual del titán
      climbCooldown: 0,
      // Poderes
      hasFracture: false,
      fractureCooldown: 0,
      // Retroalimentación
      damageFlash: 0,
      lastDodgePerfect: 0,
      corruption: 0,
      dead: false,
      respawnTimer: 0,
    };

    const _fwd = V3.create(), _right = V3.create(), _wish = V3.create(), _tmp = V3.create();

    function forwardVector(out) {
      out[0] = Math.sin(p.yaw);
      out[1] = 0;
      out[2] = Math.cos(p.yaw);
      return out;
    }
    function rightVector(out) {
      out[0] = Math.cos(p.yaw);
      out[1] = 0;
      out[2] = -Math.sin(p.yaw);
      return out;
    }
    function lookVector(out) {
      const cp = Math.cos(p.pitch);
      out[0] = Math.sin(p.yaw) * cp;
      out[1] = Math.sin(p.pitch);
      out[2] = Math.cos(p.yaw) * cp;
      return out;
    }
    p.lookVector = lookVector;
    p.forwardVector = forwardVector;

    function addHeat(amount) {
      p.heat = M.clamp(p.heat + amount, 0, HEAT.max);
      if (p.heat >= HEAT.max) p.overheated = HEAT.overheatLock;
    }
    p.addHeat = addHeat;

    function canSpend(cost) { return p.overheated <= 0 && p.heat + cost <= HEAT.max; }
    p.canSpend = canSpend;

    // --- daño ---------------------------------------------------------------
    function takeDamage(amount, game) {
      if (p.iframes > 0 || p.dead) return false;
      p.integrity -= amount;
      p.damageFlash = 1.0;
      if (p.integrity <= 0) {
        p.integrity = 0;
        p.dead = true;
        p.respawnTimer = 3.2;
        if (p.attached) detach();
        if (game && game.onPlayerDeath) game.onPlayerDeath();
      }
      return true;
    }
    p.takeDamage = takeDamage;

    function detach() {
      p.attached = null;
      p.grapple = null;
    }
    p.detach = detach;

    // --- actualización ------------------------------------------------------
    function update(dt, input, titan, game) {
      p.damageFlash = M.damp(p.damageFlash, 0, 0.10, dt);
      p.iframes = Math.max(0, p.iframes - dt);
      p.fireCooldown = Math.max(0, p.fireCooldown - dt);
      p.fractureCooldown = Math.max(0, p.fractureCooldown - dt);
      p.climbCooldown = Math.max(0, p.climbCooldown - dt);
      p.overheated = Math.max(0, p.overheated - dt);

      if (p.dead) {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0 && game && game.respawn) game.respawn();
        return;
      }

      // --- mirada
      p.yaw -= input.lookX;
      p.pitch = M.clamp(p.pitch - input.lookY, -1.35, 1.28);

      // --- disipación térmica
      const moving = Math.hypot(p.vel[0], p.vel[2]) > 1.0;
      const cool = moving ? HEAT.coolRate : HEAT.coolRateIdle;
      p.heat = Math.max(0, p.heat - cool * dt);

      // --- escalada del titán -------------------------------------------
      if (p.attached && titan) {
        updateAttached(dt, input, titan, game);
        return;
      }

      // --- gancho en vuelo
      if (p.grapple) {
        p.grapple.t += dt / p.grapple.duration;
        if (p.grapple.t >= 1) {
          p.attached = p.grapple.anchor;
          p.grapple = null;
          p.vel[0] = p.vel[1] = p.vel[2] = 0;
          if (game && game.onAttach) game.onAttach();
        } else {
          // Vuelo balístico hacia el anclaje, con la posición del titán viva.
          const to = _tmp;
          titan.anchorWorldPos(p.grapple.anchor, to);
          const t = p.grapple.t;
          const e = t * t * (3 - 2 * t);
          for (let i = 0; i < 3; i++) {
            p.pos[i] = p.grapple.from[i] + (to[i] - p.grapple.from[i]) * e;
          }
          p.pos[1] += Math.sin(t * Math.PI) * 4.0;
          return;
        }
      }

      // --- movimiento en el suelo/aire
      forwardVector(_fwd);
      rightVector(_right);
      V3.set(_wish, 0, 0, 0);
      V3.addScaled(_wish, _wish, _fwd, input.moveZ);
      V3.addScaled(_wish, _wish, _right, input.moveX);
      const wishLen = Math.hypot(_wish[0], _wish[2]);
      if (wishLen > 1e-4) { _wish[0] /= wishLen; _wish[2] /= wishLen; }

      const sprint = input.sprint && wishLen > 0.1 && p.overheated <= 0;
      const maxSpeed = sprint ? SUIT.sprintSpeed : SUIT.walkSpeed;
      if (sprint) addHeat(6.0 * dt);

      // Impulso de maniobra (esquive). Consume calor y da i-frames.
      if (input.dashPressed && p.dashTimer <= 0 && canSpend(HEAT.dashCost)) {
        addHeat(HEAT.dashCost);
        p.dashTimer = SUIT.dashTime;
        p.iframes = SUIT.dodgeIFrames;
        if (wishLen > 0.1) V3.set(p.dashDir, _wish[0], 0, _wish[2]);
        else V3.set(p.dashDir, -_fwd[0], 0, -_fwd[2]);
        // Esquive perfecto: si algo estaba por impactar, devuelve calor.
        if (game && game.dodgeWindowOpen && game.dodgeWindowOpen()) {
          p.heat = Math.max(0, p.heat - HEAT.dashCost * 1.6);
          p.lastDodgePerfect = 1.0;
          p.iframes = SUIT.dodgeIFrames * 1.9;
          if (game.onPerfectDodge) game.onPerfectDodge();
        }
        if (game && game.onDash) game.onDash();
      }
      p.lastDodgePerfect = M.damp(p.lastDodgePerfect, 0, 0.2, dt);

      const accel = p.grounded ? SUIT.accel : SUIT.airAccel;
      if (p.dashTimer > 0) {
        p.dashTimer -= dt;
        p.vel[0] = p.dashDir[0] * SUIT.dashSpeed;
        p.vel[2] = p.dashDir[2] * SUIT.dashSpeed;
      } else {
        // Aceleración hacia la velocidad deseada, con inercia real del traje.
        const targetX = _wish[0] * maxSpeed * wishLen;
        const targetZ = _wish[2] * maxSpeed * wishLen;
        p.vel[0] += (targetX - p.vel[0]) * M.clamp(accel * dt / maxSpeed, 0, 1);
        p.vel[2] += (targetZ - p.vel[2]) * M.clamp(accel * dt / maxSpeed, 0, 1);
        if (wishLen < 0.05 && p.grounded) {
          const f = Math.max(0, 1 - SUIT.friction * dt);
          p.vel[0] *= f; p.vel[2] *= f;
        }
      }

      // Propulsor vertical: mantiene apretado, consume calor continuo.
      if (input.thrust && p.overheated <= 0 && p.heat < HEAT.max) {
        p.vel[1] += SUIT.thrustForce * dt;
        addHeat(HEAT.thrustRate * dt);
        if (game && game.onThrust) game.onThrust(dt);
      } else if (input.jumpPressed && p.grounded) {
        p.vel[1] = SUIT.jumpSpeed;
        p.grounded = false;
      }

      p.vel[1] += SUIT.gravity * dt;
      p.vel[1] = Math.max(p.vel[1], -60);

      p.pos[0] += p.vel[0] * dt;
      p.pos[1] += p.vel[1] * dt;
      p.pos[2] += p.vel[2] * dt;

      // Suelo
      const limit = terrain.HALF - 6;
      p.pos[0] = M.clamp(p.pos[0], -limit, limit);
      p.pos[2] = M.clamp(p.pos[2], -limit, limit);
      const groundY = terrain.heightAt(p.pos[0], p.pos[2]);
      if (p.pos[1] <= groundY + 0.02) {
        if (p.vel[1] < -22 && game && game.onHardLanding) {
          game.onHardLanding(-p.vel[1]);
          takeDamage(Math.max(0, (-p.vel[1] - 22) * 1.6), game);
        }
        p.pos[1] = groundY;
        p.vel[1] = 0;
        if (!p.grounded && game && game.onLand) game.onLand();
        p.grounded = true;
      } else {
        p.grounded = false;
      }

      // --- gancho: dispararlo hacia un anclaje del titán
      if (input.grapplePressed && titan && titan.alive && !p.grapple) {
        const anchor = titan.nearestAnchor(p.pos, SUIT.grappleRange);
        if (anchor) {
          const to = _tmp;
          titan.anchorWorldPos(anchor, to);
          const d = V3.dist(p.pos, to);
          p.grapple = {
            from: V3.create(p.pos[0], p.pos[1], p.pos[2]),
            anchor,
            t: 0,
            duration: M.clamp(d / 46.0, 0.28, 1.1),
          };
          if (game && game.onGrapple) game.onGrapple();
        } else if (game && game.onGrappleMiss) {
          game.onGrappleMiss();
        }
      }
    }

    // --- escalada sobre el titán -------------------------------------------
    function updateAttached(dt, input, titan, game) {
      const anchorPos = _tmp;
      titan.anchorWorldPos(p.attached, anchorPos);
      // El jugador queda pegado al anclaje: el titán se mueve, vos con él.
      V3.lerp(p.pos, p.pos, anchorPos, M.clamp(dt * 12.0, 0, 1));

      // Rutina de purga: si el titán se sacude, te caés salvo que te sostengas.
      if (titan.state === 'attack' || titan.shakeImpulse > 1.0) {
        if (!input.hold) {
          detach();
          p.vel[1] = 6.0;
          if (game && game.onShakenOff) game.onShakenOff();
          return;
        }
      }

      // Avanzar al siguiente anclaje (hacia el lomo).
      if (input.moveZ > 0.4 && p.climbCooldown <= 0 && p.attached.next) {
        const next = titan.anchorByName(p.attached.next);
        if (next) {
          p.attached = next;
          p.climbCooldown = 0.55;
          if (game && game.onClimb) game.onClimb();
        }
      }
      // Soltarse
      if (input.dashPressed) {
        detach();
        p.vel[1] = 7.5;
        forwardVector(_fwd);
        p.vel[0] = -_fwd[0] * 9.0;
        p.vel[2] = -_fwd[2] * 9.0;
        p.iframes = SUIT.dodgeIFrames;
      }
    }

    p.update = update;
    p.SUIT = SUIT;
    p.HEAT = HEAT;
    return p;
  }

  EV.Player = { create, SUIT, HEAT };
})(window.EV = window.EV || {});
