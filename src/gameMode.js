// gameMode.js — the small set of rules that differ between Survival and
// Creative. Kept as one manager so other systems (player, inventory, ui)
// just ask it questions instead of branching on a string everywhere.

export const GameMode = {
  SURVIVAL: 'survival',
  CREATIVE: 'creative',
};

export class GameModeManager {
  constructor(mode = GameMode.SURVIVAL) {
    this.mode = mode;
    this.listeners = [];
  }

  set(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    for (const cb of this.listeners) cb(mode);
  }

  toggle() {
    this.set(this.mode === GameMode.SURVIVAL ? GameMode.CREATIVE : GameMode.SURVIVAL);
  }

  onChange(cb) { this.listeners.push(cb); }

  isCreative() { return this.mode === GameMode.CREATIVE; }
  isSurvival() { return this.mode === GameMode.SURVIVAL; }

  canTakeDamage() { return this.isSurvival(); }
  hasFallDamage() { return this.isSurvival(); }
  breaksInstantly() { return this.isCreative(); }
  canFly() { return this.isCreative(); }
  hasUnlimitedBlocks() { return this.isCreative(); }
}
