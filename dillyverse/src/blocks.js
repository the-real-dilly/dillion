/* ==========================================================================
   DILLYVERSE — Block & Item Registry
   Original voxel sandbox block definitions, hardness, tools, drops & food.
   ========================================================================== */

export const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  COBBLESTONE: 4,
  SAND: 5,
  GRAVEL: 6,
  OAK_LOG: 7,
  OAK_PLANKS: 8,
  LEAVES: 9,
  GLASS: 10,
  COAL_ORE: 11,
  IRON_ORE: 12,
  GOLD_ORE: 13,
  DIAMOND_ORE: 14,
  WATER: 15,
  LAVA: 16,
  BEDROCK: 17,
  SNOW: 18,
  CLAY: 19,
  BRICKS: 20,
  CRAFTING_TABLE: 21,
  FURNACE: 22,
  TORCH: 23,
  FLOWER: 24,
  TALL_GRASS: 25,
};

// Non-block items start at 100
export const IT = {
  STICK: 100,
  COAL: 101,
  IRON_INGOT: 102,
  GOLD_INGOT: 103,
  DIAMOND: 104,
  APPLE: 105,
  RAW_BEEF: 106,
  COOKED_STEAK: 107,
  BREAD: 108,
  DILLY_PICKLE: 109,

  WOOD_PICKAXE: 120,
  STONE_PICKAXE: 121,
  IRON_PICKAXE: 122,
  DIAMOND_PICKAXE: 123,

  WOOD_AXE: 130,
  STONE_AXE: 131,
  IRON_AXE: 132,
  DIAMOND_AXE: 133,

  WOOD_SHOVEL: 140,
  STONE_SHOVEL: 141,
  IRON_SHOVEL: 142,
  DIAMOND_SHOVEL: 143,

  WOOD_SWORD: 150,
  STONE_SWORD: 151,
  IRON_SWORD: 152,
  DIAMOND_SWORD: 153,

  IRON_HELMET: 160,
  IRON_CHESTPLATE: 161,
  IRON_LEGGINGS: 162,
  IRON_BOOTS: 163,

  DIAMOND_HELMET: 170,
  DIAMOND_CHESTPLATE: 171,
  DIAMOND_LEGGINGS: 172,
  DIAMOND_BOOTS: 173,
};

// Texture atlas tile indices (16x16 grid of 16px tiles = 256px atlas)
export const TEX = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  COBBLE: 4,
  SAND: 5,
  GRAVEL: 6,
  OAK_SIDE: 7,
  OAK_TOP: 8,
  PLANKS: 9,
  LEAVES: 10,
  GLASS: 11,
  COAL_ORE: 12,
  IRON_ORE: 13,
  GOLD_ORE: 14,
  DIAMOND_ORE: 15,
  WATER: 16,
  LAVA: 17,
  BEDROCK: 18,
  SNOW: 19,
  CLAY: 20,
  BRICKS: 21,
  CRAFT_TOP: 22,
  CRAFT_SIDE: 23,
  FURNACE_FRONT: 24,
  FURNACE_SIDE: 25,
  TORCH: 26,
  FLOWER: 27,
  TALL_GRASS: 28,
};

