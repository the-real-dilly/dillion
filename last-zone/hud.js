// DILLION: LAST ZONE - DOM HUD, minimap and full map.
import * as THREE from "three";
import { WEAPONS, RARITY, AMMO, ITEMS, PLATE_HP, GAS_STAGES } from "./data.js";
import { HALF, POIS, terrainH, surfaceAt, SURF } from "./world.js";
import { curWeapon, currentSpread, bestInteract, armor } from "./sim.js";
import { fmtTime, clamp } from "./util.js";

const $ = (id) => document.getElementById(id);
export const H = { pings: [], feed: [], subT: 0, bannerT: 0, toastT: 0, hitT: 0, dirs: [], nums: [] };
let mapBase = null;

export function initHUD(W) {
  H.W = W;
  // map base image
  const S = 1024, c = document.createElement("canvas"); c.width = c.height = S; const x = c.getContext("2d");
  const img = x.createImageData(S, S), d = img.data;
  const SC = { 0: [52, 74, 86], 1: [176, 162, 124], 2: [86, 100, 60], 3: [120, 116, 108], 4: [128, 108, 78], 5: [70, 68, 64], 6: [128, 126, 120], 7: [110, 92, 70] };
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const wx = i / S * 2 * HALF - HALF, wz = j / S * 2 * HALF - HALF, h = terrainH(W, wx, wz), s = surfaceAt(W, wx, wz);
    let col = SC[s] || SC[2];
    if (s === SURF.WATER || h < 0) { const k = clamp(-h / 25, 0, 1); col = [38 - 18 * k, 64 - 26 * k, 74 - 22 * k]; }
    const hx = terrainH(W, wx + 3, wz) - terrainH(W, wx - 3, wz), hz = terrainH(W, wx, wz + 3) - terrainH(W, wx, wz - 3);
    const shade = h > 0 ? clamp(1 + (-hx - hz) * 0.08, 0.7, 1.3) : 1;
    const contour = h > 2 && Math.abs((h % 10) - 0) < 0.5 ? 0.88 : 1;
    const k = (j * S + i) * 4; d[k] = col[0] * shade * contour; d[k + 1] = col[1] * shade * contour; d[k + 2] = col[2] * shade * contour; d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const tx = (v) => (v + HALF) / (2 * HALF) * S;
  x.strokeStyle = "#3d3b37"; x.lineWidth = 3; x.lineCap = "round";
  for (const rd of W.roads) { x.beginPath(); rd.pts.forEach((p, i) => (i ? x.lineTo(tx(p[0]), tx(p[2])) : x.moveTo(tx(p[0]), tx(p[2])))); x.stroke(); }
  x.fillStyle = "#c9c1ae";
  for (const b of W.buildings) x.fillRect(tx(b.x0), tx(b.z0), Math.max(1.5, tx(b.x1) - tx(b.x0)), Math.max(1.5, tx(b.z1) - tx(b.z0)));
  if (W.special.containers) { for (const ct of W.special.containers) { x.fillStyle = "#8a6a4a"; x.fillRect(tx(ct.x - ct.w / 2), tx(ct.z - ct.d / 2), tx(ct.x + ct.w / 2) - tx(ct.x - ct.w / 2), tx(ct.z + ct.d / 2) - tx(ct.z - ct.d / 2)); } }
  // grid
  x.strokeStyle = "rgba(255,255,255,0.07)"; x.lineWidth = 1;
  for (let g = -HALF; g <= HALF; g += 250) { x.beginPath(); x.moveTo(tx(g), 0); x.lineTo(tx(g), S); x.stroke(); x.beginPath(); x.moveTo(0, tx(g)); x.lineTo(S, tx(g)); x.stroke(); }
  mapBase = c;
  // compass strip
  const strip = $("compassStrip"); let html = "";
  const dirs = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW" };
  for (let k = -360; k <= 720; k += 15) { const a = ((k % 360) + 360) % 360; html += dirs[a] != null ? `<span class="${a % 90 === 0 ? "c" : ""}" style="left:${(k + 360) * 4}px">${dirs[a]}</span>` : `<i style="left:${(k + 360) * 4}px"></i>`; }
  strip.innerHTML = html + `<div id="compassMarks"></div>`;
}

