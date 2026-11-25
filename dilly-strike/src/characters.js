/* ==========================================================================
   DILLY STRIKE — skinned operators (players / bots / trailer actors)
   The CC0 Quaternius 'Universal Animation Library' mannequin
   (assets/characters/mannequin.glb, credited in assets/CREDITS.md) with
   procedural tactical kit per team (helmet, plate carrier, pouches, radio,
   knee pads, gloves, boots), team camo in the shader, upper/lower animation
   layers (idle / walk / jog / crouch / aim / death) and a two-bone IK rifle
   hold. Kit, layer split and IK are adapted from last-zone/actors.js (same
   project). Hitboxes are invisible boxes riding the bones (head / body).
   ========================================================================== */
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from '../../vendor/jsm/utils/SkeletonUtils.js';
import { loadGuns, buildGun } from './viewmodel.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const A = { gltf: null, clips: {}, ready: false, loading: null };
export function loadCharacters() {
  if (A.loading) return A.loading;
  A.loading = Promise.all([
    new GLTFLoader().loadAsync(new URL('../../assets/characters/mannequin.glb', import.meta.url).href).then((g) => { A.gltf = g; for (const c of g.animations) A.clips[c.name] = c; }),
    loadGuns()
  ]).then(() => { A.ready = true; });
  return A.loading;
}
export const charsReady = () => A.ready;

const BONES = ['DEF-head', 'DEF-spine001', 'DEF-spine002', 'DEF-spine003', 'DEF-hips', 'DEF-handR', 'DEF-handL', 'DEF-upper_armR', 'DEF-forearmR', 'DEF-upper_armL', 'DEF-forearmL', 'DEF-f_middle01R', 'DEF-f_middle01L', 'DEF-thighR', 'DEF-thighL', 'DEF-shinR', 'DEF-shinL', 'DEF-neck'];
const UPPER = new Set(['DEF-spine001', 'DEF-spine002', 'DEF-spine003', 'DEF-neck', 'DEF-head']);
const isUpper = (n) => UPPER.has(n) || /shoulder|upper_arm|forearm|hand|thumb|f_index|f_middle|f_ring|f_pinky/.test(n);
const clipCache = {};
function partClip(name, part) {
  const key = name + ':' + part; if (clipCache[key]) return clipCache[key];
  const c = A.clips[name]; if (!c) return null;
  const tracks = c.tracks.filter((t) => { const bone = t.name.split('.').slice(0, -1).join('.'); const up = isUpper(bone); return part === 'upper' ? up : !up; });
  return (clipCache[key] = new THREE.AnimationClip(name + '_' + part, c.duration, tracks));
}
const LOWER = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'Jump_Loop', 'Swim_Idle_Loop', 'Swim_Fwd_Loop', 'Death01'];
const UPPERS = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'Jump_Loop', 'Swim_Idle_Loop', 'Swim_Fwd_Loop', 'Death01', 'Pistol_Idle_Loop', 'Pistol_Aim_Neutral', 'Pistol_Reload', 'Pistol_Shoot', 'Interact', 'Punch_Jab', 'Hit_Chest'];
const ONESHOT = new Set(['Death01', 'Pistol_Reload', 'Pistol_Shoot', 'Interact', 'Punch_Jab', 'Hit_Chest']);

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _m = new THREE.Matrix4();
function rotBoneWorld(bone, axis, ang) {
  // rotate a bone about a world-space axis, keeping its parent
  bone.parent.getWorldQuaternion(_q2);
  _q.setFromAxisAngle(axis, ang);
  const inv = _q2.clone().invert();
  bone.quaternion.premultiply(inv.multiply(_q).multiply(_q2));
}

