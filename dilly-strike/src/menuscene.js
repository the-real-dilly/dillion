/* ==========================================================================
   DILLY STRIKE — live menu stage
   A small, separate Three.js renderer for the main menu and agent select:
   the selected agent (the same skinned operator the match uses, dressed in
   a per-agent kit) under hard coloured rim lights, a slow drifting camera,
   rising dust motes and a floor glow. Also renders bust / full-body
   portraits of every agent once, used across the UI (HUD pips, scoreboard,
   loading cards, party banners). Falls back silently to the vector art in
   ui.js when WebGL or the character model is unavailable.
   ========================================================================== */
import * as THREE from 'three';
import { loadCharacters, Operator, teamStyle } from './characters.js';

// per-agent kit (overrides on the alpha team style). Original looks only.
const KIT = {
  sprig: { hat: 'cap', face: 'shades', top: 0x2b2f37, camo: 0, legs: 0x23272e, vest: 0x1d2026, pack: 0x30343c, helmet: 0x9e2b36, patch: 0xff4f5e, glove: 0x151618, gun: 'vandal', packType: 'none' },
  brine: { hat: 'boonie', face: 'goggles', top: 0x2a4644, camo: 1, camoA: 0x22393a, camoB: 0x37605c, camoC: 0x1a2a2b, legs: 0x283a3b, vest: 0x1e3132, pack: 0x2f4b4a, helmet: 0x3c5f5b, patch: 0x40d1c2, gun: 'phantom', packType: 'hydro' },
  vanta: { hat: 'helmet', face: 'balaclava', top: 0x26222f, camo: 2, camoA: 0x1e1b27, camoB: 0x373047, camoC: 0x15131b, legs: 0x221f2b, vest: 0x1a1822, pack: 0x2c2838, helmet: 0x2c2838, patch: 0xa08cff, gun: 'operator', packType: 'assault' },
  ember: { hat: 'cap', face: 'bare', top: 0x3d2b1f, camo: 1, camoA: 0x2e2018, camoB: 0x5a3d26, camoC: 0x21170f, legs: 0x352619, vest: 0x2a1e15, pack: 0x4a3322, helmet: 0xc5732c, patch: 0xff9f43, gun: 'vandal', packType: 'assault' },
  relay: { hat: 'helmet', face: 'goggles', top: 0x22303f, camo: 2, camoA: 0x1b2633, camoB: 0x31465c, camoC: 0x141c25, legs: 0x1f2b38, vest: 0x1a2430, pack: 0x2a3a4c, helmet: 0x2f4560, patch: 0x5ab0ff, headset: true, gun: 'phantom', packType: 'hydro' }
};
const ACCENT = { sprig: 0xff4f5e, brine: 0x40d1c2, vanta: 0xa08cff, ember: 0xff9f43, relay: 0x5ab0ff };
const SKIN = { sprig: 0xc69076, brine: 0x8d5a3b, vanta: 0x2a2622, ember: 0xe0b89a, relay: 0xa8735a };

const S = { ok: false, failed: false, renderer: null, scene: null, cam: null, ops: {}, agent: 'sprig', host: null, frame: 'home', t: 0, last: 0, shots: {}, raf: 0, lights: {}, motes: null, ring: null };

