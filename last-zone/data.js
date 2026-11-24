// DILLION: LAST ZONE - static game data (weapons, items, loot tables, gas, callsigns). Pure data.

export const RARITY = [
  { id: 0, name: "Common", col: "#b9bdb4", dmg: 1.0, ctl: 1.0 },
  { id: 1, name: "Uncommon", col: "#62d26f", dmg: 1.04, ctl: 0.93 },
  { id: 2, name: "Rare", col: "#4aa3ff", dmg: 1.08, ctl: 0.86 },
  { id: 3, name: "Epic", col: "#b65cff", dmg: 1.12, ctl: 0.8 },
  { id: 4, name: "Legendary", col: "#ffb52e", dmg: 1.16, ctl: 0.72 }
];

export const AMMO = {
  light: { name: "Light rounds", max: 240, pickup: 60, col: "#d9c27a" },
  heavy: { name: "Heavy rounds", max: 210, pickup: 45, col: "#7fb5d9" },
  shell: { name: "Shells", max: 48, pickup: 12, col: "#ff7a45" },
  sniper: { name: "Marksman rounds", max: 30, pickup: 8, col: "#c99bff" }
};

// Fictional weapons. Models are CC0 Quaternius low-poly guns (assets/guns). Stats are game-balance only.
// rec: [vertical kick deg, horizontal pattern deg...], spread in degrees, ranges in metres.
export const WEAPONS = {
  warden: { name: "Warden P9", cls: "Sidearm", model: "Pistol_1", scale: 0.12, ammo: "light", dmg: 24, rpm: 420, auto: false, mag: 12, reload: 1.35,
    r0: 20, r1: 45, minMul: 0.6, hip: 1.6, ads: 0.35, bloom: 0.55, bloomMax: 3.2, rec: [1.1, 0.25, -0.2, 0.3, -0.35], hs: 1.9, zoom: 1.2, move: 1.0, snd: "pistol", tracer: 0.5 },
  marshal: { name: "Marshal .44", cls: "Revolver", model: "Revolver_1", scale: 0.115, ammo: "heavy", dmg: 58, rpm: 150, auto: false, mag: 6, reload: 2.4,
    r0: 30, r1: 70, minMul: 0.65, hip: 2.2, ads: 0.25, bloom: 1.6, bloomMax: 4, rec: [3.6, 0.6, -0.8], hs: 2.0, zoom: 1.3, move: 1.0, snd: "revolver", tracer: 0.7 },
  hornet: { name: "Hornet SMG", cls: "SMG", model: "SubmachineGun_1", scale: 0.17, ammo: "light", dmg: 19, rpm: 920, auto: true, mag: 32, reload: 2.0,
    r0: 14, r1: 38, minMul: 0.55, hip: 2.4, ads: 1.0, bloom: 0.22, bloomMax: 3.4, rec: [0.3, 0.2, 0.25, -0.15, 0.3, -0.35, 0.1], hs: 1.45, zoom: 1.25, move: 0.98, snd: "smg", tracer: 0.4 },
  vandal: { name: "Vandal-45 SMG", cls: "SMG", model: "SubmachineGun_3", scale: 0.17, ammo: "light", dmg: 23, rpm: 740, auto: true, mag: 30, reload: 2.2,
    r0: 18, r1: 45, minMul: 0.55, hip: 2.6, ads: 0.85, bloom: 0.26, bloomMax: 3.6, rec: [0.38, -0.25, -0.3, 0.2, -0.15, 0.25], hs: 1.5, zoom: 1.25, move: 0.97, snd: "smg", tracer: 0.45 },
  falcon: { name: "Falcon-9 Carbine", cls: "Assault rifle", model: "AssaultRifle_1", scale: 0.21, ammo: "heavy", dmg: 26, rpm: 680, auto: true, mag: 30, reload: 2.3,
    r0: 40, r1: 95, minMul: 0.7, hip: 3.0, ads: 0.35, bloom: 0.2, bloomMax: 3.0, rec: [0.42, 0.18, 0.12, -0.2, 0.25, -0.1, 0.15], hs: 1.6, zoom: 1.45, move: 0.93, snd: "rifle", tracer: 0.6 },
  kestrel: { name: "Kestrel Bullpup", cls: "Assault rifle", model: "Bullpup_1", scale: 0.18, ammo: "heavy", dmg: 30, rpm: 600, auto: true, mag: 30, reload: 2.6,
    r0: 50, r1: 115, minMul: 0.72, hip: 3.2, ads: 0.28, bloom: 0.24, bloomMax: 3.2, rec: [0.5, -0.2, -0.25, 0.3, -0.1, 0.2], hs: 1.6, zoom: 1.55, move: 0.91, snd: "rifle2", tracer: 0.6 },
  breaker: { name: "Breaker 12", cls: "Shotgun", model: "Shotgun_1", scale: 0.2, ammo: "shell", dmg: 14, pellets: 9, rpm: 72, auto: false, mag: 6, reload: 3.0,
    r0: 7, r1: 22, minMul: 0.25, hip: 4.6, ads: 3.6, bloom: 0, bloomMax: 0, rec: [5.0, 0.8, -0.8], hs: 1.3, zoom: 1.15, move: 0.95, snd: "shotgun", tracer: 0.3 },
  vigil: { name: "Vigil Marksman", cls: "Sniper", model: "SniperRifle_1", scale: 0.17, ammo: "sniper", dmg: 92, rpm: 46, auto: false, mag: 5, reload: 3.1,
    r0: 150, r1: 400, minMul: 0.85, hip: 6.0, ads: 0.02, bloom: 0, bloomMax: 0, rec: [6.5, 0.6, -0.5], hs: 2.2, zoom: 4.2, move: 0.88, snd: "sniper", tracer: 1, scope: true }
};
export const WEAPON_IDS = Object.keys(WEAPONS);

