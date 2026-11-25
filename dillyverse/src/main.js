/* ==========================================================================
   DILLYVERSE — Main Game Engine & UI Orchestrator
   Build. Explore. Survive.
   ========================================================================== */

import * as THREE from 'three';
import { B, IT, BLOCKS, ITEMS, getDef, isBlockId, getAllCatalogIds } from './blocks.js';
import { createTextureAtlas } from './textures.js';
import { World, CHUNK_SIZE, chunkKey } from './world.js';
import { buildChunkMeshes } from './mesher.js';
import { Player } from './player.js';
import { Inventory } from './inventory.js';
import { RECIPES, SMELT_RECIPES, FUEL_VALUES, canCraft, performCraft, FurnaceState } from './crafting.js';
import { CreatureManager } from './creatures.js';
import { AudioEngine } from './audio.js';
import { listWorlds, saveWorld, loadWorld, deleteWorld } from './storage.js';
import { MultiplayerClient } from './multiplayer.js';

const $ = (id) => document.getElementById(id);

// ---------- Settings ----------
const settings = {
  renderDist: 3,
  fov: 75,
  sensitivity: 1.0,
  volume: 0.6,
  weather: true,
};

// ---------- Three.js Setup ----------
const canvas = $('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7cc4fa);
scene.fog = new THREE.Fog(0x7cc4fa, 42, 74);

const camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.1, 260);
scene.add(camera);

// Lighting (Day/Night)
const hemiLight = new THREE.HemisphereLight(0xdff2ff, 0x3b4d34, 0.85);
scene.add(hemiLight);
const sunLight = new THREE.DirectionalLight(0xfff5dc, 1.05);
sunLight.position.set(40, 80, 30);
scene.add(sunLight);

// Sun & Moon meshes
const sunMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffe885, fog: false }));
const moonMesh = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8), new THREE.MeshBasicMaterial({ color: 0xdce8ff, fog: false }));
scene.add(sunMesh, moonMesh);

// First-person held item / arm viewmodel
const handMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.24, 0.24, 0.56),
  new THREE.MeshLambertMaterial({ color: 0xd6a57c })
);
handMesh.position.set(0.42, -0.34, -0.62);
camera.add(handMesh);

// Block selection wireframe outline + break overlay
const outlineMesh = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.006, 1.006, 1.006)),
  new THREE.LineBasicMaterial({ color: 0xffffff })
);
outlineMesh.visible = false;
scene.add(outlineMesh);

const breakOverlay = new THREE.Mesh(
  new THREE.BoxGeometry(1.01, 1.01, 1.01),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false })
);
breakOverlay.visible = false;
scene.add(breakOverlay);

// Weather particle system
const WEATHER_COUNT = 500;
const wPos = new Float32Array(WEATHER_COUNT * 3);
for (let i = 0; i < WEATHER_COUNT; i++) {
  wPos[i * 3] = (Math.random() - 0.5) * 40;
  wPos[i * 3 + 1] = Math.random() * 24;
  wPos[i * 3 + 2] = (Math.random() - 0.5) * 40;
}
const wGeo = new THREE.BufferGeometry();
wGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
const wMat = new THREE.PointsMaterial({ color: 0x9fd2ff, size: 0.22, transparent: true, opacity: 0.7 });
const weatherPoints = new THREE.Points(wGeo, wMat);
weatherPoints.visible = false;
scene.add(weatherPoints);

// Procedural Texture Atlas & Shared Chunk Materials
const atlas = createTextureAtlas();
const chunkMaterials = {
  opaque: new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true }),
  cutout: new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, alphaTest: 0.4, side: THREE.DoubleSide }),
  transparent: new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, transparent: true, opacity: 0.72, side: THREE.DoubleSide }),
};

// ---------- Game State ----------
const audio = new AudioEngine();
let world = new World('DILLYVERSE-MENU');
let player = new Player(world, camera, audio);
const inventory = new Inventory();
const furnace = new FurnaceState();
let creatures = new CreatureManager(world, scene, audio);

let activeWorldMeta = null; // { id, name, seed, mode, difficulty }
let inGame = false;
let paused = false;
let invOpen = false;
let invMode = 'inventory'; // 'inventory' | 'craft' | 'furnace' | 'creative'
let activeCat = 'All';
let chatOpen = false;
let timeOfDay = 0.28; // 0..1 (0.25 morning, 0.5 noon, 0.75 dusk, 0.0 midnight)
let weatherState = 'clear'; // 'clear' | 'rain'
let weatherTimer = 95;
let autoSaveTimer = 0;
let menuOrbitAngle = 0;

// Mining state
let mouseLeftDown = false;
let miningTarget = null; // "x,y,z"
let miningProgress = 0;
let miningHitTimer = 0;

// Drag-and-drop cursor stack
let cursorItem = null; // { id, count, dur? }

// Multiplayer
const mp = new MultiplayerClient(scene, {
  onBlockSet: (x, y, z, bid) => {
    world.setBlock(x, y, z, bid, false);
  },
  onChat: (name, text) => addChatLine(name, text),
  onDisconnect: () => {
    if (inGame && activeWorldMeta && activeWorldMeta.isMP) {
      addChatLine('SYSTEM', 'Disconnected from multiplayer server.');
    }
  }
});

