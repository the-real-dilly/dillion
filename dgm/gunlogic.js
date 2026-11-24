/* =====================================================================
   dgm/gunlogic.js : weapon definitions + pure-logic weapon state machine
   for Dilly Gone Mad. No THREE, no DOM: runs in the browser and in Node
   (see dgm/guns.test.mjs). All names are fictional; stats are game stats
   only. Models: assets/guns/*.obj (Quaternius, CC0).

   Conventions used everywhere in dgm/guns*:
     gun-local space: metres, +Z = towards the muzzle, +Y = up,
     -X = the gun's right side (ejection side), origin = the centre of the
     right-hand grip (where the palm wraps). Angles in radians unless a
     field name ends in "Deg".
   ===================================================================== */

/* ---------- small helpers ---------- */
export const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

/** Seeded RNG (mulberry32). Returns a function giving floats in [0,1). */
export function makeRng(seed = 1234567) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- model fixes: raw OBJ space -> gun-local space ----------
   The Quaternius OBJs point the barrel along +X with +Y up and arbitrary
   units. For each file: uniform scale to metres and raw-space (x, y)
   positions of the useful points, read off side-view renders. z is 0
   (centre line) unless given. The conversion is
     local = ( -rawZ * s, (rawY - grip.y) * s, (rawX - grip.x) * s ).  */
export const MODEL_FIX = {
  Pistol_1:         { s: 0.115, grip: [0.10, 0.22], support: [0.02, 0.12], muzzle: [1.48, 0.62], eject: [0.95, 0.72], eye: [-0.22, 0.79], front: [1.36, 0.79], trigger: [0.52, 0.33], magWell: [0.0, -0.36], stock: null, gripTilt: 0.30 },
  Pistol_3:         { s: 0.115, grip: [0.10, 0.22], support: [0.02, 0.12], muzzle: [1.51, 0.62], eject: [0.95, 0.76], eye: [-0.24, 0.87], front: [1.38, 0.87], trigger: [0.52, 0.33], magWell: [0.0, -0.38], stock: null, gripTilt: 0.30 },
  Revolver_1:       { s: 0.140, grip: [0.00, 0.10], support: [-0.06, 0.00], muzzle: [1.74, 0.42], eject: [0.45, 0.40], eye: [0.12, 0.57], front: [1.62, 0.55], trigger: [0.42, 0.20], magWell: [0.45, 0.40], stock: null, gripTilt: 0.35 },
  SubmachineGun_1:  { s: 0.140, grip: [0.02, 0.16], support: [1.45, 0.46], muzzle: [2.27, 0.62], eject: [0.90, 0.76], eye: [-0.30, 1.04], front: [1.85, 1.04], trigger: [0.45, 0.33], magWell: [1.12, -0.10], stock: null, gripTilt: 0.35 },
  SubmachineGun_3:  { s: 0.155, grip: [0.00, 0.05], support: [1.50, 0.00], muzzle: [2.12, 0.52], eject: [0.70, 0.62], eye: [-0.10, 0.84], front: [1.75, 0.84], trigger: [0.30, 0.18], magWell: [0.75, -0.20], stock: [-1.88, 0.40], gripTilt: 0.15 },
  AssaultRifle_1:   { s: 0.175, grip: [0.12, 0.18], support: [1.90, 0.47], muzzle: [2.92, 0.60], eject: [1.00, 0.72], eye: [0.30, 0.90], front: [2.62, 0.90], trigger: [0.45, 0.35], magWell: [1.20, 0.10], stock: null, gripTilt: 0.35 },
  AssaultRifle2_1:  { s: 0.165, grip: [-0.08, 0.10], support: [1.80, 0.52], muzzle: [3.61, 0.68], eject: [0.65, 0.68], eye: [0.25, 1.02], front: [2.55, 1.02], trigger: [0.30, 0.38], magWell: [0.95, 0.12], stock: [-1.56, 0.45], gripTilt: 0.45 },
  Bullpup_1:        { s: 0.150, grip: [0.05, 0.10], support: [2.00, 0.25], muzzle: [2.72, 0.82], eject: [-0.90, 0.72], eye: [-0.30, 1.14], front: [2.10, 1.14], trigger: [0.40, 0.35], magWell: [-1.00, 0.30], stock: [-2.53, 0.60], gripTilt: 0.30 },
  Shotgun_1:        { s: 0.190, grip: [-0.05, 0.05], support: [2.10, -0.05], muzzle: [3.80, 0.30], eject: [0.90, 0.25], eye: [0.35, 0.46], front: [3.30, 0.46], trigger: [0.40, 0.00], magWell: [0.90, 0.00], stock: [-1.41, -0.15], gripTilt: 0.55 },
  Shotgun_SawedOff: { s: 0.150, grip: [-0.05, -0.05], support: [1.90, 0.25], muzzle: [3.29, 0.43], eject: [0.90, 0.42], eye: [0.60, 0.58], front: [3.10, 0.58], trigger: [0.30, 0.05], magWell: [0.90, 0.42], stock: null, gripTilt: 0.45 },
  SniperRifle_1:    { s: 0.165, grip: [-0.20, -0.10], support: [1.80, 0.10], muzzle: [5.25, 0.32], eject: [0.40, 0.36], eye: [-0.45, 0.60], front: [1.90, 0.60], trigger: [0.20, 0.00], magWell: [0.60, 0.15], stock: [-2.04, -0.20], gripTilt: 0.55 },
  SniperRifle_3:    { s: 0.165, grip: [-0.10, -0.05], support: [2.00, 0.15], muzzle: [5.31, 0.40], eject: [0.50, 0.42], eye: [-0.25, 0.73], front: [2.05, 0.73], trigger: [0.20, 0.05], magWell: [0.70, 0.20], stock: [-1.93, 0.10], gripTilt: 0.45 },
  // procedural models (no OBJ): anchors already in metres, gun-local
  Grenade:          { s: 1, local: true, grip: [0, 0, 0], support: [0.03, 0.02, 0.0], muzzle: [0, 0.06, 0], eject: [0, 0.06, 0], eye: [0, 0.05, -0.1], front: [0, 0.05, 0.1], trigger: [0, 0.05, 0], magWell: [0, 0, 0], stock: null, gripTilt: 0 },
  Launcher:         { s: 1, local: true, grip: [0, 0, 0], support: [0, 0.03, 0.34], muzzle: [0, 0.07, 0.62], eject: [0, 0.07, 0.05], eye: [0, 0.16, -0.05], front: [0, 0.16, 0.45], trigger: [0, 0.03, 0.03], magWell: [0, 0.07, 0.12], stock: [0, 0.06, -0.3], gripTilt: 0.3 }
};

