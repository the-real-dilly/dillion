/* ==========================================================================
   DILLY STRIKE — first-person viewmodels
   CC0 Quaternius gun models (assets/guns, see assets/CREDITS.md) with PBR-ish
   materials (gunmetal, polymer, varnished wood, steel, glass), a procedural
   karambit-style blade, gloved first-person arms with articulated fingers
   (two-segment arm placement adapted from last-zone/actors.js makeVMArms /
   poseVMArm), and the animation layer: draw, sway, bob, recoil spring,
   reload and inspect choreography, knife slash, muzzle flash sprite + light,
   ejected casings. Viewmodel meshes use their own projection (62° FOV) and
   are drawn last after a depth clear so they never clip into walls.
   ========================================================================== */
import * as THREE from 'three';
import { OBJLoader } from '../../vendor/jsm/loaders/OBJLoader.js';
import { MTLLoader } from '../../vendor/jsm/loaders/MTLLoader.js';
import { registerEnv } from './render.js';
import * as TX from './textures.js';

const GUN_PATH = new URL('../../assets/guns/', import.meta.url).href;
// model space: barrel +X, up +Y. grip = where the firing hand wraps, fore = support-hand point, muzzle, magwell
export const GUNS = {
  vandal: { file: 'AssaultRifle_1', scale: 0.2, grip: [0.24, 0.1], fore: [1.82, 0.3], muzzle: [2.93, 0.54], mag: [0.98, -0.1], cls: 'rifle', tint: 1 },
  phantom: { file: 'AssaultRifle2_1', scale: 0.158, grip: [0.08, 0.08], fore: [1.85, 0.47], muzzle: [3.62, 0.64], mag: [0.98, -0.05], cls: 'rifle', suppressor: true },
  operator: { file: 'SniperRifle_1', scale: 0.158, grip: [0.18, -0.06], fore: [2.35, 0.06], muzzle: [5.26, 0.33], mag: [1.25, -0.05], cls: 'sniper' },
  sheriff: { file: 'Revolver_1', scale: 0.155, grip: [0.05, 0.05], fore: [0.05, 0.05], muzzle: [1.74, 0.43], mag: [0.55, 0.2], cls: 'pistol', chrome: true }
};

const S = { ready: false, loading: null, guns: {}, tex: null };

/* ---------------- materials ---------------- */
function texSet() {
  if (S.tex) return S.tex;
  S.tex = {
    metal: TX.gunSurface(71, 'metal', 256), poly: TX.gunSurface(73, 'poly', 256), wood: TX.woodGrain(61, 0x8a4f2a, 256),
    sleeveCT: TX.fabric(81, 0x52606e, null, 256, 0, 70), sleeveT: TX.fabric(83, 0xa4906a, null, 256, 0, 70), glove: TX.gunSurface(85, 'poly', 128)
  };
  return S.tex;
}
// viewmodel projection patch: draw with a fixed 62° projection regardless of the camera FOV
export const VMU = { proj: { value: new THREE.Matrix4() } };
function vmPatch(m) {
  m.transparent = true; m.depthWrite = true; m.depthTest = true; m.opacity = 1;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uVMProj = VMU.proj;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 uVMProj;')
      .replace('#include <project_vertex>', 'vec4 mvPosition = vec4( transformed, 1.0 );\nmvPosition = modelViewMatrix * mvPosition;\ngl_Position = uVMProj * mvPosition;');
  };
  m.customProgramCacheKey = () => 'vm' + (m.userData.kind || '');
  return m;
}
function gunMaterial(name, kd, vm, spec) {
  const n = (name || '').toLowerCase(), T = texSet();
  const lin = new THREE.Color().copy(kd || new THREE.Color(0.04, 0.04, 0.04));
  let m;
  if (n.includes('wood')) m = new THREE.MeshStandardMaterial({ map: T.wood.map, normalMap: T.wood.normalMap, roughnessMap: T.wood.roughnessMap, color: 0xd8b8a0, roughness: 1, metalness: 0, name });
  else if (n.includes('glass')) m = registerEnv(new THREE.MeshStandardMaterial({ color: 0x0a1626, roughness: 0.05, metalness: 0.9, name }), 1.6);
  else if (n.includes('lightmetal') || (spec.chrome && n.includes('metal'))) m = registerEnv(new THREE.MeshStandardMaterial({ map: T.metal.map, roughnessMap: T.metal.roughnessMap, normalMap: T.metal.normalMap, color: n.includes('light') ? 0x8a9098 : 0x60656c, roughness: 1.35, metalness: 1, name }), 0.7);
  else if (n.includes('metal') || n === 'grey') m = registerEnv(new THREE.MeshStandardMaterial({ map: T.metal.map, roughnessMap: T.metal.roughnessMap, normalMap: T.metal.normalMap, color: lin.clone().multiplyScalar(2.2), roughness: 1.15, metalness: 0.9, name }), 1.0);
  else if (n.includes('green')) m = registerEnv(new THREE.MeshStandardMaterial({ map: T.poly.map, roughnessMap: T.poly.roughnessMap, normalMap: T.poly.normalMap, color: new THREE.Color(0x56603f), roughness: 1.1, metalness: 0.1, name }), 0.5);
  else { // black / main polymer
    const c = lin.clone().multiplyScalar(n.includes('light') ? 2.4 : 1.9);
    m = registerEnv(new THREE.MeshStandardMaterial({ map: T.poly.map, roughnessMap: T.poly.roughnessMap, normalMap: T.poly.normalMap, color: c, roughness: 1.1, metalness: 0.12, name }), 0.6);
  }
  m.normalScale = new THREE.Vector2(0.6, 0.6);
  if (vm) { m.userData.kind = 'g'; vmPatch(m); }
  return m;
}
// planar UVs for un-mapped OBJ meshes (per-triangle dominant axis)
function boxUV(g, scale) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 3) {
    let ax = 0, ay = 0, az = 0;
    for (let k = 0; k < 3; k++) { ax += Math.abs(n.getX(i + k)); ay += Math.abs(n.getY(i + k)); az += Math.abs(n.getZ(i + k)); }
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k);
      let u, v; if (az >= ax && az >= ay) { u = x; v = y; } else if (ay >= ax) { u = x; v = z; } else { u = z; v = y; }
      uv[(i + k) * 2] = u / scale; uv[(i + k) * 2 + 1] = v / scale;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/* ---------------- loading ---------------- */
