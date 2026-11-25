/* =====================================================================
   dgm/guns.js : firearm models for Dilly Gone Mad (THREE side).
   Re-exports the pure logic (gunlogic.js) and ballistics (ballistics.js),
   and adds loadGunModel(): OBJ+MTL from assets/guns (Quaternius, CC0),
   normalised to metres and gun-local axes, upgraded to PBR materials,
   with extra detail (sights, optic, rails) and named anchor Object3Ds.

   gun-local space: metres, +Z muzzle, +Y up, -X = right (ejection) side,
   origin = centre of the right-hand grip. See dgm/guns.md.
   ===================================================================== */
import * as THREE from "three";
import { OBJLoader } from "../vendor/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "../vendor/jsm/loaders/MTLLoader.js";
import { toCreasedNormals, mergeBufferGeometries, mergeVertices } from "../vendor/jsm/utils/BufferGeometryUtils.js";
import { GUN_DEFS, MODEL_FIX } from "./gunlogic.js";

export * from "./gunlogic.js";
export * from "./ballistics.js";

let BASE = new URL("../assets/guns/", import.meta.url).href;
/** Override where the OBJ/MTL files live (default: ../assets/guns/ relative to this module). */
export function setGunBasePath(url) { BASE = url.endsWith("/") ? url : url + "/"; }

export const ANCHOR_NAMES = ["grip", "support", "muzzle", "eject", "eye", "front", "trigger", "magWell", "stock"];

