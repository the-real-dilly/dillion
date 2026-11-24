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
  dilly: { top: 0xb3a07c, legs: 0x55585a, boots: 0x2c2a26, skin: 0xb88c6a, glove: 0x34312c, helmet: 0x7c7a5c, vest: 0x8b7d58, pack: 0x5a5440, joint: 0x3a3833, headset: true },
  rivals: [
    { top: 0x55603e, legs: 0x4a5236, boots: 0x22201c, skin: 0x8f6a52, glove: 0x2a2a26, helmet: 0x4d5636, vest: 0x5f6a45, pack: 0x3e4430 },
    { top: 0x2c2f33, legs: 0x26282b, boots: 0x161616, skin: 0xa77d61, glove: 0x1b1b1b, helmet: 0x1f2124, vest: 0x34383c, pack: 0x2b2d30 },
    { top: 0x8a7a5a, legs: 0x7a6c50, boots: 0x3a2f24, skin: 0x6f4f3d, glove: 0x3a3226, helmet: 0x9a8a66, vest: 0x8f7e5a, pack: 0x6e6046 },
    { top: 0x4a5560, legs: 0x3b444c, boots: 0x1d1f22, skin: 0xc29a7c, glove: 0x23272b, helmet: 0x3c4650, vest: 0x56626e, pack: 0x404a54 },
    { top: 0x6b4a3a, legs: 0x4f4a42, boots: 0x231d18, skin: 0x9a7058, glove: 0x2c2620, helmet: 0x5a4f40, vest: 0x6a5a44, pack: 0x4c4234 },
    { top: 0x5e6b6b, legs: 0x4f5650, boots: 0x22251f, skin: 0xb0866a, glove: 0x2a2e2a, helmet: 0x56605a, vest: 0x6a756a, pack: 0x4c5450, cap: true }
  ],
  target: { top: 0xd8d4c8, legs: 0xc8c2b4, boots: 0x6a6460, skin: 0xd8d4c8, glove: 0xb8b2a4, helmet: 0xc0503a, vest: 0xc0503a, pack: 0x8a8478, joint: 0x8a8478, noPack: true }
};

const BONES = ["DEF-head", "DEF-spine001", "DEF-spine002", "DEF-spine003", "DEF-hips", "DEF-handR", "DEF-handL"];
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

export class Avatar {
  constructor(style, opts = {}) {
    const st = this.style = style;
    const root = this.root = new THREE.Group(); root.rotation.order = "YXZ";
    const model = this.model = skClone(A.gltf.scene);
    model.rotation.y = Math.PI; root.add(model);
    const uni = { cTop: { value: new THREE.Color(st.top) }, cLegs: { value: new THREE.Color(st.legs) }, cBoots: { value: new THREE.Color(st.boots) }, cSkin: { value: new THREE.Color(st.skin) }, cGlove: { value: new THREE.Color(st.glove) }, uFlash: { value: 0 } };
    this.uni = uni;
    model.traverse((o) => {
      if (o.isSkinnedMesh || o.isMesh) {
        o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
        const isJoint = o.material && o.material.name === "M_Joints";
        const m = new THREE.MeshStandardMaterial({ color: isJoint ? (st.joint || 0x2e2d2a) : 0xffffff, roughness: 0.85, metalness: 0 });
        if (!isJoint) m.onBeforeCompile = (sh) => {
          Object.assign(sh.uniforms, uni);
          sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vBP;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvBP = position;");
          sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vBP; uniform vec3 cTop, cLegs, cBoots, cSkin, cGlove; uniform float uFlash;")
            .replace("#include <color_fragment>", `#include <color_fragment>
              float ax = abs(vBP.x); vec3 zc = cTop;
              if (vBP.y < 0.99) zc = cLegs;
              if (vBP.y > 0.93 && vBP.y < 1.0 && ax < 0.24) zc = cBoots * 1.4;
              if (vBP.y < 0.15) zc = cBoots;
              if (vBP.y > 1.5 && ax < 0.16) zc = cSkin;
              if (ax > 0.7) zc = cGlove;
              float fab = 0.92 + 0.08 * sin(vBP.y * 180.0) * sin(vBP.x * 160.0);
              diffuseColor.rgb = zc * fab + vec3(1.0, 0.2, 0.1) * uFlash;`);
        };
        o.material = m;
      }
    });
    this.bones = {}; model.traverse((o) => { if (o.isBone && BONES.includes(o.name)) this.bones[o.name] = o; });
    // gear in bind pose
    model.updateMatrixWorld(true);
    const gear = (geo, color, bone, x, y, z, rx = 0, ry = 0, rz = 0, rough = 0.8) => {
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: rough }));
      mesh.castShadow = true;
      const b = this.bones[bone]; b.updateMatrixWorld(true);
      const world = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
      // model-space -> bone local (model itself has rotation PI at the root, so use model-relative matrices)
      const boneM = new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(b.matrixWorld);
      const local = boneM.invert().multiply(world);
      local.decompose(mesh.position, mesh.quaternion, mesh.scale);
      b.add(mesh); return mesh;
    };
    const hc = st.helmet;
    if (st.cap) gear(new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.75, 1.1), hc, "DEF-head", 0, 1.72, 0.0);
    else {
      gear(new THREE.SphereGeometry(0.15, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.56).scale(1.02, 0.92, 1.1), hc, "DEF-head", 0, 1.69, -0.005, 0, 0, 0, 0.7);
      gear(new THREE.BoxGeometry(0.1, 0.035, 0.03), 0x1a1a1a, "DEF-head", 0, 1.71, 0.155, 0, 0, 0, 0.3); // NVG mount
    }
    if (st.headset) { for (const sx of [-1, 1]) gear(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10).rotateZ(Math.PI / 2), 0x2a2a28, "DEF-head", sx * 0.14, 1.62, 0.0); }
    gear(new THREE.BoxGeometry(0.4, 0.4, 0.29), st.vest, "DEF-spine003", 0, 1.27, 0.015);
    for (const px of [-0.12, 0, 0.12]) gear(new THREE.BoxGeometry(0.1, 0.13, 0.06), st.pack, "DEF-spine003", px, 1.16, 0.18);
    if (!st.noPack) gear(new THREE.BoxGeometry(0.3, 0.38, 0.15), st.pack, "DEF-spine003", 0, 1.26, -0.22);
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
    // gun at the right hand, pointing along the aim when aiming
    if (this.gun && ground) {
      const hand = B["DEF-handR"]; hand.getWorldPosition(_v);
      const aiming = upper === "Pistol_Aim_Neutral" || p.adsT > 0.2;
      const gy = yaw + (p.recY || 0), gp = aiming ? p.pitch + (p.recP || 0) : (p.sprint ? -0.8 : -0.4);
      const yawOff = aiming ? 0 : (p.sprint ? 0.6 : 0.12);
      this.gunHolder.position.copy(_v);
      const cp = Math.cos(gp); _v2.set(_v.x - Math.sin(gy + yawOff) * cp, _v.y + Math.sin(gp), _v.z - Math.cos(gy + yawOff) * cp);
      this.gunHolder.lookAt(_v2);
    }
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 4); this.uni.uFlash.value = this.flash * 0.6; }
  }
  muzzleWorld(out) {
    if (!this.gun) return this.root.getWorldPosition(out).setY(this.root.position.y + 1.4);
    out.set(0, 0, this.gun.userData.muzzle).applyMatrix4(this.gunHolder.matrixWorld); return out;
  }
  dispose() { this.scn.remove(this.root); this.scn.remove(this.gunHolder); this.mixer.stopAllAction(); }
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
  g.position.set(it.x, it.y, it.z);
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
