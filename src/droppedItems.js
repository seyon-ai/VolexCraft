// droppedItems.js — physical item pickups. When a block breaks or a mob
// dies, a small bobbing/spinning cube appears in the world (tinted to match
// the item) instead of the item silently teleporting into your inventory.
// Walking within pickup range collects it; nearby stacks of the same item
// merge together so breaking a big patch of ore doesn't carpet the ground
// in dozens of separate entities.

import * as THREE from 'three';
import { tintForAny } from './block.js';

const GRAVITY = -24;
const PICKUP_RADIUS = 1.1;
const PICKUP_DELAY = 0.4; // brief grace period after spawning before it can be collected
const DESPAWN_SECONDS = 90; // items left on the ground for too long vanish
const MERGE_RADIUS = 0.6;

function buildItemMesh(id) {
  const color = tintForAny(id);
  const geometry = new THREE.BoxGeometry(0.28, 0.28, 0.28);
  const material = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

class DroppedItem {
  constructor(id, count, position, scene) {
    this.id = id;
    this.count = count;
    this.position = position.clone();
    this.velocity = new THREE.Vector3((Math.random() - 0.5) * 1.5, 3.2, (Math.random() - 0.5) * 1.5);
    this.age = 0;
    this.alive = true;
    this._bobOffset = Math.random() * Math.PI * 2;

    this.mesh = buildItemMesh(id);
    this.mesh.position.copy(this.position);
    scene.add(this.mesh);
  }

  getAABB(pos = this.position) {
    const hw = 0.14;
    return { minX: pos.x - hw, maxX: pos.x + hw, minY: pos.y, maxY: pos.y + 0.28, minZ: pos.z - hw, maxZ: pos.z + hw };
  }

  intersectsWorld(world, aabb) {
    const minX = Math.floor(aabb.minX), maxX = Math.floor(aabb.maxX - 1e-6);
    const minY = Math.floor(aabb.minY), maxY = Math.floor(aabb.maxY - 1e-6);
    const minZ = Math.floor(aabb.minZ), maxZ = Math.floor(aabb.maxZ - 1e-6);
    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++)
        for (let z = minZ; z <= maxZ; z++)
          if (world.isSolidAt(x, y, z)) return true;
    return false;
  }

  moveAxis(world, axis, delta) {
    if (delta === 0) return false;
    this.position[axis] += delta;
    if (this.intersectsWorld(world, this.getAABB())) {
      const sign = Math.sign(delta);
      this.position[axis] -= delta;
      const step = 0.05;
      let moved = 0;
      while (moved + step < Math.abs(delta)) {
        this.position[axis] += step * sign;
        if (this.intersectsWorld(world, this.getAABB())) { this.position[axis] -= step * sign; return true; }
        moved += step;
      }
      return true;
    }
    return false;
  }

  update(dt, world) {
    this.age += dt;
    this.velocity.y += GRAVITY * dt;
    this.velocity.y = Math.max(this.velocity.y, -20);
    this.velocity.x *= 0.9;
    this.velocity.z *= 0.9;

    const collidedX = this.moveAxis(world, 'x', this.velocity.x * dt);
    const collidedZ = this.moveAxis(world, 'z', this.velocity.z * dt);
    if (collidedX) this.velocity.x = 0;
    if (collidedZ) this.velocity.z = 0;
    const collidedY = this.moveAxis(world, 'y', this.velocity.y * dt);
    if (collidedY) this.velocity.y = 0;

    if (this.position.y < -32 || this.age > DESPAWN_SECONDS) this.alive = false;

    const bob = Math.sin(this.age * 3 + this._bobOffset) * 0.06;
    this.mesh.position.set(this.position.x, this.position.y + 0.14 + bob, this.position.z);
    this.mesh.rotation.y += dt * 1.2;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

export class DroppedItemManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.items = [];
  }

  /** Spawns a pickup, merging into a nearby stack of the same id if one exists. */
  spawn(id, count, position) {
    for (const item of this.items) {
      if (item.id !== id) continue;
      const dx = item.position.x - position.x, dy = item.position.y - position.y, dz = item.position.z - position.z;
      if (Math.hypot(dx, dy, dz) < MERGE_RADIUS) { item.count += count; return; }
    }
    this.items.push(new DroppedItem(id, count, position, this.scene));
  }

  /** onPickup(id, count) should attempt to add to inventory and return whether it fit. */
  update(dt, player, onPickup) {
    for (const item of this.items) item.update(dt, this.world);

    this.items = this.items.filter((item) => {
      if (!item.alive) { item.dispose(this.scene); return false; }
      if (item.age < PICKUP_DELAY) return true;

      const dx = item.position.x - player.position.x;
      const dy = (item.position.y + 0.5) - (player.position.y + 0.9);
      const dz = item.position.z - player.position.z;
      if (Math.hypot(dx, dy, dz) < PICKUP_RADIUS) {
        const picked = onPickup(item.id, item.count);
        if (picked) { item.dispose(this.scene); return false; }
      }
      return true;
    });
  }

  disposeAll() {
    for (const item of this.items) item.dispose(this.scene);
    this.items = [];
  }
}