// ---------- Screen Management ----------
let prevScreen = 'screen-main';
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('open'));
  if (id) {
    $(id).classList.add('open');
    if (document.pointerLockElement) document.exitPointerLock();
  }
  $('hud').classList.toggle('active', inGame && !id);
}

// ---------- Chunk Streaming ----------
function clearAllChunks() {
  for (const ch of world.chunks.values()) {
    for (const m of ch.meshes) {
      if (m.parent) m.parent.remove(m);
      m.geometry.dispose();
    }
    ch.meshes = [];
  }
  world.chunks.clear();
}

function updateChunks(centerX, centerZ, rd, maxBuildPerFrame = 3) {
  const pcx = Math.floor(centerX / CHUNK_SIZE);
  const pcz = Math.floor(centerZ / CHUNK_SIZE);

  // Unload far chunks
  for (const [k, ch] of world.chunks.entries()) {
    if (Math.abs(ch.cx - pcx) > rd + 1 || Math.abs(ch.cz - pcz) > rd + 1) {
      for (const m of ch.meshes) {
        if (m.parent) m.parent.remove(m);
        m.geometry.dispose();
      }
      world.chunks.delete(k);
    }
  }

  // Spiral load nearest chunks first
  let built = 0;
  for (let r = 0; r <= rd && built < maxBuildPerFrame; r++) {
    for (let dx = -r; dx <= r && built < maxBuildPerFrame; dx++) {
      for (let dz = -r; dz <= r && built < maxBuildPerFrame; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = pcx + dx, cz = pcz + dz;
        const ch = world.getChunk(cx, cz) || world.generateChunk(cx, cz);
        if (ch.dirty) {
          const meshes = buildChunkMeshes(world, ch, chunkMaterials);
          for (const m of meshes) scene.add(m);
          built++;
        }
      }
    }
  }
}

// Preload initial vista behind Main Menu
function loadMenuVista() {
  clearAllChunks();
  creatures.clear();
  world = new World('DILLYVERSE-VISTA-7');
  updateChunks(0, 0, 2, 25);
}
loadMenuVista();

// ---------- World Launch & Save ----------
async function enterWorld(meta, savedData = null) {
  clearAllChunks();
  creatures.clear();
  activeWorldMeta = meta;
  world = new World(meta.seed);
  if (savedData && savedData.mods) world.loadModifications(savedData.mods);
  if (meta.mpBlocks) {
    for (const [k, bid] of meta.mpBlocks) {
      const [bx, by, bz] = k.split(',').map(Number);
      world.setBlock(bx, by, bz, bid, false);
    }
  }

  player = new Player(world, camera, audio);
  player.mode = meta.mode || 'survival';
  player.difficulty = meta.difficulty || 'normal';
  creatures = new CreatureManager(world, scene, audio);

  // Build immediate 3x3 chunks around spawn for instant entry, then stream outer ring smoothly
  const sx = savedData && savedData.player ? savedData.player.x : 0;
  const sz = savedData && savedData.player ? savedData.player.z : 0;
  updateChunks(sx, sz, 1, 9);

  if (savedData && savedData.player) {
    const p = savedData.player;
    player.pos.set(p.x, p.y, p.z);
    player.spawnPos.set(p.x, p.y, p.z);
    player.yaw = p.yaw || 0;
    player.pitch = p.pitch || 0;
    player.health = p.health ?? 20;
    player.hunger = p.hunger ?? 20;
    timeOfDay = savedData.timeOfDay ?? 0.28;
    inventory.deserialize(savedData.inventory);
  } else {
    player.spawnAt(0, 0);
    timeOfDay = 0.28;
    inventory.giveStarterKit(player.mode);
  }

  inGame = true;
  paused = false;
  invOpen = false;
  chatOpen = false;
  cursorItem = null;
  updateCursorEl();
  showScreen(null);
  renderHotbar();
  addChatLine('DILLYVERSE', `Welcome to "${meta.name}" (Seed: ${meta.seed}) — Mode: ${player.mode.toUpperCase()}`);
  canvas.requestPointerLock?.();
}

async function persistActiveWorld(showToastMsg = true) {
  if (!inGame || !activeWorldMeta || activeWorldMeta.isMP) return;
  const rec = {
    id: activeWorldMeta.id,
    name: activeWorldMeta.name,
    seed: activeWorldMeta.seed,
    mode: player.mode,
    difficulty: player.difficulty,
    timeOfDay,
    player: {
      x: player.pos.x, y: player.pos.y, z: player.pos.z,
      yaw: player.yaw, pitch: player.pitch,
      health: player.health, hunger: player.hunger,
    },
    inventory: inventory.serialize(),
    mods: world.serializeModifications(),
  };
  await saveWorld(rec);
  if (showToastMsg) {
    const t = $('save-toast');
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 1800);
  }
}

// ---------- UI Rendering Helpers ----------
function renderItemIcon(item) {
  if (!item) return '';
  const def = getDef(item.id);
  if (!def) return '';
  let html = '';
  if (isBlockId(item.id) && atlas.icons[item.id]) {
    html += `<img src="${atlas.icons[item.id]}" alt="${def.name}">`;
  } else {
    html += `<span class="sym" style="color:${def.color || '#fff'}">${def.icon || '▪'}</span>`;
  }
  if (item.count > 1) html += `<span class="cnt">${item.count}</span>`;
  if (def.durability && item.dur !== undefined && item.dur < def.durability) {
    const pct = Math.max(0, Math.round((item.dur / def.durability) * 100));
    html += `<span class="dur"><i style="width:${pct}%"></i></span>`;
  }
  return html;
}

