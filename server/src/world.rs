//! Island generation + geometry queries, ported from last-zone/world.js.
//! The client renders and predicts movement against the JS version, so this must match it:
//! see tests/golden.rs (values exported from JS by tools/export_golden.mjs).
use crate::rng::{clamp, hypot2, js_round, lerp, seg_dist, smooth, Noise, Rng};
use std::cell::Cell;
use std::collections::HashMap;

pub const HALF: f64 = 1000.0;
pub const CELL: f64 = 5.0;
pub const N: usize = 401;
pub const SEA: f64 = 0.0;
pub const MAP_SEED: u32 = 0x1a5d9e;
const GC: f64 = 16.0;

pub mod surf {
    pub const WATER: u8 = 0;
    pub const SAND: u8 = 1;
    pub const GRASS: u8 = 2;
    pub const ROCK: u8 = 3;
    pub const FARM: u8 = 4;
    pub const ROAD: u8 = 5;
    pub const CONCRETE: u8 = 6;
    pub const DIRT: u8 = 7;
    pub const WOOD: u8 = 8;
    pub const METAL: u8 = 9;
}
use surf::*;

#[derive(Clone, Copy, Debug)]
pub struct Poi {
    pub id: &'static str,
    pub name: &'static str,
    pub x: f64,
    pub z: f64,
    pub tier: u8,
    pub w: f64,
    pub r: f64,
}
pub const POIS: [Poi; 11] = [
    Poi { id: "lp", name: "Los Pepinos", x: 430.0, z: 400.0, tier: 3, w: 6.0, r: 190.0 },
    Poi { id: "compound", name: "The Compound", x: -40.0, z: 40.0, tier: 4, w: 3.0, r: 80.0 },
    Poi { id: "airfield", name: "Brinewater Airfield", x: -520.0, z: 120.0, tier: 2, w: 3.0, r: 200.0 },
    Poi { id: "port", name: "Port Caper", x: 610.0, z: -250.0, tier: 2, w: 3.0, r: 150.0 },
    Poi { id: "farm", name: "Dillfield Farms", x: -330.0, z: -430.0, tier: 1, w: 3.0, r: 170.0 },
    Poi { id: "quarry", name: "Vinegar Quarry", x: 120.0, z: -560.0, tier: 2, w: 2.0, r: 110.0 },
    Poi { id: "saltbrush", name: "Saltbrush", x: -430.0, z: 540.0, tier: 1, w: 2.0, r: 70.0 },
    Poi { id: "caraway", name: "Caraway", x: 240.0, z: -200.0, tier: 1, w: 2.0, r: 70.0 },
    Poi { id: "hollow", name: "Mill Hollow", x: -190.0, z: 360.0, tier: 1, w: 2.0, r: 70.0 },
    Poi { id: "relayN", name: "Relay North", x: -120.0, z: -300.0, tier: 2, w: 1.0, r: 30.0 },
    Poi { id: "relayE", name: "Relay East", x: 380.0, z: -470.0, tier: 2, w: 1.0, r: 30.0 },
];
pub fn poi(id: &str) -> Poi {
    *POIS.iter().find(|p| p.id == id).expect("poi")
}

const BLOBS: [[f64; 3]; 8] = [
    [0.0, 0.0, 640.0],
    [-480.0, 160.0, 380.0],
    [-330.0, -440.0, 360.0],
    [120.0, -520.0, 330.0],
    [420.0, -250.0, 290.0],
    [330.0, 320.0, 360.0],
    [-420.0, 520.0, 300.0],
    [430.0, 470.0, 220.0],
];

#[derive(Clone, Debug, Default)]
pub struct BoxC {
    pub x0: f64,
    pub x1: f64,
    pub y0: f64,
    pub y1: f64,
    pub z0: f64,
    pub z1: f64,
    pub s: u8,
    pub b: i32,
    pub tall: bool,
    pub floor: bool,
    pub roof: bool,
    pub noray: bool,
    pub prop: bool,
}
#[derive(Clone, Debug)]
pub struct Door {
    pub x: f64,
    pub z: f64,
    pub ox: f64,
    pub oz: f64,
    pub w: f64,
}
#[derive(Clone, Debug)]
pub struct Building {
    pub i: usize,
    pub kind: &'static str,
    pub x0: f64,
    pub x1: f64,
    pub z0: f64,
    pub z1: f64,
    pub y: f64,
    pub h: f64,
    pub enter: bool,
    pub tier: u8,
    pub poi: &'static str,
    pub doors: Vec<Door>,
    pub part_x: Option<f64>,
    pub part_z: Option<f64>,
}
#[derive(Clone, Debug)]
pub struct Road {
    pub pts: Vec<[f64; 3]>,
    pub w: f64,
    pub city: bool,
}
#[derive(Clone, Debug)]
pub struct Spawn {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub tier: u8,
}
#[derive(Clone, Debug)]
pub struct Prop {
    pub kind: &'static str,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Clone)]
pub struct World {
    pub seed: u32,
    pub h: Vec<f32>,
    pub s: Vec<u8>,
    pub boxes: Vec<BoxC>,
    grid: HashMap<(i32, i32), Vec<u32>>,
    pub buildings: Vec<Building>,
    pub roads: Vec<Road>,
    road_hash: HashMap<(i32, i32), Vec<(usize, usize)>>,
    pub loot: Vec<Spawn>,
    pub crates: Vec<Spawn>,
    pub props: Vec<Prop>,
    pub fields: Vec<[f64; 4]>,
    pub trees: usize,
    pub palms: Vec<[f64; 2]>,
    pub rocks: usize,
    pub fences: usize,
    pub lp_streets: ([f64; 5], [f64; 5]),
    pub range: (f64, f64),
    stamp: Cell<u32>,
    box_st: Vec<Cell<u32>>,
}

/// opening in a wall (u along the wall from its start)
#[derive(Clone, Copy, Debug)]
struct Op {
    u: f64,
    w: f64,
    y0: f64,
    y1: f64,
}
#[derive(Clone, Copy)]
struct DoorSpec {
    side: char,
    u: f64,
    w: f64,
    h: Option<f64>,
}
const fn ds(side: char, u: f64, w: f64) -> DoorSpec {
    DoorSpec { side, u, w, h: None }
}
const fn dsh(side: char, u: f64, w: f64, h: f64) -> DoorSpec {
    DoorSpec { side, u, w, h: Some(h) }
}
struct HouseOpts {
    y: Option<f64>,
    h: f64,
    th: f64,
    s: u8,
    doors: Vec<DoorSpec>,
    windows: bool,
    part: bool,
    loot: Option<usize>,
    tier: u8,
    poi: &'static str,
    kind: &'static str,
    furnish: bool,
    furn: Option<&'static [&'static str]>,
}
impl Default for HouseOpts {
    fn default() -> Self {
        HouseOpts { y: None, h: 3.2, th: 0.25, s: CONCRETE, doors: vec![ds('s', 0.5, 1.4)], windows: true, part: true, loot: None, tier: 1, poi: "", kind: "house", furnish: true, furn: None }
    }
}
const DEFAULT_FURN: &[&str] = &["table", "shelf", "bed", "sofa", "fridge", "counter", "tv", "lamp", "bookcase", "crates", "rug"];

// ---------------------------------------------------------------------------------------------
// heightfield sampling (triangle-exact)
pub fn sample_grid(h: &[f32], x: f64, z: f64) -> f64 {
    let mut fx = (x + HALF) / CELL;
    let mut fz = (z + HALF) / CELL;
    if fx < 0.0 || fz < 0.0 || fx >= (N - 1) as f64 || fz >= (N - 1) as f64 {
        return -30.0;
    }
    let i = fx.floor();
    let j = fz.floor();
    fx -= i;
    fz -= j;
    let k = j as usize * N + i as usize;
    let (h00, h10, h01, h11) = (h[k] as f64, h[k + 1] as f64, h[k + N] as f64, h[k + N + 1] as f64);
    if fx > fz {
        h00 + (h10 - h00) * fx + (h11 - h10) * fz
    } else {
        h00 + (h11 - h01) * fx + (h01 - h00) * fz
    }
}
fn slope_at(h: &[f32], i: usize, j: usize) -> f64 {
    let a = h[j * N + i.saturating_sub(1)] as f64;
    let b = h[j * N + (i + 1).min(N - 1)] as f64;
    let c = h[j.saturating_sub(1) * N + i] as f64;
    let d = h[(j + 1).min(N - 1) * N + i] as f64;
    hypot2(b - a, d - c) / (2.0 * CELL)
}
fn catmull(pts: &[[f64; 2]], step: f64) -> Vec<[f64; 2]> {
    let mut out = vec![];
    let n = pts.len();
    for i in 0..n - 1 {
        let p0 = pts[i.saturating_sub(1)];
        let p1 = pts[i];
        let p2 = pts[i + 1];
        let p3 = pts[(i + 2).min(n - 1)];
        let len = hypot2(p2[0] - p1[0], p2[1] - p1[1]);
        let cnt = ((len / step).ceil() as usize).max(2);
        for k in 0..cnt {
            let t = k as f64 / cnt as f64;
            let t2 = t * t;
            let t3 = t2 * t;
            let f = |a: f64, b: f64, c: f64, d: f64| 0.5 * (2.0 * b + (-a + c) * t + (2.0 * a - 5.0 * b + 4.0 * c - d) * t2 + (-a + 3.0 * b - 3.0 * c + d) * t3);
            out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
        }
    }
    out.push(pts[n - 1]);
    out
}

