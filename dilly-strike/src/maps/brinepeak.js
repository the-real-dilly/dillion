/* ==========================================================================
   DILLY STRIKE — map: de_brinepeak "Brinepeak Monastery" (original layout)
   Three bomb sites on a mountain monastery: A "Lantern Court", B "Bell
   Courtyard" in the centre, C "Drum Yard". Attackers enter from the Lower
   Gate (south), defenders hold the Upper Cloister (north). Routes: Cypress
   Walk (A long) and Prayer Stairs (A short) off Market Steps (A lobby); Koi
   Garden mid with the Moon Gate into B; the covered Kiln Hall connector from
   mid to Cart Road (C long). Architecture: stone plinths, lime plaster,
   red-lacquer timber, glazed tiled hip roofs and a two-tier pagoda, paper
   lanterns, a bronze bell pavilion, koi ponds, pines and bamboo.
   Layout is authored as a 2 m cell grid (below): walls/cover/colliders,
   the radar, the minimap art and bot navigation (A*) all derive from it.
   ========================================================================== */
import * as THREE from 'three';
import * as TX from '../textures.js';
import { worldMaterial, chamferBox, Batch, decalMat, siteLetterTex, materialLibrary } from '../mapdetail.js';
import { registerEnv } from '../render.js';
import { usePhoto } from '../photomat.js';

// H perimeter · # wall/building · . floor · 1/2/3 site A/B/C · D defender spawn · T attacker spawn
// g covered hall · c crate · C crate stack · w balustrade · o lacquered column · p pond · t pine planter
const GRID = `HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH
H#######..........DDDDDDDDDDDDDDDD.......##########H
H#######..........DDDDDDDDDDDDDDDD.......##########H
H#######..........DDDCDDDDDDDDCDDD#333333333333333#H
H#11111111111111##DDDDDDDDDDDDDDDD#333333333333t33#H
H#111111o1111o11##DDDDDDDDDDDDDDDD#33c333333333333#H
H#11111111c11111########....#######33333CC33333333#H
H#1111CC11111111########....#######333333333333333#H
H#111111111111t1...#####....#####..333333333333333#H
H#1c111111111111...#####....#####..33333333333c333#H
H#111111111C1111...22222222222222..333www333333333#H
H#11www111111111###2c222222222222##333333333333333#H
H#11111111111111###222222222222C2##########.....###H
H#....######...####22222pppp22222##########.....###H
H#t...######...####22222pppp22222##########.....###H
H#....######...####22222pppp22222##########.....###H
H#....######...####22222222222222##########..c..###H
H#....######...####22C22222222222##########.....###H
H#....######...####2222222222c222##########.....###H
H#....######...####22222222222222##########.....###H
H#.c..######...#####..##....###############.....###H
H#....######...#####..##....###############.....###H
H#....######...######........t.############...c.###H
H#....######...######.c........gggggggggggg.....###H
H#....######...######..........ggggoggggggg.....###H
H#....##..........###...pppp...ggggggggoggg.....###H
H#..C.##..........###...pppp...gggggggggggg.....###H
H#....##..c.......###...pppp...############.....###H
H#................###..........############.C...###H
H#................###........C.############.....###H
H#.......t.....C..###.t........############.....###H
H#................###..........############.....###H
H#######..........######....###############.....###H
H###########.....#######....##########..........###H
H#############TTTTTTTTTTTTTTTTTTTTTTTT..........###H
H#############TTTTTTTTTTTTTTTTTTTTTTTT..........###H
H#############TTTTCTTTTTTTTTTTTTTCTTTT..........###H
H#############TTTTTTTTTTTTCTTTTTTTTTTT#############H
H#############TTTTTTTTTTTTTTTTTTTTTTTT#############H
HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH`.split('\n');
const GW = GRID[0].length, GH = GRID.length, CELL = 2, X0 = -GW, Z0 = -GH;
const cx = (c) => X0 + c * CELL + CELL / 2, cz = (r) => Z0 + r * CELL + CELL / 2;
const at = (c, r) => (r < 0 || r >= GH || c < 0 || c >= GW) ? 'H' : GRID[r][c];
const WALK = new Set('.123DTg');
const walk = (c, r) => WALK.has(at(c, r));
const toCell = (x, z) => [Math.floor((x - X0) / CELL), Math.floor((z - Z0) / CELL)];

function mergeRects(chars) {
  const used = new Set(), out = [];
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
    if (!chars.includes(at(c, r)) || used.has(r * GW + c)) continue;
    let c1 = c; while (c1 + 1 < GW && chars.includes(at(c1 + 1, r)) && !used.has(r * GW + c1 + 1)) c1++;
    let r1 = r; outer: while (r1 + 1 < GH) { for (let k = c; k <= c1; k++) if (!chars.includes(at(k, r1 + 1)) || used.has((r1 + 1) * GW + k)) break outer; r1++; }
    for (let rr = r; rr <= r1; rr++) for (let k = c; k <= c1; k++) used.add(rr * GW + k);
    out.push({ c0: c, r0: r, c1, r1, x: (cx(c) + cx(c1)) / 2, z: (cz(r) + cz(r1)) / 2, w: (c1 - c + 1) * CELL, d: (r1 - r + 1) * CELL });
  }
  return out;
}
const cellsOf = (ch) => { const o = []; for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) if (at(c, r) === ch) o.push([c, r]); return o; };

