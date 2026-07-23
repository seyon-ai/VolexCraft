// clouds.js — drifting cloud billboards. Two visual styles: soft white
// "fair weather" clouds, and a darker, denser "storm" variant used during
// thunderstorms (setStormy(true) swaps every cloud's texture/tint/altitude).
//
// Honest scope note: these are flat camera-facing sprites, not volumetric
// clouds — real raymarched volumetric clouds are not realistic to run every
// frame alongside a voxel world and stay smooth on mobile (see README).

import * as THREE from 'three';

const CLOUD_RADIUS = 150;
const FAIR_HEIGHT_MIN = 100, FAIR_HEIGHT_MAX = 130;
const STORM_HEIGHT_MIN = 80, STORM_HEIGHT_MAX = 100;

function buildCloudTexture(stormy) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const blobCount = stormy ? 9 : 6;
  const coreAlpha = stormy ? 0.75 : 0.9;
  const coreColor = stormy ? '60,62,68' : '255,255,255';
  for (let i = 0; i < blobCount; i++) {
    const x = 24 + Math.random() * 80;
    const y = 40 + Math.random() * 50;
    const r = (stormy ? 30 : 24) + Math.random() * 30;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${coreColor},${coreAlpha})`);
    grad.addColorStop(1, `rgba(${coreColor},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(canvas);
}

class Cloud {
  constructor(fairTexture, stormTexture, scene) {
    this.material = new THREE.SpriteMaterial({ map: fairTexture, transparent: true, opacity: 0.85, depthWrite: false });
    this.sprite = new THREE.Sprite(this.material);
    this.baseScale = 26 + Math.random() * 30;
    this.sprite.scale.set(this.baseScale, this.baseScale * 0.4, 1);
    scene.add(this.sprite);
    this.driftSpeed = 0.5 + Math.random() * 0.6;
    this.fairTexture = fairTexture;
    this.stormTexture = stormTexture;
    this.stormy = false;
  }

  setStormy(stormy) {
    if (this.stormy === stormy) return;
    this.stormy = stormy;
    this.material.map = stormy ? this.stormTexture : this.fairTexture;
    this.material.opacity = stormy ? 0.92 : 0.85;
    this.material.needsUpdate = true;
    const scale = stormy ? this.baseScale * 1.4 : this.baseScale;
    this.sprite.scale.set(scale, scale * 0.4, 1);
  }
}

export class CloudSystem {
  constructor(scene) {
    this.scene = scene;
    this.fairTexture = buildCloudTexture(false);
    this.stormTexture = buildCloudTexture(true);
    this.clouds = [];
    this.enabled = true;
    this.stormy = false;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    for (const cloud of this.clouds) cloud.sprite.visible = enabled;
  }

  setCount(n) {
    while (this.clouds.length < n) this._spawnCloud();
    while (this.clouds.length > n) {
      const cloud = this.clouds.pop();
      this.scene.remove(cloud.sprite);
      cloud.material.dispose();
    }
  }

  setStormy(stormy) {
    this.stormy = stormy;
    for (const cloud of this.clouds) cloud.setStormy(stormy);
  }

  _spawnCloud(center = { x: 0, z: 0 }) {
    const cloud = new Cloud(this.fairTexture, this.stormTexture, this.scene);
    cloud.setStormy(this.stormy);
    cloud.sprite.visible = this.enabled;
    this._placeRandom(cloud, center);
    this.clouds.push(cloud);
  }

  _placeRandom(cloud, center) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * CLOUD_RADIUS;
    const [minH, maxH] = cloud.stormy ? [STORM_HEIGHT_MIN, STORM_HEIGHT_MAX] : [FAIR_HEIGHT_MIN, FAIR_HEIGHT_MAX];
    cloud.sprite.position.set(
      center.x + Math.cos(angle) * dist,
      minH + Math.random() * (maxH - minH),
      center.z + Math.sin(angle) * dist
    );
  }

  update(dt, playerPosition) {
    if (!this.enabled) return;
    for (const cloud of this.clouds) {
      cloud.sprite.position.x += cloud.driftSpeed * dt;
      const dx = cloud.sprite.position.x - playerPosition.x;
      const dz = cloud.sprite.position.z - playerPosition.z;
      if (Math.hypot(dx, dz) > CLOUD_RADIUS * 1.3) {
        this._placeRandom(cloud, playerPosition);
      }
    }
  }

  disposeAll() {
    for (const cloud of this.clouds) { this.scene.remove(cloud.sprite); cloud.material.dispose(); }
    this.clouds = [];
    this.fairTexture.dispose();
    this.stormTexture.dispose();
  }
}
