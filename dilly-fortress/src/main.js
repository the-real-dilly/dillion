/* ==========================================================================
   DILLY FORTRESS — Complete Tactical Tower Defense Engine
   A Dilly Gaming Original · 60 FPS Canvas 2D with Web Audio SFX.
   ========================================================================== */

import { MAPS, TOWERS, TOWER_ORDER, ENEMIES, buildWave } from './data.js';
import { SoundFX } from './audio.js';

const $ = (id) => document.getElementById(id);
const W = 960, H = 600;
const PATH_HALF_W = 24;
const SAVE_KEY = 'dilly_fortress_best_v1';

const canvas = $('td-canvas');
const ctx = canvas.getContext('2d');
const sfx = new SoundFX();

let bestRecord = loadBest();
function loadBest() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '{"wave":0,"score":0}'); }
  catch (_) { return { wave: 0, score: 0 }; }
}
function saveBest(wave, score) {
  let changed = false;
  if (wave > bestRecord.wave) { bestRecord.wave = wave; changed = true; }
  if (score > bestRecord.score) { bestRecord.score = score; changed = true; }
  if (changed) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(bestRecord)); } catch (_) {}
  }
}

// ---------- Game State ----------
let selectedMapIdx = 0;
let curMap = MAPS[0];
let mapPaths = [];

let cash = 260;
let lives = 20;
let wave = 0;
let score = 0;
let speed = 1;
let autoWave = false;
let endlessMode = false;
let running = false;
let gameOver = false;

let buildType = null;      // tower id string when placing
let selectedTower = null;  // placed tower object
let hover = { x: -999, y: -999, inside: false };

let towers = [];
let enemies = [];
let projs = [];
let beams = [];     // { kind:'rail'|'tesla', pts, color, life, maxLife }
let rings = [];     // { x, y, r, maxR, color, life, maxLife }
let floats = [];    // { x, y, text, color, life }
let particles = []; // { x, y, vx, vy, r, color, life }
let spawnQueue = [];
let spawnTimer = 0;
let waveActive = false;
let shake = 0;
let overdriveTimer = 0;

const abCd = { airstrike: 0, freeze: 0, overdrive: 0 };
const AB_MAX = { airstrike: 28, freeze: 24, overdrive: 26 };

// ---------- Geometry Helpers ----------
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function canPlaceAt(x, y) {
  if (x < 26 || x > W - 26 || y < 26 || y > H - 26) return false;
  for (const path of mapPaths) {
    for (let i = 0; i < path.length - 1; i++) {
      if (distToSegment(x, y, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]) < PATH_HALF_W + 18) {
        return false;
      }
    }
  }
  for (const t of towers) {
    if (Math.hypot(t.x - x, t.y - y) < 38) return false;
  }
  return true;
}

// ---------- Game Lifecycle ----------
function startMap(idx) {
  selectedMapIdx = idx;
  curMap = MAPS[idx];
  mapPaths = curMap.paths.map(p => p.map(([nx, ny]) => [nx * W, ny * H]));

  cash = curMap.startCash;
  lives = curMap.lives;
  wave = 0;
  score = 0;
  endlessMode = false;
  gameOver = false;
  running = true;
  waveActive = false;
  buildType = 'vulcan';
  selectedTower = null;
  towers = [];
  enemies = [];
  projs = [];
  beams = [];
  rings = [];
  floats = [];
  particles = [];
  spawnQueue = [];
  overdriveTimer = 0;
  abCd.airstrike = 0;
  abCd.freeze = 0;
  abCd.overdrive = 0;

  $('modal-title').classList.remove('open');
  $('modal-end').classList.remove('open');
  closeInspector();
  renderTowerDock();
  syncHud();
}

function startNextWave() {
  if (waveActive || gameOver) return;
  wave++;
  waveActive = true;
  spawnQueue = buildWave(wave);
  spawnTimer = 0.1;
  sfx.wave();
  addFloat(W / 2, 70, wave % 5 === 0 ? `👑 BOSS WAVE ${wave}!` : `🌊 WAVE ${wave}`, '#ffd666', 1.6);
  syncHud();
}

