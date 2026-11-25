/* ==========================================================================
   DILLY STRIKE — Live In-Engine Gameplay + AAA Cinematic Reveal Trailer
   Real-time 60 FPS Three.js combat choreography, live CS:GO Panorama HUD,
   Radial Buy Wheel, 2x Sniper Scope, tactical utility, key-art bridges,
   interactive chapter timeline, and 128 BPM synthesized esports score.
   ========================================================================== */

const SHOTS = [
  {
    type: 'card',
    label: 'INTRO',
    kicker: 'DILLY GAMING PRESENTS',
    title: 'DILLY STRIKE',
    sub: 'LIVE IN-ENGINE GAMEPLAY & TACTICAL REVEAL',
    dur: 2200,
    sfx: 'bwaam'
  },
  {
    type: 'live',
    scene: 'drone_breach',
    hud: false,
    label: 'LIVE · DRONE 5V5',
    tag: 'LIVE IN-ENGINE · 60 FPS · DRONE CAM',
    kicker: 'ACTIVE DUTY MAP · DE_DUSTLINE',
    title: 'WELCOME TO THE CITADEL.',
    sub: 'PBR sandstone architecture, soft shadows, and 5v5 tactical crossfire.',
    dur: 4200,
    sfx: 'bwaam'
  },
  {
    type: 'shot',
    img: 'assets/trailer/shot1.jpg',
    label: 'KEY ART · CITADEL',
    tag: 'CINEMATIC KEY ART',
    kicker: 'GLOBAL TACTICAL OFFENSIVE',
    title: 'HOLD THE LINE.',
    sub: 'Zero downloads. Instant competitive 3D gunplay in your browser.',
    cam: { s0: 1.04, s1: 1.16, x0: -2.0, x1: 1.8, y0: 0.4, y1: -1.2 },
    dur: 1950,
    sfx: 'riser'
  },
  {
    type: 'live',
    scene: 'ak_entry',
    hud: true,
    dimCaptionRanges: [[0, 1180]],
    label: 'LIVE · DILL-47 & ARMORY',
    tag: 'LIVE GAMEPLAY · PANORAMA HUD & BUY WHEEL',
    kicker: 'RADIAL ARMORY · DILL-47 RIFLE',
    title: 'CRISP ONE-TAP PRECISION.',
    sub: 'Buy Wheel telemetry, 3D weapon inspect, crouch spread control & live 2D radar.',
    dur: 5400,
    sfx: 'bwaam'
  },
  {
    type: 'shot',
    img: 'assets/trailer/shot2.jpg',
    label: 'KEY ART · BREACH',
    tag: 'CINEMATIC KEY ART',
    kicker: 'TACTICAL UTILITY SUITE',
    title: 'SMOKE. FLASH. BREACH.',
    sub: 'Cut off sightlines, blind defenders, and explode onto the bombsite.',
    cam: { s0: 1.15, s1: 1.03, x0: 2.4, x1: -2.0, y0: -0.6, y1: 0.7 },
    dur: 1850,
    sfx: 'burst'
  },
  {
    type: 'live',
    scene: 'utility_breach',
    hud: true,
    label: 'LIVE · UTILITY & KODIAK .50',
    tag: 'LIVE GAMEPLAY · SMOKE / FLASH / DASH',
    kicker: 'VIPER-S SILENCED · KODIAK .50',
    title: 'BREACH EVERY ANGLE.',
    sub: 'Deploy Mid smokes, pop flashbangs, jet-dash in, and 1-tap with the Kodiak .50.',
    dur: 5000,
    sfx: 'bwaam'
  },
  {
    type: 'shot',
    img: 'assets/trailer/shot3.jpg',
    label: 'KEY ART · SNIPER',
    tag: 'CINEMATIC KEY ART',
    kicker: 'APEX-50 · MATCH POINT',
    title: 'HOLD YOUR BREATH.',
    sub: 'High-risk, high-reward bolt-action sniper lethality.',
    cam: { s0: 1.05, s1: 1.20, x0: -1.6, x1: 1.4, y0: 0.7, y1: -1.4 },
    dur: 1800,
    sfx: 'riser'
  },
  {
    type: 'live',
    scene: 'awp_karambit_ace',
    hud: true,
    dimCaptionRanges: [[3900, 5400]],
    label: 'LIVE · APEX-50 & KARAMBIT ACE',
    tag: 'LIVE GAMEPLAY · 2× SCOPE & ACE CLUTCH',
    kicker: 'APEX-50 2× OPTIC · DILLY FANG',
    title: 'ONE SHOT. TEAM WIPED.',
    sub: '2× mil-dot sniper flick into a gold Karambit dash finisher & competitive scoreboard.',
    dur: 5400,
    sfx: 'sniper'
  },
  {
    type: 'live',
    scene: 'finale_orbit',
    hud: false,
    label: 'LIVE · 5V5 BOMBSITE CLASH',
    tag: 'LIVE IN-ENGINE · BOMBSITE A RETAKE',
    kicker: 'RUST MULTIPLAYER + TACTICAL BOTS',
    title: 'FIGHT FOR EVERY ROUND.',
    sub: 'Authoritative Rust WebSocket server, customizable keybinds & solo bot matches.',
    dur: 3600,
    sfx: 'bwaam'
  },
  {
    type: 'shot',
    img: 'assets/trailer/shot4.jpg',
    label: 'KEY ART · FINALE',
    tag: 'CINEMATIC KEY ART',
    kicker: 'COUNTER-TERRORISTS VS TERRORISTS',
    title: 'CHOOSE YOUR SIDE.',
    sub: '5 multi-part 3D weapons · Full CS:GO Panorama UI · Free in browser.',
    cam: { s0: 1.16, s1: 1.02, x0: 0, x1: 0, y0: -1.1, y1: 0.5 },
    dur: 1900,
    sfx: 'bwaam'
  },
  {
    type: 'end',
    label: 'PLAY NOW',
    dur: 999999,
    sfx: 'bwaam'
  }
];

