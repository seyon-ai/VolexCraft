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

export class TimeSystem {
  constructor(scene) {
    this.scene = scene;
    this.time = TimeSettings.startTime;
    this.timeScale = TimeSettings.timeScale;
    this.paused = false;

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

    if (followTarget) {
      this.sunLight.position.set(followTarget.x + sx, followTarget.y + Math.max(sy, 5), followTarget.z + sz);
      this.sunLight.target.position.copy(followTarget);
      this.moonLight.position.set(followTarget.x - sx, followTarget.y + Math.max(-sy, 5), followTarget.z - sz);
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
  }

  setTimeScale(scale) { this.timeScale = scale; }
  setTime(fraction) { this.time = ((fraction % 1) + 1) % 1; }

  getPhaseLabel() {
    const t = this.time;
    if (t < 0.22 || t > 0.95) return 'Night';
    if (t < 0.30) return 'Sunrise';
    if (t < 0.68) return 'Day';
    if (t < 0.80) return 'Sunset';
    return 'Night';
  }
}
