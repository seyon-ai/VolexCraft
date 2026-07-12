// crafting.js — recipe data + the logic to attempt one craft/smelt against
// the player's inventory. Recipes are plain data (id/result/needs), so
// adding a new one later is a one-line addition, not a code change.

import { BlockId } from './block.js';
import { ItemId } from './items.js';

export const CRAFTING_RECIPES = [
  { id: 'planks', result: { id: BlockId.PLANKS, count: 4 }, needs: [{ id: BlockId.WOOD, count: 1 }] },
  { id: 'stick', result: { id: ItemId.STICK, count: 4 }, needs: [{ id: BlockId.PLANKS, count: 2 }] },
  { id: 'crafting_table', result: { id: BlockId.CRAFTING_TABLE, count: 1 }, needs: [{ id: BlockId.PLANKS, count: 4 }] },
  { id: 'furnace', result: { id: BlockId.FURNACE, count: 1 }, needs: [{ id: BlockId.COBBLESTONE, count: 8 }] },

  { id: 'wood_sword', result: { id: ItemId.WOOD_SWORD, count: 1 }, needs: [{ id: BlockId.PLANKS, count: 1 }, { id: ItemId.STICK, count: 1 }] },
  { id: 'stone_sword', result: { id: ItemId.STONE_SWORD, count: 1 }, needs: [{ id: BlockId.COBBLESTONE, count: 1 }, { id: ItemId.STICK, count: 1 }] },
  { id: 'iron_sword', result: { id: ItemId.IRON_SWORD, count: 1 }, needs: [{ id: ItemId.IRON_INGOT, count: 1 }, { id: ItemId.STICK, count: 1 }] },
  { id: 'diamond_sword', result: { id: ItemId.DIAMOND_SWORD, count: 1 }, needs: [{ id: ItemId.DIAMOND, count: 1 }, { id: ItemId.STICK, count: 1 }] },

  { id: 'wood_pickaxe', result: { id: ItemId.WOOD_PICKAXE, count: 1 }, needs: [{ id: BlockId.PLANKS, count: 3 }, { id: ItemId.STICK, count: 2 }] },
  { id: 'stone_pickaxe', result: { id: ItemId.STONE_PICKAXE, count: 1 }, needs: [{ id: BlockId.COBBLESTONE, count: 3 }, { id: ItemId.STICK, count: 2 }] },
  { id: 'iron_pickaxe', result: { id: ItemId.IRON_PICKAXE, count: 1 }, needs: [{ id: ItemId.IRON_INGOT, count: 3 }, { id: ItemId.STICK, count: 2 }] },
  { id: 'diamond_pickaxe', result: { id: ItemId.DIAMOND_PICKAXE, count: 1 }, needs: [{ id: ItemId.DIAMOND, count: 3 }, { id: ItemId.STICK, count: 2 }] },

  { id: 'iron_block', result: { id: BlockId.IRON_BLOCK, count: 1 }, needs: [{ id: ItemId.IRON_INGOT, count: 9 }] },
  { id: 'gold_block', result: { id: BlockId.GOLD_BLOCK, count: 1 }, needs: [{ id: ItemId.GOLD_INGOT, count: 9 }] },
  { id: 'diamond_block', result: { id: BlockId.DIAMOND_BLOCK, count: 1 }, needs: [{ id: ItemId.DIAMOND, count: 9 }] },
];

export const SMELTING_RECIPES = [
  { id: 'iron_ingot', result: { id: ItemId.IRON_INGOT, count: 1 }, needs: [{ id: BlockId.IRON_ORE, count: 1 }] },
  { id: 'gold_ingot', result: { id: ItemId.GOLD_INGOT, count: 1 }, needs: [{ id: BlockId.GOLD_ORE, count: 1 }] },
  { id: 'glass', result: { id: BlockId.GLASS, count: 1 }, needs: [{ id: BlockId.SAND, count: 1 }] },
  { id: 'brick', result: { id: BlockId.BRICK, count: 1 }, needs: [{ id: BlockId.CLAY, count: 1 }] },
];

// One fuel item consumed per smelt, regardless of type (kept simple on purpose).
export const FUEL_ITEMS = [BlockId.WOOD, BlockId.PLANKS, ItemId.COAL];

export function hasIngredients(inventory, needs) {
  return needs.every((n) => inventory.countItem(n.id) >= n.count);
}

export function findFuel(inventory) {
  return FUEL_ITEMS.find((id) => inventory.countItem(id) >= 1) ?? null;
}

/** Attempts a plain crafting-table recipe. Returns true on success. */
export function craftOnce(inventory, recipe) {
  if (!hasIngredients(inventory, recipe.needs)) return false;
  for (const n of recipe.needs) inventory.removeItem(n.id, n.count);
  inventory.addItem(recipe.result.id, recipe.result.count);
  return true;
}

/** Attempts a furnace recipe; also consumes one fuel item. Returns true on success. */
export function smeltOnce(inventory, recipe) {
  if (!hasIngredients(inventory, recipe.needs)) return false;
  const fuel = findFuel(inventory);
  if (fuel === null) return false;
  for (const n of recipe.needs) inventory.removeItem(n.id, n.count);
  inventory.removeItem(fuel, 1);
  inventory.addItem(recipe.result.id, recipe.result.count);
  return true;
}