/** Convert a raw [x,y(,z)] point of a model to gun-local metres. */
export function rawToLocal(fix, p) {
  if (!p) return null;
  if (fix.local) return [p[0], p[1], p[2] || 0];
  const s = fix.s, z = p[2] || 0;
  return [round4(-z * s), round4((p[1] - fix.grip[1]) * s), round4((p[0] - fix.grip[0]) * s)];
}
const round4 = (v) => Math.round(v * 10000) / 10000;

/** Anchors for a model in gun-local space (all [x,y,z] arrays, metres). */
export function modelAnchors(model) {
  const f = MODEL_FIX[model];
  if (!f) throw new Error("unknown gun model " + model);
  const A = {};
  for (const k of ["grip", "support", "muzzle", "eject", "eye", "front", "trigger", "magWell", "stock"]) A[k] = rawToLocal(f, f[k]);
  A.grip = [0, 0, 0];
  // the support hand sits on the gun's left side for long guns, cupping the right hand for handguns
  A.support = [A.support[0] + 0.012, A.support[1] - 0.01, A.support[2]];
  if (!f.local) A.eject = [A.eject[0] - 0.016, A.eject[1], A.eject[2]]; // ejection port is on the right (-X) side
  A.gripTilt = f.gripTilt; // grip leans back by this angle (rad) from vertical
  return A;
}

/* ---------- weapon definitions ----------
   Distances in metres, times in seconds, spread in degrees (cone half-angle),
   recoil in degrees per shot. falloff: [[distance, multiplier], ...] linear in between. */
const BASE = {
  modes: ["semi"], rpm: 400, burst: null, pellets: 1, damage: 30, headMul: 2.0, limbMul: 0.75,
  falloff: [[0, 1], [25, 1], [60, 0.6]], range: 120, mag: 12, reserve: 48, maxReserve: 240, chamber: true,
  reload: { type: "mag", tactical: 1.4, empty: 1.8 },
  spread: { hip: 2.2, ads: 0.6, move: 1.5, bloom: 0.6, maxBloom: 4, recover: 9, pellet: 0 },
  recoil: { v: 1.2, h: 0.35, hBias: 0, rise: 0.04, riseCap: 10, recover: 10, adsMul: 0.7, shake: 0.3 },
  ads: { fov: 55, time: 0.18, scope: false, eyeRelief: 0.12 },
  moveMul: 1.0, equipTime: 0.45, holsterTime: 0.3, penetration: 1, impulse: 60, velocity: 380,
  tracerEvery: 0, sound: "pistol", casing: "pistol", action: "auto", cycleDelay: 0, jamChance: 0.002,
  pose: "pistol", slot: "handgun", throwable: false
};
function def(o) {
  const d = Object.assign({}, BASE, o);
  for (const k of ["reload", "spread", "recoil", "ads"]) d[k] = Object.assign({}, BASE[k], o[k] || {});
  d.anchors = modelAnchors(d.model);
  d.viewmodel = viewmodelFor(d);
  d.thirdPerson = thirdPersonFor(d);
  return Object.freeze(d);
}

export const GUN_DEFS = {};
const add = (o) => (GUN_DEFS[o.id] = def(o));

add({ id: "vespa9", name: "Vespa 9", desc: "Compact service pistol. Light, quick, forgiving.", class: "pistol", slot: "handgun", model: "Pistol_1", pose: "pistol",
  modes: ["semi"], rpm: 420, damage: 26, falloff: [[0, 1], [20, 1], [50, 0.55]], range: 90, mag: 15, reserve: 60, maxReserve: 210,
  reload: { tactical: 1.25, empty: 1.6 }, spread: { hip: 1.8, ads: 0.35, move: 1.2, bloom: 0.55, maxBloom: 3.5, recover: 10 },
  recoil: { v: 1.4, h: 0.4, recover: 12 }, ads: { fov: 60, time: 0.16, eyeRelief: 0.30 }, moveMul: 1.0, equipTime: 0.35, sound: "pistol", casing: "pistol", velocity: 360, impulse: 50 });