/* ---------- procedural textures (shared) ---------- */
const TEX = {};
function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; }
function heightToNormal(src, strength) {
  const w = src.width, h = src.height, sd = src.getContext("2d").getImageData(0, 0, w, h).data;
  const [c, x] = canvas(w, h), img = x.createImageData(w, h), o = img.data;
  const H = (i, j) => sd[(((j + h) % h) * w + ((i + w) % w)) * 4] / 255;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const dx = (H(i - 1, j) - H(i + 1, j)) * strength, dy = (H(i, j - 1) - H(i, j + 1)) * strength, l = Math.hypot(dx, dy, 1), k = (j * w + i) * 4;
    o[k] = (dx / l * 0.5 + 0.5) * 255; o[k + 1] = (dy / l * 0.5 + 0.5) * 255; o[k + 2] = (1 / l * 0.5 + 0.5) * 255; o[k + 3] = 255;
  }
  x.putImageData(img, 0, 0); return c;
}
function rt(c, srgb) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (srgb) t.encoding = THREE.sRGBEncoding; return t; }
function textures() {
  if (TEX.ready) return TEX;
  let s = 99; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // polymer stipple
  { const [c, x] = canvas(256, 256); x.fillStyle = "#808080"; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 9000; i++) { const v = 90 + r() * 90 | 0; x.fillStyle = `rgb(${v},${v},${v})`; x.beginPath(); x.arc(r() * 256, r() * 256, 0.6 + r() * 1.4, 0, 7); x.fill(); } TEX.stipple = rt(heightToNormal(c, 1.6)); }
  // brushed metal: fine streaks along u
  { const [c, x] = canvas(256, 256); x.fillStyle = "#808080"; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 1400; i++) { const v = 100 + r() * 60 | 0; x.strokeStyle = `rgba(${v},${v},${v},.5)`; x.lineWidth = 0.5 + r(); const y = r() * 256; x.beginPath(); x.moveTo(r() * 256 - 60, y); x.lineTo(r() * 256 + 60, y + (r() - 0.5) * 2); x.stroke(); } TEX.brushed = rt(heightToNormal(c, 0.8)); }
  // roughness variation / wear (grey scale)
  { const [c, x] = canvas(256, 256); x.fillStyle = "#9a9a9a"; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 260; i++) { const g = x.createRadialGradient(r() * 256, r() * 256, 0, r() * 256, r() * 256, 6 + r() * 30); const v = r() < 0.5 ? 70 : 170; g.addColorStop(0, `rgba(${v},${v},${v},.35)`); g.addColorStop(1, "rgba(128,128,128,0)"); x.fillStyle = g; x.fillRect(0, 0, 256, 256); } TEX.rough = rt(c); }
  // wood grain (colour + bump)
  { const [c, x] = canvas(512, 128), [b, bx] = canvas(512, 128);
    for (let j = 0; j < 128; j++) { const ph = Math.sin(j * 0.11) * 6 + Math.sin(j * 0.37) * 2; for (let i = 0; i < 512; i++) { const v = Math.sin((i + ph * 8) * 0.06 + Math.sin(i * 0.013 + j * 0.05) * 3) * 0.5 + 0.5, n = r() * 0.12; const k = Math.pow(v, 3) * 0.5 + n; x.fillStyle = `rgb(${(128 - k * 80) | 0},${(76 - k * 50) | 0},${(42 - k * 28) | 0})`; x.fillRect(i, j, 1, 1); bx.fillStyle = `rgb(${(128 + (v - 0.5) * 70) | 0},0,0)`; bx.fillRect(i, j, 1, 1); } }
    TEX.wood = rt(c, true); TEX.woodN = rt(heightToNormal(b, 1.2)); }
  // knurl / grip texture for grips
  { const [c, x] = canvas(128, 128); x.fillStyle = "#808080"; x.fillRect(0, 0, 128, 128); x.strokeStyle = "#c8c8c8"; x.lineWidth = 2; for (let i = -128; i < 256; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 128, 128); x.stroke(); x.beginPath(); x.moveTo(i + 128, 0); x.lineTo(i, 128); x.stroke(); } TEX.knurl = rt(heightToNormal(c, 2.0)); }
  // red-dot reticle
  { const [c, x] = canvas(64, 64); const g = x.createRadialGradient(32, 32, 0, 32, 32, 30); g.addColorStop(0, "rgba(255,60,40,1)"); g.addColorStop(0.12, "rgba(255,40,30,.9)"); g.addColorStop(0.25, "rgba(255,30,20,.15)"); g.addColorStop(1, "rgba(255,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64); TEX.dot = new THREE.CanvasTexture(c); TEX.dot.encoding = THREE.sRGBEncoding; }
  TEX.ready = true; return TEX;
}

/* ---------- shared materials per quality ---------- */
const MATS = {};
/** Shared PBR material set. Keys: polymer, polymerGrip, gunmetal, steel, brightSteel, anodised, anodisedDark, anodisedLight,
 *  wood, darkWood, olive, rubber, lens, glow, brass. */
export function gunMaterials(quality = "high") {
  if (MATS[quality]) return MATS[quality];
  const hi = quality === "high", T = hi ? textures() : {};
  const P = (o) => hi ? new THREE.MeshPhysicalMaterial(o) : new THREE.MeshStandardMaterial(stripPhysical(o));
  const nm = (t, s) => (hi ? { normalMap: t, normalScale: new THREE.Vector2(s, s) } : {});
  const M = {
    polymer: P(Object.assign({ name: "gun_polymer", color: 0x1b1c1f, roughness: 0.62, metalness: 0.0, clearcoat: 0.15, clearcoatRoughness: 0.6, roughnessMap: T.rough }, nm(T.stipple, 0.35))),
    polymerGrip: P(Object.assign({ name: "gun_polymer_grip", color: 0x17181a, roughness: 0.75, metalness: 0.0, roughnessMap: T.rough }, nm(T.knurl, 0.6))),
    gunmetal: P(Object.assign({ name: "gun_gunmetal", color: 0x26282b, roughness: 0.36, metalness: 0.8, clearcoat: 0.3, clearcoatRoughness: 0.35, roughnessMap: T.rough }, nm(T.brushed, 0.25))),
    steel: P(Object.assign({ name: "gun_steel", color: 0x55595f, roughness: 0.3, metalness: 1.0, roughnessMap: T.rough }, nm(T.brushed, 0.3))),
    brightSteel: P(Object.assign({ name: "gun_bright_steel", color: 0xa4a9b0, roughness: 0.22, metalness: 1.0, roughnessMap: T.rough }, nm(T.brushed, 0.3))),
    anodised: P(Object.assign({ name: "gun_anodised", color: 0x1e2023, roughness: 0.42, metalness: 0.35, clearcoat: 0.25, clearcoatRoughness: 0.45, roughnessMap: T.rough }, nm(T.stipple, 0.12))),
    anodisedDark: P(Object.assign({ name: "gun_anodised_dark", color: 0x141517, roughness: 0.48, metalness: 0.3, roughnessMap: T.rough }, nm(T.stipple, 0.15))),
    anodisedLight: P(Object.assign({ name: "gun_anodised_light", color: 0x2c2e32, roughness: 0.4, metalness: 0.45, roughnessMap: T.rough }, nm(T.brushed, 0.2))),
    wood: P(Object.assign({ name: "gun_wood", color: 0xffffff, map: T.wood || null, roughness: 0.5, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.35 }, nm(T.woodN, 0.5))),
    darkWood: P(Object.assign({ name: "gun_dark_wood", color: 0x7a6252, map: T.wood || null, roughness: 0.5, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.35 }, nm(T.woodN, 0.5))),
    olive: P(Object.assign({ name: "gun_olive", color: 0x3b4430, roughness: 0.66, metalness: 0, clearcoat: 0.1, roughnessMap: T.rough }, nm(T.stipple, 0.45))),
    rubber: P({ name: "gun_rubber", color: 0x111112, roughness: 0.9, metalness: 0 }),
    lens: P({ name: "gun_lens", color: 0x0d1a2a, roughness: 0.05, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: hi ? 0.6 : 0, iridescenceIOR: 1.6, envMapIntensity: 2 }),
    brass: P({ name: "gun_brass", color: 0xc8963c, roughness: 0.3, metalness: 1 }),
    glow: new THREE.MeshBasicMaterial({ name: "gun_glow", color: 0xff3020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: T.dot || null })
  };
  // wood maps expect sRGB colour; keep grey/black albedo sane
  for (const k in M) if (M[k].map && M[k].map !== T.dot) M[k].map.repeat.set(1, 1);
  return (MATS[quality] = M);
}
function stripPhysical(o) { const c = Object.assign({}, o); for (const k of ["clearcoat", "clearcoatRoughness", "iridescence", "iridescenceIOR", "sheen", "transmission"]) delete c[k]; return c; }

/* MTL material name -> shared PBR key, per model family */
function pbrKey(model, name) {
  const n = name.toLowerCase();
  if (n === "glass") return "lens";
  if (n === "wood") return "wood";
  if (n === "darkwood") return "darkWood";
  if (n === "green") return "olive";
  if (n === "lightmetal") return model === "Shotgun_1" ? "wood" : "brightSteel";
  if (n === "metal") return model.startsWith("Pistol") || model === "Revolver_1" ? "steel" : "gunmetal";
  if (n === "darkmetal") return "gunmetal";
  if (n === "black" || n === "black2") return "polymer";
  if (n === "grey") return model.startsWith("Sniper") ? "gunmetal" : "anodisedLight";
  if (n === "main") return "anodised";
  if (n === "maindark") return "anodisedDark";
  if (n === "mainlight") return "anodisedLight";
  return "gunmetal";
}

/* ---------- loading ---------- */
const RAW = new Map();   // model -> Promise<{ geo, groups:[{start,count,key}] }>
const BUILT = new Map(); // `${model}|${quality}` -> Promise<THREE.Group template>

function fetchRaw(model) {
  if (RAW.has(model)) return RAW.get(model);
  const p = new Promise((res, rej) => {
    new MTLLoader().setPath(BASE).load(model + ".mtl", (mtl) => {
      mtl.preload();
      new OBJLoader().setMaterials(mtl).setPath(BASE).load(model + ".obj", (obj) => res(obj), undefined, rej);
    }, undefined, rej);
  });
  RAW.set(model, p);
  return p;
}

/* box-projected UVs (the OBJs have none); per triangle, dominant axis of its face normal */
function boxUV(geo, scale) {
  const p = geo.attributes.position, n = p.count, uv = new Float32Array(n * 2), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    fn.subVectors(c, b).cross(a.clone().sub(b)); const ax = Math.abs(fn.x), ay = Math.abs(fn.y), az = Math.abs(fn.z);
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? a : k === 1 ? b : c;
      let u, w; if (ax >= ay && ax >= az) { u = v.z; w = v.y; } else if (ay >= az) { u = v.z; w = v.x; } else { u = v.x; w = v.y; }
      uv[(i + k) * 2] = u * scale; uv[(i + k) * 2 + 1] = w * scale;
    }
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

async function buildTemplate(model, quality) {
  const fix = MODEL_FIX[model], M = gunMaterials(quality), root = new THREE.Group();
  root.name = "gun_" + model;
  if (fix.local) { buildProcedural(model, root, M, quality); return root; }
  const obj = await fetchRaw(model);
  const parts = new Map(); // pbr key -> [geometries]
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.deleteAttribute("uv"); g.deleteAttribute("color");
    // raw -> gun-local metres: move grip to origin, barrel +X -> +Z, scale
    g.translate(-fix.grip[0], -fix.grip[1], 0); g.rotateY(-Math.PI / 2); g.scale(fix.s, fix.s, fix.s);
    const groups = g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
    for (const gr of groups) {
      const sub = new THREE.BufferGeometry();
      for (const name of ["position", "normal"]) { const at = g.attributes[name]; if (!at) continue; sub.setAttribute(name, new THREE.BufferAttribute(at.array.slice(gr.start * 3, (gr.start + gr.count) * 3), 3)); }
      const key = pbrKey(model, (mats[gr.materialIndex] || mats[0]).name);
      if (!parts.has(key)) parts.set(key, []);
      parts.get(key).push(sub);
    }
  });
  for (const [key, geos] of parts) {
    let g = geos.length > 1 ? mergeBufferGeometries(geos, false) : geos[0];
    g = toCreasedNormals(mergeVertices(g), (quality === "high" ? 32 : 40) * Math.PI / 180);
    boxUV(g, key === "wood" || key === "darkWood" ? 6 : 14);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, M[key]); m.name = "part_" + key; m.castShadow = true; m.receiveShadow = true; root.add(m);
  }
  addDetail(model, root, M, quality);
  return root;
}

