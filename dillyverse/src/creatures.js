/* ==========================================================================
   DILLYVERSE — Original Voxel Creatures & AI
   Wooly Ram (passive), Snow Fox (neutral), Sky Finch (flying),
   Shadow Stalker (hostile nighttime), Deep Crawler (underground).
   ========================================================================== */

import * as THREE from 'three';
import { IT, B } from './blocks.js';

const CREATURE_DEFS = {
  ram: {
    name: 'Wooly Ram', hostile: false, flying: false, maxHp: 10, speed: 1.8, damage: 0,
    drop: IT.RAW_BEEF, dropCount: 2, bodyCol: 0xf0ede6, headCol: 0xd6c7b2, accentCol: 0x6b5848, size: [0.85, 0.75, 1.1]
  },
  fox: {
    name: 'Snow Fox', hostile: false, flying: false, maxHp: 8, speed: 2.8, damage: 0,
    drop: IT.APPLE, dropCount: 1, bodyCol: 0xe87b35, headCol: 0xf4a261, accentCol: 0xffffff, size: [0.55, 0.45, 0.85]
  },
  finch: {
    name: 'Sky Finch', hostile: false, flying: true, maxHp: 5, speed: 4.0, damage: 0,
    drop: IT.APPLE, dropCount: 1, bodyCol: 0x3bc9db, headCol: 0xffe066, accentCol: 0x1c7ed6, size: [0.42, 0.32, 0.5]
  },
  stalker: {
    name: 'Shadow Stalker', hostile: true, flying: false, maxHp: 18, speed: 3.1, damage: 3.5,
    drop: IT.COAL, dropCount: 2, bodyCol: 0x20182b, headCol: 0x2f2340, accentCol: 0xc84bff, size: [0.68, 1.75, 0.55]
  },
  crawler: {
    name: 'Deep Crawler', hostile: true, flying: false, maxHp: 14, speed: 3.4, damage: 3.0,
    drop: IT.IRON_INGOT, dropCount: 1, bodyCol: 0x2f4538, headCol: 0x3f634c, accentCol: 0xff4d4d, size: [0.95, 0.55, 0.95]
  }
};

function buildCreatureMesh(type) {
  const def = CREATURE_DEFS[type];
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: def.bodyCol });
  const headMat = new THREE.MeshLambertMaterial({ color: def.headCol });
  const accMat = new THREE.MeshBasicMaterial({ color: def.accentCol });

  const [bw, bh, bd] = def.size;
  const body = new THREE.Mesh(new THREE.BoxGeometry(bw, bh * 0.65, bd), bodyMat);
  body.position.y = bh * 0.55;
  g.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.72, bw * 0.65, bw * 0.72), headMat);
  head.position.set(0, bh * 0.92, bd * 0.42);
  g.add(head);

  // Glowing or contrasting eyes
  const eyeGeo = new THREE.BoxGeometry(0.1, 0.1, 0.06);
  const eyeL = new THREE.Mesh(eyeGeo, accMat);
  const eyeR = new THREE.Mesh(eyeGeo, accMat);
  eyeL.position.set(-bw * 0.18, bh * 0.96, bd * 0.42 + bw * 0.36);
  eyeR.position.set(bw * 0.18, bh * 0.96, bd * 0.42 + bw * 0.36);
  g.add(eyeL, eyeR);

  // Legs or Wings
  const legs = [];
  if (def.flying) {
    const wGeo = new THREE.BoxGeometry(0.65, 0.08, 0.32);
    const wL = new THREE.Mesh(wGeo, accMat);
    const wR = new THREE.Mesh(wGeo, accMat);
    wL.position.set(-bw * 0.7, bh * 0.65, 0);
    wR.position.set(bw * 0.7, bh * 0.65, 0);
    g.add(wL, wR);
    legs.push(wL, wR);
  } else {
    const lGeo = new THREE.BoxGeometry(bw * 0.24, bh * 0.38, bw * 0.24);
    const offsets = [[-bw * 0.28, -bd * 0.32], [bw * 0.28, -bd * 0.32], [-bw * 0.28, bd * 0.32], [bw * 0.28, bd * 0.32]];
    for (const [lx, lz] of offsets) {
      const leg = new THREE.Mesh(lGeo, headMat);
      leg.position.set(lx, bh * 0.2, lz);
      g.add(leg);
      legs.push(leg);
    }
  }

  return { group: g, bodyMat, legs };
}

export class CreatureManager {
  constructor(world, scene, audio) {
    this.world = world;
    this.scene = scene;
    this.audio = audio;
    this.list = [];
    this.spawnTimer = 2.0;
  }

  clear() {
    for (const c of this.list) this.scene.remove(c.mesh.group);
    this.list = [];
  }

  spawn(type, x, y, z) {
    const def = CREATURE_DEFS[type];
    const mesh = buildCreatureMesh(type);
    mesh.group.position.set(x, y, z);
    this.scene.add(mesh.group);
    this.list.push({
      type, def, mesh,
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(0, 0, 0),
      yaw: Math.random() * Math.PI * 2,
      hp: def.maxHp,
      aiTimer: 1 + Math.random() * 3,
      attackCd: 0,
      hitFlash: 0,
      animPhase: Math.random() * 10
    });
  }