/* ---------------- callouts / zones ---------------- */
const ZONES = [
  ['DEFENDER SPAWN', 18, 1, 33, 5], ['SCRIPTURE WALK', 8, 1, 17, 3], ['TEA PATH', 34, 1, 40, 2], ['A SITE · LANTERN COURT', 2, 4, 15, 12],
  ['SCRIPTURE HALL', 16, 8, 18, 10], ['CYPRESS WALK', 2, 13, 5, 31], ['MARKET STEPS', 6, 25, 17, 32], ['PRAYER STAIRS', 12, 13, 14, 24],
  ['B SITE · BELL COURTYARD', 19, 10, 32, 19], ['CLOISTER GATE', 24, 6, 27, 9], ['TEA HOUSE', 33, 8, 34, 10], ['MOON GATE', 20, 20, 27, 21],
  ['KOI GARDEN', 21, 22, 30, 31], ['KILN HALL', 31, 23, 43, 26], ['CART ROAD', 43, 12, 47, 33], ['C SITE · DRUM YARD', 35, 3, 49, 11], ['LOWER GATE', 12, 33, 47, 38]
];
const centre = (c0, r0, c1, r1) => [(cx(c0) + cx(c1)) / 2, (cz(r0) + cz(r1)) / 2];

/* ---------------- navigation: A* over walkable cells (8-way, no corner cutting) ---------------- */
function lineClear(x0, z0, x1, z1) {
  const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.5);
  for (let i = 0; i <= n; i++) {
    const t = i / Math.max(1, n), x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    for (const [ox, oz] of [[0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]]) { const [c, r] = toCell(x + ox, z + oz); if (!walk(c, r)) return false; }
  }
  return true;
}
function astar(c0, r0, c1, r1) {
  if (!walk(c1, r1)) return null;
  const key = (c, r) => r * GW + c, open = new Map(), g = new Map(), from = new Map();
  const h = (c, r) => Math.hypot(c - c1, r - r1);
  g.set(key(c0, r0), 0); open.set(key(c0, r0), h(c0, r0));
  let guard = 0;
  while (open.size && guard++ < 5000) {
    let best = -1, bf = Infinity; for (const [k, f] of open) if (f < bf) { bf = f; best = k; }
    open.delete(best);
    const c = best % GW, r = (best - c) / GW;
    if (c === c1 && r === r1) { const path = []; let k = best; while (k !== undefined) { const cc = k % GW; path.push([cc, (k - cc) / GW]); k = from.get(k); } return path.reverse(); }
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue; const nc = c + dc, nr = r + dr;
      if (!walk(nc, nr) || (dc && dr && (!walk(c + dc, r) || !walk(c, r + dr)))) continue;
      const nk = key(nc, nr), ng = g.get(best) + (dc && dr ? 1.414 : 1);
      if (ng < (g.has(nk) ? g.get(nk) : Infinity)) { g.set(nk, ng); from.set(nk, best); open.set(nk, ng + h(nc, nr)); }
    }
  }
  return null;
}
const TARGETS = [centre(2, 4, 15, 12), centre(19, 10, 32, 19), centre(35, 3, 49, 11), centre(21, 22, 30, 31), centre(31, 23, 43, 26), [cx(3), cz(20)], [cx(45), cz(22)], centre(8, 25, 17, 32), [cx(13), cz(18)], [cx(25), cz(7)], [cx(17), cz(9)], [cx(33), cz(9)]];
const nav = {
  path(x0, z0, x1, z1) {
    const [a, b] = toCell(x0, z0); let [c, d] = toCell(x1, z1);
    if (!walk(c, d)) { let best = null, bd = 1e9; for (let r = d - 3; r <= d + 3; r++) for (let k = c - 3; k <= c + 3; k++) if (walk(k, r)) { const dd = Math.hypot(k - c, r - d); if (dd < bd) { bd = dd; best = [k, r]; } } if (!best) return null; [c, d] = best; }
    let sc = a, sr = b;
    if (!walk(sc, sr)) { for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (walk(a + dc, b + dr)) { sc = a + dc; sr = b + dr; break; } }
    const cells = astar(sc, sr, c, d); if (!cells) return null;
    const pts = cells.map(([k, r]) => [cx(k), cz(r)]);
    // string-pull: drop points while the straight line stays inside walkable cells
    const out = [pts[0]]; let i = 0;
    while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !lineClear(pts[i][0], pts[i][1], pts[j][0], pts[j][1])) j--; out.push(pts[j]); i = j; }
    return out;
  },
  randomTarget() { const t = TARGETS[Math.floor(Math.random() * TARGETS.length)]; return [t[0] + (Math.random() - 0.5) * 3, t[1] + (Math.random() - 0.5) * 3]; },
  walkable(x, z) { const [c, r] = toCell(x, z); return walk(c, r); }
};