/* ---------- extra detail on top of the base meshes ---------- */
function box(M, key, w, h, l, x, y, z, rx = 0, ry = 0, rz = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), M[key]); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; return m; }
function cyl(M, key, r0, r1, l, x, y, z, seg = 16) { const g = new THREE.CylinderGeometry(r0, r1, l, seg); g.rotateX(Math.PI / 2); const m = new THREE.Mesh(g, M[key]); m.position.set(x, y, z); m.castShadow = true; return m; }
function ironSights(root, M, def, opt = {}) {
  const A = def.anchors, ey = A.eye[1], g = new THREE.Group(); g.name = "detail_irons";
  const rearZ = A.eye[2], frontZ = A.front[2];
  // rear: notch made of two ears + base
  g.add(box(M, "polymer", 0.026, 0.008, 0.014, 0, ey - 0.012, rearZ));
  for (const s of [-1, 1]) g.add(box(M, "polymer", 0.008, 0.012, 0.012, s * 0.0075, ey - 0.003, rearZ));
  // front post with protective ears
  g.add(box(M, "polymer", 0.02, 0.008, 0.016, 0, ey - 0.014, frontZ));
  g.add(box(M, "polymer", 0.003, 0.014, 0.004, 0, ey - 0.004, frontZ));
  if (opt.ears !== false) for (const s of [-1, 1]) g.add(box(M, "polymer", 0.003, 0.016, 0.01, s * 0.009, ey - 0.005, frontZ));
  root.add(g);
}
function picatinny(root, M, y, z0, z1, w = 0.021) {
  const g = new THREE.Group(); g.name = "detail_rail"; const n = Math.floor((z1 - z0) / 0.01);
  g.add(box(M, "anodisedDark", w, 0.004, z1 - z0, 0, y + 0.002, (z0 + z1) / 2));
  const slot = new THREE.BoxGeometry(w + 0.002, 0.004, 0.005), inst = new THREE.InstancedMesh(slot, M.anodisedDark, Math.max(1, Math.ceil(n / 2)));
  const m4 = new THREE.Matrix4(); let k = 0; for (let i = 0; i < n; i += 2) { m4.makeTranslation(0, y + 0.006, z0 + 0.005 + i * 0.01); inst.setMatrixAt(k++, m4); } inst.count = k;
  inst.castShadow = true; g.add(inst); root.add(g);
}
function reflexSight(root, M, def, quality) {
  const A = def.anchors, ey = A.eye[1], z = A.eye[2] + 0.1, g = new THREE.Group(); g.name = "detail_reflex";
  const by = ey - 0.034; // body sits below the eye line, window centred on it
  g.add(box(M, "anodisedDark", 0.044, 0.018, 0.075, 0, by, z));
  g.add(box(M, "anodisedDark", 0.03, 0.02, 0.05, 0, by - 0.016, z)); // mount
  // hood: two side walls + top arc
  for (const s of [-1, 1]) g.add(box(M, "anodised", 0.005, 0.044, 0.055, s * 0.021, ey - 0.008, z + 0.006));
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.0235, 0.0235, 0.055, 16, 1, true, -Math.PI / 2, Math.PI), M.anodised); top.rotation.x = Math.PI / 2; top.position.set(0, ey + 0.008, z + 0.006); g.add(top);
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.038, 0.034), M.lens); lens.position.set(0, ey, z + 0.03); lens.material = M.lens.clone(); lens.material.transparent = true; lens.material.opacity = 0.35; lens.material.depthWrite = false; g.add(lens);
  const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures().dot || null, color: 0xff3020, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  dot.scale.set(0.007, 0.007, 1); dot.position.set(0, ey, z + 0.028); dot.name = "reticle"; g.add(dot);
  g.add(box(M, "anodisedDark", 0.008, 0.008, 0.008, -0.019, by + 0.004, z - 0.01)); // brightness knob
  root.add(g);
}
function addDetail(model, root, M, quality) {
  const def = Object.values(GUN_DEFS).find((d) => d.model === model);
  if (!def) return;
  const A = def.anchors, hi = quality === "high";
  if (model === "SubmachineGun_1") { ironSights(root, M, def); }
  if (model === "SubmachineGun_3") { ironSights(root, M, def); if (hi) picatinny(root, M, A.eye[1] - 0.022, A.eye[2] + 0.04, A.front[2] - 0.05, 0.018); }
  if (model === "AssaultRifle_1") { // rear leaf sight on the dust cover
    const g = new THREE.Group(); g.name = "detail_irons"; g.add(box(M, "gunmetal", 0.024, 0.012, 0.03, 0, A.eye[1] - 0.012, A.eye[2])); g.add(box(M, "gunmetal", 0.02, 0.006, 0.01, 0, A.eye[1] - 0.003, A.eye[2])); root.add(g);
    if (hi) { const sl = cyl(M, "rubber", 0.005, 0.005, 0.02, -0.02, 0.02, -0.02); root.add(sl); }
  }
  if (model === "Bullpup_1") reflexSight(root, M, def, quality);
  if (model === "Shotgun_1") { const bead = new THREE.Mesh(new THREE.SphereGeometry(0.003, 8, 6), M.brass); bead.position.set(0, A.front[1] - 0.004, A.front[2]); root.add(bead); }
  if (model === "Pistol_1" || model === "Pistol_3") { // three-dot night sights
    const dm = new THREE.MeshBasicMaterial({ color: 0xd8ff9a });
    for (const [x, z] of [[-0.006, A.eye[2]], [0.006, A.eye[2]], [0, A.front[2]]]) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.0013, 8), dm); d.position.set(x, A.eye[1] - 0.004, z - 0.004); d.rotation.y = Math.PI; root.add(d); }
  }
  if (model.startsWith("SniperRifle")) { // lens caps glow + bolt handle knob
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 8), M.steel); knob.position.set(-0.045, A.eject[1] - 0.01, A.eject[2] - 0.04); knob.name = "detail_bolt"; root.add(knob);
    const st = cyl(M, "steel", 0.003, 0.003, 0.04, -0.025, A.eject[1] - 0.006, A.eject[2] - 0.04); st.rotation.set(0, Math.PI / 2, 0); root.add(st);
  }
}

