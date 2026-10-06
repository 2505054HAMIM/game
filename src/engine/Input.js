// Keyboard + mouse state. Uses pointer lock when available; otherwise mouse
// movement while a button is held still turns the camera.
export class Input {
  constructor(element) {
    this.element = element;
    this.keys = new Set();
    this.pressed = new Set(); // keys that went down this frame
    this.mouse = { left: false, right: false, dx: 0, dy: 0 };
    this.mousePressed = { left: false, right: false };
    this.enabled = false;
    this.sensitivity = 0.0022;

    this.onKeyDown = (e) => {
      if (!this.enabled) return;
      if (['Space', 'ShiftLeft', 'ShiftRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyR'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    };
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onMouseDown = (e) => {
      if (!this.enabled) return;
      if (e.button === 0) { this.mouse.left = true; this.mousePressed.left = true; }
      if (e.button === 2) { this.mouse.right = true; this.mousePressed.right = true; }
    };
    this.onMouseUp = (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    };
    this.onMouseMove = (e) => {
      if (!this.enabled) return;
      if (this.isLocked() || this.mouse.left || this.mouse.right) {
        this.mouse.dx += e.movementX || 0;
        this.mouse.dy += e.movementY || 0;
      }
    };
    this.onContext = (e) => e.preventDefault();
    this.onBlur = () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('contextmenu', this.onContext);
    window.addEventListener('blur', this.onBlur);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('contextmenu', this.onContext);
    window.removeEventListener('blur', this.onBlur);
  }

  isLocked() { return document.pointerLockElement === this.element; }

  requestLock() {
    try {
      const p = this.element.requestPointerLock?.();
      if (p && p.catch) p.catch(() => {});
    } catch { /* pointer lock is optional */ }
  }

  releaseLock() {
    if (this.isLocked()) document.exitPointerLock?.();
  }

  down(code) { return this.keys.has(code); }
  tapped(code) { return this.pressed.has(code); }

  consumeMouse() {
    const d = { dx: this.mouse.dx, dy: this.mouse.dy };
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    return d;
  }

  endFrame() {
    this.pressed.clear();
    this.mousePressed.left = false;
    this.mousePressed.right = false;
  }
}
