/* ==========================================================================
   DILLY STRIKE — AAA Cinematic Reveal Trailer Player
   Beat-synced Ken Burns cuts, muzzle-flash strobes, drifting embers,
   synthesized Web Audio esports bass/percussion score, and Play Now CTA.
   ========================================================================== */

const SHOTS = [
  {
    type: 'card',
    kicker: 'DILLY GAMING PRESENTS',
    title: 'A NEW TACTICAL FPS',
    sub: 'BUILT FOR INSTANT BROWSER PLAY',
    dur: 2800,
    sfx: 'bwaam'
  },
  {
    type: 'shot',
    img: 'assets/trailer/shot1.jpg',
    kicker: 'DUSTLINE CITADEL · A-SITE',
    title: 'HOLD THE LINE.',
    sub: 'Precision CS:GO gunplay. Zero downloads.',
    cam: { s0: 1.04, s1: 1.18, x0: -2.2, x1: 2.0, y0: 0.4, y1: -1.4 },
    dur: 4600,
    sfx: 'bwaam'
  },
  {
    type: 'shot',
    img: 'assets/trailer/shot2.jpg',
    kicker: 'TACTICAL AGENT ABILITIES',
    title: 'FLASH. SMOKE. BREACH.',
    sub: 'Deploy smokes, blind angles, and dash into the fight.',
    cam: { s0: 1.16, s1: 1.03, x0: 2.8, x1: -2.4, y0: -0.6, y1: 0.8 },
    dur: 4600,
    sfx: 'burst'
  },
  {
    type: 'shot',
    img: 'assets/trailer/shot3.jpg',
    kicker: 'OPERATOR SNIPER · 2× SCOPE',
    title: 'ONE SHOT. ONE KILL.',
    sub: '5 iconic weapons · Full Armory Buy Menu · 1-tap headshots.',
    cam: { s0: 1.05, s1: 1.22, x0: -1.8, x1: 1.6, y0: 0.8, y1: -1.6 },
    dur: 4600,
    sfx: 'sniper'
  },
  {
    type: 'shot',
    img: 'assets/trailer/shot4.jpg',
    kicker: 'ALPHA VS OMEGA · RUST MULTIPLAYER',
    title: 'CHOOSE YOUR SIDE.',
    sub: 'Authoritative Rust WebSocket server + Solo Tactical Bots.',
    cam: { s0: 1.18, s1: 1.02, x0: 0, x1: 0, y0: -1.2, y1: 0.6 },
    dur: 4800,
    sfx: 'bwaam'
  },
  {
    type: 'end',
    dur: 999999,
    sfx: 'bwaam'
  }
];

