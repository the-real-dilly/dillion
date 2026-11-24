// DILLION: LAST ZONE - all sound is synthesised with WebAudio (no samples).
export const AU = { ctx: null, muted: false, vol: { master: 0.8, sfx: 0.9, music: 0.5 }, voices: 0, loops: {}, music: null, radio: null };
const VCAP = 48;

export function initAudio() {
  if (AU.ctx) { if (AU.ctx.state === "suspended") AU.ctx.resume(); return; }
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
  const ctx = AU.ctx = new C();
  AU.master = ctx.createGain(); AU.master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(AU.master);
  AU.sfx = ctx.createGain(); AU.sfx.connect(comp);
  AU.mus = ctx.createGain(); AU.mus.connect(comp);
  // reverb
  const len = Math.floor(ctx.sampleRate * 2.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < 400 ? i / 400 : 1); }
  AU.rev = ctx.createConvolver(); AU.rev.buffer = ir; AU.revIn = ctx.createGain(); AU.revIn.gain.value = 0.6; AU.revIn.connect(AU.rev); AU.rev.connect(AU.sfx);
  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; AU.noise = nb;
  // brown noise for wind / rumble
  const bb = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), bd = bb.getChannelData(0); let last = 0; for (let i = 0; i < bd.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; } AU.brown = bb;
  applyVolumes();
  startLoops();
}
export function applyVolumes() {
  if (!AU.ctx) return; const t = AU.ctx.currentTime;
  AU.master.gain.setTargetAtTime(AU.muted ? 0 : AU.vol.master, t, 0.05);
  AU.sfx.gain.setTargetAtTime(AU.vol.sfx, t, 0.05); AU.mus.gain.setTargetAtTime(AU.vol.music * 0.6, t, 0.05);
}
export function setMute(m) { AU.muted = m; applyVolumes(); }

