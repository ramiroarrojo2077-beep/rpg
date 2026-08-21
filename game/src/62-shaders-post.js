// Ecos del Vacío — shaders de post-proceso: SSAO, volumétricos, bloom, TAA y
// la cadena final de cámara (lente, ACES, grano, viñeta).
(function (EV) {
  'use strict';

  const FS_VS = /* glsl */`
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main(){
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

  // --------------------------------------------------------------------- SSAO
  const SSAO_FS = /* glsl */`
#include <common>
in vec2 vUV;
uniform sampler2D uDepth;
uniform sampler2D uNormalRough;
uniform mat4  uProj;
uniform mat4  uInvProj;
uniform mat4  uView;
uniform vec2  uResolution;
uniform float uRadius;
uniform float uIntensity;
uniform float uNear;
uniform float uFar;
uniform float uFrame;
layout(location=0) out vec4 oAO;

vec3 viewFromDepth(vec2 uv, float d){
  vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 v = uInvProj * ndc;
  return v.xyz / v.w;
}

void main(){
  float d = texture(uDepth, vUV).r;
  if(d >= 1.0){ oAO = vec4(1.0); return; }

  vec3 P = viewFromDepth(vUV, d);
  vec3 Nw = texture(uNormalRough, vUV).xyz * 2.0 - 1.0;
  vec3 N = normalize((uView * vec4(normalize(Nw), 0.0)).xyz);

  // Base tangente girada por ruido temporal: el TAA promedia el resultado.
  float ang = hash12(gl_FragCoord.xy + uFrame * 7.13) * 6.2831853;
  vec3 rvec = vec3(cos(ang), sin(ang), 0.0);
  vec3 T = normalize(rvec - N * dot(rvec, N));
  vec3 B = cross(N, T);
  mat3 TBN = mat3(T, B, N);

#ifndef SSAO_SAMPLES
#define SSAO_SAMPLES 16
#endif
  const int SAMPLES = SSAO_SAMPLES;
  float occ = 0.0;
  for(int i=0;i<SAMPLES;i++){
    // Distribución en hemisferio con sesgo hacia el origen.
    float fi = (float(i) + 0.5) / float(SAMPLES);
    float a = fi * 6.2831853 * 3.0 + ang;
    float r = pow(fi, 0.7);
    vec3 dir = normalize(vec3(cos(a) * r, sin(a) * r, 0.35 + 0.65 * (1.0 - r)));
    vec3 sp = P + TBN * dir * uRadius * (0.35 + 0.65 * r);

    vec4 clip = uProj * vec4(sp, 1.0);
    vec2 suv = (clip.xy / clip.w) * 0.5 + 0.5;
    if(suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;

    float sd = texture(uDepth, suv).r;
    if(sd >= 1.0) continue;
    vec3 sampleP = viewFromDepth(suv, sd);

    float diff = sampleP.z - sp.z;
    // Comprobación de rango: evita halos oscuros en siluetas lejanas.
    float rangeCheck = smoothstep(0.0, 1.0, uRadius / max(abs(P.z - sampleP.z), 1e-4));
    occ += (diff > 0.02 ? 1.0 : 0.0) * rangeCheck;
  }
  float ao = 1.0 - (occ / float(SAMPLES)) * uIntensity;
  oAO = vec4(saturate(ao), 0.0, 0.0, 1.0);
}`;

  // Desenfoque bilateral guiado por profundidad (separable, 2 pasadas).
  const BLUR_FS = /* glsl */`
#include <common>
in vec2 vUV;
uniform sampler2D uTex;
uniform sampler2D uDepth;
uniform vec2 uDirection;
uniform vec2 uTexel;
layout(location=0) out vec4 oColor;
void main(){
  float centerD = texture(uDepth, vUV).r;
  float sum = 0.0, wsum = 0.0;
  for(int i=-4;i<=4;i++){
    vec2 off = uDirection * uTexel * float(i);
    float w = exp(-float(i*i) * 0.12);
    float d = texture(uDepth, vUV + off).r;
    float dw = exp(-abs(d - centerD) * 900.0);
    sum += texture(uTex, vUV + off).r * w * dw;
    wsum += w * dw;
  }
  oColor = vec4(sum / max(wsum, 1e-4), 0.0, 0.0, 1.0);
}`;

  // -------------------------------------------------------------- volumétricos
  // Raymarch de la luz solar dispersa, con prueba de sombra por paso. Es lo que
  // convierte la tormenta de cristal en un volumen atravesado por el sol.
  const VOLUMETRIC_FS = /* glsl */`
#include <common>
#include <atmosphere>
#include <shadow>
in vec2 vUV;
uniform sampler2D uDepth;
uniform mat4  uInvViewProj;
uniform vec3  uCamPos;
uniform vec3  uSunRadiance;
uniform float uTime;
uniform float uFogDensity;
uniform float uStorm;
uniform float uFrame;
uniform float uMaxDistance;
layout(location=0) out vec4 oColor;

// Densidad del medio: niebla de altura + turbulencia advectada por el viento.
float mediumDensity(vec3 p){
  float height = exp(-max(p.y - 1.0, 0.0) * 0.030);
  vec3 wind = vec3(uTime * 5.5, uTime * 0.6, uTime * 2.2);
  float turb = fbm3((p + wind) * 0.012, 3);
  float turbFine = fbm3((p + wind * 1.7) * 0.055, 2);
  float d = height * (0.55 + 0.9 * turb);
  d *= mix(1.0, 0.4 + 1.9 * turbFine, uStorm);
  return d * uFogDensity * mix(1.0, 9.0, uStorm);
}

void main(){
  float depth = texture(uDepth, vUV).r;
  vec3 world = worldFromDepth(vUV, depth, uInvViewProj);
  vec3 ray = world - uCamPos;
  float dist = length(ray);
  vec3 rd = ray / max(dist, 1e-5);
  if(depth >= 1.0) dist = uMaxDistance;
  dist = min(dist, uMaxDistance);

#ifndef VOL_STEPS
#define VOL_STEPS 28
#endif
  const int STEPS = VOL_STEPS;
  float stepLen = dist / float(STEPS);

  // Offset temporal por píxel: rompe el bandeado del raymarch en ruido que el
  // TAA integra. Sin esto se ven las "capas" del march.
  float jitter = hash12(gl_FragCoord.xy + uFrame * 3.71);

  float mu = dot(rd, uSunDir);
  float phase = phaseMie(mu, mix(0.55, 0.80, uStorm));

  vec3 scattered = vec3(0.0);
  float transmittance = 1.0;

  for(int i=0;i<STEPS;i++){
    float t = (float(i) + jitter) * stepLen;
    vec3 p = uCamPos + rd * t;
    if(p.y < -40.0) break;

    float density = mediumDensity(p);
    if(density < 1e-6) continue;

    float sigma = density * stepLen;
    float vis = sampleShadow(p, vec3(0.0, 1.0, 0.0), uSunDir, t);

    vec3 inscatter = uSunRadiance * vis * phase;
    // Integración analítica del segmento (energía conservada).
    vec3 s = inscatter * (1.0 - exp(-sigma));
    scattered += s * transmittance;
    transmittance *= exp(-sigma);
    if(transmittance < 0.01) break;
  }

  oColor = vec4(scattered, transmittance);
}`;

  // Recomposición del volumétrico de media resolución con guía de profundidad.
  const VOL_UPSAMPLE_FS = /* glsl */`
#include <common>
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uVolume;
uniform sampler2D uDepth;
uniform sampler2D uDepthHalf;
uniform sampler2D uSSR;
uniform vec2 uTexelHalf;
uniform float uSSRStrength;
layout(location=0) out vec4 oColor;
void main(){
  vec3 scene = texture(uScene, vUV).rgb;
  float d = texture(uDepth, vUV).r;

  // Reflejos: se suman antes de la niebla, que es donde corresponde.
  if(uSSRStrength > 0.0){
    vec4 ssr = texture(uSSR, vUV);
    scene += ssr.rgb * ssr.a * uSSRStrength;
  }

  // Elige entre los 4 téxeles de baja resolución el de profundidad más cercana,
  // para no sangrar niebla sobre las siluetas.
  vec2 base = vUV;
  vec4 acc = vec4(0.0);
  float bestW = 0.0;
  for(int y=-1;y<=1;y++){
    for(int x=-1;x<=1;x++){
      vec2 uv = base + vec2(float(x), float(y)) * uTexelHalf;
      float dh = texture(uDepthHalf, uv).r;
      float w = 1.0 / (1e-4 + abs(dh - d) * 400.0);
      acc += texture(uVolume, uv) * w;
      bestW += w;
    }
  }
  vec4 vol = acc / max(bestW, 1e-5);
  oColor = vec4(scene * vol.a + vol.rgb, 1.0);
}`;

  // ------------------------------------------------- reflejos de pantalla
  // Marcha del rayo reflejado contra el búfer de profundidad. Es lo que hace
  // que el blindaje, el visor y el cristal devuelvan el entorno en vez de un
  // cielo prefiltrado plano. Donde el rayo se escapa de pantalla, el resultado
  // se desvanece y queda el IBL que ya calculó el pase opaco.
  const SSR_FS = /* glsl */`
#include <common>
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uDepth;
uniform sampler2D uNormalRough;
uniform sampler2D uSpecular;
uniform mat4  uProj;
uniform mat4  uInvProj;
uniform mat4  uView;
uniform vec2  uResolution;
uniform float uFrame;
uniform float uMaxRoughness;
layout(location=0) out vec4 oColor;

vec3 viewFromDepth(vec2 uv, float d){
  vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 v = uInvProj * ndc;
  return v.xyz / v.w;
}

#ifndef SSR_STEPS
#define SSR_STEPS 24
#endif

void main(){
  float rough = texture(uNormalRough, vUV).a;
  vec3 f0 = texture(uSpecular, vUV).rgb;
  float d = texture(uDepth, vUV).r;

  // Superficies rugosas no devuelven un reflejo nítido: no vale la pena
  // marchar por ellas, y el ruido resultante sería peor que el IBL.
  if(d >= 1.0 || rough > uMaxRoughness){ oColor = vec4(0.0); return; }

  vec3 P = viewFromDepth(vUV, d);
  vec3 Nw = normalize(texture(uNormalRough, vUV).xyz * 2.0 - 1.0);
  vec3 N = normalize((uView * vec4(Nw, 0.0)).xyz);
  vec3 V = normalize(P);
  vec3 R = reflect(V, N);

  // Rayos que vuelven hacia la cámara no tienen nada que muestrear.
  if(R.z > -0.02){ oColor = vec4(0.0); return; }

  float NoV = saturate(dot(N, -V));
  // Fresnel de Schlick: el reflejo domina en los ángulos rasantes.
  vec3 fresnel = f0 + (max(vec3(1.0 - rough), f0) - f0) * pow5(1.0 - NoV);

  float stepLen = 0.35;
  float jitter = hash12(gl_FragCoord.xy + uFrame * 5.31);
  vec3 hitColor = vec3(0.0);
  float hitMask = 0.0;

  vec3 pos = P;
  for(int i = 0; i < SSR_STEPS; i++){
    // Paso creciente: cerca hace falta precisión, lejos alcance.
    pos += R * stepLen * (1.0 + float(i) * 0.22) * (i == 0 ? (0.5 + jitter) : 1.0);
    vec4 clip = uProj * vec4(pos, 1.0);
    if(clip.w <= 0.0) break;
    vec2 uv = (clip.xy / clip.w) * 0.5 + 0.5;
    if(uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;

    float sd = texture(uDepth, uv).r;
    if(sd >= 1.0) continue;
    vec3 sampleP = viewFromDepth(uv, sd);
    float diff = sampleP.z - pos.z;

    // Ventana de espesor proporcional al paso: sin ella el rayo atraviesa
    // superficies finas o se engancha con siluetas lejanas.
    float thickness = stepLen * (1.0 + float(i) * 0.22) * 2.2 + 0.15;
    if(diff > 0.0 && diff < thickness){
      // Refinado binario: sin esto el reflejo queda escalonado.
      vec3 a = pos - R * stepLen * (1.0 + float(i) * 0.22);
      vec3 b = pos;
      for(int k = 0; k < 4; k++){
        vec3 mid = (a + b) * 0.5;
        vec4 c2 = uProj * vec4(mid, 1.0);
        vec2 uv2 = (c2.xy / c2.w) * 0.5 + 0.5;
        float sd2 = texture(uDepth, uv2).r;
        vec3 sp2 = viewFromDepth(uv2, sd2);
        if(sp2.z - mid.z > 0.0) b = mid; else a = mid;
      }
      vec4 c3 = uProj * vec4(b, 1.0);
      uv = (c3.xy / c3.w) * 0.5 + 0.5;

      hitColor = texture(uScene, uv).rgb;
      // Desvanecido en los bordes de pantalla: si no, el reflejo se corta seco
      // en cuanto el rayo sale del encuadre.
      vec2 edge = smoothstep(vec2(0.0), vec2(0.14), uv)
                * (1.0 - smoothstep(vec2(0.86), vec2(1.0), uv));
      hitMask = edge.x * edge.y;
      // Los rayos que apuntan hacia la cámara delatan el truco: se atenúan.
      hitMask *= saturate(-R.z * 2.2);
      break;
    }
  }

  oColor = vec4(hitColor * fresnel, hitMask * (1.0 - rough / uMaxRoughness));
}`;

  // ------------------------------------------------------------------- bloom
  const BLOOM_PREFILTER_FS = /* glsl */`
#include <common>
#include <tonemap>
in vec2 vUV;
uniform sampler2D uTex;
uniform float uThreshold;
uniform float uSoftKnee;
layout(location=0) out vec4 oColor;
void main(){
  vec3 c = texture(uTex, vUV).rgb;
  float br = max(c.r, max(c.g, c.b));
  float knee = uThreshold * uSoftKnee + 1e-5;
  float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-5);
  // Karis average: evita que un solo píxel muy brillante genere parpadeo.
  float w = 1.0 / (1.0 + luminance(c));
  oColor = vec4(c * contrib * w * (1.0 + luminance(c)), 1.0);
}`;

  const DOWNSAMPLE_FS = /* glsl */`
#include <common>
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uTexel;
layout(location=0) out vec4 oColor;
void main(){
  // Filtro de 13 taps de Jimenez (Call of Duty): estable, sin aliasing.
  vec3 a = texture(uTex, vUV + uTexel * vec2(-2.0,  2.0)).rgb;
  vec3 b = texture(uTex, vUV + uTexel * vec2( 0.0,  2.0)).rgb;
  vec3 c = texture(uTex, vUV + uTexel * vec2( 2.0,  2.0)).rgb;
  vec3 d = texture(uTex, vUV + uTexel * vec2(-2.0,  0.0)).rgb;
  vec3 e = texture(uTex, vUV).rgb;
  vec3 f = texture(uTex, vUV + uTexel * vec2( 2.0,  0.0)).rgb;
  vec3 g = texture(uTex, vUV + uTexel * vec2(-2.0, -2.0)).rgb;
  vec3 h = texture(uTex, vUV + uTexel * vec2( 0.0, -2.0)).rgb;
  vec3 i = texture(uTex, vUV + uTexel * vec2( 2.0, -2.0)).rgb;
  vec3 j = texture(uTex, vUV + uTexel * vec2(-1.0,  1.0)).rgb;
  vec3 k = texture(uTex, vUV + uTexel * vec2( 1.0,  1.0)).rgb;
  vec3 l = texture(uTex, vUV + uTexel * vec2(-1.0, -1.0)).rgb;
  vec3 m = texture(uTex, vUV + uTexel * vec2( 1.0, -1.0)).rgb;
  vec3 r = e * 0.125;
  r += (a + c + g + i) * 0.03125;
  r += (b + d + f + h) * 0.0625;
  r += (j + k + l + m) * 0.125;
  oColor = vec4(r, 1.0);
}`;

  const UPSAMPLE_FS = /* glsl */`
#include <common>
in vec2 vUV;
uniform sampler2D uTex;      // mip menor
uniform sampler2D uPrev;     // mip mayor a acumular
uniform vec2 uTexel;
uniform float uRadius;
layout(location=0) out vec4 oColor;
void main(){
  // Filtro tienda 3x3: reconstrucción suave sin cuadrícula.
  vec2 o = uTexel * uRadius;
  vec3 s = texture(uTex, vUV + vec2(-o.x,  o.y)).rgb * 1.0;
  s += texture(uTex, vUV + vec2( 0.0,  o.y)).rgb * 2.0;
  s += texture(uTex, vUV + vec2( o.x,  o.y)).rgb * 1.0;
  s += texture(uTex, vUV + vec2(-o.x,  0.0)).rgb * 2.0;
  s += texture(uTex, vUV).rgb * 4.0;
  s += texture(uTex, vUV + vec2( o.x,  0.0)).rgb * 2.0;
  s += texture(uTex, vUV + vec2(-o.x, -o.y)).rgb * 1.0;
  s += texture(uTex, vUV + vec2( 0.0, -o.y)).rgb * 2.0;
  s += texture(uTex, vUV + vec2( o.x, -o.y)).rgb * 1.0;
  s /= 16.0;
  oColor = vec4(texture(uPrev, vUV).rgb + s, 1.0);
}`;

  // --------------------------------------------------------------------- TAA
  const TAA_FS = /* glsl */`
#include <common>
#include <tonemap>
in vec2 vUV;
uniform sampler2D uCurrent;
uniform sampler2D uHistory;
uniform sampler2D uVelocity;
uniform sampler2D uDepth;
uniform vec2  uTexel;
uniform float uBlend;
uniform float uReset;
layout(location=0) out vec4 oColor;

// Tonemap reversible para promediar en un espacio perceptual (Karis).
vec3 tm(vec3 c){ return c / (1.0 + luminance(c)); }
vec3 itm(vec3 c){ return c / max(1.0 - luminance(c), 1e-4); }

void main(){
  vec3 current = tm(texture(uCurrent, vUV).rgb);

  // Dilatación de velocidad: toma la del fragmento más cercano del vecindario,
  // así los bordes en movimiento no dejan estela.
  float bestDepth = 1.0;
  vec2 bestUV = vUV;
  for(int y=-1;y<=1;y++){
    for(int x=-1;x<=1;x++){
      vec2 uv = vUV + vec2(float(x), float(y)) * uTexel;
      float d = texture(uDepth, uv).r;
      if(d < bestDepth){ bestDepth = d; bestUV = uv; }
    }
  }
  vec2 vel = texture(uVelocity, bestUV).rg;
  vec2 histUV = vUV - vel;

  if(uReset > 0.5 || histUV.x < 0.0 || histUV.x > 1.0 || histUV.y < 0.0 || histUV.y > 1.0){
    oColor = vec4(itm(current), 1.0);
    return;
  }

  // Caja de vecindario para acotar el historial (anti-ghosting).
  vec3 nmin = vec3( 1e9), nmax = vec3(-1e9), m1 = vec3(0.0), m2 = vec3(0.0);
  for(int y=-1;y<=1;y++){
    for(int x=-1;x<=1;x++){
      vec3 c = tm(texture(uCurrent, vUV + vec2(float(x), float(y)) * uTexel).rgb);
      nmin = min(nmin, c); nmax = max(nmax, c);
      m1 += c; m2 += c * c;
    }
  }
  // Acotado por varianza: más tolerante que el min/max puro, menos parpadeo.
  vec3 mean = m1 / 9.0;
  vec3 sigma = sqrt(max(m2 / 9.0 - mean * mean, vec3(0.0)));
  vec3 vmin = max(nmin, mean - sigma * 1.25);
  vec3 vmax = min(nmax, mean + sigma * 1.25);

  vec3 history = tm(texture(uHistory, histUV).rgb);
  history = clamp(history, vmin, vmax);

  // Menos peso al historial cuando hay movimiento rápido en pantalla.
  float speed = length(vel / uTexel);
  float blend = mix(uBlend, 0.5, saturate(speed / 45.0));

  vec3 result = mix(history, current, blend);
  oColor = vec4(itm(result), 1.0);
}`;

  // ------------------------------------------------------ cadena final de cámara
  const COMPOSITE_FS = /* glsl */`
#include <common>
#include <tonemap>
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uExposure;
uniform float uBloomStrength;
uniform float uTime;
uniform float uVignette;
uniform float uGrain;
uniform float uChromatic;
uniform float uDistortion;
uniform vec3  uLift;
uniform vec3  uGamma;
uniform vec3  uGain;
uniform float uSaturation;
uniform float uDamageFlash;
uniform float uCorruption;   // absorción precursora: aberración del visor
uniform float uSharpen;
uniform vec2  uTexel;
uniform vec2  uResolution;
layout(location=0) out vec4 oColor;

// Distorsión de barril de la lente física (24/35/85 mm comparten modelo).
vec2 lensDistort(vec2 uv, float k){
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  return 0.5 + c * (1.0 + k * r2 + k * k * r2 * r2 * 0.35);
}

void main(){
  vec2 uv = lensDistort(vUV, uDistortion);

  // Aberración cromática: nula en el centro del encuadre (regla de legibilidad
  // del doc de dirección gráfica), creciente hacia el borde.
  vec2 dir = uv - 0.5;
  float r = length(dir) * 2.0;
  float ca = uChromatic * r * r * (1.0 + uCorruption * 3.0);
  vec3 color;
  color.r = texture(uScene, uv + dir * ca * 0.0035).r;
  color.g = texture(uScene, uv).g;
  color.b = texture(uScene, uv - dir * ca * 0.0035).b;

  // Realce de contraste local (contrast-adaptive sharpening). El TAA integra
  // varios frames y eso ablanda la imagen; esto devuelve el filo sin generar
  // los halos de un unsharp mask clásico.
  if(uSharpen > 0.001){
    vec3 n = texture(uScene, uv + vec2(0.0, -uTexel.y)).rgb;
    vec3 sS = texture(uScene, uv + vec2(0.0, uTexel.y)).rgb;
    vec3 e = texture(uScene, uv + vec2(uTexel.x, 0.0)).rgb;
    vec3 w = texture(uScene, uv + vec2(-uTexel.x, 0.0)).rgb;
    vec3 mn = min(color, min(min(n, sS), min(e, w)));
    vec3 mx = max(color, max(max(n, sS), max(e, w)));
    // El peso se adapta al contraste local: zonas planas no se tocan, así el
    // ruido del grano y del cielo no se amplifica.
    vec3 amp = sqrt(saturate(min(mn, 2.0 - mx) / max(mx, 1e-4)));
    vec3 wgt = -amp * (uSharpen * 0.2);
    vec3 sum = (n + sS + e + w) * wgt + color;
    color = max(sum / (1.0 + 4.0 * wgt), vec3(0.0));
  }

  vec3 bloom = texture(uBloom, uv).rgb;
  color += bloom * uBloomStrength;

  // Exposición fotográfica, luego curva ACES.
  color *= uExposure;
  color *= 1.0 + uDamageFlash * vec3(1.6, 0.35, 0.25);
  color = tonemapACES(color);

  // Gradación lift/gamma/gain — el "LUT por planeta".
  color = saturate(color * uGain + uLift);
  color = pow(max(color, vec3(1e-5)), uGamma);
  float lum = luminance(color);
  color = mix(vec3(lum), color, uSaturation);

  // Viñeteado de lente (coseno cuarta ley), suave.
  float vig = 1.0 - uVignette * r * r * 0.55;
  color *= saturate(vig);

  // Grano de película con respuesta por luminancia: más visible en sombras.
  float g = hash12(gl_FragCoord.xy + fract(uTime) * 917.0) - 0.5;
  color += g * uGrain * (1.0 - smoothstep(0.0, 0.75, lum));

  // Eco precursor: fantasma geométrico cuando la absorción es alta.
  if(uCorruption > 0.01){
    vec2 ghostUV = 0.5 + (uv - 0.5) * (1.0 - 0.06 * uCorruption);
    vec3 ghost = texture(uScene, ghostUV).rgb;
    color += ghost * uCorruption * 0.06 * vec3(0.5, 0.7, 1.0);
  }

  color = linearToSRGB(saturate(color));
  // Dither final contra el banding de 8 bits.
  color += (hash12(gl_FragCoord.yx * 1.37) - 0.5) / 255.0;
  oColor = vec4(color, 1.0);
}`;

  EV.PostShaders = {
    FS_VS, SSAO_FS, BLUR_FS, VOLUMETRIC_FS, VOL_UPSAMPLE_FS, SSR_FS,
    BLOOM_PREFILTER_FS, DOWNSAMPLE_FS, UPSAMPLE_FS, TAA_FS, COMPOSITE_FS,
  };
})(window.EV = window.EV || {});
