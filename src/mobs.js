// mobs.js — a deliberately simple mob layer: primitive-box meshes, a small
// wander/chase/attack state machine, and a manager that spawns mobs around
// the player and despawns ones that wander too far. Kept self-contained so
// a future pathfinding/animation upgrade only has to touch this file.

import * as THREE from 'three';
import { WorldSettings } from './settings.js';
import { ItemId } from './items.js';

export const MobKind = {
  COW: 'cow', PIG: 'pig', ZOMBIE: 'zombie', SKELETON: 'skeleton', CREEPER: 'creeper',
};

const MOB_DEFS = {
  [MobKind.COW]: { hostile: false, width: 0.9, height: 1.3, speed: 1.6, health: 10, bodyColor: 0x4a3626, headColor: 0xe8e0d0, drop: ItemId.RAW_BEEF },
  [MobKind.PIG]: { hostile: false, width: 0.85, height: 1.0, speed: 1.7, health: 8, bodyColor: 0xe6a9b0, headColor: 0xe6a9b0, drop: ItemId.RAW_PORKCHOP },
  [MobKind.ZOMBIE]: { hostile: true, width: 0.6, height: 1.85, speed: 2.2, health: 20, bodyColor: 0x2f6b3a, headColor: 0x3d7a48, damage: 3, attackRange: 1.3, aggroRange: 14 },
  [MobKind.SKELETON]: { hostile: true, width: 0.6, height: 1.85, speed: 2.0, health: 16, bodyColor: 0xd8d3c0, headColor: 0xe8e4d4, damage: 2, attackRange: 8, aggroRange: 16, ranged: true },
  [MobKind.CREEPER]: { hostile: true, width: 0.6, height: 1.7, speed: 1.9, health: 18, bodyColor: 0x4caf50, headColor: 0x5cc45c, damage: 8, attackRange: 2.4, aggroRange: 12, explodes: true },
};

const GRAVITY = -24;
const MAX_MOB_COUNT = 12;
const SPAWN_INTERVAL = 4; // seconds between spawn attempts
const MIN_SPAWN_DIST = 10;
const MAX_SPAWN_DIST = 22;
const DESPAWN_DIST = (WorldSettings.RENDER_DISTANCE + 3) * WorldSettings.CHUNK_SIZE;

// Where to look for user-supplied mob face images. Missing files just keep
// the flat fallback color already used for the whole head.
const MOB_FACE_PATH = 'assets/textures/mobs/';
const MOB_FACE_FILES = {
  [MobKind.COW]: 'cow_face.png',
  [MobKind.PIG]: 'pig_face.png',
  [MobKind.ZOMBIE]: 'zombie_face.png',
  [MobKind.SKELETON]: 'skeleton_face.png',
  [MobKind.CREEPER]: 'creeper_face.png',
};
const textureLoader = new THREE.TextureLoader();

function loadMobFaceTexture(kind, onLoad) {
  const filename = MOB_FACE_FILES[kind];
  if (!filename) return;
  textureLoader.load(
    MOB_FACE_PATH + filename,
    (texture) => { texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; onLoad(texture); },
    undefined,
    () => { /* 404 or load error — silently keep the flat color fallback */ }
  );
}

