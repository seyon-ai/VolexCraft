// ui.js — all DOM/HUD wiring in one place. Game logic never touches the DOM
// directly; it calls methods here, keeping rendering/physics code free of
// UI concerns (and making the HUD easy to restyle independently).

import { BlockRegistry } from './block.js';
import { WorldSettings } from './settings.js';

export class UI {
  constructor() {
    this.dom = {
      mainMenu: document.getElementById('main-menu'),
      continueBtn: document.getElementById('btn-continue'),
      newWorldBtn: document.getElementById('btn-new-world'),
      seedInput: document.getElementById('seed-input'),
      modeSelect: document.getElementById('mode-select'),

      hud: document.getElementById('hud'),
      hotbar: document.getElementById('hotbar'),
      hearts: document.getElementById('hearts'),
      healthContainer: document.getElementById('health-container'),
      crosshair: document.getElementById('crosshair'),
      debugPanel: document.getElementById('debug-panel'),
      modeLabel: document.getElementById('mode-label'),
      timeLabel: document.getElementById('time-label'),
      pauseBtn: document.getElementById('btn-pause'),

      pauseOverlay: document.getElementById('pause-overlay'),
      resumeBtn: document.getElementById('btn-resume'),
      saveQuitBtn: document.getElementById('btn-save-quit'),
      renderDistanceSlider: document.getElementById('render-distance'),
      renderDistanceValue: document.getElementById('render-distance-value'),
      shadowsToggle: document.getElementById('shadows-toggle'),
      fogToggle: document.getElementById('fog-toggle'),
      sensitivitySlider: document.getElementById('sensitivity-slider'),

      deathOverlay: document.getElementById('death-overlay'),
      respawnBtn: document.getElementById('btn-respawn'),

      mobileControls: document.getElementById('mobile-controls'),
      joystickZone: document.getElementById('joystick-zone'),
      joystickThumb: document.getElementById('joystick-thumb'),
      lookZone: document.getElementById('look-zone'),
      btnJump: document.getElementById('btn-jump'),
      btnBreak: document.getElementById('btn-break'),
      btnPlace: document.getElementById('btn-place'),
      canvasContainer: document.getElementById('canvas-container'),
    };

    this.hotbarSlotEls = [];
    this._buildHotbar();
  }

