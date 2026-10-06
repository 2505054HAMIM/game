import * as THREE from 'three';
import { DESIGNS } from './designs.js';
import { createMechModel } from './ModelLibrary.js';

const GRAVITY = 38;
const tmp = new THREE.Vector3();

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Shared movement, health and animation for the player and every villain.
export class Mech {
  constructor(key, scene) {
    this.key = key;
    this.design = DESIGNS[key];
    this.model = createMechModel(key);
    this.root = this.model.root;
    scene.add(this.root);
    this.scene = scene;

    const st = this.design.stats;
    this.maxHp = this.hp = st.hp;
    this.speed = st.speed;
    this.radius = st.radius;
    this.height = st.height;
    this.hoverHeight = st.hover || 0;

    this.pos = this.root.position;
    this.vel = new THREE.Vector3();
    this.boostVel = new THREE.Vector3();
    this.yaw = 0;
    this.aimYaw = 0;
    this.aimPitch = 0;
    this.onGround = true;
    this.groundY = 0;
    this.energy = 100;
    this.overheat = false;
    this.thrust = 0; // 0..1, drives flames
    this.alive = true;
    this.flash = 0;
    this.walkPhase = 0;
    this.landDip = 0;
    this.time = Math.random() * 10;
    this.armRaise = { L: 1, R: 1 };
    this.slash = 0; // >0 while blade animation plays

    if (this.model.animations?.length && this.model.glbScene) {
      this.mixer = new THREE.AnimationMixer(this.model.glbScene);
      const clip = this.model.animations.find((c) => /walk|run|idle/i.test(c.name)) || this.model.animations[0];
      this.mixer.clipAction(clip).play();
    }
  }

  get center() {
    return tmp.set(this.pos.x, this.pos.y + this.height * 0.55, this.pos.z);
  }

  // moveDir: desired horizontal direction (length 0..1) in world space.
  physics(dt, arena, moveDir, { hover = false, speedMul = 1 } = {}) {
    const target = moveDir.clone().multiplyScalar(this.speed * speedMul);
    const accel = this.onGround ? 10 : 4;
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x += (target.x - this.vel.x) * k;
    this.vel.z += (target.z - this.vel.z) * k;

    // Quick-boost impulse decays on its own.
    this.boostVel.multiplyScalar(Math.exp(-4.5 * dt));

    if (this.hoverHeight) {
      // Hover units float at a fixed height with a gentle bob.
      const want = this.hoverHeight + Math.sin(this.time * 1.7) * 0.6;
      this.vel.y += (want - this.pos.y) * 6 * dt - this.vel.y * 3 * dt;
      this.thrust = 0.6;
    } else {
      this.vel.y -= GRAVITY * dt;
      if (hover && this.vel.y < 9) {
        this.vel.y += 70 * dt;
        this.thrust = 1;
      }
    }

    this.pos.x += (this.vel.x + this.boostVel.x) * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += (this.vel.z + this.boostVel.z) * dt;

    arena.resolve(this.pos, this.radius, this.vel);
    this.groundY = arena.groundAt(this.pos.x, this.pos.z, this.pos.y, this.radius);
    const wasGround = this.onGround;
    if (this.pos.y <= this.groundY) {
      if (!wasGround && this.vel.y < -12) this.landDip = Math.min(0.6, -this.vel.y * 0.025);
      this.pos.y = this.groundY;
      if (this.vel.y < 0) this.vel.y = 0;
      this.onGround = true;
    } else {
      this.onGround = this.hoverHeight ? false : this.pos.y - this.groundY < 0.05;
    }
    this.justLanded = !wasGround && this.onGround && !this.hoverHeight;
  }

  quickBoost(dir, power = 38) {
    this.boostVel.x = dir.x * power;
    this.boostVel.z = dir.z * power;
    this.thrust = 1;
  }

