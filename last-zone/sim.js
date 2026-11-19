// DILLION: LAST ZONE - match simulation. Pure game state + fixed-step update, no THREE/DOM.
// Everything a player (human or bot) does arrives as an input struct in p.inp, so the same code
// can later run on an authoritative server. Outputs are state + an event queue (M.events).
import { clamp, lerp, wrapA, mulberry32 } from "./util.js";
import { WEAPONS, WEAPON_IDS, AMMO, ITEMS, RARITY, LOOT_TIERS, WEAPON_WEIGHTS, GAS_STAGES, GAS_START_R, PLATE_HP, PLATE_TIME, MAX_HP, CALLSIGNS } from "./data.js";
import { terrainH, groundAt, collideCyl, ceilingAt, raycast, losClear, SEA, SURF, surfaceAt, POI } from "./world.js";

export const DT = 1 / 60;
const D2R = Math.PI / 180;
const GRAV = 22, JUMP_V = 6.2, RAD = 0.36;
export const STAND_H = 1.8, CROUCH_H = 1.25;

export function emptyInput() {
  return { mx: 0, mz: 0, yaw: 0, pitch: 0, fire: false, ads: false, sprint: false, crouch: false, jump: false, reload: false, interact: false, melee: false, slot: -1, heal: null, throw: null, plateHold: false };
}

export function createMatch(W, opts = {}) {
  const seed = (opts.seed != null ? opts.seed : (Math.random() * 2 ** 31) | 0) >>> 0;
  const M = {
    W, seed, rng: mulberry32(seed), lrng: mulberry32(seed ^ 0x51ed), t: 0, mode: opts.mode || "br", phase: "plane",
    players: [], items: [], igrid: new Map(), crates: [], proj: [], smokes: [], sounds: [], events: [], nextId: 1, alive: 0, over: false, winner: null,
    infAmmo: !!opts.infAmmo, gasOn: opts.mode !== "range", diff: opts.difficulty || "normal", stats: { shots: 0 }
  };
  // crates + floor loot from the world's spawn points (deterministic from seed)
  for (const c of W.crates) M.crates.push({ id: M.crates.length, x: c.x, y: c.y, z: c.z, tier: c.tier, open: false });
  if (M.mode === "br") {
    const pc = M.lrng.int(0, M.crates.length - 1); M.crates[pc].pickle = true;
    for (const s of W.loot) { if (M.lrng() < 0.78) spawnLootAt(M, s.x, s.y, s.z, s.tier, true); }
    makePlane(M);
    initGas(M);
  }
  return M;
}

// ---------------------------------------------------------------------------------------------
// players
export function addPlayer(M, name, o = {}) {
  const p = {
    id: M.nextId++, name, bot: !!o.bot, human: !!o.human, target: !!o.target, x: o.x || 0, y: o.y || 0, z: o.z || 0, vx: 0, vy: 0, vz: 0, yaw: o.yaw || 0, pitch: 0,
    st: o.st || "plane", onGround: false, crouch: false, sprint: false, ads: false, adsT: 0, swim: false, moveSpd: 0,
    hp: MAX_HP, pl: [0, 0, 0], inv: { w: [null, null], slot: 0, ammo: { light: 0, heavy: 0, shell: 0, sniper: 0 }, plate: 0, bandage: 0, medkit: 0, frag: 0, smoke: 0, pickle: 0 },
    cd: 0, bloom: 0, recP: 0, recY: 0, shotN: 0, trig: false, act: null, meleeCd: 0, throwCd: 0, swapT: 0,
    kills: 0, dmg: 0, place: 0, deathT: 0, spawnT: M.t, lastAtk: null, lastAtkT: -99, fallT: 0, chuteT: 0, opened: false, landT: -9, lastShotT: -99, lastHitT: -99, autoT: 0, gasT: 0,
    god: false, inp: emptyInput(), home: o.home || null, strafe: o.strafe || 0, ai: null, col: o.col || 0, hurtT: -9, fireT: -9
  };
  M.players.push(p);
  if (!p.target) M.alive++;
  return p;
}
export const isAlive = (p) => p.st !== "dead";
export function eyeY(p) { return p.y + (p.st === "ground" ? (p.crouch ? 1.15 : 1.62) : 1.5); }
export function curWeapon(p) { const s = p.inv.slot; return s < 2 ? p.inv.w[s] : null; }
export function armor(p) { return p.pl[0] + p.pl[1] + p.pl[2]; }
function ev(M, type, o) { o.type = type; o.t = M.t; M.events.push(o); if (M.events.length > 4000) M.events.splice(0, 1000); return o; }

// ---------------------------------------------------------------------------------------------
// plane
function makePlane(M) {
  const r = M.rng, ang = r() * Math.PI * 2, rr = Math.sqrt(r()) * 260, ca = Math.cos(ang), sa = Math.sin(ang);
  const px = Math.cos(ang + 1.3) * rr, pz = Math.sin(ang + 1.3) * rr;
  M.plane = { ax: px - ca * 1350, az: pz - sa * 1350, dx: ca, dz: sa, len: 2700, s: 0, speed: 72, y: 470, x: 0, z: 0, gone: false, eject: 2700 - 330 };
  planePos(M);
}
function planePos(M) { const P = M.plane; P.x = P.ax + P.dx * P.s; P.z = P.az + P.dz * P.s; }