function vOk() { return AU.ctx && AU.voices < VCAP; }
function track(src, end) { AU.voices++; src.onended = () => { AU.voices--; }; src.stop(end); }
function noiseSrc(t, dur) { const s = AU.ctx.createBufferSource(); s.buffer = AU.noise; s.start(t, Math.random() * 1.5); track(s, t + dur + 0.05); return s; }
function env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
function nhit(t, dur, v, type, f, dest, q = 0.7, attack = 0.002) {
  if (!vOk()) return; const c = AU.ctx, s = noiseSrc(t, dur), fl = c.createBiquadFilter(), g = c.createGain();
  fl.type = type; fl.frequency.value = f; fl.Q.value = q; env(g, t, attack, v, dur); s.connect(fl); fl.connect(g); g.connect(dest);
}
function tone(t, f, dur, type, v, dest, f2, attack = 0.003) {
  if (!vOk()) return; const c = AU.ctx, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  env(g, t, attack, v, dur); o.connect(g); g.connect(dest); o.start(t); track(o, t + dur + 0.05);
}
// spatial chain: distance lowpass + gain + pan + reverb send, delayed by the speed of sound
function chain(dist, pan, dryV = 1) {
  const c = AU.ctx, inp = c.createGain(), lp = c.createBiquadFilter(), g = c.createGain(), p = c.createStereoPanner ? c.createStereoPanner() : null, send = c.createGain();
  lp.type = "lowpass"; lp.frequency.value = Math.max(600, 16000 * Math.exp(-dist / 160));
  g.gain.value = dryV / (1 + dist / 22);
  send.gain.value = Math.min(0.9, 0.12 + dist / 260) / (1 + dist / 120);
  inp.connect(lp); lp.connect(g);
  if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(AU.sfx); } else g.connect(AU.sfx);
  lp.connect(send); send.connect(AU.revIn);
  setTimeout(() => { try { inp.disconnect(); } catch (e) { /* */ } }, 4000);
  return inp;
}
const GUN = {
  pistol: { crack: 2400, cd: 0.09, cv: 0.6, th: 170, td: 0.09, tv: 0.55 },
  revolver: { crack: 1800, cd: 0.14, cv: 0.8, th: 105, td: 0.2, tv: 0.9 },
  smg: { crack: 2600, cd: 0.06, cv: 0.5, th: 190, td: 0.07, tv: 0.45 },
  rifle: { crack: 2100, cd: 0.1, cv: 0.65, th: 120, td: 0.12, tv: 0.7 },
  rifle2: { crack: 1900, cd: 0.11, cv: 0.7, th: 105, td: 0.13, tv: 0.75 },
  shotgun: { crack: 900, cd: 0.25, cv: 0.85, th: 75, td: 0.28, tv: 1.0 },
  sniper: { crack: 3200, cd: 0.16, cv: 0.95, th: 62, td: 0.4, tv: 1.0 }
};
export function sfxGun(snd, dist, pan, own) {
  if (!AU.ctx || dist > 900) return; const c = AU.ctx, P = GUN[snd] || GUN.rifle;
  const t = c.currentTime + Math.min(1.5, own ? 0 : dist / 343);
  const out = chain(dist, pan, own ? 0.9 : 1.2);
  nhit(t, P.cd, P.cv, "highpass", P.crack, out, 0.6);
  nhit(t, P.cd * 1.6, P.cv * 0.6, "bandpass", P.crack * 0.45, out, 1.1);
  tone(t, P.th * 1.6, P.td, "sine", P.tv, out, P.th * 0.5);
  if (dist < 60) nhit(t + 0.004, 0.02, 0.35, "highpass", 6000, out);
  if (dist > 120) nhit(t + 0.05, 0.4, 0.15 * Math.min(1, dist / 400), "lowpass", 500, out, 0.5, 0.03); // distant rumble
}
export function sfxCrack(dist) { if (!AU.ctx) return; const t = AU.ctx.currentTime; nhit(t, 0.03, 0.25, "highpass", 5000, AU.sfx); } // bullet passing close
export function sfxExplosion(dist, pan) {
  if (!AU.ctx) return; const c = AU.ctx, t = c.currentTime + Math.min(1.5, dist / 343), out = chain(dist, pan, 1.6);
  nhit(t, 0.9, 1.0, "lowpass", 700, out, 0.5); tone(t, 90, 0.7, "sine", 1.0, out, 30); nhit(t, 0.15, 0.6, "highpass", 2000, out);
}
export function sfxImpact(s, dist) {
  if (!AU.ctx || dist > 60) return; const c = AU.ctx, t = c.currentTime, out = chain(dist, 0, 0.6);
  if (s === 9) tone(t, 2400 + Math.random() * 800, 0.08, "triangle", 0.15, out, 1800); // ricochet ping
  else if (s === 0) nhit(t, 0.15, 0.3, "bandpass", 900, out, 1.2);
  else nhit(t, 0.05, 0.25, "bandpass", s === 8 ? 700 : 1500, out, 1.5);
}
export function sfxHit(head, kill, armor) {
  if (!AU.ctx) return; const t = AU.ctx.currentTime;
  if (head) { tone(t, 1900, 0.09, "square", 0.08, AU.sfx); tone(t + 0.02, 2800, 0.12, "triangle", 0.1, AU.sfx); }
  else if (armor) tone(t, 1100, 0.05, "square", 0.06, AU.sfx, 900);
  else tone(t, 1400, 0.04, "square", 0.07, AU.sfx);
  if (kill) { tone(t + 0.05, 600, 0.25, "sawtooth", 0.07, AU.sfx, 300); nhit(t + 0.05, 0.25, 0.15, "bandpass", 1200, AU.sfx); }
}
export function sfxHurt(armor) { if (!AU.ctx) return; const t = AU.ctx.currentTime; if (armor) { nhit(t, 0.08, 0.4, "bandpass", 2400, AU.sfx, 3); tone(t, 700, 0.07, "triangle", 0.1, AU.sfx); } else { nhit(t, 0.12, 0.5, "lowpass", 600, AU.sfx); tone(t, 120, 0.15, "sine", 0.4, AU.sfx, 60); } }
export function sfxPlateBreak() { if (!AU.ctx) return; const t = AU.ctx.currentTime; nhit(t, 0.25, 0.5, "highpass", 3000, AU.sfx); tone(t, 1500, 0.2, "triangle", 0.12, AU.sfx, 400); }
export function sfxStep(surf, v = 0.25, dist = 0) {
  if (!AU.ctx || dist > 40) return; const c = AU.ctx, t = c.currentTime, out = dist > 0.5 ? chain(dist, 0, 0.6) : AU.sfx;
  const S = { 0: ["bandpass", 600, 0.18], 1: ["lowpass", 900, 0.09], 2: ["lowpass", 1400, 0.06], 3: ["bandpass", 2000, 0.05], 4: ["lowpass", 900, 0.08], 5: ["bandpass", 2600, 0.045], 6: ["bandpass", 3000, 0.04], 7: ["lowpass", 1100, 0.07], 8: ["bandpass", 500, 0.07], 9: ["bandpass", 1800, 0.08] }[surf] || ["lowpass", 1400, 0.06];
  nhit(t, S[2], v, S[0], S[1] * (0.85 + Math.random() * 0.3), out, 1.2);
  if (surf === 8) tone(t, 140, 0.06, "sine", v * 0.6, out, 90);
  if (surf === 9) tone(t, 420, 0.05, "triangle", v * 0.2, out, 300);
}
export function sfxReload(stage) { if (!AU.ctx) return; const t = AU.ctx.currentTime; if (stage === 0) { nhit(t, 0.05, 0.25, "bandpass", 1800, AU.sfx, 3); tone(t, 600, 0.04, "square", 0.04, AU.sfx); } else if (stage === 1) { nhit(t, 0.06, 0.3, "bandpass", 1200, AU.sfx, 3); tone(t + 0.03, 300, 0.05, "square", 0.05, AU.sfx); } else { nhit(t, 0.04, 0.35, "highpass", 2500, AU.sfx); tone(t, 900, 0.03, "square", 0.05, AU.sfx); nhit(t + 0.08, 0.05, 0.3, "bandpass", 2000, AU.sfx, 2); } }
export function sfxDry() { if (!AU.ctx) return; tone(AU.ctx.currentTime, 2200, 0.03, "square", 0.05, AU.sfx); }
export function sfxPickup(kind) { if (!AU.ctx) return; const t = AU.ctx.currentTime; if (kind === "weapon") { nhit(t, 0.08, 0.3, "bandpass", 1400, AU.sfx, 2); nhit(t + 0.1, 0.05, 0.3, "highpass", 2500, AU.sfx); } else if (kind === "pickle") { [0, 4, 7, 12].forEach((n, i) => tone(t + i * 0.07, 523 * Math.pow(2, n / 12), 0.3, "triangle", 0.08, AU.sfx)); } else { nhit(t, 0.06, 0.2, "bandpass", 900 + Math.random() * 400, AU.sfx, 2); } }
export function sfxPlate() { if (!AU.ctx) return; const t = AU.ctx.currentTime; nhit(t, 0.1, 0.3, "bandpass", 700, AU.sfx, 2); tone(t + 0.05, 220, 0.12, "triangle", 0.12, AU.sfx); nhit(t + 0.12, 0.06, 0.3, "highpass", 2000, AU.sfx); }
export function sfxHeal() { if (!AU.ctx) return; const t = AU.ctx.currentTime; nhit(t, 0.3, 0.2, "bandpass", 3000, AU.sfx, 1); tone(t + 0.1, 660, 0.2, "sine", 0.06, AU.sfx); }
export function sfxSwap() { if (!AU.ctx) return; const t = AU.ctx.currentTime; nhit(t, 0.07, 0.25, "bandpass", 1100, AU.sfx, 2); nhit(t + 0.12, 0.04, 0.25, "highpass", 2200, AU.sfx); }
export function sfxMelee(hit) { if (!AU.ctx) return; const t = AU.ctx.currentTime; nhit(t, 0.12, 0.3, "bandpass", 1600, AU.sfx, 0.8, 0.03); if (hit) { nhit(t + 0.08, 0.1, 0.6, "lowpass", 500, AU.sfx); tone(t + 0.08, 110, 0.12, "sine", 0.5, AU.sfx, 60); } }
export function sfxThrow() { if (!AU.ctx) return; const t = AU.ctx.currentTime; nhit(t, 0.03, 0.3, "highpass", 3000, AU.sfx); nhit(t + 0.1, 0.25, 0.2, "bandpass", 900, AU.sfx, 0.8, 0.08); }
export function sfxSmokePop(dist) { if (!AU.ctx) return; const t = AU.ctx.currentTime, out = chain(dist, 0, 1); nhit(t, 1.6, 0.4, "highpass", 1800, out, 0.5, 0.05); }
export function sfxChute(open) { if (!AU.ctx) return; const t = AU.ctx.currentTime; if (open) { nhit(t, 0.5, 0.8, "lowpass", 800, AU.sfx, 0.6, 0.02); nhit(t + 0.15, 0.3, 0.6, "bandpass", 300, AU.sfx); } else nhit(t, 0.2, 0.4, "bandpass", 1200, AU.sfx); }
export function sfxLand(hard) { if (!AU.ctx) return; const t = AU.ctx.currentTime; nhit(t, 0.15, hard ? 0.8 : 0.4, "lowpass", 500, AU.sfx); tone(t, 90, 0.15, "sine", hard ? 0.6 : 0.3, AU.sfx, 50); }
export function sfxUI(kind) { if (!AU.ctx) return; const t = AU.ctx.currentTime; if (kind === "alert") { tone(t, 880, 0.12, "square", 0.05, AU.sfx); tone(t + 0.15, 660, 0.18, "square", 0.05, AU.sfx); } else if (kind === "kill") { tone(t, 330, 0.15, "triangle", 0.08, AU.sfx); tone(t + 0.08, 494, 0.25, "triangle", 0.08, AU.sfx); } else if (kind === "ping") { tone(t, 1320, 0.1, "sine", 0.08, AU.sfx); tone(t + 0.08, 1760, 0.15, "sine", 0.06, AU.sfx); } else tone(t, 1200, 0.04, "square", 0.03, AU.sfx); }
export function sfxRadioBlip() { if (!AU.ctx) return; const t = AU.ctx.currentTime; nhit(t, 0.12, 0.08, "bandpass", 2500, AU.sfx, 4); tone(t, 1700, 0.05, "square", 0.025, AU.sfx); }

