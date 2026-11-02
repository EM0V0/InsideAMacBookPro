// Interior of the MacBook Pro 15" Retina (Mid 2012, A1398), laid out from teardown photographs.
// Units: centimetres, laptop frame: Y up (keyboard side), front = +Z, the MagSafe side is -X.
// Every part is built at its home position; components on the boards face the bottom case (-Y).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const RB = (w, h, d, r, s = 1) => new RoundedBoxGeometry(w, h, d, s, r);
const CY = (rt, rb, h, seg = 24, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);

// ---------------------------------------------------------------- batching
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
class Kit {
  constructor() { this.bins = new Map(); }
  put(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s); return this.putM(geo, mat, _m); }
  putM(geo, mat, m) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups(); g.applyMatrix4(m);
    if (!this.bins.has(mat)) this.bins.set(mat, []);
    this.bins.get(mat).push(g);
    return g;
  }
  build(parent) {
    for (const [mat, list] of this.bins) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), mat);
      mesh.castShadow = !mat.transparent; mesh.receiveShadow = true;
      parent.add(mesh);
    }
    this.bins.clear();
  }
}
function box(k, mat, x0, x1, y0, y1, z0, z1, r = 0) {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0, rr = Math.min(r, w / 2, h / 2, d / 2) * 0.98;
  return k.put(rr > 0.003 ? RB(w, h, d, rr) : B(w, h, d), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}
const cylY = (k, mat, r, y0, y1, x, z, seg = 24) => k.put(CY(r, r, y1 - y0, seg), mat, x, (y0 + y1) / 2, z);
function tube(k, mat, pts, r, seg = 40, radial = 8, scaleY = 1) {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))), false, 'centripetal');
  const g = new THREE.TubeGeometry(c, seg, r, radial, false);
  if (scaleY !== 1) { // flatten around the path's own height (heat pipes)
    const pos = g.attributes.position, y0 = pts[0][1] ?? pts[0].y;
    for (let i = 0; i < pos.count; i++) pos.setY(i, y0 + (pos.getY(i) - y0) * scaleY);
    g.computeVertexNormals();
  }
  return k.put(g, mat);
}
// prism from a polygon in the XZ plane between y0 and y1
function slab(k, mat, pts, y0, y1, holes = []) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false, curveSegments: 24 });
  g.rotateX(-Math.PI / 2); g.translate(0, y0, 0);
  return k.put(g, mat);
}
const circlePath = (x, z, r) => { const p = new THREE.Path(); p.absarc(x, -z, r, 0, Math.PI * 2, true); return p; };
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace";
const SANS = "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
// a flat textured label lying on a down-facing (-Y) surface at height y
function label(parent, tex, x, z, w, d, y, rotY = 0) {
  const g = new THREE.PlaneGeometry(w, d); g.rotateX(Math.PI / 2); g.rotateY(rotY);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  m.position.set(x, y, z); m.receiveShadow = true; parent.add(m);
  return m;
}

// ---------------------------------------------------------------- materials
export function createMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    pcb: std({ color: 0x15171a, roughness: 0.55 }),
    pcbEdge: std({ color: 0x23262a, roughness: 0.6 }),
    chip: std({ color: 0x141416, roughness: 0.45 }),
    substrate: std({ color: 0x2f5a3a, roughness: 0.5 }),
    die: std({ color: 0x8c95a3, metalness: 0.9, roughness: 0.2 }),
    gold: std({ color: 0xc9a54c, metalness: 1, roughness: 0.3 }),
    steel: std({ color: 0xb5b9bd, metalness: 0.85, roughness: 0.35 }),
    shield: std({ color: 0xc8ccd0, metalness: 0.8, roughness: 0.32 }),
    black: std({ color: 0x0f1012, roughness: 0.6 }),
    plastic: std({ color: 0x1b1c1e, roughness: 0.5 }),
    mylar: std({ color: 0x0c0c0d, roughness: 0.35 }),
    cell: std({ color: 0x2a2c30, roughness: 0.42, metalness: 0.25 }),
    copper: std({ color: 0x8a5a3c, metalness: 0.8, roughness: 0.4 }),
    finDark: std({ color: 0x3c3f43, metalness: 0.6, roughness: 0.45 }),
    whiteConn: std({ color: 0xe9e6dc, roughness: 0.5 }),
    tan: std({ color: 0xb69a6a, roughness: 0.5 }),
    cap: std({ color: 0x8a7c66, roughness: 0.5 }),
    inductor: std({ color: 0x2a2b2d, roughness: 0.7 }),
    flex: std({ color: 0x2b2116, roughness: 0.45, side: THREE.DoubleSide }),
    flexBlack: std({ color: 0x121212, roughness: 0.5, side: THREE.DoubleSide }),
    coax: std({ color: 0x18181a, roughness: 0.5 }),
    alu: std({ color: 0xb9bdc1, metalness: 0.7, roughness: 0.42 }),
    foam: std({ color: 0x1c1d1f, roughness: 0.95 }),
  };
}

