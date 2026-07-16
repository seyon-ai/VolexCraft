// timeSystem.js — drives the day/night cycle. Everything else (sky color,
// fog tint, sun/moon position, light intensity) is derived purely from
// `time` (0..1, one full day), so hooking in seasons or weather later just
// means feeding additional inputs into the same derivation functions.

import * as THREE from 'three';
import { TimeSettings, GraphicsSettings } from './settings.js';
import { clamp, lerp } from './utils.js';

const NIGHT_SKY = new THREE.Color(0x03060f);
const DAWN_SKY = new THREE.Color(0xf29c6b);
const DAY_SKY = new THREE.Color(0x8fd0f0);
const DUSK_SKY = new THREE.Color(0xe0703f);

const NIGHT_FOG = new THREE.Color(0x03060f);
const DAY_FOG = new THREE.Color(0xbfe3f5);

function mixColor(a, b, t) {
  return a.clone().lerp(b, clamp(t, 0, 1));
}

/** Small radial-gradient glow texture used for the sun/moon sprites. */
function makeGlowTexture(coreColor) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, coreColor);
  grad.addColorStop(0.5, coreColor);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function buildStarField() {
  const count = 900;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random()); // upper hemisphere only (stars stay above horizon)
    const r = 170 + Math.random() * 25;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi) + 10;
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false });
  return new THREE.Points(geometry, material);
}

export class TimeSystem {
  constructor(scene) {
    this.scene = scene;
    this.time = TimeSettings.startTime;
    this.timeScale = TimeSettings.timeScale;
    this.paused = false;
    this.sunDirection = new THREE.Vector3(0, 1, 0);
    this.sunIntensityForWater = 0;

    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.sunLight.castShadow = GraphicsSettings.shadows;
    this.sunLight.shadow.mapSize.set(GraphicsSettings.shadowMapSize, GraphicsSettings.shadowMapSize);
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 220;
    const shadowSpan = 90;
    this.sunLight.shadow.camera.left = -shadowSpan;
    this.sunLight.shadow.camera.right = shadowSpan;
    this.sunLight.shadow.camera.top = shadowSpan;
    this.sunLight.shadow.camera.bottom = -shadowSpan;
    this.sunLight.shadow.bias = -0.0015;
    this.sunLight.target = new THREE.Object3D();

    this.moonLight = new THREE.DirectionalLight(0x8fa6cf, 0.0);
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);

    scene.add(this.sunLight, this.sunLight.target, this.moonLight, this.ambientLight);

    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture('#fff6d6'), transparent: true, depthWrite: false }));
    this.sunSprite.scale.set(26, 26, 1);
    this.moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture('#dfe6f2'), transparent: true, depthWrite: false }));
    this.moonSprite.scale.set(18, 18, 1);
    this.stars = buildStarField();
    scene.add(this.sunSprite, this.moonSprite, this.stars);

    if (GraphicsSettings.fogEnabled) {
      scene.fog = new THREE.Fog(DAY_FOG.getHex(), GraphicsSettings.fogNear, GraphicsSettings.fogFar);
    }
  }

  /** Sun height above horizon in [-1, 1] for a given time-of-day fraction. */
  static sunHeight(time) {
    const angle = (time - 0.25) * Math.PI * 2;
    return Math.sin(angle);
  }

  update(dt, followTarget) {
    if (!this.paused) {
      this.time = (this.time + dt * this.timeScale / TimeSettings.dayLengthSeconds) % 1;
    }

    const angle = (this.time - 0.25) * Math.PI * 2;
    const radius = 200;
    const sunHeight = Math.sin(angle);

    const sx = Math.cos(angle) * radius;
    const sy = sunHeight * radius;
    const sz = radius * 0.25;
    this.sunDirection.set(sx, sy, sz).normalize();
    this.sunIntensityForWater = clamp((sunHeight + 0.1) / 0.4, 0, 1);

    if (followTarget) {
      this.sunLight.position.set(followTarget.x + sx, followTarget.y + Math.max(sy, 5), followTarget.z + sz);
      this.sunLight.target.position.copy(followTarget);
      this.moonLight.position.set(followTarget.x - sx, followTarget.y + Math.max(-sy, 5), followTarget.z - sz);
      this.sunSprite.position.copy(this.sunLight.position);
      this.moonSprite.position.copy(this.moonLight.position);
      this.stars.position.copy(followTarget);
    }

    // Derive intensities and colors purely from sun height, so twilight fades smoothly.
    const dayFactor = clamp((sunHeight + 0.15) / 0.35, 0, 1); // 0 at horizon-ish, 1 once well up
    const duskDawnFactor = 1 - Math.abs(clamp(sunHeight / 0.35, -1, 1));

    this.sunLight.intensity = lerp(0.0, 1.15, clamp((sunHeight + 0.05) / 0.5, 0, 1));
    this.moonLight.intensity = lerp(0.28, 0.0, clamp((sunHeight + 0.3) / 0.3, 0, 1));
    this.ambientLight.intensity = lerp(0.18, 0.65, dayFactor);

    let sky = mixColor(NIGHT_SKY, DAY_SKY, dayFactor);
    if (duskDawnFactor > 0.15) {
      const warm = sunHeight >= 0 ? DAWN_SKY : DUSK_SKY;
      sky = mixColor(sky, warm, duskDawnFactor * 0.65);
    }
    this.scene.background = sky;

    if (this.scene.fog) {
      this.scene.fog.color = mixColor(NIGHT_FOG, DAY_FOG, dayFactor);
    }

    this.sunSprite.material.opacity = clamp((sunHeight + 0.05) * 3, 0, 1);
    this.moonSprite.material.opacity = clamp((-sunHeight + 0.05) * 3, 0, 1);
    this.stars.material.opacity = clamp(1 - dayFactor * 1.4, 0, 0.85);
  }

  setTimeScale(scale) { this.timeScale = scale; }
  setTime(fraction) { this.time = ((fraction % 1) + 1) % 1; }

  /** Changes shadow map resolution at runtime (used by graphics presets). */
  setShadowMapSize(size) {
    if (this.sunLight.shadow.mapSize.width === size) return;
    this.sunLight.shadow.mapSize.set(size, size);
    if (this.sunLight.shadow.map) {
      this.sunLight.shadow.map.dispose();
      this.sunLight.shadow.map = null; // three.js regenerates it next render
    }
  }

  getPhaseLabel() {
    const t = this.time;
    if (t < 0.22 || t > 0.95) return 'Night';
    if (t < 0.30) return 'Sunrise';
    if (t < 0.68) return 'Day';
    if (t < 0.80) return 'Sunset';
    return 'Night';
  }

  isNight() {
    return TimeSystem.sunHeight(this.time) < -0.05;
  }
}
