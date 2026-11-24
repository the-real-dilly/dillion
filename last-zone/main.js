// DILLION: LAST ZONE - entry point: game flow, input, cameras, event wiring, test API (window.LZ).
import * as THREE from "three";
import { buildWorld, terrainH, groundAt, raycast, POIS, SURF, surfaceAt, HALF, poiAt, SEA } from "./world.js";
import * as Sim from "./sim.js";
import { initBots, updateBots } from "./bots.js";
import { R, createRenderer, buildIsland, applyPreset, updateSun, updateWorld, renderFrame, setQuality } from "./render.js";
import { A, loadAssets, Avatar, STYLES, makePlaneMesh, makeItemMesh, makeCrateMesh, makeGun, makeGrenadeMesh } from "./actors.js";
import { FX, initFX, updateFX, impact, bodyHit, tracer, muzzle, shell, explosion, smokeCloud, landingDust, splash } from "./fx.js";
import * as AUD from "./audio.js";
import * as HUD from "./hud.js";
import { WEAPONS, RARITY, RADIO, CALLSIGNS, AMMO, ITEMS } from "./data.js";
import { clamp, lerp, wrapA, fmtTime, mulberry32 } from "./util.js";

const $ = (id) => document.getElementById(id);
const DT = Sim.DT;
const params = new URLSearchParams(location.search);

// ---------------------------------------------------------------------------------------------
// settings
const STORE = "dillion:lastzone";
const S = { sens: 1, adsSens: 0.75, fov: 72, invert: 0, master: 0.8, sfx: 0.9, music: 0.5, diff: "normal", quality: "high", time: "random", blood: 0, subs: 1, pickles: 0, wins: 0, best: 0 };
try { const s = JSON.parse(localStorage.getItem(STORE) || "null"); if (s && typeof s === "object") Object.assign(S, s); } catch (e) { /* storage blocked */ }
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* ignore */ } };
if (params.get("q") === "low" || params.get("q") === "high") S.quality = params.get("q");

// ---------------------------------------------------------------------------------------------
const G = {
  mode: "boot", M: null, me: null, av: new Map(), items: new Map(), crates: [], gren: new Map(), plane: null, demoPlane: null,
  yaw: 0, pitch: -0.1, camMode: "tp", keys: {}, mouse: { l: false, r: false }, crouch: false, paused: false, mapOpen: false, invOpen: false,
  acc: 0, timeScale: 1, spec: { idx: 0, free: false, x: 0, y: 60, z: 0, yaw: 0, pitch: -0.3 }, deadT: -1, resultsShown: false, lobbyT: 0,
  testInput: null, hurt: 0, shake: 0, stepAcc: new Map(), lastFrame: performance.now(), fps: { acc: 0, n: 0, low: 0, locked: !!params.get("q") }, camPos: new THREE.Vector3(), aimPt: new THREE.Vector3(), radioT: 0, vm: null, vmId: null, kick: 0,
  pingCd: 0, frame: 0
};
window.LZ_G = G;

let W;
async function boot() {
  const bar = $("bootBar"), tip = $("bootTip");
  try { createRenderer($("c")); } catch (e) { fatal("WebGL is not available in this browser, so Zone Nine can't load."); return; }
  const T0 = performance.now(), lg = (m) => console.log("[LZ] " + m + " " + Math.round(performance.now() - T0) + "ms");
  tip.textContent = "Surveying the island…"; await frame();
  W = buildWorld(); bar.style.width = "15%"; await frame();
  tip.textContent = "Building Los Pepinos…"; await frame();
  lg("world"); buildIsland(W); lg("island"); bar.style.width = "35%"; await frame();
  initFX(); HUD.initHUD(W);
  applyPreset(pickPreset()); setQuality(S.quality);
  tip.textContent = "Loading contractors and hardware…";
  try { await loadAssets((k) => { bar.style.width = (35 + k * 60) + "%"; }); } catch (e) { console.error(e); fatal("Could not load the character and weapon models (assets/). " + (e.message || e)); return; }
  bar.style.width = "100%"; lg("assets");
  G.plane = makePlaneMesh(); R.scene.add(G.plane); G.plane.visible = false;
  G.demoPlane = makePlaneMesh(); R.scene.add(G.demoPlane);
  // parked transport at the airfield
  const pp = makePlaneMesh(); const sp = W.special.parkedPlane; pp.position.set(sp.x, terrainH(W, sp.x, sp.z) + 3.4, sp.z); pp.rotation.y = sp.rot; R.scene.add(pp);
  makePreview();
  bindUI(); bindInput();
  $("boot").classList.add("hidden"); lg("ready");
  toTitle();
  requestAnimationFrame(loop);
  if (params.get("play") != null) startLobby();
  if (params.get("range") != null) startRange();
}
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
function fatal(msg) { const f = $("fatal"); f.textContent = msg; f.classList.remove("hidden"); $("boot").classList.add("hidden"); }
function pickPreset() { return S.time === "random" ? (Math.random() < 0.6 ? "golden" : "overcast") : S.time; }

// ---------------------------------------------------------------------------------------------
// operator preview on the title screen (scissor render after the post stack)
const PV = {}; window.LZ_PV = PV;
function makePreview() {
  PV.scene = new THREE.Scene();
  PV.cam = new THREE.PerspectiveCamera(30, 0.6, 0.1, 50);
  PV.scene.add(new THREE.HemisphereLight(0xd8dce0, 0x3a3428, 0.6));
  const key = new THREE.DirectionalLight(0xffe2c0, 1.5); key.position.set(2, 3, 3); PV.scene.add(key);
  const rim = new THREE.DirectionalLight(0xff9a60, 1.4); rim.position.set(-3, 2, -2); PV.scene.add(rim);
  PV.av = new Avatar(STYLES.dilly, { scene: PV.scene });
  PV.p = fakePlayer(); PV.p.inv.w[0] = { id: "falcon", r: 4, mag: 30 };
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.2, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })); PV.scene.add(floor);
}
function fakePlayer() { return { st: "ground", x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: 0, onGround: true, crouch: false, sprint: false, adsT: 0, lastShotT: -99, act: null, inv: { w: [null, null], slot: 0 }, moveSpd: 0, inp: { mz: 0 }, recP: 0, recY: 0 }; }
function renderPreview(dt, t) {
  if (!PV.av || G.mode !== "title" || !$("settings").classList.contains("hidden") || !$("help").classList.contains("hidden")) return;
  const w = window.innerWidth, h = window.innerHeight; if (w < 760) return;
  const pw = Math.min(380, w * 0.3), ph = Math.min(h * 0.7, pw * 1.7), px = w - pw - w * 0.04, py = h * 0.06 + 120;
  PV.p.yaw = Math.PI + 0.5 + Math.sin(t * 0.4) * 0.35; PV.p.adsT = (Math.sin(t * 0.5) > 0.6) ? 1 : 0; PV.p.pitch = 0.05;
  PV.av.update(PV.p, dt, t, true);
  PV.cam.aspect = pw / ph; PV.cam.updateProjectionMatrix(); PV.cam.position.set(0, 1.1, 4.6); PV.cam.lookAt(0, 0.95, 0);
  const r = R.renderer; const ac = r.autoClear; r.autoClear = false;
  r.setScissorTest(true); r.setScissor(px, h - py - ph, pw, ph); r.setViewport(px, h - py - ph, pw, ph); r.clearDepth();
  r.render(PV.scene, PV.cam);
  r.setScissorTest(false); r.setViewport(0, 0, w, h); r.autoClear = ac;
}