// world <-> map
const toMap = (v, S) => (v + HALF) / (2 * HALF) * S;
export function drawMinimap(M, me, yaw) {
  const c = $("miniC"), x = c.getContext("2d"), S = c.width, zoom = me && me.st === "ground" ? 5.2 : 2.2, span = 2 * HALF / zoom;
  const cx = me ? me.x : 0, cz = me ? me.z : 0;
  x.save(); x.fillStyle = "#14170f"; x.fillRect(0, 0, S, S);
  // north-up minimap centred on the player
  const sx = toMap(cx, mapBase.width) - mapBase.width / zoom / 2, sz = toMap(cz, mapBase.width) - mapBase.width / zoom / 2;
  x.drawImage(mapBase, sx, sz, mapBase.width / zoom, mapBase.width / zoom, 0, 0, S, S);
  const w2m = (wx, wz) => [(wx - cx) / span * S + S / 2, (wz - cz) / span * S + S / 2];
  drawZones(x, M, w2m, S / span);
  // plane path
  if (M.plane && !M.plane.gone) { const P = M.plane; const [ax, az] = w2m(P.ax, P.az), [bx, bz] = w2m(P.ax + P.dx * P.len, P.az + P.dz * P.len); x.setLineDash([6, 5]); x.strokeStyle = "rgba(255,209,102,.8)"; x.lineWidth = 2; x.beginPath(); x.moveTo(ax, az); x.lineTo(bx, bz); x.stroke(); x.setLineDash([]); const [px, pz] = w2m(P.x, P.z); x.fillStyle = "#ffd166"; x.beginPath(); x.arc(px, pz, 4, 0, 7); x.fill(); }
  // pings
  for (const p of H.pings) { const [px, pz] = w2m(p.x, p.z); x.fillStyle = "#ffd166"; x.beginPath(); x.moveTo(px, pz); x.lineTo(px - 5, pz - 10); x.lineTo(px + 5, pz - 10); x.fill(); }
  // recent gunfire (red dots, like a sound radar)
  for (const s of M.sounds) { if (me && s.pid === me.id) continue; const age = M.t - s.t; if (age > 1.5) continue; const [px, pz] = w2m(s.x, s.z); if (px < 0 || pz < 0 || px > S || pz > S) continue; x.fillStyle = `rgba(229,72,77,${1 - age / 1.5})`; x.beginPath(); x.arc(px, pz, 4, 0, 7); x.fill(); }
  // player arrow
  if (me) { x.translate(S / 2, S / 2); x.rotate(-yaw); x.fillStyle = "#ffd166"; x.strokeStyle = "#000"; x.lineWidth = 1.5; x.beginPath(); x.moveTo(0, -9); x.lineTo(6, 7); x.lineTo(0, 4); x.lineTo(-6, 7); x.closePath(); x.fill(); x.stroke(); }
  x.restore();
  // north tick
  x.fillStyle = "#ff7a45"; x.font = "bold 18px sans-serif"; x.textAlign = "center"; x.fillText("N", S / 2, 18);
}
function drawZones(x, M, w2m, k) {
  const g = M.gas; if (!g) return;
  const [cx, cz] = w2m(g.cx, g.cz);
  // gas outside the circle
  x.save(); x.fillStyle = "rgba(210,102,42,0.28)"; x.beginPath(); x.rect(-4000, -4000, 9000, 9000); x.arc(cx, cz, g.r * k, 0, Math.PI * 2, true); x.fill("evenodd");
  x.strokeStyle = "#ff7a45"; x.lineWidth = 2; x.beginPath(); x.arc(cx, cz, g.r * k, 0, 7); x.stroke();
  if (g.ph !== "done" && g.nr > 0) { const [nx, nz] = w2m(g.nx, g.nz); x.strokeStyle = "#fff"; x.lineWidth = 2; x.beginPath(); x.arc(nx, nz, g.nr * k, 0, 7); x.stroke(); }
  x.restore();
}
export function drawMap(M, me, yaw) {
  const c = $("mapC"), x = c.getContext("2d"), S = c.width;
  x.drawImage(mapBase, 0, 0, S, S);
  const w2m = (wx, wz) => [toMap(wx, S), toMap(wz, S)];
  drawZones(x, M, w2m, S / (2 * HALF));
  x.font = "600 15px 'Barlow Condensed', sans-serif"; x.textAlign = "center";
  for (const p of POIS) { const [px, pz] = w2m(p.x, p.z); x.fillStyle = "rgba(0,0,0,.55)"; const t = p.name.toUpperCase(); const w = x.measureText(t).width + 10; x.fillRect(px - w / 2, pz - 26, w, 18); x.fillStyle = p.tier >= 4 ? "#ffb52e" : p.tier >= 3 ? "#ff7a45" : "#e8e2d2"; x.fillText(t, px, pz - 12); }
  if (M.plane && !M.plane.gone) { const P = M.plane; const [ax, az] = w2m(P.ax, P.az), [bx, bz] = w2m(P.ax + P.dx * P.len, P.az + P.dz * P.len); x.setLineDash([10, 8]); x.strokeStyle = "rgba(255,209,102,.9)"; x.lineWidth = 3; x.beginPath(); x.moveTo(ax, az); x.lineTo(bx, bz); x.stroke(); x.setLineDash([]); const [px, pz] = w2m(P.x, P.z); x.fillStyle = "#ffd166"; x.beginPath(); x.arc(px, pz, 7, 0, 7); x.fill(); }
  for (const p of H.pings) { const [px, pz] = w2m(p.x, p.z); x.fillStyle = "#ffd166"; x.beginPath(); x.moveTo(px, pz); x.lineTo(px - 8, pz - 16); x.lineTo(px + 8, pz - 16); x.fill(); }
  if (me) { const [px, pz] = w2m(me.x, me.z); x.save(); x.translate(px, pz); x.rotate(-yaw); x.fillStyle = "#ffd166"; x.strokeStyle = "#000"; x.lineWidth = 2; x.beginPath(); x.moveTo(0, -12); x.lineTo(8, 9); x.lineTo(0, 5); x.lineTo(-8, 9); x.closePath(); x.fill(); x.stroke(); x.restore(); }
  // scale bar
  x.fillStyle = "#e8e2d2"; x.fillRect(20, S - 30, S * 250 / (2 * HALF), 3); x.font = "600 14px sans-serif"; x.textAlign = "left"; x.fillText("250 m", 20, S - 36);
}
export function mapToWorld(px, pz, rect) { return [(px - rect.left) / rect.width * 2 * HALF - HALF, (pz - rect.top) / rect.height * 2 * HALF - HALF]; }

