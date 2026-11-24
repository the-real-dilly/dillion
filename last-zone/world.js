// DILLION: LAST ZONE - deterministic island (pure data + geometry queries, no THREE/DOM).
// Terrain heightfield, points of interest, buildings as axis-aligned boxes, roads, trees,
// loot spawn points, and ray/collision queries that the simulation (and a future server) uses.
import { clamp, lerp, smooth, mulberry32, makeNoise, segDist } from "./util.js";

export const HALF = 1000, CELL = 5, N = 401, SEA = 0;
export const MAP_SEED = 0x1a5d9e;
// surface ids
export const SURF = { WATER: 0, SAND: 1, GRASS: 2, ROCK: 3, FARM: 4, ROAD: 5, CONCRETE: 6, DIRT: 7, WOOD: 8, METAL: 9 };
export const SURF_NAME = ["water", "sand", "grass", "rock", "farm", "road", "concrete", "dirt", "wood", "metal"];

// ---------------------------------------------------------------------------------------------
// points of interest (fixed layout, so the island is learnable; loot varies per match seed)
export const POIS = [
  { id: "lp", name: "Los Pepinos", sub: "Relish Ave district", x: 430, z: 400, tier: 3, w: 6, r: 190 },
  { id: "compound", name: "The Compound", sub: "Dillion Group site", x: -40, z: 40, tier: 4, w: 3, r: 80 },
  { id: "airfield", name: "Brinewater Airfield", sub: "", x: -520, z: 120, tier: 2, w: 3, r: 200 },
  { id: "port", name: "Port Caper", sub: "container yard", x: 610, z: -250, tier: 2, w: 3, r: 150 },
  { id: "farm", name: "Dillfield Farms", sub: "", x: -330, z: -430, tier: 1, w: 3, r: 170 },
  { id: "quarry", name: "Vinegar Quarry", sub: "", x: 120, z: -560, tier: 2, w: 2, r: 110 },
  { id: "saltbrush", name: "Saltbrush", sub: "hamlet", x: -430, z: 540, tier: 1, w: 2, r: 70 },
  { id: "caraway", name: "Caraway", sub: "hamlet", x: 240, z: -200, tier: 1, w: 2, r: 70 },
  { id: "hollow", name: "Mill Hollow", sub: "hamlet", x: -190, z: 360, tier: 1, w: 2, r: 70 },
  { id: "relayN", name: "Relay North", sub: "radio mast", x: -120, z: -300, tier: 2, w: 1, r: 30 },
  { id: "relayE", name: "Relay East", sub: "radio mast", x: 380, z: -470, tier: 2, w: 1, r: 30 }
];
export const POI = Object.fromEntries(POIS.map((p) => [p.id, p]));

const BLOBS = [[0, 0, 640], [-480, 160, 380], [-330, -440, 360], [120, -520, 330], [420, -250, 290], [330, 320, 360], [-420, 520, 300], [430, 470, 220]];

