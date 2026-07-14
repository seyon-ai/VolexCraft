// world.js — owns all loaded chunks, streams them in/out around the player,
// and is the single entry point for reading/writing blocks by world coordinate.
// Designed so caves, structures, or multiplayer sync could hook into
// loadChunk/setBlock later without touching the streaming logic.

import { Chunk } from './chunk.js';
import { TerrainGenerator } from './terrainGenerator.js';
import { WorldSettings } from './settings.js';
import { BlockId, isSolid } from './block.js';
import { floorDiv, mod, keyForChunk } from './utils.js';
import { buildTextureAtlas } from './textureAtlas.js';

const { CHUNK_SIZE, CHUNK_HEIGHT } = WorldSettings;

export class World {
  constructor(scene, seed) {
    this.scene = scene;
    this.seed = seed;
    this.terrainGenerator = new TerrainGenerator(seed);
    this.chunks = new Map(); // "cx,cz" -> Chunk
    this.modifications = new Map(); // "x,y,z" -> blockId, world-space player edits only
    this.atlasTexture = buildTextureAtlas();
    this.buildQueue = [];
    this.loadQueue = [];
    this.renderDistance = WorldSettings.RENDER_DISTANCE;
    this.lastPlayerChunk = { cx: null, cz: null };
  }

  worldToChunkCoords(wx, wz) {
    return { cx: floorDiv(wx, CHUNK_SIZE), cz: floorDiv(wz, CHUNK_SIZE) };
  }

  worldToLocalCoords(wx, wz) {
    return { lx: mod(wx, CHUNK_SIZE), lz: mod(wz, CHUNK_SIZE) };
  }

  getChunk(cx, cz) {
    return this.chunks.get(keyForChunk(cx, cz));
  }

  getHeightAt(wx, wz) {
    return this.terrainGenerator.getHeight(Math.floor(wx), Math.floor(wz));
  }

