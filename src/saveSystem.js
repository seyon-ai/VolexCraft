// saveSystem.js — the only module that touches localStorage. Each world saves
// just its seed + player modifications (not the whole voxel grid), since
// terrain is fully deterministic from the seed and regenerates identically.
// A separate small index tracks metadata (name/seed/mode/last played) for
// every world so the main menu can list them without loading each one fully.

const INDEX_KEY = 'voxelcraft.worlds.index';
const WORLD_KEY_PREFIX = 'voxelcraft.world.';

function readIndex() {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('World index read failed:', err);
    return [];
  }
}

function writeIndex(list) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
    return true;
  } catch (err) {
    console.warn('World index write failed:', err);
    return false;
  }
}

function makeWorldId() {
  return 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

export const SaveSystem = {
  /** Worlds sorted most-recently-played first, for the main menu list. */
  listWorlds() {
    return readIndex().sort((a, b) => b.lastPlayed - a.lastPlayed);
  },

  /** Registers a new world in the index (the actual save data is written on first save()). */
  createWorldEntry({ name, seed, gameMode }) {
    const entry = { id: makeWorldId(), name, seed, gameMode, createdAt: Date.now(), lastPlayed: Date.now() };
    const list = readIndex();
    list.push(entry);
    writeIndex(list);
    return entry;
  },

  touchWorld(id) {
    const list = readIndex();
    const entry = list.find((w) => w.id === id);
    if (entry) { entry.lastPlayed = Date.now(); writeIndex(list); }
  },

  deleteWorld(id) {
    writeIndex(readIndex().filter((w) => w.id !== id));
    try { localStorage.removeItem(WORLD_KEY_PREFIX + id); } catch { /* ignore */ }
  },

  save(game) {
    if (!game.worldId) return false;
    try {
      const payload = {
        version: 2,
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
      localStorage.setItem(WORLD_KEY_PREFIX + game.worldId, JSON.stringify(payload));
      this.touchWorld(game.worldId);
      return true;
    } catch (err) {
      console.warn('Save failed:', err);
      return false;
    }
  },

  load(worldId) {
    try {
      const raw = localStorage.getItem(WORLD_KEY_PREFIX + worldId);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn('Load failed:', err);
      return null;
    }
  },
};