export function buildWorld() {
  const W = {
    H: new Float32Array(N * N), S: new Uint8Array(N * N), boxes: [], grid: new Map(), buildings: [], roads: [], trees: [], palms: [], rocks: [],
    loot: [], crates: [], props: [], fields: [], lights: [], fences: [], special: {}, stamp: 1, boxStamp: null
  };
  const nz = makeNoise(MAP_SEED), r = mulberry32(MAP_SEED ^ 0x9e3779b9);
  // ---- 1. raw height ----
  const mask = (x, z) => {
    let m = -1;
    for (const [cx, cz, rr] of BLOBS) { const d = Math.hypot(x - cx, z - cz); m = Math.max(m, 1 - d / rr); }
    return m + (nz.fbm(x * 0.004, z * 0.004, 4) - 0.5) * 0.32;
  };
  const bump = (x, z, cx, cz, rad, h) => { const d2 = ((x - cx) ** 2 + (z - cz) ** 2) / (rad * rad); return d2 > 9 ? 0 : h * Math.exp(-d2); };
  const raw = (x, z) => {
    const m = mask(x, z);
    if (m <= 0) return -2 - 26 * smooth(0, 0.25, -m) + (nz.vn(x * 0.02, z * 0.02) - 0.5) * 2;
    let h = -2 + 6 * smooth(0, 0.1, m);
    const inland = smooth(0.06, 0.42, m);
    const hills = nz.ridge(x * 0.0032 + 3, z * 0.0032 - 7, 4) * 0.55 + nz.fbm(x * 0.006, z * 0.006, 4) * 0.45;
    h += inland * (6 + Math.pow(hills, 1.6) * 46);
    h += bump(x, z, -40, 40, 170, 30) * inland;     // compound hill
    h += bump(x, z, 430, 205, 100, 34) * inland;    // LOS PEPINOS sign hill
    h += bump(x, z, 120, -560, 170, 24) * inland;   // quarry massif
    h += bump(x, z, -120, -300, 90, 16) * inland;   // relay north
    h += bump(x, z, 380, -470, 80, 14) * inland;    // relay east
    return h;
  };
  const H = W.H;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = raw(i * CELL - HALF, j * CELL - HALF);
  const hRaw = (x, z) => sampleGrid(H, x, z);
  // ---- 2. pads (flatten for POIs). rect pads: [x0,x1,z0,z1,h,blend]; circle: [x,z,r,h,blend]
  const rects = [], circs = [];
  const rect = (x0, x1, z0, z1, h, blend) => { rects.push([x0, x1, z0, z1, h, blend]); };
  const circ = (x, z, rad, h, blend) => { circs.push([x, z, rad, h == null ? hRaw(x, z) : h, blend]); };
  rect(290, 590, 290, 560, 4, 50);              // Los Pepinos
  rect(260, 620, 575, 655, 1.2, 40);             // Los Pepinos beach below the boulevard
  rect(-590, -450, -230, 470, 6, 60);            // airfield runway + apron
  rect(-460, -380, -150, 210, 6, 45);             // airfield hangar row, tower, offices
  rect(500, 700, -360, -140, 3, 40);             // port
  circ(-330, -430, 190, 9, 120);                 // farm
  circ(-40, 40, 78, null, 40);                   // compound hilltop
  circ(-430, 540, 62, null, 40); circ(240, -200, 62, null, 40); circ(-190, 360, 62, null, 40);
  circ(-120, -300, 26, null, 24); circ(380, -470, 26, null, 24);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i * CELL - HALF, z = j * CELL - HALF; let h = H[j * N + i];
    for (const [x0, x1, z0, z1, ph, b] of rects) {
      const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1), d = Math.hypot(dx, dz);
      if (d < b) h = lerp(h, ph, 1 - smooth(0, b, d));
    }
    for (const [cx, cz, rad, ph, b] of circs) { const d = Math.hypot(x - cx, z - cz); if (d < rad + b) h = lerp(h, ph, 1 - smooth(rad, rad + b, d)); }
    // quarry pit: terraced bowl
    { const d = Math.hypot(x - 120, z - 560 * -1); if (d < 150) { const floor = 6, prof = floor + Math.floor(Math.max(0, d - 55) * 0.55 / 4.5) * 4.5 + Math.max(0, d - 55) * 0.08; h = Math.min(h, prof); } }
    H[j * N + i] = h;
  }
  W.quarry = { x: 120, z: -560, floor: 6 };
  // ---- 3. roads (catmull-rom through waypoints), smoothed height and carved into terrain
  const ROUTES = [
    [[440, 300], [470, 120], [540, 0], [600, -140], [610, -250]],                       // LP -> port
    [[340, 380], [260, 200], [250, 40], [240, -200], [190, -380], [130, -500]],           // LP -> caraway -> quarry
    [[240, -200], [120, -120], [30, -30], [-40, 40]],                                     // caraway -> compound
    [[-40, 40], [-110, 200], [-190, 360], [-320, 470], [-430, 540]],                      // compound -> hollow -> saltbrush
    [[-430, 540], [-470, 380], [-440, 200], [-420, 60]],                                  // saltbrush -> airfield
    [[-440, -150], [-400, -300], [-330, -430]],                                           // airfield -> farm
    [[-330, -430], [-200, -470], [-60, -520], [60, -560]],                                // farm -> quarry
    [[-40, 40], [-200, 60], [-380, 100]],                                                 // compound -> airfield
    [[-190, 360], [80, 380], [290, 410]],                                                 // hollow -> LP
    [[-120, -300], [-60, -160], [30, -30]],                                               // relay north spur
    [[380, -470], [300, -330], [240, -200]]                                               // relay east spur
  ];
  for (const R of ROUTES) {
    const pts = catmull(R, 4);
    // smooth heights along road
    let hs = pts.map(([x, z]) => Math.max(sampleGrid(H, x, z), 0.6));
    for (let k = 0; k < 6; k++) hs = hs.map((h, i) => (hs[Math.max(0, i - 2)] + hs[Math.max(0, i - 1)] + h + hs[Math.min(hs.length - 1, i + 1)] + hs[Math.min(hs.length - 1, i + 2)]) / 5);
    const road = { pts: pts.map((p, i) => [p[0], hs[i], p[1]]), w: 7 };
    W.roads.push(road);
  }
  // carve: each grid vertex near a road blends to road height
  const roadHash = new Map();
  for (const rd of W.roads) for (let i = 0; i < rd.pts.length - 1; i++) {
    const [ax, , az] = rd.pts[i]; const k = (Math.floor(ax / 32) & 0xffff) << 16 | (Math.floor(az / 32) & 0xffff);
    if (!roadHash.has(k)) roadHash.set(k, []); roadHash.get(k).push([rd, i]);
  }
  W.roadHash = roadHash;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i * CELL - HALF, z = j * CELL - HALF; const q = roadQuery(W, x, z, 14);
    if (q) { const t = 1 - smooth(4.5, 13, q.d); H[j * N + i] = lerp(H[j * N + i], q.h - 0.05, t); }
  }
  // ---- 4. surfaces (sand, grass, rock, farm, road, concrete, dirt)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i * CELL - HALF, z = j * CELL - HALF, h = H[j * N + i];
    const sl = slopeAt(H, i, j);
    let s = SURF.GRASS;
    if (h < -0.4) s = SURF.WATER; else if (h < 2.2) s = SURF.SAND;
    if (s === SURF.GRASS && sl > 0.75) s = SURF.ROCK;
    if (Math.hypot(x - 120, z + 560) < 120) s = SURF.ROCK;
    W.S[j * N + i] = s;
  }
  const paint = (x0, x1, z0, z1, s) => { for (let j = Math.max(0, Math.floor((z0 + HALF) / CELL)); j <= Math.min(N - 1, Math.ceil((z1 + HALF) / CELL)); j++) for (let i = Math.max(0, Math.floor((x0 + HALF) / CELL)); i <= Math.min(N - 1, Math.ceil((x1 + HALF) / CELL)); i++) if (W.S[j * N + i] !== SURF.WATER) W.S[j * N + i] = s; };
  W.paint = paint;
  // ---- 5. content
  const B = new Builder(W, r);
  buildLosPepinos(B, W, r);
  buildAirfield(B, W, r);
  buildPort(B, W, r);
  buildFarm(B, W, r);
  buildQuarry(B, W, r);
  buildCompound(B, W, r);
  buildHamlet(B, W, r, POI.saltbrush, 6); buildHamlet(B, W, r, POI.caraway, 5); buildHamlet(B, W, r, POI.hollow, 6);
  buildRelay(B, W, r, POI.relayN); buildRelay(B, W, r, POI.relayE);
  for (const rd of W.roads) for (const p of rd.pts) { const i = Math.round((p[0] + HALF) / CELL), j = Math.round((p[2] + HALF) / CELL); for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < N && jj < N && W.S[jj * N + ii] !== SURF.WATER && W.S[jj * N + ii] !== SURF.CONCRETE) W.S[jj * N + ii] = SURF.ROAD; } }
  scatterNature(W, r, nz);
  W.special.spawnRange = { x: -520, z: 440, yaw: 0 };
  return W;
}

