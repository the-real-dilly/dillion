/* ==========================================================================
   DILLY STRIKE — 3D Tactical FPS (CS:GO + Valorant Inspired)
   Three.js WebGL 2 · Dustline Citadel 3-Lane Map · 5 Weapons · Buy Menu
   Abilities (Flash / Smoke / Dash) · Tactical Bots · Rust WebSocket MP
   ========================================================================== */

import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
export const DILLY_STRIKE_WS = 'wss://apibuild.dillonmay.com/strike';

// ---------- Weapon Registry ----------
const WEAPONS = {
  vandal:   { id: 'vandal',   name: 'Vandal',    slot: 1, cost: 2900, dmg: 40, hsMult: 4.0, rpm: 580, mag: 25, reserve: 100, auto: true,  spread: 0.012, recoil: 0.022, col: 0x3b3f4a, len: 0.72, desc: 'High-caliber rifle · 1-tap headshots' },
  phantom:  { id: 'phantom',  name: 'Phantom',   slot: 2, cost: 2700, dmg: 34, hsMult: 3.6, rpm: 680, mag: 30, reserve: 120, auto: true,  spread: 0.008, recoil: 0.015, col: 0x1e293b, len: 0.78, desc: 'Silenced precision rifle · tight recoil' },
  operator: { id: 'operator', name: 'Operator',  slot: 3, cost: 4700, dmg: 150, hsMult: 2.5, rpm: 45, mag: 5,  reserve: 20,  auto: false, spread: 0.001, recoil: 0.075, scope: true, col: 0x57262d, len: 1.05, desc: 'Bolt-action sniper · RMB 2× Scope · 1-shot kill' },
  sheriff:  { id: 'sheriff',  name: 'Sheriff',   slot: 4, cost: 800,  dmg: 55, hsMult: 3.0, rpm: 240, mag: 7,  reserve: 35,  auto: false, spread: 0.010, recoil: 0.042, col: 0x64748b, len: 0.44, desc: 'Heavy sidearm · crisp headshots' },
  knife:    { id: 'knife',    name: 'Tactical Knife', slot: 5, cost: 0, dmg: 65, hsMult: 1.5, rpm: 140, mag: 0, reserve: 0, auto: false, melee: true, col: 0xf5b82e, len: 0.32, desc: 'Fastest movement speed + melee slash' },
};

// ---------- Procedural Web Audio SFX ----------
let actx = null;
function sfxTone(freq, dur, type = 'sawtooth', vol = 0.09, endF = null) {
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
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const len = Math.floor(actx.sampleRate * dur);
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.3));
    const src = actx.createBufferSource(); src.buffer = buf;
    const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
    const g = actx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(actx.destination); src.start();
  } catch (_) {}
}
function playShot(id) {
  if (id === 'operator') { sfxNoise(0.28, 420, 0.36); sfxTone(140, 0.22, 'sawtooth', 0.14, 42); }
  else if (id === 'phantom') { sfxNoise(0.09, 1400, 0.14); sfxTone(320, 0.06, 'triangle', 0.06, 120); }
  else if (id === 'knife') { sfxNoise(0.08, 2200, 0.12); }
  else { sfxNoise(0.13, 820, 0.24); sfxTone(210, 0.09, 'sawtooth', 0.10, 75); }
}
function playHeadshot() {
  sfxTone(1320, 0.09, 'sine', 0.14, 1760);
  setTimeout(() => sfxTone(1760, 0.12, 'triangle', 0.12, 880), 45);
}

// ---------- Three.js Scene & Renderer ----------
const canvas = $('fps-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88b9e6);
scene.fog = new THREE.Fog(0x88b9e6, 48, 125);

const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.08, 220);
scene.add(camera);

const hemi = new THREE.HemisphereLight(0xf2f7ff, 0x736352, 0.92);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 1.15);
sun.position.set(35, 60, 22);
scene.add(sun);

// ---------- Dustline Citadel Map Geometry & AABB Colliders ----------
const colliders = []; // { minX, maxX, minY, maxY, minZ, maxZ }
const mapMeshes = [];

