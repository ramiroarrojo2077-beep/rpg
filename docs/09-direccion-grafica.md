# 09 — Dirección gráfica y pipeline de render

> Este es el documento más importante del proyecto. El objetivo declarado es
> **los mejores gráficos posibles**: fotorrealismo de grado cinematográfico
> sostenido a 60 fps, sin caídas de calidad entre cinemática y gameplay, y sin
> una sola pantalla de carga.
>
> "Los mejores gráficos posibles" no significa activar todo al máximo. Significa
> **elegir dónde gastar cada milisegundo** para que la imagen se vea mejor que la
> de cualquier otra cosa corriendo en el mismo hardware. Todo lo que sigue es esa
> lista de decisiones.

---

## 9.0 Los cinco mandamientos visuales

1. **Una sola cadena de render.** Cinemática y gameplay usan exactamente los
   mismos materiales, la misma iluminación y el mismo post. No hay "modo
   cutscene" con calidad extra. Si algo se ve bien en la cinemática, se ve igual
   cuando tomás el control — porque *es* lo mismo.
2. **La luz es física, siempre.** Nada de luces de relleno falsas ni ambient
   oclusión pintado a mano. Todo se ilumina con fuentes reales en unidades reales
   (lux, nits, candelas). Si una escena está oscura, se resuelve moviendo una
   fuente, no subiendo un multiplicador.
3. **El detalle no se falsea.** Geometría real hasta donde llegue el hardware.
   Nada de normal maps tapando silueta plana. Si un remache existe, es geometría.
4. **La legibilidad gana al espectáculo.** Cuando el frame está lleno de
   destrucción, partículas y volumétricos, el jugador tiene que seguir viendo la
   telegrafía del titán. Todo el sistema de post tiene guardas para esto.
5. **60 fps es requisito, no aspiración.** Un juego de esquives de 4 frames no se
   puede jugar a 30. El modo Calidad también corre a 60; lo que sube es la
   resolución interna y el costo de trazado, nunca el frame time objetivo.

---

## 9.1 Geometría — Nanite hasta el fondo

**Nanite como formato universal de geometría opaca.** Todo lo estático, todo lo
destructible y toda la vegetación entran por Nanite.

### Presupuestos de fuente
| Tipo de asset | Densidad de fuente | Notas |
|---|---|---|
| Props modulares de nave | 2–8 M triángulos | Escaneados o esculpidos, sin retopología |
| Roca y terreno de arte | 10–40 M triángulos | Fotogrametría procesada, sin decimar |
| Estructura precursora | 5–20 M triángulos | Geometría dura, chaflanes reales de 1–2 mm |
| Titán (cuerpo completo) | 60–120 M triángulos | Ver 9.1.3 |

No hay presupuesto de triángulos por escena en el sentido clásico. El
presupuesto real es de **clusters visibles por frame** y de **espacio en disco**.

### 9.1.1 Nanite en lo que se rompe
Toda la destrucción es Nanite. Chaos genera la fractura sobre la malla de alta
densidad y los fragmentos conservan el detalle interno: cuando partís una viga
precursora, la cara interna tiene estructura real — capas, fibra, sustrato — no
una textura de "adentro de metal".

Esto es lo que hace que la destrucción de las peleas de titán se vea distinta a
la de cualquier otro juego: **las superficies recién creadas tienen tanto detalle
como las originales.**

### 9.1.2 Nanite Foliage y Tessellation
- **Vegetación** (cristal de Kether, corales de Vhaen, formaciones de Sela) con
  Nanite: hojas y ramas con geometría real, sombreado correcto, sin el
  hormigueo de LOD clásico de foliage.
- **Nanite Displacement/Tessellation** para superficies con relieve real:
  huellas en arena, hielo agrietado, capa de polvo sobre metal. El desplazamiento
  es geometría, así que proyecta sombra propia y ocluye correctamente.

### 9.1.3 Los titanes — el caso extremo
Un titán es el asset más caro del juego y necesita su propio tratamiento:

- **Skinned Nanite** para el cuerpo entero: un titán deformado por esqueleto con
  decenas de millones de triángulos, sin cascada de LOD visible cuando el jugador
  pasa de verlo a 2 km a estar parado sobre su placa dorsal.