// ---------------------------------------------------------------------------------------------
// heightfield sampling (triangle-exact, matching the rendered terrain mesh diagonal)
export function sampleGrid(H, x, z) {
  let fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
  if (fx < 0 || fz < 0 || fx >= N - 1 || fz >= N - 1) return -30;
  const i = Math.floor(fx), j = Math.floor(fz); fx -= i; fz -= j;
  const k = j * N + i, h00 = H[k], h10 = H[k + 1], h01 = H[k + N], h11 = H[k + N + 1];
  return fx > fz ? h00 + (h10 - h00) * fx + (h11 - h10) * fz : h00 + (h11 - h01) * fx + (h01 - h00) * fz;
}
function slopeAt(H, i, j) {
  const a = H[j * N + Math.max(0, i - 1)], b = H[j * N + Math.min(N - 1, i + 1)], c = H[Math.max(0, j - 1) * N + i], d = H[Math.min(N - 1, j + 1) * N + i];
  return Math.hypot(b - a, d - c) / (2 * CELL);
}
export function terrainH(W, x, z) { return sampleGrid(W.H, x, z); }
export function surfaceAt(W, x, z) {
  const i = Math.round((x + HALF) / CELL), j = Math.round((z + HALF) / CELL);
  if (i < 0 || j < 0 || i >= N || j >= N) return SURF.WATER; return W.S[j * N + i];
}
function catmull(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), n = Math.max(2, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1].slice()); return out;
}
export function roadQuery(W, x, z, maxD = 8) {
  let best = null; const cx = Math.floor(x / 32), cz = Math.floor(z / 32);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const L = W.roadHash.get(((cx + dx) & 0xffff) << 16 | ((cz + dz) & 0xffff)); if (!L) continue;
    for (const [rd, i] of L) {
      const a = rd.pts[i], b = rd.pts[i + 1]; const d = segDist(x, z, a[0], a[2], b[0], b[2]);
      if (d < maxD && (!best || d < best.d)) {
        const ex = b[0] - a[0], ez = b[2] - a[2], l2 = ex * ex + ez * ez; const t = l2 ? clamp(((x - a[0]) * ex + (z - a[2]) * ez) / l2, 0, 1) : 0;
        best = { d, h: lerp(a[1], b[1], t) };
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// boxes + spatial grid
const GC = 16;
const gkey = (i, j) => ((i + 512) << 11) | (j + 512);
export function addBox(W, x0, x1, y0, y1, z0, z1, s = SURF.CONCRETE, b = -1, extra) {
  const bx = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0, y1, z0: Math.min(z0, z1), z1: Math.max(z0, z1), s, b, id: W.boxes.length, st: 0, tall: y1 - y0 > 7.5 };
  if (extra) Object.assign(bx, extra);
  W.boxes.push(bx);
  for (let i = Math.floor(bx.x0 / GC); i <= Math.floor(bx.x1 / GC); i++) for (let j = Math.floor(bx.z0 / GC); j <= Math.floor(bx.z1 / GC); j++) {
    const k = gkey(i, j); let L = W.grid.get(k); if (!L) W.grid.set(k, (L = [])); L.push(bx);
  }
  return bx;
}
export function boxesNear(W, x, z, rad, out = []) {
  out.length = 0; const st = ++W.stamp;
  for (let i = Math.floor((x - rad) / GC); i <= Math.floor((x + rad) / GC); i++) for (let j = Math.floor((z - rad) / GC); j <= Math.floor((z + rad) / GC); j++) {
    const L = W.grid.get(gkey(i, j)); if (!L) continue;
    for (const b of L) { if (b.st === st) continue; b.st = st; if (x + rad > b.x0 && x - rad < b.x1 && z + rad > b.z0 && z - rad < b.z1) out.push(b); }
  }
  return out;
}
const _near = [];
// highest walkable surface under (x,z) not above y+step
export function groundAt(W, x, z, y, step = 0.55, rad = 0, skipTall = false) {
  let g = terrainH(W, x, z);
  boxesNear(W, x, z, rad, _near);
  for (const b of _near) if (!b.nowalk && b.y1 <= y + step && b.y1 > g && !(skipTall && b.tall)) g = b.y1;
  return g;
}
// push a vertical cylinder (feet y, height h, radius rad) out of boxes; returns true if collided
export function collideCyl(W, p, rad, h, step = 0.45) {
  let hit = false;
  boxesNear(W, p.x, p.z, rad + 0.1, _near);
  for (const b of _near) {
    if (b.y1 <= p.y + step || b.y0 >= p.y + h) continue;
    const cx = clamp(p.x, b.x0, b.x1), cz = clamp(p.z, b.z0, b.z1);
    let dx = p.x - cx, dz = p.z - cz; const d2 = dx * dx + dz * dz;
    if (d2 >= rad * rad) continue;
    hit = true;
    if (d2 > 1e-8) { const d = Math.sqrt(d2), push = rad - d; p.x += dx / d * push; p.z += dz / d * push; }
    else { // centre inside box: push out along shortest axis
      const l = p.x - b.x0, rr = b.x1 - p.x, t = p.z - b.z0, bb = b.z1 - p.z, m = Math.min(l, rr, t, bb);
      if (m === l) p.x = b.x0 - rad; else if (m === rr) p.x = b.x1 + rad; else if (m === t) p.z = b.z0 - rad; else p.z = b.z1 + rad;
    }
  }
  return hit;
}
// lowest box bottom above head (for jumping inside)
export function ceilingAt(W, x, z, y, rad = 0.3) {
  let c = 1e9; boxesNear(W, x, z, rad, _near);
  for (const b of _near) if (b.y0 >= y - 0.05 && b.y0 < c && x > b.x0 - rad && x < b.x1 + rad && z > b.z0 - rad && z < b.z1 + rad) c = b.y0;
  return c;
}

// ray vs world: terrain march + boxes via grid DDA. Returns {t, x,y,z, nx,ny,nz, s} or null
export function raycast(W, ox, oy, oz, dx, dy, dz, maxD) {
  let best = maxD, bn = null, bs = 0;
  // boxes
  const st = ++W.stamp;
  let i = Math.floor(ox / GC), j = Math.floor(oz / GC);
  const si = dx > 0 ? 1 : -1, sj = dz > 0 ? 1 : -1;
  const tdx = Math.abs(dx) > 1e-9 ? GC / Math.abs(dx) : 1e9, tdz = Math.abs(dz) > 1e-9 ? GC / Math.abs(dz) : 1e9;
  let tmx = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (i + 1) * GC - ox : ox - i * GC) / Math.abs(dx)) : 1e9;
  let tmz = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (j + 1) * GC - oz : oz - j * GC) / Math.abs(dz)) : 1e9;
  let tc = 0;
  for (let it = 0; it < 400 && tc <= best; it++) {
    const L = W.grid.get(gkey(i, j));
    if (L) for (const b of L) {
      if (b.st === st) continue; b.st = st;
      if (b.noray) continue;
      const h = rayBox(ox, oy, oz, dx, dy, dz, b, best);
      if (h) { best = h.t; bn = h.n; bs = b.s; }
    }
    if (tmx < tmz) { tc = tmx; tmx += tdx; i += si; } else { tc = tmz; tmz += tdz; j += sj; }
  }
  // terrain + water
  let t = 0, prev = 0; const lim = Math.min(best, maxD);
  let above = oy - terrainH(W, ox, oz);
  if (above >= 0) {
    while (t < lim) {
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      const h = terrainH(W, x, z), g = y - Math.max(h, SEA);
      if (g < 0) {
        // refine
        let lo = prev, hi = t;
        for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2, yy = oy + dy * m, hh = terrainH(W, ox + dx * m, oz + dz * m); if (yy < Math.max(hh, SEA)) hi = m; else lo = m; }
        const hx = ox + dx * hi, hz = oz + dz * hi, hh = terrainH(W, hx, hz);
        if (hi < best) {
          best = hi;
          if (hh < SEA && oy + dy * hi <= SEA + 0.05) { bn = [0, 1, 0]; bs = SURF.WATER; }
          else { const e = 1.5, gx = terrainH(W, hx + e, hz) - terrainH(W, hx - e, hz), gz = terrainH(W, hx, hz + e) - terrainH(W, hx, hz - e); const l = Math.hypot(gx, 2 * e, gz); bn = [-gx / l, 2 * e / l, -gz / l]; bs = surfaceAt(W, hx, hz); }
        }
        break;
      }
      prev = t; t += clamp(g * 0.6, 0.4, 6);
    }
  }
  if (!bn) return null;
  return { t: best, x: ox + dx * best, y: oy + dy * best, z: oz + dz * best, nx: bn[0], ny: bn[1], nz: bn[2], s: bs };
}
function rayBox(ox, oy, oz, dx, dy, dz, b, maxT) {
  let t0 = 0, t1 = maxT, ax = -1;
  const sl = (o, d, lo, hi, axis) => {
    if (Math.abs(d) < 1e-12) return o >= lo && o <= hi;
    let a = (lo - o) / d, c = (hi - o) / d; if (a > c) { const s = a; a = c; c = s; }
    if (a > t0) { t0 = a; ax = axis; } if (c < t1) t1 = c; return t0 <= t1;
  };
  if (!sl(ox, dx, b.x0, b.x1, 0) || !sl(oy, dy, b.y0, b.y1, 1) || !sl(oz, dz, b.z0, b.z1, 2)) return null;
  if (t0 <= 0 || t0 >= maxT) return null;
  const n = ax === 0 ? [-Math.sign(dx), 0, 0] : ax === 1 ? [0, -Math.sign(dy), 0] : [0, 0, -Math.sign(dz)];
  return { t: t0, n };
}
export function losClear(W, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz); if (d < 0.01) return true;
  const h = raycast(W, ax, ay, az, dx / d, dy / d, dz / d, d - 0.2);
  return !h;
}
export function buildingAt(W, x, z) {
  for (const b of W.buildings) if (b.enter && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return b;
  return null;
}

// ---------------------------------------------------------------------------------------------
// building kit: walls with openings, enterable houses, towers, props, loot points
class Builder {
  constructor(W, r) { this.W = W; this.r = r; }
  floorY(x, z) { return terrainH(this.W, x, z); }
  // axis-aligned wall from (x0,z0) to (x1,z1) (either x0==x1 or z0==z1), with openings [{u,w,y0,y1}] (u from start)
  wall(bi, x0, z0, x1, z1, y, h, th, s, openings = [], style) {
    const W = this.W, alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const sx = Math.sign(x1 - x0) || 1, sz = Math.sign(z1 - z0) || 1;
    const seg = (u0, u1, yy0, yy1) => {
      if (u1 - u0 < 0.02 || yy1 - yy0 < 0.02) return;
      if (alongX) addBox(W, x0 + sx * u0, x0 + sx * u1, yy0, yy1, z0 - th / 2, z0 + th / 2, s, bi, { st2: style });
      else addBox(W, x0 - th / 2, x0 + th / 2, yy0, yy1, z0 + sz * u0, z0 + sz * u1, s, bi, { st2: style });
    };
    const ops = openings.slice().sort((a, b) => a.u - b.u); let u = 0;
    for (const o of ops) {
      const a = clamp(o.u - o.w / 2, 0, len), b2 = clamp(o.u + o.w / 2, 0, len);
      seg(u, a, y, y + h); seg(a, b2, y, y + o.y0); seg(a, b2, y + o.y1, y + h); u = b2;
    }
    seg(u, len, y, y + h);
  }
  // enterable rectangular building. opts: {h, th, s, style, doors:[{side,u,w}], windows:true, part:true, roof:'pitch'|'flat', loot:n, tier}
  house(cx, cz, w, d, o = {}) {
    const W = this.W, r = this.r, x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const y = o.y != null ? o.y : Math.max(this.floorY(cx, cz), this.floorY(x0, z0), this.floorY(x1, z1), this.floorY(x0, z1), this.floorY(x1, z0), 0.5) + 0.12;
    const h = o.h || 3.2, th = o.th || 0.25, s = o.s || SURF.CONCRETE;
    const bi = W.buildings.length;
    const bld = { i: bi, type: o.type || "house", x0, x1, z0, z1, y, h, enter: true, style: o.style || "plaster", roof: o.roof || "flat", col: o.col, doors: [], tier: o.tier || 1, poi: o.poi };
    W.buildings.push(bld);
    addBox(W, x0, x1, y - 3, y, z0, z1, s === SURF.WOOD ? SURF.WOOD : SURF.CONCRETE, bi, { floor: true }); // floor slab
    addBox(W, x0 - 0.2, x1 + 0.2, y + h, y + h + 0.25, z0 - 0.2, z1 + 0.2, s, bi, { roof: true });
    const sides = { n: [x0, z0, x1, z0], s: [x0, z1, x1, z1], w: [x0, z0, x0, z1], e: [x1, z0, x1, z1] };
    const doors = o.doors || [{ side: "s", u: 0.5, w: 1.4 }];
    for (const k of ["n", "s", "e", "w"]) {
      const [ax, az, bx, bz] = sides[k], len = Math.abs(bx - ax) + Math.abs(bz - az), ops = [];
      for (const dd of doors.filter((q) => q.side === k)) {
        const u = dd.u * len, dh = dd.h || 2.3; ops.push({ u, w: dd.w, y0: 0, y1: dh });
        const ox = k === "e" ? 1 : k === "w" ? -1 : 0, oz = k === "s" ? 1 : k === "n" ? -1 : 0;
        const px = k === "n" || k === "s" ? ax + u : ax, pz = k === "w" || k === "e" ? az + u : az;
        bld.doors.push({ x: px, z: pz, ox, oz, w: dd.w });
      }
      if (o.windows !== false && len > 5) {
        const nW = Math.floor(len / 4);
        for (let q = 0; q < nW; q++) { const u = (q + 0.5) * len / nW; if (ops.some((p) => Math.abs(p.u - u) < p.w / 2 + 1.1)) continue; if (r() < 0.75) ops.push({ u, w: 1.2, y0: 1.0, y1: Math.min(2.2, h - 0.5), win: true }); }
      }
      bld[k + "Ops"] = ops;
      this.wall(bi, ax, az, bx, bz, y, h, th, s, ops, bld.style);
    }
    // partition wall with doorway
    if (o.part !== false && w >= 8 && d >= 7) {
      const along = w > d; // split the long axis
      if (along) { const px = cx + (r() - 0.5) * w * 0.2; this.wall(bi, px, z0, px, z1, y, h, 0.15, s, [{ u: d * (0.3 + r() * 0.4), w: 1.1, y0: 0, y1: 2.2 }], bld.style); bld.part = { x: px }; }
      else { const pz = cz + (r() - 0.5) * d * 0.2; this.wall(bi, x0, pz, x1, pz, y, h, 0.15, s, [{ u: w * (0.3 + r() * 0.4), w: 1.1, y0: 0, y1: 2.2 }], bld.style); bld.part = { z: pz }; }
    }
    // furniture + loot
    const nl = o.loot != null ? o.loot : 2 + Math.floor(r() * 2);
    for (let q = 0; q < nl; q++) {
      const lx = lerp(x0 + 0.9, x1 - 0.9, r()), lz = lerp(z0 + 0.9, z1 - 0.9, r());
      if (bld.part && ((bld.part.x != null && Math.abs(lx - bld.part.x) < 0.6) || (bld.part.z != null && Math.abs(lz - bld.part.z) < 0.6))) continue;
      W.loot.push({ x: lx, y, z: lz, tier: bld.tier, b: bi });
    }
    if (o.furnish !== false) {
      const nf = Math.floor(w * d / 30);
      for (let q = 0; q < nf; q++) {
        const kind = this.r.pick(o.furn || ["table", "shelf", "bed", "crates", "sofa"]);
        const side = this.r.int(0, 3), fx = side === 0 ? x0 + 0.8 : side === 1 ? x1 - 0.8 : lerp(x0 + 1.5, x1 - 1.5, this.r()), fz = side === 2 ? z0 + 0.8 : side === 3 ? z1 - 0.8 : lerp(z0 + 1.5, z1 - 1.5, this.r());
        if (bld.doors.some((dd) => Math.hypot(dd.x - fx, dd.z - fz) < 2.2)) continue;
        W.props.push({ kind, x: fx, y, z: fz, rot: side < 2 ? Math.PI / 2 : 0 });
        if (kind === "shelf" || kind === "crates") addBox(W, fx - 0.5, fx + 0.5, y, y + (kind === "shelf" ? 1.9 : 1.0), fz - 0.5, fz + 0.5, SURF.WOOD, bi, { prop: true });
      }
    }
    return bld;
  }
  // solid block (tower/silo/etc). lobby: ground floor enterable
  solid(cx, cz, w, d, h, o = {}) {
    const W = this.W, x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const y = o.y != null ? o.y : Math.min(this.floorY(cx, cz), this.floorY(x0, z0), this.floorY(x1, z1), this.floorY(x0, z1), this.floorY(x1, z0)) - 0.3;
    const bi = W.buildings.length;
    const bld = { i: bi, type: o.type || "block", x0, x1, z0, z1, y, h, enter: false, style: o.style || "concrete", roof: "flat", col: o.col, solid: true, tier: o.tier || 1, poi: o.poi, shape: o.shape };
    W.buildings.push(bld);
    if (o.lobby) {
      const lh = 5.2; const yy = Math.max(this.floorY(cx, cz), 0.5) + 0.12; bld.y = yy;
      const lb = this.house(cx, cz, w, d, { y: yy, h: lh, th: 0.4, s: SURF.CONCRETE, style: "glass", doors: o.doors, windows: false, part: false, loot: o.loot != null ? o.loot : 3, tier: bld.tier, type: "lobby", furnish: false });
      lb.lobbyOf = bi; bld.lobby = lb.i;
      // glass openings across the lobby front (visual windows, not walkable)
      addBox(W, x0, x1, yy + lh + 0.25, yy + h, z0, z1, o.s || SURF.CONCRETE, bi);
      // pillar + desk
      W.props.push({ kind: "desk", x: cx, y: yy, z: cz, rot: 0 }); addBox(W, cx - 1.4, cx + 1.4, yy, yy + 1.1, cz - 0.5, cz + 0.5, SURF.WOOD, lb.i, { prop: true });
    } else addBox(W, x0, x1, y, y + h, z0, z1, o.s || SURF.CONCRETE, bi);
    return bld;
  }
  crate(x, z, tier, y) { const W = this.W; const yy = y != null ? y : groundAt(W, x, z, 999); W.crates.push({ x, y: yy, z, tier }); }
}

// ---------------------------------------------------------------------------------------------
function buildLosPepinos(B, W, r) {
  const P = POI.lp; W.paint(285, 595, 285, 565, SURF.CONCRETE);
  // street grid: avenues along z at these x, streets along x at these z
  const AX = [300, 360, 430, 500, 580], SZ = [300, 360, 420, 480, 545];
  W.lpStreets = { AX, SZ };
  for (const x of AX) W.roads.push({ pts: [[x, 4.06, 290], [x, 4.06, 560]], w: 10, city: true });
  for (const z of SZ) W.roads.push({ pts: [[290, 4.06, z], [590, 4.06, z]], w: z === 545 ? 14 : 10, city: true, boulevard: z === 545 });
  // blocks
  const blocks = [];
  for (let a = 0; a < AX.length - 1; a++) for (let s = 0; s < SZ.length - 1; s++) blocks.push({ x0: AX[a] + 7, x1: AX[a + 1] - 7, z0: SZ[s] + 7, z1: SZ[s + 1] - 7, a, s });
  // raised sidewalks around every block (walkable, 10 cm kerb)
  for (const bk of blocks) addBox(W, bk.x0 - 2, bk.x1 + 2, 3.6, 4.1, bk.z0 - 2, bk.z1 + 2, SURF.CONCRETE, -1, { floor: true, kerb: true });
  for (const bk of blocks) {
    const cx = (bk.x0 + bk.x1) / 2, cz = (bk.z0 + bk.z1) / 2, bw = bk.x1 - bk.x0, bd = bk.z1 - bk.z0;
    const downtown = bk.a >= 1 && bk.a <= 2 && bk.s <= 2;
    if (downtown) {
      // two towers per block
      const n = bw > 50 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const tw = bw / n - 6, tx = bk.x0 + (k + 0.5) * bw / n, td = Math.min(bd - 6, 18 + r() * 14);
        const h = 26 + r() * 46 + (bk.a === 2 && bk.s === 1 ? 30 : 0);
        B.solid(tx, cz, Math.min(tw, 24), td, h, { lobby: true, doors: [{ side: "s", u: 0.5, w: 2.4, h: 3.2 }, { side: "n", u: 0.5, w: 2.4, h: 3.2 }], tier: 3, poi: "lp", style: "tower", type: "tower", col: r.pick([0x8c949c, 0x6f7e8a, 0xa59a88, 0x5e6b74, 0x91897c]) });
      }
    } else {
      // shops/houses with palm-lined streets
      const nx = Math.max(1, Math.floor(bw / 16)), nzn = Math.max(1, Math.floor(bd / 16));
      for (let i = 0; i < nx; i++) for (let j = 0; j < nzn; j++) {
        if (r() < 0.2) continue;
        const sx = bk.x0 + (i + 0.5) * bw / nx, sz = bk.z0 + (j + 0.5) * bd / nzn, w = bw / nx - 3.5, d = bd / nzn - 3.5;
        if (r() < 0.25) { B.solid(sx, sz, w, d, 8 + r() * 10, { tier: 3, poi: "lp", style: "stucco", type: "block", col: r.pick([0xd8c6a5, 0xc9a98a, 0xb8c2b0, 0xe0d4bc]) }); continue; }
        const side = j === 0 ? "n" : "s";
        B.house(sx, sz, w, d, { h: 4.2, doors: [{ side, u: 0.5, w: 1.8 }, { side: i === 0 ? "w" : "e", u: 0.5, w: 1.3 }], roof: "flat", style: "stucco", tier: 3, poi: "lp", type: "shop", col: r.pick([0xd8c6a5, 0xc9a98a, 0xb8c2b0, 0xe6d3b3, 0xc7b39a]), furn: ["shelf", "table", "crates", "counter"] });
      }
    }
  }
  // palms along the beach boulevard and Relish Ave (x=430)
  for (let x = 296; x <= 584; x += 12) { W.palms.push([x, 556]); }
  for (let z = 296; z <= 540; z += 14) { W.palms.push([425, z]); W.palms.push([435, z]); }
  // pier with the Ferris wheel
  const pz0 = 552, pz1 = 760, px = 430, py = 3.3;
  W.special.pier = { x: px, z0: pz0, z1: pz1, y: py };
  addBox(W, px - 7, px + 7, py - 0.5, py, pz0, pz1, SURF.WOOD, -1, { deck: true });
  addBox(W, px - 22, px + 22, py - 0.5, py, 680, 740, SURF.WOOD, -1, { deck: true });
  // railings
  for (const sx of [-7, 7]) { addBox(W, px + sx - 0.08, px + sx + 0.08, py, py + 1.0, pz0 + 6, 680, SURF.WOOD, -1, { rail: true }); }
  W.special.ferris = { x: px + 8, z: 712, y: py, r: 18 };
  addBox(W, px + 8 - 2, px + 8 + 2, py, py + 20, 710, 714, SURF.METAL, -1);
  B.house(px - 13, 700, 8, 8, { y: py + 0.12, h: 3.2, s: SURF.WOOD, style: "wood", roof: "flat", tier: 3, poi: "lp", type: "kiosk", doors: [{ side: "e", u: 0.5, w: 1.6 }], col: 0xc8a477 });
  B.crate(px - 15, 726, 3, py); B.crate(px + 18, 690, 3, py);
  // hillside sign: letters on the slope north of town, facing south
  const letters = "LOS PEPINOS"; const sx0 = 340, step = 16;
  W.special.sign = [];
  for (let i = 0; i < letters.length; i++) {
    if (letters[i] === " ") continue; const x = sx0 + i * step, z = 225 + Math.sin(i * 0.7) * 4;
    W.special.sign.push({ ch: letters[i], x, z, y: terrainH(W, x, z) - 1 });
  }
  // crates and street loot
  for (let k = 0; k < 7; k++) { const a = r.pick(AX), z = r.range(310, 540); B.crate(a + r.pick([-3.5, 3.5]), z, 3); }
  for (let k = 0; k < 20; k++) { const x = r.range(300, 580), z = r.range(300, 545); if (W.buildings.some((b) => x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1)) continue; W.loot.push({ x, y: groundAt(W, x, z, 999), z, tier: 3, b: -1 }); }
  // street lights
  for (const x of AX) for (let z = 305; z < 560; z += 30) W.lights.push([x + 5.5, z]);
  // parked cars
  W.special.cars = [];
  for (let k = 0; k < 26; k++) { const vert = r() < 0.5; const a = vert ? r.pick(AX) + r.pick([-3.6, 3.6]) : r.range(305, 585), b = vert ? r.range(305, 540) : r.pick(SZ) + r.pick([-3.6, 3.6]); W.special.cars.push({ x: a, z: b, rot: vert ? 0 : Math.PI / 2, col: r.pick([0x7a1f1f, 0x2b3a4a, 0xb9b4a6, 0x232323, 0x4b5a3a, 0x8a6a2a]) }); addBox(W, a - (vert ? 1 : 2.2), a + (vert ? 1 : 2.2), 4, 5.4, b - (vert ? 2.2 : 1), b + (vert ? 2.2 : 1), SURF.METAL, -1, { car: true }); }
}

