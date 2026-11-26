/* ==========================================================================
   DILLY STRIKE — Official Trailer (captured in-engine)
   Built like the Dilly Gone Mad trailer: a scripted, timed shot list rendered
   LIVE by the game engine (real map, real agents, real weapons/HUD), with
   scripted cameras (crane / dolly / orbit / rack focus), per-shot time of day
   and weather, per-shot motion blur + depth of field, slow-motion impact
   moments, a synthesized WebAudio score that builds to the drop, and a final
   logo card. Press any key to skip (first key unlocks audio if it is blocked).
   ========================================================================== */
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const rnd = (a, b) => a + Math.random() * (b - a);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _v = new THREE.Vector3();
const api = () => (window.DillyStrike && window.DillyStrike.trailer) || null;
let E = null; // engine handle exported by main.js (window.DillyStrike.trailer.engine)

/* =====================================================================
   timeline
   ===================================================================== */
const DROP = 26.4;          // beat drop: score switches from drone to the 128 BPM sequencer
const BPM = 128, SPB = 60 / BPM / 4; // seconds per 16th
const LOGO_T = 53.6;
const DEF_T = 50.2;         // defuse completes
const TR = {
  t: 0, dur: 60, shot: -1, playing: false, unlocked: false, speed: 1, ts: 1, lastAdv: 0,
  bus: null, audio0: null, seqStep: 0, seqNext: 0, fired: new Set(),
  cine: { mb: 0, dof: 0, focus: 10 }, flashT: 0, muzzleT: 0, shake: 0, grade: null
};
const once = (key, lt, at, fn) => { if (lt >= at && !TR.fired.has(key)) { TR.fired.add(key); fn(); } };

// title cards: [start, end, text, position (0 centre, 1 upper third, 2 HUD-safe), kicker]
const CARDS = [
  [1.0, 4.2, 'DILLY GAMING', 0, 'PRESENTS'],
  [5.4, 8.6, 'WELCOME TO DUSTLINE', 1, 'THE DESERT CITADEL'],
  [9.8, 12.8, 'FIVE AGENTS.', 1, 'ONE OBJECTIVE'],
  [14.0, 16.9, 'ONE BOMB.', 1, 'TWO SIDES'],
  [18.0, 21.0, 'GEAR UP.', 1, 'DILL-47 · APEX-50 · KODIAK .50'],
  [22.0, 25.2, 'EVERY ROUND COUNTS.', 1, 'NO SECOND CHANCES'],
  [26.55, 28.6, 'SMOKE.', 1, 'CUT THE SIGHTLINES'],
  [29.35, 31.3, 'FLASH.', 1, 'BLIND THE SITE'],
  [32.15, 33.9, 'BREACH.', 2, 'DILL-47'],
  [35.9, 37.9, 'ONE TAP.', 1, 'KODIAK .50'],
  [38.7, 40.7, 'PLANT.', 1, 'BOMBSITE B'],
  [41.5, 43.5, 'RETAKE.', 1, 'AFTER DARK'],
  [44.3, 45.9, 'CLUTCH.', 2, 'APEX-50 · LAST ALIVE'],
  [48.1, 50.0, 'DEFUSE.', 1, 'EVERY SECOND COUNTS'],
  [50.9, 53.1, 'FIGHT FOR EVERY ROUND', 1, '']
];
const HITS = [1.0, 5.4, 9.8, 14.0, 18.0, 22.0, DROP, 29.2125, 32.025, 35.775, 38.5875, 41.4, 44.2125, 47.9625, 50.775, LOGO_T];
const BIG_HITS = new Set([DROP, 44.2125, LOGO_T]);

// bomb-timer beeps (shared by the LED blink and the score so they stay in sync)
const BEEPS = (() => {
  const b = [];
  for (let t = 39.6; t < 41.4; t += 0.9) b.push(t);
  for (let t = 41.55; t < 44.2; t += 0.7) b.push(t);
  for (let t = 44.4; t < 47.96; t += 0.5) b.push(t);
  let t = 48.05, p = 0.42; while (t < DEF_T - 0.05) { b.push(t); t += p; p = Math.max(0.09, p * 0.8); }
  return b;
})();

/* =====================================================================
   scene props (created once, added to the scene only while the trailer runs)
   ===================================================================== */
const P = { ready: false, lights: [], lamps: [], smokes: [], nades: [], charge: null, led: null, ledL: null, flashL: null, muzzleL: null, dust: null, storm: null, soft: null, sky: null, sun: null, hemi: null, saved: null, skyTex: {}, chargeState: 'off', weather: null, smokeTint: 0xd8d2c8 };

function softTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; const r = rnd(4, 14); x.beginPath(); x.arc(64 + rnd(-40, 40), 64 + rnd(-40, 40), r, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); return t;
}

function buildCharge() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.26), new THREE.MeshStandardMaterial({ color: 0x3b4233, roughness: 0.8, metalness: 0.2 }));
  body.position.y = 0.05; body.castShadow = true; g.add(body);
  const stickMat = new THREE.MeshStandardMaterial({ color: 0xb7864d, roughness: 0.75 });
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.34, 10), stickMat);
    s.rotation.z = Math.PI / 2; s.position.set(0, 0.135, -0.075 + i * 0.075); s.castShadow = true; g.add(s);
  }
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.25), new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.6 }));
  tape.position.set(0.09, 0.14, 0); g.add(tape);
  const pc = document.createElement('canvas'); pc.width = 128; pc.height = 64;
  const px = pc.getContext('2d'); px.fillStyle = '#0b1a0e'; px.fillRect(0, 0, 128, 64);
  px.fillStyle = '#5dff7a'; px.font = 'bold 34px monospace'; px.textAlign = 'center'; px.fillText('* * * *', 64, 44);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.1), [0, 0, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pc) }), 0, 0, 0].map((m) => m || new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.5 })));
  panel.position.set(-0.07, 0.19, 0.0); g.add(panel);
  for (const [col, z] of [[0xd62828, 0.05], [0x2a6fdb, -0.05]]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.007, 6, 14, Math.PI), new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 }));
    w.position.set(0.1, 0.17, z); w.rotation.y = Math.PI / 2; g.add(w);
  }
  P.led = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), new THREE.MeshBasicMaterial({ color: 0x401010 }));
  P.led.position.set(-0.14, 0.21, 0.04); g.add(P.led);
  g.visible = false;
  return g;
}

function skyTexture(stops, sun, stars) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, 512);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  x.fillStyle = gr; x.fillRect(0, 0, 1024, 512);
  if (stars) {
    for (let i = 0; i < 900; i++) { const y = Math.pow(Math.random(), 1.6) * 250; x.fillStyle = `rgba(255,255,255,${rnd(0.25, 0.95) * (1 - y / 270)})`; x.fillRect(Math.random() * 1024, y, Math.random() < 0.1 ? 2 : 1, Math.random() < 0.1 ? 2 : 1); }
  }
  if (sun) {
    // place the glow where the light actually comes from (SphereGeometry UV layout)
    const [dx, dy, dz] = sun.dir, phi = Math.atan2(dz, -dx), u = ((phi / (Math.PI * 2)) % 1 + 1) % 1;
    const el = Math.atan2(dy, Math.hypot(dx, dz)), v = 0.5 + el / Math.PI, cx = u * 1024, cy = (1 - v) * 512;
    for (const ox of [0, -1024, 1024]) {
      const g = x.createRadialGradient(cx + ox, cy, 2, cx + ox, cy, sun.r * 2);
      g.addColorStop(0, sun.col); g.addColorStop(0.08, sun.col); g.addColorStop(0.3, sun.halo); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(cx + ox - sun.r * 2, cy - sun.r * 2, sun.r * 4, sun.r * 4);
    }
  }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; // engine renders in a linear (sRGB-correct) workflow
}

