// Ecos del Vacío — Kether-3: campo de dunas de sílice cristalizada.
// El terreno se genera una vez de forma determinista y expone consulta de
// altura en CPU para que jugador, titán y props compartan el mismo suelo.
(function (EV) {
  'use strict';

  const SIZE = 1400;      // metros de lado
  const RES = 384;        // quads por lado
  const HALF = SIZE / 2;

  function create(seed) {
    const gl = EV.GL.ctx;
    const noise = EV.makeNoise(seed);
    const N = RES + 1;
    const heights = new Float32Array(N * N);
    const step = SIZE / RES;

    // --- perfil de altura ----------------------------------------------------
    // Dunas de gran escala + crestas afiladas de cristal + una meseta central
    // despejada que sirve de arena para la pelea de titán.
    function rawHeight(x, z) {
      const s = 0.0011;
      let h = noise.fbm(x * s, z * s, 5, 2.07, 0.5) * 46.0;
      h += noise.ridged(x * s * 2.6 + 91.3, z * s * 2.6 - 17.7, 4, 2.13, 0.5) * 22.0;
      h += noise.fbm(x * s * 7.0, z * s * 7.0, 3, 2.2, 0.5) * 3.2;

      // Meseta de combate: aplana un disco de 190 m en el centro.
      const d = Math.hypot(x, z);
      const flat = EV.MathUtil.smoothstep(190.0, 330.0, d);
      h = EV.MathUtil.lerp(2.0, h, flat);

      // Cuenco de borde: el mundo se hunde lejos, reforzando el horizonte.
      const rim = EV.MathUtil.smoothstep(HALF * 0.72, HALF, d);
      h -= rim * 26.0;
      return h;
    }

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -HALF + i * step;
        const z = -HALF + j * step;
        heights[j * N + i] = rawHeight(x, z);
      }
    }

    // --- consulta en CPU -----------------------------------------------------
    function heightAt(x, z) {
      const fx = (x + HALF) / step;
      const fz = (z + HALF) / step;
      const i = Math.floor(fx), j = Math.floor(fz);
      if (i < 0 || j < 0 || i >= RES || j >= RES) return rawHeight(x, z);
      const tx = fx - i, tz = fz - j;
      const h00 = heights[j * N + i];
      const h10 = heights[j * N + i + 1];
      const h01 = heights[(j + 1) * N + i];
      const h11 = heights[(j + 1) * N + i + 1];
      return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
    }

    const _n = EV.V3.create();
    function normalAt(x, z) {
      const e = 1.2;
      const hl = heightAt(x - e, z), hr = heightAt(x + e, z);
      const hd = heightAt(x, z - e), hu = heightAt(x, z + e);
      EV.V3.set(_n, hl - hr, 2.0 * e, hd - hu);
      return EV.V3.normalize(_n, _n);
    }

    function slopeAt(x, z) {
      const n = normalAt(x, z);
      return 1.0 - n[1];
    }

    // --- malla ---------------------------------------------------------------
    // pos(3) + normal(3) + cristal(1) = 7 floats por vértice
    const STRIDE = 7;
    const verts = new Float32Array(N * N * STRIDE);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -HALF + i * step;
        const z = -HALF + j * step;
        const h = heights[j * N + i];
        const o = (j * N + i) * STRIDE;

        // Normal por diferencias centradas sobre la grilla.
        const il = Math.max(i - 1, 0), ir = Math.min(i + 1, N - 1);
        const jd = Math.max(j - 1, 0), ju = Math.min(j + 1, N - 1);
        const nx = heights[j * N + il] - heights[j * N + ir];
        const nz = heights[jd * N + i] - heights[ju * N + i];
        const ny = 2.0 * step * ((ir - il) * 0.5);
        const len = Math.hypot(nx, ny, nz) || 1;

        // Densidad de cristal: aparece en crestas expuestas, no en valles.
        const exposure = EV.MathUtil.clamp((h + 6) / 40, 0, 1);
        const veins = noise.fbm(x * 0.006 + 41.0, z * 0.006 - 12.0, 3, 2.1, 0.55) * 0.5 + 0.5;
        const crystal = EV.MathUtil.clamp(exposure * veins * 1.6 - 0.25, 0, 1);

        verts[o] = x; verts[o + 1] = h; verts[o + 2] = z;
        verts[o + 3] = nx / len; verts[o + 4] = ny / len; verts[o + 5] = nz / len;
        verts[o + 6] = crystal;
      }
    }

    const indices = new Uint32Array(RES * RES * 6);
    let k = 0;
    for (let j = 0; j < RES; j++) {
      for (let i = 0; i < RES; i++) {
        const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
        indices[k++] = a; indices[k++] = c; indices[k++] = b;
        indices[k++] = b; indices[k++] = c; indices[k++] = d;
      }
    }

    const vbo = EV.GL.buffer(gl.ARRAY_BUFFER, verts);
    const ibo = EV.GL.buffer(gl.ELEMENT_ARRAY_BUFFER, indices);
    const bytes = STRIDE * 4;
    const vao = EV.GL.vao([
      { loc: 0, size: 3, buffer: vbo, stride: bytes, offset: 0 },
      { loc: 1, size: 3, buffer: vbo, stride: bytes, offset: 12 },
      { loc: 2, size: 1, buffer: vbo, stride: bytes, offset: 24 },
    ], ibo);

    // --- campo lejano ---------------------------------------------------------
    // Anillo radial que continúa las dunas hasta 25 km. Sin esto, el terreno
    // termina en el vacío y entre su borde y el horizonte del planeta aparece
    // una franja plana. El pilar de "escala masiva" exige que lo que se ve en
    // el horizonte sea geometría real, no un truco.
    const FAR_RINGS = 56, FAR_SEGS = 128, FAR_END = 25000;
    const R_START = HALF * 0.98;
    const PLANET_R = 6.10e6;

    function farHeight(x, z) {
      const d = Math.hypot(x, z);
      // Curvatura del planeta: lo lejano se hunde bajo el horizonte solo.
      return rawHeight(x, z) - (d * d) / (2 * PLANET_R);
    }

    const farVerts = new Float32Array((FAR_RINGS + 1) * (FAR_SEGS + 1) * STRIDE);
    let fo = 0;
    for (let r = 0; r <= FAR_RINGS; r++) {
      // Espaciado exponencial: densidad donde importa, pocos anillos lejos.
      const t = r / FAR_RINGS;
      const radius = R_START * Math.pow(FAR_END / R_START, t);
      for (let a = 0; a <= FAR_SEGS; a++) {
        const ang = (a / FAR_SEGS) * Math.PI * 2;
        const x = Math.cos(ang) * radius;
        const z = Math.sin(ang) * radius;
        const y = farHeight(x, z);
        const e = Math.max(radius * 0.004, 1.5);
        const hl = farHeight(x - e, z), hr = farHeight(x + e, z);
        const hd = farHeight(x, z - e), hu = farHeight(x, z + e);
        let nx = hl - hr, ny = 2.0 * e, nz = hd - hu;
        const nl = Math.hypot(nx, ny, nz) || 1;
        farVerts[fo] = x; farVerts[fo + 1] = y; farVerts[fo + 2] = z;
        farVerts[fo + 3] = nx / nl; farVerts[fo + 4] = ny / nl; farVerts[fo + 5] = nz / nl;
        farVerts[fo + 6] = 0;
        fo += STRIDE;
      }
    }
    const farIdx = new Uint32Array(FAR_RINGS * FAR_SEGS * 6);
    let fk = 0;
    for (let r = 0; r < FAR_RINGS; r++) {
      for (let a = 0; a < FAR_SEGS; a++) {
        const p0 = r * (FAR_SEGS + 1) + a;
        const p1 = p0 + 1;
        const p2 = p0 + (FAR_SEGS + 1);
        const p3 = p2 + 1;
        farIdx[fk++] = p0; farIdx[fk++] = p1; farIdx[fk++] = p2;
        farIdx[fk++] = p1; farIdx[fk++] = p3; farIdx[fk++] = p2;
      }
    }
    const farVbo = EV.GL.buffer(gl.ARRAY_BUFFER, farVerts);
    const farIbo = EV.GL.buffer(gl.ELEMENT_ARRAY_BUFFER, farIdx);
    const farVao = EV.GL.vao([
      { loc: 0, size: 3, buffer: farVbo, stride: bytes, offset: 0 },
      { loc: 1, size: 3, buffer: farVbo, stride: bytes, offset: 12 },
      { loc: 2, size: 1, buffer: farVbo, stride: bytes, offset: 24 },
    ], farIbo);

    function draw() {
      gl.bindVertexArray(vao);
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_INT, 0);
    }

    // El campo lejano no entra al mapa de sombras: las cascadas sólo cubren
    // 620 m, así que gastarlo ahí no cambia un píxel.
    function drawFar() {
      gl.bindVertexArray(farVao);
      gl.drawElements(gl.TRIANGLES, farIdx.length, gl.UNSIGNED_INT, 0);
    }

    return {
      SIZE, HALF, RES, noise,
      heightAt, normalAt, slopeAt, draw, drawFar, vao,
      indexCount: indices.length,
      triangles: (indices.length + farIdx.length) / 3,
    };
  }

  EV.Terrain = { create, SIZE, HALF };
})(window.EV = window.EV || {});
