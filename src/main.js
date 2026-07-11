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
import { BlockId } from './block.js';
import { GraphicsSettings, WorldSettings, isMobileDevice } from './settings.js';
import { hashStringSeed } from './utils.js';

const BREAK_TIME_SURVIVAL = 0.35; // seconds to break a block by hand

class Game {
  constructor() {
    this.ui = new UI();
    this.clock = new THREE.Clock();
    this.mobile = isMobileDevice();
    this.running = false;
    this.paused = false;

    this._initRenderer();
    this._initBlockOutline();

    if (this.mobile) {
      this.controls = new MobileControls(this, this.ui.getMobileElements());
    } else {
      this.controls = new DesktopControls(this.camera, this.renderer.domElement, this);
    }
    this.ui.showMobileControls(false);

    this.graphicsOptions = { shadows: GraphicsSettings.shadows, fog: GraphicsSettings.fogEnabled };

    this._breakProgress = 0;
    this._breakTargetKey = null;
    this._prevBreakHeld = false;
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
    });

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

    this.gameMode.onChange((m) => {
      this.player.flying = false;
      this.ui.updateModeLabel(m);
      this.ui.updateHealth(this.player.health, this.player.maxHealth, this.gameMode.isSurvival());
    });

    this.ui.setSettingsValues({
      renderDistance: this.world.renderDistance,
      shadows: this.graphicsOptions.shadows,
      fog: this.graphicsOptions.fog,
    });
    this.ui.updateModeLabel(this.gameMode.mode);
  }

  _teardownWorld() {
    for (const chunk of this.world.chunks.values()) chunk.dispose();
    if (this.timeSystem) {
      this.scene.remove(this.timeSystem.sunLight, this.timeSystem.sunLight.target, this.timeSystem.moonLight, this.timeSystem.ambientLight);
    }
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

  // ---------------- pause / settings ----------------

  _pause() {
    if (!this.running) return;
    this.paused = true;
    this.ui.showPause();
    if (!this.mobile) document.exitPointerLock();
  }

  _resume() {
    this.paused = false;
    this.ui.hidePause();
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
  }

  // ---------------- per-frame update ----------------

  _animate() {
    requestAnimationFrame(() => this._animate());
    const dt = Math.min(this.clock.getDelta(), 0.1);

    this._trackFps(dt);

    if (this.running && !this.paused) {
      this._update(dt);
      this._maybeAutosave();
    }

    this.renderer.render(this.scene, this.camera);
  }

  _trackFps(dt) {
    this._fpsAccum += dt; this._fpsFrames++;
    if (this._fpsAccum >= 0.5) {
      this._fps = Math.round(this._fpsFrames / this._fpsAccum);
      this._fpsAccum = 0; this._fpsFrames = 0;
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
      if (this.player.isDead) this.ui.showDeathScreen();
    }

    this.camera.position.copy(this.player.getEyePosition());
    this.camera.rotation.y = yaw;
    this.camera.rotation.x = pitch;

    this.world.update(this.player.position.x, this.player.position.z);
    this.timeSystem.update(dt, this.player.position);

    this._updateTargetedBlock(input, dt);

    this.ui.updateHealth(this.player.health, this.player.maxHealth, this.gameMode.isSurvival());
    this.ui.updateHotbar(this.inventory);
    this.ui.updateTimeLabel(this.timeSystem.getPhaseLabel());
    if (this._debugVisible) {
      const p = this.player.position;
      const biome = this.world.terrainGenerator.getBiome(Math.floor(p.x), Math.floor(p.z), this.world.getHeightAt(p.x, p.z));
      this.ui.updateDebugPanel(
        `FPS: ${this._fps}\nXYZ: ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}\nBiome: ${biome}\nChunks: ${this.world.chunks.size}\nSeed: ${this.world.seed}`
      );
    }
  }

  _updateTargetedBlock(input, dt) {
    const eye = this.player.getEyePosition();
    const yaw = input.yaw, pitch = input.pitch;
    const dir = new THREE.Vector3(
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch)
    );
    const hit = this.world.raycast(eye, dir, 6.5);

    if (hit) {
      this.outline.position.set(hit.position[0] + 0.5, hit.position[1] + 0.5, hit.position[2] + 0.5);
      this.outline.visible = true;
    } else {
      this.outline.visible = false;
    }

    this._handleBreakPlace(hit, input, dt);
  }

  _handleBreakPlace(hit, input, dt) {
    if (hit && input.breakHeld) {
      const key = hit.position.join(',');
      if (this.gameMode.breaksInstantly()) {
        if (!this._prevBreakHeld) this._breakBlock(hit);
      } else {
        if (key !== this._breakTargetKey) { this._breakTargetKey = key; this._breakProgress = 0; }
        this._breakProgress += dt;
        if (this._breakProgress >= BREAK_TIME_SURVIVAL) {
          this._breakBlock(hit);
          this._breakProgress = 0;
          this._breakTargetKey = null;
        }
      }
    } else {
      this._breakProgress = 0;
      this._breakTargetKey = null;
    }
    this._prevBreakHeld = input.breakHeld;

    if (hit && input.placePressed) {
      this._placeBlock(hit);
    }
  }

  _breakBlock(hit) {
    const [x, y, z] = hit.position;
    this.world.setBlock(x, y, z, BlockId.AIR);
    if (this.gameMode.isSurvival()) this.inventory.addBlock(hit.blockId, 1);
  }

  _placeBlock(hit) {
    const blockId = this.inventory.getSelectedBlockId();
    if (blockId === null || blockId === undefined) return;

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