/* procedural models: grenade and launcher */
function buildProcedural(model, root, M, quality) {
  const seg = quality === "high" ? 24 : 12;
  if (model === "Grenade") {
    const prof = [[0, -0.045], [0.018, -0.044], [0.028, -0.036], [0.031, -0.02], [0.031, 0.02], [0.027, 0.034], [0.016, 0.042], [0.012, 0.05], [0.012, 0.058], [0, 0.058]].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(prof, seg), M.olive); body.castShadow = true; root.add(body);
    // rib bands
    for (const y of [-0.015, 0.005, 0.022]) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.0022, 6, seg), M.olive); t.rotation.x = Math.PI / 2; t.position.y = y; root.add(t); }
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.02, 12), M.gunmetal); fuse.position.y = 0.064; root.add(fuse);
    const spoon = box(M, "gunmetal", 0.012, 0.075, 0.004, 0, 0.032, 0.033, -0.12); spoon.name = "spoon"; root.add(spoon);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0016, 6, 16), M.brightSteel); ring.position.set(0.02, 0.066, 0); ring.rotation.y = Math.PI / 2; ring.name = "pin"; root.add(ring);
    root.position.set(0, 0, 0);
    return;
  }
  if (model === "Launcher") {
    root.add(cyl(M, "gunmetal", 0.03, 0.03, 0.42, 0, 0.07, 0.4, seg));                    // barrel
    const bore = cyl(M, "rubber", 0.022, 0.022, 0.01, 0, 0.07, 0.612, seg); root.add(bore);
    root.add(cyl(M, "polymer", 0.036, 0.036, 0.2, 0, 0.07, 0.33, seg));                   // handguard
    root.add(box(M, "anodised", 0.05, 0.07, 0.2, 0, 0.06, 0.08));                         // receiver
    root.add(box(M, "polymerGrip", 0.03, 0.11, 0.045, 0, -0.03, 0.0, -0.3));              // pistol grip
    root.add(box(M, "polymer", 0.012, 0.012, 0.05, 0, 0.012, 0.045));                     // trigger guard
    root.add(box(M, "polymerGrip", 0.03, 0.08, 0.035, 0, 0.0, 0.34, 0.1));                // foregrip
    root.add(box(M, "anodisedDark", 0.03, 0.03, 0.28, 0, 0.065, -0.16));                  // stock tube
    root.add(box(M, "rubber", 0.04, 0.11, 0.025, 0, 0.04, -0.3));                         // butt pad
    root.add(box(M, "brightSteel", 0.03, 0.05, 0.006, 0, 0.13, -0.03, 0.25));             // leaf sight
    root.add(box(M, "polymer", 0.006, 0.03, 0.008, 0, 0.12, 0.45));                       // front post
    picatinny(root, M, 0.096, 0.0, 0.16, 0.02);
    return;
  }
}

