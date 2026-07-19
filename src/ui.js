// ui.js — all DOM/HUD wiring in one place. Game logic never touches the DOM
// directly; it calls methods here, keeping rendering/physics code free of
// UI concerns (and making the HUD easy to restyle independently).

import { WorldSettings } from './settings.js';
import { ItemRegistry, isItem, ITEM_ICON_PATH } from './items.js';
import { iconTileFor, tintForAny } from './block.js';
import { tileImageUrl } from './textureAtlas.js';

export class UI {
  constructor() {
    this.dom = {
      mainMenu: document.getElementById('main-menu'),
      worldList: document.getElementById('world-list'),
      worldListEmpty: document.getElementById('world-list-empty'),
      showCreateWorldBtn: document.getElementById('btn-show-create-world'),
      createWorldOverlay: document.getElementById('create-world-overlay'),
      worldNameInput: document.getElementById('world-name-input'),
      seedInput: document.getElementById('seed-input'),
      modeSelect: document.getElementById('mode-select'),
      createWorldConfirmBtn: document.getElementById('btn-create-world-confirm'),
      cancelCreateWorldBtn: document.getElementById('btn-cancel-create-world'),

      hud: document.getElementById('hud'),
      hotbar: document.getElementById('hotbar'),
      toast: document.getElementById('toast'),
      underwaterOverlay: document.getElementById('underwater-overlay'),
      hearts: document.getElementById('hearts'),
      healthContainer: document.getElementById('health-container'),
      hungerIcons: document.getElementById('hunger-icons'),
      hungerContainer: document.getElementById('hunger-container'),
      crosshair: document.getElementById('crosshair'),
      breakRing: document.getElementById('break-ring'),
      debugPanel: document.getElementById('debug-panel'),
      modeLabel: document.getElementById('mode-label'),
      timeLabel: document.getElementById('time-label'),
      pauseBtn: document.getElementById('btn-pause'),
      fullscreenBtn: document.getElementById('btn-fullscreen'),

      pauseOverlay: document.getElementById('pause-overlay'),
      resumeBtn: document.getElementById('btn-resume'),
      saveQuitBtn: document.getElementById('btn-save-quit'),
      graphicsPresetSelect: document.getElementById('graphics-preset-select'),
      graphicsPresetExtremeOption: document.getElementById('graphics-preset-extreme-option'),
      renderDistanceSlider: document.getElementById('render-distance'),
      renderDistanceValue: document.getElementById('render-distance-value'),
      shadowsToggle: document.getElementById('shadows-toggle'),
      fogToggle: document.getElementById('fog-toggle'),
      forceToggle: document.getElementById('force-toggle'),
      sensitivitySlider: document.getElementById('sensitivity-slider'),

      deathOverlay: document.getElementById('death-overlay'),
      respawnBtn: document.getElementById('btn-respawn'),

      craftingOverlay: document.getElementById('crafting-overlay'),
      craftingList: document.getElementById('crafting-recipe-list'),
      closeCraftingBtn: document.getElementById('btn-close-crafting'),
      furnaceOverlay: document.getElementById('furnace-overlay'),
      furnaceList: document.getElementById('furnace-recipe-list'),
      closeFurnaceBtn: document.getElementById('btn-close-furnace'),

      inventoryBtn: document.getElementById('btn-inventory'),
      inventoryOverlay: document.getElementById('inventory-overlay'),
      inventoryBackpackGrid: document.getElementById('inventory-backpack-grid'),
      inventoryHotbarRow: document.getElementById('inventory-hotbar-row'),
      inventoryCraftingList: document.getElementById('inventory-crafting-list'),
      closeInventoryBtn: document.getElementById('btn-close-inventory'),
      dropSelectedBtn: document.getElementById('btn-drop-selected'),

      mobileControls: document.getElementById('mobile-controls'),
      joystickZone: document.getElementById('joystick-zone'),
      joystickBase: document.getElementById('joystick-base'),
      joystickThumb: document.getElementById('joystick-thumb'),
      btnJump: document.getElementById('btn-jump'),
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
    inventory.slots.slice(0, 9).forEach((slot, i) => {
      const { root, label } = this.hotbarSlotEls[i];
      root.classList.toggle('selected', i === inventory.selectedIndex);
      if (slot) {
        applyIconStyle(root, slot.id);
        root.classList.add('filled');
        label.textContent = slot.count === Infinity ? '' : String(slot.count);
        root.title = inventory.itemName(slot.id);
      } else {
        root.classList.remove('filled');
        clearIconStyle(root);
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

  updateHunger(hunger, maxHunger, visible) {
    this.dom.hungerContainer.style.display = visible ? 'flex' : 'none';
    if (!visible) return;
    const totalIcons = maxHunger / 2;
    this.dom.hungerIcons.innerHTML = '';
    for (let i = 0; i < totalIcons; i++) {
      const icon = document.createElement('div');
      const filled = hunger >= (i + 1) * 2;
      const half = !filled && hunger > i * 2;
      icon.className = `hunger-icon ${filled ? 'full' : half ? 'half' : 'empty'}`;
      this.dom.hungerIcons.appendChild(icon);
    }
  }

  updateModeLabel(mode) {
    this.dom.modeLabel.textContent = mode === 'creative' ? 'Creative' : 'Survival';
  }

  updateTimeLabel(phaseLabel) {
    this.dom.timeLabel.textContent = phaseLabel;
  }

  setUnderwaterOverlay(active) {
    this.dom.underwaterOverlay.classList.toggle('active', active);
  }

  showToast(message, durationMs = 1800) {
    clearTimeout(this._toastTimer);
    this.dom.toast.textContent = message;
    this.dom.toast.classList.add('visible');
    this._toastTimer = setTimeout(() => this.dom.toast.classList.remove('visible'), durationMs);
  }

  updateBreakProgress(fraction) {
    this.dom.breakRing.classList.toggle('active', fraction > 0);
    this.dom.breakRing.style.setProperty('--progress', String(fraction));
  }

  updateDebugPanel(text) {
    this.dom.debugPanel.textContent = text;
  }

  setPointerLocked(_locked) {
    // Reserved for pointer-lock-specific HUD tweaks; pausing itself is handled
    // explicitly by Game (desktop: unlock triggers pause, mobile: pause button).
  }

  showMainMenu(worlds, onPlay, onDelete) {
    this.dom.mainMenu.style.display = 'flex';
    this.dom.hud.style.display = 'none';
    this.renderWorldList(worlds, onPlay, onDelete);
  }

  renderWorldList(worlds, onPlay, onDelete) {
    this.dom.worldList.innerHTML = '';
    this.dom.worldListEmpty.style.display = worlds.length === 0 ? 'block' : 'none';
    for (const world of worlds) {
      const card = document.createElement('div');
      card.className = 'world-card';

      const info = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'world-card-name';
      name.textContent = world.name;
      const meta = document.createElement('div');
      meta.className = 'world-card-meta';
      const modeLabel = world.gameMode === 'creative' ? 'Creative' : 'Survival';
      meta.textContent = `${modeLabel} · Seed ${world.seed} · Last played ${formatRelativeTime(world.lastPlayed)}`;
      info.appendChild(name);
      info.appendChild(meta);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'world-card-delete';
      deleteBtn.textContent = '✕';
      deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); onDelete(world.id); });

      card.appendChild(info);
      card.appendChild(deleteBtn);
      card.addEventListener('click', () => onPlay(world.id));
      this.dom.worldList.appendChild(card);
    }
  }

  showCreateWorldOverlay() {
    this.dom.createWorldOverlay.style.display = 'flex';
    this.dom.worldNameInput.value = '';
    this.dom.seedInput.value = '';
    this.dom.worldNameInput.focus();
  }

  hideCreateWorldOverlay() {
    this.dom.createWorldOverlay.style.display = 'none';
    document.activeElement?.blur();
  }

  hideMainMenu() {
    this.dom.mainMenu.style.display = 'none';
    this.dom.hud.style.display = 'block';
    document.activeElement?.blur();
  }

  showPause() { this.dom.pauseOverlay.style.display = 'flex'; }
  hidePause() { this.dom.pauseOverlay.style.display = 'none'; document.activeElement?.blur(); }

  showDeathScreen() { this.dom.deathOverlay.style.display = 'flex'; }
  hideDeathScreen() { this.dom.deathOverlay.style.display = 'none'; document.activeElement?.blur(); }

  bindCraftingClose(onClose) { this.dom.closeCraftingBtn.addEventListener('click', onClose); }
  bindFurnaceClose(onClose) { this.dom.closeFurnaceBtn.addEventListener('click', onClose); }

  bindInventoryOpen(onOpen) { this.dom.inventoryBtn.addEventListener('click', onOpen); }
  bindInventoryClose(onClose) { this.dom.closeInventoryBtn.addEventListener('click', onClose); }
  bindDropSelected(onDrop) { this.dom.dropSelectedBtn.addEventListener('click', onDrop); }

  showInventoryPanel() { this.dom.inventoryOverlay.style.display = 'flex'; }
  hideInventoryPanel() { this.dom.inventoryOverlay.style.display = 'none'; document.activeElement?.blur(); }

  /**
   * Renders the backpack grid + a hotbar preview row. Clicking any slot swaps
   * its contents with the currently-selected hotbar slot (a simple one-click
   * "quick move" in place of full drag-and-drop).
   */
  renderInventoryScreen(inventory, onSlotClick) {
    this._renderInvGrid(this.dom.inventoryBackpackGrid, inventory, 9, inventory.slots.length, onSlotClick);
    this._renderInvGrid(this.dom.inventoryHotbarRow, inventory, 0, 9, onSlotClick);
  }

  _renderInvGrid(container, inventory, startIndex, endIndex, onSlotClick) {
    container.innerHTML = '';
    for (let i = startIndex; i < endIndex; i++) {
      const slot = inventory.slots[i];
      const el = document.createElement('div');
      el.className = 'inv-slot';
      if (i === inventory.selectedIndex) el.classList.add('selected');
      if (slot) {
        el.classList.add('filled');
        applyIconStyle(el, slot.id);
        el.title = inventory.itemName(slot.id);
        if (slot.count !== Infinity) {
          const count = document.createElement('span');
          count.className = 'inv-count';
          count.textContent = String(slot.count);
          el.appendChild(count);
        }
      }
      el.addEventListener('click', () => onSlotClick(i));
      container.appendChild(el);
    }
  }

  showCraftingPanel() { this.dom.craftingOverlay.style.display = 'flex'; }
  hideCraftingPanel() { this.dom.craftingOverlay.style.display = 'none'; document.activeElement?.blur(); }
  showFurnacePanel() { this.dom.furnaceOverlay.style.display = 'flex'; }
  hideFurnacePanel() { this.dom.furnaceOverlay.style.display = 'none'; document.activeElement?.blur(); }

  /** Renders a recipe list (shared by crafting table and furnace panels). */
  renderRecipeList(listEl, recipes, inventory, actionLabel, onAction) {
    listEl.innerHTML = '';
    for (const recipe of recipes) {
      const card = document.createElement('div');
      card.className = 'recipe-card';

      const info = document.createElement('div');
      info.className = 'recipe-info';
      const swatch = document.createElement('div');
      swatch.className = 'recipe-swatch';
      applyIconStyle(swatch, recipe.result.id);
      info.appendChild(swatch);

      const text = document.createElement('div');
      const title = document.createElement('div');
      title.textContent = `${inventory.itemName(recipe.result.id)} x${recipe.result.count}`;
      const needs = document.createElement('div');
      needs.className = 'recipe-needs';
      needs.innerHTML = recipe.needs.map((n) => {
        const have = inventory.countItem(n.id);
        const short = have < n.count;
        return `<span class="${short ? 'short' : ''}">${inventory.itemName(n.id)} ${have}/${n.count}</span>`;
      }).join(' &nbsp; ');
      text.appendChild(title);
      text.appendChild(needs);
      info.appendChild(text);

      const btn = document.createElement('button');
      btn.className = 'recipe-make-btn';
      btn.textContent = actionLabel;
      const ok = hasAll(inventory, recipe.needs);
      btn.disabled = !ok;
      btn.addEventListener('click', () => onAction(recipe));

      card.appendChild(info);
      card.appendChild(btn);
      listEl.appendChild(card);
    }
  }

  showMobileControls(show) {
    this.dom.mobileControls.style.display = show ? 'block' : 'none';
    this.dom.crosshair.style.display = show ? 'none' : 'block';
  }

  isTypingInInput() {
    const el = document.activeElement;
    if (!el) return false;
    const isFormEl = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
    if (!isFormEl) return false;
    return el.offsetParent !== null; // ignore focus left behind on a hidden (display:none) element
  }

  bindMenuButtons({ onShowCreateWorld, onCreateWorldConfirm, onCancelCreateWorld, onResume, onSaveQuit, onRespawn, onPause }) {
    this.dom.showCreateWorldBtn.addEventListener('click', onShowCreateWorld);
    this.dom.createWorldConfirmBtn.addEventListener('click', () => {
      onCreateWorldConfirm(this.dom.worldNameInput.value, this.dom.seedInput.value, this.dom.modeSelect.value);
    });
    this.dom.cancelCreateWorldBtn.addEventListener('click', onCancelCreateWorld);
    this.dom.resumeBtn.addEventListener('click', onResume);
    this.dom.saveQuitBtn.addEventListener('click', onSaveQuit);
    this.dom.respawnBtn.addEventListener('click', onRespawn);
    this.dom.pauseBtn.addEventListener('click', onPause);
  }

  bindSettings({ onRenderDistanceChange, onShadowsChange, onFogChange, onSensitivityChange, onGraphicsPresetChange, onForceToggleChange }) {
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
    this.dom.graphicsPresetSelect.addEventListener('change', (e) => onGraphicsPresetChange(e.target.value));
    this.dom.forceToggle.addEventListener('change', (e) => onForceToggleChange(e.target.checked));
  }

  setSettingsValues({ renderDistance, shadows, fog }) {
    this.dom.renderDistanceSlider.value = renderDistance;
    this.dom.renderDistanceValue.textContent = renderDistance;
    this.dom.shadowsToggle.checked = shadows;
    this.dom.fogToggle.checked = fog;
  }

  setGraphicsPresetValue(key) {
    this.dom.graphicsPresetSelect.value = key;
  }

  hideExtremePresetOption() {
    this.dom.graphicsPresetExtremeOption.remove();
  }

  getMobileElements() {
    return {
      joystickZone: this.dom.joystickZone,
      joystickBase: this.dom.joystickBase,
      joystickThumb: this.dom.joystickThumb,
      lookZone: this.dom.canvasContainer,
      btnJump: this.dom.btnJump,
    };
  }
}

function swatchColorFor(id) {
  return tintForAny(id);
}

/** Real image URL for a slot's contents, or null to fall back to a flat color. */
function iconUrlFor(id) {
  if (isItem(id)) {
    const image = ItemRegistry[id]?.display?.image;
    return image ? ITEM_ICON_PATH + image : null;
  }
  const tile = iconTileFor(id);
  return tile !== null ? tileImageUrl(tile) : null;
}

/** Sets the CSS custom properties an icon element reads for its background (image over color fallback). */
function applyIconStyle(el, id) {
  el.style.setProperty('--swatch-color', swatchColorFor(id));
  const url = iconUrlFor(id);
  el.style.setProperty('--swatch-image', url ? `url("${url}")` : 'none');
}

function clearIconStyle(el) {
  el.style.removeProperty('--swatch-color');
  el.style.removeProperty('--swatch-image');
}

function formatRelativeTime(timestamp) {
  const seconds = Math.max(0, (Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = hours / 24;
  return `${Math.floor(days)}d ago`;
}

function hasAll(inventory, needs) {
  return needs.every((n) => inventory.countItem(n.id) >= n.count);
}
