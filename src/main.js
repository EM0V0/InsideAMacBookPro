// MacBook Pro 15" Retina (Mid 2012) teardown: it turns itself over, then each part
// can be selected with a double-click and dragged out along its own path.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as P from './parts.js';
import { Sound } from './audio.js';
import { GLB_B64 } from './glb.js';

const MODEL_URL = 'mbp.glb';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TOUCH = matchMedia('(pointer: coarse)').matches;
const BG = { inner: '#e6e9ee', mid: '#ced5de', outer: '#a3afbd' };
const ACCENT = new THREE.Color('#f0a43a');
const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const ui = { toggle: $('toggle'), tag: $('tag'), loader: $('loader'), loadbar: $('loadbar'), loadtext: $('loadtext'), fail: $('fail') };

// ------------------------------------------------------------------ renderer & scene
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); }
catch (e) { ui.loadtext.textContent = ''; ui.fail.style.display = 'block'; throw e; }
const DPR = Math.min(window.devicePixelRatio || 1, TOUCH ? 1.75 : 2);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d'), grd = g.createRadialGradient(512, 430, 40, 512, 560, 760);
  grd.addColorStop(0, BG.inner); grd.addColorStop(0.45, BG.mid); grd.addColorStop(1, BG.outer);
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 1024);
  const img = g.getImageData(0, 0, 1024, 1024), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 3; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.85;
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 1, 3000);

scene.add(new THREE.HemisphereLight(0xf1f5f9, 0xb7b0a2, 0.55));
const key = new THREE.DirectionalLight(0xfff5e8, 1.6);
key.position.set(-60, 110, 80); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 20, far: 360 });
key.shadow.bias = -0.0003; key.shadow.normalBias = 0.03; key.shadow.radius = 4;
scene.add(key, key.target);
const rimLight = new THREE.DirectionalLight(0xd9e7ff, 0.7); rimLight.position.set(80, 60, -90); scene.add(rimLight);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.ShadowMaterial({ color: 0x1b2836, opacity: 0.18 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const blob = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grd.addColorStop(0, 'rgba(20,30,42,0.38)'); grd.addColorStop(0.6, 'rgba(20,30,42,0.16)'); grd.addColorStop(1, 'rgba(20,30,42,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(46, 34), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.03; m.renderOrder = -1; scene.add(m); return m;
})();

const rt = new THREE.WebGLRenderTarget(innerWidth * DPR, innerHeight * DPR, { samples: TOUCH ? 2 : 4, type: THREE.HalfFloatType });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(DPR); composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const hoverPass = new OutlinePass(new THREE.Vector2(innerWidth, innerHeight), scene, camera);
Object.assign(hoverPass, { edgeStrength: 2.4, edgeGlow: 0, edgeThickness: 1, pulsePeriod: 0 });
hoverPass.visibleEdgeColor.set('#ffffff'); hoverPass.hiddenEdgeColor.set('#6d7886');
const selectPass = new OutlinePass(new THREE.Vector2(innerWidth, innerHeight), scene, camera);
Object.assign(selectPass, { edgeStrength: 4.2, edgeGlow: 0.55, edgeThickness: 1.6, pulsePeriod: 0 });
selectPass.visibleEdgeColor.copy(ACCENT); selectPass.hiddenEdgeColor.set('#8a5a1c');
composer.addPass(hoverPass); composer.addPass(selectPass); composer.addPass(new OutputPass());

const pointer = { x: 0, y: 0, moved: false, inside: false };
canvas.addEventListener('pointerdown', onPointerDown);
const controls = new OrbitControls(camera, canvas);
Object.assign(controls, { enableDamping: true, dampingFactor: 0.085, rotateSpeed: 0.75, zoomSpeed: 0.9, enablePan: false, zoomToCursor: false, minDistance: 16, maxDistance: 320, maxPolarAngle: THREE.MathUtils.degToRad(87) });

// ------------------------------------------------------------------ materials
const ALU = new THREE.Color('#c4c8cc');
const MAT = {
  alu: new THREE.MeshPhysicalMaterial({ color: ALU, metalness: 0.62, roughness: 0.36, clearcoat: 0.08 }),
  // the inside of the shells; pushed back in depth so parts resting against the walls always win
  aluInner: new THREE.MeshStandardMaterial({ color: 0x9da2a7, metalness: 0.65, roughness: 0.5, side: THREE.BackSide, polygonOffset: true, polygonOffsetFactor: 1.5, polygonOffsetUnits: 2 }),
  keys: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.58 }),
  touchpad: new THREE.MeshPhysicalMaterial({ color: 0xc8ccd0, metalness: 0.15, roughness: 0.32, clearcoat: 0.4 }),
  screws: new THREE.MeshStandardMaterial({ color: 0x8c9196, metalness: 0.7, roughness: 0.4 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x0e0e0f, roughness: 0.9 }),
  black: new THREE.MeshPhysicalMaterial({ color: 0x080809, roughness: 0.25, clearcoat: 0.6, side: THREE.DoubleSide }),
  metal: new THREE.MeshStandardMaterial({ color: 0xc6c9cc, metalness: 1, roughness: 0.3 }),
  white: new THREE.MeshStandardMaterial({ color: 0xd8dade, roughness: 0.45 }),
  screen: new THREE.MeshPhysicalMaterial({ color: 0x030304, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03 }),
  apple: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.7, roughness: 0.25 }),
  frame: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.3 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.03, transparent: true, opacity: 0.18, depthWrite: false, clearcoat: 1 }),
};
const PM = P.createMaterials();
const sound = new Sound();

