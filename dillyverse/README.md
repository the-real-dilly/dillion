# DILLYVERSE — *Build. Explore. Survive.*

An original, browser-based 3D voxel sandbox survival game built with **Three.js (WebGL 2)**, chunk-based meshing with ambient occlusion, procedural pixel-art textures, survival/crafting/furnace mechanics, original voxel creatures, IndexedDB world persistence, and a zero-dependency **Rust** WebSocket multiplayer server.

---

## Quick Start

### Singleplayer (Browser)
Serve the repository root with any static HTTP server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/dillyverse/index.html` in a modern desktop browser.

### Multiplayer Server (Rust)
The DillyVerse client connects directly to the official backend at **`wss://apibuild.dillonmay.com`**.

To run the authoritative, zero-dependency **Rust** RFC 6455 WebSocket server (`dillyverse/server/src/main.rs`) on your host behind TLS (`apibuild.dillonmay.com`):

```bash
cargo run --release --manifest-path dillyverse/server/Cargo.toml -- 25565 DILLYVERSE-MP-01
```

---

## Controls

| Key / Input | Action |
|---|---|
| **W A S D** | Move |
| **Mouse** | Look around (Pointer Lock) |
| **Space** | Jump / Swim up / **Double-tap Space** to toggle Flight in Creative mode |
| **Shift** | Sprint |
| **Ctrl** | Crouch (edge-safe sneaking) |
| **Left Click** | Mine block / Attack creature |
| **Right Click** | Place block / Interact with Crafting Table or Furnace / Eat food |
| **1–9 / Scroll Wheel** | Select hotbar slot |
| **E** | Open Inventory, 2×2 Crafting, Armor & Creative Catalog |
| **Q** | Drop active item |
| **T** | Open Chat |
| **Esc** | Pause Menu / Save World |

---

## Architecture

- `dillyverse/index.html` & `styles.css` — Full-screen WebGL 2 viewport, Main Menu, World Selector, Multiplayer Lobby, Settings, Inventory/Crafting/Furnace/Creative modal, and HUD.
- `src/blocks.js` — Block & item registry (25+ blocks, tools, swords, iron/diamond armor, food, hardness, tool tiers).
- `src/textures.js` — Procedural 16×16-tile (`256×256`) original pixel-art `CanvasTexture` atlas and 2D UI icons.
- `src/noise.js` — Seeded PRNG & 2D/3D gradient FBM noise for deterministic infinite worlds.
- `src/world.js` — `16×96×16` chunk generator with 5 biomes (Plains, Forest, Desert, Snowy Peaks, Ocean), 3D underground caves, ore veins, trees, flowers, and persistent modification deltas.
- `src/mesher.js` — Chunk-level `BufferGeometry` builder (1 opaque + 1 cutout + 1 transparent mesh per chunk) with 6-neighbor face culling and vertex ambient occlusion.
- `src/player.js` — First-person controller, AABB voxel collision, crouch edge-guard, creative flight, swimming, fall/lava damage, health/hunger, and DDA raycasting.
- `src/inventory.js` & `src/crafting.js` — 36-slot inventory, 4 armor slots, drag-and-drop & right-click stack splitting, 2×2 & 3×3 crafting, and smelting furnace with fuel burn timer.
- `src/creatures.js` — Original articulated 3D voxel creatures (Wooly Ram, Snow Fox, Sky Finch, Shadow Stalker, Deep Crawler).
- `src/audio.js` — Procedural Web Audio synthesizer for mining, placement, footsteps, splashes, eating, combat, and crafting.
- `src/storage.js` — IndexedDB persistence (`DillyVerseDB`) for multiple saved worlds, player state, inventory, and modified blocks.
- `src/multiplayer.js` & `server/index.mjs` — Real WebSocket client/server with 3D remote player avatars, nametags, chat, server-authoritative block edits, and anti-cheat reach/rate validation.
