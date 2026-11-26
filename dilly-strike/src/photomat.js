/* ==========================================================================
   DILLY STRIKE — photo-scanned CC0 materials + HDRI environments
   Streams real PBR texture sets (assets/materials/<name>/color|normal|arm.jpg,
   Poly Haven, CC0 — see assets/CREDITS.md) and swaps them into the existing
   materials in place once they arrive. Nothing waits on this: the procedural
   textures from textures.js are shown first and stay as the fallback when a
   file (or the whole asset folder) cannot be loaded.
   * one Texture per file, shared by every material that uses the set
     (clones only where a material needs its own repeat/rotation; clones share
     the GPU upload)
   * arm.jpg = AO (R) / roughness (G) / metalness (B): three reads roughness
     from G and metalness from B, so one texture serves both maps; AO is
     baked into color.jpg at half strength (aoMap would need a 2nd UV set)
   * progress for the loading bars: window.DillyStrikeMaterials.state()
   ========================================================================== */
import * as THREE from 'three';
import { RGBELoader } from '../../vendor/jsm/loaders/RGBELoader.js';

const BASE = new URL('../assets/', import.meta.url).href;
const off = new URLSearchParams(location.search).get('photo') === '0'; // ?photo=0 -> procedural only (debug / comparison)

const ST = { files: 0, loaded: 0, failed: 0, sets: {}, hdri: {}, listeners: new Set(), probe: null, aniso: 8, renderer: null };

export function initPhotoMaterials(renderer) {
  ST.renderer = renderer;
  ST.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
}

// one small JSON request decides whether the asset folder is reachable at all, so an
// offline/blocked asset host costs a single failed request instead of one per file
function probe() {
  if (ST.probe) return ST.probe;
  if (off) return (ST.probe = Promise.resolve(null));
  ST.probe = fetch(BASE + 'materials/manifest.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return ST.probe;
}

function emit() { const s = state(); for (const f of ST.listeners) { try { f(s); } catch (_) { /* listener errors never break loading */ } } }
export function state() {
  const pending = ST.files - ST.loaded - ST.failed;
  return { files: ST.files, loaded: ST.loaded, failed: ST.failed, progress: ST.files ? (ST.loaded + ST.failed) / ST.files : 1, done: !!ST.probeDone && pending <= 0, photo: ST.loaded > 0 };
}
export function onProgress(f) { ST.listeners.add(f); f(state()); return () => ST.listeners.delete(f); }

const texLoader = new THREE.TextureLoader();
function loadTex(url, srgb) {
  ST.files++; emit();
  return new Promise((res) => {
    texLoader.load(url, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = ST.aniso;
      t.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
      t.userData.photo = true;
      ST.loaded++; emit(); res(t);
    }, undefined, () => { ST.failed++; emit(); res(null); });
  });
}

/* load (once) one texture set; resolves null when unavailable */
export function photoSet(name) {
  if (ST.sets[name]) return ST.sets[name];
  ST.sets[name] = probe().then((man) => {
    if (!man || !man.materials || !man.materials[name]) return null;
    const dir = BASE + 'materials/' + name + '/';
    return Promise.all([loadTex(dir + 'color.jpg', true), loadTex(dir + 'normal.jpg', false), loadTex(dir + 'arm.jpg', false)])
      .then(([map, normalMap, arm]) => (map && normalMap && arm ? { name, map, normalMap, arm } : null));
  });
  return ST.sets[name];
}

// a texture with its own repeat/rotation, sharing the image + GPU upload of the original
function variant(t, o) {
  if (!o.repeat && !o.rotation) return t;
  const c = t.clone();
  if (o.repeat) c.repeat.set(o.repeat[0], o.repeat[1]);
  if (o.rotation) { c.rotation = o.rotation; c.center.set(0.5, 0.5); }
  return c;
}

const replaced = new Set(); // procedural textures that photos replaced (disposed once everything has loaded)
/* swap a set into a MeshStandardMaterial.
   opts: tile (m per texture tile, world-projected materials), color, normal (scale), metal (bool),
   rough (multiplier), repeat [u,v] / rotation (mesh-UV materials), envK */
