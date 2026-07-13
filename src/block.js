// block.js — the block type registry. Every voxel in the world is just a
// small integer id; this module is the single place that gives those ids
// meaning (solidity, transparency, appearance, mining rules). Adding a new
// block means adding one entry here — nothing else needs to change.

import { TILE } from './textureAtlas.js';
import { ItemId } from './items.js';

export const BlockId = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  WOOD: 6,
  LEAVES: 7,
  BEDROCK: 8,
  SNOW_GRASS: 9,
  COBBLESTONE: 10,
  PLANKS: 11,
  GLASS: 12,
  GRAVEL: 13,
  CLAY: 14,
  COAL_ORE: 15,
  IRON_ORE: 16,
  GOLD_ORE: 17,
  DIAMOND_ORE: 18,
  REDSTONE_ORE: 19,
  EMERALD_ORE: 20,
  CRAFTING_TABLE: 21,
  FURNACE: 22,
  BRICK: 23,
  SANDSTONE: 24,
  MOSSY_COBBLESTONE: 25,
  ICE: 26,
  PUMPKIN: 27,
  CACTUS: 28,
  TALL_GRASS: 29,
  IRON_BLOCK: 32,
  GOLD_BLOCK: 33,
  DIAMOND_BLOCK: 34,
};

// faces: [+x, -x, +y, -y, +z, -z]
function uniform(tile) { return [tile, tile, tile, tile, tile, tile]; }
function topBottomSide(top, bottom, side) { return [side, side, top, bottom, side, side]; }

export const BlockRegistry = {
  [BlockId.AIR]: { name: 'Air', solid: false, transparent: true, liquid: false },
  [BlockId.GRASS]: { name: 'Grass', solid: true, transparent: false, liquid: false, faces: topBottomSide(TILE.GRASS_TOP, TILE.DIRT, TILE.GRASS_SIDE), drop: BlockId.DIRT },
  [BlockId.DIRT]: { name: 'Dirt', solid: true, transparent: false, liquid: false, faces: uniform(TILE.DIRT) },
  [BlockId.STONE]: { name: 'Stone', solid: true, transparent: false, liquid: false, faces: uniform(TILE.STONE), drop: BlockId.COBBLESTONE, pickaxeTier: 1 },
  [BlockId.SAND]: { name: 'Sand', solid: true, transparent: false, liquid: false, faces: uniform(TILE.SAND) },
  [BlockId.WATER]: { name: 'Water', solid: false, transparent: true, liquid: true, faces: uniform(TILE.WATER) },
  [BlockId.WOOD]: { name: 'Wood Log', solid: true, transparent: false, liquid: false, faces: topBottomSide(TILE.WOOD_TOP, TILE.WOOD_TOP, TILE.WOOD_SIDE) },
  [BlockId.LEAVES]: { name: 'Leaves', solid: true, transparent: true, liquid: false, faces: uniform(TILE.LEAVES) },
  [BlockId.BEDROCK]: { name: 'Bedrock', solid: true, transparent: false, liquid: false, faces: uniform(TILE.BEDROCK), unbreakable: true },
  [BlockId.SNOW_GRASS]: { name: 'Snowy Grass', solid: true, transparent: false, liquid: false, faces: topBottomSide(TILE.SNOW_TOP, TILE.DIRT, TILE.SNOW_SIDE), drop: BlockId.DIRT },
  [BlockId.COBBLESTONE]: { name: 'Cobblestone', solid: true, transparent: false, liquid: false, faces: uniform(TILE.COBBLESTONE), pickaxeTier: 1 },
  [BlockId.PLANKS]: { name: 'Wood Planks', solid: true, transparent: false, liquid: false, faces: uniform(TILE.PLANKS) },
  [BlockId.GLASS]: { name: 'Glass', solid: true, transparent: true, liquid: false, faces: uniform(TILE.GLASS) },
  [BlockId.GRAVEL]: { name: 'Gravel', solid: true, transparent: false, liquid: false, faces: uniform(TILE.GRAVEL) },
  [BlockId.CLAY]: { name: 'Clay', solid: true, transparent: false, liquid: false, faces: uniform(TILE.CLAY) },
  [BlockId.COAL_ORE]: { name: 'Coal Ore', solid: true, transparent: false, liquid: false, faces: uniform(TILE.COAL_ORE), drop: ItemId.COAL, pickaxeTier: 1 },
  [BlockId.IRON_ORE]: { name: 'Iron Ore', solid: true, transparent: false, liquid: false, faces: uniform(TILE.IRON_ORE), drop: ItemId.RAW_IRON, pickaxeTier: 1 },
  [BlockId.GOLD_ORE]: { name: 'Gold Ore', solid: true, transparent: false, liquid: false, faces: uniform(TILE.GOLD_ORE), drop: ItemId.RAW_GOLD, pickaxeTier: 2 },
  [BlockId.DIAMOND_ORE]: { name: 'Diamond Ore', solid: true, transparent: false, liquid: false, faces: uniform(TILE.DIAMOND_ORE), drop: ItemId.DIAMOND, pickaxeTier: 3 },
  [BlockId.REDSTONE_ORE]: { name: 'Redstone Ore', solid: true, transparent: false, liquid: false, faces: uniform(TILE.REDSTONE_ORE), drop: ItemId.REDSTONE, pickaxeTier: 2 },
  [BlockId.EMERALD_ORE]: { name: 'Emerald Ore', solid: true, transparent: false, liquid: false, faces: uniform(TILE.EMERALD_ORE), drop: ItemId.EMERALD, pickaxeTier: 2 },
  [BlockId.CRAFTING_TABLE]: { name: 'Crafting Table', solid: true, transparent: false, liquid: false, faces: topBottomSide(TILE.CRAFTING_TOP, TILE.PLANKS, TILE.CRAFTING_SIDE), interactive: 'crafting' },
  [BlockId.FURNACE]: { name: 'Furnace', solid: true, transparent: false, liquid: false, faces: topBottomSide(TILE.COBBLESTONE, TILE.COBBLESTONE, TILE.FURNACE_FRONT), interactive: 'furnace' },
  [BlockId.BRICK]: { name: 'Bricks', solid: true, transparent: false, liquid: false, faces: uniform(TILE.BRICK), pickaxeTier: 1 },
  [BlockId.SANDSTONE]: { name: 'Sandstone', solid: true, transparent: false, liquid: false, faces: uniform(TILE.SANDSTONE), pickaxeTier: 1 },
  [BlockId.MOSSY_COBBLESTONE]: { name: 'Mossy Cobblestone', solid: true, transparent: false, liquid: false, faces: uniform(TILE.MOSSY_COBBLESTONE), pickaxeTier: 1 },
  [BlockId.ICE]: { name: 'Ice', solid: true, transparent: true, liquid: false, faces: uniform(TILE.ICE) },
  [BlockId.PUMPKIN]: { name: 'Pumpkin', solid: true, transparent: false, liquid: false, faces: topBottomSide(TILE.PUMPKIN_TOP, TILE.PUMPKIN_TOP, TILE.PUMPKIN_SIDE) },
  [BlockId.CACTUS]: { name: 'Cactus', solid: true, transparent: false, liquid: false, faces: topBottomSide(TILE.CACTUS_TOP, TILE.CACTUS_TOP, TILE.CACTUS_SIDE) },
  [BlockId.TALL_GRASS]: { name: 'Tall Grass', solid: false, transparent: true, liquid: false, faces: uniform(TILE.TALL_GRASS), cutout: true },
  [BlockId.IRON_BLOCK]: { name: 'Block of Iron', solid: true, transparent: false, liquid: false, faces: uniform(TILE.IRON_BLOCK), pickaxeTier: 2 },
  [BlockId.GOLD_BLOCK]: { name: 'Block of Gold', solid: true, transparent: false, liquid: false, faces: uniform(TILE.GOLD_BLOCK), pickaxeTier: 2 },
  [BlockId.DIAMOND_BLOCK]: { name: 'Block of Diamond', solid: true, transparent: false, liquid: false, faces: uniform(TILE.DIAMOND_BLOCK), pickaxeTier: 3 },
};