function addFloat(x, y, text, color = '#fff', life = 0.9) {
  floats.push({ x, y, text, color, life, maxLife: life });
}

function addSparks(x, y, color, count = 8) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 110;
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 2 + Math.random() * 2.5, color, life: 0.35 + Math.random() * 0.25 });
  }
}

// ---------- Tower Placement, Upgrades & Inspector ----------
function placeTower(typeId, x, y) {
  const def = TOWERS[typeId];
  if (!def || cash < def.cost || !canPlaceAt(x, y)) return false;
  cash -= def.cost;
  const t = {
    id: typeId, def, x, y, level: 0, spent: def.cost,
    damage: def.damage, range: def.range, fireRate: def.fireRate,
    splash: def.splash || 0, slow: def.slow || 0, slowDur: def.slowDur || 0,
    chains: def.chains || 0, burnDps: def.burnDps || 0, burnDur: def.burnDur || 0,
    armorPierce: !!def.armorPierce,
    cooldown: 0, angle: 0, flash: 0, kills: 0, targetMode: 'first'
  };
  towers.push(t);
  selectedTower = t;
  sfx.place();
  addSparks(x, y, def.accent, 10);
  openInspector(t);
  renderTowerDock();
  syncHud();
  return true;
}

function openInspector(t) {
  selectedTower = t;
  $('inspector').classList.add('open');
  const nextUp = t.def.upgrades[t.level];
  $('insp-name').textContent = `${t.def.icon} ${t.def.name} Lv.${t.level + 1}`;
  $('insp-stats').innerHTML = `
    <div>DMG: <b>${Math.round(t.damage)}</b></div>
    <div>RATE: <b>${t.fireRate.toFixed(1)}/s</b></div>
    <div>RANGE: <b>${Math.round(t.range)}</b></div>
    <div>KILLS: <b>${t.kills}</b></div>
  `;
  const modeNames = { first: 'First', strongest: 'Strongest', closest: 'Closest' };
  $('insp-target').textContent = `🎯 Target: ${modeNames[t.targetMode]}`;
  const upBtn = $('insp-upgrade');
  if (nextUp) {
    upBtn.disabled = cash < nextUp.cost;
    upBtn.textContent = `⬆ ${nextUp.label} ($${nextUp.cost})`;
  } else {
    upBtn.disabled = true;
    upBtn.textContent = '★ MAX LEVEL';
  }
  const refund = Math.round(t.spent * 0.75);
  $('insp-sell').textContent = `💰 Sell (+$${refund})`;
}

function closeInspector() {
  selectedTower = null;
  $('inspector').classList.remove('open');
}

// ---------- Damage & Combat ----------
function damageEnemy(e, rawDmg, opts = {}) {
  if (e.dead) return;
  let dmg = rawDmg;
  if (e.shield > 0) {
    const mult = opts.tesla ? 1.75 : 1.0;
    const absorb = Math.min(e.shield, dmg * mult);
    e.shield -= absorb;
    dmg -= absorb / mult;
  }
  if (dmg > 0) {
    const armor = opts.armorPierce || e.burnTimer > 0 ? e.armor * 0.3 : e.armor;
    e.hp -= Math.max(1, dmg * (1 - armor));
  }
  e.hitFlash = 0.1;

  if (opts.slow && opts.slow > e.slowAmt) {
    e.slowAmt = opts.slow;
    e.slowTimer = Math.max(e.slowTimer, opts.slowDur || 2.2);
  }
  if (opts.burnDps) {
    e.burnDps = Math.max(e.burnDps, opts.burnDps);
    e.burnTimer = Math.max(e.burnTimer, opts.burnDur || 3.0);
  }

  if (e.hp <= 0) {
    e.dead = true;
    cash += e.reward;
    score += e.reward * 10;
    if (opts.tower) opts.tower.kills++;
    addFloat(e.x, e.y - 12, `+$${e.reward}`, '#ffd666', 0.8);
    addSparks(e.x, e.y, e.color, e.boss ? 28 : 10);
    if (e.boss) { shake = 12; sfx.boom(); }
    if (selectedTower) openInspector(selectedTower);
    renderTowerDock();
    syncHud();
  }
}

