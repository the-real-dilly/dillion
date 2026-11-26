/* ==========================================================================
   DILLY STRIKE — render pipeline
   Linear (sRGB-correct) workflow, PCF soft shadows, procedural sky dome with
   sun haze + distant skyline, PMREM environment for metals, and a post chain:
   depth ambient occlusion -> bloom -> ACES + warm desert grade -> FXAA.
   Quality: ?q=low|medium|high (explicit) or automatic drop when FPS is low.
   AO pass adapted from last-zone/render.js (same project).
   ========================================================================== */
import * as THREE from 'three';
import { EffectComposer } from '../../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from '../../vendor/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from '../../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from '../../vendor/jsm/shaders/FXAAShader.js';
import { Pass, FullScreenQuad } from '../../vendor/jsm/postprocessing/Pass.js';
import { loadHDRI, initPhotoMaterials, onProgress, sweepReplaced } from './photomat.js';

// must run before any THREE.Color is created by main.js (ES modules evaluate imports first)
if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;

const qs = new URLSearchParams(location.search);
const qParam = (qs.get('q') || '').toLowerCase();
export const RQ = {
  level: ['low', 'medium', 'high'].includes(qParam) ? qParam : 'high',
  explicit: ['low', 'medium', 'high'].includes(qParam),
  ready: false
};

const R = { renderer: null, scene: null, camera: null, composer: null, sun: null, hemi: null, envTex: null, envMats: [], frames: 0, acc: 0, lastHemi: -1 };
export const RENDER = R;

/* ---------------- sky ---------------- */
function rnd(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Equirect/sphere canvas sky. mode 'sphere' = SphereGeometry UV layout (u = atan2(z,-x)/2π), 'equi' = three's equirect layout.
export function drawSky(W, H, sunDir, mode = 'sphere', opts = {}) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, H);
  const st = opts.stops || [[0, '#2f5f9a'], [0.25, '#5d8cc2'], [0.42, '#a8c4dc'], [0.49, '#ead9bd'], [0.5, '#e8cfa6'], [0.56, '#c9ab82'], [1, '#8f7454']];
  for (const [o, col] of st) gr.addColorStop(o, col);
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  const [dx, dy, dz] = sunDir;
  const phi = mode === 'sphere' ? Math.atan2(dz, -dx) : Math.atan2(dz, dx);
  let u = ((phi / (Math.PI * 2)) % 1 + 1) % 1; if (mode === 'equi') u = (u + 0.5) % 1;
  const el = Math.atan2(dy, Math.hypot(dx, dz)), v = 0.5 + el / Math.PI;
  const cx = u * W, cy = (1 - v) * H;
  // wispy high cloud streaks
  const r = rnd(7);
  if (!opts.noClouds) {
    x.globalCompositeOperation = 'screen';
    for (let i = 0; i < 70; i++) {
      const yy = H * (0.12 + r() * 0.3), xx = r() * W, w = W * (0.04 + r() * 0.12), h = H * (0.004 + r() * 0.012);
      const g = x.createRadialGradient(xx, yy, 0, xx, yy, w);
      g.addColorStop(0, `rgba(255,248,236,${0.05 + r() * 0.12})`); g.addColorStop(1, 'rgba(255,248,236,0)');
      x.save(); x.translate(xx, yy); x.scale(1, h / w); x.translate(-xx, -yy);
      x.fillStyle = g; x.beginPath(); x.arc(xx, yy, w, 0, 7); x.fill(); x.restore();
    }
    x.globalCompositeOperation = 'source-over';
  }
  // sun haze (wide) + bloom core
  for (const ox of [0, -W, W]) {
    const g = x.createRadialGradient(cx + ox, cy, 0, cx + ox, cy, W * 0.22);
    g.addColorStop(0, 'rgba(255,236,196,0.75)'); g.addColorStop(0.15, 'rgba(255,214,160,0.35)'); g.addColorStop(1, 'rgba(255,200,140,0)');
    x.fillStyle = g; x.fillRect(cx + ox - W * 0.22, cy - W * 0.22, W * 0.44, W * 0.44);
    const g2 = x.createRadialGradient(cx + ox, cy, 0, cx + ox, cy, W * 0.012);
    g2.addColorStop(0, 'rgba(255,255,250,1)'); g2.addColorStop(0.6, 'rgba(255,250,228,1)'); g2.addColorStop(1, 'rgba(255,240,200,0)');
    x.fillStyle = g2; x.fillRect(cx + ox - W * 0.02, cy - W * 0.02, W * 0.04, W * 0.04);
  }
  // horizon haze band
  const hz = x.createLinearGradient(0, H * 0.42, 0, H * 0.52);
  hz.addColorStop(0, 'rgba(236,214,178,0)'); hz.addColorStop(0.8, 'rgba(236,214,178,0.55)'); hz.addColorStop(1, 'rgba(226,200,160,0.7)');
  x.fillStyle = hz; x.fillRect(0, H * 0.42, W, H * 0.1);
  // distant dunes / mesas silhouette (bluish with aerial perspective)
  if (opts.hills === 'mountains') {
    const r3 = rnd(23);
    const ridge = (base, amp, rough, col) => {
      x.fillStyle = col; x.beginPath(); x.moveTo(0, H);
      const pts = 220; let y = 0, v = 0;
      for (let i = 0; i <= pts; i++) {
        v += (r3() - 0.5) * rough; v *= 0.92; y += v; y = Math.max(-1, Math.min(1, y));
        const peak = Math.pow(Math.abs(Math.sin(i / pts * Math.PI * 5 + base * 40)), 3);
        x.lineTo(i / pts * W, (base - amp * (0.35 + 0.45 * peak + 0.2 * y)) * H);
      }
      x.lineTo(W, H); x.closePath(); x.fill();
    };
    ridge(0.5, 0.09, 0.5, 'rgba(150,170,186,0.55)');
    ridge(0.5, 0.06, 0.7, 'rgba(118,138,140,0.75)');
    ridge(0.5, 0.032, 0.9, 'rgba(86,104,94,0.92)');
  } else if (!opts.noHills) {
    const r2 = rnd(11);
    for (const [base, amp, col] of [[0.495, 0.03, 'rgba(176,160,140,0.55)'], [0.5, 0.016, 'rgba(198,172,134,0.75)']]) {
      x.fillStyle = col; x.beginPath(); x.moveTo(0, H);
      let yv = base;
      for (let i = 0; i <= 160; i++) { yv += (r2() - 0.5) * amp * 0.5; yv = Math.min(base, Math.max(base - amp, yv)); x.lineTo(i / 160 * W, yv * H); }
      x.lineTo(W, H); x.closePath(); x.fill();
    }
  }
  // dither to kill gradient banding (visible near the zenith after tone mapping)
  const id = x.getImageData(0, 0, W, H), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 6; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  if (mode === 'equi') t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

