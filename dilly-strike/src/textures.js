/* ==========================================================================
   DILLY STRIKE — procedural PBR texture library (all generated on canvas, CC0)
   Every generator returns { map (sRGB), normalMap, roughnessMap } built from
   tileable value-noise: albedo, a height field turned into a tangent-space
   normal map, and roughness (G channel) + metalness (B channel) packed into
   one texture so it can serve as both roughnessMap and metalnessMap.
   ========================================================================== */
import * as THREE from 'three';

export const TEXQ = { size: 1024 };
let ANISO = 8;
export function setAniso(a) { ANISO = a; }

export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// tileable value noise
export class Noise {
  constructor(seed = 1) { const r = rng(seed); this.p = new Float32Array(256 * 256); for (let i = 0; i < this.p.length; i++) this.p[i] = r(); }
  v(x, y, per) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % per) + per) % per, y0 = ((yi % per) + per) % per, x1 = (x0 + 1) % per, y1 = (y0 + 1) % per, p = this.p;
    const a = p[(y0 & 255) * 256 + (x0 & 255)], b = p[(y0 & 255) * 256 + (x1 & 255)], c = p[(y1 & 255) * 256 + (x0 & 255)], d = p[(y1 & 255) * 256 + (x1 & 255)];
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  }
  // u,v in [0,1) texture space; base period in cells
  fbm(u, v, per, oct = 4, gain = 0.5) {
    let s = 0, a = 0.5, n = 0, f = per;
    for (let i = 0; i < oct; i++) { s += a * this.v(u * f, v * f, f); n += a; a *= gain; f *= 2; }
    return s / n;
  }
}

function mkCanvas(S) { const c = document.createElement('canvas'); c.width = c.height = S; return c; }
function tex(canvas, srgb, rep = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
  t.anisotropy = ANISO;
  if (srgb) t.encoding = THREE.sRGBEncoding;
  return t;
}
// build the three textures from float buffers: A (rgb 0..255), H (height 0..1), Ro (roughness 0..1), Me (metal 0..1 or null)
export function finish(S, A, H, Ro, Me, nStrength = 2.0) {
  const ca = mkCanvas(S), cn = mkCanvas(S), cr = mkCanvas(S);
  const ia = ca.getContext('2d').createImageData(S, S), inn = cn.getContext('2d').createImageData(S, S), ir = cr.getContext('2d').createImageData(S, S);
  const da = ia.data, dn = inn.data, dr = ir.data;
  for (let y = 0; y < S; y++) {
    const yU = ((y - 1 + S) % S) * S, yD = ((y + 1) % S) * S, yC = y * S;
    for (let x = 0; x < S; x++) {
      const i = yC + x, o = i * 4;
      da[o] = A[i * 3]; da[o + 1] = A[i * 3 + 1]; da[o + 2] = A[i * 3 + 2]; da[o + 3] = 255;
      const xL = (x - 1 + S) % S, xR = (x + 1) % S;
      const dx = (H[yC + xR] - H[yC + xL]) * nStrength, dy = (H[yD + x] - H[yU + x]) * nStrength;
      const nx = -dx, ny = dy, inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      dn[o] = (nx * inv * 0.5 + 0.5) * 255; dn[o + 1] = (ny * inv * 0.5 + 0.5) * 255; dn[o + 2] = (inv * 0.5 + 0.5) * 255; dn[o + 3] = 255;
      dr[o] = 255; dr[o + 1] = Ro[i] * 255; dr[o + 2] = Me ? Me[i] * 255 : 0; dr[o + 3] = 255;
    }
  }
  ca.getContext('2d').putImageData(ia, 0, 0); cn.getContext('2d').putImageData(inn, 0, 0); cr.getContext('2d').putImageData(ir, 0, 0);
  return { map: tex(ca, true), normalMap: tex(cn, false), roughnessMap: tex(cr, false), canvas: ca };
}
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
function buffers(S) { return { A: new Float32Array(S * S * 3), H: new Float32Array(S * S), Ro: new Float32Array(S * S), Me: null }; }
function hexRGB(h) { return [(h >> 16) & 255, (h >> 8) & 255, h & 255]; }