// ---------------------------------------------------------------------------------------------
// loot
const icell = (x, z) => ((Math.floor(x / 8) + 4096) << 13) | (Math.floor(z / 8) + 4096);
export function addItem(M, it) {
  it.id = M.nextId++; it.gone = false; M.items.push(it);
  const k = icell(it.x, it.z); let L = M.igrid.get(k); if (!L) M.igrid.set(k, (L = [])); L.push(it);
  ev(M, "item", { item: it });
  return it;
}
function removeItem(M, it) {
  it.gone = true; const L = M.igrid.get(icell(it.x, it.z)); if (L) { const i = L.indexOf(it); if (i >= 0) L.splice(i, 1); }
  ev(M, "itemGone", { item: it });
  if (it.rack) setTimeout0(M, 6, () => { const n = Object.assign({}, it); delete n.id; addItem(M, n); });
}
const timers = new WeakMap();
function setTimeout0(M, delay, fn) { (M.timers = M.timers || []).push({ t: M.t + delay, fn }); }
export function itemsNear(M, x, z, rad, out = []) {
  out.length = 0;
  for (let i = Math.floor((x - rad) / 8); i <= Math.floor((x + rad) / 8); i++) for (let j = Math.floor((z - rad) / 8); j <= Math.floor((z + rad) / 8); j++) {
    const L = M.igrid.get(((i + 4096) << 13) | (j + 4096)); if (!L) continue;
    for (const it of L) if ((it.x - x) ** 2 + (it.z - z) ** 2 < rad * rad) out.push(it);
  }
  return out;
}
export function makeLoot(rng, tier, kindForce) {
  const T = LOOT_TIERS[tier] || LOOT_TIERS[1];
  const k = kindForce || rng.weighted(T.kind);
  if (k === "weapon") { const w = rng.weighted(WEAPON_WEIGHTS); return { k, w, r: rng.weighted(T.rarity), mag: WEAPONS[w].mag }; }
  if (k === "ammo") { const a = rng.pick(Object.keys(AMMO)); return { k, a, n: AMMO[a].pickup }; }
  if (k === "plate") return { k, n: rng() < 0.4 ? 2 : 1 };
  return { k, n: 1 };
}
function spawnLootAt(M, x, y, z, tier, withAmmo) {
  const it = makeLoot(M.lrng, tier); Object.assign(it, { x, y, z }); addItem(M, it);
  if (it.k === "weapon" && withAmmo) addItem(M, { k: "ammo", a: WEAPONS[it.w].ammo, n: AMMO[WEAPONS[it.w].ammo].pickup, x: x + 0.7, y, z: z + 0.4 });
}
function openCrate(M, c, p) {
  c.open = true; const r = M.lrng; const n = 3 + (c.tier >= 3 ? 1 : 0);
  const ring = (k) => { const a = k / (n + 1) * Math.PI * 2 + 0.4; return [c.x + Math.cos(a) * 1.3, c.z + Math.sin(a) * 1.3]; };
  const tier = Math.min(4, c.tier + 1);
  const list = [makeLoot(r, tier, "weapon"), makeLoot(r, tier, "plate"), makeLoot(r, tier)];
  if (n > 3) list.push(makeLoot(r, tier, r() < 0.5 ? "medkit" : "frag"));
  list.splice(1, 0, { k: "ammo", a: WEAPONS[list[0].w].ammo, n: AMMO[WEAPONS[list[0].w].ammo].pickup * 2 });
  if (c.pickle) list.push({ k: "pickle", n: 1 });
  list.forEach((it, k) => { const [x, z] = ring(k); Object.assign(it, { x, y: groundAt(M.W, x, z, c.y + 1), z }); addItem(M, it); });
  ev(M, "crate", { crate: c, pid: p ? p.id : 0 });
}
function giveWeapon(M, p, it) {
  const inv = p.inv; let s = inv.w[0] == null ? 0 : inv.w[1] == null ? 1 : (inv.slot < 2 ? inv.slot : 0);
  const old = inv.w[s];
  if (old) dropItem(M, p, { k: "weapon", w: old.id, r: old.r, mag: old.mag });
  inv.w[s] = { id: it.w, r: it.r || 0, mag: it.mag != null ? it.mag : WEAPONS[it.w].mag };
  inv.slot = s; p.act = null; p.swapT = 0.5; p.cd = Math.max(p.cd, 0.35);
}
function dropItem(M, p, it, k = 0) {
  const a = p.yaw + 2.2 + k * 0.9, x = p.x - Math.sin(a) * 1.2, z = p.z - Math.cos(a) * 1.2;
  Object.assign(it, { x, y: groundAt(M.W, x, z, p.y + 1), z }); addItem(M, it);
}
// returns true if any of it was taken
function takeItem(M, p, it) {
  const inv = p.inv;
  if (it.k === "weapon") { giveWeapon(M, p, it); removeItem(M, it); ev(M, "pickup", { pid: p.id, item: it }); return true; }
  if (it.k === "ammo") { const max = AMMO[it.a].max, room = max - inv.ammo[it.a]; if (room <= 0) return false; const n = Math.min(room, it.n); inv.ammo[it.a] += n; it.n -= n; }
  else { const max = ITEMS[it.k].max, room = max - inv[it.k]; if (room <= 0) return false; const n = Math.min(room, it.n); inv[it.k] += n; it.n -= n; }
  ev(M, "pickup", { pid: p.id, item: it });
  if (it.k === "pickle") ev(M, "pickle", { pid: p.id });
  if (it.n <= 0) removeItem(M, it); else ev(M, "itemChanged", { item: it });
  return true;
}
const _items = [];
export function bestInteract(M, p) {
  // crate first, then the item closest to the aim line
  let best = null, bs = 1e9;
  for (const c of M.crates) { if (c.open) continue; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < 2.6 && Math.abs(c.y - p.y) < 2 && d < bs) { bs = d; best = { crate: c }; } }
  if (best) return best;
  itemsNear(M, p.x, p.z, 2.6, _items);
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  for (const it of _items) { if (Math.abs(it.y - p.y) > 2.2) continue; const dx = it.x - p.x, dz = it.z - p.z, d = Math.hypot(dx, dz); const sc = d - (dx * fx + dz * fz) / Math.max(d, 0.01) * 0.8 + (it.k === "weapon" ? -0.3 : 0); if (sc < bs) { bs = sc; best = { item: it }; } }
  return best;
}
function dropAll(M, p) {
  const inv = p.inv, list = [];
  for (const w of inv.w) if (w) list.push({ k: "weapon", w: w.id, r: w.r, mag: w.mag });
  for (const a in inv.ammo) if (inv.ammo[a] > 0) list.push({ k: "ammo", a, n: inv.ammo[a] });
  for (const k of ["plate", "bandage", "medkit", "frag", "smoke"]) if (inv[k] > 0) list.push({ k, n: inv[k] });
  if (p.bot && list.length < 3) list.push({ k: "plate", n: 1 });
  list.forEach((it, k) => { const a = k / list.length * Math.PI * 2, rr = 1.0 + (k % 2) * 0.6; const x = p.x + Math.cos(a) * rr, z = p.z + Math.sin(a) * rr; Object.assign(it, { x, y: groundAt(M.W, x, z, p.y + 1.5), z }); addItem(M, it); });
  inv.w = [null, null]; for (const a in inv.ammo) inv.ammo[a] = 0; for (const k of ["plate", "bandage", "medkit", "frag", "smoke"]) inv[k] = 0;
}