// chip labels: one atlas per board
function labelAtlas(entries, cols = 4, cw = 256, ch = 64) {
  const rows = Math.ceil(entries.length / cols);
  const tex = canvasTex(cols * cw, rows * ch, (g) => {
    entries.forEach((e, i) => {
      const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
      g.fillStyle = e.bg || '#16171a'; g.fillRect(x, y, cw, ch);
      g.fillStyle = e.fg || '#b9bcc0'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `600 ${e.sub ? 20 : 24}px ${MONO}`; g.fillText(e.text, x + cw / 2, y + (e.sub ? 22 : ch / 2));
      if (e.sub) { g.font = `500 15px ${MONO}`; g.fillStyle = '#8d9196'; g.fillText(e.sub, x + cw / 2, y + 45); }
    });
  });
  return { tex, uv: (i) => [(i % cols) / cols, 1 - (Math.floor(i / cols) + 1) / rows, 1 / cols, 1 / rows] };
}
function atlasQuad(geoList, atlas, i, x, z, w, d, y) {
  // faces -Y; turned 180 degrees so it reads from the front when the laptop lies upside down
  const g = new THREE.PlaneGeometry(w, d); g.rotateX(Math.PI / 2); g.rotateY(Math.PI);
  const [u0, v0, du, dv] = atlas.uv(i), uv = g.attributes.uv;
  for (let j = 0; j < uv.count; j++) uv.setXY(j, u0 + uv.getX(j) * du, v0 + uv.getY(j) * dv);
  g.translate(x, y, z); geoList.push(g);
}

