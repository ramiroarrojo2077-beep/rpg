# 08 — Hubs y sistemas sociales

## Qué son

**Estaciones espaciales neutrales** repartidas por el sistema. No hay facciones
peleando por ellas: son territorio franco donde cualquier explorador puede
atracar. Cuando entrás a un hub, el juego **baja el ritmo deliberadamente**:

- La música pasa de tensa a ambiente cálido.
- El HUD de amenaza desaparece por completo.
- El personaje se saca el casco (y por primera vez le ves la cara).
- No hay combate. No hay PvP. No hay forma de perder nada acá.

Es la sala de descanso de una expedición larga, y ese contraste es lo que hace
que valga la pena volver.

## Los cuatro hubs

| Hub | Ubicación | Identidad |
|---|---|---|
| **Estación Ribera** | Órbita de Kether-3 | El primero. Chatarrero, cálido, luces amarillas, todo remendado. |
| **Plataforma Vhaen-9** | Atmósfera alta de Vhaen-Prime | Ventanal enorme a la aurora. Es *el* lugar donde se sacan capturas. |
| **Nodo Halo** | Cinturón de escombro | Microgravedad. La socialización pasa flotando; los cuerpos se orientan libres. |
| **La Meridiano** | Tu nave, una vez reparada | Hub personal. Podés invitar gente. Tu progreso de reparación es visible para las visitas. |

## Chat de voz por proximidad

El sistema social central. Diseño:

- **Atenuación espacial real.** La voz usa la misma cadena de audio espacial que
  todo lo demás: HRTF, oclusión por geometría, reverb de la sala. Escuchás a
  alguien más fuerte si está más cerca y más apagado si hay un mamparo en el
  medio.
- **Radio de conversación ~12 m**, con caída suave. Te podés alejar de una
  conversación caminando, que es exactamente como funciona en la vida real.
- **Sin canales globales.** Nadie grita a toda la estación. La única voz
  no-espacial es la de tu escuadrón, y es push-to-talk.
- **Indicador diegético**: cuando hablás, el emisor de tu traje pulsa. Ves quién
  está hablando sin leer una lista.
- **Texto como par, no como reemplazo.** Chat de texto por proximidad con
  burbujas ancladas al personaje, con el mismo radio y la misma caída.

## Escuadrones

- Hasta **4 jugadores**. Se forman en el hub, con un apretón de manos diegético
  (acople de trajes), no con un menú de invitaciones.
- **Actividades cooperativas dedicadas**: incursiones a ruinas del Cinturón de
  Halo y cacerías de titanes menores. La campaña principal **no** es
  cooperativa — la soledad es un pilar narrativo y no se negocia.
- El escuadrón persiste entre sesiones si los miembros quieren, con un espacio
  propio en la Meridiano de quien lo hostee.

## Fabricación y presentación

La razón mecánica por la que la gente vuelve al hub:

- Toda armadura fabricada tiene **variantes visuales según el titán** del que
  salió el material: placas de cristal de Kether, quitina helada de Sela,
  superficies iridiscentes de Vhaen.
- **Tintado y desgaste** ajustables: el juego trackea cuánto tiempo pasaste en
  cada planeta y ofrece patinas auténticas (arena incrustada, quemadura solar,
  microfracturas).
- Un jugador experimentado es **legible a simple vista**. Ves a alguien con
  armadura de Custodio y sabés exactamente qué hizo para tenerla. Esa es la
  economía de estatus del juego, y no se compra.
- **Zona de exhibición**: bancos, miradores, y un espacio donde el traje se puede
  dejar en pose. Cero utilidad mecánica, máxima utilidad social.

## Presencia y densidad

- **32 jugadores por instancia** de hub, con relevancia de red por distancia.
- **Emparejamiento por región y por idioma**, con opción explícita de
  instancia privada (solo escuadrón) o instancia vacía (solitario total).
- El single player **nunca** requiere conexión. Los hubs offline funcionan
  igual, vacíos, con los NPC supervivientes.

## Moderación y seguridad

El chat de voz abierto exige que esto esté resuelto desde el diseño, no parcheado
después:

- **Silenciar por proximidad**: un gesto rápido silencia al jugador que estás
  mirando, sin abrir menús.
- **Burbuja personal**: opción de reducir tu radio de escucha a 3 m o a 0.
- **Voz desactivada por defecto para cuentas menores de edad**, según el sistema
  de la plataforma.
- **Reporte con captura de contexto**: al reportar, se adjuntan los últimos 60
  segundos de audio del entorno bufferizados localmente, sin grabación
  permanente.
- **Moderación por reputación**, no por castigo automático: la voz de cuentas
  reportadas repetidamente arranca silenciada para quienes no las tengan en
  escuadrón.
- Todos los controles viven en un **menú de una sola pantalla**, accesible desde
  cualquier lado, sin enterrar nada en submenús.
