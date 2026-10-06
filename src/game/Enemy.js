import * as THREE from 'three';
import { Mech } from '../mech/Mech.js';

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();

// Crimson Legion units. Each type shares the same brain with different numbers
// (see designs.js); the Overlord adds attack patterns on top.
export class Enemy extends Mech {
  constructor(game, key, spawnAt) {
    super(key, game.scene);
    this.game = game;
    this.team = 'enemy';
    this.attack = this.design.attack;
    this.ai = this.design.ai;
    this.burstLeft = 0;
    this.attackT = 1 + Math.random() * 1.5;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 2 + Math.random() * 2;
    this.dodgeCd = 1;
    this.jumpCd = 2 + Math.random() * 3;
    this.side = 'R';
    this.isBoss = key === 'overlord';
    this.pattern = 0;
    this.patternT = 3;
    this.patternState = null;

    // Drop in from above.
    this.spawning = true;
    this.pos.set(spawnAt.x, 55 + Math.random() * 10, spawnAt.z);
    this.vel.set(0, -36, 0);
    this.yaw = this.aimYaw = Math.atan2(-spawnAt.x, -spawnAt.z);
  }

  update(dt) {
    const g = this.game;
    const player = g.player;
    if (this.spawning) {
      this.thrust = 1;
      const groundAim = this.hoverHeight || 0;
      const h = this.pos.y - groundAim;
      // Retro-thrusters slow the fall near the ground.
      if (h < 14) this.vel.y += (-6 - this.vel.y) * Math.min(1, 5 * dt);
      this.pos.y += this.vel.y * dt;
      if (Math.random() < 0.8) {
        for (const f of this.model.thrusters) {
          f.getWorldPosition(v1);
          g.effects.thruster(v1, v2.set(0, -1, 0), this.design.colors.glow);
        }
      }
      if (h <= 0.2) {
        this.pos.y = groundAim;
        this.vel.y = 0;
        this.spawning = false;
        g.effects.shockwave(this.pos, 8 * this.design.scale, this.design.colors.glow);
        g.effects.shake += 0.2 * this.design.scale;
        g.audio.play('land', this.pos.distanceTo(player.pos));
      }
      this.aimYaw = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      this.animate(dt);
      return;
    }

    const toP = v1.copy(player.pos).sub(this.pos);
    toP.y = 0;
    const dist = toP.length();
    const dirP = toP.clone().normalize();
    this.aimYaw = Math.atan2(dirP.x, dirP.z);

    // Movement: hold preferred range and circle-strafe.
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafeDir *= -1;
      this.strafeT = 1.5 + Math.random() * 3;
    }
    const tangent = new THREE.Vector3(-dirP.z, 0, dirP.x).multiplyScalar(this.strafeDir * this.ai.strafe);
    const radial = dirP.clone().multiplyScalar(Math.max(-1, Math.min(1, (dist - this.ai.prefRange) / 10)));
    const move = radial.add(tangent);
    // Keep some distance from allies.
    for (const o of g.enemies) {
      if (o === this || !o.alive) continue;
      v2.copy(this.pos).sub(o.pos);
      v2.y = 0;
      const d = v2.length();
      const min = (this.radius + o.radius) * 2.2;
      if (d < min && d > 0.01) move.addScaledVector(v2.normalize(), (min - d) / min * 1.5);
    }
    if (move.lengthSq() > 1) move.normalize();

    // Dodge when the player is targeting this unit.
    this.dodgeCd -= dt;
    if (this.ai.dodge && player.lockTarget === this && player.firing && this.dodgeCd <= 0 && Math.random() < this.ai.dodge * dt * 3) {
      this.quickBoost(tangent.lengthSq() ? tangent.clone().normalize() : dirP, 32);
      this.dodgeCd = 2.5;
    }
    this.jumpCd -= dt;
    if (this.key === 'raider' && this.onGround && this.jumpCd <= 0) {
      this.vel.y = 13;
      this.jumpCd = 3 + Math.random() * 4;
    }

