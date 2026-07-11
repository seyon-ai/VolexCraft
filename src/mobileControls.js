// mobileControls.js — touch equivalent of controls.js. Produces the exact
// same neutral input snapshot (poll()) so Game never needs to know which
// input scheme is active.

import { MobileSettings } from './settings.js';

const DOUBLE_TAP_WINDOW = 320;
const JOYSTICK_RADIUS = 45; // px, visual + logical clamp radius

export class MobileControls {
  constructor(game, elements) {
    this.game = game;
    this.el = elements; // { root, joystickZone, joystickThumb, lookZone, btnJump, btnBreak, btnPlace }

    this.yaw = 0;
    this.pitch = 0;
    this.moveVector = { x: 0, y: 0 };

    this._joystickPointerId = null;
    this._joystickCenter = { x: 0, y: 0 };
    this._lookPointerId = null;
    this._lookLast = { x: 0, y: 0 };
    this._lastJumpTapTime = -Infinity;

    this.jumpHeld = false;
    this._jumpQueued = false;
    this.breakHeld = false;
    this._placeQueued = false;

    this._bindJoystick();
    this._bindLook();
    this._bindButtons();
  }

  _bindJoystick() {
    const zone = this.el.joystickZone;
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this._joystickPointerId = e.pointerId;
      const rect = zone.getBoundingClientRect();
      this._joystickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      zone.setPointerCapture(e.pointerId);
      this._updateJoystick(e);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._joystickPointerId) return;
      this._updateJoystick(e);
    });
    const release = (e) => {
      if (e.pointerId !== this._joystickPointerId) return;
      this._joystickPointerId = null;
      this.moveVector = { x: 0, y: 0 };
      this.el.joystickThumb.style.transform = 'translate(-50%, -50%)';
    };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);
  }

  _updateJoystick(e) {
    let dx = e.clientX - this._joystickCenter.x;
    let dy = e.clientY - this._joystickCenter.y;
    const dist = Math.hypot(dx, dy);
    if (dist > JOYSTICK_RADIUS) {
      dx = (dx / dist) * JOYSTICK_RADIUS;
      dy = (dy / dist) * JOYSTICK_RADIUS;
    }
    this.el.joystickThumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    let nx = dx / JOYSTICK_RADIUS;
    let ny = dy / JOYSTICK_RADIUS;
    if (Math.hypot(nx, ny) < MobileSettings.joystickDeadzone) { nx = 0; ny = 0; }
    this.moveVector = { x: nx, y: ny };
  }

  _bindLook() {
    const zone = this.el.lookZone;
    zone.addEventListener('pointerdown', (e) => {
      if (e.pointerId === this._joystickPointerId) return;
      this._lookPointerId = e.pointerId;
      this._lookLast = { x: e.clientX, y: e.clientY };
      zone.setPointerCapture(e.pointerId);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._lookPointerId) return;
      const dx = e.clientX - this._lookLast.x;
      const dy = e.clientY - this._lookLast.y;
      this._lookLast = { x: e.clientX, y: e.clientY };
      const sens = MobileSettings.lookSensitivity * 60 * (this.game._sensitivityMultiplier || 1);
      this.yaw -= dx * sens;
      this.pitch -= dy * sens;
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    });
    const release = (e) => {
      if (e.pointerId === this._lookPointerId) this._lookPointerId = null;
    };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);
  }

  _bindButtons() {
    const down = (el, handler) => el.addEventListener('pointerdown', (e) => { e.preventDefault(); handler(); });
    const up = (el, handler) => {
      el.addEventListener('pointerup', (e) => { e.preventDefault(); handler(); });
      el.addEventListener('pointercancel', (e) => { e.preventDefault(); handler(); });
    };

    down(this.el.btnJump, () => {
      this.jumpHeld = true;
      this._jumpQueued = true;
      const now = performance.now();
      if (now - this._lastJumpTapTime < DOUBLE_TAP_WINDOW) this.game.onToggleFlyRequested();
      this._lastJumpTapTime = now;
    });
    up(this.el.btnJump, () => { this.jumpHeld = false; });

    down(this.el.btnBreak, () => { this.breakHeld = true; });
    up(this.el.btnBreak, () => { this.breakHeld = false; });

    down(this.el.btnPlace, () => { this._placeQueued = true; });
  }

  poll() {
    const jumpPressed = this._jumpQueued;
    this._jumpQueued = false;
    const placePressed = this._placeQueued;
    this._placeQueued = false;

    return {
      forward: -this.moveVector.y,
      strafe: this.moveVector.x,
      ascend: this.jumpHeld ? 1 : 0,
      yaw: this.yaw,
      pitch: this.pitch,
      jumpPressed,
      breakHeld: this.breakHeld,
      placePressed,
    };
  }
}