export function applySet(m, set, o = {}) {
  for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) if (m[k] && !m[k].userData.photo) replaced.add(m[k]);
  if (m.userData.lowStash && m.userData.lowStash.n && !m.userData.lowStash.n.userData.photo) replaced.add(m.userData.lowStash.n);
  const map = variant(set.map, o), nor = variant(set.normalMap, o), arm = variant(set.arm, o);
  m.map = map;
  if (m.userData.lowStash) m.userData.lowStash.n = nor; else m.normalMap = nor; // low quality strips normal maps (render.js)
  m.roughnessMap = arm;
  m.metalnessMap = o.metal ? arm : null;
  m.metalness = o.metal ? 1 : 0;
  m.roughness = o.rough != null ? o.rough : 1;
  if (o.color != null) m.color.set(o.color);
  const ns = o.normal != null ? o.normal : 1; m.normalScale.set(ns, ns);
  if (m.userData.U && o.tile) m.userData.U.uTile.value = o.tile;
  m.userData.photo = set.name;
  m.needsUpdate = true;
}

/* request a set for a material; applied when (and if) it arrives */
export function usePhoto(m, name, o = {}) {
  if (!m) return m;
  photoSet(name).then((set) => { if (set) applySet(m, set, o); });
  return m;
}

/* second "blend" layer for world materials (e.g. drifted sand over paving) */
export function useBlend(m, name, o = {}) {
  const U = m && m.userData.U; if (!U) return m;
  photoSet(name).then((set) => {
    if (!set) return;
    U.uBlendMap.value = set.map; U.uBlendNor.value = set.normalMap; U.uBlendArm.value = set.arm;
    U.uBlendTile.value = o.tile || 4; U.uBlendAmt.value = o.amount != null ? o.amount : 0.5;
    if (o.color != null) U.uBlendCol.value.set(o.color);
    m.defines = Object.assign({}, m.defines, { USE_PBLEND: '' });
    m.needsUpdate = true;
  });
  return m;
}

/* custom consumer: cb(set) once a set is available */
export function withPhoto(name, cb) { photoSet(name).then((set) => { if (set) cb(set); }); }

/* ---------------- crate faces composed from a plank set ----------------
   panel of planks + four frame boards (vertical ones transposed, so the grain
   follows the board) + a diagonal brace + nails; normals are rotated with the
   boards so the lighting stays correct. Built once on a canvas per map type. */