// ---------------------------------------------------------------------------------------------
// screens
function show(id, on) { $(id).classList.toggle("hidden", !on); }
function toTitle() {
  clearMatch(); G.mode = "title"; applyPreset(S.time === "overcast" ? "overcast" : "golden"); show("title", true); show("hud", false); show("results", false); show("lobby", false); show("pause", false);
  AUD.radioStop(); AUD.musicStop(); document.exitPointerLock && document.exitPointerLock();
}
function clearMatch() {
  for (const a of G.av.values()) a.dispose(); G.av.clear();
  for (const m of G.items.values()) R.scene.remove(m); G.items.clear();
  for (const c of G.crates) R.scene.remove(c); G.crates = [];
  for (const m of G.gren.values()) R.scene.remove(m); G.gren.clear();
  if (G.vm) { R.vmScene.remove(G.vm); G.vm = null; G.vmId = null; } R.vmPass.enabled = false;
  G.M = null; G.me = null; G.winnerName = null; G.plane.visible = false; G.resultsShown = false; G.deadT = -1; HUD.H.pings.length = 0; G.spec.free = false;
  R.grade.uniforms.gas.value = 0; R.grade.uniforms.hurt.value = 0; $("gastint").style.opacity = 0; $("feed").innerHTML = "";
}
function newMatch(o = {}) {
  clearMatch();
  applyPreset(o.preset || pickPreset());
  S.pickleThis = 0; G.watch = null;
  const M = G.M = Sim.createMatch(W, { seed: o.seed != null ? o.seed : (params.get("seed") ? +params.get("seed") : undefined), difficulty: o.difficulty || S.diff, mode: o.mode || "br" });
  const me = G.me = Sim.addPlayer(M, "Dilly", { human: true });
  if (M.mode === "br") initBots(M, o.bots != null ? o.bots : (params.get("bots") ? +params.get("bots") : 24), o.difficulty || S.diff);
  else Sim.setupRange(M, me);
  G.yaw = me.yaw; G.pitch = -0.15;
  if (M.plane) { G.yaw = Math.atan2(-M.plane.dx, -M.plane.dz); }
  // avatars
  let ri = 0;
  for (const p of M.players) G.av.set(p.id, new Avatar(p.human ? STYLES.dilly : p.target ? STYLES.target : STYLES.rivals[ri++ % STYLES.rivals.length]));
  for (const c of M.crates) { const m = makeCrateMesh(c); R.scene.add(m); G.crates.push(m); }
  handleEvents();
  G.plane.visible = !!M.plane; G.demoPlane.visible = false;
  return M;
}
function startLobby() {
  initAudioSafe();
  newMatch();
  G.mode = "lobby"; G.lobbyT = params.get("lobby") ? +params.get("lobby") : 20; show("title", false); show("lobby", true); show("hud", false);
  $("lobbyList").innerHTML = ""; G.lobbyShown = 0;
  AUD.radioStart();
  const songs = ['"Low Tide Shuffle" — the Pickled Pelicans', '"Dill With It" — Marisol & the Brine', '"Vinegar Sunset" — DJ Gherkin', '"Relish Ave After Dark" — Cucumber Heights Collective'];
  $("radioNow").textContent = songs[Math.floor(Math.random() * songs.length)];
}
function deploy() {
  if (!G.M) newMatch();
  show("lobby", false); show("title", false); show("hud", true);
  G.mode = "match"; AUD.radioStop(); AUD.musicStart();
  HUD.H.noSubs = !S.subs;
  radio(RADIO.plane[0]); setTimeout(() => G.mode === "match" && radio(RADIO.plane[1]), 4500);
  HUD.banner("ZONE NINE", "Jump when ready · " + (G.M.players.length) + " contractors", 4);
  lockPointer();
}
function startRange() {
  initAudioSafe();
  newMatch({ mode: "range", preset: "golden" });
  G.mode = "range"; show("title", false); show("hud", true); show("lobby", false);
  HUD.banner("PRACTICE RANGE", "Walk over the racks to grab guns · targets 10 to 220 m", 4);
  lockPointer();
}
function showResults(win) {
  if (G.resultsShown) return; G.resultsShown = true;
  const M = G.M, me = G.me, n = M.players.filter((p) => !p.target).length;
  const place = win ? 1 : me.place || 1;
  $("resKicker").textContent = win ? "VICTORY" : "ELIMINATED";
  $("resPlace").innerHTML = `#${place}<small>/${n}</small>`;
  $("resLine").textContent = win ? "Last contractor standing" : place <= 5 ? "Top five. Close." : place <= 10 ? "Top ten finish" : "Back to the staging area";
  $("resKills").textContent = me.kills; $("resDmg").textContent = Math.round(me.dmg);
  $("resTime").textContent = fmtTime((me.st === "dead" ? me.deathT : M.t));
  $("resPickle").textContent = me.inv.pickle || S.pickleThis || 0;
  const killer = me.st === "dead" ? M.players.find((q) => q.id === me.killedBy) : null;
  const wn = M.over && !win && G.winnerName ? ` · Match won by ${G.winnerName}` : "";
  $("resNote").textContent = (win ? "The Dillion Group thanks you for your service." : killer ? `Eliminated by ${killer.name}${me.killWid ? " · " + (WEAPONS[me.killWid] ? WEAPONS[me.killWid].name : me.killWid === "gas" ? "the gas" : me.killWid) : ""}` : me.killWid === "gas" ? "Caught in the gas." : "") + wn;
  show("results", true); $("bSpectate").classList.toggle("hidden", M.over);
  if (win) S.wins++; S.best = S.best ? Math.min(S.best, place) : place; persist();
  document.exitPointerLock && document.exitPointerLock();
}

// ---------------------------------------------------------------------------------------------
// UI bindings
function bindUI() {
  $("bPlay").onclick = () => { AUD.sfxUI(); startLobby(); };
  $("bRange").onclick = () => { AUD.sfxUI(); startRange(); };
  $("bSettings").onclick = () => openSettings();
  $("bHelp").onclick = () => show("help", true);
  $("bHelpClose").onclick = () => show("help", false);
  $("bSetClose").onclick = () => { show("settings", false); persist(); };
  $("bDeploy").onclick = () => deploy();
  $("bLobbyBack").onclick = () => toTitle();
  $("bResume").onclick = () => { setPause(false); lockPointer(); };
  $("bPSettings").onclick = () => openSettings();
  $("bPHelp").onclick = () => show("help", true);
  $("bQuit").onclick = () => { setPause(false); toTitle(); };
  $("bReplay").onclick = () => { show("results", false); startLobby(); };
  $("bToTitle").onclick = () => toTitle();
  $("bSpectate").onclick = () => { show("results", false); };
  const bind = (id, key, fmt, apply) => { const el = $(id), out = $("o" + id.slice(1)); el.value = S[key]; const upd = () => { S[key] = el.type === "range" ? +el.value : el.value; if (out) out.textContent = fmt ? fmt(S[key]) : S[key]; apply && apply(); persist(); }; el.oninput = upd; el.onchange = upd; if (out) out.textContent = fmt ? fmt(S[key]) : S[key]; };
  const pct = (v) => Math.round(v * 100) + "%";
  bind("sSens", "sens", (v) => (+v).toFixed(2)); bind("sAds", "adsSens", (v) => (+v).toFixed(2)); bind("sFov", "fov", (v) => v + "°");
  bind("sInv", "invert", null, () => { S.invert = +S.invert; });
  const vol = () => { AUD.AU.vol.master = S.master; AUD.AU.vol.sfx = S.sfx; AUD.AU.vol.music = S.music; AUD.applyVolumes(); };
  bind("sMaster", "master", pct, vol); bind("sSfx", "sfx", pct, vol); bind("sMusic", "music", pct, vol);
  bind("sDiff", "diff"); bind("sQual", "quality", null, () => { setQuality(S.quality); G.fps.locked = true; });
  bind("sTime", "time", null, () => { if (S.time !== "random") applyPreset(S.time); });
  bind("sBlood", "blood", null, () => { S.blood = +S.blood; }); bind("sSubs", "subs", null, () => { S.subs = +S.subs; HUD.H.noSubs = !S.subs; });
  vol();
}
function openSettings() { for (const [id, k] of [["sSens", "sens"], ["sAds", "adsSens"], ["sFov", "fov"], ["sInv", "invert"], ["sMaster", "master"], ["sSfx", "sfx"], ["sMusic", "music"], ["sDiff", "diff"], ["sQual", "quality"], ["sTime", "time"], ["sBlood", "blood"], ["sSubs", "subs"]]) $(id).value = S[k]; show("settings", true); }
function setPause(on) { G.paused = on; show("pause", on); if (on) document.exitPointerLock && document.exitPointerLock(); }
function inGame() { return (G.mode === "match" || G.mode === "range") && G.M; }
function lockPointer() { const c = $("c"); try { if (c.requestPointerLock && !document.pointerLockElement) { const r = c.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } } catch (e) { /* headless */ } }
function initAudioSafe() { try { AUD.initAudio(); AUD.AU.vol.master = S.master; AUD.AU.vol.sfx = S.sfx; AUD.AU.vol.music = S.music; AUD.applyVolumes(); } catch (e) { /* no audio */ } }