add({ id: "hornet45", name: "Hornet .45", desc: "Heavy-frame pistol that hits hard and kicks harder.", class: "pistol", slot: "handgun", model: "Pistol_3", pose: "pistol",
  modes: ["semi"], rpm: 300, damage: 38, headMul: 2.2, falloff: [[0, 1], [18, 1], [45, 0.5]], range: 80, mag: 8, reserve: 40, maxReserve: 160,
  reload: { tactical: 1.4, empty: 1.75 }, spread: { hip: 2.2, ads: 0.4, move: 1.4, bloom: 0.9, maxBloom: 4, recover: 8 },
  recoil: { v: 2.6, h: 0.6, recover: 9, shake: 0.5 }, ads: { fov: 60, time: 0.18, eyeRelief: 0.30 }, equipTime: 0.4, sound: "heavyPistol", casing: "pistol", velocity: 300, impulse: 80, penetration: 1.4 });

add({ id: "bullhorn6", name: "Bullhorn Six", desc: "Six-shot revolver. Slow, loud, devastating up close.", class: "revolver", slot: "handgun", model: "Revolver_1", pose: "pistol",
  modes: ["semi"], rpm: 150, damage: 62, headMul: 2.0, falloff: [[0, 1], [22, 1], [60, 0.55]], range: 100, mag: 6, reserve: 30, maxReserve: 96, chamber: false,
  reload: { tactical: 2.3, empty: 2.3 }, spread: { hip: 2.4, ads: 0.25, move: 1.8, bloom: 1.6, maxBloom: 5, recover: 6 },
  recoil: { v: 5.0, h: 1.0, recover: 7, shake: 0.8 }, ads: { fov: 58, time: 0.2, eyeRelief: 0.32 }, equipTime: 0.45, sound: "revolver", casing: null, velocity: 420, impulse: 120, penetration: 2, jamChance: 0 });

add({ id: "stingmp", name: "Sting MP", desc: "Machine pistol. Sprays fast, empties faster.", class: "smg", slot: "smg", model: "SubmachineGun_1", pose: "smg",
  modes: ["auto", "semi"], rpm: 900, damage: 18, falloff: [[0, 1], [15, 1], [40, 0.5]], range: 70, mag: 30, reserve: 120, maxReserve: 360,
  reload: { tactical: 1.6, empty: 2.0 }, spread: { hip: 3.2, ads: 1.1, move: 1.4, bloom: 0.35, maxBloom: 4.5, recover: 9 },
  recoil: { v: 0.75, h: 0.55, rise: 0.03, recover: 11 }, ads: { fov: 58, time: 0.17, eyeRelief: 0.14 }, moveMul: 0.98, equipTime: 0.45, sound: "smg", casing: "pistol", velocity: 340, tracerEvery: 4, impulse: 40 });

add({ id: "wasppdw", name: "Wasp PDW", desc: "Stocked personal defence weapon with a vertical grip. Controllable.", class: "smg", slot: "smg", model: "SubmachineGun_3", pose: "rifle",
  modes: ["auto", "burst", "semi"], rpm: 780, burst: { count: 3, rpm: 1000, delay: 0.25 }, damage: 21, falloff: [[0, 1], [20, 1], [50, 0.55]], range: 85, mag: 32, reserve: 128, maxReserve: 384,
  reload: { tactical: 1.9, empty: 2.3 }, spread: { hip: 2.6, ads: 0.6, move: 1.2, bloom: 0.28, maxBloom: 3.5, recover: 10 },
  recoil: { v: 0.6, h: 0.35, hBias: 0.1, rise: 0.03, recover: 12 }, ads: { fov: 55, time: 0.2, eyeRelief: 0.14 }, moveMul: 0.96, equipTime: 0.5, sound: "smg", casing: "pistol", velocity: 380, tracerEvery: 4, impulse: 45 });

add({ id: "coyote", name: "Coyote AR", desc: "Workhorse assault rifle. Accurate in bursts, reliable all day.", class: "rifle", slot: "rifle", model: "AssaultRifle2_1", pose: "rifle",
  modes: ["auto", "burst", "semi"], rpm: 720, burst: { count: 3, rpm: 900, delay: 0.3 }, damage: 30, headMul: 2.0, falloff: [[0, 1], [45, 1], [110, 0.65]], range: 220, mag: 30, reserve: 120, maxReserve: 360,
  reload: { tactical: 2.1, empty: 2.6 }, spread: { hip: 2.8, ads: 0.25, move: 1.8, bloom: 0.3, maxBloom: 3.5, recover: 9 },
  recoil: { v: 0.9, h: 0.4, hBias: 0.12, rise: 0.04, recover: 10, adsMul: 0.65 }, ads: { fov: 50, time: 0.24, eyeRelief: 0.1 }, moveMul: 0.93, equipTime: 0.6, sound: "rifle", casing: "rifle", velocity: 880, tracerEvery: 3, penetration: 3, impulse: 70 });

add({ id: "jackal", name: "Jackal Carbine", desc: "Short-barrel carbine with a wooden handguard. Big punch, rough recoil.", class: "rifle", slot: "rifle", model: "AssaultRifle_1", pose: "rifle",
  modes: ["auto", "semi"], rpm: 600, damage: 34, headMul: 2.0, falloff: [[0, 1], [35, 1], [90, 0.6]], range: 180, mag: 30, reserve: 120, maxReserve: 300,
  reload: { tactical: 2.3, empty: 2.8 }, spread: { hip: 3.0, ads: 0.4, move: 2.0, bloom: 0.42, maxBloom: 4.2, recover: 8 },
  recoil: { v: 1.25, h: 0.7, hBias: -0.15, rise: 0.05, recover: 9, adsMul: 0.7, shake: 0.45 }, ads: { fov: 52, time: 0.25, eyeRelief: 0.1 }, moveMul: 0.92, equipTime: 0.6, sound: "rifleHeavy", casing: "rifle", velocity: 720, tracerEvery: 3, penetration: 3.2, impulse: 80 });