function addBox(x, y, z, w, h, d, color, isSolid = true) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  mesh.position.set(x, y, z);
  scene.add(mesh);
  mapMeshes.push(mesh);
  if (isSolid) {
    colliders.push({
      minX: x - w / 2, maxX: x + w / 2,
      minY: y - h / 2, maxY: y + h / 2,
      minZ: z - d / 2, maxZ: z + d / 2,
    });
  }
  return mesh;
}

function buildDustlineMap() {
  // Ground floor (sandstone plaza)
  addBox(0, -0.5, 0, 76, 1, 56, 0xc7b392, false);

  // Outer perimeter fortress walls
  addBox(0, 4.5, -28, 76, 9, 2, 0x8f7d66);
  addBox(0, 4.5, 28, 76, 9, 2, 0x8f7d66);
  addBox(-38, 4.5, 0, 2, 9, 56, 0x8f7d66);
  addBox(38, 4.5, 0, 2, 9, 56, 0x8f7d66);

  // Center Mid dividing walls (3-lane Valorant / Dust2 inspired layout)
  addBox(-10, 3.0, -10, 2.2, 6, 18, 0xb8a384);
  addBox(10, 3.0, 10, 2.2, 6, 18, 0xb8a384);
  addBox(0, 2.6, 0, 6.5, 5.2, 2.2, 0xa89274); // Mid pillar cover

  // A-Site (North / -Z) cover crates & stone wall
  addBox(-22, 1.3, -15, 3.2, 2.6, 3.2, 0x8b6239);
  addBox(14, 1.3, -17, 3.4, 2.6, 2.6, 0x8b6239);
  addBox(4, 2.5, -18, 8, 5, 1.8, 0x9e8c74);
  // A-Site glowing floor marker
  addBox(0, 0.02, -21, 9, 0.04, 6, 0xf5b82e, false);

  // B-Site (South / +Z) warehouse cover & crates
  addBox(22, 1.3, 15, 3.2, 2.6, 3.2, 0x8b6239);
  addBox(-16, 1.3, 17, 3.5, 2.6, 2.8, 0x8b6239);
  addBox(-4, 2.5, 18, 8, 5, 1.8, 0x9e8c74);
  // B-Site glowing floor marker
  addBox(0, 0.02, 21, 9, 0.04, 6, 0x38bdf8, false);

  // Spawn cover barriers (Alpha -X, Omega +X)
  addBox(-28, 1.8, 0, 2, 3.6, 12, 0x7c6f5e);
  addBox(28, 1.8, 0, 2, 3.6, 12, 0x7c6f5e);

  // Accent crates in Mid & Lanes
  addBox(-4, 0.9, 6, 2.2, 1.8, 2.2, 0x7a5230);
  addBox(5, 0.9, -6, 2.2, 1.8, 2.2, 0x7a5230);
  addBox(-20, 0.9, 6, 2.4, 1.8, 2.4, 0x6f4e37);
  addBox(20, 0.9, -6, 2.4, 1.8, 2.4, 0x6f4e37);
}
buildDustlineMap();

// ---------- First-Person 3D Weapon Viewmodel ----------
const gunGroup = new THREE.Group();
gunGroup.position.set(0.28, -0.24, -0.52);
camera.add(gunGroup);

const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.14, 0.72), new THREE.MeshLambertMaterial({ color: 0x3b3f4a }));
const gunAccent = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.04, 0.36), new THREE.MeshLambertMaterial({ color: 0xf5b82e }));
gunAccent.position.set(0, 0.05, 0.04);
const muzzleFlash = new THREE.Mesh(
  new THREE.SphereGeometry(0.09, 6, 6),
  new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0 })
);
muzzleFlash.position.set(0, 0.02, -0.46);
gunGroup.add(gunBody, gunAccent, muzzleFlash);