// time-of-day / weather presets (applied instantly on the cut, like DGM's setPreset)
const TOD = {
  dawn: { stops: [[0, '#1b2647'], [0.36, '#5b6798'], [0.48, '#e99f7c'], [0.56, '#f6c99c'], [1, '#c9a27d']], sun: { dir: [-0.82, 0.2, -0.52], col: '#fff1dc', halo: 'rgba(255,170,120,.35)', r: 46 },
    sunCol: 0xffb98a, sunI: 1.15, hemi: [0xaab8ff, 0x6b5640, 0.62], fog: [0xc9a58e, 0.0105], exp: 1.02, grade: { tint: [1.03, 0.98, 1.0], sat: 1.06, con: 1.05, lift: [0.0, 0.0, 0.015] }, smoke: 0xd9cfca, lamps: 0 },
  noon: { stops: [[0, '#3a6ea5'], [0.45, '#8ab4d8'], [0.72, '#e6d6b8'], [1, '#d6be96']], sun: { dir: [0.5, 0.8, 0.31], col: '#fffbe8', halo: 'rgba(255,235,190,.4)', r: 40 },
    sunCol: 0xfff0d2, sunI: 1.45, hemi: [0xf6f9ff, 0x8d7658, 0.78], fog: [0xd2c4aa, 0.0082], exp: 1.08, grade: { tint: [1.0, 1.0, 1.0], sat: 1.05, con: 1.05, lift: [0, 0, 0] }, smoke: 0xdcd8d0, lamps: 0 },
  golden: { stops: [[0, '#2c4a7e'], [0.38, '#9a8ea4'], [0.49, '#f2ad66'], [0.57, '#f8d090'], [1, '#d9a46e']], sun: { dir: [0.92, 0.2, 0.34], col: '#fff3d0', halo: 'rgba(255,190,110,.42)', r: 58 },
    sunCol: 0xffc283, sunI: 1.75, hemi: [0xffe2c0, 0x8a6a48, 0.6], fog: [0xdcb07c, 0.0088], exp: 1.04, grade: { tint: [1.07, 1.0, 0.9], sat: 1.12, con: 1.08, lift: [0.01, 0.0, 0.0] }, smoke: 0xe2d2bf, lamps: 0 },
  dusk: { stops: [[0, '#101833'], [0.34, '#3d3463'], [0.47, '#c4596a'], [0.54, '#f28a54'], [1, '#7a4a40']], sun: { dir: [0.94, 0.07, -0.3], col: '#ffd7a0', halo: 'rgba(255,120,80,.4)', r: 50 },
    sunCol: 0xff8c5a, sunI: 1.1, hemi: [0x8a90d8, 0x5a3f30, 0.5], fog: [0x6e5068, 0.012], exp: 1.02, grade: { tint: [1.05, 0.95, 1.02], sat: 1.08, con: 1.1, lift: [0.01, 0, 0.02] }, smoke: 0xa8909a, lamps: 0.55 },
  night: { stops: [[0, '#02040b'], [0.38, '#081127'], [0.5, '#1a2a4e'], [0.58, '#22304f'], [1, '#151a26']], stars: true, sun: { dir: [-0.42, 0.62, 0.5], col: '#f4f7ff', halo: 'rgba(160,190,255,.22)', r: 14 },
    sunCol: 0x9db8ff, sunI: 0.22, hemi: [0x4a5f9c, 0x16130f, 0.18], fog: [0x0c1322, 0.0135], exp: 0.98, grade: { tint: [0.92, 0.98, 1.12], sat: 0.95, con: 1.12, lift: [0, 0.006, 0.022] }, smoke: 0x5a6070, lamps: 1 },
  storm: { stops: [[0, '#8e6a45'], [0.42, '#c0925f'], [0.52, '#d8aa72'], [1, '#b48a5d']], sun: { dir: [0.92, 0.22, 0.32], col: '#fff6e0', halo: 'rgba(255,210,150,.5)', r: 80 },
    sunCol: 0xffcf96, sunI: 1.0, hemi: [0xf0cfa0, 0x7a5a3a, 0.95], fog: [0xc89b69, 0.034], exp: 1.0, grade: { tint: [1.06, 0.98, 0.86], sat: 0.9, con: 1.06, lift: [0.015, 0.008, 0] }, smoke: 0xd8c0a0, lamps: 0 }
};

function initProps() {
  if (P.ready) return;
  const { scene } = E;
  P.sky = scene.children.find((o) => o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry' && o.material && o.material.side === THREE.BackSide);
  P.sun = scene.children.find((o) => o.isDirectionalLight);
  P.hemi = scene.children.find((o) => o.isHemisphereLight);
  for (const k in TOD) P.skyTex[k] = skyTexture(TOD[k].stops, TOD[k].sun, TOD[k].stars);
  P.soft = softTexture();
  // site lamps (only lit at night), bomb LED light, flashbang light, muzzle light — fixed count so no shader recompiles mid-trailer
  for (const [x, y, z] of [[-4, 5.25, 19.25], [4, 5.25, -19.25], [0, 5.6, 1.5]]) {
    const L = new THREE.PointLight(0xffa860, 0, 20, 1.4); L.position.set(x, y, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.28), new THREE.MeshBasicMaterial({ color: 0xffe2b0 }));
    m.position.set(x, y + 0.12, z); m.visible = false;
    P.lamps.push({ L, m }); P.lights.push(L, m);
  }
  P.ledL = new THREE.PointLight(0xff2424, 0, 5, 2);
  P.flashL = new THREE.PointLight(0xffffff, 0, 30, 1.4);
  P.muzzleL = new THREE.PointLight(0xffb050, 0, 8, 2);
  P.lights.push(P.ledL, P.flashL, P.muzzleL);
  P.charge = buildCharge(); P.lights.push(P.charge);
  // floating dust motes (sun shafts) and a wind-driven sandstorm layer
  const mkPts = (n, box, size, color, opacity, additive) => {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = rnd(-box[0], box[0]); pos[i * 3 + 1] = rnd(0.1, box[1]); pos[i * 3 + 2] = rnd(-box[2], box[2]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ size, map: P.soft, color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const p = new THREE.Points(g, m); p.frustumCulled = false; p.visible = false; p.userData.box = box; return p;
  };
  P.dust = mkPts(1600, [36, 7, 26], 0.07, 0xffe0b0, 0.75, true);
  P.storm = mkPts(3200, [40, 9, 30], 0.22, 0xd2a46c, 0.42, false);
  P.lights.push(P.dust, P.storm);
  P.ready = true;
}

function saveWorld() {
  P.saved = {
    sky: P.sky ? P.sky.material.map : null,
    sunCol: P.sun ? P.sun.color.getHex() : 0, sunI: P.sun ? P.sun.intensity : 1, sunPos: P.sun ? P.sun.position.clone() : null,
    hemiSky: P.hemi ? P.hemi.color.getHex() : 0, hemiGround: P.hemi ? P.hemi.groundColor.getHex() : 0, hemiI: P.hemi ? P.hemi.intensity : 1,
    fog: E.scene.fog ? E.scene.fog.color.getHex() : 0, fogD: E.scene.fog ? E.scene.fog.density : 0, exp: E.renderer.toneMappingExposure
  };
  for (const o of P.lights) E.scene.add(o);
}
function restoreWorld() {
  const s = P.saved; if (!s) return;
  if (P.sky) { P.sky.material.map = s.sky; P.sky.material.needsUpdate = true; }
  if (P.sun) { P.sun.color.setHex(s.sunCol); P.sun.intensity = s.sunI; P.sun.position.copy(s.sunPos); }
  if (P.hemi) { P.hemi.color.setHex(s.hemiSky); P.hemi.groundColor.setHex(s.hemiGround); P.hemi.intensity = s.hemiI; }
  if (E.scene.fog) { E.scene.fog.color.setHex(s.fog); E.scene.fog.density = s.fogD; }
  E.renderer.toneMappingExposure = s.exp;
  for (const o of P.lights) E.scene.remove(o);
  P.saved = null;
}

function applyTOD(name) {
  const p = TOD[name] || TOD.noon;
  if (P.sky) { P.sky.material.map = P.skyTex[name]; P.sky.material.needsUpdate = true; }
  if (P.sun) { P.sun.color.setHex(p.sunCol); P.sun.intensity = p.sunI; P.sun.position.set(p.sun.dir[0], p.sun.dir[1], p.sun.dir[2]).normalize().multiplyScalar(70); }
  if (P.hemi) { P.hemi.color.setHex(p.hemi[0]); P.hemi.groundColor.setHex(p.hemi[1]); P.hemi.intensity = p.hemi[2]; }
  if (E.scene.fog) { E.scene.fog.color.setHex(p.fog[0]); E.scene.fog.density = p.fog[1]; }
  E.renderer.toneMappingExposure = p.exp;
  for (const l of P.lamps) { l.L.intensity = 1.6 * p.lamps; l.m.visible = p.lamps > 0.5; }
  TR.grade = p.grade; P.smokeTint = p.smoke;
}
function setWeather(w) {
  P.weather = w || null;
  P.dust.visible = w === 'dust';
  P.storm.visible = w === 'storm';
}

function clearProps() {
  for (const s of P.smokes) for (const q of s.parts) { E.scene.remove(q.m); q.m.material.dispose(); }
  P.smokes = [];
  for (const n of P.nades) E.scene.remove(n.m);
  P.nades = [];
  if (P.charge.parent !== E.scene) E.scene.add(P.charge);
  P.charge.visible = false; P.charge.position.set(0, -10, 0); P.charge.rotation.set(0, 0, 0); P.chargeState = 'off';
  P.ledL.intensity = 0; P.flashL.intensity = 0; P.muzzleL.intensity = 0;
  TR.flashT = 0; TR.muzzleT = 0;
}

/* ---------- scripted FX ---------- */
function smokeCloud(x, z) {
  const parts = [];
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: P.soft, color: P.smokeTint, transparent: true, opacity: 0, depthWrite: false }));
    m.position.set(x, 0.4, z); m.material.rotation = rnd(0, 6.28); E.scene.add(m);
    parts.push({ m, dir: V(rnd(-1, 1), rnd(0.05, 0.9), rnd(-1, 1)).normalize(), r: rnd(1.2, 3.0), s: rnd(2.8, 4.8), spin: rnd(-0.25, 0.25) });
  }
  P.smokes.push({ x, z, age: 0, parts });
  E.sfxNoise(0.5, 420, 0.22); E.sfxNoise(1.4, 2600, 0.05);
}
function nade(kind, p0, p1, dur, h, onLand) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.15, 10), new THREE.MeshStandardMaterial({ color: kind === 'smoke' ? 0x6f7d5e : 0x9aa4ae, roughness: 0.5, metalness: 0.5 }));
  m.castShadow = true; m.position.copy(p0); E.scene.add(m);
  P.nades.push({ m, p0: p0.clone(), p1: p1.clone(), dur, h, age: 0, onLand, done: false, kind });
  E.sfxNoise(0.12, 900, 0.08);
}
function flashPop(pos) {
  P.flashL.position.copy(pos).setY(pos.y + 0.6); P.flashL.intensity = 70;
  TR.flashT = 1;
  E.sfxTone(1900, 0.5, 'sine', 0.12, 2600); E.sfxNoise(0.35, 3000, 0.32);
}
function updateProps(wdt, adv) {
  for (const n of P.nades) {
    if (n.done && n.kind === 'flash') continue;
    n.age += wdt; const u = Math.min(1, n.age / n.dur);
    if (!n.done) {
      n.m.position.lerpVectors(n.p0, n.p1, u); n.m.position.y += 4 * n.h * u * (1 - u);
      n.m.rotation.x += wdt * 14; n.m.rotation.z += wdt * 9;
      if (u >= 1) { n.done = true; n.m.rotation.set(Math.PI / 2, 0, rnd(0, 3)); if (n.onLand) n.onLand(n); if (n.kind === 'flash') n.m.visible = false; }
    }
  }
  for (const s of P.smokes) {
    s.age += wdt; const k = 1 - Math.exp(-s.age * 2.4);
    for (const q of s.parts) {
      q.m.position.set(s.x + q.dir.x * q.r * k, 0.9 + q.dir.y * q.r * k * 0.9 + k * 0.7, s.z + q.dir.z * q.r * k);
      const sc = q.s * (0.3 + 0.7 * k); q.m.scale.set(sc, sc, 1);
      q.m.material.opacity = Math.min(1, s.age * 3.5) * 0.88; q.m.material.rotation += q.spin * wdt;
    }
  }
  P.flashL.intensity *= Math.exp(-wdt * 7);
  TR.flashT = Math.max(0, TR.flashT - wdt * 1.25);
  TR.muzzleT -= wdt; P.muzzleL.intensity = TR.muzzleT > 0 ? 5 : 0;
  // bomb LED (synced to the beep track)
  if (P.charge.visible && P.chargeState !== 'off') {
    let on = false;
    if (P.chargeState === 'defused') on = true;
    else for (const b of BEEPS) { const d = TR.t - b; if (d >= 0 && d < 0.1) { on = true; break; } }
    const green = P.chargeState === 'defused';
    P.led.material.color.setHex(on ? (green ? 0x50ff7a : 0xff2a2a) : 0x401010);
    P.ledL.color.setHex(green ? 0x40ff70 : 0xff2424);
    P.led.getWorldPosition(P.ledL.position); P.ledL.position.y += 0.08;
    P.ledL.intensity = on ? (green ? 1.6 : 3.2) : 0.12;
  } else P.ledL.intensity = 0;
  // particles
  const cam = E.camera.position;
  if (P.dust.visible) {
    const a = P.dust.geometry.attributes.position, arr = a.array;
    for (let i = 0; i < arr.length; i += 3) { arr[i] += wdt * 0.25; arr[i + 1] += Math.sin(TR.t * 0.7 + i) * wdt * 0.05; if (arr[i] > 36) arr[i] -= 72; }
    a.needsUpdate = true;
  }
  if (P.storm.visible) {
    const a = P.storm.geometry.attributes.position, arr = a.array, bx = P.storm.userData.box;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] -= wdt * 13; arr[i + 1] += Math.sin(TR.t * 3 + i * 0.37) * wdt * 0.6 - wdt * 0.4; arr[i + 2] += wdt * 2.2;
      if (arr[i] < cam.x - bx[0]) arr[i] += bx[0] * 2; if (arr[i + 2] > cam.z + bx[2]) arr[i + 2] -= bx[2] * 2;
      if (arr[i + 1] < 0.05) arr[i + 1] += bx[1];
    }
    a.needsUpdate = true;
  }
}

