/* ==========================================================================
   DILLY STRIKE — world materials + architectural dressing
   * World-projected ("box mapped") PBR materials: UVs come from world position
     in the vertex shader, so textures keep a real-world scale on any box, and
     a fragment patch adds macro colour variation, skirting dirt at wall bases
     and vertical grime streaks (no tiling look, no per-mesh UV work).
   * Builders for chamfered blocks, arched frames, doors, shutters, awnings,
     sandbags, barrels, rubble, cables, plants, decals and distant skyline.
   * enhanceDustline(): restyles de_dustline's existing boxes in place (same
     colliders / raycast meshes) and adds non-colliding detail hugging walls.
   ========================================================================== */
import * as THREE from 'three';
import { mergeBufferGeometries } from '../../vendor/jsm/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import { registerEnv } from './render.js';
import { initPhotoMaterials, usePhoto, useBlend, withPhoto, crateSet, applySet } from './photomat.js';

const GLSL_NOISE = `
float wh_(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wn_(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wh_(i), wh_(i + vec2(1.0, 0.0)), f.x), mix(wh_(i + vec2(0.0, 1.0)), wh_(i + vec2(1.0, 1.0)), f.x), f.y); }
float wf_(vec2 p){ return wn_(p) * 0.5 + wn_(p * 2.03 + 7.1) * 0.3 + wn_(p * 4.1 + 3.3) * 0.2; }`;

// World-projected PBR material. opts: tile (m), dirt (0..1), dirtH (m), streak (0..1), macro (0..1), color,
// roof (1 = up-facing UVs follow the slope direction, so tile rows run along every eave)
// Per-mesh variation: each mesh's own origin hashes to a UV offset + slight tint, so neighbouring
// boxes never repeat the same texture area. Optional second "blend" layer (photomat.useBlend):
// a noise mask mixes in another photo set (albedo, normal, roughness), e.g. drifted sand on paving.
export function worldMaterial(set, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap,
    color: opts.color != null ? opts.color : 0xffffff, roughness: opts.roughness != null ? opts.roughness : 1, metalness: 0,
    normalScale: new THREE.Vector2(opts.normal || 1, opts.normal || 1)
  });
  const U = { uTile: { value: opts.tile || 3 }, uDirt: { value: opts.dirt != null ? opts.dirt : 1 }, uDirtH: { value: opts.dirtH || 0.9 }, uStreak: { value: opts.streak != null ? opts.streak : 1 }, uMacro: { value: opts.macro != null ? opts.macro : 1 }, uGround: { value: opts.ground || 0 },
    uRoof: { value: opts.roof || 0 }, uVary: { value: opts.vary != null ? opts.vary : 1 },
    uBlendMap: { value: null }, uBlendNor: { value: null }, uBlendArm: { value: null }, uBlendTile: { value: 4 }, uBlendAmt: { value: 0 }, uBlendCol: { value: new THREE.Color(1, 1, 1) } };
  m.userData.U = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTile, uRoof, uVary; varying vec3 vWP; varying vec3 vWN; varying float vVar_;')
      .replace('#include <uv_vertex>', `
        vec4 wp_ = modelMatrix * vec4(position, 1.0);
        vec3 wn_ = normalize(mat3(modelMatrix) * normal);
        vWP = wp_.xyz; vWN = wn_;
        vec3 an_ = abs(wn_);
        vec2 puv_ = an_.y > max(an_.x, an_.z) ? (uRoof > 0.5 && an_.x > an_.z ? wp_.zx : wp_.xz) : (an_.x > an_.z ? vec2(wp_.z, wp_.y) : vec2(wp_.x, wp_.y));
        vec3 org_ = modelMatrix[3].xyz;
        float h_ = fract(sin(dot(org_.xz + org_.y, vec2(12.9898, 78.233))) * 43758.5453);
        vVar_ = h_;
        #ifdef USE_UV
        vUv = puv_ / uTile + vec2(h_ * 7.31, fract(h_ * 13.7) * 3.17) * uVary;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uDirt, uDirtH, uStreak, uMacro, uGround, uVary; varying vec3 vWP; varying vec3 vWN; varying float vVar_;
        #ifdef USE_PBLEND
        uniform sampler2D uBlendMap, uBlendNor, uBlendArm; uniform float uBlendTile, uBlendAmt, uTile; uniform vec3 uBlendCol;
        #endif` + GLSL_NOISE)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float bMask_ = 0.0; vec2 bUv_ = vec2(0.0);
        {
          float vert = 1.0 - abs(vWN.y);
          float n1 = wn_(vWP.xz * 0.45 + vWP.y * 0.3);
          float mac = wn_(vWP.xz * 0.045 + vec2(vWP.y * 0.05, 0.0)) * 0.6 + wn_(vWP.zx * 0.13 + 3.1) * 0.4;
          diffuseColor.rgb *= mix(1.0, mix(0.84, 1.1, mac), uMacro);
          // per-block tint (warm/cool + value), keyed to the mesh origin
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.93 + 0.12 * vVar_, 0.94 + 0.1 * vVar_, 0.95 + 0.07 * fract(vVar_ * 7.0)), uVary);
          #ifdef USE_PBLEND
          bUv_ = vUv * uTile / uBlendTile;
          float bn_ = wf_(vWP.xz * 0.11 + 4.0) * 0.75 + wn_(vWP.xz * 0.9) * 0.25;
          bMask_ = smoothstep(0.62 - uBlendAmt * 0.45, 0.8 - uBlendAmt * 0.45, bn_) * (1.0 - vert);
          diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(uBlendMap, bUv_).rgb * uBlendCol, bMask_);
          #endif
          float h = vWP.y - uGround;
          float base = 1.0 - smoothstep(0.0, uDirtH * (0.7 + 0.6 * n1), h);
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.66, 0.6, 0.52), base * vert * uDirt);
          float st = wn_(vec2((vWP.x + vWP.z) * 1.7, vWP.y * 0.22 + 3.0)) * (0.55 + 0.45 * n1);
          diffuseColor.rgb *= 1.0 - smoothstep(0.32, 0.7, st) * vert * smoothstep(0.6, 2.5, h) * 0.22 * uStreak;
          float flo = (1.0 - vert);
          float stain = smoothstep(0.62, 0.8, wn_(vWP.xz * 0.21 + 5.0));
          diffuseColor.rgb *= 1.0 - stain * flo * 0.12 * uMacro;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        #ifdef USE_PBLEND
        roughnessFactor = mix(roughnessFactor, roughness * texture2D(uBlendArm, bUv_).g, bMask_);
        #endif`)
      .replace('#include <normal_fragment_maps>', `
        #if defined( USE_PBLEND ) && defined( TANGENTSPACE_NORMALMAP ) && ! defined( USE_TANGENT )
          vec3 mapN = texture2D( normalMap, vUv ).xyz * 2.0 - 1.0;
          mapN.xy *= normalScale;
          vec3 mapB_ = texture2D( uBlendNor, bUv_ ).xyz * 2.0 - 1.0;
          mapN = normalize( mix( mapN, mapB_, bMask_ ) );
          normal = perturbNormal2Arb( - vViewPosition, normal, mapN, faceDirection );
        #else
          #include <normal_fragment_maps>
        #endif`);
  };
  m.customProgramCacheKey = () => 'worldmat2';
  return m;
}