function buildAirfield(B, W, r) {
  W.paint(-560, -480, -220, 460, SURF.ROAD); W.paint(-480, -385, 50, 210, SURF.CONCRETE);
  W.special.runway = { x: -520, z0: -220, z1: 460, w: 40 };
  // hangars: open fronts facing west (towards runway)
  for (let k = 0; k < 3; k++) {
    const cz = 75 + k * 48;
    B.house(-425, cz, 30, 36, { h: 9, th: 0.4, s: SURF.METAL, style: "metal", roof: "arch", doors: [{ side: "w", u: 0.5, w: 22, h: 7.5 }, { side: "e", u: 0.5, w: 1.6 }], windows: false, part: false, loot: 4, tier: 2, poi: "airfield", type: "hangar", col: 0x6d7569, furn: ["crates", "shelf"] });
  }
  B.solid(-430, 20, 9, 9, 22, { lobby: true, doors: [{ side: "w", u: 0.5, w: 2, h: 3 }], tier: 2, poi: "airfield", type: "ctower", style: "concrete", col: 0x9a978c, loot: 3 });
  W.special.ctower = { x: -430, z: 20, h: 22 };
  B.house(-430, -40, 14, 10, { h: 3.4, doors: [{ side: "w", u: 0.5, w: 1.4 }, { side: "e", u: 0.3, w: 1.4 }], tier: 2, poi: "airfield", type: "office", style: "concrete", col: 0xb5b0a2 });
  B.house(-430, -80, 12, 10, { h: 3.4, doors: [{ side: "w", u: 0.5, w: 1.4 }], tier: 2, poi: "airfield", type: "office", style: "concrete", col: 0xa8a597 });
  // fuel tanks
  for (let k = 0; k < 3; k++) { const x = -405 + k * 9, z = -130; W.props.push({ kind: "tank", x, y: terrainH(W, x, z), z, rot: 0 }); addBox(W, x - 3, x + 3, terrainH(W, x, z), terrainH(W, x, z) + 6, z - 3, z + 3, SURF.METAL, -1); }
  W.special.parkedPlane = { x: -490, z: -120, rot: 0.2 };
  addBox(W, -494, -486, 6, 11, -138, -100, SURF.METAL, -1);
  for (let k = 0; k < 3; k++) B.crate(-455 + k * 3, 50 + k * 40, 2);
  // practice range: targets down the north end of the runway
  W.special.range = { x: -520, z: 440 };
  addBox(W, -545, -495, 6, 7.1, 437.4, 438, SURF.CONCRETE, -1); // firing line barrier
}

