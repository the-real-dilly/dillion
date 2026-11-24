// DILLION: LAST ZONE - characters (Quaternius mannequin, CC0), guns (Quaternius gun pack, CC0), plane, parachutes, loot.
import * as THREE from "three";
import { GLTFLoader } from "../vendor/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "../vendor/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "../vendor/jsm/loaders/MTLLoader.js";
import { clone as skClone } from "../vendor/jsm/utils/SkeletonUtils.js";
import { mergeBufferGeometries } from "../vendor/jsm/utils/BufferGeometryUtils.js";
import { WEAPONS, RARITY, AMMO, ITEMS } from "./data.js";
import { R, TX, colorize } from "./render.js";
import { clamp, lerp, wrapA } from "./util.js";

export const A = { gltf: null, clips: {}, guns: {}, ready: false };

export async function loadAssets(onProgress) {
  const gl = new GLTFLoader();
  const prog = { glb: 0, guns: 0 };
  const report = () => onProgress && onProgress(prog.glb * 0.75 + prog.guns * 0.25);
  const gltf = await gl.loadAsync("assets/characters/mannequin.glb", (e) => { if (e.total) { prog.glb = e.loaded / e.total; report(); } });
  A.gltf = gltf; for (const c of gltf.animations) A.clips[c.name] = c;
  prog.glb = 1; report();
  const ids = Object.keys(WEAPONS); let n = 0;
  await Promise.all(ids.map(async (wid) => {
    const W = WEAPONS[wid];
    const mtl = await new MTLLoader().setPath("assets/guns/").loadAsync(W.model + ".mtl"); mtl.preload();
    const obj = await new OBJLoader().setMaterials(mtl).setPath("assets/guns/").loadAsync(W.model + ".obj");
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      const conv = ms.map((m) => { const nm = (m.name || "").toLowerCase(); const c = m.color ? m.color.clone() : new THREE.Color(0x333333); c.multiplyScalar(nm.includes("wood") ? 2.2 : 1.7); return new THREE.MeshStandardMaterial({ color: c, roughness: nm.includes("wood") ? 0.7 : 0.38, metalness: nm.includes("metal") || nm.includes("black") ? 0.55 : 0.2, name: m.name }); });
      o.material = Array.isArray(o.material) ? conv : conv[0]; o.castShadow = true;
    });
    const box = new THREE.Box3().setFromObject(obj);
    A.guns[wid] = { obj, box, len: box.max.x - box.min.x };
    prog.guns = ++n / ids.length; report();
  }));
  A.ready = true;
}
// gun holder: +Z forward, grip at origin
export function makeGun(wid, scale = 1) {
  const G = A.guns[wid], W = WEAPONS[wid];
  const holder = new THREE.Group(), inner = G.obj.clone();
  inner.rotation.y = Math.PI / 2; // the pack's barrels point down -X
  const s = W.scale * scale; inner.scale.setScalar(s);
  // grip ~22% in from the back for handguns, ~32% for long guns
  const gripX = G.box.max.x - G.len * (W.cls === "Sidearm" || W.cls === "Revolver" ? 0.22 : W.cls === "Assault rifle" && W.model.startsWith("Bullpup") ? 0.45 : 0.32);
  inner.position.set(0, -0.05 * scale, gripX * s);
  holder.add(inner);
  holder.userData.muzzle = (gripX - G.box.min.x) * s; holder.userData.wid = wid;
  return holder;
}

// ---------------------------------------------------------------------------------------------
// character styles (Dilly + rival contractors)
export const STYLES = {
  dilly: { top: 0x9a8866, legs: 0x46494b, boots: 0x3a3026, skin: 0x9a7055, glove: 0x34312c, helmet: 0x7c7a5c, vest: 0x7d6e4f, pack: 0x5f5643, joint: 0x3a3833, headset: true, hat: "helmet", face: "bare", packType: "hydro", patch: 0xff7a45, belt: 0x4a4436, knee: 0x2a2a26 },
  rivals: [
    { top: 0x55603e, legs: 0x4a5236, boots: 0x22201c, skin: 0x8f6a52, glove: 0x2a2a26, helmet: 0x4d5636, vest: 0x5f6a45, pack: 0x3e4430 },
    { top: 0x2c2f33, legs: 0x26282b, boots: 0x161616, skin: 0xa77d61, glove: 0x1b1b1b, helmet: 0x1f2124, vest: 0x34383c, pack: 0x2b2d30 },
    { top: 0x8a7a5a, legs: 0x7a6c50, boots: 0x3a2f24, skin: 0x6f4f3d, glove: 0x3a3226, helmet: 0x9a8a66, vest: 0x8f7e5a, pack: 0x6e6046 },
    { top: 0x4a5560, legs: 0x3b444c, boots: 0x1d1f22, skin: 0xc29a7c, glove: 0x23272b, helmet: 0x3c4650, vest: 0x56626e, pack: 0x404a54 },
    { top: 0x6b4a3a, legs: 0x4f4a42, boots: 0x231d18, skin: 0x9a7058, glove: 0x2c2620, helmet: 0x5a4f40, vest: 0x6a5a44, pack: 0x4c4234 },
    { top: 0x5e6b6b, legs: 0x4f5650, boots: 0x22251f, skin: 0xb0866a, glove: 0x2a2e2a, helmet: 0x56605a, vest: 0x6a756a, pack: 0x4c5450, cap: true }
  ],
  target: { top: 0xd8d4c8, legs: 0xc8c2b4, boots: 0x6a6460, skin: 0xd8d4c8, glove: 0xb8b2a4, helmet: 0xc0503a, vest: 0xc0503a, pack: 0x8a8478, joint: 0x8a8478, hat: "helmet", face: "bare", packType: "none" }
};

