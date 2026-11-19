# Dilly Gone Mad: multiplayer plan

Status: **draft for discussion**. Nothing here is built yet.


> **Update:** hosting decision made: the multiplayer server will be **self-hosted** (Node + Colyseus in Docker, behind a Cloudflare Tunnel or similar for `wss://`), not Cloudflare Workers. See `docs/battle-royale-plan.md` §5 for the setup and security plan. Both games will share one server codebase and one player profile.

## Goal

Let several people drive around Los Pepinos together in the browser. They should see each other's cars and characters, mess around with the cartoon weapons, and do missions and races together. It should be easy to join a friend from a link, with no install.

## The constraint that shapes everything

The site is static (GitHub Pages). Static hosting can't run a game server, so multiplayer needs **one small hosted service** for rooms and message relay. Everything else (rendering, physics, AI) stays in the browser, as it is today.

## Options for the hosted piece

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **Cloudflare Workers + Durable Objects** (recommended) | One Durable Object per room relays WebSocket messages and holds light room state | Cheap (free tier covers small use), global edge, no servers to babysit, WebSockets built in | Needs a Cloudflare account; server code is JS/TS on Workers |
| PartyKit (now part of Cloudflare) | Same idea with a friendlier room API | Very quick to prototype | Same platform underneath |
| Colyseus on Fly.io / Render | Node game-server framework with room and state sync | Rich features (schema sync, matchmaking) | A real server to pay for and keep running |
| Supabase Realtime / Firebase | Hosted pub/sub channels | No server code at all | Not built for 15–20 Hz game traffic; costs and latency climb |
| WebRTC peer-to-peer (PeerJS) | Players connect directly; a tiny signalling server introduces them | Lowest latency, almost no server cost | NAT traversal failures (needs a TURN server), host migration pain, easier to cheat |

**Recommendation:** Cloudflare Durable Objects. It's the smallest thing that works well, and it scales from "me and two friends" to public rooms.

## Netcode approach (keep it simple: casual and cooperative, not competitive esports)

- **Each client owns its own player.** You simulate your own car and character locally (no input lag) and send a snapshot 15 times a second: position, heading, velocity, on-foot or in-car, current weapon and animation state.
- **Others are interpolated.** Remote players are rendered about 100 ms in the past, smoothly blended between snapshots, with a short extrapolation when packets are late.
- **The server relays and sanity-checks.** It doesn't run physics. It rejects impossible jumps (teleports and speed hacks) and rate-limits messages.
- **The world stays local where possible.** Traffic, pedestrians and props already come from a fixed seed, so each client runs its own. Only things players do to each other are synced.
- **Weapons:** the shooter's client decides hits on remote players and the target confirms them. Effects such as tumbling, getting soaked and the nuke dome are broadcast as events, so everyone sees them. The piss nuke is a single room-wide event with position and time.
- **Police:** each player keeps their own wanted level and cops (simple, and no shared-AI sync). Shared chases can come later.
- **Missions and races:** the room leader picks one. The server holds the start time, checkpoints and results, so standings are fair.

Rough bandwidth: about 60 bytes × 15 Hz × 8 players ≈ 7 KB/s down per client. That's fine on any connection.

## Phases

1. **P0 – See each other (prototype)**
   - "Play online" button → create a room → shareable link `dilly-gone-mad.html?room=ABCD#play`.
   - Up to 8 players per room. Each gets a random paint colour and a floating name tag (nickname only, no accounts).
   - Remote cars and characters are interpolated, and remote players show as blips on the minimap.
   - Join and leave toasts, plus reconnect on drop.
2. **P1 – Hang out:** quick emotes and horn sounds, preset text chat (no free text at first, to avoid moderation work), and photo-mode group shots.
3. **P2 – Mess around:** synced weapons and hit reactions, a shared piss nuke, and tag and bonk minigames.
4. **P3 – Play together:** co-op crate deliveries, street races with a server-timed start and checkpoints, and a room leaderboard.
5. **P4 – Persistence (optional):** accounts or a device ID, saved cars and cash across sessions, and public rooms with matchmaking.

## Code changes needed in the game

- Split the single 3,000-line `dilly-gone-mad.html` into ES modules: `world.js`, `vehicles.js`, `avatar.js`, `weapons.js`, `net.js`, `hud.js`. Multiplayer is much easier to add to modules.
- Make "player" a class that both the local player and remote players use (the local one reads input, remote ones read snapshots).
- Make sure every random choice that affects the world uses the seeded RNG, so all clients build the same city.
- Add `net.js` with connect, room join, snapshot send and receive, an interpolation buffer and an event bus.
- Add a `server/` folder (a Cloudflare Worker) with its own deploy workflow, separate from the Pages workflow.

## Safety and moderation

- **Names:** nickname only, filtered against a word list. No personal info collected.
- **Chat:** preset messages only until there's a reporting/moderation plan.
- **Limits:** rate limits and message-size limits on the server, and room caps.
- **Joining:** rooms are private by link by default. Public rooms come later.

## Open questions for you

1. Are you OK creating a free **Cloudflare account** for the multiplayer server? It's the one piece that can't live on GitHub Pages.
2. **Friends-only rooms by link** first, or open public lobbies?
3. **Max players per room:** 8 is the comfortable start. Is that OK?
4. **Accounts and saved progress** online, or keep it anonymous for now?
5. Which **first multiplayer activity** matters most: free roam, races, or weapon chaos?

## Rough effort

- P0: about 1–2 working sessions, including the module split.
- P1–P2: about 2–3 more sessions.
- P3: about 2 sessions.
- Real-world testing with several people is needed at each phase; it can't be fully verified from a single headless browser.
