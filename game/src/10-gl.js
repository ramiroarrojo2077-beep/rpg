// Ecos del Vacío — capa fina sobre WebGL2: programas, buffers, framebuffers.
(function (EV) {
  'use strict';

  let gl = null;
  const caps = {};

  function init(canvas) {
    gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,          // resolvemos con TAA, no con MSAA
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true, // necesario para capturas de verificación
      desynchronized: false,
    });
    if (!gl) throw new Error('WebGL2 no disponible en este navegador.');

    caps.colorBufferFloat = !!gl.getExtension('EXT_color_buffer_float');
    caps.floatLinear = !!gl.getExtension('OES_texture_float_linear');
    caps.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    caps.maxAniso = caps.aniso ? gl.getParameter(caps.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1;
    caps.maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    caps.renderer = (() => {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'desconocido';
    })();

    EV.gl = gl;
    return gl;
  }

  // ---------------------------------------------------------------- programas

  function compile(type, src, label) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      const numbered = src.split('\n').map((l, i) => `${String(i + 1).padStart(4)}| ${l}`).join('\n');
      throw new Error(`Error compilando ${label}:\n${log}\n\n${numbered}`);
    }
    return sh;
  }

  // Resuelve #include <chunk> contra EV.Shaders.chunks (una pasada, sin anidar ciclos).
  function resolve(src) {
    const chunks = (EV.Shaders && EV.Shaders.chunks) || {};
    let out = src;
    for (let depth = 0; depth < 8; depth++) {
      let touched = false;
      out = out.replace(/^[ \t]*#include[ \t]+<([\w.-]+)>[ \t]*$/gm, (m, name) => {
        touched = true;
        if (!(name in chunks)) throw new Error(`#include desconocido: <${name}>`);
        return chunks[name];
      });
      if (!touched) break;
    }
    return out;
  }

  function program(vsSrc, fsSrc, label = 'programa', defines = null) {
    let header = '#version 300 es\n';
    if (defines) for (const k in defines) header += `#define ${k} ${defines[k]}\n`;
    const vs = compile(gl.VERTEX_SHADER, header + resolve(vsSrc), `${label}.vert`);
    const fs = compile(gl.FRAGMENT_SHADER, header + resolve(fsSrc), `${label}.frag`);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`Error enlazando ${label}: ${gl.getProgramInfoLog(p)}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    // Cachea ubicaciones de uniformes para evitar getUniformLocation por frame.
    const u = Object.create(null);
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(p, name);
    }
    return { prog: p, u, label };
  }

  // Setters de uniforme tolerantes: si el uniforme fue optimizado, no hace nada.
  const U = {
    i: (P, n, v) => { const l = P.u[n]; if (l) gl.uniform1i(l, v); },
    f: (P, n, v) => { const l = P.u[n]; if (l) gl.uniform1f(l, v); },
    v2: (P, n, x, y) => { const l = P.u[n]; if (l) gl.uniform2f(l, x, y); },
    v3: (P, n, v) => { const l = P.u[n]; if (l) gl.uniform3f(l, v[0], v[1], v[2]); },
    v3f: (P, n, x, y, z) => { const l = P.u[n]; if (l) gl.uniform3f(l, x, y, z); },
    v4: (P, n, x, y, z, w) => { const l = P.u[n]; if (l) gl.uniform4f(l, x, y, z, w); },
    m4: (P, n, m) => { const l = P.u[n]; if (l) gl.uniformMatrix4fv(l, false, m); },
    m4v: (P, n, m) => { const l = P.u[n]; if (l) gl.uniformMatrix4fv(l, false, m); },
    fv: (P, n, a) => { const l = P.u[n]; if (l) gl.uniform1fv(l, a); },
    v3v: (P, n, a) => { const l = P.u[n]; if (l) gl.uniform3fv(l, a); },
    tex: (P, n, unit, texture, target) => {
      const l = P.u[n];
      if (!l) return;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(target || gl.TEXTURE_2D, texture);
      gl.uniform1i(l, unit);
    },
  };

  // ----------------------------------------------------------------- texturas

  function texture2D(opts) {
    const {
      width, height,
      internalFormat = gl.RGBA8, format = gl.RGBA, type = gl.UNSIGNED_BYTE,
      min = gl.LINEAR, mag = gl.LINEAR,
      wrap = gl.CLAMP_TO_EDGE, data = null, mips = false, aniso = 0,
    } = opts;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    if (aniso && caps.aniso) {
      gl.texParameterf(gl.TEXTURE_2D, caps.aniso.TEXTURE_MAX_ANISOTROPY_EXT,
        Math.min(aniso, caps.maxAniso));
    }
    if (mips) gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return t;
  }

  function textureArray(opts) {
    const {
      width, height, layers,
      internalFormat = gl.DEPTH_COMPONENT32F,
      min = gl.LINEAR, mag = gl.LINEAR, compare = false,
    } = opts;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, internalFormat, width, height, layers);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, min);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, mag);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (compare) {
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    }
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    return t;
  }

  function textureCube(size, internalFormat, format, type, mips) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, t);
    const levels = mips ? Math.floor(Math.log2(size)) + 1 : 1;
    gl.texStorage2D(gl.TEXTURE_CUBE_MAP, levels, internalFormat, size, size);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER,
      mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
    return t;
  }

  // ------------------------------------------------------------ framebuffers

  // colors: [{internalFormat, format, type, min, mag}], depth: 'texture'|'renderbuffer'|null
  function framebuffer(width, height, colors, depth) {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const attachments = [];
    const textures = (colors || []).map((c, i) => {
      const t = texture2D({ width, height, ...c });
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
      attachments.push(gl.COLOR_ATTACHMENT0 + i);
      return t;
    });
    let depthTex = null, depthRb = null;
    if (depth === 'texture') {
      depthTex = texture2D({
        width, height,
        internalFormat: gl.DEPTH_COMPONENT32F, format: gl.DEPTH_COMPONENT, type: gl.FLOAT,
        min: gl.NEAREST, mag: gl.NEAREST,
      });
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
    } else if (depth === 'renderbuffer') {
      depthRb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);
    }
    if (attachments.length > 1) gl.drawBuffers(attachments);
    else if (attachments.length === 0) { gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); }

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Framebuffer incompleto (0x${status.toString(16)}) ${width}x${height}`);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, textures, tex: textures[0], depthTex, depthRb, width, height };
  }

  // -------------------------------------------------------------- geometría

  function buffer(target, data, usage) {
    const b = gl.createBuffer();
    gl.bindBuffer(target, b);
    gl.bufferData(target, data, usage || gl.STATIC_DRAW);
    gl.bindBuffer(target, null);
    return b;
  }

  // attribs: [{loc, size, type, stride, offset, divisor, buffer, normalized}]
  function vao(attribs, indexBuffer) {
    const a = gl.createVertexArray();
    gl.bindVertexArray(a);
    for (const at of attribs) {
      gl.bindBuffer(gl.ARRAY_BUFFER, at.buffer);
      gl.enableVertexAttribArray(at.loc);
      if (at.integer) {
        gl.vertexAttribIPointer(at.loc, at.size, at.type || gl.INT, at.stride || 0, at.offset || 0);
      } else {
        gl.vertexAttribPointer(at.loc, at.size, at.type || gl.FLOAT,
          !!at.normalized, at.stride || 0, at.offset || 0);
      }
      if (at.divisor) gl.vertexAttribDivisor(at.loc, at.divisor);
    }
    if (indexBuffer) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return a;
  }

  // Triángulo de pantalla completa (más eficiente que un quad: sin costura diagonal).
  let _fsVao = null;
  function fullscreen() {
    if (!_fsVao) {
      const b = buffer(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]));
      _fsVao = vao([{ loc: 0, size: 2, buffer: b }]);
    }
    gl.bindVertexArray(_fsVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function bindFB(target, width, height) {
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
      gl.viewport(0, 0, target.width, target.height);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
    }
  }

  EV.GL = {
    init, program, U, texture2D, textureArray, textureCube, framebuffer,
    buffer, vao, fullscreen, bindFB, caps,
    get ctx() { return gl; },
  };
})(window.EV = window.EV || {});
