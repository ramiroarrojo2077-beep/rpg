# Ecos del Vacío — vertical slice jugable

Implementación jugable del primer encuentro del juego descrito en
[`docs/`](../docs): **Kether-3, el despliegue de la antena y la caza de El
Barrenador**. Motor propio en WebGL2, sin dependencias, sin assets externos —
todo (terreno, criaturas, cielo, audio) se genera en tiempo de ejecución.

## Cómo jugarlo

```bash
cd game
npx http-server -p 8080 .      # cualquier servidor estático sirve
# abrir http://localhost:8080
```

O directamente el archivo único empaquetado: `dist/ecos-del-vacio.html`
(198 KB, se abre sin servidor).

### Controles

| Acción | Tecla |
|---|---|
| Moverse | `WASD` |
| Mirar | ratón |
| Correr / sostenerse al titán | `Shift` |
| Esquivar (impulso de maniobra) | `Ctrl` o clic derecho |
| Saltar · propulsor | `Espacio` (mantener) |
| Disparar | clic izquierdo |
| Gancho / interactuar | `E` |
| Recargar | `R` |
| Fractura (tras absorber el núcleo) | `F` |
| HUD extendido | `H` |
| Modo foto | `P` |
| Pausa | `Esc` |

### Parámetros de URL

`?q=ultra|alto|medio|bajo|minimo` fuerza el preset · `?seed=1337` cambia el
planeta · `?taa=0` desactiva el TAA.

## Qué está implementado del documento de diseño

| Pilar del GDD | En la slice |
|---|---|
| Exploración causal, sin marcadores | La cadena colina → antena → recursos. El titán no existe hasta que la antena lo despierta. Nunca hay un marcador de objetivo, sólo el registro de expedición en lenguaje de razonamiento. |
| El calor como recurso único | Un solo medidor alimenta propulsor, esquive, arma y Fractura. Saturarlo bloquea el traje 1,9 s. |
| Batallas a escala colosal | El Barrenador mide ~36 m, camina con marcha procedural e IK de dos huesos sobre el terreno real, y se pelea en tres fases. |
| El enemigo como terreno | Se escala por anclajes que existen físicamente en la malla: pata → cadera → lomo. Desde el suelo el blindaje casi no cede (3,5 de daño); desde arriba, 26. |
| Progresión por absorción | Romper las cinco placas expone el núcleo. Tres ciclos lo matan. La absorción desbloquea **Fractura** y sube la corrupción, que altera el post-proceso. |
| Clima con efecto mecánico | La tormenta de cristal sube la turbidez atmosférica, espesa los volumétricos y reduce la visibilidad a metros — el titán se vuelve una silueta. |
| El traje como narrador | Ventilación que sube de tono con el calor, respiración que se acelera al perder integridad, dron precursor que aparece cerca del titán. Todo sintetizado con WebAudio. |

## Pipeline de render

Ocho pases por frame, todos en `src/70-renderer.js`:

1. **Sombras en cascada** — 3 niveles, ajuste por esfera envolvente y snap a
   téxel (sin hormigueo al girar la cámara), muestreo Poisson de 12 taps con
   rotación por píxel.
2. **Prepase** — normal + rugosidad + velocidad + profundidad. Da early-Z exacto
   al pase opaco (que usa `LEQUAL` con `invariant gl_Position`).
3. **SSAO** a media resolución + desenfoque bilateral guiado por profundidad.
4. **Opaco hacia adelante** — PBR Cook-Torrance GGX con Smith height-correlated
   y difuso Burley; IBL especular desde los mips del cubemap de cielo e
   irradiancia difusa por convolución coseno.
5. **Volumétricos** — raymarch con prueba de sombra por paso, jitter temporal.
6. **Bloom** — cadena de mips con filtro de 13 taps y reconstrucción tienda.
7. **TAA** — jitter Halton, dilatación de velocidad y acotado por varianza.
8. **Cadena de cámara** — lente física, ACES, gradación lift/gamma/gain, grano.

### La atmósfera es la fuente de verdad de la iluminación

Una sola simulación de dispersión (Rayleigh + Mie + una capa de polvo a ras de
suelo, propia de Kether-3) alimenta el fondo, el IBL especular, la irradiancia
difusa y la perspectiva aérea. Nada está horneado: mover el sol cambia toda la
iluminación de la escena.

Dos decisiones que costaron encontrar y vale la pena documentar:

- **Los pasos del raymarch son logarítmicos, no uniformes ni polinómicos.** La
  densidad cae exponencialmente con la altura, así que la dispersión ocurre en
  los primeros kilómetros. Con pasos uniformes sobre un rayo rasante de 300 km,
  el primer paso ya cae por encima de la capa densa y el horizonte sale negro.
  Una distribución polinómica lo arregla a medias pero su forma depende del
  largo total del rayo, que salta de ~70 km a ~800 km al cruzar el horizonte —
  y ese salto se ve como una banda. El espaciado logarítmico es invariante de
  escala y no tiene ninguno de los dos problemas.
- **El polvo es una especie de dispersión, no un multiplicador de opacidad.** El
  primer intento atenuaba el suelo lejano con un `exp(-d·k)` ad hoc: quitaba el
  suelo pero no aportaba la luz que ese polvo dispersa, y dejaba una banda
  oscura en el horizonte. Modelado como una tercera especie con su propia altura
  de escala y función de fase, la extinción y la luz dispersa quedan
  consistentes y el horizonte cierra solo.

### El mundo llega al horizonte

El terreno jugable es de 1400 m, pero un anillo radial de campo lejano lo
continúa hasta 25 km con espaciado exponencial y curvatura del planeta restada.
Sin él, entre el borde del terreno y el horizonte geométrico aparecía una franja
plana. El pilar de escala masiva pide que lo que se ve en el horizonte sea
geometría real.

## Presets de calidad

Todo lo que cuesta milisegundos es un `#define` de shader, así que bajar calidad
recompila más barato en vez de ramificar en tiempo de ejecución.

| Preset | Sombra | Taps | SSAO | Volumétrico |
|---|---|---|---|---|
| `ultra` | 2048² | 12 | 16 | 32 pasos |
| `alto` (defecto en GPU) | 2048² | 12 | 12 | 24 pasos |
| `medio` | 1024² | 8 | 8 | 16 pasos |
| `bajo` | 768² | 4 | 6 | 10 pasos |
| `minimo` (defecto en SwiftShader) | 512² | 1 | 4 | 6 pasos |

El preset se elige solo sondeando el renderer real: si detecta rasterizado por
CPU (SwiftShader, llvmpipe) baja a `minimo`, donde si no serían segundos por
frame.

## Pruebas

```bash
npm i playwright          # si no está disponible en el entorno
node tests/loop-test.mjs http://localhost:8080/index.html?q=minimo
```

Recorre la cadena de misión completa con paso de tiempo fijo (independiente del
framerate) y comprueba 28 invariantes: progresión de objetivos, marcha y apoyo
de las patas sobre el terreno, resistencia del blindaje desde el suelo frente a
desde arriba, escalada por anclajes, ciclos de núcleo, sistema térmico,
i-frames del esquive, muerte y reaparición, y el efecto de la tormenta sobre la
atmósfera.

`tests/screenshot.mjs` levanta el juego, ejecuta un script de posicionamiento
opcional y captura — es lo que se usó para verificar cada cambio visual.

## Estructura

```
src/00-math.js         vec3 / mat4, amortiguación independiente del framerate
src/10-gl.js           capa fina sobre WebGL2: programas, FBOs, VAOs
src/20-noise.js        simplex sembrado: el planeta es siempre el mismo
src/30-shaders.js      chunks GLSL: atmósfera, PBR, sombras, ACES
src/40-sky.js          cielo a cubemap + IBL difuso y especular
src/45-terrain.js      dunas de Kether-3, consulta de altura en CPU, campo lejano
src/50-geometry.js     primitivas y grafo de nodos
src/52-props.js        cristales y chatarra instanciados
src/60-shaders-geo.js  shaders de sombra, prepase y opaco
src/62-shaders-post.js SSAO, volumétricos, bloom, TAA, cadena de cámara
src/70-renderer.js     orquestación del frame
src/72-titan.js        El Barrenador: IK, marcha, fases, blindaje, núcleo
src/74-player.js       traje: inercia, calor, esquive, gancho, escalada
src/80-audio.js        síntesis WebAudio, sin assets
src/85-hud.js          HUD mínimo en el borde del visor
src/90-game.js         misión, combate, clima
src/99-main.js         arranque, entrada, cámara, bucle
```

## Alcance honesto

Esto es una vertical slice de una región y un titán, con motor propio en el
navegador. **No** es el juego de los documentos de diseño: aquello es Unreal
Engine 5, ~250 personas y cuatro años (ver
[13 — Producción y riesgos](../docs/13-produccion-y-riesgos.md)). Lo que sí
hace es demostrar, corriendo, que los sistemas centrales del diseño encajan:
la cadena causal sin marcadores, el calor como recurso único, el titán como
terreno escalable, y el clima con consecuencia mecánica.
