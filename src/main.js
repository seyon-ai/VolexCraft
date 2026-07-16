// main.js — composition root. Creates every subsystem, owns the render/update
// loop, and mediates the handful of cross-system actions (break/place,
// respawn, mode toggle, save/load) that don't belong inside any single
// system. Individual systems stay decoupled by only talking through here.

import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { GameModeManager, GameMode } from './gameMode.js';
import { Inventory } from './inventory.js';
import { TimeSystem } from './timeSystem.js';
import { UI } from './ui.js';
import { DesktopControls } from './controls.js';
import { MobileControls } from './mobileControls.js';
import { SaveSystem } from './saveSystem.js';
import { BlockId, dropFor, isUnbreakable, requiredPickaxeTier, interactiveKind } from './block.js';
import { pickaxeTier, weaponDamage, isFood, foodHealAmount } from './items.js';
import { MobManager } from './mobs.js';
import { DroppedItemManager } from './droppedItems.js';
import { CRAFTING_RECIPES, SMELTING_RECIPES, craftOnce, smeltOnce } from './crafting.js';
import { GraphicsSettings, WorldSettings, isMobileDevice, GraphicsPreset, GRAPHICS_PRESETS } from './settings.js';
import { hashStringSeed } from './utils.js';
import { PostProcessing } from './postprocessing.js';

const BREAK_TIME_SURVIVAL = 0.35; // seconds to break a block by hand in Survival
const CREATIVE_BREAK_INTERVAL = 0.15; // seconds between breaks while held in Creative (rate cap, not instant-infinite)
const ATTACK_COOLDOWN = 0.45; // seconds between melee swings
const ATTACK_RANGE = 4;