// ---------------------------------------------------------------------------------------------
export function feed(html, cls = "") {
  const f = $("feed"), d = document.createElement("div"); d.innerHTML = html; if (cls) d.className = cls; f.prepend(d);
  while (f.children.length > 6) f.lastChild.remove();
  setTimeout(() => { d.style.transition = "opacity .5s"; d.style.opacity = "0"; setTimeout(() => d.remove(), 600); }, 7000);
}
export function banner(big, small = "", dur = 3) { $("bannerBig").textContent = big; $("bannerSmall").textContent = small; $("banner").style.opacity = 1; H.bannerT = dur; }
export function subtitle(html, dur = 4) { if (H.noSubs) return; const s = $("sub"); s.innerHTML = html; s.style.opacity = 1; H.subT = dur; }
export function toast(t, dur = 2.2) { const e = $("toast"); e.textContent = t; e.style.opacity = 1; H.toastT = dur; }
export function hitmarker(kind) { const h = $("hitm"); h.className = kind === "kill" ? "kill" : kind === "head" ? "head" : ""; h.style.opacity = 1; h.style.transform = "translate(-50%,-50%) scale(" + (kind === "kill" ? 1.35 : 1) + ")"; H.hitT = kind === "kill" ? 0.4 : 0.22; }
export function damageDir(ang) { const d = document.createElement("div"); d.style.transform = `rotate(${ang}rad)`; $("dmgdir").appendChild(d); setTimeout(() => { d.style.opacity = 0; }, 700); setTimeout(() => d.remove(), 1400); }
export function dmgNumber(x, y, z, dmg, cls) { if (H.nums.length > 24) { const o = H.nums.shift(); o.el.remove(); } const el = document.createElement("span"); el.textContent = Math.round(dmg); if (cls) el.className = cls; $("nums").appendChild(el); H.nums.push({ el, x, y, z, t: 0, dx: (Math.random() - 0.5) * 30 }); }