// ------------------------------------------------------------------ parts, poses and rails
const parts = {}, statics = {};
const PART_INFO = {
  bottomCase: { name: 'Bottom Case', desc: '10 pentalobe screws' },
  ssd: { name: 'SSD', desc: '512 GB Samsung flash blade' },
  airport: { name: 'AirPort Card', desc: 'Wi-Fi 802.11n + Bluetooth 4.0' },
  fanL: { name: 'Left Fan', desc: 'Asymmetric blade spacing' },
  fanR: { name: 'Right Fan', desc: 'Asymmetric blade spacing' },
  ioBoard: { name: 'I/O Board', desc: 'SD card, HDMI, USB 3' },
  heatsink: { name: 'Heat Sink', desc: 'Shared by CPU and GPU' },
  logic: { name: 'Logic Board', desc: 'Core i7 · GT 650M · 8 GB RAM' },
  dcin: { name: 'MagSafe 2 Board', desc: 'DC-in' },
  audio: { name: 'Headphone Jack', desc: 'Audio board' },
  speakerL: { name: 'Left Speaker', desc: 'With two microphones' },
  speakerR: { name: 'Right Speaker', desc: 'Sealed enclosure' },
  battery: { name: 'Battery', desc: '95 Wh, six cells, glued in' },
  trackpad: { name: 'Trackpad', desc: 'Glass, under the battery' },
  lid: { name: 'Display Assembly', desc: '15.4" Retina, 2880 × 1800' },
  topCase: { name: 'Upper Case', desc: 'Keyboard riveted in' },
};
// Where each part comes to rest, seen from above with the laptop upside down: world x, z and yaw (degrees).
const PARK = {
  bottomCase: { at: [-41, 0], yaw: 0, lift: 3 },
  ssd: { at: [-25, 31], yaw: 0 }, airport: { at: [-17, 31], yaw: 0 },
  fanL: { at: [51, -10], yaw: 0 }, fanR: { at: [51, 0], yaw: 0 },
  ioBoard: { at: [51, 10], yaw: 0 },
  heatsink: { at: [42, -3], yaw: 90 },
  logic: { at: [29, -2], yaw: 90, lift: 3 },
  dcin: { at: [17, 31], yaw: 0 }, audio: { at: [22, 31], yaw: 0 },
  speakerL: { at: [27, 21], yaw: 0 }, speakerR: { at: [-27, 21], yaw: 0 },
  battery: { at: [0, 22.5], yaw: 0, lift: 3 },
  trackpad: { at: [0, 34], yaw: 0 },
};
const ORDER_OUT = ['bottomCase', 'ssd', 'airport', 'fanR', 'fanL', 'ioBoard', 'heatsink', 'logic', 'dcin', 'audio', 'speakerL', 'speakerR', 'battery', 'trackpad', 'lid'];
const ORDER_IN = [...ORDER_OUT].reverse();
const NEEDS = {
  ssd: ['bottomCase'], airport: ['bottomCase'], fanL: ['bottomCase'], fanR: ['bottomCase'], ioBoard: ['bottomCase'],
  heatsink: ['fanL', 'fanR'], logic: ['heatsink', 'ssd', 'airport'], dcin: ['logic'], audio: ['logic'], speakerL: ['logic'], speakerR: ['ioBoard'],
  battery: ['logic', 'speakerL', 'speakerR'], trackpad: ['battery'], lid: ['airport', 'logic'],
};
const LIFT_B = 2.0;                     // top of the closed laptop, in its own frame
const HINGE = new THREE.Vector3(0, 0.95, -12.1);
const LID_OPEN = -0.3;                  // radians back from vertical
const laptop = new THREE.Group(); laptop.name = 'laptop'; scene.add(laptop);
const pose = { p: 0, target: 0 };      // 0 = open on its feet, 1 = closed and upside down