/* ---------------- geometry helpers ---------------- */
export function chamferBox(w, h, d, c = 0.05) {
  c = Math.min(c, w / 4, h / 4, d / 4);
  const hw = w / 2 - c, hd = d / 2 - c, s = new THREE.Shape();
  s.moveTo(-hw, -hd); s.lineTo(hw, -hd); s.lineTo(hw, hd); s.lineTo(-hw, hd); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h - 2 * c, bevelEnabled: true, bevelThickness: c, bevelSize: c, bevelSegments: 1, curveSegments: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, -(h / 2 - c), 0);
  return g;
}
export function uvScale(g, su, sv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; }
export function archShape(w, h, arch = true) {
  // opening shape centered on x, from y=0 to y=h; semicircular top if arch
  const s = new THREE.Shape(), r = w / 2;
  s.moveTo(-r, 0); s.lineTo(r, 0);
  if (arch) { s.lineTo(r, h - r); s.absarc(0, h - r, r, 0, Math.PI, false); } else { s.lineTo(r, h); s.lineTo(-r, h); }
  s.lineTo(-r, 0);
  return s;
}
// stone frame around an opening: outer = opening grown by t
export function archFrame(w, h, t, depth, arch = true) {
  const r = w / 2 + t, s = new THREE.Shape();
  s.moveTo(-r, 0); s.lineTo(r, 0);
  if (arch) { s.lineTo(r, h - w / 2); s.absarc(0, h - w / 2, r, 0, Math.PI, false); } else { s.lineTo(r, h + t); s.lineTo(-r, h + t); }
  s.lineTo(-r, 0);
  s.holes.push(archShape(w, h, arch));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1, curveSegments: 14 });
  return g;
}

// static batch: merges geometry per material to keep draw calls low
export class Batch {
  constructor(scene, shadows = true) { this.scene = scene; this.by = new Map(); this.shadows = shadows; }
  add(geo, mat, pos, rot, scl, cast = true) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const m = new THREE.Matrix4().compose(pos || new THREE.Vector3(), new THREE.Quaternion().setFromEuler(rot || new THREE.Euler()), scl || new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    const key = mat.uuid + (cast ? 'c' : 'n');
    if (!this.by.has(key)) this.by.set(key, { mat, cast, list: [] });
    this.by.get(key).list.push(g);
  }
  flush() {
    const out = [];
    for (const { mat, cast, list } of this.by.values()) {
      const merged = mergeBufferGeometries(list, false); if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = cast && this.shadows; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      this.scene.add(mesh); out.push(mesh);
      for (const g of list) g.dispose();
    }
    this.by.clear();
    return out;
  }
}