function buildPort(B, W, r) {
  W.paint(500, 700, -360, -140, SURF.CONCRETE);
  // container stacks
  const cols = [0x8a3b2a, 0x2d5a7a, 0x6b7a3a, 0xb5862f, 0x4a4f57, 0x7a2f4f, 0x33615a];
  W.special.containers = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
    const x = 530 + i * 22, z = -330 + j * 28; if (r() < 0.18) continue;
    const st = 1 + Math.floor(r() * 3);
    for (let k = 0; k < st; k++) {
      const y = 3 + k * 2.6, rot = (i + j) % 3 === 0;
      const w = rot ? 2.5 : 12.2, d = rot ? 12.2 : 2.5;
      W.special.containers.push({ x, y, z, w, d, col: r.pick(cols) });
      addBox(W, x - w / 2, x + w / 2, y, y + 2.6, z - d / 2, z + d / 2, SURF.METAL, -1);
      if (k === 0 && r() < 0.35) W.loot.push({ x: x + (rot ? 2.2 : 0), y: 3, z: z + (rot ? 0 : 2.2), tier: 2, b: -1 });
    }
  }
  // warehouses
  B.house(560, -170, 34, 22, { h: 8, s: SURF.METAL, style: "metal", roof: "flat", doors: [{ side: "s", u: 0.5, w: 8, h: 5.5 }, { side: "n", u: 0.25, w: 1.5 }], windows: false, part: false, loot: 5, tier: 2, poi: "port", type: "warehouse", col: 0x7b8578, furn: ["crates", "shelf", "crates"] });
  B.house(640, -170, 28, 20, { h: 8, s: SURF.METAL, style: "metal", roof: "flat", doors: [{ side: "s", u: 0.5, w: 7, h: 5.5 }, { side: "w", u: 0.5, w: 1.5 }], windows: false, part: false, loot: 4, tier: 2, poi: "port", type: "warehouse", col: 0x8a7b68, furn: ["crates", "shelf"] });
  B.house(520, -200, 10, 8, { h: 3.2, doors: [{ side: "e", u: 0.5, w: 1.3 }], tier: 2, poi: "port", type: "office", style: "concrete", col: 0xc0b8a8 });
  // cranes (visual) along the quay
  W.special.cranes = [{ x: 695, z: -300 }, { x: 695, z: -230 }];
  for (const c of W.special.cranes) { addBox(W, c.x - 6, c.x - 4.5, 3, 34, c.z - 6, c.z - 4.5, SURF.METAL, -1); addBox(W, c.x - 6, c.x - 4.5, 3, 34, c.z + 4.5, c.z + 6, SURF.METAL, -1); addBox(W, c.x + 4.5, c.x + 6, 3, 34, c.z - 6, c.z - 4.5, SURF.METAL, -1); addBox(W, c.x + 4.5, c.x + 6, 3, 34, c.z + 4.5, c.z + 6, SURF.METAL, -1); }
  for (let k = 0; k < 3; k++) B.crate(r.range(520, 680), r.range(-350, -240), 2);
}