// ---------- Agent 3D Model Factory (Bots & Remote MP Players) ----------
function createAgentModel(name, team) {
  const g = new THREE.Group();
  const teamCol = team === 'alpha' ? 0xf5b82e : 0x38bdf8;
  const suitCol = team === 'alpha' ? 0x2b2418 : 0x162638;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.92, 0.42), new THREE.MeshLambertMaterial({ color: suitCol }));
  torso.position.y = 1.05;
  torso.userData = { part: 'body' };

  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.42, 0.46), new THREE.MeshLambertMaterial({ color: teamCol }));
  vest.position.y = 1.15;
  vest.userData = { part: 'body' };

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), new THREE.MeshLambertMaterial({ color: 0xeec49c }));
  head.position.y = 1.72;
  head.userData = { part: 'head' };

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 0.12), new THREE.MeshBasicMaterial({ color: teamCol }));
  visor.position.set(0, 1.75, 0.19);
  visor.userData = { part: 'head' };

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.34), new THREE.MeshLambertMaterial({ color: 0x181c24 }));
  legs.position.y = 0.31;
  legs.userData = { part: 'body' };

  // Floating Name Tag
  const c = document.createElement('canvas'); c.width = 256; c.height = 44;
  const cx = c.getContext('2d');
  cx.fillStyle = 'rgba(8,12,20,0.72)'; cx.fillRect(10, 4, 236, 36);
  cx.font = 'bold 20px system-ui, sans-serif';
  cx.fillStyle = team === 'alpha' ? '#ffd666' : '#7dd3fc';
  cx.textAlign = 'center'; cx.fillText(name.slice(0, 16), 128, 29);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  tag.scale.set(1.6, 0.28, 1); tag.position.y = 2.22;

  g.add(torso, vest, head, visor, legs, tag);
  return { group: g, head, torso, vest, hitMeshes: [head, visor, torso, vest, legs] };
}

// ---------- Game & Player State ----------
let inMatch = false;
let isMP = false;
let paused = false;
let buyOpen = false;
let chatOpen = false;
let sbOpen = false;

const me = {
  id: 'local',
  name: 'DillyAgent',
  team: 'alpha',
  pos: new THREE.Vector3(-32, 0, 0),
  vel: new THREE.Vector3(0, 0, 0),
  yaw: -Math.PI / 2,
  pitch: 0,
  hp: 100,
  shield: 50,
  cash: 1200,
  kills: 0,
  deaths: 0,
  onGround: true,
  crouching: false,
  scoped: false,
  weaponId: 'vandal',
  owned: new Set(['vandal', 'sheriff', 'knife']),
  ammo: { vandal: [25, 100], phantom: [30, 120], operator: [5, 20], sheriff: [7, 35], knife: [0, 0] },
  fireCd: 0,
  reloadTimer: 0,
  recoilKick: 0,
  keys: {},
};

let scoreAlpha = 0, scoreOmega = 0;
let mouseDown = false;
const abCd = { q: 0, e: 0, c: 0 };

// Active FX (tracers, smoke clouds)
const tracers = []; // { line, life }
const smokes = [];  // { mesh, life }

// Tactical Bots (Solo mode) & Remote Players (Rust MP mode)
let bots = [];
const remotes = new Map(); // id -> { id, name, team, model, targetPos, targetYaw, kills, deaths }
let ws = null;
let lastSync = 0;

// ---------- Weapon & Loadout Helpers ----------
function equipWeapon(id) {
  if (!me.owned.has(id)) return;
  me.weaponId = id;
  me.reloadTimer = 0;
  setScoped(false);
  const w = WEAPONS[id];
  gunBody.material.color.setHex(w.col);
  gunBody.scale.set(1, 1, w.len / 0.72);
  syncHud();
}

function setScoped(on) {
  const w = WEAPONS[me.weaponId];
  me.scoped = !!(on && w.scope);
  $('scope-overlay').classList.toggle('on', me.scoped);
  gunGroup.visible = !me.scoped;
  camera.fov = me.scoped ? 32 : 78;
  camera.updateProjectionMatrix();
}

function startReload() {
  const w = WEAPONS[me.weaponId];
  if (w.melee || me.reloadTimer > 0) return;
  const [cur, res] = me.ammo[w.id];
  if (cur >= w.mag || res <= 0) return;
  me.reloadTimer = 1.35;
  sfxTone(300, 0.12, 'triangle', 0.08, 460);
  syncHud();
}

