// chunk.js — one chunk's voxel storage plus the code that turns those voxels
// into renderable geometry. Meshing only emits faces that are actually visible
// (hidden-surface removal), which is the single biggest performance win for a
// voxel renderer of this scale.

import * as THREE from 'three';
import { WorldSettings } from './settings.js';
import { BlockId, BlockRegistry, isTransparent, isLiquid } from './block.js';
import { tileUV } from './textureAtlas.js';

const { CHUNK_SIZE, CHUNK_HEIGHT } = WorldSettings;

// Face definitions: normal + 4 corner offsets (in block-local space), winding CCW.
const FACES = [
  { dir: [1, 0, 0], normal: [1, 0, 0], faceIndex: 0, corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { dir: [-1, 0, 0], normal: [-1, 0, 0], faceIndex: 1, corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { dir: [0, 1, 0], normal: [0, 1, 0], faceIndex: 2, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, -1, 0], normal: [0, -1, 0], faceIndex: 3, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [0, 0, 1], normal: [0, 0, 1], faceIndex: 4, corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { dir: [0, 0, -1], normal: [0, 0, -1], faceIndex: 5, corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

export class Chunk {
  constructor(cx, cz, world) {
    this.cx = cx;
    this.cz = cz;
    this.world = world;
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
    this.heightMap = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    this.solidMesh = null;
    this.waterMesh = null;
    this.generated = false;
    this.dirty = false; // has player-made modifications (drives save system)
  }

  index(lx, ly, lz) {
    return lx + lz * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE;
  }

  inBounds(lx, ly, lz) {
    return lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE && ly >= 0 && ly < CHUNK_HEIGHT;
  }

  getBlockLocal(lx, ly, lz) {
    if (!this.inBounds(lx, ly, lz)) return BlockId.AIR;
    return this.blocks[this.index(lx, ly, lz)];
  }

  setBlockLocal(lx, ly, lz, id) {
    if (!this.inBounds(lx, ly, lz)) return;
    this.blocks[this.index(lx, ly, lz)] = id;
  }

  worldOriginX() { return this.cx * CHUNK_SIZE; }
  worldOriginZ() { return this.cz * CHUNK_SIZE; }

  /** Fills voxel data deterministically from the terrain generator (+ tree placement). */
  generate(terrainGenerator) {
    const ox = this.worldOriginX();
    const oz = this.worldOriginZ();

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const { height, biome } = terrainGenerator.getColumn(wx, wz);
        this.heightMap[lx + lz * CHUNK_SIZE] = height;

        const surface = terrainGenerator.surfaceBlockFor(biome);
        const subSurface = terrainGenerator.subSurfaceBlockFor(biome);

        for (let y = 0; y <= height; y++) {
          let id;
          if (y === 0) id = BlockId.BEDROCK;
          else if (y === height) id = surface;
          else if (y > height - 4) id = subSurface;
          else id = terrainGenerator.pickOre(wx, y, wz) || BlockId.STONE;
          this.setBlockLocal(lx, y, lz, id);
        }
        // Fill water up to sea level over anything lower (oceans/lakes).
        for (let y = height + 1; y <= WorldSettings.SEA_LEVEL; y++) {
          this.setBlockLocal(lx, y, lz, BlockId.WATER);
        }
      }
    }

    // Surface decoration (flowers/grass/cactus/pumpkin) — skipped on columns
    // that will grow a tree, and only above sea level.
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const { height, biome, tree } = terrainGenerator.getColumn(wx, wz);
        if (tree || height <= WorldSettings.SEA_LEVEL) continue;
        const deco = terrainGenerator.decorationAt(wx, wz, biome, height);
        if (deco !== null && this.getBlockLocal(lx, height + 1, lz) === BlockId.AIR) {
          this.setBlockLocal(lx, height + 1, lz, deco);
        }
      }
    }

    // Trees: only placed when the whole canopy fits inside this chunk, which
    // keeps tree generation chunk-local and avoids cross-chunk mesh coupling.
    const MARGIN = 2;
    for (let lx = MARGIN; lx < CHUNK_SIZE - MARGIN; lx++) {
      for (let lz = MARGIN; lz < CHUNK_SIZE - MARGIN; lz++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const { height, biome, tree } = terrainGenerator.getColumn(wx, wz);
        if (tree && height > WorldSettings.SEA_LEVEL) {
          this.placeTree(lx, height + 1, lz);
        }
      }
    }

    this.generated = true;
  }

  placeTree(lx, ly, lz) {
    const trunkHeight = 4 + ((lx + lz) % 2);
    for (let i = 0; i < trunkHeight; i++) {
      this.setBlockLocal(lx, ly + i, lz, BlockId.WOOD);
    }
    const topY = ly + trunkHeight;
    for (let dy = -2; dy <= 1; dy++) {
      const radius = dy === 1 ? 1 : 2;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && radius === 2) continue; // rounded canopy
          if (dx === 0 && dz === 0 && dy < 1) continue; // keep trunk visible
          const y = topY + dy;
          if (this.getBlockLocal(lx + dx, y, lz + dz) === BlockId.AIR) {
            this.setBlockLocal(lx + dx, y, lz + dz, BlockId.LEAVES);
          }
        }
      }
    }
  }

  /** Looks up a block that may be outside this chunk (queries the world / neighbor chunks). */
  neighborBlock(lx, ly, lz) {
    if (this.inBounds(lx, ly, lz)) return this.blocks[this.index(lx, ly, lz)];
    const wx = this.worldOriginX() + lx;
    const wz = this.worldOriginZ() + lz;
    return this.world.getBlock(wx, ly, wz, /*defaultUnloaded*/ BlockId.STONE);
  }

  static faceVisible(currentId, neighborId) {
    if (neighborId === BlockId.AIR) return true;
    if (neighborId === currentId) return false;
    return isTransparent(neighborId);
  }

  /** Rebuilds solid + water meshes from current voxel data and swaps them into the scene group. */
  buildMesh(atlasTexture) {
    const solid = { positions: [], normals: [], uvs: [], indices: [] };
    const water = { positions: [], normals: [], uvs: [], indices: [] };
    const ox = this.worldOriginX();
    const oz = this.worldOriginZ();

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let ly = 0; ly < CHUNK_HEIGHT; ly++) {
          const id = this.getBlockLocal(lx, ly, lz);
          if (id === BlockId.AIR) continue;
          const def = BlockRegistry[id];
          const target = isLiquid(id) ? water : solid;

          for (const face of FACES) {
            const nx = lx + face.dir[0];
            const ny = ly + face.dir[1];
            const nz = lz + face.dir[2];
            const neighborId = this.neighborBlock(nx, ny, nz);
            if (!Chunk.faceVisible(id, neighborId)) continue;

            const tile = def.faces[face.faceIndex];
            const [u0, v0, u1, v1] = tileUV(tile);
            const uvCorners = [[u1, v0], [u1, v1], [u0, v1], [u0, v0]];
            const startIndex = target.positions.length / 3;

            for (let c = 0; c < 4; c++) {
              const [cx, cy, cz] = face.corners[c];
              target.positions.push(ox + lx + cx, ly + cy, oz + lz + cz);
              target.normals.push(...face.normal);
              target.uvs.push(uvCorners[c][0], uvCorners[c][1]);
            }
            target.indices.push(startIndex, startIndex + 1, startIndex + 2, startIndex, startIndex + 2, startIndex + 3);
          }
        }
      }
    }

    this._applyGeometry('solidMesh', solid, atlasTexture, false);
    this._applyGeometry('waterMesh', water, atlasTexture, true);
  }

  _applyGeometry(meshField, data, atlasTexture, isWater) {
    if (this[meshField]) {
      this[meshField].geometry.dispose();
      if (data.positions.length === 0) {
        this.world.scene.remove(this[meshField]);
        this[meshField] = null;
      }
    }
    if (data.positions.length === 0) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
    geometry.setIndex(data.indices);

    if (this[meshField]) {
      this[meshField].geometry = geometry;
      return;
    }

    const material = isWater
      ? new THREE.MeshLambertMaterial({ map: atlasTexture, transparent: true, opacity: 0.75, depthWrite: false })
      : new THREE.MeshLambertMaterial({ map: atlasTexture });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = !isWater;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this[meshField] = mesh;
    this.world.scene.add(mesh);
  }

  dispose() {
    if (this.solidMesh) {
      this.world.scene.remove(this.solidMesh);
      this.solidMesh.geometry.dispose();
      this.solidMesh = null;
    }
    if (this.waterMesh) {
      this.world.scene.remove(this.waterMesh);
      this.waterMesh.geometry.dispose();
      this.waterMesh = null;
    }
  }
}
