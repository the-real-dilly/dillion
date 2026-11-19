// DILLION: LAST ZONE - shared pure helpers (no DOM, no THREE): safe to run on a future server.
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };

// mulberry32: deterministic per-match RNG
export function mulberry32(seed) {
  let a = seed >>> 0;
  const f = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  f.weighted = (pairs) => { let s = 0; for (const p of pairs) s += p[1]; let r = f() * s; for (const p of pairs) { r -= p[1]; if (r <= 0) return p[0]; } return pairs[pairs.length - 1][0]; };
  return f;
}

// seeded 2D value noise + fbm
export function makeNoise(seed) {
  const P = new Uint8Array(512); const r = mulberry32(seed);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  const V = new Float32Array(256); for (let i = 0; i < 256; i++) V[i] = r();
  const vn = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const X = xi & 255, Z = zi & 255;
    const a = V[P[P[X] + Z]], b = V[P[P[X + 1] + Z]], c = V[P[P[X] + Z + 1]], d = V[P[P[X + 1] + Z + 1]];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, z, oct = 4) => { let s = 0, amp = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += vn(x * f + i * 17.3, z * f - i * 9.1) * amp; n += amp; amp *= 0.5; f *= 2.03; } return s / n; };
  const ridge = (x, z, oct = 4) => { let s = 0, amp = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += (1 - Math.abs(vn(x * f + i * 5.7, z * f + i * 3.3) * 2 - 1)) * amp; n += amp; amp *= 0.5; f *= 2.1; } return s / n; };
  return { vn, fbm, ridge };
}

// segment distance (xz)
export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0; t = clamp(t, 0, 1);
  const x = ax + dx * t - px, z = az + dz * t - pz; return Math.sqrt(x * x + z * z);
}

export const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
