# Battle royale game plan (working title: **Pickle Zone**)

Status: **draft for discussion**. Nothing here is built yet.

A Warzone-style battle royale for the browser: drop onto a big map with a squad, loot up, fight, survive a shrinking safe zone, and be the last squad standing. This is the "replica" of the genre's *mechanics*. Names, art, maps, weapons and audio are all original (no Activision or Call of Duty assets, names or logos).

## 1. Decisions to make first

| Question | Options | Recommendation |
|---|---|---|
| **Tone** | (a) Realistic military, (b) Cartoon slapstick like Dilly Gone Mad | **(b) cartoon.** Matches Dillion, keeps it all-ages, reuses the existing weapons, avatar and effects, and is far easier to make look good with procedural art. People get "pickled" (knocked out of the match in a splat of brine) instead of killed. |
| **Players per match** | 100, 60, 32 | **32–40** for v1. A browser client and a small server handle this comfortably; scale up later. |
| **Squads** | solo, duos, trios, quads | Solos and trios first. |
| **Hosting** | Cloudflare Durable Objects, or a Node server (Colyseus on Fly.io) | **Node + Colyseus on Fly.io** for this game, because the server must run the simulation (see §4). The multiplayer plan's Cloudflare option is fine for the social game, but a shooter wants a real game loop. |
| **Where it lives** | New page `pickle-zone.html` sharing modules with Dilly Gone Mad | Yes. Needs the module split from the multiplayer plan first. |

## 2. Core gameplay loop

1. **Lobby:** a short countdown with practice range, emotes and squad invite link.
2. **Drop:** everyone rides a flying "pickle jar blimp" along a random line across the map, jumps when they like, then glides and opens a parachute.
3. **Loot:** weapons, ammo, armour plates, health snacks, gadgets and cash from crates, buildings and enemies. Rarity tiers by colour.
4. **The Zone:** a safe circle that shrinks in stages. Outside it, a rising **brine tide** damages you. The circle is shown on the map and the minimap.
5. **Fight:** gunplay (aim, recoil, reload), movement (sprint, slide, jump, mantle), vehicles (reuse the car physics), building-clearing.
6. **Contracts and cash:** optional side missions (bounty, scavenger hunt, recon) that pay cash, used at **buy stations** for supplies and a squad **respawn**.
7. **The Jar (second chance):** when you're downed twice you get sent to a 1v1 mini-arena. Win and you're back in the match. Needs a second player with the same status, or a bot when none is waiting.
8. **Finale:** the zone closes to a tiny circle. Last squad standing wins. Show a results screen with stats, cash and cosmetic unlocks.

## 3. Map

- A **~2 × 2 km** island split into named districts (downtown, port, airfield, farmland, hills with a dam, a stadium, a resort). Reuse the road graph and chunk streaming being built for Dilly Gone Mad's massive city.
- Hand-authored **points of interest** with consistent loot tiers, over procedurally generated filler.
- A **seed** per match so the loot and crate positions are deterministic and server-verified.
- Verticality: rooftops, zip-lines and rooftop helipads, elevators, and a few big landmarks that make navigation easy.
- Water for boats and jet skis.

## 4. Technical design

**Authoritative server.** In a shooter with prizes, the clients can't be trusted. The server runs the match simulation at **20–30 Hz** (positions, bullets, damage, loot, zone) and sends snapshots; clients predict their own movement and reconcile.

| Piece | Approach |
|---|---|
| **Movement** | Client-side prediction with server reconciliation. Shared movement code runs on both sides. |
| **Shooting** | Server-side hit detection using lag compensation (rewind other players' positions by the shooter's latency, capped at about 150 ms). Hitscan for most guns; simulated projectiles for slow ones. |
| **Interest management** | Only send each client the players, loot and vehicles near them. Keeps bandwidth low at 32–40 players. |
| **Snapshots** | Compact binary messages (delta-compressed), about 10–20 KB/s per client. |
| **Vehicles** | Driver is authoritative for their own vehicle; others interpolate. Seats are server-managed. |
| **Bots** | The same server code can run bots to fill lobbies. This also makes a solo practice mode and lets us test without 30 real people. |
| **Anti-cheat** | Server authority covers most. Add input rate-limits, movement-speed validation and report/mute. Honestly, a browser game can't stop all cheating; the aim is "good enough for a friendly community". |
| **Matchmaking** | Start with a room list and invite links; later a simple queue by player count. |