// random-walk crack lines carved into H/A
function cracks(S, A, H, r, n, depth = 0.25, dark = 0.55, len = 0.25) {
  for (let k = 0; k < n; k++) {
    let x = r() * S, y = r() * S, ang = r() * Math.PI * 2; const steps = Math.floor(S * len * (0.4 + r()));
    for (let s = 0; s < steps; s++) {
      ang += (r() - 0.5) * 0.7; x += Math.cos(ang); y += Math.sin(ang);
      const w = s < steps * 0.8 ? 1 : 0;
      for (let oy = -w; oy <= w; oy++) for (let ox = -w; ox <= w; ox++) {
        const xi = ((Math.floor(x) + ox) % S + S) % S, yi = ((Math.floor(y) + oy) % S + S) % S, i = yi * S + xi;
        const f = ox === 0 && oy === 0 ? 1 : 0.4;
        H[i] -= depth * f; A[i * 3] *= 1 - (1 - dark) * f; A[i * 3 + 1] *= 1 - (1 - dark) * f; A[i * 3 + 2] *= 1 - (1 - dark) * f;
      }
      if (r() < 0.01) { ang += (r() - 0.5) * 2; }
    }
  }
}

/* ---------- plaster over sandstone (stucco walls) ---------- */
export function plaster(seed = 3, base = 0xcdb38c, S = TEXQ.size) {
  const N = new Noise(seed), r = rng(seed + 9), { A, H, Ro } = buffers(S), [br, bg, bb] = hexRGB(base);
  const rows = 12, bh = 1 / rows; // exposed block courses (texture ~ 3 m => 25 cm courses)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x;
    const big = N.fbm(u, v, 3, 4), fine = N.fbm(u, v, 48, 3), grain = N.v(u * 400, v * 400, 400);
    const patch = N.fbm(u + 0.31, v + 0.17, 4, 5); // where plaster has fallen away
    const exposed = smooth(0.665, 0.68, patch), rim = smooth(0.645, 0.665, patch) * (1 - exposed);
    // block pattern
    const row = Math.floor(v * rows), off = (row % 2) * 0.5, bw = 1 / 6;
    const bu = (u * 6 + off) % 1, bv = (v * rows) % 1;
    const mortar = Math.min(smooth(0.0, 0.05, bu), smooth(1.0, 0.95, bu), smooth(0.0, 0.08, bv), smooth(1.0, 0.92, bv));
    const bid = Math.floor(u * 6 + off) * 7 + row * 13, btint = 0.86 + 0.14 * ((Math.sin(bid * 12.9898) * 43758.5453) % 1 + 1) % 1;
    // plaster colour
    let pr = br * (0.9 + 0.16 * big + 0.05 * fine) , pg = bg * (0.9 + 0.15 * big + 0.05 * fine), pb = bb * (0.88 + 0.16 * big + 0.05 * fine);
    const g = 0.96 + 0.06 * grain; pr *= g; pg *= g; pb *= g;
    // stone colour
    const sr = 184 * btint * (0.9 + 0.2 * fine), sg = 154 * btint * (0.9 + 0.2 * fine), sb = 114 * btint * (0.9 + 0.2 * fine);
    const mr = 150, mg = 128, mb = 98;
    const stoneR = sr * mortar + mr * (1 - mortar), stoneG = sg * mortar + mg * (1 - mortar), stoneB = sb * mortar + mb * (1 - mortar);
    A[i * 3] = pr * (1 - exposed) + stoneR * exposed - rim * 8;
    A[i * 3 + 1] = pg * (1 - exposed) + stoneG * exposed - rim * 8;
    A[i * 3 + 2] = pb * (1 - exposed) + stoneB * exposed - rim * 16;
    H[i] = (0.55 + 0.12 * fine + 0.05 * grain) * (1 - exposed) + (0.25 + 0.12 * mortar + 0.06 * fine) * exposed + rim * 0.06;
    Ro[i] = clamp01(0.88 + 0.08 * fine - 0.05 * exposed);
  }
  cracks(S, A, H, r, 7, 0.18, 0.6, 0.2);
  return finish(S, A, H, Ro, null, 3.2);
}

