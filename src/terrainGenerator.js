// terrainGenerator.js — turns (seed, worldX, worldZ) into deterministic terrain.
// Fully stateless with respect to chunk load order: any column always produces
// the same height/biome/tree result, which is what makes infinite terrain and
// re-visiting old chunks safe.

import { SimplexNoise, clamp } from './utils.js';
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

/**
 * Allocation-free deterministic hash -> [0,1). This is called up to tens of
 * thousands of times per chunk (once per candidate ore voxel), so it must be
 * pure arithmetic with zero object/closure allocation — a previous version
 * called `mulberry32(seed)()`, which allocates a new closure per call and
 * was the main cause of stutter every time new terrain generated.
 */
function hash4(a, b, c, d) {
  let h = (a ^ Math.imul(b, 374761393) ^ Math.imul(c, 668265263) ^ Math.imul(d, 2654435761)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), h | 1);
  h = (h + Math.imul(h ^ (h >>> 7), h | 61)) ^ h;
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
}

export class TerrainGenerator {
  constructor(seed) {
    this.seed = seed >>> 0;
    // Separate noise instances (different seed offsets) so height, temperature,
    // moisture, tree placement, caves, and each ore type don't visibly
    // correlate with one another.
    this.heightNoise = new SimplexNoise(this.seed);
    this.detailNoise = new SimplexNoise(this.seed ^ 0x9e3779b9);
    this.temperatureNoise = new SimplexNoise((this.seed + 101) >>> 0);
    this.moistureNoise = new SimplexNoise((this.seed + 202) >>> 0);
    this.treeNoise = new SimplexNoise((this.seed + 303) >>> 0);
    this.caveNoise = new SimplexNoise((this.seed + 404) >>> 0);
    this.caveWormNoise = new SimplexNoise((this.seed + 405) >>> 0);
    this.oreNoises = {
      coal: new SimplexNoise((this.seed + 601) >>> 0),
      iron: new SimplexNoise((this.seed + 602) >>> 0),
      gold: new SimplexNoise((this.seed + 603) >>> 0),
      diamond: new SimplexNoise((this.seed + 604) >>> 0),
      redstone: new SimplexNoise((this.seed + 605) >>> 0),
      emerald: new SimplexNoise((this.seed + 606) >>> 0),
    };
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
    const h = hash4(this.seed, x, z, 707);
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

  /** Deterministic 0..1 roll for a specific voxel coordinate (decoration, non-clustered placement). */
  voxelRoll(x, y, z, salt = 0) {
    return hash4(this.seed ^ salt, x, y, z);
  }

  /** A single ore's presence test: noise above a threshold forms a connected blob/vein
   * (nearby coordinates share similar noise values), not an isolated single block. */
  _oreVein(noise, x, y, z, freq, threshold) {
    return noise.noise3D(x * freq, y * freq, z * freq) > threshold;
  }

  /** Returns an ore BlockId to substitute for stone at this coordinate, or null. Depth-banded rarity.
   * Thresholds are calibrated against the actual noise3D distribution (see dev notes) to land
   * roughly around: coal ~3%, iron ~1%, gold/redstone ~0.3-0.5%, emerald/diamond ~0.05-0.15% of stone. */
  pickOre(x, y, z) {
    const n = this.oreNoises;
    if (y < 16) {
      if (this._oreVein(n.diamond, x, y, z, 0.05, 0.95)) return BlockId.DIAMOND_ORE;
      if (this._oreVein(n.emerald, x, y, z, 0.055, 0.94)) return BlockId.EMERALD_ORE;
      if (this._oreVein(n.redstone, x, y, z, 0.06, 0.91)) return BlockId.REDSTONE_ORE;
      if (this._oreVein(n.gold, x, y, z, 0.06, 0.92)) return BlockId.GOLD_ORE;
    } else if (y < 40) {
      if (this._oreVein(n.gold, x, y, z, 0.06, 0.93)) return BlockId.GOLD_ORE;
      if (this._oreVein(n.redstone, x, y, z, 0.06, 0.93)) return BlockId.REDSTONE_ORE;
      if (this._oreVein(n.emerald, x, y, z, 0.055, 0.96)) return BlockId.EMERALD_ORE;
    }
    if (this._oreVein(n.iron, x, y, z, 0.07, 0.87)) return BlockId.IRON_ORE;
    if (this._oreVein(n.coal, x, y, z, 0.08, 0.78)) return BlockId.COAL_ORE;
    return null;
  }

  /**
   * True if this stone-region coordinate should be carved into open air.
   * Two noise fields combined (a common "cave generation" trick): a blobby
   * cavern field (large hollow pockets) plus a ridged "worm" field whose
   * near-zero band forms thin winding connecting tunnels — together they
   * read as a natural, explorable cave system rather than scattered pockets.
   * Single-octave noise (not fbm) since this runs for every stone-region voxel.
   */
  isCave(x, y, z) {
    if (y < 3 || y > WorldSettings.SEA_LEVEL + 12) return false; // solid floor + skip near/above surface
    const cavern = this.caveNoise.noise3D(x * 0.045, y * 0.08, z * 0.045);
    if (cavern > 0.55) return true;
    const worm = Math.abs(this.caveWormNoise.noise3D(x * 0.07, y * 0.1, z * 0.07));
    return worm < 0.05;
  }

  /** Surface decoration (tall grass, cactus, pumpkin) for a column that isn't a tree. */
  decorationAt(x, z, biome, height) {
    const r = this.voxelRoll(x, height + 1, z, 22);
    if (biome === Biome.DESERT) {
      return r < 0.012 ? BlockId.CACTUS : null;
    }
    if (biome === Biome.PLAINS || biome === Biome.FOREST) {
      if (r < 0.0015) return BlockId.PUMPKIN;
      if (r < 0.10) return BlockId.TALL_GRASS; // was 0.38 — way too dense
      return null;
    }
    return null;
  }
}
