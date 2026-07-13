// terrainGenerator.js — turns (seed, worldX, worldZ) into deterministic terrain.
// Fully stateless with respect to chunk load order: any column always produces
// the same height/biome/tree result, which is what makes infinite terrain and
// re-visiting old chunks safe.

import { SimplexNoise, mulberry32, clamp } from './utils.js';
import { BlockId } from './block.js';
import { WorldSettings } from './settings.js';

export const Biome = {
  OCEAN: 'ocean',
  BEACH: 'beach',
  PLAINS: 'plains',
  FOREST: 'forest',
  DESERT: 'desert',
  SNOWY_PLAINS: 'snowy_plains',
  MOUNTAINS: 'mountains',
};

export class TerrainGenerator {
  constructor(seed) {
    this.seed = seed >>> 0;
    // Separate noise instances (different seed offsets) so height, temperature,
    // moisture, and tree placement don't visibly correlate with one another.
    this.heightNoise = new SimplexNoise(this.seed);
    this.detailNoise = new SimplexNoise(this.seed ^ 0x9e3779b9);
    this.temperatureNoise = new SimplexNoise((this.seed + 101) >>> 0);
    this.moistureNoise = new SimplexNoise((this.seed + 202) >>> 0);
    this.treeNoise = new SimplexNoise((this.seed + 303) >>> 0);
  }

  getTemperature(x, z) {
    return this.temperatureNoise.fbm2D(x * 0.0025, z * 0.0025, 3);
  }

  getMoisture(x, z) {
    return this.moistureNoise.fbm2D(x * 0.003, z * 0.003, 3);
  }

  getBiome(x, z, height) {
    if (height <= WorldSettings.SEA_LEVEL) return Biome.OCEAN;
    if (height <= WorldSettings.SEA_LEVEL + 2) return Biome.BEACH;

    const temp = this.getTemperature(x, z);
    const moisture = this.getMoisture(x, z);

    if (height > WorldSettings.SEA_LEVEL + 34) return Biome.MOUNTAINS;
    if (temp < -0.35) return Biome.SNOWY_PLAINS;
    if (temp > 0.35 && moisture < -0.1) return Biome.DESERT;
    if (moisture > 0.1) return Biome.FOREST;
    return Biome.PLAINS;
  }

  /** Base terrain height (before biome-specific carving) at a world column. */
  getHeight(x, z) {
    const continental = this.heightNoise.fbm2D(x * 0.0016, z * 0.0016, 5, 2.1, 0.5);
    const hills = this.detailNoise.fbm2D(x * 0.01, z * 0.01, 4, 2.0, 0.5);
    let h = WorldSettings.SEA_LEVEL + continental * 22 + hills * 6;

    // Push mountainous areas higher using a ridged variant of the same noise.
    const ridge = 1 - Math.abs(this.heightNoise.fbm2D(x * 0.004, z * 0.004, 4));
    if (ridge > 0.72) h += (ridge - 0.72) * 90;

    return Math.floor(clamp(h, 2, WorldSettings.CHUNK_HEIGHT - 8));
  }

  /** Deterministic per-column decision for tree placement, independent of chunk load order. */
  shouldPlaceTree(x, z, biome) {
    if (biome !== Biome.FOREST && biome !== Biome.PLAINS) return false;
    const density = biome === Biome.FOREST ? 0.965 : 0.994;
    const n = (this.treeNoise.noise2D(x * 0.9, z * 0.9) + 1) / 2;
    // Mix in a hash so trees don't align visibly with the noise field's grid.
    const h = mulberry32((this.seed ^ (x * 374761393) ^ (z * 668265263)) >>> 0)();
    return n * 0.5 + h * 0.5 > density;
  }

  /** Full column data used by Chunk to fill voxels: surface blocks + tree markers. */
  getColumn(x, z) {
    const height = this.getHeight(x, z);
    const biome = this.getBiome(x, z, height);
    return { height, biome, tree: this.shouldPlaceTree(x, z, biome) };
  }

  surfaceBlockFor(biome) {
    switch (biome) {
      case Biome.DESERT: return BlockId.SAND;
      case Biome.BEACH: return BlockId.SAND;
      case Biome.SNOWY_PLAINS: return BlockId.SNOW_GRASS;
      case Biome.MOUNTAINS: return BlockId.STONE;
      case Biome.OCEAN: return BlockId.SAND;
      default: return BlockId.GRASS;
    }
  }

  subSurfaceBlockFor(biome) {
    if (biome === Biome.DESERT || biome === Biome.BEACH) return BlockId.SAND;
    return BlockId.DIRT;
  }

  /** Deterministic 0..1 roll for a specific voxel coordinate (ore placement, decoration). */
  voxelRoll(x, y, z, salt = 0) {
    return mulberry32((this.seed ^ (x * 374761393) ^ (y * 668265263) ^ (z * 2147483647) ^ salt) >>> 0)();
  }

  /** Returns an ore BlockId to substitute for stone at this coordinate, or null. Depth-banded rarity. */
  pickOre(x, y, z) {
    const r = this.voxelRoll(x, y, z, 11);
    if (y < 16) {
      if (r < 0.004) return BlockId.DIAMOND_ORE;
      if (r < 0.010) return BlockId.GOLD_ORE;
      if (r < 0.018) return BlockId.REDSTONE_ORE;
      if (r < 0.024) return BlockId.EMERALD_ORE;
      if (r < 0.07) return BlockId.IRON_ORE;
      if (r < 0.12) return BlockId.COAL_ORE;
      return null;
    }
    if (y < 40) {
      if (r < 0.006) return BlockId.GOLD_ORE;
      if (r < 0.012) return BlockId.REDSTONE_ORE;
      if (r < 0.016) return BlockId.EMERALD_ORE;
      if (r < 0.055) return BlockId.IRON_ORE;
      if (r < 0.10) return BlockId.COAL_ORE;
      return null;
    }
    if (r < 0.02) return BlockId.IRON_ORE;
    if (r < 0.06) return BlockId.COAL_ORE;
    return null;
  }

  /** Surface decoration (tall grass, cactus, pumpkin) for a column that isn't a tree. */
  decorationAt(x, z, biome, height) {
    const r = this.voxelRoll(x, height + 1, z, 22);
    if (biome === Biome.DESERT) {
      return r < 0.012 ? BlockId.CACTUS : null;
    }
    if (biome === Biome.PLAINS || biome === Biome.FOREST) {
      if (r < 0.0015) return BlockId.PUMPKIN;
      if (r < 0.38) return BlockId.TALL_GRASS;
      return null;
    }
    return null;
  }
}