/* ---------- dressed sandstone blocks ---------- */
export function sandstone(seed = 5, base = 0xc29d6e, S = TEXQ.size) {
  const N = new Noise(seed), r = rng(seed + 3), { A, H, Ro } = buffers(S), [br, bg, bb] = hexRGB(base);
  const rows = 8; // 3 m tile -> 37 cm courses
  // per-row random block widths
  const rowsB = [];
  for (let k = 0; k < rows; k++) { const cuts = [0]; let p = r() * 0.2; while (p < 1) { cuts.push(p); p += 0.16 + r() * 0.18; } rowsB.push(cuts); }
  for (let y = 0; y < S; y++) {
    const v = y / S, row = Math.floor(v * rows), bv = (v * rows) % 1, cuts = rowsB[row];
    for (let x = 0; x < S; x++) {
      const u = x / S, i = y * S + x;
      let k = 0; for (let j = 0; j < cuts.length; j++) if (u >= cuts[j]) k = j;
      const a = cuts[k], b = k + 1 < cuts.length ? cuts[k + 1] : 1 + cuts[0] + (cuts[1] || 0) * 0;
      const bu = (u - a) / Math.max(1e-3, (b - a));
      const ed = Math.min(bu * (b - a) * 40, (1 - bu) * (b - a) * 40, bv * 6, (1 - bv) * 6);
      const mortar = smooth(0.12, 0.45, ed), bevel = smooth(0.2, 1.2, ed);
      const bid = row * 31 + k * 17, rr = ((Math.sin(bid * 78.233) * 43758.5453) % 1 + 1) % 1;
      const tint = 0.84 + 0.2 * rr;
      const fine = N.fbm(u, v, 32, 4), grain = N.v(u * 512, v * 512, 512), strata = N.v(u * 3, v * 90, 90);
      const pit = smooth(0.72, 0.8, N.v(u * 120, v * 120, 120));
      let cr = br * tint * (0.88 + 0.18 * fine + 0.06 * strata), cg = bg * tint * (0.88 + 0.17 * fine + 0.06 * strata), cb = bb * tint * (0.86 + 0.18 * fine + 0.05 * strata);
      const g = 0.95 + 0.08 * grain; cr *= g; cg *= g; cb *= g;
      const m = mortar;
      A[i * 3] = cr * m + 136 * (1 - m) - pit * 25; A[i * 3 + 1] = cg * m + 116 * (1 - m) - pit * 22; A[i * 3 + 2] = cb * m + 90 * (1 - m) - pit * 18;
      H[i] = 0.2 + 0.5 * bevel + 0.12 * fine + 0.04 * grain - pit * 0.08;
      Ro[i] = clamp01(0.82 + 0.1 * fine + (1 - m) * 0.06);
    }
  }
  cracks(S, A, H, r, 5, 0.15, 0.65, 0.12);
  return finish(S, A, H, Ro, null, 4.0);
}

/* ---------- paving flagstones with sand in the joints ---------- */
export function paving(seed = 11, S = TEXQ.size) {
  const N = new Noise(seed), r = rng(seed + 1), { A, H, Ro } = buffers(S);
  const rows = []; let v0 = 0;
  while (v0 < 0.999) { let h = 0.1 + r() * 0.08; if (v0 + h > 0.94) h = 1 - v0; const cuts = [0]; let p = r() * 0.1; while (p < 1) { cuts.push(p); p += 0.12 + r() * 0.16; } rows.push({ v0, h, cuts, shift: r() }); v0 += h; }
  for (let y = 0; y < S; y++) {
    const v = y / S; let row = rows[rows.length - 1], ri = rows.length - 1;
    for (let j = 0; j < rows.length; j++) if (v >= rows[j].v0 && v < rows[j].v0 + rows[j].h) { row = rows[j]; ri = j; break; }
    const bv = (v - row.v0) / row.h;
    for (let x = 0; x < S; x++) {
      const u = x / S, i = y * S + x, cuts = row.cuts;
      let k = 0; for (let j = 0; j < cuts.length; j++) if (u >= cuts[j]) k = j;
      const a = cuts[k], b = k + 1 < cuts.length ? cuts[k + 1] : 1;
      const bu = (u - a) / Math.max(1e-3, b - a);
      const ed = Math.min(bu * (b - a) * 60, (1 - bu) * (b - a) * 60, bv * row.h * 60, (1 - bv) * row.h * 60);
      const joint = 1 - smooth(0.05, 0.4, ed), wear = smooth(0.3, 2.6, ed);
      const id = ri * 37 + k * 11, rr = ((Math.sin(id * 12.9898) * 43758.5453) % 1 + 1) % 1, rr2 = ((Math.sin(id * 4.1414) * 23421.631) % 1 + 1) % 1;
      const fine = N.fbm(u, v, 24, 4), grain = N.v(u * 600, v * 600, 600), dirt = N.fbm(u + 0.5, v, 6, 4);
      const tint = 0.82 + 0.22 * rr;
      // stone: pale limestone/sandstone mix
      let cr = (206 - rr2 * 16) * tint, cg = (182 - rr2 * 18) * tint, cb = (140 - rr2 * 18) * tint;
      const f = (0.88 + 0.18 * fine) * (0.95 + 0.08 * grain); cr *= f; cg *= f; cb *= f;
      const dd = smooth(0.45, 0.75, dirt) * 0.18; cr *= 1 - dd; cg *= 1 - dd * 1.1; cb *= 1 - dd * 1.2;
      // sand in joints
      const sr = 178 + 20 * grain, sg = 150 + 18 * grain, sb = 108 + 14 * grain;
      A[i * 3] = cr * (1 - joint) + sr * joint; A[i * 3 + 1] = cg * (1 - joint) + sg * joint; A[i * 3 + 2] = cb * (1 - joint) + sb * joint;
      H[i] = 0.25 + 0.45 * wear + 0.1 * fine + 0.04 * grain - joint * 0.1;
      Ro[i] = clamp01(0.78 + 0.12 * fine + joint * 0.1 - (wear > 0.9 ? 0.05 : 0));
    }
  }
  cracks(S, A, H, r, 10, 0.22, 0.6, 0.12);
  return finish(S, A, H, Ro, null, 3.0);
}

