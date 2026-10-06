import * as THREE from 'three';

// Canvas-generated textures, so the arena needs no image files.

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function toTexture(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Ground: large deck plates with seams, bolts and grime.
export function deckTextures(repeat) {
  const size = 512;
  const [c, g] = canvas(size);
  g.fillStyle = '#2a3340';
  g.fillRect(0, 0, size, size);
  const plates = 4;
  const p = size / plates;
  for (let y = 0; y < plates; y++) {
    for (let x = 0; x < plates; x++) {
      const v = 26 + Math.random() * 12;
      g.fillStyle = `rgb(${v},${v + 6},${v + 14})`;
      g.fillRect(x * p + 2, y * p + 2, p - 4, p - 4);
      // grime speckle
      for (let i = 0; i < 160; i++) {
        const a = Math.random() * 0.08;
        g.fillStyle = `rgba(0,0,0,${a})`;
        g.fillRect(x * p + Math.random() * p, y * p + Math.random() * p, 2 + Math.random() * 6, 2 + Math.random() * 6);
      }
      g.fillStyle = '#1a2029';
      for (const [bx, by] of [[10, 10], [p - 14, 10], [10, p - 14], [p - 14, p - 14]]) {
        g.beginPath();
        g.arc(x * p + bx + 2, y * p + by + 2, 3, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  // Hazard stripe band on one plate row.
  g.save();
  g.beginPath();
  g.rect(0, p * 2 - 10, size, 20);
  g.clip();
  for (let i = -20; i < size + 20; i += 28) {
    g.fillStyle = '#7a5a1c';
    g.beginPath();
    g.moveTo(i, p * 2 - 10);
    g.lineTo(i + 14, p * 2 - 10);
    g.lineTo(i + 4, p * 2 + 10);
    g.lineTo(i - 10, p * 2 + 10);
    g.fill();
  }
  g.restore();

  const map = toTexture(c, repeat);

  // Emissive: thin glowing seams on a few plates.
  const [e, eg] = canvas(size);
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, size, size);
  eg.strokeStyle = '#3fb9ff';
  eg.lineWidth = 1.5;
  eg.strokeRect(1, 1, size - 2, size - 2);
  eg.fillStyle = '#2a8fd0';
  eg.fillRect(p * 1 + 20, p * 3 + p / 2 - 2, p * 2 - 40, 4);
  const emissive = toTexture(e, repeat);

  // Roughness: plates slightly polished, seams rough.
  const [r, rg] = canvas(256);
  rg.fillStyle = '#9a9a9a';
  rg.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) {
    const v = 110 + Math.random() * 100;
    rg.fillStyle = `rgb(${v},${v},${v})`;
    rg.fillRect(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 10, 3 + Math.random() * 10);
  }
  const roughness = toTexture(r, repeat, false);
  return { map, emissive, roughness };
}

// Panel texture for cover blocks and towers.
export function wallTextures() {
  const size = 256;
  const [c, g] = canvas(size);
  g.fillStyle = '#323c49';
  g.fillRect(0, 0, size, size);
  for (let y = 0; y < 4; y++) {
    const v = 44 + Math.random() * 16;
    g.fillStyle = `rgb(${v},${v + 6},${v + 14})`;
    g.fillRect(3, y * 64 + 3, size - 6, 58);
  }
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 80; i++) g.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 4, 4 + Math.random() * 20);
  const map = toTexture(c);

  const [e, eg] = canvas(size);
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, size, size);
  eg.fillStyle = '#ff9a2e';
  eg.fillRect(0, 124, size, 6);
  const emissive = toTexture(e);
  return { map, emissive };
}

// Distant skyline windows.
export function windowTexture() {
  const size = 256;
  const [c, g] = canvas(size);
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  for (let y = 4; y < size; y += 10) {
    for (let x = 4; x < size; x += 8) {
      if (Math.random() < 0.18) {
        const warm = Math.random() < 0.7;
        g.fillStyle = warm ? `rgba(255,${150 + Math.random() * 60},80,${0.5 + Math.random() * 0.5})` : 'rgba(120,200,255,0.8)';
        g.fillRect(x, y, 4, 5);
      }
    }
  }
  return toTexture(c);
}

// Soft round sprite for particles.
export function glowSprite() {
  const [c, g] = canvas(64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
