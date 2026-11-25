(function () {
  const PT = (window.PT = window.PT || {});

  const MAX_ACTIVE_VOICES = 14;
  const MAX_MUSIC_VOICES = 16;
  const MUSIC_STORAGE_KEY = 'pinecrest_music_enabled';

  // Cozy seasonal chord progressions & pentatonic palettes (frequencies in Hz)
  const SEASON_MUSIC = {
    spring: {
      // Bright pastoral G major — gentle meadow harp & soft wind pad
      stepSec: 0.62,
      padVol: 0.026,
      pluckVol: 0.042,
      melodyVol: 0.032,
      chimeChance: 0.15,
      chords: [
        [196.00, 246.94, 293.66, 369.99], // Gmaj7
        [164.81, 246.94, 293.66, 392.00], // Em7
        [130.81, 196.00, 246.94, 329.63], // Cmaj7
        [146.83, 220.00, 293.66, 369.99]  // Dmaj6
      ],
      melody: [392.00, 440.00, 493.88, 587.33, 659.25, 783.99]
    },
    summer: {
      // Warm sunlit C major — relaxed orchard breeze
      stepSec: 0.66,
      padVol: 0.026,
      pluckVol: 0.040,
      melodyVol: 0.030,
      chimeChance: 0.12,
      chords: [
        [130.81, 196.00, 246.94, 329.63], // Cmaj7
        [110.00, 196.00, 261.63, 329.63], // Am7
        [174.61, 220.00, 261.63, 329.63], // Fmaj7
        [196.00, 246.94, 293.66, 329.63]  // G6
      ],
      melody: [329.63, 392.00, 440.00, 523.25, 587.33, 659.25]
    },
    autumn: {
      // Golden nostalgic D major / B minor folk warmth
      stepSec: 0.72,
      padVol: 0.028,
      pluckVol: 0.038,
      melodyVol: 0.030,
      chimeChance: 0.14,
      chords: [
        [123.47, 185.00, 220.00, 293.66], // Bm7
        [196.00, 246.94, 293.66, 369.99], // Gmaj7
        [146.83, 220.00, 277.18, 369.99], // Dmaj7
        [110.00, 164.81, 220.00, 277.18]  // A
      ],
      melody: [293.66, 329.63, 369.99, 440.00, 493.88, 587.33]
    },
    winter: {
      // Cozy snowy F major music-box & celesta glow
      stepSec: 0.70,
      padVol: 0.030,
      pluckVol: 0.036,
      melodyVol: 0.034,
      chimeChance: 0.36,
      chords: [
        [174.61, 220.00, 261.63, 329.63], // Fmaj7
        [146.83, 220.00, 261.63, 349.23], // Dm7
        [116.54, 174.61, 220.00, 293.66], // Bbmaj7
        [130.81, 196.00, 261.63, 349.23]  // Csus4
      ],
      melody: [349.23, 392.00, 440.00, 523.25, 587.33, 698.46, 783.99]
    }
  };

  class SoundManager {
    constructor() {
      this.enabled = true;
      this.musicEnabled = true;
      try {
        const saved = localStorage.getItem(MUSIC_STORAGE_KEY);
        if (saved === '0') this.musicEnabled = false;
      } catch (e) {}

      this.ctx = null;
      this.activeVoices = 0;
      this.musicVoices = 0;
      this._lastPlayed = Object.create(null);

      // Persistent ambient music bus & lookahead scheduler state
      this._musicBus = null;
      this._musicTimer = null;
      this._musicNextTime = 0;
      this._musicStep = 0;
      this._musicChordIdx = 0;
      this._musicMelodyIdx = 2;
      this._season = 'autumn';
      this._unlocked = false;

      // Pause background scheduler cleanly when tab is hidden
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) {
            this._pauseScheduler();
          } else if (this.musicEnabled && this._unlocked) {
            this.startMusic();
          }
        });
      }
    }

    ensure(forMusic = false) {
      if (!forMusic && !this.enabled) return null;
      if (forMusic && !this.musicEnabled) return null;
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      if (this.ctx) this._unlocked = true;
      return this.ctx;
    }

    _ensureMusicBus() {
      const ctx = this.ensure(true);
      if (!ctx) return null;
      if (!this._musicBus) {
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.0001, ctx.currentTime);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1850, ctx.currentTime);
        filter.Q.setValueAtTime(0.5, ctx.currentTime);

        // Soft ambient echo loop (allocated once per AudioContext — zero per-note leak)
        const delay = ctx.createDelay(1.0);
        delay.delayTime.setValueAtTime(0.38, ctx.currentTime);
        const fb = ctx.createGain();
        fb.gain.setValueAtTime(0.24, ctx.currentTime);
        const wet = ctx.createGain();
        wet.gain.setValueAtTime(0.18, ctx.currentTime);

        filter.connect(master);
        filter.connect(delay);
        delay.connect(fb);
        fb.connect(delay);
        delay.connect(wet);
        wet.connect(master);
        master.connect(ctx.destination);

        this._musicBus = { input: filter, master };
      }
      return this._musicBus;
    }

    setSeason(seasonId) {
      if (SEASON_MUSIC[seasonId]) {
        this._season = seasonId;
      }
    }

    unlockAndStartMusic() {
      this._unlocked = true;
      if (this.musicEnabled) {
        this.startMusic();
      }
    }

    setMusicEnabled(flag) {
      this.musicEnabled = !!flag;
      try {
        localStorage.setItem(MUSIC_STORAGE_KEY, this.musicEnabled ? '1' : '0');
      } catch (e) {}
      if (this.musicEnabled) {
        this.startMusic();
      } else {
        this.stopMusic();
      }
    }

    startMusic() {
      if (!this.musicEnabled) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      const bus = this._ensureMusicBus();
      if (!bus || !this.ctx) return;

      const now = this.ctx.currentTime;
      bus.master.gain.cancelScheduledValues(now);
      bus.master.gain.setValueAtTime(Math.max(0.0001, bus.master.gain.value), now);
      bus.master.gain.linearRampToValueAtTime(0.9, now + 1.2);

      if (!this._musicTimer) {
        this._musicNextTime = now + 0.15;
        this._musicTimer = window.setInterval(() => this._scheduleMusicTick(), 240);
      }
    }

    stopMusic() {
      this._pauseScheduler();
      if (this._musicBus && this.ctx) {
        const now = this.ctx.currentTime;
        this._musicBus.master.gain.cancelScheduledValues(now);
        this._musicBus.master.gain.setValueAtTime(Math.max(0.0001, this._musicBus.master.gain.value), now);
        this._musicBus.master.gain.linearRampToValueAtTime(0.0001, now + 0.45);
      }
    }

    _pauseScheduler() {
      if (this._musicTimer) {
        window.clearInterval(this._musicTimer);
        this._musicTimer = null;
      }
    }

    _scheduleMusicTick() {
      if (!this.musicEnabled || !this.ctx || !this._musicBus) return;
      if (this.ctx.state !== 'running') return;

      const now = this.ctx.currentTime;
      // Catch up cleanly if the browser paused timers briefly
      if (this._musicNextTime < now - 0.5) {
        this._musicNextTime = now + 0.1;
      }

      const lookahead = now + 0.42;
      while (this._musicNextTime < lookahead) {
        this._scheduleStep(this._musicNextTime);
        const cfg = SEASON_MUSIC[this._season] || SEASON_MUSIC.autumn;
        this._musicNextTime += cfg.stepSec;
      }
    }

    _scheduleStep(t) {
      const cfg = SEASON_MUSIC[this._season] || SEASON_MUSIC.autumn;
      const stepInBar = this._musicStep & 7; // 8 gentle eighth-ish beats per chord measure
      const chord = cfg.chords[this._musicChordIdx % cfg.chords.length];

      // 1. Warm sustained pad chord at the top of each 8-step measure
      if (stepInBar === 0) {
        const padDur = cfg.stepSec * 8.4;
        this._playMusicVoice(chord[0], padDur, 'sine', cfg.padVol * 1.15, t, 1.3, 2.0);
        this._playMusicVoice(chord[2], padDur, 'triangle', cfg.padVol * 0.72, t, 1.5, 2.2);
        this._playMusicVoice(chord[3], padDur, 'sine', cfg.padVol * 0.58, t + 0.08, 1.6, 2.2);
      }

      // 2. Soft plucked folk harp arpeggio (leaves breathing room on beats 3 & 7)
      const arpOrder = [0, 1, 2, -1, 3, 2, 1, -1];
      const arpSlot = arpOrder[stepInBar];
      if (arpSlot >= 0 && Math.random() < 0.86) {
        const freq = chord[arpSlot] * (stepInBar === 4 ? 2 : 1);
        const vel = cfg.pluckVol * (0.8 + Math.random() * 0.35);
        this._playMusicVoice(freq, cfg.stepSec * 2.4, 'triangle', vel, t, 0.018, 1.4);
      }

      // 3. Occasional lyrical seasonal melody note or Winter music-box sparkle
      const melodyBar = (this._musicStep >> 3) % 4;
      const playMelody = (stepInBar === 2 || stepInBar === 5 || (stepInBar === 6 && melodyBar % 2 === 1));
      if (playMelody && Math.random() < 0.62) {
        const scale = cfg.melody;
        const delta = Math.random() < 0.55 ? (Math.random() < 0.5 ? 1 : -1) : (Math.random() < 0.5 ? 2 : -2);
        this._musicMelodyIdx = Math.max(0, Math.min(scale.length - 1, this._musicMelodyIdx + delta));
        const mFreq = scale[this._musicMelodyIdx];
        const isChime = Math.random() < cfg.chimeChance;
        if (isChime) {
          // Delicate celesta / music-box shimmer (fundamental + soft octave glint)
          this._playMusicVoice(mFreq * 2, cfg.stepSec * 2.6, 'sine', cfg.melodyVol * 0.65, t, 0.01, 1.6);
          this._playMusicVoice(mFreq * 4, cfg.stepSec * 1.1, 'sine', cfg.melodyVol * 0.16, t, 0.008, 0.7);
        } else {
          this._playMusicVoice(mFreq, cfg.stepSec * 2.8, 'sine', cfg.melodyVol, t, 0.035, 1.7);
        }
      }

      this._musicStep++;
      if ((this._musicStep & 7) === 0) {
        // Advance chord smoothly with occasional gentle turnaround variation
        this._musicChordIdx = (this._musicChordIdx + 1) % cfg.chords.length;
      }
    }

    _playMusicVoice(freq, dur, type, vol, startTime, attack = 0.02, release = 0.8) {
      if (!this.ctx || !this._musicBus || this.musicVoices >= MAX_MUSIC_VOICES) return;
      this.musicVoices++;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);

      const safeAttack = Math.min(attack, dur * 0.45);
      const endTime = startTime + dur;
      const relStart = Math.max(startTime + safeAttack + 0.02, endTime - Math.min(release, dur * 0.65));

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(vol, startTime + safeAttack);
      gain.gain.setValueAtTime(vol * 0.85, relStart);
      gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

      osc.connect(gain);
      gain.connect(this._musicBus.input);
      osc.onended = () => {
        this.musicVoices = Math.max(0, this.musicVoices - 1);
        try { osc.disconnect(); } catch (e) {}
        try { gain.disconnect(); } catch (e) {}
      };
      osc.start(startTime);
      osc.stop(endTime + 0.03);
    }

    _canTrigger(tag, minGapMs = 60) {
      if (!this.enabled) return false;
      const now = performance.now();
      const prev = this._lastPlayed[tag] || 0;
      if (now - prev < minGapMs) return false;
      this._lastPlayed[tag] = now;
      return true;
    }

    tone(freq, dur, type = 'triangle', vol = 0.08, delay = 0, slideTo = null) {
      const ctx = this.ensure(false);
      if (!ctx || this.activeVoices >= MAX_ACTIVE_VOICES) return;
      this.activeVoices++;
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.onended = () => {
        this.activeVoices = Math.max(0, this.activeVoices - 1);
        try { osc.disconnect(); } catch (e) {}
        try { gain.disconnect(); } catch (e) {}
      };
      osc.start(now);
      osc.stop(now + dur + 0.02);
    }

    click() {
      if (!this._canTrigger('click', 35)) return;
      this.tone(520, 0.045, 'square', 0.035, 0, 420);
    }

    plant() {
      if (!this._canTrigger('plant', 70)) return;
      this.tone(170, 0.09, 'triangle', 0.09, 0, 250);
      this.tone(330, 0.07, 'sine', 0.05, 0.05, 440);
    }

    build() {
      if (!this._canTrigger('build', 60)) return;
      this.tone(220, 0.07, 'square', 0.05, 0, 260);
      this.tone(330, 0.08, 'triangle', 0.07, 0.06, 440);
      this.tone(440, 0.11, 'triangle', 0.06, 0.12);
    }

    cash() {
      if (!this._canTrigger('cash', 80)) return;
      this.tone(987, 0.08, 'sine', 0.07, 0);
      this.tone(1318, 0.16, 'sine', 0.08, 0.07);
    }

    chop() {
      if (!this._canTrigger('chop', 75)) return;
      this.tone(150, 0.08, 'sawtooth', 0.06, 0, 85);
      this.tone(120, 0.11, 'sawtooth', 0.05, 0.08, 70);
    }

    landBuy() {
      if (!this._canTrigger('landBuy', 80)) return;
      this.tone(392, 0.09, 'triangle', 0.08, 0);
      this.tone(493, 0.09, 'triangle', 0.08, 0.08);
      this.tone(587, 0.14, 'triangle', 0.09, 0.16);
      this.tone(784, 0.22, 'sine', 0.08, 0.24);
    }

    error() {
      if (!this._canTrigger('error', 90)) return;
      this.tone(190, 0.11, 'sawtooth', 0.05, 0, 140);
    }

    milestone() {
      if (!this._canTrigger('milestone', 150)) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((n, i) => this.tone(n, 0.22, 'triangle', 0.08, i * 0.09));
    }

    bark() {
      if (!this._canTrigger('bark', 120)) return;
      this.tone(360, 0.075, 'triangle', 0.07, 0, 520);
      this.tone(420, 0.085, 'triangle', 0.07, 0.11, 290);
    }

    tractorBell() {
      if (!this._canTrigger('tractorBell', 120)) return;
      this.tone(740, 0.09, 'sine', 0.055, 0);
      this.tone(988, 0.14, 'sine', 0.055, 0.08);
    }

    splash() {
      if (!this._canTrigger('splash', 85)) return;
      this.tone(260, 0.07, 'sine', 0.05, 0, 180);
      this.tone(420, 0.09, 'triangle', 0.04, 0.05, 300);
    }

    skate() {
      if (!this._canTrigger('skate', 85)) return;
      this.tone(1180, 0.06, 'sine', 0.04, 0, 1560);
      this.tone(1480, 0.08, 'triangle', 0.035, 0.05, 1760);
    }
  }

  PT.audio = new SoundManager();
})();