/* ---------- wooden crate face (planks + frame + brace + nails) ---------- */
export function crateWood(seed = 21, base = 0xa07448, S = 512) {
  const N = new Noise(seed), r = rng(seed), { A, H, Ro } = buffers(S), [br, bg, bb] = hexRGB(base);
  const fr = 0.11, planks = 5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x;
    const inFrame = u < fr || u > 1 - fr || v < fr || v > 1 - fr;
    // diagonal brace (top-left to bottom-right)
    const dd = Math.abs((u - v)) / Math.SQRT2, brace = dd < 0.055 && !inFrame;
    let gu, gv, id, edge;
    if (inFrame) {
      const horiz = (v < fr || v > 1 - fr) && !(u < fr * 0.0);
      gu = horiz ? u : v; gv = horiz ? v : u; id = horiz ? (v < 0.5 ? 1 : 2) : (u < 0.5 ? 3 : 4);
      const ev = horiz ? (v < 0.5 ? v / fr : (1 - v) / fr) : (u < 0.5 ? u / fr : (1 - u) / fr);
      edge = Math.min(ev, 1 - ev) * 8;
    } else if (brace) { gu = (u + v) * 0.5; gv = dd * 9; id = 5; edge = (0.055 - dd) * 60; }
    else { const pv = (v - fr) / (1 - 2 * fr) * planks, pk = Math.floor(pv); gu = u; gv = pv; id = 10 + pk; edge = Math.min(pv - pk, 1 - (pv - pk)) * 10; }
    const rr = ((Math.sin(id * 91.17 + seed) * 43758.5453) % 1 + 1) % 1;
    const grain = N.v(gu * 6 + rr * 10, gv * 70 + rr * 5, 70), rings = 0.5 + 0.5 * Math.sin((gv * 40 + N.fbm(gu, gv * 0.2, 4, 3) * 18 + rr * 9) * 3.0);
    const knot = smooth(0.78, 0.86, N.v(gu * 9 + rr * 3, gv * 9, 9));
    const tint = (inFrame || brace ? 0.78 : 0.92) + 0.16 * rr;
    const w = (0.82 + 0.18 * grain) * (0.9 + 0.1 * rings) * (1 - knot * 0.35) * tint;
    const gap = smooth(0.0, 0.18, edge);
    A[i * 3] = br * w * (0.55 + 0.45 * gap); A[i * 3 + 1] = bg * w * (0.55 + 0.45 * gap); A[i * 3 + 2] = bb * w * (0.5 + 0.5 * gap);
    H[i] = (inFrame || brace ? 0.75 : 0.5) * gap + grain * 0.06 + rings * 0.02;
    Ro[i] = clamp01(0.72 + 0.12 * grain);
  }
  // nails on the frame
  const nails = [[fr / 2, fr / 2], [1 - fr / 2, fr / 2], [fr / 2, 1 - fr / 2], [1 - fr / 2, 1 - fr / 2], [0.5, fr / 2], [0.5, 1 - fr / 2], [fr / 2, 0.5], [1 - fr / 2, 0.5]];
  const Me = new Float32Array(S * S);
  for (const [nu, nv] of nails) for (const s of [-1, 1]) {
    const cx = (nu + s * 0.018) * S, cy = nv * S, R = S * 0.008;
    for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const d = Math.hypot(x - cx, y - cy) / R; if (d > 1) continue; const i = ((y + S) % S) * S + ((x + S) % S);
      A[i * 3] = 70; A[i * 3 + 1] = 66; A[i * 3 + 2] = 62; H[i] += 0.15 * (1 - d * d); Ro[i] = 0.5; Me[i] = 0.8;
    }
  }
  return finish(S, A, H, Ro, Me, 3.5);
}

