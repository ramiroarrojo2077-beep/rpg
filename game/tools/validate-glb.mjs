// Valida los .glb exportados: cabecera, límites de accesores, integridad del
// esqueleto y de las animaciones, y normalización de pesos de piel.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(process.argv[2] || join(here, '..', 'assets', 'characters'));
const files = readdirSync(dir).filter(f => f.endsWith('.glb'));
if (!files.length) { console.error('no hay .glb en ' + dir); process.exit(1); }

const COMPS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const CSIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

let failures = 0;
for (const f of files) {
  const buf = readFileSync(join(dir, f));
  const problems = [];
  const check = (cond, msg) => { if (!cond) problems.push(msg); };

  const magic = buf.readUInt32LE(0);
  check(magic === 0x46546C67, 'magic glTF inválido');
  check(buf.readUInt32LE(4) === 2, 'versión != 2');
  check(buf.readUInt32LE(8) === buf.length, 'longitud declarada != tamaño real');

  const jsonLen = buf.readUInt32LE(12);
  check(buf.readUInt32LE(16) === 0x4E4F534A, 'primer chunk no es JSON');
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));

  const binOff = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binOff);
  check(buf.readUInt32LE(binOff + 4) === 0x004E4942, 'segundo chunk no es BIN');
  const bin = buf.subarray(binOff + 8, binOff + 8 + binLen);

  // --- accesores dentro de su vista, vistas dentro del búfer
  gltf.accessors.forEach((a, i) => {
    const v = gltf.bufferViews[a.bufferView];
    check(!!v, `accesor ${i} sin bufferView`);
    if (!v) return;
    const need = a.count * COMPS[a.type] * CSIZE[a.componentType];
    check(need <= v.byteLength, `accesor ${i} excede su vista (${need} > ${v.byteLength})`);
    check(v.byteOffset + v.byteLength <= bin.length,
      `vista ${a.bufferView} fuera del búfer binario`);
    check(v.byteOffset % 4 === 0, `vista ${a.bufferView} desalineada`);
  });
  check(gltf.buffers[0].byteLength <= bin.length, 'búfer declarado mayor que el chunk BIN');

  // --- esqueleto
  const skin = gltf.skins[0];
  check(!!skin, 'sin skin');
  const nodeCount = gltf.nodes.length;
  skin.joints.forEach((j, i) => check(j >= 0 && j < nodeCount, `joint ${i} fuera de rango`));
  const ibm = gltf.accessors[skin.inverseBindMatrices];
  check(ibm.count === skin.joints.length,
    `inverseBindMatrices (${ibm.count}) != joints (${skin.joints.length})`);

  // Jerarquía: cada nodo aparece como hijo a lo sumo una vez.
  const seen = new Map();
  gltf.nodes.forEach((n, i) => (n.children || []).forEach(c => {
    check(!seen.has(c), `nodo ${c} tiene más de un padre`);
    seen.set(c, i);
  }));

  // --- geometría: índices y pesos
  const prim = gltf.meshes[0].primitives[0];
  const readAcc = (idx) => {
    const a = gltf.accessors[idx];
    const v = gltf.bufferViews[a.bufferView];
    const n = a.count * COMPS[a.type];
    const off = v.byteOffset;
    if (a.componentType === 5126) return new Float32Array(bin.buffer, bin.byteOffset + off, n);
    if (a.componentType === 5123) return new Uint16Array(bin.buffer, bin.byteOffset + off, n);
    if (a.componentType === 5125) return new Uint32Array(bin.buffer, bin.byteOffset + off, n);
    return null;
  };
  const pos = readAcc(prim.attributes.POSITION);
  const idx = readAcc(prim.indices);
  const jnt = readAcc(prim.attributes.JOINTS_0);
  const wgt = readAcc(prim.attributes.WEIGHTS_0);
  const vertCount = gltf.accessors[prim.attributes.POSITION].count;

  let maxIdx = 0;
  for (let i = 0; i < idx.length; i++) maxIdx = Math.max(maxIdx, idx[i]);
  check(maxIdx < vertCount, `índice ${maxIdx} fuera del rango de vértices (${vertCount})`);
  check(idx.length % 3 === 0, 'cantidad de índices no múltiplo de 3');

  let maxJoint = 0, worstWeight = 0, nonFinite = 0;
  for (let i = 0; i < vertCount; i++) {
    let sum = 0;
    for (let c = 0; c < 4; c++) {
      maxJoint = Math.max(maxJoint, jnt[i * 4 + c]);
      sum += wgt[i * 4 + c];
    }
    worstWeight = Math.max(worstWeight, Math.abs(sum - 1));
  }
  for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) nonFinite++;
  check(maxJoint < skin.joints.length, `índice de hueso ${maxJoint} fuera de rango`);
  check(worstWeight < 1e-3, `pesos de piel sin normalizar (desvío ${worstWeight.toFixed(5)})`);
  check(nonFinite === 0, `${nonFinite} posiciones no finitas`);

  // --- animaciones
  let channels = 0;
  for (const anim of gltf.animations) {
    check(anim.channels.length > 0, `animación ${anim.name} sin canales`);
    for (const ch of anim.channels) {
      channels++;
      check(ch.sampler < anim.samplers.length, `canal con sampler inválido en ${anim.name}`);
      check(ch.target.node < nodeCount, `canal apunta a nodo inexistente en ${anim.name}`);
      const sm = anim.samplers[ch.sampler];
      const inp = gltf.accessors[sm.input], outp = gltf.accessors[sm.output];
      check(inp.count === outp.count,
        `sampler descompensado en ${anim.name}: ${inp.count} tiempos vs ${outp.count} valores`);
      const comps = ch.target.path === 'rotation' ? 'VEC4' : 'VEC3';
      check(outp.type === comps,
        `tipo de salida ${outp.type} incorrecto para ${ch.target.path} en ${anim.name}`);
      check(inp.min && inp.min[0] >= 0, `tiempos negativos en ${anim.name}`);
    }
  }

  const ok = problems.length === 0;
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FALLA'} ${f} — ${vertCount} vértices, ${idx.length / 3} triángulos, ` +
    `${skin.joints.length} huesos, ${gltf.animations.length} animaciones, ${channels} canales`);
  problems.forEach(p => console.log('        · ' + p));
}
console.log(`\n${files.length - failures}/${files.length} archivos válidos`);
process.exit(failures ? 1 : 0);
