/* ==========================================================================
   DILLY STRIKE — Authentic CS:GO Visuals & Tactical 3D FPS
   Three.js WebGL 2 · de_dustline PBR Desert Citadel · 5 Multi-Part 3D Weapons
   Gloved Hands · Inspect (F) · Bullet Decals · Circular Radar · Radial Buy Wheel
   ========================================================================== */

import * as THREE from 'three';
import { initRender, renderFrame } from './render.js';
import { enhanceDustline } from './mapdetail.js';
import { createViewmodel } from './viewmodel.js';
import { loadCharacters, charsReady, Operator } from './characters.js';
loadCharacters().catch((e) => console.warn('character models unavailable, using fallback figures', e));

const $ = (id) => document.getElementById(id);
export const DILLY_STRIKE_WS = 'wss://apibuild.dillonmay.com/strike';

// ---------- Weapon Registry (internal IDs match Rust server protocol) ----------
const WEAPONS = {
  vandal: {
    id: 'vandal', name: 'Dill-47', slot: 1, cost: 2700, dmg: 36, hsMult: 4.0, rpm: 600,
    mag: 30, reserve: 90, auto: true, spread: 0.011, recoil: 0.023,
    stats: { dmg: 92, rpm: 76, pen: 94, acc: 78 },
    desc: 'Heavy-caliber assault rifle. Iconic 1-tap headshot lethality through helmet.'
  },
  phantom: {
    id: 'phantom', name: 'Viper-S', slot: 2, cost: 2900, dmg: 33, hsMult: 3.6, rpm: 660,
    mag: 25, reserve: 100, auto: true, spread: 0.007, recoil: 0.014,
    stats: { dmg: 80, rpm: 84, pen: 82, acc: 92 },
    desc: 'Silenced tactical carbine with laser-tight spray control and reduced muzzle signature.'
  },
  operator: {
    id: 'operator', name: 'Apex-50', slot: 3, cost: 4750, dmg: 150, hsMult: 2.5, rpm: 42,
    mag: 5, reserve: 30, auto: false, spread: 0.001, recoil: 0.075, scope: true,
    stats: { dmg: 100, rpm: 22, pen: 100, acc: 99 },
    desc: 'High-risk, high-reward bolt-action sniper rifle. RMB 2× scope, 1-shot torso kill.'
  },
  sheriff: {
    id: 'sheriff', name: 'Kodiak .50', slot: 4, cost: 700, dmg: 53, hsMult: 3.2, rpm: 250,
    mag: 7, reserve: 35, auto: false, spread: 0.010, recoil: 0.044,
    stats: { dmg: 88, rpm: 48, pen: 93, acc: 80 },
    desc: 'Heavy .50 caliber brushed-chrome sidearm built for crisp long-range headshots.'
  },
  knife: {
    id: 'knife', name: 'Dilly Fang', slot: 5, cost: 0, dmg: 65, hsMult: 1.5, rpm: 145,
    mag: 0, reserve: 0, auto: false, melee: true,
    stats: { dmg: 65, rpm: 55, pen: 100, acc: 100 },
    desc: 'Curved tactical blade for maximum movement speed and silent close-quarters eliminations.'
  },
};

// ---------- Customizable Keybinds (Persisted in localStorage) ----------
const BIND_META = [
  ['fwd', 'Move Forward'], ['back', 'Move Backward'], ['left', 'Strafe Left'], ['right', 'Strafe Right'],
  ['jump', 'Jump'], ['crouch', 'Crouch (Tighter Spread)'], ['reload', 'Reload Weapon'], ['inspect', 'Inspect Weapon'],
  ['buy', 'Open Buy Wheel'], ['flash', 'Flashbang'], ['smoke', 'Smoke Grenade'], ['dash', 'Tactical Dash'],
  ['chat', 'Team / All Chat'], ['scoreboard', 'Scoreboard'],
  ['slot1', 'Slot 1 (Dill-47)'], ['slot2', 'Slot 2 (Viper-S)'], ['slot3', 'Slot 3 (Apex-50)'],
  ['slot4', 'Slot 4 (Kodiak .50)'], ['slot5', 'Slot 5 (Dilly Fang)']
];
const DEFAULT_BINDS = {
  fwd: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', crouch: 'ControlLeft', reload: 'KeyR', inspect: 'KeyF',
  buy: 'KeyB', flash: 'KeyQ', smoke: 'KeyE', dash: 'KeyC',
  chat: 'KeyT', scoreboard: 'Tab',
  slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4', slot5: 'Digit5'
};
const BINDS = Object.assign({}, DEFAULT_BINDS);
try {
  const savedBinds = JSON.parse(localStorage.getItem('dilly_strike_binds_v1') || 'null');
  if (savedBinds && typeof savedBinds === 'object') Object.assign(BINDS, savedBinds);
} catch (_) {}

function saveBinds() {
  try { localStorage.setItem('dilly_strike_binds_v1', JSON.stringify(BINDS)); } catch (_) {}
}
function fmtKey(code) {
  if (!code) return '---';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ControlLeft' || code === 'ControlRight') return 'CTRL';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'SHIFT';
  if (code === 'AltLeft' || code === 'AltRight') return 'ALT';
  if (code === 'Space') return 'SPACE';
  return code.toUpperCase();
}

// ---------- Procedural Web Audio SFX ----------
let actx = null;
let sfxMuted = false;
function sfxTone(freq, dur, type = 'sawtooth', vol = 0.09, endF = null) {
  if (sfxMuted) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (endF) o.frequency.exponentialRampToValueAtTime(endF, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch (_) {}
}
function sfxNoise(dur, freq, vol) {
  if (sfxMuted) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const len = Math.floor(actx.sampleRate * dur);
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.28));
    const src = actx.createBufferSource(); src.buffer = buf;
    const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
    const g = actx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(actx.destination); src.start();
  } catch (_) {}
}
function playShot(id) {
  if (id === 'operator') { sfxNoise(0.32, 360, 0.42); sfxTone(125, 0.26, 'sawtooth', 0.16, 36); }
  else if (id === 'phantom') { sfxNoise(0.08, 1650, 0.12); sfxTone(340, 0.055, 'triangle', 0.05, 130); }
  else if (id === 'knife') { sfxNoise(0.07, 2400, 0.12); }
  else if (id === 'sheriff') { sfxNoise(0.18, 620, 0.30); sfxTone(185, 0.14, 'sawtooth', 0.12, 58); }
  else { sfxNoise(0.14, 780, 0.26); sfxTone(205, 0.10, 'sawtooth', 0.11, 72); }
}
function playHeadshot() {
  sfxTone(1480, 0.08, 'sine', 0.15, 1980);
  setTimeout(() => sfxTone(1860, 0.11, 'triangle', 0.12, 920), 40);
}

// ---------- Three.js Scene, Shadows & ACES Tone Mapping ----------
const canvas = $('fps-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc8d8e6);
scene.fog = new THREE.FogExp2(0xd2c4aa, 0.0082);

const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.05, 260);
scene.add(camera);

// Procedural Dust2 Golden-Hour Sky Dome
(() => {
  const sc = document.createElement('canvas'); sc.width = 512; sc.height = 256;
  const sx = sc.getContext('2d');
  const gr = sx.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0.0, '#3a6ea5');
  gr.addColorStop(0.45, '#8ab4d8');
  gr.addColorStop(0.72, '#e6d6b8');
  gr.addColorStop(1.0, '#d6be96');
  sx.fillStyle = gr; sx.fillRect(0, 0, 512, 256);
  // Desert sun glow
  const sg = sx.createRadialGradient(360, 88, 4, 360, 88, 62);
  sg.addColorStop(0, 'rgba(255,252,235,0.95)');
  sg.addColorStop(0.3, 'rgba(255,232,175,0.55)');
  sg.addColorStop(1, 'rgba(255,220,150,0)');
  sx.fillStyle = sg; sx.fillRect(280, 10, 160, 160);
  const skyTex = new THREE.CanvasTexture(sc);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(190, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
  );
  scene.add(sky);
})();

const hemi = new THREE.HemisphereLight(0xf6f9ff, 0x8d7658, 0.78);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d2, 1.45);
sun.position.set(36, 58, 22);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 140;
sun.shadow.camera.left = -48;
sun.shadow.camera.right = 48;
sun.shadow.camera.top = 42;
sun.shadow.camera.bottom = -42;
sun.shadow.bias = -0.0005;
scene.add(sun);
initRender(renderer, scene, camera, sun, hemi); // linear workflow, sky, env, post chain, quality

