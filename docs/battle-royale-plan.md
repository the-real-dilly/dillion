# Battle royale game plan (working title: **ZONE NINE**)

Status: **plan v3, decisions locked: realistic tone, self-hosted server, same universe as Dilly Gone Mad.** Nothing here is built yet.

A Warzone-style battle royale for the browser: drop onto a big map with a squad, loot up, fight, survive a shrinking gas circle, and be the last squad standing. This replicates the genre's *mechanics*. Names, art, maps, weapons and audio are original: no Activision / Call of Duty assets, names, logos, weapon names or real-world factions.

## 1. Locked decisions

| Topic | Decision |
|---|---|
| **Tone** | **Realistic modern-military shooter**, rated like a Teen/Mature action game: gunfire, hit markers, light blood puffs (with a setting to turn them off), no dismemberment or gore, nothing sexual, no real-world conflicts, nations, groups or atrocities. Fictional private-contractor factions in a fictional country. |
| **Hosting** | **Self-hosted game server** on your own machine (Docker). The website stays on GitHub Pages; the client connects to your server over secure WebSockets. |
| **Weapons** | Fictional but believable designs (original names like "Falcon-9 carbine", "Ridge LMG", "Vigil marksman rifle"). Game-balance stats only. No real brands or real-world technical detail beyond what a game needs. |
| **Players per match** | 32 for v1 (see §5 for what your hardware and upload can take). |
| **Squads** | Solos and trios first. |
| **Relation to Dilly Gone Mad** | **Same universe** (see §1a). Separate page (`zone-nine.html`) that shares engine code, the save profile, characters and lore with Dilly Gone Mad. |

## 1a. Same universe as Dilly Gone Mad

Zone Nine is set in the same fictional world as Dilly Gone Mad, as a grittier spin-off.

