// DILLION: LAST ZONE - view layer: renderer, post-processing, sky, terrain, water and the static island.
import * as THREE from "three";
import { EffectComposer } from "../vendor/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "../vendor/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "../vendor/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "../vendor/jsm/postprocessing/UnrealBloomPass.js";
import { FXAAShader } from "../vendor/jsm/shaders/FXAAShader.js";
import { mergeBufferGeometries } from "../vendor/jsm/utils/BufferGeometryUtils.js";
import { HALF, CELL, N, SURF, terrainH, surfaceAt, POIS, groundAt } from "./world.js";
import { clamp, lerp, mulberry32 } from "./util.js";

if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
const lin = (hex) => new THREE.Color(hex); // Color() converts sRGB hex to linear when legacyMode is off
export const R = { quality: "high" };

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: "high-performance" });
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const HDR = renderer.capabilities.isWebGL2 || renderer.extensions.has("EXT_color_buffer_half_float") ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.2, 4200);
  scene.fog = new THREE.FogExp2(0x9aa0a0, 0.0012);
  // stencilBuffer forces a 24-bit depth renderbuffer (16-bit z-fights across a 2 km island)
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: HDR, stencilBuffer: true }));
  const renderPass = new RenderPass(scene, camera);
  const vmScene = new THREE.Scene(), vmCam = new THREE.PerspectiveCamera(55, 1, 0.02, 10);
  const vmPass = new RenderPass(vmScene, vmCam); vmPass.clear = false; vmPass.clearDepth = true; vmPass.enabled = false;
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.92);
  const grade = new ShaderPass(GRADE);
  const fxaa = new ShaderPass(FXAAShader);
  composer.addPass(renderPass); composer.addPass(vmPass); composer.addPass(bloom); composer.addPass(grade); composer.addPass(fxaa);
  Object.assign(R, { renderer, scene, camera, composer, renderPass, bloom, grade, fxaa, vmScene, vmCam, vmPass, HDR, pr: 1 });
  // lights
  const hemi = new THREE.HemisphereLight(0xbcc8d6, 0x4a4436, 0.55); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 900 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.4; scene.add(sun, sun.target);
  const vmLight = new THREE.DirectionalLight(0xffffff, 2.0); vmLight.position.set(1, 2, 1); vmScene.add(vmLight, new THREE.HemisphereLight(0xc8d0d8, 0x403830, 0.8));
  R.hemi = hemi; R.sun = sun; R.vmLight = vmLight;
  makeSky();
  window.addEventListener("resize", resize);
  setQuality("high");
  return R;
}