/* ---------- weathered painted planks (doors, shutters) ---------- */
export function paintedPlanks(seed = 31, paint = 0x3d6b72, S = 512, vertical = true, planksN = 6) {
  const N = new Noise(seed), { A, H, Ro } = buffers(S), [pr, pg, pb] = hexRGB(paint);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u0 = x / S, v0 = y / S, i = y * S + x;
    const u = vertical ? u0 : v0, v = vertical ? v0 : u0;
    const pv = u * planksN, pk = Math.floor(pv), fu = pv - pk;
    const rr = ((Math.sin((pk + 1) * 51.3 + seed) * 43758.5453) % 1 + 1) % 1;
    const grain = N.v(fu * 4 + rr * 8, v * 60, 60), rings = 0.5 + 0.5 * Math.sin((v * 30 + N.fbm(fu * 0.3 + pk * 0.2, v, 4, 3) * 14) * 3.0);
    const edge = smooth(0, 0.06, Math.min(fu, 1 - fu));
    const peel = smooth(0.5, 0.56, N.fbm(u0 * 1.1, v0, 5, 5) + (1 - edge) * 0.25 + 0.1 * (1 - v0));
    const wr = 110 * (0.75 + 0.25 * grain) * (0.85 + 0.15 * rings), wg = wr * 0.74, wb = wr * 0.55;
    const fade = 0.85 + 0.2 * N.fbm(u0, v0, 8, 3);
    const cr = pr * fade * (0.92 + 0.08 * grain), cg = pg * fade * (0.92 + 0.08 * grain), cb = pb * fade * (0.92 + 0.08 * grain);
    A[i * 3] = (cr * (1 - peel) + wr * peel) * (0.45 + 0.55 * edge); A[i * 3 + 1] = (cg * (1 - peel) + wg * peel) * (0.45 + 0.55 * edge); A[i * 3 + 2] = (cb * (1 - peel) + wb * peel) * (0.45 + 0.55 * edge);
    H[i] = 0.5 * edge + (1 - peel) * 0.08 + grain * 0.05;
    Ro[i] = clamp01(0.62 + peel * 0.25 + grain * 0.08);
  }
  return finish(S, A, H, Ro, null, 3.0);
}

/* ---------- painted metal with chips + rust streaks (barrels, fittings) ---------- */
export function paintedMetal(seed = 41, paint = 0x2f5a7a, S = 512) {
  const N = new Noise(seed), { A, H, Ro } = buffers(S), Me = new Float32Array(S * S), [pr, pg, pb] = hexRGB(paint);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x;
    const chip = smooth(0.66, 0.68, N.fbm(u, v, 10, 5));
    const streak = smooth(0.45, 0.8, N.fbm(u, v * 0.12, 24, 3)) * (0.4 + 0.6 * v);
    const rust = smooth(0.55, 0.75, N.fbm(u + 0.3, v, 7, 5)) * 0.8 + streak * 0.5;
    const fine = N.fbm(u, v, 40, 3);
    let cr = pr * (0.9 + 0.15 * fine), cg = pg * (0.9 + 0.15 * fine), cb = pb * (0.9 + 0.15 * fine);
    const rr = 120 + 40 * fine, rg = 62 + 20 * fine, rb = 34 + 10 * fine;
    const rk = clamp01(rust) * 0.75;
    cr = cr * (1 - rk) + rr * rk; cg = cg * (1 - rk) + rg * rk; cb = cb * (1 - rk) + rb * rk;
    A[i * 3] = cr * (1 - chip) + 90 * chip; A[i * 3 + 1] = cg * (1 - chip) + 88 * chip; A[i * 3 + 2] = cb * (1 - chip) + 86 * chip;
    H[i] = 0.5 - chip * 0.12 + rk * 0.05 * fine;
    Ro[i] = clamp01(0.5 + rk * 0.4 - chip * 0.15 + fine * 0.08);
    Me[i] = chip * 0.85 + (1 - chip) * 0.15 * (1 - rk);
  }
  return finish(S, A, H, Ro, Me, 2.5);
}