// ---------------------------------------------------------------------------------------------
// gas
function initGas(M) {
  M.gas = { st: 0, ph: "wait", t: GAS_STAGES[0].wait, dur: GAS_STAGES[0].wait, cx: 0, cz: 0, r: GAS_START_R, ox: 0, oz: 0, or: GAS_START_R, nx: 0, nz: 0, nr: 0, dps: 1 };
  chooseNext(M);
}
function chooseNext(M) {
  const g = M.gas, S = GAS_STAGES[g.st], r = M.rng; let best = null;
  for (let k = 0; k < 40; k++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * Math.max(0, g.r - S.r) * (g.st === 0 ? 0.55 : 0.92);
    const x = g.cx + Math.cos(a) * d, z = g.cz + Math.sin(a) * d;
    best = [x, z]; if (terrainH(M.W, x, z) > 1.5 && Math.hypot(x, z) < 700) break;
  }
  g.nx = best[0]; g.nz = best[1]; g.nr = S.r;
}
function updateGas(M, dt) {
  const g = M.gas; if (!g || !M.gasOn) return;
  g.t -= dt;
  if (g.ph === "wait" && g.t <= 0) { const S = GAS_STAGES[g.st]; g.ph = "shrink"; g.t = g.dur = S.shrink; g.ox = g.cx; g.oz = g.cz; g.or = g.r; g.dps = S.dps; ev(M, "gasShrink", { st: g.st }); }
  if (g.ph === "shrink") {
    const k = clamp(1 - g.t / g.dur, 0, 1);
    g.cx = lerp(g.ox, g.nx, k); g.cz = lerp(g.oz, g.nz, k); g.r = lerp(g.or, g.nr, k);
    if (g.t <= 0) {
      g.st++;
      if (g.st < GAS_STAGES.length) { const S = GAS_STAGES[g.st]; g.ph = "wait"; g.t = g.dur = S.wait; chooseNext(M); ev(M, "gasStage", { st: g.st }); }
      else { g.ph = "done"; g.t = 0; g.dps = GAS_STAGES[GAS_STAGES.length - 1].dps * 1.5; }
    }
  }
  for (const p of M.players) {
    if (p.st === "dead" || p.st === "plane" || p.target) continue;
    const out = Math.hypot(p.x - g.cx, p.z - g.cz) > g.r;
    p.inGas = out;
    if (out) { p.gasT += dt; if (p.gasT >= 0.5) { p.gasT -= 0.5; damage(M, p, Math.max(1, g.dps) * 0.5, null, "gas", "body"); } } else p.gasT = 0;
  }
}
export function forceGasStage(M, st) {
  const g = M.gas; if (!g) return;
  while (g.st < st && g.ph !== "done") { if (g.ph === "wait") g.t = 0; else { g.t = 0; } updateGas(M, 0.0001); updateGas(M, 0.0001); }
}

// ---------------------------------------------------------------------------------------------
// damage
export function damage(M, p, amt, atk, wid, zone, hx, hy, hz) {
  if (p.st === "dead" || amt <= 0) return 0;
  if (p.god) { ev(M, "hit", { pid: p.id, by: atk ? atk.id : 0, dmg: amt, zone, armor: false, kill: false, x: hx, y: hy, z: hz, wid }); return 0; }
  let rem = amt, broke = false, armorHit = false;
  if (wid !== "gas") for (let i = 2; i >= 0 && rem > 0; i--) { if (p.pl[i] > 0) { armorHit = true; const take = Math.min(p.pl[i], rem); p.pl[i] -= take; rem -= take; if (p.pl[i] <= 0) { broke = true; } } }
  p.hp -= rem; p.hurtT = M.t;
  if (atk && atk !== p) { p.lastAtk = atk.id; p.lastAtkT = M.t; atk.dmg += amt; atk.lastHitT = M.t; }
  const kill = p.hp <= 0;
  ev(M, "hit", { pid: p.id, by: atk ? atk.id : 0, dmg: amt, zone, armor: armorHit, broke, kill, x: hx, y: hy, z: hz, wid, ax: atk ? atk.x : p.x, az: atk ? atk.z : p.z });
  if (p.act && p.act.k !== "reload" && wid !== "gas") p.act = null; // interrupted healing
  if (kill) killPlayer(M, p, atk, wid, zone === "head");
  return amt;
}
function killPlayer(M, p, atk, wid, head) {
  p.hp = 0; p.st = "dead"; p.deathT = M.t; p.act = null; p.ads = false;
  if (!atk && p.lastAtk && M.t - p.lastAtkT < 10) atk = M.players.find((q) => q.id === p.lastAtk);
  if (atk && atk !== p) atk.kills++;
  if (!p.target) { p.place = M.alive; M.alive--; dropAll(M, p); }
  else setTimeout0(M, 2.5, () => respawnTarget(M, p));
  ev(M, "kill", { pid: p.id, by: atk ? atk.id : 0, wid, head, x: p.x, y: p.y, z: p.z, alive: M.alive });
  if (M.mode === "br" && !M.over && M.alive <= 1) {
    M.over = true; M.winner = M.players.find((q) => q.st !== "dead" && !q.target) || null;
    if (M.winner) M.winner.place = 1;
    ev(M, "win", { pid: M.winner ? M.winner.id : 0 });
  }
}
function respawnTarget(M, p) {
  Object.assign(p, { st: "ground", hp: MAX_HP, x: p.home.x, y: p.home.y, z: p.home.z, vx: 0, vy: 0, vz: 0 }); p.pl = p.home.pl.slice();
  ev(M, "respawn", { pid: p.id });
}
export function plateMax(p) { return p.pl.every((v) => v >= PLATE_HP); }

