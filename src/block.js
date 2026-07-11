// block.js — the block type registry. Every voxel in the world is just a
// small integer id; this module is the single place that gives those ids
// meaning (solidity, transparency, appearance). Adding a new block later
// means adding one entry here — nothing else needs to change.

import { TILE } from './textureAtlas.js';

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
};

// faces: [+x, -x, +y, -y, +z, -z]
function uniform(tile) {
  return [tile, tile, tile, tile, tile, tile];
}

export const BlockRegistry = {
  [BlockId.AIR]: { name: 'Air', solid: false, transparent: true, liquid: false },
  [BlockId.GRASS]: {
    name: 'Grass',
    solid: true, transparent: false, liquid: false,
    faces: [TILE.GRASS_SIDE, TILE.GRASS_SIDE, TILE.GRASS_TOP, TILE.DIRT, TILE.GRASS_SIDE, TILE.GRASS_SIDE],
  },
  [BlockId.DIRT]: { name: 'Dirt', solid: true, transparent: false, liquid: false, faces: uniform(TILE.DIRT) },
  [BlockId.STONE]: { name: 'Stone', solid: true, transparent: false, liquid: false, faces: uniform(TILE.STONE) },
  [BlockId.SAND]: { name: 'Sand', solid: true, transparent: false, liquid: false, faces: uniform(TILE.SAND) },
  [BlockId.WATER]: { name: 'Water', solid: false, transparent: true, liquid: true, faces: uniform(TILE.WATER) },
  [BlockId.WOOD]: {
    name: 'Wood Log',
    solid: true, transparent: false, liquid: false,
    faces: [TILE.WOOD_SIDE, TILE.WOOD_SIDE, TILE.WOOD_TOP, TILE.WOOD_TOP, TILE.WOOD_SIDE, TILE.WOOD_SIDE],
  },
  [BlockId.LEAVES]: { name: 'Leaves', solid: true, transparent: true, liquid: false, faces: uniform(TILE.LEAVES) },
  [BlockId.BEDROCK]: { name: 'Bedrock', solid: true, transparent: false, liquid: false, faces: uniform(TILE.BEDROCK) },
  [BlockId.SNOW_GRASS]: {
    name: 'Snowy Grass',
    solid: true, transparent: false, liquid: false,
    faces: [TILE.SNOW_SIDE, TILE.SNOW_SIDE, TILE.SNOW_TOP, TILE.DIRT, TILE.SNOW_SIDE, TILE.SNOW_SIDE],
  },
};

export function isSolid(id) {
  const def = BlockRegistry[id];
  return def ? def.solid : false;
}

export function isTransparent(id) {
  const def = BlockRegistry[id];
  return def ? def.transparent : true;
}

export function isLiquid(id) {
  const def = BlockRegistry[id];
  return def ? def.liquid : false;
}

/** Blocks the player is allowed to place — drives both hotbar and creative palette. */
export const PLACEABLE_BLOCKS = [
  BlockId.GRASS, BlockId.DIRT, BlockId.STONE, BlockId.SAND,
  BlockId.WOOD, BlockId.LEAVES, BlockId.SNOW_GRASS,
];
