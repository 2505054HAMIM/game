import * as THREE from 'three';
import { deckTextures, wallTextures, windowTexture, glowSprite } from '../engine/textures.js';

export const ARENA_RADIUS = 92;

// Small deterministic RNG so the arena layout is the same every match.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class Arena {
  constructor(scene, high) {
    this.scene = scene;
    this.high = high;
    this.boxes = []; // { min: Vector3, max: Vector3 }
    this.time = 0;
    this.group = new THREE.Group();
    scene.add(this.group);

    scene.fog = new THREE.FogExp2(0x1a1626, 0.0075);
    scene.background = new THREE.Color(0x0b0d16);

    this.buildSky();
    this.buildLights();
    this.buildGround();
    this.buildCover();
    this.buildBarrier();
    this.buildSkyline();
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(700, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x04060d) },
        mid: { value: new THREE.Color(0x141a33) },
        horizon: { value: new THREE.Color(0x5a2a3a) },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 c = mix(horizon, mid, smoothstep(-0.02, 0.22, h));
          c = mix(c, top, smoothstep(0.2, 0.85, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.scene.add(this.sky);

    // Stars
    const n = 1500;
    const pos = new Float32Array(n * 3);
    const r = rng(7);
    for (let i = 0; i < n; i++) {
      const u = r() * Math.PI * 2;
      const v = 0.08 + r() * 0.92;
      const y = v;
      const rad = Math.sqrt(1 - y * y);
      pos.set([Math.cos(u) * rad * 650, y * 650, Math.sin(u) * rad * 650], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfe6ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8, depthWrite: false }));
    this.scene.add(stars);

    // Moon, bright enough to bloom. A sprite always faces the camera.
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: new THREE.Color(1.3, 1.25, 1.2), fog: false, depthWrite: false }));
    moon.position.set(-260, 260, -480);
    moon.scale.setScalar(60);
    this.scene.add(moon);
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0x6d7fb8, 0x1c1418, 0.9);
    this.scene.add(hemi);

    const moonLight = new THREE.DirectionalLight(0xbfd2ff, 1.9);
    moonLight.position.set(-50, 80, -60);
    moonLight.castShadow = this.high;
    moonLight.shadow.mapSize.set(2048, 2048);
    const cam = moonLight.shadow.camera;
    cam.left = cam.bottom = -60;
    cam.right = cam.top = 60;
    cam.near = 1;
    cam.far = 220;
    moonLight.shadow.bias = -0.0004;
    moonLight.shadow.normalBias = 0.04;
    this.scene.add(moonLight);
    this.scene.add(moonLight.target);
    this.sun = moonLight;

    // Warm rim from the burning city on the horizon.
    const rim = new THREE.DirectionalLight(0xff7a4a, 0.9);
    rim.position.set(60, 20, 80);
    this.scene.add(rim);
  }

  buildGround() {
    const tex = deckTextures(36);
    const mat = new THREE.MeshStandardMaterial({
      map: tex.map,
      roughnessMap: tex.roughness,
      roughness: 0.8,
      metalness: 0.4,
      emissive: 0xffffff,
      emissiveMap: tex.emissive,
      emissiveIntensity: 0.22,
    });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(520, 96), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    // Arena boundary ring painted on the deck.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(ARENA_RADIUS - 1.2, ARENA_RADIUS, 128),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 0.5, 0.25), side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    this.group.add(ring);

    // Centre emblem
    const emblem = new THREE.Mesh(
      new THREE.RingGeometry(9, 9.6, 6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.4, 2.4), side: THREE.DoubleSide })
    );
    emblem.rotation.x = -Math.PI / 2;
    emblem.position.y = 0.03;
    this.group.add(emblem);
  }

  addBox(x, z, w, h, d, mat, trimMat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh);

    // Glowing trim along the top edge.
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.18, d + 0.08), trimMat);
    trim.position.set(x, h - 0.4, z);
    this.group.add(trim);

    this.boxes.push({
      min: new THREE.Vector3(x - w / 2, 0, z - d / 2),
      max: new THREE.Vector3(x + w / 2, h, z + d / 2),
    });
  }

  buildCover() {
    const tex = wallTextures();
    const mat = new THREE.MeshStandardMaterial({
      map: tex.map, metalness: 0.6, roughness: 0.55,
      emissive: 0xffffff, emissiveMap: tex.emissive, emissiveIntensity: 1.2,
    });
    const trimWarm = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.1, 0.3) });
    const trimCool = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.6, 2.8) });
    const r = rng(42);

    // Inner ring of low cover blocks.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      const rad = 30 + r() * 6;
      this.addBox(Math.cos(a) * rad, Math.sin(a) * rad, 6 + r() * 5, 3.5 + r() * 2.5, 3 + r() * 3, mat, i % 2 ? trimWarm : trimCool);
    }
    // Outer towers to jump on or hide behind.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.55;
      const rad = 58 + r() * 10;
      const s = 7 + r() * 4;
      this.addBox(Math.cos(a) * rad, Math.sin(a) * rad, s, 12 + r() * 10, s, mat, trimCool);
    }
    // Scattered walls.
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2;
      const rad = 44 + r() * 30;
      const long = r() > 0.5;
      this.addBox(Math.cos(a) * rad, Math.sin(a) * rad, long ? 12 : 2.5, 5 + r() * 3, long ? 2.5 : 12, mat, trimWarm);
    }
  }

  buildBarrier() {
    const geo = new THREE.CylinderGeometry(ARENA_RADIUS + 2, ARENA_RADIUS + 2, 46, 96, 1, true);
    this.barrierMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, color: { value: new THREE.Color(1.0, 0.32, 0.18) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform float time; uniform vec3 color; varying vec2 vUv;
        void main(){
          vec2 g = vec2(vUv.x * 220.0, vUv.y * 24.0 - time * 0.6);
          vec2 f = abs(fract(g) - 0.5);
          float line = smoothstep(0.46, 0.5, max(f.x, f.y));
          float fade = pow(1.0 - vUv.y, 2.2);
          float base = 0.08 + 0.1 * sin(vUv.y * 40.0 - time * 3.0);
          float a = (line * 0.55 + base) * fade;
          gl_FragColor = vec4(color * a, a);
        }`,
    });
    const barrier = new THREE.Mesh(geo, this.barrierMat);
    barrier.position.y = 23;
    this.group.add(barrier);

    // Pylons with warning lights around the rim.
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x252b36, metalness: 0.8, roughness: 0.4 });
    const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.3, 0.2) });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = Math.cos(a) * (ARENA_RADIUS + 5);
      const z = Math.sin(a) * (ARENA_RADIUS + 5);
      const p = new THREE.Mesh(new THREE.BoxGeometry(3, 34, 3), pylonMat);
      p.position.set(x, 17, z);
      p.castShadow = true;
      this.group.add(p);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), lamp);
      l.position.set(x, 34.6, z);
      this.group.add(l);
    }
  }

  buildSkyline() {
    const win = windowTexture();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0c0f16, roughness: 0.9, metalness: 0.2,
      emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 1.6,
    });
    const count = 90;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, count);
    const m = new THREE.Matrix4();
    const r = rng(99);
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2;
      const d = 170 + r() * 200;
      const w = 12 + r() * 26;
      const h = 30 + r() * 120;
      m.compose(
        new THREE.Vector3(Math.cos(a) * d, h / 2, Math.sin(a) * d),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI),
        new THREE.Vector3(w, h, w * (0.6 + r() * 0.8))
      );
      mesh.setMatrixAt(i, m);
    }
    this.group.add(mesh);
  }

  update(dt, focus) {
    this.time += dt;
    this.barrierMat.uniforms.time.value = this.time;
    // Keep the shadow frustum centred on the action.
    if (focus) {
      this.sun.position.set(focus.x - 50, 80, focus.z - 60);
      this.sun.target.position.set(focus.x, 0, focus.z);
    }
  }

  // Ground height under a point (top of a box when standing on it).
  groundAt(x, z, y, radius) {
    let g = 0;
    for (const b of this.boxes) {
      if (x > b.min.x - radius * 0.6 && x < b.max.x + radius * 0.6 && z > b.min.z - radius * 0.6 && z < b.max.z + radius * 0.6) {
        if (y >= b.max.y - 0.6) g = Math.max(g, b.max.y);
      }
    }
    return g;
  }

  // Push a vertical cylinder out of boxes and keep it inside the arena.
  resolve(pos, radius, vel) {
    for (const b of this.boxes) {
      if (pos.y >= b.max.y - 0.6) continue;
      const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
      const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
      let dx = pos.x - cx;
      let dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = radius - d;
        dx /= d; dz /= d;
        pos.x += dx * push;
        pos.z += dz * push;
        if (vel) {
          const vn = vel.x * dx + vel.z * dz;
          if (vn < 0) { vel.x -= vn * dx; vel.z -= vn * dz; }
        }
      } else {
        // Centre is inside the box: exit along the shortest axis.
        const opts = [
          [b.min.x - radius - pos.x, 0], [b.max.x + radius - pos.x, 0],
          [0, b.min.z - radius - pos.z], [0, b.max.z + radius - pos.z],
        ];
        opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
        pos.x += opts[0][0];
        pos.z += opts[0][1];
      }
    }
    const r = Math.hypot(pos.x, pos.z);
    const limit = ARENA_RADIUS - radius;
    if (r > limit) {
      pos.x *= limit / r;
      pos.z *= limit / r;
      if (vel) {
        const nx = pos.x / limit, nz = pos.z / limit;
        const vn = vel.x * nx + vel.z * nz;
        if (vn > 0) { vel.x -= vn * nx; vel.z -= vn * nz; }
      }
    }
  }

  // First hit along segment a→b against ground and boxes. Returns t in [0,1] or -1.
  raycast(a, b) {
    let best = -1;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    if (dy < 0 && a.y > 0 && b.y <= 0) best = a.y / -dy;
    for (const box of this.boxes) {
      let tmin = 0, tmax = 1;
      const o = [a.x, a.y, a.z], d = [dx, dy, dz];
      const mn = [box.min.x, box.min.y, box.min.z], mx = [box.max.x, box.max.y, box.max.z];
      let hit = true;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-8) {
          if (o[i] < mn[i] || o[i] > mx[i]) { hit = false; break; }
        } else {
          let t1 = (mn[i] - o[i]) / d[i];
          let t2 = (mx[i] - o[i]) / d[i];
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) { hit = false; break; }
        }
      }
      if (hit && (best < 0 || tmin < best)) best = tmin;
    }
    return best;
  }
}