// capsule hit zones (server-style hitscan)
const ZONES = [["head", 0.15], ["body", 0.27], ["legs", 0.2]];
function rayPlayer(ox, oy, oz, dx, dy, dz, p, maxT) {
  const h = p.st === "ground" && p.crouch ? CROUCH_H : STAND_H;
  const cx = p.x, cz = p.z, by = p.y;
  // broad phase: distance from ray to the body's vertical axis
  const tx = cx - ox, tz = cz - oz, ty = by + h * 0.5 - oy;
  const tc = tx * dx + ty * dy + tz * dz; if (tc < -1 || tc > maxT + 1) return null;
  const px = ox + dx * tc - cx, py = oy + dy * tc - (by + h * 0.5), pz = oz + dz * tc - cz;
  if (px * px + pz * pz > 1.2 || Math.abs(py) > h) return null;
  let best = null;
  // head sphere
  { const hy = by + h * 0.91, r = 0.15; const t = raySphere(ox, oy, oz, dx, dy, dz, cx, hy, cz, r); if (t != null && t < maxT) best = { t, zone: "head" }; }
  { const t = rayCapsule(ox, oy, oz, dx, dy, dz, cx, by + h * 0.5, cz, by + h * 0.78, 0.27); if (t != null && t < maxT && (!best || t < best.t)) best = { t, zone: "body" }; }
  { const t = rayCapsule(ox, oy, oz, dx, dy, dz, cx, by + 0.12, cz, by + h * 0.48, 0.2); if (t != null && t < maxT && (!best || t < best.t)) best = { t, zone: "legs" }; }
  return best;
}
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = ox - cx, ly = oy - cy, lz = oz - cz; const b = lx * dx + ly * dy + lz * dz, c = lx * lx + ly * ly + lz * lz - r * r;
  const disc = b * b - c; if (disc < 0) return null; const t = -b - Math.sqrt(disc); return t > 0 ? t : null;
}
function rayCapsule(ox, oy, oz, dx, dy, dz, cx, y0, cz, y1, r) {
  // vertical capsule: infinite cylinder test in xz then clamp, plus end spheres
  const lx = ox - cx, lz = oz - cz; const a = dx * dx + dz * dz; let best = null;
  if (a > 1e-9) {
    const b = lx * dx + lz * dz, c = lx * lx + lz * lz - r * r, disc = b * b - a * c;
    if (disc >= 0) { const t = (-b - Math.sqrt(disc)) / a; const y = oy + dy * t; if (t > 0 && y >= y0 && y <= y1) best = t; }
  }
  for (const yy of [y0, y1]) { const t = raySphere(ox, oy, oz, dx, dy, dz, cx, yy, cz, r); if (t != null && (best == null || t < best)) best = t; }
  return best;
}
export function traceShot(M, shooter, ox, oy, oz, dx, dy, dz, range) {
  const w = raycast(M.W, ox, oy, oz, dx, dy, dz, range);
  let maxT = w ? w.t : range, hitP = null, zone = null;
  for (const q of M.players) {
    if (q === shooter || q.st === "dead" || q.st === "plane") continue;
    const h = rayPlayer(ox, oy, oz, dx, dy, dz, q, maxT);
    if (h && h.t < maxT) { maxT = h.t; hitP = q; zone = h.zone; }
  }
  // smoke does not stop bullets, but we report it for tracers
  return { t: maxT, p: hitP, zone, w: hitP ? null : w, x: ox + dx * maxT, y: oy + dy * maxT, z: oz + dz * maxT };
}

