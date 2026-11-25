/* ==========================================================================
   DILLYVERSE — Infinite Chunk-Based Voxel World & Biome Generator
   16x96x16 chunks with Plains, Forest, Desert, Snowy Peaks, Ocean/Rivers,
   3D Underground Caves, Ores, Lava Pools, Trees, and Persistent Deltas.
   ========================================================================== */

import { B, BLOCKS } from './blocks.js';
import { SeededNoise } from './noise.js';

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 96;
export const SEA_LEVEL = 34;

export function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

export class World {
  constructor(seed = 'DILLYVERSE') {
    this.seed = seed;
    this.noise = new SeededNoise(seed);
    this.chunks = new Map();       // key -> { cx, cz, data: Uint8Array, dirty: bool, meshes: [] }
    this.modifications = new Map(); // key -> Map<localIdx, blockId>
  }

  loadModifications(serialized) {
    this.modifications.clear();
    if (!serialized) return;
    for (const [k, entries] of Object.entries(serialized)) {
      const m = new Map();
      for (const [idx, bid] of entries) m.set(idx, bid);
      this.modifications.set(k, m);
    }
  }

  serializeModifications() {
    const out = {};
    for (const [k, m] of this.modifications.entries()) {
      if (m.size > 0) out[k] = Array.from(m.entries());
    }
    return out;
  }

  getBiomeAt(wx, wz) {
    const temp = this.noise.fbm2(wx * 0.0045 + 100, wz * 0.0045 - 50, 3);
    const moist = this.noise.fbm2(wx * 0.005 - 200, wz * 0.005 + 150, 3);
    const cont = this.noise.fbm2(wx * 0.0032, wz * 0.0032, 4);

    if (cont < -0.22) return 'Ocean';
    if (temp > 0.22 && moist < 0.05) return 'Desert';
    if (temp < -0.20) return 'Snowy Peaks';
    if (moist > 0.08) return 'Forest';
    return 'Plains';
  }

  getTerrainHeight(wx, wz, biome) {
    const cont = this.noise.fbm2(wx * 0.0032, wz * 0.0032, 4);
    const detail = this.noise.fbm2(wx * 0.018 + 31, wz * 0.018 - 17, 4);
    const ridge = 1 - Math.abs(this.noise.noise2(wx * 0.009, wz * 0.009));

    let h = SEA_LEVEL + 4 + cont * 22 + detail * 8;
    if (biome === 'Ocean') h = SEA_LEVEL - 8 + cont * 12 + detail * 4;
    else if (biome === 'Desert') h = SEA_LEVEL + 5 + cont * 10 + detail * 5;
    else if (biome === 'Snowy Peaks') h = SEA_LEVEL + 10 + cont * 26 + ridge * ridge * 18 + detail * 6;
    else if (biome === 'Forest') h = SEA_LEVEL + 6 + cont * 16 + detail * 8;

    return Math.max(8, Math.min(CHUNK_HEIGHT - 14, Math.floor(h)));
  }

