// Visual + combat definitions for every mech in the game.
//
// To replace a procedural mech with a real 3D model (Meshy, Higgsfield, Blender…):
//   1. Export it as .glb and put it in public/models/, e.g. public/models/raider.glb
//   2. Set `glb: 'models/raider.glb'` on that design below.
// The procedural mech stays as the fallback if the file fails to load.

export const DESIGNS = {
  player: {
    name: 'VX-7 VANGUARD',
    glb: null,
    scale: 1,
    colors: { armor: 0xdfe5ec, frame: 0x2b313b, accent: 0x3a6bd6, glow: [0.4, 1.8, 3.2], eye: [0.6, 2.4, 3.6] },
    body: 'balanced',
    stats: { hp: 1000, speed: 15, radius: 1.6, height: 5.2 },
  },
  raider: {
    name: 'RAIDER',
    glb: null,
    scale: 0.85,
    colors: { armor: 0x2a1218, frame: 0x121317, accent: 0xb3122a, glow: [2.2, 0.08, 0.12], eye: [2.6, 0.1, 0.1] },
    body: 'light',
    stats: { hp: 140, speed: 16, radius: 1.3, height: 4.4, score: 100 },
    attack: { kind: 'bolt', interval: 0.16, burst: 5, rest: 1.6, damage: 14, speed: 120, spread: 0.035, range: 70 },
    ai: { prefRange: 28, strafe: 1.0, dodge: 0.6 },
  },
  juggernaut: {
    name: 'JUGGERNAUT',
    glb: null,
    scale: 1.3,
    colors: { armor: 0x2b2420, frame: 0x141210, accent: 0x9c3b10, glow: [2.4, 0.6, 0.05], eye: [2.6, 0.35, 0.05] },
    body: 'heavy',
    stats: { hp: 520, speed: 8, radius: 2.2, height: 6.4, score: 300 },
    attack: { kind: 'mortar', interval: 0.5, burst: 2, rest: 2.6, damage: 90, speed: 48, spread: 0.02, range: 85, splash: 7 },
    ai: { prefRange: 40, strafe: 0.4, dodge: 0.1 },
  },
  wraith: {
    name: 'WRAITH',
    glb: null,
    scale: 1.0,
    colors: { armor: 0x1d1a2c, frame: 0x0d0c14, accent: 0x6b1fb3, glow: [1.6, 0.12, 2.6], eye: [2.4, 0.15, 1.6] },
    body: 'hover',
    stats: { hp: 180, speed: 12, radius: 1.6, height: 4.6, score: 200, hover: 9 },
    attack: { kind: 'missile', interval: 0.3, burst: 3, rest: 3.4, damage: 60, speed: 34, spread: 0.3, range: 90 },
    ai: { prefRange: 45, strafe: 0.8, dodge: 0.4 },
  },
  overlord: {
    name: 'OVERLORD',
    glb: null,
    scale: 2.3,
    colors: { armor: 0x1c0a0e, frame: 0x09090b, accent: 0x7a1222, glow: [2.0, 0.03, 0.06], eye: [2.4, 0.08, 0.04] },
    body: 'boss',
    stats: { hp: 4200, speed: 9, radius: 3.6, height: 12, score: 5000 },
    attack: { kind: 'boss', damage: 22, speed: 90, range: 120 },
    ai: { prefRange: 34, strafe: 0.5, dodge: 0 },
  },
};