const _v = new THREE.Vector3();
export function updateHUD(dt, M, me, cam, view) {
  // timers
  if (H.subT > 0) { H.subT -= dt; if (H.subT <= 0) $("sub").style.opacity = 0; }
  if (H.bannerT > 0) { H.bannerT -= dt; if (H.bannerT <= 0) $("banner").style.opacity = 0; }
  if (H.toastT > 0) { H.toastT -= dt; if (H.toastT <= 0) $("toast").style.opacity = 0; }
  if (H.hitT > 0) { H.hitT -= dt; if (H.hitT <= 0) $("hitm").style.opacity = 0; }
  // damage numbers
  const W = window.innerWidth, Hh = window.innerHeight;
  for (let i = H.nums.length - 1; i >= 0; i--) {
    const n = H.nums[i]; n.t += dt; if (n.t > 0.9) { n.el.remove(); H.nums.splice(i, 1); continue; }
    _v.set(n.x, n.y + n.t * 0.8, n.z).project(cam); if (_v.z > 1) { n.el.style.display = "none"; continue; }
    n.el.style.display = ""; n.el.style.left = ((_v.x * 0.5 + 0.5) * W + n.dx * n.t) + "px"; n.el.style.top = ((-_v.y * 0.5 + 0.5) * Hh) + "px"; n.el.style.opacity = 1 - Math.max(0, n.t - 0.5) / 0.4;
  }
  // pings in world
  const pl = $("pingLayer"); let ph = "";
  for (const p of H.pings) { _v.set(p.x, p.y + 2, p.z).project(cam); if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) continue; const d = me ? Math.round(Math.hypot(p.x - me.x, p.z - me.z)) : 0; ph += `<span style="left:${(_v.x * 0.5 + 0.5) * W}px;top:${(-_v.y * 0.5 + 0.5) * Hh}px">${d} m</span>`; }
  pl.innerHTML = ph;
  if (!M) return;
  $("hAlive").textContent = M.alive; $("hKills").textContent = me ? me.kills : 0;
  // gas box
  const g = M.gas;
  if (g) {
    $("gasbox").classList.remove("hidden");
    const st = Math.min(g.st, GAS_STAGES.length - 1);
    $("gasK").textContent = g.ph === "wait" ? `Stage ${g.st + 1}/6 · zone closes in` : g.ph === "shrink" ? `Stage ${g.st + 1}/6 · gas advancing` : "Final zone";
    $("gasV").textContent = g.ph === "done" ? "—" : fmtTime(g.t);
    $("gasBar").style.width = (g.ph === "done" ? 100 : (1 - g.t / g.dur) * 100) + "%";
  } else $("gasbox").classList.add("hidden");
  if (!me) return;
  // vitals
  const pls = document.querySelectorAll("#vitals .plates b"); pls.forEach((b, i) => { b.style.width = (me.pl[i] / PLATE_HP * 100) + "%"; });
  const hpb = document.querySelector("#vitals .hp b"), hpe = document.querySelector("#vitals .hp em"); hpb.style.width = Math.max(0, me.hp) + "%"; hpe.style.width = Math.max(0, me.hp) + "%"; $("hpN").textContent = Math.max(0, Math.ceil(me.hp));
  const inv = me.inv; $("iPlate").textContent = inv.plate; $("iBand").textContent = inv.bandage; $("iMed").textContent = inv.medkit; $("iFrag").textContent = inv.frag; $("iSmoke").textContent = inv.smoke;
  // weapon
  const w = curWeapon(me);
  if (w) { const Wd = WEAPONS[w.id], R = RARITY[w.r]; $("wName").textContent = Wd.name; $("wRar").textContent = R.name + " · " + Wd.cls; $("wRar").style.color = R.col; const res = M.infAmmo ? "∞" : inv.ammo[Wd.ammo]; $("wAmmo").innerHTML = `${w.mag}<small>/ ${res}</small>`; $("wAmmo").classList.toggle("low", w.mag <= Math.ceil(Wd.mag * 0.25)); }
  else { $("wName").textContent = inv.slot === 2 ? "Combat knife" : "Unarmed"; $("wRar").textContent = inv.slot === 2 ? "Melee" : "Find a weapon"; $("wRar").style.color = "#a9a58f"; $("wAmmo").innerHTML = "–"; $("wAmmo").classList.remove("low"); }
  $("wSlots").innerHTML = [0, 1, 2].map((s) => { const ww = s < 2 ? inv.w[s] : null; const nm = s === 2 ? "Knife" : ww ? WEAPONS[ww.id].name : "Empty"; return `<div class="${inv.slot === s ? "on" : ""}" style="${ww ? "border-top:2px solid " + RARITY[ww.r].col : ""}">${s + 1} ${nm}</div>`; }).join("");
  // crosshair spread
  const ground = me.st === "ground" && me.hp > 0;
  const showCross = ground && !view.scoped && !(view.fp && me.adsT > 0.6);
  $("cross").style.display = showCross ? "" : "none";
  if (showCross) {
    const sp = w ? currentSpread(me) : 1.5; const px = Math.tan(sp * Math.PI / 180) / Math.tan(cam.fov * Math.PI / 360) * Hh / 2;
    const gap = clamp(px, 3, 120);
    const cr = $("cross"); cr.querySelector(".t").style.top = (-gap - 9) + "px"; cr.querySelector(".b").style.top = gap + "px"; cr.querySelector(".l").style.left = (-gap - 9) + "px"; cr.querySelector(".r").style.left = gap + "px";
    cr.style.opacity = me.adsT > 0.5 ? 0.55 : 1;
  }
  $("scope").classList.toggle("hidden", !view.scoped);
  // prompt
  const b = ground ? bestInteract(M, me) : null, pr = $("prompt");
  if (b) {
    let t;
    if (b.crate) t = `<kbd>E</kbd> Open supply crate`;
    else { const it = b.item; if (it.k === "weapon") { const R = RARITY[it.r || 0]; t = `<kbd>E</kbd> ${WEAPONS[it.w].name} <span class="r" style="color:${R.col}">${R.name}</span>`; } else if (it.k === "ammo") t = `${AMMO[it.a].name} ×${it.n}`; else t = `${ITEMS[it.k].name}${it.n > 1 ? " ×" + it.n : ""}`; }
    pr.innerHTML = t; pr.classList.remove("hidden");
  } else pr.classList.add("hidden");
  // action bar
  const ab = $("actbar");
  if (me.act) { ab.classList.remove("hidden"); $("actName").textContent = { reload: "Reloading", plate: "Armour plate", bandage: "Bandaging", medkit: "Med kit" }[me.act.k]; $("actFill").style.width = (me.act.t / me.act.dur * 100) + "%"; } else ab.classList.add("hidden");
  // air
  const air = $("air");
  if (me.st === "plane" || me.st === "fall" || me.st === "chute") {
    air.classList.remove("hidden");
    const alt = Math.max(0, Math.round(me.y - Math.max(0, terrainH(H.W, me.x, me.z))));
    $("airAlt").textContent = me.st === "plane" ? "TRANSPORT" : alt + " m";
    $("airHint").innerHTML = me.st === "plane" ? (M.plane.s > 140 ? "<kbd>Space</kbd> Jump · <kbd>M</kbd> map" : "Ramp opening…") : me.st === "fall" ? `<kbd>W</kbd> dive · <kbd>Shift</kbd> full dive · <kbd>Space</kbd> parachute · ${Math.round(Math.hypot(me.vx, me.vy, me.vz) * 3.6)} km/h` : "<kbd>W</kbd>/<kbd>S</kbd> glide · <kbd>Space</kbd> cut chute";
  } else air.classList.add("hidden");
  // compass
  const deg = ((-yawDeg(view.yaw)) % 360 + 360) % 360;
  $("compassStrip").style.transform = `translateX(${-((deg + 360) * 4) + $("compass").clientWidth / 2}px)`;
  $("compassDeg").textContent = Math.round(deg);
  let mk = ""; for (const p of H.pings) { const a = (Math.atan2(p.x - me.x, -(p.z - me.z)) * 180 / Math.PI + 360) % 360; for (const off of [0, 360, -360]) mk += `<b class="mk" style="left:${(a + off + 360) * 4}px;background:#ffd166"></b>`; }
  if (g) { const a = (Math.atan2(g.nx - me.x, -(g.nz - me.z)) * 180 / Math.PI + 360) % 360; for (const off of [0, 360, -360]) mk += `<b class="mk" style="left:${(a + off + 360) * 4}px;background:#fff"></b>`; }
  const cm = $("compassMarks"); if (cm) cm.innerHTML = mk;
}
const yawDeg = (y) => y * 180 / Math.PI;
export function fillInventory(me) {
  const inv = me.inv; const cells = [];
  for (let s = 0; s < 2; s++) { const w = inv.w[s]; cells.push(w ? `<div class="cell" style="border-left-color:${RARITY[w.r].col}">Slot ${s + 1} · <span style="color:${RARITY[w.r].col}">${RARITY[w.r].name}</span><b>${WEAPONS[w.id].name}</b>${WEAPONS[w.id].cls} · ${w.mag}/${WEAPONS[w.id].mag} · ${AMMO[WEAPONS[w.id].ammo].name}</div>` : `<div class="cell">Slot ${s + 1}<b>Empty</b>&nbsp;</div>`); }
  for (const a in AMMO) cells.push(`<div class="cell" style="border-left-color:${AMMO[a].col}">${AMMO[a].name}<b>${inv.ammo[a]} / ${AMMO[a].max}</b></div>`);
  cells.push(`<div class="cell" style="border-left-color:#7fd0ff">Armour plates (carried)<b>${inv.plate} / 5</b>Equipped: ${me.pl.filter((v) => v > 0).length} / 3</div>`);
  cells.push(`<div class="cell" style="border-left-color:#ff6b6b">Medical<b>${inv.bandage} bandage · ${inv.medkit} med kit</b></div>`);
  cells.push(`<div class="cell" style="border-left-color:#a4b06a">Throwables<b>${inv.frag} frag · ${inv.smoke} smoke</b></div>`);
  if (inv.pickle) cells.push(`<div class="cell" style="border-left-color:#ffd166">Golden pickle<b>${inv.pickle}</b>Someone at head office has a sense of humour.</div>`);
  $("invGrid").innerHTML = cells.join("");
}
