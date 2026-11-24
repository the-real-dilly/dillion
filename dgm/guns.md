# DGM firearms modules

Real (fictional-brand) firearms for **Dilly Gone Mad**: weapon stats, a pure-logic weapon state machine, hitscan/projectile ballistics, PBR gun models from `assets/guns/` (Quaternius, CC0), pooled effects and synthesised audio. No gore: hits on people produce a grey cloth puff and a hit record; the game decides the (non-gory) reaction.

| File | THREE? | What |
|---|---|---|
| `dgm/gunlogic.js` | no | `GUN_DEFS`, `GUN_ORDER`, `createWeapon()`, damage/falloff helpers, model anchors. Node-safe. |
| `dgm/ballistics.js` | no | `hitscan()`, `fireShot()`, `makeSimpleWorld()`, materials + penetration, projectiles, `blast()`. Node-safe. |
| `dgm/guns.js` | yes | Re-exports both of the above, plus `loadGunModel()`, materials, `poseViewmodel()`, `placeThirdPerson()`, `solveArmIK()`, `handTargets()`. |
| `dgm/gunfx.js` | yes | `createGunFX()` (muzzle flash, tracers, casings, mags, decals, particles, explosions), `createCameraShake()`, `createCrosshair()`. |
| `dgm/gunaudio.js` | no (WebAudio) | `createGunAudio()`: gunshots, reloads, tinkles, whizz-bys, impacts, explosions, all synthesised. |
| `dgm/guns.test.mjs` | no | `node dgm/guns.test.mjs` (35 unit tests). |
| `dgm/test-guns.html` | - | Shooting range with all weapons, `window.GT` hooks. Open `/dgm/test-guns.html` (`?gun=longshot`, `?q=low`, `?tp=1`). |