// Preload key-art plates so cuts are instantaneous
for (const s of SHOTS) {
  if (s.img) { const im = new Image(); im.src = s.img; }
}

const style = document.createElement('style');
style.textContent = `
  body.trailer-open #modal-lobby { display: none !important; }
  body.trailer-open #killfeed { top: 56px !important; }

  #ds-tr {
    position: fixed; inset: 0; z-index: 120; display: none;
    font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #fff;
    user-select: none; pointer-events: none;
    background: #04060a; transition: background .2s ease;
  }
  #ds-tr.open { display: block; }
  #ds-tr.is-live { background: transparent; }

  #ds-tr-stage {
    position: absolute; inset: 0; overflow: hidden;
  }

  /* Dynamic Widescreen Cinema Bars (snap cleanly on hard cuts) */
  .tr-bar {
    position: absolute; left: 0; right: 0; height: 6.5vh; background: #030508;
    z-index: 6; pointer-events: none;
  }
  .tr-bar.top { top: 0; border-bottom: 1px solid rgba(227,167,59,.22); }
  .tr-bar.bot { bottom: 0; border-top: 1px solid rgba(227,167,59,.22); }
  #ds-tr.hud-mode .tr-bar { height: 0; border-color: transparent; }

  #tr-img {
    position: absolute; inset: -6%; width: 112%; height: 112%; object-fit: cover;
    will-change: transform, opacity; opacity: 0; transition: opacity .14s ease;
    filter: contrast(1.08) saturate(1.12); z-index: 1;
  }
  #tr-fx { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 4; }
  #tr-vig {
    position: absolute; inset: 0; z-index: 3; pointer-events: none;
    background:
      linear-gradient(180deg, rgba(4,6,10,.62) 0%, rgba(4,6,10,0) 24%, rgba(4,6,10,0) 62%, rgba(4,6,10,.88) 100%),
      radial-gradient(ellipse at 50% 50%, transparent 50%, rgba(4,6,10,.55) 100%);
  }
  #ds-tr.hud-mode #tr-vig { opacity: 0.28; }

  #tr-strobe {
    position: absolute; inset: 0; z-index: 10; background: #fff; opacity: 0; pointer-events: none; transition: opacity .14s;
  }

  /* Live Broadcast Telemetry Badge */
  #tr-badge {
    position: absolute; top: calc(6.5vh + 16px); left: 28px; z-index: 9;
    display: inline-flex; align-items: center; gap: 8px;
    padding: 5px 12px; border-radius: 3px;
    background: rgba(8, 12, 18, 0.84); border: 1px solid rgba(255,255,255,.16);
    border-left: 3px solid #ef4444;
    font: 800 11px/1 system-ui, sans-serif; letter-spacing: .16em; text-transform: uppercase;
    color: #f1f5f9; box-shadow: 0 6px 20px rgba(0,0,0,.55);
    transition: opacity .16s ease;
  }
  #tr-badge .dot {
    width: 8px; height: 8px; border-radius: 50%; background: #ef4444;
    box-shadow: 0 0 10px #ef4444; animation: trRecPulse .9s infinite alternate;
  }
  #tr-badge.art { border-left-color: #f5b82e; }
  #tr-badge.art .dot { background: #f5b82e; box-shadow: 0 0 8px #f5b82e; animation: none; }
  #ds-tr.hud-mode #tr-badge {
    top: 64px; left: 50%; transform: translateX(-50%);
    background: rgba(8, 12, 18, 0.78);
  }
  #ds-tr.modal-focus #tr-badge,
  #ds-tr.modal-focus #tr-caption { opacity: 0 !important; }
  @keyframes trRecPulse { from { opacity: 0.45; transform: scale(0.88); } to { opacity: 1; transform: scale(1.12); } }

  /* Slam-in Shot Caption (adapts cleanly around CS:GO HUD in hud-mode) */
  #tr-caption {
    position: absolute; left: 42px; bottom: calc(6.5vh + 26px); z-index: 8; max-width: 720px;
    transition: opacity .18s ease;
  }
  #tr-kick {
    font: 800 11.5px/1 system-ui, sans-serif; letter-spacing: .28em; color: #f5b82e;
    text-transform: uppercase; margin-bottom: 6px; text-shadow: 0 2px 8px rgba(0,0,0,.9);
  }
  #tr-title {
    margin: 0; font: 900 clamp(26px, 4.2vw, 52px)/1.02 system-ui, sans-serif; letter-spacing: .04em;
    text-transform: uppercase; text-shadow: 0 4px 24px rgba(0,0,0,.95);
  }
  #tr-sub {
    margin: 7px 0 0; font: 500 14.5px/1.4 system-ui, sans-serif; color: rgba(235,242,252,.88);
    text-shadow: 0 2px 10px rgba(0,0,0,.9);
  }
  #ds-tr.hud-mode #tr-caption {
    left: 18px; bottom: 88px; max-width: 430px;
    background: linear-gradient(90deg, rgba(8,12,18,.84), rgba(8,12,18,.42));
    border-left: 3px solid #f5b82e; padding: 9px 14px; border-radius: 2px;
  }
  #ds-tr.hud-mode #tr-title { font-size: clamp(19px, 2.3vw, 28px); }
  #ds-tr.hud-mode #tr-sub { font-size: 12.5px; margin-top: 4px; }

  /* Center Intro / End Slate */
  #tr-slate {
    position: absolute; inset: 0; z-index: 11; display: none; flex-direction: column;
    align-items: center; justify-content: center; text-align: center; padding: 32px;
    pointer-events: auto;
    background: radial-gradient(circle at 50% 45%, rgba(16,22,34,.78), rgba(4,6,10,.92));
    backdrop-filter: blur(4px);
  }
  #tr-slate.show { display: flex; }
  #tr-slate img { height: 66px; width: auto; margin-bottom: 12px; filter: drop-shadow(0 8px 24px rgba(245,184,46,.38)); }
  #tr-slate .sl-k { font: 800 12px/1 system-ui, sans-serif; letter-spacing: .32em; color: #f5b82e; text-transform: uppercase; margin-bottom: 10px; }
  #tr-slate h1 {
    margin: 0 0 8px; font: 900 clamp(38px, 6vw, 74px)/1.0 system-ui, sans-serif; letter-spacing: .1em;
    background: linear-gradient(90deg, #fff 0%, #ffd666 55%, #6eb3f7 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  #tr-slate p { margin: 0 0 24px; font-size: 14.5px; letter-spacing: .12em; color: #cbd5e1; font-weight: 600; }
  .sl-btns { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }

  /* Top Controls */
  #tr-top {
    position: absolute; top: 14px; right: 16px; z-index: 14; display: flex; gap: 8px; pointer-events: auto;
  }
  .tr-btn {
    padding: 7px 13px; border-radius: 4px; border: 1px solid rgba(255,255,255,.24);
    background: rgba(8,11,18,.84); color: #fff; font: 800 11.5px/1 system-ui, sans-serif;
    letter-spacing: .09em; text-transform: uppercase; cursor: pointer; transition: .14s;
  }
  .tr-btn:hover { border-color: #f5b82e; background: rgba(245,184,46,.22); }
  .tr-btn.gold {
    background: linear-gradient(180deg, #67c64e, #3f8d2c); color: #fff;
    border-color: #8ce874; padding: 13px 26px; font-size: 13.5px;
    box-shadow: 0 8px 28px rgba(75,156,56,.45);
  }

  /* Interactive Segmented Chapter Scrubber */
  #tr-prog-wrap {
    position: absolute; left: 0; right: 0; bottom: 0; height: 18px; z-index: 14;
    display: flex; align-items: flex-end; pointer-events: auto; cursor: pointer;
  }
  #tr-prog {
    position: relative; width: 100%; height: 5px; background: rgba(255,255,255,.16);
    transition: height .14s ease; display: flex;
  }
  #tr-prog-wrap:hover #tr-prog { height: 9px; }
  #tr-prog-fill {
    position: absolute; left: 0; top: 0; bottom: 0; width: 0%;
    background: linear-gradient(90deg, #f5b82e, #ef4444, #6ee755); z-index: 2; pointer-events: none;
  }
  .tr-seg {
    height: 100%; border-right: 1.5px solid rgba(0,0,0,.75); position: relative; z-index: 3;
  }
  .tr-seg.live-seg { background: rgba(110, 231, 85, 0.12); }
  .tr-seg:hover { background: rgba(255, 255, 255, 0.25); }
  #tr-tip {
    position: absolute; bottom: 16px; transform: translateX(-50%);
    padding: 4px 9px; border-radius: 3px; background: rgba(8,12,18,.94);
    border: 1px solid rgba(245,184,46,.5); color: #fff;
    font: 800 10.5px/1 system-ui, sans-serif; letter-spacing: .1em; white-space: nowrap;
    opacity: 0; pointer-events: none; transition: opacity .12s;
  }
  #tr-prog-wrap:hover #tr-tip { opacity: 1; }
`;
document.head.appendChild(style);