**Client.** Reuse Three.js, the post-processing pipeline, avatar rig, weapons code, HUD and audio from Dilly Gone Mad. New work: first-person and third-person shooter camera (toggle), recoil and spread model, hit markers and directional damage indicators, inventory UI, gulag/jar arena, and the zone visuals.

**Performance.** About 60 fps at 40 players in view range, using the existing LOD and instancing. Draw-call budgets per chunk. The automatic quality drop stays.

## 5. Weapons and gear (original, cartoon, three ammo-themed families)

- **Splash:** water pistols, SMG-style water blasters, a hose-cannon "LMG", a pressure-washer "sniper".
- **Kitchen:** potato cannon (launcher), pie launcher, tennis-ball machine, a "baguette" melee.
- **Party:** confetti bazooka, glitter grenade, whoopee mine, banana-peel trap, bubble gun.
- **Gear:** armour plates (jelly plates), a "pickle juice" heal, a squad-revive horn, tactical gadgets (smoke made of fog, a decoy balloon, a UAV drone), plus perks.

Rarity: common → uncommon → rare → epic → legendary. Attachments (scope, grip, bigger tank, faster pump).

"Elimination" is always cartoonish: hit points drain, the character is **pickled** (a goofy splat and a ghost-pickle that floats up), and teammates can revive from a short window. No blood, gore or realistic violence.

## 6. Phased roadmap

| Phase | Deliverable | Needs multiplayer server? |
|---|---|---|
| **P0 – Prototype (single-player vs bots)** | The island, a drop from the blimp, looting, one gun, a shrinking zone, 20 bots, win/lose screen. | No (runs locally) |
| **P1 – Gunplay** | Full shooter feel: ADS, recoil, reload, hit markers, damage numbers, 6–8 weapons, armour and healing, sprint/slide/mantle, sound design. | No |
| **P2 – Server and netcode** | Authoritative server, client prediction, lag compensation, snapshots, lobby, 8–16 real players with bots filling the rest. | **Yes** |
| **P3 – Squads and objectives** | Trios, revive/respawn, buy stations, contracts, ping system, squad chat via preset pings and emotes, vehicles. | Yes |
| **P4 – The Jar and polish** | The second-chance arena, killcams ("pickle cams"), spectate, replays, settings, accessibility. | Yes |
| **P5 – Live game** | Seasons, cosmetics, battle pass-style progression, leaderboards, maps and modes (e.g. smaller "quick drop" mode). | Yes |

Rough effort: P0 about 2–3 sessions, P1 about 2, P2 about 3–4, P3 about 3, P4 about 2, P5 ongoing. Each phase needs playtesting with real people, which can't be fully verified from the container's single headless browser.

## 7. Risks

- **Netcode difficulty.** Prediction, reconciliation and lag compensation are the hardest part. De-risk it by building P0/P1 offline first, then adding the server.
- **Performance at scale in the browser.** Budget draw calls and network early; keep the player count honest.
- **Cheating.** Can't be fully solved; plan for reporting and moderation.
- **Server cost.** A small VM handles a handful of concurrent matches. Costs grow with players, so cap rooms.
- **Scope.** A full battle royale is a huge project. Ship P0 as a standalone "practice mode" so there's always something playable.
- **Legal.** No third-party names, logos, maps, sounds or weapons; keep it original and cartoon-parody. Don't use the words "Warzone" or "Call of Duty" in the product.

## 8. Open questions for you

1. **Cartoon (recommended) or realistic**? This changes the art, audio, and the whole feel.
2. **Player count and squad size** for v1?
3. OK to run a **small game server** (Fly.io or similar, a few dollars a month) once we reach P2?
4. Should it share the **Dilly character and city** (same universe, same cosmetics) or be a separate game?
5. **Free to play with cosmetics** later, or fully free?
6. What do you most want the first playable to prove: the **gunplay feel**, the **drop and zone loop**, or **squad play**?

## 9. Suggested next step

Build **P0** as a single-player practice mode: the island, the drop, a handful of weapons, a shrinking zone and bots. It's playable in a browser without any server, tells us whether the loop is fun, and every piece carries over into the multiplayer version.
