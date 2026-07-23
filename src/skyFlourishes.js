// skyFlourishes.js — the small decorative touches that make the night sky
// feel alive: a soft Milky Way band, occasional shooting stars, and a rare
// faint aurora tint. Kept separate from timeSystem.js (which owns the plain
// starfield + sun/moon) so each stays easy to reason about on its own.

import * as THREE from 'three';

function buildMilkyWayTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(180,190,220,0)');
  grad.addColorStop(0.5, 'rgba(200,205,230,0.55)');
  grad.addColorStop(1, 'rgba(180,190,220,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * 512;
    const y = 30 + Math.random() * 68;
    const r = Math.random() * 1.4;
    ctx.fillStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.5})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  return new THREE.CanvasTexture(canvas);
}

function buildAuroraTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(80,220,140,0)');
  grad.addColorStop(0.4, 'rgba(80,220,140,0.5)');
  grad.addColorStop(0.7, 'rgba(120,90,220,0.35)');
  grad.addColorStop(1, 'rgba(120,90,220,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 64);
  return new THREE.CanvasTexture(canvas);
}

const SHOOTING_STAR_COUNT = 3;

export class SkyFlourishes {
  constructor(scene) {
    this.scene = scene;
    this.enabled = true;

    this.milkyWayTexture = buildMilkyWayTexture();
    const milkyWayMat = new THREE.SpriteMaterial({ map: this.milkyWayTexture, transparent: true, opacity: 0, depthWrite: false });
    this.milkyWaySprite = new THREE.Sprite(milkyWayMat);
    this.milkyWaySprite.scale.set(320, 80, 1);
    scene.add(this.milkyWaySprite);

    this.auroraTexture = buildAuroraTexture();
    this.auroraGroup = new THREE.Group();
    this.auroraSprites = [];
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.auroraTexture, transparent: true, opacity: 0, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(220, 55, 1);
      sprite.position.set((i - 1) * 90, 95 + i * 8, -120);
      this.auroraGroup.add(sprite);
      this.auroraSprites.push(sprite);
    }
    scene.add(this.auroraGroup);
    this._auroraActiveTonight = false;
    this._lastNightState = null;

    this.shootingStars = [];
    for (let i = 0; i < SHOOTING_STAR_COUNT; i++) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
      const material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
      const line = new THREE.LineSegments(geometry, material);
      scene.add(line);
      this.shootingStars.push({ line, active: false, life: 0, duration: 1, start: new THREE.Vector3(), dir: new THREE.Vector3() });
    }
    this._shootingStarTimer = 5 + Math.random() * 15;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.milkyWaySprite.visible = enabled;
    this.auroraGroup.visible = enabled;
    for (const s of this.shootingStars) s.line.visible = enabled;
  }

  update(dt, isNight, followTarget) {
    if (!this.enabled) return;

    if (isNight && this._lastNightState !== true) {
      this._auroraActiveTonight = Math.random() < 0.35;
    }
    this._lastNightState = isNight;

    const milkyWayTarget = isNight ? 0.55 : 0;
    this.milkyWaySprite.material.opacity += (milkyWayTarget - this.milkyWaySprite.material.opacity) * Math.min(1, dt * 0.3);

    const auroraTarget = (isNight && this._auroraActiveTonight) ? 0.5 : 0;
    for (const sprite of this.auroraSprites) {
      sprite.material.opacity += (auroraTarget - sprite.material.opacity) * Math.min(1, dt * 0.3);
    }

    if (followTarget) {
      this.milkyWaySprite.position.set(followTarget.x, 90, followTarget.z - 100);
      this.auroraSprites.forEach((sprite, i) => {
        sprite.position.x = followTarget.x + (i - 1) * 90;
        sprite.position.z = followTarget.z - 120;
      });
    }

    if (isNight) {
      this._shootingStarTimer -= dt;
      if (this._shootingStarTimer <= 0) {
        this._shootingStarTimer = 8 + Math.random() * 20;
        this._spawnShootingStar(followTarget);
      }
    }

    for (const s of this.shootingStars) {
      if (!s.active) continue;
      s.life += dt;
      const t = s.life / s.duration;
      if (t >= 1) { s.active = false; s.line.material.opacity = 0; continue; }
      const headX = s.start.x + s.dir.x * t * 40, headY = s.start.y + s.dir.y * t * 40, headZ = s.start.z + s.dir.z * t * 40;
      const tailX = s.start.x + s.dir.x * (t * 40 - 6), tailY = s.start.y + s.dir.y * (t * 40 - 6), tailZ = s.start.z + s.dir.z * (t * 40 - 6);
      const pos = s.line.geometry.attributes.position.array;
      pos[0] = headX; pos[1] = headY; pos[2] = headZ;
      pos[3] = tailX; pos[4] = tailY; pos[5] = tailZ;
      s.line.geometry.attributes.position.needsUpdate = true;
      s.line.material.opacity = Math.sin(t * Math.PI) * 0.9;
    }
  }

  _spawnShootingStar(followTarget) {
    const free = this.shootingStars.find((s) => !s.active);
    if (!free) return;
    const center = followTarget || { x: 0, y: 0, z: 0 };
    const angle = Math.random() * Math.PI * 2;
    free.start.set(center.x + Math.cos(angle) * 120, 90 + Math.random() * 40, center.z + Math.sin(angle) * 120);
    const dirAngle = angle + Math.PI + (Math.random() - 0.5);
    free.dir.set(Math.cos(dirAngle), -0.3 - Math.random() * 0.3, Math.sin(dirAngle)).normalize();
    free.active = true;
    free.life = 0;
    free.duration = 0.8 + Math.random() * 0.6;
  }

  disposeAll() {
    this.scene.remove(this.milkyWaySprite, this.auroraGroup);
    this.milkyWaySprite.material.dispose();
    this.milkyWayTexture.dispose();
    for (const sprite of this.auroraSprites) sprite.material.dispose();
    this.auroraTexture.dispose();
    for (const s of this.shootingStars) {
      this.scene.remove(s.line);
      s.line.geometry.dispose();
      s.line.material.dispose();
    }
  }
}
