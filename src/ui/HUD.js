import * as THREE from 'three';
import { ARENA_RADIUS } from '../world/Arena.js';

const $ = (id) => document.getElementById(id);
const proj = new THREE.Vector3();

export class HUD {
  constructor() {
    this.el = $('hud');
    this.apFill = $('ap-fill');
    this.apValue = $('ap-value');
    this.enFill = $('en-fill');
    this.enValue = $('en-value');
    this.status = $('status');
    this.rifleAmmo = $('rifle-ammo');
    this.missileState = $('missile-state');
    this.bladeState = $('blade-state');
    this.wMissile = $('w-missile');
    this.wBlade = $('w-blade');
    this.wRifle = $('w-rifle');
    this.waveLabel = $('wave-label');
    this.hostileCount = $('hostile-count');
    this.score = $('score');
    this.combo = $('combo');
    this.crosshair = $('crosshair');
    this.vignette = $('vignette');
    this.markers = $('markers');
    this.dmgLayer = $('damage-numbers');
    this.bossBar = $('boss-bar');
    this.bossFill = $('boss-fill');
    this.bossName = $('boss-name');
    this.banner = $('banner');
    this.radar = $('radar');
    this.radarCtx = this.radar.getContext('2d');
    this.markerPool = new Map();
    this.dmgNums = [];
    this.hitT = 0;
    this.hurtT = 0;
    this.lastText = {};
  }

  show(v) { this.el.hidden = !v; }

  text(el, key, value) {
    if (this.lastText[key] !== value) {
      el.textContent = value;
      this.lastText[key] = value;
    }
  }