function buildMobMesh(def, kind) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: def.bodyColor });

  const bodyHeight = def.height * 0.62;
  const body = new THREE.Mesh(new THREE.BoxGeometry(def.width, bodyHeight, def.width * 0.7), bodyMat);
  body.position.y = bodyHeight / 2 + def.height * 0.28;
  body.castShadow = true;
  group.add(body);

  // Head: 6 face materials in BoxGeometry's default [+x,-x,+y,-y,+z,-z] order.
  // Only the front (+z) face gets swapped for a real texture if one loads;
  // the rest stay a flat color.
  const headSize = def.width * 0.75;
  const flatHeadMat = () => new THREE.MeshLambertMaterial({ color: def.headColor });
  const headMaterials = [flatHeadMat(), flatHeadMat(), flatHeadMat(), flatHeadMat(), flatHeadMat(), flatHeadMat()];
  const head = new THREE.Mesh(new THREE.BoxGeometry(headSize, headSize, headSize), headMaterials);
  head.position.y = bodyHeight + def.height * 0.28 + headSize / 2;
  head.castShadow = true;
  group.add(head);
  loadMobFaceTexture(kind, (texture) => {
    headMaterials[4] = new THREE.MeshLambertMaterial({ map: texture });
  });

  const legHeight = def.height * 0.28;
  const legMat = new THREE.MeshLambertMaterial({ color: def.bodyColor });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(def.width * 0.28, legHeight, def.width * 0.28), legMat);
      leg.position.set(sx * def.width * 0.28, legHeight / 2, sz * def.width * 0.22);
      leg.castShadow = true;
      group.add(leg);
    }
  }

  if (def.explodes) { // creeper: small dark "face" accent, visible even without an image
    const face = new THREE.Mesh(new THREE.BoxGeometry(headSize * 0.3, headSize * 0.3, 0.05), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
    face.position.set(0, head.position.y, def.width * 0.36);
    group.add(face);
  }

  return group;
}

export class Mob {
  constructor(kind, position, scene) {
    this.kind = kind;
    this.def = MOB_DEFS[kind];
    this.position = position.clone();
    this.velocity = new THREE.Vector3();
    this.health = this.def.health;
    this.alive = true;
    this.onGround = false;
    this.wanderTimer = 0;
    this.wanderDir = new THREE.Vector3();
    this.attackCooldown = 0;
    this.fuseTime = 0; // creeper explosion countdown once triggered
    this.fuseActive = false;

    this.mesh = buildMobMesh(this.def, kind);
    this.mesh.position.copy(this.position);
    scene.add(this.mesh);
  }

  getAABB(pos = this.position) {
    const hw = this.def.width / 2;
    return { minX: pos.x - hw, maxX: pos.x + hw, minY: pos.y, maxY: pos.y + this.def.height, minZ: pos.z - hw, maxZ: pos.z + hw };
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

  takeDamage(amount, knockbackDir) {
    if (!this.alive) return;
    this.health -= amount;
    if (knockbackDir) {
      this.velocity.x += knockbackDir.x * 5;
      this.velocity.z += knockbackDir.z * 5;
      this.velocity.y = Math.max(this.velocity.y, 4);
    }
    if (this.health <= 0) this.alive = false;
  }

  update(dt, world, player) {
    const toPlayer = new THREE.Vector3(player.position.x - this.position.x, 0, player.position.z - this.position.z);
    const distToPlayer = toPlayer.length();

    if (this.def.hostile && distToPlayer < this.def.aggroRange && !this.fuseActive) {
      if (distToPlayer > this.def.attackRange * 0.6) {
        toPlayer.normalize();
        this.velocity.x = toPlayer.x * this.def.speed;
        this.velocity.z = toPlayer.z * this.def.speed;
      } else {
        this.velocity.x = 0; this.velocity.z = 0;
      }

      this.attackCooldown -= dt;
      if (this.def.explodes) {
        if (distToPlayer < this.def.attackRange && this.attackCooldown <= 0) {
          this.fuseActive = true;
          this.fuseTime = 1.1;
        }
      } else if (distToPlayer < this.def.attackRange && this.attackCooldown <= 0) {
        if (player.gameModeCanTakeDamage) player.damage(this.def.damage);
        this.attackCooldown = 1.1;
      }
    } else if (this.fuseActive) {
      this.velocity.x = 0; this.velocity.z = 0;
      this.fuseTime -= dt;
      if (this.fuseTime <= 0) {
        if (distToPlayer < 3 && player.gameModeCanTakeDamage) player.damage(this.def.damage);
        this.alive = false;
      }
    } else {
      // Passive wander (also used by hostiles outside aggro range).
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 2 + Math.random() * 3;
        const angle = Math.random() * Math.PI * 2;
        this.wanderDir.set(Math.cos(angle), 0, Math.sin(angle));
        if (Math.random() < 0.3) this.wanderDir.set(0, 0, 0); // idle sometimes
      }
      const speed = this.def.speed * 0.4;
      this.velocity.x = this.wanderDir.x * speed;
      this.velocity.z = this.wanderDir.z * speed;
    }

    this.velocity.y += GRAVITY * dt;
    this.velocity.y = Math.max(this.velocity.y, -40);

    const collidedX = this.moveAxis(world, 'x', this.velocity.x * dt);
    const collidedZ = this.moveAxis(world, 'z', this.velocity.z * dt);
    if (collidedX) this.velocity.x = 0;
    if (collidedZ) this.velocity.z = 0;
    const collidedY = this.moveAxis(world, 'y', this.velocity.y * dt);
    if (collidedY) { this.onGround = this.velocity.y < 0; this.velocity.y = 0; }
    else this.onGround = false;

    // Simple auto-step so mobs don't get stuck on 1-block ledges while chasing.
    if ((collidedX || collidedZ) && this.onGround && (this.velocity.x !== 0 || this.velocity.z !== 0)) {
      this.position.y += 1.0;
      if (this.intersectsWorld(world, this.getAABB())) this.position.y -= 1.0;
    }

    if (this.position.y < -32) this.alive = false;

    this.mesh.position.copy(this.position);
    if (this.velocity.x !== 0 || this.velocity.z !== 0) {
      this.mesh.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
    }
    if (this.fuseActive) {
      const pulse = 1 + Math.sin(performance.now() * 0.02) * 0.08;
      this.mesh.scale.setScalar(pulse);
    }
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else if (obj.material) obj.material.dispose();
    });
  }
}