/* ---------- actors ---------- */
function actor(name, team, x, z, o = {}) {
  const a = E.spawnActor({ name, team, x, z, tx: o.tx, tz: o.tz, speed: o.speed, hp: o.hp, kills: o.kills, deaths: o.deaths, cash: o.cash, lookAt: o.look || null });
  a.model.group.traverse((c) => { if (c.isSprite) c.visible = false; }); // no floating name tags in the cinematic
  return a;
}
const byName = (n) => E.bots().find((b) => b.name === n);
function muzzleOf(a) { return a.model.group.localToWorld(V(0.34, 1.16, 0.8)); }
function kill(a, head) {
  if (!a || a.hp <= 0) return;
  a.hp = 0; a.deaths++;
  E.sparks(V(a.pos.x, head ? 1.74 : 1.25, a.pos.z), 0xffd166, head ? 10 : 6);
}
function actorFire(a, target, o = {}) {
  if (!a || a.hp <= 0) return;
  const m = muzzleOf(a);
  const end = target.isVector3 ? target.clone() : V(target.pos.x + rnd(-0.2, 0.2), o.head ? 1.74 : rnd(1.0, 1.6), target.pos.z + rnd(-0.2, 0.2));
  E.tracer(m, end, a.team === 'alpha' ? 0xa8d8ff : 0xffd36b);
  P.muzzleL.position.copy(m); TR.muzzleT = 0.05;
  if (o.sfx !== false) E.playShot(o.wep || 'vandal');
  if (o.kill && !target.isVector3) kill(target, o.head);
}
function kneel(a, k = 1) {
  if (!a) return;
  const g = a.model.group; g.position.y = -0.3 * k;
  for (const [leg, sx] of [[a.model.legL, -0.16], [a.model.legR, 0.16]]) { leg.rotation.x = -1.4 * k; leg.position.set(sx, 0.34 + 0.08 * k, 0.24 * k); }
}
function blind(a, lt) { // flashed: turn away, sway
  if (!a || a.hp <= 0) return;
  a.model.group.rotation.z = Math.sin(lt * 9 + a.pos.x) * 0.12;
  a.model.group.rotation.y += Math.sin(lt * 3.1 + a.pos.z) * 0.9;
}

/* ---------- player (POV) helpers ---------- */
function setMe(o) {
  const me = E.me;
  Object.assign(me, { name: 'DillyAgent', team: 'alpha', crouching: false, recoilKick: 0, reloadTimer: 0, inspectTimer: 0 }, o.state || {});
  me.owned = new Set(o.owned || ['vandal', 'sheriff', 'knife']);
  if (o.ammo) Object.assign(me.ammo, o.ammo);
  me.pos.set(o.pos[0], 0, o.pos[1]); me.vel.set(0, 0, 0);
  const dx = o.look[0] - o.pos[0], dz = o.look[2] - o.pos[1];
  me.yaw = Math.atan2(-dx, -dz); me.pitch = Math.atan2(o.look[1] - 1.62, Math.hypot(dx, dz));
  E.equipWeapon(o.wep);
  if (o.score) E.setScore(o.score[0], o.score[1]);
  if (o.time) E.setRoundTime(o.time);
  E.syncHud(); E.drawRadar();
}
function povShoot(target, head, dmg = 40) {
  const me = E.me, w = E.WEAPONS[me.weaponId];
  const hp = V(target.pos.x, head ? 1.72 : 1.22, target.pos.z);
  E.shoot({ actor: null, wallPt: hp }); // real recoil, muzzle flash, viewmodel kick, ammo, sound, tracer & wall decal
  E.sparks(hp, 0xffd166, head ? 10 : 5);
  E.hitmarker(head); if (head) E.playHeadshot();
  target.hp -= head ? 999 : dmg;
  if (target.hp <= 0) {
    target.hp = 0; target.deaths++; me.kills++; me.cash = Math.min(16000, me.cash + 300);
    E.killfeed(me.name, target.name, w.name, head, 'alpha', 'omega', true);
  }
  E.syncHud();
}

/* ---------- camera ---------- */
function setCam(x, y, z, lx, ly, lz, fov, roll = 0) {
  const c = E.camera; c.position.set(x, y, z); c.lookAt(lx, ly, lz); if (roll) c.rotateZ(roll);
  if (Math.abs(c.fov - fov) > 1e-3) { c.fov = fov; c.updateProjectionMatrix(); }
}
function setFov(f) { const c = E.camera; if (Math.abs(c.fov - f) > 1e-3) { c.fov = f; c.updateProjectionMatrix(); } }
const distTo = (x, y, z) => E.camera.position.distanceTo(_v.set(x, y, z));
const distToA = (a) => (a ? distTo(a.pos.x, 1.4, a.pos.z) : 10);

/* =====================================================================
   the shot list
   ===================================================================== */