  showBanner(kicker, title) {
    $('banner-kicker').textContent = kicker;
    $('banner-title').textContent = title;
    this.banner.hidden = true;
    void this.banner.offsetWidth; // restart the CSS animation
    this.banner.hidden = false;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => { this.banner.hidden = true; }, 2600);
  }

  hitMarker() { this.hitT = 0.12; }
  hurt(amount) { this.hurtT = Math.min(1, this.hurtT + amount / 150); }

  damageNumber(pos, amount, crit) {
    const el = document.createElement('div');
    el.className = crit ? 'dmg crit' : 'dmg';
    el.textContent = Math.round(amount);
    this.dmgLayer.appendChild(el);
    this.dmgNums.push({ el, pos: pos.clone(), t: 0, dx: (Math.random() - 0.5) * 30 });
  }

  update(dt, game) {
    const p = game.player;
    const cam = game.renderer.camera;
    const w = window.innerWidth, h = window.innerHeight;

    this.apFill.style.transform = `scaleX(${p.hp / p.maxHp})`;
    this.text(this.apValue, 'ap', String(Math.ceil(p.hp)));
    this.enFill.style.transform = `scaleX(${p.energy / 100})`;
    this.text(this.enValue, 'en', String(Math.floor(p.energy)));
    this.status.classList.toggle('low-ap', p.hp < p.maxHp * 0.3);
    this.status.classList.toggle('en-out', p.overheat);

    this.text(this.rifleAmmo, 'ammo', p.reloadT > 0 ? 'RELOAD' : String(p.ammo));
    this.wRifle.classList.toggle('cooling', p.reloadT > 0);
    const mText = p.missileCd > 0 ? p.missileCd.toFixed(1) : p.locking ? `LOCK ${p.missileLocks.length}` : 'READY';
    this.text(this.missileState, 'missile', mText);
    this.wMissile.classList.toggle('cooling', p.missileCd > 0);
    this.text(this.bladeState, 'blade', p.bladeCd > 0 ? p.bladeCd.toFixed(1) : 'READY');
    this.wBlade.classList.toggle('cooling', p.bladeCd > 0);

    this.text(this.waveLabel, 'wave', `WAVE ${game.wave}`);
    this.text(this.hostileCount, 'hostiles', String(game.enemies.filter((e) => e.alive).length + game.pendingSpawns.length));
    this.text(this.score, 'score', game.score.toLocaleString('en-US'));
    this.combo.hidden = game.chain < 2;
    if (game.chain >= 2) this.text(this.combo, 'chain', `x${game.chain} CHAIN`);

    this.hitT -= dt;
    this.crosshair.classList.toggle('hit', this.hitT > 0);
    this.crosshair.classList.toggle('locked', !!p.lockTarget);
    this.hurtT = Math.max(0, this.hurtT - dt * 1.5);
    const low = p.hp < p.maxHp * 0.3 ? 0.35 + Math.sin(performance.now() / 200) * 0.1 : 0;
    this.vignette.style.opacity = Math.min(1, this.hurtT + low).toFixed(3);

    // Boss bar
    const boss = game.enemies.find((e) => e.isBoss && e.alive && !e.spawning);
    this.bossBar.hidden = !boss;
    if (boss) {
      this.bossFill.style.transform = `scaleX(${boss.hp / boss.maxHp})`;
      this.text(this.bossName, 'boss', boss.hp < boss.maxHp * 0.5 ? 'OVERLORD · ENRAGED' : 'OVERLORD');
    }

    // Target markers
    const seen = new Set();
    for (const e of game.enemies) {
      if (!e.alive) continue;
      seen.add(e);
      let m = this.markerPool.get(e);
      if (!m) {
        m = document.createElement('div');
        m.className = 'marker';
        m.innerHTML = '<div class="box"></div><div class="mhp"><i></i></div><div class="mname"></div>';
        m.querySelector('.mname').textContent = e.design.name;
        this.markers.appendChild(m);
        this.markerPool.set(e, m);
      }
      proj.copy(e.center).project(cam);
      const behind = proj.z > 1;
      let x = (proj.x * 0.5 + 0.5) * w;
      let y = (-proj.y * 0.5 + 0.5) * h;
      const off = behind || x < 0 || x > w || y < 0 || y > h;
      if (off) {
        // Clamp to the screen edge as an arrow pointing at the threat.
        let dx = proj.x, dy = -proj.y;
        if (behind) { dx = -dx; dy = -dy; }
        const s = 1 / Math.max(Math.abs(dx), Math.abs(dy), 1e-3);
        x = (dx * s * 0.45 + 0.5) * w;
        y = (dy * s * 0.42 + 0.5) * h;
        m.style.transform = `translate(${x}px, ${y}px) rotate(${Math.atan2(dy, dx) + Math.PI / 2}rad)`;
      } else {
        m.style.transform = `translate(${x}px, ${y}px)`;
      }
      m.classList.toggle('offscreen', off);
      m.classList.toggle('missile-lock', p.missileLocks.includes(e));
      m.querySelector('.mhp i').style.width = `${(e.hp / e.maxHp) * 100}%`;
      m.style.opacity = e.spawning ? 0.5 : 1;
    }
    for (const [e, m] of this.markerPool) {
      if (!seen.has(e)) { m.remove(); this.markerPool.delete(e); }
    }

    // Damage numbers float up and fade.
    for (let i = this.dmgNums.length - 1; i >= 0; i--) {
      const d = this.dmgNums[i];
      d.t += dt;
      proj.copy(d.pos).project(cam);
      if (proj.z > 1 || d.t > 0.9) {
        d.el.remove();
        this.dmgNums.splice(i, 1);
        continue;
      }
      const x = (proj.x * 0.5 + 0.5) * w + d.dx * d.t;
      const y = (-proj.y * 0.5 + 0.5) * h - d.t * 60;
      d.el.style.left = `${x}px`;
      d.el.style.top = `${y}px`;
      d.el.style.opacity = String(1 - d.t / 0.9);
    }

    this.drawRadar(game);
  }

  drawRadar(game) {
    const c = this.radarCtx;
    const S = this.radar.width;
    const R = S / 2;
    const p = game.player;
    const sc = (R - 4) / 110;
    const sn = Math.sin(p.camYaw), cs = Math.cos(p.camYaw);
    // World point -> radar pixels, camera forward pointing up.
    const to = (wx, wz) => {
      const dx = wx - p.pos.x, dz = wz - p.pos.z;
      return [R + (-dx * cs + dz * sn) * sc, R - (dx * sn + dz * cs) * sc];
    };
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath();
    c.arc(R, R, R - 1, 0, Math.PI * 2);
    c.clip();
    c.strokeStyle = 'rgba(169,232,255,0.18)';
    c.lineWidth = 1;
    for (const r of [0.33, 0.66]) {
      c.beginPath();
      c.arc(R, R, R * r, 0, Math.PI * 2);
      c.stroke();
    }
    const [ax, ay] = to(0, 0);
    c.strokeStyle = 'rgba(255,120,80,0.6)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(ax, ay, ARENA_RADIUS * sc, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = 'rgba(169,232,255,0.25)';
    for (const b of game.arena.boxes) {
      const pts = [to(b.min.x, b.min.z), to(b.max.x, b.min.z), to(b.max.x, b.max.z), to(b.min.x, b.max.z)];
      c.beginPath();
      c.moveTo(...pts[0]);
      for (let i = 1; i < 4; i++) c.lineTo(...pts[i]);
      c.closePath();
      c.fill();
    }
    for (const e of game.enemies) {
      if (!e.alive) continue;
      let [x, y] = to(e.pos.x, e.pos.z);
      const d = Math.hypot(x - R, y - R);
      if (d > R - 6) { x = R + ((x - R) * (R - 6)) / d; y = R + ((y - R) * (R - 6)) / d; }
      c.fillStyle = e.isBoss ? '#ffb547' : '#ff3b4e';
      c.beginPath();
      c.arc(x, y, e.isBoss ? 5 : 3, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    c.fillStyle = '#a9e8ff';
    c.beginPath();
    c.moveTo(R, R - 7);
    c.lineTo(R + 5, R + 5);
    c.lineTo(R - 5, R + 5);
    c.closePath();
    c.fill();
  }

  clear() {
    for (const [, m] of this.markerPool) m.remove();
    this.markerPool.clear();
    for (const d of this.dmgNums) d.el.remove();
    this.dmgNums.length = 0;
  }
}
