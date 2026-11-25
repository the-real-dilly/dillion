/* ==========================================================================
   DILLYVERSE — Original Procedural Web Audio Synthesizer
   Block mining/placing by material, footsteps, water, crafting, combat & UI.
   ========================================================================== */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.6;
    this.muted = false;
  }

  ensure() {
    if (this.muted || this.volume <= 0) return null;
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  noiseBurst(dur, filterFreq, q, gainAmt) {
    const ctx = this.ensure();
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.45));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = filterFreq;
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gainAmt * this.volume;
    src.connect(filt); filt.connect(g); g.connect(ctx.destination);
    src.start();
  }

  tone(freq, dur, type = 'triangle', gainAmt = 0.14, endFreq = null) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    g.gain.setValueAtTime(gainAmt * this.volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  playBreak(mat = 'stone') {
    if (mat === 'wood') { this.tone(180, 0.11, 'square', 0.12, 95); this.noiseBurst(0.09, 650, 1.8, 0.25); }
    else if (mat === 'dirt' || mat === 'sand') { this.noiseBurst(0.11, 420, 1.1, 0.32); }
    else if (mat === 'glass') { this.noiseBurst(0.16, 3600, 3.0, 0.28); this.tone(1850, 0.12, 'sine', 0.1, 980); }
    else { this.tone(140, 0.1, 'triangle', 0.15, 70); this.noiseBurst(0.1, 1100, 1.6, 0.26); }
  }

  playPlace(mat = 'stone') {
    const f = mat === 'wood' ? 230 : (mat === 'dirt' ? 160 : 280);
    this.tone(f, 0.08, 'triangle', 0.14, f * 0.72);
    this.noiseBurst(0.06, 700, 1.4, 0.16);
  }

  playHit(mat = 'stone') {
    this.noiseBurst(0.05, mat === 'wood' ? 600 : 1200, 2.0, 0.14);
  }

  playStep(mat = 'dirt') {
    const freq = mat === 'stone' ? 950 : (mat === 'water' ? 500 : 380);
    this.noiseBurst(0.05, freq, 1.2, 0.11);
  }

  playSplash() {
    this.noiseBurst(0.24, 620, 0.8, 0.28);
  }

  playHurt() {
    this.tone(160, 0.18, 'sawtooth', 0.18, 65);
  }

  playCraft() {
    this.tone(523, 0.1, 'triangle', 0.12);
    setTimeout(() => this.tone(659, 0.12, 'triangle', 0.12), 70);
    setTimeout(() => this.tone(784, 0.16, 'triangle', 0.12), 140);
  }

  playEat() {
    this.noiseBurst(0.08, 900, 2.2, 0.2);
    setTimeout(() => this.noiseBurst(0.08, 1100, 2.2, 0.2), 95);
  }

  playUi() {
    this.tone(640, 0.05, 'sine', 0.08, 760);
  }
}