const TIMELINE_SHOTS = SHOTS.filter(s => s.type !== 'end');
const totalDur = TIMELINE_SHOTS.reduce((a, b) => a + b.dur, 0);

const root = document.createElement('div');
root.id = 'ds-tr';
root.innerHTML = `
  <div id="ds-tr-stage">
    <img id="tr-img" src="" alt="Dilly Strike Trailer">
    <div id="tr-vig"></div>
    <canvas id="tr-fx"></canvas>
    <div id="tr-strobe"></div>
    <div class="tr-bar top"></div>
    <div class="tr-bar bot"></div>

    <div id="tr-badge"><span class="dot"></span><span id="tr-badge-txt">LIVE IN-ENGINE · 60 FPS</span></div>

    <div id="tr-caption">
      <div id="tr-kick"></div>
      <h2 id="tr-title"></h2>
      <p id="tr-sub"></p>
    </div>

    <div id="tr-slate">
      <img src="../img/dilly-gaming-logo.png" alt="Dilly Gaming">
      <div class="sl-k" id="sl-k">DILLY GAMING PRESENTS</div>
      <h1 id="sl-h">DILLY STRIKE</h1>
      <p id="sl-p">LIVE IN BROWSER · ZERO DOWNLOADS · RUST MULTIPLAYER</p>
      <div class="sl-btns" id="sl-btns" style="display:none;">
        <button class="tr-btn gold" id="tr-play-now">▶ PLAY COMPETITIVE NOW</button>
        <button class="tr-btn" id="tr-replay" style="padding:13px 20px;">↻ REPLAY TRAILER</button>
      </div>
    </div>

    <div id="tr-top">
      <button class="tr-btn" id="tr-mute">🔊 SOUND: ON</button>
      <button class="tr-btn" id="tr-skip">SKIP ✕</button>
    </div>

    <div id="tr-prog-wrap">
      <div id="tr-tip">LIVE</div>
      <div id="tr-prog"><div id="tr-prog-fill"></div></div>
    </div>
  </div>
`;
document.body.appendChild(root);

