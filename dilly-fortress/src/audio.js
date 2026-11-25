/* ==========================================================================
   DILLY FORTRESS — Procedural Web Audio SFX Engine
   ========================================================================== */

export class SoundFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  ensure() {
    if (this.muted) return null;
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  tone(freq, dur, type = 'triangle', vol = 0.08, endFreq = null) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  shoot(kind) {
    if (kind === 'vulcan') this.tone(420, 0.045, 'square', 0.035, 190);
    else if (kind === 'cryo') this.tone(860, 0.14, 'sine', 0.06, 440);
    else if (kind === 'mortar') this.tone(160, 0.18, 'sawtooth', 0.08, 48);
    else if (kind === 'tesla') this.tone(920, 0.09, 'sawtooth', 0.045, 340);
    else if (kind === 'railgun') this.tone(1200, 0.18, 'sawtooth', 0.07, 160);
    else if (kind === 'brine') this.tone(240, 0.16, 'triangle', 0.08, 90);
  }

  boom() { this.tone(110, 0.24, 'sawtooth', 0.10, 34); }
  place() { this.tone(440, 0.09, 'triangle', 0.08, 660); }
  upgrade() {
    this.tone(523, 0.09, 'triangle', 0.08);
    setTimeout(() => this.tone(784, 0.14, 'triangle', 0.08), 75);
  }
  sell() { this.tone(620, 0.1, 'sine', 0.07, 420); }
  wave() {
    this.tone(261, 0.16, 'triangle', 0.09);
    setTimeout(() => this.tone(392, 0.22, 'triangle', 0.09), 130);
  }
  ability() {
    this.tone(320, 0.22, 'sawtooth', 0.09, 880);
  }
  hurt() { this.tone(140, 0.22, 'sawtooth', 0.11, 55); }
}