const style = document.createElement('style');
style.textContent = `
  #ds-tr {
    position: fixed; inset: 0; z-index: 120; display: none; align-items: center; justify-content: center;
    background: #04060a; font-family: 'Inter', system-ui, sans-serif; color: #fff; user-select: none;
  }
  #ds-tr.open { display: flex; }
  #ds-tr-stage {
    position: relative; width: min(1180px, 96vw); aspect-ratio: 16 / 9; overflow: hidden;
    background: #000; border: 1.5px solid rgba(245,184,46,.42); border-radius: 8px;
    box-shadow: 0 30px 100px rgba(0,0,0,.95), 0 0 60px rgba(245,184,46,.16);
  }
  .tr-bar { position: absolute; left: 0; right: 0; height: 8%; background: #030407; z-index: 6; pointer-events: none; }
  .tr-bar.top { top: 0; }
  .tr-bar.bot { bottom: 0; }

  #tr-img {
    position: absolute; inset: -6%; width: 112%; height: 112%; object-fit: cover;
    will-change: transform, opacity; opacity: 0; transition: opacity .22s ease;
    filter: contrast(1.08) saturate(1.1);
  }
  #tr-fx { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 4; }
  #tr-vig {
    position: absolute; inset: 0; z-index: 3; pointer-events: none;
    background:
      linear-gradient(180deg, rgba(4,6,10,.7) 0%, rgba(4,6,10,0) 26%, rgba(4,6,10,0) 58%, rgba(4,6,10,.92) 100%),
      radial-gradient(ellipse at 50% 50%, transparent 45%, rgba(4,6,10,.62) 100%);
  }
  #tr-strobe {
    position: absolute; inset: 0; z-index: 7; background: #fff; opacity: 0; pointer-events: none; transition: opacity .16s;
  }

  /* Slam-in Shot Caption */
  #tr-caption {
    position: absolute; left: 42px; bottom: 13%; z-index: 8; max-width: 760px;
    transition: opacity .25s, transform .25s;
  }
  #tr-kick { font: 800 12px/1 system-ui, sans-serif; letter-spacing: .28em; color: #f5b82e; text-transform: uppercase; margin-bottom: 6px; }
  #tr-title {
    margin: 0; font: 900 clamp(28px, 4.4vw, 54px)/1.02 system-ui, sans-serif; letter-spacing: .04em;
    text-transform: uppercase; text-shadow: 0 4px 24px rgba(0,0,0,.92);
  }
  #tr-sub { margin: 8px 0 0; font: 500 15px/1.4 system-ui, sans-serif; color: rgba(235,242,252,.84); }

  /* Center Intro / End Slate */
  #tr-slate {
    position: absolute; inset: 0; z-index: 9; display: none; flex-direction: column;
    align-items: center; justify-content: center; text-align: center; padding: 32px;
    background: radial-gradient(circle at 50% 45%, rgba(20,26,40,.92), rgba(4,6,10,.98));
  }
  #tr-slate.show { display: flex; }
  #tr-slate img { height: 64px; width: auto; margin-bottom: 12px; filter: drop-shadow(0 8px 24px rgba(245,184,46,.35)); }
  #tr-slate .sl-k { font: 800 12px/1 system-ui, sans-serif; letter-spacing: .32em; color: #f5b82e; text-transform: uppercase; margin-bottom: 10px; }
  #tr-slate h1 {
    margin: 0 0 8px; font: 900 clamp(34px, 5.6vw, 68px)/1.02 system-ui, sans-serif; letter-spacing: .1em;
    background: linear-gradient(90deg, #fff 0%, #ffd666 55%, #f43f5e 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  #tr-slate p { margin: 0 0 22px; font-size: 15px; color: #94a3b8; }
  .sl-btns { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }

  /* Top Controls + Progress Bar */
  #tr-top {
    position: absolute; top: 10%; right: 20px; z-index: 12; display: flex; gap: 8px;
  }
  .tr-btn {
    padding: 7px 13px; border-radius: 6px; border: 1px solid rgba(255,255,255,.22);
    background: rgba(8,11,18,.8); color: #fff; font: 700 11.5px/1 system-ui, sans-serif;
    letter-spacing: .08em; text-transform: uppercase; cursor: pointer;
  }
  .tr-btn:hover { border-color: #f5b82e; background: rgba(245,184,46,.2); }
  .tr-btn.gold { background: linear-gradient(180deg, #ffd15c, #e5a319); color: #090c12; border-color: #ffe28a; padding: 11px 22px; font-size: 13px; }
  #tr-prog { position: absolute; left: 0; right: 0; bottom: 8%; height: 3px; background: rgba(255,255,255,.15); z-index: 11; }
  #tr-prog-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #f5b82e, #f43f5e); }
`;
document.head.appendChild(style);

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

    <div id="tr-caption">
      <div id="tr-kick"></div>
      <h2 id="tr-title"></h2>
      <p id="tr-sub"></p>
    </div>

    <div id="tr-slate">
      <img src="../img/dilly-gaming-logo.png" alt="Dilly Gaming">
      <div class="sl-k" id="sl-k">DILLY GAMING PRESENTS</div>
      <h1 id="sl-h">DILLY STRIKE</h1>
      <p id="sl-p">FREE IN BROWSER · ZERO DOWNLOADS · RUST MULTIPLAYER</p>
      <div class="sl-btns" id="sl-btns" style="display:none;">
        <button class="tr-btn gold" id="tr-play-now">▶ PLAY NOW</button>
        <button class="tr-btn" id="tr-replay" style="padding:11px 18px;">↻ REPLAY TRAILER</button>
      </div>
    </div>

    <div id="tr-top">
      <button class="tr-btn" id="tr-mute">🔊 SOUND: ON</button>
      <button class="tr-btn" id="tr-skip">SKIP ✕</button>
    </div>
    <div id="tr-prog"><div id="tr-prog-fill"></div></div>
  </div>
