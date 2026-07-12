// inventory.js — hotbar state. Slots hold a generic `id`, which may be a
// placeable BlockId or a non-block ItemId (see items.js) — the two id
// spaces never overlap, so the rest of the game treats a slot's contents
// opaquely and only branches on "is this a block" where it actually matters
// (placement).

import { PLACEABLE_BLOCKS, BlockRegistry } from './block.js';
import { ItemRegistry, isItem } from './items.js';

const HOTBAR_SIZE = 9;
const MAX_STACK = 64;

export class Inventory {
  constructor(gameModeManager) {
    this.gameMode = gameModeManager;
    this.slots = new Array(HOTBAR_SIZE).fill(null);
    this.selectedIndex = 0;
    this.gameMode.onChange(() => this.refreshForMode());
    this.refreshForMode();
  }

  refreshForMode() {
    if (this.gameMode.isCreative()) {
      this._survivalBackup = this.slots; // remember real progress before switching away
      this.slots = PLACEABLE_BLOCKS.slice(0, HOTBAR_SIZE).map((id) => ({ id, count: Infinity }));
    } else {
      // Returning to Survival: Creative's infinite stacks never carry over.
      this.slots = this._survivalBackup ?? new Array(HOTBAR_SIZE).fill(null);
    }
  }

  select(index) {
    if (index < 0 || index >= HOTBAR_SIZE) return;
    this.selectedIndex = index;
  }

  getSelectedSlot() { return this.slots[this.selectedIndex]; }

  getSelectedBlockId() {
    const slot = this.getSelectedSlot();
    return slot ? slot.id : null;
  }

  /** Total count of a given id across all slots. */
  countItem(id) {
    return this.slots.reduce((sum, s) => (s && s.id === id ? sum + (s.count === Infinity ? 1e9 : s.count) : sum), 0);
  }

  /** Adds an item/block to the first matching stack, or the first empty slot. Returns true if it fit. */
  addItem(id, count = 1) {
    if (this.gameMode.isCreative()) return true; // creative doesn't accumulate items
    for (const slot of this.slots) {
      if (slot && slot.id === id && slot.count < MAX_STACK) {
        slot.count = Math.min(MAX_STACK, slot.count + count);
        return true;
      }
    }
    const emptyIndex = this.slots.findIndex((s) => s === null);
    if (emptyIndex !== -1) {
      this.slots[emptyIndex] = { id, count };
      return true;
    }
    return false;
  }

  /** Removes up to `count` of an id across slots. Returns true if the full amount was available and removed. */
  removeItem(id, count = 1) {
    if (this.gameMode.isCreative()) return true;
    if (this.countItem(id) < count) return false;
    let remaining = count;
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      const slot = this.slots[i];
      if (!slot || slot.id !== id) continue;
      const take = Math.min(slot.count, remaining);
      slot.count -= take;
      remaining -= take;
      if (slot.count <= 0) this.slots[i] = null;
    }
    return true;
  }

  /** Called when the player breaks a block in survival mode. */
  addBlock(id, count = 1) { return this.addItem(id, count); }

  /** Called when the player places a block; returns false if nothing was available. */
  consumeSelected() {
    if (this.gameMode.isCreative()) return true;
    const slot = this.getSelectedSlot();
    if (!slot || slot.count <= 0) return false;
    slot.count -= 1;
    if (slot.count <= 0) this.slots[this.selectedIndex] = null;
    return true;
  }

  serialize() {
    return {
      selectedIndex: this.selectedIndex,
      slots: this.slots.map((s) => (s ? { id: s.id, count: s.count === Infinity ? -1 : s.count } : null)),
    };
  }

  loadFrom(data) {
    if (!data) return;
    this.selectedIndex = data.selectedIndex || 0;
    if (Array.isArray(data.slots)) {
      this.slots = data.slots.map((s) => (s ? { id: s.id, count: s.count === -1 ? Infinity : s.count } : null));
    }
  }

  itemName(id) {
    if (isItem(id)) return ItemRegistry[id]?.name ?? 'Unknown Item';
    return BlockRegistry[id]?.name ?? 'Unknown Block';
  }
}