class Rail {
  constructor(keys) {
    this.pts = keys.map((k) => new THREE.Vector3(k[0], k[1], k[2]));
    this.quats = keys.map((k) => new THREE.Quaternion().setFromEuler(new THREE.Euler(...k.slice(3).map(THREE.MathUtils.degToRad))));
    this.curve = new THREE.CatmullRomCurve3(this.pts, false, 'centripetal'); this.curve.arcLengthDivisions = 400; this.n = keys.length;
  }
  offset(u, out) { return this.curve.getPointAt(THREE.MathUtils.clamp(u, 0, 1), out); }
  rotation(u, out) {
    const t = this.curve.getUtoTmapping(THREE.MathUtils.clamp(u, 0, 1)) * (this.n - 1);
    const i = Math.min(this.n - 2, Math.floor(t)), f = t - i, e = f * f * (3 - 2 * f);
    return out.slerpQuaternions(this.quats[i], this.quats[i + 1], e);
  }
}
// rail from the home position to the parking spot, written in the laptop's frame (the laptop is upside down: x and y flip)
function railFor(id, group) {
  const box = new THREE.Box3().setFromObject(group);
  const inv = laptop.matrixWorld.clone().invert(); box.applyMatrix4(inv);
  const home = group.position;                                    // pivot (laptop frame)
  const park = PARK[id];
  const worldHome = new THREE.Vector3(-home.x, LIFT_B - home.y, home.z);
  const minY = box.min.y, maxY = box.max.y;                       // laptop frame
  const restY = 0.03 + (maxY - home.y);                           // pivot height above the table when flipped
  const clear = Math.max(2.4, LIFT_B - minY + 0.4) + (park.lift || 1.2); // lift until it clears the case walls
  const dW = (wx, wy, wz) => [-(wx - worldHome.x), -(wy - worldHome.y), wz - worldHome.z];
  const [px, pz] = park.at;
  const k1 = dW(worldHome.x, worldHome.y + clear - (worldHome.y - restY) * 0 , worldHome.z);
  const mid = dW((worldHome.x + px) / 2, worldHome.y + clear + 1.5, (worldHome.z + pz) / 2);
  const end = dW(px, restY, pz);
  return [[0, 0, 0, 0, 0, 0], [...k1, 0, 0, 0], [...mid, 0, -park.yaw / 2, 0], [...end, 0, -park.yaw, 0]];
}
function makePart(id, group, keys) {
  const p = { id, group, ...PART_INFO[id], rail: new Rail(keys || railFor(id, group)), t: 0, v: 0, target: 0, k: 140, drag: false,
    homePos: group.position.clone(), homeQuat: group.quaternion.clone(), delay: 0 };
  group.traverse((o) => { o.userData.partId = id; });
  parts[id] = p; return p;
}
const _off = new THREE.Vector3(), _q = new THREE.Quaternion();
function applyPart(p) {
  const u = THREE.MathUtils.clamp(p.t, -0.05, 1.05);
  p.rail.offset(THREE.MathUtils.clamp(u, 0, 1), _off);
  if (u > 1) _off.add(p.rail.curve.getTangentAt(1).multiplyScalar((u - 1) * p.rail.curve.getLength()));
  if (u < 0) _off.add(p.rail.curve.getTangentAt(0).multiplyScalar(u * p.rail.curve.getLength()));
  p.group.position.copy(p.homePos).add(_off);
  p.group.quaternion.copy(p.rail.rotation(u, _q)).multiply(p.homeQuat);
}
function pivotAt(group, pivot) { for (const c of group.children) c.position.sub(pivot); group.position.copy(pivot); }
function centerOf(group) { group.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(group); b.applyMatrix4(laptop.matrixWorld.clone().invert()); return b.getCenter(new THREE.Vector3()); }