- **Setting:** the island nation around **Los Pepinos**. The battle royale map is a neighbouring region (a "Zone Nine" restricted area) and includes a recognisable, scaled-down **Los Pepinos district** with the LOS PEPINOS hillside sign, the pier and Ferris wheel and the Relish Ave downtown, so players who know the city feel at home.
- **Characters:** **Dilly** is a playable operator (the same character model you chose, with the same outfit as a skin). Supporting cast from Dilly Gone Mad (the radio DJs, mission givers, cops) show up as NPC voices, contractors and easter eggs.
- **Shared profile:** one save across both games (cash, golden pickles, unlocks, best stats, cosmetics, settings). Cash earned in one is spendable in the other; crossover cosmetics (for example, the red convertible as a drop-in vehicle in Zone Nine, or a Zone Nine camo for Dilly's outfit).
- **Shared tech:** same engine modules, HUD style language, audio engine, radio and voice systems (the radio can play in Zone Nine's vehicles too).
- **Lore hook:** Zone Nine is a contractor tournament run by the same fictional corporation (the Dillion Group) that sponsors things in Los Pepinos.

**Tone clash to manage.** Dilly Gone Mad is slapstick and Zone Nine is realistic. Options, in my order of preference:
1. **Different "channels" of one world (recommended).** Treat Zone Nine as a hardcore, serious series set in the same world, like a gritty reboot of a cartoon franchise. Dilly appears as an operator with a more serious portrayal, and a few knowing Easter eggs (a golden pickle in a loot crate, a Brine FM car radio). The tone shift is a feature.
2. **Cartoon-realistic hybrid.** Realistic gunplay and graphics but with Dilly-world humour (silly gadget names, comic radio chatter, funny deaths turned off in ranked). Keeps one voice but dilutes both.
3. **Hard split.** Separate branding with only a hidden link between them.

Practical effect on likeness: Dilly's model is based on your photo. In a realistic game it will read as *you* as a soldier, so confirm you're comfortable with that, or I'll make the Zone Nine operator a lookalike-free variant.

## 2. Core gameplay loop

1. **Lobby:** short countdown, practice range, squad invite link, loadout selection.
2. **Insertion:** everyone rides a transport plane along a random line over the map, jumps whenever they choose, free-falls and opens a parachute.
3. **Loot:** weapons, attachments, ammo, armour plates, med kits, gadgets and cash from crates, buildings and fallen players. Rarity tiers by colour.
4. **Gas circle:** a safe zone that shrinks in stages. Outside it, a gas cloud damages you. Shown on the map and minimap.
5. **Combat:** ADS, recoil, bullet drop, penetration through thin cover, reload, armour plates, sprint / slide / mantle, vehicles (reuse and extend the car physics), building clearing.
6. **Contracts and cash:** bounty, scavenger and recon contracts pay cash, spent at **buy stations** on supplies, loadout drops and **squad respawns**.
7. **Second chance ("the Pit"):** when downed twice you're sent to a short 1v1 arena duel. Win to rejoin the match.
8. **Finale:** the circle closes to a tiny area. Last squad standing wins; results screen shows stats and unlocks.

## 3. Map

- About **2.5 × 2.5 km** fictional island nation. Named districts: downtown, port and container yard, airfield, farmland, quarry, dam, stadium, hillside resort, a small military compound (high-tier loot).
- Hand-authored points of interest with consistent loot tiers over procedurally generated filler; a deterministic match seed so the server verifies all crate and loot positions.
- Verticality (rooftops, ladders, zip-lines, elevators), clear landmarks for navigation, water for boats.
- Reuse the chunk-streaming, road-graph and LOD systems built for Dilly Gone Mad's massive city.

## 4. Technical design

**Authoritative server (you run it).** In a shooter, clients can't be trusted. The server runs the full match simulation at **30 Hz** (movement, bullets, damage, loot, gas) and sends snapshots; clients predict their own movement and reconcile.

| Piece | Approach |
|---|---|
| **Server stack** | Node.js (TypeScript) with **Colyseus** (rooms, matchmaking, state sync) on top of `ws`. One process can host many matches; scale by running more processes. |
| **Movement** | Shared movement code on client and server. Client-side prediction with server reconciliation. |
| **Shooting** | Server-side hit detection with **lag compensation** (rewind other players by the shooter's latency, capped at about 150 ms). Hitscan for most guns; simulated projectiles for slow ones. Simple collision on the server (capsules + static map colliders, no rendering). |
| **Interest management** | Send each client only the players, loot and vehicles near them. |
| **Snapshots** | Binary, delta-compressed, about 10–20 KB/s per client. |
| **Bots** | The same server code can run bots to fill lobbies and make practice mode, plus testing without 30 real people. |
| **Anti-cheat** | Server authority covers most. Add input rate-limits, speed and teleport validation, and report/mute. A browser game can't stop everything; aim for "good enough for a community". |
| **Matchmaking** | Room list + invite links first; a simple queue later. |

**Client.** Reuse Three.js, post-processing, avatar rig, audio and the UI framework. New: first- and third-person shooter cameras, weapon viewmodels, recoil/spread model, hit markers and directional damage indicators, inventory UI, gas visuals, parachute and plane, Pit arena.

**Art (honest note).** "Realistic" in a browser built from code needs real assets. Procedural boxes won't make convincing guns or soldiers. Plan: use **glTF models** loaded with Three's GLTFLoader, from either **free CC0 packs** (check each licence; no attribution-required or no-commercial-use assets unless we credit/accept them) or models you commission/buy. Procedural generation stays for terrain, foliage and buildings.

**Performance target.** About 60 fps on a mid-range laptop with 32 players on the map, using LOD, instancing and the existing automatic quality drop.

## 5. Self-hosting: what you need to run

**Hardware (for about 32 players per match, a few matches at once):** 4 CPU cores, 8 GB RAM is plenty to start. Any home server, mini PC or a spare laptop works. A cheap VPS also works if you'd rather not expose your home network.

**Bandwidth (this is the part that surprises people):**
- Per match: about 32 players × 15 KB/s down ≈ **0.5 MB/s ≈ 4 Mbps** of upload from your server, plus about 1 KB/s up per player.
- So **home upload speed is the limit.** 20 Mbps upload comfortably handles about 4–5 simultaneous 32-player matches; 100-player matches would need roughly 3× per match.
- Tell me your server's upload speed and I'll size the player count.

**Networking and security (needs care, since this puts a game server on the internet):**
- The site is HTTPS (GitHub Pages), so browsers **require a secure WebSocket (`wss://`)**. You need a **domain name and a valid TLS certificate**.
- Recommended: **Cloudflare Tunnel** (free). It gives you the `wss://` URL and the certificate, and needs **no port-forwarding**, which also **hides your home IP address** from players (important for a game that attracts the odd bad actor). Alternatives: Caddy with Let's Encrypt behind a port-forward, or a reverse proxy on a VPS.
- Only expose the game port (never SSH or the Docker socket). Run the server as a non-root user in a container. Restrict allowed WebSocket origins to your site. Add rate limits and a max-connections-per-IP limit.
- Keep a firewall on, apply OS updates, and monitor with simple logs and a `/health` endpoint.
- Keep secrets (admin token) in environment variables, never in the Git repo.

**What I'll provide in the repo:**
- `server/` with the Colyseus server (TypeScript).
- `Dockerfile` and `docker-compose.yml` (server + optional Caddy or `cloudflared` container).
- `.env.example` (port, allowed origin, admin token, max rooms/players).
- `docs/self-hosting.md`: step-by-step setup (install Docker, pick a domain, create the tunnel, start the server, test with the client, update procedure) and a troubleshooting section.
- A **server-address setting** in the client (default points at your domain; override with `?server=wss://…`).
- A **status page** (`/health`) and an admin command to list/kick rooms.

## 6. Weapons and gear (original, believable, balanced for gameplay)

- **Classes:** assault rifles, SMGs, LMGs, marksman/sniper rifles, shotguns, sidearms, launchers, melee, throwables (frag, flash, smoke, stim), plus gadgets (UAV, armour plate drop, decoy).
- **Systems:** rarity tiers, attachments (optics, barrels, magazines, grips), per-weapon recoil patterns, bullet velocity and drop, damage falloff, headshot multipliers, armour plates.
- **Fictional naming and stats only.** I won't replicate any real firearm's internals; the models are visual only.

## 7. Phased roadmap

| Phase | Deliverable | Server needed? |
|---|---|---|
| **P0 – Offline prototype** | The island, plane drop, looting, 2 guns, gas circle, 20 bots, win/lose. | No |
| **P1 – Gunplay** | Full shooter feel: ADS, recoil, reload, hit markers, 8+ weapons, armour and healing, sprint/slide/mantle, sound design. | No |
| **P2 – Server and netcode** | Your self-hosted authoritative server: prediction, lag compensation, snapshots, lobby; 8–16 real players with bots filling the rest. `docs/self-hosting.md`. | **Yes (yours)** |
| **P3 – Squads and objectives** | Trios, revive/respawn, buy stations, contracts, ping system, vehicles. | Yes |
| **P4 – The Pit and polish** | Second-chance duel, killcam, spectate, replays, settings, accessibility. | Yes |
| **P5 – Live game** | Progression, cosmetics, leaderboards, extra maps and modes. | Yes |

Rough effort: P0 about 2–3 sessions, P1 about 2–3, P2 about 3–4, P3 about 3, P4 about 2, P5 ongoing. Real playtests with people are needed at each stage; I can't fully verify multiplayer from one headless browser.

## 8. Risks

- **Netcode difficulty** (prediction, reconciliation, lag compensation). De-risk by building P0/P1 offline first.
- **Realistic art needs assets.** Licensing and sourcing are the biggest content risk.
- **Home hosting:** upload bandwidth, uptime (power/ISP), and security exposure. A tunnel or VPS mitigates the last one.
- **Cheating** can't be fully solved in a browser.
- **Browser performance** at 32 players with realistic assets.
- **Scope.** Ship P0 as a standalone practice mode so there's always something playable.
- **Legal.** Original names, maps and assets only; don't use "Warzone" or "Call of Duty".

## 9. Open questions

1. **Tone handling for the shared universe** (§1a): option 1 (gritty spin-off, recommended), 2 (hybrid) or 3 (split)? And are you OK with Dilly's likeness as a realistic operator?
2. What's your **server's upload speed** (and is it a home PC, mini PC or VPS)? That sets the player count.
3. Do you already own a **domain**? Cloudflare Tunnel needs one (a cheap one is fine).
4. Do you want **blood effects on by default** or off by default?
5. **Art source for guns and soldiers:** free CC0 packs (I'll check licences), or do you have models/budget?
6. Which first playable matters most: **gunplay feel**, **the drop-and-gas loop**, or **squad play**?

## 10. Suggested next step

Build **P0** as an offline practice mode: the island, plane drop, looting, a shrinking gas circle, two guns and bots. It needs no server, shows whether the loop is fun, and every piece carries into multiplayer. The server comes at P2, when we'll walk through setting it up together.
