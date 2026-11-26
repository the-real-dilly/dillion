//! Compares the Rust world/match generation against reference values exported from the JS
//! version (tools/export_golden.mjs). Heights/ray distances within a small epsilon.
use last_zone_server::sim::Match;
use last_zone_server::world::{build_world, N};
use serde_json::Value;

fn load(seed: u32) -> Value {
    let p = format!("{}/tests/golden/world_{}.json", env!("CARGO_MANIFEST_DIR"), seed);
    serde_json::from_str(&std::fs::read_to_string(p).expect("golden file")).unwrap()
}
fn f(v: &Value) -> f64 {
    v.as_f64().unwrap()
}

fn check_seed(seed: u32) {
    let g = load(seed);
    let w = build_world(seed);
    let c = &g["counts"];
    assert_eq!(w.boxes.len() as u64, c["boxes"].as_u64().unwrap(), "boxes");
    assert_eq!(w.buildings.len() as u64, c["buildings"].as_u64().unwrap(), "buildings");
    assert_eq!(w.loot.len() as u64, c["loot"].as_u64().unwrap(), "loot");
    assert_eq!(w.crates.len() as u64, c["crates"].as_u64().unwrap(), "crates");
    assert_eq!(w.trees as u64, c["trees"].as_u64().unwrap(), "trees");
    assert_eq!(w.palms.len() as u64, c["palms"].as_u64().unwrap(), "palms");
    assert_eq!(w.rocks as u64, c["rocks"].as_u64().unwrap(), "rocks");
    assert_eq!(w.fences as u64, c["fences"].as_u64().unwrap(), "fences");
    // heightfield + surfaces
    let hs = g["heights"].as_array().unwrap();
    let ss = g["surfs"].as_array().unwrap();
    let mut k = 0;
    let mut surf_bad = 0;
    for j in (0..N).step_by(7) {
        for i in (0..N).step_by(7) {
            let h = w.h[j * N + i] as f64;
            assert!((h - f(&hs[k])).abs() < 1e-3, "height {} {}: {} vs {}", i, j, h, f(&hs[k]));
            if w.s[j * N + i] as u64 != ss[k].as_u64().unwrap() {
                surf_bad += 1;
            }
            k += 1;
        }
    }
    assert!(surf_bad <= 2, "surface mismatches {}", surf_bad);
    // boxes
    let mut bsum = 0.0;
    for (i, b) in w.boxes.iter().enumerate() {
        bsum += (b.x0 + b.x1 * 2.0 + b.y0 * 3.0 + b.y1 * 5.0 + b.z0 * 7.0 + b.z1 * 11.0) * ((i % 13) + 1) as f64;
    }
    let jsum = f(&g["bsum"]);
    assert!((bsum - jsum).abs() < 1e-3 * jsum.abs().max(1.0), "box checksum {} vs {}", bsum, jsum);
    for (n, jb) in g["boxes"].as_array().unwrap().iter().enumerate() {
        let b = &w.boxes[n * 37];
        let a = jb.as_array().unwrap();
        for (q, v) in [b.x0, b.x1, b.y0, b.y1, b.z0, b.z1].iter().enumerate() {
            assert!((v - f(&a[q])).abs() < 1e-3, "box {} field {}: {} vs {}", n * 37, q, v, f(&a[q]));
        }
        assert_eq!(b.s as u64, a[6].as_u64().unwrap());
    }
    // rays and ground queries
    let mut ray_bad = 0;
    for r in g["rays"].as_array().unwrap() {
        let a: Vec<f64> = r.as_array().unwrap().iter().map(f).collect();
        let h = w.raycast(a[0], a[1], a[2], a[3], a[4], a[5], if a[4] == 0.0 { 120.0 } else { 600.0 });
        let t = h.map(|h| h.t).unwrap_or(-1.0);
        if (t - a[6]).abs() > 1e-3 {
            ray_bad += 1;
        }
    }
    assert!(ray_bad == 0, "ray mismatches {}", ray_bad);
    for gq in g["grounds"].as_array().unwrap() {
        let a: Vec<f64> = gq.as_array().unwrap().iter().map(f).collect();
        let y = w.ground(a[0], a[1], a[2]);
        assert!((y - a[3]).abs() < 1e-3, "ground at {} {}: {} vs {}", a[0], a[1], y, a[3]);
        assert_eq!(w.surface_at(a[0], a[1]) as f64, a[4], "surface at {} {}", a[0], a[1]);
    }
    // loot spawns and crates
    for (n, l) in g["loot"].as_array().unwrap().iter().enumerate() {
        let a: Vec<f64> = l.as_array().unwrap().iter().map(f).collect();
        let s = &w.loot[n];
        assert!((s.x - a[0]).abs() < 1e-6 && (s.y - a[1]).abs() < 1e-3 && (s.z - a[2]).abs() < 1e-6 && s.tier as f64 == a[3], "loot {}", n);
    }
    for (n, l) in g["crates"].as_array().unwrap().iter().enumerate() {
        let a: Vec<f64> = l.as_array().unwrap().iter().map(f).collect();
        let s = &w.crates[n];
        assert!((s.x - a[0]).abs() < 1e-6 && (s.y - a[1]).abs() < 1e-3 && (s.z - a[2]).abs() < 1e-6, "crate {}", n);
    }
    // match generation: items, plane, first circle, pickle crate
    for mj in g["matches"].as_array().unwrap() {
        let ms = mj["seed"].as_u64().unwrap() as u32;
        let m = Match::new(w.clone(), ms, true);
        let items = mj["items"].as_array().unwrap();
        assert_eq!(m.items.len(), items.len(), "item count");
        for (it, ji) in m.items.iter().zip(items) {
            let a = ji.as_array().unwrap();
            assert_eq!(it.id as u64, a[0].as_u64().unwrap());
            assert_eq!(last_zone_server::data::ITEM_KEYS[it.k as usize], a[1].as_str().unwrap());
            assert!((it.x - f(&a[5])).abs() < 1e-6 && (it.z - f(&a[6])).abs() < 1e-6);
        }
        let pl = m.plane.as_ref().unwrap();
        let jp: Vec<f64> = mj["plane"].as_array().unwrap().iter().map(f).collect();
        assert!((pl.ax - jp[0]).abs() < 1e-6 && (pl.az - jp[1]).abs() < 1e-6, "plane");
        let gs = m.gas.as_ref().unwrap();
        let jg: Vec<f64> = mj["gas"].as_array().unwrap().iter().map(f).collect();
        assert!((gs.nx - jg[0]).abs() < 1e-6 && (gs.nz - jg[1]).abs() < 1e-6 && gs.nr == jg[2], "gas");
        assert_eq!(m.crates.iter().position(|c| c.pickle).unwrap() as i64, mj["pickle"].as_i64().unwrap());
    }
}

#[test]
fn golden_map_seed() {
    check_seed(last_zone_server::world::MAP_SEED);
}
#[test]
fn golden_seed_7() {
    check_seed(7);
}
#[test]
fn golden_seed_424242() {
    check_seed(424242);
}