function pixels(img, S) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, S, S);
  return x.getImageData(0, 0, S, S).data;
}
export function crateSet(set, S = 1024) {
  const sc = set.map.image.width ? Math.min(S, set.map.image.width) : S;
  const C = pixels(set.map.image, sc), N = pixels(set.normalMap.image, sc), A = pixels(set.arm.image, sc);
  const out = [0, 1, 2].map(() => { const c = document.createElement('canvas'); c.width = c.height = S; return c; });
  const ctx = out.map((c) => c.getContext('2d')), id = ctx.map((x) => x.createImageData(S, S));
  const fr = 0.11, bw = 0.055, panelRep = 2.2, boardRep = 2.2;
  const nails = [];
  for (const [u, v] of [[fr / 2, fr / 2], [1 - fr / 2, fr / 2], [fr / 2, 1 - fr / 2], [1 - fr / 2, 1 - fr / 2], [0.5, fr / 2], [0.5, 1 - fr / 2], [fr / 2, 0.5], [1 - fr / 2, 0.5]]) for (const s of [-1, 1]) nails.push([u + s * 0.02, v]);
  const smp = (buf, u, v) => { const xi = ((Math.floor(u * sc) % sc) + sc) % sc, yi = ((Math.floor(v * sc) % sc) + sc) % sc; return (yi * sc + xi) * 4; };
  const k45 = Math.SQRT1_2, D = id.map((q) => q.data), nailR = S * 0.009;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S, v = (y + 0.5) / S, o = (y * S + x) * 4;
    const inFrameH = v < fr || v > 1 - fr, inFrameV = !inFrameH && (u < fr || u > 1 - fr);
    const dd = Math.abs(u - v) * k45, brace = !inFrameH && !inFrameV && dd < bw;
    let su, sv, rot = 0, tint = 1, edge = 1;
    if (inFrameH) { su = u * boardRep + 0.37; sv = (v < 0.5 ? v : v - (1 - fr)) * boardRep * 0.5 + 0.61; tint = 0.82; edge = Math.min(v < 0.5 ? v : 1 - v, Math.abs((v < 0.5 ? fr : 1 - fr) - v)); }
    else if (inFrameV) { su = v * boardRep + 0.13; sv = (u < 0.5 ? u : u - (1 - fr)) * boardRep * 0.5 + 0.21; rot = 1; tint = 0.78; edge = Math.min(u < 0.5 ? u : 1 - u, Math.abs((u < 0.5 ? fr : 1 - fr) - u)); }
    else if (brace) { su = (u + v) * k45 * boardRep + 0.5; sv = (u - v) * k45 * boardRep * 0.5 + 0.77; rot = 2; tint = 0.86; edge = bw - dd; }
    else { su = u * panelRep; sv = v * panelRep; edge = 1; }
    const p = smp(C, su, sv);
    let nx = N[p] / 127.5 - 1, ny = N[p + 1] / 127.5 - 1; const nz = N[p + 2];
    if (rot === 1) { const t = nx; nx = ny; ny = t; } // transposed board: swap tangent axes
    else if (rot === 2) { const a = nx * k45 - ny * k45, b = nx * k45 + ny * k45; nx = a; ny = b; }
    // shadowed gap + slight bevel where boards meet
    const gap = Math.min(1, edge * S / 5);
    const g = 0.42 + 0.58 * gap;
    let r = C[p] * tint * g, gg = C[p + 1] * tint * g, b = C[p + 2] * tint * g;
    let ro = A[p + 1] + (1 - gap) * 40, me = 0;
    if (inFrameH || inFrameV) for (const [nu, nv] of nails) { const d = Math.hypot(u - nu, v - nv) * S; if (d < nailR) { const t = d / nailR; r = gg = b = 74 - 20 * t; ro = 120; me = 210; nx = (u - nu) * 40; ny = -(v - nv) * 40; } }
    D[0][o] = r; D[0][o + 1] = gg; D[0][o + 2] = b; D[0][o + 3] = 255;
    D[1][o] = (nx + 1) * 127.5; D[1][o + 1] = (ny + 1) * 127.5; D[1][o + 2] = nz; D[1][o + 3] = 255;
    D[2][o] = A[p]; D[2][o + 1] = Math.min(255, ro); D[2][o + 2] = me; D[2][o + 3] = 255;
  }
  ctx.forEach((x, i) => x.putImageData(id[i], 0, 0));
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ST.aniso; t.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding; t.userData.photo = true; return t; };
  return { name: set.name + ':crate', map: tex(out[0], true), normalMap: tex(out[1], false), arm: tex(out[2], false) };
}

/* ---------------- HDRI environment ----------------
   RGBE -> float data, then: the sun disc is clamped (the scene already has a
   shadow-casting sun light, so its energy is not counted twice), the panorama
   is rotated so its brightest azimuth matches the preset's sun, and the sky is
   normalised to a target mean radiance (optionally desaturated, so a deep-blue
   sky does not tint every shadow). Then PMREM -> scene.environment. */
