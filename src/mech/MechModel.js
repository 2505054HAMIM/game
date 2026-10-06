import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Builds mechs out of primitive parts. Every mech gets the same skeleton
// (hips → torso → head/arms, hips → legs) so one animation system drives them all.

const geoCache = new Map();
function cached(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
const rbox = (w, h, d, r = 0.08) => cached(`rb${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)));
const cyl = (rt, rb, h, s = 12) => cached(`cy${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const cone = (r, h, s = 8) => cached(`co${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
const sphere = (r) => cached(`sp${r}`, () => new THREE.SphereGeometry(r, 16, 12));
const torus = (r, t) => cached(`to${r},${t}`, () => new THREE.TorusGeometry(r, t, 8, 32));

const flameGeo = (() => {
  const g = new THREE.ConeGeometry(0.28, 1.6, 10, 1, true);
  g.translate(0, -0.8, 0);
  return g;
})();

function makeMaterials(colors) {
  const glow = new THREE.Color(...colors.glow);
  const eye = new THREE.Color(...colors.eye);
  return {
    armor: new THREE.MeshStandardMaterial({ color: colors.armor, metalness: 0.65, roughness: 0.32, emissive: 0x000000 }),
    frame: new THREE.MeshStandardMaterial({ color: colors.frame, metalness: 0.85, roughness: 0.45, emissive: 0x000000 }),
    accent: new THREE.MeshStandardMaterial({ color: colors.accent, metalness: 0.5, roughness: 0.35, emissive: 0x000000 }),
    glow: new THREE.MeshBasicMaterial({ color: glow }),
    eye: new THREE.MeshBasicMaterial({ color: eye }),
    flame: new THREE.MeshBasicMaterial({
      color: glow.clone().multiplyScalar(0.9), transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  };
}

function part(geo, mat, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function group(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// Proportions per body type. Values are in metres before design.scale.
const BODY = {
  balanced: { hipH: 2.45, hipW: 0.62, legW: 0.62, torso: [2.2, 1.35, 1.45], shoulderX: 1.4, armW: 0.5, head: 0.62, reverseKnee: false },
  light:    { hipH: 2.3,  hipW: 0.5,  legW: 0.46, torso: [1.6, 1.15, 1.15], shoulderX: 1.05, armW: 0.38, head: 0.5, reverseKnee: true },
  heavy:    { hipH: 2.15, hipW: 0.85, legW: 0.95, torso: [3.0, 1.7, 2.0], shoulderX: 1.85, armW: 0.7, head: 0.5, reverseKnee: false },
  hover:    { hipH: 2.6,  hipW: 0,    legW: 0,    torso: [1.7, 1.2, 1.3], shoulderX: 1.2, armW: 0.36, head: 0.56, reverseKnee: false },
  boss:     { hipH: 2.3,  hipW: 0.8,  legW: 0.85, torso: [2.7, 1.6, 1.8], shoulderX: 1.75, armW: 0.66, head: 0.6, reverseKnee: false },
};

function buildLeg(side, B, M, hips) {
  const hip = group(hips, side * B.hipW, -0.1, 0);
  const thighLen = B.hipH * 0.48;
  const shinLen = B.hipH * 0.44;
  part(rbox(B.legW, thighLen, B.legW * 1.1), M.frame, hip, 0, -thighLen / 2, 0);
  part(rbox(B.legW * 1.15, thighLen * 0.55, B.legW * 0.5), M.armor, hip, 0, -thighLen * 0.45, B.legW * 0.45);
  const knee = group(hip, 0, -thighLen, 0);
  part(sphere(B.legW * 0.42), M.frame, knee);
  part(rbox(B.legW * 1.05, shinLen, B.legW * 1.25), M.armor, knee, 0, -shinLen / 2, 0.05);
  part(rbox(B.legW * 0.7, shinLen * 0.35, 0.18), M.accent, knee, 0, -shinLen * 0.25, B.legW * 0.7);
  // Knee pad with a glowing slit
  part(rbox(B.legW * 0.9, 0.5, 0.3), M.armor, knee, 0, 0.05, B.legW * 0.55, -0.3);
  const ankle = group(knee, 0, -shinLen, 0);
  const foot = part(rbox(B.legW * 1.2, 0.3, B.legW * 2.1), M.frame, ankle, 0, -0.1, B.legW * 0.35);
  part(rbox(B.legW * 0.9, 0.12, 0.1), M.glow, ankle, 0, -0.05, B.legW * 1.42);
  return { hip, knee, ankle, foot };
}

function buildArm(side, B, M, torso, D) {
  const [, th] = B.torso;
  const shoulder = group(torso, side * B.shoulderX, th * 0.75, 0);
  // Shoulder armor
  part(rbox(B.armW * 2.0, B.armW * 1.5, B.armW * 2.4, 0.15), M.armor, shoulder, side * B.armW * 0.45, B.armW * 0.25, 0);
  part(rbox(B.armW * 0.25, B.armW * 0.9, B.armW * 2.0), M.accent, shoulder, side * B.armW * 1.5, B.armW * 0.2, 0);
  const upperLen = B.armW * 2.0;
  part(rbox(B.armW, upperLen, B.armW), M.frame, shoulder, 0, -upperLen / 2 - 0.2, 0);
  const elbow = group(shoulder, 0, -upperLen - 0.25, 0);
  part(sphere(B.armW * 0.55), M.frame, elbow);
  const foreLen = B.armW * 2.2;
  part(rbox(B.armW * 1.3, foreLen, B.armW * 1.4), M.armor, elbow, 0, -foreLen / 2, 0);

  // Weapon along the forearm's -Y axis (points forward once the arm is raised).
  const weapon = group(elbow, side * B.armW * 0.2, -foreLen, 0);
  const muzzle = new THREE.Object3D();
  let blade = null;
  if (D.body === 'hover') {
    // Wraith arms end in scythe blades.
    part(cone(B.armW * 0.5, 2.6, 4), M.accent, weapon, 0, -1.3, 0.1, Math.PI, 0, 0);
    part(rbox(0.06, 2.4, 0.3), M.glow, weapon, side * 0.12, -1.2, 0.25);
    muzzle.position.set(0, -2.6, 0);
  } else if (D.body === 'boss') {
    // Rotary cannon
    const spin = group(weapon, 0, -1.4, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      part(cyl(0.14, 0.14, 2.8, 8), M.frame, spin, Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32);
    }
    part(cyl(0.6, 0.6, 0.6, 16), M.accent, weapon, 0, -0.2, 0);
    part(torus(0.5, 0.06), M.glow, weapon, 0, -2.4, 0, Math.PI / 2, 0, 0);
    muzzle.position.set(0, -2.9, 0);
    weapon.userData.spin = spin;
  } else if (D.body === 'balanced') {
    if (side < 0) {
      // Pulse rifle in the right hand (the model faces +Z, so its right is -X)
      part(rbox(0.36, 2.3, 0.44), M.frame, weapon, 0, -0.9, 0.15);
      part(rbox(0.26, 0.9, 0.5), M.accent, weapon, 0, -0.4, 0.2);
      part(cyl(0.09, 0.09, 0.8, 8), M.frame, weapon, 0, -2.3, 0.15);
      part(rbox(0.08, 1.2, 0.08), M.glow, weapon, 0.19, -1.0, 0.15);
      muzzle.position.set(0, -2.75, 0.15);
    } else {
      // Blade emitter on the left arm
      part(rbox(0.4, 0.8, 0.5), M.accent, weapon, 0, -0.2, 0);
      blade = part(rbox(0.12, 4.4, 0.32, 0.05), M.glow, weapon, 0, -2.5, 0);
      blade.visible = false;
      muzzle.position.set(0, -0.6, 0);
    }
  } else {
    // Generic arm gun
    const len = D.body === 'heavy' ? 1.4 : 1.7;
    part(rbox(B.armW * 0.9, len, B.armW * 0.9), M.frame, weapon, 0, -len / 2, 0);
    part(cyl(B.armW * 0.22, B.armW * 0.22, 0.6, 8), M.frame, weapon, 0, -len - 0.2, 0);
    part(rbox(0.08, len * 0.7, 0.08), M.glow, weapon, side * B.armW * 0.5, -len / 2, 0);
    muzzle.position.set(0, -len - 0.5, 0);
  }
  weapon.add(muzzle);
  return { shoulder, elbow, weapon, muzzle, blade };
}

export function buildMech(design) {
  const D = design;
  const B = BODY[D.body];
  const M = makeMaterials(D.colors);
  const root = new THREE.Group();
  const body = group(root);
  body.scale.setScalar(D.scale);

  const hips = group(body, 0, B.hipH, 0);
  part(rbox(B.hipW * 2 + 0.4, 0.55, 0.95), M.frame, hips);

  const torso = group(hips, 0, 0.3, 0);
  const [tw, th, td] = B.torso;
  part(rbox(tw * 0.45, 0.6, td * 0.55), M.frame, torso, 0, 0.15, 0);
  const chest = part(rbox(tw, th, td, 0.18), M.armor, torso, 0, th * 0.5 + 0.4, 0);
  part(rbox(tw * 0.55, th * 0.55, 0.2), M.accent, torso, 0, th * 0.45 + 0.4, td * 0.5);
  part(rbox(tw * 0.3, 0.08, 0.06), M.glow, torso, 0, th * 0.3 + 0.4, td * 0.5 + 0.1);
  // Collar
  part(rbox(tw * 0.6, 0.25, td * 0.7), M.frame, torso, 0, th + 0.45, 0);

  // Head
  const head = group(torso, 0, th + 0.6 + B.head * 0.5, td * 0.08);
  const hs = B.head;
  if (D.body === 'light') {
    // Wedge head, single slit eye, swept horns
    part(rbox(hs * 1.2, hs * 0.7, hs * 1.6), M.armor, head, 0, 0, 0);
    part(rbox(hs * 1.0, hs * 0.1, 0.06), M.eye, head, 0, 0.02, hs * 0.81);
    for (const s of [-1, 1]) part(cone(0.1, 1.3, 5), M.accent, head, s * hs * 0.45, hs * 0.35, -hs * 0.4, -1.1, 0, s * 0.35);
  } else if (D.body === 'heavy') {
    part(rbox(hs * 1.6, hs * 0.8, hs * 1.2), M.frame, head, 0, -0.1, 0);
    for (const x of [-0.25, 0, 0.25]) part(sphere(0.09), M.eye, head, x, -0.05, hs * 0.62);
  } else if (D.body === 'hover') {
    // Insect head with four eyes
    part(sphere(hs * 0.7), M.armor, head, 0, 0, 0.1);
    for (const [x, y] of [[-0.2, 0.08], [0.2, 0.08], [-0.13, -0.1], [0.13, -0.1]]) part(sphere(0.08), M.eye, head, x, y, hs * 0.72);
    for (const s of [-1, 1]) part(cone(0.06, 0.9, 4), M.accent, head, s * 0.25, 0.3, -0.1, -0.5, 0, s * 0.5);
  } else if (D.body === 'boss') {
    part(rbox(hs * 1.4, hs * 1.0, hs * 1.3), M.armor, head, 0, 0, 0);
    part(rbox(hs * 1.1, hs * 0.14, 0.06), M.eye, head, 0, 0.05, hs * 0.66);
    // Great horns and a crown of spikes
    for (const s of [-1, 1]) {
      part(cone(0.18, 1.8, 6), M.accent, head, s * hs * 0.7, hs * 0.5, 0, -0.35, 0, s * -0.7);
      part(cone(0.12, 1.1, 6), M.accent, head, s * hs * 1.25, hs * 1.15, -0.1, -0.2, 0, s * -0.25);
    }
    for (let i = -2; i <= 2; i++) part(cone(0.06, 0.5 + (2 - Math.abs(i)) * 0.25, 4), M.glow, head, i * 0.16, hs * 0.65, -0.1);
    // Halo behind the head
    part(torus(1.0, 0.04), M.glow, head, 0, 0.2, -0.7);
  } else {
    // Player: clean visor head with antenna
    part(rbox(hs * 1.25, hs * 0.85, hs * 1.25), M.armor, head, 0, 0, 0);
    part(rbox(hs * 1.0, hs * 0.18, 0.06), M.eye, head, 0, 0.02, hs * 0.63);
    part(rbox(0.06, 0.7, 0.06), M.accent, head, hs * 0.5, hs * 0.55, -0.1, 0, 0, -0.35);
    part(rbox(0.12, 0.25, hs * 0.9), M.accent, head, 0, hs * 0.5, 0);
  }

  // Back unit and thrusters
  const back = group(torso, 0, th * 0.55 + 0.4, -td * 0.5);
  part(rbox(tw * 0.7, th * 0.9, 0.7), M.frame, back, 0, 0, -0.3);
  const thrusters = [];
  for (const s of [-1, 1]) {
    const nozzle = part(cyl(0.22, 0.32, 0.6, 10), M.frame, back, s * tw * 0.22, -th * 0.35, -0.55, 0.5, 0, 0);
    const flame = new THREE.Mesh(flameGeo, M.flame);
    flame.position.set(0, -0.3, 0);
    flame.scale.setScalar(0.001);
    nozzle.add(flame);
    thrusters.push(flame);
  }

  // Back-mounted launchers (also missile origins)
  const launchers = [];
  if (D.body === 'balanced' || D.body === 'hover' || D.body === 'boss') {
    for (const s of [-1, 1]) {
      const pod = group(back, s * tw * 0.42, th * 0.55, -0.2);
      part(rbox(0.8, 0.6, 1.1), M.accent, pod);
      for (let i = 0; i < 4; i++) part(rbox(0.12, 0.12, 0.06), M.glow, pod, -0.2 + (i % 2) * 0.4, -0.1 + Math.floor(i / 2) * 0.22, 0.56);
      const o = new THREE.Object3D();
      o.position.set(0, 0.2, 0.6);
      pod.add(o);
      launchers.push(o);
    }
  }
  if (D.body === 'light') {
    // Blade fins on the back
    for (const s of [-1, 1]) {
      part(rbox(0.08, 2.2, 0.7), M.accent, back, s * 0.4, 0.9, -0.4, -0.4, 0, s * 0.3);
      part(rbox(0.04, 2.0, 0.08), M.glow, back, s * 0.45, 0.95, -0.15, -0.4, 0, s * 0.3);
    }
  }
  const cannons = [];
  if (D.body === 'heavy') {
    // Twin shoulder mortars
    for (const s of [-1, 1]) {
      const c = group(torso, s * tw * 0.32, th + 0.9, -0.2);
      part(rbox(0.9, 0.7, 1.4), M.frame, c);
      part(cyl(0.3, 0.36, 2.4, 12), M.accent, c, 0, 0.1, 1.0, Math.PI / 2, 0, 0);
      part(torus(0.3, 0.05), M.glow, c, 0, 0.1, 2.2);
      const o = new THREE.Object3D();
      o.position.set(0, 0.1, 2.4);
      c.add(o);
      cannons.push(o);
    }
  }
  if (D.body === 'boss') {
    // Core and cape fins
    part(sphere(0.38), M.eye, torso, 0, th * 0.55 + 0.4, td * 0.5 + 0.15);
    part(torus(0.5, 0.06), M.accent, torso, 0, th * 0.55 + 0.4, td * 0.5 + 0.1);
    for (const s of [-1, 1]) {
      part(rbox(0.1, 3.4, 1.4), M.armor, back, s * 0.9, -1.0, -0.7, 0.25, 0, s * 0.18);
      part(rbox(0.05, 3.2, 0.06), M.glow, back, s * 0.96, -1.0, -0.05, 0.25, 0, s * 0.18);
    }
  }

  // Lower body
  let legs = null;
  let hoverRing = null;
  if (D.body === 'hover') {
    part(cyl(0.9, 0.12, 2.0, 8), M.armor, hips, 0, -1.1, 0);
    part(cyl(0.4, 0.05, 1.2, 6), M.accent, hips, 0, -2.2, 0);
    hoverRing = part(torus(1.1, 0.07), M.glow, hips, 0, -1.4, 0, Math.PI / 2, 0, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      part(rbox(0.12, 1.2, 0.5), M.accent, hips, Math.cos(a) * 0.8, -0.9, Math.sin(a) * 0.8, 0, -a, 0.35);
    }
  } else {
    legs = { L: buildLeg(-1, B, M, hips), R: buildLeg(1, B, M, hips) };
  }

  const arms = { L: buildArm(1, B, M, torso, D), R: buildArm(-1, B, M, torso, D) };

  // Collect meshes for hit flashes and break-apart debris.
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && o.material !== M.flame) meshes.push(o); });

  return {
    root, body, hips, torso, head, chest, back, legs, arms, thrusters, launchers, cannons, hoverRing,
    materials: M, meshes, B, scale: D.scale,
    blade: arms.L.blade,
  };
}

// Wraps a loaded glTF scene so it exposes the same handles as a procedural mech.
// Limbs are not animated (bob/lean only) unless the file has its own animations.
export function wrapGLB(gltfScene, design) {
  const D = design;
  const M = makeMaterials(D.colors);
  const root = new THREE.Group();
  const body = group(root);
  const model = gltfScene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const s = (D.stats.height * 1.0) / Math.max(0.001, size.y);
  model.scale.setScalar(s);
  box.setFromObject(model);
  model.position.y -= box.min.y;
  const hips = group(body, 0, D.stats.height * 0.45, 0);
  const torso = group(hips, 0, 0, 0);
  body.add(model);
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  const mkMuzzle = (x) => {
    const shoulder = group(torso, x, D.stats.height * 0.2, 0);
    const elbow = group(shoulder);
    const weapon = group(elbow);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, -D.stats.radius * 1.2, 0);
    weapon.add(muzzle);
    return { shoulder, elbow, weapon, muzzle, blade: null };
  };
  const arms = { L: mkMuzzle(-D.stats.radius * 0.7), R: mkMuzzle(D.stats.radius * 0.7) };
  const back = group(torso, 0, D.stats.height * 0.2, -D.stats.radius * 0.5);
  const launchers = [new THREE.Object3D(), new THREE.Object3D()];
  launchers.forEach((l, i) => { l.position.set(i ? 0.6 : -0.6, 0.5, 0); back.add(l); });

  const meshes = [];
  model.traverse((o) => { if (o.isMesh) meshes.push(o); });
  return {
    root, body, hips, torso, head: group(torso, 0, D.stats.height * 0.4, 0), chest: null, back, legs: null, arms,
    thrusters: [], launchers, cannons: [], hoverRing: null, materials: M, meshes, B: BODY[D.body], scale: 1,
    blade: null, isGLB: true,
  };
}
