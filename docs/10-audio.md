# 10 — Audio

## Principio

El audio hace la mitad del trabajo del fotorrealismo. Un frame perfecto con
sonido plano se siente falso; un frame bueno con audio espacial impecable se
siente real. Todo el audio del juego pasa por **una sola cadena espacial**
—incluida la voz de otros jugadores.

## El vacío

La regla física se respeta con criterio dramático:

- **En vacío no hay sonido transmitido por aire.** Lo que oís viene por
  **conducción estructural** (si estás tocando algo), por **el interior del
  traje** (respiración, servos, refrigeración, alarmas) y por **radio**.
- La ausencia se usa como recurso: un titán de 90 metros caminando en Ossuario
  **no hace ruido** hasta que apoya y la vibración te llega por el suelo. Es la
  cosa más inquietante del juego.
- En atmósfera densa (Vhaen-Prime), la propagación es más lenta y grave: ves el
  impacto y el sonido llega un segundo después. Ese retardo está simulado por
  distancia real.

## Cadena espacial

- **HRTF** con binauralización para auriculares, y mezcla objeto-a-objeto para
  sistemas de altavoces.
- **Oclusión y obstrucción por geometría real**, con filtrado por material: una
  mampara de acero no suena igual que un panel de composite.
- **Reverb por convolución** con impulsos por espacio; los interiores de la
  Meridiano tienen respuesta propia por compartimento.
- **Propagación por portales**: el sonido dobla esquinas correctamente, lo que
  hace que la exploración de ruinas se pueda hacer de oído.

## El traje como narrador

Toda la información de estado llega por audio antes que por UI:

| Estado | Sonido |
|---|---|
| Térmica alta | Ventiladores subiendo de tono, luego chirrido metálico |
| Sellado comprometido | Silbido de fuga, direccional — oís *de qué lado* perdés |
| Oxígeno bajo | La respiración cambia de ritmo, sin alarma |
| Absorción de núcleo | Tono grave que se instala y no se va del todo |
| Firma precursora | Frecuencia que sube con la proximidad. Es el único "detector" del juego |

## Música adaptativa

- **Ausencia por defecto.** La exploración es mayormente sin música: viento,
  traje, mundo. Eso hace que cuando entra, pese.
- **Orquesta + electrónica analógica.** Cuerdas graves y sintetizadores modulares
  con imperfección real (deriva de afinación, ruido de circuito).
- **Los titanes tienen tema y estructura**: la música sigue las fases de la pelea
  por estado, no por temporizador. Subir al titán cambia la instrumentación;
  exponer el núcleo agrega el coro.
- **Lo precursor no tiene música: tiene tono.** Drones armónicos derivados de la
  serie de armónicos naturales, sin ritmo, sin melodía. No suena "alienígena":
  suena *matemático*.
- **Los hubs son lo opuesto de todo esto**: música cálida, con instrumentos
  identificables, tocando desde una fuente diegética en la estación.

## Voz por proximidad

Ver [08 — Hubs y social](08-hubs-y-social.md#chat-de-voz-por-proximidad). Lo
técnicamente relevante: la voz de otros jugadores **entra a la misma cadena
espacial** que el resto del audio. Reverb de la sala, oclusión por mamparo,
atenuación por distancia. No es un canal de voz superpuesto: es una persona
hablando en un lugar.

## Accesibilidad de audio

- Subtítulos con **nombre de hablante, dirección y descripción de sonido
  relevante** (ej. "[a tu izquierda: fuga de presión]").
- **Indicador visual de dirección** opcional para eventos críticos, pensado para
  jugadores sordos, sin volverse un radar que quiebre el diseño.
- Mezcla configurable en cinco buses independientes, con presets para
  auriculares, TV, y escucha nocturna con rango dinámico comprimido.