// ---------------------------------------------------------------------------------------------
// weapons
function spreadDeg(p, W) {
  const R = RARITY[p.inv.w[p.inv.slot].r];
  let s = lerp(W.hip, W.ads, p.adsT);
  if (p.moveSpd > 1) s += p.adsT > 0.5 ? 0.5 : W.hip * 0.45;
  if (!p.onGround) s += 2.5;
  if (p.crouch) s *= 0.8;
  return s * R.ctl + p.bloom;
}
export function currentSpread(p) { const w = curWeapon(p); return w ? spreadDeg(p, WEAPONS[w.id]) : 0; }
function fire(M, p, w) {
  const W = WEAPONS[w.id], R = RARITY[w.r];
  p.cd = 60 / W.rpm; if (!(M.infAmmo && p.human)) w.mag--; else w.mag = Math.max(w.mag - 1, 0) || W.mag;
  p.shotN++; p.lastShotT = M.t; p.fireT = M.t;
  const yaw = p.yaw + p.recY, pitch = p.pitch + p.recP, ex = p.x, ey = eyeY(p), ez = p.z;
  const sp = spreadDeg(p, W) * D2R, pel = W.pellets || 1, rng = M.rng;
  let anyHit = false;
  for (let k = 0; k < pel; k++) {
    const a = rng() * Math.PI * 2, rr = sp * Math.sqrt(rng());
    const yy = yaw + Math.cos(a) * rr, pp = pitch + Math.sin(a) * rr;
    const cp = Math.cos(pp), dx = -Math.sin(yy) * cp, dy = Math.sin(pp), dz = -Math.cos(yy) * cp;
    const h = traceShot(M, p, ex, ey, ez, dx, dy, dz, 650);
    let hitInfo = null;
    if (h.p) {
      const fall = h.t <= W.r0 ? 1 : h.t >= W.r1 ? W.minMul : lerp(1, W.minMul, (h.t - W.r0) / (W.r1 - W.r0));
      const zm = h.zone === "head" ? W.hs : h.zone === "legs" ? 0.85 : 1;
      const dmg = Math.round(W.dmg * R.dmg * fall * zm * 10) / 10;
      damage(M, h.p, dmg, p, w.id, h.zone, h.x, h.y, h.z); anyHit = true; hitInfo = h.p.id;
    }
    ev(M, "shot", { pid: p.id, wid: w.id, k, ox: ex, oy: ey, oz: ez, x: h.x, y: h.y, z: h.z, hp: hitInfo, s: h.w ? h.w.s : -1, nx: h.w ? h.w.nx : 0, ny: h.w ? h.w.ny : 1, nz: h.w ? h.w.nz : 0, miss: !h.w && !h.p });
  }
  ev(M, "fire", { pid: p.id, wid: w.id, x: ex, y: ey, z: ez });
  M.sounds.push({ x: ex, z: ez, t: M.t, pid: p.id, loud: W.cls === "Sniper" || W.cls === "Shotgun" ? 1.4 : 1 });
  // recoil (degrees -> radians) and bloom
  const ctl = R.ctl * (p.adsT > 0.5 ? 0.8 : 1) * (p.crouch ? 0.85 : 1);
  p.recP += W.rec[0] * ctl * (0.85 + rng() * 0.3) * D2R;
  p.recY += W.rec[1 + (p.shotN % (W.rec.length - 1))] * ctl * D2R;
  p.bloom = Math.min(W.bloomMax, p.bloom + W.bloom);
  M.stats.shots++;
}
function updateWeapon(M, p, inp, dt) {
  p.cd -= dt; p.meleeCd -= dt; p.throwCd -= dt; p.swapT -= dt;
  const firingRecently = M.t - p.lastShotT < 0.25;
  p.bloom = Math.max(0, p.bloom - dt * (firingRecently ? 1.2 : 5));
  const rk = Math.exp(-dt * (firingRecently ? 1.8 : 6.5)); p.recP *= rk; p.recY *= rk;
  const inv = p.inv;
  if (inp.slot >= 0 && inp.slot <= 2 && inp.slot !== inv.slot) { inv.slot = inp.slot; if (p.act && p.act.k === "reload") p.act = null; p.swapT = 0.45; p.cd = Math.max(p.cd, 0.35); p.shotN = 0; ev(M, "swap", { pid: p.id, slot: inv.slot }); }
  const w = curWeapon(p), canUse = p.st === "ground" && !p.swim;
  p.ads = !!(inp.ads && canUse && (w || inv.slot === 2) && (!p.act || p.act.k === "reload")) && inv.slot !== 2;
  p.adsT = clamp(p.adsT + (p.ads ? dt / 0.2 : -dt / 0.15), 0, 1);
  // actions in progress
  if (p.act) {
    p.act.t += dt;
    if (p.act.t >= p.act.dur) {
      const a = p.act; p.act = null;
      if (a.k === "reload" && w) { const W = WEAPONS[w.id]; const need = W.mag - w.mag, have = M.infAmmo && p.human ? need : inv.ammo[W.ammo]; const n = Math.min(need, have); w.mag += n; if (!(M.infAmmo && p.human)) inv.ammo[W.ammo] -= n; ev(M, "reloaded", { pid: p.id }); }
      if (a.k === "plate") { const i = p.pl.findIndex((v) => v < PLATE_HP); if (i >= 0 && inv.plate > 0) { p.pl[i] = PLATE_HP; inv.plate--; ev(M, "plated", { pid: p.id, n: i }); } if (inp.plateHold && inv.plate > 0 && !plateMax(p)) startAct(M, p, "plate"); }
      if (a.k === "bandage") { inv.bandage--; p.hp = Math.min(MAX_HP, p.hp + ITEMS.bandage.heal); ev(M, "healed", { pid: p.id }); }
      if (a.k === "medkit") { inv.medkit--; p.hp = MAX_HP; ev(M, "healed", { pid: p.id }); }
    }
  }
  if (!canUse) { p.trig = inp.fire; return; }
  // heal / plate requests
  if (inp.heal) {
    const k = inp.heal;
    if (k === "plate" && inv.plate > 0 && !plateMax(p)) startAct(M, p, "plate");
    else if ((k === "bandage" || k === "medkit") && inv[k] > 0 && p.hp < MAX_HP) startAct(M, p, k);
    else if (k === "heal") { if (inv.medkit > 0 && p.hp < 60 && p.hp < MAX_HP) startAct(M, p, "medkit"); else if (inv.bandage > 0 && p.hp < MAX_HP) startAct(M, p, "bandage"); else if (inv.medkit > 0 && p.hp < MAX_HP) startAct(M, p, "medkit"); }
  }
  // reload
  if (w) {
    const W = WEAPONS[w.id], reserve = M.infAmmo && p.human ? 999 : inv.ammo[W.ammo];
    const wantReload = inp.reload || (inp.fire && w.mag <= 0 && p.cd <= 0);
    if (wantReload && w.mag < W.mag && reserve > 0 && (!p.act || p.act.k !== "reload")) startAct(M, p, "reload", W.reload * (w.r >= 3 ? 0.88 : 1));
    else if (inp.fire && !p.trig && w.mag <= 0 && reserve <= 0) ev(M, "dry", { pid: p.id });
    if (inp.fire && p.cd <= 0 && w.mag > 0 && p.swapT <= 0 && (W.auto || !p.trig)) {
      if (p.act) p.act = null; // shooting cancels reload/heal
      p.sprint = false; fire(M, p, w);
    }
  }
  // melee: F, or fire with the knife slot
  if ((inp.melee || (inv.slot === 2 && inp.fire && !p.trig)) && p.meleeCd <= 0) melee(M, p);
  // throwables
  if (inp.throw && p.throwCd <= 0 && inv[inp.throw] > 0) {
    inv[inp.throw]--; p.throwCd = 0.9;
    const cp = Math.cos(p.pitch + 0.12), dx = -Math.sin(p.yaw) * cp, dy = Math.sin(p.pitch + 0.12), dz = -Math.cos(p.yaw) * cp;
    const sp = 19;
    M.proj.push({ k: inp.throw, x: p.x + dx * 0.6, y: eyeY(p) - 0.1, z: p.z + dz * 0.6, vx: dx * sp + p.vx * 0.5, vy: dy * sp + 3.5, vz: dz * sp + p.vz * 0.5, fuse: inp.throw === "frag" ? 3.0 : 1.4, owner: p.id, id: M.nextId++ });
    ev(M, "throw", { pid: p.id, k: inp.throw });
  }
  p.trig = inp.fire;
}
function startAct(M, p, k, dur) {
  const D = { plate: PLATE_TIME, bandage: ITEMS.bandage.time, medkit: ITEMS.medkit.time };
  p.act = { k, t: 0, dur: dur || D[k] }; ev(M, "act", { pid: p.id, k });
}
function melee(M, p) {
  p.meleeCd = 0.75; const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  let best = null, bd = 2.4;
  for (const q of M.players) {
    if (q === p || q.st === "dead" || q.st === "plane") continue;
    const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz); if (d > bd || Math.abs(q.y - p.y) > 1.5) continue;
    if ((dx * fx + dz * fz) / Math.max(d, 0.01) < 0.5) continue; bd = d; best = q;
  }
  ev(M, "melee", { pid: p.id, hit: best ? best.id : 0 });
  if (best) damage(M, best, 45, p, "knife", "body", best.x, best.y + 1.2, best.z);
}