const SQUAD = ['DillyAgent', 'Falcon', 'Frost', 'Warden', 'Striker'];
const SHOTS = [
  // 0 — dawn crane: over the shoulders of the T squad, rising over spawn cover to reveal the citadel
  { t0: 0, tod: 'dawn', weather: 'dust', dof: 0.3,
    enter() {
      const L = V(-10, 0, 0);
      actor('BOT-Ember', 'omega', 31.4, 1.4, { look: L }); actor('BOT-Adder', 'omega', 32.6, -1.3, { look: L }); actor('BOT-Scythe', 'omega', 30.4, 3.6, { look: L });
    },
    cam(lt) { const e = ease(lt / 4.6); setCam(35.4 - e * 3.2, 1.55 + e * 11.5, 2.6 + e * 6.5, lerp(24, -8, e), lerp(2.1, 1.0, e), lerp(1.2, -3.5, e), 50 - e * 6); },
    focus(lt) { return lt < 2.2 ? 4.2 : 32; } },
  // 1 — dawn: low ground dolly across A site, rack focus from the sand to the "A" wall
  { t0: 4.6, tod: 'dawn', weather: 'dust', dof: 0.7,
    enter() { actor('BOT-Wisp', 'omega', -5, -22.2, { tx: 11, tz: -22.6, speed: 1.9, look: V(30, 0, -22.6) }); },
    cam(lt) { setCam(-4.2 + lt * 1.25, 0.42 + lt * 0.06, -4.6, 3.8, 1.9, -17.6, 50 - lt * 1.6); },
    focus(lt) { return lerp(2.4, 13, ease((lt - 1.4) / 1.2)); } },
  // 2 — hero reveal: the defender squad walks out of spawn, low tracking shot
  { t0: 9.0, tod: 'noon', dof: 0.4,
    enter() {
      const L = V(20, 0, -8), pos = [[-23.5, -8], [-24.9, -10.2], [-24.9, -5.8], [-26.3, -12.4], [-26.3, -3.6]];
      SQUAD.forEach((n, i) => actor(n, 'alpha', pos[i][0], pos[i][1], { tx: pos[i][0] + 9.5, tz: pos[i][1], speed: 1.6, look: L }));
    },
    cam(lt) { const d = byName('DillyAgent'); setCam(-15.6 + lt * 0.9, 0.8 + lt * 0.05, -7.0, d.pos.x, 1.35, d.pos.z - 0.3, 42); },
    focus() { return distToA(byName('DillyAgent')); } },
  // 3 — the T squad readies the charge behind the B crates; slow orbit
  { t0: 13.4, tod: 'noon', dof: 0.45,
    enter() {
      const L = V(-4, 0, 20);
      const k = actor('BOT-Kodiak', 'omega', 20.2, 11.2, { look: L }); actor('BOT-Scythe', 'omega', 21.9, 9.9, { look: L });
      actor('BOT-Wisp', 'omega', 18.7, 9.5, { look: L }); actor('BOT-Adder', 'omega', 22.7, 12.3, { look: L });
      k.model.group.add(P.charge); P.charge.visible = true; P.charge.position.set(0, 1.1, -0.27); P.charge.rotation.set(Math.PI / 2, 0, 0);
    },
    cam(lt) { const a = 2.42 + lt * 0.17, r = 5.2 - lt * 0.15; setCam(20.6 + Math.cos(a) * r, 1.5 + lt * 0.12, 11 + Math.sin(a) * r, 20.4, 1.35, 10.9, 40); },
    focus() { return distToA(byName('BOT-Kodiak')); } },
  // 4 — GEAR UP: first-person arsenal (real viewmodels + inspect animation)
  { t0: 17.4, tod: 'noon', dof: 0, pov: true,
    enter() { setMe({ pos: [-16, 2], look: [0, 1.7, 0.5], wep: 'vandal', owned: ['vandal', 'operator', 'sheriff', 'knife'], state: { hp: 100, shield: 100, cash: 4750 } }); },
    update(lt, dt) {
      const me = E.me;
      once('i1', lt, 0.1, () => { me.inspectTimer = 1.6; });
      once('w2', lt, 1.7, () => { E.equipWeapon('operator'); me.inspectTimer = 1.25; E.sfxTone(440, 0.08, 'triangle', 0.06, 660); });
      once('w3', lt, 2.95, () => { E.equipWeapon('sheriff'); me.inspectTimer = 1.0; E.sfxTone(520, 0.08, 'triangle', 0.06, 760); });
      E.pov(dt, V(-14.4, 0, 2), V(0, 1.6 + Math.sin(lt) * 0.1, 0.5), 0.45, 6);
      setFov(62);
    } },
  // 5 — top-down drone over the whole map as both teams converge (riser into the drop)
  { t0: 21.4, tod: 'noon', dof: 0, mb: 0.2,
    enter() {
      const cts = [[-24, -22, -5, -22.4], [-24, -24.6, -7, -24.8], [-24, 9.4, -6, 10.2], [-25, 2.5, -12.5, 2.6]];
      cts.forEach(([x, z, tx, tz], i) => actor(SQUAD[i], 'alpha', x, z, { tx, tz, speed: 3.9, look: V(tx + 10, 0, tz) }));
      const ts = [[25, -12, 12, -12.2], [26, -3, 13, -3], [25, 22.4, 8, 22.6], [26, 8.2, 14, 8.2]];
      ts.forEach(([x, z, tx, tz], i) => actor(['BOT-Ember', 'BOT-Adder', 'BOT-Kodiak', 'BOT-Wisp'][i], 'omega', x, z, { tx, tz, speed: 3.8, look: V(tx - 10, 0, tz) }));
    },
    update(lt) { if (lt > 3.6 && Math.random() < 0.25) { const a = E.bots(), s = a[Math.floor(Math.random() * 4)], d = a[4 + Math.floor(Math.random() * 4)]; if (Math.random() < 0.5) actorFire(s, d, { sfx: false }); else actorFire(d, s, { sfx: false }); } },
    cam(lt) { const a = 0.35 + lt * 0.09, h = 40 - ease(lt / 5) * 11; setCam(Math.sin(a) * 9, h, Math.cos(a) * 9 + 1, 0, 0, 0.5, 52, 0); } },

  /* ---------------- DROP ---------------- */
  // 6 — SMOKE: over-the-shoulder throw, the cloud blooms in slow motion
  { t0: DROP, tod: 'golden', weather: 'dust', mb: 0.3, dof: 0.5,
    enter() {
      actor('Frost', 'alpha', -15.4, 8.6, { look: V(0, 0, 8.8) });
      actor('BOT-Adder', 'omega', 6.5, 9.2, { tx: -2.5, tz: 9.6, speed: 3.2, look: V(-15, 0, 9) });
    },
    slow(lt) { return lt < 1.15 ? 1 : lerp(1, 0.42, ease((lt - 1.15) / 0.35)); },
    update(lt) { once('throw', lt, 0.22, () => nade('smoke', V(-15.0, 1.75, 8.7), V(-5.0, 0.08, 9.2), 0.9, 2.4, (n) => smokeCloud(n.p1.x + 0.6, n.p1.z))); },
    cam(lt) { const e = ease(lt / 2.8); setCam(-18.3 + e * 0.9, 1.72, 9.9 - e * 0.15, -5.6, 1.4, 8.8, 44 - e * 3); },
    focus(lt) { return lt < 0.9 ? distToA(byName('Frost')) : distTo(-5, 1.4, 9.2); } },
  // 7 — FLASH: the grenade sails over the camera onto A; Ts blinded
  { t0: 29.2125, tod: 'golden', weather: 'dust', mb: 0.25, dof: 0.35,
    enter() { const L = V(-10, 0, -10); actor('BOT-Ember', 'omega', 10.4, -13.4, { look: L }); actor('BOT-Adder', 'omega', 12.6, -12.3, { look: L }); actor('BOT-Scythe', 'omega', 13.2, -14.6, { look: L }); },
    slow(lt) { return lt > 0.92 && lt < 1.7 ? 0.5 : 1; },
    update(lt) {
      once('throw', lt, 0.08, () => nade('flash', V(-3, 2.6, -9.2), V(8.6, 0.2, -12.2), 0.82, 1.9, (n) => flashPop(n.p1)));
      if (TR.flashT > 0 || lt > 1.2) for (const a of E.bots()) blind(a, lt);
    },
    cam(lt) { setCam(4.6 + lt * 0.35, 1.22, -8.0, 11.4, 1.5, -13.3, 40); },
    focus() { return distTo(11.4, 1.4, -13.3); } },
  // 8 — BREACH: live first-person Dill-47 entry with the real HUD
  { t0: 32.025, tod: 'golden', hud: true, pov: true, mb: 0.18, dof: 0,
    enter() {
      setMe({ pos: [-4.5, -10.6], look: [10.5, 1.7, -13.6], wep: 'vandal', state: { hp: 100, shield: 100, cash: 4400, kills: 14, deaths: 7 }, ammo: { vandal: [30, 90] }, score: [10, 10], time: 52 });
      actor('BOT-Ember', 'omega', 10.6, -13.6, { look: V(-10, 0, -10), kills: 9, deaths: 10 });
      actor('BOT-Adder', 'omega', 12.8, -12.2, { look: V(-10, 0, -10), kills: 8, deaths: 10 });
      actor('BOT-Scythe', 'omega', 13.6, -19.8, { tx: 11.6, tz: -19.9, speed: 2.4, look: V(-4, 0, -12), kills: 7, deaths: 11 });
      actor('Falcon', 'alpha', -12, -3, { kills: 9, deaths: 8 }).model.group.visible = false;
      E.syncHud();
    },
    update(lt, dt) {
      const ph = byName('BOT-Ember'), vp = byName('BOT-Adder'), rp = byName('BOT-Scythe');
      for (const a of [ph, vp]) if (a.hp > 0) blind(a, lt + 2);
      once('s1', lt, 0.72, () => povShoot(ph, true));
      once('s2', lt, 1.28, () => povShoot(vp, false, 36));
      once('s3', lt, 1.40, () => povShoot(vp, true));
      once('rp', lt, 2.0, () => actorFire(rp, V(E.me.pos.x + 1.2, 1.5, E.me.pos.z + 0.8)));
      once('s4', lt, 2.32, () => povShoot(rp, true));
      once('rl', lt, 2.95, () => { E.me.reloadTimer = 1.4; E.sfxTone(280, 0.12, 'triangle', 0.08, 460); E.syncHud(); });
      let look = V(10.5, 1.72, -13.6);
      if (lt > 0.5 && lt < 1.05) look = V(ph.pos.x, 1.72, ph.pos.z);
      else if (lt >= 1.05 && lt < 1.8) look = V(vp.pos.x, 1.70, vp.pos.z);
      else if (lt >= 1.8) look = V(rp.pos.x, 1.70, rp.pos.z);
      E.pov(dt, lt < 2.2 ? V(3.4, 0, -11.9) : V(4.6, 0, -12.6), look, 5.2, 16);
      setFov(76);
    } },
  // 9 — ONE TAP: over-the-shoulder Kodiak .50 headshot in slow motion, rack focus to the target
  { t0: 35.775, tod: 'dusk', mb: 0.2, dof: 0.75,
    enter() {
      const d = actor('DillyAgent', 'alpha', -14, 12, { look: V(6, 0, 12.6) });
      d.model.group.children.find((c) => c.geometry && c.geometry.parameters && c.geometry.parameters.depth === 0.78)?.scale.set(1, 1, 0.45);
      actor('BOT-Wisp', 'omega', 8.4, 13.7, { tx: 1.5, tz: 12.9, speed: 4.8, look: V(-14, 0, 12) });
    },
    slow(lt) { return lt < 0.5 ? 1 : lt < 0.8 ? lerp(1, 0.2, ease((lt - 0.5) / 0.3)) : lt < 1.9 ? 0.2 : lerp(0.2, 1, ease((lt - 1.9) / 0.6)); },
    update(lt) { once('tap', lt, 0.98, () => { actorFire(byName('DillyAgent'), byName('BOT-Wisp'), { head: true, kill: true, wep: 'sheriff' }); TR.shake = 0.25; }); },
    cam(lt) { const e = ease(lt / 2.8); setCam(-16.7, 1.66, 10.9 + e * 0.3, 1.5, 1.42, 12.9, 36 - e * 3); },
    focus(lt) { return lt < 0.85 ? distToA(byName('DillyAgent')) : distToA(byName('BOT-Wisp')); } },
  // 10 — PLANT: macro close-up on bombsite B, rack focus from the T to the charge
  { t0: 38.5875, tod: 'dusk', dof: 0.5,
    enter() { actor('BOT-Kodiak', 'omega', 2.25, 22.75, { look: V(1.3, 0, 21.4) }); },
    update(lt) {
      const k = byName('BOT-Kodiak'); kneel(k, ease(lt / 0.35));
      once('drop', lt, 0.45, () => { P.charge.visible = true; P.charge.rotation.set(0, 0.5, 0); E.sfxNoise(0.1, 700, 0.12); });
      if (P.charge.visible) P.charge.position.set(1.3, Math.max(0, 0.32 - (lt - 0.45) * 1.2), 21.4);
      once('arm', lt, 0.95, () => { P.chargeState = 'armed'; });
    },
    cam(lt) { const e = ease(lt / 2.8); setCam(lerp(-0.7, 0.05, e), lerp(0.42, 0.34, e), lerp(19.15, 19.85, e), 1.3, 0.22, 21.45, lerp(34, 29, e)); },
    focus(lt) { return lt < 0.9 ? distToA(byName('BOT-Kodiak')) : distTo(1.3, 0.15, 21.4); } },
  // 11 — RETAKE: night falls, high wide move over B as the defenders push in under fire
  { t0: 41.4, tod: 'night', mb: 0.28, dof: 0.2,
    enter() {
      P.charge.visible = true; P.charge.position.set(1.3, 0, 21.4); P.charge.rotation.set(0, 0.5, 0); P.chargeState = 'armed';
      actor('BOT-Kodiak', 'omega', 2.8, 25.2, { look: V(0, 0, 12) }); actor('BOT-Wisp', 'omega', 5.6, 25.4, { look: V(3, 0, 12) }); actor('BOT-Adder', 'omega', -12.2, 20.6, { look: V(-4, 0, 12) });
      actor('DillyAgent', 'alpha', -0.8, 9.6, { tx: -0.4, tz: 13.6, speed: 2.6, look: V(2.8, 0, 25) });
      actor('Frost', 'alpha', 3.2, 8.8, { tx: 4.0, tz: 13.0, speed: 2.4, look: V(5.6, 0, 25) });
      actor('Falcon', 'alpha', -6.2, 9.4, { tx: -4.6, tz: 13.4, speed: 2.2, look: V(-12, 0, 20.6) });
    },
    update(lt) {
      const pairs = [['DillyAgent', 'BOT-Kodiak'], ['Frost', 'BOT-Wisp'], ['Falcon', 'BOT-Adder']];
      if (Math.random() < 0.3) { const [a, b] = pairs[Math.floor(Math.random() * 3)], A = byName(a), B = byName(b); if (A.hp > 0 && B.hp > 0) { if (Math.random() < 0.55) actorFire(A, B, { sfx: Math.random() < 0.5 }); else actorFire(B, A, { sfx: Math.random() < 0.5 }); } }
      once('k1', lt, 1.55, () => actorFire(byName('Frost'), byName('BOT-Wisp'), { head: true, kill: true }));
      once('k2', lt, 2.3, () => actorFire(byName('Falcon'), byName('BOT-Adder'), { kill: true }));
    },
    cam(lt) { const e = ease(lt / 2.8); setCam(lerp(-14.5, -7.5, e), lerp(7.6, 4.9, e), lerp(8.6, 6.8, e), lerp(-1, 1.2, e), 0.6, 19.2, 46); } },
  // 12 — CLUTCH: first-person Apex-50, real 2x scope overlay, slow-mo zoom punch
  { t0: 44.2125, tod: 'night', hud: true, pov: true, dof: 0,
    enter() {
      setMe({ pos: [6.2, 9.2], look: [-8, 1.6, 14.5], wep: 'operator', owned: ['operator', 'sheriff', 'knife'], state: { hp: 23, shield: 0, cash: 5600, kills: 19, deaths: 8 }, ammo: { operator: [3, 25] }, score: [12, 12], time: 9 });
      for (const n of SQUAD.slice(1)) actor(n, 'alpha', -20, -20, { hp: 0, kills: 9, deaths: 11 });
      actor('BOT-Wisp', 'omega', 30, 0, { hp: 0, kills: 11, deaths: 12 }); actor('BOT-Adder', 'omega', 30, 2, { hp: 0, kills: 10, deaths: 12 });
      actor('BOT-Kodiak', 'omega', 30, 4, { hp: 0, kills: 12, deaths: 11 }); actor('BOT-Ember', 'omega', 30, 6, { hp: 0, kills: 9, deaths: 13 });
      actor('BOT-Scythe', 'omega', -13.9, 15.4, { tx: -12.7, tz: 13.8, speed: 1.1, look: V(6.2, 0, 9.2), kills: 13, deaths: 10 });
      E.killfeed('DillyAgent', 'BOT-Wisp', 'Apex-50', true, 'alpha', 'omega', true);
      E.killfeed('DillyAgent', 'BOT-Adder', 'Kodiak .50', false, 'alpha', 'omega', true);
      P.charge.visible = true; P.charge.position.set(1.3, 0, 21.4); P.chargeState = 'armed';
      E.syncHud();
    },
    slow(lt) { return lt < 0.85 ? 1 : lt < 1.95 ? 0.32 : 1; },
    update(lt, dt) {
      const rp = byName('BOT-Scythe');
      once('scope', lt, 0.32, () => { E.setScoped(true); E.sfxTone(420, 0.06, 'sine', 0.06, 620); });
      once('fire', lt, 1.72, () => {
        povShoot(rp, true); TR.shake = 0.15;
        const hb = $('hs-banner'); if (hb) { hb.textContent = '★ CLUTCH · ROUND WON ★'; hb.style.opacity = '1'; }
      });
      once('unscope', lt, 2.3, () => E.setScoped(false));
      const look = lt < 0.5 ? V(-8, 1.6, 14.5) : V(rp.pos.x, 1.74, rp.pos.z);
      E.pov(dt, E.me.pos.clone(), look, 0, lt < 0.5 ? 6 : 3.2);
      setFov(E.me.scoped ? lerp(28, 15, ease((lt - 0.9) / 0.75)) : 76);
    } },
  // 13 — DEFUSE: macro on the charge, beeps accelerate… then green
  { t0: 47.9625, tod: 'night', dof: 0.55,
    enter() {
      P.charge.visible = true; P.charge.position.set(1.3, 0, 21.4); P.charge.rotation.set(0, 0.5, 0); P.chargeState = 'armed';
      actor('DillyAgent', 'alpha', 0.35, 20.45, { look: V(1.3, 0, 21.4) });
    },
    update(lt) {
      kneel(byName('DillyAgent'), 1);
      if (TR.t >= DEF_T && P.chargeState !== 'defused') { P.chargeState = 'defused'; E.sfxTone(880, 0.25, 'sine', 0.1, 1320); }
    },
    cam(lt) { const e = ease(lt / 2.8); setCam(lerp(3.0, 2.45, e), lerp(0.44, 0.36, e), lerp(19.55, 20.15, e), 1.15, 0.28, 21.3, lerp(36, 30, e)); },
    focus(lt) { return lt < 0.8 ? distToA(byName('DillyAgent')) : distTo(1.3, 0.15, 21.4); } },
  // 14 — FIGHT FOR EVERY ROUND: the squad walks out of a sandstorm, backlit, slow motion
  { t0: 50.775, tod: 'storm', weather: 'storm', mb: 0.3, dof: 0.35,
    enter() {
      const L = V(-12, 0, -12), pos = [[11, -12], [12.4, -13.8], [12.4, -10.2], [13.8, -15.0], [13.8, -8.6]];
      SQUAD.forEach((n, i) => actor(n, 'alpha', pos[i][0], pos[i][1], { tx: pos[i][0] - 9, tz: pos[i][1], speed: 1.7, look: L }));
    },
    slow() { return 0.55; },
    cam(lt) { setCam(-1.4 - lt * 0.25, 0.72, -11.7, 9, 1.55, -12.2, 40); },
    focus() { return distToA(byName('DillyAgent')); } },
  // 15 — logo: golden-hour crane over mid as the title slams in
  { t0: LOGO_T, tod: 'golden', weather: 'dust', dof: 0.25,
    enter() {
      const L = V(14, 0, -6);
      actor('DillyAgent', 'alpha', -15.8, 11.6, { look: L }); actor('Falcon', 'alpha', -17.4, 13.2, { look: L }); actor('Frost', 'alpha', -17.6, 10.0, { look: L });
    },
    cam(lt) { const e = ease(lt / 6); setCam(-21.5 - e * 2.5, 1.7 + e * 6.5, 15.5 + e * 6, 12, 5 + e * 2, -12, 46); },
    focus() { return 26; } }
];