- **Capas anatómicas**: blindaje externo (Nanite rígido) → estructura interna
  (visible al romper el blindaje, geometría propia) → conductos y núcleo. El
  daño no cambia una textura: **remueve capas de geometría**.
- **Puntos de anclaje modelados**: cada superficie escalable existe físicamente.
  Nada de volúmenes invisibles de "acá te podés agarrar".
- **Transición continua de escala**: el mismo asset sirve para el plano de
  horizonte y para el primer plano de la mano del jugador contra su placa. Ese es
  todo el punto de Nanite y es la razón por la que la fase 2 de las peleas
  funciona.

### 9.1.4 Lo que Nanite no cubre
Pelo/groom, telas simuladas, materiales translúcidos y volúmenes van por caminos
propios (9.5, 9.6). Para esos casos hay LOD tradicional muy trabajado a mano.

---

## 9.2 Iluminación global — Lumen, y el plan de path tracing

### Configuración base
- **Lumen con trazado por hardware (HWRT)** en todas las plataformas objetivo.
  El software tracing solo existe como red de seguridad en Series S.
- **Ray Tracing contra la malla Nanite real** (no contra proxies), habilitado
  donde la plataforma lo permite: la sombra y el rebote coinciden con lo que ves.
- **Far Field** activo para escala planetaria: el rebote de una cordillera a 4 km
  llega al valle donde estás parado.
- **Final Gather de alta calidad**, con presupuesto explícito de ~2.4 ms en modo
  Calidad y ~1.6 ms en modo Rendimiento.

### Por qué importa en este juego específico
1. **El titán es un iluminador negativo.** Cuando algo de 90 metros se te pone
   entre el sol y vos, todo el valle cambia de exposición. Con GI dinámica eso
   pasa solo, y es una de las cosas más impactantes del juego.
2. **El ciclo día/noche es real.** Ninguna iluminación es horneada, porque el sol
   se mueve y el clima cambia el cielo. Todo se recalcula.
3. **La aurora de Vhaen-Prime ilumina el nivel.** No es un skybox: es una fuente
   emisiva de escala planetaria que baña las plataformas metálicas de color y
   cambia a lo largo de minutos.
4. **En Ossuario no hay atmósfera.** Sin dispersión, el único relleno en sombra
   es el rebote real. Un planeta sin cielo es la prueba de fuego de una GI
   honesta, y ahí es donde el juego se ve más "de película".

### MegaLights — muchas fuentes, todas con sombra
El interior de la Meridiano, los hubs y las ruinas precursoras tienen **cientos
de fuentes pequeñas** (paneles, indicadores, tiras LED, emisores de sustrato).
Con MegaLights todas proyectan sombra y participan del trazado, sin el
presupuesto por-luz clásico. Esto es lo que da la sensación de interior
fotorreal: **nada está iluminado por una luz falsa sin sombra**.

### Sombras
- **Virtual Shadow Maps** en todo, con resolución virtual de 16k para el sol.
- **Contact shadows** de trazado corto para el contacto suelo-pie y las
  microsuperficies.
- **Sombra de nube volumétrica** proyectada sobre el terreno — en Kether-3 ver
  pasar la sombra de una tormenta sobre las dunas es un momento de juego.

### Path tracing
- **Modo Foto**: path tracer completo de UE5 con acumulación progresiva, DOF de
  lente real y muestreo de luz por importancia. El jugador pausa, compone y saca
  una imagen de calidad de render offline. Esto es tanto una herramienta de
  marketing como una función para el jugador.
- **Uso interno**: el path tracer es la **referencia de verdad** de arte. Toda
  iluminación se valida contra su render de referencia; si Lumen se aleja
  demasiado, es un bug de escena, no una limitación aceptada.

---

## 9.3 Materiales — Substrate

