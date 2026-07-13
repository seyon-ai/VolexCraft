// mobileControls.js — touch equivalent of controls.js. Produces the exact
// same neutral input snapshot (poll()) so Game never needs to know which
// input scheme is active.
//
// Three deliberate UX choices here:
//  - The joystick is "floating": its huge invisible hit-zone covers the
//    whole bottom-left half of the screen, and the visible base/thumb jump
//    to wherever the player actually touches down, instead of forcing them
//    to hit one small fixed circle.
//  - There is no fixed break/place button. Touching anywhere on the rest of
//    the screen aims at that exact point: a quick tap places a block there,
//    holding still breaks (or attacks a mob) there. If the finger drags
//    past a small threshold before that decision is made, it's reinterpreted
//    as a camera look-drag instead — so look and aim share one gesture.
//  - Main.js reads `aimScreen` (screen-space point) when present instead of
//    the camera-forward ray, so break/place/attack target wherever was
//    actually touched rather than always screen-center.

import { MobileSettings } from './settings.js';

const JOYSTICK_RADIUS = 60; // px, visual + logical clamp radius (floating base)
const HOLD_THRESHOLD_MS = 220; // press-and-hold longer than this = "break/attack", shorter = "place/eat"
const MOVE_THRESHOLD_PX = 14; // drag further than this before the hold threshold = camera look, not aim

export class MobileControls {
  constructor(game, elements) {
    this.game = game;
    this.el = elements; // { joystickZone, joystickBase, joystickThumb, lookZone, btnJump }

    this.yaw = 0;
    this.pitch = 0;
    this.moveVector = { x: 0, y: 0 };

    this._joystickPointerId = null;
    this._joystickCenter = { x: 0, y: 0 };
    this._lastJumpTapTime = -Infinity;

    this.jumpHeld = false;
    this._jumpQueued = false;

    this._touch = null; // { pointerId, startX, startY, curX, curY, startTime, movedPastThreshold }
    this._placeQueued = null; // {x,y} screen point, or null

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

  /** The combined look-drag / tap-to-place / hold-to-break gesture. */
  _bindLook() {
    const zone = this.el.lookZone;

    zone.addEventListener('pointerdown', (e) => {
      if (e.pointerId === this._joystickPointerId) return;
      if (this._touch) return; // only track one aim/look touch at a time
      this._touch = {
        pointerId: e.pointerId,
        startX: e.clientX, startY: e.clientY,
        curX: e.clientX, curY: e.clientY,
        startTime: performance.now(),
        movedPastThreshold: false,
      };
      zone.setPointerCapture(e.pointerId);
    });

    zone.addEventListener('pointermove', (e) => {
      const t = this._touch;
      if (!t || e.pointerId !== t.pointerId) return;

      if (!t.movedPastThreshold) {
        const dist = Math.hypot(e.clientX - t.startX, e.clientY - t.startY);
        if (dist > MOVE_THRESHOLD_PX) {
          t.movedPastThreshold = true; // reclassify as a look-drag from here on
          t.curX = e.clientX; t.curY = e.clientY;
          return;
        }
        t.curX = e.clientX; t.curY = e.clientY;
        return;
      }

      const dx = e.clientX - t.curX;
      const dy = e.clientY - t.curY;
      t.curX = e.clientX; t.curY = e.clientY;
      const sens = MobileSettings.lookSensitivity * (this.game._sensitivityMultiplier || 1);
      this.yaw -= dx * sens;
      this.pitch -= dy * sens;
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    });

    const release = (e) => {
      const t = this._touch;
      if (!t || e.pointerId !== t.pointerId) return;
      const heldMs = performance.now() - t.startTime;
      if (!t.movedPastThreshold && heldMs < HOLD_THRESHOLD_MS) {
        this._placeQueued = { x: t.curX, y: t.curY }; // quick tap-in-place = place/eat
      }
      this._touch = null;
    };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);
  }

  _bindButtons() {
    const down = (el, handler) => el.addEventListener('pointerdown', (e) => { e.preventDefault(); handler(e); });
    const up = (el, handler) => {
      el.addEventListener('pointerup', (e) => { e.preventDefault(); handler(e); });
      el.addEventListener('pointercancel', (e) => { e.preventDefault(); handler(e); });
    };

    down(this.el.btnJump, () => {
      this.jumpHeld = true;
      this._jumpQueued = true;
      const now = performance.now();
      if (now - this._lastJumpTapTime < 320) this.game.onToggleFlyRequested();
      this._lastJumpTapTime = now;
    });
    up(this.el.btnJump, () => { this.jumpHeld = false; });
  }

  poll() {
    const jumpPressed = this._jumpQueued;
    this._jumpQueued = false;

    let breakHeld = false;
    let aimScreen = null;
    if (this._touch && !this._touch.movedPastThreshold) {
      const heldMs = performance.now() - this._touch.startTime;
      if (heldMs >= HOLD_THRESHOLD_MS) {
        breakHeld = true;
        aimScreen = { x: this._touch.curX, y: this._touch.curY };
      }
    }

    let placePressed = false;
    if (this._placeQueued) {
      placePressed = true;
      aimScreen = this._placeQueued;
      this._placeQueued = null;
    }

    return {
      forward: -this.moveVector.y,
      strafe: this.moveVector.x,
      ascend: this.jumpHeld ? 1 : 0,
      yaw: this.yaw,
      pitch: this.pitch,
      jumpPressed,
      breakHeld,
      placePressed,
      aimScreen,
    };
  }
}