// ---------------------------------------------------------------------------------------------
// continuous loops: plane drone, freefall wind, chute flap, gas hiss, ambient wind, birds
function loopNoise(buf, type, f, q) { const c = AU.ctx, s = c.createBufferSource(); s.buffer = buf; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7; const g = c.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(AU.sfx); s.start(); return { s, f: fl, g }; }
function startLoops() {
  const c = AU.ctx, L = AU.loops;
  L.wind = loopNoise(AU.noise, "bandpass", 700, 0.5);
  L.amb = loopNoise(AU.brown, "lowpass", 500, 0.5);
  L.gas = loopNoise(AU.noise, "highpass", 4000, 0.5);
  L.flap = loopNoise(AU.brown, "bandpass", 220, 1.5);
  const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 9; lg.gain.value = 0.5; lfo.connect(lg); lg.connect(L.flap.g.gain); lfo.start(); L.flapLfo = lfo;
  // plane drone: detuned saws + prop buzz
  const g = c.createGain(); g.gain.value = 0; const fl = c.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = 500; fl.connect(g); g.connect(AU.sfx);
  const os = []; for (const [f, ty] of [[62, "sawtooth"], [63.5, "sawtooth"], [124, "square"], [31, "sine"]]) { const o = c.createOscillator(); o.type = ty; o.frequency.value = f; const og = c.createGain(); og.gain.value = ty === "square" ? 0.08 : 0.25; o.connect(og); og.connect(fl); o.start(); os.push(o); }
  L.plane = { g, f: fl, os };
  AU.birdT = 3;
}
export function updateLoops(dt, st) {
  if (!AU.ctx) return; const t = AU.ctx.currentTime, L = AU.loops; if (!L.wind) return;
  const set = (node, v, k = 0.15) => node.gain.setTargetAtTime(v, t, k);
  set(L.wind.g, st.fall ? 0.35 + st.speed * 0.006 : st.chute ? 0.12 : st.alt > 60 ? 0.08 : 0.0);
  L.wind.f.frequency.setTargetAtTime(st.fall ? 500 + st.speed * 12 : 600, t, 0.2);
  set(L.flap.g, st.chute ? 0.22 : 0);
  set(L.gas.g, st.gas * 0.22, 0.3);
  set(L.amb.g, st.menu ? 0.05 : 0.09);
  set(L.plane.g, st.plane * 0.55, 0.3); L.plane.f.frequency.setTargetAtTime(300 + st.plane * 500, t, 0.3);
  // birds when calm and on the ground
  AU.birdT -= dt;
  if (AU.birdT <= 0 && st.calm) { AU.birdT = 4 + Math.random() * 8; const b = t, f = 2200 + Math.random() * 1600; for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) tone(b + i * 0.11, f * (1 + (i % 2) * 0.12), 0.07, "sine", 0.025, AU.sfx, f * 0.8); }
}

