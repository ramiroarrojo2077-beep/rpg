// Ecos del Vacío — shaders de los pases de geometría.
// Un solo vertex shader cubre terreno, nodos y props instanciados vía defines,
// para que los tres pases (sombra, prepase, principal) compartan exactamente la
// misma transformación — requisito de la prueba de profundidad LEQUAL.
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

uniform mat4 uViewProj;          // con jitter de TAA
uniform mat4 uViewProjNoJit;
uniform mat4 uPrevViewProjNoJit;
#ifdef NODE
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

void main(){
  vec3 world;
  vec3 nrm;
  float variation = 0.0;

#if defined(INSTANCED)
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
  vec3 prevWorld = world;   // los props son estáticos
#elif defined(NODE)
  world = (uModel * vec4(aPos, 1.0)).xyz;
  nrm = normalize((uNormalMat * vec4(aNormal, 0.0)).xyz);
  vec3 prevWorld = (uPrevModel * vec4(aPos, 1.0)).xyz;
#else   // TERRAIN
  world = aPos;
  nrm = aNormal;
  vec3 prevWorld = world;
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
  // Compartido entre prepase y pase principal para que normal y rugosidad
  // coincidan exactamente en ambos.
  const MATERIAL_CHUNK = /* glsl */`
uniform float uTime;
uniform vec3  uCamPos;
#ifdef NODE
uniform vec3  uAlbedo;
uniform float uRough;
uniform float uMetal;
uniform vec3  uEmissive;
uniform float uDamage;     // 0..1 oscurece y quema la superficie del titán
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
  // Arena de sílice: ámbar cálido, con ondulación de viento y vetas de cristal.
  float slope = 1.0 - saturate(N.y);
  vec3 sand   = vec3(0.402, 0.246, 0.116);
  vec3 sandLo = vec3(0.282, 0.166, 0.086);
  vec3 rock   = vec3(0.176, 0.140, 0.121);
  vec3 glass  = vec3(0.512, 0.420, 0.360);

  float grain = fbm3(wp * 0.35, 3);
  vec3 albedo = mix(sandLo, sand, grain);
  albedo = mix(albedo, rock, smoothstep(0.22, 0.55, slope));
  albedo = mix(albedo, glass, saturate(extra) * 0.75);

  // Ondas de viento sólo en pendiente suave, alineadas a una dirección dominante.
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

#elif defined(INSTANCED)
  if(uPropType == 0){
    // Cristal: baja rugosidad, gradiente interno por altura, tinte por instancia.
    vec3 tint = mix(vec3(0.86, 0.74, 0.58), vec3(0.66, 0.72, 0.86), variation);
    m.albedo = mix(tint * 0.62, tint, extra);
    m.rough  = mix(0.05, 0.18, variation) + extra * 0.05;
    m.metal  = 0.0;
    // Transmisión aproximada: el cristal deja pasar luz, así que el borde y la
    // punta se encienden aunque no estén orientados al sol.
    float rim = pow(1.0 - saturate(abs(dot(N, normalize(uCamPos - wp)))), 3.0);
    m.emissive = tint * (0.10 + 0.55 * extra) * (0.25 + rim * 1.6);
    m.emissive += vec3(0.55, 0.38, 0.22) * pow(1.0 - extra, 3.0) * 0.20 * variation;
    m.N = N;
  } else {
    // Chatarra humana: metal pintado, oxidado y comido por la arena.
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

  // Detalle de superficie: paneles y microrrayado según el tipo de material.
  float panel = fbm3(wp * 1.7, 3);
  albedo *= 0.86 + 0.28 * panel;
  rough = saturate(rough + (panel - 0.5) * 0.18);

  // Daño acumulado: la placa se ennegrece y pierde brillo donde fue golpeada.
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
${''}
in vec3  vWorld;
in vec3  vNormal;
in float vExtra;
in float vVariation;
in vec4  vClipNoJit;
in vec4  vPrevClipNoJit;

layout(location=0) out vec4 oNormalRough;
layout(location=1) out vec2 oVelocity;

#include <material>

void main(){
  MatOut m = evalMaterial(vWorld, vNormal, vExtra, vVariation);
  vec3 N = gl_FrontFacing ? m.N : -m.N;
  oNormalRough = vec4(N * 0.5 + 0.5, m.rough);

  vec2 curr = vClipNoJit.xy / max(vClipNoJit.w, 1e-6);
  vec2 prev = vPrevClipNoJit.xy / max(vPrevClipNoJit.w, 1e-6);
  oVelocity = (curr - prev) * 0.5;   // en UV
}`;

  // ------------------------------------------------------------------ opaco
  const MAIN_FS = /* glsl */`
#include <common>
#include <pbr>
#include <shadow>
#include <atmosphere>

in vec3  vWorld;
in vec3  vNormal;
in float vExtra;
in float vVariation;
in vec4  vClipNoJit;
in vec4  vPrevClipNoJit;

uniform samplerCube uSkyCube;
uniform samplerCube uIrradiance;
uniform sampler2D   uAO;
uniform float       uSkyMips;
uniform vec2        uScreenSize;
uniform vec3        uSunRadiance;
uniform float       uFogDensity;
uniform float       uExposureComp;

layout(location=0) out vec4 oColor;

#include <material>

void main(){
  MatOut m = evalMaterial(vWorld, vNormal, vExtra, vVariation);
  vec3 N = gl_FrontFacing ? m.N : -m.N;
  vec3 Vv = uCamPos - vWorld;
  float dist = length(Vv);
  vec3 V = Vv / max(dist, 1e-5);

  Surface s;
  s.albedo = m.albedo; s.N = N; s.V = V;
  s.rough = m.rough; s.metal = m.metal; s.emissive = m.emissive;
  // El AO vive a media resolución: se muestrea por UV, no por téxel.
  s.ao = texture(uAO, gl_FragCoord.xy / uScreenSize).r;

  // --- sol directo con sombra en cascada
  float viewDepth = dist;
  float shadow = sampleShadow(vWorld, N, uSunDir, viewDepth);
  vec3 color = directLight(s, uSunDir, uSunRadiance * shadow);

  // --- ambiente: irradiancia difusa + especular prefiltrado del cielo
  float NoV = saturate(dot(N, V));
  vec3 f0 = mix(vec3(0.04), s.albedo, s.metal);

  vec3 irr = texture(uIrradiance, N).rgb;
  vec3 diffuseIBL = irr * s.albedo * (1.0 - s.metal);

  vec3 R = reflect(-V, N);
  float lod = sqrt(s.rough) * (uSkyMips - 1.0);
  vec3 pre = textureLod(uSkyCube, R, lod).rgb;
  vec3 specIBL = pre * envBRDFApprox(f0, s.rough, NoV);

  // Oclusión especular derivada del AO (Lagarde): evita reflejos flotando en
  // cavidades que el AO ya oscureció.
  float specAO = saturate(pow(NoV + s.ao, exp2(-16.0 * s.rough - 1.0)) - 1.0 + s.ao);

  color += diffuseIBL * s.ao + specIBL * specAO;
  color += s.emissive;

  // --- perspectiva aérea: extinción + luz dispersa en el camino
  vec3 inscatter = textureLod(uSkyCube, -V, uSkyMips * 0.55).rgb;
  float sigma = uFogDensity;
  float ext = exp(-dist * sigma);
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
  // Ruido de orden bajo para romper el banding del degradado en 16 bits.
  col += (hash12(gl_FragCoord.xy) - 0.5) * 0.0015;
  oColor = vec4(col * uExposureComp, 1.0);
}`;

  EV.GeoShaders = {
    GEO_VS, SHADOW_FS, PREPASS_FS, MAIN_FS, SKYBOX_VS, SKYBOX_FS, MATERIAL_CHUNK,
  };

  // Registra el chunk de materiales para que #include <material> lo resuelva.
  EV.Shaders.chunks['material'] = MATERIAL_CHUNK;
})(window.EV = window.EV || {});