add({ id: "mantis", name: "Mantis BP", desc: "Bullpup rifle: full-length barrel in a compact body, with an optic rail.", class: "bullpup", slot: "rifle", model: "Bullpup_1", pose: "bullpup",
  modes: ["auto", "burst", "semi"], rpm: 800, burst: { count: 3, rpm: 1000, delay: 0.25 }, damage: 28, headMul: 2.0, falloff: [[0, 1], [50, 1], [120, 0.65]], range: 240, mag: 30, reserve: 120, maxReserve: 360,
  reload: { tactical: 2.6, empty: 3.1 }, spread: { hip: 2.6, ads: 0.2, move: 1.6, bloom: 0.26, maxBloom: 3.2, recover: 10 },
  recoil: { v: 0.75, h: 0.35, hBias: 0.05, rise: 0.035, recover: 11, adsMul: 0.6 }, ads: { fov: 42, time: 0.26, scope: "reflex", eyeRelief: 0.12 }, moveMul: 0.94, equipTime: 0.6, sound: "rifle", casing: "rifle", velocity: 920, tracerEvery: 3, penetration: 3, impulse: 70 });

add({ id: "thunder12", name: "Thunder 12", desc: "Pump-action shotgun. Clears a doorway.", class: "shotgun", slot: "shotgun", model: "Shotgun_1", pose: "shotgun",
  modes: ["pump"], action: "pump", rpm: 75, cycleDelay: 0.22, pellets: 8, damage: 14, headMul: 1.5, falloff: [[0, 1], [8, 1], [25, 0.3], [40, 0.1]], range: 45, mag: 7, reserve: 28, maxReserve: 84,
  reload: { type: "shell", start: 0.35, shell: 0.48, end: 0.4 }, spread: { hip: 2.0, ads: 1.2, move: 1.2, bloom: 0.8, maxBloom: 2.5, recover: 5, pellet: 4.2 },
  recoil: { v: 5.5, h: 1.2, recover: 6, shake: 1.0 }, ads: { fov: 58, time: 0.24, eyeRelief: 0.1 }, moveMul: 0.92, equipTime: 0.6, sound: "shotgun", casing: "shell", velocity: 400, impulse: 30, penetration: 0.8, jamChance: 0 });

add({ id: "mule", name: "Mule Double", desc: "Cut-down double barrel. Two shots, then a quick break-open reload.", class: "shotgun", slot: "shotgun", model: "Shotgun_SawedOff", pose: "shotgun",
  modes: ["semi"], rpm: 240, pellets: 9, damage: 13, headMul: 1.5, falloff: [[0, 1], [6, 1], [18, 0.3], [30, 0.08]], range: 30, mag: 2, reserve: 24, maxReserve: 60, chamber: false,
  reload: { tactical: 1.6, empty: 1.9 }, spread: { hip: 2.4, ads: 1.6, move: 1.0, bloom: 1.0, maxBloom: 3, recover: 5, pellet: 6.0 },
  recoil: { v: 7, h: 1.8, recover: 6, shake: 1.2 }, ads: { fov: 62, time: 0.2, eyeRelief: 0.12 }, moveMul: 0.97, equipTime: 0.45, sound: "shotgun", casing: null, velocity: 380, impulse: 35, penetration: 0.6, jamChance: 0 });

add({ id: "longshot", name: "Longshot", desc: "Bolt-action hunting rifle with a fixed scope.", class: "sniper", slot: "sniper", model: "SniperRifle_1", pose: "sniper",
  modes: ["bolt"], action: "bolt", rpm: 45, cycleDelay: 0.45, damage: 105, headMul: 2.5, limbMul: 0.8, falloff: [[0, 1], [150, 1], [400, 0.8]], range: 500, mag: 5, reserve: 25, maxReserve: 60,
  reload: { tactical: 2.8, empty: 3.3 }, spread: { hip: 5.0, ads: 0.02, move: 3.0, bloom: 2.0, maxBloom: 6, recover: 4 },
  recoil: { v: 6.5, h: 1.0, recover: 5, adsMul: 0.6, shake: 1.0 }, ads: { fov: 16, time: 0.35, scope: "scope", eyeRelief: 0.08 }, moveMul: 0.86, equipTime: 0.75, sound: "sniper", casing: "rifle", velocity: 900, tracerEvery: 1, penetration: 5, impulse: 160, jamChance: 0 });

add({ id: "wraith", name: "Wraith DMR", desc: "Semi-automatic marksman rifle with a thumbhole stock and suppressor.", class: "dmr", slot: "sniper", model: "SniperRifle_3", pose: "sniper",
  modes: ["semi"], rpm: 200, damage: 62, headMul: 2.2, falloff: [[0, 1], [100, 1], [300, 0.75]], range: 400, mag: 10, reserve: 40, maxReserve: 100,
  reload: { tactical: 2.4, empty: 2.9 }, spread: { hip: 4.0, ads: 0.06, move: 2.6, bloom: 0.9, maxBloom: 4, recover: 6 },
  recoil: { v: 2.8, h: 0.6, recover: 7, adsMul: 0.6, shake: 0.6 }, ads: { fov: 22, time: 0.3, scope: "scope", eyeRelief: 0.08 }, moveMul: 0.88, equipTime: 0.7, sound: "suppressed", casing: "rifle", velocity: 820, tracerEvery: 1, penetration: 4, impulse: 110 });

