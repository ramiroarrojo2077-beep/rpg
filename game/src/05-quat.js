// Ecos del Vacío — cuaterniones.
// La animación esquelética mezcla poses constantemente; con ángulos de Euler la
// interpolación cruza el gimbal y los miembros se dan vuelta. Slerp no.
(function (EV) {
  'use strict';

  const Q = {
    create: () => new Float32Array([0, 0, 0, 1]),
    identity: (o) => { o[0] = 0; o[1] = 0; o[2] = 0; o[3] = 1; return o; },
    copy: (o, a) => { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; o[3] = a[3]; return o; },
    set: (o, x, y, z, w) => { o[0] = x; o[1] = y; o[2] = z; o[3] = w; return o; },

    fromAxisAngle: (o, ax, ay, az, rad) => {
      const h = rad * 0.5, s = Math.sin(h);
      const l = Math.hypot(ax, ay, az) || 1;
      o[0] = (ax / l) * s; o[1] = (ay / l) * s; o[2] = (az / l) * s; o[3] = Math.cos(h);
      return o;
    },

    // Euler XYZ en radianes (orden de aplicación X, luego Y, luego Z).
    fromEuler: (o, x, y, z) => {
      const cx = Math.cos(x * 0.5), sx = Math.sin(x * 0.5);
      const cy = Math.cos(y * 0.5), sy = Math.sin(y * 0.5);
      const cz = Math.cos(z * 0.5), sz = Math.sin(z * 0.5);
      o[0] = sx * cy * cz + cx * sy * sz;
      o[1] = cx * sy * cz - sx * cy * sz;
      o[2] = cx * cy * sz + sx * sy * cz;
      o[3] = cx * cy * cz - sx * sy * sz;
      return o;
    },

    multiply: (o, a, b) => {
      const ax = a[0], ay = a[1], az = a[2], aw = a[3];
      const bx = b[0], by = b[1], bz = b[2], bw = b[3];
      o[0] = ax * bw + aw * bx + ay * bz - az * by;
      o[1] = ay * bw + aw * by + az * bx - ax * bz;
      o[2] = az * bw + aw * bz + ax * by - ay * bx;
      o[3] = aw * bw - ax * bx - ay * by - az * bz;
      return o;
    },

    // Slerp con corrección de hemisferio: sin ella, mezclar dos poses puede
    // tomar el camino largo y el hueso gira 300° en vez de 60°.
    slerp: (o, a, b, t) => {
      let bx = b[0], by = b[1], bz = b[2], bw = b[3];
      let cosom = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
      if (cosom < 0) { cosom = -cosom; bx = -bx; by = -by; bz = -bz; bw = -bw; }
      let s0, s1;
      if (1.0 - cosom > 1e-6) {
        const omega = Math.acos(cosom);
        const sinom = Math.sin(omega);
        s0 = Math.sin((1.0 - t) * omega) / sinom;
        s1 = Math.sin(t * omega) / sinom;
      } else {
        s0 = 1.0 - t; s1 = t;   // casi paralelos: lineal evita dividir por ~0
      }
      o[0] = s0 * a[0] + s1 * bx;
      o[1] = s0 * a[1] + s1 * by;
      o[2] = s0 * a[2] + s1 * bz;
      o[3] = s0 * a[3] + s1 * bw;
      return o;
    },

    normalize: (o, a) => {
      const l = Math.hypot(a[0], a[1], a[2], a[3]) || 1;
      o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; o[3] = a[3] / l;
      return o;
    },

    // Compone T*R*S directamente en una mat4 column-major.
    toMat4: (o, q, pos, scl) => {
      const x = q[0], y = q[1], z = q[2], w = q[3];
      const x2 = x + x, y2 = y + y, z2 = z + z;
      const xx = x * x2, xy = x * y2, xz = x * z2;
      const yy = y * y2, yz = y * z2, zz = z * z2;
      const wx = w * x2, wy = w * y2, wz = w * z2;
      const sx = scl ? scl[0] : 1, sy = scl ? scl[1] : 1, sz = scl ? scl[2] : 1;
      o[0] = (1 - (yy + zz)) * sx; o[1] = (xy + wz) * sx; o[2] = (xz - wy) * sx; o[3] = 0;
      o[4] = (xy - wz) * sy; o[5] = (1 - (xx + zz)) * sy; o[6] = (yz + wx) * sy; o[7] = 0;
      o[8] = (xz + wy) * sz; o[9] = (yz - wx) * sz; o[10] = (1 - (xx + yy)) * sz; o[11] = 0;
      o[12] = pos ? pos[0] : 0; o[13] = pos ? pos[1] : 0; o[14] = pos ? pos[2] : 0; o[15] = 1;
      return o;
    },

    rotateVec3: (o, q, v) => {
      const x = v[0], y = v[1], z = v[2];
      const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
      const ix = qw * x + qy * z - qz * y;
      const iy = qw * y + qz * x - qx * z;
      const iz = qw * z + qx * y - qy * x;
      const iw = -qx * x - qy * y - qz * z;
      o[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
      o[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
      o[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
      return o;
    },
  };

  EV.Q = Q;
})(window.EV = window.EV || {});
