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
};

const swatch = (color) => ({ kind: 'swatch', color });
const icon = (glyph, color) => ({ kind: 'glyph', glyph, color });

export const ItemRegistry = {
  [ItemId.STICK]: { name: 'Stick', display: icon('|', '#a9825a') },
  [ItemId.COAL]: { name: 'Coal', display: swatch('#242426') },
  [ItemId.RAW_IRON]: { name: 'Raw Iron', display: swatch('#c9a67a') },
  [ItemId.IRON_INGOT]: { name: 'Iron Ingot', display: swatch('#dcdad2') },
  [ItemId.RAW_GOLD]: { name: 'Raw Gold', display: swatch('#e0b840') },
  [ItemId.GOLD_INGOT]: { name: 'Gold Ingot', display: swatch('#f8d448') },
  [ItemId.DIAMOND]: { name: 'Diamond', display: swatch('#66e0e0') },
  [ItemId.REDSTONE]: { name: 'Redstone', display: swatch('#c81c1c') },
  [ItemId.EMERALD]: { name: 'Emerald', display: swatch('#30c46e') },

  [ItemId.WOOD_SWORD]: { name: 'Wood Sword', display: icon('/', '#a9825a'), weapon: { damage: 3 } },
  [ItemId.STONE_SWORD]: { name: 'Stone Sword', display: icon('/', '#888890'), weapon: { damage: 4 } },
  [ItemId.IRON_SWORD]: { name: 'Iron Sword', display: icon('/', '#dcdad2'), weapon: { damage: 5 } },
  [ItemId.DIAMOND_SWORD]: { name: 'Diamond Sword', display: icon('/', '#66e0e0'), weapon: { damage: 6 } },

  [ItemId.WOOD_PICKAXE]: { name: 'Wood Pickaxe', display: icon('T', '#a9825a'), pickaxe: { tier: 1 } },
  [ItemId.STONE_PICKAXE]: { name: 'Stone Pickaxe', display: icon('T', '#888890'), pickaxe: { tier: 2 } },
  [ItemId.IRON_PICKAXE]: { name: 'Iron Pickaxe', display: icon('T', '#dcdad2'), pickaxe: { tier: 3 } },
  [ItemId.DIAMOND_PICKAXE]: { name: 'Diamond Pickaxe', display: icon('T', '#66e0e0'), pickaxe: { tier: 4 } },

  [ItemId.RAW_BEEF]: { name: 'Raw Beef', display: swatch('#c1584f') },
  [ItemId.RAW_PORKCHOP]: { name: 'Raw Porkchop', display: swatch('#e0968f') },
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
