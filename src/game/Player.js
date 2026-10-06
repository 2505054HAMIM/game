import * as THREE from 'three';
import { Mech } from '../mech/Mech.js';
import { hitMech } from './Combat.js';

const RIFLE = { interval: 0.095, mag: 40, reload: 1.6, damage: 24, speed: 280 };
const MISSILE = { cooldown: 5, maxLocks: 4, lockTime: 0.22, damage: 110, cone: 0.42 };
const BLADE = { cooldown: 2.6, damage: 320, reach: 8.5 };

export class Player extends Mech {
  constructor(game) {
    super('player', game.scene);
    this.game = game;
    this.team = 'player';
    this.camYaw = Math.PI;
    this.camPitch = 0.08;
    this.camPos = new THREE.Vector3();
    this.aimPoint = new THREE.Vector3();
    this.lockTarget = null;

    this.ammo = RIFLE.mag;
    this.reloadT = 0;
    this.fireT = 0;
    this.missileCd = 0;
    this.missileLocks = [];
    this.lockingT = 0;
    this.locking = false;
    this.bladeCd = 0;
    this.bladeHitDone = true;
    this.boostCd = 0;
    this.hoverSoundT = 0;
  }

  reset(pos) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.boostVel.set(0, 0, 0);
    this.hp = this.maxHp;
    this.energy = 100;
    this.alive = true;
    this.camYaw = Math.atan2(-pos.x, -pos.z);
    this.yaw = this.aimYaw = this.camYaw;
    this.ammo = RIFLE.mag;
    this.missileCd = this.bladeCd = 0;
    this.missileLocks = [];
  }

  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.camYaw), 0, Math.cos(this.camYaw)); }
  right(out = new THREE.Vector3()) { return out.set(-Math.cos(this.camYaw), 0, Math.sin(this.camYaw)); }

  update(dt, input) {
    const g = this.game;
    const { dx, dy } = input.consumeMouse();
    this.camYaw -= dx * input.sensitivity;
    this.camPitch = Math.max(-0.55, Math.min(0.85, this.camPitch - dy * input.sensitivity));

    // Movement
    const f = this.forward(), r = this.right();
    const move = new THREE.Vector3();
    if (input.down('KeyW')) move.add(f);
    if (input.down('KeyS')) move.sub(f);
    if (input.down('KeyD')) move.add(r);
    if (input.down('KeyA')) move.sub(r);
    if (move.lengthSq() > 0) move.normalize();

    this.boostCd -= dt;
    if ((input.tapped('ShiftLeft') || input.tapped('ShiftRight')) && this.boostCd <= 0 && !this.overheat && this.energy >= 18) {
      this.quickBoost(move.lengthSq() ? move : f, 40);
      this.energy -= 18;
      this.boostCd = 0.32;
      g.audio.play('boost');
      g.effects.shake += 0.15;
      this.emitThrust(14);
    }

    let hover = false;
    if (input.tapped('Space') && this.onGround) {
      this.vel.y = 15;
      this.onGround = false;
      this.emitThrust(8);
    } else if (input.down('Space') && !this.onGround && !this.overheat && this.energy > 0) {
      hover = true;
      this.energy -= 30 * dt;
    }

    const usingEnergy = hover || this.boostCd > 0.1;
    if (!usingEnergy) this.energy += (this.onGround ? 42 : 14) * dt;
    if (this.energy <= 0) { this.energy = 0; this.overheat = true; }
    if (this.overheat && this.energy >= 35) this.overheat = false;
    this.energy = Math.min(100, this.energy);

    this.physics(dt, g.arena, move, { hover });
    if (hover) this.emitThrust(2);
    if (this.justLanded) g.audio.play('land');
    g.audio.setBoost(Math.min(1, this.thrust));

    this.updateCamera(dt);
    this.updateAim();

    this.aimYaw = this.camYaw;
    const muzzle = this.muzzleWorld('R', new THREE.Vector3());
    const toAim = this.aimPoint.clone().sub(muzzle);
    this.aimPitch = Math.atan2(toAim.y, Math.hypot(toAim.x, toAim.z));

    this.updateWeapons(dt, input);
    this.animate(dt);
  }

  emitThrust(n) {
    const g = this.game;
    const back = new THREE.Vector3();
    for (const flame of this.model.thrusters) {
      flame.getWorldPosition(back);
      const dir = this.forward().negate();
      dir.y = -0.6;
      for (let i = 0; i < n; i++) g.effects.thruster(back, dir, [0.5, 1.6, 3.4]);
    }
  }

  updateCamera(dt) {
    const g = this.game;
    const cam = g.renderer.camera;
    const f = this.forward(), r = this.right();
    const head = new THREE.Vector3(this.pos.x, this.pos.y + this.height * 0.95, this.pos.z);
    const dist = 10.5;
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const desired = head.clone()
      .addScaledVector(f, -dist * cp)
      .addScaledVector(r, 2.4)
      .add(new THREE.Vector3(0, -dist * sp + 1.2, 0));
    desired.y = Math.max(0.8, desired.y);

    // Pull the camera in if a wall is between it and the mech.
    const t = g.arena.raycast(head, desired);
    if (t >= 0) desired.lerpVectors(head, desired, Math.max(0.15, t - 0.08));

    this.camPos.lerp(desired, 1 - Math.exp(-18 * dt));
    if (this.camPos.lengthSq() === 0) this.camPos.copy(desired);
    cam.position.copy(this.camPos);
    const look = head.clone()
      .addScaledVector(r, 2.4)
      .addScaledVector(f, 20 * cp)
      .add(new THREE.Vector3(0, 20 * sp + 1.2, 0));
    cam.lookAt(look);

    const shake = g.effects.shake;
    if (shake > 0.001) {
      cam.position.x += (Math.random() - 0.5) * shake;
      cam.position.y += (Math.random() - 0.5) * shake;
      cam.rotation.z += (Math.random() - 0.5) * shake * 0.05;
    }
    const fovWant = 68 + Math.min(1, Math.hypot(this.boostVel.x, this.boostVel.z) / 30) * 10;
    cam.fov += (fovWant - cam.fov) * Math.min(1, 8 * dt);
    cam.updateProjectionMatrix();
  }

  // Find what's under the crosshair and pick a soft-lock target.
  updateAim() {
    const g = this.game;
    const cam = g.renderer.camera;
    const origin = cam.position.clone();
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const far = origin.clone().addScaledVector(dir, 400);

    let best = null, bestScore = Infinity;
    const toE = new THREE.Vector3();
    for (const e of g.enemies) {
      if (!e.alive || e.spawning) continue;
      toE.copy(e.center).sub(origin);
      const d = toE.length();
      if (d > 170) continue;
      const ang = dir.angleTo(toE);
      const cone = 0.12 + Math.min(0.12, (e.radius * 2) / d);
      if (ang < cone && ang * d < bestScore) {
        if (g.arena.raycast(this.center.clone(), e.center.clone()) < 0) {
          bestScore = ang * d;
          best = e;
        }
      }
    }
    if (best !== this.lockTarget && best) g.audio.play('lock');
    this.lockTarget = best;

    if (best) {
      // Lead the target so pulse rounds connect.
      const c = best.center.clone();
      const t = c.distanceTo(this.pos) / RIFLE.speed;
      this.aimPoint.copy(c).addScaledVector(best.vel, t);
      return;
    }
    let hitT = g.arena.raycast(origin, far);
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const s = hitMech(e, origin, far);
      if (s >= 0 && (hitT < 0 || s < hitT)) hitT = s;
    }
    this.aimPoint.copy(hitT >= 0 ? origin.lerp(far, hitT) : far);
  }

  updateWeapons(dt, input) {
    const g = this.game;
    this.fireT -= dt;
    this.missileCd -= dt;
    this.bladeCd -= dt;
    this.firing = false;

    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { this.ammo = RIFLE.mag; g.audio.play('reload'); }
    } else if ((input.tapped('KeyR') && this.ammo < RIFLE.mag) || this.ammo <= 0) {
      this.reloadT = RIFLE.reload;
      g.audio.play('reload');
    }

    // Pulse rifle
    this.armRaise.R += ((this.slash > 0 ? 0.3 : 1) - this.armRaise.R) * Math.min(1, 10 * dt);
    if (input.mouse.left && this.fireT <= 0 && this.ammo > 0 && this.reloadT <= 0 && this.slash <= 0) {
      this.fireT = RIFLE.interval;
      this.ammo--;
      this.firing = true;
      const from = this.muzzleWorld('R', new THREE.Vector3());
      const dir = this.aimPoint.clone().sub(from).normalize();
      dir.x += (Math.random() - 0.5) * 0.012;
      dir.y += (Math.random() - 0.5) * 0.012;
      dir.z += (Math.random() - 0.5) * 0.012;
      g.combat.fire({ type: 'pulse', team: 'player', from, dir, speed: RIFLE.speed, damage: RIFLE.damage });
      g.effects.muzzleFlash(from, dir, [0.8, 2.4, 3.6]);
      g.effects.shake += 0.03;
      g.audio.play('rifle');
    }

    // Missiles: hold right mouse to paint targets, release to fire.
    if (input.mouse.right && this.missileCd <= 0) {
      if (!this.locking) { this.locking = true; this.lockingT = 0; this.missileLocks = []; }
      this.lockingT -= dt;
      if (this.lockingT <= 0 && this.missileLocks.length < MISSILE.maxLocks) {
        const cam = g.renderer.camera;
        const dir = new THREE.Vector3();
        cam.getWorldDirection(dir);
        const cands = g.enemies
          .filter((e) => e.alive && !e.spawning && e.center.distanceTo(cam.position) < 200)
          .map((e) => ({ e, ang: dir.angleTo(e.center.clone().sub(cam.position)) }))
          .filter((c) => c.ang < MISSILE.cone)
          .sort((a, b) => this.missileLocks.filter((l) => l === a.e).length - this.missileLocks.filter((l) => l === b.e).length || a.ang - b.ang);
        if (cands.length) {
          this.missileLocks.push(cands[0].e);
          g.audio.play('lock');
        }
        this.lockingT = MISSILE.lockTime;
      }
    } else if (this.locking) {
      this.locking = false;
      const n = Math.max(2, this.missileLocks.length);
      for (let i = 0; i < n; i++) {
        const target = this.missileLocks[i % Math.max(1, this.missileLocks.length)] || null;
        const pod = this.model.launchers[i % this.model.launchers.length];
        const up = new THREE.Vector3(0, 1, 0);
        const side = this.right().multiplyScalar((i % 2 ? 1 : -1) * 0.6);
        const dir = up.add(side).add(this.forward().multiplyScalar(0.4)).normalize();
        setTimeout(() => {
          if (!this.alive || !this.game.running) return;
          const p = pod.getWorldPosition(new THREE.Vector3());
          g.combat.fire({
            type: 'missile', team: 'player', from: p, dir, speed: 22, accel: 140, maxSpeed: 95,
            damage: MISSILE.damage, target, splash: 5, turn: target ? 5 : 0,
          });
          if (!target) {
            // Unguided: steer toward the crosshair point.
            const last = g.combat.list[g.combat.list.length - 1];
            last.vel.copy(this.aimPoint.clone().sub(p).normalize().multiplyScalar(40));
          }
          g.audio.play('missile');
          g.effects.muzzleFlash(p, dir, [3, 1.6, 0.6], 1.2);
        }, i * 90);
      }
      this.missileLocks = [];
      this.missileCd = MISSILE.cooldown;
    }

    // Arc blade
    if (input.tapped('KeyF') && this.bladeCd <= 0) {
      this.bladeCd = BLADE.cooldown;
      this.slash = 1;
      this.bladeHitDone = false;
      g.audio.play('blade');
      const t = this.lockTarget;
      if (t && t.center.distanceTo(this.center) < 30) {
        const dir = t.pos.clone().sub(this.pos).setY(0).normalize();
        this.quickBoost(dir, 55);
        this.emitThrust(12);
      } else {
        this.quickBoost(this.forward(), 30);
      }
    }
    if (this.slash > 0) {
      this.slash = Math.max(0, this.slash - dt / 0.38);
      if (this.model.blade) this.model.blade.visible = this.slash > 0;
      this.armRaise.L = 1;
      if (!this.bladeHitDone && this.slash < 0.62) {
        this.bladeHitDone = true;
        const f = this.forward();
        const origin = this.center.clone().addScaledVector(f, 1.5);
        g.effects.slashArc(origin, this.camYaw);
        g.effects.shake += 0.25;
        for (const e of g.enemies) {
          if (!e.alive || e.spawning) continue;
          const to = e.center.clone().sub(this.center);
          const d = to.length() - e.radius;
          to.y = 0;
          to.normalize();
          if (d < BLADE.reach && to.dot(f) > 0.2) {
            g.applyDamage(e, BLADE.damage, e.center.clone(), f, 'player', true);
            g.effects.sparks(e.center, f, 30, [0.8, 2.6, 3.6], 22);
            g.effects.flashLight(e.center, 0x66ccff, 160, 25);
          }
        }
      }
    } else {
      this.armRaise.L += (0.15 - this.armRaise.L) * Math.min(1, 6 * dt);
    }
  }
}

export const PLAYER_WEAPONS = { RIFLE, MISSILE, BLADE };
