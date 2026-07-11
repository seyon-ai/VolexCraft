// inventory.js — hotbar state. Deliberately minimal (id + count per slot) so
// a future crafting/item system can extend Slot without reworking selection,
// save/load, or UI wiring.

import { PLACEABLE_BLOCKS, BlockRegistry } from './block.js';

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
      this.slots = PLACEABLE_BLOCKS.slice(0, HOTBAR_SIZE).map((id) => ({ blockId: id, count: Infinity }));
    }
    // Survival keeps whatever the player has already collected.
  }

  select(index) {
    if (index < 0 || index >= HOTBAR_SIZE) return;
    this.selectedIndex = index;
  }

  getSelectedSlot() { return this.slots[this.selectedIndex]; }

  getSelectedBlockId() {
    const slot = this.getSelectedSlot();
    return slot ? slot.blockId : null;
  }

  /** Called when the player breaks a block in survival mode. */
  addBlock(blockId, count = 1) {
    if (this.gameMode.isCreative()) return; // creative doesn't accumulate items
    for (const slot of this.slots) {
      if (slot && slot.blockId === blockId && slot.count < MAX_STACK) {
        slot.count = Math.min(MAX_STACK, slot.count + count);
        return;
      }
    }
    const emptyIndex = this.slots.findIndex((s) => s === null);
    if (emptyIndex !== -1) {
      this.slots[emptyIndex] = { blockId, count };
    }
  }

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
      slots: this.slots.map((s) => (s ? { blockId: s.blockId, count: s.count === Infinity ? -1 : s.count } : null)),
    };
  }

  loadFrom(data) {
    if (!data) return;
    this.selectedIndex = data.selectedIndex || 0;
    if (Array.isArray(data.slots)) {
      this.slots = data.slots.map((s) => (s ? { blockId: s.blockId, count: s.count === -1 ? Infinity : s.count } : null));
    }
  }

  blockName(blockId) {
    return BlockRegistry[blockId]?.name ?? 'Unknown';
  }
}