// ------------------------------------------------------------------ cables (unplug when either end moves)
const cables = [];
class Cable {
  constructor(o) {
    Object.assign(this, o);
    const og = this.owner.group; laptop.updateMatrixWorld(true); og.updateMatrixWorld(true);
    // A, via, B are in the laptop frame
    const toOwner = og.matrixWorld.clone().invert().multiply(laptop.matrixWorld);
    this.plugged = [this.A, ...(this.via || []), this.B].map((p) => p.clone().applyMatrix4(toOwner));
    const a = this.plugged[0], end = a.clone().add(this.dangle);
    const n = this.plugged.length;
    this.loose = this.plugged.map((_, i) => { const f = i / (n - 1); return a.clone().lerp(end, f).add(new THREE.Vector3(0, -Math.sin(f * Math.PI) * (this.sag ?? 0.3), 0)); });
    this.k = 1; this.want = 1; this.pts = this.plugged.map((p) => p.clone());
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat); this.mesh.castShadow = true; this.mesh.userData.partId = this.owner.id;
    og.add(this.mesh); this.rebuild();
  }
  rebuild() {
    const e = this.k * this.k * (3 - 2 * this.k);
    this.pts.forEach((p, i) => p.copy(this.loose[i]).lerp(this.plugged[i], e));
    const curve = new THREE.CatmullRomCurve3(this.pts, false, 'centripetal');
    this.mesh.geometry.dispose();
    this.mesh.geometry = this.ribbon ? ribbonGeometry(curve, this.ribbon) : new THREE.TubeGeometry(curve, 32, this.radius, 6, false);
  }
  update(dt) {
    const home = (p) => !p || p.t < 0.004;
    const want = home(this.owner) && home(this.target) ? 1 : 0;
    if (want !== this.want) { this.want = want; if (pose.p > 0.99) sound.click(); }
    const k = THREE.MathUtils.clamp(this.k + Math.sign(want - this.k) * (want ? 4.5 : 7) * dt, 0, 1);
    if (k !== this.k) { this.k = k; this.rebuild(); }
  }
}
function ribbonGeometry(curve, width) {
  const N = 40, pos = [], idx = [], side = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= N; i++) {
    const u = i / N, p = curve.getPointAt(u), t = curve.getTangentAt(u);
    let s = new THREE.Vector3().crossVectors(t, side); if (s.lengthSq() < 1e-4) s.set(1, 0, 0); s.normalize();
    for (const k of [-0.5, 0.5]) { const q = p.clone().addScaledVector(s, k * width); pos.push(q.x, q.y, q.z); }
    if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ build
let ready = false;
const pickables = [];
async function init() {
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
  const loader = new GLTFLoader();
  let gltf;
  try {
    if (GLB_B64) { const bin = atob(GLB_B64), buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i); ui.loadbar.style.width = '100%'; gltf = await loader.parseAsync(buf.buffer, ''); }
    else gltf = await loader.loadAsync(MODEL_URL, (e) => { if (e.total) ui.loadbar.style.width = `${Math.round((e.loaded / e.total) * 100)}%`; });
  } catch (err) { ui.loadtext.textContent = 'The model could not be loaded. Reload the page to try again.'; throw err; }
  const root = gltf.scene;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.material.name, map = o.material.map;
    const m = MAT[n] || MAT.alu;
    if (map && (n === 'alu' || n === 'keys' || n === 'apple' || n === 'screws')) {
      map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
      if (!m.userData.mapped) { m.map = map; m.userData.mapped = true; m.needsUpdate = true; }
    }
    o.material = m; o.castShadow = true; o.receiveShadow = true;
  });
  laptop.add(root); root.updateMatrixWorld(true);
  const node = (n) => root.getObjectByName(n);
  // shells: a back-face copy shows the bare machined aluminium inside
  for (const id of ['topCase', 'bottomCase']) node(id).traverse((o) => { if (o.isMesh && o.material === MAT.alu) { const inner = new THREE.Mesh(o.geometry, MAT.aluInner); inner.receiveShadow = true; o.add(inner); } });

  // removable groups in the laptop frame
  const mk = (id, builtGroups = [], modelNodes = []) => {
    const g = new THREE.Group(); g.name = id; laptop.add(g);
    for (const b of builtGroups) g.add(b);
    for (const n of modelNodes) g.attach(n);
    pivotAt(g, centerOf(g));
    return g;
  };
  const lb = P.buildLogicBoard(PM), hs = P.buildHeatsink(PM), fl = P.buildFan(PM, -1), fr = P.buildFan(PM, 1), ssd = P.buildSSD(PM), ap = P.buildAirport(PM), io = P.buildIOBoard(PM), dc = P.buildDCIn(PM), au = P.buildAudio(PM), sl = P.buildSpeaker(PM, -1), sr = P.buildSpeaker(PM, 1), bat = P.buildBattery(PM), tp = P.buildTrackpadMech(PM);
  const upper = P.buildUpperInterior(PM); laptop.add(upper.group);
  const groups = {
    bottomCase: mk('bottomCase', [], [node('bottomCase')]),
    ssd: mk('ssd', [ssd.group]), airport: mk('airport', [ap.group]),
    fanL: mk('fanL', [fl.group]), fanR: mk('fanR', [fr.group]),
    ioBoard: mk('ioBoard', [io.group], [node('ioBoard')]),
    heatsink: mk('heatsink', [hs.group]),
    logic: mk('logic', [lb.group], [node('logic')]),
    dcin: mk('dcin', [dc.group], [node('dcin')]), audio: mk('audio', [au.group], [node('audio')]),
    speakerL: mk('speakerL', [sl.group]), speakerR: mk('speakerR', [sr.group]),
    battery: mk('battery', [bat.group]), trackpad: mk('trackpad', [tp.group], [node('trackpad')]),
  };
  // the display assembly pivots on the clutch hinge; its brackets sit inside the case when closed
  const gLid = new THREE.Group(); gLid.name = 'lid'; laptop.add(gLid); gLid.attach(node('lid'));
  brackets = P.buildHingeBrackets(PM).group; gLid.add(brackets);
  pivotAt(gLid, HINGE);
  laptop.updateMatrixWorld(true);
  // the laptop must be in its upside-down pose to compute the rails
  setPose(1, true); laptop.updateMatrixWorld(true);
  for (const [id, g] of Object.entries(groups)) makePart(id, g);
  makePart('lid', gLid, [[0, 0, 0, 0, 0, 0], [0, -0.4, -6, 0, 0, 0], [0, -0.1, -26, 0, 0, 0]]);
  setPose(0, true);
  for (const id of ['topCase']) { node(id).traverse((o) => { o.userData.partId = id; }); statics[id] = node(id); }
  upper.group.traverse((o) => { o.userData.partId = 'topCase'; });
  node('topCase').traverse((o) => { if (o.isMesh && o.material === MAT.keys) o.userData.noPick = false; });

  // cables (laptop frame at home)
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const flexMat = PM.flex, blackFlex = PM.flexBlack;
  cables.push(new Cable({ owner: parts.battery, target: parts.logic, A: bat.flexStart, via: [V(-1.8, 0.58, 1.0)], B: bat.flexEnd, ribbon: 2.2, mat: blackFlex, dangle: V(0, -0.5, 1.6) }));
  // display, camera and antenna cables run to the clutch hinge; they hang loose once either end is out
  cables.push(new Cable({ owner: parts.logic, target: parts.lid, A: lb.dispConn, via: [V(0.6, 0.72, -10.3), V(0.6, 0.86, -11.0)], B: V(0.6, 1.0, -12.2), ribbon: 1.6, mat: flexMat, dangle: V(0, -0.2, -2.4) }));
  cables.push(new Cable({ owner: parts.logic, target: parts.lid, A: V(-2.2, 0.72, -9.75), via: [V(-2.2, 0.82, -10.8)], B: V(-2.2, 1.0, -12.2), ribbon: 0.45, mat: flexMat, dangle: V(0, -0.2, -2.2) }));
  ap.ant.forEach((p, i) => cables.push(new Cable({ owner: parts.airport, target: parts.lid, A: p, via: [V(p.x, 0.72, -7.6), V(5.4 + i * 0.6, 0.85, -10.2)], B: V(5.3 + i * 0.5, 1.0, -12.2), radius: 0.05, mat: PM.coax, dangle: V(0.2 * i, -0.3, -3.0) })));
  cables.push(new Cable({ owner: parts.ioBoard, target: parts.logic, A: io.plug, via: [V(12.0, 0.66, -2.35), V(9.0, 0.7, -2.3)], B: lb.ioConn, ribbon: 0.4, mat: blackFlex, dangle: V(-2.5, -0.4, 0.4) }));
  cables.push(new Cable({ owner: parts.fanR, target: parts.logic, A: fr.plug, via: [V(7.6, 0.8, -9.4)], B: lb.fanConnR, ribbon: 0.25, mat: blackFlex, dangle: V(-1.2, -0.3, 0.6) }));
  cables.push(new Cable({ owner: parts.fanL, target: parts.logic, A: fl.plug, via: [V(-7.8, 0.8, -9.3)], B: lb.fanConnL, ribbon: 0.25, mat: blackFlex, dangle: V(1.2, -0.3, 0.6) }));
  cables.push(new Cable({ owner: parts.dcin, target: parts.logic, A: dc.plug, via: [V(-16.1, 0.66, -9.3)], B: lb.dcConn, ribbon: 0.35, mat: blackFlex, dangle: V(0.6, -0.3, 1.0) }));
  cables.push(new Cable({ owner: parts.audio, target: parts.logic, A: au.plug, via: [V(-16.5, 0.66, -2.7)], B: lb.audioConn, ribbon: 0.3, mat: blackFlex, dangle: V(0.6, -0.3, 0.8) }));
  cables.push(new Cable({ owner: parts.speakerR, target: parts.logic, A: sr.plug, via: [V(10.0, 0.62, 1.5), V(7.6, 0.7, 0.2)], B: lb.spkConnR, radius: 0.05, mat: PM.coax, dangle: V(-1.5, -0.3, 0.6) }));
  cables.push(new Cable({ owner: parts.trackpad, target: parts.logic, A: tp.plug, via: [V(-0.6, 0.82, 1.4)], B: V(-0.6, 0.86, 0.7), ribbon: 0.9, mat: blackFlex, dangle: V(0, -0.3, -1.2) }));

  scene.traverse((o) => { if (o.isMesh && o.userData.partId && !o.userData.noPick) pickables.push(o); });
  ready = true;
  ui.loader.classList.add('done'); ui.toggle.disabled = false;
}

