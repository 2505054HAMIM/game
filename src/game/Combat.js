import * as THREE from 'three';

// Closest approach between segment p0→p1 and q0→q1. Returns { s, dist }.
function segSeg(p0, p1, q0, q1) {
  const d1x = p1.x - p0.x, d1y = p1.y - p0.y, d1z = p1.z - p0.z;
  const d2x = q1.x - q0.x, d2y = q1.y - q0.y, d2z = q1.z - q0.z;
  const rx = p0.x - q0.x, ry = p0.y - q0.y, rz = p0.z - q0.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a < 1e-9) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    const b = d1x * d2x + d1y * d2y + d1z * d2z;
    const den = a * e - b * b;
    s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
    t = (b * s + f) / e;
    if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
  }
  const dx = rx + d1x * s - d2x * t;
  const dy = ry + d1y * s - d2y * t;
  const dz = rz + d1z * s - d2z * t;
  return { s, dist: Math.sqrt(dx * dx + dy * dy + dz * dz) };
}

const qa = new THREE.Vector3();
const qb = new THREE.Vector3();

// Swept hit test of a segment against a mech's body capsule.
export function hitMech(mech, a, b, pad = 0) {
  const lo = mech.hoverHeight ? 0.25 : 0.12;
  qa.set(mech.pos.x, mech.pos.y + mech.height * lo, mech.pos.z);
  qb.set(mech.pos.x, mech.pos.y + mech.height * 0.92, mech.pos.z);
  const r = segSeg(a, b, qa, qb);
  return r.dist < mech.radius + pad ? r.s : -1;
}

const TYPES = {
  pulse:   { color: [0.6, 2.2, 3.6], len: 3.2, width: 0.12, life: 1.1 },
  bolt:    { color: [3.6, 0.35, 0.3], len: 2.2, width: 0.14, life: 1.4 },
  mortar:  { color: [3.6, 1.4, 0.3], len: 0.9, width: 0.9, life: 4, gravity: 26, explosive: true },
  missile: { color: [3.2, 1.6, 0.6], len: 1.1, width: 0.22, life: 6, explosive: true, homing: true },
  emissile:{ color: [2.6, 0.4, 3.4], len: 1.1, width: 0.24, life: 7, explosive: true, homing: true },
  orb:     { color: [3.8, 0.3, 0.5], len: 1.2, width: 1.2, life: 3 },
};

export class Combat {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.list = [];
    this.pool = new Map();
    this.geo = {
      streak: new THREE.CylinderGeometry(1, 1, 1, 6, 1).rotateX(Math.PI / 2),
      ball: new THREE.SphereGeometry(0.5, 12, 8),
      missile: new THREE.ConeGeometry(0.5, 1, 8).rotateX(Math.PI / 2),
    };
    this.mats = {};
    for (const [k, t] of Object.entries(TYPES)) {
      this.mats[k] = new THREE.MeshBasicMaterial({ color: new THREE.Color(...t.color) });
    }
  }

  mesh(type) {
    const p = this.pool.get(type);
    if (p && p.length) {
      const m = p.pop();
      this.scene.add(m);
      return m;
    }
    const t = TYPES[type];
    const geo = type === 'mortar' || type === 'orb' ? this.geo.ball : type.includes('missile') ? this.geo.missile : this.geo.streak;
    const m = new THREE.Mesh(geo, this.mats[type]);
    if (geo === this.geo.streak) m.scale.set(t.width, t.width, t.len);
    else if (geo === this.geo.ball) m.scale.setScalar(t.width);
    else m.scale.set(t.width * 1.2, t.width * 1.2, t.len * 1.4);
    this.scene.add(m);
    return m;
  }

  release(p) {
    p.mesh.removeFromParent();
    if (!this.pool.has(p.type)) this.pool.set(p.type, []);
    this.pool.get(p.type).push(p.mesh);
  }

  // team: 'player' | 'enemy'
  fire({ type, team, from, dir, speed, damage, target = null, splash = 0, turn = 3, accel = 0, maxSpeed = speed, owner = null }) {
    const t = TYPES[type];
    const mesh = this.mesh(type);
    mesh.position.copy(from);
    const vel = dir.clone().normalize().multiplyScalar(speed);
    mesh.lookAt(from.clone().add(vel));
    this.list.push({
      type, team, mesh, vel, damage, target, splash: splash || (t.explosive ? 6 : 0), turn, accel, maxSpeed,
      life: t.life, age: 0, owner, prev: from.clone(),
    });
  }

  update(dt) {
    const g = this.game;
    const fx = g.effects;
    const next = new THREE.Vector3();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      const t = TYPES[p.type];
      p.age += dt;
      p.life -= dt;
      const pos = p.mesh.position;

      if (t.homing) {
        const speed = Math.min(p.maxSpeed, p.vel.length() + p.accel * dt);
        if (p.target && p.target.alive && p.age > 0.15) {
          const want = p.target.center.clone().sub(pos).normalize();
          const cur = p.vel.clone().normalize();
          const ang = cur.angleTo(want);
          const k = ang > 1e-4 ? Math.min(1, (p.turn * dt) / ang) : 1;
          cur.lerp(want, k).normalize();
          p.vel.copy(cur.multiplyScalar(speed));
        } else {
          p.vel.setLength(speed);
        }
        fx.trail(pos, p.type === 'emissile' ? [2.4, 0.4, 3.0] : [3, 1.6, 0.6], 0.7, true);
      }
      if (t.gravity) {
        p.vel.y -= t.gravity * dt;
        if (Math.random() < 0.6) fx.trail(pos, [3, 1.2, 0.3], 1.0, false);
      }
      if (p.type === 'orb' && Math.random() < 0.5) fx.trail(pos, [3, 0.3, 0.5], 1.4, false);

      p.prev.copy(pos);
      next.copy(pos).addScaledVector(p.vel, dt);

      // Find the earliest impact along this step.
      let hitT = g.arena.raycast(pos, next);
      let hitMechRef = null;
      const targets = p.team === 'player' ? g.enemies : (g.player.alive ? [g.player] : []);
      for (const m of targets) {
        if (!m.alive) continue;
        const s = hitMech(m, pos, next, p.type === 'pulse' ? 0.35 : 0.2);
        if (s >= 0 && (hitT < 0 || s < hitT)) { hitT = s; hitMechRef = m; }
      }

      if (hitT >= 0) {
        const at = pos.clone().lerp(next, hitT);
        const dir = p.vel.clone().normalize();
        if (p.splash) {
          g.explode(at, p.splash, p.damage, p.team, hitMechRef, p.splash > 9 ? 1.6 : 0.9);
        } else {
          if (hitMechRef) g.applyDamage(hitMechRef, p.damage, at, dir, p.team);
          fx.sparks(at, dir.clone().negate(), p.type === 'pulse' ? 8 : 6, t.color, 14);
          fx.fire.emit(at.x, at.y, at.z, 0, 0, 0, t.color[0], t.color[1], t.color[2], 1.6, 0.08);
        }
        this.release(p);
        this.list.splice(i, 1);
        continue;
      }

      pos.copy(next);
      p.mesh.lookAt(next.clone().add(p.vel));
      if (p.life <= 0) {
        if (t.explosive) g.explode(pos.clone(), p.splash, p.damage, p.team, null, 0.8);
        this.release(p);
        this.list.splice(i, 1);
      }
    }
  }

  clear() {
    for (const p of this.list) this.release(p);
    this.list.length = 0;
  }
}
