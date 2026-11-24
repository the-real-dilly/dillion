// Unit tests for the pure gun logic. Run: node dgm/guns.test.mjs
import { GUN_DEFS, GUN_ORDER, createWeapon, falloffAt, damageAt, offsetDir, modelAnchors, MODEL_FIX, DEG } from "./gunlogic.js";
import { hitscan, fireShot, makeSimpleWorld, createProjectile, stepProjectile, blast, actorZones, throwVelocity } from "./ballistics.js";

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("  ok  " + name); } catch (e) { fail++; console.log("  FAIL " + name + "\n       " + (e && e.stack || e).toString().split("\n").slice(0, 3).join("\n       ")); } };
const eq = (a, b, m = "") => { if (a !== b) throw new Error(`${m} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, m = "assertion failed") => { if (!c) throw new Error(m); };
const near = (a, b, e = 1e-6, m = "") => { if (Math.abs(a - b) > e) throw new Error(`${m} expected ~${b}, got ${a}`); };
const run = (w, sec, dt = 1 / 60) => { const shots = []; for (let s = 0; s < sec - 1e-9; s += dt) shots.push(...w.update(dt)); return shots; };
const BANNED = /\b(glock|beretta|colt|smith|wesson|sig|sauer|kalashnikov|ak-?47|m4|m16|ar-?15|uzi|mp5|mp7|p90|famas|aug|remington|mossberg|barrett|awp|desert eagle|ruger|walther|hk|heckler|fn)\b/i;

console.log("GUN_DEFS");
t("has at least 8 firearms incl. required classes", () => {
  const ids = Object.keys(GUN_DEFS); ok(ids.length >= 12, "count " + ids.length);
  const cls = new Set(ids.map((k) => GUN_DEFS[k].class));
  for (const c of ["pistol", "revolver", "smg", "rifle", "bullpup", "shotgun", "sniper", "grenade"]) ok(cls.has(c), "missing class " + c);
  ok(ids.filter((k) => GUN_DEFS[k].class === "smg").length >= 2, "2 smgs");
  ok(ids.filter((k) => ["rifle", "bullpup"].includes(GUN_DEFS[k].class)).length >= 2, "2 rifles");
  eq(GUN_ORDER.length, ids.length, "GUN_ORDER covers all");
});
t("names are fictional (no real brands/models)", () => { for (const k in GUN_DEFS) ok(!BANNED.test(GUN_DEFS[k].name + " " + GUN_DEFS[k].desc), "real-sounding name: " + GUN_DEFS[k].name); });
t("every def has stats, anchors and viewmodel sets", () => {
  for (const k in GUN_DEFS) {
    const d = GUN_DEFS[k];
    for (const f of ["damage", "rpm", "mag", "reserve", "range", "headMul", "moveMul", "penetration", "sound", "model", "pose"]) ok(d[f] != null, k + " missing " + f);
    for (const a of ["grip", "support", "muzzle", "eject", "eye", "front"]) ok(Array.isArray(d.anchors[a]) && d.anchors[a].length === 3, k + " anchor " + a);
    if (!d.throwable) ok(d.anchors.muzzle[2] > 0.04, k + " muzzle should be in front of the grip");
    ok(d.anchors.eye[1] >= 0, k + " eye line above grip");
    ok(d.viewmodel.hip && d.viewmodel.ads, k + " viewmodel");
    ok(Object.isFrozen(d), "frozen");
  }
});
t("model scale gives believable lengths", () => {
  const L = (id) => { const a = GUN_DEFS[id].anchors; return a.muzzle[2] - (a.stock ? a.stock[2] : Math.min(a.eye[2], 0) - 0.03); };
  ok(L("vespa9") > 0.15 && L("vespa9") < 0.25, "pistol " + L("vespa9"));
  ok(L("coyote") > 0.7 && L("coyote") < 1.0, "rifle " + L("coyote"));
  ok(L("longshot") > 1.0 && L("longshot") < 1.35, "sniper " + L("longshot"));
  ok(L("thunder12") > 0.85 && L("thunder12") < 1.15, "shotgun " + L("thunder12"));
});
t("ADS viewmodel puts the eye anchor on the view axis", () => {
  for (const k in GUN_DEFS) {
    const d = GUN_DEFS[k], p = d.viewmodel.ads.pos, e = d.anchors.eye;
    // R_y(PI) * e = (-ex, ey, -ez)
    near(p[0] - e[0], 0, 1e-3, k + " x"); near(p[1] + e[1], 0, 1e-3, k + " y"); near(p[2] - e[2], -d.ads.eyeRelief, 1e-3, k + " z");
  }
});

console.log("falloff / damage");
t("falloff interpolates and clamps", () => {
  const c = [[0, 1], [10, 1], [30, 0.5]];
  eq(falloffAt(c, 5), 1); near(falloffAt(c, 20), 0.75); eq(falloffAt(c, 100), 0.5); eq(falloffAt(c, -1), 1);
});
t("damageAt applies zone multipliers and range", () => {
  const d = GUN_DEFS.coyote;
  eq(damageAt(d, 10, "torso"), 30); eq(damageAt(d, 10, "head"), 60); eq(damageAt(d, 10, "limb"), 22.5); eq(damageAt(d, 999, "torso"), 0);
});

console.log("state machine");
t("semi: one shot per pull, respects rpm", () => {
  const w = createWeapon("vespa9", { seed: 1 }); let n = 0; w.on("fire", () => n++);
  w.pull(); eq(n, 1); run(w, 0.5); eq(n, 1, "holding does not refire");
  w.release(); w.pull(); w.release(); run(w, 0.3); eq(n, 2, "buffered second pull fires");
  eq(w.ammo, 13);
});
t("auto: fires at rpm while held (frame-rate independent)", () => {
  for (const dt of [1 / 144, 1 / 30, 1 / 8]) {
    const w = createWeapon("stingmp", { seed: 2 }); w.pull(); run(w, 1.0, dt); w.release();
    const fired = 30 - w.ammo; ok(fired >= 14 && fired <= 16, `900rpm for 1s at dt=${dt.toFixed(3)} fired ${fired}`);
  }
});
t("burst: fires exactly the burst count per pull", () => {
  const w = createWeapon("coyote", { seed: 3 }); w.setMode("burst"); eq(w.mode, "burst");
  w.pull(); run(w, 0.5); w.release(); eq(30 - w.ammo, 3); w.pull(); w.release(); run(w, 0.6); eq(30 - w.ammo, 6);
});
t("dry fire then auto-reload when empty", () => {
  const w = createWeapon("mule", { seed: 4 }); const ev = []; w.on("*", (e) => ev.push(e.type));
  w.tap(); run(w, 0.3); w.tap(); run(w, 0.3); eq(w.ammo, 0); ok(ev.includes("empty"));
  w.tap(); ok(ev.includes("dryFire")); ok(ev.includes("reloadStart")); eq(w.state, "reloading");
  run(w, 2.0); eq(w.ammo, 2); eq(w.reserve, 22); ok(ev.includes("magOut") && ev.includes("magIn") && ev.includes("reloadEnd"));
});
t("tactical reload keeps one in the chamber; empty reload does not", () => {
  const w = createWeapon("coyote", { seed: 5 }); w.ammo = 10; w.reload(); eq(w.reloadKind, "tactical"); run(w, 2.2); eq(w.ammo, 31); eq(w.reserve, 120 - 21);
  const e = createWeapon("coyote", { seed: 5 }); e.ammo = 0; e.reload(); eq(e.reloadKind, "empty"); run(e, 2.0); eq(e.state, "reloading", "empty reload slower"); run(e, 0.7); eq(e.ammo, 30);
});
t("reload limited by reserve and denied when full / no reserve", () => {
  const w = createWeapon("vespa9", { reserve: 3 }); w.ammo = 0; w.reload(); run(w, 2); eq(w.ammo, 3); eq(w.reserve, 0);
  let why = null; w.on("reloadDenied", (e) => (why = e.reason)); w.ammo = 1; ok(!w.reload()); eq(why, "noReserve");
  const f = createWeapon("vespa9"); f.on("reloadDenied", (e) => (why = e.reason)); ok(!f.reload()); eq(why, "full");
});
t("shell reload loads one at a time and is interruptible by the trigger", () => {
  const w = createWeapon("thunder12", { seed: 6 }); let shells = 0; w.on("shellIn", () => shells++);
  w.ammo = 2; w.reload(); run(w, 0.35 + 0.48 * 2 + 0.05); eq(shells, 2); eq(w.ammo, 4);
  w.pull(); eq(w.state, "ready", "trigger interrupts"); ok(w.ammo === 3, "and fires: " + w.ammo);
});
t("shotgun fires pellets inside the cone", () => {
  const w = createWeapon("thunder12", { seed: 7 }); let e = null; w.on("fire", (x) => (e = x)); w.pull();
  eq(e.pellets.length, 8); const max = (GUN_DEFS.thunder12.spread.pellet + GUN_DEFS.thunder12.spread.hip + 0.01) * DEG;
  for (const [a, b] of e.pellets) ok(Math.hypot(a, b) <= max, "pellet outside cone");
});
t("pump action emits a cycle event after each shot", () => {
  const w = createWeapon("thunder12"); let c = 0; w.on("cycle", () => c++); w.tap(); run(w, 0.5); eq(c, 1);
});
t("spread: ADS < hip < moving, bloom grows and recovers", () => {
  const w = createWeapon("coyote", { seed: 8 }); const hip = w.spread;
  w.setADS(true); run(w, 0.5); ok(w.adsBlend === 1); ok(w.spread < hip, "ads tighter"); w.setADS(false); run(w, 0.5);
  w.setMoving(1); ok(w.spread > hip, "moving wider"); w.setMoving(0);
  w.pull(); run(w, 0.4); w.release(); const bloomed = w.spread; ok(bloomed > hip, "bloom"); run(w, 1.5); near(w.spread, hip, 1e-4, "recovered");
});
t("recoil accumulates upward, recovers, and consumeRecoil returns deltas that sum to zero", () => {
  const w = createWeapon("jackal", { seed: 9 }); let total = 0;
  w.pull(); for (let i = 0; i < 30; i++) { w.update(1 / 30); total += w.consumeRecoil().pitch; } w.release();
  ok(total > 5 * DEG, "kicked up " + total / DEG); ok(w.recoilPitch > 0);
  for (let i = 0; i < 120; i++) { w.update(1 / 30); total += w.consumeRecoil().pitch; }
  ok(Math.abs(total) < 0.05 * DEG, "returns to the start: " + total / DEG);
});
t("ADS blends and changes fov target", () => {
  const w = createWeapon("longshot"); w.setADS(true); run(w, 0.1); ok(w.adsBlend > 0 && w.adsBlend < 1); run(w, 0.5); near(w.fov, 16, 1e-6);
});
t("equip / holster timings block firing", () => {
  const w = createWeapon("coyote", { startEquipped: false }); let n = 0; w.on("fire", () => n++);
  w.pull(); eq(n, 0); w.release(); w.equip(); eq(w.state, "equipping"); run(w, 0.3); w.tap(); run(w, 0.1); eq(n, 0, "still equipping"); run(w, 0.4); eq(w.state, "ready"); w.tap(); eq(n, 1);
  w.holster(); run(w, 0.5); eq(w.state, "holstered");
});
t("jams (optional) block until reload clears them", () => {
  const w = createWeapon("stingmp", { jams: true, seed: 11 }); let jam = 0; w.on("jam", () => jam++);
  const d = Object.assign({}, GUN_DEFS.stingmp, { jamChance: 1 }); const j = createWeapon(d, { jams: true });
  j.pull(); eq(j.state, "jammed"); j.release(); j.reload(); run(j, 0.8); eq(j.state, "ready");
});
t("addAmmo clamps to maxReserve", () => { const w = createWeapon("vespa9"); eq(w.addAmmo(9999), 210 - 60); eq(w.reserve, 210); });
t("deterministic with a seed", () => {
  const a = createWeapon("coyote", { seed: 42 }), b = createWeapon("coyote", { seed: 42 }); const ea = [], eb = [];
  a.on("fire", (e) => ea.push(e.pellets[0])); b.on("fire", (e) => eb.push(e.pellets[0])); a.pull(); b.pull(); run(a, 0.5); run(b, 0.5);
  eq(JSON.stringify(ea), JSON.stringify(eb));
});

console.log("ballistics");
const person = (x, z, extra = {}) => Object.assign({ pos: { x, y: 0, z }, yaw: 0, height: 1.8, name: "dummy" + x }, extra);
t("offsetDir keeps unit length and small angles", () => {
  const d = offsetDir([0, 0, 1], [0.1, 0]); near(Math.hypot(...d), 1); near(Math.atan2(d[0], d[2]), -0.1, 1e-6, "yaw to the right is -x when facing +z");
  const u = offsetDir([0, 0, 1], [0, 0.1]); ok(u[1] > 0, "pitch up");
});
t("hitscan zones: head / torso / limb", () => {
  const a = person(0, 10), w = makeSimpleWorld({ actors: [a] }), d = GUN_DEFS.coyote;
  eq(hitscan({ x: 0, y: 1.66, z: 0 }, { x: 0, y: 0, z: 1 }, d, w).hits[0].zone, "head");
  eq(hitscan({ x: 0, y: 1.2, z: 0 }, { x: 0, y: 0, z: 1 }, d, w).hits[0].zone, "torso");
  eq(hitscan({ x: 0.1, y: 0.4, z: 0 }, { x: 0, y: 0, z: 1 }, d, w).hits[0].zone, "limb");
  eq(hitscan({ x: 0.6, y: 1.2, z: 0 }, { x: 0, y: 0, z: 1 }, d, w).hits.length, 0, "miss");
});
t("head damage > torso damage > limb damage", () => {
  const a = person(0, 10), w = makeSimpleWorld({ actors: [a] }), d = GUN_DEFS.vespa9;
  const h = hitscan({ x: 0, y: 1.66, z: 0 }, { x: 0, y: 0, z: 1 }, d, w).hits[0].damage, b = hitscan({ x: 0, y: 1.2, z: 0 }, { x: 0, y: 0, z: 1 }, d, w).hits[0].damage, l = hitscan({ x: 0.1, y: 0.4, z: 0 }, { x: 0, y: 0, z: 1 }, d, w).hits[0].damage;
  ok(h > b && b > l, `${h} ${b} ${l}`);
});
t("glass is penetrated, concrete stops, rifle beats pistol through a car door", () => {
  const glass = { type: "box", min: { x: -1, y: 0, z: 5 }, max: { x: 1, y: 2, z: 5.01 }, material: "glass" };
  const door = { type: "box", min: { x: -1, y: 0, z: 6 }, max: { x: 1, y: 2, z: 6.008 }, material: "carbody" };
  const wall = { type: "box", min: { x: -1, y: 0, z: 20 }, max: { x: 1, y: 3, z: 20.3 }, material: "concrete" };
  const a = person(0, 8), w = makeSimpleWorld({ actors: [a], colliders: [glass, door, wall] });
  const o = { x: 0, y: 1.2, z: 0 }, dir = { x: 0, y: 0, z: 1 };
  const r = hitscan(o, dir, GUN_DEFS.coyote, w); eq(r.hits[0].material, "glass"); ok(r.hits[0].penetrated); ok(r.hits[0].breaks);
  eq(r.hits[1].material, "carbody"); ok(r.hits[1].penetrated, "rifle through door"); eq(r.hits[2].target, a); ok(r.hits[2].damage < 30, "reduced after penetration");
  const p = hitscan(o, dir, GUN_DEFS.vespa9, w); eq(p.hits[1].material, "carbody"); ok(p.hits[1].penetrated, "9mm-class through thin sheet metal (power 1 > 0.96)");
  const h = hitscan(o, dir, GUN_DEFS.hornet45, w);
  const sg = hitscan(o, dir, GUN_DEFS.mule, w); ok(!sg.hits[1].penetrated, "buckshot stopped by the door");
  a.alive = false; const z = hitscan(o, dir, GUN_DEFS.longshot, w); eq(z.hits[z.hits.length - 1].material, "concrete"); ok(!z.hits[z.hits.length - 1].penetrated); near(z.distance, 20, 1e-6);
});
t("rifle over-penetrates one person, pistol does not", () => {
  const a = person(0, 10), b = person(0, 12), w = makeSimpleWorld({ actors: [a, b] }), o = { x: 0, y: 1.2, z: 0 }, d = { x: 0, y: 0, z: 1 };
  const r = hitscan(o, d, GUN_DEFS.longshot, w); eq(r.hits.length, 2); ok(r.hits[1].damage < r.hits[0].damage);
  const p = hitscan(o, d, GUN_DEFS.vespa9, w); eq(p.hits.length, 1);
});
t("falloff reduces damage at range; out of range returns nothing", () => {
  const near1 = makeSimpleWorld({ actors: [person(0, 5)] }), far = makeSimpleWorld({ actors: [person(0, 40)] }), o = { x: 0, y: 1.2, z: 0 }, d = { x: 0, y: 0, z: 1 };
  ok(hitscan(o, d, GUN_DEFS.thunder12, far).hits[0].damage < hitscan(o, d, GUN_DEFS.thunder12, near1).hits[0].damage);
  eq(hitscan(o, d, GUN_DEFS.mule, makeSimpleWorld({ actors: [person(0, 60)] })).hits.length, 0);
});
t("shooter is ignored; impulse points along the shot", () => {
  const me = person(0, 0), a = person(0, 10), w = makeSimpleWorld({ actors: [me, a] });
  const r = hitscan({ x: 0, y: 1.5, z: 0 }, { x: 0, y: 0, z: 1 }, GUN_DEFS.vespa9, w, { shooter: me }); eq(r.hits[0].target, a); ok(r.hits[0].impulse.z > 0);
});
t("fireShot aggregates shotgun pellets per target", () => {
  const a = person(0, 4), w = makeSimpleWorld({ actors: [a] }), wp = createWeapon("thunder12", { seed: 3 }); let ev; wp.on("fire", (e) => (ev = e)); wp.pull();
  const r = fireShot({ x: 0, y: 1.2, z: 0 }, { x: 0, y: 0, z: 1 }, ev, GUN_DEFS.thunder12, w);
  eq(r.pellets.length, 8); const e = r.byTarget.get(a); ok(e && e.hits.length >= 5, "most pellets hit at 4 m: " + (e && e.hits.length)); ok(e.damage > 60);
});
t("downed actors lie on the ground (zones low)", () => { for (const z of actorZones(person(0, 0, { downed: true }))) ok((z.c || z.a).y < 0.6); });
t("projectile: grenade arcs, bounces on the ground and explodes on its fuse", () => {
  const w = makeSimpleWorld({ colliders: [{ type: "plane", y: 0, material: "concrete" }] });
  const g = createProjectile({ pos: { x: 0, y: 1.5, z: 0 }, vel: throwVelocity({ x: 0, y: 0, z: 1 }, 12), fuse: 3 });
  const ev = []; for (let i = 0; i < 200 && g.alive; i++) ev.push(...stepProjectile(g, 1 / 60, w));
  ok(ev.some((e) => e.type === "bounce"), "bounced"); const ex = ev.find((e) => e.type === "explode"); ok(ex, "exploded"); ok(g.pos.y >= -0.01, "above ground");
  ok(g.pos.z > 5 && g.pos.z < 40, "travelled " + g.pos.z); near(g.age, 3, 0.02);
});
t("projectile: impact fuse explodes on first contact", () => {
  const w = makeSimpleWorld({ colliders: [{ type: "box", min: { x: -2, y: 0, z: 10 }, max: { x: 2, y: 4, z: 11 }, material: "concrete" }] });
  const g = createProjectile({ pos: { x: 0, y: 1.5, z: 0 }, vel: { x: 0, y: 2, z: 45 }, fuse: 0 }); let ex = null;
  for (let i = 0; i < 60 && g.alive; i++) for (const e of stepProjectile(g, 1 / 60, w)) if (e.type === "explode") ex = e;
  ok(ex); near(ex.point.z, 10, 0.05);
});
t("blast hits actors in radius, blocked partly by cover", () => {
  const a = person(2, 0), b = person(0, 3), c = person(20, 0);
  const wall = { type: "box", min: { x: -1, y: 0, z: 1.2 }, max: { x: 1, y: 3, z: 1.5 }, material: "concrete" };
  const w = makeSimpleWorld({ actors: [a, b, c], colliders: [wall] }); const r = blast({ x: 0, y: 0.3, z: 0 }, GUN_DEFS.pineapple, w);
  const da = r.find((x) => x.target === a), db = r.find((x) => x.target === b);
  ok(da && db && !r.find((x) => x.target === c)); ok(db.damage < da.damage, "cover reduces");
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