add({ id: "pineapple", name: "Pineapple", desc: "Fragmentation-free stun grenade: a bang, a flash and everyone falls over.", class: "grenade", slot: "throwable", model: "Grenade", pose: "throw", throwable: true,
  modes: ["throw"], action: "throw", rpm: 60, damage: 70, headMul: 1, limbMul: 1, falloff: [[0, 1], [3, 1], [7, 0]], range: 7, mag: 1, reserve: 4, maxReserve: 10, chamber: false,
  reload: { tactical: 0.6, empty: 0.6 }, spread: { hip: 0, ads: 0, move: 0, bloom: 0, maxBloom: 0, recover: 1 }, recoil: { v: 0, h: 0, recover: 10, shake: 0 },
  ads: { fov: 65, time: 0.2, eyeRelief: 0.3 }, fuse: 3.0, throwSpeed: 16, radius: 7, equipTime: 0.4, sound: "explosion", casing: null, impulse: 400, jamChance: 0 });

add({ id: "thumper", name: "Thumper", desc: "Single-shot grenade launcher. Lobs a bouncing stun round.", class: "launcher", slot: "heavy", model: "Launcher", pose: "rifle",
  modes: ["semi"], action: "projectile", rpm: 60, damage: 80, headMul: 1, limbMul: 1, falloff: [[0, 1], [2.5, 1], [6, 0]], range: 6, mag: 1, reserve: 8, maxReserve: 16, chamber: false,
  reload: { tactical: 2.0, empty: 2.0 }, spread: { hip: 1.0, ads: 0.3, move: 1, bloom: 0, maxBloom: 0, recover: 5 }, recoil: { v: 4, h: 0.6, recover: 5, shake: 0.9 },
  ads: { fov: 55, time: 0.25, eyeRelief: 0.12 }, fuse: 0, projectileSpeed: 45, radius: 6, moveMul: 0.88, equipTime: 0.7, sound: "launcher", casing: null, impulse: 450, jamChance: 0 });

/** Ordered weapon-wheel list. */
export const GUN_ORDER = ["vespa9", "hornet45", "bullhorn6", "stingmp", "wasppdw", "coyote", "jackal", "mantis", "thunder12", "mule", "longshot", "wraith", "pineapple", "thumper"];

/* ---------- viewmodel / third-person placement ----------
   viewmodel: transform of the GUN (its local origin = grip) in CAMERA space
   (camera looks down -Z). rot is an Euler XYZ in radians; [0, PI, 0] turns
   the gun's +Z muzzle to face the camera's -Z. hip and ads are the two
   ends of the ADS blend; ads puts the gun's "eye" anchor on the view axis. */
function viewmodelFor(d) {
  const A = d.anchors, pistol = d.pose === "pistol", eye = A.eye, relief = d.ads.eyeRelief;
  const hip = pistol ? { pos: [0.13, -0.15, -0.38], rot: [0.02, Math.PI + 0.06, 0] }
    : d.pose === "throw" ? { pos: [0.16, -0.16, -0.32], rot: [0.2, Math.PI, 0] }
    : { pos: [0.12, -0.15, -0.22 - Math.max(0, A.support[2]) * 0.15], rot: [0.015, Math.PI + 0.04, 0] };
  // ADS: world = pos + Ry(PI) * eye = pos + (-ex, ey, -ez) must equal (0, 0, -relief)
  const ads = { pos: [round4(eye[0]), round4(-eye[1]), round4(-relief + eye[2])], rot: [0, Math.PI, 0] };
  return { hip, ads, fov: 70, sway: pistol ? 1.2 : 1 };
}
/* third person: transform of the GUN relative to the avatar's right hand bone is avatar-specific;
   these are the pose-level hints the game's IK uses (metres relative to the avatar root, +Z forward). */
function thirdPersonFor(d) {
  const P = {
    pistol: { gripAt: [-0.14, 1.36, 0.42], twoHanded: true, supportOnGrip: true, aimFromEye: true, shoulderAt: null },
    smg: { gripAt: [-0.16, 1.30, 0.30], twoHanded: true, supportOnGrip: false, aimFromEye: true, shoulderAt: null },
    rifle: { gripAt: [-0.17, 1.30, 0.22], twoHanded: true, supportOnGrip: false, aimFromEye: true, shoulderAt: [-0.17, 1.38, 0.05] },
    bullpup: { gripAt: [-0.17, 1.30, 0.32], twoHanded: true, supportOnGrip: false, aimFromEye: true, shoulderAt: [-0.17, 1.38, 0.05] },
    shotgun: { gripAt: [-0.17, 1.30, 0.22], twoHanded: true, supportOnGrip: false, aimFromEye: true, shoulderAt: [-0.17, 1.38, 0.05] },
    sniper: { gripAt: [-0.16, 1.32, 0.2], twoHanded: true, supportOnGrip: false, aimFromEye: true, shoulderAt: [-0.16, 1.40, 0.05] },
    throw: { gripAt: [-0.22, 1.25, 0.18], twoHanded: false, supportOnGrip: false, aimFromEye: false, shoulderAt: null }
  }[d.pose];
  return Object.assign({ lowReady: { pitch: 0.55, yaw: 0.25 } }, P);
}