export const GRADE = {
  uniforms: {
    tDiffuse: { value: null }, exposure: { value: 1 }, sat: { value: 0.84 }, contrast: { value: 0.3 }, vig: { value: 0.42 }, grain: { value: 0.04 }, time: { value: 0 },
    res: { value: new THREE.Vector2(1, 1) }, warm: { value: new THREE.Vector3(1.0, 0.8, 0.58) }, cool: { value: new THREE.Vector3(0.22, 0.38, 0.46) }, lift: { value: 0.012 },
    gas: { value: 0 }, hurt: { value: 0 }, desat: { value: 0 }, scope: { value: 0 }
  },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float exposure, sat, contrast, vig, grain, time, lift, gas, hurt, desat, scope; uniform vec2 res; uniform vec3 warm, cool;
    varying vec2 vUv;
    vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 c){
      const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      c *= exposure / 0.6; c = I * c; c = RRTAndODTFit(c); c = O * c; return clamp(c, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5; float r2 = dot(d, d);
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = toSRGB(aces(c));
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float sh = 1.0 - smoothstep(0.0, 0.5, l), hi = smoothstep(0.45, 1.0, l);
      c += (cool - vec3(0.4)) * 0.18 * sh + (warm - vec3(0.65)) * 0.14 * hi;
      c = mix(vec3(l), c, sat * (1.0 - desat));
      c = mix(c, c * c * (3.0 - 2.0 * c), contrast);
      c += lift;
      // gas: toxic rust haze
      vec3 gcol = vec3(0.78, 0.42, 0.16);
      c = mix(c, c * 0.55 + gcol * 0.45 * (0.6 + l), gas * 0.75);
      c *= 1.0 - (vig + gas * 0.35) * smoothstep(0.12, 0.62, r2 * 1.6);
      // damage: desaturate + red edge
      c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), hurt * 0.5);
      c += vec3(0.45, 0.02, 0.0) * hurt * smoothstep(0.08, 0.5, r2 * 1.8);
      c += (hash(vUv * res + fract(time) * 91.7) - 0.5) * grain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`
};

export function resize() {
  const { renderer, composer, camera, fxaa, grade, vmCam } = R;
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(R.pr); composer.setPixelRatio(R.pr);
  renderer.setSize(w, h, false); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix(); vmCam.aspect = w / h; vmCam.updateProjectionMatrix();
  const W = Math.floor(w * R.pr), H = Math.floor(h * R.pr);
  fxaa.material.uniforms.resolution.value.set(1 / W, 1 / H); grade.uniforms.res.value.set(W, H);
}
export function setQuality(level) {
  R.quality = level; const hi = level === "high";
  R.pr = hi ? Math.min(window.devicePixelRatio || 1, 1.5) : Math.min(window.devicePixelRatio || 1, 1) * 0.75;
  R.bloom.enabled = hi; R.grade.uniforms.grain.value = hi ? 0.04 : 0.025;
  R.sun.shadow.mapSize.set(hi ? 2048 : 1024, hi ? 2048 : 1024);
  if (R.sun.shadow.map) { R.sun.shadow.map.dispose(); R.sun.shadow.map = null; }
  if (R.treeMeshes) for (const m of R.treeMeshes) m.castShadow = hi;
  R.scene.fog.density = R.fogBase ? R.fogBase * (hi ? 1 : 1.25) : R.scene.fog.density;
  resize();
}

// ---------------------------------------------------------------------------------------------
// sky
const skyU = { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, cloud: { value: 0.5 }, cloudCol: { value: new THREE.Color() }, cloudDark: { value: new THREE.Color() }, time: { value: 0 } };
function makeSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: "varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform vec3 top, mid, bot, sunCol, sunDir, cloudCol, cloudDark; uniform float cloud, time; varying vec3 vD;
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += vn(p) * a; p = p * 2.03 + 7.1; a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vD); float h = d.y;
        vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h, 0.0, 1.0), 0.5)) : mix(mid, bot, pow(clamp(-h * 3.0, 0.0, 1.0), 0.6));
        vec3 sd = normalize(sunDir); float s = max(dot(d, sd), 0.0);
        c += sunCol * (smoothstep(0.9993, 0.9997, s) * 8.0 + pow(s, 60.0) * 1.0 + pow(s, 8.0) * 0.35 + pow(s, 2.5) * 0.12);
        if (h > 0.0 && cloud > 0.0) {
          vec2 uv = d.xz / (h + 0.1) * 1.4 + vec2(time * 0.003, time * 0.001);
          float n = fbm(uv) * 0.7 + fbm(uv * 3.3 + 3.0) * 0.3;
          float cov = smoothstep(0.66 - cloud * 0.36, 0.95, n) * smoothstep(0.0, 0.1, h);
          float lit = 0.4 + 0.6 * pow(max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(sd.x, 0.0, sd.z))), 0.0), 2.0);
          vec3 cc = mix(cloudDark, cloudCol, lit * (0.5 + 0.5 * n)) + sunCol * pow(s, 6.0) * 0.4;
          c = mix(c, cc, cov * 0.9);
        }
        gl_FragColor = vec4(c, 1.0);
      }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3600, 32, 16), mat); sky.frustumCulled = false; sky.renderOrder = -10;
  R.scene.add(sky); R.sky = sky;
  R.envScene = new THREE.Scene(); R.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat));
  R.envGround = new THREE.Mesh(new THREE.CircleGeometry(48, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a3a30 })); R.envGround.position.y = -3; R.envScene.add(R.envGround);
  R.pmrem = new THREE.PMREMGenerator(R.renderer);
}
function updateEnv() { try { const rt = R.pmrem.fromScene(R.envScene, 0.03); if (R.envRT) R.envRT.dispose(); R.envRT = rt; R.scene.environment = rt.texture; if (R.vmScene) R.vmScene.environment = rt.texture; } catch (e) { /* ignore */ } }
export const PRESETS = {
  golden: { sunEl: 17, sunAz: 300, sunCol: [1.0, 0.74, 0.5], sunI: 2.2, hemiSky: 0x9fb2c8, hemiGround: 0x5a5040, hemiI: 0.5, top: 0x3f6589, mid: 0xd4b08a, bot: 0x5f6466, fog: 0xa49c8e, fogD: 0.0006, cloud: 0.45, cloudCol: 0xf0d2b4, cloudDark: 0x6c6670, exp: 0.92, water: 0x2a4a56 },
  overcast: { sunEl: 38, sunAz: 60, sunCol: [0.86, 0.88, 0.9], sunI: 1.25, hemiSky: 0xb7c0c6, hemiGround: 0x4c4a44, hemiI: 0.7, top: 0x6b7680, mid: 0xa7adaf, bot: 0x6a6f70, fog: 0x9da3a5, fogD: 0.00095, cloud: 1.0, cloudCol: 0xc4c8ca, cloudDark: 0x6d7378, exp: 1.08, water: 0x34474d }
};
export function applyPreset(name) {
  const P = PRESETS[name] || PRESETS.golden; R.preset = name;
  const el = P.sunEl * Math.PI / 180, az = P.sunAz * Math.PI / 180;
  R.sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
  skyU.sunDir.value.copy(R.sunDir); skyU.sunCol.value.setRGB(...P.sunCol).multiplyScalar(1.4);
  skyU.top.value.set(P.top); skyU.mid.value.set(P.mid); skyU.bot.value.set(P.bot); skyU.cloud.value = P.cloud; skyU.cloudCol.value.set(P.cloudCol); skyU.cloudDark.value.set(P.cloudDark);
  R.sun.color.setRGB(...P.sunCol); R.sun.intensity = P.sunI; R.hemi.color.set(P.hemiSky); R.hemi.groundColor.set(P.hemiGround); R.hemi.intensity = P.hemiI;
  R.scene.fog.color.set(P.fog); R.fogBase = P.fogD; R.scene.fog.density = P.fogD * (R.quality === "high" ? 1 : 1.25);
  R.grade.uniforms.exposure.value = P.exp;
  if (R.waterU) { R.waterU.deep.value.set(P.water); R.waterU.sunDir.value.copy(R.sunDir); R.waterU.sunCol.value.setRGB(...P.sunCol); R.waterU.skyCol.value.set(P.mid).lerp(new THREE.Color(P.top), 0.55); R.waterU.fogCol.value.set(P.fog); }
  R.vmLight.color.setRGB(...P.sunCol);
  R.envGround.material.color.set(P.hemiGround); updateEnv();
}
export function updateSun(x, z) {
  const s = R.sun, d = R.sunDir; s.position.set(x + d.x * 400, d.y * 400, z + d.z * 400); s.target.position.set(x, 0, z);
  // snap to texels to avoid shimmering
  s.target.updateMatrixWorld();
}

// ---------------------------------------------------------------------------------------------
// procedural textures
export function canvasTex(w, h, draw, srgb = true, rep = true) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); draw(x, w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.encoding = THREE.sRGBEncoding; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4; return t;
}
function noise(x, w, h, base, amt, n, sz = 2, seed = 1) {
  const r = mulberry32(seed); x.fillStyle = base; x.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) { const v = Math.floor(r() * 255); x.fillStyle = `rgba(${v},${v},${v},${amt})`; const s = sz * (0.5 + r()); x.fillRect(r() * w, r() * h, s, s); }
}
const TX = {};
function makeTextures() {
  TX.ground = canvasTex(256, 256, (x, w, h) => { noise(x, w, h, "#d8d8d8", 0.12, 9000, 3, 3); noise2(x, w, h); });
  function noise2(x, w, h) { const r = mulberry32(9); for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(40,40,30,${0.05 + r() * 0.07})`; x.beginPath(); x.arc(r() * w, r() * h, 3 + r() * 12, 0, 7); x.fill(); } }
  TX.plaster = canvasTex(256, 256, (x, w, h) => { noise(x, w, h, "#e6e1d6", 0.08, 6000, 2, 4); x.fillStyle = "rgba(60,50,40,0.18)"; x.fillRect(0, h - 18, w, 18); for (let i = 0; i < 30; i++) { x.fillStyle = `rgba(70,60,50,${0.03 + Math.random() * 0.05})`; x.fillRect(Math.random() * w, Math.random() * h * 0.8, 4 + Math.random() * 30, 40 + Math.random() * 120); } });
  TX.brick = canvasTex(256, 256, (x, w, h) => { x.fillStyle = "#7a6a5e"; x.fillRect(0, 0, w, h); const r = mulberry32(5); for (let j = 0; j < 16; j++) for (let i = 0; i < 8; i++) { const v = 150 + r() * 60; x.fillStyle = `rgb(${v},${v * 0.62},${v * 0.48})`; x.fillRect(i * 32 + (j % 2) * 16 + 1, j * 16 + 1, 30, 14); } });
  TX.wood = canvasTex(256, 256, (x, w, h) => { const r = mulberry32(6); for (let i = 0; i < 16; i++) { const v = 150 + r() * 50; x.fillStyle = `rgb(${v},${v * 0.8},${v * 0.62})`; x.fillRect(i * 16, 0, 16, h); x.fillStyle = "rgba(30,20,10,0.5)"; x.fillRect(i * 16, 0, 1.5, h); } noise(x, 0, 0, "#000", 0, 0); for (let k = 0; k < 2500; k++) { x.fillStyle = `rgba(40,25,10,${r() * 0.12})`; x.fillRect(r() * w, r() * h, 1, 6 + r() * 20); } });
  TX.metal = canvasTex(256, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, 32, 0); g.addColorStop(0, "#cfd2d0"); g.addColorStop(0.5, "#8f9492"); g.addColorStop(1, "#cfd2d0"); x.fillStyle = g; for (let i = 0; i < 8; i++) { x.save(); x.translate(i * 32, 0); x.fillRect(0, 0, 32, h); x.restore(); } const r = mulberry32(7); for (let k = 0; k < 60; k++) { x.fillStyle = `rgba(110,60,30,${r() * 0.18})`; x.fillRect(r() * w, r() * h, 2 + r() * 8, 10 + r() * 60); } });
  TX.concrete = canvasTex(256, 256, (x, w, h) => { noise(x, w, h, "#c4c2bc", 0.1, 7000, 2, 8); x.strokeStyle = "rgba(60,60,60,0.35)"; x.lineWidth = 2; x.strokeRect(1, 1, w - 2, h - 2); x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.stroke(); const r = mulberry32(10); for (let k = 0; k < 20; k++) { x.fillStyle = `rgba(50,45,40,${0.03 + r() * 0.06})`; x.fillRect(r() * w, r() * h, 6 + r() * 30, 30 + r() * 90); } });
  TX.tower = canvasTex(256, 256, (x, w, h) => { // 2x2 bays of curtain wall with blinds and reflections
    const r = mulberry32(21); x.fillStyle = "#b9b7b0"; x.fillRect(0, 0, w, h);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const X = i * 128, Y = j * 128; const g = x.createLinearGradient(X, Y + 16, X + 40, Y + 120); g.addColorStop(0, "#6f8798"); g.addColorStop(0.5, "#3d5262"); g.addColorStop(1, "#1f2b35"); x.fillStyle = g; x.fillRect(X + 8, Y + 14, 112, 98);
      const bl = r() * 0.7; x.fillStyle = "rgba(205,200,185,0.85)"; x.fillRect(X + 8, Y + 14, 112, 98 * bl * (r() < 0.5 ? 1 : 0.3));
      x.fillStyle = "rgba(255,255,255,0.10)"; x.beginPath(); x.moveTo(X + 8, Y + 112); x.lineTo(X + 70, Y + 14); x.lineTo(X + 100, Y + 14); x.lineTo(X + 38, Y + 112); x.fill();
      x.fillStyle = "#33383d"; x.fillRect(X + 62, Y + 14, 4, 98); x.fillRect(X + 8, Y + 60, 112, 3);
      x.fillStyle = "#8d8a83"; x.fillRect(X, Y + 112, 128, 16);
    } });
  TX.glass = canvasTex(128, 128, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#41505c"); g.addColorStop(1, "#1d252c"); x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = "#2c2f31"; x.fillRect(0, 0, 6, h); x.fillRect(0, 0, w, 6); });
  TX.roof = canvasTex(256, 256, (x, w, h) => { noise(x, w, h, "#77736c", 0.12, 8000, 2, 12); x.strokeStyle = "rgba(40,40,40,0.4)"; for (let i = 0; i < 4; i++) { x.strokeRect(i * 64 + 4, 4, 56, 120); } });
  TX.tiles = canvasTex(256, 256, (x, w, h) => { x.fillStyle = "#6a3b2c"; x.fillRect(0, 0, w, h); for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) { const v = 0.75 + Math.random() * 0.3; x.fillStyle = `rgb(${130 * v},${70 * v},${50 * v})`; x.fillRect(i * 16 + (j % 2) * 8, j * 16, 15, 13); x.fillStyle = "rgba(0,0,0,0.3)"; x.fillRect(i * 16 + (j % 2) * 8, j * 16 + 13, 15, 3); } });
  TX.road = canvasTex(64, 256, (x, w, h) => { noise(x, w, h, "#55524d", 0.15, 3000, 2, 13); x.fillStyle = "rgba(220,210,170,0.8)"; for (let j = 0; j < h; j += 64) x.fillRect(w / 2 - 1.5, j, 3, 32); x.fillStyle = "rgba(230,230,230,0.55)"; x.fillRect(2, 0, 2, h); x.fillRect(w - 4, 0, 2, h); });
  TX.runway = canvasTex(256, 512, (x, w, h) => { noise(x, w, h, "#4a4844", 0.12, 9000, 2, 14); x.fillStyle = "rgba(235,235,230,0.85)"; for (let j = 0; j < h; j += 64) x.fillRect(w / 2 - 3, j, 6, 36); x.fillRect(6, 0, 5, h); x.fillRect(w - 11, 0, 5, h); });
  TX.crate = canvasTex(128, 128, (x, w, h) => { x.fillStyle = "#4d5233"; x.fillRect(0, 0, w, h); x.strokeStyle = "#2b2e1c"; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6); x.fillStyle = "#ff7a45"; x.fillRect(0, 54, w, 20); x.fillStyle = "#1a1a12"; x.font = "bold 16px sans-serif"; x.fillText("Z-9", 46, 70); });
  TX.container = canvasTex(256, 64, (x, w, h) => { const g = x.createLinearGradient(0, 0, 12, 0); g.addColorStop(0, "#ffffff"); g.addColorStop(0.5, "#b8b8b8"); g.addColorStop(1, "#ffffff"); for (let i = 0; i < w; i += 12) { x.fillStyle = g; x.save(); x.translate(i, 0); x.fillRect(0, 0, 12, h); x.restore(); } x.fillStyle = "rgba(90,50,20,0.25)"; for (let k = 0; k < 30; k++) x.fillRect(Math.random() * w, Math.random() * h, 3, 10); });
  TX.field = [canvasTex(64, 64, (x, w, h) => { x.fillStyle = "#a89656"; x.fillRect(0, 0, w, h); for (let i = 0; i < w; i += 8) { x.fillStyle = "#c2ad66"; x.fillRect(i, 0, 5, h); } }), canvasTex(64, 64, (x, w, h) => { x.fillStyle = "#4f5a2c"; x.fillRect(0, 0, w, h); for (let i = 0; i < w; i += 8) { x.fillStyle = "#6c7a38"; x.fillRect(i, 0, 5, h); } }), canvasTex(64, 64, (x, w, h) => { x.fillStyle = "#5a4636"; x.fillRect(0, 0, w, h); for (let i = 0; i < w; i += 8) { x.fillStyle = "#6e5845"; x.fillRect(i, 0, 4, h); } })];
  TX.smoke = canvasTex(64, 64, (x, w, h) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.5, "rgba(255,255,255,0.5)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, w, h); }, false, false);
}
export { TX };