function buildFarm(B, W, r) {
  const P = POI.farm;
  // crop fields (vertex-colour stripes)
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * Math.PI * 2 + 0.3, d = 95 + r() * 40, x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d;
    const w = 50 + r() * 30, dd = 40 + r() * 30; W.fields.push({ x0: x - w / 2, x1: x + w / 2, z0: z - dd / 2, z1: z + dd / 2, kind: k % 3 });
    W.paint(x - w / 2, x + w / 2, z - dd / 2, z + dd / 2, SURF.FARM);
  }
  B.house(P.x - 20, P.z - 10, 16, 22, { h: 7, s: SURF.WOOD, style: "barn", roof: "pitch", doors: [{ side: "s", u: 0.5, w: 4.2, h: 4.5 }, { side: "n", u: 0.5, w: 4.2, h: 4.5 }], windows: false, part: false, loot: 4, tier: 1, poi: "farm", type: "barn", col: 0x7a2e22, furn: ["crates", "hay"] });
  B.house(P.x + 30, P.z + 18, 14, 18, { h: 6.5, s: SURF.WOOD, style: "barn", roof: "pitch", doors: [{ side: "w", u: 0.5, w: 4, h: 4.5 }], windows: false, part: false, loot: 3, tier: 1, poi: "farm", type: "barn", col: 0x6a3a26, furn: ["crates", "hay"] });
  B.house(P.x + 18, P.z - 36, 11, 9, { h: 3.2, roof: "pitch", doors: [{ side: "s", u: 0.4, w: 1.3 }, { side: "e", u: 0.5, w: 1.2 }], tier: 1, poi: "farm", type: "house", style: "plaster", col: 0xd8cdb4 });
  B.house(P.x - 50, P.z + 30, 9, 8, { h: 3.0, roof: "pitch", doors: [{ side: "n", u: 0.5, w: 1.3 }], tier: 1, poi: "farm", type: "house", style: "plaster", col: 0xcab89a });
  for (let k = 0; k < 2; k++) { const x = P.x - 2 + k * 7, z = P.z - 30; const y = terrainH(W, x, z); W.props.push({ kind: "silo", x, y, z, rot: 0 }); addBox(W, x - 2.6, x + 2.6, y, y + 14, z - 2.6, z + 2.6, SURF.METAL, -1); }
  for (let k = 0; k < 14; k++) { const x = P.x + r.range(-70, 70), z = P.z + r.range(-60, 60); if (W.buildings.some((b) => x > b.x0 - 3 && x < b.x1 + 3 && z > b.z0 - 3 && z < b.z1 + 3)) continue; const y = terrainH(W, x, z); W.props.push({ kind: "hay", x, y, z, rot: r() * 3 }); addBox(W, x - 0.8, x + 0.8, y, y + 1.4, z - 0.8, z + 0.8, SURF.WOOD, -1, { prop: true }); }
  B.crate(P.x - 20, P.z + 4, 1); B.crate(P.x + 40, P.z - 10, 1);
  for (let k = 0; k < 8; k++) { const x = P.x + r.range(-90, 90), z = P.z + r.range(-90, 90); W.loot.push({ x, y: terrainH(W, x, z), z, tier: 1, b: -1 }); }
}

