/* =====================================================================
   dgm/gunfx.js : pooled, instanced weapon effects for Dilly Gone Mad.
   - muzzle flash (front star + side petals) + a light descriptor
   - tracers (instanced additive streaks)
   - shell casings / dropped magazines / glass shards / wood chips /
     concrete chunks (instanced rigid bits with simple physics & bounce)
   - impact decals per surface material (one instanced mesh, ring buffer, fade)
   - particles: sparks, dust, smoke, chips, cloth puffs, splashes (two
     instanced billboard batches: additive + alpha), velocity-stretched
   - explosions (stun grenade: flash + smoke, no gore)
   - camera shake / recoil helper, crosshair + hit-marker + scope DOM helpers
   Draw calls when everything is active: ~12. No gore: impacts on people
   make a small grey cloth puff; set opts.bloodPuffs to get light red puffs.
   ===================================================================== */
import * as THREE from "three";

const rand = (a, b) => a + Math.random() * (b - a);
/* accept THREE.Vector3 or plain {x,y,z} everywhere */
const toV = (o) => (o && o.isVector3 ? o.clone() : new THREE.Vector3(o.x, o.y, o.z));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------- textures ---------- */
function cnv(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; }
/* particle atlas 4x4 (each 64px): 0 soft dot, 1 smoke, 2 spark, 3 flash star, 4 petal flame, 5 dust, 6 chunk, 7 ring, 8 flare */
function particleAtlas() {
  const S = 64, [c, x] = cnv(S * 4, S * 4);
  const cell = (i, fn) => { x.save(); x.translate((i % 4) * S, Math.floor(i / 4) * S); fn(); x.restore(); };
  const radial = (r0, stops) => { const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, r0); stops.forEach(([o, c2]) => g.addColorStop(o, c2)); return g; };
  cell(0, () => { x.fillStyle = radial(S / 2, [[0, "rgba(255,255,255,1)"], [0.4, "rgba(255,255,255,.5)"], [1, "rgba(255,255,255,0)"]]); x.fillRect(0, 0, S, S); });
  cell(1, () => { for (let i = 0; i < 26; i++) { const px = S / 2 + rand(-12, 12), py = S / 2 + rand(-12, 12), r = rand(8, 18); const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, "rgba(255,255,255,.22)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, S, S); } });
  cell(2, () => { const g = x.createLinearGradient(0, 0, 0, S); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(S / 2 - 5, 0, 10, S); x.fillStyle = radial(10, [[0, "rgba(255,255,255,1)"], [1, "rgba(255,255,255,0)"]]); x.fillRect(0, 0, S, S); });
  cell(3, () => { x.translate(S / 2, S / 2); for (let i = 0; i < 6; i++) { x.rotate(Math.PI / 3 + rand(-0.15, 0.15)); const g = x.createLinearGradient(0, 0, S / 2, 0); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.beginPath(); x.moveTo(0, -4); x.lineTo(S / 2 * rand(0.7, 1), 0); x.lineTo(0, 4); x.fill(); } x.fillStyle = radial(S / 4, [[0, "rgba(255,255,255,1)"], [1, "rgba(255,255,255,0)"]]); x.setTransform(1, 0, 0, 1, (3 % 4) * S, 0); x.fillRect(0, 0, S, S); });
  cell(4, () => { for (let i = 0; i < 5; i++) { const g = x.createRadialGradient(S / 2, S - 6 - i * 10, 0, S / 2, S - 6 - i * 10, 14 - i * 2); g.addColorStop(0, "rgba(255,255,255,.9)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, S, S); } });
  cell(5, () => { for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(255,255,255,${rand(0.05, 0.25)})`; x.beginPath(); x.arc(S / 2 + rand(-20, 20) * Math.random(), S / 2 + rand(-20, 20) * Math.random(), rand(1, 5), 0, 7); x.fill(); } });
  cell(6, () => { x.fillStyle = "#fff"; x.beginPath(); x.moveTo(20, 14); x.lineTo(46, 20); x.lineTo(50, 44); x.lineTo(24, 50); x.lineTo(14, 32); x.fill(); });
  cell(7, () => { x.strokeStyle = "rgba(255,255,255,.8)"; x.lineWidth = 5; x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 6, 0, 7); x.stroke(); });
  cell(8, () => { x.fillStyle = radial(S / 2, [[0, "rgba(255,255,255,1)"], [0.1, "rgba(255,255,255,.8)"], [0.3, "rgba(255,255,255,.15)"], [1, "rgba(255,255,255,0)"]]); x.fillRect(0, 0, S, S); });
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
/* decal atlas 4x2 (128px): 0 concrete, 1 metal, 2 wood, 3 glass crack, 4 plaster, 5 scorch, 6 dirt, 7 plastic/rubber */
export const DECAL_SIZE = { concrete: 0.11, metal: 0.08, wood: 0.12, glass: 0.32, plaster: 0.12, scorch: 2, dirt: 0.16, plastic: 0.08, rubber: 0.08 };
export const DECAL_TILES = { concrete: 0, metal: 1, wood: 2, glass: 3, plaster: 4, scorch: 5, dirt: 6, plastic: 7, rubber: 7 };
function decalAtlas() {
  const S = 128, [c, x] = cnv(S * 4, S * 2);
  const cell = (i, fn) => { x.save(); x.translate((i % 4) * S, Math.floor(i / 4) * S); x.beginPath(); x.rect(0, 0, S, S); x.clip(); fn(S / 2); x.restore(); };
  const hole = (h, rim, rimA, chips) => {
    for (let i = 0; i < chips; i++) { const a = rand(0, 7), r = rand(10, 34); x.fillStyle = `rgba(${rim},${rimA * rand(0.3, 1)})`; x.beginPath(); x.ellipse(S / 2 + Math.cos(a) * r * 0.5, S / 2 + Math.sin(a) * r * 0.5, rand(3, 10), rand(2, 6), a, 0, 7); x.fill(); }
    const g = x.createRadialGradient(64, 64, 0, 64, 64, h * 2.2); g.addColorStop(0, "rgba(8,8,8,1)"); g.addColorStop(0.45, "rgba(20,18,16,.95)"); g.addColorStop(0.7, "rgba(60,55,50,.5)"); g.addColorStop(1, "rgba(60,55,50,0)"); x.fillStyle = g; x.beginPath(); x.arc(64, 64, h * 2.2, 0, 7); x.fill();
  };
  cell(0, () => hole(12, "215,210,200", 0.6, 34));
  cell(1, () => { const g = x.createRadialGradient(64, 64, 6, 64, 64, 28); g.addColorStop(0, "rgba(240,240,245,.9)"); g.addColorStop(0.5, "rgba(180,180,190,.5)"); g.addColorStop(1, "rgba(80,80,90,0)"); x.fillStyle = g; x.beginPath(); x.arc(64, 64, 28, 0, 7); x.fill(); x.fillStyle = "rgba(10,10,12,1)"; x.beginPath(); x.arc(64, 64, 7, 0, 7); x.fill(); x.strokeStyle = "rgba(255,255,255,.7)"; x.lineWidth = 2; x.beginPath(); x.arc(64, 64, 9, 0, 7); x.stroke(); });
  cell(2, () => { for (let i = 0; i < 14; i++) { const a = rand(-0.4, 0.4) + (i % 2) * Math.PI; x.strokeStyle = `rgba(225,190,140,${rand(0.4, 0.8)})`; x.lineWidth = rand(2, 5); x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(a) * rand(14, 40), 64 + Math.sin(a) * rand(4, 14)); x.stroke(); } hole(7, "60,40,20", 0.3, 4); });
  cell(3, () => { x.strokeStyle = "rgba(255,255,255,.85)"; for (let i = 0; i < 14; i++) { let a = (i / 14) * Math.PI * 2 + rand(-0.2, 0.2), px = 64, py = 64; x.lineWidth = rand(0.8, 2); x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 5; k++) { a += rand(-0.3, 0.3); px += Math.cos(a) * rand(8, 14); py += Math.sin(a) * rand(8, 14); x.lineTo(px, py); } x.stroke(); } for (const r of [14, 26, 40]) { x.lineWidth = 1; x.beginPath(); for (let k = 0; k <= 14; k++) { const a = k / 14 * Math.PI * 2, rr = r + rand(-3, 3); k ? x.lineTo(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr) : x.moveTo(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr); } x.stroke(); } x.fillStyle = "rgba(255,255,255,.9)"; x.beginPath(); x.arc(64, 64, 6, 0, 7); x.fill(); x.fillStyle = "rgba(20,20,25,.9)"; x.beginPath(); x.arc(64, 64, 3.5, 0, 7); x.fill(); });
  cell(4, () => hole(11, "250,250,245", 0.75, 36));
  cell(5, () => { for (let i = 0; i < 40; i++) { const a = rand(0, 7), r = rand(0, 50); const g = x.createRadialGradient(64 + Math.cos(a) * r * 0.4, 64 + Math.sin(a) * r * 0.4, 0, 64 + Math.cos(a) * r * 0.4, 64 + Math.sin(a) * r * 0.4, rand(10, 30)); g.addColorStop(0, "rgba(10,8,6,.35)"); g.addColorStop(1, "rgba(10,8,6,0)"); x.fillStyle = g; x.fillRect(0, 0, S, S); } for (let i = 0; i < 18; i++) { const a = rand(0, 7); x.strokeStyle = "rgba(15,12,10,.35)"; x.lineWidth = rand(2, 6); x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(a) * rand(30, 62), 64 + Math.sin(a) * rand(30, 62)); x.stroke(); } });
  cell(6, () => { for (let i = 0; i < 30; i++) { const a = rand(0, 7), r = rand(0, 26); x.fillStyle = `rgba(70,52,34,${rand(0.2, 0.6)})`; x.beginPath(); x.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, rand(2, 7), 0, 7); x.fill(); } hole(6, "40,30,20", 0.3, 3); });
  cell(7, () => hole(6, "120,120,120", 0.3, 6));
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
}

/* ---------- instanced billboard particle batch ---------- */
const PVERT = `
attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iCol; attribute vec3 iSize; attribute float iTile;
varying vec2 vUv; varying vec4 vCol;
#include <fog_pars_vertex>
void main(){
  vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
  vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
  vec2 c = position.xy;
  float sp = length(vv.xy);
  if (iSize.y > 0.0 && sp > 1e-4) { vec2 d = vv.xy / sp; vec2 n = vec2(-d.y, d.x); mvPosition.xy += d * c.y * (iSize.x + sp * iSize.y) + n * c.x * iSize.x; }
  else { float cs = cos(iSize.z), sn = sin(iSize.z); mvPosition.xy += mat2(cs, sn, -sn, cs) * c * iSize.x; }
  float tx = mod(iTile, 4.0), ty = floor(iTile / 4.0);
  vUv = vec2((tx + c.x + 0.5) * 0.25, 1.0 - (ty + 0.5 - c.y) * 0.25);
  vCol = iCol;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const PFRAG = `
uniform sampler2D map; uniform float additive;
varying vec2 vUv; varying vec4 vCol;
#include <fog_pars_fragment>
void main(){
  vec4 t = texture2D(map, vUv);
  vec4 c = vec4(vCol.rgb * t.rgb, vCol.a * t.a);
  if (c.a < 0.003) discard;
  gl_FragColor = c;
  #include <fog_fragment>
  if (additive > 0.5) gl_FragColor.rgb *= gl_FragColor.a;
}`;
function makeBatch(cap, atlas, additive) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const A = { iPos: 3, iVel: 3, iCol: 4, iSize: 3, iTile: 1 }, attrs = {};
  for (const k in A) { const at = new THREE.InstancedBufferAttribute(new Float32Array(cap * A[k]), A[k]); at.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, at); attrs[k] = at; }
  g.instanceCount = 0;
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: atlas }, additive: { value: additive ? 1 : 0 } }]),
    vertexShader: PVERT, fragmentShader: PFRAG, transparent: true, depthWrite: false, fog: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
  });
  m.uniforms.map.value = atlas;
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = additive ? 12 : 11; mesh.name = additive ? "fx_particles_add" : "fx_particles_alpha";
  return { mesh, g, attrs, cap, list: [] };
}

/* ---------- decals ---------- */
const DVERT = `
attribute vec4 iUv; attribute float iAlpha; varying vec2 vUv; varying float vA;
#include <fog_pars_vertex>
void main(){ vUv = iUv.xy + uv * iUv.zw; vA = iAlpha; vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`;
const DFRAG = `
uniform sampler2D map; uniform float light; varying vec2 vUv; varying float vA;
#include <fog_pars_fragment>
void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(t.rgb * light, t.a * vA); if (gl_FragColor.a < 0.01) discard;
#include <fog_fragment>
}`;

/**
 * createGunFX(scene, opts) -> fx
 * opts: { quality: "high"|"low", maxDecals (256), maxParticles (1600), maxBits (200), maxTracers (48),
 *         ground: (x, z) => y  (for casings/bits; default 0), bloodPuffs: false, light: true (pool one PointLight for flashes) }
 */
export function createGunFX(scene, opts = {}) {
  const hi = opts.quality !== "low";
  const maxP = opts.maxParticles || (hi ? 1600 : 600), maxD = opts.maxDecals || (hi ? 256 : 96), maxBits = opts.maxBits || (hi ? 200 : 80), maxT = opts.maxTracers || 48;
  const atlas = particleAtlas(), datlas = decalAtlas();
  const root = new THREE.Group(); root.name = "gunfx"; scene.add(root);
  const ADD = makeBatch(maxP, atlas, true), ALP = makeBatch(maxP, atlas, false);
  root.add(ADD.mesh, ALP.mesh);
  const fx = { root, decalScale: opts.decalScale || 1, ground: opts.ground || (() => 0), bloodPuffs: !!opts.bloodPuffs, onCasingBounce: null, onBitBounce: null, time: 0, lights: [] };

  /* --- particles --- */
  function spawn(batch, p) { if (batch.list.length >= batch.cap) batch.list.shift(); batch.list.push(p); return p; }
  /* p: {pos:V3, vel:V3, life, size, grow, stretch, tile, col:[r,g,b,a], fadeIn, drag, grav, rot, spin} */
  function P(pos, vel, o) { return Object.assign({ pos: pos.clone(), vel: vel.clone(), age: 0, life: 1, size: 0.1, grow: 0, stretch: 0, tile: 0, col: [1, 1, 1, 1], drag: 0, grav: 0, rot: rand(0, 6.28), spin: 0, fadeIn: 0 }, o); }
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  const randDir = (n, cone) => { // random direction in a cone around n
    const t = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
    return n.clone().add(t.multiplyScalar(cone)).normalize();
  };

  /* --- light descriptors: the game may turn these into real lights. We keep a small pool of PointLights when opts.light !== false --- */
  const LP = []; if (opts.light !== false) for (let i = 0; i < (hi ? 2 : 1); i++) { const l = new THREE.PointLight(0xffb060, 0, 6, 2); l.castShadow = false; root.add(l); LP.push({ l, t: 0, life: 0, I: 0 }); }
  function flashLight(desc) {
    fx.lights.push(desc);
    if (!LP.length) return desc;
    let s = LP[0]; for (const x of LP) if (x.t >= x.life) { s = x; break; }
    s.l.position.copy(desc.pos); s.l.color.set(desc.color); s.l.distance = desc.distance; s.I = desc.intensity; s.t = 0; s.life = desc.ttl; s.l.intensity = desc.intensity;
    return desc;
  }

  /* --- muzzle flash: front star + 2 crossed side petals, a few embers and smoke --- */
  const flashGeo = new THREE.PlaneGeometry(1, 1); flashGeo.translate(0, 0.5, 0); flashGeo.rotateX(Math.PI / 2); // extends along +Z
  const flashMat = new THREE.MeshBasicMaterial({ map: atlas, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(4.0, 2.4, 1.0), side: THREE.DoubleSide, fog: false });
  const petalMat = flashMat.clone(); petalMat.map = atlas.clone(); petalMat.map.needsUpdate = true; petalMat.map.repeat.set(0.25, 0.25); petalMat.map.offset.set(0, 0.5); // tile 4 (petal) at row 1 col 0
  const starMat = flashMat.clone(); starMat.map = atlas.clone(); starMat.map.needsUpdate = true; starMat.map.repeat.set(0.25, 0.25); starMat.map.offset.set(0.75, 0.75); // tile 3
  const FL = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group(); g.visible = false; g.name = "fx_muzzleflash";
    const a = new THREE.Mesh(flashGeo, petalMat), b = new THREE.Mesh(flashGeo, petalMat); b.rotation.z = Math.PI / 2;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starMat.map, color: new THREE.Color(5, 3.6, 1.8), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    g.add(a, b, s); g.userData = { a, b, s, t: 0, life: 0 }; root.add(g); FL.push(g);
  }
  let flI = 0;
  const FLASH = { pistol: [0.2, 0.12, 1], heavyPistol: [0.26, 0.15, 1.1], revolver: [0.32, 0.2, 1.3], smg: [0.22, 0.12, 0.9], rifle: [0.42, 0.18, 1.2], rifleHeavy: [0.48, 0.22, 1.3], sniper: [0.55, 0.26, 1.6], shotgun: [0.55, 0.3, 1.6], suppressed: [0.06, 0.05, 0.3], launcher: [0.3, 0.3, 1.0] };
  /**
   * muzzleFlash(pos, dir, def, opts?) -> light descriptor { pos, color, intensity, distance, decay, ttl }
   * pos/dir: world muzzle position and direction (Vector3). Call it on every "fire" event.
   */
  fx.muzzleFlash = function (pos, dir, def, o = {}) {
    pos = toV(pos); dir = toV(dir).normalize();
    const [len, wid, k] = FLASH[def.sound] || FLASH.pistol, g = FL[flI++ % FL.length], u = g.userData;
    g.visible = true; g.position.copy(pos); _q.setFromUnitVectors(_v.set(0, 0, 1), dir); g.quaternion.copy(_q); g.rotateZ(rand(0, Math.PI));
    const L = len * rand(0.75, 1.2), W = wid * rand(0.8, 1.2);
    u.a.scale.set(W, L, 1); u.b.scale.set(W, L, 1); u.s.scale.setScalar(wid * rand(1.4, 2.0)); u.s.material.rotation = rand(0, 6.28); u.s.position.set(0, 0, 0.01);
    u.t = 0; u.life = def.sound === "suppressed" ? 0.03 : 0.045 * (o.ads ? 0.8 : 1);
    // embers + smoke
    if (def.sound !== "suppressed") for (let i = 0; i < (hi ? 6 : 2) * k; i++) spawn(ADD, P(pos, randDir(dir, 0.5).multiplyScalar(rand(4, 14)), { life: rand(0.05, 0.16), size: 0.012, stretch: 0.012, tile: 2, col: [3, 1.9, 0.8, 1], drag: 4, grav: 2 }));
    for (let i = 0; i < (hi ? 3 : 1); i++) spawn(ALP, P(_v2.copy(pos).addScaledVector(dir, 0.05), randDir(dir, 0.4).multiplyScalar(rand(0.4, 1.6) * k), { life: rand(0.6, 1.3), size: 0.06 * k, grow: 0.5 * k, tile: 1, col: [0.8, 0.8, 0.8, 0.22], drag: 2.5, grav: -0.25, spin: rand(-1, 1) }));
    return flashLight({ pos: pos.clone().addScaledVector(dir, 0.08), color: 0xffb466, intensity: (hi ? 6 : 4) * k * (def.sound === "suppressed" ? 0.15 : 1), distance: 7 * k, decay: 2, ttl: 0.06 });
  };

  /* --- tracers: instanced crossed quads --- */
  const tGeo = (() => { const a = new THREE.PlaneGeometry(1, 1); a.translate(0, 0.5, 0); a.rotateX(Math.PI / 2); const b = a.clone(); b.rotateZ(Math.PI / 2); const g = new THREE.BufferGeometry(); const pa = a.attributes.position.array, pb = b.attributes.position.array, ua = a.attributes.uv.array; const pos = new Float32Array(pa.length * 2); pos.set(pa); pos.set(pb, pa.length); const uv = new Float32Array(ua.length * 2); uv.set(ua); uv.set(ua, ua.length); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); const ia = a.index.array, idx = []; for (const i of ia) idx.push(i); for (const i of ia) idx.push(i + 4); g.setIndex(idx); return g; })();
  const tTex = (() => { const [c, x] = cnv(16, 128); const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.15, "rgba(255,230,180,.9)"); g.addColorStop(1, "rgba(255,160,60,0)"); x.fillStyle = g; x.fillRect(0, 0, 16, 128); const h = x.createLinearGradient(0, 0, 16, 0); h.addColorStop(0, "rgba(0,0,0,1)"); h.addColorStop(0.5, "rgba(0,0,0,0)"); h.addColorStop(1, "rgba(0,0,0,1)"); x.globalCompositeOperation = "destination-out"; x.fillStyle = h; x.fillRect(0, 0, 16, 128); const t = new THREE.CanvasTexture(c); return t; })();
  const tracerIM = new THREE.InstancedMesh(tGeo, new THREE.MeshBasicMaterial({ map: tTex, color: new THREE.Color(3.2, 2.5, 1.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }), maxT);
  tracerIM.count = 0; tracerIM.frustumCulled = false; tracerIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage); tracerIM.name = "fx_tracers"; root.add(tracerIM);
  const TR = [];
  /** tracer(from, to, { speed = 600 m/s, length = 2.5 m, width = 0.025 m, color }) */
  fx.tracer = function (from, to, o = {}) {
    from = toV(from); to = toV(to);
    const d = _v.subVectors(to, from), dist = d.length(); if (dist < 0.5) return;
    if (TR.length >= maxT) TR.shift();
    TR.push({ from: from.clone(), dir: d.clone().normalize(), dist, head: 0, speed: o.speed || 600, len: o.length || Math.min(3, 1 + dist * 0.04), w: o.width || 0.03 });
  };

  /* --- rigid bits: casings, mags, shards, chips, chunks --- */
  const BIT_TYPES = {
    pistol: { geo: new THREE.CylinderGeometry(0.0048, 0.0048, 0.019, 10), mat: new THREE.MeshStandardMaterial({ color: 0xd6a84a, metalness: 1, roughness: 0.28 }), bounce: 0.35, tinkle: true },
    rifle: { geo: (() => { const g = new THREE.CylinderGeometry(0.0032, 0.0052, 0.045, 10); return g; })(), mat: new THREE.MeshStandardMaterial({ color: 0xd9ac52, metalness: 1, roughness: 0.25 }), bounce: 0.32, tinkle: true },
    shell: { geo: new THREE.CylinderGeometry(0.0105, 0.0105, 0.065, 12), mat: new THREE.MeshStandardMaterial({ color: 0xb8231c, metalness: 0.1, roughness: 0.5 }), bounce: 0.25, tinkle: true },
    mag: { geo: new THREE.BoxGeometry(0.025, 0.14, 0.06), mat: new THREE.MeshStandardMaterial({ color: 0x1b1c1f, metalness: 0.5, roughness: 0.5 }), bounce: 0.2, tinkle: false },
    shard: { geo: new THREE.TetrahedronGeometry(0.03), mat: new THREE.MeshPhysicalMaterial({ color: 0xcfe8ff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.55, clearcoat: 1, side: THREE.DoubleSide }), bounce: 0.3, tinkle: true },
    chip: { geo: new THREE.BoxGeometry(0.03, 0.006, 0.012), mat: new THREE.MeshStandardMaterial({ color: 0xc89a62, roughness: 0.8 }), bounce: 0.3 },
    chunk: { geo: new THREE.DodecahedronGeometry(0.014), mat: new THREE.MeshStandardMaterial({ color: 0x9a968e, roughness: 0.95 }), bounce: 0.25 }
  };
  BIT_TYPES.pistol.geo.rotateX(Math.PI / 2); BIT_TYPES.rifle.geo.rotateX(Math.PI / 2); BIT_TYPES.shell.geo.rotateX(Math.PI / 2);
  for (const k in BIT_TYPES) { const t = BIT_TYPES[k], im = new THREE.InstancedMesh(t.geo, t.mat, maxBits); im.count = 0; im.castShadow = hi && (k === "mag" || k === "shell"); im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.name = "fx_bits_" + k; root.add(im); t.im = im; t.list = []; }
  /** bit(type, pos, vel, { life, angVel, scale, rot }) -> spawns a rigid bit (casing etc.) */
  fx.bit = function (type, pos, vel, o = {}) {
    const T = BIT_TYPES[type]; if (!T) return;
    if (T.list.length >= maxBits) T.list.shift();
    T.list.push({ pos: toV(pos), vel: toV(vel), q: o.rot ? o.rot.clone() : new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6))), av: o.angVel || new THREE.Vector3(rand(-30, 30), rand(-30, 30), rand(-30, 30)), age: 0, life: o.life || (type === "mag" ? 20 : 10), s: o.scale || 1, rest: false, bounces: 0, type });
  };
  /**
   * ejectCasing(gun) or ejectCasing(pos, rightDir, upDir, def, inheritVel?)
   * With a loaded gun group (from loadGunModel) it reads the eject anchor itself.
   */
  fx.ejectCasing = function (a, right, up, def, inherit) {
    let pos = a;
    if (a && a.isObject3D) { const g = a; def = g.userData.def; pos = g.userData.anchors.eject.getWorldPosition(new THREE.Vector3()); g.updateWorldMatrix(true, false); right = _v2.set(-1, 0, 0).transformDirection(g.matrixWorld).clone(); up = new THREE.Vector3(0, 1, 0).transformDirection(g.matrixWorld); inherit = right && null; }
    if (!def || !def.casing) return;
    const v = right.clone().multiplyScalar(rand(1.6, 3.0)).addScaledVector(up, rand(0.8, 2.0)); if (inherit) v.add(inherit);
    fx.bit(def.casing, pos, v, { life: 8 });
  };
  fx.dropMag = function (pos, vel, scale = 1) { fx.bit("mag", pos, vel || new THREE.Vector3(0, -0.5, 0), { scale, angVel: new THREE.Vector3(rand(-3, 3), rand(-2, 2), rand(-3, 3)) }); };

  /* --- decals --- */
  const dGeo = new THREE.PlaneGeometry(1, 1);
  const dIM = new THREE.InstancedMesh(dGeo, new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: datlas }, light: { value: 1 } }]),
    vertexShader: DVERT, fragmentShader: DFRAG, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true
  }), maxD);
  dIM.material.uniforms.map.value = datlas;
  const dUv = new THREE.InstancedBufferAttribute(new Float32Array(maxD * 4), 4), dA = new THREE.InstancedBufferAttribute(new Float32Array(maxD), 1);
  dUv.setUsage(THREE.DynamicDrawUsage); dA.setUsage(THREE.DynamicDrawUsage); dGeo.setAttribute("iUv", dUv); dGeo.setAttribute("iAlpha", dA);
  dIM.count = 0; dIM.frustumCulled = false; dIM.renderOrder = 5; dIM.name = "fx_decals"; root.add(dIM);
  const DEC = []; let dHead = 0;
  /** decal(point, normal, kind ('concrete'|'metal'|'wood'|'glass'|'plaster'|'scorch'|'dirt'|'plastic'), size m, life s) */
  fx.decal = function (point, normal, kind = "concrete", size = 0.06, life = 60) {
    point = toV(point); normal = toV(normal).normalize();
    const tile = DECAL_TILES[kind]; if (tile == null) return;
    const i = dHead; dHead = (dHead + 1) % maxD; if (DEC.length < maxD) DEC.push(null);
    _q.setFromUnitVectors(_v.set(0, 0, 1), normal); const rz = new THREE.Quaternion().setFromAxisAngle(_v2.set(0, 0, 1), rand(0, 6.28)); _q.multiply(rz);
    _m.compose(_v.copy(point).addScaledVector(normal, 0.002), _q, _s.set(size, size, size)); dIM.setMatrixAt(i, _m);
    dUv.setXYZW(i, (tile % 4) * 0.25, 1 - (Math.floor(tile / 4) + 1) * 0.5, 0.25, 0.5); dA.setX(i, 1);
    DEC[i] = { age: 0, life }; dIM.count = DEC.length; dIM.instanceMatrix.needsUpdate = true; dUv.needsUpdate = true; dA.needsUpdate = true;
  };
  fx.clearDecals = function () { DEC.length = 0; dHead = 0; dIM.count = 0; };
  fx.decalLight = function (v) { dIM.material.uniforms.light.value = v; };

  /* --- impacts per material --- */
  const MATFX = {
    spark: (p, n, d) => { for (let i = 0; i < (hi ? 14 : 6); i++) spawn(ADD, P(p, randDir(d, 0.9).multiplyScalar(rand(3, 11)), { life: rand(0.15, 0.45), size: 0.01, stretch: 0.02, tile: 2, col: [4, 2.6, 1.1, 1], drag: 1.5, grav: 9 })); spawn(ADD, P(p, _v.set(0, 0, 0), { life: 0.06, size: 0.18, tile: 8, col: [3, 2.2, 1.2, 1] })); spawn(ALP, P(p, n.clone().multiplyScalar(0.4), { life: 0.8, size: 0.12, grow: 0.6, tile: 1, col: [0.55, 0.55, 0.55, 0.4], drag: 2, grav: -0.2 })); },
    dust: (p, n, d, c = [0.72, 0.68, 0.6]) => { for (let i = 0; i < (hi ? 4 : 2); i++) spawn(ALP, P(p, randDir(n, 0.6).multiplyScalar(rand(0.6, 2.4)), { life: rand(0.9, 1.8), size: rand(0.12, 0.22), grow: 0.9, tile: 1, col: [...c, 0.5], drag: 3, grav: 0.3, spin: rand(-1, 1) })); for (let i = 0; i < (hi ? 8 : 3); i++) spawn(ALP, P(p, randDir(n, 0.7).multiplyScalar(rand(2, 6)), { life: rand(0.3, 0.7), size: 0.012, tile: 6, col: [...c.map((x) => x * 0.7), 1], drag: 1, grav: 9.8 })); if (hi) for (let i = 0; i < 2; i++) fx.bit("chunk", p, randDir(n, 0.6).multiplyScalar(rand(1.5, 3.5)), { life: 4, scale: rand(0.5, 1.2) }); },
    wood: (p, n, d) => { MATFX.dust(p, n, d, [0.62, 0.48, 0.32]); for (let i = 0; i < (hi ? 5 : 2); i++) fx.bit("chip", p, randDir(n, 0.7).multiplyScalar(rand(1.5, 4)), { life: 5, scale: rand(0.6, 1.4) }); },
    glass: (p, n, d) => { for (let i = 0; i < (hi ? 9 : 4); i++) fx.bit("shard", p, randDir(d, 0.7).multiplyScalar(rand(1, 4)), { life: 5, scale: rand(0.3, 1) }); for (let i = 0; i < 6; i++) spawn(ADD, P(p, randDir(d, 0.8).multiplyScalar(rand(1, 4)), { life: rand(0.2, 0.5), size: 0.015, tile: 0, col: [0.8, 0.9, 1, 0.8], drag: 1, grav: 9 })); },
    cloth: (p, n, d) => { const c = fx.bloodPuffs ? [0.55, 0.08, 0.08] : [0.75, 0.74, 0.72]; for (let i = 0; i < 3; i++) spawn(ALP, P(p, randDir(n, 0.6).multiplyScalar(rand(0.3, 1.2)), { life: rand(0.25, 0.5), size: rand(0.05, 0.09), grow: 0.4, tile: 1, col: [...c, 0.45], drag: 4, grav: 0.2 })); },
    water: (p, n) => { for (let i = 0; i < 14; i++) spawn(ALP, P(p, randDir(_up, 0.4).multiplyScalar(rand(1.5, 4.5)), { life: rand(0.4, 0.9), size: 0.03, stretch: 0.02, tile: 0, col: [0.85, 0.92, 1, 0.7], grav: 9.8 })); },
    dirt: (p, n, d) => MATFX.dust(p, n, d, [0.45, 0.36, 0.26])
  };
  /**
   * impact(hit, shotDir) : decal + particles for a hit record from ballistics.hitscan.
   * Exits (penetrations) get a second, smaller puff on the far side when hit.exitPoint is given.
   */
  fx.impact = function (hit, dir) {
    const p = toV(hit.point), n = toV(hit.normal), d = dir ? toV(dir).normalize() : n.clone();
    const refl = d.clone().addScaledVector(n, -2 * d.dot(n)).normalize();
    (MATFX[hit.fx] || MATFX.dust)(p, n, refl);
    if (hit.decal && hit.material !== "person") fx.decal(p, n, hit.decal, (DECAL_SIZE[hit.decal] || 0.1) * rand(0.85, 1.15) * fx.decalScale);
  };
  fx.glassBurst = function (center, normal, w = 1, h = 1, n = 40) { for (let i = 0; i < (hi ? n : n / 3); i++) fx.bit("shard", _v.set(center.x + rand(-w, w) / 2, center.y + rand(-h, h) / 2, center.z).clone(), normal.clone().multiplyScalar(rand(0.5, 2.5)).add(new THREE.Vector3(rand(-1, 1), rand(0, 1.5), rand(-1, 1))), { life: 6, scale: rand(0.5, 2) }); };

  /** explosion(pos, radius) -> light descriptor. Stun-grenade look: white flash, smoke ring, sparks, scorch. */
  fx.explosion = function (pos, radius = 5) {
    const p = toV(pos);
    spawn(ADD, P(p, _v.set(0, 0, 0), { life: 0.12, size: radius * 0.7, tile: 8, col: [2.5, 2.3, 2.0, 1] }));
    spawn(ADD, P(p, _v.set(0, 0, 0), { life: 0.3, size: radius * 0.25, grow: radius * 1.2, tile: 3, col: [1.6, 1.1, 0.6, 0.8], spin: 2 }));
    for (let i = 0; i < (hi ? 40 : 14); i++) spawn(ADD, P(p, randDir(_up, 1.2).multiplyScalar(rand(6, 22)), { life: rand(0.3, 0.9), size: 0.02, stretch: 0.03, tile: 2, col: [1, 0.7, 0.3, 1], drag: 1.2, grav: 9 }));
    for (let i = 0; i < (hi ? 22 : 8); i++) { const dd = randDir(_up, 1.3); dd.y = Math.abs(dd.y) * 0.6; spawn(ALP, P(p.clone().addScaledVector(dd, rand(0, radius * 0.15)), dd.multiplyScalar(rand(1, 5)), { life: rand(1.8, 3.5), size: rand(0.5, 1.0), grow: rand(0.6, 1.4), tile: 1, col: [0.8, 0.79, 0.76, 0.55], drag: 1.6, grav: -0.5, spin: rand(-0.6, 0.6) })); }
    spawn(ALP, P(_v.set(p.x, fx.ground(p.x, p.z) + 0.05, p.z), _v2.set(0, 0, 0), { life: 0.6, size: 0.5, grow: radius * 3, tile: 7, col: [0.9, 0.9, 0.85, 0.4] }));
    fx.decal(_v.set(p.x, fx.ground(p.x, p.z), p.z).clone(), new THREE.Vector3(0, 1, 0), "scorch", radius * 0.5, 90);
    return flashLight({ pos: p.clone().add(_v.set(0, 0.5, 0)), color: 0xfff0d8, intensity: hi ? 9 : 6, distance: radius * 4, decay: 2, ttl: 0.22 });
  };
  /** smoke trail puff (e.g. behind a launcher round each frame) */
  fx.trail = function (pos, vel) { spawn(ALP, P(pos, vel ? vel.clone().multiplyScalar(-0.05) : _v.set(0, 0.2, 0), { life: rand(0.6, 1.2), size: 0.08, grow: 0.5, tile: 1, col: [0.85, 0.85, 0.85, 0.3], drag: 2, grav: -0.3 })); };

  /* --- per-frame update --- */
  function updBatch(B, dt) {
    const L = B.list; let n = 0;
    const P3 = B.attrs.iPos.array, V3 = B.attrs.iVel.array, C4 = B.attrs.iCol.array, S3 = B.attrs.iSize.array, T1 = B.attrs.iTile.array;
    for (let i = 0; i < L.length; i++) {
      const p = L[i]; p.age += dt; if (p.age >= p.life) continue;
      if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.vel.y -= p.grav * dt; p.pos.addScaledVector(p.vel, dt); p.rot += p.spin * dt;
      const gy = fx.ground(p.pos.x, p.pos.z); if (p.grav > 0 && p.pos.y < gy) { p.pos.y = gy; p.vel.y *= -0.3; p.vel.x *= 0.5; p.vel.z *= 0.5; }
      const t = p.age / p.life, a = p.col[3] * (1 - t) * (p.fadeIn ? Math.min(1, p.age / p.fadeIn) : 1);
      P3[n * 3] = p.pos.x; P3[n * 3 + 1] = p.pos.y; P3[n * 3 + 2] = p.pos.z;
      const st = p.stretch > 0 ? 1 : 0; V3[n * 3] = p.vel.x * st; V3[n * 3 + 1] = p.vel.y * st; V3[n * 3 + 2] = p.vel.z * st;
      C4[n * 4] = p.col[0]; C4[n * 4 + 1] = p.col[1]; C4[n * 4 + 2] = p.col[2]; C4[n * 4 + 3] = a;
      S3[n * 3] = p.size + p.grow * p.age; S3[n * 3 + 1] = p.stretch; S3[n * 3 + 2] = p.rot; T1[n] = p.tile;
      L[n++] = p;
    }
    L.length = n; B.g.instanceCount = n;
    for (const k in B.attrs) { B.attrs[k].needsUpdate = true; B.attrs[k].updateRange.count = n * B.attrs[k].itemSize; B.attrs[k].updateRange.offset = 0; }
  }
  const _ax = new THREE.Vector3(), _dq = new THREE.Quaternion();
  fx.update = function (dt, camera) {
    fx.time += dt; fx.lights.length = 0;
    updBatch(ADD, dt); updBatch(ALP, dt);
    for (const g of FL) if (g.visible) { const u = g.userData; u.t += dt; if (u.t >= u.life) g.visible = false; else { const k = 1 - u.t / u.life; u.a.material.opacity = k; u.s.material.opacity = k; } }
    for (const s of LP) { s.t += dt; s.l.intensity = s.t < s.life ? s.I * (1 - s.t / s.life) : 0; }
    // tracers
    let tn = 0;
    for (let i = 0; i < TR.length; i++) {
      const t = TR[i]; t.head += t.speed * dt; const tail = Math.max(0, t.head - t.len), head = Math.min(t.dist, t.head);
      if (tail >= t.dist) continue;
      _v.copy(t.from).addScaledVector(t.dir, tail); _q.setFromUnitVectors(_v2.set(0, 0, 1), t.dir);
      if (camera) { /* roll so one quad faces the camera */ }
      _m.compose(_v, _q, _s.set(t.w, t.w, Math.max(0.05, head - tail))); tracerIM.setMatrixAt(tn++, _m); TR[tn - 1] = t;
    }
    TR.length = tn; tracerIM.count = tn; tracerIM.instanceMatrix.needsUpdate = true;
    // bits
    for (const k in BIT_TYPES) {
      const T = BIT_TYPES[k], L = T.list; let n = 0;
      for (let i = 0; i < L.length; i++) {
        const b = L[i]; b.age += dt; if (b.age >= b.life) continue;
        if (!b.rest) {
          b.vel.y -= 9.81 * dt; b.vel.multiplyScalar(1 - 0.15 * dt); b.pos.addScaledVector(b.vel, dt);
          const w = b.av.length(); if (w > 1e-4) { _dq.setFromAxisAngle(_ax.copy(b.av).divideScalar(w), w * dt); b.q.premultiply(_dq); }
          const gy = fx.ground(b.pos.x, b.pos.z) + 0.004 * b.s;
          if (b.pos.y < gy) {
            const sp = -b.vel.y; b.pos.y = gy; b.vel.y = sp * T.bounce; b.vel.x *= 0.55; b.vel.z *= 0.55; b.av.multiplyScalar(0.6); b.bounces++;
            if (sp > 0.6) { if (T.tinkle && fx.onCasingBounce) fx.onCasingBounce(k, b.pos, sp); else if (fx.onBitBounce) fx.onBitBounce(k, b.pos, sp); }
            if (sp < 0.5) { b.rest = true; b.vel.set(0, 0, 0); // lie flat: keep yaw, align long axis horizontal
              const e = new THREE.Euler().setFromQuaternion(b.q, "YXZ"); b.q.setFromEuler(new THREE.Euler(k === "mag" ? Math.PI / 2 : 0, e.y, k === "mag" ? 0 : Math.PI / 2 * 0, "YXZ")); if (k !== "mag" && k !== "chip" && k !== "chunk") b.q.setFromEuler(new THREE.Euler(0, e.y, 0)); }
          }
        }
        const fade = clamp((b.life - b.age) / 0.6, 0, 1);
        _m.compose(b.pos, b.q, _s.setScalar(b.s * (fade < 1 ? fade : 1))); T.im.setMatrixAt(n, _m); L[n++] = b;
      }
      L.length = n; T.im.count = n; T.im.instanceMatrix.needsUpdate = true;
    }
    // decals fade
    let dirty = false;
    for (let i = 0; i < DEC.length; i++) { const d = DEC[i]; if (!d) continue; d.age += dt; const a = clamp((d.life - d.age) / 3, 0, 1); if (a < 1) { dA.setX(i, a); dirty = true; } }
    if (dirty) dA.needsUpdate = true;
  };
  fx.stats = () => ({ particles: ADD.list.length + ALP.list.length, tracers: TR.length, decals: DEC.length, bits: Object.values(BIT_TYPES).reduce((a, t) => a + t.list.length, 0), flashes: FL.filter((g) => g.visible).length });
  fx.dispose = function () { scene.remove(root); root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); }); atlas.dispose(); datlas.dispose(); tTex.dispose(); };
  return fx;
}