function renderHotbar() {
  const hb = $('hotbar');
  hb.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const div = document.createElement('div');
    div.className = 'slot' + (i === inventory.selected ? ' active' : '');
    div.innerHTML = `<span class="key">${i + 1}</span>` + renderItemIcon(inventory.slots[i]);
    hb.appendChild(div);
  }
  const held = inventory.getHeld();
  const def = held ? getDef(held.id) : null;
  $('held-label').textContent = def ? def.name : '';
  // Tint first-person hand to match held item
  if (def && def.color) handMesh.material.color.set(def.color);
  else if (held && isBlockId(held.id)) handMesh.material.color.setHex(0x88cc99);
  else handMesh.material.color.setHex(0xd6a57c);
}

function updateCursorEl() {
  const el = $('cursor-item');
  if (!cursorItem) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'block';
  el.innerHTML = `<div class="slot active">${renderItemIcon(cursorItem)}</div>`;
}

function bindSlotHover(el, item) {
  el.addEventListener('mouseenter', () => {
    if (!item) return;
    const def = getDef(item.id);
    if (!def) return;
    const tt = $('tooltip');
    tt.innerHTML = `<strong>${def.name}</strong><span>${def.desc || ''}</span>`;
    tt.style.display = 'block';
  });
  el.addEventListener('mouseleave', () => { $('tooltip').style.display = 'none'; });
}

function handleSlotClick(arr, idx, e, isArmor = false) {
  e.preventDefault();
  audio.playUi();
  const cur = arr[idx];

  if (isArmor && cursorItem) {
    const def = getDef(cursorItem.id);
    if (!def || def.armorSlot !== idx) return;
  }

  if (e.button === 2) {
    // Right-click: split half or place 1
    if (!cursorItem && cur) {
      const half = Math.ceil(cur.count / 2);
      cursorItem = { ...cur, count: half };
      cur.count -= half;
      if (cur.count <= 0) arr[idx] = null;
    } else if (cursorItem) {
      if (!cur) {
        arr[idx] = { ...cursorItem, count: 1 };
        cursorItem.count--;
        if (cursorItem.count <= 0) cursorItem = null;
      } else if (cur.id === cursorItem.id && cur.count < inventory.getMaxStack(cur.id)) {
        cur.count++;
        cursorItem.count--;
        if (cursorItem.count <= 0) cursorItem = null;
      }
    }
  } else {
    // Left-click: pick up, stack, or swap
    if (!cursorItem) {
      cursorItem = cur;
      arr[idx] = null;
    } else if (!cur) {
      arr[idx] = cursorItem;
      cursorItem = null;
    } else if (cur.id === cursorItem.id && inventory.getMaxStack(cur.id) > 1) {
      const space = inventory.getMaxStack(cur.id) - cur.count;
      const move = Math.min(space, cursorItem.count);
      cur.count += move;
      cursorItem.count -= move;
      if (cursorItem.count <= 0) cursorItem = null;
    } else {
      arr[idx] = cursorItem;
      cursorItem = cur;
    }
  }
  updateCursorEl();
  renderInventoryModal();
  renderHotbar();
}

