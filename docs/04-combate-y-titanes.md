# 04 — Combate y titanes

## Filosofía

Combate de acción rápido y fluido en tercera persona, pero **legible**. La regla
de oro: en una pelea contra algo de 90 metros, el jugador siempre tiene que saber
dos cosas — *qué me va a pegar* y *dónde tengo que estar*. Toda la
espectacularidad visual está subordinada a esas dos lecturas.

## Verbos base

| Acción | Detalle |
|---|---|
| **Ataque ligero / pesado** | Arma cinética o de energía; el pesado consume térmica. |
| **Esquive direccional** | ~10 frames de invulnerabilidad + reposicionamiento con impulso. Un esquive perfecto (ventana de 4 frames al inicio del ataque enemigo) devuelve térmica en vez de gastarla. |
| **Anclaje** | Gancho a un punto estructural o a una placa de titán. Es movilidad *y* es cómo subís al enemigo. |
| **Poder de núcleo** | Hasta 3 equipados, cooldown por calor, no por tiempo. |
| **Escaneo táctico** | Marca puntos de anclaje válidos y placas de blindaje comprometidas. Cuesta campo visual. |

**No hay parry.** El personaje es un ingeniero con un traje, no un espadachín.
La defensa es posicional: esquivar, cubrirse detrás de geometría destructible,
o subirse a donde el titán no llega.

## Anatomía de una pelea de titán

Cada titán es un **nivel con patas**. Estructura en tres fases:

### Fase 1 — Aproximación
Estás en el suelo. El titán es un evento climático: sus pasos cambian el
terreno, su sombra te oscurece, su cuerpo bloquea la iluminación global. No le
podés hacer daño significativo desde acá. El objetivo es **llegar**: leer el
patrón de movimiento, esquivar el ataque de área, y encontrar la ventana para
anclar el gancho.

### Fase 2 — Ascenso
Ahora el titán es terreno en movimiento. Escalás usando placas, conductos y
articulaciones mientras la superficie rota, se sacude y trata de sacarte de
encima. Acá el juego es de agarre y timing. El titán tiene **rutinas de purga**:
sacudidas, descargas térmicas, o meter el brazo a barrer su propia espalda.

### Fase 3 — Núcleo
Exponés el núcleo rompiendo blindaje en puntos específicos. Se abre una ventana
corta de daño real. Repetís el ciclo — normalmente 3 o 4 veces — con el titán
cada vez más agresivo y el entorno cada vez más roto. La última fase se pelea
sobre un escenario que ya no es el que empezaste.

## Roster de titanes

| # | Nombre | Planeta | Función original | Verbo que otorga |
|---|---|---|---|---|
| 1 | **El Barrenador** | Kether-3 | Minería de manto profundo | **Fractura** — onda cinética que rompe blindaje y geometría |
| 2 | **La Vigía** | Sela | Regulación de hielo oceánico | **Congelación estructural** — solidifica fluidos y ralentiza masa |
| 3 | **Coral de Vhaen** | Vhaen-Prime | Filtrado atmosférico | **Ascenso** — sustentación prolongada, vuelo real en gravedad baja |
| 4 | **El Sepulturero** | Ossuario | Reciclado de residuo tecnológico | **Recomposición** — convierte chatarra del entorno en escudo o proyectil |
| 5 | **Heliotropo** | Órbita de Vhaen | Captación estelar | **Descarga** — haz sostenido de alto consumo térmico |
| 6 | **El Custodio** | La anomalía | Mantenimiento del archivo | **Eco** — proyecta una copia tuya de un segundo atrás; el poder final |

Además: **titanes menores** (3–5 por región), reutilizables como encuentros de
mundo abierto, sin núcleo pero con materiales estructurales.

## Destrucción del entorno

La destrucción no es decorado: es **estado de la pelea**.

- Cada titán tiene una **arena con capas destructibles**: cobertura, estructura y
  topografía. Cuando la cobertura se acaba, el jugador tiene que cambiar de
  estrategia — el diseño de arena garantiza que la pelea se endurece sola.
- **Chaos Destruction** con fractura pre-computada y jerárquica. Las piezas
  grandes se simulan; el debris chico pasa a un sistema de partículas con
  colisión aproximada después de N segundos, para no matar el presupuesto de CPU.
- Los escombros grandes **quedan** hasta el final del encuentro y son geometría
  navegable y anclable. Rompiste una columna: ahora es una rampa.
- La destrucción alimenta el poder **Recomposición**: el jugador que rompe más
  entorno tiene más munición.

## El "hueso duro de roer"

Por diseño, la exploración fuera de secuencia te puede cruzar con un titán o un
enemigo de élite muy por encima de tu nivel. Reglas para que sea memorable y no
frustrante:

1. **Telegrafía a distancia.** Siempre lo ves o lo oís antes de estar en su
   rango. Nunca aparece de la nada.
2. **La huida siempre es posible.** Los enemigos de sobre-nivel tienen radio de
   desenganche generoso y no te persiguen entre regiones.
3. **Es matable.** Con ejecución excepcional se puede ganar sin el kit
   correspondiente, y el juego lo recompensa con material de secuencia rota.
4. **Deja marca.** Si te mata, el mundo recuerda: tu equipo queda en el lugar y
   tenés que ir a buscarlo.

## Escalado y dificultad en combate

No hay escalado de nivel oculto. Los enemigos tienen valores fijos: la
progresión la sentís porque **vos** cambiaste, no porque el mundo se ablandó.

Ver [05 — Progresión](05-progresion-y-habilidades.md) para dificultades y NG+.