export function loadHDRI(file, opts = {}) {
  const key = file + '|' + (opts.sun || []).join(',');
  if (ST.hdri[key]) return ST.hdri[key];
  ST.hdri[key] = probe().then((man) => {
    if (!man || !man.hdri || !man.hdri.includes(file)) return null;
    ST.files++; emit();
    return new RGBELoader().setDataType(THREE.FloatType).loadAsync(BASE + 'hdri/' + file).then((tex) => {
      const out = processHDR(tex.image, opts);
      tex.dispose();
      const pm = new THREE.PMREMGenerator(ST.renderer);
      const env = pm.fromEquirectangular(out).texture; out.dispose(); pm.dispose();
      ST.loaded++; emit();
      return env;
    }).catch((e) => { console.warn('HDRI unavailable, keeping procedural environment', e && e.message); ST.failed++; emit(); return null; });
  });
  return ST.hdri[key];
}
function processHDR(img, o) {
  const { width: W, height: H, data: src } = img, ch = src.length / (W * H);
  const lum = (i) => src[i] * 0.2126 + src[i + 1] * 0.7152 + src[i + 2] * 0.0722;
  // brightest column in the upper half = sun azimuth
  const col = new Float32Array(W);
  for (let y = 0; y < H / 2; y++) for (let x = 0; x < W; x++) col[x] += lum((y * W + x) * ch);
  let best = 0; for (let x = 1; x < W; x++) if (col[x] > col[best]) best = x;
  // three.js equirect: u = atan(dir.z, dir.x) / 2pi + 0.5
  let shift = 0;
  if (o.sun) { const u = Math.atan2(o.sun[2], o.sun[0]) / (Math.PI * 2) + 0.5; shift = Math.round(u * W - best); }
  const clampL = o.clamp || 6, sat = o.sat != null ? o.sat : 1, data = new Float32Array(W * H * 4);
  let sum = 0, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * ch, ox = (((x + shift) % W) + W) % W, j = (y * W + ox) * 4;
    let r = src[i], g = src[i + 1], b = src[i + 2]; const L = r * 0.2126 + g * 0.7152 + b * 0.0722;
    if (L > clampL) { const k = clampL / L; r *= k; g *= k; b *= k; }
    if (sat !== 1) { const l = Math.min(L, clampL); r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat; }
    data[j] = r; data[j + 1] = g; data[j + 2] = b; data[j + 3] = 1;
    if (y < H / 2) { sum += Math.min(L, clampL); n++; }
  }
  // flipY data textures: the upper half is the sky either way for the mean
  const k = (o.mean || 0.6) / Math.max(1e-4, sum / Math.max(1, n));
  const half = new Uint16Array(W * H * 4);
  for (let i = 0; i < data.length; i++) half[i] = THREE.DataUtils.toHalfFloat(i % 4 === 3 ? 1 : data[i] * k);
  const t = new THREE.DataTexture(half, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
  t.mapping = THREE.EquirectangularReflectionMapping; t.encoding = THREE.LinearEncoding;
  t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.flipY = true; t.needsUpdate = true;
  return t;
}

/* once everything requested so far has settled, free the procedural textures photos replaced */
export function sweepReplaced(scene) {
  if (!replaced.size) return;
  const used = new Set();
  scene.traverse((o) => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) { for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) if (m[k]) used.add(m[k]); if (m.userData.lowStash && m.userData.lowStash.n) used.add(m.userData.lowStash.n); }
  });
  for (const t of replaced) if (!used.has(t)) { t.dispose(); replaced.delete(t); }
}

// settled one task after the probe, so the sets requested while it was in flight are already counted
probe().then(() => setTimeout(() => { ST.probeDone = true; emit(); }, 0));

window.DillyStrikeMaterials = { state, onProgress };

/* ---------------- progress UI (self-contained: no menu markup needed) ----------------
   a small pill on the menu while sets stream, and the match-loading bar follows the real
   progress instead of its timed animation while anything is still pending */
function progressUI() {
  const css = document.createElement('style');
  css.textContent = `
#mat-stream{position:fixed;left:16px;bottom:14px;z-index:40;display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(10,18,26,.72);border:1px solid rgba(236,232,225,.12);color:rgba(236,232,225,.75);font:600 11px/1 Barlow,sans-serif;letter-spacing:.12em;text-transform:uppercase;pointer-events:none;opacity:0;transition:opacity .4s}
#mat-stream.on{opacity:1}
#mat-stream b{color:#ece8e1;min-width:3ch}
#mat-stream i{display:block;width:90px;height:2px;background:rgba(236,232,225,.14)}
#mat-stream u{display:block;height:100%;width:0;background:#ff4655;transition:width .2s linear}
#match-load.on.mat-streaming .ml-bar i{animation:none!important;width:var(--mat,0%)!important;transition:width .2s linear}`;
  document.head.appendChild(css);
  const pill = document.createElement('div'); pill.id = 'mat-stream'; pill.setAttribute('aria-hidden', 'true');
  pill.innerHTML = '<span>Streaming HD materials</span><b>0%</b><i><u></u></i>';
  document.body.appendChild(pill);
  onProgress((st) => {
    const pct = Math.round(st.progress * 100) + '%';
    pill.querySelector('b').textContent = pct; pill.querySelector('u').style.width = pct;
    pill.classList.toggle('on', !st.done && st.files > 0);
    const ml = document.getElementById('match-load');
    if (ml) { ml.classList.toggle('mat-streaming', !st.done); ml.style.setProperty('--mat', pct); }
  });
}
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', progressUI); else progressUI();
