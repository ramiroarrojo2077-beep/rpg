# 06 — Exploración y estructura de misión

## La regla central: causalidad antes que marcador

El mundo no te lleva de la mano. Las misiones no son una lista de coordenadas:
son **cadenas causales** donde cada eslabón habilita al siguiente, y el juego
solo te muestra lo que tu personaje razonablemente podría saber.

Ejemplo canónico (primera hora de Kether-3):

```
El escáner de corto alcance no llega al valle.
   → Necesitás altura y línea de vista.
      → Asegurás la colina (hay una patrulla biomecánica arriba).
         → Desplegás la antena de comunicación.
            → RECIÉN AHORA el mapa marca los depósitos de silicato.
               → Extraés → reparás el reactor auxiliar → salís del planeta.
```

Si vas al valle sin la antena, el valle está ahí: es transitable, es hermoso, y
está lleno de cosas que te matan sin que sepas por qué. El juego no te bloquea
con una pared invisible ni con un cartel de "nivel recomendado 25". Te deja ir.

## Gating por conocimiento, no por llave

Cuatro tipos de barrera, en orden de preferencia:

1. **Conocimiento** (mejor). No sabés que hay que hacer algo. Cuando lo entendés,
   ya podés.
2. **Capacidad.** Te falta un verbo de titán. La barrera es física y legible: la
   grieta es demasiado ancha, el fluido está líquido, la placa no se rompe.
3. **Equipo.** El sellado del traje no aguanta esa atmósfera. Se comunica con
   daño progresivo y aviso claro, no con muerte instantánea.
4. **Amenaza** (último recurso). Hay algo que te va a matar. Ver
   [04 — hueso duro de roer](04-combate-y-titanes.md#el-hueso-duro-de-roer).

**Nunca** hay una puerta que dice "necesitás la llave amarilla".

## Señalización sin iconos

El HUD es mínimo (ver [12](12-ux-ui-y-accesibilidad.md)). La navegación se
resuelve con el mundo:

| Herramienta | Cómo funciona |
|---|---|
| **Silueta** | Cada región tiene un hito visible desde toda su extensión: la torre precursora, el cráter, el titán dormido en el horizonte. Siempre podés orientarte mirando. |
| **Luz** | La iluminación dirige. Los caminos válidos reciben luz de rebote; los callejones están en sombra. Se usa dirección solar y volumétricos, no marcadores. |
| **Antenas** | Cada antena desplegada revela *información*, no íconos: topografía, densidad de recursos, patrullas activas. El mapa se dibuja a medida que construís la red. |
| **Rastros** | Otros supervivientes dejaron campamentos, cables, cadáveres. Seguir chatarra humana siempre lleva a algún lado. |
| **Firma precursora** | Un tono grave audible que sube de frecuencia con la proximidad. Es el único "detector" y es puramente sonoro. |

## Tipos de contenido

- **Cadenas principales** (5, una por acto/región). Terminan en titán.
- **Cadenas de supervivientes** (7). Historia humana, moralmente ambiguas, con
  decisiones que cambian quién está en los hubs.
- **Ruinas precursoras** (~20). Puzzles espaciales sin texto: entender la
  arquitectura *es* el puzzle. Dan sustrato.
- **Anomalías locales** (~30). Eventos emergentes ligados al clima: una tormenta
  descubre algo, una aurora activa un mecanismo dormido.
- **Encuentros de titán menor** (~15). Combate puro, materiales.

## Diseño de región

Cada región cumple el mismo contrato:

- Un **hito** visible desde todos lados.
- Tres **rutas de entrada** con dificultad distinta, ninguna marcada como
  "la correcta".
- Un **atajo** que se abre desde adentro y conecta con el campamento — la
  sensación *Dark Souls* de destrabar el mundo.
- Un **verbo** que la reabre después (contenido que existe desde el día 1 pero
  se alcanza en el acto siguiente).
- Un **peligro climático** propio que cambia cómo se juega según la hora.

## Anti-frustración

Sin sostener la mano, pero sin ser cruel:

- El **registro de expedición** (opcional, en el campamento) resume lo último que
  dijo o dedujo tu personaje, con lenguaje de razonamiento y no de objetivo:
  "la señal se corta al oeste del risco", no "ir a X, Y".
- Si el jugador da vueltas más de ~12 minutos sin progreso en una cadena
  principal, el mundo **empuja suave**: aumenta el rebote de luz en la ruta
  válida, un dron de la Meridiano pasa en esa dirección, sube el volumen de una
  firma. Nunca aparece un marcador.
- Muerte = perdés materiales no consolidados en el punto exacto. Recuperables.
  Sin pérdida permanente de progreso de cadena.