  idx(lx, y, lz) {
    return (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
  }

  generateChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    if (this.chunks.has(key)) return this.chunks.get(key);

    const data = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    const heights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    const biomes = new Array(CHUNK_SIZE * CHUNK_SIZE);

    let maxY = SEA_LEVEL + 2;
    // 1. Base terrain + caves + ores
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const biome = this.getBiomeAt(wx, wz);
        const h = this.getTerrainHeight(wx, wz, biome);
        heights[lz * CHUNK_SIZE + lx] = h;
        biomes[lz * CHUNK_SIZE + lx] = biome;
        if (h + 8 > maxY) maxY = Math.min(CHUNK_HEIGHT - 1, h + 8);

        for (let y = 0; y <= Math.max(h, SEA_LEVEL); y++) {
          let bid = B.AIR;
          if (y === 0) {
            bid = B.BEDROCK;
          } else if (y <= h) {
            // Fast 3D Cave Carving (below surface, above bedrock)
            let isCave = false;
            if (y > 4 && y < h - 3) {
              const c1 = this.noise.noise3(wx * 0.055, y * 0.07, wz * 0.055);
              if (c1 > 0.42) isCave = true;
            }

            if (isCave) {
              bid = y <= 7 ? B.LAVA : B.AIR;
            } else if (y === h) {
              if (h <= SEA_LEVEL + 1) bid = biome === 'Plains' && this.noise.hashCoord(wx, y, wz) < 0.25 ? B.CLAY : B.SAND;
              else if (biome === 'Desert') bid = B.SAND;
              else if (biome === 'Snowy Peaks' || h >= 58) bid = B.SNOW;
              else bid = B.GRASS;
            } else if (y >= h - 3) {
              if (biome === 'Desert' || h <= SEA_LEVEL + 1) bid = B.SAND;
              else bid = B.DIRT;
            } else {
              // Stone & Ore veins
              bid = B.STONE;
              const r = this.noise.hashCoord(wx, y, wz);
              if (y < 14 && r < 0.008) bid = B.DIAMOND_ORE;
              else if (y < 24 && r < 0.015) bid = B.GOLD_ORE;
              else if (y < 46 && r < 0.028) bid = B.IRON_ORE;
              else if (y < 60 && r < 0.042) bid = B.COAL_ORE;
              else if (r > 0.965 && y < 38) bid = B.GRAVEL;
            }
          } else if (y <= SEA_LEVEL) {
            bid = B.WATER;
          }
          data[this.idx(lx, y, lz)] = bid;
        }
      }
    }

    // 2. Surface foliage: Trees, Flowers, Tall Grass
    for (let lz = 2; lz < CHUNK_SIZE - 2; lz++) {
      for (let lx = 2; lx < CHUNK_SIZE - 2; lx++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const h = heights[lz * CHUNK_SIZE + lx];
        const biome = biomes[lz * CHUNK_SIZE + lx];
        if (h <= SEA_LEVEL + 1 || h >= CHUNK_HEIGHT - 10) continue;

        const topBlock = data[this.idx(lx, h, lz)];
        if (topBlock !== B.GRASS && topBlock !== B.SNOW) continue;

        const r = this.noise.hashCoord(wx, h + 1, wz);
        const treeChance = biome === 'Forest' ? 0.045 : (biome === 'Plains' ? 0.008 : (biome === 'Snowy Peaks' ? 0.012 : 0));

        if (r < treeChance && data[this.idx(lx, h + 1, lz)] === B.AIR) {
          const trunkH = 4 + Math.floor(this.noise.hashCoord(wx, 99, wz) * 3);
          for (let ty = 1; ty <= trunkH; ty++) {
            data[this.idx(lx, h + ty, lz)] = B.OAK_LOG;
          }
          const topY = h + trunkH;
          for (let dy = -2; dy <= 1; dy++) {
            const rad = dy === 1 ? 1 : 2;
            for (let dz = -rad; dz <= rad; dz++) {
              for (let dx = -rad; dx <= rad; dx++) {
                if (Math.abs(dx) === rad && Math.abs(dz) === rad && dy > -2) continue;
                const nx = lx + dx, ny = topY + dy, nz = lz + dz;
                if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE && ny < CHUNK_HEIGHT) {
                  const id = this.idx(nx, ny, nz);
                  if (data[id] === B.AIR) data[id] = B.LEAVES;
                }
              }
            }
          }
        } else if (topBlock === B.GRASS && r > 0.90 && r < 0.935) {
          data[this.idx(lx, h + 1, lz)] = B.FLOWER;
        } else if (topBlock === B.GRASS && r >= 0.935) {
          data[this.idx(lx, h + 1, lz)] = B.TALL_GRASS;
        }
      }
    }

    // 3. Re-apply persistent player modifications for this chunk
    const mods = this.modifications.get(key);
    if (mods) {
      for (const [localIdx, bid] of mods.entries()) {
        data[localIdx] = bid;
      }
    }

    const chunk = { cx, cz, key, data, maxY, dirty: true, meshes: [] };
    this.chunks.set(key, chunk);
    return chunk;
  }

  getChunk(cx, cz) {
    return this.chunks.get(chunkKey(cx, cz)) || null;
  }

  getBlock(wx, wy, wz) {
    const y = Math.floor(wy);
    if (y < 0 || y >= CHUNK_HEIGHT) return B.AIR;
    const x = Math.floor(wx);
    const z = Math.floor(wz);
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return B.AIR;
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return chunk.data[this.idx(lx, y, lz)];
  }

  setBlock(wx, wy, wz, blockId, recordMod = true) {
    const y = Math.floor(wy);
    if (y < 0 || y >= CHUNK_HEIGHT) return false;
    const x = Math.floor(wx);
    const z = Math.floor(wz);
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const key = chunkKey(cx, cz);
    const chunk = this.chunks.get(key) || this.generateChunk(cx, cz);
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localIdx = this.idx(lx, y, lz);

    if (chunk.data[localIdx] === blockId) return false;
    chunk.data[localIdx] = blockId;
    if (y > (chunk.maxY || 0)) chunk.maxY = y;
    chunk.dirty = true;

    if (recordMod) {
      let m = this.modifications.get(key);
      if (!m) { m = new Map(); this.modifications.set(key, m); }
      m.set(localIdx, blockId);
    }

    // Mark neighboring chunks dirty if edited on a chunk boundary
    if (lx === 0) { const n = this.getChunk(cx - 1, cz); if (n) n.dirty = true; }
    if (lx === CHUNK_SIZE - 1) { const n = this.getChunk(cx + 1, cz); if (n) n.dirty = true; }
    if (lz === 0) { const n = this.getChunk(cx, cz - 1); if (n) n.dirty = true; }
    if (lz === CHUNK_SIZE - 1) { const n = this.getChunk(cx, cz + 1); if (n) n.dirty = true; }
    return true;
  }

  isSolid(wx, wy, wz) {
    const b = BLOCKS[this.getBlock(wx, wy, wz)];
    return !!(b && b.solid);
  }

  getSurfaceY(wx, wz) {
    const x = Math.floor(wx), z = Math.floor(wz);
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    this.generateChunk(cx, cz);
    for (let y = CHUNK_HEIGHT - 2; y >= 1; y--) {
      const b = BLOCKS[this.getBlock(x, y, z)];
      if (b && b.solid) return y + 1;
    }
    return SEA_LEVEL + 2;
  }
}