function addAnchors(root, def) {
  for (const k of ANCHOR_NAMES) {
    const a = def.anchors[k]; if (!a) continue;
    const o = new THREE.Object3D(); o.name = "anchor_" + k; o.position.set(a[0], a[1], a[2]);
    if (k === "grip") o.rotation.x = -def.anchors.gripTilt; // +Y along the grip, leaning back
    root.add(o);
  }
}

/**
 * loadGunModel(id, { quality: "high" | "low" }) -> Promise<THREE.Group>
 * id: a GUN_DEFS key (or a model file name). Results are cached; each call
 * returns a new Group sharing geometry and materials (cheap to clone).
 * The group has anchor children named "anchor_<name>" (see ANCHOR_NAMES) and
 * userData = { def, anchors: {name: Object3D}, quality }.
 */
export async function loadGunModel(id, opts = {}) {
  const quality = opts.quality === "low" ? "low" : "high";
  const def = GUN_DEFS[id] || Object.values(GUN_DEFS).find((d) => d.model === id);
  if (!def) throw new Error("loadGunModel: unknown gun " + id);
  const key = def.model + "|" + quality;
  if (!BUILT.has(key)) BUILT.set(key, buildTemplate(def.model, quality));
  const tpl = await BUILT.get(key);
  const g = tpl.clone(true); g.name = "gun_" + def.id;
  addAnchors(g, def);
  const anchors = {}; g.children.forEach((c) => { if (c.name.startsWith("anchor_")) anchors[c.name.slice(7)] = c; });
  g.userData = { def, anchors, quality };
  return g;
}

