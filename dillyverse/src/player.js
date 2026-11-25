/* ==========================================================================
   DILLYVERSE — First-Person Player Controller, Physics & Voxel Raycasting
   WASD, Space Jump / Creative Flight, Shift Sprint, Ctrl Crouch (edge-safe),
   AABB Voxel Collision, Swimming, Fall/Lava Damage, Health, Hunger & DDA Ray.
   ========================================================================== */

import * as THREE from 'three';
import { B, BLOCKS } from './blocks.js';

const PLAYER_HALF = 0.30;
const PLAYER_HEIGHT = 1.78;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.28;

export class Player {
  constructor(world, camera, audio) {
    this.world = world;
    this.camera = camera;
    this.audio = audio;

    this.pos = new THREE.Vector3(0.5, 50, 0.5);
    this.vel = new THREE.Vector3(0, 0, 0);
    this.yaw = 0;
    this.pitch = -0.1;

    this.mode = 'survival'; // 'survival' | 'creative'
    this.difficulty = 'normal'; // 'peaceful' | 'normal' | 'hard'
    this.health = 20;
    this.maxHealth = 20;
    this.hunger = 20;
    this.maxHunger = 20;
    this.oxygen = 10;
    this.dead = false;

    this.onGround = false;
    this.inWater = false;
    this.headInWater = false;
    this.flying = false;
    this.crouching = false;
    this.sprinting = false;

    this.highestAirY = 50;
    this.stepDist = 0;
    this.hurtCooldown = 0;
    this.lavaTimer = 0;
    this.hungerTimer = 0;
    this.regenTimer = 0;
    this.lastSpaceTime = 0;
    this.swingAnim = 0;

    this.keys = {};
    this.spawnPos = new THREE.Vector3(0.5, 50, 0.5);
  }

  spawnAt(x, z) {
    const sy = this.world.getSurfaceY(x, z) + 0.5;
    this.pos.set(x + 0.5, sy, z + 0.5);
    this.spawnPos.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.highestAirY = sy;
    this.health = this.maxHealth;
    this.hunger = this.maxHunger;
    this.oxygen = 10;
    this.dead = false;
    this.flying = false;
  }

  onKeyDown(code) {
    if (code === 'Space' && !this.keys['Space']) {
      const now = performance.now();
      if (this.mode === 'creative' && now - this.lastSpaceTime < 280) {
        this.flying = !this.flying;
        this.vel.y = 0;
      }
      this.lastSpaceTime = now;
    }
    this.keys[code] = true;
  }

  onKeyUp(code) {
    this.keys[code] = false;
  }

  clearKeys() {
    this.keys = {};
  }

