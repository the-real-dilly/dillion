/* ==========================================================================
   DILLYVERSE — Crafting (2x2 & 3x3 Grids) & Smelting Furnace Registry
   ========================================================================== */

import { B, IT } from './blocks.js';

export const RECIPES = [
  // Building & Basics (2x2 compatible)
  { id: 'planks', out: B.OAK_PLANKS, count: 4, cat: 'Building', grid: 2, req: [[B.OAK_LOG, 1]], pattern: [B.OAK_LOG] },
  { id: 'sticks', out: IT.STICK, count: 4, cat: 'Building', grid: 2, req: [[B.OAK_PLANKS, 2]], pattern: [B.OAK_PLANKS, 0, B.OAK_PLANKS] },
  { id: 'craft_table', out: B.CRAFTING_TABLE, count: 1, cat: 'Utility', grid: 2, req: [[B.OAK_PLANKS, 4]] },
  { id: 'torch', out: B.TORCH, count: 4, cat: 'Utility', grid: 2, req: [[IT.COAL, 1], [IT.STICK, 1]] },
  { id: 'furnace', out: B.FURNACE, count: 1, cat: 'Utility', grid: 3, req: [[B.COBBLESTONE, 8]] },
  { id: 'bricks', out: B.BRICKS, count: 2, cat: 'Building', grid: 2, req: [[B.CLAY, 4]] },

  // Wood Tools
  { id: 'wood_pick', out: IT.WOOD_PICKAXE, count: 1, cat: 'Tools', grid: 3, req: [[B.OAK_PLANKS, 3], [IT.STICK, 2]] },
  { id: 'wood_axe', out: IT.WOOD_AXE, count: 1, cat: 'Tools', grid: 3, req: [[B.OAK_PLANKS, 3], [IT.STICK, 2]] },
  { id: 'wood_shovel', out: IT.WOOD_SHOVEL, count: 1, cat: 'Tools', grid: 3, req: [[B.OAK_PLANKS, 1], [IT.STICK, 2]] },
  { id: 'wood_sword', out: IT.WOOD_SWORD, count: 1, cat: 'Combat', grid: 3, req: [[B.OAK_PLANKS, 2], [IT.STICK, 1]] },

  // Stone Tools
  { id: 'stone_pick', out: IT.STONE_PICKAXE, count: 1, cat: 'Tools', grid: 3, req: [[B.COBBLESTONE, 3], [IT.STICK, 2]] },
  { id: 'stone_axe', out: IT.STONE_AXE, count: 1, cat: 'Tools', grid: 3, req: [[B.COBBLESTONE, 3], [IT.STICK, 2]] },
  { id: 'stone_shovel', out: IT.STONE_SHOVEL, count: 1, cat: 'Tools', grid: 3, req: [[B.COBBLESTONE, 1], [IT.STICK, 2]] },
  { id: 'stone_sword', out: IT.STONE_SWORD, count: 1, cat: 'Combat', grid: 3, req: [[B.COBBLESTONE, 2], [IT.STICK, 1]] },

  // Iron Tools & Armor
  { id: 'iron_pick', out: IT.IRON_PICKAXE, count: 1, cat: 'Tools', grid: 3, req: [[IT.IRON_INGOT, 3], [IT.STICK, 2]] },
  { id: 'iron_axe', out: IT.IRON_AXE, count: 1, cat: 'Tools', grid: 3, req: [[IT.IRON_INGOT, 3], [IT.STICK, 2]] },
  { id: 'iron_shovel', out: IT.IRON_SHOVEL, count: 1, cat: 'Tools', grid: 3, req: [[IT.IRON_INGOT, 1], [IT.STICK, 2]] },
  { id: 'iron_sword', out: IT.IRON_SWORD, count: 1, cat: 'Combat', grid: 3, req: [[IT.IRON_INGOT, 2], [IT.STICK, 1]] },
  { id: 'iron_helm', out: IT.IRON_HELMET, count: 1, cat: 'Armor', grid: 3, req: [[IT.IRON_INGOT, 5]] },
  { id: 'iron_chest', out: IT.IRON_CHESTPLATE, count: 1, cat: 'Armor', grid: 3, req: [[IT.IRON_INGOT, 8]] },
  { id: 'iron_legs', out: IT.IRON_LEGGINGS, count: 1, cat: 'Armor', grid: 3, req: [[IT.IRON_INGOT, 7]] },
  { id: 'iron_boots', out: IT.IRON_BOOTS, count: 1, cat: 'Armor', grid: 3, req: [[IT.IRON_INGOT, 4]] },

  // Diamond Tools & Armor
  { id: 'dia_pick', out: IT.DIAMOND_PICKAXE, count: 1, cat: 'Tools', grid: 3, req: [[IT.DIAMOND, 3], [IT.STICK, 2]] },
  { id: 'dia_axe', out: IT.DIAMOND_AXE, count: 1, cat: 'Tools', grid: 3, req: [[IT.DIAMOND, 3], [IT.STICK, 2]] },
  { id: 'dia_shovel', out: IT.DIAMOND_SHOVEL, count: 1, cat: 'Tools', grid: 3, req: [[IT.DIAMOND, 1], [IT.STICK, 2]] },
  { id: 'dia_sword', out: IT.DIAMOND_SWORD, count: 1, cat: 'Combat', grid: 3, req: [[IT.DIAMOND, 2], [IT.STICK, 1]] },
  { id: 'dia_helm', out: IT.DIAMOND_HELMET, count: 1, cat: 'Armor', grid: 3, req: [[IT.DIAMOND, 5]] },
  { id: 'dia_chest', out: IT.DIAMOND_CHESTPLATE, count: 1, cat: 'Armor', grid: 3, req: [[IT.DIAMOND, 8]] },
  { id: 'dia_legs', out: IT.DIAMOND_LEGGINGS, count: 1, cat: 'Armor', grid: 3, req: [[IT.DIAMOND, 7]] },
  { id: 'dia_boots', out: IT.DIAMOND_BOOTS, count: 1, cat: 'Armor', grid: 3, req: [[IT.DIAMOND, 4]] },

  // Food
  { id: 'dilly_pickle', out: IT.DILLY_PICKLE, count: 2, cat: 'Survival', grid: 2, req: [[B.LEAVES, 2], [IT.APPLE, 1]] },
];