    const enraged = this.isBoss && this.hp < this.maxHp * 0.5;
    this.physics(dt, g.arena, move, { hover: this.key === 'raider' && this.vel.y < 0 && this.pos.y > 4 && Math.random() < 0.5, speedMul: enraged ? 1.4 : 1 });

    // Aim
    const target = player.center.clone();
    const muzzle = this.muzzleWorld(this.side, new THREE.Vector3());
    const toT = target.clone().sub(muzzle);
    this.aimPitch = Math.atan2(toT.y, Math.hypot(toT.x, toT.z));

    if (player.alive) {
      if (this.isBoss) this.bossAttack(dt, dist, enraged);
      else this.basicAttack(dt, dist);
    }
    this.animate(dt);
  }

  canSee() {
    return this.game.arena.raycast(this.center.clone(), this.game.player.center.clone()) < 0;
  }

  aimDir(from, speed, spread, lead = 0.7) {
    const p = this.game.player;
    const c = p.center.clone();
    const t = c.distanceTo(from) / speed;
    c.addScaledVector(p.vel, t * lead).addScaledVector(p.boostVel, t * lead * 0.3);
    const d = c.sub(from).normalize();
    d.x += (Math.random() - 0.5) * spread * 2;
    d.y += (Math.random() - 0.5) * spread * 2;
    d.z += (Math.random() - 0.5) * spread * 2;
    return d.normalize();
  }

  basicAttack(dt, dist) {
    const g = this.game;
    const a = this.attack;
    this.attackT -= dt;
    if (this.attackT > 0) return;
    if (this.burstLeft <= 0) {
      if (dist > a.range || !this.canSee()) { this.attackT = 0.5; return; }
      this.burstLeft = a.burst;
    }
    this.burstLeft--;
    this.attackT = this.burstLeft > 0 ? a.interval : a.rest * (0.8 + Math.random() * 0.5);
    const dPlayer = dist;

    if (a.kind === 'bolt') {
      this.side = this.side === 'R' ? 'L' : 'R';
      const from = this.muzzleWorld(this.side, new THREE.Vector3());
      const dir = this.aimDir(from, a.speed, a.spread);
      g.combat.fire({ type: 'bolt', team: 'enemy', from, dir, speed: a.speed, damage: a.damage });
      g.effects.muzzleFlash(from, dir, this.design.colors.glow, 1.2);
      g.audio.play('enemyShot', dPlayer);
    } else if (a.kind === 'mortar') {
      const cannon = this.model.cannons[this.burstLeft % 2];
      const from = cannon.getWorldPosition(new THREE.Vector3());
      // Ballistic arc: pick a flight time and solve for launch velocity.
      const p = g.player;
      const T = 1.1 + dist / 60;
      const aimAt = p.pos.clone().addScaledVector(p.vel, T * 0.6);
      aimAt.x += (Math.random() - 0.5) * 4;
      aimAt.z += (Math.random() - 0.5) * 4;
      const vel = new THREE.Vector3(
        (aimAt.x - from.x) / T,
        (aimAt.y + 1 - from.y + 0.5 * 26 * T * T) / T,
        (aimAt.z - from.z) / T,
      );
      g.combat.fire({ type: 'mortar', team: 'enemy', from, dir: vel, speed: vel.length(), damage: a.damage, splash: a.splash });
      g.effects.muzzleFlash(from, vel.clone().normalize(), [3.4, 1.4, 0.3], 2.2);
      g.effects.shake += Math.max(0, 0.2 - dPlayer / 400);
      g.audio.play('mortar', dPlayer);
    } else if (a.kind === 'missile') {
      const pod = this.model.launchers[this.burstLeft % this.model.launchers.length];
      const from = pod.getWorldPosition(new THREE.Vector3());
      const dir = new THREE.Vector3((Math.random() - 0.5), 1, (Math.random() - 0.5)).normalize();
      g.combat.fire({ type: 'emissile', team: 'enemy', from, dir, speed: 18, accel: 30, maxSpeed: a.speed, damage: a.damage, target: g.player, splash: 4.5, turn: 1.7 });
      g.audio.play('missile', dPlayer);
    }
  }

  bossAttack(dt, dist, enraged) {
    const g = this.game;
    const a = this.attack;
    const rate = enraged ? 1.5 : 1;
    this.patternT -= dt * rate;
    const st = this.patternState;

    if (!st) {
      if (this.patternT > 0) return;
      const patterns = ['gatling', 'fan', 'salvo', 'slam'];
      const name = patterns[this.pattern % patterns.length];
      this.pattern++;
      this.patternState = { name, t: 0, shots: 0 };
      if (name === 'slam') {
        this.vel.y = 26;
        this.onGround = false;
        g.audio.play('alarm');
      }
      return;
    }

    st.t += dt * rate;
    const dPlayer = dist;
    if (st.name === 'gatling') {
      this.firing = true;
      if (st.t > st.shots * 0.07) {
        st.shots++;
        this.side = this.side === 'R' ? 'L' : 'R';
        const from = this.muzzleWorld(this.side, new THREE.Vector3());
        const dir = this.aimDir(from, a.speed, 0.05);
        g.combat.fire({ type: 'bolt', team: 'enemy', from, dir, speed: a.speed, damage: a.damage });
        g.effects.muzzleFlash(from, dir, [3.6, 0.4, 0.3], 1.8);
        if (st.shots % 2) g.audio.play('enemyShot', dPlayer);
      }
      if (st.t > 2.4) this.endPattern(2.2);
    } else if (st.name === 'fan') {
      if (st.shots < 3 && st.t > st.shots * 0.45) {
        st.shots++;
        const from = this.center.clone();
        from.y += 1.5;
        const base = Math.atan2(g.player.pos.x - this.pos.x, g.player.pos.z - this.pos.z);
        const n = enraged ? 17 : 13;
        for (let i = 0; i < n; i++) {
          const ang = base + (i / (n - 1) - 0.5) * 1.6 + (st.shots % 2 ? 0.06 : 0);
          const dir = new THREE.Vector3(Math.sin(ang), -0.06, Math.cos(ang));
          g.combat.fire({ type: 'orb', team: 'enemy', from, dir, speed: 46, damage: 55 });
        }
        g.effects.flashLight(from, 0xff2040, 200, 40);
        g.audio.play('mortar', dPlayer);
      }
      if (st.t > 1.8) this.endPattern(2.0);
    } else if (st.name === 'salvo') {
      const n = enraged ? 10 : 7;
      if (st.shots < n && st.t > st.shots * 0.12) {
        const pod = this.model.launchers[st.shots % this.model.launchers.length];
        st.shots++;
        const from = pod.getWorldPosition(new THREE.Vector3());
        const dir = new THREE.Vector3((Math.random() - 0.5) * 1.4, 1, (Math.random() - 0.5) * 1.4).normalize();
        g.combat.fire({ type: 'emissile', team: 'enemy', from, dir, speed: 20, accel: 35, maxSpeed: 40, damage: 50, target: g.player, splash: 4.5, turn: 1.5 });
        g.audio.play('missile', dPlayer);
      }
      if (st.t > 2.2) this.endPattern(2.0);
    } else if (st.name === 'slam') {
      // Leap toward the player, then crash down with a shockwave.
      if (!this.onGround) {
        const to = g.player.pos.clone().sub(this.pos).setY(0);
        this.boostVel.copy(to.multiplyScalar(0.9));
      }
      if (st.t > 0.4 && this.onGround) {
        const R = 16;
        g.explode(this.pos.clone().setY(0.5), R, 160, 'enemy', null, 2.2, true);
        this.endPattern(2.6);
      }
      if (st.t > 4) this.endPattern(2);
    }
  }

  endPattern(wait) {
    this.patternState = null;
    this.patternT = wait;
    this.firing = false;
  }
}