/* ---------- damage helpers ---------- */
/** Piecewise-linear falloff multiplier at distance d. */
export function falloffAt(curve, d) {
  if (!curve || !curve.length) return 1;
  if (d <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [d1, m1] = curve[i];
    if (d <= d1) { const [d0, m0] = curve[i - 1]; return lerp(m0, m1, (d - d0) / Math.max(1e-6, d1 - d0)); }
  }
  return curve[curve.length - 1][1];
}
/** Damage for one pellet/bullet at distance and body zone ("head" | "torso" | "limb" | other). */
export function damageAt(d, dist, zone = "torso") {
  if (dist > d.range) return 0;
  const zm = zone === "head" ? d.headMul : zone === "limb" ? d.limbMul : 1;
  return d.damage * falloffAt(d.falloff, dist) * zm;
}

/* ---------- weapon state machine ---------- */
/**
 * createWeapon(def, opts) -> weapon object (pure logic).
 * opts: { seed, ammo, reserve, jams (bool, default false), autoReload (default true),
 *         infiniteReserve (bool), startEquipped (default true) }
 * Drive it with update(dt) each frame; read events with on(name, fn).
 * Events: equip, equipped, holster, holstered, fire, dryFire, reloadStart, magOut, magIn,
 *         shellIn, reloadEnd, reloadDenied, cycle, jam, unjam, modeChange, empty, adsChange.
 */