// ---------------------------------------------------------------------------------------------
// movement
function moveGround(M, p, inp, dt) {
  const W = M.W, w = curWeapon(p);
  p.crouch = !!inp.crouch && !p.swim;
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
  let wx = fx * inp.mz + rx * inp.mx, wz = fz * inp.mz + rz * inp.mx; const wl = Math.hypot(wx, wz); if (wl > 1) { wx /= wl; wz /= wl; }
  p.sprint = !!inp.sprint && inp.mz > 0.3 && !p.ads && !p.crouch && !p.swim && M.t - p.lastShotT > 0.3 && (!p.act || p.act.k === "reload");
  if (p.sprint && p.act && p.act.k === "reload") { /* tactical sprint reload allowed */ }
  let spd = p.swim ? 2.8 : p.crouch ? 2.5 : p.sprint ? 7.0 : 4.6;
  if (p.adsT > 0.3) spd *= 0.62;
  if (p.act && p.act.k !== "reload") spd = Math.min(spd, 2.4);
  if (w) spd *= WEAPONS[w.id].move;
  if (inp.mz < -0.1 && !p.swim) spd *= 0.85;
  const acc = p.onGround ? 14 : 2.5;
  p.vx += (wx * spd - p.vx) * Math.min(1, acc * dt); p.vz += (wz * spd - p.vz) * Math.min(1, acc * dt);
  // vertical
  if (p.swim) { p.vy = 0; }
  else if (p.onGround && inp.jump) { p.vy = JUMP_V; p.onGround = false; ev(M, "jump", { pid: p.id }); }
  else if (!p.onGround) p.vy -= GRAV * dt;
  const h = p.crouch ? CROUCH_H : STAND_H;
  const steps = Math.ceil(Math.hypot(p.vx, p.vz) * dt / 0.3) || 1;
  for (let s = 0; s < steps; s++) { p.x += p.vx * dt / steps; p.z += p.vz * dt / steps; collideCyl(W, p, RAD, h); }
  p.x = clamp(p.x, -985, 985); p.z = clamp(p.z, -985, 985);
  p.y += p.vy * dt;
  if (p.vy > 0) { const c = ceilingAt(W, p.x, p.z, p.y + h - p.vy * dt); if (p.y + h > c) { p.y = c - h; p.vy = 0; } }
  const g = groundAt(W, p.x, p.z, p.y, 0.6, 0.18);
  const th = terrainH(W, p.x, p.z);
  if (th < -1.1 && p.y <= SEA - 1.2 + 0.05 && g === th) { // deep water: swim on the surface
    if (!p.swim) ev(M, "splash", { pid: p.id, x: p.x, z: p.z });
    p.swim = true; p.y = SEA - 1.25; p.vy = 0; p.onGround = true;
  } else {
    if (p.swim && th >= -1.1) p.swim = false;
    if (p.y <= g) {
      if (!p.onGround && p.vy < -14) { const fd = (-p.vy - 14) * 5; damage(M, p, fd, null, "fall", "legs"); }
      if (!p.onGround && p.vy < -3) ev(M, "land", { pid: p.id, hard: p.vy < -9 });
      p.y = g; p.vy = 0; p.onGround = true;
    } else if (p.onGround && p.vy <= 0 && p.y - g < 0.65) { p.y = g; }
    else p.onGround = false;
    if (p.swim) p.swim = false;
  }
  p.moveSpd = Math.hypot(p.vx, p.vz);
}
function moveAir(M, p, inp, dt) {
  const W = M.W, fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
  let tvx, tvz, tvy, rate;
  if (p.st === "fall") {
    p.fallT += dt;
    const dive = inp.sprint ? 1 : inp.mz > 0 ? 0.45 : 0;
    const hs = inp.mz > 0 ? 24 + dive * 14 : inp.mz < 0 ? 7 : 13;
    tvx = fx * hs + rx * inp.mx * 11; tvz = fz * hs + rz * inp.mx * 11; tvy = inp.mz < 0 ? -42 : -(50 + dive * 26); rate = 1.4;
  } else {
    p.chuteT += dt;
    const hs = inp.mz > 0 ? 17 : inp.mz < 0 ? 6 : 11;
    tvx = fx * hs + rx * inp.mx * 6; tvz = fz * hs + rz * inp.mx * 6; tvy = inp.mz > 0 ? -7.2 : inp.mz < 0 ? -3.8 : -5.2; rate = 1.1;
  }
  p.vx += (tvx - p.vx) * Math.min(1, rate * dt); p.vz += (tvz - p.vz) * Math.min(1, rate * dt); p.vy += (tvy - p.vy) * Math.min(1, (p.st === "chute" ? 2.2 : 0.9) * dt);
  const steps = Math.ceil(Math.hypot(p.vx, p.vz, p.vy) * dt / 0.4) || 1;
  let landed = false;
  for (let s = 0; s < steps && !landed; s++) {
    p.x += p.vx * dt / steps; p.z += p.vz * dt / steps; p.y += p.vy * dt / steps;
    collideCyl(W, p, RAD, STAND_H, 0.2);
    const g = groundAt(W, p.x, p.z, p.y, 0.3, 0.2), th = terrainH(W, p.x, p.z);
    const surf = Math.max(g, th < SEA ? SEA - 1.25 : g);
    if (p.y <= surf + 0.02) { p.y = surf; landed = true; }
  }
  p.x = clamp(p.x, -990, 990); p.z = clamp(p.z, -990, 990);
  const agl = p.y - Math.max(groundAt(W, p.x, p.z, p.y, 0.3), SEA);
  if (landed) {
    const hard = p.st === "fall" && p.vy < -14;
    if (hard) damage(M, p, clamp((-p.vy - 14) * 4, 0, 200), null, "fall", "legs");
    p.st = "ground"; p.onGround = true; p.vy = 0; p.vx *= 0.3; p.vz *= 0.3; p.landT = M.t;
    ev(M, "landed", { pid: p.id, x: p.x, y: p.y, z: p.z });
    return;
  }
  if (p.st === "fall") {
    if ((!p.opened && agl < 110) || (inp.jump && p.fallT > 0.8 && agl > 8)) { p.st = "chute"; p.chuteT = 0; p.opened = true; ev(M, "chute", { pid: p.id, open: true }); }
  } else if (p.st === "chute") {
    if (inp.jump && p.chuteT > 0.8) { p.st = "fall"; p.fallT = 0; ev(M, "chute", { pid: p.id, open: false }); }
    else if (agl < 1.6) { p.st = "ground"; p.onGround = true; p.vy = 0; p.landT = M.t; ev(M, "chute", { pid: p.id, open: false }); ev(M, "landed", { pid: p.id, x: p.x, y: p.y, z: p.z }); }
  }
}