export class MobManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.mobs = [];
    this.spawnTimer = SPAWN_INTERVAL;
  }

  update(dt, player, isNight, onDeath) {
    for (const mob of this.mobs) mob.update(dt, this.world, player);

    this.mobs = this.mobs.filter((mob) => {
      const dx = mob.position.x - player.position.x, dz = mob.position.z - player.position.z;
      const tooFar = Math.hypot(dx, dz) > DESPAWN_DIST;
      if (!mob.alive || tooFar) {
        if (!mob.alive && onDeath) onDeath(mob);
        mob.dispose(this.scene);
        return false;
      }
      return true;
    });

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = SPAWN_INTERVAL;
      this._trySpawn(player, isNight);
    }
  }

  _trySpawn(player, isNight) {
    if (this.mobs.length >= MAX_MOB_COUNT) return;
    const angle = Math.random() * Math.PI * 2;
    const dist = MIN_SPAWN_DIST + Math.random() * (MAX_SPAWN_DIST - MIN_SPAWN_DIST);
    const x = Math.floor(player.position.x + Math.cos(angle) * dist);
    const z = Math.floor(player.position.z + Math.sin(angle) * dist);
    const height = this.world.getHeightAt(x, z);
    if (height <= WorldSettings.SEA_LEVEL) return; // no underwater spawns

    const kind = isNight
      ? [MobKind.ZOMBIE, MobKind.SKELETON, MobKind.CREEPER][Math.floor(Math.random() * 3)]
      : [MobKind.COW, MobKind.PIG][Math.floor(Math.random() * 2)];

    const mob = new Mob(kind, new THREE.Vector3(x + 0.5, height + 1, z + 0.5), this.scene);
    this.mobs.push(mob);
  }

  /** Nearest living mob within range and roughly in front of the given facing direction. */
  findAttackTarget(eyePosition, facingDir, maxRange = 4, minDot = 0.6) {
    let best = null, bestDist = Infinity;
    for (const mob of this.mobs) {
      if (!mob.alive) continue;
      const center = mob.position.clone().add(new THREE.Vector3(0, mob.def.height / 2, 0));
      const toMob = center.clone().sub(eyePosition);
      const dist = toMob.length();
      if (dist > maxRange) continue;
      toMob.normalize();
      if (toMob.dot(facingDir) < minDot) continue;
      if (dist < bestDist) { bestDist = dist; best = mob; }
    }
    return best;
  }

  disposeAll() {
    for (const mob of this.mobs) mob.dispose(this.scene);
    this.mobs = [];
  }
}