// ------------------------------------------------------------------ pose: lid angle and the turn-over
const _flipQ = new THREE.Quaternion(), X_AXIS = new THREE.Vector3(1, 0, 0);
let brackets = null; // screwed to the upper case: they hold still while the lid swings, and leave with the display
const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function setPose(p, snap = false) {
  if (snap) pose.p = pose.target = p;
  const close = smooth(0, 0.42, pose.p), flip = smooth(0.38, 1, pose.p);
  laptop.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI * flip);
  laptop.position.set(0, LIFT_B * flip + 21 * Math.sin(Math.PI * flip), 0);
  const lid = parts.lid;
  const angle = THREE.MathUtils.lerp(LID_OPEN, Math.PI / 2, close);
  if (lid) lid.homeQuat.setFromAxisAngle(X_AXIS, angle);
  else { const g = laptop.getObjectByName('lid'); if (g) g.quaternion.setFromAxisAngle(X_AXIS, angle); }
  if (brackets) { brackets.quaternion.setFromAxisAngle(X_AXIS, -angle); brackets.position.copy(HINGE).negate().applyAxisAngle(X_AXIS, -angle); }
  blob.material.opacity = 1 - Math.sin(Math.PI * flip) * 0.8;
}
function updatePose(dt) {
  if (pose.p !== pose.target) {
    const step = dt / (REDUCED ? 0.4 : 1.9);
    pose.p = pose.target > pose.p ? Math.min(pose.target, pose.p + step) : Math.max(pose.target, pose.p - step);
    if (Math.abs(pose.p - pose.target) < 1e-4) { pose.p = pose.target; sound.snap(); }
  }
  setPose(pose.p);
}
const flipped = () => pose.p > 0.999 && pose.target === 1;

