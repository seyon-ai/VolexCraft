// player.js — player physical state and movement resolution. Movement is
// resolved one axis at a time against the voxel grid so the player slides
// along walls instead of sticking, and flight/gravity are just different
// vertical-velocity rules layered on the same collision code.

import * as THREE from 'three';
import { PlayerSettings } from './settings.js';
import { clamp } from './utils.js';

export class Player {
  constructor(world) {
    this.world = world;
    this.position = new THREE.Vector3(0, 80, 0); // feet position
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.flying = false;
    this.sprinting = false;

    this.maxHealth = 20;
    this.health = 20;
    this.isDead = false;

    this._fallStartY = null;
    this.eventLog = []; // simple queue UI can drain (damage taken, death, etc.)
  }

  get width() { return PlayerSettings.width; }
  get height() { return PlayerSettings.height; }

  getEyePosition(out = new THREE.Vector3()) {
    return out.set(this.position.x, this.position.y + PlayerSettings.eyeHeight, this.position.z);
  }

  getAABB(pos = this.position) {
    const hw = this.width / 2;
    return {
      minX: pos.x - hw, maxX: pos.x + hw,
      minY: pos.y, maxY: pos.y + this.height,
      minZ: pos.z - hw, maxZ: pos.z + hw,
    };
  }

  aabbIntersectsWorld(aabb) {
    const minX = Math.floor(aabb.minX), maxX = Math.floor(aabb.maxX - 1e-6);
    const minY = Math.floor(aabb.minY), maxY = Math.floor(aabb.maxY - 1e-6);
    const minZ = Math.floor(aabb.minZ), maxZ = Math.floor(aabb.maxZ - 1e-6);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.world.isSolidAt(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  /** Moves along a single axis, stopping (and zeroing velocity) on collision. */
  moveAxis(axis, delta) {
    if (delta === 0) return false;
    this.position[axis] += delta;
    const aabb = this.getAABB();
    if (this.aabbIntersectsWorld(aabb)) {
      // Step back to the boundary in small increments — simple and robust
      // for the block sizes/speeds involved here.
      const sign = Math.sign(delta);
      let remaining = Math.abs(delta);
      this.position[axis] -= delta;
      const stepSize = 0.02;
      let moved = 0;
      while (moved + stepSize < remaining) {
        this.position[axis] += stepSize * sign;
        if (this.aabbIntersectsWorld(this.getAABB())) {
          this.position[axis] -= stepSize * sign;
          return true;
        }
        moved += stepSize;
      }
      return true;
    }
    return false;
  }

  update(dt, wishDirection, jumpPressed, gameMode) {
    if (this.isDead) return;
    const settings = PlayerSettings;
    this.flying = gameMode === 'creative' && this.flying;

    const speed = this.flying
      ? (this.sprinting ? settings.flySprintSpeed : settings.flySpeed)
      : (this.sprinting ? settings.sprintSpeed : settings.walkSpeed);

    // Horizontal velocity is directly driven by input (arcade-style, not accel-based)
    // for crisp, responsive controls that feel right for a voxel game.
    this.velocity.x = wishDirection.x * speed;
    this.velocity.z = wishDirection.z * speed;

    if (this.flying) {
      this.velocity.y = wishDirection.y * speed;
    } else {
      if (jumpPressed && this.onGround) {
        this.velocity.y = settings.jumpVelocity;
        this.onGround = false;
      }
      this.velocity.y += settings.gravity * dt;
      this.velocity.y = Math.max(this.velocity.y, settings.maxFallSpeed);
    }

    // Track fall distance for fall-damage calculation.
    if (!this.flying) {
      if (!this.onGround && this.velocity.y < 0 && this._fallStartY === null) {
        this._fallStartY = this.position.y;
      }
    }

    const collidedX = this.moveAxis('x', this.velocity.x * dt);
    const collidedZ = this.moveAxis('z', this.velocity.z * dt);
    if (collidedX) this.velocity.x = 0;
    if (collidedZ) this.velocity.z = 0;

    const wasOnGround = this.onGround;
    const collidedY = this.moveAxis('y', this.velocity.y * dt);
    if (collidedY) {
      if (this.velocity.y < 0) {
        this.onGround = true;
        if (gameMode === 'survival' && this._fallStartY !== null) {
          const fallDistance = this._fallStartY - this.position.y;
          this.applyFallDamage(fallDistance);
        }
        this._fallStartY = null;
      }
      this.velocity.y = 0;
    } else {
      this.onGround = false;
    }

    if (this.position.y < -32) this.respawn(); // fell out of the world
  }

  applyFallDamage(fallDistance) {
    const excess = fallDistance - PlayerSettings.fallDamageThreshold;
    if (excess > 0) {
      const damage = Math.floor(excess) * 2;
      if (damage > 0) this.damage(damage);
    }
  }

  damage(amount) {
    if (this.isDead) return;
    this.health = clamp(this.health - amount, 0, this.maxHealth);
    this.eventLog.push({ type: 'damage', amount });
    if (this.health <= 0) this.die();
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, this.maxHealth);
  }

  die() {
    this.isDead = true;
    this.eventLog.push({ type: 'death' });
  }

  respawn(spawnPosition) {
    this.isDead = false;
    this.health = this.maxHealth;
    this.velocity.set(0, 0, 0);
    this._fallStartY = null;
    if (spawnPosition) this.position.copy(spawnPosition);
    else this.position.set(this.position.x, 90, this.position.z);
  }
}