/* ---------- camera shake: trauma model ---------- */
/** createCameraShake() -> { add(trauma 0..1), kick(pitchRad), update(dt) -> { pitch, yaw, roll, x, y } } */
export function createCameraShake(o = {}) {
  const S = { trauma: 0, t: 0, maxAngle: o.maxAngle || 0.05, maxOffset: o.maxOffset || 0.04, decay: o.decay || 1.6, out: { pitch: 0, yaw: 0, roll: 0, x: 0, y: 0 } };
  const n = (f, s) => Math.sin(S.t * f + s) * 0.6 + Math.sin(S.t * f * 2.13 + s * 1.7) * 0.4;
  S.add = (v) => { S.trauma = Math.min(1, S.trauma + v); };
  S.update = (dt) => { S.t += dt; S.trauma = Math.max(0, S.trauma - S.decay * dt); const k = S.trauma * S.trauma; S.out.pitch = S.maxAngle * k * n(37, 1); S.out.yaw = S.maxAngle * k * n(41, 2); S.out.roll = S.maxAngle * 0.6 * k * n(29, 3); S.out.x = S.maxOffset * k * n(33, 4); S.out.y = S.maxOffset * k * n(31, 5); return S.out; };
  return S;
}

/* ---------- DOM: crosshair, hit markers, scope ---------- */
/**
 * createCrosshair(container = document.body) -> { setSpread(px), hit(kind: "hit"|"head"|"down"), show(bool), scope(type|null), setADS(0..1), el }
 */
