// Ecos del Vacío — cielo y ambiente.
// Una única simulación de dispersión alimenta: fondo, IBL especular (mips del
// cubemap) e irradiancia difusa (convolución coseno). Cambiar la hora del día
// cambia toda la iluminación de la escena, sin nada horneado.
(function (EV) {
  'use strict';

  const CUBE_SIZE = 256;
  const IRR_SIZE = 16;

  // Perfil atmosférico de Kether-3: más polvo que la Tierra, cielo ámbar.
  const PROFILE = {
    betaR: [7.4e-6, 11.8e-6, 22.1e-6],  // Rayleigh desplazado a ámbar
    betaM: [34.0e-6, 30.0e-6, 26.0e-6],  // Kether-3 es un planeta de polvo
    hR: 8200.0,
    hM: 1400.0,
    mieG: 0.70,
    // Capa de polvo en suspensión: visibilidad de ~26 km en calma. Es lo que
    // hace que el horizonte de Kether-3 sea una bruma ámbar y no un filo.
    betaD: [1.55e-4, 1.42e-4, 1.24e-4],
    hD: 420.0,
    dustG: 0.55,
    planetR: 6.10e6,
    atmoR: 6.16e6,
    groundAlbedo: [0.38, 0.24, 0.12],
    sunColor: [1.0, 0.92, 0.80],
    sunIntensity: 22.0,
  };

  const SKY_VS = /* glsl */`
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main(){
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

  const SKY_FS = /* glsl */`
#include <common>
#include <atmosphere>
in vec2 vUV;
uniform int   uFace;
uniform float uCamAltitude;
out vec4 fragColor;

vec3 faceDir(int face, vec2 uv){
  float u = uv.x * 2.0 - 1.0;
  float v = uv.y * 2.0 - 1.0;
  if(face == 0) return normalize(vec3( 1.0,  -v,  -u));
  if(face == 1) return normalize(vec3(-1.0,  -v,   u));
  if(face == 2) return normalize(vec3(   u, 1.0,   v));
  if(face == 3) return normalize(vec3(   u,-1.0,  -v));
  if(face == 4) return normalize(vec3(   u,  -v, 1.0));
  return normalize(vec3(-u, -v, -1.0));
}

void main(){
  vec3 rd = faceDir(uFace, vUV);
  vec3 ro = vec3(0.0, uPlanetR + uCamAltitude, 0.0);
  vec3 tr;
  vec3 col = skyRadiance(ro, rd, 1e7, tr);
  fragColor = vec4(col, 1.0);
}`;

  // Convolución coseno para irradiancia difusa.
  const IRR_FS = /* glsl */`
#include <common>
in vec2 vUV;
uniform samplerCube uSky;
uniform int uFace;
out vec4 fragColor;

vec3 faceDir(int face, vec2 uv){
  float u = uv.x * 2.0 - 1.0;
  float v = uv.y * 2.0 - 1.0;
  if(face == 0) return normalize(vec3( 1.0,  -v,  -u));
  if(face == 1) return normalize(vec3(-1.0,  -v,   u));
  if(face == 2) return normalize(vec3(   u, 1.0,   v));
  if(face == 3) return normalize(vec3(   u,-1.0,  -v));
  if(face == 4) return normalize(vec3(   u,  -v, 1.0));
  return normalize(vec3(-u, -v, -1.0));
}

void main(){
  vec3 N = faceDir(uFace, vUV);
  vec3 up = abs(N.y) < 0.99 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0);
  vec3 T = normalize(cross(up, N));
  vec3 B = cross(N, T);

  // Muestreo por secuencia de Hammersley proyectada al coseno.
  const int SAMPLES = 96;
  vec3 sum = vec3(0.0);
  for(int i=0;i<SAMPLES;i++){
    float fi = (float(i) + 0.5) / float(SAMPLES);
    // Van der Corput radical inverse
    uint bits = uint(i);
    bits = (bits << 16u) | (bits >> 16u);
    bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
    bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
    bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
    bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
    float u2 = float(bits) * 2.3283064365386963e-10;

    float phi = 2.0 * PI * fi;
    float cosTheta = sqrt(1.0 - u2);
    float sinTheta = sqrt(u2);
    vec3 L = T * (sinTheta * cos(phi)) + B * (sinTheta * sin(phi)) + N * cosTheta;
    sum += textureLod(uSky, L, 3.0).rgb;
  }
  fragColor = vec4(sum / float(SAMPLES), 1.0);
}`;

  function create() {
    const gl = EV.GL.ctx;
    const skyProg = EV.GL.program(SKY_VS, SKY_FS, 'sky');
    const irrProg = EV.GL.program(SKY_VS, IRR_FS, 'irradiance');

    const skyCube = EV.GL.textureCube(CUBE_SIZE, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, true);
    const irrCube = EV.GL.textureCube(IRR_SIZE, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, false);
    const fbo = gl.createFramebuffer();
    const mipCount = Math.floor(Math.log2(CUBE_SIZE)) + 1;

    const state = {
      sunDir: EV.V3.create(0.42, 0.36, -0.83),
      turbidity: 1.0,
      dirty: true,
      profile: PROFILE,
      skyCube, irrCube, mipCount,
      // Irradiancia y color solar en CPU, para que el gameplay pueda leerlos.
      ambient: EV.V3.create(0.05, 0.05, 0.06),
      sunRadiance: EV.V3.create(1, 1, 1),
    };

    EV.V3.normalize(state.sunDir, state.sunDir);

    function applyAtmoUniforms(P) {
      const p = state.profile;
      EV.GL.U.v3f(P, 'uBetaR', p.betaR[0], p.betaR[1], p.betaR[2]);
      EV.GL.U.v3f(P, 'uBetaM', p.betaM[0], p.betaM[1], p.betaM[2]);
      EV.GL.U.f(P, 'uHR', p.hR);
      EV.GL.U.f(P, 'uHM', p.hM);
      EV.GL.U.f(P, 'uMieG', p.mieG);
      EV.GL.U.f(P, 'uPlanetR', p.planetR);
      EV.GL.U.f(P, 'uAtmoR', p.atmoR);
      EV.GL.U.v3(P, 'uSunDir', state.sunDir);
      EV.GL.U.v3f(P, 'uSunColor', p.sunColor[0], p.sunColor[1], p.sunColor[2]);
      EV.GL.U.f(P, 'uSunIntensity', p.sunIntensity);
      EV.GL.U.f(P, 'uTurbidity', state.turbidity);
      EV.GL.U.v3f(P, 'uGroundAlbedo', p.groundAlbedo[0], p.groundAlbedo[1], p.groundAlbedo[2]);
      EV.GL.U.v3f(P, 'uBetaD', p.betaD[0], p.betaD[1], p.betaD[2]);
      EV.GL.U.f(P, 'uHD', p.hD);
      EV.GL.U.f(P, 'uDustG', p.dustG);
    }
    state.applyAtmoUniforms = applyAtmoUniforms;

    // Estima la radiancia solar en superficie (transmitancia) para el directo.
    function updateSunRadiance() {
      const p = state.profile;
      const cosZ = Math.max(state.sunDir[1], 0.0);
      // Longitud óptica aproximada con modelo de Kasten-Young.
      const zen = Math.acos(EV.MathUtil.clamp(cosZ, -1, 1)) * 180 / Math.PI;
      const am = 1.0 / (cosZ + 0.50572 * Math.pow(Math.max(96.07995 - zen, 0.1), -1.6364));
      const odR = p.hR * am;
      const odM = p.hM * am * state.turbidity;
      for (let i = 0; i < 3; i++) {
        const t = Math.exp(-(p.betaR[i] * odR + p.betaM[i] * odM));
        state.sunRadiance[i] = p.sunColor[i] * p.sunIntensity * t * Math.max(cosZ, 0.0);
      }
    }

    function renderCube(prog, target, size, extra) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, size, size);
      gl.useProgram(prog.prog);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.BLEND);
      for (let f = 0; f < 6; f++) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, target, 0);
        EV.GL.U.i(prog, 'uFace', f);
        if (extra) extra(prog);
        EV.GL.fullscreen();
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // Recalcula cielo + IBL. Se llama sólo cuando el sol o el clima cambian.
    function update(camAltitude) {
      if (!state.dirty) return;
      state.dirty = false;

      renderCube(skyProg, skyCube, CUBE_SIZE, (P) => {
        applyAtmoUniforms(P);
        EV.GL.U.f(P, 'uCamAltitude', camAltitude || 2.0);
      });

      // Los mips del cubemap actúan como prefiltrado especular por rugosidad.
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyCube);
      gl.generateMipmap(gl.TEXTURE_CUBE_MAP);

      renderCube(irrProg, irrCube, IRR_SIZE, (P) => {
        EV.GL.U.tex(P, 'uSky', 0, skyCube, gl.TEXTURE_CUBE_MAP);
      });

      updateSunRadiance();

      // El ambiente para la lógica de juego se estima en CPU a partir de la
      // radiancia solar: leer el téxel de vuelta costaba un stall de GPU
      // completo cada actualización.
      const amb = 0.12 + 0.38 * Math.max(state.sunDir[1], 0.0);
      EV.V3.set(state.ambient,
        state.sunRadiance[0] * amb * 0.25,
        state.sunRadiance[1] * amb * 0.27,
        state.sunRadiance[2] * amb * 0.32);
    }

    const _newDir = EV.V3.create();
    function setSun(dir) {
      EV.V3.normalize(_newDir, dir);
      // Sólo regenerar cuando el sol se movió lo suficiente como para que se
      // note. El ciclo de día dura 90 minutos: sin este umbral se recalcularían
      // seis caras del cubemap, sus mips y la irradiancia en cada frame.
      const cosDelta = EV.V3.dot(_newDir, state.sunDir);
      if (cosDelta < 0.99997) state.dirty = true;
      EV.V3.copy(state.sunDir, _newDir);
      // La radiancia directa sí se actualiza siempre: es barata y continua.
      updateSunRadiance();
    }
    function setTurbidity(t) {
      if (Math.abs(t - state.turbidity) > 0.01) {
        state.turbidity = t;
        state.dirty = true;
      }
    }

    state.update = update;
    state.setSun = setSun;
    state.setTurbidity = setTurbidity;
    return state;
  }

  EV.Sky = { create, PROFILE };
})(window.EV = window.EV || {});