function pickTarget(t) {
  let best = null;
  let bestScore = -Infinity;
  for (const e of enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - t.x, e.y - t.y);
    if (d > t.range) continue;
    let sc = 0;
    if (t.targetMode === 'first') sc = e.progress;
    else if (t.targetMode === 'strongest') sc = e.hp + e.shield;
    else sc = -d;
    if (sc > bestScore) { bestScore = sc; best = e; }
  }
  return best;
}

// ---------- Active Commander Abilities ----------
function useAirstrike() {
  if (abCd.airstrike > 0 || !running || gameOver) return;
  abCd.airstrike = AB_MAX.airstrike;
  sfx.ability();
  sfx.boom();
  shake = 10;
  const path = mapPaths[0];
  for (let i = 0; i < path.length - 1; i++) {
    const mx = (path[i][0] + path[i + 1][0]) * 0.5;
    const my = (path[i][1] + path[i + 1][1]) * 0.5;
    rings.push({ x: mx, y: my, r: 8, maxR: 85, color: '#fb923c', life: 0.45, maxLife: 0.45 });
    addSparks(mx, my, '#ffd666', 14);
    for (const e of enemies) {
      if (!e.dead && Math.hypot(e.x - mx, e.y - my) < 95) damageEnemy(e, 140 + wave * 18, { armorPierce: true });
    }
  }
  addFloat(W / 2, 110, '✈️ AIRSTRIKE BARRAGE!', '#fb923c', 1.3);
}

function useFreeze() {
  if (abCd.freeze > 0 || !running || gameOver) return;
  abCd.freeze = AB_MAX.freeze;
  sfx.ability();
  rings.push({ x: W / 2, y: H / 2, r: 20, maxR: 560, color: '#38bdf8', life: 0.55, maxLife: 0.55 });
  for (const e of enemies) {
    if (!e.dead) { e.slowAmt = 0.92; e.slowTimer = 3.6; }
  }
  addFloat(W / 2, 110, '❄️ GLOBAL FREEZE NOVA!', '#7dd3fc', 1.3);
}

function useOverdrive() {
  if (abCd.overdrive > 0 || !running || gameOver) return;
  abCd.overdrive = AB_MAX.overdrive;
  overdriveTimer = 7.0;
  sfx.ability();
  addFloat(W / 2, 110, '⚡ OVERDRIVE — 2× FIRE RATE!', '#facc15', 1.3);
}

