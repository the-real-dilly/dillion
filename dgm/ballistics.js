/* =====================================================================
   dgm/ballistics.js : hitscan + simple projectiles for Dilly Gone Mad.
   Pure math, no THREE: vectors are plain {x, y, z} objects (THREE.Vector3
   works too, it has the same fields). Node-testable.

   The game plugs its world in through a small interface:

     world.raycast(origin, dir, maxDist) -> array of hits sorted by t:
        { t, point:{x,y,z}, normal:{x,y,z}, material, thickness?, target?, zone?, collider? }
     ...or use makeSimpleWorld({ actors, colliders }) below, which builds
     that function from capsule actors and box/sphere/plane colliders.

   Hit records returned by hitscan():
     { target, zone, damage, point, normal, material, penetrated, impulse, distance, pellet }
   "target" is whatever object you passed as an actor (or the collider);
   the game maps records to NON-GORY reactions (stagger, downed, recover).
   ===================================================================== */
import { damageAt, offsetDir } from "./gunlogic.js";

/* ---------- materials ----------
   cost: penetration power used per metre of material (x thickness).
   stop: never penetrated. spark/decal hints for gunfx. */
export const MATERIALS = {
  glass:    { cost: 2,   thickness: 0.01, decal: "glass",    fx: "glass",  breaks: true },
  wood:     { cost: 18,  thickness: 0.04, decal: "wood",     fx: "wood" },
  drywall:  { cost: 6,   thickness: 0.1,  decal: "plaster",  fx: "dust" },
  plastic:  { cost: 8,   thickness: 0.03, decal: "plastic",  fx: "dust" },
  carbody:  { cost: 120, thickness: 0.008, decal: "metal",   fx: "spark" },
  metal:    { cost: 400, thickness: 0.02, decal: "metal",    fx: "spark" },
  concrete: { cost: 1e9, thickness: 0.3,  decal: "concrete", fx: "dust", stop: true },
  brick:    { cost: 1e9, thickness: 0.2,  decal: "concrete", fx: "dust", stop: true },
  dirt:     { cost: 1e9, thickness: 1,    decal: "dirt",     fx: "dirt", stop: true },
  water:    { cost: 1e9, thickness: 1,    decal: null,       fx: "water", stop: true },
  tyre:     { cost: 30,  thickness: 0.05, decal: "rubber",   fx: "dust" },
  person:   { cost: 4,   thickness: 0.3,  decal: null,       fx: "cloth" }, // non-gory: a cloth puff, never blood unless the game enables it
  default:  { cost: 60,  thickness: 0.05, decal: "concrete", fx: "dust" }
};
export function matInfo(m) { return MATERIALS[m] || MATERIALS.default; }

/* ---------- vector helpers ---------- */
const V = (x = 0, y = 0, z = 0) => ({ x, y, z });
const add = (a, b, s = 1) => V(a.x + b.x * s, a.y + b.y * s, a.z + b.z * s);
const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.hypot(a.x, a.y, a.z);
const norm = (a) => { const l = len(a) || 1; return V(a.x / l, a.y / l, a.z / l); };
export const vec = { V, add, sub, dot, len, norm };

/* ---------- primitive ray tests (return entry t and exit t) ---------- */
function rayAABB(o, d, min, max) {
  let t0 = -Infinity, t1 = Infinity, nAxis = 0, nSign = 0;
  for (const [k, i] of [["x", 0], ["y", 1], ["z", 2]]) {
    if (Math.abs(d[k]) < 1e-12) { if (o[k] < min[k] || o[k] > max[k]) return null; continue; }
    let a = (min[k] - o[k]) / d[k], b = (max[k] - o[k]) / d[k], s = -1;
    if (a > b) { const t = a; a = b; b = t; s = 1; }
    if (a > t0) { t0 = a; nAxis = i; nSign = s; }
    if (b < t1) t1 = b;
    if (t0 > t1) return null;
  }
  if (t1 < 0) return null;
  const n = V(); n[["x", "y", "z"][nAxis]] = nSign;
  return { t0: Math.max(0, t0), t1, normal: n, inside: t0 < 0 };
}
function raySphere(o, d, c, r) {
  const oc = sub(o, c), b = dot(oc, d), cc = dot(oc, oc) - r * r, h = b * b - cc;
  if (h < 0) return null;
  const s = Math.sqrt(h), t0 = -b - s, t1 = -b + s;
  if (t1 < 0) return null;
  const t = Math.max(0, t0);
  return { t0: t, t1, normal: norm(sub(add(o, d, t), c)) };
}
/* capsule segment a->b, radius r */
function rayCapsule(o, d, a, b, r) {
  const ba = sub(b, a), oa = sub(o, a);
  const baba = dot(ba, ba), bard = dot(ba, d), baoa = dot(ba, oa), rdoa = dot(d, oa), oaoa = dot(oa, oa);
  const A = baba - bard * bard, B = baba * rdoa - baoa * bard, C = baba * oaoa - baoa * baoa - r * r * baba;
  const h = B * B - A * C;
  let best = null;
  if (h >= 0 && A > 1e-12) {
    const t = (-B - Math.sqrt(h)) / A, y = baoa + t * bard;
    if (y > 0 && y < baba && t >= 0) { const p = add(o, d, t), q = add(a, ba, y / baba); best = { t0: t, normal: norm(sub(p, q)) }; }
  }
  if (!best) {
    for (const c of [a, b]) { const s = raySphere(o, d, c, r); if (s && (!best || s.t0 < best.t0)) best = { t0: s.t0, normal: s.normal }; }
  }
  if (!best) return null;
  best.t1 = best.t0 + r * 1.6; // thickness approximation for penetration
  return best;
}