/* ---------------- material library (lazy) ---------------- */
let LIB = null;
export function materialLibrary(renderer) {
  if (LIB) return LIB;
  TX.setAniso(Math.min(4, renderer.capabilities.getMaxAnisotropy()));
  const low = (new URLSearchParams(location.search).get('q') || '') === 'low';
  TX.TEXQ.size = low ? 512 : 1024;
  const S = TX.TEXQ.size;
  const plaster = TX.plaster(3, 0xcfb48c, S), plaster2 = TX.plaster(8, 0xd7c3a0, S), stone = TX.sandstone(5, 0xc29d6e, S), pave = TX.paving(11, S);
  const trimT = TX.sandstone(17, 0xd2b386, 512);
  const L = {
    floor: worldMaterial(pave, { tile: 8.5, dirt: 0, streak: 0, macro: 1, normal: 0.9 }),
    plaster: worldMaterial(plaster, { tile: 3.2, dirt: 1, dirtH: 0.9, streak: 1, normal: 1.1 }),
    plasterLight: worldMaterial(plaster2, { tile: 3.4, dirt: 1, dirtH: 0.8, streak: 0.8, normal: 1.0 }),
    stone: worldMaterial(stone, { tile: 3.0, dirt: 1, dirtH: 1.0, streak: 1.2, normal: 1.2 }),
    trim: worldMaterial(trimT, { tile: 1.6, dirt: 0.6, streak: 0.5, normal: 1.0, color: 0xf2e6d2 }),
    plinth: worldMaterial(stone, { tile: 2.2, dirt: 1.2, dirtH: 0.5, streak: 0, normal: 1.3, color: 0xb9a184 }),
    distant: worldMaterial(plaster2, { tile: 4, dirt: 0.6, dirtH: 2, streak: 1, normal: 0.6, color: 0xe8dcc8 })
  };
  const crate = TX.crateWood(21, 0xa47a4c), crate2 = TX.crateWood(23, 0x8a6a48);
  L.crate = new THREE.MeshStandardMaterial({ map: crate.map, normalMap: crate.normalMap, roughnessMap: crate.roughnessMap, metalnessMap: crate.roughnessMap, metalness: 1, roughness: 1 });
  L.crate2 = new THREE.MeshStandardMaterial({ map: crate2.map, normalMap: crate2.normalMap, roughnessMap: crate2.roughnessMap, metalnessMap: crate2.roughnessMap, metalness: 1, roughness: 1 });
  const door = TX.paintedPlanks(31, 0x3f6f78), door2 = TX.paintedPlanks(33, 0x7a4b2e), shutter = TX.paintedPlanks(35, 0x4e7f86, 512, false, 7), wood = TX.paintedPlanks(37, 0x6b4a30, 512, true, 3);
  const pm = (t, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1, metalness: 0 }, extra));
  L.door = pm(door); L.door2 = pm(door2); L.shutter = pm(shutter); L.beam = pm(wood, { color: 0xb89a80 });
  const bl = TX.paintedMetal(41, 0x2f5878), br = TX.paintedMetal(43, 0x8a2f22), bg = TX.paintedMetal(45, 0x4b5a36);
  const mm = (t) => registerEnv(new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, metalnessMap: t.roughnessMap, roughness: 1, metalness: 1 }), 0.6);
  L.barrel = [mm(bl), mm(br), mm(bg)];
  const aw = TX.fabric(51, 0xe2d3b0, 0xa8432c, 512, 8, 90), aw2 = TX.fabric(53, 0xd9cdb2, 0x2f6b78, 512, 6, 90), bag = TX.fabric(55, 0xb59f78, null, 256, 0, 60);
  L.awning = pm(aw, { side: THREE.DoubleSide }); L.awning2 = pm(aw2, { side: THREE.DoubleSide }); L.sandbag = pm(bag, { color: 0xe8dcc8 });
  L.iron = registerEnv(new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.55, metalness: 0.8 }), 0.7);
  L.cable = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.7 });
  L.glassDark = registerEnv(new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 0.12, metalness: 0.4 }), 1.2);
  L.recess = new THREE.MeshStandardMaterial({ color: 0x2a221b, roughness: 0.95 });
  L.terracotta = new THREE.MeshStandardMaterial({ color: 0xa65a38, roughness: 0.85 });
  L.leaf = new THREE.MeshStandardMaterial({ color: 0x5f7a46, roughness: 0.7, side: THREE.DoubleSide });
  L.soil = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 });
  L.lampGlow = new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffc070, emissiveIntensity: 0.9, roughness: 0.4 });
  L.rubble = worldMaterial(stone, { tile: 0.9, dirt: 0, streak: 0, macro: 0.5 });
  LIB = L;
  photoUpgrade(L, renderer);
  return L;
}

/* photo-scanned CC0 sets (photomat.js) replace the procedural maps as they stream in;
   tile = metres per texture repeat (Poly Haven's scanned real-world size, nudged per surface) */
function photoUpgrade(L, renderer) {
  initPhotoMaterials(renderer);
  usePhoto(L.floor, 'rectangular_paving', { tile: 2.4, normal: 1.0, color: 0xf4ece0 });
  useBlend(L.floor, 'coast_sand', { tile: 5, amount: 0.38, color: 0xffe9cc });
  usePhoto(L.stone, 'large_sandstone_blocks', { tile: 3.4, normal: 1.1, color: 0xffeedd });
  usePhoto(L.plaster, 'yellow_plaster', { tile: 2.6, normal: 1.2, color: 0xeae2e2 });
  usePhoto(L.plasterLight, 'patterned_clay_plaster', { tile: 2.4, normal: 1.0, color: 0xfff2e2 });
  usePhoto(L.distant, 'patterned_clay_plaster', { tile: 4, normal: 0.6, color: 0xfff6ea });
  usePhoto(L.trim, 'sandstone_blocks', { tile: 1.8, normal: 1.0, color: 0xfff6ea });
  usePhoto(L.plinth, 'sandstone_blocks', { tile: 2.2, normal: 1.3, color: 0xc8b49a });
  usePhoto(L.rubble, 'rock_surface', { tile: 0.9, normal: 1.2, color: 0xe8d4b8 });
  usePhoto(L.door, 'blue_painted_planks', { rotation: Math.PI / 2, repeat: [1.6, 1.6] });
  usePhoto(L.shutter, 'blue_painted_planks', { normal: 1.1 });
  usePhoto(L.door2, 'weathered_brown_planks', { rotation: Math.PI / 2 });
  usePhoto(L.beam, 'weathered_brown_planks', { color: 0xe0d0c0 });
  [0x5d86b0, 0xb6503c, 0x7d915a].forEach((c, i) => usePhoto(L.barrel[i], 'rusty_metal', { metal: true, color: c, repeat: [1, 1.4] }));
  withPhoto('brown_planks', (set) => {
    const cs = crateSet(set);
    applySet(L.crate, cs, { metal: true, color: 0xffffff });
    applySet(L.crate2, cs, { metal: true, color: 0xc9b6a0 });
  });
}