/** Preload several guns in parallel (ids default to all). */
export function preloadGuns(ids = Object.keys(GUN_DEFS), opts = {}) { return Promise.all(ids.map((i) => loadGunModel(i, opts))); }

/** World position of an anchor of a loaded gun group. */
export function anchorWorld(gun, name, target = new THREE.Vector3()) { const a = gun.userData.anchors[name]; if (!a) return null; gun.updateWorldMatrix(true, false); return a.getWorldPosition(target); }

/** World-space muzzle direction (+Z of the gun). */
export function muzzleDir(gun, target = new THREE.Vector3()) { gun.updateWorldMatrix(true, false); return target.set(0, 0, 1).transformDirection(gun.matrixWorld); }

const _e = new THREE.Euler(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
/**
 * Pose a gun as a first-person viewmodel (child of the camera).
 * state: { ads 0..1, recoil {pitch,yaw} (rad, from weapon.recoilPitch/Yaw), kick 0..1 (fresh shot), sway {x,y}, bob 0..1, t (s), reload 0..1 }
 */
export function poseViewmodel(gun, def, state = {}) {
  const V = def.viewmodel, a = smooth(state.ads || 0), hp = V.hip.pos, ap = V.ads.pos;
  const kick = state.kick || 0, rp = state.recoil ? state.recoil.pitch : 0, ry = state.recoil ? state.recoil.yaw : 0, t = state.t || 0, bob = (state.bob || 0) * (1 - a * 0.8);
  const sw = state.sway || { x: 0, y: 0 }, rl = state.reload || 0, rdip = Math.sin(Math.min(1, rl) * Math.PI);
  gun.position.set(
    lerp(hp[0], ap[0], a) + Math.sin(t * 6) * 0.012 * bob + sw.x * 0.02 * (1 - a * 0.7),
    lerp(hp[1], ap[1], a) + Math.abs(Math.cos(t * 6)) * 0.01 * bob - sw.y * 0.02 * (1 - a * 0.7) - rdip * 0.08,
    lerp(hp[2], ap[2], a) + kick * (def.pose === "pistol" ? 0.035 : 0.05) * (1 - a * 0.4));
  _e.set(lerp(V.hip.rot[0], V.ads.rot[0], a) + rp * 0.6 + kick * 0.06 + rdip * 0.5, lerp(V.hip.rot[1], V.ads.rot[1], a) - ry * 0.4 - sw.x * 0.03, lerp(V.hip.rot[2], V.ads.rot[2], a) + rdip * 0.35 - sw.x * 0.02, "XYZ");
  gun.quaternion.setFromEuler(_e);
  return gun;
}
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Attach a gun to a hand bone (third person). Positions the gun so its grip
 * anchor sits in the palm. handOffset: { pos:[x,y,z], rot:[x,y,z] } in bone space,
 * depends on the rig; defaults suit Mixamo/Quaternius-style "hand.R" bones
 * (+Y along the fingers). Returns the gun.
 */
export function attachToHand(gun, handBone, handOffset = { pos: [0.0, 0.08, 0.02], rot: [Math.PI / 2, 0, Math.PI / 2] }) {
  handBone.add(gun); gun.position.set(...handOffset.pos); gun.rotation.set(...handOffset.rot); return gun;
}

/** Free cached templates (materials stay shared; call disposeGunMaterials too to free GPU textures). */
export function disposeGunCache() {
  for (const p of BUILT.values()) p.then((g) => g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }));
  BUILT.clear(); RAW.clear();
}
export function disposeGunMaterials() { for (const q in MATS) { for (const k in MATS[q]) MATS[q][k].dispose(); delete MATS[q]; } for (const k in TEX) if (TEX[k] && TEX[k].dispose) TEX[k].dispose(); for (const k in TEX) delete TEX[k]; }

