/* =====================================================================
   dgm/gunaudio.js : WebAudio-synthesised weapon sounds (no samples).
   - gunshots per sound class (layered crack + body + low thump + mechanism
     + tail), distance model: speed-of-sound delay, gain roll-off, low-pass
     with distance, more reverb far away; stereo/3D panning
   - environment reverb send (generated impulse response; "open", "street",
     "indoor", "tunnel" presets)
   - reload (mag out / mag in / bolt or pump cycle / shell in), dry fire,
     equip, shell-casing tinkles, bullet whizz-by + supersonic crack,
     impacts per material, explosions
   - polyphony limit with voice stealing + per-category limits
   Usage: const ga = createGunAudio(); ga.unlock() from a user gesture;
          ga.shot(def, { pos, listener }) etc. Positions are {x,y,z}.
   ===================================================================== */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);

/* per class: crack (hp noise), body (bp noise freq/q/decay), thump (Hz start, end, decay), tail (lp, decay), mech click, gain */
export const SOUND_CLASSES = {
  pistol:      { crack: 0.9, body: [1400, 0.9, 0.08], thump: [150, 55, 0.07], tail: [2200, 0.45], mech: 0.25, gain: 0.8 },
  heavyPistol: { crack: 1.0, body: [1000, 0.8, 0.11], thump: [120, 45, 0.1], tail: [1800, 0.6], mech: 0.3, gain: 0.95 },
  revolver:    { crack: 1.1, body: [850, 0.7, 0.15], thump: [110, 40, 0.13], tail: [1600, 0.9], mech: 0.15, gain: 1.05 },
  smg:         { crack: 0.8, body: [1700, 1.0, 0.06], thump: [170, 60, 0.05], tail: [2400, 0.35], mech: 0.35, gain: 0.7 },
  rifle:       { crack: 1.2, body: [1200, 0.8, 0.09], thump: [130, 45, 0.08], tail: [2000, 0.8], mech: 0.3, gain: 0.95 },
  rifleHeavy:  { crack: 1.2, body: [950, 0.7, 0.11], thump: [115, 40, 0.1], tail: [1700, 0.9], mech: 0.35, gain: 1.0 },
  sniper:      { crack: 1.4, body: [800, 0.6, 0.16], thump: [95, 35, 0.16], tail: [1400, 1.6], mech: 0.1, gain: 1.15 },
  shotgun:     { crack: 0.9, body: [650, 0.6, 0.2], thump: [90, 35, 0.18], tail: [1300, 1.1], mech: 0.1, gain: 1.15 },
  suppressed:  { crack: 0.12, body: [2400, 1.4, 0.05], thump: [220, 90, 0.04], tail: [3000, 0.15], mech: 0.6, gain: 0.45 },
  launcher:    { crack: 0.2, body: [380, 0.8, 0.12], thump: [80, 40, 0.15], tail: [900, 0.4], mech: 0.4, gain: 0.8 }
};
const ENV = { open: [1.6, 3.2, 0.18], street: [2.2, 2.6, 0.3], indoor: [0.9, 2.0, 0.45], tunnel: [3.2, 1.6, 0.6] }; // seconds, decay power, wet send

/**
 * createGunAudio(opts) -> audio engine
 * opts: { ctx (existing AudioContext), destination (AudioNode, default ctx.destination), maxVoices (32),
 *         env: "open"|"street"|"indoor"|"tunnel", volume (0..1), hrtf (false: equal-power panning) }
 */
