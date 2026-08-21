// Ecos del Vacío — shaders de los pases de geometría.
// Un solo vertex shader cubre terreno, nodos, props instanciados y personajes
// con piel, vía defines, para que los tres pases (sombra, prepase, principal)
// compartan exactamente la misma transformación — requisito de la prueba de
// profundidad LEQUAL del pase opaco.
(function (EV) {
  'use strict';

  const GEO_VS = /* glsl */`
#include <common>

layout(location=0) in vec3  aPos;
layout(location=1) in vec3  aNormal;
layout(location=2) in float aExtra;
#ifdef INSTANCED
layout(location=3) in vec4 aInst0;   // pos.xyz, escalaY
layout(location=4) in vec4 aInst1;   // sinRot, cosRot, escalaXZ, variación
#endif
#ifdef SKINNED
layout(location=5) in vec4 aBoneIdx;
layout(location=6) in vec4 aBoneWgt;
uniform highp sampler2D uBoneTex;
uniform highp sampler2D uPrevBoneTex;
#endif

uniform mat4 uViewProj;          // con jitter de TAA
uniform mat4 uViewProjNoJit;
uniform mat4 uPrevViewProjNoJit;
#if defined(NODE)
uniform mat4 uModel;
uniform mat4 uPrevModel;
uniform mat4 uNormalMat;
#endif

out vec3  vWorld;
out vec3  vNormal;
out float vExtra;
out float vVariation;
out vec4  vClipNoJit;
out vec4  vPrevClipNoJit;

invariant gl_Position;

#ifdef SKINNED
// Cuatro téxeles consecutivos por hueso forman su mat4. Con uniformes se choca
// contra MAX_VERTEX_UNIFORM_VECTORS en cuanto hay más de ~50 huesos.
mat4 boneMatrix(highp sampler2D tex, float idx){
  int b = int(idx) * 4;
  return mat4(
    texelFetch(tex, ivec2(b + 0, 0), 0),
    texelFetch(tex, ivec2(b + 1, 0), 0),
    texelFetch(tex, ivec2(b + 2, 0), 0),
    texelFetch(tex, ivec2(b + 3, 0), 0));
}
mat4 skinMatrix(highp sampler2D tex){
  return boneMatrix(tex, aBoneIdx.x) * aBoneWgt.x
       + boneMatrix(tex, aBoneIdx.y) * aBoneWgt.y
       + boneMatrix(tex, aBoneIdx.z) * aBoneWgt.z
       + boneMatrix(tex, aBoneIdx.w) * aBoneWgt.w;
}
#endif

void main(){
  vec3 world;
  vec3 nrm;
  vec3 prevWorld;
  float variation = 0.0;

#if defined(SKINNED)
  mat4 skin = skinMatrix(uBoneTex);
  world = (skin * vec4(aPos, 1.0)).xyz;
  // La inversa-transpuesta exacta es cara por vértice; con huesos rígidos y
  // escala uniforme la submatriz 3x3 basta y el error es imperceptible.
  nrm = normalize(mat3(skin) * aNormal);
  prevWorld = (skinMatrix(uPrevBoneTex) * vec4(aPos, 1.0)).xyz;

#elif defined(INSTANCED)
  float s = aInst1.x, c = aInst1.y;
  vec3 scaled = vec3(aPos.x * aInst1.z, aPos.y * aInst0.w, aPos.z * aInst1.z);
  world = vec3(
    scaled.x * c + scaled.z * s,
    scaled.y,
   -scaled.x * s + scaled.z * c
  ) + aInst0.xyz;
  nrm = normalize(vec3(
    aNormal.x * c + aNormal.z * s,
    aNormal.y,
   -aNormal.x * s + aNormal.z * c
  ));
  variation = aInst1.w;
  prevWorld = world;   // los props son estáticos

#elif defined(NODE)
  world = (uModel * vec4(aPos, 1.0)).xyz;
  nrm = normalize((uNormalMat * vec4(aNormal, 0.0)).xyz);
  prevWorld = (uPrevModel * vec4(aPos, 1.0)).xyz;

#else   // TERRAIN
  world = aPos;
  nrm = aNormal;
  prevWorld = world;
#endif

  vWorld = world;
  vNormal = nrm;
  vExtra = aExtra;
  vVariation = variation;
  vClipNoJit     = uViewProjNoJit     * vec4(world, 1.0);
  vPrevClipNoJit = uPrevViewProjNoJit * vec4(prevWorld, 1.0);
  gl_Position = uViewProj * vec4(world, 1.0);
}`;

  // Pase de sombra: sólo profundidad.
  const SHADOW_FS = /* glsl */`
#include <common>
in vec3 vWorld; in vec3 vNormal; in float vExtra; in float vVariation;
in vec4 vClipNoJit; in vec4 vPrevClipNoJit;
void main(){}`;

  // ------------------------------------------------------------- materiales
  const MATERIAL_CHUNK = /* glsl */`
uniform float uTime;
uniform vec3  uCamPos;
#if defined(NODE)
uniform vec3  uAlbedo;
uniform float uRough;
uniform float uMetal;
uniform vec3  uEmissive;
uniform float uDamage;
#endif
#if defined(SKINNED)
uniform vec3  uSuitColor;
uniform vec3  uArmorColor;
uniform vec3  uAccentColor;
uniform float uWear;       // suciedad acumulada del planeta
uniform float uEmissivePulse;
#endif
#ifdef INSTANCED
uniform int uPropType;     // 0 = cristal, 1 = chatarra
#endif

struct MatOut { vec3 albedo; vec3 N; float rough; float metal; vec3 emissive; };

// Normal de detalle procedural por gradiente de ruido: hace las veces del
// desplazamiento de superficie sin coste de geometría.
vec3 perturbNormal(vec3 N, vec3 wp, float scale, float strength){
  float e = 0.35 / scale;
  float h0 = fbm3(wp * scale, 3);
  float hx = fbm3((wp + vec3(e,0.0,0.0)) * scale, 3);
  float hz = fbm3((wp + vec3(0.0,0.0,e)) * scale, 3);
  vec3 g = vec3((hx - h0), 0.0, (hz - h0)) / e;
  vec3 T = normalize(cross(vec3(0.0,1.0,0.0), N) + vec3(1e-4));
  vec3 B = cross(N, T);
  return normalize(N - (T * g.x + B * g.z) * strength);
}

MatOut evalMaterial(vec3 wp, vec3 nrm, float extra, float variation){
  MatOut m;
  m.emissive = vec3(0.0);
  vec3 N = normalize(nrm);

#if defined(TERRAIN)
  float slope = 1.0 - saturate(N.y);
  vec3 sand   = vec3(0.402, 0.246, 0.116);
  vec3 sandLo = vec3(0.282, 0.166, 0.086);
  vec3 rock   = vec3(0.176, 0.140, 0.121);
  vec3 glass  = vec3(0.512, 0.420, 0.360);

  float grain = fbm3(wp * 0.35, 3);
  vec3 albedo = mix(sandLo, sand, grain);
  albedo = mix(albedo, rock, smoothstep(0.22, 0.55, slope));
  albedo = mix(albedo, glass, saturate(extra) * 0.75);

  float ripple = sin(dot(wp.xz, vec2(0.83, 0.56)) * 1.85
                     + fbm3(wp * 0.06, 2) * 9.0) * 0.5 + 0.5;
  float rippleMask = (1.0 - smoothstep(0.05, 0.3, slope)) * (1.0 - saturate(extra));
  albedo *= 1.0 + (ripple - 0.5) * 0.085 * rippleMask;

  N = perturbNormal(N, wp, 0.85, 0.30 * rippleMask + 0.06);
  N = perturbNormal(N, wp, 0.075, 0.28);

  m.albedo = albedo;
  m.rough  = mix(0.92, 0.34, saturate(extra) * 0.9);
  m.rough  = mix(m.rough, 0.72, smoothstep(0.25, 0.6, slope));
  m.metal  = 0.0;
  m.N = N;

#elif defined(SKINNED)
  // El atributo extra es el submaterial escrito por el generador de malla:
  // 0 traje · 1 blindaje · 2 visor · 3 acento · 4 goma/junta
  int sub = int(extra + 0.5);
  vec3 albedo; float rough; float metal;

  if(sub == 1){                       // placa de blindaje
    albedo = uArmorColor;
    rough = 0.34; metal = 0.88;
  } else if(sub == 2){                // visor
    albedo = vec3(0.020, 0.026, 0.034);
    rough = 0.045; metal = 0.0;
    // El visor refleja el interior iluminado del casco, no sólo el entorno.
    m.emissive = vec3(0.06, 0.20, 0.32) * (0.7 + 0.3 * uEmissivePulse);
  } else if(sub == 3){                // acento (luces, franjas de identidad)
    albedo = uAccentColor * 0.10;
    rough = 0.30; metal = 0.20;
    m.emissive = uAccentColor * (0.42 + 0.30 * uEmissivePulse);
  } else if(sub == 4){                // goma, juntas, botas
    albedo = uSuitColor * 0.62;
    rough = 0.86; metal = 0.03;
  } else {                            // tejido del traje
    albedo = uSuitColor;
    rough = 0.72; metal = 0.06;
  }

  // Brillo de borde del tejido: la luz que roza una tela se dispersa entre las
  // fibras y enciende la silueta. Sin esto el traje lee como plástico mate.
  if(sub == 0 || sub == 4){
    float rim = pow(1.0 - saturate(abs(dot(N, normalize(uCamPos - wp)))), 3.5);
    m.emissive += uSuitColor * rim * 0.55 + vec3(0.10, 0.11, 0.13) * rim * 0.35;
  }

  if(sub != 2 && sub != 3){
    // Microdetalle: tejido fino en el traje, rayado en el metal.
    float fine = fbm3(wp * (sub == 1 ? 9.0 : 16.0), 2);
    albedo *= 0.93 + 0.14 * fine;
    rough = saturate(rough + (fine - 0.5) * (sub == 1 ? 0.12 : 0.08));
    N = perturbNormal(N, wp, sub == 1 ? 7.0 : 12.0, 0.07);

    // Polvo de Kether: se acumula arriba, no en las caras que miran al suelo.
    float dustMask = saturate(N.y) * uWear;
    float dustNoise = fbm3(wp * 2.6, 2);
    albedo = mix(albedo, vec3(0.300, 0.208, 0.126), dustMask * (0.14 + 0.22 * dustNoise));
    rough = mix(rough, 0.90, dustMask * 0.42);
    metal *= 1.0 - dustMask * 0.38;
  }

  m.albedo = albedo;
  m.rough = rough;
  m.metal = metal;
  m.N = N;

#elif defined(INSTANCED)
  if(uPropType == 0){
    vec3 tint = mix(vec3(0.86, 0.74, 0.58), vec3(0.66, 0.72, 0.86), variation);
    m.albedo = mix(tint * 0.62, tint, extra);
    m.rough  = mix(0.05, 0.18, variation) + extra * 0.05;
    m.metal  = 0.0;
    float rim = pow(1.0 - saturate(abs(dot(N, normalize(uCamPos - wp)))), 3.0);
    m.emissive = tint * (0.10 + 0.55 * extra) * (0.25 + rim * 1.6);
    m.emissive += vec3(0.55, 0.38, 0.22) * pow(1.0 - extra, 3.0) * 0.20 * variation;
    m.N = N;
  } else if(uPropType == 2){
    // Roca de sílice: mate, con vetas claras y polvo acumulado arriba.
    float grain = fbm3(wp * 1.7, 3);
    float veins = fbm3(wp * 0.42 + 11.0, 2);
    vec3 dark = vec3(0.118, 0.098, 0.082);
    vec3 pale = vec3(0.268, 0.226, 0.180);
    m.albedo = mix(dark, pale, grain * 0.7 + veins * 0.45);
    // La arena se posa en las caras que miran arriba.
    float settle = saturate(N.y) * 0.8;
    m.albedo = mix(m.albedo, vec3(0.360, 0.235, 0.128), settle * (0.30 + 0.35 * grain));
    m.rough = mix(0.72, 0.95, grain);
    m.metal = 0.0;
    m.N = perturbNormal(N, wp, 2.6, 0.32);
  } else {
    float rust = fbm3(wp * 0.9, 3);
    vec3 painted = mix(vec3(0.30, 0.31, 0.33), vec3(0.42, 0.20, 0.10), smoothstep(0.45, 0.75, rust));
    m.albedo = mix(painted, vec3(0.26, 0.18, 0.12), variation * 0.5);
    m.rough  = mix(0.42, 0.86, rust);
    m.metal  = mix(0.85, 0.15, smoothstep(0.4, 0.8, rust));
    m.N = perturbNormal(N, wp, 3.0, 0.25);
  }

#else   // NODE
  vec3 albedo = uAlbedo;
  float rough = uRough;
  float metal = uMetal;

  float panel = fbm3(wp * 1.7, 3);
  albedo *= 0.86 + 0.28 * panel;
  rough = saturate(rough + (panel - 0.5) * 0.18);

  float burn = saturate(uDamage);
  albedo = mix(albedo, albedo * vec3(0.18, 0.14, 0.12), burn);
  rough = mix(rough, 0.95, burn * 0.8);

  m.albedo = albedo;
  m.rough = clamp(rough, 0.03, 1.0);
  m.metal = metal;
  m.emissive = uEmissive;
  m.N = perturbNormal(N, wp, 2.2, 0.18);
#endif

  m.rough = clamp(m.rough, 0.025, 1.0);
  return m;
}`;

  // ----------------------------------------------------------------- prepase
  const PREPASS_FS = /* glsl */`
#include <common>
in vec3  vWorld;
in vec3  vNormal;
in float vExtra;
in float vVariation;
in vec4  vClipNoJit;
in vec4  vPrevClipNoJit;

layout(location=0) out vec4 oNormalRough;
layout(location=1) out vec2 oVelocity;
layout(location=2) out vec4 oSpecular;

#include <material>

void main(){
  MatOut m = evalMaterial(vWorld, vNormal, vExtra, vVariation);
  vec3 N = gl_FrontFacing ? m.N : -m.N;
  oNormalRough = vec4(N * 0.5 + 0.5, m.rough);
  // f0: 4% para dieléctricos, el propio albedo para metales. El pase de
  // reflejos no puede reconstruirlo sin esto.
  oSpecular = vec4(mix(vec3(0.04), m.albedo, m.metal), 1.0);

  vec2 curr = vClipNoJit.xy / max(vClipNoJit.w, 1e-6);
  vec2 prev = vPrevClipNoJit.xy / max(vPrevClipNoJit.w, 1e-6);
  oVelocity = (curr - prev) * 0.5;
}`;

  // ------------------------------------------------------------------ opaco
  const MAIN_FS = /* glsl */`
#include <common>
#include <pbr>
#include <shadow>
#include <atmosphere>
#include <lights>

in vec3  vWorld;
in vec3  vNormal;
in float vExtra;
in float vVariation;
in vec4  vClipNoJit;
in vec4  vPrevClipNoJit;

uniform samplerCube uSkyCube;
uniform samplerCube uIrradiance;
uniform sampler2D   uAO;
uniform sampler2D   uDepthHalf;
uniform mat4        uViewProjNoJitFS;
uniform mat4        uInvViewProjFS;
uniform float       uSkyMips;
uniform vec2        uScreenSize;
uniform vec3        uSunRadiance;
uniform float       uFogDensity;
uniform float       uExposureComp;
uniform float       uContactShadow;

layout(location=0) out vec4 oColor;

#include <material>

// Sombra de contacto: marcha corta contra el búfer de profundidad. Las cascadas
// no resuelven el contacto pie-suelo ni el hueco bajo una placa; esto sí, y es
// lo que evita que los personajes parezcan flotar.
float contactShadow(vec3 wp, vec3 L, float ditherSeed){
  if(uContactShadow < 0.5) return 1.0;
  const int STEPS = 8;
  float rayLen = 0.45;
  float stepLen = rayLen / float(STEPS);
  float jitter = hash12(gl_FragCoord.xy + ditherSeed);
  float occ = 0.0;
  for(int i = 1; i <= STEPS; i++){
    vec3 p = wp + L * (stepLen * (float(i) + jitter));
    vec4 clip = uViewProjNoJitFS * vec4(p, 1.0);
    if(clip.w <= 0.0) break;
    vec3 ndc = clip.xyz / clip.w;
    if(abs(ndc.x) > 1.0 || abs(ndc.y) > 1.0) break;
    vec2 uv = ndc.xy * 0.5 + 0.5;
    float sceneDepth = texture(uDepthHalf, uv).r;
    float rayDepth = ndc.z * 0.5 + 0.5;
    float diff = rayDepth - sceneDepth;
    // Ventana de espesor: sin ella, cualquier objeto lejano proyecta sombra.
    if(diff > 1e-6 && diff < 0.0016){
      occ = max(occ, 1.0 - float(i) / float(STEPS));
    }
  }
  return 1.0 - occ * 0.85;
}

void main(){
  MatOut m = evalMaterial(vWorld, vNormal, vExtra, vVariation);
  vec3 N = gl_FrontFacing ? m.N : -m.N;
  vec3 Vv = uCamPos - vWorld;
  float dist = length(Vv);
  vec3 V = Vv / max(dist, 1e-5);

  Surface s;
  s.albedo = m.albedo; s.N = N; s.V = V;
  s.rough = m.rough; s.metal = m.metal; s.emissive = m.emissive;
  s.ao = texture(uAO, gl_FragCoord.xy / uScreenSize).r;

  // --- sol directo con sombra en cascada + contacto
  float shadow = sampleShadow(vWorld, N, uSunDir, dist);
  if(shadow > 0.01) shadow *= contactShadow(vWorld, uSunDir, uTime * 13.0);
  vec3 color = directLight(s, uSunDir, uSunRadiance * shadow);

  // --- luces locales (fogonazo, fogata, núcleo del titán, baliza)
  color += evalPointLights(s, vWorld);

  // --- ambiente
  float NoV = saturate(dot(N, V));
  vec3 f0 = mix(vec3(0.04), s.albedo, s.metal);
  vec3 irr = texture(uIrradiance, N).rgb;
  vec3 diffuseIBL = irr * s.albedo * (1.0 - s.metal);

  vec3 R = reflect(-V, N);
  float lod = sqrt(s.rough) * (uSkyMips - 1.0);
  vec3 pre = textureLod(uSkyCube, R, lod).rgb;
  vec3 specIBL = pre * envBRDFApprox(f0, s.rough, NoV);

  float specAO = saturate(pow(NoV + s.ao, exp2(-16.0 * s.rough - 1.0)) - 1.0 + s.ao);
  color += diffuseIBL * s.ao + specIBL * specAO;
  color += s.emissive;

  // --- perspectiva aérea
  vec3 inscatter = textureLod(uSkyCube, -V, uSkyMips * 0.55).rgb;
  float ext = exp(-dist * uFogDensity);
  color = color * ext + inscatter * (1.0 - ext);

  oColor = vec4(color * uExposureComp, 1.0);
}`;

  // -------------------------------------------------------------------- cielo
  const SKYBOX_VS = /* glsl */`
#include <common>
layout(location=0) in vec2 aPos;
uniform mat4 uInvViewProj;
out vec3 vDir;
void main(){
  vec4 p = uInvViewProj * vec4(aPos, 1.0, 1.0);
  vec4 o = uInvViewProj * vec4(aPos, -1.0, 1.0);
  vDir = normalize(p.xyz / p.w - o.xyz / o.w);
  gl_Position = vec4(aPos, 1.0, 1.0);
}`;

  const SKYBOX_FS = /* glsl */`
#include <common>
#include <atmosphere>
in vec3 vDir;
uniform samplerCube uSkyCube;
uniform float uExposureComp;
layout(location=0) out vec4 oColor;
void main(){
  vec3 rd = normalize(vDir);
  vec3 col = texture(uSkyCube, rd).rgb;
  col += sunDisc(rd);
  col += (hash12(gl_FragCoord.xy) - 0.5) * 0.0015;
  oColor = vec4(col * uExposureComp, 1.0);
}`;

  EV.GeoShaders = {
    GEO_VS, SHADOW_FS, PREPASS_FS, MAIN_FS, SKYBOX_VS, SKYBOX_FS, MATERIAL_CHUNK,
  };
  EV.Shaders.chunks['material'] = MATERIAL_CHUNK;

  // ------------------------------------------------------------------- luces
  // Lista corta de luces puntuales evaluadas hacia adelante. Con MAX_LIGHTS
  // chico el coste es despreciable y el impacto visual enorme: fogonazo, fuego
  // del campamento, núcleo del titán.
  EV.Shaders.chunks['lights'] = /* glsl */`
#ifndef MAX_LIGHTS
#define MAX_LIGHTS 8
#endif
uniform int  uLightCount;
uniform vec4 uLightPos[MAX_LIGHTS];     // xyz posición, w radio
uniform vec4 uLightColor[MAX_LIGHTS];   // rgb color, a intensidad

vec3 evalPointLights(Surface s, vec3 wp){
  vec3 sum = vec3(0.0);
  for(int i = 0; i < MAX_LIGHTS; i++){
    if(i >= uLightCount) break;
    vec3 d = uLightPos[i].xyz - wp;
    float dist2 = dot(d, d);
    float radius = uLightPos[i].w;
    if(dist2 > radius * radius) continue;
    float dist = sqrt(max(dist2, 1e-6));
    vec3 L = d / dist;
    // Caída inversa al cuadrado con ventana suave al radio: física donde
    // importa, corte limpio donde deja de aportar.
    float win = saturate(1.0 - pow(dist / radius, 4.0));
    float atten = win * win / max(dist2, 0.04);
    sum += directLight(s, L, uLightColor[i].rgb * uLightColor[i].a * atten);
  }
  return sum;
}
`;
})(window.EV = window.EV || {});
