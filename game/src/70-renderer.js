// Ecos del Vacío — orquestación del frame.
//
// Orden de pases:
//   1. sombras en cascada (3 niveles, ajuste esférico + snap a téxel)
//   2. prepase: normal + rugosidad + velocidad + profundidad
//   3. SSAO a media resolución + desenfoque bilateral
//   4. opaco hacia adelante (cielo, terreno, props, nodos) con IBL del cielo
//   5. volumétricos a media resolución + recomposición guiada por profundidad
//   6. bloom (cadena de mips con filtro de 13 taps y reconstrucción tienda)
//   7. TAA (reproyección con dilatación de velocidad y acotado por varianza)
//   8. cadena de cámara: lente, ACES, gradación, grano, viñeta
(function (EV) {
  'use strict';

  const CASCADES = 3;
  const SHADOW_DISTANCE = 620.0;
  const BLOOM_MIPS = 6;

  // Presets de calidad. Todo lo que cuesta milisegundos es un define de shader,
  // así que bajar calidad recompila más barato en vez de ramificar en runtime.
  const MAX_LIGHTS = 8;
  const PRESETS = {
    ultra:  { shadowRes: 2048, shadowTaps: 12, ssaoSamples: 16, volSteps: 32, aoScale: 2, contact: 1 },
    alto:   { shadowRes: 2048, shadowTaps: 12, ssaoSamples: 12, volSteps: 24, aoScale: 2, contact: 1 },
    medio:  { shadowRes: 1024, shadowTaps:  8, ssaoSamples:  8, volSteps: 16, aoScale: 2, contact: 1 },
    bajo:   { shadowRes:  768, shadowTaps:  4, ssaoSamples:  6, volSteps: 10, aoScale: 4, contact: 0 },
    minimo: { shadowRes:  512, shadowTaps:  1, ssaoSamples:  4, volSteps:  6, aoScale: 4, contact: 0 },
  };

  // Secuencia de Halton para el jitter subpíxel del TAA.
  function halton(index, base) {
    let f = 1, r = 0, i = index;
    while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); }
    return r;
  }
  const JITTER = [];
  for (let i = 1; i <= 16; i++) JITTER.push([halton(i, 2) - 0.5, halton(i, 3) - 0.5]);

  const DEPTH_HALF_FS = /* glsl */`
#include <common>
in vec2 vUV;
uniform sampler2D uDepth;
uniform vec2 uTexel;
layout(location=0) out vec4 oDepth;
void main(){
  // Toma el más cercano de los 4: conserva las siluetas al bajar resolución.
  float a = texture(uDepth, vUV + vec2(-0.5,-0.5)*uTexel).r;
  float b = texture(uDepth, vUV + vec2( 0.5,-0.5)*uTexel).r;
  float c = texture(uDepth, vUV + vec2(-0.5, 0.5)*uTexel).r;
  float d = texture(uDepth, vUV + vec2( 0.5, 0.5)*uTexel).r;
  oDepth = vec4(min(min(a,b), min(c,d)), 0.0, 0.0, 1.0);
}`;

  function create(canvas, qualityName) {
    const Q = PRESETS[qualityName] || PRESETS.alto;
    const SHADOW_RES = Q.shadowRes;
    const gl = EV.GL.init(canvas);
    const G = EV.GL;
    const U = G.U;
    const GS = EV.GeoShaders;
    const PS = EV.PostShaders;

    // ------------------------------------------------------------- programas
    // Los defines de costo viajan a todos los programas que los usan.
    const COST = {
      SHADOW_TAPS: Q.shadowTaps,
      SSAO_SAMPLES: Q.ssaoSamples,
      VOL_STEPS: Q.volSteps,
      MAX_LIGHTS: MAX_LIGHTS,
    };
    const mk = (vs, fs, label, def) => G.program(vs, fs, label, Object.assign({}, COST, def || {}));
    const prog = {
      shadowTerrain: mk(GS.GEO_VS, GS.SHADOW_FS, 'shadow.terrain', { TERRAIN: 1 }),
      shadowInst: mk(GS.GEO_VS, GS.SHADOW_FS, 'shadow.inst', { INSTANCED: 1 }),
      shadowNode: mk(GS.GEO_VS, GS.SHADOW_FS, 'shadow.node', { NODE: 1 }),

      prepassTerrain: mk(GS.GEO_VS, GS.PREPASS_FS, 'prepass.terrain', { TERRAIN: 1 }),
      prepassInst: mk(GS.GEO_VS, GS.PREPASS_FS, 'prepass.inst', { INSTANCED: 1 }),
      prepassNode: mk(GS.GEO_VS, GS.PREPASS_FS, 'prepass.node', { NODE: 1 }),

      mainTerrain: mk(GS.GEO_VS, GS.MAIN_FS, 'main.terrain', { TERRAIN: 1 }),
      mainInst: mk(GS.GEO_VS, GS.MAIN_FS, 'main.inst', { INSTANCED: 1 }),
      mainNode: mk(GS.GEO_VS, GS.MAIN_FS, 'main.node', { NODE: 1 }),

      shadowSkinned: mk(GS.GEO_VS, GS.SHADOW_FS, 'shadow.skinned', { SKINNED: 1 }),
      prepassSkinned: mk(GS.GEO_VS, GS.PREPASS_FS, 'prepass.skinned', { SKINNED: 1 }),
      mainSkinned: mk(GS.GEO_VS, GS.MAIN_FS, 'main.skinned', { SKINNED: 1 }),

      skybox: mk(GS.SKYBOX_VS, GS.SKYBOX_FS, 'skybox'),
      ssao: mk(PS.FS_VS, PS.SSAO_FS, 'ssao'),
      blur: mk(PS.FS_VS, PS.BLUR_FS, 'blur'),
      depthHalf: mk(PS.FS_VS, DEPTH_HALF_FS, 'depthHalf'),
      volumetric: mk(PS.FS_VS, PS.VOLUMETRIC_FS, 'volumetric'),
      volUpsample: mk(PS.FS_VS, PS.VOL_UPSAMPLE_FS, 'volUpsample'),
      bloomPre: mk(PS.FS_VS, PS.BLOOM_PREFILTER_FS, 'bloomPrefilter'),
      down: mk(PS.FS_VS, PS.DOWNSAMPLE_FS, 'downsample'),
      up: mk(PS.FS_VS, PS.UPSAMPLE_FS, 'upsample'),
      taa: mk(PS.FS_VS, PS.TAA_FS, 'taa'),
      composite: mk(PS.FS_VS, PS.COMPOSITE_FS, 'composite'),
    };

    // ------------------------------------------------------------- recursos
    const shadowTex = G.textureArray({
      width: SHADOW_RES, height: SHADOW_RES, layers: CASCADES,
      internalFormat: gl.DEPTH_COMPONENT32F,
      min: gl.LINEAR, mag: gl.LINEAR, compare: true,
    });
    const shadowFB = gl.createFramebuffer();

    let fb = {};   // framebuffers dependientes de resolución
    let W = 1, H = 1, halfW = 1, halfH = 1;

    function releaseTargets() {
      for (const k in fb) {
        const t = fb[k];
        if (!t) continue;
        if (Array.isArray(t)) { t.forEach(x => x && x.fb && gl.deleteFramebuffer(x.fb)); continue; }
        if (t.fb) gl.deleteFramebuffer(t.fb);
        if (t.textures) t.textures.forEach(x => gl.deleteTexture(x));
        if (t.depthTex) gl.deleteTexture(t.depthTex);
      }
      fb = {};
    }

    function resize(width, height) {
      W = Math.max(2, width | 0);
      H = Math.max(2, height | 0);
      halfW = Math.max(1, Math.floor(W / Q.aoScale));
      halfH = Math.max(1, Math.floor(H / Q.aoScale));
      releaseTargets();

      const F16 = { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT };
      const RG16 = { internalFormat: gl.RG16F, format: gl.RG, type: gl.HALF_FLOAT };
      const R16 = { internalFormat: gl.R16F, format: gl.RED, type: gl.HALF_FLOAT };
      const R32 = { internalFormat: gl.R32F, format: gl.RED, type: gl.FLOAT };

      fb.prepass = G.framebuffer(W, H, [F16, RG16], 'texture');

      // El pase opaco comparte la profundidad del prepase (early-Z exacto).
      fb.scene = (() => {
        const f = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        const tex = G.texture2D({ width: W, height: H, ...F16 });
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D,
          fb.prepass.depthTex, 0);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
        const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error('FBO escena incompleto: ' + st.toString(16));
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { fb: f, tex, textures: [tex], width: W, height: H };
      })();

      fb.ao = G.framebuffer(halfW, halfH, [R16], null);
      fb.aoBlur = G.framebuffer(halfW, halfH, [R16], null);
      fb.depthHalf = G.framebuffer(halfW, halfH, [R32], null);
      fb.volume = G.framebuffer(halfW, halfH, [F16], null);
      fb.composed = G.framebuffer(W, H, [F16], null);
      fb.taa = [G.framebuffer(W, H, [F16], null), G.framebuffer(W, H, [F16], null)];

      fb.bloom = [];
      let bw = W >> 1, bh = H >> 1;
      for (let i = 0; i < BLOOM_MIPS; i++) {
        fb.bloom.push(G.framebuffer(Math.max(1, bw), Math.max(1, bh), [F16], null));
        bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
      }
      fb.bloomUp = [];
      bw = W >> 1; bh = H >> 1;
      for (let i = 0; i < BLOOM_MIPS; i++) {
        fb.bloomUp.push(G.framebuffer(Math.max(1, bw), Math.max(1, bh), [F16], null));
        bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
      }
    }

    // ------------------------------------------------------------- matrices
    const view = EV.M4.create();
    const proj = EV.M4.create();
    const projNoJit = EV.M4.create();
    const viewProj = EV.M4.create();
    const viewProjNoJit = EV.M4.create();
    const prevViewProjNoJit = EV.M4.create();
    const invViewProj = EV.M4.create();
    const invProj = EV.M4.create();
    const shadowMats = [EV.M4.create(), EV.M4.create(), EV.M4.create()];
    const shadowMatData = new Float32Array(16 * CASCADES);
    const cascadeSplits = new Float32Array(4);
    const _tmpM = EV.M4.create();
    const _v = EV.V3.create();
    const _center = EV.V3.create();
    const _eye = EV.V3.create();
    const UP = EV.V3.create(0, 1, 0);
    const camRight = EV.V3.create(1, 0, 0);
    const camUp = EV.V3.create(0, 1, 0);
    const ALT_UP = EV.V3.create(0, 0, 1);

    // Luces puntuales empaquetadas para subir de una sola vez.
    const lightPos = new Float32Array(MAX_LIGHTS * 4);
    const lightColor = new Float32Array(MAX_LIGHTS * 4);
    let lightCount = 0;

    function packLights(lights) {
      lightCount = 0;
      if (!lights) return;
      for (const l of lights) {
        if (lightCount >= MAX_LIGHTS) break;
        if (!l || l.intensity <= 0) continue;
        const o = lightCount * 4;
        lightPos[o] = l.pos[0]; lightPos[o + 1] = l.pos[1]; lightPos[o + 2] = l.pos[2];
        lightPos[o + 3] = l.radius;
        lightColor[o] = l.color[0]; lightColor[o + 1] = l.color[1]; lightColor[o + 2] = l.color[2];
        lightColor[o + 3] = l.intensity;
        lightCount++;
      }
    }

    let frame = 0;
    let historyIndex = 0;
    let needsHistoryReset = true;

    // Ajuste de cascada por esfera envolvente: estable ante rotación de cámara,
    // y con snap a téxel para eliminar el hormigueo del borde de sombra.
    function fitCascades(cam, sunDir) {
      const tanHalf = Math.tan(cam.fov * 0.5);
      const aspect = W / H;
      const splits = [0.055, 0.20, 1.0];
      let prevSplit = cam.near / SHADOW_DISTANCE;

      for (let c = 0; c < CASCADES; c++) {
        const nd = SHADOW_DISTANCE * prevSplit;
        const fd = SHADOW_DISTANCE * splits[c];
        prevSplit = splits[c];
        cascadeSplits[c] = fd;

        // Centro y radio de la esfera que envuelve el sub-frustum.
        const nh = tanHalf * nd, nw = nh * aspect;
        const fh = tanHalf * fd, fw = fh * aspect;
        // Centro sobre el eje de vista que equidista de ambos anillos.
        const midZ = (nd + fd) * 0.5 +
          (nh * nh + nw * nw - fh * fh - fw * fw) / (2.0 * (fd - nd) + 1e-6) * 0.5;
        const cz = EV.MathUtil.clamp(midZ, nd, fd);
        EV.V3.addScaled(_center, cam.pos, cam.dir, cz);
        const rNear = Math.hypot(nw, nh, nd - cz);
        const rFar = Math.hypot(fw, fh, fd - cz);
        let radius = Math.max(rNear, rFar) * 1.02;
        radius = Math.ceil(radius * 4.0) / 4.0;   // cuantiza para que no lata

        const texelSize = (radius * 2.0) / SHADOW_RES;
        const up = Math.abs(sunDir[1]) > 0.98 ? ALT_UP : UP;

        // Vista de luz provisional para snappear el centro a la grilla de téxeles.
        EV.V3.addScaled(_eye, _center, sunDir, radius + 260.0);
        EV.M4.lookAt(_tmpM, _eye, _center, up);
        const cx = _tmpM[0] * _center[0] + _tmpM[4] * _center[1] + _tmpM[8] * _center[2] + _tmpM[12];
        const cy = _tmpM[1] * _center[0] + _tmpM[5] * _center[1] + _tmpM[9] * _center[2] + _tmpM[13];
        const sx = Math.round(cx / texelSize) * texelSize - cx;
        const sy = Math.round(cy / texelSize) * texelSize - cy;

        const lp = EV.M4.create();
        EV.M4.ortho(lp, -radius + sx, radius + sx, -radius + sy, radius + sy,
          0.0, radius * 2.0 + 520.0);
        EV.M4.multiply(shadowMats[c], lp, _tmpM);
        shadowMatData.set(shadowMats[c], c * 16);
      }
      // w = tamaño mundial de un téxel en la cascada 0 (para el normal offset).
      cascadeSplits[3] = (cascadeSplits[0] * 2.0) / SHADOW_RES * 1.4;
    }

    // --------------------------------------------------------- ayuda de dibujo
    function drawNodes(P, roots, withMaterial) {
      const nrm = _tmpM;
      for (const root of roots) {
        EV.Geo.traverse(root, (n) => {
          U.m4(P, 'uModel', n.world);
          U.m4(P, 'uPrevModel', n.prevWorld);
          EV.M4.normalMatrix(nrm, n.world);
          U.m4(P, 'uNormalMat', nrm);
          if (withMaterial) {
            const m = n.material;
            U.v3f(P, 'uAlbedo', m.albedo[0], m.albedo[1], m.albedo[2]);
            U.f(P, 'uRough', m.rough);
            U.f(P, 'uMetal', m.metal);
            U.v3f(P, 'uEmissive', m.emissive[0], m.emissive[1], m.emissive[2]);
            U.f(P, 'uDamage', m.damage || 0);
          }
          n.mesh.draw();
        });
      }
    }

    // Cada personaje es una llamada de dibujo: su textura de huesos y su
    // paleta son lo único que cambia entre uno y otro.
    function drawCharacters(P, characters, withMaterial) {
      if (!characters) return;
      for (const c of characters) {
        if (!c.visible) continue;
        U.tex(P, 'uBoneTex', 6, c.skin.boneTex);
        U.tex(P, 'uPrevBoneTex', 7, c.skin.prevBoneTex);
        if (withMaterial) {
          const pal = c.palette;
          U.v3f(P, 'uSuitColor', pal.suit[0], pal.suit[1], pal.suit[2]);
          U.v3f(P, 'uArmorColor', pal.armor[0], pal.armor[1], pal.armor[2]);
          U.v3f(P, 'uAccentColor', pal.accent[0], pal.accent[1], pal.accent[2]);
          U.f(P, 'uWear', c.wear === undefined ? 0.45 : c.wear);
          U.f(P, 'uEmissivePulse', c.pulse === undefined ? 1 : c.pulse);
        }
        c.mesh.draw();
      }
    }

    function setGeoCommon(P, scene) {
      U.m4(P, 'uViewProj', viewProj);
      U.m4(P, 'uViewProjNoJit', viewProjNoJit);
      U.m4(P, 'uPrevViewProjNoJit', prevViewProjNoJit);
      U.f(P, 'uTime', scene.time);
      U.v3(P, 'uCamPos', scene.camera.pos);
    }

    // ------------------------------------------------------------------ frame
    function render(scene) {
      const cam = scene.camera;
      const sky = scene.sky;
      frame++;

      // --- matrices de cámara (jitter sólo en la proyección de dibujo)
      EV.V3.add(_v, cam.pos, cam.dir);
      EV.M4.lookAt(view, cam.pos, _v, UP);
      EV.M4.perspective(projNoJit, cam.fov, W / H, cam.near, cam.far);
      EV.M4.copy(proj, projNoJit);
      if (scene.taaEnabled !== false) {
        const j = JITTER[frame % JITTER.length];
        proj[8] += (j[0] * 2.0) / W;
        proj[9] += (j[1] * 2.0) / H;
      }
      EV.M4.copy(prevViewProjNoJit, viewProjNoJit);
      EV.M4.multiply(viewProj, proj, view);
      EV.M4.multiply(viewProjNoJit, projNoJit, view);
      EV.M4.invert(invViewProj, viewProj);
      EV.M4.invert(invProj, projNoJit);
      if (needsHistoryReset) EV.M4.copy(prevViewProjNoJit, viewProjNoJit);

      // Ejes de pantalla, para orientar los billboards de partículas.
      camRight[0] = view[0]; camRight[1] = view[4]; camRight[2] = view[8];
      camUp[0] = view[1]; camUp[1] = view[5]; camUp[2] = view[9];

      packLights(scene.lights);
      sky.update(cam.pos[1]);
      fitCascades(cam, sky.sunDir);

      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.depthFunc(gl.LESS);
      gl.disable(gl.BLEND);

      // ---------------------------------------------------------- 1. sombras
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFB);
      gl.viewport(0, 0, SHADOW_RES, SHADOW_RES);
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      // Culling frontal en el pase de sombra: aleja el acne de las caras vistas.
      gl.cullFace(gl.FRONT);
      for (let c = 0; c < CASCADES; c++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, shadowTex, 0, c);
        gl.clear(gl.DEPTH_BUFFER_BIT);

        const setShadow = (P) => {
          gl.useProgram(P.prog);
          U.m4(P, 'uViewProj', shadowMats[c]);
          U.m4(P, 'uViewProjNoJit', shadowMats[c]);
          U.m4(P, 'uPrevViewProjNoJit', shadowMats[c]);
        };
        setShadow(prog.shadowTerrain);
        scene.terrain.draw();
        setShadow(prog.shadowInst);
        U.i(prog.shadowInst, 'uPropType', 0);
        scene.props.draw();
        setShadow(prog.shadowNode);
        drawNodes(prog.shadowNode, scene.nodes, false);
        setShadow(prog.shadowSkinned);
        drawCharacters(prog.shadowSkinned, scene.characters, false);
      }
      gl.cullFace(gl.BACK);

      // ---------------------------------------------------------- 2. prepase
      G.bindFB(fb.prepass);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.clearColor(0.5, 0.5, 1.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.depthFunc(gl.LESS);
      gl.depthMask(true);

      gl.useProgram(prog.prepassTerrain.prog);
      setGeoCommon(prog.prepassTerrain, scene);
      scene.terrain.draw();
      scene.terrain.drawFar();

      gl.useProgram(prog.prepassInst.prog);
      setGeoCommon(prog.prepassInst, scene);
      U.i(prog.prepassInst, 'uPropType', 0);
      scene.props.draw('crystal');
      U.i(prog.prepassInst, 'uPropType', 1);
      scene.props.draw('debris');
      U.i(prog.prepassInst, 'uPropType', 2);
      scene.props.draw('rock');

      gl.useProgram(prog.prepassNode.prog);
      setGeoCommon(prog.prepassNode, scene);
      drawNodes(prog.prepassNode, scene.nodes, true);

      gl.useProgram(prog.prepassSkinned.prog);
      setGeoCommon(prog.prepassSkinned, scene);
      drawCharacters(prog.prepassSkinned, scene.characters, true);

      // ------------------------------------------------------------- 3. SSAO
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);

      G.bindFB(fb.ao);
      gl.useProgram(prog.ssao.prog);
      U.tex(prog.ssao, 'uDepth', 0, fb.prepass.depthTex);
      U.tex(prog.ssao, 'uNormalRough', 1, fb.prepass.textures[0]);
      U.m4(prog.ssao, 'uProj', projNoJit);
      U.m4(prog.ssao, 'uInvProj', invProj);
      U.m4(prog.ssao, 'uView', view);
      U.v2(prog.ssao, 'uResolution', halfW, halfH);
      U.f(prog.ssao, 'uRadius', scene.aoRadius || 0.9);
      U.f(prog.ssao, 'uIntensity', scene.aoIntensity || 0.92);
      U.f(prog.ssao, 'uNear', cam.near);
      U.f(prog.ssao, 'uFar', cam.far);
      U.f(prog.ssao, 'uFrame', frame % 64);
      G.fullscreen();

      // profundidad a media resolución (guía del desenfoque y del volumétrico)
      G.bindFB(fb.depthHalf);
      gl.useProgram(prog.depthHalf.prog);
      U.tex(prog.depthHalf, 'uDepth', 0, fb.prepass.depthTex);
      U.v2(prog.depthHalf, 'uTexel', 1 / W, 1 / H);
      G.fullscreen();

      for (const [src, dst, dx, dy] of [
        [fb.ao, fb.aoBlur, 1, 0],
        [fb.aoBlur, fb.ao, 0, 1],
      ]) {
        G.bindFB(dst);
        gl.useProgram(prog.blur.prog);
        U.tex(prog.blur, 'uTex', 0, src.tex);
        U.tex(prog.blur, 'uDepth', 1, fb.depthHalf.tex);
        U.v2(prog.blur, 'uDirection', dx, dy);
        U.v2(prog.blur, 'uTexel', 1 / halfW, 1 / halfH);
        G.fullscreen();
      }

      // ------------------------------------------------------------- 4. opaco
      G.bindFB(fb.scene);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.depthFunc(gl.LEQUAL);

      // cielo primero: sólo pasa donde la profundidad quedó en el plano lejano
      gl.useProgram(prog.skybox.prog);
      sky.applyAtmoUniforms(prog.skybox);
      U.m4(prog.skybox, 'uInvViewProj', invViewProj);
      U.tex(prog.skybox, 'uSkyCube', 0, sky.skyCube, gl.TEXTURE_CUBE_MAP);
      U.f(prog.skybox, 'uExposureComp', 1.0);
      G.fullscreen();

      const bindLighting = (P) => {
        sky.applyAtmoUniforms(P);
        setGeoCommon(P, scene);
        U.tex(P, 'uShadowMap', 0, shadowTex, gl.TEXTURE_2D_ARRAY);
        U.m4v(P, 'uShadowMat', shadowMatData);
        U.v4(P, 'uCascadeSplits', cascadeSplits[0], cascadeSplits[1],
          cascadeSplits[2], cascadeSplits[3]);
        U.f(P, 'uShadowTexel', 1.0 / SHADOW_RES);
        U.tex(P, 'uSkyCube', 1, sky.skyCube, gl.TEXTURE_CUBE_MAP);
        U.tex(P, 'uIrradiance', 2, sky.irrCube, gl.TEXTURE_CUBE_MAP);
        U.tex(P, 'uAO', 3, fb.ao.tex);
        U.f(P, 'uSkyMips', sky.mipCount);
        U.v2(P, 'uScreenSize', W, H);
        U.v3(P, 'uSunRadiance', sky.sunRadiance);
        U.f(P, 'uFogDensity', scene.fogDensity);
        U.f(P, 'uExposureComp', 1.0);
        // Sombra de contacto: marcha contra la profundidad de media resolución
        // (no contra la textura adjunta al FBO, que sería realimentación).
        U.tex(P, 'uDepthHalf', 4, fb.depthHalf.tex);
        U.m4(P, 'uViewProjNoJitFS', viewProjNoJit);
        U.m4(P, 'uInvViewProjFS', invViewProj);
        U.f(P, 'uContactShadow', Q.contact ? 1.0 : 0.0);
        U.i(P, 'uLightCount', lightCount);
        if (P.u.uLightPos) gl.uniform4fv(P.u.uLightPos, lightPos);
        if (P.u.uLightColor) gl.uniform4fv(P.u.uLightColor, lightColor);
      };

      gl.useProgram(prog.mainTerrain.prog);
      bindLighting(prog.mainTerrain);
      scene.terrain.draw();
      scene.terrain.drawFar();

      gl.useProgram(prog.mainInst.prog);
      bindLighting(prog.mainInst);
      U.i(prog.mainInst, 'uPropType', 0);
      scene.props.draw('crystal');
      U.i(prog.mainInst, 'uPropType', 1);
      scene.props.draw('debris');
      U.i(prog.mainInst, 'uPropType', 2);
      scene.props.draw('rock');

      gl.useProgram(prog.mainNode.prog);
      bindLighting(prog.mainNode);
      drawNodes(prog.mainNode, scene.nodes, true);

      gl.useProgram(prog.mainSkinned.prog);
      bindLighting(prog.mainSkinned);
      drawCharacters(prog.mainSkinned, scene.characters, true);

      // Partículas dentro del búfer de escena: así la niebla volumétrica y la
      // perspectiva aérea del pase siguiente también actúan sobre ellas.
      if (scene.particles) {
        scene.particles.draw({
          viewProj, camRight, camUp,
          depthTex: fb.depthHalf.tex,
          width: W, height: H,
          near: cam.near, far: cam.far,
          sunDir: sky.sunDir, sunRadiance: sky.sunRadiance,
        });
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(false);
      }

      // ------------------------------------------------------ 5. volumétricos
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);

      G.bindFB(fb.volume);
      gl.useProgram(prog.volumetric.prog);
      sky.applyAtmoUniforms(prog.volumetric);
      U.tex(prog.volumetric, 'uDepth', 0, fb.prepass.depthTex);
      U.tex(prog.volumetric, 'uShadowMap', 1, shadowTex, gl.TEXTURE_2D_ARRAY);
      U.m4v(prog.volumetric, 'uShadowMat', shadowMatData);
      U.v4(prog.volumetric, 'uCascadeSplits', cascadeSplits[0], cascadeSplits[1],
        cascadeSplits[2], cascadeSplits[3]);
      U.f(prog.volumetric, 'uShadowTexel', 1.0 / SHADOW_RES);
      U.m4(prog.volumetric, 'uInvViewProj', invViewProj);
      U.v3(prog.volumetric, 'uCamPos', cam.pos);
      U.v3(prog.volumetric, 'uSunRadiance', sky.sunRadiance);
      U.f(prog.volumetric, 'uTime', scene.time);
      U.f(prog.volumetric, 'uFogDensity', scene.volumetricDensity);
      U.f(prog.volumetric, 'uStorm', scene.storm);
      U.f(prog.volumetric, 'uFrame', frame % 64);
      U.f(prog.volumetric, 'uMaxDistance', SHADOW_DISTANCE);
      G.fullscreen();

      G.bindFB(fb.composed);
      gl.useProgram(prog.volUpsample.prog);
      U.tex(prog.volUpsample, 'uScene', 0, fb.scene.tex);
      U.tex(prog.volUpsample, 'uVolume', 1, fb.volume.tex);
      U.tex(prog.volUpsample, 'uDepth', 2, fb.prepass.depthTex);
      U.tex(prog.volUpsample, 'uDepthHalf', 3, fb.depthHalf.tex);
      U.v2(prog.volUpsample, 'uTexelHalf', 1 / halfW, 1 / halfH);
      G.fullscreen();

      // --------------------------------------------------------------- 6. TAA
      const cur = fb.taa[historyIndex];
      const hist = fb.taa[1 - historyIndex];
      G.bindFB(cur);
      gl.useProgram(prog.taa.prog);
      U.tex(prog.taa, 'uCurrent', 0, fb.composed.tex);
      U.tex(prog.taa, 'uHistory', 1, hist.tex);
      U.tex(prog.taa, 'uVelocity', 2, fb.prepass.textures[1]);
      U.tex(prog.taa, 'uDepth', 3, fb.prepass.depthTex);
      U.v2(prog.taa, 'uTexel', 1 / W, 1 / H);
      U.f(prog.taa, 'uBlend', scene.taaEnabled === false ? 1.0 : 0.09);
      U.f(prog.taa, 'uReset', needsHistoryReset ? 1.0 : 0.0);
      G.fullscreen();
      historyIndex = 1 - historyIndex;
      needsHistoryReset = false;

      // ------------------------------------------------------------- 7. bloom
      G.bindFB(fb.bloom[0]);
      gl.useProgram(prog.bloomPre.prog);
      U.tex(prog.bloomPre, 'uTex', 0, cur.tex);
      U.f(prog.bloomPre, 'uThreshold', scene.bloomThreshold);
      U.f(prog.bloomPre, 'uSoftKnee', 0.6);
      G.fullscreen();

      for (let i = 1; i < BLOOM_MIPS; i++) {
        G.bindFB(fb.bloom[i]);
        gl.useProgram(prog.down.prog);
        U.tex(prog.down, 'uTex', 0, fb.bloom[i - 1].tex);
        U.v2(prog.down, 'uTexel', 1 / fb.bloom[i - 1].width, 1 / fb.bloom[i - 1].height);
        G.fullscreen();
      }
      // reconstrucción ascendente acumulativa
      let prevUp = fb.bloom[BLOOM_MIPS - 1];
      for (let i = BLOOM_MIPS - 2; i >= 0; i--) {
        G.bindFB(fb.bloomUp[i]);
        gl.useProgram(prog.up.prog);
        U.tex(prog.up, 'uTex', 0, prevUp.tex);
        U.tex(prog.up, 'uPrev', 1, fb.bloom[i].tex);
        U.v2(prog.up, 'uTexel', 1 / fb.bloomUp[i].width, 1 / fb.bloomUp[i].height);
        U.f(prog.up, 'uRadius', 1.0);
        G.fullscreen();
        prevUp = fb.bloomUp[i];
      }

      // ------------------------------------------------- 8. cadena de cámara
      G.bindFB(null, W, H);
      gl.useProgram(prog.composite.prog);
      U.tex(prog.composite, 'uScene', 0, cur.tex);
      U.tex(prog.composite, 'uBloom', 1, prevUp.tex);
      U.f(prog.composite, 'uExposure', scene.exposure);
      U.f(prog.composite, 'uBloomStrength', scene.bloomStrength);
      U.f(prog.composite, 'uTime', scene.time);
      U.f(prog.composite, 'uVignette', scene.grade.vignette);
      U.f(prog.composite, 'uGrain', scene.grade.grain);
      U.f(prog.composite, 'uChromatic', scene.grade.chromatic);
      U.f(prog.composite, 'uDistortion', scene.grade.distortion);
      U.v3f(prog.composite, 'uLift', ...scene.grade.lift);
      U.v3f(prog.composite, 'uGamma', ...scene.grade.gamma);
      U.v3f(prog.composite, 'uGain', ...scene.grade.gain);
      U.f(prog.composite, 'uSaturation', scene.grade.saturation);
      U.f(prog.composite, 'uDamageFlash', scene.damageFlash || 0);
      U.f(prog.composite, 'uCorruption', scene.corruption || 0);
      U.v2(prog.composite, 'uResolution', W, H);
      G.fullscreen();

      gl.bindVertexArray(null);
    }

    function resetHistory() { needsHistoryReset = true; }

    return {
      resize, render, resetHistory,
      get width() { return W; },
      get height() { return H; },
      get info() {
        return {
          renderer: G.caps.renderer, shadowRes: SHADOW_RES, cascades: CASCADES,
          quality: qualityName || 'alto', preset: Q,
        };
      },
    };
  }

  EV.Renderer = { create, SHADOW_DISTANCE, PRESETS };
})(window.EV = window.EV || {});