function spawnTracer(from, to, color = 0xffe88a) {
  const g = new THREE.BufferGeometry().setFromPoints([from, to]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  scene.add(l);
  tracers.push({ line: l, life: 0.08 });
}

function spawnSmoke(x, y, z) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(3.6, 14, 12),
    new THREE.MeshLambertMaterial({ color: 0xdce6f2, transparent: true, opacity: 0.86 })
  );
  m.position.set(x, Math.max(1.8, y), z);
  scene.add(m);
  smokes.push({ mesh: m, life: 9.0 });
  sfxNoise(0.35, 480, 0.22);
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

  me.fireCd = 60 / w.rpm;
  me.recoilKick = Math.min(0.18, me.recoilKick + (w.recoil || 0.02) * 1.4);
  me.pitch = Math.min(Math.PI / 2 - 0.05, me.pitch + (w.recoil || 0.015) * (me.crouching ? 0.55 : 1.0));
  muzzleFlash.material.opacity = w.melee ? 0 : 0.95;
  playShot(w.id);

  // Spread calculation (CS:GO style: moving widens spread, crouching tightens it)
  const moveSpd = Math.hypot(me.vel.x, me.vel.z);
  const spread = (w.spread || 0) * (me.scoped ? 0.15 : 1.0) * (me.crouching ? 0.45 : 1.0) + (moveSpd > 1.2 ? 0.022 : 0);
  const dir = new THREE.Vector3(
    (Math.random() - 0.5) * spread,
    (Math.random() - 0.5) * spread,
    -1
  ).applyEuler(camera.rotation).normalize();

  raycaster.set(camera.position, dir);
  raycaster.far = w.melee ? 2.6 : 120;

  // Check walls first
  const wallHits = raycaster.intersectObjects(mapMeshes, false);
  let maxDist = wallHits.length > 0 ? wallHits[0].distance : raycaster.far;
  const endPt = camera.position.clone().addScaledVector(dir, maxDist);

  // Check Bots or Remote MP Players
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
  }

  if (!w.melee) {
    const startPt = camera.position.clone().add(new THREE.Vector3(0.18, -0.14, -0.5).applyEuler(camera.rotation));
    spawnTracer(startPt, endPt, w.id === 'operator' ? 0xf43f5e : 0xffe88a);
  }
  syncHud();
}

function showHitmarker(hs) {
  const hm = $('hitmarker');
  hm.classList.toggle('hs', hs);
  hm.style.opacity = '1';
  setTimeout(() => { hm.style.opacity = '0'; }, 130);
  if (hs) {
    const hb = $('hs-banner');
    hb.style.opacity = '1';
    setTimeout(() => { hb.style.opacity = '0'; }, 750);
  }
}

// ---------- Tactical Bots (Solo Practice / 5v5 Feel) ----------
const BOT_WAYPOINTS = [
  [-6, -20], [8, -19], [0, -6], [0, 6], [-8, 20], [10, 19], [20, 0], [-18, -8], [18, 8]
];

function spawnBots() {
  for (const b of bots) scene.remove(b.model.group);
  bots = [];
  const names = ['OMEGA-Viper', 'OMEGA-Reaper', 'OMEGA-Ghost', 'OMEGA-Kodiak'];
  for (let i = 0; i < names.length; i++) {
    const model = createAgentModel(names[i], 'omega');
    const sx = 24 + (i % 2) * 5;
    const sz = -10 + i * 7;
    model.group.position.set(sx, 0, sz);
    scene.add(model.group);
    bots.push({
      id: 'bot_' + i, name: names[i], team: 'omega', model,
      pos: new THREE.Vector3(sx, 0, sz),
      hp: 100, kills: 0, deaths: 0,
      wp: BOT_WAYPOINTS[i % BOT_WAYPOINTS.length],
      fireCd: 1.2 + Math.random(), respawnTimer: 0, blindTimer: 0
    });
  }
}

function damageBot(bot, dmg, isHS, wepName) {
  bot.hp -= dmg;
  if (bot.hp <= 0) {
    bot.hp = 0;
    bot.deaths++;
    bot.respawnTimer = 3.5;
    bot.model.group.visible = false;
    me.kills++;
    me.cash += 300;
    scoreAlpha++;
    addKillfeed(me.name, bot.name, wepName, isHS);
    syncHud();
  }
}

