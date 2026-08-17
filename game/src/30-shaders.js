// Ecos del Vacío — biblioteca de chunks GLSL reutilizables (#include <nombre>).
(function (EV) {
  'use strict';

  const chunks = {};

  // --------------------------------------------------------------- constantes
  chunks['common'] = /* glsl */`
precision highp float;
precision highp int;

const float PI      = 3.14159265359;
const float INV_PI  = 0.31830988618;
const float EPS     = 1e-5;

float saturate(float x){ return clamp(x, 0.0, 1.0); }
vec3  saturate(vec3 x){ return clamp(x, vec3(0.0), vec3(1.0)); }
float pow2(float x){ return x*x; }
float pow5(float x){ float t = x*x; return t*t*x; }

// Hash entero de alta calidad (Jarzynski & Olano) para ruido sin textura.
uint hashU(uint x){
  x ^= x >> 16; x *= 0x7feb352du;
  x ^= x >> 15; x *= 0x846ca68bu;
  x ^= x >> 16; return x;
}
float hash11(float p){ return float(hashU(uint(int(p*4096.0)))) / 4294967296.0; }
float hash12(vec2 p){
  uvec2 q = uvec2(ivec2(p * 512.0));
  return float(hashU(q.x ^ hashU(q.y))) / 4294967296.0;
}
vec3 hash32(vec2 p){
  uvec2 q = uvec2(ivec2(p * 512.0));
  uint h = hashU(q.x ^ hashU(q.y));
  return vec3(float(h & 0xFFu), float((h >> 8) & 0xFFu), float((h >> 16) & 0xFFu)) / 255.0;
}

// Ruido de valor 3D con interpolación quíntica (para detalle y volumétricos).
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f*f*f*(f*(f*6.0-15.0)+10.0);
  vec2 e = vec2(0.0, 1.0);
  float a = hash12(i.xy + i.z*37.0 + e.xx);
  float b = hash12(i.xy + i.z*37.0 + e.yx);
  float c = hash12(i.xy + i.z*37.0 + e.xy);
  float d = hash12(i.xy + i.z*37.0 + e.yy);
  float a2 = hash12(i.xy + (i.z+1.0)*37.0 + e.xx);
  float b2 = hash12(i.xy + (i.z+1.0)*37.0 + e.yx);
  float c2 = hash12(i.xy + (i.z+1.0)*37.0 + e.xy);
  float d2 = hash12(i.xy + (i.z+1.0)*37.0 + e.yy);
  float lo = mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
  float hi = mix(mix(a2,b2,f.x), mix(c2,d2,f.x), f.y);
  return mix(lo, hi, f.z);
}
float fbm3(vec3 p, int oct){
  float s = 0.0, a = 0.5, n = 0.0;
  for(int i=0;i<6;i++){
    if(i>=oct) break;
    s += a * vnoise(p); n += a; p *= 2.03; a *= 0.5;
  }
  return s / max(n, EPS);
}

// Reconstrucción de posición mundial desde profundidad de dispositivo.
vec3 worldFromDepth(vec2 uv, float depth, mat4 invViewProj){
  vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 w = invViewProj * ndc;
  return w.xyz / w.w;
}
float linearizeDepth(float d, float near, float far){
  float z = d * 2.0 - 1.0;
  return (2.0 * near * far) / (far + near - z * (far - near));
}

// Codificación octaédrica de normales: 2 canales, sin costura.
vec2 octEncode(vec3 n){
  n /= (abs(n.x) + abs(n.y) + abs(n.z));
  vec2 e = n.xz;
  if(n.y < 0.0) e = (1.0 - abs(e.yx)) * vec2(e.x >= 0.0 ? 1.0 : -1.0, e.y >= 0.0 ? 1.0 : -1.0);
  return e * 0.5 + 0.5;
}
vec3 octDecode(vec2 f){
  f = f * 2.0 - 1.0;
  vec3 n = vec3(f.x, 1.0 - abs(f.x) - abs(f.y), f.y);
  float t = saturate(-n.y);
  n.x += n.x >= 0.0 ? -t : t;
  n.z += n.z >= 0.0 ? -t : t;
  return normalize(n);
}
`;

  // ------------------------------------------------------------- atmósfera
  // Dispersión simple (Rayleigh + Mie) por raymarch, en escala planetaria.
  // Es el modelo que alimenta cielo, IBL y perspectiva aérea: una sola fuente
  // de verdad para toda la iluminación ambiental.
  chunks['atmosphere'] = /* glsl */`
uniform vec3  uBetaR;        // dispersión Rayleigh (1/m)
uniform vec3  uBetaM;        // dispersión Mie (1/m)
uniform float uHR;           // altura de escala Rayleigh
uniform float uHM;           // altura de escala Mie
uniform float uMieG;         // anisotropía Mie (forward scattering)
uniform float uPlanetR;
uniform float uAtmoR;
uniform vec3  uSunDir;       // hacia el sol
uniform vec3  uSunColor;
uniform float uSunIntensity;
uniform float uTurbidity;    // polvo en suspensión: sube con la tormenta
uniform vec3  uGroundAlbedo; // el planeta bajo el horizonte también dispersa luz
uniform vec3  uBetaD;        // polvo a ras de suelo: la capa que define Kether-3
uniform float uHD;           // altura de escala del polvo (cientos de metros)
uniform float uDustG;        // anisotropía del polvo

// Intersección rayo-esfera (devuelve t de entrada/salida; x<0 si no hay).
vec2 raySphere(vec3 ro, vec3 rd, float r){
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r*r;
  float d = b*b - c;
  if(d < 0.0) return vec2(-1.0);
  d = sqrt(d);
  return vec2(-b - d, -b + d);
}

float phaseRayleigh(float mu){ return 3.0 / (16.0*PI) * (1.0 + mu*mu); }
float phaseMie(float mu, float g){
  float g2 = g*g;
  float denom = 1.0 + g2 - 2.0*g*mu;
  return 3.0 / (8.0*PI) * ((1.0 - g2) * (1.0 + mu*mu)) /
         ((2.0 + g2) * max(pow(denom, 1.5), EPS));
}

// Transmitancia hacia el sol desde un punto de la atmósfera.
vec3 sunTransmittance(vec3 pos, vec3 sunDir){
  vec2 t = raySphere(pos, sunDir, uAtmoR);
  if(t.y < 0.0) return vec3(1.0);
  const int LSTEPS = 8;
  float odR = 0.0, odM = 0.0, odD = 0.0;
  float lt0 = min(24.0, t.y * 0.5);
  float lratio = max(t.y / lt0, 1.0001);
  float prevT = 0.0;
  for(int i=0;i<LSTEPS;i++){
    float f = (float(i) + 1.0) / float(LSTEPS);
    float t1 = lt0 * pow(lratio, f);
    float seg = t1 - prevT;
    vec3 p = pos + sunDir * sqrt(max(prevT, 1.0) * t1);
    prevT = t1;
    float h = max(length(p) - uPlanetR, 0.0);
    odR += exp(-h / uHR) * seg;
    odM += exp(-h / uHM) * seg;
    odD += exp(-h / uHD) * seg;
  }
  return exp(-(uBetaR * odR + uBetaM * uTurbidity * odM + uBetaD * uTurbidity * odD));
}

// Radiancia del cielo en una dirección. maxDist limita el raymarch para la
// perspectiva aérea sobre geometría sólida.
vec3 skyRadiance(vec3 ro, vec3 rd, float maxDist, out vec3 transmittance){
  vec2 atmo = raySphere(ro, rd, uAtmoR);
  transmittance = vec3(1.0);
  if(atmo.y < 0.0) return vec3(0.0);

  float tStart = max(atmo.x, 0.0);
  float tEnd   = min(atmo.y, maxDist);

  // El planeta ocluye: recorta el rayo contra la superficie. Pero el suelo no
  // es negro — devuelve luz difusa, que es lo que forma la bruma del horizonte.
  bool hitGround = false;
  vec2 ground = raySphere(ro, rd, uPlanetR);
  if(ground.x > 0.0){ tEnd = min(tEnd, ground.x); hitGround = true; }
  if(tEnd <= tStart) return vec3(0.0);

  const int STEPS = 28;
  float mu = dot(rd, uSunDir);
  float pR = phaseRayleigh(mu);
  float pM = phaseMie(mu, uMieG);

  vec3 sumR = vec3(0.0), sumM = vec3(0.0), sumD = vec3(0.0);
  float odR = 0.0, odM = 0.0, odD = 0.0;
  float pD = phaseMie(mu, uDustG);

  // Pasos con espaciado logarítmico. La densidad cae exponencialmente con la
  // altura, así que casi toda la dispersión ocurre en los primeros kilómetros y
  // hace falta resolución cerca de la cámara. Una distribución polinómica no
  // sirve: su forma depende de la longitud total del rayo, que salta de ~70 km
  // (rayo que pega en el suelo) a ~800 km (rayo rasante que escapa) al cruzar
  // el horizonte, y ese salto se ve como una banda. El espaciado logarítmico es
  // invariante de escala: la misma resolución relativa para cualquier recorrido.
  float t0 = max(tStart, 24.0);
  float ratio = max(tEnd / t0, 1.0001);
  float prevT = tStart;
  for(int i=0;i<STEPS;i++){
    float f = (float(i) + 1.0) / float(STEPS);
    float t1 = t0 * pow(ratio, f);
    float seg = t1 - prevT;
    float t = sqrt(max(prevT, 1.0) * t1);   // media geométrica del segmento
    prevT = t1;
    if(seg <= 0.0) continue;

    vec3 p = ro + rd * t;
    float h = max(length(p) - uPlanetR, 0.0);
    float dR = exp(-h / uHR) * seg;
    float dM = exp(-h / uHM) * seg;
    float dD = exp(-h / uHD) * seg;
    odR += dR; odM += dM; odD += dD;
    vec3 viewTrans = exp(-(uBetaR * odR + uBetaM * uTurbidity * odM
                           + uBetaD * uTurbidity * odD));
    vec3 sunTrans  = sunTransmittance(p, uSunDir);
    vec3 tr = viewTrans * sunTrans;
    sumR += tr * dR;
    sumM += tr * dM;
    sumD += tr * dD;
  }
  transmittance = exp(-(uBetaR * odR + uBetaM * uTurbidity * odM
                        + uBetaD * uTurbidity * odD));
  vec3 result = (sumR * uBetaR * pR
               + sumM * uBetaM * uTurbidity * pM
               + sumD * uBetaD * uTurbidity * pD) * uSunColor * uSunIntensity;

  if(hitGround){
    vec3 gp = ro + rd * tEnd;
    vec3 gn = normalize(gp);
    float ndl = max(dot(gn, uSunDir), 0.0);
    vec3 gcol = uGroundAlbedo * uSunColor * uSunIntensity * ndl * INV_PI
                * sunTransmittance(gp, uSunDir);
    // La transmitancia ya incluye la extinción del polvo, y sumD ya aportó la
    // luz que ese mismo polvo dispersa. El horizonte cierra continuo sin trucos.
    result += gcol * transmittance;
  }
  return result;
}

// Disco solar con oscurecimiento de limbo, sumado sólo cuando no hay geometría.
vec3 sunDisc(vec3 rd){
  float mu = dot(rd, uSunDir);
  float cosAng = cos(0.0093);           // ~0.53° de diámetro aparente
  if(mu < cosAng) return vec3(0.0);
  float edge = saturate((mu - cosAng) / (1.0 - cosAng));
  float limb = 0.4 + 0.6 * sqrt(max(edge, 0.0));
  return uSunColor * uSunIntensity * 12.0 * limb;
}
`;

  // ------------------------------------------------------------------- PBR
  chunks['pbr'] = /* glsl */`
// Cook-Torrance con GGX + Smith height-correlated + Fresnel Schlick.
float D_GGX(float NoH, float a){
  float a2 = a*a;
  float d = (NoH*a2 - NoH)*NoH + 1.0;
  return a2 / max(PI * d * d, 1e-7);
}
float V_SmithGGXCorrelated(float NoV, float NoL, float a){
  float a2 = a*a;
  float gv = NoL * sqrt(NoV*NoV*(1.0-a2)+a2);
  float gl = NoV * sqrt(NoL*NoL*(1.0-a2)+a2);
  return 0.5 / max(gv + gl, 1e-7);
}
vec3 F_Schlick(vec3 f0, float u){ return f0 + (vec3(1.0) - f0) * pow5(1.0 - u); }
float F_Schlick90(float f0, float f90, float u){ return f0 + (f90 - f0) * pow5(1.0 - u); }

// Difuso Burley: más creíble que Lambert en superficies rugosas (arena, roca).
float Fd_Burley(float NoV, float NoL, float LoH, float rough){
  float f90 = 0.5 + 2.0 * rough * LoH * LoH;
  float lightScatter = F_Schlick90(1.0, f90, NoL);
  float viewScatter  = F_Schlick90(1.0, f90, NoV);
  return lightScatter * viewScatter * INV_PI;
}

// Aproximación analítica del DFG de entorno (Karis, mobile-friendly).
vec3 envBRDFApprox(vec3 f0, float rough, float NoV){
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4( 1.0,  0.0425,  1.04,  -0.04);
  vec4 r = rough * c0 + c1;
  float a004 = min(r.x*r.x, exp2(-9.28*NoV)) * r.x + r.y;
  vec2 ab = vec2(-1.04, 1.04) * a004 + r.zw;
  return f0 * ab.x + ab.y;
}

struct Surface {
  vec3  albedo;
  vec3  N;
  vec3  V;
  float rough;
  float metal;
  float ao;
  vec3  emissive;
};

vec3 directLight(Surface s, vec3 L, vec3 radiance){
  vec3 H = normalize(s.V + L);
  float NoV = abs(dot(s.N, s.V)) + 1e-5;
  float NoL = saturate(dot(s.N, L));
  float NoH = saturate(dot(s.N, H));
  float LoH = saturate(dot(L, H));
  if(NoL <= 0.0) return vec3(0.0);

  float a = max(s.rough * s.rough, 0.002);
  vec3 f0 = mix(vec3(0.04), s.albedo, s.metal);

  float D = D_GGX(NoH, a);
  float Vis = V_SmithGGXCorrelated(NoV, NoL, a);
  vec3  F = F_Schlick(f0, LoH);
  vec3 spec = D * Vis * F;

  vec3 kd = (vec3(1.0) - F) * (1.0 - s.metal);
  vec3 diff = kd * s.albedo * Fd_Burley(NoV, NoL, LoH, s.rough);

  return (diff + spec) * radiance * NoL;
}
`;

  // --------------------------------------------------------------- sombras
  chunks['shadow'] = /* glsl */`
uniform highp sampler2DArrayShadow uShadowMap;
uniform mat4  uShadowMat[3];
uniform vec4  uCascadeSplits;   // xyz = distancias de corte, w = texel world size c0
uniform float uShadowTexel;     // 1.0 / resolución

#ifndef SHADOW_TAPS
#define SHADOW_TAPS 12
#endif

// Poisson de 12 muestras: buena calidad de penumbra con pocos taps.
const vec2 POISSON[12] = vec2[12](
  vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696,  0.457),
  vec2(-0.203,  0.621), vec2( 0.962, -0.195), vec2( 0.473, -0.480),
  vec2( 0.519,  0.767), vec2( 0.185, -0.893), vec2( 0.507,  0.064),
  vec2( 0.896,  0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598)
);

int pickCascade(float viewDepth){
  if(viewDepth < uCascadeSplits.x) return 0;
  if(viewDepth < uCascadeSplits.y) return 1;
  return 2;
}

float sampleShadow(vec3 worldPos, vec3 N, vec3 L, float viewDepth){
  int c = pickCascade(viewDepth);

  // Normal offset: desplaza el punto de muestreo a lo largo de la normal para
  // matar el shadow acne sin necesidad de bias en profundidad (peter-panning).
  float texelWorld = uCascadeSplits.w * pow(3.0, float(c));
  float slope = saturate(1.0 - dot(N, L));
  vec3 offsetPos = worldPos + N * texelWorld * (1.0 + slope * 2.5) * 1.4;

  vec4 sc = uShadowMat[c] * vec4(offsetPos, 1.0);
  sc.xyz /= sc.w;
  sc.xyz = sc.xyz * 0.5 + 0.5;

  if(sc.x < 0.001 || sc.x > 0.999 || sc.y < 0.001 || sc.y > 0.999 || sc.z > 1.0) return 1.0;

  float radius = uShadowTexel * 1.6;
  float sum = 0.0;
  // Rotación por píxel del kernel: convierte el aliasing en ruido, que el TAA
  // integra a penumbra suave.
  float ang = hash12(gl_FragCoord.xy) * 6.2831853;
  float ca = cos(ang), sa = sin(ang);
  mat2 rot = mat2(ca, -sa, sa, ca);

  for(int i=0;i<SHADOW_TAPS;i++){
    vec2 o = rot * POISSON[i] * radius;
    sum += texture(uShadowMap, vec4(sc.xy + o, float(c), sc.z));
  }
  float s = sum / float(SHADOW_TAPS);

  // Desvanecido en el borde de la última cascada para que no haya corte visible.
  float fade = saturate((uCascadeSplits.z - viewDepth) / (uCascadeSplits.z * 0.25));
  return mix(1.0, s, fade);
}
`;

  // ------------------------------------------------------------------ tonos
  chunks['tonemap'] = /* glsl */`
// ACES fitted (Stephen Hill) — la curva estándar de cine.
const mat3 ACESInput = mat3(
  0.59719, 0.07600, 0.02840,
  0.35458, 0.90834, 0.13383,
  0.04823, 0.01566, 0.83777
);
const mat3 ACESOutput = mat3(
   1.60475, -0.10208, -0.00327,
  -0.53108,  1.10813, -0.07276,
  -0.07367, -0.00605,  1.07602
);
vec3 RRTAndODTFit(vec3 v){
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 tonemapACES(vec3 color){
  color = ACESInput * color;
  color = RRTAndODTFit(color);
  color = ACESOutput * color;
  return saturate(color);
}
vec3 linearToSRGB(vec3 c){
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(1e-5)), vec3(1.0/2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}
vec3 sRGBToLinear(vec3 c){
  vec3 lo = c / 12.92;
  vec3 hi = pow(max((c + 0.055) / 1.055, vec3(1e-5)), vec3(2.4));
  return mix(lo, hi, step(vec3(0.04045), c));
}
float luminance(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

  EV.Shaders = { chunks };
})(window.EV = window.EV || {});