// Build clickable chapter segments along the timeline
const progTrack = root.querySelector('#tr-prog');
const tipEl = root.querySelector('#tr-tip');
TIMELINE_SHOTS.forEach((s, idx) => {
  const seg = document.createElement('div');
  seg.className = 'tr-seg' + (s.type === 'live' ? ' live-seg' : '');
  seg.style.width = `${(s.dur / totalDur) * 100}%`;
  seg.addEventListener('mouseenter', () => { tipEl.textContent = s.label || 'SCENE'; });
  seg.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!playing) openTrailer();
    startPulse();
    loadShot(idx);
  });
  progTrack.appendChild(seg);
});
root.querySelector('#tr-prog-wrap').addEventListener('mousemove', (e) => {
  const rect = progTrack.getBoundingClientRect();
  const x = Math.max(60, Math.min(rect.width - 60, e.clientX - rect.left));
  tipEl.style.left = `${x}px`;
});

/* ---------- 128 BPM Synthesized Esports Trailer Score ---------- */
let actx = null, beatTimer = null, muted = false;

function syncMuteButton() {
  const btn = root.querySelector('#tr-mute');
  if (muted) btn.textContent = '🔇 SOUND: OFF';
  else if (actx && actx.state === 'suspended') btn.textContent = '🔈 CLICK FOR SOUND';
  else btn.textContent = '🔊 SOUND: ON';
  if (window.DillyStrike?.setSfxMuted) window.DillyStrike.setSfxMuted(muted);
}