export function createCrosshair(container = document.body) {
  const el = document.createElement("div"); el.className = "dgm-xhair";
  el.innerHTML = `<style>
  .dgm-xhair{position:absolute;inset:0;pointer-events:none;z-index:20}
  .dgm-xhair .c{position:absolute;left:50%;top:50%;width:0;height:0}
  .dgm-xhair .l{position:absolute;background:#fff;box-shadow:0 0 2px rgba(0,0,0,.9);opacity:.9}
  .dgm-xhair .dot{position:absolute;left:-1.5px;top:-1.5px;width:3px;height:3px;border-radius:50%;background:#fff;box-shadow:0 0 2px #000}
  .dgm-xhair .hm{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px;opacity:0;transition:opacity .25s}
  .dgm-xhair .hm i{position:absolute;left:12px;top:-2px;width:2px;height:9px;background:#fff;box-shadow:0 0 2px #000;transform-origin:1px 15px}
  .dgm-xhair .scope{position:absolute;inset:0;display:none;background:radial-gradient(circle at 50% 50%,rgba(0,0,0,0) 0,rgba(0,0,0,0) 34vh,rgba(0,0,0,.96) 34.4vh)}
  .dgm-xhair .scope:before,.dgm-xhair .scope:after{content:"";position:absolute;background:#000}
  .dgm-xhair .scope:before{left:0;right:0;top:50%;height:1.5px;margin-top:-.75px}
  .dgm-xhair .scope:after{top:0;bottom:0;left:50%;width:1.5px;margin-left:-.75px}
  .dgm-xhair .scope b{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:#e02020;box-shadow:0 0 6px #f44}
  </style><div class="scope"><b></b></div><div class="c"><div class="l t"></div><div class="l b"></div><div class="l lft"></div><div class="l r"></div><div class="dot"></div></div><div class="hm"><i style="transform:rotate(45deg)"></i><i style="transform:rotate(135deg)"></i><i style="transform:rotate(225deg)"></i><i style="transform:rotate(315deg)"></i></div>`;
  container.appendChild(el);
  const q = (s) => el.querySelector(s), T = q(".t"), B = q(".b"), Lf = q(".lft"), R = q(".r"), C = q(".c"), HM = q(".hm"), SC = q(".scope");
  let hmT = 0;
  const api = {
    el,
    setSpread(px) { px = Math.max(3, px); const L = 7; T.style.cssText = `left:-1px;top:${-px - L}px;width:2px;height:${L}px`; B.style.cssText = `left:-1px;top:${px}px;width:2px;height:${L}px`; Lf.style.cssText = `top:-1px;left:${-px - L}px;width:${L}px;height:2px`; R.style.cssText = `top:-1px;left:${px}px;width:${L}px;height:2px`; },
    hit(kind = "hit") { const col = kind === "head" ? "#ffd84a" : kind === "down" ? "#ff8a3d" : "#ffffff"; HM.querySelectorAll("i").forEach((i) => (i.style.background = col)); HM.style.transition = "none"; HM.style.opacity = 1; HM.style.transform = `scale(${kind === "down" ? 1.35 : 1})`; clearTimeout(hmT); hmT = setTimeout(() => { HM.style.transition = "opacity .25s"; HM.style.opacity = 0; }, 90); },
    show(on) { C.style.display = on ? "" : "none"; },
    setADS(a) { C.style.opacity = String(1 - a * 0.6); },
    scope(type) { SC.style.display = type === "scope" ? "block" : "none"; C.style.display = type === "scope" ? "none" : ""; },
    dispose() { el.remove(); }
  };
  api.setSpread(12); return api;
}
/** Convert a spread cone half-angle (rad) to crosshair gap pixels for a camera. */
export function spreadToPixels(spreadRad, camera, viewportHeight) { return Math.tan(spreadRad) / Math.tan(camera.fov * Math.PI / 360) * viewportHeight / 2; }