export function loadGuns() {
  if (S.loading) return S.loading;
  S.loading = Promise.all(Object.entries(GUNS).map(async ([id, spec]) => {
    const mtl = await new MTLLoader().setPath(GUN_PATH).loadAsync(spec.file + '.mtl'); mtl.preload();
    const obj = await new OBJLoader().setMaterials(mtl).setPath(GUN_PATH).loadAsync(spec.file + '.obj');
    const parts = [];
    obj.traverse((o) => {
      if (!o.isMesh) return;
      let g = o.geometry; if (g.index) g = g.toNonIndexed();
      if (!g.attributes.normal) g.computeVertexNormals();
      boxUV(g, 0.45);
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      if (g.groups && g.groups.length) for (const gr of g.groups) parts.push({ geo: g, group: gr, mat: ms[gr.materialIndex] || ms[0] });
      else parts.push({ geo: g, group: null, mat: ms[0] });
    });
    S.guns[id] = { spec, parts };
  })).then(() => { S.ready = true; });
  return S.loading;
}
export function gunsReady() { return S.ready; }

// a gun "holder": origin at the firing-hand grip, barrel along -Z, up +Y, right +X
export function buildGun(id, vm = false) {
  const G = S.guns[id]; if (!G) return null;
  const { spec } = G, s = spec.scale;
  const holder = new THREE.Group(), inner = new THREE.Group();
  inner.rotation.y = Math.PI / 2; inner.scale.setScalar(s);
  inner.position.set(0, -spec.grip[1] * s, spec.grip[0] * s);
  const matCache = {};
  for (const p of G.parts) {
    const key = p.mat.name;
    const mat = matCache[key] || (matCache[key] = gunMaterial(p.mat.name, p.mat.color, vm, spec));
    let geo = p.geo;
    if (p.group) { geo = new THREE.BufferGeometry(); for (const k of Object.keys(p.geo.attributes)) geo.setAttribute(k, p.geo.attributes[k]); geo.setDrawRange(p.group.start, p.group.count); }
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = !vm; mesh.receiveShadow = true;
    inner.add(mesh);
  }
  holder.add(inner);
  const toH = (pt) => new THREE.Vector3(0, (pt[1] - spec.grip[1]) * s, -(pt[0] - spec.grip[0]) * s);
  holder.userData = { id, spec, muzzle: toH(spec.muzzle), fore: toH(spec.fore), mag: toH(spec.mag) };
  if (spec.suppressor) {
    const sm = gunMaterial('Black', new THREE.Color(0.02, 0.02, 0.022), vm, spec);
    const sup = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.17, 18), sm); sup.rotation.x = Math.PI / 2;
    sup.position.copy(holder.userData.muzzle).add(new THREE.Vector3(0, 0, -0.06)); holder.add(sup);
    const cap = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.004, 6, 18), gunMaterial('Metal', new THREE.Color(0.05, 0.05, 0.05), vm, spec));
    cap.position.copy(sup.position).add(new THREE.Vector3(0, 0, -0.085)); holder.add(cap);
    holder.userData.muzzle.z -= 0.15;
  }
  return holder;
}