function ensureAudio() {
  if (muted) return null;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume().then(syncMuteButton).catch(() => {});
    syncMuteButton();
    return actx.state === 'running' ? actx : null;
  } catch (_) { return null; }
}

window.addEventListener('pointerdown', () => {
  if (playing && !muted && actx && actx.state === 'suspended') {
    actx.resume().then(syncMuteButton).catch(() => {});
  }
});

function playBwaam() {
  const c = ensureAudio(); if (!c) return;
  const t = c.currentTime;
  [36.7, 73.4, 110.0].forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = i === 0 ? 'sine' : 'sawtooth';
    o.frequency.setValueAtTime(f * 1.03, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.94, t + 1.35);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(i === 0 ? 0.16 : 0.065, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.55);
    const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 380;
    o.connect(flt); flt.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + 1.6);
  });
}

function playRiser() {
  const c = ensureAudio(); if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(680, t + 1.65);
  g.gain.setValueAtTime(0.001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 1.55);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.72);
  const flt = c.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 900;
  o.connect(flt); flt.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + 1.75);
}

function playKick() {
  const c = ensureAudio(); if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(135, t);
  o.frequency.exponentialRampToValueAtTime(36, t + 0.13);
  g.gain.setValueAtTime(0.17, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + 0.17);
}

function playBassNote(freq) {
  const c = ensureAudio(); if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(freq, t);
  f.type = 'lowpass';
  f.frequency.setValueAtTime(520, t);
  f.frequency.exponentialRampToValueAtTime(140, t + 0.2);
  g.gain.setValueAtTime(0.075, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.21);
  o.connect(f); f.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + 0.22);
}

function playNoiseHit(dur, freq, vol) {
  const c = ensureAudio(); if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const b = c.createBuffer(1, len, c.sampleRate);
  const ch = b.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.28));
  const src = c.createBufferSource(); src.buffer = b;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
  const g = c.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(c.destination); src.start();
}

const BASS_LINE = [36.71, 36.71, 43.65, 36.71, 49.00, 43.65, 46.25, 34.65];
function startPulse() {
  stopPulse();
  let step = 0;
  beatTimer = setInterval(() => {
    if (!playing || muted) return;
    const sub = step % 4;
    if (sub === 0) playKick();
    if (step % 8 === 4) playNoiseHit(0.11, 1850, 0.085); // Snare clap
    if (sub % 2 === 1) playNoiseHit(0.035, 5800, 0.032); // Crisp hi-hat
    if (sub === 0 || sub === 2) playBassNote(BASS_LINE[Math.floor(step / 4) % BASS_LINE.length]);
    step++;
  }, 117); // 128 BPM 16th-note pulse
}
function stopPulse() { if (beatTimer) { clearInterval(beatTimer); beatTimer = null; } }

/* ---------- Atmospheric Embers Canvas ---------- */
const fxCv = root.querySelector('#tr-fx');
const fctx = fxCv.getContext('2d');
const embers = Array.from({ length: 64 }, (_, i) => ({
  x: Math.random(), y: Math.random(),
  vx: 0.04 + Math.random() * 0.08, vy: -0.05 - Math.random() * 0.11,
  r: 1.1 + Math.random() * 2.2,
  col: i % 3 === 0 ? 'rgba(110,179,247,0.72)' : 'rgba(255,204,77,0.78)'
}));