// ---------------------------------------------------------------------------------------------
// input
const EDGE = {};
function bindInput() {
  const c = $("c");
  window.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) return;
    const k = e.code; if (!G.keys[k]) EDGE[k] = true; G.keys[k] = true;
    initAudioSafe();
    if (k === "Tab" || k === "Space" || k.startsWith("Arrow")) e.preventDefault();
    if (k === "KeyK") { AUD.setMute(!AUD.AU.muted); HUD.toast(AUD.AU.muted ? "Sound off" : "Sound on"); }
    if (k === "KeyQ") { const q = R.quality === "high" ? "low" : "high"; setQuality(q); S.quality = q; persist(); G.fps.locked = true; HUD.toast("Quality: " + q.toUpperCase()); }
    if (k === "Escape") {
      if (G.mapOpen) { G.mapOpen = false; show("mapov", false); return; }
      if (!$("settings").classList.contains("hidden")) { show("settings", false); persist(); return; }
      if (!$("help").classList.contains("hidden")) { show("help", false); return; }
      if (inGame() && !G.resultsShown) setPause(!G.paused);
    }
    if (!inGame()) return;
    if (k === "KeyM") { G.mapOpen = !G.mapOpen; show("mapov", G.mapOpen); }
    if (k === "Tab") { G.invOpen = true; show("inventory", true); HUD.fillInventory(G.me); }
    if (k === "KeyV") { G.camMode = G.camMode === "tp" ? "fp" : "tp"; HUD.toast(G.camMode === "fp" ? "First person" : "Third person"); }
    if (k === "KeyC") G.crouch = !G.crouch;
    if (k === "KeyB") ping();
    if (G.me && G.me.st === "dead") {
      if (k === "ArrowRight" || k === "KeyD") G.spec.idx++;
      if (k === "ArrowLeft" || k === "KeyA") G.spec.idx--;
      if (k === "KeyF") { G.spec.free = !G.spec.free; if (G.spec.free) { G.spec.x = R.camera.position.x; G.spec.y = R.camera.position.y; G.spec.z = R.camera.position.z; } }
      if (k === "Enter" && G.resultsShown) show("results", true);
    }
  });
  window.addEventListener("keyup", (e) => { G.keys[e.code] = false; if (e.code === "Tab") { G.invOpen = false; show("inventory", false); } });
  window.addEventListener("blur", () => { G.keys = {}; G.mouse.l = G.mouse.r = false; });
  c.addEventListener("mousedown", (e) => {
    initAudioSafe();
    if (!inGame() || G.paused) return;
    if (!document.pointerLockElement) lockPointer();
    if (e.button === 0) G.mouse.l = true; if (e.button === 2) G.mouse.r = true; if (e.button === 1) { e.preventDefault(); ping(); }
  });
  window.addEventListener("mouseup", (e) => { if (e.button === 0) G.mouse.l = false; if (e.button === 2) G.mouse.r = false; });
  c.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("mousemove", (e) => {
    if (!inGame() || G.paused) return;
    const locked = !!document.pointerLockElement;
    if (!locked && !(e.buttons & 3)) return;
    const me = G.me, ads = me && me.adsT > 0.5, w = me && Sim.curWeapon(me);
    const zoom = ads && w ? WEAPONS[w.id].zoom : 1;
    const k = 0.0022 * S.sens * (ads ? S.adsSens / zoom : 1);
    if (G.spec.free && me && me.st === "dead") { G.spec.yaw -= e.movementX * k; G.spec.pitch = clamp(G.spec.pitch - e.movementY * k, -1.5, 1.5); return; }
    G.yaw -= e.movementX * k; G.pitch = clamp(G.pitch - e.movementY * k * (S.invert ? -1 : 1), -1.45, 1.45);
  });
  c.addEventListener("wheel", (e) => { if (!inGame() || !G.me) return; const s = ((G.me.inv.slot + (e.deltaY > 0 ? 1 : -1)) % 3 + 3) % 3; G.wheelSlot = s; }, { passive: true });
  $("mapC").addEventListener("mousedown", (e) => { if (e.button === 1 || e.button === 0) { const [x, z] = HUD.mapToWorld(e.clientX, e.clientY, $("mapC").getBoundingClientRect()); addPing(x, z); } });
  document.addEventListener("pointerlockchange", () => { if (!document.pointerLockElement && inGame() && !G.paused && !G.resultsShown && !G.mapOpen && G.wantPauseOnUnlock) setPause(true); });
}
function edge(k) { if (EDGE[k]) { EDGE[k] = false; return true; } return false; }
function ping() {
  if (!G.me || G.pingCd > 0) return;
  const h = G.aimHit; if (h) addPing(h.x, h.z, h.y);
}
function addPing(x, z, y) { G.pingCd = 0.3; HUD.H.pings.push({ x, z, y: y != null ? y : terrainH(W, x, z) }); if (HUD.H.pings.length > 3) HUD.H.pings.shift(); AUD.sfxUI("ping"); }