export const SMELT_RECIPES = {
  [B.IRON_ORE]: { out: IT.IRON_INGOT, time: 3.5 },
  [B.GOLD_ORE]: { out: IT.GOLD_INGOT, time: 3.5 },
  [B.SAND]: { out: B.GLASS, time: 2.5 },
  [B.COBBLESTONE]: { out: B.STONE, time: 2.5 },
  [B.CLAY]: { out: B.BRICKS, time: 3.0 },
  [IT.RAW_BEEF]: { out: IT.COOKED_STEAK, time: 3.0 },
};

export const FUEL_VALUES = {
  [IT.COAL]: 28,
  [B.OAK_LOG]: 12,
  [B.OAK_PLANKS]: 8,
  [IT.STICK]: 4,
};

export function canCraft(recipe, inv, isTableOpen) {
  if (recipe.grid > 2 && !isTableOpen) return false;
  for (const [id, qty] of recipe.req) {
    if (inv.countOf(id) < qty) return false;
  }
  return true;
}

export function performCraft(recipe, inv, isTableOpen) {
  if (!canCraft(recipe, inv, isTableOpen)) return false;
  for (const [id, qty] of recipe.req) inv.removeCount(id, qty);
  inv.add(recipe.out, recipe.count);
  return true;
}

export class FurnaceState {
  constructor() {
    this.input = null;  // { id, count }
    this.fuel = null;   // { id, count }
    this.output = null; // { id, count }
    this.burnLeft = 0;
    this.burnMax = 1;
    this.progress = 0;
  }

  update(dt) {
    const rec = this.input ? SMELT_RECIPES[this.input.id] : null;
    const canOutput = rec && (!this.output || (this.output.id === rec.out && this.output.count < 64));

    if (this.burnLeft > 0) this.burnLeft = Math.max(0, this.burnLeft - dt);

    if (canOutput && this.burnLeft <= 0 && this.fuel) {
      const fVal = FUEL_VALUES[this.fuel.id];
      if (fVal) {
        this.burnLeft = fVal;
        this.burnMax = fVal;
        this.fuel.count--;
        if (this.fuel.count <= 0) this.fuel = null;
      }
    }

    if (canOutput && this.burnLeft > 0) {
      this.progress += dt;
      if (this.progress >= rec.time) {
        this.progress = 0;
        this.input.count--;
        if (this.input.count <= 0) this.input = null;
        if (!this.output) this.output = { id: rec.out, count: 1 };
        else this.output.count++;
        return true; // finished smelting an item
      }
    } else if (!canOutput) {
      this.progress = 0;
    }
    return false;
  }
}