function renderInventoryModal() {
  if (!invOpen) return;
  const titles = {
    inventory: '🎒 Inventory & 2×2 Crafting',
    craft: '🔨 Crafting Table (3×3 Workbench)',
    furnace: '🔥 Smelting Furnace',
    creative: '✨ Creative Mode — Full Block & Item Catalog',
  };
  $('inv-title').textContent = titles[invMode] || titles.inventory;

  // Armor slots
  document.querySelectorAll('[data-armor]').forEach(el => {
    const ai = Number(el.dataset.armor);
    el.innerHTML = renderItemIcon(inventory.armor[ai]);
    el.onmousedown = (e) => handleSlotClick(inventory.armor, ai, e, true);
    el.oncontextmenu = (e) => e.preventDefault();
    bindSlotHover(el, inventory.armor[ai]);
  });
  $('armor-stat').textContent = `🛡 DEF ${inventory.getArmorDefense()}`;

  // Main 27 slots (9..35)
  const mainG = $('inv-main-grid');
  mainG.innerHTML = '';
  for (let i = 9; i < 36; i++) {
    const div = document.createElement('div');
    div.className = 'slot';
    div.innerHTML = renderItemIcon(inventory.slots[i]);
    div.onmousedown = (e) => handleSlotClick(inventory.slots, i, e);
    div.oncontextmenu = (e) => e.preventDefault();
    bindSlotHover(div, inventory.slots[i]);
    mainG.appendChild(div);
  }
  // Hotbar 9 slots (0..8)
  const hbG = $('inv-hotbar-grid');
  hbG.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const div = document.createElement('div');
    div.className = 'slot' + (i === inventory.selected ? ' active' : '');
    div.innerHTML = `<span class="key">${i + 1}</span>` + renderItemIcon(inventory.slots[i]);
    div.onmousedown = (e) => handleSlotClick(inventory.slots, i, e);
    div.oncontextmenu = (e) => e.preventDefault();
    bindSlotHover(div, inventory.slots[i]);
    hbG.appendChild(div);
  }

  // Right pane: Crafting / Furnace / Creative
  const right = $('inv-right-pane');
  right.innerHTML = '';

  if (invMode === 'creative') {
    const cats = ['All', 'Building', 'Ores', 'Utility', 'Nature', 'Tools', 'Combat', 'Armor', 'Food', 'Materials'];
    const tabs = document.createElement('div');
    tabs.className = 'cat-tabs';
    for (const c of cats) {
      const b = document.createElement('button');
      b.className = 'cat-tab' + (activeCat === c ? ' active' : '');
      b.textContent = c;
      b.onclick = () => { activeCat = c; renderInventoryModal(); };
      tabs.appendChild(b);
    }
    right.appendChild(tabs);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(5,48px);gap:5px;max-height:290px;overflow-y:auto;';
    for (const id of getAllCatalogIds()) {
      const def = getDef(id);
      if (activeCat !== 'All' && def.cat !== activeCat) continue;
      const div = document.createElement('div');
      div.className = 'slot';
      const sample = { id, count: def.stack === 1 ? 1 : 64 };
      div.innerHTML = renderItemIcon(sample);
      div.onclick = () => {
        inventory.add(id, def.stack === 1 ? 1 : 64);
        audio.playUi();
        renderInventoryModal();
        renderHotbar();
      };
      bindSlotHover(div, sample);
      grid.appendChild(div);
    }
    right.appendChild(grid);
  } else if (invMode === 'furnace') {
    const box = document.createElement('div');
    box.className = 'furnace-box';
    const inSlot = document.createElement('div');
    inSlot.className = 'slot';
    inSlot.title = 'Input (Ore / Sand / Clay / Raw Roast)';
    inSlot.innerHTML = renderItemIcon(furnace.input);
    inSlot.onmousedown = (e) => {
      const arr = [furnace.input];
      handleSlotClick(arr, 0, e);
      furnace.input = arr[0];
      renderInventoryModal();
    };
    const fuelSlot = document.createElement('div');
    fuelSlot.className = 'slot';
    fuelSlot.title = 'Fuel (Coal / Logs / Planks / Sticks)';
    fuelSlot.innerHTML = renderItemIcon(furnace.fuel);
    fuelSlot.onmousedown = (e) => {
      const arr = [furnace.fuel];
      handleSlotClick(arr, 0, e);
      furnace.fuel = arr[0];
      renderInventoryModal();
    };
    const outSlot = document.createElement('div');
    outSlot.className = 'slot active';
    outSlot.title = 'Smelted Output';
    outSlot.innerHTML = renderItemIcon(furnace.output);
    outSlot.onclick = () => {
      if (furnace.output) {
        inventory.add(furnace.output.id, furnace.output.count);
        furnace.output = null;
        audio.playCraft();
        renderInventoryModal();
        renderHotbar();
      }
    };

    const leftCol = document.createElement('div');
    leftCol.style.cssText = 'display:flex;flex-direction:column;gap:8px;align-items:center;';
    leftCol.append(inSlot, document.createTextNode(furnace.burnLeft > 0 ? '🔥' : '❄️'), fuelSlot);

    const prog = document.createElement('div');
    prog.className = 'f-prog';
    const rec = furnace.input ? SMELT_RECIPES[furnace.input.id] : null;
    const pct = rec ? Math.min(100, (furnace.progress / rec.time) * 100) : 0;
    prog.innerHTML = `<i style="width:${pct}%"></i>`;

    box.append(leftCol, prog, outSlot);
    right.appendChild(box);
    const hint = document.createElement('p');
    hint.style.cssText = 'font-size:12px;color:var(--muted);margin:0;line-height:1.5;';
    hint.innerHTML = 'Smelt: <b>Iron Ore → Iron Ingot</b>, <b>Gold Ore → Gold Ingot</b>, <b>Sand → Glass</b>, <b>Clay → Bricks</b>, <b>Raw Roast → Seared Steak</b>. Fuel: Coal, Logs, Planks, Sticks.';
    right.appendChild(hint);
  } else {
    // 2x2 or 3x3 Crafting Recipe List
    const isTable = invMode === 'craft';
    const cats = ['All', 'Building', 'Utility', 'Tools', 'Combat', 'Armor', 'Survival'];
    const tabs = document.createElement('div');
    tabs.className = 'cat-tabs';
    for (const c of cats) {
      const b = document.createElement('button');
      b.className = 'cat-tab' + (activeCat === c ? ' active' : '');
      b.textContent = c;
      b.onclick = () => { activeCat = c; renderInventoryModal(); };
      tabs.appendChild(b);
    }
    right.appendChild(tabs);

    const list = document.createElement('div');
    list.className = 'recipe-list';
    for (const r of RECIPES) {
      if (activeCat !== 'All' && r.cat !== activeCat) continue;
      if (!isTable && r.grid > 2) continue;
      const ok = canCraft(r, inventory, isTable);
      const outDef = getDef(r.out);
      const reqStr = r.req.map(([id, q]) => `${q}× ${getDef(id).name}`).join(', ');
      const row = document.createElement('div');
      row.className = 'recipe-row' + (ok ? ' can' : '');
      row.innerHTML = `
        <div><strong>${outDef.name} ${r.count > 1 ? `×${r.count}` : ''}</strong><small>${reqStr}</small></div>
        <button class="btn sm ${ok ? 'primary' : ''}" ${ok ? '' : 'disabled'}>Craft</button>
      `;
      row.querySelector('button').onclick = () => {
        if (performCraft(r, inventory, isTable)) {
          audio.playCraft();
          renderInventoryModal();
          renderHotbar();
        }
      };
      list.appendChild(row);
    }
    right.appendChild(list);
    if (!isTable) {
      const tip = document.createElement('p');
      tip.style.cssText = 'font-size:11.5px;color:var(--gold);margin:8px 0 0;';
      tip.textContent = 'Tip: Craft & place a Crafting Table (right-click it) for 3×3 tools, armor & furnaces!';
      right.appendChild(tip);
    }
  }
}