export const BLOCKS = {
  [B.AIR]: { id: B.AIR, name: 'Air', solid: false, transparent: true, hardness: 0 },
  [B.GRASS]: {
    id: B.GRASS, name: 'Grass Block', solid: true, transparent: false, hardness: 0.6,
    tool: 'shovel', drop: B.DIRT, mat: 'dirt', cat: 'Building',
    tex: { top: TEX.GRASS_TOP, bottom: TEX.DIRT, side: TEX.GRASS_SIDE },
    desc: 'Lush valley turf teeming with life.'
  },
  [B.DIRT]: {
    id: B.DIRT, name: 'Dirt', solid: true, transparent: false, hardness: 0.5,
    tool: 'shovel', drop: B.DIRT, mat: 'dirt', cat: 'Building',
    tex: { all: TEX.DIRT }, desc: 'Rich soil found beneath the surface.'
  },
  [B.STONE]: {
    id: B.STONE, name: 'Stone', solid: true, transparent: false, hardness: 1.5,
    tool: 'pickaxe', minTier: 1, drop: B.COBBLESTONE, mat: 'stone', cat: 'Building',
    tex: { all: TEX.STONE }, desc: 'Solid mountain rock. Mine with a pickaxe.'
  },
  [B.COBBLESTONE]: {
    id: B.COBBLESTONE, name: 'Cobblestone', solid: true, transparent: false, hardness: 1.8,
    tool: 'pickaxe', minTier: 1, drop: B.COBBLESTONE, mat: 'stone', cat: 'Building',
    tex: { all: TEX.COBBLE }, desc: 'Rough-hewn stone ideal for shelters and tools.'
  },
  [B.SAND]: {
    id: B.SAND, name: 'Sand', solid: true, transparent: false, hardness: 0.5,
    tool: 'shovel', drop: B.SAND, mat: 'sand', cat: 'Building',
    tex: { all: TEX.SAND }, desc: 'Fine golden sand. Smelt in a furnace for glass.'
  },
  [B.GRAVEL]: {
    id: B.GRAVEL, name: 'Gravel', solid: true, transparent: false, hardness: 0.6,
    tool: 'shovel', drop: B.GRAVEL, mat: 'sand', cat: 'Building',
    tex: { all: TEX.GRAVEL }, desc: 'Loose river pebbles and stone chips.'
  },
  [B.OAK_LOG]: {
    id: B.OAK_LOG, name: 'Oak Log', solid: true, transparent: false, hardness: 1.4,
    tool: 'axe', drop: B.OAK_LOG, mat: 'wood', cat: 'Building',
    tex: { top: TEX.OAK_TOP, bottom: TEX.OAK_TOP, side: TEX.OAK_SIDE },
    desc: 'Sturdy timber. Craft into planks and tools.'
  },
  [B.OAK_PLANKS]: {
    id: B.OAK_PLANKS, name: 'Oak Planks', solid: true, transparent: false, hardness: 1.2,
    tool: 'axe', drop: B.OAK_PLANKS, mat: 'wood', cat: 'Building',
    tex: { all: TEX.PLANKS }, desc: 'Finished lumber for building and crafting.'
  },
  [B.LEAVES]: {
    id: B.LEAVES, name: 'Oak Leaves', solid: true, transparent: true, cutout: true, hardness: 0.25,
    tool: 'axe', drop: B.LEAVES, bonusDrop: { id: IT.APPLE, chance: 0.16 }, mat: 'dirt', cat: 'Nature',
    tex: { all: TEX.LEAVES }, desc: 'Dense canopy foliage. Sometimes drops apples.'
  },
  [B.GLASS]: {
    id: B.GLASS, name: 'Glass', solid: true, transparent: true, hardness: 0.4,
    tool: 'pickaxe', drop: B.GLASS, mat: 'glass', cat: 'Building',
    tex: { all: TEX.GLASS }, desc: 'Crystal-clear architectural glass block.'
  },
  [B.COAL_ORE]: {
    id: B.COAL_ORE, name: 'Coal Ore', solid: true, transparent: false, hardness: 2.2,
    tool: 'pickaxe', minTier: 1, drop: IT.COAL, mat: 'stone', cat: 'Ores',
    tex: { all: TEX.COAL_ORE }, desc: 'Fossil fuel vein. Drops Coal for torches & smelting.'
  },
  [B.IRON_ORE]: {
    id: B.IRON_ORE, name: 'Iron Ore', solid: true, transparent: false, hardness: 2.8,
    tool: 'pickaxe', minTier: 2, drop: B.IRON_ORE, mat: 'stone', cat: 'Ores',
    tex: { all: TEX.IRON_ORE }, desc: 'Raw iron deposit. Smelt into Iron Ingots.'
  },
  [B.GOLD_ORE]: {
    id: B.GOLD_ORE, name: 'Gold Ore', solid: true, transparent: false, hardness: 3.0,
    tool: 'pickaxe', minTier: 3, drop: B.GOLD_ORE, mat: 'stone', cat: 'Ores',
    tex: { all: TEX.GOLD_ORE }, desc: 'Precious gilded ore found deep underground.'
  },
  [B.DIAMOND_ORE]: {
    id: B.DIAMOND_ORE, name: 'Diamond Ore', solid: true, transparent: false, hardness: 4.0,
    tool: 'pickaxe', minTier: 3, drop: IT.DIAMOND, mat: 'stone', cat: 'Ores',
    tex: { all: TEX.DIAMOND_ORE }, desc: 'Rare crystalline gem vein. Mine with Iron Pickaxe.'
  },
  [B.WATER]: {
    id: B.WATER, name: 'Water', solid: false, liquid: true, transparent: true, hardness: 999,
    mat: 'water', cat: 'Nature', tex: { all: TEX.WATER }, desc: 'Clear flowing valley water.'
  },
  [B.LAVA]: {
    id: B.LAVA, name: 'Lava', solid: false, liquid: true, transparent: false, emissive: true, hardness: 999,
    damage: 4, mat: 'water', cat: 'Nature', tex: { all: TEX.LAVA }, desc: 'Molten subterranean magma. Extremely hot!'
  },
  [B.BEDROCK]: {
    id: B.BEDROCK, name: 'Bedrock', solid: true, transparent: false, hardness: Infinity,
    mat: 'stone', cat: 'Nature', tex: { all: TEX.BEDROCK }, desc: 'Indestructible foundation of DillyVerse.'
  },
  [B.SNOW]: {
    id: B.SNOW, name: 'Snow Block', solid: true, transparent: false, hardness: 0.4,
    tool: 'shovel', drop: B.SNOW, mat: 'sand', cat: 'Building',
    tex: { all: TEX.SNOW }, desc: 'Packed alpine snow.'
  },
  [B.CLAY]: {
    id: B.CLAY, name: 'Clay', solid: true, transparent: false, hardness: 0.7,
    tool: 'shovel', drop: B.CLAY, mat: 'dirt', cat: 'Building',
    tex: { all: TEX.CLAY }, desc: 'Dense river clay. Smelt into Bricks.'
  },
  [B.BRICKS]: {
    id: B.BRICKS, name: 'Bricks', solid: true, transparent: false, hardness: 2.0,
    tool: 'pickaxe', minTier: 1, drop: B.BRICKS, mat: 'stone', cat: 'Building',
    tex: { all: TEX.BRICKS }, desc: 'Kiln-fired masonry blocks.'
  },
  [B.CRAFTING_TABLE]: {
    id: B.CRAFTING_TABLE, name: 'Crafting Table', solid: true, transparent: false, hardness: 1.2,
    tool: 'axe', drop: B.CRAFTING_TABLE, mat: 'wood', interact: 'craft', cat: 'Utility',
    tex: { top: TEX.CRAFT_TOP, bottom: TEX.PLANKS, side: TEX.CRAFT_SIDE },
    desc: 'Right-click to open the 3x3 crafting workbench.'
  },
  [B.FURNACE]: {
    id: B.FURNACE, name: 'Furnace', solid: true, transparent: false, hardness: 2.0,
    tool: 'pickaxe', minTier: 1, drop: B.FURNACE, mat: 'stone', interact: 'furnace', cat: 'Utility',
    tex: { top: TEX.STONE, bottom: TEX.STONE, side: TEX.FURNACE_SIDE, front: TEX.FURNACE_FRONT },
    desc: 'Right-click to smelt ores, glass, bricks, and food.'
  },
  [B.TORCH]: {
    id: B.TORCH, name: 'Torch', solid: false, transparent: true, emissive: true, hardness: 0.1,
    drop: B.TORCH, mat: 'wood', cat: 'Utility', light: true,
    tex: { all: TEX.TORCH }, desc: 'Warm glowing light source for caves and nights.'
  },
  [B.FLOWER]: {
    id: B.FLOWER, name: 'Sunblossom', solid: false, transparent: true, cross: true, hardness: 0.05,
    drop: B.FLOWER, mat: 'dirt', cat: 'Nature',
    tex: { all: TEX.FLOWER }, desc: 'Vibrant wildflower native to DillyVerse meadows.'
  },
  [B.TALL_GRASS]: {
    id: B.TALL_GRASS, name: 'Meadow Grass', solid: false, transparent: true, cross: true, hardness: 0.05,
    drop: B.AIR, mat: 'dirt', cat: 'Nature',
    tex: { all: TEX.TALL_GRASS }, desc: 'Wild meadow blades.'
  },
};