// ---------------------------------------------------------------------------------------------
// projectiles (grenades)
function updateProj(M, dt) {
  const W = M.W;
  for (let i = M.proj.length - 1; i >= 0; i--) {
    const g = M.proj[i];
    g.fuse -= dt; g.vy -= 18 * dt;
    const nx = g.x + g.vx * dt, ny = g.y + g.vy * dt, nz = g.z + g.vz * dt;
    const dx = nx - g.x, dy = ny - g.y, dz = nz - g.z, d = Math.hypot(dx, dy, dz);
    const h = d > 1e-4 ? raycast(W, g.x, g.y, g.z, dx / d, dy / d, dz / d, d + 0.08) : null;
    if (h) {
      const vn = g.vx * h.nx + g.vy * h.ny + g.vz * h.nz;
      g.vx = (g.vx - 2 * vn * h.nx) * 0.45; g.vy = (g.vy - 2 * vn * h.ny) * 0.38; g.vz = (g.vz - 2 * vn * h.nz) * 0.45;
      g.x = h.x + h.nx * 0.06; g.y = h.y + h.ny * 0.06; g.z = h.z + h.nz * 0.06;
      if (Math.abs(vn) > 2) ev(M, "bounce", { x: g.x, y: g.y, z: g.z });
    } else { g.x = nx; g.y = ny; g.z = nz; }
    if (g.y < SEA - 3) g.fuse = Math.min(g.fuse, 0);
    if (g.fuse <= 0) {
      M.proj.splice(i, 1);
      if (g.k === "frag") explode(M, g);
      else { M.smokes.push({ x: g.x, y: g.y, z: g.z, r: 1, t: 0, life: 20, id: g.id }); ev(M, "smoke", { x: g.x, y: g.y, z: g.z, id: g.id }); }
    }
  }
  for (let i = M.smokes.length - 1; i >= 0; i--) { const s = M.smokes[i]; s.t += dt; s.r = Math.min(8.5, 1 + s.t * 3.5); if (s.t > s.life) M.smokes.splice(i, 1); }
}
function explode(M, g) {
  const owner = M.players.find((q) => q.id === g.owner);
  ev(M, "explode", { x: g.x, y: g.y, z: g.z });
  M.sounds.push({ x: g.x, z: g.z, t: M.t, pid: g.owner, loud: 2 });
  for (const q of M.players) {
    if (q.st === "dead" || q.st === "plane") continue;
    const d = Math.hypot(q.x - g.x, q.y + 1 - g.y, q.z - g.z); if (d > 9) continue;
    if (!losClear(M.W, g.x, g.y + 0.3, g.z, q.x, q.y + 1.2, q.z)) continue;
    damage(M, q, Math.round(150 * Math.pow(1 - d / 9, 1.15)), owner || null, "frag", "body", q.x, q.y + 1.2, q.z);
  }
}
// segment blocked by smoke?
export function smokeBlocks(M, ax, ay, az, bx, by, bz) {
  for (const s of M.smokes) {
    if (s.r < 3) continue;
    const dx = bx - ax, dy = by - ay, dz = bz - az, l2 = dx * dx + dy * dy + dz * dz; const t = clamp(((s.x - ax) * dx + (s.y + 1.5 - ay) * dy + (s.z - az) * dz) / l2, 0, 1);
    const px = ax + dx * t - s.x, py = ay + dy * t - s.y - 1.5, pz = az + dz * t - s.z; if (px * px + py * py * 2 + pz * pz < s.r * s.r * 0.8) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// main step
export function step(M, dt = DT) {
  M.t += dt;
  if (M.timers) for (let i = M.timers.length - 1; i >= 0; i--) if (M.t >= M.timers[i].t) { const f = M.timers[i].fn; M.timers.splice(i, 1); f(); }
  const P = M.plane;
  if (P && !P.gone) {
    P.s += P.speed * dt; planePos(M);
    if (P.s > P.len) P.gone = true;
  }
  for (const p of M.players) {
    const inp = p.inp;
    if (p.st === "dead") { clearEdges(inp); continue; }
    p.yaw = inp.yaw; p.pitch = clamp(inp.pitch, -1.45, 1.45);
    if (p.st === "plane") {
      if (P) { p.x = P.x; p.z = P.z; p.y = P.y - 3; p.vx = P.dx * P.speed; p.vz = P.dz * P.speed; p.vy = 0; }
      const can = P && P.s > 140;
      if ((inp.jump && can) || (P && P.s >= P.eject)) {
        p.st = "fall"; p.fallT = 0; p.opened = false; p.vx = P.dx * 30; p.vz = P.dz * 30; p.vy = -5; p.y = P.y - 6;
        ev(M, "jump", { pid: p.id, plane: true });
        inp.jump = false;
      }
    } else if (p.st === "fall" || p.st === "chute") moveAir(M, p, inp, dt);
    else { moveGround(M, p, inp, dt); updateWeapon(M, p, inp, dt); }
    if (p.st === "ground") {
      if (inp.interact) { const b = bestInteract(M, p); if (b) { if (b.crate) openCrate(M, b.crate, p); else takeItem(M, p, b.item); } }
      p.autoT -= dt;
      if (p.autoT <= 0) { p.autoT = 0.15; itemsNear(M, p.x, p.z, 1.5, _items); for (const it of _items) if (it.k !== "weapon" && !it.gone && Math.abs(it.y - p.y) < 1.6) takeItem(M, p, it); }
    }
    clearEdges(inp);
  }
  updateProj(M, dt);
  updateGas(M, dt);
  if (M.sounds.length && M.t - M.sounds[0].t > 2) M.sounds = M.sounds.filter((s) => M.t - s.t < 2);
  if (M.mode === "range") for (const p of M.players) if (p.target && p.strafe && p.st !== "dead") { p.x = p.home.x + Math.sin(M.t * 0.9 + p.id) * p.strafe; p.moveSpd = Math.abs(Math.cos(M.t * 0.9 + p.id) * p.strafe * 0.9); p.yaw = Math.cos(M.t * 0.9 + p.id) > 0 ? -Math.PI / 2 : Math.PI / 2; }
}
function clearEdges(inp) { inp.jump = false; inp.reload = false; inp.interact = false; inp.melee = false; inp.slot = -1; inp.heal = null; inp.throw = null; }

// ---------------------------------------------------------------------------------------------
// practice range setup
export function setupRange(M, human) {
  const W = M.W, R = W.special.range;
  M.infAmmo = true;
  Object.assign(human, { st: "ground", x: R.x, z: R.z + 3, y: groundAt(W, R.x, R.z + 3, 99), yaw: 0, onGround: true });
  human.inp.yaw = 0;
  let k = 0;
  for (const wid of WEAPON_IDS) {
    const x = R.x - 14 + k * 4, z = R.z + 9;
    addItem(M, { k: "weapon", w: wid, r: 2, mag: WEAPONS[wid].mag, x, y: groundAt(W, x, z, 99), z, rack: true });
    k++;
  }
  const extra = [["plate", 5], ["bandage", 3], ["medkit", 2], ["frag", 3], ["smoke", 2]];
  extra.forEach(([kk, n], i) => { const x = R.x + 18 + i * 2.5, z = R.z + 9; addItem(M, { k: kk, n, x, y: groundAt(W, x, z, 99), z, rack: true }); });
  const dists = [10, 25, 50, 75, 100, 150, 220];
  dists.forEach((d, i) => {
    const x = R.x + ((i % 3) - 1) * 6, z = R.z - d, y = groundAt(W, x, z, 99);
    const t = addPlayer(M, d + " m", { target: true, st: "ground", x, y, z, yaw: Math.PI, home: { x, y, z, pl: i % 2 ? [50, 50, 50] : [0, 0, 0] }, strafe: i === 2 || i === 4 ? 5 : 0 });
    t.pl = t.home.pl.slice(); t.onGround = true;
  });
}
