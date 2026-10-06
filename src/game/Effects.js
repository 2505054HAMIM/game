import * as THREE from 'three';

// GPU point particles. One additive system for fire/sparks/glow, one normal
// system for smoke. CPU simulates; the shader draws soft round sprites.
class Particles {
  constructor(scene, max, additive) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.baseAlpha = new Float32Array(max);
    this.cursor = 0;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, max);
    this.geo = g;

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { scale: { value: window.innerHeight * 0.5 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 vColor; varying float vAlpha; uniform float scale;
        void main(){
          vColor = color; vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha;
        void main(){
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d) * 2.0;
          float a = smoothstep(1.0, 0.0, r);
          a *= a;
          if (a * vAlpha < 0.003) discard;
          gl_FragColor = vec4(vColor, a * vAlpha);
        }`,
    });
    this.mat = mat;
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 10 : 9;
    scene.add(this.points);
    for (let i = 0; i < max; i++) this.alpha[i] = 0;
  }

  emit(x, y, z, vx, vy, vz, r, g, b, size, life, { grow = 0, drag = 1, grav = 0, alpha = 1 } = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.size[i] = size;
    this.life[i] = this.maxLife[i] = life;
    this.grow[i] = grow;
    this.drag[i] = drag;
    this.grav[i] = grav;
    this.baseAlpha[i] = alpha;
    this.alpha[i] = alpha;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.05) { this.pos[i * 3 + 1] = 0.05; this.vel[i * 3 + 1] *= -0.3; }
      this.size[i] += this.grow[i] * dt;
      this.alpha[i] = this.baseAlpha[i] * t;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }
}

const rand = (a, b) => a + Math.random() * (b - a);

export class Effects {
  constructor(scene, high) {
    this.scene = scene;
    this.high = high;
    this.fire = new Particles(scene, high ? 6000 : 2500, true);
    this.smoke = new Particles(scene, high ? 2000 : 800, false);
    this.shake = 0;
    this.debris = [];
    this.rings = [];
    this.arcs = [];

    // Pooled flash lights stay in the scene so shaders never recompile.
    this.lights = [];
    for (let i = 0; i < (high ? 4 : 2); i++) {
      const l = new THREE.PointLight(0xff8840, 0, 40, 1.6);
      scene.add(l);
      this.lights.push({ light: l, t: 0, max: 0 });
    }

    this.ringGeo = new THREE.RingGeometry(0.85, 1, 48);
    this.ringGeo.rotateX(-Math.PI / 2);
  }

  flashLight(pos, color, intensity, range = 40) {
    const slot = this.lights.reduce((a, b) => (a.t < b.t ? a : b));
    slot.light.position.copy(pos);
    slot.light.color.set(color);
    slot.light.distance = range;
    slot.t = slot.max = 0.35;
    slot.peak = intensity;
  }

  sparks(pos, dir, count = 10, color = [3, 2, 1], speed = 18) {
    for (let i = 0; i < count; i++) {
      const vx = (dir ? dir.x * speed * 0.6 : 0) + rand(-1, 1) * speed * 0.6;
      const vy = (dir ? dir.y * speed * 0.6 : 0) + rand(-0.3, 1) * speed * 0.6;
      const vz = (dir ? dir.z * speed * 0.6 : 0) + rand(-1, 1) * speed * 0.6;
      this.fire.emit(pos.x, pos.y, pos.z, vx, vy, vz, color[0], color[1], color[2], rand(0.15, 0.35), rand(0.2, 0.5), { drag: 2, grav: 20 });
    }
  }

  muzzleFlash(pos, dir, color = [3, 2.2, 1.2], size = 1.4) {
    this.fire.emit(pos.x, pos.y, pos.z, dir.x * 4, dir.y * 4, dir.z * 4, color[0], color[1], color[2], size, 0.06);
    for (let i = 0; i < 3; i++) {
      const s = rand(4, 14);
      this.fire.emit(pos.x, pos.y, pos.z, dir.x * s + rand(-2, 2), dir.y * s + rand(-2, 2), dir.z * s + rand(-2, 2), color[0] * 0.7, color[1] * 0.6, color[2] * 0.5, rand(0.3, 0.6), 0.08, { drag: 6 });
    }
  }

  trail(pos, color = [2.5, 1.4, 0.6], size = 0.6, smoke = true) {
    this.fire.emit(pos.x, pos.y, pos.z, rand(-0.5, 0.5), rand(-0.5, 0.5), rand(-0.5, 0.5), color[0], color[1], color[2], size, 0.15, { drag: 3 });
    if (smoke && Math.random() < 0.7) {
      const v = rand(0.25, 0.4);
      this.smoke.emit(pos.x, pos.y, pos.z, rand(-0.6, 0.6), rand(0, 1), rand(-0.6, 0.6), v, v, v * 1.05, rand(0.6, 1.0), rand(0.8, 1.4), { grow: 2.2, drag: 1.5, alpha: 0.45 });
    }
  }

  thruster(pos, dir, color) {
    this.fire.emit(pos.x, pos.y, pos.z, dir.x * 10 + rand(-1, 1), dir.y * 10 + rand(-1, 1), dir.z * 10 + rand(-1, 1), color[0], color[1], color[2], rand(0.4, 0.8), 0.18, { drag: 4, grow: -1 });
  }

  explosion(pos, scale = 1, color = [3.5, 1.6, 0.5]) {
    const n = Math.floor((this.high ? 70 : 35) * scale);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(rand(-1, 1));
      const sp = rand(4, 16) * scale;
      const vx = Math.sin(ph) * Math.cos(th) * sp;
      const vy = Math.abs(Math.cos(ph)) * sp * 0.9;
      const vz = Math.sin(ph) * Math.sin(th) * sp;
      const k = rand(0.6, 1.1);
      this.fire.emit(pos.x, pos.y, pos.z, vx, vy, vz, color[0] * k, color[1] * k, color[2] * k, rand(1.5, 3.2) * scale, rand(0.4, 0.9), { drag: 3, grow: 2 * scale });
    }
    // Hot core
    this.fire.emit(pos.x, pos.y, pos.z, 0, 0, 0, 4, 3, 2, 7 * scale, 0.18, { grow: 18 * scale });
    // Sparks
    this.sparks(pos, null, Math.floor(30 * scale), [3.5, 2.2, 1.0], 26 * scale);
    // Smoke column
    const sm = Math.floor((this.high ? 30 : 14) * scale);
    for (let i = 0; i < sm; i++) {
      const v = rand(0.08, 0.18);
      this.smoke.emit(pos.x + rand(-1, 1) * scale, pos.y + rand(0, 1.5) * scale, pos.z + rand(-1, 1) * scale,
        rand(-3, 3) * scale, rand(2, 7) * scale, rand(-3, 3) * scale, v, v * 0.95, v * 0.9,
        rand(2, 4) * scale, rand(1.5, 3), { grow: 3 * scale, drag: 1.2, alpha: 0.7 });
    }
    this.flashLight(pos, 0xff7a30, 260 * scale, 30 * scale + 20);
    this.shockwave(pos, 9 * scale, color);
  }

  shockwave(pos, radius, color = [3, 1.5, 0.5]) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(...color), transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(this.ringGeo, mat);
    ring.position.set(pos.x, Math.max(0.15, pos.y - 1), pos.z);
    ring.scale.setScalar(0.5);
    this.scene.add(ring);
    this.rings.push({ mesh: ring, t: 0, dur: 0.5, radius });
  }

  slashArc(origin, yaw, color = [0.6, 2.4, 3.6]) {
    const geo = new THREE.RingGeometry(3.2, 5.2, 32, 1, -Math.PI * 0.45, Math.PI * 0.9);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(...color), transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const arc = new THREE.Mesh(geo, mat);
    arc.position.copy(origin);
    arc.rotation.set(-Math.PI / 2, 0, 0);
    const holder = new THREE.Group();
    holder.position.copy(origin);
    holder.rotation.set(0, yaw + Math.PI / 2, -0.25);
    arc.position.set(0, 0, 0);
    holder.add(arc);
    this.scene.add(holder);
    this.arcs.push({ mesh: holder, mat, geo, t: 0, dur: 0.22 });
  }

  // Break a dead mech into flying, smoking pieces.
  breakApart(mech, impulseDir) {
    const center = mech.center.clone();
    const parts = mech.model.meshes.slice();
    const keep = this.high ? parts.length : Math.ceil(parts.length / 2);
    for (let i = 0; i < parts.length; i++) {
      const mesh = parts[i];
      if (i >= keep && i % 2) { continue; }
      this.scene.attach(mesh);
      const p = mesh.position;
      const out = p.clone().sub(center).normalize();
      const v = new THREE.Vector3(
        out.x * rand(6, 16) + (impulseDir?.x || 0) * 8,
        rand(6, 18),
        out.z * rand(6, 16) + (impulseDir?.z || 0) * 8,
      );
      this.debris.push({
        mesh, v, spin: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)),
        t: 0, life: rand(3.5, 5.5), smoking: Math.random() < 0.35,
      });
    }
    mech.root.removeFromParent();
    mech.broken = true;
  }

  update(dt, camera) {
    this.fire.mat.uniforms.scale.value = (window.innerHeight * 0.5 / Math.tan((camera.fov * Math.PI) / 360)) * 0.5 * (this.pixelRatio || 1);
    this.smoke.mat.uniforms.scale.value = this.fire.mat.uniforms.scale.value;
    this.fire.update(dt);
    this.smoke.update(dt);
    this.shake *= Math.exp(-6 * dt);

    for (const s of this.lights) {
      if (s.t > 0) {
        s.t -= dt;
        s.light.intensity = Math.max(0, (s.t / s.max)) ** 2 * s.peak;
      } else s.light.intensity = 0;
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / r.dur;
      r.mesh.scale.setScalar(0.5 + k * r.radius);
      r.mesh.material.opacity = 0.9 * (1 - k);
      if (k >= 1) {
        r.mesh.removeFromParent();
        r.mesh.material.dispose();
        this.rings.splice(i, 1);
      }
    }

    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      a.t += dt;
      const k = a.t / a.dur;
      a.mesh.scale.setScalar(1 + k * 0.3);
      a.mat.opacity = 0.85 * (1 - k);
      if (k >= 1) {
        a.mesh.removeFromParent();
        a.mat.dispose();
        a.geo.dispose();
        this.arcs.splice(i, 1);
      }
    }

    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t += dt;
      const m = d.mesh;
      d.v.y -= 30 * dt;
      m.position.addScaledVector(d.v, dt);
      m.rotation.x += d.spin.x * dt;
      m.rotation.y += d.spin.y * dt;
      m.rotation.z += d.spin.z * dt;
      if (m.position.y < 0.3) {
        m.position.y = 0.3;
        d.v.y *= -0.35;
        d.v.x *= 0.6;
        d.v.z *= 0.6;
        d.spin.multiplyScalar(0.6);
      }
      if (d.smoking && Math.random() < 0.3) {
        const v = rand(0.1, 0.2);
        this.smoke.emit(m.position.x, m.position.y, m.position.z, 0, rand(1, 3), 0, v, v, v, rand(0.8, 1.4), 1.2, { grow: 1.5, alpha: 0.5 });
      }
      if (d.t > d.life - 1) m.scale.multiplyScalar(Math.exp(-4 * dt));
      if (d.t > d.life) {
        m.removeFromParent();
        this.debris.splice(i, 1);
      }
    }
  }

  clear() {
    for (const d of this.debris) d.mesh.removeFromParent();
    for (const r of this.rings) r.mesh.removeFromParent();
    for (const a of this.arcs) a.mesh.removeFromParent();
    this.debris.length = this.rings.length = this.arcs.length = 0;
    for (const p of [this.fire, this.smoke]) p.life.fill(0);
  }
}