function openInventory(mode) {
  invOpen = true;
  invMode = player.mode === 'creative' && mode === 'inventory' ? 'creative' : mode;
  player.clearKeys();
  showScreen('screen-inv');
  renderInventoryModal();
}

function closeInventory() {
  if (cursorItem) {
    inventory.add(cursorItem.id, cursorItem.count, cursorItem.dur);
    cursorItem = null;
    updateCursorEl();
  }
  invOpen = false;
  $('tooltip').style.display = 'none';
  showScreen(null);
  renderHotbar();
  canvas.requestPointerLock?.();
}

function addChatLine(sender, text) {
  const log = $('chat-log');
  const div = document.createElement('div');
  div.className = 'chat-line';
  div.innerHTML = `<b>${sender}:</b> ${text.replace(/</g, '&lt;')}`;
  log.appendChild(div);
  while (log.children.length > 7) log.removeChild(log.firstChild);
}

// ---------- Menu & Button Listeners ----------
document.querySelectorAll('[data-back]').forEach(btn => {
  btn.addEventListener('click', () => { audio.playUi(); showScreen(btn.dataset.back); });
});

$('btn-sp').addEventListener('click', async () => {
  audio.playUi();
  showScreen('screen-worlds');
  await refreshWorldList();
});
$('btn-mp').addEventListener('click', () => { audio.playUi(); showScreen('screen-mp'); });
$('btn-settings').addEventListener('click', () => { audio.playUi(); prevScreen = 'screen-main'; showScreen('screen-settings'); });
$('btn-pause-settings').addEventListener('click', () => { audio.playUi(); prevScreen = 'screen-pause'; showScreen('screen-settings'); });
$('btn-settings-close').addEventListener('click', () => { audio.playUi(); showScreen(prevScreen); });
$('btn-credits').addEventListener('click', () => { audio.playUi(); showScreen('screen-credits'); });
$('btn-exit').addEventListener('click', () => { window.location.href = '../index.html'; });

$('btn-rand-seed').addEventListener('click', () => {
  $('new-world-seed').value = 'DV-' + Math.floor(100000 + Math.random() * 899999);
});

async function refreshWorldList() {
  const list = $('world-list');
  const worlds = await listWorlds();
  if (worlds.length === 0) {
    list.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:10px;text-align:center;">No saved worlds yet — create your first DillyVerse below!</div>';
    return;
  }
  list.innerHTML = '';
  for (const w of worlds) {
    const row = document.createElement('div');
    row.className = 'world-item';
    const dtStr = w.updatedAt ? new Date(w.updatedAt).toLocaleString() : '';
    row.innerHTML = `
      <div>
        <h4>${w.name}</h4>
        <small>${(w.mode || 'survival').toUpperCase()} · ${w.difficulty || 'normal'} · Seed: ${w.seed} · ${dtStr}</small>
      </div>
      <div class="row">
        <button class="btn sm primary">▶ Play</button>
        <button class="btn sm danger">🗑</button>
      </div>
    `;
    row.querySelector('.primary').onclick = async () => {
      const full = await loadWorld(w.id);
      await enterWorld({ id: w.id, name: w.name, seed: w.seed, mode: w.mode, difficulty: w.difficulty }, full);
    };
    row.querySelector('.danger').onclick = async () => {
      await deleteWorld(w.id);
      await refreshWorldList();
    };
    list.appendChild(row);
  }
}

$('btn-create-world').addEventListener('click', async () => {
  const name = $('new-world-name').value.trim() || 'New DillyVerse';
  const seed = $('new-world-seed').value.trim() || ('DV-' + Math.floor(100000 + Math.random() * 899999));
  const mode = $('new-world-mode').value;
  const difficulty = $('new-world-diff').value;
  const meta = { id: 'w_' + Date.now(), name, seed, mode, difficulty };
  await enterWorld(meta, null);
  await persistActiveWorld(false);
});

$('btn-mp-connect').addEventListener('click', async () => {
  const name = $('mp-name').value.trim() || 'DillyExplorer';
  const url = 'wss://apibuild.dillonmay.com';
  $('mp-status').textContent = 'Connecting to ' + url + '...';
  try {
    const welcome = await mp.connect(name);
    $('mp-status').textContent = 'Connected to ' + url + '!';
    await enterWorld({
      id: 'mp_' + Date.now(),
      name: 'DillyVerse Online',
      seed: welcome.seed || 'DILLYVERSE-MP-01',
      mode: 'survival',
      difficulty: 'normal',
      isMP: true,
      mpBlocks: welcome.blocks || []
    }, null);
  } catch (err) {
    $('mp-status').textContent = '⚠️ ' + err.message;
  }
});