Migración completa a **Substrate** en vez del modelo de sombreado fijo. Las
capas se definen físicamente, y eso importa porque el contraste de materiales
*es* la dirección de arte (ver [01](01-vision-y-pilares.md#tono)).

### Las tres gramáticas de material

**1. Tecnología humana — sucia y honesta**
Metal pintado con capa clara rayada; debajo, primer; debajo, aluminio anodizado.
Óxido con espesor real. Suciedad acumulada en cavidades por máscara de curvatura.
Cada superficie cuenta cuántas horas de servicio lleva.

**2. Precursor — imposiblemente limpio**
Materiales que rompen la intuición: **thin-film iridescence** de espesor variable,
subsuperficie en algo que parece piedra, anisotropía que no coincide con la
dirección de la geometría, y una capa clara con IOR que no corresponde a ningún
material terrestre. La sensación buscada: *esto está bien renderizado, pero no
entiendo qué es*.

**3. Biomecánico (titanes) — la mezcla**
Quitina sobre acero. Subsuperficie húmeda junto a metal seco. Es lo más caro de
sombrear del juego y por eso los titanes tienen presupuesto de material propio.

### Efectos específicos
| Efecto | Implementación |
|---|---|
| Cristal de Kether | Refracción real con dispersión cromática; transmisión Substrate multi-capa |
| Hielo de Sela | Subsuperficie + burbujas internas por volumen; refracción con espesor |
| Visor del traje | Capa clara + suciedad + condensación dinámica + rayas acumuladas por daño |
| Nieve/arena acumulada | Capa procedural por normal mundial, con desplazamiento Nanite |
| Emisivo precursor | Emisión en unidades físicas (nits) que alimenta GI y bloom real |

### Texturas
- **Virtual Textures** en todo, con presupuesto de streaming explícito.
- Texel density objetivo: **10 px/cm** en superficies de gameplay cercano
  (armadura, interiores), 5 px/cm en terreno lejano.
- Compresión de nueva generación en disco, con descompresión por GPU.

---

## 9.4 Atmósfera y volumétricos

Esto es donde el juego gana la mitad de su identidad visual.

| Sistema | Uso |
|---|---|
| **Sky Atmosphere** | Dispersión de Rayleigh/Mie por planeta, con parámetros distintos: Kether tiene cielo lavado, Vhaen tiene cielo espeso y saturado, Ossuario no tiene cielo |
| **Volumetric Clouds** | Nubes con raymarching, sombra propia y auto-sombra. En Vhaen-Prime volás *entre* ellas y son navegables |
| **Exponential Height Fog + volumétrico local** | Bruma con luz dispersa; los rayos de dios son físicos, no un sprite |
| **Heterogeneous Volumes** | Volúmenes densos importados: la tormenta de cristal, el plasma de reentrada, el humo de destrucción, la nube de escape de un titán |
| **Aurora de Vhaen** | Volumen emisivo procedural de escala planetaria, con animación de cortina y contribución a la GI |

**Regla de legibilidad:** todo volumétrico tiene un límite de densidad que el
sistema de combate puede pedir bajar. Si un titán está por telegrafiar un ataque,
la densidad local baja un ~20 % en el cono de visión — imperceptible como cambio,
decisivo como lectura.

---

## 9.5 Personajes, tela y pelo

- **MetaHuman** como base de todos los humanos, con esculpido propio encima. Los
  rostros importan porque el casco se saca en los hubs y en las cinemáticas.
- **Piel**: subsuperficie con perfil medido, poros con desplazamiento real,
  microsombreado, humedad diferencial en labios y ojos. Ojos con córnea refractiva
  y caustica interna.
- **Grooms** para pelo, cejas y pestañas, con simulación en las cinemáticas y
  cacheado en gameplay.
- **Chaos Cloth** para las partes blandas del traje: correas, mangueras,
  aislante. Un traje que no se mueve mata el fotorrealismo más rápido que
  cualquier textura mala.
- **Deformación de traje** por Deformer Graph: las placas se separan y las juntas
  se comprimen según pose. Nada de armadura rígida atravesándose a sí misma.

---

## 9.6 Efectos y destrucción

- **Niagara** con simulación en GPU para todo lo de alto conteo: debris,
  chispas, arena, hielo pulverizado. Los sistemas grandes leen la escena
  (distance fields) para colisionar sin CPU.
- **Chaos Destruction** jerárquica: fractura pre-computada en 3 niveles, con
  activación por energía de impacto. Los fragmentos grandes se simulan y
  persisten; los chicos se convierten en partículas con colisión aproximada tras
  ~4 s.
- **Fluidos**: Niagara Fluids para el agua de Sela en escenas puntuales y para el
  plasma de reentrada. No es simulación global — es simulación donde se ve.
- **Decals de daño acumulativo** sobre titanes y sobre el traje, en Virtual
  Texture, para que el desgaste persista durante todo el encuentro.

---

## 9.7 Cámara, lente y post-proceso

El objetivo es que la imagen se lea como **filmada**, no como renderizada.

### Modelo de cámara física
- Distancia focal, apertura y velocidad de obturación reales. La exposición se
  calcula con EV real y el auto-exposure imita un operador humano: tarda, tiene
  inercia, y a veces sobreexpone un segundo cuando salís de un túnel.
- **Set de lentes definido** para el juego: 24 mm para paisaje, 35 mm para
  gameplay, 85 mm para primeros planos. Cada uno con su distorsión, viñeteado y
  aberración cromática medidos de una lente real.

### Cadena de post
| Etapa | Decisión |
|---|---|
| **Motion blur** | Por objeto, con calidad de cinemática, con opción de desactivar |
| **Depth of field** | Bokeh real con forma de diafragma de la lente; nunca en gameplay salvo transición |
| **Bloom** | Convolución con kernel de lente real (no gaussiano). Es lo que hace que la aurora y el emisivo precursor se sientan luminosos de verdad |
| **Flares** | Basados en el modelo de lente, sutiles, direccionales |
| **Tonemapping** | ACES, con LUT de grado propio por planeta |
| **Grano** | Grano de película con respuesta por luminancia, sutil, presente también en HDR |
| **Aberración/distorsión** | Ligadas a la lente activa, nunca como efecto suelto |

### HDR
Salida HDR de verdad: **1000–2000 nits de pico**, con mapeo de tonos por
capacidad de pantalla y calibración in-game de tres pasos. El contraste de
Ossuario (blanco quemado contra negro puro) está diseñado específicamente para
HDR.

### Guardas de legibilidad
El post nunca puede tapar información de combate. Reglas duras:
- El bloom tiene techo de contribución en la mitad inferior de la pantalla.
- El DOF se desactiva en cuanto hay un enemigo en estado de telegrafía.
- La aberración cromática se anula en el centro del encuadre.
- Existe un **modo de contraste alto** que reduce grano, bloom y volumétricos sin
  cambiar la dirección de arte. Ver [12](12-ux-ui-y-accesibilidad.md).

---

## 9.8 Resolución, reconstrucción y anti-aliasing

Regla: **nunca renderizar a resolución nativa cuando un reconstructor temporal da
mejor imagen por el mismo costo.** El presupuesto que se ahorra va a trazado de
luz, que es donde el ojo lo nota.

| Plataforma | Modo | Interna → Salida | Reconstructor |
|---|---|---|---|
| PC (NVIDIA) | Calidad | 1440p → 4K | DLSS + reconstrucción de rayos + generación de cuadros opcional |
| PC (AMD) | Calidad | 1440p → 4K | FSR de última generación |
| PC (Intel) | Calidad | 1440p → 4K | XeSS |
| PS5 Pro | Calidad | ~1440p → 4K | PSSR |
| PS5 / Series X | Calidad | 1260–1440p → 4K | TSR |
| PS5 / Series X | Rendimiento | 1080p → 4K | TSR, trazado reducido |
| Series S | Único | 900p → 1440p | TSR, Lumen software, MegaLights limitado |

**Generación de cuadros** solo como opción de PC y nunca contada como parte del
objetivo de 60 fps: los esquives de 4 frames se calibran contra frames reales.

---

## 9.9 Cinemáticas continuas

La promesa de "sin tiempos de carga y sin caída de calidad" es un sistema, no una
intención.

- **Todo se filma en el motor, en vivo**, con Sequencer conduciendo cámaras que
  el jugador puede recibir en cualquier momento. No hay video pre-renderizado en
  ninguna parte del juego.
- **Handoff de cámara**: la cinemática termina interpolando de la cámara de
  Sequencer a la cámara de gameplay en ~0.6 s, igualando FOV, altura y
  amortiguación. El jugador recupera el control *durante* la interpolación, no
  después.
- **Presupuesto idéntico**: las cinemáticas corren con el mismo costo de frame
  que el gameplay. Nada de subir la calidad de sombras "porque no hay jugador".
  Esto obliga a que el gameplay ya se vea así de bien — que es el punto.
- **Descensos y reentradas**: implementados como un solo nivel continuo con
  streaming por distancia, con el planeta pasando de esfera lejana a terreno
  jugable sin transición perceptible. Ver
  [11 — Arquitectura](11-arquitectura-tecnica.md#el-descenso-continuo).
- **Composición de plano**: cada cinemática se compone para la lente activa, con
  regla de 180°, y con iluminación que no se toca respecto del gameplay. Si un
  plano necesita más luz, se pone una fuente práctica dentro de la escena —
  visible, diegética, que también ilumina cuando jugás.

---

## 9.10 Presupuesto de frame (objetivo, consola base, modo Calidad)

Presupuesto total: **16.6 ms**.

| Sistema | ms | Nota |
|---|---|---|
| Base pass Nanite | 3.2 | Escala con clusters, no con objetos |
| Lumen (final gather + reflexiones) | 2.4 | Reducible a 1.6 en modo Rendimiento |
| Virtual Shadow Maps | 1.8 | Con cacheo agresivo de páginas |
| MegaLights | 1.2 | Interiores; ~0.4 en exteriores abiertos |
| Volumétricos (niebla + nubes) | 1.6 | Pico de 2.4 en tormenta |
| Niagara GPU | 1.0 | Pico de 2.0 en fase 3 de titán |
| Personajes (piel, groom, cloth) | 1.2 | |
| Post + reconstrucción | 1.8 | |
| Traslape de CPU/render/RHI | 2.4 | |
| **Reserva** | **~0.0** | Ver abajo |

**El presupuesto no cierra con margen — a propósito.** Los picos se absorben con
**escalado dinámico de resolución** (rango 70–100 % de la interna objetivo) y con
degradación priorizada: primero baja la densidad de volumétricos, después la
calidad de reflexiones, después el conteo de partículas. **Nunca** bajan la
resolución de sombra del titán ni la nitidez de su telegrafía.

---

## 9.11 Higiene técnica que hace la diferencia

Cosas que no aparecen en un tráiler pero deciden si el juego se siente pulido:

- **PSO precaching + bundled PSO cache**: cero stutter de compilación de shaders.
  Es el defecto más común de los juegos UE5 y se trata como bug bloqueante.
- **Streaming de mundo con presupuesto de I/O explícito** y precarga por vector
  de movimiento del jugador: si vas rápido hacia el oeste, el oeste se carga
  primero.
- **Determinismo del reconstructor temporal**: ghosting cero en el gancho, en el
  debris y en el titán. Se valida con pruebas automatizadas de imagen.
- **Validación automatizada de imagen en CI**: capturas de referencia por escena,
  comparadas frame a frame contra la build anterior. Cualquier desvío perceptual
  levanta alerta.
- **Presupuestos por asset aplicados en importación**: un asset fuera de
  presupuesto no entra al repositorio.

---

## 9.12 Guion de color

| Región | Paleta | Clave de iluminación |
|---|---|---|
| Kether-3 | Ámbar, ocre, blanco refractado | Alta, sol duro, sombras cortas |
| Sela | Cian, blanco azulado, negro de agua | Baja, sol rasante, contraste suave |
| Vhaen-Prime | Magenta, verde aurora, plata | Media, fuente en el cielo entero |
| Ossuario | Monocromo, blanco/negro puro | Extrema, sin relleno |
| Cinturón de Halo | Naranja estelar contra negro | Direccional pura |
| La Anomalía | Sin paleta estable — cambia | Antinatural, sin fuente identificable |
| Hubs | Amarillo cálido, madera, latón | Baja, práctica, muchas fuentes chicas |

El guion de color existe para que **cada captura de pantalla del juego sea
identificable como de un lugar concreto**. Si dos regiones se ven parecidas, una
de las dos está mal.