function styleFor(id) {
  const k = KIT[id] || KIT.sprig, st = Object.assign({}, teamStyle('alpha', id), k);
  st.skin = SKIN[id] || st.skin; st.joint = 0x1a1c20; st.belt = 0x1b1d21; st.knee = 0x17191c; st.boots = 0x17181b;
  return st;
}
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
function init() {
  if (S.renderer || S.failed) return !!S.renderer;
  try {
    const r = S.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.setClearColor(0x000000, 0);
    r.domElement.className = 'menu3d';
    r.domElement.setAttribute('aria-hidden', 'true');
  } catch (e) { S.failed = true; return false; }
  const scene = S.scene = new THREE.Scene();
  S.cam = new THREE.PerspectiveCamera(28, 1, 0.05, 60);
  scene.add(new THREE.HemisphereLight(0x8fa3b8, 0x0b1016, 0.55));
  const key = new THREE.DirectionalLight(0xfff1e2, 1.15); key.position.set(-2.2, 3.0, 3.2); scene.add(key);
  const fill = new THREE.DirectionalLight(0x6f8fb0, 0.35); fill.position.set(2.5, 1.2, 2.5); scene.add(fill);
  const rimA = new THREE.DirectionalLight(0xff4f5e, 4.2); rimA.position.set(-2.6, 2.4, -2.6); scene.add(rimA);
  const rimB = new THREE.DirectionalLight(0x9fe8ff, 1.8); rimB.position.set(2.8, 1.6, -2.4); scene.add(rimB);
  const top = new THREE.SpotLight(0xffffff, 0.9, 12, 0.5, 0.6); top.position.set(0, 5.5, 1.2); top.target.position.set(0, 1, 0); scene.add(top, top.target);
  S.lights = { key, rimA, rimB, top };
  // floor glow + ring
  const tex = glowTex();
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), new THREE.MeshBasicMaterial({ map: tex, color: 0xff4f5e, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.005; scene.add(glow); S.glow = glow;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.595, 64), new THREE.MeshBasicMaterial({ color: 0xece8e1, transparent: true, opacity: 0.35, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; scene.add(ring); S.ring = ring;
  // rising motes
  const N = 160, pos = new Float32Array(N * 3), spd = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 5; pos[i * 3 + 1] = Math.random() * 3.2; pos[i * 3 + 2] = -1.6 + Math.random() * 2.6; spd[i] = 0.05 + Math.random() * 0.18; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const motes = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.025, map: tex, color: 0xffc2c7, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  motes.userData.spd = spd; scene.add(motes); S.motes = motes;
  return true;
}
function getOp(id) {
  if (S.ops[id]) return S.ops[id];
  const st = styleFor(id), op = new Operator('menu-' + id, 'alpha', { style: st, gun: (KIT[id] || KIT.sprig).gun });
  op.group.visible = false; S.scene.add(op.group);
  op.gunHolder.visible = false;
  pose(op, 0); pose(op, Math.random() * 2);
  return (S.ops[id] = op);
}
// relaxed full-body idle (no weapon, no aim IK): the hero stance for menus and portraits
function pose(op, dt) {
  op.setLayer('lower', 'Idle_Loop', 0.3); op.setLayer('upper', 'Idle_Loop', 0.3);
  op.blend(dt || 0.016); op.mixer.update(dt); op.gunHolder.visible = false;
}
function tint(id) {
  const c = new THREE.Color(ACCENT[id] || 0xff4f5e);
  S.lights.rimA.color.copy(c); S.glow.material.color.copy(c);
  S.motes.material.color.copy(c).lerp(new THREE.Color(0xffffff), 0.45);
}
function show(id) {
  for (const k in S.ops) S.ops[k].group.visible = k === id;
  tint(id);
}
// camera framing per screen: where the figure sits and how big
const FRAMES = {
  home: { dist: 4.0, h: 1.08, look: 1.0, shift: 0.0 },
  agents: { dist: 4.3, h: 1.1, look: 1.0, shift: -0.18 },
  select: { dist: 4.4, h: 1.05, look: 0.98, shift: 0.0 }
};
function size() {
  const h = S.host; if (!h) return false;
  const w = h.clientWidth, ht = h.clientHeight; if (!w || !ht) return false;
  const c = S.renderer.domElement;
  if (c.__w !== w || c.__h !== ht) { S.renderer.setSize(w, ht, false); c.__w = w; c.__h = ht; S.cam.aspect = w / ht; S.cam.updateProjectionMatrix(); }
  return true;
}
function frameCam(t) {
  const f = FRAMES[S.frame] || FRAMES.home, narrow = S.cam.aspect < 0.9;
  const d = f.dist * (narrow ? 1.25 : 1), dx = Math.sin(t * 0.13) * 0.32, dy = Math.sin(t * 0.09) * 0.06;
  S.cam.position.set(dx + 0.35, f.h + dy + 0.12, d);
  S.cam.lookAt(dx * 0.4 + 0.02, f.look, 0);
  if (f.shift && !narrow) S.cam.setViewOffset(1000, 1000, -f.shift * 1000, 0, 1000, 1000); else S.cam.clearViewOffset();
  S.cam.updateProjectionMatrix();
}
function tick(now) {
  S.raf = 0;
  const vis = S.host && S.host.isConnected && S.host.offsetParent !== null && document.visibilityState !== 'hidden';
  if (!vis) return;
  S.raf = requestAnimationFrame(tick);
  const dt = Math.min(0.05, ((now || 0) - (S.last || now || 0)) / 1000); S.last = now; S.t += dt;
  if (!size()) return;
  const op = S.ops[S.agent];
  if (op) { op.group.rotation.y = -0.32 + Math.sin(S.t * 0.21) * 0.07; pose(op, dt); }
  const p = S.motes.geometry.attributes.position, spd = S.motes.userData.spd;
  for (let i = 0; i < spd.length; i++) { let y = p.array[i * 3 + 1] + spd[i] * dt; if (y > 3.3) y = 0; p.array[i * 3 + 1] = y; p.array[i * 3] += Math.sin(S.t * 0.6 + i) * 0.0008; }
  p.needsUpdate = true;
  S.ring.material.opacity = 0.22 + Math.sin(S.t * 1.6) * 0.08;
  frameCam(S.t);
  S.renderer.render(S.scene, S.cam);
}
function kick() { if (!S.raf && S.ok) S.raf = requestAnimationFrame(tick); }

/* ---------------- portraits (rendered once, served as blob URLs) ---------------- */
function dataToBlobURL(d) {
  const b = atob(d.split(',')[1]), u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return URL.createObjectURL(new Blob([u], { type: 'image/png' }));
}
function renderPortraits(ids) {
  const r = S.renderer, cam = new THREE.PerspectiveCamera(24, 1, 0.05, 40), out = {};
  const keepGlow = S.glow.visible, keepRing = S.ring.visible, keepMotes = S.motes.visible;
  S.glow.visible = S.ring.visible = S.motes.visible = false;
  const hv = new THREE.Vector3();
  for (const id of ids) {
    const op = getOp(id); show(id);
    op.group.rotation.y = -0.38; pose(op, 0.3); pose(op, 0.3);
    op.group.updateMatrixWorld(true);
    op.bones['DEF-head'].getWorldPosition(hv);
    // bust: head + shoulders, slight three-quarter
    r.setPixelRatio(1); r.setSize(256, 256, false); cam.aspect = 1; cam.fov = 24; cam.clearViewOffset(); cam.updateProjectionMatrix();
    cam.position.set(hv.x + 0.3, hv.y + 0.16, hv.z + 1.25); cam.lookAt(hv.x + 0.02, hv.y + 0.02, hv.z);
    r.render(S.scene, cam); const bust = r.domElement.toDataURL('image/png');
    // full body, 2:3
    r.setSize(400, 600, false); cam.aspect = 400 / 600; cam.fov = 26; cam.updateProjectionMatrix();
    cam.position.set(0.55, 1.15, 4.6); cam.lookAt(0.02, 0.95, 0);
    r.render(S.scene, cam); const full = r.domElement.toDataURL('image/png');
    out[id] = { bust: dataToBlobURL(bust), full: dataToBlobURL(full) };
  }
  S.glow.visible = keepGlow; S.ring.visible = keepRing; S.motes.visible = keepMotes;
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const c = r.domElement; c.__w = c.__h = 0;
  show(S.agent);
  return out;
}

/* ---------------- public API ---------------- */
export const Menu3D = {
  get ok() { return S.ok; },
  ready: null,
  portrait(id, kind = 'bust') { const p = S.shots[id]; return p ? p[kind] : null; },
  setAgent(id) { S.agent = id; if (S.ok) { getOp(id); show(id); } document.documentElement.style.setProperty('--stage-ac', '#' + new THREE.Color(ACCENT[id] || 0xff4f5e).getHexString()); },
  mount(host, frame = 'home') {
    if (!host) return;
    S.frame = frame;
    if (!init()) return;
    S.host = host;
    if (S.renderer.domElement.parentNode !== host) host.appendChild(S.renderer.domElement);
    S.renderer.domElement.__w = 0; kick();
  },
  setFrame(frame) { S.frame = frame; kick(); },
  wake: kick,
  covers() { return S.ok && !!S.host && S.host.isConnected && S.host.offsetParent !== null; }
};
Menu3D.ready = (async () => {
  if (!init()) throw new Error('no webgl');
  await loadCharacters();
  const ids = Object.keys(KIT);
  for (const id of ids) getOp(id);
  S.ok = true;
  try { S.shots = renderPortraits(ids); } catch (e) { console.warn('portrait render failed', e); S.shots = {}; }
  show(S.agent); kick();
  window.dispatchEvent(new CustomEvent('dillystrike:portraits'));
  return true;
})();
Menu3D.ready.catch((e) => console.warn('menu stage unavailable, using vector art', e && e.message));
document.addEventListener('visibilitychange', kick);
window.addEventListener('resize', kick);
window.DillyMenu3D = Menu3D;
