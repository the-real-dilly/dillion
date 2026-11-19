// DILLION: LAST ZONE - bot contractors. Reads match state, writes p.inp (same input struct as a human),
// so bots run unchanged on a future server.
import { clamp, lerp, wrapA, mulberry32 } from "./util.js";
import { WEAPONS, AMMO, DIFFICULTY, CALLSIGNS, ITEMS, PLATE_HP } from "./data.js";
import { POIS, losClear, terrainH, boxesNear, buildingAt, SEA, groundAt } from "./world.js";
import { addPlayer, curWeapon, eyeY, itemsNear, armor, smokeBlocks, plateMax } from "./sim.js";

const CLS_VAL = { "Assault rifle": 50, SMG: 46, Shotgun: 40, Sniper: 34, Revolver: 24, Sidearm: 14 };
const IDEAL = { "Assault rifle": [12, 55], SMG: [4, 20], Shotgun: [2, 9], Sniper: [35, 160], Revolver: [6, 28], Sidearm: [5, 22] };
export const wScore = (w) => (w ? CLS_VAL[WEAPONS[w.id].cls] + w.r * 7 : -1);

export function initBots(M, n, diffName) {
  const r = mulberry32(M.seed ^ 0xb075), names = CALLSIGNS.slice();
  for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
  const P = M.plane;
  const weights = POIS.map((p) => [p, p.w]);
  for (let i = 0; i < n; i++) {
    const p = addPlayer(M, names[i % names.length] + (i >= names.length ? "-" + (i + 1) : ""), { bot: true, col: i });
    const poi = r.weighted(weights);
    // land near one of the POI's loot points when possible
    const spots = M.W.loot.filter((s) => Math.hypot(s.x - poi.x, s.z - poi.z) < poi.r);
    const sp = spots.length && r() < 0.8 ? r.pick(spots) : { x: poi.x + (r() - 0.5) * poi.r, z: poi.z + (r() - 0.5) * poi.r };
    const tx = sp.x + (r() - 0.5) * 6, tz = sp.z + (r() - 0.5) * 6;
    const sStar = (tx - P.ax) * P.dx + (tz - P.az) * P.dz;
    p.ai = { poi, tx, tz, jumpS: clamp(sStar - 120 - r() * 160, 160, P.eject - 10), mode: "drop", think: r() * 0.3, goal: null, enemy: null, seenT: -99, react: 0, aimY: 0, aimP: 0, errY: 0, errP: 0, trackT: 0,
      burst: 0, burstCd: 0, strafe: r() < 0.5 ? 1 : -1, strafeT: 0, crouchT: 0, stuckT: 0, lastX: 0, lastZ: 0, detT: 0, detA: 0, wanderT: 0, inv: null, itemId: 0, crate: null, coverT: 0, grenT: 5 + r() * 10, rng: mulberry32(M.seed + i * 977), stuckN: 0, diff: DIFFICULTY[diffName] || DIFFICULTY.normal, heardT: -99, semi: false, lookY: 0 };
  }
}

const _it = [], _bx = [];
export function updateBots(M, dt) {
  const claims = M.claims || (M.claims = new Map());
  for (const p of M.players) {
    if (!p.bot || p.st === "dead") continue;
    const b = p.ai, inp = p.inp;
    if (p.st === "plane") {
      inp.yaw = Math.atan2(-M.plane.dx, -M.plane.dz);
      if (M.plane.s >= b.jumpS) inp.jump = true;
      continue;
    }
    if (p.st === "fall" || p.st === "chute") { dropSteer(M, p, b, inp); continue; }
    b.think -= dt;
    if (b.think <= 0) { b.think = 0.18 + b.rng() * 0.14; think(M, p, b, claims); }
    act(M, p, b, inp, dt);
  }
}

function dropSteer(M, p, b, inp) {
  const dx = b.tx - p.x, dz = b.tz - p.z, d = Math.hypot(dx, dz);
  inp.yaw = Math.atan2(-dx, -dz); inp.pitch = -0.6; inp.mx = 0;
  const agl = p.y - Math.max(terrainH(M.W, p.x, p.z), SEA);
  if (p.st === "fall") { inp.mz = d > agl * 0.25 ? 1 : 0; inp.sprint = d < agl * 0.5; }
  else inp.mz = d > 12 ? 1 : d > 4 ? 0 : -1;
}

