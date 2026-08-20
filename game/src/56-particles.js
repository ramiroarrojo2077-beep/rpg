// Ecos del Vacío — partículas.
// Simulación en CPU sobre un pool fijo, dibujo en una sola llamada instanciada.
// Los billboards se suavizan contra la profundidad de la escena para que no
// aparezca el borde duro del quad al cruzar el suelo.
(function (EV) {
  'use strict';

  const V3 = EV.V3, M = EV.MathUtil;

  const VS = /* glsl */`
#include <common>
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aPosSize;    // xyz posición, w tamaño
layout(location=2) in vec4 aColor;      // rgb color, a alfa
layout(location=3) in vec4 aParams;     // x rotación, y brillo, z tipo, w semilla

uniform mat4 uViewProj;
uniform vec3 uCamRight;
uniform vec3 uCamUp;

out vec2  vUV;
out vec4  vColor;
out float vGlow;
out vec4  vClip;

void main(){
  float c = cos(aParams.x), s = sin(aParams.x);
  vec2 rot = vec2(aCorner.x * c - aCorner.y * s, aCorner.x * s + aCorner.y * c);
  vec3 world = aPosSize.xyz
             + uCamRight * (rot.x * aPosSize.w)
             + uCamUp    * (rot.y * aPosSize.w);
  vUV = aCorner * 0.5 + 0.5;
  vColor = aColor;
  vGlow = aParams.y;
  vClip = uViewProj * vec4(world, 1.0);
  gl_Position = vClip;
}`;

  const FS = /* glsl */`
#include <common>
in vec2  vUV;
in vec4  vColor;
in float vGlow;
in vec4  vClip;

uniform sampler2D uSceneDepth;
uniform vec2  uScreenSize;
uniform float uNear;
uniform float uFar;
uniform vec3  uSunDir;
uniform vec3  uSunRadiance;

layout(location=0) out vec4 oColor;

void main(){
  // Disco suave con núcleo denso: más creíble que un gaussiano puro para polvo.
  vec2 d = vUV * 2.0 - 1.0;
  float r2 = dot(d, d);
  if(r2 > 1.0) discard;
  float shape = pow(1.0 - r2, 1.5);

  // Suavizado contra la escena: evita el corte recto donde el quad atraviesa
  // el suelo, que es lo que delata que una nube de polvo son cuadrados.
  vec2 uv = gl_FragCoord.xy / uScreenSize;
  float sceneD = texture(uSceneDepth, uv).r;
  float sceneZ = linearizeDepth(sceneD, uNear, uFar);
  float fragZ = linearizeDepth(gl_FragCoord.z, uNear, uFar);
  float soft = saturate((sceneZ - fragZ) / 1.4);

  float alpha = vColor.a * shape * soft;
  if(alpha < 0.002) discard;

  // El polvo dispersa luz solar: se enciende mirando hacia el sol.
  vec3 lit = vColor.rgb * (uSunRadiance * 0.16 + vec3(0.10, 0.09, 0.10));
  lit += vColor.rgb * vGlow;

  oColor = vec4(lit * alpha, alpha);
}`;

  const MAX = 3000;

  function create() {
    const gl = EV.GL.ctx;
    const prog = EV.GL.program(VS, FS, 'partículas');

    // Quad unitario compartido; el resto viaja por instancia.
    const corners = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);
    const cornerBuf = EV.GL.buffer(gl.ARRAY_BUFFER, corners);
    const idxBuf = EV.GL.buffer(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]));

    // 12 floats por instancia: posSize(4) + color(4) + params(4)
    const data = new Float32Array(MAX * 12);
    const instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    for (let i = 0; i < 3; i++) {
      gl.enableVertexAttribArray(1 + i);
      gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, 48, i * 16);
      gl.vertexAttribDivisor(1 + i, 1);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bindVertexArray(null);

    // Estado de simulación en arreglos planos (sin objetos por partícula).
    const px = new Float32Array(MAX), py = new Float32Array(MAX), pz = new Float32Array(MAX);
    const vx = new Float32Array(MAX), vy = new Float32Array(MAX), vz = new Float32Array(MAX);
    const life = new Float32Array(MAX), maxLife = new Float32Array(MAX);
    const size0 = new Float32Array(MAX), size1 = new Float32Array(MAX);
    const cr = new Float32Array(MAX), cg = new Float32Array(MAX), cb = new Float32Array(MAX);
    const alpha0 = new Float32Array(MAX), glow = new Float32Array(MAX);
    const rot = new Float32Array(MAX), rotV = new Float32Array(MAX);
    const drag = new Float32Array(MAX), grav = new Float32Array(MAX);
    let count = 0;

    function spawn(o) {
      if (count >= MAX) {
        // Pool lleno: reemplaza la más vieja en vez de descartar el evento.
        let worst = 0, worstT = -1;
        for (let i = 0; i < 64; i++) {
          const j = (Math.random() * count) | 0;
          const t = 1 - life[j] / maxLife[j];
          if (t > worstT) { worstT = t; worst = j; }
        }
        count = Math.max(count, worst + 1);
        write(worst, o);
        return;
      }
      write(count++, o);
    }

    function write(i, o) {
      px[i] = o.x; py[i] = o.y; pz[i] = o.z;
      vx[i] = o.vx || 0; vy[i] = o.vy || 0; vz[i] = o.vz || 0;
      maxLife[i] = o.life || 1; life[i] = maxLife[i];
      size0[i] = o.size || 0.3; size1[i] = o.sizeEnd === undefined ? size0[i] * 2.2 : o.sizeEnd;
      const c = o.color || [0.55, 0.42, 0.28];
      cr[i] = c[0]; cg[i] = c[1]; cb[i] = c[2];
      alpha0[i] = o.alpha === undefined ? 0.55 : o.alpha;
      glow[i] = o.glow || 0;
      rot[i] = Math.random() * Math.PI * 2;
      rotV[i] = (Math.random() - 0.5) * (o.spin === undefined ? 1.2 : o.spin);
      drag[i] = o.drag === undefined ? 1.6 : o.drag;
      grav[i] = o.gravity === undefined ? -1.2 : o.gravity;
    }

    function update(dt, wind) {
      const wx = wind ? wind[0] : 0, wz = wind ? wind[2] : 0;
      let n = 0;
      for (let i = 0; i < count; i++) {
        life[i] -= dt;
        if (life[i] <= 0) continue;
        // Compacta en el lugar: los vivos quedan al frente del arreglo.
        if (n !== i) {
          px[n] = px[i]; py[n] = py[i]; pz[n] = pz[i];
          vx[n] = vx[i]; vy[n] = vy[i]; vz[n] = vz[i];
          life[n] = life[i]; maxLife[n] = maxLife[i];
          size0[n] = size0[i]; size1[n] = size1[i];
          cr[n] = cr[i]; cg[n] = cg[i]; cb[n] = cb[i];
          alpha0[n] = alpha0[i]; glow[n] = glow[i];
          rot[n] = rot[i]; rotV[n] = rotV[i];
          drag[n] = drag[i]; grav[n] = grav[i];
        }
        const d = Math.max(0, 1 - drag[n] * dt);
        vx[n] = vx[n] * d + wx * dt * 0.8;
        vz[n] = vz[n] * d + wz * dt * 0.8;
        vy[n] = vy[n] * d + grav[n] * dt;
        px[n] += vx[n] * dt; py[n] += vy[n] * dt; pz[n] += vz[n] * dt;
        rot[n] += rotV[n] * dt;
        n++;
      }
      count = n;
    }

    function upload() {
      for (let i = 0; i < count; i++) {
        const t = 1 - life[i] / maxLife[i];
        const o = i * 12;
        data[o] = px[i]; data[o + 1] = py[i]; data[o + 2] = pz[i];
        data[o + 3] = size0[i] + (size1[i] - size0[i]) * t;
        data[o + 4] = cr[i]; data[o + 5] = cg[i]; data[o + 6] = cb[i];
        // Entrada rápida, salida larga: así el polvo "aparece" y se disipa.
        const fade = Math.min(t / 0.12, 1.0) * (1 - t) * (1 - t);
        data[o + 7] = alpha0[i] * fade;
        data[o + 8] = rot[i];
        data[o + 9] = glow[i] * (1 - t);
        data[o + 10] = 0; data[o + 11] = 0;
      }
      if (count === 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, count * 12));
    }

    function draw(ctx) {
      if (count === 0) return;
      upload();
      gl.useProgram(prog.prog);
      const U = EV.GL.U;
      U.m4(prog, 'uViewProj', ctx.viewProj);
      U.v3(prog, 'uCamRight', ctx.camRight);
      U.v3(prog, 'uCamUp', ctx.camUp);
      U.tex(prog, 'uSceneDepth', 0, ctx.depthTex);
      U.v2(prog, 'uScreenSize', ctx.width, ctx.height);
      U.f(prog, 'uNear', ctx.near);
      U.f(prog, 'uFar', ctx.far);
      U.v3(prog, 'uSunDir', ctx.sunDir);
      U.v3(prog, 'uSunRadiance', ctx.sunRadiance);

      gl.enable(gl.BLEND);
      // Premultiplicado: el shader ya multiplicó color por alfa.
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.disable(gl.CULL_FACE);

      gl.bindVertexArray(vao);
      gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, count);
      gl.bindVertexArray(null);

      gl.disable(gl.BLEND);
      gl.enable(gl.CULL_FACE);
    }

    // ------------------------------------------------------- emisores
    const E = {
      footstep(x, y, z, speed) {
        const n = 2 + (speed > 8 ? 2 : 0);
        for (let i = 0; i < n; i++) {
          spawn({
            x: x + (Math.random() - 0.5) * 0.3, y: y + 0.05, z: z + (Math.random() - 0.5) * 0.3,
            vx: (Math.random() - 0.5) * 0.9, vy: 0.35 + Math.random() * 0.5,
            vz: (Math.random() - 0.5) * 0.9,
            life: 0.7 + Math.random() * 0.6, size: 0.14, sizeEnd: 0.62,
            color: [0.62, 0.45, 0.28], alpha: 0.28, drag: 2.2, gravity: -0.5,
          });
        }
      },
      landing(x, y, z, force) {
        const n = 8 + Math.min(18, force | 0);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 1.4 + Math.random() * 3.0 * (force / 12);
          spawn({
            x, y: y + 0.06, z,
            vx: Math.cos(a) * sp, vy: 0.5 + Math.random() * 1.1, vz: Math.sin(a) * sp,
            life: 0.9 + Math.random() * 0.8, size: 0.18, sizeEnd: 1.3,
            color: [0.60, 0.44, 0.27], alpha: 0.34, drag: 1.9, gravity: -1.0,
          });
        }
      },
      thruster(x, y, z, dx, dz) {
        spawn({
          x, y, z,
          vx: -dx * 1.2 + (Math.random() - 0.5) * 0.5, vy: -1.6 - Math.random(),
          vz: -dz * 1.2 + (Math.random() - 0.5) * 0.5,
          life: 0.45, size: 0.10, sizeEnd: 0.45,
          color: [1.0, 0.62, 0.28], alpha: 0.5, glow: 2.4, drag: 3.2, gravity: 0.8,
        });
      },
      muzzle(x, y, z, dx, dy, dz) {
        spawn({
          x, y, z, vx: dx * 3, vy: dy * 3, vz: dz * 3,
          life: 0.075, size: 0.30, sizeEnd: 0.16,
          color: [1.0, 0.78, 0.42], alpha: 0.9, glow: 9.0, drag: 6, gravity: 0,
        });
        for (let i = 0; i < 4; i++) {
          spawn({
            x, y, z,
            vx: dx * 9 + (Math.random() - 0.5) * 4,
            vy: dy * 9 + (Math.random() - 0.5) * 4,
            vz: dz * 9 + (Math.random() - 0.5) * 4,
            life: 0.16 + Math.random() * 0.15, size: 0.035, sizeEnd: 0.012,
            color: [1.0, 0.66, 0.28], alpha: 0.95, glow: 6.0, drag: 2.4, gravity: -5,
          });
        }
      },
      impact(x, y, z, nx, ny, nz, heavy) {
        const n = heavy ? 16 : 7;
        for (let i = 0; i < n; i++) {
          spawn({
            x, y, z,
            vx: nx * 3 + (Math.random() - 0.5) * 7,
            vy: ny * 3 + Math.random() * 5,
            vz: nz * 3 + (Math.random() - 0.5) * 7,
            life: 0.28 + Math.random() * 0.45, size: 0.045, sizeEnd: 0.015,
            color: [1.0, 0.72, 0.34], alpha: 0.95, glow: 5.0, drag: 1.4, gravity: -9,
          });
        }
        for (let i = 0; i < (heavy ? 10 : 4); i++) {
          spawn({
            x, y, z,
            vx: nx * 1.5 + (Math.random() - 0.5) * 2.4,
            vy: ny * 1.5 + Math.random() * 1.6,
            vz: nz * 1.5 + (Math.random() - 0.5) * 2.4,
            life: 0.7 + Math.random() * 0.8, size: 0.12, sizeEnd: 0.75,
            color: [0.34, 0.30, 0.27], alpha: 0.42, drag: 2.0, gravity: -0.6,
          });
        }
      },
      titanStep(x, y, z, intensity) {
        const n = 14 + (intensity * 22) | 0;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 2.5 + Math.random() * 7 * intensity;
          spawn({
            x: x + Math.cos(a) * 2.2, y: y + 0.2, z: z + Math.sin(a) * 2.2,
            vx: Math.cos(a) * sp, vy: 0.8 + Math.random() * 2.4, vz: Math.sin(a) * sp,
            life: 1.8 + Math.random() * 2.0, size: 0.6, sizeEnd: 5.5,
            color: [0.58, 0.42, 0.26], alpha: 0.30, drag: 1.1, gravity: -0.5,
          });
        }
      },
      ember(x, y, z) {
        spawn({
          x: x + (Math.random() - 0.5) * 0.4, y, z: z + (Math.random() - 0.5) * 0.4,
          vx: (Math.random() - 0.5) * 0.4, vy: 1.1 + Math.random() * 1.4,
          vz: (Math.random() - 0.5) * 0.4,
          life: 1.4 + Math.random() * 1.4, size: 0.035, sizeEnd: 0.012,
          color: [1.0, 0.52, 0.16], alpha: 0.95, glow: 4.5, drag: 0.8, gravity: 0.55,
        });
      },
      // Polvo ambiental arrastrado por el viento: es lo que llena el aire
      // durante la tormenta y da profundidad al espacio vacío.
      ambientDust(cx, cy, cz, storm) {
        const a = Math.random() * Math.PI * 2;
        const r = 6 + Math.random() * 34;
        spawn({
          x: cx + Math.cos(a) * r, y: cy - 1 + Math.random() * 9, z: cz + Math.sin(a) * r,
          vx: 4 + storm * 22 + Math.random() * 3, vy: (Math.random() - 0.4) * 0.6,
          vz: 1.5 + storm * 8 + Math.random() * 2,
          life: 1.6 + Math.random() * 1.8,
          size: 0.10 + Math.random() * 0.5 + storm * 0.9,
          sizeEnd: 0.6 + storm * 2.6,
          color: [0.66, 0.50, 0.32], alpha: 0.05 + storm * 0.16,
          drag: 0.25, gravity: -0.15, spin: 0.5,
        });
      },
      absorb(x, y, z) {
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 7;
        spawn({
          x: x + Math.cos(a) * r, y: y + (Math.random() - 0.5) * 6, z: z + Math.sin(a) * r,
          vx: -Math.cos(a) * 5, vy: 0.5, vz: -Math.sin(a) * 5,
          life: 1.1, size: 0.12, sizeEnd: 0.03,
          color: [1.0, 0.72, 0.30], alpha: 0.9, glow: 5.5, drag: 0.3, gravity: 0.4,
        });
      },
    };

    return {
      spawn, update, draw, emit: E,
      get count() { return count; },
      get capacity() { return MAX; },
    };
  }

  EV.Particles = { create, MAX };
})(window.EV = window.EV || {});