// ---------------------------------------------------------------------------------------------
// geometry accumulator (non-indexed)
export class Acc {
  constructor() { this.p = []; this.n = []; this.c = []; this.u = []; }
  tri(a, b, c, n, col, ua, ub, uc) { this.p.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) { this.n.push(...n); this.c.push(col.r, col.g, col.b); } this.u.push(...ua, ...ub, ...uc); }
  quad(a, b, c, d, n, col, ua, ub, uc, ud) { this.tri(a, b, c, n, col, ua, ub, uc); this.tri(a, c, d, n, col, ua, uc, ud); }
  // world-UV box; top faces may go to another accumulator
  box(x0, x1, y0, y1, z0, z1, col, us = 4, top = this, faces = 63, vs = us) {
    const U = (a, b) => [a / us, b / vs];
    if (faces & 1) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], col, U(-z1, y0), U(-z0, y0), U(-z0, y1), U(-z1, y1));
    if (faces & 2) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], col, U(z0, y0), U(z1, y0), U(z1, y1), U(z0, y1));
    if (faces & 4) top.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], col, U(x0, -z1), U(x1, -z1), U(x1, -z0), U(x0, -z0));
    if (faces & 8) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], col, U(x0, z0), U(x1, z0), U(x1, z1), U(x0, z1));
    if (faces & 16) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], col, U(x0, y0), U(x1, y0), U(x1, y1), U(x0, y1));
    if (faces & 32) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], col, U(-x1, y0), U(-x0, y0), U(-x0, y1), U(-x1, y1));
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(this.u, 2));
    g.computeBoundingSphere(); return g;
  }
  get empty() { return this.p.length === 0; }
}
function addMesh(geo, mat, cast = true, recv = true, parent = R.scene) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; m.matrixAutoUpdate = false; m.updateMatrix(); parent.add(m); return m; }
const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.9, metalness: 0 }, o));

// ---------------------------------------------------------------------------------------------
// static island
export function buildIsland(W) {
  makeTextures();
  const scene = R.scene; R.W = W;
  buildTerrain(W);
  buildWater(W);
  buildRoads(W);
  buildFields(W);
  buildBuildings(W);
  buildProps(W);
  buildNature(W);
  buildSpecials(W);
}