/* =====================================================================
   post: per-shot camera motion blur + depth of field + grade, FXAA, grain
   (the same CinePass idea as Dilly Gone Mad, done with three.js render targets)
   ===================================================================== */
const POST = { rt: null, rt2: null, w: 0, h: 0, q: null, scene: null, cam: null, m1: null, m2: null, prevVP: new THREE.Matrix4(), vp: new THREE.Matrix4(), reset: true, ok: true, size: new THREE.Vector2() };
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const FS1 = `
uniform sampler2D tColor; uniform sampler2D tDepth; uniform mat4 projInv; uniform mat4 viewInv; uniform mat4 prevVP;
uniform float mbAmt; uniform float dofAmt; uniform float focus; uniform vec2 res; uniform float exposure;
uniform vec3 tint; uniform vec3 lift; uniform float sat; uniform float con;
varying vec2 vUv;
vec3 dsRrtOdt(vec3 v){ vec3 a = v*(v+0.0245786)-0.000090537; vec3 b = v*(0.983729*v+0.4329510)+0.238081; return a/b; }
vec3 dsAces(vec3 c){
  const mat3 I = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
  const mat3 O = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
  c *= exposure/0.6; c = I*c; c = dsRrtOdt(c); c = O*c; return clamp(c,0.0,1.0);
}
void main(){
  float d = texture2D(tDepth, vUv).x;
  vec4 vp = projInv * vec4(vUv*2.0-1.0, d*2.0-1.0, 1.0); vp /= vp.w;
  float z = -vp.z;
  vec4 wp = viewInv * vp;
  vec4 pc = prevVP * vec4(wp.xyz, 1.0);
  vec2 puv = pc.xy/pc.w*0.5+0.5;
  vec2 vel = (vUv - puv) * mbAmt; float vl = length(vel); if (vl > 0.035) vel *= 0.035/vl;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 8; i++) { float k = float(i)/7.0 - 0.5; col += texture2D(tColor, vUv + vel*k).rgb; }
  col /= 8.0;
  float coc = clamp(abs(z - focus)/max(z, 0.25) * dofAmt * 1.6, 0.0, 1.0);
  if (coc > 0.03) {
    vec3 acc = col; float w = 1.0;
    for (int i = 0; i < 16; i++) { float a = float(i)*2.39996; float r = sqrt(float(i)+0.5)/4.0; vec2 o = vec2(cos(a), sin(a))*r*coc*11.0/res.y*vec2(res.y/res.x, 1.0)*res.y/720.0*1.0;
      acc += texture2D(tColor, vUv + o*vec2(res.x/res.y,1.0)*(720.0/res.y)).rgb; w += 1.0; }
    col = mix(col, acc/w, smoothstep(0.03, 0.25, coc));
  }
  col = dsAces(col);
  col = mix(col*12.92, 1.055*pow(col, vec3(1.0/2.4)) - 0.055, step(0.0031308, col)); // linear -> sRGB
  col = col*tint + lift;
  float l = dot(col, vec3(0.2126,0.7152,0.0722));
  col = mix(vec3(l), col, sat);
  col = (col-0.5)*con + 0.5;
  gl_FragColor = vec4(clamp(col,0.0,1.0), 1.0);
}`;
const FS2 = `
uniform sampler2D tIn; uniform vec2 res; uniform float time; uniform float vig; uniform float grain; uniform float ca;
varying vec2 vUv;
vec3 fxaa(vec2 uv, vec2 px){
  vec3 nw = texture2D(tIn, uv+vec2(-1.0,-1.0)*px).rgb, ne = texture2D(tIn, uv+vec2(1.0,-1.0)*px).rgb;
  vec3 sw = texture2D(tIn, uv+vec2(-1.0,1.0)*px).rgb, se = texture2D(tIn, uv+vec2(1.0,1.0)*px).rgb, m = texture2D(tIn, uv).rgb;
  vec3 L = vec3(0.299,0.587,0.114);
  float lnw = dot(nw,L), lne = dot(ne,L), lsw = dot(sw,L), lse = dot(se,L), lm = dot(m,L);
  float lmin = min(lm, min(min(lnw,lne), min(lsw,lse))), lmax = max(lm, max(max(lnw,lne), max(lsw,lse)));
  vec2 dir = vec2(-((lnw+lne)-(lsw+lse)), ((lnw+lsw)-(lne+lse)));
  float red = max((lnw+lne+lsw+lse)*0.03125, 1.0/128.0);
  float rcp = 1.0/(min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir*rcp, vec2(-8.0), vec2(8.0))*px;
  vec3 a = 0.5*(texture2D(tIn, uv+dir*(1.0/3.0-0.5)).rgb + texture2D(tIn, uv+dir*(2.0/3.0-0.5)).rgb);
  vec3 b = a*0.5 + 0.25*(texture2D(tIn, uv+dir*-0.5).rgb + texture2D(tIn, uv+dir*0.5).rgb);
  float lb = dot(b,L);
  return (lb < lmin || lb > lmax) ? a : b;
}
void main(){
  vec2 px = 1.0/res;
  vec3 c = fxaa(vUv, px);
  vec2 d = vUv-0.5; float r2 = dot(d,d);
  vec2 off = d*ca*r2*px*90.0;
  c.r = mix(c.r, texture2D(tIn, vUv+off).r, 0.85); c.b = mix(c.b, texture2D(tIn, vUv-off).b, 0.85);
  c *= 1.0 - vig*smoothstep(0.08, 0.5, r2*1.5);
  float n = fract(sin(dot(vUv*res + fract(time)*97.0, vec2(12.9898,78.233)))*43758.5453);
  c += (n-0.5)*grain;
  gl_FragColor = vec4(c, 1.0);
}`;
function ensurePost() {
  const r = E.renderer; r.getDrawingBufferSize(POST.size);
  const w = Math.max(2, POST.size.x), h = Math.max(2, POST.size.y);
  if (!POST.m1) {
    POST.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    POST.m1 = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS1, depthTest: false, depthWrite: false, uniforms: {
      tColor: { value: null }, tDepth: { value: null }, projInv: { value: new THREE.Matrix4() }, viewInv: { value: new THREE.Matrix4() }, prevVP: { value: new THREE.Matrix4() },
      mbAmt: { value: 0 }, dofAmt: { value: 0 }, focus: { value: 10 }, res: { value: new THREE.Vector2(w, h) }, exposure: { value: 1 },
      tint: { value: new THREE.Vector3(1, 1, 1) }, lift: { value: new THREE.Vector3() }, sat: { value: 1 }, con: { value: 1 } } });
    POST.m2 = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS2, depthTest: false, depthWrite: false, uniforms: {
      tIn: { value: null }, res: { value: new THREE.Vector2(w, h) }, time: { value: 0 }, vig: { value: 0.45 }, grain: { value: 0.03 }, ca: { value: 0.28 } } });
    POST.q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), POST.m1); POST.q.frustumCulled = false;
    POST.scene = new THREE.Scene(); POST.scene.add(POST.q);
  }
  if (POST.rt && POST.w === w && POST.h === h) return;
  if (POST.rt) { POST.rt.depthTexture.dispose(); POST.rt.dispose(); POST.rt2.dispose(); }
  const dt = new THREE.DepthTexture(w, h); dt.type = THREE.UnsignedIntType;
  POST.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthTexture: dt, depthBuffer: true });
  POST.rt2 = new THREE.WebGLRenderTarget(w, h);
  POST.w = w; POST.h = h; POST.reset = true;
  POST.m1.uniforms.res.value.set(w, h); POST.m2.uniforms.res.value.set(w, h);
}
function renderPost() {
  const r = E.renderer, cam = E.camera;
  if (!POST.ok) { r.render(E.scene, cam); return; }
  try {
    ensurePost();
    r.setRenderTarget(POST.rt); r.render(E.scene, cam);
    POST.vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    if (POST.reset) { POST.prevVP.copy(POST.vp); POST.reset = false; }
    const u = POST.m1.uniforms, g = TR.grade || TOD.noon.grade;
    u.tColor.value = POST.rt.texture; u.tDepth.value = POST.rt.depthTexture;
    u.projInv.value.copy(cam.projectionMatrixInverse); u.viewInv.value.copy(cam.matrixWorld); u.prevVP.value.copy(POST.prevVP);
    // constant 1/60 s shutter whatever the frame rate
    u.mbAmt.value = TR.cine.mb * clamp((1 / 60) / Math.max(TR.lastAdv, 1e-3), 0, 3) * (TR.lastAdv > 0 ? 1 : 0);
    u.dofAmt.value += (TR.cine.dof - u.dofAmt.value) * 0.25; u.focus.value += (TR.cine.focus - u.focus.value) * 0.2;
    u.exposure.value = r.toneMappingExposure;
    u.tint.value.set(...g.tint); u.lift.value.set(...g.lift); u.sat.value = g.sat; u.con.value = g.con;
    POST.q.material = POST.m1; r.setRenderTarget(POST.rt2); r.render(POST.scene, POST.cam);
    POST.m2.uniforms.tIn.value = POST.rt2.texture; POST.m2.uniforms.time.value = TR.t;
    POST.q.material = POST.m2; r.setRenderTarget(null); r.render(POST.scene, POST.cam);
    POST.prevVP.copy(POST.vp);
  } catch (e) {
    POST.ok = false; r.setRenderTarget(null); r.render(E.scene, cam);
  }
}