// --------------------------------------------------------------------------------------------- perception + decisions
function think(M, p, b, claims) {
  const D = b.diff, W = M.W, ex = p.x, ey = eyeY(p), ez = p.z;
  // perception
  let best = null, bs = 1e9;
  for (const q of M.players) {
    if (q === p || q.st === "dead" || q.st === "plane" || q.target) continue;
    const dx = q.x - ex, dz = q.z - ez, d = Math.hypot(dx, dz);
    let range = D.spot * (M.t - q.lastShotT < 1.2 ? 1.6 : 1) * (q.crouch ? 0.75 : 1) * (q.st !== "ground" ? 0.6 : 1);
    if (q.id === p.lastAtk && M.t - p.lastAtkT < 4) range = Math.max(range, 160);
    if (d > range) continue;
    const ang = Math.abs(wrapA(Math.atan2(-dx, -dz) - b.lookY));
    if (ang > 1.35 && d > 14 && !(q.id === p.lastAtk && M.t - p.lastAtkT < 4)) continue;
    const ty = q.y + (q.crouch ? 1.0 : 1.35);
    if (!losClear(W, ex, ey, ez, q.x, ty, q.z) || smokeBlocks(M, ex, ey, ez, q.x, ty, q.z)) continue;
    const sc = d - (q.id === p.lastAtk ? 40 : 0) - (q === b.enemy ? 15 : 0);
    if (sc < bs) { bs = sc; best = q; }
  }
  if (best) {
    if (b.enemy !== best || M.t - b.seenT > 2.5) { b.react = D.react * (0.7 + b.rng() * 0.7); b.trackT = 0; newError(b, p, best); }
    b.enemy = best; b.seenT = M.t; b.lastSeen = { x: best.x, y: best.y, z: best.z };
  } else if (b.enemy && (b.enemy.st === "dead" || M.t - b.seenT > 6)) b.enemy = null;
  // hearing
  if (!b.enemy) for (const s of M.sounds) { if (s.pid === p.id || M.t - s.t > 1) continue; const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < 130 * s.loud && d > 8) { b.heard = { x: s.x, z: s.z }; b.heardT = M.t; } }
  // weapon management
  const inv = p.inv, w0 = inv.w[0], w1 = inv.w[1];
  if (inv.slot === 2 && (w0 || w1)) p.inp.slot = w0 ? 0 : 1;
  // gas
  const g = M.gas;
  let gasUrgent = false;
  if (g) {
    const dNow = Math.hypot(p.x - g.cx, p.z - g.cz), dNext = Math.hypot(p.x - g.nx, p.z - g.nz);
    if (dNow > g.r - 6) gasUrgent = true;
    else if (g.ph !== "done" && dNext > g.nr * 0.9 && (g.ph === "shrink" || g.t < 30)) gasUrgent = true;
  }
  b.gasUrgent = gasUrgent;
  const fighting = b.enemy && M.t - b.seenT < 3 && (w0 || w1);
  const hpLow = p.hp < 65 && (inv.medkit > 0 || inv.bandage > 0);
  const armLow = !plateMax(p) && inv.plate > 0;
  if (p.inGas && p.hp < 30 && g.dps <= 2 && (inv.medkit > 0 || inv.bandage > 0)) { b.mode = "heal"; return; }
  if (fighting && !(p.inGas && Math.hypot(b.enemy.x - p.x, b.enemy.z - p.z) > 15)) { b.mode = "fight"; return; }
  if (p.inGas) { b.mode = "rotate"; if (!b.goal || !b.gasGoal) b.goal = rotateGoal(M, p, b); b.gasGoal = true; return; }
  b.gasGoal = false;
  if ((hpLow || armLow) && M.t - b.seenT > 2 && M.t - p.lastAtkT > 2.5 && !p.inGas) { b.mode = "heal"; return; }
  if (gasUrgent) { b.mode = "rotate"; if (!b.rotGoal || b.rotSt !== g.st) { b.rotGoal = rotateGoal(M, p, b); b.rotSt = g.st; } b.goal = b.rotGoal; return; }
  // loot
  const lt = lootTarget(M, p, b, claims);
  if (lt) { b.mode = "loot"; b.goal = lt; return; }
  if (!w0 && !w1) { b.mode = "rotate"; if (!b.goal || b.wanderT < M.t) { b.goal = wanderGoal(M, p, b); b.wanderT = M.t + 20; } return; }
  if (b.heard && M.t - b.heardT < 6) { b.mode = "investigate"; b.goal = { x: b.heard.x, z: b.heard.z }; return; }
  b.mode = "rotate";
  if (!b.goal || b.wanderT < M.t || Math.hypot(b.goal.x - p.x, b.goal.z - p.z) < 4) { b.goal = wanderGoal(M, p, b); b.wanderT = M.t + 15 + b.rng() * 25; }
}
function newError(b, p, q) {
  const D = b.diff, d = Math.hypot(q.x - p.x, q.z - p.z), r = b.rng;
  const g = () => (r() + r() + r() - 1.5) / 1.5;
  const k = D.aimErr * (Math.PI / 180) * (0.5 + d / 45) * (q.moveSpd > 3 ? 1.3 : 1) * (p.moveSpd > 3 ? 1.15 : 1) * (q.st !== "ground" ? 1.6 : 1);
  b.errY = g() * k * 1.6; b.errP = g() * k;
}
function rotateGoal(M, p, b) {
  const g = M.gas; const tx = g.ph === "done" ? g.cx : g.nx, tz = g.ph === "done" ? g.cz : g.nz, tr = g.ph === "done" ? g.r : g.nr;
  const r = b.rng, a = r() * Math.PI * 2, d = Math.sqrt(r()) * tr * 0.55;
  let x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d;
  if (terrainH(M.W, x, z) < 0.5) { x = tx; z = tz; }
  return { x, z };
}
function wanderGoal(M, p, b) {
  const g = M.gas, r = b.rng;
  const cx = g ? g.nx : p.x, cz = g ? g.nz : p.z, cr = g ? Math.min(g.nr || g.r, g.r) * 0.75 : 200;
  for (let k = 0; k < 12; k++) {
    // prefer buildings/POIs inside the circle
    const pois = POIS.filter((q) => Math.hypot(q.x - cx, q.z - cz) < cr);
    let x, z;
    if (pois.length && r() < 0.6) { const q = r.pick(pois); x = q.x + (r() - 0.5) * q.r; z = q.z + (r() - 0.5) * q.r; }
    else { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * cr; x = cx + Math.cos(a) * d; z = cz + Math.sin(a) * d; }
    if (terrainH(M.W, x, z) > 0.8) return { x, z };
  }
  return { x: cx, z: cz };
}
function lootTarget(M, p, b, claims) {
  const inv = p.inv, cur = [inv.w[0], inv.w[1]], worst = Math.min(wScore(cur[0]), wScore(cur[1]));
  const ammoFor = new Set(cur.filter(Boolean).map((w) => WEAPONS[w.id].ammo));
  itemsNear(M, p.x, p.z, 42, _it);
  let best = null, bs = 0;
  for (const it of _it) {
    if (it.gone || Math.abs(it.y - p.y) > 6) continue;
    const c = claims.get(it.id); if (c && c.id !== p.id && M.t - c.t < 8) continue;
    let v = 0;
    if (it.k === "weapon") { const s = CLS_VAL[WEAPONS[it.w].cls] + (it.r || 0) * 7; if (s > worst + 6) v = 40 + (s - worst); }
    else if (it.k === "ammo") { if (ammoFor.has(it.a) && inv.ammo[it.a] < AMMO[it.a].max * 0.6) v = 22; }
    else if (it.k === "plate") { if (inv.plate < 5) v = 18; }
    else if (it.k === "bandage" || it.k === "medkit" || it.k === "frag" || it.k === "smoke") { if (inv[it.k] < ITEMS[it.k].max) v = it.k === "medkit" ? 14 : 8; }
    else if (it.k === "pickle") v = 5;
    if (!v) continue;
    const d = Math.hypot(it.x - p.x, it.z - p.z), sc = v / (d + 6);
    if (sc > bs) { bs = sc; best = it; }
  }
  // crates
  for (const c of M.crates) { if (c.open) continue; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d > 55 || Math.abs(c.y - p.y) > 6) continue; const cl = claims.get("c" + c.id); if (cl && cl.id !== p.id && M.t - cl.t < 10) continue; const sc = 45 / (d + 6); if (sc > bs) { bs = sc; best = { crate: c, x: c.x, z: c.z, y: c.y }; } }
  if (!best) return null;
  claims.set(best.crate ? "c" + best.crate.id : best.id, { id: p.id, t: M.t });
  // drop the worse weapon slot before picking up a better gun
  if (best.k === "weapon" && cur[0] && cur[1]) { const ws = wScore(cur[0]) <= wScore(cur[1]) ? 0 : 1; if (inv.slot !== ws) p.inp.slot = ws; }
  return { x: best.x, z: best.z, y: best.y, item: best.crate ? null : best, crate: best.crate || null };
}

