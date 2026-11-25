/* ==========================================================================
   DILLY FORTRESS — Maps, Towers, Upgrades, Enemies & Wave Definitions
   A Dilly Gaming Original Tower Defense Strategy Game.
   ========================================================================== */

export const MAPS = [
  {
    id: 'alpine',
    name: 'Alpine Ridge',
    difficulty: 'Normal',
    desc: 'Winding snowy mountain pass with generous switchbacks and clear sightlines.',
    bg: '#131d27',
    pathColor: '#2a3746',
    pathEdge: '#475c73',
    accent: '#7dd3fc',
    startCash: 260,
    lives: 20,
    // Normalized waypoints (0..1 of 960x600 playfield)
    paths: [
      [
        [-0.02, 0.22], [0.22, 0.22], [0.22, 0.76], [0.48, 0.76],
        [0.48, 0.24], [0.76, 0.24], [0.76, 0.72], [1.02, 0.72]
      ]
    ],
    props: [
      { type: 'pine', x: 0.09, y: 0.48 }, { type: 'pine', x: 0.12, y: 0.62 },
      { type: 'pine', x: 0.35, y: 0.14 }, { type: 'pine', x: 0.36, y: 0.45 },
      { type: 'pine', x: 0.62, y: 0.56 }, { type: 'pine', x: 0.65, y: 0.86 },
      { type: 'pine', x: 0.89, y: 0.16 }, { type: 'pine', x: 0.90, y: 0.42 },
      { type: 'rock', x: 0.10, y: 0.85 }, { type: 'rock', x: 0.61, y: 0.12 },
    ]
  },
  {
    id: 'neon',
    name: 'Neon Crossroads',
    difficulty: 'Medium',
    desc: 'Dual cyber-highways converging onto a central choke point before the Citadel Core.',
    bg: '#0d0f1b',
    pathColor: '#1f2338',
    pathEdge: '#6366f1',
    accent: '#c084fc',
    startCash: 300,
    lives: 18,
    paths: [
      [[-0.02, 0.18], [0.30, 0.18], [0.30, 0.50], [0.70, 0.50], [0.70, 0.24], [1.02, 0.24]],
      [[-0.02, 0.82], [0.30, 0.82], [0.30, 0.50], [0.70, 0.50], [0.70, 0.76], [1.02, 0.76]]
    ],
    props: [
      { type: 'crystal', x: 0.14, y: 0.50 }, { type: 'crystal', x: 0.50, y: 0.20 },
      { type: 'crystal', x: 0.50, y: 0.80 }, { type: 'crystal', x: 0.86, y: 0.50 },
    ]
  },
  {
    id: 'obsidian',
    name: 'Obsidian Citadel',
    difficulty: 'Hard',
    desc: 'Short, aggressive volcanic lane with high-pressure boss rushes and magma vents.',
    bg: '#180d0c',
    pathColor: '#311d1a',
    pathEdge: '#f97316',
    accent: '#f5b82e',
    startCash: 340,
    lives: 15,
    paths: [
      [[-0.02, 0.50], [0.24, 0.50], [0.24, 0.18], [0.58, 0.18], [0.58, 0.82], [0.84, 0.82], [0.84, 0.48], [1.02, 0.48]]
    ],
    props: [
      { type: 'lava', x: 0.12, y: 0.20 }, { type: 'lava', x: 0.41, y: 0.52 },
      { type: 'lava', x: 0.72, y: 0.24 }, { type: 'rock', x: 0.12, y: 0.82 },
      { type: 'rock', x: 0.92, y: 0.82 }
    ]
  }
];

