/* ==========================================================================
   DILLYVERSE — High-Performance Chunk Mesher (Face Culling + Vertex AO)
   Builds ONE opaque BufferGeometry + ONE transparent BufferGeometry per chunk.
   Zero per-block Three.js meshes!
   ========================================================================== */

import * as THREE from 'three';
import { B, BLOCKS, getFaceTex } from './blocks.js';
import { ATLAS_GRID } from './textures.js';
import { CHUNK_SIZE, CHUNK_HEIGHT } from './world.js';

const UV_STEP = 1 / ATLAS_GRID;
const UV_PAD = 0.0015;

// 6 faces with CCW vertex order, normal, shade multiplier, and face name
const FACES = [
  { // +Y Top
    name: 'top', dir: [0, 1, 0], shade: 1.0,
    verts: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
    uvs: [[0, 0], [1, 0], [1, 1], [0, 1]]
  },
  { // -Y Bottom
    name: 'bottom', dir: [0, -1, 0], shade: 0.52,
    verts: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
    uvs: [[0, 0], [1, 0], [1, 1], [0, 1]]
  },
  { // +X Right
    name: 'side', dir: [1, 0, 0], shade: 0.80,
    verts: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
    uvs: [[0, 0], [1, 0], [1, 1], [0, 1]]
  },
  { // -X Left
    name: 'side', dir: [-1, 0, 0], shade: 0.76,
    verts: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
    uvs: [[0, 0], [1, 0], [1, 1], [0, 1]]
  },
  { // +Z Front
    name: 'front', dir: [0, 0, 1], shade: 0.88,
    verts: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
    uvs: [[0, 0], [1, 0], [1, 1], [0, 1]]
  },
  { // -Z Back
    name: 'side', dir: [0, 0, -1], shade: 0.84,
    verts: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
    uvs: [[0, 0], [1, 0], [1, 1], [0, 1]]
  },
];

function createBuf() {
  return { pos: [], norm: [], uv: [], col: [], idx: [] };
}

function pushQuad(buf, verts, norm, tileIdx, shade, aoArr) {
  const base = buf.pos.length / 3;
  const tx = tileIdx % ATLAS_GRID;
  const ty = Math.floor(tileIdx / ATLAS_GRID);
  const u0 = tx * UV_STEP + UV_PAD;
  const u1 = (tx + 1) * UV_STEP - UV_PAD;
  const v1 = 1 - ty * UV_STEP - UV_PAD;
  const v0 = 1 - (ty + 1) * UV_STEP + UV_PAD;
  const uvCoords = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];

  for (let i = 0; i < 4; i++) {
    buf.pos.push(verts[i][0], verts[i][1], verts[i][2]);
    buf.norm.push(norm[0], norm[1], norm[2]);
    buf.uv.push(uvCoords[i][0], uvCoords[i][1]);
    const c = shade * (aoArr ? aoArr[i] : 1.0);
    buf.col.push(c, c, c);
  }
  buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function buildGeometry(buf) {
  if (buf.pos.length === 0) return null;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(buf.norm, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
  geom.setIndex(buf.idx);
  geom.computeBoundingSphere();
  return geom;
}

export function buildChunkMeshes(world, chunk, materials) {
  // Dispose previous meshes
  for (const m of chunk.meshes) {
    if (m.parent) m.parent.remove(m);
    m.geometry.dispose();
  }
  chunk.meshes = [];

  const opBuf = createBuf();
  const trBuf = createBuf();
  const cutBuf = createBuf();

  const baseX = chunk.cx * CHUNK_SIZE;
  const baseZ = chunk.cz * CHUNK_SIZE;

  const isOpaqueSolid = (wx, wy, wz) => {
    const def = BLOCKS[world.getBlock(wx, wy, wz)];
    return !!(def && def.solid && !def.transparent);
  };

  const maxY = Math.min(CHUNK_HEIGHT - 1, chunk.maxY || CHUNK_HEIGHT - 1);
  for (let y = 0; y <= maxY; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const bid = chunk.data[world.idx(lx, y, lz)];
        if (bid === B.AIR) continue;
        const def = BLOCKS[bid];
        if (!def) continue;

        const wx = baseX + lx;
        const wz = baseZ + lz;

        // Cross-billboard plants (flowers, tall grass) & torches
        if (def.cross || bid === B.TORCH) {
          const tIdx = getFaceTex(bid, 'side');
          const yTop = bid === B.TORCH ? y + 0.72 : y + 0.85;
          const x0 = wx + 0.15, x1 = wx + 0.85, z0 = wz + 0.15, z1 = wz + 0.85;
          const shade = bid === B.TORCH ? 1.15 : 0.95;
          pushQuad(cutBuf, [[x0, y, z0], [x1, y, z1], [x1, yTop, z1], [x0, yTop, z0]], [0, 1, 0], tIdx, shade);
          pushQuad(cutBuf, [[x1, y, z0], [x0, y, z1], [x0, yTop, z1], [x1, yTop, z0]], [0, 1, 0], tIdx, shade);
          continue;
        }

        const targetBuf = def.cutout ? cutBuf : (def.transparent ? trBuf : opBuf);

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const nx = wx + face.dir[0];
          const ny = y + face.dir[1];
          const nz = wz + face.dir[2];
          const nId = world.getBlock(nx, ny, nz);
          const nDef = BLOCKS[nId];

          // Face culling
          if (def.liquid) {
            if (nId === bid || (nDef && nDef.solid && !nDef.transparent)) continue;
          } else if (def.transparent) {
            if (nId === bid || (nDef && nDef.solid && !nDef.transparent)) continue;
          } else {
            if (nDef && nDef.solid && !nDef.transparent) continue;
          }

          const tIdx = getFaceTex(bid, face.name);
          const yOff = (def.liquid && face.name === 'top' && nId === B.AIR) ? -0.12 : 0;

          const v = face.verts.map(([vx, vy, vz]) => [wx + vx, y + vy + (vy === 1 ? yOff : 0), wz + vz]);

          // Simple fast vertex Ambient Occlusion on top & side faces of solid blocks
          let ao = null;
          if (!def.transparent && !def.liquid) {
            ao = [1, 1, 1, 1];
            if (face.name === 'top') {
              for (let i = 0; i < 4; i++) {
                const dx = face.verts[i][0] === 0 ? -1 : 1;
                const dz = face.verts[i][2] === 0 ? -1 : 1;
                let occ = 0;
                if (isOpaqueSolid(wx + dx, y + 1, wz)) occ++;
                if (isOpaqueSolid(wx, y + 1, wz + dz)) occ++;
                if (isOpaqueSolid(wx + dx, y + 1, wz + dz)) occ++;
                ao[i] = 1 - occ * 0.16;
              }
            }
          }

          const shade = def.emissive ? 1.25 : face.shade;
          pushQuad(targetBuf, v, face.dir, tIdx, shade, ao);
        }
      }
    }
  }

  const gOp = buildGeometry(opBuf);
  if (gOp) {
    const m = new THREE.Mesh(gOp, materials.opaque);
    m.receiveShadow = true;
    chunk.meshes.push(m);
  }
  const gCut = buildGeometry(cutBuf);
  if (gCut) {
    const m = new THREE.Mesh(gCut, materials.cutout);
    chunk.meshes.push(m);
  }
  const gTr = buildGeometry(trBuf);
  if (gTr) {
    const m = new THREE.Mesh(gTr, materials.transparent);
    m.renderOrder = 2;
    chunk.meshes.push(m);
  }

  chunk.dirty = false;
  return chunk.meshes;
}