function humanInput(dt) {
  const me = G.me, inp = me.inp, K = G.keys;
  // keyboard look fallback
  const lk = 2.0 * dt * S.sens;
  if (K.ArrowLeft && me.st !== "dead") G.yaw += lk; if (K.ArrowRight && me.st !== "dead") G.yaw -= lk;
  if (K.ArrowUp) G.pitch = clamp(G.pitch + lk * 0.7, -1.45, 1.45); if (K.ArrowDown) G.pitch = clamp(G.pitch - lk * 0.7, -1.45, 1.45);
  const blocked = G.paused || G.mapOpen;
  inp.mx = blocked ? 0 : (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0); inp.mz = blocked ? 0 : (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0);
  inp.sprint = !!(K.ShiftLeft || K.ShiftRight); inp.crouch = G.crouch;
  inp.fire = !blocked && (G.mouse.l || !!K.Enter); inp.ads = !blocked && (G.mouse.r || !!K.Slash);
  if (edge("Space")) inp.jump = true; if (edge("KeyR")) inp.reload = true; if (edge("KeyE")) inp.interact = true; if (edge("KeyF")) inp.melee = true;
  if (edge("Digit1")) inp.slot = 0; if (edge("Digit2")) inp.slot = 1; if (edge("Digit3")) inp.slot = 2;
  if (G.wheelSlot != null) { inp.slot = G.wheelSlot; G.wheelSlot = null; }
  if (edge("KeyX") || edge("Digit4")) inp.heal = "plate"; inp.plateHold = !!(K.KeyX || K.Digit4);
  if (edge("Digit5")) inp.heal = "bandage"; if (edge("Digit6")) inp.heal = "medkit";
  if (edge("KeyG")) inp.throw = "frag"; if (edge("KeyH")) inp.throw = "smoke";
  if (inp.crouch && inp.sprint && inp.mz > 0) { G.crouch = false; inp.crouch = false; }
  // aim: from the eye toward what the crosshair is over (third-person parallax correction)
  let ay = G.yaw, ap = G.pitch;
  if (me.st === "ground" && G.aimHit && G.camMode === "tp") {
    const ex = me.x, ey = Sim.eyeY(me), ez = me.z, dx = G.aimHit.x - ex, dy = G.aimHit.y - ey, dz = G.aimHit.z - ez, d = Math.hypot(dx, dz);
    if (Math.hypot(dx, dy, dz) > 2.5) { ay = Math.atan2(-dx, -dz); ap = Math.atan2(dy, d); }
  }
  inp.yaw = ay; inp.pitch = ap;
  if (G.testInput) { const t = G.testInput; for (const k in t) inp[k] = t[k]; if (t.yaw != null) G.yaw = t.yaw; if (t.pitch != null) G.pitch = t.pitch; }
}

// ---------------------------------------------------------------------------------------------
// simulation stepping + events
function simSteps(seconds, fast) {
  const M = G.M; let n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    if (G.me && G.me.st !== "dead" && !fast) humanInput(DT);
    else if (G.me && G.testInput && G.me.st !== "dead") humanInput(DT);
    updateBots(M, DT); Sim.step(M, DT);
    if (fast && M.events.length > 2000) handleEvents(true);
  }
  handleEvents(fast);
}
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
function playerById(id) { return G.M.players.find((p) => p.id === id); }
function listenerDist(x, y, z) { return R.camera.position.distanceTo(_v.set(x, y, z)); }
function panOf(x, z) { const cam = R.camera; const a = Math.atan2(x - cam.position.x, z - cam.position.z); const cy = Math.atan2(-Math.sin(G.camYaw || 0), -Math.cos(G.camYaw || 0)); return clamp(Math.sin(a - cy) * -1, -1, 1) * 0.8; }
function radio(text) { if (!S.subs) return; HUD.subtitle(`<b>RADIO</b> ${text}`, 4.5); AUD.sfxRadioBlip(); }
function handleEvents(fast) {
  const M = G.M; if (!M) return; const me = G.me;
  for (const e of M.events) {
    switch (e.type) {
      case "item": if (!G.items.has(e.item.id)) { const m = makeItemMesh(e.item); m.visible = false; R.scene.add(m); G.items.set(e.item.id, m); } break;
      case "itemGone": { const m = G.items.get(e.item.id); if (m) { R.scene.remove(m); G.items.delete(e.item.id); } break; }
      case "crate": { const m = G.crates[e.crate.id]; if (m) m.userData.open = true; if (!fast && e.pid === me.id) AUD.sfxPickup("crate"); break; }
      case "pickup": if (e.pid === me.id && !fast) { AUD.sfxPickup(e.item.k); if (e.item.k === "weapon") HUD.toast(`${RARITY[e.item.r || 0].name} ${WEAPONS[e.item.w].name}`); } break;
      case "pickle": if (e.pid === me.id) { S.pickles++; S.pickleThis = (S.pickleThis || 0) + 1; persist(); radio(RADIO.pickle); HUD.banner("GOLDEN PICKLE", "Collected · " + S.pickles + " all-time", 3); } break;
      case "fire": if (!fast) onFire(e); break;
      case "shot": if (!fast) onShot(e); break;
      case "hit": onHit(e, fast); break;
      case "kill": onKill(e, fast); break;
      case "chute": if (!fast) { const d = listenerDist(...posOf(e.pid)); if (e.pid === me.id || d < 60) AUD.sfxChute(e.open); } break;
      case "landed": if (!fast) { landingDust(e.x, e.y, e.z); if (e.pid === me.id) { AUD.sfxLand(false); HUD.banner(poiName(e.x, e.z), "Landed", 2.5); } } break;
      case "land": if (!fast && e.pid === me.id) AUD.sfxLand(e.hard); break;
      case "jump": if (!fast && e.pid === me.id && e.plane) { radio("Pilot: Contractor away. Good hunting."); } break;
      case "splash": if (!fast) { splash(e.x, SEA, e.z); } break;
      case "act": if (!fast && e.pid === me.id) { if (e.k === "reload") { AUD.sfxReload(0); const id = me.id; setTimeout(() => G.me && G.me.id === id && G.me.act && G.me.act.k === "reload" && AUD.sfxReload(1), 500); } else if (e.k === "plate") AUD.sfxPickup("plate"); else AUD.sfxHeal(); } break;
      case "reloaded": if (!fast && e.pid === me.id) AUD.sfxReload(2); break;
      case "plated": if (!fast && e.pid === me.id) AUD.sfxPlate(); break;
      case "healed": if (!fast && e.pid === me.id) AUD.sfxHeal(); break;
      case "swap": if (!fast && e.pid === me.id) AUD.sfxSwap(); break;
      case "dry": if (!fast && e.pid === me.id) AUD.sfxDry(); break;
      case "melee": { const p = playerById(e.pid); if (p) p.meleeT = M.t; if (!fast && (e.pid === me.id || listenerDist(p.x, p.y, p.z) < 25)) AUD.sfxMelee(!!e.hit); break; }
      case "throw": if (!fast && e.pid === me.id) AUD.sfxThrow(); break;
      case "explode": if (!fast) { explosion(e.x, e.y, e.z); const d = listenerDist(e.x, e.y, e.z); AUD.sfxExplosion(d, panOf(e.x, e.z)); G.shake = Math.max(G.shake, clamp(1 - d / 40, 0, 1) * 0.8); } break;
      case "smoke": if (!fast) AUD.sfxSmokePop(listenerDist(e.x, e.y, e.z)); break;
      case "gasShrink": if (G.mode === "match") { HUD.banner("THE ZONE IS COLLAPSING", `Stage ${e.st + 1} · gas advancing`, 3.5); radio(RADIO.stage[Math.min(e.st, 2)]); AUD.sfxUI("alert"); } break;
      case "gasStage": if (G.mode === "match") { HUD.banner("NEXT ZONE MARKED", "Check your map (M)", 3); AUD.sfxUI("alert"); } break;
      case "win": if (me.st === "dead" && G.M.mode === "br") { const w = playerById(e.pid); G.winnerName = w ? w.name : null; G.resultsShown = false; G.deadT = performance.now() - 1200; } break;
    }
  }
  M.events.length = 0;
}
function posOf(id) { const p = playerById(id); return p ? [p.x, p.y, p.z] : [0, 0, 0]; }
function poiName(x, z) { const p = poiAt(x, z); return p ? p.name.toUpperCase() : "ZONE NINE"; }
function onFire(e) {
  const me = G.me, p = playerById(e.pid), Wd = WEAPONS[e.wid]; if (!p || !Wd) return;
  const mine = e.pid === me.id, av = G.av.get(e.pid);
  const d = mine ? 0 : listenerDist(e.x, e.y, e.z);
  AUD.sfxGun(Wd.snd, d, mine ? 0 : panOf(e.x, e.z), mine);
  if (d > 600) return;
  const mz = mine && G.camMode === "fp" && G.vm ? vmMuzzle(_v) : av ? av.muzzleWorld(_v) : _v.set(e.x, e.y, e.z);
  const dx = -Math.sin(p.yaw), dz = -Math.cos(p.yaw);
  muzzle(mz.x, mz.y, mz.z, dx, Math.sin(p.pitch), dz, Wd.cls === "Shotgun" || Wd.cls === "Sniper", d < 40);
  if (Wd.cls !== "Shotgun" && d < 40) shell(mz.x - dx * 0.25, mz.y - 0.05, mz.z - dz * 0.25, Math.cos(p.yaw), -Math.sin(p.yaw), groundAt(W, p.x, p.z, p.y + 0.5));
  if (mine) { G.kick = Math.min(1, G.kick + (Wd.cls === "Sniper" || Wd.cls === "Shotgun" ? 1 : 0.35)); G.shake = Math.max(G.shake, Wd.cls === "Sniper" || Wd.cls === "Shotgun" ? 0.25 : 0.08); }
}
function onShot(e) {
  const me = G.me, p = playerById(e.pid), Wd = WEAPONS[e.wid]; if (!p) return;
  const mine = e.pid === me.id, av = G.av.get(e.pid);
  const start = mine && G.camMode === "fp" && G.vm ? vmMuzzle(_v2) : av ? av.muzzleWorld(_v2) : _v2.set(e.ox, e.oy, e.oz);
  const d = listenerDist(e.x, e.y, e.z);
  if ((e.k === 0 || e.k % 3 === 0) && (d < 500 || mine)) tracer(start.x, start.y, start.z, e.x, e.y, e.z, Wd ? Wd.tracer : 0.6);
  if (e.s >= 0 && d < 220) { impact(e.x, e.y, e.z, e.nx, e.ny, e.nz, e.s); if (e.k === 0) AUD.sfxImpact(e.s, d); }
  // near-miss crack
  if (!mine && me.st === "ground" && !e.hp) { const ex = me.x - e.ox, ez = me.z - e.oz, lx = e.x - e.ox, lz = e.z - e.oz, l2 = lx * lx + lz * lz; const t = clamp((ex * lx + ez * lz) / Math.max(l2, 1e-3), 0, 1); const cx = e.ox + lx * t - me.x, cz = e.oz + lz * t - me.z; if (cx * cx + cz * cz < 4 && t > 0.05 && t < 0.99) AUD.sfxCrack(); }
}
function onHit(e, fast) {
  const me = G.me, M = G.M;
  if (!fast && e.x != null && e.wid !== "gas" && e.wid !== "fall") bodyHit(e.x, e.y, e.z, e.armor, !!S.blood);
  if (e.by === me.id && e.pid !== me.id && !fast) {
    HUD.hitmarker(e.kill ? "kill" : e.zone === "head" ? "head" : ""); AUD.sfxHit(e.zone === "head", e.kill, e.armor);
    if (e.x != null) HUD.dmgNumber(e.x, e.y, e.z, e.dmg, e.zone === "head" ? "h" : e.armor ? "a" : "");
    if (e.broke) AUD.sfxPlateBreak();
  }
  if (e.pid === me.id && !fast) {
    if (!me.god) G.hurt = Math.min(1, G.hurt + e.dmg / 60);
    if (e.wid !== "gas") { AUD.sfxHurt(e.armor); if (e.by && e.by !== me.id) { const a = Math.atan2(e.ax - me.x, e.az - me.z); const rel = wrapA(-(a - Math.atan2(-Math.sin(G.yaw), -Math.cos(G.yaw)))); HUD.damageDir(rel); } }
    if (e.broke) AUD.sfxPlateBreak();
  }
  const av = G.av.get(e.pid); if (av && !fast) av.flash = 0.6;
}
function onKill(e, fast) {
  const me = G.me, M = G.M, v = playerById(e.pid), k = e.by ? playerById(e.by) : null;
  if (v && v.target) { if (e.by === me.id && !fast) HUD.feed(`<span class="me">Dilly</span><span class="w">${WEAPONS[e.wid] ? WEAPONS[e.wid].name : e.wid}</span>Target ${v.name}${e.head ? ' <span class="hs">HEADSHOT</span>' : ""}`); return; }
  const wn = e.wid === "gas" ? "gas" : e.wid === "fall" ? "fall" : e.wid === "frag" ? "Frag" : e.wid === "knife" ? "Knife" : WEAPONS[e.wid] ? WEAPONS[e.wid].name : e.wid;
  const nm = (p) => p ? (p.id === me.id ? `<span class="me">Dilly</span>` : p.name) : "";
  if (!fast || e.by === me.id || e.pid === me.id) HUD.feed(k && k !== v ? `${nm(k)}<span class="w">[${wn}]</span>${nm(v)}${e.head ? ' <span class="hs">HEADSHOT</span>' : ""}` : `${nm(v)}<span class="w">[${wn}]</span>`);
  if (e.by === me.id && e.pid !== me.id) { HUD.banner("ELIMINATED", v.name, 2); AUD.sfxUI("kill"); if (Math.random() < 0.4) radio(RADIO.kill[Math.floor(Math.random() * 2)]); }
  if (e.pid === me.id) { me.killedBy = e.by; me.killWid = e.wid; G.deadT = performance.now(); G.spec.idx = k ? Math.max(0, aliveList().indexOf(k)) : 0; HUD.banner("YOU WERE ELIMINATED", k ? "by " + k.name : e.wid === "gas" ? "the gas got you" : "", 3); }
}
function aliveList() { return G.M ? G.M.players.filter((p) => p.st !== "dead" && !p.target && p !== G.me) : []; }