/* ---------------- AO pass (depth-only SSAO) ---------------- */
class AOPass extends Pass {
  constructor(scene, camera, HDR) {
    super(); this.needsSwap = false; this.scene = scene; this.camera = camera;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: HDR, depthTexture: new THREE.DepthTexture(4, 4, THREE.UnsignedIntType) });
    this.u = { tColor: { value: null }, tDepth: { value: null }, res: { value: new THREE.Vector2(1, 1) }, near: { value: 0.05 }, far: { value: 260 }, projScale: { value: 500 }, amt: { value: 0.9 }, rad: { value: 0.55 } };
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: this.u, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D tColor, tDepth; uniform vec2 res; uniform float near, far, projScale, amt, rad; varying vec2 vUv;
        float lin(float d){ return near * far / (far - d * (far - near)); }
        float h12(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){
          vec3 col = texture2D(tColor, vUv).rgb; float d = texture2D(tDepth, vUv).x;
          if (d < 1.0 && amt > 0.0) {
            float z = lin(d);
            if (z > 0.6 && z < 90.0) {
              float rpx = clamp(rad * projScale / z, 2.0, 40.0), occ = 0.0, rot = h12(vUv * res) * 6.283;
              for (int i = 0; i < 12; i++) { float fi = float(i) + 0.5, a = fi * 2.39996 + rot, rr = sqrt(fi / 12.0) * rpx;
                float zs = lin(texture2D(tDepth, vUv + vec2(cos(a), sin(a)) * rr / res).x), dz = z - zs;
                occ += smoothstep(0.02, 0.25, dz) * (1.0 - smoothstep(rad * 2.0, rad * 4.0, dz)); }
              col *= 1.0 - amt * clamp(occ / 12.0 * 1.5, 0.0, 0.75) * (1.0 - smoothstep(50.0, 90.0, z));
            }
          }
          gl_FragColor = vec4(col, 1.0);
        }`
    }));
  }
  setSize(w, h) { this.rt.setSize(w, h); this.u.res.value.set(w, h); }
  render(renderer, writeBuffer, readBuffer) {
    const cam = this.camera; this.u.near.value = cam.near; this.u.far.value = cam.far;
    this.u.projScale.value = this.u.res.value.y / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    renderer.setRenderTarget(this.rt); renderer.clear(); renderer.render(this.scene, cam);
    this.u.tColor.value = this.rt.texture; this.u.tDepth.value = this.rt.depthTexture;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer); this.quad.render(renderer);
  }
}

/* ---------------- grade: ACES + warm desert split-tone, vignette, grain, -> sRGB ---------------- */
const GRADE = {
  uniforms: {
    tDiffuse: { value: null }, exposure: { value: 1 }, sat: { value: 1.04 }, contrast: { value: 0.16 }, vig: { value: 0.32 }, grain: { value: 0.018 }, time: { value: 0 },
    res: { value: new THREE.Vector2(1, 1) }, warm: { value: new THREE.Vector3(1.0, 0.84, 0.62) }, cool: { value: new THREE.Vector3(0.3, 0.4, 0.5) }, split: { value: 0.8 }
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float exposure, sat, contrast, vig, grain, time, split; uniform vec2 res; uniform vec3 warm, cool; varying vec2 vUv;
    vec3 dsGradeRRT(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 dsGradeAces(vec3 c){
      const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      c *= exposure / 0.6; c = I * c; c = dsGradeRRT(c); c = O * c; return clamp(c, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5; float r2 = dot(d, d);
      vec3 c = toSRGB(dsGradeAces(texture2D(tDiffuse, vUv).rgb));
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float sh = 1.0 - smoothstep(0.0, 0.5, l), hi = smoothstep(0.45, 1.0, l);
      c += ((cool - vec3(0.4)) * 0.16 * sh + (warm - vec3(0.65)) * 0.12 * hi) * split;
      c = mix(vec3(l), c, sat);
      c = mix(c, c * c * (3.0 - 2.0 * c), contrast);
      c *= 1.0 - vig * smoothstep(0.14, 0.7, r2 * 1.6);
      c += (hash(vUv * res + fract(time) * 91.7) - 0.5) * grain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`
};