// ---------- Procedural Dust2 PBR Textures ----------
function makeTexture(size, drawFn, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  drawFn(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

const TEX_SAND = makeTexture(256, (ctx, s) => {
  ctx.fillStyle = '#c9b38f'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 4500; i++) {
    const v = 182 + Math.floor(Math.random() * 40);
    ctx.fillStyle = `rgb(${v},${v - 20},${v - 52})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
  ctx.strokeStyle = 'rgba(110,88,58,0.22)'; ctx.lineWidth = 2;
  for (let i = 0; i <= s; i += 64) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(s, i); ctx.stroke();
  }
}, 14, 10);

const TEX_WALL = makeTexture(256, (ctx, s) => {
  ctx.fillStyle = '#cbb796'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 2800; i++) {
    const v = 175 + Math.floor(Math.random() * 44);
    ctx.fillStyle = `rgba(${v},${v - 18},${v - 42},0.45)`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 3, 3);
  }
  // Exposed sandstone bricks
  ctx.fillStyle = 'rgba(148,118,82,0.34)';
  for (let y = 24; y < s; y += 32) {
    for (let x = (y % 64 ? 12 : 0); x < s; x += 48) {
      if ((x + y) % 5 === 0) ctx.fillRect(x, y, 42, 18);
    }
  }
  // Base desert grime gradient
  const g = ctx.createLinearGradient(0, s * 0.65, 0, s);
  g.addColorStop(0, 'rgba(92,74,52,0)');
  g.addColorStop(1, 'rgba(92,74,52,0.48)');
  ctx.fillStyle = g; ctx.fillRect(0, s * 0.65, s, s * 0.35);
  // Top trim band
  ctx.fillStyle = 'rgba(122,102,76,0.42)';
  ctx.fillRect(0, 0, s, 14);
}, 2, 1);

const TEX_CRATE = makeTexture(256, (ctx, s) => {
  ctx.fillStyle = '#996c3e'; ctx.fillRect(0, 0, s, s);
  // Wood planks
  ctx.strokeStyle = 'rgba(55,34,15,0.45)'; ctx.lineWidth = 3;
  for (let y = 0; y < s; y += 32) {
    ctx.fillStyle = y % 64 ? '#9e7040' : '#8f6236';
    ctx.fillRect(0, y, s, 32);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
  }
  // Outer frame + diagonal cross brace
  ctx.strokeStyle = '#5c3c1e'; ctx.lineWidth = 22;
  ctx.strokeRect(11, 11, s - 22, s - 22);
  ctx.lineWidth = 16;
  ctx.beginPath(); ctx.moveTo(18, 18); ctx.lineTo(s - 18, s - 18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s - 18, 18); ctx.lineTo(18, s - 18); ctx.stroke();
  // Corner iron brackets
  ctx.fillStyle = '#2d3138';
  for (const [x, y] of [[0, 0], [s - 22, 0], [0, s - 22], [s - 22, s - 22]]) ctx.fillRect(x, y, 22, 22);
});

const TEX_DOOR = makeTexture(256, (ctx, s) => {
  ctx.fillStyle = '#4e5d52'; ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = '#26302a'; ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, s - 12, s - 12);
  ctx.beginPath(); ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s); ctx.stroke();
  for (let y = 32; y < s; y += 64) {
    ctx.fillStyle = 'rgba(25,32,28,0.4)'; ctx.fillRect(14, y, s - 28, 10);
  }
});

function makeSiteSprayTex(letter) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = '#b91c1c'; ctx.lineWidth = 12;
  ctx.beginPath(); ctx.arc(128, 128, 96, 0, Math.PI * 2); ctx.stroke();
  ctx.font = '900 148px Arial Narrow, sans-serif';
  ctx.fillStyle = '#dc2626'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(letter, 128, 136);
  return new THREE.CanvasTexture(c);
}

// ---------- de_dustline Map Geometry & Colliders ----------
const colliders = []; // { minX, maxX, minY, maxY, minZ, maxZ, kind }
const mapMeshes = [];
const radarBoxes = []; // For live 2D radar rendering

const MAT_SAND = new THREE.MeshStandardMaterial({ map: TEX_SAND, roughness: 0.92, metalness: 0.02 });
const MAT_WALL = new THREE.MeshStandardMaterial({ map: TEX_WALL, roughness: 0.86, metalness: 0.04 });
const MAT_WALL_DARK = new THREE.MeshStandardMaterial({ map: TEX_WALL, color: 0xb7a487, roughness: 0.9, metalness: 0.04 });
const MAT_CRATE = new THREE.MeshStandardMaterial({ map: TEX_CRATE, roughness: 0.78, metalness: 0.08 });
const MAT_DOOR = new THREE.MeshStandardMaterial({ map: TEX_DOOR, roughness: 0.65, metalness: 0.25 });
const MAT_BARREL = new THREE.MeshStandardMaterial({ color: 0x3b5978, roughness: 0.45, metalness: 0.55 });

function addBox(x, y, z, w, h, d, mat, isSolid = true, onRadar = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = h > 0.2;
  mesh.receiveShadow = true;
  scene.add(mesh);
  mapMeshes.push(mesh);
  if (isSolid) {
    colliders.push({
      minX: x - w / 2, maxX: x + w / 2,
      minY: y - h / 2, maxY: y + h / 2,
      minZ: z - d / 2, maxZ: z + d / 2,
    });
    if (onRadar) radarBoxes.push({ x, z, w, d, isCrate: mat === MAT_CRATE });
  }
  return mesh;
}

function addSpray(x, y, z, letter, rotX = -Math.PI / 2, rotY = 0) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 3.4),
    new THREE.MeshBasicMaterial({ map: makeSiteSprayTex(letter), transparent: true, opacity: 0.85, depthWrite: false })
  );
  m.position.set(x, y, z);
  m.rotation.set(rotX, rotY, 0);
  scene.add(m);
}

function buildDustlineMap() {
  // Ground floor (Dust2 sandstone plaza)
  addBox(0, -0.5, 0, 76, 1, 56, MAT_SAND, false, false);

  // Outer perimeter fortress walls + desert parapet trims
  addBox(0, 4.5, -28, 76, 9, 2, MAT_WALL_DARK);
  addBox(0, 4.5, 28, 76, 9, 2, MAT_WALL_DARK);
  addBox(-38, 4.5, 0, 2, 9, 56, MAT_WALL_DARK);
  addBox(38, 4.5, 0, 2, 9, 56, MAT_WALL_DARK);

  // Center Mid dividing walls + Dust2 Mid Double Doors frame
  addBox(-10, 3.0, -10, 2.2, 6, 18, MAT_WALL);
  addBox(10, 3.0, 10, 2.2, 6, 18, MAT_WALL);
  addBox(0, 2.6, 0, 6.5, 5.2, 2.2, MAT_DOOR); // Iconic green-steel Mid Doors
  // Overhead archway lintels (decorative, high clearance)
  addBox(-10, 6.4, 4, 2.4, 1.4, 10, MAT_WALL_DARK, false, false);
  addBox(10, 6.4, -4, 2.4, 1.4, 10, MAT_WALL_DARK, false, false);

  // A-Site (North / -Z) Dust2 crate stacks & stone wall
  addBox(-22, 1.3, -15, 3.2, 2.6, 3.2, MAT_CRATE);
  addBox(-22, 3.3, -15.3, 1.6, 1.5, 1.6, MAT_CRATE, false, false);
  addBox(14, 1.3, -17, 3.4, 2.6, 2.6, MAT_CRATE);
  addBox(4, 2.5, -18, 8, 5, 1.8, MAT_WALL);
  addSpray(0, 0.03, -21, 'A');
  addSpray(4, 2.6, -17.05, 'A', 0, 0);

  // B-Site (South / +Z) warehouse cover & crate stacks
  addBox(22, 1.3, 15, 3.2, 2.6, 3.2, MAT_CRATE);
  addBox(22.2, 3.3, 15, 1.5, 1.5, 1.5, MAT_CRATE, false, false);
  addBox(-16, 1.3, 17, 3.5, 2.6, 2.8, MAT_CRATE);
  addBox(-4, 2.5, 18, 8, 5, 1.8, MAT_WALL);
  addSpray(0, 0.03, 21, 'B');
  addSpray(-4, 2.6, 17.05, 'B', 0, Math.PI);

  // Spawn cover barriers (CT -X, T +X)
  addBox(-28, 1.8, 0, 2, 3.6, 12, MAT_WALL_DARK);
  addBox(28, 1.8, 0, 2, 3.6, 12, MAT_WALL_DARK);

  // Accent CS:GO crates in Mid & Lanes
  addBox(-4, 0.9, 6, 2.2, 1.8, 2.2, MAT_CRATE);
  addBox(5, 0.9, -6, 2.2, 1.8, 2.2, MAT_CRATE);
  addBox(-20, 0.9, 6, 2.4, 1.8, 2.4, MAT_CRATE);
  addBox(20, 0.9, -6, 2.4, 1.8, 2.4, MAT_CRATE);

  // Decorative steel oil barrels near sites
  for (const [bx, bz] of [[-18, -19], [18, 19], [-6, -24], [6, 24]]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.25, 12), MAT_BARREL);
    barrel.position.set(bx, 0.62, bz);
    barrel.castShadow = true; barrel.receiveShadow = true;
    scene.add(barrel);
  }
}
buildDustlineMap();
enhanceDustline({ scene, mapMeshes, renderer, mats: { MAT_SAND, MAT_WALL, MAT_WALL_DARK, MAT_CRATE, MAT_DOOR, MAT_BARREL } });

// ---------- Detailed Multi-Part CS:GO 3D Weapon Viewmodels + Gloved Hands ----------
const vmRoot = new THREE.Group();
vmRoot.position.set(0.24, -0.22, -0.44);
camera.add(vmRoot);

// Tactical Gloved Forearms & Hands
const gloveMat = new THREE.MeshStandardMaterial({ color: 0x22262d, roughness: 0.85, metalness: 0.1 });
const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x3b4856, roughness: 0.88 });
const skinMat = new THREE.MeshStandardMaterial({ color: 0xd9a781, roughness: 0.65 });

const rightArm = new THREE.Group();
const rSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.34), sleeveMat);
rSleeve.position.set(0.08, -0.14, 0.24); rSleeve.rotation.set(0.25, -0.22, 0);
const rGlove = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.075, 0.11), gloveMat);
rGlove.position.set(0.02, -0.08, 0.06);
rightArm.add(rSleeve, rGlove);

const leftArm = new THREE.Group();
const lSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.38), sleeveMat);
lSleeve.position.set(-0.22, -0.15, 0.10); lSleeve.rotation.set(0.18, 0.56, 0.1);
const lGlove = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.075, 0.11), gloveMat);
lGlove.position.set(-0.04, -0.06, -0.14);
leftArm.add(lSleeve, lGlove);
vmRoot.add(rightArm, leftArm);

const mGunMetal = new THREE.MeshStandardMaterial({ color: 0x26292f, roughness: 0.42, metalness: 0.78 });
const mGunDark = new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.52, metalness: 0.65 });
const mWood = new THREE.MeshStandardMaterial({ color: 0x8b4c24, roughness: 0.68, metalness: 0.08 });
const mChrome = new THREE.MeshStandardMaterial({ color: 0xdbe3ec, roughness: 0.2, metalness: 0.92 });
const mOlive = new THREE.MeshStandardMaterial({ color: 0x4b5c3d, roughness: 0.65, metalness: 0.15 });
const mGold = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.28, metalness: 0.85 });

function part(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  return m;
}

const weaponModels = {};

// 1. AK-47 (vandal)
(() => {
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(0.065, 0.09, 0.34), mGunMetal, 0, 0, 0.02));          // Receiver
  g.add(part(new THREE.BoxGeometry(0.058, 0.075, 0.24), mWood, 0, -0.025, 0.29, 0.12));  // Wood stock
  g.add(part(new THREE.BoxGeometry(0.062, 0.068, 0.22), mWood, 0, -0.005, -0.24));       // Wood handguard
  g.add(part(new THREE.CylinderGeometry(0.014, 0.014, 0.42, 10), mGunDark, 0, 0.015, -0.44, Math.PI / 2)); // Barrel
  g.add(part(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8), mGunMetal, 0, 0.042, -0.26, Math.PI / 2)); // Gas tube
  g.add(part(new THREE.BoxGeometry(0.014, 0.048, 0.02), mGunDark, 0, 0.052, -0.58));     // Front sight post
  // Curved banana magazine
  g.add(part(new THREE.BoxGeometry(0.046, 0.15, 0.075), mGunDark, 0, -0.11, -0.08, 0.22));
  g.add(part(new THREE.BoxGeometry(0.044, 0.11, 0.07), mGunDark, 0, -0.21, -0.12, 0.42));
  g.add(part(new THREE.BoxGeometry(0.042, 0.11, 0.055), mWood, 0, -0.09, 0.08, -0.25));  // Pistol grip
  weaponModels.vandal = g;
  vmRoot.add(g);
})();

// 2. M4A1-S (phantom)
(() => {
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(0.068, 0.095, 0.36), mGunDark, 0, 0, 0.0));
  g.add(part(new THREE.BoxGeometry(0.055, 0.08, 0.24), mGunDark, 0, -0.015, 0.28));      // Stock
  g.add(part(new THREE.BoxGeometry(0.04, 0.032, 0.24), mGunMetal, 0, 0.062, -0.02));     // Top rail
  g.add(part(new THREE.CylinderGeometry(0.024, 0.024, 0.24, 10), mGunMetal, 0, 0.008, -0.28, Math.PI / 2)); // Handguard
  g.add(part(new THREE.CylinderGeometry(0.022, 0.022, 0.30, 12), mGunDark, 0, 0.008, -0.54, Math.PI / 2));  // Silencer
  g.add(part(new THREE.BoxGeometry(0.044, 0.17, 0.065), mGunMetal, 0, -0.12, -0.07, 0.08)); // Straight mag
  weaponModels.phantom = g;
  vmRoot.add(g);
})();

// 3. AWP (operator)
(() => {
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(0.072, 0.095, 0.62), mOlive, 0, -0.01, -0.02));       // Iconic Olive Stock
  g.add(part(new THREE.CylinderGeometry(0.017, 0.020, 0.62, 10), mGunDark, 0, 0.022, -0.52, Math.PI / 2)); // Heavy barrel
  // Telescopic Sniper Scope
  g.add(part(new THREE.CylinderGeometry(0.026, 0.022, 0.30, 12), mGunDark, 0, 0.088, -0.06, Math.PI / 2));
  g.add(part(new THREE.CylinderGeometry(0.034, 0.026, 0.09, 12), mGunMetal, 0, 0.088, -0.24, Math.PI / 2));
  g.add(part(new THREE.BoxGeometry(0.018, 0.045, 0.022), mGunMetal, 0, 0.055, -0.14));
  g.add(part(new THREE.BoxGeometry(0.018, 0.045, 0.022), mGunMetal, 0, 0.055, 0.02));
  g.add(part(new THREE.BoxGeometry(0.046, 0.12, 0.08), mGunDark, 0, -0.10, -0.06));
  weaponModels.operator = g;
  vmRoot.add(g);
})();

// 4. Desert Eagle (sheriff)
(() => {
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(0.052, 0.068, 0.28), mChrome, 0, 0.02, -0.06));       // Brushed chrome slide
  g.add(part(new THREE.BoxGeometry(0.046, 0.032, 0.24), mGunDark, 0, -0.022, -0.04));    // Lower frame
  g.add(part(new THREE.BoxGeometry(0.044, 0.13, 0.068), mGunDark, 0, -0.085, 0.04, -0.24)); // Rubber grip
  weaponModels.sheriff = g;
  vmRoot.add(g);
})();

// 5. Karambit Knife (knife)
(() => {
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(0.024, 0.032, 0.13), mGunDark, -0.02, -0.02, -0.02, 0.2, 0.35, 0));
  g.add(part(new THREE.TorusGeometry(0.022, 0.006, 8, 16), mGold, -0.04, -0.035, 0.06, 0, Math.PI / 2, 0));
  g.add(part(new THREE.BoxGeometry(0.008, 0.036, 0.16), mGold, -0.01, 0.005, -0.15, -0.28, 0.35, 0));
  weaponModels.knife = g;
  vmRoot.add(g);
})();

// 3D Star Muzzle Flash
const muzzleFlash = new THREE.Group();
const mfMat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0, depthWrite: false });
muzzleFlash.add(
  part(new THREE.BoxGeometry(0.22, 0.04, 0.04), mfMat, 0, 0, 0),
  part(new THREE.BoxGeometry(0.04, 0.22, 0.04), mfMat, 0, 0, 0),
  part(new THREE.SphereGeometry(0.06, 8, 8), mfMat, 0, 0, 0)
);
muzzleFlash.position.set(0, 0.02, -0.68);
vmRoot.add(muzzleFlash);

// ---------- Upgraded CS:GO CT & T 3D Operative Models ----------
function nameTagSprite(name, team) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 42;
  const cx = c.getContext('2d');
  cx.fillStyle = 'rgba(10,14,19,0.75)'; cx.fillRect(14, 4, 228, 34);
  cx.font = 'bold 19px Arial Narrow, sans-serif';
  cx.fillStyle = team === 'alpha' ? '#6eb3f7' : '#e3a73b';
  cx.textAlign = 'center'; cx.fillText(name.slice(0, 16), 128, 28);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  tag.scale.set(1.5, 0.25, 1); tag.position.y = 2.2;
  return tag;
}
// skinned operator with team kit once the mannequin has loaded; blocky fallback before that
function createAgentModel(name, team) {
  if (charsReady()) {
    const op = new Operator(name, team);
    op.group.add(nameTagSprite(name, team));
    return op;
  }
  return createBlockyAgent(name, team);
}
// swap any fallback figures for skinned operators as soon as the models are available
function upgradeAgentModels(list) {
  if (!charsReady()) return;
  for (const a of list) {
    if (!a.model || a.model.animate) continue;
    const old = a.model, parent = old.group.parent, nm = createAgentModel(a.name, a.team);
    nm.group.position.copy(old.group.position); nm.group.rotation.copy(old.group.rotation); nm.group.visible = old.group.visible;
    old.group.traverse((o) => { if (o.isSprite && !o.visible) nm.group.traverse((q) => { if (q.isSprite) q.visible = false; }); });
    if (parent) { parent.remove(old.group); parent.add(nm.group); }
    a.model = nm;
  }
}
function createBlockyAgent(name, team) {
  const g = new THREE.Group();
  const isCT = team === 'alpha';
  const suitCol = isCT ? 0x26384d : 0x5c4b37;
  const vestCol = isCT ? 0x1d2836 : 0x3b3126;
  const accentCol = isCT ? 0x6eb3f7 : 0xe3a73b;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.86, 0.38), new THREE.MeshStandardMaterial({ color: suitCol, roughness: 0.8 }));
  torso.position.y = 1.08; torso.castShadow = true; torso.userData = { part: 'body' };

  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.50, 0.44), new THREE.MeshStandardMaterial({ color: vestCol, roughness: 0.72 }));
  vest.position.y = 1.14; vest.castShadow = true; vest.userData = { part: 'body' };

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), new THREE.MeshStandardMaterial({ color: 0xe6bd96, roughness: 0.65 }));
  head.position.y = 1.72; head.castShadow = true; head.userData = { part: 'head' };

  // CT Ballistic Helmet / T Desert Headwrap
  const helmet = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.22, 0.42),
    new THREE.MeshStandardMaterial({ color: isCT ? 0x1f2d3d : 0x7c2d12, roughness: 0.6 })
  );
  helmet.position.y = 1.84; helmet.userData = { part: 'head' };

  const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.10, 0.10), new THREE.MeshStandardMaterial({ color: accentCol, roughness: 0.2, metalness: 0.6 }));
  goggles.position.set(0, 1.74, 0.18); goggles.userData = { part: 'head' };

  // Legs
  const legMat = new THREE.MeshStandardMaterial({ color: isCT ? 0x1a222e : 0x443a2e, roughness: 0.85 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.68, 0.28), legMat);
  legL.position.set(-0.16, 0.34, 0); legL.castShadow = true; legL.userData = { part: 'body' };
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.68, 0.28), legMat);
  legR.position.set(0.16, 0.34, 0); legR.castShadow = true; legR.userData = { part: 'body' };

  // Held Rifle
  const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.78), mGunDark);
  rifle.position.set(0.34, 1.14, 0.32); rifle.castShadow = true;

  // Name Tag
  const c = document.createElement('canvas'); c.width = 256; c.height = 42;
  const cx = c.getContext('2d');
  cx.fillStyle = 'rgba(10,14,19,0.75)'; cx.fillRect(14, 4, 228, 34);
  cx.font = 'bold 19px Arial Narrow, sans-serif';
  cx.fillStyle = isCT ? '#6eb3f7' : '#e3a73b';
  cx.textAlign = 'center'; cx.fillText(name.slice(0, 16), 128, 28);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  tag.scale.set(1.5, 0.25, 1); tag.position.y = 2.24;

  g.add(torso, vest, head, helmet, goggles, legL, legR, rifle, tag);
  return { group: g, head, torso, vest, legL, legR, hitMeshes: [head, helmet, goggles, torso, vest, legL, legR] };
}

// ---------- Game & Player State ----------
let inMatch = false;
let isMP = false;
let paused = false;
let buyOpen = false;
let chatOpen = false;
let sbOpen = false;
let roundTime = 115; // 1:55 CS:GO round clock

const me = {
  id: 'local',
  name: 'DillyAgent',
  team: 'alpha',
  pos: new THREE.Vector3(-32, 0, 0),
  vel: new THREE.Vector3(0, 0, 0),
  yaw: -Math.PI / 2,
  pitch: 0,
  hp: 100,
  shield: 100,
  cash: 1200,
  kills: 0,
  deaths: 0,
  onGround: true,
  crouching: false,
  scoped: false,
  weaponId: 'vandal',
  owned: new Set(['vandal', 'sheriff', 'knife']),
  ammo: { vandal: [30, 90], phantom: [25, 100], operator: [5, 30], sheriff: [7, 35], knife: [0, 0] },
  fireCd: 0,
  reloadTimer: 0,
  inspectTimer: 0,
  recoilKick: 0,
  walkPhase: 0,
  keys: {},
};

let scoreAlpha = 0, scoreOmega = 0;
let mouseDown = false;
const abCd = { q: 0, e: 0, c: 0 };

// Active FX
const tracers = [];
const smokes = [];
const decals = []; // Wall bullet holes

let bots = [];
const remotes = new Map();
let ws = null;
let lastSync = 0;

// CC0 gun models + gloved arms + animation layer (falls back to the box guns until loaded)
const VM = createViewmodel({ vmRoot, camera, scene, me, weaponModels, oldParts: [rightArm, leftArm, muzzleFlash], team: me.team });

// ---------- Weapon & Loadout Helpers ----------
function equipWeapon(id) {
  if (!me.owned.has(id)) return;
  me.weaponId = id;
  me.reloadTimer = 0;
  me.inspectTimer = 0;
  setScoped(false);
  for (const [wid, mesh] of Object.entries(weaponModels)) mesh.visible = wid === id;
  leftArm.visible = id !== 'knife';
  syncHud();
}

function setScoped(on) {
  const w = WEAPONS[me.weaponId];
  me.scoped = !!(on && w.scope);
  $('scope-overlay').classList.toggle('on', me.scoped);
  $('xhair').style.display = me.scoped ? 'none' : 'block';
  vmRoot.visible = !me.scoped;
  camera.fov = me.scoped ? 28 : 76;
  camera.updateProjectionMatrix();
}

function startReload() {
  const w = WEAPONS[me.weaponId];
  if (w.melee || me.reloadTimer > 0) return;
  const [cur, res] = me.ammo[w.id];
  if (cur >= w.mag || res <= 0) return;
  me.reloadTimer = 1.45;
  me.inspectTimer = 0;
  sfxTone(280, 0.12, 'triangle', 0.08, 460);
  syncHud();
}

function spawnTracer(from, to, color = 0xffe88a) {
  const g = new THREE.BufferGeometry().setFromPoints([from, to]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }));
  scene.add(l);
  tracers.push({ line: l, life: 0.065 });
}

function spawnBulletDecal(hit) {
  if (!hit.face) return;
  const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  const d = new THREE.Mesh(
    new THREE.CircleGeometry(0.065, 8),
    new THREE.MeshBasicMaterial({ color: 0x111316, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 })
  );
  d.position.copy(hit.point).addScaledVector(n, 0.012);
  d.lookAt(hit.point.clone().add(n));
  scene.add(d);
  decals.push(d);
  while (decals.length > 42) {
    const old = decals.shift();
    scene.remove(old); old.geometry.dispose();
  }
}

function spawnSmoke(x, y, z) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(3.8, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xd6dee6, roughness: 1.0, transparent: true, opacity: 0.9 })
  );
  m.position.set(x, Math.max(1.9, y), z);
  scene.add(m);
  smokes.push({ mesh: m, life: 10.0 });
  sfxNoise(0.36, 460, 0.22);
}

// ---------- Shooting & Hit Detection ----------
const raycaster = new THREE.Raycaster();

function fireWeapon() {
  if (me.fireCd > 0 || me.reloadTimer > 0) return;
  const w = WEAPONS[me.weaponId];
  if (!w.melee) {
    if (me.ammo[w.id][0] <= 0) { startReload(); return; }
    me.ammo[w.id][0]--;
  }

  me.inspectTimer = 0;
  me.fireCd = 60 / w.rpm;
  me.recoilKick = Math.min(0.18, me.recoilKick + (w.recoil || 0.02) * 1.45);
  me.pitch = Math.min(Math.PI / 2 - 0.05, me.pitch + (w.recoil || 0.015) * (me.crouching ? 0.5 : 1.0));
  mfMat.opacity = w.melee || w.id === 'phantom' ? 0 : 0.95;
  muzzleFlash.rotation.z = Math.random() * Math.PI;
  VM.shot();
  playShot(w.id);

  const moveSpd = Math.hypot(me.vel.x, me.vel.z);
  const spread = (w.spread || 0) * (me.scoped ? 0.12 : 1.0) * (me.crouching ? 0.42 : 1.0) + (moveSpd > 1.2 ? 0.024 : 0);
  const dir = new THREE.Vector3(
    (Math.random() - 0.5) * spread,
    (Math.random() - 0.5) * spread,
    -1
  ).applyEuler(camera.rotation).normalize();

  raycaster.set(camera.position, dir);
  raycaster.far = w.melee ? 2.6 : 130;

  const wallHits = raycaster.intersectObjects(mapMeshes, false);
  let maxDist = wallHits.length > 0 ? wallHits[0].distance : raycaster.far;
  const endPt = camera.position.clone().addScaledVector(dir, maxDist);

  const targets = [];
  if (!isMP) {
    for (const b of bots) {
      if (b.hp > 0) for (const hm of b.model.hitMeshes) { hm.userData.bot = b; targets.push(hm); }
    }
  } else {
    for (const r of remotes.values()) {
      if (r.team !== me.team) for (const hm of r.model.hitMeshes) { hm.userData.remote = r; targets.push(hm); }
    }
  }

  const hits = raycaster.intersectObjects(targets, false);
  if (hits.length > 0 && hits[0].distance < maxDist) {
    const hit = hits[0];
    endPt.copy(hit.point);
    const isHS = hit.object.userData.part === 'head';
    const dmg = Math.round(w.dmg * (isHS ? w.hsMult : 1.0));
    showHitmarker(isHS);
    if (isHS) playHeadshot();

    if (hit.object.userData.bot) {
      damageBot(hit.object.userData.bot, dmg, isHS, w.name);
    } else if (hit.object.userData.remote && ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'hit', target: hit.object.userData.remote.id, dmg, hs: isHS, weapon: w.name }));
    }
  } else if (wallHits.length > 0 && !w.melee) {
    spawnBulletDecal(wallHits[0]);
  }

  if (!w.melee) {
    const startPt = camera.position.clone().add(new THREE.Vector3(0.20, -0.14, -0.55).applyEuler(camera.rotation));
    spawnTracer(startPt, endPt, w.id === 'operator' ? 0xf87171 : 0xffe88a);
  }
  syncHud();
}

function showHitmarker(hs) {
  const hm = $('hitmarker');
  hm.classList.toggle('hs', hs);
  hm.style.opacity = '1';
  setTimeout(() => { hm.style.opacity = '0'; }, 120);
  if (hs) {
    const hb = $('hs-banner');
    hb.style.opacity = '1';
    setTimeout(() => { hb.style.opacity = '0'; }, 700);
  }
}

// ---------- Tactical Bots ----------
const BOT_WAYPOINTS = [
  [-6, -20], [8, -19], [0, -6], [0, 6], [-8, 20], [10, 19], [20, 0], [-18, -8], [18, 8]
];

function spawnBots() {
  for (const b of bots) scene.remove(b.model.group);
  bots = [];
  const names = ['BOT-Phoenix', 'BOT-Viper', 'BOT-Reaper', 'BOT-Kodiak', 'BOT-Ghost'];
  for (let i = 0; i < names.length; i++) {
    const model = createAgentModel(names[i], 'omega');
    const sx = 24 + (i % 2) * 5;
    const sz = -12 + i * 6;
    model.group.position.set(sx, 0, sz);
    scene.add(model.group);
    bots.push({
      id: 'bot_' + i, name: names[i], team: 'omega', model,
      pos: new THREE.Vector3(sx, 0, sz),
      hp: 100, kills: 0, deaths: 0, cash: 800,
      wp: BOT_WAYPOINTS[i % BOT_WAYPOINTS.length],
      fireCd: 1.2 + Math.random(), respawnTimer: 0, blindTimer: 0, stride: Math.random() * 6
    });
  }
}

function damageBot(bot, dmg, isHS, wepName) {
  bot.hp -= dmg;
  if (bot.hp <= 0) {
    bot.hp = 0;
    bot.deaths++;
    bot.respawnTimer = 4.0;
    if (!bot.model.animate) bot.model.group.visible = false; // skinned operators play their death animation first
    me.kills++;
    me.cash = Math.min(16000, me.cash + (wepName === 'Dilly Fang' ? 1500 : 300));
    scoreAlpha++;
    addKillfeed(me.name, bot.name, wepName, isHS, me.team, bot.team, true);
    syncHud();
  }
}

function updateBots(dt) {
  if (isMP) return;
  for (const b of bots) {
    if (b.respawnTimer > 0) {
      b.respawnTimer -= dt;
      if (b.model.animate) { b.model.animate(dt, { dead: true }); if (b.respawnTimer < 1.3) b.model.group.visible = false; }
      if (b.respawnTimer <= 0) {
        b.hp = 100;
        b.pos.set(26 + (Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 24);
        b.model.group.position.copy(b.pos);
        b.model.group.visible = true;
        syncHud();
      }
      continue;
    }
    if (b.blindTimer > 0) { b.blindTimer -= dt; continue; }

    const dx = b.wp[0] - b.pos.x, dz = b.wp[1] - b.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.8) {
      b.wp = BOT_WAYPOINTS[Math.floor(Math.random() * BOT_WAYPOINTS.length)];
    } else {
      const nx = b.pos.x + (dx / d) * 4.2 * dt;
      const nz = b.pos.z + (dz / d) * 4.2 * dt;
      if (!collides(nx, 0.5, nz, 0.45)) {
        b.pos.x = nx; b.pos.z = nz;
        b.stride += dt * 9;
        b.model.legL.rotation.x = Math.sin(b.stride) * 0.45;
        b.model.legR.rotation.x = -Math.sin(b.stride) * 0.45;
      } else {
        b.wp = BOT_WAYPOINTS[Math.floor(Math.random() * BOT_WAYPOINTS.length)];
      }
    }

    const toP = new THREE.Vector3(me.pos.x - b.pos.x, (me.pos.y + 1.4) - (b.pos.y + 1.5), me.pos.z - b.pos.z);
    const distP = toP.length();
    b.model.group.position.copy(b.pos);
    b.model.group.rotation.y = Math.atan2(toP.x, toP.z);
    if (b.model.animate) b.model.animate(dt, { aim: distP < 34, pitch: Math.atan2(toP.y, Math.hypot(toP.x, toP.z)) });

    b.fireCd -= dt;
    if (distP < 34 && b.fireCd <= 0) {
      const bOrigin = new THREE.Vector3(b.pos.x, 1.55, b.pos.z);
      raycaster.set(bOrigin, toP.clone().normalize());
      raycaster.far = distP;
      const blocked = raycaster.intersectObjects(mapMeshes, false).length > 0;
      if (!blocked) {
        b.fireCd = 0.78 + Math.random() * 0.55;
        if (b.model.fired) b.model.fired();
        spawnTracer(b.model.muzzleWorld ? b.model.muzzleWorld() : bOrigin, me.pos.clone().add(new THREE.Vector3(0, 1.3, 0)), 0xfde047);
        sfxNoise(0.08, 900, 0.09);
        if (Math.random() < 0.32) {
          applyDamageToMe(14 + Math.floor(Math.random() * 8), b.name);
        }
      }
    }
  }
}

function applyDamageToMe(dmg, byName) {
  const absorb = Math.min(me.shield, Math.floor(dmg * 0.5));
  me.shield -= absorb;
  me.hp = Math.max(0, me.hp - (dmg - absorb));
  $('hurt-fx').style.opacity = '1';
  setTimeout(() => { $('hurt-fx').style.opacity = '0'; }, 160);
  if (me.hp <= 0) {
    me.deaths++;
    scoreOmega++;
    addKillfeed(byName, me.name, 'Dill-47', false, 'omega', me.team, false);
    respawnMe();
  }
  syncHud();
}

function respawnMe() {
  const sx = me.team === 'alpha' ? -23 : 23;
  const sz = me.team === 'alpha' ? -10 : 10;
  me.pos.set(sx, 0, sz + (Math.random() - 0.5) * 4);
  me.vel.set(0, 0, 0);
  me.hp = 100;
  me.shield = 100;
  me.yaw = me.team === 'alpha' ? -1.18 : 1.95;
  me.pitch = 0;
  setScoped(false);
  VM.setTeam(me.team);
  syncHud();
}

// ---------- Physics, Movement & Viewmodel Animation ----------
function collides(x, y, z, r = 0.42) {
  for (const c of colliders) {
    if (x + r > c.minX && x - r < c.maxX && y + 1.7 > c.minY && y < c.maxY && z + r > c.minZ && z - r < c.maxZ) {
      return true;
    }
  }
  return false;
}

function getCallout(x, z) {
  if (x < -25) return 'CT SPAWN';
  if (x > 25) return 'T SPAWN';
  if (z < -13) return 'BOMBSITE A';
  if (z > 13) return 'BOMBSITE B';
  if (Math.abs(x) < 12 && Math.abs(z) < 12) return 'MID DOORS';
  return z < 0 ? 'LONG A' : 'B TUNNELS';
}

function updatePlayer(dt) {
  me.crouching = !!(me.keys[BINDS.crouch] || (BINDS.crouch === 'ControlLeft' && me.keys['ControlRight']));
  const fwd = (me.keys[BINDS.fwd] ? 1 : 0) - (me.keys[BINDS.back] ? 1 : 0);
  const str = (me.keys[BINDS.right] ? 1 : 0) - (me.keys[BINDS.left] ? 1 : 0);

  let spd = me.weaponId === 'knife' ? 8.4 : (me.scoped ? 3.2 : (me.crouching ? 3.3 : 6.4));
  const sinY = Math.sin(me.yaw), cosY = Math.cos(me.yaw);
  let mx = -sinY * fwd + cosY * str;
  let mz = -cosY * fwd - sinY * str;
  const ml = Math.hypot(mx, mz);
  if (ml > 0.01) { mx /= ml; mz /= ml; }

  me.vel.x = THREE.MathUtils.lerp(me.vel.x, mx * spd, Math.min(1, dt * 14));
  me.vel.z = THREE.MathUtils.lerp(me.vel.z, mz * spd, Math.min(1, dt * 14));
  me.vel.y -= 24 * dt;
  if (me.keys[BINDS.jump] && me.onGround) { me.vel.y = 8.0; me.onGround = false; }

  const nx = me.pos.x + me.vel.x * dt;
  if (!collides(nx, me.pos.y, me.pos.z)) me.pos.x = nx; else me.vel.x = 0;
  const nz = me.pos.z + me.vel.z * dt;
  if (!collides(me.pos.x, me.pos.y, nz)) me.pos.z = nz; else me.vel.z = 0;

  me.pos.y += me.vel.y * dt;
  if (me.pos.y <= 0) { me.pos.y = 0; me.vel.y = 0; me.onGround = true; }

  const eyeY = me.crouching ? 1.18 : 1.62;
  camera.position.set(me.pos.x, me.pos.y + eyeY, me.pos.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(me.pitch, me.yaw, 0);

  // Dynamic CS:GO Crosshair
  const gap = Math.round(4 + (ml > 0.1 ? 6 : 0) + me.recoilKick * 88 - (me.crouching ? 2 : 0));
  $('xhair').style.setProperty('--gap', Math.max(2, gap) + 'px');

  if (me.fireCd > 0) me.fireCd -= dt;
  if (me.reloadTimer > 0) {
    me.reloadTimer -= dt;
    if (me.reloadTimer <= 0) {
      const w = WEAPONS[me.weaponId];
      const need = w.mag - me.ammo[w.id][0];
      const take = Math.min(need, me.ammo[w.id][1]);
      me.ammo[w.id][0] += take;
      me.ammo[w.id][1] -= take;
      syncHud();
    }
  }
  if (me.inspectTimer > 0) me.inspectTimer = Math.max(0, me.inspectTimer - dt);
  if (mouseDown && WEAPONS[me.weaponId].auto) fireWeapon();

  // Viewmodel walk bob + recoil + reload + F-key inspect animation
  const speed2D = Math.hypot(me.vel.x, me.vel.z);
  if (speed2D > 0.4 && me.onGround) me.walkPhase += dt * (speed2D * 1.65);
  const bobX = Math.cos(me.walkPhase) * 0.009 * Math.min(1, speed2D / 5);
  const bobY = Math.abs(Math.sin(me.walkPhase)) * 0.011 * Math.min(1, speed2D / 5);

  me.recoilKick = Math.max(0, me.recoilKick - dt * 0.95);
  mfMat.opacity = Math.max(0, mfMat.opacity - dt * 22);

  if (VM.update(dt)) return;
  const inspT = me.inspectTimer > 0 ? Math.sin((me.inspectTimer / 1.8) * Math.PI) : 0;
  vmRoot.position.set(
    0.24 + bobX - inspT * 0.08,
    -0.22 - bobY - (me.reloadTimer > 0 ? 0.14 : 0) + inspT * 0.04,
    -0.44 + me.recoilKick
  );
  vmRoot.rotation.set(
    me.recoilKick * 1.5 + inspT * 0.22,
    inspT * 0.85,
    inspT * 0.32
  );
}

// ---------- Tactical Utility (Flash / Smoke / Dash) ----------
function useFlash() {
  if (abCd.q > 0) return;
  abCd.q = 12;
  sfxTone(1600, 0.28, 'sine', 0.12, 2400);
  $('flash-fx').style.opacity = '0.45';
  setTimeout(() => { $('flash-fx').style.opacity = '0'; }, 240);
  for (const b of bots) if (b.pos.distanceTo(me.pos) < 22) b.blindTimer = 3.2;
}
function useSmoke() {
  if (abCd.e > 0) return;
  abCd.e = 14;
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation).normalize();
  const pt = camera.position.clone().addScaledVector(dir, 11);
  spawnSmoke(pt.x, 1.8, pt.z);
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'smoke', x: pt.x, y: 1.8, z: pt.z }));
}
function useDash() {
  if (abCd.c > 0) return;
  abCd.c = 8;
  sfxNoise(0.16, 1200, 0.22);
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, me.yaw, 0));
  me.vel.x = dir.x * 24;
  me.vel.z = dir.z * 24;
}

// ---------- Authentic CS:GO 2D Circular Tactical Radar ----------
const radarCanvas = $('cs-radar');
const rctx = radarCanvas.getContext('2d');

function drawRadar() {
  const W = radarCanvas.width, H = radarCanvas.height;
  const cx = W / 2, cy = H / 2, scale = 2.35;
  rctx.clearRect(0, 0, W, H);
  rctx.fillStyle = '#101820';
  rctx.fillRect(0, 0, W, H);

  rctx.save();
  rctx.translate(cx, cy);
  rctx.rotate(me.yaw); // Rotate map so player always faces UP like CS:GO radar

  const toR = (wx, wz) => [(wx - me.pos.x) * scale, (wz - me.pos.z) * scale];

  // Floor footprint
  const [fx, fz] = toR(-38, -28);
  rctx.fillStyle = '#252d36';
  rctx.fillRect(fx, fz, 76 * scale, 56 * scale);

  // Bombsites A & B
  const [ax, az] = toR(0, -21);
  rctx.fillStyle = 'rgba(227,167,59,0.28)'; rctx.fillRect(ax - 12, az - 8, 24, 16);
  const [bx, bz] = toR(0, 21);
  rctx.fillStyle = 'rgba(110,179,247,0.28)'; rctx.fillRect(bx - 12, bz - 8, 24, 16);

  // Walls & Crates
  for (const b of radarBoxes) {
    const [rx, rz] = toR(b.x - b.w / 2, b.z - b.d / 2);
    rctx.fillStyle = b.isCrate ? '#8c6943' : '#536273';
    rctx.fillRect(rx, rz, b.w * scale, b.d * scale);
  }

  // Site Letters
  rctx.fillStyle = '#fde047'; rctx.font = 'bold 11px sans-serif'; rctx.textAlign = 'center';
  rctx.fillText('A', ax, az + 4);
  rctx.fillStyle = '#7dd3fc';
  rctx.fillText('B', bx, bz + 4);

  // Enemies / Teammates
  const entities = isMP ? Array.from(remotes.values()) : bots.filter(b => b.hp > 0);
  for (const e of entities) {
    const pos = e.pos || e.targetPos;
    if (!pos) continue;
    const [ex, ez] = toR(pos.x, pos.z);
    rctx.beginPath();
    rctx.arc(ex, ez, 4.2, 0, Math.PI * 2);
    rctx.fillStyle = e.team === me.team ? '#6eb3f7' : '#ef4444';
    rctx.fill();
    rctx.strokeStyle = '#000'; rctx.lineWidth = 1.2; rctx.stroke();
  }
  rctx.restore();

  // Player FOV Cone (always pointing UP)
  rctx.save();
  rctx.translate(cx, cy);
  const fg = rctx.createRadialGradient(0, 0, 2, 0, 0, 56);
  fg.addColorStop(0, 'rgba(255,255,255,0.26)');
  fg.addColorStop(1, 'rgba(255,255,255,0)');
  rctx.fillStyle = fg;
  rctx.beginPath(); rctx.moveTo(0, 0); rctx.arc(0, 0, 56, -Math.PI * 0.72, -Math.PI * 0.28); rctx.closePath(); rctx.fill();

  // Player Chevron
  rctx.fillStyle = '#6ee755';
  rctx.beginPath(); rctx.moveTo(0, -6); rctx.lineTo(5, 5); rctx.lineTo(0, 2.5); rctx.lineTo(-5, 5); rctx.closePath();
  rctx.fill();
  rctx.restore();

  $('radar-callout').textContent = getCallout(me.pos.x, me.pos.z);
}

// ---------- Rust WebSocket Multiplayer ----------
function connectMultiplayer(name) {
  $('mp-msg').textContent = 'Connecting to ' + DILLY_STRIKE_WS + '...';
  return new Promise((resolve, reject) => {
    let settled = false;
    try { ws = new WebSocket(DILLY_STRIKE_WS); } catch (e) { return reject(e); }
    const timer = setTimeout(() => {
      if (!settled) { settled = true; try { ws.close(); } catch (_) {} reject(new Error('Could not reach ' + DILLY_STRIKE_WS)); }
    }, 4500);

    ws.onopen = () => ws.send(JSON.stringify({ type: 'join', name }));
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (m.type === 'welcome') {
        clearTimeout(timer);
        me.id = m.id; me.team = m.team || 'alpha';
        scoreAlpha = m.alpha || 0; scoreOmega = m.omega || 0;
        for (const p of (m.players || [])) if (p.id !== me.id) addRemote(p);
        if (!settled) { settled = true; resolve(m); }
      } else if (m.type === 'player_join') {
        addRemote(m.player);
        addChat('SYSTEM', `${m.player.name} joined ${m.player.team.toUpperCase()}.`);
      } else if (m.type === 'leave') {
        const r = remotes.get(m.id);
        if (r) { scene.remove(r.model.group); remotes.delete(m.id); }
      } else if (m.type === 'state') {
        const r = remotes.get(m.id);
        if (r) { r.targetPos.set(m.x, m.y, m.z); r.targetYaw = m.yaw; }
      } else if (m.type === 'damaged') {
        me.hp = m.hp; me.shield = m.armor;
        $('hurt-fx').style.opacity = '1';
        setTimeout(() => { $('hurt-fx').style.opacity = '0'; }, 160);
        syncHud();
      } else if (m.type === 'kill') {
        scoreAlpha = m.alpha; scoreOmega = m.omega;
        addKillfeed(m.killer, m.victim, m.weapon, m.hs, 'alpha', 'omega', m.killer === me.name);
        if (m.victimId === me.id) { me.deaths++; respawnMe(); }
        if (m.killer === me.name) { me.kills++; me.cash = Math.min(16000, me.cash + 300); }
        syncHud();
      } else if (m.type === 'smoke') {
        spawnSmoke(m.x, m.y, m.z);
      } else if (m.type === 'chat') {
        addChat(m.name, m.text);
      }
    };
    ws.onerror = () => {
      if (!settled) { settled = true; clearTimeout(timer); reject(new Error('Rust server unreachable at ' + DILLY_STRIKE_WS)); }
    };
  });
}

function addRemote(p) {
  if (remotes.has(p.id)) return;
  const model = createAgentModel(p.name, p.team);
  model.group.position.set(p.x || 0, p.y || 0, p.z || 0);
  scene.add(model.group);
  remotes.set(p.id, { ...p, model, targetPos: model.group.position.clone(), targetYaw: p.yaw || 0 });
}

// ---------- CS:GO HUD Sync, Vertical Loadout, Avatars & Killfeed ----------
function syncHud() {
  $('sc-a').textContent = scoreAlpha;
  $('sc-o').textContent = scoreOmega;
  $('hud-hp').textContent = me.hp;
  $('hud-sh').textContent = me.shield;
  $('hud-cash').textContent = me.cash;
  $('hp-fill').style.width = Math.max(0, Math.min(100, me.hp)) + '%';
  $('sh-fill').style.width = Math.max(0, Math.min(100, me.shield)) + '%';
  document.querySelector('.cs-stat.hp')?.classList.toggle('low', me.hp <= 25);

  const w = WEAPONS[me.weaponId];
  $('wep-name').textContent = me.reloadTimer > 0 ? `${w.name} · RELOADING` : w.name;
  $('wep-mag').textContent = w.melee ? '∞' : me.ammo[w.id][0];
  $('wep-res').textContent = w.melee ? '' : me.ammo[w.id][1];

  // Bullet pips bar
  const pips = $('ammo-pips');
  pips.innerHTML = '';
  if (!w.melee) {
    const total = Math.min(w.mag, 30);
    const cur = me.ammo[w.id][0];
    for (let i = 0; i < total; i++) {
      const sp = document.createElement('span');
      sp.className = 'pip' + (i >= cur ? ' empty' : '');
      pips.appendChild(sp);
    }
  }

  // Right-edge CS:GO Vertical Weapon Loadout Strip
  const lo = $('cs-loadout');
  lo.innerHTML = '';
  for (const wep of Object.values(WEAPONS)) {
    if (!me.owned.has(wep.id)) continue;
    const row = document.createElement('div');
    row.className = 'lo-slot' + (wep.id === me.weaponId ? ' active' : '');
    row.innerHTML = `<span>${wep.name}</span><span class="lo-num">${wep.slot}</span>`;
    lo.appendChild(row);
  }

  // Top Alive Player Avatar Slots
  const ctBox = $('av-ct'), tBox = $('av-t');
  const allies = isMP
    ? Array.from(remotes.values()).filter(r => r.team === me.team)
    : bots.filter(b => b.team === me.team);
  const ctSlots = [{ hp: me.hp }, ...allies].slice(0, 5);
  ctBox.innerHTML = ctSlots.map(a => {
    const alive = a.hp === undefined || a.hp > 0;
    const hpPct = a.hp === undefined ? 100 : Math.max(0, a.hp);
    return `<div class="av-slot${alive ? '' : ' dead'}">${alive ? 'CT' : '✕'}<div class="av-hp"><i style="width:${hpPct}%"></i></div></div>`;
  }).join('');
  const foes = isMP
    ? Array.from(remotes.values()).filter(r => r.team !== me.team)
    : bots.filter(b => b.team !== me.team);
  tBox.innerHTML = foes.slice(0, 5).map(e => {
    const alive = e.hp === undefined || e.hp > 0;
    const hpPct = e.hp === undefined ? 100 : Math.max(0, e.hp);
    return `<div class="av-slot${alive ? '' : ' dead'}">${alive ? 'T' : '✕'}<div class="av-hp"><i style="width:${hpPct}%"></i></div></div>`;
  }).join('');
}

function addKillfeed(killer, victim, wep, hs, kTeam = 'alpha', vTeam = 'omega', isMine = false) {
  const kf = $('killfeed');
  const div = document.createElement('div');
  div.className = 'kf-row' + (isMine ? ' mine' : '');
  const kCls = kTeam === 'alpha' ? 'kf-ct' : 'kf-t';
  const vCls = vTeam === 'alpha' ? 'kf-ct' : 'kf-t';
  div.innerHTML = `<span class="${kCls}">${killer}</span><span class="kf-wep">${wep}</span>${hs ? '<span class="kf-hs">⊕</span>' : ''}<span class="${vCls}">${victim}</span>`;
  kf.appendChild(div);
  setTimeout(() => div.remove(), 5500);
}

function addChat(sender, text) {
  const log = $('chat-log');
  const div = document.createElement('div');
  div.className = 'c-line';
  div.innerHTML = `<b>${sender}:</b> ${String(text).replace(/</g, '&lt;')}`;
  log.appendChild(div);
  while (log.children.length > 6) log.removeChild(log.firstChild);
}

// ---------- CS:GO Radial Buy Wheel ----------
const BUY_ITEMS = [
  { kind: 'wep', ...WEAPONS.vandal },
  { kind: 'wep', ...WEAPONS.phantom },
  { kind: 'wep', ...WEAPONS.operator },
  { kind: 'wep', ...WEAPONS.sheriff },
  { kind: 'armor', id: 'armor', name: 'Kevlar + Helmet', cost: 1000, desc: 'Full 100 ballistic armor & helmet protection.', stats: { dmg: 0, rpm: 0, pen: 100, acc: 100 } },
  { kind: 'util', id: 'util', name: 'Utility Pack', cost: 500, desc: 'Instantly resets Flashbang, Smoke & Dash cooldowns.', stats: { dmg: 20, rpm: 100, pen: 50, acc: 100 } }
];

function inspectBuyItem(it) {
  $('insp-name').textContent = it.name;
  $('insp-desc').textContent = it.desc;
  $('insp-price').textContent = '$' + it.cost;
  const st = it.stats || { dmg: 80, rpm: 70, pen: 80, acc: 80 };
  const rows = [['DAMAGE', st.dmg], ['FIRE RATE', st.rpm], ['ARMOR PEN', st.pen], ['ACCURACY', st.acc]];
  $('insp-bars').innerHTML = rows.map(([lbl, val]) =>
    `<div class="insp-stat"><label><span>${lbl}</span><span>${val}</span></label><div class="insp-track"><div class="insp-fill" style="width:${val}%"></div></div></div>`
  ).join('');
}

function renderBuyMenu() {
  $('buy-cash').textContent = '$' + me.cash;
  $('wheel-cash').textContent = '$' + me.cash;
  const wheel = $('buy-wheel');
  wheel.querySelectorAll('.wheel-node').forEach(n => n.remove());

  const radius = 132;
  BUY_ITEMS.forEach((it, idx) => {
    const ang = -Math.PI / 2 + (idx / BUY_ITEMS.length) * Math.PI * 2;
    const tx = Math.round(Math.cos(ang) * radius) + 'px';
    const ty = Math.round(Math.sin(ang) * radius) + 'px';
    const owned = it.kind === 'wep' && me.owned.has(it.id);
    const btn = document.createElement('button');
    btn.className = 'wheel-node' + (owned ? ' owned' : '');
    btn.style.setProperty('--tx', tx);
    btn.style.setProperty('--ty', ty);
    btn.disabled = owned ? false : (me.cash < it.cost || (it.kind === 'armor' && me.shield >= 100));
    btn.innerHTML = `<small>${idx + 1}</small><strong>${it.name}</strong><span>${owned ? 'EQUIP' : '$' + it.cost}</span>`;
    btn.onmouseenter = () => inspectBuyItem(it);
    btn.onclick = () => {
      if (it.kind === 'armor') {
        if (me.cash >= it.cost && me.shield < 100) { me.cash -= it.cost; me.shield = 100; sfxTone(520, 0.1, 'triangle', 0.1, 780); }
      } else if (it.kind === 'util') {
        if (me.cash >= it.cost) { me.cash -= it.cost; abCd.q = abCd.e = abCd.c = 0; sfxTone(620, 0.1, 'triangle', 0.1, 880); }
      } else {
        if (!owned) { me.cash -= it.cost; me.owned.add(it.id); sfxTone(440, 0.1, 'triangle', 0.1, 680); }
        equipWeapon(it.id);
      }
      renderBuyMenu();
      syncHud();
    };
    wheel.appendChild(btn);
  });
  inspectBuyItem(BUY_ITEMS[0]);
}

function renderScoreboard() {
  $('sb-ct-score').textContent = scoreAlpha;
  $('sb-t-score').textContent = scoreOmega;
  const all = [
    { name: me.name + ' (YOU)', team: me.team, kills: me.kills, deaths: me.deaths, cash: me.cash, ping: isMP ? 28 : 0 },
    ...(isMP ? Array.from(remotes.values()) : bots).map(e => ({ name: e.name, team: e.team, kills: e.kills || 0, deaths: e.deaths || 0, cash: e.cash || 800, ping: isMP ? 36 : 0 }))
  ];
  const rowHtml = (r) => {
    const kd = r.deaths > 0 ? (r.kills / r.deaths).toFixed(2) : r.kills.toFixed(2);
    return `<tr><td><b>${r.name}</b></td><td>${r.kills}</td><td>${r.deaths}</td><td>${kd}</td><td style="color:#6ee755">$${r.cash}</td><td>${r.ping}ms</td></tr>`;
  };
  $('sb-ct-body').innerHTML = all.filter(r => r.team === 'alpha').map(rowHtml).join('');
  $('sb-t-body').innerHTML = all.filter(r => r.team !== 'alpha').map(rowHtml).join('');
}

// ---------- Match Start & Controls ----------
function enterMatch(mpMode) {
  if (typeof stopTrailerMode === 'function' && tr.active) stopTrailerMode(true);
  isMP = mpMode;
  me.name = $('agent-name').value.trim() || 'DillyAgent';
  me.kills = 0; me.deaths = 0; me.cash = 1200; roundTime = 115;
  if (!mpMode) { scoreAlpha = 0; scoreOmega = 0; me.team = 'alpha'; spawnBots(); }
  respawnMe();
  equipWeapon('vandal');
  inMatch = true; paused = false; buyOpen = false; chatOpen = false;
  $('modal-lobby').classList.remove('open');
  $('hud').classList.add('active');
  $('sc-mode').textContent = mpMode ? 'RUST · DE_DUSTLINE' : 'DE_DUSTLINE';
  syncHud();
  canvas.requestPointerLock?.();
}

$('btn-play-solo').onclick = () => enterMatch(false);
$('btn-play-mp').onclick = async () => {
  try {
    await connectMultiplayer($('agent-name').value.trim() || 'DillyAgent');
    enterMatch(true);
  } catch (err) {
    $('mp-msg').textContent = '⚠️ ' + err.message + ' — You can play Solo vs Bots right now!';
  }
};
$('btn-buy-close').onclick = () => { buyOpen = false; $('modal-buy').classList.remove('open'); canvas.requestPointerLock?.(); };
$('btn-resume').onclick = () => { paused = false; $('modal-pause').classList.remove('open'); canvas.requestPointerLock?.(); };
$('btn-open-buy').onclick = () => { paused = false; $('modal-pause').classList.remove('open'); buyOpen = true; renderBuyMenu(); $('modal-buy').classList.add('open'); };
$('btn-leave').onclick = () => {
  inMatch = false; paused = false; settingsOpen = false;
  if (ws) { try { ws.close(); } catch (_) {} ws = null; }
  $('hud').classList.remove('active');
  $('modal-pause').classList.remove('open');
  $('modal-settings').classList.remove('open');
  $('modal-lobby').classList.add('open');
};

// ---------- Keybind Settings Modal Controller ----------
let settingsOpen = false;
let listeningAction = null;

function syncBindLabels() {
  const qEl = document.querySelector('#ab-q b');
  const eEl = document.querySelector('#ab-e b');
  const cEl = document.querySelector('#ab-c b');
  if (qEl) qEl.textContent = fmtKey(BINDS.flash);
  if (eEl) eEl.textContent = fmtKey(BINDS.smoke);
  if (cEl) cEl.textContent = fmtKey(BINDS.dash);
  const wh = $('wep-hints');
  if (wh) wh.innerHTML = `<b>${fmtKey(BINDS.inspect)}</b> Inspect · <b>${fmtKey(BINDS.buy)}</b> Buy · <b>${fmtKey(BINDS.reload)}</b> Reload`;
  const lb = $('lobby-binds');
  if (lb) {
    lb.innerHTML = `
      <span><b>${fmtKey(BINDS.fwd)}${fmtKey(BINDS.left)}${fmtKey(BINDS.back)}${fmtKey(BINDS.right)}</b> Move</span>
      <span><b>${fmtKey(BINDS.crouch)}</b> Crouch (Tighter Spread)</span>
      <span><b>LMB</b> Fire · <b>RMB</b> Apex-50 Scope</span>
      <span><b>${fmtKey(BINDS.slot1)}–${fmtKey(BINDS.slot5)}</b> Weapons</span>
      <span><b>${fmtKey(BINDS.buy)}</b> Buy Wheel · <b>${fmtKey(BINDS.reload)}</b> Reload</span>
      <span><b>${fmtKey(BINDS.inspect)}</b> Inspect Weapon</span>
      <span><b>${fmtKey(BINDS.flash)} / ${fmtKey(BINDS.smoke)} / ${fmtKey(BINDS.dash)}</b> Flash / Smoke / Dash</span>
      <span><b>${fmtKey(BINDS.scoreboard)}</b> Scoreboard · <b>${fmtKey(BINDS.chat)}</b> Chat</span>
    `;
  }
}

function renderKeybindsUI() {
  const grid = $('kb-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const [act, label] of BIND_META) {
    const row = document.createElement('div');
    row.className = 'kb-row';
    const isListen = listeningAction === act;
    row.innerHTML = `<span>${label}</span><button class="kb-btn${isListen ? ' listening' : ''}">${isListen ? 'PRESS KEY...' : fmtKey(BINDS[act])}</button>`;
    row.querySelector('button').onclick = () => {
      listeningAction = act;
      renderKeybindsUI();
    };
    grid.appendChild(row);
  }
}

function openSettings() {
  settingsOpen = true;
  listeningAction = null;
  if (document.pointerLockElement) document.exitPointerLock();
  $('modal-pause').classList.remove('open');
  renderKeybindsUI();
  $('modal-settings').classList.add('open');
}

function closeSettings() {
  settingsOpen = false;
  listeningAction = null;
  $('modal-settings').classList.remove('open');
  syncBindLabels();
  if (inMatch && paused) $('modal-pause').classList.add('open');
}

$('btn-settings-lobby').onclick = openSettings;
$('btn-settings-pause').onclick = openSettings;
$('btn-settings-close').onclick = closeSettings;
$('btn-binds-done').onclick = closeSettings;
$('btn-binds-reset').onclick = () => {
  Object.assign(BINDS, DEFAULT_BINDS);
  listeningAction = null;
  saveBinds();
  syncBindLabels();
  renderKeybindsUI();
};
syncBindLabels();

window.addEventListener('mousemove', (e) => {
  if (!inMatch || paused || buyOpen || chatOpen || settingsOpen || document.pointerLockElement !== canvas) return;
  const sens = me.scoped ? 0.0010 : 0.0022;
  me.yaw -= e.movementX * sens;
  me.pitch = Math.max(-1.45, Math.min(1.45, me.pitch - e.movementY * sens));
});
canvas.addEventListener('mousedown', (e) => {
  if (!inMatch || paused || buyOpen || chatOpen || settingsOpen) return;
  if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
  if (e.button === 0) { mouseDown = true; fireWeapon(); }
  else if (e.button === 2) { setScoped(!me.scoped); }
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; });
window.addEventListener('contextmenu', (e) => { if (inMatch) e.preventDefault(); });

window.addEventListener('keydown', (e) => {
  if (settingsOpen) {
    e.preventDefault();
    if (listeningAction) {
      if (e.code !== 'Escape') {
        BINDS[listeningAction] = e.code;
        saveBinds();
        syncBindLabels();
      }
      listeningAction = null;
      renderKeybindsUI();
    } else if (e.code === 'Escape') {
      closeSettings();
    }
    return;
  }
  if (!inMatch) return;
  if (chatOpen) {
    if (e.code === 'Enter') {
      const txt = $('chat-inp').value.trim();
      if (txt) {
        if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'chat', text: txt }));
        else addChat(me.name, txt);
      }
      $('chat-inp').value = ''; $('chat-inp').classList.remove('open'); chatOpen = false;
      canvas.requestPointerLock?.();
    } else if (e.code === 'Escape') { $('chat-inp').classList.remove('open'); chatOpen = false; }
    return;
  }
  if (e.code === BINDS.scoreboard) { e.preventDefault(); sbOpen = true; renderScoreboard(); $('modal-sb').classList.add('open'); return; }
  if (e.code === BINDS.buy && !paused) {
    buyOpen = !buyOpen;
    if (buyOpen) { if (document.pointerLockElement) document.exitPointerLock(); renderBuyMenu(); $('modal-buy').classList.add('open'); }
    else { $('modal-buy').classList.remove('open'); canvas.requestPointerLock?.(); }
    return;
  }
  if (e.code === BINDS.chat && !paused && !buyOpen) {
    e.preventDefault(); chatOpen = true; me.keys = {};
    if (document.pointerLockElement) document.exitPointerLock();
    $('chat-inp').classList.add('open'); $('chat-inp').focus(); return;
  }
  if (e.code === 'Escape') {
    if (buyOpen) { buyOpen = false; $('modal-buy').classList.remove('open'); return; }
    paused = !paused; me.keys = {};
    $('modal-pause').classList.toggle('open', paused);
    if (!paused) canvas.requestPointerLock?.();
    return;
  }
  if (paused || buyOpen) return;

  me.keys[e.code] = true;
  if (e.code === BINDS.reload) startReload();
  else if (e.code === BINDS.inspect) me.inspectTimer = 1.8;
  else if (e.code === BINDS.flash) useFlash();
  else if (e.code === BINDS.smoke) useSmoke();
  else if (e.code === BINDS.dash) useDash();
  else if (e.code === BINDS.slot1) equipWeapon('vandal');
  else if (e.code === BINDS.slot2) equipWeapon('phantom');
  else if (e.code === BINDS.slot3) equipWeapon('operator');
  else if (e.code === BINDS.slot4) equipWeapon('sheriff');
  else if (e.code === BINDS.slot5) equipWeapon('knife');
});
window.addEventListener('keyup', (e) => {
  me.keys[e.code] = false;
  if (e.code === BINDS.scoreboard) { sbOpen = false; $('modal-sb').classList.remove('open'); }
});

// ---------- Live In-Engine Trailer Director ----------
const tr = {
  active: false,
  scene: null,
  t: 0,
  timeScale: 1,
  fired: new Set(),
  sparks: [],
  crossfireCd: 0,
  hook: null // external director (trailer.js): { update(dt), render(dt) }
};

function lerpAng(a, b, k) {
  let d = (b - a + Math.PI) % (Math.PI * 2);
  if (d < 0) d += Math.PI * 2;
  d -= Math.PI;
  return a + d * k;
}

function spawnImpactSparks(pt, color = 0xffd166, count = 8) {
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.055, 0.055),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
    );
    m.position.copy(pt);
    scene.add(m);
    tr.sparks.push({
      mesh: m,
      vel: new THREE.Vector3((Math.random() - 0.5) * 6, 1.2 + Math.random() * 4.2, (Math.random() - 0.5) * 6),
      life: 0.28 + Math.random() * 0.14
    });
  }
}

function clearTrailerSceneObjects() {
  for (const b of bots) scene.remove(b.model.group);
  bots = [];
  for (const s of tr.sparks) { scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); }
  tr.sparks = [];
  for (const t of tracers) { scene.remove(t.line); t.line.geometry.dispose(); }
  tracers.length = 0;
  for (const sm of smokes) scene.remove(sm.mesh);
  smokes.length = 0;
  buyOpen = false; $('modal-buy').classList.remove('open');
  sbOpen = false; $('modal-sb').classList.remove('open');
  setScoped(false);
  $('flash-fx').style.opacity = '0';
  $('hurt-fx').style.opacity = '0';
  $('hitmarker').style.opacity = '0';
  $('hs-banner').style.opacity = '0';
  $('hs-banner').textContent = 'HEADSHOT';
  camera.rotation.z = 0;
  me.crouching = false;
  me.recoilKick = 0;
  me.reloadTimer = 0;
  me.inspectTimer = 0;
  mfMat.opacity = 0;
  abCd.q = 0; abCd.e = 0; abCd.c = 0;
  for (const k of ['q', 'e', 'c']) {
    $(`cd-${k}`).textContent = 'READY';
    $(`ab-${k}`).classList.add('ready');
  }
}

function spawnTrActor(cfg) {
  const model = createAgentModel(cfg.name, cfg.team);
  model.group.position.set(cfg.x, 0, cfg.z);
  if (cfg.hp === 0) model.group.visible = false;
  scene.add(model.group);
  const actor = {
    id: 'tr_' + bots.length,
    name: cfg.name,
    team: cfg.team,
    model,
    pos: new THREE.Vector3(cfg.x, 0, cfg.z),
    goal: new THREE.Vector3(cfg.tx ?? cfg.x, 0, cfg.tz ?? cfg.z),
    speed: cfg.speed ?? 4.1,
    hp: cfg.hp ?? 100,
    kills: cfg.kills ?? 0,
    deaths: cfg.deaths ?? 0,
    cash: cfg.cash ?? 2600,
    stride: Math.random() * 6,
    fall: 0,
    lookAt: cfg.lookAt || null
  };
  bots.push(actor);
  return actor;
}

function trOnce(key, time, fn) {
  if (tr.t >= time && !tr.fired.has(key)) {
    tr.fired.add(key);
    fn();
  }
}

function trShoot({ actor, dmg = 38, head = false, wallPt = null }) {
  const w = WEAPONS[me.weaponId];
  if (!w.melee && me.ammo[w.id][0] > 0) me.ammo[w.id][0]--;
  me.inspectTimer = 0;
  me.recoilKick = Math.min(0.16, me.recoilKick + (w.recoil || 0.02) * 1.35);
  me.pitch = Math.min(1.2, me.pitch + (w.recoil || 0.015) * 0.55);
  mfMat.opacity = w.melee || w.id === 'phantom' ? 0 : 0.95;
  muzzleFlash.rotation.z = Math.random() * Math.PI;
  VM.shot();
  playShot(w.id);

  const startPt = camera.position.clone().add(new THREE.Vector3(0.20, -0.14, -0.55).applyEuler(camera.rotation));
  let endPt = wallPt ? wallPt.clone() : camera.position.clone().add(new THREE.Vector3(0, 0, -18).applyEuler(camera.rotation));

  if (actor && actor.hp > 0) {
    endPt = new THREE.Vector3(actor.pos.x, head ? 1.74 : 1.18, actor.pos.z);
    spawnImpactSparks(endPt, head ? 0xff4757 : 0xffd166, head ? 12 : 6);
    showHitmarker(head);
    if (head) playHeadshot();
    actor.hp = Math.max(0, actor.hp - dmg);
    if (actor.hp <= 0) {
      actor.deaths++;
      me.kills++;
      me.cash = Math.min(16000, me.cash + (w.melee ? 1500 : 300));
      scoreAlpha++;
      addKillfeed(me.name, actor.name, w.name, head, 'alpha', 'omega', true);
    }
  } else if (wallPt) {
    raycaster.set(camera.position, wallPt.clone().sub(camera.position).normalize());
    raycaster.far = 90;
    const wh = raycaster.intersectObjects(mapMeshes, false);
    if (wh.length > 0) { endPt.copy(wh[0].point); spawnBulletDecal(wh[0]); }
  }

  if (!w.melee) {
    spawnTracer(startPt, endPt, w.id === 'operator' ? 0xf87171 : 0xffe88a);
  }
  syncHud();
}

function applyTrailerChipDamage(dmg) {
  const absorb = Math.min(me.shield, Math.floor(dmg * 0.5));
  me.shield -= absorb;
  me.hp = Math.max(18, me.hp - (dmg - absorb));
  $('hurt-fx').style.opacity = '0.85';
  setTimeout(() => { $('hurt-fx').style.opacity = '0'; }, 150);
  syncHud();
}

function startTrailerMode() {
  if (inMatch) return;
  tr.active = true;
  $('modal-lobby').classList.remove('open');
  $('modal-settings').classList.remove('open');
  $('killfeed').innerHTML = '';
}

function stopTrailerMode(skipLobby = false) {
  tr.active = false;
  tr.hook = null;
  tr.scene = null;
  tr.timeScale = 1;
  clearTrailerSceneObjects();
  $('hud').classList.remove('active');
  $('killfeed').innerHTML = '';
  vmRoot.visible = false;
  camera.fov = 76;
  camera.updateProjectionMatrix();
  // Restore clean default player state
  me.hp = 100; me.shield = 100; me.cash = 1200; me.kills = 0; me.deaths = 0;
  me.owned = new Set(['vandal', 'sheriff', 'knife']);
  me.ammo = { vandal: [30, 90], phantom: [25, 100], operator: [5, 30], sheriff: [7, 35], knife: [0, 0] };
  scoreAlpha = 0; scoreOmega = 0; roundTime = 115;
  if (!inMatch && !skipLobby) $('modal-lobby').classList.add('open');
}

function playTrailerScene(sceneName) {
  if (!tr.active) startTrailerMode();
  clearTrailerSceneObjects();
  tr.scene = sceneName;
  tr.t = 0;
  tr.timeScale = 1;
  tr.fired.clear();
  tr.crossfireCd = 0.12;
  $('killfeed').innerHTML = '';

  if (sceneName === 'drone_breach') {
    $('hud').classList.remove('active');
    vmRoot.visible = false;
    camera.fov = 70; camera.updateProjectionMatrix();
    spawnTrActor({ name: 'CT-Falcon', team: 'alpha', x: -24, z: 8.5, tx: -6.5, tz: 3.2, speed: 4.6 });
    spawnTrActor({ name: 'CT-Frost', team: 'alpha', x: -26, z: 5.2, tx: -8.2, tz: 1.4, speed: 4.4 });
    spawnTrActor({ name: 'CT-Warden', team: 'alpha', x: -22, z: 11.8, tx: -6.2, tz: 7.8, speed: 4.3 });
    spawnTrActor({ name: 'CT-Striker', team: 'alpha', x: -19, z: -13.5, tx: -5.5, tz: -14.8, speed: 4.5 });
    spawnTrActor({ name: 'OMEGA-Phoenix', team: 'omega', x: 15.5, z: -2.8, tx: 5.4, tz: -2.4, speed: 3.8 });
    spawnTrActor({ name: 'OMEGA-Viper', team: 'omega', x: 17.5, z: 3.8, tx: 6.4, tz: 3.0, speed: 3.9 });
    spawnTrActor({ name: 'OMEGA-Reaper', team: 'omega', x: 14.0, z: -14.0, tx: 2.8, tz: -15.2, speed: 3.7 });
    spawnTrActor({ name: 'OMEGA-Kodiak', team: 'omega', x: 18.5, z: -8.5, tx: 8.2, tz: -7.8, speed: 3.6 });
    spawnTrActor({ name: 'OMEGA-Ghost', team: 'omega', x: 11.5, z: -20.5, tx: -1.0, tz: -20.5, speed: 3.8 });
  } else if (sceneName === 'ak_entry') {
    scoreAlpha = 6; scoreOmega = 6; roundTime = 104;
    me.name = 'DillyAgent'; me.team = 'alpha';
    me.hp = 100; me.shield = 65; me.cash = 4950; me.kills = 8; me.deaths = 4;
    me.owned = new Set(['vandal', 'sheriff', 'knife']);
    me.ammo.vandal = [30, 90];
    me.pos.set(-24.5, 0, -21.2); me.vel.set(0, 0, 0);
    me.yaw = -Math.PI / 2; me.pitch = -0.02;
    spawnTrActor({ name: 'CT-Falcon', team: 'alpha', x: -16, z: 3.5, tx: -5.5, tz: 2.5, speed: 3.8, kills: 6, deaths: 5 });
    spawnTrActor({ name: 'CT-Frost', team: 'alpha', x: -19, z: 12, tx: -7, tz: 14, speed: 3.6, kills: 5, deaths: 5 });
    spawnTrActor({ name: 'CT-Warden', team: 'alpha', x: -22, z: -12, tx: -12, tz: -14, speed: 3.9, kills: 4, deaths: 6 });
    spawnTrActor({ name: 'CT-Striker', team: 'alpha', x: -14, z: -4, tx: -6, tz: -4, speed: 3.7, kills: 4, deaths: 6 });
    spawnTrActor({ name: 'BOT-Phoenix', team: 'omega', x: 3.2, z: -21.2, tx: -0.6, tz: -20.8, speed: 2.2, kills: 7, deaths: 5 });
    spawnTrActor({ name: 'BOT-Viper', team: 'omega', x: 3.6, z: -14.2, tx: -1.8, tz: -13.8, speed: 2.5, kills: 6, deaths: 6 });
    spawnTrActor({ name: 'BOT-Reaper', team: 'omega', x: 7.2, z: 3.5, tx: 4.5, tz: 2.5, speed: 3.0, kills: 5, deaths: 6 });
    spawnTrActor({ name: 'BOT-Kodiak', team: 'omega', x: 6.0, z: 19.5, tx: 1.5, tz: 20.0, speed: 2.8, kills: 4, deaths: 6 });
    spawnTrActor({ name: 'BOT-Ghost', team: 'omega', x: 15.0, z: -8.0, tx: 8.5, tz: -6.5, speed: 3.1, kills: 4, deaths: 6 });
    equipWeapon('vandal');
    $('sc-mode').textContent = 'DE_DUSTLINE';
    $('hud').classList.add('active');
    vmRoot.visible = true;
    syncHud(); drawRadar();
  } else if (sceneName === 'utility_breach') {
    scoreAlpha = 9; scoreOmega = 8; roundTime = 78;
    me.name = 'DillyAgent'; me.team = 'alpha';
    me.hp = 100; me.shield = 100; me.cash = 3600; me.kills = 12; me.deaths = 5;
    me.owned = new Set(['vandal', 'phantom', 'sheriff', 'knife']);
    me.ammo.phantom = [25, 100]; me.ammo.sheriff = [7, 35];
    me.pos.set(-12.2, 0, 2.8); me.vel.set(0, 0, 0);
    me.yaw = -1.45; me.pitch = -0.02;
    spawnTrActor({ name: 'CT-Falcon', team: 'alpha', x: -10, z: 8, tx: -6.5, tz: 16, speed: 4.2, kills: 9, deaths: 6 });
    spawnTrActor({ name: 'CT-Frost', team: 'alpha', x: -14, z: -18, tx: -4, tz: -19, speed: 3.8, kills: 7, deaths: 7 });
    spawnTrActor({ name: 'CT-Warden', team: 'alpha', x: -8, z: -5, tx: -5, tz: -3, speed: 3.4, kills: 6, deaths: 7 });
    spawnTrActor({ name: 'CT-Striker', team: 'alpha', x: -20, z: 4, tx: -20, tz: 4, hp: 0, kills: 5, deaths: 8 });
    spawnTrActor({ name: 'BOT-Reaper', team: 'omega', x: -1.6, z: 13.4, tx: -2.5, tz: 12.6, speed: 1.8, kills: 8, deaths: 8 });
    spawnTrActor({ name: 'BOT-Kodiak', team: 'omega', x: 5.2, z: 20.6, tx: 1.8, tz: 20.4, speed: 2.0, kills: 7, deaths: 8 });
    spawnTrActor({ name: 'BOT-Ghost', team: 'omega', x: 5.5, z: 1.8, tx: 4.2, tz: 2.0, speed: 2.2, kills: 7, deaths: 8 });
    spawnTrActor({ name: 'BOT-Phoenix', team: 'omega', x: 12, z: -18, tx: 6, tz: -18, speed: 2.8, kills: 6, deaths: 9 });
    spawnTrActor({ name: 'BOT-Viper', team: 'omega', x: 18, z: 12, tx: 18, tz: 12, hp: 0, kills: 5, deaths: 9 });
    equipWeapon('phantom');
    $('sc-mode').textContent = 'DE_DUSTLINE';
    $('hud').classList.add('active');
    vmRoot.visible = true;
    syncHud(); drawRadar();
  } else if (sceneName === 'awp_karambit_ace') {
    scoreAlpha = 12; scoreOmega = 11; roundTime = 34;
    me.name = 'DillyAgent'; me.team = 'alpha';
    me.hp = 78; me.shield = 90; me.cash = 3950; me.kills = 17; me.deaths = 6;
    me.owned = new Set(['vandal', 'operator', 'sheriff', 'knife']);
    me.ammo.operator = [5, 30];
    me.pos.set(-7.2, 0, -5.5); me.vel.set(0, 0, 0);
    me.yaw = -1.32; me.pitch = 0.0;
    spawnTrActor({ name: 'CT-Falcon', team: 'alpha', x: -16, z: -19, tx: -8, tz: -20, speed: 3.2, kills: 13, deaths: 9, cash: 3100 });
    spawnTrActor({ name: 'CT-Frost', team: 'alpha', x: -14, z: 15, tx: -9, tz: 16, speed: 3.0, kills: 11, deaths: 10, cash: 2800 });
    spawnTrActor({ name: 'CT-Warden', team: 'alpha', x: -22, z: 0, tx: -22, tz: 0, hp: 0, kills: 9, deaths: 11, cash: 1900 });
    spawnTrActor({ name: 'CT-Striker', team: 'alpha', x: -24, z: 4, tx: -24, tz: 4, hp: 0, kills: 8, deaths: 12, cash: 2100 });
    // 3 already eliminated in the Ace round + 2 alive finalists
    spawnTrActor({ name: 'BOT-Phoenix', team: 'omega', x: 18, z: -18, hp: 0, kills: 12, deaths: 13, cash: 2400 });
    spawnTrActor({ name: 'BOT-Viper', team: 'omega', x: 18, z: -14, hp: 0, kills: 11, deaths: 13, cash: 2200 });
    spawnTrActor({ name: 'BOT-Reaper', team: 'omega', x: 18, z: -10, hp: 0, kills: 10, deaths: 14, cash: 1800 });
    spawnTrActor({ name: 'BOT-Ghost', team: 'omega', x: 6.8, z: -2.1, tx: 1.8, tz: -3.2, speed: 3.5, kills: 10, deaths: 12, cash: 3400 });
    spawnTrActor({ name: 'OMEGA-Boss', team: 'omega', x: -5.6, z: 0.4, tx: -6.5, tz: -3.0, speed: 1.65, kills: 14, deaths: 11, cash: 4100 });
    addKillfeed('DillyAgent', 'BOT-Phoenix', 'Dill-47', true, 'alpha', 'omega', true);
    addKillfeed('DillyAgent', 'BOT-Viper', 'Viper-S', true, 'alpha', 'omega', true);
    addKillfeed('DillyAgent', 'BOT-Reaper', 'Kodiak .50', true, 'alpha', 'omega', true);
    equipWeapon('operator');
    $('sc-mode').textContent = 'MATCH POINT · DE_DUSTLINE';
    $('hud').classList.add('active');
    vmRoot.visible = true;
    syncHud(); drawRadar();
  } else if (sceneName === 'finale_orbit' || sceneName === 'end_bg') {
    $('hud').classList.remove('active');
    vmRoot.visible = false;
    camera.fov = 68; camera.updateProjectionMatrix();
    spawnTrActor({ name: 'CT-Falcon', team: 'alpha', x: -13, z: -21, tx: -4.5, tz: -20.5, speed: 3.6 });
    spawnTrActor({ name: 'CT-Frost', team: 'alpha', x: -11, z: -15, tx: -3.2, tz: -15.5, speed: 3.8 });
    spawnTrActor({ name: 'DillyAgent', team: 'alpha', x: -9.5, z: -18.5, tx: -1.8, tz: -18.8, speed: 4.0 });
    spawnTrActor({ name: 'CT-Warden', team: 'alpha', x: -15, z: -23, tx: -7.0, tz: -22.5, speed: 3.5 });
    spawnTrActor({ name: 'OMEGA-Boss', team: 'omega', x: 9.5, z: -21.5, tx: 2.2, tz: -21.2, speed: 3.4 });
    spawnTrActor({ name: 'OMEGA-Viper', team: 'omega', x: 8.5, z: -14.2, tx: 2.5, tz: -14.5, speed: 3.6 });
    spawnTrActor({ name: 'OMEGA-Reaper', team: 'omega', x: 11.5, z: -18.5, tx: 5.5, tz: -19.8, speed: 3.3 });
    spawnTrActor({ name: 'OMEGA-Ghost', team: 'omega', x: 6.5, z: -24.0, tx: 0.8, tz: -23.2, speed: 3.5 });
    spawnSmoke(2.4, 1.9, -15.2);
  }
}

function updateTrailerActors(dt) {
  for (const a of bots) {
    if (!a.model.group.visible) continue;
    if (a.hp <= 0 && a.model.animate) { a.model.animate(dt, { dead: true }); continue; }
    if (a.hp <= 0) {
      if (a.fall < 1) {
        a.fall = Math.min(1, a.fall + dt * 4.2);
        a.model.group.rotation.x = -a.fall * (Math.PI * 0.48);
        a.model.group.position.y = -a.fall * 0.08;
      }
      continue;
    }
    const dx = a.goal.x - a.pos.x, dz = a.goal.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.15) {
      const step = Math.min(d, a.speed * dt);
      a.pos.x += (dx / d) * step;
      a.pos.z += (dz / d) * step;
      a.stride += dt * (a.speed * 2.3);
      a.model.legL.rotation.x = Math.sin(a.stride) * 0.48;
      a.model.legR.rotation.x = -Math.sin(a.stride) * 0.48;
    } else {
      a.model.legL.rotation.x *= 0.85;
      a.model.legR.rotation.x *= 0.85;
    }
    a.model.group.position.set(a.pos.x, 0, a.pos.z);
    if (a.lookAt) {
      a.model.group.rotation.y = Math.atan2(a.lookAt.x - a.pos.x, a.lookAt.z - a.pos.z);
    } else if (tr.scene === 'drone_breach' || tr.scene === 'finale_orbit' || tr.scene === 'end_bg') {
      const faceX = a.team === 'alpha' ? 12 : -12;
      a.model.group.rotation.y = Math.atan2(faceX - a.pos.x, -10 - a.pos.z);
    } else {
      a.model.group.rotation.y = Math.atan2(me.pos.x - a.pos.x, me.pos.z - a.pos.z);
    }
    if (a.model.animate) a.model.animate(dt, { aim: true });
  }

  for (let i = tr.sparks.length - 1; i >= 0; i--) {
    const s = tr.sparks[i];
    s.life -= dt;
    s.vel.y -= 14 * dt;
    s.mesh.position.addScaledVector(s.vel, dt);
    s.mesh.material.opacity = Math.max(0, s.life * 3.2);
    if (s.life <= 0) {
      scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose();
      tr.sparks.splice(i, 1);
    }
  }
}

function drivePovFrame(dt, moveGoal, lookPt, moveSpd = 5.8, aimRate = 12) {
  const dx = moveGoal.x - me.pos.x, dz = moveGoal.z - me.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 0.08) {
    const step = Math.min(dist, moveSpd * dt);
    me.vel.set((dx / dist) * moveSpd, 0, (dz / dist) * moveSpd);
    me.pos.x += (dx / dist) * step;
    me.pos.z += (dz / dist) * step;
  } else {
    me.vel.multiplyScalar(Math.max(0, 1 - dt * 12));
  }

  const eyeY = me.crouching ? 1.18 : 1.62;
  camera.position.set(me.pos.x, eyeY, me.pos.z);

  const ldx = lookPt.x - camera.position.x;
  const ldy = lookPt.y - camera.position.y;
  const ldz = lookPt.z - camera.position.z;
  const targetYaw = Math.atan2(-ldx, -ldz);
  const targetPitch = Math.atan2(ldy, Math.hypot(ldx, ldz));
  const k = Math.min(1, dt * aimRate);
  me.yaw = lerpAng(me.yaw, targetYaw, k);
  me.pitch = THREE.MathUtils.lerp(me.pitch, targetPitch, k);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(me.pitch, me.yaw, 0);

  const speed2D = Math.hypot(me.vel.x, me.vel.z);
  const gap = Math.round(4 + (speed2D > 0.6 ? 5 : 0) + me.recoilKick * 88 - (me.crouching ? 2 : 0));
  $('xhair').style.setProperty('--gap', Math.max(2, gap) + 'px');

  if (me.reloadTimer > 0) {
    me.reloadTimer -= dt;
    if (me.reloadTimer <= 0) {
      const w = WEAPONS[me.weaponId];
      me.ammo[w.id][0] = w.mag;
      syncHud();
    }
  }
  if (me.inspectTimer > 0) me.inspectTimer = Math.max(0, me.inspectTimer - dt);
  if (speed2D > 0.4) me.walkPhase += dt * (speed2D * 1.65);
  const bobX = Math.cos(me.walkPhase) * 0.009 * Math.min(1, speed2D / 5);
  const bobY = Math.abs(Math.sin(me.walkPhase)) * 0.011 * Math.min(1, speed2D / 5);

  me.recoilKick = Math.max(0, me.recoilKick - dt * 0.95);
  mfMat.opacity = Math.max(0, mfMat.opacity - dt * 22);

  const inspT = me.inspectTimer > 0 ? Math.sin((me.inspectTimer / 1.6) * Math.PI) : 0;
  vmRoot.visible = !me.scoped;
  if (!VM.update(dt)) {
    vmRoot.position.set(
      0.24 + bobX - inspT * 0.08,
      -0.22 - bobY - (me.reloadTimer > 0 ? 0.14 : 0) + inspT * 0.04,
      -0.44 + me.recoilKick
    );
    vmRoot.rotation.set(me.recoilKick * 1.5 + inspT * 0.24, inspT * 0.88, inspT * 0.34);
  }

  drawRadar();
  roundTime = Math.max(1, roundTime - dt);
  const mins = Math.floor(roundTime / 60);
  const secs = String(Math.floor(roundTime % 60)).padStart(2, '0');
  $('round-timer').textContent = `${mins}:${secs}`;

  for (const c of ['q', 'e', 'c']) {
    if (abCd[c] > 0) abCd[c] = Math.max(0, abCd[c] - dt);
    const v = Math.ceil(abCd[c]);
    $(`cd-${c}`).textContent = v > 0 ? `${v}s` : 'READY';
    $(`ab-${c}`).classList.toggle('ready', v === 0);
  }
}

function updateSquadCrossfire(dt) {
  tr.crossfireCd -= dt;
  if (tr.crossfireCd > 0) return;
  tr.crossfireCd = 0.16 + Math.random() * 0.16;
  const cts = bots.filter(b => b.team === 'alpha' && b.hp > 0);
  const ts = bots.filter(b => b.team === 'omega' && b.hp > 0);
  if (!cts.length || !ts.length) return;
  const ct = cts[Math.floor(Math.random() * cts.length)];
  const te = ts[Math.floor(Math.random() * ts.length)];
  const ctShoot = Math.random() < 0.55;
  const src = ctShoot ? ct : te;
  const dst = ctShoot ? te : ct;
  const p0 = new THREE.Vector3(src.pos.x, 1.48, src.pos.z);
  const p1 = new THREE.Vector3(dst.pos.x + (Math.random() - 0.5) * 1.4, 1.1 + Math.random() * 0.7, dst.pos.z + (Math.random() - 0.5) * 1.4);
  spawnTracer(p0, p1, ctShoot ? 0x93c5fd : 0xfde047);
  sfxNoise(0.07, ctShoot ? 1150 : 840, 0.045);
}

function updateTrailerDirector(rawDt) {
  const dt = rawDt * tr.timeScale;
  tr.t += dt;
  updateTrailerActors(dt);

  if (tr.scene === 'drone_breach') {
    const u = Math.min(1, tr.t / 4.2);
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    const cx = THREE.MathUtils.lerp(-25, 4.5, e);
    const cy = THREE.MathUtils.lerp(9.2, 4.6, Math.sin(u * Math.PI * 0.75));
    const cz = THREE.MathUtils.lerp(12.2, -9.2, e);
    camera.position.set(cx, cy, cz);
    camera.lookAt(
      THREE.MathUtils.lerp(-5, 3.8, e),
      THREE.MathUtils.lerp(1.6, 1.5, e),
      THREE.MathUtils.lerp(2.0, -7.5, e)
    );
    camera.rotation.z = Math.sin(u * Math.PI) * -0.07;
    updateSquadCrossfire(dt);
    trOnce('sm1', 1.05, () => spawnSmoke(-2.4, 1.9, 2.2));
    trOnce('k1', 2.55, () => {
      const ph = bots.find(b => b.name === 'OMEGA-Phoenix');
      if (ph) { ph.hp = 0; spawnImpactSparks(new THREE.Vector3(ph.pos.x, 1.6, ph.pos.z), 0xff4757, 12); }
    });
    trOnce('sm2', 3.25, () => spawnSmoke(3.5, 1.9, -11.0));
  } else if (tr.scene === 'ak_entry') {
    const ph = bots.find(b => b.name === 'BOT-Phoenix');
    const vp = bots.find(b => b.name === 'BOT-Viper');

    trOnce('buy_open', 0.05, () => {
      renderBuyMenu();
      $('modal-buy').classList.add('open');
      inspectBuyItem(BUY_ITEMS[0]);
      const nodes = document.querySelectorAll('#buy-wheel .wheel-node');
      if (nodes[0]) nodes[0].style.borderColor = '#e3a73b';
    });
    trOnce('buy_hover_armor', 0.48, () => {
      inspectBuyItem(BUY_ITEMS[4]);
      const nodes = document.querySelectorAll('#buy-wheel .wheel-node');
      if (nodes[0]) nodes[0].style.borderColor = '';
      if (nodes[4]) { nodes[4].style.borderColor = '#e3a73b'; nodes[4].style.background = 'rgba(227,167,59,0.25)'; }
    });
    trOnce('buy_confirm', 0.82, () => {
      me.cash = 3950; me.shield = 100;
      sfxTone(520, 0.1, 'triangle', 0.1, 780);
      renderBuyMenu(); inspectBuyItem(BUY_ITEMS[4]); syncHud();
    });
    trOnce('buy_close_insp', 1.15, () => {
      $('modal-buy').classList.remove('open');
      me.inspectTimer = 1.55;
    });

    trOnce('crouch_on', 2.08, () => { me.inspectTimer = 0; me.crouching = true; });
    trOnce('ak_s1', 2.22, () => trShoot({ actor: ph, dmg: 36, head: false }));
    trOnce('ak_s2', 2.35, () => trShoot({ actor: ph, dmg: 144, head: true }));
    trOnce('crouch_off', 2.65, () => { me.crouching = false; });

    trOnce('enemy_fire1', 2.82, () => {
      if (vp) spawnTracer(new THREE.Vector3(vp.pos.x, 1.5, vp.pos.z), me.pos.clone().add(new THREE.Vector3(0.4, 1.4, 0)), 0xfde047);
      sfxNoise(0.09, 860, 0.10);
    });
    trOnce('enemy_hit_me', 2.98, () => {
      if (vp) spawnTracer(new THREE.Vector3(vp.pos.x, 1.5, vp.pos.z), me.pos.clone().add(new THREE.Vector3(0, 1.35, 0)), 0xfde047);
      applyTrailerChipDamage(18);
    });

    trOnce('ak_t1', 3.18, () => trShoot({ wallPt: new THREE.Vector3(-1.2, 1.8, -17.1) }));
    trOnce('ak_t2', 3.30, () => trShoot({ actor: vp, dmg: 36, head: false }));
    trOnce('ak_t3', 3.42, () => trShoot({ actor: vp, dmg: 36, head: false }));
    trOnce('ak_t4', 3.54, () => trShoot({ actor: vp, dmg: 144, head: true }));
    trOnce('ak_reload', 4.02, () => startReload());

    const moveGoal = tr.t < 2.1 ? new THREE.Vector3(-12.4, 0, -20.8)
      : (tr.t < 2.7 ? me.pos.clone() : new THREE.Vector3(-10.8, 0, -18.8));
    let lookPt = new THREE.Vector3(0, 1.68, -20.8);
    if (tr.t >= 1.9 && tr.t < 2.75 && ph) lookPt = new THREE.Vector3(ph.pos.x, 1.74, ph.pos.z);
    else if (tr.t >= 2.75 && vp) lookPt = new THREE.Vector3(vp.pos.x, 1.74, vp.pos.z);
    drivePovFrame(dt, moveGoal, lookPt, tr.t < 1.15 ? 2.5 : 6.0, 14);
  } else if (tr.scene === 'utility_breach') {
    const rp = bots.find(b => b.name === 'BOT-Reaper');
    const kd = bots.find(b => b.name === 'BOT-Kodiak');

    trOnce('ut_smoke', 0.35, () => {
      abCd.e = 14;
      spawnSmoke(-0.6, 1.9, 2.2);
    });
    trOnce('ut_flash', 0.98, () => useFlash());
    trOnce('ut_dash', 1.42, () => {
      abCd.c = 8;
      sfxNoise(0.16, 1200, 0.22);
    });

    trOnce('vp_s1', 2.02, () => trShoot({ actor: rp, dmg: 33, head: false }));
    trOnce('vp_s2', 2.12, () => trShoot({ actor: rp, dmg: 33, head: false }));
    trOnce('vp_s3', 2.22, () => trShoot({ actor: rp, dmg: 33, head: false }));
    trOnce('vp_s4', 2.32, () => trShoot({ actor: rp, dmg: 120, head: true }));

    trOnce('swap_deag', 2.82, () => {
      equipWeapon('sheriff');
      me.inspectTimer = 0.72;
    });
    trOnce('deag_hs', 3.68, () => {
      me.crouching = true;
      trShoot({ actor: kd, dmg: 170, head: true });
    });
    trOnce('deag_stand', 4.10, () => { me.crouching = false; me.inspectTimer = 1.2; });

    let moveGoal = new THREE.Vector3(-7.0, 0, 3.8);
    let spd = 5.8;
    if (tr.t >= 1.42 && tr.t < 1.88) { moveGoal = new THREE.Vector3(-6.6, 0, 12.6); spd = 19.5; }
    else if (tr.t >= 1.88 && tr.t < 2.8) { moveGoal = new THREE.Vector3(-6.2, 0, 13.4); spd = 3.5; }
    else if (tr.t >= 2.8) { moveGoal = new THREE.Vector3(-5.6, 0, 14.4); spd = 3.2; }

    let lookPt = new THREE.Vector3(0.5, 1.65, 2.2);
    if (tr.t >= 0.85 && tr.t < 2.75 && rp) lookPt = new THREE.Vector3(rp.pos.x, 1.74, rp.pos.z);
    else if (tr.t >= 2.75 && kd) lookPt = new THREE.Vector3(kd.pos.x, 1.74, kd.pos.z);
    drivePovFrame(dt, moveGoal, lookPt, spd, 15);
  } else if (tr.scene === 'awp_karambit_ace') {
    const gh = bots.find(b => b.name === 'BOT-Ghost');
    const boss = bots.find(b => b.name === 'OMEGA-Boss');

    trOnce('awp_scope', 0.24, () => {
      setScoped(true);
      sfxTone(420, 0.06, 'sine', 0.06, 620);
    });
    trOnce('slomo_in', 1.12, () => { tr.timeScale = 0.45; });
    trOnce('awp_fire', 1.56, () => {
      tr.timeScale = 1.0;
      trShoot({ actor: gh, dmg: 375, head: true });
    });
    trOnce('awp_unscope', 1.86, () => setScoped(false));

    trOnce('boss_charge', 1.92, () => {
      if (boss) { boss.speed = 4.6; boss.goal.set(-6.4, 0, -3.1); }
      if (boss) spawnTracer(new THREE.Vector3(boss.pos.x, 1.5, boss.pos.z), me.pos.clone().add(new THREE.Vector3(0.25, 1.4, 0)), 0xfde047);
    });
    trOnce('swap_knife', 2.08, () => {
      equipWeapon('knife');
      me.inspectTimer = 0.92;
    });
    trOnce('knife_dash', 2.62, () => {
      abCd.c = 8;
      sfxNoise(0.16, 1200, 0.22);
    });
    trOnce('knife_ace', 2.95, () => {
      trShoot({ actor: boss, dmg: 195, head: true });
      const hb = $('hs-banner');
      hb.textContent = '★ ACE · TEAM WIPED ★';
      hb.style.opacity = '1';
      setTimeout(() => { if (tr.active) hb.style.opacity = '0'; }, 1100);
    });
    trOnce('show_sb', 4.02, () => {
      renderScoreboard();
      $('modal-sb').classList.add('open');
    });

    let moveGoal = me.pos.clone();
    let spd = 2.5;
    if (tr.t >= 2.62 && tr.t < 3.02 && boss) {
      moveGoal = new THREE.Vector3(boss.pos.x - 0.35, 0, boss.pos.z - 0.85);
      spd = 18.0;
    }
    let lookPt = gh ? new THREE.Vector3(gh.pos.x, 1.74, gh.pos.z) : new THREE.Vector3(3.5, 1.7, -3.0);
    if (tr.t >= 1.90 && boss) lookPt = new THREE.Vector3(boss.pos.x, 1.62, boss.pos.z);
    drivePovFrame(dt, moveGoal, lookPt, spd, 16);
  } else if (tr.scene === 'finale_orbit' || tr.scene === 'end_bg') {
    const ang = -2.35 + tr.t * (tr.scene === 'end_bg' ? 0.16 : 0.46);
    const rad = tr.scene === 'end_bg' ? 14.5 : THREE.MathUtils.lerp(11.8, 8.6, Math.min(1, tr.t / 3.6));
    const cx = -1.5 + Math.cos(ang) * rad;
    const cz = -18.5 + Math.sin(ang) * rad * 0.72;
    const cy = tr.scene === 'end_bg' ? 5.2 : THREE.MathUtils.lerp(3.9, 2.3, Math.min(1, tr.t / 3.6));
    camera.position.set(cx, cy, cz);
    camera.lookAt(-1.2, 1.45, -18.8);
    updateSquadCrossfire(dt);
    trOnce('fin_sm', 1.2, () => spawnSmoke(-7.2, 1.9, -19.5));
    trOnce('fin_k1', 2.1, () => {
      const v = bots.find(b => b.name === 'OMEGA-Viper');
      if (v) { v.hp = 0; spawnImpactSparks(new THREE.Vector3(v.pos.x, 1.6, v.pos.z), 0xff4757, 12); }
    });
  }
}

// ---------- Main Render Loop ----------
let lastT = performance.now();
let menuYaw = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (charsReady() && (bots.some((b) => !b.model.animate) || [...remotes.values()].some((r) => !r.model.animate))) { upgradeAgentModels(bots); upgradeAgentModels([...remotes.values()]); }

  if (!inMatch) {
    if (tr.active) {
      if (tr.hook) tr.hook.update(dt); else updateTrailerDirector(dt);
      for (let i = tracers.length - 1; i >= 0; i--) {
        tracers[i].life -= dt;
        if (tracers[i].life <= 0) { scene.remove(tracers[i].line); tracers[i].line.geometry.dispose(); tracers.splice(i, 1); }
      }
      for (let i = smokes.length - 1; i >= 0; i--) {
        smokes[i].life -= dt;
        if (smokes[i].life < 1.5) smokes[i].mesh.material.opacity = Math.max(0, smokes[i].life / 1.5) * 0.9;
        if (smokes[i].life <= 0) { scene.remove(smokes[i].mesh); smokes.splice(i, 1); }
      }
      if (tr.hook && tr.hook.render) tr.hook.render(dt); else renderFrame(scene, camera);
      return;
    }
    vmRoot.visible = false;
    menuYaw += dt * 0.14;
    camera.position.set(Math.cos(menuYaw) * 26, 11.5, Math.sin(menuYaw) * 26);
    camera.lookAt(0, 2.2, 0);
    renderFrame(scene, camera);
    return;
  }
  vmRoot.visible = !me.scoped;

  if (!paused && !buyOpen && !settingsOpen) {
    updatePlayer(dt);
    updateBots(dt);
    drawRadar();

    roundTime = Math.max(0, roundTime - dt);
    if (roundTime <= 0) roundTime = 115;
    const mins = Math.floor(roundTime / 60);
    const secs = String(Math.floor(roundTime % 60)).padStart(2, '0');
    $('round-timer').textContent = `${mins}:${secs}`;

    if (ws && ws.readyState === 1 && now - lastSync > 50) {
      lastSync = now;
      ws.send(JSON.stringify({
        type: 'state', x: +me.pos.x.toFixed(2), y: +me.pos.y.toFixed(2), z: +me.pos.z.toFixed(2),
        yaw: +me.yaw.toFixed(2), pitch: +me.pitch.toFixed(2), weapon: me.weaponId
      }));
    }
    for (const r of remotes.values()) {
      r.model.group.position.lerp(r.targetPos, Math.min(1, dt * 14));
      r.model.group.rotation.y = r.targetYaw;
      if (r.model.animate) r.model.animate(dt, { aim: true });
    }

    for (const k of ['q', 'e', 'c']) {
      if (abCd[k] > 0) abCd[k] = Math.max(0, abCd[k] - dt);
      const v = Math.ceil(abCd[k]);
      $(`cd-${k}`).textContent = v > 0 ? `${v}s` : 'READY';
      $(`ab-${k}`).classList.toggle('ready', v === 0);
    }
  }

  for (let i = tracers.length - 1; i >= 0; i--) {
    tracers[i].life -= dt;
    if (tracers[i].life <= 0) { scene.remove(tracers[i].line); tracers[i].line.geometry.dispose(); tracers.splice(i, 1); }
  }
  for (let i = smokes.length - 1; i >= 0; i--) {
    smokes[i].life -= dt;
    if (smokes[i].life < 1.5) smokes[i].mesh.material.opacity = Math.max(0, smokes[i].life / 1.5) * 0.9;
    if (smokes[i].life <= 0) { scene.remove(smokes[i].mesh); smokes.splice(i, 1); }
  }

  renderFrame(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.DillyStrike = {
  enterMatch,
  equipWeapon,
  setScoped,
  openBuy: () => { buyOpen = true; renderBuyMenu(); $('modal-buy').classList.add('open'); },
  closeBuy: () => { buyOpen = false; $('modal-buy').classList.remove('open'); },
  openScoreboard: (on) => { sbOpen = !!on; if (on) renderScoreboard(); $('modal-sb').classList.toggle('open', !!on); },
  openSettings,
  closeSettings,
  setSfxMuted: (m) => { sfxMuted = !!m; },
  trailer: {
    start: startTrailerMode,
    playScene: playTrailerScene,
    stop: stopTrailerMode,
    isActive: () => tr.active,
    // Hooks for the scripted in-engine trailer director in trailer.js
    setHook: (h) => { tr.hook = h || null; },
    engine: {
      renderer, scene, camera, vmRoot, me, WEAPONS, mapMeshes,
      bots: () => bots,
      spawnActor: spawnTrActor, clear: clearTrailerSceneObjects, updateActors: updateTrailerActors,
      shoot: trShoot, tracer: spawnTracer, sparks: spawnImpactSparks,
      hitmarker: showHitmarker, killfeed: addKillfeed, syncHud, drawRadar,
      setScoped, equipWeapon, pov: drivePovFrame,
      sfxTone, sfxNoise, playShot, playHeadshot,
      setScore: (a, o) => { scoreAlpha = a; scoreOmega = o; },
      setRoundTime: (t) => { roundTime = t; }
    }
  },
  setBind: (act, code) => { if (act in BINDS) { BINDS[act] = code; saveBinds(); syncBindLabels(); renderKeybindsUI(); } },
  getBinds: () => Object.assign({}, BINDS),
  vm: VM,
  getState: () => ({ inMatch, trailerActive: tr.active, trailerScene: tr.scene, hp: me.hp, shield: me.shield, cash: me.cash, weapon: WEAPONS[me.weaponId].name, bots: bots.length })
};

requestAnimationFrame(loop);
