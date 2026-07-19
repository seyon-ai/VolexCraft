// weather.js — rain, snow, and thunderstorms. Particles are a fixed-size
// "volume" that follows the player (wrapping/respawning individual particles
// rather than tracking world position), so it's cheap regardless of how far
// you've traveled and never needs to know about chunks.
//
// Honest scope note: no real per-droplet collision with terrain (droplets
// fall through blocks visually near the ground rather than splashing off
// roofs) — a fully correct version would need a heightmap lookup per
// particle per frame, which isn't worth the cost here.

import * as THREE from 'three';

export const WeatherType = { CLEAR: 'clear', RAIN: 'rain', SNOW: 'snow', THUNDER: 'thunder' };

const RAIN_COUNT = 700;
const SNOW_COUNT = 450;
const VOLUME_RADIUS = 22;
const VOLUME_HEIGHT = 18;

function buildParticles(count, isSnow) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * VOLUME_RADIUS * 2;
    positions[i * 3 + 1] = Math.random() * VOLUME_HEIGHT;
    positions[i * 3 + 2] = (Math.random() - 0.5) * VOLUME_RADIUS * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: isSnow ? 0xffffff : 0xaac4e0,
    size: isSnow ? 0.12 : 0.05,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false; // it's always centered on the camera area; culling would fight that
  return points;
}

export class WeatherSystem {
  constructor(scene) {
    this.scene = scene;
    this.enabled = true;
    this.type = WeatherType.CLEAR;
    this.intensity = 0; // eases toward 0 or 1 depending on `type`

    this.rain = buildParticles(RAIN_COUNT, false);
    this.snow = buildParticles(SNOW_COUNT, true);
    this.rain.visible = false;
    this.snow.visible = false;
    scene.add(this.rain, this.snow);

    this.windX = 0.6;
    this.windZ = 0.3;
    this._windPhase = Math.random() * Math.PI * 2;

    this._lightningTimer = 6 + Math.random() * 10;
    this._lightningFlash = 0;
    this._changeTimer = 20 + Math.random() * 40;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.rain.visible = enabled && this.type === WeatherType.RAIN || (enabled && this.type === WeatherType.THUNDER);
    this.snow.visible = enabled && this.type === WeatherType.SNOW;
  }

  /** Force a specific weather type (e.g. for testing, or a future "/weather" command). */
  setWeather(type) {
    this.type = type;
  }

  update(dt, playerPosition, isSnowyBiome) {
    if (!this.enabled) return;

    this._windPhase += dt * 0.05;
    this.windX = Math.cos(this._windPhase) * 0.8;
    this.windZ = Math.sin(this._windPhase * 0.7) * 0.8;

    this._changeTimer -= dt;
    if (this._changeTimer <= 0) {
      this._rollWeather(isSnowyBiome);
      this._changeTimer = 45 + Math.random() * 90;
    }

    const targetIntensity = this.type === WeatherType.CLEAR ? 0 : 1;
    this.intensity += (targetIntensity - this.intensity) * Math.min(1, dt * 0.4);

    const showRain = this.intensity > 0.02 && (this.type === WeatherType.RAIN || this.type === WeatherType.THUNDER);
    const showSnow = this.intensity > 0.02 && this.type === WeatherType.SNOW;
    this.rain.visible = showRain;
    this.snow.visible = showSnow;

    if (showRain) this._updateFall(this.rain, playerPosition, dt, 16);
    if (showSnow) this._updateFall(this.snow, playerPosition, dt, 1.4);

    this.rain.material.opacity = 0.55 * this.intensity;
    this.snow.material.opacity = 0.9 * this.intensity;

    if (this.type === WeatherType.THUNDER) {
      this._lightningTimer -= dt;
      if (this._lightningTimer <= 0) {
        this._lightningFlash = 1;
        this._lightningTimer = 5 + Math.random() * 12;
      }
    }
    this._lightningFlash = Math.max(0, this._lightningFlash - dt * 2.2);
  }

  _updateFall(points, playerPosition, dt, speed) {
    points.position.set(playerPosition.x, 0, playerPosition.z);
    const positions = points.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += this.windX * dt;
      positions[i + 1] -= speed * dt;
      positions[i + 2] += this.windZ * dt;
      if (positions[i + 1] < -2) {
        positions[i + 1] = VOLUME_HEIGHT;
        positions[i] = (Math.random() - 0.5) * VOLUME_RADIUS * 2;
        positions[i + 2] = (Math.random() - 0.5) * VOLUME_RADIUS * 2;
      }
    }
    points.geometry.attributes.position.needsUpdate = true;
  }

  _rollWeather(isSnowyBiome) {
    const r = Math.random();
    if (r < 0.55) this.type = WeatherType.CLEAR;
    else if (isSnowyBiome) this.type = WeatherType.SNOW;
    else if (r < 0.85) this.type = WeatherType.RAIN;
    else this.type = WeatherType.THUNDER;
  }

  /** 0..1 — how strongly a lightning flash should brighten the scene this frame. */
  getLightningFlash() { return this._lightningFlash; }

  isPrecipitating() { return this.enabled && this.intensity > 0.05 && this.type !== WeatherType.CLEAR; }

  disposeAll() {
    this.scene.remove(this.rain, this.snow);
    this.rain.geometry.dispose(); this.rain.material.dispose();
    this.snow.geometry.dispose(); this.snow.material.dispose();
  }
}