// left-hand reach along the gun (metres forward of the grip) per class
export const FORE = { Sidearm: 0, Revolver: 0, SMG: 0.2, 'Assault rifle': 0.3, Shotgun: 0.36, Sniper: 0.42 };
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
  if (KIT['t_' + kind]) return KIT['t_' + kind];
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#c8c8c8'; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 600; i++) { const v = 150 + Math.random() * 90; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(Math.random() * 64, Math.random() * 64, 1, 1); }
  if (kind === 'molle') { x.fillStyle = 'rgba(40,40,40,0.55)'; for (let y = 6; y < 64; y += 12) x.fillRect(0, y, 64, 4); x.fillStyle = 'rgba(255,255,255,0.15)'; for (let y = 6; y < 64; y += 12) x.fillRect(0, y, 64, 1); }
  else { x.strokeStyle = 'rgba(60,60,60,0.35)'; for (let i = 0; i < 64; i += 4) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.stroke(); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.repeat.set(2, 2);
  return (KIT['t_' + kind] = t);
}
function kitMat(color, rough, map) {
  const k = color + '/' + rough + '/' + map; if (KIT[k]) return KIT[k];
  return (KIT[k] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: map === 'metal' ? 0.5 : 0, map: map === 'plain' || map === 'metal' ? null : kitTex(map), envMapIntensity: 0.6 }));
}
function buildKit(gear, st) {
  const kc = st.vest, pc = st.pack, dark = 0x1c1c1c;
  // head
  if (st.hat === 'cap') { gear(new THREE.SphereGeometry(0.128, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.72, 1.08), st.helmet, 'DEF-head', 0, 1.72, -0.005); gear(new THREE.BoxGeometry(0.15, 0.012, 0.09), st.helmet, 'DEF-head', 0, 1.715, 0.135, -0.15); }
  else if (st.hat === 'boonie') { gear(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.8, 1.05), st.helmet, 'DEF-head', 0, 1.715, 0); gear(new THREE.CylinderGeometry(0.21, 0.22, 0.012, 16), st.helmet, 'DEF-head', 0, 1.72, 0); }
  else {
    gear(new THREE.SphereGeometry(0.152, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1.02, 0.9, 1.1), st.helmet, 'DEF-head', 0, 1.69, -0.005, 0, 0, 0, 0.75, 'plain');
    gear(new THREE.TorusGeometry(0.152, 0.008, 6, 24, Math.PI * 2).rotateX(Math.PI / 2).scale(1.02, 1, 1.1), st.helmet, 'DEF-head', 0, 1.69, -0.005, 0, 0, 0, 0.8, 'plain');
    for (const sx of [-1, 1]) gear(new THREE.BoxGeometry(0.012, 0.03, 0.14), dark, 'DEF-head', sx * 0.152, 1.705, 0.0, 0, 0, 0, 0.5, 'plain'); // rails
    gear(new THREE.BoxGeometry(0.07, 0.045, 0.02), dark, 'DEF-head', 0, 1.735, 0.155, -0.3, 0, 0, 0.4, 'plain'); // NVG shroud
    gear(new THREE.BoxGeometry(0.07, 0.04, 0.05), 0x5a5a52, 'DEF-head', 0, 1.815, -0.08, 0.5, 0, 0, 0.7); // counterweight pouch
  }
  if (st.headset || st.hat === 'helmet') for (const sx of [-1, 1]) gear(new THREE.CylinderGeometry(0.048, 0.05, 0.045, 12).rotateZ(Math.PI / 2), 0x2a2a28, 'DEF-head', sx * 0.142, 1.635, 0.0, 0, 0, 0, 0.6, 'plain');
  if (st.face === 'shades') gear(new THREE.BoxGeometry(0.13, 0.03, 0.02), 0x111111, 'DEF-head', 0, 1.665, 0.12, 0, 0, 0, 0.15, 'plain');
  if (st.face === 'goggles') { gear(new THREE.BoxGeometry(0.15, 0.045, 0.03), 0x2a2a2a, 'DEF-head', 0, 1.66, 0.115, 0, 0, 0, 0.3, 'plain'); gear(new THREE.BoxGeometry(0.13, 0.03, 0.01), 0x6a5a30, 'DEF-head', 0, 1.66, 0.132, 0, 0, 0, 0.1, 'metal'); }
  // plate carrier: plates, shoulder straps, cummerbund, pouches
  gear(new THREE.BoxGeometry(0.31, 0.33, 0.05), kc, 'DEF-spine003', 0, 1.285, 0.125, 0, 0, 0, 0.9, 'molle');
  gear(new THREE.BoxGeometry(0.31, 0.35, 0.05), kc, 'DEF-spine003', 0, 1.3, -0.145, 0, 0, 0, 0.9, 'molle');
  for (const sx of [-1, 1]) { gear(new THREE.BoxGeometry(0.065, 0.025, 0.29), kc, 'DEF-spine003', sx * 0.105, 1.462, -0.01); gear(new THREE.BoxGeometry(0.05, 0.17, 0.25), kc, 'DEF-spine003', sx * 0.165, 1.2, -0.01, 0, 0, 0, 0.9, 'molle'); }
  for (const px of [-0.085, 0, 0.085]) { gear(new THREE.BoxGeometry(0.072, 0.115, 0.05), pc, 'DEF-spine003', px, 1.165, 0.17); gear(new THREE.BoxGeometry(0.074, 0.03, 0.054), pc, 'DEF-spine003', px, 1.225, 0.172); }
  gear(new THREE.BoxGeometry(0.19, 0.07, 0.03), pc, 'DEF-spine003', 0, 1.355, 0.163);
  gear(new THREE.BoxGeometry(0.05, 0.12, 0.06), dark, 'DEF-spine003', 0.19, 1.24, -0.06, 0, 0, 0, 0.6, 'plain'); // radio
  gear(new THREE.CylinderGeometry(0.005, 0.005, 0.32, 5), dark, 'DEF-spine003', 0.2, 1.45, -0.08, 0.15, 0, -0.1, 0.5, 'plain'); // antenna
  if (st.patch) gear(new THREE.BoxGeometry(0.012, 0.05, 0.065), st.patch, 'DEF-upper_armL', 0.215, 1.405, 0.0, 0, 0, 0, 0.7, 'plain');
  // belt, holster, knee pads, boot cuffs
  gear(new THREE.CylinderGeometry(0.158, 0.158, 0.055, 18, 1, true).scale(1, 1, 0.82), st.belt || 0x2b2b28, 'DEF-hips', 0, 0.975, -0.02, 0, 0, 0, 0.9, 'molle');
  for (const sx of [-1, 1]) gear(new THREE.BoxGeometry(0.06, 0.09, 0.08), pc, 'DEF-hips', sx * 0.15, 0.95, -0.07);
  gear(new THREE.BoxGeometry(0.06, 0.16, 0.09), dark, 'DEF-thighR', -0.155, 0.8, 0.02, 0, 0, 0, 0.6, 'plain');
  for (const sx of [-1, 1]) {
    const leg = sx < 0 ? 'R' : 'L';
    gear(new THREE.SphereGeometry(0.058, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1.15, 0.6), st.knee || dark, 'DEF-shin' + leg, sx * 0.089, 0.535, 0.055, 0, 0, 0, 0.6, 'plain');
    gear(new THREE.CylinderGeometry(0.058, 0.062, 0.09, 12), st.boots, 'DEF-shin' + leg, sx * 0.089, 0.165, -0.01, 0, 0, 0, 0.7, 'plain');
  }
  // pack variants
  if (st.packType === 'assault') { gear(new THREE.BoxGeometry(0.28, 0.36, 0.14), pc, 'DEF-spine003', 0, 1.25, -0.235); gear(new THREE.BoxGeometry(0.22, 0.12, 0.05), pc, 'DEF-spine003', 0, 1.16, -0.32); }
  else if (st.packType === 'hydro') gear(new THREE.BoxGeometry(0.2, 0.3, 0.06), pc, 'DEF-spine003', 0, 1.28, -0.2);
}

