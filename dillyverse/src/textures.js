/* ==========================================================================
   DILLYVERSE — Procedural Pixel-Art Texture Atlas & Block Icons
   Generates an original 16x16-tile (256x256) crisp CanvasTexture atlas.
   ========================================================================== */

import * as THREE from 'three';
import { TEX, BLOCKS, B } from './blocks.js';

export const ATLAS_GRID = 16;
export const TILE_PX = 16;
const ATLAS_PX = ATLAS_GRID * TILE_PX;

function hash2(x, y, s) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function drawNoiseTile(ctx, ox, oy, baseRGB, variance, seed) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = (hash2(x, y, seed) - 0.5) * 2 * variance;
      const r = Math.max(0, Math.min(255, Math.round(baseRGB[0] + n)));
      const g = Math.max(0, Math.min(255, Math.round(baseRGB[1] + n)));
      const b = Math.max(0, Math.min(255, Math.round(baseRGB[2] + n)));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

function drawOreTile(ctx, ox, oy, oreCol, brightCol, seed) {
  drawNoiseTile(ctx, ox, oy, [122, 128, 134], 16, seed);
  // Subtle stone cracks
  ctx.fillStyle = 'rgba(40,44,50,0.35)';
  ctx.fillRect(ox + 2, oy + 5, 6, 1);
  ctx.fillRect(ox + 9, oy + 11, 5, 1);
  // Ore nuggets
  for (let i = 0; i < 9; i++) {
    const px = Math.floor(hash2(i, 1, seed + 7) * 12) + 2;
    const py = Math.floor(hash2(i, 2, seed + 11) * 12) + 2;
    ctx.fillStyle = oreCol;
    ctx.fillRect(ox + px, oy + py, 2, 2);
    ctx.fillStyle = brightCol;
    ctx.fillRect(ox + px, oy + py, 1, 1);
  }
}