// ---------- Simulation Step ----------
function update(rawDt) {
  if (!running || gameOver) return;
  const dt = Math.min(rawDt, 0.05) * speed;

  if (shake > 0) shake = Math.max(0, shake - rawDt * 24);
  if (overdriveTimer > 0) overdriveTimer = Math.max(0, overdriveTimer - rawDt);
  for (const k of Object.keys(abCd)) if (abCd[k] > 0) abCd[k] = Math.max(0, abCd[k] - rawDt);

  // Spawn queue
  if (spawnQueue.length > 0) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      const item = spawnQueue.shift();
      spawnTimer = item.gap;
      const def = ENEMIES[item.type];
      const pathIdx = enemies.length % mapPaths.length;
      const p0 = mapPaths[pathIdx][0];
      const maxHp = Math.round(def.hp * item.scale);
      const maxShield = Math.round((def.shield || 0) * item.scale);
      enemies.push({
        type: item.type, name: def.name, boss: !!def.boss,
        pathIdx, wp: 1, x: p0[0], y: p0[1], progress: 0,
        hp: maxHp, maxHp, shield: maxShield, maxShield,
        speed: def.speed, reward: def.reward, livesCost: def.lives,
        r: def.r, color: def.color, armor: def.armor || 0,
        slowAmt: 0, slowTimer: 0, burnDps: 0, burnTimer: 0, hitFlash: 0, dead: false
      });
    }
  }

  // Update enemies
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) { enemies.splice(i, 1); continue; }
    if (e.hitFlash > 0) e.hitFlash -= dt;
    if (e.slowTimer > 0) { e.slowTimer -= dt; if (e.slowTimer <= 0) e.slowAmt = 0; }
    if (e.burnTimer > 0) {
      e.burnTimer -= dt;
      damageEnemy(e, e.burnDps * dt, { armorPierce: true });
      if (e.dead) { enemies.splice(i, 1); continue; }
    }

    const path = mapPaths[e.pathIdx];
    const target = path[e.wp];
    if (!target) {
      lives = Math.max(0, lives - e.livesCost);
      sfx.hurt();
      shake = 8;
      enemies.splice(i, 1);
      syncHud();
      if (lives <= 0) triggerEnd(false);
      continue;
    }
    const dx = target[0] - e.x, dy = target[1] - e.y;
    const dist = Math.hypot(dx, dy);
    const spd = e.speed * (1 - e.slowAmt);
    const step = spd * dt;
    if (dist <= step) {
      e.x = target[0]; e.y = target[1]; e.wp++; e.progress += dist;
    } else {
      e.x += (dx / dist) * step; e.y += (dy / dist) * step; e.progress += step;
    }
  }

  // Wave completion check
  if (waveActive && spawnQueue.length === 0 && enemies.length === 0) {
    waveActive = false;
    const bonus = 35 + wave * 12;
    cash += bonus;
    score += bonus * 10;
    saveBest(wave, score);
    addFloat(W / 2, 100, `✓ WAVE ${wave} CLEARED! +$${bonus}`, '#4ade80', 1.5);
    renderTowerDock();
    syncHud();
    if (wave === 20 && !endlessMode) {
      triggerEnd(true);
    } else if (autoWave) {
      setTimeout(() => { if (running && !gameOver && !waveActive && autoWave) startNextWave(); }, 1100);
    }
  }

  // Update towers
  const rateBoost = overdriveTimer > 0 ? 2.0 : 1.0;
  for (const t of towers) {
    if (t.flash > 0) t.flash -= dt;
    t.cooldown -= dt * rateBoost;
    if (t.cooldown > 0) continue;

    const target = pickTarget(t);
    if (!target) continue;

    t.angle = Math.atan2(target.y - t.y, target.x - t.x);
    t.cooldown = 1 / t.fireRate;
    t.flash = 0.1;
    sfx.shoot(t.id);

    if (t.id === 'cryo') {
      rings.push({ x: t.x, y: t.y, r: 12, maxR: t.range, color: '#38bdf8', life: 0.35, maxLife: 0.35 });
      for (const e of enemies) {
        if (!e.dead && Math.hypot(e.x - t.x, e.y - t.y) <= t.range) {
          damageEnemy(e, t.damage, { tower: t, slow: t.slow, slowDur: t.slowDur });
        }
      }
    } else if (t.id === 'tesla') {
      const hitSet = new Set([target]);
      const pts = [[t.x, t.y], [target.x, target.y]];
      damageEnemy(target, t.damage, { tower: t, tesla: true });
      let last = target;
      for (let c = 1; c < t.chains; c++) {
        let next = null, bestD = 120;
        for (const e of enemies) {
          if (e.dead || hitSet.has(e)) continue;
          const d = Math.hypot(e.x - last.x, e.y - last.y);
          if (d < bestD) { bestD = d; next = e; }
        }
        if (!next) break;
        hitSet.add(next);
        pts.push([next.x, next.y]);
        damageEnemy(next, t.damage * 0.82, { tower: t, tesla: true });
        last = next;
      }
      beams.push({ kind: 'tesla', pts, color: '#c084fc', life: 0.16, maxLife: 0.16 });
    } else if (t.id === 'railgun') {
      beams.push({ kind: 'rail', pts: [[t.x, t.y], [target.x, target.y]], color: '#fb7185', life: 0.2, maxLife: 0.2 });
      damageEnemy(target, t.damage, { tower: t, armorPierce: true });
      addSparks(target.x, target.y, '#fb7185', 8);
    } else {
      projs.push({
        x: t.x + Math.cos(t.angle) * 14, y: t.y + Math.sin(t.angle) * 14,
        tx: target.x, ty: target.y, target,
        speed: t.def.projSpeed || 450, damage: t.damage,
        splash: t.splash, burnDps: t.burnDps, burnDur: t.burnDur,
        color: t.def.accent, kind: t.id, tower: t
      });
    }
  }

  // Update projectiles
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i];
    if (p.target && !p.target.dead && p.kind === 'vulcan') { p.tx = p.target.x; p.ty = p.target.y; }
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const dist = Math.hypot(dx, dy);
    const step = p.speed * dt;
    if (dist <= step + 4) {
      if (p.splash > 0) {
        rings.push({ x: p.tx, y: p.ty, r: 6, maxR: p.splash, color: p.kind === 'brine' ? '#4ade80' : '#fb923c', life: 0.3, maxLife: 0.3 });
        addSparks(p.tx, p.ty, p.color, 10);
        if (p.kind === 'mortar') sfx.boom();
        for (const e of enemies) {
          if (!e.dead && Math.hypot(e.x - p.tx, e.y - p.ty) <= p.splash) {
            damageEnemy(e, p.damage, { tower: p.tower, burnDps: p.burnDps, burnDur: p.burnDur });
          }
        }
      } else if (p.target && !p.target.dead) {
        damageEnemy(p.target, p.damage, { tower: p.tower });
      }
      projs.splice(i, 1);
    } else {
      p.x += (dx / dist) * step; p.y += (dy / dist) * step;
    }
  }

  // FX updates
  for (let i = beams.length - 1; i >= 0; i--) { beams[i].life -= rawDt; if (beams[i].life <= 0) beams.splice(i, 1); }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.life -= rawDt;
    r.r = r.maxR * (1 - r.life / r.maxLife);
    if (r.life <= 0) rings.splice(i, 1);
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    floats[i].y -= 26 * rawDt; floats[i].life -= rawDt;
    if (floats[i].life <= 0) floats.splice(i, 1);
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i]; pt.x += pt.vx * rawDt; pt.y += pt.vy * rawDt; pt.life -= rawDt;
    if (pt.life <= 0) particles.splice(i, 1);
  }

  // Boss HP Bar & Ability Cooldown UI
  const boss = enemies.find(e => e.boss && !e.dead);
  if (boss) {
    $('boss-bar').classList.add('show');
    $('boss-name').textContent = boss.name;
    $('boss-hp-txt').textContent = `${Math.ceil(boss.hp)} / ${boss.maxHp}`;
    $('boss-fill').style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
  } else {
    $('boss-bar').classList.remove('show');
  }

  const updateAb = (id, key, cdEl) => {
    const v = Math.ceil(abCd[key]);
    $(id).disabled = v > 0;
    $(cdEl).textContent = v > 0 ? `${v}s` : 'READY';
  };
  updateAb('ab-airstrike', 'airstrike', 'cd-1');
  updateAb('ab-freeze', 'freeze', 'cd-2');
  updateAb('ab-overdrive', 'overdrive', 'cd-3');
}

