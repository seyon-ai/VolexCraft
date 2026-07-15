// saveSystem.js — the only module that touches localStorage. Saves just the
// world seed + player modifications (not the whole voxel grid), since terrain
// is fully deterministic from the seed and only regenerates identically.

const SAVE_KEY = 'voxelcraft.save.v1';

export const SaveSystem = {
  hasSave() {
    try { return localStorage.getItem(SAVE_KEY) !== null; }
    catch { return false; }
  },

  save(game) {
    try {
      const payload = {
        version: 1,
        savedAt: Date.now(),
        seed: game.world.seed,
        modifications: game.world.serializeModifications(),
        player: {
          position: game.player.position.toArray(),
          yaw: game.controls.yaw,
          pitch: game.controls.pitch,
          health: game.player.health,
          hunger: game.player.hunger,
        },
        inventory: game.inventory.serialize(),
        gameMode: game.gameMode.mode,
        time: game.timeSystem.time,
        renderDistance: game.world.renderDistance,
        graphics: { shadows: game.graphicsOptions.shadows, fog: game.graphicsOptions.fog },
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      return true;
    } catch (err) {
      console.warn('Save failed:', err);
      return false;
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn('Load failed:', err);
      return null;
    }
  },

  clear() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  },
};