function buildQuarry(B, W, r) {
  const Q = W.quarry;
  B.house(Q.x - 30, Q.z + 20, 12, 8, { h: 3.4, s: SURF.METAL, style: "metal", doors: [{ side: "n", u: 0.5, w: 1.4 }], tier: 2, poi: "quarry", type: "shed", col: 0x8c7d5c });
  B.house(Q.x + 26, Q.z - 18, 10, 8, { h: 3.4, s: SURF.METAL, style: "metal", doors: [{ side: "w", u: 0.5, w: 1.4 }], tier: 2, poi: "quarry", type: "shed", col: 0x7c8a8c });
  B.solid(Q.x + 8, Q.z + 30, 10, 16, 9, { tier: 2, poi: "quarry", style: "metal", type: "crusher", col: 0x9a8a4a, s: SURF.METAL });
  for (let k = 0; k < 4; k++) { const x = Q.x + r.range(-40, 40), z = Q.z + r.range(-40, 40); const y = terrainH(W, x, z); W.props.push({ kind: "truck", x, y, z, rot: r() * 6 }); addBox(W, x - 2, x + 2, y, y + 3, z - 2, z + 2, SURF.METAL, -1); }
  for (let k = 0; k < 6; k++) { const x = Q.x + r.range(-45, 45), z = Q.z + r.range(-45, 45); W.loot.push({ x, y: groundAt(W, x, z, 999), z, tier: 2, b: -1 }); }
  B.crate(Q.x, Q.z, 2); B.crate(Q.x - 18, Q.z - 22, 2);
}

function buildCompound(B, W, r) {
  const P = POI.compound, y = terrainH(W, P.x, P.z);
  W.paint(P.x - 70, P.x + 70, P.z - 70, P.z + 70, SURF.CONCRETE);
  // perimeter wall with gates
  const R = 62, wh = 3.2;
  const wy = y - 0.4;
  B.wall(-1, P.x - R, P.z - R, P.x + R, P.z - R, wy, wh, 0.6, SURF.CONCRETE, [{ u: R, w: 8, y0: 0, y1: 99 }], "wall");
  B.wall(-1, P.x - R, P.z + R, P.x + R, P.z + R, wy, wh, 0.6, SURF.CONCRETE, [{ u: R * 0.6, w: 8, y0: 0, y1: 99 }], "wall");
  B.wall(-1, P.x - R, P.z - R, P.x - R, P.z + R, wy, wh, 0.6, SURF.CONCRETE, [{ u: R, w: 8, y0: 0, y1: 99 }], "wall");
  B.wall(-1, P.x + R, P.z - R, P.x + R, P.z + R, wy, wh, 0.6, SURF.CONCRETE, [{ u: R * 1.3, w: 8, y0: 0, y1: 99 }], "wall");
  W.special.compoundWall = { x: P.x, z: P.z, R, y: wy, h: wh };
  B.house(P.x, P.z - 18, 22, 14, { h: 4, th: 0.4, doors: [{ side: "s", u: 0.5, w: 1.6 }, { side: "n", u: 0.3, w: 1.4 }, { side: "e", u: 0.5, w: 1.4 }], tier: 4, poi: "compound", type: "hq", style: "bunker", col: 0x8b8c80, loot: 5 });
  B.house(P.x - 34, P.z + 20, 12, 18, { h: 3.4, doors: [{ side: "e", u: 0.3, w: 1.4 }, { side: "e", u: 0.75, w: 1.4 }], tier: 4, poi: "compound", type: "barracks", style: "bunker", col: 0x7d8073 });
  B.house(P.x + 32, P.z + 22, 12, 16, { h: 3.4, doors: [{ side: "w", u: 0.5, w: 1.4 }, { side: "s", u: 0.5, w: 1.4 }], tier: 4, poi: "compound", type: "armory", style: "bunker", col: 0x6f7468 });
  B.house(P.x + 2, P.z + 34, 10, 8, { h: 3.0, doors: [{ side: "n", u: 0.5, w: 1.4 }], tier: 4, poi: "compound", type: "store", style: "bunker", col: 0x84877a });
  // watchtowers (visual + small platform collider)
  W.special.watch = [];
  for (const [dx, dz] of [[-R + 4, -R + 4], [R - 4, R - 4]]) { const x = P.x + dx, z = P.z + dz, ty = terrainH(W, x, z); W.special.watch.push({ x, z, y: ty }); addBox(W, x - 2, x + 2, ty + 7, ty + 7.3, z - 2, z + 2, SURF.WOOD, -1); for (const [a, b] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) addBox(W, x + a - 0.15, x + a + 0.15, ty, ty + 7, z + b - 0.15, z + b + 0.15, SURF.WOOD, -1); }
  for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28, x = P.x + Math.cos(a) * 46, z = P.z + Math.sin(a) * 46; B.crate(x, z, 4); }
  for (let k = 0; k < 10; k++) { const x = P.x + r.range(-55, 55), z = P.z + r.range(-55, 55); if (W.buildings.some((b) => x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1)) continue; W.loot.push({ x, y: groundAt(W, x, z, 999), z, tier: 4, b: -1 }); }
  // sandbag cover
  for (let k = 0; k < 8; k++) { const x = P.x + r.range(-50, 50), z = P.z + r.range(-50, 50); if (W.buildings.some((b) => x > b.x0 - 3 && x < b.x1 + 3 && z > b.z0 - 3 && z < b.z1 + 3)) continue; const yy = terrainH(W, x, z), rot = r() < 0.5; W.props.push({ kind: "sandbags", x, y: yy, z, rot: rot ? Math.PI / 2 : 0 }); addBox(W, x - (rot ? 0.5 : 2), x + (rot ? 0.5 : 2), yy, yy + 1.1, z - (rot ? 2 : 0.5), z + (rot ? 2 : 0.5), SURF.DIRT, -1, { prop: true }); }
}

