/* ==========================================================================
   DILLYVERSE — Inventory, Hotbar, Armor, Stacking & Durability System
   36 slots (0-8 Hotbar, 9-35 Main Inventory) + 4 Armor Equipment Slots.
   ========================================================================== */

import { getDef, B, IT } from './blocks.js';

export class Inventory {
  constructor() {
    this.slots = new Array(36).fill(null); // { id, count, dur? }
    this.armor = new Array(4).fill(null);  // 0:Helm, 1:Chest, 2:Legs, 3:Boots
    this.selected = 0;                     // 0..8
  }

  giveStarterKit(mode = 'survival') {
    this.slots.fill(null);
    this.armor.fill(null);
    if (mode === 'creative') {
      const defaults = [
        B.GRASS, B.STONE, B.OAK_PLANKS, B.BRICKS, B.GLASS,
        B.OAK_LOG, B.CRAFTING_TABLE, B.FURNACE, B.TORCH
      ];
      defaults.forEach((id, i) => { this.slots[i] = { id, count: 64 }; });
    } else {
      this.add(IT.WOOD_PICKAXE, 1);
      this.add(IT.WOOD_AXE, 1);
      this.add(IT.WOOD_SWORD, 1);
      this.add(B.TORCH, 8);
      this.add(IT.DILLY_PICKLE, 3);
      this.add(IT.APPLE, 4);
    }
  }

  getHeld() {
    return this.slots[this.selected];
  }

  getMaxStack(id) {
    const def = getDef(id);
    return def && def.stack !== undefined ? def.stack : 64;
  }

  add(id, count = 1, dur = null) {
    if (!id || count <= 0) return 0;
    const def = getDef(id);
    if (!def) return count;
    const maxS = this.getMaxStack(id);
    let rem = count;

    // 1. Stack into existing slots
    if (maxS > 1) {
      for (let i = 0; i < 36 && rem > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === id && s.count < maxS) {
          const take = Math.min(rem, maxS - s.count);
          s.count += take;
          rem -= take;
        }
      }
    }
    // 2. Fill empty slots
    for (let i = 0; i < 36 && rem > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(rem, maxS);
        const item = { id, count: take };
        if (def.durability) item.dur = dur !== null ? dur : def.durability;
        this.slots[i] = item;
        rem -= take;
      }
    }
    return rem;
  }

  consumeSlot(idx, count = 1) {
    const s = this.slots[idx];
    if (!s) return false;
    s.count -= count;
    if (s.count <= 0) this.slots[idx] = null;
    return true;
  }

  damageHeld(amount = 1) {
    const s = this.slots[this.selected];
    if (!s || s.dur === undefined) return;
    s.dur -= amount;
    if (s.dur <= 0) this.slots[this.selected] = null;
  }

  getArmorDefense() {
    let def = 0;
    for (const a of this.armor) {
      if (!a) continue;
      const d = getDef(a.id);
      if (d && d.defense) def += d.defense;
    }
    return def;
  }

  countOf(id) {
    let total = 0;
    for (const s of this.slots) if (s && s.id === id) total += s.count;
    return total;
  }

  removeCount(id, count) {
    let rem = count;
    for (let i = 0; i < 36 && rem > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const take = Math.min(rem, s.count);
        s.count -= take;
        rem -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    return rem === 0;
  }

  serialize() {
    return {
      slots: this.slots.map(s => (s ? { ...s } : null)),
      armor: this.armor.map(s => (s ? { ...s } : null)),
      selected: this.selected,
    };
  }

  deserialize(data) {
    if (!data) return;
    if (Array.isArray(data.slots)) {
      this.slots = new Array(36).fill(null);
      for (let i = 0; i < Math.min(36, data.slots.length); i++) this.slots[i] = data.slots[i] ? { ...data.slots[i] } : null;
    }
    if (Array.isArray(data.armor)) {
      this.armor = new Array(4).fill(null);
      for (let i = 0; i < Math.min(4, data.armor.length); i++) this.armor[i] = data.armor[i] ? { ...data.armor[i] } : null;
    }
    if (typeof data.selected === 'number') this.selected = Math.max(0, Math.min(8, data.selected));
  }
}
