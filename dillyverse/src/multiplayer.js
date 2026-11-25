/* ==========================================================================
   DILLYVERSE — Real WebSocket Multiplayer Client
   Connects to a DillyVerse authoritative server for synced remote players,
   3D voxel avatars + nametags, live chat, and server-validated block edits.
   ========================================================================== */

import * as THREE from 'three';

function createAvatarMesh(name) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.86, 0.36),
    new THREE.MeshLambertMaterial({ color: 0x2b8a3e })
  );
  body.position.y = 0.95;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.48, 0.48),
    new THREE.MeshLambertMaterial({ color: 0xf1c27d })
  );
  head.position.y = 1.62;
  group.add(head);

  const legMat = new THREE.MeshLambertMaterial({ color: 0x2b4c7e });
  const lL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.56, 0.28), legMat);
  const lR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.56, 0.28), legMat);
  lL.position.set(-0.16, 0.28, 0);
  lR.position.set(0.16, 0.28, 0);
  group.add(lL, lR);

  // Floating nametag sprite
  const c = document.createElement('canvas');
  c.width = 256; c.height = 48;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(10,14,22,0.72)';
  ctx.fillRect(12, 6, 232, 36);
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillStyle = '#5ef2c0';
  ctx.textAlign = 'center';
  ctx.fillText(name.slice(0, 16), 128, 32);
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(1.8, 0.34, 1);
  sprite.position.y = 2.18;
  group.add(sprite);

  return group;
}

export const DILLYVERSE_WS_URL = 'wss://apibuild.dillonmay.com';

export class MultiplayerClient {
  constructor(scene, callbacks = {}) {
    this.scene = scene;
    this.cb = callbacks;
    this.ws = null;
    this.connected = false;
    this.playerId = null;
    this.username = 'Explorer';
    this.remotes = new Map(); // id -> { group, targetPos, targetYaw }
    this.lastSync = 0;
  }

  connect(username) {
    const url = DILLYVERSE_WS_URL;
    this.disconnect();
    this.username = (username || 'Explorer').trim().slice(0, 18) || 'Explorer';
    return new Promise((resolve, reject) => {
      let settled = false;
      try {
        this.ws = new WebSocket(url);
      } catch (err) {
        return reject(err);
      }
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.disconnect();
          reject(new Error('Connection timed out reaching ' + url));
        }
      }, 5000);

      this.ws.onopen = () => {
        this.ws.send(JSON.stringify({ type: 'join', name: this.username }));
      };
      this.ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (_) { return; }
        if (msg.type === 'welcome') {
          this.connected = true;
          this.playerId = msg.id;
          clearTimeout(timeout);
          if (!settled) { settled = true; resolve(msg); }
          if (msg.players) {
            for (const p of msg.players) if (p.id !== this.playerId) this.upsertRemote(p);
          }
        } else if (msg.type === 'player_join') {
          this.upsertRemote(msg.player);
          if (this.cb.onChat) this.cb.onChat('SYSTEM', `${msg.player.name} joined DillyVerse.`);
        } else if (msg.type === 'player_leave') {
          this.removeRemote(msg.id);
          if (this.cb.onChat && msg.name) this.cb.onChat('SYSTEM', `${msg.name} left the world.`);
        } else if (msg.type === 'player_move') {
          const r = this.remotes.get(msg.id);
          if (r) {
            r.targetPos.set(msg.x, msg.y, msg.z);
            r.targetYaw = msg.yaw;
          }
        } else if (msg.type === 'block_set') {
          if (this.cb.onBlockSet) this.cb.onBlockSet(msg.x, msg.y, msg.z, msg.blockId);
        } else if (msg.type === 'chat') {
          if (this.cb.onChat) this.cb.onChat(msg.name, msg.text);
        }
      };
      this.ws.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error('Could not reach DillyVerse server at ' + url));
        }
      };
      this.ws.onclose = () => {
        this.connected = false;
        this.clearRemotes();
        if (this.cb.onDisconnect) this.cb.onDisconnect();
      };
    });
  }

  upsertRemote(p) {
    if (this.remotes.has(p.id)) return;
    const group = createAvatarMesh(p.name || 'Player');
    group.position.set(p.x || 0, p.y || 40, p.z || 0);
    this.scene.add(group);
    this.remotes.set(p.id, { group, targetPos: group.position.clone(), targetYaw: p.yaw || 0 });
  }

  removeRemote(id) {
    const r = this.remotes.get(id);
    if (r) { this.scene.remove(r.group); this.remotes.delete(id); }
  }

  clearRemotes() {
    for (const r of this.remotes.values()) this.scene.remove(r.group);
    this.remotes.clear();
  }

  sendMove(x, y, z, yaw) {
    if (!this.connected || !this.ws || this.ws.readyState !== 1) return;
    const now = performance.now();
    if (now - this.lastSync < 65) return;
    this.lastSync = now;
    this.ws.send(JSON.stringify({ type: 'move', x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), yaw: +yaw.toFixed(2) }));
  }

  sendBlockSet(x, y, z, blockId) {
    if (!this.connected || !this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify({ type: 'block_set', x, y, z, blockId }));
  }

  sendChat(text) {
    if (!this.connected || !this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify({ type: 'chat', text: String(text).slice(0, 180) }));
  }

  update(dt) {
    for (const r of this.remotes.values()) {
      r.group.position.lerp(r.targetPos, Math.min(1, dt * 12));
      r.group.rotation.y = r.targetYaw;
    }
  }

  disconnect() {
    if (this.ws) { try { this.ws.close(); } catch (_) {} this.ws = null; }
    this.connected = false;
    this.clearRemotes();
  }
}