// ---------------------------------------------------------------------------------------------
// cameras
const _ray = new THREE.Vector3();
function updateCamera(dt) {
  const cam = R.camera, M = G.M, me = G.me;
  let fov = S.fov;
  if (G.mode === "title" || G.mode === "lobby" || !M) {
    const t = performance.now() / 1000 * 0.03;
    cam.position.set(Math.cos(t) * 620 + 60, 210, Math.sin(t) * 620 + 60); cam.lookAt(60, 20, 40);
    G.camYaw = Math.atan2(-(80 - cam.position.x), -(40 - cam.position.z));
    cam.fov = 50; cam.updateProjectionMatrix(); return;
  }
  if (G.freeCam) { const f = G.freeCam; cam.position.set(f.x, f.y, f.z); cam.rotation.set(f.pitch, f.yaw, 0, "YXZ"); G.camYaw = f.yaw; cam.fov = f.fov || S.fov; cam.updateProjectionMatrix(); return; }
  const shake = G.shake; G.shake = Math.max(0, G.shake - dt * 2.5);
  const sx = (Math.random() - 0.5) * shake * 0.08, sy = (Math.random() - 0.5) * shake * 0.08;
  let target = G.watch && G.watch.st !== "dead" ? G.watch : me;
  if (me.st === "dead" && !G.watch) {
    if (G.spec.free) {
      const K = G.keys, sp = (K.ShiftLeft ? 60 : 20) * dt, f = [-Math.sin(G.spec.yaw) * Math.cos(G.spec.pitch), Math.sin(G.spec.pitch), -Math.cos(G.spec.yaw) * Math.cos(G.spec.pitch)];
      const rt = [Math.cos(G.spec.yaw), 0, -Math.sin(G.spec.yaw)]; const mz = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0), mx = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0);
      G.spec.x += (f[0] * mz + rt[0] * mx) * sp; G.spec.y += f[1] * mz * sp; G.spec.z += (f[2] * mz + rt[2] * mx) * sp;
      G.spec.y = Math.max(G.spec.y, terrainH(W, G.spec.x, G.spec.z) + 1);
      cam.position.set(G.spec.x, G.spec.y, G.spec.z); cam.rotation.set(G.spec.pitch, G.spec.yaw, 0, "YXZ"); G.camYaw = G.spec.yaw;
      cam.fov = fov; cam.updateProjectionMatrix(); return;
    }
    const L = aliveList();
    if (L.length && performance.now() - G.deadT > 2500) { G.spec.idx = ((G.spec.idx % L.length) + L.length) % L.length; target = L[G.spec.idx]; }
    if (target === me) { // death cam: slow orbit over the body
      const t = performance.now() / 1000 * 0.3; cam.position.set(me.x + Math.cos(t) * 6, me.y + 4, me.z + Math.sin(t) * 6); cam.lookAt(me.x, me.y + 0.5, me.z); G.camYaw = t; cam.fov = fov; cam.updateProjectionMatrix(); return;
    }
    const sp = $("spec"); sp.classList.remove("hidden"); sp.innerHTML = `SPECTATING <b style="color:var(--gold)">${target.name}</b> · ${target.kills} kills · <kbd>←</kbd><kbd>→</kbd> switch · <kbd>F</kbd> free cam · <kbd>Enter</kbd> results`;
  } else $("spec").classList.add("hidden");
  const tY = target === me ? G.yaw : lerpAngle(G.specYaw ?? target.yaw, target.yaw, Math.min(1, dt * 5));
  if (target !== me) G.specYaw = tY;
  const tP = target === me ? G.pitch : -0.15;
  const recY = target.recY || 0, recP = target.recP || 0;
  const cy = tY + recY, cp = tP + recP;
  G.camYaw = cy;
  if (target.st === "plane" && M.plane) {
    const P = M.plane, ox = Math.sin(cy) * 46, oz = Math.cos(cy) * 46;
    cam.position.set(P.x + ox, P.y + 12 - cp * 30, P.z + oz); cam.lookAt(P.x, P.y - 4, P.z);
  } else if (target.st === "fall" || target.st === "chute") {
    const back = target.st === "fall" ? 6.5 : 9, up = target.st === "fall" ? 2.2 : 3.5, pp = clamp(cp, -1.2, 0.5);
    const fx = -Math.sin(cy) * Math.cos(pp), fy = Math.sin(pp), fz = -Math.cos(cy) * Math.cos(pp);
    cam.position.set(target.x - fx * back, target.y + up - fy * back + 1, target.z - fz * back);
    cam.lookAt(target.x + fx * 4, target.y + 1 + fy * 4 + (target.st === "chute" ? 1 : 0), target.z + fz * 4);
    fov = fov + (target.st === "fall" ? clamp(-target.vy - 40, 0, 30) * 0.4 : 0);
  } else {
    const ads = target.adsT || 0, w = Sim.curWeapon(target), zoom = w ? WEAPONS[w.id].zoom : 1;
    const ey = Sim.eyeY(target) + (target.swim ? 0.3 : 0);
    const fx = -Math.sin(cy) * Math.cos(cp), fy = Math.sin(cp), fz = -Math.cos(cy) * Math.cos(cp), rx = Math.cos(cy), rz = -Math.sin(cy);
    if (G.camMode === "fp" && target === me) {
      cam.position.set(me.x + fx * 0.15, ey, me.z + fz * 0.15);
    } else {
      const back = lerp(2.7, 2.25, ads), right = lerp(0.8, 0.85, ads), up = lerp(0.25, 0.24, ads);
      const px = target.x, py = ey, pz = target.z;
      const test = (sr) => { const tx = px - fx * back + rx * right * sr, ty = py + up - fy * back * 0.9, tz = pz - fz * back + rz * right * sr; const dx = tx - px, dy = ty - py, dz = tz - pz, d = Math.hypot(dx, dy, dz); const h = raycast(W, px, py, pz, dx / d, dy / d, dz / d, d + 0.25); return { dx, dy, dz, k: h ? Math.max(0.12, (h.t - 0.3) / d) : 1 }; };
      let c = test(G.shoulder || 1);
      if (c.k < 0.7) { const o = test(-(G.shoulder || 1)); if (o.k > c.k + 0.15) { c = o; G.shoulder = -(G.shoulder || 1); } }
      const { dx, dy, dz, k } = c;
      cam.position.set(px + dx * k, py + dy * k, pz + dz * k);
    }
    cam.rotation.set(cp, cy, 0, "YXZ");
    fov = lerp(fov, fov / zoom, ads);
    if (target === me && G.camMode === "fp" && ads > 0.6 && w && WEAPONS[w.id].scope) fov = S.fov / WEAPONS[w.id].zoom;
  }
  cam.position.x += sx; cam.position.y += sy;
  cam.fov += (fov - cam.fov) * Math.min(1, dt * 14); cam.updateProjectionMatrix();
  // crosshair aim point
  if (target === me && me.st === "ground") {
    cam.getWorldDirection(_ray);
    const h = raycast(W, cam.position.x, cam.position.y, cam.position.z, _ray.x, _ray.y, _ray.z, 800);
    let best = h ? h.t : 800;
    for (const q of M.players) { if (q === me || q.st === "dead" || q.st === "plane") continue; const cx = q.x - cam.position.x, cyy = q.y + 1.1 - cam.position.y, cz = q.z - cam.position.z; const t = cx * _ray.x + cyy * _ray.y + cz * _ray.z; if (t < 0 || t > best) continue; const px = cam.position.x + _ray.x * t - q.x, py = cam.position.y + _ray.y * t - q.y - 1.0, pz = cam.position.z + _ray.z * t - q.z; if (px * px + pz * pz < 0.2 && Math.abs(py) < 0.95) best = t; }
    G.aimHit = { x: cam.position.x + _ray.x * best, y: cam.position.y + _ray.y * best, z: cam.position.z + _ray.z * best };
  } else if (target === me) {
    cam.getWorldDirection(_ray); const h = raycast(W, cam.position.x, cam.position.y, cam.position.z, _ray.x, _ray.y, _ray.z, 2500); G.aimHit = h ? { x: h.x, y: h.y, z: h.z } : null;
  }
}
function lerpAngle(a, b, k) { return a + wrapA(b - a) * k; }

