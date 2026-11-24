// DILLION: LAST ZONE - visual effects: particles, tracers, muzzle flashes, shell casings, impacts, explosions, smoke, gas wall.
import * as THREE from "three";
import { R, TX } from "./render.js";
import { clamp, lerp } from "./util.js";
import { SURF } from "./world.js";

const PVS = `attribute vec4 aCol; attribute float aSize; uniform float uScale; varying vec4 vCol;
  void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.1), 0.0, 400.0); vCol = aCol; }`;
const PFS = `uniform sampler2D map; uniform float uAdd; varying vec4 vCol;
  void main(){ vec4 t = texture2D(map, gl_PointCoord); float a = t.a * vCol.a; if (a < 0.004) discard; gl_FragColor = vec4(vCol.rgb * (uAdd > 0.5 ? a : 1.0), uAdd > 0.5 ? 1.0 : a); }`;
const uScale = { value: 400 };
class Particles {
  constructor(cap, additive) {
    this.cap = cap; this.list = []; this.add = additive;
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 4); this.size = new Float32Array(cap);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aCol", new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({ uniforms: { uScale, map: { value: TX.smoke }, uAdd: { value: additive ? 1 : 0 } }, vertexShader: PVS, fragmentShader: PFS, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.pts = new THREE.Points(g, m); this.pts.frustumCulled = false; this.pts.renderOrder = additive ? 6 : 5; R.scene.add(this.pts);
  }
  spawn(o) { if (this.list.length >= this.cap) this.list.shift(); o.age = 0; this.list.push(o); return o; }
  update(dt) {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]; p.age += dt; if (p.age >= p.life) { this.list.splice(i, 1); continue; }
      p.vy -= (p.g || 0) * dt; const dr = Math.exp(-(p.drag || 0) * dt); p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    for (const p of this.list) {
      const k = p.age / p.life, fade = k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9;
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      this.col[n * 4] = p.r; this.col[n * 4 + 1] = p.gc; this.col[n * 4 + 2] = p.b; this.col[n * 4 + 3] = (p.a || 1) * Math.max(0, p.fadeIn ? fade : 1 - k);
      this.size[n] = lerp(p.s0, p.s1 != null ? p.s1 : p.s0, k); n++;
    }
    this.geo.setDrawRange(0, n);
    for (const k of ["position", "aCol", "aSize"]) this.geo.attributes[k].needsUpdate = true;
  }
}

export const FX = {};
export function initFX() {
  FX.smoke = new Particles(1400, false);
  FX.glow = new Particles(900, true);
  // tracers
  const cap = 96; FX.trCap = cap; FX.tracers = [];
  const tg = new THREE.BufferGeometry(); FX.trPos = new Float32Array(cap * 6); FX.trCol = new Float32Array(cap * 6);
  tg.setAttribute("position", new THREE.BufferAttribute(FX.trPos, 3).setUsage(THREE.DynamicDrawUsage)); tg.setAttribute("color", new THREE.BufferAttribute(FX.trCol, 3).setUsage(THREE.DynamicDrawUsage));
  FX.trLines = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); FX.trLines.frustumCulled = false; FX.trLines.renderOrder = 7; R.scene.add(FX.trLines);
  // muzzle light (one shared, for nearby shots)
  FX.light = new THREE.PointLight(0xffb070, 0, 14, 2); R.scene.add(FX.light); FX.lightT = 0;
  // shell casings
  FX.shellMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 0.9, roughness: 0.3 }), 64);
  FX.shellMesh.frustumCulled = false; FX.shells = []; R.scene.add(FX.shellMesh); FX.shellMesh.count = 0;
  // gas wall
  const gu = FX.gasU = { time: { value: 0 }, col: { value: new THREE.Color(0xd2662a) }, r: { value: 500 }, inside: { value: 0 } };
  const gm = new THREE.ShaderMaterial({
    uniforms: gu, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    vertexShader: `varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float time, r, inside; uniform vec3 col; varying vec3 vW; varying vec2 vUv;
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        float ang = atan(vW.z, vW.x); vec2 p = vec2(ang * r * 0.02, vW.y * 0.025);
        float n = vn(p + vec2(time * 0.15, -time * 0.05)) * 0.6 + vn(p * 3.1 + vec2(-time * 0.3, time * 0.1)) * 0.4;
        float hfade = 1.0 - smoothstep(60.0, 420.0, vW.y);
        float a = (0.18 + n * 0.32) * hfade;
        float band = smoothstep(0.0, 6.0, vW.y) * (1.0 - smoothstep(6.0, 14.0, vW.y)) * 0.25;
        vec3 c = col * (0.7 + n * 0.6) * 1.4;
        gl_FragColor = vec4(c, clamp(a + band, 0.0, 0.8));
      }`
  });
  FX.gasWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 700, 96, 1, true).translate(0, 330, 0), gm); FX.gasWall.renderOrder = 3; FX.gasWall.frustumCulled = false; R.scene.add(FX.gasWall);
  // next circle (thin white band)
  FX.nextRing = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 300, 96, 1, true).translate(0, 150, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  FX.nextRing.frustumCulled = false; R.scene.add(FX.nextRing);
  FX.grenades = new Map();
}