// Settings inputs
$('opt-rd').oninput = (e) => { settings.renderDist = Number(e.target.value); $('val-rd').textContent = settings.renderDist; };
$('opt-fov').oninput = (e) => { settings.fov = Number(e.target.value); $('val-fov').textContent = settings.fov; camera.fov = settings.fov; camera.updateProjectionMatrix(); };
$('opt-sens').oninput = (e) => { settings.sensitivity = Number(e.target.value); $('val-sens').textContent = settings.sensitivity.toFixed(1); };
$('opt-vol').oninput = (e) => { settings.volume = Number(e.target.value) / 100; audio.volume = settings.volume; $('val-vol').textContent = e.target.value; };
$('opt-weather').onchange = (e) => { settings.weather = e.target.value === 'on'; if (!settings.weather) weatherState = 'clear'; };

// Pause / Death / Inv Buttons
$('btn-resume').onclick = () => { paused = false; showScreen(null); canvas.requestPointerLock?.(); };
$('btn-save-now').onclick = () => persistActiveWorld(true);
$('btn-save-quit').onclick = async () => {
  await persistActiveWorld(true);
  mp.disconnect();
  inGame = false; paused = false; invOpen = false;
  loadMenuVista();
  showScreen('screen-main');
};
$('btn-respawn').onclick = () => {
  player.spawnAt(Math.floor(player.spawnPos.x), Math.floor(player.spawnPos.z));
  showScreen(null);
  canvas.requestPointerLock?.();
};
$('btn-death-menu').onclick = async () => {
  inGame = false; mp.disconnect(); loadMenuVista(); showScreen('screen-main');
};
$('btn-inv-close').onclick = closeInventory;

// ---------- Gameplay Input ----------
window.addEventListener('mousemove', (e) => {
  if (invOpen) {
    if (cursorItem) { $('cursor-item').style.left = e.clientX + 'px'; $('cursor-item').style.top = e.clientY + 'px'; }
    const tt = $('tooltip');
    if (tt.style.display === 'block') { tt.style.left = (e.clientX + 14) + 'px'; tt.style.top = (e.clientY + 14) + 'px'; }
    return;
  }
  if (inGame && !paused && !player.dead && document.pointerLockElement === canvas) {
    player.applyLook(e.movementX, e.movementY, 0.0022 * settings.sensitivity);
  }
});

canvas.addEventListener('mousedown', (e) => {
  if (!inGame || paused || invOpen || chatOpen || player.dead) return;
  if (document.pointerLockElement !== canvas) {
    canvas.requestPointerLock?.();
    return;
  }
  if (e.button === 0) {
    mouseLeftDown = true;
    player.swingAnim = 1.0;
    // Try melee attack on creature first
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation).normalize();
    const held = inventory.getHeld();
    const def = held ? getDef(held.id) : null;
    const dmg = def && def.damage ? def.damage : 2;
    const hitMob = creatures.hitCreature(camera.position, dir, 3.6, dmg, (mob) => {
      inventory.add(mob.def.drop, mob.def.dropCount);
      renderHotbar();
      addChatLine('COMBAT', `Defeated ${mob.def.name} (+${mob.def.dropCount} ${getDef(mob.def.drop).name})`);
    });
    if (hitMob && player.mode === 'survival') {
      inventory.damageHeld(1);
      renderHotbar();
      mouseLeftDown = false;
    }
  } else if (e.button === 2) {
    handleRightClick();
  }
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) { mouseLeftDown = false; miningProgress = 0; breakOverlay.visible = false; } });
window.addEventListener('contextmenu', (e) => { if (inGame) e.preventDefault(); });

window.addEventListener('wheel', (e) => {
  if (!inGame || paused || invOpen || chatOpen) return;
  inventory.selected = (inventory.selected + (e.deltaY > 0 ? 1 : 8)) % 9;
  renderHotbar();
});

window.addEventListener('keydown', (e) => {
  if (!inGame) return;

  if (chatOpen) {
    if (e.code === 'Enter') {
      const inp = $('chat-input');
      const txt = inp.value.trim();
      if (txt) {
        if (mp.connected) mp.sendChat(txt);
        else addChatLine(mp.username || 'You', txt);
      }
      inp.value = '';
      inp.classList.remove('open');
      chatOpen = false;
      canvas.requestPointerLock?.();
    } else if (e.code === 'Escape') {
      $('chat-input').classList.remove('open');
      chatOpen = false;
    }
    return;
  }

  if (e.code === 'KeyE') {
    e.preventDefault();
    if (invOpen) closeInventory();
    else if (!paused && !player.dead) openInventory('inventory');
    return;
  }
  if (e.code === 'KeyT' && !invOpen && !paused && !player.dead) {
    e.preventDefault();
    chatOpen = true;
    player.clearKeys();
    if (document.pointerLockElement) document.exitPointerLock();
    const inp = $('chat-input');
    inp.classList.add('open');
    inp.focus();
    return;
  }
  if (e.code === 'Escape') {
    if (invOpen) { closeInventory(); return; }
    if (!player.dead) {
      paused = !paused;
      player.clearKeys();
      showScreen(paused ? 'screen-pause' : null);
      if (!paused) canvas.requestPointerLock?.();
    }
    return;
  }
  if (invOpen || paused || player.dead) return;

  if (e.code === 'KeyQ') {
    if (inventory.consumeSlot(inventory.selected, 1)) {
      audio.playUi();
      renderHotbar();
    }
    return;
  }
  if (e.code.startsWith('Digit')) {
    const n = Number(e.code.slice(5)) - 1;
    if (n >= 0 && n < 9) { inventory.selected = n; renderHotbar(); }
  }
  player.onKeyDown(e.code);
});

