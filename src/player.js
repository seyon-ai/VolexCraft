// player.js — player physical state and movement resolution. Movement is
// resolved one axis at a time against the voxel grid so the player slides
// along walls instead of sticking, and flight/gravity are just different
// vertical-velocity rules layered on the same collision code.

import * as THREE from 'three';
import { PlayerSettings } from './settings.js';
import { clamp } from './utils.js';
import { BlockId } from './block.js';

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

    this.maxHunger = 20;
    this.hunger = 20;
    this._hungerDrainAccum = 0;
    this._regenTimer = 0;
    this._starveTimer = 0;

    this._fallStartY = null;
    this.eventLog = []; // simple queue UI can drain (damage taken, death, etc.)

    this._stepVisualOffset = 0; // eases the camera up smoothly after an auto-step (physics itself is instant)
  }

  get width() { return PlayerSettings.width; }
  get height() { return PlayerSettings.height; }

  getEyePosition(out = new THREE.Vector3()) {
    return out.set(this.position.x, this.position.y + PlayerSettings.eyeHeight + this._stepVisualOffset, this.position.z);
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

  /**
   * Horizontal move with auto-step: if walking into a ledge exactly one
   * block tall would otherwise stop the player dead, hop the player up
   * onto it instead (classic "auto-jump" convenience for voxel games).
   */
  moveAxisWithStep(axis, delta) {
    if (delta === 0) return false;
    const originalAxisPos = this.position[axis];
    const originalY = this.position.y;

    const blocked = this.moveAxis(axis, delta);
    if (!blocked) return false;
    if (this.flying || !this.onGround) return true; // no auto-step mid-air or while flying

    // Retry from one step higher; if that clears the obstruction, keep it —
    // gravity will settle the player onto the ledge over the next frames.
    this.position[axis] = originalAxisPos;
    this.position.y = originalY + PlayerSettings.stepHeight;
    if (this.aabbIntersectsWorld(this.getAABB())) {
      this.position.y = originalY;
      this.position[axis] = originalAxisPos;
      this.moveAxis(axis, delta);
      return true;
    }
    const blockedAtStep = this.moveAxis(axis, delta);
    if (blockedAtStep) {
      this.position.y = originalY;
      this.position[axis] = originalAxisPos;
      this.moveAxis(axis, delta);
      return true;
    }
    // Step succeeded: physically we're already at the new height, but ease
    // the camera up from where it was so the step reads as a smooth hop
    // rather than a snap.
    this._stepVisualOffset -= PlayerSettings.stepHeight;
    return false;
  }

  update(dt, wishDirection, jumpPressed, gameMode) {
    if (this.isDead) return;
    const settings = PlayerSettings;
    this.flying = gameMode === 'creative' && this.flying;

    const eye = this.getEyePosition();
    this.isUnderwater = this.world.getBlock(Math.floor(eye.x), Math.floor(eye.y), Math.floor(eye.z)) === BlockId.WATER;

    const canSprint = gameMode !== 'survival' || this.hunger > 0;
    const sprinting = this.sprinting && canSprint;
    const waterDrag = this.isUnderwater && !this.flying ? 0.5 : 1;
    const speed = (this.flying
      ? (sprinting ? settings.flySprintSpeed : settings.flySpeed)
      : (sprinting ? settings.sprintSpeed : settings.walkSpeed)) * waterDrag;

    // Horizontal velocity is directly driven by input (arcade-style, not accel-based)
    // for crisp, responsive controls that feel right for a voxel game.
    this.velocity.x = wishDirection.x * speed;
    this.velocity.z = wishDirection.z * speed;

    if (this.flying) {
      this.velocity.y = wishDirection.y * speed;
    } else if (this.isUnderwater) {
      if (jumpPressed) this.velocity.y = Math.min(this.velocity.y + 4, 3.5);
      this.velocity.y += settings.gravity * 0.35 * dt;
      this.velocity.y = clamp(this.velocity.y, -3, 3.5);
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

    const collidedX = this.moveAxisWithStep('x', this.velocity.x * dt);
    const collidedZ = this.moveAxisWithStep('z', this.velocity.z * dt);
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

    if (this._stepVisualOffset !== 0) {
      const ease = Math.min(1, dt * 10); // ~100ms to settle
      this._stepVisualOffset += (0 - this._stepVisualOffset) * ease;
      if (Math.abs(this._stepVisualOffset) < 0.002) this._stepVisualOffset = 0;
    }

    if (gameMode === 'survival') this._updateHunger(dt, sprinting);
  }

  /** Hunger drains slowly over time (faster while sprinting), fuels passive
   * health regen once it's reasonably high, and causes slow starvation damage
   * once it hits zero — eating food restores it (see restoreHunger). */
  _updateHunger(dt, sprinting) {
    const drainPerSecond = sprinting ? 1 / 25 : 1 / 90;
    this._hungerDrainAccum += dt * drainPerSecond;
    while (this._hungerDrainAccum >= 1) {
      this._hungerDrainAccum -= 1;
      this.hunger = Math.max(0, this.hunger - 1);
    }

    if (this.hunger >= 7 && this.health < this.maxHealth) {
      this._regenTimer += dt;
      if (this._regenTimer >= 4) {
        this._regenTimer = 0;
        this.heal(1);
        this.hunger = Math.max(0, this.hunger - 1); // passive regen costs hunger
      }
    } else {
      this._regenTimer = 0;
    }

    if (this.hunger <= 0) {
      this._starveTimer += dt;
      if (this._starveTimer >= 4) {
        this._starveTimer = 0;
        this.damage(1);
      }
    } else {
      this._starveTimer = 0;
    }
  }

  /** Eating food restores hunger (health regen is fueled by hunger, not healed directly). */
  restoreHunger(amount) {
    this.hunger = clamp(this.hunger + amount, 0, this.maxHunger);
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
    this.hunger = this.maxHunger;
    this._hungerDrainAccum = 0;
    this._regenTimer = 0;
    this._starveTimer = 0;
    this.velocity.set(0, 0, 0);
    this._fallStartY = null;
    if (spawnPosition) this.position.copy(spawnPosition);
    else this.position.set(this.position.x, 90, this.position.z);
  }
}