  hitCreature(rayOrigin, rayDir, maxDist, damage, onKill) {
    let best = null, bestD = maxDist;
    const toC = new THREE.Vector3();
    for (const c of this.list) {
      const center = c.pos.clone().add(new THREE.Vector3(0, c.def.size[1] * 0.55, 0));
      toC.subVectors(center, rayOrigin);
      const proj = toC.dot(rayDir);
      if (proj < 0 || proj > bestD) continue;
      const closest = rayOrigin.clone().addScaledVector(rayDir, proj);
      const rad = Math.max(c.def.size[0], c.def.size[1]) * 0.7;
      if (closest.distanceTo(center) < rad) {
        bestD = proj;
        best = c;
      }
    }
    if (!best) return false;
    best.hp -= damage;
    best.hitFlash = 0.22;
    best.vel.x += rayDir.x * 5.5;
    best.vel.z += rayDir.z * 5.5;
    best.vel.y = 4.2;
    this.audio.playHurt();
    if (best.hp <= 0) {
      this.scene.remove(best.mesh.group);
      this.list = this.list.filter(x => x !== best);
      if (onKill) onKill(best);
    }
    return true;
  }

  update(dt, player, isNight, armorDefense) {
    const cdt = Math.min(dt, 0.05);

    // Spawn creatures around player
    this.spawnTimer -= cdt;
    if (this.spawnTimer <= 0 && this.list.length < 18) {
      this.spawnTimer = 3.2;
      const ang = Math.random() * Math.PI * 2;
      const dist = 16 + Math.random() * 24;
      const sx = Math.floor(player.pos.x + Math.cos(ang) * dist);
      const sz = Math.floor(player.pos.z + Math.sin(ang) * dist);
      const sy = this.world.getSurfaceY(sx, sz);
      const under = this.world.getBlock(sx, sy - 1, sz);
      if (under !== B.WATER && under !== B.LAVA) {
        let type = 'ram';
        if (isNight && player.difficulty !== 'peaceful' && Math.random() < 0.65) {
          type = Math.random() < 0.65 ? 'stalker' : 'crawler';
        } else {
          const r = Math.random();
          if (r < 0.48) type = 'ram';
          else if (r < 0.78) type = 'fox';
          else type = 'finch';
        }
        this.spawn(type, sx + 0.5, type === 'finch' ? sy + 6 : sy + 0.1, sz + 0.5);
      }
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      const distP = c.pos.distanceTo(player.pos);
      if (distP > 64) {
        this.scene.remove(c.mesh.group);
        this.list.splice(i, 1);
        continue;
      }

      if (c.attackCd > 0) c.attackCd -= cdt;
      if (c.hitFlash > 0) {
        c.hitFlash -= cdt;
        c.mesh.bodyMat.color.setHex(c.hitFlash > 0 ? 0xff4444 : c.def.bodyCol);
      }

      // AI steering
      c.aiTimer -= cdt;
      const hostileActive = c.def.hostile && player.mode === 'survival' && player.difficulty !== 'peaceful' && !player.dead;
      if (hostileActive && distP < 18) {
        c.yaw = Math.atan2(player.pos.x - c.pos.x, player.pos.z - c.pos.z);
        c.vel.x = Math.sin(c.yaw) * c.def.speed;
        c.vel.z = Math.cos(c.yaw) * c.def.speed;
        if (distP < 1.85 && c.attackCd <= 0) {
          c.attackCd = 1.1;
          player.takeDamage(c.def.damage, armorDefense, `Defeated by a ${c.def.name}.`);
        }
      } else if (c.aiTimer <= 0) {
        c.aiTimer = 2 + Math.random() * 4;
        c.yaw = Math.random() * Math.PI * 2;
        const moving = Math.random() < 0.65 || c.def.flying;
        c.vel.x = moving ? Math.sin(c.yaw) * c.def.speed * 0.55 : 0;
        c.vel.z = moving ? Math.cos(c.yaw) * c.def.speed * 0.55 : 0;
      }

      if (c.def.flying) {
        c.pos.x += c.vel.x * cdt;
        c.pos.z += c.vel.z * cdt;
        const surf = this.world.getSurfaceY(c.pos.x, c.pos.z);
        c.pos.y += ((surf + 7 + Math.sin(c.animPhase * 0.5) * 2) - c.pos.y) * cdt * 1.5;
      } else {
        c.vel.y -= 22 * cdt;
        const nx = c.pos.x + c.vel.x * cdt;
        const nz = c.pos.z + c.vel.z * cdt;
        if (this.world.isSolid(nx, c.pos.y + 0.3, nz)) {
          if (!this.world.isSolid(nx, c.pos.y + 1.3, nz)) c.vel.y = 6.8; // jump 1-block ledge
          else c.yaw += Math.PI * 0.7;
        } else {
          c.pos.x = nx; c.pos.z = nz;
        }
        const ny = c.pos.y + c.vel.y * cdt;
        if (this.world.isSolid(c.pos.x, ny, c.pos.z)) {
          c.pos.y = Math.floor(ny) + 1.001;
          c.vel.y = 0;
        } else {
          c.pos.y = ny;
        }
      }

      c.animPhase += cdt * (Math.hypot(c.vel.x, c.vel.z) * 3.5 + 1.2);
      c.mesh.group.position.copy(c.pos);
      c.mesh.group.rotation.y = c.yaw;
      for (let li = 0; li < c.mesh.legs.length; li++) {
        const sign = li % 2 === 0 ? 1 : -1;
        if (c.def.flying) c.mesh.legs[li].rotation.z = Math.sin(c.animPhase * 3.2) * 0.7 * sign;
        else c.mesh.legs[li].rotation.x = Math.sin(c.animPhase) * 0.45 * sign;
      }
    }
  }
}