const D_CELLS = cellsOf('D'), T_CELLS = cellsOf('T');
const pickCell = (L, i) => L[(i == null ? Math.floor(Math.random() * L.length) : (i * 37 + 11) % L.length)];

/* ---------------- minimap art (menu card / map chips) ---------------- */
function minimapSVG() {
  const s = 160 / (GW * CELL), oy = (110 - GH * CELL * s) / 2, R = (c0, r0, c1, r1, fill) => `<rect x="${(c0 * CELL * s).toFixed(1)}" y="${(oy + r0 * CELL * s).toFixed(1)}" width="${((c1 - c0 + 1) * CELL * s).toFixed(1)}" height="${((r1 - r0 + 1) * CELL * s).toFixed(1)}" fill="${fill}"/>`;
  let o = `<svg viewBox="0 0 160 110" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="160" height="110" rx="3" fill="#1d242d"/>`;
  o += R(1, 1, GW - 2, GH - 2, '#2b3540');
  for (const q of mergeRects('#H')) o += R(q.c0, q.r0, q.c1, q.r1, '#56616f');
  for (const q of mergeRects('cCotw')) o += R(q.c0, q.r0, q.c1, q.r1, '#8c6943');
  for (const q of mergeRects('p')) o += R(q.c0, q.r0, q.c1, q.r1, '#3f7f86');
  const lab = (t, c, r, col) => `<text x="${(c * CELL * s).toFixed(1)}" y="${(oy + r * CELL * s + 3.5).toFixed(1)}" font-size="9" font-weight="700" fill="${col}" text-anchor="middle" font-family="sans-serif">${t}</text>`;
  o += lab('A', 9, 8, '#e8a33a') + lab('B', 26, 12, '#e8a33a') + lab('C', 42, 7, '#e8a33a') + '</svg>';
  return o;
}

/* ---------------- materials ---------------- */
let TL = null;
function templeLibrary(renderer) {
  if (TL) return TL;
  const L = materialLibrary(renderer), S = TX.TEXQ.size;
  const stone = TX.withGrade({ sat: 0.22, tint: [0.96, 0.99, 1.02] }, () => TX.sandstone(105, 0x9c978c, S));
  const pave = TX.withGrade({ sat: 0.28, tint: [0.94, 0.97, 1.0] }, () => TX.paving(111, S));
  const plaster = TX.plaster(108, 0xe9e3d5, S);
  const roof = TX.roofTiles(91, 0x5d6a64, 512);
  const red = TX.paintedPlanks(121, 0x8e2c1f, 512, true, 4), wood = TX.woodGrain(131, 0x5e4028, 256);
  const pm = (t, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1, metalness: 0 }, extra));
  // raked gravel for the gardens
  const grav = TX.canvasTex(512, (x, W, H) => {
    const id = x.createImageData(W, H), d = id.data, N = new TX.Noise(141);
    for (let y = 0; y < H; y++) for (let k = 0; k < W; k++) { const o = (y * W + k) * 4, rake = 0.5 + 0.5 * Math.sin(y / H * Math.PI * 2 * 24 + N.fbm(k / W, y / H, 4, 2) * 3), g = Math.random();
      const v = 168 + rake * 34 + g * 28; d[o] = v; d[o + 1] = v * 0.98; d[o + 2] = v * 0.93; d[o + 3] = 255; }
    x.putImageData(id, 0, 0);
  });
  grav.wrapS = grav.wrapT = THREE.RepeatWrapping;
  TL = Object.assign({}, L, {
    floor: worldMaterial(pave, { tile: 7, dirt: 0, streak: 0, macro: 1, normal: 1.0 }),
    stone: worldMaterial(stone, { tile: 3, dirt: 1.2, dirtH: 1.0, streak: 1.2, normal: 1.2 }),
    plaster: worldMaterial(plaster, { tile: 3.4, dirt: 0.6, dirtH: 0.6, streak: 1.3, normal: 0.9 }),
    roof: worldMaterial(roof, { tile: 2.2, dirt: 0, streak: 0, macro: 0.6, normal: 1.3 }),
    lacquer: pm(red, { color: 0xffffff }), timber: pm(wood, { color: 0xd8c0a8 }),
    gravel: new THREE.MeshStandardMaterial({ map: grav, roughness: 0.95 }),
    bronze: registerEnv(new THREE.MeshStandardMaterial({ color: 0x8a6a3c, roughness: 0.42, metalness: 1 }), 1.0),
    gold: registerEnv(new THREE.MeshStandardMaterial({ color: 0xc49a3e, roughness: 0.3, metalness: 1 }), 1.2),
    water: registerEnv(new THREE.MeshStandardMaterial({ color: 0x1f4a4a, roughness: 0.06, metalness: 0.3, transparent: true, opacity: 0.82 }), 1.4),
    pondBed: new THREE.MeshStandardMaterial({ color: 0x2a3a30, roughness: 1 }),
    koi: new THREE.MeshStandardMaterial({ color: 0xff7a2e, roughness: 0.5 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xd8442a, emissive: 0xff6a2a, emissiveIntensity: 0.9, roughness: 0.7 }),
    pine: new THREE.MeshStandardMaterial({ color: 0x33502e, roughness: 0.85, flatShading: true }),
    bark: new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.95 }),
    bamboo: new THREE.MeshStandardMaterial({ color: 0x7a9a4a, roughness: 0.6 }),
    ghost: new THREE.MeshBasicMaterial({ visible: false })
  });
  TL.gravel.map.repeat.set(1, 1);
  // photo-scanned CC0 sets (photomat.js), swapped in when they arrive; procedural above is the fallback
  usePhoto(TL.floor, 'monastery_stone_floor', { tile: 2.6, normal: 1.0, color: 0xe6e8ea });
  usePhoto(TL.stone, 'japanese_stone_wall', { tile: 2.6, normal: 1.1, color: 0xf2f0ea });
  usePhoto(TL.plaster, 'white_stucco', { tile: 2.4, normal: 1.0, color: 0xfffcf6 });
  usePhoto(TL.roof, 'grey_roof_tiles', { tile: 2.4, normal: 1.2, color: 0xcfd8d2 });
  TL.roof.userData.U.uRoof.value = 1;
  usePhoto(TL.lacquer, 'distressed_painted_planks', { color: 0xc4473a, rotation: Math.PI / 2 });
  usePhoto(TL.timber, 'weathered_brown_planks', { color: 0xe8d8c8, rotation: Math.PI / 2 });
  usePhoto(TL.gravel, 'gravel_floor', { repeat: [8, 8], color: 0xf0ece4 });
  return TL;
}
TX; // (textures used above)