function triggerEnd(victory) {
  gameOver = true;
  saveBest(wave, score);
  $('end-title').textContent = victory ? '🏆 FORTRESS VICTORIOUS!' : '💀 FORTRESS BREACHED';
  $('end-title').style.color = victory ? '#ffd666' : '#f43f5e';
  $('end-sub').textContent = victory
    ? `You defended ${curMap.name} through all 20 waves! Score: ${score.toLocaleString()}`
    : `Fell on Wave ${wave} at ${curMap.name}. Final Score: ${score.toLocaleString()}`;
  $('btn-endless').style.display = victory ? 'inline-flex' : 'none';
  $('modal-end').classList.add('open');
}

// ---------- Renderer ----------
function draw() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  // Map background + subtle tactical grid
  ctx.fillStyle = curMap.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // Decorative map props
  for (const pr of curMap.props) {
    const px = pr.x * W, py = pr.y * H;
    if (pr.type === 'pine') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(px + 4, py + 12, 16, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1f5e3b';
      ctx.beginPath(); ctx.moveTo(px, py - 20); ctx.lineTo(px - 15, py + 10); ctx.lineTo(px + 15, py + 10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e2f1ff';
      ctx.beginPath(); ctx.moveTo(px, py - 20); ctx.lineTo(px - 6, py - 8); ctx.lineTo(px + 6, py - 8); ctx.closePath(); ctx.fill();
    } else if (pr.type === 'lava') {
      ctx.fillStyle = 'rgba(249,115,22,0.28)';
      ctx.beginPath(); ctx.ellipse(px, py, 28, 18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fb923c';
      ctx.beginPath(); ctx.ellipse(px, py, 16, 10, 0, 0, Math.PI * 2); ctx.fill();
    } else if (pr.type === 'crystal') {
      ctx.fillStyle = 'rgba(168,85,247,0.35)';
      ctx.beginPath(); ctx.moveTo(px, py - 18); ctx.lineTo(px + 11, py + 6); ctx.lineTo(px - 11, py + 6); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = '#334155';
      ctx.beginPath(); ctx.ellipse(px, py, 18, 12, 0.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Paths (outer rim + inner road + center dashed chevrons)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const path of mapPaths) {
    ctx.strokeStyle = curMap.pathEdge;
    ctx.lineWidth = PATH_HALF_W * 2 + 5;
    ctx.beginPath(); path.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();

    ctx.strokeStyle = curMap.pathColor;
    ctx.lineWidth = PATH_HALF_W * 2 - 2;
    ctx.beginPath(); path.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 12]);
    ctx.beginPath(); path.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    ctx.setLineDash([]);

    // Fortress Core at path exit
    const end = path[path.length - 1];
    ctx.fillStyle = 'rgba(245,184,46,0.22)';
    ctx.beginPath(); ctx.arc(end[0] - 20, end[1], 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f5b82e';
    ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('🏰', end[0] - 20, end[1] + 8);
  }

  // Selected tower range circle
  if (selectedTower) {
    ctx.fillStyle = 'rgba(245,184,46,0.10)';
    ctx.strokeStyle = 'rgba(245,184,46,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(selectedTower.x, selectedTower.y, selectedTower.range, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  // Placement ghost
  if (buildType && hover.inside && !selectedTower) {
    const def = TOWERS[buildType];
    const ok = canPlaceAt(hover.x, hover.y) && cash >= def.cost;
    ctx.fillStyle = ok ? 'rgba(74,222,128,0.12)' : 'rgba(244,63,94,0.16)';
    ctx.strokeStyle = ok ? '#4ade80' : '#f43f5e';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(hover.x, hover.y, def.range, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(hover.x, hover.y, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  // Towers
  for (const t of towers) {
    ctx.save();
    ctx.translate(t.x, t.y);
    // Base shadow & octagonal pad
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.arc(2, 4, 19, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = overdriveTimer > 0 ? '#facc15' : t.def.color;
    ctx.lineWidth = selectedTower === t ? 3 : 2;
    ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // Rotating turret head
    ctx.save();
    ctx.rotate(t.angle);
    ctx.fillStyle = t.def.color;
    if (t.id === 'railgun') {
      ctx.fillRect(0, -3, 24, 6);
    } else if (t.id === 'vulcan') {
      ctx.fillRect(2, -6, 17, 4);
      ctx.fillRect(2, 2, 17, 4);
    } else if (t.id === 'mortar' || t.id === 'brine') {
      ctx.fillRect(-4, -7, 20, 14);
    } else {
      ctx.fillRect(0, -4, 16, 8);
    }
    ctx.fillStyle = t.flash > 0 ? '#fff' : t.def.accent;
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Level stars
    if (t.level > 0) {
      ctx.fillStyle = '#ffd666';
      ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('★'.repeat(t.level), 0, -21);
    }
    ctx.restore();
  }

  // Shockwave rings
  for (const r of rings) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, r.life / r.maxLife);
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // Enemies
  for (const e of enemies) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(0, e.r * 0.75, e.r * 0.9, e.r * 0.45, 0, 0, Math.PI * 2); ctx.fill();

    // Body
    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : (e.slowTimer > 0 ? '#7dd3fc' : e.color);
    ctx.strokeStyle = '#090d14';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // Boss crown
    if (e.boss) {
      ctx.font = '18px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('👑', 0, -e.r - 4);
    }
    // Shield ring
    if (e.shield > 0) {
      ctx.strokeStyle = '#c084fc'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, e.r + 3.5, 0, Math.PI * 2); ctx.stroke();
    }
    // Acid burn dot
    if (e.burnTimer > 0) {
      ctx.fillStyle = '#4ade80';
      ctx.beginPath(); ctx.arc(e.r * 0.5, -e.r * 0.5, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    // Mini HP bar
    const bw = e.r * 2.1;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(-bw / 2, -e.r - 8, bw, 4);
    ctx.fillStyle = e.boss ? '#4ade80' : '#f43f5e';
    ctx.fillRect(-bw / 2, -e.r - 8, bw * Math.max(0, e.hp / e.maxHp), 4);
    ctx.restore();
  }

  // Projectiles
  for (const p of projs) {
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.kind === 'mortar' || p.kind === 'brine' ? 5.5 : 3.5, 0, Math.PI * 2); ctx.fill();
  }

  // Lightning & Railgun beams
  for (const b of beams) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, b.life / b.maxLife);
    ctx.strokeStyle = b.color;
    ctx.lineWidth = b.kind === 'rail' ? 4 : 2.5;
    ctx.beginPath();
    b.pts.forEach(([x, y], i) => {
      const jx = b.kind === 'tesla' && i > 0 ? (Math.random() - 0.5) * 10 : 0;
      const jy = b.kind === 'tesla' && i > 0 ? (Math.random() - 0.5) * 10 : 0;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x + jx, y + jy);
    });
    ctx.stroke();
    ctx.restore();
  }

  // Particles & Floating text
  for (const pt of particles) {
    ctx.globalAlpha = Math.max(0, pt.life * 2);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.font = '800 13px system-ui, sans-serif'; ctx.textAlign = 'center';
  for (const f of floats) {
    ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
    ctx.fillStyle = '#000'; ctx.fillText(f.text, f.x + 1, f.y + 1);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ---------- UI Wiring ----------
function syncHud() {
  $('hud-cash').textContent = `💰 $${cash}`;
  $('hud-lives').textContent = `❤ ${lives}`;
  $('hud-wave').textContent = endlessMode ? `🌊 Wave ${wave} (∞)` : `🌊 Wave ${wave} / 20`;
  $('hud-score').textContent = `★ ${score.toLocaleString()}`;
  const nw = $('btn-next-wave');
  nw.disabled = waveActive || gameOver;
  nw.textContent = waveActive ? `⚔ Wave ${wave} Active` : `▶ Start Wave ${wave + 1}`;
  $('best-record').textContent = `Best Wave: ${bestRecord.wave} · High Score: ${bestRecord.score.toLocaleString()}`;
}

function renderTowerDock() {
  const dock = $('tower-dock');
  dock.innerHTML = '';
  for (const id of TOWER_ORDER) {
    const t = TOWERS[id];
    const btn = document.createElement('button');
    btn.className = 't-card' + (buildType === id ? ' selected' : '');
    btn.disabled = cash < t.cost;
    btn.title = t.desc;
    btn.innerHTML = `<span class="t-ic">${t.icon}</span><div><strong>${t.name}</strong><small>$${t.cost}</small></div>`;
    btn.onclick = () => {
      closeInspector();
      buildType = buildType === id ? null : id;
      renderTowerDock();
    };
    dock.appendChild(btn);
  }
}

function renderMapGrid() {
  const grid = $('map-grid');
  grid.innerHTML = '';
  MAPS.forEach((m, idx) => {
    const b = document.createElement('button');
    b.className = 'map-opt' + (selectedMapIdx === idx ? ' active' : '');
    b.innerHTML = `<h3>${m.name}</h3><span class="diff">${m.difficulty} · $${m.startCash}</span><p>${m.desc}</p>`;
    b.onclick = () => { selectedMapIdx = idx; renderMapGrid(); };
    grid.appendChild(b);
  });
}

function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * W,
    y: ((e.clientY - rect.top) / rect.height) * H
  };
}

canvas.addEventListener('mousemove', (e) => {
  const p = getCanvasCoords(e);
  hover.x = p.x; hover.y = p.y; hover.inside = true;
});
canvas.addEventListener('mouseleave', () => { hover.inside = false; });
canvas.addEventListener('click', (e) => {
  if (!running || gameOver) return;
  const p = getCanvasCoords(e);
  // Check existing tower click
  for (const t of towers) {
    if (Math.hypot(t.x - p.x, t.y - p.y) < 22) {
      buildType = null;
      renderTowerDock();
      openInspector(t);
      return;
    }
  }
  if (buildType) {
    placeTower(buildType, p.x, p.y);
  } else {
    closeInspector();
  }
});

$('insp-close').onclick = closeInspector;
$('insp-target').onclick = () => {
  if (!selectedTower) return;
  const order = ['first', 'strongest', 'closest'];
  selectedTower.targetMode = order[(order.indexOf(selectedTower.targetMode) + 1) % order.length];
  openInspector(selectedTower);
};
$('insp-upgrade').onclick = () => {
  if (!selectedTower) return;
  const up = selectedTower.def.upgrades[selectedTower.level];
  if (!up || cash < up.cost) return;
  cash -= up.cost;
  selectedTower.spent += up.cost;
  selectedTower.level++;
  selectedTower.damage *= up.dmgMult;
  selectedTower.fireRate *= up.rateMult;
  selectedTower.range += up.rangeAdd || 0;
  selectedTower.splash += up.splashAdd || 0;
  selectedTower.slow += up.slowAdd || 0;
  selectedTower.chains += up.chainsAdd || 0;
  sfx.upgrade();
  addSparks(selectedTower.x, selectedTower.y, '#ffd666', 14);
  openInspector(selectedTower);
  renderTowerDock();
  syncHud();
};
$('insp-sell').onclick = () => {
  if (!selectedTower) return;
  const refund = Math.round(selectedTower.spent * 0.75);
  cash += refund;
  towers = towers.filter(t => t !== selectedTower);
  sfx.sell();
  closeInspector();
  renderTowerDock();
  syncHud();
};

$('btn-next-wave').onclick = startNextWave;
$('btn-auto').onclick = () => {
  autoWave = !autoWave;
  $('btn-auto').textContent = autoWave ? 'Auto: ON' : 'Auto: OFF';
  $('btn-auto').classList.toggle('active', autoWave);
  if (autoWave && !waveActive && running && !gameOver) startNextWave();
};
[1, 2, 3].forEach(s => {
  $(`btn-spd-${s}`).onclick = () => {
    speed = s;
    [1, 2, 3].forEach(k => $(`btn-spd-${k}`).classList.toggle('active', k === s));
  };
});
$('btn-mute').onclick = () => {
  sfx.muted = !sfx.muted;
  $('btn-mute').textContent = sfx.muted ? '🔇' : '🔊';
};
$('btn-menu').onclick = () => { renderMapGrid(); syncHud(); $('modal-title').classList.add('open'); };
$('btn-deploy').onclick = () => startMap(selectedMapIdx);
$('btn-restart').onclick = () => startMap(selectedMapIdx);
$('btn-end-maps').onclick = () => { $('modal-end').classList.remove('open'); renderMapGrid(); $('modal-title').classList.add('open'); };
$('btn-endless').onclick = () => { endlessMode = true; gameOver = false; $('modal-end').classList.remove('open'); syncHud(); };

$('ab-airstrike').onclick = useAirstrike;
$('ab-freeze').onclick = useFreeze;
$('ab-overdrive').onclick = useOverdrive;

window.addEventListener('keydown', (e) => {
  if (!running || gameOver) return;
  if (e.key === '1') useAirstrike();
  else if (e.key === '2') useFreeze();
  else if (e.key === '3') useOverdrive();
  else if (e.code === 'Space') { e.preventDefault(); startNextWave(); }
  else if (e.key === 'Escape') { buildType = null; closeInspector(); renderTowerDock(); }
});

// Init
renderMapGrid();
renderTowerDock();
syncHud();
mapPaths = MAPS[0].paths.map(p => p.map(([nx, ny]) => [nx * W, ny * H]));

let last = performance.now();
function loop(now) {
  const dt = (now - last) / 1000;
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.DillyFortress = {
  startMap,
  startNextWave,
  placeTower,
  getState: () => ({ wave, cash, lives, score, towers: towers.length, enemies: enemies.length })
};