// ------------------------------------------------------------------ camera: always centred on the laptop
function fitDistance(radius) { const v = THREE.MathUtils.degToRad(camera.fov), h = 2 * Math.atan(Math.tan(v / 2) * camera.aspect); return radius / Math.sin(Math.min(v, h) / 2); }
const VIEWS = { home: { az: -24, el: 22, r: 24 }, flip: { az: 0, el: 52, r: 24 }, apart: { az: 0, el: 62, r: 50 } };
let flight = null;
const sph = (az, el, d) => new THREE.Spherical(d, THREE.MathUtils.degToRad(90 - el), THREE.MathUtils.degToRad(az));
function flyTo(v, dur = 1.6) {
  const toS = sph(v.az, v.el, fitDistance(v.r));
  const fromS = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  if (REDUCED) { camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(toS)); return; }
  let d = toS.theta - fromS.theta; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  flight = { t: 0, dur, fromS, toS: new THREE.Spherical(toS.radius, toS.phi, fromS.theta + d) };
}
function updateFlight(dt) {
  if (!flight) return;
  flight.t = Math.min(1, flight.t + dt / flight.dur);
  const e = flight.t < 0.5 ? 4 * flight.t ** 3 : 1 - (-2 * flight.t + 2) ** 3 / 2, L = THREE.MathUtils.lerp;
  camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(L(flight.fromS.radius, flight.toS.radius, e), L(flight.fromS.phi, flight.toS.phi, e), L(flight.fromS.theta, flight.toS.theta, e))));
  if (flight.t >= 1) flight = null;
}
const _cb = new THREE.Box3(), _cc = new THREE.Vector3(), _cd = new THREE.Vector3();
function updateCentering(dt) {
  _cb.makeEmpty(); _cb.expandByObject(laptop);
  if (_cb.isEmpty()) return;
  _cb.getCenter(_cc);
  if (TEST && window.__mbp.center) _cc.fromArray(window.__mbp.center);
  const k = 1 - Math.exp(-dt * 3);
  _cd.copy(_cc).sub(controls.target).multiplyScalar(k);
  controls.target.add(_cd); camera.position.add(_cd);
}
{ controls.target.set(0, 8, -2); camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph(VIEWS.home.az, VIEWS.home.el, fitDistance(VIEWS.home.r)))); }

// ------------------------------------------------------------------ picking & dragging
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pick(cx, cy) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  for (const h of raycaster.intersectObjects(pickables, false)) {
    const id = h.object.userData.partId;
    if (!id || !h.object.visible) continue;
    if (id !== 'bottomCase' && id !== 'lid' && id !== 'topCase' && (parts.bottomCase.t < 0.95 || !flipped())) return null; // nothing inside until the case is off
    return { id, point: h.point };
  }
  return null;
}
let hoverId = null, selectedId = null, lastDown = null, downInfo = null, drag = null, sequence = null;
let warnUntil = 0, warnText = '', flashId = null, flashUntil = 0;
function blockerFor(p, dir) {
  if (!flipped()) return { id: p.id, text: 'Double-click the case to turn it over' };
  if (dir > 0) { const need = (NEEDS[p.id] || []).find((id) => parts[id].t < 0.95); if (need) return { id: need, text: `Remove the ${parts[need].name} first` }; }
  if (dir < 0) { const dep = Object.entries(NEEDS).find(([id, n]) => n.includes(p.id) && parts[id].t > 0.02); if (dep) return { id: dep[0], text: `Put the ${parts[dep[0]].name} back first` }; }
  return null;
}
function select(id) { selectedId = id; selectPass.selectedObjects = id ? [parts[id].group] : []; }