export const ITEMS = {
  [IT.STICK]: { id: IT.STICK, name: 'Stick', stack: 64, icon: '🪵', color: '#a87643', cat: 'Materials', desc: 'Sturdy handle for tools and torches.' },
  [IT.COAL]: { id: IT.COAL, name: 'Coal', stack: 64, icon: '◆', color: '#2b2d34', fuel: 80, cat: 'Materials', desc: 'High-energy furnace fuel and torch tip.' },
  [IT.IRON_INGOT]: { id: IT.IRON_INGOT, name: 'Iron Ingot', stack: 64, icon: '▬', color: '#d8e0e8', cat: 'Materials', desc: 'Refined iron bar for strong tools & armor.' },
  [IT.GOLD_INGOT]: { id: IT.GOLD_INGOT, name: 'Gold Ingot', stack: 64, icon: '▬', color: '#ffd24c', cat: 'Materials', desc: 'Gleaming refined gold bar.' },
  [IT.DIAMOND]: { id: IT.DIAMOND, name: 'Diamond', stack: 64, icon: '◈', color: '#4ff2ff', cat: 'Materials', desc: 'Ultra-hard crystal for top-tier equipment.' },

  [IT.APPLE]: { id: IT.APPLE, name: 'Crisp Apple', stack: 64, food: 4, icon: '🍎', color: '#e63946', cat: 'Food', desc: 'Restores 4 hunger points.' },
  [IT.RAW_BEEF]: { id: IT.RAW_BEEF, name: 'Raw Roast', stack: 64, food: 3, icon: '🥩', color: '#c84b4b', cat: 'Food', desc: 'Cook in a furnace for a hearty steak.' },
  [IT.COOKED_STEAK]: { id: IT.COOKED_STEAK, name: 'Seared Steak', stack: 64, food: 8, heal: 2, icon: '🍖', color: '#8c4223', cat: 'Food', desc: 'Restores 8 hunger and 2 health.' },
  [IT.BREAD]: { id: IT.BREAD, name: 'Campfire Bread', stack: 64, food: 5, icon: '🍞', color: '#d49a47', cat: 'Food', desc: 'Warm crusty loaf. Restores 5 hunger.' },
  [IT.DILLY_PICKLE]: { id: IT.DILLY_PICKLE, name: 'Dilly Pickle', stack: 64, food: 6, heal: 4, icon: '🥒', color: '#58b836', cat: 'Food', desc: 'Signature crunchy DillyVerse snack! +6 hunger, +4 HP.' },

  // Pickaxes
  [IT.WOOD_PICKAXE]: { id: IT.WOOD_PICKAXE, name: 'Wood Pickaxe', stack: 1, tool: 'pickaxe', tier: 1, speed: 2.2, durability: 60, damage: 2, icon: '⛏', color: '#b5844c', cat: 'Tools', desc: 'Mines stone and coal ore.' },
  [IT.STONE_PICKAXE]: { id: IT.STONE_PICKAXE, name: 'Stone Pickaxe', stack: 1, tool: 'pickaxe', tier: 2, speed: 3.6, durability: 132, damage: 3, icon: '⛏', color: '#9aa0a8', cat: 'Tools', desc: 'Mines iron ore and stone quickly.' },
  [IT.IRON_PICKAXE]: { id: IT.IRON_PICKAXE, name: 'Iron Pickaxe', stack: 1, tool: 'pickaxe', tier: 3, speed: 5.5, durability: 250, damage: 4, icon: '⛏', color: '#dce4ec', cat: 'Tools', desc: 'Mines gold and diamond ore.' },
  [IT.DIAMOND_PICKAXE]: { id: IT.DIAMOND_PICKAXE, name: 'Diamond Pickaxe', stack: 1, tool: 'pickaxe', tier: 4, speed: 8.5, durability: 900, damage: 5, icon: '⛏', color: '#4ff2ff', cat: 'Tools', desc: 'Cuts through rock at blinding speed.' },

  // Axes
  [IT.WOOD_AXE]: { id: IT.WOOD_AXE, name: 'Wood Axe', stack: 1, tool: 'axe', tier: 1, speed: 2.2, durability: 60, damage: 3, icon: '🪓', color: '#b5844c', cat: 'Tools', desc: 'Chops timber faster.' },
  [IT.STONE_AXE]: { id: IT.STONE_AXE, name: 'Stone Axe', stack: 1, tool: 'axe', tier: 2, speed: 3.6, durability: 132, damage: 4, icon: '🪓', color: '#9aa0a8', cat: 'Tools', desc: 'Reliable stone woodcutter.' },
  [IT.IRON_AXE]: { id: IT.IRON_AXE, name: 'Iron Axe', stack: 1, tool: 'axe', tier: 3, speed: 5.5, durability: 250, damage: 5, icon: '🪓', color: '#dce4ec', cat: 'Tools', desc: 'Heavy iron felling axe.' },
  [IT.DIAMOND_AXE]: { id: IT.DIAMOND_AXE, name: 'Diamond Axe', stack: 1, tool: 'axe', tier: 4, speed: 8.5, durability: 900, damage: 6, icon: '🪓', color: '#4ff2ff', cat: 'Tools', desc: 'Razor-sharp crystalline axe.' },

  // Shovels
  [IT.WOOD_SHOVEL]: { id: IT.WOOD_SHOVEL, name: 'Wood Shovel', stack: 1, tool: 'shovel', tier: 1, speed: 2.4, durability: 60, damage: 2, icon: '🥄', color: '#b5844c', cat: 'Tools', desc: 'Digs dirt, sand, and snow.' },
  [IT.STONE_SHOVEL]: { id: IT.STONE_SHOVEL, name: 'Stone Shovel', stack: 1, tool: 'shovel', tier: 2, speed: 4.0, durability: 132, damage: 2, icon: '🥄', color: '#9aa0a8', cat: 'Tools', desc: 'Sturdy earth-moving spade.' },
  [IT.IRON_SHOVEL]: { id: IT.IRON_SHOVEL, name: 'Iron Shovel', stack: 1, tool: 'shovel', tier: 3, speed: 6.0, durability: 250, damage: 3, icon: '🥄', color: '#dce4ec', cat: 'Tools', desc: 'Fast iron trenching shovel.' },
  [IT.DIAMOND_SHOVEL]: { id: IT.DIAMOND_SHOVEL, name: 'Diamond Shovel', stack: 1, tool: 'shovel', tier: 4, speed: 9.0, durability: 900, damage: 4, icon: '🥄', color: '#4ff2ff', cat: 'Tools', desc: 'Instant earthwork excavator.' },

  // Swords
  [IT.WOOD_SWORD]: { id: IT.WOOD_SWORD, name: 'Wood Blade', stack: 1, tool: 'sword', tier: 1, speed: 1.5, durability: 60, damage: 4, icon: '🗡', color: '#b5844c', cat: 'Combat', desc: 'Basic self-defense blade (4 DMG).' },
  [IT.STONE_SWORD]: { id: IT.STONE_SWORD, name: 'Stone Blade', stack: 1, tool: 'sword', tier: 2, speed: 1.5, durability: 132, damage: 5, icon: '🗡', color: '#9aa0a8', cat: 'Combat', desc: 'Sharp stone sword (5 DMG).' },
  [IT.IRON_SWORD]: { id: IT.IRON_SWORD, name: 'Iron Blade', stack: 1, tool: 'sword', tier: 3, speed: 1.5, durability: 250, damage: 7, icon: '🗡', color: '#dce4ec', cat: 'Combat', desc: 'Forged iron sword (7 DMG).' },
  [IT.DIAMOND_SWORD]: { id: IT.DIAMOND_SWORD, name: 'Diamond Blade', stack: 1, tool: 'sword', tier: 4, speed: 1.5, durability: 900, damage: 10, icon: '🗡', color: '#4ff2ff', cat: 'Combat', desc: 'Masterwork crystal blade (10 DMG).' },

  // Armor
  [IT.IRON_HELMET]: { id: IT.IRON_HELMET, name: 'Iron Helmet', stack: 1, armorSlot: 0, defense: 2, durability: 165, icon: '⛑', color: '#dce4ec', cat: 'Armor', desc: '+2 Armor defense.' },
  [IT.IRON_CHESTPLATE]: { id: IT.IRON_CHESTPLATE, name: 'Iron Chestplate', stack: 1, armorSlot: 1, defense: 5, durability: 240, icon: '🦺', color: '#dce4ec', cat: 'Armor', desc: '+5 Armor defense.' },
  [IT.IRON_LEGGINGS]: { id: IT.IRON_LEGGINGS, name: 'Iron Leggings', stack: 1, armorSlot: 2, defense: 4, durability: 225, icon: '👖', color: '#dce4ec', cat: 'Armor', desc: '+4 Armor defense.' },
  [IT.IRON_BOOTS]: { id: IT.IRON_BOOTS, name: 'Iron Boots', stack: 1, armorSlot: 3, defense: 2, durability: 195, icon: '🥾', color: '#dce4ec', cat: 'Armor', desc: '+2 Armor defense.' },

  [IT.DIAMOND_HELMET]: { id: IT.DIAMOND_HELMET, name: 'Diamond Helmet', stack: 1, armorSlot: 0, defense: 3, durability: 363, icon: '⛑', color: '#4ff2ff', cat: 'Armor', desc: '+3 Armor defense.' },
  [IT.DIAMOND_CHESTPLATE]: { id: IT.DIAMOND_CHESTPLATE, name: 'Diamond Chestplate', stack: 1, armorSlot: 1, defense: 8, durability: 528, icon: '🦺', color: '#4ff2ff', cat: 'Armor', desc: '+8 Armor defense.' },
  [IT.DIAMOND_LEGGINGS]: { id: IT.DIAMOND_LEGGINGS, name: 'Diamond Leggings', stack: 1, armorSlot: 2, defense: 6, durability: 495, icon: '👖', color: '#4ff2ff', cat: 'Armor', desc: '+6 Armor defense.' },
  [IT.DIAMOND_BOOTS]: { id: IT.DIAMOND_BOOTS, name: 'Diamond Boots', stack: 1, armorSlot: 3, defense: 3, durability: 429, icon: '🥾', color: '#4ff2ff', cat: 'Armor', desc: '+3 Armor defense.' },
};

export function getDef(id) {
  return BLOCKS[id] || ITEMS[id] || null;
}

export function isBlockId(id) {
  return id > 0 && id < 100 && !!BLOCKS[id];
}

export function getFaceTex(blockId, face) {
  const b = BLOCKS[blockId];
  if (!b || !b.tex) return 0;
  if (b.tex.all !== undefined) return b.tex.all;
  if (face === 'top' && b.tex.top !== undefined) return b.tex.top;
  if (face === 'bottom' && b.tex.bottom !== undefined) return b.tex.bottom;
  if (face === 'front' && b.tex.front !== undefined) return b.tex.front;
  return b.tex.side !== undefined ? b.tex.side : 0;
}

export function getAllCatalogIds() {
  const blocks = Object.keys(BLOCKS).map(Number).filter(id => id > 0 && id !== B.WATER && id !== B.LAVA && id !== B.TALL_GRASS);
  const items = Object.keys(ITEMS).map(Number);
  return [...blocks, ...items];
}
