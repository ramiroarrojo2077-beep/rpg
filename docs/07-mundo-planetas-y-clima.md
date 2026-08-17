# 07 — Mundo, planetas y clima dinámico

## El sistema

Estrella enana naranja sin nombre catalogado. La tripulación la llama **Meridiano
B**. Cinco cuerpos jugables más la anomalía. No es un universo procedural
infinito: son **cinco lugares hechos a mano**, densos, del tamaño de una región
grande de mundo abierto cada uno.

| Cuerpo | Naturaleza | Gravedad | Fantasía visual |
|---|---|---|---|
| **Kether-3** | Desierto de sílice cristalizada | 1.1 g | Dunas de vidrio que refractan el sol; tormentas de arena de cristal que cortan el traje |
| **Sela** | Océano congelado con mares líquidos bajo la corteza | 0.8 g | Placas de hielo del tamaño de provincias, luz que entra por grietas al mar interior |
| **Vhaen-Prime** | Gigante gaseoso con plataformas precursoras | 2.4 g (en plataforma) | Auroras que ocupan el cielo entero; caída libre de kilómetros entre capas de nube |
| **Ossuario** | Luna minada hasta el hueso | 0.2 g | Vacío puro, sin atmósfera, sombras de contraste absoluto; túneles de minería infinitos |
| **Cinturón de Halo** | Escombro orbital + ruinas flotantes | 0 g | Navegación en microgravedad entre restos del tamaño de edificios |
| **La Anomalía** | Estructura precursora | Variable/artificial | Espacio que no obedece: horizontes curvos hacia adentro, gravedad por superficie |

## Clima dinámico: efecto mecánico, no solo visual

El clima **no es un filtro de pantalla**. Cada fenómeno tiene consecuencias
jugables medibles. Regla de diseño: *si el clima cambia lo que ves, tiene que
cambiar lo que hacés.*

### Kether-3 — Tormenta de arena de cristal
- **Visual:** partículas refractivas, niebla volumétrica densa, dispersión de luz
  que convierte el sol en un disco difuso. Visibilidad de 800 m a 25 m.
- **Mecánico:** el escaneo se degrada, el sellado del traje se erosiona
  progresivamente, la fauna se esconde (menos combate) y **los enemigos
  biomecánicos pierden tracking** — la tormenta es cobertura ofensiva.
- **Táctica:** los jugadores aprenden a *esperar* la tormenta para infiltrar.

### Sela — Deshielo y colapso de placas
- **Visual:** fractura de hielo simulada, agua que sube en tiempo real, niebla a
  ras de superficie con luz de sol rasante.
- **Mecánico:** rutas que existían dejan de existir. El mapa de Sela es
  literalmente distinto según el ciclo. Congelación estructural se vuelve verbo
  de navegación, no de combate.

### Vhaen-Prime — Aurora y tormenta magnética
- **Visual:** el evento estrella del juego. Auroras de escala planetaria
  reflejadas en las plataformas metálicas, con iluminación que baña todo el nivel
  y cambia de color a lo largo de minutos.
- **Mecánico:** durante la aurora, **el sustrato precursor se despierta**.
  Mecanismos muertos funcionan, ruinas inaccesibles se abren, y los titanes
  ganan una rutina extra. Es ventana de oportunidad y de peligro simultánea.

### Ossuario — Sin clima, con ciclo solar brutal
- **Visual:** sin atmósfera no hay dispersión: la sombra es negro puro y la luz
  es blanco quemado. El único iluminador en sombra es la luz de rebote y tu
  propia linterna.
- **Mecánico:** térmica invertida — al sol te cocinás, en sombra el traje se
  congela. Toda la travesía es planificar la ruta según dónde va a estar la
  sombra dentro de diez minutos.

### Cinturón de Halo — Deriva orbital
- **Visual:** el escombro se mueve realmente. La geometría de un encuentro rota
  respecto de la estrella y la iluminación gira sobre el jugador.
- **Mecánico:** movimiento newtoniano puro. Impulsás y seguís. El error se paga
  con deriva al vacío.

## Ciclo día/noche

Ciclo real por planeta, con duraciones distintas (Kether-3: 90 min reales;
Ossuario: 6 h reales, o sea que en una sesión el sol prácticamente no se mueve —
y eso es intencional). El sol es la fuente primaria de iluminación global y el
cambio recalcula rebote e irradiancia continuamente. Ver
[09 — Iluminación](09-direccion-grafica.md#iluminación-global-lumen-y-el-plan-de-path-tracing).

## Física de naves

Vuelo newtoniano con asistencia configurable:

- **Modo asistido** (por defecto): el computador de vuelo cancela deriva; se
  siente como un juego de vuelo atmosférico.
- **Modo manual**: seis grados de libertad reales, la inercia manda. Necesario
  para las maniobras de precisión del Cinturón de Halo.
- **Reentrada continua**: órbita → atmósfera → superficie en una toma. Calor de
  casco, plasma, turbulencia, y en el último tramo la niebla volumétrica del
  planeta. Sin corte, sin carga.

## Escala

La escala masiva es un pilar, y se sostiene con reglas concretas:

- **Nada de horizontes falsos.** Lo que ves en el horizonte se puede alcanzar
  (con tiempo). Los hitos son geometría real con LOD extremo, no matte painting.
- **Referencia humana constante.** Siempre hay algo de escala conocida cerca
  (una escotilla, una escalera, un contenedor) para que el cerebro mida lo
  gigante contra algo humano.
- **Distancia de dibujo sin niebla de conveniencia.** La bruma atmosférica es
  física (dispersión real), no un truco para esconder el culling.