// ---------------------------------------------------------------- logic board (820-3332-A)
// outline traced from a photo of the board, in (x, z)
const LB_OUTLINE = [[-14.36, 0.84], [-5.75, 0.84], [-4.92, 0.0], [4.51, 0.0], [4.51, 0.84], [7.33, 0.84], [7.33, -2.5], [6.5, -4.37], [6.5, -10.3], [-7.9, -10.3], [-7.95, -7.49], [-8.56, -4.99], [-10.05, -3.28], [-11.71, -2.65], [-13.36, -2.75], [-14.36, -3.12], [-14.36, -9.98], [-16.18, -9.98], [-16.18, -8.74], [-17.5, -8.74], [-17.5, -1.4], [-14.36, -1.4]];
export const LB_Y = { bottom: 0.88, top: 0.96 };
export const CHIPS = {
  cpu: { x: 0.87, z: -6.86, w: 3.1, d: 2.4, die: [1.6, 0.9] },
  gpu: { x: -4.65, z: -7.86, w: 2.9, d: 2.9, die: [1.2, 1.2] },
  pch: { x: 2.36, z: -1.57, w: 2.4, d: 2.4, die: [0.9, 0.9] },
};
export function buildLogicBoard(M) {
  const g = new THREE.Group(), k = new Kit();
  const { bottom: Y0, top: Y1 } = LB_Y;
  slab(k, M.pcbEdge, LB_OUTLINE, Y0, Y1, [circlePath(-13.8, 0.25, 0.22), circlePath(3.1, -0.4, 0.22), circlePath(6.0, -9.9, 0.22), circlePath(-7.4, -9.9, 0.22), circlePath(-15.6, -9.4, 0.2), circlePath(-16.9, -2.0, 0.2)]);
  // bottom face texture: traces, silkscreen, part number
  const X0 = -17.5, X1 = 7.33, Z0 = -10.3, Z1 = 0.84, TW = 2048, TH = Math.round((2048 * (Z1 - Z0)) / (X1 - X0)), S = TW / (X1 - X0);
  // the face is seen from below: mirror X in the texture so text reads correctly from underneath
  const px = (x) => (X1 - x) * S, pz = (z) => (z - Z0) * S;
  const tex = canvasTex(TW, TH, (c) => {
    c.fillStyle = '#121418'; c.fillRect(0, 0, TW, TH);
    const r = rng(7); c.lineCap = 'round';
    for (let i = 0; i < 700; i++) {
      c.strokeStyle = r() < 0.2 ? 'rgba(70,80,92,0.55)' : 'rgba(38,44,52,0.85)'; c.lineWidth = r() < 0.1 ? 5 : 1.6;
      c.beginPath(); let x = r() * TW, y = r() * TH; c.moveTo(x, y);
      for (let j = 0; j < 3; j++) { if (j % 2) y += (r() - 0.5) * 160; else x += (r() - 0.5) * 160; c.lineTo(x, y); }
      c.stroke();
      c.fillStyle = 'rgba(170,150,95,0.75)'; c.beginPath(); c.arc(x, y, 2.6, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#d7d9dc'; c.strokeStyle = '#d7d9dc'; c.lineWidth = 2;
    c.font = `600 40px ${MONO}`; c.fillText('820-3332-A', px(-2.0), pz(-0.6));
    c.font = `600 24px ${MONO}`;
    for (const [n, x, z] of [['U1000', 0.87, -5.4], ['U8000', -4.65, -6.1], ['U1800', 2.36, -0.15], ['U3900', -14.9, -6.4], ['J9000', -1.8, 0.2], ['J8500', 0.6, -9.2]]) c.fillText(n, px(x) - 40, pz(z));
    for (const [x, z, w, d] of [[0.87, -6.86, 3.3, 2.6], [-4.65, -7.86, 3.1, 3.1], [2.36, -1.57, 2.6, 2.6]]) c.strokeRect(px(x + w / 2), pz(z - d / 2), w * S, d * S);
  });
  tex.wrapS = THREE.ClampToEdgeWrapping;
  const faceS = new THREE.Shape(LB_OUTLINE.map(([x, z]) => new THREE.Vector2(x, z)));
  const face = new THREE.ShapeGeometry(faceS); face.rotateX(Math.PI / 2); // (x, y) -> (x, 0, y), facing -Y
  const uv = face.attributes.uv, pos = face.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (X1 - pos.getX(i)) / (X1 - X0), 1 - (pos.getZ(i) - Z0) / (Z1 - Z0));
  face.translate(0, Y0 - 0.002, 0);
  const fm = new THREE.Mesh(face, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
  fm.receiveShadow = true; g.add(fm);
  // CPU, GPU, PCH: substrate + bare die (facing the heat sink)
  for (const c of Object.values(CHIPS)) {
    box(k, M.substrate, c.x - c.w / 2, c.x + c.w / 2, Y0 - 0.1, Y0, c.z - c.d / 2, c.z + c.d / 2, 0.02);
    box(k, M.die, c.x - c.die[0] / 2, c.x + c.die[0] / 2, Y0 - 0.16, Y0 - 0.1, c.z - c.die[1] / 2, c.z + c.die[1] / 2);
  }
  // 16 DDR3L chips, Thunderbolt controller, other ICs with labels
  const entries = [], quads = [];
  const ic = (x, z, w, d, h, text, sub) => { box(k, M.chip, x - w / 2, x + w / 2, Y0 - h, Y0, z - d / 2, z + d / 2, 0.015); entries.push({ text, sub }); quads.push([x, z, w * 0.86, d * 0.6, Y0 - h - 0.002]); };
  for (let row = 0; row < 2; row++) for (let i = 0; i < 8; i++) ic(-3.24 + i * 1.13, row ? -3.47 : -4.56, 1.0, 0.95, 0.1, 'HYNIX', 'H5TC2G83');
  ic(-14.9, -7.5, 1.5, 1.5, 0.12, 'INTEL', 'DSL3510L');
  ic(-12.2, -0.4, 1.2, 1.2, 0.1, 'SMC', 'LM4FS1AH');
  ic(4.5, -4.2, 0.9, 0.9, 0.08, 'CY8C24');
  ic(-6.3, -1.0, 1.0, 1.0, 0.08, 'MAX15119');
  const at = labelAtlas(entries), lq = [];
  entries.forEach((_, i) => atlasQuad(lq, at, i, ...quads[i]));
  g.add(new THREE.Mesh(mergeGeometries(lq), new THREE.MeshStandardMaterial({ map: at.tex, roughness: 0.5 })));
  // power stages: inductors and capacitors around the CPU and GPU
  const r = rng(11);
  for (let i = 0; i < 14; i++) { const x = -6.6 + i * 0.95, z = -9.65; if (x > -1.1 && x < 2.3) continue; box(k, M.inductor, x - 0.35, x + 0.35, Y0 - 0.28, Y0, z - 0.32, z + 0.32, 0.03); }
  for (let i = 0; i < 6; i++) { const x = 3.6 + (i % 2) * 0.9, z = -8.8 + Math.floor(i / 2) * 0.9; box(k, M.inductor, x - 0.35, x + 0.35, Y0 - 0.28, Y0, z - 0.35, z + 0.35, 0.03); }
  for (let i = 0; i < 180; i++) {
    const x = -17.2 + r() * 24.2, z = -10.0 + r() * 10.6;
    if (!inside(LB_OUTLINE, x, z)) continue;
    if (Math.abs(x - 0.87) < 1.8 && Math.abs(z + 6.86) < 1.5) continue;
    if (Math.abs(x + 4.65) < 1.7 && Math.abs(z + 7.86) < 1.7) continue;
    if (x > -3.9 && x < 5.3 && z > -5.2 && z < -2.9) continue;
    if (Math.abs(x - 2.36) < 1.4 && Math.abs(z + 1.57) < 1.4) continue;
    const w = 0.12 + r() * 0.25, d = 0.08 + r() * 0.15;
    box(k, r() < 0.5 ? M.cap : M.tan, x - w / 2, x + w / 2, Y0 - 0.06, Y0, z - d / 2, z + d / 2);
  }
  // connectors: battery, display (eDP), SSD, AirPort, fans, I/O flex
  box(k, M.whiteConn, -3.1, -0.5, Y0 - 0.22, Y0, 0.2, 0.7, 0.03);
  box(k, M.black, -0.6, 1.8, Y0 - 0.18, Y0, -9.85, -9.4, 0.03);
  box(k, M.black, 6.35, 6.9, Y0 - 0.16, Y0, -2.0, 1.0, 0.03);
  box(k, M.black, 5.4, 7.1, Y0 - 0.12, Y0, -2.75, -2.45, 0.02);
  for (const [x, z] of [[5.6, -9.9], [-7.5, -9.0], [6.9, -1.95], [-16.6, -9.3], [-16.9, -2.3]]) box(k, M.whiteConn, x - 0.3, x + 0.3, Y0 - 0.15, Y0, z - 0.18, z + 0.18, 0.02);
  // board screws
  for (const [x, z] of [[-13.8, 0.25], [3.1, -0.4], [6.0, -9.9], [-7.4, -9.9], [-15.6, -9.4], [-16.9, -2.0]]) cylY(k, M.steel, 0.24, Y0 - 0.08, Y0 + 0.02, x, z, 16);
  k.build(g);
  return {
    group: g,
    battConn: new THREE.Vector3(-1.8, Y0 - 0.22, 0.45),
    dispConn: new THREE.Vector3(0.6, Y0 - 0.18, -9.62),
    ioConn: new THREE.Vector3(6.25, Y0 - 0.12, -2.6),
    fanConnR: new THREE.Vector3(5.6, Y0 - 0.15, -9.9), fanConnL: new THREE.Vector3(-7.5, Y0 - 0.15, -9.0),
    spkConnR: new THREE.Vector3(6.9, Y0 - 0.15, -1.95), dcConn: new THREE.Vector3(-16.6, Y0 - 0.15, -9.3), audioConn: new THREE.Vector3(-16.9, Y0 - 0.15, -2.3),
  };
}
function inside(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// ---------------------------------------------------------------- heat sink: CPU/GPU plate, twin heat pipes, two fin stacks
export function buildHeatsink(M) {
  const g = new THREE.Group(), k = new Kit();
  const y = 0.62;
  for (const c of [CHIPS.cpu, CHIPS.gpu]) box(k, M.copper, c.x - c.die[0] / 2 - 0.3, c.x + c.die[0] / 2 + 0.3, LB_Y.bottom - 0.24, LB_Y.bottom - 0.16, c.z - c.die[1] / 2 - 0.3, c.z + c.die[1] / 2 + 0.3);
  slab(k, M.black, [[-6.6, -9.55], [2.9, -9.55], [2.9, -5.4], [-1.4, -5.4], [-3.0, -6.3], [-6.6, -6.3]], LB_Y.bottom - 0.3, LB_Y.bottom - 0.24);
  for (const [x, z] of [[-6.2, -9.2], [-6.2, -6.6], [2.5, -9.2], [2.5, -5.8]]) { cylY(k, M.steel, 0.3, LB_Y.bottom - 0.42, LB_Y.bottom - 0.3, x, z, 16); cylY(k, M.black, 0.18, LB_Y.bottom - 0.45, LB_Y.bottom - 0.42, x, z, 12); }
  for (const dz of [-0.32, 0.32]) {
    const P = [[13.9, y, -10.45 + dz], [9.0, y, -10.4 + dz], [6.4, y, -9.6 + dz], [3.8, y, -8.0 + dz], [-1.0, y, -7.55 + dz], [-5.3, y, -8.3 + dz], [-7.4, y, -9.9 + dz], [-9.5, y, -10.4 + dz], [-13.9, y, -10.45 + dz]];
    tube(k, M.copper, P, 0.17, 120, 10, 0.55);
  }
  // fin stacks at the fan outlets
  for (const [x0, x1] of [[8.4, 14.3], [-14.05, -8.15]]) {
    box(k, M.finDark, x0, x1, 0.3, 0.34, -11.05, -9.95); box(k, M.finDark, x0, x1, 0.92, 0.96, -11.05, -9.95);
    for (let x = x0 + 0.05; x < x1; x += 0.12) box(k, M.finDark, x, x + 0.035, 0.34, 0.92, -11.05, -9.95);
  }
  k.build(g);
  return { group: g };
}

// ---------------------------------------------------------------- fans (asymmetric blade spacing)
export function buildFan(M, side) {
  const g = new THREE.Group(), k = new Kit();
  const cx = side > 0 ? 11.34 : -11.1, x0 = cx - 3.0, x1 = cx + 3.0, z0 = -9.95, z1 = -2.6, cz = -5.83;
  const outline = [[x0 + 0.6, z1], [x1 - 0.6, z1], [x1, z1 - 0.6], [x1, z0], [x0, z0], [x0, z1 - 0.6]];
  slab(k, M.plastic, outline, 0.3, 0.36, [circlePath(cx, cz, 1.95)]);
  slab(k, M.plastic, outline, 0.9, 0.96);
  // volute wall: a spiral band that opens towards the fin stack at the back
  const aS = -Math.PI / 2 + 0.55, aE = (3 * Math.PI) / 2 - 0.25, outer = [], inner = [];
  for (let i = 0; i <= 64; i++) {
    const a = aS + ((aE - aS) * i) / 64, r = 2.2 + (0.75 * i) / 64;
    const dir = side > 0 ? 1 : -1;
    outer.push([cx + dir * Math.cos(a) * (r + 0.09), cz + Math.sin(a) * (r + 0.09)]);
    inner.push([cx + dir * Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  slab(k, M.plastic, [...outer, ...inner.reverse()], 0.36, 0.9);
  // impeller
  cylY(k, M.black, 0.62, 0.42, 0.88, cx, cz, 28);
  cylY(k, M.steel, 0.25, 0.37, 0.42, cx, cz, 16);
  const r = rng(side > 0 ? 5 : 9);
  let a = 0;
  while (a < Math.PI * 2 - 0.12) {
    const geo = B(1.25, 0.42, 0.035); geo.translate(1.3, 0, 0); geo.rotateY(-0.35);
    k.put(geo, M.black, cx, 0.65, cz, 0, a, 0);
    a += 0.15 + r() * 0.08;
  }
  // mounting screws through the housing
  for (const [x, z] of [[x0 + 0.45, z1 - 0.45], [x1 - 0.45, z1 - 0.45], [side > 0 ? x0 + 0.45 : x1 - 0.45, z0 + 0.5]]) cylY(k, M.steel, 0.2, 0.26, 0.3, x, z, 14);
  k.build(g);
  return { group: g, plug: new THREE.Vector3(side > 0 ? x0 + 0.3 : x1 - 0.3, 0.8, z0 + 0.4) };
}

// ---------------------------------------------------------------- SSD blade (Samsung, 512 GB)
export function buildSSD(M) {
  const g = new THREE.Group(), k = new Kit();
  const y0 = 0.8, y1 = 0.86;
  box(k, M.pcb, 6.14, 12.28, y0, y1, -2.05, 1.02, 0.03);
  const entries = [], quads = [];
  const ic = (x, z, w, d, text, sub) => { box(k, M.chip, x - w / 2, x + w / 2, y0 - 0.08, y0, z - d / 2, z + d / 2, 0.01); entries.push({ text, sub }); quads.push([x, z, w * 0.88, d * 0.62, y0 - 0.082]); };
  ic(8.0, -1.2, 1.35, 1.55, 'SAMSUNG', 'K9UHGY8U7A'); ic(9.55, -1.2, 1.35, 1.55, 'SAMSUNG', 'K9UHGY8U7A');
  ic(8.0, 0.4, 1.35, 1.0, 'SAMSUNG', 'K9UHGY8U7A'); ic(9.55, 0.4, 1.35, 1.0, 'SAMSUNG', 'K9UHGY8U7A');
  ic(11.1, -1.15, 1.1, 1.1, 'S4LJ204X01', 'CONTROLLER'); ic(11.1, 0.45, 1.0, 0.6, 'K4T2G314', 'DDR2');
  const at = labelAtlas(entries); const lq = [];
  entries.forEach((_, i) => atlasQuad(lq, at, i, ...quads[i]));
  const lm = new THREE.Mesh(mergeGeometries(lq), new THREE.MeshStandardMaterial({ map: at.tex, roughness: 0.5 })); g.add(lm);
  box(k, M.gold, 6.18, 6.6, y0 - 0.01, y0, -1.9, 0.9);
  cylY(k, M.steel, 0.22, y0 - 0.06, y1 + 0.02, 11.95, -0.5, 16);
  k.build(g);
  return { group: g };
}

// ---------------------------------------------------------------- AirPort / Bluetooth card (BCM4331 + BCM20702)
export function buildAirport(M) {
  const g = new THREE.Group(), k = new Kit();
  const y0 = 0.78, y1 = 0.84;
  box(k, M.pcb, 5.2, 7.32, y0, y1, -6.78, -2.53, 0.03);
  box(k, M.shield, 5.38, 7.14, y0 - 0.07, y0, -6.0, -3.0, 0.02);
  box(k, M.black, 5.2, 7.32, y0 - 0.11, y0 - 0.08, -6.95, -6.15, 0.02); // antenna bracket
  for (const x of [5.6, 6.26, 6.92]) cylY(k, M.gold, 0.12, y0 - 0.1, y0, x, -6.5, 12);
  cylY(k, M.steel, 0.2, y0 - 0.14, y1 + 0.02, 6.26, -2.85, 14);
  k.build(g);
  return { group: g, ant: [5.6, 6.26, 6.92].map((x) => new THREE.Vector3(x, y0 - 0.1, -6.5)) };
}

// ---------------------------------------------------------------- right I/O board (SD, HDMI, USB 3) and its flex
export function buildIOBoard(M) {
  const g = new THREE.Group(), k = new Kit();
  box(k, M.pcb, 14.4, 17.5, 0.6, 0.66, -11.3, -2.6, 0.03);
  box(k, M.chip, 15.0, 16.0, 0.52, 0.6, -5.0, -4.0, 0.01); box(k, M.chip, 15.4, 16.0, 0.53, 0.6, -7.8, -7.2, 0.01);
  for (const [x, z] of [[14.8, -10.6], [14.8, -3.2]]) cylY(k, M.steel, 0.2, 0.55, 0.68, x, z, 14);
  box(k, M.black, 14.45, 14.9, 0.52, 0.6, -3.4, -2.75, 0.02);
  k.build(g);
  return { group: g, plug: new THREE.Vector3(14.6, 0.56, -3.05) };
}
// ---------------------------------------------------------------- DC-in (MagSafe 2) board and headphone jack board
export function buildDCIn(M) {
  const g = new THREE.Group(), k = new Kit();
  box(k, M.pcb, -17.5, -15.3, 0.6, 0.66, -11.6, -9.0, 0.03);
  box(k, M.black, -16.0, -15.5, 0.52, 0.6, -9.6, -9.1, 0.02);
  cylY(k, M.steel, 0.2, 0.55, 0.68, -15.7, -11.2, 14);
  k.build(g);
  return { group: g, plug: new THREE.Vector3(-15.75, 0.56, -9.35) };
}
export function buildAudio(M) {
  const g = new THREE.Group(), k = new Kit();
  box(k, M.pcb, -17.5, -15.85, 0.6, 0.66, -4.4, -2.9, 0.03);
  box(k, M.black, -16.3, -15.9, 0.52, 0.6, -3.3, -2.95, 0.02);
  k.build(g);
  return { group: g, plug: new THREE.Vector3(-16.1, 0.56, -3.12) };
}

// ---------------------------------------------------------------- speakers (left one carries the two microphones)
export function buildSpeaker(M, side) {
  const g = new THREE.Group(), k = new Kit();
  const S = (x) => side * x;
  const back = side > 0 ? -1.82 : -1.3;
  const pts = [[S(14.17), back], [S(17.24), back], [S(17.24), 5.03], [S(11.57), 5.03], [S(11.57), 1.72], [S(14.17), 1.72]];
  slab(k, M.plastic, side > 0 ? pts : pts.slice().reverse(), 0.34, 1.05);
  cylY(k, M.plastic, 0.95, 0.26, 0.34, S(15.83), 0.07, 32);
  cylY(k, M.black, 0.62, 0.24, 0.26, S(15.83), 0.07, 28);
  for (const [x, z] of [[S(12.0), 4.6], [S(16.9), -1.0]]) cylY(k, M.steel, 0.18, 0.3, 0.34, x, z, 12);
  if (side < 0) for (const z of [2.6, 3.4]) { cylY(k, M.black, 0.18, 0.28, 0.34, S(12.6), z, 14); cylY(k, M.steel, 0.07, 0.27, 0.28, S(12.6), z, 10); }
  k.build(g);
  return { group: g, plug: new THREE.Vector3(S(13.0), 0.4, 1.9) };
}

// ---------------------------------------------------------------- battery: six glued Li-polymer cells, 95 Wh
export const CELLS = [[11.57, 16.77, 5.03, true], [6.38, 11.1, 1.96, true], [0.25, 5.9, 1.96, false], [-5.9, -0.25, 1.96, false], [-11.1, -6.38, 1.96, true], [-16.77, -11.57, 5.03, true]];
export function buildBattery(M) {
  const g = new THREE.Group(), k = new Kit();
  for (const [x0, x1, z0, thick] of CELLS) box(k, M.cell, x0, x1, 0.44, thick ? 1.2 : 0.8, z0, 10.46, 0.12);
  // plastic frame along the front and the label strip on top
  box(k, M.mylar, -16.8, 16.8, 0.42, 1.2, 10.46, 12.1, 0.06);
  box(k, M.mylar, -6.2, 6.2, 0.42, 0.8, 0.98, 1.96, 0.04);
  const front = canvasTex(2048, 100, (c) => {
    c.fillStyle = '#0d0d0e'; c.fillRect(0, 0, 2048, 100);
    c.fillStyle = '#b8b9bb'; c.textAlign = 'center'; c.font = `500 26px ${SANS}`;
    c.fillText('Model A1417   Li-ion Polymer   10.95V   95Wh   8460mAh', 1024, 42);
    c.font = `500 20px ${SANS}`; c.fillText('Service only by an authorized service provider. Do not remove, puncture or expose to high temperature.', 1024, 76);
  });
  label(g, front, 0, 11.28, 33.4, 1.6, 0.418, Math.PI);
  const top = canvasTex(1024, 80, (c) => {
    c.fillStyle = '#0d0d0e'; c.fillRect(0, 0, 1024, 80);
    c.fillStyle = '#b8b9bb'; c.textAlign = 'center'; c.font = `600 22px ${SANS}`; c.fillText('⚠  WARNING  —  battery is glued in place', 512, 48);
  });
  label(g, top, 0, 1.47, 12.2, 0.95, 0.418, Math.PI);
  // the connector at the end of the battery flex
  box(k, M.whiteConn, -3.1, -0.5, 0.62, 0.76, 0.35, 0.75, 0.03);
  k.build(g);
  return { group: g, flexStart: new THREE.Vector3(-1.8, 0.5, 1.4), flexEnd: new THREE.Vector3(-1.8, 0.62, 0.55) };
}

// ---------------------------------------------------------------- trackpad mechanism (under the glass from the model)
export function buildTrackpadMech(M) {
  const g = new THREE.Group(), k = new Kit();
  box(k, M.steel, -5.15, 5.15, 0.86, 1.1, 3.25, 10.7, 0.15);
  box(k, M.pcb, -4.2, 4.2, 0.82, 0.86, 3.8, 9.9, 0.05);
  box(k, M.chip, -0.6, 0.6, 0.77, 0.82, 6.4, 7.6, 0.01);
  k.build(g);
  return { group: g, plug: new THREE.Vector3(-0.4, 0.8, 3.4) };
}

// ---------------------------------------------------------------- fixed inside the upper case: keyboard backing, screw bosses, hinge bracket bosses
export function buildUpperInterior(M) {
  const g = new THREE.Group(), k = new Kit();
  // the keyboard's backlight sheet, riveted to the upper case just below the aluminium web between the keys
  box(k, M.mylar, -13.85, 13.85, 0.905, 0.93, -9.6, 1.3);
  const r = rng(3);
  for (let i = 0; i < 64; i++) { const x = -13.2 + (i % 16) * 1.76 + (r() - 0.5) * 0.2, z = -9.0 + Math.floor(i / 16) * 3.2; cylY(k, M.steel, 0.09, 0.89, 0.905, x, z, 8); }
  for (const [x, z] of [[-16.9, 0], [16.9, 0], [-5.6, 11.3], [5.6, 11.3], [-5.6, -11.3], [5.6, -11.3], [-16.9, -11.3], [16.9, -11.3], [-16.9, 11.3], [16.9, 11.3]]) cylY(k, M.alu, 0.32, 0.36, 1.2, x, z, 18);
  k.build(g);
  return { group: g };
}
// steel hinge brackets that hold the display to the upper case (built for the closed lid)
export function buildHingeBrackets(M) {
  const g = new THREE.Group(), k = new Kit();
  for (const s of [-1, 1]) {
    box(k, M.steel, s > 0 ? 13.2 : -16.2, s > 0 ? 16.2 : -13.2, 0.95, 1.12, -12.0, -10.2, 0.05);
    for (const dx of [0.6, 2.4]) cylY(k, M.steel, 0.22, 0.9, 0.95, s * (13.2 + dx), -10.8, 14);
  }
  k.build(g);
  return { group: g };
}
