// Builds the web-ready MacBook Pro model from the OBJ export (units: cm, Y up, front = +Z).
// - splits the one-piece base shell into the upper case and the bottom case at the side seam
// - groups the side-port hardware with the board each port belongs to
// - keeps the display assembly as one group, hinged at the clutch
// - embeds the textures the page needs, then quantizes
import { NodeIO, Document } from '@gltf-transform/core';
import { KHRMeshQuantization } from '@gltf-transform/extensions';
import { quantize, dedup, prune } from '@gltf-transform/functions';
import fs from 'fs';
import path from 'path';
import { readOBJ } from './objparse.mjs';

const [, , SRC_DIR, OUT] = process.argv;
const obj = readOBJ(path.join(SRC_DIR, 'mpm_f21__Apple_MacBook_Pro_15.obj'));
const S = 0.1; // mm -> cm
const V = obj.V.map((p) => p.map((x) => x * S)), VT = obj.VT, VN = obj.VN;

// connected components per (group, material), by welded positions
function components(list) {
  const key = (i) => V[i].map((x) => Math.round(x * 1000)).join(',');
  const id = new Map(), vid = (i) => { const k = key(i); if (!id.has(k)) id.set(k, id.size); return id.get(k); };
  const fv = list.map((f) => f.c.map(([v]) => vid(v)));
  const par = Array.from({ length: id.size }, (_, i) => i);
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (const [a, b, c] of fv) { par[find(a)] = find(b); par[find(c)] = find(b); }
  const comps = new Map();
  list.forEach((f, i) => {
    const r = find(fv[i][0]);
    if (!comps.has(r)) comps.set(r, { faces: [], mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] });
    const c = comps.get(r); c.faces.push(f);
    for (const [v] of f.c) for (let a = 0; a < 3; a++) { c.mn[a] = Math.min(c.mn[a], V[v][a]); c.mx[a] = Math.max(c.mx[a], V[v][a]); }
  });
  return [...comps.values()].map((c) => ({ ...c, ctr: c.mn.map((v, i) => (v + c.mx[i]) / 2) }));
}
const groups = {}; // groups[g][mat] = faces
const put = (g, mat, faces) => { groups[g] ??= {}; (groups[g][mat] ??= []).push(...faces); };
const pick = (grp, mat) => obj.faces.filter((f) => f.g.includes(grp) && f.m === mat);

// ---- base: aluminium shell split at the side seam (y = 0.67 cm, where the rounded bottom meets the wall)
const SEAM = 0.67;
for (const c of components(pick('Keyboard', 'aluminium'))) {
  if (c.faces.length < 1000) { put('dcin', 'alu', c.faces); continue; } // MagSafe 2 surround
  for (const f of c.faces) {
    const cy = f.c.reduce((s, [v]) => s + V[v][1], 0) / 3;
    put(cy < SEAM ? 'bottomCase' : 'topCase', 'alu', [f]);
  }
}
put('topCase', 'keys', pick('Keyboard', 'keyboard'));
put('trackpad', 'touchpad', pick('Keyboard', 'touchpad'));
put('bottomCase', 'screws', pick('Keyboard', 'screws'));
for (const c of components(pick('Keyboard', 'rubber'))) put(c.mx[1] < 0.2 ? 'bottomCase' : 'ioBoard', c.mx[1] < 0.2 ? 'rubber' : 'black', c.faces);
// ports: left side -> MagSafe (DC-in board), Thunderbolt x2 + USB (logic board), headphone (audio board); right side -> I/O board
const portGroup = (c) => {
  const [x, , z] = c.ctr;
  if (x > 0) return 'ioBoard';
  if (z < -9.0) return 'dcin';
  if (z > -4.2) return 'audio';
  return 'logic';
};
for (const mat of ['metal', 'white_plastic']) for (const c of components(pick('Keyboard', mat))) put(portGroup(c), mat === 'metal' ? 'metal' : 'white', c.faces);

// ---- display assembly
const D = { aluminium: 'alu', keyboard: 'black', display: 'screen', apple: 'apple', display_frame: 'frame', glass: 'glass' };
for (const [m, n] of Object.entries(D)) put('lid', n, pick('Display', m));

// ---- write
const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('mbp');
const tex = (file, mime = 'image/jpeg') => doc.createTexture(file).setImage(fs.readFileSync(path.join(SRC_DIR, file))).setMimeType(mime);
const T = { alu: tex('mpm_f21_text_mask.jpg'), keys: tex('mpm_f21_keyboard_diff.jpg'), apple: tex('mpm_f21_apple_logo_diff.jpg'), screws: tex('mpm_f21_screw_diff.jpg') };
const BASE = { alu: [0.78, 0.79, 0.8, 1], keys: [1, 1, 1, 1], touchpad: [0.76, 0.78, 0.79, 1], screws: [0.5, 0.5, 0.5, 1], rubber: [0.05, 0.05, 0.05, 1], black: [0.03, 0.03, 0.03, 1], metal: [0.6, 0.6, 0.6, 1], white: [0.8, 0.8, 0.82, 1], screen: [0.02, 0.02, 0.02, 1], apple: [1, 1, 1, 1], frame: [0.01, 0.01, 0.01, 1], glass: [0, 0, 0, 1] };
const mats = {};
const mat = (n) => mats[n] ??= (() => { const m = doc.createMaterial(n).setBaseColorFactor(BASE[n] ?? [1, 0, 1, 1]).setRoughnessFactor(0.5).setMetallicFactor(n === 'metal' ? 1 : 0); if (T[n]) m.setBaseColorTexture(T[n]); return m; })();
const stats = {};
for (const [g, byMat] of Object.entries(groups)) {
  const mesh = doc.createMesh(g);
  let tris = 0;
  for (const [mname, faces] of Object.entries(byMat)) {
    const pos = [], nrm = [], uv = [], idx = [], remap = new Map();
    for (const f of faces) for (const [v, t, n] of f.c) {
      const k = `${v}/${t}/${n}`;
      if (!remap.has(k)) {
        remap.set(k, pos.length / 3);
        pos.push(...V[v]);
        nrm.push(...(n >= 0 ? VN[n] : [0, 1, 0]));
        uv.push(t >= 0 ? VT[t][0] : 0, t >= 0 ? 1 - VT[t][1] : 0);
      }
      idx.push(remap.get(k));
    }
    const prim = doc.createPrimitive().setMaterial(mat(mname));
    prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer));
    prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(nrm)).setBuffer(buffer));
    prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buffer));
    prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx)).setBuffer(buffer));
    mesh.addPrimitive(prim);
    tris += faces.length;
  }
  scene.addChild(doc.createNode(g).setMesh(mesh));
  stats[g] = tris;
}
console.log('triangles per group', stats);
await doc.transform(dedup(), prune({ keepAttributes: true }), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
await new NodeIO().registerExtensions([KHRMeshQuantization]).write(OUT, doc);
console.log('bytes', fs.statSync(OUT).size);