/* ---------------- decals ---------------- */
function spatter(ctx, W, H, r, n, col, rmin, rmax) {
  for (let i = 0; i < n; i++) { ctx.fillStyle = col.replace('A', (0.2 + r() * 0.6).toFixed(2)); ctx.beginPath(); ctx.arc(r() * W, r() * H, rmin + r() * (rmax - rmin), 0, 7); ctx.fill(); }
}
export function siteLetterTex(letter, color = '#e8b23a') {
  const r = TX.rng(letter.charCodeAt(0) * 13);
  return TX.canvasTex(512, (x, W, H) => {
    x.clearRect(0, 0, W, H);
    // stencil letter with over-spray halo, drips and a direction arrow
    x.save(); x.translate(W / 2, H * 0.46);
    x.font = '900 300px "Barlow Condensed", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = color; x.shadowBlur = 18; x.fillStyle = color; x.globalAlpha = 0.9; x.fillText(letter, 0, 0);
    x.shadowBlur = 0; x.globalAlpha = 1; x.fillText(letter, 0, 0);
    // stencil bridges
    x.globalCompositeOperation = 'destination-out'; x.fillRect(-120, -14, 240, 9); x.globalCompositeOperation = 'source-over';
    x.restore();
    x.fillStyle = color;
    for (let i = 0; i < 9; i++) { const dx = W * 0.3 + r() * W * 0.4, y0 = H * 0.6 + r() * H * 0.1, len = 20 + r() * 70; x.globalAlpha = 0.8; x.fillRect(dx, y0, 3 + r() * 3, len); x.beginPath(); x.arc(dx + 2.5, y0 + len, 3.5, 0, 7); x.fill(); }
    x.globalAlpha = 0.9; x.beginPath(); x.moveTo(W * 0.3, H * 0.86); x.lineTo(W * 0.62, H * 0.86); x.lineTo(W * 0.62, H * 0.82); x.lineTo(W * 0.72, H * 0.88); x.lineTo(W * 0.62, H * 0.94); x.lineTo(W * 0.62, H * 0.9); x.lineTo(W * 0.3, H * 0.9); x.closePath(); x.fill();
    // weathering: knock paint out with noise
    const id = x.getImageData(0, 0, W, H), d = id.data, N = new TX.Noise(5);
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) { const o = (y * W + xx) * 4; const n = N.fbm(xx / W, y / H, 12, 3) * 0.7 + Math.random() * 0.3; d[o + 3] *= n > 0.62 ? 0.25 : n > 0.5 ? 0.75 : 1; }
    x.putImageData(id, 0, 0);
  });
}
function grimeTex(seed) {
  const r = TX.rng(seed);
  return TX.canvasTex(256, (x, W, H) => {
    for (let i = 0; i < 26; i++) { const cx = r() * W, w = 6 + r() * 22, len = H * (0.3 + r() * 0.7); const g = x.createLinearGradient(0, 0, 0, len); g.addColorStop(0, `rgba(48,38,28,${0.35 + r() * 0.3})`); g.addColorStop(1, 'rgba(48,38,28,0)'); x.fillStyle = g; x.fillRect(cx - w / 2, 0, w, len); }
    const id = x.getImageData(0, 0, W, H), d = id.data; for (let i = 0; i < d.length; i += 4) { const e = Math.min(1, Math.min(i / 4 % W, W - i / 4 % W) / 30); d[i + 3] *= e; } x.putImageData(id, 0, 0);
  });
}
function stainTex(seed, col = '40,32,24') {
  const r = TX.rng(seed);
  return TX.canvasTex(256, (x, W, H) => {
    for (let i = 0; i < 14; i++) { const cx = W / 2 + (r() - 0.5) * W * 0.4, cy = H / 2 + (r() - 0.5) * H * 0.4, rad = 20 + r() * 70; const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad); g.addColorStop(0, `rgba(${col},${0.2 + r() * 0.25})`); g.addColorStop(1, `rgba(${col},0)`); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rad, 0, 7); x.fill(); }
  });
}
function crackTex(seed) {
  const r = TX.rng(seed);
  return TX.canvasTex(256, (x, W, H) => {
    x.strokeStyle = 'rgba(40,30,22,0.85)'; x.lineCap = 'round';
    const branch = (px, py, a, len, w) => { if (len < 6 || w < 0.4) return; x.lineWidth = w; x.beginPath(); x.moveTo(px, py); let cx = px, cy = py; for (let i = 0; i < 6; i++) { a += (r() - 0.5) * 0.8; cx += Math.cos(a) * len / 6; cy += Math.sin(a) * len / 6; x.lineTo(cx, cy); if (r() < 0.25) branch(cx, cy, a + (r() - 0.5) * 1.6, len * 0.5, w * 0.6); } x.stroke(); };
    branch(W / 2, H * 0.1, Math.PI / 2 + (r() - 0.5) * 0.5, H * 0.8, 2.4);
  });
}
function sandDriftTex() {
  const N = new TX.Noise(77);
  return TX.canvasTex(256, (x, W, H) => {
    const id = x.createImageData(W, H), d = id.data;
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
      const o = (y * W + xx) * 4, v = y / H, n = N.fbm(xx / W, v, 8, 4);
      const edge = Math.min(1, Math.min(xx, W - xx) / (W * 0.12));
      const a = Math.max(0, Math.min(1, (1 - v) * 1.6 - 0.25 + (n - 0.5) * 0.9)) * edge;
      d[o] = 196 + n * 30; d[o + 1] = 168 + n * 26; d[o + 2] = 122 + n * 20; d[o + 3] = a * 235;
    }
    x.putImageData(id, 0, 0);
  });
}
export function decalMat(map, opts = {}) {
  return new THREE.MeshStandardMaterial(Object.assign({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.95, metalness: 0 }, opts));
}