/* ---------- woven fabrics (awnings, sandbags, sleeves) ---------- */
export function fabric(seed = 51, colA = 0xd8c9a8, colB = null, S = 512, stripes = 0, weave = 140) {
  const N = new Noise(seed), { A, H, Ro } = buffers(S), a = hexRGB(colA), b = colB != null ? hexRGB(colB) : a;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x;
    const wx = Math.sin(u * weave * Math.PI * 2), wy = Math.sin(v * weave * Math.PI * 2);
    const w = (wx * 0.5 + 0.5) * ((Math.floor(v * weave * 2) % 2) ? 1 : 0.6) * 0.5 + (wy * 0.5 + 0.5) * 0.5;
    const s = stripes ? (Math.floor(u * stripes) % 2) : 0;
    const c = s ? b : a, fade = 0.86 + 0.18 * N.fbm(u, v, 6, 4), dirt = smooth(0.55, 0.85, N.fbm(u + 0.2, v, 5, 4)) * 0.25;
    const f = fade * (0.88 + 0.12 * w) * (1 - dirt);
    A[i * 3] = c[0] * f; A[i * 3 + 1] = c[1] * f; A[i * 3 + 2] = c[2] * f * (1 - dirt * 0.3);
    H[i] = w * 0.35 + N.fbm(u, v, 4, 3) * 0.3;
    Ro[i] = clamp01(0.9 + 0.08 * w);
  }
  return finish(S, A, H, Ro, null, 2.0);
}

/* ---------- small helpers for decals ---------- */
export function canvasTex(S, draw, srgb = true, W = S) {
  const c = document.createElement('canvas'); c.width = W; c.height = S;
  draw(c.getContext('2d'), W, S);
  const t = new THREE.CanvasTexture(c); if (srgb) t.encoding = THREE.sRGBEncoding; t.anisotropy = ANISO;
  return t;
}

/* ---------- varnished wood grain (gun furniture) ---------- */
export function woodGrain(seed = 61, base = 0x7a4a2a, S = 256) {
  const N = new Noise(seed), { A, H, Ro } = buffers(S), [br, bg, bb] = hexRGB(base);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x;
    const warp = N.fbm(u, v, 3, 3) * 5;
    const ring = 0.5 + 0.5 * Math.sin((v * 22 + warp) * Math.PI * 2);
    const fib = N.v(u * 6, v * 120, 120);
    const k = (0.72 + 0.2 * ring + 0.12 * fib);
    A[i * 3] = br * k; A[i * 3 + 1] = bg * k; A[i * 3 + 2] = bb * k * 0.95;
    H[i] = ring * 0.08 + fib * 0.1; Ro[i] = clamp01(0.42 + 0.12 * fib + 0.08 * (1 - ring));
  }
  return finish(S, A, H, Ro, null, 1.5);
}
/* ---------- micro surface for gun parts: stippled polymer / brushed + scratched metal ---------- */
export function gunSurface(seed = 71, kind = 'metal', S = 256) {
  const N = new Noise(seed), r = rng(seed), { A, H, Ro } = buffers(S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x;
    const g = N.v(u * 256, v * 256, 256), brush = N.v(u * 4, v * 200, 200), blot = N.fbm(u, v, 6, 4);
    const k = kind === 'metal' ? 0.85 + 0.1 * brush + 0.08 * blot : 0.88 + 0.12 * g;
    A[i * 3] = A[i * 3 + 1] = A[i * 3 + 2] = 255 * k;
    H[i] = kind === 'metal' ? brush * 0.15 : g * 0.6;
    Ro[i] = kind === 'metal' ? clamp01(0.32 + 0.18 * blot + 0.06 * brush) : clamp01(0.5 + 0.15 * g + 0.1 * blot);
  }
  if (kind === 'metal') for (let k = 0; k < 90; k++) { // fine scratches: shinier, lighter
    let x = r() * S, y = r() * S; const a = r() * Math.PI, len = 8 + r() * 40;
    for (let s = 0; s < len; s++) { x += Math.cos(a); y += Math.sin(a); const i = ((y | 0) % S + S) % S * S + (((x | 0) % S + S) % S); Ro[i] = 0.2; A[i * 3] = A[i * 3 + 1] = A[i * 3 + 2] = 255; }
  }
  return finish(S, A, H, Ro, null, kind === 'metal' ? 1.0 : 2.5);
}