/* ---------------- builders ---------------- */
function hipRoof(w, d, rise) {
  const W2 = w / 2, D2 = d / 2, L = Math.abs(w - d) / 2, alongX = w >= d;
  const r0 = alongX ? [-L, rise, 0] : [0, rise, -L], r1 = alongX ? [L, rise, 0] : [0, rise, L];
  const a = [-W2, 0, -D2], b = [W2, 0, -D2], c = [W2, 0, D2], e = [-W2, 0, D2];
  const tri = [];
  const quad = (p, q, s, t) => { tri.push(...p, ...q, ...s, ...p, ...s, ...t); };
  if (alongX) { quad(e, c, r1, r0); quad(b, a, r0, r1); tri.push(...a, ...e, ...r0, ...c, ...b, ...r1); }
  else { quad(a, e, r1, r0); quad(c, b, r0, r1); tri.push(...b, ...a, ...r0, ...e, ...c, ...r1); }
  tri.push(...a, ...b, ...c, ...a, ...c, ...e); // underside (eave soffit)
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3)); g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(tri.length / 3 * 2), 2));
  return g;
}
function gableCap(len, wid, rise, alongX) {
  const g = hipRoof(alongX ? len + 0.001 : wid, alongX ? wid : len + 0.001, rise);
  return g;
}
function bellGeo() {
  const pts = [[0, 0.95], [0.12, 0.93], [0.2, 0.86], [0.26, 0.7], [0.3, 0.4], [0.36, 0.12], [0.44, 0.02], [0.45, 0], [0.4, 0.0], [0.33, 0.1]].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 28);
}