const SCOL = {
  [SURF.WATER]: 0x8d8264, [SURF.SAND]: 0xc6b38c, [SURF.GRASS]: 0x67703f, [SURF.ROCK]: 0x85817a, [SURF.FARM]: 0x6f5b45, [SURF.ROAD]: 0x6a6660, [SURF.CONCRETE]: 0x8f8d86, [SURF.DIRT]: 0x7a6a52
};
function buildTerrain(W) {
  const CH = 50, nC = (N - 1) / CH, mat = std({ map: TX.ground, vertexColors: true, roughness: 0.95 });
  const col = new THREE.Color(), tmp = new THREE.Color();
  const r = mulberry32(77);
  const vcol = new Float32Array(N * N * 3);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, x = i * CELL - HALF, z = j * CELL - HALF, h = W.H[k], s = W.S[k];
    col.set(SCOL[s] || SCOL[SURF.GRASS]);
    if (s === SURF.GRASS) { const v = Math.sin(x * 0.013 + Math.cos(z * 0.011) * 2) * 0.5 + 0.5; tmp.set(0x4f5a2f); col.lerp(tmp, v * 0.45); tmp.set(0x8a8450); col.lerp(tmp, clamp((h - 30) / 40, 0, 0.35)); }
    if (s === SURF.SAND) { tmp.set(0x9c8f6c); col.lerp(tmp, clamp((1.4 - h) / 3, 0, 1) * 0.6); }
    if (s === SURF.WATER) { tmp.set(0x5c5844); col.lerp(tmp, clamp(-h / 12, 0, 1)); }
    // neighbour smoothing of surface edges
    const ii = Math.min(N - 2, i), jj = Math.min(N - 2, j);
    if (W.S[jj * N + ii + 1] !== s || W.S[(jj + 1) * N + ii] !== s) { const s2 = W.S[jj * N + ii + 1] !== s ? W.S[jj * N + ii + 1] : W.S[(jj + 1) * N + ii]; tmp.set(SCOL[s2] || SCOL[SURF.GRASS]); col.lerp(tmp, 0.35); }
    const vv = 0.92 + r() * 0.12; vcol[k * 3] = col.r * vv; vcol[k * 3 + 1] = col.g * vv; vcol[k * 3 + 2] = col.b * vv;
  }
  R.terrain = [];
  for (let cj = 0; cj < nC; cj++) for (let ci = 0; ci < nC; ci++) {
    const n1 = CH + 1, pos = new Float32Array(n1 * n1 * 3), cl = new Float32Array(n1 * n1 * 3), uv = new Float32Array(n1 * n1 * 2);
    for (let j = 0; j < n1; j++) for (let i = 0; i < n1; i++) {
      const gi = ci * CH + i, gj = cj * CH + j, k = gj * N + gi, v = j * n1 + i;
      pos[v * 3] = gi * CELL - HALF; pos[v * 3 + 1] = W.H[k]; pos[v * 3 + 2] = gj * CELL - HALF;
      cl[v * 3] = vcol[k * 3]; cl[v * 3 + 1] = vcol[k * 3 + 1]; cl[v * 3 + 2] = vcol[k * 3 + 2];
      uv[v * 2] = pos[v * 3] / 7; uv[v * 2 + 1] = pos[v * 3 + 2] / 7;
    }
    const idx = [];
    for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) { const a = j * n1 + i, b = a + 1, c = a + n1 + 1, d = a + n1; idx.push(a, c, b, a, d, c); }
    const g = new THREE.BufferGeometry(); g.setIndex(idx);
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(cl, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.computeVertexNormals(); g.computeBoundingSphere();
    let minH = 1e9; for (let q = 1; q < pos.length; q += 3) minH = Math.min(minH, pos[q]);
    if (minH > -25 || true) R.terrain.push(addMesh(g, mat, false, true));
  }
  // sea floor skirt far out
  const sf = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), std({ color: 0x3b4038 })); sf.position.y = -32; R.scene.add(sf);
}