/* ---------------- knife (procedural) ---------------- */
function buildKnife(vm) {
  const T = texSet();
  const steel = registerEnv(new THREE.MeshStandardMaterial({ color: 0x9a9890, metalness: 1, roughness: 1.1, roughnessMap: T.metal.roughnessMap, map: T.metal.map }), 0.8);
  const edge = registerEnv(new THREE.MeshStandardMaterial({ color: 0xe8ecf0, metalness: 1, roughness: 0.12 }), 1.6);
  const g10 = registerEnv(new THREE.MeshStandardMaterial({ color: 0x2a3a30, roughness: 0.6, metalness: 0.1, normalMap: T.poly.normalMap, roughnessMap: T.poly.roughnessMap }), 0.6);
  const accent = registerEnv(new THREE.MeshStandardMaterial({ color: 0xd8a23a, roughness: 0.3, metalness: 1 }), 1.2);
  if (vm) for (const m of [steel, edge, g10, accent]) { m.userData.kind = 'k'; vmPatch(m); }
  const h = new THREE.Group();
  // curved blade (profile in the YZ plane, extruded thin along X with a bevelled edge)
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.bezierCurveTo(0.02, -0.06, 0.06, -0.13, 0.03, -0.2); // spine curving forward/down
  s.bezierCurveTo(0.02, -0.17, -0.005, -0.11, -0.03, -0.06); // cutting edge back
  s.bezierCurveTo(-0.035, -0.04, -0.03, -0.015, -0.022, 0); s.lineTo(0, 0);
  const bg = new THREE.ExtrudeGeometry(s, { depth: 0.0035, bevelEnabled: true, bevelThickness: 0.0016, bevelSize: 0.0022, bevelSegments: 2, curveSegments: 24 });
  bg.translate(0, 0, -0.00175); // centre thickness on X after rotation
  const blade = new THREE.Mesh(bg, steel);
  // shape coords: x -> up(+Y), y -> forward(-Z)
  blade.rotation.set(-Math.PI / 2, 0, Math.PI / 2); blade.rotation.order = 'ZXY';
  const bladeG = new THREE.Group(); bladeG.add(blade);
  bladeG.rotation.set(0, Math.PI / 2, 0);
  const holder2 = new THREE.Group(); holder2.add(bladeG); holder2.position.set(0, 0.012, -0.06); holder2.scale.setScalar(0.75);
  h.add(holder2);
  // handle + guard + finger ring (the "fang")
  const handle = new THREE.Mesh(new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.014, 0.085, 6, 12) : new THREE.CylinderGeometry(0.014, 0.014, 0.11, 12), g10);
  handle.rotation.x = Math.PI / 2; handle.scale.set(0.85, 1, 1.25); handle.position.set(0, 0, 0.0); h.add(handle);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.045, 0.01), accent); guard.position.set(0, 0.004, -0.057); h.add(guard);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0055, 8, 22), accent); ring.rotation.y = Math.PI / 2; ring.position.set(0, -0.005, 0.075); h.add(ring);
  for (const z of [-0.03, 0, 0.03]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.032, 8), accent); p.rotation.z = Math.PI / 2; p.position.set(0, 0, z); h.add(p); }
  h.traverse((o) => { if (o.isMesh) { o.castShadow = !vm; o.receiveShadow = true; } });
  h.userData = { id: 'knife', spec: { cls: 'knife' }, muzzle: new THREE.Vector3(0, 0.03, -0.2), fore: new THREE.Vector3(), mag: new THREE.Vector3() };
  return h;
}