export function createTextureAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_PX;
  canvas.height = ATLAS_PX;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, ATLAS_PX, ATLAS_PX);

  const pos = (idx) => [(idx % ATLAS_GRID) * TILE_PX, Math.floor(idx / ATLAS_GRID) * TILE_PX];

  // GRASS_TOP
  {
    const [ox, oy] = pos(TEX.GRASS_TOP);
    drawNoiseTile(ctx, ox, oy, [88, 168, 72], 18, 1);
    ctx.fillStyle = 'rgba(140,220,96,0.45)';
    for (let i = 0; i < 18; i++) ctx.fillRect(ox + Math.floor(hash2(i, 3, 2) * 16), oy + Math.floor(hash2(i, 4, 2) * 16), 1, 2);
  }
  // GRASS_SIDE
  {
    const [ox, oy] = pos(TEX.GRASS_SIDE);
    drawNoiseTile(ctx, ox, oy, [124, 86, 56], 15, 2);
    for (let x = 0; x < 16; x++) {
      const h = 3 + Math.floor(hash2(x, 0, 9) * 3);
      for (let y = 0; y < h; y++) {
        const shade = y === h - 1 ? [64, 134, 52] : [86, 168, 70];
        ctx.fillStyle = `rgb(${shade[0]},${shade[1]},${shade[2]})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }
  // DIRT
  {
    const [ox, oy] = pos(TEX.DIRT);
    drawNoiseTile(ctx, ox, oy, [124, 86, 56], 16, 3);
    ctx.fillStyle = 'rgba(72,48,30,0.45)';
    for (let i = 0; i < 10; i++) ctx.fillRect(ox + Math.floor(hash2(i, 1, 30) * 15), oy + Math.floor(hash2(i, 2, 30) * 15), 2, 1);
  }
  // STONE
  {
    const [ox, oy] = pos(TEX.STONE);
    drawNoiseTile(ctx, ox, oy, [126, 132, 138], 15, 4);
    ctx.fillStyle = 'rgba(65,70,76,0.35)';
    ctx.fillRect(ox + 1, oy + 4, 7, 1);
    ctx.fillRect(ox + 8, oy + 10, 6, 1);
    ctx.fillRect(ox + 3, oy + 14, 8, 1);
  }
  // COBBLE
  {
    const [ox, oy] = pos(TEX.COBBLE);
    drawNoiseTile(ctx, ox, oy, [110, 114, 120], 22, 5);
    ctx.strokeStyle = 'rgba(42,46,52,0.75)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, 7, 5);
    ctx.strokeRect(ox + 7.5, oy + 0.5, 8, 6);
    ctx.strokeRect(ox + 0.5, oy + 6.5, 9, 5);
    ctx.strokeRect(ox + 9.5, oy + 6.5, 6, 5);
    ctx.strokeRect(ox + 0.5, oy + 11.5, 6, 4);
    ctx.strokeRect(ox + 6.5, oy + 11.5, 9, 4);
  }
  // SAND
  {
    const [ox, oy] = pos(TEX.SAND);
    drawNoiseTile(ctx, ox, oy, [224, 206, 152], 14, 6);
  }
  // GRAVEL
  {
    const [ox, oy] = pos(TEX.GRAVEL);
    drawNoiseTile(ctx, ox, oy, [132, 128, 126], 28, 7);
  }
  // OAK_SIDE
  {
    const [ox, oy] = pos(TEX.OAK_SIDE);
    drawNoiseTile(ctx, ox, oy, [104, 74, 44], 12, 8);
    for (let x = 0; x < 16; x += 3) {
      ctx.fillStyle = x % 2 === 0 ? 'rgba(62,40,22,0.55)' : 'rgba(136,102,62,0.35)';
      ctx.fillRect(ox + x, oy, 1, 16);
    }
  }
  // OAK_TOP
  {
    const [ox, oy] = pos(TEX.OAK_TOP);
    drawNoiseTile(ctx, ox, oy, [168, 130, 82], 10, 9);
    ctx.strokeStyle = '#5c3d22';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + 1, oy + 1, 14, 14);
    ctx.strokeStyle = 'rgba(110,74,40,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 4.5, oy + 4.5, 7, 7);
  }
  // PLANKS
  {
    const [ox, oy] = pos(TEX.PLANKS);
    drawNoiseTile(ctx, ox, oy, [178, 136, 84], 10, 10);
    ctx.fillStyle = 'rgba(92,62,32,0.65)';
    for (let y = 0; y < 16; y += 4) ctx.fillRect(ox, oy + y, 16, 1);
    ctx.fillRect(ox + 7, oy, 1, 4);
    ctx.fillRect(ox + 12, oy + 4, 1, 4);
    ctx.fillRect(ox + 4, oy + 8, 1, 4);
    ctx.fillRect(ox + 10, oy + 12, 1, 4);
  }
  // LEAVES
  {
    const [ox, oy] = pos(TEX.LEAVES);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const v = hash2(x, y, 11);
        if (v < 0.22) continue; // crisp cutout holes
        const g = 104 + Math.floor(v * 64);
        ctx.fillStyle = `rgb(${38 + Math.floor(v * 28)},${g},${36 + Math.floor(v * 20)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }
  // GLASS
  {
    const [ox, oy] = pos(TEX.GLASS);
    ctx.fillStyle = 'rgba(195,238,255,0.22)';
    ctx.fillRect(ox, oy, 16, 16);
    ctx.strokeStyle = 'rgba(225,248,255,0.88)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, 15, 15);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(ox + 3, oy + 3, 3, 1);
    ctx.fillRect(ox + 3, oy + 4, 1, 2);
    ctx.fillRect(ox + 10, oy + 11, 2, 1);
  }
  // ORES
  drawOreTile(ctx, ...pos(TEX.COAL_ORE), '#1f2228', '#444954', 12);
  drawOreTile(ctx, ...pos(TEX.IRON_ORE), '#c89b78', '#f2d0b4', 13);
  drawOreTile(ctx, ...pos(TEX.GOLD_ORE), '#e6b422', '#fff08a', 14);
  drawOreTile(ctx, ...pos(TEX.DIAMOND_ORE), '#26d9e8', '#b8ffff', 15);

  // WATER
  {
    const [ox, oy] = pos(TEX.WATER);
    drawNoiseTile(ctx, ox, oy, [38, 128, 212], 14, 16);
    ctx.fillStyle = 'rgba(160,224,255,0.35)';
    ctx.fillRect(ox + 2, oy + 3, 6, 1);
    ctx.fillRect(ox + 8, oy + 10, 5, 1);
  }
  // LAVA
  {
    const [ox, oy] = pos(TEX.LAVA);
    drawNoiseTile(ctx, ox, oy, [232, 86, 22], 24, 17);
    ctx.fillStyle = '#ffe052';
    ctx.fillRect(ox + 2, oy + 3, 5, 2);
    ctx.fillRect(ox + 9, oy + 10, 4, 3);
    ctx.fillRect(ox + 4, oy + 12, 3, 2);
  }
  // BEDROCK
  {
    const [ox, oy] = pos(TEX.BEDROCK);
    drawNoiseTile(ctx, ox, oy, [44, 46, 52], 26, 18);
  }
  // SNOW
  {
    const [ox, oy] = pos(TEX.SNOW);
    drawNoiseTile(ctx, ox, oy, [238, 246, 252], 8, 19);
  }
  // CLAY
  {
    const [ox, oy] = pos(TEX.CLAY);
    drawNoiseTile(ctx, ox, oy, [154, 162, 174], 12, 20);
  }
  // BRICKS
  {
    const [ox, oy] = pos(TEX.BRICKS);
    drawNoiseTile(ctx, ox, oy, [164, 72, 58], 14, 21);
    ctx.fillStyle = '#cbc6bc';
    for (let y = 0; y < 16; y += 4) ctx.fillRect(ox, oy + y, 16, 1);
    for (let row = 0; row < 4; row++) {
      const off = (row % 2) * 4;
      for (let x = off; x < 16; x += 8) ctx.fillRect(ox + x, oy + row * 4, 1, 4);
    }
  }
  // CRAFT_TOP
  {
    const [ox, oy] = pos(TEX.CRAFT_TOP);
    drawNoiseTile(ctx, ox, oy, [158, 114, 66], 10, 22);
    ctx.strokeStyle = '#4e3318';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, 15, 15);
    for (let i = 5; i <= 10; i += 5) {
      ctx.fillStyle = '#4e3318';
      ctx.fillRect(ox + i, oy + 1, 1, 14);
      ctx.fillRect(ox + 1, oy + i, 14, 1);
    }
  }
  // CRAFT_SIDE
  {
    const [ox, oy] = pos(TEX.CRAFT_SIDE);
    drawNoiseTile(ctx, ox, oy, [166, 122, 72], 10, 23);
    ctx.fillStyle = '#5a3a1c';
    ctx.fillRect(ox, oy, 16, 3);
    ctx.fillStyle = '#cfd8e2';
    ctx.fillRect(ox + 3, oy + 5, 2, 7);
    ctx.fillRect(ox + 10, oy + 6, 3, 5);
  }
  // FURNACE_FRONT
  {
    const [ox, oy] = pos(TEX.FURNACE_FRONT);
    drawNoiseTile(ctx, ox, oy, [118, 122, 128], 14, 24);
    ctx.strokeStyle = '#3a3e44';
    ctx.strokeRect(ox + 0.5, oy + 0.5, 15, 15);
    ctx.fillStyle = '#1c181a';
    ctx.fillRect(ox + 3, oy + 3, 10, 4);
    ctx.fillRect(ox + 4, oy + 9, 8, 5);
    ctx.fillStyle = '#ff8a2b';
    ctx.fillRect(ox + 5, oy + 11, 6, 3);
    ctx.fillStyle = '#ffe26a';
    ctx.fillRect(ox + 6, oy + 12, 4, 2);
  }
  // FURNACE_SIDE
  {
    const [ox, oy] = pos(TEX.FURNACE_SIDE);
    drawNoiseTile(ctx, ox, oy, [118, 122, 128], 14, 25);
    ctx.fillStyle = '#484d54';
    ctx.fillRect(ox, oy + 7, 16, 2);
  }
  // TORCH
  {
    const [ox, oy] = pos(TEX.TORCH);
    ctx.fillStyle = '#8b5e34';
    ctx.fillRect(ox + 7, oy + 6, 2, 10);
    ctx.fillStyle = '#ff8a24';
    ctx.fillRect(ox + 6, oy + 2, 4, 4);
    ctx.fillStyle = '#fff188';
    ctx.fillRect(ox + 7, oy + 3, 2, 2);
  }
  // FLOWER
  {
    const [ox, oy] = pos(TEX.FLOWER);
    ctx.fillStyle = '#3fa34d';
    ctx.fillRect(ox + 7, oy + 8, 2, 8);
    ctx.fillRect(ox + 5, oy + 11, 2, 2);
    ctx.fillRect(ox + 9, oy + 10, 2, 2);
    ctx.fillStyle = '#ff5978';
    ctx.fillRect(ox + 5, oy + 4, 6, 5);
    ctx.fillStyle = '#ffe359';
    ctx.fillRect(ox + 7, oy + 5, 2, 2);
  }
  // TALL_GRASS
  {
    const [ox, oy] = pos(TEX.TALL_GRASS);
    ctx.fillStyle = '#52b043';
    ctx.fillRect(ox + 3, oy + 8, 1, 8);
    ctx.fillRect(ox + 6, oy + 5, 2, 11);
    ctx.fillRect(ox + 10, oy + 7, 2, 9);
    ctx.fillRect(ox + 13, oy + 9, 1, 7);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;

  // Pre-build dataURL thumbnails for each block for UI hotbar/inventory
  const icons = {};
  for (const idStr of Object.keys(BLOCKS)) {
    const id = Number(idStr);
    if (id === B.AIR) continue;
    const def = BLOCKS[id];
    const tileIdx = def.tex.front ?? def.tex.side ?? def.tex.all ?? def.tex.top ?? 0;
    const [ox, oy] = pos(tileIdx);
    const ic = document.createElement('canvas');
    ic.width = 32; ic.height = 32;
    const ictx = ic.getContext('2d');
    ictx.imageSmoothingEnabled = false;
    ictx.drawImage(canvas, ox, oy, 16, 16, 0, 0, 32, 32);
    icons[id] = ic.toDataURL();
  }

  return { texture, canvas, icons };
}