/* ---------- actors: human capsule with zones ----------
   actor: { pos:{x,y,z} (feet), yaw (rad, 0 = facing +Z), height (default 1.8),
            alive (default true), downed?, ...anything the game needs }
   Zones are built from the height: head sphere, torso capsule, two leg capsules
   and two arm capsules. When downed the actor lies along its facing direction. */
export function actorZones(a) {
  const h = a.height || 1.8, s = h / 1.8, p = a.pos, yaw = a.yaw || 0;
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  // local (x right?, y up, z forward) -> world; rotation about Y
  const W = (x, y, z) => a.downed
    ? V(p.x + (x * cs + (y - 0.15) * sn), p.y + 0.18 + z * 0.3, p.z + (-x * sn + (y - 0.15) * cs))
    : V(p.x + x * cs + z * sn, p.y + y, p.z - x * sn + z * cs);
  return [
    { zone: "head", type: "sphere", c: W(0, 1.66 * s, 0.02), r: 0.12 * s },
    { zone: "torso", type: "capsule", a: W(0, 1.0 * s, 0), b: W(0, 1.42 * s, 0), r: 0.19 * s },
    { zone: "limb", type: "capsule", a: W(-0.1 * s, 0.1 * s, 0), b: W(-0.1 * s, 0.86 * s, 0), r: 0.085 * s },
    { zone: "limb", type: "capsule", a: W(0.1 * s, 0.1 * s, 0), b: W(0.1 * s, 0.86 * s, 0), r: 0.085 * s },
    { zone: "limb", type: "capsule", a: W(-0.27 * s, 0.85 * s, 0.03), b: W(-0.25 * s, 1.42 * s, 0), r: 0.055 * s },
    { zone: "limb", type: "capsule", a: W(0.27 * s, 0.85 * s, 0.03), b: W(0.25 * s, 1.42 * s, 0), r: 0.055 * s }
  ];
}
function rayActor(o, d, a, maxDist) {
  // broad phase: bounding sphere
  const h = a.height || 1.8, c = V(a.pos.x, a.pos.y + (a.downed ? 0.2 : h / 2), a.pos.z);
  if (!raySphere(o, d, c, a.downed ? h * 0.6 : h * 0.62)) return null;
  let best = null;
  for (const z of actorZones(a)) {
    const r = z.type === "sphere" ? raySphere(o, d, z.c, z.r) : rayCapsule(o, d, z.a, z.b, z.r);
    if (r && r.t0 <= maxDist && (!best || r.t0 < best.t0)) best = Object.assign(r, { zone: z.zone });
  }
  return best;
}

/**
 * makeSimpleWorld({ actors, colliders }) -> world with raycast().
 * colliders: { type: "box", min:{x,y,z}, max:{x,y,z}, material, thickness? (for penetration; defaults to the box depth along the ray) }
 *            { type: "sphere", c, r, material } | { type: "plane", y, material } (ground)
 * Arrays are live: push/pop actors and colliders whenever you like.
 */
