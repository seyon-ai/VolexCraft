// settings.js — single source of truth for tunables across every system.
// Keeping these centralized means terrain, rendering, and controls can be
// retuned without hunting through unrelated modules.

export const WorldSettings = {
  CHUNK_SIZE: 16,       // blocks along X and Z
  CHUNK_HEIGHT: 128,    // blocks along Y
  SEA_LEVEL: 34,
  RENDER_DISTANCE: 5,   // chunks, radius around player (configurable at runtime)
  MAX_RENDER_DISTANCE: 10,
  MIN_RENDER_DISTANCE: 2,
  CHUNKS_BUILT_PER_FRAME: 1, // throttles chunk mesh builds to avoid frame drops
};

export const GraphicsSettings = {
  shadows: true,
  shadowMapSize: 1024,
  fogEnabled: true,
  fogNear: 60,
  fogFar: 140,
  pixelRatioCap: 1.5,
  antialias: true,
};

export const PlayerSettings = {
  eyeHeight: 1.62,
  width: 0.6,
  height: 1.8,
  walkSpeed: 4.3,
  sprintSpeed: 7.0,
  flySpeed: 9.0,
  flySprintSpeed: 16.0,
  jumpVelocity: 8.0,
  gravity: -24.0,
  maxFallSpeed: -40,
  fallDamageThreshold: 4.0, // blocks fallen before damage starts
};

export const MobileSettings = {
  lookSensitivity: 0.0028,
  joystickDeadzone: 0.12,
};

export const DesktopSettings = {
  mouseSensitivity: 0.0022,
};

export const TimeSettings = {
  dayLengthSeconds: 600, // full day/night cycle length
  timeScale: 1.0,
  startTime: 0.3, // 0..1, fraction of day (0.3 ~ mid-morning)
};

export function isMobileDevice() {
  const ua = navigator.userAgent || '';
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  return touch && /Mobi|Android|iPhone|iPad|iPod/i.test(ua) || (touch && window.innerWidth < 900);
}