// first-person viewmodel
function updateViewmodel(dt) {
  const me = G.me, fp = G.camMode === "fp" && me && me.st === "ground" && me.hp > 0 && inGame();
  const w = me ? Sim.curWeapon(me) : null;
  R.vmPass.enabled = fp && !!w;
  if (!fp || !w) return;
  if (G.vmId !== w.id) { if (G.vm) R.vmScene.remove(G.vm); G.vm = makeGun(w.id); R.vmScene.add(G.vm); G.vmId = w.id; G.vm.traverse((o) => { if (o.isMesh) o.castShadow = false; }); }
  const ads = me.adsT, t = performance.now() / 1000, mv = Math.min(1, me.moveSpd / 5);
  G.kick = Math.max(0, G.kick - dt * 8);
  const bob = Math.sin(t * (me.sprint ? 11 : 7)) * 0.012 * mv * (1 - ads), bobx = Math.cos(t * (me.sprint ? 5.5 : 3.5)) * 0.01 * mv * (1 - ads);
  const reload = me.act && me.act.k === "reload" ? Math.sin(me.act.t / me.act.dur * Math.PI) : 0, heal = me.act && me.act.k !== "reload" ? 1 : 0;
  G.vm.position.set(lerp(0.2, 0, ads) + bobx, lerp(-0.24, -0.135, ads) + bob - reload * 0.12 - heal * 0.25 - (me.sprint ? 0.04 : 0), lerp(-0.42, -0.34, ads) + G.kick * 0.05);
  G.vm.rotation.set(G.kick * 0.12 + reload * 0.5 + (me.sprint ? -0.3 : 0), Math.PI + (me.sprint ? 0.5 : 0), reload * 0.4);
  R.vmCam.fov = 55 / lerp(1, Math.min(1.4, WEAPONS[w.id].zoom), ads); R.vmCam.updateProjectionMatrix();
  G.vm.visible = !(WEAPONS[w.id].scope && ads > 0.6);
}
function vmMuzzle(out) { const m = G.vm.userData.muzzle; out.set(0, 0, m).applyMatrix4(G.vm.matrixWorld); // view space -> world
  out.applyMatrix4(R.camera.matrixWorld); return out; }