/* =====================================================================
   score: drone + risers + impacts, then a 128 BPM sequencer from the drop
   ===================================================================== */
const AU = { ctx: null, noise: null };
function audioInit() {
  try {
    if (!AU.ctx) {
      AU.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const n = AU.ctx.createBuffer(1, AU.ctx.sampleRate * 2, AU.ctx.sampleRate), ch = n.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      AU.noise = n;
    }
    if (AU.ctx.state === 'suspended') AU.ctx.resume().catch(() => {});
  } catch (e) { /* audio unavailable */ }
}
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function tone(t, f, dur, type, v, cut, dest, f2) {
  const c = AU.ctx; if (!c || t < c.currentTime - 0.02) return;
  const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
  fl.type = 'lowpass'; fl.frequency.value = cut || 8000;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(fl); fl.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}
function noiseHit(t, dur, v, ftype, freq, dest, q = 1) {
  const c = AU.ctx; if (!c || t < c.currentTime - 0.02) return;
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = AU.noise; f.type = ftype; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(Math.max(0.0002, v), t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
const kick = (t, v, d) => tone(t, 150, 0.34, 'sine', v, 900, d, 38);
const snare = (t, v, d) => { noiseHit(t, 0.18, v, 'highpass', 1400, d); tone(t, 190, 0.1, 'triangle', v * 0.5, 2000, d); };
const hat = (t, v, d) => noiseHit(t, 0.04, v, 'highpass', 8000, d);
function pad(t, notes, dur, v, dest) {
  const c = AU.ctx; if (!c || t < c.currentTime - 0.02) return;
  for (const n of notes) for (const det of [-7, 7]) {
    const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = det; fl.type = 'lowpass'; fl.frequency.value = 1000;
    o.connect(fl); fl.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.05);
  }
}
const PROG = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]]; // Am · F · Dm · E — tense harmonic minor
function trailerStep(step, t, spb, B) {
  const s = step % 16, bar = Math.floor(step / 16) % 4, ch = PROG[bar], big = (t - TR.audio0) > 44.1;
  if (s % 4 === 0) { kick(t, 1, B); tone(t, 55, 0.4, 'sine', 0.32, 200, B, 38); }
  if (s === 4 || s === 12) { snare(t, 0.42, B); noiseHit(t, 0.09, 0.22, 'bandpass', 1800, B, 1.2); }
  if (s % 2 === 1) hat(t, s % 4 === 3 ? 0.13 : 0.07, B);
  if (big && s % 4 === 2) hat(t, 0.1, B);
  tone(t, mtof(ch[0] - 24 + (s % 4 === 2 ? 12 : 0)), spb * 1.6, 'sawtooth', 0.2, 620, B);
  tone(t, mtof(ch[s % 3] + 12 + (s >= 8 ? 12 : 0)), spb * 0.9, 'triangle', 0.05, 4500, B);
  if (s === 0) pad(t, ch, spb * 16, 0.03, B);
  if (big && s === 0 && bar === 0) noiseHit(t, 1.2, 0.18, 'highpass', 3000, B);
}
function startTrailerAudio() {
  const c = AU.ctx; if (!c || c.state !== 'running') return;
  try {
    if (TR.bus) { const old = TR.bus; old.gain.setTargetAtTime(0, c.currentTime, 0.05); setTimeout(() => { try { old.disconnect(); } catch (e) { /* ignore */ } }, 500); }
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2; comp.connect(c.destination);
    TR.bus = c.createGain(); TR.bus.gain.value = 0.7; TR.bus.connect(comp); TR.bus._comp = comp;
    const t0 = c.currentTime + 0.05 - TR.t; TR.audio0 = t0;
    const B = TR.bus;
    // low drone 0 → drop
    for (const [f, type] of [[55, 'sawtooth'], [82.4, 'sawtooth'], [110, 'triangle']]) {
      if (t0 + DROP < c.currentTime) break;
      const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter(), lfo = c.createOscillator(), lg = c.createGain();
      o.type = type; o.frequency.value = f; o.detune.value = rnd(-8, 8); fl.type = 'lowpass'; fl.frequency.value = 260; lfo.frequency.value = 0.15; lg.gain.value = 140; lfo.connect(lg); lg.connect(fl.frequency);
      o.connect(fl); fl.connect(g); g.connect(B); const st = Math.max(c.currentTime, t0);
      g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.09, Math.max(st + 0.1, t0 + 3)); g.gain.setValueAtTime(0.09, t0 + DROP - 1.6); g.gain.exponentialRampToValueAtTime(0.0001, t0 + DROP);
      o.start(st); lfo.start(st); o.stop(t0 + DROP + 0.2); lfo.stop(t0 + DROP + 0.2);
    }
    const riser = (s, dur) => { const t = t0 + s; if (t < c.currentTime) return; const src = c.createBufferSource(), g = c.createGain(), fl = c.createBiquadFilter(); src.buffer = AU.noise; src.loop = true; fl.type = 'bandpass'; fl.Q.value = 4; fl.frequency.setValueAtTime(300, t); fl.frequency.exponentialRampToValueAtTime(6000, t + dur); src.connect(fl); fl.connect(g); g.connect(B); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08); src.start(t); src.stop(t + dur + 0.1); tone(t, 110, dur, 'sawtooth', 0.06, 2000, B, 440); };
    const impact = (s, big) => { const t = t0 + s; if (t < c.currentTime) return; tone(t, 72, big ? 2.2 : 1.2, 'sine', 0.8, 500, B, 30); noiseHit(t, big ? 1.4 : 0.6, 0.5, 'lowpass', 1200, B); tone(t, 55, big ? 3 : 1.6, 'sawtooth', 0.12, 300, B); if (big) noiseHit(t, 2.6, 0.12, 'highpass', 5000, B); };
    [[4.0, 1.4], [8.4, 1.4], [12.8, 1.2], [16.6, 1.4], [20.6, 1.4], [23.4, 3.0], [52.2, 1.4]].forEach(([s, d]) => riser(s, d));
    HITS.forEach((h) => impact(h, BIG_HITS.has(h)));
    impact(DEF_T, false);
    // heartbeat before the drop, then a ticking clock that doubles into the drop
    for (const h of [3.0, 3.3, 7.4, 7.7, 11.8, 12.1, 16.0, 16.3, 19.8, 20.1]) if (t0 + h > c.currentTime) kick(t0 + h, 0.55, B);
    for (let k = 0, s = 14.2; s < DROP - 0.05; k++) { if (t0 + s > c.currentTime) tone(t0 + s, k % 2 ? 1800 : 2400, 0.03, 'square', 0.035, 6000, B); s += s < 21.4 ? 60 / BPM : 30 / BPM; }
    for (let k = 0; k < 8; k++) { const tt = t0 + 1 + k * 3.2; if (tt > c.currentTime && tt < t0 + DROP) pad(tt, [[45, 52, 57], [41, 48, 53], [43, 50, 55], [40, 47, 52]][k % 4], 3.4, 0.024, B); }
    // bomb timer beeps (same list that drives the LED)
    for (const b of BEEPS) if (t0 + b > c.currentTime) tone(t0 + b, 2650, 0.07, 'square', b > 47.9 ? 0.05 : 0.035, 5200, B);
    if (t0 + DEF_T > c.currentTime) { tone(t0 + DEF_T + 0.02, mtof(76), 0.5, 'triangle', 0.06, 4000, B); tone(t0 + DEF_T + 0.14, mtof(83), 0.7, 'triangle', 0.06, 4000, B); }
    // logo sting
    if (t0 + LOGO_T > c.currentTime) { pad(t0 + LOGO_T, [45, 52, 57, 60, 64], 6.0, 0.05, B); [0, 7, 12, 15, 19, 24].forEach((n, i) => tone(t0 + LOGO_T + 0.3 + i * 0.12, mtof(69 + n), 0.9, 'square', 0.03, 3000, B)); }
    TR.seqStep = 0; TR.seqNext = t0 + DROP;
  } catch (e) { /* ignore */ }
}
function pumpAudio() {
  const c = AU.ctx; if (!c || !TR.bus || c.state !== 'running' || TR.audio0 == null) return;
  const now = c.currentTime, start = TR.audio0 + DROP, end = TR.audio0 + LOGO_T - 0.47;
  if (TR.seqNext < now - 0.05) { const k = Math.max(0, Math.ceil((now - start) / SPB)); TR.seqStep = k; TR.seqNext = start + k * SPB; }
  while (TR.seqNext < now + 0.18 && TR.seqNext < end) { trailerStep(TR.seqStep, TR.seqNext, SPB, TR.bus); TR.seqNext += SPB; TR.seqStep++; }
}