function buildWater(W) {
  // terrain height texture for shoreline foam / depth tint
  const S = 256, data = new Uint8Array(S * S * 4);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const x = i / (S - 1) * 2 * HALF - HALF, z = j / (S - 1) * 2 * HALF - HALF; const h = terrainH(W, x, z); const v = clamp(Math.round((h + 30) / 40 * 255), 0, 255); const k = (j * S + i) * 4; data[k] = v; data[k + 1] = v; data[k + 2] = v; data[k + 3] = 255; }
  const ht = new THREE.DataTexture(data, S, S, THREE.RGBAFormat); ht.magFilter = THREE.LinearFilter; ht.minFilter = THREE.LinearFilter; ht.needsUpdate = true;
  const U = R.waterU = { time: { value: 0 }, deep: { value: new THREE.Color(0x2a4a56) }, shallow: { value: new THREE.Color(0x4f7d78) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color(1, 1, 1) }, skyCol: { value: new THREE.Color(0xaab) }, fogCol: { value: new THREE.Color() }, fogD: { value: 0.0012 }, hmap: { value: ht }, camPos: { value: new THREE.Vector3() } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float time, fogD; uniform vec3 deep, shallow, sunDir, sunCol, skyCol, fogCol, camPos; uniform sampler2D hmap; varying vec3 vW;
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      float wav(vec2 p){ return vn(p * 0.09 + vec2(time * 0.05, time * 0.03)) * 0.6 + vn(p * 0.23 - vec2(time * 0.08, -time * 0.06)) * 0.3 + vn(p * 0.7 + vec2(time * 0.2, time * 0.1)) * 0.1; }
      void main(){
        vec2 p = vW.xz; float e = 0.6;
        float hx = wav(p + vec2(e, 0.0)) - wav(p - vec2(e, 0.0)), hz = wav(p + vec2(0.0, e)) - wav(p - vec2(0.0, e));
        vec3 n = normalize(vec3(-hx * 2.2, 1.0, -hz * 2.2));
        vec3 v = normalize(camPos - vW); float dist = length(camPos - vW);
        vec2 huv = (vW.xz + 1000.0) / 2000.0; float th = -30.0 + texture2D(hmap, huv).r * 40.0;
        if (huv.x < 0.0 || huv.y < 0.0 || huv.x > 1.0 || huv.y > 1.0) th = -30.0;
        float depth = max(0.0, -th);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0) * 0.85 + 0.05;
        vec3 base = mix(shallow, deep, smoothstep(0.5, 9.0, depth));
        vec3 c = mix(base, skyCol * 0.9, fres);
        vec3 hv = normalize(sunDir + v); c += sunCol * pow(max(dot(n, hv), 0.0), 220.0) * 3.0;
        float foam = (1.0 - smoothstep(0.0, 1.2, depth)) * (0.55 + 0.45 * sin(time * 1.4 + depth * 6.0 + vn(p * 0.4) * 6.0));
        c = mix(c, vec3(0.85, 0.86, 0.84), clamp(foam, 0.0, 1.0) * 0.55);
        float a = mix(0.45, 0.94, smoothstep(0.0, 3.5, depth)); a = max(a, fres);
        float f = 1.0 - exp(-pow(dist * fogD, 2.0)); c = mix(c, fogCol, f);
        gl_FragColor = vec4(c, mix(a, 1.0, f));
      }`
  });
  const g = new THREE.PlaneGeometry(9000, 9000, 1, 1).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat); m.renderOrder = 2; R.scene.add(m); R.water = m;
}

function ribbon(acc, pts, w, col, yoff, uScale) {
  let vAcc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1;
    const pa = i > 0 ? pts[i - 1] : a, pb = i < pts.length - 2 ? pts[i + 2] : b;
    const na = [-(b[2] - pa[2]), b[0] - pa[0]], nb = [-(pb[2] - a[2]), pb[0] - a[0]]; const la = Math.hypot(...na) || 1, lb = Math.hypot(...nb) || 1;
    const hw = w / 2;
    const A0 = [a[0] + na[0] / la * hw, a[1] + yoff, a[2] + na[1] / la * hw], A1 = [a[0] - na[0] / la * hw, a[1] + yoff, a[2] - na[1] / la * hw];
    const B0 = [b[0] + nb[0] / lb * hw, b[1] + yoff, b[2] + nb[1] / lb * hw], B1 = [b[0] - nb[0] / lb * hw, b[1] + yoff, b[2] - nb[1] / lb * hw];
    const v0 = vAcc / uScale, v1 = (vAcc + l) / uScale; vAcc += l;
    acc.quad(A1, A0, B0, B1, [0, 1, 0], col, [1, v0], [0, v0], [0, v1], [1, v1]);
  }
}
function buildRoads(W) {
  const acc = new Acc(), col = lin(0xffffff);
  for (const rd of W.roads) {
    let pts = rd.pts;
    if (rd.city) { // subdivide straight city streets
      const [a, b] = rd.pts, n = Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 10); pts = [];
      for (let i = 0; i <= n; i++) { const t = i / n, x = lerp(a[0], b[0], t), z = lerp(a[2], b[2], t); pts.push([x, Math.max(terrainH(W, x, z), 3.9), z]); }
    } else pts = pts.map((p) => [p[0], Math.max(terrainH(W, p[0], p[2]), p[1] - 0.2), p[2]]);
    ribbon(acc, pts, rd.w, col, 0.05, rd.w * 1.6);
  }
  const m = std({ map: TX.road, roughness: 0.85, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  addMesh(acc.geo(), m, false, true);
  // runway
  const rw = W.special.runway; const ra = new Acc(); const pts = [];
  for (let z = rw.z0; z <= rw.z1; z += 10) pts.push([rw.x, terrainH(W, rw.x, z) + 0.02, z]);
  ribbon(ra, pts, rw.w, lin(0xffffff), 0.05, 80);
  addMesh(ra.geo(), std({ map: TX.runway, vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), false, true);
}
function buildFields(W) {
  const accs = [new Acc(), new Acc(), new Acc()];
  for (const f of W.fields) {
    const a = accs[f.kind], col = lin(0xffffff);
    for (let z = f.z0; z < f.z1; z += 5) for (let x = f.x0; x < f.x1; x += 5) {
      const x1 = Math.min(x + 5, f.x1), z1 = Math.min(z + 5, f.z1), y = (xx, zz) => terrainH(W, xx, zz) + 0.07;
      a.quad([x, y(x, z1), z1], [x1, y(x1, z1), z1], [x1, y(x1, z), z], [x, y(x, z), z], [0, 1, 0], col, [x / 3, z1 / 3], [x1 / 3, z1 / 3], [x1 / 3, z / 3], [x / 3, z / 3]);
    }
  }
  accs.forEach((a, i) => { if (!a.empty) { const g = a.geo(); g.computeVertexNormals(); addMesh(g, std({ map: TX.field[i], vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), false, true); } });
}

const STYLE_TEX = { plaster: "plaster", stucco: "plaster", brick: "brick", wood: "wood", barn: "wood", metal: "metal", concrete: "concrete", bunker: "concrete", wall: "concrete", tower: "tower", glass: "glass" };
function buildBuildings(W) {
  const accs = {}; const A = (k) => accs[k] || (accs[k] = new Acc());
  const roofAcc = A("roof"), tileAcc = A("tiles");
  const white = lin(0xc9c5bc), tmp = new THREE.Color();
  for (const b of W.boxes) {
    if (b.tree || b.rock || b.car || b.mast || b.prop || b.noray) continue;
    const bld = b.b >= 0 ? W.buildings[b.b] : null;
    let style = b.st2 || (bld ? bld.style : null) || (b.s === 9 ? "metal" : b.s === 8 ? "wood" : "concrete");
    if (bld && bld.solid && !b.st2) style = bld.style === "tower" ? "tower" : bld.style;
    if (b.deck || b.rail) style = "wood";
    if (b.floor) style = "concrete";
    const tex = STYLE_TEX[style] || "concrete";
    const col = bld && bld.col != null ? new THREE.Color(bld.col) : white.clone();
    if (tex === "tower" || tex === "glass" || tex === "metal") col.lerp(white, 0.4);
    const acc = A(tex);
    const us = tex === "tower" ? 7.2 : tex === "glass" ? 2.6 : tex === "brick" ? 3 : 4;
    if (b.floor) { acc.box(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, col, 4, A("floor"), 63); continue; }
    if (b.roof) { roofAcc.box(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, lin(0xa8a49c), 4, roofAcc); continue; }
    acc.box(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, col, us, roofAcc, 63);
  }
  // rooftop clutter on solid blocks: parapet, plant room, AC units
  { const r = mulberry32(99), pc = lin(0x8a877f), ac = lin(0x9fa3a3);
    for (const bld of W.buildings) {
      if (!bld.solid || bld.h < 6) continue; const y = bld.y + bld.h, x0 = bld.x0, x1 = bld.x1, z0 = bld.z0, z1 = bld.z1, t = 0.35;
      const a = A("concrete"); a.box(x0, x1, y, y + 1, z0, z0 + t, pc, 4, roofAcc); a.box(x0, x1, y, y + 1, z1 - t, z1, pc, 4, roofAcc); a.box(x0, x0 + t, y, y + 1, z0, z1, pc, 4, roofAcc); a.box(x1 - t, x1, y, y + 1, z0, z1, pc, 4, roofAcc);
      if (bld.h > 15) { const w = Math.min(6, (x1 - x0) * 0.35), d = Math.min(5, (z1 - z0) * 0.35), cx = (x0 + x1) / 2 + (r() - 0.5) * 3, cz = (z0 + z1) / 2 + (r() - 0.5) * 3; a.box(cx - w / 2, cx + w / 2, y, y + 3, cz - d / 2, cz + d / 2, pc, 4, roofAcc); }
      const n = 1 + Math.floor(r() * 3); for (let k = 0; k < n; k++) { const cx = lerp(x0 + 2, x1 - 2, r()), cz = lerp(z0 + 2, z1 - 2, r()); A("metal").box(cx - 0.8, cx + 0.8, y, y + 1.2, cz - 0.6, cz + 0.6, ac, 1, roofAcc); }
    } }
  // pitched / arched roofs
  for (const bld of W.buildings) {
    if (bld.roof !== "pitch" && bld.roof !== "arch") continue;
    const y = bld.y + bld.h + 0.25, w = bld.x1 - bld.x0, d = bld.z1 - bld.z0, alongX = w > d, o = 0.5;
    const x0 = bld.x0 - o, x1 = bld.x1 + o, z0 = bld.z0 - o, z1 = bld.z1 + o;
    const acc = bld.style === "barn" ? A("tilesBarn") : tileAcc, col = bld.style === "barn" ? lin(0x8a8f86) : lin(0xffffff), wallAcc = A(STYLE_TEX[bld.style] || "plaster"), wcol = lin(bld.col || 0xffffff);
    if (bld.roof === "pitch") {
      const rh = Math.min(w, d) * 0.38;
      if (alongX) {
        const zm = (z0 + z1) / 2;
        acc.quad([x0, y, z1], [x1, y, z1], [x1, y + rh, zm], [x0, y + rh, zm], [0, 0.7, 0.7], col, [x0 / 3, 0], [x1 / 3, 0], [x1 / 3, rh / 2], [x0 / 3, rh / 2]);
        acc.quad([x1, y, z0], [x0, y, z0], [x0, y + rh, zm], [x1, y + rh, zm], [0, 0.7, -0.7], col, [x1 / 3, 0], [x0 / 3, 0], [x0 / 3, rh / 2], [x1 / 3, rh / 2]);
        wallAcc.tri([bld.x0, y, z0 + o], [bld.x0, y, z1 - o], [bld.x0, y + rh - 0.3, zm], [-1, 0, 0], wcol, [0, 0], [d / 4, 0], [d / 8, rh / 4]);
        wallAcc.tri([bld.x1, y, z1 - o], [bld.x1, y, z0 + o], [bld.x1, y + rh - 0.3, zm], [1, 0, 0], wcol, [0, 0], [d / 4, 0], [d / 8, rh / 4]);
      } else {
        const xm = (x0 + x1) / 2;
        acc.quad([x1, y, z1], [x1, y, z0], [xm, y + rh, z0], [xm, y + rh, z1], [0.7, 0.7, 0], col, [z1 / 3, 0], [z0 / 3, 0], [z0 / 3, rh / 2], [z1 / 3, rh / 2]);
        acc.quad([x0, y, z0], [x0, y, z1], [xm, y + rh, z1], [xm, y + rh, z0], [-0.7, 0.7, 0], col, [z0 / 3, 0], [z1 / 3, 0], [z1 / 3, rh / 2], [z0 / 3, rh / 2]);
        wallAcc.tri([x1 - o, y, bld.z0], [x0 + o, y, bld.z0], [xm, y + rh - 0.3, bld.z0], [0, 0, -1], wcol, [0, 0], [w / 4, 0], [w / 8, rh / 4]);
        wallAcc.tri([x0 + o, y, bld.z1], [x1 - o, y, bld.z1], [xm, y + rh - 0.3, bld.z1], [0, 0, 1], wcol, [0, 0], [w / 4, 0], [w / 8, rh / 4]);
      }
    } else { // arch (hangar): curved metal roof along x
      const ma = A("metal"), seg = 10, rr = (z1 - z0) / 2, zm = (z0 + z1) / 2, c2 = lin(0x9aa098);
      for (let i = 0; i < seg; i++) { const a0 = i / seg * Math.PI, a1 = (i + 1) / seg * Math.PI; const za = zm - Math.cos(a0) * rr, ya = y + Math.sin(a0) * rr * 0.35, zb = zm - Math.cos(a1) * rr, yb = y + Math.sin(a1) * rr * 0.35; ma.quad([x0, ya, za], [x0, yb, zb], [x1, yb, zb], [x1, ya, za], [0, 1, 0], c2, [za / 4, 0], [zb / 4, 0], [zb / 4, w / 4], [za / 4, w / 4]); }
    }
  }
  const mats = {
    plaster: std({ map: TX.plaster, vertexColors: true }), brick: std({ map: TX.brick, vertexColors: true }), wood: std({ map: TX.wood, vertexColors: true }),
    metal: std({ map: TX.metal, vertexColors: true, roughness: 0.6, metalness: 0.3 }), concrete: std({ map: TX.concrete, vertexColors: true }),
    tower: std({ map: TX.tower, vertexColors: true, roughness: 0.35, metalness: 0.25, envMapIntensity: 1 }), glass: std({ map: TX.glass, vertexColors: true, roughness: 0.2, metalness: 0.4 }),
    roof: std({ map: TX.roof, vertexColors: true }), tiles: std({ map: TX.tiles, vertexColors: true, side: THREE.DoubleSide }), tilesBarn: std({ map: TX.metal, vertexColors: true, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3 }), floor: std({ map: TX.concrete, vertexColors: true })
  };
  for (const k in accs) { if (accs[k].empty) continue; const g = accs[k].geo(); if (k === "tiles" || k === "tilesBarn") g.computeVertexNormals(); addMesh(g, mats[k] || mats.concrete, true, true); }
}

function buildProps(W) {
  const accs = {}; const A = (k) => accs[k] || (accs[k] = new Acc());
  const c = (h) => lin(h);
  for (const p of W.props) {
    const { x, y, z } = p, rot = p.rot || 0, sw = Math.abs(Math.sin(rot)) > 0.5;
    const bx = (dx0, dx1, y0, y1, dz0, dz1, col, k = "wood") => { if (sw) A(k).box(x + dz0, x + dz1, y + y0, y + y1, z + dx0, z + dx1, col, 1); else A(k).box(x + dx0, x + dx1, y + y0, y + y1, z + dz0, z + dz1, col, 1); };
    switch (p.kind) {
      case "table": bx(-0.9, 0.9, 0.72, 0.8, -0.5, 0.5, c(0x7a5a3a)); for (const [a, b] of [[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]]) bx(a - 0.04, a + 0.04, 0, 0.72, b - 0.04, b + 0.04, c(0x5a3f28)); break;
      case "shelf": bx(-0.5, 0.5, 0, 1.9, -0.45, 0.45, c(0x6b5a46)); for (let k = 0; k < 4; k++) bx(-0.48, 0.48, 0.3 + k * 0.45, 0.42 + k * 0.45, -0.5, 0.5, c(k % 2 ? 0x8a7a4a : 0x4a5a6a), "plain"); break;
      case "bed": bx(-1, 1, 0, 0.45, -0.5, 0.5, c(0x5b5f4a), "plain"); bx(-1, -0.6, 0.45, 0.6, -0.45, 0.45, c(0xd8d2c0), "plain"); break;
      case "sofa": bx(-1, 1, 0, 0.45, -0.45, 0.45, c(0x4a5560), "plain"); bx(-1, 1, 0.45, 0.9, 0.3, 0.45, c(0x4a5560), "plain"); break;
      case "crates": bx(-0.5, 0.5, 0, 1, -0.5, 0.5, c(0x8a7048)); bx(-0.35, 0.35, 1, 1.5, -0.35, 0.35, c(0x7a6040)); break;
      case "counter": bx(-1.4, 1.4, 0, 1.0, -0.4, 0.4, c(0x8a8478), "plain"); break;
      case "desk": bx(-1.4, 1.4, 0, 1.1, -0.5, 0.5, c(0x3a3f44), "plain"); break;
      case "hay": { const a = A("hay"); a.box(x - 0.8, x + 0.8, y, y + 1.4, z - 0.8, z + 0.8, c(0xc8b26a), 1); break; }
      case "sandbags": bx(-2, 2, 0, 1.1, -0.5, 0.5, c(0x8a7d5c), "plain"); break;
      case "tank": { const g = new THREE.CylinderGeometry(3, 3, 6, 16).translate(x, y + 3, z); addMesh(g, std({ color: 0xc8c8c0, roughness: 0.5, metalness: 0.4 })); break; }
      case "silo": { const g = mergeBufferGeometries([new THREE.CylinderGeometry(2.6, 2.6, 14, 18).translate(x, y + 7, z), new THREE.SphereGeometry(2.6, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, y + 14, z)]); addMesh(g, std({ color: 0xb8bcb6, map: TX.metal, roughness: 0.55, metalness: 0.35 })); break; }
      case "truck": { const tr = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 5.5), std({ color: 0xc89a2a })); body.position.y = 1.6; const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 1.8), std({ color: 0xd6a830 })); cab.position.set(0, 2.9, 1.8); const bed = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 3.4), std({ color: 0x6a6258 })); bed.position.set(0, 3.0, -0.9); tr.add(body, cab, bed); for (const [a, b] of [[-1.2, 1.7], [1.2, 1.7], [-1.2, -1.7], [1.2, -1.7]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.5, 12).rotateZ(Math.PI / 2), std({ color: 0x1e1e1e })); w.position.set(a, 0.7, b); tr.add(w); } tr.position.set(x, y, z); tr.rotation.y = rot; tr.traverse((o) => { o.castShadow = o.receiveShadow = true; }); R.scene.add(tr); break; }
    }
  }
  const mats = { wood: std({ map: TX.wood, vertexColors: true }), plain: std({ vertexColors: true, roughness: 0.85 }), hay: std({ vertexColors: true, map: TX.field[0], roughness: 1 }) };
  for (const k in accs) addMesh(accs[k].geo(), mats[k], true, true);
}

function buildNature(W) {
  const r = mulberry32(55);
  // pine
  const pine = mergeBufferGeometries([
    colorize(new THREE.CylinderGeometry(0.16, 0.28, 3.2, 6).translate(0, 1.6, 0), 0x4a3828),
    colorize(new THREE.ConeGeometry(2.3, 4.2, 8).translate(0, 4.0, 0), 0x2f3d24), colorize(new THREE.ConeGeometry(1.8, 3.6, 8).translate(0, 5.8, 0), 0x34442a), colorize(new THREE.ConeGeometry(1.2, 3.0, 8).translate(0, 7.4, 0), 0x3a4a2e)
  ].map((g) => (g.index ? g.toNonIndexed() : g)));
  const broad = mergeBufferGeometries([
    colorize(new THREE.CylinderGeometry(0.18, 0.3, 3.4, 6).translate(0, 1.7, 0), 0x4e3d2c),
    colorize(new THREE.IcosahedronGeometry(2.2, 0).translate(0, 4.4, 0), 0x4b5a2e), colorize(new THREE.IcosahedronGeometry(1.7, 0).translate(1.1, 5.2, 0.4), 0x55663a), colorize(new THREE.IcosahedronGeometry(1.6, 0).translate(-0.9, 5.0, -0.6), 0x465428)
  ].map((g) => (g.index ? g.toNonIndexed() : g)));
  const mat = std({ vertexColors: true, roughness: 0.95, flatShading: true });
  const lists = [W.trees.filter((t) => t.kind === 0), W.trees.filter((t) => t.kind === 1)];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler(), cc = new THREE.Color();
  R.treeMeshes = [];
  [pine, broad].forEach((g, k) => {
    const L = lists[k], im = new THREE.InstancedMesh(g, mat, L.length);
    L.forEach((t, i) => { e.set((r() - 0.5) * 0.08, t.rot, (r() - 0.5) * 0.08); q.setFromEuler(e); s.setScalar(t.s); s.y *= 0.9 + r() * 0.3; p.set(t.x, t.y - 0.2, t.z); m4.compose(p, q, s); im.setMatrixAt(i, m4); cc.setHSL(0.2 + r() * 0.06, 0.25 + r() * 0.2, 0.75 + r() * 0.35); im.setColorAt(i, cc); });
    im.castShadow = true; im.receiveShadow = true; R.scene.add(im); R.treeMeshes.push(im);
  });
  // palms
  const parts = [];
  for (let i = 0; i < 6; i++) { const y0 = i * 1.2, bend = i * i * 0.025; parts.push(colorize(new THREE.CylinderGeometry(0.17 - i * 0.012, 0.2 - i * 0.012, 1.25, 6).translate(bend, y0 + 0.6, 0), 0x7a6650).toNonIndexed()); }
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2, leaf = new THREE.BufferGeometry(); const pts = [];
    const L = 3.6, seg = 4; for (let sgm = 0; sgm < seg; sgm++) { const t0 = sgm / seg, t1 = (sgm + 1) / seg; const w0 = Math.sin(t0 * Math.PI) * 0.55 + 0.05, w1 = Math.sin(t1 * Math.PI) * 0.55 + 0.05; const y0 = -t0 * t0 * 1.8, y1 = -t1 * t1 * 1.8; pts.push(t0 * L, y0, -w0, t1 * L, y1, -w1, t1 * L, y1, w1, t0 * L, y0, -w0, t1 * L, y1, w1, t0 * L, y0, w0); }
    leaf.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)); leaf.computeVertexNormals(); leaf.rotateY(a).translate(0.9, 7.2, 0);
    parts.push(colorize(leaf, k % 2 ? 0x56632f : 0x4a5a2a));
  }
  const palmG = mergeBufferGeometries(parts.map((g) => { if (g.index) g = g.toNonIndexed(); if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }));
  const pm = new THREE.InstancedMesh(palmG, std({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }), W.palms.length);
  W.palms.forEach(([x, z, y], i) => { e.set(0, r() * 6.28, 0); q.setFromEuler(e); s.setScalar(0.85 + r() * 0.35); p.set(x, (y != null ? y : terrainH(W, x, z)) - 0.1, z); m4.compose(p, q, s); pm.setMatrixAt(i, m4); });
  pm.castShadow = true; R.scene.add(pm); R.treeMeshes.push(pm);
  // rocks
  const rg = new THREE.IcosahedronGeometry(1, 1); const pa = rg.attributes.position;
  for (let i = 0; i < pa.count; i++) { const k = 0.75 + mulberry32(i * 31 + 7)() * 0.45; pa.setXYZ(i, pa.getX(i) * k, pa.getY(i) * k * 0.75, pa.getZ(i) * k); }
  rg.computeVertexNormals();
  const rm = new THREE.InstancedMesh(rg, std({ color: 0x8a867c, roughness: 0.95, flatShading: true }), W.rocks.length);
  W.rocks.forEach((t, i) => { e.set(r(), t.rot, r() * 0.4); q.setFromEuler(e); s.set(t.s, t.s * (0.6 + r() * 0.5), t.s * (0.8 + r() * 0.4)); p.set(t.x, t.y + t.s * 0.2, t.z); m4.compose(p, q, s); rm.setMatrixAt(i, m4); cc.setHSL(0.1, 0.06, 0.5 + r() * 0.2); rm.setColorAt(i, cc); });
  rm.castShadow = true; rm.receiveShadow = true; R.scene.add(rm);
  // grass tufts near the player are skipped for performance; scattered bushes instead
  const bushG = colorize(new THREE.IcosahedronGeometry(0.8, 0).scale(1, 0.6, 1).translate(0, 0.3, 0), 0x55603a);
  const bushes = []; for (let k = 0; k < 2500; k++) { const x = r.range(-900, 900), z = r.range(-900, 900); if (surfaceAt(W, x, z) !== SURF.GRASS) continue; bushes.push([x, terrainH(W, x, z), z]); }
  const bm = new THREE.InstancedMesh(bushG, std({ vertexColors: true, flatShading: true, roughness: 1 }), bushes.length);
  bushes.forEach(([x, y, z], i) => { e.set(0, r() * 6, 0); q.setFromEuler(e); s.setScalar(0.6 + r() * 1.1); p.set(x, y - 0.1, z); m4.compose(p, q, s); bm.setMatrixAt(i, m4); cc.setHSL(0.18 + r() * 0.08, 0.3, 0.6 + r() * 0.4); bm.setColorAt(i, cc); });
  bm.receiveShadow = true; R.scene.add(bm);
}
export function colorize(g, hex) {
  const c = lin(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3)); if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2)); return g;
}

function buildSpecials(W) {
  const S = W.special, scene = R.scene;
  // LOS PEPINOS hillside sign
  if (S.sign) {
    const legM = std({ color: 0x5a5a56, metalness: 0.4, roughness: 0.6 });
    for (const L of S.sign) {
      const tex = canvasTex(128, 160, (x, w, h) => { x.clearRect(0, 0, w, h); x.fillStyle = "#f2efe6"; x.font = "bold 150px Anton, Impact, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(L.ch, w / 2, h / 2 + 8); }, true, false);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(11, 14), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 }));
      m.position.set(L.x, L.y + 9, L.z); m.rotation.x = -0.18; m.castShadow = true; scene.add(m);
      for (const dx of [-3, 3]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 9, 0.3), legM); leg.position.set(L.x + dx, L.y + 4.5, L.z - 1.5); scene.add(leg); }
    }
  }
  // pier + Ferris wheel
  if (S.pier) {
    const P = S.pier, wood = std({ map: TX.wood, color: 0xb59a78 });
    const pyl = []; for (let z = P.z0; z < P.z1; z += 8) for (const dx of [-6, 6]) pyl.push(new THREE.CylinderGeometry(0.3, 0.3, 14, 6).translate(P.x + dx, P.y - 7, z));
    for (let z = 684; z < 740; z += 8) for (const dx of [-20, -10, 10, 20]) pyl.push(new THREE.CylinderGeometry(0.3, 0.3, 14, 6).translate(P.x + dx, P.y - 7, z));
    addMesh(mergeBufferGeometries(pyl), std({ color: 0x4a3a2c }), true, true);
    const F = S.ferris, g = new THREE.Group(); g.position.set(F.x, F.y + F.r + 2, F.z); g.rotation.y = Math.PI / 2;
    const metal = std({ color: 0xe8e2d6, metalness: 0.5, roughness: 0.4 });
    const wheel = new THREE.Group();
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(F.r, 0.25, 6, 48), metal), new THREE.Mesh(new THREE.TorusGeometry(F.r * 0.96, 0.15, 6, 48).translate(0, 0, 1.2), metal));
    const spokes = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; spokes.push(new THREE.BoxGeometry(0.12, F.r, 0.12).translate(0, F.r / 2, 0).rotateZ(a)); }
    wheel.add(new THREE.Mesh(mergeBufferGeometries(spokes), metal));
    const cabCols = [0xff7a45, 0xffd166, 0x5f8a8b, 0xc8553d];
    R.ferrisCabs = [];
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.4), std({ color: cabCols[i % 4] })); cab.position.set(Math.cos(a) * F.r, Math.sin(a) * F.r, 0.6); wheel.add(cab); R.ferrisCabs.push(cab); }
    g.add(wheel); R.ferris = wheel;
    const legs = []; for (const s of [-1, 1]) for (const zz of [-1.6, 2.8]) legs.push(new THREE.BoxGeometry(0.5, F.r + 3, 0.5).translate(0, -(F.r + 3) / 2, 0).rotateZ(s * 0.35).translate(0, 0, zz));
    g.add(new THREE.Mesh(mergeBufferGeometries(legs), metal));
    g.traverse((o) => { o.castShadow = true; }); scene.add(g);
  }
  // containers
  if (S.containers) {
    const g = new THREE.BoxGeometry(1, 1, 1); const im = new THREE.InstancedMesh(g, std({ map: TX.container, roughness: 0.7, metalness: 0.2 }), S.containers.length);
    const m4 = new THREE.Matrix4(), cc = new THREE.Color();
    S.containers.forEach((c, i) => { m4.makeScale(c.w, 2.6, c.d); m4.setPosition(c.x, c.y + 1.3, c.z); im.setMatrixAt(i, m4); im.setColorAt(i, cc.set(c.col)); });
    im.castShadow = im.receiveShadow = true; scene.add(im);
  }
  // cranes
  if (S.cranes) for (const c of S.cranes) {
    const m = std({ color: 0xc9a227, metalness: 0.3, roughness: 0.6 }), parts = [];
    for (const [a, b] of [[-5.25, -5.25], [-5.25, 5.25], [5.25, -5.25], [5.25, 5.25]]) parts.push(new THREE.BoxGeometry(1.5, 31, 1.5).translate(c.x + a, 3 + 15.5, c.z + b));
    parts.push(new THREE.BoxGeometry(14, 2, 12).translate(c.x, 34, c.z), new THREE.BoxGeometry(60, 1.6, 2).translate(c.x - 10, 36, c.z), new THREE.BoxGeometry(4, 3, 3).translate(c.x + 14, 36, c.z));
    addMesh(mergeBufferGeometries(parts), m, true, true);
  }
  // radio masts (lattice)
  if (S.masts) for (const ms of S.masts) {
    const pts = [], h = ms.h, segs = 12;
    for (let i = 0; i < segs; i++) { const y0 = i / segs * h, y1 = (i + 1) / segs * h, w0 = 2.4 * (1 - i / segs * 0.75), w1 = 2.4 * (1 - (i + 1) / segs * 0.75); const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let k = 0; k < 4; k++) { const [a, b] = cs[k], [c2, d] = cs[(k + 1) % 4]; pts.push(a * w0, y0, b * w0, a * w1, y1, b * w1, a * w0, y0, b * w0, c2 * w1, y1, d * w1, a * w1, y1, b * w1, c2 * w1, y1, d * w1); } }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xb8b2a8 })); l.position.set(ms.x, ms.y, ms.z); scene.add(l);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.3, 0.1) })); lamp.position.set(ms.x, ms.y + h, ms.z); scene.add(lamp);
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.3, 16).rotateX(Math.PI / 2), std({ color: 0xdedad2 })); dish.position.set(ms.x + 1, ms.y + h * 0.7, ms.z); scene.add(dish);
  }
  // compound watchtowers
  if (S.watch) for (const w of S.watch) { const g = new THREE.Group(); const wood = std({ map: TX.wood, color: 0x8a7a62 }); const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.6, 4).rotateY(Math.PI / 4), std({ color: 0x4a4a40 })); roof.position.y = 10.2; g.add(roof); for (const [a, b] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 9.4, 0.2), wood); p.position.set(a, 4.7, b); g.add(p); } const rail = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 4), wood); rail.position.y = 7.8; g.add(rail); g.position.set(w.x, w.y, w.z); g.traverse((o) => { o.castShadow = true; }); scene.add(g); }
  // parked cars in Los Pepinos
  if (S.cars) {
    const body = mergeBufferGeometries([new THREE.BoxGeometry(1.9, 0.7, 4.4).translate(0, 0.65, 0), new THREE.BoxGeometry(1.7, 0.6, 2.2).translate(0, 1.3, -0.2)]);
    const im = new THREE.InstancedMesh(body, std({ roughness: 0.4, metalness: 0.5 }), S.cars.length); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), cc = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    S.cars.forEach((c, i) => { q.setFromAxisAngle(up, c.rot); m4.compose(new THREE.Vector3(c.x, 4.0, c.z), q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m4); im.setColorAt(i, cc.set(c.col)); });
    im.castShadow = true; scene.add(im);
    const wh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.36, 0.36, 2.0, 10).rotateZ(Math.PI / 2), std({ color: 0x151515 }), S.cars.length * 2);
    S.cars.forEach((c, i) => { for (let k = 0; k < 2; k++) { q.setFromAxisAngle(up, c.rot); const off = new THREE.Vector3(0, 0.36, k ? 1.4 : -1.4).applyQuaternion(q); m4.compose(new THREE.Vector3(c.x + off.x, 4.0 + 0.36, c.z + off.z), q, new THREE.Vector3(1, 1, 1)); wh.setMatrixAt(i * 2 + k, m4); } });
    scene.add(wh);
  }
  // street lights
  if (W.lights.length) {
    const g = mergeBufferGeometries([new THREE.CylinderGeometry(0.08, 0.12, 7, 6).translate(0, 3.5, 0), new THREE.BoxGeometry(1.6, 0.12, 0.25).translate(-0.7, 7, 0)]);
    const im = new THREE.InstancedMesh(g, std({ color: 0x3a3d40, metalness: 0.5 }), W.lights.length); const m4 = new THREE.Matrix4();
    W.lights.forEach(([x, z], i) => { m4.makeTranslation(x, terrainH(W, x, z), z); im.setMatrixAt(i, m4); }); scene.add(im);
  }
  // compound flag mast with Dillion Group banner
  { const P = POIS.find((p) => p.id === "compound"); const y = terrainH(W, P.x + 6, P.z + 8); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 12, 6), std({ color: 0x9a9a92, metalness: 0.6 })); pole.position.set(P.x + 6, y + 6, P.z + 8); scene.add(pole);
    const ft = canvasTex(256, 128, (x, w, h) => { x.fillStyle = "#2d3424"; x.fillRect(0, 0, w, h); x.fillStyle = "#ff7a45"; x.fillRect(0, h - 18, w, 18); x.fillStyle = "#ffd166"; x.font = "bold 44px Anton, Impact, sans-serif"; x.textAlign = "center"; x.fillText("DILLION", w / 2, 58); x.font = "bold 20px sans-serif"; x.fillStyle = "#e8e4d8"; x.fillText("GROUP · ZONE NINE", w / 2, 88); }, true, false);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8, 8, 1), std({ map: ft, side: THREE.DoubleSide })); flag.position.set(P.x + 6 + 1.85, y + 11, P.z + 8); scene.add(flag); R.flag = flag; }
  // range targets backdrop (berm)
  if (S.range) { const b = new THREE.Mesh(new THREE.BoxGeometry(60, 6, 4), std({ color: 0x6a5f4a })); b.position.set(S.range.x, terrainH(W, S.range.x, S.range.z - 235) + 3, S.range.z - 235); scene.add(b); }
}

let wT = 0;
export function updateWorld(dt, cam) {
  wT += dt;
  if (R.waterU) { R.waterU.time.value = wT; R.waterU.camPos.value.copy(cam.position); R.waterU.fogD.value = R.scene.fog.density; }
  skyU.time.value = wT;
  if (R.sky) R.sky.position.copy(cam.position);
  if (R.ferris) { R.ferris.rotation.z = wT * 0.06; for (const c of R.ferrisCabs) c.rotation.z = -R.ferris.rotation.z; }
  if (R.flag) { const p = R.flag.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 1.8 - wT * 4) * 0.12 * (x + 1.8)); } p.needsUpdate = true; }
  R.grade.uniforms.time.value = wT;
}
export function renderFrame() { R.composer.render(); }
