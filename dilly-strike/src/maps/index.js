/* ==========================================================================
   DILLY STRIKE — map registry
   Each map module exports: id/name/code/title/desc, lighting preset, bounds,
   sites, spawns (playerSpawn/botSpawn/botRespawn), bot navigation
   (waypoints for straight-line bots, or nav.path/randomTarget for A*),
   callout(x, z), menuCam, build(ctx) for geometry + colliders and
   dress(ctx) for the realism detail. online: whether the Rust server runs it.
   ========================================================================== */
import dustline from './dustline.js';
import brinepeak from './brinepeak.js';

export const MAPS = { dustline, brinepeak };
export const MAP_IDS = Object.keys(MAPS);
const KEY = 'ds_map_v1';
export function savedMapId() {
  const q = new URLSearchParams(location.search).get('map');
  if (q && MAPS[q]) return q;
  try { const v = localStorage.getItem(KEY); if (v && MAPS[v]) return v; } catch (_) { /* private mode */ }
  return 'dustline';
}
export function saveMapId(id) { try { localStorage.setItem(KEY, id); } catch (_) { /* private mode */ } }