export default {
  id: 'brinepeak',
  name: 'Brinepeak',
  code: 'de_brinepeak',
  title: 'DE_BRINEPEAK',
  desc: 'Mountain monastery · A · B courtyard · C · three sites',
  kicker: 'Operation Brinepeak',
  online: true,
  lighting: 'mountain',
  shadow: { half: 58 },
  bounds: { minX: X0, maxX: -X0, minZ: Z0, maxZ: -Z0 },
  sites: [
    { letter: 'A', x: centre(2, 4, 15, 12)[0], z: centre(2, 4, 15, 12)[1], w: 28 * 2.35 / 2.35, d: 18, color: 'rgba(227,167,59,0.22)' },
    { letter: 'B', x: centre(19, 10, 32, 19)[0], z: centre(19, 10, 32, 19)[1], w: 28, d: 20, color: 'rgba(227,167,59,0.22)' },
    { letter: 'C', x: centre(35, 3, 49, 11)[0], z: centre(35, 3, 49, 11)[1], w: 30, d: 18, color: 'rgba(227,167,59,0.22)' }
  ],
  waypoints: TARGETS,
  nav,
  minimapSVG,
  playerSpawn(team) {
    const [c, r] = pickCell(team === 'alpha' ? D_CELLS : T_CELLS);
    return { x: cx(c) + (Math.random() - 0.5), z: cz(r) + (Math.random() - 0.5), yaw: team === 'alpha' ? Math.PI : 0 };
  },
  botSpawn(i) { const [c, r] = pickCell(T_CELLS, i * 5 + 3); return { x: cx(c), z: cz(r) }; },
  botRespawn() { const [c, r] = pickCell(T_CELLS); return { x: cx(c), z: cz(r) }; },
  callout(x, z) {
    const [c, r] = toCell(x, z);
    for (const [n, c0, r0, c1, r1] of ZONES) if (c >= c0 && c <= c1 && r >= r0 && r <= r1) return n;
    return 'BRINEPEAK';
  },
  menuCam: { r: 44, h: 24, look: [0, 3, -2] },

  build(ctx) {
    const { addBox, renderer } = ctx;
    const M = templeLibrary(renderer);
    this._M = M;
    addBox(0, -0.5, 0, GW * CELL, 1, GH * CELL, M.floor, false, false);
    this._walls = [];
    for (const q of mergeRects('H')) { const m = addBox(q.x, 4.5, q.z, q.w, 9, q.d, M.stone); this._walls.push({ q, m, h: 9, perim: true }); }
    for (const q of mergeRects('#')) {
      const big = Math.min(q.c1 - q.c0, q.r1 - q.r0) >= 2;
      const h = big ? 6.2 + ((q.c0 * 7 + q.r0 * 3) % 3) * 0.7 : 4.4;
      const m = addBox(q.x, h / 2, q.z, q.w, h, q.d, M.plaster);
      this._walls.push({ q, m, h, big });
    }
    for (const q of mergeRects('w')) addBox(q.x, 0.7, q.z, q.w - 0.4, 1.4, q.d - 0.9, M.stone);
    for (const q of mergeRects('p')) addBox(q.x, 0.6, q.z, q.w, 1.2, q.d, M.ghost, true, true);
    for (const [c, r] of cellsOf('c')) addBox(cx(c), 0.725, cz(r), 1.45, 1.45, 1.45, M.crate);
    for (const [c, r] of cellsOf('C')) { addBox(cx(c), 0.8, cz(r), 1.6, 1.6, 1.6, M.crate2); const u = addBox(cx(c) + 0.1, 2.15, cz(r) - 0.05, 1.1, 1.1, 1.1, M.crate, false, false); u.rotation.y = 0.3; }
    for (const [c, r] of cellsOf('o')) addBox(cx(c), 2.5, cz(r), 0.9, 5, 0.9, M.ghost);
    for (const [c, r] of cellsOf('t')) addBox(cx(c), 0.6, cz(r), 1.5, 1.2, 1.5, M.stone);
  },

  dress(ctx) {
    const M = this._M, group = ctx.group, B = new Batch(group), BN = new Batch(group, false);
    const V = (x, y, z) => new THREE.Vector3(x, y, z), E = (x, y, z) => new THREE.Euler(x, y, z);
    const rr = TX.rng(77);
    // walls: stone plinth, timber band, tiled roofs / copings, pagoda tiers
    for (const W of this._walls) {
      const { q, h } = W, x = q.x, z = q.z;
      if (W.perim) {
        B.add(chamferBox(q.w + 0.14, 1.6, q.d + 0.14, 0.04), M.stone, V(x, 0.8, z));
        B.add(new THREE.BoxGeometry(q.w + 0.3, 0.3, q.d + 0.3), M.lacquer, V(x, 8.6, z));
        continue;
      }
      W.m.geometry.dispose(); W.m.geometry = chamferBox(q.w, h, q.d, 0.05);
      B.add(chamferBox(q.w + 0.16, 1.3, q.d + 0.16, 0.04), M.stone, V(x, 0.65, z));
      B.add(new THREE.BoxGeometry(q.w + 0.12, 0.34, q.d + 0.12), M.lacquer, V(x, h - 0.55, z));
      B.add(new THREE.BoxGeometry(q.w + 0.18, 0.12, q.d + 0.18), M.timber, V(x, h - 0.32, z));
      if (W.big) {
        const eave = 1.1, rise = Math.min(q.w, q.d) * 0.32;
        B.add(new THREE.BoxGeometry(q.w + eave * 2 - 0.2, 0.16, q.d + eave * 2 - 0.2), M.timber, V(x, h - 0.12, z));
        B.add(hipRoof(q.w + eave * 2, q.d + eave * 2, rise), M.roof, V(x, h - 0.05, z));
        // ridge + finials
        const alongX = q.w >= q.d, L = Math.abs(q.w - q.d);
        if (L > 0.2) { const rg = new THREE.CylinderGeometry(0.12, 0.12, L, 8); rg.rotateZ(Math.PI / 2); if (!alongX) rg.rotateY(Math.PI / 2); B.add(rg, M.roof, V(x, h - 0.05 + rise + 0.05, z)); }
        for (const s of [-1, 1]) B.add(new THREE.SphereGeometry(0.22, 10, 8), M.gold, alongX ? V(x + s * L / 2, h + rise + 0.15, z) : V(x, h + rise + 0.15, z + s * L / 2), null, null, false);
        // a second, smaller tier on the largest halls (pagoda silhouette)
        if (q.w * q.d > 260) {
          const tw = q.w * 0.42, td = q.d * 0.42, th = 3.2, by = h + rise * 0.55;
          B.add(chamferBox(tw, th, td, 0.04), M.plaster, V(x, by + th / 2, z));
          B.add(new THREE.BoxGeometry(tw + 0.1, 0.3, td + 0.1), M.lacquer, V(x, by + th - 0.4, z));
          const r2 = Math.min(tw, td) * 0.45;
          B.add(hipRoof(tw + 1.8, td + 1.8, r2), M.roof, V(x, by + th, z));
          B.add(new THREE.CylinderGeometry(0.05, 0.12, 2.4, 8), M.gold, V(x, by + th + r2 + 1.0, z), null, null, false);
        }
      } else {
        const alongX = q.w >= q.d;
        B.add(hipRoof(alongX ? q.w + 0.5 : q.w + 0.9, alongX ? q.d + 0.9 : q.d + 0.5, 0.55), M.roof, V(x, h, z));
      }
    }
    // lacquered columns on stone bases
    for (const [c, r] of cellsOf('o')) {
      const x = cx(c), z = cz(r);
      B.add(new THREE.CylinderGeometry(0.34, 0.36, 4.6, 16), M.lacquer, V(x, 2.6, z));
      B.add(chamferBox(0.9, 0.35, 0.9, 0.04), M.stone, V(x, 0.18, z));
      B.add(new THREE.BoxGeometry(1.1, 0.25, 1.1), M.timber, V(x, 4.95, z));
    }
    // covered Kiln Hall: timber deck roof on beams
    for (const q of mergeRects('g')) {
      B.add(new THREE.BoxGeometry(q.w + 0.6, 0.25, q.d + 0.6), M.timber, V(q.x, 5.0, q.z));
      for (let i = 0; i <= Math.floor(q.w / 2.2); i++) B.add(new THREE.BoxGeometry(0.22, 0.32, q.d + 0.4), M.lacquer, V(q.x - q.w / 2 + 0.3 + i * 2.2, 4.75, q.z), null, null, false);
      B.add(hipRoof(q.w + 1.6, q.d + 1.6, 1.4), M.roof, V(q.x, 5.12, q.z));
      for (let i = 0; i < 4; i++) lantern(q.x - q.w / 2 + 3 + i * (q.w - 6) / 3, 4.0, q.z, true);
    }
    // ponds: stone rim, dark bed, water, koi
    for (const q of mergeRects('p')) {
      for (const [ox, oz, w, d] of [[0, -q.d / 2, q.w, 0.3], [0, q.d / 2, q.w, 0.3], [-q.w / 2, 0, 0.3, q.d], [q.w / 2, 0, 0.3, q.d]]) B.add(chamferBox(w + 0.3, 0.5, d + 0.3, 0.05), M.stone, V(q.x + ox, 0.25, q.z + oz));
      B.add(new THREE.BoxGeometry(q.w - 0.2, 0.05, q.d - 0.2), M.pondBed, V(q.x, 0.02, q.z), null, null, false);
      const wtr = new THREE.Mesh(new THREE.PlaneGeometry(q.w - 0.1, q.d - 0.1), M.water); wtr.rotation.x = -Math.PI / 2; wtr.position.set(q.x, 0.36, q.z); wtr.receiveShadow = true; group.add(wtr);
      for (let i = 0; i < 6; i++) { const k = new THREE.SphereGeometry(0.16, 8, 6); k.scale(1, 0.35, 0.45); BN.add(k, M.koi, V(q.x + (rr() - 0.5) * (q.w - 1.5), 0.22, q.z + (rr() - 0.5) * (q.d - 1.5)), E(0, rr() * 6, 0), null, false); }
    }
    // bell pavilion over the B courtyard pond
    {
      const q = mergeRects('p').find((p) => p.r0 < 20), x = q.x, z = q.z, hw = q.w / 2 - 0.4, hd = q.d / 2 - 0.4;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { B.add(new THREE.CylinderGeometry(0.2, 0.22, 4.8, 12), M.lacquer, V(x + sx * hw, 2.4, z + sz * hd)); B.add(chamferBox(0.6, 0.4, 0.6, 0.03), M.stone, V(x + sx * hw, 0.45, z + sz * hd)); }
      for (const sz of [-1, 1]) B.add(new THREE.BoxGeometry(q.w, 0.3, 0.26), M.timber, V(x, 4.75, z + sz * hd));
      for (const sx of [-1, 1]) B.add(new THREE.BoxGeometry(0.26, 0.3, q.d), M.timber, V(x + sx * hw, 4.75, z));
      B.add(new THREE.BoxGeometry(q.w, 0.24, 0.24), M.timber, V(x, 4.4, z));
      B.add(hipRoof(q.w + 2.4, q.d + 2.4, 2.0), M.roof, V(x, 4.92, z));
      B.add(new THREE.SphereGeometry(0.25, 10, 8), M.gold, V(x, 7.05, z), null, null, false);
      const bell = new THREE.Mesh(bellGeo(), M.bronze); bell.scale.setScalar(1.5); bell.position.set(x, 2.55, z); bell.castShadow = true; group.add(bell);
      B.add(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), M.iron, V(x, 4.05, z));
      // striker log
      const log = new THREE.CylinderGeometry(0.12, 0.12, 2.2, 10); log.rotateZ(Math.PI / 2); B.add(log, M.timber, V(x - 1.9, 2.9, z));
    }
    // pines in stone planters
    const needles = new THREE.IcosahedronGeometry(1, 2);
    for (const [c, r] of cellsOf('t')) {
      const x = cx(c), z = cz(r);
      B.add(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 14), M.soil, V(x, 1.22, z), null, null, false);
      let px = x, py = 1.2, pz = z, a = rr() * 6;
      for (let k = 0; k < 4; k++) { const len = 0.9 + rr() * 0.4, tilt = 0.25 + rr() * 0.25; a += 1.3; const nx = px + Math.cos(a) * Math.sin(tilt) * len, nz = pz + Math.sin(a) * Math.sin(tilt) * len, ny = py + Math.cos(tilt) * len;
        const seg = new THREE.CylinderGeometry(0.11 - k * 0.018, 0.14 - k * 0.018, len, 7); seg.translate(0, len / 2, 0); seg.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(nx - px, ny - py, nz - pz).normalize())));
        B.add(seg, M.bark, V(px, py, pz)); px = nx; py = ny; pz = nz;
        if (k > 0) for (let n = 0; n < 3; n++) { const s = 0.45 + rr() * 0.35; B.add(needles, M.pine, V(px + (rr() - 0.5) * 1.1, py + 0.05 + n * 0.12, pz + (rr() - 0.5) * 1.1), E(rr() * 0.3, rr() * 6, rr() * 0.3), V(s * 1.4, s * 0.32, s * 1.3)); } }
    }
    // bamboo groves hugging a few walls, paper lanterns along walkways
    const stalk = new THREE.CylinderGeometry(0.045, 0.05, 1, 6); stalk.translate(0, 0.5, 0);
    const leafC = new THREE.ConeGeometry(0.35, 1.0, 5); 
    let lanterns = 0;
    for (const W of this._walls) {
      if (W.perim) continue;
      const { q, h } = W;
      // faces adjacent to walkable cells
      const faces = [];
      for (let c = q.c0; c <= q.c1; c++) { if (walk(c, q.r0 - 1)) faces.push([cx(c), q.z - q.d / 2, 0, -1]); if (walk(c, q.r1 + 1)) faces.push([cx(c), q.z + q.d / 2, 0, 1]); }
      for (let r = q.r0; r <= q.r1; r++) { if (walk(q.c0 - 1, r)) faces.push([q.x - q.w / 2, cz(r), -1, 0]); if (walk(q.c1 + 1, r)) faces.push([q.x + q.w / 2, cz(r), 1, 0]); }
      faces.forEach(([fx, fz, nx, nz], i) => {
        if (i % 4 === 1 && lanterns < 90 && h > 4) { lanterns++; lantern(fx + nx * 0.55, 3.25, fz + nz * 0.55, false, nx, nz); }
        if (i % 9 === 4) for (let k = 0; k < 6; k++) { const hgt = 2.6 + rr() * 2.4; const bx = fx + nx * (0.25 + rr() * 0.15) + (nz ? 0 : 0) + (nx ? 0 : (rr() - 0.5) * 1.6), bz = fz + nz * (0.25 + rr() * 0.15) + (nz ? 0 : (rr() - 0.5) * 1.6);
          B.add(stalk, M.bamboo, V(bx, 0, bz), E((rr() - 0.5) * 0.12, 0, (rr() - 0.5) * 0.12), V(1, hgt, 1)); for (let n = 0; n < 3; n++) B.add(leafC, M.pine, V(bx + (rr() - 0.5) * 0.4, hgt - 0.15 - n * 0.45, bz + (rr() - 0.5) * 0.4), E(Math.PI + (rr() - 0.5) * 0.6, rr() * 6, (rr() - 0.5) * 0.6), V(0.55, 0.7, 0.55)); }
      });
    }
    // timber gateways (paifang-style) over the main openings; posts sit in the walls either side
    const gate = (c0, c1, r, alongX = true) => {
      const x0 = cx(c0) - 1, x1 = cx(c1) + 1, z = cz(r), w = x1 - x0, xm = (x0 + x1) / 2;
      for (const s of [x0 - 0.15, x1 + 0.15]) B.add(new THREE.CylinderGeometry(0.22, 0.24, 5.2, 12), M.lacquer, alongX ? V(s, 2.6, z) : V(z, 2.6, s));
      B.add(new THREE.BoxGeometry(w + 1.4, 0.32, 0.36), M.lacquer, alongX ? V(xm, 4.3, z) : V(z, 4.3, xm), alongX ? null : E(0, Math.PI / 2, 0));
      B.add(new THREE.BoxGeometry(w + 2.2, 0.24, 0.5), M.timber, alongX ? V(xm, 5.0, z) : V(z, 5.0, xm), alongX ? null : E(0, Math.PI / 2, 0));
      B.add(hipRoof(alongX ? w + 2.8 : 1.4, alongX ? 1.4 : w + 2.8, 0.55), M.roof, alongX ? V(xm, 5.12, z) : V(z, 5.12, xm));
    };
    gate(24, 27, 20); gate(12, 14, 13); gate(43, 47, 12); gate(24, 27, 32); gate(24, 27, 8); gate(8, 17, 33 - 0);
    // stone lanterns at site edges (non-colliding, hugging walls)
    for (const [x, z] of [[cx(2) + 0.1, cz(4) + 0.1], [cx(15) - 0.1, cz(12) - 0.1], [cx(49) - 0.1, cz(3) + 0.1], [cx(35) + 0.1, cz(11) - 0.1], [cx(19) + 0.1, cz(19) - 0.1], [cx(32) - 0.1, cz(10) + 0.1]]) {
      B.add(new THREE.CylinderGeometry(0.28, 0.34, 0.25, 6), M.stone, V(x, 0.12, z)); B.add(new THREE.CylinderGeometry(0.1, 0.12, 0.8, 6), M.stone, V(x, 0.65, z));
      B.add(chamferBox(0.5, 0.36, 0.5, 0.03), M.stone, V(x, 1.23, z)); B.add(new THREE.BoxGeometry(0.3, 0.2, 0.52), M.lampGlow, V(x, 1.23, z), null, null, false);
      B.add(new THREE.ConeGeometry(0.48, 0.32, 6), M.stone, V(x, 1.57, z));
    }
    // raked gravel in Koi Garden, painted site letters, moss / leaf decals
    const grv = new THREE.Mesh(new THREE.PlaneGeometry(10 * CELL - 0.2, 10 * CELL - 0.2), M.gravel); grv.rotation.x = -Math.PI / 2; grv.position.set(centre(21, 22, 30, 31)[0], 0.012, centre(21, 22, 30, 31)[1]); grv.receiveShadow = true; group.add(grv);
    if (!M.gravel.map.userData.photo) M.gravel.map.repeat.set(3, 3);
    const DB = new Batch(group, false);
    for (const s of this.sites) {
      const mat = decalMat(siteLetterTex(s.letter, '#f2efe6'), { roughness: 0.7 });
      DB.add(new THREE.PlaneGeometry(4.2, 4.2), mat, V(s.x, 0.02, s.z), E(-Math.PI / 2, 0, 0), null, false);
    }
    const moss = decalMat(TX.canvasTex(256, (x, W, H) => { const r = TX.rng(5); for (let i = 0; i < 40; i++) { const cx0 = r() * W, cy = H * (0.55 + r() * 0.45), rad = 10 + r() * 40, g = x.createRadialGradient(cx0, cy, 0, cx0, cy, rad); g.addColorStop(0, `rgba(58,78,40,${0.35 + r() * 0.3})`); g.addColorStop(1, 'rgba(58,78,40,0)'); x.fillStyle = g; x.beginPath(); x.arc(cx0, cy, rad, 0, 7); x.fill(); } }));
    for (const W of this._walls) {
      if (W.perim) continue; const { q } = W;
      for (const [fx, fz, ry, span] of [[q.x, q.z - q.d / 2 - 0.01, Math.PI, q.w], [q.x, q.z + q.d / 2 + 0.01, 0, q.w], [q.x - q.w / 2 - 0.01, q.z, -Math.PI / 2, q.d], [q.x + q.w / 2 + 0.01, q.z, Math.PI / 2, q.d]]) {
        if (rr() < 0.5) continue;
        const w = Math.min(span, 2 + rr() * 3); DB.add(new THREE.PlaneGeometry(w, 1.4), moss, V(fx + (ry === 0 || ry === Math.PI ? (rr() - 0.5) * (span - w) : 0) + Math.sin(ry) * 0.075, 0.7, fz + (ry === 0 || ry === Math.PI ? 0 : (rr() - 0.5) * (span - w)) + Math.cos(ry) * 0.075), E(0, ry, 0), null, false);
      }
    }
    for (const m of DB.flush()) m.renderOrder = 1;
    B.flush(); BN.flush();

    function lantern(x, y, z, hanging, nx = 0, nz = 0) {
      if (!hanging) { const arm = new THREE.BoxGeometry(nx ? 0.6 : 0.06, 0.06, nz ? 0.6 : 0.06); B.add(arm, M.iron, V(x - nx * 0.3, y + 0.55, z - nz * 0.3), null, null, false); }
      B.add(new THREE.CylinderGeometry(0.008, 0.008, 0.35, 4), M.iron, V(x, y + 0.42, z), null, null, false);
      const body = new THREE.SphereGeometry(0.2, 12, 8); body.scale(1, 1.25, 1);
      B.add(body, M.paper, V(x, y, z), null, null, false);
      B.add(new THREE.CylinderGeometry(0.11, 0.13, 0.06, 10), M.timber, V(x, y + 0.26, z), null, null, false);
      B.add(new THREE.CylinderGeometry(0.13, 0.11, 0.06, 10), M.timber, V(x, y - 0.26, z), null, null, false);
    }
  }
};