window.addEventListener('keyup', (e) => { player.onKeyUp(e.code); });

document.addEventListener('pointerlockchange', () => {
  if (inGame && !paused && !invOpen && !chatOpen && !player.dead && document.pointerLockElement !== canvas) {
    paused = true;
    player.clearKeys();
    showScreen('screen-pause');
  }
});

// ---------- Right-Click: Interact / Eat / Place Block ----------
function handleRightClick() {
  const hit = player.raycastBlock(5.5);
  if (hit) {
    const targetDef = BLOCKS[hit.blockId];
    if (targetDef && targetDef.interact === 'craft') { openInventory('craft'); return; }
    if (targetDef && targetDef.interact === 'furnace') { openInventory('furnace'); return; }
  }

  const held = inventory.getHeld();
  if (!held) return;
  const def = getDef(held.id);
  if (!def) return;

  // Eat food
  if (def.food) {
    if (player.eat(def.food, def.heal || 0)) {
      if (player.mode === 'survival') inventory.consumeSlot(inventory.selected, 1);
      renderHotbar();
    }
    return;
  }

  // Place block
  if (hit && isBlockId(held.id)) {
    const px = hit.x + hit.nx;
    const py = hit.y + hit.ny;
    const pz = hit.z + hit.nz;
    const targetB = BLOCKS[held.id];
    if (targetB.solid && player.wouldIntersectBlock(px, py, pz)) return;
    if (world.setBlock(px, py, pz, held.id, true)) {
      audio.playPlace(targetB.mat);
      player.swingAnim = 1.0;
      if (mp.connected) mp.sendBlockSet(px, py, pz, held.id);
      if (player.mode === 'survival') {
        inventory.consumeSlot(inventory.selected, 1);
        renderHotbar();
      }
    }
  }
}

// ---------- Mining & Block Breaking ----------
function updateMining(dt, hit) {
  if (!mouseLeftDown || !hit || paused || invOpen || player.dead) {
    miningProgress = 0;
    miningTarget = null;
    breakOverlay.visible = false;
    return;
  }
  const key = `${hit.x},${hit.y},${hit.z}`;
  if (key !== miningTarget) { miningTarget = key; miningProgress = 0; }
  const bDef = BLOCKS[hit.blockId];
  if (!bDef || bDef.hardness === Infinity) return;

  const held = inventory.getHeld();
  const tDef = held ? getDef(held.id) : null;
  let speed = 1.0;
  const rightTool = tDef && bDef.tool && tDef.tool === bDef.tool;
  if (rightTool) speed = tDef.speed || 2.0;

  const breakTime = player.mode === 'creative' ? 0.06 : Math.max(0.12, bDef.hardness / speed);
  miningProgress += dt / breakTime;
  miningHitTimer += dt;
  if (miningHitTimer > 0.18) {
    miningHitTimer = 0;
    player.swingAnim = 1.0;
    audio.playHit(bDef.mat);
  }

  breakOverlay.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  breakOverlay.material.opacity = Math.min(0.65, miningProgress * 0.65);
  breakOverlay.visible = true;

  if (miningProgress >= 1.0) {
    miningProgress = 0;
    breakOverlay.visible = false;
    world.setBlock(hit.x, hit.y, hit.z, B.AIR, true);
    audio.playBreak(bDef.mat);
    if (mp.connected) mp.sendBlockSet(hit.x, hit.y, hit.z, B.AIR);

    if (player.mode === 'survival') {
      const tierOk = !bDef.minTier || (rightTool && (tDef.tier || 0) >= bDef.minTier);
      if (tierOk && bDef.drop) inventory.add(bDef.drop, 1);
      if (bDef.bonusDrop && Math.random() < bDef.bonusDrop.chance) inventory.add(bDef.bonusDrop.id, 1);
      if (tDef && tDef.durability) inventory.damageHeld(1);
      renderHotbar();
    }
  }
}