/* ---------------- props ---------------- */
function barrelGeo() {
  const pts = [], R = 0.42, H = 1.25;
  const prof = [[0, 0], [R - 0.03, 0], [R, 0.02], [R, 0.18], [R + 0.018, 0.2], [R + 0.018, 0.23], [R, 0.25], [R, 0.6], [R + 0.018, 0.62], [R + 0.018, 0.65], [R, 0.67], [R, 1.0], [R + 0.018, 1.02], [R + 0.018, 1.05], [R, 1.07], [R, H - 0.02], [R - 0.03, H], [R - 0.05, H - 0.015], [0, H - 0.015]];
  for (const [x, y] of prof) pts.push(new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 28); g.translate(0, -H / 2, 0);
  return uvScale(g, 3, 1);
}
function sandbagGeo() { const g = new THREE.SphereGeometry(0.5, 12, 8); g.scale(0.6, 0.17, 0.3); return g; }
function potGeo() {
  const pts = [[0, 0], [0.17, 0], [0.2, 0.05], [0.25, 0.32], [0.29, 0.38], [0.3, 0.42], [0.27, 0.43], [0.24, 0.4], [0, 0.4]].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 18);
}

/* ---------------- dressing for one map ---------------- */
export function enhanceDustline({ scene, mapMeshes, mats, renderer }) {
  const L = materialLibrary(renderer);
  const B = new Batch(scene);
  const V = (x, y, z) => new THREE.Vector3(x, y, z), E = (x, y, z) => new THREE.Euler(x, y, z);
  const r = TX.rng(2024);
  const walls = [];

  // 1) restyle the existing boxes (same transform/bounds => same colliders & raycasts)
  for (const m of mapMeshes) {
    const p = m.geometry.parameters || {}; const w = p.width, h = p.height, d = p.depth;
    if (m.material === mats.MAT_SAND) { m.material = L.floor; m.receiveShadow = true; continue; }
    if (m.material === mats.MAT_WALL || m.material === mats.MAT_WALL_DARK) {
      const perim = h >= 8.5, tall = h > 1.2;
      m.geometry.dispose(); m.geometry = chamferBox(w, h, d, perim ? 0.06 : 0.07);
      m.material = perim ? L.stone : (m.material === mats.MAT_WALL ? L.plaster : L.plasterLight);
      walls.push({ m, w, h, d, perim, lintel: !tall || m.position.y > 5 });
      continue;
    }
    if (m.material === mats.MAT_CRATE) {
      m.geometry.dispose(); m.geometry = new THREE.BoxGeometry(w, h, d);
      m.material = (Math.round(m.position.x + m.position.z) % 2) ? L.crate : L.crate2;
      // iron corner caps
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        const cp = V(m.position.x + sx * (w / 2 - 0.05), m.position.y + sy * (h / 2 - 0.05), m.position.z + sz * (d / 2 - 0.05));
        B.add(new THREE.BoxGeometry(0.13, 0.13, 0.13), L.iron, cp);
      }
      continue;
    }
    if (m.material === mats.MAT_DOOR) { midGate(m, w, h, d); continue; }
  }

  // 2) wall trims: cornice + plinth, perimeter windows/doors/awnings
  for (const W of walls) {
    const { m, w, h, d, perim } = W, x = m.position.x, y = m.position.y, z = m.position.z, top = y + h / 2;
    if (W.lintel && !perim && h < 2) { lintelDress(m, w, h, d); continue; }
    B.add(chamferBox(w + 0.22, 0.16, d + 0.22, 0.03), L.trim, V(x, top + 0.08, z));
    B.add(chamferBox(w + 0.1, 0.1, d + 0.1, 0.02), L.trim, V(x, top - 0.12, z));
    if (top < 8) B.add(chamferBox(w - 0.2 > 0.3 ? w - 0.3 : w, 0.22, d - 0.3 > 0.3 ? d - 0.3 : d, 0.04), L.trim, V(x, top + 0.27, z)); // capstone
    B.add(chamferBox(w + 0.1, 0.34, d + 0.1, 0.03), L.plinth, V(x, 0.17, z));
    if (perim) perimeterDress(m, w, h, d);
  }

  // 3) props: barrels, sprays (painted stencils), sandbags, rubble, plants, cables, decals
  const sprays = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material === mats.MAT_BARREL) barrelSwap(o);
    else if (o.geometry && o.geometry.type === 'PlaneGeometry' && o.geometry.parameters.width === 3.4 && o.material.map) sprays.push(o);
  });
  for (const s of sprays) {
    const letter = s.position.z < 0 ? 'A' : 'B';
    s.material.map && s.material.map.dispose();
    s.material = decalMat(siteLetterTex(letter, letter === 'A' ? '#e9b33c' : '#e9b33c'), { roughness: 0.7 });
    s.scale.setScalar(s.position.y < 0.1 ? 1.25 : 1.0);
    s.receiveShadow = true;
  }
  // barrel clusters against walls
  for (const [bx, bz, n] of [[-35.9, -25.8, 3], [35.8, 25.8, 2], [-35.8, 25.6, 2], [12.4, -16.6, 1], [-13, 16.6, 1]]) {
    for (let i = 0; i < n; i++) {
      const bm = new THREE.Mesh(BARREL_GEO(), L.barrel[(i + Math.abs(bx | 0)) % 3]);
      bm.position.set(bx + (i % 2) * 0.86 * Math.sign(-bx || 1), 0.625, bz + Math.floor(i / 2) * 0.86 * Math.sign(-bz || 1));
      bm.rotation.y = r() * 6; bm.castShadow = bm.receiveShadow = true; scene.add(bm);
    }
  }
  // sandbag walls at the spawn barriers + site edges
  const bagG = sandbagGeo();
  const bagRow = (x0, z0, len, dirX, rows, face) => {
    for (let row = 0; row < rows; row++) {
      const n = Math.floor(len / 0.58);
      for (let i = 0; i < n; i++) {
        const t = (i + (row % 2) * 0.5) * 0.58; if (t > len - 0.2) continue;
        B.add(bagG, L.sandbag, V(x0 + (dirX ? t : 0) + face[0] * row * 0.03, 0.085 + row * 0.16, z0 + (dirX ? 0 : t) + face[1] * row * 0.03), E((r() - 0.5) * 0.08, (dirX ? 0 : Math.PI / 2) + (r() - 0.5) * 0.15, (r() - 0.5) * 0.08));
      }
    }
  };
  bagRow(-28.9 - 0.32, -5.6, 11.2, false, 3, [1, 0]); bagRow(28.9 + 0.32, -5.6, 11.2, false, 3, [-1, 0]);
  bagRow(0.3, -16.75, 3.6, true, 2, [0, -1]); bagRow(-7.7, 16.75, 3.6, true, 2, [0, 1]);
  // rubble along wall bases and corners
  const rockG = new THREE.IcosahedronGeometry(1, 0);
  const rubbleAt = (x, z, spread, n) => { for (let i = 0; i < n; i++) { const s = 0.05 + r() * 0.16; B.add(rockG, L.rubble, V(x + (r() - 0.5) * spread, s * 0.4, z + (r() - 0.5) * spread), E(r() * 6, r() * 6, r() * 6), V(s * (0.8 + r() * 0.6), s * 0.7, s * (0.8 + r() * 0.6))); } };
  for (const [x, z] of [[-36.6, -26.6], [36.6, -26.6], [-36.6, 26.6], [36.6, 26.6], [-11.4, -18.6], [11.4, 18.6], [-11.5, -1.3], [11.5, 1.3], [8.3, -17.4], [-8.3, 17.4], [3.5, -1.5], [-3.5, 1.5], [27.2, 6.3], [-27.2, -6.3]]) rubbleAt(x, z, 1.1, 14);
  // potted agaves along the perimeter
  const pot = potGeo(), leafG = new THREE.ConeGeometry(0.05, 0.75, 4, 1); leafG.translate(0, 0.37, 0); leafG.scale(1, 1, 0.35);
  for (const [px, pz] of [[-36.4, -12], [-36.4, 12], [36.4, -14], [36.4, 10], [-20, -26.5], [22, 26.5], [-24, 26.5], [16, -26.5]]) {
    B.add(pot, L.terracotta, V(px, 0, pz)); B.add(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 14), L.soil, V(px, 0.39, pz));
    for (let i = 0; i < 13; i++) { const a = i / 13 * Math.PI * 2 + r(), tilt = 0.35 + r() * 0.6; B.add(leafG, L.leaf, V(px, 0.38, pz), E(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt), V(1, 0.7 + r() * 0.5, 1)); }
  }
  // overhead cables (catenaries between the perimeter walls)
  for (const [a, b] of [[V(-37, 8.2, -14), V(-10, 6.2, -8)], [V(37, 8.0, 12), V(10, 6.2, 9)], [V(-20, 8.6, -27), V(-20, 8.4, 27)], [V(-37, 7.6, 20), V(37, 7.9, 22)]]) {
    const mid = a.clone().lerp(b, 0.5); mid.y -= a.distanceTo(b) * 0.05;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    B.add(new THREE.TubeGeometry(curve, 40, 0.018, 5, false), L.cable, V(0, 0, 0), null, null, false);
  }
  B.flush();

  // decals: grime streaks, cracks, floor stains, sand drifts
  const grimeM = [decalMat(grimeTex(1)), decalMat(grimeTex(2))], crackM = decalMat(crackTex(3)), stainM = decalMat(stainTex(4)), oilM = decalMat(stainTex(5, '22,20,18')), sandM = decalMat(sandDriftTex(), { roughness: 1 });
  const DB = new Batch(scene, false);
  const decal = (mat, w, h, x, y, z, ry, rx = 0) => DB.add(new THREE.PlaneGeometry(w, h), mat, V(x, y, z), new THREE.Euler(rx, ry, 0, 'YXZ'), null, false);
  for (const W of walls) {
    const { m, w, h, d, perim } = W; if (W.lintel && !perim && h < 2) continue;
    const x = m.position.x, z = m.position.z, top = m.position.y + h / 2;
    const faces = w > d ? [[0, d / 2 + 0.012, 0], [Math.PI, -d / 2 - 0.012, 0]] : [[Math.PI / 2, w / 2 + 0.012, 1], [-Math.PI / 2, -w / 2 - 0.012, 1]];
    for (const [ry, off, ax] of faces) {
      const span = ax ? d : w, n = Math.max(1, Math.round(span / 6));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.2 + r() * 0.6) / n - 0.5, gw = 1.2 + r() * 2.2, gh = Math.min(top - 0.4, 1.4 + r() * 2.8);
        const px = ax ? x + off : x + t * span, pz = ax ? z + t * span : z + off;
        decal(grimeM[i % 2], gw, gh, px, top - 0.25 - gh / 2, pz, ry);
        if (r() < 0.45) decal(crackM, 0.9 + r(), 1.2 + r(), ax ? x + off * 1.0005 : x + (t + 0.1) * span, 0.8 + r() * (top - 2), ax ? z + (t + 0.1) * span : z + off * 1.0005, ry);
        // sand drift along the base
        const sw = Math.min(span * 0.9, 3 + r() * 4), sx = ax ? x + off + Math.sign(off) * 0.45 : x + t * span, sz = ax ? z + t * span : z + off + Math.sign(off) * 0.45;
        decal(sandM, sw, 1.0, sx, 0.012, sz, ry, -Math.PI / 2);
      }
    }
  }
  for (let i = 0; i < 16; i++) decal(i % 3 ? stainM : oilM, 1.5 + r() * 2.5, 1.5 + r() * 2.5, (r() - 0.5) * 70, 0.008 + i * 0.0005, (r() - 0.5) * 50, r() * 6, -Math.PI / 2);
  for (const m of DB.flush()) m.renderOrder = 1;

  // 4) distant skyline beyond the perimeter (no collision)
  skyline();

  /* ----- local builders ----- */
  function barrelSwap(o) {
    o.geometry.dispose(); o.geometry = BARREL_GEO(); o.material = L.barrel[Math.floor(r() * 3)];
    o.rotation.y = r() * 6;
  }
  function midGate(m, w, h, d) {
    m.geometry.dispose(); m.geometry = chamferBox(w, h, d, 0.06); m.material = L.stone;
    const x = m.position.x, z = m.position.z;
    const dw = 3.6, dh = 4.2;
    for (const s of [1, -1]) {
      const fz = z + s * (d / 2);
      // arched stone frame
      const fr = archFrame(dw, dh, 0.38, 0.16); const q = new THREE.Quaternion().setFromEuler(E(0, s > 0 ? 0 : Math.PI, 0));
      const fm = new THREE.Mesh(fr, L.trim); fm.position.set(x, 0, fz - s * 0.02); fm.quaternion.copy(q); fm.castShadow = fm.receiveShadow = true; scene.add(fm);
      // recessed dark reveal + two door leaves
      const rec = new THREE.Mesh(new THREE.ShapeGeometry(archShape(dw, dh)), L.recess); rec.position.set(x, 0, fz - s * 0.15 + s * 0.001); rec.quaternion.copy(q); scene.add(rec);
      for (const side of [-1, 1]) {
        const leafS = new THREE.Shape(); const lw = dw / 2 - 0.02;
        // each leaf: rect + quarter of the arch
        leafS.moveTo(0, 0); leafS.lineTo(side * lw, 0); leafS.lineTo(side * lw, dh - dw / 2);
        const pts = []; for (let k = 0; k <= 10; k++) { const a = side > 0 ? (k / 10) * Math.PI / 2 : Math.PI - (k / 10) * Math.PI / 2; pts.push([Math.cos(a) * (dw / 2 - 0.02), dh - dw / 2 + Math.sin(a) * (dw / 2 - 0.02)]); }
        for (const [px, py] of pts) leafS.lineTo(px, py);
        leafS.lineTo(0, dh - 0.02); leafS.lineTo(0, 0);
        const lg = new THREE.ExtrudeGeometry(leafS, { depth: 0.09, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1, curveSegments: 8 });
        uvScale(lg, 1 / lw * 0.5, 1 / dh);
        const lm = new THREE.Mesh(lg, L.door); lm.position.set(x + side * 0.01, 0, fz - s * 0.13); lm.quaternion.copy(q); lm.castShadow = lm.receiveShadow = true; scene.add(lm);
        // iron straps + studs + ring handle
        for (const sy of [0.7, 2.0, 3.2]) B.add(new THREE.BoxGeometry(lw * 0.92, 0.07, 0.025), L.iron, V(x + side * lw * 0.48 * (s > 0 ? 1 : 1), sy, fz - s * 0.025), E(0, s > 0 ? 0 : Math.PI, 0));
        const ring = new THREE.TorusGeometry(0.09, 0.012, 6, 16);
        B.add(ring, L.iron, V(x + side * 0.28, 1.4, fz - s * 0.01), E(0, s > 0 ? 0 : Math.PI, 0));
      }
      // keystone + lamp
      B.add(chamferBox(0.42, 0.55, 0.3, 0.03), L.trim, V(x, dh + 0.18, fz + s * 0.04));
      lamp(x + 2.6, 3.4, fz + s * 0.2, s);
      lamp(x - 2.6, 3.4, fz + s * 0.2, s);
    }
    // cornice for the gatehouse
    B.add(chamferBox(w + 0.26, 0.18, d + 0.26, 0.03), L.trim, V(x, h + 0.09, z));
    B.add(chamferBox(w + 0.12, 0.34, d + 0.12, 0.03), L.plinth, V(x, 0.17, z));
  }
  function lamp(x, y, z, s) {
    B.add(new THREE.BoxGeometry(0.05, 0.05, 0.36), L.iron, V(x, y + 0.42, z - s * 0.02));
    B.add(new THREE.CylinderGeometry(0.09, 0.11, 0.07, 8), L.iron, V(x, y + 0.36, z + s * 0.12));
    B.add(new THREE.CylinderGeometry(0.075, 0.07, 0.22, 8), L.lampGlow, V(x, y + 0.2, z + s * 0.12), null, null, false);
    B.add(new THREE.CylinderGeometry(0.1, 0.08, 0.05, 8), L.iron, V(x, y + 0.07, z + s * 0.12));
  }
  function lintelDress(m, w, h, d) {
    const x = m.position.x, y = m.position.y, z = m.position.z, bot = y - h / 2;
    // timber joists under the overhang + corbels at the wall end + parapet
    const nb = Math.floor(d / 1.1);
    for (let i = 0; i <= nb; i++) B.add(new THREE.BoxGeometry(w + 0.3, 0.16, 0.18), L.beam, V(x, bot - 0.08, z - d / 2 + 0.3 + i * (d - 0.6) / nb));
    for (const s of [-1, 1]) B.add(new THREE.BoxGeometry(0.16, 0.2, d + 0.1), L.beam, V(x + s * (w / 2 + 0.05), bot - 0.12, z));
    B.add(chamferBox(w + 0.18, 0.14, d + 0.18, 0.03), L.trim, V(x, y + h / 2 + 0.07, z));
    for (const s of [-1, 1]) B.add(chamferBox(0.22, 0.6, d, 0.03), L.plasterLight, V(x + s * (w / 2 - 0.11), y + h / 2 + 0.44, z));
  }
  function perimeterDress(m, w, h, d) {
    const x = m.position.x, z = m.position.z, alongX = w > d;
    const inward = alongX ? -Math.sign(z) : -Math.sign(x); // unit normal pointing into the arena
    const faceOff = (alongX ? d : w) / 2;
    const span = alongX ? w : d;
    const ry = alongX ? (inward > 0 ? 0 : Math.PI) : (inward > 0 ? Math.PI / 2 : -Math.PI / 2);
    const P = (t, y, o) => alongX ? V(x + t, y, z + inward * (faceOff + o)) : V(x + inward * (faceOff + o), y, z + t);
    const Q = E(0, ry, 0);
    const windows = []; for (let t = -span / 2 + 5; t < span / 2 - 4; t += 7.5 + r() * 3) windows.push(t);
    let k = 0;
    for (const t of windows) {
      k++;
      const isDoor = k % 3 === 2;
      if (isDoor) {
        const dw = 1.5, dh = 2.5;
        const f = archFrame(dw, dh, 0.28, 0.12, true); B.add(f, L.trim, P(t, 0, -0.02), Q);
        B.add(new THREE.ShapeGeometry(archShape(dw, dh)), L.recess, P(t, 0, -0.06), Q, null, false);
        const lg = new THREE.ExtrudeGeometry(archShape(dw - 0.06, dh - 0.03), { depth: 0.06, bevelEnabled: false, curveSegments: 10 }); uvScale(lg, 1 / dw, 1 / dh);
        B.add(lg, k % 2 ? L.door : L.door2, P(t, 0, -0.1), Q);
        B.add(new THREE.BoxGeometry(dw + 0.8, 0.12, 0.5), L.plinth, P(t, 0.06, 0.25), Q); // step
        // awning above the door
        awning(P(t, dh + 0.75, 0), Q, dw + 1.2, k % 2 ? L.awning : L.awning2);
        lamp(alongX ? x + t + (dw / 2 + 0.6) : x + inward * faceOff, 2.6, alongX ? z + inward * faceOff : z + t + (dw / 2 + 0.6), 0);
      } else {
        const ww = 1.1, wh = 1.5, wy = 3.4 + (k % 2) * 2.4;
        B.add(archFrame(ww, wh, 0.18, 0.1, k % 4 === 1), L.trim, P(t, wy, -0.02), Q);
        B.add(new THREE.ShapeGeometry(archShape(ww, wh, k % 4 === 1)), L.glassDark, P(t, wy, -0.05), Q, null, false);
        // iron grille bars
        for (let b = -2; b <= 2; b++) B.add(new THREE.CylinderGeometry(0.012, 0.012, wh - 0.05, 5), L.iron, P(t + b * ww / 6 * (alongX ? 1 : 1), wy + wh / 2, 0.0), Q, null, false);
        // sill
        B.add(chamferBox(ww + 0.5, 0.1, 0.32, 0.02), L.trim, P(t, wy - 0.05, 0.1), Q);
        // open shutters, hinged at both sides
        if (k % 4 !== 1) for (const s of [-1, 1]) {
          const sg = new THREE.BoxGeometry(ww / 2 + 0.06, wh + 0.05, 0.04);
          const off = alongX ? V(s * (ww / 2 + 0.36), 0, 0) : V(0, 0, s * (ww / 2 + 0.36));
          B.add(sg, L.shutter, P(t, wy + wh / 2, 0.08).add(off), E(0, ry + s * 0.25, 0));
        }
      }
    }
    // stone string course
    B.add(new THREE.BoxGeometry(alongX ? span : 0.18, 0.16, alongX ? 0.18 : span), L.trim, P(0, 3.0, 0.04));
  }
  function awning(pos, Q, width, mat) {
    const depth = 1.1, g = new THREE.PlaneGeometry(width, depth, 8, 4);
    const pa = g.attributes.position; for (let i = 0; i < pa.count; i++) { const u = pa.getX(i) / width, v = pa.getY(i) / depth + 0.5; pa.setZ(i, Math.sin(v * Math.PI) * 0.05 + Math.cos(u * Math.PI * 8) * 0.012); }
    g.computeVertexNormals();
    // tilt: hinge at wall, slope down outward
    const m = new THREE.Matrix4().makeRotationX(-Math.PI / 2 + 0.38); g.applyMatrix4(m); g.translate(0, -Math.sin(0.38) * depth / 2, depth / 2 * Math.cos(0.38));
    B.add(g, mat, pos.clone(), new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromEuler(Q)));
    for (const s of [-1, 1]) {
      const rod = new THREE.CylinderGeometry(0.012, 0.012, 1.2, 5); rod.rotateX(Math.PI / 2 - 0.6); rod.translate(s * width / 2, -0.35, 0.5);
      B.add(rod, L.iron, pos.clone(), new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromEuler(Q)), null, false);
    }
  }
  function skyline() {
    const blocks = [];
    for (let i = 0; i < 26; i++) {
      const side = i % 4, t = (r() - 0.5) * (side < 2 ? 100 : 76);
      const w = 6 + r() * 10, d = 6 + r() * 8, h = 10 + r() * 9;
      let x, z;
      if (side === 0) { x = t; z = -34 - d / 2 - r() * 8; } else if (side === 1) { x = t; z = 34 + d / 2 + r() * 8; } else if (side === 2) { x = -44 - w / 2 - r() * 8; z = t; } else { x = 44 + w / 2 + r() * 8; z = t; }
      blocks.push([x, z, w, d, h]);
      B.add(chamferBox(w, h, d, 0.08), L.distant, V(x, h / 2, z), null, null, false);
      B.add(chamferBox(w + 0.3, 0.25, d + 0.3, 0.04), L.trim, V(x, h + 0.12, z), null, null, false);
      if (r() < 0.25) { const dome = new THREE.SphereGeometry(Math.min(w, d) * 0.32, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); B.add(dome, L.plasterLight, V(x, h + 0.25, z), null, null, false); }
      if (r() < 0.2) B.add(new THREE.CylinderGeometry(0.9, 1.1, 7, 12), L.plasterLight, V(x + w * 0.3, h + 3.5, z), null, null, false);
    }
    B.flush();
  }
}

let _bg = null;
function BARREL_GEO() { return _bg || (_bg = barrelGeo()); }
