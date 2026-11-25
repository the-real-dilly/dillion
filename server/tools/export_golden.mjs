// Exports reference values from the JS world/sim so the Rust port can be checked (cargo test --test golden).
// Usage: node server/tools/export_golden.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const lz = join(here, "../../last-zone/");
const Wm = await import(lz + "world.js");
const Sm = await import(lz + "sim.js");
const out = join(here, "../tests/golden");
mkdirSync(out, { recursive: true });
const r6 = (v) => Math.round(v * 1e6) / 1e6;
for (const seed of [Wm.MAP_SEED, 7, 424242]) {
  const W = Wm.buildWorld(seed);
  const heights = [], surfs = [];
  for (let j = 0; j < Wm.N; j += 7) for (let i = 0; i < Wm.N; i += 7) { heights.push(W.H[j * Wm.N + i]); surfs.push(W.S[j * Wm.N + i]); }
  let bsum = 0; W.boxes.forEach((b, i) => { bsum += (b.x0 + b.x1 * 2 + b.y0 * 3 + b.y1 * 5 + b.z0 * 7 + b.z1 * 11) * ((i % 13) + 1); });
  const boxes = W.boxes.filter((_, i) => i % 37 === 0).map((b) => [b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, b.s, b.b]);
  // deterministic rays and ground queries
  const rays = [], grounds = [];
  for (let k = 0; k < 300; k++) {
    const ox = -800 + (k * 97) % 1600, oz = -800 + (k * 61) % 1600, oy = W.H[0] * 0 + Wm.terrainH(W, ox, oz) + 1.6 + (k % 5) * 20;
    const a = k * 0.37, p = -0.05 - (k % 7) * 0.04, dx = -Math.sin(a) * Math.cos(p), dy = Math.sin(p), dz = -Math.cos(a) * Math.cos(p);
    const h = Wm.raycast(W, ox, oy, oz, dx, dy, dz, 600);
    rays.push([ox, oy, oz, dx, dy, dz, h ? h.t : -1, h ? h.s : -1]);
    grounds.push([ox, oz, oy, Wm.groundAt(W, ox, oz, oy), Wm.surfaceAt(W, ox, oz)]);
  }
  // town-centre ground/ray checks near buildings
  for (let k = 0; k < 200; k++) {
    const P = Wm.POIS[k % Wm.POIS.length], ox = P.x + ((k * 13) % 60) - 30, oz = P.z + ((k * 29) % 60) - 30, oy = Wm.groundAt(W, ox, oz, 999) + 1.5;
    const a = k * 0.71, dx = -Math.sin(a), dz = -Math.cos(a);
    const h = Wm.raycast(W, ox, oy, oz, dx, 0, dz, 120);
    rays.push([ox, oy, oz, dx, 0, dz, h ? h.t : -1, h ? h.s : -1]);
    grounds.push([ox, oz, 999, Wm.groundAt(W, ox, oz, 999), Wm.surfaceAt(W, ox, oz)]);
  }
  const loot = W.loot.map((l) => [l.x, l.y, l.z, l.tier]);
  const crates = W.crates.map((c) => [c.x, c.y, c.z, c.tier]);
  const counts = { boxes: W.boxes.length, buildings: W.buildings.length, loot: W.loot.length, crates: W.crates.length, trees: W.trees.length, palms: W.palms.length, rocks: W.rocks.length, props: W.props.length, fences: W.fences.length };
  // match generation: items, plane, first circle
  const matches = [];
  for (const ms of [1, 99, 31337]) {
    const M = Sm.createMatch(W, { seed: ms });
    matches.push({ seed: ms, items: M.items.map((it) => [it.id, it.k, it.w || it.a || "", it.r || 0, it.n || 0, it.x, it.z]), plane: [M.plane.ax, M.plane.az, M.plane.dx, M.plane.dz], gas: [M.gas.nx, M.gas.nz, M.gas.nr], pickle: M.crates.findIndex((c) => c.pickle) });
  }
  writeFileSync(join(out, `world_${seed}.json`), JSON.stringify({ seed, counts, heights, surfs, bsum, boxes, rays, grounds, loot, crates, matches }));
  console.log("seed", seed, JSON.stringify(counts));
}