export function createGunAudio(opts = {}) {
  let ctx = opts.ctx || null;
  const A = { ctx: null, voices: [], cat: {}, maxVoices: opts.maxVoices || 32, env: opts.env || "street", listener: { x: 0, y: 0, z: 0, fx: 0, fz: -1 }, enabled: true, played: 0, stolen: 0 };
  const CAT_MAX = { tinkle: 6, impact: 10, whizz: 4, shot: 16, mech: 6, boom: 3 };
  let master, comp, wet, conv, noiseBuf, pinkBuf;

  function init() {
    if (A.ctx) return A.ctx;
    try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { A.enabled = false; return null; }
    A.ctx = ctx;
    master = ctx.createGain(); master.gain.value = opts.volume == null ? 0.8 : opts.volume;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.2;
    master.connect(comp); comp.connect(opts.destination || ctx.destination);
    conv = ctx.createConvolver(); wet = ctx.createGain(); conv.connect(wet); wet.connect(master); setEnv(A.env);
    // noise buffers
    const n = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    pinkBuf = ctx.createBuffer(1, n, ctx.sampleRate); const p = pinkBuf.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; p[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
    return ctx;
  }
  function setEnv(name) {
    A.env = ENV[name] ? name : "street"; if (!A.ctx) return;
    const [len, pow, send] = ENV[A.env], sr = ctx.sampleRate, L = Math.floor(sr * len), ir = ctx.createBuffer(2, L, sr);
    for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); let lp = 0; for (let i = 0; i < L; i++) { const t = i / L; lp += (Math.random() * 2 - 1 - lp) * (0.6 - t * 0.5); ch[i] = lp * Math.pow(1 - t, pow) * (i < sr * 0.01 ? i / (sr * 0.01) : 1); } // early reflections
      for (let k = 0; k < 6; k++) { const at = Math.floor(sr * rand(0.008, 0.06)); if (at < L) ch[at] += rand(-0.6, 0.6); } }
    conv.buffer = ir; wet.gain.value = send;
  }
  A.setEnvironment = setEnv;
  /** Call from a user gesture (click/key) to start audio. Safe to call repeatedly. */
  A.unlock = function () { const c = init(); if (c && c.state === "suspended") c.resume(); return c; };
  A.setVolume = (v) => { init(); if (master) master.gain.value = v; };
  /** listener: { x, y, z, fx, fz } (position + forward on the ground plane), or a THREE.Camera */
  A.setListener = function (l) {
    if (l && l.isObject3D) { const e = l.matrixWorld.elements; A.listener = { x: e[12], y: e[13], z: e[14], fx: -e[8], fz: -e[10] }; }
    else if (l) Object.assign(A.listener, l);
  };

  /* ---------- voice management ---------- */
  function voice(cat, dur) {
    const now = ctx.currentTime;
    A.voices = A.voices.filter((v) => v.end > now);
    const inCat = A.voices.filter((v) => v.cat === cat);
    if (inCat.length >= (CAT_MAX[cat] || 8)) { steal(inCat[0]); }
    if (A.voices.length >= A.maxVoices) steal(A.voices[0]);
    const out = ctx.createGain(); const v = { cat, end: now + dur + 0.05, out, nodes: [] }; A.voices.push(v); A.played++;
    return v;
  }
  function steal(v) { try { v.out.gain.cancelScheduledValues(ctx.currentTime); v.out.gain.setTargetAtTime(0, ctx.currentTime, 0.01); for (const n of v.nodes) if (n.stop) n.stop(ctx.currentTime + 0.05); } catch (e) {} v.end = 0; A.stolen++; A.voices = A.voices.filter((x) => x !== v); }
  /* spatial: returns { node to connect sources into, delay } */
  function spatial(v, pos, o = {}) {
    const L = A.listener; let dist = 0, pan = 0;
    if (pos) { const dx = pos.x - L.x, dy = (pos.y || 0) - L.y, dz = pos.z - L.z; dist = Math.hypot(dx, dy, dz); const rx = -L.fz, rz = L.fx; pan = dist > 0.01 ? clamp((dx * rx + dz * rz) / dist, -1, 1) : 0; }
    if (o.distance != null) dist = o.distance;
    const near = o.near || 8, gain = 1 / (1 + Math.max(0, dist - 1) / near) ** 1.15;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = clamp(18000 / (1 + dist / 40), 700, 18000); lp.Q.value = 0.5;
    const g = v.out; g.gain.value = gain * (o.gain == null ? 1 : o.gain);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (p) p.pan.value = pan * 0.85;
    g.connect(lp); if (p) { lp.connect(p); p.connect(master); } else lp.connect(master);
    const send = ctx.createGain(); send.gain.value = clamp(0.25 + dist / 120, 0.25, 1.3) * (o.wet == null ? 1 : o.wet); lp.connect(send); send.connect(conv);
    v.nodes.push(lp, send);
    return { delay: (o.delay !== false && pos ? dist / 343 : 0), dist };
  }
  function noise(v, t, dur, { type = "bandpass", f = 1000, q = 1, f2 = null, gain = 1, attack = 0.0008, decay = dur, pink = false } = {}, dest) {
    const s = ctx.createBufferSource(); s.buffer = pink ? pinkBuf : noiseBuf; s.loop = true; s.playbackRate.value = rand(0.9, 1.1);
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur); fl.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    s.connect(fl); fl.connect(g); g.connect(dest || v.out); s.start(t, rand(0, 1.5)); s.stop(t + dur + 0.05); v.nodes.push(s); return g;
  }
  function tone(v, t, dur, { type = "sine", f = 200, f2 = null, gain = 1, attack = 0.001, decay = dur } = {}, dest) {
    const ny = ctx.sampleRate * 0.45; if (f > ny) return null; if (f2) f2 = Math.min(f2, ny);
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g); g.connect(dest || v.out); o.start(t); o.stop(t + dur + 0.05); v.nodes.push(o); return g;
  }
  const ok = () => A.enabled && init() && ctx.state !== "closed";

  /* ---------- gunshot ---------- */
  /**
   * shot(defOrClass, { pos, distance, gain, indoor, ads }) : one gunshot.
   * The shooter's own gun: pass pos = listener position (or omit pos).
   */
  A.shot = function (d, o = {}) {
    if (!ok()) return;
    const cls = SOUND_CLASSES[typeof d === "string" ? d : d.sound] || SOUND_CLASSES.pistol;
    const v = voice("shot", 2.2), sp = spatial(v, o.pos, { gain: cls.gain * (o.gain == null ? 1 : o.gain), wet: o.indoor ? 1.6 : 1 }), t = ctx.currentTime + sp.delay + 0.001;
    const far = clamp(sp.dist / 150, 0, 1), j = rand(0.92, 1.08);
    // 1 supersonic crack / blast transient
    noise(v, t, 0.012, { type: "highpass", f: 2500, q: 0.7, gain: 1.2 * cls.crack * (1 - far * 0.7), decay: 0.012 });
    // 2 body
    noise(v, t, cls.body[2] * 1.6, { type: "bandpass", f: cls.body[0] * j, f2: cls.body[0] * 0.45, q: cls.body[1], gain: 1.6, attack: 0.0015, decay: cls.body[2] * 1.5 });
    noise(v, t, cls.body[2] * 2.5, { type: "lowpass", f: 3500 * j, f2: 600, q: 0.3, gain: 0.7, decay: cls.body[2] * 2.4, pink: true });
    // 3 thump
    tone(v, t, cls.thump[2] * 1.6, { f: cls.thump[0] * j, f2: cls.thump[1], gain: 1.4 * (1 + far * 0.6), attack: 0.002, decay: cls.thump[2] * 1.5 });
    // 4 mechanism (only near)
    if (sp.dist < 20 && cls.mech) { noise(v, t + 0.012, 0.03, { type: "bandpass", f: 4200, q: 4, gain: 0.35 * cls.mech, decay: 0.03 }); tone(v, t + 0.014, 0.02, { type: "square", f: 2100 * j, gain: 0.05 * cls.mech, decay: 0.018 }); }
    // 5 tail (slap-back / rumble)
    noise(v, t + 0.02, cls.tail[1], { type: "lowpass", f: cls.tail[0] * (1 - far * 0.6), f2: 180, q: 0.2, gain: 0.35 * (0.6 + far), attack: 0.03, decay: cls.tail[1], pink: true });
  };

  /* ---------- mechanical / reload ---------- */
  function click(t, v, f, g, d = 0.018, q = 6) { noise(v, t, d, { type: "bandpass", f, q, gain: g, decay: d }); tone(v, t, d * 0.8, { type: "triangle", f: f * 0.5, gain: g * 0.12, decay: d * 0.8 }); }
  /** mech(kind, { pos }) kind: "magOut" | "magIn" | "cycle" | "bolt" | "pump" | "shellIn" | "dryFire" | "equip" | "holster" | "modeSwitch" | "pin" | "spoon" */
  A.mech = function (kind, o = {}) {
    if (!ok()) return;
    const v = voice("mech", 0.8); spatial(v, o.pos, { gain: o.gain == null ? 0.7 : o.gain, delay: false, wet: 0.4 }); const t = ctx.currentTime + 0.001;
    switch (kind) {
      case "magOut": click(t, v, 2600, 0.6); noise(v, t + 0.02, 0.12, { type: "bandpass", f: 1800, f2: 900, q: 2, gain: 0.25, decay: 0.12 }); break;
      case "magIn": noise(v, t, 0.06, { type: "bandpass", f: 1200, q: 2, gain: 0.3, decay: 0.05 }); click(t + 0.05, v, 1900, 0.9, 0.025, 4); tone(v, t + 0.05, 0.05, { f: 260, f2: 160, gain: 0.25, decay: 0.05 }); break;
      case "cycle": case "bolt": click(t, v, 2300, 0.7); noise(v, t + 0.03, 0.1, { type: "bandpass", f: 1500, f2: 2600, q: 3, gain: 0.25, decay: 0.09 }); click(t + 0.14, v, 2900, 0.8); break;
      case "pump": noise(v, t, 0.09, { type: "bandpass", f: 900, f2: 1600, q: 2, gain: 0.45, decay: 0.09 }); click(t + 0.09, v, 1700, 0.8, 0.03, 3); noise(v, t + 0.16, 0.08, { type: "bandpass", f: 1500, f2: 900, q: 2, gain: 0.4, decay: 0.08 }); click(t + 0.24, v, 2100, 0.9, 0.03, 3); break;
      case "shellIn": noise(v, t, 0.04, { type: "bandpass", f: 1400, q: 2, gain: 0.35, decay: 0.04 }); click(t + 0.04, v, 1300, 0.6, 0.03, 3); break;
      case "dryFire": click(t, v, 3300, 0.5, 0.012, 8); break;
      case "equip": noise(v, t, 0.18, { type: "bandpass", f: 700, f2: 1400, q: 1, gain: 0.25, decay: 0.18, pink: true }); click(t + 0.17, v, 2400, 0.5); break;
      case "holster": noise(v, t, 0.15, { type: "bandpass", f: 1200, f2: 600, q: 1, gain: 0.2, decay: 0.15, pink: true }); break;
      case "modeSwitch": click(t, v, 3600, 0.4, 0.01, 10); break;
      case "pin": click(t, v, 4200, 0.4, 0.015, 10); tone(v, t, 0.15, { f: 5200, gain: 0.04, decay: 0.15 }); break;
      case "spoon": tone(v, t, 0.25, { f: 3100, f2: 2900, gain: 0.08, decay: 0.25 }); click(t, v, 2500, 0.3); break;
      default: click(t, v, 2000, 0.5);
    }
  };

  /** casing(type "pistol"|"rifle"|"shell", { pos, speed }) : tinkle on bounce (call from fx.onCasingBounce) */
  A.casing = function (type = "pistol", o = {}) {
    if (!ok()) return;
    const v = voice("tinkle", 0.5); spatial(v, o.pos, { gain: clamp((o.speed || 2) / 4, 0.1, 0.6) * 0.5, delay: false, wet: 0.3 }); const t = ctx.currentTime + 0.001;
    if (type === "shell") { tone(v, t, 0.08, { f: rand(380, 460), gain: 0.4, decay: 0.07 }); noise(v, t, 0.03, { type: "bandpass", f: 900, q: 2, gain: 0.3, decay: 0.03 }); return; }
    const base = type === "rifle" ? rand(3600, 4400) : rand(4600, 5600);
    for (const [r, g, dcy] of [[1, 0.35, 0.22], [2.76, 0.18, 0.12], [5.4, 0.1, 0.06], [1.5, 0.12, 0.15]]) tone(v, t, dcy, { f: base * r * rand(0.98, 1.02), gain: g, decay: dcy });
  };

  /** whizz({ pos (closest point of the bullet path to the listener), supersonic, dir }) : bullet passing close by */
  A.whizz = function (o = {}) {
    if (!ok()) return;
    const v = voice("whizz", 0.4); spatial(v, o.pos, { gain: 0.8, delay: false, wet: 0.2 }); const t = ctx.currentTime + 0.001;
    if (o.supersonic) noise(v, t, 0.01, { type: "highpass", f: 3000, gain: 1.0, decay: 0.01 });
    noise(v, t, 0.22, { type: "bandpass", f: rand(2600, 3400), f2: rand(900, 1200), q: 6, gain: 0.5, attack: 0.04, decay: 0.22 });
    tone(v, t, 0.2, { type: "sawtooth", f: rand(900, 1200), f2: 400, gain: 0.03, attack: 0.04, decay: 0.2 });
  };

  /** impact(material, { pos, gain }) : bullet impact by surface material (ballistics MATERIALS keys) */
  A.impact = function (mat, o = {}) {
    if (!ok()) return;
    const v = voice("impact", 1.0); spatial(v, o.pos, { gain: o.gain == null ? 0.6 : o.gain, wet: 0.7 }); const t = ctx.currentTime + 0.001;
    switch (mat) {
      case "metal": case "carbody": { const f = mat === "metal" ? rand(1700, 2400) : rand(900, 1300); noise(v, t, 0.02, { type: "highpass", f: 3000, gain: 0.8, decay: 0.02 }); for (const [r, g, d] of [[1, 0.5, 0.5], [2.32, 0.3, 0.3], [3.9, 0.2, 0.18], [5.6, 0.1, 0.1]]) tone(v, t, d, { f: f * r, gain: g * (mat === "carbody" ? 0.6 : 1), decay: d * (mat === "carbody" ? 0.5 : 1) }); if (Math.random() < 0.3) tone(v, t + 0.01, 0.25, { type: "sine", f: rand(2500, 4000), f2: rand(600, 900), gain: 0.06, decay: 0.25 }); break; }
      case "glass": noise(v, t, 0.08, { type: "highpass", f: 4000, gain: 0.8, decay: 0.08 }); for (let i = 0; i < 7; i++) tone(v, t + rand(0, 0.25), 0.08, { f: rand(3500, 8000), gain: rand(0.05, 0.15), decay: 0.06 }); break;
      case "wood": noise(v, t, 0.06, { type: "bandpass", f: rand(500, 700), q: 3, gain: 1.0, decay: 0.06 }); tone(v, t, 0.06, { f: rand(220, 300), gain: 0.3, decay: 0.05 }); noise(v, t, 0.02, { type: "highpass", f: 2500, gain: 0.3, decay: 0.02 }); break;
      case "person": noise(v, t, 0.07, { type: "lowpass", f: 700, q: 1, gain: 0.8, decay: 0.07, pink: true }); tone(v, t, 0.06, { f: 140, f2: 80, gain: 0.4, decay: 0.06 }); break;
      case "water": noise(v, t, 0.3, { type: "bandpass", f: 1500, f2: 500, q: 1, gain: 0.6, attack: 0.005, decay: 0.3 }); break;
      case "dirt": noise(v, t, 0.1, { type: "lowpass", f: 900, q: 0.7, gain: 0.8, decay: 0.1, pink: true }); break;
      case "tyre": tone(v, t, 0.08, { f: 160, f2: 90, gain: 0.5, decay: 0.08 }); noise(v, t, 0.2, { type: "highpass", f: 2000, gain: 0.1, attack: 0.02, decay: 0.2 }); break;
      default: noise(v, t, 0.012, { type: "highpass", f: 2500, gain: 0.9, decay: 0.012 }); noise(v, t, 0.09, { type: "bandpass", f: rand(800, 1200), q: 1, gain: 0.7, decay: 0.09 }); noise(v, t + 0.01, 0.25, { type: "lowpass", f: 1500, gain: 0.15, decay: 0.25, pink: true });
    }
  };

  /** explosion({ pos, size }) */
  A.explosion = function (o = {}) {
    if (!ok()) return;
    const v = voice("boom", 4), sp = spatial(v, o.pos, { gain: 1.2 * (o.size || 1), wet: 1.3 }), t = ctx.currentTime + sp.delay + 0.001;
    noise(v, t, 0.03, { type: "highpass", f: 1500, gain: 1.2, decay: 0.03 });
    tone(v, t, 0.8, { f: 70, f2: 28, gain: 2.0, attack: 0.004, decay: 0.8 });
    noise(v, t, 1.6, { type: "lowpass", f: 2400, f2: 120, q: 0.4, gain: 1.4, attack: 0.004, decay: 1.6, pink: true });
    noise(v, t + 0.05, 3.0, { type: "lowpass", f: 500, f2: 80, gain: 0.5, attack: 0.1, decay: 3.0, pink: true });
    if ((sp.dist || 0) < 15) for (let i = 0; i < 6; i++) noise(v, t + rand(0.2, 1.2), 0.03, { type: "bandpass", f: rand(1500, 4000), q: 3, gain: 0.15, decay: 0.03 }); // debris
  };

  /** convenience: hook every event of a createWeapon() instance to sounds; returns an unsubscribe function */
  A.bindWeapon = function (weapon, getPos = () => null) {
    const d = weapon.def;
    const h = (e) => {
      const pos = getPos();
      switch (e.type) {
        case "fire": if (d.throwable) A.mech("spoon", { pos }); else A.shot(d, { pos }); break;
        case "dryFire": A.mech("dryFire", { pos }); break;
        case "magOut": A.mech("magOut", { pos }); break;
        case "magIn": A.mech("magIn", { pos }); break;
        case "shellIn": A.mech("shellIn", { pos }); break;
        case "cycle": A.mech(d.action === "pump" ? "pump" : "bolt", { pos }); break;
        case "equip": A.mech(d.throwable ? "pin" : "equip", { pos }); break;
        case "holster": A.mech("holster", { pos }); break;
        case "modeChange": A.mech("modeSwitch", { pos }); break;
      }
    };
    weapon.on("*", h); return () => weapon.off("*", h);
  };
  A.stats = () => ({ voices: A.voices.filter((v) => !A.ctx || v.end > A.ctx.currentTime).length, played: A.played, stolen: A.stolen, state: A.ctx ? A.ctx.state : "none" });
  A.dispose = () => { if (A.ctx && !opts.ctx) A.ctx.close(); };
  return A;
}

/** Closest point of a ray segment to a point (for whizz-by detection). Returns { point, distance, t }. */
export function closestOnSegment(a, b, p) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, L = abx * abx + aby * aby + abz * abz || 1;
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / L, 0, 1), q = { x: a.x + abx * t, y: a.y + aby * t, z: a.z + abz * t };
  return { point: q, distance: Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z), t };
}