  applyLook(dx, dy, sensitivity = 0.0022) {
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    const lim = Math.PI / 2 - 0.015;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  collidesAt(nx, ny, nz) {
    const h = this.crouching ? 1.48 : PLAYER_HEIGHT;
    const minX = Math.floor(nx - PLAYER_HALF);
    const maxX = Math.floor(nx + PLAYER_HALF);
    const minY = Math.floor(ny);
    const maxY = Math.floor(ny + h - 0.01);
    const minZ = Math.floor(nz - PLAYER_HALF);
    const maxZ = Math.floor(nz + PLAYER_HALF);

    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (this.world.isSolid(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  takeDamage(amount, armorDefense = 0, reason = '') {
    if (this.mode === 'creative' || this.dead || this.hurtCooldown > 0) return false;
    const mult = this.difficulty === 'hard' ? 1.35 : (this.difficulty === 'peaceful' ? 0.4 : 1.0);
    const reduction = Math.min(0.75, armorDefense * 0.035);
    const finalDmg = Math.max(0.5, amount * mult * (1 - reduction));
    this.health = Math.max(0, this.health - finalDmg);
    this.hurtCooldown = 0.45;
    this.audio.playHurt();
    if (this.health <= 0) {
      this.dead = true;
      this.deathReason = reason || 'You fell in DillyVerse.';
    }
    return true;
  }

  eat(foodVal, healVal = 0) {
    if (this.hunger >= this.maxHunger && (!healVal || this.health >= this.maxHealth)) return false;
    this.hunger = Math.min(this.maxHunger, this.hunger + foodVal);
    if (healVal) this.health = Math.min(this.maxHealth, this.health + healVal);
    this.audio.playEat();
    return true;
  }

  update(dt, armorDefense = 0) {
    if (this.dead) return;
    const cdt = Math.min(dt, 0.05);
    if (this.hurtCooldown > 0) this.hurtCooldown -= cdt;
    if (this.swingAnim > 0) this.swingAnim = Math.max(0, this.swingAnim - cdt * 4.5);

    const feetBlock = this.world.getBlock(this.pos.x, this.pos.y + 0.25, this.pos.z);
    const headBlock = this.world.getBlock(this.pos.x, this.pos.y + EYE_STAND - 0.1, this.pos.z);
    const prevWater = this.inWater;
    this.inWater = feetBlock === B.WATER || headBlock === B.WATER;
    this.headInWater = headBlock === B.WATER;
    if (this.inWater && !prevWater) this.audio.playSplash();

    const inLava = feetBlock === B.LAVA || headBlock === B.LAVA;
    if (inLava) {
      this.lavaTimer += cdt;
      if (this.lavaTimer > 0.45) {
        this.lavaTimer = 0;
        this.takeDamage(4, armorDefense, 'Melted in subterranean lava.');
      }
    }

    // Underwater oxygen
    if (this.headInWater && this.mode === 'survival') {
      this.oxygen = Math.max(0, this.oxygen - cdt * 0.9);
      if (this.oxygen <= 0) this.takeDamage(2, 0, 'Ran out of breath underwater.');
    } else {
      this.oxygen = Math.min(10, this.oxygen + cdt * 3.5);
    }

    // Input direction
    this.crouching = !!(this.keys['ControlLeft'] || this.keys['ControlRight']);
    const fwd = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
    const strafe = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
    this.sprinting = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']) && fwd > 0 && !this.crouching && (this.mode === 'creative' || this.hunger > 4);

    let speed = 4.6;
    if (this.flying) speed = this.sprinting ? 14.0 : 9.0;
    else if (this.inWater) speed = 3.0;
    else if (this.crouching) speed = 2.1;
    else if (this.sprinting) speed = 6.9;

    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    let mx = -sinY * fwd + cosY * strafe;
    let mz = -cosY * fwd - sinY * strafe;
    const mlen = Math.hypot(mx, mz);
    if (mlen > 0.001) { mx /= mlen; mz /= mlen; }

    this.vel.x = mx * speed;
    this.vel.z = mz * speed;

    if (this.flying) {
      const up = (this.keys['Space'] ? 1 : 0) - (this.crouching ? 1 : 0);
      this.vel.y = up * 7.8;
    } else if (this.inWater) {
      this.vel.y -= 9.0 * cdt;
      if (this.keys['Space']) this.vel.y = Math.min(4.6, this.vel.y + 19.0 * cdt);
      this.vel.y *= 0.88;
    } else {
      this.vel.y -= 26.0 * cdt;
      if (this.vel.y < -42) this.vel.y = -42;
      if (this.keys['Space'] && this.onGround) {
        this.vel.y = 8.6;
        this.onGround = false;
      }
    }

    // Move X with optional crouch edge-guard
    const nextX = this.pos.x + this.vel.x * cdt;
    if (!this.collidesAt(nextX, this.pos.y, this.pos.z)) {
      if (this.crouching && this.onGround && !this.flying && !this.collidesAt(nextX, this.pos.y - 0.6, this.pos.z)) {
        this.vel.x = 0;
      } else {
        this.pos.x = nextX;
      }
    } else {
      this.vel.x = 0;
    }

    // Move Z with optional crouch edge-guard
    const nextZ = this.pos.z + this.vel.z * cdt;
    if (!this.collidesAt(this.pos.x, this.pos.y, nextZ)) {
      if (this.crouching && this.onGround && !this.flying && !this.collidesAt(this.pos.x, this.pos.y - 0.6, nextZ)) {
        this.vel.z = 0;
      } else {
        this.pos.z = nextZ;
      }
    } else {
      this.vel.z = 0;
    }

    // Move Y & Fall Damage
    const nextY = this.pos.y + this.vel.y * cdt;
    if (!this.collidesAt(this.pos.x, nextY, this.pos.z)) {
      this.pos.y = nextY;
      this.onGround = false;
      if (this.pos.y > this.highestAirY) this.highestAirY = this.pos.y;
    } else {
      if (this.vel.y < 0) {
        this.pos.y = Math.floor(nextY) + 1.0001;
        if (!this.onGround && !this.inWater && !this.flying) {
          const fallDist = this.highestAirY - this.pos.y;
          if (fallDist > 3.8) {
            this.takeDamage(Math.floor(fallDist - 3.2) * 1.5, armorDefense, 'Hit the ground too hard.');
          }
        }
        this.onGround = true;
        this.highestAirY = this.pos.y;
      }
      this.vel.y = 0;
    }
    if (this.inWater || this.flying) this.highestAirY = this.pos.y;

    // Footstep sounds
    if (this.onGround && mlen > 0.1 && !this.flying) {
      this.stepDist += speed * cdt;
      if (this.stepDist > (this.sprinting ? 2.1 : 1.7)) {
        this.stepDist = 0;
        const under = BLOCKS[this.world.getBlock(this.pos.x, this.pos.y - 0.3, this.pos.z)];
        this.audio.playStep(under ? under.mat : 'dirt');
      }
    }

    // Survival Hunger & Natural Health Regen
    if (this.mode === 'survival') {
      const drain = this.sprinting ? 0.095 : (mlen > 0.1 ? 0.028 : 0.008);
      this.hungerTimer += cdt * drain;
      if (this.hungerTimer >= 1) {
        this.hungerTimer = 0;
        this.hunger = Math.max(0, this.hunger - 0.5);
      }
      if (this.hunger >= 16 && this.health < this.maxHealth) {
        this.regenTimer += cdt;
        if (this.regenTimer >= 2.8) {
          this.regenTimer = 0;
          this.health = Math.min(this.maxHealth, this.health + 1);
        }
      } else if (this.hunger <= 0) {
        this.regenTimer += cdt;
        if (this.regenTimer >= 4.0) {
          this.regenTimer = 0;
          this.takeDamage(1, 0, 'Starved in the wilderness.');
        }
      }
    }

    // Sync camera
    const eyeH = this.crouching ? EYE_CROUCH : EYE_STAND;
    this.camera.position.set(this.pos.x, this.pos.y + eyeH, this.pos.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  // Fast 3D Voxel DDA Raycast (returns { x, y, z, nx, ny, nz, blockId, dist } or null)
  raycastBlock(maxDist = 5.5) {
    const origin = this.camera.position;
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(this.camera.rotation).normalize();

    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = dir.x >= 0 ? 1 : -1;
    const stepY = dir.y >= 0 ? 1 : -1;
    const stepZ = dir.z >= 0 ? 1 : -1;

    const tDeltaX = Math.abs(1 / (dir.x || 1e-8));
    const tDeltaY = Math.abs(1 / (dir.y || 1e-8));
    const tDeltaZ = Math.abs(1 / (dir.z || 1e-8));

    let tMaxX = ((stepX > 0 ? x + 1 : x) - origin.x) / (dir.x || 1e-8);
    let tMaxY = ((stepY > 0 ? y + 1 : y) - origin.y) / (dir.y || 1e-8);
    let tMaxZ = ((stepZ > 0 ? z + 1 : z) - origin.z) / (dir.z || 1e-8);

    let nx = 0, ny = 0, nz = 0;
    let t = 0;

    for (let i = 0; i < 64 && t <= maxDist; i++) {
      const bid = this.world.getBlock(x, y, z);
      const def = BLOCKS[bid];
      if (bid !== B.AIR && def && !def.liquid) {
        return { x, y, z, nx, ny, nz, blockId: bid, dist: t };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        t = tMaxX; tMaxX += tDeltaX; x += stepX; nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        t = tMaxY; tMaxY += tDeltaY; y += stepY; nx = 0; ny = -stepY; nz = 0;
      } else {
        t = tMaxZ; tMaxZ += tDeltaZ; z += stepZ; nx = 0; ny = 0; nz = -stepZ;
      }
    }
    return null;
  }

  wouldIntersectBlock(bx, by, bz) {
    const h = this.crouching ? 1.48 : PLAYER_HEIGHT;
    return (
      this.pos.x + PLAYER_HALF > bx && this.pos.x - PLAYER_HALF < bx + 1 &&
      this.pos.y + h > by && this.pos.y < by + 1 &&
      this.pos.z + PLAYER_HALF > bz && this.pos.z - PLAYER_HALF < bz + 1
    );
  }
}
