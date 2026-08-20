// Ecos del Vacío — exportador glTF 2.0 con piel y animaciones.
// No forma parte del juego: se carga sólo desde tools/export.html para volcar
// los personajes generados proceduralmente a un formato que abra cualquier DCC
// (Blender, Maya, three.js). Reutiliza exactamente la misma geometría y los
// mismos clips que corren en el juego — no hay una segunda fuente de verdad.
(function (EV) {
  'use strict';

  // Constantes de glTF (evita depender de nombres de WebGL).
  const FLOAT = 5126, UNSIGNED_SHORT = 5123, UNSIGNED_INT = 5125;
  const ARRAY_BUFFER = 34962, ELEMENT_ARRAY_BUFFER = 34963;

  function build(style) {
    const sk = EV.Characters.skeleton();
    const raw = EV.Characters.buildRaw(style);
    const clips = EV.Characters.clips();
    const palette = EV.Characters.PALETTES[style] || EV.Characters.PALETTES.engineer;

    const chunks = [];      // {data: ArrayBuffer|TypedArray}
    let byteLength = 0;
    const bufferViews = [];
    const accessors = [];

    function addBufferView(typedArray, target) {
      // glTF exige alineación a 4 bytes entre vistas.
      const pad = (4 - (byteLength % 4)) % 4;
      if (pad) { chunks.push(new Uint8Array(pad)); byteLength += pad; }
      const view = {
        buffer: 0,
        byteOffset: byteLength,
        byteLength: typedArray.byteLength,
      };
      if (target) view.target = target;
      bufferViews.push(view);
      chunks.push(typedArray);
      byteLength += typedArray.byteLength;
      return bufferViews.length - 1;
    }

    function minMax(array, comps) {
      const min = new Array(comps).fill(Infinity);
      const max = new Array(comps).fill(-Infinity);
      for (let i = 0; i < array.length; i += comps) {
        for (let c = 0; c < comps; c++) {
          const v = array[i + c];
          if (v < min[c]) min[c] = v;
          if (v > max[c]) max[c] = v;
        }
      }
      return { min, max };
    }

    const TYPE_BY_COMPS = { 1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4', 16: 'MAT4' };

    function addAccessor(typedArray, comps, componentType, target, withBounds) {
      const view = addBufferView(typedArray, target);
      const acc = {
        bufferView: view,
        componentType,
        count: typedArray.length / comps,
        type: TYPE_BY_COMPS[comps],
      };
      if (withBounds) {
        const b = minMax(typedArray, comps);
        acc.min = b.min; acc.max = b.max;
      }
      accessors.push(acc);
      return accessors.length - 1;
    }

    // ------------------------------------------------------------- geometría
    const positions = new Float32Array(raw.positions);
    const normals = new Float32Array(raw.normals);
    const joints = new Uint16Array(raw.boneIdx);
    const weights = new Float32Array(raw.boneWgt);
    // El submaterial viaja como TEXCOORD_1.x: glTF no tiene un canal genérico,
    // y así sobrevive el viaje por Blender sin inventar una extensión.
    const submat = new Float32Array(raw.vertexCount * 2);
    for (let i = 0; i < raw.vertexCount; i++) {
      submat[i * 2] = raw.extras[i];
      submat[i * 2 + 1] = 0;
    }
    const indices = raw.vertexCount > 65535
      ? new Uint32Array(raw.indices)
      : new Uint16Array(raw.indices);

    const accPos = addAccessor(positions, 3, FLOAT, ARRAY_BUFFER, true);
    const accNrm = addAccessor(normals, 3, FLOAT, ARRAY_BUFFER, false);
    const accJoint = addAccessor(joints, 4, UNSIGNED_SHORT, ARRAY_BUFFER, false);
    const accWeight = addAccessor(weights, 4, FLOAT, ARRAY_BUFFER, false);
    const accSub = addAccessor(submat, 2, FLOAT, ARRAY_BUFFER, false);
    const accIdx = addAccessor(indices,
      1, raw.vertexCount > 65535 ? UNSIGNED_INT : UNSIGNED_SHORT, ELEMENT_ARRAY_BUFFER, false);

    // --------------------------------------------------------------- huesos
    // Nodo 0 = malla con piel. Nodos 1..n = huesos.
    const BONE_BASE = 1;
    const nodes = [{
      name: 'ecos_' + style,
      mesh: 0,
      skin: 0,
    }];

    const childrenOf = new Array(sk.count).fill(null).map(() => []);
    for (let i = 0; i < sk.count; i++) {
      const p = sk.parents[i];
      if (p >= 0) childrenOf[p].push(BONE_BASE + i);
    }
    const roots = [];
    for (let i = 0; i < sk.count; i++) {
      const node = {
        name: sk.names[i],
        translation: [sk.bindPos[i * 3], sk.bindPos[i * 3 + 1], sk.bindPos[i * 3 + 2]],
        rotation: [sk.bindRot[i * 4], sk.bindRot[i * 4 + 1],
                   sk.bindRot[i * 4 + 2], sk.bindRot[i * 4 + 3]],
      };
      if (childrenOf[i].length) node.children = childrenOf[i];
      nodes.push(node);
      if (sk.parents[i] < 0) roots.push(BONE_BASE + i);
    }

    const accIBM = addAccessor(new Float32Array(sk.inverseBind), 16, FLOAT, null, false);
    const skin = {
      name: 'esqueleto_humano',
      inverseBindMatrices: accIBM,
      joints: Array.from({ length: sk.count }, (_, i) => BONE_BASE + i),
      skeleton: roots[0],
    };

    // ----------------------------------------------------------- animaciones
    const animations = [];
    for (const key in clips) {
      const clip = clips[key];
      const samplers = [];
      const channels = [];

      for (const track of clip.tracks) {
        const boneIndex = sk.index[track.bone];
        if (boneIndex === undefined) continue;

        if (track.rot && track.rot.length) {
          const times = new Float32Array(track.rot.map(k => k.t));
          const values = new Float32Array(track.rot.length * 4);
          track.rot.forEach((k, i) => values.set(k.q, i * 4));
          const accIn = addAccessor(times, 1, FLOAT, null, true);
          const accOut = addAccessor(values, 4, FLOAT, null, false);
          samplers.push({ input: accIn, output: accOut, interpolation: 'LINEAR' });
          channels.push({
            sampler: samplers.length - 1,
            target: { node: BONE_BASE + boneIndex, path: 'rotation' },
          });
        }
        if (track.pos && track.pos.length) {
          const times = new Float32Array(track.pos.map(k => k.t));
          const values = new Float32Array(track.pos.length * 3);
          track.pos.forEach((k, i) => values.set(k.p, i * 3));
          const accIn = addAccessor(times, 1, FLOAT, null, true);
          const accOut = addAccessor(values, 3, FLOAT, null, false);
          samplers.push({ input: accIn, output: accOut, interpolation: 'LINEAR' });
          channels.push({
            sampler: samplers.length - 1,
            target: { node: BONE_BASE + boneIndex, path: 'translation' },
          });
        }
      }
      if (channels.length) animations.push({ name: clip.name, samplers, channels });
    }

    // ------------------------------------------------------------ materiales
    // El juego resuelve cuatro submateriales en el shader; glTF sólo admite uno
    // por primitiva, así que se exporta el traje como base y el resto queda en
    // TEXCOORD_1 para que el destino lo reconstruya si quiere.
    const srgb = (c) => Math.min(1, Math.pow(Math.max(c, 0), 1 / 2.2));
    const material = {
      name: 'traje_' + style,
      pbrMetallicRoughness: {
        baseColorFactor: [srgb(palette.suit[0]), srgb(palette.suit[1]), srgb(palette.suit[2]), 1],
        metallicFactor: 0.1,
        roughnessFactor: 0.72,
      },
      emissiveFactor: [
        Math.min(1, palette.accent[0] * 0.3),
        Math.min(1, palette.accent[1] * 0.3),
        Math.min(1, palette.accent[2] * 0.3),
      ],
      doubleSided: false,
    };

    // Concatena todo el binario.
    const buffer = new Uint8Array(byteLength);
    let offset = 0;
    for (const c of chunks) {
      const bytes = c instanceof Uint8Array
        ? c
        : new Uint8Array(c.buffer, c.byteOffset, c.byteLength);
      buffer.set(bytes, offset);
      offset += bytes.byteLength;
    }

    const gltf = {
      asset: { version: '2.0', generator: 'Ecos del Vacío — exportador procedural' },
      scene: 0,
      scenes: [{ name: style, nodes: [0].concat(roots) }],
      nodes,
      meshes: [{
        name: 'malla_' + style,
        primitives: [{
          attributes: {
            POSITION: accPos,
            NORMAL: accNrm,
            JOINTS_0: accJoint,
            WEIGHTS_0: accWeight,
            TEXCOORD_1: accSub,
          },
          indices: accIdx,
          material: 0,
        }],
      }],
      materials: [material],
      skins: [skin],
      animations,
      accessors,
      bufferViews,
      buffers: [{ byteLength }],
    };

    return {
      gltf, buffer,
      stats: {
        style,
        vertices: raw.vertexCount,
        triangles: raw.triangleCount,
        bones: sk.count,
        animations: animations.length,
        bytes: byteLength,
      },
    };
  }

  // Empaqueta en .glb (binario único): un solo archivo, sin .bin suelto.
  function toGLB(style) {
    const { gltf, buffer, stats } = build(style);
    gltf.buffers[0] = { byteLength: buffer.byteLength };

    const jsonText = JSON.stringify(gltf);
    const enc = new TextEncoder();
    let jsonBytes = enc.encode(jsonText);
    const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
    if (jsonPad) {
      const padded = new Uint8Array(jsonBytes.byteLength + jsonPad);
      padded.set(jsonBytes);
      padded.fill(0x20, jsonBytes.byteLength);   // relleno con espacios
      jsonBytes = padded;
    }
    const binPad = (4 - (buffer.byteLength % 4)) % 4;
    const binLen = buffer.byteLength + binPad;

    const total = 12 + 8 + jsonBytes.byteLength + 8 + binLen;
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    let o = 0;
    dv.setUint32(o, 0x46546C67, true); o += 4;   // 'glTF'
    dv.setUint32(o, 2, true); o += 4;
    dv.setUint32(o, total, true); o += 4;
    dv.setUint32(o, jsonBytes.byteLength, true); o += 4;
    dv.setUint32(o, 0x4E4F534A, true); o += 4;   // 'JSON'
    out.set(jsonBytes, o); o += jsonBytes.byteLength;
    dv.setUint32(o, binLen, true); o += 4;
    dv.setUint32(o, 0x004E4942, true); o += 4;   // 'BIN'
    out.set(buffer, o);

    return { bytes: out, stats };
  }

  EV.Export = { build, toGLB };
})(window.EV = window.EV || {});