/* ---------------- first-person arms with fingers ---------------- */
function buildArm(side, team) {
  const T = texSet();
  const isCT = team !== 'omega';
  const sl = isCT ? T.sleeveCT : T.sleeveT;
  const sleeve = vmPatch(new THREE.MeshStandardMaterial({ map: sl.map, normalMap: sl.normalMap, roughnessMap: sl.roughnessMap, roughness: 1, metalness: 0 }));
  const glove = vmPatch(new THREE.MeshStandardMaterial({ color: isCT ? 0x24272b : 0x5e4e3a, roughness: 0.78, metalness: 0.02, normalMap: T.glove.normalMap }));
  const pad = vmPatch(new THREE.MeshStandardMaterial({ color: isCT ? 0x16181b : 0x3e3428, roughness: 0.5, metalness: 0.05 }));
  const strap = vmPatch(new THREE.MeshStandardMaterial({ color: isCT ? 0x3a4a5c : 0x7a6a50, roughness: 0.85 }));
  sleeve.userData.kind = glove.userData.kind = pad.userData.kind = strap.userData.kind = 'a';
  const g = new THREE.Group();
  // forearm (tapered lathe along +Y, unit length), rolled cuff, glove gauntlet
  const prof = [[0, -0.02], [0.05, -0.02], [0.054, 0.15], [0.05, 0.45], [0.044, 0.75], [0.038, 0.98], [0.0, 1.0]].map(([r, y]) => new THREE.Vector2(r, y));
  const fore = new THREE.Mesh(new THREE.LatheGeometry(prof, 16), sleeve);
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.012, 8, 18), sleeve); cuff.rotation.x = Math.PI / 2;
  const cuffG = new THREE.Group(); cuffG.add(cuff);
  // hand (local: +Y wrist->knuckles, +Z back of hand, thumb on -X*side)
  const hand = new THREE.Group();
  const gaunt = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.075, 14), glove); gaunt.position.y = -0.03; hand.add(gaunt);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.022, 14), strap); band.position.y = -0.045; hand.add(band);
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), glove); palm.scale.set(0.86, 1.0, 0.36); palm.position.y = 0.045; hand.add(palm);
  const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.022, 0.012), pad); knuckle.position.set(0, 0.082, 0.014); hand.add(knuckle);
  const fingers = [];
  const FL = [[0.03, 0.022, 0.018, 0.0098], [0.033, 0.024, 0.019, 0.0102], [0.031, 0.022, 0.018, 0.0098], [0.025, 0.018, 0.015, 0.0088]];
  FL.forEach((f, k) => {
    const x = (-0.027 + k * 0.018) * side;
    let parent = hand; const joints = [];
    for (let j = 0; j < 3; j++) {
      const jg = new THREE.Group(); jg.position.set(j === 0 ? x : 0, j === 0 ? 0.088 - (k === 3 ? 0.006 : 0) : FL[k][j - 1], 0);
      const seg = new THREE.Mesh(new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(f[3] * (1 - j * 0.08), f[j] - f[3] * 1.2, 4, 8) : new THREE.CylinderGeometry(f[3], f[3], f[j], 8), glove);
      seg.position.y = f[j] / 2; jg.add(seg);
      if (j === 0) { const kp = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 0.006), pad); kp.position.set(0, 0.008, f[3] * 0.85); jg.add(kp); }
      parent.add(jg); parent = jg; joints.push(jg);
    }
    fingers.push(joints);
  });
  // thumb
  const tb = new THREE.Group(); tb.position.set(-0.034 * side, 0.02, -0.008); tb.rotation.set(-0.3, 0, 0.75 * side); hand.add(tb);
  const t1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0115, 0.026, 4, 8), glove); t1.position.y = 0.019; tb.add(t1);
  const tj = new THREE.Group(); tj.position.y = 0.038; tb.add(tj);
  const t2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0105, 0.018, 4, 8), glove); t2.position.y = 0.014; tj.add(t2);
  g.add(fore, cuffG, hand);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; o.frustumCulled = false; o.renderOrder = 9999; } });
  g.userData = { fore, cuffG, hand, fingers, thumb: [tb, tj], side };
  return g;
}
const _y = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _d = new THREE.Vector3(), _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3(), _m = new THREE.Matrix4();
function poseArm(arm, elbow, wrist, dirY, backZ, curl, trigger = 0) {
  const { fore, cuffG, hand, fingers, thumb, side } = arm.userData;
  _d.subVectors(wrist, elbow); const L = _d.length(); _d.normalize();
  _q.setFromUnitVectors(_y, _d);
  fore.position.copy(elbow); fore.quaternion.copy(_q); fore.scale.set(1, L - 0.03, 1);
  cuffG.position.copy(wrist).addScaledVector(_d, -0.1); cuffG.quaternion.copy(_q);
  _by.copy(dirY).normalize(); _bz.copy(backZ).addScaledVector(_by, -backZ.dot(_by)).normalize(); _bx.crossVectors(_by, _bz);
  _m.makeBasis(_bx, _by, _bz); hand.quaternion.setFromRotationMatrix(_m); hand.position.copy(wrist);
  // finger curl: rotate toward the palm (-Z) about local X
  fingers.forEach((joints, k) => {
    const c = k === 0 ? curl * (1 - trigger * 0.55) : curl;
    joints[0].rotation.x = -c * 1.05; joints[1].rotation.x = -c * 1.25; joints[2].rotation.x = -c * 0.9;
    joints[0].rotation.z = (k - 1.5) * -0.06 * side;
  });
  thumb[1].rotation.x = -curl * 0.6;
}