export function makeSimpleWorld({ actors = [], colliders = [] } = {}) {
  return {
    actors, colliders,
    raycast(o, d, maxDist = 1000) {
      const hits = [];
      for (const a of actors) {
        if (a.alive === false || a.ignore) continue;
        const r = rayActor(o, d, a, maxDist);
        if (r) hits.push({ t: r.t0, point: add(o, d, r.t0), normal: r.normal, material: "person", thickness: Math.max(0.05, r.t1 - r.t0), target: a, zone: r.zone });
      }
      for (const c of colliders) {
        let r = null;
        if (c.type === "box") r = rayAABB(o, d, c.min, c.max);
        else if (c.type === "sphere") r = raySphere(o, d, c.c, c.r);
        else if (c.type === "plane") { if (Math.abs(d.y) > 1e-9) { const t = (c.y - o.y) / d.y; if (t >= 0) r = { t0: t, t1: t + 10, normal: V(0, d.y < 0 ? 1 : -1, 0) }; } }
        if (r && r.t0 <= maxDist) hits.push({ t: r.t0, point: add(o, d, r.t0), normal: r.normal, material: c.material || "default", thickness: c.thickness != null ? c.thickness : Math.max(0.005, r.t1 - r.t0), target: c.target || null, collider: c });
      }
      hits.sort((a, b) => a.t - b.t);
      return hits;
    }
  };
}

/**
 * hitscan(origin, dir, def, world, opts) -> { hits: [hit records], end:{x,y,z}, distance }
 * origin/dir: {x,y,z} (dir need not be normalised). def: a GUN_DEFS entry.
 * opts: { shooter (actor to ignore), maxPen (override def.penetration), pellet (index, informational) }
 * Penetration: the bullet carries def.penetration "power"; each surface costs
 * material.cost * thickness; damage after a surface scales with remaining power.
 * Stops at "stop" materials, at the first person whose zone absorbs it fully,
 * or when power runs out. Glass always lets the shot through (and breaks).
 */
export function hitscan(origin, dir, def, world, opts = {}) {
  const d = norm(dir), maxDist = def.range;
  const raw = world.raycast(origin, d, maxDist);
  const out = [];
  let power = opts.maxPen != null ? opts.maxPen : def.penetration, dmgMul = 1, end = add(origin, d, maxDist), dist = maxDist;
  const seen = new Set();
  for (const h of raw) {
    if (h.t > maxDist) break;
    if (opts.shooter && h.target === opts.shooter) continue;
    if (h.target && h.material === "person") { if (seen.has(h.target)) continue; seen.add(h.target); }
    const mi = matInfo(h.material);
    const thick = h.thickness != null ? h.thickness : mi.thickness;
    const isPerson = h.material === "person";
    const dmg = isPerson ? damageAt(def, h.t, h.zone) * dmgMul : def.damage * falloffMul(def, h.t) * dmgMul;
    const need = mi.stop ? Infinity : mi.cost * thick;
    const penetrated = !mi.stop && power > need;
    const imp = (def.impulse || 50) * dmgMul;
    out.push({
      target: h.target || null, zone: h.zone || null, damage: Math.round(dmg * 10) / 10, point: h.point, normal: h.normal,
      material: h.material, penetrated, impulse: V(d.x * imp, d.y * imp, d.z * imp), distance: h.t, pellet: opts.pellet || 0,
      breaks: !!mi.breaks, fx: mi.fx, decal: mi.decal, collider: h.collider || null
    });
    if (!penetrated) { end = h.point; dist = h.t; break; }
    const before = power; power -= need; dmgMul *= Math.max(0.15, power / before) * (isPerson ? 0.6 : 0.85);
  }
  return { hits: out, end, distance: dist };
}
function falloffMul(def, t) { return damageAt(def, t, "torso") / (def.damage || 1); }

/**
 * fireShot(origin, aimDir, fireEvent, def, world, opts) -> { pellets:[{dir, hits, end}], byTarget: Map(target -> {damage, zones[], hits[]}) }
 * Convenience: takes a "fire" event from createWeapon (with pellet offsets) and runs every pellet.
 */
export function fireShot(origin, aimDir, ev, def, world, opts = {}) {
  const a = norm(aimDir), pellets = [], byTarget = new Map();
  ev.pellets.forEach((off, i) => {
    const dd = offsetDir([a.x, a.y, a.z], off), dir = V(dd[0], dd[1], dd[2]);
    const r = hitscan(origin, dir, def, world, Object.assign({}, opts, { pellet: i }));
    pellets.push({ dir, hits: r.hits, end: r.end, distance: r.distance });
    for (const h of r.hits) if (h.target && h.material === "person") {
      let e = byTarget.get(h.target); if (!e) byTarget.set(h.target, (e = { damage: 0, zones: [], hits: [] }));
      e.damage += h.damage; e.zones.push(h.zone); e.hits.push(h);
    }
  });
  return { pellets, byTarget };
}

