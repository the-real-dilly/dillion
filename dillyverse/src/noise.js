/* ==========================================================================
   DILLYVERSE — Seeded PRNG & 2D/3D Gradient Value Noise (FBM)
   Deterministic terrain, biome, cave, and ore noise from any world seed.
   ========================================================================== */

export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  const s = String(str ?? 'dillyverse');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class SeededNoise {
  constructor(seed) {
    this.seed = typeof seed === 'number' ? (seed >>> 0) : hashSeed(seed);
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = this.seed || 1337;
    for (let i = 255; i > 0; i--) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const j = s % (i + 1);
      const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  lerp(a, b, t) { return a + (b - a) * t; }

  grad2(h, x, y) {
    const g = h & 7;
    const u = g < 4 ? x : y;
    const v = g < 4 ? y : x;
    return ((g & 1) ? -u : u) + ((g & 2) ? -v : v);
  }

  noise2(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = this.fade(xf);
    const v = this.fade(yf);
    const p = this.perm;
    const aa = p[p[X] + Y];
    const ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y];
    const bb = p[p[X + 1] + Y + 1];
    const x1 = this.lerp(this.grad2(aa, xf, yf), this.grad2(ba, xf - 1, yf), u);
    const x2 = this.lerp(this.grad2(ab, xf, yf - 1), this.grad2(bb, xf - 1, yf - 1), u);
    return this.lerp(x1, x2, v);
  }

  fbm2(x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise2(x * freq, y * freq) * amp;
      norm += amp;
      freq *= lacunarity;
      amp *= gain;
    }
    return sum / norm;
  }

  grad3(h, x, y, z) {
    const g = h & 15;
    const u = g < 8 ? x : y;
    const v = g < 4 ? y : (g === 12 || g === 14 ? x : z);
    return ((g & 1) ? -u : u) + ((g & 2) ? -v : v);
  }

  noise3(x, y, z) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);
    const u = this.fade(xf), v = this.fade(yf), w = this.fade(zf);
    const p = this.perm;
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return this.lerp(
      this.lerp(
        this.lerp(this.grad3(p[AA], xf, yf, zf), this.grad3(p[BA], xf - 1, yf, zf), u),
        this.lerp(this.grad3(p[AB], xf, yf - 1, zf), this.grad3(p[BB], xf - 1, yf - 1, zf), u),
        v
      ),
      this.lerp(
        this.lerp(this.grad3(p[AA + 1], xf, yf, zf - 1), this.grad3(p[BA + 1], xf - 1, yf, zf - 1), u),
        this.lerp(this.grad3(p[AB + 1], xf, yf - 1, zf - 1), this.grad3(p[BB + 1], xf - 1, yf - 1, zf - 1), u),
        v
      ),
      w
    );
  }

  hashCoord(x, y, z) {
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ this.seed;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }
}
