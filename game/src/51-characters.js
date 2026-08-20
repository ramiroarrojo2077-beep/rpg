// Ecos del Vacío — personajes: esqueleto humano, estilos de traje y clips.
// Los ángulos de los clips se escriben en grados y con el mismo criterio en
// todo el archivo: rotación +X sobre un hueso que apunta a -Y lo lleva hacia
// -Z, que es el frente del personaje. Por eso "pierna adelante" es +X y
// "rodilla flexionada" es -X.
(function (EV) {
  'use strict';

  const CM = EV.CharMesh;
  const V3 = EV.V3, Q = EV.Q, M = EV.MathUtil;

  // ------------------------------------------------------------- esqueleto
  const BONES = [
    { name: 'root', parent: -1, pos: [0, 0.94, 0] },
    { name: 'spine', parent: 0, pos: [0, 0.17, 0] },
    { name: 'chest', parent: 1, pos: [0, 0.21, 0] },
    { name: 'neck', parent: 2, pos: [0, 0.20, 0] },
    { name: 'head', parent: 3, pos: [0, 0.09, 0] },

    { name: 'clavL', parent: 2, pos: [0.07, 0.15, 0] },
    { name: 'armL', parent: 5, pos: [0.14, -0.03, 0] },
    { name: 'foreL', parent: 6, pos: [0, -0.29, 0] },
    { name: 'handL', parent: 7, pos: [0, -0.26, 0] },

    { name: 'clavR', parent: 2, pos: [-0.07, 0.15, 0] },
    { name: 'armR', parent: 9, pos: [-0.14, -0.03, 0] },
    { name: 'foreR', parent: 10, pos: [0, -0.29, 0] },
    { name: 'handR', parent: 11, pos: [0, -0.26, 0] },

    { name: 'thighL', parent: 0, pos: [0.105, -0.07, 0] },
    { name: 'shinL', parent: 13, pos: [0, -0.44, 0] },
    { name: 'footL', parent: 14, pos: [0, -0.42, 0] },

    { name: 'thighR', parent: 0, pos: [-0.105, -0.07, 0] },
    { name: 'shinR', parent: 16, pos: [0, -0.44, 0] },
    { name: 'footR', parent: 17, pos: [0, -0.42, 0] },
  ];

  let _skeleton = null;
  function skeleton() {
    if (!_skeleton) _skeleton = EV.Anim.createSkeleton(BONES);
    return _skeleton;
  }

  // ----------------------------------------------------------------- mallas
  const STYLES = {
    // Ingeniero de expedición: el jugador. Traje pesado, mochila, herramientas.
    engineer: { armor: 'heavy', pack: true, pauldrons: true, visor: 'wide', bulk: 1.0 },
    // Seguridad de la Meridiano: blindaje más grueso, casco con visera.
    soldier: { armor: 'heavy', pack: false, pauldrons: true, visor: 'narrow', bulk: 1.10, brow: true },
    // Técnica: traje ligero, sin pauldrones, cinturón de herramientas.
    technician: { armor: 'light', pack: true, pauldrons: false, visor: 'wide', bulk: 0.93 },
    // Herida: traje ligero dañado, sin casco (se lo sacó).
    wounded: { armor: 'light', pack: false, pauldrons: false, visor: 'none', bulk: 0.95 },
  };

  // buildParts arma la geometría; buildMesh la sube a GPU y buildRaw devuelve
  // los arreglos en CPU para exportar. Un solo cuerpo de código para ambos.
  function buildParts(style) {
    const sk = skeleton();
    const S = STYLES[style] || STYLES.engineer;
    const b = CM.builder(sk);
    const k = S.bulk;

    // --- torso: sección elíptica, más ancha que profunda
    b.limb('root', 'spine', {
      rx0: 0.155 * k, rz0: 0.115 * k, rx1: 0.165 * k, rz1: 0.120 * k,
      seg: 16, rings: 3, material: CM.MAT_SUIT, parentBlend: 0, childBlend: 0.4,
    });
    b.limb('spine', 'chest', {
      rx0: 0.165 * k, rz0: 0.120 * k, rx1: 0.195 * k, rz1: 0.135 * k,
      seg: 16, rings: 4, material: CM.MAT_SUIT, parentBlend: 0.35, childBlend: 0.35,
    });
    b.limb('chest', 'neck', {
      rx0: 0.195 * k, rz0: 0.135 * k, rx1: 0.085 * k, rz1: 0.085 * k,
      seg: 16, rings: 4, material: CM.MAT_SUIT, parentBlend: 0.35, childBlend: 0.3,
    });
    b.limb('neck', 'head', {
      rx0: 0.062 * k, rz0: 0.062 * k, rx1: 0.072 * k, rz1: 0.072 * k,
      seg: 12, rings: 2, material: CM.MAT_RUBBER, parentBlend: 0.3, childBlend: 0.4,
    });

    // --- cabeza y casco
    if (S.visor === 'none') {
      b.blob('head', { r: 0.098 * k, ry: 0.115 * k, rz: 0.108 * k, offset: [0, 0.045, 0],
        seg: 16, rings: 12, material: CM.MAT_RUBBER });
      b.blob('head', { r: 0.030, offset: [0, 0.055, -0.095 * k], seg: 8, rings: 6,
        material: CM.MAT_ACCENT });   // respirador
    } else {
      b.blob('head', { r: 0.118 * k, ry: 0.128 * k, rz: 0.126 * k, offset: [0, 0.050, 0],
        seg: 18, rings: 14, material: CM.MAT_ARMOR });
      const wide = S.visor === 'wide';
      b.plate('head', {
        size: [wide ? 0.165 : 0.130, 0.070, 0.045], offset: [0, 0.055, -0.105 * k],
        rot: [-0.18, 0, 0], bevel: 0.010, material: CM.MAT_VISOR,
      });
      if (S.brow) {
        b.plate('head', { size: [0.185, 0.032, 0.10], offset: [0, 0.128, -0.030],
          rot: [0.22, 0, 0], bevel: 0.008, material: CM.MAT_ARMOR });
      }
      // Luz de casco: pequeña, emisiva, con acento del personaje.
      b.blob('head', { r: 0.022, offset: [0.075 * k, 0.115, -0.070], seg: 8, rings: 6,
        material: CM.MAT_ACCENT });
    }

    // --- brazos
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      b.limb('clav' + side, 'arm' + side, {
        rx0: 0.075 * k, rx1: 0.070 * k, seg: 10, rings: 2,
        material: CM.MAT_SUIT, parentBlend: 0.2, childBlend: 0.5,
      });
      b.blob('arm' + side, { r: 0.083 * k, seg: 12, rings: 9, material: CM.MAT_SUIT,
        weightWith: 'chest', weightAmount: 0.25 });
      b.limb('arm' + side, 'fore' + side, {
        rx0: 0.072 * k, rx1: 0.058 * k, seg: 12, rings: 5, bulge: 0.14,
        material: CM.MAT_SUIT, parentBlend: 0.35, childBlend: 0.45,
      });
      b.blob('fore' + side, { r: 0.058 * k, seg: 10, rings: 8, material: CM.MAT_RUBBER });
      b.limb('fore' + side, 'hand' + side, {
        rx0: 0.056 * k, rx1: 0.046 * k, seg: 12, rings: 4, bulge: 0.10,
        material: CM.MAT_SUIT, parentBlend: 0.35, childBlend: 0.4,
      });
      b.blob('hand' + side, { r: 0.050 * k, ry: 0.062 * k, rz: 0.038 * k,
        offset: [0, -0.035, 0], seg: 10, rings: 8, material: CM.MAT_RUBBER });
      // Antebrazo con panel: donde vive el HUD diegético del traje.
      b.plate('fore' + side, {
        size: [0.062, 0.115, 0.048], offset: [s * 0.026, -0.115, -0.012],
        bevel: 0.007, material: side === 'L' ? CM.MAT_ACCENT : CM.MAT_ARMOR,
      });
      if (S.pauldrons) {
        b.plate('arm' + side, {
          size: [0.135 * k, 0.085, 0.145 * k], offset: [s * 0.028, 0.030, 0],
          rot: [0, 0, -s * 0.28], bevel: 0.014, material: CM.MAT_ARMOR,
          weightWith: 'chest', weightAmount: 0.2,
        });
      }
    }

    // --- piernas
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      b.blob('thigh' + side, { r: 0.105 * k, seg: 12, rings: 9, material: CM.MAT_SUIT,
        weightWith: 'root', weightAmount: 0.3 });
      b.limb('thigh' + side, 'shin' + side, {
        rx0: 0.105 * k, rz0: 0.100 * k, rx1: 0.078 * k, rz1: 0.078 * k,
        seg: 12, rings: 5, bulge: 0.10,
        material: CM.MAT_SUIT, parentBlend: 0.40, childBlend: 0.45,
      });
      b.blob('shin' + side, { r: 0.080 * k, seg: 12, rings: 9, material: CM.MAT_RUBBER });
      b.limb('shin' + side, 'foot' + side, {
        rx0: 0.078 * k, rx1: 0.058 * k, seg: 12, rings: 5, bulge: 0.12,
        material: CM.MAT_SUIT, parentBlend: 0.35, childBlend: 0.45,
      });
      // Bota: suela gruesa, es lo que apoya en la arena.
      b.plate('foot' + side, {
        size: [0.105 * k, 0.075, 0.255 * k], offset: [0, -0.035, -0.045],
        bevel: 0.012, material: CM.MAT_RUBBER,
      });
      b.plate('foot' + side, {
        size: [0.112 * k, 0.030, 0.265 * k], offset: [0, -0.072, -0.045],
        bevel: 0.010, material: CM.MAT_ARMOR,
      });
      if (S.armor === 'heavy') {
        b.plate('thigh' + side, {
          size: [0.115, 0.180, 0.075], offset: [s * 0.038, -0.170, -0.055],
          rot: [0.10, 0, 0], bevel: 0.011, material: CM.MAT_ARMOR,
        });
        b.plate('shin' + side, {
          size: [0.105, 0.220, 0.070], offset: [0, -0.185, -0.052],
          rot: [-0.05, 0, 0], bevel: 0.011, material: CM.MAT_ARMOR,
        });
      }
    }

    // --- coraza y accesorios
    if (S.armor === 'heavy') {
      b.plate('chest', { size: [0.335 * k, 0.245, 0.115], offset: [0, 0.045, -0.075],
        rot: [0.06, 0, 0], bevel: 0.016, material: CM.MAT_ARMOR });
      b.plate('chest', { size: [0.115, 0.075, 0.045], offset: [0, 0.115, -0.135],
        bevel: 0.008, material: CM.MAT_ACCENT });   // luz de pecho
      b.plate('spine', { size: [0.290, 0.185, 0.085], offset: [0, 0.030, 0.078],
        rot: [-0.05, 0, 0], bevel: 0.014, material: CM.MAT_ARMOR });
    } else {
      b.plate('chest', { size: [0.260 * k, 0.150, 0.085], offset: [0, 0.015, -0.088],
        rot: [0.05, 0, 0], bevel: 0.012, material: CM.MAT_ARMOR });
      b.plate('chest', { size: [0.085, 0.055, 0.035], offset: [0, 0.075, -0.128],
        bevel: 0.006, material: CM.MAT_ACCENT });
    }
    // Cinturón: separa torso de piernas y da lectura de silueta.
    b.limb('root', 'spine', {
      rx0: 0.168 * k, rz0: 0.128 * k, rx1: 0.168 * k, rz1: 0.128 * k,
      seg: 16, rings: 1, material: CM.MAT_RUBBER, parentBlend: 0, childBlend: 0,
      offsetB: [0, -0.115, 0],
    });
    if (S.pack) {
      b.plate('chest', { size: [0.245, 0.320, 0.135], offset: [0, -0.010, 0.150],
        bevel: 0.016, material: CM.MAT_ARMOR });
      b.plate('chest', { size: [0.070, 0.130, 0.055], offset: [0.085, 0.120, 0.215],
        bevel: 0.008, material: CM.MAT_RUBBER });
      b.plate('chest', { size: [0.070, 0.130, 0.055], offset: [-0.085, 0.120, 0.215],
        bevel: 0.008, material: CM.MAT_RUBBER });
    }

    return b;
  }

  function buildMesh(style) {
    const mesh = buildParts(style).build();
    mesh.style = style;
    return mesh;
  }

  function buildRaw(style) {
    return buildParts(style).raw();
  }

  // ------------------------------------------------------------------ clips
  // Un ciclo de marcha de manual: contacto, apoyo medio, despegue, balanceo.
  const CLIP_SPECS = {
    idle: {
      name: 'idle', duration: 5.0, loop: true,
      tracks: {
        root: { pos: [[0, 0, 0.940, 0], [2.5, 0, 0.926, 0], [5, 0, 0.940, 0]] },
        spine: { rot: [[0, 1, 0, 0], [2.5, 3.5, 0, 0], [5, 1, 0, 0]] },
        chest: { rot: [[0, -1, 2, 0], [2.5, -3, -2, 0], [5, -1, 2, 0]] },
        head: { rot: [[0, 2, -4, 0], [1.6, 0, 6, 0], [3.4, 3, -2, 0], [5, 2, -4, 0]] },
        armL: { rot: [[0, -4, 0, 7], [2.5, -1, 0, 9], [5, -4, 0, 7]] },
        armR: { rot: [[0, -4, 0, -7], [2.5, -1, 0, -9], [5, -4, 0, -7]] },
        foreL: { rot: [[0, -14, 0, 0], [2.5, -19, 0, 0], [5, -14, 0, 0]] },
        foreR: { rot: [[0, -16, 0, 0], [2.5, -21, 0, 0], [5, -16, 0, 0]] },
        thighL: { rot: [[0, 1, 0, 2], [5, 1, 0, 2]] },
        thighR: { rot: [[0, -1, 0, -2], [5, -1, 0, -2]] },
        shinL: { rot: [[0, -3, 0, 0], [5, -3, 0, 0]] },
        shinR: { rot: [[0, -3, 0, 0], [5, -3, 0, 0]] },
      },
    },

    walk: {
      name: 'walk', duration: 1.05, loop: true,
      tracks: {
        root: {
          pos: [[0, 0, 0.928, 0], [0.25, 0, 0.951, 0], [0.5, 0, 0.928, 0],
                [0.75, 0, 0.951, 0], [1.05, 0, 0.928, 0]],
          rot: [[0, 0, 3, 0], [0.5, 0, -3, 0], [1.05, 0, 3, 0]],
        },
        spine: { rot: [[0, 3, -2, 0], [0.5, 3, 2, 0], [1.05, 3, -2, 0]] },
        chest: { rot: [[0, -2, 5, 0], [0.5, -2, -5, 0], [1.05, -2, 5, 0]] },
        head: { rot: [[0, 1, -3, 0], [0.5, 1, 3, 0], [1.05, 1, -3, 0]] },

        thighL: { rot: [[0, 24, 0, 2], [0.5, -18, 0, 2], [1.05, 24, 0, 2]] },
        shinL: { rot: [[0, -10, 0, 0], [0.14, -6, 0, 0], [0.55, -12, 0, 0],
                       [0.78, -58, 0, 0], [1.05, -10, 0, 0]] },
        footL: { rot: [[0, -12, 0, 0], [0.20, 6, 0, 0], [0.55, 18, 0, 0],
                       [0.80, -6, 0, 0], [1.05, -12, 0, 0]] },

        thighR: { rot: [[0, -18, 0, -2], [0.5, 24, 0, -2], [1.05, -18, 0, -2]] },
        shinR: { rot: [[0, -12, 0, 0], [0.26, -58, 0, 0], [0.52, -10, 0, 0],
                       [0.66, -6, 0, 0], [1.05, -12, 0, 0]] },
        footR: { rot: [[0, 18, 0, 0], [0.28, -6, 0, 0], [0.52, -12, 0, 0],
                       [0.72, 6, 0, 0], [1.05, 18, 0, 0]] },

        armL: { rot: [[0, -24, 0, 8], [0.5, 20, 0, 8], [1.05, -24, 0, 8]] },
        foreL: { rot: [[0, -16, 0, 0], [0.5, -36, 0, 0], [1.05, -16, 0, 0]] },
        armR: { rot: [[0, 20, 0, -8], [0.5, -24, 0, -8], [1.05, 20, 0, -8]] },
        foreR: { rot: [[0, -36, 0, 0], [0.5, -16, 0, 0], [1.05, -36, 0, 0]] },
      },
    },

    run: {
      name: 'run', duration: 0.68, loop: true,
      tracks: {
        root: {
          pos: [[0, 0, 0.910, 0], [0.17, 0, 0.960, 0], [0.34, 0, 0.910, 0],
                [0.51, 0, 0.960, 0], [0.68, 0, 0.910, 0]],
          rot: [[0, 9, 5, 0], [0.34, 9, -5, 0], [0.68, 9, 5, 0]],
        },
        spine: { rot: [[0, 7, -4, 0], [0.34, 7, 4, 0], [0.68, 7, -4, 0]] },
        chest: { rot: [[0, 5, 9, 0], [0.34, 5, -9, 0], [0.68, 5, 9, 0]] },
        head: { rot: [[0, -9, -4, 0], [0.34, -9, 4, 0], [0.68, -9, -4, 0]] },

        thighL: { rot: [[0, 46, 0, 3], [0.34, -30, 0, 3], [0.68, 46, 0, 3]] },
        shinL: { rot: [[0, -34, 0, 0], [0.10, -12, 0, 0], [0.40, -30, 0, 0],
                       [0.52, -104, 0, 0], [0.68, -34, 0, 0]] },
        footL: { rot: [[0, -16, 0, 0], [0.14, 10, 0, 0], [0.40, 24, 0, 0], [0.68, -16, 0, 0]] },

        thighR: { rot: [[0, -30, 0, -3], [0.34, 46, 0, -3], [0.68, -30, 0, -3]] },
        shinR: { rot: [[0, -30, 0, 0], [0.18, -104, 0, 0], [0.34, -34, 0, 0],
                       [0.44, -12, 0, 0], [0.68, -30, 0, 0]] },
        footR: { rot: [[0, 24, 0, 0], [0.20, -16, 0, 0], [0.48, 10, 0, 0], [0.68, 24, 0, 0]] },

        armL: { rot: [[0, -52, 0, 10], [0.34, 44, 0, 10], [0.68, -52, 0, 10]] },
        foreL: { rot: [[0, -62, 0, 0], [0.34, -86, 0, 0], [0.68, -62, 0, 0]] },
        armR: { rot: [[0, 44, 0, -10], [0.34, -52, 0, -10], [0.68, 44, 0, -10]] },
        foreR: { rot: [[0, -86, 0, 0], [0.34, -62, 0, 0], [0.68, -86, 0, 0]] },
      },
    },

    jump: {
      name: 'jump', duration: 0.45, loop: false,
      tracks: {
        root: { pos: [[0, 0, 0.890, 0], [0.45, 0, 0.960, 0]] },
        spine: { rot: [[0, 14, 0, 0], [0.45, -6, 0, 0]] },
        thighL: { rot: [[0, 42, 0, 2], [0.45, 18, 0, 2]] },
        shinL: { rot: [[0, -78, 0, 0], [0.45, -26, 0, 0]] },
        thighR: { rot: [[0, 38, 0, -2], [0.45, 8, 0, -2]] },
        shinR: { rot: [[0, -72, 0, 0], [0.45, -34, 0, 0]] },
        armL: { rot: [[0, -40, 0, 14], [0.45, -96, 0, 22]] },
        armR: { rot: [[0, -40, 0, -14], [0.45, -96, 0, -22]] },
        foreL: { rot: [[0, -30, 0, 0], [0.45, -18, 0, 0]] },
        foreR: { rot: [[0, -30, 0, 0], [0.45, -18, 0, 0]] },
      },
    },

    fall: {
      name: 'fall', duration: 1.2, loop: true,
      tracks: {
        root: { pos: [[0, 0, 0.945, 0], [1.2, 0, 0.945, 0]] },
        spine: { rot: [[0, -6, 0, 0], [0.6, -3, 0, 0], [1.2, -6, 0, 0]] },
        thighL: { rot: [[0, 26, 0, 4], [0.6, 16, 0, 4], [1.2, 26, 0, 4]] },
        shinL: { rot: [[0, -40, 0, 0], [0.6, -28, 0, 0], [1.2, -40, 0, 0]] },
        thighR: { rot: [[0, 12, 0, -4], [0.6, 22, 0, -4], [1.2, 12, 0, -4]] },
        shinR: { rot: [[0, -30, 0, 0], [0.6, -44, 0, 0], [1.2, -30, 0, 0]] },
        armL: { rot: [[0, -104, 0, 26], [0.6, -92, 0, 32], [1.2, -104, 0, 26]] },
        armR: { rot: [[0, -104, 0, -26], [0.6, -92, 0, -32], [1.2, -104, 0, -26]] },
        foreL: { rot: [[0, -34, 0, 0], [1.2, -34, 0, 0]] },
        foreR: { rot: [[0, -34, 0, 0], [1.2, -34, 0, 0]] },
      },
    },

    land: {
      name: 'land', duration: 0.40, loop: false,
      tracks: {
        root: { pos: [[0, 0, 0.900, 0], [0.12, 0, 0.815, 0], [0.40, 0, 0.940, 0]] },
        spine: { rot: [[0, 10, 0, 0], [0.12, 22, 0, 0], [0.40, 2, 0, 0]] },
        thighL: { rot: [[0, 30, 0, 3], [0.12, 54, 0, 3], [0.40, 2, 0, 3]] },
        shinL: { rot: [[0, -46, 0, 0], [0.12, -86, 0, 0], [0.40, -6, 0, 0]] },
        thighR: { rot: [[0, 30, 0, -3], [0.12, 54, 0, -3], [0.40, 2, 0, -3]] },
        shinR: { rot: [[0, -46, 0, 0], [0.12, -86, 0, 0], [0.40, -6, 0, 0]] },
        armL: { rot: [[0, -60, 0, 20], [0.12, -30, 0, 28], [0.40, -6, 0, 8]] },
        armR: { rot: [[0, -60, 0, -20], [0.12, -30, 0, -28], [0.40, -6, 0, -8]] },
      },
    },

    dodge: {
      name: 'dodge', duration: 0.42, loop: false,
      tracks: {
        root: { pos: [[0, 0, 0.930, 0], [0.16, 0, 0.780, 0], [0.42, 0, 0.935, 0]] },
        spine: { rot: [[0, 6, 0, 0], [0.16, 34, 0, 0], [0.42, 4, 0, 0]] },
        chest: { rot: [[0, 0, 0, 0], [0.16, 18, 0, 0], [0.42, 0, 0, 0]] },
        head: { rot: [[0, 0, 0, 0], [0.16, -24, 0, 0], [0.42, 0, 0, 0]] },
        thighL: { rot: [[0, 4, 0, 3], [0.16, 74, 0, 3], [0.42, 4, 0, 3]] },
        shinL: { rot: [[0, -8, 0, 0], [0.16, -96, 0, 0], [0.42, -8, 0, 0]] },
        thighR: { rot: [[0, 4, 0, -3], [0.16, 40, 0, -3], [0.42, 4, 0, -3]] },
        shinR: { rot: [[0, -8, 0, 0], [0.16, -70, 0, 0], [0.42, -8, 0, 0]] },
        armL: { rot: [[0, -10, 0, 8], [0.16, -76, 0, 30], [0.42, -10, 0, 8]] },
        armR: { rot: [[0, -10, 0, -8], [0.16, -76, 0, -30], [0.42, -10, 0, -8]] },
        foreL: { rot: [[0, -16, 0, 0], [0.16, -104, 0, 0], [0.42, -16, 0, 0]] },
        foreR: { rot: [[0, -16, 0, 0], [0.16, -104, 0, 0], [0.42, -16, 0, 0]] },
      },
    },

    // Capa superior: apuntar. Sólo toca torso y brazos, así las piernas siguen
    // caminando o corriendo debajo.
    aim: {
      name: 'aim', duration: 1.0, loop: true,
      tracks: {
        chest: { rot: [[0, 0, -18, 0], [1.0, 0, -18, 0]] },
        armR: { rot: [[0, -74, -14, -16], [0.5, -72, -14, -16], [1.0, -74, -14, -16]] },
        foreR: { rot: [[0, -62, 22, 0], [1.0, -62, 22, 0]] },
        armL: { rot: [[0, -68, 34, 30], [1.0, -68, 34, 30]] },
        foreL: { rot: [[0, -80, -18, 0], [1.0, -80, -18, 0]] },
        head: { rot: [[0, -4, -10, 0], [1.0, -4, -10, 0]] },
      },
    },

    fire: {
      name: 'fire', duration: 0.22, loop: false,
      tracks: {
        armR: { rot: [[0, -74, -14, -16], [0.04, -86, -14, -16], [0.22, -74, -14, -16]] },
        foreR: { rot: [[0, -62, 22, 0], [0.04, -48, 22, 0], [0.22, -62, 22, 0]] },
        chest: { rot: [[0, 0, -18, 0], [0.04, -6, -20, 0], [0.22, 0, -18, 0]] },
      },
    },

    reload: {
      name: 'reload', duration: 1.5, loop: false,
      tracks: {
        armR: { rot: [[0, -74, -14, -16], [0.3, -50, -20, -10], [1.1, -50, -20, -10], [1.5, -74, -14, -16]] },
        foreR: { rot: [[0, -62, 22, 0], [0.3, -84, 30, 0], [1.1, -84, 30, 0], [1.5, -62, 22, 0]] },
        armL: { rot: [[0, -68, 34, 30], [0.35, -30, 20, 40], [0.7, -86, 40, 26], [1.5, -68, 34, 30]] },
        foreL: { rot: [[0, -80, -18, 0], [0.35, -120, -10, 0], [0.7, -60, -24, 0], [1.5, -80, -18, 0]] },
        head: { rot: [[0, -4, -10, 0], [0.4, 14, -6, 0], [1.0, 12, -8, 0], [1.5, -4, -10, 0]] },
      },
    },

    // Escalada del titán: colgado de una placa, un brazo arriba.
    climb: {
      name: 'climb', duration: 1.6, loop: true,
      tracks: {
        root: { pos: [[0, 0, 0.920, 0], [0.8, 0, 0.950, 0], [1.6, 0, 0.920, 0]] },
        spine: { rot: [[0, -8, 6, 0], [0.8, -8, -6, 0], [1.6, -8, 6, 0]] },
        armL: { rot: [[0, -158, 0, 16], [0.8, -132, 0, 24], [1.6, -158, 0, 16]] },
        foreL: { rot: [[0, -36, 0, 0], [0.8, -66, 0, 0], [1.6, -36, 0, 0]] },
        armR: { rot: [[0, -132, 0, -24], [0.8, -158, 0, -16], [1.6, -132, 0, -24]] },
        foreR: { rot: [[0, -66, 0, 0], [0.8, -36, 0, 0], [1.6, -66, 0, 0]] },
        thighL: { rot: [[0, 44, 0, 8], [0.8, 20, 0, 8], [1.6, 44, 0, 8]] },
        shinL: { rot: [[0, -70, 0, 0], [0.8, -40, 0, 0], [1.6, -70, 0, 0]] },
        thighR: { rot: [[0, 20, 0, -8], [0.8, 44, 0, -8], [1.6, 20, 0, -8]] },
        shinR: { rot: [[0, -40, 0, 0], [0.8, -70, 0, 0], [1.6, -40, 0, 0]] },
        head: { rot: [[0, -22, 0, 0], [1.6, -22, 0, 0]] },
      },
    },

    death: {
      name: 'death', duration: 1.3, loop: false,
      tracks: {
        root: { pos: [[0, 0, 0.930, 0], [0.5, 0, 0.560, 0], [1.3, 0, 0.300, 0]],
                rot: [[0, 0, 0, 0], [1.3, -12, 20, 0]] },
        spine: { rot: [[0, 0, 0, 0], [0.5, 26, 0, 10], [1.3, 42, 0, 18]] },
        chest: { rot: [[0, 0, 0, 0], [1.3, 24, 0, 12]] },
        head: { rot: [[0, 0, 0, 0], [0.4, -24, 0, 0], [1.3, 30, 0, 14]] },
        armL: { rot: [[0, -10, 0, 8], [0.4, -70, 0, 40], [1.3, -14, 0, 52]] },
        armR: { rot: [[0, -10, 0, -8], [0.4, -60, 0, -30], [1.3, -8, 0, -46]] },
        thighL: { rot: [[0, 0, 0, 2], [0.5, 50, 0, 8], [1.3, 72, 0, 14]] },
        shinL: { rot: [[0, -4, 0, 0], [1.3, -84, 0, 0]] },
        thighR: { rot: [[0, 0, 0, -2], [0.5, 34, 0, -6], [1.3, 54, 0, -10]] },
        shinR: { rot: [[0, -4, 0, 0], [1.3, -68, 0, 0]] },
      },
    },

    // --- clips de campamento (los supervivientes)
    sit: {
      name: 'sit', duration: 6.0, loop: true,
      tracks: {
        root: { pos: [[0, 0, 0.470, 0], [3, 0, 0.462, 0], [6, 0, 0.470, 0]] },
        spine: { rot: [[0, 16, 0, 0], [3, 20, 0, 0], [6, 16, 0, 0]] },
        chest: { rot: [[0, 6, 3, 0], [3, 4, -3, 0], [6, 6, 3, 0]] },
        head: { rot: [[0, -6, -8, 0], [2, 4, 10, 0], [4.2, -2, 2, 0], [6, -6, -8, 0]] },
        thighL: { rot: [[0, 86, 0, 9], [6, 86, 0, 9]] },
        shinL: { rot: [[0, -88, 0, 0], [6, -88, 0, 0]] },
        footL: { rot: [[0, 8, 0, 0], [6, 8, 0, 0]] },
        thighR: { rot: [[0, 84, 0, -12], [6, 84, 0, -12]] },
        shinR: { rot: [[0, -92, 0, 0], [6, -92, 0, 0]] },
        footR: { rot: [[0, 10, 0, 0], [6, 10, 0, 0]] },
        armL: { rot: [[0, -34, 0, 22], [3, -30, 0, 24], [6, -34, 0, 22]] },
        foreL: { rot: [[0, -74, 0, 0], [3, -80, 0, 0], [6, -74, 0, 0]] },
        armR: { rot: [[0, -34, 0, -22], [3, -30, 0, -24], [6, -34, 0, -22]] },
        foreR: { rot: [[0, -74, 0, 0], [3, -80, 0, 0], [6, -74, 0, 0]] },
      },
    },

    // Reparando algo en el suelo: en cuclillas, manos ocupadas.
    work: {
      name: 'work', duration: 3.2, loop: true,
      tracks: {
        root: { pos: [[0, 0, 0.610, 0], [1.6, 0, 0.592, 0], [3.2, 0, 0.610, 0]] },
        spine: { rot: [[0, 30, 0, 0], [1.6, 34, 0, 0], [3.2, 30, 0, 0]] },
        chest: { rot: [[0, 14, 4, 0], [1.6, 16, -4, 0], [3.2, 14, 4, 0]] },
        head: { rot: [[0, 26, -6, 0], [1.6, 30, 6, 0], [3.2, 26, -6, 0]] },
        thighL: { rot: [[0, 104, 0, 14], [3.2, 104, 0, 14]] },
        shinL: { rot: [[0, -128, 0, 0], [3.2, -128, 0, 0]] },
        footL: { rot: [[0, 26, 0, 0], [3.2, 26, 0, 0]] },
        thighR: { rot: [[0, 96, 0, -16], [3.2, 96, 0, -16]] },
        shinR: { rot: [[0, -122, 0, 0], [3.2, -122, 0, 0]] },
        footR: { rot: [[0, 24, 0, 0], [3.2, 24, 0, 0]] },
        armL: { rot: [[0, -62, 12, 24], [0.8, -50, 18, 20], [1.6, -66, 8, 26], [3.2, -62, 12, 24]] },
        foreL: { rot: [[0, -78, 0, 0], [0.8, -96, 0, 0], [1.6, -70, 0, 0], [3.2, -78, 0, 0]] },
        armR: { rot: [[0, -58, -14, -22], [1.0, -68, -8, -26], [2.1, -52, -18, -18], [3.2, -58, -14, -22]] },
        foreR: { rot: [[0, -84, 0, 0], [1.0, -66, 0, 0], [2.1, -92, 0, 0], [3.2, -84, 0, 0]] },
      },
    },

    // De guardia: rifle en bajo, barrido lento del horizonte.
    guard: {
      name: 'guard', duration: 7.0, loop: true,
      tracks: {
        root: { pos: [[0, 0, 0.936, 0], [3.5, 0, 0.930, 0], [7, 0, 0.936, 0]] },
        spine: { rot: [[0, 2, -6, 0], [3.5, 2, 6, 0], [7, 2, -6, 0]] },
        chest: { rot: [[0, -2, -10, 0], [3.5, -2, 10, 0], [7, -2, -10, 0]] },
        head: { rot: [[0, 0, -18, 0], [1.8, -2, 4, 0], [4.0, 0, 20, 0], [7, 0, -18, 0]] },
        armR: { rot: [[0, -30, -10, -14], [3.5, -34, -10, -12], [7, -30, -10, -14]] },
        foreR: { rot: [[0, -86, 26, 0], [3.5, -82, 26, 0], [7, -86, 26, 0]] },
        armL: { rot: [[0, -46, 24, 26], [3.5, -50, 24, 24], [7, -46, 24, 26]] },
        foreL: { rot: [[0, -96, -14, 0], [3.5, -92, -14, 0], [7, -96, -14, 0]] },
        thighL: { rot: [[0, 2, 0, 4], [7, 2, 0, 4]] },
        thighR: { rot: [[0, -2, 0, -5], [7, -2, 0, -5]] },
        shinL: { rot: [[0, -5, 0, 0], [7, -5, 0, 0]] },
        shinR: { rot: [[0, -4, 0, 0], [7, -4, 0, 0]] },
      },
    },

    // Herida: sentada contra una caja, sosteniéndose el costado.
    hurt: {
      name: 'hurt', duration: 4.4, loop: true,
      tracks: {
        root: { pos: [[0, 0, 0.430, 0], [2.2, 0, 0.420, 0], [4.4, 0, 0.430, 0]],
                rot: [[0, -14, 0, 6], [4.4, -14, 0, 6]] },
        spine: { rot: [[0, 22, 0, -8], [2.2, 26, 0, -10], [4.4, 22, 0, -8]] },
        chest: { rot: [[0, 10, 0, -6], [2.2, 14, 0, -8], [4.4, 10, 0, -6]] },
        head: { rot: [[0, 16, 8, -4], [2.2, 22, -4, -6], [4.4, 16, 8, -4]] },
        thighL: { rot: [[0, 78, 0, 16], [4.4, 78, 0, 16]] },
        shinL: { rot: [[0, -62, 0, 0], [4.4, -62, 0, 0]] },
        thighR: { rot: [[0, 70, 0, -20], [4.4, 70, 0, -20]] },
        shinR: { rot: [[0, -54, 0, 0], [4.4, -54, 0, 0]] },
        armL: { rot: [[0, -52, 26, 30], [2.2, -56, 28, 32], [4.4, -52, 26, 30]] },
        foreL: { rot: [[0, -96, -30, 0], [2.2, -100, -32, 0], [4.4, -96, -30, 0]] },
        armR: { rot: [[0, -18, 0, -14], [4.4, -18, 0, -14]] },
        foreR: { rot: [[0, -34, 0, 0], [4.4, -34, 0, 0]] },
      },
    },

    wave: {
      name: 'wave', duration: 2.2, loop: false,
      tracks: {
        armL: { rot: [[0, -10, 0, 8], [0.35, -146, 0, 34], [0.8, -150, 0, 30],
                      [1.2, -146, 0, 38], [1.6, -150, 0, 30], [2.2, -10, 0, 8]] },
        foreL: { rot: [[0, -16, 0, 0], [0.35, -28, 0, 0], [2.2, -16, 0, 0]] },
        chest: { rot: [[0, 0, 0, 0], [0.6, 0, 12, 0], [1.6, 0, 12, 0], [2.2, 0, 0, 0]] },
        head: { rot: [[0, 0, 0, 0], [0.6, -6, 14, 0], [1.6, -6, 14, 0], [2.2, 0, 0, 0]] },
      },
    },
  };

  let _clips = null;
  function clips() {
    if (!_clips) {
      _clips = {};
      for (const key in CLIP_SPECS) _clips[key] = EV.Anim.createClip(CLIP_SPECS[key]);
    }
    return _clips;
  }

  // ---------------------------------------------------------------- instancia
  const MESH_CACHE = Object.create(null);
  function meshFor(style) {
    if (!MESH_CACHE[style]) MESH_CACHE[style] = buildMesh(style);
    return MESH_CACHE[style];
  }

  // Paletas: cada personaje se reconoce a distancia por su acento.
  const PALETTES = {
    engineer: { suit: [0.088, 0.086, 0.082], armor: [0.315, 0.300, 0.272], accent: [1.05, 0.42, 0.10] },
    soldier: { suit: [0.070, 0.074, 0.078], armor: [0.245, 0.255, 0.268], accent: [0.20, 0.62, 1.15] },
    technician: { suit: [0.095, 0.090, 0.078], armor: [0.360, 0.335, 0.280], accent: [1.20, 0.95, 0.22] },
    wounded: { suit: [0.082, 0.078, 0.076], armor: [0.290, 0.275, 0.262], accent: [0.95, 0.20, 0.16] },
  };

  function create(style, opts = {}) {
    const sk = skeleton();
    const c = {
      style,
      mesh: meshFor(style),
      skeleton: sk,
      pose: EV.Anim.createPose(sk),
      animator: EV.Anim.createAnimator(sk, clips()),
      skin: EV.Anim.createSkinInstance(sk),
      pos: V3.create(opts.pos ? opts.pos[0] : 0, opts.pos ? opts.pos[1] : 0, opts.pos ? opts.pos[2] : 0),
      yaw: opts.yaw || 0,
      scale: opts.scale || 1,
      palette: Object.assign({}, PALETTES[style] || PALETTES.engineer, opts.palette || {}),
      visible: true,
      lookAt: null,           // objetivo para la mirada
      lookWeight: 0,
      model: EV.M4.create(),
      prevModel: EV.M4.create(),
      name: opts.name || style,
    };
    c.animator.play(opts.clip || 'idle', { offset: opts.offset || 0 });

    const _rot = V3.create();
    const _q = Q.create(), _qh = Q.create();

    // Mirada: rota cabeza y pecho hacia un objetivo, con límite de giro. Es
    // barato y es lo que hace que un NPC parado deje de parecer una estatua.
    function applyLookAt() {
      if (!c.lookAt || c.lookWeight < 0.01) return;
      const dx = c.lookAt[0] - c.pos[0];
      const dz = c.lookAt[2] - c.pos[2];
      const dy = c.lookAt[1] - (c.pos[1] + 1.5 * c.scale);
      const targetYaw = M.wrapAngle(Math.atan2(dx, dz) - c.yaw);
      const dist = Math.hypot(dx, dz);
      const targetPitch = -Math.atan2(dy, Math.max(dist, 0.2));
      // Fuera de ~100° el personaje no gira la cabeza: se quedaría antinatural.
      const reach = M.clamp(1 - Math.abs(targetYaw) / 1.75, 0, 1) * c.lookWeight;
      if (reach < 0.01) return;

      const yawHead = M.clamp(targetYaw, -1.0, 1.0) * reach;
      const pitchHead = M.clamp(targetPitch, -0.6, 0.6) * reach;
      const iHead = sk.index.head, iChest = sk.index.chest;

      Q.fromEuler(_qh, pitchHead * 0.65, yawHead * 0.62, 0);
      Q.multiply(_q, c.pose.rot.subarray(iHead * 4, iHead * 4 + 4), _qh);
      c.pose.rot.set(_q, iHead * 4);

      Q.fromEuler(_qh, pitchHead * 0.18, yawHead * 0.30, 0);
      Q.multiply(_q, c.pose.rot.subarray(iChest * 4, iChest * 4 + 4), _qh);
      c.pose.rot.set(_q, iChest * 4);
    }

    c.update = function (dt) {
      c.animator.update(dt);
      c.animator.apply(c.pose);
      applyLookAt();
      EV.M4.copy(c.prevModel, c.model);
      V3.set(_rot, 0, c.yaw, 0);
      EV.M4.compose(c.model, c.pos, _rot, V3.create(c.scale, c.scale, c.scale));
      c.skin.computeMatrices(c.pose, c.model);
      c.skin.upload();
    };

    c.bonePos = function (name, out) {
      return c.skin.boneWorldPos(sk.bone(name), out);
    };

    return c;
  }

  EV.Characters = {
    skeleton, clips, create, buildMesh, buildRaw, meshFor,
    BONES, STYLES, PALETTES, CLIP_SPECS,
  };
})(window.EV = window.EV || {});
