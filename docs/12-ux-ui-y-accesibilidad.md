# 12 — UX, UI y accesibilidad

## Filosofía de interfaz

**Todo lo que se puede mostrar en el mundo, no va en la pantalla.** El HUD por
defecto es prácticamente inexistente; la información vive en el traje, en el
sonido y en el propio personaje.

| Información | Dónde vive |
|---|---|
| Integridad | Estado visible de la armadura + distorsión del visor |
| Térmica | Anillo tenue en el borde del visor + audio de ventilación |
| Munición | Contador físico en el arma, visible al mirarla |
| Sellado | Indicadores en el antebrazo + silbido direccional |
| Objetivo actual | En ningún lado. Ver [06](06-exploracion-y-mision.md) |
| Salud del titán | En el titán: blindaje que se cae, núcleo que se ve |

Existe un **HUD extendido** opcional con barras clásicas para quien lo prefiera.
No es una opción de accesibilidad escondida: está en la primera pantalla de
opciones, sin juicio.

## Legibilidad en combate

En una pelea con destrucción, volumétricos y un enemigo de 90 metros, la lectura
se garantiza por sistema, no por suerte:

1. **Telegrafía por forma y luz**, nunca por color solo. Cada ataque de titán
   tiene una silueta de anticipación distinta y una fuente de luz propia que se
   enciende antes.
2. **Prioridad de contraste**: el shader del titán sube ligeramente su separación
   tonal del fondo durante la ventana de telegrafía. Es sutil y es la diferencia
   entre justo y frustrante.
3. **Post con guardas**: DOF fuera, bloom con techo, densidad volumétrica local
   reducida. Ver [09.7](09-direccion-grafica.md#guardas-de-legibilidad).
4. **Audio primero**: toda telegrafía tiene señal sonora direccional, así que se
   puede reaccionar aunque el ataque venga de fuera de cámara.

## Cámara

- Tercera persona con hombro configurable, distancia y FOV ajustables.
- **FOV mínimo de 75° en consola**, con opción hasta 110°.
- Bloqueo de objetivo opcional, con dos modos: duro (clásico) y suave (la cámara
  sugiere sin fijar; es el diseñado para titanes, donde fijarse a un punto de un
  cuerpo enorme desorienta).
- **Sacudida de cámara desacoplada** del feedback: se puede reducir o desactivar
  sin perder la información que la sacudida transmitía (se reemplaza por
  vibración y señal sonora).

## Accesibilidad

Tratada como diseño, no como checklist de cumplimiento.

### Visual
- **Modo de contraste alto**: reduce grano, bloom, aberración y densidad de
  volumétricos manteniendo la dirección de arte.
- **Escalado de UI** hasta 200 %, con tipografía de alta legibilidad opcional.
- **Daltonismo**: la información nunca depende de color solo, y aun así hay
  perfiles para deuteranopía, protanopía y tritanopía.
- **Marcador de objetivo opcional** para quien no pueda o no quiera navegar por
  señalización ambiental. Rompe el pilar de exploración a propósito, y está
  disponible igual.

### Auditiva
- Subtítulos con hablante, dirección y descripción de sonidos relevantes.
- **Indicador visual direccional** para eventos críticos.
- Buses de mezcla independientes con presets.

### Motora
- **Remapeo completo**, incluidos sticks y gatillos.
- **Sin pulsaciones repetidas obligatorias** (todo mantener-para-activar se puede
  cambiar a alternar y viceversa).
- Ventanas de entrada ampliables como opción independiente de la dificultad —
  se puede jugar en **Anomalía** con ventanas de esquive de **Expedición**.
- Soporte de dispositivos de accesibilidad de plataforma.

### Cognitiva
- **Registro de expedición** en lenguaje de razonamiento, no de tarea.
- **Modo sin presión de tiempo** para secuencias con cronómetro.
- Cinemáticas con resumen escrito accesible desde el registro.

## Fotografía

Dado el pilar gráfico, el **Modo Foto es una función de primera clase**, no un
extra:

- Cámara libre con límite generoso, control de lente (24/35/50/85 mm), apertura,
  foco manual con asistencia de pico de enfoque.
- Control de hora del día, clima y dirección solar dentro de límites de la escena.
- **Render por path tracing con acumulación progresiva** para captura final. Ver
  [09.2](09-direccion-grafica.md#path-tracing).
- Exportación en alta resolución (hasta 8K) y en HDR.
- Se puede activar durante peleas de titán, en pausa real.