const BONES = ["DEF-head", "DEF-spine001", "DEF-spine002", "DEF-spine003", "DEF-hips", "DEF-handR", "DEF-handL", "DEF-upper_armR", "DEF-forearmR", "DEF-upper_armL", "DEF-forearmL", "DEF-f_middle01R", "DEF-f_middle01L", "DEF-thighR", "DEF-thighL", "DEF-shinR", "DEF-shinL", "DEF-neck"];
const UPPER = new Set(["DEF-spine001", "DEF-spine002", "DEF-spine003", "DEF-neck", "DEF-head"]);
const isUpper = (n) => UPPER.has(n) || /shoulder|upper_arm|forearm|hand|thumb|f_index|f_middle|f_ring|f_pinky/.test(n);
const clipCache = {};
function partClip(name, part) {
  const key = name + ":" + part; if (clipCache[key]) return clipCache[key];
  const c = A.clips[name]; if (!c) return null;
  const tracks = c.tracks.filter((t) => { const bone = t.name.split(".").slice(0, -1).join("."); const up = isUpper(bone); return part === "upper" ? up : !up; });
  return (clipCache[key] = new THREE.AnimationClip(name + "_" + part, c.duration, tracks));
}
const LOWER = ["Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop", "Crouch_Idle_Loop", "Crouch_Fwd_Loop", "Jump_Loop", "Swim_Idle_Loop", "Swim_Fwd_Loop", "Death01"];
const UPPERS = ["Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop", "Crouch_Idle_Loop", "Crouch_Fwd_Loop", "Jump_Loop", "Swim_Idle_Loop", "Swim_Fwd_Loop", "Death01", "Pistol_Idle_Loop", "Pistol_Aim_Neutral", "Pistol_Reload", "Pistol_Shoot", "Interact", "Punch_Jab", "Hit_Chest"];
const ONESHOT = new Set(["Death01", "Pistol_Reload", "Pistol_Shoot", "Interact", "Punch_Jab", "Hit_Chest"]);

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _m = new THREE.Matrix4();
function rotBoneWorld(bone, axis, ang) {
  // rotate a bone about a world-space axis, keeping its parent
  bone.parent.getWorldQuaternion(_q2);
  _q.setFromAxisAngle(axis, ang);
  const inv = _q2.clone().invert();
  bone.quaternion.premultiply(inv.multiply(_q).multiply(_q2));
}

// left-hand reach along the gun (metres forward of the grip) per class
export const FORE = { Sidearm: 0, Revolver: 0, SMG: 0.2, "Assault rifle": 0.3, Shotgun: 0.36, Sniper: 0.42 };
const _f = new THREE.Vector3(), _af = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _c = new THREE.Vector3(), _gf = new THREE.Vector3(), _gu = new THREE.Vector3(), _gr = new THREE.Vector3();
const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _dir = new THREE.Vector3(), _pole = new THREE.Vector3();
const _A = new THREE.Vector3(), _E = new THREE.Vector3(), _H = new THREE.Vector3(), _n = new THREE.Vector3(), _pp = new THREE.Vector3(), _tg = new THREE.Vector3(), _cur = new THREE.Vector3(), _want = new THREE.Vector3();
const _B = new THREE.Vector3(), _qd = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _pqi = new THREE.Quaternion();
// rotate `bone` (world-space swing) so the vector bone->childPos points along `dir`
function aimBone(bone, childPos, dir) {
  bone.getWorldPosition(_B); _cur.subVectors(childPos, _B); if (_cur.lengthSq() < 1e-10) return; _cur.normalize();
  _qd.setFromUnitVectors(_cur, dir);
  bone.parent.getWorldQuaternion(_pq); _pqi.copy(_pq).invert();
  bone.quaternion.premultiply(_pqi.multiply(_qd).multiply(_pq));
  bone.updateMatrixWorld(true);
}
// analytic two-bone IK (shoulder-elbow-wrist) with a pole direction, then orient the hand
function solveArm(upper, fore, hand, finger, target, pole, handDir) {
  upper.getWorldPosition(_A); fore.getWorldPosition(_E); hand.getWorldPosition(_H);
  const l1 = _A.distanceTo(_E), l2 = _E.distanceTo(_H);
  _n.subVectors(target, _A); let d = _n.length(); if (d < 1e-4) return; _n.divideScalar(d);
  d = clamp(d, Math.abs(l1 - l2) + 0.01, (l1 + l2) * 0.999);
  const ca = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), sa = Math.sqrt(1 - ca * ca);
  _pp.copy(pole).addScaledVector(_n, -pole.dot(_n)); if (_pp.lengthSq() < 1e-8) _pp.set(0, -1, 0); _pp.normalize();
  _want.copy(_n).multiplyScalar(l1 * ca).addScaledVector(_pp, l1 * sa).add(_A); // elbow
  _tg.copy(_want).sub(_A).normalize(); aimBone(upper, _E, _tg);
  fore.getWorldPosition(_E); hand.getWorldPosition(_H);
  _tg.copy(_n).multiplyScalar(d).add(_A).sub(_E).normalize(); aimBone(fore, _H, _tg);
  if (finger && handDir) { finger.getWorldPosition(_tg); aimBone(hand, _tg, handDir); }
}