function onPointerDown(e) {
  sound.unlock();
  if (!ready) return;
  flight = null;
  const hit = pick(e.clientX, e.clientY);
  const now = performance.now();
  const dbl = lastDown && now - lastDown.time < 380 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 14 && hit && lastDown.id === hit.id;
  lastDown = { time: now, x: e.clientX, y: e.clientY, id: hit?.id };
  downInfo = { x: e.clientX, y: e.clientY, time: now, id: hit?.id, moved: false };
  const p = hit && parts[hit.id];
  // the bottom case is reached by turning the laptop over
  if (dbl && hit && (hit.id === 'bottomCase' || hit.id === 'topCase') && pose.target === 0) { turnOver(); select('bottomCase'); return; }
  if (p) {
    if (dbl && selectedId !== p.id) { select(p.id); sound.release(); showTag(e.clientX, e.clientY, p.id); }
    if (selectedId === p.id && !sequence && flipped()) {
      controls.enabled = false;
      drag = { id: p.id, pointerId: e.pointerId, x: e.clientX, y: e.clientY, t0: p.t, vel: 0, lastTime: now, moved: 0, blocked: null };
      p.drag = true; p.v = 0;
      canvas.setPointerCapture(e.pointerId); canvas.classList.add('grabbing'); e.preventDefault();
      return;
    }
  }
  if (hit && statics[hit.id] && dbl) showTag(e.clientX, e.clientY, hit.id);
  canvas.classList.add('grabbing');
}
canvas.addEventListener('pointermove', (e) => {
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.moved = true; pointer.inside = true;
  if (downInfo && Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y) > 5) downInfo.moved = true;
  if (drag && e.pointerId === drag.pointerId) dragMove(e);
});
canvas.addEventListener('pointerleave', () => { pointer.inside = false; });
window.addEventListener('pointerup', endPointer); window.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
function endPointer(e) {
  canvas.classList.remove('grabbing');
  if (drag && e.pointerId === drag.pointerId) {
    const p = parts[drag.id]; p.drag = false; controls.enabled = true;
    if (drag.moved > 3) {
      let target;
      if (drag.blocked) target = drag.t0 > 0.5 ? 1 : 0;
      else if (Math.abs(drag.vel) > 1.1) target = drag.vel > 0 ? 1 : 0;
      else target = p.t > 0.5 ? 1 : 0;
      p.target = target; p.v = drag.blocked ? 0 : THREE.MathUtils.clamp(drag.vel, -4, 4); p.k = 150;
    }
    sound.slide(0); drag = null;
  } else if (downInfo && !downInfo.moved && performance.now() - downInfo.time < 400) {
    if (!downInfo.id && selectedId) select(null); // a click on empty space clears the selection
    if (TOUCH && downInfo.id) showTag(downInfo.x, downInfo.y, downInfo.id);
  }
  downInfo = null;
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _sa = new THREE.Vector2(), _sb = new THREE.Vector2();
function toScreen(v, out) { const p = v.clone().project(camera); return out.set((p.x * 0.5 + 0.5) * innerWidth, (-p.y * 0.5 + 0.5) * innerHeight); }
function anchorAt(p, t, out) { return laptop.localToWorld(p.rail.offset(THREE.MathUtils.clamp(t, 0, 1), out).add(p.homePos)); }
function dragMove(e) {
  const p = parts[drag.id];
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.hypot(dx, dy);
  const eps = 0.02, t = THREE.MathUtils.clamp(p.t, 0, 1), t0 = Math.max(0, t - eps), t1 = Math.min(1, t + eps);
  toScreen(anchorAt(p, t0, _a), _sa); toScreen(anchorAt(p, t1, _b), _sb);
  const ds = _sb.clone().sub(_sa).divideScalar(t1 - t0), L = ds.length();
  const dtProj = L > 1e-3 ? (dx * ds.x + dy * ds.y) / (L * L) : 0;
  const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
  const towards = _b.clone().sub(_a).normalize().dot(camDir) < 0 ? 1 : -1;
  const w = THREE.MathUtils.smoothstep(L, 90, 260);
  let d = w * dtProj + (1 - w) * ((dy * towards) / (innerHeight * 0.55));
  // near either end, a drag straight towards the parking spot (or straight back home) works as well as one along the path
  const here = toScreen(anchorAt(p, t, _c), new THREE.Vector2());
  const chord = (u) => { const c = toScreen(anchorAt(p, u, _c), new THREE.Vector2()).sub(here), len = c.length(); return len < 40 ? 0 : (Math.sign(u - t) * (dx * c.x + dy * c.y) * Math.abs(u - t)) / (len * len); };
  if (t < 0.2) d = Math.max(d, chord(1));
  else if (t > 0.8) d = Math.min(d, chord(0));
  if (p.t < 0.035 && d > 0) d *= 0.55;
  const blocker = blockerFor(p, Math.sign(d));
  let nt = p.t + d;
  if (blocker) {
    if (!drag.blocked) { drag.blocked = blocker; sound.bump(); warn(blocker.text, blocker.id); }
    const nudge = Math.min(0.035, 0.18 / p.rail.curve.getLength()); // a couple of millimetres: it is stuck, not passing through its neighbours
    nt = drag.t0 + THREE.MathUtils.clamp(nt - drag.t0, -nudge, nudge) * 0.8;
  }
  if (nt > 1) nt = 1 + Math.min(0.04, (nt - 1) * 0.25);
  if (nt < 0) nt = Math.max(-0.02, nt * 0.25);
  const now = performance.now(), dtime = Math.max(1, now - drag.lastTime) / 1000, inst = (nt - p.t) / dtime;
  drag.vel = drag.vel * 0.6 + inst * 0.4; drag.lastTime = now; p.t = nt;
  sound.slide(Math.min(1, Math.abs(inst) * 0.9));
}
function warn(text, id) { warnText = text; warnUntil = performance.now() + 1700; flashId = id; flashUntil = performance.now() + 900; }
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') select(null); });

// ------------------------------------------------------------------ take apart / reassemble
function turnOver() { if (pose.target !== 1) { pose.target = 1; flyTo(VIEWS.flip, 1.9); } }
// the sequence runs on the animation clock, so a slow frame rate never bunches the parts together
let clock = 0;
ui.toggle.addEventListener('click', () => {
  sound.unlock();
  if (!ready || sequence) return;
  const anyOut = Object.values(parts).some((p) => p.t > 0.02) || pose.target === 1;
  select(null);
  const now = clock, gap = REDUCED ? 0.06 : 0.3;
  let i = 0;
  if (!anyOut) {
    turnOver();
    const start = now + (REDUCED ? 0.5 : 2.0);
    for (const id of ORDER_OUT) { const p = parts[id]; p.delay = start + i * gap; p.pending = 1; i++; }
    sequence = { until: start + i * gap + 1.5, flyAt: now + (REDUCED ? 0.5 : 1.9), view: VIEWS.apart, then: () => {} };
  } else {
    for (const id of ORDER_IN) { const p = parts[id]; if (p.t < 0.01) continue; p.delay = now + i * gap; p.pending = 0; i++; }
    sequence = { until: now + i * gap + 1.3, then: () => { pose.target = 0; flyTo(VIEWS.home, 2.0); } };
    flyTo(VIEWS.flip, 1.8);
  }
  ui.toggle.disabled = true;
});
function updateParts(dt) {
  const now = clock;
  if (sequence && sequence.flyAt !== undefined && now >= sequence.flyAt) { flyTo(sequence.view, 2.2); sequence.flyAt = undefined; }
  for (const p of Object.values(parts)) {
    if (p.pending !== undefined && now >= p.delay && (p.pending === 0 || flipped())) { p.target = p.pending; p.pending = undefined; p.k = 70; p.v = 0; }
    if (p.drag) { applyPart(p); continue; }
    const steps = 4, h = dt / steps;
    for (let i = 0; i < steps; i++) { const c = 2 * Math.sqrt(p.k) * (REDUCED ? 1.4 : 1.0), a = -p.k * (p.t - p.target) - c * p.v; p.v += a * h; p.t += p.v * h; }
    if (Math.abs(p.t - p.target) < 1e-4 && Math.abs(p.v) < 1e-3) { p.t = p.target; p.v = 0; }
    applyPart(p);
    const homeNow = p.t < 0.004;
    if (homeNow && p.wasAway) sound.snap();
    p.wasAway = !homeNow && p.t > 0.02 ? true : (homeNow ? false : p.wasAway);
  }
  if (sequence && now > sequence.until && Object.values(parts).every((p) => p.pending === undefined && Math.abs(p.t - p.target) < 0.002)) {
    const then = sequence.then; sequence = null; then();
  }
  const busy = !!sequence || pose.p !== pose.target;
  if (ui.toggle.disabled !== busy) ui.toggle.disabled = busy;
  const anyOut = Object.values(parts).some((p) => p.t > 0.5 || p.target > 0.5) || pose.target === 1;
  const label = anyOut ? 'Reassemble' : 'Take Apart';
  if (ui.toggle.textContent !== label) ui.toggle.textContent = label;
}

// ------------------------------------------------------------------ hover label
let tagTimer = 0;
function tagContent(id) {
  const info = parts[id] || { ...PART_INFO[id] };
  let act = '';
  if (parts[id] || id === 'topCase') {
    if (!flipped() && (id === 'topCase' || id === 'bottomCase')) act = TOUCH ? 'Double-tap to turn it over' : 'Double-click to turn it over';
    else if (parts[id]) act = selectedId !== id ? (TOUCH ? 'Double-tap to select' : 'Double-click to select') : parts[id].t > 0.5 ? 'Drag to put it back' : 'Drag to pull it out';
  }
  return { name: info.name, desc: info.desc, act };
}
function renderTag(id, x, y, warnMsg) {
  const c = tagContent(id);
  ui.tag.querySelector('.name').textContent = c.name; ui.tag.querySelector('.desc').textContent = c.desc; ui.tag.querySelector('.act').textContent = warnMsg || c.act;
  ui.tag.classList.toggle('warn', !!warnMsg);
  const r = ui.tag.getBoundingClientRect();
  ui.tag.style.left = `${Math.max(10, Math.min(innerWidth - r.width - 10, x + 16))}px`; ui.tag.style.top = `${Math.max(10, Math.min(innerHeight - r.height - 10, y + 16))}px`;
  ui.tag.classList.add('show');
}
function showTag(x, y, id) { tagTimer = performance.now() + 2400; renderTag(id, x, y); ui.tag.dataset.id = id; ui.tag.dataset.x = x; ui.tag.dataset.y = y; }
function updateHover() {
  const now = performance.now();
  if (!TOUCH && pointer.inside && !drag) {
    if (pointer.moved && !(downInfo && downInfo.moved)) { pointer.moved = false; const hit = pick(pointer.x, pointer.y); hoverId = hit ? hit.id : null; }
  } else if (!TOUCH && !pointer.inside) hoverId = null;
  if (downInfo && downInfo.moved && hoverId && !drag) hoverId = null;
  canvas.classList.toggle('pointing', !!(hoverId && (parts[hoverId] || hoverId === 'topCase')));
  const flash = flashId && now < flashUntil ? flashId : null;
  const hov = flash || (hoverId && parts[hoverId] && hoverId !== selectedId ? hoverId : null);
  hoverPass.visibleEdgeColor.set(flash ? '#ff6a3d' : '#ffffff');
  hoverPass.selectedObjects = hov ? [parts[hov].group] : [];
  const warnMsg = now < warnUntil ? warnText : '';
  if (drag) renderTag(drag.id, pointer.x, pointer.y, warnMsg);
  else if (!TOUCH && hoverId && pointer.inside && !(downInfo && downInfo.moved)) renderTag(hoverId, pointer.x, pointer.y, warnMsg);
  else if (now < tagTimer && ui.tag.dataset.id) renderTag(ui.tag.dataset.id, +ui.tag.dataset.x, +ui.tag.dataset.y, warnMsg);
  else ui.tag.classList.remove('show');
}

// ------------------------------------------------------------------ resize & loop
function resize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight);
  hoverPass.setSize(innerWidth, innerHeight); selectPass.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
let last = performance.now();
const TEST = /[?&]test\b/.test(location.search);
function frame(now, manualDt) {
  const dt = manualDt ?? Math.min(0.05, (now - last) / 1000);
  last = now;
  if (ready) {
    clock += dt;
    updatePose(dt);
    updateParts(dt);
    for (const c of cables) c.update(dt);
    updateCentering(dt);
    updateHover();
  }
  updateFlight(dt);
  controls.update(dt);
  composer.render(dt);
  if (!TEST) requestAnimationFrame(frame);
}
if (!TEST) requestAnimationFrame(frame);
init().catch((err) => console.error(err));
if (TEST) window.__mbp = { step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(performance.now(), dt); }, parts, pose, select, camera, controls, flyTo, VIEWS, laptop,
  get ready() { return ready; }, get selected() { return selectedId; }, get hover() { return hoverId; }, get drag() { return drag; }, center: null,
  setT(id, t) { parts[id].t = t; parts[id].target = t; parts[id].v = 0; }, setPose(p) { pose.p = pose.target = p; setPose(p); } };
