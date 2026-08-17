# 11 — Arquitectura técnica

## Motor y base

**Unreal Engine 5**, rama propia con integraciones al día. Decisiones
estructurales:

- **C++ para todos los sistemas** (combate, traje, térmica, IA de titán,
  streaming, red). Blueprints solo para composición de nivel y prototipado; nada
  de lógica de gameplay crítica en Blueprint en la build final.
- **Gameplay Ability System** para verbos de núcleo, efectos de estado y costos
  térmicos. Es lo que permite que las modulaciones de poder sean datos y no
  código.
- **Mass Entity** para fauna, debris persistente y multitudes de los hubs.
- **State Trees** para la IA de titanes: cada rutina de purga, cada fase y cada
  transición es un nodo inspeccionable, no una máquina de estados escondida.

## Mundo y streaming

**World Partition** con celdas de tamaño mixto: celdas grandes para exterior
planetario, celdas chicas para interiores densos. Encima:

- **HLOD de varios niveles** hasta la silueta planetaria completa. Un planeta
  visto desde órbita es su propio HLOD; a medida que descendés se sustituye por
  capas sucesivas sin pop.
- **Data Layers** para el estado del mundo: clima, progreso de cadena, antenas
  desplegadas, destrucción persistente de arena.
- **One File Per Actor** para que un equipo grande pueda trabajar el mismo mapa
  sin bloqueo de archivos.
- **PCG** para la distribución de detalle (rocas, cristal, chatarra) sobre
  composición hecha a mano. La regla: **la silueta y el layout son a mano, el
  relleno es procedural**. Nunca al revés.

## El descenso continuo

El pilar de "sin tiempos de carga" resuelto:

1. **Origin rebasing** con precisión doble en el nivel de simulación: el mundo se
   recentra sobre el jugador para evitar pérdida de precisión de coma flotante a
   escala planetaria.
2. **Representación en tres escalas** por planeta — esfera orbital, terreno
   regional, terreno de gameplay — con cross-fade por distancia dentro del mismo
   nivel, no como transición de mapa.
3. **Precarga por vector**: el sistema de streaming lee tu velocidad y tu vector
   de descenso y prioriza I/O hacia donde vas a estar en 8 segundos.
4. **Plasma de reentrada como cobertura**: la fase de mayor densidad de partículas
   coincide con la ventana de carga más pesada. Es diseño y es truco de ingeniería
   al mismo tiempo, y es honesto: si el I/O se atrasa, el plasma dura un poco más.

Objetivo duro: **de órbita a bota en la arena en una sola toma, sin fundido a
negro, sin pop de LOD visible.**

## Almacenamiento e I/O

- SSD NVMe requerido (es requisito, no recomendación).
- **Descompresión por GPU** para texturas y geometría Nanite.
- Presupuesto de streaming: **≤ 350 MB/s sostenido**, con picos de 900 MB/s
  tolerados durante descenso.
- Tamaño estimado de instalación: **140–180 GB** con paquete de texturas de alta
  resolución opcional aparte.

## Red — hubs

La campaña es single player; solo los hubs son en red.

- **Servidor dedicado por instancia de hub**, autoritativo, hasta 32 jugadores.
- **Relevancia por distancia** para movimiento, animación y voz.
- **Voz por SFU** con codec de banda ancha, mezclada en cliente para poder
  aplicar la cadena espacial (oclusión, reverb) localmente.
- **Sin estado de gameplay crítico en el servidor**: el hub no puede afectar tu
  progreso de campaña. Eso elimina de raíz una clase entera de exploits y hace
  que el modo offline sea trivialmente equivalente.
- **Guardado en la nube opcional**, con guardado local como fuente de verdad.

## Rendimiento y validación

- **Presupuesto de frame** por sistema, verificado en CI. Ver
  [09.10](09-direccion-grafica.md#910-presupuesto-de-frame-objetivo-consola-base-modo-calidad).
- **Recorridos automatizados** nocturnos por cada región, capturando frame time,
  picos de I/O, hitches y comparación perceptual de imagen contra referencia.
- **Umbral de hitch: cero frames > 33 ms** en recorrido normal. Un hitch es un
  bug de prioridad alta, no una métrica a "mejorar".
- **Memoria**: 12 GB de presupuesto de VRAM en consola base, con reporte por
  categoría (texturas, Nanite, VSM, Lumen, Niagara) y alertas por regresión.

## Herramientas

- **Editor con perfilado en vivo**: cualquier artista ve el costo en ms de lo que
  acaba de poner en la escena, sin pedirle nada a un ingeniero.
- **Comparador de path tracing** integrado: un botón para renderizar la escena
  actual con path tracer y comparar contra Lumen. Es la herramienta que mantiene
  la iluminación honesta.
- **Rejilla de validación de assets** en importación: presupuesto de triángulos
  de fuente, densidad de texel, cantidad de materiales, presencia de colisión.
  Lo que no cumple, no entra.