  getBlock(wx, wy, wz, fallback = BlockId.AIR) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return BlockId.AIR;
    const { cx, cz } = this.worldToChunkCoords(Math.floor(wx), Math.floor(wz));
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return fallback;
    const { lx, lz } = this.worldToLocalCoords(Math.floor(wx), Math.floor(wz));
    return chunk.getBlockLocal(lx, Math.floor(wy), lz);
  }

  isSolidAt(wx, wy, wz) {
    return isSolid(this.getBlock(Math.floor(wx), Math.floor(wy), Math.floor(wz), BlockId.AIR));
  }

  /** Places/breaks a block, updates the modification log, and rebuilds affected chunk meshes. */
  setBlock(wx, wy, wz, id) {
    wx = Math.floor(wx); wy = Math.floor(wy); wz = Math.floor(wz);
    if (wy < 0 || wy >= CHUNK_HEIGHT) return false;
    const { cx, cz } = this.worldToChunkCoords(wx, wz);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return false;
    const { lx, lz } = this.worldToLocalCoords(wx, wz);

    chunk.setBlockLocal(lx, wy, lz, id);
    chunk.dirty = true;
    this.modifications.set(`${wx},${wy},${wz}`, id);
    this.queueMeshRebuild(chunk);

    // Rebuild neighboring chunks too if the edit sits on a chunk boundary,
    // since their face-culling depended on this voxel.
    if (lx === 0) this.queueNeighborRebuild(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.queueNeighborRebuild(cx + 1, cz);
    if (lz === 0) this.queueNeighborRebuild(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.queueNeighborRebuild(cx, cz + 1);
    return true;
  }

  queueNeighborRebuild(cx, cz) {
    const neighbor = this.getChunk(cx, cz);
    if (neighbor) this.queueMeshRebuild(neighbor);
  }

  queueMeshRebuild(chunk) {
    if (!this.buildQueue.includes(chunk)) this.buildQueue.push(chunk);
  }

  loadChunk(cx, cz) {
    const key = keyForChunk(cx, cz);
    if (this.chunks.has(key)) return;
    const chunk = new Chunk(cx, cz, this);
    chunk.generate(this.terrainGenerator);
    this.applyStoredModifications(chunk);
    this.chunks.set(key, chunk);
    this.queueMeshRebuild(chunk);
    this.queueNeighborRebuild(cx - 1, cz);
    this.queueNeighborRebuild(cx + 1, cz);
    this.queueNeighborRebuild(cx, cz - 1);
    this.queueNeighborRebuild(cx, cz + 1);
  }

  applyStoredModifications(chunk) {
    if (this.modifications.size === 0) return;
    const ox = chunk.worldOriginX();
    const oz = chunk.worldOriginZ();
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let ly = 0; ly < CHUNK_HEIGHT; ly++) {
          const key = `${ox + lx},${ly},${oz + lz}`;
          if (this.modifications.has(key)) {
            chunk.setBlockLocal(lx, ly, lz, this.modifications.get(key));
          }
        }
      }
    }
  }

  unloadChunk(cx, cz) {
    const key = keyForChunk(cx, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    chunk.dispose();
    this.chunks.delete(key);
    const idx = this.buildQueue.indexOf(chunk);
    if (idx !== -1) this.buildQueue.splice(idx, 1);
  }

  /** Streams chunks in/out around the player and drains a throttled mesh-build queue. */
  update(playerWorldX, playerWorldZ) {
    const { cx: pcx, cz: pcz } = this.worldToChunkCoords(Math.floor(playerWorldX), Math.floor(playerWorldZ));

    if (pcx !== this.lastPlayerChunk.cx || pcz !== this.lastPlayerChunk.cz) {
      this.lastPlayerChunk = { cx: pcx, cz: pcz };
      const rd = this.renderDistance;
      const toLoad = [];
      for (let dx = -rd; dx <= rd; dx++) {
        for (let dz = -rd; dz <= rd; dz++) {
          if (dx * dx + dz * dz > rd * rd) continue;
          const cx = pcx + dx, cz = pcz + dz;
          if (!this.chunks.has(keyForChunk(cx, cz))) toLoad.push({ cx, cz, dist: dx * dx + dz * dz });
        }
      }
      toLoad.sort((a, b) => a.dist - b.dist);
      // Replace (don't append to) the pending queue — priority order is
      // always recomputed fresh from the player's current position.
      this.loadQueue = toLoad;

      const unloadDist = (rd + 2) * (rd + 2);
      for (const key of Array.from(this.chunks.keys())) {
        const chunk = this.chunks.get(key);
        const dx = chunk.cx - pcx, dz = chunk.cz - pcz;
        if (dx * dx + dz * dz > unloadDist) this.unloadChunk(chunk.cx, chunk.cz);
      }
    }

    // Generation is throttled the same way mesh building is: a synchronous
    // burst of chunk generation for an entire newly-revealed ring is what
    // caused a stutter every time the player crossed a chunk boundary, even
    // though each individual chunk only takes ~1-2ms.
    for (let i = 0; i < WorldSettings.CHUNKS_LOADED_PER_FRAME && this.loadQueue.length > 0; i++) {
      const { cx, cz } = this.loadQueue.shift();
      if (!this.chunks.has(keyForChunk(cx, cz))) this.loadChunk(cx, cz);
    }

    for (let i = 0; i < WorldSettings.CHUNKS_BUILT_PER_FRAME && this.buildQueue.length > 0; i++) {
      const chunk = this.buildQueue.shift();
      chunk.buildMesh(this.atlasTexture);
    }
  }

  setRenderDistance(distance) {
    this.renderDistance = Math.max(WorldSettings.MIN_RENDER_DISTANCE, Math.min(WorldSettings.MAX_RENDER_DISTANCE, distance));
    this.lastPlayerChunk = { cx: null, cz: null }; // force re-evaluation next update
  }

  /**
   * Voxel-grid raycast (Amanatides & Woo DDA) from origin along direction.
   * Returns { position:[x,y,z], normal:[nx,ny,nz], blockId } for the first
   * solid, non-water block hit within maxDistance, or null.
   */
  raycast(origin, direction, maxDistance = 6) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const stepX = Math.sign(direction.x) || 0;
    const stepY = Math.sign(direction.y) || 0;
    const stepZ = Math.sign(direction.z) || 0;

    const deltaX = direction.x !== 0 ? Math.abs(1 / direction.x) : Infinity;
    const deltaY = direction.y !== 0 ? Math.abs(1 / direction.y) : Infinity;
    const deltaZ = direction.z !== 0 ? Math.abs(1 / direction.z) : Infinity;

    let tMaxX = direction.x !== 0 ? ((stepX > 0 ? (x + 1 - origin.x) : (origin.x - x)) * deltaX) : Infinity;
    let tMaxY = direction.y !== 0 ? ((stepY > 0 ? (y + 1 - origin.y) : (origin.y - y)) * deltaY) : Infinity;
    let tMaxZ = direction.z !== 0 ? ((stepZ > 0 ? (z + 1 - origin.z) : (origin.z - z)) * deltaZ) : Infinity;

    let normal = [0, 0, 0];
    let traveled = 0;

    while (traveled <= maxDistance) {
      const id = this.getBlock(x, y, z, BlockId.AIR);
      if (id !== BlockId.AIR && !(id === BlockId.WATER)) {
        return { position: [x, y, z], normal, blockId: id };
      }
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) { x += stepX; traveled = tMaxX; tMaxX += deltaX; normal = [-stepX, 0, 0]; }
        else { z += stepZ; traveled = tMaxZ; tMaxZ += deltaZ; normal = [0, 0, -stepZ]; }
      } else {
        if (tMaxY < tMaxZ) { y += stepY; traveled = tMaxY; tMaxY += deltaY; normal = [0, -stepY, 0]; }
        else { z += stepZ; traveled = tMaxZ; tMaxZ += deltaZ; normal = [0, 0, -stepZ]; }
      }
    }
    return null;
  }

  /** Serializable snapshot for the save system — only player edits, not full world. */
  serializeModifications() {
    return Array.from(this.modifications.entries());
  }

  loadModifications(entries) {
    this.modifications = new Map(entries);
  }
}