// --------------------------------------------------------------------------------------------- per-tick action
function act(M, p, b, inp, dt) {
  const D = b.diff, inv = p.inv;
  inp.fire = false; inp.ads = false; inp.sprint = false; inp.mx = 0; inp.mz = 0;
  let wish = null, face = null, sprint = false;
  if (b.mode === "fight" && b.enemy) {
    const q = b.enemy, vis = M.t - b.seenT < 0.35;
    const tx = vis ? q.x : b.lastSeen.x, tz = vis ? q.z : b.lastSeen.z, ty = (vis ? q.y : b.lastSeen.y) + (q.crouch ? 0.95 : 1.3);
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz), dy = ty - eyeY(p);
    const wantY = Math.atan2(-dx, -dz), wantP = Math.atan2(dy, d);
    b.trackT += dt;
    // smooth tracking with error that shrinks while tracking
    const turn = D.track * 7 * dt;
    b.aimY += clamp(wrapA(wantY - b.aimY), -turn, turn); b.aimP += clamp(wantP - b.aimP, -turn, turn);
    const settle = clamp(1.4 - b.trackT * 0.45 * D.track, 0.35, 1.4);
    const comp = 0.55 * D.acc;
    inp.yaw = b.aimY + b.errY * settle - p.recY * comp; inp.pitch = b.aimP + b.errP * settle - p.recP * comp;
    face = true;
    // choose weapon slot by range
    const w = curWeapon(p);
    const other = inv.slot === 0 ? inv.w[1] : inv.w[0];
    if (other && w) { const ow = WEAPONS[other.id], cw = WEAPONS[w.id]; const [a0, a1] = IDEAL[cw.cls], [o0, o1] = IDEAL[ow.cls]; if ((d < a0 * 0.7 && d >= o0) || (d > a1 * 1.6 && d <= o1 * 1.3) || (w.mag === 0 && other.mag > 0)) { if (b.rng() < 0.03) inp.slot = inv.slot === 0 ? 1 : 0; } }
    else if (!w && other) inp.slot = inv.slot === 0 ? 1 : 0;
    if (w) {
      const W = WEAPONS[w.id], ideal = IDEAL[W.cls];
      if (w.mag === 0) { inp.reload = true; b.coverT = M.t + 1.5; }
      inp.ads = d > 12 && W.cls !== "Shotgun";
      const aimed = Math.abs(wrapA(wantY - b.aimY)) < 0.12 + 1.5 / Math.max(d, 1);
      b.react -= dt;
      if (vis && b.react <= 0 && aimed && w.mag > 0 && d < W.r1 * 1.8 + 20) {
        if (b.burstCd > 0) b.burstCd -= dt;
        else if (W.auto) { inp.fire = true; if (p.fireT === M.t - dt || M.t - p.fireT < 0.02) b.burst++; if (b.burst >= D.burst + (d < 15 ? 4 : 0)) { b.burst = 0; b.burstCd = 0.18 + b.rng() * 0.35 + d / 200; newError(b, p, q); } }
        else { b.semi = !b.semi; inp.fire = b.semi && p.cd <= 0; if (inp.fire) { b.burstCd = (W.cls === "Sniper" ? 0.6 : 0.12) + b.rng() * 0.3 / D.acc; newError(b, p, q); } }
      }
      // movement: keep to the gun's ideal range, strafe
      b.strafeT -= dt; if (b.strafeT <= 0) { b.strafeT = 0.5 + b.rng() * 1.0; if (b.rng() < 0.7) b.strafe = -b.strafe; b.crouchT = b.rng() < 0.25 ? M.t + 1.2 : 0; }
      const fx = dx / Math.max(d, 0.01), fz = dz / Math.max(d, 0.01);
      let ax = 0, az = 0;
      if (d > ideal[1]) { ax = fx; az = fz; } else if (d < ideal[0]) { ax = -fx; az = -fz; }
      ax += -fz * b.strafe * 0.8; az += fx * b.strafe * 0.8;
      // break off to cover when hurt
      if ((p.hp + armor(p) < 55 || M.t < b.coverT) && d > 8) { const c = coverPoint(M, p, tx, tz); if (c) { wish = toward(p, c.x, c.z); inp.crouch = false; } }
      if (!wish) wish = [ax, az];
      inp.crouch = M.t < b.crouchT && d > 20;
      // grenade at a target that ducked behind cover
      if (!vis && inv.frag > 0 && d > 10 && d < 32 && M.t > b.grenT) { b.grenT = M.t + 8 + b.rng() * 8; inp.throw = "frag"; inp.pitch = 0.18 + d * 0.006; }
      if (!vis && M.t - b.seenT > 1.2) wish = toward(p, tx, tz);
    } else wish = toward(p, p.x - dx, p.z - dz);
  } else if (b.mode === "heal") {
    inp.crouch = true;
    if (!p.act) { if (!plateMax(p) && inv.plate > 0) { inp.heal = "plate"; inp.plateHold = true; } else if (p.hp < 100 && (inv.medkit > 0 || inv.bandage > 0)) inp.heal = "heal"; else b.mode = "rotate"; }
    if (p.inGas && M.gas) wish = toward(p, M.gas.cx, M.gas.cz);
    const w = curWeapon(p); if (w && w.mag < WEAPONS[w.id].mag * 0.5 && !p.act) inp.reload = true;
  } else {
    inp.crouch = false;
    const w = curWeapon(p); if (w && w.mag < WEAPONS[w.id].mag * 0.4 && !p.act) inp.reload = true;
    if (b.goal) {
      const nav = navPoint(M, p, b.goal.x, b.goal.z);
      wish = toward(p, nav.x, nav.z);
      const d = Math.hypot(b.goal.x - p.x, b.goal.z - p.z);
      sprint = d > 18 && !p.act;
      if (b.mode === "loot" && d < 1.7) { inp.interact = true; inp.target = b.goal.crate ? { crate: b.goal.crate } : { item: b.goal.item }; b.goal = null; b.think = Math.min(b.think, 0.05); }
      if (b.mode === "investigate") sprint = d > 30;
    }
  }
  // obstacle avoidance + stuck handling
  if (wish) {
    let wx = wish[0], wz = wish[1]; const wl = Math.hypot(wx, wz);
    if (wl > 0.01) {
      wx /= wl; wz /= wl;
      let a = Math.atan2(wx, wz);
      if (M.t < b.detT) a += b.detA;
      else if (blocked(M, p, a)) { for (const da of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) if (!blocked(M, p, a + da)) { b.detA = da; b.detT = M.t + 0.5; a += da; break; } }
      wx = Math.sin(a); wz = Math.cos(a);
      if (!face) { inp.yaw = Math.atan2(-wx, -wz); inp.pitch = 0; b.aimY = inp.yaw; b.aimP = 0; }
      const fx = -Math.sin(inp.yaw), fz = -Math.cos(inp.yaw), rx = Math.cos(inp.yaw), rz = -Math.sin(inp.yaw);
      inp.mz = wx * fx + wz * fz; inp.mx = wx * rx + wz * rz;
      inp.sprint = sprint && inp.mz > 0.7;
      // stuck?
      b.stuckT += dt;
      if (b.stuckT > 1.2) {
        const moved = Math.hypot(p.x - b.lastX, p.z - b.lastZ); b.stuckT = 0; b.lastX = p.x; b.lastZ = p.z;
        if (moved < 0.8) { b.stuckN++; inp.jump = true; b.detA = (b.rng() < 0.5 ? 1 : -1) * (1 + b.rng()); b.detT = M.t + 1.0; if (b.stuckN > 4) { if (b.goal && b.goal.item) M.claims.set(b.goal.item.id, { id: -1, t: M.t + 60 }); if (b.goal && b.goal.crate) M.claims.set("c" + b.goal.crate.id, { id: -1, t: M.t + 60 }); b.goal = null; b.stuckN = 0; b.wanderT = 0; } }
        else b.stuckN = 0;
      }
    }
  }
  b.lookY = inp.yaw;
}
function toward(p, x, z) { return [x - p.x, z - p.z]; }
function blocked(M, p, a) {
  const px = p.x + Math.sin(a) * 1.1, pz = p.z + Math.cos(a) * 1.1;
  boxesNear(M.W, px, pz, 0.35, _bx);
  for (const bx of _bx) if (bx.y1 > p.y + 0.6 && bx.y0 < p.y + 1.7) return true;
  if (terrainH(M.W, px, pz) < -1 && terrainH(M.W, p.x, p.z) > -1) return true;
  if (groundAt(M.W, px, pz, p.y + 0.5) < p.y - 9) return true;
  return false;
}
// route through doorways when entering/leaving buildings
function navPoint(M, p, gx, gz) {
  const W = M.W, cb = buildingAt(W, p.x, p.z), gb = buildingAt(W, gx, gz);
  if (cb === gb) return { x: gx, z: gz };
  const bld = cb || gb, leaving = !!cb && cb !== gb;
  if (!bld || !bld.doors.length) return { x: gx, z: gz };
  let best = null, bd = 1e9;
  for (const d of bld.doors) { const dd = Math.hypot(d.x - p.x, d.z - p.z) + Math.hypot(d.x - gx, d.z - gz) * 0.5; if (dd < bd) { bd = dd; best = d; } }
  const out = { x: best.x + best.ox * 1.8, z: best.z + best.oz * 1.8 }, inn = { x: best.x - best.ox * 1.4, z: best.z - best.oz * 1.4 };
  if (leaving) { const dIn = Math.hypot(inn.x - p.x, inn.z - p.z); return dIn > 0.9 && Math.hypot(best.x - p.x, best.z - p.z) > 0.8 ? inn : out; }
  const dOut = Math.hypot(out.x - p.x, out.z - p.z);
  return dOut > 1.0 && Math.hypot(best.x - p.x, best.z - p.z) > 0.8 ? out : inn;
}
function coverPoint(M, p, ex, ez) {
  boxesNear(M.W, p.x, p.z, 16, _bx); let best = null, bd = 1e9;
  for (const bx of _bx) {
    if (bx.y1 - bx.y0 < 1.2 || bx.y1 < p.y + 1.2 || bx.y0 > p.y + 0.5 || bx.floor || bx.roof) continue;
    const cx = (bx.x0 + bx.x1) / 2, cz = (bx.z0 + bx.z1) / 2; let dx = cx - ex, dz = cz - ez; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const ext = Math.max(bx.x1 - bx.x0, bx.z1 - bx.z0) * 0.5 + 0.9;
    if (ext > 12) continue;
    const x = cx + dx * ext, z = cz + dz * ext; const d = Math.hypot(x - p.x, z - p.z);
    if (d < bd) { bd = d; best = { x, z }; }
  }
  return best;
}
