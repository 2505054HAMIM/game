// Procedural sound effects with WebAudio, so the game ships without audio files.
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.boostGain = null;
  }

  // Must be called from a user gesture.
  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);

    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Continuous thruster hiss, faded in while boosting.
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.7;
    this.boostGain = this.ctx.createGain();
    this.boostGain.gain.value = 0;
    src.connect(bp).connect(this.boostGain).connect(this.master);
    src.start();
  }

  setBoost(level) {
    if (!this.ctx) return;
    this.boostGain.gain.setTargetAtTime(level * 0.22, this.ctx.currentTime, 0.05);
  }

  noiseBurst({ dur = 0.2, freq = 1200, type = 'lowpass', q = 1, vol = 0.5, sweep = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  tone({ freq = 440, end = freq, dur = 0.15, type = 'square', vol = 0.2 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // dist: distance from the listener, used for cheap attenuation.
  play(name, dist = 0) {
    if (!this.ctx) return;
    const a = Math.max(0.05, 1 - dist / 140);
    switch (name) {
      case 'rifle':
        this.noiseBurst({ dur: 0.09, freq: 3200, type: 'bandpass', q: 0.8, vol: 0.35 * a });
        this.tone({ freq: 180, end: 60, dur: 0.08, type: 'triangle', vol: 0.3 * a });
        break;
      case 'enemyShot':
        this.tone({ freq: 900, end: 220, dur: 0.12, type: 'sawtooth', vol: 0.09 * a });
        break;
      case 'mortar':
        this.tone({ freq: 140, end: 50, dur: 0.3, type: 'sine', vol: 0.5 * a });
        this.noiseBurst({ dur: 0.25, freq: 600, vol: 0.3 * a });
        break;
      case 'missile':
        this.noiseBurst({ dur: 0.45, freq: 500, type: 'bandpass', q: 1.5, vol: 0.4 * a, sweep: 4 });
        break;
      case 'explosion':
        this.noiseBurst({ dur: 0.9, freq: 900, vol: 0.9 * a, sweep: 0.12 });
        this.tone({ freq: 90, end: 30, dur: 0.6, type: 'sine', vol: 0.7 * a });
        break;
      case 'bigExplosion':
        this.noiseBurst({ dur: 1.8, freq: 1400, vol: 1.0 * a, sweep: 0.05 });
        this.tone({ freq: 70, end: 22, dur: 1.4, type: 'sine', vol: 0.9 * a });
        break;
      case 'hit':
        this.tone({ freq: 1800, end: 1200, dur: 0.05, type: 'square', vol: 0.06 });
        break;
      case 'hurt':
        this.noiseBurst({ dur: 0.18, freq: 400, vol: 0.5 });
        this.tone({ freq: 120, end: 60, dur: 0.15, type: 'square', vol: 0.15 });
        break;
      case 'boost':
        this.noiseBurst({ dur: 0.35, freq: 2000, type: 'bandpass', q: 0.6, vol: 0.45, sweep: 0.3 });
        break;
      case 'blade':
        this.tone({ freq: 300, end: 1400, dur: 0.18, type: 'sawtooth', vol: 0.18 });
        this.noiseBurst({ dur: 0.2, freq: 5000, type: 'highpass', vol: 0.3 });
        break;
      case 'lock':
        this.tone({ freq: 1400, dur: 0.06, type: 'sine', vol: 0.12 });
        break;
      case 'reload':
        this.tone({ freq: 600, end: 300, dur: 0.07, type: 'square', vol: 0.08 });
        break;
      case 'alarm':
        this.tone({ freq: 620, end: 620, dur: 0.35, type: 'square', vol: 0.12 });
        setTimeout(() => this.tone({ freq: 460, end: 460, dur: 0.35, type: 'square', vol: 0.12 }), 380);
        break;
      case 'land':
        this.tone({ freq: 80, end: 40, dur: 0.12, type: 'sine', vol: 0.35 * a });
        break;
      case 'wave':
        this.tone({ freq: 220, end: 440, dur: 0.5, type: 'triangle', vol: 0.2 });
        break;
    }
  }
}