  damage(amount) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.flash = 1;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      return true;
    }
    return false;
  }

  muzzleWorld(side = 'R', out = new THREE.Vector3()) {
    return this.model.arms[side].muzzle.getWorldPosition(out);
  }

  animate(dt) {
    this.time += dt;
    const m = this.model;
    if (this.mixer) this.mixer.update(dt);

    // Body turns toward the aim direction.
    const turn = this.onGround ? 8 : 5;
    this.yaw += angleDiff(this.yaw, this.aimYaw) * Math.min(1, turn * dt);
    this.root.rotation.y = this.yaw;

    // Local velocity for walk cycle and lean.
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const vx = this.vel.x + this.boostVel.x, vz = this.vel.z + this.boostVel.z;
    const fwd = vx * sin + vz * cos;
    const side = vx * cos - vz * sin;
    const speed = Math.hypot(vx, vz);

    m.body.rotation.x += ((Math.max(-0.25, Math.min(0.25, fwd * 0.012))) - m.body.rotation.x) * Math.min(1, 6 * dt);
    m.body.rotation.z += ((Math.max(-0.25, Math.min(0.25, -side * 0.012))) - m.body.rotation.z) * Math.min(1, 6 * dt);

    this.landDip *= Math.exp(-6 * dt);
    const B = m.B;
    if (m.legs) {
      const L = m.legs.L, R = m.legs.R;
      const rev = B.reverseKnee;
      const baseHip = rev ? -0.55 : 0;
      const baseKnee = rev ? 1.1 : 0.05;
      const baseAnkle = rev ? -0.55 : -0.05;
      if (this.onGround) {
        const walkSpeed = Math.min(1, speed / Math.max(1, this.speed));
        this.walkPhase += dt * (3 + speed * 0.55);
        const amp = 0.55 * walkSpeed;
        const dir = fwd >= -0.5 ? 1 : -1;
        const sideAmt = Math.max(-1, Math.min(1, side / Math.max(1, speed)));
        for (const [leg, ph] of [[L, 0], [R, Math.PI]]) {
          const p = this.walkPhase + ph;
          leg.hip.rotation.x = baseHip - Math.sin(p) * amp * dir * (1 - Math.abs(sideAmt) * 0.5) - this.landDip * 0.9;
          leg.hip.rotation.z = Math.sin(p) * amp * 0.5 * sideAmt;
          leg.knee.rotation.x = baseKnee + Math.max(0, Math.cos(p)) * amp * 1.3 + this.landDip * 1.8;
          leg.ankle.rotation.x = baseAnkle - Math.max(0, Math.cos(p)) * amp * 0.5 - this.landDip * 0.9;
        }
        m.hips.position.y = B.hipH - Math.abs(Math.sin(this.walkPhase)) * 0.12 * walkSpeed - this.landDip * 0.8;
      } else {
        // Airborne: legs tucked.
        for (const [leg, s] of [[L, 1], [R, -1]]) {
          leg.hip.rotation.x += ((baseHip - 0.35 + s * 0.15) - leg.hip.rotation.x) * Math.min(1, 6 * dt);
          leg.hip.rotation.z *= 0.9;
          leg.knee.rotation.x += ((baseKnee + 0.7) - leg.knee.rotation.x) * Math.min(1, 6 * dt);
          leg.ankle.rotation.x += ((baseAnkle - 0.2) - leg.ankle.rotation.x) * Math.min(1, 6 * dt);
        }
        m.hips.position.y += (B.hipH - m.hips.position.y) * Math.min(1, 6 * dt);
      }
    } else if (!m.isGLB) {
      m.hips.position.y = B.hipH + Math.sin(this.time * 2.2) * 0.12;
    }
    if (m.hoverRing) m.hoverRing.rotation.z += dt * 3;

    // Torso tracks pitch; arms raise their weapons toward the aim.
    m.torso.rotation.x = -this.aimPitch * 0.25;
    for (const s of ['L', 'R']) {
      const arm = m.arms[s];
      if (!arm) continue;
      const raise = this.armRaise[s];
      const rest = -0.15;
      let rx = rest + (-(Math.PI / 2) - this.aimPitch * 0.75 - rest) * raise;
      if (s === 'L' && this.slash > 0) {
        // Blade swing from high right to low left.
        const t = 1 - this.slash;
        rx = -2.3 + t * 2.6;
        arm.shoulder.rotation.z = 0.9 - t * 1.4;
      } else {
        arm.shoulder.rotation.z += (0 - arm.shoulder.rotation.z) * Math.min(1, 10 * dt);
      }
      arm.shoulder.rotation.x += (rx - arm.shoulder.rotation.x) * Math.min(1, 14 * dt);
      arm.elbow.rotation.x = -0.08 * raise;
      if (arm.weapon.userData.spin) arm.weapon.userData.spin.rotation.y += dt * (this.firing ? 22 : 2);
    }

    // Thruster flames
    this.thrust = Math.max(this.thrust * Math.exp(-5 * dt), Math.min(1, Math.hypot(this.boostVel.x, this.boostVel.z) / 30));
    for (const f of m.thrusters) {
      const s = 0.001 + this.thrust * (0.8 + Math.random() * 0.4);
      f.scale.set(s * 0.9 + 0.3 * this.thrust, s * (1.2 + this.thrust), s * 0.9 + 0.3 * this.thrust);
    }

    // Hit flash
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 7);
      const v = this.flash * 0.35;
      if (m.isGLB) {
        for (const mesh of m.meshes) mesh.material.emissive?.setRGB(v, v * 0.7, v * 0.5);
      } else {
        for (const k of ['armor', 'frame', 'accent']) m.materials[k].emissive.setRGB(v, v * 0.7, v * 0.5);
      }
    }
  }

  dispose() {
    this.root.removeFromParent();
  }
}
