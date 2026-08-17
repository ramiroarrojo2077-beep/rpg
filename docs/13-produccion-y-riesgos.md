# 13 — Producción y riesgos

> Esta sección es una estimación de referencia, no un plan comprometido. Está
> acá para que el alcance del documento sea honesto: lo descrito en
> [09 — Dirección gráfica](09-direccion-grafica.md) es caro, y conviene decirlo.

## Alcance de contenido

| Elemento | Cantidad |
|---|---|
| Duración campaña principal | 60–80 h |
| Regiones jugables | 6 (5 cuerpos + la anomalía) |
| Titanes con núcleo | 6 |
| Titanes menores | ~15 |
| Hubs | 4 |
| Ruinas precursoras | ~20 |
| Cadenas de supervivientes | 7 |
| Cinemáticas continuas | ~90 min de tiempo de cámara |

## Fases

### Fase 0 — Prototipo de movimiento (3 meses)
Sin arte final. Objetivo: que caminar, impulsarse, engancharse y esquivar se
sientan bien con cubos grises. **Si el movimiento no es divertido acá, nada de lo
demás importa.**

### Fase 1 — Vertical slice (9 meses)
Una región (Kether-3, sector inicial) + un titán (el Barrenador) + un hub
(Ribera), con calidad final de imagen. Entrega obligatoria:
- El descenso continuo desde órbita funcionando sin corte.
- Las tres fases del Barrenador con destrucción persistente.
- 60 fps estables en consola base.
- Comparación contra path tracing dentro del margen definido.

Esta fase es la que valida o mata el pilar gráfico. Nada se escala hasta que la
slice corra en presupuesto.

### Fase 2 — Producción (24 meses)
Regiones restantes, titanes 2–5, red de hubs, sistemas sociales, cadenas de
supervivientes.

### Fase 3 — Acto III y cierre (9 meses)
La anomalía, el Custodio, los tres desenlaces, NG+.

### Fase 4 — Pulido y certificación (6 meses)
Optimización, hitches, PSO, accesibilidad completa, localización, certificación
de plataforma. **No es "el mes que sobra": es una fase con alcance propio.**

## Equipo de referencia (pico)

| Área | Personas |
|---|---|
| Ingeniería (gameplay, render, herramientas, red) | 45 |
| Arte de entorno | 40 |
| Arte de personaje y criaturas | 25 |
| Animación | 25 |
| Diseño (sistemas, niveles, encuentros) | 30 |
| Narrativa | 8 |
| Audio | 12 |
| Tech art | 15 |
| QA | 35 |
| Producción | 15 |
| **Total** | **~250** |

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **60 fps + Lumen HWRT + destrucción no cierran juntos** | Crítico | La vertical slice existe para descubrirlo temprano. Plan B: presupuesto de Lumen recortado en arenas de titán, con destrucción priorizada — la pelea manda sobre el rebote |
| **Skinned Nanite en titanes de 100 M triángulos** | Alto | Prototipar en Fase 0 con un titán de prueba. Plan B: capas de blindaje como Nanite estático desprendible sobre un cuerpo skinned de menor densidad |
| **Descenso continuo con presupuesto de I/O** | Alto | Precarga por vector + plasma como cobertura elástica. Plan B: la ventana de reentrada se estira dinámicamente (sigue sin ser una pantalla de carga) |
| **Series S no sostiene el objetivo** | Medio | Perfil propio desde el día 1, no un port tardío: Lumen software, MegaLights limitado, 900p→1440p |
| **Stutter de compilación de shaders** | Alto | PSO precaching desde Fase 1, cache empaquetado, y umbral de cero hitches > 33 ms verificado en CI nocturno |
| **Exploración sin marcadores frustra a jugadores nuevos** | Medio | Empuje ambiental suave + registro de expedición + marcador opcional en accesibilidad. Se valida con playtests desde la vertical slice |
| **Chat de voz abierto = problema de moderación** | Alto | Diseñado desde el inicio (ver [08](08-hubs-y-social.md#moderación-y-seguridad)), no parcheado post-lanzamiento |
| **Instalación de 180 GB** | Medio | Paquete de texturas de alta resolución separable; instalación por región para quien tenga poco espacio |
| **El alcance de 6 planetas hechos a mano** | Alto | Regiones densas y acotadas, no continentes. PCG para relleno, mano para silueta y layout. Si hay que recortar, se recorta un planeta entero — **nunca** la calidad de los que quedan |

## Regla de recorte

Si el proyecto tiene que achicarse, el orden de sacrificio es explícito:

1. Cantidad de titanes menores.
2. Cadenas de supervivientes secundarias.
3. Un planeta entero (Ossuario es el candidato: es el más aislado
   estructuralmente).
4. Un hub.

**Nunca se recorta:** los 60 fps, la ausencia de pantallas de carga, la calidad
de imagen, ni la accesibilidad. Esos son el producto.
