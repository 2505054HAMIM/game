import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { DESIGNS } from './designs.js';
import { buildMech, wrapGLB } from './MechModel.js';

// Loads any .glb files configured in designs.js once, then hands out copies.
const loaded = new Map(); // design key -> { scene, animations }

export async function preloadModels() {
  const loader = new GLTFLoader();
  const jobs = Object.entries(DESIGNS)
    .filter(([, d]) => d.glb)
    .map(async ([key, d]) => {
      try {
        const gltf = await loader.loadAsync(d.glb);
        loaded.set(key, { scene: gltf.scene, animations: gltf.animations });
      } catch (err) {
        console.warn(`Could not load ${d.glb}, using the procedural ${key}.`, err);
      }
    });
  await Promise.all(jobs);
}

export function createMechModel(key) {
  const design = DESIGNS[key];
  const glb = loaded.get(key);
  if (glb) {
    const scene = SkeletonUtils.clone(glb.scene);
    scene.traverse((o) => {
      if (o.isMesh && o.material) o.material = o.material.clone();
    });
    const model = wrapGLB(scene, design);
    model.animations = glb.animations;
    model.glbScene = scene;
    return model;
  }
  return buildMech(design);
}