/* ---------------- controller ---------------- */
// per class hold: right wrist / hand frame and left wrist / hand frame in holder space
const HOLD = {
  rifle: { pos: [0.17, -0.2, -0.19], rot: [0.04, 0.13, -0.05], rW: [0.032, -0.045, 0.068], rY: [0.05, 0.42, -1], rZ: [1, 0.35, 0], rC: 0.95, lY: [0.35, 0.25, -1], lZ: [-0.55, -0.85, 0], lC: 0.75, lOff: [-0.04, -0.05, 0.065], rE: [0.36, -0.44, 0.14], lE: [-0.1, -0.46, -0.2] },
  sniper: { pos: [0.15, -0.17, -0.22], rot: [0.03, 0.11, -0.04], rW: [0.034, -0.05, 0.07], rY: [0.05, 0.38, -1], rZ: [1, 0.35, 0], rC: 0.95, lY: [0.35, 0.25, -1], lZ: [-0.55, -0.85, 0], lC: 0.7, lOff: [-0.04, -0.055, 0.06], rE: [0.34, -0.42, 0.14], lE: [-0.08, -0.46, -0.24] },
  pistol: { pos: [0.1, -0.14, -0.3], rot: [0.03, 0.06, 0], rW: [0.03, -0.06, 0.06], rY: [0.05, 0.5, -1], rZ: [1, 0.3, 0], rC: 1.0, lY: [0.6, 0.45, -1], lZ: [-0.75, -0.45, 0], lC: 0.85, lOff: [-0.05, -0.065, 0.055], rE: [0.24, -0.38, 0.05], lE: [-0.14, -0.4, -0.02] },
  knife: { pos: [0.13, -0.15, -0.3], rot: [0.25, 0.25, 0.1], rW: [0.032, -0.03, 0.06], rY: [0.0, 0.55, -1], rZ: [1, 0.2, 0], rC: 1.1, rE: [0.3, -0.38, 0.12] }
};
const ease = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
const bump = (u, a, b) => Math.max(0, Math.min(1, (u - a) / (b - a)));