/* =====================================================================
   director
   ===================================================================== */
let tcardWrap, tcardKicker, tcardEl, tlogo, fadeEl, flashEl, trProgEl;
function enterShot(si) {
  TR.shot = si; const S = SHOTS[si];
  E.clear(); clearProps(); TR.fired.clear();
  const kf = $('killfeed'); if (kf) kf.innerHTML = '';
  applyTOD(S.tod); setWeather(S.weather);
  TR.cine.mb = S.mb || 0; TR.cine.dof = S.dof || 0; TR.shake = 0;
  const hud = $('hud'); if (hud) hud.classList.toggle('active', !!S.hud);
  E.vmRoot.visible = false;
  E.camera.rotation.z = 0;
  POST.reset = true;
  if (S.enter) S.enter();
}
function step(adv) {
  TR.t += adv; TR.lastAdv = adv; const t = TR.t;
  let si = 0; for (let i = 0; i < SHOTS.length; i++) if (t >= SHOTS[i].t0) si = i;
  if (si !== TR.shot) enterShot(si);
  const S = SHOTS[si], lt = t - S.t0;
  TR.ts = S.slow ? S.slow(lt) : 1;
  const wdt = adv * TR.ts;
  E.updateActors(wdt);
  if (S.update) S.update(lt, wdt, adv);
  updateProps(wdt, adv);
  if (S.cam) S.cam(lt, adv);
  if (S.focus) TR.cine.focus = Math.max(0.3, S.focus(lt));
  if (TR.shake > 0) { TR.shake -= adv; E.camera.position.x += rnd(-0.06, 0.06) * TR.shake * 4; E.camera.position.y += rnd(-0.06, 0.06) * TR.shake * 4; }
}
function overlays() {
  const t = TR.t;
  // title cards with kicker & expanding letter-spacing (DGM style)
  let op = 0, txt = '', kickTxt = '', sc = 1, low = 0, track = 0.06;
  for (const [a, b, s, lw, kk] of CARDS) if (t >= a && t <= b) { const u = (t - a) / (b - a); op = Math.min(1, (t - a) / 0.25, (b - t) / 0.4); txt = s; kickTxt = kk || ''; sc = 1.08 - 0.08 * ease(u); low = lw || 0; track = 0.04 + 0.06 * ease(u); }
  if (txt && tcardEl.textContent !== txt) tcardEl.textContent = txt;
  if (tcardKicker.textContent !== kickTxt) tcardKicker.textContent = kickTxt;
  tcardEl.style.opacity = op.toFixed(3); tcardEl.style.letterSpacing = track.toFixed(3) + 'em';
  tcardKicker.style.opacity = (kickTxt ? op : 0).toFixed(3);
  tcardWrap.style.transform = low === 1 ? `translateY(-23vh) scale(${(sc * 0.64).toFixed(4)})` : low === 2 ? `translateY(-21vh) scale(${(sc * 0.46).toFixed(4)})` : `scale(${sc.toFixed(4)})`;
  trProgEl.style.width = (clamp(t / TR.dur, 0, 1) * 100).toFixed(2) + '%';
  // crisp cinematic cuts: a 0.16 s dip to black around every cut
  let fade = 0; for (const s of SHOTS) { const d = Math.abs(t - s.t0); if (s.t0 > 0) fade = Math.max(fade, 1 - d / 0.16); }
  fade = Math.max(fade, 1 - t / 1.1, t > TR.dur - 2.4 ? (t - (TR.dur - 2.4)) / 2.4 : 0);
  fadeEl.style.opacity = clamp(fade, 0, 1).toFixed(3);
  let fl = 0; for (const h of HITS) if (t >= h) fl = Math.max(fl, 1 - (t - h) / (h === LOGO_T ? 0.85 : 0.28));
  if (t >= DEF_T) fl = Math.max(fl, (1 - (t - DEF_T) / 0.3) * 0.7);
  flashEl.style.opacity = Math.max(clamp(fl, 0, 1) * 0.42, TR.flashT > 0 ? Math.min(1, TR.flashT * 1.4) : 0).toFixed(3);
  // logo slam
  if (t >= LOGO_T) {
    const u = clamp((t - LOGO_T) / 0.5, 0, 1);
    tlogo.style.opacity = Math.min(u, t > TR.dur - 2.2 ? clamp((TR.dur - 0.4 - t) / 1.6, 0, 1) : 1).toFixed(3);
    tlogo.style.transform = `scale(${(1.22 - 0.22 * ease(u) + (t - LOGO_T) * 0.006).toFixed(4)})`;
    $('tpress').style.opacity = t > LOGO_T + 3.2 ? (0.5 + 0.5 * Math.sin(t * 4)).toFixed(2) : 0;
    $('vig').style.opacity = 0.88;
  } else { tlogo.style.opacity = 0; $('vig').style.opacity = 0.5; }
}
function update(dt) {
  if (!TR.playing) return;
  let adv = dt * TR.speed;
  const c = AU.ctx;
  // lock picture to the score's clock when audio is running (cuts stay on the beat)
  if (TR.speed === 1 && c && c.state === 'running' && TR.bus && TR.audio0 != null) adv = clamp(c.currentTime - TR.audio0 - TR.t, 0, 0.1);
  step(adv);
  pumpAudio();
  overlays();
  if (TR.t >= TR.dur) endTrailer();
}
const HOOK = { update, render: renderPost };

