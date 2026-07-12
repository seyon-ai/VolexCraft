// mobileControls.js — touch equivalent of controls.js. Produces the exact
// same neutral input snapshot (poll()) so Game never needs to know which
// input scheme is active.
//
// Two deliberate UX choices here:
//  - The joystick is "floating": its huge invisible hit-zone covers the
//    whole bottom-left half of the screen, and the visible base/thumb jump
//    to wherever the player actually touches down, instead of forcing them
//    to hit one small fixed circle.
//  - Break and place share a single circular action button: a quick tap
//    places, holding it down starts breaking (with the same per-mode break
//    speed used on desktop).

import { MobileSettings } from './settings.js';

const JOYSTICK_RADIUS = 60; // px, visual + logical clamp radius (floating base)
const HOLD_THRESHOLD_MS = 180; // press-and-hold longer than this = "break", shorter = "place"

export class MobileControls {
  constructor(game, elements) {
    this.game = game;
    this.el = elements; // { joystickZone, joystickBase, joystickThumb, lookZone, btnAction, btnJump }

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

    this._actionPointerId = null;
    this._actionDownTime = 0;
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
      // Floating base: appear right where the thumb went down, clamped so
      // the ring stays fully on-screen.
      const cx = Math.max(JOYSTICK_RADIUS + 8, Math.min(window.innerWidth - JOYSTICK_RADIUS - 8, e.clientX));
      const cy = Math.max(JOYSTICK_RADIUS + 8, Math.min(window.innerHeight - JOYSTICK_RADIUS - 8, e.clientY));
      this._joystickCenter = { x: cx, y: cy };
      this.el.joystickBase.style.left = `${cx}px`;
      this.el.joystickBase.style.top = `${cy}px`;
      this.el.joystickBase.style.opacity = '1';
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
      this.el.joystickBase.style.opacity = '0';
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
      const sens = MobileSettings.lookSensitivity * (this.game._sensitivityMultiplier || 1);
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
    down(this.el.btnJump, () => {
      this.jumpHeld = true;
      this._jumpQueued = true;
      const now = performance.now();
      if (now - this._lastJumpTapTime < 320) this.game.onToggleFlyRequested();
      this._lastJumpTapTime = now;
    });
    up(this.el.btnJump, () => { this.jumpHeld = false; });

    down(this.el.btnAction, (e) => {
      this._actionPointerId = e.pointerId;
      this._actionDownTime = performance.now();
    });
    up(this.el.btnAction, (e) => {
      if (this._actionPointerId !== null && e.pointerId !== this._actionPointerId) return;
      const held = performance.now() - this._actionDownTime;
      if (held < HOLD_THRESHOLD_MS) this._placeQueued = true;
      this._actionPointerId = null;
      this.breakHeld = false;
    });

    function down(el, handler) { el.addEventListener('pointerdown', (e) => { e.preventDefault(); handler(e); }); }
    function up(el, handler) {
      el.addEventListener('pointerup', (e) => { e.preventDefault(); handler(e); });
      el.addEventListener('pointercancel', (e) => { e.preventDefault(); handler(e); });
    }
  }

  poll() {
    // Re-derive breakHeld from elapsed hold time every frame (not just on
    // events) so it stays true continuously while the button is held down.
    if (this._actionPointerId !== null) {
      this.breakHeld = (performance.now() - this._actionDownTime) >= HOLD_THRESHOLD_MS;
    }

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