const SURF_FX = {
  [SURF.WATER]: { c: [0.75, 0.82, 0.85], n: 6, spark: 0, up: 3.2, s: 0.6 }, [SURF.SAND]: { c: [0.72, 0.64, 0.48], n: 6, up: 1.5 }, [SURF.GRASS]: { c: [0.42, 0.42, 0.3], n: 5, up: 1.2 },
  [SURF.ROCK]: { c: [0.55, 0.53, 0.5], n: 5, spark: 2, up: 1.5 }, [SURF.FARM]: { c: [0.45, 0.36, 0.26], n: 5, up: 1.3 }, [SURF.ROAD]: { c: [0.5, 0.49, 0.46], n: 5, spark: 1, up: 1.3 },
  [SURF.CONCRETE]: { c: [0.68, 0.66, 0.62], n: 6, spark: 1, up: 1.6 }, [SURF.DIRT]: { c: [0.5, 0.42, 0.32], n: 5, up: 1.2 }, [SURF.WOOD]: { c: [0.55, 0.42, 0.3], n: 5, up: 1.2 }, [SURF.METAL]: { c: [0.6, 0.6, 0.62], n: 2, spark: 6, up: 1 }
};
const rnd = (a, b) => a + Math.random() * (b - a);
export function impact(x, y, z, nx, ny, nz, s) {
  const F = SURF_FX[s] || SURF_FX[SURF.CONCRETE];
  for (let i = 0; i < F.n; i++) FX.smoke.spawn({ x, y, z, vx: nx * rnd(0.5, 2) + rnd(-0.6, 0.6), vy: ny * rnd(0.5, 2) + rnd(0, F.up), vz: nz * rnd(0.5, 2) + rnd(-0.6, 0.6), g: s === SURF.WATER ? 9 : 0.4, drag: 2.5, life: rnd(0.5, 1.1), s0: (F.s || 0.25), s1: (F.s || 0.25) * 4, r: F.c[0], gc: F.c[1], b: F.c[2], a: 0.75 });
  for (let i = 0; i < (F.spark || 0); i++) FX.glow.spawn({ x, y, z, vx: nx * rnd(2, 6) + rnd(-3, 3), vy: ny * rnd(2, 6) + rnd(0, 3), vz: nz * rnd(2, 6) + rnd(-3, 3), g: 12, drag: 1, life: rnd(0.12, 0.3), s0: 0.06, s1: 0.02, r: 1.6, gc: 1.0, b: 0.5 });
}
export function bodyHit(x, y, z, armor, blood) {
  if (armor) for (let i = 0; i < 5; i++) FX.glow.spawn({ x, y, z, vx: rnd(-3, 3), vy: rnd(0, 3), vz: rnd(-3, 3), g: 10, drag: 1, life: rnd(0.1, 0.22), s0: 0.05, s1: 0.02, r: 0.6, gc: 0.9, b: 1.6 });
  if (blood) for (let i = 0; i < 4; i++) FX.smoke.spawn({ x, y, z, vx: rnd(-1, 1), vy: rnd(-0.2, 1), vz: rnd(-1, 1), g: 3, drag: 3, life: rnd(0.25, 0.45), s0: 0.12, s1: 0.4, r: 0.32, gc: 0.05, b: 0.04, a: 0.7 });
  else for (let i = 0; i < 3; i++) FX.smoke.spawn({ x, y, z, vx: rnd(-1, 1), vy: rnd(0, 1), vz: rnd(-1, 1), g: 0, drag: 3, life: rnd(0.25, 0.4), s0: 0.12, s1: 0.45, r: 0.6, gc: 0.58, b: 0.52, a: 0.6 });
}
export function tracer(ax, ay, az, bx, by, bz, bright = 1) {
  if (FX.tracers.length >= FX.trCap) FX.tracers.shift();
  FX.tracers.push({ ax, ay, az, bx, by, bz, t: 0, life: 0.07 + Math.min(0.12, Math.hypot(bx - ax, by - ay, bz - az) / 2500), b: bright });
}
export function muzzle(x, y, z, dx, dy, dz, big, near) {
  const s = big ? 0.55 : 0.35;
  FX.glow.spawn({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0.05, s0: s * 1.8, s1: s, r: 2.4, gc: 1.5, b: 0.6 });
  FX.glow.spawn({ x: x + dx * 0.25, y: y + dy * 0.25, z: z + dz * 0.25, vx: dx * 3, vy: dy * 3, vz: dz * 3, life: 0.04, s0: s * 1.2, s1: s * 0.3, r: 2.0, gc: 1.2, b: 0.4 });
  FX.smoke.spawn({ x, y, z, vx: dx * 1.5 + rnd(-0.2, 0.2), vy: 0.4, vz: dz * 1.5 + rnd(-0.2, 0.2), drag: 2, life: 0.6, s0: 0.15, s1: 0.8, r: 0.7, gc: 0.7, b: 0.68, a: 0.25 });
  if (near) { FX.light.position.set(x, y, z); FX.light.intensity = 6; FX.lightT = 0.05; }
}
export function shell(x, y, z, rx, rz, gy) {
  if (FX.shells.length >= 64) FX.shells.shift();
  FX.shells.push({ x, y, z, vx: rx * rnd(1.5, 2.5) + rnd(-0.3, 0.3), vy: rnd(1.5, 2.6), vz: rz * rnd(1.5, 2.5) + rnd(-0.3, 0.3), t: 0, gy, rot: rnd(0, 6), spin: rnd(10, 20) });
}
export function explosion(x, y, z) {
  FX.glow.spawn({ x, y: y + 0.5, z, vx: 0, vy: 0, vz: 0, life: 0.18, s0: 9, s1: 4, r: 3, gc: 2, b: 1 });
  for (let i = 0; i < 18; i++) FX.glow.spawn({ x, y: y + 0.4, z, vx: rnd(-7, 7), vy: rnd(2, 9), vz: rnd(-7, 7), g: 6, drag: 2, life: rnd(0.25, 0.5), s0: rnd(1.0, 2.0), s1: 0.3, r: 2.2, gc: 1.1, b: 0.35 });
  for (let i = 0; i < 26; i++) FX.smoke.spawn({ x: x + rnd(-1, 1), y: y + rnd(0, 1.5), z: z + rnd(-1, 1), vx: rnd(-3, 3), vy: rnd(1, 4), vz: rnd(-3, 3), drag: 1.6, life: rnd(1.8, 3.2), s0: rnd(1.5, 2.5), s1: rnd(5, 8), r: 0.3, gc: 0.29, b: 0.27, a: 0.75 });
  for (let i = 0; i < 12; i++) FX.glow.spawn({ x, y: y + 0.2, z, vx: rnd(-12, 12), vy: rnd(4, 14), vz: rnd(-12, 12), g: 18, drag: 0.5, life: rnd(0.4, 0.9), s0: 0.1, s1: 0.04, r: 1.8, gc: 1.1, b: 0.4 });
  FX.light.position.set(x, y + 1, z); FX.light.intensity = 40; FX.lightT = 0.12;
}
export function smokeCloud(x, y, z, t) {
  // called each frame for active smoke grenades
  if (Math.random() < 0.6) FX.smoke.spawn({ x: x + rnd(-1, 1) * Math.min(7, t * 3), y: y + rnd(0.3, 2.5), z: z + rnd(-1, 1) * Math.min(7, t * 3), vx: rnd(-0.5, 0.5), vy: rnd(0.1, 0.5), vz: rnd(-0.5, 0.5), drag: 0.6, life: rnd(4, 6), s0: 3, s1: 7, r: 0.78, gc: 0.79, b: 0.8, a: 0.55, fadeIn: true });
}
export function landingDust(x, y, z) { for (let i = 0; i < 14; i++) { const a = i / 14 * 6.28; FX.smoke.spawn({ x, y: y + 0.1, z, vx: Math.cos(a) * 3, vy: 0.3, vz: Math.sin(a) * 3, drag: 2.5, life: 1.2, s0: 0.5, s1: 2.2, r: 0.6, gc: 0.56, b: 0.48, a: 0.6 }); } }
export function splash(x, y, z) { for (let i = 0; i < 12; i++) FX.smoke.spawn({ x, y, z, vx: rnd(-1.5, 1.5), vy: rnd(2, 5), vz: rnd(-1.5, 1.5), g: 10, drag: 1, life: 0.9, s0: 0.3, s1: 1, r: 0.85, gc: 0.9, b: 0.92, a: 0.7 }); }

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
export function updateFX(dt, cam, M) {
  uScale.value = R.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
  FX.smoke.update(dt); FX.glow.update(dt);
  // tracers
  let n = 0;
  for (let i = FX.tracers.length - 1; i >= 0; i--) { const t = FX.tracers[i]; t.t += dt; if (t.t > t.life) FX.tracers.splice(i, 1); }
  for (const t of FX.tracers) {
    const k = t.t / t.life, len = 0.35; const k0 = Math.max(0, k - len), k1 = Math.min(1, k + 0.15);
    FX.trPos.set([lerp(t.ax, t.bx, k0), lerp(t.ay, t.by, k0), lerp(t.az, t.bz, k0), lerp(t.ax, t.bx, k1), lerp(t.ay, t.by, k1), lerp(t.az, t.bz, k1)], n * 6);
    const b = t.b * (1 - k * 0.5); FX.trCol.set([1.6 * b * 0.6, 1.2 * b * 0.6, 0.5 * b * 0.6, 3.2 * b, 2.3 * b, 1.0 * b], n * 6); n++;
  }
  FX.trLines.geometry.setDrawRange(0, n * 2); FX.trLines.geometry.attributes.position.needsUpdate = true; FX.trLines.geometry.attributes.color.needsUpdate = true;
  if (FX.lightT > 0) { FX.lightT -= dt; if (FX.lightT <= 0) FX.light.intensity = 0; }
  // shells
  for (let i = FX.shells.length - 1; i >= 0; i--) { const s = FX.shells[i]; s.t += dt; if (s.t > 2.5) { FX.shells.splice(i, 1); continue; } if (s.y > s.gy) { s.vy -= 14 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.rot += s.spin * dt; } else { s.y = s.gy; if (s.vy < -1.5) { s.vy = -s.vy * 0.3; s.y = s.gy + 0.001; s.vx *= 0.4; s.vz *= 0.4; } } }
  FX.shells.forEach((s, i) => { _e.set(s.rot, s.rot * 0.7, 0); _q.setFromEuler(_e); _p.set(s.x, s.y, s.z); _m4.compose(_p, _q, _s); FX.shellMesh.setMatrixAt(i, _m4); });
  FX.shellMesh.count = FX.shells.length; FX.shellMesh.instanceMatrix.needsUpdate = true;
  // gas
  if (M && M.gas) {
    const g = M.gas; FX.gasWall.visible = true; FX.gasWall.position.set(g.cx, 0, g.cz); FX.gasWall.scale.set(Math.max(1, g.r), 1, Math.max(1, g.r)); FX.gasU.r.value = g.r; FX.gasU.time.value += dt;
    FX.nextRing.visible = g.ph !== "done" && g.nr > 1; FX.nextRing.position.set(g.nx, 0, g.nz); FX.nextRing.scale.set(Math.max(1, g.nr), 1, Math.max(1, g.nr));
  } else { FX.gasWall.visible = false; FX.nextRing.visible = false; }
}