function setHint() { const h = $('skiphint'); if (h) h.textContent = TR.unlocked ? 'press any key to skip' : 'click for sound · press any key to skip'; }
function unlockAudio() { TR.unlocked = true; audioInit(); setTimeout(startTrailerAudio, 60); setHint(); }

export function startTrailer() {
  if (TR.playing) return;
  const T = api(); if (!T || !T.engine || !T.setHook) return;
  const st = window.DillyStrike.getState ? window.DillyStrike.getState() : null;
  if (st && st.inMatch) return; // never hijack a live match
  E = T.engine;
  tcardWrap = $('tcard'); tcardKicker = tcardWrap.querySelector('.kicker'); tcardEl = tcardWrap.querySelector('.txt');
  tlogo = $('tlogo'); fadeEl = $('fade'); flashEl = $('flash'); trProgEl = $('trProg').firstElementChild;
  initProps(); saveWorld();
  audioInit();
  TR.playing = true; TR.t = 0; TR.shot = -1; TR.audio0 = null; TR.unlocked = !!(AU.ctx && AU.ctx.state === 'running');
  T.start(); T.setHook(HOOK);
  if (document.pointerLockElement) document.exitPointerLock();
  document.body.classList.add('cine');
  setHint();
  startTrailerAudio();
  if (AU.ctx && AU.ctx.state !== 'running') AU.ctx.resume().then(() => { if (TR.playing && !TR.unlocked && AU.ctx.state === 'running') { TR.unlocked = true; startTrailerAudio(); setHint(); } }).catch(() => {});
}
export function endTrailer() {
  if (!TR.playing) return;
  TR.playing = false;
  if (TR.bus && AU.ctx) { const b = TR.bus; b.gain.setTargetAtTime(0, AU.ctx.currentTime, 0.15); setTimeout(() => { try { b.disconnect(); b._comp.disconnect(); } catch (e) { /* ignore */ } }, 900); TR.bus = null; }
  TR.audio0 = null;
  const T = api();
  if (T) T.setHook(null);
  clearProps(); restoreWorld();
  if (T) T.stop(false); // clears actors/HUD, restores the lobby menu
  document.body.classList.remove('cine');
  tcardEl.style.opacity = 0; tcardKicker.style.opacity = 0; tlogo.style.opacity = 0; fadeEl.style.opacity = 0; flashEl.style.opacity = 0; trProgEl.style.width = '0%';
  const hb = $('hs-banner'); if (hb) { hb.style.opacity = '0'; hb.textContent = 'HEADSHOT'; }
  if (location.hash === '#trailer') history.replaceState(null, '', location.pathname + location.search);
}
// jump to a timestamp (used for review/screenshots): re-enters the shot and simulates up to t
function seek(t) {
  if (!TR.playing) startTrailer();
  if (!TR.playing) return;
  t = clamp(t, 0, TR.dur - 0.01);
  let si = 0; for (let i = 0; i < SHOTS.length; i++) if (t >= SHOTS[i].t0) si = i;
  TR.shot = -1; TR.t = SHOTS[si].t0; step(0);
  while (TR.t + 1 / 30 < t) step(1 / 30);
  step(Math.max(0, t - TR.t));
  TR.lastAdv = 1 / 60; overlays();
  if (TR.bus) startTrailerAudio();
}

/* ---------- input: any key / click skips; the first one unlocks audio if it was blocked ---------- */
window.addEventListener('keydown', (e) => {
  if (!TR.playing) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.repeat) return;
  if (e.code !== 'Escape' && !TR.unlocked && (!AU.ctx || AU.ctx.state !== 'running')) { unlockAudio(); return; }
  endTrailer();
}, true);
window.addEventListener('pointerdown', (e) => {
  if (!TR.playing) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (!TR.unlocked && (!AU.ctx || AU.ctx.state !== 'running')) { unlockAudio(); return; }
  endTrailer();
}, true);

window.DillyStrikeTrailer = {
  open: startTrailer,
  close: endTrailer,
  seek,
  state: () => ({ playing: TR.playing, t: TR.t, shot: TR.shot, dur: TR.dur, unlocked: TR.unlocked, audio: AU.ctx ? AU.ctx.state : 'none', post: POST.ok }),
  shots: () => SHOTS.map((s, i) => ({ index: i, t0: s.t0, tod: s.tod, weather: s.weather || null, hud: !!s.hud })),
  cards: () => CARDS.map((c) => ({ t0: c[0], t1: c[1], text: c[2], kicker: c[4] })),
  set speed(v) { TR.speed = Math.max(0.1, +v || 1); },
  get speed() { return TR.speed; }
};

function bindTrailerTriggers() {
  const btn = $('btn-watch-trailer');
  if (btn) btn.addEventListener('click', () => startTrailer());
  if (location.hash === '#trailer') setTimeout(startTrailer, 200);
  window.addEventListener('hashchange', () => { if (location.hash === '#trailer' && !TR.playing) startTrailer(); });
}
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', bindTrailerTriggers);
else bindTrailerTriggers();