/* ---------- Playback Engine ---------- */
const imgEl = root.querySelector('#tr-img');
const strobeEl = root.querySelector('#tr-strobe');
const capEl = root.querySelector('#tr-caption');
const badgeEl = root.querySelector('#tr-badge');
const badgeTxtEl = root.querySelector('#tr-badge-txt');
const slateEl = root.querySelector('#tr-slate');
const progEl = root.querySelector('#tr-prog-fill');

let playing = false, shotIdx = 0, shotStart = 0, rafId = 0;

function flashCut(strength = 0.65) {
  strobeEl.style.opacity = String(strength);
  setTimeout(() => { strobeEl.style.opacity = '0'; }, 105);
}

function loadShot(idx) {
  shotIdx = idx;
  shotStart = performance.now();
  const s = SHOTS[idx];
  if (!s) return;

  flashCut(s.type === 'live' ? 0.5 : (s.type === 'shot' ? 0.55 : 0.3));
  if (s.sfx === 'bwaam') playBwaam();
  else if (s.sfx === 'riser') playRiser();
  else if (s.sfx === 'burst') {
    [0, 115, 230, 345].forEach(ms => setTimeout(() => playing && playNoiseHit(0.085, 980, 0.14), ms));
  } else if (s.sfx === 'sniper') {
    playBwaam();
  }

  root.classList.toggle('is-live', s.type === 'live' || s.type === 'end');
  root.classList.toggle('hud-mode', !!(s.type === 'live' && s.hud));
  root.classList.remove('modal-focus');

  if (s.type === 'card') {
    if (window.DillyStrike?.trailer) window.DillyStrike.trailer.playScene('drone_breach');
    imgEl.style.opacity = '0';
    capEl.style.opacity = '0';
    badgeEl.style.opacity = '0';
    slateEl.classList.add('show');
    root.querySelector('#sl-k').textContent = s.kicker;
    root.querySelector('#sl-h').textContent = s.title;
    root.querySelector('#sl-p').textContent = s.sub;
    root.querySelector('#sl-btns').style.display = 'none';
  } else if (s.type === 'end') {
    stopPulse();
    if (window.DillyStrike?.trailer) window.DillyStrike.trailer.playScene('end_bg');
    imgEl.style.opacity = '0';
    capEl.style.opacity = '0';
    badgeEl.style.opacity = '0';
    slateEl.classList.add('show');
    root.querySelector('#sl-k').textContent = 'DILLY GAMING · OUT NOW';
    root.querySelector('#sl-h').textContent = 'DILLY STRIKE';
    root.querySelector('#sl-p').textContent = 'FREE IN BROWSER · ZERO DOWNLOADS · RUST MULTIPLAYER';
    root.querySelector('#sl-btns').style.display = 'flex';
    progEl.style.width = '100%';
  } else if (s.type === 'live') {
    slateEl.classList.remove('show');
    imgEl.style.opacity = '0';
    capEl.style.opacity = '1';
    badgeEl.style.opacity = '1';
    badgeEl.classList.remove('art');
    badgeTxtEl.textContent = s.tag || 'LIVE IN-ENGINE · 60 FPS';
    root.querySelector('#tr-kick').textContent = s.kicker;
    root.querySelector('#tr-title').textContent = s.title;
    root.querySelector('#tr-sub').textContent = s.sub;
    if (window.DillyStrike?.trailer) window.DillyStrike.trailer.playScene(s.scene);
  } else {
    // Generated 16:9 key-art bridge cut (pause live HUD behind it)
    if (window.DillyStrike?.trailer) window.DillyStrike.trailer.playScene('end_bg');
    slateEl.classList.remove('show');
    imgEl.src = s.img;
    imgEl.style.opacity = '1';
    capEl.style.opacity = '1';
    badgeEl.style.opacity = '1';
    badgeEl.classList.add('art');
    badgeTxtEl.textContent = s.tag || 'CINEMATIC KEY ART';
    root.querySelector('#tr-kick').textContent = s.kicker;
    root.querySelector('#tr-title').textContent = s.title;
    root.querySelector('#tr-sub').textContent = s.sub;
  }
}