// ---------------------------------------------------------------------------------------------
// per-frame view sync
function syncView(dt) {
  const M = G.M, me = G.me, cam = R.camera, t = M.t;
  // plane
  if (M.plane) { const P = M.plane; G.plane.visible = !P.gone; G.plane.position.set(P.x, P.y, P.z); G.plane.rotation.y = Math.atan2(P.dx, P.dz); for (const pr of G.plane.props) pr.rotation.z += dt * 40; }
  // avatars
  G.frame++;
  for (const p of M.players) {
    const av = G.av.get(p.id); if (!av) continue;
    const d = cam.position.distanceTo(_v.set(p.x, p.y, p.z));
    const hide = (p === me && G.camMode === "fp" && me.st === "ground") || d > 520;
    if (hide) { av.root.visible = false; av.gunHolder.visible = false; continue; }
    const near = d < 90;
    if (near || (G.frame + p.id) % 3 === 0) av.update(p, near ? dt : dt * 3, t, near);
    // footsteps
    if (p.st === "ground" && p.onGround && !p.swim && d < 40) {
      const acc = (G.stepAcc.get(p.id) || 0) + p.moveSpd * dt; const stride = p.sprint ? 1.9 : p.crouch ? 1.1 : 1.5;
      if (acc > stride) { G.stepAcc.set(p.id, 0); const bx = groundAt(W, p.x, p.z, p.y + 0.2); const surf = bx > terrainH(W, p.x, p.z) + 0.05 ? (surfaceUnder(p)) : surfaceAt(W, p.x, p.z); AUD.sfxStep(surf, p === me ? (p.crouch ? 0.1 : 0.2) : 0.35, p === me ? 0 : d); } else G.stepAcc.set(p.id, acc);
    }
  }
  // items: show only nearby
  for (const [id, m] of G.items) { const dx = m.position.x - cam.position.x, dz = m.position.z - cam.position.z; m.visible = dx * dx + dz * dz < 110 * 110; if (m.visible && m.children[m.children.length - 1]) m.rotation.y += 0; }
  for (const c of G.crates) { if (c.userData.open && c.userData.lid.rotation.x > -1.9) c.userData.lid.rotation.x -= dt * 6; }
  // grenades
  const seen = new Set();
  for (const g of M.proj) { seen.add(g.id); let m = G.gren.get(g.id); if (!m) { m = makeGrenadeMesh(g.k); R.scene.add(m); G.gren.set(g.id, m); } m.position.set(g.x, g.y - 0.08, g.z); m.rotation.x += dt * 8; }
  for (const [id, m] of G.gren) if (!seen.has(id)) { R.scene.remove(m); G.gren.delete(id); }
  for (const s of M.smokes) if (s.t < s.life - 5) smokeCloud(s.x, s.y, s.z, s.t);
}
function surfaceUnder(p) { return surfaceAt(W, p.x, p.z) === SURF.CONCRETE ? SURF.CONCRETE : (p.y > 2.9 && p.y < 3.6 && Math.abs(p.x - 430) < 25 && p.z > 550 ? SURF.WOOD : SURF.CONCRETE); }

// ---------------------------------------------------------------------------------------------
// main loop
function loop(now) {
  requestAnimationFrame(loop);
  const rdt = Math.min(1, (now - G.lastFrame) / 1000); let dt = Math.min(0.1, rdt); G.lastFrame = now;
  const t = now / 1000;
  G.pingCd -= dt;
  if (G.mode === "lobby") {
    G.lobbyT -= dt; const M = G.M;
    const n = M.players.length, shown = clamp(Math.floor((20 - G.lobbyT) / 20 * n * 1.4) + 1, 1, n);
    if (shown > (G.lobbyShown || 0)) { const L = $("lobbyList"); for (let i = G.lobbyShown || 0; i < shown; i++) { const p = M.players[i]; const s = document.createElement("span"); s.innerHTML = `<b>›</b>${p.human ? "Dilly (you)" : p.name}`; L.appendChild(s); } G.lobbyShown = shown; }
    $("lobbyN").textContent = shown + "/" + n; $("lobbyCd").textContent = fmtTime(G.lobbyT);
    AUD.radioUpdate();
    if (G.lobbyT <= 0) deploy();
  }
  if (inGame() && !G.paused) {
    G.acc += dt * G.timeScale;
    let steps = 0;
    while (G.acc >= DT && steps < 8) {
      if (G.me.st !== "dead") humanInput(DT); else if (G.testInput) humanInput(DT);
      updateBots(G.M, DT); Sim.step(G.M, DT); G.acc -= DT; steps++;
    }
    if (steps >= 8) G.acc = 0;
    handleEvents(false);
    // death / win flow
    const M = G.M, me = G.me;
    if (M.mode === "br") {
      if (me.st === "dead" && G.deadT > 0 && performance.now() - G.deadT > 2200 && !G.resultsShown) showResults(false);
      if (M.over && !G.resultsShown && me.st !== "dead") { HUD.banner("VICTORY", "Last contractor standing", 4); G.deadT = performance.now(); setTimeout(() => showResults(true), 2000); G.resultsShown = "pending"; }
      if (M.over && G.resultsShown === "pending") { /* waiting */ }
    }
  }
  updateCamera(dt);
  if (G.M && inGame()) {
    syncView(dt); updateViewmodel(dt);
    const me = G.me, g = G.M.gas;
    const inGas = !!(me.inGas && me.st !== "plane" && me.st !== "dead");
    const camInGas = g && R.camera.position.y < 250 && Math.hypot(R.camera.position.x - g.cx, R.camera.position.z - g.cz) > g.r && (me.st === "dead" || inGas);
    R.grade.uniforms.gas.value += ((camInGas ? 1 : 0) - R.grade.uniforms.gas.value) * Math.min(1, dt * 3);
    $("gastint").style.opacity = inGas ? 1 : 0;
    G.hurt = Math.max(0, G.hurt - dt * 0.9); R.grade.uniforms.hurt.value = G.hurt * 0.8 + (me.st !== "dead" && me.hp < 30 ? 0.25 + Math.sin(t * 5) * 0.08 : 0);
    const sc = G.camMode === "fp" || true ? (me.adsT > 0.7 && Sim.curWeapon(me) && WEAPONS[Sim.curWeapon(me).id].scope && me.st === "ground") : false;
    HUD.updateHUD(rdt, G.M, me.st === "dead" ? null : me, R.camera, { yaw: G.camYaw || G.yaw, scoped: sc, fp: G.camMode === "fp" });
    HUD.drawMinimap(G.M, me.st === "dead" ? null : me, G.yaw);
    if (G.mapOpen) HUD.drawMap(G.M, me, G.yaw);
    // audio state
    const intensity = g ? clamp(g.st / 5 + (G.M.t - (me.lastHitT || -99) < 8 || G.M.t - me.lastAtkT < 8 ? 0.3 : 0), 0, 1) : 0.2;
    AUD.musicUpdate(intensity);
    const pd = G.M.plane && !G.M.plane.gone ? R.camera.position.distanceTo(_v.set(G.M.plane.x, G.M.plane.y, G.M.plane.z)) : 1e9;
    AUD.updateLoops(dt, { fall: me.st === "fall", chute: me.st === "chute", speed: Math.hypot(me.vx, me.vy, me.vz), alt: me.y, gas: inGas ? 1 : camInGas ? 0.6 : (g ? clamp(1 - Math.abs(Math.hypot(me.x - g.cx, me.z - g.cz) - g.r) / 30, 0, 0.5) : 0), plane: me.st === "plane" ? 1 : clamp(1 - pd / 700, 0, 1), calm: me.st === "ground" && G.M.t - (me.lastHitT || -99) > 15, menu: false });
    updateFX(dt, R.camera, G.M);
    updateSun(R.camera.position.x, R.camera.position.z);
    trackFps(dt);
  } else {
    // title: demo plane circles the island
    const a = t * 0.05; G.demoPlane.visible = true; G.demoPlane.position.set(Math.cos(a) * 600, 300, Math.sin(a) * 600); G.demoPlane.rotation.y = -a + Math.PI; for (const pr of G.demoPlane.props) pr.rotation.z += dt * 40;
    updateFX(dt, R.camera, null); updateSun(R.camera.position.x * 0.2, R.camera.position.z * 0.2);
    AUD.updateLoops(dt, { menu: true, gas: 0, plane: 0, speed: 0, alt: 0 });
  }
  updateWorld(dt, R.camera);
  renderFrame();
  renderPreview(dt, t);
}
function trackFps(dt) {
  const F = G.fps; if (F.locked || R.quality !== "high") return;
  F.acc += dt; F.n++;
  if (F.acc >= 1) { const fps = F.n / F.acc; F.acc = 0; F.n = 0; F.low = fps < 40 ? F.low + 1 : 0; if (F.low >= 3) { F.low = 0; setQuality("low"); S.quality = "low"; HUD.toast("Quality: LOW (auto)"); F.locked = true; } }
}