function buildHamlet(B, W, r, P, n) {
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2 + r() * 0.5, d = 18 + r() * 26, x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d;
    const w = 8 + r() * 4, dd = 7 + r() * 3; const rot = r() < 0.5;
    const sides = ["n", "s", "e", "w"]; const d1 = r.pick(sides);
    B.house(x, z, rot ? dd : w, rot ? w : dd, { h: 3.1, roof: "pitch", doors: [{ side: d1, u: 0.5, w: 1.3 }, { side: r.pick(sides.filter((s) => s !== d1)), u: 0.4, w: 1.2 }], tier: 1, poi: P.id, type: "house", style: r.pick(["plaster", "plaster", "wood", "brick"]), col: r.pick([0xd8cdb4, 0xc9b79a, 0xb7a58a, 0xd2c3a7, 0xa98f72, 0x9fa596]) });
  }
  B.crate(P.x, P.z, 1);
  for (let k = 0; k < 4; k++) { const x = P.x + r.range(-40, 40), z = P.z + r.range(-40, 40); if (W.buildings.some((b) => x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1)) continue; W.loot.push({ x, y: terrainH(W, x, z), z, tier: 1, b: -1 }); }
}

function buildRelay(B, W, r, P) {
  const y = terrainH(W, P.x, P.z);
  (W.special.masts = W.special.masts || []).push({ x: P.x, z: P.z, y, h: 48 });
  addBox(W, P.x - 2.5, P.x + 2.5, y, y + 48, P.z - 2.5, P.z + 2.5, SURF.METAL, -1, { mast: true, noray: true });
  B.house(P.x + 9, P.z, 6, 5, { h: 2.8, s: SURF.CONCRETE, doors: [{ side: "w", u: 0.5, w: 1.2 }], part: false, tier: 2, poi: P.id, type: "hut", style: "concrete", col: 0xa7a89a, loot: 2 });
  B.crate(P.x - 6, P.z + 5, 2);
}

function scatterNature(W, r, nz) {
  const nearBuilding = (x, z, m) => { for (const b of W.buildings) if (x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m) return true; return false; };
  const inPoi = (x, z, m) => POIS.some((p) => Math.hypot(x - p.x, z - p.z) < p.r * 0.7 + m);
  const inField = (x, z) => W.fields.some((f) => x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1);
  let tries = 0;
  while (W.trees.length < 2600 && tries++ < 30000) {
    const x = r.range(-950, 950), z = r.range(-950, 950); const s = surfaceAt(W, x, z);
    if (s !== SURF.GRASS) continue; const forest = nz.fbm(x * 0.006 + 40, z * 0.006 - 11, 3);
    if (forest < 0.5 && r() > 0.12) continue;
    if (inPoi(x, z, 0) || nearBuilding(x, z, 6) || inField(x, z) || roadQuery(W, x, z, 7)) continue;
    const y = terrainH(W, x, z); if (y < 2.5) continue;
    const kind = y > 26 || forest > 0.62 ? 0 : (r() < 0.5 ? 1 : 0); const sc = 0.8 + r() * 0.6;
    W.trees.push({ x, y, z, kind, s: sc, rot: r() * 6.28 });
    addBox(W, x - 0.35 * sc, x + 0.35 * sc, y, y + 5 * sc, z - 0.35 * sc, z + 0.35 * sc, SURF.WOOD, -1, { tree: true });
  }
  // beach palms
  tries = 0;
  while (W.palms.length < 260 && tries++ < 20000) { const x = r.range(-900, 900), z = r.range(-900, 900); const h = terrainH(W, x, z); if (h < 1.2 || h > 4 || surfaceAt(W, x, z) !== SURF.SAND) continue; if (nearBuilding(x, z, 4)) continue; W.palms.push([x, z]); }
  for (const p of W.palms) { const y = terrainH(W, p[0], p[1]); p.push(y); addBox(W, p[0] - 0.25, p[0] + 0.25, y, y + 6, p[1] - 0.25, p[1] + 0.25, SURF.WOOD, -1, { tree: true }); }
  // rocks
  tries = 0;
  while (W.rocks.length < 520 && tries++ < 20000) {
    const x = r.range(-950, 950), z = r.range(-950, 950); const s = surfaceAt(W, x, z), y = terrainH(W, x, z);
    if (s === SURF.WATER || s === SURF.ROAD || s === SURF.CONCRETE || s === SURF.FARM || y < 0.5 || nearBuilding(x, z, 4)) continue;
    if (s !== SURF.ROCK && r() > 0.35) continue;
    const sc = 0.6 + r() * (s === SURF.ROCK ? 3.2 : 1.6);
    W.rocks.push({ x, y, z, s: sc, rot: r() * 6.28 });
    if (sc > 1.1) addBox(W, x - sc * 0.8, x + sc * 0.8, y - 1, y + sc * 1.1, z - sc * 0.8, z + sc * 0.8, SURF.ROCK, -1, { rock: true });
  }
}

export function poiAt(x, z) {
  let best = null, bd = 1e9;
  for (const p of POIS) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r + 40 && d < bd) { bd = d; best = p; } }
  return best;
}
export function onLand(W, x, z) { return terrainH(W, x, z) > 0.8; }