  _buildHotbar() {
    this.dom.hotbar.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';
      slot.dataset.index = String(i);
      const label = document.createElement('span');
      label.className = 'hotbar-count';
      slot.appendChild(label);
      const key = document.createElement('span');
      key.className = 'hotbar-key';
      key.textContent = String(i === 8 ? 9 : i + 1);
      slot.appendChild(key);
      this.dom.hotbar.appendChild(slot);
      this.hotbarSlotEls.push({ root: slot, label });
    }
  }

  bindHotbarSelection(onSelect) {
    this.dom.hotbar.addEventListener('pointerdown', (e) => {
      const slotEl = e.target.closest('.hotbar-slot');
      if (!slotEl) return;
      onSelect(parseInt(slotEl.dataset.index, 10));
    });
  }

  updateHotbar(inventory) {
    inventory.slots.forEach((slot, i) => {
      const { root, label } = this.hotbarSlotEls[i];
      root.classList.toggle('selected', i === inventory.selectedIndex);
      if (slot) {
        const def = BlockRegistry[slot.blockId];
        root.style.setProperty('--swatch', blockSwatchColor(slot.blockId));
        root.classList.add('filled');
        label.textContent = slot.count === Infinity ? '' : String(slot.count);
        root.title = def.name;
      } else {
        root.classList.remove('filled');
        root.style.removeProperty('--swatch');
        label.textContent = '';
        root.title = '';
      }
    });
  }

  updateHealth(health, maxHealth, visible) {
    this.dom.healthContainer.style.display = visible ? 'flex' : 'none';
    if (!visible) return;
    const totalHearts = maxHealth / 2;
    this.dom.hearts.innerHTML = '';
    for (let i = 0; i < totalHearts; i++) {
      const heart = document.createElement('div');
      const filled = health >= (i + 1) * 2;
      const half = !filled && health > i * 2;
      heart.className = `heart ${filled ? 'full' : half ? 'half' : 'empty'}`;
      this.dom.hearts.appendChild(heart);
    }
  }

  updateModeLabel(mode) {
    this.dom.modeLabel.textContent = mode === 'creative' ? 'Creative' : 'Survival';
  }

  updateTimeLabel(phaseLabel) {
    this.dom.timeLabel.textContent = phaseLabel;
  }

  updateDebugPanel(text) {
    this.dom.debugPanel.textContent = text;
  }

  setPointerLocked(_locked) {
    // Reserved for pointer-lock-specific HUD tweaks; pausing itself is handled
    // explicitly by Game (desktop: unlock triggers pause, mobile: pause button).
  }

  showMainMenu({ hasSave }) {
    this.dom.mainMenu.style.display = 'flex';
    this.dom.continueBtn.style.display = hasSave ? 'block' : 'none';
    this.dom.hud.style.display = 'none';
  }

  hideMainMenu() {
    this.dom.mainMenu.style.display = 'none';
    this.dom.hud.style.display = 'block';
  }

  showPause() { this.dom.pauseOverlay.style.display = 'flex'; }
  hidePause() { this.dom.pauseOverlay.style.display = 'none'; }

  showDeathScreen() { this.dom.deathOverlay.style.display = 'flex'; }
  hideDeathScreen() { this.dom.deathOverlay.style.display = 'none'; }

  showMobileControls(show) {
    this.dom.mobileControls.style.display = show ? 'block' : 'none';
    this.dom.crosshair.style.display = show ? 'none' : 'block';
  }

  isTypingInInput() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  }

  bindMenuButtons({ onContinue, onNewWorld, onResume, onSaveQuit, onRespawn, onPause }) {
    this.dom.continueBtn.addEventListener('click', onContinue);
    this.dom.newWorldBtn.addEventListener('click', () => onNewWorld(this.dom.seedInput.value, this.dom.modeSelect.value));
    this.dom.resumeBtn.addEventListener('click', onResume);
    this.dom.saveQuitBtn.addEventListener('click', onSaveQuit);
    this.dom.respawnBtn.addEventListener('click', onRespawn);
    this.dom.pauseBtn.addEventListener('click', onPause);
  }

  bindSettings({ onRenderDistanceChange, onShadowsChange, onFogChange, onSensitivityChange }) {
    this.dom.renderDistanceSlider.min = WorldSettings.MIN_RENDER_DISTANCE;
    this.dom.renderDistanceSlider.max = WorldSettings.MAX_RENDER_DISTANCE;
    this.dom.renderDistanceSlider.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      this.dom.renderDistanceValue.textContent = v;
      onRenderDistanceChange(v);
    });
    this.dom.shadowsToggle.addEventListener('change', (e) => onShadowsChange(e.target.checked));
    this.dom.fogToggle.addEventListener('change', (e) => onFogChange(e.target.checked));
    this.dom.sensitivitySlider.addEventListener('input', (e) => onSensitivityChange(parseFloat(e.target.value)));
  }

  setSettingsValues({ renderDistance, shadows, fog }) {
    this.dom.renderDistanceSlider.value = renderDistance;
    this.dom.renderDistanceValue.textContent = renderDistance;
    this.dom.shadowsToggle.checked = shadows;
    this.dom.fogToggle.checked = fog;
  }

  getMobileElements() {
    return {
      root: this.dom.mobileControls,
      joystickZone: this.dom.joystickZone,
      joystickThumb: this.dom.joystickThumb,
      lookZone: this.dom.canvasContainer,
      btnJump: this.dom.btnJump,
      btnBreak: this.dom.btnBreak,
      btnPlace: this.dom.btnPlace,
    };
  }
}

function blockSwatchColor(blockId) {
  const colors = {
    1: '#5a9e3c', 2: '#78543c', 3: '#828286', 4: '#e0cb8e',
    6: '#67482a', 7: '#3a7830', 9: '#e8eef8',
  };
  return colors[blockId] || '#999';
}