export function isSolid(id) { return BlockRegistry[id]?.solid ?? false; }
export function iconTileFor(id) {
  const faces = BlockRegistry[id]?.faces;
  return faces ? (faces[2] ?? faces[0]) : null;
}
export function isTransparent(id) { return BlockRegistry[id]?.transparent ?? true; }
export function isLiquid(id) { return id === BlockId.WATER; }
export function isUnbreakable(id) { return BlockRegistry[id]?.unbreakable ?? false; }
export function requiredPickaxeTier(id) { return BlockRegistry[id]?.pickaxeTier ?? 0; }
export function interactiveKind(id) { return BlockRegistry[id]?.interactive ?? null; }

/** What ends up in the inventory when this block is broken (defaults to itself). */
export function dropFor(id) {
  const def = BlockRegistry[id];
  if (!def) return id;
  return def.drop !== undefined ? def.drop : id;
}

/** Blocks the player is allowed to place from the hotbar. */
export const PLACEABLE_BLOCKS = [
  BlockId.GRASS, BlockId.DIRT, BlockId.STONE, BlockId.SAND, BlockId.WOOD, BlockId.LEAVES,
  BlockId.SNOW_GRASS, BlockId.COBBLESTONE, BlockId.PLANKS, BlockId.GLASS, BlockId.GRAVEL,
  BlockId.CLAY, BlockId.CRAFTING_TABLE, BlockId.FURNACE, BlockId.BRICK, BlockId.SANDSTONE,
  BlockId.MOSSY_COBBLESTONE, BlockId.ICE, BlockId.PUMPKIN, BlockId.CACTUS,
  BlockId.TALL_GRASS, BlockId.FLOWER_RED, BlockId.FLOWER_YELLOW,
  BlockId.IRON_BLOCK, BlockId.GOLD_BLOCK, BlockId.DIAMOND_BLOCK,
];