`;
document.body.appendChild(root);

/* ---------- Synthesized Esports Trailer Score ---------- */
let actx = null, beatTimer = null, muted = false;
function ensureAudio() {
  if (muted) return null;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  } catch (_) { return null; }
}

function playBwaam() {
  const c = ensureAudio(); if (!c) return;
  const t = c.currentTime;
  [55, 82.4, 110].forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = i === 0 ? 'sawtooth' : 'triangle';
    o.frequency.setValueAtTime(f * 1.04, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.94, t + 1.4);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(i === 0 ? 0.14 : 0.06, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 340;
    o.connect(flt); flt.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + 1.65);
  });
}

function playKick() {
  const c = ensureAudio(); if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(125, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.14);
  g.gain.setValueAtTime(0.16, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + 0.18);
}

function playNoiseHit(dur, freq, vol) {
  const c = ensureAudio(); if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const b = c.createBuffer(1, len, c.sampleRate);
  const ch = b.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.3));
  const src = c.createBufferSource(); src.buffer = b;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
  const g = c.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(c.destination); src.start();
}

function startPulse() {
  stopPulse();
  let step = 0;
  beatTimer = setInterval(() => {
    if (!playing || muted) return;
    if (step % 2 === 0) playKick();
    else playNoiseHit(0.04, 4200, 0.04);
    step++;
  }, 235);
}
function stopPulse() { if (beatTimer) { clearInterval(beatTimer); beatTimer = null; } }

/* ---------- Embers Canvas ---------- */
const fxCv = root.querySelector('#tr-fx');
const fctx = fxCv.getContext('2d');
const embers = Array.from({ length: 70 }, (_, i) => ({
  x: Math.random(), y: Math.random(),
  vx: 0.04 + Math.random() * 0.08, vy: -0.05 - Math.random() * 0.12,
  r: 1.2 + Math.random() * 2.4,
  col: i % 3 === 0 ? 'rgba(56,189,248,0.75)' : 'rgba(255,204,77,0.8)'
}));

/* ---------- Playback Engine ---------- */
const imgEl = root.querySelector('#tr-img');
const strobeEl = root.querySelector('#tr-strobe');
const capEl = root.querySelector('#tr-caption');
const slateEl = root.querySelector('#tr-slate');
const progEl = root.querySelector('#tr-prog-fill');

let playing = false, shotIdx = 0, shotStart = 0, rafId = 0;
const totalDur = SHOTS.filter(s => s.type !== 'end').reduce((a, b) => a + b.dur, 0);

function flashCut(strength = 0.7) {
  strobeEl.style.opacity = String(strength);
  setTimeout(() => { strobeEl.style.opacity = '0'; }, 110);
}

function loadShot(idx) {
  shotIdx = idx;
  shotStart = performance.now();
  const s = SHOTS[idx];
  if (!s) return;

  flashCut(s.type === 'shot' ? 0.55 : 0.3);
  if (s.sfx === 'bwaam') playBwaam();
  else if (s.sfx === 'burst') {
    [0, 120, 240, 360].forEach(ms => setTimeout(() => playing && playNoiseHit(0.09, 950, 0.18), ms));
  } else if (s.sfx === 'sniper') {
    setTimeout(() => { if (playing) { playNoiseHit(0.28, 420, 0.28); playBwaam(); flashCut(0.8); } }, 500);
  }

  if (s.type === 'card') {
    imgEl.style.opacity = '0';
    capEl.style.opacity = '0';
    slateEl.classList.add('show');
    root.querySelector('#sl-k').textContent = s.kicker;
    root.querySelector('#sl-h').textContent = s.title;
    root.querySelector('#sl-p').textContent = s.sub;
    root.querySelector('#sl-btns').style.display = 'none';
  } else if (s.type === 'end') {
    stopPulse();
    imgEl.style.opacity = '0.28';
    capEl.style.opacity = '0';
    slateEl.classList.add('show');
    root.querySelector('#sl-k').textContent = 'DILLY GAMING · OUT NOW';
    root.querySelector('#sl-h').textContent = 'DILLY STRIKE';
    root.querySelector('#sl-p').textContent = 'FREE IN BROWSER · ZERO DOWNLOADS · RUST MULTIPLAYER';
    root.querySelector('#sl-btns').style.display = 'flex';
    progEl.style.width = '100%';
  } else {
    slateEl.classList.remove('show');
    imgEl.src = s.img;
    imgEl.style.opacity = '1';
    capEl.style.opacity = '1';
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
  }

  if (s.type !== 'end') {
    let elapsedTotal = el;
    for (let i = 0; i < shotIdx; i++) elapsedTotal += SHOTS[i].dur;
    progEl.style.width = `${Math.min(100, (elapsedTotal / totalDur) * 100)}%`;
    if (el >= s.dur) loadShot(shotIdx + 1);
  }

  // Drifting embers
  const w = fxCv.clientWidth || 960, h = fxCv.clientHeight || 540;
  if (fxCv.width !== w || fxCv.height !== h) { fxCv.width = w; fxCv.height = h; }
  fctx.clearRect(0, 0, w, h);
  for (const e of embers) {
    e.x = (e.x + e.vx / 60) % 1;
    e.y = (e.y + e.vy / 60 + 1) % 1;
    fctx.fillStyle = e.col;
    fctx.beginPath(); fctx.arc(e.x * w, e.y * h, e.r, 0, Math.PI * 2); fctx.fill();
  }

  rafId = requestAnimationFrame(tick);
}

export function openTrailer() {
  playing = true;
  root.classList.add('open');
  startPulse();
  loadShot(0);
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(tick);
}

export function closeTrailer() {
  playing = false;
  stopPulse();
  cancelAnimationFrame(rafId);
  root.classList.remove('open');
  if (location.hash === '#trailer') history.replaceState(null, '', location.pathname);
}

root.querySelector('#tr-skip').onclick = closeTrailer;
root.querySelector('#tr-replay').onclick = openTrailer;
root.querySelector('#tr-play-now').onclick = () => {
  closeTrailer();
  if (window.DillyStrike) window.DillyStrike.enterMatch(false);
};
root.querySelector('#tr-mute').onclick = () => {
  muted = !muted;
  root.querySelector('#tr-mute').textContent = muted ? '🔇 SOUND: OFF' : '🔊 SOUND: ON';
};

window.addEventListener('keydown', (e) => {
  if (playing && e.code === 'Escape') closeTrailer();
});

window.DillyStrikeTrailer = { open: openTrailer, close: closeTrailer, jumpTo: loadShot };

// Wire lobby button & auto-open if #trailer hash is present
window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-watch-trailer');
  if (btn) btn.addEventListener('click', openTrailer);
  if (location.hash === '#trailer') setTimeout(openTrailer, 250);
});