// ---------------------------------------------------------------------------------------------
// test / debug API
window.LZ_R = R;
window.LZ = {
  state() {
    const M = G.M, me = G.me;
    return { mode: G.mode, quality: R.quality, t: M ? +M.t.toFixed(2) : 0, alive: M ? M.alive : 0, over: M ? M.over : false, winner: M && M.winner ? M.winner.name : null, results: !!G.resultsShown,
      me: me ? { st: me.st, x: +me.x.toFixed(1), y: +me.y.toFixed(1), z: +me.z.toFixed(1), hp: +me.hp.toFixed(1), armor: Sim.armor(me), kills: me.kills, dmg: Math.round(me.dmg), place: me.place, slot: me.inv.slot, w: me.inv.w.map((w) => w && { id: w.id, r: w.r, mag: w.mag }), ammo: { ...me.inv.ammo }, act: me.act && me.act.k, adsT: me.adsT, inGas: !!me.inGas, plates: me.inv.plate } : null,
      gas: M && M.gas ? { st: M.gas.st, ph: M.gas.ph, r: Math.round(M.gas.r), t: +M.gas.t.toFixed(1) } : null, bots: M ? M.players.filter((p) => p.bot).map((p) => ({ n: p.name, st: p.st, m: p.ai && p.ai.mode, k: p.kills, hp: Math.round(p.hp) })) : [] };
  },
  play(o = {}) { initAudioSafe(); newMatch(o); deploy(); return this.state(); },
  range() { startRange(); return this.state(); },
  lobby() { startLobby(); },
  title() { toTitle(); },
  advance(sec, fast = true) { if (!G.M) return; simSteps(sec, fast); return this.state(); },
  step(n = 1) { if (!G.M) return; for (let i = 0; i < n; i++) { humanInput(DT); updateBots(G.M, DT); Sim.step(G.M, DT); } handleEvents(false); return this.state(); },
  jump() { if (G.me) G.me.inp.jump = true; },
  teleport(x, z, y) { const me = G.me; if (!me) return; me.x = x; me.z = z; me.y = y != null ? y : groundAt(W, x, z, terrainH(W, x, z) + 1.2); me.st = "ground"; me.onGround = true; me.vx = me.vy = me.vz = 0; },
  look(yaw, pitch) { G.yaw = yaw; G.pitch = pitch; },
  input(o) { G.testInput = o; },
  give(wid, r = 2) { const me = G.me; const s = me.inv.w[0] ? (me.inv.w[1] ? me.inv.slot % 2 : 1) : 0; me.inv.w[s] = { id: wid, r, mag: WEAPONS[wid].mag }; me.inv.slot = s; me.inv.ammo[WEAPONS[wid].ammo] = AMMO[WEAPONS[wid].ammo].max; return s; },
  kit() { const me = G.me; me.pl = [50, 50, 50]; Object.assign(me.inv, { plate: 5, bandage: 6, medkit: 3, frag: 3, smoke: 2 }); },
  god(on = true) { if (G.me) G.me.god = on; },
  gasStage(n) { Sim.forceGasStage(G.M, n); handleEvents(false); return this.state().gas; },
  spawnBots(n = 2, dist = 25) { const M = G.M, me = G.me; const out = []; for (let i = 0; i < n; i++) { const a = i / n * 6.28, x = me.x + Math.cos(a) * dist, z = me.z + Math.sin(a) * dist; const p = Sim.addPlayer(M, CALLSIGNS[(i + 5) % CALLSIGNS.length], { bot: true, st: "ground", x, z, y: groundAt(W, x, z, 999) }); p.onGround = true; p.inv.w[0] = { id: "falcon", r: 1, mag: 30 }; p.inv.ammo.heavy = 120; p.ai = { poi: POIS[0], tx: x, tz: z, jumpS: 0, mode: "rotate", think: 0, goal: null, enemy: null, seenT: -99, react: 0, aimY: 0, aimP: 0, errY: 0, errP: 0, trackT: 0, burst: 0, burstCd: 0, strafe: 1, strafeT: 0, crouchT: 0, stuckT: 0, lastX: x, lastZ: z, detT: 0, detA: 0, wanderT: 0, coverT: 0, grenT: 99, rng: mulberry32(i * 7 + 3), stuckN: 0, diff: { aimErr: 2.6, react: 0.55, spot: 95, burst: 5, track: 0.8, heal: 0.45, acc: 0.8 }, heardT: -99, semi: false, lookY: 0 }; G.av.set(p.id, new Avatar(STYLES.rivals[i % STYLES.rivals.length])); out.push(p.name); } return out; },
  cam(mode) { G.camMode = mode; },
  quality(q) { setQuality(q); },
  watch(name) { G.watch = name ? G.M.players.find((p) => p.name === name) : null; return !!G.watch; },
  toCenter() { const P = G.M.plane; const s = -(P.ax * P.dx + P.az * P.dz) - P.s; if (s > 0) simSteps(s / P.speed, true); return P.s; },
  preset(p) { applyPreset(p); },
  pause(on) { setPause(on); },
  map(on) { G.mapOpen = on; show("mapov", on); },
  free(x, y, z, yaw, pitch) { G.freeCam = x == null ? null : { x, y, z, yaw, pitch }; },
  speed(k) { G.timeScale = k; },
  results() { showResults(false); },
  G
};
boot();