/* ---------------- team styles ---------------- */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const SKINS = [0x8d5a3b, 0xc69076, 0xe0b89a, 0x6b4430, 0xa8735a, 0xd2a07c, 0xb98563];
export function teamStyle(team, seedStr = '') {
  let h = 2166136261; for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  const r = rng(h >>> 0), pick = (L) => L[Math.floor(r() * L.length)];
  if (team === 'alpha') { // defenders: blue-grey urban kit, ballistic helmets
    const face = pick(['goggles', 'shades', 'bare', 'goggles']);
    return { top: 0x55626f, camo: 2, camoA: 0x3e4955, camoB: 0x76828e, camoC: 0x2b323a, legs: 0x434d58, boots: 0x1d1f22, skin: pick(SKINS), glove: 0x1b1c1f,
      helmet: pick([0x3a4656, 0x2f3944, 0x4a5563]), vest: pick([0x2f3a46, 0x36414d]), pack: 0x3a4552, joint: 0x22262a, hat: 'helmet', face, packType: pick(['hydro', 'none', 'assault']), belt: 0x23272c, patch: 0x5ab0ff, knee: 0x1d2024, headset: true, seed: r() * 10 };
  }
  const face = pick(['balaclava', 'shades', 'goggles', 'bare']), hat = pick(['cap', 'helmet', 'boonie', 'helmet']);
  return { top: 0xb09a72, camo: 1, camoA: 0x8a7452, camoB: 0xcdbb94, camoC: 0x6f5c40, legs: pick([0x8a7a5a, 0x7a6c50]), boots: pick([0x5a4a38, 0x6b5a44]), skin: face === 'balaclava' ? 0x2a2622 : pick(SKINS), glove: pick([0x4a3e30, 0x2a2620]),
    helmet: hat === 'helmet' ? 0x9a8a66 : 0xa8946c, vest: pick([0x6b5a40, 0x7a6848]), pack: 0x7a6648, joint: 0x3a3228, hat, face, packType: pick(['assault', 'hydro', 'none']), belt: 0x5a4a36, patch: 0xe8a33a, knee: 0x4a3e30, seed: r() * 10 };
}