/* ---------- third person: gun placement + two-bone arm IK ---------- */
const _S = new THREE.Vector3(), _E = new THREE.Vector3(), _H = new THREE.Vector3(), _T = new THREE.Vector3(), _P = new THREE.Vector3();
const _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _eu = new THREE.Euler();

/**
 * placeThirdPerson(gun, def, opts): put a gun (child of the avatar root, or of any
 * Object3D whose +Z is the avatar's forward and +Y up, origin at the feet) in an aim pose.
 * opts: { pitch (rad, + = aim up), yaw (rad, relative to the root, + = left), lowReady 0..1,
 *         scale (avatar height / 1.8), offset [x,y,z] extra metres, recoil {pitch,yaw} rad, kick 0..1 }
 * The pivot is the shooting shoulder (def.thirdPerson.shoulderAt) or a point above the grip.
 */
export function placeThirdPerson(gun, def, o = {}) {
  const tp = def.thirdPerson, s = o.scale || 1, g = tp.gripAt, sh = tp.shoulderAt || [g[0], 1.42, 0.02];
  const lr = o.lowReady || 0, pitch = (o.pitch || 0) - lr * tp.lowReady.pitch + (o.recoil ? o.recoil.pitch * 0.5 : 0), yaw = (o.yaw || 0) + lr * tp.lowReady.yaw + (o.recoil ? o.recoil.yaw * 0.3 : 0);
  _P.set(sh[0], sh[1], sh[2]).multiplyScalar(s);
  _d1.set(g[0] - sh[0], g[1] - sh[1], g[2] - sh[2]).multiplyScalar(s);
  _eu.set(-pitch, yaw, 0, "YXZ"); _qa.setFromEuler(_eu);
  _d1.applyQuaternion(_qa);
  gun.position.copy(_P).add(_d1);
  if (o.offset) gun.position.add(_T.fromArray(o.offset));
  if (o.kick) gun.position.add(_T.set(0, 0, -0.04 * o.kick).applyQuaternion(_qa));
  gun.quaternion.copy(_qa);
  return gun;
}