/* ---------------- lighting presets (one per map) ---------------- */
export const PRESETS = {
  // warm late-afternoon desert sun: lower elevation for longer, readable shadows
  // hdri: CC0 panorama used for image-based ambient/reflections once it streams in (sun disc clamped,
  // rotated to match `sun`, normalised to `hdriMean`); hemiMul scales the hemisphere fill while it is active
  desert: { id: 'desert', sun: [0.62, 0.56, 0.36], sunCol: 0xffdcb0, sunI: 2.35, hemi: [0xc9d6e8, 0xb48c5e, 0.66], fog: [0xd9c7a6, 0.0062], exp: 1.0, sky: {},
    hdri: 'goegap_1k.hdr', hdriMean: 0.6, hdriSat: 0.45, hemiMul: 0.55, hdriExp: 1.0 },
  // cool mountain morning: low sun through thin mist, green-grey stone, distant ridges
  mountain: { id: 'mountain', sun: [-0.52, 0.5, 0.58], sunCol: 0xffe4c4, sunI: 2.2, hemi: [0xc2d2e6, 0x6f6a5c, 0.7], fog: [0xc4ccd0, 0.0078], exp: 1.1,
    sky: { stops: [[0, '#3d6a98'], [0.25, '#7ea2c4'], [0.42, '#c4d4de'], [0.49, '#e4e2d8'], [0.5, '#d8d8cc'], [0.56, '#9aa49a'], [1, '#5d6658']], hills: 'mountains' },
    hdri: 'fouriesburg_mountain_cloudy_1k.hdr', hdriMean: 0.66, hdriSat: 0.7, hemiMul: 0.5, hdriExp: 1.05 }
};
const PCACHE = {};
export function applyLighting(p) {
  const { sun, hemi, scene, renderer } = R; if (!sun) return;
  R.preset = p;
  const sd = new THREE.Vector3(...p.sun).normalize();
  sun.position.copy(sd).multiplyScalar(70); sun.color.setHex(p.sunCol); sun.intensity = p.sunI;
  hemi.color.setHex(p.hemi[0]); hemi.groundColor.setHex(p.hemi[1]); hemi.intensity = p.hemi[2];
  if (scene.fog) { scene.fog.color.setHex(p.fog[0]); scene.fog.density = p.fog[1]; }
  renderer.toneMappingExposure = p.exp;
  const C = PCACHE[p.id] || (PCACHE[p.id] = {});
  if (!C.sky) C.sky = drawSky(2048, 1024, [sd.x, sd.y, sd.z], 'sphere', p.sky);
  if (R.sky) { R.sky.material.map = C.sky; R.sky.material.needsUpdate = true; }
  if (C.env === undefined) {
    try {
      const pm = new THREE.PMREMGenerator(renderer);
      const eq = drawSky(512, 256, [sd.x, sd.y, sd.z], 'equi', Object.assign({ noClouds: true }, p.sky));
      C.env = pm.fromEquirectangular(eq).texture; eq.dispose(); pm.dispose();
    } catch (e) { C.env = null; }
  }
  setEnv(p, C);
  if (p.hdri && C.hdr === undefined) {
    C.hdr = null; // loading
    loadHDRI(p.hdri, { sun: [sd.x, sd.y, sd.z], mean: p.hdriMean, sat: p.hdriSat }).then((t) => { C.hdr = t; if (t && R.preset === p) setEnv(p, C); });
  }
}
// image-based light: the HDRI (when loaded) becomes scene.environment for every PBR material and the
// explicit envMap of registered metals; until then (or offline) the procedural sky env is used as before
function setEnv(p, C) {
  const env = C.hdr || C.env;
  R.envTex = env;
  R.ibl = !!C.hdr;
  R.scene.environment = C.hdr || null;
  R.hemiMul = C.hdr ? p.hemiMul : 1;
  R.baseHemi = p.hemi[2];
  if (C.hdr && p.hdriExp) R.renderer.toneMappingExposure = p.exp * p.hdriExp;
  for (const m of R.envMats) { if (m.userData.lowStash) m.userData.lowStash.e = env; else m.envMap = env; }
  R.lastHemi = -1;
}
/* every render (main post chain, AO pass, trailer post): the hemisphere fill is scaled down while the HDRI
   lights the scene, and env intensity follows the hemisphere (the trailer animates it for time of day) */