export const TOWERS = {
  vulcan: {
    id: 'vulcan', name: 'Twin Vulcan', icon: '🔫', cost: 60,
    color: '#94a3b8', accent: '#f5b82e',
    range: 135, fireRate: 3.4, damage: 13, projSpeed: 540,
    desc: 'Rapid-fire kinetic turret. Reliable against all targets.',
    upgrades: [
      { cost: 55, dmgMult: 1.5, rateMult: 1.22, rangeAdd: 16, label: 'Heavy Barrels' },
      { cost: 110, dmgMult: 1.65, rateMult: 1.28, rangeAdd: 20, label: 'Hyper Gatling' }
    ]
  },
  cryo: {
    id: 'cryo', name: 'Cryo Spire', icon: '🧊', cost: 90,
    color: '#38bdf8', accent: '#bae6fd',
    range: 125, fireRate: 1.0, damage: 10, slow: 0.45, slowDur: 2.4, aoe: 125,
    desc: 'Emits frost shockwaves that chill and slow nearby enemies.',
    upgrades: [
      { cost: 75, dmgMult: 1.5, rateMult: 1.2, rangeAdd: 18, slowAdd: 0.12, label: 'Deep Freeze' },
      { cost: 135, dmgMult: 1.8, rateMult: 1.25, rangeAdd: 22, slowAdd: 0.10, label: 'Absolute Zero' }
    ]
  },
  mortar: {
    id: 'mortar', name: 'Mortar Cannon', icon: '💥', cost: 120,
    color: '#fb923c', accent: '#fed7aa',
    range: 175, fireRate: 0.68, damage: 46, splash: 68, projSpeed: 300,
    desc: 'Heavy artillery shells with wide splash damage for swarms.',
    upgrades: [
      { cost: 95, dmgMult: 1.55, rateMult: 1.15, rangeAdd: 20, splashAdd: 14, label: 'Cluster Shells' },
      { cost: 165, dmgMult: 1.75, rateMult: 1.22, rangeAdd: 24, splashAdd: 18, label: 'Thermobaric' }
    ]
  },
  tesla: {
    id: 'tesla', name: 'Tesla Arc', icon: '⚡', cost: 140,
    color: '#a855f7', accent: '#e9d5ff',
    range: 145, fireRate: 1.35, damage: 28, chains: 3,
    desc: 'Chaining lightning that arcs across multiple enemies & melts shields.',
    upgrades: [
      { cost: 110, dmgMult: 1.48, rateMult: 1.18, rangeAdd: 18, chainsAdd: 1, label: 'High Voltage' },
      { cost: 185, dmgMult: 1.68, rateMult: 1.24, rangeAdd: 20, chainsAdd: 2, label: 'Storm Coil' }
    ]
  },
  railgun: {
    id: 'railgun', name: 'Railgun Sniper', icon: '🎯', cost: 160,
    color: '#f43f5e', accent: '#fecdd3',
    range: 270, fireRate: 0.55, damage: 95, armorPierce: true,
    desc: 'Long-range rail beam that pierces armor and shreds bosses.',
    upgrades: [
      { cost: 130, dmgMult: 1.6, rateMult: 1.18, rangeAdd: 35, label: 'Depleted Slug' },
      { cost: 220, dmgMult: 1.8, rateMult: 1.25, rangeAdd: 45, label: 'Orbital Lance' }
    ]
  },
  brine: {
    id: 'brine', name: 'Dilly Brine Cannon', icon: '🥒', cost: 200,
    color: '#4ade80', accent: '#fef08a',
    range: 165, fireRate: 0.92, damage: 55, splash: 62, burnDps: 24, burnDur: 3.2, projSpeed: 340,
    desc: 'Signature Dilly Gaming super-tower! Acid brine barrels burn & melt armor.',
    upgrades: [
      { cost: 160, dmgMult: 1.55, rateMult: 1.2, rangeAdd: 18, splashAdd: 14, label: 'Extra Dill' },
      { cost: 260, dmgMult: 1.85, rateMult: 1.25, rangeAdd: 24, splashAdd: 18, label: 'Omega Pickle' }
    ]
  }
};

export const TOWER_ORDER = ['vulcan', 'cryo', 'mortar', 'tesla', 'railgun', 'brine'];

export const ENEMIES = {
  scout:   { name: 'Scout Drone', hp: 38, speed: 92, reward: 10, lives: 1, r: 10, color: '#38bdf8', armor: 0 },
  raider:  { name: 'Raider Bot', hp: 78, speed: 64, reward: 14, lives: 1, r: 12, color: '#fb7185', armor: 0.1 },
  swarm:   { name: 'Swarm Runner', hp: 26, speed: 112, reward: 7, lives: 1, r: 8, color: '#facc15', armor: 0 },
  shield:  { name: 'Shield Striker', hp: 115, shield: 75, speed: 62, reward: 22, lives: 1, r: 13, color: '#a855f7', armor: 0.1 },
  heavy:   { name: 'Armored Juggernaut', hp: 250, speed: 42, reward: 32, lives: 2, r: 16, color: '#f97316', armor: 0.35 },
  boss:    { name: '👑 Pickle Mech Boss', hp: 1350, shield: 300, speed: 34, reward: 180, lives: 5, r: 24, color: '#4ade80', armor: 0.25, boss: true }
};

export function buildWave(waveNum) {
  const scale = 1 + (waveNum - 1) * 0.20 + Math.max(0, waveNum - 10) * 0.16;
  const spawns = [];
  const pushGroup = (type, count, gap) => {
    for (let i = 0; i < count; i++) spawns.push({ type, gap, scale });
  };

  if (waveNum === 1) {
    pushGroup('scout', 8, 0.72);
  } else if (waveNum === 2) {
    pushGroup('scout', 6, 0.65);
    pushGroup('raider', 5, 0.85);
  } else if (waveNum === 3) {
    pushGroup('swarm', 14, 0.34);
    pushGroup('raider', 6, 0.75);
  } else if (waveNum === 4) {
    pushGroup('raider', 8, 0.68);
    pushGroup('shield', 5, 0.9);
  } else if (waveNum % 5 === 0) {
    // Boss Wave!
    const bosses = Math.max(1, Math.floor(waveNum / 10) + 1);
    pushGroup('swarm', 10 + waveNum, 0.28);
    pushGroup('heavy', 2 + Math.floor(waveNum / 5), 1.1);
    pushGroup('boss', bosses, 2.8);
    pushGroup('shield', 4 + Math.floor(waveNum / 3), 0.75);
  } else {
    pushGroup('scout', 5 + Math.floor(waveNum * 0.8), 0.45);
    pushGroup('raider', 5 + Math.floor(waveNum * 0.9), 0.58);
    if (waveNum >= 4) pushGroup('shield', 3 + Math.floor(waveNum * 0.5), 0.72);
    if (waveNum >= 6) pushGroup('heavy', 2 + Math.floor(waveNum * 0.45), 1.0);
    if (waveNum % 2 === 1) pushGroup('swarm', 10 + waveNum, 0.26);
  }
  return spawns;
}
