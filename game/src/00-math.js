// Ecos del Vacío — matemática mínima (vec3 / mat4 / quat) sin dependencias.
// Todas las matrices son column-major, compatibles con WebGL.
(function (EV) {
  'use strict';

  const V3 = {
    create: (x = 0, y = 0, z = 0) => new Float32Array([x, y, z]),
    set: (o, x, y, z) => { o[0] = x; o[1] = y; o[2] = z; return o; },
    copy: (o, a) => { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; },
    add: (o, a, b) => { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; },
    sub: (o, a, b) => { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; },
    scale: (o, a, s) => { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; },
    addScaled: (o, a, b, s) => { o[0] = a[0] + b[0] * s; o[1] = a[1] + b[1] * s; o[2] = a[2] + b[2] * s; return o; },
    mul: (o, a, b) => { o[0] = a[0] * b[0]; o[1] = a[1] * b[1]; o[2] = a[2] * b[2]; return o; },
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    lenSq: (a) => a[0] * a[0] + a[1] * a[1] + a[2] * a[2],
    dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
    distSq: (a, b) => {
      const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2];
      return x * x + y * y + z * z;
    },
    cross: (o, a, b) => {
      const ax = a[0], ay = a[1], az = a[2], bx = b[0], by = b[1], bz = b[2];
      o[0] = ay * bz - az * by; o[1] = az * bx - ax * bz; o[2] = ax * by - ay * bx;
      return o;
    },
    normalize: (o, a) => {
      const l = Math.hypot(a[0], a[1], a[2]);
      if (l > 1e-8) { o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; }
      else { o[0] = 0; o[1] = 0; o[2] = 0; }
      return o;
    },
    lerp: (o, a, b, t) => {
      o[0] = a[0] + (b[0] - a[0]) * t;
      o[1] = a[1] + (b[1] - a[1]) * t;
      o[2] = a[2] + (b[2] - a[2]) * t;
      return o;
    },
    transformMat4: (o, a, m) => {
      const x = a[0], y = a[1], z = a[2];
      let w = m[3] * x + m[7] * y + m[11] * z + m[15];
      w = w || 1.0;
      o[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
      o[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
      o[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
      return o;
    },
    transformDir: (o, a, m) => {
      const x = a[0], y = a[1], z = a[2];
      o[0] = m[0] * x + m[4] * y + m[8] * z;
      o[1] = m[1] * x + m[5] * y + m[9] * z;
      o[2] = m[2] * x + m[6] * y + m[10] * z;
      return o;
    },
  };

  const M4 = {
    create: () => {
      const m = new Float32Array(16);
      m[0] = m[5] = m[10] = m[15] = 1;
      return m;
    },
    identity: (o) => {
      o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o;
    },
    copy: (o, a) => { o.set(a); return o; },

    perspective: (o, fovy, aspect, near, far) => {
      const f = 1.0 / Math.tan(fovy / 2);
      o.fill(0);
      o[0] = f / aspect; o[5] = f; o[11] = -1;
      o[10] = (far + near) / (near - far);
      o[14] = (2 * far * near) / (near - far);
      return o;
    },

    ortho: (o, l, r, b, t, n, f) => {
      o.fill(0);
      o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n);
      o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n);
      o[15] = 1;
      return o;
    },

    lookAt: (o, eye, center, up) => {
      const z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
      let zl = Math.hypot(z0, z1, z2);
      if (zl < 1e-8) { return M4.identity(o); }
      const zx = z0 / zl, zy = z1 / zl, zz = z2 / zl;
      let xx = up[1] * zz - up[2] * zy;
      let xy = up[2] * zx - up[0] * zz;
      let xz = up[0] * zy - up[1] * zx;
      const xl = Math.hypot(xx, xy, xz);
      if (xl < 1e-8) { xx = 1; xy = 0; xz = 0; }
      else { xx /= xl; xy /= xl; xz /= xl; }
      const yx = zy * xz - zz * xy;
      const yy = zz * xx - zx * xz;
      const yz = zx * xy - zy * xx;
      o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
      o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
      o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
      o[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
      o[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
      o[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
      o[15] = 1;
      return o;
    },

    multiply: (o, a, b) => {
      const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
      for (let i = 0; i < 4; i++) {
        const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
        o[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        o[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        o[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        o[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      }
      return o;
    },

    invert: (o, a) => {
      const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
      const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
      const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
      const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
      const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
      const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
      const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
      let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
      if (!det) return M4.identity(o);
      det = 1.0 / det;
      o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
      o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
      o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
      o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
      o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
      o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
      o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
      o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
      o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
      o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
      o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
      o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
      o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
      o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
      o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
      o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
      return o;
    },

    transpose: (o, a) => {
      if (o === a) {
        let t;
        t = a[1]; o[1] = a[4]; o[4] = t;
        t = a[2]; o[2] = a[8]; o[8] = t;
        t = a[3]; o[3] = a[12]; o[12] = t;
        t = a[6]; o[6] = a[9]; o[9] = t;
        t = a[7]; o[7] = a[13]; o[13] = t;
        t = a[11]; o[11] = a[14]; o[14] = t;
        return o;
      }
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) o[i * 4 + j] = a[j * 4 + i];
      return o;
    },

    fromTranslation: (o, v) => {
      M4.identity(o); o[12] = v[0]; o[13] = v[1]; o[14] = v[2]; return o;
    },

    fromScale: (o, v) => {
      o.fill(0); o[0] = v[0]; o[5] = v[1]; o[10] = v[2]; o[15] = 1; return o;
    },

    fromRotationY: (o, r) => {
      const s = Math.sin(r), c = Math.cos(r);
      o.fill(0);
      o[0] = c; o[2] = -s; o[5] = 1; o[8] = s; o[10] = c; o[15] = 1;
      return o;
    },

    // Compone traslación * rotación (euler YXZ) * escala en una sola pasada.
    compose: (o, pos, rot, scl) => {
      const cy = Math.cos(rot[1]), sy = Math.sin(rot[1]);
      const cx = Math.cos(rot[0]), sx = Math.sin(rot[0]);
      const cz = Math.cos(rot[2]), sz = Math.sin(rot[2]);
      // R = Ry * Rx * Rz
      const m00 = cy * cz + sy * sx * sz;
      const m01 = cx * sz;
      const m02 = -sy * cz + cy * sx * sz;
      const m10 = -cy * sz + sy * sx * cz;
      const m11 = cx * cz;
      const m12 = sy * sz + cy * sx * cz;
      const m20 = sy * cx;
      const m21 = -sx;
      const m22 = cy * cx;
      o[0] = m00 * scl[0]; o[1] = m01 * scl[0]; o[2] = m02 * scl[0]; o[3] = 0;
      o[4] = m10 * scl[1]; o[5] = m11 * scl[1]; o[6] = m12 * scl[1]; o[7] = 0;
      o[8] = m20 * scl[2]; o[9] = m21 * scl[2]; o[10] = m22 * scl[2]; o[11] = 0;
      o[12] = pos[0]; o[13] = pos[1]; o[14] = pos[2]; o[15] = 1;
      return o;
    },

    // Matriz normal (inversa transpuesta 3x3 empaquetada en mat4).
    normalMatrix: (o, m) => {
      M4.invert(o, m);
      M4.transpose(o, o);
      o[3] = o[7] = o[11] = o[12] = o[13] = o[14] = 0; o[15] = 1;
      return o;
    },
  };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  // Amortiguación independiente del framerate: llega al objetivo con "vida media" hl.
  const damp = (a, b, hl, dt) => b + (a - b) * Math.pow(2, -dt / Math.max(hl, 1e-6));
  const wrapAngle = (a) => {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };

  EV.V3 = V3;
  EV.M4 = M4;
  EV.MathUtil = { clamp, lerp, smoothstep, damp, wrapAngle, TAU: Math.PI * 2, DEG: Math.PI / 180 };
})(window.EV = window.EV || {});