function iblBefore() {
  const h = R.hemi; if (!h) return;
  R._hemiI = h.intensity;
  if (h.intensity !== R.lastHemi) {
    R.lastHemi = h.intensity;
    const s = THREE.MathUtils.clamp(h.intensity / (R.baseHemi || 0.66), 0.12, 1.6);
    R.scene.traverse((o) => {
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) if (m.isMeshStandardMaterial) m.envMapIntensity = (m.userData.envK != null ? m.userData.envK : 1) * s;
    });
  }
  if (R.ibl) h.intensity *= R.hemiMul;
}
function iblAfter() { if (R.hemi && R._hemiI != null) { R.hemi.intensity = R._hemiI; R._hemiI = null; } }

/* ---------------- setup ---------------- */
export function initRender(renderer, scene, camera, sun, hemi) {
  Object.assign(R, { renderer, scene, camera, sun, hemi });
  initPhotoMaterials(renderer);
  scene.onBeforeRender = iblBefore; scene.onAfterRender = iblAfter;
  onProgress((st) => { if (st.done && st.loaded) setTimeout(() => sweepReplaced(scene), 0); }); // free the procedural maps photos replaced
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; // used by the direct (low quality) path and the trailer fallback
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { near: 20, far: 150, left: -50, right: 50, top: 46, bottom: -46 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.035; sun.shadow.radius = 2.2;
  // keep the SphereGeometry/BackSide sky mesh (trailer.js finds and re-maps it); presets swap its texture
  const sky = scene.children.find((o) => o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry' && o.material && o.material.side === THREE.BackSide);
  if (sky) {
    if (sky.material.map) sky.material.map.dispose();
    sky.material.toneMapped = true; sky.material.needsUpdate = true;
    sky.geometry.dispose(); sky.geometry = new THREE.SphereGeometry(190, 48, 24);
    R.sky = sky;
  }
  applyLighting(PRESETS.desert);

  // post chain
  const HDR = renderer.capabilities.isWebGL2 || renderer.extensions.has('EXT_color_buffer_half_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: HDR }));
  const renderPass = new RenderPass(scene, camera);
  const ao = new AOPass(scene, camera, HDR);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.5, 1.6);
  const grade = new ShaderPass(GRADE);
  const fxaa = new ShaderPass(FXAAShader);
  composer.addPass(ao); composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(grade); composer.addPass(fxaa);
  Object.assign(R, { composer, renderPass, ao, bloom, grade, fxaa, HDR });
  window.addEventListener('resize', resize);
  setQuality(RQ.level);
  RQ.ready = true;
  return R;
}

export function registerEnv(mat, k = 1) {
  if (!mat || !R.envTex) return mat;
  mat.envMap = R.envTex; mat.envMapIntensity = k; mat.userData.envK = k; mat.needsUpdate = true;
  R.envMats.push(mat);
  return mat;
}

export function resize() {
  const { renderer, composer, camera, fxaa, grade } = R; if (!renderer) return;
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(R.pr); renderer.setSize(w, h);
  composer.setPixelRatio(R.pr); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  const W = Math.floor(w * R.pr), H = Math.floor(h * R.pr);
  fxaa.material.uniforms.resolution.value.set(1 / W, 1 / H); grade.uniforms.res.value.set(W, H);
}

export function setQuality(level) {
  RQ.level = level;
  const dpr = window.devicePixelRatio || 1;
  R.pr = level === 'high' ? Math.min(dpr, 1.5) : level === 'medium' ? Math.min(dpr, 1.25) : Math.min(dpr, 1) * 0.85;
  R.post = level !== 'low';
  R.ao.enabled = level === 'high';
  R.renderPass.enabled = level !== 'high';
  R.bloom.enabled = level !== 'low';
  const sz = level === 'low' ? 1024 : 2048;
  if (R.sun.shadow.mapSize.x !== sz) {
    R.sun.shadow.mapSize.set(sz, sz);
    if (R.sun.shadow.map) { R.sun.shadow.map.dispose(); R.sun.shadow.map = null; }
  }
  R.renderer.shadowMap.type = level === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  R.renderer.shadowMap.needsUpdate = true;
  // low: strip normal/roughness detail maps and env reflections (restored when the level goes back up)
  applyStrip(level === 'low');
  document.documentElement.dataset.gfx = level;
  resize();
}
function applyStrip(strip) {
  if (R.scene) {
    R.stripped = strip; R.lastStrip = performance.now();
    R.scene.traverse((o) => {
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) {
        if (!m.isMeshStandardMaterial) continue;
        if (strip) { if (m.normalMap || m.envMap) { m.userData.lowStash = { n: m.normalMap, e: m.envMap }; m.normalMap = null; m.envMap = null; m.needsUpdate = true; } }
        else if (m.userData.lowStash) { m.normalMap = m.userData.lowStash.n; m.envMap = m.userData.lowStash.e; m.userData.lowStash = null; m.needsUpdate = true; }
      }
    });
  }
}

/* auto-drop: sample average FPS over 4 s windows (only when the quality was not chosen explicitly) */
function autoQuality(dtMs) {
  if (RQ.explicit || document.hidden) return;
  R.frames++; R.acc += dtMs;
  if (R.acc < 4000) return;
  const fps = R.frames * 1000 / R.acc; R.frames = 0; R.acc = 0;
  if (RQ.level === 'high' && fps < 42) setQuality('medium');
  else if (RQ.level === 'medium' && fps < 30) setQuality('low');
}

let lastNow = 0;
export function renderFrame(scene, camera) {
  const now = performance.now(); const dtMs = lastNow ? now - lastNow : 16; lastNow = now;
  if (dtMs < 250) autoQuality(dtMs);
  if (R.stripped && now - R.lastStrip > 2500) applyStrip(true); // catch late-loaded meshes
  if (!R.post) { R.renderer.setRenderTarget(null); R.renderer.render(scene, camera); return; }
  R.grade.uniforms.time.value = now / 1000;
  R.grade.uniforms.exposure.value = R.renderer.toneMappingExposure;
  R.ao.scene = scene; R.ao.camera = camera; R.renderPass.scene = scene; R.renderPass.camera = camera;
  R.composer.render();
}