/**
 * solveArmIK(upper, lower, hand, target, pole, opts) : analytic two-bone IK on an Object3D chain
 * (upper -> lower -> hand, e.g. shoulder/elbow/wrist joints or upper_arm/forearm/hand bones).
 * target, pole: world-space Vector3s (pole = where the elbow should point, e.g. below and outside).
 * opts.handQuat: optional world quaternion for the hand. Works on skinned bones too.
 * Returns the reach error in metres (0 when reachable).
 */
export function solveArmIK(upper, lower, hand, target, pole, opts = {}) {
  upper.updateWorldMatrix(true, true);
  upper.getWorldPosition(_S); lower.getWorldPosition(_E); hand.getWorldPosition(_H);
  const la = _S.distanceTo(_E), lb = _E.distanceTo(_H);
  _T.copy(target); const dist = Math.min(_T.distanceTo(_S), (la + lb) * 0.9995), err = Math.max(0, _T.distanceTo(_S) - (la + lb));
  const dir = _d1.subVectors(_T, _S).normalize();
  const cosA = clamp1((la * la + dist * dist - lb * lb) / (2 * la * dist)), sinA = Math.sqrt(1 - cosA * cosA);
  const n = _d2.copy(pole).sub(_S); n.addScaledVector(dir, -n.dot(dir)); if (n.lengthSq() < 1e-8) n.set(0, -1, 0); n.normalize();
  const Ew = new THREE.Vector3().copy(_S).addScaledVector(dir, la * cosA).addScaledVector(n, la * sinA);
  const Tw = new THREE.Vector3().copy(_S).addScaledVector(dir, dist);
  rotateBoneToward(upper, _S, _E, Ew);
  lower.updateWorldMatrix(true, true); lower.getWorldPosition(_E); hand.getWorldPosition(_H);
  rotateBoneToward(lower, _E, _H, Tw);
  if (opts.handQuat) { hand.updateWorldMatrix(true, false); hand.parent.getWorldQuaternion(_qp); hand.quaternion.copy(_qp.invert().multiply(opts.handQuat)); }
  hand.updateWorldMatrix(true, true);
  return err;
}
const clamp1 = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);
function rotateBoneToward(bone, pivot, from, to) {
  _d1.subVectors(from, pivot).normalize(); _d2.subVectors(to, pivot).normalize();
  _qa.setFromUnitVectors(_d1, _d2);                 // world-space delta
  bone.getWorldQuaternion(_qb); _qb.premultiply(_qa);  // new world rotation
  bone.parent.getWorldQuaternion(_qp); bone.quaternion.copy(_qp.invert().multiply(_qb));
  bone.updateWorldMatrix(false, true);
}

/** World-space IK targets for a held gun: { right, left, rightQuat, leftQuat, pole hints } */
export function handTargets(gun, side = { rightPole: new THREE.Vector3(), leftPole: new THREE.Vector3() }) {
  const A = gun.userData.anchors, def = gun.userData.def; gun.updateWorldMatrix(true, true);
  const right = A.grip.getWorldPosition(new THREE.Vector3());
  const left = def.pose === "throw" ? null : A.support.getWorldPosition(new THREE.Vector3());
  const gq = gun.getWorldQuaternion(new THREE.Quaternion());
  const rightQuat = A.grip.getWorldQuaternion(new THREE.Quaternion());
  // poles: elbows down and out to the side of the gun
  const down = new THREE.Vector3(0, -1, 0), outR = new THREE.Vector3(-1, 0, 0).applyQuaternion(gq), outL = new THREE.Vector3(1, 0, 0).applyQuaternion(gq);
  side.rightPole.copy(right).addScaledVector(down, 0.5).addScaledVector(outR, 0.4).addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(gq), 0.3);
  if (left) side.leftPole.copy(left).addScaledVector(down, 0.5).addScaledVector(outL, def.pose === "pistol" ? 0.4 : 0.25);
  return { right, left, rightQuat, gunQuat: gq, rightPole: side.rightPole, leftPole: side.leftPole };
}