pub struct RoadHit {
    pub d: f64,
    pub h: f64,
}

impl World {
    pub fn terrain_h(&self, x: f64, z: f64) -> f64 {
        sample_grid(&self.h, x, z)
    }
    pub fn surface_at(&self, x: f64, z: f64) -> u8 {
        let i = js_round((x + HALF) / CELL);
        let j = js_round((z + HALF) / CELL);
        if i < 0.0 || j < 0.0 || i >= N as f64 || j >= N as f64 {
            return WATER;
        }
        self.s[j as usize * N + i as usize]
    }
    pub fn road_query(&self, x: f64, z: f64, max_d: f64) -> Option<RoadHit> {
        let mut best: Option<RoadHit> = None;
        let cx = (x / 32.0).floor() as i32;
        let cz = (z / 32.0).floor() as i32;
        for dz in -1..=1 {
            for dx in -1..=1 {
                if let Some(l) = self.road_hash.get(&(cx + dx, cz + dz)) {
                    for &(ri, i) in l {
                        let rd = &self.roads[ri];
                        let a = rd.pts[i];
                        let b = rd.pts[i + 1];
                        let d = seg_dist(x, z, a[0], a[2], b[0], b[2]);
                        if d < max_d && best.as_ref().map_or(true, |bb| d < bb.d) {
                            let ex = b[0] - a[0];
                            let ez = b[2] - a[2];
                            let l2 = ex * ex + ez * ez;
                            let t = if l2 != 0.0 { clamp(((x - a[0]) * ex + (z - a[2]) * ez) / l2, 0.0, 1.0) } else { 0.0 };
                            best = Some(RoadHit { d, h: lerp(a[1], b[1], t) });
                        }
                    }
                }
            }
        }
        best
    }
    fn add_box(&mut self, x0: f64, x1: f64, y0: f64, y1: f64, z0: f64, z1: f64, s: u8, b: i32) -> usize {
        let bx = BoxC { x0: x0.min(x1), x1: x0.max(x1), y0, y1, z0: z0.min(z1), z1: z0.max(z1), s, b, tall: y1 - y0 > 7.5, ..Default::default() };
        let id = self.boxes.len();
        for i in (bx.x0 / GC).floor() as i32..=(bx.x1 / GC).floor() as i32 {
            for j in (bx.z0 / GC).floor() as i32..=(bx.z1 / GC).floor() as i32 {
                self.grid.entry((i, j)).or_default().push(id as u32);
            }
        }
        self.boxes.push(bx);
        self.box_st.push(Cell::new(0));
        id
    }
    fn next_stamp(&self) -> u32 {
        let s = self.stamp.get().wrapping_add(1);
        self.stamp.set(s);
        s
    }
    /// boxes overlapping a square of half-size rad around (x,z), in the same order as JS
    pub fn boxes_near(&self, x: f64, z: f64, rad: f64, out: &mut Vec<u32>) {
        out.clear();
        let st = self.next_stamp();
        for i in ((x - rad) / GC).floor() as i32..=((x + rad) / GC).floor() as i32 {
            for j in ((z - rad) / GC).floor() as i32..=((z + rad) / GC).floor() as i32 {
                if let Some(l) = self.grid.get(&(i, j)) {
                    for &id in l {
                        let c = &self.box_st[id as usize];
                        if c.get() == st {
                            continue;
                        }
                        c.set(st);
                        let b = &self.boxes[id as usize];
                        if x + rad > b.x0 && x - rad < b.x1 && z + rad > b.z0 && z - rad < b.z1 {
                            out.push(id);
                        }
                    }
                }
            }
        }
    }
    pub fn ground_at(&self, x: f64, z: f64, y: f64, step: f64, rad: f64, skip_tall: bool) -> f64 {
        let mut g = self.terrain_h(x, z);
        let mut near = Vec::with_capacity(16);
        self.boxes_near(x, z, rad, &mut near);
        for &id in &near {
            let b = &self.boxes[id as usize];
            if b.y1 <= y + step && b.y1 > g && !(skip_tall && b.tall) {
                g = b.y1;
            }
        }
        g
    }
    pub fn ground(&self, x: f64, z: f64, y: f64) -> f64 {
        self.ground_at(x, z, y, 0.55, 0.0, false)
    }
    /// push a vertical cylinder out of boxes (returns true if it touched any)
    pub fn collide_cyl(&self, px: &mut f64, pz: &mut f64, py: f64, rad: f64, h: f64, step: f64) -> bool {
        let mut hit = false;
        let mut near = Vec::with_capacity(16);
        self.boxes_near(*px, *pz, rad + 0.1, &mut near);
        for &id in &near {
            let b = &self.boxes[id as usize];
            if b.y1 <= py + step || b.y0 >= py + h {
                continue;
            }
            let cx = clamp(*px, b.x0, b.x1);
            let cz = clamp(*pz, b.z0, b.z1);
            let dx = *px - cx;
            let dz = *pz - cz;
            let d2 = dx * dx + dz * dz;
            if d2 >= rad * rad {
                continue;
            }
            hit = true;
            if d2 > 1e-8 {
                let d = d2.sqrt();
                let push = rad - d;
                *px += dx / d * push;
                *pz += dz / d * push;
            } else {
                let l = *px - b.x0;
                let rr = b.x1 - *px;
                let t = *pz - b.z0;
                let bb = b.z1 - *pz;
                let m = l.min(rr).min(t).min(bb);
                if m == l {
                    *px = b.x0 - rad;
                } else if m == rr {
                    *px = b.x1 + rad;
                } else if m == t {
                    *pz = b.z0 - rad;
                } else {
                    *pz = b.z1 + rad;
                }
            }
        }
        hit
    }
    pub fn ceiling_at(&self, x: f64, z: f64, y: f64, rad: f64) -> f64 {
        let mut c = 1e9;
        let mut near = Vec::with_capacity(16);
        self.boxes_near(x, z, rad, &mut near);
        for &id in &near {
            let b = &self.boxes[id as usize];
            if b.y0 >= y - 0.05 && b.y0 < c && x > b.x0 - rad && x < b.x1 + rad && z > b.z0 - rad && z < b.z1 + rad {
                c = b.y0;
            }
        }
        c
    }
    /// ray vs boxes (grid DDA) + terrain/water march; same algorithm as JS
    pub fn raycast(&self, ox: f64, oy: f64, oz: f64, dx: f64, dy: f64, dz: f64, max_d: f64) -> Option<Hit> {
        let mut best = max_d;
        let mut bn: Option<[f64; 3]> = None;
        let mut bs = 0u8;
        let st = self.next_stamp();
        let mut i = (ox / GC).floor() as i32;
        let mut j = (oz / GC).floor() as i32;
        let si = if dx > 0.0 { 1 } else { -1 };
        let sj = if dz > 0.0 { 1 } else { -1 };
        let tdx = if dx.abs() > 1e-9 { GC / dx.abs() } else { 1e9 };
        let tdz = if dz.abs() > 1e-9 { GC / dz.abs() } else { 1e9 };
        let mut tmx = if dx.abs() > 1e-9 { (if dx > 0.0 { (i as f64 + 1.0) * GC - ox } else { ox - i as f64 * GC }) / dx.abs() } else { 1e9 };
        let mut tmz = if dz.abs() > 1e-9 { (if dz > 0.0 { (j as f64 + 1.0) * GC - oz } else { oz - j as f64 * GC }) / dz.abs() } else { 1e9 };
        let mut tc = 0.0;
        let mut it = 0;
        while it < 400 && tc <= best {
            if let Some(l) = self.grid.get(&(i, j)) {
                for &id in l {
                    let c = &self.box_st[id as usize];
                    if c.get() == st {
                        continue;
                    }
                    c.set(st);
                    let b = &self.boxes[id as usize];
                    if b.noray {
                        continue;
                    }
                    if let Some((t, n)) = ray_box(ox, oy, oz, dx, dy, dz, b, best) {
                        best = t;
                        bn = Some(n);
                        bs = b.s;
                    }
                }
            }
            if tmx < tmz {
                tc = tmx;
                tmx += tdx;
                i += si;
            } else {
                tc = tmz;
                tmz += tdz;
                j += sj;
            }
            it += 1;
        }
        let mut t = 0.0;
        let mut prev = 0.0;
        let lim = best.min(max_d);
        let above = oy - self.terrain_h(ox, oz);
        if above >= 0.0 {
            while t < lim {
                let x = ox + dx * t;
                let y = oy + dy * t;
                let z = oz + dz * t;
                let h = self.terrain_h(x, z);
                let g = y - h.max(SEA);
                if g < 0.0 {
                    let mut lo = prev;
                    let mut hi = t;
                    for _ in 0..12 {
                        let m = (lo + hi) / 2.0;
                        let yy = oy + dy * m;
                        let hh = self.terrain_h(ox + dx * m, oz + dz * m);
                        if yy < hh.max(SEA) {
                            hi = m;
                        } else {
                            lo = m;
                        }
                    }
                    let hx = ox + dx * hi;
                    let hz = oz + dz * hi;
                    let hh = self.terrain_h(hx, hz);
                    if hi < best {
                        best = hi;
                        if hh < SEA && oy + dy * hi <= SEA + 0.05 {
                            bn = Some([0.0, 1.0, 0.0]);
                            bs = WATER;
                        } else {
                            let e = 1.5;
                            let gx = self.terrain_h(hx + e, hz) - self.terrain_h(hx - e, hz);
                            let gz = self.terrain_h(hx, hz + e) - self.terrain_h(hx, hz - e);
                            let l = crate::rng::hypot3(gx, 2.0 * e, gz);
                            bn = Some([-gx / l, 2.0 * e / l, -gz / l]);
                            bs = self.surface_at(hx, hz);
                        }
                    }
                    break;
                }
                prev = t;
                t += clamp(g * 0.6, 0.4, 6.0);
            }
        }
        let n = bn?;
        Some(Hit { t: best, x: ox + dx * best, y: oy + dy * best, z: oz + dz * best, nx: n[0], ny: n[1], nz: n[2], s: bs })
    }
    pub fn los_clear(&self, ax: f64, ay: f64, az: f64, bx: f64, by: f64, bz: f64) -> bool {
        let dx = bx - ax;
        let dy = by - ay;
        let dz = bz - az;
        let d = crate::rng::hypot3(dx, dy, dz);
        if d < 0.01 {
            return true;
        }
        self.raycast(ax, ay, az, dx / d, dy / d, dz / d, d - 0.2).is_none()
    }
    pub fn building_at(&self, x: f64, z: f64) -> Option<usize> {
        self.buildings.iter().position(|b| b.enter && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1)
    }
    fn paint(&mut self, x0: f64, x1: f64, z0: f64, z1: f64, s: u8) {
        let j0 = ((z0 + HALF) / CELL).floor().max(0.0) as i64;
        let j1 = ((z1 + HALF) / CELL).ceil().min((N - 1) as f64) as i64;
        let i0 = ((x0 + HALF) / CELL).floor().max(0.0) as i64;
        let i1 = ((x1 + HALF) / CELL).ceil().min((N - 1) as f64) as i64;
        for j in j0..=j1 {
            for i in i0..=i1 {
                let k = j as usize * N + i as usize;
                if self.s[k] != WATER {
                    self.s[k] = s;
                }
            }
        }
    }
    fn overlaps_building(&self, x: f64, z: f64, m: f64) -> bool {
        self.buildings.iter().any(|b| x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m)
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Hit {
    pub t: f64,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub nx: f64,
    pub ny: f64,
    pub nz: f64,
    pub s: u8,
}
fn sign(v: f64) -> f64 {
    if v > 0.0 {
        1.0
    } else if v < 0.0 {
        -1.0
    } else {
        0.0
    }
}
fn ray_box(ox: f64, oy: f64, oz: f64, dx: f64, dy: f64, dz: f64, b: &BoxC, max_t: f64) -> Option<(f64, [f64; 3])> {
    let mut t0 = 0.0;
    let mut t1 = max_t;
    let mut ax = -1;
    let mut sl = |o: f64, d: f64, lo: f64, hi: f64, axis: i32, t0: &mut f64, t1: &mut f64| -> bool {
        if d.abs() < 1e-12 {
            return o >= lo && o <= hi;
        }
        let mut a = (lo - o) / d;
        let mut c = (hi - o) / d;
        if a > c {
            std::mem::swap(&mut a, &mut c);
        }
        if a > *t0 {
            *t0 = a;
            ax = axis;
        }
        if c < *t1 {
            *t1 = c;
        }
        *t0 <= *t1
    };
    if !sl(ox, dx, b.x0, b.x1, 0, &mut t0, &mut t1) || !sl(oy, dy, b.y0, b.y1, 1, &mut t0, &mut t1) || !sl(oz, dz, b.z0, b.z1, 2, &mut t0, &mut t1) {
        return None;
    }
    if t0 <= 0.0 || t0 >= max_t {
        return None;
    }
    let n = match ax {
        0 => [-sign(dx), 0.0, 0.0],
        1 => [0.0, -sign(dy), 0.0],
        _ => [0.0, 0.0, -sign(dz)],
    };
    Some((t0, n))
}

// ---------------------------------------------------------------------------------------------
// building kit
struct Builder {
    r: Rng,
    dr: Rng,
}
impl Builder {
    fn wall(&mut self, w: &mut World, bi: i32, x0: f64, z0: f64, x1: f64, z1: f64, y: f64, h: f64, th: f64, s: u8, openings: &[Op]) {
        let along_x = (x1 - x0).abs() > (z1 - z0).abs();
        let len = if along_x { (x1 - x0).abs() } else { (z1 - z0).abs() };
        let sx = { let v = sign(x1 - x0); if v == 0.0 { 1.0 } else { v } };
        let sz = { let v = sign(z1 - z0); if v == 0.0 { 1.0 } else { v } };
        let seg = |w: &mut World, u0: f64, u1: f64, yy0: f64, yy1: f64| {
            if u1 - u0 < 0.02 || yy1 - yy0 < 0.02 {
                return;
            }
            if along_x {
                w.add_box(x0 + sx * u0, x0 + sx * u1, yy0, yy1, z0 - th / 2.0, z0 + th / 2.0, s, bi);
            } else {
                w.add_box(x0 - th / 2.0, x0 + th / 2.0, yy0, yy1, z0 + sz * u0, z0 + sz * u1, s, bi);
            }
        };
        let mut ops = openings.to_vec();
        ops.sort_by(|a, b| a.u.partial_cmp(&b.u).unwrap());
        let mut u = 0.0;
        for o in &ops {
            let a = clamp(o.u - o.w / 2.0, 0.0, len);
            let b2 = clamp(o.u + o.w / 2.0, 0.0, len);
            seg(w, u, a, y, y + h);
            seg(w, a, b2, y, y + o.y0);
            seg(w, a, b2, y + o.y1, y + h);
            u = b2;
        }
        seg(w, u, len, y, y + h);
    }
    fn house(&mut self, w: &mut World, cx: f64, cz: f64, wd: f64, d: f64, o: HouseOpts) -> usize {
        let (x0, x1, z0, z1) = (cx - wd / 2.0, cx + wd / 2.0, cz - d / 2.0, cz + d / 2.0);
        let y = match o.y {
            Some(y) => y,
            None => w.terrain_h(cx, cz).max(w.terrain_h(x0, z0)).max(w.terrain_h(x1, z1)).max(w.terrain_h(x0, z1)).max(w.terrain_h(x1, z0)).max(0.5) + 0.12,
        };
        let (h, th, s) = (o.h, o.th, o.s);
        let bi = w.buildings.len();
        w.buildings.push(Building { i: bi, kind: o.kind, x0, x1, z0, z1, y, h, enter: true, tier: o.tier, poi: o.poi, doors: vec![], part_x: None, part_z: None });
        let fb = w.add_box(x0, x1, y - 3.0, y, z0, z1, if s == WOOD { WOOD } else { CONCRETE }, bi as i32);
        w.boxes[fb].floor = true;
        let rb = w.add_box(x0 - 0.2, x1 + 0.2, y + h, y + h + 0.25, z0 - 0.2, z1 + 0.2, s, bi as i32);
        w.boxes[rb].roof = true;
        for k in ['n', 's', 'e', 'w'] {
            let (ax, az, bx, bz) = match k {
                'n' => (x0, z0, x1, z0),
                's' => (x0, z1, x1, z1),
                'w' => (x0, z0, x0, z1),
                _ => (x1, z0, x1, z1),
            };
            let len = (bx - ax).abs() + (bz - az).abs();
            let mut ops: Vec<Op> = vec![];
            for dd in o.doors.iter().filter(|q| q.side == k) {
                let u = dd.u * len;
                let dh = dd.h.unwrap_or(2.3);
                ops.push(Op { u, w: dd.w, y0: 0.0, y1: dh });
                let ox = if k == 'e' { 1.0 } else if k == 'w' { -1.0 } else { 0.0 };
                let oz = if k == 's' { 1.0 } else if k == 'n' { -1.0 } else { 0.0 };
                let px = if k == 'n' || k == 's' { ax + u } else { ax };
                let pz = if k == 'w' || k == 'e' { az + u } else { az };
                w.buildings[bi].doors.push(Door { x: px, z: pz, ox, oz, w: dd.w });
            }
            if o.windows && len > 5.0 {
                let nw = (len / 4.0).floor() as usize;
                for q in 0..nw {
                    let u = (q as f64 + 0.5) * len / nw as f64;
                    if ops.iter().any(|p| (p.u - u).abs() < p.w / 2.0 + 1.1) {
                        continue;
                    }
                    if self.r.next() < 0.75 {
                        ops.push(Op { u, w: 1.2, y0: 1.0, y1: (2.2f64).min(h - 0.5) });
                    }
                }
            }
            self.wall(w, bi as i32, ax, az, bx, bz, y, h, th, s, &ops);
        }
        if o.part && wd >= 8.0 && d >= 7.0 {
            if wd > d {
                let px = cx + (self.r.next() - 0.5) * wd * 0.2;
                let u = d * (0.3 + self.r.next() * 0.4);
                self.wall(w, bi as i32, px, z0, px, z1, y, h, 0.15, s, &[Op { u, w: 1.1, y0: 0.0, y1: 2.2 }]);
                w.buildings[bi].part_x = Some(px);
            } else {
                let pz = cz + (self.r.next() - 0.5) * d * 0.2;
                let u = wd * (0.3 + self.r.next() * 0.4);
                self.wall(w, bi as i32, x0, pz, x1, pz, y, h, 0.15, s, &[Op { u, w: 1.1, y0: 0.0, y1: 2.2 }]);
                w.buildings[bi].part_z = Some(pz);
            }
        }
        let nl = match o.loot {
            Some(n) => n,
            None => 2 + (self.r.next() * 2.0).floor() as usize,
        };
        for _ in 0..nl {
            let lx = lerp(x0 + 0.9, x1 - 0.9, self.r.next());
            let lz = lerp(z0 + 0.9, z1 - 0.9, self.r.next());
            let b = &w.buildings[bi];
            if b.part_x.map_or(false, |px| (lx - px).abs() < 0.6) || b.part_z.map_or(false, |pz| (lz - pz).abs() < 0.6) {
                continue;
            }
            w.loot.push(Spawn { x: lx, y, z: lz, tier: o.tier });
        }
        if o.furnish {
            let nf = ((wd * d / 14.0).floor() as usize).max(2);
            let list = o.furn.unwrap_or(DEFAULT_FURN);
            for _ in 0..nf {
                let kind = self.dr.pick(list);
                let side = self.dr.int(0, 3);
                let fx = if side == 0 { x0 + 0.7 } else if side == 1 { x1 - 0.7 } else { lerp(x0 + 1.4, x1 - 1.4, self.dr.next()) };
                let fz = if side == 2 { z0 + 0.7 } else if side == 3 { z1 - 0.7 } else { lerp(z0 + 1.4, z1 - 1.4, self.dr.next()) };
                let center = kind == "rug" || kind == "table";
                let cx2 = if center { lerp(x0 + 2.0, x1 - 2.0, self.dr.next()) } else { fx };
                let cz2 = if center { lerp(z0 + 2.0, z1 - 2.0, self.dr.next()) } else { fz };
                let b = &w.buildings[bi];
                if b.doors.iter().any(|dd| hypot2(dd.x - cx2, dd.z - cz2) < 2.0) {
                    continue;
                }
                if b.part_x.map_or(false, |px| (cx2 - px).abs() < 1.0) || b.part_z.map_or(false, |pz| (cz2 - pz).abs() < 1.0) {
                    continue;
                }
                w.props.push(Prop { kind, x: cx2, y, z: cz2 });
                if kind == "shelf" || kind == "crates" || kind == "bookcase" || kind == "fridge" {
                    let id = w.add_box(cx2 - 0.45, cx2 + 0.45, y, y + if kind == "crates" { 1.0 } else { 1.85 }, cz2 - 0.45, cz2 + 0.45, WOOD, bi as i32);
                    w.boxes[id].prop = true;
                }
                if kind == "counter" {
                    let id = w.add_box(cx2 - 0.4, cx2 + 0.4, y, y + 0.95, cz2 - 0.4, cz2 + 0.4, WOOD, bi as i32);
                    w.boxes[id].prop = true;
                }
            }
        }
        bi
    }
    #[allow(clippy::too_many_arguments)]
    fn solid(&mut self, w: &mut World, cx: f64, cz: f64, wd: f64, d: f64, h: f64, lobby: Option<(Vec<DoorSpec>, Option<usize>)>, tier: u8, poi: &'static str, kind: &'static str, s: u8) -> usize {
        let (x0, x1, z0, z1) = (cx - wd / 2.0, cx + wd / 2.0, cz - d / 2.0, cz + d / 2.0);
        let y = w.terrain_h(cx, cz).min(w.terrain_h(x0, z0)).min(w.terrain_h(x1, z1)).min(w.terrain_h(x0, z1)).min(w.terrain_h(x1, z0)) - 0.3;
        let bi = w.buildings.len();
        w.buildings.push(Building { i: bi, kind, x0, x1, z0, z1, y, h, enter: false, tier, poi, doors: vec![], part_x: None, part_z: None });
        if let Some((doors, loot)) = lobby {
            let lh = 5.2;
            let yy = w.terrain_h(cx, cz).max(0.5) + 0.12;
            w.buildings[bi].y = yy;
            let lb = self.house(w, cx, cz, wd, d, HouseOpts { y: Some(yy), h: lh, th: 0.4, s: CONCRETE, doors, windows: false, part: false, loot: Some(loot.unwrap_or(3)), tier, poi, kind: "lobby", furnish: false, furn: None });
            w.add_box(x0, x1, yy + lh + 0.25, yy + h, z0, z1, s, bi as i32);
            w.props.push(Prop { kind: "desk", x: cx, y: yy, z: cz });
            let id = w.add_box(cx - 1.4, cx + 1.4, yy, yy + 1.1, cz - 0.5, cz + 0.5, WOOD, lb as i32);
            w.boxes[id].prop = true;
        } else {
            w.add_box(x0, x1, y, y + h, z0, z1, s, bi as i32);
        }
        bi
    }
    fn crate_at(&mut self, w: &mut World, x: f64, z: f64, tier: u8, y: Option<f64>) {
        let yy = y.unwrap_or_else(|| w.ground(x, z, 999.0));
        w.crates.push(Spawn { x, y: yy, z, tier });
    }
}

// ---------------------------------------------------------------------------------------------
pub fn build_world(seed: u32) -> World {
    let mut w = World {
        seed,
        h: vec![0.0; N * N],
        s: vec![0; N * N],
        boxes: vec![],
        grid: HashMap::new(),
        buildings: vec![],
        roads: vec![],
        road_hash: HashMap::new(),
        loot: vec![],
        crates: vec![],
        props: vec![],
        fields: vec![],
        trees: 0,
        palms: vec![],
        rocks: 0,
        fences: 0,
        lp_streets: ([0.0; 5], [0.0; 5]),
        range: (-520.0, 440.0),
        stamp: Cell::new(1),
        box_st: vec![],
    };
    let nz = Noise::new(seed);
    let r = Rng::new(seed ^ 0x9e37_79b9);
    let mask = |x: f64, z: f64| -> f64 {
        let mut m: f64 = -1.0;
        for b in BLOBS.iter() {
            let d = hypot2(x - b[0], z - b[1]);
            m = m.max(1.0 - d / b[2]);
        }
        m + (nz.fbm(x * 0.004, z * 0.004, 4) - 0.5) * 0.32
    };
    let bump = |x: f64, z: f64, cx: f64, cz: f64, rad: f64, h: f64| -> f64 {
        let d2 = ((x - cx).powi(2) + (z - cz).powi(2)) / (rad * rad);
        if d2 > 9.0 { 0.0 } else { h * (-d2).exp() }
    };
    let raw = |x: f64, z: f64| -> f64 {
        let m = mask(x, z);
        if m <= 0.0 {
            return -2.0 - 26.0 * smooth(0.0, 0.25, -m) + (nz.vn(x * 0.02, z * 0.02) - 0.5) * 2.0;
        }
        let mut h = -2.0 + 6.0 * smooth(0.0, 0.1, m);
        let inland = smooth(0.06, 0.42, m);
        let hills = nz.ridge(x * 0.0032 + 3.0, z * 0.0032 - 7.0, 4) * 0.55 + nz.fbm(x * 0.006, z * 0.006, 4) * 0.45;
        h += inland * (6.0 + hills.powf(1.6) * 46.0);
        h += bump(x, z, -40.0, 40.0, 170.0, 30.0) * inland;
        h += bump(x, z, 430.0, 205.0, 100.0, 34.0) * inland;
        h += bump(x, z, 120.0, -560.0, 170.0, 24.0) * inland;
        h += bump(x, z, -120.0, -300.0, 90.0, 16.0) * inland;
        h += bump(x, z, 380.0, -470.0, 80.0, 14.0) * inland;
        h
    };
    for j in 0..N {
        for i in 0..N {
            w.h[j * N + i] = raw(i as f64 * CELL - HALF, j as f64 * CELL - HALF) as f32;
        }
    }
    // pads
    let rects: [[f64; 6]; 5] = [
        [290.0, 590.0, 290.0, 560.0, 4.0, 50.0],
        [260.0, 620.0, 575.0, 655.0, 1.2, 40.0],
        [-590.0, -450.0, -230.0, 470.0, 6.0, 60.0],
        [-460.0, -380.0, -150.0, 210.0, 6.0, 45.0],
        [500.0, 700.0, -360.0, -140.0, 3.0, 40.0],
    ];
    let circ_spec: [(f64, f64, f64, Option<f64>, f64); 8] = [
        (-330.0, -430.0, 190.0, Some(9.0), 120.0),
        (-40.0, 40.0, 78.0, None, 40.0),
        (-430.0, 540.0, 62.0, None, 40.0),
        (240.0, -200.0, 62.0, None, 40.0),
        (-190.0, 360.0, 62.0, None, 40.0),
        (-120.0, -300.0, 26.0, None, 24.0),
        (380.0, -470.0, 26.0, None, 24.0),
        (f64::NAN, 0.0, 0.0, None, 0.0),
    ];
    let circs: Vec<[f64; 5]> = circ_spec.iter().filter(|c| !c.0.is_nan()).map(|c| [c.0, c.1, c.2, c.3.unwrap_or_else(|| sample_grid(&w.h, c.0, c.1)), c.4]).collect();
    for j in 0..N {
        for i in 0..N {
            let x = i as f64 * CELL - HALF;
            let z = j as f64 * CELL - HALF;
            let mut h = w.h[j * N + i] as f64;
            for rc in rects.iter() {
                let dx = (rc[0] - x).max(0.0).max(x - rc[1]);
                let dz = (rc[2] - z).max(0.0).max(z - rc[3]);
                let d = hypot2(dx, dz);
                if d < rc[5] {
                    h = lerp(h, rc[4], 1.0 - smooth(0.0, rc[5], d));
                }
            }
            for c in circs.iter() {
                let d = hypot2(x - c[0], z - c[1]);
                if d < c[2] + c[4] {
                    h = lerp(h, c[3], 1.0 - smooth(c[2], c[2] + c[4], d));
                }
            }
            {
                let d = hypot2(x - 120.0, z + 560.0);
                if d < 150.0 {
                    let floor = 6.0;
                    let prof = floor + ((d - 55.0).max(0.0) * 0.55 / 4.5).floor() * 4.5 + (d - 55.0).max(0.0) * 0.08;
                    h = h.min(prof);
                }
            }
            w.h[j * N + i] = h as f32;
        }
    }
    // roads
    let routes: [&[[f64; 2]]; 11] = [
        &[[440.0, 300.0], [470.0, 120.0], [540.0, 0.0], [600.0, -140.0], [610.0, -250.0]],
        &[[340.0, 380.0], [260.0, 200.0], [250.0, 40.0], [240.0, -200.0], [190.0, -380.0], [130.0, -500.0]],
        &[[240.0, -200.0], [120.0, -120.0], [30.0, -30.0], [-40.0, 40.0]],
        &[[-40.0, 40.0], [-110.0, 200.0], [-190.0, 360.0], [-320.0, 470.0], [-430.0, 540.0]],
        &[[-430.0, 540.0], [-470.0, 380.0], [-440.0, 200.0], [-420.0, 60.0]],
        &[[-440.0, -150.0], [-400.0, -300.0], [-330.0, -430.0]],
        &[[-330.0, -430.0], [-200.0, -470.0], [-60.0, -520.0], [60.0, -560.0]],
        &[[-40.0, 40.0], [-200.0, 60.0], [-380.0, 100.0]],
        &[[-190.0, 360.0], [80.0, 380.0], [290.0, 410.0]],
        &[[-120.0, -300.0], [-60.0, -160.0], [30.0, -30.0]],
        &[[380.0, -470.0], [300.0, -330.0], [240.0, -200.0]],
    ];
    for route in routes.iter() {
        let pts = catmull(route, 4.0);
        let mut hs: Vec<f64> = pts.iter().map(|p| sample_grid(&w.h, p[0], p[1]).max(0.6)).collect();
        let n = hs.len();
        for _ in 0..6 {
            hs = (0..n).map(|i| (hs[i.saturating_sub(2)] + hs[i.saturating_sub(1)] + hs[i] + hs[(i + 1).min(n - 1)] + hs[(i + 2).min(n - 1)]) / 5.0).collect();
        }
        w.roads.push(Road { pts: pts.iter().enumerate().map(|(i, p)| [p[0], hs[i], p[1]]).collect(), w: 7.0, city: false });
    }
    for (ri, rd) in w.roads.iter().enumerate() {
        for i in 0..rd.pts.len() - 1 {
            let a = rd.pts[i];
            let key = ((a[0] / 32.0).floor() as i32, (a[2] / 32.0).floor() as i32);
            w.road_hash.entry(key).or_default().push((ri, i));
        }
    }
    for j in 0..N {
        for i in 0..N {
            let x = i as f64 * CELL - HALF;
            let z = j as f64 * CELL - HALF;
            if let Some(q) = w.road_query(x, z, 14.0) {
                let t = 1.0 - smooth(4.5, 13.0, q.d);
                w.h[j * N + i] = lerp(w.h[j * N + i] as f64, q.h - 0.05, t) as f32;
            }
        }
    }
    // surfaces
    for j in 0..N {
        for i in 0..N {
            let x = i as f64 * CELL - HALF;
            let z = j as f64 * CELL - HALF;
            let h = w.h[j * N + i] as f64;
            let sl = slope_at(&w.h, i, j);
            let mut s = GRASS;
            if h < -0.4 {
                s = WATER;
            } else if h < 2.2 {
                s = SAND;
            }
            if s == GRASS && sl > 0.75 {
                s = ROCK;
            }
            if hypot2(x - 120.0, z + 560.0) < 120.0 {
                s = ROCK;
            }
            w.s[j * N + i] = s;
        }
    }
    // content
    let mut b = Builder { r, dr: Rng::new(seed ^ 0xdec0) };
    build_los_pepinos(&mut b, &mut w);
    build_airfield(&mut b, &mut w);
    build_port(&mut b, &mut w);
    build_farm(&mut b, &mut w);
    build_quarry(&mut b, &mut w);
    build_compound(&mut b, &mut w);
    build_hamlet(&mut b, &mut w, poi("saltbrush"), 6);
    build_hamlet(&mut b, &mut w, poi("caraway"), 5);
    build_hamlet(&mut b, &mut w, poi("hollow"), 6);
    build_relay(&mut b, &mut w, poi("relayN"));
    build_relay(&mut b, &mut w, poi("relayE"));
    let road_pts: Vec<[f64; 3]> = w.roads.iter().flat_map(|rd| rd.pts.clone()).collect();
    for p in road_pts {
        let i = js_round((p[0] + HALF) / CELL) as i64;
        let j = js_round((p[2] + HALF) / CELL) as i64;
        for dj in -1..=1 {
            for di in -1..=1 {
                let (ii, jj) = (i + di, j + dj);
                if ii >= 0 && jj >= 0 && ii < N as i64 && jj < N as i64 {
                    let k = jj as usize * N + ii as usize;
                    if w.s[k] != WATER && w.s[k] != CONCRETE {
                        w.s[k] = ROAD;
                    }
                }
            }
        }
    }
    scatter_nature(&mut b.r, &mut w, &nz);
    decorate(&mut w);
    w
}

fn build_los_pepinos(b: &mut Builder, w: &mut World) {
    w.paint(285.0, 595.0, 285.0, 565.0, CONCRETE);
    let ax = [300.0, 360.0, 430.0, 500.0, 580.0];
    let sz = [300.0, 360.0, 420.0, 480.0, 545.0];
    w.lp_streets = (ax, sz);
    for &x in ax.iter() {
        w.roads.push(Road { pts: vec![[x, 4.06, 290.0], [x, 4.06, 560.0]], w: 10.0, city: true });
    }
    for &z in sz.iter() {
        w.roads.push(Road { pts: vec![[290.0, 4.06, z], [590.0, 4.06, z]], w: if z == 545.0 { 14.0 } else { 10.0 }, city: true });
    }
    struct Blk {
        x0: f64,
        x1: f64,
        z0: f64,
        z1: f64,
        a: usize,
        s: usize,
    }
    let mut blocks = vec![];
    for a in 0..ax.len() - 1 {
        for s in 0..sz.len() - 1 {
            blocks.push(Blk { x0: ax[a] + 7.0, x1: ax[a + 1] - 7.0, z0: sz[s] + 7.0, z1: sz[s + 1] - 7.0, a, s });
        }
    }
    for bk in &blocks {
        let id = w.add_box(bk.x0 - 2.0, bk.x1 + 2.0, 3.6, 4.1, bk.z0 - 2.0, bk.z1 + 2.0, CONCRETE, -1);
        w.boxes[id].floor = true;
    }
    for bk in &blocks {
        let cz = (bk.z0 + bk.z1) / 2.0;
        let bw = bk.x1 - bk.x0;
        let bd = bk.z1 - bk.z0;
        let downtown = bk.a >= 1 && bk.a <= 2 && bk.s <= 2;
        if downtown {
            let n = if bw > 50.0 { 2 } else { 1 };
            for k in 0..n {
                let tw = bw / n as f64 - 6.0;
                let tx = bk.x0 + (k as f64 + 0.5) * bw / n as f64;
                let td = (bd - 6.0).min(18.0 + b.r.next() * 14.0);
                let h = 26.0 + b.r.next() * 46.0 + if bk.a == 2 && bk.s == 1 { 30.0 } else { 0.0 };
                b.r.next(); // colour pick
                b.solid(w, tx, cz, tw.min(24.0), td, h, Some((vec![dsh('s', 0.5, 2.4, 3.2), dsh('n', 0.5, 2.4, 3.2)], None)), 3, "lp", "tower", CONCRETE);
            }
        } else {
            let nx = ((bw / 16.0).floor() as usize).max(1);
            let nzn = ((bd / 16.0).floor() as usize).max(1);
            for i in 0..nx {
                for j in 0..nzn {
                    if b.r.next() < 0.2 {
                        continue;
                    }
                    let sx = bk.x0 + (i as f64 + 0.5) * bw / nx as f64;
                    let szz = bk.z0 + (j as f64 + 0.5) * bd / nzn as f64;
                    let wd = bw / nx as f64 - 3.5;
                    let d = bd / nzn as f64 - 3.5;
                    if b.r.next() < 0.25 {
                        let h = 8.0 + b.r.next() * 10.0;
                        b.r.next(); // colour
                        b.solid(w, sx, szz, wd, d, h, None, 3, "lp", "block", CONCRETE);
                        continue;
                    }
                    let side = if j == 0 { 'n' } else { 's' };
                    b.r.next(); // colour
                    b.house(w, sx, szz, wd, d, HouseOpts { h: 4.2, doors: vec![ds(side, 0.5, 1.8), ds(if i == 0 { 'w' } else { 'e' }, 0.5, 1.3)], tier: 3, poi: "lp", kind: "shop", furn: Some(&["shelf", "table", "crates", "counter"]), ..Default::default() });
                }
            }
        }
    }
    let mut x = 296.0;
    while x <= 584.0 {
        w.palms.push([x, 556.0]);
        x += 12.0;
    }
    let mut z = 296.0;
    while z <= 540.0 {
        w.palms.push([425.0, z]);
        w.palms.push([435.0, z]);
        z += 14.0;
    }
    let (pz0, pz1, px, py) = (552.0, 760.0, 430.0, 3.3);
    w.add_box(px - 7.0, px + 7.0, py - 0.5, py, pz0, pz1, WOOD, -1);
    w.add_box(px - 22.0, px + 22.0, py - 0.5, py, 680.0, 740.0, WOOD, -1);
    for sx in [-7.0, 7.0] {
        w.add_box(px + sx - 0.08, px + sx + 0.08, py, py + 1.0, pz0 + 6.0, 680.0, WOOD, -1);
    }
    w.add_box(px + 8.0 - 2.0, px + 8.0 + 2.0, py, py + 20.0, 710.0, 714.0, METAL, -1);
    b.house(w, px - 13.0, 700.0, 8.0, 8.0, HouseOpts { y: Some(py + 0.12), h: 3.2, s: WOOD, tier: 3, poi: "lp", kind: "kiosk", doors: vec![ds('e', 0.5, 1.6)], ..Default::default() });
    b.crate_at(w, px - 15.0, 726.0, 3, Some(py));
    b.crate_at(w, px + 18.0, 690.0, 3, Some(py));
    for _ in 0..7 {
        let a = b.r.pick(&ax);
        let z = b.r.range(310.0, 540.0);
        let off = b.r.pick(&[-3.5, 3.5]);
        b.crate_at(w, a + off, z, 3, None);
    }
    for _ in 0..20 {
        let x = b.r.range(300.0, 580.0);
        let z = b.r.range(300.0, 545.0);
        if w.overlaps_building(x, z, 1.0) {
            continue;
        }
        let y = w.ground(x, z, 999.0);
        w.loot.push(Spawn { x, y, z, tier: 3 });
    }
    for _ in 0..26 {
        let vert = b.r.next() < 0.5;
        let a = if vert { b.r.pick(&ax) + b.r.pick(&[-3.6, 3.6]) } else { b.r.range(305.0, 585.0) };
        let bb = if vert { b.r.range(305.0, 540.0) } else { b.r.pick(&sz) + b.r.pick(&[-3.6, 3.6]) };
        b.r.next(); // colour
        let (hx, hz) = if vert { (1.0, 2.2) } else { (2.2, 1.0) };
        w.add_box(a - hx, a + hx, 4.0, 5.4, bb - hz, bb + hz, METAL, -1);
    }
}

fn build_airfield(b: &mut Builder, w: &mut World) {
    w.paint(-560.0, -480.0, -220.0, 460.0, ROAD);
    w.paint(-480.0, -385.0, 50.0, 210.0, CONCRETE);
    for k in 0..3 {
        let cz = 75.0 + k as f64 * 48.0;
        b.house(w, -425.0, cz, 30.0, 36.0, HouseOpts { h: 9.0, th: 0.4, s: METAL, doors: vec![dsh('w', 0.5, 22.0, 7.5), ds('e', 0.5, 1.6)], windows: false, part: false, loot: Some(4), tier: 2, poi: "airfield", kind: "hangar", furn: Some(&["crates", "shelf"]), ..Default::default() });
    }
    b.solid(w, -430.0, 20.0, 9.0, 9.0, 22.0, Some((vec![dsh('w', 0.5, 2.0, 3.0)], Some(3))), 2, "airfield", "ctower", CONCRETE);
    b.house(w, -430.0, -40.0, 14.0, 10.0, HouseOpts { h: 3.4, doors: vec![ds('w', 0.5, 1.4), ds('e', 0.3, 1.4)], tier: 2, poi: "airfield", kind: "office", ..Default::default() });
    b.house(w, -430.0, -80.0, 12.0, 10.0, HouseOpts { h: 3.4, doors: vec![ds('w', 0.5, 1.4)], tier: 2, poi: "airfield", kind: "office", ..Default::default() });
    for k in 0..3 {
        let x = -405.0 + k as f64 * 9.0;
        let z = -130.0;
        let y = w.terrain_h(x, z);
        w.props.push(Prop { kind: "tank", x, y, z });
        w.add_box(x - 3.0, x + 3.0, y, y + 6.0, z - 3.0, z + 3.0, METAL, -1);
    }
    w.add_box(-494.0, -486.0, 6.0, 11.0, -138.0, -100.0, METAL, -1);
    for k in 0..3 {
        b.crate_at(w, -455.0 + k as f64 * 3.0, 50.0 + k as f64 * 40.0, 2, None);
    }
    w.range = (-520.0, 440.0);
    w.add_box(-545.0, -495.0, 6.0, 7.1, 437.4, 438.0, CONCRETE, -1);
}

fn build_port(b: &mut Builder, w: &mut World) {
    w.paint(500.0, 700.0, -360.0, -140.0, CONCRETE);
    for i in 0..6 {
        for j in 0..4 {
            let x = 530.0 + i as f64 * 22.0;
            let z = -330.0 + j as f64 * 28.0;
            if b.r.next() < 0.18 {
                continue;
            }
            let st = 1 + (b.r.next() * 3.0).floor() as usize;
            for k in 0..st {
                let y = 3.0 + k as f64 * 2.6;
                let rot = (i + j) % 3 == 0;
                let (wd, d) = if rot { (2.5, 12.2) } else { (12.2, 2.5) };
                b.r.next(); // colour
                w.add_box(x - wd / 2.0, x + wd / 2.0, y, y + 2.6, z - d / 2.0, z + d / 2.0, METAL, -1);
                if k == 0 && b.r.next() < 0.35 {
                    w.loot.push(Spawn { x: x + if rot { 2.2 } else { 0.0 }, y: 3.0, z: z + if rot { 0.0 } else { 2.2 }, tier: 2 });
                }
            }
        }
    }
    b.house(w, 560.0, -170.0, 34.0, 22.0, HouseOpts { h: 8.0, s: METAL, doors: vec![dsh('s', 0.5, 8.0, 5.5), ds('n', 0.25, 1.5)], windows: false, part: false, loot: Some(5), tier: 2, poi: "port", kind: "warehouse", furn: Some(&["crates", "shelf", "crates"]), ..Default::default() });
    b.house(w, 640.0, -170.0, 28.0, 20.0, HouseOpts { h: 8.0, s: METAL, doors: vec![dsh('s', 0.5, 7.0, 5.5), ds('w', 0.5, 1.5)], windows: false, part: false, loot: Some(4), tier: 2, poi: "port", kind: "warehouse", furn: Some(&["crates", "shelf"]), ..Default::default() });
    b.house(w, 520.0, -200.0, 10.0, 8.0, HouseOpts { h: 3.2, doors: vec![ds('e', 0.5, 1.3)], tier: 2, poi: "port", kind: "office", ..Default::default() });
    for (cx, cz) in [(695.0, -300.0), (695.0, -230.0)] {
        w.add_box(cx - 6.0, cx - 4.5, 3.0, 34.0, cz - 6.0, cz - 4.5, METAL, -1);
        w.add_box(cx - 6.0, cx - 4.5, 3.0, 34.0, cz + 4.5, cz + 6.0, METAL, -1);
        w.add_box(cx + 4.5, cx + 6.0, 3.0, 34.0, cz - 6.0, cz - 4.5, METAL, -1);
        w.add_box(cx + 4.5, cx + 6.0, 3.0, 34.0, cz + 4.5, cz + 6.0, METAL, -1);
    }
    for _ in 0..3 {
        let x = b.r.range(520.0, 680.0);
        let z = b.r.range(-350.0, -240.0);
        b.crate_at(w, x, z, 2, None);
    }
}

fn build_farm(b: &mut Builder, w: &mut World) {
    let p = poi("farm");
    for k in 0..7 {
        let a = k as f64 / 7.0 * std::f64::consts::PI * 2.0 + 0.3;
        let d = 95.0 + b.r.next() * 40.0;
        let x = p.x + a.cos() * d;
        let z = p.z + a.sin() * d;
        let wd = 50.0 + b.r.next() * 30.0;
        let dd = 40.0 + b.r.next() * 30.0;
        w.fields.push([x - wd / 2.0, x + wd / 2.0, z - dd / 2.0, z + dd / 2.0]);
        w.paint(x - wd / 2.0, x + wd / 2.0, z - dd / 2.0, z + dd / 2.0, FARM);
    }
    b.house(w, p.x - 20.0, p.z - 10.0, 16.0, 22.0, HouseOpts { h: 7.0, s: WOOD, doors: vec![dsh('s', 0.5, 4.2, 4.5), dsh('n', 0.5, 4.2, 4.5)], windows: false, part: false, loot: Some(4), tier: 1, poi: "farm", kind: "barn", furn: Some(&["crates", "hay"]), ..Default::default() });
    b.house(w, p.x + 30.0, p.z + 18.0, 14.0, 18.0, HouseOpts { h: 6.5, s: WOOD, doors: vec![dsh('w', 0.5, 4.0, 4.5)], windows: false, part: false, loot: Some(3), tier: 1, poi: "farm", kind: "barn", furn: Some(&["crates", "hay"]), ..Default::default() });
    b.house(w, p.x + 18.0, p.z - 36.0, 11.0, 9.0, HouseOpts { h: 3.2, doors: vec![ds('s', 0.4, 1.3), ds('e', 0.5, 1.2)], tier: 1, poi: "farm", kind: "house", ..Default::default() });
    b.house(w, p.x - 50.0, p.z + 30.0, 9.0, 8.0, HouseOpts { h: 3.0, doors: vec![ds('n', 0.5, 1.3)], tier: 1, poi: "farm", kind: "house", ..Default::default() });
    for k in 0..2 {
        let x = p.x - 2.0 + k as f64 * 7.0;
        let z = p.z - 30.0;
        let y = w.terrain_h(x, z);
        w.props.push(Prop { kind: "silo", x, y, z });
        w.add_box(x - 2.6, x + 2.6, y, y + 14.0, z - 2.6, z + 2.6, METAL, -1);
    }
    for _ in 0..14 {
        let x = p.x + b.r.range(-70.0, 70.0);
        let z = p.z + b.r.range(-60.0, 60.0);
        if w.overlaps_building(x, z, 3.0) {
            continue;
        }
        let y = w.terrain_h(x, z);
        b.r.next(); // rot
        w.props.push(Prop { kind: "hay", x, y, z });
        let id = w.add_box(x - 0.8, x + 0.8, y, y + 1.4, z - 0.8, z + 0.8, WOOD, -1);
        w.boxes[id].prop = true;
    }
    b.crate_at(w, p.x - 20.0, p.z + 4.0, 1, None);
    b.crate_at(w, p.x + 40.0, p.z - 10.0, 1, None);
    for _ in 0..8 {
        let x = p.x + b.r.range(-90.0, 90.0);
        let z = p.z + b.r.range(-90.0, 90.0);
        let y = w.terrain_h(x, z);
        w.loot.push(Spawn { x, y, z, tier: 1 });
    }
}

fn build_quarry(b: &mut Builder, w: &mut World) {
    let (qx, qz) = (120.0, -560.0);
    b.house(w, qx - 30.0, qz + 20.0, 12.0, 8.0, HouseOpts { h: 3.4, s: METAL, doors: vec![ds('n', 0.5, 1.4)], tier: 2, poi: "quarry", kind: "shed", ..Default::default() });
    b.house(w, qx + 26.0, qz - 18.0, 10.0, 8.0, HouseOpts { h: 3.4, s: METAL, doors: vec![ds('w', 0.5, 1.4)], tier: 2, poi: "quarry", kind: "shed", ..Default::default() });
    b.solid(w, qx + 8.0, qz + 30.0, 10.0, 16.0, 9.0, None, 2, "quarry", "crusher", METAL);
    for _ in 0..4 {
        let x = qx + b.r.range(-40.0, 40.0);
        let z = qz + b.r.range(-40.0, 40.0);
        let y = w.terrain_h(x, z);
        b.r.next(); // rot
        w.props.push(Prop { kind: "truck", x, y, z });
        w.add_box(x - 2.0, x + 2.0, y, y + 3.0, z - 2.0, z + 2.0, METAL, -1);
    }
    for _ in 0..6 {
        let x = qx + b.r.range(-45.0, 45.0);
        let z = qz + b.r.range(-45.0, 45.0);
        let y = w.ground(x, z, 999.0);
        w.loot.push(Spawn { x, y, z, tier: 2 });
    }
    b.crate_at(w, qx, qz, 2, None);
    b.crate_at(w, qx - 18.0, qz - 22.0, 2, None);
}

fn build_compound(b: &mut Builder, w: &mut World) {
    let p = poi("compound");
    let y = w.terrain_h(p.x, p.z);
    w.paint(p.x - 70.0, p.x + 70.0, p.z - 70.0, p.z + 70.0, CONCRETE);
    let rr = 62.0;
    let wh = 3.2;
    let wy = y - 0.4;
    let gate = |u: f64| [Op { u, w: 8.0, y0: 0.0, y1: 99.0 }];
    b.wall(w, -1, p.x - rr, p.z - rr, p.x + rr, p.z - rr, wy, wh, 0.6, CONCRETE, &gate(rr));
    b.wall(w, -1, p.x - rr, p.z + rr, p.x + rr, p.z + rr, wy, wh, 0.6, CONCRETE, &gate(rr * 0.6));
    b.wall(w, -1, p.x - rr, p.z - rr, p.x - rr, p.z + rr, wy, wh, 0.6, CONCRETE, &gate(rr));
    b.wall(w, -1, p.x + rr, p.z - rr, p.x + rr, p.z + rr, wy, wh, 0.6, CONCRETE, &gate(rr * 1.3));
    b.house(w, p.x, p.z - 18.0, 22.0, 14.0, HouseOpts { h: 4.0, th: 0.4, doors: vec![ds('s', 0.5, 1.6), ds('n', 0.3, 1.4), ds('e', 0.5, 1.4)], tier: 4, poi: "compound", kind: "hq", loot: Some(5), ..Default::default() });
    b.house(w, p.x - 34.0, p.z + 20.0, 12.0, 18.0, HouseOpts { h: 3.4, doors: vec![ds('e', 0.3, 1.4), ds('e', 0.75, 1.4)], tier: 4, poi: "compound", kind: "barracks", ..Default::default() });
    b.house(w, p.x + 32.0, p.z + 22.0, 12.0, 16.0, HouseOpts { h: 3.4, doors: vec![ds('w', 0.5, 1.4), ds('s', 0.5, 1.4)], tier: 4, poi: "compound", kind: "armory", ..Default::default() });
    b.house(w, p.x + 2.0, p.z + 34.0, 10.0, 8.0, HouseOpts { h: 3.0, doors: vec![ds('n', 0.5, 1.4)], tier: 4, poi: "compound", kind: "store", ..Default::default() });
    for (dx, dz) in [(-rr + 4.0, -rr + 4.0), (rr - 4.0, rr - 4.0)] {
        let x = p.x + dx;
        let z = p.z + dz;
        let ty = w.terrain_h(x, z);
        w.add_box(x - 2.0, x + 2.0, ty + 7.0, ty + 7.3, z - 2.0, z + 2.0, WOOD, -1);
        for (a, bb) in [(-1.8, -1.8), (1.8, -1.8), (-1.8, 1.8), (1.8, 1.8)] {
            w.add_box(x + a - 0.15, x + a + 0.15, ty, ty + 7.0, z + bb - 0.15, z + bb + 0.15, WOOD, -1);
        }
    }
    for k in 0..5 {
        let a = k as f64 / 5.0 * 6.28;
        b.crate_at(w, p.x + a.cos() * 46.0, p.z + a.sin() * 46.0, 4, None);
    }
    for _ in 0..10 {
        let x = p.x + b.r.range(-55.0, 55.0);
        let z = p.z + b.r.range(-55.0, 55.0);
        if w.overlaps_building(x, z, 1.0) {
            continue;
        }
        let y = w.ground(x, z, 999.0);
        w.loot.push(Spawn { x, y, z, tier: 4 });
    }
    for _ in 0..8 {
        let x = p.x + b.r.range(-50.0, 50.0);
        let z = p.z + b.r.range(-50.0, 50.0);
        if w.overlaps_building(x, z, 3.0) {
            continue;
        }
        let yy = w.terrain_h(x, z);
        let rot = b.r.next() < 0.5;
        w.props.push(Prop { kind: "sandbags", x, y: yy, z });
        let (hx, hz) = if rot { (0.5, 2.0) } else { (2.0, 0.5) };
        let id = w.add_box(x - hx, x + hx, yy, yy + 1.1, z - hz, z + hz, DIRT, -1);
        w.boxes[id].prop = true;
    }
}

fn build_hamlet(b: &mut Builder, w: &mut World, p: Poi, n: usize) {
    let sides = ['n', 's', 'e', 'w'];
    for k in 0..n {
        let a = k as f64 / n as f64 * std::f64::consts::PI * 2.0 + b.r.next() * 0.5;
        let d = 18.0 + b.r.next() * 26.0;
        let x = p.x + a.cos() * d;
        let z = p.z + a.sin() * d;
        let wd = 8.0 + b.r.next() * 4.0;
        let dd = 7.0 + b.r.next() * 3.0;
        let rot = b.r.next() < 0.5;
        let d1 = b.r.pick(&sides);
        let others: Vec<char> = sides.iter().copied().filter(|&s| s != d1).collect();
        let d2 = b.r.pick(&others);
        b.r.next(); // style
        b.r.next(); // colour
        b.house(w, x, z, if rot { dd } else { wd }, if rot { wd } else { dd }, HouseOpts { h: 3.1, doors: vec![ds(d1, 0.5, 1.3), ds(d2, 0.4, 1.2)], tier: 1, poi: p.id, kind: "house", ..Default::default() });
    }
    b.crate_at(w, p.x, p.z, 1, None);
    for _ in 0..4 {
        let x = p.x + b.r.range(-40.0, 40.0);
        let z = p.z + b.r.range(-40.0, 40.0);
        if w.overlaps_building(x, z, 1.0) {
            continue;
        }
        let y = w.terrain_h(x, z);
        w.loot.push(Spawn { x, y, z, tier: 1 });
    }
}

fn build_relay(b: &mut Builder, w: &mut World, p: Poi) {
    let y = w.terrain_h(p.x, p.z);
    let id = w.add_box(p.x - 2.5, p.x + 2.5, y, y + 48.0, p.z - 2.5, p.z + 2.5, METAL, -1);
    w.boxes[id].noray = true;
    b.house(w, p.x + 9.0, p.z, 6.0, 5.0, HouseOpts { h: 2.8, s: CONCRETE, doors: vec![ds('w', 0.5, 1.2)], part: false, tier: 2, poi: p.id, kind: "hut", loot: Some(2), ..Default::default() });
    b.crate_at(w, p.x - 6.0, p.z + 5.0, 2, None);
}

fn scatter_nature(r: &mut Rng, w: &mut World, nz: &Noise) {
    let in_poi = |x: f64, z: f64| POIS.iter().any(|p| hypot2(x - p.x, z - p.z) < p.r * 0.7);
    let mut tries = 0;
    while w.trees < 2600 {
        tries += 1;
        if tries > 30000 {
            break;
        }
        let x = r.range(-950.0, 950.0);
        let z = r.range(-950.0, 950.0);
        let s = w.surface_at(x, z);
        if s != GRASS {
            continue;
        }
        let forest = nz.fbm(x * 0.006 + 40.0, z * 0.006 - 11.0, 3);
        if forest < 0.5 && r.next() > 0.12 {
            continue;
        }
        if in_poi(x, z) || w.overlaps_building(x, z, 6.0) || w.fields.iter().any(|f| x > f[0] && x < f[1] && z > f[2] && z < f[3]) || w.road_query(x, z, 7.0).is_some() {
            continue;
        }
        let y = w.terrain_h(x, z);
        if y < 2.5 {
            continue;
        }
        if !(y > 26.0 || forest > 0.62) {
            r.next();
        }
        let sc = 0.8 + r.next() * 0.6;
        r.next(); // rot
        w.trees += 1;
        w.add_box(x - 0.35 * sc, x + 0.35 * sc, y, y + 5.0 * sc, z - 0.35 * sc, z + 0.35 * sc, WOOD, -1);
    }
    tries = 0;
    while w.palms.len() < 260 {
        tries += 1;
        if tries > 20000 {
            break;
        }
        let x = r.range(-900.0, 900.0);
        let z = r.range(-900.0, 900.0);
        let h = w.terrain_h(x, z);
        if h < 1.2 || h > 4.0 || w.surface_at(x, z) != SAND {
            continue;
        }
        if w.overlaps_building(x, z, 4.0) {
            continue;
        }
        w.palms.push([x, z]);
    }
    let palms = w.palms.clone();
    for p in palms {
        let y = w.terrain_h(p[0], p[1]);
        w.add_box(p[0] - 0.25, p[0] + 0.25, y, y + 6.0, p[1] - 0.25, p[1] + 0.25, WOOD, -1);
    }
    tries = 0;
    while w.rocks < 520 {
        tries += 1;
        if tries > 20000 {
            break;
        }
        let x = r.range(-950.0, 950.0);
        let z = r.range(-950.0, 950.0);
        let s = w.surface_at(x, z);
        let y = w.terrain_h(x, z);
        if s == WATER || s == ROAD || s == CONCRETE || s == FARM || y < 0.5 || w.overlaps_building(x, z, 4.0) {
            continue;
        }
        if s != ROCK && r.next() > 0.35 {
            continue;
        }
        let sc = 0.6 + r.next() * if s == ROCK { 3.2 } else { 1.6 };
        r.next(); // rot
        w.rocks += 1;
        if sc > 1.1 {
            w.add_box(x - sc * 0.8, x + sc * 0.8, y - 1.0, y + sc * 1.1, z - sc * 0.8, z + sc * 0.8, ROCK, -1);
        }
    }
}

fn decorate(w: &mut World) {
    let mut r = Rng::new(w.seed ^ 0x5ea1);
    let fence_pois = ["saltbrush", "caraway", "hollow", "farm"];
    for i in 0..w.buildings.len() {
        let b = &w.buildings[i];
        if !(b.kind == "house" && fence_pois.contains(&b.poi)) {
            continue;
        }
        if r.next() < 0.25 {
            continue;
        }
        r.next(); // margin
        r.next(); // fence kind
        w.fences += 1;
    }
    let sites: [(&str, i32, f64); 6] = [("port", 18, 140.0), ("farm", 8, 70.0), ("quarry", 8, 60.0), ("airfield", 10, 90.0), ("compound", 6, 55.0), ("lp", 10, 140.0)];
    for (id, n, rad) in sites {
        let p = poi(id);
        let mut left = n;
        let mut k = 0;
        while k < n * 3 && n > 0 {
            k += 1;
            let x = p.x + (r.next() - 0.5) * rad * 1.6;
            let z = p.z + (r.next() - 0.5) * rad * 1.6;
            if w.overlaps_building(x, z, 2.0) || w.road_query(x, z, 6.0).is_some() || w.terrain_h(x, z) < 1.0 {
                continue;
            }
            let y = w.ground(x, z, 999.0);
            let barrels = r.next() < 0.55;
            r.next(); // rot
            w.props.push(Prop { kind: if barrels { "barrels" } else { "pallet" }, x, y, z });
            if barrels {
                let bid = w.add_box(x - 0.75, x + 0.75, y, y + 1.0, z - 0.75, z + 0.75, METAL, -1);
                w.boxes[bid].prop = true;
            }
            left -= 1;
            if left <= 0 {
                break;
            }
        }
    }
    let (ax, sz) = w.lp_streets;
    for _ in 0..14 {
        let x = r.pick(&ax) + r.pick(&[-8.5, 8.5]);
        let z = r.pick(&sz) + r.pick(&[-12.0, 12.0]);
        if w.overlaps_building(x, z, 0.3) {
            continue;
        }
        let y = w.ground(x, z, 999.0);
        w.props.push(Prop { kind: "dumpster", x, y, z });
        let bid = w.add_box(x - 0.9, x + 0.9, y, y + 1.3, z - 0.6, z + 0.6, METAL, -1);
        w.boxes[bid].prop = true;
    }
}

pub fn poi_at(x: f64, z: f64) -> Option<Poi> {
    let mut best = None;
    let mut bd = 1e9;
    for p in POIS.iter() {
        let d = hypot2(x - p.x, z - p.z);
        if d < p.r + 40.0 && d < bd {
            bd = d;
            best = Some(*p);
        }
    }
    best
}
