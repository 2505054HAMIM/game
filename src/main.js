import { Game } from './game/Game.js';
import { Audio } from './engine/Audio.js';
import { preloadModels } from './mech/ModelLibrary.js';

const $ = (id) => document.getElementById(id);
const screens = { title: $('title'), pause: $('pause'), gameover: $('gameover'), loading: $('loading') };
const container = $('viewport');
const audio = new Audio();

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch { /* storage is optional */ }
  return null;
}

function show(name) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
}

function renderBest() {
  const best = Number(store('sv-best') || 0);
  $('best-score').textContent = best ? `BEST SCORE ${best.toLocaleString('en-US')}` : '';
}

const ui = {
  gameOver({ wave, kills, score }) {
    $('go-wave').textContent = wave;
    $('go-kills').textContent = kills;
    $('go-score').textContent = score.toLocaleString('en-US');
    const best = Number(store('sv-best') || 0);
    const record = score > best;
    if (record) store('sv-best', String(score));
    $('go-kicker').textContent = record ? 'NEW BEST SCORE' : 'VANGUARD DESTROYED';
    game.hud.show(false);
    show('gameover');
  },
};

let quality = store('sv-quality') || 'high';
$('quality-select').value = quality;
let game = null;

function createGame() {
  if (game) game.dispose();
  game = new Game({ container, quality, audio, ui });
  window.__game = game; // handy for debugging in the console
}

function launch() {
  audio.start();
  const wanted = $('quality-select').value;
  if (wanted !== quality) {
    quality = wanted;
    store('sv-quality', quality);
    createGame();
  }
  show(null);
  game.start();
  game.input.requestLock();
}

$('start-btn').addEventListener('click', launch);
$('retry-btn').addEventListener('click', () => {
  show(null);
  game.start();
  game.input.requestLock();
});
$('title-btn').addEventListener('click', () => {
  createGame();
  renderBest();
  show('title');
});
$('resume-btn').addEventListener('click', () => {
  game.setPaused(false);
  show(null);
  game.input.requestLock();
});
$('quit-btn').addEventListener('click', () => {
  createGame();
  renderBest();
  show('title');
});

// Click back into the game to re-capture the mouse.
container.addEventListener('mousedown', () => {
  if (game.running && !game.paused && !game.input.isLocked()) game.input.requestLock();
});

let unlockedAt = 0;
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' && e.code !== 'KeyP') return;
  if (!game.running || game.over) return;
  // The same Esc press that released pointer lock already paused the game.
  if (performance.now() - unlockedAt < 400) return;
  if (game.paused) {
    game.setPaused(false);
    show(null);
    game.input.requestLock();
  } else {
    game.setPaused(true);
    show('pause');
  }
});

// Losing pointer lock (Esc in most browsers) pauses the match.
let wasLocked = false;
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement != null;
  if (wasLocked && !locked) unlockedAt = performance.now();
  if (wasLocked && !locked && game.running && !game.paused && !game.over) {
    game.setPaused(true);
    show('pause');
  }
  wasLocked = locked;
});

async function boot() {
  show('loading');
  await preloadModels();
  createGame();
  renderBest();
  show('title');
}

boot();