export function createWeapon(d, opts = {}) {
  if (typeof d === "string") d = GUN_DEFS[d];
  if (!d) throw new Error("createWeapon: unknown weapon");
  const rng = makeRng(opts.seed == null ? 1337 : opts.seed);
  const L = {};
  const w = {
    def: d, id: d.id,
    mode: d.modes[0],
    ammo: opts.ammo == null ? d.mag : opts.ammo,
    reserve: opts.reserve == null ? d.reserve : opts.reserve,
    state: opts.startEquipped === false ? "holstered" : "ready",
    timer: 0, cooldown: 0, trigger: false, adsTarget: false, adsBlend: 0, moving: 0, crouch: false,
    bloom: 0, recoilPitch: 0, recoilYaw: 0, sprayCount: 0, sinceShot: 99, shotsFired: 0,
    burstLeft: 0, queuedPull: 0, reloadKind: null, reloadStage: 0, cyclePending: -1,
    jams: !!opts.jams, autoReload: opts.autoReload !== false, infiniteReserve: !!opts.infiniteReserve,
    _rp: 0, _ry: 0, time: 0,

    on(ev, fn) { (L[ev] || (L[ev] = [])).push(fn); return w; },
    off(ev, fn) { if (L[ev]) L[ev] = L[ev].filter((f) => f !== fn); return w; },
    emit(ev, data = {}) { data.type = ev; data.weapon = d.id; if (L[ev]) for (const f of L[ev].slice()) f(data, w); if (L["*"]) for (const f of L["*"].slice()) f(data, w); return data; },

    get capacity() { return d.mag + (d.chamber && w.ammo > 0 ? 1 : 0); },
    get busy() { return w.state !== "ready"; },
    get canFire() { return w.state === "ready" && w.cooldown <= 0 && w.ammo > 0; },
    /** current cone half-angle in radians */
    get spread() {
      const s = d.spread, base = lerp(s.hip, s.ads, w.adsBlend) + s.move * w.moving * lerp(1, 0.5, w.adsBlend) * (w.crouch ? 0.6 : 1);
      return Math.max(0, (base * (w.crouch ? 0.8 : 1) + w.bloom) * DEG);
    },
    get fov() { return lerp(w.viewFov || 70, d.ads.fov, easeInOut(w.adsBlend)); },
    get moveMul() { return d.moveMul * lerp(1, 0.7, w.adsBlend); },
    get reloadProgress() { return w.state === "reloading" ? clamp(1 - w.timer / Math.max(1e-6, w._reloadT), 0, 1) : 0; },

    equip() { if (w.state === "ready" || w.state === "equipping") return; w.state = "equipping"; w.timer = d.equipTime; w.trigger = false; w.emit("equip", { time: d.equipTime }); },
    holster() { if (w.state === "holstered" || w.state === "holstering") return; w.state = "holstering"; w.timer = d.holsterTime; w.trigger = false; w.adsTarget = false; w.emit("holster", { time: d.holsterTime }); },
    setADS(on) { on = !!on; if (on !== w.adsTarget) { w.adsTarget = on; w.emit("adsChange", { on }); } },
    setMoving(v, crouch = false) { w.moving = clamp(v, 0, 1); w.crouch = !!crouch; },
    setMode(m) { if (d.modes.includes(m) && m !== w.mode) { w.mode = m; w.burstLeft = 0; w.emit("modeChange", { mode: m }); } },
    cycleMode() { const i = d.modes.indexOf(w.mode); w.setMode(d.modes[(i + 1) % d.modes.length]); return w.mode; },
    addAmmo(n) { const before = w.reserve; w.reserve = Math.min(d.maxReserve, w.reserve + Math.max(0, n | 0)); return w.reserve - before; },

    /** press (true) or release (false) the trigger */
    setTrigger(on) {
      on = !!on;
      if (on && !w.trigger) w._pull();
      if (!on && w.trigger) { w.trigger = false; if (w.mode !== "burst") w.burstLeft = 0; }
      w.trigger = on;
    },
    pull() { w.setTrigger(true); }, release() { w.setTrigger(false); },
    /** single tap: press and release (semi weapons fire once) */
    tap() { w.setTrigger(true); w.setTrigger(false); },

    _pull() {
      w.trigger = true;
      if (w.state === "reloading" && d.reload.type === "shell" && w.ammo > 0) { w._endReload(true); }
      if (w.state === "jammed") { w.emit("dryFire", { jammed: true }); return; }
      if (w.state !== "ready") { w.queuedPull = 0.15; return; }
      if (w.ammo <= 0) { w._dry(); return; }
      if (w.mode === "burst") { if (w.burstLeft <= 0 && w.cooldown <= 0) w.burstLeft = d.burst.count; else w.queuedPull = 0.15; }
      if (w.cooldown <= 0) w._fire(); else w.queuedPull = 0.15;
    },
    _dry() {
      w.emit("dryFire", {}); w.cooldown = Math.max(w.cooldown, 0.25);
      if (w.autoReload && w.reserve > 0) w.reload();
    },
    _fire() {
      const shot = w.sprayCount;
      // pellet directions: offsets (yaw, pitch) inside the current cone (uniform on a disc)
      const cone = w.spread, pel = [], pc = d.spread.pellet * DEG;
      const aimOff = discSample(rng, cone);
      for (let i = 0; i < d.pellets; i++) {
        if (d.pellets === 1) { pel.push(aimOff); break; }
        const o = discSample(rng, pc); pel.push([aimOff[0] + o[0], aimOff[1] + o[1]]);
      }
      // recoil kick
      const R = d.recoil, am = lerp(1, R.adsMul, w.adsBlend), rise = 1 + Math.min(shot, R.riseCap) * R.rise;
      const kv = R.v * rise * am * DEG * (0.9 + rng() * 0.2);
      const kh = (R.hBias + Math.sin(shot * 0.9 + 0.7) * 0.6 + (rng() - 0.5) * 0.8) * R.h * am * DEG;
      w.recoilPitch += kv; w.recoilYaw += kh; w._rp += kv; w._ry += kh;
      w.bloom = Math.min(d.spread.maxBloom, w.bloom + d.spread.bloom * lerp(1, 0.6, w.adsBlend));
      w.ammo--; w.shotsFired++; w.sprayCount++; w.sinceShot = 0;
      const rate = w.mode === "burst" && d.burst ? d.burst.rpm : d.rpm;
      w.cooldown += 60 / rate; if (w.cooldown < 0) w.cooldown = 0;
      if (w.mode === "burst") { w.burstLeft--; if (w.burstLeft <= 0) w.cooldown += d.burst.delay; }
      const ev = w.emit("fire", { shot, pellets: pel, spread: cone, recoil: { pitch: kv, yaw: kh, shake: R.shake }, ads: w.adsBlend, ammo: w.ammo, mode: w.mode, tracer: d.tracerEvery > 0 && w.shotsFired % d.tracerEvery === 0 });
      if (w._buf) w._buf.push(ev);
      if ((d.action === "pump" || d.action === "bolt") && w.ammo > 0) w.cyclePending = d.cycleDelay;
      if (w.ammo === 0) w.emit("empty", {});
      if (w.jams && d.jamChance > 0 && w.ammo > 0 && rng() < d.jamChance) { w.state = "jammed"; w.trigger = false; w.emit("jam", {}); }
      return ev;
    },

    reload() {
      if (w.state === "jammed") { w.state = "reloading"; w.reloadKind = "unjam"; w._reloadT = w.timer = 0.7; w.emit("reloadStart", { kind: "unjam", time: 0.7 }); return true; }
      if (w.state !== "ready") { w.emit("reloadDenied", { reason: w.state }); return false; }
      const full = d.chamber && w.ammo > 0 ? d.mag + 1 : d.mag;
      if (w.ammo >= full) { w.emit("reloadDenied", { reason: "full" }); return false; }
      if (w.reserve <= 0 && !w.infiniteReserve) { w.emit("reloadDenied", { reason: "noReserve" }); return false; }
      w.state = "reloading"; w.burstLeft = 0; w.cyclePending = -1; w._full = full; w._wasEmpty = w.ammo === 0; w.reloadStage = 0;
      if (d.reload.type === "shell") {
        w.reloadKind = "shell"; w._reloadT = w.timer = d.reload.start;
        w.emit("reloadStart", { kind: "shell", time: d.reload.start + d.reload.shell * Math.min(full - w.ammo, w.infiniteReserve ? 99 : w.reserve) + d.reload.end });
      } else {
        w.reloadKind = w.ammo > 0 ? "tactical" : "empty"; w._reloadT = w.timer = w.ammo > 0 ? d.reload.tactical : d.reload.empty;
        w.emit("reloadStart", { kind: w.reloadKind, time: w.timer });
      }
      return true;
    },
    /** cancel a reload in progress (e.g. when sprinting); shells already loaded stay loaded */
    cancelReload() { if (w.state === "reloading") w._endReload(true); },
    _take(n) { const t = w.infiniteReserve ? n : Math.min(n, w.reserve); if (!w.infiniteReserve) w.reserve -= t; return Math.max(0, t); },
    _endReload(interrupted = false) {
      const kind = w.reloadKind;
      w.state = "ready"; w.sprayCount = 0; w.reloadKind = null; w.timer = 0;
      w.emit("reloadEnd", { kind, interrupted, ammo: w.ammo, reserve: w.reserve });
    },

    /** advance time; returns the list of fire events emitted during this step */
    update(dt) {
      const fired = []; w._buf = fired; w.time += dt; w.sinceShot += dt;
      // ADS blend
      const at = w.adsTarget && w.state !== "holstered" && w.state !== "holstering" ? 1 : 0;
      const step = dt / Math.max(0.01, d.ads.time);
      w.adsBlend = at > w.adsBlend ? Math.min(at, w.adsBlend + step) : Math.max(at, w.adsBlend - step * 1.2);
      // timers
      if (w.queuedPull > 0) w.queuedPull -= dt;
      if (w.cyclePending >= 0) { w.cyclePending -= dt; if (w.cyclePending < 0) w.emit("cycle", {}); }
      if (w.state === "equipping" || w.state === "holstering") {
        w.timer -= dt;
        if (w.timer <= 0) { w.state = w.state === "equipping" ? "ready" : "holstered"; w.emit(w.state === "ready" ? "equipped" : "holstered", {}); }
      } else if (w.state === "reloading") {
        w.timer -= dt;
        if (w.reloadKind === "shell") {
          let guard = 0;
          while (w.state === "reloading" && w.timer <= 0 && guard++ < 32) {
            if (w.reloadStage === 0) { w.reloadStage = 1; w._reloadT = d.reload.shell; w.timer += d.reload.shell; continue; }
            if (w.reloadStage === 1) {
              w.ammo += w._take(1); w.emit("shellIn", { ammo: w.ammo });
              if (w.ammo >= w._full || (w.reserve <= 0 && !w.infiniteReserve)) { w.reloadStage = 2; w._reloadT = d.reload.end; w.timer += d.reload.end; if (w._wasEmpty) w.emit("cycle", { reload: true }); }
              else w.timer += d.reload.shell;
              continue;
            }
            w._endReload(false);
          }
        } else if (w.reloadKind === "unjam") {
          if (w.timer <= 0) { w.state = "ready"; w.reloadKind = null; w.emit("unjam", {}); }
        } else {
          const p = 1 - w.timer / w._reloadT;
          if (w.reloadStage === 0 && p >= 0.3) { w.reloadStage = 1; w.emit("magOut", { kind: w.reloadKind, rounds: w.ammo }); }
          if (w.reloadStage === 1 && p >= 0.7) { w.reloadStage = 2; w.emit("magIn", { kind: w.reloadKind }); }
          if (w.timer <= 0) {
            const keep = d.chamber && w.ammo > 0 ? 1 : 0;
            w.ammo += w._take(d.mag + keep - w.ammo);
            if (w.reloadKind === "empty" && d.casing) w.emit("cycle", { reload: true });
            w._endReload(false);
          }
        }
      }
      // firing
      if (w.cooldown > 0) w.cooldown -= dt;
      let guard = 0;
      while (w.state === "ready" && w.cooldown <= 0 && guard++ < 64) {
        const wantAuto = w.mode === "auto" && w.trigger;
        const wantBurst = w.mode === "burst" && w.burstLeft > 0;
        const wantQueued = w.queuedPull > 0 && w.mode !== "auto";
        if (!(wantAuto || wantBurst || wantQueued)) break;
        if (wantQueued && !wantBurst) { w.queuedPull = 0; if (w.mode === "burst") w.burstLeft = d.burst.count; }
        if (w.ammo <= 0) { w.burstLeft = 0; w._dry(); break; }
        w._fire();
      }
      if (w.cooldown < 0 && !(w.mode === "auto" && w.trigger)) w.cooldown = 0;
      // recovery
      if (w.sinceShot > 0.06) {
        w.bloom = Math.max(0, w.bloom - d.spread.recover * 0.5 * dt - w.bloom * Math.min(1, dt * 3));
        const rk = 1 - Math.exp(-dt * d.recoil.recover);
        const dp = w.recoilPitch * rk, dy = w.recoilYaw * rk;
        w.recoilPitch -= dp; w.recoilYaw -= dy; w._rp -= dp; w._ry -= dy;
        if (w.sinceShot > 0.25 && !w.trigger) w.sprayCount = 0;
      }
      w._buf = null;
      return fired;
    },

    /** camera delta (radians) accumulated since the last call: add pitch to camera pitch (up), yaw to camera yaw */
    consumeRecoil() { const o = { pitch: w._rp, yaw: w._ry }; w._rp = 0; w._ry = 0; return o; },

    snapshot() {
      return { id: d.id, name: d.name, state: w.state, mode: w.mode, ammo: w.ammo, reserve: w.reserve, mag: d.mag, spreadDeg: w.spread / DEG,
        ads: Math.round(w.adsBlend * 100) / 100, recoil: [w.recoilPitch / DEG, w.recoilYaw / DEG], bloom: w.bloom, cooldown: Math.max(0, w.cooldown), reload: w.reloadKind, shots: w.shotsFired };
    }
  };
  return w;
}

function discSample(rng, r) {
  const a = rng() * Math.PI * 2, m = Math.sqrt(rng()) * r;
  return [Math.cos(a) * m, Math.sin(a) * m];
}
function easeInOut(t) { return t * t * (3 - 2 * t); }

/** Rotate a unit direction by small yaw/pitch offsets around an aim basis.
 *  dir: [x,y,z] unit aim; off: [yawOff, pitchOff]. Returns a new unit [x,y,z]. Pure math (no THREE). */
export function offsetDir(dir, off) {
  const [dx, dy, dz] = dir;
  // basis: right = normalize(dir x up), up' = right x dir
  let rx = -dz, ry = 0, rz = dx; // dir x up(0,1,0)
  let rl = Math.hypot(rx, ry, rz);
  if (rl < 1e-6) { rx = 1; ry = 0; rz = 0; rl = 1; }
  rx /= rl; ry /= rl; rz /= rl;
  const ux = ry * dz - rz * dy, uy = rz * dx - rx * dz, uz = rx * dy - ry * dx;
  const ty = Math.tan(off[0]), tp = Math.tan(off[1]);
  const x = dx + rx * ty + ux * tp, y = dy + ry * ty + uy * tp, z = dz + rz * ty + uz * tp, l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}