// ---------- Day/Night Cycle & Weather ----------
function updateAtmosphere(dt) {
  timeOfDay = (timeOfDay + dt / 420) % 1; // 7-minute full day/night cycle
  const angle = timeOfDay * Math.PI * 2 - Math.PI / 2;
  const sy = Math.sin(angle);
  const sx = Math.cos(angle);

  const cx = inGame ? player.pos.x : 0;
  const cz = inGame ? player.pos.z : 0;
  sunLight.position.set(cx + sx * 90, sy * 90, cz + 25);
  sunMesh.position.set(cx + sx * 150, sy * 150, cz + 25);
  moonMesh.position.set(cx - sx * 150, -sy * 150, cz - 25);

  const dayAmt = Math.max(0, Math.min(1, sy * 2.2 + 0.35));
  const skyCol = new THREE.Color().lerpColors(new THREE.Color(0x091124), new THREE.Color(0x7cc4fa), dayAmt);
  if (weatherState === 'rain') skyCol.lerp(new THREE.Color(0x4b5c6e), 0.55);
  scene.background.copy(skyCol);
  scene.fog.color.copy(skyCol);
  scene.fog.near = settings.renderDist * 11;
  scene.fog.far = settings.renderDist * 16 + 10;

  sunLight.intensity = Math.max(0.12, dayAmt * (weatherState === 'rain' ? 0.6 : 1.1));
  hemiLight.intensity = Math.max(0.22, 0.25 + dayAmt * 0.65);

  // Dynamic weather
  if (settings.weather) {
    weatherTimer -= dt;
    if (weatherTimer <= 0) {
      weatherState = weatherState === 'clear' && Math.random() < 0.35 ? 'rain' : 'clear';
      weatherTimer = 60 + Math.random() * 90;
    }
  }
  weatherPoints.visible = inGame && weatherState === 'rain';
  if (weatherPoints.visible) {
    const biome = world.getBiomeAt(player.pos.x, player.pos.z);
    const isSnow = biome === 'Snowy Peaks';
    wMat.color.setHex(isSnow ? 0xffffff : 0x9fd2ff);
    wMat.size = isSnow ? 0.32 : 0.20;
    const arr = wGeo.attributes.position.array;
    const fallSpd = isSnow ? 3.5 : 16.0;
    for (let i = 0; i < WEATHER_COUNT; i++) {
      arr[i * 3 + 1] -= fallSpd * dt;
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 24;
    }
    wGeo.attributes.position.needsUpdate = true;
    weatherPoints.position.set(player.pos.x, Math.max(0, player.pos.y - 6), player.pos.z);
  }
  return sy < -0.1; // isNight
}

// ---------- Main Loop ----------
let lastTime = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  const isNight = updateAtmosphere(dt);

  if (!inGame) {
    // Live orbiting 3D voxel world behind Main Menu
    menuOrbitAngle += dt * 0.14;
    camera.position.set(Math.cos(menuOrbitAngle) * 28, 56, Math.sin(menuOrbitAngle) * 28);
    camera.lookAt(0, 38, 0);
    renderer.render(scene, camera);
    return;
  }

  // Update Furnace even while closed
  const smelted = furnace.update(dt);
  if (smelted && invOpen && invMode === 'furnace') renderInventoryModal();

  if (!paused && !invOpen && !player.dead) {
    const armorDef = inventory.getArmorDefense();
    player.update(dt, armorDef);
    updateChunks(player.pos.x, player.pos.z, settings.renderDist, 1);
    creatures.update(dt, player, isNight, armorDef);
    mp.sendMove(player.pos.x, player.pos.y, player.pos.z, player.yaw);
    mp.update(dt);

    // Block targeting & mining
    const hit = player.raycastBlock(5.5);
    if (hit) {
      outlineMesh.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      outlineMesh.visible = true;
    } else {
      outlineMesh.visible = false;
    }
    updateMining(dt, hit);

    // Hand swing animation
    const sw = Math.sin(player.swingAnim * Math.PI);
    handMesh.position.set(0.42 - sw * 0.12, -0.34 - sw * 0.08, -0.62 - sw * 0.16);
    handMesh.rotation.x = -sw * 0.65;

    // Auto-save every 20s
    autoSaveTimer += dt;
    if (autoSaveTimer >= 20) {
      autoSaveTimer = 0;
      persistActiveWorld(false);
    }

    // Check death
    if (player.dead) {
      $('death-reason').textContent = player.deathReason || 'You fell in DillyVerse.';
      showScreen('screen-death');
    }
  }

  // Update HUD bars & info
  $('water-tint').style.display = player.headInWater ? 'block' : 'none';
  $('hurt-tint').style.opacity = player.hurtCooldown > 0.2 ? '1' : '0';
  $('bars').style.display = player.mode === 'creative' ? 'none' : 'flex';
  $('hp-fill').style.width = `${(player.health / player.maxHealth) * 100}%`;
  $('hp-txt').textContent = `${Math.ceil(player.health)}/${player.maxHealth}`;
  $('hun-fill').style.width = `${(player.hunger / player.maxHunger) * 100}%`;
  $('hun-txt').textContent = `${Math.ceil(player.hunger)}/${player.maxHunger}`;

  const biome = world.getBiomeAt(player.pos.x, player.pos.z);
  const hr = Math.floor(((timeOfDay + 0.25) % 1) * 24);
  const min = Math.floor((((timeOfDay + 0.25) % 1) * 24 - hr) * 60);
  const flyTag = player.flying ? ' · 🕊 FLYING' : '';
  const mpTag = mp.connected ? ` · 🌐 ONLINE (${mp.remotes.size + 1})` : '';
  $('top-info').textContent = `XYZ ${Math.floor(player.pos.x)}, ${Math.floor(player.pos.y)}, ${Math.floor(player.pos.z)} · ${biome} · ${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}${flyTag}${mpTag}`;

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Expose debug/test API
window.DillyVerse = {
  enterWorld,
  openInventory,
  closeInventory,
  persistActiveWorld,
  getState: () => ({ inGame, paused, invOpen, chunks: world.chunks.size, pos: player.pos, mode: player.mode })
};

requestAnimationFrame(loop);