export const ITEMS = {
  plate: { name: "Armour plate", max: 5, col: "#7fd0ff" },
  bandage: { name: "Bandage", max: 6, heal: 25, time: 2.0, col: "#f2f2f2" },
  medkit: { name: "Med kit", max: 3, heal: 100, time: 4.5, col: "#ff6b6b" },
  frag: { name: "Frag grenade", max: 3, col: "#a4b06a" },
  smoke: { name: "Smoke grenade", max: 2, col: "#cfd6d9" },
  pickle: { name: "Golden pickle", max: 99, col: "#ffd166" }
};
export const PLATE_HP = 50, PLATE_TIME = 1.4, MAX_HP = 100;

// loot tier weights per POI tier (1 = outskirts .. 4 = compound)
export const LOOT_TIERS = {
  1: { rarity: [[0, 55], [1, 30], [2, 12], [3, 3], [4, 0]], kind: [["weapon", 28], ["ammo", 30], ["plate", 16], ["bandage", 12], ["medkit", 3], ["frag", 6], ["smoke", 5]] },
  2: { rarity: [[0, 35], [1, 35], [2, 20], [3, 8], [4, 2]], kind: [["weapon", 30], ["ammo", 28], ["plate", 18], ["bandage", 10], ["medkit", 4], ["frag", 6], ["smoke", 4]] },
  3: { rarity: [[0, 20], [1, 32], [2, 28], [3, 14], [4, 6]], kind: [["weapon", 32], ["ammo", 25], ["plate", 20], ["bandage", 9], ["medkit", 5], ["frag", 6], ["smoke", 3]] },
  4: { rarity: [[0, 0], [1, 15], [2, 35], [3, 32], [4, 18]], kind: [["weapon", 34], ["ammo", 22], ["plate", 22], ["bandage", 6], ["medkit", 8], ["frag", 6], ["smoke", 2]] }
};
export const WEAPON_WEIGHTS = [["warden", 14], ["marshal", 9], ["hornet", 13], ["vandal", 12], ["falcon", 14], ["kestrel", 11], ["breaker", 11], ["vigil", 6]];

// gas circle schedule: wait (s), shrink (s), radius at end (m), damage per second outside
export const GAS_STAGES = [
  { wait: 90, shrink: 60, r: 620, dps: 1 },
  { wait: 60, shrink: 45, r: 360, dps: 2 },
  { wait: 45, shrink: 40, r: 200, dps: 4 },
  { wait: 35, shrink: 35, r: 105, dps: 7 },
  { wait: 30, shrink: 30, r: 45, dps: 11 },
  { wait: 25, shrink: 30, r: 0, dps: 18 }
];
export const GAS_START_R = 1150;

export const CALLSIGNS = ["Viper", "Kestrel", "Nomad", "Rook", "Banshee", "Sable", "Tusk", "Wraith", "Juno", "Havoc", "Ember", "Mako", "Onyx", "Drift", "Cinder", "Quill",
  "Bishop", "Torque", "Rivet", "Gannet", "Lynx", "Pike", "Mosaic", "Sparrow", "Brick", "Halcyon", "Talon", "Saber", "Ghostline", "Flint", "Moth", "Ratchet"];

export const DIFFICULTY = {
  easy: { aimErr: 4.2, react: 0.85, spot: 70, burst: 3, track: 0.55, heal: 0.35, acc: 0.6 },
  normal: { aimErr: 2.6, react: 0.55, spot: 95, burst: 5, track: 0.8, heal: 0.45, acc: 0.8 },
  hard: { aimErr: 1.5, react: 0.32, spot: 120, burst: 7, track: 1.1, heal: 0.55, acc: 1.0 }
};

// radio chatter subtitles (Zone Nine control, the Dillion Group)
export const RADIO = {
  plane: ["Control: Zone Nine tournament is live. Contractors, stand by at the ramp.", "Pilot: Green light. Jump when ready.", "Control: The Dillion Group wishes you a profitable afternoon."],
  stage: ["Control: The zone is collapsing. Move to the marked area.", "Control: Gas is spreading. Rotate now.", "Control: Final zones. Keep your head down."],
  near: ["Control: Shots fired nearby.", "Control: Hostile contractors in your area."],
  kill: ["Control: Contractor eliminated.", "Control: Target down. Keep moving."],
  pickle: "Control: ...is that a golden pickle? Someone at head office has a sense of humour."
};