// ---------------------------------------------------------------------------------------------
// tactical kit (procedural, CC0-free: no external assets). Shared materials per colour + map.
const KIT = {};
function kitTex(kind) {
  if (KIT["t_" + kind]) return KIT["t_" + kind];
  const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d");
  x.fillStyle = "#c8c8c8"; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 600; i++) { const v = 150 + Math.random() * 90; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(Math.random() * 64, Math.random() * 64, 1, 1); }
  if (kind === "molle") { x.fillStyle = "rgba(40,40,40,0.55)"; for (let y = 6; y < 64; y += 12) x.fillRect(0, y, 64, 4); x.fillStyle = "rgba(255,255,255,0.15)"; for (let y = 6; y < 64; y += 12) x.fillRect(0, y, 64, 1); }
  else { x.strokeStyle = "rgba(60,60,60,0.35)"; for (let i = 0; i < 64; i += 4) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.stroke(); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.repeat.set(2, 2);
  return (KIT["t_" + kind] = t);
}
function kitMat(color, rough, map) {
  const k = color + "/" + rough + "/" + map; if (KIT[k]) return KIT[k];
  return (KIT[k] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: map === "metal" ? 0.5 : 0, map: map === "plain" || map === "metal" ? null : kitTex(map), envMapIntensity: 0.6 }));
}
function buildKit(gear, st) {
  const kc = st.vest, pc = st.pack, dark = 0x1c1c1c;
  // head
  if (st.hat === "cap") { gear(new THREE.SphereGeometry(0.128, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.72, 1.08), st.helmet, "DEF-head", 0, 1.72, -0.005); gear(new THREE.BoxGeometry(0.15, 0.012, 0.09), st.helmet, "DEF-head", 0, 1.715, 0.135, -0.15); }
  else if (st.hat === "boonie") { gear(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.8, 1.05), st.helmet, "DEF-head", 0, 1.715, 0); gear(new THREE.CylinderGeometry(0.21, 0.22, 0.012, 16), st.helmet, "DEF-head", 0, 1.72, 0); }
  else {
    gear(new THREE.SphereGeometry(0.152, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1.02, 0.9, 1.1), st.helmet, "DEF-head", 0, 1.69, -0.005, 0, 0, 0, 0.75, "plain");
    gear(new THREE.TorusGeometry(0.152, 0.008, 6, 24, Math.PI * 2).rotateX(Math.PI / 2).scale(1.02, 1, 1.1), st.helmet, "DEF-head", 0, 1.69, -0.005, 0, 0, 0, 0.8, "plain");
    for (const sx of [-1, 1]) gear(new THREE.BoxGeometry(0.012, 0.03, 0.14), dark, "DEF-head", sx * 0.152, 1.705, 0.0, 0, 0, 0, 0.5, "plain"); // rails
    gear(new THREE.BoxGeometry(0.07, 0.045, 0.02), dark, "DEF-head", 0, 1.735, 0.155, -0.3, 0, 0, 0.4, "plain"); // NVG shroud
    gear(new THREE.BoxGeometry(0.07, 0.04, 0.05), 0x5a5a52, "DEF-head", 0, 1.815, -0.08, 0.5, 0, 0, 0.7); // counterweight pouch
  }
  if (st.headset || st.hat === "helmet") for (const sx of [-1, 1]) gear(new THREE.CylinderGeometry(0.048, 0.05, 0.045, 12).rotateZ(Math.PI / 2), 0x2a2a28, "DEF-head", sx * 0.142, 1.635, 0.0, 0, 0, 0, 0.6, "plain");
  if (st.face === "shades") gear(new THREE.BoxGeometry(0.13, 0.03, 0.02), 0x111111, "DEF-head", 0, 1.665, 0.12, 0, 0, 0, 0.15, "plain");
  if (st.face === "goggles") { gear(new THREE.BoxGeometry(0.15, 0.045, 0.03), 0x2a2a2a, "DEF-head", 0, 1.66, 0.115, 0, 0, 0, 0.3, "plain"); gear(new THREE.BoxGeometry(0.13, 0.03, 0.01), 0x6a5a30, "DEF-head", 0, 1.66, 0.132, 0, 0, 0, 0.1, "metal"); }
  // plate carrier: plates, shoulder straps, cummerbund, pouches
  gear(new THREE.BoxGeometry(0.31, 0.33, 0.05), kc, "DEF-spine003", 0, 1.285, 0.125, 0, 0, 0, 0.9, "molle");
  gear(new THREE.BoxGeometry(0.31, 0.35, 0.05), kc, "DEF-spine003", 0, 1.3, -0.145, 0, 0, 0, 0.9, "molle");
  for (const sx of [-1, 1]) { gear(new THREE.BoxGeometry(0.065, 0.025, 0.29), kc, "DEF-spine003", sx * 0.105, 1.462, -0.01); gear(new THREE.BoxGeometry(0.05, 0.17, 0.25), kc, "DEF-spine003", sx * 0.165, 1.2, -0.01, 0, 0, 0, 0.9, "molle"); }
  for (const px of [-0.085, 0, 0.085]) { gear(new THREE.BoxGeometry(0.072, 0.115, 0.05), pc, "DEF-spine003", px, 1.165, 0.17); gear(new THREE.BoxGeometry(0.074, 0.03, 0.054), pc, "DEF-spine003", px, 1.225, 0.172); }
  gear(new THREE.BoxGeometry(0.19, 0.07, 0.03), pc, "DEF-spine003", 0, 1.355, 0.163);
  gear(new THREE.BoxGeometry(0.05, 0.12, 0.06), dark, "DEF-spine003", 0.19, 1.24, -0.06, 0, 0, 0, 0.6, "plain"); // radio
  gear(new THREE.CylinderGeometry(0.005, 0.005, 0.32, 5), dark, "DEF-spine003", 0.2, 1.45, -0.08, 0.15, 0, -0.1, 0.5, "plain"); // antenna
  if (st.patch) gear(new THREE.BoxGeometry(0.012, 0.05, 0.065), st.patch, "DEF-upper_armL", 0.215, 1.405, 0.0, 0, 0, 0, 0.7, "plain");
  // belt, holster, knee pads, boot cuffs
  gear(new THREE.CylinderGeometry(0.158, 0.158, 0.055, 18, 1, true).scale(1, 1, 0.82), st.belt || 0x2b2b28, "DEF-hips", 0, 0.975, -0.02, 0, 0, 0, 0.9, "molle");
  for (const sx of [-1, 1]) gear(new THREE.BoxGeometry(0.06, 0.09, 0.08), pc, "DEF-hips", sx * 0.15, 0.95, -0.07);
  gear(new THREE.BoxGeometry(0.06, 0.16, 0.09), dark, "DEF-thighR", -0.155, 0.8, 0.02, 0, 0, 0, 0.6, "plain");
  for (const sx of [-1, 1]) {
    const leg = sx < 0 ? "R" : "L";
    gear(new THREE.SphereGeometry(0.058, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1.15, 0.6), st.knee || dark, "DEF-shin" + leg, sx * 0.089, 0.535, 0.055, 0, 0, 0, 0.6, "plain");
    gear(new THREE.CylinderGeometry(0.058, 0.062, 0.09, 12), st.boots, "DEF-shin" + leg, sx * 0.089, 0.165, -0.01, 0, 0, 0, 0.7, "plain");
  }
  // pack variants
  if (st.packType === "assault") { gear(new THREE.BoxGeometry(0.28, 0.36, 0.14), pc, "DEF-spine003", 0, 1.25, -0.235); gear(new THREE.BoxGeometry(0.22, 0.12, 0.05), pc, "DEF-spine003", 0, 1.16, -0.32); }
  else if (st.packType === "hydro") gear(new THREE.BoxGeometry(0.2, 0.3, 0.06), pc, "DEF-spine003", 0, 1.28, -0.2);
}
const RIVAL_CAMO = [
  { name: "woodland", top: 0x4b5236, cA: 0x2f3322, cB: 0x6b6040, cC: 0x1d1d18, camo: 1 },
  { name: "desert", top: 0xb09a72, cA: 0x8a7452, cB: 0xcdbb94, cC: 0x6f5c40, camo: 1 },
  { name: "urban", top: 0x6f7378, cA: 0x4a4d52, cB: 0x9a9ea2, cC: 0x2e3034, camo: 2 },
  { name: "multi", top: 0x8a8064, cA: 0x5f6a44, cB: 0xb3a37e, cC: 0x4a3b2c, camo: 1 },
  { name: "black", top: 0x26282b, camo: 0 }, { name: "ranger", top: 0x4a5038, camo: 0 }, { name: "digital-wood", top: 0x55603e, cA: 0x3a4028, cB: 0x7a7350, cC: 0x23251a, camo: 2 }
];
const KIT_COL = [0x8a7656, 0x4c5238, 0x232325, 0x5a5e60, 0xa89272, 0x6b5e44];
const SKINS = [0x8d5a3b, 0xc69076, 0xe0b89a, 0x6b4430, 0xa8735a, 0x4a2f22, 0xd2a07c, 0xb98563];
// a varied rival contractor from a seed
export function rivalStyle(seed) {
  let a = (seed * 2654435761) >>> 0; const r = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (L) => L[Math.floor(r() * L.length)];
  const cam = pick(RIVAL_CAMO), pants = r() < 0.6 ? cam : pick(RIVAL_CAMO), kit = pick(KIT_COL), skin = pick(SKINS);
  const face = r() < 0.3 ? "balaclava" : r() < 0.55 ? "shades" : r() < 0.75 ? "goggles" : "bare";
  const hat = r() < 0.72 ? "helmet" : r() < 0.6 ? "cap" : "boonie";
  return { top: cam.top, camo: cam.camo, camoA: cam.cA, camoB: cam.cB, camoC: cam.cC, legs: pants.top, boots: r() < 0.5 ? 0x2a2620 : 0x6b5a44, skin: face === "balaclava" ? 0x1e1f1d : skin, glove: r() < 0.6 ? 0x1f1f1f : kit,
    helmet: hat === "helmet" ? (r() < 0.5 ? kit : cam.top) : cam.top, vest: kit, pack: r() < 0.5 ? kit : cam.cA || kit, joint: 0x2a2a28, hat, face, packType: pick(["assault", "hydro", "none"]), belt: kit, seed: r() * 10, knee: r() < 0.5 ? 0x222222 : kit };
}

