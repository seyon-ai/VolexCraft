// controls.js — desktop input only (mobileControls.js is the touch equivalent).
// Both feed the same neutral "input state" shape into Game/Player, so the
// rest of the codebase doesn't care which one is active.

import { DesktopSettings } from './settings.js';

const DOUBLE_TAP_WINDOW = 280; // ms, for double-space fly toggle

export class DesktopControls {
  constructor(camera, domElement, game) {
    this.camera = camera;
    this.domElement = domElement;
    this.game = game;
    this.keys = new Set();
    this.locked = false;
    this.yaw = 0;
    this.pitch = 0;
    this._lastSpaceTime = -Infinity;
    this._breakHeld = false;
    this._placeQueued = false;
    this._jumpQueued = false;

    this._bind();
  }

  _bind() {
    this.domElement.addEventListener('click', () => {
      if (!this.locked) this.domElement.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.domElement;
      this.game.ui.setPointerLocked(this.locked);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const sens = DesktopSettings.mouseSensitivity * (this.game._sensitivityMultiplier || 1);
      this.yaw -= e.movementX * sens;
      this.pitch -= e.movementY * sens;
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    });

    document.addEventListener('keydown', (e) => {
      if (this.game.ui.isTypingInInput()) return;
      if (!this.game.running) return; // ignore gameplay shortcuts before a world exists
      this.keys.add(e.code);
      if (e.code === 'Space') {
        this._jumpQueued = true;
        const now = performance.now();
        if (now - this._lastSpaceTime < DOUBLE_TAP_WINDOW) this.game.onToggleFlyRequested();
        this._lastSpaceTime = now;
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.game.player.sprinting = true;
      if (e.code.startsWith('Digit')) {
        const n = parseInt(e.code.replace('Digit', ''), 10);
        if (n >= 1 && n <= 9) this.game.inventory.select(n - 1);
      }
      if (e.code === 'KeyE') {
        if (this.game._openPanel === 'inventory') this.game._closePanel();
        else this.game._openInventoryScreen();
      }
      if (e.code === 'KeyM') this.game.onToggleGameModeRequested();
      if (e.code === 'KeyQ') this.game._dropSelectedItem();
      if (e.code === 'Escape') {
        if (this.game._openPanel) this.game._closePanel();
        else document.exitPointerLock();
      }
    });

    document.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (!this.game.running) return;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.game.player.sprinting = false;
    });

    this.domElement.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this._breakHeld = true;
      if (e.button === 2) this._placeQueued = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this._breakHeld = false;
    });
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    this.domElement.addEventListener('wheel', (e) => {
      const dir = Math.sign(e.deltaY);
      const next = (this.game.inventory.selectedIndex + dir + 9) % 9;
      this.game.inventory.select(next);
    }, { passive: true });
  }

  /** Returns the neutral input snapshot consumed once per frame by Game. */
  poll() {
    const forward = this.keys.has('KeyW') ? 1 : this.keys.has('KeyS') ? -1 : 0;
    const strafe = this.keys.has('KeyD') ? 1 : this.keys.has('KeyA') ? -1 : 0;
    const ascend = this.keys.has('Space') ? 1 : this.keys.has('ControlLeft') ? -1 : 0;

    const jumpPressed = this._jumpQueued;
    this._jumpQueued = false;
    const placePressed = this._placeQueued;
    this._placeQueued = false;

    return {
      forward, strafe, ascend,
      yaw: this.yaw, pitch: this.pitch,
      jumpPressed,
      breakHeld: this._breakHeld,
      placePressed,
    };
  }
}
