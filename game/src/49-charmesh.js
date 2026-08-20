// Ecos del Vacío — generación procedural de mallas con piel (skinning).
// Un personaje es un solo draw call: los materiales (traje, blindaje, visor,
// acento) viajan en el atributo `extra` y se resuelven en el fragment shader.
(function (EV) {
  'use strict';

  const V3 = EV.V3, M = EV.MathUtil;

  // Identificadores de submaterial por vértice.
  const MAT_SUIT = 0.0;
  const MAT_ARMOR = 1.0;
  const MAT_VISOR = 2.0;
  const MAT_ACCENT = 3.0;
  const MAT_RUBBER = 4.0;

  function builder(skeleton) {
    const P = [], N = [], E = [], BI = [], BW = [], I = [];

    function pushVert(px, py, pz, nx, ny, nz, extra, bones) {
      P.push(px, py, pz);
      N.push(nx, ny, nz);
      E.push(extra);
      // bones: [[índice, peso], ...] — se normaliza y se rellena a 4.
      let total = 0;
      for (const b of bones) total += b[1];
      if (total <= 1e-6) { total = 1; }
      const idx = [0, 0, 0, 0], wgt = [0, 0, 0, 0];
      for (let k = 0; k < 4 && k < bones.length; k++) {
        idx[k] = bones[k][0];
        wgt[k] = bones[k][1] / total;
      }
      BI.push(idx[0], idx[1], idx[2], idx[3]);
      BW.push(wgt[0], wgt[1], wgt[2], wgt[3]);
      return P.length / 3 - 1;
    }

    function quad(a, b, c, d) { I.push(a, b, c, a, c, d); }

    // Base ortonormal alrededor de un eje.
    function frame(axis) {
      const up = Math.abs(axis[1]) > 0.94 ? [1, 0, 0] : [0, 1, 0];
      const t = V3.create(), bi = V3.create();
      V3.cross(t, up, axis); V3.normalize(t, t);
      V3.cross(bi, axis, t); V3.normalize(bi, bi);
      return [t, bi];
    }

    const _a = V3.create(), _b = V3.create(), _ax = V3.create();

    // Tubo elíptico entre dos huesos, con pesos mezclados en las puntas para
    // que codos y rodillas se doblen sin pellizcarse.
    function limb(boneA, boneB, opts = {}) {
      const {
        rx0 = 0.09, rz0 = null, rx1 = 0.075, rz1 = null,
        seg = 12, rings = 6, material = MAT_SUIT,
        parentBlend = 0.45, childBlend = 0.45,
        offsetA = null, offsetB = null, bulge = 0,
      } = opts;
      const z0 = rz0 === null ? rx0 : rz0;
      const z1 = rz1 === null ? rx1 : rz1;

      const ia = skeleton.bone(boneA);
      const ib = skeleton.bone(boneB);
      const ip = skeleton.parents[ia] >= 0 ? skeleton.parents[ia] : ia;

      skeleton.bindWorldPos(ia, _a);
      skeleton.bindWorldPos(ib, _b);
      if (offsetA) V3.add(_a, _a, offsetA);
      if (offsetB) V3.add(_b, _b, offsetB);

      V3.sub(_ax, _b, _a);
      const len = V3.len(_ax);
      if (len < 1e-5) return;
      V3.scale(_ax, _ax, 1 / len);
      const [T, B] = frame(_ax);

      const ringStart = P.length / 3;
      for (let r = 0; r <= rings; r++) {
        const t = r / rings;
        // Ensanchamiento en el medio: los miembros no son conos rectos.
        const swell = 1 + Math.sin(t * Math.PI) * bulge;
        const rx = (rx0 + (rx1 - rx0) * t) * swell;
        const rz = (z0 + (z1 - z0) * t) * swell;

        const wParent = parentBlend * M.smoothstep(0.30, 0.0, t);
        const wChild = childBlend * M.smoothstep(0.70, 1.0, t);
        const wSelf = Math.max(0.05, 1 - wParent - wChild);
        const bones = [[ia, wSelf]];
        if (wParent > 1e-3 && ip !== ia) bones.push([ip, wParent]);
        if (wChild > 1e-3) bones.push([ib, wChild]);

        for (let s = 0; s <= seg; s++) {
          const ang = (s / seg) * Math.PI * 2;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const px = _a[0] + _ax[0] * len * t + T[0] * ca * rx + B[0] * sa * rz;
          const py = _a[1] + _ax[1] * len * t + T[1] * ca * rx + B[1] * sa * rz;
          const pz = _a[2] + _ax[2] * len * t + T[2] * ca * rx + B[2] * sa * rz;
          // Normal de la superficie elíptica (gradiente, no la dirección radial).
          let nx = T[0] * (ca / rx) + B[0] * (sa / rz);
          let ny = T[1] * (ca / rx) + B[1] * (sa / rz);
          let nz = T[2] * (ca / rx) + B[2] * (sa / rz);
          const nl = Math.hypot(nx, ny, nz) || 1;
          pushVert(px, py, pz, nx / nl, ny / nl, nz / nl, material, bones);
        }
      }
      for (let r = 0; r < rings; r++) {
        for (let s = 0; s < seg; s++) {
          const a = ringStart + r * (seg + 1) + s;
          quad(a, a + seg + 1, a + seg + 2, a + 1);
        }
      }
    }

    // Elipsoide pegado a un hueso: articulaciones, cabeza, casco.
    function blob(boneName, opts = {}) {
      const {
        r = 0.1, ry = null, rz = null, offset = [0, 0, 0],
        seg = 14, rings = 10, material = MAT_SUIT, weightWith = null, weightAmount = 0.35,
        squashY = 1,
      } = opts;
      const i = skeleton.bone(boneName);
      const rx = r, RY = (ry === null ? r : ry) * squashY, RZ = rz === null ? r : rz;
      skeleton.bindWorldPos(i, _a);
      const cx = _a[0] + offset[0], cy = _a[1] + offset[1], cz = _a[2] + offset[2];

      const bones = [[i, 1]];
      if (weightWith) bones.push([skeleton.bone(weightWith), weightAmount]);

      const start = P.length / 3;
      for (let j = 0; j <= rings; j++) {
        const v = j / rings, theta = v * Math.PI;
        const st = Math.sin(theta), ct = Math.cos(theta);
        for (let s = 0; s <= seg; s++) {
          const u = s / seg, phi = u * Math.PI * 2;
          const ux = st * Math.cos(phi), uy = ct, uz = st * Math.sin(phi);
          let nx = ux / rx, ny = uy / RY, nz = uz / RZ;
          const nl = Math.hypot(nx, ny, nz) || 1;
          pushVert(cx + ux * rx, cy + uy * RY, cz + uz * RZ,
            nx / nl, ny / nl, nz / nl, material, bones);
        }
      }
      for (let j = 0; j < rings; j++) {
        for (let s = 0; s < seg; s++) {
          const a = start + j * (seg + 1) + s;
          quad(a, a + seg + 1, a + seg + 2, a + 1);
        }
      }
    }

    // Placa de blindaje: caja biselada, rígida a un hueso. El bisel importa —
    // una arista viva de 90° delata geometría barata en cuanto le pega la luz.
    function plate(boneName, opts = {}) {
      const {
        size = [0.2, 0.2, 0.1], offset = [0, 0, 0], rot = [0, 0, 0],
        bevel = 0.012, material = MAT_ARMOR, weightWith = null, weightAmount = 0,
      } = opts;
      const i = skeleton.bone(boneName);
      skeleton.bindWorldPos(i, _a);
      const bones = [[i, 1]];
      if (weightWith && weightAmount > 0) bones.push([skeleton.bone(weightWith), weightAmount]);

      const cx = Math.cos(rot[0]), sx = Math.sin(rot[0]);
      const cy = Math.cos(rot[1]), sy = Math.sin(rot[1]);
      const cz = Math.cos(rot[2]), sz = Math.sin(rot[2]);
      const rotate = (v) => {
        let x = v[0], y = v[1], z = v[2];
        let y1 = y * cx - z * sx, z1 = y * sx + z * cx;
        let x2 = x * cy + z1 * sy, z2 = -x * sy + z1 * cy;
        let x3 = x2 * cz - y1 * sz, y3 = x2 * sz + y1 * cz;
        return [x3, y3, z2];
      };

      const hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
      const faces = [
        { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], d: hz },
        { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], d: hz },
        { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], d: hx },
        { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], d: hx },
        { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], d: hy },
        { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], d: hy },
      ];
      for (const f of faces) {
        // Cara achicada por el bisel + un anillo perimetral inclinado.
        const eu = (f.u[0] ? hx : f.u[1] ? hy : hz) - bevel;
        const ev = (f.v[0] ? hx : f.v[1] ? hy : hz) - bevel;
        const base = P.length / 3;
        const corners = [[-eu, -ev], [eu, -ev], [eu, ev], [-eu, ev]];
        for (const [a, b] of corners) {
          const local = [
            f.n[0] * f.d + f.u[0] * a + f.v[0] * b,
            f.n[1] * f.d + f.u[1] * a + f.v[1] * b,
            f.n[2] * f.d + f.u[2] * a + f.v[2] * b,
          ];
          const w = rotate(local);
          const nn = rotate(f.n);
          pushVert(_a[0] + offset[0] + w[0], _a[1] + offset[1] + w[1], _a[2] + offset[2] + w[2],
            nn[0], nn[1], nn[2], material, bones);
        }
        quad(base, base + 1, base + 2, base + 3);

        // Faldón del bisel: normal a 45°, atrapa un reflejo especular fino.
        const outer = [[-eu - bevel, -ev - bevel], [eu + bevel, -ev - bevel],
                       [eu + bevel, ev + bevel], [-eu - bevel, ev + bevel]];
        const ringBase = P.length / 3;
        for (let k = 0; k < 4; k++) {
          const [a, b] = outer[k];
          const local = [
            f.n[0] * (f.d - bevel) + f.u[0] * a + f.v[0] * b,
            f.n[1] * (f.d - bevel) + f.u[1] * a + f.v[1] * b,
            f.n[2] * (f.d - bevel) + f.u[2] * a + f.v[2] * b,
          ];
          const w = rotate(local);
          const ln = [
            f.n[0] * 0.6 + (f.u[0] * Math.sign(a) + f.v[0] * Math.sign(b)) * 0.5,
            f.n[1] * 0.6 + (f.u[1] * Math.sign(a) + f.v[1] * Math.sign(b)) * 0.5,
            f.n[2] * 0.6 + (f.u[2] * Math.sign(a) + f.v[2] * Math.sign(b)) * 0.5,
          ];
          const nn = rotate(ln);
          const nl = Math.hypot(nn[0], nn[1], nn[2]) || 1;
          pushVert(_a[0] + offset[0] + w[0], _a[1] + offset[1] + w[1], _a[2] + offset[2] + w[2],
            nn[0] / nl, nn[1] / nl, nn[2] / nl, material, bones);
        }
        for (let k = 0; k < 4; k++) {
          const n2 = (k + 1) % 4;
          quad(base + k, ringBase + k, ringBase + n2, base + n2);
        }
      }
    }

    function build() {
      const gl = EV.GL.ctx;
      const count = P.length / 3;
      const STRIDE = 15;   // pos3 + nrm3 + extra1 + idx4 + wgt4
      const verts = new Float32Array(count * STRIDE);
      for (let i = 0; i < count; i++) {
        const o = i * STRIDE;
        verts[o] = P[i * 3]; verts[o + 1] = P[i * 3 + 1]; verts[o + 2] = P[i * 3 + 2];
        verts[o + 3] = N[i * 3]; verts[o + 4] = N[i * 3 + 1]; verts[o + 5] = N[i * 3 + 2];
        verts[o + 6] = E[i];
        verts[o + 7] = BI[i * 4]; verts[o + 8] = BI[i * 4 + 1];
        verts[o + 9] = BI[i * 4 + 2]; verts[o + 10] = BI[i * 4 + 3];
        verts[o + 11] = BW[i * 4]; verts[o + 12] = BW[i * 4 + 1];
        verts[o + 13] = BW[i * 4 + 2]; verts[o + 14] = BW[i * 4 + 3];
      }
      const idx = count > 65535 ? new Uint32Array(I) : new Uint16Array(I);
      const vbo = EV.GL.buffer(gl.ARRAY_BUFFER, verts);
      const ibo = EV.GL.buffer(gl.ELEMENT_ARRAY_BUFFER, idx);
      const bytes = STRIDE * 4;
      const vao = EV.GL.vao([
        { loc: 0, size: 3, buffer: vbo, stride: bytes, offset: 0 },
        { loc: 1, size: 3, buffer: vbo, stride: bytes, offset: 12 },
        { loc: 2, size: 1, buffer: vbo, stride: bytes, offset: 24 },
        { loc: 5, size: 4, buffer: vbo, stride: bytes, offset: 28 },
        { loc: 6, size: 4, buffer: vbo, stride: bytes, offset: 44 },
      ], ibo);
      const indexType = count > 65535 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
      return {
        vao, indexCount: I.length, indexType, vertexCount: count,
        triangles: I.length / 3,
        draw() {
          gl.bindVertexArray(vao);
          gl.drawElements(gl.TRIANGLES, I.length, indexType, 0);
        },
      };
    }

    // Datos crudos en CPU: los usa el exportador a glTF, que no puede leer
    // de vuelta los buffers de la GPU.
    function raw() {
      return {
        positions: P.slice(), normals: N.slice(), extras: E.slice(),
        boneIdx: BI.slice(), boneWgt: BW.slice(), indices: I.slice(),
        vertexCount: P.length / 3, triangleCount: I.length / 3,
      };
    }

    return { limb, blob, plate, build, raw,
      get stats() { return { verts: P.length / 3, tris: I.length / 3 }; } };
  }

  EV.CharMesh = { builder, MAT_SUIT, MAT_ARMOR, MAT_VISOR, MAT_ACCENT, MAT_RUBBER };
})(window.EV = window.EV || {});
