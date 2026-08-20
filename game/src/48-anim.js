// Ecos del Vacío — animación esquelética.
// Esqueleto en bind pose, clips con pistas por hueso, mezcla por slerp y subida
// de matrices de piel a una textura (evita el límite de uniformes por programa).
(function (EV) {
  'use strict';

  const Q = EV.Q, M4 = EV.M4, V3 = EV.V3, M = EV.MathUtil;

  // --------------------------------------------------------------- esqueleto
  // defs: [{ name, parent: índice o -1, pos: [x,y,z], rot?: [ex,ey,ez] }]
  function createSkeleton(defs) {
    const count = defs.length;
    const names = defs.map(d => d.name);
    const parents = new Int32Array(count);
    const bindPos = new Float32Array(count * 3);
    const bindRot = new Float32Array(count * 4);
    const bindWorld = new Float32Array(count * 16);
    const inverseBind = new Float32Array(count * 16);
    const index = Object.create(null);

    const tmpLocal = M4.create();
    const tmpQ = Q.create();

    for (let i = 0; i < count; i++) {
      const d = defs[i];
      index[d.name] = i;
      parents[i] = d.parent === undefined ? -1 : d.parent;
      if (parents[i] >= i) {
        throw new Error(`El hueso ${d.name} referencia un padre posterior; el orden debe ser topológico.`);
      }
      bindPos[i * 3] = d.pos[0]; bindPos[i * 3 + 1] = d.pos[1]; bindPos[i * 3 + 2] = d.pos[2];
      const r = d.rot || [0, 0, 0];
      Q.fromEuler(tmpQ, r[0], r[1], r[2]);
      bindRot.set(tmpQ, i * 4);

      Q.toMat4(tmpLocal, tmpQ, [bindPos[i * 3], bindPos[i * 3 + 1], bindPos[i * 3 + 2]], null);
      const w = bindWorld.subarray(i * 16, i * 16 + 16);
      if (parents[i] < 0) w.set(tmpLocal);
      else {
        const pw = bindWorld.subarray(parents[i] * 16, parents[i] * 16 + 16);
        const out = M4.create();
        M4.multiply(out, pw, tmpLocal);
        w.set(out);
      }
      const inv = M4.create();
      M4.invert(inv, bindWorld.subarray(i * 16, i * 16 + 16));
      inverseBind.set(inv, i * 16);
    }

    return {
      count, names, parents, bindPos, bindRot, bindWorld, inverseBind, index,
      bone(name) {
        const i = index[name];
        if (i === undefined) throw new Error('Hueso desconocido: ' + name);
        return i;
      },
      // Posición del hueso en bind pose, útil para generar la malla.
      bindWorldPos(i, out) {
        const o = i * 16;
        out[0] = bindWorld[o + 12]; out[1] = bindWorld[o + 13]; out[2] = bindWorld[o + 14];
        return out;
      },
    };
  }

  // -------------------------------------------------------------------- clips
  // tracks: { hueso: { rot: [[t, ex, ey, ez], ...], pos: [[t, x, y, z], ...] } }
  // Los ángulos se escriben en GRADOS: authoring legible, conversión al cargar.
  function createClip(spec) {
    const tracks = [];
    for (const boneName in spec.tracks) {
      const t = spec.tracks[boneName];
      const track = { bone: boneName, rot: null, pos: null };
      if (t.rot) {
        track.rot = t.rot.map(k => {
          const q = Q.create();
          Q.fromEuler(q, k[1] * M.DEG, k[2] * M.DEG, k[3] * M.DEG);
          return { t: k[0], q };
        }).sort((a, b) => a.t - b.t);
      }
      if (t.pos) {
        track.pos = t.pos.map(k => ({ t: k[0], p: [k[1], k[2], k[3]] }))
          .sort((a, b) => a.t - b.t);
      }
      tracks.push(track);
    }
    return {
      name: spec.name,
      duration: spec.duration,
      loop: spec.loop !== false,
      tracks,
      // Movimiento raíz que el clip implica (para animaciones que avanzan solas)
      rootMotion: spec.rootMotion || null,
    };
  }

  function findKeys(keys, time) {
    // Búsqueda lineal: las pistas tienen pocas claves y el coste es despreciable
    // frente a hacer binaria con estado por pista.
    let a = keys[0], b = keys[0];
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].t <= time) { a = keys[i]; b = keys[Math.min(i + 1, keys.length - 1)]; }
      else break;
    }
    const span = b.t - a.t;
    const f = span > 1e-6 ? M.clamp((time - a.t) / span, 0, 1) : 0;
    return { a, b, f };
  }

  // --------------------------------------------------------------------- pose
  function createPose(skeleton) {
    const n = skeleton.count;
    const pose = {
      pos: new Float32Array(skeleton.bindPos),
      rot: new Float32Array(skeleton.bindRot),
      count: n,
    };
    pose.reset = () => {
      pose.pos.set(skeleton.bindPos);
      pose.rot.set(skeleton.bindRot);
    };
    return pose;
  }

  // Escribe un clip sobre una pose, mezclando con peso (0..1).
  const _q = Q.create();
  function sampleClip(skeleton, clip, time, pose, weight) {
    const t = clip.loop
      ? ((time % clip.duration) + clip.duration) % clip.duration
      : M.clamp(time, 0, clip.duration);

    for (const track of clip.tracks) {
      const i = skeleton.index[track.bone];
      if (i === undefined) continue;
      if (track.rot && track.rot.length) {
        const { a, b, f } = findKeys(track.rot, t);
        Q.slerp(_q, a.q, b.q, f);
        if (weight >= 0.999) {
          pose.rot.set(_q, i * 4);
        } else {
          const cur = pose.rot.subarray(i * 4, i * 4 + 4);
          const out = Q.create();
          Q.slerp(out, cur, _q, weight);
          pose.rot.set(out, i * 4);
        }
      }
      if (track.pos && track.pos.length) {
        const { a, b, f } = findKeys(track.pos, t);
        const o = i * 3;
        for (let k = 0; k < 3; k++) {
          const v = a.p[k] + (b.p[k] - a.p[k]) * f;
          pose.pos[o + k] = weight >= 0.999
            ? v
            : pose.pos[o + k] + (v - pose.pos[o + k]) * weight;
        }
      }
    }
  }

  // ---------------------------------------------------------------- animador
  // Máquina simple: un clip activo, uno saliente, y un fundido entre ambos.
  function createAnimator(skeleton, clips) {
    const st = {
      clips,
      current: null, currentTime: 0, currentSpeed: 1,
      previous: null, previousTime: 0,
      fade: 0, fadeDuration: 0.001,
      // Capa aditiva opcional (p. ej. apuntar mientras camina)
      additive: null, additiveTime: 0, additiveWeight: 0,
    };

    function play(name, opts = {}) {
      const clip = clips[name];
      if (!clip) throw new Error('Clip desconocido: ' + name);
      if (st.current === clip && opts.restart !== true) {
        st.currentSpeed = opts.speed === undefined ? st.currentSpeed : opts.speed;
        return;
      }
      st.previous = st.current;
      st.previousTime = st.currentTime;
      st.current = clip;
      st.currentTime = opts.offset || 0;
      st.currentSpeed = opts.speed === undefined ? 1 : opts.speed;
      st.fadeDuration = Math.max(opts.fade === undefined ? 0.18 : opts.fade, 0.001);
      st.fade = st.previous ? 0 : 1;
    }

    function setAdditive(name, weight) {
      st.additive = name ? clips[name] : null;
      st.additiveWeight = weight || 0;
    }

    function update(dt) {
      if (!st.current) return;
      st.currentTime += dt * st.currentSpeed;
      st.previousTime += dt;
      st.additiveTime += dt;
      if (st.fade < 1) {
        st.fade = Math.min(1, st.fade + dt / st.fadeDuration);
        if (st.fade >= 1) st.previous = null;
      }
    }

    function apply(pose) {
      pose.reset();
      if (!st.current) return;
      if (st.previous && st.fade < 1) {
        sampleClip(skeleton, st.previous, st.previousTime, pose, 1);
        sampleClip(skeleton, st.current, st.currentTime, pose, st.fade);
      } else {
        sampleClip(skeleton, st.current, st.currentTime, pose, 1);
      }
      if (st.additive && st.additiveWeight > 0.001) {
        sampleClip(skeleton, st.additive, st.additiveTime, pose, st.additiveWeight);
      }
    }

    Object.assign(st, { play, update, apply, setAdditive });
    // Con Object.assign el getter se evaluaría una sola vez y quedaría fijo en
    // null; hay que definirlo sobre el objeto.
    Object.defineProperty(st, 'currentName', {
      get() { return st.current ? st.current.name : null; },
    });
    return st;
  }

  // ------------------------------------------------- instancia con matrices
  // Cada personaje sube sus matrices de piel a una textura RGBA32F de 4 téxeles
  // por hueso. Con uniformes mat4 se choca contra MAX_VERTEX_UNIFORM_VECTORS.
  function createSkinInstance(skeleton) {
    const gl = EV.GL.ctx;
    const n = skeleton.count;
    const world = new Float32Array(n * 16);
    const skin = new Float32Array(n * 16);
    const prevSkin = new Float32Array(n * 16);
    const texWidth = n * 4;

    const makeTex = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, texWidth, 1);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);
      return t;
    };
    const boneTex = makeTex();
    const prevBoneTex = makeTex();

    const _local = M4.create();
    const _out = M4.create();

    // Calcula world = padre * local y skin = world * inverseBind.
    function computeMatrices(pose, rootMatrix) {
      prevSkin.set(skin);
      for (let i = 0; i < n; i++) {
        const p = skeleton.parents[i];
        Q.toMat4(_local,
          pose.rot.subarray(i * 4, i * 4 + 4),
          pose.pos.subarray(i * 3, i * 3 + 3),
          null);
        if (p < 0) {
          if (rootMatrix) M4.multiply(_out, rootMatrix, _local);
          else M4.copy(_out, _local);
        } else {
          M4.multiply(_out, world.subarray(p * 16, p * 16 + 16), _local);
        }
        world.set(_out, i * 16);
        M4.multiply(_out, _out, skeleton.inverseBind.subarray(i * 16, i * 16 + 16));
        skin.set(_out, i * 16);
      }
    }

    function upload() {
      gl.bindTexture(gl.TEXTURE_2D, boneTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, texWidth, 1, gl.RGBA, gl.FLOAT, skin);
      gl.bindTexture(gl.TEXTURE_2D, prevBoneTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, texWidth, 1, gl.RGBA, gl.FLOAT, prevSkin);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    function boneWorldPos(i, out) {
      const o = i * 16;
      out[0] = world[o + 12]; out[1] = world[o + 13]; out[2] = world[o + 14];
      return out;
    }

    return {
      skeleton, world, skin, prevSkin, boneTex, prevBoneTex, texWidth,
      computeMatrices, upload, boneWorldPos,
    };
  }

  EV.Anim = {
    createSkeleton, createClip, createPose, createAnimator,
    createSkinInstance, sampleClip,
  };
})(window.EV = window.EV || {});