function tick(now) {
  if (!playing) return;
  const s = SHOTS[shotIdx];
  const el = now - shotStart;

  if (s.type === 'shot') {
    const u = Math.min(1, el / s.dur);
    const sc = s.cam.s0 + (s.cam.s1 - s.cam.s0) * u;
    const tx = s.cam.x0 + (s.cam.x1 - s.cam.x0) * u;
    const ty = s.cam.y0 + (s.cam.y1 - s.cam.y0) * u;
    imgEl.style.transform = `translate(${tx}%, ${ty}%) scale(${sc})`;
  } else if (s.type === 'live') {
    const modalOpen = !!(
      document.getElementById('modal-buy')?.classList.contains('open') ||
      document.getElementById('modal-sb')?.classList.contains('open')
    );
    root.classList.toggle('modal-focus', modalOpen);
  }

  if (s.type !== 'end') {
    let elapsedTotal = el;
    for (let i = 0; i < shotIdx; i++) elapsedTotal += SHOTS[i].dur;
    progEl.style.width = `${Math.min(100, (elapsedTotal / totalDur) * 100)}%`;
    if (el >= s.dur) {
      loadShot(shotIdx + 1);
      rafId = requestAnimationFrame(tick);
      return;
    }
  }

  // Subtle embers on key-art & non-HUD cinematic shots
  const w = fxCv.clientWidth || 1280, h = fxCv.clientHeight || 720;
  if (fxCv.width !== w || fxCv.height !== h) { fxCv.width = w; fxCv.height = h; }
  fctx.clearRect(0, 0, w, h);
  const emberAlpha = (s.type === 'live' && s.hud) ? 0.18 : 0.85;
  fctx.globalAlpha = emberAlpha;
  for (const e of embers) {
    e.x = (e.x + e.vx / 60) % 1;
    e.y = (e.y + e.vy / 60 + 1) % 1;
    fctx.fillStyle = e.col;
    fctx.beginPath(); fctx.arc(e.x * w, e.y * h, e.r, 0, Math.PI * 2); fctx.fill();
  }
  fctx.globalAlpha = 1;

  rafId = requestAnimationFrame(tick);
}

export function openTrailer() {
  playing = true;
  document.body.classList.add('trailer-open');
  root.classList.add('open');
  if (window.DillyStrike?.setSfxMuted) window.DillyStrike.setSfxMuted(muted);
  if (window.DillyStrike?.trailer) window.DillyStrike.trailer.start();
  ensureAudio();
  startPulse();
  loadShot(0);
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(tick);
}

export function closeTrailer(skipLobbyRestore = false) {
  playing = false;
  stopPulse();
  cancelAnimationFrame(rafId);
  root.classList.remove('open', 'is-live', 'hud-mode');
  document.body.classList.remove('trailer-open');
  if (window.DillyStrike?.setSfxMuted) window.DillyStrike.setSfxMuted(false);
  if (window.DillyStrike?.trailer) window.DillyStrike.trailer.stop(!!skipLobbyRestore);
  if (location.hash === '#trailer') history.replaceState(null, '', location.pathname);
}

root.querySelector('#tr-skip').onclick = () => closeTrailer(false);
root.querySelector('#tr-replay').onclick = () => openTrailer();
root.querySelector('#tr-play-now').onclick = () => {
  closeTrailer(true);
  if (window.DillyStrike) window.DillyStrike.enterMatch(false);
};
root.querySelector('#tr-mute').onclick = () => {
  if (actx && actx.state === 'suspended') {
    muted = false;
    actx.resume().then(syncMuteButton).catch(() => {});
    return;
  }
  muted = !muted;
  syncMuteButton();
};

window.addEventListener('keydown', (e) => {
  if (!playing) return;
  if (e.code === 'Escape') {
    e.stopImmediatePropagation();
    closeTrailer(false);
  }
}, true);

window.DillyStrikeTrailer = {
  open: openTrailer,
  close: closeTrailer,
  jumpTo: (idx) => { if (!playing) openTrailer(); loadShot(idx); },
  getShots: () => SHOTS.map((s, i) => ({ index: i, type: s.type, scene: s.scene || null, label: s.label }))
};

function bindTrailerTriggers() {
  const btn = document.getElementById('btn-watch-trailer');
  if (btn) btn.addEventListener('click', () => openTrailer());
  if (location.hash === '#trailer') setTimeout(() => { if (!playing) openTrailer(); }, 180);
}
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bindTrailerTriggers);
} else {
  bindTrailerTriggers();
}
