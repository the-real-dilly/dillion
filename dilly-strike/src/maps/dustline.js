/* ==========================================================================
   DILLY STRIKE — map: de_dustline (desert citadel, two sites)
   Geometry/colliders are exactly the original layout (moved here from
   main.js); mapdetail.enhanceDustline() restyles it with the realism pass.
   ========================================================================== */
import { enhanceDustline } from '../mapdetail.js';

export default {
  id: 'dustline',
  name: 'Dustline',
  code: 'de_dustline',
  title: 'DE_DUSTLINE',
  desc: 'Desert citadel · A site · Mid doors · B site',
  kicker: 'Operation Dustline',
  online: true,
  lighting: 'desert',
  bounds: { minX: -38, maxX: 38, minZ: -28, maxZ: 28 },
  sites: [{ letter: 'A', x: 0, z: -21, w: 10.2, d: 6.8, color: 'rgba(227,167,59,0.28)' }, { letter: 'B', x: 0, z: 21, w: 10.2, d: 6.8, color: 'rgba(110,179,247,0.28)', text: '#7dd3fc' }],
  // bots walk straight between these (original behaviour)
  waypoints: [[-6, -20], [8, -19], [0, -6], [0, 6], [-8, 20], [10, 19], [20, 0], [-18, -8], [18, 8]],
  nav: null,
  playerSpawn(team) {
    const sx = team === 'alpha' ? -23 : 23, sz = team === 'alpha' ? -10 : 10;
    return { x: sx, z: sz + (Math.random() - 0.5) * 4, yaw: team === 'alpha' ? -1.18 : 1.95 };
  },
  botSpawn(i) { return { x: 24 + (i % 2) * 5, z: -12 + i * 6 }; },
  botRespawn() {
    // same T-side area as before, but never inside the spawn barrier (x 27..29, z -6..6), where a bot could not be hit
    const x = 26 + (Math.random() - 0.5) * 6, z = (Math.random() - 0.5) * 24;
    return { x: Math.abs(x - 28) < 1.5 && Math.abs(z) < 6.5 ? 31 : x, z };
  },
  callout(x, z) {
    if (x < -25) return 'CT SPAWN';
    if (x > 25) return 'T SPAWN';
    if (z < -13) return 'BOMBSITE A';
    if (z > 13) return 'BOMBSITE B';
    if (Math.abs(x) < 12 && Math.abs(z) < 12) return 'MID DOORS';
    return z < 0 ? 'LONG A' : 'B TUNNELS';
  },
  menuCam: { r: 26, h: 11.5, look: [0, 2.2, 0] },
  build(ctx) {
      const { THREE, addBox, addSpray, group } = ctx;
      const { MAT_SAND, MAT_WALL, MAT_WALL_DARK, MAT_CRATE, MAT_DOOR, MAT_BARREL } = ctx.MATS;
    // Ground floor (Dust2 sandstone plaza)
    addBox(0, -0.5, 0, 76, 1, 56, MAT_SAND, false, false);

    // Outer perimeter fortress walls + desert parapet trims
    addBox(0, 4.5, -28, 76, 9, 2, MAT_WALL_DARK);
    addBox(0, 4.5, 28, 76, 9, 2, MAT_WALL_DARK);
    addBox(-38, 4.5, 0, 2, 9, 56, MAT_WALL_DARK);
    addBox(38, 4.5, 0, 2, 9, 56, MAT_WALL_DARK);

    // Center Mid dividing walls + Dust2 Mid Double Doors frame
    addBox(-10, 3.0, -10, 2.2, 6, 18, MAT_WALL);
    addBox(10, 3.0, 10, 2.2, 6, 18, MAT_WALL);
    addBox(0, 2.6, 0, 6.5, 5.2, 2.2, MAT_DOOR); // Iconic green-steel Mid Doors
    // Overhead archway lintels (decorative, high clearance)
    addBox(-10, 6.4, 4, 2.4, 1.4, 10, MAT_WALL_DARK, false, false);
    addBox(10, 6.4, -4, 2.4, 1.4, 10, MAT_WALL_DARK, false, false);

    // A-Site (North / -Z) Dust2 crate stacks & stone wall
    addBox(-22, 1.3, -15, 3.2, 2.6, 3.2, MAT_CRATE);
    addBox(-22, 3.3, -15.3, 1.6, 1.5, 1.6, MAT_CRATE, false, false);
    addBox(14, 1.3, -17, 3.4, 2.6, 2.6, MAT_CRATE);
    addBox(4, 2.5, -18, 8, 5, 1.8, MAT_WALL);
    addSpray(0, 0.03, -21, 'A');
    addSpray(4, 2.6, -17.05, 'A', 0, 0);

    // B-Site (South / +Z) warehouse cover & crate stacks
    addBox(22, 1.3, 15, 3.2, 2.6, 3.2, MAT_CRATE);
    addBox(22.2, 3.3, 15, 1.5, 1.5, 1.5, MAT_CRATE, false, false);
    addBox(-16, 1.3, 17, 3.5, 2.6, 2.8, MAT_CRATE);
    addBox(-4, 2.5, 18, 8, 5, 1.8, MAT_WALL);
    addSpray(0, 0.03, 21, 'B');
    addSpray(-4, 2.6, 17.05, 'B', 0, Math.PI);

    // Spawn cover barriers (CT -X, T +X)
    addBox(-28, 1.8, 0, 2, 3.6, 12, MAT_WALL_DARK);
    addBox(28, 1.8, 0, 2, 3.6, 12, MAT_WALL_DARK);

    // Accent CS:GO crates in Mid & Lanes
    addBox(-4, 0.9, 6, 2.2, 1.8, 2.2, MAT_CRATE);
    addBox(5, 0.9, -6, 2.2, 1.8, 2.2, MAT_CRATE);
    addBox(-20, 0.9, 6, 2.4, 1.8, 2.4, MAT_CRATE);
    addBox(20, 0.9, -6, 2.4, 1.8, 2.4, MAT_CRATE);

    // Decorative steel oil barrels near sites
    for (const [bx, bz] of [[-18, -19], [18, 19], [-6, -24], [6, 24]]) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.25, 12), MAT_BARREL);
      barrel.position.set(bx, 0.62, bz);
      barrel.castShadow = true; barrel.receiveShadow = true;
      group.add(barrel);
    }
  },
  dress(ctx) {
    enhanceDustline({ scene: ctx.group, mapMeshes: ctx.mapMeshes, renderer: ctx.renderer, mats: ctx.MATS });
  }
};