class Game {
  constructor() {
    this.ui = new UI();
    this.clock = new THREE.Clock();
    this.mobile = isMobileDevice();
    this.running = false;
    this.paused = false;

    this._initRenderer();
    this._initBlockOutline();
    this._raycaster = new THREE.Raycaster();
    this.postFX = new PostProcessing(this.renderer, this.scene, this.camera);
    this._fpsHistory = [];
    this._adaptiveQualityCooldown = 0;

    if (this.mobile) {
      this.controls = new MobileControls(this, this.ui.getMobileElements());
    } else {
      this.controls = new DesktopControls(this.camera, this.renderer.domElement, this);
    }
    this.ui.showMobileControls(false);

    this.graphicsOptions = { shadows: GraphicsSettings.shadows, fog: GraphicsSettings.fogEnabled };
    this._applyGraphicsPreset(this.mobile ? GraphicsPreset.MEDIUM : GraphicsPreset.HIGH);

    this._breakProgress = 0;
    this._breakTargetKey = null;
    this._breakFraction = 0;
    this._attackCooldownTimer = 0;
    this._openPanel = null; // 'crafting' | 'furnace' | null
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this._fps = 0;
    this._debugVisible = false;

    window.addEventListener('resize', () => this._onResize());
    this.ui.bindMenuButtons({
      onContinue: () => this._continueSavedWorld(),
      onNewWorld: (seed, mode) => this._startNewWorld(seed, mode),
      onResume: () => this._resume(),
      onSaveQuit: () => this._saveAndQuit(),
      onRespawn: () => this._respawnPlayer(),
      onPause: () => this._pause(),
    });
    this.ui.bindSettings({
      onRenderDistanceChange: (v) => this.world && this.world.setRenderDistance(v),
      onShadowsChange: (v) => this._setShadows(v),
      onFogChange: (v) => this._setFog(v),
      onSensitivityChange: (v) => this._setSensitivity(v),
      onGraphicsPresetChange: (key) => this._applyGraphicsPreset(key),
    });
    if (this.mobile) this.ui.hideExtremePresetOption();

    this.ui.bindHotbarSelection((index) => {
      if (this.inventory) this.inventory.select(index);
    });

    this.ui.bindCraftingClose(() => this._closePanel());
    this.ui.bindFurnaceClose(() => this._closePanel());
    this.ui.bindInventoryOpen(() => this._openInventoryScreen());
    this.ui.bindInventoryClose(() => this._closePanel());
    this.ui.dom.fullscreenBtn.addEventListener('click', () => this._toggleFullscreen());

    document.addEventListener('keydown', (e) => {
      if (e.code === 'F3') { this._debugVisible = !this._debugVisible; this.ui.dom.debugPanel.classList.toggle('visible', this._debugVisible); }
    });

    this.ui.showMainMenu({ hasSave: SaveSystem.hasSave() });
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: GraphicsSettings.antialias });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, GraphicsSettings.pixelRatioCap));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = GraphicsSettings.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById('canvas-container').appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 400);
    this.camera.rotation.order = 'YXZ';
    this.scene = new THREE.Scene();
  }

  _initBlockOutline() {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    const mat = new THREE.LineBasicMaterial({ color: 0x0a0a0a, linewidth: 2 });
    this.outline = new THREE.LineSegments(geo, mat);
    this.outline.visible = false;
    this.scene.add(this.outline);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.postFX.setSize(window.innerWidth, window.innerHeight);
  }

  // ---------------- world lifecycle ----------------

  _startNewWorld(seedText, modeStr) {
    SaveSystem.clear();
    const seed = seedText && seedText.trim().length > 0
      ? hashStringSeed(seedText.trim())
      : (Math.random() * 0xffffffff) >>> 0;
    this._buildWorld(seed, modeStr === 'creative' ? GameMode.CREATIVE : GameMode.SURVIVAL);

    const spawnX = 0, spawnZ = 0;
    const spawnY = this.world.getHeightAt(spawnX, spawnZ) + 2;
    this.player.position.set(spawnX + 0.5, spawnY, spawnZ + 0.5);
    this.timeSystem.setTime(0.3);
    this._afterWorldReady();
  }

  _continueSavedWorld() {
    const data = SaveSystem.load();
    if (!data) return this._startNewWorld('', 'survival');

    this._buildWorld(data.seed, data.gameMode === 'creative' ? GameMode.CREATIVE : GameMode.SURVIVAL);
    this.world.loadModifications(data.modifications || []);
    this.world.setRenderDistance(data.renderDistance || WorldSettings.RENDER_DISTANCE);

    if (data.player) {
      this.player.position.set(...data.player.position);
      this.controls.yaw = data.player.yaw || 0;
      this.controls.pitch = data.player.pitch || 0;
      this.player.health = data.player.health ?? this.player.maxHealth;
      this.player.hunger = data.player.hunger ?? this.player.maxHunger;
    }
    this.inventory.loadFrom(data.inventory);
    this.timeSystem.setTime(data.time ?? 0.3);
    if (data.graphics) {
      this._setShadows(data.graphics.shadows);
      this._setFog(data.graphics.fog);
    }
    this._afterWorldReady();
  }

  _buildWorld(seed, mode) {
    // Tear down a previous session's objects if the player quit back to menu.
    if (this.world) this._teardownWorld();

    this.world = new World(this.scene, seed);
    this.world.setRenderDistance(WorldSettings.RENDER_DISTANCE);
    this.gameMode = new GameModeManager(mode);
    this.player = new Player(this.world);
    this.inventory = new Inventory(this.gameMode);
    this.timeSystem = new TimeSystem(this.scene);
    this.mobManager = new MobManager(this.scene, this.world);
    this.droppedItemManager = new DroppedItemManager(this.scene, this.world);

    this.gameMode.onChange((m) => {
      this.player.flying = false;
      this.ui.updateModeLabel(m);
      this.ui.updateHealth(this.player.health, this.player.maxHealth, this.gameMode.isSurvival());
      this.ui.updateHunger(this.player.hunger, this.player.maxHunger, this.gameMode.isSurvival());
    });

    this.ui.setSettingsValues({
      renderDistance: this.world.renderDistance,
      shadows: this.graphicsOptions.shadows,
      fog: this.graphicsOptions.fog,
    });
    this.ui.updateModeLabel(this.gameMode.mode);
    this._applyGraphicsPreset(this.graphicsPreset);
  }

  _teardownWorld() {
    for (const chunk of this.world.chunks.values()) chunk.dispose();
    if (this.timeSystem) {
      this.scene.remove(
        this.timeSystem.sunLight, this.timeSystem.sunLight.target, this.timeSystem.moonLight,
        this.timeSystem.ambientLight, this.timeSystem.sunSprite, this.timeSystem.moonSprite, this.timeSystem.stars
      );
    }
    if (this.mobManager) this.mobManager.disposeAll();
    if (this.droppedItemManager) this.droppedItemManager.disposeAll();
  }

  _afterWorldReady() {
    this.ui.hideMainMenu();
    this.ui.hideDeathScreen();
    this.ui.hidePause();
    if (this.mobile) this.ui.showMobileControls(true);
    this.running = true;
    this.paused = false;
    this.clock.start();
    if (!this._loopStarted) {
      this._loopStarted = true;
      this._lastAutosave = performance.now();
      requestAnimationFrame(() => this._animate());
      window.addEventListener('pagehide', () => { if (this.running) SaveSystem.save(this); });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.running) SaveSystem.save(this);
      });
    }
  }

  _toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  // ---------------- pause / settings ----------------

  _pause() {
    if (!this.running) return;
    this.paused = true;
    this.ui.showPause();
    if (!this.mobile) document.exitPointerLock();
    this._setMobileControlsVisible(false);
  }

  _resume() {
    this.paused = false;
    this.ui.hidePause();
    this._setMobileControlsVisible(true);
  }

  _saveAndQuit() {
    SaveSystem.save(this);
    this.paused = false;
    this.running = false;
    this.ui.hidePause();
    if (this.mobile) this.ui.showMobileControls(false);
    this.ui.showMainMenu({ hasSave: true });
  }

  _setShadows(v) {
    this.graphicsOptions.shadows = v;
    this.renderer.shadowMap.enabled = v;
    if (this.timeSystem) this.timeSystem.sunLight.castShadow = v;
  }

  _setFog(v) {
    this.graphicsOptions.fog = v;
    if (this.scene) this.scene.fog = v ? new THREE.Fog(0xbfe3f5, GraphicsSettings.fogNear, GraphicsSettings.fogFar) : null;
  }

  _setSensitivity(multiplier) {
    this._sensitivityMultiplier = multiplier; // applied at input-poll time
  }

  /** Applies one of settings.js's GRAPHICS_PRESETS wholesale — the single place
   * a preset touches the renderer, post-processing, shadows, fog, water quality,
   * render distance, and (once built) weather/clouds. */
  _applyGraphicsPreset(key) {
    const preset = GRAPHICS_PRESETS[key];
    if (!preset) return;
    this.graphicsPreset = key;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.pixelRatioCap));
    this.postFX.applyPreset(preset, this.mobile);

    this._setShadows(preset.shadows);
    if (this.timeSystem) this.timeSystem.setShadowMapSize(preset.shadowMapSize);
    this._setFog(preset.fog);

    if (this.world) this.world.setRenderDistance(preset.renderDistance);
    if (this.world) this.world.setWaterQuality(preset.waterShader);

    if (this.weatherSystem) this.weatherSystem.setEnabled(preset.weather);
    if (this.cloudSystem) this.cloudSystem.setCount(preset.clouds);
    if (this.timeSystem) this.timeSystem.setStarCount?.(preset.starCount);

    if (this.ui.setGraphicsPresetValue) this.ui.setGraphicsPresetValue(key);
  }

  _setMobileControlsVisible(visible) {
    if (this.mobile) this.ui.showMobileControls(visible);
  }

  _openInventoryScreen() {
    if (!this.running || this.paused || this._openPanel) return;
    this._openPanel = 'inventory';
    this._renderInventoryScreen();
    this.ui.showInventoryPanel();
    if (!this.mobile) document.exitPointerLock();
    this._setMobileControlsVisible(false);
  }

  _renderInventoryScreen() {
    this.ui.renderInventoryScreen(this.inventory, (i) => this._onInventorySlotClick(i));
    this.ui.renderRecipeList(this.ui.dom.inventoryCraftingList, CRAFTING_RECIPES, this.inventory, 'Craft', (recipe) => {
      if (craftOnce(this.inventory, recipe)) this._renderInventoryScreen();
    });
  }

  _onInventorySlotClick(index) {
    if (this.gameMode.isCreative()) return; // creative slots are fixed infinite stacks
    const sel = this.inventory.selectedIndex;
    if (index === sel) return;
    const tmp = this.inventory.slots[sel];
    this.inventory.slots[sel] = this.inventory.slots[index];
    this.inventory.slots[index] = tmp;
    this._renderInventoryScreen();
  }

  _openCraftingPanel() {
    this._openPanel = 'crafting';
    this._renderCraftingPanel();
    this.ui.showCraftingPanel();
    if (!this.mobile) document.exitPointerLock();
    this._setMobileControlsVisible(false);
  }

  _openFurnacePanel() {
    this._openPanel = 'furnace';
    this._renderFurnacePanel();
    this.ui.showFurnacePanel();
    if (!this.mobile) document.exitPointerLock();
    this._setMobileControlsVisible(false);
  }

  _renderCraftingPanel() {
    this.ui.renderRecipeList(this.ui.dom.craftingList, CRAFTING_RECIPES, this.inventory, 'Craft', (recipe) => {
      if (craftOnce(this.inventory, recipe)) this._renderCraftingPanel();
    });
  }

  _renderFurnacePanel() {
    this.ui.renderRecipeList(this.ui.dom.furnaceList, SMELTING_RECIPES, this.inventory, 'Smelt', (recipe) => {
      if (smeltOnce(this.inventory, recipe)) this._renderFurnacePanel();
    });
  }

  _closePanel() {
    this._openPanel = null;
    this.ui.hideCraftingPanel();
    this.ui.hideFurnacePanel();
    this.ui.hideInventoryPanel();
    if (this.running && !this.paused && !this.player.isDead) this._setMobileControlsVisible(true);
  }

  // ---------------- player-triggered actions ----------------

  onToggleFlyRequested() {
    if (!this.running || !this.gameMode || !this.gameMode.canFly()) return;
    this.player.flying = !this.player.flying;
    if (this.player.flying) this.player.velocity.y = 0;
  }

  onToggleGameModeRequested() {
    if (!this.running || !this.gameMode) return;
    this.gameMode.toggle();
  }

  _respawnPlayer() {
    const spawnY = this.world.getHeightAt(this.player.position.x, this.player.position.z) + 2;
    this.player.respawn(new THREE.Vector3(this.player.position.x, spawnY, this.player.position.z));
    this.ui.hideDeathScreen();
    this._setMobileControlsVisible(true);
  }

  _updateWaterUniforms() {
    const mat = this.world.waterMaterial;
    mat.uniforms.time.value = this.clock.elapsedTime;
    mat.uniforms.sunDirection.value.copy(this.timeSystem.sunDirection);
    mat.uniforms.sunIntensity.value = this.timeSystem.sunIntensityForWater;
    if (this.scene.background) mat.uniforms.skyColor.value.copy(this.scene.background);
  }

  // ---------------- per-frame update ----------------

  _animate() {
    requestAnimationFrame(() => this._animate());
    const dt = Math.min(this.clock.getDelta(), 0.1);

    this._trackFps(dt);

    if (this.running && !this.paused && !this._openPanel) {
      this._update(dt);
      this._maybeAutosave();
      this._updateAdaptiveQuality(dt);
    }

    this.postFX.render();
  }

  _trackFps(dt) {
    this._fpsAccum += dt; this._fpsFrames++;
    if (this._fpsAccum >= 0.5) {
      this._fps = Math.round(this._fpsFrames / this._fpsAccum);
      this._fpsAccum = 0; this._fpsFrames = 0;
      this._fpsHistory.push(this._fps);
      if (this._fpsHistory.length > 10) this._fpsHistory.shift(); // ~5s rolling window
    }
  }

  /** Stands in for the brief's "dynamic resolution scaling" / "adaptive quality
   * system": if FPS stays low for a sustained stretch, drop one preset tier.
   * Only ever downgrades automatically — never auto-upgrades, to avoid
   * flip-flopping; the player can always manually pick a higher preset again. */
  _updateAdaptiveQuality(dt) {
    this._adaptiveQualityCooldown -= dt;
    if (this._adaptiveQualityCooldown > 0) return;
    if (this._fpsHistory.length < 10) return;

    const avgFps = this._fpsHistory.reduce((a, b) => a + b, 0) / this._fpsHistory.length;
    const order = [GraphicsPreset.EXTREME, GraphicsPreset.ULTRA, GraphicsPreset.HIGH, GraphicsPreset.MEDIUM, GraphicsPreset.LOW];
    const currentIndex = order.indexOf(this.graphicsPreset);
    if (avgFps < 28 && currentIndex < order.length - 1) {
      this._applyGraphicsPreset(order[currentIndex + 1]);
      this._adaptiveQualityCooldown = 12; // give the new preset a while before considering another drop
      this._fpsHistory = [];
      this.ui.showToast?.('Graphics quality lowered for smoother performance');
    }
  }

  _maybeAutosave() {
    const now = performance.now();
    if (now - this._lastAutosave > 15000) {
      this._lastAutosave = now;
      SaveSystem.save(this);
    }
  }

  _update(dt) {
    const input = this.controls.poll();
    const yaw = input.yaw, pitch = input.pitch;

    if (!this.player.isDead) {
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const wish = new THREE.Vector3();
      wish.addScaledVector(forward, input.forward);
      wish.addScaledVector(right, input.strafe);
      if (wish.lengthSq() > 1) wish.normalize();
      wish.y = this.player.flying ? input.ascend : 0;

      this.player.update(dt, wish, input.jumpPressed, this.gameMode.mode);
      if (this.player.isDead) {
        this.ui.showDeathScreen();
        if (!this.mobile) document.exitPointerLock();
        this._setMobileControlsVisible(false);
      }
    }

    this.camera.position.copy(this.player.getEyePosition());
    this.camera.rotation.y = yaw;
    this.camera.rotation.x = pitch;
    this.camera.updateMatrixWorld(); // so the touch-to-aim raycaster below sees this frame's pose, not last frame's

    this.world.update(this.player.position.x, this.player.position.z);
    this.timeSystem.update(dt, this.player.position);
    this._updateWaterUniforms();
    this.player.gameModeCanTakeDamage = this.gameMode.canTakeDamage();
    this.mobManager.update(dt, this.player, this.timeSystem.isNight(), (mob) => {
      if (this.gameMode.isSurvival() && mob.def.drop) {
        this.droppedItemManager.spawn(mob.def.drop, 1, mob.position);
      }
    });
    this.droppedItemManager.update(dt, this.player, (id, count) => {
      const fit = this.inventory.addItem(id, count);
      if (!fit) this.ui.showToast('Inventory full');
      return fit;
    });

    this._updateTargetedBlock(input, dt);

    this.ui.updateHealth(this.player.health, this.player.maxHealth, this.gameMode.isSurvival());
    this.ui.updateHunger(this.player.hunger, this.player.maxHunger, this.gameMode.isSurvival());
    this.ui.updateHotbar(this.inventory);
    this.ui.updateTimeLabel(this.timeSystem.getPhaseLabel());
    this.ui.updateBreakProgress(this._breakFraction || 0);
    if (this._debugVisible) {
      const p = this.player.position;
      const biome = this.world.terrainGenerator.getBiome(Math.floor(p.x), Math.floor(p.z), this.world.getHeightAt(p.x, p.z));
      this.ui.updateDebugPanel(
        `FPS: ${this._fps}\nXYZ: ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}\nBiome: ${biome}\nChunks: ${this.world.chunks.size}\nSeed: ${this.world.seed}`
      );
    }
  }

  _updateTargetedBlock(input, dt) {
    let origin, direction;

    if (input.aimScreen) {
      const ndcX = (input.aimScreen.x / window.innerWidth) * 2 - 1;
      const ndcY = -(input.aimScreen.y / window.innerHeight) * 2 + 1;
      this._raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
      origin = this._raycaster.ray.origin;
      direction = this._raycaster.ray.direction;
    } else {
      origin = this.player.getEyePosition();
      direction = new THREE.Vector3(
        -Math.sin(input.yaw) * Math.cos(input.pitch),
        Math.sin(input.pitch),
        -Math.cos(input.yaw) * Math.cos(input.pitch)
      );
    }

    const hit = this.world.raycast(origin, direction, 6.5);

    if (hit) {
      this.outline.position.set(hit.position[0] + 0.5, hit.position[1] + 0.5, hit.position[2] + 0.5);
      this.outline.visible = true;
    } else {
      this.outline.visible = false;
    }

    this._handleBreakPlace(hit, input, dt, origin, direction);
  }

  _handleBreakPlace(hit, input, dt, origin, facing) {
    this._attackCooldownTimer -= dt;

    const mobTarget = this.mobManager.findAttackTarget(origin, facing, ATTACK_RANGE);

    if (mobTarget && input.breakHeld) {
      this._breakProgress = 0;
      this._breakFraction = 0;
      this._breakTargetKey = null;
      if (this._attackCooldownTimer <= 0) {
        const dmg = weaponDamage(this.inventory.getSelectedBlockId());
        const knock = mobTarget.position.clone().sub(this.player.position).setY(0).normalize();
        mobTarget.takeDamage(dmg, knock);
        this._attackCooldownTimer = ATTACK_COOLDOWN;
      }
    } else if (hit && input.breakHeld && !isUnbreakable(hit.blockId)) {
      const key = hit.position.join(',');
      const interval = this.gameMode.breaksInstantly() ? CREATIVE_BREAK_INTERVAL : BREAK_TIME_SURVIVAL;
      if (key !== this._breakTargetKey) { this._breakTargetKey = key; this._breakProgress = 0; }
      this._breakProgress += dt;
      this._breakFraction = Math.min(1, this._breakProgress / interval);
      if (this._breakProgress >= interval) {
        this._breakBlock(hit);
        this._breakProgress = 0;
        this._breakFraction = 0;
      }
    } else {
      this._breakProgress = 0;
      this._breakFraction = 0;
      this._breakTargetKey = null;
    }

    if (input.placePressed) {
      const selected = this.inventory.getSelectedBlockId();
      if (isFood(selected)) {
        this._eatSelected();
      } else if (hit) {
        const kind = interactiveKind(hit.blockId);
        if (kind === 'crafting') this._openCraftingPanel();
        else if (kind === 'furnace') this._openFurnacePanel();
        else this._placeBlock(hit);
      }
    }
  }

  _eatSelected() {
    if (this.player.hunger >= this.player.maxHunger) return; // no reason to eat when full
    const id = this.inventory.getSelectedBlockId();
    const heal = foodHealAmount(id);
    if (heal <= 0) return;
    if (this.inventory.consumeSelected()) this.player.restoreHunger(heal);
  }

  _breakBlock(hit) {
    const [x, y, z] = hit.position;
    this.world.setBlock(x, y, z, BlockId.AIR);
    if (this.gameMode.isSurvival()) {
      const requiredTier = requiredPickaxeTier(hit.blockId);
      const haveTier = pickaxeTier(this.inventory.getSelectedBlockId());
      if (requiredTier === 0 || haveTier >= requiredTier) {
        this.droppedItemManager.spawn(dropFor(hit.blockId), 1, new THREE.Vector3(x + 0.5, y + 0.3, z + 0.5));
      }
    }
  }

  _placeBlock(hit) {
    const blockId = this.inventory.getSelectedBlockId();
    if (blockId === null || blockId === undefined || blockId >= 1000) return; // tools/materials aren't placeable

    const [nx, ny, nz] = hit.normal;
    const px = hit.position[0] + nx, py = hit.position[1] + ny, pz = hit.position[2] + nz;

    if (this.world.getBlock(px, py, pz, BlockId.AIR) !== BlockId.AIR) return;
    if (this._blockIntersectsPlayer(px, py, pz)) return;

    if (this.inventory.consumeSelected()) {
      this.world.setBlock(px, py, pz, blockId);
    }
  }

  _blockIntersectsPlayer(bx, by, bz) {
    const aabb = this.player.getAABB();
    return aabb.minX < bx + 1 && aabb.maxX > bx &&
           aabb.minY < by + 1 && aabb.maxY > by &&
           aabb.minZ < bz + 1 && aabb.maxZ > bz;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
