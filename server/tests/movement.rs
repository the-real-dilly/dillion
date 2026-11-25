//! Cross-check: replay input traces recorded from the JS sim (tools/export_movement.mjs) through
//! the Rust sim and compare positions. The browser predicts its own movement with the JS code, so
//! these must agree for client-side prediction to need no corrections.
use last_zone_server::sim::{Match, St, DT};
use last_zone_server::world::build_world;
use serde_json::Value;

#[test]
fn movement_matches_js() {
    let p = format!("{}/tests/golden/movement.json", env!("CARGO_MANIFEST_DIR"));
    let traces: Value = serde_json::from_str(&std::fs::read_to_string(p).unwrap()).unwrap();
    let world = build_world(last_zone_server::world::MAP_SEED);
    for tr in traces.as_array().unwrap() {
        let name = tr["name"].as_str().unwrap();
        let mut m = Match::new(world.clone(), tr["seed"].as_u64().unwrap() as u32, true);
        let pi = m.add_player("Dilly", false, true);
        if let Some(s) = tr["start"].as_array() {
            let pl = &mut m.players[pi];
            pl.st = St::Ground;
            pl.x = s[0].as_f64().unwrap();
            pl.y = s[1].as_f64().unwrap();
            pl.z = s[2].as_f64().unwrap();
            pl.on_ground = true;
        }
        let mut worst: f64 = 0.0;
        let mut n = 0;
        for (k, fr) in tr["frames"].as_array().unwrap().iter().enumerate() {
            let a: Vec<f64> = fr.as_array().unwrap().iter().map(|v| v.as_f64().unwrap()).collect();
            {
                let inp = &mut m.players[pi].inp;
                inp.mx = a[0];
                inp.mz = a[1];
                inp.yaw = a[2];
                inp.pitch = a[3];
                inp.jump = a[4] != 0.0;
                inp.sprint = a[5] != 0.0;
                inp.crouch = a[6] != 0.0;
            }
            m.step(DT);
            if a.len() > 7 {
                let p = &m.players[pi];
                let err = ((p.x - a[7]).powi(2) + (p.y - a[8]).powi(2) + (p.z - a[9]).powi(2)).sqrt();
                worst = worst.max(err);
                assert_eq!(p.st as u8 as f64, a[10], "{} frame {}: state", name, k);
                assert!(err < 0.01, "{} frame {}: rust ({:.4},{:.4},{:.4}) vs js ({:.4},{:.4},{:.4})", name, k, p.x, p.y, p.z, a[7], a[8], a[9]);
                n += 1;
            }
        }
        println!("{}: {} checkpoints, worst error {:.2e} m", name, n, worst);
    }
}
