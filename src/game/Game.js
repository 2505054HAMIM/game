import * as THREE from 'three';
import { Renderer } from '../engine/Renderer.js';
import { Input } from '../engine/Input.js';
import { Arena } from '../world/Arena.js';
import { Effects } from './Effects.js';
import { Combat } from './Combat.js';
import { Player } from './Player.js';
import { Enemy } from './Enemy.js';
import { HUD } from '../ui/HUD.js';
import { Mech } from '../mech/Mech.js';

const CHAIN_WINDOW = 4;

function waveRoster(w) {
  const list = [];
  if (w % 5 === 0) {
    list.push('overlord');
    for (let i = 0; i < Math.min(2 + w / 5, 4); i++) list.push('raider');
    if (w >= 10) list.push('wraith', 'juggernaut');
    return list;
  }
  const raiders = Math.min(2 + w, 7);
  const juggs = Math.min(Math.floor(w / 2), 3);
  const wraiths = Math.min(Math.floor((w - 1) / 2), 3);
  for (let i = 0; i < raiders; i++) list.push('raider');
  for (let i = 0; i < juggs; i++) list.push('juggernaut');
  for (let i = 0; i < wraiths; i++) list.push('wraith');
  return list;
}

export class Game {
  constructor({ container, quality, audio, ui }) {
    this.renderer = new Renderer(container, quality);
    this.scene = this.renderer.scene;
    this.high = this.renderer.high;
    this.audio = audio;
    this.ui = ui;
    this.input = new Input(this.renderer.renderer.domElement);
    this.arena = new Arena(this.scene, this.high);
    this.effects = new Effects(this.scene, this.high);
    this.effects.pixelRatio = this.renderer.renderer.getPixelRatio();
    this.combat = new Combat(this);
    this.hud = new HUD();

    this.enemies = [];
    this.pendingSpawns = [];
    this.beams = [];
    this.running = false;
    this.paused = false;
    this.over = false;
    this.timeScale = 1;
    this.wave = 0;
    this.score = 0;
    this.kills = 0;
    this.chain = 0;
    this.chainT = 0;
    this.waveClearT = -1;

    this.player = new Player(this);
    this.player.reset(new THREE.Vector3(0, 0, 60));
    this.buildShowcase();

    this.beamGeo = new THREE.CylinderGeometry(1.2, 1.2, 80, 16, 1, true);
    this.beamGeo.translate(0, 40, 0);

    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // Title screen: the Vanguard faces down an Overlord while the camera orbits.
  buildShowcase() {
    this.showcase = [];
    const p = this.player;
    p.pos.set(-4, 0, 14);
    p.yaw = p.aimYaw = Math.PI * 0.85;
    p.armRaise.L = 0.15;
    const boss = new Mech('overlord', this.scene);
    boss.pos.set(6, 0, -14);
    boss.yaw = boss.aimYaw = -Math.PI * 0.15;
    boss.armRaise.L = boss.armRaise.R = 0.7;
    const r1 = new Mech('raider', this.scene);
    r1.pos.set(-12, 0, -8);
    r1.yaw = r1.aimYaw = 0.6;
    const r2 = new Mech('wraith', this.scene);
    r2.pos.set(18, 9, -2);
    r2.yaw = r2.aimYaw = -1.2;
    this.showcase.push(boss, r1, r2);
    this.showcaseT = 0;
  }

  clearShowcase() {
    for (const m of this.showcase) m.dispose();
    this.showcase = [];
  }

  start() {
    this.clearShowcase();
    for (const e of this.enemies) e.dispose();
    for (const b of this.beams) b.mesh.removeFromParent();
    this.enemies = [];
    this.pendingSpawns = [];
    this.beams = [];
    this.combat.clear();
    this.effects.clear();
    this.hud.clear();
    if (this.player.broken) this.player = new Player(this);
    this.player.reset(new THREE.Vector3(0, 0, 0));
    this.renderer.camera.clearViewOffset();
    this.player.camPos.set(0, 0, 0);
    this.wave = 0;
    this.score = 0;
    this.kills = 0;
    this.chain = 0;
    this.over = false;
    this.paused = false;
    this.running = true;
    this.timeScale = 1;
    this.input.enabled = true;
    this.hud.show(true);
    this.nextWave();
  }

  nextWave() {
    this.wave++;
    this.waveClearT = -1;
    const roster = waveRoster(this.wave);
    const isBoss = roster.includes('overlord');
    // Spawn on the far side of the arena from the player.
    const pp = this.player.pos;
    const base = Math.hypot(pp.x, pp.z) < 12 ? Math.random() * Math.PI * 2 : Math.atan2(-pp.z, -pp.x);
    roster.forEach((key, i) => {
      const ang = base + (i - roster.length / 2) * 0.45 + (Math.random() - 0.5) * 0.3;
      const rad = key === 'overlord' ? 30 : 40 + Math.random() * 30;
      const at = new THREE.Vector3(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
      this.pendingSpawns.push({ key, at, delay: 1.2 + i * 0.35 + (key === 'overlord' ? 1.5 : 0) });
      this.addBeam(at, key === 'overlord');
    });
    if (isBoss) {
      this.hud.showBanner('WARNING · COMMAND UNIT DETECTED', 'OVERLORD');
      this.audio.play('alarm');
      setTimeout(() => this.running && this.audio.play('alarm'), 900);
    } else {
      this.hud.showBanner(this.wave === 1 ? 'CRIMSON LEGION INBOUND' : 'HOSTILES INBOUND', `WAVE ${this.wave}`);
      this.audio.play('wave');
    }
  }

  addBeam(at, big) {
    const mat = new THREE.MeshBasicMaterial({
      color: big ? new THREE.Color(3, 1.2, 0.2) : new THREE.Color(2.4, 0.2, 0.25),
      transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.beamGeo, mat);
    mesh.position.copy(at);
    mesh.scale.set(big ? 3 : 1.2, 1, big ? 3 : 1.2);
    this.scene.add(mesh);
    this.beams.push({ mesh, at, t: 0 });
  }

  applyDamage(target, amount, pos, dir, team, crit = false) {
    if (!target.alive) return;
    if (target === this.player) {
      if (this.over) return;
      const killed = target.damage(amount);
      this.hud.hurt(amount);
      this.audio.play('hurt');
      this.effects.shake += Math.min(0.6, amount / 150);
      if (killed) this.onPlayerDeath();
      return;
    }
    const killed = target.damage(amount);
    if (team === 'player') {
      this.hud.hitMarker();
      this.hud.damageNumber(pos, amount, crit);
      this.audio.play('hit');
    }
    if (killed) this.onEnemyKilled(target, dir);
  }

  explode(pos, radius, damage, team, direct, scale = 1, groundWave = false) {
    this.effects.explosion(pos, scale, team === 'enemy' && groundWave ? [3.6, 0.6, 0.3] : undefined);
    this.audio.play(scale > 1.4 ? 'bigExplosion' : 'explosion', pos.distanceTo(this.player.pos));
    this.effects.shake += Math.max(0, scale * 0.5 - pos.distanceTo(this.player.pos) / 60);
    const targets = team === 'player' ? this.enemies : [this.player];
    for (const m of targets) {
      if (!m.alive || m.spawning) continue;
      if (groundWave && m.pos.y - m.groundY > 2.5) continue; // jump to avoid the slam
      const d = m.center.distanceTo(pos) - m.radius;
      if (m === direct) this.applyDamage(m, damage, pos, null, team);
      else if (d < radius) this.applyDamage(m, damage * (1 - Math.max(0, d) / radius) * 0.85, m.center.clone(), null, team);
    }
  }

  onEnemyKilled(e, dir) {
    this.kills++;
    this.chain = this.chainT > 0 ? this.chain + 1 : 1;
    this.chainT = CHAIN_WINDOW;
    this.score += Math.round(e.design.stats.score * (1 + (this.chain - 1) * 0.25) * (1 + (this.wave - 1) * 0.1));
    const c = e.center.clone();
    const big = e.isBoss;
    this.effects.explosion(c, big ? 3.2 : e.design.scale * 1.3);
    if (big) {
      setTimeout(() => this.effects.explosion(c.clone().add(new THREE.Vector3(3, 4, 1)), 2), 250);
      setTimeout(() => this.effects.explosion(c.clone().add(new THREE.Vector3(-3, 2, -2)), 2.4), 500);
      this.timeScale = 0.3;
      setTimeout(() => { this.timeScale = 1; }, 1400);
    }
    this.effects.breakApart(e, dir);
    this.audio.play(big ? 'bigExplosion' : 'explosion', c.distanceTo(this.player.pos) * 0.5);
  }

  onPlayerDeath() {
    this.over = true;
    this.input.enabled = false;
    const c = this.player.center.clone();
    this.effects.explosion(c, 2);
    this.effects.breakApart(this.player, null);
    this.audio.play('bigExplosion');
    this.audio.setBoost(0);
    this.timeScale = 0.35;
    setTimeout(() => {
      this.running = false;
      this.timeScale = 1;
      this.input.releaseLock();
      this.ui.gameOver({ wave: this.wave, kills: this.kills, score: this.score });
    }, 1600);
  }

  setPaused(v) {
    if (!this.running || this.over) return;
    this.paused = v;
    this.audio.setBoost(0);
    this.input.enabled = !v;
    if (v) this.input.releaseLock();
  }

  loop() {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const raw = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.running && !this.paused) this.update(raw * this.timeScale);
    else if (!this.running) this.updateShowcase(raw);
    this.renderer.render();
    this.input.endFrame();
  }

  updateShowcase(dt) {
    this.showcaseT += dt;
    const t = this.showcaseT * 0.08;
    const cam = this.renderer.camera;
    cam.position.set(Math.sin(t) * 25 - 2, 6 + Math.sin(t * 0.7) * 2, Math.cos(t) * 25 + 4);
    cam.lookAt(0, 5, 0);
    // Shift the framing right so the mechs sit beside the title text.
    const w = window.innerWidth, h = window.innerHeight;
    if (w > 760) cam.setViewOffset(w, h, -w * 0.12, 0, w, h);
    else cam.clearViewOffset();
    for (const m of this.showcase) {
      m.vel.set(0, 0, 0);
      m.animate(dt);
    }
    if (this.player.root.parent) this.player.animate(dt);
    this.arena.update(dt, null);
    this.effects.update(dt, cam);
    // Idle thruster shimmer and the Overlord's eyes flaring.
    if (Math.random() < 0.3 && this.showcase[2]) {
      const v = new THREE.Vector3();
      for (const f of this.showcase[2].model.thrusters) {
        f.getWorldPosition(v);
        this.effects.thruster(v, new THREE.Vector3(0, -1, 0), [2.4, 0.3, 3.4]);
      }
    }
  }

  update(dt) {
    const p = this.player;
    if (p.alive) p.update(dt, this.input);
    else this.player.updateCamera?.(dt);

    // Spawn queue
    for (let i = this.pendingSpawns.length - 1; i >= 0; i--) {
      const s = this.pendingSpawns[i];
      s.delay -= dt;
      if (s.delay <= 0) {
        this.enemies.push(new Enemy(this, s.key, s.at));
        this.pendingSpawns.splice(i, 1);
      }
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      const life = 2.6;
      b.mesh.material.opacity = Math.sin(Math.min(1, b.t / life) * Math.PI) * 0.35;
      b.mesh.rotation.y += dt;
      if (b.t > life) {
        b.mesh.removeFromParent();
        b.mesh.material.dispose();
        this.beams.splice(i, 1);
      }
    }

    for (const e of this.enemies) if (e.alive) e.update(dt);
    this.enemies = this.enemies.filter((e) => e.alive);

    this.combat.update(dt);
    this.arena.update(dt, p.pos);
    this.effects.update(dt, this.renderer.camera);

    this.chainT -= dt;
    if (this.chainT <= 0) this.chain = 0;

    // Wave cleared
    if (!this.over && this.enemies.length === 0 && this.pendingSpawns.length === 0) {
      if (this.waveClearT < 0) {
        this.waveClearT = 3.2;
        const wasBoss = this.wave % 5 === 0;
        this.hud.showBanner(wasBoss ? 'OVERLORD DESTROYED' : 'AREA CLEAR', wasBoss ? 'COMMAND UNIT DOWN' : 'REPAIRING');
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * (wasBoss ? 0.6 : 0.3));
        p.ammo = 40;
        p.reloadT = 0;
        p.missileCd = 0;
        this.score += 250 * this.wave;
      }
      this.waveClearT -= dt;
      if (this.waveClearT <= 0) this.nextWave();
    }

    this.hud.update(dt, this);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.running = false;
    this.input.dispose();
    this.hud.clear();
    this.renderer.dispose();
  }
}