/* ---------------- operator ---------------- */
const _gq = new THREE.Quaternion(), _gq2 = new THREE.Quaternion(), _tmpO = new THREE.Object3D();
const _wp = new THREE.Vector3();
let hitMat = null;

export class Operator {
  constructor(name, team, opts = {}) {
    const st = this.style = opts.style || teamStyle(team, name);
    this.team = team;
    const group = this.group = new THREE.Group();
    const model = this.model = skClone(A.gltf.scene);
    group.add(model);
    const uni = { cTop: { value: new THREE.Color(st.top) }, cLegs: { value: new THREE.Color(st.legs) }, cBoots: { value: new THREE.Color(st.boots) }, cSkin: { value: new THREE.Color(st.skin) }, cGlove: { value: new THREE.Color(st.glove) }, uFlash: { value: 0 }, uCamo: { value: st.camo || 0 }, cA: { value: new THREE.Color(st.camoA || st.top) }, cB: { value: new THREE.Color(st.camoB || st.top) }, cC: { value: new THREE.Color(st.camoC || st.top) }, uSeed: { value: st.seed || 0 } };
    this.uni = uni;
    model.traverse((o) => {
      if (!(o.isSkinnedMesh || o.isMesh)) return;
      o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
      const isJoint = o.material && o.material.name === 'M_Joints';
      const m = new THREE.MeshStandardMaterial({ color: isJoint ? (st.joint || 0x2e2d2a) : 0xffffff, roughness: 0.86, metalness: 0 });
      if (!isJoint) {
        m.onBeforeCompile = (sh) => {
          Object.assign(sh.uniforms, uni);
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBP = position;');
          sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
            varying vec3 vBP; uniform vec3 cTop, cLegs, cBoots, cSkin, cGlove, cA, cB, cC; uniform float uFlash, uCamo, uSeed;
            float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
            float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
              return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y), mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
            vec3 camo(vec3 base, vec3 p){
              if (uCamo < 0.5) return base;
              p += uSeed;
              if (uCamo > 1.5) p = floor(p * 34.0) / 34.0;
              float a = n3(p * 6.0) * 0.65 + n3(p * 13.0) * 0.35, b = n3(p * 9.0 + 11.0) * 0.6 + n3(p * 19.0 + 3.0) * 0.4, c = n3(p * 15.0 + 27.0);
              vec3 col = base; col = mix(col, cA, smoothstep(0.52, 0.56, a)); col = mix(col, cB, smoothstep(0.6, 0.64, b)); col = mix(col, cC, smoothstep(0.7, 0.73, c)); return col;
            }`).replace('#include <color_fragment>', `#include <color_fragment>
            float ax = abs(vBP.x); vec3 zc = camo(cTop, vBP);
            if (vBP.y < 0.99) zc = camo(cLegs, vBP + vec3(3.1));
            if (vBP.y > 0.93 && vBP.y < 1.0 && ax < 0.24) zc = cBoots * 1.4;
            if (vBP.y < 0.15) zc = cBoots;
            if (vBP.y > 1.5 && ax < 0.16) zc = cSkin;
            if (ax > 0.7) zc = cGlove;
            float fab = 0.9 + 0.1 * sin(vBP.y * 260.0) * sin(vBP.x * 240.0 + vBP.z * 240.0) - 0.06 * smoothstep(0.2, 0.0, abs(fract(vBP.y * 9.0) - 0.5)) * step(vBP.y, 1.45) * step(0.15, vBP.y);
            diffuseColor.rgb = zc * fab + vec3(1.0, 0.2, 0.1) * uFlash;`);
        };
        m.customProgramCacheKey = () => 'operator';
      }
      o.material = m;
    });
    this.bones = {}; model.traverse((o) => { if (o.isBone && BONES.includes(o.name)) this.bones[o.name] = o; });
    model.updateMatrixWorld(true);
    this.headGear = [];
    const attach = (mesh, bone, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const b = this.bones[bone]; b.updateMatrixWorld(true);
      const world = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
      const boneM = new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(b.matrixWorld);
      boneM.invert().multiply(world).decompose(mesh.position, mesh.quaternion, mesh.scale);
      b.add(mesh); return mesh;
    };
    const gear = (geo, color, bone, x, y, z, rx = 0, ry = 0, rz = 0, rough = 0.85, map = 'cordura') => {
      const mesh = new THREE.Mesh(geo, kitMat(color, rough, map)); mesh.castShadow = true;
      attach(mesh, bone, x, y, z, rx, ry, rz); if (bone === 'DEF-head') this.headGear.push(mesh); return mesh;
    };
    buildKit(gear, st);
    if (st.face === 'balaclava') gear(new THREE.SphereGeometry(0.118, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62).scale(1, 1.15, 1.05), 0x2a2622, 'DEF-head', 0, 1.6, 0.0, 0, 0, 0, 0.95, 'plain');
    // invisible hitboxes riding the bones
    hitMat = hitMat || new THREE.MeshBasicMaterial({ visible: false });
    const hb = (w, h, d, bone, x, y, z, part) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hitMat); m.userData = { part }; attach(m, bone, x, y, z); return m; };
    this.head = hb(0.27, 0.32, 0.3, 'DEF-head', 0, 1.66, 0.01, 'head');
    this.torso = hb(0.5, 0.56, 0.34, 'DEF-spine003', 0, 1.27, 0, 'body');
    this.vest = hb(0.42, 0.3, 0.3, 'DEF-hips', 0, 0.98, 0, 'body');
    const legs = [];
    for (const s of ['L', 'R']) { const sx = s === 'L' ? 0.1 : -0.1; legs.push(hb(0.17, 0.46, 0.2, 'DEF-thigh' + s, sx, 0.72, 0, 'body'), hb(0.15, 0.48, 0.18, 'DEF-shin' + s, sx, 0.27, 0, 'body')); }
    this.hitMeshes = [this.head, this.torso, this.vest, ...legs];
    // compatibility handles used by main.js / trailer.js (walk swing + kneel are read from these)
    this.legL = new THREE.Object3D(); this.legR = new THREE.Object3D(); group.add(this.legL, this.legR);
    // animation layers
    const mixer = this.mixer = new THREE.AnimationMixer(model);
    this.act = { lower: {}, upper: {} };
    for (const n of LOWER) { const c = partClip(n, 'lower'); if (c) { const a = mixer.clipAction(c); a.weight = 0; this.act.lower[n] = a; } }
    for (const n of UPPERS) { const c = partClip(n, 'upper'); if (c) { const a = mixer.clipAction(c); a.weight = 0; this.act.upper[n] = a; } }
    for (const L of [this.act.lower, this.act.upper]) for (const n in L) if (ONESHOT.has(n)) { L[n].setLoop(THREE.LoopOnce); L[n].clampWhenFinished = true; }
    this.cur = { lower: null, upper: null }; this.fade = {};
    this.setLayer('lower', 'Idle_Loop', 0); this.setLayer('upper', 'Pistol_Idle_Loop', 0);
    this.mixer.update(Math.random() * 2);
    // weapon (third-person): wrapper faces +Z, gun inside rotated so its barrel points +Z
    this.gunHolder = new THREE.Group(); group.add(this.gunHolder);
    this.setGun(opts.gun || (team === 'alpha' ? 'phantom' : 'vandal'));
    this.dead = false; this.gp = null; this.shotT = 9; this.lastPos = null; this.speed = 0;
  }
  setGun(id) {
    if (this.gunId === id) return;
    if (this.gun) this.gunHolder.remove(this.gun);
    this.gunId = id; const g = buildGun(id, false);
    if (!g) { this.gun = null; return; }
    const w = new THREE.Group(); g.rotation.y = Math.PI; w.add(g);
    w.userData = { fore: new THREE.Vector3(-g.userData.fore.x, g.userData.fore.y, -g.userData.fore.z), muzzle: new THREE.Vector3(-g.userData.muzzle.x, g.userData.muzzle.y, -g.userData.muzzle.z), cls: g.userData.spec.cls };
    this.gun = w; this.gunHolder.add(w);
  }
  setLayer(layer, name, fade = 0.2, restart = false) {
    if (this.cur[layer] === name && !restart) return;
    const L = this.act[layer], a = L[name]; if (!a) return;
    this.cur[layer] = name; this.fade[layer] = fade;
    if (restart || !a.isRunning()) { a.reset(); a.play(); }
    if (fade <= 0) for (const n in L) { L[n].weight = n === name ? 1 : 0; if (n !== name) L[n].stop(); }
  }
  blend(dt) {
    for (const layer of ['lower', 'upper']) {
      const L = this.act[layer], cur = this.cur[layer], f = this.fade[layer] || 0.2, k = f <= 0 ? 1 : Math.min(1, dt / f);
      for (const n in L) {
        const a = L[n]; const target = n === cur ? 1 : 0;
        if (a.weight === target && (target === 0 ? !a.isRunning() : true)) continue;
        a.weight += (target - a.weight) * k; a.setEffectiveWeight(a.weight);
        if (target === 0 && a.weight < 0.02) { a.weight = 0; a.stop(); }
      }
    }
  }
  fired() { this.shotT = 0; }
  // s: { speed?, crouch?, dead?, pitch?, aim?, moveYaw? }  (speed is measured from movement when omitted)
  animate(dt, s = {}) {
    const g = this.group;
    if (!g.visible) return;
    this.shotT += dt;
    // measured ground speed
    const p = g.position;
    if (this.lastPos && dt > 0) { const sp = Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z) / dt; this.speed += (sp - this.speed) * Math.min(1, dt * 10); }
    this.lastPos = (this.lastPos || new THREE.Vector3()).copy(p);
    const speed = s.speed != null ? s.speed : this.speed;
    const kneel = clamp(-this.legL.rotation.x / 1.4, 0, 1); // trailer kneel() drives legL like the old blocky model
    const crouch = s.crouch || kneel > 0.4;
    this.model.position.y = kneel * 0.3; // kneel() lowers the group by 0.3*k: the crouch pose already does that
    if (s.dead) {
      if (!this.dead) { this.dead = true; this.setLayer('lower', 'Death01', 0.12, true); this.setLayer('upper', 'Death01', 0.12, true); }
      this.gunHolder.visible = false;
      this.blend(dt); this.mixer.update(dt);
      return;
    }
    if (this.dead) { this.dead = false; }
    this.gunHolder.visible = !!this.gun;
    let lower = 'Idle_Loop';
    if (crouch) lower = speed > 0.6 ? 'Crouch_Fwd_Loop' : 'Crouch_Idle_Loop';
    else if (speed > 3.0) lower = 'Jog_Fwd_Loop';
    else if (speed > 0.35) lower = 'Walk_Loop';
    const aiming = s.aim || this.shotT < 1.5;
    this.setLayer('lower', lower, 0.2); this.setLayer('upper', aiming ? 'Pistol_Aim_Neutral' : 'Pistol_Idle_Loop', 0.2);
    this.blend(dt); this.mixer.update(dt);
    // body yaw (our groups face +Z; the IK code below uses Last Zone's -Z yaw convention)
    const yaw = g.rotation.y + Math.PI;
    const B = this.bones; g.updateMatrixWorld(true);
    const pitch = clamp(s.pitch || 0, -0.9, 0.9);
    if (B['DEF-spine002']) {
      _r.set(Math.cos(yaw), 0, -Math.sin(yaw));
      rotBoneWorld(B['DEF-spine002'], _r, pitch * 0.45); rotBoneWorld(B['DEF-spine003'], _r, pitch * 0.4);
      rotBoneWorld(B['DEF-spine003'], _up, -0.18);
    }
    if (this.gun) this.holdGun(yaw, pitch, aiming, dt);
    if (this.uni.uFlash.value > 0) this.uni.uFlash.value = Math.max(0, this.uni.uFlash.value - dt * 3);
  }
  holdGun(yaw, aimP, aiming, dt) {
    const B = this.bones, hand = this.gun.userData.cls === 'pistol';
    const T = aiming ? (hand ? [0.07, 0.14, 0.45, 0, 0] : [0.15, 0.1, 0.3, 0, 0]) : (hand ? [0.1, -0.08, 0.36, -0.75, 0.15] : [0.12, -0.03, 0.3, -0.5, 0.4]);
    const G = this.gp || (this.gp = T.slice()); const k = Math.min(1, dt * 10);
    for (let i = 0; i < 5; i++) G[i] += (T[i] - G[i]) * k;
    const py = aimP + G[3], yy = yaw + G[4], cp = Math.cos(py);
    _f.set(-Math.sin(yy) * cp, Math.sin(py), -Math.cos(yy) * cp);
    const cpa = Math.cos(aimP); _af.set(-Math.sin(yaw) * cpa, Math.sin(aimP), -Math.cos(yaw) * cpa);
    _r.set(Math.cos(yaw), 0, -Math.sin(yaw)); _u.crossVectors(_r, _af).normalize();
    B['DEF-spine003'].getWorldPosition(_c);
    _wp.copy(_c).addScaledVector(_r, G[0]).addScaledVector(_u, G[1]).addScaledVector(_af, G[2]);
    // world pose -> local to the group (the holder is parented so it hides/removes with the operator)
    _tmpO.position.copy(_wp); _tmpO.lookAt(_wp.clone().add(_f)); _tmpO.updateMatrix();
    this.group.getWorldQuaternion(_gq); _gq2.copy(_gq).invert();
    this.gunHolder.position.copy(this.group.worldToLocal(_wp.clone()));
    this.gunHolder.quaternion.copy(_gq2).multiply(_tmpO.quaternion);
    this.gunHolder.updateMatrixWorld(true);
    if (!B['DEF-upper_armR']) return;
    const gm = this.gunHolder.matrixWorld;
    _gf.set(0, 0, 1).transformDirection(gm); _gu.set(0, 1, 0).transformDirection(gm); _gr.set(-1, 0, 0).transformDirection(gm);
    _t1.set(0, -0.06, -0.07).applyMatrix4(gm);
    _dir.copy(_gf).multiplyScalar(0.55).addScaledVector(_gu, -0.8).normalize();
    _pole.copy(_u).multiplyScalar(-1).addScaledVector(_r, 0.7).addScaledVector(_af, -0.3);
    solveArm(B['DEF-upper_armR'], B['DEF-forearmR'], B['DEF-handR'], B['DEF-f_middle01R'], _t1, _pole, _dir);
    if (hand) _t2.set(0.035, -0.08, -0.05).applyMatrix4(gm);
    else _t2.copy(this.gun.userData.fore).add(new THREE.Vector3(0, -0.05, 0)).applyMatrix4(gm);
    _dir.copy(_gf).multiplyScalar(hand ? 0.4 : 0.6).addScaledVector(_gr, hand ? 0.5 : 0.55).addScaledVector(_gu, hand ? -0.6 : -0.2).normalize();
    _pole.copy(_u).multiplyScalar(-1).addScaledVector(_r, -0.6).addScaledVector(_af, -0.2);
    solveArm(B['DEF-upper_armL'], B['DEF-forearmL'], B['DEF-handL'], B['DEF-f_middle01L'], _t2, _pole, _dir);
  }
  muzzleWorld(out = new THREE.Vector3()) {
    if (!this.gun) return this.group.localToWorld(out.set(0.2, 1.4, 0.6));
    return out.copy(this.gun.userData.muzzle).applyMatrix4(this.gun.matrixWorld);
  }
  hitFlash() { this.uni.uFlash.value = 0.5; }
}
