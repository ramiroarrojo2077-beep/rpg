# Ecos del Vacío

**Género:** Action-RPG de ciencia ficción dura y exploración espacial
**Motor:** Unreal Engine 5
**Perspectiva:** Tercera persona
**Plataformas objetivo:** PC (DX12), PS5 / PS5 Pro, Xbox Series X|S
**Modo:** Campaña individual + hubs sociales persistentes (chat de voz por proximidad)

---

## Pitch en una línea

Sos el último tripulante operativo de una expedición pionera que se rompió al
cruzar una anomalía. Varado en un sistema solar sin catalogar, tenés que
sobrevivir, reconstruir tu nave insignia y entender qué civilización dejó
ruinas tecnológicas flotando en la órbita de estos planetas — mientras cazás
titanes biomecánicos y absorbés su núcleo de energía para volverte capaz de
enfrentar lo que viene después.

## Los cinco pilares

1. **Fidelidad visual sin cortes.** Fotorrealismo de grado cinematográfico,
   cinemáticas que transicionan a gameplay sin pantallas de carga, calidad
   gráfica constante entre cutscene y control del jugador.
2. **Escala colosal.** Peleas contra entidades biomecánicas gigantescas donde
   el entorno se destruye alrededor tuyo y el propio cuerpo del titán es el
   terreno de juego.
3. **Progresión por absorción.** Cada titán derrotado cede parte de su núcleo:
   poderes que reescriben tu estilo de pelea y habilitan las dificultades
   altas y la nueva partida+.
4. **Exploración lógica, no guiada.** Mundo semi-abierto con secuencias
   causales: asegurás una colina, plantás la antena, y recién ahí el mapa te
   marca los recursos. Saltearte pasos te deja en zonas de alto nivel sin las
   herramientas para sobrevivirlas.
5. **Hubs sociales de bajada de ritmo.** Estaciones neutrales donde el juego
   cambia de tempo: voz por proximidad, escuadrones, y mostrar la armadura que
   fabricaste.

## Documentación

| Documento | Contenido |
|---|---|
| [01 — Visión y pilares](docs/01-vision-y-pilares.md) | Fantasía de jugador, tono, referencias, antipilares |
| [02 — Narrativa y worldbuilding](docs/02-narrativa-y-worldbuilding.md) | Trama, la anomalía, los Precursores, estructura de actos |
| [03 — Jugabilidad y bucles](docs/03-jugabilidad-y-bucles.md) | Loop momento a momento, sesión y campaña; supervivencia y crafteo |
| [04 — Combate y titanes](docs/04-combate-y-titanes.md) | Sistema de combate, esquive, roster de titanes, destrucción |
| [05 — Progresión y habilidades](docs/05-progresion-y-habilidades.md) | Núcleos, árbol de traje, builds, dificultades, NG+ |
| [06 — Exploración y misiones](docs/06-exploracion-y-mision.md) | Cadenas causales, señalización sin marcadores, gating por conocimiento |
| [07 — Mundo, planetas y clima](docs/07-mundo-planetas-y-clima.md) | Sistema solar, biomas, clima dinámico y su efecto mecánico |
| [08 — Hubs y sistemas sociales](docs/08-hubs-y-social.md) | Estaciones neutrales, voz por proximidad, escuadrones, moderación |
| [09 — **Dirección gráfica y pipeline de render**](docs/09-direccion-grafica.md) | **Lo más profundo del documento: cómo se logran los mejores gráficos posibles** |
| [10 — Audio](docs/10-audio.md) | Acústica del vacío, música adaptativa, voz por proximidad |
| [11 — Arquitectura técnica](docs/11-arquitectura-tecnica.md) | Streaming sin cargas, World Partition, red, presupuestos de performance |
| [12 — UX, UI y accesibilidad](docs/12-ux-ui-y-accesibilidad.md) | HUD diegético, legibilidad en combate, accesibilidad |
| [13 — Producción y riesgos](docs/13-produccion-y-riesgos.md) | Alcance, fases, equipo, riesgos y mitigaciones |

## Vertical slice jugable

`game/` contiene una implementación **jugable y verificada** del primer
encuentro: Kether-3, el despliegue de la antena y la caza de El Barrenador.
Motor propio en WebGL2, sin dependencias ni assets — terreno, criaturas, cielo y
audio se generan en tiempo de ejecución.

```bash
cd game && npx http-server -p 8080 .
```

O el archivo único: `game/dist/ecos-del-vacio.html`.

Implementa la cadena causal sin marcadores, el calor como recurso único, el
titán como terreno escalable por anclajes, y el clima con consecuencia mecánica.

**Cinco personajes animados** —el jugador y cuatro supervivientes de la
Meridiano— con esqueleto de 19 huesos, malla con piel generada por código y 17
clips de animación mezclados por slerp. Se exportan a **glTF 2.0 binario** con
`node tools/export-gltf.mjs`, listos para abrir en Blender o three.js.

El pipeline de render (sombras en cascada y de contacto, PBR con IBL
atmosférico, SSAO, volumétricos con prueba de sombra, luces puntuales,
partículas, bloom, TAA y cadena de cámara con ACES) está documentado en
[`game/README.md`](game/README.md). 43 pruebas automatizadas cubren el bucle de
misión completo, la máquina de estados de animación y los assets exportados.

## Estado

Documentos de diseño completos. Vertical slice en el navegador funcionando. El
juego descrito en los documentos —UE5, fotorrealismo, seis planetas— es un
proyecto de otra escala; ver [13 — Producción y riesgos](docs/13-produccion-y-riesgos.md).