export function createViewmodel({ vmRoot, camera, scene, me, weaponModels, oldParts = [], team = 'alpha' }) {
  const VM = {
    ready: false, rig: new THREE.Group(), guns: {}, arms: null, team, cur: null,
    drawT: 1, lastYaw: me.yaw, lastPitch: me.pitch, sway: new THREE.Vector2(), swayV: new THREE.Vector2(),
    kick: 0, kickV: 0, kickRot: 0, kickRotV: 0, roll: 0, rollV: 0, slash: 0, reloadTotal: 1.45, inspectTotal: 1.8, prevReload: 0, prevInspect: 0,
    flashT: 0, casings: [], wasGround: true, land: 0, bobAmp: 0
  };
  // depth clear just before the viewmodel draws (transparent queue, highest renderOrder)
  const clr = new THREE.Mesh(new THREE.PlaneGeometry(0.001, 0.001), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true }));
  clr.position.set(0, 0, -0.2); clr.frustumCulled = false; clr.renderOrder = 9998; clr.castShadow = false;
  clr.onBeforeRender = (r) => { r.state.buffers.depth.setMask(true); r.clearDepth(); };
  VM.rig.add(clr);
  vmRoot.add(VM.rig);
  // muzzle flash: additive star sprites + point light
  const fl = TX.canvasTex(128, (x, W, H) => {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 60); g.addColorStop(0, 'rgba(255,250,230,1)'); g.addColorStop(0.18, 'rgba(255,214,140,0.95)'); g.addColorStop(0.45, 'rgba(255,150,60,0.35)'); g.addColorStop(1, 'rgba(255,120,40,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    x.globalCompositeOperation = 'lighter'; x.fillStyle = 'rgba(255,220,160,0.8)';
    for (let i = 0; i < 6; i++) { x.save(); x.translate(64, 64); x.rotate(i / 6 * Math.PI * 2 + 0.3); x.beginPath(); x.moveTo(0, -4); x.lineTo(60, 0); x.lineTo(0, 4); x.fill(); x.restore(); }
  });
  const flMat = new THREE.MeshBasicMaterial({ map: fl, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, color: 0xffffff, toneMapped: false });
  vmPatch(flMat); flMat.userData.kind = 'f'; flMat.depthWrite = false;
  const flash = new THREE.Group();
  const f1 = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), flMat); flash.add(f1);
  const sideG = new THREE.PlaneGeometry(0.26, 0.09); sideG.translate(0, 0, 0);
  const f2 = new THREE.Mesh(sideG, flMat); f2.rotation.y = Math.PI / 2; f2.position.z = -0.09; flash.add(f2);
  const f3 = new THREE.Mesh(sideG, flMat); f3.rotation.set(0, Math.PI / 2, Math.PI / 2); f3.position.z = -0.09; flash.add(f3);
  flash.traverse((o) => { if (o.isMesh) { o.renderOrder = 10000; o.frustumCulled = false; } });
  const light = new THREE.PointLight(0xffb469, 0, 7, 2);
  VM.flash = flash; VM.flMat = flMat; VM.light = light;
  vmRoot.add(light);
  // casings (world space)
  const brass = registerEnv(new THREE.MeshStandardMaterial({ color: 0xc89a48, metalness: 1, roughness: 0.3 }), 1.2);
  const caseGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.03, 8);

  VM.init = async () => {
    await loadGuns();
    for (const id of Object.keys(weaponModels)) {
      const h = id === 'knife' ? buildKnife(true) : buildGun(id, true); if (!h) continue;
      h.traverse((o) => { if (o.isMesh) { o.renderOrder = 9999; o.frustumCulled = false; o.castShadow = false; } });
      VM.guns[id] = h;
      // keep main.js's weaponModels[id] group (equipWeapon toggles its .visible): swap its contents
      const grp = weaponModels[id];
      while (grp.children.length) grp.remove(grp.children[0]);
      grp.position.set(0, 0, 0); grp.rotation.set(0, 0, 0);
      grp.add(h);
      VM.rig.add(grp);
    }
    for (const o of oldParts) if (o && o.parent) o.parent.remove(o);
    VM.armR = buildArm(1, team); VM.armL = buildArm(-1, team);
    VM.rig.add(VM.armR, VM.armL);
    VM.ready = true;
  };
  VM.setTeam = (t) => {
    if (!VM.ready || t === VM.team) return; VM.team = t;
    for (const a of [VM.armR, VM.armL]) { VM.rig.remove(a); }
    VM.armR = buildArm(1, t); VM.armL = buildArm(-1, t); VM.rig.add(VM.armR, VM.armL);
  };
  VM.shot = () => {
    if (!VM.ready) return;
    const id = me.weaponId, cls = id === 'knife' ? 'knife' : (VM.guns[id] ? VM.guns[id].userData.spec.cls : 'rifle');
    if (cls === 'knife') { VM.slash = 1; return; }
    const k = cls === 'sniper' ? 2.2 : cls === 'pistol' ? 1.5 : 1;
    VM.kickV += 3.2 * k; VM.kickRotV += 5.0 * k; VM.rollV += (Math.random() - 0.5) * 3.5 * k;
    if (id !== 'phantom') { VM.flashT = 0.05; VM.flash.rotation.z = Math.random() * Math.PI; const sc = 0.8 + Math.random() * 0.5; VM.flash.scale.set(sc, sc, sc); }
    else VM.flashT = 0.02;
    // casing
    if (cls !== 'knife' && scene) {
      const g = VM.guns[id]; if (!g) return;
      const m = new THREE.Mesh(caseGeo, brass); m.castShadow = false;
      const p = new THREE.Vector3(0.02, 0.03, -0.06).applyMatrix4(g.matrixWorld);
      m.position.copy(p);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      const v = right.multiplyScalar(1.6 + Math.random()).add(up.multiplyScalar(1.4 + Math.random() * 0.8));
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      scene.add(m); VM.casings.push({ m, v, life: 1.4, spin: new THREE.Vector3(Math.random() * 20, Math.random() * 20, 0) });
      if (VM.casings.length > 24) { const o = VM.casings.shift(); scene.remove(o.m); }
    }
  };

  const _w = new THREE.Vector3(), _e = new THREE.Vector3(), _dy = new THREE.Vector3(), _dz = new THREE.Vector3(), _f = new THREE.Vector3(), _mag = new THREE.Vector3();
  VM.update = (dt) => {
    if (!VM.ready) return false;
    // own projection for the viewmodel (fixed FOV)
    const fov = 62, aspect = camera.aspect, near = 0.01, far = 50, top = near * Math.tan(THREE.MathUtils.degToRad(fov / 2));
    VMU.proj.value.makePerspective(-top * aspect, top * aspect, top, -top, near, far);
    vmRoot.position.set(0, 0, 0); vmRoot.rotation.set(0, 0, 0);
    const id = me.weaponId, gun = VM.guns[id];
    if (!gun) return true;
    const spec = gun.userData.spec, cls = id === 'knife' ? 'knife' : spec.cls, H = HOLD[cls] || HOLD.rifle;
    if (VM.cur !== id) { VM.cur = id; VM.drawT = 0; }
    VM.drawT = Math.min(1, VM.drawT + dt / 0.42);
    // sway from look delta (springy lag)
    let dyaw = me.yaw - VM.lastYaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    const dp = me.pitch - VM.lastPitch; VM.lastYaw = me.yaw; VM.lastPitch = me.pitch;
    const tx = THREE.MathUtils.clamp(-dyaw / Math.max(dt, 1e-3) * 0.012, -0.06, 0.06), ty = THREE.MathUtils.clamp(-dp / Math.max(dt, 1e-3) * 0.012, -0.05, 0.05);
    // springs, integrated in small fixed sub-steps so they stay stable at any frame rate
    const nSub = Math.min(12, Math.ceil(dt / (1 / 120))), h = dt / nSub;
    for (let k = 0; k < nSub; k++) {
      VM.swayV.x += ((tx - VM.sway.x) * 90 - VM.swayV.x * 14) * h; VM.swayV.y += ((ty - VM.sway.y) * 90 - VM.swayV.y * 14) * h;
      VM.sway.x += VM.swayV.x * h; VM.sway.y += VM.swayV.y * h;
      VM.kickV += (-VM.kick * 1600 - VM.kickV * 80) * h; VM.kick += VM.kickV * h;
      VM.kickRotV += (-VM.kickRot * 1300 - VM.kickRotV * 66) * h; VM.kickRot += VM.kickRotV * h;
      VM.rollV += (-VM.roll * 900 - VM.rollV * 60) * h; VM.roll += VM.rollV * h;
    }
    VM.flashT -= dt;
    // bob / idle breathing / landing
    const spd = Math.hypot(me.vel.x, me.vel.z), mv = Math.min(1, spd / 6);
    VM.bobAmp += (mv - VM.bobAmp) * Math.min(1, dt * 8);
    const ph = me.walkPhase, t = performance.now() / 1000;
    const bobX = Math.sin(ph) * 0.011 * VM.bobAmp, bobY = -Math.abs(Math.cos(ph)) * 0.012 * VM.bobAmp + Math.sin(t * 1.6) * 0.0018;
    if (me.onGround && !VM.wasGround) VM.land = 1; VM.wasGround = me.onGround; VM.land = Math.max(0, VM.land - dt * 5);
    const airY = me.onGround ? 0 : THREE.MathUtils.clamp(-me.vel.y * 0.004, -0.02, 0.03);
    // reload / inspect timelines
    if (me.reloadTimer > VM.prevReload + 0.01) VM.reloadTotal = Math.max(0.5, me.reloadTimer);
    VM.prevReload = me.reloadTimer;
    if (me.inspectTimer > VM.prevInspect + 0.01) VM.inspectTotal = Math.max(0.5, me.inspectTimer);
    VM.prevInspect = me.inspectTimer;
    const ru = me.reloadTimer > 0 ? 1 - me.reloadTimer / VM.reloadTotal : -1;
    const iu = me.inspectTimer > 0 ? 1 - me.inspectTimer / VM.inspectTotal : -1;
    // pose composition
    const draw = 1 - ease(VM.drawT);
    let px = H.pos[0] + bobX + VM.sway.x * 0.6, py = H.pos[1] + bobY + VM.sway.y * 0.5 - draw * 0.22 - VM.land * 0.02 + airY - (me.crouching ? 0.008 : 0), pz = H.pos[2] + VM.kick;
    let rx = H.rot[0] + VM.kickRot - draw * 0.9 + VM.sway.y * 1.2 + VM.land * 0.05, ry = H.rot[1] + VM.sway.x * 1.6, rz = H.rot[2] + VM.roll + bobX * 2.5 + VM.sway.x * 0.8;
    let lHandOnGun = cls !== 'knife';
    let lTarget = null;
    if (ru >= 0 && cls !== 'knife') {
      const tilt = ease(bump(ru, 0, 0.15)) * (1 - ease(bump(ru, 0.82, 1)));
      rz += tilt * (cls === 'pistol' ? 0.5 : 0.6); rx += tilt * 0.2; py -= tilt * 0.03; px -= tilt * 0.02;
      const seat = Math.max(0, 1 - Math.abs(ru - 0.66) / 0.05); rx -= seat * 0.06; py += seat * 0.012; // mag seated jolt
      if (cls === 'pistol') { rz += tilt * 0.4; }
      // left hand: magwell -> down out of frame -> back up -> fore-end
      _mag.copy(gun.userData.mag);
      const out = ease(bump(ru, 0.22, 0.42)) * (1 - ease(bump(ru, 0.48, 0.64)));
      lTarget = _mag.clone().add(new THREE.Vector3(-0.03, -0.06 - out * 0.22, 0.02 + out * 0.05));
      const toMag = ease(bump(ru, 0.1, 0.22)) * (1 - ease(bump(ru, 0.72, 0.86)));
      lTarget.lerp(gun.userData.fore.clone().add(new THREE.Vector3(...(H.lOff || [0, 0, 0]))), 1 - toMag);
    }
    if (iu >= 0) {
      const a = ease(bump(iu, 0, 0.25)) * (1 - ease(bump(iu, 0.78, 1)));
      const flip = ease(bump(iu, 0.4, 0.62));
      if (cls === 'knife') { rz += a * (1.2 - flip * 2.6); ry += a * 0.5; rx += a * 0.3; px -= a * 0.06; py += a * 0.04; }
      else { ry += a * (0.9 - flip * 0.25); rz += a * (0.55 + flip * 0.4); rx += a * 0.12; px -= a * 0.08; py += a * 0.035; pz += a * 0.03; }
    }
    if (VM.slash > 0) {
      VM.slash = Math.max(0, VM.slash - dt * 3.6);
      const u = 1 - VM.slash, sw = Math.sin(u * Math.PI);
      px += -sw * 0.14 + (u < 0.3 ? u * 0.15 : 0); py += sw * 0.03; pz -= sw * 0.08; ry += sw * 0.9; rz += -sw * 1.0; rx += sw * -0.3;
    }
    VM.rig.position.set(0, 0, 0);
    gun.parent.position.set(px, py, pz); gun.parent.rotation.set(rx, ry, rz, 'YXZ');
    gun.parent.updateMatrix(); gun.parent.updateMatrixWorld(true);
    // muzzle flash
    const m = gun.parent.matrix;
    if (VM.flashT > 0 && cls !== 'knife') {
      VM.flash.visible = true; if (VM.flash.parent !== gun) gun.add(VM.flash);
      VM.flash.position.copy(gun.userData.muzzle);
      VM.flMat.opacity = Math.min(1, VM.flashT / 0.05);
      VM.light.intensity = 3.2 * VM.flMat.opacity; _f.copy(gun.userData.muzzle).applyMatrix4(m); VM.light.position.copy(_f);
    } else { VM.flash.visible = false; VM.light.intensity = 0; }
    // arms: wrists from the gun frame, elbows fixed low in view space (follow the gun a bit)
    const toView = (v) => v.applyMatrix4(m);
    const dirV = (v) => v.transformDirection(m);
    const rW = toView(_w.set(...H.rW));
    _e.set(...H.rE).add(new THREE.Vector3(px - H.pos[0], py - H.pos[1], pz - H.pos[2]).multiplyScalar(0.6));
    poseArm(VM.armR, _e, rW, dirV(_dy.set(...H.rY)), dirV(_dz.set(...H.rZ)), H.rC, cls === 'rifle' || cls === 'sniper' ? 1 : 0.4);
    VM.armL.visible = lHandOnGun;
    if (lHandOnGun) {
      const lp = lTarget ? lTarget.clone() : gun.userData.fore.clone().add(new THREE.Vector3(...H.lOff));
      const lW = toView(lp);
      const lE = new THREE.Vector3(...H.lE).add(new THREE.Vector3(px - H.pos[0], py - H.pos[1], pz - H.pos[2]).multiplyScalar(0.7));
      poseArm(VM.armL, lE, lW, dirV(_dy.set(...H.lY)), dirV(_dz.set(...H.lZ)), lTarget && ru > 0.15 && ru < 0.7 ? 0.5 : H.lC);
    }
    // casings physics
    for (let i = VM.casings.length - 1; i >= 0; i--) {
      const c = VM.casings[i]; c.life -= dt; c.v.y -= 9.8 * dt; c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt;
      if (c.m.position.y < 0.01) { c.m.position.y = 0.01; c.v.y *= -0.3; c.v.x *= 0.5; c.v.z *= 0.5; c.spin.multiplyScalar(0.5); }
      if (c.life <= 0) { scene.remove(c.m); VM.casings.splice(i, 1); }
    }
    return true;
  };
  VM.init();
  return VM;
}
