//! Deterministic helpers ported 1:1 from last-zone/util.js (mulberry32 + seeded value noise).

/// JS-compatible helpers.
#[inline]
pub fn clamp(v: f64, a: f64, b: f64) -> f64 {
    if v < a {
        a
    } else if v > b {
        b
    } else {
        v
    }
}
#[inline]
pub fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}
#[inline]
pub fn smooth(e0: f64, e1: f64, x: f64) -> f64 {
    let t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}
#[inline]
pub fn wrap_a(a: f64) -> f64 {
    a.sin().atan2(a.cos())
}
/// JavaScript `Math.round` (halves round towards +infinity).
#[inline]
pub fn js_round(x: f64) -> f64 {
    (x + 0.5).floor()
}
/// JavaScript `Math.hypot` for two values.
#[inline]
pub fn hypot2(a: f64, b: f64) -> f64 {
    a.hypot(b)
}
#[inline]
pub fn hypot3(a: f64, b: f64, c: f64) -> f64 {
    (a * a + b * b + c * c).sqrt()
}

/// mulberry32, bit-exact with the JS version.
#[derive(Clone, Debug)]
pub struct Rng {
    a: u32,
}
impl Rng {
    pub fn new(seed: u32) -> Self {
        Rng { a: seed }
    }
    pub fn next(&mut self) -> f64 {
        self.a = self.a.wrapping_add(0x6D2B_79F5);
        let a = self.a;
        let mut t = (a ^ (a >> 15)).wrapping_mul(1 | a);
        t = t.wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t)) ^ t;
        ((t ^ (t >> 14)) as f64) / 4294967296.0
    }
    pub fn range(&mut self, lo: f64, hi: f64) -> f64 {
        lo + self.next() * (hi - lo)
    }
    pub fn int(&mut self, lo: i64, hi: i64) -> i64 {
        lo + (self.next() * ((hi - lo + 1) as f64)).floor() as i64
    }
    pub fn idx(&mut self, len: usize) -> usize {
        (self.next() * len as f64).floor() as usize
    }
    pub fn pick<T: Copy>(&mut self, arr: &[T]) -> T {
        arr[self.idx(arr.len())]
    }
    /// weighted pick over (value, weight) pairs, same walk as the JS version
    pub fn weighted<T: Copy>(&mut self, pairs: &[(T, f64)]) -> T {
        let s: f64 = pairs.iter().map(|p| p.1).sum();
        let mut r = self.next() * s;
        for p in pairs {
            r -= p.1;
            if r <= 0.0 {
                return p.0;
            }
        }
        pairs[pairs.len() - 1].0
    }
}

/// Seeded 2D value noise with fbm and ridged fbm (the permutation and lattice values use the same RNG stream as JS).
#[derive(Clone)]
pub struct Noise {
    p: [u8; 512],
    v: [f32; 256],
}
impl Noise {
    pub fn new(seed: u32) -> Self {
        let mut r = Rng::new(seed);
        let mut perm: Vec<u32> = (0..256).collect();
        for i in (1..256usize).rev() {
            let j = (r.next() * (i as f64 + 1.0)).floor() as usize;
            perm.swap(i, j);
        }
        let mut p = [0u8; 512];
        for i in 0..512 {
            p[i] = perm[i & 255] as u8;
        }
        let mut v = [0f32; 256];
        for x in v.iter_mut() {
            *x = r.next() as f32;
        }
        Noise { p, v }
    }
    pub fn vn(&self, x: f64, z: f64) -> f64 {
        let xi = x.floor();
        let zi = z.floor();
        let xf = x - xi;
        let zf = z - zi;
        let u = xf * xf * (3.0 - 2.0 * xf);
        let v = zf * zf * (3.0 - 2.0 * zf);
        let xx = (xi as i64 & 255) as usize;
        let zz = (zi as i64 & 255) as usize;
        let p = &self.p;
        let a = self.v[p[p[xx] as usize + zz] as usize] as f64;
        let b = self.v[p[p[xx + 1] as usize + zz] as usize] as f64;
        let c = self.v[p[p[xx] as usize + zz + 1] as usize] as f64;
        let d = self.v[p[p[xx + 1] as usize + zz + 1] as usize] as f64;
        a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
    }
    pub fn fbm(&self, x: f64, z: f64, oct: u32) -> f64 {
        let (mut s, mut amp, mut f, mut n) = (0.0, 0.5, 1.0, 0.0);
        for i in 0..oct {
            let fi = i as f64;
            s += self.vn(x * f + fi * 17.3, z * f - fi * 9.1) * amp;
            n += amp;
            amp *= 0.5;
            f *= 2.03;
        }
        s / n
    }
    pub fn ridge(&self, x: f64, z: f64, oct: u32) -> f64 {
        let (mut s, mut amp, mut f, mut n) = (0.0, 0.5, 1.0, 0.0);
        for i in 0..oct {
            let fi = i as f64;
            s += (1.0 - (self.vn(x * f + fi * 5.7, z * f + fi * 3.3) * 2.0 - 1.0).abs()) * amp;
            n += amp;
            amp *= 0.5;
            f *= 2.1;
        }
        s / n
    }
}

pub fn seg_dist(px: f64, pz: f64, ax: f64, az: f64, bx: f64, bz: f64) -> f64 {
    let dx = bx - ax;
    let dz = bz - az;
    let l2 = dx * dx + dz * dz;
    let mut t = if l2 > 0.0 { ((px - ax) * dx + (pz - az) * dz) / l2 } else { 0.0 };
    t = clamp(t, 0.0, 1.0);
    let x = ax + dx * t - px;
    let z = az + dz * t - pz;
    (x * x + z * z).sqrt()
}
