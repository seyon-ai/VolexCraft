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
  CHUNKS_LOADED_PER_FRAME: 1, // throttles chunk *generation* (noise+caves+ore) — keep at 1; caves/ore-veins made generation notably heavier per chunk
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
  stepHeight: 1.05, // auto-step: walking into a single block-high ledge steps up onto it
};

export const MobileSettings = {
  lookSensitivity: 0.0022,
  joystickDeadzone: 0.12,
};

export const DesktopSettings = {
  mouseSensitivity: 0.0012,
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

/**
 * Graphics presets. "extreme" is desktop-only by convention (gated in UI/main.js,
 * not enforced here) since it pushes render distance and shadow resolution hard.
 * Each preset is applied wholesale by main.js's _applyGraphicsPreset().
 */
export const GraphicsPreset = { LOW: 'low', MEDIUM: 'medium', HIGH: 'high', ULTRA: 'ultra', EXTREME: 'extreme' };

export const GRAPHICS_PRESETS = {
  [GraphicsPreset.LOW]: {
    renderDistance: 3, shadows: false, shadowMapSize: 512, fog: true,
    bloom: false, ssao: false, colorGrade: false, waterShader: false,
    weather: false, clouds: 0, starCount: 300, pixelRatioCap: 1.0,
  },
  [GraphicsPreset.MEDIUM]: {
    renderDistance: 4, shadows: true, shadowMapSize: 1024, fog: true,
    bloom: true, ssao: false, colorGrade: true, waterShader: true,
    weather: true, clouds: 10, starCount: 600, pixelRatioCap: 1.25,
  },
  [GraphicsPreset.HIGH]: {
    renderDistance: 5, shadows: true, shadowMapSize: 2048, fog: true,
    bloom: true, ssao: true, colorGrade: true, waterShader: true,
    weather: true, clouds: 18, starCount: 900, pixelRatioCap: 1.5,
  },
  [GraphicsPreset.ULTRA]: {
    renderDistance: 6, shadows: true, shadowMapSize: 2048, fog: true,
    bloom: true, ssao: true, colorGrade: true, waterShader: true,
    weather: true, clouds: 26, starCount: 1200, pixelRatioCap: 1.75,
  },
  [GraphicsPreset.EXTREME]: {
    renderDistance: 8, shadows: true, shadowMapSize: 4096, fog: true,
    bloom: true, ssao: true, colorGrade: true, waterShader: true,
    weather: true, clouds: 36, starCount: 1600, pixelRatioCap: 2.0,
  },
};