All modules import THREE by the bare specifier `three` (the game's import map resolves it) and reference assets relative to `import.meta.url`, so they work under a GitHub Pages sub-path with no build step.

## Conventions

* Units are metres and seconds. Angles are radians unless the field name says `Deg` or the stat is documented as degrees (spread and recoil stats in `GUN_DEFS` are degrees, everything the state machine returns is radians).
* **Gun-local space**: +Z points out of the muzzle, +Y is up, -X is the gun's right side (ejection side), and the origin is the centre of the right-hand grip (where the palm wraps). A gun with identity rotation points the same way as an avatar root that faces +Z, so `avatar.add(gun)` and `placeThirdPerson()` need no extra rotation.
* Vectors in `gunlogic`/`ballistics` are plain `{x, y, z}` objects (a `THREE.Vector3` also works). `gunfx` accepts either.
* Colours assume `THREE.ColorManagement.legacyMode = false`, which is what the game already sets.

## `GUN_DEFS` (gunlogic.js)

14 weapons, ordered by `GUN_ORDER`:

| id | Name | Class | Model | Modes | Notes |
|---|---|---|---|---|---|
| `vespa9` | Vespa 9 | pistol | Pistol_1 | semi | 15 rounds, quick |
| `hornet45` | Hornet .45 | pistol | Pistol_3 | semi | 8 rounds, heavy |
| `bullhorn6` | Bullhorn Six | revolver | Revolver_1 | semi | 6 rounds, no casings |
| `stingmp` | Sting MP | smg | SubmachineGun_1 | auto, semi | 900 rpm |
| `wasppdw` | Wasp PDW | smg | SubmachineGun_3 | auto, burst, semi | stock + vertical grip |
| `coyote` | Coyote AR | rifle | AssaultRifle2_1 | auto, burst, semi | all-rounder |
| `jackal` | Jackal Carbine | rifle | AssaultRifle_1 | auto, semi | hard-hitting, kicks |
| `mantis` | Mantis BP | bullpup | Bullpup_1 | auto, burst, semi | added reflex sight |
| `thunder12` | Thunder 12 | shotgun | Shotgun_1 | pump | 8 pellets, shell-by-shell reload |
| `mule` | Mule Double | shotgun | Shotgun_SawedOff | semi | 2 shots, 9 pellets |
| `longshot` | Longshot | sniper | SniperRifle_1 | bolt | scope, 16° ADS FOV |
| `wraith` | Wraith DMR | dmr | SniperRifle_3 | semi | suppressed |
| `pineapple` | Pineapple | grenade | procedural | throw | stun grenade, 3 s fuse |
| `thumper` | Thumper | launcher | procedural | semi | impact stun round |

Each def is frozen and has:

* stats: `damage`, `headMul`, `limbMul`, `falloff` (`[[metres, multiplier], ...]`, linear between points), `range`, `rpm`, `modes`, `burst {count, rpm, delay}`, `pellets`, `mag`, `reserve`, `maxReserve`, `chamber` (+1 on tactical reload), `reload {type: "mag"|"shell", tactical, empty, start, shell, end}`, `spread {hip, ads, move, bloom, maxBloom, recover, pellet}` (degrees), `recoil {v, h, hBias, rise, riseCap, recover, adsMul, shake}` (degrees per shot), `ads {fov, time, scope: false|"reflex"|"scope", eyeRelief}`, `moveMul`, `equipTime`, `holsterTime`, `penetration` (power, see ballistics), `impulse`, `velocity` (tracer speed), `tracerEvery`, `jamChance`, `action` (`auto`, `pump`, `bolt`, `throw`, `projectile`), `cycleDelay`, grenade-only `fuse`, `throwSpeed`, `projectileSpeed`, `radius`.
* presentation: `name`, `desc`, `class`, `slot` (weapon-wheel group: `handgun`, `smg`, `rifle`, `shotgun`, `sniper`, `throwable`, `heavy`), `sound` (class for gunaudio), `casing` (`"pistol"`, `"rifle"`, `"shell"` or `null`), `model`, `pose` (`pistol`, `smg`, `rifle`, `bullpup`, `shotgun`, `sniper`, `throw`).
* `anchors` (gun-local `[x, y, z]` metres): `grip` (origin, right palm), `support` (left hand: handguard/foregrip/pump, or cupping the grip for pistols), `muzzle`, `eject`, `eye` (rear sight / optic eye point), `front` (front sight), `trigger`, `magWell`, `stock` (butt, or null), and `gripTilt` (rad the grip leans back).
* `viewmodel`: `{ hip: {pos, rot}, ads: {pos, rot}, fov, sway }`, the gun transform in camera space (camera looks down -Z). `ads.pos` puts the `eye` anchor on the view axis `eyeRelief` metres in front of the camera. Pair it with `viewmodel.fov` (58° vertical) as the un-zoomed camera FOV.
* `thirdPerson`: `{ gripAt, shoulderAt, twoHanded, supportOnGrip, lowReady {pitch, yaw} }`, metres in avatar-root space (+Z forward) for a 1.8 m avatar, used by `placeThirdPerson()`.

Helpers: `falloffAt(curve, d)`, `damageAt(def, dist, zone)`, `offsetDir(dir, [yaw, pitch])`, `modelAnchors(model)`, `makeRng(seed)`.

## `createWeapon(def | id, opts)` (pure logic)

```js
import { createWeapon } from "./dgm/gunlogic.js";
const w = createWeapon("coyote", { seed: 1, ammo: 30, reserve: 120, jams: false, autoReload: true, infiniteReserve: false, startEquipped: true });
w.on("fire", (e) => { /* e.pellets: [[yawOff, pitchOff], ...] (rad), e.spread, e.recoil {pitch, yaw, shake}, e.tracer, e.ammo */ });
// per frame:
w.setTrigger(mouseDown); w.setADS(rightMouse); w.setMoving(speed01, crouched);
w.update(dt);                       // returns the fire events emitted during this step
const r = w.consumeRecoil();        // add r.pitch to camera pitch (up) and r.yaw to camera yaw; it also returns (recovers) by itself
camera.fov = w.fov;                 // hip FOV -> def.ads.fov while aiming (set w.viewFov to your base FOV)
```

* State: `w.state` is `holstered | equipping | ready | reloading | holstering | jammed`; `w.ammo`, `w.reserve`, `w.mode`, `w.adsBlend` (0..1), `w.spread` (current cone half-angle, rad), `w.recoilPitch/Yaw` (accumulated kick, for the viewmodel), `w.moveMul`, `w.reloadProgress`, `w.canFire`, `w.snapshot()`.
* Actions: `equip()`, `holster()`, `pull()`, `release()`, `tap()`, `reload()`, `cancelReload()`, `setMode(m)`, `cycleMode()`, `addAmmo(n)` (clamped to `maxReserve`, returns how many were taken).
* Fire modes: semi (one shot per pull, a pull during cooldown is buffered for 150 ms), auto (frame-rate independent, several shots per long frame), burst (exactly `burst.count` per pull), pump/bolt (rpm-limited + a `cycle` event after `cycleDelay`), throw.
* Reloads: magazine (tactical keeps one in the chamber, empty is slower, `magOut` at 30 %, `magIn` at 70 %) and shell-by-shell (`shellIn` per shell, interruptible by pulling the trigger). Dry fire auto-starts a reload when `autoReload`.
* Events (`w.on(name, fn)`, or `"*"` for all): `equip, equipped, holster, holstered, fire, dryFire, empty, reloadStart {kind, time}, magOut, magIn, shellIn, reloadEnd {kind, interrupted}, reloadDenied {reason}, cycle {reload?}, jam, unjam, modeChange, adsChange`.
* Spread = lerp(hip, ads, adsBlend) + move penalty + bloom (bloom grows per shot, recovers when not firing). Recoil climbs with `rise` per shot in a spray, recovers exponentially at `recover`/s once the gun stops firing.
* Deterministic with `seed` (tests rely on this).

## Ballistics (ballistics.js)

```js
import { makeSimpleWorld, fireShot, hitscan } from "./dgm/ballistics.js";
const world = makeSimpleWorld({ actors: peds /* {pos:{x,y,z} feet, yaw, height, alive, downed} */, colliders: [{ type: "box", min, max, material: "carbody" }] });
const res = fireShot(eyePos, aimDir, fireEvent, def, world, { shooter: playerActor });
for (const [target, agg] of res.byTarget) { /* agg.damage, agg.zones, agg.hits */ }
res.pellets.forEach((p) => p.hits.forEach((h) => fx.impact(h, p.dir)));
```

* **Pluggable world**: anything with `raycast(origin, dir, maxDist)` returning all hits sorted by `t`: `{ t, point, normal, material, thickness?, target?, zone?, collider? }`. The game can wrap its own collision (buildings as boxes, cars as boxes with `material: "carbody"` and windows as `"glass"`, peds as capsule actors) or use `makeSimpleWorld()`.
* Actors get capsule zones from their height: `head` sphere, `torso` capsule, `limb` capsules (legs and arms). Downed actors lie flat. `actorZones(actor)` returns them.
* Hit record: `{ target, zone, damage, point, normal, material, penetrated, impulse, distance, pellet, breaks, fx, decal, collider }`.
* Materials (`MATERIALS`): `glass, wood, drywall, plastic, carbody, metal, concrete, brick, dirt, water, tyre, person, default`. Each costs `cost × thickness` penetration power. Defaults: pistols 1-2, rifles about 3, snipers 4-5. So pistols get through glass, drywall, thin wood and a car skin (barely); rifles also through a person and car doors; nothing goes through metal plate or concrete. Damage after a surface scales with the power left.
* Falloff and zone multipliers come from the def (`damageAt`). `fireShot` aggregates shotgun pellets per target.
* Projectiles: `createProjectile({pos, vel, fuse, bounce, drag, gravity, owner})`, `stepProjectile(p, dt, world)` returns `bounce` and `explode` events (fuse 0 = explode on impact), `blast(center, def, world)` gives damage + impulse per actor with a cover check, `throwVelocity(dir, speed)`.
* Suggested non-gory reactions (this is the game's call): damage under about 20 = flinch, a big hit or a head hit = stagger, health at 0 = **downed** (fall, lie for a few seconds, get up). The range page does exactly that in `reactDummy()`.

## Models (guns.js)

```js
import { loadGunModel, preloadGuns, poseViewmodel, placeThirdPerson, solveArmIK, handTargets } from "./dgm/guns.js";
const gun = await loadGunModel("coyote", { quality: "high" });   // cached, returns a new Group sharing geometry and materials
gun.userData.anchors.muzzle.getWorldPosition(v);                   // anchors are child Object3Ds named "anchor_<name>"
```

* Loads OBJ+MTL with the vendored loaders, converts to metres and gun-local axes, merges by material (5-6 draw calls per gun), creased normals (smooth curves, sharp edges), box-projected UVs, and replaces the flat MTL colours with shared PBR materials (`gunMaterials(quality)`): anodised aluminium, gunmetal, steel, polymer with stipple normal, knurled grips, walnut, olive polymer, coated lenses. High quality uses `MeshPhysicalMaterial` with clearcoat and normal/roughness maps, low uses plain `MeshStandardMaterial`.
* Extra detail: iron sights on the SMGs and the carbine, three-dot sights on pistols, a reflex sight with a glowing dot on the bullpup, a rail on the PDW, a bead on the pump shotgun, bolt knobs on the rifles. Grenade and launcher are built procedurally.
* About 0.5k to 1.5k triangles per gun.
* `poseViewmodel(gun, def, { ads, recoil, kick, sway:{x,y}, bob, t, reload })` places a gun parented to the camera.
* `setGunBasePath(url)` overrides where the OBJs are loaded from. `disposeGunCache()`, `disposeGunMaterials()` free memory.

## Effects (gunfx.js)

```js
import { createGunFX, createCameraShake, createCrosshair, spreadToPixels } from "./dgm/gunfx.js";
const fx = createGunFX(scene, { quality: "high", ground: (x, z) => groundH(x, z), bloodPuffs: false });
fx.onCasingBounce = (type, pos, speed) => audio.casing(type, { pos, speed });
// on fire:
const light = fx.muzzleFlash(muzzlePos, muzzleDir, def);  // returns {pos, color, intensity, distance, decay, ttl}; also drives a small internal PointLight pool (opts.light:false to disable)
fx.ejectCasing(gun);                                       // reads the eject anchor; or fx.ejectCasing(pos, rightDir, upDir, def)
fx.tracer(muzzlePos, hitPoint, { speed: def.velocity });
fx.impact(hitRecord, shotDir);                             // decal + particles by material (sparks, dust, wood chips, glass shards, cloth puff)
fx.explosion(pos, radius); fx.glassBurst(center, normal, w, h); fx.dropMag(pos, vel); fx.trail(pos, vel);
fx.update(dt, camera);                                     // once per frame
```

* Two instanced billboard batches (additive and alpha, velocity-stretched sparks), one instanced decal mesh (ring buffer, fades out), instanced rigid bits per type (casings, shells, mags, shards, chips, chunks) with gravity, ground bounce and rest, instanced tracers, six pooled muzzle-flash rigs. About 12 draw calls with everything active. Caps: `maxParticles`, `maxDecals`, `maxBits`, `maxTracers`.
* Decals are static: put them only on static geometry. For cars, skip `fx.decal` or parent your own.
* `createCameraShake()`: `add(trauma)`, `update(dt)` gives `{pitch, yaw, roll, x, y}`.
* `createCrosshair(container)`: `setSpread(px)`, `hit("hit"|"head"|"down")`, `scope("scope"|null)`, `setADS(a)`, `show(bool)`. Use `spreadToPixels(w.spread, camera, innerHeight)`.

## Audio (gunaudio.js)

```js
import { createGunAudio } from "./dgm/gunaudio.js";
const audio = createGunAudio({ ctx: existingAudioContext, destination: sfxBus, env: "street", maxVoices: 32 });
audio.unlock();                    // from a user gesture
audio.setListener(camera);         // each frame
audio.bindWeapon(w, () => null);   // the player's own gun: shots, dry fire, mag out/in, pump/bolt, shell in, equip
audio.shot(def, { pos });          // NPC gunfire: speed-of-sound delay, distance gain + low-pass, more reverb far away
audio.impact("metal", { pos }); audio.whizz({ pos: closestPoint, supersonic: true }); audio.casing("rifle", { pos, speed });
audio.explosion({ pos }); audio.setEnvironment("indoor" | "street" | "open" | "tunnel");
```

All sounds are layered noise and oscillators (crack, body, thump, mechanism, tail) through a generated-impulse-response reverb, with voice stealing and per-category caps. `closestOnSegment(a, b, p)` helps decide when to play a whizz-by (bullet path within about 2 m of the listener).

## Integrating into `dilly-gone-mad.html`

The game already has `WEAPONS` (15 comedy weapons), `WEP` state, `selectWeapon()`, `weaponFire()`, `updateWeaponMesh()` (parents a mesh to `AVA.hands[...]`), a weapon wheel and `AMMO` in `save.wep`. Suggested wiring, keeping everything that exists:

1. **Imports** (module script, the import map already maps `three`):
   ```js
   import { GUN_DEFS, GUN_ORDER, createWeapon, loadGunModel, fireShot, makeSimpleWorld, placeThirdPerson, solveArmIK, handTargets, poseViewmodel } from "./dgm/guns.js";
   import { createGunFX, createCameraShake, createCrosshair, spreadToPixels } from "./dgm/gunfx.js";
   import { createGunAudio } from "./dgm/gunaudio.js";
   ```
2. **Weapon wheel entries**: append one entry per id in `GUN_ORDER` to `WEAPONS`, e.g. `{ id: "coyote", name: GUN_DEFS.coyote.name, color: "#cfd6e0", real: true }`, and add `ICONS[id]` (a simple silhouette SVG per `slot` is enough). Keep `WI` derived from `WEAPONS` as now. Group the wheel by `def.slot` if you want GTA-style slots.
3. **Ammo**: add one `save.wep` field per id (`"ammo_" + id`, default `def.reserve`); keep live ammo in a `createWeapon()` per id (`ammo` + `reserve` from the save on load, written back on `reloadEnd`/`fire`). Pickups: `weapons[id].addAmmo(n)` (returns what was taken, for the toast); ammo crates of a `slot` can refill every gun of that slot. Use `def.mag` / `def.reserve` for the HUD.
4. **Selecting**: in `selectWeapon(i)`, when `WEAPONS[i].real`: `cur.holster()`, then `w.equip()`. `updateWeaponMesh()` should then attach the loaded gun (`await loadGunModel(id, { quality: Q.level })`, preload all at boot) instead of a `WMESH` entry, using `placeThirdPerson()` below rather than parenting to the hand.
5. **Holding with the existing avatar (two-handed IK)**: `AVA.shoulders/elbows/hands` are a joint chain (`shL -> elL -> handL`, same for R). Each frame on foot with a real gun:
   ```js
   AVA.root.add(gun);                                     // once, when equipped
   placeThirdPerson(gun, def, { pitch: aimPitch, yaw: 0, lowReady: aiming ? 0 : 1, scale: 1.8 / 1.8, recoil: { pitch: w.recoilPitch, yaw: w.recoilYaw }, kick });
   const T = handTargets(gun);
   solveArmIK(AVA.shoulders[1], AVA.elbows[1], AVA.hands[1], T.right, T.rightPole);   // right hand on the grip
   if (T.left) solveArmIK(AVA.shoulders[0], AVA.elbows[0], AVA.hands[0], T.left, T.leftPole); // left hand on the support anchor
   ```
   Call it after `avatarPose()` (which sets the arm rotations) and before `syncSkeleton()`, so the skinned mesh follows. Turn the torso/head toward the aim (`AVA.torso.rotation.y`, `AVA.head.rotation.x = -aimPitch`). `dgm/test-guns.html?tp=1` shows the same approach on `assets/characters/mannequin.glb` (Rigify `DEF-upper_arm.R / DEF-forearm.R / DEF-hand.R` bones). In the car, keep the current `seat` pose and either hide real guns or allow pistols/SMGs only (drive-by: aim yaw limited to the side window).
6. **Firing**: on each `fire` event, get the aim ray from the camera (third person: from the camera through the crosshair, then re-cast from the muzzle so walls between the gun and the target block it), run `fireShot()` against a world built from what the game already tracks: `peds`, `cops` and `traffic` as actors / car boxes (`material: "carbody"`, windows `"glass"`), buildings and props as boxes (`"concrete"`, `"wood"`, `"metal"`). Map hit records to the existing reactions: `damage` reduces health; downed peds use the existing ragdoll-free fall/flee states and get back up; cops raise heat (`addHeat`); cars take `hp` damage and windows can shatter via `fx.glassBurst`. Keep it non-gory: leave `bloodPuffs` off.
7. **Camera**: add `w.consumeRecoil()` to the camera orbit each frame, use `w.fov` (set `w.viewFov` to the game's FOV) when aiming, feed `createCameraShake()` output into the existing camera shake (or just `add(e.recoil.shake * 0.35)` to it). The existing `settings.shake` slider can scale the trauma.
8. **First person / aim-down-sights view** (optional): parent the gun to the camera and call `poseViewmodel()` each frame; show the existing avatar arms or the stand-in arms from the range page; hide the gun and show `crosshair.scope("scope")` when a scoped weapon's `adsBlend > 0.92`.
9. **Effects and audio**: one `createGunFX(scene, { quality: Q.level, ground: groundH })`, `fx.update(dt, camera)` in `tick()`. One `createGunAudio({ ctx: <the game's AudioContext>, destination: <the sfx gain> })` so the existing volume sliders apply; `audio.bindWeapon(w)` for the player's guns; `audio.shot(def, { pos })` for NPC gunfire (cops).
10. **Quality tier**: on `setQuality(level)`, reload guns with `{ quality: level }` (both tiers are cached) and recreate `createGunFX` with the new quality, or keep high geometry and only switch materials.

## Testing

* `node dgm/guns.test.mjs`: 35 tests (fire modes, frame-rate independence, burst, dry fire, tactical/empty/shell reloads, interruption, spread/bloom, recoil climb and recovery, ADS/FOV, equip timing, jams, ammo clamping, determinism, zones, damage ordering, penetration through glass/car doors/people, concrete stopping, falloff/range, pellet aggregation, downed zones, grenade bounce and fuse, impact fuse, blast with cover).
* `dgm/test-guns.html`: keyboard fallbacks (F/Space fire, X aim, R reload, B mode, 1-0 - = and Q/E weapons, arrows look, WASD move, V view, N night, L quality). `window.GT`: `pause()`, `step(sec)`, `select(id)`, `fire(n)`, `hold(sec)`, `shotFrame()`, `ads(on)`, `reload()`, `aimAt(dummyIndex | "panel:glass" | "gong", zone)`, `aim(yawDeg, pitchDeg)`, `night(on)`, `quality(q)`, `view("fp"|"tp")`, `inspect(id, yawDeg, pitchDeg)`, `lineup()`, `range()`, `hud(on)`, `state()`, `errors`.