function updateBots(dt) {
  if (isMP) return;
  for (const b of bots) {
    if (b.respawnTimer > 0) {
      b.respawnTimer -= dt;
      if (b.respawnTimer <= 0) {
        b.hp = 100;
        b.pos.set(26 + (Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 24);
        b.model.group.position.copy(b.pos);
        b.model.group.visible = true;
      }
      continue;
    }
    if (b.blindTimer > 0) { b.blindTimer -= dt; continue; }

    // Move toward waypoint
    const dx = b.wp[0] - b.pos.x, dz = b.wp[1] - b.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.8) {
      b.wp = BOT_WAYPOINTS[Math.floor(Math.random() * BOT_WAYPOINTS.length)];
    } else {
      const nx = b.pos.x + (dx / d) * 4.2 * dt;
      const nz = b.pos.z + (dz / d) * 4.2 * dt;
      if (!collides(nx, 0.5, nz, 0.45)) { b.pos.x = nx; b.pos.z = nz; }
      else b.wp = BOT_WAYPOINTS[Math.floor(Math.random() * BOT_WAYPOINTS.length)];
    }

    // Face & shoot player if line-of-sight is clear
    const toP = new THREE.Vector3(me.pos.x - b.pos.x, (me.pos.y + 1.4) - (b.pos.y + 1.5), me.pos.z - b.pos.z);
    const distP = toP.length();
    b.model.group.position.copy(b.pos);
    b.model.group.rotation.y = Math.atan2(toP.x, toP.z);

    b.fireCd -= dt;
    if (distP < 34 && b.fireCd <= 0) {
      const bOrigin = new THREE.Vector3(b.pos.x, 1.55, b.pos.z);
      raycaster.set(bOrigin, toP.clone().normalize());
      raycaster.far = distP;
      const blocked = raycaster.intersectObjects(mapMeshes, false).length > 0;
      if (!blocked) {
        b.fireCd = 0.75 + Math.random() * 0.55;
        spawnTracer(bOrigin, me.pos.clone().add(new THREE.Vector3(0, 1.3, 0)), 0x38bdf8);
        sfxNoise(0.08, 900, 0.10);
        if (Math.random() < 0.34) {
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
    addKillfeed(byName, me.name, 'Rifle', false);
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
  me.shield = 50;
  me.yaw = me.team === 'alpha' ? -1.18 : 1.95;
  me.pitch = 0;
  setScoped(false);
  syncHud();
}

// ---------- Physics & Wall Collision ----------
function collides(x, y, z, r = 0.42) {
  for (const c of colliders) {
    if (x + r > c.minX && x - r < c.maxX && y + 1.7 > c.minY && y < c.maxY && z + r > c.minZ && z - r < c.maxZ) {
      return true;
    }
  }
  return false;
}

function updatePlayer(dt) {
  me.crouching = !!(me.keys['ControlLeft'] || me.keys['ControlRight']);
  const fwd = (me.keys['KeyW'] ? 1 : 0) - (me.keys['KeyS'] ? 1 : 0);
  const str = (me.keys['KeyD'] ? 1 : 0) - (me.keys['KeyA'] ? 1 : 0);

  let spd = me.weaponId === 'knife' ? 8.2 : (me.scoped ? 3.2 : (me.crouching ? 3.4 : 6.4));
  const sinY = Math.sin(me.yaw), cosY = Math.cos(me.yaw);
  let mx = -sinY * fwd + cosY * str;
  let mz = -cosY * fwd - sinY * str;
  const ml = Math.hypot(mx, mz);
  if (ml > 0.01) { mx /= ml; mz /= ml; }

  me.vel.x = THREE.MathUtils.lerp(me.vel.x, mx * spd, Math.min(1, dt * 14));
  me.vel.z = THREE.MathUtils.lerp(me.vel.z, mz * spd, Math.min(1, dt * 14));
  me.vel.y -= 24 * dt;
  if (me.keys['Space'] && me.onGround) { me.vel.y = 8.0; me.onGround = false; }

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

  // Dynamic crosshair expansion
  const gap = Math.round(4 + (ml > 0.1 ? 6 : 0) + me.recoilKick * 90 - (me.crouching ? 2 : 0));
  $('xhair').style.setProperty('--gap', Math.max(2, gap) + 'px');

  // Weapon fire, reload & recoil recovery
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
  if (mouseDown && WEAPONS[me.weaponId].auto) fireWeapon();

  me.recoilKick = Math.max(0, me.recoilKick - dt * 0.9);
  muzzleFlash.material.opacity = Math.max(0, muzzleFlash.material.opacity - dt * 18);
  gunGroup.position.set(0.28, -0.24 - (me.reloadTimer > 0 ? 0.14 : 0), -0.52 + me.recoilKick);
  gunGroup.rotation.x = me.recoilKick * 1.6;
}

// ---------- Valorant-Style Abilities ----------
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
        addKillfeed(m.killer, m.victim, m.weapon, m.hs);
        if (m.victimId === me.id) { me.deaths++; respawnMe(); }
        if (m.killer === me.name) { me.kills++; me.cash += 300; }
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

// ---------- HUD, Buy Menu, Killfeed & Scoreboard ----------
function syncHud() {
  $('sc-a').textContent = scoreAlpha;
  $('sc-o').textContent = scoreOmega;
  $('hud-hp').textContent = me.hp;
  $('hud-sh').textContent = me.shield;
  $('hud-cash').textContent = '$' + me.cash;
  const w = WEAPONS[me.weaponId];
  $('wep-name').textContent = me.reloadTimer > 0 ? `${w.name} (RELOADING...)` : w.name;
  $('wep-ammo').textContent = w.melee ? '∞' : `${me.ammo[w.id][0]} / ${me.ammo[w.id][1]}`;
}

function addKillfeed(killer, victim, wep, hs) {
  const kf = $('killfeed');
  const div = document.createElement('div');
  div.className = 'kf-row' + (hs ? ' hs' : '');
  div.textContent = `${killer} [${wep}${hs ? ' 💀HS' : ''}] ${victim}`;
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

function renderBuyMenu() {
  $('buy-cash').textContent = '$' + me.cash;
  const grid = $('buy-grid');
  grid.innerHTML = '';
  const items = [
    ...Object.values(WEAPONS).filter(w => w.cost > 0).map(w => ({ kind: 'wep', ...w })),
    { kind: 'armor', id: 'armor', name: 'Heavy Shield (+50)', cost: 650, desc: 'Refills tactical armor vest to 50' }
  ];
  for (const it of items) {
    const owned = it.kind === 'wep' && me.owned.has(it.id);
    const btn = document.createElement('button');
    btn.className = 'buy-item';
    btn.disabled = owned ? false : (me.cash < it.cost || (it.kind === 'armor' && me.shield >= 50));
    btn.innerHTML = `<div><strong>${it.name}</strong><small>${it.desc}</small></div><span class="buy-price">${owned ? 'EQUIP' : '$' + it.cost}</span>`;
    btn.onclick = () => {
      if (it.kind === 'armor') {
        if (me.cash >= it.cost && me.shield < 50) { me.cash -= it.cost; me.shield = 50; }
      } else {
        if (!owned) { me.cash -= it.cost; me.owned.add(it.id); }
        equipWeapon(it.id);
      }
      renderBuyMenu();
      syncHud();
    };
    grid.appendChild(btn);
  }
}

function renderScoreboard() {
  const rows = [
    { name: me.name + ' (YOU)', team: me.team, kills: me.kills, deaths: me.deaths },
    ...(isMP ? Array.from(remotes.values()) : bots).map(e => ({ name: e.name, team: e.team, kills: e.kills, deaths: e.deaths }))
  ];
  $('sb-body').innerHTML = rows.map(r =>
    `<tr><td><b>${r.name}</b></td><td style="color:${r.team === 'alpha' ? '#ffd666' : '#38bdf8'}">${r.team.toUpperCase()}</td><td>${r.kills}</td><td>${r.deaths}</td></tr>`
  ).join('');
}

// ---------- Match Start & Controls ----------
function enterMatch(mpMode) {
  isMP = mpMode;
  me.name = $('agent-name').value.trim() || 'DillyAgent';
  me.kills = 0; me.deaths = 0; me.cash = 1200;
  if (!mpMode) { scoreAlpha = 0; scoreOmega = 0; me.team = 'alpha'; spawnBots(); }
  respawnMe();
  equipWeapon('vandal');
  inMatch = true; paused = false; buyOpen = false; chatOpen = false;
  $('modal-lobby').classList.remove('open');
  $('hud').classList.add('active');
  $('sc-mode').textContent = mpMode ? 'RUST ONLINE · DUSTLINE' : 'SOLO TACTICAL · DUSTLINE';
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
  inMatch = false; paused = false;
  if (ws) { try { ws.close(); } catch (_) {} ws = null; }
  $('hud').classList.remove('active');
  $('modal-pause').classList.remove('open');
  $('modal-lobby').classList.add('open');
};

window.addEventListener('mousemove', (e) => {
  if (!inMatch || paused || buyOpen || chatOpen || document.pointerLockElement !== canvas) return;
  const sens = me.scoped ? 0.0011 : 0.0022;
  me.yaw -= e.movementX * sens;
  me.pitch = Math.max(-1.45, Math.min(1.45, me.pitch - e.movementY * sens));
});
canvas.addEventListener('mousedown', (e) => {
  if (!inMatch || paused || buyOpen || chatOpen) return;
  if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
  if (e.button === 0) { mouseDown = true; fireWeapon(); }
  else if (e.button === 2) { setScoped(!me.scoped); }
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; });
window.addEventListener('contextmenu', (e) => { if (inMatch) e.preventDefault(); });

window.addEventListener('keydown', (e) => {
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
  if (e.code === 'Tab') { e.preventDefault(); sbOpen = true; renderScoreboard(); $('modal-sb').classList.add('open'); return; }
  if (e.code === 'KeyB' && !paused) {
    buyOpen = !buyOpen;
    if (buyOpen) { if (document.pointerLockElement) document.exitPointerLock(); renderBuyMenu(); $('modal-buy').classList.add('open'); }
    else { $('modal-buy').classList.remove('open'); canvas.requestPointerLock?.(); }
    return;
  }
  if (e.code === 'KeyT' && !paused && !buyOpen) {
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
  if (e.code === 'KeyR') startReload();
  else if (e.code === 'KeyQ') useFlash();
  else if (e.code === 'KeyE') useSmoke();
  else if (e.code === 'KeyC') useDash();
  else if (e.code === 'Digit1') equipWeapon('vandal');
  else if (e.code === 'Digit2') equipWeapon('phantom');
  else if (e.code === 'Digit3') equipWeapon('operator');
  else if (e.code === 'Digit4') equipWeapon('sheriff');
  else if (e.code === 'Digit5') equipWeapon('knife');
});
window.addEventListener('keyup', (e) => {
  me.keys[e.code] = false;
  if (e.code === 'Tab') { sbOpen = false; $('modal-sb').classList.remove('open'); }
});

// ---------- Main Render Loop ----------
let lastT = performance.now();
let menuYaw = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  if (!inMatch) {
    menuYaw += dt * 0.16;
    camera.position.set(Math.cos(menuYaw) * 26, 12, Math.sin(menuYaw) * 26);
    camera.lookAt(0, 2, 0);
    renderer.render(scene, camera);
    return;
  }

  if (!paused && !buyOpen) {
    updatePlayer(dt);
    updateBots(dt);

    // Sync state to Rust server at ~20Hz
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
    }

    // Cooldowns
    for (const k of ['q', 'e', 'c']) {
      if (abCd[k] > 0) abCd[k] = Math.max(0, abCd[k] - dt);
      const v = Math.ceil(abCd[k]);
      $(`cd-${k}`).textContent = v > 0 ? `${v}s` : 'READY';
      $(`ab-${k}`).classList.toggle('ready', v === 0);
    }
  }

  // Tracers & Smokes
  for (let i = tracers.length - 1; i >= 0; i--) {
    tracers[i].life -= dt;
    if (tracers[i].life <= 0) { scene.remove(tracers[i].line); tracers[i].line.geometry.dispose(); tracers.splice(i, 1); }
  }
  for (let i = smokes.length - 1; i >= 0; i--) {
    smokes[i].life -= dt;
    if (smokes[i].life < 1.5) smokes[i].mesh.material.opacity = Math.max(0, smokes[i].life / 1.5) * 0.86;
    if (smokes[i].life <= 0) { scene.remove(smokes[i].mesh); smokes.splice(i, 1); }
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.DillyStrike = {
  enterMatch,
  openBuy: () => { buyOpen = true; renderBuyMenu(); $('modal-buy').classList.add('open'); },
  getState: () => ({ inMatch, hp: me.hp, cash: me.cash, weapon: me.weaponId, bots: bots.length })
};

requestAnimationFrame(loop);