export class Avatar {
  constructor(style, opts = {}) {
    const st = this.style = style;
    const root = this.root = new THREE.Group(); root.rotation.order = "YXZ";
    const model = this.model = skClone(A.gltf.scene);
    model.rotation.y = Math.PI; root.add(model);
    const uni = { cTop: { value: new THREE.Color(st.top) }, cLegs: { value: new THREE.Color(st.legs) }, cBoots: { value: new THREE.Color(st.boots) }, cSkin: { value: new THREE.Color(st.skin) }, cGlove: { value: new THREE.Color(st.glove) }, uFlash: { value: 0 }, uHide: { value: 0 }, uCamo: { value: st.camo || 0 }, cA: { value: new THREE.Color(st.camoA || st.top) }, cB: { value: new THREE.Color(st.camoB || st.top) }, cC: { value: new THREE.Color(st.camoC || st.top) }, uSeed: { value: st.seed || 0 } };
    this.uni = uni;
    model.traverse((o) => {
      if (o.isSkinnedMesh || o.isMesh) {
        o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
        const isJoint = o.material && o.material.name === "M_Joints";
        const m = new THREE.MeshStandardMaterial({ color: isJoint ? (st.joint || 0x2e2d2a) : 0xffffff, roughness: 0.85, metalness: 0, envMapIntensity: 0.55 });
        if (!isJoint) m.onBeforeCompile = (sh) => {
          Object.assign(sh.uniforms, uni);
          sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vBP;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvBP = position;");
          sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
varying vec3 vBP; uniform vec3 cTop, cLegs, cBoots, cSkin, cGlove, cA, cB, cC; uniform float uFlash, uHide, uCamo, uSeed;
              float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
              float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
                return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y), mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
              vec3 camo(vec3 base, vec3 p){
                if (uCamo < 0.5) return base;
                p += uSeed;
                if (uCamo > 1.5) p = floor(p * 34.0) / 34.0; // digital
                float a = n3(p * 6.0) * 0.65 + n3(p * 13.0) * 0.35, b = n3(p * 9.0 + 11.0) * 0.6 + n3(p * 19.0 + 3.0) * 0.4, c = n3(p * 15.0 + 27.0);
                vec3 col = base; col = mix(col, cA, smoothstep(0.52, 0.56, a)); col = mix(col, cB, smoothstep(0.6, 0.64, b)); col = mix(col, cC, smoothstep(0.7, 0.73, c)); return col;
              }`)
            .replace("#include <color_fragment>", `#include <color_fragment>
              float ax = abs(vBP.x); vec3 zc = cTop;
              if (uHide > 0.5 && vBP.y > 1.47 && ax < 0.2) discard;
              zc = camo(cTop, vBP);
              if (vBP.y < 0.99) zc = camo(cLegs, vBP + vec3(3.1));
              if (vBP.y > 0.93 && vBP.y < 1.0 && ax < 0.24) zc = cBoots * 1.4;
              if (vBP.y < 0.15) zc = cBoots;
              if (vBP.y > 1.5 && ax < 0.16) zc = cSkin;
              if (ax > 0.7) zc = cGlove;
              float fab = 0.9 + 0.1 * sin(vBP.y * 260.0) * sin(vBP.x * 240.0 + vBP.z * 240.0) - 0.06 * smoothstep(0.2, 0.0, abs(fract(vBP.y * 9.0) - 0.5)) * step(vBP.y, 1.45) * step(0.15, vBP.y);
              diffuseColor.rgb = zc * fab + vec3(1.0, 0.2, 0.1) * uFlash;`);
        };
        o.material = m;
      }
    });
    this.bones = {}; model.traverse((o) => { if (o.isBone && BONES.includes(o.name)) this.bones[o.name] = o; });
    // gear in bind pose
    model.updateMatrixWorld(true);
    const gear = (geo, color, bone, x, y, z, rx = 0, ry = 0, rz = 0, rough = 0.85, map = "cordura") => {
      const mesh = new THREE.Mesh(geo, kitMat(color, rough, map));
      mesh.castShadow = true;
      const b = this.bones[bone]; b.updateMatrixWorld(true);
      const world = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
      // model-space -> bone local (model itself has rotation PI at the root, so use model-relative matrices)
      const boneM = new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(b.matrixWorld);
      const local = boneM.invert().multiply(world);
      local.decompose(mesh.position, mesh.quaternion, mesh.scale);
      b.add(mesh); if (bone === "DEF-head") this.headGear.push(mesh); return mesh;
    };
    this.headGear = [];
    buildKit(gear, st);
    // animation
    const mixer = this.mixer = new THREE.AnimationMixer(model);
    this.act = { lower: {}, upper: {} };
    for (const n of LOWER) { const c = partClip(n, "lower"); if (c) { const a = mixer.clipAction(c); a.weight = 0; this.act.lower[n] = a; } }
    for (const n of UPPERS) { const c = partClip(n, "upper"); if (c) { const a = mixer.clipAction(c); a.weight = 0; this.act.upper[n] = a; } }
    for (const L of [this.act.lower, this.act.upper]) for (const n in L) if (ONESHOT.has(n)) { L[n].setLoop(THREE.LoopOnce); L[n].clampWhenFinished = true; }
    this.w = { lower: {}, upper: {} }; this.cur = { lower: null, upper: null };
    this.setLayer("lower", "Idle_Loop", 0); this.setLayer("upper", "Idle_Loop", 0);
    // gun + chute
    const scn = this.scn = opts.scene || R.scene;
    this.gun = null; this.gunId = null; this.gunHolder = new THREE.Group(); scn.add(this.gunHolder);
    this.chute = makeChute(); this.chute.visible = false; root.add(this.chute);
    this.legYaw = 0; this.tilt = 0; this.dead = false; this.flash = 0;
    scn.add(root);
  }
  setLayer(layer, name, fade = 0.2, restart = false) {
    if (this.cur[layer] === name && !restart) return;
    const L = this.act[layer], a = L[name]; if (!a) return;
    this.cur[layer] = name; this.fade = this.fade || {}; this.fade[layer] = fade;
    if (restart || !a.isRunning()) { a.reset(); a.play(); }
    if (fade <= 0) for (const n in L) { L[n].weight = n === name ? 1 : 0; if (n !== name) L[n].stop(); }
  }
  blend(dt) {
    for (const layer of ["lower", "upper"]) {
      const L = this.act[layer], cur = this.cur[layer], f = this.fade[layer] || 0.2, k = f <= 0 ? 1 : Math.min(1, dt / f);
      for (const n in L) {
        const a = L[n]; const target = n === cur ? 1 : 0;
        if (a.weight === target && (target === 0 ? !a.isRunning() : true)) continue;
        a.weight += (target - a.weight) * k; a.setEffectiveWeight(a.weight);
        if (target === 0 && a.weight < 0.02) { a.weight = 0; a.stop(); }
      }
    }
  }
  setGun(wid) {
    if (wid === this.gunId) return;
    if (this.gun) this.gunHolder.remove(this.gun);
    this.gunId = wid; this.gun = wid ? makeGun(wid) : null;
    if (this.gun) this.gunHolder.add(this.gun);
  }
  // p: sim player; view: { dt, t, aimYaw, aimPitch, local:boolean }
  update(p, dt, t, near = true) {
    const root = this.root;
    root.visible = p.st !== "plane";
    this.gunHolder.visible = root.visible && !!this.gun && p.st === "ground";
    if (!root.visible) return;
    const yaw = p.yaw, ground = p.st === "ground";
    root.position.set(p.x, p.y, p.z);
    // facing: body faces the aim yaw
    root.rotation.set(0, yaw, 0);
    this.chute.visible = p.st === "chute";
    let lower = "Idle_Loop", upper = null, timeScale = 1;
    const sp = p.moveSpd || Math.hypot(p.vx, p.vz);
    const w = p.inv && p.inv.slot < 2 ? p.inv.w[p.inv.slot] : null;
    this.setGun(w ? w.id : null);
    if (p.st === "dead") {
      if (!this.dead) { this.dead = true; this.setLayer("lower", "Death01", 0.15, true); this.setLayer("upper", "Death01", 0.15, true); }
    } else {
      if (this.dead) { this.dead = false; }
      if (p.st === "fall") { lower = sp > 20 ? "Swim_Fwd_Loop" : "Swim_Idle_Loop"; upper = lower; }
      else if (p.st === "chute") { lower = "Jump_Loop"; upper = "Idle_Loop"; }
      else if (p.swim) { lower = sp > 0.5 ? "Swim_Fwd_Loop" : "Swim_Idle_Loop"; upper = lower; }
      else if (!p.onGround) lower = "Jump_Loop";
      else if (p.crouch) lower = sp > 0.6 ? "Crouch_Fwd_Loop" : "Crouch_Idle_Loop";
      else if (sp > 6) lower = "Sprint_Loop";
      else if (sp > 3.2) lower = "Jog_Fwd_Loop";
      else if (sp > 0.4) lower = "Walk_Loop";
      // upper body
      if (!upper) {
        const act = p.act ? p.act.k : null;
        if (act === "reload") upper = "Pistol_Reload";
        else if (act === "plate" || act === "bandage" || act === "medkit") upper = "Interact";
        else if (t - (p.meleeT || -9) < 0.5) upper = "Punch_Jab";
        else if (w && p.sprint) upper = lower;
        else if (w && (p.adsT > 0.2 || t - p.lastShotT < 1.5)) upper = "Pistol_Aim_Neutral";
        else if (w) upper = "Pistol_Idle_Loop";
        else upper = lower;
      }
      this.setLayer("lower", lower, 0.18); this.setLayer("upper", upper, upper === "Pistol_Reload" || upper === "Interact" ? 0.12 : 0.15, false);
      // backwards walking plays the walk in reverse
      const back = p.inp && p.inp.mz < -0.2 && ground;
      for (const n of ["Walk_Loop", "Jog_Fwd_Loop", "Crouch_Fwd_Loop"]) { const a = this.act.lower[n]; if (a) a.timeScale = back ? -1 : 1; const u = this.act.upper[n]; if (u) u.timeScale = back ? -1 : 1; }
      const rl = this.act.upper.Pistol_Reload; if (rl && p.act && p.act.k === "reload") rl.timeScale = 1.66 / Math.max(0.5, p.act.dur);
    }
    // freefall body tilt
    const tiltT = p.st === "fall" ? -1.25 : 0; this.tilt += (tiltT - this.tilt) * Math.min(1, dt * 3); this.model.rotation.x = 0;
    root.rotation.x = this.tilt;
    if (near) { this.blend(dt); this.mixer.update(dt); } else { this.blend(dt * 4); this.mixer.update(dt); }
    if (p.st === "dead") { this.gunHolder.visible = false; return; }
    // leg yaw toward the movement direction (strafing), upper body counter-rotates to keep aiming
    let legT = 0;
    if (ground && sp > 0.5 && !p.swim) {
      const mv = Math.atan2(-p.vx, -p.vz); let d = wrapA(mv - yaw);
      if (Math.abs(d) > Math.PI / 2) d = wrapA(d - Math.PI);
      legT = clamp(d, -1.1, 1.1);
    }
    this.legYaw += (legT - this.legYaw) * Math.min(1, dt * 8);
    const B = this.bones;
    if (near && B["DEF-hips"] && B["DEF-spine001"]) {
      if (Math.abs(this.legYaw) > 0.01) { rotBoneWorld(B["DEF-hips"], _up, this.legYaw); rotBoneWorld(B["DEF-spine001"], _up, -this.legYaw); }
      // aim pitch bends the upper spine
      if (ground && w) {
        const rx = Math.cos(yaw), rz = -Math.sin(yaw); _v.set(rx, 0, rz);
        const pitch = clamp(p.pitch + (p.recP || 0), -1.1, 1.1);
        rotBoneWorld(B["DEF-spine002"], _v, pitch * 0.45); rotBoneWorld(B["DEF-spine003"], _v, pitch * 0.4);
        // two-handed long guns: square the shoulders a little to the aim
        if (WEAPONS[w.id].cls !== "Sidearm" && WEAPONS[w.id].cls !== "Revolver" && upper !== "Pistol_Reload") rotBoneWorld(B["DEF-spine003"], _up, -0.18);
      }
    }
    // weapon hold: the gun is posed from the chest by stance, then both arms reach it with two-bone IK
    if (this.gun && ground) this.holdGun(p, w, upper, yaw, t, dt, near);
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 4); this.uni.uFlash.value = this.flash * 0.6; }
  }
  holdGun(p, w, upper, yaw, t, dt, near) {
    const W = WEAPONS[w.id], B = this.bones, cls = W.cls, hand = cls === "Sidearm" || cls === "Revolver";
    const ads = p.adsT || 0, act = p.act ? p.act.k : null, recent = t - p.lastShotT < 1.6;
    // stance -> pose (offsets in the aim frame: right, up, forward; pitch/yaw offsets)
    let T;
    if (p.sprint && !act) T = hand ? [0.2, -0.22, 0.12, -1.25, 0.1, 0] : [0.04, 0.0, 0.26, -0.55, 0.95, 1];
    else if (act === "plate" || act === "bandage" || act === "medkit") T = hand ? [0.2, -0.22, 0.12, -1.25, 0.1, 0] : [0.1, -0.08, 0.2, -0.9, 0.7, 0];
    else if (act === "reload") T = hand ? [0.08, 0.02, 0.32, -0.45, 0.25, 1] : [0.1, -0.02, 0.3, -0.55, 0.45, 1];
    else if (ads > 0.5) T = hand ? [0.03, 0.22, 0.5, 0, 0, 1] : [0.06, 0.2, 0.26, 0, 0, 1];
    else if (upper === "Pistol_Aim_Neutral" || recent) T = hand ? [0.07, 0.14, 0.45, 0, 0, 1] : [0.15, 0.1, 0.3, 0, 0, 1];
    else T = hand ? [0.1, -0.08, 0.36, -0.75, 0.15, 1] : [0.12, -0.03, 0.3, -0.55, 0.4, 1];
    const G = this.gp || (this.gp = T.slice()); const k = Math.min(1, dt * 12);
    for (let i = 0; i < 6; i++) G[i] += (T[i] - G[i]) * k;
    const aimP = clamp(p.pitch + (p.recP || 0), -1.2, 1.2), aimY = yaw + (p.recY || 0);
    const py = aimP + G[3], yy = aimY + G[4], cp = Math.cos(py);
    _f.set(-Math.sin(yy) * cp, Math.sin(py), -Math.cos(yy) * cp);
    // frame from the aim direction (not the offset pose) so the gun swings about the shoulder
    const cpa = Math.cos(aimP); _af.set(-Math.sin(aimY) * cpa, Math.sin(aimP), -Math.cos(aimY) * cpa);
    _r.set(Math.cos(aimY), 0, -Math.sin(aimY)); _u.crossVectors(_r, _af).normalize();
    B["DEF-spine003"].getWorldPosition(_c);
    this.gunHolder.position.copy(_c).addScaledVector(_r, G[0]).addScaledVector(_u, G[1]).addScaledVector(_af, G[2]);
    _v2.copy(this.gunHolder.position).add(_f); this.gunHolder.lookAt(_v2);
    this.gunHolder.updateMatrixWorld(true);
    if (!near || upper === "Punch_Jab" || !B["DEF-upper_armR"]) return;
    // IK targets in gun space: right wrist behind/below the grip, left on the fore-end (or support grip for handguns)
    const gm = this.gunHolder.matrixWorld;
    _gf.set(0, 0, 1).transformDirection(gm); _gu.set(0, 1, 0).transformDirection(gm); _gr.set(-1, 0, 0).transformDirection(gm);
    const fore = FORE[cls] != null ? FORE[cls] : 0.3;
    _t1.set(0, -0.06, -0.07).applyMatrix4(gm);
    _dir.copy(_gf).multiplyScalar(0.55).addScaledVector(_gu, -0.8).normalize();
    _pole.copy(_u).multiplyScalar(-1).addScaledVector(_r, 0.7).addScaledVector(_af, -0.3);
    solveArm(B["DEF-upper_armR"], B["DEF-forearmR"], B["DEF-handR"], B["DEF-f_middle01R"], _t1, _pole, _dir);
    if (G[5] > 0.5 && act !== "plate" && act !== "bandage" && act !== "medkit") {
      if (act === "reload") { const ph = Math.sin(p.act.t / p.act.dur * Math.PI); _t2.set(0.0, -0.12 - ph * 0.12, hand ? -0.02 : 0.06).applyMatrix4(gm); }
      else if (hand) _t2.set(0.035, -0.08, -0.05).applyMatrix4(gm);
      else _t2.set(0.0, -0.06, fore).applyMatrix4(gm);
      _dir.copy(_gf).multiplyScalar(hand ? 0.4 : 0.6).addScaledVector(_gr, hand ? 0.5 : 0.55).addScaledVector(_gu, hand ? -0.6 : -0.2).normalize();
      _pole.copy(_u).multiplyScalar(-1).addScaledVector(_r, -0.6).addScaledVector(_af, -0.2);
      solveArm(B["DEF-upper_armL"], B["DEF-forearmL"], B["DEF-handL"], B["DEF-f_middle01L"], _t2, _pole, _dir);
    }
  }
  hideHead(on) { if (this._hh === on) return; this._hh = on; this.uni.uHide.value = on ? 1 : 0; for (const m of this.headGear) m.visible = !on; }
  muzzleWorld(out) {
    if (!this.gun) return this.root.getWorldPosition(out).setY(this.root.position.y + 1.4);
    out.set(0, 0, this.gun.userData.muzzle).applyMatrix4(this.gunHolder.matrixWorld); return out;
  }
  dispose() { this.scn.remove(this.root); this.scn.remove(this.gunHolder); this.mixer.stopAllAction(); }
}

// ---------------------------------------------------------------------------------------------
// first-person arms: sleeves + gloved hands that reach the viewmodel's grip and fore-end
export function makeVMArms(style) {
  const sleeve = new THREE.MeshStandardMaterial({ color: style.top, roughness: 0.9 }), glove = new THREE.MeshStandardMaterial({ color: style.glove, roughness: 0.7 }), cuff = new THREE.MeshStandardMaterial({ color: style.vest, roughness: 0.85 });
  const arm = () => {
    const g = new THREE.Group();
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1, 10).translate(0, 0.5, 0), sleeve);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.04, 10).translate(0, 0.02, 0), cuff);
    const hand = new THREE.Group();
    hand.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.085, 0.04).translate(0, 0.045, 0), glove));
    const fing = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.05, 0.034).translate(0, 0.02, 0), glove); fing.position.set(0, 0.085, 0.012); fing.rotation.x = 0.9; hand.add(fing);
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.05, 0.022).translate(0, 0.025, 0), glove); thumb.position.set(0.035, 0.03, 0.01); thumb.rotation.z = -0.6; hand.add(thumb);
    g.add(fore, c, hand); g.userData = { fore, cuff: c, hand }; return g;
  };
  const grp = new THREE.Group(); grp.userData.r = arm(); grp.userData.l = arm(); grp.add(grp.userData.r, grp.userData.l);
  grp.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return grp;
}
const _y = new THREE.Vector3(0, 1, 0), _qa = new THREE.Quaternion();
// place one arm: elbow -> wrist sleeve, hand oriented along handDir
export function poseVMArm(arm, elbow, wrist, handDir, side) {
  const { fore, cuff, hand } = arm.userData;
  _cur.subVectors(wrist, elbow); const L = _cur.length(); _cur.normalize();
  _qa.setFromUnitVectors(_y, _cur);
  fore.position.copy(elbow); fore.quaternion.copy(_qa); fore.scale.set(1, L, 1);
  cuff.position.copy(wrist).addScaledVector(_cur, -0.045); cuff.quaternion.copy(_qa);
  hand.position.copy(wrist); hand.quaternion.setFromUnitVectors(_y, handDir); hand.scale.x = side;
}

// ---------------------------------------------------------------------------------------------
let chuteGeo = null, chuteMat = null;
function makeChute() {
  if (!chuteGeo) {
    const g = new THREE.SphereGeometry(1, 18, 6, 0, Math.PI * 2, 0, 0.95).toNonIndexed();
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), a = new THREE.Color(0xff7a45), b = new THREE.Color(0x4f5a3a);
    for (let i = 0; i < pos.count; i += 3) { const ang = Math.atan2(pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2), pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)); const k = Math.floor((ang + Math.PI) / (Math.PI * 2) * 18) % 2; const c = k ? a : b; for (let j = 0; j < 3; j++) { col[(i + j) * 3] = c.r; col[(i + j) * 3 + 1] = c.g; col[(i + j) * 3 + 2] = c.b; } }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.scale(3.8, 1.5, 2.4); chuteGeo = g;
    chuteMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 });
  }
  const grp = new THREE.Group();
  const can = new THREE.Mesh(chuteGeo, chuteMat); can.position.y = 5.2; can.castShadow = true; grp.add(can);
  const pts = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; pts.push(Math.cos(a) * 3.6, 5.2 + Math.sin(0.95) * 0.3, Math.sin(a) * 2.3, Math.cos(a) * 0.15, 1.5, Math.sin(a) * 0.1); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  grp.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x2a2a26 })));
  return grp;
}

// ---------------------------------------------------------------------------------------------
// transport plane (procedural)
export function makePlaneMesh() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x5f6656, roughness: 0.6, metalness: 0.35 }), dark = new THREE.MeshStandardMaterial({ color: 0x2b2d2a, roughness: 0.5, metalness: 0.4 });
  const stripe = new THREE.MeshStandardMaterial({ color: 0xff7a45, roughness: 0.6 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 26, 18).rotateX(Math.PI / 2), hull); g.add(fus);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(2.4, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 0.95, 1.6), hull); nose.position.z = 13; g.add(nose);
  const cock = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 1.2), dark); cock.position.set(0, 1.4, 15.2); cock.rotation.x = 0.5; g.add(cock);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 0.9, 10, 18, 1, false).rotateX(-Math.PI / 2), hull); tail.position.set(0, 0.9, -18); tail.rotation.x = -0.12; g.add(tail);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 6), dark); ramp.position.set(0, -2.6, -16.5); ramp.rotation.x = 0.4; g.add(ramp);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(42, 0.5, 4.2), hull); wing.position.set(0, 2.2, 2); g.add(wing);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 8, 4.5), hull); fin.position.set(0, 5.6, -21.5); fin.rotation.x = -0.25; g.add(fin);
  const hstab = new THREE.Mesh(new THREE.BoxGeometry(15, 0.3, 3), hull); hstab.position.set(0, 2.2, -22); g.add(hstab);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(2.43, 2.43, 1.2, 18).rotateX(Math.PI / 2), stripe); band.position.z = 4; g.add(band);
  g.props = [];
  for (const x of [-14, -7, 7, 14]) {
    const nac = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.6, 5, 10).rotateX(Math.PI / 2), hull); nac.position.set(x, 1.6, 3.5); g.add(nac);
    const prop = new THREE.Group(); for (let k = 0; k < 4; k++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, 0.08), dark); bl.position.y = 1.1; const pv = new THREE.Group(); pv.rotation.z = k * Math.PI / 2; pv.add(bl); prop.add(pv); }
    prop.position.set(x, 1.6, 6.1); g.add(prop); g.props.push(prop);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}

// ---------------------------------------------------------------------------------------------
// loot meshes
const smallGeo = {}, smallMat = {};
function small(kind) {
  if (smallGeo[kind]) return [smallGeo[kind], smallMat[kind]];
  let g, m;
  if (kind === "plate") { g = new THREE.BoxGeometry(0.32, 0.04, 0.42).translate(0, 0.03, 0); m = new THREE.MeshStandardMaterial({ color: 0x4f6a7a, roughness: 0.5, metalness: 0.3 }); }
  else if (kind === "bandage") { g = new THREE.CylinderGeometry(0.07, 0.07, 0.12, 10).rotateZ(Math.PI / 2).translate(0, 0.07, 0); m = new THREE.MeshStandardMaterial({ color: 0xe8e4da }); }
  else if (kind === "medkit") { g = new THREE.BoxGeometry(0.36, 0.18, 0.26).translate(0, 0.09, 0); m = new THREE.MeshStandardMaterial({ map: TX.medkit || (TX.medkit = medTex()), roughness: 0.6 }); }
  else if (kind === "frag") { g = new THREE.SphereGeometry(0.07, 10, 8).scale(1, 1.3, 1).translate(0, 0.09, 0); m = new THREE.MeshStandardMaterial({ color: 0x4f5a32, roughness: 0.5 }); }
  else if (kind === "smoke") { g = new THREE.CylinderGeometry(0.05, 0.05, 0.2, 10).translate(0, 0.1, 0); m = new THREE.MeshStandardMaterial({ color: 0x9aa4a8, roughness: 0.5 }); }
  else if (kind === "pickle") { g = new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.07, 0.22, 4, 10).rotateZ(1.3).translate(0, 0.1, 0) : new THREE.SphereGeometry(0.1, 10, 8); m = new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 1, roughness: 0.25, emissive: 0x6a4a00 }); }
  else { g = new THREE.BoxGeometry(0.26, 0.16, 0.16).translate(0, 0.08, 0); m = {}; }
  smallGeo[kind] = g; smallMat[kind] = m; return [g, m];
}
function medTex() { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"); x.fillStyle = "#c33a2e"; x.fillRect(0, 0, 64, 64); x.fillStyle = "#f2efe6"; x.fillRect(26, 12, 12, 40); x.fillRect(12, 26, 40, 12); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; }
const ammoMats = {};
let ringGeo = null; const ringMats = {};
export function makeItemMesh(it) {
  const g = new THREE.Group();
  if (it.k === "weapon") { const gun = makeGun(it.w, 1.0); gun.rotation.set(0, 0, Math.PI / 2); gun.position.y = 0.06; const holder = new THREE.Group(); holder.add(gun); holder.rotation.y = (it.id * 1.7) % 6.28; g.add(holder); }
  else if (it.k === "ammo") { const [geo] = small("ammo"); const m = ammoMats[it.a] || (ammoMats[it.a] = new THREE.MeshStandardMaterial({ color: new THREE.Color(AMMO[it.a].col).multiplyScalar(0.7), roughness: 0.6 })); const a = new THREE.Mesh(geo, m); const b = new THREE.Mesh(geo, m); b.position.set(0.05, 0.16, 0.02); b.rotation.y = 0.4; g.add(a, b); }
  else { const [geo, m] = small(it.k); const mesh = new THREE.Mesh(geo, m); g.add(mesh); }
  // rarity / type glow ring
  const col = it.k === "weapon" ? RARITY[it.r || 0].col : it.k === "ammo" ? AMMO[it.a].col : ITEMS[it.k] ? ITEMS[it.k].col : "#ffffff";
  if (!ringGeo) ringGeo = new THREE.RingGeometry(0.35, 0.5, 24).rotateX(-Math.PI / 2);
  const rm = ringMats[col] || (ringMats[col] = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.6), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  const ring = new THREE.Mesh(ringGeo, rm); ring.position.y = 0.03; g.add(ring);
  if (it.k === "weapon" && (it.r || 0) >= 3) { const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 3, 8, 1, true).translate(0, 1.5, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.4), transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })); g.add(beam); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  g.position.set(it.x, it.y + 0.1, it.z);
  return g;
}
let crateGeo = null, crateMat = null, lidGeo = null;
export function makeCrateMesh(c) {
  if (!crateGeo) { crateGeo = new THREE.BoxGeometry(1.1, 0.6, 0.7).translate(0, 0.3, 0); lidGeo = new THREE.BoxGeometry(1.14, 0.1, 0.74).translate(0, 0.05, 0.37); crateMat = new THREE.MeshStandardMaterial({ map: TX.crate, roughness: 0.7, metalness: 0.2 }); }
  const g = new THREE.Group(); const b = new THREE.Mesh(crateGeo, crateMat); b.castShadow = b.receiveShadow = true; g.add(b);
  const lid = new THREE.Mesh(lidGeo, crateMat); lid.position.set(0, 0.6, -0.37); lid.castShadow = true; g.add(lid); g.userData.lid = lid;
  g.position.set(c.x, c.y, c.z); g.rotation.y = (c.id * 2.3) % 6.28;
  return g;
}
export function makeGrenadeMesh(k) { const [geo, m] = small(k); const mesh = new THREE.Mesh(geo, m); return mesh; }