/* ---------- projectiles (grenades, launcher rounds, slow shells) ---------- */
/**
 * createProjectile({ pos, vel, gravity = 9.81, drag = 0.02, radius = 0.04, bounce = 0.35, friction = 0.6,
 *                    fuse = 3 (s, 0 = explode on first impact), owner })
 */
export function createProjectile(o) {
  return { pos: V(o.pos.x, o.pos.y, o.pos.z), vel: V(o.vel.x, o.vel.y, o.vel.z), gravity: o.gravity == null ? 9.81 : o.gravity, drag: o.drag == null ? 0.02 : o.drag,
    radius: o.radius || 0.04, bounce: o.bounce == null ? 0.35 : o.bounce, friction: o.friction == null ? 0.6 : o.friction, fuse: o.fuse == null ? 3 : o.fuse,
    age: 0, alive: true, bounces: 0, resting: false, owner: o.owner || null, def: o.def || null };
}
/**
 * stepProjectile(p, dt, world) -> array of events: { type: "bounce"|"impact"|"explode", point, normal, material, target }
 * Uses world.raycast on the swept segment (sub-stepped for stability).
 */
export function stepProjectile(p, dt, world) {
  const ev = [];
  if (!p.alive) return ev;
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  for (let i = 0; i < n && p.alive; i++) {
    p.age += h;
    if (!p.resting) {
      const sp = len(p.vel), dk = Math.max(0, 1 - p.drag * sp * h);
      p.vel = V(p.vel.x * dk, p.vel.y * dk - p.gravity * h, p.vel.z * dk);
      const step = len(p.vel) * h;
      if (step > 1e-6) {
        const dir = norm(p.vel);
        const hits = world.raycast(p.pos, dir, step + p.radius).filter((x) => !p.owner || x.target !== p.owner);
        if (hits.length) {
          const hit = hits[0];
          if (p.fuse <= 0) { p.pos = hit.point; ev.push({ type: "explode", point: hit.point, normal: hit.normal, material: hit.material, target: hit.target || null }); p.alive = false; break; }
          // reflect
          const nn = hit.normal, vn = dot(p.vel, nn);
          const vt = sub(p.vel, V(nn.x * vn, nn.y * vn, nn.z * vn));
          p.vel = add(V(vt.x * p.friction, vt.y * p.friction, vt.z * p.friction), nn, -vn * p.bounce);
          p.pos = add(hit.point, nn, p.radius * 1.01);
          p.bounces++;
          ev.push({ type: "bounce", point: hit.point, normal: nn, material: hit.material, speed: Math.abs(vn), target: hit.target || null });
          if (len(p.vel) < 0.6 && nn.y > 0.6) { p.resting = true; p.vel = V(); }
        } else p.pos = add(p.pos, p.vel, h);
      }
    }
    if (p.fuse > 0 && p.age >= p.fuse) { ev.push({ type: "explode", point: V(p.pos.x, p.pos.y, p.pos.z), normal: V(0, 1, 0), material: null, target: null }); p.alive = false; }
  }
  return ev;
}

/**
 * blast(center, def, world) -> [{ target, damage, impulse, distance }] for actors within def.radius
 * with a line-of-sight check (concrete/metal block it). Non-lethal stun in the default game rules.
 */
export function blast(center, def, world) {
  const out = [], R = def.radius || 5;
  for (const a of world.actors || []) {
    if (a.alive === false) continue;
    const c = V(a.pos.x, a.pos.y + 1.0, a.pos.z), dv = sub(c, center), dd = len(dv);
    if (dd > R) continue;
    const dir = norm(dv), los = world.raycast(center, dir, dd).filter((h) => h.material !== "person" && matInfo(h.material).stop);
    const k = los.length ? 0.35 : 1, dmg = damageAt(def, dd, "torso") * k, imp = (def.impulse || 300) * (1 - dd / R) * k;
    if (dmg > 0) out.push({ target: a, damage: Math.round(dmg), impulse: V(dir.x * imp, Math.abs(dir.y) * imp + imp * 0.4, dir.z * imp), distance: dd });
  }
  return out;
}

/** Throw velocity helper: aim direction + speed, with a slight upward loft. */
export function throwVelocity(dir, speed, loft = 0.18) {
  const d = norm(V(dir.x, dir.y + loft, dir.z));
  return V(d.x * speed, d.y * speed, d.z * speed);
}