// ---------------------------------------------------------------------------------------------
// music: a tense procedural bed that ramps with the gas stage; Brine FM lobby radio
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export function musicStart() {
  if (!AU.ctx || AU.music) return; const c = AU.ctx;
  const g = c.createGain(); g.gain.value = 0; g.connect(AU.mus);
  const fl = c.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = 600; fl.connect(g);
  const drones = [];
  for (const [m, det] of [[38, -5], [38, 5], [45, 0], [50, -3]]) { const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = mtof(m); o.detune.value = det; const og = c.createGain(); og.gain.value = 0.09; o.connect(og); og.connect(fl); o.start(); drones.push(o); }
  AU.music = { g, fl, drones, next: c.currentTime + 0.2, step: 0, intensity: 0 };
  g.gain.setTargetAtTime(0.5, c.currentTime, 2);
}
export function musicStop() { if (!AU.music) return; const m = AU.music; AU.music = null; m.g.gain.setTargetAtTime(0, AU.ctx.currentTime, 0.8); setTimeout(() => { for (const o of m.drones) try { o.stop(); } catch (e) { /* */ } }, 4000); }
export function musicUpdate(intensity) {
  const m = AU.music; if (!m || !AU.ctx) return; const c = AU.ctx;
  m.intensity += (intensity - m.intensity) * 0.02;
  m.fl.frequency.setTargetAtTime(400 + m.intensity * 1600, c.currentTime, 0.5);
  const bpm = 84 + m.intensity * 44, spb = 60 / bpm / 2;
  while (m.next < c.currentTime + 0.25) {
    const t = m.next, s = m.step++ % 16;
    if (s % 4 === 0) tone(t, 55, 0.35, "sine", 0.35 + m.intensity * 0.3, AU.mus, 38);
    if (m.intensity > 0.35 && s % 2 === 1) nhit(t, 0.04, 0.05 + m.intensity * 0.06, "highpass", 7000, AU.mus);
    if (s === 0 || s === 6 || s === 10) tone(t, mtof(62 + (m.intensity > 0.6 ? 1 : 0)), spb * 1.8, "triangle", 0.03 + m.intensity * 0.03, AU.mus);
    if (m.intensity > 0.6 && s % 4 === 2) tone(t, mtof(74), spb, "square", 0.015, AU.mus);
    m.next += spb;
  }
}
export function radioStart() {
  if (!AU.ctx || AU.radio) return; const c = AU.ctx;
  const g = c.createGain(); g.gain.value = 0; const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1400; bp.Q.value = 0.5; bp.connect(g); g.connect(AU.mus);
  g.gain.setTargetAtTime(0.9, c.currentTime, 0.5);
  AU.radio = { g, bp, next: c.currentTime + 0.1, step: 0 };
}
export function radioStop() { if (!AU.radio) return; const r = AU.radio; AU.radio = null; r.g.gain.setTargetAtTime(0, AU.ctx.currentTime, 0.3); }
export function radioUpdate() {
  const r = AU.radio; if (!r || !AU.ctx) return; const c = AU.ctx, spb = 60 / 96 / 2;
  const prog = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]];
  while (r.next < c.currentTime + 0.25) {
    const t = r.next, s = r.step++, bar = Math.floor(s / 8) % 4, k = s % 8;
    if (k === 0 || k === 4) tone(t, 60, 0.25, "sine", 0.5, r.bp, 40);
    if (k === 2 || k === 6) nhit(t, 0.12, 0.25, "bandpass", 1800, r.bp);
    if (k % 2 === 1) nhit(t, 0.03, 0.08, "highpass", 6000, r.bp);
    if (k === 0) for (const n of prog[bar]) tone(t, mtof(n), spb * 7, "triangle", 0.06, r.bp, null, 0.02);
    if (k === 3 || k === 7) tone(t, mtof(prog[bar][(s >> 1) % 3] + 12), spb * 0.9, "square", 0.025, r.bp);
    if (k === 0) tone(t, mtof(prog[bar][0] - 24), spb * 3, "sawtooth", 0.09, r.bp);
    r.next += spb;
  }
}
