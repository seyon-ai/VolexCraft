// items.js — items that are NOT placeable blocks: raw materials, tool/weapon
// items produced by crafting or smelting. Block ids run 0-99 (see block.js);
// item ids here start at 1000 so the two spaces never collide and an
// inventory slot can hold either kind of id without ambiguity.

export const ItemId = {
  STICK: 1000,
  COAL: 1001,
  RAW_IRON: 1002,
  IRON_INGOT: 1003,
  RAW_GOLD: 1004,
  GOLD_INGOT: 1005,
  DIAMOND: 1006,
  REDSTONE: 1007,
  EMERALD: 1008,

  WOOD_SWORD: 1010,
  STONE_SWORD: 1011,
  IRON_SWORD: 1012,
  DIAMOND_SWORD: 1013,

  WOOD_PICKAXE: 1020,
  STONE_PICKAXE: 1021,
  IRON_PICKAXE: 1022,
  DIAMOND_PICKAXE: 1023,

  RAW_BEEF: 1030,
  RAW_PORKCHOP: 1031,
  COOKED_BEEF: 1032,
  COOKED_PORKCHOP: 1033,
};

// Where to look for user-supplied icon images (one small square PNG per item).
// Any item whose file is missing just keeps its procedural glyph/swatch look.
export const ITEM_ICON_PATH = 'assets/textures/items/';

const swatch = (color, image) => ({ kind: 'swatch', color, image });
const icon = (glyph, color, image) => ({ kind: 'glyph', glyph, color, image });

export const ItemRegistry = {
  [ItemId.STICK]: { name: 'Stick', display: icon('|', '#a9825a', 'stick.png') },
  [ItemId.COAL]: { name: 'Coal', display: swatch('#242426', 'coal.png') },
  [ItemId.RAW_IRON]: { name: 'Raw Iron', display: swatch('#c9a67a', 'raw_iron.png') },
  [ItemId.IRON_INGOT]: { name: 'Iron Ingot', display: swatch('#dcdad2', 'iron_ingot.png') },
  [ItemId.RAW_GOLD]: { name: 'Raw Gold', display: swatch('#e0b840', 'raw_gold.png') },
  [ItemId.GOLD_INGOT]: { name: 'Gold Ingot', display: swatch('#f8d448', 'gold_ingot.png') },
  [ItemId.DIAMOND]: { name: 'Diamond', display: swatch('#66e0e0', 'diamond.png') },
  [ItemId.REDSTONE]: { name: 'Redstone', display: swatch('#c81c1c', 'redstone.png') },
  [ItemId.EMERALD]: { name: 'Emerald', display: swatch('#30c46e', 'emerald.png') },

  [ItemId.WOOD_SWORD]: { name: 'Wood Sword', display: icon('/', '#a9825a', 'wood_sword.png'), weapon: { damage: 3 } },
  [ItemId.STONE_SWORD]: { name: 'Stone Sword', display: icon('/', '#888890', 'stone_sword.png'), weapon: { damage: 4 } },
  [ItemId.IRON_SWORD]: { name: 'Iron Sword', display: icon('/', '#dcdad2', 'iron_sword.png'), weapon: { damage: 5 } },
  [ItemId.DIAMOND_SWORD]: { name: 'Diamond Sword', display: icon('/', '#66e0e0', 'diamond_sword.png'), weapon: { damage: 6 } },

  [ItemId.WOOD_PICKAXE]: { name: 'Wood Pickaxe', display: icon('T', '#a9825a', 'wood_pickaxe.png'), pickaxe: { tier: 1 } },
  [ItemId.STONE_PICKAXE]: { name: 'Stone Pickaxe', display: icon('T', '#888890', 'stone_pickaxe.png'), pickaxe: { tier: 2 } },
  [ItemId.IRON_PICKAXE]: { name: 'Iron Pickaxe', display: icon('T', '#dcdad2', 'iron_pickaxe.png'), pickaxe: { tier: 3 } },
  [ItemId.DIAMOND_PICKAXE]: { name: 'Diamond Pickaxe', display: icon('T', '#66e0e0', 'diamond_pickaxe.png'), pickaxe: { tier: 4 } },

  [ItemId.RAW_BEEF]: { name: 'Raw Beef', display: swatch('#c1584f', 'raw_beef.png'), food: { heal: 2 } },
  [ItemId.RAW_PORKCHOP]: { name: 'Raw Porkchop', display: swatch('#e0968f', 'raw_porkchop.png'), food: { heal: 2 } },
  [ItemId.COOKED_BEEF]: { name: 'Cooked Beef', display: swatch('#8a4a2e', 'cooked_beef.png'), food: { heal: 5 } },
  [ItemId.COOKED_PORKCHOP]: { name: 'Cooked Porkchop', display: swatch('#a9704a', 'cooked_porkchop.png'), food: { heal: 5 } },
};

export function isItem(id) { return id >= 1000; }

export function itemName(id, blockRegistry) {
  if (isItem(id)) return ItemRegistry[id]?.name ?? 'Unknown Item';
  return blockRegistry[id]?.name ?? 'Unknown Block';
}

/** Attack damage for whatever is in a hotbar slot (bare hand if empty/non-weapon). */
export function weaponDamage(id) {
  if (isItem(id) && ItemRegistry[id]?.weapon) return ItemRegistry[id].weapon.damage;
  return 1; // bare hand
}

/** Pickaxe tier (0 = no pickaxe / bare hand) for ore-mining gating. */
export function pickaxeTier(id) {
  if (isItem(id) && ItemRegistry[id]?.pickaxe) return ItemRegistry[id].pickaxe.tier;
  return 0;
}

export function isFood(id) {
  return isItem(id) && !!ItemRegistry[id]?.food;
}

export function foodHealAmount(id) {
  return isItem(id) && ItemRegistry[id]?.food ? ItemRegistry[id].food.heal : 0;
}
