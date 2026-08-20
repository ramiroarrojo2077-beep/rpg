// Ecos del Vacío — primitivas de malla y grafo de nodos.
// Layout de vértice común a todo el juego: pos(3) + normal(3) + extra(1).
(function (EV) {
  'use strict';

  const STRIDE = 7;

  function upload(positions, normals, extras, indices) {
    const gl = EV.GL.ctx;
    const count = positions.length / 3;
    const verts = new Float32Array(count * STRIDE);
    for (let i = 0; i < count; i++) {
      const o = i * STRIDE;
      verts[o] = positions[i * 3];
      verts[o + 1] = positions[i * 3 + 1];
      verts[o + 2] = positions[i * 3 + 2];
      verts[o + 3] = normals[i * 3];
      verts[o + 4] = normals[i * 3 + 1];
      verts[o + 5] = normals[i * 3 + 2];
      verts[o + 6] = extras ? extras[i] : 0;
    }
    const idx = indices.length > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
    const vbo = EV.GL.buffer(gl.ARRAY_BUFFER, verts);
    const ibo = EV.GL.buffer(gl.ELEMENT_ARRAY_BUFFER, idx);
    const bytes = STRIDE * 4;
    const vao = EV.GL.vao([
      { loc: 0, size: 3, buffer: vbo, stride: bytes, offset: 0 },
      { loc: 1, size: 3, buffer: vbo, stride: bytes, offset: 12 },
      { loc: 2, size: 1, buffer: vbo, stride: bytes, offset: 24 },
    ], ibo);
    return {
      vao,
      // Buffers crudos: los necesita el instanciado, que reconstruye su propio VAO.
      vboRef: vbo,
      iboRef: ibo,
      indexCount: indices.length,
      indexType: indices.length > 65535 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
      draw() {
        gl.bindVertexArray(vao);
        gl.drawElements(gl.TRIANGLES, this.indexCount, this.indexType, 0);
      },
      drawInstanced(n) {
        gl.bindVertexArray(vao);
        gl.drawElementsInstanced(gl.TRIANGLES, this.indexCount, this.indexType, 0, n);
      },
    };
  }

  // Caja centrada en el origen, normales planas por cara.
  function box(w, h, d, bevelExtra) {
    const hx = w / 2, hy = h / 2, hz = d / 2;
    const P = [], Nn = [], E = [], I = [];
    const faces = [
      { n: [0, 0, 1], v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
      { n: [0, 0, -1], v: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
      { n: [1, 0, 0], v: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
      { n: [-1, 0, 0], v: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
      { n: [0, 1, 0], v: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
      { n: [0, -1, 0], v: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
    ];
    for (const f of faces) {
      const base = P.length / 3;
      for (const v of f.v) {
        P.push(v[0], v[1], v[2]);
        Nn.push(f.n[0], f.n[1], f.n[2]);
        E.push(bevelExtra || 0);
      }
      I.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return upload(P, Nn, E, I);
  }

  // Cilindro/cono truncado sobre Y, con tapas.
  function cylinder(r1, r2, h, seg, extra) {
    const P = [], Nn = [], E = [], I = [];
    const hy = h / 2;
    const slope = (r1 - r2) / h;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nl = Math.hypot(1, slope);
      P.push(ca * r1, -hy, sa * r1);
      Nn.push(ca / nl, slope / nl, sa / nl);
      E.push(extra || 0);
      P.push(ca * r2, hy, sa * r2);
      Nn.push(ca / nl, slope / nl, sa / nl);
      E.push(extra || 0);
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      I.push(a, c, b, b, c, d);
    }
    // tapas
    for (const [y, r, ny] of [[-hy, r1, -1], [hy, r2, 1]]) {
      if (r <= 1e-5) continue;
      const centre = P.length / 3;
      P.push(0, y, 0); Nn.push(0, ny, 0); E.push(extra || 0);
      const start = P.length / 3;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        P.push(Math.cos(a) * r, y, Math.sin(a) * r);
        Nn.push(0, ny, 0); E.push(extra || 0);
      }
      for (let i = 0; i < seg; i++) {
        if (ny > 0) I.push(centre, start + i, start + i + 1);
        else I.push(centre, start + i + 1, start + i);
      }
    }
    return upload(P, Nn, E, I);
  }

  function sphere(r, seg, rings, extra) {
    const P = [], Nn = [], E = [], I = [];
    for (let j = 0; j <= rings; j++) {
      const v = j / rings, theta = v * Math.PI;
      const st = Math.sin(theta), ct = Math.cos(theta);
      for (let i = 0; i <= seg; i++) {
        const u = i / seg, phi = u * Math.PI * 2;
        const x = st * Math.cos(phi), y = ct, z = st * Math.sin(phi);
        P.push(x * r, y * r, z * r);
        Nn.push(x, y, z);
        E.push(extra || 0);
      }
    }
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < seg; i++) {
        const a = j * (seg + 1) + i, b = a + seg + 1;
        I.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    return upload(P, Nn, E, I);
  }

  // Racimo de cristal: varias agujas facetadas inclinadas desde una base común.
  // Una sola aguja por instancia leía como un cono de tráfico; un racimo lee
  // como una formación mineral.
  function crystalSpire(seed) {
    const rnd = EV.makeNoise(seed);
    const P = [], Nn = [], E = [], I = [];
    const shards = 3 + Math.floor(rnd.rand() * 4);

    for (let sh = 0; sh < shards; sh++) {
      const sides = 5 + Math.floor(rnd.rand() * 3);
      // La aguja principal es vertical; las secundarias se abren y son menores.
      const main = sh === 0;
      const h = main ? 1.0 : (0.30 + rnd.rand() * 0.52);
      const tilt = main ? rnd.rand() * 0.10 : 0.22 + rnd.rand() * 0.55;
      const dir = rnd.rand() * Math.PI * 2;
      const offR = main ? 0 : 0.12 + rnd.rand() * 0.26;
      const ox = Math.cos(dir) * offR, oz = Math.sin(dir) * offR;
      const rBase = (main ? 0.26 : 0.13) * (0.75 + rnd.rand() * 0.6);
      const rMid = rBase * (0.68 + rnd.rand() * 0.26);

      const levels = [
        { y: -0.06, r: rBase * 1.08 },
        { y: 0.40 * h, r: rMid },
        { y: 0.80 * h, r: rMid * 0.48 },
        { y: h, r: 0.010 },
      ];
      const jitter = [];
      for (let i = 0; i < sides; i++) jitter.push(0.74 + rnd.rand() * 0.52);

      // Inclinación de la aguja alrededor de su base.
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const cd = Math.cos(dir), sd = Math.sin(dir);
      const place = (x, y, z) => {
        // inclina en el plano definido por dir
        const lx = x * cd + z * sd, lz = -x * sd + z * cd;
        const ty = y * ct - lx * st, tx = y * st + lx * ct;
        return [tx * cd - lz * sd + ox, ty, tx * sd + lz * cd + oz];
      };

      for (let l = 0; l < levels.length - 1; l++) {
        const lo = levels[l], hi = levels[l + 1];
        for (let i = 0; i < sides; i++) {
          const a0 = (i / sides) * Math.PI * 2;
          const a1 = ((i + 1) / sides) * Math.PI * 2;
          const j0 = jitter[i], j1 = jitter[(i + 1) % sides];
          const q = [
            place(Math.cos(a0) * lo.r * j0, lo.y, Math.sin(a0) * lo.r * j0),
            place(Math.cos(a1) * lo.r * j1, lo.y, Math.sin(a1) * lo.r * j1),
            place(Math.cos(a1) * hi.r * j1, hi.y, Math.sin(a1) * hi.r * j1),
            place(Math.cos(a0) * hi.r * j0, hi.y, Math.sin(a0) * hi.r * j0),
          ];
          const ux = q[1][0] - q[0][0], uy = q[1][1] - q[0][1], uz = q[1][2] - q[0][2];
          const vx = q[3][0] - q[0][0], vy = q[3][1] - q[0][1], vz = q[3][2] - q[0][2];
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          const nl = Math.hypot(nx, ny, nz) || 1;
          nx /= nl; ny /= nl; nz /= nl;
          const base = P.length / 3;
          for (const v of q) {
            P.push(v[0], v[1], v[2]);
            Nn.push(nx, ny, nz);
            E.push(Math.max(v[1], 0));   // altura: gradiente interno del cristal
          }
          I.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
    return upload(P, Nn, E, I);
  }

  // Roca erosionada: esfera deformada por ruido, con facetas planas.
  function rock(seed) {
    const rnd = EV.makeNoise(seed);
    const P = [], Nn = [], E = [], I = [];
    const seg = 10, rings = 7;
    const amp = [];
    for (let i = 0; i < 12; i++) amp.push(0.62 + rnd.rand() * 0.75);
    const radiusAt = (x, y, z) => {
      let r = 1.0;
      r *= 0.78 + 0.30 * Math.sin(x * 3.1 + amp[0]) * Math.cos(z * 2.7 + amp[1]);
      r *= 0.86 + 0.22 * Math.sin(y * 4.3 + amp[2]);
      r *= 0.90 + 0.18 * Math.cos(x * 6.1 + y * 5.2 + amp[3]);
      return Math.max(r, 0.35);
    };
    const grid = [];
    for (let j = 0; j <= rings; j++) {
      const row = [];
      const theta = (j / rings) * Math.PI;
      for (let i = 0; i <= seg; i++) {
        const phi = (i / seg) * Math.PI * 2;
        const ux = Math.sin(theta) * Math.cos(phi);
        const uy = Math.cos(theta);
        const uz = Math.sin(theta) * Math.sin(phi);
        const r = radiusAt(ux, uy, uz);
        // Aplastada: las rocas se asientan, no flotan como pelotas.
        row.push([ux * r, uy * r * 0.62, uz * r]);
      }
      grid.push(row);
    }
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < seg; i++) {
        const q = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]];
        const ux = q[1][0] - q[0][0], uy = q[1][1] - q[0][1], uz = q[1][2] - q[0][2];
        const vx = q[3][0] - q[0][0], vy = q[3][1] - q[0][1], vz = q[3][2] - q[0][2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const nl = Math.hypot(nx, ny, nz) || 1;
        const base = P.length / 3;
        for (const v of q) {
          P.push(v[0], v[1], v[2]);
          Nn.push(nx / nl, ny / nl, nz / nl);
          E.push(0);
        }
        I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    return upload(P, Nn, E, I);
  }

  // ------------------------------------------------------------------- nodos
  // Grafo mínimo: cada nodo tiene transformación local, malla y material.
  function node(opts) {
    return {
      mesh: opts.mesh || null,
      pos: EV.V3.create(...(opts.pos || [0, 0, 0])),
      rot: EV.V3.create(...(opts.rot || [0, 0, 0])),
      scl: EV.V3.create(...(opts.scl || [1, 1, 1])),
      material: opts.material || { albedo: [0.5, 0.5, 0.5], rough: 0.7, metal: 0.0, emissive: [0, 0, 0] },
      children: opts.children || [],
      local: EV.M4.create(),
      world: EV.M4.create(),
      prevWorld: EV.M4.create(),
      visible: opts.visible !== false,
      name: opts.name || '',
      userData: opts.userData || {},
    };
  }

  const _tmp = EV.M4 ? EV.M4.create() : null;
  function updateWorld(n, parentWorld) {
    EV.M4.copy(n.prevWorld, n.world);
    EV.M4.compose(n.local, n.pos, n.rot, n.scl);
    if (parentWorld) EV.M4.multiply(n.world, parentWorld, n.local);
    else EV.M4.copy(n.world, n.local);
    for (const c of n.children) updateWorld(c, n.world);
  }

  function traverse(n, fn, parentVisible = true) {
    const vis = parentVisible && n.visible;
    if (vis && n.mesh) fn(n);
    for (const c of n.children) traverse(c, fn, vis);
  }

  EV.Geo = { box, cylinder, sphere, crystalSpire, rock, node, updateWorld, traverse, upload, STRIDE };
})(window.EV = window.EV || {});
